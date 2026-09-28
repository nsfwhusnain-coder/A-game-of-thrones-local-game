// The sea (docs/gdd/07-military.md §9; WP C6): ships by kind, hosts aboard and ashore, storms, blockades, raids and sea
// fights. The acceptance: the ironborn raid the Stony Shore by sea; Stannis's fleet carries a host.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, applyChanges } from '../public/js/shared/world.js';
import { hullsOf, capacityOf, seaTick, fightAtSea, navalPower, aboardOf } from '../public/js/engine/military/naval.js';
import { marchTick } from '../public/js/shared/marches.js';
import { resolveWarfare } from '../public/js/shared/battles.js';
import { perform } from '../public/js/engine/actions/registry.js';
import { holdingRevenue } from '../public/js/engine/economy/ledger.js';
import { treeChoice } from '../public/js/engine/minds/houseways.js';
import { settle } from '../public/js/engine/parties.js';
import { makeRng, seedState } from '../public/js/engine/rng.js';
import { dateOfDay, dayNumber } from '../public/js/engine/time.js';
import { validate } from '../public/js/engine/state/validate.js';

const world = (house) => createInitialState('agot_298', house, { seed: 5 });
const war = (s, a, d) => applyChanges(s, [{ op: 'war', status: 'start', name: 'W', attackers: a, defenders: d }], { source: 'test' });
const rng = (seed) => { const g = makeRng(seedState(seed)); return () => g.next(); };
const days = (s, n, r = rng(1)) => {
  for (let i = 0; i < n; i++) {
    const d = dayNumber(s.meta.date); s.meta.date = { ...s.meta.date, ...dateOfDay(d + 1) };
    marchTick(s, { span: 1, turnStart: d }); seaTick(s, 1, r); resolveWarfare(s, 1, { r });
  }
};

test('ships by kind: longships for the ironborn, galleys and cogs for the Crown, carracks for Braavos', () => {
  const s = world('stark');
  assert.deepEqual(hullsOf(s, s.parties.iron_fleet), { longship: 100 });
  assert.ok(hullsOf(s, s.parties.dragonstone_fleet).galley >= 20);
  assert.ok(hullsOf(s, s.parties.braavosi_fleet).carrack > 150);
  assert.equal(capacityOf(s, s.parties.iron_fleet), 4000, 'a longship carries forty');
  s.parties.iron_fleet.ships = 50; assert.equal(hullsOf(s, s.parties.iron_fleet).longship, 50, 'the make-up follows the ships left');
});

test("Stannis's fleet carries a host: aboard at Dragonstone, across Blackwater Bay, ashore at Storm's End", () => {
  const s = world('baratheon_ds');
  applyChanges(s, [{ op: 'army_create', id: 'stannis_host', owner: 'baratheon_ds', name: "Lord Stannis's host", at: 'baratheon_ds', men: 2500 }], { source: 'test' });
  const h = s.parties.stannis_host; const f = s.parties.dragonstone_fleet;
  let r = perform(s, 'embark_host', { params: { army: h.id, fleet: f.id } }); assert.ok(r.ok, JSON.stringify(r.receipt));
  assert.equal(h.aboard, f.id); assert.equal(h.state, 'embarked');
  assert.equal(perform(s, 'march_host', { params: { army: h.id, to: 'baratheon' } }).ok, false, 'a host aboard does not march');
  r = perform(s, 'march_host', { params: { army: f.id, to: 'baratheon_se' } }); assert.ok(r.ok, JSON.stringify(r.receipt));
  let mid = null;
  for (let d = 0; d < 30 && f.march; d++) { days(s, 1); if (f.march && !mid) mid = [...h.pos]; }
  assert.ok(!f.march && f.at === 'baratheon_se', `the fleet comes to Storm's End (${f.at})`);
  assert.ok(mid && Math.hypot(mid[0] - f.pos[0], mid[1] - f.pos[1]) > 1, 'the host sailed with it');
  assert.deepEqual(h.pos, f.pos);
  r = perform(s, 'land_host', { params: { fleet: f.id } }); assert.ok(r.ok, JSON.stringify(r.receipt));
  assert.ok(!h.aboard); assert.equal(h.at, 'baratheon_se'); assert.equal(aboardOf(s, f).length, 0);
  assert.equal(perform(s, 'march_host', { params: { army: h.id, to: 'bronzegate' } }).ok, false, 'coming ashore takes a day');
  assert.deepEqual(validate(s).filter((x) => /aboard|sea/.test(x)), []);
});

