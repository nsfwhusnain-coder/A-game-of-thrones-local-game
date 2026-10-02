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
//             gives it (±2 %) or as the writer's own roughly() says it ("nearly two thousand" for 1,796)
//   punct     headline: no ( ) [ ] < > * # : ; — … "..." " - ", no emoji and no full stop; summary: no … and it ends with a full stop
//   boiler    none of FORBIDDEN, FORBIDDEN_EXACT, BOILERPLATE, JARGON, nor a house's name in its "X of Place" form
//   roles     "X slain/captured/beaten/cut down by Y", "X slays/captures/beats/takes Y prisoner/lays siege to Y", "X wins/loses":
//             victim, captive, loser, besieged and their agents agree with the story's facts (ROLES)
//   dup       the summary is not the headline again (its words that are no name: names are the same in any telling)
//   outcome   slain, captured, wins/beats, falls, takes/storms a holding, crowned, weds, betrothed, beheads/hanged, dies:
//             a fact of that kind is in the story
//   script, anachronism, maturity: the narration validator's own checks, reported under their own names
//
// It says what is wrong, not how to mend it. It errs on the side of letting a card through where a rule cannot tell
// (a place is no one's victim; a party's members are not known): a false alarm would stop the writer from writing.
import { slug } from '../../../public/js/engine/ids.js';
import { anachronismsIn } from '../../../public/data/anachronisms.js';
import { roughly } from '../../../public/js/engine/facts/label.js';
import { ROLES } from '../../../public/js/engine/facts/heads.js';
import { hasForeignScript } from '../schema.js';
import { BOILERPLATE, JARGON, HEADLINE_VERBS, HEADLINE_MAX_WORDS, HEADLINE_MAX_CHARS, SUMMARY_MAX_CHARS } from '../../../public/data/style.js';
import { GAME_WORDS, MATURE, namesIn, numberFits, numbersIn, storyWorld, tablesFor, words } from './narration.js';

/** The rule names, in the order a verdict lists them. */
export const RULES = ['len', 'who', 'invented', 'verb', 'numbers', 'punct', 'boiler', 'roles', 'dup', 'outcome', 'script', 'anachronism', 'maturity'];

// ── Roles (18 §3.3): who is the victim and who the agent, per kind of fact ────────────────────────────────────────────
// The table lives in engine/facts/heads.js, beside the writer that tells the same deeds, so the writer and this scorer
// cannot disagree; it is re-exported here for those who read it from the scorer.
export { ROLES };
// the words that claim a role, by deed: "X slain by Y" (passive, agent after "by") and "X slays Y" (active); a participle
// that is also the simple past ("Tywin captured Jaime") is read as active when an object follows
const CLAIMS = {
  death: { passive: 'slain killed murdered beheaded hanged executed assassinated', active: 'slays slay slew kills kill murders murder beheads behead hangs hang executes execute' },
  capture: { passive: 'captured taken seized', active: 'captures capture seizes seize' },
  defeat: { passive: 'beaten defeated routed crushed overcome vanquished', active: 'beats beat defeats defeat routs rout crushes crush vanquishes overcomes' },
  siege: { passive: 'besieged', active: 'besieges besiege' },
};
const CLAIM_OF = new Map(Object.entries(CLAIMS).flatMap(([act, c]) => [...c.passive.split(' ').map((w) => [w, { act, passive: true }]), ...c.active.split(' ').map((w) => [w, { act, passive: false }])]));
const ALSO_PAST = new Set('killed murdered beheaded hanged executed captured seized defeated routed crushed vanquished besieged assassinated'.split(' '));
const WINS = new Set('wins win won triumphs prevails'.split(' '));
const LOSES = new Set('loses lose lost'.split(' '));
const PRISONER = new Set(['prisoner', 'captive', 'hostage']);
// after "wins"/"loses" and no object: a word that only says where or how ("wins at the Twins", "loses badly")
const TAIL = new Set('at near to in outside before again badly heavily handsomely narrowly decisively easily'.split(' '));

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

