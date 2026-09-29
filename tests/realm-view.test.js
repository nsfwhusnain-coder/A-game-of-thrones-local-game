// The realm ledger's view (docs/gdd/19-realm-ledger.md §4, §5, §7; WP R2): what the player's house may know of every
// house — its own exact, its sworn nearly so, everyone else as an estimate, a band, a stale figure with its age, or
// nothing — built from the viewer's knowledge and never trimmed from the truth afterwards. Each test is one sentence of
// the R2 acceptance column (§11), in the GDD's words; the last few pin the shape the route and the window will read.
//
// Contract the tests fix where the GDD leaves a detail open (the builder must match; each is one line to change here):
//   • options: `{ lens: 'strength'|'economy'|'land', scope: 'great'|'all', realm: bool, window, house }`; any of them may
//     be null/undefined (that is what the route passes when a query parameter is missing) and means the default;
//   • a cell is `{ v, mark, via, age, band?, rank? }` or, for a wealth that is only a word, `{ word, via, age }`; the mark
//     of an exact figure is '' (the viewer's own house); others carry `~` `≈` `≥` or `—`; `age` is in turns;
//   • cell keys are the §3.1 field names (`power`, `swords`, `levies`, `menAtArms`, `ships`, `holdings`, `people` on the
//     Strength lens; `gold`, `income`, `expenses`, `food`, `debt` on Economy; `holdings`, `people`, `prosperity`,
//     `unrest` on Land), and a row is `{ house, lord, rank, rankTied, cells, trend, flags }`;
//   • what a spy teaches (§4.2 `learned`) is a fact whose `data.realm = { house, field, value }`, learned with
//     `knowledge.learn(state, viewer, fact, { via: 'spy' })`; the figure must outlive the fact's turn (it is kept with
//     what was learned, not looked up in the turn's facts);
//   • `direction(seriesNow, seriesThen, { field, reported })`: each series is `[[day, value], …]` oldest first, already
//     cut to the window; `seriesThen` is the same series as it stood one turn earlier (that is what makes "two turns
//     running" computable); it returns `{ dir: 'growing'|'shrinking'|'steady', arrow: '▲'|'▼'|'▬', seems }`, or dir
//     '—' for a report-only series of fewer than two points; floors are §4.5's (gold 1,000, swords 100, income 100),
//     food is ±1 moon in the series' own unit (tenths of a moon);
//   • `updateKnowledge(state, viewer)` calls `observe` (§3.2) — the tests never call `observe` to feed the view.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.WC_PROVIDER = 'mock';
// the modules under test first: when they are missing the file fails here, before it has made a save directory to leave behind
const { sampleRealm } = await import('../public/js/engine/realm/stats.js');
const { realmViewFor, direction } = await import('../public/js/engine/realm/view.js');
process.env.WC_SAVES = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-realm-view-'));
const game = await import('../server/game.js');
const { createInitialState, applyChanges, migrateState } = await import('../public/js/shared/world.js');
const { standing } = await import('../public/js/shared/standing.js');
const { project } = await import('../public/js/shared/economy.js');
const { ECONOMY } = await import('../public/data/balance.js');
const { THREADS } = await import('../public/data/beats.js');
const { dayNumber, addDays } = await import('../public/js/engine/time.js');
const { withRng, random, randInt } = await import('../public/js/engine/rng.js');
const { forces } = await import('../public/js/engine/parties.js');
const { emit, flush } = await import('../public/js/engine/facts/log.js');
const K = await import('../public/js/engine/knowledge.js');

test.after(() => fs.rmSync(process.env.WC_SAVES, { recursive: true, force: true }));

const world = (house = 'stark', seed = 298) => createInitialState('agot_298', house, { seed });
const clone = (x) => JSON.parse(JSON.stringify(x));
const view = (s, o) => realmViewFor(s, 'stark', o);
const json = (x) => JSON.stringify(x);
const rowOf = (v, house) => v.rows.find((r) => r.house === house);
/** One turn on: the date and turn move, the series takes its sample, and the house hears what it hears. */
const tick = (s, days = 7) => { s.meta.turn += 1; s.meta.date = addDays(s.meta.date, days); sampleRealm(s); withRng(s, () => K.updateKnowledge(s, 'stark')); return s; };
/** Time passes with no news at all. */
const pass = (s, turns) => { s.meta.turn += turns; s.meta.date = addDays(s.meta.date, 7 * turns); return s; };
const mature = (turns = 3) => { const s = world(); for (let i = 0; i < turns; i++) tick(s); return s; };
const put = (s, changes) => withRng(s, () => applyChanges(s, changes));

