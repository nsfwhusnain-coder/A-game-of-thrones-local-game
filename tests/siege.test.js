// Sieges v2 (docs/gdd/07-military.md §8; WP C5): the fortress table, the castle's stores (and the sea or the high road
// that feed some of them), terms weighed by the castellan's nature, the storm that fails often, treachery, relief, and
// the camps before Riverrun. The acceptance: Storm's End cannot be starved without a fleet; a craven castellan takes terms.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, applyChanges } from '../public/js/shared/world.js';
import { siegeTick, fortOf, stormOdds, weighTerms, yieldOn, starving, castellanOf, rulesOf, storesOf } from '../public/js/engine/military/siege.js';
import { resolveWarfare } from '../public/js/shared/battles.js';
import { perform } from '../public/js/engine/actions/registry.js';
import { temperament } from '../public/js/shared/temperament.js';
import { settle, ref } from '../public/js/engine/parties.js';
import { makeRng, seedState } from '../public/js/engine/rng.js';
import { dateOfDay, dayNumber } from '../public/js/engine/time.js';

const world = (house = 'stark') => createInitialState('agot_298', house, { seed: 3 });
const war = (s, a, d) => applyChanges(s, [{ op: 'war', status: 'start', name: 'W', attackers: a, defenders: d }], { source: 'test' });
const host = (s, id, owner, at, men, extra = {}) => {
  applyChanges(s, [{ op: 'army_create', id, owner, name: extra.name || `The host ${id}`, at, men, ...(extra.kind ? { type: extra.kind } : {}) }], { source: 'test' });
  const p = s.parties[id]; Object.assign(p, extra); settle(s, p); return p;
};
const rng = (seed) => { const g = makeRng(seedState(seed)); return () => g.next(); };
const days = (s, n, r = rng(1)) => { for (let i = 0; i < n; i++) { s.meta.date = { ...s.meta.date, ...dateOfDay(dayNumber(s.meta.date) + 1) }; resolveWarfare(s, 1, { r }); } };
const clear = (s, ...owners) => { for (const p of Object.values(s.parties)) if (owners.includes(p.owner) && !['sg', 'fleet'].includes(p.id)) delete s.parties[p.id]; };

test('the fortress table: the great castles\' walls and rules', () => {
  const s = world();
  assert.equal(fortOf(s, s.holdings.baratheon_se), 6); assert.equal(fortOf(s, s.holdings.tully), 5);
  assert.ok(rulesOf(s.holdings.baratheon_se).noStorm && rulesOf(s.holdings.baratheon_se).needsSea);
  s.holdings.whent.garrison = 400; assert.equal(fortOf(s, s.holdings.whent), 2, 'Harrenhal is too great to hold with four hundred');
  s.holdings.whent.garrison = 2000; assert.equal(fortOf(s, s.holdings.whent), 4);
  assert.equal(fortOf(s, s.holdings.bolton), s.holdings.bolton.fort, 'a castle not in the table keeps its own walls');
});

test("Storm's End cannot be starved without a fleet, nor stormed; with ships before it, it starves", () => {
  const s = world(); war(s, ['lannister'], ['baratheon_se']); clear(s, 'baratheon_se', 'baratheon', 'tyrell');
  const sg = host(s, 'sg', 'lannister', 'baratheon_se', 20000);
  days(s, 3);
  const h = s.holdings.baratheon_se; assert.equal(h.status, 'besieged');
  const stores0 = h.siege.stores;
  assert.ok(s.facts.some((f) => f.kind === 'siege_begun'));
  assert.equal(starving(s, h, 'lannister'), false);
  assert.equal(stormOdds(s, h, [sg]), 0, 'no storm carries it');
  sg.storm = h.id; days(s, 90);
  assert.equal(h.siege?.stores, stores0, 'three moons, and the stores have not fallen: the sea feeds it');
  assert.equal(h.owner, 'baratheon_se'); assert.ok(!s.facts.some((f) => f.kind === 'storm_assault'), 'and it was never stormed');
  // a Lannister fleet before it: now it eats its stores
  host(s, 'fleet', 'lannister', null, 3000, { kind: 'fleet', pos: [h.pos[0] + 10, h.pos[1]], ships: 30 });
  s.parties.fleet.kind = 'fleet'; s.parties.fleet.pos = [h.pos[0] + 10, h.pos[1]]; delete s.parties.fleet.march;
  assert.equal(starving(s, h, 'lannister'), true);
  days(s, 30);
  assert.ok(!h.siege || h.siege.stores < stores0, 'blockaded, the stores fall');
});

