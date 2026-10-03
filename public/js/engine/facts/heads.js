// The heads: how each kind of fact is told (docs/gdd/18-headlines.md §3.1, §3.3, §4; WP N3). The engine's own line was
// written for the ledger ("Host of House Karstark, 1,796 strong, sets out from Karhold for Winterfell (~48 days)"); a
// head is written for the player, from the fact's SLOTS — who did it, to whom, where, and what the data says — never
// from `f.text` or `f.title`, which no head may read. A person is the subject, the verb is active, the outcome is the
// news, the place is said only when it is the story, and no number is written in a headline (numbers are for `details`).
//
//   HEAD[kind](f, s, c)   the headline: a string; `s` is the state, `c` is the context of ctxFor(); a head names places through
//                         c.at() and people through c.nm(), so the fitting of headline.js (18 §3.1: drop the place, then the
//                         given names, then fall back to the archetype's short template) needs no second head
//   SUM[kind](f, s, c)    the summary's first one or two plain sentences: what the headline cannot say (why, how, who else)
//   ALSO[kind](f, s, c)   one sentence a secondary fact of a story adds to the lead's ("His son Harrion takes Karhold.")
//   DETAIL[kind](f, s, c) the fold's lines: the numbers live here, exact for the viewer's friends, to two figures for the rest
//   ROLES                 who is the patient and who the agent of a deed (18 §3.3): the scorer reads the same table
//   LEDE[kind]            what leads a story when importances tie: HIGHER leads (a death before an arrival, a refusal before
//                         an answer, the result before its cause)
//   ARCHETYPE[kind]       muster march battle siege death capture court wedding letter plot omen works harvest feast other (C1)
//
// Pure and browser-safe: no I/O, no dice, no clock. The verb of a kind is chosen from 2 to 4 forms by a hash of the fact's
// id (never the dice), so the same fact reads the same in every game on every machine.
import { houseLabel, houseShort, who, partyLabel, list } from './label.js';
import { friendsOf } from '../knowledge.js';
import { dateOfDay, longDate } from '../time.js';
import { pronouns } from '../../shared/people.js';
import { HAPPENINGS } from '../../../data/happenings.js';
import { HAP_HEADS } from '../../../data/happening-heads.js';

// ── The tables the scorer shares (18 §3.3) ───────────────────────────────────────────────────────────────────────────
// `act` is the kind of deed; `patient` and `agent` are paths into the fact ("actors.0", "data.by"): a character or a
// house. A battle has sides instead: its winner and loser by house, their commanders by the actors.
export const ROLES = {
  slain_in_battle: { act: 'death', patient: 'actors.0', agent: 'data.by' },
  executed: { act: 'death', patient: 'actors.0', agent: 'data.by' },
  death: { act: 'death', patient: 'actors.0' },
  captured_in_battle: { act: 'capture', patient: 'actors.0', agent: 'data.by' },
  captured: { act: 'capture', patient: 'actors.0', agent: 'data.by' },
  battle: { act: 'defeat', winner: 'data.winnerHouse', loser: 'data.loserHouse' },
  // a siege: the besieged holding (and the house that holds it), and the besiegers (the house that sent them, and their commanders)
  siege_begun: { act: 'siege', patient: 'data.holding', agent: 'data.by', agents: 'actors' },
  siege_tick: { act: 'siege', patient: 'data.holding', agent: 'data.by', agents: 'actors' },
  storm_assault: { act: 'siege', patient: 'data.holding', agent: 'data.by', agents: 'actors' },
  holding_fell: { act: 'siege', patient: 'data.holding', agent: 'data.by' },
};
const at = (o, path) => path.split('.').reduce((v, k) => v?.[k], o);

/** The archetype of every kind (C1): the headline template, the digest and the split of a muster from its refusal read it. */
export const ARCHETYPE = {
  set_out: 'march', returned: 'march', arrived: 'march', turned_back: 'march', met_on_road: 'march', crossed: 'march', delayed: 'march', embarked: 'march', landed: 'march', lost_at_sea: 'other',
  levies_called: 'muster', call_answered: 'muster', call_delayed: 'muster', call_refused: 'court', muster_grew: 'muster', host_formed: 'muster', host_joined: 'muster', host_split: 'march', host_disbanded: 'muster',
  desertion: 'other', host_hungry: 'other', land_stripped: 'other', camp_fever: 'other',
  battle: 'battle', rout: 'battle', withdrew: 'battle', stand_off: 'battle', captured_in_battle: 'capture', slain_in_battle: 'death',
  siege_begun: 'siege', siege_tick: 'siege', sally: 'siege', storm_assault: 'siege', holding_fell: 'siege', siege_lifted: 'siege', relief_near: 'siege', terms_offered: 'siege', terms_refused: 'siege',
  raid: 'battle', village_burned: 'battle', blockade: 'siege', sea_battle: 'battle', sellswords_hired: 'muster', sellswords_turned: 'plot', outlaws_rise: 'other', outlaws_scattered: 'battle', men_hired: 'muster', ambush: 'battle',
  war_declared: 'court', war_joined: 'court', peace_made: 'court', pact_made: 'court', pact_broken: 'court', fealty_sworn: 'court', fealty_renounced: 'court', crowned: 'court', claim_proclaimed: 'court',
  office_granted: 'court', office_stripped: 'court', holding_granted: 'court', attainder: 'court', house_ended: 'court',
  death: 'death', birth: 'court', betrothal: 'wedding', wedding: 'wedding', captured: 'capture', released: 'capture', ransomed: 'capture', executed: 'death', sent_to_wall: 'court', hostage_taken: 'capture', ward_fostered: 'court',
  wounded: 'other', illness: 'other', recovered: 'other', came_of_age: 'court', succession: 'death', regency_begun: 'court', regency_ended: 'court', fled: 'other', vanished: 'other',
  letter_sent: 'letter', letter_arrived: 'letter', letter_intercepted: 'letter', envoy_arrived: 'letter', audience_held: 'letter', gift: 'letter', loan_taken: 'court', loan_repaid: 'court', debt_called: 'court', loan_defaulted: 'court',
  grain_bought: 'works', bribe: 'plot', bribe_refused: 'plot', ransom_demanded: 'capture', embargo: 'court', peace_sued: 'court', cold_war: 'court', commitment_made: 'court', commitment_kept: 'court', commitment_broken: 'court',
  rumour: 'letter', secret_revealed: 'plot', scheme_discovered: 'plot',
  feast: 'feast', tourney: 'feast', tourney_result: 'feast', judgement: 'court', order_given: 'court', petition: 'court', tax_changed: 'works', works_begun: 'works', works_done: 'works', ledger: 'works',
  unrest_rising: 'other', rising: 'other', famine: 'harvest', plague: 'other', season_turned: 'omen', custom_created: 'feast', canon_beat: 'court',
  happening: 'omen', hook: 'court', behaviour: 'other', weather: 'omen', legacy: 'other',
};

/** What leads a story when importances tie (C4): higher leads. The result before its cause, the deed before the errand. */
export const LEDE = {
  crowned: 100, claim_proclaimed: 98, war_declared: 97, peace_made: 96, house_ended: 95, executed: 94, slain_in_battle: 93, holding_fell: 92, attainder: 91, fealty_renounced: 90, pact_broken: 89,
  captured_in_battle: 88, storm_assault: 87, death: 86, sea_battle: 85, battle: 84, rout: 83, siege_begun: 82, siege_lifted: 81, lost_at_sea: 80, succession: 79, captured: 78, wedding: 77, tourney_result: 76,
  call_refused: 75, war_joined: 74, canon_beat: 73, fled: 72, vanished: 72, relief_near: 71, stand_off: 70, withdrew: 69, betrothal: 68, famine: 67, plague: 66, rising: 66, debt_called: 65, loan_defaulted: 65,
  commitment_broken: 64, sent_to_wall: 63, secret_revealed: 62, scheme_discovered: 62, pact_made: 61, fealty_sworn: 60, office_stripped: 60, office_granted: 59, holding_granted: 58, sellswords_turned: 58, released: 57,
  ransomed: 57, hostage_taken: 56, ransom_demanded: 55, tourney: 54, terms_refused: 54, terms_offered: 53, raid: 52, blockade: 52, village_burned: 51, ambush: 51, sally: 50, desertion: 50, host_hungry: 49,
  land_stripped: 48, camp_fever: 48, unrest_rising: 47, outlaws_rise: 46, letter_intercepted: 46, peace_sued: 45, envoy_arrived: 44, call_delayed: 43, levies_called: 42, call_answered: 41, host_formed: 40,
  sellswords_hired: 40, embarked: 39, landed: 39, crossed: 38, arrived: 37, host_joined: 36, host_disbanded: 36, delayed: 35, turned_back: 35, set_out: 34, wounded: 34, illness: 33, birth: 33, regency_begun: 33,
  regency_ended: 32, came_of_age: 32, bribe: 31, bribe_refused: 31, judgement: 30, order_given: 30, petition: 30, tax_changed: 29, gift: 29, loan_taken: 28, loan_repaid: 28, commitment_made: 27, commitment_kept: 27, cold_war: 26,
  embargo: 26, audience_held: 25, letter_arrived: 25, letter_sent: 24, met_on_road: 23, outlaws_scattered: 23, men_hired: 22, ward_fostered: 22, recovered: 21, works_done: 21, feast: 20, custom_created: 20, hook: 19,
  works_begun: 18, host_split: 18, muster_grew: 17, siege_tick: 16, season_turned: 16, grain_bought: 15, returned: 15, rumour: 14, ledger: 12, happening: 11, weather: 10, behaviour: 9, legacy: 8,
};

// ── Small words ──────────────────────────────────────────────────────────────────────────────────────────────────────
const ONES = ['none', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
/** A whole number under a hundred in words ("sixty-one"); '' above (a number for the fold, not for a sentence). */
export function say(n) {
  n = Math.round(n);
  if (!(n >= 0) || n >= 100) return '';
  return n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : '');
}
const cap1 = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const fmt = (n) => Math.round(n).toLocaleString('en-GB');
/** A count for a headline: a word up to twelve (the scorer lets those stand), then "more than a dozen", then "scores of". */
const count = (n) => (n <= 12 ? say(n) : n <= 24 ? 'more than a dozen' : 'scores of');
/** How many men, in words a herald has: exact and small, or a scale. */
const body = (n) => (n <= 12 ? `${say(n)} men` : n < 31 ? 'a score of men' : n < 60 ? 'a few dozen men' : n < 150 ? 'some scores of men' : n < 1500 ? 'hundreds of men' : n < 6000 ? 'thousands of men' : 'a great host');
/** A party's size as the subject of a sentence: "a great host" is one thing and takes the singular verb, the rest take the plural ("a score of men go home", "a great host goes home"). */
const bodyDo = (n, plural, singular) => { const b = body(n); return `${cap1(b)} ${b === 'a great host' ? singular : plural}`; };
/** A span of days in words a herald has ("a week", "near two months"); '' for no days. */
function span(days) {
  const n = Math.round(days);
  if (!(n > 0)) return '';
  if (n === 1) return 'a day';
  if (n < 7) return `${say(n)} days`;
  if (n < 10) return 'a week';
  if (n < 18) return 'a fortnight';
  if (n < 40) return 'about a month';
  if (n < 75) return 'near two months';
  return 'several months';
}
/** "the Twins" for "The Twins": a place after a preposition. */
const theName = (n) => (/^The\s/.test(n) ? `the ${n.slice(4)}` : n);
const plural = (short) => (/s$/.test(short) ? short : `${short}s`);
const possessive = (t) => (/s$/.test(t) ? `${t}'` : `${t}'s`);
/** The plural of a verb the templates write in the third person singular: "seizes" → "seize", "carries" → "carry", "crushes" → "crush". */
const IRREGULAR = { is: 'are', was: 'were', has: 'have', does: 'do' };
const NOT_VERBS = new Set(['against', 'across', 'towards', 'its', 'his', 'this', 'thus', 'always', 'perhaps', 'besides', 'unless', 'less', 'whereas', 'sometimes', 'afterwards']);
export function plural3(w) {
  if (IRREGULAR[w]) return IRREGULAR[w];
  if (!/^[a-z]{3,}s$/.test(w) || NOT_VERBS.has(w) || /(?:ss|us|is)$/.test(w)) return w;
  if (/ies$/.test(w)) return w.length === 4 ? w.slice(0, -1) : `${w.slice(0, -3)}y`; // dies, lies, ties; carries, tries
  return /(?:ss|sh|ch|x|zz|o)es$/.test(w) ? w.slice(0, -2) : w.slice(0, -1);
}
/** The houses told as a people ("the Tullys", "the Free Folk") are many, and the verb after them is too. */
const SPOKEN_AS_MANY = /^(?:paramount|major|minor|exile|tribe)$/;
const isMany = (rank, label) => SPOKEN_AS_MANY.test(rank || 'minor') || (rank === 'company' && /s$/.test(label));
/** The words that have to stand where a person cannot be named. */
const ADJ = { pentos: 'Pentoshi', braavos: 'Braavosi', myr: 'Myrish', tyrosh: 'Tyroshi', lys: 'Lysene', lorath: 'Lorathi', norvos: 'Norvoshi', qohor: 'Qohori', volantis: 'Volantene', greyjoy: 'ironborn', dothraki: 'Dothraki', free_folk: 'wildling', nights_watch: 'Watch' };
/** A region as a place and as an adjective ("the North", "northern"): a roll-up says "Six northern hosts" or "Five hosts of the Vale". */
const REGION = {
  north: ['the North', 'northern'], vale: ['the Vale', null], riverlands: ['the Riverlands', null], westerlands: ['the Westerlands', 'western'], reach: ['the Reach', null], stormlands: ['the Stormlands', null],
  dorne: ['Dorne', 'Dornish'], crownlands: ['the Crownlands', null], iron_islands: ['the Iron Islands', 'ironborn'], wall: ['the Wall', null], beyond: ['the lands beyond the Wall', 'wildling'], essos: ['Essos', null],
};
const hashOf = (id) => { let h = 2166136261; for (const ch of String(id)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } h ^= h >>> 15; h = Math.imul(h, 2246822519); h ^= h >>> 13; return h >>> 0; };
const HOST_KINDS = new Set(['rider', 'envoy', 'retinue']);

// ── The context of a telling ─────────────────────────────────────────────────────────────────────────────────────────
/**
 * The helpers a head reads its words through. `level` is the fitting (0 the whole telling; 1 no place; 2 no place and short
 * names); `opts.pin` forces the verb form (for the tests that read every form). Never throws, never says "undefined": what
 * the world does not know is named plainly or left out (an empty string), and a head builds around the gaps.
 */
