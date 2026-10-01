// The realm ledger's truth series (docs/gdd/19-realm-ledger.md §3.1, §9; WP R1): one cheap record of every house's
// figures per turn, kept in the save (so undo unmakes it), thinned so a long game stays small, and made without one draw
// of the engine's dice. Each test is one sentence of the R1 acceptance column (§11), in the GDD's words.
//
// How the "30 turns of the mock jump" is driven: a real 7-day turn on the mock costs ~1 s, so 30 of them would break the
// 20 s budget. The real server/game.js `advance` is used for a handful of turns (a sample per turn, power = standing,
// determinism, undo, the turn record); the thinning is driven by calling `sampleRealm` directly over a state whose day is
// advanced with the engine's own time helpers (`addDays`), 30 and 200 turns of it.
//
// Contract the tests fix where the GDD leaves a detail open (the builder must match; each is one line to change here):
//   • `thin(samples)` is pure: it returns the thinned array and does not touch its argument;
//   • `seriesOf(state, house, field)` returns `[[day, value], …]` oldest first (the shape of §7's `trend.series`), and
//     `[]` for a house or field it has no record of;
//   • `figuresOf(state, house)` returns an object keyed by the §3.1 field names;
//   • `hash32(...parts)` is a pure 32-bit hash of its arguments (§2 M5: `hash32(seed, viewer, subject, field, obsTurn)`);
//   • a first sample is taken by `createInitialState` itself (R1 acceptance 1), and again by `newGame`'s saved state.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

process.env.WC_PROVIDER = 'mock';
// the modules under test first: when they are missing the file fails here, before it has made a save directory to leave behind
const { figuresOf } = await import('../public/js/engine/realm/figures.js');
const { sampleRealm, thin, seriesOf } = await import('../public/js/engine/realm/stats.js');
const { observe, estimateOf } = await import('../public/js/engine/realm/estimate.js');
process.env.WC_SAVES = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-realm-stats-'));
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const game = await import('../server/game.js');
const { createInitialState, migrateState } = await import('../public/js/shared/world.js');
const { standing } = await import('../public/js/shared/standing.js');
const { dayNumber, addDays } = await import('../public/js/engine/time.js');
const { makeRng, seedState, hash32, random, randInt } = await import('../public/js/engine/rng.js');
const { validate } = await import('../public/js/engine/state/validate.js');

test.after(() => fs.rmSync(process.env.WC_SAVES, { recursive: true, force: true }));

const FIELDS = ['swords', 'levies', 'menAtArms', 'guard', 'gold', 'debt', 'income', 'expenses', 'food', 'ships', 'holdings', 'people', 'prosperity', 'unrest', 'power'];
const at = (f) => FIELDS.indexOf(f);
const world = (house = 'stark', seed = 298) => createInitialState('agot_298', house, { seed });
const clone = (x) => JSON.parse(JSON.stringify(x));
/** One more turn of `days` days in a state, the way the engine's clock moves it, and its sample. */
const step = (s, days = 7) => { s.meta.turn += 1; s.meta.date = addDays(s.meta.date, days); sampleRealm(s); return s; };
const HOUSE_RANKS = new Set(['crown', 'paramount', 'major', 'order', 'tribe', 'city_state', 'company', 'exile']);

// ── a real game, played once and shared by the tests that need real turns ────────────────────────────────────────────
const PLAY = ['7d', '7d', '7d'];
async function play(seed = 298) {
  const { id } = game.newGame('agot_298', 'stark', { seed });
  const start = game.loadState(id);
  const vassals = Object.values(start.houses).filter((h) => h.liege === 'stark').map((h) => h.id);
  game.act(id, { kind: 'call_banners', vassals, at: 'stark', ownLevies: 3000 }); // hosts in the field: swords are not just levies at home
  game.setOrders(id, [{ text: 'Send Ser Rodrik Cassel with fifty men to White Harbor.' }]);
  const states = [game.loadState(id)];
  for (const span of PLAY) { await game.advance(id, { span }); await game.settled(id); states.push(game.loadState(id)); }
  return { id, states };
}
let sharedPlay;
const played = () => (sharedPlay ||= play());

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