const LENSES = ['strength', 'economy', 'land'];
const SCOPES = ['great', 'all'];
/** The views the window can ask for: every lens, both row sets, the House/Realm toggle, two houses' detail. */
const OPTS = [
  ...LENSES.flatMap((lens) => SCOPES.map((scope) => ({ lens, scope }))),
  { realm: true }, { scope: 'all', realm: true }, { house: 'lannister' }, { house: 'tyrell', lens: 'economy', scope: 'all' },
];
const sworn = (s) => [...K.friendsOf(s, 'stark')].filter((h) => h !== 'stark');

/** Two-sided tolerance the GDD gives (±5 %), plus the rounding of the third significant figure and of an integer. */
const within = (v, t, pct = 0.05) => Math.abs(v - t) <= pct * Math.abs(t) + (t ? 0.5 * 10 ** (Math.floor(Math.log10(Math.abs(t))) - 2) : 0) + 1;
const holdingsOf = (s, h) => Object.values(s.holdings).filter((x) => x.owner === h);
/** What each cell of the own row is, computed from the truth by the engine's own formulas (§4.1). */
const TRUTH = {
  power: (s, h) => standing(s, h).score, swords: (s, h) => standing(s, h).swords, gold: (s, h) => standing(s, h).gold,
  levies: (s, h) => s.houses[h].figures.levies.v, menAtArms: (s, h) => s.houses[h].figures.menAtArms.v,
  holdings: (s, h) => holdingsOf(s, h).length, people: (s, h) => holdingsOf(s, h).reduce((n, x) => n + (x.population || 0), 0),
  income: (s, h) => project(s, h).income, expenses: (s, h) => project(s, h).expenses,
};

/** Run `fn` with every draw of the engine's dice (and Math.random) counted, and none of them real. */
function counting(fn) {
  const saved = globalThis.__wcDiceScope, math = Math.random; let draws = 0;
  const count = (v) => (...a) => { draws++; return typeof v === 'function' ? v(...a) : v; };
  const store = { next: count(0.5), next32: count(1 << 30), int: count(0), range: count((a) => a), chance: count(false), pick: count((a) => a[0]), shuffle: count((a) => [...a]), state: () => [] };
  globalThis.__wcDiceScope = { getStore: () => store, run: (_s, f) => f() };
  Math.random = () => { draws++; return 0.5; };
  try { fn(); } finally { globalThis.__wcDiceScope = saved; Math.random = math; }
  return draws;
}
/** Every key of a JSON value, at every depth. */
const keysOf = (x, out = []) => { if (Array.isArray(x)) x.forEach((y) => keysOf(y, out)); else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) { out.push(k); keysOf(v, out); } return out; };

// ── the view's shape: what the route and the window read ─────────────────────────────────────────────────────────────

