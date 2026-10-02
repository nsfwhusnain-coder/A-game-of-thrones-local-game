// Tourneys (docs/gdd/09-living-world.md; bug hunt ST2, ST3 and ST9). A tourney is an event with days in it: it is called (the
// `tourney` fact, the purses paid, the heralds out), the lords of the region ride to it (shared/retinues.js sends them while
// the call is fresh and has them stay until the lists), and on the day the lists are run (`listsTick`, three weeks after the
// call) a champion is chosen among those who are there: the host's own knights and the guests who have arrived, and the
// result is told (`tourney_result`), on a day later than the call. Before this a tourney was called and won in one step, the
// champion was any knight in the world (Rakharo won a name-day tourney at Starfall), a knight died in the lists that were
// run at the dead man's post, and the lords of the region began to ride for it when it had ended.
//
// Pure engine: the dice are the engine's own (engine/rng.js), the days are the world's.
import { applyChanges, resolvePlaceId } from './world.js';
import { placeOf } from '../engine/parties.js';
import { emit } from '../engine/facts/log.js';
import { random } from '../engine/rng.js';
import { dayNumber } from '../engine/time.js';
import { keptByStory } from '../engine/people/life.js';
import { speakerFor } from './regency.js';

/** Days from the call to the lists: the lords of the region have time to ride in. */
export const LISTS_AFTER = 21;
/** The lords are sent in the first days after the call: one who set out later could not be there when the lists are run. */
export const GUESTS_RIDE = 10;
/** The lists are put off a week at a time while their host is away, up to this many times (about two moons), and then are not run. */
export const POSTPONE_DAYS = 7;
export const POSTPONE_MAX = 8;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const today = (state) => dayNumber(state.meta.date);

/** Name the day for the lists at a seat: a tourney is called there, `LISTS_AFTER` days from now. Returns the entry. */
export function scheduleLists(state, seatId, house, extra = {}) {
  state.plots = state.plots || {}; state.plots.lists = state.plots.lists || {};
  const now = today(state);
  return (state.plots.lists[seatId] = { house, called: now, on: now + LISTS_AFTER, ...extra });
}
/** Whether a tourney is called at the seat and its lists not yet run. */
export const listsPending = (state, seatId) => !!state.plots?.lists?.[seatId];

/**
 * The seats whose tourney is fresh: the lords of their region may ride for them. A tourney the story told as already held
 * (the Hand's, shared/plots.js, `plots.tourneys`) draws its guests for the moon that follows, as it always did.
 */
export function tourneyNow(state) {
  const now = today(state); const out = new Set();
  for (const [seat, L] of Object.entries(state.plots?.lists || {})) if (L.on > now && now - L.called <= GUESTS_RIDE) out.add(seat);
  for (const [seat, d] of Object.entries(state.plots?.tourneys || {})) if (now - d <= 30) out.add(seat);
  return [...out];
}

// those who may ride in the lists: the knights of the household and the men at arms of rank, and the lords and their sons who are
// of an age to; nobody who is hurt, held, or a child, and no maester or septon
const FIGHTERS = { knight: 3, kingsguard: 3, captain: 2, master_at_arms: 2, commander: 2 };
const NOBLE = new Set(['lord', 'heir', 'family', 'bastard']);
/** Who is at the seat and fit to ride in its lists, with how likely each is to win: [{ c, w }]. */
export function jousters(state, seatId) {
  const seat = String(seatId);
  const out = [];
  for (const c of Object.values(state.characters)) {
    if (!c.alive || c.sex === 'f' || /imprisoned|captive|hostage|wounded/.test(c.status || '')) continue;
    const age = c.age ?? 25; if (age < 15 || age > 55) continue;
    const roles = c.roles || [];
    if (roles.some((r) => r === 'maester' || r === 'priest')) continue;
    // present: in the hall, or arrived with a guest's retinue (a person on the road is nowhere yet)
    if (resolvePlaceId(placeOf(state, c)) !== seat) continue;
    const rank = Math.max(0, ...roles.map((r) => FIGHTERS[r] || 0));
    const noble = age <= 45 && roles.some((r) => NOBLE.has(r));
    if (rank) out.push({ c, w: rank }); else if (noble) out.push({ c, w: 1 });
  }
  return out;
}
const pickWeighted = (list) => { const t = list.reduce((n, x) => n + x.w, 0); let k = random() * t; for (const x of list) { k -= x.w; if (k <= 0) return x; } return list[list.length - 1]; };

/**
 * The lists, on the day. For every called tourney whose day has come: the host must still hold his hall and not be besieged in
 * it (else it is quietly given up); a champion is chosen among those who are there; one in eight lists a knight is killed;
 * the host's prestige and the dead knight's house's feeling are moved; and the result is told. Called every day by the day loop.
 */
export function listsTick(state) {
  const lists = state.plots?.lists; if (!lists) return;
  const now = today(state);
  for (const [seatId, L] of Object.entries(lists)) {
    if (L.on > now) continue;
    // the lists wait for their host: a lord who is away on the day (the Hand rode south the week before, the King on his progress) has them put off a week at a time, and no lists at all after two moons
    const host = speakerFor(state, L.house);
    if (host?.alive && placeOf(state, host) !== seatId && (L.postponed || 0) < POSTPONE_MAX) { L.on = now + POSTPONE_DAYS; L.postponed = (L.postponed || 0) + 1; continue; }
    delete lists[seatId];
    const me = state.houses[L.house]; const hall = state.holdings[seatId];
    if (!me || !hall || hall.owner !== L.house || hall.status === 'besieged') continue;
    const pool = jousters(state, seatId);
    if (!pool.length) continue; // no one is there to ride: there are no lists, and no champion to name
    const champ = pickWeighted(pool).c;
    const ch = [{ op: 'character', id: champ.id, note: `Champion of the tourney at ${hall.name}.`, opinion: clamp((champ.opinion || 0) + 10, -100, 100) }];
    // a knight is sometimes killed in the lists: one who is there (so his death is told where it happened), never one the story keeps
    const fallen = pool.map((x) => x.c).filter((k) => k !== champ && !keptByStory(state, k));
    let down = null;
    if (fallen.length && random() < 0.12) { down = fallen[Math.floor(random() * fallen.length)]; ch.push({ op: 'character', id: down.id, alive: false, cause: 'a lance through the throat in the lists', how: 'wound', place: seatId }, { op: 'relation', a: L.house, b: down.house, delta: -4, reason: 'a knight dead in your lists' }); }
    const cause = { type: 'rule', ref: 'tourney' };
    emit(state, 'tourney_result', { actors: [champ.id], houses: [...new Set([L.house, champ.house])], place: seatId, data: { cost: L.cost || null, nameDay: !!L.nameDay, lists: now }, cause,
      text: L.nameDay ? `At ${me.name}'s tourney for a name-day, ${champ.name} unhorses all comers and crowns a blushing girl queen of love and beauty.` : `${champ.name} is champion of the tourney at ${hall.name}.` });
    applyChanges(state, ch, { source: 'The tourney', cause });
    me.prestige = (me.prestige || 0) + (L.nameDay ? 1 : 5);
  }
}
