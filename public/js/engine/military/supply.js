// Supply (docs/gdd/07-military.md §6; WP C3), grown from the arena branch's logistics (shared/logistics.js there) and
// fitted to the parties. A host carries meals, not a percentage: rations in man-days on the men's backs and in the
// wagons. Each day it eats; a friendly holding within two days' march feeds it from its lord's stores; failing that it
// forages the province it stands in, and the foraging lays the land waste. A province stripped once feeds nobody the
// second time — a host that marches back the way it came starves. A camp that sits still sickens. `supply` (0–100),
// which the battles and the old readers use, is only ever an output of this: fed 100, short 75, starving 25.
import { SUPPLY } from '../../../data/balance.js';
import { MILES_PER_UNIT } from '../../../data/geography.js';
import { realmOf } from '../../shared/world.js';
import { atWar } from '../../shared/warfare.js';
import { unitsOf } from '../../shared/units.js';
import { prosperityFactor } from '../economy/ledger.js';
import { paceOf } from '../movement.js';
import { nearestHoldingId } from '../parties.js';
import { fact } from '../facts/log.js';
import { dayNumber } from '../time.js';

const S = SUPPLY;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmt = (n) => Math.round(n).toLocaleString('en-GB');
const COLD = ['north', 'wall', 'beyond'];
const NOMADS = ['tribe', 'company', 'exile'];

/** The hosts that live by this: every host of a house with lands (the free folk, khalasars and sellswords live off the land). */
export const fedByRations = (state, p) => p?.kind === 'host' && p.men > 0 && !NOMADS.includes(state.houses[p.owner]?.rank);

/** What the men and the wagons can carry, in man-days. */
export const capacityOf = (p) => Math.min((p.men || 0) * S.maxDays, (p.men || 0) * S.carried + (p.wagons ?? Math.max(1, Math.ceil((p.men || 0) / S.wagonPer))) * S.wagonHolds);

/** Wagons, what they and the men can carry, and what the host carries now. An older save's host starts full. */
export function trainOf(state, p) {
  if (p.wagons == null) p.wagons = Math.max(1, Math.ceil((p.men || 0) / S.wagonPer));
  // men who joined since the last day came from home with their own bread and their own carts
  const grew = (p.men || 0) - (p.fedMen ?? p.men ?? 0);
  if (grew > 0) p.wagons = Math.max(p.wagons, Math.ceil(p.men / S.wagonPer));
  const capacity = capacityOf(p);
  if (p.rations == null) p.rations = capacity;
  else if (grew > 0) p.rations += grew * (S.carried + S.wagonHolds / S.wagonPer);
  p.rations = Math.round(clamp(p.rations, 0, capacity));
  p.fedMen = p.men;
  return { wagons: p.wagons, capacity, rations: p.rations };
}

const horsesOf = (state, p) => { const u = unitsOf(state, p); return (u.knights || 0) + (u.horse || 0); };
/** The province a host stands in: its holding, else the nearest. */
export const provinceOf = (state, p) => state.holdings[p.at] || state.holdings[nearestHoldingId(state, p.pos || [0, 0])] || null;
const season = (state) => state.world?.season || 'summer';
const grazing = (state, land) => season(state) !== 'winter' && (land?.devastation || 0) < S.stripped;

/** One day's bread for the host: a man-day a man, and the horses' when there is nothing for them to graze. */
export function dailyNeed(state, p, land = provinceOf(state, p)) {
  return Math.max(1, Math.round((p.men || 0) + (grazing(state, land) ? 0 : horsesOf(state, p) * S.horseEats)));
}

