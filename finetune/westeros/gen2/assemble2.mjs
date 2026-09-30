// Two-GPU, two-phase assembly. Each GPU trains its own LoRA (same init seed) on a DIFFERENT half of the synthetic rows; the game's gold orders go to both.
//   node assemble2.mjs --phase 1 [--per-run 2.3e6] [--out C:/wc-ai/finetune/final2]
//   phase 1: interpret only (engine labels).         -> train_A1.jsonl, train_B1.jsonl, dev.jsonl
//   phase 2: mind, narrate, audience, council, director, consolidate (+ an interpret replay so phase 1 is not forgotten) -> train_A2.jsonl, train_B2.jsonl
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const a = Object.fromEntries(process.argv.slice(2).reduce((acc, x, i, all) => (x.startsWith('--') ? [...acc, [x.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]] : acc), []));
const PHASE = Number(a.phase || 1); const PER = Number(a['per-run'] || 2.3e6); const MAXLEN = Number(a.maxlen || 3400); const OUT = a.out || 'C:/wc-ai/finetune/final2'; const POOL = a.pool || 'C:/wc-ai/finetune/pool';
const TAG = a.tag || '';
const INTERP = a.interpret || 'C:/wc-ai/finetune/data2/interpret-train.jsonl'; const SEED = Number(a.seed || 17);
fs.mkdirSync(OUT, { recursive: true });
let s = SEED >>> 0; const rnd = () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const shuffle = (arr) => arr.map((x) => [rnd(), x]).sort((p, q) => p[0] - q[0]).map((p) => p[1]);
const load = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);

const IW = { 'interpret:story': 7, 'interpret:story_stay': 2.5, 'interpret:story_holds': 0.5, 'interpret:clarify_thin': 2, 'interpret:clarify_vague2': 2.5, 'interpret:clarify_person': 2, 'interpret:clarify_place': 2, 'interpret:clarify_host': 1.5,
  'interpret:send_person': 7, 'interpret:march_host': 6, 'interpret:letter': 5, 'interpret:letter_place': 3, 'interpret:fund_works': 3.5, 'interpret:raise_levies': 2.5, 'interpret:set_tax': 2.5, 'interpret:set_dues': 1.5, 'interpret:hire_men': 1.5,
  'interpret:hire_officer': 2, 'interpret:appoint_office': 1.5, 'interpret:declare_war': 1.5, 'interpret:gather_secrets': 1.5, 'interpret:plant_spy': 1, 'interpret:feast': 1.5, 'interpret:send_gift': 1.5, 'interpret:disband_host': 2,
  'interpret:halt_host': 2.5, 'interpret:merge_hosts': 2, 'interpret:grant_holding': 0.5, 'interpret:judge_prisoner': 1.5, 'interpret:call_banners': 1.5, 'interpret:multi': 3 };

const rows = [];
for (const r of load(INTERP)) rows.push({ ...r, kind: 'interpret', group: r.source === 'suite-train' ? 'interpret:gold' : `interpret:${String(r.family).replace(/^multi:.*/, 'multi')}` });
const PARA = a.para || 'C:/wc-ai/finetune/pool-extra/interpret-para.jsonl';
if (PHASE === 3 || (PHASE === 2 && TAG === 'b')) { for (const r of load('C:/wc-ai/finetune/pool-extra/fix-letter_place/interpret-train.jsonl').filter((x) => x.family === 'letter_place')) rows.push({ ...r, id: 'fixl-' + r.id, kind: 'interpret', group: 'interpret:fix-letter' }); for (const r of load('C:/wc-ai/finetune/pool-extra/fix-set_tax/interpret-train.jsonl').filter((x) => x.family === 'set_tax')) rows.push({ ...r, id: 'fixt-' + r.id, kind: 'interpret', group: 'interpret:fix-tax' }); }
if (PHASE === 4) { for (const r of load('C:/wc-ai/finetune/pool-extra/fix-letter2/interpret-train.jsonl').filter((x) => x.family === 'letter_place')) rows.push({ ...r, id: 'fixl2-' + r.id, kind: 'interpret', group: 'interpret:fix-letter2' }); }
if (PHASE >= 2) for (const r of load(PARA)) rows.push({ ...r, kind: 'interpret', group: 'interpret:gold-para' });
if (PHASE >= 2) for (const f of fs.readdirSync(POOL).filter((x) => x.endsWith('.jsonl'))) for (const r of load(path.join(POOL, f))) rows.push({ ...r, group: `${r.kind}:${r.meta?.category || r.meta?.source || r.meta?.mode || 'x'}` });

