// The sea (docs/gdd/07-military.md §9; WP C6). A fleet is a party of ships of four kinds — longships, galleys, cogs and
// carracks — each carrying so many soldiers, sailing so fast, weighing so much in a fight. A host goes aboard a fleet in
// port and sails with it; it comes ashore at a port in a day, on a beach in two (longships in half a day). Autumn and
// winter storms take ships at sea. A fleet may lie before an enemy port — a blockade: its trade halves and, if the port
// is besieged, it starves — or go reaving along a coast, as the ironborn do: a village every other day, the loot home,
// the land laid waste. Fleets at war that meet fight by ships, crews and admirals; boarders take ships as prizes.
import { SEA } from '../../../data/balance.js';
import { realmOf, placeName, applyChanges } from '../../shared/world.js';
import { atWar } from '../../shared/warfare.js';
import { fact } from '../facts/log.js';
import { settle } from '../parties.js';
import { planRoute, ashore } from '../movement.js';
import { dayNumber } from '../time.js';
import { holdingRevenue } from '../economy/ledger.js';

const H = SEA.hulls;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const rnd = (a, b, r) => a + (b - a) * r();
const fmt = (n) => Math.round(n).toLocaleString('en-GB');
const mine = (state, ...hs) => hs.includes(state.meta.player);
const ESSOS = ['essos'];

// ── Ships (§9.1) ─────────────────────────────────────────────────────────────────────────────────────────────────────
/** What a fleet is made of, by kind of ship: kept on the fleet once reckoned, scaled to the ships it has left. */
export function hullsOf(state, f) {
  const n = Math.max(0, Math.round(f.ships || 0));
  if (f.hulls) {
    const total = Object.values(f.hulls).reduce((a, b) => a + b, 0);
    if (total === n) return f.hulls;
    if (!total) { delete f.hulls; return hullsOf(state, f); }
    const k = n / total; const out = {}; let given = 0;
    const kinds = Object.keys(f.hulls).sort((a, b) => f.hulls[b] - f.hulls[a]);
    for (const x of kinds) { out[x] = Math.floor(f.hulls[x] * k); given += out[x]; }
    if (n - given > 0) out[kinds[0]] = (out[kinds[0]] || 0) + n - given;
    f.hulls = out; return out;
  }
  const region = state.houses[f.owner]?.region || state.holdings[state.houses[f.owner]?.seat]?.region;
  const c = String(f.composition || '');
  const mix = region === 'iron_islands' || /longship/i.test(c) ? { longship: 1 }
    : ESSOS.includes(region) || /carrack|braavos/i.test(c) ? { carrack: 0.7, galley: 0.3 }
      : /galley/i.test(c) ? { galley: 0.8, cog: 0.2 } : { galley: 0.5, cog: 0.5 };
  const out = {}; let given = 0;
  for (const [k, v] of Object.entries(mix)) { out[k] = Math.floor(n * v); given += out[k]; }
  const first = Object.keys(mix)[0]; out[first] += n - given;
  f.hulls = out; return out;
}
/** Soldiers a fleet can carry besides its crews. */
export const capacityOf = (state, f) => Object.entries(hullsOf(state, f)).reduce((n, [k, v]) => n + v * (H[k]?.carries || 100), 0);
/** The hosts aboard a fleet. */
export const aboardOf = (state, f) => Object.values(state.parties).filter((p) => p.aboard === f.id);
export const carriedOf = (state, f) => aboardOf(state, f).reduce((n, p) => n + p.men, 0);
/** Miles a day: the slowest kind of ship in it. */
export const fleetSpeed = (state, f) => Math.min(...Object.entries(hullsOf(state, f)).filter(([, v]) => v > 0).map(([k]) => H[k]?.speed || 60), 90);

