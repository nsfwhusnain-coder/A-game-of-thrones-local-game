// Tourneys are events with days in them (docs/BUG-HUNT-2026-10-02.md, ST2, ST3, ST9): called, the lords of the region ride in, the
// lists are run three weeks on among the knights who are there, and the result is told on that later day. Before: a tourney was
// called and won in one step, the champion was any knight in the world (Rakharo won a name-day tourney at Starfall), the lords
// began to ride for it after it was over, and a knight died in the lists at the post he held, far from them.
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.WC_PROVIDER = 'mock';
const { createInitialState, applyChanges } = await import('../public/js/shared/world.js');
const { perform } = await import('../public/js/engine/actions/registry.js');
const { withRng, seedState } = await import('../public/js/engine/rng.js');
const { dayNumber, dateOfDay } = await import('../public/js/engine/time.js');
const { listsTick, jousters, LISTS_AFTER, GUESTS_RIDE, tourneyNow } = await import('../public/js/shared/tourney.js');
const { retinueTick } = await import('../public/js/shared/retinues.js');
const { worldTick } = await import('../public/js/shared/plots.js');
const { placeOf, joinParty } = await import('../public/js/engine/parties.js');
const { engineDay } = await import('../server/turn/day.js');

const world = (house = 'stark', seed = 7) => { const s = createInitialState('agot_298', house, { seed }); s.facts = []; return s; };
const goTo = (s, n) => { s.meta.date = dateOfDay(n); s.meta.clock = { turn: s.meta.turn + 1, from: n, to: n }; };
const today = (s) => dayNumber(s.meta.date);
const order = (s, house = 'stark') => perform(s, 'hold_tourney', { house, params: {}, source: { type: 'order', ref: 'o1' } });
const kinds = (s, k) => s.facts.filter((f) => f.kind === k);

test('ST2: a tourney is called on the day it is ordered, with no champion, and its lists are named for three weeks on', () => {
  const s = world(); s.meta.clock = { turn: 1, from: today(s), to: today(s) };
  const r = withRng(s, () => order(s)); assert.ok(r.ok, r.refusal?.text);
  assert.equal(kinds(s, 'tourney').length, 1, 'the call is a fact'); assert.equal(kinds(s, 'tourney_result').length, 0, 'and nobody has won anything');
  assert.deepEqual(kinds(s, 'death'), [], 'nor died');
  assert.match(r.receipt[0].text, /called/i); assert.doesNotMatch(r.receipt[0].text, /champion/i);
  assert.equal(s.plots.lists.stark.on, today(s) + LISTS_AFTER); assert.equal(kinds(s, 'tourney')[0].data.lists, today(s) + LISTS_AFTER);
  // not twice at once
  const again = withRng(s, () => order(s)); assert.equal(again.ok, false); assert.equal(again.refusal.code, 'called');
});

test('ST2: the lists are run on their day, among those who are there, and the result is a fact of a later day', () => {
  const s = world(); s.meta.clock = { turn: 1, from: today(s), to: today(s) };
  withRng(s, () => order(s)); const called = today(s);
  for (let d = 1; d < LISTS_AFTER; d++) { goTo(s, called + d); withRng(s, () => listsTick(s)); }
  assert.equal(kinds(s, 'tourney_result').length, 0, 'not before its day');
  goTo(s, called + LISTS_AFTER); withRng(s, () => listsTick(s));
  const res = kinds(s, 'tourney_result'); assert.equal(res.length, 1); assert.ok(res[0].day > kinds(s, 'tourney')[0].day, 'told on a later day than the call');
  assert.equal(res[0].place, 'stark'); assert.ok(res[0].actors[0]); assert.equal(s.plots.lists.stark, undefined, 'the lists are run once');
  withRng(s, () => listsTick(s)); assert.equal(kinds(s, 'tourney_result').length, 1);
});

