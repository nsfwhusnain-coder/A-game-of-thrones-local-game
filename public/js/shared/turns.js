// How long a turn runs. There are no fixed days, weeks or moons: a turn runs until the next thing that matters to the
// player — a host or rider of theirs arrives, an enemy host comes within striking distance, an answer to a letter
// lands, a great matter of the story falls due, a guest reaches their hall, works are finished — or, if nothing is
// coming, a quiet week. Never less than a day, never more than a moon.
import { dayNumber, placeName } from './world.js';
import { marchDays, atWar } from './warfare.js';
import { commandable } from './errands.js';
import { THREADS } from './plots.js';

export const TURN_MIN = 1, TURN_MAX = 30, TURN_QUIET = 7;
const CONTACT = 14; // map units: two hosts this close can come to blows
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// where a marching host will be after d days (straight along its road, at its pace)
function posAfter(state, a, d) {
  const to = a.march && (String(a.march.to).startsWith('army:') ? state.armies[String(a.march.to).slice(5)]?.pos : state.holdings[a.march.to]?.pos);
  if (!to) return a.pos;
  const m = marchDays(a, a.pos, to).days; const f = Math.min(1, d / Math.max(1, m));
  return [a.pos[0] + (to[0] - a.pos[0]) * f, a.pos[1] + (to[1] - a.pos[1]) * f];
}
/** The next moment worth stopping for: { days, reason }. */
export function nextTurnLength(state) {
  const p = state.meta.player; const today = dayNumber(state.meta.date); const cands = [];
  const add = (days, reason) => { if (days >= 1 && days <= TURN_MAX) cands.push({ days: Math.round(days), reason }); };
  // the player's hosts and companies reach where they are going
  for (const a of Object.values(state.armies)) {
    if (!a.march || !commandable(state, a) || (a.serving && a.owner !== p && !/following/.test(a.status || ''))) continue;
    const foe = String(a.march.to).startsWith('army:') && state.armies[String(a.march.to).slice(5)];
    const to = foe ? foe.pos : state.holdings[a.march.to]?.pos; if (!to) continue;
    add(marchDays(a, a.pos, to).days, `${a.name} ${foe ? `reaches ${foe.name}` : `reaches ${placeName(state, a.march.to)}`}`);
  }
  // the player's riders arrive
  for (const c of Object.values(state.characters)) if (c.alive && c.house === p && c.travel) add(Math.ceil(c.travel.left), `${c.name} reaches ${placeName(state, c.travel.to)}`);
  // an answer to a letter lands
  for (const r of state.pendingReplies || []) add(r.arrivesDay - today, `a raven from ${state.characters[r.char]?.name || 'afar'}`);
  // hosts and great companies coming to the player's lands; guests arriving at their hall
  const mineHold = Object.values(state.holdings).filter((h) => h.owner === p);
  for (const a of Object.values(state.armies)) {
    if (!a.march || commandable(state, a)) continue;
    const dest = state.holdings[a.march.to];
    if (dest?.owner === p && (a.public || a.party || a.men >= 500)) add(marchDays(a, a.pos, dest.pos).days, `${a.party ? state.characters[a.commander]?.name || a.name : a.name} arrives at ${dest.name}`);
  }
  // an enemy host comes within striking distance of the player's hosts or lands
  const foes = Object.values(state.armies).filter((b) => !commandable(state, b) && b.type !== 'fleet' && atWar(state, state.meta.player, b.owner));
  if (foes.length) {
    const mine = Object.values(state.armies).filter((a) => commandable(state, a) && a.type !== 'fleet');
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
    add(dayNumber({ year: y, month: m, day: 1 }) - today, t.name);
  }
  // works finished
  for (const w of state.projects || []) if (w.house === p && w.status === 'active') add(Math.ceil((w.monthsLeft || 0) * 30), `${w.name} is finished`);
  if (!cands.length) return { days: TURN_QUIET, reason: 'a quiet week' };
  cands.sort((a, b) => a.days - b.days);
  const first = cands[0];
  return { days: Math.max(TURN_MIN, Math.min(TURN_MAX, first.days)), reason: first.reason };
}
