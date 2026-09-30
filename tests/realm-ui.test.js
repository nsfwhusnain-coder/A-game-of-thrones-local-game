// The State of the Realm as a window (WP R4, GDD 19 §6): how a cell, a series, a word and a war are written (ui/realm-fmt.js, pure), the page drawn from a view (ui/realm-view.js, pure,
// run here on views full of hostile names), and the wiring: the Realm door opens it, R and only R (S is the map's), it is closed until asked for, the own-house page is still there as a tab,
// and the window changes nothing. What the server may show is R2's and R6's to guarantee; this file guarantees that the window writes down what it is sent and no more.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.WC_PROVIDER = 'mock';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const noComments = (js) => js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\'"`])\/\/.*$/gm, '$1');
const F = await import('../public/js/ui/realm-fmt.js');
const { ledgerHtml } = await import('../public/js/ui/realm-view.js');
const { routeKey } = await import('../public/js/ui/hud.js');
const { realmViewFor } = await import('../public/js/engine/realm/view.js');
const { createInitialState } = await import('../public/js/shared/world.js');
const { sampleRealm } = await import('../public/js/engine/realm/stats.js');
const { addDays } = await import('../public/js/engine/time.js');
const { withRng } = await import('../public/js/engine/rng.js');
const K = await import('../public/js/engine/knowledge.js');

test('a cell is written with its mark: exact bare, ~ an estimate, ≈ a band in k, ≥ at least, a word in italics, — nothing; older than two turns is stale', () => {
  const t = F.cellText;
  assert.deepEqual([t({ v: 17385, mark: '', via: 'self', age: 0 }, 'swords').text, t({ v: 17385, mark: '', via: 'self', age: 0 }, 'swords').kind], ['17,385', 'exact']);
  assert.equal(t({ v: 52000, mark: '~', via: 'sworn', age: 0 }, 'swords').text, '~52,000');
  assert.equal(t({ v: 0, mark: '≈', band: [16632, 99792], via: 'rumour', age: 0 }, 'swords').text, '≈ 17k–100k', 'a band fits a cell');
  assert.equal(t({ v: 0, mark: '≈', band: [800, 4600], via: 'rumour' }, 'income').text, '≈ 800–4,600');
  assert.equal(t({ v: 8400, mark: '≥', via: 'seen', age: 1 }, 'swords').text, '≥8,400');
  assert.equal(t({ v: 203000, mark: '~', via: 'seen', age: 0 }, 'people').text, '~203k', 'people in k'); assert.equal(t({ v: 2100000, mark: '~', via: 'seen', age: 0 }, 'people').text, '~2.1m');
  assert.equal(t({ v: 305, mark: '', via: 'self', age: 0 }, 'food').text, '30.5 moons'); assert.equal(t({ v: 300, mark: '', via: 'self', age: 0 }, 'food').text, '30 moons');
  assert.deepEqual([t({ word: 'sound', via: 'rumour' }, 'gold').text, t({ word: 'sound', via: 'rumour' }, 'gold').kind], ['said to be rich', 'word']);
  assert.equal(t({ word: 'pressed', via: 'rumour' }, 'gold').text, 'pressed'); assert.equal(t({ word: 'unknown', via: 'rumour' }, 'gold').text, '—');
  for (const nothing of [{ mark: '—' }, null, undefined]) assert.deepEqual([t(nothing, 'swords').text, t(nothing, 'swords').kind], ['—', 'none']);
  assert.equal(t({ v: 5, mark: '~', via: 'seen', age: 2 }, 'ships').stale, false, 'two turns is not stale'); assert.equal(t({ v: 5, mark: '~', via: 'seen', age: 3 }, 'ships').stale, true, 'three is');
  assert.equal(t({ v: 5, mark: '', via: 'self', age: 9 }, 'ships').stale, false, 'your own is never stale');
  assert.match(t({ v: 5, mark: '~', via: 'reported', age: 3 }, 'ships').title, /raven|rider/); assert.match(t({ v: 5, mark: '~', via: 'reported', age: 3 }, 'ships').title, /3 turns ago/);
});

