// The truth series (docs/gdd/19-realm-ledger.md §3.1): one cheap row of every house's figures each turn, kept in the
// save (so undo unmakes it), thinned so a long game stays small, and made without one draw of the dice.
//
//   state.realmStats = { v: 1, fields: FIELDS, samples: [ { day, turn, h: { stark: [ …one int per field… ] } } ], wars: {} }
//
// Only the viewer's own house and its sworn houses are ever read back from here (view.js); every other house is known
// to the player by what was observed of it (estimate.js). `wars` is the room for the war-score series (WP R6).
import { FIELDS, figuresOf, holdingsIndex } from './figures.js';
import { dayNumber } from '../time.js';

/** A week is the least between two samples: a shorter turn takes the place of the last one, so a stop-and-go jump adds none. */
export const WEEK = 7;
/** The newest samples are kept whole; older ones one to a four-week bucket; never more than 48 in all (about four years of moons). */
export const KEEP_NEW = 16;
export const KEEP_MAX = 48;
export const BUCKET = 28;

const LISTED = new Set(['crown', 'paramount', 'major', 'order', 'tribe', 'city_state', 'company', 'exile']);

/**
 * The houses that are sampled (§3.1): the houses of standing, the player's own, and the minor houses sworn to one of
 * those (in the 298 scenario that is nearly every house there is). A house that is no more is left out, its old rows stay.
 */
export function listedHouses(state) {
  const p = state.meta?.player; const houses = state.houses || {};
  return Object.values(houses)
    .filter((h) => h.status !== 'extinct' && (LISTED.has(h.rank) || h.id === p || (h.rank === 'minor' && LISTED.has(houses[h.liege]?.rank))))
    .map((h) => h.id).sort();
}

/** Older samples one to a four-week bucket (the first of each, by the day's own number, so thinning twice changes nothing). */
export function thin(samples) {
  if (samples.length <= KEEP_NEW) return samples.slice();
  const older = samples.slice(0, samples.length - KEEP_NEW); const kept = []; let bucket = null;
  for (const s of older) { const b = Math.floor(s.day / BUCKET); if (b !== bucket) { kept.push(s); bucket = b; } }
  return [...kept.slice(-(KEEP_MAX - KEEP_NEW)), ...samples.slice(-KEEP_NEW)];
}

/**
 * Take this turn's sample of every listed house, from the settled books, and keep it (thinned). Returns the sample —
 * the whole row, which the turn's record keeps unthinned. A state without a series gets an empty one first.
 */
export function sampleRealm(state) {
  const R = state.realmStats = state.realmStats || { v: 1, fields: [...FIELDS], samples: [], wars: {} };
  const day = dayNumber(state.meta.date); const held = holdingsIndex(state);
  const h = {};
  for (const id of listedHouses(state)) { const f = figuresOf(state, id, held); h[id] = FIELDS.map((k) => f[k]); }
  const sample = { day, turn: state.meta.turn, h };
  let S = R.samples;
  while (S.length && S.at(-1).day >= day) S = S.slice(0, -1);        // a clock turned back (or the same day again): the newer word is the truth
  if (S.length && day - S.at(-1).day < WEEK) S = S.slice(0, -1);    // a short turn takes the place of the week's sample
  R.samples = thin([...S, sample]);
  return sample;
}

/** `[[day, value], …]` of one field of one house, oldest first — the shape the view sends; `[]` for what is not recorded. */
export function seriesOf(state, house, field) {
  const R = state.realmStats; const i = (R?.fields || FIELDS).indexOf(field);
  if (!R || i < 0) return [];
  const out = [];
  for (const s of R.samples) if (s.h[house]) out.push([s.day, s.h[house][i]]);
  return out;
}
