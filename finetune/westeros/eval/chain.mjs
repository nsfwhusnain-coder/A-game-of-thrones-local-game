// Run a list of local test steps strictly one after another (one GPU job at a time), protecting the owner's live llama-swap.
//   node chain.mjs steps.json      steps.json = [{ "name": "x", "args": ["run-candidate.mjs", "--spec", ...], "cmd": "node", "cwd": "C:/wc-ai/eval" }, ...]
// Before each step: the GPU must be idle (<= 1600 MiB), the owner's llama-swap (:8033) must have no model loaded and no llama-server
// that is not mine may exist. While a step runs the same is checked every 10 s: if the owner's model loads (or a foreign llama-server
// appears, twice in a row) the step's process tree — and ONLY that tree — is killed, GUARD_TRIPPED.txt is written and the chain stops.
// It never touches a process it did not start. Progress: C:/wc-ai/logs/chain-state.json, step output: C:/wc-ai/logs/chain-<n>-<name>.log
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import { gpuUsedMiB } from './lserve.mjs';

const LOG = 'C:/wc-ai/logs'; const PIDS = `${LOG}/lserve.pids.json`; const STATE = `${LOG}/chain-state.json`; const FLAG = `${LOG}/GUARD_TRIPPED.txt`;
const steps = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const mine = () => { try { return Object.keys(JSON.parse(fs.readFileSync(PIDS, 'utf8'))).map(Number); } catch { return []; } };
const swapRunning = () => new Promise((res) => {
  const r = http.get({ host: '127.0.0.1', port: 8033, path: '/running', timeout: 3000 }, (x) => { let b = ''; x.on('data', (d) => (b += d)); x.on('end', () => { try { res(JSON.parse(b).running || []); } catch { res([]); } }); });
  r.on('error', () => res([])); r.on('timeout', () => { r.destroy(); res([]); });
});
const serverPids = () => { try { const o = execFileSync('powershell', ['-NoProfile', '-Command', "@(Get-Process llama-server -ErrorAction SilentlyContinue | ForEach-Object { $_.Id }) -join ','"], { encoding: 'utf8' }).trim(); return o ? o.split(',').map(Number) : []; } catch { return []; } };
const foreign = () => { const pids = serverPids(); const m = mine(); return pids.filter((p) => !m.includes(p)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const state = { started: new Date().toISOString(), finished: null, tripped: false, steps: steps.map((s) => ({ name: s.name, status: 'pending' })) };
const save = () => fs.writeFileSync(STATE, JSON.stringify(state, null, 1));
const idle = async () => { const g = gpuUsedMiB(); const run = await swapRunning(); const f = foreign(); return { ok: (g ?? 0) <= 1600 && !run.length && !f.length, g, run, f }; };
const killTree = (pid) => { try { execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* already gone */ } };
const trip = (why, child) => {
  if (child) killTree(child.pid);
  for (const p of mine()) { try { execFileSync('powershell', ['-NoProfile', '-Command', `Stop-Process -Id ${p} -Force -ErrorAction SilentlyContinue`]); } catch { /* gone */ } }
  fs.writeFileSync(PIDS, '{}'); fs.writeFileSync(FLAG, `${new Date().toISOString()} ${why}\n`);
  state.tripped = true; state.finished = new Date().toISOString(); save(); console.log('GUARD TRIPPED:', why); process.exit(3);
};

// one chain at a time: queued chains wait on a lock (pid file); a jittered re-check settles a simultaneous start
const LOCK = `${LOG}/chain.lock`; const pidAlive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
for (;;) {
  await sleep(Math.random() * 4000);
  const held = fs.existsSync(LOCK) ? Number(fs.readFileSync(LOCK, 'utf8')) : 0;
  if (held && held !== process.pid && pidAlive(held)) { await sleep(15000); continue; }
  fs.writeFileSync(LOCK, String(process.pid)); await sleep(1500);
  if (Number(fs.readFileSync(LOCK, 'utf8')) === process.pid) break;
}
process.on('exit', () => { try { if (Number(fs.readFileSync(LOCK, 'utf8')) === process.pid) fs.rmSync(LOCK); } catch { /* gone */ } });
if (fs.existsSync(FLAG)) fs.rmSync(FLAG);
save();
for (let i = 0; i < steps.length; i++) {
  const st = steps[i]; const rec = state.steps[i];
  // wait (up to 30 min) for a quiet machine
  let q = await idle(); const t0 = Date.now();
  while (!q.ok && Date.now() - t0 < 30 * 60 * 1000) { rec.status = `waiting: gpu ${q.g} MiB, swap running ${JSON.stringify(q.run)}, foreign servers ${q.f}`; save(); await sleep(30000); q = await idle(); }
  if (!q.ok) { rec.status = 'aborted: machine never went idle'; state.finished = new Date().toISOString(); save(); process.exit(4); }
  rec.status = 'running'; rec.start = new Date().toISOString(); save();
  const logFile = `${LOG}/chain-${i + 1}-${st.name}.log`; const out = fs.openSync(logFile, 'w');
  const child = spawn(st.cmd || 'node', st.args, { cwd: st.cwd || 'C:/wc-ai/eval', stdio: ['ignore', out, out], windowsHide: true });
  let timedOut = false; const to = st.timeoutMin ? setTimeout(() => { timedOut = true; killTree(child.pid); fs.writeFileSync(PIDS, '{}'); }, st.timeoutMin * 60000) : null;
  let strikes = 0;
  const guard = setInterval(async () => {
    const run = await swapRunning(); const f = foreign();
    if (run.length || f.length) { strikes++; if (strikes >= 2) { clearInterval(guard); trip(`owner activity during "${st.name}": swap running ${JSON.stringify(run)}, foreign llama-server ${f}`, child); } } else strikes = 0;
  }, 10000);
  const code = await new Promise((res) => child.on('exit', (c) => res(c ?? 1)));
  clearInterval(guard); if (to) clearTimeout(to);
  rec.status = timedOut ? `timeout after ${st.timeoutMin} min (killed)` : code === 0 ? 'done' : `exit ${code}`; rec.end = new Date().toISOString(); rec.log = logFile; save();
  await sleep(4000); // let VRAM drain before the next idle check
}
state.finished = new Date().toISOString(); save(); console.log('chain finished');
