// Supply (docs/gdd/07-military.md §6; WP C3): rations in man-days, friendly stores, foraging and the waste it leaves,
// the second passage through a stripped province, hunger, camp fever, and the season's pace. No model: the engine's
// own rules, a day at a time, on the scenario's world.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, applyChanges } from '../public/js/shared/world.js';
import { supplyTick, supplyOf, supplyText, trainOf, capacityOf, forageYield, fedByRations } from '../public/js/engine/military/supply.js';
import { paceOf } from '../public/js/engine/movement.js';
import { foldInto } from '../public/js/engine/actions/military.js';
import { settle } from '../public/js/engine/parties.js';
import { dateOfDay, dayNumber } from '../public/js/engine/time.js';
import { validate } from '../public/js/engine/state/validate.js';
import { SUPPLY } from '../public/data/balance.js';

const world = (house = 'lannister') => createInitialState('agot_298', house, { seed: 7 });
const days = (s, n) => {
  const out = [];
  for (let i = 0; i < n; i++) { s.meta.date = { ...s.meta.date, ...dateOfDay(dayNumber(s.meta.date) + 1) }; out.push(...supplyTick(s, 1).events); }
  return out;
};
const host = (s, id, owner, where, men, extra = {}) => {
  applyChanges(s, [{ op: 'army_create', id, owner, name: `The host ${id}`, at: where, men }], { source: 'test' });
  const p = s.parties[id]; Object.assign(p, extra); settle(s, p); return p;
};
const war = (s) => applyChanges(s, [{ op: 'war', status: 'start', name: 'W', attackers: ['lannister'], defenders: ['tully'] }], { source: 'test' });
const factsOf = (s, kind) => (s.facts || []).filter((f) => f.kind === kind);

test('a host carries its bread: seven days on the men\'s backs, the rest in a wagon to every forty men', () => {
  const s = world(); const p = host(s, 'h', 'lannister', 'lannister', 4000);
  const t = trainOf(s, p);
  assert.equal(t.wagons, 100);
  assert.equal(t.capacity, 4000 * SUPPLY.carried + 100 * SUPPLY.wagonHolds, 'men × 7 + wagons × 600');
  assert.equal(p.rations, t.capacity, 'a host raised at home sets out full');
  assert.ok(capacityOf({ men: 100, wagons: 1000 }) <= 100 * SUPPLY.maxDays, 'no train carries more than forty days');
});

test('at home a host is fed from its lord\'s granaries and its wagons filled; the stores fall', () => {
  const s = world(); const p = host(s, 'h', 'lannister', 'lannister', 12000);
  p.rations = 0; const food0 = s.houses.lannister.figures.food.v;
  days(s, 1);
  assert.equal(supplyOf(s, p).word, 'fed'); assert.equal(p.supply, 100, 'fed from the stores the first day');
  assert.ok(p.rations > 0 && p.rations < capacityOf(p), 'a castle loads a few days\' bread a day, not the whole train');
  days(s, 13);
  assert.ok(p.rations >= capacityOf(p) * 0.97, 'in a fortnight the wagons are full');
  assert.ok(s.houses.lannister.figures.food.v < food0, 'the granaries pay for it');
  assert.match(supplyText(s, p), /days of rations, fed from friendly stores/);
});

test('in an enemy\'s country the wagons empty a day at a time', () => {
  const s = world(); war(s);
  const p = host(s, 'h', 'lannister', null, 10000, { pos: [...s.holdings.darry.pos] }); settle(s, p);
  p.rations = 20 * 10000; // twenty days, more than enough not to forage
  const d0 = supplyOf(s, p).days; days(s, 3);
  assert.equal(Math.round(d0 - supplyOf(s, p).days), 3, 'three days eaten');
  assert.equal(s.holdings.darry.devastation || 0, 0, 'no forager has gone out');
  assert.equal(supplyOf(s, p).word, 'fed');
});

test('the second passage: a host that strips a province and marches back through it starves', () => {
  const s = world(); war(s);
  const p = host(s, 'h', 'lannister', null, 20000, { pos: [...s.holdings.darry.pos] }); settle(s, p);
  p.rations = 0; const men0 = p.men;
  // the first passage: the foragers feed the host from the lands about Darry — and leave them bare
  days(s, 3);
  assert.ok(p.foraging && !p.hungry, 'fresh country feeds a host');
  days(s, 5);
  assert.ok(s.holdings.darry.devastation >= SUPPLY.stripped, `Darry's lands are stripped (${s.holdings.darry.devastation})`);
  assert.equal(forageYield(s, s.holdings.darry, p.men), 0, 'a stripped province yields nothing');
  assert.equal(factsOf(s, 'land_stripped').length, 1, 'the realm hears the land was stripped');
  assert.ok(s.holdings.darry.unrest > 20, 'the smallfolk are angry');
  // on to Blackwood's country, and back the way it came with empty wagons
  p.pos = [...s.holdings.blackwood.pos]; days(s, 2);
  assert.ok(!p.hungry, 'Blackwood\'s country feeds it');
  p.pos = [...s.holdings.darry.pos]; p.rations = 0; const told = factsOf(s, 'host_hungry').length;
  const ev = days(s, 6);
  assert.ok(p.hungry, 'the host starves');
  assert.equal(supplyOf(s, p).word, 'starving'); assert.equal(p.supply, 25, 'a starving host fights at 0.7');
  assert.ok(p.men < men0 * 0.95, `men die and desert (${men0} → ${p.men})`);
  assert.ok(p.morale < 60, 'and lose heart');
  assert.equal(factsOf(s, 'host_hungry').length, told + 1, 'hunger is told once, when it begins');
  assert.ok(ev.some((e) => /goes hungry/.test(e.title)), 'the player reads it');
  assert.deepEqual(validate(s).filter((x) => /rations|devastated/.test(x)), []);
});

