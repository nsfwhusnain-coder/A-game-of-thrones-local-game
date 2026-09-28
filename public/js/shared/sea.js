// Hosts that must cross the sea (docs/gdd/07-military.md §5, §9; bug B-11). Skagos, Bear Island, the Iron Islands,
// Tarth, Dragonstone, Driftmark, the Three Sisters, the Shield Islands, the Arbor, Estermont and Fair Isle have no road
// to the mainland: a host on one of them takes ship — its own house's, or ships its liege's realm sends to fetch it —
// or it waits on the shore and says why. A host never walks over water, and never pays a toll on a road it sailed past.
// These are the current engine's rules; the naval work of WP C6 (engine/military/naval.js) grows from them.
import { landmassOf, sameLand, bestLanding, shoreCell, seaMilesTo, alongPath, pathUnits } from '../engine/geo.js';
import { placeName, nearestHolding } from './world.js';

import { SEA } from '../../data/balance.js';
import { fact } from '../engine/facts/log.js';

export const SHIP_CARRIES = SEA.shipCarries;     // men a ship carries (data/balance.js)
export const SAIL = SEA.sail;                    // miles a day at sea, by kind of ship (07 §9.1)
const ironborn = (state, hid) => state.houses[hid]?.region === 'iron_islands';
export const sailSpeed = (state, hid) => (ironborn(state, hid) ? SAIL.longship : SAIL.cog);
export const shipsOf = (state, hid) => Math.max(0, Math.round(Number(state.houses[hid]?.figures?.ships?.v) || 0));

// the part of a lane between two fractions of its length, ends included
function lanePart(path, f0, f1) {
  const total = pathUnits(path); const out = [alongPath(path, f0)]; let acc = 0;
  for (let i = 1; i < path.length; i++) { acc += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]); if (acc > f0 * total && acc < f1 * total) out.push([...path[i]]); }
  out.push(alongPath(path, f1));
  return out;
}
/** True when a host at `from` cannot walk to `to`: they are on different islands or continents. */
export function needsShips(from, to) {
  if (!from || !to) return false;
  const a = landmassOf(from), b = landmassOf(to);
  return a >= 0 && b >= 0 && !sameLand(from, to);
}

// Where a house's ships lie: its seat if it has a shore, else the nearest of its holdings that has one
function portOf(state, hid, near) {
  const own = Object.values(state.holdings).filter((h) => h.owner === hid && shoreCell(h.pos) >= 0);
  const seat = state.holdings[state.houses[hid]?.seat];
  if (seat && shoreCell(seat.pos) >= 0) return seat;
  return own.sort((x, y) => Math.hypot(x.pos[0] - near[0], x.pos[1] - near[1]) - Math.hypot(y.pos[0] - near[0], y.pos[1] - near[1]))[0] || null;
}

/**
 * How a house's men cross the water: its own ships ('own'); too few of its own, making several crossings ('ferry');
 * ships its liege or a fellow vassal sends, which must first sail to fetch them ('realm'); or none at all ('none').
 * `crossing` is the voyage's length in days: a few boats making trips can beat a fleet that must come round the coast.
 */
export function transportFor(state, hid, men, from, crossing = 5) {
  const need = Math.max(1, Math.ceil(men / SHIP_CARRIES));
  // the Dothraki will not cross the poison water; a free company buys its passage on merchant ships (WP C7)
  if (hid === 'dothraki') return { kind: 'none', why: 'the Dothraki will not cross the poison water' };
  if (state.houses[hid]?.rank === 'company') return { kind: 'hired', by: hid, ships: need, wait: 7 };
  const own = shipsOf(state, hid);
  if (own >= need) return { kind: 'own', by: hid, ships: need, wait: 0 };
  const trips = own > 0 ? Math.ceil(need / own) : 0;
  const ferry = own > 0 ? { kind: 'ferry', by: hid, ships: own, trips, wait: (trips - 1) * 2 * crossing } : null;
  const h = state.houses[hid];
  const kin = new Set([h?.liege, state.houses[h?.liege]?.liege].filter(Boolean));
  const lenders = Object.values(state.houses).filter((x) => x.id !== hid && (kin.has(x.id) || (h?.liege && x.liege === h.liege)) && shipsOf(state, x.id) >= need);
  let best = null;
  for (const x of lenders) {
    const port = portOf(state, x.id, from); if (!port) continue;
    const [miles] = seaMilesTo(port.pos, [from]); if (!isFinite(miles)) continue;
    const wait = Math.ceil(miles / sailSpeed(state, x.id)) + 1;
    if (!best || wait < best.wait) best = { kind: 'realm', by: x.id, ships: need, wait, from: port.id };
  }
  if (best && (!ferry || best.wait < ferry.wait)) return best;
  return ferry || { kind: 'none', by: null, ships: 0, wait: 0 };
}

