// Per-order pass matrix on the fair 125 across runs: which orders are missed by everyone (unlearnable / label problems), which are unstable.
//   node matrix.mjs base1 base2 -- tuned1 tuned2 ...
import fs from 'node:fs';
const split = JSON.parse(fs.readFileSync('C:/wc-ai/finetune/data/interpret-split.json', 'utf8')); const ALL = [...split.dev, ...split.holdout]; const R = 'C:/wc-ai/eval/results';
const args = process.argv.slice(2); const cut = args.indexOf('--'); const base = args.slice(0, cut); const tuned = args.slice(cut + 1);
const rd = (run, f) => JSON.parse(fs.readFileSync(`${R}/${run}/${f}.json`, 'utf8'));
const misses = (run) => { const m = new Map(); for (const x of [...rd(run, 'interpret').misses, ...rd(run, 'holdout').misses]) m.set(x.id, x); return m; };
const B = base.map(misses), T = tuned.map(misses); const info = new Map(); for (const m of [...B, ...T]) for (const [id, x] of m) info.set(id, x);
const rows = ALL.map((id) => ({ id, b: B.filter((m) => m.has(id)).length, t: T.filter((m) => m.has(id)).length }));
const allWrong = rows.filter((r) => r.b === B.length && r.t === T.length);
const tunedFix = rows.filter((r) => r.b === B.length && r.t === 0);
const tunedBreak = rows.filter((r) => r.b === 0 && r.t === T.length);
const tunedBreakSome = rows.filter((r) => r.b === 0 && r.t > 0 && r.t < T.length);
const show = (title, list) => { console.log(`\n== ${title} (${list.length})`); for (const r of list) { const x = info.get(r.id); console.log(`${r.id} [base miss ${r.b}/${B.length}, tuned miss ${r.t}/${T.length}] "${(x.text || '').slice(0, 80)}" got ${JSON.stringify(x.got).slice(0, 100)} want ${JSON.stringify(x.want || x.expect || '').slice(0, 100)}`); } };
console.log('runs base:', base.join(', '), '| tuned:', tuned.join(', '));
show('missed by EVERY run', allWrong); show('base always wrong, tuned always right', tunedFix); show('base always right, tuned always wrong', tunedBreak); show('base always right, tuned sometimes wrong', tunedBreakSome);