test('the Eyrie is fed by the high road until winter', () => {
  const s = world(); const h = s.holdings.arryn;
  assert.equal(starving(s, h, 'lannister'), false);
  s.world.season = 'winter'; assert.equal(starving(s, h, 'lannister'), true);
});

test('a craven castellan takes terms; a brave one holds', () => {
  const s = world(); war(s, ['lannister'], ['tully']);
  const h = s.holdings.butterwell; const c = castellanOf(s, h);
  assert.ok(temperament(c).courage < 0.35, `${c.name} is no hero`);
  const sg = host(s, 'sg', 'lannister', 'butterwell', 12000); h.siege = { by: 'lannister', days: 14, stores: storesOf(s, h) };
  let took = 0; for (let i = 1; i <= 100; i++) if (weighTerms(s, h, [sg], 'march_out_with_arms', rng(i)).accepted) took++;
  assert.ok(took >= 70, `Butterwell yields on terms in ${took} of 100`);
  const t = world(); war(t, ['lannister'], ['stark']);
  const w = t.holdings.wull; const bw = host(t, 'sg', 'lannister', 'wull', 12000); w.siege = { by: 'lannister', days: 14, stores: storesOf(t, w) };
  let held = 0; for (let i = 1; i <= 100; i++) if (!weighTerms(t, w, [bw], 'unconditional', rng(i)).accepted) held++;
  assert.ok(held >= 70, `Wull of the mountains holds against unconditional terms in ${held} of 100`);
  // hungry, he thinks again
  w.siege.stores = 0.2; let later = 0; for (let i = 1; i <= 100; i++) if (weighTerms(t, w, [bw], 'march_out_with_arms', rng(i)).accepted) later++;
  assert.ok(later > 100 - held, 'hunger changes minds');
});

test('the terms, kept: march out, swear and keep the castle, hostages, or yield unconditionally', () => {
  const s = world(); war(s, ['lannister'], ['tully']);
  const sg = host(s, 'sg', 'lannister', 'butterwell', 12000); const h = s.holdings.butterwell; h.siege = { by: 'lannister', days: 14, stores: 3 };
  let r = yieldOn(s, h, sg, 'yield_and_swear'); applyChanges(s, r.changes, { source: 'test' });
  assert.equal(h.owner, 'butterwell', 'a lord who swears keeps his castle'); assert.equal(s.houses.butterwell.liege, 'lannister');
  assert.ok(!s.wars.some((w) => [...w.attackers, ...w.defenders].includes('butterwell')), 'and is out of the war');
  const t = world(); war(t, ['lannister'], ['tully']);
  const tg = host(t, 'sg', 'lannister', 'butterwell', 12000); const th = t.holdings.butterwell; th.siege = { by: 'lannister', days: 14, stores: 3 };
  r = yieldOn(t, th, tg, 'march_out_with_arms'); applyChanges(t, r.changes, { source: 'test' });
  assert.equal(th.owner, 'lannister'); assert.equal(th.status, 'occupied');
  const u = world(); war(u, ['lannister'], ['tully']);
  const ug = host(u, 'sg', 'lannister', 'butterwell', 12000); const uh = u.holdings.butterwell; uh.siege = { by: 'lannister', days: 14, stores: 3 };
  const c = castellanOf(u, uh); r = yieldOn(u, uh, ug, 'unconditional'); applyChanges(u, r.changes, { source: 'test' });
  assert.equal(u.characters[c.id].loc, ref('sg')); assert.match(u.characters[c.id].status, /imprisoned/);
});