test('how a house is known is one line in the world\'s words', () => {
  const row = (c) => ({ cells: { power: c } });
  assert.equal(F.provenance(row({ v: 55, mark: '', via: 'self', age: 0 })), 'exact · your house');
  assert.equal(F.provenance(row({ v: 55, mark: '~', via: 'sworn', age: 0 })), 'sworn · this moon');
  assert.equal(F.provenance(row({ v: 60, mark: '≈', via: 'reported', age: 1 })), 'a raven, a turn old'); assert.equal(F.provenance(row({ v: 60, mark: '≈', via: 'seen', age: 4 })), 'seen, 4 turns old');
  assert.equal(F.provenance(row({ mark: '—' })), 'long unheard of'); assert.equal(F.provenance({ cells: {} }), 'long unheard of');
  assert.equal(F.provenance({ cells: { income: { v: 1, mark: '≈', via: 'rumour' } } }), 'a rumour', 'a rumour with no age says no age');
  assert.equal(F.provenance({ cells: { income: { v: 1, mark: '≈', via: 'rumour' }, power: { v: 1, mark: '≈', via: 'reported', age: 2 } } }), 'a raven, 2 turns old', 'the freshest word of any figure');
});

test('a word is a chip: rising, falling or steady with its arrow; "seems" only for a house known by reports; the reasons in its hover', () => {
  assert.deepEqual(F.wordChip({ word: 'rising', arrow: '▲', seems: false, why: ['has called its banners'] }), { text: '▲ rising', seems: false, cls: 'up', title: 'rising: has called its banners' });
  assert.equal(F.wordChip({ word: 'falling', arrow: '▼', why: [] }).cls, 'down'); assert.equal(F.wordChip({ word: 'steady', arrow: '▬' }).cls, 'flat');
  const s = F.wordChip({ word: 'rising', arrow: '▲', seems: true, why: [] }); assert.equal(s.seems, true); assert.match(s.title, /^seems rising/);
  assert.deepEqual(F.wordChip({ word: '—', arrow: '·' }).cls, 'none'); assert.equal(F.wordChip(null).cls, 'none');
});

test('a series is a line through real points only, gaps stay gaps, and it reads aloud as words', () => {
  assert.deepEqual(F.sparkPath([]), { d: '', dots: [], last: null }); assert.equal(F.sparkPath([[0, 5]]).d, '', 'one point draws no line'); assert.ok(F.sparkPath([[0, 5]]).last, 'but there is a dot');
  const p = F.sparkPath([[0, 10], [7, 20], [28, 15]], { w: 84, h: 22, pad: 2 });
  assert.equal(p.dots.length, 3, 'three points, three dots — nothing invented between them'); assert.match(p.d, /^M2 20 L/);
  assert.ok(p.dots[2][0] > p.dots[1][0] + 40, 'the gap of three weeks is a long step, not two short ones (x follows the day)');
  assert.ok(p.dots.every(([x, y]) => x >= 0 && x <= 84 && y >= 0 && y <= 22), 'inside the box');
  assert.deepEqual(F.sparkPath([[0, 7], [7, 7]]).dots.map((d) => d[1]), [11, 11], 'a flat series is drawn level');
  assert.equal(F.sparkPath([[0, 1], [NaN, 2], [7, 3]]).dots.length, 2, 'a point that is no number is left out');
  assert.equal(F.sparkLabel('Coin', [[0, 100], [90, 82]], { moons: 6, est: true }), 'Coin: down 18 % over 6 moons (an estimate)');
  assert.equal(F.sparkLabel('Swords', [[0, 100], [90, 141]]), 'Swords: up 41 % over 3 moons'); assert.equal(F.sparkLabel('Food', [[0, 5], [9, 5]]), 'Food: steady over 3 moons');
  assert.equal(F.sparkLabel('Food', [[0, 5]]), 'Food: too few points to draw');
  assert.equal(F.changeWord([[0, 100], [90, 141]]), '+41 %'); assert.equal(F.changeWord([[0, 100], [90, 86]]), '−14 %'); assert.equal(F.changeWord([[0, 100]]), '');
});

