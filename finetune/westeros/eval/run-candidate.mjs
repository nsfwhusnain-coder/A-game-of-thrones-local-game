// One command per experiment: start MY llama-server with the given flags, run the game's suites through the wire proxy,
// record load time / VRAM / RAM, stop the server. Everything lands in C:\wc-ai\eval\results\<name>\.
//
//   node run-candidate.mjs --spec C:\wc-ai\eval\specs\gemma26-64k.json [--suites holdout,mind] [--sample 30] [--name override]
//
// spec: { name, exe, args: [...llama-server args w/o --port], model: "name sent in requests", suites, sample,
//         slots: "game|none|free", concMind, extraBody: {...} }
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { startServer, stopServer, gpuUsedMiB, freeRamGB, procMemMB } from './lserve.mjs';

const a = Object.fromEntries(process.argv.slice(2).reduce((acc, x, i, all) => (x.startsWith('--') ? [...acc, [x.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]] : acc), []));
const spec = JSON.parse(fs.readFileSync(a.spec, 'utf8'));
const name = a.name || spec.name; const port = Number(a.port || spec.port || 8090);
const dir = path.join('C:/wc-ai/eval/results', name); fs.mkdirSync(dir, { recursive: true });
const exe = spec.exe || 'C:/llamacpp/llama-server.exe';
console.log(`### ${name}: starting ${path.basename(path.dirname(exe))}/llama-server ${spec.args.join(' ')}`);
const s = await startServer({ exe, args: spec.args, port, logFile: path.join(dir, 'server.log'), timeoutSec: spec.loadTimeoutSec || 600 });
const ver = spawnSync(exe, ['--version'], { encoding: 'utf8' }); const verLine = `${ver.stdout || ''}${ver.stderr || ''}`.split('\n').find((l) => /version/.test(l)) || '';
const load = { loadSec: +s.loadSec.toFixed(1), gpuBeforeMiB: s.gpuBefore, gpuAfterLoadMiB: s.gpuAfterLoad, ramFreeBeforeGB: s.ramBefore, ramFreeAfterLoadGB: s.ramAfterLoad, proc: procMemMB(s.pid), version: verLine.trim() };
console.log('load:', JSON.stringify(load));
let code = 0;
try {
  const info = JSON.stringify({ ...load, args: spec.args, exe, note: spec.note || '' });
  const bench = ['C:/wc-ai/eval/wc-bench.mjs', '--base', `http://127.0.0.1:${port}`, '--model', spec.model || name, '--label', name,
    '--suites', a.suites || spec.suites || 'interpret,holdout,mind,narrate', '--slots', a.slots || spec.slots || 'free', '--conc-mind', String(spec.concMind ?? 2), '--server-info', info];
  const sample = a.sample ?? spec.sample; if (sample) bench.push('--sample', String(sample));
  if (spec.extraBody) bench.push('--extra-body', JSON.stringify(spec.extraBody));
  if (a.append) bench.push('--append');
  if (a.repo) bench.push('--repo', a.repo);
  // watchdog: no new wire line for 300 s while the bench runs = the server is hung (llama.cpp #28280) -> kill the bench, record it
  const wire = path.join(dir, 'wire.jsonl'); let lastSize = -1; let lastChange = Date.now(); let hung = false;
  const child = spawn('node', bench, { stdio: 'inherit', cwd: 'C:/wc-ai/eval' });
  const wd = setInterval(() => {
    let size = 0; try { size = fs.statSync(wire).size; } catch { /* not yet */ }
    if (size !== lastSize) { lastSize = size; lastChange = Date.now(); }
    else if (Date.now() - lastChange > (spec.stallSec || 300) * 1000) { hung = true; console.log('!!! WATCHDOG: no model call finished for 5 min — server hung; killing the run'); clearInterval(wd); try { execFileSync('powershell', ['-NoProfile', '-Command', `Stop-Process -Id ${child.pid} -Force`]); } catch { /* gone */ } }
  }, 15000);
  code = await new Promise((res) => child.on('exit', (c) => res(c ?? 1))); clearInterval(wd);
  if (hung) { code = 99; fs.writeFileSync(path.join(dir, 'HUNG.txt'), `server hung at ${new Date().toISOString()} (no wire activity for 5 min)
`); }
  const after = { gpuAfterRunMiB: gpuUsedMiB(), ramFreeAfterRunGB: freeRamGB(), proc: procMemMB(s.pid) };
  fs.writeFileSync(path.join(dir, 'load.json'), JSON.stringify({ ...load, ...after }, null, 1));
  console.log('after run:', JSON.stringify(after));
} finally { await stopServer(s); }
process.exit(code);
