// The acceptance gate of the quiet screen (docs/gdd/17-ui-declutter.md §5), measured in a real browser.
//
//   node scripts/ui-gate.mjs                 both sizes at turn 0 and turn 5; a table; exit 1 if any gate fails
//   node scripts/ui-gate.mjs --quick         turn 0 only (half the time)
//   node scripts/ui-gate.mjs --shots         also write visual-out/ui-gate-t<turn>-<w>x<h>.jpg
//   node scripts/ui-gate.mjs --size=1366     one size only (for a quick look while building)
//   node scripts/ui-gate.mjs --verbose       list what each failing row found (the elements, the pairs, the wrapped lines)
//   UI_GATE_PORT=3496 node scripts/ui-gate.mjs
//
// Dev tool, not part of `npm test`: it needs Playwright (`npm i --no-save playwright`, or a global install) and a browser
// that can draw WebGL without a GPU (SwiftShader, the flags of scripts/screens.js). It starts the server itself on the mock
// provider with a temporary saves folder, begins a Stark game, and — with the panels closed, motion reduced so the layout
// is the settled one — measures, at 1920×1080 and 1366×768:
//   • interactive controls visible            • text blocks of two or more lines       • % of pixels the HUD covers
//   • the top bar's height and wrapped text   • overlaps between HUD elements/controls • Economy/Military/Diplomacy/
//   Intrigue buttons visible                  • R opens the Realm within 250 ms        • the old hotkeys each open something
//   • the ruler's portrait is on screen       • no uncaught page errors                • Escape closes popovers first
// It is meant to FAIL on the eight-button dock, the six-tile resource row and the left drawer, and to pass on the quiet screen.
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'visual-out');
const PORT = Number(process.env.UI_GATE_PORT || 3496);
const ARGS = new Set(process.argv.slice(2));
const ONLY = process.argv.slice(2).find((a) => a.startsWith('--size='))?.slice(7); // --size=1366 measures just that width
const SIZES = [[1920, 1080], [1366, 768]].filter(([w]) => !ONLY || String(w) === ONLY);
const T0 = Date.now(); const say = (m) => process.stderr.write(`[${((Date.now() - T0) / 1000).toFixed(1)}s] ${m}\n`);
const TURNS = ARGS.has('--quick') ? [0] : [0, 5];

// the gate, straight from GDD 17 §5 (and the acceptance lines of U1–U3)
const GATE = {
  controls: (turn) => (turn === 0 ? 20 : 16),
  textBlocks: 3,
  hudPct: (w) => (w >= 1920 ? 15 : 20),
  topBarPx: (w) => (w >= 1920 ? 56 : 48),
  topWraps: 0, overlaps: 0, dock: 0, realmMs: 250, hotkeys: 8,
};
const HOTKEYS = ['r', 'p', 'h', 'm', 'e', 'd', 'c', 'i'];

