// The ledger engine. Nothing here is a fixed "+500 per turn": every yield depends on population,
// prosperity, unrest, the season, sieges and raids, the tax policy, the loyalty of each vassal
// (who may pay late, pay short or withhold entirely) and plain luck. The AI simulator changes
// the inputs (statuses, prosperity, obligations, projects); this engine settles the books.
import { evaluateRules } from './rules.js';
import { RESOURCES, REGION_PROFILE, HOLDING_RESOURCES, POPULATION, POPULATION_DEFAULTS, TRIBUTE_SHARE, TAX_LEVELS, RESOURCE_VALUE } from '../../data/economy.js';
import { random } from '../engine/rng.js';
import { forces, sworn as swornOf } from '../engine/parties.js';
import { ECONOMY } from '../../data/balance.js';
import { lendersTick } from '../engine/economy/lenders.js';
import { distributePopulation, holdingRevenue, householdCost, wagesOf, crownLoans, interestOf, labourFactor } from '../engine/economy/ledger.js';

const MINES = new Set(['gold', 'silver', 'iron']);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (a, b) => a + random() * (b - a);
const gauss = () => (random() + random() + random() - 1.5) / 1.5; // ~[-1,1]

export const SEASONS = {
  summer: { label: 'Summer', food: 1.0, north: 0.9, note: 'Fields are full.' },
  autumn: { label: 'Autumn', food: 0.8, north: 0.55, note: 'The harvest is gathered. Maesters watch for white ravens.' },
  winter: { label: 'Winter', food: 0.25, north: 0.05, note: 'Nothing grows. Stores are everything.' },
  spring: { label: 'Spring', food: 0.65, north: 0.4, note: 'The thaw. Planting begins.' },
};

export function initEconomy(state) {
  state.world = state.world || { season: 'summer', seasonNote: 'The long summer of nine years is waning. The Citadel has not yet sent the white ravens.' };
  state.projects = state.projects || [];
  for (const h of Object.values(state.holdings)) {
    if (h.population == null) h.population = POPULATION[h.id] ?? POPULATION_DEFAULTS[h.type] ?? 10000;
    if (!h.resources) {
      const base = { ...(REGION_PROFILE[h.region] || {}) };
      for (const [k, v] of Object.entries(HOLDING_RESOURCES[h.id] || {})) base[k] = (base[k] || 0) + v;
      h.resources = base;
    }
    h.fort = h.fort ?? (h.type === 'great_castle' ? 4 : h.type === 'fortress' ? 4 : h.type === 'city' ? 3 : h.type === 'camp' || h.type === 'ruin' ? 0 : 2);
    h.buildings = h.buildings || [];
  }
  for (const house of Object.values(state.houses)) {
    if (house.levyCap == null) {
      // What the lands can bear in peacetime: anchored to the scenario's lore figure, then driven by population & prosperity
      house.levyCap = Number(house.figures?.levies?.v) || 0;
      house.popBase = Object.values(state.holdings).filter((x) => x.owner === house.id).reduce((a, x) => a + x.population, 0) || 1;
    }
    house.policy = house.policy || { tax: 'normal' };
    house.obligations = house.obligations || { tribute: house.liege ? 'paying' : 'none', levies: 'not_called' };
    house.ledger = house.ledger || [];
  }
  // Scenario flavour: the crown's debts, the Watch's poverty
  if (state.houses.nights_watch) state.houses.nights_watch.obligations.tribute = 'none';
  // A few known discontents
  if (state.houses.dustin) state.houses.dustin.obligations.tribute = 'late';
  if (state.houses.greyjoy) state.houses.greyjoy.obligations.tribute = 'late';
  economyV2(state);
  return state;
}

/**
 * The economy of the books (06; WP C1), once per save: the realm's people as §4 counts them, the Crown's debts as §7
 * lists them, and — for a new game — the coin of §5.2. An older save keeps its coin; its people grow to the new count
 * and each house's measure of what its lands can bear grows with them.
 */
export function economyV2(state) {
  if (state.economy?.v >= 2) return state;
  const fresh = !(state.meta?.turn > 0);
  const before = Object.fromEntries(Object.keys(state.houses).map((id) => [id, Object.values(state.holdings).filter((x) => x.owner === id).reduce((a, x) => a + (x.population || 0), 0)]));
  distributePopulation(state);
  for (const house of Object.values(state.houses)) {
    const now = Object.values(state.holdings).filter((x) => x.owner === house.id).reduce((a, x) => a + (x.population || 0), 0);
    if (house.popBase) house.popBase = Math.max(1, Math.round(house.popBase * (now / Math.max(1, before[house.id] || now))));
    if (fresh && ECONOMY.start[house.id]) house.figures.treasury = { ...(house.figures.treasury || {}), v: ECONOMY.start[house.id].coin };
  }
  const crown = Object.values(state.houses).find((h) => h.rank === 'crown');
  const loans = crown && (fresh || Number(crown.figures?.debt?.v) >= 5e6) ? crownLoans(crown.id) : [];
  state.economy = { v: 2, loans };
  if (crown && loans.length) crown.figures.debt = { ...(crown.figures.debt || {}), v: loans.reduce((n, l) => n + l.amount, 0) };
  return state;
}

