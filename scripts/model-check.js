// Owner check for the local model (docs/local-ai/OWNER-CHECKLIST.md; docs/gdd/15-qa-tooling.md §8): is the model in config.json ready to play
// this game? One command, about a minute. It never runs in CI. It asks the server what it serves, checks the routing, then puts one small
// question of every kind the game asks to the model — through the game's own call, schema, checks and fallback — and reports what came
// back: answered first time, needed a retry, or fell back to the engine, and how long it took.
//
//   node scripts/model-check.js                       # config.json
//   WC_CONFIG=C:/path/live.json node scripts/model-check.js
//   node scripts/model-check.js --only interpret,mind,narrate   # some kinds; --repeat 3 asks each three times
//
// Exit code 1 if the server cannot be reached, the routing is refused, or any call fell back.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]] : a), []));
process.env.WC_SAVES = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-modelcheck-'));
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const { loadConfig, listModels } = await imp('server/llm.js');
const cfg = loadConfig();
const { routeFor, routingProblems, CALL_DEFAULTS } = await imp('server/ai/models.js');
const { CALLS, runCall } = await imp('server/ai/client.js');
const { createInitialState } = await imp('public/js/shared/world.js');
const { modeOf } = await imp('server/ai/calls/narrate.js');

const say = (s = '') => console.log(s);
let bad = 0; const fail = (s) => { bad++; say(`  ✗ ${s}`); }; const ok = (s) => say(`  ✓ ${s}`);
say(`The model: ${cfg.model || '(the server\'s own)'} at ${cfg.baseUrl} (provider ${cfg.provider}${process.env.WC_CONFIG ? `, profile ${process.env.WC_CONFIG}` : ''})\n`);
if (cfg.provider === 'mock' || cfg.provider === 'replay') { say('config names no live model (provider ' + cfg.provider + '). Point config.json (or WC_CONFIG) at the llama-swap endpoint first.'); process.exit(1); }

// 1. the server, and the names it serves
say('1. The server');
let served = [];
try { served = await listModels(); ok(`answers; serves ${served.length} name${served.length === 1 ? '' : 's'}: ${served.slice(0, 8).join(', ')}${served.length > 8 ? '…' : ''}`); } catch (e) { fail(`cannot be reached: ${e.message}`); process.exit(1); }
const names = [...new Set(Object.keys(CALL_DEFAULTS).map((k) => routeFor(cfg, k).model).filter(Boolean))];
for (const n of names) (served.length && !served.includes(n) && !served.some((s) => s === n.replace(/:plain$/, ''))) ? fail(`the routing names "${n}", which the server does not list (a llama-swap alias with a suffix may still work: the calls below say)`) : ok(`the routing's "${n}"`);

// 2. the routing
say('\n2. The routing');
const problems = routingProblems(cfg);
problems.length ? problems.forEach(fail) : ok('valid (one model, or one process with aliases)');
const pinned = Object.keys(CALL_DEFAULTS).filter((k) => routeFor(cfg, k).slot != null);
pinned.length ? fail(`slots are pinned for ${pinned.join(', ')}: two requests on one slot hang llama.cpp (#28280); remove "pinSlots"`) : ok('no request is pinned to a slot');
cfg.contextTokens >= 65536 ? ok(`context ${cfg.contextTokens}`) : fail(`context ${cfg.contextTokens}: the game is built for the 64k profiles`);
ok(`the narrator's mode is "${cfg.narratorMode === 'cards' ? 'cards' : 'scenes'}"`);

// 3. one call of every kind
say('\n3. One question of every kind, through the game\'s own call');
const only = typeof args.only === 'string' ? new Set(args.only.split(',')) : null; const repeat = Number(args.repeat || 1);
const rows = [];
for (const [kind, call] of Object.entries(CALLS)) {
  if (only && !only.has(kind)) continue;
  for (let n = 0; n < repeat; n++) {
    const state = createInitialState('agot_298', 'stark', { seed: 298 + n });
    let a = {}; try { a = call.fixtureArgs?.(state) || {}; } catch (e) { fail(`${kind}: no fixture (${e.message})`); continue; }
    if (kind === 'narrate') a = { ...a, mode: modeOf(cfg) }; // the narrator as the game will ask it
    const t0 = Date.now();
    const r = await runCall(kind, state, a, { provider: cfg.provider, cfg }).catch((e) => ({ via: 'fallback', problems: [e.message], value: null }));
    const ms = Date.now() - t0; const tries = r.record?.attempts?.length || 1;
    rows.push({ kind, via: r.via, ms, tries, problems: r.problems || [] });
    const what = r.via === 'fallback' ? 'FELL BACK to the engine' : r.partial ? 'answered, part of it refused (the rest kept)' : tries > 1 ? `answered after ${tries} tries` : 'answered first time';
    (r.via === 'fallback' ? fail : ok)(`${kind.padEnd(11)} ${(ms / 1000).toFixed(1).padStart(5)} s  ${what}${r.problems?.length ? ` — ${r.problems.slice(0, 2).join('; ').slice(0, 160)}` : ''}`);
  }
}

// 4. the GPU, if nvidia-smi is there
say('\n4. The machine');
try {
  const out = execFileSync('nvidia-smi', ['--query-gpu=name,memory.used,memory.total', '--format=csv,noheader'], { encoding: 'utf8', timeout: 8000 }).trim();
  const [name, used, total] = out.split(',').map((x) => x.trim()); const usedMb = parseInt(used, 10);
  usedMb <= 10700 ? ok(`${name}: ${used} of ${total} in use (at most about 10,700 MiB keeps the server at full speed beside anything else)`) : fail(`${name}: ${used} of ${total} in use — above ~10.7 GB any other GPU program can halve the server's speed`);
} catch { say('  (nvidia-smi not found; skipped)'); }

const secs = rows.map((r) => r.ms / 1000); const total = secs.reduce((a, b) => a + b, 0);
say(`\n${rows.length} calls in ${total.toFixed(0)} s: ${rows.filter((r) => r.via !== 'fallback' && r.tries === 1).length} first time, ${rows.filter((r) => r.via !== 'fallback' && r.tries > 1).length} after a retry, ${rows.filter((r) => r.via === 'fallback').length} fell back.`);
say(bad ? `\n✗ ${bad} thing${bad === 1 ? '' : 's'} to look at (above).` : '\n✔ The model is ready for the game.');
process.exit(bad ? 1 : 0);
