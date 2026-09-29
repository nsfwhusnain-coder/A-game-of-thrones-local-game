// Collate results/*/summary.json (+ load.json, speed/*.json) into one markdown comparison.
//   node aggregate.mjs [--out C:\wc-ai\reports\results-table.md] [--only substring,substring]
import fs from 'node:fs';
import path from 'node:path';
import { REPO, HOME, RESULTS, CORPUS, SPEED, LOGS } from './paths.mjs';

const a = Object.fromEntries(process.argv.slice(2).reduce((acc, x, i, all) => (x.startsWith('--') ? [...acc, [x.slice(2), all[i + 1]]] : acc), []));
const only = a.only ? a.only.split(',') : null;
const R = RESULTS; const rows = [];
for (const d of fs.readdirSync(R)) {
  if (only && !only.some((o) => d.includes(o))) continue;
  const f = path.join(R, d, 'summary.json'); if (!fs.existsSync(f)) continue;
  const s = JSON.parse(fs.readFileSync(f, 'utf8')); const lf = path.join(R, d, 'load.json'); const load = fs.existsSync(lf) ? JSON.parse(fs.readFileSync(lf, 'utf8')) : (s.serverInfo || {});
  const sp = path.join(SPEED, `${d}.json`); const speed = fs.existsSync(sp) ? JSON.parse(fs.readFileSync(sp, 'utf8')).results : null;
  rows.push({ d, s, load, speed });
}
const f1 = (x) => (x == null ? '—' : typeof x === 'number' ? (Number.isInteger(x) ? String(x) : x.toFixed(1)) : x);
const line = (cells) => `| ${cells.join(' | ')} |`;
const out = [];
out.push('## Quality (game gates: interpret ≥95 %, mind ≥85 %, narrate first-try ≥90 %, foreign script 0)', '');
out.push(line(['run', 'commit', 'interpret exact', 'holdout exact', 'clarify %', 'mind in-char', 'mind fallbacks', 'narrate 1st-try', 'narrate plain', 'foreign', 'wall min']));
out.push(line(Array(11).fill('---')));
for (const { d, s } of rows) {
  const S = s.suites || {}; const t = s.telemetry || {};
  out.push(line([d, s.commit, S.interpret ? `${S.interpret.exactPct} % (n=${S.interpret.n})` : '—', S.holdout ? `${S.holdout.exactPct} % (n=${S.holdout.n})` : '—', S.interpret ? S.interpret.clarifyPct : '—',
    S.mind ? `${S.mind.inCharPct} % (n=${S.mind.n})` : '—', S.mind ? `${S.mind.fallbackCalls}` : '—', S.narrate ? `${S.narrate.firstTryPct} % (${S.narrate.stories} st.)` : '—', S.narrate ? `${S.narrate.plainPct} %` : '—', f1(s.foreignScriptInReplies), f1((s.wallSec || 0) / 60)]));
}
out.push('', '## Per-call latency in the quality runs (ms; wire proxy, game concurrency; noisy — see speed table for clean numbers)', '');
out.push(line(['run', 'call', 'n', 'retries', 'trunc', 'p50', 'p95', 'ttft p50', 'prompt mean/max', 'cached', 'out mean/max', 'gen t/s', 'prefill t/s']));
out.push(line(Array(13).fill('---')));
for (const { d, s } of rows) for (const [k, t] of Object.entries(s.wire?.kinds || {})) out.push(line([d, k, t.n, t.retries, t.truncated, f1(t.total_p50), f1(t.total_p95), f1(t.ttft_p50), `${f1(t.prompt_mean)}/${f1(t.prompt_max)}`, f1(t.cached_mean), `${f1(t.completion_mean)}/${f1(t.completion_max)}`, f1(t.gen_tps_mean), f1(t.prefill_tps_mean)]));
out.push('', '## Resources', '');
out.push(line(['run', 'server build', 'load s', 'GPU MiB after load', 'GPU peak MiB', 'RAM free after load GB', 'proc working set MB']));
out.push(line(Array(7).fill('---')));
for (const { d, s, load } of rows) out.push(line([d, (load.version || '').replace('version: ', ''), f1(load.loadSec), f1(load.gpuAfterLoadMiB), f1(s.gpuPeakMiB), f1(load.ramFreeAfterLoadGB), f1(load.proc?.workingSetMB)]));
if (rows.some((r) => r.speed)) {
  out.push('', '## Clean speed (eval/speed.mjs, real game prompts, quiet machine)', '');
  out.push(line(['run', 'decode free t/s', 'interpret p50 ms', 'mind p50 ms', 'narrate p50 ms', 'narrate out tok', 'narrate gen t/s', 'prefill t/s (cold)', 'two minds pinned ms', 'two minds unpinned ms', 'one mind ms']));
  out.push(line(Array(11).fill('---')));
  for (const { d, speed } of rows) if (speed) { const sc = speed.schema || {}; out.push(line([d, f1(speed.decode?.gen_tps), f1(sc.interpret?.total_p50), f1(sc.mind?.total_p50), f1(sc.narrate?.total_p50), f1(sc.narrate?.out_mean), f1(sc.narrate?.gen_tps), f1(speed.prefill?.interpret?.prefill_tps), f1(speed.conc?.pinned_slot1_both?.wall_ms), f1(speed.conc?.unpinned?.wall_ms), f1(speed.conc?.single_ms)])); }
}
const text = out.join('\n') + '\n'; if (a.out) { fs.mkdirSync(path.dirname(a.out), { recursive: true }); fs.writeFileSync(a.out, text); } console.log(text);