// ── Transport (§9.2) ─────────────────────────────────────────────────────────────────────────────────────────────────
/** Whether a fleet can take this host aboard now: the same port (or within a few miles), room enough, both at rest. */
export function canEmbark(state, host, fleet) {
  if (!host || !fleet || fleet.kind !== 'fleet') return 'no such fleet';
  if (host.aboard) return `${host.name} is already aboard`;
  if (host.owner === 'dothraki' || /khalasar/i.test(host.composition || '')) return 'the Dothraki will not cross the poison water';
  if (fleet.march || host.march) return 'the fleet and the host must both be at rest in the same port';
  if (dist(host.pos, fleet.pos) > 12 && !(host.at && host.at === fleet.at)) return `${fleet.name} is not in port where ${host.name} stands`;
  const room = capacityOf(state, fleet) - carriedOf(state, fleet);
  if (host.men > room) return `${fleet.name} has room for ${fmt(Math.max(0, room))} men, not ${fmt(host.men)}`;
  return null;
}
/** Take a host aboard: it sails wherever the fleet sails, and eats from its wagons (no foraging at sea). */
export function embark(state, host, fleet) {
  host.aboard = fleet.id; delete host.march; host.route = null; delete host.besieging; delete host.wait;
  host.pos = [...fleet.pos]; host.at = fleet.at || null;
  settle(state, host);
  const days = Math.max(1, Math.ceil(host.men / 2000));
  return { days };
}
/**
 * Put a fleet's hosts ashore where it lies: at the port it is in, else on the nearest beach. They are ready to march in
 * a day from a port, two from a beach (half a day from longships). Returns the hosts landed and where.
 */
export function land(state, fleet) {
  const hosts = aboardOf(state, fleet); if (!hosts.length) return { hosts: [], where: null };
  const port = fleet.at && state.holdings[fleet.at] ? fleet.at : null;
  const beach = port ? state.holdings[port].pos : ashore(fleet.pos, 20);
  if (!beach) return { hosts: [], where: null, error: 'no shore within reach' };
  const longships = (hullsOf(state, fleet).longship || 0) >= (fleet.ships || 0) * 0.8;
  const days = port ? SEA.landDays.port : longships ? SEA.landDays.longship : SEA.landDays.beach;
  const ready = dayNumber(state.meta.date) + Math.ceil(days);
  for (const h of hosts) { delete h.aboard; h.pos = [...beach]; h.at = port; h.ashore = ready; settle(state, h); }
  return { hosts, where: port || null, pos: beach, days };
}

// ── Sea fights (§9.5) ────────────────────────────────────────────────────────────────────────────────────────────────
const admiral = (state, f) => { const c = f.commander && state.characters[f.commander]; return 1 + ((c?.alive ? (c.skills?.[1] ?? 8) : 5) - 10) * 0.03; };
const crews = (state, f) => (state.houses[f.owner]?.region === 'iron_islands' ? 1.3 : 1);
/** A fleet's weight in a sea fight: ships by kind × crews × its admiral. */
export function navalPower(state, f) {
  const w = Object.entries(hullsOf(state, f)).reduce((n, [k, v]) => n + v * (H[k]?.weight || 1), 0);
  return w * crews(state, f) * admiral(state, f) * (0.6 + (f.morale ?? 70) / 250);
}
/**
 * A sea battle: the loser loses 20–50 % of its ships, a third of them taken as prizes by boarders; the victor 5–15 %.
 * Crews go with the ships, and so do the soldiers aboard the lost ones. Returns the numbers; the caller applies them.
 */
