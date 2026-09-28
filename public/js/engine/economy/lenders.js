// Lenders, loans and default (docs/gdd/06-economy.md §7; WP C1b). The Iron Bank of Braavos, the Faith, the Tyroshi
// cartels and the Bank of Oldtown lend at rates by what they think of the borrower; a great house may lend or call a
// debt as it chooses. A loan past its day, or called and not repaid, is a default the whole realm hears of — and the
// Iron Bank remembers: it raises its rates and lends no more to that realm.
import { ECONOMY } from '../../../data/balance.js';
import { dayNumber } from '../time.js';
import { realmOf } from '../../shared/world.js';
import { emit } from '../facts/log.js';

export const LENDERS = {
  iron_bank: { name: 'the Iron Bank of Braavos', rate: 0.08, max: 0.25, risk: 1 },
  faith: { name: 'the Faith of the Seven', rate: 0.03, max: 0.08, risk: 0.3, pious: true },
  tyroshi: { name: 'the Tyroshi cartels', rate: 0.18, max: 0.3, risk: 1.5 },
  bank_of_oldtown: { name: 'the Bank of Oldtown', rate: 0.07, max: 0.14, risk: 0.8, regions: ['reach', 'crownlands'] },
};
const gold = (h) => Number(h?.figures?.treasury?.v) || 0;
const loansOf = (state, house) => (state.economy?.loans || []).filter((l) => l.debtor === house && l.amount > 0);
export const lenderName = (state, id) => LENDERS[id]?.name || (state.houses[id] ? `House ${state.houses[id].name}` : id);

/** A house's standing with the lenders: what a year of its income, its coin and what it is owed will carry. */
export function creditOf(state, house, lender = 'iron_bank') {
  const h = state.houses[house]; const L = LENDERS[lender];
  const income = Math.max(0, Number(h?.figures?.income?.v) || 0);
  const owed = (state.economy?.loans || []).filter((l) => l.lender === house).reduce((n, l) => n + l.amount, 0);
  const debt = loansOf(state, house).reduce((n, l) => n + l.amount, 0) + Math.max(0, (Number(h?.figures?.debt?.v) || 0) - loansOf(state, house).reduce((n, l) => n + l.amount, 0));
  const limit = Math.max(0, Math.round((income * 18 + gold(h) * 0.5 + owed * 0.3 - debt) / 1000) * 1000);
  const war = (state.wars || []).some((w) => w.status !== 'ended' && [...w.attackers, ...w.defenders].includes(house));
  const bad = (state.economy?.defaults || []).filter((d) => d.debtor === house).length;
  const burden = debt / Math.max(1, income * 12);
  let rate = (L?.rate ?? 0.1) + (L?.risk ?? 1) * (Math.min(1, burden) * 0.06 + (war ? 0.02 : 0) + bad * 0.05);
  rate = Math.min(L?.max ?? 0.3, Math.round(rate * 1000) / 1000);
  const refuses = lender === 'iron_bank' && (state.economy?.ironBankRefuses || []).includes(realmOf(state, house));
  const reach = L?.regions ? L.regions.includes(state.holdings[h?.seat]?.region) : true;
  return { limit: refuses || !reach ? 0 : limit, rate, refuses, reach };
}

/** Borrow from a lender: the coin now, the interest each moon, the whole on its day. */
export function borrow(state, { house, lender, amount, months = 24, cause }) {
  const h = state.houses[house]; const n = Math.round(Number(amount) || 0);
  const c = creditOf(state, house, lender);
  const loan = { id: `loan_${house}_${lender}_${dayNumber(state.meta.date)}`, lender, debtor: house, amount: n, rate: c.rate, pays: 'coin', since: dayNumber(state.meta.date), due: dayNumber(state.meta.date) + Math.round(months * 30) };
  state.economy = state.economy || { v: 2, loans: [] }; state.economy.loans.push(loan);
  h.figures.treasury = { ...(h.figures.treasury || {}), v: gold(h) + n };
  h.figures.debt = { ...(h.figures.debt || {}), v: (Number(h.figures.debt?.v) || 0) + n };
  if (state.houses[lender]) state.houses[lender].figures.treasury.v = gold(state.houses[lender]) - n;
  emit(state, 'loan_taken', { actors: [h.lord], houses: [house, ...(state.houses[lender] ? [lender] : [])], data: { lender, amount: n, rate: c.rate, due: loan.due }, cause, text: `House ${h.name} borrows ${n.toLocaleString('en-GB')} dragons from ${lenderName(state, lender)} at ${Math.round(c.rate * 100)} in the hundred a year, to be repaid in ${months} moons.` });
  return { loan, rate: c.rate };
}

