// Screenshots of the game on the mock provider, for pull requests (CLAUDE.md: 1920×1080 and 1366×768, WebGL through
// SwiftShader, so it runs on a machine without a GPU). Each scenario sets a game up over the same API the browser uses,
// opens it (?game=<id>), points the camera and shoots at both sizes.
//
//   node scripts/screens.js [scenario …]        → visual-out/<scenario>-<w>x<h>.png   (default: all scenarios)
//
// Playwright is a dev tool, never a runtime dependency: `npm i --no-save playwright`, or a global install.
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'visual-out');
const PORT = Number(process.env.SCREENS_PORT || 3497);
const SIZES = [[1920, 1080], [1366, 768]];

function playwright() {
  const require = createRequire(import.meta.url);
  try { return require('playwright'); } catch { /* not installed locally */ }
  return require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
}
const api = async (p, body) => {
  const r = await fetch(`http://127.0.0.1:${PORT}/api${p}`, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
  const j = await r.json(); if (!r.ok) throw new Error(j.error || r.status); return j;
};

// Each scenario returns { id, focus: [x, y], dist } — the game to open and where to look.
const SCENARIOS = {
  // an island lord's men at sea: House Crowl or House Mormont sailing for the mainland (WP A8)
  async sea() {
    const { id, state } = await api('/games', { scenario: 'agot_298', house: 'stark' });
    const vassals = Object.values(state.houses).filter((h) => h.liege === 'stark').map((h) => h.id);
    await api(`/games/${id}/act`, { kind: 'call_banners', vassals, at: 'stark', ownLevies: 4000 });
    for (let t = 0; t < 14; t++) {
      const { state: s } = await api(`/games/${id}/advance`, { span: '7d' });
      const ship = Object.values(s.armies).find((a) => ['crowl', 'mormont'].includes(a.owner) && a.sea?.phase === 'sailing');
      if (ship) return { id, focus: ship.pos, dist: 260 };
    }
    throw new Error('no island host set sail in 14 weeks');
  },
};

async function main() {
  const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SCENARIOS);
  fs.mkdirSync(OUT, { recursive: true });
  const saves = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-screens-'));
  const srv = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), WC_PROVIDER: 'mock', WC_SAVES: saves }, stdio: 'ignore' });
  try {
    for (let i = 0; i < 100; i++) { try { await api('/version'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
    const { chromium } = playwright();
    const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
    for (const name of wanted) {
      if (!SCENARIOS[name]) { console.error(`unknown scenario ${name}`); continue; }
      const { id, focus, dist } = await SCENARIOS[name]();
      for (const [w, h] of SIZES) {
        const page = await browser.newPage({ viewport: { width: w, height: h } });
        const errors = []; page.on('pageerror', (e) => errors.push(e.message));
        await page.goto(`http://127.0.0.1:${PORT}/?dev&game=${id}`);
        // the map is ready when the game has made it and the loading veil is down again
        await page.waitForFunction(() => window.__wc?.map && document.querySelector('#map-loading')?.classList.contains('hidden'), null, { timeout: 240000, polling: 500 });
        if (focus) await page.evaluate(([p, d]) => window.__wc.map.flyTo(p, d), [focus, dist]);
        await page.waitForTimeout(4000);
        const file = path.join(OUT, `${name}-${w}x${h}.png`);
        await page.screenshot({ path: file });
        console.log(`${file}${errors.length ? `  (page errors: ${errors.join(' | ')})` : ''}`);
        await page.close();
      }
    }
    await browser.close();
  } finally { srv.kill(); fs.rmSync(saves, { recursive: true, force: true }); }
}
main().catch((e) => { console.error(e); process.exit(1); });
