// The economy (WP C1; docs/gdd/06-economy.md; quality gate Q10): the realm's people as the books count them, incomes
// within ±15 % of §5.2, the Crown in deficit, the Lannisters' coin a hoard and their wealth the Crown's debt, the mines
// quietly failing, and a war that costs what a war costs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../public/js/shared/world.js';
import { project, economyV2, settle } from '../public/js/shared/economy.js';
import { ECONOMY } from '../public/data/balance.js';
import { minesOf, interestOf } from '../public/js/engine/economy/ledger.js';
import { withRng } from '../public/js/engine/rng.js';
import { balance } from '../scripts/balance-sim.js';

test('Q10: every great house within ±15 % of its income, the Crown in deficit, no coin negative, Stark\'s war chest 8–20 moons', () => {
  const r = balance();
  assert.deepEqual(r.problems, []);
  assert.ok(r.war.chest >= 8 && r.war.chest <= 20, `${r.war.chest}`);
});

test('the people of the realm: each region as §4 counts it, the great cities their own', () => {
  const s = createInitialState('agot_298', 'stark', { seed: 1 });
  // the books' counts are for the first roster; the lesser houses (G1) hold small domains over and above them
  const by = {}; for (const h of Object.values(s.holdings)) if (!h.lesser) by[h.region] = (by[h.region] || 0) + h.population;
  for (const [r, n] of Object.entries(ECONOMY.population)) if (by[r]) assert.ok(Math.abs(by[r] - n) / n < 0.01, `${r}: ${by[r]} of ${n}`);
  assert.equal(s.holdings.baratheon.population, 500000, "King's Landing");
  assert.equal(s.holdings.hightower.population, 500000, 'Oldtown');
  assert.ok(s.holdings.stark.population > s.holdings.karstark.population, 'Winterfell\'s lands are wider than Karhold\'s');
});

test('the Lannisters: half a million in coin, three million owed by the Crown, the mines running dry', () => {
  const s = createInitialState('agot_298', 'lannister', { seed: 1 });
  assert.equal(s.houses.lannister.figures.treasury.v, 500000);
  const owed = s.economy.loans.filter((l) => l.lender === 'lannister').reduce((n, l) => n + l.amount, 0);
  assert.equal(owed, 3000000);
  assert.equal(s.houses.baratheon.figures.debt.v, 6000000);
  const now = minesOf(s, s.holdings.lannister);
  s.meta.date = { ...s.meta.date, year: s.meta.date.year + 2 };
  assert.ok(minesOf(s, s.holdings.lannister) < now * 0.65, 'two years on, the Rock yields about 60 % of what it did');
  // the Crown's loans: a house's interest is added to the debt; the Iron Bank's is paid in coin
  const it = interestOf(s, 'baratheon'); assert.ok(it.coin > 20000 && it.accrues > 10000, JSON.stringify(it));
  const debt = s.houses.baratheon.figures.debt.v;
  withRng(s, () => settle(s, 30));
  assert.ok(s.houses.baratheon.figures.debt.v > debt, 'the Crown\'s debt grows');
});

test('an older save keeps its coin; its people grow to the new count, and what its lands can bear grows with them', () => {
  const s = createInitialState('agot_298', 'stark', { seed: 1 });
  // as a save from before C1 looked: the old small populations, its own coin, no loans
  delete s.economy; s.meta.turn = 12; s.houses.stark.figures.treasury.v = 77777;
  for (const h of Object.values(s.holdings)) h.population = Math.round(h.population / 5);
  const base = s.houses.stark.popBase; s.houses.stark.popBase = Math.round(base / 5);
  economyV2(s);
  assert.equal(s.houses.stark.figures.treasury.v, 77777, 'the coin is the player\'s');
  assert.ok(Math.abs(s.houses.stark.popBase - base) / base < 0.02, `${s.houses.stark.popBase} vs ${base}`);
  assert.equal(s.economy.v, 2);
  assert.ok(project(s, 'stark').income > 8000);
});

// ── C1b: lenders, loans, default, and the verbs of 06 §9 ──
const { creditOf, lendersTick, grainPrice } = await import('../public/js/engine/economy/lenders.js');
const { perform } = await import('../public/js/engine/actions/registry.js');
const { parseOrder } = await import('../server/orders/parse.js');
const { dayNumber } = await import('../public/js/engine/time.js');
const at = (s, days) => { const d = dayNumber(s.meta.date) + days; s.meta.date = { ...s.meta.date, ...{ year: Math.floor(d / 360), month: Math.floor((d % 360) / 30) + 1, day: (d % 30) + 1 } }; };