test('ST3: the champion is one who is at the seat or has ridden in with a guest\'s retinue: never a knight of the other end of the realm', () => {
  const far = ['barristan_selmy', 'rakharo', 'brynden_tully', 'jaime_lannister', 'loras_tyrell', 'sandor_clegane'];
  const seen = new Set(); const base = JSON.stringify(world('stark', 7));
  for (let seed = 1; seed <= 60; seed++) {
    const s = JSON.parse(base); s.meta.rngState = seedState(seed); s.meta.clock = { turn: 1, from: today(s), to: today(s) }; // (one world, the dice drawn sixty ways)
    // a guest has ridden in: Lord Roose Bolton and his people, halted at Winterfell
    s.parties.party_roose = { id: 'party_roose', owner: 'bolton', name: "Roose Bolton's party", commander: 'roose_bolton', at: 'stark', pos: [...s.holdings.stark.pos], men: 80, kind: 'retinue', members: [], march: null, purpose: { dest: 'stark', home: 'bolton', stay: 5 } };
    joinParty(s, s.characters.roose_bolton, s.parties.party_roose);
    const here = new Set(jousters(s, 'stark').map((x) => x.c.id));
    assert.ok(here.has('jory_cassel') && here.has('roose_bolton'), `the household and the guest are there (${[...here].join(', ')})`);
    for (const id of far) assert.ok(!here.has(id), `${id} is far away and no jouster`);
    withRng(s, () => order(s)); goTo(s, today(s) + LISTS_AFTER); withRng(s, () => listsTick(s));
    const champ = kinds(s, 'tourney_result')[0]?.actors[0]; assert.ok(champ, `a champion (seed ${seed})`); seen.add(champ);
    assert.ok(here.has(champ), `${champ} won at Winterfell and was not there (seed ${seed})`);
    assert.equal(s.characters[champ].memories.at(-1).includes('Champion of the tourney at Winterfell'), true);
  }
  assert.ok(seen.size >= 3, `the lists have more than one winner: ${[...seen].join(', ')}`);
});

test('ST3: a seat where no one is fit to ride has no lists and no champion (not one from far away)', () => {
  const s = world(); s.meta.clock = { turn: 1, from: today(s), to: today(s) };
  withRng(s, () => order(s));
  for (const c of Object.values(s.characters)) if (placeOfSeat(s, c) === 'stark') c.status = 'wounded';
  goTo(s, today(s) + LISTS_AFTER); withRng(s, () => listsTick(s));
  assert.equal(kinds(s, 'tourney_result').length, 0);
});
function placeOfSeat(s, c) { return placeOf(s, c); }

test('ST2: a host whose hall is besieged, or lost, runs no lists', () => {
  for (const spoil of [(s) => { s.holdings.stark.status = 'besieged'; }, (s) => { s.holdings.stark.owner = 'lannister'; }]) {
    const s = world(); s.meta.clock = { turn: 1, from: today(s), to: today(s) };
    withRng(s, () => order(s)); spoil(s); goTo(s, today(s) + LISTS_AFTER); withRng(s, () => listsTick(s));
    assert.equal(kinds(s, 'tourney_result').length, 0); assert.equal(s.plots.lists.stark, undefined, 'and the day is not kept for later');
  }
});