/** Everything a sentence names: people, places and parties (narration.js) and houses: [{ kind, ids, from, to, text, explicit, plural, bare }]. `start`: read a house name that opens the line as a house (a headline's subject; such a mention is `initial`). */
export function entitiesIn(state, sentence, { start = false } = {}) {
  let out = namesIn(state, sentence).map((n) => ({ kind: n.kind, ids: [n.id], from: n.from, to: n.to, text: n.text }));
  const ws0 = words(sentence);
  // an office named for itself ("the Hand", "the Hand of the King": no alias knows it, and the King inside it is not the King)
  for (const m of sentence.matchAll(/\b(?:[Tt]he )?Hand(?: of the King)?\b/g)) {
    const from = ws0.findIndex((x) => x.at >= m.index); let to = from < 0 ? 0 : from; while (ws0[to] && ws0[to].end <= m.index + m[0].length) to++;
    if (from < 0 || to <= from) continue;
    out = out.filter((e) => !(e.from < to && e.to > from));
    out.push({ kind: 'office', ids: ['hand'], from, to, text: m[0] });
  }
  // "the royal house" is how the writer (engine/facts/heads.js) names the house on the throne, so it does not have to be told which Baratheons
  const crown = Object.values(state.houses || {}).filter((h) => h.rank === 'crown').map((h) => h.id);
  if (crown.length) for (const m of sentence.matchAll(/\b[Tt]he royal (?:house|family)\b/g)) {
    const from = ws0.findIndex((x) => x.at >= m.index); let to = from < 0 ? 0 : from; while (ws0[to] && ws0[to].end <= m.index + m[0].length) to++;
    if (from < 0 || to <= from) continue;
    out = out.filter((e) => !(e.from < to && e.to > from));
    out.push({ kind: 'house', ids: [...crown], from, to, text: m[0], explicit: true, plural: false, bare: false, initial: false });
  }
  const taken = new Set(); for (const e of out) for (let k = e.from; k < e.to; k++) taken.add(k);
  const ws = words(sentence); const keys = houseKeys(state);
  // namesIn drops a possessive from every word ("King's Landing" is read as "King Landing" and found nowhere): the seats and
  // hosts named with an apostrophe ("Storm's End", "Widow's Watch", "The Sealord's Palace", "Mance Rayder's host"; a curly one too)
  // are read here, from the text as it is
  const T = tablesFor(state);
  for (let i = 0; i < ws.length; i++) {
    if (taken.has(i) || !cap(ws[i].w)) continue;
    for (let n = Math.min(4, ws.length - i); n >= 2; n--) {
      const text = sentence.slice(ws[i].at, ws[i + n - 1].end);
      if (!/['’]/.test(text) || Array.from({ length: n }, (_, k) => i + k).some((k) => taken.has(k))) continue;
      const key = slug(text).replace(/^the_/, '');
      const kind = T.places.has(key) ? 'place' : T.parties.has(key) ? 'party' : null;
      if (!kind) continue;
      out.push({ kind, ids: [(kind === 'place' ? T.places : T.parties).get(key)], from: i, to: i + n, text });
      for (let k = i; k < i + n; k++) taken.add(k);
      break;
    }
  }
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
    // a house name opening a sentence is as likely a common word ("Reed", "Hunters", "Fell", "Cranes") as a house, except in a
    // headline, which opens on its subject ("Karstark host marches south"); there it is marked `initial`
    if (!(i === 0 && !start)) out.push({ kind: 'house', ids: [...hit.h.ids], from: explicit ? i - 1 : i, to: i + hit.n, text: hit.text, explicit, plural: hit.h.plural, bare, initial: i === 0 });
    i += hit.n;
  }
  return out.sort((a, b) => a.from - b.from);
}

// ── Offices ──────────────────────────────────────────────────────────────────────────────────────────────────────────
// "The King", "the Queen", "the Hand" name whoever holds the office. namesIn reads the first two as the crown's holders, whoever
// the story is about; a story may be about another holder (the Queen Mother, the Hand who is dead): its own people who hold
// the office (by their title) are the ones the words mean.
const OFFICES = {
  hand: { say: /^(?:the )?hand(?: of the king)?$/i, title: /\bhand of the king\b/i },
  queen: { say: /^(?:the queen|her grace)$/i, title: /(?:^|,\s*)(?:the\s+)?queen\b(?! of thorns)/i },
  king: { say: /^(?:the king|his grace)$/i, title: /(?:^|,\s*)king\b/i },
};
/** The office a phrase names ("The King" → 'king'), or null. */
const officeOf = (text) => Object.keys(OFFICES).find((k) => OFFICES[k].say.test(String(text || '').trim())) || null;

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
  // (an office the story's own words name -- "the Hand's chair", "the King wants a tourney" -- is the story's: a great matter tells itself in them, ST1)
  const officesSaid = new Set();
  for (const t of said) for (const x of sentencesIn(t)) for (const e of entitiesIn(state, x)) { admit(e); const o = e.kind === 'office' ? e.ids[0] : e.kind === 'person' ? officeOf(e.text) : null; if (o) officesSaid.add(o); }
  for (const m of story.must || []) {
    entitiesIn(state, m, { start: true }).forEach(admit);
    const h = keys.get(slug(m).replace(/^the_/, '')); if (h) h.ids.forEach((id) => houses.add(id));
  }
  for (const id of people) addHouse(state.characters[id]?.house);
  // the numbers the writer's own roughly() makes of the story's ("nearly two thousand" for 1,796): a rounding of the story's, not an invention
  const rough = new Set(W.numbers.flatMap((x) => numbersIn(roughly(x))));
  const offices = Object.fromEntries(Object.entries(OFFICES).map(([k, o]) => [k, new Set([...people].filter((id) => o.title.test(state.characters[id]?.title || '')))]));
  return { W, people, places, parties, houses, rough, offices, officesSaid };
}

