// Bug hunt, sweep 3: the interface, walked as a player would, for several houses and sizes. Reads, never fixes.
// Collects console errors, page errors, failed requests, broken images, odd text, clipped text without a tooltip, horizontal scroll, tiny buttons, icon buttons without a name.
import { BH_OUT, REPO, out } from './paths.mjs';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = REPO; const OUT = out('ui'); fs.mkdirSync(OUT, { recursive: true });
const PORT = 3421; const require = createRequire(REPO + '/package.json');
const { chromium } = require('playwright');
const saves = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-bh-ui-'));
const srv = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), WC_PROVIDER: 'mock', WC_SAVES: saves }, stdio: 'ignore' });
const api = async (p, body) => { const r = await fetch(`http://127.0.0.1:${PORT}/api${p}`, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}); const j = await r.json(); if (!r.ok) throw new Error(j.error || r.status); return j; };
const findings = []; const seen = new Set();
const add = (house, size, where, rule, text) => { const k = `${rule}|${text}`.slice(0, 200); if (seen.has(k)) return; seen.add(k); findings.push({ house, size, where, rule, text }); };
const BAD = /\bundefined\b|\bNaN\b|\[object|\bnull\b|\{\{|\}\}|%s|\bthe the\b|\bundefined's|\(\s*\)|\s{3,}|\bInfinity\b|-?\d{7,}\b/;
const scan = (badSrc) => {
  const BAD = new RegExp(badSrc);
  const out = { bad: [], clipped: [], tiny: [], unnamed: [], broken: [], hscroll: document.documentElement.scrollWidth > innerWidth + 2 };
  const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 1 && r.height > 1 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.05 && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight; };
  const desc = (e) => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/)[0] : ''}`;
  for (const e of document.querySelectorAll('body *')) {
    if (!vis(e)) continue;
    const own = [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ').replace(/\s+/g, ' ').trim();
    if (own && BAD.test(own)) out.bad.push(`${desc(e)}: ${own.slice(0, 120)}`);
    const cs = getComputedStyle(e);
    if (own.length >= 10 && (cs.overflow === 'hidden' || cs.textOverflow === 'ellipsis') && e.scrollWidth > e.clientWidth + 2 && !e.title && !e.closest('[title]') && !e.closest('[data-tip]')) out.clipped.push(`${desc(e)}: ${own.slice(0, 80)}`);
    if (e.matches('button, [role=button], a[href], input, select')) { const r = e.getBoundingClientRect(); if ((r.width < 20 || r.height < 20) && !e.closest('.lbl')) out.tiny.push(`${desc(e)} ${Math.round(r.width)}x${Math.round(r.height)} "${(e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 30)}"`); const name = (e.getAttribute('aria-label') || e.title || e.textContent || e.value || '').trim(); if (!name && e.tagName !== 'INPUT') out.unnamed.push(desc(e)); }
    if (e.tagName === 'IMG' && e.complete && e.naturalWidth === 0 && e.getAttribute('src')) out.broken.push(e.getAttribute('src').slice(0, 100));
  }
  return out;
};
let browser;
try {
  for (let i = 0; i < 100; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/version`); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
  browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const HOUSES = (process.argv[2] || 'stark,lannister,targaryen,nights_watch,free_folk,braavos,flint_finger,golden_company').split(','); const SIZES = (process.argv[3] || '1920x1080,1366x768,1024x768').split(',').map((x) => x.split('x').map(Number));
  for (const house of HOUSES) {
    let g; try { g = await api('/games', { scenario: 'agot_298', house, seed: 77 }); } catch (e) { add(house, '-', 'new game', 'api', `could not begin: ${e.message}`); continue; }
    for (let i = 0; i < 3; i++) { try { await api(`/games/${g.id}/advance`, { span: '7d', orders: [] }); } catch (e) { add(house, '-', 'advance', 'api', `advance threw: ${String(e.message).slice(0, 160)}`); break; } }
    for (const [w, h] of SIZES) {
      const tag = `${house}-${w}`; let page; try { page = await browser.newPage({ viewport: { width: w, height: h } }); } catch { browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }); page = await browser.newPage({ viewport: { width: w, height: h } }); } page.setDefaultTimeout(60000);
      const here = (where) => (rule, text) => add(house, `${w}x${h}`, where, rule, text);
      page.on('pageerror', (e) => add(house, `${w}x${h}`, 'page', 'pageerror', e.message.slice(0, 200)));
      page.on('console', (m) => { if (m.type() === 'error') add(house, `${w}x${h}`, 'console', 'console.error', m.text().slice(0, 200)); if (m.type() === 'warning' && !/GPU stall|WebGL|swiftshader/i.test(m.text())) add(house, `${w}x${h}`, 'console', 'console.warn', m.text().slice(0, 160)); });
      page.on('response', (r) => { if (r.status() >= 400) add(house, `${w}x${h}`, 'network', `http ${r.status()}`, r.url().replace(`http://127.0.0.1:${PORT}`, '').slice(0, 120)); });
      page.on('requestfailed', (r) => add(house, `${w}x${h}`, 'network', 'requestfailed', `${r.url().replace(`http://127.0.0.1:${PORT}`, '').slice(0, 100)} ${r.failure()?.errorText}`));
      await page.addInitScript((gid) => { try { localStorage.setItem('voice-download', '"off"'); localStorage.setItem('wc.welcomed.' + gid, '1'); localStorage.setItem('wc.coach.' + gid, '["command","turn","realm"]'); } catch { /* */ } }, g.id);
      const check = async (where) => { try { const r = await page.evaluate(scan, BAD.source); const f = here(where); for (const x of r.bad) f('odd text', x); for (const x of r.clipped) f('clipped text, no tooltip', x); for (const x of r.tiny) f('tiny control', x); for (const x of r.unnamed) f('control with no name', x); for (const x of r.broken) f('broken image', x); if (r.hscroll) f('horizontal scroll', 'the page scrolls sideways'); } catch (e) { add(house, `${w}x${h}`, where, 'scan failed', e.message.slice(0, 120)); } };
      const shot = async (n) => page.screenshot({ path: path.join(OUT, `${tag}-${n}.jpg`), type: 'jpeg', quality: 70, animations: 'disabled' }).catch(() => {});
      const step = async (where, fn) => { try { await fn(); await page.waitForTimeout(500); await check(where); } catch (e) { add(house, `${w}x${h}`, where, 'step failed', String(e.message).split('\n')[0].slice(0, 160)); } };
      const closeAll = async () => { for (let i = 0; i < 4; i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(150); } };
      try {
        await page.goto(`http://127.0.0.1:${PORT}/?game=${g.id}`); await page.waitForSelector('#hud-top .advance-btn', { state: 'visible', timeout: 240000 }); await page.waitForFunction(() => { const l = document.querySelector('#map-loading'); return !l || l.classList.contains('hidden') || getComputedStyle(l).display === 'none' || +getComputedStyle(l).opacity === 0; }, null, { timeout: 240000, polling: 500 }); await page.waitForTimeout(2000);
        await step('plain', async () => {}); await shot('plain');
        // the three doors
        for (const [key, name] of [['r', 'realm'], ['p', 'people']]) {
          await step(`${name} window`, async () => { await closeAll(); await page.keyboard.press(key); await page.waitForTimeout(900); }); await shot(name);
          const tabs = await page.$$('#window [role=tab]').catch(() => []); for (let i = 0; i < tabs.length; i++) { await step(`${name} tab ${i}`, async () => { await tabs[i].click(); await page.waitForTimeout(500); }); if (i < 4) await shot(`${name}-tab${i}`); }
        }
        await step('chronicle', async () => { await closeAll(); await page.keyboard.press('h'); await page.waitForTimeout(900); }); await shot('chronicle');
        const chips = await page.$$('#drawer .wc-chip, #drawer [role=tab]').catch(() => []); for (let i = 0; i < Math.min(chips.length, 6); i++) await step(`chronicle filter ${i}`, async () => { await chips[i].click(); await page.waitForTimeout(300); });
        await step('inbox', async () => { await closeAll(); await page.click('#inbox-btn'); await page.waitForTimeout(500); }); await shot('inbox');
        await step('menu', async () => { await closeAll(); await page.click('#menu-btn'); await page.waitForTimeout(400); });
        // map modes
        await step('map modes list', async () => { await closeAll(); await page.click('#mapmode-btn'); await page.waitForTimeout(400); }); await shot('mapmodes');
        const modes = await page.$$('#mapmode-list [data-mode], #mapmode-list button').catch(() => []); for (let i = 0; i < modes.length; i++) { await step(`map mode ${i}`, async () => { await closeAll(); await page.click('#mapmode-btn'); await page.waitForTimeout(250); const ms = await page.$$('#mapmode-list [data-mode], #mapmode-list button'); await ms[i]?.click(); await page.waitForTimeout(900); }); await shot(`mode${i}`); }
        // settings & help
        await step('settings', async () => { await closeAll(); await page.click('#menu-btn'); await page.waitForTimeout(250); await page.evaluate(() => [...document.querySelectorAll('[data-action="settings"]')].find((e) => e.offsetParent)?.click()); await page.waitForTimeout(700); });
        const st = await page.$$('[data-set-tab]').catch(() => []); for (let i = 0; i < st.length; i++) { await step(`settings tab ${i}`, async () => { await st[i].click(); await page.waitForTimeout(400); }); await shot(`settings${i}`); }
        await closeAll();
        await step('help', async () => { await page.evaluate(() => document.activeElement?.blur?.()); await page.keyboard.press('?'); await page.waitForTimeout(700); }); await shot('help'); await closeAll();
        // a card by clicking the seat, the lord's face, a name link
        await step('ruler face', async () => { await closeAll(); await page.click('#hud-player .wc-medallion__face'); await page.waitForTimeout(900); }); await shot('ruler'); await closeAll();
        await step('end a turn', async () => { await page.click('#hud-top .advance-btn'); await page.waitForTimeout(1200); const ask = await page.$('text=Let the days pass'); if (ask) await ask.click(); await page.waitForFunction(() => document.querySelector('#busy')?.classList.contains('hidden'), null, { timeout: 120000, polling: 400 }); await page.waitForTimeout(1500); });
        await shot('after-turn'); await closeAll();
        await step('after the turn: plain', async () => { await page.waitForTimeout(500); });
      } catch (e) { add(house, `${w}x${h}`, 'run', 'run failed', String(e.message).split('\n')[0].slice(0, 200)); }
      await page.close().catch(() => {}); fs.writeFileSync(BH_OUT + '/ui.json', JSON.stringify(findings, null, 1));
    }
  }
} finally { try { await browser?.close(); } catch { /* */ } try { srv.kill(); } catch { /* */ } fs.rmSync(saves, { recursive: true, force: true }); }
fs.writeFileSync(BH_OUT + '/ui.json', JSON.stringify(findings, null, 1));
const by = {}; for (const f of findings) by[f.rule] = (by[f.rule] || 0) + 1; console.log('ui findings', findings.length, JSON.stringify(by));