test('a war is a sentence for the player only where the player is in it, and each side\'s swords are as displayed', () => {
  const war = { name: 'The Fray', momentum: 'gaining', standing: 'leading', delta: 9, strength: { A: { v: 31000, mark: '~' }, D: { v: 52000, mark: '≥' } } };
  assert.deepEqual(F.warLine(war, 3), { text: 'You are leading; gaining ground (+9 in 3 moons)', cls: 'up' });
  assert.equal(F.warLine({ ...war, momentum: 'slipping', standing: 'trailing', delta: -12 }, 6).text, 'You are behind; slipping (−12 in 6 moons)'); assert.equal(F.warLine({ ...war, momentum: 'holding', standing: 'level', delta: 0 }).text, 'The war is level; holding');
  assert.equal(F.warLine({ name: 'Someone else\'s war' }), null, 'no score is known of a war the player is not in');
  assert.equal(F.strengthLine(war), '~31,000 against ≥52,000'); assert.equal(F.strengthLine({ strength: { A: { mark: '—' }, D: null } }), '— against —');
});

test('a header sorts the rows by the shown value, best first; the unknown always last; stable; the rank column by rank', () => {
  const rows = [{ house: 'a', rank: 3, cells: { swords: { v: 500, mark: '~' } } }, { house: 'b', rank: 1, cells: { swords: { mark: '—' } } }, { house: 'c', rank: 2, cells: { swords: { v: 900, mark: '≈', band: [800, 1000] } } }, { house: 'd', rank: null, cells: {} }, { house: 'e', rank: 4, cells: { swords: { v: 500, mark: '~' } } }];
  assert.deepEqual(F.sortRows(rows, 'rank').map((r) => r.house), ['b', 'c', 'a', 'e', 'd'], 'rank 1 first, no rank last');
  assert.deepEqual(F.sortRows(rows, 'swords').map((r) => r.house), ['c', 'a', 'e', 'b', 'd'], 'the largest first, ties in their order, nothing known last');
  assert.deepEqual(F.sortRows(rows, 'swords', -1).map((r) => r.house), ['a', 'e', 'c', 'b', 'd'], 'reversed, and the unknown still last');
  assert.deepEqual(F.sortRows(rows, 'rank', -1).map((r) => r.house), ['e', 'a', 'c', 'b', 'd']); assert.equal(rows[0].house, 'a', 'the input is not changed');
});

// ── the page, drawn from views ──
const env = { crest: (id) => `<img class="sig" alt="" data-h="${id}">`, nameOf: (id) => id.toUpperCase(), you: 'stark' };
const world = () => { const s = createInitialState('agot_298', 'stark', { seed: 298 }); for (let i = 0; i < 4; i++) { s.meta.turn += 1; s.meta.date = addDays(s.meta.date, 7); sampleRealm(s); withRng(s, () => K.updateKnowledge(s, 'stark')); } return s; };
const Q = { lens: 'strength', scope: 'great', realm: false, moons: 3, sortKey: 'rank', sortDir: 1, cols: false, house: null };

