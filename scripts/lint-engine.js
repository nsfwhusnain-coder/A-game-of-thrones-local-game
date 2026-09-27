// The engine must be deterministic (docs/gdd/15-qa-tooling.md §4): no Math.random, no clock, no crypto in the files
// that decide what happens. Their dice are the save's own (public/js/engine/rng.js); their ids come from the save's
// counter (engine/ids.js). A line may opt out with a `lint-allow: <reason>` comment (a new game's seed, a timestamp
// that only labels a save). Engine files are also shared with the browser, so they may not import node: modules.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIRS = ['public/js/engine', 'public/js/shared', 'server/turn'];
const FORBIDDEN = [
  [/\bMath\.random\s*\(/, 'Math.random — use random() from engine/rng.js (the save\'s dice)'],
  [/\bDate\.now\s*\(/, 'Date.now — the engine\'s time is the game date (engine/time.js)'],
  [/\bnew Date\s*\(/, 'new Date — the engine\'s time is the game date (engine/time.js)'],
  [/\bperformance\.now\s*\(/, 'performance.now — not in engine code'],
  [/\brandomBytes\s*\(|\bgetRandomValues\s*\(/, 'crypto randomness — use nextId() or the dice'],
  [/from\s+['"]node:/, 'a node: import — engine files run in the browser too'],
];

const files = [];
const walk = (d) => { if (!fs.existsSync(d)) return; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(m?js)$/.test(e.name)) files.push(p); } };
for (const d of DIRS) walk(path.join(ROOT, d));

let problems = 0;
for (const f of files) {
  const lines = fs.readFileSync(f, 'utf8').split('\n'); let inBlock = false;
  lines.forEach((raw, i) => {
    let code = raw;
    // drop comments (block comments that span lines, and a line comment's tail) before looking at the code
    if (inBlock) { const e = code.indexOf('*/'); if (e < 0) return; code = code.slice(e + 2); inBlock = false; }
    code = code.replace(/\/\*.*?\*\//g, '');
    const b = code.indexOf('/*'); if (b >= 0) { inBlock = true; code = code.slice(0, b); }
    code = code.replace(/(^|[^:'"`\\])\/\/.*$/, '$1');
    if (/lint-allow:/.test(raw)) return;
    for (const [re, why] of FORBIDDEN) if (re.test(code)) { problems++; console.log(`✖ ${path.relative(ROOT, f)}:${i + 1}: ${why}\n    ${raw.trim().slice(0, 140)}`); }
  });
}
console.log(problems ? `${problems} determinism problem(s) in engine code` : `✔ ${files.length} engine files are deterministic (no Math.random, clock or crypto)`);
process.exit(problems ? 1 : 0);
