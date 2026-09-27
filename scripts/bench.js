// The bench: how well does a model play the game? Runs scripted turns and audiences against the configured
// model server (config.json, or --url/--model), and scores what matters for this game — not general smarts:
//   • speed: time to the first token and to the end, prompt and reply tokens, cache reuse between turns;
//   • readability: does the reply parse (first try / after repair / not at all);
//   • obedience: are the player's orders carried out in the story; do the player's servants obey;
//   • character: does the reply keep to the verdict the engine settled (a refusal refuses, a yes agrees);
//   • style: narration in the third person, speech in the first; the right number of events.
// Writes a markdown report to bench/<model>-<date>.md and prints a summary.
//
//   npm run bench                         # everything, against config.json
//   npm run bench -- --only audiences     # just the audiences (fast)
//   npm run bench -- --model qwen3.8-27b-64k --effort low
//
// The interpret suite (docs/gdd/04-ai-system.md §13): 275 labelled orders for five houses, and a hold-out
//   npm run bench -- --suite interpret                    # the game's own path: the rules, the model where needed
//   npm run bench -- --suite interpret --reader model     # every order put to the model (the 95 % gate)
//   npm run bench -- --suite interpret --reader rules     # the pre-parser alone (the 60 % gate; no model)
//   npm run bench -- --suite interpret --holdout          # the orders the pre-parser was never tuned on
//   npm run bench -- --suite interpret --reader model --record tests/fixtures/model/interpret
//                                                         # keep the model's replies as replay fixtures for CI
//
// The mind suite (04 §13): 123 situations from the books, each with the responses in character
//   npm run bench -- --suite mind                         # every situation put to the model's mind (the 85 % gate)
//   npm run bench -- --suite mind --reader tree           # the house ways alone (no model)
//   npm run bench -- --suite mind --record tests/fixtures/model/mind
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url'; // a file URL's pathname is /C:/… on Windows; fileURLToPath gives a real path

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]] : a), []));