test('the view has one stable shape: asOf, window, lens, scope, realm, you, rows, wars, facts, focus, detail', () => {
  const s = mature(2); const v = view(s);
  for (const k of ['asOf', 'window', 'lens', 'scope', 'realm', 'you', 'rows', 'wars', 'facts', 'focus', 'detail']) assert.ok(k in v, `key ${k}`);
  assert.deepEqual([v.asOf.turn, v.asOf.day], [s.meta.turn, dayNumber(s.meta.date)]); assert.equal(typeof v.asOf.date, 'string');
  assert.equal(v.window.days, 90, 'the window is three moons unless asked'); assert.equal(typeof v.window.samples, 'number');
  assert.deepEqual([v.lens, v.scope, v.realm, v.you], ['strength', 'great', false, 'stark']);
  assert.ok(Array.isArray(v.wars) && Array.isArray(v.facts) && Array.isArray(v.focus), 'wars, facts and focus are lists, empty until R6 fills them');
  assert.equal(v.detail, null);
  assert.ok(v.rows.length >= 6 && rowOf(v, 'stark') && rowOf(v, 'lannister'), 'the great houses, and the viewer\'s own');
  for (const r of v.rows) {
    assert.ok(r.house && 'lord' in r && typeof r.rankTied === 'boolean' && r.cells && typeof r.cells === 'object', r.house);
    assert.ok(r.trend && 'dir' in r.trend && 'arrow' in r.trend && Array.isArray(r.trend.why) && Array.isArray(r.trend.series), `${r.house}: trend`);
    assert.ok(Array.isArray(r.flags), `${r.house}: flags`);
  }
  const ranks = v.rows.map((r) => r.rank).filter((x) => typeof x === 'number');
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b), 'sorted by Power, unknown rows last');
  // what the options mean, and what a missing option means (the route passes null for each parameter not asked for)
  const w = view(s, { lens: 'economy', scope: 'all', realm: true });
  assert.deepEqual([w.lens, w.scope, w.realm], ['economy', 'all', true]);
  assert.equal(json(view(s, { lens: null, scope: null, realm: false, window: null, house: null })), json(v));
  assert.equal(json(view(s, {})), json(v)); assert.equal(json(view(s)), json(v));
  assert.equal(view(s, { lens: 'nonsense', scope: 'nonsense' }).lens, 'strength'); assert.equal(view(s, { scope: 'nonsense' }).scope, 'great');
});

test('the house detail: a house the viewer knows has one; one it does not know is only "unknown"', () => {
  const s = mature(2);
  const d = view(s, { house: 'lannister' }).detail;
  assert.ok(d && typeof d === 'object' && d.unknown !== true, 'Lannister is known');
  assert.ok(view(s, { house: 'stark' }).detail.unknown !== true);
  for (const nobody of ['no_such_house', 'constructor', '__proto__', 'Stark']) {
    const u = view(s, { house: nobody }).detail;
    assert.equal(u?.unknown, true, `"${nobody}"`);
    assert.ok(Object.keys(u).every((k) => ['unknown', 'house'].includes(k)), 'and nothing else is said');
  }
});

// ── R2 acceptance, sentence by sentence ──────────────────────────────────────────────────────────────────────────────

test('non-interference: another house\'s treasury, levies, debts, hosts, mines and war score, with no news to Stark, do not move the view by one byte', () => {
  const s = mature(3);
  s.wars.push({ id: 'w_far', name: 'A war beyond the Trident', attackers: ['martell'], defenders: ['lannister'], started: '—', status: 'ongoing', note: '', score: 0 });
  const before = OPTS.map((o) => json(view(s, o)));
  const friends = K.friendsOf(s, 'stark');
  const t = clone(s);
  for (const h of Object.values(t.houses)) {
    if (friends.has(h.id)) continue;
    for (const f of ['treasury', 'income', 'debt', 'levies', 'menAtArms', 'guard', 'ships', 'food']) h.figures[f].v = 987654321; // the coffers, the muster, the debts, the bread
    h.levyCap = 987654;
  }
  for (const a of forces(t)) if (!K.seesParty(t, 'stark', a)) a.men = 654321;       // hosts Stark has no eyes on
  t.economy.loans.push({ lender: 'lannister', debtor: 'tyrell', amount: 987654321, rate: 0.3, pays: 'coin' }); // a secret debt
  for (const w of t.wars) w.score = 4242;                                          // a war Stark only hears of
  for (const r of t.realmStats.samples) for (const h of Object.keys(r.h)) if (!friends.has(h)) r.h[h] = r.h[h].map((_, i) => 987654 + i); // the truth series of the others
  assert.notEqual(standing(t, 'lannister').swords, standing(s, 'lannister').swords, 'the mutation is real');
  const after = OPTS.map((o) => json(view(t, o)));
  OPTS.forEach((o, i) => assert.equal(after[i], before[i], `view ${json(o)} moved`));
  // the check has teeth: what Stark can know still moves the view
  const own = clone(s); own.houses.stark.figures.treasury.v += 12345;
  assert.notEqual(json(view(own, { lens: 'economy' })), json(view(s, { lens: 'economy' })), 'the viewer\'s own coffers show');
  const vassal = clone(s); vassal.houses.bolton.figures.treasury.v *= 10;
  assert.notEqual(json(view(vassal, { lens: 'economy', scope: 'all' })), json(view(s, { lens: 'economy', scope: 'all' })), 'a sworn house\'s coffers show, to within their estimate');
});

