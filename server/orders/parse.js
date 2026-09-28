// The order pre-parser (docs/gdd/04-ai-system.md §4.1, stage 1): the lord's words read by rule, before any model is
// asked. It finds what the order is for (a verb of engine/actions/registry.js), who and what it names (the house's
// people by name, byname or kinship; places and houses by any name they go by; hosts by their banner), how many and
// how long — and says whether that reading is complete. A complete reading needs no model at all (the GDD's target:
// most real orders); an incomplete one is handed to the interpreter call as a hint; an order that asks for nothing the
// engine does (a speech, a prayer, a word of comfort) is left to the story.
//
//   parseOrder(state, text, { house }) → {
//     actions: [{ verb, params, clause }],  what the order asks, in order
//     complete: bool,                        every clause read, every param found, nothing ambiguous
//     clarify: null | { question, options: [{ label, patch }] },   one thing the lord must say
//     letter: null | { to },                 words for someone far away: a raven (server/orders.js postLetters)
//     story: bool,                           nothing here for the engine to do
//     found: { verbs, people, places, houses, hosts, numbers, days }   what was recognised (the model's hint)
//   }
import { slug, placeAliases, personAliases, houseAliases } from '../../public/js/engine/ids.js';
import { resolvePlaceId } from '../../public/js/shared/world.js';
import { partyOf, isForce } from '../../public/js/engine/parties.js';
import { commands, destination } from '../../public/js/engine/actions/military.js';
import { PROJECT_TEMPLATES, TAX_LEVELS } from '../../public/js/shared/economy.js';

// ── Numbers: digits and the words a lord dictates ("two thousand spears", "a score of knights", "a few men") ──
const UNITS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SCALE = { hundred: 100, thousand: 1000 };
const FUZZY = { 'a handful of': 5, 'a handful': 5, 'a few': 10, 'a small escort': 10, 'an escort': 20, 'a small company of': 30, 'a strong escort': 50, 'a company of': 100, 'some': 20 };
/** The numbers in a clause, in order: 2,000 · two thousand · a score · a dozen · a few. */
export function numbersIn(text) {
  const t = String(text).toLowerCase().replace(/(\d),(\d)/g, '$1$2');
  const out = [];
  for (const m of t.matchAll(/\b(\d{1,7})\b/g)) out.push({ n: Number(m[1]), at: m.index });
  for (const m of t.matchAll(/\b(?:a|one)\s+(dozen|score)\b/g)) out.push({ n: m[1] === 'dozen' ? 12 : 20, at: m.index });
  for (const m of t.matchAll(/\ba\s+(hundred|thousand)\b/g)) out.push({ n: SCALE[m[1]], at: m.index });
  const words = [...t.matchAll(/[a-z]+/g)];
  for (let i = 0; i < words.length; i++) {
    if (!(words[i][0] in UNITS)) continue;
    let n = 0, cur = UNITS[words[i][0]], j = i + 1;
    for (; j < words.length; j++) {
      const x = words[j][0], prev = words[j - 1][0];
      if (x in SCALE) { cur = (cur || 1) * SCALE[x]; if (x === 'thousand') { n += cur; cur = 0; } }
      else if (x === 'and' && prev in SCALE && words[j + 1]?.[0] in UNITS) continue; // "two hundred and fifty"
      else if (x in UNITS && (prev === 'and' || prev in SCALE || (UNITS[x] < 10 && UNITS[prev] >= 20 && UNITS[prev] < 100))) cur += UNITS[x]; // "twenty five"
      else break;
    }
    out.push({ n: n + cur, at: words[i].index }); i = j - 1;
  }
  for (const [k, v] of Object.entries(FUZZY)) { const at = t.indexOf(k + ' '); if (at >= 0 && !out.some((o) => Math.abs(o.at - at) <= k.length + 1)) out.push({ n: v, at, fuzzy: true }); }
  return out.sort((a, b) => a.at - b.at);
}
/** A span of days: "within a fortnight", "in ten days", "by the next moon". */
export function daysIn(text) {
  const t = String(text).toLowerCase();
  if (/\bfortnight\b/.test(t)) return 14;
  if (/\b(a|one|the next) moon\b|\ba month\b/.test(t)) return 30;
  if (/\b(a|one) week\b|\bsennight\b/.test(t)) return 7;
  const m = t.match(/\b(?:in|within|for)\s+(\w+)\s+days?\b/); if (m) return Number(m[1]) || UNITS[m[1]] || null;
  return null;
}

// ── What a clause names ──
const STOP = new Set(['the', 'a', 'an', 'to', 'of', 'and', 'my', 'our', 'his', 'her', 'their', 'your', 'will', 'may', 'can', 'all', 'men', 'host', 'army', 'lord', 'lady', 'ser', 'king', 'queen', 'house', 'home', 'north', 'south', 'east', 'west', 'city', 'castle', 'keep', 'gate', 'hall', 'river', 'sea', 'war', 'peace', 'gold', 'black', 'white', 'red', 'green', 'old', 'young', 'little', 'big', 'great', 'high', 'low', 'new', 'first', 'last', 'wall', 'twins', 'fingers', 'rock', 'send', 'march', 'ride', 'go', 'with', 'at', 'in', 'for', 'from', 'on', 'by', 'me', 'him', 'them', 'it', 'is', 'be', 'are', 'was', 'as', 'that', 'this', 'who', 'what', 'where']);
/** Every alias of `map` in the tokens, longest first, without overlaps: [{ id, i, n }]. */
function mentions(tokens, map, { max = 6 } = {}) {
  const out = []; const used = new Set();
  for (let n = Math.min(max, tokens.length); n >= 1; n--) {
    for (let i = 0; i + n <= tokens.length; i++) {
      if ([...Array(n).keys()].some((k) => used.has(i + k))) continue;
      const key = tokens.slice(i, i + n).join('_');
      if (n === 1 && (STOP.has(key) || key.length < 3)) continue;
      const id = map.get(key); if (!id) continue;
      out.push({ id, i, n }); for (let k = 0; k < n; k++) used.add(i + k);
    }
  }
  return out.sort((a, b) => a.i - b.i);
}
const tokensOf = (t) => slug(t).split('_').filter(Boolean);