/** Whether a holding will feed this host: its own, its realm's, its liege's or an ally's, not an enemy's and not under siege. */
export function feeds(state, p, h) {
  if (!h?.owner || !state.houses[h.owner] || ['besieged', 'sacked', 'burning'].includes(h.status)) return false;
  if (h.owner === p.owner) return true;
  if (atWar(state, p.owner, h.owner)) return false;
  if (realmOf(state, h.owner) === realmOf(state, p.owner)) return true;
  for (let x = state.houses[h.owner], i = 0; x && i < 10; x = state.houses[x.liege], i++) if (x.liege === p.owner) return true;
  return (state.wars || []).some((w) => w.status !== 'ended' && ((w.attackers.includes(realmOf(state, p.owner)) && w.attackers.includes(realmOf(state, h.owner))) || (w.defenders.includes(realmOf(state, p.owner)) && w.defenders.includes(realmOf(state, h.owner)))));
}

/**
 * The friendly holdings that will feed a host, nearest first: those within two days' march, and the lord of the lands
 * it stands in (the North's castles are days apart, but a host marching through its own lord's country is fed by it).
 */
export function storesInReach(state, p) {
  const reach = S.reachDays * paceOf(state, p) / MILES_PER_UNIT / 1.12;
  const at = p.pos || state.holdings[p.at]?.pos; if (!at) return [];
  const here = provinceOf(state, p)?.id;
  return Object.values(state.holdings)
    .map((h) => ({ h, d: Math.hypot(h.pos[0] - at[0], h.pos[1] - at[1]) }))
    .filter(({ h, d }) => (h.id === p.at || h.id === here || d <= reach) && feeds(state, p, h))
    .sort((a, b) => a.d - b.d).map(({ h }) => h);
}

// a house's stores as man-days: its food figure is moons for its people, who eat a man-moon for every three of them
export function peopleOf(state) {
  const out = {}; for (const h of Object.values(state.holdings)) if (h.owner) out[h.owner] = (out[h.owner] || 0) + (h.population || 0);
  return out;
}
const perMoon = (people, house) => ((people[house] || 0) / 3) * 30 || 1;
const storeDays = (state, people, house) => Math.max(0, Number(state.houses[house]?.figures?.food?.v) || 0) * perMoon(people, house);
function drawStores(state, people, house, n) {
  const f = state.houses[house]?.figures?.food; if (!f) return;
  f.v = Math.max(0, Math.round(((Number(f.v) || 0) - n / perMoon(people, house)) * 1000) / 1000);
}

/** What the land yields foragers today, in man-days. */
export function forageYield(state, land, men) {
  if (!land) return 0;
  const s = season(state);
  const k = s === 'winter' && COLD.includes(land.region) ? S.forageNorthWinter : S.forageSeason[s] ?? 1;
  const bare = clamp(1 - (land.devastation || 0) / S.stripped, 0, 1);
  const spread = clamp(Math.sqrt(men / 10000), 0.4, 1.6); // a great host sends its foragers wider — and strips more
  return Math.round((land.population || 0) * S.forageShare * prosperityFactor(land) * k * bare * spread);
}

/** fed | short | starving, days carried, and the `supply` number the battles read. */
export function supplyOf(state, p) {
  if (!fedByRations(state, p)) return { word: 'fed', days: null, supply: p.supply ?? 80 };
  // read-only (the browser asks too): a host the day has not yet reckoned counts as full
  const capacity = capacityOf(p); const rations = Math.min(capacity, p.rations ?? capacity); const need = dailyNeed(state, p);
  const days = Math.floor(rations / need * 10) / 10;
  const word = p.hungry ? 'starving' : days < 3 && !p.resupplied ? 'short' : 'fed';
  const supply = p.hungry ? 25 : p.resupplied ? 100 : Math.round(75 + 25 * clamp((days - 3) / 7, 0, 1));
  return { word, days, supply, wagons: p.wagons ?? Math.max(1, Math.ceil((p.men || 0) / S.wagonPer)), capacity, need };
}

/** The host card's words for it. */
export function supplyText(state, p) {
  const s = supplyOf(state, p); if (s.days == null) return 'lives off the land';
  if (s.word === 'starving') return 'starving — nothing in the wagons and nothing in the fields';
  const d = s.days >= S.maxDays - 1 ? `${Math.round(s.days)} days` : `${Math.floor(s.days)} day${Math.floor(s.days) === 1 ? '' : 's'}`;
  return `${d} of rations${p.resupplied ? ', fed from friendly stores' : p.foraging ? ', foraging' : ''}`;
}