test('own row exact, sworn ~ within ±5 %', () => {
  const s = mature(2);
  for (const lens of LENSES) {
    const v = view(s, { lens, scope: 'all' });
    const own = rowOf(v, 'stark');
    for (const [key, cell] of Object.entries(own.cells)) {
      if (!TRUTH[key]) continue;
      assert.equal(cell.v, TRUTH[key](s, 'stark'), `stark.${key} (${lens}) is exact`);
      assert.equal(cell.mark ?? '', '', `stark.${key}: no mark on the viewer's own`); assert.equal(cell.via, 'self'); assert.equal(cell.age, 0);
    }
    if (lens === 'strength') for (const k of ['power', 'swords', 'levies']) assert.ok(own.cells[k], `the Strength lens has ${k}`);
    if (lens === 'economy') assert.ok(own.cells.gold, 'the Economy lens has gold');
  }
  // the sworn: a lord knows his bannermen's numbers to a few in a hundred
  let checked = 0;
  for (const lens of LENSES) {
    const v = view(s, { lens, scope: 'all' });
    for (const h of sworn(s)) {
      const row = rowOf(v, h); assert.ok(row, `${h} is listed among the sworn`);
      for (const [key, cell] of Object.entries(row.cells)) {
        if (!TRUTH[key] || typeof cell.v !== 'number' || cell.mark !== '~') continue;
        if (['swords', 'levies', 'gold'].includes(key)) assert.equal(cell.via, 'sworn', `${h}.${key} is known as a sworn house's`);
        assert.ok(within(cell.v, TRUTH[key](s, h)), `${h}.${key} (${lens}): ~${cell.v} against ${TRUTH[key](s, h)}`); checked++;
      }
    }
  }
  assert.ok(checked >= 40, `${checked} sworn figures checked`);
  const econ = view(s, { lens: 'economy', scope: 'all' });
  for (const h of sworn(s)) assert.ok(typeof rowOf(econ, h).cells.gold.v === 'number' && rowOf(econ, h).cells.gold.mark === '~', `${h}: a lord knows his bannermen's coffers, as a ~`);
});

test('others ~/≈/— and never a bare number for others (every cell of every lens, both row sets)', () => {
  const s = mature(3);
  const MARKS = new Set(['~', '≈', '≥', '—']); const VIA = new Set(['sworn', 'seen', 'reported', 'rumour', 'learned']);
  let cells = 0, words = 0, unknown = 0, bands = 0;
  for (const lens of LENSES) for (const scope of SCOPES) for (const realm of [false, true]) {
    for (const row of view(s, { lens, scope, realm }).rows) {
      if (row.house === 'stark') continue;
      for (const [key, cell] of Object.entries(row.cells)) {
        const at = `${row.house}.${key} (${lens}/${scope}${realm ? '/realm' : ''})`; cells++;
        assert.ok(cell && typeof cell === 'object', `${at} is a cell, not a bare ${typeof cell}`);
        assert.ok(cell.age === undefined || (Number.isInteger(cell.age) && cell.age >= 0), `${at}: age ${cell.age}`);
        if ('word' in cell) { words++; assert.equal(typeof cell.word, 'string', at); assert.ok(!('v' in cell), `${at}: a word carries no number`); continue; }
        assert.ok(MARKS.has(cell.mark), `${at}: mark ${JSON.stringify(cell.mark)}`);
        if (cell.mark === '—') { unknown++; assert.ok(!(typeof cell.v === 'number'), `${at}: unknown has no number`); continue; }
        if (cell.via !== undefined) assert.ok(VIA.has(cell.via), `${at}: via ${cell.via}`);
        if (cell.mark === '≈') { bands++; assert.ok(Array.isArray(cell.band) && cell.band.length === 2 && cell.band[0] <= cell.band[1], `${at}: a band`); }
        else assert.ok(Number.isFinite(cell.v), `${at}: ${cell.mark} needs its number`);
      }
    }
  }
  assert.ok(cells > 100 && (words + unknown + bands) > 0, `${cells} cells, of which words ${words}, unknown ${unknown}, bands ${bands}: the far houses are not known to the figure`);
});