function holdingFactor(state, h) {
  let f = (h.prosperity / 60) * (1 - h.unrest / 160);
  if (h.status === 'besieged') f *= 0.3; else if (h.status === 'sacked') f *= 0.1; else if (h.status === 'burning') f *= 0.2; else if (h.status === 'occupied') f *= 0.55; else if (h.status === 'rising') f *= 0.35;
  return Math.max(0, f);
}

function seasonFood(state, region) {
  const s = SEASONS[state.world?.season || 'summer'];
  return region === 'north' || region === 'wall' || region === 'beyond' ? s.north : region === 'essos' || region === 'dorne' ? Math.max(0.6, s.food) : s.food;
}

/** Gross monthly yield of one holding (before the lord's share, taxes, luck). */
/** Trade multiplier for a house from its pacts: trade agreements help, embargoes hurt (both ways). */
export function tradeModifier(state, houseId) {
  let m = 1;
  const top = (id) => { let h = state.houses[id], g = 0; while (h?.liege && state.houses[h.liege] && g++ < 8 && h.rank !== 'paramount') h = state.houses[h.liege]; return h?.id; };
  const mine = new Set([houseId, top(houseId)]);
  for (const p of state.pacts || []) {
    if (p.status !== 'active') continue;
    const involved = mine.has(p.a) || mine.has(p.b);
    if (!involved) continue;
    if (p.type === 'trade') m += 0.1;
    if (p.type === 'embargo') m -= 0.18;
  }
  // war with a neighbour chokes the roads and ports
  const wars = (state.wars || []).filter((w) => w.status !== 'ended' && [...w.attackers, ...w.defenders].some((x) => mine.has(x))).length;
  m -= Math.min(0.3, wars * 0.1);
  return Math.max(0.3, Math.min(1.5, m));
}

export function holdingYield(state, h) {
  const owner = state.houses[h.owner];
  const trade = state.__tradeMods?.[h.owner] ?? tradeModifier(state, h.owner);
  const labour = state.__labour?.[h.owner] ?? labourFactor(state, h.owner);
  return holdingRevenue(state, h, { tax: owner?.policy?.tax || 'normal', trade, labour });
}

export function armyUpkeep(a) {
  const F = ECONOMY.field;
  if (a.kind === 'fleet') {
    const reavers = /ironborn|reaver|longship/i.test(a.composition || '');
    const perShip = reavers ? F.longship : F.ship; // ironborn crews live off the sea and the iron price
    return (a.ships || 0) * perShip * (a.at && !a.march ? F.shipLaidUp : 1);
  }
  // Levies are the lord's own smallfolk, called from their fields: they cost food and a little coin (06 §6.2), and the
  // fields they left (the labour factor). Sworn houses feed their own contingents; men-at-arms are paid; sellswords
  // are paid dearly. A garrison sits on its own stores.
  const sell = /sellsword|company|mercenar/i.test(a.composition || '') || /company/i.test(a.name || '');
  const sworn = swornOf(a).reduce((x, [, y]) => x + y, 0);
  const own = Math.max(0, a.men - Math.min(a.men, sworn));
  const paid = /men-at-arms|household|knights|guard|gold cloak/i.test(a.composition || '') && !/levies/i.test(a.composition || '');
  const each = sell ? (/horse|riders|cavalry/i.test(a.composition || '') ? F.sellswordHorse : F.sellswordFoot) : paid ? F.manAtArmsFood : F.levy;
  return own * each * (a.kind === 'garrison' ? 0.5 : 1);
}

function houseHoldings(state, id) { return Object.values(state.holdings).filter((x) => x.owner === id); }

/** The share of a sworn lord's revenue his liege takes, by the liege's rank (06 §5.1). */
const tributeShare = (liege) => ECONOMY.tribute[liege?.rank] ?? 0.2;
/** Debt a house owes beyond its named loans (a shortfall borrowed to pay its way), and what it costs a moon. */
const looseDebt = (state, id, f) => Math.max(0, (Number(f.debt?.v) || 0) - (state.economy?.loans || []).filter((l) => l.debtor === id).reduce((n, l) => n + l.amount, 0));

