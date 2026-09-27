// Bread, horse-fodder, wagons, exhausted country and ruined roads. A host carries meals, not a percentage.
// All quantities here are engine-owned. Prose receives only what they mean: full wagons, hungry men, bare fields.
import { unitsOf } from './units.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const nearestHolding = (state, pos) => Object.values(state.holdings || {}).sort((a, b) => dist(a.pos, pos) - dist(b.pos, pos))[0]?.id || null;
const lineDistance = (p, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1]; const d2 = dx * dx + dy * dy;
  const t = d2 ? clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / d2, 0, 1) : 0;
  return dist(p, [a[0] + dx * t, a[1] + dy * t]);
};

const northern = (state, a) => {
  const near = state.holdings[nearestHolding(state, a.pos)];
  return ['north', 'wall', 'beyond'].includes(near?.region || state.houses[a.owner]?.region);
};
const friends = (state, army, holding) => {
  if (!holding) return false;
  if (holding.owner === army.owner) return true;
  const mine = state.houses[army.owner], theirs = state.houses[holding.owner];
  return mine?.liege === holding.owner || theirs?.liege === army.owner || army.serving === holding.owner;
};

/** One day's demand in ration equivalents: one for a man, four for a horse. */
export function dailyNeed(state, army) {
  if (!army || army.type === 'fleet') return 0;
  const u = unitsOf(state, army); const horses = Math.max(0, u.knights + u.horse);
  return Math.max(1, Math.round(army.men + horses * 4));
}

/** Give an old host a real baggage train without granting food every time it is inspected. */
export function ensureBaggage(state, army) {
  if (!army || army.type === 'fleet') return null;
  const u = unitsOf(state, army); const horses = Math.max(0, u.knights + u.horse);
  const wagons = Math.max(2, Math.ceil(army.men / 110));
  const capacity = wagons * 700;
  if (!army.baggage) army.baggage = { wagons, horses, capacity, provisions: Math.round(capacity * 0.8), hungryDays: 0 };
  else {
    army.baggage.wagons = Math.max(army.baggage.wagons || 0, wagons);
    army.baggage.horses = horses;
    army.baggage.capacity = Math.max(army.baggage.capacity || 0, capacity);
    army.baggage.provisions = clamp(Number(army.baggage.provisions) || 0, 0, army.baggage.capacity);
    army.baggage.hungryDays = Math.max(0, Number(army.baggage.hungryDays) || 0);
  }
  return army.baggage;
}

export function provisionState(state, army) {
  const bag = ensureBaggage(state, army); if (!bag) return { days: 99, hungry: false, text: 'at sea' };
  const need = dailyNeed(state, army);
  const days = bag.provisions / Math.max(1, need);
  const hungry = bag.hungryDays >= 1;
  const text = hungry ? 'men and horses are going hungry' : days >= 6 ? 'wagons well provisioned' : days >= 3 ? 'a few days of food in the wagons' : days >= 1 ? 'wagons running low' : 'the baggage train is empty; the host must forage';
  return { days: Math.round(days * 10) / 10, hungry, text, wagons: bag.wagons, horses: bag.horses };
}

/** A baggage train is the price of carrying food. Empty wagons and desperate foraging slow it further. */
export function baggagePace(army) {
  if (!army || army.type === 'fleet') return 1;
  const bag = army.baggage;
  if (!bag) return 1; // migration/default: the first logistics tick inventories the real train
  const fill = bag.provisions / Math.max(1, bag.capacity);
  return (bag.hungryDays > 0 ? 0.78 : fill < 0.15 ? 0.84 : 0.91) * (bag.wagons > army.men / 70 ? 0.93 : 1);
}

function infrastructure(state) {
  state.logistics = state.logistics || {};
  state.logistics.land = state.logistics.land || {};
  state.logistics.roads = state.logistics.roads || {};
  return state.logistics;
}
function landRecord(state, h) {
  const L = infrastructure(state).land;
  const initial = Math.max(1000, Math.round((h.population || 5000) * 3));
  return L[h.id] ||= { forage: initial, initial, passes: 0, stripped: 0 };
}

