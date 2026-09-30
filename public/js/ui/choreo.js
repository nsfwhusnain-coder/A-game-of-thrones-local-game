// The turn told on the map (docs/gdd/11-map-visuals.md §11; WP E8): what the camera does, and when the map changes, as the day's news is read. Pure — a plan from the events and what the
// screen shows — so node can test the rules, and one runner plays a plan for the real game (ui/playback.js) and for the fixture page (dev/playback.html) alike.
//   1. events are told in the order the chronicle tells them; the camera goes to a place only for news of weight (importance ≥ 3, never for less) that is not already on the screen;
//   2. news of one day at several places: the weightiest is flown to, the others are only pulsed on the map (their pins), the camera does not chase every one;
//   3. a holding that changed hands or state this turn keeps its old look on the map until the beat that tells it, and then changes (with the flash of a pulse), so the map says what the chronicle says when it says it;
//   4. the camera is the player's: once they take it (drag, wheel), no more flying until they choose to follow again; "reduced motion" cuts instead of flying;
//   5. when the news is told, the camera goes home to the player's seat if the telling took it away, and nothing else.

/** The least importance the camera flies for (11 §11: "never fly for importance ≤ 2"). */
export const FLY_FROM = 3;
/** How long a beat holds (ms) by the words it has to be read in, and whether the camera moved for it. */
export const holdFor = (words, flew) => Math.round(flew ? Math.max(3000, Math.min(4800, 2400 + words * 9)) : Math.max(1500, Math.min(3000, 1300 + words * 6)));

/** The holdings whose owner or status differs between two states: the map keeps their old look until their news is told. */
export function changedHoldings(prev, next) {
  const out = [];
  for (const [id, h] of Object.entries(next?.holdings || {})) { const p = prev?.holdings?.[id]; if (p && (p.owner !== h.owner || (p.status || 'normal') !== (h.status || 'normal'))) out.push(id); }
  return out.sort();
}

/**
 * The plan for a turn's events: `{ steps: [{ i, day, where, importance, action: 'fly'|'cut'|'stay'|'pulse', dist, hold, reveal: [holdingId…] }], home: { where, dist } | null }`.
 * `events`: as the chronicle tells them (each `{ where, importance, day, headline, summary }`), `ctx`:
 *   `holdings` (id → { pos }), `onScreen(pos) → boolean`, `seat` (the player's seat's id), `reduced` (cut, don't fly),
 *   `changed` (holding ids that changed this turn: see changedHoldings), `words(e)` (how much there is to read).
 */
export function planPlayback(events, ctx) {
  const at = (e) => (e.where && ctx.holdings?.[e.where] ? ctx.holdings[e.where].pos : null);
  const steps = events.map((e, i) => ({ i, day: e.day || 0, where: at(e) ? e.where : null, importance: e.importance || 0, action: 'stay', dist: null, hold: 0, reveal: [] }));
  // the day's weightiest place-bound event is the one that may fly; the rest of its day only pulse
  const days = new Map();
  for (const s of steps) { if (!s.where) continue; (days.get(s.day) || days.set(s.day, []).get(s.day)).push(s); }
  let flew = false;
  for (const [, group] of [...days].sort((a, b) => a[0] - b[0])) {
    const order = [...group].sort((a, b) => b.importance - a.importance || a.i - b.i);
    order.forEach((s, k) => {
      const pos = at(events[s.i]); const big = s.importance >= FLY_FROM;
      if (k === 0 && big && !ctx.onScreen(pos)) { s.action = ctx.reduced ? 'cut' : 'fly'; s.dist = s.importance >= 4 ? 300 : 420; flew = true; }
      else s.action = 'pulse';
    });
  }
  for (const s of steps) { const words = ctx.words ? ctx.words(events[s.i]) : 60; s.hold = holdFor(words, s.action === 'fly' || s.action === 'cut'); }
  // a holding that changed shows its change at its own news; a change with no news of its own shows at the last beat
  const seat = ctx.seat && ctx.holdings?.[ctx.seat];
  for (const id of ctx.changed || []) {
    const s = steps.find((x) => x.where === id) || steps.at(-1);
    if (s) s.reveal.push(id);
  }
  // the telling took the camera away from the realm: it goes home when the news is told (and only then: a camera that never left has nowhere to return from)
  return { steps, home: flew && seat ? { where: ctx.seat, dist: 520, action: ctx.reduced ? 'cut' : 'fly' } : null };
}

/**
 * Play a plan. `io`: `{ fly(pos, dist), cut(pos, dist), pulse(pos), reveal(ids), show(step, i), wait(ms) → Promise, home(pos, dist, action) }`; `ctl`: `{ skip, noFly }` (read as it goes: the player
 * may take the camera, or skip, at any moment). Resolves when the plan is played or skipped. Returns the log of what was done, in order (the fixture page shows it; a test reads it).
 */
export async function runPlan(plan, ctl, io, holdings) {
  const log = [];
  for (const s of plan.steps) {
    if (ctl.skip) break;
    const pos = s.where ? holdings[s.where].pos : null;
    if (pos && !ctl.noFly && s.action === 'fly') { io.fly(pos, s.dist); log.push(`fly ${s.where}`); await io.wait(1100); }
    else if (pos && !ctl.noFly && s.action === 'cut') { io.cut(pos, s.dist); log.push(`cut ${s.where}`); }
    if (ctl.skip) break;
    io.show(s, s.i); log.push(`show ${s.i}`);
    if (s.reveal.length) { io.reveal(s.reveal); log.push(`reveal ${s.reveal.join(',')}`); }
    if (pos) { io.pulse(pos); if (s.action === 'pulse') log.push(`pulse ${s.where}`); }
    await io.wait(s.hold);
  }
  if (!ctl.skip && plan.home && !ctl.noFly) { io.home(holdings[plan.home.where].pos, plan.home.dist, plan.home.action); log.push(`home ${plan.home.action}`); }
  // whatever was not told is shown at the end, so the map is never left behind the state
  return log;
}
