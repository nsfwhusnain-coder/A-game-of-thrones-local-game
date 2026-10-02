// Stories, not facts (docs/gdd/04-ai-system.md §6.1, docs/gdd/18-headlines.md §2.4 C1–C7). The facts the player's house
// reads this turn are gathered into stories — one card per thing that happened, not one per line of the ledger and not one
// per week — each with its archetype, its lead fact, its importance (its weightiest fact), its place, its days, the people in
// it, and whose eyes it is told through. There is no cap: every fact of importance 2 or more is in exactly one story (the
// model tells the top few, the deterministic writer the rest; that is N5's). The small change of the realm (importance 1:
// a feast in a far castle, the steward's notes, the weather) and the small journeys of other people's hosts are no story;
// they go into one "Meanwhile" line.
//
// How the stories are made (the order matters):
//   1. facts of one thread, one host (party) or one order/intent/beat of the story are candidates for one story (weak links);
//      a fact and the fact that caused it, a fact "alongside" another, the narrator's `together` hint, and facts of the SAME
//      day, place and people (C5: a battle, its captives and its dead) are one story for certain (strong links)
//   2. a story of more than six facts that is more than one archetype (or that buries news of weight 4 in another kind of story)
//      is cut at the archetype's edge, along the strong links (C3: the muster is one card and the refusal in it another); a heap
//      of more than eight facts at several places is cut by place
//   3. hosts that leave for one place with no other business (a single set_out each, of no cause and no thread) are rolled up,
//      three or more, into ONE story (C2: five hosts leave for Winterfell); the facts stay in it, in the order of their days
//   4. each story's lead is its weightiest fact, then the kind that reads as the news (heads.js LEDE: a death beats an
//      arrival, the result beats its cause), then the earliest id — never the order of the list (C4)
//   5. a rolled-up story of other people's journeys that touches neither the viewer's house nor its seat is no news (C7)
// News that reached the chronicle late is told apart from what was seen (B-32a): a fact carries `heard` ({ via, happened },
// as engine/knowledge.js holdNews stamps its card) and `late: true`; facts that came by another word, or on another day, are
// never one story. A story carries the `heard` of its facts, and `late: true` when any of them is.
// The order of the stories is kept as it was (the recordings the narrator's replay tests read are keyed by it): earliest day
// first, the weightier first on a day, facts in a story by day then id, ids S1…Sk in that order. The list's own order never
// matters: the same facts in any order make the same stories.
import { KINDS } from './kinds.js';
import { ARCHETYPE, LEDE, fightKey } from './heads.js';
import { MILES_PER_UNIT } from '../../../data/geography.js';

const CAUSED = new Set(['order', 'intent', 'beat']); // causes that bind (a rule, like "the muster", runs everywhere at once)
const CUT_AT = 6; // a story of more than this many facts of two archetypes is two stories (C3)
const HEAVY = 4; // news of this weight is never buried in another kind of story
const HEAP = 8; // a story of more than this many facts at two places is two stories, unless it is a roll-up
const RUN_GAP = 2; // days between two battles of the same hosts that are still one running fight
const ROLL_AT = 3; // three of a kind that share a cause, a thread or a road's end are one card (C2)
const ROLL_MAX = 3; // and only news of this weight or less; heavier news is told one by one
/** Where each kind of host-fact is going, when three of them are one card: a host sets out or answers for a place, joins a host, reaches a place. */
const ROAD = { set_out: (f) => f.data?.to, call_answered: (f) => f.data?.to, host_joined: (f) => f.data?.host, arrived: (f) => f.place };

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

