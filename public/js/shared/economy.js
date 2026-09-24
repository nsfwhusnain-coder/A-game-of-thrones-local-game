// The ledger engine. Nothing here is a fixed "+500 per turn": every yield depends on population,
// prosperity, unrest, the season, sieges and raids, the tax policy, the loyalty of each vassal
// (who may pay late, pay short or withhold entirely) and plain luck. The AI simulator changes
// the inputs (statuses, prosperity, obligations, projects); this engine settles the books.
import { RESOURCES, REGION_PROFILE, HOLDING_RESOURCES, POPULATION, POPULATION_DEFAULTS, TRIBUTE_SHARE, TAX_LEVELS, RESOURCE_VALUE } from '../../data/economy.js';

const MINES = new Set(['gold', 'silver', 'iron']);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (a, b) => a + Math.random() * (b - a);
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5; // ~[-1,1]

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
    house.policy = house.policy || { tax: 'normal' };
    house.obligations = house.obligations || { tribute: house.liege ? 'paying' : 'none', levies: 'not_called' };
    house.ledger = house.ledger || [];
  }
  // Scenario flavour: the crown's debts, the Watch's poverty
  if (state.houses.baratheon) state.houses.baratheon.policy.courtCost = 14000; // Robert's tourneys and feasts
  if (state.houses.nights_watch) state.houses.nights_watch.obligations.tribute = 'none';
  // A few known discontents
  if (state.houses.dustin) state.houses.dustin.obligations.tribute = 'late';
  if (state.houses.greyjoy) state.houses.greyjoy.obligations.tribute = 'late';
  return state;
}

function holdingFactor(state, h) {
  let f = (h.prosperity / 60) * (1 - h.unrest / 160);
  if (h.status === 'besieged') f *= 0.3; else if (h.status === 'sacked') f *= 0.1; else if (h.status === 'burning') f *= 0.2; else if (h.status === 'occupied') f *= 0.55;
  return Math.max(0, f);
}

function seasonFood(state, region) {
  const s = SEASONS[state.world?.season || 'summer'];
  return region === 'north' || region === 'wall' || region === 'beyond' ? s.north : region === 'essos' || region === 'dorne' ? Math.max(0.6, s.food) : s.food;
}

/** Gross monthly yield of one holding (before the lord's share, taxes, luck). */
export function holdingYield(state, h) {
  const pop10k = h.population / 10000;
  const lines = {};
  let total = pop10k * 45; // rents, fees, customary dues
  lines.rents = total;
  for (const [r, v] of Object.entries(h.resources || {})) {
    if (!v || !RESOURCE_VALUE[r]) continue;
    const y = MINES.has(r) ? v * RESOURCE_VALUE[r] * 8 : v * pop10k * RESOURCE_VALUE[r];
    lines[r] = y; total += y;
  }
  return { total: total * holdingFactor(state, h), lines };
}

export function armyUpkeep(a) {
  if (a.type === 'fleet') return (a.ships || 0) * 25 + a.men * 0.15;
  const sell = /sellsword|company|mercenar/i.test(a.composition || '') || /company/i.test(a.name || '');
  return a.men * (sell ? 1.6 : 0.4) * (a.status === 'garrison' ? 0.5 : 1);
}

function houseHoldings(state, id) { return Object.values(state.holdings).filter((x) => x.owner === id); }

/** Expected monthly figures for a house (used for projections in the UI and the prompt). */
export function project(state, houseId) {
  const house = state.houses[houseId]; if (!house) return null;
  const tax = TAX_LEVELS[house.policy?.tax || 'normal'];
  const own = houseHoldings(state, houseId).reduce((s, h) => s + holdingYield(state, h).total, 0) * 0.25 * tax.income;
  let tribute = 0; const vassals = [];
  for (const v of Object.values(state.houses)) {
    if (v.liege !== houseId) continue;
    const vg = houseHoldings(state, v.id).reduce((s, h) => s + holdingYield(state, h).total, 0) * 0.25;
    const share = TRIBUTE_SHARE[house.rank] ?? 0.2;
    const st = v.obligations?.tribute || 'paying';
    const exp = st === 'paying' ? vg * share * tax.income : st === 'late' ? vg * share * 0.4 : 0;
    tribute += exp; vassals.push({ id: v.id, expected: Math.round(exp), status: st });
  }
  const armies = Object.values(state.armies).filter((a) => a.owner === houseId);
  const upkeep = armies.reduce((s, a) => s + armyUpkeep(a), 0);
  const household = (house.figures.menAtArms?.v || 0) * 0.7 + (house.figures.guard?.v || 0) * 1.2;
  const court = house.policy?.courtCost ?? ({ crown: 6000, paramount: 1800, major: 300, minor: 60, city_state: 5000 }[house.rank] || 40);
  const interest = (house.figures.debt?.v || 0) * 0.004;
  const projects = (state.projects || []).filter((p) => p.house === houseId && p.status === 'active').reduce((s, p) => s + p.perMonth, 0);
  const liege = house.liege ? state.houses[house.liege] : null;
  const owed = liege && (house.obligations?.tribute === 'paying') ? own / tax.income * (TRIBUTE_SHARE[liege.rank] ?? 0.2) : 0;
  const income = own + tribute;
  const expenses = upkeep + household + court + interest + projects + owed;
  return { own: Math.round(own), tribute: Math.round(tribute), vassals, upkeep: Math.round(upkeep), household: Math.round(household), court: Math.round(court), interest: Math.round(interest), projects: Math.round(projects), owed: Math.round(owed), income: Math.round(income), expenses: Math.round(expenses), net: Math.round(income - expenses), low: Math.round(income * 0.75 - expenses), high: Math.round(income * 1.15 - expenses) };
}

