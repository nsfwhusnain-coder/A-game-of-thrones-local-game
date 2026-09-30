// The map's performance budget (docs/gdd/11-map-visuals.md §10; WP E7; dev only, Playwright, the mock): the fixture page public/dev/holdings.html (nine holdings in their states, camps, a field fought,
// tents, pavilions) at the camera's L2 in each graphics preset, at 1920×1080 and 1366×768. Held: draw calls ≤ 400 (Balanced and Beautiful) and ≤ 300 (Fast); the Fast preset draws no particles (no smoke,
// no glow, no weather) whatever the state; the presets' particle counts are ordered (Fast < Balanced < Beautiful); the page reports no errors. Frame rates are printed, not held: the cloud's software
// renderer says nothing of a real GPU. `node scripts/map-perf.mjs [--shots]`; exit code 1 when a budget fails.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(ROOT, 'scripts', 'x.js'));
const SHOTS = process.argv.includes('--shots'); const PORT = 3479;
const BUDGET = { fast: 300, balanced: 400, high: 400 };
const saves = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-mapperf-'));
const srv = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), WC_PROVIDER: 'mock', WC_SAVES: saves }, stdio: 'ignore' });
let failed = 0; const rows = [];
try {
  for (let i = 0; i < 100; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/version`); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const [w, h] of [[1920, 1080], [1366, 768]]) for (const preset of ['fast', 'balanced', 'high']) {
    const page = await browser.newPage({ viewport: { width: w, height: h } }); page.setDefaultTimeout(180000);
    const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push(m.text().slice(0, 160)); });
    await page.goto(`http://127.0.0.1:${PORT}/dev/holdings.html?preset=${preset}&lod=2`);
    await page.waitForFunction(() => window.__fx, null, { timeout: 180000, polling: 500 });
    await page.waitForTimeout(1500);
    const fps = await page.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 > 2500) res((n * 1000) / (performance.now() - t0)); else requestAnimationFrame(f); }; requestAnimationFrame(f); }));
    const fx = await page.evaluate(() => window.__fx); const calls = await page.evaluate(() => window.__map.renderer.info.render.calls);
    if (SHOTS) { fs.mkdirSync(path.join(ROOT, 'visual-out'), { recursive: true }); await page.screenshot({ path: path.join(ROOT, 'visual-out', `map-perf-${preset}-${w}x${h}.jpg`), type: 'jpeg', quality: 82, timeout: 180000, animations: 'disabled' }); }
    const particles = fx.soft + fx.glow + fx.weather;
    const bad = [];
    if (calls > BUDGET[preset]) bad.push(`${calls} draw calls (budget ${BUDGET[preset]})`);
    if (preset === 'fast' && particles > 0) bad.push(`${particles} particles at Fast`);
    if (errors.length) bad.push(`errors: ${errors.slice(0, 2).join(' | ')}`);
    rows.push({ w, preset, calls, particles, fps }); if (bad.length) failed++;
    console.log(`${String(w).padStart(4)} ${preset.padEnd(8)} draw calls ${String(calls).padStart(3)}  particles ${String(particles).padStart(5)}  tents ${String(fx.tents).padStart(3)}  pavilions ${fx.pavilions}  ${fps.toFixed(0)} fps (software)${bad.length ? '   FAIL: ' + bad.join('; ') : ''}`);
    await page.close();
  }
  await browser.close();
  for (const w of [1920, 1366]) { const p = (n) => rows.find((r) => r.w === w && r.preset === n)?.particles ?? 0; if (!(p('fast') < p('balanced') && p('balanced') <= p('high'))) { failed++; console.log(`${w}: the particle counts are not ordered Fast < Balanced ≤ Beautiful`); } }
} finally { try { srv.kill(); } catch { /* */ } fs.rmSync(saves, { recursive: true, force: true }); }
console.log(failed ? `MAP PERF: FAIL — ${failed} check(s)` : 'MAP PERF: PASS (draw calls within the budget in every preset; Fast draws no particles)');
process.exitCode = failed ? 1 : 0;