test('the page is drawn from the view: the tabs, the window, the rising strip, the table with the player\'s row marked, the wars, what the realm is saying and where to focus', () => {
  const s = world(); s.houses.stark.figures.food.v = 1.2; const v = realmViewFor(s, 'stark', { house: 'stark' });
  const html = ledgerHtml({ ...v, focus: [{ id: 'f', kind: 'hungry', text: 'Your granaries hold 1.2 moons of bread.', verb: 'buy_grain', order: 'Buy grain for the granaries.' }] }, Q, env);
  for (const t of ['Strength', 'Economy', 'Lands', 'Wars', 'Your house', 'Show', 'Window', 'What the realm is saying', 'Where to focus', 'Wars, as your house knows them']) assert.match(html, new RegExp(t), t);
  assert.match(html, /<tr class="is-you"[^>]*data-row="stark"/, 'the player\'s row is marked'); assert.match(html, /exact · your house/);
  assert.match(html, /data-focus="Buy grain for the granaries\."/, 'where to focus writes an order, and only writes it');
  assert.match(html, /aria-label="[^"]*(steady|up|down|too few)[^"]*"/, 'each line has words for a screen reader'); assert.match(html, /<svg class="wc-spark/);
  assert.match(html, /≈|≥|~/, 'an estimate says it is one'); assert.doesNotMatch(html, /undefined|NaN|\[object/);
  for (const lens of ['economy', 'land', 'wars']) { const h = ledgerHtml(realmViewFor(s, 'stark', { lens: lens === 'wars' ? 'strength' : lens }), { ...Q, lens }, env); assert.match(h, /realm-ledger/); assert.doesNotMatch(h, /undefined|NaN|\[object/, lens); }
  const cols = (h) => (h.match(/<th class="c-(\w+)/g) || []).length;
  assert.ok(cols(ledgerHtml(v, { ...Q, lens: 'economy' }, env)) < cols(ledgerHtml(v, Q, env)) + 4);
});

test('names and words the server sent are escaped: a hostile house, lord, war or fact cannot put markup on the page', () => {
  const s = world(); const v = realmViewFor(s, 'stark', { house: 'lannister' });
  const bad = '<img src=x onerror=alert(1)>"\'&';
  v.wars = [{ id: 'w1', name: bad, sides: { A: ['lannister'], D: [bad] }, you: null }];
  v.facts = [{ id: 'f1', kind: 'hungry', text: bad, via: bad, age: 1, weight: 9 }]; v.focus = [{ id: 'f1', kind: 'hungry', text: bad, verb: 'buy_grain', order: bad }];
  v.detail = { ...v.detail, name: bad, lord: bad, liege: 'stark' }; v.going = { rising: [bad], falling: [] };
  for (const r of v.rows.slice(0, 3)) { r.lord = bad; r.flags = [{ id: 'hungry', text: bad }]; r.word = { word: 'rising', arrow: '▲', seems: false, why: [bad] }; }
  const html = ledgerHtml(v, { ...Q, house: 'lannister' }, { ...env, nameOf: (id) => (id === 'lannister' ? bad : id) });
  assert.doesNotMatch(html, /<img src=x/, 'no raw tag from the data'); assert.doesNotMatch(html, /onerror=alert\(1\)>/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/, 'it is shown as text');
  assert.equal((html.match(/<img class="sig"/g) || []).length > 0, true, 'the page\'s own crests are its own markup');
});

test('the window\'s wiring: the Realm door opens it, R (and never S), closed until asked for; the own house\'s page is a tab; the window writes an order and changes nothing', () => {
  assert.equal(routeKey('r').open, 'realm'); assert.equal(routeKey('s'), null, 'S is the map\'s');
  const html = read('public/index.html'); assert.doesNotMatch(html, /realm-body|realm-ledger/, 'nothing of the ledger is on the page until the window is asked for'); assert.match(html, /css\/ledger\.css/);
  const win = noComments(read('public/js/ui/windows.js'));
  assert.match(win, /from '\.\/realm\.js'/); assert.match(win, /function realmWindow\(/); assert.match(win, /'State of the Realm'/); assert.match(win, /data-realm-tab/, 'the own-house page is a tab');
  assert.match(win, /function familyTree\(/, 'and the family tree is untouched');
  const ui = noComments(read('public/js/ui/realm.js'));
  assert.doesNotMatch(ui, /doVerb|addOrder\(|api\([^)]*\{\s*body/, 'the window sends no order and posts nothing'); assert.match(ui, /toast\('Written in the order box/, 'a focus writes into the box and says so');
  assert.match(ui, /localStorage/); assert.match(ui, /try \{/, 'what the lord last asked for is kept, in a try');
});

test('the pure modules are browser-safe: no DOM, no node: imports, no clock, no dice', () => {
  for (const f of ['public/js/ui/realm-fmt.js', 'public/js/ui/realm-view.js']) {
    const src = noComments(read(f));
    for (const [re, why] of [[/from\s*['"]node:/, 'a node: import'], [/\brequire\s*\(/, 'require()'], [/\bdocument\b|\bwindow\b|localStorage/, 'the DOM or storage'], [/Math\.random|Date\.now|new Date\b|performance\.now/, 'a clock or dice'], [/from\s*['"]\.\/common\.js['"]/, 'common.js']]) assert.doesNotMatch(src, re, `${f} uses ${why}`);
  }
});
