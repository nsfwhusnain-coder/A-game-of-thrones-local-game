// What matters to the player, in order (docs/gdd/18-headlines.md §2.5; WP N9). The engine's `importance` (1–5) says how
// weighty a thing is in the world; the SCORE says how weighty it is for the one reading, and ranks the stories of a turn:
//
//   score = importance
//         + 1.0  the player's house, its kin or one of its own people is in it                         (mine)
//         + 0.5  it happened at a holding the house owns, or where its hosts stand                    (here)
//         + 1.0  it is the first of its kind this chronicle (the first battle, the first lord dead)    (first)
//         + 0.5  it changes a standing thing (a holding fell, an office changed, war or peace)         (standing)
//         − 1.0  for every card of its archetype beyond the second that scores higher this turn        (fatigue)
//
// Tiers: great ≥ 6.5 · major ≥ 5 · news ≥ 3.5 · minor ≥ 2 · meanwhile below. The model tells the top few; the writer tells
// the rest; the feed, the pins, the toast and the digest all read the tier. Pure: no dice, no clock, no I/O. The one memory
// it needs — which firsts the chronicle has already had — is handed in (`firsts`, kept by the server in `state.firsts`).
import { ARCHETYPE } from './heads.js';
import { milesBetween } from './cluster.js';

export const TIERS = ['meanwhile', 'minor', 'news', 'major', 'great'];
const CUTS = [[6.5, 'great'], [5, 'major'], [3.5, 'news'], [2, 'minor']];
/** The tier of a score. */
export const tierOf = (score) => (CUTS.find(([at]) => score >= at) || [0, 'meanwhile'])[1];
/** Tiers from `tier` up: 'news' → news, major, great. */
export const atLeast = (tier) => TIERS.slice(TIERS.indexOf(tier));

// the things that change how the realm stands: a holding changes hands, an office or a crown, war and peace, a house's end
const STANDING = new Set(['holding_fell', 'holding_granted', 'office_granted', 'office_stripped', 'crowned', 'claim_proclaimed', 'war_declared', 'war_joined', 'peace_made', 'pact_made', 'pact_broken', 'fealty_sworn', 'fealty_renounced', 'succession', 'house_ended', 'attainder', 'regency_begun', 'regency_ended', 'siege_begun', 'rising']);
const NEAR = 40; // miles: "at a holding" includes its wolfswood and winter town

/** The people of the house's blood or marriage: its own, their spouses, and their parents and children. */
export function kinOf(state, me = state.meta?.player) {
  const own = new Set(Object.values(state.characters || {}).filter((c) => c.house === me).map((c) => c.id));
  const kin = new Set(own);
  for (const c of Object.values(state.characters || {})) {
    if (own.has(c.father) || own.has(c.mother) || own.has(c.spouse)) kin.add(c.id);
    if (own.has(c.id)) for (const x of [c.father, c.mother, c.spouse]) if (x && state.characters[x]) kin.add(x);
  }
  return kin;
}

/** What a story is the first of: its lead's kind ("battle"), and for a raven or an envoy whose it was ("letter_arrived:arryn"). Only news of weight 3 or more has a first: a second feast is no milestone. */
export function firstKey(state, story) {
  const lead = (story.facts || []).find((f) => f.id === story.lead) || story.facts?.[0];
  if (!lead || (lead.importance || 1) < 3) return null;
  const from = ['letter_arrived', 'envoy_arrived', 'letter_sent'].includes(lead.kind) ? (lead.houses || []).find((h) => h !== state.meta?.player) : null;
  return from ? `${lead.kind}:${from}` : lead.kind;
}

/**
 * Score the stories of a turn. `stories`: from cluster.js. Returns one row per story, in the order given:
 * { story, id, score, tier, base, why: { mine, here, first, standing, fatigue } }.
 * `opts.firsts`: { key: turn } the chronicle has already had; `opts.kin`: kinOf(state), when the caller has it.
 */
export function rankStories(state, stories, { firsts = state.firsts || {}, kin = kinOf(state) } = {}) {
  const me = state.meta?.player;
  const mine = (s) => (s.houses || []).includes(me) || (s.actors || []).some((id) => kin.has(id)) || (s.facts || []).some((f) => (f.actors || []).some((id) => kin.has(id)) || (f.houses || []).includes(me));
  const stands = (Object.values(state.parties || {})).filter((p) => p.owner === me && p.pos);
  const here = (s) => {
    const h = s.place && state.holdings?.[s.place]; if (!h) return false;
    return h.owner === me || stands.some((p) => p.at === s.place || milesBetween(p.pos, h.pos) <= NEAR);
  };
  const rows = stories.map((s) => {
    const why = { mine: mine(s) ? 1 : 0, here: here(s) ? 0.5 : 0, first: 0, standing: (s.facts || []).some((f) => STANDING.has(f.kind)) ? 0.5 : 0, fatigue: 0 };
    const key = firstKey(state, s); if (key && !(key in firsts)) why.first = 1;
    const base = (s.importance || 1) + why.mine + why.here + why.first + why.standing;
    return { story: s, id: s.id, base, score: base, why, archetype: s.archetype || ARCHETYPE[(s.facts || []).find((f) => f.id === s.lead)?.kind] || 'other', key };
  });
  // fatigue: of one archetype, the heaviest two are told at full weight; each one after them loses a point for every card
  // beyond the second that is ahead of it. (Only ranks among themselves: ties keep the story's own order.)
  const byArch = new Map();
  rows.forEach((r, i) => byArch.set(r.archetype, [...(byArch.get(r.archetype) || []), [r, i]]));
  for (const list of byArch.values()) {
    list.sort((a, b) => b[0].base - a[0].base || a[1] - b[1]);
    list.forEach(([r], k) => { r.why.fatigue = k > 1 ? 1 - k : 0; r.score = r.base + r.why.fatigue; });
  }
  for (const r of rows) { r.score = Math.round(r.score * 100) / 100; r.tier = tierOf(r.score); }
  return rows;
}

/** The rows, best first (ties: the story's own order). */
export const byScore = (rows) => rows.map((r, i) => [r, i]).sort((a, b) => b[0].score - a[0].score || a[1] - b[1]).map(([r]) => r);

/** The firsts a turn's told stories add to the chronicle's memory: news and above only (a minor thing is no milestone). */
export function noteFirsts(state, rows, firsts = {}) {
  const out = { ...firsts };
  for (const r of rows) if (r.key && !(r.key in out) && TIERS.indexOf(r.tier) >= TIERS.indexOf('news')) out[r.key] = state.meta?.turn ?? 0;
  return out;
}