test('the land heals when the foragers are gone — slowly, and not at all in winter', () => {
  const s = world(); s.holdings.darry.devastation = 50;
  days(s, 10);
  assert.ok(s.holdings.darry.devastation < 50 && s.holdings.darry.devastation > 40, `summer mends (${s.holdings.darry.devastation})`);
  s.world.season = 'winter'; const d = s.holdings.darry.devastation; days(s, 10);
  assert.equal(s.holdings.darry.devastation, d, 'nothing grows in winter');
});

test('a camp that sits still sickens: the flux, told once a moon with the moon\'s sick (WD5: it was told every week of a camp that sat)', () => {
  const s = world(); const p = host(s, 'h', 'lannister', 'lannister', 20000);
  days(s, 35);
  assert.ok(p.men < 20000 && p.men > 19000, `about 2% a moon in summer (${p.men})`);
  const told = factsOf(s, 'camp_fever'); assert.ok(told.length >= 1 && told.length <= 2, `the fever is told once a moon (${told.length} in five weeks)`);
  assert.ok(Number(told[0].data?.men ?? told[0].text.match(/: ([\d,]+) men/)?.[1]?.replace(/,/g, '')) >= 100, 'with what the moon cost, not a week\'s handful');
  const w = world(); w.world.season = 'winter'; const q = host(w, 'h', 'lannister', 'lannister', 20000); days(w, 35);
  assert.ok(q.men < p.men, 'winter is worse');
});

test('winter slows a host, and the North\'s winter most of all', () => {
  const s = world('stark'); const p = host(s, 'h', 'stark', 'stark', 5000); const q = host(s, 'k', 'lannister', 'lannister', 5000);
  const summer = paceOf(s, p);
  s.world.season = 'autumn'; assert.equal(paceOf(s, p), summer * SUPPLY.season.autumn);
  s.world.season = 'winter';
  assert.equal(Math.round(paceOf(s, p) * 100), Math.round(summer * SUPPLY.season.winterNorth * 100), 'the North');
  assert.equal(Math.round(paceOf(s, q) * 100), Math.round(summer * SUPPLY.season.winter * 100), 'the south');
  assert.ok(paceOf(s, { kind: 'rider' }) > paceOf(s, p), 'a rider still rides');
});

test('the wagons travel with the men: two hosts made one carry both trains', () => {
  const s = world(); const a = host(s, 'a', 'lannister', 'lannister', 6000); const b = host(s, 'b', 'lannister', 'lannister', 4000);
  trainOf(s, a); trainOf(s, b); a.rations = 1000; b.rations = 2000; const w = a.wagons + b.wagons;
  foldInto(s, a, b);
  assert.equal(a.men, 10000); assert.equal(a.wagons, w); assert.equal(a.rations, 3000, 'no bread made or lost in the joining');
  trainOf(s, a); assert.equal(a.rations, 3000, 'and none conjured the next day');
});

test('the free folk, the khalasar and the sellswords live off the land: untouched', () => {
  const s = world(); const ff = s.parties.free_folk_host; const men = ff.men;
  assert.equal(fedByRations(s, ff), false);
  days(s, 10);
  assert.equal(ff.men, men); assert.equal(ff.rations, undefined);
});

test('a lord feeds his liege\'s host gladly; another lord\'s host he counts against it', () => {
  const s = world(); const p = host(s, 'h', 'lannister', 'crakehall', 8000); p.rations = 0;
  const k = ['crakehall', 'lannister'].sort().join('|'); const r0 = s.relations[k]?.v ?? 0;
  days(s, 14);
  assert.equal(s.relations[k]?.v ?? 0, r0, 'Crakehall is Lannister\'s own');
  const t = world(); t.houses.tyrell && (t.relations[['crakehall', 'tyrell'].sort().join('|')] = { v: 0 });
  const q = host(t, 'q', 'tyrell', null, 8000, { pos: [...t.holdings.crakehall.pos] }); settle(t, q);
  t.wars.push({ id: 'w', name: 'W', status: 'active', attackers: ['lannister', 'tyrell'], defenders: ['tully'] });
  q.rations = 0; days(t, 14);
  assert.ok(q.resupplied, 'an ally is fed');
  assert.ok((t.relations[['crakehall', 'tyrell'].sort().join('|')]?.v ?? 0) < 0, 'at a price in goodwill');
});

test('a lord leads a hungry host home to his granaries', async () => {
  const { treeChoice } = await import('../public/js/engine/minds/houseways.js');
  const s = world('stark'); war(s);
  const p = host(s, 'h', 'lannister', null, 9000, { pos: [...s.holdings.darry.pos] }); settle(s, p);
  p.rations = 0; s.holdings.darry.devastation = 90; supplyTick(s, 1);
  assert.equal(supplyOf(s, p).word, 'starving');
  const pick = treeChoice(s, s.houses.lannister.lord);
  assert.equal(pick.rule, 'bread', `the pressing thing is bread (${pick.rule}: ${pick.why})`);
  assert.equal(pick.verb, 'march_host'); assert.equal(pick.params.army, 'h');
  assert.equal(s.holdings[pick.params.to].owner, 'lannister', 'home, to his own lands');
});
