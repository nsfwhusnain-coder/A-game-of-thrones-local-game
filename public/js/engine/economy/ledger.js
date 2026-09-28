// The ledger's formulas (docs/gdd/06-economy.md §4–§7; WP C1). A holding's people make its output; the lord takes his
// share by his taxes; markets, ports and mines add their own; the season, war and the levies away in the field take
// theirs. Every number is in data/balance.js ECONOMY, so balancing is one file and `node scripts/balance-sim.js`.
import { ECONOMY } from '../../../data/balance.js';

const E = ECONOMY;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/**
 * The people of the realm (§4): each region's total shared among its holdings by the size of their domains, the cities
 * keeping their own figures. Run on a new world, and once on an older save (whose holdings were ~7× too few).
 * Returns { region: factor } — how much each region's people grew.
 */
export function distributePopulation(state) {
  const byRegion = {};
  for (const h of Object.values(state.holdings)) (byRegion[h.region] = byRegion[h.region] || []).push(h);
  const grew = {};
  for (const [region, hs] of Object.entries(byRegion)) {
    const target = E.population[region]; if (!target) continue;
    const before = hs.reduce((n, h) => n + (h.population || 0), 0) || 1;
    const fixed = hs.filter((h) => E.cities[h.id] != null);
    const rest = hs.filter((h) => E.cities[h.id] == null);
    const left = Math.max(0, target - fixed.reduce((n, h) => n + E.cities[h.id], 0));
    const w = (h) => E.domainOf[h.id] ?? E.domain[h.type] ?? 2; const total = rest.reduce((n, h) => n + w(h), 0) || 1;
    for (const h of fixed) h.population = E.cities[h.id];
    for (const h of rest) h.population = Math.round(left * w(h) / total / 100) * 100;
    grew[region] = hs.reduce((n, h) => n + h.population, 0) / before;
  }
  return grew;
}

/** 0.55 + 0.009 × prosperity: a holding at 50 yields its due. */
export const prosperityFactor = (h) => 0.55 + 0.009 * (h.prosperity ?? 50);
export function seasonFactor(state, h) {
  const s = state.world?.season || 'summer';
  if (s === 'winter' && ['north', 'wall', 'beyond'].includes(h.region)) return E.winterNorth;
  return E.season[s] ?? 1;
}
/** What war does to a holding's fields: besieged, sacked, burning, occupied, risen. */
export function warFactor(h) {
  const st = h.status || '';
  const devastation = 1 - 0.5 * clamp((h.devastation || 0) / 100, 0, 1);
  return devastation * (st === 'besieged' ? 0.2 : st === 'sacked' ? 0.1 : st === 'burning' ? 0.2 : st === 'occupied' ? 0.6 : st === 'rising' ? 0.35 : 1);
}
/** The fields left untilled while a house's levies are away: 1 − 0.6 × raised ÷ full muster. */
export function labourFactor(state, house) {
  const h = state.houses[house]; if (!h?.levyCap) return 1;
  const raised = Math.max(0, h.levyCap - (Number(h.figures?.levies?.v) || 0));
  return clamp(1 - E.labour * raised / Math.max(1, h.levyCap), 0.4, 1);
}
/** The mines' yield, and the secret: the Rock's run dry by 2 % a moon from 298 AC. */
export function minesOf(state, h) {
  const base = E.mines[h.id] || 0; if (!base) return 0;
  const months = Math.max(0, ((state.meta?.date?.year ?? 298) - 298) * 12 + ((state.meta?.date?.month ?? 1) - 1));
  return base * (1 - (E.mineDepletion[h.id] || 0)) ** months;
}

/**
 * A holding's revenue a moon (§5.1), before luck: its rents by its lord's taxes, its trade by the trade factor, its mines.
 * `lines` names each part for the steward's accounts. `tax` is the owner's tax level; `trade` the owner's trade factor.
 */
export function holdingRevenue(state, h, { tax = 'normal', trade = 1, labour = 1 } = {}) {
  const gross = (h.population || 0) * E.outputPerHead * (E.regionOutput[h.region] ?? 1) * prosperityFactor(h) * seasonFactor(state, h) * warFactor(h) * labour;
  const rents = gross * (E.rentShare[tax] ?? E.rentShare.normal) * (1 - Math.max(0, (h.unrest || 0) - 40) / 120);
  const tr = (E.tradeBase[h.id] || 0) * trade * warFactor(h);
  const mines = minesOf(state, h) * warFactor(h);
  return { total: rents + tr + mines, lines: { rents, trade: tr, mines } };
}

/** The household's cost a moon (§5.2, §6.1): the named houses' own, else by rank — and the King's pleasures. */
export function householdCost(state, house) {
  const h = state.houses[house]; if (!h) return 0;
  let c = E.start[house]?.household ?? E.household[h.rank] ?? 100;
  if (h.rank === 'crown' && state.characters.robert_baratheon?.alive && h.lord === 'robert_baratheon') c += E.kingsPleasures;
  return c;
}
/** Standing wages a moon: men-at-arms and the household guard (sworn brothers take a pittance). */
export function wagesOf(house, h) {
  const f = h.figures || {};
  return (Number(f.menAtArms?.v) || 0) * (house === 'nights_watch' ? E.wages.brother : E.wages.manAtArms) + (Number(f.guard?.v) || 0) * E.wages.guard;
}

/** The Crown's debts of 298 (§5.2, §7): the loans it owes, and to whom. */
export function crownLoans(debtor = 'baratheon') {
  return E.crownDebt.map((l) => ({ ...l, debtor }));
}
/** Interest a moon on a house's loans: { coin (paid), accrues (added to the debt), owedTo: { lender: amount } }. */
export function interestOf(state, house) {
  const out = { coin: 0, accrues: 0, received: 0 };
  for (const l of state.economy?.loans || []) {
    const m = l.amount * l.rate / 12;
    if (l.debtor === house) { if (l.pays === 'accrues') out.accrues += m; else out.coin += m; }
    if (l.lender === house && l.pays !== 'accrues') out.received += m;
  }
  return out;
}
