// Assemble the multi-task fine-tuning set from the pools: interpret (engine labels) + mind / narrate / audience / council / director /
// consolidate (filtered self-distillation). Token lengths come from the real Gemma 4 tokenizer (tok_len.py, CPU only).
//   node assemble.mjs --budget 6500000 --maxlen 4096 --out C:/wc-ai/finetune/final --seed 11 [--quota interpret=0.5,mind=0.17,...]
// Output: train.jsonl (messages rows), dev.jsonl (held-out rows for loss curves only), manifest.json (what is in it, and why).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';

const a = Object.fromEntries(process.argv.slice(2).reduce((acc, x, i, all) => (x.startsWith('--') ? [...acc, [x.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]] : acc), []));
const BUDGET = Number(a.budget || 6.5e6); const MAXLEN = Number(a.maxlen || 4096); const OUT = a.out || 'C:/wc-ai/finetune/final'; const SEED = Number(a.seed || 11);
const POOL = a.pool || 'C:/wc-ai/finetune/pool'; const INTERP = a.interpret || 'C:/wc-ai/finetune/data2/interpret-train.jsonl';
// share of the TOKEN budget per kind (mind is near its gate already; interpret and narrate are the furthest from theirs)
const QUOTA = { interpret: 0.50, mind: 0.16, narrate: 0.17, audience: 0.045, council: 0.045, director: 0.02, consolidate: 0.02, ...Object.fromEntries(String(a.quota || '').split(',').filter(Boolean).map((x) => x.split('=')).map(([k, v]) => [k, Number(v)])) };
const load = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
let s = SEED >>> 0; const rnd = () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const shuffle = (arr) => arr.map((x) => [rnd(), x]).sort((p, q) => p[0] - q[0]).map((p) => p[1]);

// ── gather ──
const rows = [];
for (const r of load(INTERP)) rows.push({ ...r, kind: 'interpret', group: r.source === 'suite-train' ? 'interpret:gold' : `interpret:${String(r.family).replace(/^multi:.*/, 'multi')}` });
for (const f of fs.existsSync(POOL) ? fs.readdirSync(POOL).filter((x) => x.endsWith('.jsonl')) : []) for (const r of load(path.join(POOL, f))) rows.push({ ...r, group: `${r.kind}:${r.meta?.category || r.meta?.source || r.meta?.mode || 'x'}` });
console.log('rows gathered:', rows.length, Object.entries(rows.reduce((m, r) => ((m[r.kind] = (m[r.kind] || 0) + 1), m), {})).map(([k, v]) => `${k} ${v}`).join(' | '));

// ── token lengths (real tokenizer) ──
const tmp = path.join(OUT, '_lens'); fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(`${tmp}.in.jsonl`, rows.map((r) => JSON.stringify(r.messages)).join('\n'));
const py = spawnSync('C:/wc-ai/finetune/.venv/Scripts/python.exe', ['C:/wc-ai/finetune/gen2/tok_len.py', `${tmp}.in.jsonl`, `${tmp}.out.json`], { encoding: 'utf8', env: { ...process.env, CUDA_VISIBLE_DEVICES: '-1', HF_HUB_DISABLE_TELEMETRY: '1' } });
if (py.status !== 0) { console.error(py.stderr.slice(-800)); process.exit(1); }
const lens = JSON.parse(fs.readFileSync(`${tmp}.out.json`, 'utf8')); rows.forEach((r, i) => { r.tokens = lens[i]; });
const fit = rows.filter((r) => r.tokens <= MAXLEN); console.log(`over ${MAXLEN} tokens (dropped): ${rows.length - fit.length}`);

// ── select: per kind, up to its share of the token budget; inside a kind, round-robin over groups so no family swamps the rest ──
// relative weights of the interpret families (of the interpret token share). Gold orders (the game's human-written training orders) are ALL taken.
const IW = { 'interpret:gold': 30, 'interpret:story': 7, 'interpret:story_stay': 2.5, 'interpret:story_holds': 0.5, 'interpret:clarify_thin': 2, 'interpret:clarify_vague2': 2.5, 'interpret:clarify_person': 2, 'interpret:clarify_place': 2, 'interpret:clarify_host': 1.5,
  'interpret:send_person': 7, 'interpret:march_host': 6, 'interpret:letter': 5, 'interpret:letter_place': 3, 'interpret:fund_works': 3.5, 'interpret:raise_levies': 2.5, 'interpret:set_tax': 2.5, 'interpret:set_dues': 1.5, 'interpret:hire_men': 1.5,
  'interpret:hire_officer': 2, 'interpret:appoint_office': 1.5, 'interpret:declare_war': 1.5, 'interpret:gather_secrets': 1.5, 'interpret:plant_spy': 1, 'interpret:feast': 1.5, 'interpret:send_gift': 1.5, 'interpret:disband_host': 2,
  'interpret:halt_host': 2.5, 'interpret:merge_hosts': 2, 'interpret:grant_holding': 0.5, 'interpret:judge_prisoner': 1.5, 'interpret:call_banners': 1.5, 'interpret:multi': 3 };
