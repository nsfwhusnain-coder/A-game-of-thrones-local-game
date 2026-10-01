// The interface acceptance checklist (docs/gdd/12-ui-ux.md §14; gate Q8; WP F9), run in a real browser over a tour of the screens at three sizes.
//
//   node scripts/visual.js                    1920×1080, 1366×768 and 1024×768 over every scene; a table; exit 1 if a check fails
//   node scripts/visual.js --size=1366        one width only
//   node scripts/visual.js --scene=audience   one scene (plain, chronicle, realm, people, audience, council, letters, sheet, matter, settings, help, tree, inbox, menu)
//   node scripts/visual.js --verbose          list what each failing check found (the elements, the texts)
//   node scripts/visual.js --shots            also write visual-out/visual-<scene>-<w>x<h>.jpg
//   node scripts/visual.js --json             the findings as JSON (for a report)
//
// Dev tool, not part of `npm test` (it needs Playwright and a browser that draws WebGL without a GPU; see scripts/screens.js). It starts the server on the mock provider with a temporary
// saves folder, begins a Stark game five turns on (so there is history, a matter and a letter to show), and for each scene at each size opens it the way a player does and scans the page:
//   4  no emoji characters in the text of the page             5  no `title` longer than 60 characters           3  no text below 12 px; long text not below 15 px at 1366
//   2  no two open panels overlap                              11 everything clickable is reachable by keyboard    11 a visible focus ring on what is focused
//   12 text contrast ≥ 4.5:1 where the background is solid     16 with motion reduced, nothing animates            —  no horizontal scroll; nothing outside the window
//   10 Escape closes the top-most panel and focus returns to what opened it
// The static checks of the checklist (no confirm/alert/prompt in the code; no hard-coded colours added) are tests/a11y-static.test.js, in npm test.
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'visual-out');
const PORT = Number(process.env.VISUAL_PORT || 3495);
const ARGS = process.argv.slice(2); const has = (a) => ARGS.includes(a); const val = (k) => ARGS.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const SIZES = [[1920, 1080], [1366, 768], [1024, 768]].filter(([w]) => !val('size') || String(w) === val('size'));
const SCENE_ONLY = val('scene');
const T0 = Date.now(); const say = (m) => process.stderr.write(`[${((Date.now() - T0) / 1000).toFixed(0)}s] ${m}\n`);

function playwright() {
  const require = createRequire(import.meta.url);
  try { return require('playwright'); } catch { /* not installed locally */ }
  return require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
}
const api = async (p, body) => { const r = await fetch(`http://127.0.0.1:${PORT}/api${p}`, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}); const j = await r.json(); if (!r.ok) throw new Error(j.error || r.status); return j; };

