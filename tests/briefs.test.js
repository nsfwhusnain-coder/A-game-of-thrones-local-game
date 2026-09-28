// House openings (docs/gdd/10-narrative-events.md §5; WP D5): every playable house has a brief — its situation, strengths,
// weaknesses, aims, levers and what its council has heard — the §5 houses by hand, the rest from their region and rank;
// and what the council has heard is news of the 8th moon of 298, never what is to come.
import test from 'node:test';
import assert from 'node:assert/strict';
import { HOUSES } from '../public/data/houses.js';
import { BRIEFS, briefFor } from '../public/data/briefs.js';
import { createInitialState } from '../public/js/shared/world.js';

const SECTION5 = ['stark', 'lannister', 'baratheon', 'baratheon_ds', 'baratheon_se', 'tyrell', 'martell', 'arryn', 'tully', 'greyjoy', 'frey', 'bolton', 'manderly', 'nights_watch', 'targaryen', 'mormont', 'karstark', 'umber', 'blackwood', 'bracken', 'tarly', 'redwyne', 'hightower', 'florent', 'velaryon', 'dayne', 'free_folk'];
const holes = (t) => /undefined|null|NaN|\$\{|\[object|House House/.test(String(t));

test('the §5 houses have hand-written openings', () => {
  for (const id of SECTION5) assert.ok(BRIEFS[id], `${id} is written by hand`);
});

test('every playable house has a whole brief, in its own words', () => {
  const s = createInitialState('agot_298', 'stark', { seed: 1 });
  for (const h of HOUSES) {
    const b = briefFor(s.houses[h.id] || h, s);
    assert.ok(b.situation && !holes(b.situation) && b.situation.split(/[.!?]\s/).length >= 2, `${h.id}: a situation of more than one sentence — ${b.situation}`);
    for (const k of ['strengths', 'weaknesses', 'goals', 'levers', 'hints']) {
      assert.ok(Array.isArray(b[k]) && b[k].length >= 1 && b[k].every((x) => x && !holes(x)), `${h.id}: ${k}`);
    }
    assert.ok(b.strengths.length >= 2 && b.weaknesses.length >= 2, `${h.id}: at least two strengths and weaknesses`);
  }
});

test('what the council has heard is news, never what is to come', () => {
  const s = createInitialState('agot_298', 'stark', { seed: 1 });
  const SPOILER = /\bwill\b|\bshall\b|red wedding|wedding feast|incest|bastards born|not (the )?king'?s|poison|murdered|beheaded|dragons? (hatch|live)|the others come|dies\b|will die/i;
  for (const h of HOUSES) for (const x of briefFor(s.houses[h.id] || h, s).hints) assert.doesNotMatch(x, SPOILER, `${h.id}: "${x}"`);
});