test('offer terms and storm, as the lord orders them', () => {
  const s = world('lannister'); war(s, ['lannister'], ['tully']);
  const sg = host(s, 'sg', 'lannister', 'butterwell', 12000); sg.besieging = 'butterwell'; s.holdings.butterwell.siege = { by: 'lannister', days: 14, stores: 1 };
  const r = perform(s, 'offer_terms', { params: { holding: 'butterwell', terms: 'march_out_with_arms' } });
  assert.ok(r.ok, JSON.stringify(r.receipt));
  assert.ok(s.facts.some((f) => f.kind === 'terms_offered'));
  const again = perform(s, 'storm', { params: { holding: 'lannister' } }); assert.equal(again.ok, false);
});

test('a storm fails often and costs dear; a small castle before a great host is carried', () => {
  const s = world(); war(s, ['lannister'], ['tully']); clear(s, 'tully', 'butterwell');
  const h = s.holdings.butterwell; h.garrison = 60; const sg = host(s, 'sg', 'lannister', 'butterwell', 15000);
  sg.storm = 'butterwell'; days(s, 2);
  assert.equal(h.owner, 'lannister', 'sixty men cannot hold against fifteen thousand');
  const t = world(); war(t, ['lannister'], ['tully']); clear(t, 'tully');
  const r = t.holdings.tully; r.garrison = 2000; const tg = host(t, 'sg', 'lannister', 'tully', 12000);
  const men = tg.men; tg.storm = 'tully'; days(t, 2);
  assert.equal(r.owner, 'tully', 'Riverrun, held by two thousand, throws back twelve');
  assert.ok(tg.men <= men * 0.72, `the stormers lose heavily (${men} → ${tg.men})`);
});

test('treachery: a castellan who took the besiegers\' gold opens a postern', () => {
  const s = world(); war(s, ['lannister'], ['tully']); clear(s, 'tully', 'butterwell');
  const h = s.holdings.butterwell; host(s, 'sg', 'lannister', 'butterwell', 5000);
  castellanOf(s, h).bought = { by: 'lannister', aim: 'open the gates', day: 0 };
  days(s, 5);
  assert.equal(h.owner, 'lannister'); assert.ok(s.facts.some((f) => f.kind === 'holding_fell' && f.data.how === 'betrayed'));
});

test('relief: the besiegers hear of it, and a weak siege is raised before it comes', () => {
  const s = world(); war(s, ['lannister'], ['tully']); clear(s, 'tully', 'butterwell', 'mallister', 'frey');
  s.holdings.butterwell.garrison = 800; // too many to storm before the relief comes
  host(s, 'sg', 'lannister', 'butterwell', 3000);
  days(s, 2);
  const near = [s.holdings.butterwell.pos[0] + 12, s.holdings.butterwell.pos[1]];
  const relief = host(s, 'rl', 'tully', null, 15000, { pos: near }); relief.pos = near; relief.at = null; settle(s, relief);
  days(s, 1);
  assert.ok(s.facts.some((f) => f.kind === 'relief_near'), 'scouts bring word');
  assert.ok(s.facts.some((f) => f.kind === 'siege_lifted'), 'and the besiegers break camp');
  assert.ok(s.parties.sg.march, 'marching away');
});

test('before Riverrun the besiegers lie divided in their camps: a relieving host meets them at ×0.75', async () => {
  const { powerOf } = await import('../public/js/engine/military/battle.js');
  const s = world(); war(s, ['lannister'], ['tully', 'stark']); clear(s, 'tully', 'stark');
  const sg = host(s, 'sg', 'lannister', 'tully', 12000); days(s, 2); assert.equal(sg.besieging, 'tully');
  const wolf = host(s, 'wolf', 'stark', null, 12000, { pos: [...sg.pos], standing: 'always' }); wolf.pos = [...sg.pos]; wolf.at = null; settle(s, wolf);
  days(s, 1);
  const b = s.facts.find((f) => f.kind === 'battle'); assert.ok(b, 'they fight');
  assert.ok(powerOf(s, sg, { role: 'defender', divided: true }).parts.divided === 0.75);
});