const mine = (state, p) => p.owner === state.meta.player;
const cardFor = (state, p, kind, ev, more) => { const c = fact(state, kind, { ...ev, day: 1 }, more); return mine(state, p) || (ev.houses || []).includes(state.meta.player) ? [c] : []; };

/**
 * One day of every host's bread (run in the day loop after the marches): stores, then the wagons, then the country.
 * Returns { events, applied }.
 */
export function supplyTick(state, days = 1) {
  const events = []; const applied = [];
  const s = season(state); const today = dayNumber(state.meta.date);
  const foraged = new Set(); const people = peopleOf(state);
  for (const p of Object.values(state.parties)) {
    if (!fedByRations(state, p)) continue;
    const t = trainOf(state, p); const land = provinceOf(state, p);
    const need = dailyNeed(state, p, land) * days;
    p.resupplied = false; p.foraging = false;
    // 1. a friendly holding in reach feeds the host and fills its wagons, from its lord's granaries
    if (p.state !== 'embarked') {
      let want = need + (t.capacity - p.rations);
      for (const h of storesInReach(state, p)) {
        if (want <= 0) break;
        const give = Math.min(want, (h.population || 0) * S.drawShare * days, storeDays(state, people, h.owner));
        if (give <= 0) continue;
        drawStores(state, people, h.owner, give); want -= give; p.rations += give; p.resupplied = true;
        // a lord feeds his liege's host gladly; anyone else's he counts against them
        if (h.owner !== p.owner && state.houses[h.owner]?.liege !== p.owner) {
          const k = [h.owner, p.owner].sort().join('|'); p.owed = { ...(p.owed || {}), [h.owner]: ((p.owed || {})[h.owner] || 0) + days };
          if (p.owed[h.owner] >= 7) { p.owed[h.owner] -= 7; state.relations[k] = { ...(state.relations[k] || {}), v: Math.max(-100, (state.relations[k]?.v ?? 0) - 1) }; }
        }
      }
    }
    // 2. the host eats
    const eaten = Math.min(p.rations, need); p.rations -= eaten; let short = need - eaten;
    // 3. running low, it forages the province it stands in — and lays it waste
    const daysLeft = p.rations / Math.max(1, need / days);
    if (land && p.state !== 'embarked' && !p.resupplied && (short > 0 || daysLeft < S.forageLow)) {
      const got = Math.min(forageYield(state, land, p.men) * days, short + Math.max(0, S.forageLow * need / days - p.rations));
      if (got > 0) {
        const fed = Math.min(got, short); short -= fed; p.rations += got - fed; p.foraging = true; foraged.add(land.id);
        const was = land.devastation || 0; const work = Math.min(1, got / Math.max(1, need));
        land.devastation = Math.round(clamp(was + p.men / 1000 * S.devastationPer1000 * days * work, 0, 100) * 10) / 10;
        land.unrest = Math.round(clamp((land.unrest ?? 20) + p.men / 1000 * S.unrestPer1000 * days * work, 0, 100) * 10) / 10;
        if (was < S.stripped && land.devastation >= S.stripped) {
          events.push(...cardFor(state, p, 'land_stripped', { title: `The lands about ${land.name} are stripped bare`, text: `${p.name}'s foragers take the cattle, the grain and the seed corn from the lands about ${land.name}. Nothing is left for the next host — or for the smallfolk.`, where: land.id, houses: [p.owner, land.owner] }, { actors: [p.commander], data: { party: p.id, holding: land.id, devastation: land.devastation }, cause: { type: 'rule', ref: 'supply' } }));
          applied.push({ op: 'supply', text: `${land.name}: stripped by ${p.name}'s foragers` });
        }
      }
    }
    // 4. nothing in the wagons, nothing in the fields: the host starves
    if (short > 0) {
      const k = short / Math.max(1, need); const st = S.starving;
      const lost = Math.min(Math.round(p.men * 0.25), Math.round(p.men * (st.attrition + st.desertion * st.desertionTimes) * k * days));
      if (!p.hungry) {
        events.push(...cardFor(state, p, 'host_hungry', { title: `${p.name} goes hungry`, text: `The wagons of ${p.name} are empty and the country about ${land?.name || 'the host'} has nothing left to give. The men go hungry.`, where: land?.id || null, houses: [p.owner] }, { actors: [p.commander], data: { party: p.id, men: p.men }, cause: { type: 'rule', ref: 'supply' } }));
      }
      p.hungry = (p.hungry || 0) + days;
      p.men = Math.max(0, p.men - lost); p.fedMen = p.men;
      p.morale = Math.max(5, Math.round((p.morale ?? 70) - st.morale * k * days));
      p.lostHungry = (p.lostHungry || 0) + lost;
    } else if (p.hungry) delete p.hungry;
    // 5. a camp that sits still sickens: the flux, bad water, the cold
    p.campDays = p.state === 'marching' || p.march ? 0 : (p.campDays || 0) + days;
    if (p.campDays > S.campAfter || p.state === 'besieging') {
      const rate = (S.disease[s] ?? 0.02) * (short > 0 || supplyOf(state, p).word !== 'fed' ? S.disease.short : 1) / 30 * days;
      p.sick = (p.sick || 0) + p.men * rate;
      const n = Math.floor(p.sick); if (n > 0) { p.men = Math.max(0, p.men - n); p.fedMen = p.men; p.sick -= n; p.lostSick = (p.lostSick || 0) + n; }
    }
    // the week's losses to hunger and sickness, told once on the realm's seventh day
    if (today % 7 === 0) {
      if (p.lostHungry) { events.push(...cardFor(state, p, 'desertion', { title: `Hunger thins ${p.name}`, text: `${fmt(p.lostHungry)} men of ${p.name} die, desert or fall out of the column for want of bread.`, where: land?.id || null, houses: [p.owner] }, { actors: [p.commander], data: { party: p.id, lost: p.lostHungry, men: p.men, cause: 'hunger' }, cause: { type: 'rule', ref: 'supply' } })); applied.push({ op: 'supply', text: `${p.name}: ${fmt(p.lostHungry)} lost to hunger` }); }
      if (p.lostSick >= 20) { events.push(...cardFor(state, p, 'camp_fever', { title: `Fever in the camp of ${p.name}`, text: `The bloody flux goes through the camp of ${p.name}: ${fmt(p.lostSick)} men are dead or too sick to march.`, where: land?.id || null, houses: [p.owner] }, { actors: [p.commander], data: { party: p.id, lost: p.lostSick, men: p.men }, cause: { type: 'rule', ref: 'supply' } })); applied.push({ op: 'supply', text: `${p.name}: ${fmt(p.lostSick)} lost to fever` }); }
      delete p.lostHungry; if (p.lostSick >= 20) delete p.lostSick; // a handful are carried into next week's count
    }
    p.rations = Math.round(clamp(p.rations, 0, trainOf(state, p).capacity));
    p.supply = supplyOf(state, p).supply;
  }
  // the land heals, slowly, where no forager came today
  const heal = (S.recover[s] ?? 0) * days;
  if (heal) for (const h of Object.values(state.holdings)) if (h.devastation > 0 && !foraged.has(h.id)) h.devastation = Math.max(0, Math.round((h.devastation - heal) * 10) / 10);
  return { events, applied };
}

/** Fold one host's train into another's (a merge, the banners joining): wagons and rations travel with the men. */
export function foldTrain(state, host, other) {
  if (!fedByRations(state, other) && !fedByRations(state, host)) return;
  const a = trainOf(state, host); const b = trainOf(state, other);
  host.wagons = a.wagons + b.wagons; host.rations = a.rations + b.rations;
  host.fedMen = (host.men || 0) + (other.men || 0); // the joined men arrive fed: no second helping on the next day
}