/** Expected monthly figures for a house (used for projections in the UI and the prompt). */
export function project(state, houseId) {
  const house = state.houses[houseId]; if (!house) return null;
  const revenueOf = (id) => houseHoldings(state, id).reduce((s, h) => s + holdingYield(state, h).total, 0);
  const own = revenueOf(houseId);
  let tribute = 0; const vassals = [];
  for (const v of Object.values(state.houses)) {
    if (v.liege !== houseId) continue;
    const vg = revenueOf(v.id); const share = tributeShare(house);
    const st = v.obligations?.tribute || 'paying';
    const exp = st === 'paying' ? vg * share : st === 'reduced' ? vg * share * 0.5 : st === 'late' ? vg * share * 0.4 : 0;
    tribute += exp; vassals.push({ id: v.id, expected: Math.round(exp), status: st });
  }
  const armies = forces(state).filter((a) => a.owner === houseId);
  const upkeep = armies.reduce((s, a) => s + armyUpkeep(a), 0);
  const alms = almsFor(state).find((x) => x.id === houseId)?.amount || 0;
  const household = wagesOf(houseId, house) + alms;
  const court = householdCost(state, houseId);
  const it = interestOf(state, houseId);
  const interest = it.coin + looseDebt(state, houseId, house.figures) * ECONOMY.shortfallRate / 12;
  const projects = (state.projects || []).filter((p) => p.house === houseId && p.status === 'active').reduce((s, p) => s + p.perMonth, 0);
  const liege = house.liege ? state.houses[house.liege] : null;
  const owed = liege && (house.obligations?.tribute === 'paying') ? own * tributeShare(liege) : 0;
  const income = own + tribute + it.received + (houseId === 'nights_watch' ? almsFor(state).reduce((a, x) => a + x.amount, 0) : 0);
  const expenses = upkeep + household + court + interest + projects + owed;
  return { own: Math.round(own), tribute: Math.round(tribute), vassals, upkeep: Math.round(upkeep), household: Math.round(household), court: Math.round(court), interest: Math.round(interest), accrues: Math.round(it.accrues), projects: Math.round(projects), owed: Math.round(owed), income: Math.round(income), expenses: Math.round(expenses), net: Math.round(income - expenses), low: Math.round(income * 0.8 - expenses), high: Math.round(income * 1.15 - expenses) };
}

/**
 * Settle the books for `days`. Returns the list of notable economic happenings (for the chronicle feed).
 */
