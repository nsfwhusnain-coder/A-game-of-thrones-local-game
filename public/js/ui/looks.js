// What a face is told about the person it is of (docs/gdd/12-ui-ux.md §15.1; WP F7): who their parents are (a child resembles them), the marks the story has left on them (a scar from a wound
// that healed), and how they are toward the lord in an audience. Pure: read from the state the player's house already holds; the painter (ui/portrait.js) does the rest.
import { moodWord } from '../shared/temperament.js';

const hash = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

const kinKept = new WeakMap();
/** `{ parentsOf(c) → [father|null, mother|null], houseOf(c) → house }`, for the game in hand (kept per state object). */
export function kinFor(state) {
  let k = kinKept.get(state); if (k) return k;
  k = { parentsOf: (c) => [c?.father && state.characters?.[c.father], c?.mother && state.characters?.[c.mother]].map((x) => x || null), houseOf: (c) => state.houses?.[c?.house] || null };
  kinKept.set(state, k); return k;
}

const SCAR_PERCENT = 45; // not every wound that heals leaves one
const markKept = new WeakMap();
/**
 * The marks the story has left on a person: a `scar` if a wound of theirs has healed (the chronicle told of it: a "recovers" in the history) and the wound was of the kind that scars —
 * decided by their id alone, so it is the same every time; and any the state names itself (\`marks\`: 'scar', 'eyepatch', 'burned'…).
 */
export function marksOf(state, id) {
  const c = state.characters?.[id]; if (!c) return [];
  const turn = state.meta?.turn; let idx = markKept.get(state);
  if (!idx || idx.turn !== turn || idx.n !== (state.history || []).length) {
    const healed = new Set();
    for (const t of state.history || []) for (const e of t.events || []) if (e.kind === 'recovered') for (const w of e.who || e.actors || []) healed.add(w);
    idx = { turn, n: (state.history || []).length, healed }; markKept.set(state, idx);
  }
  const out = new Set(Array.isArray(c.marks) ? c.marks : []);
  if (idx.healed.has(id) && hash(`${id}:scar`) % 100 < SCAR_PERCENT) out.add('scar');
  return [...out].sort();
}

/** The mood a face shows in an audience: the word of this turn's mood toward the lord, or '' (the tone of a person not yet spoken to is their own). */
export function moodNow(state, id) {
  const m = state.moods?.[id]; if (!m || m.turn !== state.meta?.turn) return '';
  return m.word || moodWord(m);
}

/** The options the painter takes: the parents, the marks, and (when asked) the mood. */
export function lookOpts(state, c, { mood = '' } = {}) {
  if (!state || !c) return {};
  return { kin: kinFor(state), marks: marksOf(state, c.id), mood };
}