export function seaBattle(state, a, b, r) {
  const pa = navalPower(state, a), pb = navalPower(state, b);
  const eff = (pa / Math.max(1, pb)) * (1 + 0.24 * (2 * r() - 1));
  const [win, lose] = eff >= 1 ? [a, b] : [b, a];
  const e = eff >= 1 ? eff : 1 / eff; const m = clamp((e - 1) / 1.5, 0, 1);
  const lostShips = Math.min(lose.ships, Math.max(1, Math.round(lose.ships * (0.2 + 0.3 * m))));
  const prizes = Math.round(lostShips / 3);
  const winLost = Math.min(win.ships - 1, Math.round(win.ships * (0.15 - 0.1 * m)));
  return { win, lose, odds: pa / Math.max(1, pb), eff, lostShips, prizes, winLost };
}
function shipsLost(state, f, n, why) {
  if (n <= 0) return;
  const k = n / Math.max(1, f.ships);
  f.ships = Math.max(0, f.ships - n); f.men = Math.max(0, Math.round(f.men * (1 - k)));
  hullsOf(state, f);
  for (const h of aboardOf(state, f)) h.men = Math.max(0, Math.round(h.men * (1 - k)));
  return why;
}
/** Apply a sea battle: ships, crews and soldiers lost, prizes taken, the fact of it. Returns the chronicle's cards. */
export function fightAtSea(state, a, b, r, day = 1) {
  const B = seaBattle(state, a, b, r);
  const place = placeName(state, nearestCoast(state, B.lose.pos));
  const lostMen = { [B.win.id]: 0, [B.lose.id]: 0 };
  const before = { [B.win.id]: B.win.men + carriedOf(state, B.win), [B.lose.id]: B.lose.men + carriedOf(state, B.lose) };
  shipsLost(state, B.lose, B.lostShips); shipsLost(state, B.win, B.winLost);
  if (B.prizes) { B.win.ships += B.prizes; B.win.men += B.prizes * 30; hullsOf(state, B.win); } // the prizes, manned by boarders
  lostMen[B.win.id] = before[B.win.id] - (B.win.men + carriedOf(state, B.win)); lostMen[B.lose.id] = before[B.lose.id] - (B.lose.men + carriedOf(state, B.lose));
  B.win.morale = clamp((B.win.morale ?? 70) + 10, 5, 100); B.lose.morale = clamp((B.lose.morale ?? 70) - 20, 5, 100);
  const W = state.houses[B.win.owner], L = state.houses[B.lose.owner];
  const sunk = B.lose.ships <= 0;
  if (sunk) sink(state, B.lose, 'sunk in a sea fight');
  else { const home = homePort(state, B.lose); if (home) sail(state, B.lose, home); }
  const card = fact(state, 'sea_battle', { title: `${W?.name} victorious at sea off ${place}`, text: `${B.win.name} ${sunk ? 'destroyed' : 'defeated'} ${B.lose.name} off ${place}: ${B.lostShips} ships lost${B.prizes ? `, ${B.prizes} of them taken by boarders` : ''}.`, details: `${B.win.name} lost ${B.winLost} ships. ${fmt(lostMen[B.lose.id])} of the ${L?.name} crews and soldiers aboard are drowned, dead or taken; ${fmt(lostMen[B.win.id])} of the ${W?.name}.`, where: nearestCoast(state, B.lose.pos), importance: mine(state, B.win.owner, B.lose.owner) ? 5 : 4, type: 'war', houses: [B.win.owner, B.lose.owner], day }, { actors: [a.commander, b.commander], data: { attacker: a.id, defender: b.id, winner: B.win.id, loser: B.lose.id, ships: { [B.win.id]: B.winLost, [B.lose.id]: B.lostShips }, prizes: B.prizes, odds: Math.round(B.odds * 100) / 100 }, pos: B.lose.pos, cause: { type: 'rule', ref: 'naval' } });
  return [card];
}

/** A fleet gone to the bottom, and the hosts aboard with it (its people washed ashore, as the engine disbands them). */
function sink(state, f, why) {
  const gone = [...aboardOf(state, f).map((h) => h.id), f.id];
  applyChanges(state, gone.map((id) => ({ op: 'army_destroy', army: id, reason: why })), { source: 'The sea', cause: { type: 'rule', ref: 'naval' } });
}

// ── Where fleets go ──────────────────────────────────────────────────────────────────────────────────────────────────
export function nearestCoast(state, pos) {
  let best = null, d = Infinity;
  for (const h of Object.values(state.holdings)) { if (!h.coastal) continue; const x = dist(h.pos, pos); if (x < d) { d = x; best = h.id; } }
  return best;
}
/** A house's home port: its seat if it lies on the sea, else the nearest of its coastal holdings. */
export function homePort(state, f) {
  const seat = state.holdings[state.houses[f.owner]?.seat];
  if (seat?.coastal) return seat.id;
  return Object.values(state.holdings).filter((h) => h.coastal && realmOf(state, h.owner) === realmOf(state, f.owner)).sort((a, b) => dist(a.pos, f.pos) - dist(b.pos, f.pos))[0]?.id || null;
}
export function sail(state, f, to) {
  const h = state.holdings[to]; if (!h) return null;
  f.march = { to, since: state.meta.turn }; f.at = null;
  planRoute(state, f, h.pos, to, { toName: h.name }); settle(state, f);
  return to;
}