test('after createInitialState a sample exists: the §3.1 shape, integers only, every house of standing', () => {
  const s = world();
  const R = s.realmStats;
  assert.ok(R, 'the new world carries a realmStats');
  assert.equal(R.v, 1); assert.deepEqual(R.fields, FIELDS);
  assert.ok(R.wars && typeof R.wars === 'object' && !Array.isArray(R.wars), 'wars: an object of series, empty for now');
  assert.equal(R.samples.length, 1, 'one sample at the start, so a series never begins empty');
  const [first] = R.samples;
  assert.equal(first.day, dayNumber(s.meta.date)); assert.equal(first.turn, s.meta.turn);
  assert.deepEqual(Object.keys(first).sort(), ['day', 'h', 'turn']);
  for (const [house, row] of Object.entries(first.h)) {
    assert.equal(row.length, FIELDS.length, `${house}: one int per field`);
    assert.ok(row.every((x) => Number.isInteger(x)), `${house}: integers only (${row})`);
    assert.ok(s.houses[house], `${house} is a house of this world`);
  }
  // which houses (§3.1): the great and the orders, the player's own, and the minor houses sworn to one of those
  assert.ok(first.h.stark, 'the player\'s house');
  for (const h of Object.values(s.houses)) {
    const lesser = !!s.holdings[h.id]?.lesser; // a lesser house (WP G1) is sampled only for its liege's player: nobody else reads its row back
    const listed = lesser ? h.liege === 'stark' : HOUSE_RANKS.has(h.rank) || h.id === 'stark' || (h.rank === 'minor' && HOUSE_RANKS.has(s.houses[h.liege]?.rank));
    if (listed) assert.ok(first.h[h.id], `${h.id} (${h.rank}) is sampled`);
    if (lesser && h.liege !== 'stark') assert.ok(!first.h[h.id], `${h.id} is a lesser house of another's: not sampled`);
  }
});

test('after createInitialState a sample exists: a new game\'s saved state carries it too', () => {
  const { id } = game.newGame('agot_298', 'stark', { seed: 298 });
  const st = game.loadState(id);
  assert.equal(st.realmStats.samples.length, 1);
  assert.equal(st.realmStats.samples[0].turn, 0); assert.equal(st.realmStats.samples[0].day, dayNumber(st.meta.date));
  assert.deepEqual(validate(st), []);
});

test('the figures come from one place: figuresOf, and the sample is figuresOf', () => {
  const s = world();
  for (const house of ['stark', 'lannister']) {
    const f = figuresOf(s, house); const st = standing(s, house); const h = s.houses[house];
    for (const k of FIELDS) assert.ok(Number.isFinite(f[k]), `${house}.${k} is a number (${f[k]})`);
    assert.equal(f.swords, st.swords); assert.equal(f.power, st.score);
    assert.equal(f.levies, h.figures.levies.v); assert.equal(f.menAtArms, h.figures.menAtArms.v);
    assert.equal(f.holdings, Object.values(s.holdings).filter((x) => x.owner === house).length);
    const row = s.realmStats.samples.at(-1).h[house];
    for (const k of ['swords', 'levies', 'menAtArms', 'holdings', 'power']) assert.equal(row[at(k)], f[k], `${house}: the sample's ${k} is figuresOf's`);
  }
});

test('the index of a pass over many houses changes no figure of any house, and the sample is cheap with it', async () => {
  const { figuresIndex } = await import('../public/js/engine/realm/figures.js');
  const s = world('stark', 7); const ix = figuresIndex(s);
  for (const house of Object.keys(s.houses)) assert.deepEqual(figuresOf(s, house, ix), figuresOf(s, house), `${house}: the same figures with the index`);
  assert.deepEqual(standing(s, 'stark', ix), standing(s, 'stark'));
  // 290 houses made one scan of the world each took a tenth of a second; the index makes the pass a few milliseconds (a loose guard: CI boxes are slow)
  const c = JSON.parse(JSON.stringify(s)); const t0 = performance.now(); sampleRealm(c); assert.ok(performance.now() - t0 < 60, `the sample took ${(performance.now() - t0).toFixed(0)} ms`);
});

test('own power equals state.standing.score exactly after a turn (and every house\'s power is standing\'s score)', async () => {
  const { states } = await played();
  for (const st of states.slice(1)) {
    const sample = st.realmStats.samples.at(-1);
    assert.equal(sample.turn, st.meta.turn, 'the newest sample is this turn\'s');
    assert.equal(sample.h.stark[at('power')], st.standing.score, `turn ${st.meta.turn}: own power is the HUD's score`);
    for (const [house, row] of Object.entries(sample.h)) assert.equal(row[at('power')], standing(st, house).score, `turn ${st.meta.turn}: ${house}`);
  }
});

