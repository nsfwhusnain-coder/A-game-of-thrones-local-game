// GPU memory sampling through nvidia-smi (no other dependency). Used to report the peak VRAM of a run.
import { execFileSync } from 'node:child_process';

export function gpuUsedMiB() {
  try { return Number(execFileSync('nvidia-smi', ['--query-gpu=memory.used', '--format=csv,noheader,nounits'], { encoding: 'utf8' }).trim().split('\n')[0]); } catch { return null; }
}
/** Sample GPU memory (MiB) every `ms` until stop() — returns { peak, n }. */
export function gpuSampler(ms = 1500) {
  let peak = 0; let n = 0; const t = setInterval(() => { const g = gpuUsedMiB(); if (g != null) { peak = Math.max(peak, g); n++; } }, ms);
  t.unref?.();
  return { stop: () => { clearInterval(t); return { peak, n }; } };
}
