// Fair scoring of interpret runs: ONLY the 125 orders no training row was built from (100 dev = suite index%3==0, plus the 25 holdout),
// with a paired exact (McNemar) test against a reference run. The other 200 suite orders are in the fine-tuning data, so a tuned model's
// score on all 300 is inflated and must not be reported as its quality.
//   node fair.mjs <referenceRun> [otherRun ...]      (runs are C:/wc-ai/eval/results/<run>; each needs a FULL interpret + holdout run)
import fs from 'node:fs';

const split = JSON.parse(fs.readFileSync('C:/wc-ai/finetune/data/interpret-split.json', 'utf8'));
const DEV = split.dev; const HOLD = split.holdout; const ALL = [...DEV, ...HOLD]; const R = 'C:/wc-ai/eval/results';
const rd = (run, f) => { try { return JSON.parse(fs.readFileSync(`${R}/${run}/${f}.json`, 'utf8')); } catch { return null; } };
const wrongOf = (run) => {
  const i = rd(run, 'interpret'); const h = rd(run, 'holdout');
  if (!i || !h) return { err: 'missing interpret.json or holdout.json' };
  if (i.total !== 300 || h.total !== 25) return { err: `not a full run (interpret ${i.total}/300, holdout ${h.total}/25)` };
  return { wrong: new Set([...i.misses, ...h.misses].map((m) => m.id)), misses: new Map([...i.misses, ...h.misses].map((m) => [m.id, m])) };
};
const choose = (n, k) => { let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i; return r; };
const mcnemar = (b, c) => { const n = b + c; if (!n) return 1; const k = Math.min(b, c); let p = 0; for (let i = 0; i <= k; i++) p += choose(n, i) * 0.5 ** n; return Math.min(1, 2 * p); };
const [ref, ...others] = process.argv.slice(2);
const R0 = wrongOf(ref); if (R0.err) { console.log(`${ref}: ${R0.err}`); process.exit(1); }
const score = (w) => ({ dev: DEV.filter((id) => !w.has(id)).length, hold: HOLD.filter((id) => !w.has(id)).length });
const line = (run, w) => { const s = score(w); const t = s.dev + s.hold; return `${run.padEnd(28)} dev ${s.dev}/${DEV.length} | holdout ${s.hold}/${HOLD.length} | fair total ${t}/${ALL.length} = ${(100 * t / ALL.length).toFixed(1)} %`; };
console.log(line(ref + ' (ref)', R0.wrong));
for (const run of others) {
  const O = wrongOf(run); if (O.err) { console.log(`${run}: ${O.err}`); continue; }
  console.log(line(run, O.wrong));
  const refWrongOnly = ALL.filter((id) => R0.wrong.has(id) && !O.wrong.has(id)); // other right, ref wrong
  const otherWrongOnly = ALL.filter((id) => !R0.wrong.has(id) && O.wrong.has(id)); // ref right, other wrong
  console.log(`   ${run} fixes ${refWrongOnly.length} of ${ref}'s misses, breaks ${otherWrongOnly.length} it had right | McNemar exact p = ${mcnemar(otherWrongOnly.length, refWrongOnly.length).toFixed(4)}`);
  for (const id of otherWrongOnly.slice(0, 6)) { const m = O.misses.get(id); console.log(`     broke ${id}: "${(m.text || '').slice(0, 70)}" got ${JSON.stringify(m.got).slice(0, 110)}`); }
}