test('a host seen raises swords ≥ with the report\'s age', () => {
  const s = world();
  const c0 = rowOf(view(s), 'martell').cells.swords;
  put(s, [{ op: 'army_create', id: 'dornish_van', owner: 'martell', name: 'A Dornish host', at: 'stark', men: 5000 }]);
  assert.ok(K.seesParty(s, 'stark', s.parties.dornish_van), 'five thousand Dornishmen at Winterfell\'s gates are seen');
  withRng(s, () => K.updateKnowledge(s, 'stark'));
  const c1 = rowOf(view(s), 'martell').cells.swords;
  assert.equal(c1.mark, '≥', 'what was seen is a lower bound: the rest may not be raised, or not seen');
  assert.ok(c1.v >= 0.9 * 5000, `≥ ${c1.v}`); assert.ok(c1.v > (c0.mark === '≥' ? c0.v : 0), 'it raised the figure');
  assert.equal(c1.age, 0); assert.ok(['seen', 'reported'].includes(c1.via), `via ${c1.via}`);
  // the host rides away out of sight; the word of it ages by the turn
  Object.assign(s.parties.dornish_van, { at: 'martell', pos: [...s.holdings.martell.pos] });
  pass(s, 2);
  const c2 = rowOf(view(s), 'martell').cells.swords;
  assert.equal(c2.mark, '≥'); assert.ok(c2.v >= 0.9 * 5000, 'the last word of it stands'); assert.equal(c2.age, 2, 'and it is two turns old');
});

test('a spy fact teaching a treasury shows a ~ number dated; without it gold is a word', () => {
  const s = mature(2);
  const WORDS = ['sound', 'modest', 'pressed', 'unknown'];
  const gold = (st, h = 'lannister') => rowOf(view(st, { lens: 'economy' }), h).cells.gold;
  const c0 = gold(s);
  assert.ok(WORDS.includes(c0.word) && !('v' in c0), `without it, a word (${json(c0)})`);
  assert.ok(WORDS.includes(gold(s, 'tyrell').word));
  // a spy counts the Rock's coffers: 420,000 (the truth is 500,000: what he says is what the house knows)
  const f = emit(s, 'scheme_discovered', { houses: ['lannister'], place: 'lannister', on: 1, data: { realm: { house: 'lannister', field: 'gold', value: 420000 } }, vis: { scope: 'secret' } });
  K.learn(s, 'stark', f, { via: 'spy', day: f.day });
  withRng(s, () => K.updateKnowledge(s, 'stark'));
  const c1 = gold(s);
  assert.equal(c1.mark, '~'); assert.equal(c1.via, 'learned'); assert.ok(within(c1.v, 420000), `~${c1.v}`);
  assert.ok(Number.isInteger(c1.age) && c1.age >= 0, 'and it is dated');
  assert.ok(WORDS.includes(gold(s, 'tyrell').word), 'the other houses\' coffers are still only words');
  // the turn ends, the fact goes to the log; what was learned is still learned, and a turn older
  flush(s); tick(s);
  const c2 = gold(s);
  assert.equal(c2.mark, '~'); assert.ok(within(c2.v, 420000)); assert.ok(c2.age >= c1.age, 'older, not younger');
});