const byKind = {}; for (const r of fit) (byKind[r.kind] = byKind[r.kind] || []).push(r);
const picked = []; const report = {};
for (const [kind, list] of Object.entries(byKind)) {
  const cap = (QUOTA[kind] ?? 0) * BUDGET; const groups = {}; for (const r of shuffle(list)) (groups[r.group] = groups[r.group] || []).push(r);
  // gold interpret orders count twice (as in the first dataset): they carry the game's human conventions
  let used = 0; const take = [];
  if (kind === 'interpret') {
    // the game's human-written gold orders: every one, twice (the generator already lists each twice under one id: dedupe first)
    const goldUnique = [...new Map((groups['interpret:gold'] || []).map((r) => [r.id, r])).values()];
    for (const r of goldUnique) { take.push(r, { ...r, id: r.id + '#2' }); used += 2 * r.tokens; }
    const others = Object.entries(groups).filter(([g]) => g !== 'interpret:gold'); const wsum = others.reduce((n, [g]) => n + (IW[g] ?? 1), 0); const rest = Math.max(0, cap - used);
    for (const [g, list2] of others) { const share = ((IW[g] ?? 1) / wsum) * rest; let u = 0; for (const r of list2) { if (u + r.tokens > share) break; take.push(r); u += r.tokens; } used += u; }
    // a family short of rows leaves its share unspent: hand the rest to the other families at random
    const have = new Set(take.map((r) => r.id)); const spare = shuffle(others.flatMap(([, l]) => l.filter((r) => !have.has(r.id))));
    for (const r of spare) { if (used + r.tokens > cap) break; take.push(r); used += r.tokens; }
    picked.push(...take); report[kind] = { available: list.length, availableTokens: list.reduce((n, r) => n + r.tokens, 0), rows: take.length, tokens: used, quotaTokens: Math.round(cap), byGroup: take.reduce((m, r) => ((m[r.group] = (m[r.group] || 0) + 1), m), {}) }; continue;
  }
  const order = Object.keys(groups).sort(); const seen = new Set();
  outer: for (let round = 0; ; round++) {
    let any = false;
    for (const g of order) { const r = groups[g][round]; if (!r) continue; any = true; if (used + r.tokens > cap) continue; take.push(r); used += r.tokens; if (g === 'interpret:gold' && used + r.tokens <= cap) { take.push({ ...r, id: r.id + '#2' }); used += r.tokens; } }
    if (!any || used >= cap * 0.999) break outer;
  }
  picked.push(...take); report[kind] = { available: list.length, availableTokens: list.reduce((n, r) => n + r.tokens, 0), rows: take.length, tokens: used, quotaTokens: Math.round(cap), byGroup: take.reduce((m, r) => ((m[r.group] = (m[r.group] || 0) + 1), m), {}) };
}
// a small dev slice (never trained on): every 40th row, for loss curves only. The real evaluation is the game's own suites.
const all = shuffle(picked); const dev = all.filter((_, i) => i % 40 === 0); const devIds = new Set(dev.map((r) => r.id)); const train = all.filter((r) => !devIds.has(r.id));
const strip = (r) => ({ id: r.id, kind: r.kind, group: r.group, tokens: r.tokens, messages: r.messages });
fs.writeFileSync(path.join(OUT, 'train.jsonl'), train.map((r) => JSON.stringify(strip(r))).join('\n') + '\n'); fs.writeFileSync(path.join(OUT, 'dev.jsonl'), dev.map((r) => JSON.stringify(strip(r))).join('\n') + '\n');
const sha = crypto.createHash('sha256').update(fs.readFileSync(path.join(OUT, 'train.jsonl'))).digest('hex').slice(0, 16);
const total = train.reduce((n, r) => n + r.tokens, 0);
const manifest = { made: new Date().toISOString(), budget: BUDGET, maxlen: MAXLEN, seed: SEED, trainRows: train.length, devRows: dev.length, trainTokens: total, meanTokens: Math.round(total / train.length), sha256: sha, quota: QUOTA, kinds: report,
  notes: 'interpret labels = engine ground truth; every other kind = a model answer the game\'s own validators accepted on the first try + leak filters + oracle; dev/holdout orders and the suite\'s mind actor/situation pairs and narrate games are excluded; no book text.' };
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
for (const f of ['_lens.in.jsonl', '_lens.out.json']) fs.rmSync(path.join(OUT, f), { force: true });
console.log(`\ntrain ${train.length} rows, ${(total / 1e6).toFixed(2)}M tokens (mean ${manifest.meanTokens}) | dev ${dev.length} | sha ${sha}`);
for (const [k, v] of Object.entries(report)) console.log(`  ${k.padEnd(12)} rows ${String(v.rows).padStart(5)} (${(v.tokens / 1e6).toFixed(2)}M of ${(v.quotaTokens / 1e6).toFixed(2)}M quota; ${v.available} available)`);
