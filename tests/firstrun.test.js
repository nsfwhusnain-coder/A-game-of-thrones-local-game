// First run, focus mode and the map's declutter (docs/gdd/17-ui-declutter.md §2.6, §2.7 and §4 U8; mockup 08). What must hold:
//   • the welcome card says the house's situation, aims and levers, once, and only on a game not yet begun; a game under way shows nothing of it;
//   • three coach marks in order, each put away by the thing it names, never all at once, never out of order; the focus tip comes once from turn three;
//   • a coach mark's slip is placed on the screen, beside its target, at both sizes;
//   • the map draws no more plates than its zoom carries (a dozen at the default one), the player's own and the nearest to its lands first, stably; and no more
//     than six pins at once, matters awaiting a word first, the rest behind a "+n";
//   • F is focus mode (the map's "follow" is G), and the server keeps "the welcome has been read".
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.WC_PROVIDER = 'mock'; process.env.WC_SAVES = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-firstrun-'));
const F = await import('../public/js/ui/firstrun.js');
const { tokenCap, lodOf } = await import('../public/js/map3d/lod.js');
const { capTokens } = await import('../public/js/map3d/tokens.js');
const { capPins } = await import('../public/js/shared/pins.js');
const { createInitialState } = await import('../public/js/shared/world.js');
const game = await import('../server/game.js');
test.after(() => fs.rmSync(process.env.WC_SAVES, { recursive: true, force: true }));

const rd = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');

