// How long a turn runs. There are no fixed days, weeks or moons: a turn runs until the next thing that matters to the
// player — a host or rider of theirs arrives, an enemy host comes within striking distance, an answer to a letter
// lands, a great matter of the story falls due, a guest reaches their hall, works are finished — or, if nothing is
// coming, a quiet week. Never less than a day, never more than a moon.
import { dayNumber, placeName } from './world.js';
import { marchDays, atWar } from './warfare.js';
import { commandable } from './errands.js';
import { isRef, partyAt, forces } from '../engine/parties.js';
import { pointAt, daysLeft } from '../engine/movement.js';
import { THREADS } from './plots.js';

export const TURN_MIN = 1, TURN_MAX = 30, TURN_QUIET = 7;
const CONTACT = 14; // map units: two hosts this close can come to blows
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// where a marching host will be after d days: along its planned road (engine/movement.js), else straight at its pace
function posAfter(state, a, d) {
  if (a.route && a.march) return pointAt(a.route, a.route.done + Math.max(0, d - (a.delay || 0)));
  const to = a.march && (partyAt(state, a.march.to)?.pos || state.holdings[a.march.to]?.pos);
  if (!to) return a.pos;
  const m = marchDays(a, a.pos, to, state).days; const f = Math.min(1, d / Math.max(1, m));
  return [a.pos[0] + (to[0] - a.pos[0]) * f, a.pos[1] + (to[1] - a.pos[1]) * f];
}
// days until a party is where it is going: its road's days left, else an estimate
const eta = (state, a, to) => Math.ceil(daysLeft(a) ?? marchDays(a, a.pos, to, state).days);
/** The next moment worth stopping for: { days, reason }. */
export function nextTurnLength(state) {
  const p = state.meta.player; const today = dayNumber(state.meta.date); const cands = [];
  const add = (days, reason, secret = false) => { if (days >= 1 && days <= TURN_MAX) cands.push({ days: Math.round(days), reason, secret }); };
  // the player's hosts and companies reach where they are going
  for (const a of Object.values(state.parties)) {
    if (!a.march || !commandable(state, a) || (a.serving && a.owner !== p && !isRef(a.march.to))) continue;
    const foe = partyAt(state, a.march.to);
    const to = foe ? foe.pos : state.holdings[a.march.to]?.pos; if (!to) continue;
    add(eta(state, a, to), `${a.name} ${foe ? `reaches ${foe.name}` : `reaches ${placeName(state, a.march.to)}`}`);
  }
  // A camp filling from the fields is itself a reason to look again tomorrow.
  // Without this, auto turns can jump over the visible growth of a muster.
  if (Object.values(state.parties).some((a) => a.muster?.remaining > 0 && a.owner === p)) add(1, 'the levy camp grows');
  // the player's riders arrive
  for (const r of Object.values(state.parties)) if (r.kind === 'rider' && r.owner === p && r.march) add(Math.ceil(daysLeft(r) ?? 1), `${state.characters[r.commander]?.name || r.name} reaches ${r.route?.toName || placeName(state, r.march.to)}`);
  // a great bannerman's host reaches the muster (the host grows before the lord's eyes)
  for (const a of Object.values(state.parties)) {
    if (!a.serving || a.serving !== p || !a.march || a.men < 2000 || isRef(a.march.to)) continue;
    const to = state.holdings[a.march.to]; if (to) add(eta(state, a, to.pos), `${state.characters[a.commander]?.name || a.name}'s host reaches ${to.name}`);
  }
  // an answer to a letter lands
  for (const r of state.pendingReplies || []) add(r.arrivesDay - today, `a raven from ${state.characters[r.char]?.name || 'afar'}`);
  // hosts and great companies coming to the player's lands; guests arriving at their hall
  const mineHold = Object.values(state.holdings).filter((h) => h.owner === p);
  for (const a of Object.values(state.parties)) {
    if (!a.march || commandable(state, a)) continue;
    const dest = state.holdings[a.march.to];
    if (dest?.owner === p && (a.public || a.kind === 'retinue' || a.men >= 500)) add(eta(state, a, dest.pos), `${a.kind === 'retinue' ? state.characters[a.commander]?.name || a.name : a.name} arrives at ${dest.name}`);
  }
  // an enemy host comes within striking distance of the player's hosts or lands
  const foes = forces(state).filter((b) => !commandable(state, b) && b.kind !== 'fleet' && atWar(state, state.meta.player, b.owner));
  if (foes.length) {
    const mine = Object.values(state.parties).filter((a) => commandable(state, a) && a.kind !== 'fleet');
    outer: for (let d = 1; d <= TURN_MAX; d++) {
      for (const b of foes) {
        const bp = posAfter(state, b, d);
        const near = mine.find((a) => dist(posAfter(state, a, d), bp) < CONTACT) || mineHold.find((h) => dist(h.pos, bp) < CONTACT * 0.8);
        if (near) { add(d, `${b.name} comes within reach of ${near.name}`); break outer; }
      }
    }
  }
  // a great matter of the story falls due
  const month = state.meta.date.year * 12 + (state.meta.date.month - 1);
  for (const t of THREADS) {
    const st = t.stages[state.plots?.stages?.[t.id] || 0]; if (!st || st.at <= month) continue;
    const y = Math.floor(st.at / 12), m = (st.at % 12) + 1;
    // the turn may stop for it, but the player is never told what is coming: canon is a secret the world keeps
    add(dayNumber({ year: y, month: m, day: 1 }) - today, 'word from across the realm', true);
  }
  // works finished
  for (const w of state.projects || []) if (w.house === p && w.status === 'active') add(Math.ceil((w.monthsLeft || 0) * 30), `${w.name} is finished`);
  if (!cands.length) return { days: TURN_QUIET, reason: 'a quiet week' };
  cands.sort((a, b) => a.days - b.days);
  const first = cands[0];
  // a moon-long turn only while the lord's own hosts or riders are on the road; otherwise the realm is looked at again soon
  const onTheRoad = Object.values(state.parties).some((a) => a.march && ((commandable(state, a) && !a.serving) || (a.kind === 'rider' && a.owner === p)));
  const cap = onTheRoad ? TURN_MAX : TURN_QUIET + 3;
  if (first.days > cap) { const known = cands.find((c) => !c.secret); return { days: TURN_QUIET, reason: known ? `a quiet week (next: ${known.reason}, in ${known.days} days)` : 'a quiet week' }; }
  return { days: Math.max(TURN_MIN, first.days), reason: first.reason };
}
