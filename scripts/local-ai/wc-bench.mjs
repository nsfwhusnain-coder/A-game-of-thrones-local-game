// Westeros Chronicles quality + speed runner.
// Runs the GAME'S OWN suites (bench/suites/*) with the GAME'S OWN prompts, schemas, validators and scoring libs
// (imported from the pinned clone, never modified) against any OpenAI-compatible endpoint, and adds what the game's bench
// does not report: per-call latency/TTFT/tokens from a wire-logging proxy, first-try validity, retry and fallback counts,
// foreign-script leaks, and the game's real concurrency (minds two at a time, everything else one at a time).
//
//   node wc-bench.mjs --base http://127.0.0.1:8090 --model gemma4-26b-a4b --label g26-64k
//        [--suites interpret,holdout,mind,narrate] [--sample 60] [--conc-mind 2] [--slots game|none|free]
//        [--extra-body '{"top_p":0.9}'] [--repo <game checkout>] [--server-info '{...}']
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { startProxy } from './proxy.mjs';
import { analyzeWire, fmtWire } from './analyze.mjs';
import { gpuSampler } from './sys.mjs';
import { REPO, HOME, RESULTS, CORPUS, SPEED, LOGS } from './paths.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]] : a), []));
const REPO_ = args.repo || REPO;
const base = String(args.base || 'http://127.0.0.1:8090').replace(/\/v1\/?$/, '').replace(/\/+$/, '');
const model = args.model || 'local-model';
const label = args.label || `run-${Date.now()}`;
const suites = String(args.suites || 'interpret,holdout,mind,narrate').split(',');
const sample = Number(args.sample || 0);
const conc = { interpret: Number(args['conc-interpret'] || 1), mind: Number(args['conc-mind'] || 2), narrate: Number(args['conc-narrate'] || 1) };
const outDir = path.join(RESULTS, label); fs.mkdirSync(outDir, { recursive: true });
const wireFile = path.join(outDir, 'wire.jsonl'); if (fs.existsSync(wireFile) && !args.append) fs.rmSync(wireFile);
const imp = (rel) => import(pathToFileURL(path.join(REPO_, rel)).href);
const commit = (() => { try { return execFileSync('git', ['-C', REPO_, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { return 'unknown'; } })();

const provider = args.provider === 'mock' ? 'mock' : 'openai';
const proxy = await startProxy({ target: base, logFile: wireFile, label });
const { DEFAULT_CONFIG } = await imp('server/llm.js');
const slotOf = (mode, k) => (mode === 'none' || mode === 'free' ? null : ({ interpret: 1, mind: 1, director: 1, narrate: 0, audience: 0, council: 0, consolidate: 1 })[k] ?? null);
const mode = args.slots || 'game';
const T = { interpret: 0.2, mind: 0.6, director: 0.8, narrate: 0.85, audience: 0.8, council: 0.8, consolidate: 0.3 };
const models = { default: { model, slot: null }, ...Object.fromEntries(Object.keys(T).map((k) => [k, { model, slot: slotOf(mode, k), temperature: T[k] }])) };
const cfg = { ...DEFAULT_CONFIG, provider, baseUrl: `${proxy.url}/v1`, model, models, timeoutSec: Number(args.timeout || 900), stream: true, contextTokens: 65536,
  extraBody: args['extra-body'] ? JSON.parse(args['extra-body']) : {} };

const { runCall } = await imp('server/ai/client.js');
const { hasForeignScript } = await imp('server/ai/schema.js');
const tel = {}; // per call kind: calls, via counts, first-try ok, retried, problems by rule
const noteCall = (kind, r) => {
  const t = tel[kind] = tel[kind] || { calls: 0, model: 0, fallback: 0, partial: 0, firstTryOk: 0, retried: 0, ms: [], problems: {}, foreign: 0 };
  t.calls++; t.ms.push(r.ms); if (r.via === 'fallback') t.fallback++; else t.model++; if (r.partial) t.partial++;
  const att = r.record?.attempts || [];
  if (att.length && !att[0].error && !att[0].problems?.length) t.firstTryOk++;
  if (att.length > 1) t.retried++;
  for (const a of att) for (const p of a.problems || []) { const k = String(p).replace(/\b[a-z_]+\d*\b(?=[ :(])/i, (m) => (m.length > 3 ? m : m)).slice(0, 70); t.problems[k] = (t.problems[k] || 0) + 1; }
};
const pool = async (items, n, fn) => { const out = new Array(items.length); let next = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); } })); return out; };
const stride = (items, want) => (want && items.length > want ? items.filter((_, i) => i % Math.ceil(items.length / want) === 0) : items);
const pct = (a, b) => (b ? `${(100 * a / b).toFixed(1)} %` : '—');
const prev = (() => { try { return args.append ? JSON.parse(fs.readFileSync(path.join(outDir, 'summary.json'), 'utf8')) : null; } catch { return null; } })();
const summary = { label, model, base, commit, when: new Date().toISOString(), slots: mode, conc, sample, serverInfo: args['server-info'] ? JSON.parse(args['server-info']) : null, suites: { ...(prev?.suites || {}) } };
const gpu = gpuSampler(1500); const t00 = Date.now();
const save = () => { summary.gpuPeakMiB = gpu.stop().peak; summary.wallSec = (Date.now() - t00) / 1000; fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 1)); };
let done = 0; const tick = (name, total) => { done++; if (done % 20 === 0 || done === total) process.stdout.write(`  [${name}] ${done}/${total}\n`); };