function playwright() {
  const require = createRequire(import.meta.url);
  try { return require('playwright'); } catch { /* not installed locally */ }
  return require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
}
const api = async (p, body) => {
  const r = await fetch(`http://127.0.0.1:${PORT}/api${p}`, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
  const j = await r.json(); if (!r.ok) throw new Error(j.error || r.status); return j;
};

// ───────────── what the page measures for us (runs inside the browser) ─────────────
// Everything that needs layout is answered here and returned as plain numbers; the arithmetic on it is Node's.
function pageLib() {
  const vpW = innerWidth, vpH = innerHeight;
  const game = document.querySelector('#game-screen'); const mapw = document.querySelector('#map-wrap');
  const R = (el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
  const inView = (r) => r.w > 0 && r.h > 0 && r.x + r.w > 0 && r.y + r.h > 0 && r.x < vpW && r.y < vpH;
  const shown = (el) => el.isConnected && (el.checkVisibility ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) : true);
  const D = (el) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''}${el.dataset?.action ? `[${el.dataset.action}]` : el.dataset?.win ? `[win:${el.dataset.win}]` : ''}`;
  const nameOf = (el) => [el.getAttribute('aria-label'), el.innerText, el.getAttribute('title')].filter(Boolean).join(' | ').replace(/\s+/g, ' ').trim().slice(0, 90);
  const paints = (cs) => (cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent') || (cs.backgroundImage && cs.backgroundImage !== 'none') || cs.borderImageSource !== 'none';

  // the boxes an element really occupies: a see-through, click-through wrapper is only its children
  const boxes = (el, out = []) => {
    if (!shown(el)) return out;
    const cs = getComputedStyle(el);
    if (cs.pointerEvents === 'none' && el.children.length && !paints(cs)) { for (const c of el.children) boxes(c, out); return out; }
    const r = R(el); if (inView(r)) out.push({ d: D(el), ...r });
    return out;
  };
  const ROOTS = ['#hud-top', '#strip', '#command-bar', '#hud-player', '#drawer', '#drawer-open', '#mapmodes', '#mapmode', '#menu-pop', '#inbox', '#map-legend', '#window', '#sheet', '#pick-hint'];
  const roots = () => {
    const els = ROOTS.map((s) => document.querySelector(s)).filter(Boolean);
    return els.filter((e) => !els.some((o) => o !== e && o.contains(e)));
  };
  const CONTROL = 'button, input:not([type=hidden]), textarea, select, a[href], [role=button], [role=tab], [role=menuitem], [data-action], [data-win], [data-win-open], [data-vital], [data-mode], [tabindex]:not([tabindex="-1"])';
  const controls = () => {
    const all = [...game.querySelectorAll(CONTROL)].filter((el) => !mapw.contains(el) && shown(el) && (() => { const r = R(el); return inView(r) && r.w * r.h >= 4; })());
    return all.filter((el) => !all.some((o) => o !== el && el.contains(o)));
  };
  // text blocks and how many lines each takes: a block is the nearest non-inline ancestor of its text; the strip is one block
  const textBlocks = () => {
    const blocks = new Map(); const walker = document.createTreeWalker(game, NodeFilter.SHOW_TEXT);
    for (let n; (n = walker.nextNode());) {
      if (!n.nodeValue.trim()) continue;
      let el = n.parentElement; if (!el || mapw.contains(el) || !shown(el)) continue;
      while (el.parentElement && getComputedStyle(el).display === 'inline') el = el.parentElement;
      const range = document.createRange(); range.selectNodeContents(n);
      const rs = [...range.getClientRects()].filter((r) => r.width > 2 && r.height > 4 && r.bottom > 0 && r.top < vpH && r.right > 0 && r.left < vpW);
      if (!rs.length) continue;
      const key = el.closest('#strip') || el;
      const b = blocks.get(key) || { d: D(key), inTop: !!el.closest('#hud-top'), ys: [], h: 0, text: '' };
      for (const r of rs) { b.ys.push(r.top + r.height / 2); b.h = Math.max(b.h, r.height); }
      b.text = (b.text + ' ' + n.nodeValue.trim()).trim().slice(0, 70); blocks.set(key, b);
    }
    return [...blocks.values()].map((b) => { const ys = b.ys.sort((p, q) => p - q); let lines = 1; for (let i = 1; i < ys.length; i++) if (ys[i] - ys[i - 1] > b.h * 0.6) lines++; return { d: b.d, inTop: b.inTop, lines, text: b.text }; });
  };
  const panelOpen = () => { const w = document.querySelector('#window'); const m = document.querySelector('#modal'); const s = document.querySelector('#sheet'); const open = (e) => e && !e.classList.contains('hidden') && e.getAttribute('aria-hidden') !== 'true' && shown(e); return open(w) ? 'window' : open(m) ? 'modal' : open(s) ? 'sheet' : null; };
  const titleOf = () => (document.querySelector('#win-title')?.textContent || document.querySelector('#modal-box h2, #modal-box h3')?.textContent || document.querySelector('#sheet h2, #sheet h3, #sheet .title')?.textContent || '').trim().slice(0, 40);
  const hudArea = () => roots().flatMap((e) => boxes(e)).reduce((a, b) => a + b.w * b.h, 0);

  window.__gate = {
    snapshot() {
      const rootBoxes = roots().map((e) => ({ root: D(e), boxes: boxes(e) })).filter((r) => r.boxes.length);
      const ctl = controls().map((el) => ({ d: D(el), name: nameOf(el), win: el.dataset?.win || '', mode: 'mode' in (el.dataset || {}) || !!el.closest('#mapmodes, #mapmode'), ...R(el) }));
      const top = document.querySelector('#hud-top'); const tb = top && shown(top) ? R(top) : null;
      const blocks = textBlocks();
      const por = document.querySelector('#player-portrait'); const img = por?.querySelector('img');
      return { rootBoxes, ctl, topH: tb ? tb.h : null, blocks, portrait: !!(por && shown(por) && inView(R(por)) && img && img.complete && img.naturalWidth > 0), hasMenuPop: !!document.querySelector('#menu-pop'), turn: window.__wc?.state?.meta?.turn ?? null };
    },
    panelOpen, titleOf, hudArea,
    // time from a keydown to a panel being open, in the page's own clock: the handler and whatever it fetches, not the
    // frames a software renderer takes to paint (a MutationObserver fires the moment the panel's class changes)
    armTimer() {
      window.__opened = new Promise((res) => document.addEventListener('keydown', () => {
        const t0 = performance.now();
        // "open" here is the flag the page raises (the class comes off), not the pixels: a fade-in is not the handler being slow
        const flagOpen = () => ['#window', '#modal', '#sheet'].some((q) => { const e = document.querySelector(q); return e && !e.classList.contains('hidden') && e.getAttribute('aria-hidden') !== 'true'; });
        const done = () => { if (!flagOpen()) return false; obs.disconnect(); res(performance.now() - t0); return true; };
        const obs = new MutationObserver(done); obs.observe(document.body, { attributes: true, childList: true, subtree: true });
        setTimeout(() => { if (!done()) setTimeout(() => { obs.disconnect(); res(null); }, 3000); }, 0);
      }, { capture: true, once: true }));
    },
    visible: (sel) => { const e = document.querySelector(sel); return !!(e && shown(e) && inView(R(e)) && !e.classList.contains('hidden')); },
  };
}

// ───────────── the arithmetic (Node) ─────────────
const inter = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
// area of a union of rectangles, clipped to the screen, by coordinate compression
function unionArea(rects, W, H) {
  const rs = rects.map((r) => ({ x0: Math.max(0, r.x), y0: Math.max(0, r.y), x1: Math.min(W, r.x + r.w), y1: Math.min(H, r.y + r.h) })).filter((r) => r.x1 > r.x0 && r.y1 > r.y0);
  const xs = [...new Set(rs.flatMap((r) => [r.x0, r.x1]))].sort((a, b) => a - b); let area = 0;
  for (let i = 0; i + 1 < xs.length; i++) {
    const cover = rs.filter((r) => r.x0 <= xs[i] && r.x1 >= xs[i + 1]).map((r) => [r.y0, r.y1]).sort((a, b) => a[0] - b[0]); let y = -Infinity, len = 0;
    for (const [a, b] of cover) { const s = Math.max(a, y); if (b > s) { len += b - s; y = b; } }
    area += len * (xs[i + 1] - xs[i]);
  }
  return area;
}
const DOCK_WORDS = /^(economy|military|diplomacy|intrigue)\b/i;
function judge(snap, w, h, turn) {
  const rects = snap.rootBoxes.flatMap((r) => r.boxes);
  const hudPct = (100 * unionArea(rects, w, h)) / (w * h);
  const overlapsOf = (list, label) => { const out = []; for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) { const a = list[i], b = list[j]; if (a.rootIdx !== undefined && a.rootIdx === b.rootIdx) continue; const area = inter(a, b); if (area >= 4) out.push(`${label}: ${a.d} × ${b.d} (${Math.round(area)} px²)`); } return out; };
  const flat = snap.rootBoxes.flatMap((r, rootIdx) => r.boxes.map((b) => ({ ...b, rootIdx })));
  const overlaps = [...overlapsOf(flat, 'HUD'), ...overlapsOf(snap.ctl, 'controls')];
  const dock = snap.ctl.filter((c) => !c.mode && (['economy', 'military', 'diplomacy', 'intrigue', 'council'].includes(c.win) || DOCK_WORDS.test(c.name.replace(/^[^A-Za-z]+/, ''))));
  const wide = snap.blocks.filter((b) => b.lines >= 2);
  const wraps = wide.filter((b) => b.inTop);
  return { hudPct, controls: snap.ctl.length, ctl: snap.ctl, blocks: wide.length, wide, topH: snap.topH, wraps: wraps.length, wrapped: wraps, overlaps: overlaps.length, overlapList: overlaps, dock: dock.length, dockList: dock.map((c) => c.d + ' "' + c.name + '"'), portrait: snap.portrait, turn: snap.turn };
}

// ───────────── driving the page ─────────────
async function closeAll(page) { for (let i = 0; i < 4; i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(60); } }
async function probes(page) {
  const out = { realmMs: null, realmCold: null, keys: [], escape: 'n/a' };
  await page.evaluate(() => document.activeElement?.blur?.());
  // R: one press, the Realm opens (≤ 250 ms, GDD 17 §5). The first press pays for loading and painting, so it is shown in
  // brackets; the gate is on the second, the one a player makes a hundred times.
  const timed = async () => {
    await page.evaluate(() => document.activeElement?.blur?.()); await page.evaluate(() => window.__gate.armTimer()); await page.keyboard.press('r');
    const ms = await Promise.race([page.evaluate(() => window.__opened), new Promise((r) => setTimeout(() => r(null), 8000))]); await closeAll(page); return ms;
  };
  out.realmCold = await timed(); out.realmMs = await timed();
  // every old hotkey opens something (a window, the chronicle, a card, or the strip growing)
  for (const k of HOTKEYS) {
    await page.evaluate(() => document.activeElement?.blur?.());
    const before = await page.evaluate(() => window.__gate.hudArea());
    await page.keyboard.press(k);
    let got = null;
    for (let t = 0; t < 30 && !got; t++) {
      await page.waitForTimeout(50);
      got = await page.evaluate((b) => { const p = window.__gate.panelOpen(); const grew = window.__gate.hudArea() - b > 5000; return p || grew ? { panel: p || 'strip', title: window.__gate.titleOf() } : null; }, before);
    }
    out.keys.push({ key: k, opened: !!got, title: got?.title || '', panel: got?.panel || '' });
    await closeAll(page);
  }
  // Escape closes the menu popover before the window (only when the page has a menu popover to test)
  const hasPop = await page.evaluate(() => !!document.querySelector('#menu-pop'));
  if (hasPop) {
    await page.keyboard.press('r'); await page.waitForTimeout(250);
    const btn = await page.$('#hud-top [data-action="menu"], #menu-btn');
    if (btn) {
      await btn.click(); await page.waitForTimeout(250);
      const popOpen = await page.evaluate(() => window.__gate.visible('#menu-pop'));
      await page.keyboard.press('Escape'); await page.waitForTimeout(250);
      const st = await page.evaluate(() => ({ pop: window.__gate.visible('#menu-pop'), win: window.__gate.panelOpen() }));
      out.escape = popOpen && !st.pop && st.win === 'window' ? 'ok' : popOpen ? `FAIL (menu ${st.pop ? 'still open' : 'closed'}, window ${st.win || 'closed'})` : 'FAIL (menu did not open)';
    } else out.escape = 'FAIL (no menu button)';
    await closeAll(page);
  }
  return out;
}
// U4 (GDD 17 §4): a click on a castle opens a card beside it, clear of the bars, the strip, the command bar and the ruler; Escape closes it first; "More" opens the sheet
// in the window's place; the old keys land on their tabs; a window or a sheet never covers the command bar.
const KEEP = ['#hud-top .hud-left', '#hud-top .hud-right', '#strip', '#command-bar', '#hud-player'];
async function probeCards(page) {
  const out = { cardOpens: false, cardClear: 'n/a', cardEsc: 'n/a', more: 'n/a', tabs: [], panelsClear: 'n/a' };
  const rects = (sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e || e.classList.contains('hidden')) return null; const r = e.getBoundingClientRect(); return r.width ? [r.left, r.top, r.right, r.bottom] : null; }, sel);
  const hit = (a, b) => a && b && a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
  const seat = await page.evaluate(() => { const s = window.__wc.state; const h = s.holdings[s.houses[s.meta.player].seat]; const p = window.__wc.map.screenOf(h.pos[0], h.pos[1]); return p ? { id: h.id, x: p.x, y: p.y } : null; });
  if (seat) {
    await page.evaluate(() => document.activeElement?.blur?.());
    await page.mouse.click(seat.x, seat.y); await page.waitForTimeout(500);
    const card = await rects('#card'); out.cardOpens = !!card;
    if (card) {
      const bad = []; for (const k of KEEP) if (hit(card, await rects(k))) bad.push(k);
      const vp = page.viewportSize(); if (card[0] < 0 || card[1] < 0 || card[2] > vp.width || card[3] > vp.height) bad.push('the screen');
      out.cardClear = bad.length ? 'FAIL: ' + bad.join(', ') : 'ok';
      const more = await page.$('#card [data-card-more]'); if (more) { await more.click(); await page.waitForTimeout(400); const st = await page.evaluate(() => ({ sheet: window.__gate.visible('#sheet'), win: window.__gate.visible('#window'), card: window.__gate.visible('#card') })); out.more = st.sheet && !st.card && !st.win ? 'ok' : 'FAIL ' + JSON.stringify(st); await page.keyboard.press('Escape'); await page.waitForTimeout(150); }
      await page.mouse.click(seat.x, seat.y); await page.waitForTimeout(400);
      await page.keyboard.press('Escape'); await page.waitForTimeout(200);
      out.cardEsc = (await rects('#card')) ? 'FAIL: card still open' : 'ok';
    }
  }
  // the old keys land on their tabs, and what opens never covers the command bar
  const land = { r: 'realm/ledger', m: 'realm/hosts', e: 'realm/coin', d: 'realm/courts', c: 'people/council', i: 'people/shadows', p: 'people/people' };
  let bad = [];
  for (const [k, want] of Object.entries(land)) {
    await page.evaluate(() => document.activeElement?.blur?.()); await page.keyboard.press(k); await page.waitForTimeout(350);
    const got = await page.evaluate(() => window.__wc.win + '/' + window.__wc.tab); out.tabs.push({ key: k, want, got });
    const win = await rects('#window'); if (hit(win, await rects('#command-bar'))) bad.push('window over the command bar (' + k + ')');
    await page.keyboard.press('Escape'); await page.waitForTimeout(120);
  }
  if (seat) { await page.evaluate((id) => window.__wc.openSheet('holding', id), seat.id); await page.waitForTimeout(300); const sh = await rects('#sheet'); if (hit(sh, await rects('#command-bar'))) bad.push('sheet over the command bar'); if (await rects('#window')) bad.push('window and sheet together'); await page.keyboard.press('Escape'); await page.waitForTimeout(150); }
  out.panelsClear = bad.length ? 'FAIL: ' + bad.join('; ') : 'ok';
  return out;
}
// U8 (GDD 17 §2.6–2.7): a new game shows the welcome card once; three coach marks in order, each put away by doing its thing; and F leaves the map and the command bar.
async function probeFirstRun(browser, w, h) {
  const { id } = await api('/games', { scenario: 'agot_298', house: 'stark', seed: 298 });
  const page = await browser.newPage({ viewport: { width: w, height: h } }); page.setDefaultTimeout(120000);
  const errors = []; page.on('pageerror', (e) => errors.push(e.message)); await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => { try { localStorage.setItem('gfx-quality', 'fast'); localStorage.setItem('map-life', '0'); } catch { /* */ } });
  const boot = async () => { await page.goto(`http://127.0.0.1:${PORT}/?dev&game=${id}`); await page.waitForFunction(() => window.__wc?.map && document.querySelector('#map-loading')?.classList.contains('hidden'), null, { timeout: 240000, polling: 500 }); await page.waitForTimeout(1200); await page.evaluate(() => window.__wc?.map?.renderer?.setAnimationLoop?.(null)); await page.evaluate(`(${pageLib.toString()})()`); };
  const mark = () => page.evaluate(() => document.querySelector('#coach .wc-coach')?.dataset.mark || null);
  const slip = () => page.evaluate(() => { const s = document.querySelector('#coach .wc-slip'); if (!s) return null; const r = s.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; });
  const out = { welcome: false, marks: [], slipInside: true, again: 'n/a', focus: null, focusBack: false, flag: false, errors };
  await boot();
  out.welcome = await page.evaluate(() => window.__gate.visible('#modal') && !!document.querySelector('.wc-welcome #welcome-go'));
  await page.click('#welcome-go'); await page.waitForTimeout(500);
  const vp = page.viewportSize(); const inside = (r) => r && r[0] >= 0 && r[1] >= 0 && r[2] <= vp.width && r[3] <= vp.height;
  out.marks.push(await mark()); if (!inside(await slip())) out.slipInside = false;
  await page.fill('#order-input', 'Send Ser Rodrik to hold the Stony Shore'); await page.keyboard.press('Enter'); await page.waitForTimeout(3000);
  out.marks.push(await mark()); if (!inside(await slip())) out.slipInside = false;
  await page.click('#hud-top .advance-btn'); await page.waitForTimeout(800);
  await page.waitForFunction(() => document.querySelector('#busy')?.classList.contains('hidden'), null, { timeout: 180000, polling: 500 }); await page.waitForTimeout(800);
  for (let i = 0; i < 4; i++) { if (await page.evaluate(() => window.__gate.visible('#modal'))) { await page.keyboard.press('Escape'); await page.waitForTimeout(300); } }
  await page.evaluate(() => window.__wc.state.meta.turn <= 2 && window.__wc.renderTop?.());
  out.marks.push(await mark()); if (!inside(await slip())) out.slipInside = false;
  await page.evaluate(() => document.activeElement?.blur?.()); await page.keyboard.press('r'); await page.waitForTimeout(600);
  out.marks.push(await mark()); await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  // a reload shows neither the card nor a mark again
  await boot(); out.again = (await page.evaluate(() => window.__gate.visible('#modal') || !!document.querySelector('.wc-welcome'))) || (await mark()) ? 'FAIL: shown again' : 'ok';
  out.flag = (await api(`/games/${id}`)).meta?.welcomed === true;
  // focus mode: the map and the command bar, and F again brings the bars back
  await page.evaluate(() => document.activeElement?.blur?.()); await page.keyboard.press('f'); await page.waitForTimeout(400);
  out.focus = await page.evaluate(() => window.__gate.snapshot().ctl.length);
  await page.keyboard.press('f'); await page.waitForTimeout(400);
  out.focusBack = await page.evaluate(() => window.__gate.visible('#hud-top') && window.__gate.visible('#strip'));
  await page.close(); return out;
}
// U9 (GDD 17 §4): portraits and family trees, improved in place — the People tab opens on your own people with faces, the tree draws its lines, the ruler's plate has a hover card, the chronicle's cards carry faces.
async function probePeople(page) {
  const out = { people: 'n/a', tree: 'n/a', hover: 'n/a', faces: 'n/a' };
  await page.evaluate(() => document.activeElement?.blur?.()); await page.keyboard.press('p'); await page.waitForTimeout(700);
  const p = await page.evaluate(() => ({ sec: [...document.querySelectorAll('#people-rows .ppl-sec')].map((x) => x.dataset.sec), faces: document.querySelectorAll('#people-rows img.por').length }));
  out.people = p.sec.includes('family') && p.faces >= 3 ? 'ok' : `FAIL ${JSON.stringify(p)}`;
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  const lord = await page.evaluate(() => { const s = window.__wc.state; return s.houses[s.meta.player].lord; });
  await page.evaluate((id) => window.__wc.openSheet('char', id), lord); await page.waitForTimeout(400);
  const btn = await page.$('#sheet [data-tree]'); if (btn) {
    await btn.click(); await page.waitForTimeout(900);
    const t = await page.evaluate(() => ({ cards: document.querySelectorAll('#tree .tm').length, imgs: document.querySelectorAll('#tree .tm img').length, d: document.querySelector('#tree .tree-links path')?.getAttribute('d')?.length || 0 }));
    out.tree = t.cards >= 3 && t.imgs === t.cards && t.d > 20 ? 'ok' : `FAIL ${JSON.stringify(t)}`;
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    await page.evaluate(() => { document.querySelector('#modal')?.classList.add('hidden'); });
  } else out.tree = 'FAIL: no Family tree button';
  await closeAll(page);
  await page.hover('#player-portrait'); await page.waitForTimeout(300);
  const hv = await page.evaluate(() => { const c = document.querySelector('#player-card'); return { shown: !!c && getComputedStyle(c).display !== 'none', text: c?.textContent || '', mood: document.querySelector('#player-portrait')?.dataset.mood }; });
  out.hover = hv.shown && hv.text.length > 20 && hv.mood ? 'ok' : `FAIL ${JSON.stringify(hv)}`;
  await page.mouse.move(5, 300);
  const hasCards = await page.evaluate(() => (window.__wc.state.history || []).some((t) => (t.events || []).some((e) => e.tier && e.tier !== 'minor' && (e.who || []).some((w) => window.__wc.state.characters[w]))));
  if (hasCards) { await page.keyboard.press('h'); await page.waitForTimeout(900); const n = await page.evaluate(() => document.querySelectorAll('#drawer .wc-card__faces img').length); out.faces = n >= 1 ? 'ok' : 'FAIL: none'; await closeAll(page); }
  return out;
}
async function measure(browser, id, w, h, turn) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.setDefaultTimeout(90000);
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // the map is not what is measured: the cheap settings keep SwiftShader from drawing a forest every frame while we ask questions
  await page.addInitScript((gid) => { try { localStorage.setItem('gfx-quality', 'fast'); localStorage.setItem('map-life', '0'); localStorage.setItem('wc.welcomed.' + gid, '1'); localStorage.setItem('wc.coach.' + gid, JSON.stringify(['command', 'turn', 'realm'])); } catch { /* private mode */ } }, id);
  await page.goto(`http://127.0.0.1:${PORT}/?dev&game=${id}`);
  say('page loading'); await page.waitForFunction(() => window.__wc?.map && document.querySelector('#map-loading')?.classList.contains('hidden'), null, { timeout: 240000, polling: 500 });
  say('map ready'); await page.waitForTimeout(2000);
  if (ARGS.has('--shots')) { fs.mkdirSync(OUT, { recursive: true }); await page.screenshot({ path: path.join(OUT, `ui-gate-t${turn}-${w}x${h}.jpg`), type: 'jpeg', quality: 82, timeout: 180000, animations: 'disabled' }); say('shot'); }
  // the HUD is DOM: once the map has been drawn, stop its render loop so a CPU-only renderer is not busy while we ask questions
  await page.evaluate(() => window.__wc?.map?.renderer?.setAnimationLoop?.(null));
  await page.evaluate(`(${pageLib.toString()})()`);
  const snap = await page.evaluate(() => window.__gate.snapshot());
  say('measured');
  const res = judge(snap, w, h, turn);
  Object.assign(res, await probes(page));
  say('probed');
  Object.assign(res, { u4: await probeCards(page) });
  say('cards probed');
  Object.assign(res, { u9: await probePeople(page) });
  say('people probed');
  res.errors = errors; await page.close();
  return res;
}

