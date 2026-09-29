// The headline scorer (docs/gdd/18-headlines.md §2.2–2.3, §5.2; WP N1). A card is a headline and, if there is one, a
// summary; `scoreCard` reads it against the story it tells and names every rule it breaks. It is the measure the
// writer of N3 and the narrator's validator of N5 are held to, so it runs on the mock without a model, is pure, and
// never touches the state or the story (the caches it uses are WeakMaps on the state, as narration.js's are).
//
//   len       headline 3–12 words and at most 80 characters; summary at most 3 sentences and 340 characters
//   who       the headline names someone (or somewhere) of the story: a person, house, place or party
//   invented  no person, place or party the story does not hold; no house it does not hold, said as "House X" or "the Xs";
//             nothing on the story's `mustNot`
//   verb      a finite verb or a bare passive participle (D-058: the headline is news, in the present or "X slain by Y")
//   numbers   no digit and no "~"; one number word at most in the headline; a number above twelve only when the story
//             gives it (±2 %)
//   punct     headline: no ( ) : ; — … "..." and no full stop; summary: no … and it ends with a full stop
//   boiler    none of FORBIDDEN, FORBIDDEN_EXACT, BOILERPLATE, JARGON, nor a house's name in its "X of Place" form
//   roles     "X slain/captured/beaten by Y", "X slays/captures/beats Y": victim, captive, loser and their agents agree
//             with the story's facts (ROLES)
//   dup       the summary is not the headline again
//   outcome   slain, captured, wins/beats, falls, crowned, weds, betrothed, beheads/hanged, dies: a fact of that kind
//             is in the story
//   script, anachronism, maturity: the narration validator's own checks, reported under their own names
//
// It says what is wrong, not how to mend it. It errs on the side of letting a card through where a rule cannot tell
// (a place is no one's victim; a party's members are not known): a false alarm would stop the writer from writing.
import { slug } from '../../../public/js/engine/ids.js';
import { anachronismsIn } from '../../../public/data/anachronisms.js';
import { hasForeignScript } from '../schema.js';
import { BOILERPLATE, JARGON, HEADLINE_VERBS, HEADLINE_MAX_WORDS, HEADLINE_MAX_CHARS, SUMMARY_MAX_CHARS } from '../../../public/data/style.js';
import { GAME_WORDS, MATURE, namesIn, numbersIn, storyWorld, words } from './narration.js';

/** The rule names, in the order a verdict lists them. */
export const RULES = ['len', 'who', 'invented', 'verb', 'numbers', 'punct', 'boiler', 'roles', 'dup', 'outcome', 'script', 'anachronism', 'maturity'];

// ── Roles (18 §3.3): who is the victim and who the agent, per kind of fact ────────────────────────────────────────────
// A plain table (N3 moves it to engine/facts/heads.js, and the writer and this scorer both read it, so they cannot
// disagree). `act` is the kind of deed; `patient` and `agent` are paths into the fact ("actors.0", "data.by"): a
// character, or a house. A battle has sides instead: its winner and loser by house, their commanders by the actors.
export const ROLES = {
  slain_in_battle: { act: 'death', patient: 'actors.0', agent: 'data.by' },
  executed: { act: 'death', patient: 'actors.0', agent: 'data.by' },
  death: { act: 'death', patient: 'actors.0' },
  captured_in_battle: { act: 'capture', patient: 'actors.0', agent: 'data.by' },
  captured: { act: 'capture', patient: 'actors.0', agent: 'data.by' },
  battle: { act: 'defeat', winner: 'data.winnerHouse', loser: 'data.loserHouse' },
};
// the words that claim a role, by deed: "X slain by Y" (passive, agent after "by") and "X slays Y" (active)
const CLAIMS = {
  death: { passive: 'slain killed murdered beheaded hanged executed assassinated', active: 'slays slay slew kills kill murders murder beheads behead hangs hang executes execute' },
  capture: { passive: 'captured taken', active: 'captures capture' },
  defeat: { passive: 'beaten defeated routed crushed overcome vanquished', active: 'beats beat defeats defeat routs rout crushes crush vanquishes overcomes' },
};
const CLAIM_OF = new Map(Object.entries(CLAIMS).flatMap(([act, c]) => [...c.passive.split(' ').map((w) => [w, { act, passive: true }]), ...c.active.split(' ').map((w) => [w, { act, passive: false }])]));

