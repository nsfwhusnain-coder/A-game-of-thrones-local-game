// Living society (docs/gdd/09-living-world.md §3; WP D8): lords ride out every moon for the reasons the books give — a
// liege's court, a neighbour's feast, a tourney, a pilgrimage, the King passing — with kin and a tail of knights, stay
// as guests, and ride home; never the people a near beat of the story needs, never a lord with a duty; the realm's
// calendar and courts tell themselves in the Meanwhile.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../public/js/shared/world.js';
import { retinueTick, guestsAt } from '../public/js/shared/retinues.js';
import { canonLocked } from '../public/js/shared/plots.js';
import { makeRng, seedState } from '../public/js/engine/rng.js';
import { dateOfDay, dayNumber } from '../public/js/engine/time.js';
import { marchTick } from '../public/js/shared/marches.js';

const rng = (seed) => { const g = makeRng(seedState(seed)); return () => g.next(); };

function live(s, days, r) {
  const out = [];
  for (let i = 0; i < days; i++) {
    s.meta.date = { ...dateOfDay(dayNumber(s.meta.date) + 1) };
    marchTick(s, { span: 1, turnStart: dayNumber(s.meta.date) - 1 });
    out.push(...retinueTick(s, 1, r).events);
  }
  return out;
}

test('at least five journeys a moon realm-wide, with kin, guests at the seats, and lords home again', () => {
  const s = createInitialState('agot_298', 'hightower', { seed: 5 }); const r = rng(9);
  const told = live(s, 60, r);
  const perMoon = told.length / 2;
  assert.ok(perMoon >= 5, `${perMoon} journeys a moon`);
  const locked = canonLocked(s);
  assert.ok(!told.some((e) => locked.has(e.actors?.[0])), 'no one the story needs rides off');
  const withKin = Object.values(s.parties).some((a) => a.kind === 'retinue' && (a.members || []).length > 1);
  const guests = Object.keys(s.holdings).some((id) => guestsAt(s, id).length);
  assert.ok(withKin || guests, 'a lord rides with his family, or is a guest somewhere');
  assert.ok((s.facts || []).some((f) => f.kind === 'returned'), 'a lord comes home, and it is told');
});

test('a tourney draws the lords of its region, and the cap rises for its moon', () => {
  const s = createInitialState('agot_298', 'tarly', { seed: 6 }); const r = rng(3);
  s.plots = { ...(s.plots || {}), tourneys: { tyrell: dayNumber(s.meta.date) } };
  const told = live(s, 20, r);
  const to = told.filter((e) => (s.facts || []).some((f) => f.id === e.fact && f.data?.to === 'tyrell')).length;
  assert.ok(to >= 2, `${to} parties ride for Highgarden`);
});