// real token lengths
const tmp = path.join(OUT, `_lens${PHASE}`); fs.writeFileSync(`${tmp}.in.jsonl`, rows.map((r) => JSON.stringify(r.messages)).join('\n'));
const py = spawnSync('C:/wc-ai/finetune/.venv/Scripts/python.exe', ['C:/wc-ai/finetune/gen2/tok_len.py', `${tmp}.in.jsonl`, `${tmp}.out.json`], { encoding: 'utf8', env: { ...process.env, CUDA_VISIBLE_DEVICES: '-1', HF_HUB_DISABLE_TELEMETRY: '1' } });
if (py.status !== 0) { console.error(py.stderr.slice(-800)); process.exit(1); }
const lens = JSON.parse(fs.readFileSync(`${tmp}.out.json`, 'utf8')); rows.forEach((r, i) => { r.tokens = lens[i]; });
fs.rmSync(`${tmp}.in.jsonl`); fs.rmSync(`${tmp}.out.json`);
const fit = rows.filter((r) => r.tokens <= MAXLEN); console.log(`rows ${rows.length}; over ${MAXLEN} tokens dropped: ${rows.length - fit.length}`);
const strip = (r) => ({ id: r.id, kind: r.kind, group: r.group, tokens: r.tokens, messages: r.messages });
const A = []; const B = []; const used = new Set(); let aTok = 0; let bTok = 0;
const give = (r, to) => { (to === 'A' ? A : B).push(r); if (to === 'A') aTok += r.tokens; else bTok += r.tokens; used.add(r.id.replace(/#2$/, '')); };
const both = (r) => { give(r, 'A'); give(r, 'B'); };
// allocate `cap` tokens PER RUN across groups by weight; alternate rows A/B so the halves are disjoint
function fillByWeight(groups, weight, capPerRun) {
  const entries = Object.entries(groups); const wsum = entries.reduce((n, [g]) => n + (weight[g] ?? 1), 0); let toggle = 0;
  for (const [g, list] of entries) {
    const share = ((weight[g] ?? 1) / wsum) * capPerRun * 2; let u = 0;
    for (const r of shuffle(list)) { if (u + r.tokens > share) break; give(r, toggle++ % 2 ? 'B' : 'A'); u += r.tokens; }
  }
}
const groupsOf = (list) => list.reduce((m, r) => ((m[r.group] = m[r.group] || []).push(r), m), {});

if (PHASE === 1) {
  const goldUnique = [...new Map(fit.filter((r) => r.group === 'interpret:gold').map((r) => [r.id, r])).values()];
  for (const r of goldUnique) { both(r); both({ ...r, id: r.id + '#2' }); } // every gold order, twice, on both GPUs
  const syn = fit.filter((r) => r.group !== 'interpret:gold'); const goldTok = aTok;
  fillByWeight(groupsOf(syn), IW, PER - goldTok);
} else if (PHASE === 4) {
  // short corrective phase on top of the phase-3 adapters: canonical letter-to-place rows (the Eyrie goes to Lady Lysa), gold slice not yet seen, fresh interpret + RFT rows not used in 2b/3, retention mix
  const used4 = new Set(['train_A2b', 'train_B2b', 'train_A3', 'train_B3'].flatMap((f) => load(path.join(OUT, f + '.jsonl')).map((r) => r.id.replace(/#(2|r)$/, ''))));
  const W4 = { mind: 0.15, narrate: 0.15, audience: 0.06, council: 0.08, director: 0.03, consolidate: 0.03 }; // millions of tokens PER RUN
  for (const [kind, m] of Object.entries(W4)) { const list = fit.filter((r) => r.kind === kind && !used4.has(r.id)); if (!list.length) { console.log('WARNING: no unused rows for', kind); continue; } fillByWeight(groupsOf(list), kind === 'mind' ? { 'mind:natural': 6 } : {}, m * 1e6); }
  const dedupe = (L) => [...new Map(L.map((r) => [r.text, r])).values()];
  fillByWeight({ 'interpret:fix-letter2': dedupe(fit.filter((r) => r.group === 'interpret:fix-letter2')) }, {}, 0.13e6);
  const fresh = fit.filter((r) => r.kind === 'interpret' && !/^interpret:(gold|gold-para|fix-letter|fix-letter2|fix-tax|letter_place)$/.test(r.group) && r.source !== 'suite-train' && !used4.has(r.id));
  fillByWeight(groupsOf(fresh), IW, 0.27e6);
  const para = fit.filter((r) => r.group === 'interpret:gold-para' && !used4.has(r.id)); if (para.length) fillByWeight({ 'interpret:gold-para': para }, {}, 0.10e6);
  for (const r of [...new Map(fit.filter((r) => r.group === 'interpret:gold').map((r) => [r.id, r])).values()].slice(120)) { give({ ...r, id: r.id + '#r' }, 'A'); give({ ...r, id: r.id + '#r' }, 'B'); }
} else if (PHASE === 3) {
  const used = new Set(['train_A2b', 'train_B2b'].flatMap((f) => load(path.join(OUT, f + '.jsonl')).map((r) => r.id.replace(/#(2|r)$/, ''))));
  const W3 = { mind: 0.35, narrate: 0.35, audience: 0.10, council: 0.15, director: 0.05, consolidate: 0.05 }; // millions of tokens PER RUN
  for (const [kind, m] of Object.entries(W3)) { const list = fit.filter((r) => r.kind === kind); if (!list.length) { console.log('WARNING: no rows for', kind); continue; } fillByWeight(groupsOf(list), kind === 'mind' ? { 'mind:natural': 6 } : {}, m * 1e6); }
  const fresh = fit.filter((r) => r.kind === 'interpret' && !/^interpret:(gold|gold-para|fix-letter|fix-tax)$/.test(r.group) && r.source !== 'suite-train' && !used.has(r.id));
  fillByWeight(groupsOf(fresh), IW, 0.50e6);
  const para = fit.filter((r) => r.group === 'interpret:gold-para' && !used.has(r.id)); if (para.length) fillByWeight({ 'interpret:gold-para': para }, {}, 0.25e6);
  const dedupe = (L) => [...new Map(L.map((r) => [r.text, r])).values()];
  fillByWeight({ 'interpret:fix-letter': dedupe(fit.filter((r) => r.group === 'interpret:fix-letter' && !used.has(r.id))) }, {}, 0.08e6); fillByWeight({ 'interpret:fix-tax': dedupe(fit.filter((r) => r.group === 'interpret:fix-tax' && !used.has(r.id))) }, {}, 0.05e6);
  for (const r of [...new Map(fit.filter((r) => r.group === 'interpret:gold').map((r) => [r.id, r])).values()].slice(60, 120)) { give({ ...r, id: r.id + '#r' }, 'A'); give({ ...r, id: r.id + '#r' }, 'B'); }
} else {
  const W = TAG === 'b' ? { mind: 0.38, narrate: 0.36, audience: 0.13, council: 0.13, director: 0.06, consolidate: 0.06 } : { mind: 0.50, narrate: 0.50, audience: 0.17, council: 0.17, director: 0.08, consolidate: 0.08 }; // millions of tokens PER RUN
  const p1 = new Set(load(path.join(OUT, 'train_A1.jsonl')).concat(load(path.join(OUT, 'train_B1.jsonl'))).map((r) => r.id.replace(/#2$/, '')));
  for (const [kind, m] of Object.entries(W)) {
    const list = fit.filter((r) => r.kind === kind); if (!list.length) { console.log('WARNING: no rows for', kind); continue; }
    fillByWeight(groupsOf(list), kind === 'mind' ? { 'mind:natural': 6 } : {}, m * 1e6);
  }
  // interpret replay: rows phase 1 did not use (fresh examples of the same skill), and the gold orders once more
  const paraRows = fit.filter((r) => r.group === 'interpret:gold-para'); if (paraRows.length) fillByWeight({ 'interpret:gold-para': paraRows }, {}, TAG === 'b' ? 0.18e6 : 0.25e6); else console.log('note: no paraphrase rows found');
  const replay = fit.filter((r) => r.kind === 'interpret' && !/^interpret:(gold|gold-para|fix-letter|fix-tax|letter_place)$/.test(r.group) && !p1.has(r.id));
  fillByWeight(groupsOf(replay), IW, TAG === 'b' ? 0.20e6 : 0.25e6);
  if (TAG === 'b') { const dedupe = (L) => [...new Map(L.map((r) => [r.text, r])).values()]; fillByWeight({ 'interpret:fix-letter': dedupe(fit.filter((r) => r.group === 'interpret:fix-letter')) }, {}, 0.10e6); fillByWeight({ 'interpret:fix-tax': dedupe(fit.filter((r) => r.group === 'interpret:fix-tax')) }, {}, 0.05e6); }
  for (const r of [...new Map(fit.filter((r) => r.group === 'interpret:gold').map((r) => [r.id, r])).values()].slice(0, TAG === 'b' ? 50 : 90)) { give({ ...r, id: r.id + '#r' }, 'A'); give({ ...r, id: r.id + '#r' }, 'B'); }
}
const devPool = fit.filter((r) => !used.has(r.id.replace(/#2$/, '')) && r.kind === (PHASE === 1 ? 'interpret' : r.kind)); const dev = shuffle(devPool).slice(0, 40);
const write = (name, list) => fs.writeFileSync(path.join(OUT, name), shuffle(list).map((r) => JSON.stringify(strip(r))).join('\n') + '\n');
write(`train_A${PHASE}${TAG}.jsonl`, A); write(`train_B${PHASE}${TAG}.jsonl`, B); if (!TAG) write('dev.jsonl', dev);
const by = (L) => L.reduce((m, r) => ((m[r.kind] = (m[r.kind] || 0) + 1), m), {});
const man = { made: new Date().toISOString(), phase: PHASE, maxlen: MAXLEN, A: { rows: A.length, tokens: aTok, byKind: by(A) }, B: { rows: B.length, tokens: bTok, byKind: by(B) }, disjointSynthetic: true };
fs.writeFileSync(path.join(OUT, `manifest${PHASE}${TAG}.json`), JSON.stringify(man, null, 1));
console.log(`phase ${PHASE}: A ${A.length} rows ${(aTok / 1e6).toFixed(2)}M tokens ${JSON.stringify(by(A))} | B ${B.length} rows ${(bTok / 1e6).toFixed(2)}M ${JSON.stringify(by(B))} | dev ${dev.length}`);