/**
 * Settle the books for `days`. Returns the list of notable economic happenings (for the chronicle feed).
 */
export function settle(state, days) {
  const months = days / 30;
  const notes = [];
  const ord = (n) => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');
  const date = state.meta?.date ? `${state.meta.date.day} ${ord(state.meta.date.month)} moon, ${state.meta.date.year} AC` : '';
  // 1. Gross incomes with luck per holding
  const gross = {}; const detail = {};
  for (const house of Object.values(state.houses)) { gross[house.id] = 0; detail[house.id] = []; }
  for (const h of Object.values(state.holdings)) {
    if (!state.houses[h.owner]) continue;
    const y = holdingYield(state, h);
    let luck = 1 + gauss() * 0.22;
    // occasional windfalls and misfortunes
    const roll = Math.random();
    let why = '';
    if (roll < 0.03 * months) { luck *= 0.45; why = pick(['blight in the fields', 'a fire in the granary', 'outlaws on the roads', 'a sickness among the smallfolk', 'a storm wrecked the fishing boats']); }
    else if (roll > 1 - 0.03 * months) { luck *= 1.5; why = pick(['a bumper harvest', 'a rich market season', 'a new vein in the mines', 'fat herring shoals', 'a great fair drew merchants']); }
    const v = y.total * 0.25 * luck * months;
    gross[h.owner] += v;
    detail[h.owner].push({ label: h.name, amount: Math.round(v), note: why });
    if (why && state.houses[h.owner]) notes.push({ house: h.owner, holding: h.id, text: `${h.name}: ${why}.` });
  }
  // 2. Per house: taxes, tribute up the chain, expenses
  const ledgers = {};
  for (const house of Object.values(state.houses)) {
    const tax = TAX_LEVELS[house.policy?.tax || 'normal'];
    const lines = [];
    const own = gross[house.id] * tax.income;
    if (own) lines.push({ kind: 'income', label: 'Rents, taxes & yields of your lands', amount: Math.round(own), detail: detail[house.id].map((d) => ({ ...d, amount: Math.round(d.amount * tax.income) })) });
    ledgers[house.id] = { lines, own };
  }
  for (const v of Object.values(state.houses)) {
    const liege = v.liege ? state.houses[v.liege] : null; if (!liege || !ledgers[liege.id]) continue;
    const st = v.obligations?.tribute || 'paying';
    const share = TRIBUTE_SHARE[liege.rank] ?? 0.2;
    const ltax = TAX_LEVELS[liege.policy?.tax || 'normal'];
    let rel = 0; try { rel = state.relations[(v.id < liege.id ? `${v.id}|${liege.id}` : `${liege.id}|${v.id}`)]?.v ?? 0; } catch { /* */ }
    let comply = st === 'paying' ? rnd(0.85, 1.05) : st === 'late' ? (Math.random() < 0.35 ? rnd(0.8, 1.6) : 0) : 0;
    if (st === 'paying' && rel < -30) comply *= rnd(0.5, 0.9);
    const base = (ledgers[v.id]?.own || 0) / TAX_LEVELS[v.policy?.tax || 'normal'].income;
    const due = base * share * ltax.income;
    const paid = Math.max(0, due * comply);
    const note = st === 'withholding' ? 'withheld' : st === 'late' ? (paid > 0 ? 'arrears paid' : 'late — nothing arrived') : paid < due * 0.8 ? 'paid short' : '';
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
    const armies = Object.values(state.armies).filter((a) => a.owner === house.id);
    const upkeep = armies.reduce((s, a) => s + armyUpkeep(a), 0) * months;
    if (upkeep) L.lines.push({ kind: 'expense', label: 'Hosts & fleets in the field', amount: Math.round(upkeep), detail: armies.map((a) => ({ label: a.name, amount: Math.round(armyUpkeep(a) * months) })) });
    const household = ((f.menAtArms?.v || 0) * 0.7 + (f.guard?.v || 0) * 1.2) * months;
    if (household) L.lines.push({ kind: 'expense', label: 'Men-at-arms & household guard', amount: Math.round(household) });
    const court = (house.policy?.courtCost ?? ({ crown: 6000, paramount: 1800, major: 300, minor: 60, city_state: 5000 }[house.rank] || 40)) * months * rnd(0.85, 1.2);
    L.lines.push({ kind: 'expense', label: 'Court, feasts & household', amount: Math.round(court) });
    const interest = (f.debt?.v || 0) * 0.004 * months;
    if (interest) L.lines.push({ kind: 'expense', label: 'Interest on debts', amount: Math.round(interest) });
    // projects
    for (const p of (state.projects || []).filter((x) => x.house === house.id && x.status === 'active')) {
      const spend = Math.min(p.remaining, p.perMonth * months);
      p.remaining -= spend; p.monthsLeft = Math.max(0, p.monthsLeft - months);
      L.lines.push({ kind: 'expense', label: `Project: ${p.name}`, amount: Math.round(spend) });
      if (p.monthsLeft <= 0.01) { p.status = 'complete'; completeProject(state, p); notes.push({ house: house.id, text: `${p.name} is complete.`, important: true }); }
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
    const soldiers = armies.reduce((s, a) => s + a.men, 0) / 10000;
    const cons = Math.max(0.05, pop * 0.9 + soldiers * 1.3);
    const prod = hs.reduce((s, h) => { const r = h.resources || {}; return s + (h.population / 10000) * ((r.grain || 0) * 0.8 + (r.fish || 0) * 0.5 + (r.horses || 0) * 0.1 + 0.45) * holdingFactor(state, h) * seasonFood(state, h.region) * rnd(0.8, 1.15); }, 0);
    const levyDrain = Math.min(0.35, soldiers / Math.max(0.01, pop) * 3); // men in the field don't till fields
    const stores = (Number(f.food?.v) || 0) * cons + (prod * (1 - levyDrain) - cons) * months;
    if (!nomad) f.food = { v: Math.round(clamp(stores / cons, 0, 96) * 10) / 10, asOf: date, src, confidence: 'reported' };
    if (!nomad && f.food.v < 2 && pop > 0.3) notes.push({ house: house.id, text: `Hunger stalks the lands of House ${house.name}. The granaries are nearly empty.`, important: true });

    // levies regenerate toward what the land can bear
    const raised = armies.filter((a) => a.type !== 'fleet' && !/garrison/i.test(a.status || '')).reduce((s, a) => s + a.men, 0);
    const potential = hs.reduce((s, h) => s + h.population * 0.035 * clamp(h.prosperity / 60, 0.3, 1.4) * (1 - h.unrest / 200), 0);
    const cur = Number(f.levies?.v) || 0;
    const target = Math.max(0, potential - raised);
    const nv = cur + (target - cur) * clamp(0.12 * months, 0, 1);
    if (Math.abs(nv - cur) >= 1) f.levies = { v: Math.round(nv), asOf: date, src: f.levies?.src || src, confidence: 'estimate' };

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
  return notes;
}

function completeProject(state, p) {
  const h = state.houses[p.house]; if (!h) return;
  const e = p.effect || {};
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
  }
}

export function stewardOf(state, houseId) {
  const cs = Object.values(state.characters).filter((c) => c.house === houseId && c.alive);
  return cs.find((c) => c.roles?.includes('steward')) || cs.find((c) => c.roles?.includes('maester')) || null;
}

function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

// Standard works a lord can pour money into directly from the Economy window
export const PROJECT_TEMPLATES = [
  { key: 'warships', name: 'Build warships', icon: '⛵', cost: 4500, months: 4, per: 10, effect: { figures: { ships: 10 } }, needs: (h) => h.coastal, desc: 'Ten war galleys from your shipwrights. Needs timber and a port.' },
  { key: 'granaries', name: 'Fill and expand the granaries', icon: '🌾', cost: 6000, months: 3, effect: { prosperity: 3, building: 'Great granaries' }, desc: 'Buy grain and build storehouses against the winter.' },
  { key: 'walls', name: 'Strengthen the walls', icon: '🏰', cost: 12000, months: 6, effect: { fort: 1, building: 'Strengthened walls' }, desc: 'Thicker curtain walls, new towers, deeper moat.' },
  { key: 'roads', name: 'Repair roads & bridges', icon: '🛤', cost: 5000, months: 4, effect: { prosperity: 6 }, desc: 'Faster trade and marching.' },
  { key: 'market', name: 'Charter a market & fair', icon: '⚖', cost: 7000, months: 5, effect: { prosperity: 5, resource: { type: 'trade', amount: 0.3 }, building: 'Chartered market' }, desc: 'Draws merchants. More coin in the long run.' },
  { key: 'men_at_arms', name: 'Train men-at-arms', icon: '🛡', cost: 9000, months: 4, effect: { figures: { menAtArms: 300 } }, desc: '300 armoured, drilled soldiers in your pay.' },
  { key: 'sept', name: 'Endow a sept / godswood', icon: '🕯', cost: 3000, months: 2, effect: { unrest: -12, building: 'Endowed sept' }, desc: 'Piety calms the smallfolk.' },
  { key: 'mines', name: 'Open new mine shafts', icon: '⛏', cost: 15000, months: 8, effect: { resource: { type: 'iron', amount: 0.4 }, building: 'New mine shafts' }, desc: 'Iron from the hills (gold if the gods are kind).' },
];
export { RESOURCES, TAX_LEVELS };