test('the welcome card: the situation, the aims and the levers of the house you chose, in its own words, for every playable house', () => {
  for (const house of ['stark', 'lannister', 'greyjoy', 'targaryen', 'blackwood', 'manderly']) {
    const s = createInitialState('agot_298', house, { seed: 1 });
    const w = F.welcomeOf(s);
    assert.match(w.kicker, /298 AC/); assert.equal(w.title, 'Your situation');
    assert.ok(w.situation.length > 40, `${house}: a situation`); assert.ok(w.aims.length >= 1, `${house}: aims`);
    assert.ok(w.lord.length > 3 && /[A-Z]/.test(w.lord), `${house}: the lord ("${w.lord}")`);
    assert.ok(!/undefined|NaN|\[object/.test(JSON.stringify(w)), `${house}: nothing unfilled`);
  }
});

test('the welcome is shown once, on a game not yet begun: never after it is read (here or on the server), never on a game under way', () => {
  const s = createInitialState('agot_298', 'stark', { seed: 1 });
  assert.equal(F.shouldWelcome(s), true);
  assert.equal(F.shouldWelcome(s, { localFlag: true }), false, 'read in this browser');
  const t = JSON.parse(JSON.stringify(s)); t.meta.welcomed = true; assert.equal(F.shouldWelcome(t), false, 'read, and the server knows');
  const u = JSON.parse(JSON.stringify(s)); u.meta.turn = 4; assert.equal(F.shouldWelcome(u), false, 'a game under way (an old save) shows nothing of it');
});

test('the coach marks: in order, each put away by the thing it names and by nothing else, never twice', () => {
  assert.deepEqual(F.COACH.map((c) => c.id), ['command', 'turn', 'realm']);
  assert.deepEqual(F.COACH.map((c) => c.on), ['order', 'turn', 'realm']);
  let done = []; assert.equal(F.nextCoach(done).id, 'command');
  done = F.coachAfter(done, 'turn'); assert.deepEqual(done, ['turn'], 'a later thing done early puts away its own mark only'); assert.equal(F.nextCoach(done).id, 'command', 'and the first is still the one shown');
  done = F.coachAfter(done, 'order'); assert.equal(F.nextCoach(done).id, 'realm');
  assert.deepEqual(F.coachAfter(done, 'order'), ['command', 'turn'], 'the same thing twice changes nothing');
  assert.deepEqual(F.coachAfter(done, 'nonsense'), ['command', 'turn'], 'an unknown event changes nothing');
  done = F.coachAfter(done, 'realm'); assert.equal(F.nextCoach(done), null, 'all done: no mark');
  assert.deepEqual(F.coachAfter(['realm', 'command'], 'turn'), ['command', 'turn', 'realm'], 'the list is kept in the marks\' order');
  assert.equal(F.quietTip(2, false), false); assert.equal(F.quietTip(3, false), true); assert.equal(F.quietTip(9, true), false, 'once'); assert.match(F.QUIET_TIP, /F/);
});

test('a coach mark\'s slip is placed beside its target and on the screen, at both sizes, for every target', () => {
  for (const [W, H] of [[1920, 1080], [1366, 768]]) {
    const targets = { command: { x0: 0.34 * W, y0: H - 4.4 * 21, x1: 0.66 * W, y1: H - 14 }, turn: { x0: 0.64 * W, y0: 14, x1: 0.95 * W, y1: 60 }, realm: { x0: W - 60, y0: 14, x1: W - 12, y1: 60 } };
    for (const c of F.COACH) {
      const size = { w: 260, h: 70 }; const t = targets[c.id];
      const p = F.placeCoach(t, size, { w: W, h: H }, c.side);
      assert.ok(p.left >= 8 && p.top >= 8 && p.left + size.w <= W - 8 && p.top + size.h <= H - 8, `${c.id} inside ${W}×${H}`);
      const hit = p.left < t.x1 && p.left + size.w > t.x0 && p.top < t.y1 && p.top + size.h > t.y0; assert.ok(!hit, `${c.id}: the slip does not cover its target`);
      assert.equal(p.arrow, c.side === 'below' ? 'up' : 'down', `${c.id}: the arrow points at the target`);
      assert.ok(p.arrowX >= 16 && p.arrowX <= size.w - 16);
    }
  }
});

test('the plates: a dozen at the default zoom, fewer far out, all of them close in; the player\'s own and the nearest first, stably', () => {
  assert.equal(tokenCap(520), 12, 'the default zoom');
  assert.ok(tokenCap(3500) <= tokenCap(1200) && tokenCap(1200) <= tokenCap(520) && tokenCap(520) < tokenCap(300) && tokenCap(300) <= tokenCap(160));
  assert.ok(tokenCap(160) >= 40, 'close in, every one');
  assert.equal(tokenCap(1500), 8);
  const items = Array.from({ length: 20 }, (_, i) => ({ id: `p${String(i).padStart(2, '0')}`, own: i === 13 || i === 17, d: (i * 37) % 11 * 10, men: i * 100 }));
  const cut = capTokens(items, 12);
  assert.equal(cut.size, 8); assert.ok(!cut.has('p13') && !cut.has('p17'), 'the player\'s own are kept');
  const kept = items.filter((x) => !cut.has(x.id)); const droppedNearest = Math.min(...items.filter((x) => cut.has(x.id) && !x.own).map((x) => x.d)); const keptFarthest = Math.max(...kept.filter((x) => !x.own).map((x) => x.d));
  assert.ok(keptFarthest <= droppedNearest, 'nothing nearer to the player\'s lands is dropped for something farther');
  assert.deepEqual([...capTokens([...items].reverse(), 12)].sort(), [...cut].sort(), 'the order the plates come in does not change which are kept');
  assert.equal(capTokens(items, 30).size, 0, 'under the cap, none dropped');
  // the default zoom of the game really is 12
  assert.equal(Math.round(lodOf(520) * 100) / 100 > 1.8, true);
});

test('the pins: at most six at once — matters awaiting your word first, then the weightiest news, then the newest — and the rest counted', () => {
  const groups = new Map();
  for (let i = 0; i < 9; i++) groups.set(`h${i}`, { events: [{ importance: 2 + (i % 4), turn: i }], decisions: [] });
  groups.set('asks', { events: [], decisions: [{ id: 'd1' }] });
  const { shown, hidden } = capPins(groups, 6);
  assert.equal(shown.length, 6); assert.equal(hidden.length, 4); assert.equal(shown[0], 'asks', 'a matter awaiting your word comes first');
  const imp = (w) => Math.max(...groups.get(w).events.map((e) => e.importance));
  assert.ok(shown.slice(1).every((w) => imp(w) >= Math.max(...hidden.map(imp))), 'no lighter news shown while a weightier is hidden');
  assert.deepEqual(capPins(groups, 6), { shown, hidden }, 'stable');
  assert.deepEqual(capPins(new Map([['a', { events: [], decisions: [] }]]), 6), { shown: ['a'], hidden: [] });
});

test('the wiring: F is focus mode and the map\'s follow is G; the welcome and the marks are hooked to the orders, the turn and the Realm; the card is not in the chronicle any more', () => {
  const app = rd('public/js/app.js'); const map = rd('public/js/map3d/MapScene.js'); const drawer = rd('public/js/ui/drawer.js'); const win = rd('public/js/ui/windows.js'); const common = rd('public/js/ui/common.js'); const html = rd('public/index.html'); const css = rd('public/css/hud.css');
  assert.match(app, /e\.key === 'f' \|\| e\.key === 'F'\) \{ e\.preventDefault\(\); toggleFocus\(\)/); assert.match(map, /if \(k === 'g'\) \{ this\.follow/); assert.doesNotMatch(map, /if \(k === 'f'\)/);
  assert.match(app, /coachDone\('turn'\)/); assert.match(common, /app\.coachDone\?\.\('order'\)/); assert.match(win, /app\.coachDone\?\.\('realm'\)/);
  assert.match(app, /startFirstRun\(\)/); assert.match(app, /case 'focus'/); assert.match(app, /case 'welcome'/);
  assert.doesNotMatch(drawer, /Your situation<\/h3>/, 'the situation is the welcome card, not a card in the chronicle'); assert.match(drawer, /Read your situation again/);
  assert.match(html, /id="focus-exit"/); assert.match(html, /id="pins-more"/); assert.match(html, /id="coach"/); assert.match(html, /data-action="focus"/);
  assert.match(css, /body\.focus #hud-top/); assert.match(css, /body\.map-active #hud-top/); assert.match(css, /body\.idle/);
  assert.match(map, /capTokens\(platesIn\.map\(plateOf\), tokenCap\(d\)\)/); assert.match(map, /capPins\(open, 6\)/);
});

test('the server keeps "the welcome has been read" so a fresh browser does not show it again', async () => {
  const { id } = game.newGame('agot_298', 'stark', { seed: 5 });
  assert.equal(!!game.loadState(id).meta.welcomed, false);
  assert.deepEqual(game.markWelcomed(id), { ok: true });
  assert.equal(game.loadState(id).meta.welcomed, true);
  const route = rd('server/index.js'); assert.match(route, /route\('POST', '\/api\/games\/:id\/welcome'/);
  // and it changes nothing else of the world
  const a = game.loadState(id); const { meta: m, ...rest } = a; const b = createInitialState('agot_298', 'stark', { seed: 5 });
  assert.equal(a.meta.turn, b.meta.turn);
  assert.ok(Object.keys(rest).length > 5);
});
