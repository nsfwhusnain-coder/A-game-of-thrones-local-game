// Engine foundations (WP B1): the calendar, ids from the save's counter, and the alias tables every model call and the
// order parser use to turn names into ids (docs/gdd/04-ai-system.md §3.1).
import test from 'node:test';
import assert from 'node:assert/strict';
import { dayNumber, dateOfDay, addDays, longDate, spanText, dateStr } from '../public/js/engine/time.js';
import { nextId, placeAliases, personAliases, houseAliases, prefixConflicts, resolveName } from '../public/js/engine/ids.js';
import { createInitialState } from '../public/js/shared/world.js';
import { DIFFICULTY, difficultyOf } from '../public/data/balance.js';

test('the calendar: day numbers and dates are one reckoning', () => {
  for (const d of [{ year: 298, month: 8, day: 1 }, { year: 298, month: 12, day: 30 }, { year: 299, month: 1, day: 1 }, { year: 300, month: 6, day: 15 }]) {
    assert.deepEqual(dateOfDay(dayNumber(d)), d);
  }
  assert.deepEqual(addDays({ year: 298, month: 12, day: 25 }, 10), { year: 299, month: 1, day: 5 });
  assert.equal(dayNumber({ year: 298, month: 9, day: 1 }) - dayNumber({ year: 298, month: 8, day: 1 }), 30);
  assert.equal(longDate({ year: 298, month: 9, day: 12 }), 'the 12th day of the 9th moon, 298 AC');
  assert.equal(longDate({ year: 298, month: 9, day: 1 }), 'the 1st day of the 9th moon, 298 AC');
  assert.equal(longDate({ year: 298, month: 9, day: 23 }), 'the 23rd day of the 9th moon, 298 AC');
  assert.equal(spanText({ year: 298, month: 9, day: 3 }, { year: 298, month: 9, day: 9 }), 'from the 3rd to the 9th day of the 9th moon, 298 AC');
  assert.equal(dateStr({ year: 298, month: 8, day: 1 }), '1 8th moon, 298 AC');
});

test('new ids come from the save\'s counter, not the clock', () => {
  const s = { meta: { turn: 4 } };
  assert.equal(nextId(s, 'r'), 'r4_1'); assert.equal(nextId(s, 'o'), 'o4_2');
  const t = { meta: { turn: 4 } }; nextId(t); assert.equal(nextId(t, 'r'), 'r4_2', 'the same history names things the same way');
});

test('every name people use for a place, a person or a house leads to its id', () => {
  const s = createInitialState('agot_298', 'stark', { seed: 1 });
  const P = placeAliases(s), C = personAliases(s), H = houseAliases(s);
  // the bench's pitfall: "the Wall" must be a name of its own, not the start of "the Twins"
  assert.equal(P.get('the_wall'), 'nights_watch'); assert.equal(P.get('the_twins'), 'frey'); assert.equal(P.get('twins'), 'frey');
  assert.equal(P.get('winterfell'), 'stark'); assert.equal(P.get('kings_landing'), 'baratheon'); assert.equal(P.get('the_eyrie'), 'arryn');
  assert.equal(C.get('ned'), 'eddard_stark'); assert.equal(C.get('the_greatjon'), 'greatjon_umber'); assert.equal(C.get('the_king'), 'robert_baratheon');
  assert.equal(C.get('the'), undefined, 'an article is no one\'s name');
  assert.equal(H.get('the_freys'), 'frey'); assert.equal(H.get('house_lannister'), 'lannister');
  assert.equal(resolveName(s, 'place', 'The Wall'), 'nights_watch');
  // the prefix rule finds names that would let a grammar stop early on the wrong person
  const conflicts = prefixConflicts(C);
  assert.ok(conflicts.some(([a, b]) => a === 'jon' && b.startsWith('jonos')), 'Jon is a prefix of Jonos');
  // an office's name follows its holder
  s.characters.robert_baratheon.alive = false; s.houses.baratheon.lord = 'joffrey_baratheon';
  assert.equal(personAliases(s).get('the_king'), 'joffrey_baratheon');
});

test('difficulty is one table, and normal changes nothing', () => {
  assert.deepEqual(Object.keys(DIFFICULTY), ['very_easy', 'easy', 'normal', 'hard', 'impossible']);
  const n = difficultyOf({ meta: {} });
  assert.equal(n.odds, 1); assert.equal(n.income, 1); assert.equal(n.temper, 0);
  assert.equal(difficultyOf({ meta: { settings: { difficulty: 'hard' } } }).odds, 0.92);
});