// A port on the host's own landmass to march to when it stands inland: the one that best shortens the whole voyage
function portFor(state, pos, to) {
  const mass = landmassOf(pos);
  let best = null, bc = Infinity;
  for (const h of Object.values(state.holdings)) {
    if (shoreCell(h.pos) < 0 || landmassOf(h.pos) !== mass) continue;
    const cost = Math.hypot(h.pos[0] - pos[0], h.pos[1] - pos[1]) / 18 + Math.hypot(h.pos[0] - to[0], h.pos[1] - to[1]) / 60;
    if (cost < bc) { bc = cost; best = h; }
  }
  return best;
}

const landingName = (state, at) => {
  const h = nearestHolding(state, at); const hp = state.holdings[h]?.pos;
  return hp && Math.hypot(hp[0] - at[0], hp[1] - at[1]) < 10 ? `at ${placeName(state, h)}` : `on the coast near ${placeName(state, h)}`;
};

/**
 * Plan how host `a` crosses the water to `to` (a world point). Sets `a.sea`:
 *   { for, phase: 'to_port'|'waiting'|'sailing'|'stranded', port, ready, by, kind, ships, landing, landingName, path, days, start }
 * `forKey` is the march order it serves (a new order means a new plan); `today` is the absolute day.
 */
export function planVoyage(state, a, to, forKey, today) {
  const port = shoreCell(a.pos) >= 0 ? null : portFor(state, a.pos, to);
  const from = port ? port.pos : a.pos;
  const speed = sailSpeed(state, a.owner);
  const land = bestLanding(from, to, { seaSpeed: speed });
  if (!land) { a.sea = { for: forKey, phase: 'stranded', why: 'no way by sea' }; return a.sea; }
  const days = Math.max(1, Math.ceil(land.seaMiles / speed)) + SEA.embarkDays; // a day to embark and land
  const t = transportFor(state, a.owner, a.men, from, days);
  const wait = t.wait || 0;
  a.sea = {
    for: forKey, phase: port ? 'to_port' : t.kind === 'none' ? 'stranded' : wait ? 'waiting' : 'sailing',
    port: port ? { id: port.id, pos: [...port.pos] } : null, kind: t.kind, by: t.by, ships: t.ships || Math.min(shipsOf(state, a.owner), Math.ceil(a.men / SHIP_CARRIES)),
    lender: t.from || null, wait, ready: port ? null : today + wait, start: port || wait || t.kind === 'none' ? null : today,
    landing: land.at, landingName: landingName(state, land.at), path: land.path, days, seaMiles: land.seaMiles,
    ...(t.kind === 'none' ? { why: t.why || 'no ships' } : {}),
  };
  return a.sea;
}

/**
 * The order changed while the host waits on the shore (the banners are told to join the host itself, not the muster
 * point): the same ships are coming, so only the landing is chosen anew.
 */
export function retarget(state, a, to, forKey) {
  const v = a.sea; if (!v || v.phase === 'sailing' || v.phase === 'to_port') return v;
  const land = bestLanding(a.pos, to, { seaSpeed: sailSpeed(state, a.owner) }); if (!land) return v;
  Object.assign(v, { for: forKey, landing: land.at, landingName: landingName(state, land.at), path: land.path, days: Math.max(1, Math.ceil(land.seaMiles / sailSpeed(state, a.owner))) + 1, seaMiles: land.seaMiles });
  return v;
}

/**
 * Carry host `a` along its voyage through a turn: `turnStart` is the absolute day the turn began, `span` its length in
 * days, `from` the day offset (0-based) from which the host is free to move. Returns { done, used, events, lines }:
 * done — it has landed (the land march goes on from the landing with the days left); used — the offset reached.
 */