// ── interpret / holdout ────────────────────────────────────────────────────────────────────────────────────────────
async function interpret(which) {
  const { loadSuite, runSuite, report } = await imp('bench/lib/interpret.js');
  const { readingOf } = await imp('server/ai/calls/interpret.js');
  const dir = path.join(REPO_, 'bench', 'suites', which === 'holdout' ? 'interpret-holdout' : 'interpret');
  const files = loadSuite(dir).map((s) => ({ ...s, items: stride(s.items, sample ? Math.ceil(sample / 5) : 0) }));
  const total = files.reduce((n, s) => n + s.items.length, 0); done = 0;
  proxy.setLabel(`${label}:${which}`); const t0 = Date.now();
  const read = async (s, text, house) => {
    const r = await runCall('interpret', s, { text, house }, { cfg, provider });
    noteCall('interpret', r); tick(which, total);
    return r.value ? { ...readingOf(r.value, s, { house }), via: r.via } : { actions: [], story: true, via: r.via };
  };
  const parts = await pool(files, conc.interpret, (suite) => runSuite(read, { suites: [suite] }));
  const out = { total: 0, exact: 0, params: [0, 0], clarified: 0, receipts: [0, 0], alone: [0, 0], byHouse: {}, misses: [], ms: 0 };
  for (const p of parts) { out.total += p.total; out.exact += p.exact; out.params[0] += p.params[0]; out.params[1] += p.params[1]; out.clarified += p.clarified; out.receipts[0] += p.receipts[0]; out.receipts[1] += p.receipts[1]; out.alone[0] += p.alone[0]; out.alone[1] += p.alone[1]; Object.assign(out.byHouse, p.byHouse); out.misses.push(...p.misses); out.ms += p.ms; }
  out.wallSec = (Date.now() - t0) / 1000;
  fs.writeFileSync(path.join(outDir, `${which}.md`), report(out, { title: `Interpret ${which}`, reader: `${model} (every order to the model)` }));
  fs.writeFileSync(path.join(outDir, `${which}.json`), JSON.stringify(out, null, 1));
  summary.suites[which] = { n: out.total, exact: out.exact, exactPct: +(100 * out.exact / out.total).toFixed(1), paramPct: +(100 * out.params[0] / Math.max(1, out.params[1])).toFixed(1), clarifyPct: +(100 * out.clarified / out.total).toFixed(1), receiptPct: +(100 * out.receipts[0] / Math.max(1, out.receipts[1])).toFixed(1), byHouse: Object.fromEntries(Object.entries(out.byHouse).map(([h, x]) => [h, `${x.exact}/${x.total}`])), wallSec: out.wallSec };
  console.log(`${which}: exact ${out.exact}/${out.total} (${pct(out.exact, out.total)}), params ${pct(out.params[0], out.params[1])}, clarify ${out.clarified}, wall ${out.wallSec.toFixed(0)}s`);
}

