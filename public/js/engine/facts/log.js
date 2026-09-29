// Facts: the atoms of history (docs/gdd/03-architecture.md §1, §3.6). Every change a player or a lord of the realm could
// notice is recorded once, as a fact, when the engine makes it: who, where, when, what, why, and who may know of it.
// The chronicle's cards are projections of facts (asEvent); the narrator of WP B8 will tell facts, never invent them.
//
// The facts of the turn in progress live in `state.facts` (so a dry run on a copy of the state leaves no trace, and a
// replay makes the same ones); the turn's record flushes them to the save's facts.jsonl (server/game.js).
import { KINDS, templateText } from './kinds.js';
import { dayNumber } from '../time.js';

const GREAT = new Set(['crown', 'paramount']);
const today = (state) => dayNumber(state.meta.date);

/**
 * The turn a fact belongs to: during a turn, the one being played (`meta.clock`, set by the server for the length of
 * the turn: { turn, from, to } in absolute days); between turns, the next one (an act of the planning days opens it).
 */
const turnOf = (state) => state.meta.clock?.turn ?? state.meta.turn + 1;

/**
 * Record a fact. `on` is the day of the turn it happened on (1 = the turn's first day; default: its last); `importance`
 * given explicitly is kept as it is, else the kind's default is raised for the player's house and for great lords.
 * Returns the fact.
 */
export function emit(state, kind, f = {}) {
  const K = KINDS[kind]; if (!K) throw new Error(`no such kind of fact: ${kind}`); // a programming error, caught by the tests
  state.facts = state.facts || [];
  const turn = turnOf(state);
  if (state.meta.factTurn !== turn) { state.meta.factTurn = turn; state.meta.factSeq = 0; }
  const n = (state.meta.factSeq = (state.meta.factSeq || 0) + 1);
  const clock = state.meta.clock || { from: today(state), to: today(state) };
  const day = f.on != null ? Math.max(clock.from, Math.min(clock.to, clock.from + Math.round(f.on) - 1)) : clock.to;
  const actors = [...new Set((f.actors || []).filter(Boolean))], houses = [...new Set((f.houses || []).filter(Boolean))];
  const fact = { id: `f${turn}.${n}`, turn, day, kind, actors, houses };
  if (f.place) fact.place = f.place;
  if (f.pos) fact.pos = f.pos.map((x) => Math.round(x * 10) / 10);
  if (f.data && Object.keys(f.data).length) fact.data = f.data;
  if (f.cause) fact.cause = f.cause;
  // A war's fact carries the war as it stood that day (its name and sides), so a house that hears of it later learns
  // what was declared then, not what the war has become since (19 §5: sides as known).
  if ((kind === 'war_declared' || kind === 'war_joined' || kind === 'peace_made') && fact.data?.war) {
    const w = (state.wars || []).find((x) => x.id === fact.data.war);
    if (w) fact.data = { name: w.name, attackers: [...w.attackers], defenders: [...w.defenders], ...fact.data };
  }
  fact.vis = f.vis || { scope: K.vis };
  fact.importance = f.importance != null ? clamp(Math.round(f.importance)) : weigh(state, K.importance, actors, houses);
  if (f.thread) fact.thread = f.thread;
  if (f.alongside) fact._alongside = f.alongside; // part of that fact's moment: it moves with it (redate), for this turn only
  if (f.title) fact.title = f.title;
  fact.text = f.text || templateText(fact, state) || f.title || kind.replace(/_/g, ' ');
  if (f.playback) fact.playback = f.playback;
  state.facts.push(fact);
  return fact;
}
const clamp = (x) => Math.max(1, Math.min(5, x));
function weigh(state, base, actors, houses) {
  const p = state.meta.player;
  const mine = houses.includes(p) || actors.some((id) => state.characters?.[id]?.house === p);
  const great = actors.some((id) => { const c = state.characters?.[id]; const h = c && state.houses?.[c.house]; return h?.lord === c.id && GREAT.has(h.rank); });
  return clamp(base + (mine ? 1 : 0) + (great ? 1 : 0));
}

/** A fact as a card of the chronicle (the shape the story and the UI read); `extra` adds what only the card needs. */
export function asEvent(state, fact, extra = {}) {
  const clock = state.meta.clock || { from: fact.day };
  return {
    title: fact.title || fact.text, text: fact.text, where: fact.place || null, importance: fact.importance, type: KINDS[fact.kind].type,
    houses: fact.houses, day: Math.max(1, fact.day - clock.from + 1), fact: fact.id, ...extra,
  };
}

/**
 * The usual way a subsystem records what happened: `ev` is the card it would have told ({ title, text, where,
 * importance, houses, day, details, mine, bg, … }), `more` the fact's own fields (actors, data, cause, thread, vis).
 * Returns the card, bound to its fact.
 */
export function fact(state, kind, ev, more = {}) {
  const { title, text, where, importance, houses, day, at, type, ...extra } = ev;
  const f = emit(state, kind, { title, text, place: where || null, importance, houses: houses || [], on: day, pos: at, ...more });
  const card = asEvent(state, f, { ...extra, ...(type && type !== KINDS[kind].type ? { type } : {}), ...(at ? { at } : {}) });
  // an undated card is placed by the turn (server/game.js), and its fact follows it there (redate); a card made with
  // its day keeps its fact where it is, whatever the chronicle later does with the card (a week's answers folded in one)
  if (day == null) { delete card.day; Object.defineProperty(card, 'undated', { value: true, writable: true }); }
  return card;
}

/** An undated card, once the turn has given it its day: its fact (and what happened alongside it) moves there too. */
export function redate(state, ev) {
  const clock = state.meta.clock; if (!ev?.undated || !ev.day || !ev.fact || !clock) return;
  const day = Math.max(clock.from, Math.min(clock.to, clock.from + Math.round(ev.day) - 1));
  for (const f of state.facts || []) if (f.id === ev.fact || f._alongside === ev.fact) f.day = day;
  ev.undated = false;
}

/** A fact of the turn in progress, by id. */
export const factById = (state, id) => (state.facts || []).find((f) => f.id === id) || null;

/** Take the facts of the turn out of the state (to be written to the fact log): returns them. */
export function flush(state) {
  const out = state.facts || []; state.facts = [];
  for (const f of out) delete f._alongside;
  return out;
}

/** A card for the chronicle only when the player should read it — its fact is recorded either way: `shown(mine, fact(…))`. */
export const shown = (yes, ev) => (yes ? [ev] : []);