test('swords equals standing().swords', async () => {
  const { states } = await played();
  for (const st of states.slice(1)) {
    const sample = st.realmStats.samples.at(-1);
    assert.equal(sample.h.stark[at('swords')], standing(st, 'stark').swords, `turn ${st.meta.turn}: hosts + levies + men-at-arms`);
    for (const [house, row] of Object.entries(sample.h)) assert.equal(row[at('swords')], standing(st, house).swords, `turn ${st.meta.turn}: ${house}`);
  }
  const last = states.at(-1);
  assert.ok(Object.values(last.parties).some((a) => a.owner === 'stark' && a.men > 0), 'the banners were called: there is a host in the count');
});

test('a real turn adds a sample; a sample is the turn\'s, dated by the world\'s clock; the turn record keeps the whole row', async () => {
  const { id, states } = await played();
  let prev = states[0].realmStats.samples.length;
  for (const st of states.slice(1)) {
    const R = st.realmStats;
    assert.equal(R.samples.at(-1).day, dayNumber(st.meta.date));
    assert.ok(R.samples.length >= prev, 'a turn never takes a sample away (thinning is for older ones)'); prev = R.samples.length;
    assert.deepEqual(validate(st), [], `turn ${st.meta.turn}: the invariants hold`);
  }
  // mirrored whole-turn into turns/NNNNNN.json as record.realm (§3.1)
  const rec = game.readTurn(id, 2);
  const sample = states[2].realmStats.samples.at(-1);
  assert.ok(rec.realm, 'the turn record has `realm`');
  assert.equal(rec.realm.turn, 2); assert.equal(rec.realm.day, sample.day);
  assert.deepEqual(rec.realm.h.stark, sample.h.stark);
});

test('30 turns of the mock jump: one sample per ≥ 7 days, ≤ 48 samples, thinning keeps the newest 16', () => {
  const s = world(); const d0 = dayNumber(s.meta.date);
  for (let i = 1; i <= 30; i++) { s.houses.stark.figures.treasury.v += 1000; step(s, 7); }
  let S = s.realmStats.samples;
  assert.ok(S.length <= 48, `${S.length} samples`);
  for (let i = 1; i < S.length; i++) assert.ok(S[i].day - S[i - 1].day >= 7, `samples ${i - 1}/${i} are ${S[i].day - S[i - 1].day} days apart`);
  assert.deepEqual(S.slice(-16).map((x) => x.turn), Array.from({ length: 16 }, (_, i) => 15 + i), 'the newest 16 turns are all there, unthinned');
  assert.deepEqual(S.slice(-16).map((x) => x.day), Array.from({ length: 16 }, (_, i) => d0 + 7 * (15 + i)));
  assert.ok(S.length < 31, 'the older ones are thinned (every 4th)');
  // and a long game: 200 turns, still ≤ 48 and the newest 16 whole
  for (let i = 31; i <= 200; i++) step(s, 7);
  S = s.realmStats.samples;
  assert.ok(S.length <= 48 && S.length >= 17, `${S.length} samples after 200 turns`);
  assert.deepEqual(S.slice(-16).map((x) => x.turn), Array.from({ length: 16 }, (_, i) => 185 + i));
  for (let i = 1; i < S.length; i++) assert.ok(S[i].day > S[i - 1].day && S[i].turn > S[i - 1].turn, 'oldest first, strictly forward');
  assert.deepEqual(validate(s), [], 'the thinned series is a valid one');
});

test('a shorter turn overwrites the last sample of that week; a new week adds one; the sample is the world as it now stands', () => {
  const s = world(); const d0 = dayNumber(s.meta.date);
  const lev = at('levies');
  s.houses.stark.figures.levies.v = 111; step(s, 3);
  let S = s.realmStats.samples;
  assert.equal(S.length, 1, 'three days on: the same week, the same sample');
  assert.equal(S[0].day, d0 + 3); assert.equal(S[0].turn, 1); assert.equal(S[0].h.stark[lev], 111, 'and it is the new figures');
  s.houses.stark.figures.levies.v = 222; step(s, 14);
  S = s.realmStats.samples;
  assert.equal(S.length, 2, 'a fortnight on: a new sample');
  assert.equal(S.at(-1).h.stark[lev], 222); assert.equal(S.at(-1).day, d0 + 17);
});

