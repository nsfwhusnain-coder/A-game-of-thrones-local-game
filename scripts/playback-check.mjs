// The playback choreography on the fixture page (docs/gdd/11-map-visuals.md §11; WP E8; dev only, Playwright, the mock): public/dev/playback.html plays a canned turn of six events over five days
// with the runner the game uses, on a real MapScene. Held: the events are told in order; the camera flies only for weighty news that is not on screen (never for importance ≤ 2, and one flight a day);
// a holding that changed hands keeps its old look until its own beat and takes the new one then; with reduced motion it cuts and never flies; once the player takes the camera nothing flies or cuts again,
// and the camera does not go home. `node scripts/playback-check.mjs`; exit code 1 when a check fails.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(ROOT, 'scripts', 'x.js'));
const PORT = 3478;
const saves = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-playback-'));
const srv = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), WC_PROVIDER: 'mock', WC_SAVES: saves }, stdio: 'ignore' });
let failed = 0; const check = (ok, what) => { if (!ok) failed++; console.log(`  ${ok ? '✓' : '✗'} ${what}`); };
try {
  for (let i = 0; i < 100; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/version`); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const run = async (qs) => {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } }); page.setDefaultTimeout(240000);
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${PORT}/dev/playback.html?${qs}`);
    await page.waitForFunction(() => window.__playback?.done, null, { timeout: 240000, polling: 500 });
    const r = await page.evaluate(() => window.__playback); await page.close(); return { ...r, errors };
  };
  const kinds = (log, k) => log.filter((l) => l.startsWith(k + ' ')).length;
  const shows = (log) => log.filter((l) => l.startsWith('show ')).map((l) => Number(l.split(' ')[1]));

  console.log('the plan told with flights:');
  const a = await run('speed=0.03');
  check(JSON.stringify(shows(a.log)) === '[0,1,2,3,4,5]', 'every event is told once, in order');
  const act = a.plan.steps.map((s) => s.action);
  check(act[1] === 'fly' && act[5] === 'fly', `the great battle (day 2) and the fall of the castle (day 5) fly (${act.join(' ')})`);
  check(act[2] === 'pulse', 'the lesser news of the same day is only pulsed');
  check(act[3] !== 'fly', 'news already on the screen is not flown to');
  check(a.plan.steps.filter((s) => s.importance <= 2).every((s) => s.action !== 'fly' && s.action !== 'cut'), 'the camera never goes for importance 2 or less');
  check(kinds(a.log, 'fly') === 2, `two flights in all (${kinds(a.log, 'fly')})`);
  const bef = a.owners.filter((o) => o.beat !== 'after-reveal' && o.beat !== 'end' && o.beat !== 'before-reveal').map((o) => o.owner);
  check(new Set(a.owners.filter((o) => o.beat === 'before-reveal').map((o) => o.owner)).size === 1 && a.owners.find((o) => o.beat === 'before-reveal').owner !== a.owners.find((o) => o.beat === 'after-reveal').owner, 'the castle that fell keeps its old owner until its own beat, then takes the new one');
  check(bef.slice(0, 5).every((o) => o === bef[0]), 'and nothing changed on the map at the beats before it');
  check(a.owners.at(-1).owner === a.owners.find((o) => o.beat === 'after-reveal').owner, 'the map ends on the true state');
  check(kinds(a.log, 'home') === 1, 'the camera goes home once, when the news is told');
  check(a.errors.length === 0, 'no page errors');

  console.log('with reduced motion:');
  const b = await run('reduced=1&speed=0.03');
  check(kinds(b.log, 'fly') === 0 && kinds(b.log, 'cut') === 2, 'it cuts, and never flies');
  check(JSON.stringify(shows(b.log)) === '[0,1,2,3,4,5]', 'the same events in the same order');
  check(b.log.includes('home cut'), 'and goes home by a cut'); check(b.errors.length === 0, 'no page errors');

  console.log('when the player takes the camera:');
  const c = await run('taken=1&speed=0.03');
  const i1 = c.log.indexOf('show 1');
  check(c.log.slice(i1 + 1).every((l) => !/^(fly|cut|home)/.test(l)), 'after they take it nothing flies or cuts, and the camera does not go home');
  check(JSON.stringify(shows(c.log)) === '[0,1,2,3,4,5]', 'the news is still told in order'); check(c.errors.length === 0, 'no page errors');
  await browser.close();
} finally { try { srv.kill(); } catch { /* */ } fs.rmSync(saves, { recursive: true, force: true }); }
console.log(failed ? `PLAYBACK: FAIL — ${failed} check(s)` : 'PLAYBACK: PASS');
process.exitCode = failed ? 1 : 0;
