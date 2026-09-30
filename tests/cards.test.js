// The contextual cards and the windows' tabs (docs/gdd/17-ui-declutter.md §4 U4; mockup 07). A click on a castle or a host opens a small card beside
// it; "More" opens the whole sheet; the six old windows are the tabs of two. What must hold:
//   • a card says only what the player's house may know: a holding of another house shows no garrison, no coffer, no muster, and no hidden change to
//     the world moves a byte of it; a host that is only reported is "unconfirmed" and gives the report and nothing else;
//   • a card offers at most three things to do and "More"; each is a hook the game already answers; every name in it is escaped;
//   • a card is placed beside its object and never over the bars, the strip, the command bar or the ruler, at both sizes, wherever the object is;
//   • every old key and every old window name lands on a tab that exists, and no verb or hook the UI offered before U4 has gone from its sources.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { createInitialState } = await import('../public/js/shared/world.js');
const { holdingCard, armyCard, cardHtml, placeCard, landsWord, lastNewsAt } = await import('../public/js/ui/cards.js');
const { TABS, tabTarget, routeKey, MENU } = await import('../public/js/ui/hud.js');
const { viewOfArmies } = await import('../public/js/engine/knowledge.js');
const { forces } = await import('../public/js/engine/parties.js');

process.env.WC_PROVIDER = 'mock'; process.env.WC_SAVES = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-cards-'));
const game = await import('../server/game.js');
test.after(() => fs.rmSync(process.env.WC_SAVES, { recursive: true, force: true }));
/** A game a week on, with its hosts about. */
async function played() { const { id } = game.newGame('agot_298', 'stark', { seed: 298 }); await game.advance(id, { span: '7d' }); await game.settled(id); return game.loadState(id); }
const world = (house = 'stark') => createInitialState('agot_298', house, { seed: 298 });
const clone = (x) => JSON.parse(JSON.stringify(x));
const env = { esc: (t) => String(t).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`), banner: (h) => `/b/${h}.png`, por: (c) => `/p/${c}.png` };

test('the card of your own seat: the holder, the garrison as the castellan reckons it, the lands, who is here — and three things to do', () => {
  const s = world(); const seat = s.houses.stark.seat;
  const c = holdingCard(s, seat, { regionName: () => 'The North' });
  assert.equal(c.kind, 'holding'); assert.equal(c.title, s.holdings[seat].name); assert.match(c.sub, /seat of House Stark/);
  const keys = c.rows.map((r) => r.k); assert.deepEqual(keys.slice(0, 3), ['Holder', 'Garrison', 'Lands']);
  assert.match(c.rows.find((r) => r.k === 'Garrison').text, /^~[\d,]+ men$/);
  assert.equal(c.actions.length, 3, 'never more than three');
  assert.deepEqual(c.actions.map((a) => a.id), ['court', 'banners', 'works']);
  assert.ok(c.actions.every((a) => Object.keys(a.attrs).some((k) => /^data-(open-tab|talk|order-tpl|court|march)$/.test(k))), 'each is a hook the game answers');
  assert.equal(c.more, true);
});

test('the card of another house\'s castle: the holder and a raven to him, the lands as they are shown on the map — and no garrison, coffer or muster', () => {
  const s = world(); const seat = s.houses.lannister.seat;
  const c = holdingCard(s, seat);
  assert.ok(!c.rows.some((r) => r.k === 'Garrison'), 'no garrison of a house that is not yours');
  assert.ok(c.actions.some((a) => a.id === 'raven' && a.attrs['data-talk'] === s.houses.lannister.lord), 'a raven to its lord');
  assert.ok(c.actions.length <= 3);
  const text = JSON.stringify(c);
  assert.ok(!text.includes(String(Math.round(s.houses.lannister.figures.treasury.v))), 'the coffers are not in it');
  assert.ok(!text.includes(String(Math.round(s.houses.lannister.figures.levies.v))), 'nor the muster');
  // and it is the same card whatever the hidden truth is
  const t = clone(s);
  for (const h of Object.values(t.houses)) if (h.id !== 'stark') { for (const f of ['treasury', 'levies', 'menAtArms', 'debt', 'food']) h.figures[f].v = 987654321; }
  t.holdings[seat].garrison = 424242;
  assert.equal(JSON.stringify(holdingCard(t, seat)), text, 'no hidden change moves it');
});

test('a host of your own: its men, its commander, what it is doing — march it, order it; a host only reported is unconfirmed and gives its report', async () => {
  const s = await played(); const mine = forces(s).find((a) => a.owner === 'stark');
  const c = armyCard(s, mine.id, { known: viewOfArmies(s) });
  assert.equal(c.kind, 'army'); assert.deepEqual(c.actions.map((a) => a.id), ['march', 'orders']); assert.equal(c.actions[0].attrs['data-march'], mine.id);
  assert.ok(c.rows.some((r) => r.k === 'Men') && c.rows.some((r) => r.k === 'Doing'));
  const foe = forces(s).find((a) => a.owner !== 'stark');
  const known = new Map([[foe.id, { known: 'reported', men: 4100, age: 2, source: 'a merchant from the Kingsroad', pos: foe.pos, owner: foe.owner }]]);
  const r = armyCard(s, foe.id, { known });
  assert.match(r.title, /unconfirmed/); assert.deepEqual(r.actions, []);
  assert.ok(!JSON.stringify(r).includes(String(foe.men)) || String(foe.men) === '4100', 'the truth of the host is not in the report');
  assert.deepEqual(r.rows.map((x) => x.k), ['Men', 'Last heard']); assert.match(r.rows[0].text, /~4,100, by report/);
});

test('the words: the state of the lands in two words, the newest news of a place within the last six turns', () => {
  assert.equal(landsWord({ prosperity: 80, unrest: 5, status: 'normal' }), 'Flourishing');
  assert.equal(landsWord({ prosperity: 40, unrest: 40, status: 'besieged' }), 'Getting by · restless · besieged');
  assert.equal(landsWord({ prosperity: 10, unrest: 70 }), 'Wretched · seething');
  const history = [{ turn: 3, events: [{ where: 'winterfell', headline: 'A raven at Winterfell', importance: 3 }, { where: 'winterfell', headline: 'The great news', importance: 6 }] }, { turn: 9, events: [{ where: 'riverrun', headline: 'Elsewhere', importance: 5 }] }];
  assert.deepEqual(lastNewsAt(history, 'winterfell', 6, 5), { text: 'The great news', turn: 3 }, 'the weightier of the turn');
  assert.equal(lastNewsAt(history, 'winterfell', 6, 12), null, 'older than six turns is not news');
  assert.equal(lastNewsAt(history, 'nowhere', 6, 5), null);
});

test('the card as markup escapes every name, and the actions carry their hooks', () => {
  const s = world(); const seat = s.houses.lannister.seat;
  s.holdings[seat].name = '<img src=x onerror=alert(1)>'; s.houses.lannister.name = 'Lann"ister';
  const lord = s.characters[s.houses.lannister.lord]; lord.name = '<b>Tywin</b>';
  const html = cardHtml(holdingCard(s, seat), env);
  assert.ok(!/<img src=x|<b>Tywin/.test(html), 'hostile names are escaped');
  assert.match(html, /data-talk="/); assert.match(html, /data-card-more="holding:/); assert.match(html, /class="card-head"/);
  const w = world(); const own = cardHtml(holdingCard(w, w.houses.stark.seat), env);
  assert.match(own, /data-open-tab="hosts" data-then="call-banners"/); assert.ok(own.includes(`data-open-tab="coin" data-works="${w.houses.stark.seat}"`));
});

test('a card is placed beside its object and never over the bars, the strip, the command bar or the ruler, at both sizes and wherever the object is', () => {
  for (const [W, H] of [[1920, 1080], [1366, 768]]) {
    const rem = Math.min(0.011 * W, 0.02 * H); const size = { w: 22 * rem, h: 21 * rem };
    const avoid = [[0, 0, 0.32 * W, 4 * rem], [0.62 * W, 0, W, 4 * rem], [0.008 * W, H - 8 * rem, 0.31 * W, H], [0.34 * W, H - 5 * rem, 0.66 * W, H], [0.82 * W, H - 7 * rem, W, H], [0.9 * W, 4 * rem, W, 7 * rem]];
    let crowded = 0, n = 0;
    for (let x = 0.05; x <= 0.95; x += 0.05) for (let y = 0.08; y <= 0.92; y += 0.06) {
      const a = { x: x * W, y: y * H }; const p = placeCard(a, size, { w: W, h: H }, avoid); n++;
      assert.ok(p.left >= 10 - 1 && p.top >= 10 - 1 && p.left + size.w <= W - 9 && p.top + size.h <= H - 9, `inside the screen at ${W}×${H} for ${a.x},${a.y}`);
      const over = avoid.some(([x0, y0, x1, y1]) => p.left < x1 && p.left + size.w > x0 && p.top < y1 && p.top + size.h > y0);
      if (p.crowded) crowded++; else assert.ok(!over, `clear of the bars at ${W}×${H} for ${Math.round(a.x)},${Math.round(a.y)}`);
      // beside the object, not over it (the object's own point is clear of the card unless the screen was crowded)
      if (!p.crowded) assert.ok(a.x < p.left || a.x > p.left + size.w || a.y < p.top || a.y > p.top + size.h, 'the object itself is not under the card');
    }
    assert.ok(crowded / n < 0.15, `${crowded} of ${n} placements crowded at ${W}×${H}`);
  }
  // the usual case: a castle mid-screen has its card to its right
  const p = placeCard({ x: 500, y: 400 }, { w: 300, h: 300 }, { w: 1366, h: 768 }, []); assert.equal(p.side, 'left'); assert.ok(p.left > 500);
  // at the right edge it goes to the left
  assert.equal(placeCard({ x: 1300, y: 400 }, { w: 300, h: 300 }, { w: 1366, h: 768 }, []).side, 'right');
});

test('the tabs: two windows, every old key and every old window name lands on a tab that exists', () => {
  assert.deepEqual(TABS.realm.map((t) => t.id), ['ledger', 'house', 'hosts', 'coin', 'courts']);
  assert.deepEqual(TABS.people.map((t) => t.id), ['people', 'council', 'shadows']);
  for (const [key, want] of Object.entries({ r: ['realm', null], p: ['people', null], m: ['realm', 'hosts'], e: ['realm', 'coin'], d: ['realm', 'courts'], c: ['people', 'council'], i: ['people', 'shadows'] })) {
    const r = routeKey(key); assert.ok(r, key); const t = tabTarget(r.open, r.section);
    assert.deepEqual([t.door, t.tab], want, `key ${key}`);
    if (t.tab) assert.ok(TABS[t.door].some((x) => x.id === t.tab));
  }
  for (const [name, want] of Object.entries({ military: ['realm', 'hosts'], economy: ['realm', 'coin'], diplomacy: ['realm', 'courts'], council: ['people', 'council'], intrigue: ['people', 'shadows'] })) assert.deepEqual(Object.values(tabTarget(name)), want, name);
  assert.deepEqual(tabTarget('realm', 'house'), { door: 'realm', tab: 'house' }); assert.deepEqual(tabTarget('realm', 'nonsense'), { door: 'realm', tab: null });
  assert.equal(MENU.length, 3, 'still three doors');
});

test('no verb and no hook the UI offered before U4 has gone from its sources', () => {
  const before = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/ui/hooks-before-u4.json'), 'utf8'));
  const dir = path.join(ROOT, 'public/js/ui');
  const src = [...fs.readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')), fs.readFileSync(path.join(ROOT, 'public/js/app.js'), 'utf8')].join('\n');
  const verbs = new Set([...src.matchAll(/(?:doVerb|courtAct)\(\s*'([a-z_]+)'/g)].map((m) => m[1]));
  const hooks = new Set([...src.matchAll(/\bdata-([a-z][a-z-]*)=/g)].map((m) => m[1]));
  assert.deepEqual(before.verbs.filter((v) => !verbs.has(v)), [], 'a verb the UI could give is gone');
  assert.deepEqual(before.hooks.filter((h) => !hooks.has(h)), [], 'a hook of the UI is gone');
  assert.ok(before.verbs.length >= 20 && before.hooks.length >= 70);
});

test('the wiring: the map opens cards, Escape peels the card first, a sheet takes the window\'s place and says the way back, and the card keeps to the screen', () => {
  const rd = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');
  const app = rd('public/js/app.js'); const win = rd('public/js/ui/windows.js'); const card = rd('public/js/ui/card.js'); const map = rd('public/js/map3d/MapScene.js'); const html = rd('public/index.html');
  assert.match(app, /onSelect: \(hid\) => \{[^}]*openCard\('holding', hid\)/); assert.match(app, /onSelectArmy: \(aid\) => \{[^}]*openCard\('army', aid\)/);
  assert.match(app, /if \(app\.card\) return dismissCard\(\); if \(app\.sheet\) return closeSheet\(\); if \(app\.win\) return closeWindow\(\);/, 'Escape: the card, then the sheet, then the window');
  assert.match(win, /app\.back = \{ win: app\.win, tab: app\.tab \}; closeWindow\(true\);/, 'a sheet takes the window\'s place and remembers it');
  assert.match(win, /data-sheet-back/); assert.match(win, /app\.closeCard\?\.\(\)/, 'a window puts the card away');
  assert.match(card, /closeSheet\(\); closeWindow\(\);/, 'a card puts the sheet and the window away');
  assert.match(map, /screenOf\(x, z\)/); assert.match(card, /KEEP_CLEAR/); assert.match(html, /id="card"/);
  assert.doesNotMatch(card, /Math\.random|fetch\(|api\(/, 'the card asks for nothing and rolls nothing');
});