// whether the story holds what an entity names: its person (or, for "the Queen", whoever of its people holds the office), its
// place, house or party; a free city is house and holding at once ("Pentos", "Braavos"), so the story's house or place is either
function holds(V, state, e) {
  const id = e.ids[0];
  if (e.kind === 'office') return V.offices[id].size > 0 || V.officesSaid.has(id);
  if (e.kind === 'person') { const o = officeOf(e.text); return V.people.has(id) || !!(o && (V.offices[o].size || V.officesSaid.has(o))); }
  if (e.kind === 'party') return V.parties.has(id);
  const city = state.houses?.[id]?.rank === 'city_state' && !!state.holdings?.[id];
  return e.kind === 'place' ? V.places.has(id) || (city && V.houses.has(id)) : V.houses.has(id) || (city && V.places.has(id));
}

// ── The faults ───────────────────────────────────────────────────────────────────────────────────────────────────────
// the words a headline's verb may not be when it is also a noun and stands after "the" or opens the line
const NOUNISH = new Set('march ride raid fight burn hold fall sail storm feast host wound land harvest sign return cross hunt rise turn sack watch guard plot order claim pledge vow attack assault offer charge rally camp flood start end stop set cut drop lead pay tax default demand promise ransom release pardon sentence cover blanket grip snow rain blight rot cry shout toll trade whisper rebel spy scout reply visit journey travel welcome hail change switch retreat advance approach pass escape surrender rescue dead delay help fear work sound mark list rank race score plan use need hint ring face mention record report issue trap cast count clear dock cause fine pace pack pitch plant play point poll present produce question rest rock roll rule rush seat sense share shift shock signal spark spot spring stamp state step support surge surprise talk target tender test touch tour track trust vote wage walk wash waste wave wish'.split(' ').flatMap((b) => [b, `${b}s`, `${b}es`]));
const VERBS = new Set(HEADLINE_VERBS);
// -ed words that are no participle (the conservative morphological fallback for verbs the lexicon lacks)
const NOT_PARTICIPLE = new Set('hundred kindred hatred sacred naked wicked beloved crooked ragged rugged wretched indeed instead steed greed creed breed speed learned'.split(' '));
const ASIDE = new Set([...AUX, 'and', 'not', 'never', 'by']);
// plural nouns that may follow a name and are no verb ("Karstark banners", "Lord Umber men"); the -s fallback never takes them
const PLURAL_NOUNS = new Set('banners men knights riders ships lords ladies houses lands fleets hosts armies troops forces soldiers archers guards spears swords raiders sons daughters brothers sisters heirs vassals allies enemies servants retainers children followers kinsmen levies ravens letters words hands eyes colours colors colours arms bowmen crossbowmen northmen'.split(' '));
/**
 * Whether a headline holds a finite verb or a participle. In this order: a word of HEADLINE_VERBS, in lower case and not
 * standing where a noun would (after "the", or opening the line); a regular -ed participle after a name or an auxiliary
 * ("Lord Umber ambushed", "was rezoned"); a present-tense -s/-es word right after the name of the subject, a person or
 * a party ("Tywin Lannister requisitions the ford"), unless it is a known plural noun or the name is possessive.
 * `ents`: what entitiesIn read in the headline (with `start`), for the subject.
 */
