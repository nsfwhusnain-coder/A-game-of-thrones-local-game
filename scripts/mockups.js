// Renders the target-UI mockups (docs/mockups/*.html) to docs/mockups/png/<name>-1920x1080.png and -1366x768.png, from
// file:// URLs, so the pictures in docs/mockups/README.md can be regenerated after an edit. A picture over 1.5 MB is
// saved as a JPEG (quality 85) instead. Playwright is a dev tool, never a runtime dependency: `npm i --no-save playwright`.
//
//   node scripts/mockups.js [name-prefix …]      e.g. node scripts/mockups.js 03 06
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'docs', 'mockups');
const OUT = path.join(DIR, 'png');
const SIZES = [[1920, 1080], [1366, 768]];
const MAX_BYTES = 1.5 * 1024 * 1024;

function playwright() {
  const require = createRequire(import.meta.url);
  try { return require('playwright'); } catch { /* not installed locally */ }
  return require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
}

const wanted = process.argv.slice(2);
const pages = fs.readdirSync(DIR).filter((f) => /^\d\d-.*\.html$/.test(f) && (!wanted.length || wanted.some((w) => f.startsWith(w)))).sort();
fs.mkdirSync(OUT, { recursive: true });
const { chromium } = playwright();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let bad = 0;
for (const f of pages) {
  const name = f.replace(/\.html$/, '');
  for (const [w, h] of SIZES) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.goto(pathToFileURL(path.join(DIR, f)).href);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    // the layouts must fit: nothing may spill past the window
    const spill = await page.evaluate(() => [document.documentElement.scrollWidth - innerWidth, document.documentElement.scrollHeight - innerHeight]);
    if (spill[0] > 1 || spill[1] > 1) { bad++; console.warn(`  ! ${name} ${w}x${h} overflows by ${spill.join('x')} px`); }
    const base = path.join(OUT, `${name}-${w}x${h}`);
    for (const e of ['.png', '.jpg']) fs.rmSync(base + e, { force: true });
    await page.screenshot({ path: base + '.png', animations: 'disabled' });
    if (fs.statSync(base + '.png').size > MAX_BYTES) {
      fs.rmSync(base + '.png');
      await page.screenshot({ path: base + '.jpg', type: 'jpeg', quality: 85, animations: 'disabled' });
      console.log(base + '.jpg');
    } else console.log(base + '.png');
    await page.close();
  }
}
await browser.close();
if (bad) process.exitCode = 1;