export function settle(state, days) {
  const months = days / 30;
  const notes = [];
  const ord = (n) => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');
  const date = state.meta?.date ? `${state.meta.date.day} ${ord(state.meta.date.month)} moon, ${state.meta.date.year} AC` : '';
  // 0. The lenders: loans due are called, called debts not repaid are defaults (engine/economy/lenders.js)
  notes.push(...lendersTick(state));
  // 1. Gross incomes with luck per holding
  state.__tradeMods = Object.fromEntries(Object.keys(state.houses).map((id) => [id, tradeModifier(state, id)]));
  state.__labour = Object.fromEntries(Object.keys(state.houses).map((id) => [id, labourFactor(state, id)]));
  const gross = {}; const detail = {};
  for (const house of Object.values(state.houses)) { gross[house.id] = 0; detail[house.id] = []; }
  for (const h of Object.values(state.holdings)) {
    if (!state.houses[h.owner]) continue;
    const y = holdingYield(state, h);
    let luck = 1 + gauss() * 0.22;
    // occasional windfalls and misfortunes
    const roll = random();
    let why = '';
    if (roll < 0.03 * months) { luck *= 0.45; why = pick(['blight in the fields', 'a fire in the granary', 'outlaws on the roads', 'a sickness among the smallfolk', 'a storm wrecked the fishing boats']); }
    else if (roll > 1 - 0.03 * months) { luck *= 1.5; why = pick(['a bumper harvest', 'a rich market season', 'a new vein in the mines', 'fat herring shoals', 'a great fair drew merchants']); }
    const v = y.total * luck * months;
    gross[h.owner] += v;
    detail[h.owner].push({ label: h.name, amount: Math.round(v), note: why });
    if (why && state.houses[h.owner]) notes.push({ house: h.owner, holding: h.id, text: `${h.name}: ${why}.` });
  }
  // 2. Per house: taxes, tribute up the chain, expenses
  const ledgers = {};
  for (const house of Object.values(state.houses)) {
    const lines = [];
    const own = gross[house.id]; // the taxes are in the rents (06 §5.1)
    if (own) lines.push({ kind: 'income', label: 'Rents, trade & mines of your lands', amount: Math.round(own), detail: detail[house.id] });
    ledgers[house.id] = { lines, own };
  }
  for (const v of Object.values(state.houses)) {
    const liege = v.liege ? state.houses[v.liege] : null; if (!liege || !ledgers[liege.id]) continue;
    // Remitted dues (forgiven or halved by the liege) run for a year, then revert
    if (v.obligations?.tributeUntil && state.meta?.date && state.meta.date.year * 12 + state.meta.date.month >= v.obligations.tributeUntil) { v.obligations.tribute = 'paying'; delete v.obligations.tributeUntil; notes.push({ house: liege.id, text: `House ${v.name}'s remitted dues have run their course; full tribute is owed again.` }); }
    const st = v.obligations?.tribute || 'paying';
    const share = tributeShare(liege);
    const ltax = TAX_LEVELS[liege.policy?.tax || 'normal'];
    let rel = 0; try { rel = state.relations[(v.id < liege.id ? `${v.id}|${liege.id}` : `${liege.id}|${v.id}`)]?.v ?? 0; } catch { /* */ }
    let comply = st === 'paying' ? rnd(0.85, 1.05) : st === 'reduced' ? rnd(0.45, 0.55) : st === 'late' ? (random() < 0.35 ? rnd(0.8, 1.6) : 0) : 0;
    if (st === 'paying' && rel < -30) comply *= rnd(0.5, 0.9);
    const due = (ledgers[v.id]?.own || 0) * share;
    const paid = Math.max(0, due * comply);
    const note = st === 'withholding' ? 'withheld' : st === 'forgiven' ? 'forgiven this year' : st === 'reduced' ? 'halved by your grace' : st === 'late' ? (paid > 0 ? 'arrears paid' : 'late — nothing arrived') : paid < due * 0.8 ? 'paid short' : '';
    if (due > 1 || st !== 'paying') {
      ledgers[liege.id].lines.push({ kind: 'income', label: `Tribute — House ${v.name}`, amount: Math.round(paid), expected: Math.round(due), note, vassal: v.id });
      ledgers[v.id].lines.push({ kind: 'expense', label: `Tribute to House ${liege.name}`, amount: Math.round(paid), note });
    }
    if (st === 'withholding' && due > 50) notes.push({ house: liege.id, text: `House ${v.name} withholds its dues from House ${liege.name}.` });
    // tax pressure sours vassals
    if (ltax.opinion) {
      const k = v.id < liege.id ? `${v.id}|${liege.id}` : `${liege.id}|${v.id}`;
      const cur = state.relations[k]?.v ?? 0;
      state.relations[k] = { ...(state.relations[k] || { note: '' }), v: clamp(Math.round(cur + ltax.opinion * months * 0.5), -100, 100) };
    }
  }
  for (const house of Object.values(state.houses)) {
    const L = ledgers[house.id]; const f = house.figures;
    if (['tribe', 'exile', 'company'].includes(house.rank)) { house.ledger = []; continue; } // they live by raid, patron or contract — the story decides
    const armies = forces(state).filter((a) => a.owner === house.id);
    const upkeep = armies.reduce((s, a) => s + armyUpkeep(a), 0) * months;
    if (upkeep) L.lines.push({ kind: 'expense', label: 'Hosts & fleets in the field', amount: Math.round(upkeep), detail: armies.map((a) => ({ label: a.name, amount: Math.round(armyUpkeep(a) * months) })) });
    const household = wagesOf(house.id, house) * months; // sworn brothers take a pittance
    if (household) L.lines.push({ kind: 'expense', label: 'Men-at-arms & household guard', amount: Math.round(household) });
    const court = householdCost(state, house.id) * months * rnd(0.9, 1.1);
    L.lines.push({ kind: 'expense', label: 'Court, feasts & household', amount: Math.round(court) });
    // the named loans (06 §7): a lender's interest paid in coin, or — a great house's loan — added to the debt; and any
    // shortfall borrowed to pay the house's way, at the moneylenders' rate
    const it = interestOf(state, house.id);
    const interest = (it.coin + looseDebt(state, house.id, f) * ECONOMY.shortfallRate / 12) * months;
    if (interest) L.lines.push({ kind: 'expense', label: 'Interest on debts', amount: Math.round(interest) });
    if (it.received) L.lines.push({ kind: 'income', label: 'Interest owed to you, paid', amount: Math.round(it.received * months) });
    if (it.accrues) {
      for (const l of (state.economy?.loans || []).filter((x) => x.debtor === house.id && x.pays === 'accrues')) l.amount = Math.round(l.amount * (1 + l.rate / 12 * months));
      f.debt = { ...(f.debt || {}), v: Math.round((Number(f.debt?.v) || 0) + it.accrues * months) };
    }
    // The Night's Watch lives on the alms of the realm; friendly great houses send coin and grain north
    if (house.id === 'nights_watch' || (state.houses.nights_watch && ['crown', 'paramount'].includes(house.rank))) {
      if (house.id === 'nights_watch') {
        const alms = almsFor(state).reduce((a, x) => a + x.amount, 0) * months;
        if (alms) L.lines.push({ kind: 'income', label: 'Alms & grain from the realm', amount: Math.round(alms), detail: almsFor(state).map((x) => ({ label: `House ${state.houses[x.id].name}`, amount: Math.round(x.amount * months) })) });
      } else {
        const mine = almsFor(state).find((x) => x.id === house.id);
        if (mine) L.lines.push({ kind: 'expense', label: 'Alms to the Night\'s Watch', amount: Math.round(mine.amount * months) });
      }
    }
    // projects
    for (const p of (state.projects || []).filter((x) => x.house === house.id && x.status === 'active')) {
      const spend = Math.min(p.remaining, p.perMonth * months);
      p.remaining -= spend; p.monthsLeft = Math.max(0, p.monthsLeft - months);
      L.lines.push({ kind: 'expense', label: `Project: ${p.name}`, amount: Math.round(spend) });
      if (p.monthsLeft <= 0.01) { p.status = 'complete'; completeProject(state, p); notes.push({ house: house.id, text: `${p.name} is complete.`, important: true }); }
    }
    // ── Customs of this realm that the engine did not ship with ──────────────────────────────
    // Whatever the Weaver has invented for this house — smuggling rings, informant networks, a
    // tavern tax, tithes to a red priest, a blood-magic cult's demands — is evaluated here and
    // carries its own line in the steward's accounts, capped so the story cannot mint gold.
    const woven = evaluateRules(state, house, { months, luck: 1 + gauss() * 0.18, gross: gross[house.id] || 0 });
    for (const line of woven.lines) L.lines.push(line);
    for (const n of woven.notes) notes.push(n);
    for (const c of woven.capped) notes.push({ house: house.id, text: `${c.rule} would have brought ${c.wanted.toLocaleString()} this moon; the realm could bear only ${c.cap.toLocaleString()}.` });
    if (woven.unrest || woven.prosperity) {
      for (const h of houseHoldings(state, house.id)) {
        if (woven.unrest) h.unrest = clamp(Math.round(h.unrest + woven.unrest), 0, 100);
        if (woven.prosperity) h.prosperity = clamp(Math.round((h.prosperity + woven.prosperity) * 10) / 10, 0, 100);
      }
    }

    const income = L.lines.filter((l) => l.kind === 'income').reduce((s, l) => s + l.amount, 0);
    const expense = L.lines.filter((l) => l.kind === 'expense').reduce((s, l) => s + l.amount, 0);
    let treasury = (Number(f.treasury?.v) || 0) + income - expense;
    let borrowed = 0;
    if (treasury < 0) { borrowed = -treasury; treasury = 0; f.debt = { ...(f.debt || {}), v: Math.round((f.debt?.v || 0) + borrowed), asOf: date, src: 'Ledger', confidence: 'reported' }; L.lines.push({ kind: 'income', label: 'Borrowed to cover the shortfall', amount: Math.round(borrowed) }); if (borrowed > 500) notes.push({ house: house.id, text: `House ${house.name} had to borrow ${Math.round(borrowed).toLocaleString()} dragons to pay its way.` }); }
    const steward = stewardOf(state, house.id);
    const src = steward ? `${steward.name}'s accounts` : 'Ledger';
    const prev = f.treasury?.v || 0;
    f.treasury = { v: Math.round(treasury), asOf: date, src, confidence: 'reported' };
    f.income = { v: Math.round((income - expense - borrowed) / Math.max(0.25, months)), asOf: date, src, confidence: 'reported' };

    // food stores (nomads, sellswords and exiles live off the land or their paymasters)
    const hs = houseHoldings(state, house.id);
    const nomad = ['tribe', 'company', 'exile'].includes(house.rank);
    const pop = hs.reduce((s, h) => s + h.population, 0) / 10000;
    const soldiers = armies.filter((a) => a.kind !== 'fleet').reduce((s, a) => s + a.men, 0) / 10000;
    const cons = Math.max(0.05, pop * 0.9 + soldiers * 1.3);
    const prod = hs.reduce((s, h) => { const r = h.resources || {}; return s + (h.population / 10000) * ((r.grain || 0) * 0.8 + (r.fish || 0) * 0.5 + (r.horses || 0) * 0.1 + 0.45) * holdingFactor(state, h) * seasonFood(state, h.region) * rnd(0.8, 1.15); }, 0);
    const levyDrain = 1 - (state.__labour?.[house.id] ?? 1); // men in the field don't till fields (06 §5.1)
    const aid = house.id === 'nights_watch' ? (almsFor(state).length ? Math.min(1.1, 0.85 + 0.15 * almsFor(state).length) : 0) * cons : 0; // grain carts up the kingsroad
    const stores = aid * months + (Number(f.food?.v) || 0) * cons + (prod * (1 - levyDrain) - cons) * months;
    // a woven custom may feed the house or eat it (a smuggler's grain, a cult's sacrifices)
    if (!nomad) f.food = { v: Math.round(clamp(stores / cons + woven.food, 0, 96) * 10) / 10, asOf: date, src, confidence: 'reported' };
    // A prudent steward buys grain when the stores run low — dear in winter, impossible under embargo or siege
    if (!nomad && f.food.v < 4 && cons > 0.05) {
      const sieged = hs.some((h) => h.id === house.seat && /besieg/.test(h.status || ''));
      const price = 320 * (state.world?.season === 'winter' ? 2.2 : state.world?.season === 'autumn' ? 1.4 : 1) / Math.max(0.3, tradeModifier(state, house.id));
      const want = Math.min(4 - f.food.v, 2 * months);
      const afford = Math.floor((f.treasury.v * 0.5) / (cons * price) * 10) / 10;
      const buy = sieged ? 0 : Math.min(want, afford);
      if (buy >= 0.3) {
        const cost = Math.round(buy * cons * price);
        f.treasury.v -= cost; f.food.v = Math.round((f.food.v + buy) * 10) / 10;
        L.lines.push({ kind: 'expense', label: 'Grain bought from merchants', amount: cost, note: `${buy.toFixed(1)} moons of stores` });
        notes.push({ house: house.id, text: `The steward of House ${house.name} bought ${buy.toFixed(1)} moons of grain for ${cost.toLocaleString()} dragons.` });
      }
    }
    if (!nomad && f.food.v < 2 && pop > 0.3) notes.push({ house: house.id, text: `Hunger stalks the lands of House ${house.name}. The granaries are nearly empty.`, important: true });
    // Empty granaries kill: the smallfolk starve and riot, and hungry soldiers desert
    if (!nomad && f.food.v <= 0.05 && stores < 0) {
      const short = Math.min(1, -stores / Math.max(0.01, cons * months)); // share of needs unmet
      for (const h of hs) { h.population = Math.round(h.population * (1 - 0.03 * short * months)); h.unrest = clamp(Math.round(h.unrest + 10 * short * months), 0, 100); h.prosperity = clamp(Math.round(h.prosperity - 3 * short * months), 0, 100); }
      let deserted = 0;
      for (const a of armies) if (a.kind !== 'fleet') { const d = Math.round(a.men * 0.08 * short * months); a.men -= d; deserted += d; a.morale = clamp((a.morale ?? 70) - 10 * short, 0, 100); }
      notes.push({ house: house.id, text: `Famine in the lands of House ${house.name}: the old and the young die first, the villages riot${deserted ? `, and ${deserted.toLocaleString()} hungry soldiers desert` : ''}.`, important: true });
    }

    // levies regenerate toward what the land can bear
    const raised = armies.filter((a) => !['fleet', 'garrison'].includes(a.kind)).reduce((s, a) => s + a.men, 0);
    const popNow = hs.reduce((a, h) => a + h.population, 0);
    const condition = hs.length ? hs.reduce((a, h) => a + clamp(h.prosperity / 60, 0.3, 1.3) * (1 - h.unrest / 200) * h.population, 0) / Math.max(1, popNow) : 0;
    const potential = (house.levyCap || 0) * (popNow / (house.popBase || popNow || 1)) * condition;
    const cur = Number(f.levies?.v) || 0;
    const target = Math.max(0, potential - raised);
    const nv = cur + (target - cur) * clamp(0.12 * months, 0, 1);
    const nv2 = nv + woven.levies * months; // sworn swords a woven custom brings in (or costs)
    if (Math.abs(nv2 - cur) >= 1) f.levies = { v: Math.max(0, Math.round(nv2)), asOf: date, src: f.levies?.src || src, confidence: 'estimate' };
    // why it moves: shown with the figure, so a drift of a few men a day is never a mystery
    if (f.levies) f.levies.why = { bear: Math.round(potential), raised, condition: Math.round(condition * 100) };

    // holdings drift: unrest & prosperity
    const tax = TAX_LEVELS[house.policy?.tax || 'normal'];
    for (const h of hs) {
      h.unrest = clamp(Math.round(h.unrest + (tax.unrest - (h.unrest > 10 ? 1 : 0)) * months + gauss() * 1.5), 0, 100);
      const warHere = ['besieged', 'sacked', 'burning', 'occupied'].includes(h.status);
      const drift = warHere ? -4 : (60 - h.prosperity) * 0.03 + (levyDrain > 0.15 ? -1.2 : 0.2) - (h.unrest > 50 ? 1 : 0);
      h.prosperity = clamp(Math.round((h.prosperity + drift * months + gauss()) * 10) / 10, 0, 100);
    }

    const entry = { turn: (state.meta?.turn || 0), date, days, lines: L.lines, income, expense, net: income - expense, treasury: f.treasury.v, prevTreasury: prev, food: f.food.v, reporter: steward?.name || null };
    house.ledger = [...(house.ledger || []), entry].slice(house.id === state.meta?.player ? -24 : -2);
  }
  delete state.__tradeMods; delete state.__labour;
  return notes;
}

