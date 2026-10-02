// Children, betrothals and weddings (bug hunt WD1; docs/gdd/08-characters-politics.md §13). Over four years of play the realm had no births, no betrothals and one wedding (the
// story's own): its courts only emptied. This is the slow life of the houses, as the GDD's §13 has it: a married couple under 45 has a monthly chance of a child (about 5 %
// at thirty, less after), a pregnancy is nine moons, the mother's risk is about 2 %; the unmarried of a great or small house are matched by their houses, betrothed, and
// wed when the bride has ridden to her husband's hall. Conservative on purpose (the figures are in FAMILY, and D-116 says why): about forty children a year in a realm of
// a hundred and ten fertile couples, and a score of betrothals.
//
// Canon gravity holds: no one the story keeps (a pillar whose end is to come, one of the children it carries, anyone a beat still to come names) is given a child or a
// match by chance, and the house of the player is left alone (its lord's marriages are his to make: the `betroth` verb, and the offers the Matters bring).
//
// The dice are the family's own: a hash of the save's seed and of the person and the day (`fate`), not a draw from the save's stream (engine/rng.js). A world with a
// cradle in it therefore plays the very same battles up to the day of the first birth; a stopped and replayed turn is born again identically; and no roll of anything else
// is moved by how many people there are to ask. Pure engine: no clock, no Math.random.
import { dayNumber } from '../time.js';
import { fact } from '../facts/log.js';
import { keptByStory } from './life.js';
import { placeOf } from '../parties.js';
import { slug } from '../ids.js';
import { houseLabel } from '../facts/label.js';
import { applyChanges, childrenOf, sendHome, placeName, getRelation } from '../../shared/world.js';
import { isFemale } from '../../shared/people.js';
import { GIVEN } from '../../../data/names.js';

export const FAMILY = {
  FERTILE: [15, 44], // a woman's years for a child
  MONTHLY: [[30, 0.06], [35, 0.045], [40, 0.025], [44, 0.008]], // the chance of a child begun in a month, by the mother's age (up to)
  PREGNANCY: 270, GAP: 240, MAX_CHILDREN: 9, // days of the carrying; days before another is begun; most children of one mother
  CHILDBED: 0.02, STILLBORN: 0.06, // the mother's risk, and a child born dead
  SON: 0.51,
  MARRY_AGE: 16, BETROTH_AGE: 8, // wed at sixteen, both (the books' custom is younger, and the game keeps it off the page, GDD 08 §13); betrothed from eight
  WAIT: [45, 165], // days from a betrothal to the wedding, when both are of age
  SINGLE: [[24, 0.10], [35, 0.07], [54, 0.03], [99, 0.01]], // the yearly chance that a house finds a match for one of its unwed, by age (up to); each match takes two, so a person is asked twice as often
  MATCHES_A_WEEK: 2, AGE_GAP: 12, LATE_BRIDE: 150, // most matches made in a week; most years between them; days a bride may be on the road before she is counted late
};
export const TIER = { crown: 0, paramount: 1, major: 2, minor: 3, exile: 2 };
// who a house matches: its own blood and wards, not its knights, servants, bastards or men of a calling
const MATCHABLE = new Set(['lord', 'lady', 'heir', 'family', 'ward']);
const NOT_WED = new Set(['maester', 'kingsguard', 'priest', 'servant', 'sellsword', 'wildling', 'bastard']);

