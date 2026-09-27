// What befalls people on the road. Riders and small companies cross the realm by the kingsroad, the high
// road and the goat tracks, and the road is not safe: outlaws where the land is restless, foragers where
// there is war, floods and snow by the season — and now and then a friend, a hedge knight, a stranger with
// news. The engine rolls for each traveller each turn; the player's own people's roads are pinned on the map.
import { applyChanges, roadPos, placeName } from './world.js';
import { atWar, marchDays } from './warfare.js';
import { partyOf, forces } from '../engine/parties.js';
import { daysLeft, atSeaOn } from '../engine/movement.js';
import { fact } from '../engine/facts/log.js';
import { random } from '../engine/rng.js';

const pick = (a, r) => a[Math.floor(r() * a.length)];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Where a rider is now, between where they set out and where they are going (for the map, too). */
export function riderPos(state, c) { return roadPos(state, c); }

/**
 * Where someone is, the one way every view tells it: at a place; on the road (whence, whither, days left,
 * the size of the party); or with a host (its men, and where it marches). Returns { text, place, to, days, men }.
 */
export function whereabouts(state, c) {
  if (!c?.alive) return { text: '—' };
  const a = partyOf(state, c);
  if (a?.kind === 'rider') {
    const days = Math.max(1, Math.round(daysLeft(a) ?? 1)); const to = a.march?.to;
    return { text: `on the road to ${a.route?.toName || placeName(state, to)}${a.route && atSeaOn(a.route, a.route.done) ? ', at sea' : ''} · ~${days} days`, to, days, men: 0 };
  }
  if (a) {
    const dest = a.march?.to && state.holdings[a.march.to];
    const days = dest ? Math.max(1, Math.round(daysLeft(a) ?? marchDays(a, a.pos, dest.pos, state).days)) : 0;
    return { text: `with ${a.name}${a.men ? ` (${a.men.toLocaleString('en-GB')} men)` : ''}${dest ? ` · ${a.kind === 'retinue' ? 'riding' : 'marching'} to ${dest.name}, ~${days} days` : a.at ? ` at ${placeName(state, a.at)}` : ''}`, place: a.at, to: a.march?.to, days, men: a.men };
  }
  return { text: placeName(state, c.loc), place: c.loc };
}
function nearest(state, pos) {
  let best = null, d = Infinity;
  for (const h of Object.values(state.holdings)) { const x = dist(h.pos, pos); if (x < d) { d = x; best = h; } }
  return best;
}
// how dangerous the country around a place is to a small party of this house
function danger(state, h, house) {
  if (!h) return 0.05;
  let d = 0.04 + Math.max(0, (h.unrest || 0) - 30) / 250;
  if (atWar(state, house, h.owner)) d += 0.25;
  if ((state.wars || []).some((w) => w.status !== 'ended' && [...w.attackers, ...w.defenders].includes(h.owner))) d += 0.1;
  if (['beyond'].includes(h.region)) d += 0.25;
  if (state.world?.season === 'winter') d += 0.05;
  return Math.min(0.6, d);
}

/**
 * Roll the road for everyone travelling this period. Returns { events, applied }.
 * Travellers: riders (parties of kind 'rider') and small companies on the march (under 400 men).
 */