function completeProject(state, p) {
  const h = state.houses[p.house]; if (!h) return;
  const e = p.effect || {};
  if (e.intel) h.intel = (h.intel || 0) + e.intel; // rookeries: news travels to this house faster
  for (const [k, v] of Object.entries(e.figures || {})) {
    if (!h.figures[k]) continue; h.figures[k] = { ...h.figures[k], v: Math.max(0, Math.round((Number(h.figures[k].v) || 0) + v)), src: `Completed: ${p.name}` };
  }
  const hold = p.holding ? state.holdings[p.holding] : null;
  if (hold) {
    if (e.prosperity) hold.prosperity = clamp(hold.prosperity + e.prosperity, 0, 100);
    if (e.fort) hold.fort = clamp((hold.fort || 0) + e.fort, 0, 6);
    if (e.population) hold.population = Math.round(hold.population * (1 + e.population));
    if (e.unrest) hold.unrest = clamp(hold.unrest + e.unrest, 0, 100);
    if (e.building) hold.buildings = [...new Set([...(hold.buildings || []), e.building])];
    if (e.resource) hold.resources[e.resource.type] = (hold.resources[e.resource.type] || 0) + e.resource.amount;
    if (e.garrison) hold.garrison = (hold.garrison || 0) + e.garrison;
  }
}