// ── Blockade and raids (§9.4) ────────────────────────────────────────────────────────────────────────────────────────
/** The coastal holdings a raid may fall on: the enemy's, near the coast the raid was sent to, not yet burned. */
export function raidTargets(state, f) {
  const R = f.raid; if (!R) return [];
  const centre = state.holdings[R.target]?.pos || R.pos;
  return Object.values(state.holdings).filter((h) => h.coastal && atWar(state, f.owner, h.owner) && !R.done.includes(h.id) && dist(h.pos, centre) <= R.reach && h.status !== 'besieged')
    .sort((a, b) => dist(a.pos, f.pos) - dist(b.pos, f.pos));
}
/** Reave one holding's lands: loot 1–3 moons of its rents (by the raiders against its garrison), devastation, fear. */
function reave(state, f, h, r, day) {
  const g = h.garrison ?? 60; const men = f.men + carriedOf(state, f);
  const cards = [];
  if (g > men * 0.6) {
    const lost = Math.round(men * rnd(0.05, 0.15, r));
    shipsLost(state, f, Math.round(f.ships * lost / Math.max(1, men)));
    cards.push(fact(state, 'raid', { title: `Raiders beaten off at ${h.name}`, text: `${f.name} came ashore at ${h.name} and was thrown back into the sea by its garrison.`, where: h.id, houses: [f.owner, h.owner], day }, { actors: [f.commander], data: { party: f.id, holding: h.id, beaten: true, lost }, cause: { type: 'rule', ref: 'raid' } }));
    return cards;
  }
  const rents = holdingRevenue(state, h, { tax: state.houses[h.owner]?.policy?.tax || 'normal' }).lines.rents;
  const loot = Math.round(rents * rnd(SEA.raid.loot[0], SEA.raid.loot[1], r) * clamp(men / Math.max(1, g * 3), 0.3, 1));
  const was = h.devastation || 0; h.devastation = clamp(was + rnd(SEA.raid.devastation[0], SEA.raid.devastation[1], r), 0, 100);
  h.unrest = clamp((h.unrest ?? 20) + 10, 0, 100); h.prosperity = clamp((h.prosperity ?? 50) - 4, 0, 100);
  const me = state.houses[f.owner]; if (me?.figures?.treasury) me.figures.treasury.v = (Number(me.figures.treasury.v) || 0) + loot;
  const k = [f.owner, h.owner].sort().join('|'); state.relations[k] = { ...(state.relations[k] || {}), v: clamp((state.relations[k]?.v ?? 0) - 5, -100, 100) };
  const thralls = Math.round(rnd(10, 60, r));
  f.raid.loot = (f.raid.loot || 0) + loot;
  cards.push(fact(state, 'raid', { title: `Reavers on the coast at ${h.name}`, text: `${f.name} falls on the lands of ${h.name}: villages burned, the stores carried off, ${fmt(loot)} dragons of plunder.`, details: `They paid the iron price: ${thralls} thralls and salt wives taken, a septon's bell, the boats drawn up on the shingle burned. The smallfolk flee inland.`, where: h.id, importance: mine(state, f.owner, h.owner) ? 4 : 3, houses: [f.owner, h.owner], day }, { actors: [f.commander], data: { party: f.id, holding: h.id, loot, devastation: Math.round(h.devastation), thralls }, cause: { type: 'rule', ref: 'raid' } }));
  cards.push(fact(state, 'village_burned', { title: `Fires on the shore near ${h.name}`, text: `Fishing villages near ${h.name} burn.`, where: h.id, houses: [h.owner], day }, { data: { holding: h.id, by: f.owner }, cause: { type: 'rule', ref: 'raid' } }));
  return cards;
}

/**
 * A day at sea (run after the marches): the hosts aboard move with their fleets; storms; the blockades kept (a fleet
 * that sailed away lifts its own); the raids go on. Fleets meeting at sea fight in shared/battles.js (fightAtSea).
 * Returns { events, applied }.
 */