if (args.suite === 'interpret') { await interpretBench(); process.exit(0); }
if (args.suite === 'mind') { await mindBench(); process.exit(0); }
async function mindBench() {
  const { runMindSuite, mindReport } = await import('../bench/lib/mind.js');
  const { runCall } = await import('../server/ai/client.js');
  const { intentOf, default: call } = await import('../server/ai/calls/mind.js');
  const { treeChoice } = await import('../public/js/engine/minds/houseways.js');
  const { loadConfig } = await import('../server/llm.js');
  const cfg = { ...loadConfig(), ...(args.url ? { baseUrl: args.url, provider: 'openai' } : {}), ...(args.model ? { model: args.model } : {}), ...(args.provider ? { provider: args.provider } : {}), ...(args.mock ? { provider: 'mock' } : {}) };
  const reader = args.reader === 'tree' ? 'tree' : 'model';
  const recordTo = typeof args.record === 'string' ? path.resolve(args.record) : null; let recorded = 0;
  const read = reader === 'tree' ? (s, actor) => treeChoice(s, actor)
    : async (s, actor) => {
      const r = await runCall('mind', s, { actor }, { cfg, provider: cfg.provider, log: (kind, messages, reply) => {
        if (!recordTo) return; fs.mkdirSync(recordTo, { recursive: true });
        const fp = call.fingerprint(call.context(s, { actor }));
        fs.writeFileSync(path.join(recordTo, `${actor}-${recorded++}.json`), JSON.stringify({ kind: 'mind', fingerprint: fp, model: cfg.model || 'unknown', note: `recorded by the bench, ${new Date().toISOString().slice(0, 10)}`, reply }, null, 1) + '\n');
      } });
      const it = r.value && intentOf(r.value, r.ctx);
      return it ? { ...it, via: r.via } : { verb: 'wait', params: {}, via: r.via };
    };
  const who = reader === 'tree' ? 'the house ways' : `every situation to the model's mind — ${cfg.provider === 'mock' ? 'mock (the house ways through the call)' : cfg.model || '(server default)'}`;
  console.log(`Mind suite — ${who}`);
  const r = await runMindSuite(read, { only: typeof args.only === 'string' ? args.only.split(',') : null });
  const text = mindReport(r, { reader: who }) + `\n_${new Date().toISOString().slice(0, 16)} · provider ${cfg.provider}${recordTo ? ` · ${recorded} replies recorded to ${path.relative(ROOT, recordTo)}` : ''}_\n`;
  const out = path.join(ROOT, 'bench', `mind-${reader === 'tree' ? 'tree' : slugOf(cfg.provider === 'mock' ? 'mock' : cfg.model || 'model')}-${new Date().toISOString().slice(0, 10)}.md`);
  fs.writeFileSync(out, text); console.log(text); console.log(`Written to ${path.relative(ROOT, out)}`);
}
async function interpretBench() {
  const { runSuite, report, loadSuite } = await import('../bench/lib/interpret.js');
  const { interpretOrder } = await import('../server/orders/interpret.js');
  const { parseOrder } = await import('../server/orders/parse.js');
  const { runCall } = await import('../server/ai/client.js');
  const { readingOf, default: call } = await import('../server/ai/calls/interpret.js');
  const { loadConfig } = await import('../server/llm.js');
  const cfg = { ...loadConfig(), ...(args.url ? { baseUrl: args.url, provider: 'openai' } : {}), ...(args.model ? { model: args.model } : {}), ...(args.provider ? { provider: args.provider } : {}), ...(args.mock ? { provider: 'mock' } : {}) };
  const reader = ['rules', 'model'].includes(args.reader) ? args.reader : 'interpreter';
  const recordTo = typeof args.record === 'string' ? path.resolve(args.record) : null;
  let recorded = 0;
  const log = (house, text) => (kind, messages, reply) => {
    if (!recordTo || kind !== 'interpret') return;
    const ctx = { house, text }; fs.mkdirSync(recordTo, { recursive: true });
    const fp = call.fingerprint(ctx);
    fs.writeFileSync(path.join(recordTo, `${fp.replace(/[^a-z0-9_]+/g, '-').slice(0, 80)}.json`), JSON.stringify({ kind, fingerprint: fp, model: cfg.model || 'unknown', note: `recorded by the bench, ${new Date().toISOString().slice(0, 10)}`, reply }, null, 1) + '\n');
    recorded++;
  };
  const read = reader === 'rules' ? (s, text, house) => parseOrder(s, text, { house })
    : reader === 'model' ? async (s, text, house) => { const r = await runCall('interpret', s, { text, house }, { cfg, provider: cfg.provider, log: log(house, text) }); return r.value ? { ...readingOf(r.value, s, { house }), via: r.via } : { actions: [], story: true, via: r.via }; }
      : (s, text, house) => interpretOrder(s, text, { house, cfg, provider: cfg.provider, log: log(house, text) });
  const suites = loadSuite(args.holdout ? path.join(ROOT, 'bench', 'suites', 'interpret-holdout') : undefined);
  const who = reader === 'rules' ? 'the pre-parser' : `${reader === 'model' ? 'every order to the model' : 'the rules, then the model'} — ${cfg.provider === 'mock' ? 'mock' : cfg.model || '(server default)'}`;
  console.log(`Interpret ${args.holdout ? 'hold-out' : 'suite'} — ${who}`);
  const r = await runSuite(read, { suites, only: typeof args.house === 'string' ? args.house.split(',') : null });
  const text = `# ${report(r, { title: `Interpret ${args.holdout ? 'hold-out' : 'suite'}`, reader: who }).replace(/^## /, '')}\n_${new Date().toISOString().slice(0, 16)} · provider ${cfg.provider}${cfg.provider === 'mock' ? '' : ` · ${cfg.baseUrl}`}${recordTo ? ` · ${recorded} replies recorded to ${path.relative(ROOT, recordTo)}` : ''}_\n`;
  const by = reader === 'rules' ? 'rules' : `${reader}-${slugOf(cfg.provider === 'mock' ? 'mock' : cfg.model || 'model')}`;
  const out = path.join(ROOT, 'bench', `interpret-${by}-${new Date().toISOString().slice(0, 10)}${args.holdout ? '-holdout' : ''}.md`);
  fs.writeFileSync(out, text);
  console.log(text); console.log(`Written to ${path.relative(ROOT, out)}`);
}
function slugOf(s) { return String(s).toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-|-$/g, ''); }