test('ST2: the lords of the region ride in only while the call is fresh, and stay for the lists: none sets out for a tourney that is over', async () => {
  const s = world('tully'); s.meta.clock = { turn: 1, from: today(s), to: today(s) };
  withRng(s, () => order(s, 'tully')); const called = today(s); const seat = s.houses.tully.seat;
  const rides = []; const home = [];
  for (let d = 1; d <= 45; d++) {
    // the day loop itself (server/turn/day.js): the parties walk, the lords are sent out, the lists are run
    s.meta.date = dateOfDay(called + d - 1); s.meta.clock = { turn: 1, from: called + d - 1, to: called + 45 };
    await withRng(s, () => engineDay(s, { deliver: async () => [], touched: new Set() }));
    // (the tourney of this call: another house of the region may call its own in the forty-five days, and its guests ride on their own days)
    for (const f of s.facts) if (f.kind === 'set_out' && /tourney/i.test(`${f.text} ${f.data?.why || ''}`) && new RegExp(`tourney at ${s.holdings[seat].name}`).test(`${f.text} ${f.data?.why || ''}`) && !f.seen) { f.seen = true; rides.push({ day: f.day - called, text: f.text }); }
    for (const f of s.facts) if (f.kind === 'set_out' && f.data?.returning && f.place === seat && !f.seen) { f.seen = true; home.push({ day: f.day - called, text: f.text }); }
  }
  assert.ok(rides.length >= 3, `the region's lords ride in (${rides.length})`);
  assert.ok(rides.every((x) => x.day <= GUESTS_RIDE + 1), `all set out in the first ${GUESTS_RIDE} days: ${rides.map((x) => x.day).join(',')}`);
  assert.ok(tourneyNow(s).length === 0, 'and the call is no longer fresh');
  const arrived = s.facts.filter((f) => f.kind === 'arrived' && f.place === seat && f.day - called <= LISTS_AFTER);
  assert.ok(arrived.length >= 1, 'some have arrived by the day of the lists');
  // none of them rides home before the lists are run, whatever its stay was: the lists are told on day LISTS_AFTER
  assert.ok(home.every((x) => x.day >= LISTS_AFTER), `no guest rides home before the lists (${home.map((x) => x.day).join(',')})`);
  const res = kinds(s, 'tourney_result').filter((f) => f.place === seat); assert.equal(res.length, 1); assert.equal(res[0].day - called, LISTS_AFTER);
});

test('ST3: a name-day tourney is called before it is run: no result of a tourney nobody called, and the champion was there', () => {
  const s = world('stark', 11); s.meta.clock = { turn: 1, from: today(s), to: today(s) };
  const start = today(s);
  withRng(s, () => {
    for (let m = 0; m < 14; m++) {
      goTo(s, start + 30 * m); worldTick(s, 30); // a moon of the realm's small life: some lord names a day for jousts
      for (let d = 1; d <= 30; d++) { goTo(s, start + 30 * m + d); listsTick(s); }
    }
  });
  const called = kinds(s, 'tourney'); const results = kinds(s, 'tourney_result');
  assert.ok(called.length >= 2, `some name-days are called in fourteen moons (${called.length})`);
  for (const r of results) {
    const c = called.find((t) => t.place === r.place && r.day - t.day === LISTS_AFTER); assert.ok(c, `a result at ${r.place} on day ${r.day} has its call`);
    assert.ok(r.day > c.day);
  }
  assert.ok(results.length >= 1, 'and the called ones are run');
});

test('ST9: a knight killed in the lists dies where the lists were run', () => {
  let found = null;
  for (const seed of Array.from({ length: 500 }, (_, i) => i + 1)) {
    const s = world('stark', 5); s.meta.rngState = seedState(seed); s.meta.clock = { turn: 1, from: today(s), to: today(s) };
    // the guests' lords are at the hall too, so that there are knights to lose
    withRng(s, () => order(s)); goTo(s, today(s) + LISTS_AFTER); withRng(s, () => listsTick(s));
    const d = kinds(s, 'death')[0]; if (d) { found = { s, d }; break; }
  }
  assert.ok(found, 'a knight dies in the lists in one tourney of five hundred');
  const { s, d } = found;
  assert.equal(d.place, 'stark', 'the death is told at Winterfell, not at the dead man\'s post'); assert.match(d.data.cause, /in the lists/);
  assert.equal(s.characters[d.actors[0]].alive, false);
  assert.ok(kinds(s, 'tourney_result').length === 1);
});

test('an old save (no lists, a tourney held in its day) plays on: nothing is run, nothing breaks', () => {
  const s = world(); s.plots = { tourneys: { stark: today(s) - 5 } }; s.meta.clock = { turn: 1, from: today(s), to: today(s) };
  withRng(s, () => listsTick(s)); assert.deepEqual(s.facts, []);
  assert.deepEqual(tourneyNow(s), ['stark'], 'a tourney the story told as held still draws its guests for the moon that follows');
});