export function stewardOf(state, houseId) {
  const cs = Object.values(state.characters).filter((c) => c.house === houseId && c.alive);
  return cs.find((c) => c.roles?.includes('steward')) || cs.find((c) => c.roles?.includes('maester')) || null;
}

function pick(a) { return a[Math.floor(random() * a.length)]; }

// Standard works a lord can pour money into directly from the Economy window
export const PROJECT_TEMPLATES = [
  { key: 'warships', name: 'Build warships', icon: '⛵', cost: 4500, months: 4, per: 10, effect: { figures: { ships: 10 } }, needs: (h) => h.coastal, desc: 'Ten war galleys from your shipwrights. Needs timber and a port.' },
  { key: 'granaries', name: 'Fill and expand the granaries', icon: '🌾', cost: 6000, months: 3, effect: { prosperity: 3, building: 'Great granaries' }, desc: 'Buy grain and build storehouses against the winter.' },
  { key: 'walls', name: 'Strengthen the walls', icon: '🏰', cost: 12000, months: 6, effect: { fort: 1, building: 'Strengthened walls' }, desc: 'Thicker curtain walls, new towers, deeper moat.' },
  { key: 'roads', name: 'Repair roads & bridges', icon: '🛤', cost: 5000, months: 4, effect: { prosperity: 6 }, desc: 'Faster trade and marching.' },
  { key: 'market', name: 'Charter a market & fair', icon: '⚖', cost: 7000, months: 5, effect: { prosperity: 5, resource: { type: 'trade', amount: 0.3 }, building: 'Chartered market' }, desc: 'Draws merchants. More coin in the long run.' },
  { key: 'men_at_arms', name: 'Train men-at-arms', icon: '🛡', cost: 9000, months: 4, effect: { figures: { menAtArms: 300 } }, desc: '300 armoured, drilled soldiers in your pay.' },
  { key: 'sept', name: 'Endow a sept / godswood', icon: '🕯', cost: 3000, months: 2, effect: { unrest: -12, building: 'Endowed sept' }, desc: 'Piety calms the smallfolk.' },
  { key: 'rookery', name: 'Raise a rookery and a maester\'s tower', icon: '🐦', cost: 2500, months: 2, effect: { building: 'Rookery', intel: 1 }, desc: 'More ravens, trained to more castles: word of distant hosts reaches you sooner and surer.' },
  { key: 'harbour', name: 'Deepen the harbour and build wharves', icon: '⚓', cost: 8000, months: 5, effect: { prosperity: 4, resource: { type: 'trade', amount: 0.35 }, building: 'Deep harbour' }, needs: (h) => h.coastal, desc: 'Bigger ships can put in: more trade, more tolls.' },
  { key: 'barracks', name: 'Build barracks for the garrison', icon: '🏚', cost: 4000, months: 3, effect: { garrison: 200, building: 'Barracks' }, desc: 'Room and arms for two hundred more men on the walls.' },
  { key: 'smithy', name: 'Endow smithies and an armoury', icon: '⚒', cost: 5000, months: 3, effect: { figures: { menAtArms: 100 }, prosperity: 2, building: 'Armoury' }, desc: 'Steel for your men-at-arms, and a hundred more to wield it.' },
  { key: 'stables', name: 'Breed horses: new stables and studs', icon: '🐎', cost: 4500, months: 6, effect: { resource: { type: 'horses', amount: 0.3 }, building: 'Stud farms' }, desc: 'Destriers and coursers: cavalry for your hosts, horses to sell.' },
  { key: 'inn', name: 'Build inns and a toll bridge on the road', icon: '🍺', cost: 3500, months: 3, effect: { prosperity: 3, resource: { type: 'trade', amount: 0.15 }, building: 'Road inns & toll bridge' }, desc: 'Travellers stop, pay and talk: tolls, and news.' },
  { key: 'almshouse', name: 'Found an almshouse and a hospice', icon: '🕯', cost: 2000, months: 2, effect: { unrest: -8, prosperity: 1, building: 'Almshouse' }, desc: 'Bread for the poor and care for the sick; the smallfolk remember.' },
  { key: 'mines', name: 'Open new mine shafts', icon: '⛏', cost: 15000, months: 8, effect: { resource: { type: 'iron', amount: 0.4 }, building: 'New mine shafts' }, desc: 'Iron from the hills (gold if the gods are kind).' },
];
export { RESOURCES, TAX_LEVELS };

