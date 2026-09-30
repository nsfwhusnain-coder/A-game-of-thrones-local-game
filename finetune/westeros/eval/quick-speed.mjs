// Start a server from a spec, run speed.mjs against it, stop it.  node quick-speed.mjs --spec specs/x.json [--label l] [--tests decode,schema,...] [--drop no-mmap] [--extra "@--flag v"] [--exe path] [--reps 3]
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { startServer, stopServer, gpuUsedMiB, procMemMB, freeRamGB } from './lserve.mjs';
const a = Object.fromEntries(process.argv.slice(2).reduce((acc, x, i, all) => (x.startsWith('--') ? [...acc, [x.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]] : acc), []));
const spec = JSON.parse(fs.readFileSync(a.spec, 'utf8')); const label = a.label || spec.name;
const flagName = (n) => (n.startsWith('-') ? n : (n.length <= 5 && !n.includes('-') ? '-' + n : '--' + n));
const BOOL = new Set(['--kv-unified', '--no-mmap', '--jinja', '--cont-batching', '--metrics', '--no-warmup', '--swa-full']);
let args = [...spec.args];
for (const d of String(a.drop === true ? '' : a.drop || '').split(',').filter(Boolean).map(flagName)) { const i = args.indexOf(d); if (i >= 0) args.splice(i, BOOL.has(d) ? 1 : 2); }
// --set "-ub=1024,-ctk=q4_0": replace the value of an existing flag or append it
for (const kv of String(a.set === true ? '' : a.set || '').split(',').filter(Boolean)) { const [k, v] = kv.split('='); const i = args.indexOf(k); if (i >= 0) args[i + 1] = v; else args.push(k, v); }
if (a.extra && a.extra !== true) args.push(...String(a.extra).replace(/^@/, '').split(' ').filter(Boolean));
const exe = a.exe || spec.exe;
const s = await startServer({ exe, args, port: 8092, logFile: `C:/wc-ai/logs/speed-${label}.log`, timeoutSec: spec.loadTimeoutSec || 600 });
const load = { loadSec: +s.loadSec.toFixed(1), gpuAfterLoadMiB: s.gpuAfterLoad, ramFreeAfterLoadGB: s.ramAfterLoad, proc: procMemMB(s.pid) };
console.log(`[${label}] loaded ${JSON.stringify(load)}\n   args: ${args.join(' ')}`);
const r = spawnSync('node', ['C:/wc-ai/eval/speed.mjs', '--base', 'http://127.0.0.1:8092', '--model', spec.model || 'x', '--label', label, '--tests', a.tests || 'decode,schema,prefill,cache,conc', '--reps', String(a.reps || 3)], { stdio: 'inherit' });
const post = { gpuAfterRunMiB: gpuUsedMiB(), ramFreeAfterRunGB: freeRamGB(), proc: procMemMB(s.pid) };
fs.appendFileSync('C:/wc-ai/eval/speed-runs.jsonl', JSON.stringify({ label, exe, args, load, post, when: new Date().toISOString() }) + '\n');
console.log(`[${label}] after: ${JSON.stringify(post)}`);
await stopServer(s);
