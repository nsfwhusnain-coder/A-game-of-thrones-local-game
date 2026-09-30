// The static half of the interface checklist (docs/gdd/12-ui-ux.md §14; WP F9; the tour in a browser is scripts/visual.js): what can be held from the source.
//   6  no window.confirm / alert / prompt in the code          3  no font size under 12 px (a floor on every size in the sheets and in the inline styles)
//   5  long titles become tooltips                             11 everything clickable is a stop of the Tab key; the map has its own keys
//   14 the Jump button's stop reason never names a future beat 19 no sheet gains hard-coded colours
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');
const walk = (d, ext, out = []) => { for (const f of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) { const p = `${d}/${f.name}`; if (f.isDirectory()) walk(p, ext, out); else if (ext.test(f.name)) out.push(p); } return out; };
const T = await import('../public/js/ui/tips.js');
const F = await import('../public/js/ui/focus.js');
const { nextTurnLength } = await import('../public/js/shared/turns.js');
const { THREADS } = await import('../public/data/beats.js');
const { createInitialState } = await import('../public/js/shared/world.js');

test('no window.confirm, alert or prompt anywhere in the page code (the game asks in its own dialogs)', () => {
  const files = [...walk('public/js', /\.js$/), 'public/index.html'];
  for (const f of files) assert.doesNotMatch(rd(f), /(?<![.\w])(?:window\.)?(?:confirm|alert|prompt)\s*\(/, f);
  assert.ok(files.length > 50);
});

test('no font size under 12 px: every size in the sheets and in the inline styles is 12 px or more, or wrapped in max(…, 12px) (the root size shrinks in a small window)', () => {
  const bad = [];
  const scan = (f, t) => {
    for (const m of t.matchAll(/font-size:\s*(?!max\()([0-9.]+)(rem|em|px)/g)) { const v = parseFloat(m[1]); const ok = m[2] === 'px' ? v >= 12 : m[2] === 'rem' ? v >= 0.93 : v >= 0.95; if (!ok) bad.push(`${f}: ${m[0]}`); }
    for (const m of t.matchAll(/font:\s*(?:[a-z0-9]+\s+)*?(?!max\()([0-9.]+)(rem|px)\//g)) { const v = parseFloat(m[1]); const ok = m[2] === 'px' ? v >= 12 : v >= 0.93; if (!ok) bad.push(`${f}: ${m[0]}`); }
  };
  for (const f of walk('public/css', /\.css$/)) scan(f, rd(f));
  for (const f of [...walk('public/js', /\.js$/), 'public/index.html']) scan(f, rd(f));
  assert.deepEqual(bad.slice(0, 10), [], `${bad.length} sizes under the floor`);
});

test('a title longer than 60 characters is a tooltip: the rule, the page watching for them, the tooltip itself, and the name a screen reader is given', () => {
  assert.equal(T.TIP_MAX, 60);
  assert.deepEqual(T.tipOf('x'.repeat(60)), { tip: null }); assert.equal(T.tipOf('x'.repeat(61)).tip.length, 61); assert.deepEqual(T.tipOf(''), { tip: null }); assert.deepEqual(T.tipOf(undefined), { tip: null });
  assert.ok(T.tipOf('  A long explanation of what a thing does and why, with a number: 12.  '.repeat(2)).tip.startsWith('A long'), 'trimmed');
  assert.equal(T.nameFromTip('Gold dragons in your coffers: 131,363. Your steward says they last two moons.'), 'Gold dragons in your coffers: 131,363.');
  assert.ok(T.nameFromTip('x'.repeat(200)).length <= 80);
  // where it goes: under the thing, else over it, inside the screen, never on it when there is room
  const scr = { w: 1366, h: 768 }; const sz = { w: 330, h: 110 }; const box = (l, t, r, b) => ({ left: l, top: t, right: r, bottom: b });
  assert.deepEqual(T.placeTip(box(400, 10, 500, 60), sz, scr), { left: 285, top: 68 }, 'under it, centred');
  assert.equal(T.placeTip(box(400, 700, 500, 750), sz, scr).top, 700 - 8 - 110, 'over it when there is no room under');
  assert.equal(T.placeTip(box(0, 10, 40, 40), sz, scr).left, 8, 'kept from the left edge'); assert.equal(T.placeTip(box(1330, 10, 1366, 40), sz, scr).left, 1366 - 330 - 8, 'and the right');
  for (const r of [box(10, 10, 60, 40), box(600, 300, 700, 340), box(1300, 720, 1360, 760)]) { const p = T.placeTip(r, sz, scr); assert.ok(p.left >= 8 && p.top >= 8 && p.left + sz.w <= scr.w - 8 && p.top + sz.h <= scr.h - 8, JSON.stringify(p)); assert.ok(!(p.left < r.right && p.left + sz.w > r.left && p.top < r.bottom && p.top + sz.h > r.top), 'never on the thing'); }
  const app = rd('public/js/app.js'); const css = rd('public/css/names.css');
  assert.match(app, /startTips\(\);/); assert.match(css, /#tip\.is-on/); assert.match(css, /#tip \{ position: fixed/);
  const html = rd('public/index.html'); for (const m of html.matchAll(/\btitle="([^"]*)"/g)) assert.ok(m[1].length <= 60, `index.html title: ${m[1]}`);
  assert.match(rd('public/js/ui/tips.js'), /attributeFilter: \['title'\]/, 'a title set later is seen too');
});

test('everything clickable is a stop of the Tab key: rows, cards and plates become buttons, and Enter or Space presses them', () => {
  const el = (attrs = {}, { tag = 'div', sel = false, native = false } = {}) => ({ tagName: tag.toUpperCase(), hasAttribute: (k) => k in attrs, getAttribute: (k) => attrs[k] ?? null, setAttribute: (k, v) => { attrs[k] = v; }, closest: () => null, matches: (s) => (s === F.FOCUS_SELECTOR ? sel : native) });
  assert.equal(F.needsButton(el({}, { sel: true })), true); assert.equal(F.needsButton(el({ tabindex: '0', role: 'button' }, { sel: true })), false, 'already done');
  assert.equal(F.needsButton(el({ tabindex: '0' }, { sel: true })), true, 'a tab stop with no role still wants its role');
  assert.equal(F.needsButton(el({}, { tag: 'button', sel: true, native: true })), false, 'a real button is left alone'); assert.equal(F.needsButton(el({}, {})), false, 'what is not clickable is left alone');
  const a = el({}, { sel: true }); F.makeButton(a); assert.deepEqual([a.getAttribute('tabindex'), a.getAttribute('role')], ['0', 'button']);
  for (const s of ['.row.clickable', '[data-char]:not(.nm)', '[data-house]', '[data-hold]', '[data-army]', '.family .m', '[data-inbox]', '[data-strip]']) assert.ok(F.FOCUS_SELECTOR.includes(s), s);
  assert.match(rd('public/js/app.js'), /startFocus\(\);/); assert.match(rd('public/js/ui/focus.js'), /e\.key === 'Enter' \|\| e\.key === ' '/);
});

test('the map has its own keys: [ and ] step through what is on it (matters, hosts, holdings), Enter opens, Escape lets go; the map is a stop of the Tab key with a name, and what is chosen is announced', () => {
  const map = rd('public/js/map3d/MapScene.js'); const html = rd('public/index.html'); const css = rd('public/css/names.css');
  assert.match(map, /if \(k === '\[' \|\| k === '\]'\)/); assert.match(map, /stepPlace\(dir\)/); assert.match(map, /openPlace\(\)/); assert.match(map, /clearPlace\(/); assert.match(map, /kbdPlaces\(\)/);
  assert.match(map, /getElementById\('map-live'\)/); assert.match(map, /classList\.add\('kbd-focus'\)/);
  assert.match(html, /<div id="map-wrap" tabindex="0" role="application" aria-label="The map\./); assert.match(html, /<div id="map-live" class="sr-only" aria-live="polite">/);
  assert.match(css, /\.lbl\.kbd-focus/); assert.match(css, /\.sr-only/);
});

test('the page has its landmarks and its names: a language, alt text, and every button with no text has a name', () => {
  const html = rd('public/index.html');
  assert.match(html, /<html lang="en">/); for (const m of html.matchAll(/<img\b[^>]*>/g)) assert.match(m[0], /\balt=/, m[0]);
  for (const m of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) { const text = m[2].replace(/<[^>]+>/g, '').trim(); if (!text) assert.match(m[1], /aria-label=|title=/, `an unnamed button: ${m[0].slice(0, 100)}`); }
  assert.match(html, /<aside id="drawer"[^>]*role="complementary"/); assert.match(html, /<aside id="window"[^>]*role="region"/);
});

test('the Jump button\'s stop reason never names a future beat: the great matters of the story are "word from across the realm", whatever falls due (checklist 14)', () => {
  const names = THREADS.flatMap((t) => [t.name, ...t.stages.flatMap((st) => [st.title, st.name, st.id])]).filter((x) => typeof x === 'string' && x.length > 4);
  assert.ok(names.length > 10, `${names.length} names of beats`);
  let checked = 0;
  for (const t of THREADS) for (let i = 0; i < t.stages.length; i++) {
    const s = createInitialState('agot_298', 'stark', { seed: 298 }); const st = t.stages[i]; if (!st || typeof st.at !== 'number') continue;
    s.plots = { ...(s.plots || {}), stages: { ...(s.plots?.stages || {}), [t.id]: i } };
    const month = st.at - 1; s.meta.date = { ...s.meta.date, year: Math.floor(month / 12), month: (month % 12) + 1, day: 10 };
    const u = nextTurnLength(s); const reason = String(u.reason || '').toLowerCase(); checked++;
    for (const n of names) assert.ok(!reason.includes(n.toLowerCase()), `"${u.reason}" names "${n}"`);
  }
  assert.ok(checked > 5, `${checked} turns asked about`);
});

test('no stylesheet gains hard-coded colours (#hex, rgb(), rgba()): every surface is meant to be a token (checklist 19)', () => {
  const base = JSON.parse(rd('tests/fixtures/ui/colours-before-f9.json')).counts;
  for (const [f, n] of Object.entries(base)) { const now = (rd(`public/css/${f}`).match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g) || []).length; assert.ok(now <= n, `${f}: ${now} hard-coded colours, ${n} at the start of F9`); }
  for (const f of walk('public/css', /\.css$/).map((x) => path.basename(x))) if (f !== 'theme.css') assert.ok(f in base, `${f} has a baseline`);
});

test('reduced motion is the system\'s setting or the game\'s own (Settings → Display): the choice wins unless it is "follow the system"; the camera, the scroll and every animation follow it', async () => {
  const M = await import('../public/js/ui/motion.js');
  assert.deepEqual(M.MOTION_CHOICES.map(([k]) => k), ['system', 'reduce', 'full']);
  assert.equal(M.reducedMotion('system', true), true); assert.equal(M.reducedMotion('system', false), false);
  assert.equal(M.reducedMotion('reduce', false), true, 'the game\'s own choice to reduce'); assert.equal(M.reducedMotion('full', true), false, 'the choice to keep the motion beats the system');
  assert.equal(M.motionChoice(), 'system', 'with nothing chosen, the system decides');
  const app = rd('public/js/app.js'); const play = rd('public/js/ui/playback.js'); const css = rd('public/css/names.css'); const drawer = rd('public/js/ui/drawer.js');
  assert.match(app, /id="motion-choice"/); assert.match(app, /setMotionChoice\(e\.target\.value\)/); assert.match(app, /applyMotion\(\);/);
  assert.match(play, /const reduced = reducedMotion\(\);/); assert.doesNotMatch(play, /matchMedia/); assert.match(drawer, /behavior: scrollBehavior\(\)/);
  assert.match(css, /\.reduce-motion \*, \.reduce-motion \*::before, \.reduce-motion \*::after \{ animation-duration: \.001ms !important/);
});