test('thin(): pure; keeps the newest 16 in order, thins the older, caps at 48, invents nothing', () => {
  const mk = (i) => ({ day: 1000 + 7 * i, turn: i, h: { stark: FIELDS.map((_, k) => i * 100 + k) } });
  const many = Array.from({ length: 100 }, (_, i) => mk(i)); const before = JSON.stringify(many);
  const out = thin(many);
  assert.equal(JSON.stringify(many), before, 'the argument is left alone');
  assert.ok(Array.isArray(out) && out.length <= 48, `${out.length}`);
  assert.deepEqual(out.slice(-16), many.slice(-16), 'the newest 16, whole');
  assert.ok(out.every((x) => many.some((y) => JSON.stringify(y) === JSON.stringify(x))), 'nothing invented');
  assert.ok(out.every((x, i) => i === 0 || x.day > out[i - 1].day), 'oldest first');
  const some = Array.from({ length: 30 }, (_, i) => mk(i));
  const t30 = thin(some);
  assert.deepEqual(t30.slice(-16), some.slice(-16)); assert.ok(t30.length < 30 && t30.length >= 17, `${t30.length}`);
  const few = Array.from({ length: 10 }, (_, i) => mk(i));
  assert.deepEqual(thin(few), few, 'a short series is not thinned');
  assert.deepEqual(thin([]), []);
});

test('seriesOf(): [[day, value]] from the truth series; nothing for a house or field it does not know', () => {
  const s = world(); for (let i = 0; i < 5; i++) { s.houses.stark.figures.treasury.v += 500; step(s, 7); }
  const want = s.realmStats.samples.map((x) => [x.day, x.h.stark[at('power')]]);
  assert.deepEqual(seriesOf(s, 'stark', 'power'), want);
  assert.deepEqual(seriesOf(s, 'stark', 'gold'), s.realmStats.samples.map((x) => [x.day, x.h.stark[at('gold')]]));
  assert.deepEqual(seriesOf(s, 'no_such_house', 'power'), []);
  assert.deepEqual(seriesOf(s, 'stark', 'no_such_field'), []);
});

test('a house that is no more stops being sampled; its last sample stays', () => {
  const s = world(); step(s, 7);
  assert.ok(s.realmStats.samples.at(-1).h.frey);
  s.houses.frey.status = 'extinct'; step(s, 7);
  const S = s.realmStats.samples;
  assert.ok(!S.at(-1).h.frey, 'no new row for an extinct house');
  assert.ok(S.at(-2).h.frey, 'the old rows are still there');
  assert.ok(S.at(-1).h.stark && S.at(-1).h.lannister);
});

test('sample is deterministic: two runs of the same seed give byte-identical realmStats', async () => {
  const a = await played();
  const own = makeRng(seedState(4242)); const real = Math.random; Math.random = () => own.next(); // a different Math.random the second time round
  let b;
  try { b = await play(298); } finally { Math.random = real; }
  assert.ok(a.states.at(-1).realmStats.samples.length >= 4);
  for (let i = 0; i < a.states.length; i++) assert.equal(JSON.stringify(b.states[i].realmStats), JSON.stringify(a.states[i].realmStats), `after turn ${i}`);
  // and the same over a driven series
  const x = world(), y = world(); for (let i = 0; i < 40; i++) { step(x, 7); step(y, 7); }
  assert.equal(JSON.stringify(x.realmStats), JSON.stringify(y.realmStats));
});

test('undo restores the series (snapshot)', async () => {
  const { id } = game.newGame('agot_298', 'stark', { seed: 11 });
  const s0 = game.loadState(id);
  await game.advance(id, { span: '7d' }); await game.settled(id);
  const s1 = game.loadState(id);
  await game.advance(id, { span: '7d' }); await game.settled(id);
  const s2 = game.loadState(id);
  assert.notEqual(JSON.stringify(s2.realmStats), JSON.stringify(s1.realmStats), 'the second turn added to the series');
  assert.equal(s1.realmStats.samples.at(-1).turn, 1); assert.equal(s0.realmStats.samples.at(-1).turn, 0);
  const back1 = await game.undo(id, { turns: 1 });
  assert.equal(JSON.stringify(back1.realmStats), JSON.stringify(s1.realmStats), 'one turn unmade: the series of the eve of it');
  const back0 = await game.undo(id, { turns: 1 });
  assert.equal(JSON.stringify(back0.realmStats), JSON.stringify(s0.realmStats), 'and one more: the first sample alone');
  assert.equal(game.loadState(id).realmStats.samples.length, s0.realmStats.samples.length);
});