// Which great houses send alms north, and how much (a moon's worth). Friendship with the Watch opens purses.
export function almsFor(state) {
  const nw = state.houses.nights_watch; if (!nw) return [];
  const out = [];
  for (const h of Object.values(state.houses)) {
    if (!['crown', 'paramount'].includes(h.rank) || h.id === 'nights_watch') continue;
    const k = h.id < 'nights_watch' ? `${h.id}|nights_watch` : `nights_watch|${h.id}`;
    const rel = state.relations[k]?.v ?? 0;
    if (rel < 25 || (Number(h.figures.treasury?.v) || 0) < 500) continue;
    out.push({ id: h.id, amount: Math.round((h.region === 'north' ? 120 : 50) * (rel / 50)) });
  }
  return out;
}

// The long seasons of Westeros. The Citadel's white ravens announce each turn; nobody knows how long they will last.
// Minimum and typical lengths in days (the long summer of 298 has already lasted nine years).
const SEASON_CLOCK = {
  summer: { next: 'autumn', min: 60, mean: 300, note: 'The Citadel has sent forth the white ravens: summer is ended. The maesters counsel lords to fill their granaries.' },
  autumn: { next: 'winter', min: 240, mean: 540, note: 'White ravens fly from Oldtown: winter has come. In the North the snows are already deep.' },
  winter: { next: 'spring', min: 360, mean: 900, note: 'The white ravens fly again: spring has come at last. The thaw begins; planting can start.' },
  spring: { next: 'summer', min: 240, mean: 540, note: 'The Conclave declares that summer has come. The fields are green.' },
};
/** Advance the season clock by `days`. Returns a note if the season turned. */
export function seasonTick(state, days) {
  const w = state.world = state.world || {};
  const cur = w.season || 'summer'; const c = SEASON_CLOCK[cur]; if (!c) return null;
  // under Canon gravity the Citadel's white ravens of 299 and 300 are beats of the story (data/beats.js `omens`)
  if ((state.meta?.settings?.canonGravity || 'canon') === 'canon' && (state.meta?.date?.year ?? 0) <= 300 && ['summer', 'autumn'].includes(cur)) return null;
  w.seasonDays = (w.seasonDays || 0) + days;
  if (w.seasonDays < c.min) return null;
  const pTurn = 1 - Math.exp(-days / Math.max(30, c.mean - c.min));
  if (random() >= pTurn) return null;
  w.season = c.next; w.seasonDays = 0; w.seasonNote = c.note;
  return { season: c.next, text: c.note };
}
