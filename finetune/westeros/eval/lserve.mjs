// Start / stop MY OWN llama-server instances for tuning sweeps. Only ever stops a PID this script started
// (recorded in C:\wc-ai\logs\lserve.pids.json) — the owner's llama-swap and its llama-server are never touched.
//
//   import { startServer, stopServer, gpuUsedMiB } from './lserve.mjs'
//   const s = await startServer({ exe, args: ['-m', model, ...], port: 8090, logFile })   // resolves when /health is ok
//   ... s.loadSec, s.mem (parsed from the log), await stopServer(s)
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

const PIDS = 'C:/wc-ai/logs/lserve.pids.json';
const readPids = () => { try { return JSON.parse(fs.readFileSync(PIDS, 'utf8')); } catch { return {}; } };
const savePids = (o) => { fs.mkdirSync(path.dirname(PIDS), { recursive: true }); fs.writeFileSync(PIDS, JSON.stringify(o)); };

export function gpuUsedMiB() {
  try { return Number(execFileSync('nvidia-smi', ['--query-gpu=memory.used', '--format=csv,noheader,nounits'], { encoding: 'utf8' }).trim().split('\n')[0]); } catch { return null; }
}
export function freeRamGB() {
  try { return Number(execFileSync('powershell', ['-NoProfile', '-Command', '[math]::Round((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory/1MB,2)'], { encoding: 'utf8' }).trim()); } catch { return null; }
}
export function procMemMB(pid) {
  try {
    const out = execFileSync('powershell', ['-NoProfile', '-Command', `$p=Get-Process -Id ${pid} -ErrorAction Stop; \"$([math]::Round($p.WorkingSet64/1MB)) $([math]::Round($p.PrivateMemorySize64/1MB))\"`], { encoding: 'utf8' }).trim().split(' ').map(Number);
    return { workingSetMB: out[0], privateMB: out[1] };
  } catch { return null; }
}
const health = (port) => new Promise((resolve) => {
  const r = http.get({ host: '127.0.0.1', port, path: '/health', timeout: 2000 }, (res) => { res.resume(); resolve(res.statusCode === 200); });
  r.on('error', () => resolve(false)); r.on('timeout', () => { r.destroy(); resolve(false); });
});

/** Pull the memory numbers llama.cpp prints while loading (MiB): model buffers, KV, compute, host. */
export function parseMem(logText) {
  const num = (re) => [...logText.matchAll(re)].map((m) => Number(m[1]));
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  return {
    cudaModelMiB: sum(num(/CUDA0 model buffer size\s*=\s*([\d.]+) MiB/g)),
    cpuModelMiB: sum(num(/CPU_Mapped model buffer size\s*=\s*([\d.]+) MiB|CPU model buffer size\s*=\s*([\d.]+) MiB/g).filter(Boolean)),
    kvCudaMiB: sum(num(/CUDA0 KV buffer size\s*=\s*([\d.]+) MiB/g)),
    kvHostMiB: sum(num(/CPU KV buffer size\s*=\s*([\d.]+) MiB/g)),
    rsCudaMiB: sum(num(/CUDA0 RS buffer size\s*=\s*([\d.]+) MiB/g)),
    computeCudaMiB: sum(num(/CUDA0 compute buffer size\s*=\s*([\d.]+) MiB/g)),
    computeHostMiB: sum(num(/CUDA_Host compute buffer size\s*=\s*([\d.]+) MiB/g)),
  };
}

export async function startServer({ exe, args, port, logFile, timeoutSec = 420, env = {} }) {
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  const out = fs.openSync(logFile, 'w');
  const gpuBefore = gpuUsedMiB(); const ramBefore = freeRamGB();
  const t0 = Date.now();
  const child = spawn(exe, [...args, '--port', String(port), '--host', '127.0.0.1'], { cwd: path.dirname(exe), stdio: ['ignore', out, out], windowsHide: true, env: { ...process.env, ...env } });
  const pids = readPids(); pids[child.pid] = { port, exe, started: new Date().toISOString(), args }; savePids(pids);
  let exited = null; child.on('exit', (code) => { exited = code; });
  while ((Date.now() - t0) / 1000 < timeoutSec) {
    if (exited != null) { const tail = fs.readFileSync(logFile, 'utf8').split('\n').slice(-25).join('\n'); throw Object.assign(new Error(`llama-server exited with ${exited} during load:\n${tail}`), { logFile }); }
    if (await health(port)) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!(await health(port))) { await stopServer({ child, pid: child.pid }); throw new Error(`llama-server did not become healthy in ${timeoutSec}s (see ${logFile})`); }
  const loadSec = (Date.now() - t0) / 1000;
  await new Promise((r) => setTimeout(r, 1500));
  const text = fs.readFileSync(logFile, 'utf8');
  return { child, pid: child.pid, port, logFile, loadSec, mem: parseMem(text), gpuBefore, ramBefore, gpuAfterLoad: gpuUsedMiB(), ramAfterLoad: freeRamGB(), base: `http://127.0.0.1:${port}` };
}

export async function stopServer(s) {
  const pids = readPids();
  if (!s?.pid || !pids[s.pid]) return; // never stop what we did not start
  try { execFileSync('powershell', ['-NoProfile', '-Command', `Stop-Process -Id ${s.pid} -Force -ErrorAction SilentlyContinue`]); } catch { /* already gone */ }
  delete pids[s.pid]; savePids(pids);
  for (let i = 0; i < 40; i++) { await new Promise((r) => setTimeout(r, 500)); const g = gpuUsedMiB(); if (g != null && g < 1600) break; } // let VRAM drain
}

/** Sample GPU memory (MiB) every `ms` until stop() — returns { peak, samples }. */
export function gpuSampler(ms = 400) {
  let peak = 0; const samples = []; const t = setInterval(() => { const g = gpuUsedMiB(); if (g != null) { peak = Math.max(peak, g); samples.push(g); } }, ms);
  return { stop: () => { clearInterval(t); return { peak, n: samples.length }; } };
}

if (process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === path.resolve(new URL(import.meta.url).pathname.replace(/^\//, '')).toLowerCase()) {
  const cmd = process.argv[2];
  if (cmd === 'list') console.log(readPids());
  else if (cmd === 'stop-all') { for (const pid of Object.keys(readPids())) await stopServer({ pid: Number(pid) }); console.log('stopped'); }
}
