// Stories, not facts (docs/gdd/04-ai-system.md §6.1). The narrator is not handed forty loose facts: the facts the
// player's house reads this turn are gathered into at most eight stories — facts that share a thread, a party, a cause,
// or a place within two days of each other are one story — each with its importance (its weightiest fact), its place,
// its days, the people in it, and whose eyes it is told through. The small change of the realm (importance 1: a feast
// in a far castle, the steward's notes, the weather) is no story; it goes into one "Meanwhile" line.
import { KINDS } from './kinds.js';
import { MILES_PER_UNIT } from '../../../data/geography.js';

const MAX_STORIES = 8;
const CAUSED = new Set(['order', 'intent', 'beat']); // causes that bind (a rule, like "the muster", runs everywhere at once)

/** A witness from the place's household, when no one the facts name was there: steady for a place (no dice drawn). */
const WITNESSES = {
  war: ['a man-at-arms on the walls', 'an outrider of the host', 'a smith\'s boy who followed the host', 'a camp cook'],
  court: ['a steward of the household', 'a serving girl', 'a septon', 'a page'],
  diplomacy: ['the raven-keeper', 'a maester\'s acolyte', 'a steward of the household'],
  intrigue: ['a serving girl', 'a groom in the stables', 'a washerwoman'],
  economy: ['a steward of the household', 'a miller', 'a tax-gatherer'],
  disaster: ['a septon', 'a smallfolk woman', 'a ferryman'],
  religion: ['a septon', 'a septa'], magic: ['a raven-keeper', 'a hedge knight'],
};
const hash = (s) => [...String(s)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);

/**
 * Gather `facts` into stories. opts: { max (8), together: [[fact ids that are one piece of news]] }.
 * Returns { stories: [{ id: 'S1', facts, importance, place, days: [first, last] (days of the turn), actors, houses,
 *   type, pov: { id?, name } }], meanwhile: [facts], rest: [facts in stories beyond the max] } — stories weightiest first.
 */
export function clusterFacts(state, facts, { max = MAX_STORIES, together = [] } = {}) {
  const small = facts.filter((f) => f.importance <= 1);
  const big = facts.filter((f) => f.importance > 1);
  // union–find over the facts that are news
  const up = big.map((_, i) => i);
  const root = (i) => (up[i] === i ? i : (up[i] = root(up[i])));
  const join = (i, j) => { const a = root(i), b = root(j); if (a !== b) up[Math.max(a, b)] = Math.min(a, b); };
  const byKey = new Map();
  const link = (k, i) => { if (!k) return; if (byKey.has(k)) join(byKey.get(k), i); else byKey.set(k, i); };
  const index = new Map(big.map((f, i) => [f.id, i]));
  big.forEach((f, i) => {
    if (f.thread) link(`t:${f.thread}`, i);
    if (f.data?.party) link(`p:${f.data.party}`, i);
    if (f.cause && CAUSED.has(f.cause.type) && f.cause.ref) link(`c:${f.cause.type}:${f.cause.ref}`, i);
    if (f.cause?.ref && index.has(f.cause.ref)) join(index.get(f.cause.ref), i); // a fact caused by another fact
    if (f._alongside && index.has(f._alongside)) join(index.get(f._alongside), i);
  });
  for (const g of together) { const ids = g.filter((x) => index.has(x)); for (const x of ids.slice(1)) join(index.get(ids[0]), index.get(x)); }
  // a place within two days: facts at the same place are one story if their days are near
  const at = new Map();
  big.forEach((f, i) => { if (f.place) at.set(f.place, [...(at.get(f.place) || []), i]); });
  for (const list of at.values()) for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) if (Math.abs(big[list[a]].day - big[list[b]].day) <= 2) join(list[a], list[b]);

  const groups = new Map();
  big.forEach((f, i) => { const r = root(i); groups.set(r, [...(groups.get(r) || []), f]); });
  const clock = state.meta.clock || { from: Math.min(...facts.map((f) => f.day), Infinity) };
  const all = [...groups.values()].map((fs) => story(state, fs.sort((a, b) => a.day - b.day || (a.id < b.id ? -1 : 1)), clock))
    .sort((a, b) => b.importance - a.importance || a.days[0] - b.days[0] || (a.facts[0].id < b.facts[0].id ? -1 : 1));
  const stories = all.slice(0, max).sort((a, b) => a.days[0] - b.days[0] || b.importance - a.importance);
  stories.forEach((s, k) => { s.id = `S${k + 1}`; });
  return { stories, meanwhile: small, rest: all.slice(max).flatMap((s) => s.facts) };
}

function story(state, facts, clock) {
  const top = [...facts].sort((a, b) => b.importance - a.importance)[0];
  const count = new Map();
  for (const f of facts) for (const a of f.actors || []) if (state.characters?.[a]) count.set(a, (count.get(a) || 0) + (f === top ? 10 : 1));
  const actors = [...count.keys()].sort((a, b) => count.get(b) - count.get(a));
  const places = facts.map((f) => f.place).filter(Boolean);
  const place = top.place || places[0] || null;
  const day = (f) => Math.max(1, f.day - (clock.from ?? f.day) + 1);
  const type = KINDS[top.kind]?.type || 'court';
  // the eyes it is told through: the weightiest person there, alive and free to see it; else a witness of the place
  const seer = actors.map((id) => state.characters[id]).find((c) => c?.alive && !/imprisoned|captive/.test(c.status || '')) || actors.map((id) => state.characters[id])[0];
  const pool = WITNESSES[type] || WITNESSES.court;
  const pov = seer ? { id: seer.id, name: seer.name } : { name: `${pool[hash(`${place}|${top.id}`) % pool.length]}${place && state.holdings?.[place] ? ` at ${state.holdings[place].name}` : ''}` };
  return {
    id: null, facts, importance: top.importance, place, days: [day(facts[0]), day(facts.at(-1))], actors,
    houses: [...new Set(facts.flatMap((f) => f.houses || []))], type, pov,
  };
}

/** Miles between two points of the atlas. */
export const milesBetween = (a, b) => (a && b ? Math.hypot(a[0] - b[0], a[1] - b[1]) * MILES_PER_UNIT : Infinity);