// ── Orders that do not depend on the order of the list ───────────────────────────────────────────────────────────────
/** Fact ids in the order they were made: f3.9 before f3.10 (a string compare would put them the other way). */
function byId(a, b) {
  const x = /^f(\d+)\.(\d+)$/.exec(a.id), y = /^f(\d+)\.(\d+)$/.exec(b.id);
  if (x && y) return x[1] - y[1] || x[2] - y[2];
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
const byDay = (a, b) => a.day - b.day || byId(a, b);
const archetypeOf = (f) => ARCHETYPE[f.kind] || 'other';
/** How a fact reached the chronicle: seen, or heard by a word on a day. Facts of different arrival are never one story. */
const arrivalOf = (f) => (f.heard ? `${f.heard.via}|${f.kind === 'battle' || f.kind === 'rout' ? '' : f.heard.happened}` : 'seen'); // (the days of a running fight reach a far house one raven at a time: they are still one fight)
/** The weightiest fact, then the kind that reads as the news, then the earliest: the lead of a story (C4). */
const byLead = (a, b) => b.importance - a.importance || (LEDE[b.kind] ?? 0) - (LEDE[a.kind] ?? 0) || byId(a, b);
const leadOf = (facts) => [...facts].sort(byLead)[0];

/** The people a fact is about: its actors and anyone its data names (the captor, the slayer, the bride). */
function folkOf(state, f) {
  const out = new Set(f.actors || []);
  const chars = state.characters || {};
  for (const v of Object.values(f.data || {})) for (const x of Array.isArray(v) ? v : [v]) if (typeof x === 'string' && chars[x]) out.add(x);
  return out;
}

/** A union–find over indexes; the smaller index is always the root, so the groups do not depend on the order of joining. */
function forest(n) {
  const up = Array.from({ length: n }, (_, i) => i);
  const root = (i) => (up[i] === i ? i : (up[i] = root(up[i])));
  const join = (i, j) => { const a = root(i), b = root(j); if (a !== b) up[Math.max(a, b)] = Math.min(a, b); };
  return { root, join };
}

/** The kind that three or more facts of one story share, of news of weight 3 or less and of the lead's own archetype: a roll-up (C2). */
function rollKind(facts) {
  const arch = archetypeOf(leadOf(facts)); const count = new Map();
  for (const f of facts) if (f.importance <= ROLL_MAX && archetypeOf(f) === arch) count.set(f.kind, (count.get(f.kind) || 0) + 1);
  return [...count].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).find(([, c]) => c >= ROLL_AT)?.[0] || null;
}

/** Texture, not news: a kind that is of weight 1 by nature (a lord's mood, a feast in a far hall, the weather) and is only 2 by a lord's rank. */
const ambient = (f) => (KINDS[f.kind]?.importance ?? 2) <= 1;

/** Whether a fact is the viewer's business: their house is in it, or it is at (or on the road to) their seat. */
function touches(state, f, seat) {
  const me = state.meta?.player;
  if ((f.houses || []).includes(me) || (f.actors || []).some((id) => state.characters?.[id]?.house === me)) return true;
  return !!seat && (f.place === seat || f.data?.to === seat || f.data?.from === seat);
}

/**
 * Gather `facts` into stories. opts: { together: [[fact ids that are one piece of news]] } (`max` is no longer read: no cap).
 * Returns { stories: [{ id: 'S1', facts, lead (a fact id), archetype, rolled? (true for a roll-up), importance, place, days: [first,
 *   last] (days of the turn), actors, houses, type, pov: { id?, name }, heard?, late? }], meanwhile: [facts], rest: [] }
 * — stories earliest day first, the weightier first on a day.
 */
