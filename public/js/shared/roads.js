// What befalls people on the road. Riders and small companies cross the realm by the kingsroad, the high
// road and the goat tracks, and the road is not safe: outlaws where the land is restless, foragers where
// there is war, floods and snow by the season — and now and then a friend, a hedge knight, a stranger with
// news. The engine rolls for each traveller each turn; the player's own people's roads are pinned on the map.
import { applyChanges } from './world.js';
import { atWar } from './warfare.js';

const pick = (a, r) => a[Math.floor(r() * a.length)];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Where a rider is now, between where they set out and where they are going (for the map, too). */
export function riderPos(state, c) {
  const t = c.travel; if (!t) return null;
  const to = state.holdings[t.to]?.pos; const from = t.from;
  if (!to || !from) return to || null;
  const f = Math.max(0, Math.min(1, 1 - t.left / Math.max(1, t.days)));
  return [from[0] + (to[0] - from[0]) * f, from[1] + (to[1] - from[1]) * f];
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
 * Travellers: characters riding alone (c.travel) and small companies on the march (under 400 men).
 */
export function roadEncounters(state, days, r = Math.random) {
  const events = []; const changes = []; const p = state.meta.player;
  const k = Math.min(1.5, days / 30);
  const mineHouse = (h) => h === p || state.houses[h]?.liege === p;
  // lone riders
  for (const c of Object.values(state.characters)) {
    if (!c.alive || !c.travel) continue;
    const pos = riderPos(state, c); const h = nearest(state, pos || [0, 0]);
    const dg = danger(state, h, c.house);
    if (r() > dg * k) continue;
    const mine = mineHouse(c.house); const place = h?.name || 'the road';
    const roll = r();
    if (roll < 0.35) { // robbed, but alive
      events.push(ev(`${c.name} robbed on the road`, `Outlaws near ${place} took ${c.name}'s horses and purse. ${pick(['They let the rider go with a warning.', 'The escort ran; the rider walked the rest.', 'A septon found them and gave them his mule.'], r)}`, h, mine ? 3 : 1, c.house, mine, days, r));
      c.travel.left += Math.round(3 + r() * 5);
    } else if (roll < 0.5 && !/wounded/.test(c.status || '')) { // hurt
      changes.push({ op: 'character', id: c.id, status: 'wounded', note: `Wounded by outlaws near ${place}` });
      events.push(ev(`${c.name} ambushed`, `Broken men fell on ${c.name}'s party near ${place}. The escort fought them off, but ${c.name} took an arrow and rides on slowly.`, h, mine ? 4 : 2, c.house, mine, days, r));
      c.travel.left += Math.round(5 + r() * 8);
    } else if (roll < 0.58 && dg > 0.25) { // taken
      const taker = atWar(state, c.house, h?.owner) ? h.owner : null;
      changes.push({ op: 'character', id: c.id, status: 'imprisoned', loc: taker ? state.houses[taker].seat : h?.id, note: taker ? `Taken on the road by men of House ${state.houses[taker].name}` : `Held for ransom by outlaws near ${place}` });
      events.push(ev(`${c.name} taken on the road`, taker ? `Riders of House ${state.houses[taker].name} caught ${c.name} near ${place} and carried them off to ${state.holdings[state.houses[taker].seat]?.name}.` : `Outlaws near ${place} hold ${c.name} for ransom.`, h, mine ? 5 : 3, c.house, mine, days, r));
      delete c.travel;
    } else if (roll < 0.8) { // delayed
      const why = { winter: 'snow closed the passes', autumn: 'the rains flooded the fords', spring: 'the thaw washed out the bridges', summer: 'a horse went lame' }[state.world?.season || 'summer'];
      c.travel.left += Math.round(4 + r() * 8);
      events.push(ev(`${c.name} delayed`, `${c.name}'s ride is slowed near ${place}: ${why}.`, h, mine ? 2 : 1, c.house, mine, days, r));
    } else { // a meeting on the road
      events.push(ev(`${c.name} meets a stranger`, `On the road near ${place}, ${c.name} shared a fire with ${pick(['a hedge knight bound for a tourney', 'a septon walking to the Quiet Isle', 'a singer who knew too many songs about the lords', 'a merchant with news from the south', 'a black brother leading recruits to the Wall'], r)}, and learned ${pick(['that the roads south are full of armed men', 'that the harvest has failed in the Reach', 'that a lord has died and his sons quarrel', 'that the King is ill — or drunk', 'nothing of value, but the wine was good'], r)}.`, h, mine ? 2 : 1, c.house, mine, days, r));
    }
  }
  // small companies on the march
  for (const a of Object.values(state.armies)) {
    if (!a.march || a.men >= 400 || a.type === 'fleet') continue;
    const h = nearest(state, a.pos); const dg = danger(state, h, a.owner);
    if (r() > dg * k * 0.8) continue;
    const mine = mineHouse(a.owner); const place = h?.name || 'the road';
    if (r() < 0.6) {
      const loss = Math.max(3, Math.round(a.men * (0.05 + r() * 0.15)));
      changes.push({ op: 'army_update', army: a.id, delta: -loss, cause: 'ambush', morale: Math.max(10, (a.morale ?? 70) - 10) });
      events.push(ev(`${a.name} ambushed near ${place}`, `Outlaws struck ${a.name} from the trees near ${place}; ${loss} men were lost before they were driven off.`, h, mine ? 3 : 1, a.owner, mine, days, r));
    } else {
      const gain = Math.round(3 + r() * 12);
      changes.push({ op: 'army_update', army: a.id, delta: gain });
      events.push(ev(`Swords join ${a.name}`, `Near ${place}, ${gain} hedge knights and freeriders asked to ride with ${a.name}, for bread and the chance of glory.`, h, mine ? 2 : 1, a.owner, mine, days, r));
    }
  }
  const { applied } = applyChanges(state, changes, { source: 'The road', battleHouses: new Set(Object.values(state.armies).filter((a) => a.march && a.men < 400).map((a) => a.owner)), spanDays: days });
  return { events, applied };
}

function ev(title, text, h, importance, house, mine, days, r) {
  // the player's own people's roads are news; everyone else's are the small life of the realm
  return { title, text, where: h?.id || null, importance, type: 'war', houses: [house], bg: !mine, ...(mine ? { mine: true } : {}), day: 1 + Math.floor(r() * days) };
}