// ───────────── the table ─────────────
function report(cells) {
  const rows = [
    ['controls visible', (c) => c.controls, (c) => c.controls <= GATE.controls(c.turn), (c) => `≤ ${GATE.controls(0)} at turn 0, ≤ ${GATE.controls(5)} at turn 5`],
    ['text blocks of 2+ lines', (c) => c.blocks, (c) => c.blocks <= GATE.textBlocks, () => `≤ ${GATE.textBlocks} (the strip counts as 1)`],
    ['HUD covers % of pixels', (c) => c.hudPct.toFixed(1), (c) => c.hudPct <= GATE.hudPct(c.w), () => `≤ ${GATE.hudPct(1920)} at 1920, ≤ ${GATE.hudPct(1366)} at 1366`],
    ['top bar height px', (c) => (c.topH == null ? 'none' : Math.round(c.topH)), (c) => c.topH != null && c.topH <= GATE.topBarPx(c.w), () => `≤ ${GATE.topBarPx(1920)} / ${GATE.topBarPx(1366)}`],
    ['top-bar text wrapping', (c) => c.wraps, (c) => c.wraps <= GATE.topWraps, () => 'none'],
    ['overlapping HUD pairs', (c) => c.overlaps, (c) => c.overlaps <= GATE.overlaps, () => '0'],
    ['Economy/Military/Diplomacy/Intrigue buttons', (c) => c.dock, (c) => c.dock <= GATE.dock, () => '0'],
    ['R opens the Realm, ms warm (cold)', (c) => (c.realmMs == null ? 'never' : `${Math.round(c.realmMs)} (${c.realmCold == null ? '-' : Math.round(c.realmCold)})`), (c) => c.realmMs != null && c.realmMs <= GATE.realmMs, () => `≤ ${GATE.realmMs}`],
    ['old hotkeys that open something', (c) => `${c.keys.filter((k) => k.opened).length}/8`, (c) => c.keys.filter((k) => k.opened).length === GATE.hotkeys, () => 'r p h m e d c i: 8/8'],
    ["ruler's portrait on screen", (c) => (c.portrait ? 'yes' : 'NO'), (c) => c.portrait, () => 'yes'],
    ['uncaught page errors', (c) => c.errors.length, (c) => c.errors.length === 0, () => '0'],
    ['a click on a castle opens its card', (c) => (c.u4.cardOpens ? 'yes' : 'NO'), (c) => c.u4.cardOpens, () => 'yes'],
    ['the card keeps clear of bars, strip, ruler', (c) => c.u4.cardClear, (c) => c.u4.cardClear === 'ok', () => 'ok'],
    ['Escape closes the card first', (c) => c.u4.cardEsc, (c) => c.u4.cardEsc === 'ok', () => 'ok'],
    ['"More" opens the sheet in place of a window', (c) => c.u4.more, (c) => c.u4.more === 'ok', () => 'ok'],
    ['old keys land on their tabs', (c) => `${c.u4.tabs.filter((t) => t.got === t.want).length}/${c.u4.tabs.length}`, (c) => c.u4.tabs.length === 7 && c.u4.tabs.every((t) => t.got === t.want), () => '7/7'],
    ['windows and sheets clear of the command bar', (c) => c.u4.panelsClear, (c) => c.u4.panelsClear === 'ok', () => 'ok'],
    ['People tab opens on your family, with faces', (c) => c.u9.people, (c) => c.u9.people === 'ok', () => 'ok'],
    ['the family tree draws its portraits and lines', (c) => c.u9.tree, (c) => c.u9.tree === 'ok', () => 'ok'],
    ["the ruler's plate has a hover card and a ring", (c) => c.u9.hover, (c) => c.u9.hover === 'ok', () => 'ok'],
    ["the chronicle's cards carry faces (turn 5)", (c) => c.u9.faces, (c) => c.u9.faces === 'ok' || (c.turn === 0 && c.u9.faces === 'n/a'), () => 'ok (n/a at turn 0)'],
    ['the welcome card is shown on a new game', (c) => (c.first.welcome ? 'yes' : 'NO'), (c) => c.first.welcome, () => 'yes'],
    ['coach marks, in order, each put away by its thing', (c) => (c.first.marks.join('>') === 'command>turn>realm>' ? 'in order' : c.first.marks.map((m) => m || 'none').join('>')), (c) => c.first.marks.join('>') === 'command>turn>realm>', () => 'command>turn>realm>none'],
    ['a mark stays on the screen', (c) => (c.first.slipInside ? 'ok' : 'FAIL'), (c) => c.first.slipInside, () => 'ok'],
    ['never shown again after a reload (and on the server)', (c) => `${c.first.again}/${c.first.flag ? 'saved' : 'NOT SAVED'}`, (c) => c.first.again === 'ok' && c.first.flag, () => 'ok/saved'],
    ['focus mode: controls left (F), bars back on F', (c) => `${c.first.focus}${c.first.focusBack ? '' : ' NOT BACK'}`, (c) => c.first.focus != null && c.first.focus <= 6 && c.first.focusBack, () => '≤ 6, back'],
    ['Escape closes the menu first', (c) => c.escape, (c) => c.escape === 'n/a' || c.escape === 'ok', () => 'ok (n/a: no #menu-pop)'],
  ];
  const cols = cells.map((c) => `${c.w}x${c.h} t${c.turn}`);
  const pad = (s, n) => String(s).padEnd(n); const W0 = 46, W1 = 13, WT = 40;
  const lines = [pad('check', W0) + cols.map((c) => pad(c, W1)).join('') + 'target'];
  lines.push('-'.repeat(W0 + W1 * cols.length + WT));
  let failed = 0; const bad = [];
  for (const [name, val, ok, target] of rows) {
    const cellsTxt = cells.map((c) => { const pass = ok(c); if (!pass) { failed++; bad.push([name, c]); } return pad(`${val(c)}${pass ? '' : ' FAIL'}`, W1); });
    lines.push(pad(name, W0) + cellsTxt.join('') + target());
  }
  lines.push('-'.repeat(W0 + W1 * cols.length + WT));
  lines.push(`map share of the screen: ${cells.map((c) => `${(100 - c.hudPct).toFixed(1)}%`).join('  ')}   (target ≥ 85 % at 1920, ≥ 80 % at 1366)`);
  lines.push(failed ? `GATE: FAIL — ${failed} cell(s) outside the target` : 'GATE: PASS');
  console.log(lines.join('\n'));
  if (ARGS.has('--verbose') || failed) {
    const first = (l, n = 6) => l.slice(0, n).join('\n      ');
    console.log('\ndetails');
    for (const c of cells) {
      console.log(`  ${c.w}x${c.h} turn ${c.turn}`);
      console.log(`    controls (${c.controls}): ${c.ctl.map((x) => x.d).join(', ')}`);
      if (c.wide.length) console.log(`    text blocks of 2+ lines:\n      ${first(c.wide.map((b) => `${b.lines} lines  ${b.d}  "${b.text}"`), 8)}`);
      if (c.wrapped.length) console.log(`    top-bar text that wraps:\n      ${first(c.wrapped.map((b) => `${b.lines} lines  ${b.d}  "${b.text}"`))}`);
      if (c.overlapList.length) console.log(`    overlaps:\n      ${first(c.overlapList)}`);
      if (c.dockList.length) console.log(`    dock buttons:\n      ${first(c.dockList, 10)}`);
      if (c.keys.some((k) => !k.opened)) console.log(`    hotkeys that opened nothing: ${c.keys.filter((k) => !k.opened).map((k) => k.key).join(' ')}`);
      console.log(`    hotkey titles: ${c.keys.map((k) => `${k.key}→${k.title || (k.opened ? k.panel : '—')}`).join('  ')}`);
      if (c.errors.length) console.log(`    page errors:\n      ${first(c.errors, 3)}`);
    }
  }
  return failed;
}

