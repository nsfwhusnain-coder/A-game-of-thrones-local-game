// Start MY llama-server from a spec, run a list of generation jobs against it one after another, stop the server.
//   node serve-run.mjs --spec C:/wc-ai/eval/specs/gemma12-gen.json --jobs jobs.json
// jobs.json: [{ "name": "mind-suite", "args": ["--kind","mind","--gen","suite","--n","700", ...] }]  (rft.mjs args; --base is added)
// Run it through chain.mjs so the owner's live llama-swap is protected. Only ever stops the server it started.
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { startServer, stopServer } from '../../eval/lserve.mjs';

const a = Object.fromEntries(process.argv.slice(2).reduce((acc, x, i, all) => (x.startsWith('--') ? [...acc, [x.slice(2), all[i + 1]]] : acc), []));
const spec = JSON.parse(fs.readFileSync(a.spec, 'utf8')); const jobs = JSON.parse(fs.readFileSync(a.jobs, 'utf8')); const port = Number(spec.port || 8090);
const s = await startServer({ exe: spec.exe, args: spec.args, port, logFile: `C:/wc-ai/logs/gen-server-${spec.name}.log`, timeoutSec: spec.loadTimeoutSec || 600 });
console.log(`server up in ${s.loadSec.toFixed(1)}s, GPU ${s.gpuAfterLoad} MiB`);
try {
  for (const j of jobs) {
    const log = `C:/wc-ai/logs/gen-${j.name}.log`; const out = fs.openSync(log, 'w'); const t0 = Date.now();
    console.log(`>>> ${j.name}`);
    const code = await new Promise((res) => { const c = spawn('node', [j.script || 'rft.mjs', ...j.args, '--base', `http://127.0.0.1:${port}`, ...(j.script ? [] : ['--teacher', spec.model || 'gemma4-12b'])], { cwd: 'C:/wc-ai/finetune/gen2', stdio: ['ignore', out, out] }); c.on('exit', (x) => res(x ?? 1)); });
    console.log(`<<< ${j.name}: exit ${code}, ${((Date.now() - t0) / 60000).toFixed(1)} min (log ${log})`);
  }
} finally { await stopServer(s); }
