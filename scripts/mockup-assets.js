// Paints the game's own portraits and banners to PNG files for the mockups (docs/mockups/assets/), by running
// public/js/ui/portrait.js and public/js/sigils.js in headless Chromium against the local server, so the mockups show
// the real faces and sigils and not stand-ins.   node scripts/mockup-assets.js
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs', 'mockups', 'assets');
const PORT = Number(process.env.MOCKUP_PORT || 3498);
const CHARS = ['eddard_stark', 'robb_stark', 'hoster_tully', 'edmure_tully', 'robert_baratheon', 'rodrik_cassel', 'lysa_arryn', 'donella_hornwood', 'mance_rayder', 'catelyn_stark'];
const HOUSES = ['stark', 'lannister', 'tully', 'baratheon', 'tyrell', 'arryn', 'greyjoy', 'martell'];
const EXTRA = [{ id: 'erik_saltbeard', name: 'Erik Saltbeard', house: 'greyjoy', title: 'Ironborn captain', age: 41, roles: ['captain'], traits: 'fierce, salt-hard', alive: true }]; // invented for the battle mockup

const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require(path.join(execSync('npm root -g').toString().trim(), 'playwright')); }
const saves = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-mock-'));
const srv = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), WC_PROVIDER: 'mock', WC_SAVES: saves }, stdio: 'ignore' });
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/api/version`)).ok) break; } catch { /* not up yet */ } await new Promise((r) => setTimeout(r, 100)); }
  const browser = await pw.chromium.launch();
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/fonts/fonts.css`);
  const out = await page.evaluate(async ([chars, houses, extra]) => {
    const { CHARACTERS } = await import('/data/characters.js'); const { HOUSES } = await import('/data/houses.js');
    const { portraitURL } = await import('/js/ui/portrait.js'); const { bannerURL } = await import('/js/sigils.js');
    const hb = Object.fromEntries(HOUSES.map((h) => [h.id, h])); const res = {};
    // portraits as JPEG (the repo stays small): paint, redraw on a canvas, export
    const jpeg = (url) => new Promise((ok) => { const im = new Image(); im.onload = () => { const cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height; cv.getContext('2d').drawImage(im, 0, 0); ok(cv.toDataURL('image/jpeg', 0.88)); }; im.src = url; });
    for (const id of chars) { const c = CHARACTERS.find((x) => x.id === id); if (c) res[`portrait-${id}.jpg`] = await jpeg(portraitURL({ ...c, alive: true }, hb[c.house], 128)); }
    for (const c of extra) res[`portrait-${c.id}.jpg`] = await jpeg(portraitURL(c, hb[c.house], 128));
    for (const id of houses) if (hb[id]) res[`banner-${id}.png`] = bannerURL(hb[id].sigil, 64, 96);
    return res;
  }, [CHARS, HOUSES, EXTRA]);
  fs.mkdirSync(OUT, { recursive: true });
  for (const [k, v] of Object.entries(out)) { fs.writeFileSync(path.join(OUT, k), Buffer.from(v.split(',')[1], 'base64')); console.log(k); }
  await browser.close();
} finally { srv.kill(); fs.rmSync(saves, { recursive: true, force: true }); }