// ───────────── the scan, in the page ─────────────
function scan() {
  const vw = innerWidth, vh = innerHeight; const out = {};
  const visible = (el) => { const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false; const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return false; for (let p = el; p && p !== document.body; p = p.parentElement) { const s = getComputedStyle(p); if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0 || p.hidden || p.getAttribute('aria-hidden') === 'true' && p.classList.contains('hidden')) return false; } return r.bottom > 0 && r.right > 0 && r.top < vh && r.left < vw; };
  const desc = (el) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${[...el.classList].slice(0, 2).map((c) => '.' + c).join('')}`;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const texts = []; for (let n = walker.nextNode(); n; n = walker.nextNode()) { const t = n.nodeValue.trim(); if (!t) continue; const el = n.parentElement; if (!el || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName) || el.closest('svg')) continue; if (!visible(el)) continue; texts.push({ el, t }); }
  // 4: emoji in the text of the page
  out.emoji = texts.filter(({ t }) => /\p{Extended_Pictographic}/u.test(t)).map(({ el, t }) => `${desc(el)} “${t.slice(0, 30)}”`);
  // 5: titles over 60 characters (anywhere in the page that is shown)
  out.titles = [...document.querySelectorAll('[title]')].filter((e) => e.getAttribute('title').length > 60 && visible(e)).map((e) => `${desc(e)} (${e.getAttribute('title').length}) “${e.getAttribute('title').slice(0, 40)}…”`);
  // 3: text size
  out.small = []; out.longSmall = [];
  for (const { el, t } of texts) { const fs = parseFloat(getComputedStyle(el).fontSize); if (fs === 0) continue; /* a dot on the map, its name hidden */ if (fs < 11.95) out.small.push(`${desc(el)} ${fs.toFixed(1)}px “${t.slice(0, 24)}”`); else if (vw >= 1300 && vw <= 1400 && t.length >= 60 && fs < 15) out.longSmall.push(`${desc(el)} ${fs.toFixed(1)}px “${t.slice(0, 24)}”`); }
  // 2: open panels overlap
  const PANELS = ['#drawer', '#window', '#sheet', '#card', '#command-bar']; // (a dialog over the map is an overlay by design; the strip gives way to an open drawer)
  const boxes = PANELS.map((s) => { const e = document.querySelector(s); if (!e || !visible(e)) return null; const r = e.getBoundingClientRect(); return { s, l: r.left, t: r.top, r: r.right, b: r.bottom }; }).filter(Boolean);
  out.overlaps = []; for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) { const a = boxes[i], b = boxes[j]; if (a.l < b.r - 1 && a.r > b.l + 1 && a.t < b.b - 1 && a.b > b.t + 1) out.overlaps.push(`${a.s} × ${b.s}`); }
  // 11: clickable but not reachable by keyboard
  out.unreachable = [];
  const okTag = new Set(['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY', 'LABEL', 'OPTION']);
  for (const el of document.querySelectorAll('body *')) {
    if (okTag.has(el.tagName) || el.closest('svg') || !visible(el)) continue;
    if (el.closest('.lbl') && document.querySelector('#map-wrap[tabindex="0"]')) continue; // the map's own places are reached with [ and ] and Enter (MapScene.stepPlace)
    const cs = getComputedStyle(el); if (cs.cursor !== 'pointer') continue;
    if (el.closest('button, a[href], summary, label, [tabindex="0"], [role="button"], [role="link"], [role="tab"], [role="menuitem"]')) continue;
    if (el.tabIndex >= 0) continue;
    out.unreachable.push(`${desc(el)} “${(el.textContent || '').trim().slice(0, 24)}”`);
  }
  // 12: contrast where the background is one solid colour
  const parse = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c); if (!m) return null; const p = m[1].split(',').map((x) => parseFloat(x)); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const over = (top, bot) => ({ r: top.r * top.a + bot.r * (1 - top.a), g: top.g * top.a + bot.g * (1 - top.a), b: top.b * top.a + bot.b * (1 - top.a), a: 1 });
  const bgOf = (el) => { let acc = null; for (let p = el; p; p = p.parentElement) { const cs = getComputedStyle(p); if (cs.backgroundImage && cs.backgroundImage !== 'none') return null; const c = parse(cs.backgroundColor); if (c && c.a > 0) { acc = acc ? over(acc, c) : c; if (c.a >= 0.99) return acc; } } return null; };
  out.contrast = [];
  for (const { el, t } of texts) { if (el.closest('.lbl')) continue; /* the map's own labels are lit by their shadows over a painted ground */ const bg = bgOf(el); if (!bg) continue; const fg = parse(getComputedStyle(el).color); if (!fg) continue; const f = over(fg, bg); const a = lum(f), b = lum(bg); const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); const big = parseFloat(getComputedStyle(el).fontSize) >= 24; if (ratio < (big ? 3 : 4.5)) out.contrast.push(`${desc(el)} ${ratio.toFixed(2)} “${t.slice(0, 22)}”`); }
  // no horizontal scroll, nothing pushed outside the window
  out.hscroll = document.documentElement.scrollWidth > vw + 1 || document.body.scrollWidth > vw + 1;
  out.outside = boxes.filter((b) => b.l < -1 || b.r > vw + 1 || b.b > vh + 1).map((b) => b.s);
  // 16: motion (only meaningful with reduced motion emulated): animations still running, panels that slide
  out.moving = document.getAnimations().filter((a) => { const t = a.effect?.getComputedTiming?.(); return t && t.duration > 0 && a.playState === 'running' && !a.effect.target?.closest?.('svg') && !/^(loading|busy)/.test(a.effect.target?.id || ''); }).map((a) => `${desc(a.effect.target)} ${a.animationName || a.transitionProperty || ''}`).slice(0, 8);
  return out;
}
// 11: a visible ring on what is focused: Tab through the first stops of the scene and compare each with itself unfocused
async function ringScan(page) {
  const bad = []; await page.evaluate(() => { document.activeElement?.blur?.(); });
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab');
    const r = await page.evaluate(() => { const e = document.activeElement; if (!e || e === document.body || e === document.documentElement) return null; const sig = () => [e, e.parentElement, e.parentElement?.parentElement].filter(Boolean).map((x) => { const c = getComputedStyle(x); return [c.outlineStyle, c.outlineWidth, c.outlineColor, c.boxShadow, c.borderTopColor, c.backgroundColor, c.color, c.textDecorationLine, c.opacity].join('|'); }).join('#'); /* (the element, or the field it sits in) */ const on = sig(); const r0 = e.getBoundingClientRect(); const d = e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + [...e.classList].slice(0, 2).map((x) => '.' + x).join(''); e.blur(); const off = sig(); e.focus(); return { d, ring: on !== off, vis: r0.width > 0 && r0.height > 0 }; });
    if (r && r.vis && !r.ring) bad.push(r.d);
  }
  return [...new Set(bad)];
}
const CHECKS = [
  ['4  no emoji in the text', 'emoji', (r) => r.emoji.length === 0],
  ['5  no title over 60 characters', 'titles', (r) => r.titles.length === 0],
  ['3  no text below 12 px', 'small', (r) => r.small.length === 0],
  ['3  long text not below 15 px (at 1366)', 'longSmall', (r) => r.longSmall.length === 0],
  ['2  no two panels overlap', 'overlaps', (r) => r.overlaps.length === 0],
  ['11 clickable things reachable by keyboard', 'unreachable', (r) => r.unreachable.length === 0],
  ['12 contrast ≥ 4.5:1 (solid backgrounds)', 'contrast', (r) => r.contrast.length === 0],
  ['   no horizontal scroll, nothing outside', 'outside', (r) => !r.hscroll && r.outside.length === 0],
  ['11 a visible ring on what is focused', 'rings', (r) => r.rings.length === 0],
  ['16 nothing moves with motion reduced', 'moving', (r) => r.moving.length === 0],
];

// ───────────── the scenes: each opens as a player opens it ─────────────
const press = async (page, k) => { await page.evaluate(() => document.activeElement?.blur?.()); await page.keyboard.press(k); await page.waitForTimeout(500); };
const close = async (page) => { for (let i = 0; i < 5; i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(60); } await page.evaluate(() => { document.querySelector('#modal')?.classList.add('hidden'); }); await page.waitForTimeout(150); };
const SCENES = {
  plain: async () => {},
  chronicle: async (page) => { await press(page, 'h'); },
  realm: async (page) => { await press(page, 'r'); },
  'realm-diplomacy': async (page) => { await press(page, 'd'); },
  people: async (page) => { await press(page, 'p'); },
  audience: async (page) => { await page.evaluate(() => window.__wc.openChat('catelyn_stark')); await page.waitForTimeout(700); },
  council: async (page) => { await page.evaluate(() => window.__wc.openCouncil(['eddard_stark'])); await page.waitForTimeout(700); },
  letters: async (page) => { await page.evaluate(async () => { (await import('/js/ui/drawer.js')).openDrawer('letters'); }); await page.waitForTimeout(500); },
  sheet: async (page) => { await page.evaluate(() => window.__wc.openSheet('char', 'robb_stark')); await page.waitForTimeout(800); },
  'sheet-house': async (page) => { await page.evaluate(() => window.__wc.openSheet('house', 'tully')); await page.waitForTimeout(800); },
  tree: async (page) => { await page.evaluate(() => window.__wc.openSheet('char', 'robb_stark')); await page.waitForTimeout(500); await page.click('[data-tree]'); await page.waitForTimeout(1500); },
  matter: async (page) => { await page.evaluate(async () => { const s = window.__wc.state; const dn = (d) => d.year * 360 + (d.month - 1) * 30 + (d.day - 1); s.decisions = (s.decisions || []).filter((d) => d.status !== 'pending'); s.decisions.push({ id: 'vis_matter', matter: 'border_quarrel', title: 'A border quarrel', text: 'Two lords claim a mill and a ford. Blood has been spilled over it. Both appeal to you for judgement.', from: 'jon_umber', options: [{ label: 'Judge for the first', hint: 'The first is grateful, the second aggrieved' }, { label: 'Judge for the second', hint: 'The second is grateful, the first aggrieved' }], date: 'today', turn: s.meta.turn, day: dn(s.meta.date) - 2, days: 9, status: 'pending', lapse: [{ unrestAll: 2 }] }); window.__wc.map?.syncEventPins?.(); (await import('/js/ui/chrome.js')).openItem('matter', 'vis_matter'); }); await page.waitForTimeout(600); },
  inbox: async (page) => { await page.click('#inbox-btn'); await page.waitForTimeout(500); },
  menu: async (page) => { await page.click('#menu-btn'); await page.waitForTimeout(500); },
  settings: async (page) => { await page.click('#menu-btn'); await page.waitForTimeout(300); await page.evaluate(() => [...document.querySelectorAll('[data-action="settings"]')].find((e) => e.offsetParent)?.click()); await page.waitForTimeout(800); },
  help: async (page) => { await page.evaluate(() => document.activeElement?.blur?.()); await page.keyboard.press('?'); await page.waitForTimeout(800); },
};

// 20: the whole way in, as a player goes: the title, a house, the welcome, a first order, the jump, the telling of the turn, a matter answered — with nothing in the console
async function flow(browser) {
  const out = { steps: [], errors: [] }; const page = await browser.newPage({ viewport: { width: 1366, height: 768 } }); page.setDefaultTimeout(90000);
  page.on('pageerror', (e) => out.errors.push(e.message.slice(0, 160))); page.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) out.errors.push(m.text().slice(0, 160)); });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => { try { localStorage.setItem('voice-download', '"off"'); localStorage.setItem('gfx-quality', 'fast'); localStorage.setItem('map-life', '0'); } catch { /* */ } });
  const step = async (name, fn) => { try { await fn(); out.steps.push(name); return true; } catch (e) { out.failed = `${name}: ${String(e.message).split(String.fromCharCode(10))[0]}`; return false; } };
  try {
    if (!(await step('title', async () => { await page.goto(`http://127.0.0.1:${PORT}/?dev`); await page.waitForSelector('#house-grid .house-tile', { timeout: 60000 }); }))) return out;
    if (!(await step('house', async () => { await page.click('#house-grid .house-tile[data-h="stark"]'); await page.waitForSelector('#begin', { timeout: 30000 }); }))) return out;
    if (!(await step('begin', async () => { await page.click('#begin'); await page.waitForFunction(() => window.__wc?.map && document.querySelector('#map-loading')?.classList.contains('hidden'), null, { timeout: 240000, polling: 500 }); await page.waitForTimeout(1500); }))) return out;
    await step('welcome', async () => { await page.click('#welcome-go', { timeout: 10000 }); await page.waitForTimeout(400); });
    if (!(await step('order', async () => { await page.fill('#order-input', 'Raise 200 archers at Winterfell.'); await page.click('#send-btn'); await page.waitForSelector('#orders .order .receipt .rl', { timeout: 30000 }); }))) return out;
    if (!(await step('jump', async () => { await page.click('#hud-top .advance-btn'); await page.waitForFunction(() => document.querySelector('#busy')?.classList.contains('hidden'), null, { timeout: 240000, polling: 500 }); await page.waitForTimeout(1000); }))) return out;
    await step('playback', async () => { for (let i = 0; i < 6; i++) { if (await page.evaluate(() => { const m = document.querySelector('#modal'); return m && !m.classList.contains('hidden'); })) { await page.keyboard.press('Escape'); await page.waitForTimeout(300); } } await page.waitForTimeout(1500); });
    await step('matter', async () => {
      await page.evaluate(async () => { const s = window.__wc.state; const dn = (d) => d.year * 360 + (d.month - 1) * 30 + (d.day - 1); s.decisions = (s.decisions || []).filter((d) => d.status !== 'pending'); s.decisions.push({ id: 'flow_matter', matter: 'border_quarrel', title: 'A border quarrel', text: 'Two lords claim a mill. Both appeal to you.', from: 'jon_umber', options: [{ label: 'Judge for the first', hint: 'The first is grateful' }, { label: 'Judge for the second', hint: 'The second is grateful' }], date: 'today', turn: s.meta.turn, day: dn(s.meta.date), days: 9, status: 'pending' }); (await import('/js/ui/chrome.js')).openItem('matter', 'flow_matter'); });
      await page.waitForSelector('#modal-box .dec-opt', { timeout: 10000 }); await page.click('#modal-box .dec-opt'); await page.waitForTimeout(2500);
    });
    await page.waitForTimeout(500);
  } finally { await page.close(); }
  return out;
}

