// The map's declutter gate (docs/gdd/17-ui-declutter.md §4 U8; dev only, Playwright, the mock): on the opening scene of several houses, at 1920×1080 and 1366×768,
// at turn 0 and after five weeks, at the default zoom — how many host and fleet tokens are drawn (≤ 12), whether any two map labels overlap, and how many
// pins are unread at once (≤ 6, the rest behind a "+n" bubble). `node scripts/map-check.mjs [--houses stark,lannister,greyjoy] [--shots]`. The exit code is 1 when a gate fails.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(ROOT, 'scripts', 'x.js'));
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]] : a), []));
const HOUSES = typeof args.houses === 'string' ? args.houses.split(',') : ['stark', 'lannister', 'greyjoy', 'targaryen', 'tyrell'];
const PORT = 3488;
export const GATE = { tokens: 12, overlaps: 0, pins: 6 };
const OUT = path.join(ROOT, 'visual-out');

const api = async (p, body) => { const r = await fetch(`http://127.0.0.1:${PORT}/api${p}`, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}); const j = await r.json(); if (!r.ok) throw new Error(j.error || r.status); return j; };
const saves = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-mapcheck-'));
const srv = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), WC_PROVIDER: 'mock', WC_SAVES: saves }, stdio: 'ignore' });
const rows = []; let failed = 0;
try {
  for (let i = 0; i < 100; i++) { try { await api('/version'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const house of HOUSES) {
    let id; try { ({ id } = await api('/games', { scenario: 'agot_298', house, seed: 298 })); } catch (e) { console.log(`(${house}: ${e.message})`); continue; }
    for (const turn of [0, 5]) {
      if (turn) for (let i = 0; i < 5; i++) await api(`/games/${id}/advance`, { span: '7d', orders: [] });
      for (const [w, h] of [[1920, 1080], [1366, 768]]) {
        const page = await browser.newPage({ viewport: { width: w, height: h } }); page.setDefaultTimeout(120000);
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.addInitScript(() => { try { localStorage.setItem('gfx-quality', 'fast'); localStorage.setItem('map-life', '0'); localStorage.setItem('wc.welcomed.' + new URLSearchParams(location.search).get('game'), '1'); } catch { /* */ } });
        await page.goto(`http://127.0.0.1:${PORT}/?dev&game=${id}`);
        await page.waitForFunction(() => window.__wc?.map && document.querySelector('#map-loading')?.classList.contains('hidden'), null, { timeout: 240000, polling: 500 });
        await page.waitForTimeout(2500);
        const m = await page.evaluate(() => {
          const map = window.__wc.map;
          const tokens = [...map.armyObjs.values()].filter((r) => r.label?.shown === true && !['retinue', 'progress'].includes(r.token?.kind)).length + (map.stackPool || []).filter((s) => s.shown === true).length;
          const boxes = [...document.querySelectorAll('#map-wrap .lbl')].filter((e) => e.style.display !== 'none' && getComputedStyle(e).visibility !== 'hidden' && getComputedStyle(e).opacity !== '0').map((e) => { const r = e.getBoundingClientRect(); return { cls: e.className, t: e.textContent.trim().slice(0, 30), x0: r.left, y0: r.top, x1: r.right, y1: r.bottom }; }).filter((b) => b.x1 > b.x0 && b.y1 > b.y0);
          const pins = boxes.filter((b) => /event|pulse|pin/.test(b.cls));
          const over = []; const items = boxes.filter((b) => !/event|pulse|pin/.test(b.cls));
          for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) { const a = items[i], b = items[j]; const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0); if (ox > 3 && oy > 3) over.push(`${a.t} × ${b.t}`); }
          return { tokens, labels: boxes.length, overlaps: over.length, over: over.slice(0, 4), pins: pins.length, dist: Math.round(map.dist) };
        });
        // a crowd: thirty hosts of the player's about the middle of the view. At the default zoom no more than the cap are drawn; close in, every one
        if (turn === 5 && house === HOUSES[0]) {
          const cr = await page.evaluate(async () => {
            const wc = window.__wc, map = wc.map, s = wc.state, me = s.meta.player;
            const base = Object.values(s.parties).find((a) => a.owner === me) || Object.values(s.parties)[0];
            for (let i = 0; i < 30; i++) { const a = structuredClone(base); a.id = 'stress' + i; a.name = 'Stress host ' + i; a.kind = 'host'; a.owner = me; a.men = 500 + i * 40; a.pos = [map.target.x + ((i * 53) % 240) - 120, map.target.z + ((i * 97) % 200) - 100]; a.march = null; a.at = null; a.route = null; s.parties[a.id] = a; }
            map.setState(s); const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 60)));
            const count = () => [...map.armyObjs.values()].filter((r) => r.label?.shown === true && !['retinue', 'progress'].includes(r.token?.kind)).length + (map.stackPool || []).filter((x) => x.shown === true).length;
            await new Promise((r) => setTimeout(r, 2500));
            const far = count(); const d0 = map.dist; map.dist = 230; map.goal = null; map.tween = null; map.updateCamera?.(); await new Promise((r) => setTimeout(r, 2500)); const near = count(); map.dist = d0; map.updateCamera?.();
            return { far, near, dist: Math.round(d0) };
          });
          console.log(`crowd of 30   ${String(w).padStart(4)}  default zoom ${cr.far} plates (cap 12)   close in ${cr.near}`);
          if (cr.far > GATE.tokens || cr.near <= cr.far) { failed++; console.log('   FAIL: the cap does not hold at the default zoom, or does not lift close in'); }
        }
        if (args.shots) { fs.mkdirSync(OUT, { recursive: true }); await page.screenshot({ path: path.join(OUT, `mapcheck-${house}-t${turn}-${w}.jpg`), type: 'jpeg', quality: 80, timeout: 180000, animations: 'disabled' }); }
        const bad = m.tokens > GATE.tokens || m.overlaps > GATE.overlaps || m.pins > GATE.pins; if (bad) failed++;
        rows.push({ house, turn, w, ...m, bad });
        console.log(`${house.padEnd(10)} t${turn} ${String(w).padStart(4)}  tokens ${String(m.tokens).padStart(2)}  labels ${String(m.labels).padStart(3)}  overlaps ${m.overlaps}${m.over.length ? ' (' + m.over.join('; ') + ')' : ''}  pins ${m.pins}  zoom ${m.dist}${bad ? '   FAIL' : ''}`);
        await page.close();
      }
    }
  }
  await browser.close();
} finally { try { srv.kill(); } catch { /* */ } fs.rmSync(saves, { recursive: true, force: true }); }
console.log(failed ? `MAP GATE: FAIL — ${failed} scene(s) outside ≤ ${GATE.tokens} tokens, ${GATE.overlaps} overlaps, ≤ ${GATE.pins} unread pins` : `MAP GATE: PASS (≤ ${GATE.tokens} tokens, no overlapping labels, ≤ ${GATE.pins} unread pins)`);
process.exitCode = failed ? 1 : 0;