// run in a scratch copy of the saves so the player's games are never touched
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-bench-'));
fs.cpSync(path.join(ROOT, 'server'), path.join(work, 'server'), { recursive: true });
fs.symlinkSync(path.join(ROOT, 'public'), path.join(work, 'public'));
fs.mkdirSync(path.join(work, 'saves'));
const base = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8')); } catch { return {}; } })();
const cfg = { ...base, ...(args.url ? { baseUrl: args.url, provider: 'openai' } : {}), ...(args.model ? { model: args.model } : {}), ...(args.effort ? { reasoningEffort: args.effort === 'default' ? '' : args.effort } : {}), ...(args.thinking ? { thinking: args.thinking } : {}), ...(args.mock ? { provider: 'mock' } : {}) };
fs.writeFileSync(path.join(work, 'config.json'), JSON.stringify(cfg, null, 2));
process.chdir(work);
const game = await import(path.join(work, 'server/game.js'));
const { extractJson } = await import(path.join(work, 'server/llm.js'));

const report = []; const score = {};
const add = (k, ok) => { score[k] = score[k] || [0, 0]; score[k][1]++; if (ok) score[k][0]++; };
const log = (s) => { report.push(s); console.log(s); };
const secs = (ms) => `${(ms / 1000).toFixed(1)}s`;
const lastLog = (id) => { const f = path.join('saves', id, 'llm-log.jsonl'); const lines = fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim().split('\n') : []; return lines.map((l) => JSON.parse(l)); };

log(`# Bench — ${cfg.provider === 'mock' ? 'mock' : cfg.model || '(server default)'} — ${new Date().toISOString().slice(0, 16)}`);
log(`Endpoint ${cfg.provider === 'mock' ? 'mock' : cfg.baseUrl} · thinking ${cfg.thinking || 'auto'} · effort ${cfg.reasoningEffort ?? 'low'} · context ${cfg.contextTokens}\n`);

// ── Turns ──
if (!args.only || args.only === 'turns') {
  log('## Turns');
  const { id } = game.newGame('agot_298', args.house || 'stark');
  const plan = [
    ['1d', ['Send Ser Rodrik Cassel with fifty men to White Harbor to inspect the fleet.', 'Write to Lord Tully at Riverrun asking for news of the south.']],
    ['1d', ['Raise two thousand levies at Winterfell under Robb.']],
    ['1d', ['Send a raven to Walder Frey: open the crossing to my men when I ask it, or I will remember it.']],
    ['1w', ['Hold a feast for my bannermen.']],
    ['1m', ['March the levies to Moat Cailin and fortify it.']],
  ];
  for (const [span, orders] of plan) {
    const t0 = Date.now(); let r;
    try { r = await game.advance(id, { span, orders: orders.map((text) => ({ text })) }); } catch (e) { log(`- turn failed: ${e.message}`); add('turn completes', false); continue; }
    const ms = Date.now() - t0; const t = r.turn;
    const calls = lastLog(id).filter((x) => x.kind.startsWith('jump')).slice(-2);
    const retried = calls.some((x) => x.kind === 'jump-retry');
    const firstOk = (() => { try { extractJson(calls.find((x) => x.kind === 'jump')?.response || ''); return true; } catch { return false; } })();
    const main = t.events.filter((e) => !e.bg && !/steward|ledger|pays|answers the call|arrives|reaches/i.test(e.title));
    const story = `${t.summary} ${t.events.map((e) => `${e.title} ${e.text} ${e.details || ''}`).join(' ')}`.toLowerCase();
    const followed = orders.map((o) => { const keys = o.toLowerCase().match(/\b(rodrik|white harbor|tully|riverrun|levies|feast|moat cailin|robb|frey|twins)\b/g) || []; return keys.some((k) => story.includes(k)) || (t.applied || []).some((a) => keys.some((k) => String(a.text).toLowerCase().includes(k))) || (t.carried || []).length > 0 && keys.some((k) => JSON.stringify(t.carried).toLowerCase().includes(k)); });
    add('turn completes', !t.salvaged); add('reply parses first try', firstOk && !retried); add('orders appear in the story', followed.every(Boolean));
    const [lo, hi] = { '1d': [0, 4], '1w': [1, 6], '1m': [2, 8] }[span] || [2, 11];
    add(`events in range for ${span}`, main.length >= lo && main.length <= hi);
    log(`- **${span}**: ${secs(ms)}${t.usage ? ` · prompt ${t.usage.prompt_tokens} (cached ${t.usage.prompt_tokens_details?.cached_tokens ?? '?'}) · reply ${t.usage.completion_tokens}` : ''} · ${t.salvaged ? 'SALVAGED' : firstOk && !retried ? 'parsed' : 'parsed after repair/retry'} · ${main.length} story events, ${t.events.filter((e) => e.bg).length} background · orders followed: ${followed.map((f) => (f ? '✓' : '✗')).join(' ')}`);
    for (const e of main.slice(0, 4)) log(`    - d${e.day} ${e.title} — ${e.text}`);
  }
}