export function roadEncounters(state, days, r = random) {
  const events = []; const changes = []; const p = state.meta.player;
  const k = Math.min(1.5, days / 30);
  const mineHouse = (h) => h === p || state.houses[h]?.liege === p;
  // lone riders (not while they are aboard ship: the sea has its own dangers, and they are not outlaws)
  for (const rider of Object.values(state.parties)) {
    const c = state.characters[rider.commander];
    if (rider.kind !== 'rider' || !c?.alive || !rider.march || (rider.route && atSeaOn(rider.route, rider.route.done))) continue;
    const pos = rider.pos; const h = nearest(state, pos || [0, 0]);
    const dg = danger(state, h, c.house);
    if (r() > dg * k) continue;
    const mine = mineHouse(c.house); const place = h?.name || 'the road';
    const roll = r();
    if (roll < 0.35) { // robbed, but alive
      events.push(ev(state, 'delayed', { actors: [c.id], data: { why: 'robbed' } }, `${c.name} robbed on the road`, `Outlaws near ${place} took ${c.name}'s horses and purse. ${pick(['They let the rider go with a warning.', 'The escort ran; the rider walked the rest.', 'A septon found them and gave them his mule.'], r)}`, h, mine ? 3 : 1, c.house, mine, days, r));
      rider.delay = (rider.delay || 0) + Math.round(3 + r() * 5);
    } else if (roll < 0.5 && !/wounded/.test(c.status || '')) { // hurt
      changes.push({ op: 'character', id: c.id, status: 'wounded', note: `Wounded by outlaws near ${place}` });
      events.push(ev(state, 'wounded', { actors: [c.id], data: { by: 'outlaws' } }, `${c.name} ambushed`, `Broken men fell on ${c.name}'s party near ${place}. The escort fought them off, but ${c.name} took an arrow and rides on slowly.`, h, mine ? 4 : 2, c.house, mine, days, r));
      rider.delay = (rider.delay || 0) + Math.round(5 + r() * 8);
    } else if (roll < 0.58 && dg > 0.25) { // taken
      const taker = atWar(state, c.house, h?.owner) ? h.owner : null;
      changes.push({ op: 'character', id: c.id, status: 'imprisoned', loc: taker ? state.houses[taker].seat : h?.id, note: taker ? `Taken on the road by men of House ${state.houses[taker].name}` : `Held for ransom by outlaws near ${place}` });
      events.push(ev(state, 'captured', { actors: [c.id], data: { by: taker || 'outlaws' } }, `${c.name} taken on the road`, taker ? `Riders of House ${state.houses[taker].name} caught ${c.name} near ${place} and carried them off to ${state.holdings[state.houses[taker].seat]?.name}.` : `Outlaws near ${place} hold ${c.name} for ransom.`, h, mine ? 5 : 3, c.house, mine, days, r));
    } else if (roll < 0.8) { // delayed
      const why = { winter: 'snow closed the passes', autumn: 'the rains flooded the fords', spring: 'the thaw washed out the bridges', summer: 'a horse went lame' }[state.world?.season || 'summer'];
      rider.delay = (rider.delay || 0) + Math.round(4 + r() * 8);
      events.push(ev(state, 'delayed', { actors: [c.id], data: { why: state.world?.season || 'summer' } }, `${c.name} delayed`, `${c.name}'s ride is slowed near ${place}: ${why}.`, h, mine ? 2 : 1, c.house, mine, days, r));
    } else { // a meeting on the road
      events.push(ev(state, 'met_on_road', { actors: [c.id] }, `${c.name} meets a stranger`, `On the road near ${place}, ${c.name} shared a fire with ${pick(['a hedge knight bound for a tourney', 'a septon walking to the Quiet Isle', 'a singer who knew too many songs about the lords', 'a merchant with news from the south', 'a black brother leading recruits to the Wall'], r)}, and learned ${pick(['that the roads south are full of armed men', 'that the harvest has failed in the Reach', 'that a lord has died and his sons quarrel', 'that the King is ill — or drunk', 'nothing of value, but the wine was good'], r)}.`, h, mine ? 2 : 1, c.house, mine, days, r));
    }
  }
  // small companies on the march
  for (const a of forces(state)) {
    if (!a.march || a.men >= 400 || a.kind === 'fleet' || a.sea?.phase === 'sailing') continue;
    const h = nearest(state, a.pos); const dg = danger(state, h, a.owner);
    if (r() > dg * k * 0.8) continue;
    const mine = mineHouse(a.owner); const place = h?.name || 'the road';
    if (r() < 0.6) {
      const loss = Math.max(3, Math.round(a.men * (0.05 + r() * 0.15)));
      changes.push({ op: 'army_update', army: a.id, delta: -loss, cause: 'ambush', morale: Math.max(10, (a.morale ?? 70) - 10) });
      events.push(ev(state, 'ambush', { actors: [a.commander], data: { party: a.id, men: loss } }, `${a.name} ambushed near ${place}`, `Outlaws struck ${a.name} from the trees near ${place}; ${loss} men were lost before they were driven off.`, h, mine ? 3 : 1, a.owner, mine, days, r));
    } else {
      const gain = Math.round(3 + r() * 12);
      changes.push({ op: 'army_update', army: a.id, delta: gain });
      events.push(ev(state, 'host_joined', { actors: [a.commander], data: { party: a.id, men: gain, freeriders: true } }, `Swords join ${a.name}`, `Near ${place}, ${gain} hedge knights and freeriders asked to ride with ${a.name}, for bread and the chance of glory.`, h, mine ? 2 : 1, a.owner, mine, days, r));
    }
  }
  // the road's wounds and captures are told above, in the road's words
  const { applied } = applyChanges(state, changes, { source: 'The road', battleHouses: new Set(forces(state).filter((a) => a.march && a.men < 400).map((a) => a.owner)), spanDays: days, told: ['character'], cause: { type: 'rule', ref: 'the road' } });
  return { events, applied };
}

function ev(state, kind, more, title, text, h, importance, house, mine, days, r) {
  // the player's own people's roads are news; everyone else's are the small life of the realm
  return fact(state, kind, { title, text, where: h?.id || null, importance, type: 'war', houses: [house], bg: !mine, ...(mine ? { mine: true } : {}), day: 1 + Math.floor(r() * days) }, more);
}