export function ctxFor(state, story = null, opts = {}) {
  const s = state; const level = opts.level || 0; const pin = opts.pin;
  const viewer = s.meta?.player;
  const friends = viewer && s.houses?.[viewer] ? friendsOf(s, viewer) : new Set();
  // a place is dropped by the fitting only where someone else is named: a storm at sea has no one but its place to say
  const anyone = (story?.facts || []).some((f) => (f.actors || []).some((id) => s.characters?.[id]) || (f.houses || []).some((id) => s.houses?.[id]));
  const showPlace = level === 0 || !anyone;
  const used = [];
  const mark = (id) => { if (id && !used.includes(id)) used.push(id); return id; };
  const many = new Set(); // the names this telling gave a house as a people: what agrees with them
  const said = (h, label, id = null) => { if (h && !/^House /.test(label) && isMany(h.rank, label) && (!id || label === houseLabel(s, id))) many.add(label); return label; }; // a host named for the whole people ("the Free Folk") is as many as it
  const person = (id) => s.characters?.[id] || null;
  const house = (id) => s.houses?.[id] || null;
  const party = (id) => s.parties?.[id] || null;
  const firstOf = (p) => String(p.name || '').replace(/^(?:Ser|Lord|Lady|Maester|King|Queen|Prince|Princess|Septa|Septon)\s+/, '').split(/\s+/)[0];
  const lastOf = (p) => String(p.name || '').replace(/\s*["“][^"”]*["”]\s*/g, ' ').trim().split(/\s+/).at(-1);
  const c = {
    s, level, story, viewer, used, facts: story?.facts || [],
    /** Pick one of 2 to 4 forms by the fact's id; `salt` moves a second choice off the first. */
    pick(f, forms, salt = 0) { const n = forms.length; return forms[((pin ?? hashOf(f.id)) + salt * 7) % n]; },
    known: { person, house, party },
    mark,
    /** A person as a headline names them: "Robb Stark", "Lord Umber", "King Robert"; '' for a stranger. */
    nm(id) {
      const p = person(id); if (!p) return ''; mark(id);
      const h = house(p.house);
      const by = String(p.name || '').match(/^(.*?)\s*["“]([^"”]+)["”]\s*(.*)$/); // Jon "Greatjon" Umber is the Greatjon Umber
      const full = h?.rank === 'crown' && h.lord === id ? `King ${firstOf(p)}` : level < 2 && by ? `${by[2].trim()} ${(by[3] || by[1]).trim()}` : who(s, p);
      if (level < 2) return full;
      if (/^(?:King|Lord|Lady)\s/.test(full)) return full;
      const hon = String(full).match(/^(Ser|Maester|Septa|Septon)\s/);
      return hon ? `${hon[1]} ${firstOf(p)}` : lastOf(p) || full;
    },
    /** The head of a house as "Lord Umber", "Lady Hornwood"; anyone else as nm(). */
    lordly(id) {
      const n = c.nm(id); const p = person(id); if (!p) return '';
      if (/^(?:King|Lord|Lady|Ser|Maester|Septa|Septon)\s/.test(n)) return n;
      const h = house(p.house);
      return h && h.lord === id && h.rank !== 'crown' ? `${p.sex === 'f' ? 'Lady' : 'Lord'} ${lastOf(p)}` : n;
    },
    /** A given name, or the honorific and given name: for the second mention in a sentence. */
    first(id) { const p = person(id); if (!p) return ''; const hon = String(p.name).match(/^(Ser|Maester|Septa|Septon)\s/); return hon ? `${hon[1]} ${firstOf(p)}` : firstOf(p); },
    he(id, cap = false) { const p = person(id); const w = p ? pronouns(p) : { he: 'they', He: 'They' }; return cap ? w.He : w.he; },
    his(id, cap = false) { const p = person(id); const w = p ? pronouns(p) : { his: 'their', His: 'Their' }; return cap ? w.His : w.his; },
    him(id) { const p = person(id); return p ? pronouns(p).him : 'them'; },
    /** A house: "House Stark", "the Free Folk", "the Crown". */
    hs(id) { const h = house(id); if (!h) return ''; mark(id); return h.rank === 'crown' ? 'the royal house' : said(h, houseLabel(s, id)); },
    short(id) { const h = house(id); if (!h) return ''; mark(id); return houseShort(s, id); },
    /** "the Lannisters", "the Free Folk", "the Crown": a house as a body of people. */
    folk(id) { const h = house(id); if (!h) return ''; mark(id); if (h.rank === 'crown') return 'the royal house'; return said(h, /^(?:paramount|major|minor|exile)$/.test(h.rank || 'minor') ? `the ${plural(houseShort(s, id))}` : houseLabel(s, id)); },
    /** "Stark's": a house that owns a thing ("Stark's call"); the Crown is "the King's". */
    hpos(id) { const h = house(id); if (!h) return ''; mark(id); return h.rank === 'crown' ? "the royal house's" : possessive(houseShort(s, id)); },
    /** The host of a house: "the Stark host". */
    host(id) { const h = house(id); if (!h) return 'a host'; mark(id); return said(h, partyLabel(s, { owner: id }), id); },
    /** A party as it is told: "the Stark host", "the Iron fleet"; a party the world lacks is the host of its owner. */
    pty(id, owner) { const p = party(id); if (p) { mark(id); return said(house(p.owner), partyLabel(s, p), p.owner); } return owner && house(owner) ? c.host(owner) : ''; },
    /** A place after a preposition: "the Twins", "Winterfell"; '' when the world has no such place. */
    pl(id) { const n = s.holdings?.[id]?.name; return n && !/['’]s (?:host|camp)$/i.test(n) ? theName(n) : ''; }, // a camp named for its leader is no place to name
    /** " at the Twins": said at the fitting's first level only, and never when the place is the only name the story has. */
    at(id) { const p = showPlace ? c.pl(id) : ''; return p ? ` at ${p}` : ''; },
    near(id) { const p = showPlace ? c.pl(id) : ''; return p ? ` near ${p}` : ''; },
    off(id) { const p = showPlace ? c.pl(id) : ''; return p ? ` off ${p}` : ''; },
    from(id) { const p = showPlace ? c.pl(id) : ''; return p ? ` ${p}` : ''; },
    /** Where a march is bound: a holding, or the seat of a house ("stark" is Winterfell). */
    dest(id) { if (!id) return ''; if (s.holdings?.[id]) return c.pl(id); const seat = house(id)?.seat; return seat ? c.pl(seat) : ''; },
    region(houseId) { return house(houseId)?.region || null; },
    /** The house a fact is chiefly of: its first actor's, else its first house. */
    owner(f) { const a = person(f.actors?.[0]); if (a && house(a.house)) return a.house; return (f.houses || []).find((h) => house(h)) || null; },
    /** Who a fact is about: its first known actor, else the lord of its house (the King, for the Crown), else the house. */
    subj(f, i = 0) {
      const p = (f.actors || []).slice(i).find((id) => person(id)); if (p) return c.nm(p);
      const h = (f.houses || []).find((x) => house(x));
      if (h) { const lord = house(h).rank === 'crown' ? house(h).lord : null; if (lord && person(lord)) return c.nm(lord); return c.hs(h); }
      const pt = pty(f.data?.party); return pt || 'A lord';
    },
    /** A house's number of men, told for its viewer: exact for its own, its vassals and its allies, two figures for the rest. */
    n(v, houseId) { const x = Math.round(Number(v) || 0); if (friends.has(houseId) || x < 100) return fmt(x); const p = 10 ** (String(x).length - 2); return `about ${fmt(Math.round(x / p) * p)}`; },
    friend(houseId) { return friends.has(houseId); },
    /** The text with the verb after each house told as a people made plural: "The Tullys seizes Stoney Sept" → "The Tullys seize Stoney Sept". */
    agree(text) {
      let out = String(text || '');
      for (const name of many) {
        const re = new RegExp(`(?<![\\w'’])(${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}) ([A-Za-z]+)((?: (?:back|up|out|off|in|down|away))?)(?:( its\\b)|( and) ([a-z]+))?`, 'gi');
        out = out.replace(re, (m, who, verb, particle, its, and, next) => (/^[a-z]/.test(verb) ? `${who} ${plural3(verb)}${particle}${its ? ' their' : ''}${and ? ` and ${plural3(next)}` : ''}` : m));
      }
      return out;
    },
    say, count, body, span, plural, possessive, cap1, fmt, lower1: (t) => t.charAt(0).toLowerCase() + t.slice(1),
  };
  const pty = (id) => (id && party(id) ? c.pty(id) : '');
  return c;
}

// ── Roles, read by a head ────────────────────────────────────────────────────────────────────────────────────────────
/** Who the patient and the agent of a deed are, as ids: a character, a house, or ''. */
const slot = (f, path) => { const v = at(f, path); return typeof v === 'string' ? v : ''; };
/** The name of an agent: a person, a house's people ("the Lannisters"), a party. */
function agentName(c, id) { if (!id) return ''; if (c.known.person(id)) return c.nm(id); if (c.known.house(id)) return c.folk(id); if (c.known.party(id)) return c.pty(id); return ''; }
/** The name of a side of a battle: its commander if the fact names one of that house, else its house's host. */
function sideName(c, f, houseId) {
  const cmd = (f.actors || []).find((a) => c.known.person(a) && c.known.person(a).house === houseId);
  if (cmd) return c.nm(cmd);
  return houseId && c.known.house(houseId) ? c.host(houseId) : '';
}
/** The winner and the loser of a battle: { win, lose, drawn } as names. */
function sides(c, f) {
  const d = f.data || {}; const drawn = !d.winnerHouse && !d.winner;
  let wh = d.winnerHouse; let lh = d.loserHouse;
  if (!wh && d.winner) wh = c.known.party(d.winner)?.owner || null;
  if (!lh && d.loser) lh = c.known.party(d.loser)?.owner || null;
  const actors = (f.actors || []).filter((a) => c.known.person(a));
  let wp = actors.find((a) => wh && c.known.person(a).house === wh); let lp = actors.find((a) => lh && c.known.person(a).house === lh);
  // two commanders and one of them known: the other is the loser (Theon Greyjoy led the Stark van)
  if (!wp && lp) wp = actors.find((a) => a !== lp); if (!lp && wp) lp = actors.find((a) => a !== wp);
  const named = (pid, hid) => (pid ? c.nm(pid) : hid && c.known.house(hid) ? c.host(hid) : '');
  if (drawn) { const [a, b] = actors; return { drawn, win: a ? c.nm(a) : '', lose: b ? c.nm(b) : '', winId: a, loseId: b }; }
  return { drawn, win: named(wp, wh), lose: named(lp, lh), winHouse: wh, loseHouse: lh, winId: wp, loseId: lp };
}

// ── Small tellings the heads share ───────────────────────────────────────────────────────────────────────────────────
/** Whether a march is an army's (a host, a fleet) or a rider's: by the party if the world has it, else by what the fact says of it. */
function isHost(c, f) {
  const d = f.data || {}; const p = c.known.party(d.party);
  if (p) return !HOST_KINDS.has(p.kind);
  const id = String(d.party || '');
  if (/rider|^party_|retinue|envoy/.test(id) || d.why) return false;
  return true;
}
/** The army of a fact, told by name: "the Karstark host", "the Iron fleet". */
const armyOf = (c, f) => c.pty(f.data?.party, c.owner(f)) || 'the host';
/** A house's banners: "the northern banners", "the banners of the Vale", else its own. */
function bannersOf(c, houseId) {
  const region = REGION[c.region(houseId)];
  if (region?.[1]) return `the ${region[1]} banners`;
  return region ? `the banners of ${region[0]}` : `${c.hpos(houseId) || 'its'} banners`;
}
/** Whether a house is a House of the realm (whose banners are called) and not a tribe, an order or a company. */
const isProperHouse = (c, id) => /^(?:paramount|major|minor|exile|crown)$/.test(c.known.house(id)?.rank || 'minor');
/** The side a liege's name stands for in "Stark's call": `d.to` is a house or a holding of one. */
function liegeOf(c, d) {
  const id = d.liege || d.to; if (!id) return null;
  if (c.known.house(id)) return id;
  const o = c.s.holdings?.[id]?.owner; return o && c.known.house(o) ? o : null;
}
const lower1 = (t) => t.charAt(0).toLowerCase() + t.slice(1);
/** The kind of works, from the project's own key or name: what it is, and the verbs a lord builds it with. */
const WORKS = [
  [/market|fair/, 'a market', ['opens a market', 'founds a market', 'starts work on a market']],
  [/warship|shipyard|galley|ships?\b/, 'warships', ['builds warships', 'lays down warships', 'orders warships built']],
  [/granar/, 'the granaries', ['fills the granaries', 'builds new granaries', 'lays in stores at the granaries']],
  [/wall|fort/, 'the walls', ['strengthens the walls', 'raises the walls higher', 'begins new walls']],
  [/road|bridge/, 'the roads', ['repairs the roads', 'rebuilds the bridges', 'mends the roads']],
  [/men.at.arms|train/, 'men-at-arms', ['trains men-at-arms', 'takes on men-at-arms', 'drills men-at-arms']],
  [/sept|godswood/, 'a sept', ['founds a sept', 'endows a sept', 'builds a sept']],
  [/rookery|maester/, 'a rookery', ['raises a rookery', 'builds a rookery', 'founds a rookery']],
  [/harbou?r|wharf|wharves/, 'the harbour', ['builds new wharves', 'deepens the harbour', 'improves the harbour']],
  [/barrack/, 'barracks', ['builds barracks', 'raises barracks', 'orders barracks built']],
  [/smith|armou?ry/, 'an armoury', ['builds an armoury', 'raises an armoury', 'founds an armoury']],
  [/stable|horse/, 'stables', ['builds new stables', 'raises new stables', 'lays out new stables']],
  [/\binn|toll/, 'inns on the road', ['builds inns on the road', 'raises inns on the road', 'lays out inns on the road']],
  [/almshouse|hospice/, 'an almshouse', ['founds an almshouse', 'builds an almshouse', 'endows an almshouse']],
  [/mine/, 'new mines', ['opens new mines', 'digs new mines', 'sinks new mines']],
];
const worksOf = (d) => { const t = `${d.project || ''} ${d.name || ''}`.toLowerCase(); return WORKS.find(([re]) => re.test(t)) || [null, 'new works', ['starts new works', 'builds new works', 'orders new works']]; };
const dateLine = (f) => (Number.isFinite(f.day) ? `On ${longDate(dateOfDay(f.day))}.` : '');
/** The victor of a siege or an assault: the actor of the besieging house, else the besieging house's people. */
function victor(c, f) {
  const by = f.data?.by; const a = (f.actors || []).find((id) => c.known.person(id) && by && c.known.person(id).house === by);
  return a ? c.nm(a) : by ? agentName(c, by) : (f.actors?.[0] && c.known.person(f.actors[0]) ? c.nm(f.actors[0]) : '');
}
const holdingOf = (c, f) => c.pl(f.data?.holding || f.place);
const sea = (c, f) => (c.known.party(f.data?.party)?.kind === 'fleet');

// ── The headlines ────────────────────────────────────────────────────────────────────────────────────────────────────
export const HEAD = {
  // ── Movement ──
  set_out: (f, s, c) => {
    const d = f.data || {}; const a = c.subj(f); const hasPerson = (f.actors || []).some((id) => c.known.person(id)); const host = isHost(c, f);
    if (d.against) {
      const foe = c.known.party(d.against) ? c.pty(d.against) : c.known.house(d.against) ? c.folk(d.against) : '';
      const army = armyOf(c, f);
      if (foe) {
        if (!hasPerson) return c.pick(f, [`${army} marches against ${foe}`, `${army} turns on ${foe}`]);
        return c.pick(f, sea(c, f) ? [`${a} sails ${army} against ${foe}`, `${a} sends ${army} against ${foe}`] : [`${a} leads ${army} against ${foe}`, `${a} sends ${army} against ${foe}`, `${a} turns ${army} on ${foe}`]);
      }
    }
    const to = c.dest(d.to);
    // a voyage is told as one (Maege Mormont "rides for Deepwood Motte" while the engine had her at sea: ST12): the slot, or the party's route, says part of it is by ship
    const bySea = d.sea || c.known.party(d.party)?.route?.sea;
    if (host) {
      const me = hasPerson ? a : armyOf(c, f);
      if (bySea && to) return c.pick(f, hasPerson ? [`${a} sails for ${to}`, `${a} takes ship for ${to} with ${c.his(f.actors.find((id) => c.known.person(id)))} host`] : [`${me} sails for ${to}`, `${me} takes ship for ${to}`]); const own = hasPerson ? `${c.his(f.actors.find((id) => c.known.person(id)))} host` : '';
      if (!to) return c.pick(f, [`${me} takes the road${c.from(f.place) ? ` from${c.from(f.place)}` : ''}`, `${me} marches out${c.at(f.place)}`]);
      return c.pick(f, hasPerson ? [`${a} marches for ${to}`, `${a} leads ${own} to ${to}`, `${a} takes the road to ${to}`] : [`${me} marches for ${to}`, `${me} takes the road to ${to}`]);
    }
    if (!to) return c.pick(f, [`${a} rides out${c.from(f.place) ? ` from${c.from(f.place)}` : ''}`, `${a} takes the road${c.at(f.place)}`]);
    if (bySea) return c.pick(f, [`${a} sails for ${to}`, `${a} takes ship for ${to}`, `${a} leaves${c.from(f.place)} by sea for ${to}`]);
    return c.pick(f, [`${a} rides for ${to}`, `${a} leaves${c.from(f.place)} for ${to}`, `${a} takes the road to ${to}`]);
  },
  returned: (f, s, c) => { const a = c.subj(f); const p = c.pl(f.place); return c.pick(f, p ? [`${a} returns to ${p}`, `${a} rides home to ${p}`] : [`${a} returns home`, `${a} rides home`]); },
  arrived: (f, s, c) => {
    const d = f.data || {}; const a = c.subj(f); const p = c.pl(f.place); const host = isHost(c, f) && d.men > 60; const person = c.known.person(f.actors?.[0]);
    if (!p) return c.pick(f, [`${a} ends the march`, `${a} completes the march`]);
    return c.pick(f, host && person ? [`${a} reaches ${p}`, `${a} arrives at ${p}`, `${a} brings ${c.his(f.actors[0])} host to ${p}`] : [`${a} reaches ${p}`, `${a} arrives at ${p}`, `${a} rides into ${p}`]);
  },
  turned_back: (f, s, c) => { const a = c.subj(f); return f.data?.halted ? c.pick(f, [`${a} halts the march${c.near(f.place)}`, `${a} abandons the march${c.near(f.place)}`]) : c.pick(f, [`${a} turns back${c.near(f.place)}`, `${a} abandons the march${c.near(f.place)}`]); },
  met_on_road: (f, s, c) => {
    const a = c.subj(f); const b = (f.actors || []).length > 1 && c.known.person(f.actors[1]) ? c.nm(f.actors[1]) : '';
    return b ? c.pick(f, [`${a} meets ${b} on the road${c.near(f.place)}`, `${a} and ${b} meet on the road${c.near(f.place)}`]) : `${a} meets a stranger on the road${c.near(f.place)}`;
  },
  crossed: (f, s, c) => { const a = c.subj(f); const p = c.pl(f.place); return p ? c.pick(f, [`${a} crosses at ${p}`, `${a} passes ${p}`]) : `${a} passes the narrows`; },
  delayed: (f, s, c) => { const a = c.subj(f); return c.pick(f, [`${a} waits for ships${c.at(f.place)}`, `${a} is held up${c.at(f.place)}`]); },
  embarked: (f, s, c) => {
    const d = f.data || {}; const a = c.subj(f); const to = c.dest(d.to); const army = armyOf(c, f);
    return c.pick(f, to ? [`${a} sails ${army} for ${to}`, `${a} takes ${army} to ${to} by sea`] : [`${a} sails with ${army}${c.from(f.place) ? ` from${c.from(f.place)}` : ''}`, `${a} takes ${army} to sea${c.at(f.place)}`]);
  },
  landed: (f, s, c) => { const a = c.subj(f); const p = c.pl(f.place); return c.pick(f, p ? [`${a} lands at ${p}`, `${a} comes ashore at ${p}`] : [`${a} lands from the sea`, `${a} makes landfall`]); },
  lost_at_sea: (f, s, c) => {
    const d = f.data || {}; const ships = Number(d.ships) || 0; const fleet = c.known.party(d.party) ? c.pty(d.party) : ''; const flag = ADJ[(f.houses || [])[0]] || '';
    const n = ships ? `${cap1(say(ships) || 'several')} ${flag ? `${flag} ` : ''}${ships === 1 ? 'ship' : 'ships'}` : `${cap1(flag ? `${flag} ` : '')}ships`.trim();
    const off = c.off(f.place) || ' at sea';
    if (fleet) return c.pick(f, [`${cap1(fleet)} loses ${ships ? `${say(ships) || 'many'} ${ships === 1 ? 'ship' : 'ships'}` : 'ships'}${off}`, `${ships ? `${cap1(say(ships) || 'many')} ships` : 'Ships'} of ${fleet} lost${off}`, `The sea takes ${ships ? `${say(ships) || 'many'} ships` : 'ships'} of ${fleet}${off}`]);
    return c.pick(f, [`${n} lost${off}`, `The sea takes ${lower1(n)}${off}`]);
  },

  // ── Military ──
  levies_called: (f, s, c) => {
    const d = f.data || {}; const a = c.subj(f); const h = c.owner(f); const person = (f.actors || []).some((id) => c.known.person(id));
    const to = c.dest(d.muster); const where = to ? ` to ${to}` : c.at(f.place);
    if (!h || isProperHouse(c, h)) {
      const b = h ? bannersOf(c, h) : 'the banners';
      return c.pick(f, [`${a} calls ${b}${where}`, `${a} raises ${b}${c.at(f.place)}`, person ? `${a} summons ${c.his(f.actors.find((id) => c.known.person(id)))} bannermen${where}` : `${a} summons its bannermen${where}`]);
    }
    const folk = c.folk(h);
    return c.pick(f, [`${a} gathers ${folk}${c.at(f.place)}`, `${a} calls ${folk} to arms`, `${a} raises ${folk}${c.at(f.place)}`]);
  },
  call_answered: (f, s, c) => {
    const d = f.data || {}; const a = c.subj(f); const lg = liegeOf(c, d); const to = c.dest(d.to); const man = (f.actors || []).find((id) => c.known.person(id));
    const his = man ? c.his(man) : 'its';
    if (lg) return c.pick(f, [`${a} answers ${c.hpos(lg)} call`, `${a} rallies to ${c.hs(lg)}`, to ? `${a} brings ${his} men to ${to}` : `${a} sends ${his} men to ${c.hs(lg)}`]);
    return c.pick(f, [`${a} answers the call`, `${a} sends ${his} men to the muster`]);
  },
  call_delayed: (f, s, c) => { const a = c.subj(f); const man = (f.actors || []).find((id) => c.known.person(id)); return c.pick(f, [`${a} puts off the call`, `${a} holds back ${man ? c.his(man) : 'its'} answer`]); },
  call_refused: (f, s, c) => {
    const d = f.data || {}; const id = (f.actors || []).find((x) => c.known.person(x)); const a = id ? c.nm(id) : c.subj(f); const lg = liegeOf(c, d); const at = c.at(f.place);
    return lg
      ? c.pick(f, [`${a} refuses ${c.hpos(lg)} summons${at}`, `${a} turns down ${c.hpos(lg)} call${at}`, `${a} declines ${c.hpos(lg)} call to arms${at}`, `${a} refuses to march for ${c.short(lg)}${at}`])
      : c.pick(f, [`${a} refuses the summons${at}`, `${a} turns down the call${at}`, `${a} declines the call to arms${at}`]);
  },
  muster_grew: (f, s, c) => { const a = c.subj(f); return c.pick(f, [`${a} sends more men to the muster`, `${a} swells the host`]); },
  host_formed: (f, s, c) => {
    const a = c.subj(f); const man = (f.actors || []).find((id) => c.known.person(id)); const his = man ? c.his(man) : 'its';
    if (!man) return c.pick(f, [`${a} raises a host${c.at(f.place)}`, `${a} gathers a host${c.at(f.place)}`]);
    return c.pick(f, [`${a} raises ${his} men${c.at(f.place)}`, `${a} gathers ${his} host${c.at(f.place)}`, `${a} musters ${his} banners${c.at(f.place)}`]);
  },
  host_joined: (f, s, c) => {
    const a = c.subj(f); const man = (f.actors || []).find((id) => c.known.person(id)); const own = c.owner(f);
    const other = (f.houses || []).find((h) => h !== own && c.known.house(h)); const host = other ? c.host(other) : 'the host';
    return c.pick(f, [`${a} joins ${host}${c.at(f.place)}`, own ? `${c.short(own)} men join ${host}${c.at(f.place)}` : `${a} joins ${host}${c.at(f.place)}`, man ? `${a} brings ${c.his(man)} men to ${host}${c.at(f.place)}` : `${a} joins ${host}${c.at(f.place)}`]);
  },
  host_split: (f, s, c) => `${c.subj(f)} splits ${armyOf(c, f)}${c.at(f.place)}`,
  host_disbanded: (f, s, c) => {
    const army = armyOf(c, f); const T = c.pl(f.place);
    if (/overcome/.test(f.data?.why || '')) return T ? `${cap1(army)} is overcome at ${T}` : `${cap1(army)} is overcome`; // (a household of a hall taken by force, ST8)
    const a = c.subj(f); return c.pick(f, [`${a} disbands ${army}`, `${a} sends ${army} home`]);
  },
  desertion: (f, s, c) => { const army = armyOf(c, f); return c.pick(f, [`Men desert ${army}${c.at(f.place)}`, `${cap1(army)} bleeds men${c.at(f.place)}`]); },
  host_hungry: (f, s, c) => { const army = armyOf(c, f); return c.pick(f, [`${cap1(army)} runs out of food${c.near(f.place)}`, `${cap1(army)} is left hungry${c.near(f.place)}`]); },
  land_stripped: (f, s, c) => {
    const d = f.data || {}; const p = c.pl(d.holding || f.place); const h = (f.houses || []).find((x) => c.known.house(x));
    const army = c.known.party(d.party) ? c.pty(d.party) : '';
    const where = p ? `the lands near ${p}` : h ? `the lands of ${c.hs(h)}` : 'the land';
    return c.pick(f, army ? [`${cap1(army)} strips ${where}`, `Foragers strip ${where}`] : [`Foragers strip ${where}`, `Foragers strip ${where} bare`]);
  },
  camp_fever: (f, s, c) => { const army = armyOf(c, f); return c.pick(f, [`Fever strikes ${army}${c.near(f.place)}`, `Camp fever sickens ${army}${c.near(f.place)}`]); },
  battle: (f, s, c) => {
    const d = f.data || {}; const v = sides(c, f); const near = c.near(f.place);
    const hs = (f.houses || []).filter((h) => c.known.house(h));
    if (v.drawn) {
      const a = v.win || (hs[0] ? c.host(hs[0]) : ''); const b = v.lose || (hs[1] ? c.host(hs[1]) : '');
      return a && b ? c.pick(f, [`${a} and ${b} fight to a draw${near}`, `${a} and ${b} fight a bloody draw${near}`]) : `A hard battle ends in a draw${near}`;
    }
    const W = v.win; const L = v.lose;
    if (!W) return c.pick(f, [`${cap1(L)} beaten${near}`, `${cap1(L)} routed${near}`].map((t) => (L ? t : `A battle is fought${near}`)));
    if (!L) return c.pick(f, [`${W} wins the field${c.at(f.place)}`, `${W} carries the field${c.at(f.place)}`]);
    const crush = d.outcome === 'crushing' || d.wiped;
    return crush
      ? c.pick(f, [`${W} breaks ${L}${near}`, `${W} routs ${L}${near}`, `${W} crushes ${L}${near}`, `${L} routed by ${W}${near}`])
      : c.pick(f, [`${W} beats ${L}${near}`, `${W} defeats ${L}${near}`, `${L} beaten by ${W}${near}`, `${W} wins the field from ${L}${near}`]);
  },
  rout: (f, s, c) => { const a = c.subj(f); const army = armyOf(c, f); return c.pick(f, [`${a} flees the field${c.near(f.place)}`, `${cap1(army)} breaks and flees${c.near(f.place)}`]); },
  withdrew: (f, s, c) => { const a = c.subj(f); return c.pick(f, [`${a} refuses battle${c.near(f.place)}`, `${a} withdraws${c.near(f.place)}`, `${a} falls back${c.near(f.place)}`]); },
  stand_off: (f, s, c) => {
    const actors = (f.actors || []).filter((id) => c.known.person(id)); const hs = (f.houses || []).filter((h) => c.known.house(h));
    const a = actors[0] ? c.nm(actors[0]) : hs[0] ? c.host(hs[0]) : 'One host'; const b = actors[1] ? c.nm(actors[1]) : hs[1] ? c.host(hs[1]) : 'the other';
    return c.pick(f, [`${a} and ${b} hold off from battle${c.near(f.place)}`, `${a} and ${b} watch each other${c.near(f.place)}`]);
  },
  captured_in_battle: (f, s, c) => {
    const p = c.nm(f.actors?.[0]) || c.subj(f); const by = agentName(c, slot(f, 'data.by')); const near = c.near(f.place);
    return by ? c.pick(f, [`${p} captured by ${by}${near}`, `${p} taken by ${by}${near}`, `${by} captures ${p}${near}`, `${by} takes ${p} prisoner${near}`]) : c.pick(f, [`${p} captured${near}`, `${p} taken captive${near}`]);
  },
  slain_in_battle: (f, s, c) => {
    const p = c.nm(f.actors?.[0]) || c.subj(f); const by = agentName(c, slot(f, 'data.by')); const at = c.at(f.place);
    return by ? c.pick(f, [`${p} slain by ${by}${at}`, `${p} cut down by ${by}${at}`, `${p} killed by ${by}${at}`, `${p} struck down by ${by}${at}`]) : c.pick(f, [`${p} slain${at}`, `${p} dies in battle${at}`, `${p} falls in battle${at}`, `${p} killed${at}`]);
  },
  siege_begun: (f, s, c) => {
    const a = victor(c, f) || c.subj(f); const T = holdingOf(c, f) || 'a castle';
    return c.pick(f, [`${a} besieges ${T}`, `${a} lays siege to ${T}`, `${T} besieged by ${a}`, `${a} closes on ${T}`]);
  },
  siege_tick: (f, s, c) => { const a = victor(c, f) || c.subj(f); const T = holdingOf(c, f) || 'the castle'; return `${a} keeps up the siege of ${T}`; },
  sally: (f, s, c) => { const a = c.subj(f); const T = holdingOf(c, f) || 'the castle'; return c.pick(f, [`${a} strikes out from ${T}`, `${a} hits the besiegers from ${T}`.replace('hits', 'strikes')]); },
  storm_assault: (f, s, c) => {
    const d = f.data || {}; const a = victor(c, f) || c.subj(f); const T = holdingOf(c, f) || 'the castle';
    if (d.carried === false) return c.pick(f, [`${a} falls back from ${T}`, `${T} holds against ${a}`]);
    return c.pick(f, [`${a} storms ${T}`, `${T} falls to ${a}`, `${a} carries ${T} by storm`]);
  },
  holding_fell: (f, s, c) => {
    const d = f.data || {}; const a = victor(c, f) || c.subj(f); const T = holdingOf(c, f) || 'a castle';
    if (d.how === 'betrayed') return c.pick(f, [`${T} betrayed to ${a}`, `${T} falls to ${a}`, `${a} takes ${T}`]);
    if (d.how === 'starved') return c.pick(f, [`${T} falls to ${a}`, `${a} starves ${T} into surrender`, `${a} takes ${T}`]);
    return c.pick(f, [`${T} falls to ${a}`, `${a} takes ${T}`, `${a} seizes ${T}`]);
  },
  siege_lifted: (f, s, c) => { const a = victor(c, f) || c.subj(f); const T = holdingOf(c, f) || 'the castle'; return c.pick(f, [`${a} lifts the siege of ${T}`, `${a} gives up the siege of ${T}`]); },
  relief_near: (f, s, c) => { const a = c.subj(f); const T = holdingOf(c, f) || 'the castle'; return c.pick(f, [`${a} marches to relieve ${T}`, `${a} comes to the relief of ${T}`.replace('comes to the relief of', 'marches to relieve')]); },
  terms_offered: (f, s, c) => {
    const a = c.subj(f); const T = holdingOf(c, f) || 'the castle';
    return c.pick(f, [`${a} offers terms to ${T}`, `${a} demands that ${T} yield`]);
  },
  terms_refused: (f, s, c) => {
    const d = f.data || {}; const a = (f.actors || []).find((id) => c.known.person(id)) ? c.nm(f.actors.find((id) => c.known.person(id))) : c.subj(f);
    const other = (f.houses || []).find((h) => c.known.house(h) && h !== c.owner(f)); const T = holdingOf(c, f);
    const terms = other ? `${c.hpos(other)} terms` : 'the terms';
    return c.pick(f, [`${a} refuses ${terms}${T ? ` for ${T}` : ''}`, `${a} rejects ${terms}${T ? ` for ${T}` : ''}`]);
  },
  raid: (f, s, c) => { const a = c.subj(f); const T = c.pl(f.place); return c.pick(f, [`${a} raids ${T ? `the lands near ${T}` : 'the coast'}`, `${a} plunders ${T ? `the lands near ${T}` : 'the coast'}`]); },
  village_burned: (f, s, c) => {
    const by = slot(f, 'data.by'); const who1 = by && c.known.house(by) ? c.folk(by) : '';
    return who1 ? c.pick(f, [`${cap1(who1)} burns a village${c.near(f.place)}`, `A village burns${c.near(f.place)}`]) : `A village burns${c.near(f.place)}`;
  },
  blockade: (f, s, c) => { const a = c.subj(f); const T = holdingOf(c, f) || 'a port'; return c.pick(f, [`${a} blockades ${T}`, `${a} shuts ${T} off from the sea`]); },
  sea_battle: (f, s, c) => {
    const d = f.data || {}; const w = c.known.party(d.winner) ? c.pty(d.winner) : ''; const l = c.known.party(d.loser) ? c.pty(d.loser) : '';
    const off = c.off(f.place);
    if (w && l) return c.pick(f, [`${cap1(w)} beats ${l}${off}`, `${cap1(w)} defeats ${l}${off}`, `${cap1(l)} beaten by ${w}${off}`]);
    const v = sides(c, f); const W = v.win; const L = v.lose;
    if (W && L) return c.pick(f, [`${W} beats ${L}${off || ' at sea'}`, `${W} defeats ${L}${off || ' at sea'}`]);
    return `A sea fight is fought${off || ' at sea'}`;
  },
  sellswords_hired: (f, s, c) => { const h = (f.houses || []).find((x) => c.known.house(x)); const a = h ? c.hs(h) : c.subj(f); return c.pick(f, [`${a} hires sellswords`, `${a} buys a company of sellswords`]); },
  sellswords_turned: (f, s, c) => {
    const d = f.data || {}; const from = c.known.house(d.from) ? c.hs(d.from) : ''; const to = c.known.house(d.to) ? c.hs(d.to) : '';
    // when the houses are not known to the viewer, the company's captain is: the captain is the one seen to break the contract
    return from && to ? c.pick(f, [`Sellswords desert ${from} for ${to}`, `${to} buys sellswords away from ${from}`]) : `${c.subj(f)} breaks contract and changes sides${c.near(f.place)}`;
  },
  outlaws_rise: (f, s, c) => c.pick(f, [`Outlaws take to the roads${c.near(f.place)}`, `Broken men rise${c.near(f.place)}`]),
  outlaws_scattered: (f, s, c) => { const h = (f.houses || []).find((x) => c.known.house(x)); return c.pick(f, [`Outlaws are scattered${c.near(f.place)}`, h ? `${c.hs(h)} breaks the outlaws${c.near(f.place)}` : `Outlaws are broken${c.near(f.place)}`]); },
  men_hired: (f, s, c) => { const a = c.subj(f); return c.pick(f, [`${a} hires men-at-arms${c.at(f.place)}`, `${a} takes men-at-arms into pay`]); },
  ambush: (f, s, c) => { const a = c.subj(f); return c.pick(f, [`${a} is ambushed${c.near(f.place)}`, `Outlaws ambush ${a}${c.near(f.place)}`]); },

  // ── Politics ──
  war_declared: (f, s, c) => {
    const d = f.data || {}; const A = warSide(c, f, (d.attackers || [])[0], 0); const D = warSide(c, f, (d.defenders || [])[0], 1);
    return A && D ? c.pick(f, [`${A} declares war on ${D}`, `War breaks out between ${A} and ${D}`, `${A} takes up arms against ${D}`]) : `${A || D || 'A great house'} declares war`;
  },
  war_joined: (f, s, c) => {
    const a = c.subj(f); const own = c.owner(f); const other = (f.houses || []).find((h) => h !== own && c.known.house(h));
    return other ? c.pick(f, [`${a} joins the war beside ${c.hs(other)}`, `${a} takes ${c.hpos(other)} side in the war`]) : `${a} joins the war`;
  },
  peace_made: (f, s, c) => {
    const A = warSide(c, f, (f.houses || [])[0], 0); const B = warSide(c, f, (f.houses || [])[1], 1);
    return A && B ? c.pick(f, [`${A} and ${B} sign a peace`, `${A} ends the war with ${B}`, `Peace ends the war between ${A} and ${B}`]) : `${A || B || 'The houses'} sign a peace`;
  },
  pact_made: (f, s, c) => {
    const d = f.data || {}; const A = pactSide(c, f, 0); const B = pactSide(c, f, 1); const alliance = d.type === 'alliance'; const noun = alliance ? 'an alliance' : d.type ? `a ${d.type} pact` : 'a pact';
    if (!A || !B) return `${A || B || 'Two houses'} sign ${noun}`;
    return c.pick(f, alliance ? [`${A} and ${B} swear ${noun}`, `${A} signs ${noun} with ${B}`, `${A} and ${B} ally`] : [`${A} and ${B} sign ${noun}`, `${A} signs ${noun} with ${B}`]);
  },
  pact_broken: (f, s, c) => {
    const d = f.data || {}; const A = pactSide(c, f, 0); const B = pactSide(c, f, 1); const noun = d.type === 'alliance' ? 'the alliance' : d.type ? `the ${d.type} pact` : 'the pact';
    return A && B ? c.pick(f, [`${A} breaks ${noun} with ${B}`, `${A} turns on ${B}`]) : `${A || B || 'A house'} breaks ${noun}`;
  },
  fealty_sworn: (f, s, c) => {
    const d = f.data || {}; const a = c.subj(f); const lg = liegeName(c, f, d.liege);
    return lg ? c.pick(f, [`${a} swears fealty to ${lg}`, `${a} kneels to ${lg}`]) : `${a} swears fealty${c.at(f.place)}`;
  },
  fealty_renounced: (f, s, c) => {
    const d = f.data || {}; const a = c.subj(f); const lg = c.known.house(d.liege) ? c.hs(d.liege) : ''; const to = c.known.house(d.to) ? c.hs(d.to) : '';
    if (!lg) return `${a} renounces ${c.hpos(c.owner(f)) ? 'his' : 'his'} liege`.replace('his', 'a sworn');
    return c.pick(f, to ? [`${a} renounces ${lg}`, `${a} breaks faith with ${lg}`, `${a} turns from ${lg} to ${to}`] : [`${a} renounces ${lg}`, `${a} breaks faith with ${lg}`]);
  },
  crowned: (f, s, c) => {
    const d = f.data || {}; const a = c.subj(f); const t = String(d.title || '').trim();
    return t ? c.pick(f, [`${a} crowned ${t}${c.at(f.place)}`, `${a} takes the crown${c.at(f.place)}`, `${a} is crowned ${t}${c.at(f.place)}`]) : `${a} takes the crown${c.at(f.place)}`;
  },
  claim_proclaimed: (f, s, c) => {
    const d = f.data || {}; const id = (f.actors || []).find((x) => c.known.person(x)); const a = c.subj(f);
    const short = String(d.title || '').split(/\s+(?:of|in)\s+/)[0].trim().toLowerCase();
    return short && id ? c.pick(f, [`${a} proclaims ${c.he(id) === 'she' ? 'herself' : 'himself'} ${short}${c.at(f.place)}`, `${a} lays claim to the crown${c.at(f.place)}`]) : `${a} lays claim to the crown${c.at(f.place)}`;
  },
  office_granted: (f, s, c) => {
    const d = f.data || {}; const a = c.subj(f); const g = (f.actors || [])[1] && c.known.person(f.actors[1]) ? c.nm(f.actors[1]) : ''; const t = officeSay(d);
    if (!t) return `${a} takes office${c.at(f.place)}`;
    const at = !d.title && ROLE_SAY[d.office] ? c.at(f.place) : ''; // (a household office is of a hall)
    return g ? c.pick(f, [`${g} appoints ${a} ${t}${at}`, `${a} is named ${t}${at}`]) : c.pick(f, [`${a} is named ${t}${at}`, `${a} appointed ${t}${at}`]);
  },
  office_stripped: (f, s, c) => {
    const d = f.data || {}; const a = c.subj(f); const g = (f.actors || [])[1] && c.known.person(f.actors[1]) ? c.nm(f.actors[1]) : ''; const t = officeSay(d) || 'his office';
    return g ? c.pick(f, [`${g} strips ${a} of ${t}`, `${a} loses ${t}`, `${a} is dismissed as ${t}`]) : c.pick(f, [`${a} loses ${t}`, `${a} is dismissed as ${t}`]);
  },
  holding_granted: (f, s, c) => {
    const d = f.data || {}; const g = (f.actors || []).find((id) => c.known.person(id)) ? c.nm(f.actors.find((id) => c.known.person(id))) : ''; const T = c.pl(d.holding || f.place) || 'a holding';
    const to = (f.actors || []).find((id) => c.known.person(id) && c.known.person(id).house === d.to) || null; const toName = to ? c.nm(to) : c.known.house(d.to) ? c.hs(d.to) : '';
    return g && toName && g !== toName ? c.pick(f, [`${g} grants ${T} to ${toName}`, `${toName} is given ${T}`]) : `${toName || g || 'A lord'} is given ${T}`;
  },
  attainder: (f, s, c) => { const a = c.subj(f); return c.pick(f, [`${a} declared a traitor`, `${a} is stripped of lands and title`]); },
  house_ended: (f, s, c) => { const h = (f.houses || []).find((x) => c.known.house(x)); const hs = h ? c.hs(h) : 'a great house'; return c.pick(f, [`The line of ${hs} ends${c.at(f.place)}`, `${cap1(hs)} ends with its last heir`]); },

  // ── People ──
  death: (f, s, c) => {
    const d = f.data || {}; const a = c.nm(f.actors?.[0]) || c.subj(f); const of = deathOf(d);
    return `${a} dies${of ? ` of ${of}` : ''}${c.at(f.place)}`;
  },
  birth: (f, s, c) => { const a = c.subj(f); const h = c.known.person(f.actors?.[0])?.house; return c.pick(f, [`${a} is born${c.at(f.place)}`, h ? `${cap1(c.hs(h))} welcomes ${a}` : `${a} is born`]); },
  betrothal: (f, s, c) => {
    const [a, b] = pair(c, f);
    return b ? c.pick(f, [`${a} betrothed to ${b}`, `${a} is promised to ${b}`, `${a} and ${b} agree to marry`]) : `${a} is betrothed${c.at(f.place)}`;
  },
  wedding: (f, s, c) => {
    const [a, b] = pair(c, f);
    return b ? c.pick(f, [`${a} weds ${b}${c.at(f.place)}`, `${a} marries ${b}${c.at(f.place)}`, `${a} and ${b} wed${c.at(f.place)}`]) : `${a} weds${c.at(f.place)}`;
  },
  captured: (f, s, c) => {
    const p = c.nm(f.actors?.[0]) || c.subj(f); const by = agentName(c, slot(f, 'data.by')); const at = c.at(f.place);
    return by ? c.pick(f, [`${p} captured by ${by}${at}`, `${p} taken by ${by}${at}`, `${by} seizes ${p}${at}`]) : c.pick(f, [`${p} captured${at}`, `${p} taken captive${at}`]);
  },
  released: (f, s, c) => {
    const p = c.nm(f.actors?.[0]) || c.subj(f); const by = agentName(c, slot(f, 'data.by'));
    return by ? c.pick(f, [`${p} freed by ${by}`, `${by} releases ${p}`, `${p} is freed${c.at(f.place)}`]) : c.pick(f, [`${p} is freed${c.at(f.place)}`, `${p} walks free${c.at(f.place)}`.replace('walks', 'is set')]);
  },
  ransomed: (f, s, c) => { const p = c.nm(f.actors?.[0]) || c.subj(f); return c.pick(f, [`${p} is ransomed${c.at(f.place)}`, `Ransom frees ${p}`]); },
  executed: (f, s, c) => {
    const d = f.data || {}; const p = c.nm(f.actors?.[0]) || c.subj(f); const by = agentName(c, slot(f, 'data.by')); const at = c.at(f.place);
    const how = d.how === 'beheaded' ? ['beheads', 'beheaded'] : d.how === 'hanged' ? ['hangs', 'hanged'] : null;
    if (!by) return c.pick(f, how ? [`${p} ${how[1]}${at}`, `${p} executed${at}`] : [`${p} executed${at}`, `${p} put to death${at}`]);
    if (how) return c.pick(f, [`${by} ${how[0]} ${p}${at}`, `${p} ${how[1]} by ${by}${at}`, `${by} executes ${p}${at}`]);
    return c.pick(f, [`${p} executed by ${by}${at}`, `${by} executes ${p}${at}`, `${by} puts ${p} to death${at}`]);
  },
  sent_to_wall: (f, s, c) => { const a = c.subj(f); return c.pick(f, [`${a} is sent to the Wall`, `${a} sent to take the black`]); },
  hostage_taken: (f, s, c) => { const a = c.nm(f.actors?.[0]) || c.subj(f); const by = agentName(c, slot(f, 'data.by')); return by ? c.pick(f, [`${a} taken hostage by ${by}`, `${by} takes ${a} as a hostage`]) : `${a} taken hostage${c.at(f.place)}`; },
  ward_fostered: (f, s, c) => {
    const a = c.nm(f.actors?.[0]) || c.subj(f); const by = slot(f, 'data.by'); const to = by && c.known.house(by) ? c.hs(by) : '';
    return to ? c.pick(f, [`${to} takes ${a} as a ward`, `${a} fostered${c.at(f.place)}`]) : `${a} fostered${c.at(f.place)}`;
  },
  wounded: (f, s, c) => { const a = c.subj(f); return c.pick(f, [`${a} wounded${c.at(f.place)}`, `${a} is hurt${c.at(f.place)}`]); },
  illness: (f, s, c) => { const a = c.subj(f); return c.pick(f, [`${a} falls ill${c.at(f.place)}`, `${a} sickens${c.at(f.place)}`]); },
  recovered: (f, s, c) => { const a = c.subj(f); return c.pick(f, [`${a} recovers${c.at(f.place)}`, `${a} rises from ${c.his(f.actors?.[0])} sickbed`]); },
  came_of_age: (f, s, c) => { const a = c.subj(f); const p = c.known.person(f.actors?.[0]); return `${a} reaches ${p?.sex === 'f' ? 'womanhood' : 'manhood'}${c.at(f.place)}`; },
  succession: (f, s, c) => {
    const a = c.subj(f); const h = (f.houses || []).find((x) => c.known.house(x)); const T = c.pl(f.place);
    return T ? c.pick(f, [`${a} takes ${T}`, `${a} inherits ${T}`, h ? `${cap1(c.hs(h))} passes to ${a}` : `${a} takes ${T}`]) : `${a} takes up the lordship${h ? ` of ${c.hs(h)}` : ''}`;
  },
  regency_begun: (f, s, c) => {
    const r = c.nm(f.actors?.[0]) || c.subj(f); const w = f.actors?.[1] && c.known.person(f.actors[1]) ? c.nm(f.actors[1]) : '';
    return w ? c.pick(f, [`${r} takes the regency for ${w}`, `${r} guards ${possessive(w)} seat`]) : `${r} takes the regency`;
  },
  regency_ended: (f, s, c) => {
    const r = c.nm(f.actors?.[0]) || c.subj(f); const w = f.actors?.[1] && c.known.person(f.actors[1]) ? c.nm(f.actors[1]) : '';
    return w ? c.pick(f, [`${r} gives up the regency`, `${w} takes up ${c.his(f.actors[1])} rule`]) : `${r} gives up the regency`;
  },
  fled: (f, s, c) => { const a = c.subj(f); return c.pick(f, [`${a} flees${c.at(f.place)}`, `${a} escapes${c.at(f.place)}`]); },
  vanished: (f, s, c) => { const a = c.subj(f); return c.pick(f, [`${a} vanishes${c.at(f.place)}`, `${a} disappears without a word`]); },

  // ── Word ──
  letter_sent: (f, s, c) => { const [a, b] = mail(c, f, false); return b ? c.pick(f, [`${a} writes to ${b}`, `${a} sends a raven to ${b}`, `${a} sends word to ${b}`]) : `${a} sends a raven${c.at(f.place)}`; },
  letter_arrived: (f, s, c) => {
    const [a, b] = mail(c, f, true); const at = c.at(f.place);
    return b ? c.pick(f, [`${a} writes to ${b}${at}`, `A raven from ${a} reaches ${b}${at}`, `${a} sends word to ${b}${at}`]) : `A raven from ${a} arrives${at}`;
  },
  letter_intercepted: (f, s, c) => {
    const d = f.data || {}; const a = c.subj(f); const from = c.nm(d.from); const to = c.nm(d.to);
    return from && to ? `${a} intercepts a raven from ${from} to ${to}` : from ? `${a} intercepts a raven from ${from}` : `${a} intercepts a raven${c.at(f.place)}`;
  },
  envoy_arrived: (f, s, c) => { const a = c.subj(f); const p = c.pl(f.place); return c.pick(f, [`${a} arrives as an envoy${c.at(f.place)}`, p ? `${a} rides into ${p} as an envoy` : `${a} rides in as an envoy`]); },
  audience_held: (f, s, c) => {
    const d = f.data || {}; const a = c.subj(f); const b = (f.actors || [])[1] && c.known.person(f.actors[1]) ? c.nm(f.actors[1]) : '';
    if (d.council || !b) return `${a} holds council${c.at(f.place)}`;
    return c.pick(f, [`${a} receives ${b}${c.at(f.place)}`, `${a} and ${b} meet${c.at(f.place)}`]);
  },
  gift: (f, s, c) => { const [a, b] = pair(c, f); return b ? c.pick(f, [`${a} sends a gift to ${b}`, `${a} gives ${b} a gift`]) : `${a} sends a gift`; },
  loan_taken: (f, s, c) => { const a = c.subj(f); const l = c.known.house(f.data?.lender) ? c.folk(f.data.lender) : ''; return l ? c.pick(f, [`${a} borrows from ${l}`, `${cap1(l)} lends to ${a}`.replace(/^The /, 'the ').replace(/^the /, 'The ')]) : `${a} borrows gold`; },
  loan_repaid: (f, s, c) => { const a = c.subj(f); const l = c.known.house(f.data?.lender) ? c.folk(f.data.lender) : ''; return l ? c.pick(f, [`${a} repays ${l}`, `${a} pays back ${l}`]) : `${a} repays a loan`; },
  debt_called: (f, s, c) => { const a = c.subj(f); const l = c.known.house(f.data?.lender) ? c.folk(f.data.lender) : ''; return l ? c.pick(f, [`${cap1(l)} calls in ${c.hpos(c.owner(f)) ? `${a}'s` : 'a'} debt`.replace(/^The /, 'The '), `${cap1(l)} demands payment from ${a}`]) : `${a} is dunned for a debt`.replace('dunned', 'pressed'); },
  loan_defaulted: (f, s, c) => { const a = c.subj(f); const l = c.known.house(f.data?.lender) ? c.folk(f.data.lender) : ''; return l ? c.pick(f, [`${a} defaults on ${l}'s loan`.replace("the Braavos's", "Braavos'"), `${a} fails to repay ${l}`]) : `${a} defaults on a loan`; },
  grain_bought: (f, s, c) => { const a = c.subj(f); return c.pick(f, [`${a} buys grain${c.at(f.place)}`, `${a} lays in grain against want`]); },
  bribe: (f, s, c) => {
    const d = f.data || {}; const [a, b] = pair(c, f);
    return b ? c.pick(f, [`${a} bribes ${b}`, d.aim ? `${a} pays ${b} for ${d.aim}` : `${a} pays ${b} in secret`]) : `${a} bribes a man${c.at(f.place)}`;
  },
  bribe_refused: (f, s, c) => { const [a, b] = pair(c, f); return b ? c.pick(f, [`${b} refuses ${a}'s gold`, `${b} turns down ${a}'s bribe`]) : `A bribe is refused${c.at(f.place)}`; },
  ransom_demanded: (f, s, c) => { const [a, b] = pair(c, f); return b ? c.pick(f, [`${a} demands ransom for ${b}`, `${a} sets a price on ${b}`]) : `${a} demands a ransom`; },
  embargo: (f, s, c) => {
    const d = f.data || {}; const a = c.subj(f); const t = (f.houses || []).find((h) => h !== c.owner(f) && c.known.house(h)); const who1 = t ? c.hs(t) : 'a rival';
    return d.lifted ? `${a} lifts the embargo on ${who1}` : c.pick(f, [`${a} cuts off trade with ${who1}`, `${a} shuts ${c.his(f.actors?.[0])} ports to ${who1}`]);
  },
  peace_sued: (f, s, c) => {
    const d = f.data || {}; const [a, b] = pair(c, f);
    if (!b) return `${a} sues for peace`;
    return d.accepted ? `${b} accepts ${a}'s offer of peace` : c.pick(f, [`${a} sues for peace with ${b}`, `${a} offers ${b} peace`]);
  },
  cold_war: (f, s, c) => { const A = warSide(c, f, (f.houses || [])[0], 0); const B = warSide(c, f, (f.houses || [])[1], 1); return A && B ? `No blow is struck between ${A} and ${B}` : `No blow is struck in the war${A || B ? ` of ${A || B}` : ''}`; },
  commitment_made: (f, s, c) => {
    const d = f.data || {}; const a = c.subj(f); const to = (f.houses || []).find((h) => h !== c.owner(f) && c.known.house(h)); const what = d.kind === 'aid' ? 'aid' : d.kind ? `a ${d.kind}` : 'a promise';
    return to ? c.pick(f, [`${a} promises ${what} to ${c.hs(to)}`, `${a} gives ${c.hs(to)} ${c.his(f.actors?.[0])} word`]) : `${a} gives ${c.his(f.actors?.[0])} word`;
  },
  commitment_kept: (f, s, c) => { const a = c.subj(f); const to = (f.houses || []).find((h) => h !== c.owner(f) && c.known.house(h)); return to ? `${a} keeps ${c.his(f.actors?.[0])} word to ${c.hs(to)}` : `${a} keeps ${c.his(f.actors?.[0])} word`; },
  commitment_broken: (f, s, c) => {
    const a = c.subj(f); const to = (f.houses || []).find((h) => h !== c.owner(f) && c.known.house(h));
    return to ? c.pick(f, [`${a} breaks ${c.his(f.actors?.[0])} word to ${c.hs(to)}`, `${a} betrays ${c.hs(to)}`]) : `${a} breaks ${c.his(f.actors?.[0])} word`;
  },
  rumour: (f, s, c) => {
    const d = f.data || {}; const a = (f.actors || []).find((id) => c.known.person(id)); const feint = c.pl(d.feint); const army = c.known.party(d.party) ? c.pty(d.party) : '';
    if (feint) return c.pick(f, [`Word spreads that ${army || c.host(c.owner(f))} marches on ${feint}`, `Riders tell of ${army || c.host(c.owner(f))} marching on ${feint}`]);
    if (a) return c.pick(f, [`Whispers spread about ${c.nm(a)}${c.at(f.place)}`, `Men whisper of ${c.nm(a)}${c.at(f.place)}`]);
    const hs = (f.houses || []).filter((h) => c.known.house(h)); const hear = hs.find((h) => h === c.viewer) || hs[0]; const other = hs.find((h) => h !== hear);
    const of = other ? `${c.short(other)} riders` : 'armed men';
    return hear ? `Word of ${of} on the road reaches ${c.hs(hear)}` : `Word spreads of ${of} on the road`;
  },
  secret_revealed: (f, s, c) => { const [a, b] = pair(c, f); return b ? c.pick(f, [`A secret of ${a} and ${b} is uncovered`, `${a} reveals a secret of ${b}`]) : `A secret of ${a} is uncovered`; },
  scheme_discovered: (f, s, c) => {
    const d = f.data || {}; const a = c.subj(f); const noun = d.kind === 'spy' ? 'a spy' : 'a scheme';
    return c.pick(f, [`${a} uncovers ${noun}${c.at(f.place)}`, `${cap1(noun)} is uncovered${c.at(f.place)}`]);
  },

  // ── Court & realm ──
  feast: (f, s, c) => {
    const d = f.data || {}; const a = c.subj(f);
    if (d.brawl) return c.pick(f, [`A brawl breaks out at ${c.possessive(a)} feast`, `${a}'s feast ends in a brawl`]);
    return c.pick(f, [`${a} holds a feast${c.at(f.place)}`, `${a} hosts a feast${c.at(f.place)}`, `${a} gives a feast${c.at(f.place)}`]);
  },
  tourney: (f, s, c) => { const a = c.subj(f); return c.pick(f, [`${a} holds a tourney${c.at(f.place)}`, `${a} proclaims a tourney${c.at(f.place)}`, `${a} calls the lords to a tourney${c.at(f.place)}`]); },
  tourney_result: (f, s, c) => {
    const a = c.subj(f); const at = c.at(f.place);
    return c.pick(f, [`${a} wins the tourney${at}`, `${a} takes the tourney prize${at}`, `${a} claims the champion's prize${at}`]);
  },
  judgement: (f, s, c) => { const [a, b] = pair(c, f); return b ? c.pick(f, [`${a} judges ${b}${c.at(f.place)}`, `${a} passes judgement on ${b}${c.at(f.place)}`]) : `${a} sits in judgement${c.at(f.place)}`.replace('sits in judgement', 'passes judgement'); },
  order_given: (f, s, c) => { const [a] = pair(c, f); if (f.data?.refused) return `${a}'s command comes to nothing`; return c.pick(f, [`${a} gives an order${c.at(f.place)}`, `${a} gives a command${c.at(f.place)}`]); },
  petition: (f, s, c) => { const [a, b] = pair(c, f); return b ? c.pick(f, [`${a} petitions ${b}`, `${a} brings a petition to ${b}`]) : `${a} brings a petition${c.at(f.place)}`; },
  tax_changed: (f, s, c) => {
    const d = f.data || {}; const a = c.subj(f);
    if (d.dues) { const lg = c.known.house(d.liege) ? c.hs(d.liege) : 'the liege'; return d.dues === 'paying' ? `${a} pays ${lg} again` : d.dues === 'late' ? `${a} falls behind with the dues` : `${a} refuses ${lg} the dues`; }
    const order = ['none', 'light', 'low', 'normal', 'high', 'heavy', 'crushing']; const up = order.indexOf(d.tax) > order.indexOf(d.was);
    return up ? c.pick(f, [`${a} raises the taxes${c.at(f.place)}`, `${a} taxes ${c.his(f.actors?.[0])} lands harder`]) : c.pick(f, [`${a} cuts the taxes${c.at(f.place)}`, `${a} eases the tax on ${c.his(f.actors?.[0])} lands`.replace('eases the tax on', 'cuts the tax on')]);
  },
  works_begun: (f, s, c) => {
    const d = f.data || {}; const a = c.subj(f); const [, , forms] = worksOf(d);
    return `${a} ${c.pick(f, forms)}${c.at(f.place)}`;
  },
  works_done: (f, s, c) => {
    const d = f.data || {}; const P = c.pl(f.place); const a = (f.actors || []).find((id) => c.known.person(id)) ? c.nm(f.actors.find((id) => c.known.person(id))) : c.subj(f);
    if (d.founded) { const N = c.pl(d.founded); return c.pick(f, [`${a} founds ${N || `a new ${d.type || 'holding'}`}`, `${a} raises ${N || `a new ${d.type || 'holding'}`}`]); }
    const np = d.building ? lower1(String(d.building)) : worksOf(d)[1];
    return P ? c.pick(f, [`${P} raises ${np}`, `${cap1(np)} rises at ${P}`, `${P} finishes ${np}`]) : c.pick(f, [`${a} finishes ${np}`, `${a} raises ${np}`]);
  },
  // (the steward's note, said: a house gone hungry or a fortnight of its dues withheld is not "inspecting its accounts")
  ledger: (f, s, c) => {
    const h = (f.houses || []).find((x) => c.known.house(x)); const who = h ? cap1(c.hs(h)) : c.subj(f);
    const said = { hunger: `${who} goes hungry`, famine: `${who} faces famine`, grain: `${who} buys grain against the hunger`, dues: `${who} withholds its dues`, works: `${who} finishes its works` }[f.data?.note];
    if (said) return `${said}${c.at(f.place)}`;
    const event = LEDGER_EVENT[f.data?.note];
    return event ? `${event}${c.at(f.place) || ` in the lands of ${who}`}` : `${who} inspects its accounts${c.at(f.place)}`;
  },
  unrest_rising: (f, s, c) => {
    const d = f.data || {}; const P = c.pl(f.place); const h = (f.houses || []).find((x) => c.known.house(x)); const where = P || (h ? c.hs(h) : 'the realm');
    return d.outlaws ? `Outlaws gather near ${where}` : c.pick(f, [`Discontent grows at ${where}`, `The smallfolk of ${where} grow restless`]);
  },
  rising: (f, s, c) => c.pick(f, [`The smallfolk rise${c.at(f.place)}`, `The smallfolk take up arms${c.at(f.place)}`]),
  famine: (f, s, c) => {
    const P = c.pl(f.place); const h = (f.houses || []).find((x) => c.known.house(x));
    return P ? c.pick(f, [`Famine grips ${P}`, `Hunger takes hold of ${P}`]) : `Famine grips the lands of ${h ? c.hs(h) : 'the realm'}`;
  },
  plague: (f, s, c) => { const P = c.pl(f.place); const h = (f.houses || []).find((x) => c.known.house(x)); const where = P || (h ? c.hs(h) : 'the realm'); return c.pick(f, [`Sickness sweeps ${where}`, `Plague strikes ${where}`]); },
  season_turned: (f, s, c) => { const d = f.data || {}; const P = c.pl(f.place); return `The white ravens announce ${d.season ? d.season : 'a new season'}${P ? ` from ${P}` : ''}`; },
  custom_created: (f, s, c) => { const a = c.subj(f); const d = f.data || {}; return c.pick(f, [`${a} keeps a new custom${c.at(f.place)}`, `${a} founds a new custom${c.at(f.place)}`]); },
  canon_beat: (f, s, c) => beatHead(f, s, c),
  happening: (f, s, c) => happeningHead(f, s, c),
  hook: (f, s, c) => hookHead(f, s, c),
  behaviour: (f, s, c) => {
    const a = c.subj(f); const band = f.data?.band; const forms = BEHAVIOUR_HEAD[band];
    return forms ? c.pick(f, forms.map((t) => t.replace('{A}', a))) : `${a} keeps ${c.his(f.actors?.[0])} own counsel`;
  },
  weather: (f, s, c) => { const P = c.pl(f.place); const h = (f.houses || []).find((x) => c.known.house(x)); return `The weather turns hard ${P ? `at ${P}` : `for ${h ? c.hs(h) : 'the realm'}`}`; },
  legacy: (f, s, c) => { const h = (f.houses || []).find((x) => c.known.house(x)); return `${h ? cap1(c.hs(h)) : c.subj(f)} keeps an old chronicle line`; },
};

// the small readers the heads above lean on
/** An office as a headline says it: the Hand is "the crown's right hand" (the words "Hand of the King" are an office the scorer wants a holder for). */
// the household offices a house gives (engine/actions/court.js ROLES), told as what they are: "captain" is "captain of the guard", and of which hall is the card's place (TX5)
const ROLE_SAY = { steward: 'steward', maester: 'maester', master_at_arms: 'master-at-arms', captain: 'captain of the guard', spymaster: 'master of whisperers', commander: 'commander of the host', castellan: 'castellan', knight: 'sworn sword', envoy: 'envoy' };
const officeSay = (d) => { const t = String(d.title || ROLE_SAY[d.office] || (d.office ? String(d.office).replace(/_/g, ' ') : '')).trim(); return /^(?:the )?hand(?: of the king)?$/i.test(t) ? "the crown's right hand" : t; };
/** A person's cause of death in "dies of ...": by how it happened, else by a short cause the fact gives. */
function deathOf(d) {
  const how = { age: 'old age', fever: 'a fever', wound: 'a wound', winter: 'the winter cold', illness: 'a long illness' }[d.how];
  if (how) return how;
  const cause = String(d.cause || '').trim().toLowerCase();
  return /^(?:an? |the )?(?:old age|[a-z]+ (?:fever|chill|illness|wound|sickness)|fever|illness|sickness)$/.test(cause) ? cause : '';
}
/** Two people of a fact, first and second, as names; the second empty when the fact has one. */
function pair(c, f) {
  const ids = (f.actors || []).filter((id) => c.known.person(id));
  const a = ids[0] ? c.nm(ids[0]) : c.subj(f); const b = ids[1] ? c.nm(ids[1]) : '';
  return [a, b];
}
/** Sender and receiver of a letter: `data.from`/`data.to` if they are people or houses, else the two actors. */
function mail(c, f, arrived) {
  const d = f.data || {}; const name = (id) => (c.known.person(id) ? c.nm(id) : c.known.house(id) ? c.hs(id) : '');
  const ids = (f.actors || []).filter((id) => c.known.person(id));
  const from = name(d.from) || (ids[0] ? c.nm(ids[0]) : '') || c.subj(f);
  const to = name(d.to) || (ids.find((id) => id !== d.from && c.nm(id) !== from) ? c.nm(ids.find((id) => id !== d.from && c.nm(id) !== from)) : '');
  return [from, to && to !== from ? to : ''];
}
/** A side of a war or a peace: the lord (the actor of that house) or the house. */
function warSide(c, f, houseId, i) {
  if (houseId && c.known.house(houseId)) {
    const a = (f.actors || []).find((id) => c.known.person(id) && c.known.person(id).house === houseId);
    return a ? c.nm(a) : c.hs(houseId);
  }
  const ids = (f.actors || []).filter((id) => c.known.person(id)); return ids[i] ? c.nm(ids[i]) : '';
}
/** A party to a pact: the actors in order, else the houses. */
function pactSide(c, f, i) {
  const ids = (f.actors || []).filter((id) => c.known.person(id)); if (ids[i]) return c.nm(ids[i]);
  const hs = (f.houses || []).filter((h) => c.known.house(h)); return hs[i] ? c.hs(hs[i]) : '';
}
/** The liege a lord swears to: the second actor if there is one, else the liege house. */
function liegeName(c, f, liege) {
  const lord = (f.actors || []).filter((id) => c.known.person(id)).find((id) => c.known.person(id).house === liege);
  return lord ? c.nm(lord) : c.known.house(liege) ? c.hs(liege) : '';
}

// ── The small life of the realm: happenings and hooks are told by the template they came from ────────────────────────
// A happening or a hook fact carries the id of its template and nothing of its words (the words were made from the dice);
// what the template was about is the writer's own knowledge, so each is told in a line of its own, and a template the
// table does not know is told by its kind of news. `{P}` is the place, `{hs}` the house, `{A}` who it is about.
export const TPL = {
  harvest_good: [['A full harvest fills the barns at {P}', 'The fields ripen heavy round {P}'], 'The granaries are filling and the smallfolk have meat on feast days.'],
  m_good_harvest: [['A rich harvest fills the barns at {P}', 'The fields ripen heavy round {P}'], "The steward writes that the tithe barns are full."],
  harvest_bad: [['Blight takes the crops at {P}', 'The harvest fails at {P}'], 'Rot or hail has cost the smallfolk a good part of the harvest.'],
  m_blight: [['Blight strikes the fields near {P}', 'The harvest fails near {P}'], 'A third of the harvest may be lost, and the rents may have to be eased.'],
  n_godswood: [['Northmen whisper of the godswood at {P}'], 'Some call it an omen; others call it an outrage.'],
  n_snow_summer: [['A summer snow blankets {P}', 'Snow falls on {P} in summer'], 'It melted by noon, but the old people say winter is coming.'],
  g_ravens_dead: [['Smallfolk at {P} read a bad omen'], 'They say the gods are warning the lords of something.'],
  g_weather_fog: [['Fog covers the roads near {P}'], 'Travellers lose their way until it lifts.'],
  g_pilgrims: [['Pilgrims pass through {P}'], 'They are bound for a holy place, and the innkeepers are pleased.'],
  m_smallfolk_love: [['The smallfolk of {P} sing of their liege'], "The liege's name is well loved in the market."],
  m_smallfolk_hate: [['Smallfolk jeer their liege at {P}'], 'No one stops them.'],
  m_poachers: [["Poachers are taken in the liege's woods near {P}"], 'The villagers say the men were starving.'],
  m_bannerman_grumble: [['Knights speak against their liege at {P}'], 'They complain of taxes and of favour.'],
  m_bandits_yours: [['Outlaws take to the roads near {P}'], 'Merchants are robbed, and the castellan asks for riders.'],
  m_war_widows: [['Widows wait at the gate of {P}'], 'They wait for men who marched with the host.'],
  m_winter_stores: [['The steward inspects the winter stores at {P}'], 'They may last, if the winter is short.'],
  land_dispute: [['Two houses fight over a boundary near {P}'], 'Blood has been shed, and both lords have written to their liege.'],
  smallfolk_protest: [['Smallfolk gather at the gates of {P}'], 'They shout about bread and taxes.'],
  war_burned: [['Foragers burn villages near {P}'], 'The barns are emptied and the wells fouled.'],
  w_wildlings_seen: [['Rangers tell of wildling camps near {P}'], 'There are many more than last year.'],
  w_dead: [['A ranger returns raving to {P}'], 'He will not be calmed.'],
  b_mance: [['{hs} gather in the mountains'], 'Never before has anyone united them.'],
  i_reaving: [['Longships out of {P} raid the coast'], 'The old way lives, whatever was sworn after the rebellion.'],
  rv_blackwood_bracken: [['{hs} fights its old rivals'], 'The feud is a thousand years old.'],
  v_clansmen: [['Clansmen raid the high road near {P}'], 'They take caravans and horses and vanish into the hills.'],
  rc_marches: [['Marcher lords fight raiders near {P}'], 'The old hatreds of the Marches flare again.'],
  d_marches: [['Dornish outriders raid the passes near {P}'], 'The Marchers followed, and the cattle came back.'],
  e_dothraki: [['{hs} rides near {P}'], 'Its riders burn villages and take slaves.'],
};
const HAP_TYPE = {
  court: [['{hs} holds court at {P}'], 'Small matters of the household are the talk of the place.'],
  economy: [['Merchants barter at {P}'], 'Prices and tolls are the talk of the market.'],
  war: [['Trouble follows the war to {P}'], 'Raiders, deserters and hungry men are on the roads.'],
  religion: [['Pilgrims and septons pray at {P}'], 'The Faith has small news of its own there.'],
  rumor: [['Rumour spreads at {P}'], 'It is only talk.'],
  disaster: [['Disaster strikes {P}'], 'The smallfolk bear the loss.'],
  magic: [['Strange word reaches {P}'], 'Nothing is proved.'],
  intrigue: [['Whispers of intrigue spread at {P}'], 'Servants talk of secret matters.'],
  diplomacy: [['Word of a match spreads at {P}'], 'Ravens go back and forth between the houses.'],
};
const HAP_BY_ID = new Map(HAPPENINGS.map((h) => [h.id, h]));
const HOOK = {
  hedge_knight_service: [['A hedge knight begs a place at {P}', '{A} is petitioned by a hedge knight'], 'He rides a borrowed horse and carries a notched shield.'],
  sellsword_offer: [['A sellsword company offers its swords near {P}'], 'It has crossed from the Free Cities and will serve whoever pays.'],
  squire_seeks_knighthood: [['A squire begs {A} for his knighthood'], 'He fought well in a skirmish on the marches.'],
  knight_disgraced: [['A knight is disgraced at {P}'], 'The villagers demand justice.'],
  tourney_called: [['{A} calls a tourney at {P}', '{A} proclaims a tourney at {P}'], 'Heralds have gone out with a purse for the champion.'],
  melee_quarrel: [['Knights quarrel after the melee at {P}'], 'Two houses cry foul, and one man lies abed with a broken arm.'],
  septon_preaches: [['A septon speaks against {A} at {P}'], 'He says the Seven will punish the land for a godless lord.'],
  sept_burned: [['A sept burns at {P}'], 'It burned in the night; some say a candle, some a grudge.'],
  weirwood_cut: [['Woodsmen fell a heart tree near {P}'], 'The northmen of the old gods call it an outrage.'],
  pilgrims_throng: [['Pilgrims fill the roads to {P}'], 'A holy man is said to heal the sick there.'],
  red_priest: [['A red priest speaks at {P}'], 'He preaches of a war between light and dark, and the septons want him gone.'],
  silent_sisters: [['The silent sisters reach {P}'], 'They have come to take the dead of a fever house for burial.'],
  mill_dispute: [['{hs} quarrels over a mill near {P}'], 'Its men have come to blows.'],
  boundary_stone: [['A boundary stone is moved near {P}'], 'It was done in the night, and a whole field changed hands by morning.'],
  cattle_raid: [['Raiders steal cattle near {P}'], 'They came by night, and the tracks lead towards a rival.'],
  hostage_insult: [['A feast at {P} ends in drawn blades'], 'A son of a rival mocked the lord before the maester stepped in.'],
  reconciliation_feast: [['{hs} feasts with an old rival at {P}'], 'Old debts are forgiven and the best wine of the cellar is broached.'],
  vassal_grievance: [['A sworn knight speaks out against {A}'], 'He says the lord favours others at court.'],
  citadel_letter: [['A letter from the Citadel reaches {P}'], 'The archmaesters write that a white raven may come early this year.'],
  maester_dies: [['The maester of {P} sickens'], 'The old maester is failing, and another has been sent for from Oldtown.'],
  comet_rumour: [['Smallfolk swear they saw lights over {P}'], 'The maester says it is only the season.'],
  old_map: [['A maester finds an old map at {P}'], 'It is older than the Conquest, drawn on dragonhide.'],
  outlaws_road: [['Outlaws take the road near {P}'], 'They rob merchants and have burned a waycastle stable.'],
  broken_men: [['Broken men haunt the woods near {P}'], 'They are deserters from the hosts, and the villages bar their doors at night.'],
  bridge_down: [['Spring floods take the bridge near {P}'], 'Carts wait a day at the ford, and tolls are lost.'],
  ransom_note: [['Outlaws seize a merchant near {P}'], 'They ask a ransom in gold from his town.'],
  galley_wrecked: [['A merchant galley is wrecked off {P}'], 'She was laden with goods, and the smallfolk are carrying off what the sea gives up.'],
  trade_fleet: [['A trading fleet puts in at {P}'], 'Its cogs have come to buy goods, and prices are up.'],
  pirates_sighted: [['Pirates are sighted off {P}'], 'The sails carry no banner, and the fishing fleet stays in harbour.'],
  reavers_land: [['Ironborn reavers land near {P}'], 'They burned a fishing village and carried off women and every scrap of iron.'],
  guild_complaint: [['The guilds of {P} denounce the tolls'], 'They say the lord drives trade to other ports.'],
  good_harvest: [['A fine harvest fills the barns at {P}'], 'The granaries are full and the smallfolk dance at the harvest feast.'],
  fever_town: [['Fever grips {P}'], 'The gates are closed and the dead are carted out each dawn.'],
  great_storm: [['A great storm strikes {P}'], 'It tore the roofs from the town and sank half the fishing boats.'],
  early_frost: [['An early frost strikes {P}'], 'The late crops are blackened, and the smallfolk are salting what meat they have.'],
  mine_collapse: [['Miners are buried near {P}'], 'A gallery fell in, and the ore has stopped.'],
  fire_granary: [['Fire takes the granary at {P}'], 'It was taken in the night, and a moon of grain is gone.'],
  daughter_elopes: [['A daughter of {hs} elopes'], 'She has run off with a singer, and her father begs the lord to bring her back.'],
  bastard_claims: [['A young man claims kinship with {hs}'], 'He has a ring and a mother who swears to it.'],
  wedding_invitation: [['{hs} invites the realm to a wedding'], 'Ravens bid the lords of the region to a wedding before the season turns.'],
  ward_homesick: [['A ward at {P} writes home'], 'He says the lord treats him coldly.'],
  heir_fever: [['The heir of {hs} sickens'], 'The maester sits up with the child each night.'],
  match_offered: [['{hs} is offered a match'], 'The ravens have gone back and forth all moon.'],
  wildling_raid: [['Wildlings raid near {P}'], 'They came over the ice or through the Gift and burned a steading.'],
  ranger_word: [['A ranger of the Watch brings word of empty villages to {P}'], 'He speaks of wildlings moving south in numbers.'],
  watch_recruiter: [['A black brother recruits at {P}'], "He has come to take men for the Wall from the lord's dungeons."],
  deserter_caught: [['A deserter of the Watch is taken near {P}'], 'He fled the Wall, and the law is death.'],
  kingsmoot_whispers: [['Captains whisper of reaving at {P}'], 'They say the old way is dying under the green-land peace.'],
  drowned_priest: [['A drowned priest speaks at {P}'], 'He calls the captains back to the old way.'],
  poison_rumour: [['Rumour of poison spreads at {P}'], 'A servant was seen buying sweetsleep in the market, and the kitchens are watched.'],
  spy_caught: [['A spy is uncovered at {P}'], 'He carried letters in cipher, and under question he named men of a rival.'],
  steward_embezzles: [['A steward is found skimming the rents near {P}'], 'The maester found it in the books.'],
  forged_letter: [['A forged letter is exposed at {P}'], "It bore the lord's seal and demanded grain of the villages; someone is stealing in his name."],
  singer_mocks: [['A singer mocks {A}'], 'The smallfolk love the song, and the household hates it.'],
  prisoner_escapes: [['A prisoner escapes from {P}'], "He broke out with a guard's keys, and the hounds lost the scent at the river."],
  debt_called: [['A banker calls in a debt at {P}'], 'He has come to remind the lord of an old loan, courteously.'],
  silver_found: [['Miners strike silver near {P}'], 'Men are coming from three valleys to dig.'],
  coin_clipped: [['Clipped coin passes in the markets of {P}'], 'The merchants weigh every coin.'],
  dowry_dispute: [['{hs} quarrels over a dowry'], 'One side says it was never paid in full; the other says it was paid twice.'],
  smallfolk_petition: [['Smallfolk petition {A} at {P}'], 'They ask for justice, or for bread.'],
  rebel_hedge: [['A hedge knight raises a rabble near {P}'], 'He speaks against the lord and finds men to listen.'],
  village_feud: [['Two villages quarrel near {P}'], 'It is an old quarrel over water and grazing.'],
  wolf_packs: [['Wolves grow bold near {P}'], 'A pack has followed a party to the gates.'],
  fair_announced: [['A fair is announced at {P}'], 'Merchants are bidden from far and near.'],
  essos_war_rumour: [['Word of war across the sea reaches {P}'], 'Merchants and sailors tell it differently.'],
  dothraki_rumour: [['Word of a khalasar reaches {P}'], 'Sailors say it burns whatever lies in its way.'],
  spice_ship: [['A spice ship puts in at {P}'], 'Prices in the market are up.'],
  camp_fever: [['Fever runs through a camp near {P}'], 'The men are sick and the maesters are few.'],
  foragers_burn: [['Foragers burn barns near {P}'], 'The smallfolk are left with nothing for the winter.'],
  refugees: [['Refugees fill the roads to {P}'], 'They are smallfolk driven from their homes by the war.'],
  smith_orders: [['The smiths of {P} take heavy orders'], 'Every forge is working for the war.'],
  truce_feast: [['{hs} feasts with its foes at {P}'], 'It is a truce, for a night.'],
  winter_stores: [['The steward inspects the winter stores at {P}'], 'They may last, if the winter is short.'],
  long_summer_drought: [['Drought withers the fields near {P}'], 'The wells are low and the smallfolk pray for rain.'],
  harvest_festival: [['{hs} celebrates the harvest at {P}'], 'The smallfolk feast and dance.'],
  lord_hunt: [['{A} hunts near {P}'], 'The household rides out with hounds.'],
  new_castellan: [['{A} appoints a new castellan at {P}'], 'The old one has gone, and the garrison watches the new man.'],
  knights_quarrel_court: [['Knights quarrel at the court of {P}'], 'The household takes sides.'],
  gift_horse: [['{A} sends a gift of horses'], 'It is meant to win a friend.'],
  old_lord_last_wish: [['An old lord sets his house in order at {P}'], 'He is failing, and he knows it.'],
  young_lord_regent: [['A young lord grows into his rule at {P}'], 'His regent is watched by the bannermen.'],
};
const fillTpl = (t, f, c) => {
  const P = c.pl(f.place); const h = (f.houses || []).find((x) => c.known.house(x)); const hs = h ? c.hs(h) : ''; const A = c.subj(f);
  const out = t.replace(/\{P\}/g, P || hs || 'the realm').replace(/\{hs\}/g, hs || 'a great house').replace(/\{A\}/g, A);
  return cap1(out);
};
/** A wife's confinement, told by its slot (`data.family`): the news of a house's own hearth, which is not talk. */
const FAMILY_HEAD = {
  expecting: (f, c) => { const w = c.nm(f.actors?.[0]) || c.subj(f); const m = c.nm(f.actors?.[1]); return c.pick(f, m ? [`${w} is with child`, `${w} carries ${c.possessive(m)} child`] : [`${w} is with child`, `${w} is expecting a child`]); },
  stillborn: (f, c) => { const w = c.nm(f.actors?.[0]) || c.subj(f); return c.pick(f, [`${w} loses her child`, `${w} is brought to bed of a dead child`]); },
};
const FAMILY_SUM = {
  expecting: (f) => { const n = Math.max(1, Math.round(((f.data?.due ?? f.day) - f.day) / 30)); return sentences(n <= 1 ? 'The child is looked for within the moon' : `The child is looked for in about ${say(n)} moons`); },
  stillborn: () => sentences('The child was born dead, and the household keeps its grief'),
};
/** How a man's strain shows, by its band (data.band): what the household sees, never a number. */
const BEHAVIOUR_HEAD = {
  weary: ['{A} looks worn', '{A} sleeps badly'],
  strained: ['{A} grows short with the household', '{A} loses patience with the servants'],
  fraying: ['{A} snaps at all who come near', '{A} frays under the strain'],
  breaking: ['{A} is spoken of in low voices', '{A} comes close to breaking'],
};
const BEHAVIOUR_SUM = {
  weary: 'It is a long time since a night of proper rest',
  strained: 'The servants step carefully about the table',
  fraying: 'The household has learned not to bring news at all',
  breaking: 'The shaking hands, the wine at breakfast and the long silences are marked by all',
};
/** The small events of a house's lands, by the steward's note (data.note): the head, and a line that adds no claim the engine does not make. */
const LEDGER_EVENT = { sickness: 'Sickness spreads among the smallfolk', outlaws: 'Outlaws gather on the roads', blight: 'Blight takes the fields', fire: 'Fire takes the granary', shoals: 'Fat shoals fill the nets', fair: 'A great fair draws merchants', vein: 'A new vein is found in the mines', storm: 'A storm wrecks the fishing boats', harvest: 'A bumper harvest is brought in' };
const LEDGER_SUM = { sickness: 'It is the poor who suffer it', outlaws: 'Travellers go armed, or do not go', blight: 'The harvest will be thin', fire: 'The stores are short for it', shoals: 'The boats come home heavy', fair: 'The town is full, and the lord\'s tolls with it', vein: 'The miners say it is rich', storm: 'The fleet will be a season mending', harvest: 'The barns are full' };
/** The harvest the realm's gossip tells of a place (data.harvest): there was no head for it, and it was "Rumour spreads at X". */
const HARVEST_HEAD = { good: ['The harvest fills the granaries at {P}', 'A fine harvest is brought in at {P}'], blight: ['Blight takes the wheat at {P}', 'Blight strikes the fields near {P}'] };
const HARVEST_SUM = { good: "The lord's granaries are full to the rafters", blight: 'The smallfolk are eating their seed corn' };
function happeningHead(f, s, c) {
  const own = String(f.data?.head || '').trim(); if (own) return own; // a day of the realm's calendar names itself
  if (HARVEST_HEAD[f.data?.harvest]) return fillTpl(c.pick(f, HARVEST_HEAD[f.data.harvest]), f, c);
  if (FAMILY_HEAD[f.data?.family]) return FAMILY_HEAD[f.data.family](f, c);
  const id = f.data?.tpl; const [heads] = TPL[id] || HAP_HEADS[id] || HAP_TYPE[HAP_BY_ID.get(id)?.type] || HAP_TYPE.rumor;
  const t = c.pick(f, heads); return fillTpl(t, f, c);
}
function hookHead(f, s, c) {
  const id = f.data?.hook; const e = HOOK[id]; const t = e ? c.pick(f, e[0]) : '{A} deals with a small matter at {P}';
  return fillTpl(t, f, c);
}
/**
 * What a great matter says of itself (ST1): the headline its beat gave it, in the fact's slot `data.head` ("Bran Stark is found broken
 * beneath the old tower"); '' for a fact made before beats had one (it is told by the old line). Like every other slot it is read from
 * `data`, never from the fact's title or text, which the writer does not read.
 */
const beatTitle = (f) => String(f.data?.head || '').trim();
const TALE_SKIP = new Set('a an the of at to in on by for with from and or but as is are was were be been his her their its this that it he she they them him who which near into onto after before over under out up down'.split(' '));
const bareWords = (t) => (String(t).toLowerCase().match(/[a-z][a-z'’-]*/g) || []).map((w) => w.replace(/['’]s?$/, '')).filter((w) => w && !TALE_SKIP.has(w));
/**
 * A great matter's subtitle, from its own telling (the slot `data.tale`, the beat's text, or the `data.sum` it gave): its sentences that do
 * not say the headline again (the telling usually has the deed in it, and the card must not say it twice), at most two and 320 characters.
 */
function beatTale(f) {
  const own = String(f.data?.sum || '').trim();
  const parts = (own || String(f.data?.tale || '')).trim().split(/(?<=[.!?…]["”’]?)\s+/).filter(Boolean);
  if (!parts.length) return '';
  const H = new Set(bareWords(beatTitle(f)));
  const again = (p) => H.size > 0 && bareWords(p).filter((w) => H.has(w)).length / H.size >= 0.5;
  let rest = own ? parts : parts.filter((p) => !again(p));
  if (!rest.length) rest = parts.length > 1 ? parts.slice(1) : parts;
  const out = [];
  for (const p of rest) { if (out.length >= 2 || [...out, p].join(' ').length > 320) break; out.push(p); }
  const t = (out.length ? out.join(' ') : rest[0].slice(0, 300).replace(/[,;—\s][^,;—]*$/, '')).trim();
  return /[.!?]["”’]?$/.test(t) ? t : `${t}.`;
}
/** The great matters of the story (shared/plots.js): the King's ride is told by its own stage; any other in the words it was written with. */
function beatHead(f, s, c) {
  const d = f.data || {}; const a = c.subj(f);
  if (f.thread === 'kings_ride') {
    const K = kingOf(c, f);
    const P = c.pl(f.place);
    if (d.stage === 'progress') return P ? c.pick(f, [`${K} rides on from ${P}`, `${K} passes ${P} on his progress`]) : `${K} rides on with the court`;
    if (d.stage === 'arrival' && c.pl(f.place)) return c.pick(f, [`${K} reaches ${c.pl(f.place)}`, `${K} arrives at ${c.pl(f.place)}`]);
  }
  const own = beatTitle(f); if (own) return own;
  const p = c.pl(f.place);
  return (f.actors || []).some((id) => c.known.person(id)) ? `Grave news reaches ${a}${c.at(f.place)}` : `Grave news reaches ${p || a}`;
}
function kingOf(c, f) {
  const h = (f.houses || []).find((x) => c.known.house(x)?.rank === 'crown'); const lord = h && c.known.house(h).lord;
  if (h) c.mark(h);
  return lord && c.known.person(lord) ? c.nm(lord) : c.subj(f);
}

// ── The summaries ────────────────────────────────────────────────────────────────────────────────────────────────────
// One or two plain sentences that add what the headline cannot: why, how, who else. A slot that is missing leaves its
// sentence out; nothing is padded. No number is written but the small ones (a count of ships, a few days): a scale in
// words stands for the rest, and the figures are in the details.
/** The pronouns of a fact's first person, or "it" for a house or a host. */
function pro(c, f) {
  const id = (f.actors || []).find((x) => c.known.person(x));
  return id ? { id, He: c.he(id, true), he: c.he(id), His: c.his(id, true), his: c.his(id), him: c.him(id), self: c.he(id) === 'she' ? 'herself' : 'himself' } : { id: null, He: 'It', he: 'it', His: 'Its', his: 'its', him: 'it', self: 'itself' };
}
/** A sum of gold in words that need no number behind them. */
const gold = (n) => (n < 100 ? 'a few dozen' : n < 1000 ? 'hundreds of' : n < 10000 ? 'thousands of' : n < 100000 ? 'tens of thousands of' : 'hundreds of thousands of');
/** How the losses of two sides compare, in words: "far more", "many more", "about as many", "fewer" (the second's, against the first's). */
/** What each side lost, as a comparison: "The Tullys lose far more men than the Lannisters", "The Tullys and the Lannisters lose about as many men". */
function lossLine(W, L, won, lost) {
  const r = lost / Math.max(1, won); const loses = L === 'the vanquished' ? 'lose' : 'loses';
  if (r >= 0.67 && r < 1.5) return `${cap1(L)} and ${W} lose about as many men`;
  return `${cap1(L)} ${loses} ${r >= 3 ? 'far more' : r >= 1.5 ? 'many more' : 'fewer'} men than ${W}`;
}
/**
 * A running fight, told as one (cluster.js `RUN_GAP`): the same two hosts in battle on the next day and the next. `g` is its battles, earliest first.
 * Won every time by one side it is "X wears down Y"; won by both in turn it is "X and Y fight on".
 */
export const RUN = {
  head(g, s, c) {
    const last = g[g.length - 1]; const v = sides(c, last); const near = c.near(last.place); const steady = g.every((f) => sideWon(f) === sideWon(last));
    if (!steady || v.drawn || !v.win || !v.lose) { const a = v.win || c.subj(last); const b = v.lose; return b ? c.pick(last, [`${a} and ${b} fight on${near}`, `${a} and ${b} fight a running battle${near}`]) : `A running fight${near}`; }
    return last.data?.wiped
      ? c.pick(last, [`${v.win} destroys ${v.lose}${near}`, `${v.win} hunts down ${v.lose}${near}`, `${v.lose} cut down by ${v.win}${near}`])
      : c.pick(last, [`${v.win} wears down ${v.lose}${near}`, `${v.win} presses ${v.lose} hard${near}`, `${v.win} keeps the field against ${v.lose}${near}`]);
  },
  sum(g, s, c) {
    const last = g[g.length - 1]; const v = sides(c, last); const days = last.day - g[0].day + 1;
    const first = `${cap1(say(g.length))} battles in ${span(days)}`;
    const steady = g.every((f) => sideWon(f) === sideWon(last));
    // each side's dead over all of them: by the house, for the hosts of a house are one side whichever of them fought
    const fell = (side) => g.reduce((n, f) => n + (f.data?.lost?.[side === 'win' ? f.data.winner : f.data.loser] || 0), 0);
    const won = fell('win'); const lost = fell('lose');
    const W = v.winHouse ? c.folk(v.winHouse) : 'the victors'; const L = v.loseHouse ? c.folk(v.loseHouse) : 'the vanquished';
    const second = steady && !v.drawn && last.data?.winner && last.data?.loser && (won || lost) ? lossLine(W, L, won, lost) : '';
    return sentences(first, second, steady && last.data?.wiped && v.lose ? `${cap1(v.lose)} is no more` : '');
  },
};
/** The side that won a battle, as the house its victor belongs to (the hosts of one house are one side), else the host itself. */
const sideWon = (f) => f.data?.winnerHouse || f.data?.winner || '';
/** Which two sides fought: a battle's houses (or, where it names none, its hosts), in no order. Battles with one key, close in days, are one running fight (cluster.js). */
export const fightKey = (f) => { const d = f.data || {}; const hs = [d.winnerHouse, d.loserHouse].filter(Boolean); return (hs.length === 2 ? hs : [d.attacker, d.defender].filter(Boolean)).sort().join('|'); };
/** Sentences in a row: each ends with a full stop; empty ones are left out. */
const sentences = (...ts) => ts.filter(Boolean).map((t) => { const x = String(t).trim(); return /[.!?]$/.test(x) ? x : `${x}.`; }).join(' ');
const FACTORS = {
  'numbers and arms': (W) => `Greater numbers and better arms carried the day for ${W}`,
  generalship: (W) => `Better generalship decided it for ${W}`,
  "the men's heart": (W) => `The men of ${W} fought with better heart`,
  hunger: () => 'Hunger in the losing host decided it',
  'the ground': (W) => `The ground favoured ${W}`,
  'the walls': (W) => `The walls favoured ${W}`,
  surprise: (W) => `${cap1(W)} won by surprise`,
  'being caught on the march': (W, L) => `${cap1(L)} was caught on the march`,
  'the besiegers divided in their camps': () => 'The besiegers were divided in their camps',
  fortune: (W) => `The day was ${W}'s by fortune`,
};
/** The clause a battle's `how` is: a factor the engine weighed, or (as a story would give it) a sentence of its own. */
function howBattle(f, c, v) {
  const d = f.data || {}; const how = String(d.how || '').trim(); const W = v.winHouse ? c.host(v.winHouse) : v.win || 'the victors'; const L = v.loseHouse ? c.host(v.loseHouse) : v.lose || 'the vanquished';
  if (FACTORS[how]) return FACTORS[how](W, L);
  if (Array.isArray(d.decided) && d.decided.length && !how) return FACTORS[d.decided[0]]?.(W, L) || '';
  if (!how) return '';
  if (/^(?:neither|both|no |a |the |it |they |one )/i.test(how) || /^[A-Z]/.test(how)) return cap1(how);
  return `${cap1(W)} ${how}`;
}
const WHYNOT = (P, c) => ({
  'bad blood between the houses': 'Bad blood lies between the two houses',
  'little loyalty to the liege': `${P.He} has little loyalty to ${P.his} liege`,
  "the liege's heavy taxes": `The liege's heavy taxes weigh on ${P.him}`,
  'hungry lands at home': `${P.His} lands at home are hungry`,
  'already put the call off once': `${P.He} has already put the call off once`,
  'no heart for the war': `${P.He} has no heart for the war`,
});
const TERMS = { yield_and_swear: 'that the garrison yield and swear fealty', yield: 'that the garrison yield', ransom: 'a ransom in gold' };
const CRIME = (t) => { const m = String(t || '').match(/\bfor ([a-z ]{3,30})$/i); return m ? `The charge was ${m[1]}` : /\bon the king's word\b/i.test(t || '') ? "It was done on the King's word" : ''; };

export const SUM = {
  set_out: (f, s, c) => {
    const d = f.data || {}; const P = pro(c, f); const days = d.eta && d.eta > f.day ? d.eta - f.day : d.days; const sp = span(days); const to = c.dest(d.to);
    if (d.why) return sentences(`${P.He} goes ${d.why}`, sp && !to ? `The road is ${sp}` : '');
    return sp ? sentences(to ? `The road to ${to} is ${sp}` : `The march will take ${sp}`) : '';
  },
  returned: () => '',
  arrived: (f, s, c) => { const d = f.data || {}; const P = pro(c, f); return d.men ? sentences(`${P.He} brings ${body(d.men)}`) : ''; },
  turned_back: (f) => sentences(f.data?.halted ? 'The march goes no further for now' : 'No road leads on from there'),
  met_on_road: () => '',
  crossed: (f, s, c) => (f.data?.men ? sentences(`The party has ${body(f.data.men)} with it`) : ''),
  delayed: (f, s, c) => {
    const d = f.data || {}; const l = c.known.house(d.lender) ? c.hs(d.lender) : '';
    return d.why === 'ships' ? sentences(`It waits ${span(d.wait) || 'a while'} for ships${l ? ` lent by ${l}` : ''}`) : d.why ? sentences('There are no ships to carry the men over') : '';
  },
  embarked: (f, s, c) => { const d = f.data || {}; const P = pro(c, f); return sentences(d.men ? `${P.He} takes ${body(d.men)}${d.ships ? ` in ${say(d.ships) || 'many'} ships` : ''}` : '', d.days ? `The crossing is ${span(d.days)}` : ''); },
  landed: (f, s, c) => { const d = f.data || {}; const P = pro(c, f); return d.men ? sentences(`${bodyDo(d.men, 'land', 'lands')} with ${P.him}`) : sentences(`${P.He} lands with what ${P.he} brought`); },
  lost_at_sea: (f) => { const d = f.data || {}; return sentences(d.drowned ? `${bodyDo(d.drowned, 'drown', 'drowns')} with them` : 'Little is known beyond the loss'); },
  levies_called: (f, s, c) => {
    const d = f.data || {}; const to = c.dest(d.muster); const n = (d.vassals || []).length;
    if (n) return sentences(`${cap1(count(n))} sworn houses are told to bring their men${to ? ` to ${to}` : ''}`);
    // against whom is the fact's own word (`data.against`, set when the call is made in an open war), never the state's: what the house has not been told it may not read
    const foe = c.known.house(d.against) ? d.against : null;
    const why = foe ? `It is for the war with ${c.hs(foe)}` : 'Nothing yet says against whom';
    return sentences(d.men ? `The call is for ${body(d.men)}` : 'The banners are called', why);
  },
  call_answered: (f, s, c) => {
    const d = f.data || {}; const P = pro(c, f); const to = c.dest(d.to); const go = d.depart && d.depart > f.day ? `, leaving in ${span(d.depart - f.day) || 'a few days'}` : ''; const home = c.pl(f.place);
    return d.men ? sentences(`${P.He} sends ${body(d.men)}${home ? ` from ${home}` : ''}${to ? ` to ${to}` : ''}${go}`) : '';
  },
  call_delayed: (f, s, c) => { const d = f.data || {}; const P = pro(c, f); return sentences(d.retry && d.retry > f.day ? `${P.He} promises an answer in ${span(d.retry - f.day) || 'a few days'}` : `${P.He} will answer later`); },
  call_refused: (f, s, c) => {
    const d = f.data || {}; const P = pro(c, f); const why = String(d.why || '').trim(); const known = WHYNOT(P, c)[why];
    const reason = known || (why ? cap1(why) : '');
    return sentences(reason, why ? `${P.His} men stay at home` : `${P.His} men will stay at home`);
  },
  muster_grew: (f, s, c) => { const d = f.data || {}; return d.total ? sentences(d.total >= 6000 ? 'The host has grown into a great one' : `There are now ${body(d.total)} in the host`) : ''; },
  host_formed: (f, s, c) => { const d = f.data || {}; const P = pro(c, f); return d.men ? sentences(`${P.He} has ${body(d.men)} under ${P.him}`) : sentences(`Men gather under ${P.his} banner`); },
  host_joined: (f, s, c) => { const d = f.data || {}; return d.men ? sentences(`The host grows by ${body(d.men)}`) : ''; },
  host_split: (f, s, c) => { const d = f.data || {}; return d.men ? sentences(`${bodyDo(d.men, 'are', 'is')} split off`) : ''; },
  host_disbanded: (f, s, c) => { const d = f.data || {}; if (/overcome/.test(d.why || '')) return sentences('The men are cut down or driven out'); return d.men ? sentences(`${bodyDo(d.men, 'go', 'goes')} home`) : ''; },
  desertion: (f, s, c) => { const d = f.data || {}; return sentences(`Men slip away from the ranks${d.why ? `: ${d.why}` : ''}`); },
  host_hungry: () => sentences('Its wagons and the fields about it are both empty'),
  land_stripped: () => sentences('The foragers have left the province nothing, and the next host through it will starve'),
  camp_fever: (f) => { const d = f.data || {}; return sentences(d.lost ? `The flux has taken ${body(d.lost)}` : 'The flux runs through the camp'); },
  battle: (f, s, c) => {
    const d = f.data || {}; const v = sides(c, f); const first = howBattle(f, c, v);
    let second = '';
    const lost = d.lost && typeof d.lost === 'object' ? d.lost : null;
    if (lost && !v.drawn && d.winner && d.loser && lost[d.winner] != null && lost[d.loser] != null) {
      const W = v.winHouse ? c.folk(v.winHouse) : 'the victors'; const L = v.loseHouse ? c.folk(v.loseHouse) : 'the vanquished';
      second = lossLine(W, L, lost[d.winner], lost[d.loser]);
    } else if (lost && v.drawn) second = 'Both sides leave many dead on the field';
    return sentences(first, second);
  },
  rout: () => sentences('Its men break and run'),
  withdrew: () => sentences('It would not give battle'),
  stand_off: () => sentences('Neither will begin it'),
  captured_in_battle: (f, s, c) => {
    const d = f.data || {}; const P = pro(c, f); const p = f.actors?.[0]; const he = p && c.known.person(p) ? c.he(p, true) : 'They'; const by = agentName(c, slot(f, 'data.by'));
    if (d.how && !/^battle$/.test(d.how)) return sentences(`${he} was ${d.how}`);
    return sentences(by ? `${he} is now a prisoner of ${by}` : `${he} is held by the victors`);
  },
  slain_in_battle: (f, s, c) => {
    const d = f.data || {}; const p = f.actors?.[0]; const known = p && c.known.person(p); const he = known ? c.he(p, true) : 'He'; const by = agentName(c, slot(f, 'data.by'));
    const how = String(d.how || '').trim();
    if (how && how !== 'battle') return sentences(`${he} ${how}`);
    return by ? sentences(`${by} held the field where ${known ? c.he(p) : 'he'} fell`) : sentences(`${he} fell in the fighting`);
  },
  siege_begun: (f, s, c) => { const d = f.data || {}; const P = pro(c, f); return d.men ? sentences(`${P.He} comes with ${body(d.men)}`) : sentences('The castle is shut in'); },
  siege_tick: (f) => { const d = f.data || {}; return d.days ? sentences(`The siege has lasted ${span(d.days)}`) : ''; },
  sally: (f, s, c) => { const d = f.data || {}; return sentences(d.hurt ? `The sortie costs the besiegers ${body(d.hurt)}` : "The garrison strikes at the besiegers' lines"); },
  storm_assault: (f) => { const d = f.data || {}; return sentences(d.carried === false ? `The attack is beaten off${d.lost ? `, at the cost of ${body(d.lost)}` : ''}` : d.lost ? `The assault costs ${body(d.lost)}` : 'The walls are carried'); },
  holding_fell: (f, s, c) => {
    const d = f.data || {};
    return sentences(d.how === 'starved' ? 'Hunger forced the surrender' : d.how === 'betrayed' ? 'It was betrayed from within' : 'The siege is over');
  },
  siege_lifted: () => sentences('The besiegers march away, and the castle stands'),
  relief_near: () => sentences('The relieving host is within three days of the walls'),
  terms_offered: (f) => { const d = f.data || {}; const t = TERMS[d.terms]; return t ? sentences(`The terms are ${t}`) : ''; },
  terms_refused: () => sentences('The siege goes on'),
  raid: (f) => { const d = f.data || {}; return sentences(d.loot ? `The raiders carry off plunder worth ${gold(d.loot)} dragons` : 'The raiders carry off what they can'); },
  village_burned: () => '',
  blockade: () => sentences('Trade by sea stops'),
  sea_battle: (f) => { const d = f.data || {}; return sentences(d.prizes ? `${cap1(say(d.prizes) || 'Many')} ships are taken as prizes` : 'The fleets fought until one broke'); },
  sellswords_hired: (f) => { const d = f.data || {}; return sentences(d.price ? `They come at a price of ${gold(d.price)} dragons` : 'They serve whoever pays'); },
  sellswords_turned: (f) => { const d = f.data || {}; return sentences(d.price ? `They go to the higher bidder, at ${gold(d.price)} dragons` : 'They go to the higher bidder'); },
  outlaws_rise: (f) => { const d = f.data || {}; return d.men ? sentences(`${bodyDo(d.men, 'hold', 'holds')} the roads where war laid the land waste`) : ''; },
  outlaws_scattered: () => '',
  men_hired: (f) => { const d = f.data || {}; return d.men ? sentences(`${bodyDo(d.men, 'enter', 'enters')} the pay of the house`) : ''; },
  ambush: (f) => { const d = f.data || {}; return d.men ? sentences(`It is a company of ${body(d.men)}`) : ''; },
  war_declared: (f, s, c) => { const d = f.data || {}; const r = String(d.reason || '').trim(); return sentences(r ? `The cause is ${lower1(r)}` : 'Two houses that were at odds are now at war'); },
  war_joined: (f, s, c) => { const d = f.data || {}; const P = pro(c, f); return sentences(`${P.He} takes the side of the ${d.side === 'attackers' ? 'attackers' : 'defenders'}`); },
  peace_made: (f) => { const t = String(f.data?.terms || '').trim(); return sentences(/white peace/i.test(t) || !t ? 'The war ends without a winner' : `The terms are ${t}`); },
  pact_made: (f) => { const t = f.data?.type; return sentences(t === 'alliance' ? 'Each swears to stand with the other' : t === 'marriage' ? 'The two houses will be joined by marriage' : 'Each side is bound by its terms'); },
  pact_broken: () => sentences('The two houses are no longer bound'),
  fealty_sworn: (f, s, c) => {
    const d = f.data || {}; const h = c.owner(f); const lg = d.liege;
    return h && c.known.house(lg) && h !== lg ? sentences(`${cap1(c.hs(h))} is now sworn to ${c.hs(lg)}`) : sentences('The oath is sworn before witnesses');
  },
  fealty_renounced: (f, s, c) => {
    const d = f.data || {}; const h = c.owner(f); const lg = c.known.house(d.liege) ? c.hs(d.liege) : ''; const to = c.known.house(d.to) ? c.hs(d.to) : '';
    return h && lg ? sentences(`${cap1(c.hs(h))} no longer answers to ${lg}${to ? ` and looks to ${to} instead` : ''}`) : sentences('The oath is broken');
  },
  crowned: (f, s, c) => { const d = f.data || {}; const P = pro(c, f); const p = c.pl(f.place); return sentences(d.victory ? `${P.He} takes the crown after a victory in the field${p ? `, and is hailed at ${p}` : ''}` : `${P.His} lords have raised ${P.him} up${p ? ` at ${p}` : ''}`); },
  claim_proclaimed: (f, s, c) => {
    const P = pro(c, f); const crownLord = Object.values(s.houses || {}).find((h) => h.rank === 'crown')?.lord;
    return sentences(crownLord && crownLord !== P.id ? `${P.His} claim sets ${P.him} against the crown` : `${P.His} claim is for every lord of the realm to answer`);
  },
  office_granted: (f, s, c) => { const P = pro(c, f); return sentences(`${P.He} takes up the duties of the office`); },
  office_stripped: (f, s, c) => { const P = pro(c, f); return sentences(`${P.He} holds it no longer`); },
  holding_granted: (f, s, c) => { const d = f.data || {}; const h = c.known.house(d.to) ? c.hs(d.to) : ''; return sentences(h ? `The holding passes to ${h}` : 'The holding passes to a new lord'); },
  attainder: (f, s, c) => { const r = String(f.data?.reason || '').trim(); const P = pro(c, f); return sentences(r ? `The charge is ${r}` : '', `${P.His} lands are forfeit`); },
  house_ended: (f) => { const r = String(f.data?.reason || '').trim(); return sentences(r ? cap1(r) : 'No heir is left to carry the name'); },
  death: (f, s, c) => {
    const d = f.data || {}; const P = pro(c, f); const age = say(d.age);
    const of = deathOf(d); const shown = of && String(d.cause || '').toLowerCase() !== of ? String(d.cause || '').trim() : '';
    // a death that carries no age and no cause the headline did not say still says what the person was (their office, in a word), never nothing
    const role = { maester: 'a maester', knight: 'a knight', lord: 'a lord', lady: 'a lady', priest: 'a septon', steward: 'a steward', captain: 'a captain', commander: 'a commander', master_at_arms: 'a master-at-arms', heir: 'an heir', ward: 'a ward of the house', servant: 'a servant of the house', family: 'of the house' }[(s.characters?.[f.actors?.[0]]?.roles || [])[0]];
    return sentences(age ? `${P.He} was ${age}` : '', shown ? `${P.He} died of ${shown}` : '') || (role ? sentences(`${P.He} was ${role}`) : '');
  },
  birth: (f, s, c) => {
    const d = f.data || {}; const m = d.mother && c.known.person(d.mother) ? c.nm(d.mother) : ''; const fa = d.father && c.known.person(d.father) ? c.nm(d.father) : '';
    if (!m && !fa) return '';
    const kind = d.sex === 'f' ? 'daughter' : d.sex === 'm' ? 'son' : 'child'; const parents = fa && m ? `${d.posthumous ? 'the late ' : ''}${fa} and ${m}` : `${d.posthumous && fa ? 'the late ' : ''}${fa || m}`;
    return sentences(`A ${kind} of ${parents}`);
  },
  betrothal: (f, s, c) => { const [a, b] = houseSides(c, f); return a && b ? sentences(`The match joins ${a} and ${b}`) : sentences('The match is made between two houses'); },
  wedding: (f, s, c) => { const [a, b] = houseSides(c, f); return a && b ? sentences(`The marriage joins ${a} and ${b}`) : sentences('The two are married before their houses'); },
  captured: (f, s, c) => { const P = pro(c, f); return sentences(`${P.He} is held as a prisoner`); },
  released: (f, s, c) => { const P = pro(c, f); return sentences(`${P.His} captors have let ${P.him} go`); },
  ransomed: (f, s, c) => { const d = f.data || {}; const P = pro(c, f); return sentences(`${P.He} goes home to ${P.his} own people${d.gold ? `; the ransom was ${gold(d.gold)} dragons` : ''}`); },
  executed: (f) => sentences(CRIME(f.data?.cause) || 'The sentence is carried out'),
  sent_to_wall: (f, s, c) => { const P = pro(c, f); return sentences(`${P.He} will hold no lands and father no children`); },
  hostage_taken: (f, s, c) => { const P = pro(c, f); return sentences(`${P.He} is held against the good conduct of ${P.his} house`); },
  ward_fostered: (f, s, c) => { const by = slot(f, 'data.by'); const P = pro(c, f); return by && c.known.house(by) ? sentences(`${P.He} will be raised in the household of ${c.hs(by)}`) : ''; },
  wounded: (f, s, c) => {
    const note = String(f.data?.note || '').trim(); const P = pro(c, f);
    return sentences(note && !/^(?:wounded|taken|hurt)/i.test(note) && /^[A-Z][a-z]+ /.test(note) ? `${P.He} ${lower1(note.replace(/\.$/, ''))}` : `${P.He} is hurt but lives`);
  },
  illness: (f, s, c) => { const P = pro(c, f); return sentences(f.data?.why === 'strain' ? `The strain has told on ${P.him}, and the rest ${P.he} needs will not be taken` : `${P.He} keeps to ${P.his} bed`); },
  recovered: (f, s, c) => { const P = pro(c, f); return sentences(`${P.He} is on ${P.his} feet again`); },
  came_of_age: (f, s, c) => { const P = pro(c, f); return sentences(`${P.He} answers for ${P.self} now`); },
  succession: (f, s, c) => { const P = pro(c, f); const h = (f.houses || []).find((x) => c.known.house(x)); return sentences(h ? `${P.He} is now head of ${c.hs(h)}` : `${P.He} is now head of the house`); },
  regency_begun: (f, s, c) => {
    const d = f.data || {}; const w = f.actors?.[1] && c.known.person(f.actors[1]) ? c.nm(f.actors[1]) : 'The lord';
    return sentences(d.why === 'minority' ? `${w} is too young to rule` : d.why ? `${w} cannot rule` : `${w} does not rule for now`);
  },
  regency_ended: (f, s, c) => { const w = f.actors?.[1] && c.known.person(f.actors[1]) ? c.nm(f.actors[1]) : 'The lord'; return sentences(`${w} rules the house again`); },
  fled: (f, s, c) => { const P = pro(c, f); return sentences(`${P.His} people do not know where ${P.he} has gone`); },
  vanished: (f, s, c) => { const P = pro(c, f); return sentences(`No one can say where ${P.he} went`); },
  letter_sent: (f) => { const d = f.data || {}; const sp = span(d.days); return sp ? sentences(`The raven is ${sp} on the wing`) : ''; },
  letter_arrived: () => '',
  letter_intercepted: (f, s, c) => { const to = c.nm(f.data?.to); return sentences(to ? `${to} never sees it` : 'It never reaches its reader'); },
  envoy_arrived: (f, s, c) => { const P = pro(c, f); const h = (f.houses || []).find((x) => c.known.house(x)); return sentences(h ? `${P.He} comes with the word of ${c.hs(h)}` : `${P.He} comes with a message`); },
  audience_held: () => '',
  gift: (f, s, c) => { const d = f.data || {}; const P = pro(c, f); return sentences(`The gift is meant to win ${P.his} goodwill`, d.gold ? `It is worth ${gold(d.gold)} dragons` : ''); },
  loan_taken: (f) => { const d = f.data || {}; return d.amount ? sentences(`The loan is for ${gold(d.amount)} dragons${d.due && d.due > f.day ? `, due in ${span(d.due - f.day)}` : ''}`) : ''; },
  loan_repaid: (f) => { const d = f.data || {}; return sentences(d.still > 0 ? `${cap1(gold(d.still))} dragons are still owed` : 'The debt is paid in full'); },
  debt_called: (f) => { const d = f.data || {}; return sentences(d.owed ? `${cap1(gold(d.owed))} dragons must be paid${d.by && d.by > f.day ? ` within ${span(d.by - f.day)}` : ''}` : 'The whole debt must be paid'); },
  loan_defaulted: (f) => { const d = f.data || {}; return sentences(d.amount ? `${cap1(gold(d.amount))} dragons are unpaid` : 'The loan goes unpaid'); },
  grain_bought: (f) => { const d = f.data || {}; return d.moons ? sentences(`The grain is meant to last ${say(d.moons) || 'many'} moons`) : ''; },
  bribe: (f) => { const d = f.data || {}; return d.gold ? sentences(`${cap1(gold(d.gold))} dragons change hands in secret`) : ''; },
  bribe_refused: () => sentences('The gold is not taken'),
  ransom_demanded: (f) => { const d = f.data || {}; return sentences(d.gold ? `The price is ${gold(d.gold)} dragons` : 'The captive is not freed until it is paid'); },
  embargo: (f) => sentences(f.data?.lifted ? 'Merchants of both houses may trade again' : 'Merchants of both houses may not trade'),
  peace_sued: (f) => { const d = f.data || {}; const t = String(d.terms || '').trim(); return sentences(d.accepted ? 'Both sides agree' : t ? `The terms are ${t}` : 'The offer is not yet answered'); },
  cold_war: () => sentences('No battle has been fought in six moons'),
  commitment_made: (f, s, c) => { const P = pro(c, f); return sentences(`${P.He} is bound by it now`); },
  commitment_kept: (f, s, c) => { const P = pro(c, f); return sentences(`${P.He} did what ${P.he} promised`); },
  commitment_broken: (f, s, c) => { const P = pro(c, f); return sentences(`${P.He} did not do what ${P.he} promised`); },
  rumour: () => sentences('It is only a rumour'),
  secret_revealed: (f) => { const m = String(f.data?.matter || '').trim(); return sentences(m ? `It concerns ${m}` : 'It was a secret kept close'); },
  scheme_discovered: (f) => sentences(f.data?.kind === 'spy' ? 'A spy has been at work there' : 'Someone has been plotting there'),
  feast: (f, s, c) => {
    const d = f.data || {}; const guests = (f.actors || []).slice(1).filter((id) => c.known.person(id)).slice(0, 3).map((id) => c.nm(id));
    if (d.brawl) { const [x, y] = (d.brawlers || []).filter((id) => c.known.person(id)); return sentences(x && y ? `${c.lordly(x)} and ${c.lordly(y)} come to blows${d.over ? ` over ${d.over}` : ''}` : 'Guests come to blows before the night is over'); }
    if (!guests.length && c.known.house(d.envoys)) return sentences(`Envoys of ${c.hs(d.envoys)} sit at the table`);
    return guests.length ? sentences(`${list(guests)} ${guests.length === 1 ? 'sits' : 'sit'} at the table`) : sentences('It is a feast for the household, with no great guests');
  },
  tourney: (f) => { const d = f.data || {}; const n = say(d.guests); return sentences(n ? `${cap1(n)} houses are asked to send knights` : 'Knights are called to the lists'); },
  tourney_result: (f, s, c) => { const own = s.characters?.[(f.actors || [])[0]]?.house; const h = c.known.house(own) ? own : (f.houses || []).find((x) => c.known.house(x)); const P = pro(c, f); return h ? sentences(`${P.He} rides for ${c.hs(h)}`) : sentences(`${P.He} is the champion of the lists`); },
  judgement: (f) => { const v = String(f.data?.verdict || '').trim(); return v ? sentences(`The verdict is ${v}`) : ''; },
  // (a command that could not be carried out says why, in the steward's words, not that the word went out under a seal, TX5)
  order_given: (f) => { const d = f.data || {}; if (!d.refused) return sentences('The word goes out under his seal'); const why = String(d.why || '').replace(/^the order was not clear\s*[—-]?\s*/i, '').trim(); return sentences(!why || /\?|^(?:where|whom|who|how|which|what|should)\b/i.test(why) ? 'The steward could not tell what was meant, and nothing was done' : `${cap1(why.replace(/[.!]+$/, ''))}, and nothing was done`); },
  petition: () => '',
  // (the people's side of the rate, and what a late or withheld due means for the liege: a card must not stop at its headline, TX5)
  tax_changed: (f) => {
    const d = f.data || {};
    if (d.dues) return sentences(d.dues === 'paying' ? 'The coin comes in again' : d.dues === 'late' ? 'The coin is promised and slow in coming' : 'Nothing will be sent until the quarrel is settled');
    return sentences({ low: 'The smallfolk pay less, and the treasury will feel it', light: 'The smallfolk pay less, and the treasury will feel it', normal: 'The levy goes back to its usual rate', high: 'The levy is heavier, and the smallfolk will feel it', heavy: 'The levy is heavier, and the smallfolk will feel it', crushing: 'The people are bled for coin, and will not forget it' }[d.tax] || '');
  },
  works_begun: (f) => { const d = f.data || {}; return d.months ? sentences(`It will take ${span(d.months * 30)}`) : ''; },
  works_done: () => '',
  ledger: (f) => sentences(LEDGER_SUM[f.data?.note] || ''),
  unrest_rising: (f) => sentences(f.data?.outlaws ? 'Broken men have taken to the woods, and travellers go armed' : 'The smallfolk are restless and the roads are less safe'),
  rising: (f, s, c) => { const h = (f.houses || []).find((x) => c.known.house(x)); return sentences(h ? `They are up in arms against ${c.hs(h)}` : 'They are up in arms'); },
  famine: () => sentences('Harvests have failed and bread is short'),
  plague: () => sentences('Fever and flux run through the town'),
  season_turned: () => sentences('The maesters of the Citadel have marked the change'),
  custom_created: (f) => { const cu = String(f.data?.custom || '').trim(); return cu ? sentences(`The custom is ${cu}`) : ''; },
  canon_beat: (f) => {
    if (f.thread === 'kings_ride' && f.data?.stage === 'progress') return sentences('The royal progress is on the road, and the whole realm watches it pass');
    return beatTale(f) || sentences('The ravens carry the word across the realm');
  },
  happening: (f, s, c) => { if (f.data?.sum) return sentences(f.data.sum); if (HARVEST_SUM[f.data?.harvest]) return sentences(HARVEST_SUM[f.data.harvest]); if (FAMILY_SUM[f.data?.family]) return FAMILY_SUM[f.data.family](f); const id = f.data?.tpl; const [, sum] = TPL[id] || HAP_HEADS[id] || HAP_TYPE[HAP_BY_ID.get(id)?.type] || HAP_TYPE.rumor; return sentences(sum); },
  hook: (f, s, c) => { const e = HOOK[f.data?.hook]; return e ? sentences(e[1]) : ''; },
  behaviour: (f) => sentences(BEHAVIOUR_SUM[f.data?.band] || ''),
  weather: () => '',
  legacy: () => '',
};
/** The two houses of a match or a marriage, as labels. */
function houseSides(c, f) {
  const ids = (f.actors || []).filter((id) => c.known.person(id)).map((id) => c.known.person(id).house);
  const hs = [...new Set([...ids, ...(f.houses || [])])].filter((h) => c.known.house(h));
  return [hs[0] ? c.hs(hs[0]) : '', hs[1] ? c.hs(hs[1]) : ''];
}

// ── What a secondary fact of a story adds to the lead's summary ───────────────────────────────────────────────────────
export const ALSO = {
  succession: (f, s, c, lead) => {
    const heir = f.actors?.[0]; const p = c.known.person(heir); if (!p) return '';
    const dead = lead?.actors?.[0]; const son = dead && p.father === dead;
    const P = c.pl(f.place) || c.dest((f.houses || []).find((h) => c.known.house(h)));
    return sentences(`${son ? `His son ${c.first(heir)}` : c.nm(heir)} takes ${P || 'the seat'}`);
  },
  captured_in_battle: (f, s, c) => { const id = f.actors?.[0]; return c.known.person(id) ? sentences(`${c.nm(id)} was taken`) : ''; },
  slain_in_battle: (f, s, c) => { const id = f.actors?.[0]; return c.known.person(id) ? sentences(`${c.nm(id)} fell`) : ''; },
  tourney: (f, s, c) => { const d = f.data || {}; const n = say(d.guests); const h = c.subj(f); return n ? sentences(`${c.possessive(h)} tourney drew ${n} houses`) : sentences(`${c.possessive(h)} tourney drew the lords`); },
  call_refused: (f, s, c) => { const a = (f.actors || []).find((id) => c.known.person(id)); return a ? sentences(`${c.lordly(a)} alone refused`) : ''; },
  holding_fell: (f, s, c) => { const T = holdingOf(c, f); return T ? sentences(`${T} has fallen`) : ''; },
  relief_near: (f, s, c) => { const T = holdingOf(c, f); return T ? sentences(`A relieving host is close to ${T}`) : ''; },
  siege_begun: (f, s, c, lead) => { if (lead?.kind === 'holding_fell' || lead?.kind === 'storm_assault') return ''; const T = holdingOf(c, f); return T ? sentences(`${T} is shut in`) : ''; }, // (a castle that has fallen is not shut in)
  rout: () => sentences('The beaten host broke and fled'),
  death: (f, s, c) => { const id = f.actors?.[0]; return c.known.person(id) ? sentences(`${c.nm(id)} is dead`) : ''; },
  wedding: (f, s, c) => { const [a, b] = houseSides(c, f); return a && b ? sentences(`The marriage joins ${a} and ${b}`) : ''; },
};

// ── The fold: the numbers, exact for the viewer's friends and to two figures for everyone else ────────────────────────
/** The lines of a fact's "Details". Every digit of the story lives here, and only here. */
export const DETAIL = {
  set_out: (f, s, c) => {
    const d = f.data || {}; const days = d.eta && d.eta > f.day ? d.eta - f.day : d.days; const to = c.dest(d.to); const o = c.owner(f); const label = cap1(c.pty(d.party, o) || c.subj(f));
    const bits = [to ? `bound for ${to}` : '', days ? `about ${Math.round(days) === 1 ? 'a day' : `${Math.round(days)} days`} on the road` : '', d.men ? `${c.n(d.men, o)} men` : ''].filter(Boolean);
    return bits.length ? [`${label}: ${bits.join(', ')}.`] : [];
  },
  arrived: (f, s, c) => (f.data?.men ? [`${cap1(c.pty(f.data.party, c.owner(f)) || c.subj(f))} arrives with ${c.n(f.data.men, c.owner(f))} men.`] : []),
  crossed: (f, s, c) => (f.data?.men ? [`${c.n(f.data.men, c.owner(f))} men in the party.`] : []),
  delayed: (f, s, c) => (f.data?.wait ? [`Waits about ${Math.round(f.data.wait)} days for ships.`] : []),
  embarked: (f, s, c) => { const d = f.data || {}; return [d.men ? `${c.n(d.men, c.owner(f))} men` : '', d.ships ? `${d.ships} ships` : '', d.days ? `${Math.round(d.days)} days at sea` : ''].filter(Boolean).length ? [[d.men ? `${c.n(d.men, c.owner(f))} men` : '', d.ships ? `${d.ships} ships` : '', d.days ? `${Math.round(d.days)} days at sea` : ''].filter(Boolean).join(', ') + '.'] : []; },
  landed: (f, s, c) => (f.data?.men ? [`${c.n(f.data.men, c.owner(f))} men land.`] : []),
  lost_at_sea: (f, s, c) => { const d = f.data || {}; const o = c.owner(f); return [[d.ships ? `${d.ships} ${d.ships === 1 ? 'ship' : 'ships'} lost` : '', d.drowned ? `about ${c.n(d.drowned, o).replace(/^about /, '')} drowned` : ''].filter(Boolean).join('; ')].filter(Boolean).map((t) => `${cap1(t)}.`); },
  levies_called: (f, s, c) => {
    const d = f.data || {}; const o = c.owner(f); const out = [];
    if (d.men) out.push(`Men called: ${c.n(d.men, o)}.`);
    if (d.now && d.now !== d.men) out.push(`Under arms now: ${c.n(d.now, o)}.`);
    if ((d.vassals || []).length) out.push(`${d.vassals.length} sworn houses summoned.`);
    return out;
  },
  call_answered: (f, s, c) => { const d = f.data || {}; const o = c.owner(f); return d.men ? [`${c.short(o) || cap1(c.subj(f))}: ${c.n(d.men, o)} men${d.depart && d.depart > f.day ? `, leaving in ${d.depart - f.day} days` : ''}.`] : []; },
  call_delayed: (f) => (f.data?.retry && f.data.retry > f.day ? [`Will answer in about ${f.data.retry - f.day} days.`] : []),
  muster_grew: (f, s, c) => { const d = f.data || {}; const o = c.owner(f); return d.men ? [`${c.n(d.men, o)} more men; ${c.n(d.total || d.men, o)} in all.`] : []; },
  host_formed: (f, s, c) => (f.data?.men ? [`${cap1(c.pty(f.data.party, c.owner(f)) || c.subj(f))}: ${c.n(f.data.men, c.owner(f))} men.`] : []),
  host_joined: (f, s, c) => (f.data?.men ? [`${c.n(f.data.men, c.owner(f))} men join the host.`] : []),
  host_split: (f, s, c) => (f.data?.men ? [`${c.n(f.data.men, c.owner(f))} men split off.`] : []),
  host_disbanded: (f, s, c) => (f.data?.men ? [`${c.n(f.data.men, c.owner(f))} men sent home.`] : []),
  desertion: (f, s, c) => (f.data?.men ? [`${c.n(f.data.men, c.owner(f))} men remain.`] : []),
  host_hungry: (f, s, c) => (f.data?.men ? [`${c.n(f.data.men, c.owner(f))} men are hungry.`] : []),
  camp_fever: (f, s, c) => { const d = f.data || {}; const o = c.owner(f); return [d.lost ? `${c.n(d.lost, o)} men lost to the flux` : '', d.men ? `${c.n(d.men, o)} in the camp` : ''].filter(Boolean).length ? [[d.lost ? `${c.n(d.lost, o)} men lost to the flux` : '', d.men ? `${c.n(d.men, o)} in the camp` : ''].filter(Boolean).join('; ') + '.'] : []; },
  battle: (f, s, c) => {
    const d = f.data || {}; const out = []; const lost = d.lost && typeof d.lost === 'object' ? d.lost : null;
    if (lost) {
      const houseOf = (key) => (key === d.winner ? d.winnerHouse : key === d.loser ? d.loserHouse : c.known.party(key)?.owner);
      const parts = Object.entries(lost).map(([k, n]) => { const h = houseOf(k); const who = h && c.known.house(h) ? (c.short(h) === 'royal' ? 'The royal host' : c.short(h)) : c.known.party(k) ? cap1(c.pty(k)) : 'One side'; return `${who} lost ${c.n(n, h)}`; });
      if (parts.length) out.push(`${parts.join('; ')}.`);
    }
    if (Array.isArray(d.decided) && d.decided.length) out.push(`Decided by ${d.decided.join(' and ')}.`);
    return out;
  },
  siege_begun: (f, s, c) => (f.data?.men ? [`${c.n(f.data.men, c.owner(f))} men lay siege.`] : []),
  siege_tick: (f) => (f.data?.days ? [`The siege is in its ${Math.round(f.data.days)}th day.`.replace(/(\d+)th day/, (m, n) => `${n}${[, 'st', 'nd', 'rd'][n % 10] && !(n >= 11 && n <= 13) ? [, 'st', 'nd', 'rd'][n % 10] : 'th'} day`)] : []),
  sally: (f, s, c) => (f.data?.hurt ? [`${c.n(f.data.hurt, c.owner(f))} of the besiegers hurt.`] : []),
  storm_assault: (f, s, c) => (f.data?.lost ? [`${c.n(f.data.lost, c.owner(f))} men lost in the assault.`] : []),
  relief_near: (f, s, c) => (f.data?.men ? [`${c.n(f.data.men, c.owner(f))} men in the relieving host.`] : []),
  raid: (f, s, c) => (f.data?.loot ? [`Loot of about ${c.n(f.data.loot, c.owner(f)).replace(/^about /, '')} dragons.`] : []),
  sea_battle: (f, s, c) => { const d = f.data || {}; const ships = d.ships && typeof d.ships === 'object' ? Object.entries(d.ships).map(([k, n]) => `${c.known.party(k) ? cap1(c.pty(k)) : 'One fleet'}: ${n} ships`) : []; return [...(ships.length ? [`${ships.join('; ')}.`] : []), ...(d.prizes ? [`${d.prizes} prize ships taken.`] : [])]; },
  sellswords_hired: (f) => (f.data?.price ? [`Price about ${Math.round(f.data.price).toLocaleString('en-GB')} dragons.`] : []),
  sellswords_turned: (f) => (f.data?.price ? [`Price about ${Math.round(f.data.price).toLocaleString('en-GB')} dragons.`] : []),
  outlaws_rise: (f) => (f.data?.men ? [`About ${Math.round(f.data.men)} men.`] : []),
  outlaws_scattered: (f) => (f.data?.men ? [`About ${Math.round(f.data.men)} men scattered.`] : []),
  men_hired: (f, s, c) => { const d = f.data || {}; return [d.men ? `${c.n(d.men, c.owner(f))} men` : '', d.cost ? `${Math.round(d.cost).toLocaleString('en-GB')} dragons` : ''].filter(Boolean).length ? [[d.men ? `${c.n(d.men, c.owner(f))} men` : '', d.cost ? `${Math.round(d.cost).toLocaleString('en-GB')} dragons` : ''].filter(Boolean).join(' for ') + '.'] : []; },
  ambush: (f) => (f.data?.men ? [`A company of ${Math.round(f.data.men)} men.`] : []),
  death: (f) => (f.data?.age ? [`Aged ${Math.round(f.data.age)}.`] : []),
  ransomed: (f) => (f.data?.gold ? [`Ransom ${Math.round(f.data.gold).toLocaleString('en-GB')} dragons.`] : []),
  ransom_demanded: (f) => (f.data?.gold ? [`Ransom asked: ${Math.round(f.data.gold).toLocaleString('en-GB')} dragons.`] : []),
  letter_sent: (f) => (f.data?.days ? [`About ${Math.round(f.data.days)} days on the wing.`] : []),
  gift: (f) => (f.data?.gold ? [`${Math.round(f.data.gold).toLocaleString('en-GB')} gold dragons.`] : []),
  loan_taken: (f) => { const d = f.data || {}; return [d.amount ? `${Math.round(d.amount).toLocaleString('en-GB')} dragons borrowed${d.rate ? ` at ${Math.round(d.rate * 100)} in the hundred` : ''}.` : ''].filter(Boolean); },
  loan_repaid: (f) => { const d = f.data || {}; return [d.amount ? `${Math.round(d.amount).toLocaleString('en-GB')} dragons repaid; ${Math.round(d.still || 0).toLocaleString('en-GB')} still owed.` : ''].filter(Boolean); },
  debt_called: (f) => (f.data?.owed ? [`${Math.round(f.data.owed).toLocaleString('en-GB')} dragons owed.`] : []),
  loan_defaulted: (f) => (f.data?.amount ? [`${Math.round(f.data.amount).toLocaleString('en-GB')} dragons unpaid.`] : []),
  grain_bought: (f) => { const d = f.data || {}; return [d.moons ? `${d.moons} moons of grain${d.cost ? ` for ${Math.round(d.cost).toLocaleString('en-GB')} dragons` : ''}.` : ''].filter(Boolean); },
  bribe: (f) => (f.data?.gold ? [`${Math.round(f.data.gold).toLocaleString('en-GB')} dragons.`] : []),
  bribe_refused: (f) => (f.data?.gold ? [`${Math.round(f.data.gold).toLocaleString('en-GB')} dragons offered.`] : []),
  tourney: (f, s, c) => { const d = f.data || {}; return [d.guests ? `${d.guests} houses entered.` : '', d.cost ? `Cost ${c.n(d.cost, c.owner(f))} dragons.` : ''].filter(Boolean); },
  feast: (f, s, c) => (f.data?.cost ? [`Cost ${c.n(f.data.cost, c.owner(f))} dragons.`] : []),
  works_begun: (f, s, c) => { const d = f.data || {}; return [d.cost ? `Cost ${c.n(d.cost, c.owner(f))} dragons${d.months ? `, ${d.months} months' work` : ''}.` : ''].filter(Boolean); },
  unrest_rising: (f) => (f.data?.unrest ? [`Discontent at ${Math.round(f.data.unrest)} of a hundred.`] : []),
  tax_changed: (f) => { const d = f.data || {}; return d.tax ? [`Taxes: ${d.was || 'normal'} to ${d.tax}.`] : []; },
  crowned: (f) => (f.data?.title ? [`Title: ${f.data.title}.`] : []),
  claim_proclaimed: (f) => (f.data?.title ? [`Title claimed: ${f.data.title}.`] : []),
  levies_ok: () => [],
};