test('rank ties when bands overlap', () => {
  const s = mature(3);
  const v = view(s, { scope: 'all' });
  const band = (r) => r.cells.power?.band;
  const banded = v.rows.filter((r) => Array.isArray(band(r)));
  const overlap = (a, b) => band(a)[0] <= band(b)[1] && band(b)[0] <= band(a)[1];
  // a row with a number and no band (the viewer's own, an exact figure) is a point: a band that holds it is not clear of it
  const points = v.rows.filter((r) => !Array.isArray(band(r)) && typeof r.cells.power?.v === 'number');
  const loose = points.filter((r) => r.house !== 'stark'); // an estimate that names no band: its reach is the builder's own, so no "clear" claim is made near it
  let ties = 0, alone = 0, apart = 0;
  for (const a of banded) {
    const touches = banded.some((b) => b !== a && overlap(a, b)) || points.some((p) => band(a)[0] <= p.cells.power.v && p.cells.power.v <= band(a)[1]);
    if (touches) { ties++; assert.equal(a.rankTied, true, `${a.house}'s band ${band(a)} overlaps another's: the rank is shared`); }
    else if (!loose.length) { alone++; assert.equal(a.rankTied, false, `${a.house}'s band ${band(a)} touches no other: a rank of its own`); }
    for (const b of banded) if (a !== b && band(a)[0] > band(b)[1]) { apart++; assert.ok(a.rank <= b.rank, `${a.house} (${band(a)}) is clear above ${b.house} (${band(b)})`); }
  }
  assert.ok(banded.length >= 6, `${banded.length} houses with a power band`);
  assert.ok(ties >= 2, `${ties} tied rows: the fixture has overlapping bands`);
  assert.ok(apart >= 1, 'and bands that are clear of one another');
});

test('direction(): growing at +4 %, shrinking at −4 %, and the floor keeps tiny bases quiet', () => {
  const ser = (...vs) => vs.map((x, i) => [1000 + 7 * i, x]);
  const call = (field, then, now, prev, more = {}) => direction(ser(then, now), ser(then, prev), { field, ...more });
  const word = (r) => (typeof r === 'string' ? r : r.dir);
  const TABLE = [
    // field, base, now, a turn earlier (the same side, so the word stands), expected
    ['swords', 1000, 1040, 1045, 'growing'], ['swords', 1000, 1039, 1030, 'steady'], ['swords', 1000, 1000, 1000, 'steady'],
    ['swords', 1000, 960, 950, 'shrinking'], ['swords', 1000, 961, 970, 'steady'],
    ['swords', 10, 12, 12, 'steady'], ['swords', 10, 15, 16, 'growing'],     // the floor of 100 swords: 2 men are not a rise
    ['gold', 200, 230, 235, 'steady'], ['gold', 200, 260, 265, 'growing'],   // the floor of 1,000: a poor treasury does not swing
    ['gold', 2000, 1900, 1880, 'shrinking'], ['income', 0, 3, 3, 'steady'], ['income', 0, 0, 0, 'steady'], ['income', 0, 8, 9, 'growing'],
    ['food', 60, 50, 49, 'shrinking'], ['food', 60, 51, 51, 'steady'], ['food', 60, 70, 71, 'growing'], ['food', 60, 69, 69, 'steady'], // ±1 moon, in tenths
  ];
  const ARROW = { growing: '▲', shrinking: '▼', steady: '▬' };
  for (const [field, then, now, prev, want] of TABLE) {
    const r = call(field, then, now, prev);
    assert.equal(word(r), want, `${field} ${then} → ${now}`);
    if (typeof r === 'object') assert.equal(r.arrow, ARROW[want], `${field} ${then} → ${now}: the arrow`);
  }
});

test('direction(): a word needs two turns running (hysteresis)', () => {
  const ser = (...vs) => vs.map((x, i) => [1000 + 7 * i, x]);
  const word = (r) => (typeof r === 'string' ? r : r.dir);
  const d = (nowSeries, thenSeries) => word(direction(nowSeries, thenSeries, { field: 'swords' }));
  assert.equal(d(ser(1000, 1100), ser(1000, 1010)), 'steady', 'up ten in a hundred this turn, but not last: one battle is not a trend');
  assert.equal(d(ser(1000, 1100), ser(1000, 1120)), 'growing', 'two turns in a row');
  assert.equal(d(ser(1000, 900), ser(1000, 990)), 'steady');
  assert.equal(d(ser(1000, 900), ser(1000, 880)), 'shrinking');
  assert.equal(d(ser(1000, 1100), ser(1000, 900)), 'steady', 'a swing from one side to the other says nothing');
  assert.equal(d(ser(1000, 1010), ser(1000, 1100)), 'steady', 'and a rise that has stopped is over');
});