async function main() {
  const saves = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-visual-'));
  const srv = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), WC_PROVIDER: 'mock', WC_SAVES: saves }, stdio: 'ignore' });
  let browser = null; const stop = () => { try { srv.kill(); } catch { /* gone */ } };
  process.on('SIGINT', () => { stop(); process.exit(130); });
  const findings = []; let errorsTotal = 0;
  try {
    for (let i = 0; i < 100; i++) { try { await api('/version'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
    const { chromium } = playwright();
    browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
    const { id } = await api('/games', { scenario: 'agot_298', house: 'stark', seed: 298 });
    for (let i = 0; i < 5; i++) await api(`/games/${id}/advance`, { span: '7d', orders: [] });
    const flowOut = SCENE_ONLY ? null : await flow(browser); if (flowOut) say(`flow: ${flowOut.steps.join(' > ')}${flowOut.failed ? ' FAILED ' + flowOut.failed : ''}`); findings.push({ w: 1366, h: 768, scene: '(flow)', flow: flowOut });
    const scenes = Object.keys(SCENES).filter((s) => !SCENE_ONLY || s === SCENE_ONLY);
    for (const [w, h] of SIZES) {
      const page = await browser.newPage({ viewport: { width: w, height: h } }); page.setDefaultTimeout(60000);
      const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 140)); });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.addInitScript((gid) => { try { localStorage.setItem('voice-download', '"off"'); localStorage.setItem('gfx-quality', 'fast'); localStorage.setItem('map-life', '0'); localStorage.setItem('wc.welcomed.' + gid, '1'); localStorage.setItem('wc.coach.' + gid, '["command","turn","realm"]'); } catch { /* */ } }, id);
      await page.goto(`http://127.0.0.1:${PORT}/?dev&game=${id}`);
      await page.waitForFunction(() => window.__wc?.map && document.querySelector('#map-loading')?.classList.contains('hidden'), null, { timeout: 240000, polling: 500 });
      await page.waitForTimeout(2000); await page.evaluate(() => window.__wc?.map?.renderer?.setAnimationLoop?.(null));
      for (const scene of scenes) {
        say(`${w}x${h} ${scene}`);
        try { await SCENES[scene](page); } catch (e) { findings.push({ w, h, scene, error: String(e.message).split('\n')[0] }); await close(page); continue; }
        await page.waitForTimeout(400);
        const r = await page.evaluate(scan); r.rings = await ringScan(page); await page.evaluate(() => document.activeElement?.blur?.());
        // 10: Escape closes the top-most panel, and focus returns to what opened it (only where a panel is open)
        if (scene !== 'plain') { r.escape = await page.evaluate(() => document.activeElement?.tagName || ''); }
        if (has('--shots')) { fs.mkdirSync(OUT, { recursive: true }); await page.screenshot({ path: path.join(OUT, `visual-${scene}-${w}x${h}.jpg`), type: 'jpeg', quality: 80, timeout: 120000, animations: 'disabled' }); }
        findings.push({ w, h, scene, ...r });
        await close(page);
      }
      errorsTotal += errors.length; findings.push({ w, h, scene: '(page errors)', errors }); await page.close();
    }
  } finally { if (browser) await browser.close().catch(() => {}); stop(); fs.rmSync(saves, { recursive: true, force: true }); }

  if (has('--json')) { console.log(JSON.stringify(findings, null, 1)); }
  // the table: one row per check, one column per size, the count of scenes that fail
  const sizes = SIZES.map(([w, h]) => `${w}x${h}`); const pad = (s, n) => String(s).padEnd(n);
  const lines = [pad('check', 44) + sizes.map((s) => pad(s, 12)).join('') + 'worst scene']; let failed = 0; const details = [];
  for (const [name, key, ok] of CHECKS) {
    const cells = SIZES.map(([w, h]) => { const rows = findings.filter((f) => f.w === w && f.h === h && f.scene in SCENES && !f.error); const bad = rows.filter((r) => !ok(r)); if (bad.length) { failed++; for (const b of bad) details.push([name, `${w}x${h}`, b.scene, [].concat(b[key] === true || b[key] === false ? (b.hscroll ? ['horizontal scroll'] : []).concat(b.outside || []) : b[key]).slice(0, 6)]); } return bad.length ? `${bad.length} scene${bad.length > 1 ? 's' : ''}` : 'ok'; });
    const worst = details.filter((d) => d[0] === name).map((d) => d[2]); lines.push(pad(name, 44) + cells.map((c) => pad(c, 12)).join('') + [...new Set(worst)].slice(0, 4).join(', '));
  }
  const flowF = findings.find((f) => f.scene === '(flow)')?.flow; const flowBad = flowF ? (flowF.failed ? 1 : 0) + flowF.errors.length : 0;
  lines.push(pad('20 title > order > jump > playback > matter', 44) + (flowF ? (flowBad ? `FAIL: ${flowF.failed || flowF.errors[0]}` : `ok (${flowF.steps.length} steps, no console errors)`) : 'skipped'));
  const broken = findings.filter((f) => f.error); const errs = findings.filter((f) => f.errors?.length);
  lines.push(pad('   scenes that would not open', 44) + sizes.map((s) => pad(broken.filter((b) => `${b.w}x${b.h}` === s).length || 'ok', 12)).join('') + broken.map((b) => b.scene).slice(0, 4).join(', '));
  lines.push(pad('   page errors', 44) + sizes.map((s) => pad(findings.filter((f) => `${f.w}x${f.h}` === s && f.errors?.length).reduce((n, f) => n + f.errors.length, 0) || 'ok', 12)).join(''));
  console.log(lines.join('\n'));
  if (has('--verbose') || failed) { console.log('\nwhat was found'); for (const [name, size, scene, list] of details) console.log(`  ${name.trim()} · ${size} · ${scene}\n      ${list.join('\n      ')}`); for (const b of broken) console.log(`  scene ${b.scene} at ${b.w}x${b.h} did not open: ${b.error}`); for (const e of errs) console.log(`  page errors at ${e.w}x${e.h}: ${e.errors.slice(0, 3).join(' | ')}`); }
  const bad = failed + broken.length + errorsTotal + flowBad;
  console.log(bad ? `\nVISUAL: FAIL — ${failed} check(s) over the tour${broken.length ? `, ${broken.length} scene(s) did not open` : ''}${errorsTotal ? `, ${errorsTotal} page error(s)` : ''}` : '\nVISUAL: PASS');
  process.exitCode = bad ? 1 : 0;
}
main().catch((e) => { console.error(e); process.exit(2); });
