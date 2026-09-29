// What the player has set in motion, and how each order came out. Everything here is read from the state the
// engine keeps (riders' journeys, marching hosts, called banners, works) — the same state the map, People and the
// prompt read — so the orders panel can never tell a different story from the world.
import { placeName, fmt, dayNumber } from './world.js';
import { marchDays } from './warfare.js';
import { isForce, partyAt, membersOf } from '../engine/parties.js';
import { daysLeft } from '../engine/movement.js';

// the player's own hosts, those serving them, and their sworn lords' hosts answering the call
export function commandable(state, a) {
  if (!isForce(a) || a.exile) return false; // a rider is sent and recalled, not commanded; an exile answers to no one
  const p = state.meta.player; if (a.owner === p || a.serving === p) return true;
  const v = state.houses[a.owner]; return !!v && v.liege === p && v.obligations?.host === a.id;
}

// where a marching party is really going: its live road's goal beats a `march.to` left over from an earlier order (B-25);
// a party that is besieging, camped, in battle or routed has no arrival to wait for even if the old order lingers
const RESTING = new Set(['besieging', 'camped', 'staying', 'mustering', 'engaged', 'routed']);
export const goalOf = (a) => (!a?.march || (RESTING.has(a.state) && !a.route) ? null : a.route?.to ?? a.march.to);

export const STATUS_LABEL = { inflight: 'In flight', queued: 'Queued', underway: 'Under way', done: 'Done', delivered: 'Delivered', answered: 'Answered', failed: 'Failed', delayed: 'Delayed', told: 'In the story' };

/** How an order came out: { status, lines } — lines are the engine's own record of what was done. */
export function orderOutcome(o, state = null) {
  const lines = (o.result || []).map(String);
  if (o.status) return { status: o.status, lines };
  const letter = o.post && state?.post?.find((x) => x.id === o.post);
  if (letter) return { status: letter.status === 'in flight' ? 'inflight' : letter.status, lines };
  if (o.envoy) return { status: 'answered', lines: lines.length ? lines : [`${o.envoy.verdict}`] };
  if (!lines.length) return { status: o.executed ? 'done' : 'told', lines };
  const failed = lines.filter((t) => /^could not/i.test(t));
  if (failed.length === lines.length) return { status: 'failed', lines };
  if (lines.some((t) => /marches for|sets out for|rides for|turns .+ for|marching/i.test(t))) return { status: 'underway', lines };
  return { status: failed.length ? 'delayed' : 'done', lines };
}

/** Everything of the player's that is on the move or being built: [{ kind, who, text, days }]. */
export function underway(state) {
  const p = state.meta.player; const out = [];
  for (const r of Object.values(state.parties)) {
    const c = state.characters[r.commander];
    if (r.kind !== 'rider' || !c?.alive || c.house !== p || !r.march) continue;
    out.push({ kind: 'ride', id: c.id, who: c.name, text: `riding to ${r.route?.toName || placeName(state, r.march.to)}`, days: Math.max(1, Math.round(daysLeft(r) ?? 1)) });
  }
  for (const a of Object.values(state.parties)) {
    const goal = goalOf(a); if (goal == null || !commandable(state, a)) continue;
    const foe = partyAt(state, goal);
    const dest = foe ? foe.pos : state.holdings[goal]?.pos; if (!dest) continue;
    const party = membersOf(state, a).filter((c) => c.alive).map((c) => c.name);
    out.push({ kind: 'march', id: a.id, who: a.name, text: `${fmt(a.men)} men${party.length ? ` with ${party.slice(0, 3).join(', ')}` : ''}, ${foe ? `after ${foe.name}` : `marching to ${placeName(state, goal)}`}`, days: Math.max(1, Math.round(daysLeft(a) ?? marchDays(a, a.pos, dest, state).days)) });
  }
  for (const v of Object.values(state.houses)) {
    if (v.liege !== p || v.obligations?.levies !== 'called') continue;
    out.push({ kind: 'banners', who: `House ${v.name}`, text: `called to muster at ${placeName(state, v.obligations.muster || state.houses[p].seat)}, not yet answered`, days: null });
  }
  for (const l of state.post || []) {
    if (l.status !== 'in flight') continue;
    out.push({ kind: 'raven', who: `Raven to ${l.toName}`, text: l.text.slice(0, 80), days: Math.max(1, l.arriveDay - dayNumber(state.meta.date)) });
  }
  for (const w of state.projects || []) {
    if (w.house !== p || w.status !== 'active') continue;
    out.push({ kind: 'works', who: w.name, text: `${fmt(Math.round(w.cost - w.remaining))} of ${fmt(w.cost)} dragons spent`, days: Math.max(1, Math.round(w.monthsLeft * 30)) });
  }
  return out.sort((a, b) => (a.days ?? 9999) - (b.days ?? 9999));
}

/** Letters in flight land, and are answered when the one written to sends a raven back. */
export function postTick(state) {
  const today = dayNumber(state.meta.date);
  for (const p of state.post || []) {
    if (p.status === 'in flight' && today >= p.arriveDay) { p.status = 'delivered'; p.delivered = today; }
    if (p.status !== 'answered' && (state.ravens || []).some((r) => r.from === p.to && (r.day ?? 0) >= p.sentDay)) p.status = 'answered';
  }
}
