// The narration validator (docs/gdd/04-ai-system.md §6.4). The narrator is told stories made of facts; this is how the
// game knows it told them and nothing else. Each event is read for:
//   names        a person named doing something must be in the story, or at its place on its days — or only thought
//                of, written to, sent for (a man in King's Landing may be remembered, not seen riding into Winterfell)
//   arrival      no one arrives, reaches or joins anywhere unless a fact of the story says they did
//   numbers      every number, in digits or words, is one of the story's (±2 %), or a small count (≤ 12)
//   places       a castle named is the story's place, near it, on a road in it, or named by its facts
//   anachronism  nothing from a later chapter than this game has reached (data/anachronisms.js)
//   game words   no morale, no turn, no player; none of the tired phrases of 10 §8.2
//   script       Latin letters only (the leak of B-27)
//   maturity     no explicit description (10 §8.5)
// The matchers are shared: the coherence checker (15 §3) and the chronicle's name links (12) read text the same way.
import { personAliases, slug } from '../../../public/js/engine/ids.js';
import { partyOf } from '../../../public/js/engine/parties.js';
import { whereabouts } from '../../../public/js/shared/roads.js';
import { milesBetween } from '../../../public/js/engine/facts/cluster.js';
import { anachronismsIn } from '../../../public/data/anachronisms.js';
import { hasForeignScript } from '../schema.js';
import { FORBIDDEN, FORBIDDEN_EXACT } from '../../../public/data/style.js';

const NEAR = 40; // miles: "at Winterfell" includes the wolfswood and the winter town
const ROAD = 25; // miles either side of a road a party walks this turn

// ── Reading names ────────────────────────────────────────────────────────────────────────────────────────────────────
const tables = new WeakMap();
function tablesFor(state) {
  let t = tables.get(state);
  if (t && t.n === Object.keys(state.characters).length) return t;
  const people = personAliases(state, { alive: false });
  // "Jon Umber" for Jon "Greatjon" Umber: the name without its byname
  for (const c of Object.values(state.characters)) { const plain = slug(c.name.replace(/\s*"[^"]+"\s*/g, ' ')); if (plain && !people.has(plain)) people.set(plain, c.id); }
  const places = new Map();
  for (const h of Object.values(state.holdings || {})) for (const v of [slug(h.name), slug(h.name).replace(/^the_/, '')]) if (v && !places.has(v)) places.set(v, h.id);
  const houses = new Set(Object.values(state.houses || {}).map((h) => slug(h.name)));
  const parties = new Map(Object.values(state.parties || {}).filter((p) => p.name).map((p) => [slug(p.name).replace(/^the_/, ''), p.id]));
  t = { n: Object.keys(state.characters).length, people, places, houses, parties };
  tables.set(state, t);
  return t;
}
const words = (sentence) => [...sentence.matchAll(/[A-Za-z][A-Za-z'’-]*/g)].map((m) => ({ w: m[0].replace(/['’]s$/, ''), at: m.index, end: m.index + m[0].length }));
const cap = (w) => /^[A-Z]/.test(w);
export const sentencesOf = (text) => String(text || '').replace(/\s+/g, ' ').split(/(?<=[.!?…]["”’]?)\s+(?=["“‘]?[A-Z0-9])/).filter(Boolean);

/** The people, places and parties named in a sentence: [{ kind, id, text, from, to (word indexes) }], longest names first. */
export function namesIn(state, sentence) {
  const T = tablesFor(state); const ws = words(sentence); const out = [];
  for (let i = 0; i < ws.length;) {
    if (!cap(ws[i].w) && !(ws[i].w.toLowerCase() === 'the' && ws[i + 1] && cap(ws[i + 1].w))) { i++; continue; }
    let hit = null;
    for (let n = Math.min(5, ws.length - i); n >= 1 && !hit; n--) {
      const part = ws.slice(i, i + n); if (!cap(part.at(-1).w)) continue;
      const key = slug(part.map((x) => x.w).join(' '));
      const prev = ws[i - 1]?.w.toLowerCase();
      // a lone given name before another capitalised word is someone's full name the roster does not know ("Jon Connington")
      const joined = n === 1 && ws[i + 1] && cap(ws[i + 1].w) && sentence.slice(ws[i].end, ws[i + 1].at) === ' ';
      if (T.people.has(key) && !(n === 1 && (T.houses.has(key) || joined))) hit = { kind: 'person', id: T.people.get(key), n };
      else if (prev !== 'house' && T.places.has(key) && !(n === 1 && T.houses.has(key) && cap(ws[i + 1]?.w || ''))) hit = { kind: 'place', id: T.places.get(key), n };
      else if (n >= 2 && T.parties.has(key.replace(/^the_/, ''))) hit = { kind: 'party', id: T.parties.get(key.replace(/^the_/, '')), n };
    }
    if (hit) { out.push({ ...hit, text: sentence.slice(ws[i].at, ws[i + hit.n - 1].end), from: i, to: i + hit.n }); i += hit.n; } else i++;
  }
  return out;
}