/** Mud and ruts along this leg, 0..0.45. It is read by marchDays on the next leg. */
export function roadSlowdown(state, from, to) {
  if (!state || !from || !to) return 0;
  const roads = infrastructure(state).roads;
  let weighted = 0, weight = 0;
  for (const h of Object.values(state.holdings)) {
    const d = lineDistance(h.pos, from, to); if (d > 55) continue;
    const r = roads[h.id]; if (!r) continue;
    const w = 1 - d / 55; weighted += (r.wear + r.mud) * w; weight += w;
  }
  return clamp(weight ? weighted / weight : 0, 0, 0.45);
}

function wearRoad(state, army, from, to, days) {
  if (!from || !to || dist(from, to) < 2 || army.type === 'fleet') return;
  const roads = infrastructure(state).roads;
  const season = state.world?.season;
  for (const h of Object.values(state.holdings)) {
    if (lineDistance(h.pos, from, to) > 45) continue;
    const r = roads[h.id] ||= { wear: 0, mud: 0 };
    r.wear = clamp(r.wear + (army.men / 80000) * Math.min(1, days / 10), 0, 0.3);
    if (season === 'autumn' || season === 'winter') r.mud = clamp(r.mud + (army.men / 100000) * Math.min(1, days / 7), 0, 0.25);
  }
}

function recoverRoads(state, days) {
  const season = state.world?.season;
  const heal = days * (season === 'summer' || season === 'spring' ? 0.002 : 0.0005);
  for (const r of Object.values(infrastructure(state).roads)) {
    r.wear = Math.max(0, r.wear - heal); r.mud = Math.max(0, r.mud - (season === 'summer' ? heal * 2 : heal * 0.25));
  }
}

/**
 * Feed every host for the elapsed days, from friendly granaries, then wagons, then the country.
 * A field stripped once recovers slowly; a second passage through bare land leaves an army hungry.
 */
