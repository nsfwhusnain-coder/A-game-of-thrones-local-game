// The engine's marches (docs/gdd/03-architecture.md §5): every party with somewhere to be walks its planned road for
// the days of the turn — hosts and households, fleets, the King's progress, lone riders — and arrives when the road
// is walked, not when a story says so. Routes come from engine/movement.js; the sea crossings of hosts from sea.js;
// the hard places of the realm (the Neck, the Twins, the Bloody Gate…) take their price from chokepoints.js.
import { planRoute, advance, stale } from '../engine/movement.js';
import { landmassOf } from '../engine/geo.js';
import { idOf, isForce, settle, setDown, joinParty, membersOf, TRAVELLERS } from '../engine/parties.js';
import { placeName, placePos, resolvePlaceId } from './world.js';
import { needsShips, planVoyage, retarget, sail } from './sea.js';
import { chokepointToll, roadCongestion } from './chokepoints.js';
import { fact } from '../engine/facts/log.js';

const round1 = (x) => Math.round(x * 10) / 10;
const nearestPort = (state, pos) => Object.values(state.holdings).filter((h) => h.coastal).sort((x, y) => Math.hypot(x.pos[0] - pos[0], x.pos[1] - pos[1]) - Math.hypot(y.pos[0] - pos[0], y.pos[1] - pos[1]))[0]?.id || null;

/**
 * Walk every party with a march order through a turn of `span` days that began on absolute day `turnStart`. A party
 * raised during the turn (`bornDay`) sets out that day. Returns { events, applied } for the chronicle.
 */