test('old-save migration adds an empty series without changing any other field', async () => {
  // (a) a real v2 save: it arrives with a well-formed, empty-or-first series; loading it again adds nothing
  const raw = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ROOT, 'tests/fixtures/saves/v2-stark-turn3.json.gz'))));
  assert.equal(raw.realmStats, undefined);
  const a = migrateState(structuredClone(raw));
  assert.equal(a.realmStats.v, 1); assert.deepEqual(a.realmStats.fields, FIELDS);
  assert.ok(a.realmStats.samples.length <= 1, 'an old save has no history to invent: empty, or one sample of now');
  if (a.realmStats.samples.length) { assert.equal(a.realmStats.samples[0].turn, a.meta.turn); assert.equal(a.realmStats.samples[0].day, dayNumber(a.meta.date)); }
  const again = migrateState(structuredClone(a));
  assert.equal(JSON.stringify(again), JSON.stringify(a), 'migrating a migrated save changes nothing — not even one more sample (every load runs it)');
  // (b) a save of today that has lost its series: migrating adds `realmStats` and touches nothing else
  const { states } = await played();
  const lost = clone(states[2]); delete lost.realmStats;
  const m = migrateState(clone(lost));
  const { realmStats, ...rest } = m;
  assert.equal(JSON.stringify(rest), JSON.stringify(lost), 'every other field, byte for byte');
  assert.ok(realmStats && realmStats.samples.length <= 1);
  // (c) through the server's own loader
  fs.mkdirSync(path.join(game.SAVES, 'oldsave'), { recursive: true });
  fs.writeFileSync(path.join(game.SAVES, 'oldsave', 'state.json'), JSON.stringify(raw));
  const loaded = game.loadState('oldsave');
  assert.equal(loaded.realmStats.v, 1); assert.ok(loaded.realmStats.samples.length <= 1);
});

test('engine RNG stream unchanged with the feature on (draw counter equal: none drawn by the sample, the figures or the observations)', () => {
  assert.equal(counting(() => { random(); randInt(3); Math.random(); }), 3, 'the counter sees the engine\'s dice, and Math.random');
  const s = world(); const dice = [...s.meta.rngState];
  const draws = counting(() => {
    sampleRealm(s);
    s.meta.turn += 1; s.meta.date = addDays(s.meta.date, 7); sampleRealm(s);
    figuresOf(s, 'lannister'); seriesOf(s, 'stark', 'power'); thin(s.realmStats.samples);
    observe(s, 'stark');
    s.meta.turn += 1; s.meta.date = addDays(s.meta.date, 7); observe(s, 'stark');
    estimateOf(s, 'stark', 'lannister'); estimateOf(s, 'stark', 'stark');
  });
  assert.equal(draws, 0, 'not one roll of the dice, not one Math.random');
  assert.deepEqual(s.meta.rngState, dice, 'the save\'s stream has not moved');
});

test('hash32: a pure 32-bit hash, the noise\'s only source (same arguments, same number; any argument changes it)', () => {
  const h = hash32(298, 'stark', 'lannister', 'swords', 3);
  assert.ok(Number.isInteger(h) && h >= 0 && h < 2 ** 32, `${h}`);
  assert.equal(hash32(298, 'stark', 'lannister', 'swords', 3), h);
  const others = [hash32(299, 'stark', 'lannister', 'swords', 3), hash32(298, 'tully', 'lannister', 'swords', 3), hash32(298, 'stark', 'tyrell', 'swords', 3), hash32(298, 'stark', 'lannister', 'levies', 3), hash32(298, 'stark', 'lannister', 'swords', 4)];
  for (const o of others) assert.notEqual(o, h);
  assert.notEqual(hash32('ab', 'c'), hash32('a', 'bc'), 'arguments are kept apart');
  const xs = Array.from({ length: 2000 }, (_, i) => hash32(298, 'stark', 'x', 'y', i) / 2 ** 32);
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length; assert.ok(Math.abs(mean - 0.5) < 0.08, `mean ${mean}`);
  assert.ok(new Set(xs).size > 1990, 'few collisions');
});

test('the invariants know a bad series: rows the width of the fields, no NaN, days that only go forward', () => {
  const s = world(); step(s, 7); step(s, 7);
  assert.deepEqual(validate(s), []);
  const bad = (fn) => { const t = clone(s); fn(t); return validate(t); };
  assert.ok(bad((t) => t.realmStats.samples[0].h.stark.pop()).length, 'a row shorter than the fields');
  assert.ok(bad((t) => { t.realmStats.samples[1].h.stark[0] = null; }).length, 'a NaN (as JSON keeps it: null)');
  assert.ok(bad((t) => { t.realmStats.samples[1].h.stark[3] = 'many'; }).length, 'a word where a number belongs');
  assert.ok(bad((t) => { t.realmStats.samples[1].day = t.realmStats.samples[0].day - 1; }).length, 'a day that goes backwards');
  const nan = clone(s); nan.realmStats.samples[0].h.stark[2] = NaN;
  assert.ok(validate(nan).length, 'NaN itself');
  assert.deepEqual(validate(s), [], 'and the good one is still good');
});