// ── mind ───────────────────────────────────────────────────────────────────────────────────────────────────────────
async function mind() {
  const { loadMindSuite, runMindSuite, mindReport } = await imp('bench/lib/mind.js');
  const { intentOf } = await imp('server/ai/calls/mind.js');
  const files = loadMindSuite().map((s) => ({ ...s, items: stride(s.items, sample ? Math.ceil(sample / 9) : 0) }));
  const total = files.reduce((n, s) => n + s.items.length, 0); done = 0;
  proxy.setLabel(`${label}:mind`); const t0 = Date.now(); const viaCount = { model: 0, fallback: 0 }; let inCharModelOnly = 0;
  const read = async (s, actor, item) => {
    const r = await runCall('mind', s, { actor }, { cfg, provider });
    noteCall('mind', r); tick('mind', total); viaCount[r.via === 'fallback' ? 'fallback' : 'model']++;
    const it = r.value && intentOf(r.value, r.ctx);
    return it ? { ...it, via: r.via } : { verb: 'wait', params: {}, via: r.via };
  };
  // the game runs minds two at a time: the pool is over the suite's files (each sequential inside), so ~conc at once
  const parts = await pool(files, conc.mind, (suite) => runMindSuite(read, { suites: [suite] }));
  const out = { total: 0, inCharacter: 0, lawful: 0, byFile: {}, verbs: {}, misses: [], ms: 0 };
  for (const p of parts) { out.total += p.total; out.inCharacter += p.inCharacter; out.lawful += p.lawful; Object.assign(out.byFile, p.byFile); for (const [v, n] of Object.entries(p.verbs)) out.verbs[v] = (out.verbs[v] || 0) + n; out.misses.push(...p.misses); out.ms += p.ms; }
  const fbMisses = out.misses.filter((m) => m.via === 'fallback').length;
  out.wallSec = (Date.now() - t0) / 1000; out.via = viaCount;
  fs.writeFileSync(path.join(outDir, 'mind.md'), mindReport(out, { reader: `${model} (mind call)` }));
  fs.writeFileSync(path.join(outDir, 'mind.json'), JSON.stringify(out, null, 1));
  summary.suites.mind = { n: out.total, inCharPct: +(100 * out.inCharacter / out.total).toFixed(1), lawfulPct: +(100 * out.lawful / out.total).toFixed(1), fallbackCalls: viaCount.fallback, fallbackMisses: fbMisses, verbs: out.verbs, wallSec: out.wallSec };
  console.log(`mind: in character ${out.inCharacter}/${out.total} (${pct(out.inCharacter, out.total)}), lawful ${pct(out.lawful, out.total)}, fallbacks ${viaCount.fallback}, wall ${out.wallSec.toFixed(0)}s`);
}

// ── narrate ────────────────────────────────────────────────────────────────────────────────────────────────────────
async function narrate() {
  const { bundles, runNarrateSuite, narrateReport } = await imp('bench/lib/narrate.js');
  const { narrateTurn } = await imp('server/narrator.js');
  console.log('  playing the twelve games on the mock to make the weeks…'); const tb = Date.now();
  let list = await bundles({}); list = stride(list, sample ? Math.min(sample, 60) : 0); done = 0;
  console.log(`  ${list.length} weeks ready in ${((Date.now() - tb) / 1000).toFixed(0)}s`);
  proxy.setLabel(`${label}:narrate`); const t0 = Date.now();
  const narr = async (state, cards) => { const r = await narrateTurn(state, cards, { provider: 'openai', cfg }); tick('narrate', list.length); const rec = r.record || {}; const t = tel.narrate = tel.narrate || { weeks: 0, stories: 0, told: 0, again: 0, plain: 0, fallbackWeeks: 0, problems: {} }; t.weeks++; t.stories += rec.stories || 0; t.told += rec.told || 0; t.again += rec.again || 0; t.plain += rec.plain || 0; if (rec.via === 'fallback') t.fallbackWeeks++; for (const [k, v] of Object.entries(rec.problems || {})) t.problems[k] = (t.problems[k] || 0) + v; return r; };
  const out = await runNarrateSuite(list, narr, { judge: null });
  out.wallSec = (Date.now() - t0) / 1000;
  fs.writeFileSync(path.join(outDir, 'narrate.md'), narrateReport(out, { reader: model }));
  fs.writeFileSync(path.join(outDir, 'narrate.json'), JSON.stringify({ ...out, samples: out.samples }, null, 1));
  summary.suites.narrate = { weeks: out.weeks, stories: out.stories, firstTryPct: +(100 * out.firstTry / Math.max(1, out.stories)).toFixed(1), mended: out.mended, plain: out.plain, plainPct: +(100 * out.plain / Math.max(1, out.stories)).toFixed(1), faults: out.faults, wallSec: out.wallSec, secPerWeek: +(out.wallSec / Math.max(1, out.weeks)).toFixed(1) };
  console.log(`narrate: true first time ${out.firstTry}/${out.stories} (${pct(out.firstTry, out.stories)}), plain ${out.plain}, faults ${JSON.stringify(out.faults)}, ${(out.wallSec / Math.max(1, out.weeks)).toFixed(1)} s/week`);
}

