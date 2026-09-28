// The beat engine (docs/gdd/10-narrative-events.md §3; WP D1). The canon of 298–300 AC is a set of threads, each a run
// of beats in the books' order (public/data/beats.js). A beat waits for its window to open and its thread to reach it;
// then for its trigger (a date, a party's arrival, a death, a number of days after another beat) and its preconditions.
// If the world no longer fits it but one of its alternates does, the alternate happens instead; if its window closes
// first, it lapses and leaves behind what its lapse says. Canon gravity decides which beats may happen at all (Canon: all;
// Loose: only the pillars of the story; Sandbox: none), and while a beat is near, the people it names are canon-locked:
// the realm's minds do not send them elsewhere. A beat acts through the engine's ops and the lord's matters; its words
// are facts of kind `canon_beat` on its thread.
import { dayNumber } from '../time.js';
import { fact } from '../facts/log.js';
import { applyChanges } from '../../shared/world.js';
import { alive } from './beatkit.js';

const monthEnd = (at) => dayNumber({ year: Math.floor(at / 12), month: (at % 12) + 1, day: 30 });
const monthStart = (at) => dayNumber({ year: Math.floor(at / 12), month: (at % 12) + 1, day: 1 });
const record = (s, e, more = {}) => { const { kind = 'canon_beat', actors, data, ...card } = e; return fact(s, kind, card, { ...more, actors, data: { ...data, ...more.data } }); };

/** The beats of the threads, in the v2 shape: window, trigger, pillar, names, alternates, lapse (meta by `thread.stage`). */
export function beatsOf(threads, meta = {}) {
  return threads.flatMap((t) => t.stages.map((st, index) => {
    const id = `${t.id}.${st.id}`; const m = meta[id] || {};
    return {
      id, thread: t.id, threadName: t.name, index, at: st.at,
      window: { from: monthStart(st.at), to: monthEnd(st.at + (st.grace ?? 3)) },
      pillar: !!m.pillar, trigger: m.trigger || { kind: 'date' }, names: m.names || [],
      alternates: m.alternates || [], lapse: m.lapse || null,
      requires: st.needs, effects: st.fire,
    };
  }));
}

/** Whether canon gravity lets a beat happen: Canon all, Loose the pillars, Sandbox none. */
export const gravityOf = (s) => s.meta?.settings?.canonGravity || 'canon';
export const allowed = (s, b) => { const g = gravityOf(s); return g === 'canon' || (g === 'loose' && b.pillar); };

function triggered(s, b, today) {
  const T = b.trigger; const fired = s.plots.fired || {};
  switch (T.kind) {
    case 'arrival': return s.parties?.[T.party] ? s.parties[T.party].at === T.at && !s.parties[T.party].march : true; // no such party: the preconditions decide
    case 'death': return !alive(s, T.actor);
    case 'after': return fired[T.beat] != null && today >= fired[T.beat] + (T.days?.[0] ?? 0);
    default: return true;
  }
}

/** The beat each thread waits on now. */
export function currentBeats(s, beats) {
  const out = []; const seen = new Set();
  for (const b of beats) { if (seen.has(b.thread)) continue; if ((s.plots?.stages?.[b.thread] || 0) === b.index) { out.push(b); seen.add(b.thread); } }
  return out;
}

/** The people canon-locked now: those named by a beat whose window is open or opens within the moon (03 §9). */
export function lockedNames(s, beats) {
  const today = dayNumber(s.meta.date); const out = new Set();
  for (const b of currentBeats(s, beats)) if (allowed(s, b) && today >= b.window.from - 30 && today <= b.window.to) for (const n of b.names) out.add(n);
  return out;
}

/** Everyone a beat still to come names (each thread from its current beat on): under Canon gravity the years spare them. */
export function namedAhead(s, beats) {
  const out = new Set();
  for (const b of beats) if (b.index >= (s.plots?.stages?.[b.thread] || 0) && allowed(s, b)) for (const n of b.names) out.add(n);
  return out;
}

/**
 * A day of the canon: each thread's beat fires, fires an alternate, waits, or lapses. Returns { events, changes,
 * decisions, fired, batches } (the changes applied by the caller in batches, each with the beat's cause).
 */
export function runBeats(s, beats) {
  s.plots = s.plots || {}; s.plots.stages = s.plots.stages || {}; s.plots.flags = s.plots.flags || {}; s.plots.fired = s.plots.fired || {};
  const today = dayNumber(s.meta.date);
  const events = []; const changes = []; const decisions = []; const fired = []; const batches = [];
  const happen = (b, r, how) => {
    s.plots.stages[b.thread] = b.index + 1; s.plots.fired[b.id] = today;
    fired.push(b.id);
    (s.plots.log = s.plots.log || []).push({ thread: b.thread, stage: b.id.split('.')[1], turn: s.meta.turn, date: `${s.meta.date.month}/${s.meta.date.year}`, title: r?.events?.[0]?.title || b.threadName, ...(how ? { how } : {}) });
    if (!r) return;
    const cause = { type: 'beat', ref: b.id };
    const told = (r.events || []).map((e) => record(s, e, { thread: b.thread, data: { stage: b.id.split('.')[1], ...(how ? { how } : {}) }, cause }));
    events.push(...told);
    const ctx = { source: 'The ravens', cause, ...(told[0] ? { alongside: told[0].fact } : {}) };
    if (r.post) { applyChanges(s, r.changes || [], ctx); r.post(s); } else { changes.push(...(r.changes || [])); batches.push({ changes: r.changes || [], ctx }); }
    Object.assign(s.plots.flags, r.flags || {});
    if (r.decision) decisions.push(r.decision);
  };
  for (const b of currentBeats(s, beats)) {
    if (today < b.window.from) continue;
    // canon gravity: a beat the setting does not allow passes by without a word
    if (!allowed(s, b)) { if (today > b.window.to) { s.plots.stages[b.thread] = b.index + 1; (s.plots.log = s.plots.log || []).push({ thread: b.thread, stage: b.id.split('.')[1], how: 'gravity' }); } continue; }
    if (triggered(s, b, today) && b.requires(s)) { happen(b, b.effects(s)); continue; }
    const alt = b.alternates.find((a) => a.when(s));
    if (alt) { happen(b, alt.effects(s), 'alternate'); continue; }
    if (today > b.window.to) {
      // the world moved on: the beat lapses, and leaves behind what its lapse says
      s.plots.stages[b.thread] = b.index + 1;
      (s.plots.log = s.plots.log || []).push({ thread: b.thread, stage: b.id.split('.')[1], how: 'lapsed' });
      if (b.lapse) { const r = b.lapse.effects(s); if (r) { Object.assign(s.plots.flags, r.flags || {}); if (r.changes?.length) batches.push({ changes: r.changes, ctx: { source: 'The ravens', cause: { type: 'beat', ref: `${b.id}:lapse` } } }); changes.push(...(r.changes || [])); } }
    }
  }
  return { events, changes, decisions, fired, batches };
}