export function clusterFacts(state, facts, { together = [] } = {}) {
  const seen = new Set(); facts = facts.filter((f) => !seen.has(f.id) && seen.add(f.id)); // a fact is in one story, however often it is handed in
  const news = facts.filter((f) => f.importance > 1).sort(byDay);
  const small = facts.filter((f) => f.importance <= 1).sort(byDay);
  const n = news.length;
  const strong = forest(n), any = forest(n);
  const arrival = news.map(arrivalOf);
  const folk = news.map((f) => folkOf(state, f));
  const index = new Map(news.map((f, i) => [f.id, i]));
  const bind = (i, j) => { if (arrival[i] === arrival[j]) { strong.join(i, j); any.join(i, j); } }; // strong: never cut
  const byKey = new Map();
  const link = (k, i) => { // weak: a candidate for one story, cut if it grows too big and too mixed
    if (!k) return; const key = `${k}|${arrival[i]}`;
    if (byKey.has(key)) any.join(byKey.get(key), i); else byKey.set(key, i);
  };
  // a running fight: the same two hosts meeting again the next day, and the next, on the same ground, is one battle that lasts (a pursuit was told as seven victories)
  const lastFight = new Map();
  news.forEach((f, i) => {
    if (f.kind !== 'battle' || !f.data?.attacker || !f.data?.defender) return;
    const pair = fightKey(f); const prev = lastFight.get(pair);
    const run = prev && f.day - prev.day <= RUN_GAP ? prev.run : `${pair}@${f.day}`;
    lastFight.set(pair, { day: f.day, run }); link(`b:${run}`, i);
  });
  news.forEach((f, i) => {
    if (f.thread) link(`t:${f.thread}`, i);
    if (f.data?.party) link(`p:${f.data.party}`, i);
    if (f.cause && CAUSED.has(f.cause.type) && f.cause.ref) link(`c:${f.cause.type}:${f.cause.ref}`, i);
    if (f.cause?.ref && index.has(f.cause.ref)) bind(index.get(f.cause.ref), i); // a fact caused by another fact
    if (f._alongside && index.has(f._alongside)) bind(index.get(f._alongside), i);
  });
  for (const g of together) { const ids = g.filter((x) => index.has(x)); for (const x of ids.slice(1)) bind(index.get(ids[0]), index.get(x)); }
  // C5: the same day, the same place, the same people — a battle, its captives and its dead. (People: someone in common; a
  // fact that names no one, a village burned, is of the house it burned.)
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const a = news[i], b = news[j];
    if (!a.place || a.place !== b.place || a.day !== b.day) continue;
    const named = folk[i].size && folk[j].size;
    // (a fact that names no one is of the house it touched, and of the same kind of matter: a sworn knight's grievance at the hall where the banners gather is no part of the muster, TX6)
    if (named ? [...folk[i]].some((x) => folk[j].has(x)) : archetypeOf(a) === archetypeOf(b) && (a.houses || []).some((h) => (b.houses || []).includes(h))) bind(i, j);
  }

  // the candidate stories, each a list of indexes; C3 cuts the big and mixed ones
  const comps = new Map();
  for (let i = 0; i < n; i++) { const r = any.root(i); comps.set(r, [...(comps.get(r) || []), i]); }
  const factsOf = (idx) => idx.map((i) => news[i]);
  /** Regroup the indexes of a component: atoms (held by strong links, never cut) are kept whole and gather by `keyOf(the atom's lead)`. */
  const regroup = (idx, keyOf) => {
    const atoms = new Map();
    for (const i of idx) { const r = strong.root(i); atoms.set(r, [...(atoms.get(r) || []), i]); }
    const groups = new Map();
    for (const atom of atoms.values()) { const k = keyOf(leadOf(factsOf(atom))); groups.set(k, [...(groups.get(k) || []), ...atom]); }
    return [...groups.values()].map((g) => g.sort((a, b) => a - b));
  };
  let groups = [];
  for (const idx of comps.values()) {
    const fs = factsOf(idx); const lead = archetypeOf(leadOf(fs));
    // C3: a big story of two archetypes is cut at the archetype's edge; so is a small one that holds heavy news of another kind
    // (a refusal in a muster is its own card, however few answered)
    const mixed = new Set(fs.map(archetypeOf)).size > 1 && (idx.length > CUT_AT || fs.some((f) => f.importance >= HEAVY && archetypeOf(f) !== lead));
    const parts = mixed ? regroup(idx, archetypeOf) : [idx];
    for (const p of parts) {
      const places = new Set(factsOf(p).map((f) => f.place).filter(Boolean));
      groups.push(...(p.length > HEAP && places.size > 1 && !rollKind(factsOf(p)) ? regroup(p, (f) => f.place || '') : [p])); // a heap at many places
    }
  }

  // C2: hosts that answer, leave for, join or reach one place, each with no other business, are one story when there are three.
  // A host's business is its own facts of the same day, place and people (the host raised to answer the call, told with the
  // answer); a voyage or a delay on other days and at other places is other business, and stays with its host.
  const roads = new Map();
  for (const g of groups) {
    const fs = factsOf(g);
    if (fs.some((f) => f.importance > ROLL_MAX)) continue;
    const legs = fs.filter((f) => typeof ROAD[f.kind]?.(f) === 'string');
    if (!legs.length) continue;
    const road = `${legs[0].kind}|${arrival[g[0]]}|${ROAD[legs[0].kind](legs[0])}`;
    const own = new Set(legs.map((f) => strong.root(index.get(f.id))));
    if (legs.some((f) => `${f.kind}|${arrival[g[0]]}|${ROAD[f.kind](f)}` !== road) || fs.some((f) => !own.has(strong.root(index.get(f.id))))) continue;
    roads.set(road, [...(roads.get(road) || []), g]);
  }
  for (const list of roads.values()) if (list.length >= ROLL_AT) groups = [...groups.filter((g) => !list.includes(g)), list.flat().sort((a, b) => a - b)];

  const seat = state.houses?.[state.meta?.player]?.seat;
  const clock = state.meta?.clock || { from: Math.min(...facts.map((f) => f.day), Infinity) };
  const made = []; const meanwhile = [...small];
  for (const g of groups) {
    const st = story(state, factsOf(g), clock);
    // C7: the small journeys of other people (three hosts of the Reach on the road to a feast, or a minor lord's lone rider) are the
    // Meanwhile; hosts for the viewer's seat are news. So is the texture of the realm (a lord of the Reach grows weary), which the
    // emitter raised to 2 only because he is a great lord. A great lord's journey is of weight 3 and stays news.
    if (st.importance <= 2 && !st.facts.some((f) => touches(state, f, seat)) && (st.archetype === 'march' || st.facts.every(ambient))) { meanwhile.push(...st.facts); continue; }
    made.push(st);
  }
  const leadFact = (s) => s.facts.find((f) => f.id === s.lead);
  const stories = made.sort((a, b) => a.days[0] - b.days[0] || b.importance - a.importance || byId(leadFact(a), leadFact(b)));
  stories.forEach((s, k) => { s.id = `S${k + 1}`; });
  return { stories, meanwhile: meanwhile.sort(byDay), rest: [] };
}