test('the ironborn raid the Stony Shore by sea: villages burned, plunder home, the land laid waste', () => {
  const s = world('greyjoy'); war(s, ['greyjoy'], ['stark']);
  const f = s.parties.iron_fleet; const gold0 = s.houses.greyjoy.figures.treasury.v;
  const r = perform(s, 'raid_coast', { params: { fleet: f.id, target: 'the_stony_shore' } });
  assert.ok(r.ok, JSON.stringify(r.receipt));
  days(s, 40);
  const raids = (s.facts || []).filter((x) => x.kind === 'raid' && x.data?.holding);
  assert.ok(raids.length >= 2, `villages reaved (${raids.map((x) => x.data.holding).join(', ')})`);
  assert.ok(raids.every((x) => s.holdings[x.data.holding].region === 'north'), 'on the northern coast');
  assert.ok(s.houses.greyjoy.figures.treasury.v > gold0, 'the plunder goes to Pyke');
  const hit = s.holdings[raids.find((x) => !x.data.beaten)?.data.holding];
  assert.ok(hit.devastation >= 15, `the land is laid waste (${hit.devastation})`);
  assert.ok(!f.raid, 'the raid is over, and the fleet sails home');
});

test('the Greyjoys, at war, send the longships reaving', () => {
  const s = world('stark'); war(s, ['greyjoy'], ['stark']);
  const pick = treeChoice(s, s.houses.greyjoy.lord);
  assert.equal(pick.verb, 'raid_coast', `${pick.rule}: ${pick.why}`);
});

test('a blockade halves a port\'s trade and starves a besieged castle', async () => {
  const { starving } = await import('../public/js/engine/military/siege.js');
  const s = world('stark'); war(s, ['lannister'], ['baratheon_se']);
  const h = s.holdings.lannisport; const base = holdingRevenue(s, h).lines.trade;
  h.blockade = { by: 'stark', fleet: 'x' };
  assert.equal(Math.round(holdingRevenue(s, h).lines.trade), Math.round(base / 2));
  delete h.blockade;
  const se = s.holdings.baratheon_se; assert.equal(starving(s, se, 'lannister'), false);
  se.blockade = { by: 'lannister', fleet: 'x' }; assert.equal(starving(s, se, 'lannister'), true);
});

test('a sea fight: the stronger fleet wins, boarders take prizes, the loser runs for home', () => {
  const s = world('stark'); war(s, ['greyjoy'], ['baratheon']);
  const a = s.parties.iron_fleet; const b = s.parties.royal_fleet;
  b.pos = [...a.pos]; b.at = null; delete b.march; settle(s, b);
  assert.ok(navalPower(s, a) > navalPower(s, b), 'a hundred longships with ironborn crews');
  const shipsA = a.ships, shipsB = b.ships;
  fightAtSea(s, a, b, rng(3));
  const f = s.facts.find((x) => x.kind === 'sea_battle'); assert.equal(f.data.winner, 'iron_fleet');
  assert.ok(!s.parties.royal_fleet || s.parties.royal_fleet.ships <= shipsB * 0.8, 'the loser loses a fifth or more');
  assert.ok(a.ships >= shipsA * 0.85, 'the victor little — and gains prizes');
  assert.ok(f.data.prizes > 0);
});

test('autumn storms take ships at sea', () => {
  const s = world('stark'); s.world.season = 'autumn';
  const f = s.parties.redwyne_fleet; f.at = null; f.pos = [150, 1900]; const ships = f.ships;
  seaTick(s, 1, () => 0);
  assert.ok(f.ships < ships); assert.ok(s.facts.some((x) => x.kind === 'lost_at_sea'));
  const t = world('stark'); const g = t.parties.redwyne_fleet; g.at = null; seaTick(t, 1, () => 0);
  assert.equal(g.ships, 200, 'not in summer');
});