export function hasVerb(headline, ents = []) {
  const ts = [...String(headline || '').matchAll(/[A-Za-z][A-Za-z'’-]*/g)].map((m) => ({ o: m[0], w: m[0].toLowerCase().replace(/['’]s$/, '') }));
  for (let i = 0; i < ts.length; i++) {
    const { o, w } = ts[i]; if (!/^[a-z]/.test(o)) continue;
    const prev = ts[i - 1];
    if (VERBS.has(w)) { if (NOUNISH.has(w) && (!prev || DETS.has(prev.w) || ['of', 'in', 'to', 'for', 'at', 'on', 'after', 'before'].includes(prev.w))) continue; return true; }
    // the fallbacks: a regular participle with a name or an auxiliary before it
    if (/^[a-z]{3,}ed$/.test(w) && w.length >= 5 && !NOT_PARTICIPLE.has(w) && prev && (cap(prev.o) || ASIDE.has(prev.w))) return true;
    // and the news present: the word after the subject's name
    if (w.length >= 4 && /(?:s|es)$/.test(w) && !/(?:ss|us|is)$/.test(w) && !STOP.has(w) && !AUX.has(w) && !DETS.has(w) && !PLURAL_NOUNS.has(w) && !/(?:men|folk)s?$/.test(w)
      && prev && !/['’]s$/.test(prev.o) && ents.some((e) => e.to === i && (e.kind === 'person' || e.kind === 'party'))) return true;
  }
  return false;
}

const BP = [...BOILERPLATE, ...JARGON].map((p) => new RegExp(p, 'i'));

const numberOk = (V, n) => n <= 12 || numberFits(V.W.numbers, n) || V.rough.has(n);

// the facts of a story that say a deed of a kind was done, for outcome verbs
const violent = (f) => /\b(kill|slain|slay|slew|murder|assassin|duel|stab|poison|blade|sword|arrow|cut down|hanged|behead)/i.test(`${f.data?.cause || ''} ${f.data?.how || ''} ${f.text || ''}`);
const OUTCOMES = [
  { say: 'slain', re: /\b(slain|slays?|slew|killed|kills?|murder(?:s|ed)?|assassinat\w+)\b/, has: (f) => ['slain_in_battle', 'executed'].includes(f.kind) || (f.kind === 'death' && violent(f)) },
  // (a prisoner or a captive is a noun, and "A prisoner escapes" claims no capture: only the deed does — "captured", "takes him prisoner", "prisoner of")
  { say: 'captured', re: /\b(?:captured|captures?)\b|\btake[sn]?\b[^.,;]{0,40}\b(?:captive|prisoner)\b|\bprisoner of\b/, has: (f) => ['captured_in_battle', 'captured', 'hostage_taken'].includes(f.kind) },
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
// "Jaime Lannister storms Riverrun", "Harrenhal taken by Tywin Lannister": a holding won by force, or by the will of the crown
// ("Lord Karstark's son takes Karhold" is an inheritance). null when the headline claims no holding, else the kinds of fact that say it.
const HOST_WORDS = new Set('host army men fleet banner banners levies riders company knights ships'.split(' '));
const TAKES = new Set('takes take took taken seizes seize seized captures capture captured conquers conquered'.split(' '));
const STORMS = new Set('storms stormed sacks sacked'.split(' '));
function holdingClaim(state, headline) {
  const R = readerOf(state, headline, true);
  for (let v = 0; v < R.ws.length; v++) {
    const w = R.lower[v]; if (!/^[a-z]/.test(R.ws[v].w) || !(TAKES.has(w) || STORMS.has(w))) continue;
    const obj = R.after(v); const subj = R.before(v); const passive = /^(?:taken|seized|captured|conquered|stormed|sacked)$/.test(w);
    // "takes the Blacktyde host to sea": a place before a host, an army or its men is the host's name, not a holding taken
    if (obj?.kind === 'place' && HOST_WORDS.has(R.lower[obj.to])) continue;
    if (obj?.kind === 'place' || (passive && subj?.kind === 'place')) {
      return STORMS.has(w) ? { say: 'storming', kinds: ['holding_fell', 'storm_assault'] } : { say: 'taking a holding', kinds: ['holding_fell', 'storm_assault', 'succession', 'holding_granted', 'house_ended', 'attainder'] };
    }
  }
  return null;
}

// what a fact says of who did what to whom: { persons, houses, places } of the patient and the agent
const refs = (state, ids) => {
  const persons = new Set(); const houses = new Set();
  for (const id of [ids].flat().filter((x) => typeof x === 'string')) {
    if (state.characters[id]) persons.add(id); else if (state.houses[id]) houses.add(id);
    else if (state.parties?.[id]) { const p = state.parties[id]; if (p.commander) persons.add(p.commander); const h = p.owner || p.house; if (h && state.houses[h]) houses.add(h); }
  }
  return { persons, houses, places: new Set() };
};
function sidesOf(state, f) {
  const spec = ROLES[f.kind]; if (!spec) return null;
  if (spec.act === 'siege') {
    const holding = pick(f, spec.patient); const owner = state.holdings?.[holding]?.owner;
    const agents = [...(spec.agents ? pick(f, spec.agents) || [] : []), pick(f, spec.agent)];
    // a holding lays siege to no one: `strict` makes a place on the besiegers' side a wrong one
    return { act: 'siege', patient: { persons: new Set(), houses: new Set(state.houses?.[owner] ? [owner] : []), places: new Set(holding ? [holding] : []) }, agent: { ...refs(state, agents), strict: true } };
  }
  if (spec.act !== 'defeat') return { act: spec.act, patient: refs(state, pick(f, spec.patient)), agent: spec.agent && pick(f, spec.agent) ? refs(state, pick(f, spec.agent)) : null };
  const d = f.data || {}; const actors = f.actors || []; const houseOf = (id) => state.characters[id]?.house;
  // a battle of the engine names its houses (winnerHouse, loserHouse); a story's (world.js) names the winning house as
  // `winner` and the two that met as attacker and defender; a host is its owner's
  const asHouse = (id) => (id && state.houses?.[id] ? id : (id && (state.parties?.[id]?.owner || state.parties?.[id]?.house)) || null);
  const wh = pick(f, spec.winner) || asHouse(d.winner) || null;
  const lh = pick(f, spec.loser) || asHouse(d.loser) || (wh ? [d.attacker, d.defender].map(asHouse).filter(Boolean).find((h) => h !== wh) : null) || null;
  let wp = actors.filter((a) => wh && houseOf(a) === wh); let lp = actors.filter((a) => lh && houseOf(a) === lh);
  // two commanders and one of them known: the other is the loser (Theon Greyjoy led the Stark van)
  if (!wp.length && lp.length) wp = actors.filter((a) => !lp.includes(a));
  if (!lp.length && wp.length) lp = actors.filter((a) => !wp.includes(a));
  const draw = !d.winner && !wh;
  return { act: 'defeat', draw, agent: refs(state, [wh, ...wp, state.parties?.[d.winner] ? d.winner : null]), patient: refs(state, [lh, ...lp, state.parties?.[d.loser] ? d.loser : null]) };
}
// whether an entity of a sentence is of a side: true, false, or null when it cannot be told (a place, a party of unknown make, a side the fact does not name)
function memberOf(state, e, S) {
  if (!S || (!S.persons.size && !S.houses.size && !S.places.size)) return null;
  if (e.kind === 'place') return S.places.size ? S.places.has(e.ids[0]) : S.strict ? false : null;
  if (e.kind === 'person') { const id = e.ids[0]; return S.persons.size ? S.persons.has(id) : S.houses.has(state.characters[id]?.house); }
  if (e.kind === 'house') return e.ids.some((id) => S.houses.has(id)) || [...S.persons].some((p) => e.ids.includes(state.characters[p]?.house));
  if (e.kind === 'party') { const p = state.parties?.[e.ids[0]]; const h = p && (p.owner || p.house); return p && ((p.commander && S.persons.has(p.commander)) || (h && S.houses.has(h))) ? true : null; }
  return null;
}

// ── Reading a sentence for what it claims ───────────────────────────────────────────────────────────────────────────
function readerOf(state, sentence, start) {
  const ws = words(sentence); const ents = entitiesIn(state, sentence, { start }); const lower = ws.map((x) => x.w.toLowerCase());
  return {
    ws, ents, lower,
    // the entity that ends just before word v (only auxiliaries between)
    before: (v) => { const e = [...ents].reverse().find((x) => x.to <= v); return e && lower.slice(e.to, v).every((w) => AUX.has(w)) ? e : null; },
    // the entity that starts just after word v (only articles and titles between)
    after: (v) => { const e = ents.find((x) => x.from > v); return e && lower.slice(v + 1, e.from).every((w) => DETS.has(w) || TITLES.has(w) || ['house', 'host', 'army', 'men'].includes(w)) && e.from - v <= 4 ? e : null; },
  };
}
// the role claim of the word at v, if it makes one: { act, patient, agent } (entities or null)
function claimAt({ lower, before, after }, v) {
  const w = lower[v]; const n1 = lower[v + 1];
  if ((w === 'cut' || w === 'cuts') && n1 === 'down') {
    if (lower[v + 2] === 'by') return { act: 'death', patient: before(v), agent: after(v + 2) };
    const obj = after(v + 1);
    return obj || w === 'cuts' ? { act: 'death', agent: before(v), patient: obj } : { act: 'death', patient: before(v) };
  }
  if (w === 'takes' || w === 'take' || w === 'took') { // "takes Robb Stark prisoner"
    const obj = after(v);
    return obj && lower.slice(obj.to, obj.to + 3).some((x) => PRISONER.has(x)) ? { act: 'capture', agent: before(v), patient: obj } : null;
  }
  if ((w === 'lays' || w === 'laid' || w === 'lay') && n1 === 'siege' && lower[v + 2] === 'to') return { act: 'siege', agent: before(v), patient: after(v + 2) };
  if (WINS.has(w) || LOSES.has(w)) { // "Roose Bolton wins at the Twins": the subject alone is said to have won (or lost)
    if (after(v) || (n1 && !TAIL.has(n1)) || (w === 'lost' && lower[v + 2] === 'sea')) return null;
    const subject = before(v); if (!subject) return null;
    return WINS.has(w) ? { act: 'defeat', agent: subject } : { act: 'defeat', patient: subject };
  }
  const k = CLAIM_OF.get(w); if (!k) return null;
  if (!k.passive) return { act: k.act, agent: before(v), patient: after(v) };
  if (n1 !== 'by' && ALSO_PAST.has(w) && after(v)) return { act: k.act, agent: before(v), patient: after(v) };
  const agent = n1 === 'by' ? after(v + 1) : null;
  // "taken" is a capture only of a captive ("taken captive", "taken by the Lannisters"), never "taken ill" or "taken by surprise"
  if (w === 'taken' && !(agent || PRISONER.has(n1))) return null;
  return { act: k.act, patient: before(v), agent };
}

/** The role claims of a sentence that no fact of the story bears out: [text]. */
function roleFaults(state, sentence, facts, start) {
  const R = readerOf(state, sentence, start); const out = [];
  for (let v = 0; v < R.ws.length; v++) {
    if (!/^[a-z]/.test(R.ws[v].w)) continue;
    const c = claimAt(R, v); if (!c) continue;
    const { act, patient, agent } = c;
    if (!patient && !agent) continue;
    if (act !== 'siege' && patient?.kind === 'place') continue; // a holding is taken, not slain or captured: `outcome` reads that
    const mine = facts.map((f) => sidesOf(state, f)).filter((s) => s && s.act === act);
    if (!mine.length) continue; // no fact of the kind: `outcome` speaks of that
    const fits = (s) => {
      if (s.draw) return false;
      const a = agent && s.agent ? memberOf(state, agent, s.agent) : null; const p = patient && s.patient ? memberOf(state, patient, s.patient) : null;
      return a !== false && p !== false;
    };
    if (!mine.some(fits)) out.push(`"${sentence.trim()}": ${[agent && `${agent.text} as the ${act === 'siege' ? 'besieger' : 'doer'}`, patient && `${patient.text} as the ${act === 'siege' ? 'besieged' : 'patient'}`].filter(Boolean).join(' and ')} is not what the facts say`);
  }
  return out;
}

// ── Names the game has never heard ───────────────────────────────────────────────────────────────────────────────────
// "Ser Aldric Vance", "Maester Corwin", "Blackmoor Keep": a name an honorific or a castle's suffix gives away, that no table
// of the game knows. (A bare capitalised word is not judged: it may be a common word, a people, a region.)
const HONORIFICS = new Set('Ser Lord Lady Maester Septon Septa King Queen Prince Princess Khal'.split(' '));
const TITLE_WORDS = new Set('commander captain hand regent protector paramount steward warden marshal seneschal steward consort'.split(' '));
const PLACE_SUFFIX = new Set('Keep Hall Tower Castle Hold Fort Fortress Citadel Bridge Ford Motte Landing Crag Harbour Harbor Tor'.split(' '));
const OPENERS = new Set('The A An At In On Of To For From By With After Before His Her Their Its This That All Some'.split(' '));
const KNOWN_PLACES = /\b(?:Red Keep|Great Hall|Great Keep|Tower of Joy)\b/;
function unknownNames(state, text, ents, must) {
  const ws = words(text); const out = [];
  const covered = (i) => ents.some((e) => e.from <= i && i < e.to);
  const adjacent = (i, j) => /^\s+$/.test(text.slice(ws[i].end, ws[j].at));
  const musted = (span) => must.some((m) => hasWord(m, span));
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i].w;
    if (HONORIFICS.has(w) && ws[i + 1] && cap(ws[i + 1].w) && adjacent(i, i + 1) && !TITLE_WORDS.has(ws[i + 1].w.toLowerCase()) && !covered(i + 1) && !musted(ws[i + 1].w)) out.push(`${w} ${ws[i + 1].w}`);
    if (PLACE_SUFFIX.has(w) && i > 0 && cap(ws[i - 1].w) && !OPENERS.has(ws[i - 1].w) && adjacent(i - 1, i) && !covered(i) && !covered(i - 1)) {
      const span = `${ws[i - 1].w} ${w}`; if (!KNOWN_PLACES.test(span) && !musted(span)) out.push(span);
    }
    if (w === 'Castle' && ws[i + 1] && cap(ws[i + 1].w) && adjacent(i, i + 1) && !covered(i) && !covered(i + 1) && !musted(ws[i + 1].w)) out.push(`Castle ${ws[i + 1].w}`);
  }
  return out;
}

