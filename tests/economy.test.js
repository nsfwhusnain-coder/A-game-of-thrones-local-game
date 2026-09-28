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
  const by = {}; for (const h of Object.values(s.holdings)) by[h.region] = (by[h.region] || 0) + h.population;
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
