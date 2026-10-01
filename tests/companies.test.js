// Sellswords, outlaws and the Watch (docs/gdd/07-military.md §10; WP C7). The acceptance: hired companies desert when
// unpaid; the khalasar cannot embark.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, applyChanges } from '../public/js/shared/world.js';
import { companyHost, priceOf, irregularsTick, hireRefusal } from '../public/js/engine/military/companies.js';
import { canEmbark } from '../public/js/engine/military/naval.js';
import { transportFor } from '../public/js/shared/sea.js';
import { perform } from '../public/js/engine/actions/registry.js';
import { makeRng, seedState } from '../public/js/engine/rng.js';
import { dateOfDay, dayNumber } from '../public/js/engine/time.js';

const world = (house = 'lannister') => createInitialState('agot_298', house, { seed: 5 });
const rng = (seed) => { const g = makeRng(seedState(seed)); return () => g.next(); };
const days = (s, n, r = rng(1)) => { for (let i = 0; i < n; i++) { s.meta.date = { ...s.meta.date, ...dateOfDay(dayNumber(s.meta.date) + 1) }; irregularsTick(s, 1, r); } };
const facts = (s, kind) => (s.facts || []).filter((f) => f.kind === kind);

test('hire the Golden Company: a moon paid on signing, the company yours, and hired ships to bring it over', () => {
  const s = world(); const gold0 = s.houses.lannister.figures.treasury.v;
  const p = companyHost(s, 'golden_company'); const price = priceOf(s, 'golden_company');
  assert.equal(price, Math.round(p.men * 2.5));
  const r = perform(s, 'hire_company', { params: { company: 'golden_company' } }); assert.ok(r.ok, JSON.stringify(r.receipt));
  assert.equal(p.serving, 'lannister'); assert.equal(p.contract.price, price);
  assert.equal(s.houses.lannister.figures.treasury.v, gold0 - price);
  assert.equal(p.march?.to, 'lannister', 'it marches for the Rock');
  assert.equal(transportFor(s, 'golden_company', p.men, p.pos).kind, 'hired', 'on hired ships');
  days(s, 30);
  assert.equal(s.houses.lannister.figures.treasury.v, gold0 - 2 * price, 'the second moon is paid');
  assert.equal(p.contract.unpaid, 0);
});

test('a company unpaid marches off', () => {
  const s = world(); perform(s, 'hire_company', { params: { company: 'golden_company' } });
  const p = companyHost(s, 'golden_company');
  s.houses.lannister.figures.treasury.v = 100; // the coffers are empty
  days(s, 31);
  assert.ok(!p.contract && !p.serving, 'the contract is broken');
  assert.equal(p.march?.to, 'golden_company_camp', 'and the company goes home');
  assert.ok(facts(s, 'desertion').some((f) => f.data.why === 'unpaid'));
  assert.equal(perform(s, 'march_host', { params: { army: p.id, to: 'lannisport' } }).ok, false, 'no longer yours to command');
});

test('the Brave Companions go over for half as much again; the Golden Company keeps its word', () => {
  const s = world('tully');
  applyChanges(s, [{ op: 'figure', house: 'lannister', field: 'treasury', delta: 0 }]);
  perform(s, 'hire_company', { house: 'lannister', params: { company: 'brave_companions' } });
  const p = companyHost(s, 'brave_companions'); assert.equal(p.serving, 'lannister');
  const price = p.contract.price;
  assert.equal(hireRefusal(s, 'tully', 'brave_companions', price + 1)?.code, 'price');
  const r = perform(s, 'hire_company', { params: { company: 'brave_companions', offer: Math.ceil(price * 1.5) } });
  assert.ok(r.ok, JSON.stringify(r.receipt)); assert.equal(p.serving, 'tully');
  assert.ok(facts(s, 'sellswords_turned').length === 1);
  perform(s, 'hire_company', { house: 'lannister', params: { company: 'golden_company' } });
  assert.equal(hireRefusal(s, 'tully', 'golden_company', 10 ** 7)?.code, 'bound');
});

test('the khalasar cannot embark: the Dothraki will not cross the poison water', () => {
  const s = world(); const k = s.parties.drogo_khalasar; const f = s.parties.braavosi_fleet;
  k.pos = [...f.pos]; k.at = f.at;
  assert.match(canEmbark(s, k, f), /poison water/);
  const t = transportFor(s, 'dothraki', k.men, k.pos); assert.equal(t.kind, 'none'); assert.match(t.why, /poison water/);
});

test('outlaws rise where war has laid the land waste, and scatter when the lord\'s host comes', () => {
  const s = world('stark'); applyChanges(s, [{ op: 'war', status: 'start', name: 'W', attackers: ['lannister'], defenders: ['tully'] }]);
  const h = s.holdings.darry; h.devastation = 80;
  for (const p of Object.values(s.parties)) if (Math.hypot(p.pos[0] - h.pos[0], p.pos[1] - h.pos[1]) < 20) delete s.parties[p.id];
  days(s, 120, rng(4));
  assert.ok(h.outlaws, 'a band holds the roads');
  assert.ok(facts(s, 'outlaws_rise').length >= 1);
  applyChanges(s, [{ op: 'army_create', id: 'clear', owner: 'darry', name: 'Darry men', at: 'darry', men: 800 }]);
  days(s, 7);
  assert.ok(!h.outlaws, 'the lord clears the country'); assert.ok(facts(s, 'outlaws_scattered').length >= 1);
});

test("the Night's Watch takes recruits and no side", () => {
  const s = world('stark'); const nw = s.parties.nw_garrison; const men = nw.men;
  days(s, 60); assert.ok(nw.men >= men + 40, `two moons of recruits (${men} → ${nw.men})`);
  assert.equal(perform(s, 'declare_war', { params: { house: 'nights_watch' } }).ok, false);
});

test('the Second Sons and the Stormcrows (WP G1) are for hire like the others: raised at their camp, paid a moon on signing, turncoats to a higher bid', () => {
  for (const [id, men] of [['second_sons', 500], ['stormcrows', 500]]) {
    const s = world(); const gold0 = s.houses.lannister.figures.treasury.v;
    assert.ok(s.houses[id] && s.holdings[`${id}_camp`], `${id} has a house and a camp`);
    assert.equal(priceOf(s, id), men * 2, `${id}: two dragons a man a moon`);
    const r = perform(s, 'hire_company', { params: { company: id } }); assert.ok(r.ok, JSON.stringify(r.receipt));
    const p = companyHost(s, id); assert.equal(p.serving, 'lannister'); assert.equal(p.men, men);
    assert.equal(s.houses.lannister.figures.treasury.v, gold0 - men * 2);
    assert.ok(s.characters[s.houses[id].lord], `${id} has a captain`);
  }
});
