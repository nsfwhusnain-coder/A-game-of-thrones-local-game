// One thing at a time (docs/gdd/03-architecture.md §4). Everyone alive is doing exactly one thing — ruling from their
// seat, commanding a host, answering the banners, riding somewhere, attending a feast, sitting in a cell — and what
// they are doing decides what else they may be asked to do. A lord summoned to his liege's war does not ride off to a
// wedding (B-10); a lord leading a host in the field is not sent visiting by a story.
//
// c.activity = { kind, since, party?, until?, source? } — its priority and whether it may be interrupted are its kind's
// (ACTIVITIES below); a party, an end day or a source other than the engine's own rules is stored only when there is one.
import { partyOf, placeOf, TRAVELLERS } from './parties.js';
import { dayNumber } from './time.js';

//                 how much it matters      what may take its place (a claim of at least this priority; Infinity: only
//                                          the engine's own events — release, death, relief, the siege's end)
export const ACTIVITIES = {
  captive:    { priority: 100, yieldsTo: Infinity },
  commanding: { priority: 90, yieldsTo: Infinity },
  besieged:   { priority: 88, yieldsTo: Infinity },
  ruling:     { priority: 80, yieldsTo: 60 },
  mustering:  { priority: 78, yieldsTo: 90 },
  envoy:      { priority: 70, yieldsTo: 78 },
  travelling: { priority: 60, yieldsTo: 70 },
  court_duty: { priority: 55, yieldsTo: 70 },
  attending:  { priority: 40, yieldsTo: 55 },
  idle:       { priority: 0, yieldsTo: 0 },
};
const COMMANDS = new Set(['host', 'fleet', 'garrison', 'band']); // a party whose leader is commanding it
const today = (state) => dayNumber(state.meta.date);

/** What someone is doing now: what a claim gave them to do, else what their circumstances make it, as of this moment. */
export const activityOf = (state, c) => (c?.activity?.source ? c.activity : baseActivity(state, c));
/** The day someone's present activity ends, if it has an end (a journey's arrival, a feast's last day). */
export const busyUntil = (state, c) => activityOf(state, c)?.until ?? null;

/**
 * What someone's circumstances make them do when nothing else claims them: a prisoner is captive; a lord inside
 * walls under siege is besieged; one travelling with a party commands it, serves in it, rides or attends with it; a
 * head of house rules; a councillor or a sworn sword of the Kingsguard serves at court; everyone else is at home.
 */
export function baseActivity(state, c) {
  if (!c) return null;
  const since = today(state);
  const make = (kind, { party = null, until = null } = {}) => compact({ kind, since, party, until });
  if (/imprisoned|captive|hostage/.test(c.status || '')) return make('captive');
  const p = partyOf(state, c);
  if (p) {
    const ref = { party: p.id };
    if (TRAVELLERS.has(p.kind)) return make(p.kind === 'envoy' ? 'envoy' : 'travelling', { ...ref, until: arrival(state, p) });
    if (COMMANDS.has(p.kind)) return make(p.commander === c.id ? 'commanding' : 'mustering', ref);
    // a household or the King's progress on the road: travelling; halted at its hosts': attending
    return make(p.march ? 'travelling' : 'attending', { ...ref, until: p.march ? arrival(state, p) : null });
  }
  const at = state.holdings?.[placeOf(state, c)];
  if (at && (at.siege || at.status === 'besieged')) return make('besieged');
  const h = state.houses?.[c.house];
  // a lord called to the banners is gathering his levies until he marches (and is not free to go feasting: B-10)
  if (h?.lord === c.id && ['called', 'delayed', 'answered'].includes(h.obligations?.levies)) return make('mustering');
  if (h?.lord === c.id || h?.regent === c.id) return make('ruling');
  if ((c.roles || []).some((r) => ['council', 'kingsguard', 'hand', 'spymaster'].includes(r)) && at) return make('court_duty');
  return make('idle');
}
const arrival = (state, p) => (p.route ? today(state) + Math.ceil(Math.max(0, p.route.days - p.route.done) + (p.delay || 0)) : null);

/**
 * Ask for someone's time: `activity` is { kind, party?, until?, source? }. It is given when it matters at least as much
 * as what yields to it, or the present activity is over; `force` is a liege's command (the player's own people go
 * where they are sent, relieved of whatever they were doing). Returns { ok, displaced, reason }.
 */