/** Repay a lender, all or part: the oldest loans first. */
export function repay(state, { house, lender, amount, cause }) {
  const h = state.houses[house]; let left = Math.min(Math.round(Number(amount) || Infinity), gold(h));
  let paid = 0;
  for (const l of loansOf(state, house).filter((x) => x.lender === lender).sort((a, b) => a.since - b.since)) {
    const x = Math.min(left, l.amount); l.amount -= x; left -= x; paid += x;
    if (!l.amount) delete l.called;
  }
  h.figures.treasury.v = gold(h) - paid;
  h.figures.debt = { ...(h.figures.debt || {}), v: Math.max(0, (Number(h.figures.debt?.v) || 0) - paid) };
  if (state.houses[lender]) state.houses[lender].figures.treasury.v = gold(state.houses[lender]) + paid;
  state.economy.loans = state.economy.loans.filter((l) => l.amount > 0);
  const still = loansOf(state, house).filter((x) => x.lender === lender).reduce((n, l) => n + l.amount, 0);
  emit(state, 'loan_repaid', { actors: [h.lord], houses: [house, ...(state.houses[lender] ? [lender] : [])], data: { lender, amount: paid, still }, cause, text: `House ${h.name} repays ${paid.toLocaleString('en-GB')} dragons to ${lenderName(state, lender)}${still ? `; ${still.toLocaleString('en-GB')} is still owed` : ' — the debt is cleared'}.` });
  return { paid, still };
}

/** A lender calls its debt: the debtor must repay by the day given, or default. */
export function callDebt(state, { lender, debtor, months = 3, cause }) {
  const day = dayNumber(state.meta.date) + Math.round(months * 30);
  const ls = loansOf(state, debtor).filter((l) => l.lender === lender);
  for (const l of ls) l.called = day;
  const owed = ls.reduce((n, l) => n + l.amount, 0);
  const d = state.houses[debtor];
  emit(state, 'debt_called', { actors: [state.houses[lender]?.lord, d?.lord], houses: [debtor, ...(state.houses[lender] ? [lender] : [])], data: { lender, owed, by: day }, cause, text: `${lenderName(state, lender).replace(/^./, (x) => x.toUpperCase())} calls in the debt of House ${d?.name}: ${owed.toLocaleString('en-GB')} dragons, to be repaid within ${months} moons.` });
  return { owed, by: day };
}

/**
 * A moon of the lenders (settled with the ledger): a loan past its day is called; a called debt not repaid by its day is
 * a default — the realm hears of it, the lender is wronged, and the Iron Bank lends no more to that realm and asks more
 * of every loan it holds there. Returns notes for the steward.
 */
export function lendersTick(state) {
  const notes = []; const today = dayNumber(state.meta.date);
  for (const l of state.economy?.loans || []) {
    if (l.amount <= 0 || l.defaulted) continue;
    if (l.due && today >= l.due && !l.called) { l.called = today + 60; notes.push({ house: l.debtor, text: `The loan from ${lenderName(state, l.lender)} is due: ${l.amount.toLocaleString('en-GB')} dragons within two moons.`, important: true }); }
    if (l.called && today >= l.called) {
      const d = state.houses[l.debtor];
      if (gold(d) >= l.amount) { repay(state, { house: l.debtor, lender: l.lender, amount: l.amount, cause: { type: 'rule', ref: 'lenders' } }); continue; }
      l.defaulted = true; l.rate = Math.min(0.3, l.rate + 0.05);
      state.economy.defaults = [...(state.economy.defaults || []), { debtor: l.debtor, lender: l.lender, day: today, amount: l.amount }];
      if (l.lender === 'iron_bank') state.economy.ironBankRefuses = [...new Set([...(state.economy.ironBankRefuses || []), realmOf(state, l.debtor)])];
      if (state.houses[l.lender]) { const k = [l.debtor, l.lender].sort().join('|'); state.relations[k] = { ...(state.relations[k] || {}), v: Math.max(-100, (state.relations[k]?.v ?? 0) - 30) }; }
      emit(state, 'loan_defaulted', { actors: [d?.lord], houses: [l.debtor, ...(state.houses[l.lender] ? [l.lender] : [])], data: { lender: l.lender, amount: l.amount }, cause: { type: 'rule', ref: 'lenders' }, text: `House ${d?.name} cannot repay ${lenderName(state, l.lender)}: ${l.amount.toLocaleString('en-GB')} dragons defaulted.${l.lender === 'iron_bank' ? ' The Iron Bank will have its due.' : ''}` });
      notes.push({ house: l.debtor, text: `House ${d?.name} has defaulted on its debt to ${lenderName(state, l.lender)}.`, important: true });
    }
  }
  return notes;
}

/** The price of grain in a region, by the season, war and siege there (§6.3): dragons a man-moon. */
export function grainPrice(state, region) {
  const s = state.world?.season || 'summer';
  let k = s === 'winter' ? (region === 'north' ? 3.5 : 2.5) : s === 'autumn' ? 1.3 : 1;
  const war = (state.wars || []).some((w) => w.status !== 'ended' && [...w.attackers, ...w.defenders].some((x) => state.holdings[state.houses[x]?.seat]?.region === region));
  if (war) k *= 1.5;
  if (Object.values(state.holdings).some((h) => h.region === region && h.status === 'besieged' && h.type === 'city')) k *= 2;
  return Math.round(ECONOMY.grainPerManMoon * k * 1000) / 1000;
}