export function sail(state, a, { turnStart, span, from = 0, mine = false }) {
  const v = a.sea; const events = []; const lines = [];
  const who = a.serving ? `House ${state.houses[a.owner]?.name}'s men` : a.name;
  const shore = placeName(state, a.at || nearestHolding(state, a.pos));
  const end = turnStart + span; let day = turnStart + from;
  if (v.phase === 'stranded') {
    if (!v.told && mine) events.push(fact(state, 'delayed', { day: from + 1, title: `${who} cannot cross the sea`, text: `${a.name} (${a.men.toLocaleString()} men) waits at ${shore}: ${v.why === 'no ships' ? 'there are no ships to carry them, and none in the realm to spare' : 'there is no way to them by sea'}.`, where: a.at || null, importance: 3, houses: [a.owner] }, { actors: [a.commander], data: { party: a.id, why: v.why || 'no ships' } }));
    v.told = true;
    return { done: false, used: span, events, lines };
  }
  if (v.phase === 'waiting') {
    if (!v.told && mine) {
      const lender = v.kind === 'realm' ? state.houses[v.by] : null;
      events.push(fact(state, 'delayed', { day: from + 1, title: `${who} wait for ships`, text: lender ? `${a.name} (${a.men.toLocaleString()} men) waits at ${shore} while House ${lender.name} sends ${v.ships} ships from ${placeName(state, v.lender)} to carry them over (~${v.wait} days).` : `${a.name} has only ${v.ships} ${v.ships === 1 ? 'ship' : 'ships'}; the men cross in ${Math.ceil(a.men / (v.ships * SHIP_CARRIES))} trips (~${v.wait} days before the last are over).`, where: a.at || null, importance: 2, houses: [a.owner] }, { actors: [a.commander], data: { party: a.id, why: 'ships', wait: v.wait, lender: lender?.id || null } }));
      v.told = true;
    }
    if (v.ready >= end) return { done: false, used: span, events, lines };
    day = Math.max(day, v.ready); v.phase = 'sailing'; v.start = day; delete v.told;
  }
  if (v.phase === 'sailing') {
    if (v.start == null) v.start = day;
    if (!v.toldSail && mine) events.push(fact(state, 'embarked', { day: Math.max(1, v.start - turnStart + 1), title: `${who} take ship`, text: `${a.name} (${a.men.toLocaleString()} men) sails from ${shore} ${v.landingName.replace(/^at /, 'for ').replace(/^on the coast near /, 'for the coast near ')} (~${v.days} days at sea).`, where: a.at || null, importance: 2, houses: [a.owner] }, { actors: [a.commander], data: { party: a.id, men: a.men, ships: v.ships, days: v.days } }));
    v.toldSail = true;
    const f = Math.min(1, (end - v.start) / v.days);
    a.pos = alongPath(v.path, f); a.at = null;
    const lo = Math.max(0, v.start - turnStart), hi = Math.min(span, v.start + v.days - turnStart);
    // the map sails it along the lane the engine planned, as far as it got this turn
    const f0 = Math.max(0, Math.min(1, (turnStart + lo - v.start) / v.days));
    a.motion = { start: lo / span, end: hi / span, path: lanePart(v.path, f0, f), at: 'sea' };
    lines.push({ op: 'voyage', text: `${a.name} ${f >= 1 ? 'lands' : 'at sea'} (${Math.round(f * 100)}% of ${v.seaMiles} sea miles)` });
    if (f < 1) return { done: false, used: span, events, lines };
    // landed: the land march goes on from the beach with whatever days are left
    a.pos = [...v.landing];
    if (mine) events.push(fact(state, 'landed', { day: Math.max(1, Math.min(span, hi)), title: `${who} land ${v.landingName}`, text: `${a.name} (${a.men.toLocaleString()} men) comes ashore ${v.landingName} and marches on.`, where: nearestHolding(state, a.pos), importance: 2, houses: [a.owner] }, { actors: [a.commander], data: { party: a.id, men: a.men }, pos: a.pos }));
    a.landed = { path: a.motion.path, from: lo / span, to: hi / span };
    delete a.sea;
    return { done: true, used: hi, events, lines };
  }
  return { done: true, used: from, events, lines };
}
