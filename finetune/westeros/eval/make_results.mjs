// Compile the published result tables from the raw run folders (C:/wc-ai/eval/results/<run>/*.json) — numbers are read, never typed.
//   node make_results.mjs [--out C:/wc-ai/reports/publish]     -> RESULTS-tables.md, runs.json
import fs from 'node:fs';
import path from 'node:path';

const a = Object.fromEntries(process.argv.slice(2).reduce((acc, x, i, all) => (x.startsWith('--') ? [...acc, [x.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]] : acc), []));
const OUT = a.out || 'C:/wc-ai/reports/publish'; fs.mkdirSync(OUT, { recursive: true });
const R = 'C:/wc-ai/eval/results';
const split = JSON.parse(fs.readFileSync('C:/wc-ai/finetune/data/interpret-split.json', 'utf8')); const DEV = split.dev; const HOLD = split.holdout;
const rd = (run, f) => { try { return JSON.parse(fs.readFileSync(`${R}/${run}/${f}.json`, 'utf8')); } catch { return null; } };
const pct = (x, n, d = 1) => (n ? (100 * x / n).toFixed(d) + ' %' : '–');

// label -> { i: interpret+holdout run, m: mind run, n: narrate run, v: voices run, note }
const cfgFile = a.config || 'C:/wc-ai/reports/results_config.json';
const RUNS = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));

function fair(run) {
  const i = rd(run, 'interpret'); const h = rd(run, 'holdout'); if (!i || !h || i.total !== 300 || h.total !== 25) return null;
  const wrong = new Set([...i.misses, ...h.misses].map((m) => m.id));
  return { dev: DEV.filter((id) => !wrong.has(id)).length, hold: HOLD.filter((id) => !wrong.has(id)).length, wrong };
}
const rows = []; const out = [];
for (const r of RUNS) {
  const row = { label: r.label, note: r.note || '' };
  const f = r.i && fair(r.i); const i = r.i && rd(r.i, 'interpret'); const h = r.i && rd(r.i, 'holdout');
  if (f) { row.fair125 = f.dev + f.hold; row.fairPct = +(100 * (f.dev + f.hold) / 125).toFixed(1); row.dev100 = f.dev; row.holdout25 = f.hold; row.interpret300 = i.exact; row.clarifyPct = +(100 * (i.clarified + h.clarified) / 325).toFixed(1); }
  const m = r.m && rd(r.m, 'mind'); if (m) { row.mindInChar = m.inCharacter; row.mindTotal = m.total; row.mindPct = +(100 * m.inCharacter / m.total).toFixed(1); row.mindFallbacks = m.via && typeof m.via === 'object' ? m.via.fallback : undefined; }
  const n = r.n && rd(r.n, 'narrate'); if (n) { row.narrateFirstTry = n.firstTry; row.narrateStories = n.stories; row.narratePct = +(100 * n.firstTry / n.stories).toFixed(1); row.narratePlain = n.plain; row.narrateFaults = n.faults; }
  const v = r.v && rd(r.v, 'voices'); if (v) { row.voices = Object.fromEntries(Object.entries(v.per).map(([k, x]) => [k, `${x.firstTry}/${x.n}`])); row.voicesFirstTry = Object.values(v.per).reduce((s, x) => s + x.firstTry, 0); row.voicesN = Object.values(v.per).reduce((s, x) => s + x.n, 0); }
  rows.push(row);
}
fs.writeFileSync(path.join(OUT, 'runs.json'), JSON.stringify(rows, null, 1));

const line = (cells) => `| ${cells.join(' | ')} |`;
out.push('| run | interpret, fair 125 (dev 100 + holdout 25) | clarify | mind in character | mind fallbacks | narrate first try | voices first try (audience / council / director / consolidate) |', '|---|---|---|---|---|---|---|');
for (const r of rows) out.push(line([r.label, r.fair125 != null ? `**${r.fair125}/125 = ${r.fairPct} %** (dev ${r.dev100}, holdout ${r.holdout25}/25)` : '–', r.clarifyPct != null ? r.clarifyPct + ' %' : '–', r.mindPct != null ? `${r.mindInChar}/${r.mindTotal} = ${r.mindPct} %` : '–', r.mindFallbacks ?? '–', r.narratePct != null ? `${r.narrateFirstTry}/${r.narrateStories} = ${r.narratePct} %` : '–', r.voices ? `${r.voices.audience} / ${r.voices.council} / ${r.voices.director} / ${r.voices.consolidate}` : '–']));
fs.writeFileSync(path.join(OUT, 'RESULTS-tables.md'), out.join('\n') + '\n');
console.log(out.join('\n'));