// ── Small readers ────────────────────────────────────────────────────────────────────────────────────────────────────
const pick = (o, path) => path.split('.').reduce((v, k) => v?.[k], o);
const cap = (w) => /^[A-Z]/.test(w);
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hasWord = (text, w) => new RegExp(`(?<![A-Za-z'’-])${esc(w)}(?![A-Za-z-])`, 'i').test(text);
const sentencesIn = (t) => String(t || '').trim().split(/(?<=[.!?…]["”’]?)\s+/).filter(Boolean);
const wordCount = (t) => String(t || '').trim().split(/\s+/).filter(Boolean).length;
const tokens = (t) => (String(t || '').toLowerCase().match(/[a-z][a-z'’-]*/g) || []).map((w) => w.replace(/['’]s$/, ''));
const STOP = new Set('a an the of at to in on by for with from and or but as is are was were be been his her their its this that it he she they them him who which near into onto after before over under out up down'.split(' '));
const TITLES = new Set('ser lord lady king queen prince princess maester septa khal old young captain commander'.split(' '));
const DETS = new Set('the a an his her their its this that these those our my your no some any each every another'.split(' '));
const AUX = new Set('is are was were been be being then later also again soon first finally now all both'.split(' '));

// The houses, by the words a headline says them in: "Baratheon", "Lannisters", "Free Folk". Baratheon of Storm's End is
// "Baratheon" to anyone but the ledger, so the three Baratheons share the word.
const houseTables = new WeakMap();
function houseKeys(state) {
  const n = Object.keys(state.houses || {}).length; let t = houseTables.get(state);
  if (t && t.n === n) return t.keys;
  const keys = new Map(); const put = (k, id, plural) => { if (!k) return; const e = keys.get(k) || { ids: new Set(), plural }; e.ids.add(id); keys.set(k, e); };
  for (const h of Object.values(state.houses || {})) {
    const base = slug(h.name.split(' of ')[0]).replace(/^the_/, '');
    for (const b of new Set([base, /^[a-z]+$/.test(h.id) ? h.id : ''])) { put(b, h.id, false); if (b) put(`${b}s`, h.id, true); }
  }
  houseTables.set(state, { n, keys });
  return keys;
}
// the "X of Place" forms of house names ("Baratheon of King's Landing"): the ledger's, never a person's
const ofNames = new WeakMap();
const ofNamesOf = (state) => { let l = ofNames.get(state); if (!l) { l = Object.values(state.houses || {}).map((h) => h.name).filter((n) => / of /.test(n)); ofNames.set(state, l); } return l; };

/** Everything a sentence names: people, places and parties (narration.js) and houses: [{ kind, ids, from, to, text, explicit, plural, bare }]. `start`: read a house name that opens the line as a house (a headline's subject). */
export function entitiesIn(state, sentence, { start = false } = {}) {
  const out = namesIn(state, sentence).map((n) => ({ kind: n.kind, ids: [n.id], from: n.from, to: n.to, text: n.text }));
  const taken = new Set(); for (const e of out) for (let k = e.from; k < e.to; k++) taken.add(k);
  const ws = words(sentence); const keys = houseKeys(state);
  for (let i = 0; i < ws.length;) {
    if (taken.has(i) || !cap(ws[i].w)) { i++; continue; }
    let hit = null;
    for (let n = Math.min(3, ws.length - i); n >= 1 && !hit; n--) {
      const part = ws.slice(i, i + n); if (part.some((x, k) => taken.has(i + k) || !cap(x.w))) continue;
      const text = sentence.slice(part[0].at, part.at(-1).end); const h = keys.get(slug(text));
      if (h) hit = { n, h, text };
    }
    if (!hit) { i++; continue; }
    const explicit = ws[i - 1]?.w.toLowerCase() === 'house'; const bare = !explicit && !hit.h.plural;
    // a lone house name opening a sentence is as likely a common word ("Reed", "Hunter", "Fell") as a house, except in a headline, which opens on its subject ("Karstark host marches south")
    if (!(bare && i === 0 && !start)) out.push({ kind: 'house', ids: [...hit.h.ids], from: explicit ? i - 1 : i, to: i + hit.n, text: hit.text, explicit, plural: hit.h.plural, bare });
    i += hit.n;
  }
  return out.sort((a, b) => a.from - b.from);
}

// ── The story, as the scorer reads it ───────────────────────────────────────────────────────────────────────────────
// narration.js's storyWorld (people, places, parties, houses, numbers of the facts), plus what a golden bundle or a
// story of the engine also says: the houses of its facts and data, and the names it must carry (which are the story's by definition).
function viewOf(state, story) {
  const W = storyWorld(state, story);
  const people = new Set(W.people); const places = new Set(W.places); const parties = new Set(W.parties); const houses = new Set(W.houses);
  const addHouse = (id) => { if (state.houses?.[id]) houses.add(id); };
  const walk = (v) => { if (typeof v === 'string') addHouse(v); else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
  (story.houses || []).forEach(addHouse);
  for (const f of story.facts || []) { (f.houses || []).forEach(addHouse); walk(f.data); }
  const keys = houseKeys(state);
  // what the facts say in their own words ("an old quarrel with the Blackwoods", in data.why) the story says
  const said = []; const strs = (v) => { if (typeof v === 'string') said.push(v); else if (Array.isArray(v)) v.forEach(strs); else if (v && typeof v === 'object') Object.values(v).forEach(strs); };
  for (const f of story.facts || []) strs([f.title, f.text, f.data]);
  const admit = (e) => { for (const id of e.ids) (e.kind === 'person' ? people : e.kind === 'place' ? places : e.kind === 'party' ? parties : houses).add(id); };
  for (const t of said) for (const x of sentencesIn(t)) entitiesIn(state, x).forEach(admit);
  for (const m of story.must || []) {
    entitiesIn(state, m, { start: true }).forEach(admit);
    const h = keys.get(slug(m).replace(/^the_/, '')); if (h) h.ids.forEach((id) => houses.add(id));
  }
  for (const id of people) addHouse(state.characters[id]?.house);
  return { W, people, places, parties, houses };
}

// ── The faults ───────────────────────────────────────────────────────────────────────────────────────────────────────
// the words a headline's verb may not be when it is also a noun and stands after "the" or opens the line
const NOUNISH = new Set('march ride raid fight burn hold fall sail storm feast host wound land harvest sign return cross hunt rise turn sack watch guard plot order claim pledge vow attack assault offer charge rally camp flood start end stop set cut drop lead pay tax default demand promise ransom release pardon sentence cover blanket grip snow rain blight rot cry shout toll trade whisper rebel spy scout reply visit journey travel welcome hail change switch retreat advance approach pass escape surrender rescue'.split(' ').flatMap((b) => [b, `${b}s`, `${b}es`]));
const VERBS = new Set(HEADLINE_VERBS);
// -ed words that are no participle (the conservative morphological fallback for verbs the lexicon lacks)
const NOT_PARTICIPLE = new Set('hundred kindred hatred sacred naked wicked beloved crooked ragged rugged wretched indeed instead steed greed creed breed speed learned'.split(' '));
const ASIDE = new Set([...AUX, 'and', 'not', 'never', 'by']);
/** Whether a headline holds a finite verb or a participle: a word of HEADLINE_VERBS, in lower case and not standing where a noun would, or an -ed word after a name or an auxiliary. */
export function hasVerb(headline) {
  const ts = [...String(headline || '').matchAll(/[A-Za-z][A-Za-z'’-]*/g)].map((m) => ({ o: m[0], w: m[0].toLowerCase().replace(/['’]s$/, '') }));
  for (let i = 0; i < ts.length; i++) {
    const { o, w } = ts[i]; if (!/^[a-z]/.test(o)) continue;
    const prev = ts[i - 1];
    if (VERBS.has(w)) { if (NOUNISH.has(w) && (!prev || DETS.has(prev.w) || ['of', 'in', 'to', 'for', 'at', 'on', 'after', 'before'].includes(prev.w))) continue; return true; }
    // the fallback: a regular participle with a name or an auxiliary before it ("Lord Umber ambushed", "was rezoned")
    if (/^[a-z]{3,}ed$/.test(w) && w.length >= 5 && !NOT_PARTICIPLE.has(w) && prev && (cap(prev.o) || ASIDE.has(prev.w))) return true;
  }
  return false;
}

const BP = [...BOILERPLATE, ...JARGON].map((p) => new RegExp(p, 'i'));

const numberOk = (W, n) => n <= 12 || W.numbers.some((x) => Math.abs(x - n) <= Math.max(1, x * 0.02));

// the facts of a story that say a deed of a kind was done, for outcome verbs
const violent = (f) => /\b(kill|slain|slay|slew|murder|assassin|duel|stab|poison|blade|sword|arrow|cut down|hanged|behead)/i.test(`${f.data?.cause || ''} ${f.data?.how || ''} ${f.text || ''}`);
const OUTCOMES = [
  { say: 'slain', re: /\b(slain|slays?|slew|killed|kills?|murder(?:s|ed)?|assassinat\w+)\b/, has: (f) => ['slain_in_battle', 'executed'].includes(f.kind) || (f.kind === 'death' && violent(f)) },
  { say: 'captured', re: /\b(captured|captures?|captive|prisoner)\b/, has: (f) => ['captured_in_battle', 'captured', 'hostage_taken'].includes(f.kind) },
  { say: 'won', re: /\b(wins?|won|victorious|triumphs?|beats?|beaten|defeats?|defeated|routs?|routed|crushes|crushed)\b/, has: (f, h) => (/\b(tourney|tournament|lists|joust|melee)\b/.test(h) ? f.kind === 'tourney_result' : (f.kind === 'battle' && !!(f.data?.winner || f.data?.winnerHouse)) || ['rout', 'sea_battle', 'sally', 'ambush', 'storm_assault'].includes(f.kind)) },
  { say: 'fallen', re: 'fall', has: (f) => f.kind === 'holding_fell' || (f.kind === 'storm_assault' && f.data?.carried !== false) },
  { say: 'crowned', re: /\b(crowned|crowns|crowning|enthroned)\b/, has: (f) => f.kind === 'crowned' },
  { say: 'wed', re: /\b(weds?|wedded|marries|married)\b/, has: (f) => f.kind === 'wedding' },
  { say: 'betrothed', re: /\b(betrothed|betroths?)\b/, has: (f) => f.kind === 'betrothal' || (f.kind === 'pact_made' && f.data?.type === 'marriage') },
  { say: 'executed', re: /\b(beheads?|beheaded|hangs?|hanged|executes?|executed)\b/, has: (f) => f.kind === 'executed' },
  { say: 'dead', re: /\b(dies|died|dead|perishes|perished|succumbs)\b/, has: (f) => ['death', 'slain_in_battle', 'executed'].includes(f.kind) },
  { say: 'besieging', re: /\b(besieges?|besieged|lays siege)\b/, has: (f) => ['siege_begun', 'siege_tick'].includes(f.kind) },
];

// "Riverrun falls to Jaime Lannister", "Harrenhal fell": a holding's fall, not "night falls", "falls ill" or "snow falls on Karhold"
function fallClaimed(state, headline) {
  const ws = words(headline); const ents = entitiesIn(state, headline);
  return ws.some((x, i) => /^(?:falls?|fell|fallen)$/.test(x.w) && /^[a-z]/.test(x.w) && (ws[i + 1]?.w.toLowerCase() === 'to' || (ents.some((e) => e.kind === 'place' && e.to === i) && !/^(?:silent|quiet|dark|still|ill|sick|asleep|dormant|empty)$/i.test(ws[i + 1]?.w || ''))));
}

// what a fact says of who did what to whom: { persons, houses } of the patient and the agent; null when the fact says nothing of the kind
const refs = (state, ids) => {
  const persons = new Set(); const houses = new Set();
  for (const id of [ids].flat().filter((x) => typeof x === 'string')) {
    if (state.characters[id]) persons.add(id); else if (state.houses[id]) houses.add(id);
    else if (state.parties?.[id]) { const p = state.parties[id]; if (p.commander) persons.add(p.commander); if (p.house && state.houses[p.house]) houses.add(p.house); }
  }
  return { persons, houses };
};
function sidesOf(state, f) {
  const spec = ROLES[f.kind]; if (!spec) return null;
  if (spec.act !== 'defeat') return { act: spec.act, patient: refs(state, pick(f, spec.patient)), agent: spec.agent && pick(f, spec.agent) ? refs(state, pick(f, spec.agent)) : null };
  const d = f.data || {}; const actors = f.actors || []; const houseOf = (id) => state.characters[id]?.house;
  const wh = pick(f, spec.winner); const lh = pick(f, spec.loser);
  let wp = actors.filter((a) => wh && houseOf(a) === wh); let lp = actors.filter((a) => lh && houseOf(a) === lh);
  // two commanders and one of them known: the other is the loser (Theon Greyjoy led the Stark van)
  if (!wp.length && lp.length) wp = actors.filter((a) => !lp.includes(a));
  if (!lp.length && wp.length) lp = actors.filter((a) => !wp.includes(a));
  const draw = !d.winner && !wh;
  return { act: 'defeat', draw, agent: refs(state, [wh, ...wp, state.parties?.[d.winner] ? d.winner : null]), patient: refs(state, [lh, ...lp, state.parties?.[d.loser] ? d.loser : null]) };
}
// whether an entity of a sentence is of a side: true, false, or null when it cannot be told (a place, a party of unknown make, a side the fact does not name)
function memberOf(state, e, S) {
  if (!S || (!S.persons.size && !S.houses.size)) return null;
  if (e.kind === 'person') { const id = e.ids[0]; return S.persons.size ? S.persons.has(id) : S.houses.has(state.characters[id]?.house); }
  if (e.kind === 'house') return e.ids.some((id) => S.houses.has(id)) || [...S.persons].some((p) => e.ids.includes(state.characters[p]?.house));
  if (e.kind === 'party') { const p = state.parties?.[e.ids[0]]; return p && ((p.commander && S.persons.has(p.commander)) || (p.house && S.houses.has(p.house))) ? true : null; }
  return null;
}

/** The role claims of a sentence that no fact of the story bears out: [text]. */
function roleFaults(state, sentence, facts, start) {
  const ws = words(sentence); const ents = entitiesIn(state, sentence, { start }); const out = [];
  const lower = ws.map((x) => x.w.toLowerCase());
  const before = (v) => { // the entity that ends just before word v (only auxiliaries between)
    const e = [...ents].reverse().find((x) => x.to <= v); if (!e) return null;
    return lower.slice(e.to, v).every((w) => AUX.has(w)) ? e : null;
  };
  const after = (v) => { // the entity that starts just after word v (only articles and titles between)
    const e = ents.find((x) => x.from > v); if (!e) return null;
    return lower.slice(v + 1, e.from).every((w) => DETS.has(w) || TITLES.has(w) || ['house', 'host', 'army', 'men'].includes(w)) && e.from - v <= 4 ? e : null;
  };
  for (let v = 0; v < ws.length; v++) {
    if (!/^[a-z]/.test(ws[v].w)) continue;
    const claim = CLAIM_OF.get(lower[v]); if (!claim) continue;
    let patient; let agent;
    if (claim.passive) {
      patient = before(v);
      if (lower[v + 1] === 'by') agent = after(v + 1);
      // "taken" is a capture only of a captive ("taken captive", "taken by the Lannisters"), never "taken ill" or "taken by surprise"
      if (lower[v] === 'taken' && !(agent || ['captive', 'prisoner', 'hostage'].includes(lower[v + 1]))) continue;
    } else { agent = before(v); patient = after(v); }
    if (!patient && !agent) continue;
    const mine = facts.map((f) => sidesOf(state, f)).filter((s) => s && s.act === claim.act);
    if (!mine.length) continue; // no fact of the kind: `outcome` speaks of that
    const fits = (s) => {
      if (s.draw) return false;
      const a = agent && s.agent ? memberOf(state, agent, s.agent) : null; const p = patient ? memberOf(state, patient, s.patient) : null;
      return a !== false && p !== false;
    };
    if (!mine.some(fits)) out.push(`"${sentence.trim()}": ${agent ? `${agent.text} ${claim.passive ? 'as the agent' : 'as the doer'}` : ''}${agent && patient ? ' and ' : ''}${patient ? `${patient.text} as the patient` : ''} is not what the facts say`);
  }
  return out;
}

const factText = (facts) => { const out = []; const walk = (v) => { if (typeof v === 'string') out.push(v); else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') Object.values(v).forEach(walk); }; walk(facts.map((f) => [f.title, f.text, f.data])); return out.join('\n').toLowerCase(); };

/**
 * Score a card against the story it tells.
 * `card`: { headline, summary? }; `story`: { facts, must?, mustNot?, actors?, houses?, place? } (a golden bundle or a story
 * of engine/facts/cluster.js); `state`: the game (read only).
 * Returns { pass, faults: [rule names, each once, in RULES order], detail: [{ rule, text }] }.
 */
export function scoreCard(card, story, state) {
  const headline = String(card?.headline || '').trim(); const summary = String(card?.summary || '').trim();
  const facts = story?.facts || []; const V = viewOf(state, { ...story, facts });
  const found = []; const say = (rule, text) => { if (!found.some((p) => p.rule === rule && p.text === text)) found.push({ rule, text }); };
  const both = [headline, summary].filter(Boolean).join('\n');
  const parts = [headline, ...sentencesIn(summary)];

  // len
  const hw = wordCount(headline);
  if (hw < 3 || hw > HEADLINE_MAX_WORDS) say('len', `the headline is ${hw} words (3 to ${HEADLINE_MAX_WORDS})`);
  if (headline.length > HEADLINE_MAX_CHARS) say('len', `the headline is ${headline.length} characters (at most ${HEADLINE_MAX_CHARS})`);
  if (summary) {
    if (sentencesIn(summary).length > 3) say('len', `the summary is ${sentencesIn(summary).length} sentences (at most 3)`);
    if (summary.length > SUMMARY_MAX_CHARS) say('len', `the summary is ${summary.length} characters (at most ${SUMMARY_MAX_CHARS})`);
  }

  // who
  const heads = entitiesIn(state, headline, { start: true });
  const named = heads.some((e) => e.ids.some((id) => (e.kind === 'person' ? V.people : e.kind === 'place' ? V.places : e.kind === 'party' ? V.parties : V.houses).has(id)))
    || (story?.must || []).some((m) => hasWord(headline, m));
  if (!named) say('who', 'the headline names no one and no place of this story');

  // invented
  const player = state.meta?.player;
  for (const text of parts) {
    for (const e of entitiesIn(state, text)) {
      if (e.kind === 'house') { if (!e.bare && !e.ids.some((id) => V.houses.has(id) || id === player)) say('invented', `${e.text} is not in this story`); continue; }
      const set = e.kind === 'person' ? V.people : e.kind === 'place' ? V.places : V.parties;
      if (!set.has(e.ids[0])) say('invented', `${e.text} is not in this story`);
    }
  }
  for (const m of story?.mustNot || []) if (hasWord(both, m)) say('invented', `"${m}" is what this story must not say`);

  // verb
  if (!hasVerb(headline)) say('verb', 'the headline has no verb');

  // numbers
  if (/\d|~/.test(both)) say('numbers', 'a digit or "~": numbers are written in words');
  const hn = numbersIn(headline);
  if (hn.length > 1) say('numbers', `${hn.length} numbers in the headline (at most one)`);
  for (const n of [...hn, ...numbersIn(summary)]) if (!numberOk(V.W, n)) say('numbers', `${n.toLocaleString('en-GB')} is not a number of this story`);

  // punct
  if (/[():;—–]|--|…|\.\.\./.test(headline)) say('punct', 'a bracket, colon, semicolon, dash or ellipsis in the headline');
  if (/[.!?]["”’]?\s*$/.test(headline) || /[.!?]\s/.test(headline)) say('punct', 'the headline is a sentence with a full stop');
  if (summary && (/…|\.\.\./.test(summary) || !/\.["”’]?$/.test(summary))) say('punct', /…|\.\.\./.test(summary) ? 'an ellipsis in the summary' : 'the summary is cut short: it does not end with a full stop');

  // boiler
  for (const re of GAME_WORDS) { const m = both.match(re); if (m) say('boiler', `"${m[0]}" is not a word of the realm`); }
  for (const re of BP) { const m = both.match(re); if (m) say('boiler', `"${m[0]}" is the ledger's phrase, not the herald's`); }
  for (const n of ofNamesOf(state)) if (hasWord(both, n)) say('boiler', `"${n}" is a house's ledger name`);

  // roles
  parts.forEach((text, i) => { for (const t of roleFaults(state, text, facts, i === 0)) say('roles', t); });

  // dup
  if (summary) {
    const content = (t) => tokens(t).filter((w) => !STOP.has(w)); const H = new Set(content(headline)); const S = new Set(content(summary));
    const shared = [...H].filter((w) => S.has(w)).length;
    if (H.size && (shared / H.size >= 0.8 || (S.size >= 2 && shared / S.size >= 0.8))) say('dup', 'the summary says the headline again');
  }

  // outcome: a verb of the outcome needs a fact of that kind in the story
  const low = headline.toLowerCase();
  for (const o of OUTCOMES) {
    const claimed = o.re === 'fall' ? fallClaimed(state, headline) : o.re.test(low);
    if (claimed && !facts.some((f) => o.has(f, low))) say('outcome', `the headline says "${o.say}" and no fact of this story does`);
  }

  // script, anachronism, maturity: as the narration validator has them
  if ([headline, summary].some(hasForeignScript)) say('script', 'a word in a script that is not the realm\'s');
  if (MATURE.test(both)) say('maturity', 'explicit description');
  // a later chapter may be said when the story's own facts already say it ("crowned King in the North" in the story of the crowning)
  const told = factText(facts);
  for (const a of anachronismsIn(state, both)) if (!told.includes(a.phrase.toLowerCase())) say('anachronism', `"${a.phrase}": ${a.note}`);

  const faults = RULES.filter((r) => found.some((p) => p.rule === r));
  return { pass: !faults.length, faults, detail: faults.flatMap((r) => found.filter((p) => p.rule === r)) };
}