/** One story from its facts (already in the order of their days). */
function story(state, facts, clock) {
  const top = leadOf(facts);
  const count = new Map();
  for (const f of facts) for (const a of f.actors || []) if (state.characters?.[a]) count.set(a, (count.get(a) || 0) + (f === top ? 10 : 1));
  const actors = [...count.keys()].sort((a, b) => count.get(b) - count.get(a) || (a < b ? -1 : 1));
  const places = facts.map((f) => f.place).filter(Boolean);
  const day = (f) => Math.max(1, f.day - (clock.from ?? f.day) + 1);
  const type = KINDS[top.kind]?.type || 'court';
  const kind = rollKind(facts);
  // hosts that ride to one place are told at that place (the pins, the prompt); else where the lead was
  const ends = new Set(facts.filter((f) => f.kind === kind).map((f) => f.data?.to));
  const place = kind && ends.size === 1 && state.holdings?.[[...ends][0]] ? [...ends][0] : top.place || places[0] || null;
  // the eyes it is told through: the weightiest person there, alive and free to see it; else a witness of the place
  const seer = actors.map((id) => state.characters[id]).find((c) => c?.alive && !/imprisoned|captive/.test(c.status || '')) || actors.map((id) => state.characters[id])[0];
  const pool = WITNESSES[type] || WITNESSES.court;
  const pov = seer ? { id: seer.id, name: seer.name } : { name: `${pool[hash(`${place}|${top.id}`) % pool.length]}${place && state.holdings?.[place] ? ` at ${state.holdings[place].name}` : ''}` };
  const heard = facts[0].heard; // every fact of a story came the same way (facts of another arrival are never joined)
  return {
    id: null, facts, importance: top.importance, place, days: [day(facts[0]), day(facts.at(-1))], actors,
    houses: [...new Set(facts.flatMap((f) => f.houses || []))], type, pov,
    archetype: archetypeOf(top), lead: top.id, ...(kind ? { rolled: true } : {}),
    ...(heard ? { heard } : {}), ...(facts.some((f) => f.late) ? { late: true } : {}),
  };
}

/** Miles between two points of the atlas. */
export const milesBetween = (a, b) => (a && b ? Math.hypot(a[0] - b[0], a[1] - b[1]) * MILES_PER_UNIT : Infinity);