export function marchTick(state, { span, turnStart }) {
  const events = []; const applied = []; const p = state.meta.player; const turn = state.meta.turn;
  for (const a of Object.values(state.parties)) {
    if (!a.march || !state.parties[a.id] || a.aboard) continue; // a party merged into another earlier in the loop is gone; one aboard ship sails with it
    const order = String(a.march.to);
    const quarry = idOf(order) != null ? state.parties[idOf(order)] : null;
    const goal = quarry ? quarry.pos : placePos(order, state.holdings);
    if (!goal) { delete a.march; a.route = null; settle(state, a); continue; } // the host it followed is no more
    const mine = a.owner === p || a.serving === p;
    let born = Math.min(span - 1, Math.max(0, a.bornDay || 0));
    let landed = null;
    // The sea is no road: a host bound for another island or shore takes ship — its own, or ships its realm sends — or
    // waits on the shore and says why (sea.js). It walks again only from where it lands, and pays no toll at sea.
    // (A rider takes passage on a merchant ship: that is part of the rider's own journey.)
    if (isForce(a) && a.kind !== 'fleet') {
      if (a.sea && a.sea.for !== order && a.sea.phase !== 'sailing') { if (needsShips(a.pos, goal) && a.sea.phase !== 'to_port') retarget(state, a, goal, order); else delete a.sea; }
      if (!a.sea && needsShips(a.pos, goal)) { planVoyage(state, a, goal, order, turnStart + born); a.route = null; }
      if (a.sea && a.sea.phase !== 'to_port') {
        const r = sail(state, a, { turnStart, span, from: born, mine });
        events.push(...r.events); applied.push(...r.lines);
        if (!r.done || r.used >= span) { a.movedTurn = turn; settle(state, a); continue; }
        born = r.used; landed = a.landed; a.route = null;
      }
    }
    // the leg walked now: to the port first when the host must take ship from it
    const toPort = a.sea?.phase === 'to_port';
    const legKey = toPort ? `port:${a.sea.port.id}` : order;
    const legTo = toPort ? a.sea.port.pos : goal;
    if (stale(state, a, legKey, legTo)) planRoute(state, a, legTo, legKey, { toName: toPort ? placeName(state, a.sea.port.id) : quarry ? quarry.name : placeName(state, order) });
    if (!a.route) {
      if (mine) events.push(fact(state, 'turned_back', { day: born + 1, title: `${a.name} can find no way`, text: `${a.name} cannot reach ${quarry ? quarry.name : placeName(state, order)}: no road leads there${a.kind === 'fleet' ? ' by sea' : ''}.`, where: a.at || null, importance: 3, houses: [a.owner] }, { actors: [a.commander], data: { party: a.id, to: order, why: 'no road' } }));
      delete a.march;
      // one who can go no further is never left on the waves: the ship puts them ashore at the nearest port
      if (TRAVELLERS.has(a.kind) && landmassOf(a.pos, 3) < 0) { const port = nearestPort(state, a.pos); if (port) { setDown(state, a, port); delete state.parties[a.id]; continue; } }
      settle(state, a); continue;
    }
    let days = span - born;
    // ── What lies in the way ──────────────────────────────────────────────────────────────────────────────────────
    // Refugees on the roads slow everyone; the Neck, the Green Fork, the Bloody Gate, the Golden Tooth, the passes into
    // Dorne make a host pay in days, men and heart unless it has leave. Each barrier is paid once per road.
    if (isForce(a) && a.kind !== 'fleet') {
      const r = a.route; const ahead = r.path.filter((_, i) => r.t[i] > r.done && r.t[i] <= r.done + days);
      const from = a.pos, to = ahead.at(-1) || a.pos;
      const jam = roadCongestion(state, from, to); if (jam > 0.02) a.delay = (a.delay || 0) + days * jam;
      const toll = tollAlong(state, a, [from, ...ahead], days);
      if (toll.met.length) {
        if (toll.losses) a.men = Math.max(0, a.men - toll.losses);
        if (toll.morale) a.morale = Math.max(0, Math.round((a.morale ?? 70) - toll.morale));
        if (toll.days) a.delay = (a.delay || 0) + toll.days; // days spent in the bogs are days not marched
        if (toll.gold) { // the Freys keep a bridge, not a charity
          const hh = state.houses[a.owner]; const fr = state.houses.frey;
          if (hh?.figures?.treasury && fr?.figures?.treasury) { hh.figures.treasury.v = Math.max(0, hh.figures.treasury.v - toll.gold); fr.figures.treasury.v += toll.gold; }
        }
        const reach = Math.min(span, born + Math.max(1, Math.round(days * 0.6)));
        for (const e of toll.events) events.push(fact(state, 'crossed', { ...e, day: reach, importance: mine ? Math.max(3, e.importance) : e.importance }, { actors: [a.commander], data: { party: a.id, men: a.men } }));
        for (const mt of toll.met) applied.push({ op: 'chokepoint', text: `${a.name} at ${mt.name}: ${mt.gated ? 'passed' : 'forced the crossing'}${mt.lost ? `, ${mt.lost.toLocaleString('en-GB')} ${mt.lost === 1 ? 'man' : 'men'} lost` : ''}${mt.days ? `, ${mt.days} ${mt.days === 1 ? 'day' : 'days'}` : ''}` });
        r.paid = [...new Set([...(r.paid || []), ...toll.met.map((m) => m.id)])];
      }
    }
    // ── The march itself ─────────────────────────────────────────────────────────────────────────────────────────
    const step = advance(a, days);
    a.at = null; a.movedTurn = turn;
    // the map walks it along exactly this ground, in step with the turn's days (a landing first, if it sailed)
    a.motion = { start: landed ? landed.from : (born + step.wait) / span, end: Math.min(1, (born + step.used) / span), path: [...(landed?.path || []), ...step.path] };
    if (!step.arrived) { settle(state, a); continue; }
    const day = Math.min(span, Math.max(1, Math.ceil(born + step.used)));
    a.arriveDay = day; a.route = null;
    if (toPort) { // at the port: the voyage begins (it sails from the next day on)
      a.at = a.sea.port.id; delete a.sea;
      planVoyage(state, a, goal, order, turnStart + day); settle(state, a); continue;
    }
    if (quarry) { // it has caught up with the host it followed: the engine fights them, or joins them, where they meet
      delete a.march; a.pos = [...quarry.pos];
      if (TRAVELLERS.has(a.kind)) {
        for (const c of membersOf(state, a)) joinParty(state, c, quarry);
        if (a.owner === p) events.push(fact(state, 'arrived', { day, title: `${state.characters[a.commander]?.name || a.name} reaches ${quarry.name}`, text: `${state.characters[a.commander]?.name || a.name} has found ${quarry.name} on the road and rides with it now.`, where: quarry.at || null, importance: 2, type: 'court', houses: [a.owner] }, { actors: [a.commander], data: { party: a.id, joined: quarry.id }, pos: quarry.pos }));
        delete state.parties[a.id]; continue;
      }
      settle(state, a); continue;
    }
    const place = resolvePlaceId(order) || order;
    a.at = place; a.pos = [...goal]; delete a.march;
    if (TRAVELLERS.has(a.kind)) { // a journey's end: the riders get down, and the party is no more
      const who = state.characters[a.commander];
      const came = membersOf(state, a).filter((c) => c.alive);
      setDown(state, a, place); delete state.parties[a.id];
      if (who && came.includes(who)) {
        applied.push({ op: 'character', text: `${who.name} arrives at ${placeName(state, place)}` });
        const told = fact(state, 'arrived', { day, title: `${who.name} reaches ${placeName(state, place)}`, text: `${who.name} has arrived at ${placeName(state, place)}${who.house === p ? ` on the orders of ${state.characters[state.houses[p].lord]?.name || 'the lord'}` : ''}.`, where: place, importance: who.house === p ? 2 : 1, type: 'court', houses: [who.house] }, { actors: came.map((c) => c.id), data: { party: a.id } });
        if (who.house === p) events.push(told);
      }
      continue;
    }
    settle(state, a);
    const told = fact(state, 'arrived', { day, title: `${a.name} reaches ${placeName(state, place)}`, text: `${a.name} (${a.men.toLocaleString('en-GB')} men) has arrived at ${placeName(state, place)}.`, where: place, importance: a.owner === p ? 2 : 1, houses: [a.owner, ...(a.serving ? [a.serving] : [])] }, { actors: membersOf(state, a).map((c) => c.id), data: { party: a.id, men: a.men, kind: a.kind } });
    if (a.owner === p) events.push(told);
  }
  return { events, applied };
}

// the barriers a march crosses on the ground it covers this turn, each paid once per road
export function tollAlong(state, a, pts, days) {
  const out = { days: 0, losses: 0, morale: 0, gold: 0, events: [], met: [] };
  const paid = new Set([...(a.route?.paid || []), ...(a.march?.paid || [])]);
  for (let i = 0; i + 1 < pts.length; i++) {
    const t = chokepointToll(state, a, pts[i], pts[i + 1], days);
    if (!t.met.length || t.met.every((m) => paid.has(m.id))) continue;
    for (const m of t.met) paid.add(m.id);
    out.met.push(...t.met); out.days += t.days; out.losses += t.losses; out.morale += t.morale; out.gold += t.gold; out.events.push(...t.events);
  }
  out.days = round1(out.days);
  // The order remembers what was paid, not only the road: a host that follows another host has its road planned again every day (the quarry having moved), and a barrier "paid once per
  // road" was paid again each day the host waited out its delay: a company of fifty lost every man at the Golden Tooth over seventy days (bug hunt N-004)
  if (a.march && out.met.length) a.march.paid = [...paid];
  return out;
}