// ── voices: audience, council, advisor, director, consolidate (the game's own suites do not cover them) ─────────────────
async function voices() {
  const { createInitialState } = await imp('public/js/shared/world.js');
  const { weighAudience } = await imp('public/js/shared/temperament.js');
  const { withRng } = await imp('public/js/engine/rng.js');
  const { anachronismsIn } = await imp('public/data/anachronisms.js');
  const { bundles } = await imp('bench/lib/narrate.js');
  const HOUSES = ['stark', 'lannister', 'greyjoy', 'baratheon', 'arryn', 'tully', 'martell', 'tyrell', 'frey', 'nights_watch', 'manderly', 'bolton', 'mormont', 'tarly', 'karstark', 'umber'];
  const WHO = ['roose_bolton', 'walder_frey', 'tywin_lannister', 'jon_arryn', 'hoster_tully', 'doran_martell', 'mace_tyrell', 'balon_greyjoy', 'stannis_baratheon', 'lysa_arryn', 'jaime_lannister', 'varys'];
  const LINES = ['{n}, bring your men to Moat Cailin within the fortnight.', 'I ask you to swear fealty to my house.', 'You will hand over the prisoner or answer for it.', 'You are a fool and a coward, and your house is a jest.', 'Will you stand with me if the realm goes to war?', 'I would have you release the captive lord at once.', 'How goes the harvest in your lands?', 'Send me two thousand dragons in tribute before the moon is out.', 'Let there be a truce between our houses for a year.', 'Tell me what you know of the health of the King.'];
  const QUESTIONS = ['Can we afford a war?', 'What threatens us most, and what should we do first?', 'Who among our vassals is least loyal, and why?', 'Summarise what has happened since we began.', 'How do we stand against our largest neighbour?', 'What would my father have done?', 'Is the granary full enough for the winter?', 'Should I call the banners now?'];
  const per = {};
  const note = (k, r, extra = {}) => {
    noteCall(k, r);
    const t = per[k] = per[k] || { n: 0, model: 0, fallback: 0, firstTry: 0, retried: 0, foreign: 0, anachronism: 0, ...extra };
    t.n++; t[r.via === 'fallback' ? 'fallback' : 'model']++;
    const a = r.record?.attempts || []; if (a.length && !a[0].error && !a[0].problems?.length) t.firstTry++; if (a.length > 1) t.retried++;
    if (hasForeignScript(JSON.stringify(r.value || {}))) t.foreign++;
    return t;
  };
  const samples = { audience: [], council: [], director: [], consolidate: [] };
  const mk = (h, seed) => createInitialState('agot_298', h, { seed });
  proxy.setLabel(`${label}:voices`); const t0 = Date.now(); const N = sample ? Math.max(3, Math.round(sample / 4)) : 10;
  // audiences: the engine weighs the words first (its verdict limits what the model may promise)
  const verdicts = {};
  for (let i = 0; i < N * 2; i++) {
    const h = HOUSES[i % HOUSES.length]; const state = mk(h, 298 + i);
    const pool = WHO.filter((w) => w !== state.houses[h].lord && state.characters[w]?.alive); const cid = pool[i % pool.length]; if (!cid) continue;
    const c = state.characters[cid]; const words = LINES[i % LINES.length].replace('{n}', `Lord ${c.name.split(' ').pop()}`);
    const stance = withRng(state, () => weighAudience(state, c, words)); verdicts[stance.verdict] = (verdicts[stance.verdict] || 0) + 1;
    const r = await runCall('audience', state, { character: cid, words, stance, face: true, known: [], memory: '', receipt: [] }, { cfg, provider });
    const t = note('audience', r); const txt = (r.value?.beats || []).map((b) => b.text).join(' '); if (anachronismsIn(state, txt).length) t.anachronism++;
    if (samples.audience.length < 4 && r.value) samples.audience.push({ house: h, who: cid, words, verdict: stance.verdict, via: r.via, beats: r.value.beats, outcome: r.value.outcome });
  }
  // councils (one voice each in turn), advisors (one long answer), and a council left to talk among itself
  for (let i = 0; i < N * 2; i++) {
    const h = HOUSES[(i * 3) % HOUSES.length]; const state = mk(h, 400 + i); const lordId = state.houses[h].lord;
    const kin = Object.values(state.characters).filter((c) => c.alive && c.house === h && c.id !== lordId).slice(0, 3).map((c) => c.id); if (kin.length < 2) continue;
    const mode = i % 5 === 4 ? 'advisor' : i % 7 === 6 ? 'listening' : 'ask';
    const r = await runCall('council', state, { members: mode === 'advisor' ? kin.slice(0, 1) : kin, words: QUESTIONS[i % QUESTIONS.length], advisor: mode === 'advisor', listening: mode === 'listening' }, { cfg, provider });
    const t = note('council', r, { modes: {} }); t.modes[mode] = (t.modes[mode] || 0) + 1;
    if (samples.council.length < 3 && r.value) samples.council.push({ house: h, mode, q: QUESTIONS[i % QUESTIONS.length], via: r.via, speeches: r.value.speeches });
  }
  // the director picks story hooks: valid, and varied?
  const hookSeen = {};
  for (let i = 0; i < N * 2; i++) {
    const h = HOUSES[(i * 5) % HOUSES.length]; const state = mk(h, 500 + i);
    const r = await runCall('director', state, { max: 1 }, { cfg, provider });
    if ((r.problems || []).some((p) => /could not be prepared/.test(p))) continue;
    note('director', r); for (const x of r.value?.hooks || []) hookSeen[x.hook] = (hookSeen[x.hook] || 0) + 1;
  }
  // consolidations of mock-played games' facts
  const list = await bundles({ only: ['stark', 'lannister', 'greyjoy', 'tyrell', 'martell'] }); const byGame = {}; for (const b of list) (byGame[b.game] = byGame[b.game] || []).push(b);
  for (const [g, bs] of Object.entries(byGame).slice(0, Math.max(2, N))) {
    const last = bs[bs.length - 1]; const facts = bs.flatMap((b) => b.state.facts || []);
    const r = await runCall('consolidate', last.state, { facts }, { cfg, provider }); note('consolidate', r);
    if (samples.consolidate.length < 2 && r.value) samples.consolidate.push({ game: g, via: r.via, summary: r.value.summary, open: r.value.open });
  }
  const calls = Object.values(hookSeen).reduce((a, b) => a + b, 0);
  const out = { per, verdicts, hookVariety: { distinctHooks: Object.keys(hookSeen).length, calls, top: Object.entries(hookSeen).sort((a, b) => b[1] - a[1]).slice(0, 5) }, samples, wallSec: (Date.now() - t0) / 1000 };
  fs.writeFileSync(path.join(outDir, 'voices.json'), JSON.stringify(out, null, 1));
  summary.suites.voices = { per: Object.fromEntries(Object.entries(per).map(([k, t]) => [k, { n: t.n, fallback: t.fallback, firstTryPct: +(100 * t.firstTry / Math.max(1, t.n)).toFixed(1), foreign: t.foreign, anachronism: t.anachronism }])), verdicts, distinctHooks: out.hookVariety.distinctHooks, hookCalls: calls, wallSec: out.wallSec };
  console.log('voices:', JSON.stringify(summary.suites.voices.per), `hooks ${out.hookVariety.distinctHooks} distinct in ${calls} calls`, `wall ${out.wallSec.toFixed(0)}s`);
}

try {
  for (const s of suites) {
    console.log(`== ${label}: ${s} ${sample ? `(sample ~${sample})` : '(full)'}`);
    if (s === 'interpret' || s === 'holdout') await interpret(s); else if (s === 'mind') await mind(); else if (s === 'narrate') await narrate(); else if (s === 'voices') await voices();
    save();
  }
} finally {
  await proxy.close();
  for (const [k, t] of Object.entries(tel)) if (t.ms) { t.ms.sort((a, b) => a - b); t.p50 = t.ms[Math.floor(t.ms.length * 0.5)]; t.p95 = t.ms[Math.floor(t.ms.length * 0.95)]; delete t.ms; }
  summary.telemetry = tel;
  const wire = analyzeWire(wireFile); summary.wire = wire; summary.foreignScriptInReplies = wire.total.foreign;
  save();
  fs.writeFileSync(path.join(outDir, 'wire.md'), fmtWire(wire));
  console.log(fmtWire(wire));
  console.log(`\nresults in ${outDir}`);
}