export function seaTick(state, days, r) {
  const events = []; const applied = []; const today = dayNumber(state.meta.date);
  const season = state.world?.season || 'summer';
  for (const f of Object.values(state.parties)) {
    if (f.kind !== 'fleet' || !(f.ships > 0)) continue;
    hullsOf(state, f);
    // the soldiers aboard go where the ships go
    for (const h of aboardOf(state, f)) { h.pos = [...f.pos]; h.at = f.at || null; settle(state, h); }
    // storms: autumn and winter, a fleet out at sea (half as often hugging a coast)
    const atSea = !f.at; const chance = (SEA.storm[season] || 0) / 7 * days * (nearestCoast(state, f.pos) && dist(state.holdings[nearestCoast(state, f.pos)].pos, f.pos) < 25 ? 0.5 : 1);
    if (atSea && chance && r() < chance) {
      const n = Math.max(1, Math.round(f.ships * rnd(SEA.stormLoss[0], SEA.stormLoss[1], r)));
      const men = f.men + carriedOf(state, f); shipsLost(state, f, n); const drowned = men - f.men - carriedOf(state, f);
      events.push(fact(state, 'lost_at_sea', { title: `A storm scatters ${f.name}`, text: `${/^[aeiou]/i.test(season) ? 'An' : 'A'} ${season} gale falls on ${f.name}: ${n} ${n === 1 ? 'ship founders' : 'ships founder'}, and ${fmt(drowned)} men with them.`, where: nearestCoast(state, f.pos), importance: mine(state, f.owner) ? 4 : 3, houses: [f.owner], day: 1 }, { actors: [f.commander], data: { party: f.id, ships: n, drowned }, pos: f.pos, cause: { type: 'rule', ref: 'weather' } }));
      applied.push({ op: 'naval', text: `${f.name}: ${n} ships lost in a storm` });
      if (f.ships <= 0) { sink(state, f, 'lost in a storm'); continue; }
    }
    // a blockade holds while the fleet lies before the port
    if (f.blockade) {
      const h = state.holdings[f.blockade];
      if (!h || f.march || dist(f.pos, h.pos) > 30 || !atWar(state, f.owner, h.owner)) { if (h?.blockade?.fleet === f.id) delete h.blockade; delete f.blockade; }
      else h.blockade = { by: f.owner, fleet: f.id, since: h.blockade?.since ?? today };
    }
    // a raid: at a target, reave it (a village every other day); then on to the next, or home with the plunder
    if (f.raid && !f.march) {
      const R = f.raid;
      if (R.until && today >= R.until) { events.push(...raidEnds(state, f)); continue; }
      const here = state.holdings[R.at];
      if (here && dist(here.pos, f.pos) <= 30 && (R.last == null || today - R.last >= SEA.raid.every)) {
        R.last = today; R.done.push(here.id); delete R.at; if (!R.until) R.until = today + R.days; // the raid's days run from the first landing
        const cards = reave(state, f, here, r, 1);
        events.push(...cards.filter((c) => mine(state, f.owner, here.owner) || c.importance >= 4));
        applied.push({ op: 'naval', text: `${f.name} raids ${here.name}` });
      }
      if (!R.at) {
        const next = raidTargets(state, f)[0];
        if (!next) { events.push(...raidEnds(state, f)); continue; }
        R.at = next.id; sail(state, f, next.id);
      }
    }
  }
  // blockades whose fleet is gone
  for (const h of Object.values(state.holdings)) if (h.blockade && state.parties[h.blockade.fleet]?.blockade !== h.id) delete h.blockade;
  return { events, applied };
}
function raidEnds(state, f) {
  const R = f.raid; delete f.raid; const home = homePort(state, f); if (home) sail(state, f, home);
  if (!R.done.length) return [];
  return [fact(state, 'raid', { title: `${f.name} sails home`, text: `${f.name} sails for home with ${fmt(R.loot || 0)} dragons of plunder from ${R.done.length} ${R.done.length === 1 ? 'holding' : 'holdings'} on the coast.`, where: home, houses: [f.owner], day: 1 }, { actors: [f.commander], data: { party: f.id, loot: R.loot || 0, raided: R.done }, cause: { type: 'rule', ref: 'raid' } })].filter((c) => mine(state, f.owner) || c.importance >= 4);
}

/** Send a fleet raiding a coast: the holding named, and the enemy's coast about it (~220 miles), for a fortnight from the first landing. */
export function startRaid(state, f, target, { days = SEA.raid.days } = {}) {
  const h = state.holdings[target];
  f.raid = { target, pos: h?.pos || f.pos, reach: 120, days, until: null, done: [], loot: 0 };
  delete f.blockade;
  const first = raidTargets(state, f)[0];
  if (first) { f.raid.at = first.id; sail(state, f, first.id); }
  return first?.id || null;
}