test('direction(): "seems" when the figure is only reported, and nothing said of fewer than two reports', () => {
  const ser = (...vs) => vs.map((x, i) => [1000 + 14 * i, x]);
  const r = direction(ser(1000, 1100, 1210), ser(1000, 1100, 1190), { field: 'swords', reported: true });
  assert.equal(r.dir, 'growing'); assert.equal(r.seems, true, '"seems to be rising" — the word of a house we only hear of');
  const own = direction(ser(1000, 1100, 1210), ser(1000, 1100, 1190), { field: 'swords' });
  assert.equal(own.dir, 'growing'); assert.ok(!own.seems, 'a house we watch is not "seems"');
  const lone = direction(ser(1000), ser(1000), { field: 'swords', reported: true });
  assert.equal(lone.dir, '—', 'one report cannot say which way a house is going');
});

test('noise is stable: two calls, and a save-load-call, return identical bytes', async () => {
  const s = mature(4);
  const state0 = json(s);
  const a = OPTS.map((o) => json(view(s, o))), b = OPTS.map((o) => json(view(s, o)));
  assert.deepEqual(b, a, 'two calls');
  assert.equal(json(s), state0, 'and the view took nothing from the state and left nothing in it');
  const loaded = migrateState(JSON.parse(state0));              // the state through a save and a load
  assert.deepEqual(OPTS.map((o) => json(view(loaded, o))), a, 'save, load, call');
  // and through the real save file, twice
  const { id } = game.newGame('agot_298', 'stark', { seed: 21 });
  await game.advance(id, { span: '7d' }); await game.settled(id);
  const r1 = OPTS.map((o) => json(view(game.loadState(id), o))), r2 = OPTS.map((o) => json(view(game.loadState(id), o)));
  assert.deepEqual(r2, r1, 'two loads of one save file');
});

test('the Lannister mine depletion cannot change any output', () => {
  const s = mature(3);
  const before = OPTS.map((o) => json(view(s, o)));
  const was = ECONOMY.mineDepletion.lannister, income = project(s, 'lannister').income;
  try {
    ECONOMY.mineDepletion.lannister = 0.6; // the Rock's mines run dry at 60 % a moon
    assert.notEqual(project(s, 'lannister').income, income, 'the truth of the Rock\'s income moved');
    OPTS.forEach((o, i) => assert.equal(json(view(s, o)), before[i], `view ${json(o)} moved with the mine`));
    // and later, as the moons run: the same, over more moons of depletion
    const later = clone(s); later.meta.date = addDays(later.meta.date, 360);
    ECONOMY.mineDepletion.lannister = was;
    const a = view(later, { lens: 'economy', scope: 'all', house: 'lannister' });
    ECONOMY.mineDepletion.lannister = 0.9;
    const b = view(later, { lens: 'economy', scope: 'all', house: 'lannister' });
    assert.equal(json(b), json(a));
  } finally { ECONOMY.mineDepletion.lannister = was; }
});

test('performance ≤ 50 ms for the full scenario', () => {
  const s = mature(6);
  const time = (o) => { const t = performance.now(); view(s, o); return performance.now() - t; };
  for (const o of [{ scope: 'all' }, { scope: 'all' }]) time(o); // warm the engine's caches
  for (const o of [{ scope: 'all' }, { scope: 'all', lens: 'economy' }, { scope: 'all', lens: 'land', realm: true }, { scope: 'all', house: 'lannister' }]) {
    const ms = Array.from({ length: 7 }, () => time(o)).sort((x, y) => x - y);
    assert.ok(ms[3] <= 50, `${json(o)}: median ${ms[3].toFixed(1)} ms (best ${ms[0].toFixed(1)})`);
  }
});

