// Paired comparison of two runs on the interpret suites (same items): who is right where, McNemar exact test, item lists.
//   node compare.mjs runA runB [--suite interpret|holdout] [--show 15]
import fs from 'node:fs';
import { REPO, HOME, RESULTS, CORPUS, SPEED, LOGS } from './paths.mjs';

const [A, B] = process.argv.slice(2, 4); const a = Object.fromEntries(process.argv.slice(4).reduce((acc, x, i, all) => (x.startsWith('--') ? [...acc, [x.slice(2), all[i + 1]]] : acc), []));
const suite = a.suite || 'interpret'; const show = Number(a.show || 12);
const load = (r) => JSON.parse(fs.readFileSync(`${RESULTS}/${r}/${suite}.json`, 'utf8'));
const ra = load(A); const rb = load(B);
const wrongA = new Map(ra.misses.map((m) => [m.id, m])); const wrongB = new Map(rb.misses.map((m) => [m.id, m]));
// items both runs covered: every id not in misses of a run counts as right for that run only if it was in its sample; use totals
const ids = new Set([...wrongA.keys(), ...wrongB.keys()]);
const onlyA = [...ids].filter((i) => wrongB.has(i) && !wrongA.has(i)); // B wrong, A right
const onlyB = [...ids].filter((i) => wrongA.has(i) && !wrongB.has(i)); // A wrong, B right
const both = [...ids].filter((i) => wrongA.has(i) && wrongB.has(i));
// exact two-sided binomial (McNemar) on discordant pairs
const n = onlyA.length + onlyB.length; const k = Math.min(onlyA.length, onlyB.length);
const choose = (nn, kk) => { let r = 1; for (let i = 1; i <= kk; i++) r = (r * (nn - kk + i)) / i; return r; };
let p = 0; for (let i = 0; i <= k; i++) p += choose(n, i) * 0.5 ** n; p = Math.min(1, 2 * p);
console.log(`${suite}: ${A} exact ${ra.exact}/${ra.total} (${(100 * ra.exact / ra.total).toFixed(1)}%)  vs  ${B} ${rb.exact}/${rb.total} (${(100 * rb.exact / rb.total).toFixed(1)}%)`);
console.log(`only ${A} right: ${onlyA.length} | only ${B} right: ${onlyB.length} | both wrong: ${both.length} | McNemar exact p = ${n ? p.toFixed(4) : 'n/a'}`);
const fmt = (m, id) => `  ${id}: "${(m.text || '').slice(0, 90)}" expect ${JSON.stringify(m.expect).slice(0, 120)}`;
console.log(`\n${B} right, ${A} wrong (${Math.min(show, onlyB.length)} of ${onlyB.length}):`); onlyB.slice(0, show).forEach((i) => console.log(fmt(wrongA.get(i), i)));
console.log(`\n${A} right, ${B} wrong (${Math.min(show, onlyA.length)} of ${onlyA.length}):`); onlyA.slice(0, show).forEach((i) => console.log(fmt(wrongB.get(i), i)));