// ── Reading numbers ──────────────────────────────────────────────────────────────────────────────────────────────────
const UNITS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, score: 20, dozen: 12 };
const SCALE = { hundred: 100, thousand: 1000 };
/** Every number the text states: digits (not ordinals, not "298 AC") and number words ("three thousand eight hundred"). */
export function numbersIn(text) {
  const t = String(text || '');
  const out = [];
  for (const m of t.matchAll(/\b\d{1,3}(?:,\d{3})+\b|\b\d+(?:\.\d+)?\b/g)) {
    const after = t.slice(m.index + m[0].length, m.index + m[0].length + 4);
    if (/^(st|nd|rd|th)\b/i.test(after) || /^\s*AC\b/.test(after)) continue;
    out.push(Number(m[0].replace(/,/g, '')));
  }
  const toks = t.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  for (let i = 0; i < toks.length; i++) {
    const w = toks[i];
    if (!(w in UNITS) && !(w in SCALE)) continue;
    // "a" and "an" count only before a scale ("a thousand"), "score" and "dozen" only after a count or "a"
    if ((w === 'a' || w === 'an') && !(toks[i + 1] in SCALE) && !['score', 'dozen'].includes(toks[i + 1])) continue;
    let total = 0, cur = 0, j = i, any = false;
    for (; j < toks.length; j++) {
      const x = toks[j];
      if ((x === 'a' || x === 'an') && j !== i) break;
      if (x in UNITS) { if (['score', 'dozen'].includes(x)) cur = (cur || 1) * UNITS[x]; else cur += UNITS[x]; any = true; }
      else if (x === 'hundred') { cur = (cur || 1) * 100; any = true; }
      else if (x === 'thousand') { total += (cur || 1) * 1000; cur = 0; any = true; }
      else if (x === 'and' && (toks[j + 1] in UNITS) && any) continue;
      else break;
    }
    // ("hundreds", "thousands" are no number at all: they are not words of the table)
    if (any) out.push(total + cur);
    i = j - 1;
  }
  return out;
}
/** Every number a story's facts hold: in their data, their texts and their titles. */
export function numbersOf(facts) {
  const out = new Set();
  const walk = (v) => { if (typeof v === 'number' && Number.isFinite(v)) out.add(Math.round(Math.abs(v))); else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
  for (const f of facts) { walk(f.data); for (const n of numbersIn(`${f.title || ''} ${f.text || ''}`)) out.add(n); }
  return [...out];
}

// ── The forbidden words (10 §8.2; data/style.js) ────────────────────────────────────────────────────────────────────────────────────
export const GAME_WORDS = [...FORBIDDEN.map((w) => new RegExp(w, 'i')), ...FORBIDDEN_EXACT.map((w) => new RegExp(w))];
const MATURE = /\b(genitals?|intercourse|orgasm\w*|cunt)\b/i;

// ── The story's world ────────────────────────────────────────────────────────────────────────────────────────────────
const ARRIVAL_KINDS = new Set(['arrived', 'landed', 'host_joined', 'envoy_arrived', 'letter_arrived', 'crossed', 'met_on_road', 'host_formed']);
const ARRIVE = /\b(arriv(?:e|es|ed|ing)|reach(?:ed|es)|r[io]de (?:in)?to|marche[sd] into|came (?:in)?to|come (?:in)?to|join(?:s|ed)?)\b/i;
const NOT_YET = /\b(will|would|should|shall|might|may|before|until|yet|not|never|soon|expect\w*|hope\w*|await\w*|due|on the road|on (?:his|her|their) way)\b/i;
const ABSENT = /\b(thought|thinks?|remember\w*|recall\w*|dream\w*|wish\w*|miss(?:ed|es)?|(?:letter|raven|word|news|message)s? (?:from|to|of)|wrote|writes|written|far away|away (?:in|at)|absent|would|will|should|if|summon\w*|sent for|sends? for|named for|in the name of|name of|grave|tomb|the late)\b/i;
const MEMORY = /\b(thought|thinks?|remember\w*|recall\w*|dream\w*|wish\w*|miss(?:ed|es)?|far|away|home|born|once|years? ago|letter|raven|word from|news from)\b/i;
const IRREGULAR = new Set('said asked answered replied told rode came went took gave stood sat knew saw made held led spoke drew fought fell kept left met sent set struck broke brought bought caught chose cut did dug drank drove ate felt found fled flew forgot got grew heard hid hit hung laid lay lost meant paid put ran rose sang sank shook shot shut slept slew slid sought sold spent split spread stole stuck swore swept swam swung taught tore thought threw understood woke wore won wept wrote was were is are does says asks rides comes goes takes gives stands sits'.split(' '));
const acts = (ws, m) => {
  const next = ws[m.to]?.w.toLowerCase() || ''; const prev = ws[m.from - 1]?.w.toLowerCase() || '';
  return /ed$/.test(next) || IRREGULAR.has(next) || ['said', 'asked', 'answered', 'replied', 'told', 'called', 'shouted', 'laughed', 'muttered', 'growled'].includes(prev);
};

/** What a story is: its people, places (with the roads its parties walk), and numbers. */
export function storyWorld(state, story) {
  const facts = story.facts || [];
  const people = new Set(story.actors || []); const places = new Set([story.place].filter(Boolean)); const parties = new Set();
  const walk = (v) => { if (typeof v === 'string') { if (state.characters[v]) people.add(v); if (state.holdings[v]) places.add(v); if (state.parties?.[v]) parties.add(v); } else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
  for (const f of facts) {
    (f.actors || []).forEach((a) => people.add(a)); if (f.place) places.add(f.place); walk(f.data);
    for (const s of sentencesOf(`${f.title || ''}. ${f.text || ''}`)) for (const n of namesIn(state, s)) (n.kind === 'person' ? people : n.kind === 'place' ? places : parties).add(n.id);
  }
  for (const id of parties) { const p = state.parties[id]; if (!p) continue; for (const m of p.members || []) people.add(m); if (p.commander) people.add(p.commander); for (const x of [p.at, p.march?.to, p.route?.to]) if (state.holdings[x]) places.add(x); }
  const roads = [...parties].map((id) => state.parties[id]?.route?.path).filter(Boolean);
  const houses = new Set([...(story.houses || []), ...[...people].map((id) => state.characters[id]?.house)].filter(Boolean));
  // who arrives where: the actors and parties of the arrival facts at their places, and whoever their own words have
  // arriving at the places those words name
  const arrivals = new Map(); // id → Set of places
  const arrive = (id, where) => { if (!id) return; if (!arrivals.has(id)) arrivals.set(id, new Set()); for (const p of where) if (p) arrivals.get(id).add(p); };
  for (const f of facts) {
    if (ARRIVAL_KINDS.has(f.kind)) for (const x of [...(f.actors || []), f.data?.party, f.data?.host, ...(state.parties?.[f.data?.party]?.members || [])]) arrive(x, [f.place]);
    for (const x of sentencesOf(f.text).filter((t) => ARRIVE.test(t))) {
      const named = namesIn(state, x); const at = named.filter((n) => n.kind === 'place').map((n) => n.id);
      for (const n of named) if (n.kind !== 'place') arrive(n.id, [f.place, ...at]);
    }
  }
  return { people, places, parties, roads, houses, numbers: numbersOf(facts), arrivals };
}

// whether a telling's arrival ("X rode into Winterfell") is one of the story's: the one who arrives, and where
function arrivedAt(state, W, id, sentencePlaces) {
  const at = W.arrivals.get(id); if (!at) return false;
  if (!sentencePlaces.length) return true;
  return sentencePlaces.every((p) => [...at].some((q) => q === p || milesBetween(state.holdings[q]?.pos, state.holdings[p]?.pos) <= NEAR));
}
const posOf = (state, c) => { const p = partyOf(state, c); return p?.pos || state.holdings[p?.at || c?.loc]?.pos || null; };

/**
 * Check one narrated event against its story. Returns problems: [{ rule, text }] (empty when the event is true).
 * `ev`: { headline, line, scene, pov }; `story`: a story of engine/facts/cluster.js.
 */
export function checkEvent(state, ev, story, W = storyWorld(state, story)) {
  const out = []; const say = (rule, text) => { if (!out.some((p) => p.rule === rule && p.text === text)) out.push({ rule, text }); };
  const text = [ev.headline, ev.line, ev.scene].filter(Boolean).join('\n');
  if ([text, ev.pov].some(hasForeignScript)) say('script', 'a word in a script that is not the realm\'s');
  for (const re of GAME_WORDS) { const m = text.match(re); if (m) say('game words', `"${m[0]}" is not a word of the realm`); }
  if (MATURE.test(text)) say('maturity', 'explicit description');
  for (const a of anachronismsIn(state, text)) say('anachronism', `"${a.phrase}": ${a.note}`);
  const at = story.place && state.holdings[story.place];
  for (const n of numbersIn(text)) {
    if (n <= 12 || (n >= 250 && n <= 320 && n <= (state.meta.date?.year || 298))) continue;
    if (!W.numbers.some((x) => Math.abs(x - n) <= Math.max(1, x * 0.02))) say('numbers', `${n.toLocaleString('en-GB')} is not a number of this story`);
  }
  // the headline is a sentence of its own (it has no full stop to end it)
  for (const sentence of [ev.headline, ...sentencesOf(ev.line), ...sentencesOf(ev.scene)].filter(Boolean)) {
    const ws = words(sentence); const found = namesIn(state, sentence);
    const absent = ABSENT.test(sentence); const memory = MEMORY.test(sentence);
    const named = found.filter((m) => m.kind === 'place').map((m) => m.id);
    const arriving = ARRIVE.test(sentence) && !NOT_YET.test(sentence);
    for (const m of found) {
      if (m.kind === 'person') {
        const c = state.characters[m.id]; if (!c) continue;
        if (arriving && acts(ws, m) && !arrivedAt(state, W, c.id, named)) say('arrival', `${c.name} arrives ${named.length ? `at ${named.map((p) => state.holdings[p]?.name).join(', ')}` : 'somewhere'} in no fact of this story`);
        if (W.people.has(c.id)) continue;
        const pos = posOf(state, c);
        const there = at && pos && milesBetween(pos, at.pos) <= NEAR;
        if (!c.alive && acts(ws, m) && !absent) { say('names', `${c.name} is dead and cannot act here`); continue; }
        if (!there && acts(ws, m) && !absent) say('names', `${c.name} is not in this story and is not at ${at?.name || 'its place'} (${c.alive ? whereabouts(state, c).text : 'dead'})`);
      } else if (m.kind === 'party') {
        if (!W.parties.has(m.id) && acts(ws, m) && !absent) say('names', `${state.parties[m.id]?.name} is not in this story`);
        if (arriving && !arrivedAt(state, W, m.id, named)) say('arrival', `${state.parties[m.id]?.name} arrives ${named.length ? `at ${named.map((p) => state.holdings[p]?.name).join(', ')}` : 'somewhere'} in no fact of this story`);
      } else if (m.kind === 'place') {
        const h = state.holdings[m.id]; if (!h || W.places.has(h.id) || memory) continue;
        if (at && milesBetween(h.pos, at.pos) <= NEAR) continue;
        if (W.roads.some((path) => path.some((p) => milesBetween(p, h.pos) <= ROAD))) continue;
        // "Lord Umber of the Last Hearth": a seat named as a title, by those who hold it
        if (ws[m.from - 1]?.w.toLowerCase() === 'of' && W.houses.has(h.owner)) continue;
        say('places', `${h.name} is not a place of this story`);
      }
    }
    // an arrival told of the story's own people, with no arrival in its facts ("the banners reached Moat Cailin")
    if (arriving && named.length && !found.some((m) => m.kind !== 'place') && /\b(host|banners|army|men|riders|fleet|ships|column|lords?)\b/i.test(sentence) && ![...W.arrivals.keys()].some((id) => arrivedAt(state, W, id, named))) say('arrival', `an arrival at ${named.map((p) => state.holdings[p]?.name).join(', ')} no fact of this story records`);
  }
  return out;
}
export const problemText = (story, p) => `${story.id}: ${p.rule} — ${p.text}`;