test('no key named minds|goals|secret|schedule|beat anywhere in the JSON — and none of their words', () => {
  const s = mature(3);
  s.minds = { last: { tywin_lannister: 1 }, tywin_lannister: { goals: ['MARK_GOAL'], secret_aim: 'MARK_AIM' } };
  s.characters.tywin_lannister.secret = 'MARK_SECRET'; s.characters.tywin_lannister.goals = ['MARK_GOAL2'];
  const beats = THREADS.flatMap((t) => [t.id, ...t.stages.map((st) => `${t.id}.${st.id}`), ...t.stages.map((st) => st.id).filter((id) => id.includes('_'))]).filter((x) => x.length > 8);
  let seen = 0;
  for (const o of OPTS) {
    const v = view(s, o); const text = json(v); seen++;
    const bad = keysOf(v).filter((k) => /minds|goals|secret|schedule|beat/i.test(k));
    assert.deepEqual(bad, [], `${json(o)}: keys ${bad}`);
    for (const m of ['MARK_', s.characters.cersei_lannister.secret.slice(0, 24), ...beats]) assert.ok(!text.includes(m), `${json(o)}: "${m}" is in the view`);
  }
  assert.equal(seen, OPTS.length);
});

// ── how it is fed: the observations, and no dice ─────────────────────────────────────────────────────────────────────

test('what a house has observed: only what it could learn, blurred, dated, kept short; nothing stored for its own or its sworn', () => {
  const s = world();
  for (let i = 0; i < 30; i++) tick(s);
  const R = s.knowledge.stark.realm;
  assert.ok(R && Object.keys(R).length >= 4, 'the great houses are heard of');
  const friends = K.friendsOf(s, 'stark');
  for (const h of friends) assert.equal(R[h], undefined, `no observation of ${h}: those are read live`);
  const V = new Set(['swords', 'levies', 'gold', 'income', 'food', 'ships', 'holdings', 'people', 'power']); // 19 §3.2, and no more
  const VIA = new Set(['seen', 'reported', 'rumour', 'learned']);
  let nums = 0, exact = 0;
  for (const [subject, { obs }] of Object.entries(R)) {
    assert.ok(s.houses[subject], subject); assert.ok(obs.length >= 1 && obs.length <= 24, `${subject}: ${obs.length} observations`);
    obs.forEach((o, i) => {
      assert.ok(Number.isInteger(o.day) && Number.isInteger(o.turn) && VIA.has(o.via) && o.v && typeof o.v === 'object', `${subject}[${i}]: ${json(o).slice(0, 120)}`);
      assert.ok(i === 0 || (o.day >= obs[i - 1].day && o.turn >= obs[i - 1].turn), 'oldest first, newest last');
      assert.ok(o.turn <= s.meta.turn && o.day <= dayNumber(s.meta.date), 'never from the future');
      for (const [k, x] of Object.entries(o.v)) if (typeof x === 'number') { assert.ok(V.has(k), `${subject}: an observation of ${k} is more than a house can know`); assert.ok(Number.isFinite(x)); }
    });
    const last = obs.at(-1);
    const t = { swords: standing(s, subject).swords, levies: s.houses[subject].figures.levies.v, gold: standing(s, subject).gold, income: project(s, subject).income };
    for (const k of Object.keys(t)) if (typeof last.v[k] === 'number' && last.turn === s.meta.turn) { nums++; if (last.v[k] === t[k]) exact++; }
  }
  if (nums >= 3) assert.ok(exact < nums / 2, `${exact} of ${nums} stored figures are the truth to the unit: they should be what the house was told`);
});

test('the engine RNG stream is unchanged by the view and by what the house observes: no draws', () => {
  assert.equal(counting(() => { random(); randInt(3); Math.random(); }), 3, 'the counter sees the engine\'s dice, and Math.random');
  const s = mature(2); const dice = [...s.meta.rngState];
  const draws = counting(() => {
    for (const o of OPTS) view(s, o);
    K.updateKnowledge(s, 'stark', () => 0.5);               // with the dice handed in, the realm's part of it needs none of its own
    s.meta.turn += 1; s.meta.date = addDays(s.meta.date, 7); K.updateKnowledge(s, 'stark', () => 0.5);
    for (const o of OPTS) view(s, o);
  });
  assert.equal(draws, 0, 'not one roll, not one Math.random');
  assert.deepEqual(s.meta.rngState, dice);
});