export function logisticsTick(state, days) {
  const events = [], applied = [];
  recoverRoads(state, days);
  for (const army of Object.values(state.armies)) {
    if (army.type === 'fleet' || army.men <= 0 || army.public && army.men < 500) continue;
    const bag = ensureBaggage(state, army); const perDay = dailyNeed(state, army);
    const winter = state.world?.season === 'winter'; const cold = winter && northern(state, army);
    const demand = Math.round(perDay * days * (cold ? 1.65 : winter ? 1.25 : 1));
    const at = army.at && state.holdings[army.at];
    let unmet = 0, foraged = 0, short = demand;
    if (friends(state, army, at)) {
      // A friendly granary feeds the camp continuously — until it is empty. Food is stored
      // as months for the owning population, so the conversion back to rations is exact here.
      const house = state.houses[at.owner]; const food = house?.figures?.food;
      const population = Object.values(state.holdings).filter((h) => h.owner === at.owner).reduce((n, h) => n + (h.population || 0), 0) || 10000;
      const available = Math.max(0, Number(food?.v) || 0) * population * 30;
      const served = Math.min(short, available); short -= served;
      if (food) food.v = Math.max(0, (Number(food.v) || 0) - served / Math.max(1, population * 30));
      if (short <= 0) {
        bag.provisions = bag.capacity;
        bag.hungryDays = Math.max(0, bag.hungryDays - days * 2);
      }
    }
    if (short > 0) {
      const carried = Math.min(bag.provisions, short); bag.provisions -= carried; short -= carried;
    }
    if (short > 0) {
      const from = army.motion?.from || army.pos, to = army.pos;
      const lands = Object.values(state.holdings).filter((h) => lineDistance(h.pos, from, to) <= 50).sort((a, b) => lineDistance(a.pos, from, to) - lineDistance(b.pos, from, to));
      for (const h of lands) {
        if (short <= 0) break;
        const l = landRecord(state, h); const before = l.forage; const take = Math.min(short, l.forage);
        if (take <= 0) { l.passes += 1; continue; }
        l.forage -= take; l.passes += 1; short -= take; foraged += take;
        if (before > l.initial * 0.35 && l.forage <= l.initial * 0.35) {
          l.stripped += 1;
          events.push({ title: `Foragers strip the lands about ${h.name}`, text: `${army.name}'s foragers take cattle, grain and seed from the countryside. Little is left for the next host — or for the smallfolk.`, details: `The baggage train had run short. This land will not feed another great column until it recovers.`, where: h.id, importance: army.owner === state.meta.player ? 3 : 2, type: 'war', houses: [army.owner, h.owner], ...(army.owner === state.meta.player || h.owner === state.meta.player ? {} : { bg: true }) });
          h.prosperity = Math.max(0, (h.prosperity ?? 50) - 3); h.unrest = Math.min(100, (h.unrest ?? 20) + 5);
        } else if (before <= l.initial * 0.35 && take > 0) l.stripped = Math.max(2, l.stripped + 1);
      }
      unmet = short;
    }
    if (unmet > 0) {
      const hungryDays = days * unmet / Math.max(1, demand); bag.hungryDays += hungryDays;
      const rate = cold ? 0.012 : winter ? 0.006 : 0.003;
      const lost = Math.min(Math.round(army.men * 0.25), Math.round(army.men * rate * hungryDays));
      if (lost > 0) { army.men = Math.max(0, army.men - lost); army.morale = Math.max(15, Math.round((army.morale ?? 70) - hungryDays * (cold ? 2 : 1))); }
      events.push({ title: cold ? `Winter closes its hand on ${army.name}` : `${army.name} goes hungry`, text: cold ? `The fires burn low, horses founder in the snow, and ${lost.toLocaleString('en-GB')} men are dead or gone from the column.` : `The wagons are empty and the country has already been picked bare. ${lost.toLocaleString('en-GB')} men die, desert, or fall out.`, details: cold ? 'Beyond the Wall and in the North, a winter road without a friendly granary is an enemy no sword can fight.' : 'A land stripped twice gives nothing back. The host must reach stores, disperse, or keep losing men.', where: nearestHolding(state, army.pos), importance: 4, type: 'disaster', houses: [army.owner], ...(army.owner === state.meta.player || army.serving === state.meta.player ? {} : { bg: true }) });
      applied.push({ op: 'logistics', text: `${army.name}: baggage exhausted; ${lost.toLocaleString('en-GB')} lost to hunger${cold ? ' and winter' : ''}` });
    } else bag.hungryDays = Math.max(0, bag.hungryDays - days * 0.5);
    const foodDays = bag.provisions / Math.max(1, perDay);
    // Legacy readers may still ask for supply. It is now an output of rations and hunger, never a free meter.
    army.supply = clamp(Math.round((unmet ? 12 : foraged ? 45 : Math.min(1, foodDays / 6) * 100)), 0, 100);
    wearRoad(state, army, army.motion?.from, army.pos, days);
  }
  // Fields recover by seasons, not by resetting after each host.
  const regrow = days * (state.world?.season === 'summer' ? 0.006 : state.world?.season === 'spring' ? 0.004 : 0.001);
  for (const l of Object.values(infrastructure(state).land)) l.forage = Math.min(l.initial, l.forage + l.initial * regrow);
  return { events, applied };
}

export function logisticsText(state, army) {
  const p = provisionState(state, army);
  return `${p.text}; ${p.wagons || 0} baggage wagons${p.days < 20 ? `, about ${p.days} days carried` : ''}`;
}

export function roadText(state, from, to) {
  const slow = roadSlowdown(state, from, to);
  return slow >= 0.3 ? 'the road is churned nearly impassable' : slow >= 0.15 ? 'the road is deep mud and broken ruts' : slow >= 0.05 ? 'the road is badly cut up' : 'the road is sound';
}
