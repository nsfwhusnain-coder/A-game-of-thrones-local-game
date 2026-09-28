// The state of war (docs/gdd/07-military.md §11; WP C8): goals, the score, wars gone cold, and peace — sued for by the
// lord, weighed by the score and the answering lord's nature, and offered by the losing side when the score is lopsided.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, applyChanges } from '../public/js/shared/world.js';
import { goalOf, warTick, weighPeace, makePeace, sideOf } from '../public/js/engine/politics/war.js';
import { perform } from '../public/js/engine/actions/registry.js';
import { applyPetitionFx } from '../public/js/shared/petitions.js';
import { emit } from '../public/js/engine/facts/log.js';
import { makeRng, seedState } from '../public/js/engine/rng.js';
import { dateOfDay, dayNumber } from '../public/js/engine/time.js';

const world = (house = 'stark') => createInitialState('agot_298', house, { seed: 5 });
const rng = (seed) => { const g = makeRng(seedState(seed)); return () => g.next(); };
const days = (s, n, r = rng(1)) => { for (let i = 0; i < n; i++) { s.meta.date = { ...s.meta.date, ...dateOfDay(dayNumber(s.meta.date) + 1) }; warTick(s, r); } };
const war = (s, a, d, extra = {}) => { applyChanges(s, [{ op: 'war', status: 'start', name: 'The war', attackers: a, defenders: d, ...extra }], { source: 'test' }); return s.wars.at(-1); };
const on = (s, kind, f) => { const today = dayNumber(s.meta.date); emit(s, kind, { ...f }); s.facts.at(-1).day = today; };

test('a war has a goal: the words it was declared with', () => {
  assert.equal(goalOf('to free Lord Eddard'), 'free_prisoner');
  assert.equal(goalOf('the Iron Throne is mine by right'), 'claim_throne');
  assert.equal(goalOf('the North will be free of the south'), 'independence');
  assert.equal(goalOf('for the lands along the Red Fork'), 'conquest');
  const s = world('stark'); perform(s, 'declare_war', { params: { house: 'lannister', reason: 'to free Lord Eddard' } });
  assert.equal(s.wars.at(-1).goal, 'free_prisoner'); assert.equal(s.wars.at(-1).score, 0);
});

test('the score: battles won, castles taken, lords captured and slain', () => {
  const s = world('tully'); const w = war(s, ['lannister'], ['stark']);
  applyChanges(s, [{ op: 'army_create', id: 'lh', owner: 'lannister', name: 'L', at: 'lannister', men: 100 }]);
  on(s, 'battle', { houses: ['lannister', 'stark'], data: { winner: 'lh', loser: 'x' } });
  warTick(s, rng(1)); assert.equal(w.score, 10, 'a battle won by the attackers');
  on(s, 'holding_fell', { houses: ['lannister', 'stark'], data: { holding: 'stark', by: 'lannister' } });
  warTick(s, rng(1)); assert.equal(w.score, 25, 'and Winterfell taken');
  on(s, 'captured_in_battle', { actors: ['robb_stark'], houses: ['stark'] });
  warTick(s, rng(1)); assert.equal(w.score, 35, 'the heir captured');
  assert.equal(sideOf(s, w, 'bolton'), 'D', 'a sworn house fights with its realm');
});

test('six moons without a blow, and the war goes cold', () => {
  const s = world('tully'); const w = war(s, ['lannister'], ['stark']);
  days(s, 181);
  assert.ok(w.cold); assert.ok(s.facts.some((f) => f.kind === 'cold_war'));
});

test('sue for peace: a white peace taken by an enemy not winning; a demand only of one beaten', () => {
  const s = world('stark'); const w = war(s, ['stark'], ['lannister']);
  let white = 0, demand = 0;
  for (let i = 1; i <= 100; i++) { if (weighPeace(s, w, 'D', 'white_peace', rng(i)).accepted) white++; if (weighPeace(s, w, 'D', 'demand', rng(i)).accepted) demand++; }
  assert.ok(white > 15 && demand <= 5, `even: white ${white}, demand ${demand}`);
  w.score = 80; let beaten = 0; for (let i = 1; i <= 100; i++) if (weighPeace(s, w, 'D', 'demand', rng(i)).accepted) beaten++;
  assert.ok(beaten >= 40, `beaten, the Lannisters yield to a demand in ${beaten} of 100`);
});

test('the peace kept: the conceder pays and frees its captives; the war ends', () => {
  const s = world('stark'); const w = war(s, ['stark'], ['lannister']);
  applyChanges(s, [{ op: 'character', id: 'jaime_lannister', status: 'imprisoned', loc: 'stark' }, { op: 'character', id: 'eddard_stark', status: 'imprisoned', loc: 'lannister' }]);
  s.houses.lannister.figures.income.v = 30000; const g0 = s.houses.stark.figures.treasury.v;
  const r = makePeace(s, w, 'concede', { conceder: 'D' });
  assert.equal(w.status, 'ended'); assert.equal(r.tribute, 90000);
  assert.equal(s.houses.stark.figures.treasury.v, g0 + 90000);
  assert.ok(!/imprisoned/.test(s.characters.eddard_stark.status || ''), 'Lord Eddard comes home');
  assert.match(s.characters.jaime_lannister.status, /imprisoned/, 'the victor keeps his captive');
  assert.ok(s.facts.some((f) => f.kind === 'peace_made'));
});

test('a lopsided war: the beaten side sues for peace; when the lord is the victor, it is his to accept', () => {
  const s = world('tully'); const w = war(s, ['lannister'], ['stark']); w.score = 70;
  let ended = false;
  for (let d = 0; d < 120 && !ended; d++) { days(s, 1); ended = w.status === 'ended'; }
  assert.ok(ended, 'the Starks concede and the Lannisters take it');
  assert.ok(s.facts.some((f) => f.kind === 'peace_sued'));
  const t = world('stark'); const v = war(t, ['stark'], ['lannister']); v.score = 60;
  days(t, 45);
  const m = (t.decisions || []).find((d) => d.id.startsWith(`peace_${v.id}`) && d.status === 'pending');
  assert.ok(m, 'House Lannister sues for peace: a matter for Lord Eddard');
  applyPetitionFx(t, m.options[0].fx);
  assert.equal(v.status, 'ended');
});