// a text's words that are no name and no small word: what it says about the deed (names, places and houses cut out, so that two
// tellings of one deed do not look alike for naming the same people)
function residual(state, text) {
  const out = [];
  for (const sentence of sentencesIn(text)) {
    const ws = words(sentence); let masked = sentence;
    for (const e of [...entitiesIn(state, sentence, { start: true })].sort((a, b) => b.from - a.from)) masked = `${masked.slice(0, ws[e.from].at)} ${masked.slice(ws[e.to - 1].end)}`;
    out.push(...tokens(masked).filter((w) => !STOP.has(w) && !TITLES.has(w)));
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
  const named = heads.some((e) => e.ids.some((id) => holds(V, state, { ...e, ids: [id] })))
    || (story?.must || []).some((m) => hasWord(headline, m));
  if (!named) say('who', 'the headline names no one and no place of this story');

  // invented
  const player = state.meta?.player;
  for (const text of parts) {
    const ents = entitiesIn(state, text);
    for (const e of ents) {
      if (e.kind === 'house' && e.bare) continue; // (a bare family name may be a common word, or an adjective: "the Lannister line")
      if (e.kind === 'house' ? e.ids.some((id) => id === player || holds(V, state, { ...e, ids: [id] })) : holds(V, state, e)) continue;
      say('invented', e.kind === 'office' ? `${e.text}: no one of this story holds that office` : `${e.text} is not in this story`);
    }
    for (const n of unknownNames(state, text, ents, story?.must || [])) say('invented', `${n} is no one and nowhere of this game`);
  }
  for (const m of story?.mustNot || []) if (hasWord(both, m)) say('invented', `"${m}" is what this story must not say`);

  // verb
  if (!hasVerb(headline, heads)) say('verb', 'the headline has no verb');

  // numbers
  if (/\d|~/.test(both)) say('numbers', 'a digit or "~": numbers are written in words');
  const hn = numbersIn(headline);
  if (hn.length > 1) say('numbers', `${hn.length} numbers in the headline (at most one)`);
  for (const n of [...hn, ...numbersIn(summary)]) if (!numberOk(V, n)) say('numbers', `${n.toLocaleString('en-GB')} is not a number of this story`);

  // punct
  const JUNK = /[\[\]<>*#]|\s-\s|\p{Extended_Pictographic}/u; // markup, a dash in disguise, an emoji
  if (/[():;—–]|--|…|\.\.\./.test(headline) || JUNK.test(headline)) say('punct', 'a bracket, colon, semicolon, dash, ellipsis, mark-up or emoji in the headline');
  if (/[.!?]["”’]?\s*$/.test(headline) || /[.!?]\s/.test(headline)) say('punct', 'the headline is a sentence with a full stop');
  if (summary && (/…|\.\.\./.test(summary) || !/\.["”’]?$/.test(summary))) say('punct', /…|\.\.\./.test(summary) ? 'an ellipsis in the summary' : 'the summary is cut short: it does not end with a full stop');
  if (summary && JUNK.test(summary)) say('punct', 'mark-up, a dash in disguise or an emoji in the summary');

  // boiler
  for (const re of GAME_WORDS) { const m = both.match(re); if (m) say('boiler', `"${m[0]}" is not a word of the realm`); }
  for (const re of BP) { const m = both.match(re); if (m) say('boiler', `"${m[0]}" is the ledger's phrase, not the herald's`); }
  for (const n of ofNamesOf(state)) if (hasWord(both, n)) say('boiler', `"${n}" is a house's ledger name`);

  // roles
  parts.forEach((text, i) => { for (const t of roleFaults(state, text, facts, i === 0)) say('roles', t); });

  // dup: the words a telling is made of that are no name (any telling of the same deed names the same people and places)
  if (summary) {
    const H = new Set(residual(state, headline)); const S = new Set(residual(state, summary));
    const shared = [...H].filter((w) => S.has(w)).length;
    // most of the headline's words said again; and where the headline has few, most of the summary is the headline's
    if (H.size && shared / H.size >= 0.8 && (H.size >= 3 || shared / S.size >= 0.8)) say('dup', 'the summary says the headline again');
    else if (!H.size && tokens(headline).length && tokens(headline).every((w) => tokens(summary).includes(w))) say('dup', 'the summary says the headline again');
  }

  // outcome: a verb of the outcome needs a fact of that kind in the story
  const low = headline.toLowerCase(); const held = holdingClaim(state, headline);
  for (const o of OUTCOMES) {
    // "captures Riverrun" is a holding taken, not a man: the holding's own rule reads it
    const claimed = o.re === 'fall' ? fallClaimed(state, headline) : o.re.test(low) && !(o.say === 'captured' && held && !/\b(captive|prisoner)\b/.test(low));
    if (claimed && !facts.some((f) => o.has(f, low))) say('outcome', `the headline says "${o.say}" and no fact of this story does`);
  }
  if (held && !facts.some((f) => held.kinds.includes(f.kind) && (f.kind !== 'storm_assault' || f.data?.carried !== false))) say('outcome', `the headline says ${held.say} and no fact of this story does`);

  // script, anachronism, maturity: as the narration validator has them
  if ([headline, summary].some(hasForeignScript)) say('script', 'a word in a script that is not the realm\'s');
  if (MATURE.test(both)) say('maturity', 'explicit description');
  // a later chapter may be said when the story's own facts already say it ("crowned King in the North" in the story of the crowning)
  const told = factText(facts);
  for (const a of anachronismsIn(state, both)) if (!told.includes(a.phrase.toLowerCase())) say('anachronism', `"${a.phrase}": ${a.note}`);

  const faults = RULES.filter((r) => found.some((p) => p.rule === r));
  return { pass: !faults.length, faults, detail: faults.flatMap((r) => found.filter((p) => p.rule === r)) };
}

/**
 * The Meanwhile sentence (18 §2.4 C7), as the model may rewrite it: the words of the small happenings of the week and no more.
 * Returns problems [{ rule, text }] ([] when it is fine): at most 200 characters and a full stop at the end, no digit, no game word
 * or ledger phrase, no script that is not the realm's, no later chapter, and no person, place or party that no small happening names.
 */
export function checkMeanwhile(state, text, facts = []) {
  const t = String(text || '').trim(); const found = [];
  const say = (rule, what) => { if (!found.some((p) => p.rule === rule && p.text === what)) found.push({ rule, text: what }); };
  if (t.length > 200) say('len', `the Meanwhile is ${t.length} characters (at most 200)`);
  if (/…|\.\.\./.test(t) || !/\.["”’]?$/.test(t)) say('punct', 'the Meanwhile must be whole sentences ending in a full stop, never cut short');
  if (/\d|~/.test(t)) say('numbers', 'a digit or "~": numbers are written in words');
  for (const re of GAME_WORDS) { const m = t.match(re); if (m) say('game words', `"${m[0]}" is not a word of the realm`); }
  for (const re of BP) { const m = t.match(re); if (m) say('boiler', `"${m[0]}" is the ledger's phrase, not the herald's`); }
  if (hasForeignScript(t)) say('script', 'a word in a script that is not the realm\'s');
  if (MATURE.test(t)) say('maturity', 'explicit description');
  for (const a of anachronismsIn(state, t)) say('anachronism', `"${a.phrase}": ${a.note}`);
  const V = viewOf(state, { facts });
  for (const s of sentencesIn(t)) for (const e of entitiesIn(state, s)) {
    if (e.kind === 'house' && e.bare) continue;
    if (e.kind === 'house' ? e.ids.some((id) => id === state.meta?.player || holds(V, state, { ...e, ids: [id] })) : holds(V, state, e)) continue;
    say('invented', `${e.text} is not in the week's small news`);
  }
  return found;
}