// ── Audiences ──
if (!args.only || args.only === 'audiences') {
  log('\n## Audiences');
  const cases = [
    // [character, line, what the engine should settle, what the reply must show]
    ['jory_cassel', 'Ride to Oldtown with ten men and bring me word of the Citadel.', 'obey', /at once|my lord|as you (say|command)|it will be done/i],
    ['janos_slynt', 'I offer you 5,000 gold dragons for your friendship.', 'agree', /\b(yes|agreed|very well|done|accept|gladly|you have)\b/i],
    ['tywin_lannister', 'Swear fealty to me or I will burn Casterly Rock.', 'refuse', /\b(no|never|refuse|will not|won't|shall not|threat)/i],
    ['walder_frey', 'I propose an alliance between our houses.', 'bargain', /\b(price|what (will|do) (you|i) (give|get)|in return|nothing for nothing|a match|marr|daughter|grand)/i],
    ['viserys_targaryen', 'You are a craven fool and a beggar.', 'dismiss', /\b(leave|out|begone|enough|go|done|dragon)\b/i],
    ['greatjon_umber', 'You are a fat old fool, Umber.', null, /./],
  ];
  const { id } = game.newGame('agot_298', 'stark');
  for (const [who, line, want, shows] of cases) {
    const t0 = Date.now(); let r;
    try { r = await game.talk(id, who, line); } catch (e) { log(`- ${who}: ${e.message}`); add('audience answers', false); continue; }
    // far away it is a letter: the answer is written now and lands later — score the letter itself
    if (r.reply == null) { const last = r.state.chats?.[who]?.at(-1); r.reply = last?.pending ? last.text : ''; if (last?.verdict) r.stance = { ...r.stance, verdict: last.verdict }; }
    const ms = Date.now() - t0; const reply = String(r.reply || '');
    const narr = [...reply.matchAll(/\*([^*]+)\*/g)].map((m) => m[1]);
    const letter = !narr.length || /^(my lord|lord|to |from |eddard|ned\b|dear)/i.test(reply.trim()); // by raven: a letter has no narration to judge
    const thirdPerson = letter ? null : narr.every((n) => !/\b(I|me|my|myself)\b/.test(n));
    const verdictOk = !want || r.stance?.verdict === want;
    const shown = shows.test(reply.replace(/\*[^*]*\*/g, ' '));
    add('audience answers', reply.trim().length > 20); if (thirdPerson !== null) add('narration in third person', thirdPerson); add('engine verdict as expected', verdictOk); if (want) add('reply keeps to the verdict', shown);
    log(`- **${who}** ← "${line}" → engine: ${r.stance?.verdict || '—'} (${r.stance?.mood}) · ${secs(ms)} · ${thirdPerson === null ? 'letter' : `third person ${thirdPerson ? '✓' : '✗'}`} · keeps to verdict ${want ? (shown ? '✓' : '✗') : '—'}`);
    log(`    > ${reply.replace(/\s+/g, ' ').slice(0, 300)}`);
  }
}

log('\n## Score');
for (const [k, [ok, n]] of Object.entries(score)) log(`- ${k}: ${ok}/${n}`);
const dir = path.join(ROOT, 'bench'); fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `${String(cfg.provider === 'mock' ? 'mock' : cfg.model || 'default').replace(/[^\w.-]+/g, '_')}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.md`);
fs.writeFileSync(file, report.join('\n') + '\n');
console.log(`\nReport: ${path.relative(ROOT, file)}`);
fs.rmSync(work, { recursive: true, force: true });