/** The family's dice: a number in [0, 1) from the save's seed and what is asked (who, what, when). */
export function fate(state, ...parts) {
  let h = (2166136261 ^ (Number(state.meta?.seed) || 298)) >>> 0;
  for (const ch of parts.join('|')) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  h = Math.imul(h ^ (h >>> 15), 2246822519); h = Math.imul(h ^ (h >>> 13), 3266489917);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const between = ([lo, hi], u) => Math.round(lo + (hi - lo) * u);
const upTo = (table, age) => (table.find(([to]) => age <= to) || [0, 0])[1];
/** A yearly chance as the chance in one week, and a monthly one. */
const weekly = (yearly) => 1 - (1 - yearly) ** (1 / 52);
const weeklyOfMonthly = (monthly) => 1 - (1 - monthly) ** (7 / 30);
const held = (c) => /imprisoned|captive|hostage/.test(c?.status || '');
const aliveFree = (c) => !!c?.alive && c.status === 'free';
const isHouse = (h) => !!h && h.rank in TIER;

/** Whether the story keeps this person out of the cradle and the church (a pillar, a protected child, one a beat still to come names). */
const kept = (state, c, spared) => !!keptByStory(state, c) || spared.has(c.id);
/** A couple together under one roof: a married woman and her living husband at the same holding. */
function husbandOf(state, w) {
  const m = state.characters[w.spouse];
  if (!aliveFree(m) || isFemale(m) || !aliveFree(w)) return null;
  const here = placeOf(state, w); return here && here === placeOf(state, m) ? m : null;
}
const childrenAlive = (state, w) => childrenOf(state, w.id).filter((c) => c.alive).length;

// ── a child begun, a child born ──────────────────────────────────────────────────────────────────────────────────────────

/** The women who may conceive today, with their husbands: fertile, married, together, not carrying, not lately delivered, not the story's. */
function mayConceive(state, spared, today) {
  const [lo, hi] = FAMILY.FERTILE; const out = [];
  for (const w of Object.values(state.characters)) {
    if (!isFemale(w) || !(w.age >= lo && w.age <= hi) || w.expecting || today - (w.lastBirth ?? -1e9) < FAMILY.GAP) continue;
    const m = husbandOf(state, w);
    if (!m || kept(state, w, spared) || kept(state, m, spared) || !isHouse(state.houses[m.house]) || childrenAlive(state, w) >= FAMILY.MAX_CHILDREN) continue;
    out.push([w, m]);
  }
  return out;
}

function conceive(state, w, m, today) {
  const due = today + FAMILY.PREGNANCY + between([-14, 14], fate(state, 'due', w.id, today));
  w.expecting = { by: m.id, since: today, due };
  if (w.house !== state.meta.player) return [];
  const place = placeOf(state, w);
  return [fact(state, 'happening', { title: `${w.name} is with child`, text: `${w.name}, wife of ${m.name}, is with child.`, where: place, importance: 2, houses: [w.house] }, { actors: [w.id, m.id], data: { family: 'expecting', due }, vis: { scope: 'houses', houses: [w.house] }, cause: { type: 'rule', ref: 'family' } })];
}

/**
 * A name for the child: his own people's, of the sex born, that no one living of the house bears and, where the pool has one, none of the story's own cast (so that a boy
 * of the Riverlands is not a second Hugo): a house may call a child for a dead ancestor, as the houses of the books do.
 */
export function nameFor(state, houseId, sex, salt) {
  const h = state.houses[houseId]; const region = state.holdings?.[h?.seat]?.region || h?.region || 'reach';
  const pool = (GIVEN[region] || GIVEN.reach)[sex];
  const first = (c) => String(c.name).split(' ')[0].toLowerCase();
  const home = new Set(Object.values(state.characters).filter((c) => c.alive && c.house === houseId).map(first));
  const cast = new Set(Object.values(state.characters).filter((c) => c.bornDay == null).map(first)); // (everyone of the starting world, made by the data or by the scenario; not those born in play)
  const from = [pool.filter((n) => !home.has(n.toLowerCase()) && !cast.has(n.toLowerCase())), pool.filter((n) => !home.has(n.toLowerCase())), pool].find((x) => x.length);
  return from[Math.floor(fate(state, 'name', houseId, sex, salt) * from.length)];
}

function bear(state, w, today) {
  const m = state.characters[w.expecting.by]; const place = placeOf(state, w);
  const seed = `${w.id}|${w.expecting.due}`; const out = [];
  delete w.expecting; w.lastBirth = today;
  if (fate(state, 'stillborn', seed) < FAMILY.STILLBORN) {
    if (w.house === state.meta.player) out.push(fact(state, 'happening', { title: `${w.name} loses her child`, text: `${w.name} is brought to bed of a child born dead.`, where: place, importance: 2, houses: [w.house] }, { actors: [w.id], data: { family: 'stillborn' }, vis: { scope: 'houses', houses: [w.house] } }));
  } else out.push(...birth(state, w, m, place, today, seed));
  return [...out, ...childbed(state, w, place, seed)];
}

function birth(state, w, m, place, today, seed) {
  const sex = fate(state, 'sex', seed) < FAMILY.SON ? 'm' : 'f'; const house = isHouse(state.houses[m.house]) ? m.house : w.house;
  const h = state.houses[house]; const first = nameFor(state, house, sex, seed); const surname = h.name.replace(/ of .*$/, '').replace(/^Nymeros /, '');
  let id = slug(`${first}_${surname}`); for (let n = 2; state.characters[id]; n++) id = slug(`${first}_${surname}_${n}`);
  applyChanges(state, [{ op: 'character_new', id, name: `${first} ${surname}`, house, age: 0, sex, loc: place, roles: ['family'], father: m.id, mother: w.id, bio: `${sex === 'm' ? 'Son' : 'Daughter'} of ${m.name} and ${w.name}, born in ${state.meta.date.year} AC.` }], { source: 'The household', spanDays: 1, told: ['character'], cause: { type: 'rule', ref: 'family' } });
  state.characters[id].bornDay = today;
  // a child born after his father's death is the late man's: the father is in the slots, not among the actors (a dead man is no one who acts), and the words say so
  const late = !m.alive;
  return [fact(state, 'birth', { title: `${first} ${surname} is born`, text: `${first} ${surname}, ${sex === 'm' ? 'son' : 'daughter'} of ${late ? 'the late ' : ''}${m.name} and ${w.name}, is born${place ? ` at ${placeName(state, place)}` : ''}.`, where: place, importance: 2, houses: [...new Set([house, w.house])] }, { actors: [id, w.id, ...(late ? [] : [m.id])], data: { mother: w.id, father: m.id, sex, ...(late ? { posthumous: true } : {}) }, cause: { type: 'rule', ref: 'family' } })];
}

/** The mother's risk in childbed (about one in fifty), unless the story keeps her. */
function childbed(state, w, place, seed) {
  if (fate(state, 'childbed', seed) >= FAMILY.CHILDBED || keptByStory(state, w)) return [];
  const card = fact(state, 'death', { title: `${w.name} is dead`, text: `${w.name}${w.title ? `, ${w.title},` : ''} has died in childbed, aged ${w.age}.`, where: place, importance: state.houses[w.house]?.lord === w.id ? 4 : 3, houses: [w.house] }, { actors: [w.id], data: { cause: 'childbed' }, cause: { type: 'rule', ref: 'family' } });
  applyChanges(state, [{ op: 'character', id: w.id, alive: false, cause: 'childbed' }], { source: 'The household', spanDays: 1, told: ['character'] });
  return [card];
}

// ── the unwed, matched ───────────────────────────────────────────────────────────────────────────────────────────────────

/** A person a house may find a match for: free, grown, unwed or widowed, of a house, and of no calling that forbids it. */
function unwed(state, c, spared, age = FAMILY.MARRY_AGE) {
  if (!aliveFree(c) || !(c.age >= age) || c.betrothed || c.house === state.meta.player || c.house === 'nights_watch') return false;
  if (!(c.roles || []).some((r) => MATCHABLE.has(r)) || (c.roles || []).some((r) => NOT_WED.has(r)) || !isHouse(state.houses[c.house]) || kept(state, c, spared)) return false;
  return !c.spouse || !state.characters[c.spouse]?.alive;
}
const closeKin = (a, b) => (a.father && a.father === b.father) || (a.mother && a.mother === b.mother) || a.id === b.father || a.id === b.mother || b.id === a.father || b.id === a.mother;
function atWar(state, x, y) {
  return (state.wars || []).some((w) => w.status !== 'ended' && ((w.attackers || []).includes(x) && (w.defenders || []).includes(y) || (w.attackers || []).includes(y) && (w.defenders || []).includes(x)));
}
const seatPos = (state, id) => state.holdings?.[state.houses[id]?.seat]?.pos || null;

/** How well two unwed would suit their houses: near each other, friends, of like rank; null when the match cannot be made. */
export function suitability(state, a, b) {
  if (isFemale(a) === isFemale(b) || a.house === b.house || closeKin(a, b) || Math.abs(a.age - b.age) > FAMILY.AGE_GAP) return null;
  const ha = state.houses[a.house], hb = state.houses[b.house];
  if (Math.abs(TIER[ha.rank] - TIER[hb.rank]) > 1 || atWar(state, ha.id, hb.id) || getRelation(state, ha.id, hb.id) < -10) return null;
  const pa = seatPos(state, ha.id), pb = seatPos(state, hb.id);
  const miles = pa && pb ? Math.hypot(pa[0] - pb[0], pa[1] - pb[1]) : 400; // (map units)
  if (miles > 700) return null;
  return 2 - miles / 350 + getRelation(state, ha.id, hb.id) / 50 + (ha.liege === hb.id || hb.liege === ha.id ? 0.8 : 0);
}

function chooseMate(state, a, singles, week) {
  const fit = singles.map((b) => [b, suitability(state, a, b)]).filter(([, s]) => s != null).sort((x, y) => y[1] - x[1] || (x[0].id < y[0].id ? -1 : 1));
  if (!fit.length) return null;
  const top = fit.slice(0, 3);
  return top[Math.floor(fate(state, 'mate', a.id, week) * top.length)][0];
}

/** The wedding is a day when both are of age, from the betrothal: the wait, or the sixteenth year of the younger. */
const wedDay = (state, a, b, today) => today + Math.max(between(FAMILY.WAIT, fate(state, 'wait', a.id, b.id)), Math.max(0, FAMILY.MARRY_AGE - Math.min(a.age, b.age)) * 360);

/** Promise two people to each other: each is `betrothed` to the other (the person's id, as the Matters and the windows read it), and `wedOn` is the day the wedding falls due. Returns that day. */
export function bind(state, a, b, today) {
  const wed = wedDay(state, a, b, today);
  a.betrothed = b.id; b.betrothed = a.id; a.wedOn = b.wedOn = wed;
  return wed;
}

/** Whether a person may be promised in marriage: free, unwed (or widowed), unbetrothed, eight or more, of a house and of no calling that forbids it. */
export function betrothable(state, c) {
  return aliveFree(c) && !c.betrothed && (c.age ?? 0) >= FAMILY.BETROTH_AGE && (!c.spouse || !state.characters[c.spouse]?.alive)
    && !(c.roles || []).some((r) => NOT_WED.has(r)) && isHouse(state.houses[c.house]) && c.house !== 'nights_watch';
}

/** Why a house will not have this match, in words, or null: the two houses at war, cold to each other, or too far apart in rank. */
export function refusal(state, a, b) {
  const [ha, hb] = [state.houses[a.house], state.houses[b.house]]; if (!ha || !hb) return 'There is no house to treat with.';
  if (closeKin(a, b)) return `${a.name} and ${b.name} are too near in blood.`;
  if (atWar(state, ha.id, hb.id)) return `${houseLabel(state, hb.id)} will not hear of it: the houses are at war.`;
  if (getRelation(state, ha.id, hb.id) < -20) return `${houseLabel(state, hb.id)} is too cold to ${houseLabel(state, ha.id)} to hear of a match.`;
  if (Math.abs(TIER[ha.rank] - TIER[hb.rank]) > 1) return `${houseLabel(state, TIER[hb.rank] > TIER[ha.rank] ? hb.id : ha.id)} is too far beneath the other for the match.`;
  if (Math.abs((a.age ?? 0) - (b.age ?? 0)) > FAMILY.AGE_GAP + 3) return `The years between ${a.name} and ${b.name} are too many for ${houseLabel(state, hb.id)} to agree.`;
  return null;
}

/** Who might wed this person, the best match first (the order reader offers them): of one house if it is named; of a friendly house near, else. */
export function mates(state, c, { house = null, limit = 4 } = {}) {
  return Object.values(state.characters).filter((x) => x.id !== c.id && betrothable(state, x) && x.house !== c.house && (!house || x.house === house) && isFemale(x) !== isFemale(c) && Math.abs(x.age - c.age) <= FAMILY.AGE_GAP && !refusal(state, c, x))
    .map((x) => [x, suitability(state, c, x) ?? -9]).sort((p, q) => q[1] - p[1] || (p[0].id < q[0].id ? -1 : 1)).slice(0, limit).map(([x]) => x);
}

/** Betroth two people as their houses would: the promise, and its card. */
export function betroth(state, a, b, today, { by = 'their houses' } = {}) {
  const wed = bind(state, a, b, today);
  const place = placeOf(state, isFemale(a) ? b : a);
  return fact(state, 'betrothal', { title: `${a.name} is betrothed to ${b.name}`, text: `${a.name} of ${houseLabel(state, a.house)} is betrothed to ${b.name} of ${houseLabel(state, b.house)}, by ${by}.`, where: place, importance: 3, houses: [a.house, b.house] }, { actors: [a.id, b.id], data: { wed }, cause: { type: 'rule', ref: 'family' } });
}

function matches(state, spared, today) {
  const week = Math.floor(today / 7); const out = []; let made = 0;
  const singles = Object.values(state.characters).filter((c) => unwed(state, c, spared)).sort((x, y) => (x.id < y.id ? -1 : 1));
  for (const a of singles) {
    if (made >= FAMILY.MATCHES_A_WEEK) break;
    if (a.betrothed || fate(state, 'match', a.id, week) >= weekly(upTo(FAMILY.SINGLE, a.age))) continue;
    const b = chooseMate(state, a, singles.filter((x) => !x.betrothed), week); if (!b) continue;
    out.push(betroth(state, a, b, today)); made++;
  }
  return out;
}

// ── the wedding: the bride rides to her husband's hall ───────────────────────────────────────────────────────────────────

/** Who goes to whom: the bride to the groom's seat, unless she is the lord of her house (then he comes to hers). */
function whoGoes(state, a, b) {
  const [bride, groom] = isFemale(a) ? [a, b] : [b, a];
  return state.houses[bride.house]?.lord === bride.id && state.houses[groom.house]?.lord !== groom.id ? [groom, bride] : [bride, groom];
}

function wed(state, a, b) {
  const [goes, stays] = whoGoes(state, a, b);
  const [bride, groom] = isFemale(a) ? [a, b] : [b, a];
  const house = goes === bride ? groom.house : bride.house; const [brideHouse, groomHouse] = [bride.house, groom.house]; // (before she changes house)
  for (const x of [a, b]) { delete x.betrothed; delete x.wedOn; delete x.bridal; }
  const cause = { type: 'rule', ref: 'family' };
  applyChanges(state, [{ op: 'character', id: bride.id, spouse: groom.id }, { op: 'character', id: goes.id, house }], { source: 'The household', spanDays: 1, cause }); // (the wedding is told by the vow)
  // the match binds the houses: a marriage pact and a warmer word between them (the pact's own card, a second betrothal, is not told: the match was told when it was made)
  applyChanges(state, [{ op: 'relation', a: brideHouse, b: groomHouse, delta: 12 }, { op: 'pact', type: 'marriage', a: brideHouse, b: groomHouse, terms: `${bride.name} wed to ${groom.name}` }], { source: 'The household', spanDays: 1, cause, told: ['pact'] });
  return stays;
}

function weddings(state, today) {
  const done = new Set();
  for (const a of Object.values(state.characters)) {
    const b = a.betrothed && state.characters[a.betrothed];
    if (!b || done.has(a.id) || done.has(b.id)) continue;
    if (!a.alive || !b.alive) { for (const x of [a, b]) { delete x.betrothed; delete x.wedOn; delete x.bridal; } continue; } // (a betrothal ends with a death)
    if (a.wedOn == null) a.wedOn = b.wedOn = wedDay(state, a, b, today); // (a match made by an offer the lord accepted, or by an order: its wedding is as any other's)
    if (today < a.wedOn || held(a) || held(b)) continue;
    const [goes, stays] = whoGoes(state, a, b); const seat = state.houses[stays.house]?.seat || placeOf(state, stays);
    if (seat && placeOf(state, goes) === seat && placeOf(state, stays) === seat) { wed(state, a, b); done.add(a.id); done.add(b.id); continue; }
    if (!goes.bridal && seat) { goes.bridal = { to: seat, since: today }; sendHome(state, goes, seat); } // (she rides; the wedding is when she is there and he is)
  }
}

/**
 * One day of the families of the realm. Births are told daily; conceptions and matches are made on the realm's seventh days (so a jump stopped midweek has lived the same
 * days as one that ran on). `spared`: those a beat still to come names (shared/plots.js canonAhead). Returns { events }: the cards of the day.
 */
export function familyTick(state, { spared = new Set() } = {}) {
  const today = dayNumber(state.meta.date); const events = [];
  for (const w of Object.values(state.characters)) if (w.expecting && w.alive && w.expecting.due <= today && placeOf(state, w)) events.push(...bear(state, w, today));
  if (today % 7 !== 0) return { events };
  for (const [w, m] of mayConceive(state, spared, today)) if (fate(state, 'conceive', w.id, today) < weeklyOfMonthly(upTo(FAMILY.MONTHLY, w.age))) events.push(...conceive(state, w, m, today));
  events.push(...matches(state, spared, today));
  weddings(state, today);
  return { events };
}