// the lord's people by what they are to him: "my wife", "my heir", "the maester", "my master-at-arms"
const KIN = [
  [/\bmy (lady )?wife\b|\bmy lady\b/, (s, c, l) => l?.spouse === c.id],
  [/\bmy (lord )?husband\b/, (s, c, l) => l?.spouse === c.id],
  [/\bmy heir\b/, (s, c) => s.houses[c.house]?.heir === c.id || (c.roles || []).includes('heir')],
  [/\bmy sons\b/, (s, c, l) => (c.father === l?.id || c.mother === l?.id) && c.sex === 'm'],
  [/\bmy daughters\b/, (s, c, l) => (c.father === l?.id || c.mother === l?.id) && c.sex === 'f'],
  [/\bmy children\b/, (s, c, l) => c.father === l?.id || c.mother === l?.id],
  [/\bmy (eldest )?son\b/, (s, c, l) => (c.father === l?.id || c.mother === l?.id) && c.sex === 'm'],
  [/\bmy (eldest )?daughter\b/, (s, c, l) => (c.father === l?.id || c.mother === l?.id) && c.sex === 'f'],
  [/\bmy brother\b/, (s, c, l) => c.id !== l?.id && c.sex === 'm' && l && ((c.father && c.father === l.father) || (c.mother && c.mother === l.mother))],
  [/\bmy sister\b/, (s, c, l) => c.id !== l?.id && c.sex === 'f' && l && ((c.father && c.father === l.father) || (c.mother && c.mother === l.mother))],
  [/\bmy ward\b|\bthe ward\b/, (s, c) => (c.roles || []).includes('ward')],
  [/\b(my|the|our) maester\b/, (s, c) => (c.roles || []).includes('maester')],
  [/\b(my|the|our) steward\b/, (s, c) => (c.roles || []).includes('steward')],
  [/\b(my|the|our) master[- ]at[- ]arms\b/, (s, c) => (c.roles || []).includes('master_at_arms')],
  [/\b(my|the|our) captain( of the guard)?\b/, (s, c) => (c.roles || []).includes('captain')],
  [/\b(my|the|our) (spymaster|master of whisperers)\b/, (s, c) => (c.roles || []).includes('spymaster')],
];
// someone the order goes to, not someone who goes: "to meet Lady Catelyn", "to fetch my daughters", "to guard Bran"
const SOUGHT = /\b(?:meet|find|fetch|greet|see|visit|help|seek|look for|search for|wait for|await|join|relieve|reinforce|aid|guard|protect|bring back|warn|speak (?:with|to)|treat with|parley with)(?: (?:lady|lord|ser|my|our|the|prince|princess|maester|king|queen|young|old|son|daughter|wife|husband|brother|sister|uncle))*$/;
// a prayer, a hope, a grief
const PRAYER = /^(?:(?:let us|we|we shall|we will|i|i shall|i will|everyone|all) )?(?:pray|hope|mourn|weep|grieve|give thanks|thank the gods|light (?:a )?candles? for|may the (?:gods|seven|old gods|drowned god))\b/;
// the house's hosts in the words a lord uses for them, when none is named
const MY_HOST = /\b(my|our|the) (host|army|forces|levies|men|troops|soldiers|bannermen|swords|spears|strength)\b|\ball (my|our) (men|forces|strength)\b|\bthe (whole|entire) (host|army)\b/;