test('the Iron Bank lends by what it thinks of you, and will have its due: a loan unpaid is a default the realm hears of', () => {
  const s = createInitialState('agot_298', 'stark', { seed: 3 });
  const c = creditOf(s, 'stark', 'iron_bank');
  assert.ok(c.limit > 150000 && c.rate >= 0.08 && c.rate < 0.15, JSON.stringify(c));
  assert.equal(perform(s, 'borrow', { params: { lender: 'iron_bank', gold: c.limit + 100000 } }).refusal.code, 'credit');
  const coin = s.houses.stark.figures.treasury.v;
  const r = perform(s, 'borrow', { params: { lender: 'iron_bank', gold: 100000, months: 6 } });
  assert.ok(r.ok, r.refusal?.text); assert.equal(s.houses.stark.figures.treasury.v, coin + 100000);
  assert.match(r.receipt[0].text, /100,000 dragons borrowed from the Iron Bank of Braavos at \d+ in the hundred a year; due in 6 moons/);
  // the interest is in the accounts each moon
  withRng(s, () => settle(s, 30));
  assert.ok(s.houses.stark.ledger.at(-1).lines.some((l) => l.label === 'Interest on debts' && l.amount > 500));
  // six moons on, the loan is called; spend the coin and let two more moons pass: a default
  at(s, 180); lendersTick(s);
  s.houses.stark.figures.treasury.v = 0; at(s, 61); lendersTick(s);
  assert.ok(s.facts.some((f) => f.kind === 'loan_defaulted'), 'the default is a fact');
  assert.ok(s.economy.ironBankRefuses.includes('stark'), 'the Iron Bank lends no more to the North');
  assert.equal(perform(s, 'borrow', { params: { lender: 'iron_bank', gold: 1000 } }).refusal.code, 'refused');
});

test('Tywin calls in the Crown\'s debt: three million within three moons, or the Crown defaults on House Lannister', () => {
  const s = createInitialState('agot_298', 'lannister', { seed: 3 });
  const r = perform(s, 'call_debt', { house: 'lannister', params: { debtor: 'baratheon', months: 3 } });
  assert.ok(r.ok, r.refusal?.text); assert.match(r.receipt[0].text, /House Baratheon of King's Landing must repay 3,000,000 dragons within 3 moons/);
  assert.ok(s.facts.some((f) => f.kind === 'debt_called' && f.vis.scope === 'public'));
  const rel = s.relations[['baratheon', 'lannister'].sort().join('|')]?.v ?? 0;
  at(s, 91); lendersTick(s);
  assert.ok(s.economy.defaults.some((d) => d.debtor === 'baratheon' && d.lender === 'lannister'));
  assert.ok((s.relations[['baratheon', 'lannister'].sort().join('|')]?.v ?? 0) < rel, 'the Lannisters are wronged');
});

test('grain costs what the season and the war make it; a bribe is taken or refused; an embargo is both ways and can be lifted', () => {
  const s = createInitialState('agot_298', 'stark', { seed: 3 });
  const summer = grainPrice(s, 'north'); s.world.season = 'winter'; const winter = grainPrice(s, 'north'); s.world.season = 'summer';
  assert.ok(Math.abs(winter / summer - 3.5) < 0.01, 'winter in the North: grain is dear');
  const food = s.houses.stark.figures.food.v; const coin = s.houses.stark.figures.treasury.v;
  const g = perform(s, 'buy_grain', { params: { moons: 2 } }); assert.ok(g.ok, g.refusal?.text);
  assert.equal(s.houses.stark.figures.food.v, food + 2); assert.ok(s.houses.stark.figures.treasury.v < coin);
  const b = withRng(s, () => perform(s, 'bribe', { params: { to: 'walder_frey', gold: 20000, aim: 'let our host cross' } }));
  assert.ok(b.ok && s.facts.some((f) => ['bribe', 'bribe_refused'].includes(f.kind)));
  assert.ok(perform(s, 'embargo', { params: { house: 'lannister' } }).ok);
  assert.ok(s.pacts.some((p) => p.type === 'embargo' && p.status === 'active'));
  assert.equal(perform(s, 'embargo', { params: { house: 'lannister' } }).refusal.code, 'already');
  assert.ok(perform(s, 'embargo', { params: { house: 'lannister', lift: 'yes' } }).ok);
  assert.ok(!s.pacts.some((p) => p.type === 'embargo' && p.status === 'active'));
});

test('written orders about money are read by the rules', () => {
  const s = createInitialState('agot_298', 'stark', { seed: 3 });
  const one = (text) => { const a = parseOrder(s, text).actions[0]; return a && { verb: a.verb, params: a.params }; };
  assert.deepEqual(one('Borrow 50,000 dragons from the Iron Bank for two years.'), { verb: 'borrow', params: { lender: 'iron_bank', gold: 50000, months: 24 } });
  assert.deepEqual(one('Buy three moons of grain for the granaries.'), { verb: 'buy_grain', params: { moons: 3 } });
  assert.deepEqual(one('Embargo House Lannister.'), { verb: 'embargo', params: { house: 'lannister' } });
  assert.equal(one('Bribe Walder Frey with 2,000 dragons to let our host cross.').verb, 'bribe');
  assert.deepEqual(one('Repay the Iron Bank.'), { verb: 'repay', params: { lender: 'iron_bank' } });
});