export function claim(state, c, activity, { force = false } = {}) {
  const def = ACTIVITIES[activity.kind]; if (!def || !c?.alive) return { ok: false, displaced: null, reason: c?.alive ? `no such activity: ${activity.kind}` : 'dead' };
  const cur = activityOf(state, c); const now = today(state);
  const done = cur?.until != null && cur.until < now;
  const yields = !cur || done || def.priority >= ACTIVITIES[cur.kind].yieldsTo || cur.kind === activity.kind;
  if (!yields && !force) return { ok: false, displaced: null, reason: `${c.name} is ${DOING[cur.kind]}` };
  c.activity = compact({ kind: activity.kind, since: now, party: activity.party, until: activity.until, source: activity.source });
  return { ok: true, displaced: cur && cur.kind !== activity.kind ? cur : null, reason: null };
}
/** Someone's activity ends: they go back to what their circumstances make them do. */
export function release(state, c) {
  if (!c) return null;
  const was = c.activity || null; c.activity = baseActivity(state, c);
  return was;
}
// an activity as it is stored: nothing that its kind already says, nothing empty
function compact({ kind, since, party = null, until = null, source = null }) {
  return { kind, since, ...(party ? { party } : {}), ...(until != null ? { until } : {}), ...(source && source.type !== 'engine' ? { source } : {}) };
}
/** How much an activity matters, and whether anything short of the engine's own events may interrupt it. */
export const priorityOf = (a) => ACTIVITIES[a?.kind]?.priority ?? 0;
export const interruptible = (a) => ACTIVITIES[a?.kind]?.yieldsTo !== Infinity;
/** Whether someone is free for an activity of this kind (the retinue scheduler, a mind's options, an order's check). */
export function canAttend(state, c, kind) {
  if (!c?.alive) return false;
  const cur = activityOf(state, c); const def = ACTIVITIES[kind];
  if (!def) return false;
  if (cur.until != null && cur.until < today(state)) return true; // what they were doing is over
  if (kind === 'attending') return ['ruling', 'idle'].includes(cur.kind); // 03 §4: only those at home, and free, go visiting
  return def.priority >= ACTIVITIES[cur.kind].yieldsTo;
}

/**
 * The duty that holds someone where they are against anything short of the engine's own events or a liege's command
 * — leading a host, answering the banners, an embassy, a siege, a cell — or null when they are free to be moved.
 */
export function bound(state, c) {
  const cur = activityOf(state, c);
  return cur && ACTIVITIES[cur.kind].yieldsTo > ACTIVITIES.envoy.priority ? cur : null;
}

/**
 * Keep everyone's activity true to the world after a turn, a migration or a batch of changes: the dead do nothing; an
 * activity whose party they have left, or whose day is past, ends; anyone travelling with a party is doing what that
 * party does. Afterwards every living character has exactly one activity (03 §14, invariant 2).
 */
export function settleActivities(state) {
  const now = today(state);
  for (const c of Object.values(state.characters || {})) {
    if (!c.alive) { delete c.activity; continue; }
    const base = baseActivity(state, c); const cur = c.activity;
    // what circumstances decided, circumstances decide again; only a claim (it has a source) outlives them
    const stale = !cur || !ACTIVITIES[cur.kind] || !cur.source
      || (cur.party && cur.party !== partyOf(state, c)?.id)            // they left the party it was about
      || (!cur.party && base.party)                                   // they are with a party now: that decides
      || (cur.until != null && cur.until < now)                        // it is over
      || (base.kind === 'captive' && cur.kind !== 'captive')           // a prisoner does nothing else
      || (cur.kind === 'captive' && base.kind !== 'captive')           // and a freed one is free
      || (base.kind === 'commanding' && cur.kind !== 'commanding');    // the leader of a host in the field leads it
    if (stale) { c.activity = base; if (cur?.since != null && cur.kind === base.kind) c.activity.since = cur.since; }
    else if (cur.party && base.until != null) cur.until = base.until;   // a journey's end moves with its delays
  }
}

// how an activity reads in a refusal ("Roose Bolton is answering his liege's call")
export const DOING = {
  captive: 'a prisoner', commanding: 'leading a host in the field', besieged: 'shut up behind besieged walls', ruling: 'ruling from the seat',
  mustering: 'answering the banners', envoy: 'away on an embassy', travelling: 'on the road', court_duty: 'serving at court',
  attending: 'a guest at a lord\'s hall', idle: 'at home',
};