async function main() {
  const saves = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-uigate-'));
  const srv = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), WC_PROVIDER: 'mock', WC_SAVES: saves }, stdio: 'ignore' });
  let browser = null; const stop = () => { try { srv.kill(); } catch { /* gone */ } };
  process.on('SIGINT', () => { stop(); process.exit(130); });
  try {
    for (let i = 0; i < 100; i++) { try { await api('/version'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
    const { chromium } = playwright();
    browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
    const { id } = await api('/games', { scenario: 'agot_298', house: 'stark', seed: 298 });
    const cells = [];
    for (const turn of TURNS) {
      // the same game, five turns on: the ordinary planning screen with a little history behind it
      if (turn > 0) for (let i = 0; i < turn; i++) await api(`/games/${id}/advance`, { span: '7d', orders: [] });
      for (const [w, h] of SIZES) { say(`measuring ${w}x${h} at turn ${turn}`); const c = await measure(browser, id, w, h, turn); Object.assign(c, { w, h, turn }); cells.push(c); }
    }
    const first = [];
    for (const [w, h] of SIZES) { say(`first run at ${w}x${h}`); first.push({ w, h, ...(await probeFirstRun(browser, w, h)) }); }
    for (const c of cells) c.first = first.find((f) => f.w === c.w);
    const failed = report(cells);
    process.exitCode = failed ? 1 : 0;
  } finally { if (browser) await browser.close().catch(() => {}); stop(); fs.rmSync(saves, { recursive: true, force: true }); }
}
main().catch((e) => { console.error(e); process.exit(2); });