// ── The verbs, by the words that mean them (most particular first) ──
const RE = {
  war: /\b(declare war|make war|go to war|wage war|war upon|war on)\b/,
  banners: /\b(call|summon|raise|muster|gather|assemble)\s+(?:up\s+)?(?:all\s+)?(?:the\s+|my\s+|our\s+)?(banners|bannermen|vassals|sworn (?:lords|houses|swords)|lords of (?:the )?\w+|northmen)\b|\bcall (?:the|my) lords\b|\b(raise|muster|summon|rouse) the (north|west|westerlands|riverlands|vale|reach|stormlands|iron islands|isles|crownlands)\b/,
  raise: /\b(raise|call up|muster\w*|gather\w*|levy|assem\w*|form|forge|create)\b[^.]*\b(levies|levy|host|army|men|every man|spears|swords|forces|soldiers|pikes|bowmen|archers|knights|riders|ironborn|northmen|footmen|lances|spearmen)\b/,
  hire: /\b(hire|recruit|enlist|sign on|buy the service of|take on)\b[^.]*\b(men|men-at-arms|swords|soldiers|sellswords?|free company|mercenar\w+|guards?|spears|crossbowmen|archers)\b/,
  officer: /\b(hire|find|seek|engage|take into (?:my )?service|get (?:me )?|bring in)\b[^.]*\b(spymaster|master of whisperers|steward|maester|captain|master[- ]at[- ]arms|sworn sword|envoy|commander)\b/,
  appoint: /\b(appoint|name|make|choose|set)\b[^.]*\b(my |the |our |as )?(spymaster|master of whisperers|steward|maester|captain(?: of the guard)?|master[- ]at[- ]arms|castellan|commander|envoy|sworn sword)\b/,
  works: /\b(fund|build|expand|found|begin|repair|strengthen|endow|open|dig|fill|deepen|train|raise|construct|improve|rebuild)\b/,
  unworks: /\b(stop|cancel|halt|abandon|end)\b[^.]*\b(works|building|construction|masons)\b/,
  feast: /\b(hold|throw|host|give|call|proclaim|announce|have|prepare|plan)\b[^.]*\b(feast|banquet)\b/,
  tourney: /\b(hold|throw|host|give|call|proclaim|announce|have|prepare|plan)\b[^.]*\b(tourney|tournament|joust)\b/,
  tax: /\b(tax|taxes|taxation|levies on the smallfolk)\b/,
  dues: /\b(dues|tribute)\b/,
  embargo: /\bembargo\b/,
  repay: /\b(repay|pay back|pay off|settle (?:our|my|the) debts?)\b/,
  borrow: /\b(borrow|take (?:out )?a loan|a loan of|seek a loan|ask (?:\w+ ){0,4}for a loan)\b/,
  callDebt: /\bcall (?:in )?(?:the |their |his |her |its )?debts?\b|\bdemand (?:repayment|what (?:they|he|she) owes?)\b/,
  grain: /\b(buy|purchase|import|bring in)\b[^.]*\b(grain|corn|wheat|barley|food|provisions)\b/,
  bribe: /\bbribe\b/,
  ransom: /\b(pay|offer)\b[^.]*\bransom\b|\bransom (?:back|home)\b/,
  gift: /\b(gift|present)\b|\bsend\b[^.]*\b(\d[\d,]*|\w+ (?:thousand|hundred))\s+(?:gold\s+)?(?:dragons|gold|coins)\b/,
  grant: /\b(grant|give|bestow|award)\b[^.]*\b(to house|to the|lands|castle|keep|holding|seat)\b/,
  judge: /\b(free|release|let (?:him|her|them) go|set (?:\w+ )?free|pardon|ransom|behead|execute|hang|put (?:\w+ ){0,3}to death|take (?:his|her) head|send (?:\w+ )+to the wall|take the black|to take the black)\b/,
  spies: /\b(spy|spies|eyes and ears|informers?|agents?)\b/,
  secrets: /\bsecrets?\b/,
  disband: /\b(disband|dismiss|send (?:the |my |our )?(?:men|levies|host|army|troops) home|stand (?:the \w+ |my \w+ |our \w+ )?down)\b/,
  wait: /\bwait (?:for|on|until) (?:the |my |our |all )?(banners|bannermen|lords|vassals|levies|sworn)\b/,
  halt: /\b(halt|stop (?:the |our |my )?march(?:ing)?|hold (?:where|fast|your ground|position)|make camp|(?:stay|rest|remain|wait) where)\b/,
  merge: /\b(join|merge|combine|unite|bring together|fold)\b[^.]*\b(hosts|armies|forces|into one)\b/,
  attack: /\b(attack|assault|fall upon|fall on|engage|bring (?:\w+ )?to battle|give battle|meet (?:\w+ )?in battle|strike at|crush|destroy)\b/,
  march: /\b(march|lead|take|move|advance|bring|send|dispatch|head|go|ride|proceed|redeploy|withdraw|retreat|fall back)\b/,
  secrecy: /\b(in secret|secretly|by night|under cover|unseen|openly|banners (?:flying|high)|feint|make them think|spread word that)\b/,
  travel: /\b(send|ride|go|travel|sail|return|come|journey|head|hurry|hasten|escort|dispatch|make (?:his|her|their) way|set out|leave for|depart for|should go|is to go|must go|reinforce|relieve)\b/,
  recall: /\b(recall|call (?:\w+ )?back|summon (?:\w+ )?back|turn (?:\w+ )?back|come home|return home|bring (?:\w+ )?home)\b/,
  letter: /\b(raven|letter|write|writes|written|send word|a message|missive|note to|tell (?:him|her|them|lord|lady|king|queen|ser|prince|princess|maester|my (?:lord|lady) \w+))\b|\b(?:offer|promise|propose)\b[^.]*\b(?:for (?:the|his|her|their)|in (?:exchange|return)|if (?:he|she|they)|provided|on condition)\b/,
  inPerson: /\b(ride|rides|go|goes|travel|journey|in person|himself|herself|themselves|escort|carry it|deliver it by hand|by hand)\b/,
  menWords: /\b(men|riders|swords|guards?|escort|company|spears|knights|soldiers|retinue|household|outriders)\b/,
};
const WORKS = [['granaries', /granar/], ['walls', /\bwalls?\b|curtain wall|ramparts/], ['rookery', /rookery|maester'?s tower/], ['harbour', /harbou?r|wharf|wharves|docks?\b/], ['barracks', /barracks/], ['smithy', /smith|armou?ry|forge\b/], ['stables', /stables?|studs?\b/], ['inn', /\binns?\b|toll bridge/], ['almshouse', /almshouse|hospice|poor/], ['sept', /\bsept\b|godswood/], ['market', /market|fair\b/], ['roads', /\broads?\b|bridges?/], ['mines', /\bmines?\b|shafts/], ['warships', /warships|galleys|longships|a fleet/], ['men_at_arms', /train (?:more )?men-at-arms/]];
const OFFICE_OF = (t) => (/spymaster|master of whisperers/.test(t) ? 'spymaster' : /master[- ]at[- ]arms/.test(t) ? 'master_at_arms' : /castellan/.test(t) ? 'castellan' : /steward/.test(t) ? 'steward' : /maester/.test(t) ? 'maester' : /captain/.test(t) ? 'captain' : /commander/.test(t) ? 'commander' : /envoy/.test(t) ? 'envoy' : /sworn sword/.test(t) ? 'knight' : null);

/** The world as the parser sees it for one house (built once per order). */
function lexicon(state, house) {
  const lord = state.characters[state.houses[house]?.lord];
  const places = placeAliases(state), people = personAliases(state), houses = houseAliases(state);
  const hostNames = new Map();
  for (const a of Object.values(state.parties)) if (commands(state, house, a)) { const n = slug(a.name); hostNames.set(n, a.id); hostNames.set(n.replace(/^the_/, ''), a.id); hostNames.set(slug(a.id), a.id); }
  return { house, lord, places, people, houses, hostNames };
}

// clauses: sentences, and "and"/"then" joining two commands — but "raise the levies and march them to Moat Cailin" is
// one command (the host raised is the host that marches)
const NEXT_COMMAND = '(?:send|call|write|hire|recruit|build|fund|hold|declare|appoint|grant|summon|dispatch|order|tell|march|raise|make|find|plant|have)';
export function clausesOf(text) {
  const out = [];
  for (const sentence of String(text).split(/(?<=[.!?;])\s+|\n+/)) {
    const s = sentence.trim().replace(/[.!?;]+$/, ''); if (!s) continue;
    const parts = s.split(new RegExp(`,?\\s+(?:and\\s+)?then\\s+|,?\\s+and\\s+(?=${NEXT_COMMAND}\\b(?!\\s+(?:them|it|the men|the levies|the host|him|her)\\b))`, 'i'));
    for (const p of parts) if (p.trim()) out.push(p.trim());
  }
  return out;
}

/** What a lord calls one of his people: the first name, without the titles ("Ser Kevan Lannister" → "kevan"). */
const given = (c) => String(c?.name || '').replace(/^(?:(?:ser|lord|lady|maester|grand maester|archmaester|septon|septa|prince|princess|king|queen|khal|lord commander|castellan)\s+)+/i, '').split(' ')[0].toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Who rules a house now: its regent while the lord is a child or a captive, else its lord. */
const rulerOf = (state, hid) => { const h = state.houses[hid]; return state.characters[h?.regent] || state.characters[h?.lord] || null; };

/**
 * Read one order. `house` is the house giving it (the player's by default); `addressee` is who it is said to (an
 * audience with one of the house's own people: "ride to the Twins" means them).
 */
export function parseOrder(state, text, { house = state.meta.player, addressee = null } = {}) {
  const L = lexicon(state, house); const me = state.houses[house];
  const res = { actions: [], complete: true, clarify: null, letter: null, story: false, found: { verbs: [], people: [], places: [], houses: [], hosts: [], numbers: [], days: daysIn(text) } };
  // one question for the lord; its answers (chips) patch the action left open (`pending`) — or, with no patch, are
  // added to the order's words and read again
  const need = (question, options = [], pending = null) => { res.complete = false; res.clarify = res.clarify || { question, options, ...(pending ? { pending } : {}) }; };
  // the house's people who could be sent or given an office, the most useful first
  const FIT = { knight: 3, captain: 3, master_at_arms: 3, envoy: 3, commander: 2, steward: 1, maester: 1, bastard: 1 };
  const fit = (c) => (c.roles || []).reduce((n, r) => n + (FIT[r] || 0), 0);
  const hands = () => Object.values(state.characters).filter((c) => c.alive && c.house === house && c.id !== L.lord?.id && (c.age ?? 20) >= 14 && !/imprisoned|captive|hostage/.test(c.status || '')).sort((a, b) => fit(b) - fit(a)).slice(0, 4);
  const pick = (key) => hands().map((c) => ({ label: c.name, patch: { [key]: c.id } }));
  const hostPick = () => forces().slice(0, 4).map((a) => ({ label: a.name, patch: { army: a.id } }));
  const act = (verb, params, clause) => {
    if (res.actions.some((a) => a.verb === verb && JSON.stringify(a.params) === JSON.stringify(params))) return; // said twice, done once
    res.actions.push({ verb, params, clause }); res.found.verbs.push(verb);
  };
  const forces = () => Object.values(state.parties).filter((a) => commands(state, house, a) && a.kind !== 'garrison' && a.men > 0);
  const bigHost = () => forces().filter((a) => a.kind !== 'fleet').sort((a, b) => b.men - a.men)[0] || forces()[0] || null;
  // each clause read on its own; one that yields nothing is the story's — or a command the rules missed, which only
  // the model can tell, so the reading is then incomplete (a prayer is surely the story's)
  const readClause = (clause) => {
    const t = clause.toLowerCase(); const tok = tokensOf(clause);
    // who and what it names; a name never also counts as a place ("Theon Greyjoy" is not a journey to Pyke)
    const pm = mentions(tok, L.people);
    const inName = (m) => pm.some((p) => m.i < p.i + p.n && p.i < m.i + m.n);
    const named = pm.map((m) => ({ c: state.characters[m.id], i: m.i })).filter((x) => x.c);
    const kinAt = new Map();
    const kin = KIN.filter(([re]) => re.test(t)).flatMap(([re, is]) => {
      const all = Object.values(state.characters).filter((c) => c.alive && c.id !== L.lord?.id && is(state, c, L.lord));
      const mine = all.filter((c) => c.house === house);
      const got = (/s\b/.test(re.source.split('|')[0]) ? mine : mine.slice(0, 1)).concat(mine.length ? [] : all.slice(0, 1));
      for (const c of got) kinAt.set(c.id, t.slice(0, t.search(re)));
      return got;
    });
    const people = [...new Map([...named.map((x) => x.c), ...kin].map((c) => [c.id, c])).values()];
    const self = /\b(i|myself|i shall|i will|we shall)\b/.test(t) && L.lord;
    // "Kevan, march on the Twins": the one addressed does it — and if he leads a host, it is the host that goes
    const hailed = named.find((x) => x.i <= 1 && new RegExp(`^${given(x.c)}\\s*,`, 'i').test(clause.replace(/^(?:ser|lord|lady|maester|uncle|cousin|brother|sister)\s+/i, '')))?.c;
    const hailedHost = hailed && partyOf(state, hailed) && commands(state, house, partyOf(state, hailed)) ? partyOf(state, hailed) : hailed && forces().find((a) => a.commander === hailed.id);
    // the one met, fetched or guarded is not the one sent ("send Jory to meet Lady Catelyn at the Twins")
    const sought = (c) => { const x = named.find((y) => y.c.id === c.id); return SOUGHT.test(x ? tok.slice(0, x.i).join(' ') : (kinAt.get(c.id) || '').trim()); };
    const own = people.filter((c) => c.house === house && c.id !== L.lord?.id);
    const others = people.filter((c) => c.house !== house);
    const placeM = mentions(tok, L.places).filter((m) => !inName(m));
    const places = placeM.map((m) => m.id);
    const housesNamed = mentions(tok, L.houses).filter((m) => !inName(m)).map((m) => m.id).filter((id) => id !== house);
    // a host by its banner — but "six rangers" is a number of men, not the host called the Rangers
    const hosts = [...new Set(mentions(tok, L.hostNames).filter((m) => !/^\d+$|^(one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|forty|fifty|hundred|thousand|few|dozen|score)$/.test(tok[m.i - 1] || '')).map((m) => m.id))];
    const nums = numbersIn(clause).map((x) => x.n);
    const firstPlaceAt = placeM[0]?.i ?? Infinity;
    const dest = () => places.at(-1) || (/\bhome\b/.test(t) ? me.seat : /\bhere\b/.test(t) ? resolvePlaceId(L.lord?.loc) : null);
    res.found.people.push(...people.map((c) => c.id)); res.found.places.push(...places); res.found.houses.push(...housesNamed); res.found.hosts.push(...hosts); res.found.numbers.push(...nums);
    const hostMeant = () => (hosts.length ? state.parties[hosts[0]] : hailedHost || (MY_HOST.test(t) || /\b(them|it)\b/.test(t) ? bigHost() : null));
    const A = (verb, params) => act(verb, params, clause);

    // a prayer, a hope, a grief: nothing for the engine ("Pray for my son's safe return")
    if (PRAYER.test(t)) return;
    // ── words to someone far away: a raven (unless the order says to go in person) ──
    const toldTo = named.find((x) => /\btell(?: (?:my|our|lord|lady|ser|king|queen|prince|princess|maester|son|daughter|brother|sister|uncle|cousin))*$/.test(tok.slice(0, x.i).join(' ')) && x.c.id !== L.lord?.id);
    if ((RE.letter.test(t) || (toldTo && resolvePlaceId(toldTo.c.loc) !== resolvePlaceId(L.lord?.loc))) && !(RE.inPerson.test(t) && (own.length || self) && !/\b(raven|letter|write)\b/.test(t))) {
      // "Luwin must write to Riverrun": the writer is one of ours; the letter goes to whoever rules the place
      const ruled = (housesNamed[0] && rulerOf(state, housesNamed[0])) || (places[0] && state.holdings[places[0]] && state.holdings[places[0]].owner !== house && rulerOf(state, state.holdings[places[0]].owner)) || null;
      // the one written *to* comes first ("Write to my son Theon at Winterfell" is to Theon, not to Winterfell's lord)
      const addressed = toldTo?.c || named.find((x) => /\b(to|tell)(?: (?:my|our|the|good|dear|lord|lady|ser|king|queen|prince|princess|maester|son|daughter|brother|sister|uncle|aunt|cousin|nephew|niece|wife|husband|father|mother|kinsman|bannerman))*$/.test(tok.slice(0, x.i).join(' ')))?.c;
      const to = addressed || others[0] || ruled || own.find((c) => !new RegExp(`^${given(c)}\\b`).test(t)) || own[0] || null;
      if (to && to.house === house && to.id === L.lord?.id) { need('To whom should the raven fly?'); return; }
      res.letter = res.letter || { to: to?.id || null };
      if (!to) need('To whom should the raven fly?');
      return;
    }
    if (RE.war.test(t)) {
      const target = housesNamed[0] || others[0]?.house;
      if (target) A('declare_war', { house: target, reason: clause.replace(/^.*?\bwar\b\s+(?:on|upon|against|with)\s+(?:house\s+)?(?:the\s+)?[\w']+[,:;]?\s*(?:for|because of|because|over)?\s*/i, '').slice(0, 200) });
      else need('Declare war on whom?');
      return;
    }
    const realmWide = /\b(men|lords|houses|swords|strength|levies) of (the )?(north|realm|vale|west|westerlands|reach|riverlands|stormlands|dorne|iron islands|isles|crownlands)\b|\b(north|realm|west(?:erlands)?|vale|reach|riverlands|stormlands|isles)['’]?s (levies|men|lords|bannermen|strength|swords)\b|\bnorthmen\b|\ball (the |my )?(lords|vassals|bannermen)\b/.test(t);
    // "call the Harlaws, the Drumms and the Goodbrothers to Pyke": some of the banners, by name
    // …or by their lords ("summon Lord Harlaw to Pyke")
    const sworn = [...new Set([...housesNamed, ...others.filter((c) => state.houses[c.house]?.lord === c.id).map((c) => c.house)])].filter((id) => state.houses[id]?.liege === house);
    if (sworn.length && housesNamed.every((id) => sworn.includes(id)) && /\b(call|summon|muster|bid|bring|gather|order|command|send for)\b/.test(t) && !RE.war.test(t)) { A('call_banners', { vassals: sworn, at: dest() || me.seat }); return; }
    if (RE.banners.test(t) || (realmWide && RE.raise.test(t) && !/\blevies of the isles\b/.test(t))) {
      const at = dest() || me.seat;
      A('call_banners', { vassals: 'all', at });
      // "call the banners and raise my own levies", "gather all the men of the North into one host"
      if (/\b(own|my) levies\b|\braise\w*\s+(?:\w+\s+){0,3}levies\b|\ball\b[^.]*\bmen\b|able[- ]?bod|\bhost\b|\barmy\b/.test(t)) A('raise_levies', { at, ...(nums[0] ? { men: nums[0] } : {}), ...hostName(clause) });
      return;
    }
    // lenders, grain, bribes, ransoms and embargoes (06 §9; WP C1b)
    const lender = /iron bank|braavos/.test(t) ? 'iron_bank' : /\bfaith\b|septons|high septon/.test(t) ? 'faith' : /tyrosh|cartel/.test(t) ? 'tyroshi' : /bank of oldtown/.test(t) ? 'bank_of_oldtown' : housesNamed[0] || null;
    const moonsIn = () => { const m = t.match(/(\d+|two|three|four|five|six)\s+(years?|moons?|months?)/); if (!m) return null; const n = Number(m[1]) || { two: 2, three: 3, four: 4, five: 5, six: 6 }[m[1]]; return /year/.test(m[2]) ? n * 12 : n; };
    if (RE.embargo.test(t)) { const h = housesNamed[0]; const lift = /\b(lift|end|revoke|raise)\b/.test(t); if (h) A('embargo', { house: h, ...(lift ? { lift: 'yes' } : {}) }); else need('Embargo which house?', [], { verb: 'embargo', params: {} }); return; }
    if (RE.repay.test(t) && !RE.ransom.test(t)) { if (lender) A('repay', { lender, ...(nums.find((n) => n >= 100) ? { gold: nums.find((n) => n >= 100) } : {}) }); else need('Repay whom?', [{ label: 'The Iron Bank', patch: { lender: 'iron_bank' } }, { label: 'The Faith', patch: { lender: 'faith' } }], { verb: 'repay', params: {} }); return; }
    if (RE.borrow.test(t)) {
      const gold = nums.find((n) => n >= 100); const months = moonsIn();
      if (lender && gold) A('borrow', { lender, gold, ...(months ? { months } : {}) }); else need(lender ? 'How much should be borrowed?' : 'Borrow from whom?', lender ? [10000, 50000, 100000].map((n) => ({ label: `${n.toLocaleString('en-GB')} dragons`, patch: { gold: n } })) : [{ label: 'The Iron Bank', patch: { lender: 'iron_bank' } }, { label: 'The Tyroshi', patch: { lender: 'tyroshi' } }], { verb: 'borrow', params: { ...(lender ? { lender } : {}), ...(gold ? { gold } : {}) } });
      return;
    }
    if (RE.callDebt.test(t)) { if (housesNamed[0]) A('call_debt', { debtor: housesNamed[0], ...(moonsIn() ? { months: moonsIn() } : {}) }); else need('Call in whose debt?', [], { verb: 'call_debt', params: {} }); return; }
    if (RE.grain.test(t)) { A('buy_grain', { moons: moonsIn() || nums.find((n) => n > 0 && n <= 24) || 2 }); return; }
    if (RE.bribe.test(t)) {
      const who = others[0]; const gold = nums.find((n) => n >= 5); const aim = (clause.split(/\bto\b/).slice(1).join('to').trim() || '').slice(0, 120);
      if (who && gold) A('bribe', { to: who.id, gold, ...(aim ? { aim } : {}) }); else need(who ? 'How much gold?' : 'Bribe whom?', who ? [100, 1000, 5000].map((n) => ({ label: `${n.toLocaleString('en-GB')} dragons`, patch: { gold: n } })) : pick('character'), { verb: 'bribe', params: { ...(who ? { to: who.id } : {}) } });
      return;
    }
    if (RE.ransom.test(t)) {
      const held = [...own, ...others].find((c) => c.house === house && /imprisoned|captive|hostage/.test(c.status || ''));
      if (held) A('pay_ransom', { character: held.id }); else need('Ransom whom?', Object.values(state.characters).filter((c) => c.alive && c.house === house && /imprisoned|captive|hostage/.test(c.status || '')).slice(0, 4).map((c) => ({ label: c.name, patch: { character: c.id } })), { verb: 'pay_ransom', params: {} });
      return;
    }
    if (RE.tax.test(t) && !RE.dues.test(t)) {
      const level = /crushing|bleed|squeeze|double/.test(t) ? 'crushing' : /\b(raise|increase|heavier|heavy|high|higher|more)\b/.test(t) ? 'high' : /\b(lower|reduce|ease|lighten|light|low|less|cut)\b/.test(t) ? 'low' : /\b(normal|usual|customary|ordinary|restore)\b/.test(t) ? 'normal' : null;
      if (level && TAX_LEVELS[level]) A('set_tax', { level }); else need('Raise the taxes, or lower them?', [{ label: 'Raise them', patch: { level: 'high' } }, { label: 'Lower them', patch: { level: 'low' } }, { label: 'As they were', patch: { level: 'normal' } }], { verb: 'set_tax', params: {} });
      return;
    }
    if (RE.dues.test(t)) {
      const status = /\b(withh(?:old|eld|olding)|refus\w*|stop\w*|kept back|keep back|not (?:be )?pa(?:y|id)|no more)\b/.test(t) ? 'withholding' : /\b(delay\w*|late|put off|slow|stall\w*)\b/.test(t) ? 'late' : /\b(pay|paid|paying|in full|on time)\b/.test(t) ? 'paying' : null;
      if (status) A('set_dues', { status }); else need('Pay the dues, delay them, or withhold them?', [{ label: 'Pay them', patch: { status: 'paying' } }, { label: 'Delay them', patch: { status: 'late' } }, { label: 'Withhold them', patch: { status: 'withholding' } }], { verb: 'set_dues', params: {} });
      return;
    }
    if (RE.feast.test(t)) { A('hold_feast', {}); return; }
    if (RE.tourney.test(t)) { A('hold_tourney', {}); return; }
    if (RE.unworks.test(t)) {
      const pr = (state.projects || []).find((x) => x.house === house && x.status === 'active' && tok.some((w) => w.length > 3 && slug(x.name).includes(w)));
      if (pr) A('cancel_works', { project: pr.id }); else need('Which works should stop?', (state.projects || []).filter((x) => x.house === house && x.status === 'active').slice(0, 4).map((x) => ({ label: x.name, patch: { project: x.id } })), { verb: 'cancel_works', params: {} });
      return;
    }
    const work = RE.works.test(t) && WORKS.find(([, re]) => re.test(t));
    if (work && !/\b(levies|host|army|banners)\b/.test(t)) {
      const holding = places.find((id) => state.holdings[id]?.owner === house) || me.seat;
      if (PROJECT_TEMPLATES.find((x) => x.key === work[0])) A('fund_works', { template: work[0], holding }); else need('What should be built?');
      return;
    }
    if (RE.officer.test(t) && !own.some((c) => new RegExp(`\\b${given(c)}\\b`).test(t))) { A('hire_officer', { role: OFFICE_OF(t), ...(places[0] ? { at: places[0] } : {}) }); return; }
    if (RE.appoint.test(t)) {
      const who = own[0] || others[0];
      if (who) A('appoint_office', { character: who.id, role: OFFICE_OF(t) }); else need('Whom should be given the office?', pick('character'), { verb: 'appoint_office', params: { role: OFFICE_OF(t) } });
      return;
    }
    if (RE.hire.test(t) && !/\blevies\b/.test(t)) {
      const men = nums[0]; const at = places[0] || (/\bhere\b|this city|the city/.test(t) ? resolvePlaceId(L.lord?.loc) : null);
      if (men) A('hire_men', { ...(at ? { at } : { at: resolvePlaceId(L.lord?.loc) || me.seat }), men, kind: /sellsword|free company|merc/.test(t) ? 'sellswords' : 'men-at-arms' }); else need('How many men?', [50, 200, 500].map((n) => ({ label: `${n} men`, patch: { men: n } })), { verb: 'hire_men', params: { at: at || resolvePlaceId(L.lord?.loc) || me.seat, kind: /sellsword|free company|merc/.test(t) ? 'sellswords' : 'men-at-arms' } });
      return;
    }
    if ((RE.gift.test(t) || /\b(send|pay|give|offer|grant)\b/.test(t)) && /\b(dragons|gold|coins|stags)\b/.test(t) && (others.length || housesNamed.length)) {
      // "to Lord Harlaw" is to the lord of House Harlaw
      const to = others[0]?.id || (/\b(lord|lady)\s+\w+/.test(t) ? rulerOf(state, housesNamed[0])?.id : null) || housesNamed[0]; const gold = nums.find((n) => n >= 50);
      if (gold) A('send_gift', { to, gold }); else need('How much gold?', [500, 1000, 5000].map((n) => ({ label: `${n.toLocaleString('en-GB')} dragons`, patch: { gold: n } })), { verb: 'send_gift', params: { to } });
      return;
    }
    if (RE.grant.test(t) && places.some((id) => state.holdings[id]?.owner === house) && housesNamed.length) {
      A('grant_holding', { holding: places.find((id) => state.holdings[id]?.owner === house), house: housesNamed[0] });
      return;
    }
    const prisoner = people.find((c) => /imprisoned|captive|hostage/.test(c.status || ''));
    if (prisoner && (RE.judge.test(t) || /\bransom\b/.test(t))) {
      const verdict = /\bransom\b/.test(t) ? 'ransom' : /\bwall\b|take the black/.test(t) ? 'wall' : /\b(behead|execute|hang|death|head)\b/.test(t) ? 'execute' : 'release';
      A('judge_prisoner', { character: prisoner.id, verdict });
      return;
    }
    const secretsWords = RE.secrets.test(t) || /\bwhat\b[^.]*\b(is hiding|hides|conceals)\b/.test(t);
    if ((RE.spies.test(t.replace(/\bspymaster\b/, '')) || secretsWords) && !RE.letter.test(t)) {
      const target = housesNamed[0] || others[0]?.house || (places[0] && state.holdings[places[0]]?.owner !== house ? state.holdings[places[0]]?.owner : null);
      if (target) { A(secretsWords && !RE.spies.test(t.replace(/\bspymaster\b/, '')) ? 'gather_secrets' : 'plant_spy', { house: target }); return; }
    }
    if (RE.disband.test(t)) {
      const a = hostMeant() || bigHost();
      if (a) A('disband_host', { army: a.id }); else need('Which host should go home?', hostPick(), { verb: 'disband_host', params: {} });
      return;
    }
    if (RE.merge.test(t) || (/\b(merge|join|combine|unite)\b/.test(t) && (hosts.length >= 2 || (hosts.length && MY_HOST.test(t))))) { A('merge_hosts', { ...(hosts.length > 1 ? { armies: hosts } : {}), ...hostName(clause) }); return; }
    // standing orders (07 §7.1): what the host does when an enemy comes within reach
    const engage = /\b(avoid|refuse|shun) (a )?(battle|a fight|the enemy)|\bdo not (give|offer) battle\b|\bfall back (before|if)\b/.test(t) ? 'avoid'
      : /\bhold (its|your|our|the|their) ground\b|\bdefend only\b|\bdo not attack\b/.test(t) ? 'hold'
        : /\b(always|whatever the odds)\b[^.]*\b(engage|attack|fight|give battle)\b|\b(engage|attack|fight|give battle)\b[^.]*\bwhatever the odds\b/.test(t) ? 'always'
          : /\b(engage|give battle|fight) (only )?(if|when) the odds\b/.test(t) ? 'favourable' : null;
    if (engage) {
      const a = hostMeant() || bigHost(); if (a) A('set_standing_orders', { army: a.id, engage }); else need('Which host are these orders for?', hostPick(), { verb: 'set_standing_orders', params: { engage } });
      return;
    }
    if (RE.wait.test(t)) {
      const a = hostMeant() || bigHost(); if (a) A('wait_banners', { army: a.id }); else need('Which host should wait for the banners?', hostPick(), { verb: 'wait_banners', params: {} });
      return;
    }
    if (RE.halt.test(t) && (hosts.length || MY_HOST.test(t) || /\bmarch/.test(t))) {
      const a = hostMeant() || forces().find((x) => x.march) || bigHost(); if (a) A('halt_host', { army: a.id }); else need('Which host should halt?', hostPick(), { verb: 'halt_host', params: {} });
      return;
    }
    // a host raised to go somewhere ("raise two thousand men and march them to Moat Cailin") is one raising, with its road
    if (RE.raise.test(t) && !RE.hire.test(t) && !(own.length && RE.travel.test(t) && !/\b(levies|host|army)\b/.test(t))) {
      const at = places.find((id) => state.holdings[id]?.owner === house || state.houses[state.holdings[id]?.owner]?.liege === house) || me.seat;
      const to = places.find((id) => id !== at && /\b(march|send|take|lead|bring)\b/.test(t));
      const lead = own.find((c) => new RegExp(`\\b(under|led by|commanded by|with)\\b[^.]*\\b${given(c)}\\b`).test(t));
      A('raise_levies', { at, ...(nums[0] ? { men: nums[0] } : {}), ...(lead ? { commander: lead.id } : {}), ...(to ? { to } : {}), ...hostName(clause) });
      return;
    }
    if (RE.secrecy.test(t) && (hosts.length || MY_HOST.test(t))) {
      const a = hostMeant(); const mode = /\bopenly|banners (?:flying|high)\b/.test(t) ? 'open' : /\bfeint|make them think|spread word that\b/.test(t) ? 'feint' : 'hidden';
      if (!a) { need('Which host?', hostPick(), { verb: 'set_secrecy', params: { mode, ...(mode === 'feint' ? { to: places[0] } : {}) } }); return; }
      A('set_secrecy', { army: a.id, mode, ...(mode === 'feint' ? { to: places[0] } : {}) });
      if (mode === 'hidden' && places.length && RE.march.test(t)) A('march_host', { army: a.id, to: dest() });
      return;
    }
    // a siege (07 §8.3): storm the walls, or offer the castle terms — the castle named, else the one the host sits before
    const besieged = () => places.find((id) => state.holdings[id]?.siege && Object.values(state.parties).some((a) => a.besieging === id && commands(state, house, a))) || Object.values(state.parties).find((a) => a.besieging && commands(state, house, a))?.besieging;
    // peace (07 §11): "sue House Tully for peace", "offer the Starks a white peace", "demand House Frey's surrender"
    if (/\b(peace|surrender|concede|terms)\b/.test(t) && housesNamed.length && !/\b(besieg|castle|walls|garrison)\b/.test(t)) {
      const terms = /\b(demand|their surrender|must (?:yield|concede|surrender)|bend the knee|if they concede|they (?:shall|will) (?:concede|pay))\b/.test(t) ? 'demand' : /\b(we|i) (?:will )?(yield|concede|surrender)|\bour surrender|\bpay (?:them|tribute)\b/.test(t) ? 'concede' : 'white_peace';
      A('sue_for_peace', { house: housesNamed[0], terms }); return;
    }
    // the free companies (07 §10): "hire the Golden Company", "pay off the Brave Companions"
    const company = /\bgolden company\b/.test(t) ? 'golden_company' : /\b(brave companions|bloody mummers|mummers)\b/.test(t) ? 'brave_companions' : null;
    if (company && /\b(hire|contract|buy|take into (?:our|my) pay|sign)\b/.test(t)) { A('hire_company', { company, ...(nums[0] && nums[0] >= 1000 ? { offer: nums[0] } : {}) }); return; }
    if (company && /\b(dismiss|pay off|release|send away)\b/.test(t)) { A('dismiss_company', { company }); return; }
    // the sea (07 §9): a fleet sent raiding, closing a port, taking a host aboard or putting it ashore
    const myFleet = () => hosts.map((x) => state.parties[x]).find((x) => x?.kind === 'fleet') || Object.values(state.parties).filter((x) => x.kind === 'fleet' && commands(state, house, x)).sort((x, y) => y.ships - x.ships)[0];
    if (/\b(raid|reave|harry|plunder|pay the iron price)\b/.test(t) && places.length && myFleet()) { A('raid_coast', { fleet: myFleet().id, target: places[0] }); return; }
    if (/\bblockade\b|\bclose the (port|harbou?r)\b/.test(t) && myFleet() && (places.length || /\blift\b/.test(t))) { A('blockade', /\blift\b/.test(t) ? { fleet: myFleet().id, lift: true } : { fleet: myFleet().id, holding: places[0] }); return; }
    if (/\b(embark|board|go aboard|take ship|put (?:the )?(?:host|men|army) (?:aboard|on (?:the )?ships))\b/.test(t) && myFleet()) { const a = hostMeant() || bigHost(); if (a) { A('embark_host', { army: a.id, fleet: myFleet().id }); if (places.length && RE.march.test(t) || /\bsail\b/.test(t) && places.length) A('march_host', { army: myFleet().id, to: places[0] }); return; } }
    if (/\b(land|disembark|put (?:the )?(?:host|men|army) ashore|come ashore)\b/.test(t) && myFleet() && Object.values(state.parties).some((x) => x.aboard)) { const f = Object.values(state.parties).find((x) => x.kind === 'fleet' && commands(state, house, x) && Object.values(state.parties).some((y) => y.aboard === x.id)); if (f) { A('land_host', { fleet: f.id }); return; } }
    if (/\b(storm|scale|carry) (?:the )?(walls|castle|keep|gates?)\b|\bstorm (?!\w+'s host)[a-z]/.test(t) && besieged()) { A('storm', { holding: besieged() }); return; }
    if (/\b(offer|give|send) (?:\w+ )?terms\b|\b(demand|bid) (?:its |their |the castle'?s? )?(surrender|yield)\b|\b(call on|summon) [^.]*\bto (yield|surrender)\b/.test(t) && besieged()) {
      const terms = /\bhostage/.test(t) ? 'yield_hostages' : /\b(swear|fealty|bend the knee|sworn)\b/.test(t) ? 'yield_and_swear' : /\b(unconditional|without terms|no terms|at (?:my|our) mercy)\b/.test(t) ? 'unconditional' : 'march_out_with_arms';
      A('offer_terms', { holding: besieged(), terms }); return;
    }
    // the house's people called back from the road (the verb says so if they are not on it)
    if (RE.recall.test(t) && (own.length || others.length)) { for (const c of own.length ? own : others) A('recall_rider', { character: c.id }); return; }
    // who goes: the house's people the order names (or the one it is said to, or the lord himself), else whoever is sent
    const goers = own.filter((c) => !sought(c));
    const movers = goers.length ? goers : self && RE.travel.test(t) ? [L.lord] : addressee && state.characters[addressee]?.house === house ? [state.characters[addressee]]
      : /\b(send|have|order|bid)\b/.test(t) ? named.filter((x) => x.i < firstPlaceAt && !/\b(to|for|with)$/.test(tok.slice(0, x.i).join(' '))).map((x) => x.c).filter((c) => c.house !== house) : [];
    // a host against a host: "attack the Lannister host", "bring Lord Tywin's army to battle"
    // (a castle's garrison is fought by marching on the castle, not as a host in the field)
    const foes = Object.values(state.parties).filter((a) => isForce(a) && a.kind !== 'garrison' && !commands(state, house, a) && a.men > 0);
    const foeNamed = foes.find((a) => hosts.includes(a.id) || (housesNamed.includes(a.owner) && /\b(host|army|forces|men|camp)\b/.test(t)) || others.some((c) => a.commander === c.id && /\b(host|army|forces)\b/.test(t)));
    if (RE.attack.test(t) && foeNamed && (hostMeant() || bigHost())) { A('attack_host', { army: (hostMeant() || bigHost()).id, to: 'party:' + foeNamed.id, intent: 'bring them to battle', ...(/\b(surprise|unawares|ambush|by night|at night|unseen)\b/.test(t) ? { surprise: true } : {}) }); return; }
    // a host to a place: named, or "my host", or — when no one of the house is sent — the lord's host
    const to = dest() || ((RE.attack.test(t) || /\b(march|advance) (?:on|against|upon)\b/.test(t)) && housesNamed.length ? state.houses[housesNamed[0]]?.seat : null);
    // "send someone", "a rider must go": a person the order does not name is a question, not the host
    const someone = /\b(someone|somebody|anyone|a man|a rider|a messenger|an envoy|one of (?:my|our) (?:men|knights|people))\b/.test(t);
    const hostSent = hosts.length || MY_HOST.test(t) || (hailedHost && !RE.menWords.test(t)) || (!movers.length && !someone && (RE.march.test(t) || RE.attack.test(t)) && !/\b(send|ride|go)\s+(?:word|a raven)\b/.test(t));
    if (to && hostSent && (RE.march.test(t) || RE.attack.test(t) || /\bsail\b/.test(t)) && (!own.length || hosts.length || MY_HOST.test(t) || (hailedHost && !RE.menWords.test(t)) || own.every((c) => partyOf(state, c) && commands(state, house, partyOf(state, c)) && !RE.menWords.test(t)))) {
      const host = hostMeant() || bigHost();
      if (host) {
        const lead = own.find((c) => (/\b(under|led by|commanded by)\b/.test(t) || new RegExp(`\\b${given(c)}\\b[^.]*\\b(is to|should|will|shall|must)?\\s*(lead|take|command|march)\\b`).test(t)) && partyOf(state, c)?.id !== host.id)
          || (self && /\b(lead|command|take|ride at the head of)\b/.test(t) && host.commander !== L.lord.id ? L.lord : null);
        A('march_host', { army: host.id, to, ...(lead ? { commander: lead.id } : {}), ...(RE.attack.test(t) || /\b(siege|besiege|take it)\b/.test(t) ? { intent: /\bsiege|besiege\b/.test(t) ? 'lay siege' : 'take it' } : {}) });
        // "bring three thousand spears to White Harbor" with a host of four thousand: part of it, or new levies? The
        // model decides (a split is a verb of phase C); the whole host is only the rule's best guess
        if (nums[0] && !hosts.length && nums[0] < host.men * 0.9) res.complete = false;
        return;
      }
      // no host in the field: the order is still read, and its receipt says why it cannot be done (04 §4.4)
      if (!own.length) { A('march_host', { army: null, to }); res.complete = false; return; }
    }
    // someone to a place ("Send Jon to the Wall with a few men", "Ser Rodrik should ride for White Harbor")
    if (movers.length && (RE.travel.test(t) || RE.march.test(t) || /\breinforce|relieve|join|guard|go to the aid\b/.test(t))) {
      if (!to) { need(`Where should ${movers[0].name} go?`); return; }
      const men = RE.menWords.test(t) || /\b(rangers|brothers|longships|riders)\b/.test(t) ? nums.find((n) => n > 0) ?? 50 : 0;
      // the first named leads the men; the rest ride with them ("Jory is to take ten men and escort my daughters")
      movers.forEach((c, k) => A('send_person', { character: c.id, to, men: k === 0 ? men : 0 }));
      return;
    }
    const verbAsked = RE.march.test(t) || RE.travel.test(t) || RE.attack.test(t);
    const menAsked = RE.menWords.test(t) ? nums.find((x) => x > 0) ?? 50 : 0;
    if (verbAsked && someone && !movers.length) { need('Who should go?', to ? pick('character') : [], to ? { verb: 'send_person', params: { to, men: menAsked } } : null); return; }
    if (verbAsked && hostSent && !to) { const h = hostMeant() || bigHost(); need(h ? `Where should ${h.name} march?` : 'Whom should be sent, and where?'); return; }
    if (verbAsked && !to && !movers.length) { need('Whom should be sent, and where?'); return; }
    if (verbAsked && to && !movers.length && !hostSent) { need('Who should go?', pick('character'), { verb: 'send_person', params: { to, men: menAsked } }); return; }
    // nothing the engine does: a speech, a prayer, a word of comfort — the story tells it
  };
  for (const clause of clausesOf(text)) {
    const was = res.actions.length + !!res.letter + !!res.clarify;
    readClause(clause);
    if (res.actions.length + !!res.letter + !!res.clarify === was && !PRAYER.test(clause.toLowerCase())) res.complete = false;
  }
  if (!res.actions.length && !res.letter && !res.clarify) res.story = true;
  res.found = Object.fromEntries(Object.entries(res.found).map(([k, v]) => [k, Array.isArray(v) ? [...new Set(v)] : v]));
  return res;
}

// "as the Wolf's Host", "called the Army of the Trident", "a great northern host" → { name }
function hostName(t) {
  const named = t.match(/\b(?:as|called|named)\s+(?:the\s+)?((?:[A-Z][\w'’]+\s?){1,4})/); if (named) return { name: `The ${named[1].trim()}` };
  const adj = t.match(/\b(?:a|the)\s+(?:great\s+|grand\s+|mighty\s+)?([a-z]+ern|[A-Z][a-z]+)\s+(host|army)\b/i);
  if (adj && !/^(my|our|their|his|her|new|first|whole|great|entire)$/i.test(adj[1])) return { name: `The ${adj[1].charAt(0).toUpperCase() + adj[1].slice(1).toLowerCase()} ${adj[2].charAt(0).toUpperCase() + adj[2].slice(1).toLowerCase()}` };
  return {};
}
export { destination };
