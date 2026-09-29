// Shared world logic used by both the server (simulation) and the browser (display).
import { HOUSES, EXTRA_HOLDINGS, PLACE_ALIASES } from '../../data/houses.js';
import { CHARACTERS } from '../../data/characters.js';
import { SCENARIOS } from '../../data/scenarios.js';
import { MATTER_IDS } from '../../data/matters.js';
import { JUNCTIONS, PLACE_NAMES, LAND, LAKES, MILES_PER_UNIT } from '../../data/geography.js';
import { MAP_VERSION, warpOld } from '../../data/warp.js';
import { ANCESTORS, PARENTS, SPOUSES, deriveSkills } from '../../data/families.js';
import { initEconomy, TAX_LEVELS, project } from './economy.js';
import { heirOf, isFemale, sexOf } from './people.js';
import { addReport, seedKnowledge, knowledgeOf } from '../engine/knowledge.js';
import { commandable } from './errands.js';
import { compileRule } from './rules.js';
import { MONTHS, dateStr, addDays, dayNumber, SPANS, spanOf } from '../engine/time.js';
import { random, seedState, newSeed, withRng } from '../engine/rng.js';
import { nextId } from '../engine/ids.js';
import { kindOf, settle, settleAll, isRef, idOf, ref, partyAt, partyOf, setLoc, joinParty, leaveParty, moveMembers, disband, forces, isForce } from '../engine/parties.js';
import { planRoute, paceOf, atSeaOn } from '../engine/movement.js';
import { bound, DOING } from '../engine/activity.js';
import { sameLand } from '../engine/geo.js';
import { toV3 } from '../engine/state/migrate.js';
import { settleWorld } from '../engine/state/settle.js';
import { emit } from '../engine/facts/log.js';

export const FIGURE_FIELDS = ['treasury', 'income', 'debt', 'levies', 'menAtArms', 'guard', 'ships', 'food'];
export const FIGURE_LABELS = {
  treasury: 'Treasury', income: 'Net income / moon', debt: 'Debt', levies: 'Levies (unraised)',
  menAtArms: 'Men-at-arms', guard: 'Household guard', ships: 'Warships', food: 'Food stores (months)',
};

const RANK_DEFAULTS = {
  crown: { treasury: 20000, income: 20000, debt: 0, levies: 15000, menAtArms: 1500, guard: 200, ships: 20, food: 12 },
  paramount: { treasury: 200000, income: 12000, debt: 0, levies: 12000, menAtArms: 1200, guard: 150, ships: 8, food: 18 },
  major: { treasury: 30000, income: 1800, debt: 0, levies: 3000, menAtArms: 400, guard: 60, ships: 2, food: 12 },
  minor: { treasury: 6000, income: 400, debt: 0, levies: 900, menAtArms: 100, guard: 25, ships: 0, food: 10 },
  city_state: { treasury: 500000, income: 30000, debt: 0, levies: 5000, menAtArms: 1500, guard: 200, ships: 40, food: 12 },
  order: { treasury: 1000, income: 100, debt: 0, levies: 0, menAtArms: 500, guard: 0, ships: 1, food: 12 },
  tribe: { treasury: 0, income: 0, debt: 0, levies: 10000, menAtArms: 0, guard: 0, ships: 0, food: 3 },
  exile: { treasury: 0, income: 0, debt: 0, levies: 0, menAtArms: 0, guard: 0, ships: 0, food: 0 },
  company: { treasury: 10000, income: 1000, debt: 0, levies: 0, menAtArms: 2000, guard: 0, ships: 0, food: 3 },
};

// Deterministic small variation so vassals don't all look identical
function jitter(id, v) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  const f = 0.75 + ((Math.abs(h) % 1000) / 1000) * 0.5;
  return Math.round((v * f) / 10) * 10;
}

export const slug = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

export function buildHoldings() {
  const holdings = {};
  for (const h of HOUSES) {
    if (h.landless || !h.seat) continue;
    holdings[h.id] = {
      id: h.id, name: h.seat.replace(/,.*$/, '').replace(/^The Red Keep$/, 'King\'s Landing'), fullName: h.seat,
      pos: [...h.pos], owner: h.id, seatOf: h.id, region: h.region,
      type: h.holdingType || (h.rank === 'paramount' || h.rank === 'crown' ? 'great_castle' : 'castle'),
      prosperity: 60, unrest: 10, garrison: null, status: 'normal', notes: [],
    };
  }
  holdings.baratheon.name = 'King\'s Landing';
  for (const h of Object.values(holdings)) h.coastal = isCoastal(h.pos);
  for (const [id, name, x, y, owner, type] of EXTRA_HOLDINGS) {
    const region = HOUSES.find((h) => h.id === owner)?.region || 'unknown';
    holdings[id] = { id, name, fullName: name, pos: [x, y], owner, seatOf: null, region, type, prosperity: 50, unrest: 10, garrison: null, status: 'normal', notes: [] };
  }
  return holdings;
}

function segD(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
  return Math.hypot(ax + t * dx - px, ay + t * dy - py);
}
const HOLDING_TYPES = ['castle', 'great_castle', 'city', 'town', 'camp', 'fortress', 'ruin', 'palace'];
const inPoly = ([x, y], pts) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
export function isLand(p) { return LAND.some((l) => inPoly(p, l.pts)) && !LAKES.some((l) => inPoly(p, l.pts)); }
/** A dry spot at about `dist` units from `p` (or `p` itself), searching outward. */
export function landNear(p, dist = 0) {
  const a0 = random() * Math.PI * 2;
  for (let r = dist; r < dist + 40; r += 2) for (let k = 0; k < 12; k++) { const a = a0 + (k / 12) * Math.PI * 2; const q = r ? [Math.round(p[0] + Math.cos(a) * r), Math.round(p[1] + Math.sin(a) * r)] : [Math.round(p[0]), Math.round(p[1])]; if (isLand(q)) return q; if (!r) break; }
  return null;
}
export function isCoastal([x, y]) {
  for (const lm of LAND) {
    const p = lm.pts;
    for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; if (Math.abs(a[0] - x) > 40 && Math.abs(b[0] - x) > 40) continue; if (segD(x, y, a[0], a[1], b[0], b[1]) < 14) return true; }
  }
  return false;
}

export function createInitialState(scenarioId, playerHouse, { seed = newSeed() } = {}) {
  // the world is made with the new game's own dice, so a seed always makes the same world
  const dice = { meta: { seed, rngState: seedState(seed) } };
  const state = withRng(dice, () => buildInitialState(scenarioId, playerHouse, seed));
  state.meta.rngState = dice.meta.rngState;
  return state;
}
function buildInitialState(scenarioId, playerHouse, seed) {
  const sc = SCENARIOS[scenarioId];
  if (!sc) throw new Error('Unknown scenario ' + scenarioId);
  const houses = {};
  for (const h of HOUSES) {
    const base = RANK_DEFAULTS[h.rank] || RANK_DEFAULTS.minor;
    const ov = sc.figures[h.id] || {};
    const figures = {};
    for (const f of FIGURE_FIELDS) {
      const v = ov[f] !== undefined ? ov[f] : (f === 'food' || f === 'ships' || f === 'debt' ? base[f] : jitter(h.id + f, base[f]));
      figures[f] = { v, asOf: dateStr(sc.date), src: 'Maester\'s estimate', confidence: 'rough' };
    }
    houses[h.id] = {
      id: h.id, name: h.name, liege: h.liege, region: h.region, rank: h.rank, color: h.color, sigil: h.sigil,
      words: h.words, seat: h.landless ? null : h.id, title: h.title || '', realmName: h.realmName || null,
      landless: !!h.landless, figures, status: 'active', notes: [],
    };
  }
  const characters = {};
  for (const c of [...CHARACTERS, ...ANCESTORS]) {
    characters[c.id] = { ...c, loc: c.loc ? (isRef(c.loc) ? c.loc : resolvePlaceId(c.loc) || c.loc) : null, status: c.alive === false ? 'dead' : 'free', opinion: 0, loyalty: 60, memories: [] };
    characters[c.id].skills = deriveSkills(c);
    if (!characters[c.id].born && c.age != null) characters[c.id].born = sc.date.year - c.age;
  }
  for (const [child, [f, m]] of Object.entries(PARENTS)) {
    if (!characters[child]) continue;
    characters[child].father = characters[f] ? f : null; characters[child].mother = characters[m] ? m : null;
  }
  for (const [a, b] of SPOUSES) if (characters[a] && characters[b]) { characters[a].spouse = b; characters[b].spouse = a; }
  // Lords: first character with role lord/lady/ruler of a house
  for (const h of Object.values(houses)) {
    const lord = CHARACTERS.find((c) => c.house === h.id && (c.roles.includes('lord') || c.roles.includes('ruler') || c.roles.includes('lady')) && !(c.id === 'catelyn_stark' || c.id === 'cersei_lannister'));
    h.lord = lord ? lord.id : null;
  }
  // Every house needs a head. Where the books name none, raise a plausible lord.
  for (const h of Object.values(houses)) {
    if (h.lord || h.rank === 'company') continue;
    const c = generateLord(h, sc.date.year);
    characters[c.id] = c; h.lord = c.id;
  }
  houses.baratheon_se.lord = 'renly_baratheon';
  houses.golden_company.lord = 'harry_strickland';
  houses.arryn.lord = 'robert_arryn';
  houses.arryn.regent = 'lysa_arryn';

  const holdings = buildHoldings();
  const parties = {};
  for (const a of sc.parties) {
    const at = a.at ? resolvePlaceId(a.at) : null; // a party may start at sea (the Silence), where it has only a position
    parties[a.id] = { ...a, kind: kindOf(a), at, pos: placePos(at, holdings) || a.pos || [0, 0], members: [...(a.members || [])], morale: 70, supply: 80, asOf: dateStr(sc.date) };
  }
  const relations = {};
  for (const [a, b, v] of sc.relations) relations[relKey(a, b)] = { v, note: '' };

  const state = {
    version: 3,
    meta: {
      scenario: sc.id, scenarioName: sc.name, player: playerHouse, date: { ...sc.date }, turn: 0, mapVersion: MAP_VERSION,
      created: new Date().toISOString(), // lint-allow: when the chronicle was begun, not a roll of the dice
      seed, rngState: seedState(seed), seq: 0, // the save's own dice (engine/rng.js) and id counter (engine/ids.js)
    },
    houses, characters, holdings, parties, relations,
    wars: structuredClone(sc.wars), pacts: structuredClone(sc.pacts),
    ravens: [],       // incoming letters for the player
    orders: [],       // pending player orders (free-text)
    history: [],      // per-turn records {turn, date, span, orders, summary, events}
    chats: {},        // characterId -> [{role, text, date}]
    chronicle: [],    // consolidated long-term memory entries {date, text}
    consolidatedThrough: 0,
  };
  initEconomy(state);
  // Starting "income" is the steward's projection, not a guess
  for (const h of Object.values(state.houses)) {
    const pr = project(state, h.id);
    if (pr) h.figures.income = { ...h.figures.income, v: Math.round((pr.low + pr.high) / 2) };
  }
  settleWorld(state);
  seedKnowledge(state); // what every lord knows at the start: where the realm's hosts and fleets were last heard of
  return state;
}

/** Bring older saves up to date with new world features. */
export function migrateState(state) {
  toV3(state); // armies → parties, with kinds, members and engine states (engine/state/migrate.js)
  // saves from before the dice were the save's own: a seed from the save's own name for the game, so it stays fixed
  if (!Array.isArray(state.meta.rngState)) { let h = 2166136261; for (const ch of `${state.meta.created}|${state.meta.player}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } state.meta.seed = h >>> 0; state.meta.rngState = seedState(state.meta.seed); }
  if (state.meta.seq == null) state.meta.seq = 0;
  // every character has a sex (older saves had `gender`, or nothing): the data knows the canon ones
  for (const c of Object.values(state.characters || {})) if (!c.sex) c.sex = SEX_OF.get(c.id) || sexOf(c);
  // the King's progress keeps to its road in older saves too (the story may not redirect it)
  if (state.parties?.royal_progress && !state.parties.royal_progress.canonLock) state.parties.royal_progress.canonLock = 'kings_ride';
  // Saves from the first, hand-drawn map: carry every position onto the atlas
  if ((state.meta.mapVersion || 1) < MAP_VERSION) {
    const canon = new Map([...HOUSES.filter((h) => h.seat && !h.landless).map((h) => [h.id, h.pos]), ...EXTRA_HOLDINGS.map((e) => [e[0], [e[2], e[3]]])]);
    for (const h of Object.values(state.holdings)) h.pos = canon.has(h.id) ? [...canon.get(h.id)] : warpOld(h.pos);
    for (const h of Object.values(state.holdings)) h.coastal = isCoastal(h.pos);
    for (const h of Object.values(state.houses)) if (canon.has(h.id)) h.pos = [...canon.get(h.id)]; else if (h.pos) h.pos = warpOld(h.pos);
    for (const a of Object.values(state.parties)) {
      a.pos = a.at && state.holdings[a.at] ? [...state.holdings[a.at].pos] : warpOld(a.pos);
      if (a.dest) a.dest = a.march && state.holdings[a.march.to] ? [...state.holdings[a.march.to].pos] : warpOld(a.dest);
    }
    for (const b of state.battles || []) if (b.pos) b.pos = warpOld(b.pos);
    state.meta.mapVersion = MAP_VERSION;
  }
  registerPlaces(state);
  for (const h of Object.values(state.houses)) {
    if (!h.lord && h.rank !== 'company') { const c = generateLord(h, state.meta.date.year); if (!state.characters[c.id]) state.characters[c.id] = c; h.lord = c.id; }
  }
  if (state.houses.golden_company && !state.houses.golden_company.lord) state.houses.golden_company.lord = 'harry_strickland';
  // the player's reports and spies (`state.intel` before WP B9) are the house's knowledge now; saves from before the fog
  // of war begin with what everyone knows
  if (state.intel) { const k = knowledgeOf(state); Object.assign(k.parties, state.intel.parties || {}); Object.assign(k.spies, state.intel.spies || {}); delete state.intel; }
  if (!state.knowledge?.[state.meta.player]) seedKnowledge(state);
  return state;
}

const NAME_POOLS = {
  north: ['Brandon', 'Rickard', 'Torrhen', 'Cregan', 'Edwyle', 'Harrion', 'Artos', 'Donnor', 'Wyllis', 'Jonnel', 'Medger', 'Rodwell', 'Lyessa', 'Alys', 'Sarra', 'Wynafryd'],
  wall: ['Othell', 'Donal', 'Bowen', 'Jarmen'], beyond: ['Harma', 'Varamyr', 'Rattleshirt', 'Soren', 'Morna'],
  iron_islands: ['Dagon', 'Harren', 'Torwold', 'Gorold', 'Baelor', 'Sawane', 'Lucimore', 'Alyn', 'Gysella', 'Hotho', 'Rodrik', 'Tristifer'],
  riverlands: ['Tristan', 'Lucas', 'Hoster', 'Elmo', 'Jonos', 'Theomar', 'Clement', 'Hugo', 'Lymond', 'Tytos', 'Bethany', 'Jeyne'],
  vale: ['Eon', 'Andar', 'Jon', 'Symond', 'Gerold', 'Alester', 'Harlan', 'Robar', 'Morton', 'Belore', 'Ysilla', 'Mya'],
  westerlands: ['Lyman', 'Tybolt', 'Damon', 'Quenten', 'Lewys', 'Humfrey', 'Regenard', 'Antario', 'Melwyn', 'Cerenna', 'Myranda', 'Lanna'],
  crownlands: ['Gyles', 'Denys', 'Lucifer', 'Bartimos', 'Guncer', 'Tanda', 'Symon', 'Ardrian', 'Monford', 'Falyse', 'Renfred', 'Duram'],
  reach: ['Leo', 'Tanton', 'Alekyne', 'Arthor', 'Humfrey', 'Titus', 'Orton', 'Lyonel', 'Ormund', 'Moryn', 'Leonette', 'Rhonda'],
  stormlands: ['Ormund', 'Lester', 'Bryce', 'Arstan', 'Guyard', 'Harwood', 'Hubert', 'Dickon', 'Lomas', 'Ronnet', 'Sharna', 'Ellyn'],
  dorne: ['Harmen', 'Deziel', 'Franklyn', 'Dagos', 'Myles', 'Edgar', 'Garibald', 'Andrey', 'Quentyn', 'Larra', 'Nymella', 'Arron'],
  essos: ['Tycho', 'Malaquo', 'Doniphos', 'Nyessos', 'Samarro', 'Horonno', 'Ferrego', 'Illyrio', 'Belicho', 'Doran', 'Tregar', 'Alequo'],
};
const TRAIT_POOL = ['ambitious', 'cautious', 'proud', 'honorable', 'greedy', 'pious', 'jovial', 'cruel', 'shrewd', 'loyal', 'craven', 'brave', 'stubborn', 'generous', 'wrathful', 'patient', 'scheming', 'just', 'lazy', 'diligent'];
// `salt` makes another man of the same house: the lord raised at the start is seeded on the house alone (salt ''), a
// cousin who claims the seat later on the house and the turn he does (resolveSuccessions), so he is not his clone
function generateLord(h, year, salt = '') {
  let seed = 0; for (const ch of h.id + salt) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  // seeds one letter apart give first draws almost alike: stir a salted seed before it picks a name
  if (salt) { seed = Math.imul(seed ^ (seed >>> 15), 2246822519) >>> 0; seed = Math.imul(seed ^ (seed >>> 13), 3266489917) >>> 0; seed = (seed ^ (seed >>> 16)) >>> 0; for (let k = 0; k < 4; k++) rnd(); }
  const pool = NAME_POOLS[h.region] || NAME_POOLS.reach;
  const first = pool[Math.floor(rnd() * pool.length)];
  const female = /^(Lyessa|Alys|Sarra|Wynafryd|Harma|Morna|Gysella|Bethany|Jeyne|Ysilla|Mya|Cerenna|Myranda|Lanna|Tanda|Falyse|Leonette|Rhonda|Sharna|Ellyn|Larra|Nymella|Belore)$/.test(first);
  const essos = h.region === 'essos';
  const surname = h.name.replace(/ of .*$/, '').replace(/^Nymeros /, '');
  const age = 22 + Math.floor(rnd() * 44);
  const OPP = { lazy: 'diligent', diligent: 'lazy', craven: 'brave', brave: 'craven', cruel: 'just', just: 'cruel', greedy: 'generous', generous: 'greedy', patient: 'wrathful', wrathful: 'patient', honorable: 'scheming', scheming: 'honorable' };
  const picked = [];
  for (let k = 0; k < 6 && picked.length < 3; k++) { const t = TRAIT_POOL[Math.floor(rnd() * TRAIT_POOL.length)]; if (!picked.includes(t) && !picked.includes(OPP[t])) picked.push(t); }
  const traits = picked.join(', ');
  const seatName = (HOUSES.find((x) => x.id === h.id)?.seat || h.name).replace(/,.*$/, '');
  const title = essos ? (h.title || `First Magister of ${h.name}`) : `${female ? 'Lady' : 'Lord'} of ${seatName}`;
  const id = slug(`${first}_${essos ? h.id : surname}`);
  return {
    id, name: essos ? `${first} of ${h.name}` : `${first} ${surname}`, house: h.id, title, age, born: year - age, loc: h.id,
    roles: essos ? ['ruler'] : [female ? 'lady' : 'lord'], traits, bio: `Head of House ${h.name}.`, alive: true, status: 'free', opinion: 0, loyalty: 50 + Math.floor(rnd() * 40), memories: [], generated: true, sex: female ? 'f' : 'm',
    skills: deriveSkills({ roles: ['lord'], traits, age }),
  };
}

// A new member of a house (a younger child or grandchild of the lord) — for marriages and wards
const FEMALE_NAMES = { north: ['Wylla', 'Lyessa', 'Alys', 'Sarra', 'Jonelle'], riverlands: ['Bethany', 'Jeyne', 'Roslin', 'Minisa'], vale: ['Ysilla', 'Mya', 'Myranda', 'Jeyne'], westerlands: ['Cerenna', 'Myranda', 'Lanna', 'Joanna'], reach: ['Leonette', 'Rhonda', 'Alerie', 'Merry'], stormlands: ['Sharna', 'Ellyn', 'Cassana', 'Argella'], dorne: ['Larra', 'Nymella', 'Ynys', 'Mellario'], crownlands: ['Falyse', 'Tanda', 'Lollys', 'Alys'], iron_islands: ['Gysella', 'Sawane', 'Esgred', 'Alannys'] };
export function generateKin(state, houseId, { female = false, age = 14 } = {}) {
  const h = state.houses[houseId]; if (!h) return null;
  const region = state.holdings[h.seat]?.region || h.region || 'reach';
  const pool = female ? (FEMALE_NAMES[region] || FEMALE_NAMES.reach) : (NAME_POOLS[region] || NAME_POOLS.reach).filter((n) => !/^(Lyessa|Alys|Sarra|Wynafryd|Harma|Morna|Gysella|Bethany|Jeyne|Ysilla|Mya|Cerenna|Myranda|Lanna|Tanda|Falyse|Leonette|Rhonda|Sharna|Ellyn|Larra|Nymella|Belore)$/.test(n));
  const surname = h.name.replace(/ of .*$/, '').replace(/^Nymeros /, '');
  let first = pool[Math.floor(random() * pool.length)], id = slug(`${first}_${surname}`), n = 2;
  while (state.characters[id]) id = slug(`${first}_${surname}_${n++}`);
  const lord = state.characters[h.lord];
  const traits = [TRAIT_POOL[Math.floor(random() * TRAIT_POOL.length)]].join(', ');
  const year = state.meta?.date?.year || 298;
  const c = { id, name: `${first} ${surname}`, house: houseId, title: '', age, born: year - age, loc: h.seat || houseId, roles: ['family'], traits, bio: `${female ? 'Daughter' : 'Son'} of House ${h.name}${lord ? `, kin to ${lord.name}` : ''}.`, alive: true, status: 'free', opinion: 0, loyalty: 60, memories: [], generated: true, sex: female ? 'f' : 'm', skills: deriveSkills({ roles: ['family'], traits, age }) };
  if (lord && lord.age - age >= 16) c[isFemale(lord) ? 'mother' : 'father'] = lord.id;
  state.characters[id] = c;
  return c;
}

export function childrenOf(state, id) {
  return Object.values(state.characters).filter((c) => c.father === id || c.mother === id).sort((a, b) => (a.born || 0) - (b.born || 0));
}
export function siblingsOf(state, id) {
  const c = state.characters[id]; if (!c) return [];
  return Object.values(state.characters).filter((x) => x.id !== id && ((c.father && x.father === c.father) || (c.mother && x.mother === c.mother)));
}

export const relKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
export function getRelation(state, a, b) { return state.relations[relKey(a, b)]?.v ?? 0; }

// Holdings founded or renamed during play (by the story or the player), so names resolve like the built-in ones
const DYNAMIC = new Map();
export function registerPlaces(state) {
  DYNAMIC.clear();
  for (const h of Object.values(state.holdings || {})) {
    DYNAMIC.set(h.id, h.id); DYNAMIC.set(slug(h.name), h.id); DYNAMIC.set(slug(h.name).replace(/^the_/, ''), h.id);
    for (const n of h.formerNames || []) if (!DYNAMIC.has(slug(n))) DYNAMIC.set(slug(n), h.id);
  }
}
export function resolvePlaceId(id) {
  if (!id) return null;
  if (Array.isArray(id)) return null;
  const s = slug(id);
  if (DYNAMIC.has(s) && !HOUSE_IDS.has(s) && !PLACE_ALIASES[s]) return DYNAMIC.get(s);
  if (HOUSE_IDS.has(s) && !LANDLESS.has(s)) return s;
  if (EXTRA_IDS.has(s)) return s;
  if (PLACE_ALIASES[s]) return PLACE_ALIASES[s];
  const s2 = s.replace(/^the_/, '');
  if (PLACE_ALIASES[s2]) return PLACE_ALIASES[s2];
  if (HOUSE_IDS.has(s2) && !LANDLESS.has(s2)) return s2;
  // Match by holding name
  const byName = NAME_INDEX.get(s) || NAME_INDEX.get(s2);
  if (byName) return byName;
  // Named places that are not holdings (inns, ruins, villages); a place standing on a holding is that holding
  const pl = JUNCTIONS[s] ? s : JUNCTIONS[s2] ? s2 : JUNCTIONS['the_' + s] ? 'the_' + s : null;
  if (pl) return HOLDING_AT.get(pl) || pl;
  return DYNAMIC.get(s) || DYNAMIC.get(s2) || null;
}

export function placePos(placeId, holdings) {
  if (!placeId) return null;
  if (holdings[placeId]) return [...holdings[placeId].pos];
  if (JUNCTIONS[placeId]) return [...JUNCTIONS[placeId]];
  return null;
}

const HOUSE_IDS = new Set(HOUSES.map((h) => h.id));
const SEX_OF = new Map([...CHARACTERS, ...ANCESTORS].map((c) => [c.id, c.sex]));
const LANDLESS = new Set(HOUSES.filter((h) => h.landless).map((h) => h.id));
const EXTRA_IDS = new Set(EXTRA_HOLDINGS.map((e) => e[0]));
const NAME_INDEX = new Map();
for (const h of HOUSES) if (h.seat) {
  NAME_INDEX.set(slug(h.seat), h.id);
  NAME_INDEX.set(slug(h.seat.replace(/,.*$/, '')), h.id);
}
for (const e of EXTRA_HOLDINGS) NAME_INDEX.set(slug(e[1]), e[0]);
const HOLDING_AT = new Map();
{
  const seats = [...HOUSES.filter((h) => h.seat && !h.landless).map((h) => [h.id, h.pos]), ...EXTRA_HOLDINGS.map((e) => [e[0], [e[2], e[3]]])];
  for (const [pid, [x, y]] of Object.entries(JUNCTIONS)) { const hit = seats.find(([, p]) => Math.hypot(p[0] - x, p[1] - y) < 4); if (hit) HOLDING_AT.set(pid, hit[0]); }
}

// Realm: walk up the liege chain to the paramount (or top-level) house
export function realmOf(state, houseId) {
  let h = state.houses[houseId];
  let guard = 0;
  while (h && guard++ < 10) {
    if (!h.liege) return h.id;
    const lg = state.houses[h.liege];
    if (!lg) return h.id;
    if (h.rank === 'paramount' || h.rank === 'crown' || h.independent) return h.id;
    h = lg;
  }
  return houseId;
}

export function topLiege(state, houseId) {
  let h = state.houses[houseId];
  let guard = 0;
  while (h && h.liege && state.houses[h.liege] && guard++ < 10) h = state.houses[h.liege];
  return h ? h.id : houseId;
}

export function vassalsOf(state, houseId, deep = false, stopAtParamount = false) {
  const out = [];
  for (const h of Object.values(state.houses)) {
    if (h.liege === houseId) {
      if (stopAtParamount && (h.rank === 'paramount' || h.independent)) continue;
      out.push(h.id);
      if (deep) out.push(...vassalsOf(state, h.id, true, stopAtParamount));
    }
  }
  return out;
}

// A realm's own strength (a crown's totals don't include its paramounts' kingdoms)
export function realmTotals(state, houseId) {
  const ids = [houseId, ...vassalsOf(state, houseId, true, state.houses[houseId]?.rank === 'crown')];
  const tot = {};
  for (const f of FIGURE_FIELDS) tot[f] = ids.reduce((s, id) => s + (Number(state.houses[id]?.figures[f]?.v) || 0), 0);
  return tot;
}

// ---------- Calendar ---------- (engine/time.js; re-exported for the modules that import it from here)
export { MONTHS, dateStr, addDays, dayNumber, SPANS, spanOf };

// ---------- Applying simulation changes ----------
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const num = (v) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v.replace(/[,_]/g, ''))) ? Number(v.replace(/[,_]/g, '')) : null);

function findHouse(state, id) {
  if (!id) return null;
  const s = slug(id).replace(/^house_/, '').replace(/^the_/, '');
  if (state.houses[s]) return s;
  for (const h of Object.values(state.houses)) if (slug(h.name) === s || slug(h.name).replace(/^house_/, '') === s) return h.id;
  // Models often pluralise ("the Freys", "starks") or write "lannisters_of_casterly_rock"
  const sing = s.replace(/(ies)$/, 'y').replace(/s$/, '');
  if (sing !== s && state.houses[sing]) return sing;
  const head = s.split('_of_')[0];
  if (head !== s) return findHouse(state, head);
  return null;
}
export function findChar(state, id) {
  if (!id) return null;
  const s = slug(id);
  if (state.characters[s]) return s;
  for (const c of Object.values(state.characters)) if (slug(c.name) === s || slug(c.name.replace(/^ser_/i, '')) === s.replace(/^ser_/, '')) return c.id;
  return null;
}
function findArmy(state, id) {
  if (!id) return null;
  if (state.parties[id]) return id;
  const s = slug(id);
  if (state.parties[s]) return s;
  for (const a of Object.values(state.parties)) if (slug(a.name) === s) return a.id;
  // A house named as the army: fine when that house fields exactly one host
  const hid = findHouse(state, s);
  if (hid) { const own = Object.values(state.parties).filter((a) => a.owner === hid); if (own.length === 1) return own[0].id; }
  return null;
}
/**
 * A person goes back to `place` (home, a seat): set down at once when it is near, or when they are dead; otherwise
 * they ride, as a rider party. No one crosses the realm in a day.
 */
export function sendHome(state, c, place) {
  const here = charPos(state, c), there = placePos(place, state.holdings);
  if (!c.alive || !here || !there || Math.hypot(there[0] - here[0], there[1] - here[1]) * MILES_PER_UNIT < 30) { setLoc(state, c, place); return; }
  try { startRide(state, c, place); } catch { setLoc(state, c, place); } // no way at all: they find one
}
/** The ride a person makes on their own (a rider party they lead), if they are on the road. */
export const rideOf = (state, c) => { const p = partyOf(state, c); return p?.kind === 'rider' ? p : null; };
/** Where a rider is now: their party's place on its road. */
export const roadPos = (state, c) => rideOf(state, c)?.pos || null;
/**
 * Send a person riding to `dest` (a place, or `party:<id>` to join a host wherever it is) on their own: a rider party
 * led by them, turned round if they are already on the road, on a route planned now over land and, where the sea is in
 * the way, by ship (engine/movement.js). Throws, and leaves them where they were, when there is no way at all.
 */
export function startRide(state, c, dest) {
  const target = isRef(dest) ? partyAt(state, dest) : null;
  const to = target ? target.pos : placePos(dest, state.holdings); if (!to) throw new Error('unknown destination ' + dest);
  let p = rideOf(state, c); const fresh = !p; const was = c.loc;
  // a traveller aboard ship goes where the ship goes: the road can be changed once it makes port
  if (!fresh && p.route && atSeaOn(p.route, p.route.done)) throw new Error(`${c.name} is at sea, and can turn only when the ship makes port`);
  const before = fresh ? null : { march: p.march, route: p.route, at: p.at };
  if (fresh) {
    const from = charPos(state, c); if (!from) throw new Error(`${c.name}'s whereabouts are unknown`);
    let id = `rider_${c.id}`; while (state.parties[id]) id += '_2';
    p = state.parties[id] = { id, kind: 'rider', owner: c.house, name: c.name, commander: c.id, men: 0, at: null, pos: [...from], members: [], morale: 75, supply: 85, from: resolvePlaceId(c.loc) || (partyOf(state, c)?.at) || nearestHolding(state, from), asOf: dateStr(state.meta.date) };
    joinParty(state, c, p);
  }
  p.march = { to: target ? ref(target.id) : dest, since: state.meta.turn }; p.at = null;
  if (!planRoute(state, p, to, p.march.to, { toName: target ? target.name : placeName(state, dest) })) {
    if (fresh) { setLoc(state, c, was); delete state.parties[p.id]; } else Object.assign(p, before); // the old road stands
    throw new Error(`no road or sea lane leads there from where ${c.name} is`);
  }
  settle(state, p);
  return p;
}
export function charPos(state, c) {
  if (!c) return null;
  if (isRef(c.loc)) return partyAt(state, c.loc)?.pos || null;
  const pid = resolvePlaceId(c.loc); return pid ? placePos(pid, state.holdings) : null;
}
function posOf(state, place) {
  if (Array.isArray(place) && place.length === 2) return [num(place[0]) ?? 0, num(place[1]) ?? 0];
  const pid = resolvePlaceId(place);
  if (pid) return placePos(pid, state.holdings);
  const c = findChar(state, place);
  if (c) return posOf(state, state.characters[c].loc);
  const a = findArmy(state, place);
  if (a) return [...state.parties[a].pos];
  return null;
}

/**
 * Apply a list of structured changes proposed by the simulation.
 * Unknown references are rejected (reported back) instead of crashing the game.
 */
export function applyChanges(state, changes, ctx = {}) {
  registerPlaces(state);
  const applied = []; const rejected = [];
  const date = dateStr(state.meta.date);
  // houses that fought a battle in this same set of changes may lose men freely; others only by the season
  const battleHouses = new Set((Array.isArray(changes) ? changes : []).filter((c) => c && c.op === 'battle').flatMap((c) => [c.attacker, c.defender, c.victor].map((x) => findHouse(state, x)).filter(Boolean)));
  ctx = { ...ctx, battleHouses };
  const src = ctx.source || 'The simulation';
  const seen = new Set();
  for (const ch of Array.isArray(changes) ? changes : []) {
    // Small models sometimes loop and repeat a change verbatim; apply it once
    const key = JSON.stringify(ch);
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      const facts = [];
      const r = applyOne(state, ch, { date, src, ...ctx, facts });
      if (r) applied.push(facts.length ? { ...r, facts: facts.map((f) => f.id) } : r); else rejected.push({ change: ch, reason: 'no effect' });
    } catch (e) {
      rejected.push({ change: ch, reason: e.message });
    }
  }
  for (const note of resolveSuccessions(state)) applied.push(note);
  return { applied, rejected };
}

/** When a house's head dies (or vanishes), the heir takes the seat. The player plays on as the heir. */
export function resolveSuccessions(state) {
  const out = [];
  const date = dateStr(state.meta.date);
  for (const h of Object.values(state.houses)) {
    const lord = h.lord ? state.characters[h.lord] : null;
    if (lord && lord.alive) continue;
    if (!lord && h.rank === 'company') continue;
    const heir = heirOf(state, h.id, h.lord);
    let text;
    if (heir) {
      const prev = lord?.name || 'the late lord';
      h.lord = heir.id;
      if (heir.house !== h.id) heir.house = h.id;
      const seat = h.seat && state.holdings[h.seat] ? state.holdings[h.seat].name : h.name;
      const female = isFemale(heir);
      if (h.rank === 'crown') heir.title = `${female ? 'Queen' : 'King'} of the Andals and the First Men, ${female ? 'Lady' : 'Lord'} of the Seven Kingdoms`;
      else if (!/king|queen/i.test(heir.title || '')) heir.title = `${female ? 'Lady' : 'Lord'} of ${seat}`;
      heir.roles = [...new Set([...(heir.roles || []).filter((r) => r !== 'heir'), female ? 'lady' : 'lord'])];
      const chosen = { order: `the brothers choose ${heir.name} to succeed ${prev}`, company: `the company names ${heir.name} its captain after ${prev}`, tribe: `the free folk follow ${heir.name} now that ${prev} is gone` }[h.rank];
      text = chosen ? `SUCCESSION: ${chosen}` : `SUCCESSION: ${heir.name} succeeds ${prev} as head of House ${h.name}${(heir.age ?? 20) < 16 ? ` — a child of ${heir.age}; a regent will rule in all but name` : ''}`;
    } else {
      // a different man from the one who died — and from any other of the house — however many times the seat has failed
      const kin = Object.values(state.characters).filter((x) => x.house === h.id);
      let c = null;
      for (let k = 0; k < 24 && (!c || kin.some((x) => x.name === c.name) || c.age === lord?.age); k++) c = generateLord(h, state.meta.date.year, `#${state.meta.turn}${k ? '.' + k : ''}`);
      c.id = c.id + '_' + state.meta.turn;
      while (state.characters[c.id]) c.id += '_';
      const elected = h.rank === 'city_state';
      c.bio = elected ? `Chosen by the magisters of ${h.name} to rule after ${lord?.name || 'the last'}.` : `A cousin who claimed the seat of House ${h.name} when the main line failed.`;
      state.characters[c.id] = c; h.lord = c.id;
      text = elected ? `SUCCESSION: the magisters of ${h.name} choose ${c.name} to rule after ${lord?.name || 'the last'}` : `SUCCESSION: the main line of House ${h.name} has failed; a cousin, ${c.name}, claims the seat`;
    }
    state.chronicle.push({ date, text });
    // the fact falls on the day the old head died, if that was this turn
    const died = lord && (state.facts || []).findLast((f) => f.actors[0] === lord.id && ['death', 'slain_in_battle', 'executed'].includes(f.kind));
    const f = emit(state, 'succession', { actors: [h.lord, lord?.id], houses: [h.id], place: h.seat || null, title: `A new head of House ${h.name}`, text: text.replace(/^SUCCESSION: /, '').replace(/^./, (x) => x.toUpperCase()) + '.', importance: h.id === state.meta.player ? 5 : 4, data: { heir: h.lord, prev: lord?.id || null }, cause: { type: 'rule', ref: 'succession' }, ...(died ? { on: died.day - (state.meta.clock?.from ?? died.day) + 1, alongside: died.id } : {}) });
    out.push({ op: 'succession', text, house: h.id, fact: f.id });
  }
  return out;
}

function applyOne(state, ch, ctx) {
  const { date, src } = ctx;
  if (!ch || typeof ch !== 'object') throw new Error('not an object');
  const op = String(ch.op || ch.type || '').toLowerCase();
  // What the op changed, recorded as its fact (engine/facts/log.js), just before the op returns — unless whoever
  // proposed it has recorded it already in its own words (`ctx.told` lists such ops: a battle tells its own battle).
  const note = (kind, f) => {
    if (ctx.told?.includes(op)) return null;
    // `ctx.on`: the day of the turn the caller's changes happened; `ctx.alongside`: the fact they are part of (they move
    // with it when the turn dates it)
    const made = emit(state, kind, { cause: ctx.cause || { type: 'engine', ref: src }, ...(ctx.on != null ? { on: ctx.on } : {}), ...(ctx.alongside ? { alongside: ctx.alongside } : {}), ...f });
    ctx.facts?.push(made); return made;
  };
  const lordOf = (hid) => state.houses[hid]?.lord || null;
  switch (op) {
    case 'figure': case 'figures': case 'house_figure': {
      const hid = findHouse(state, ch.house); if (!hid) throw new Error('unknown house ' + ch.house);
      // the player's gold, men, levies and food are the engine's ledger: every dragon in or out has a line in it
      if (ctx.protectPlayer && hid === state.meta.player) throw new Error('your ledger is kept by the engine, not the story');
      const fields = ch.field ? { [ch.field]: ch } : ch.values || {};
      const out = [];
      for (const [field, spec] of Object.entries(fields)) {
        const f = FIGURE_FIELDS.find((x) => x.toLowerCase() === String(field).toLowerCase().replace(/[^a-z]/gi, '')) || FIGURE_FIELDS.find((x) => x.toLowerCase() === String(field).toLowerCase());
        if (!f) continue;
        const cur = state.houses[hid].figures[f];
        const s = typeof spec === 'object' ? spec : { value: spec };
        let v = num(s.value);
        const d = num(s.delta);
        if (v === null && d !== null) v = (Number(cur.v) || 0) + d;
        if (v === null) continue;
        v = Math.max(0, Math.round(v));
        // Physics of the realm: some numbers cannot jump
        const hh = state.houses[hid]; let capped = '';
        if (f === 'levies' && hh.levyCap) { const cap = Math.round(hh.levyCap * 1.3); if (v > cap) { v = cap; capped = ' (capped at what the land can bear)'; } }
        if ((f === 'menAtArms' || f === 'ships' || f === 'guard') && src !== 'Muster rolls') { const cap = Math.round((Number(cur.v) || 0) * 1.5 + ({ ships: 12, menAtArms: 400, guard: 60 }[f])); if (v > cap) { v = cap; capped = ' (capped: such growth takes time)'; } }
        // the story may not empty a lord's muster rolls or barracks at a stroke: only raising men (the engine) or
        // war does that. A reported fall is limited to a quarter in one turn (the model once set Bolton's 5,000 to 0).
        if (ctx.protectPlayer && (f === 'levies' || f === 'menAtArms') && v < (Number(cur.v) || 0) * 0.75) { v = Math.round((Number(cur.v) || 0) * 0.75); capped = ' (limited: men are not lost at a stroke without a battle)'; }
        const old = cur.v;
        state.houses[hid].figures[f] = { v, asOf: date, src: ch.source || src, confidence: ch.confidence || 'reported' };
        out.push(`${state.houses[hid].name} ${FIGURE_LABELS[f]}: ${fmt(old)} → ${fmt(v)}${capped}`);
      }
      return out.length ? { op, text: out.join('; ') } : null;
    }
    case 'relation': {
      const a = findHouse(state, ch.a), b = findHouse(state, ch.b);
      if (!a || !b || a === b) throw new Error('bad houses');
      const k = relKey(a, b); const cur = state.relations[k]?.v ?? 0;
      let v = num(ch.value); const d = num(ch.delta);
      if (v === null) v = cur + (d ?? 0);
      v = clamp(Math.round(v), -100, 100);
      state.relations[k] = { v, note: ch.reason || ch.note || state.relations[k]?.note || '' };
      return { op, text: `Relations ${state.houses[a].name}–${state.houses[b].name}: ${cur} → ${v}` };
    }
    case 'army_create': case 'fleet_create': case 'raise_army': {
      const owner = findHouse(state, ch.owner); if (!owner) throw new Error('unknown owner ' + ch.owner);
      if (ctx.protectPlayer && owner === state.meta.player) throw new Error('only you raise your men');
      const pos = posOf(state, ch.at || ch.location) || placePos(owner, state.holdings) || placePos(state.houses[owner].seat, state.holdings);
      if (!pos) throw new Error('no position');
      let id = slug(ch.id || ch.name || `${owner}_host`);
      while (state.parties[id]) id += '_2';
      const men = Math.max(0, Math.round(num(ch.men) ?? 0));
      state.parties[id] = {
        id, owner, name: ch.name || `Host of ${state.houses[owner].name}`, commander: findChar(state, ch.commander) || ch.commander || null,
        at: resolvePlaceId(ch.at || ch.location), pos, men, ships: num(ch.ships) ?? undefined,
        kind: op === 'fleet_create' || ch.type === 'fleet' || ch.kind === 'fleet' ? 'fleet' : 'host', composition: ch.composition || '',
        members: [], morale: num(ch.morale) ?? 70, supply: num(ch.supply) ?? 80, asOf: date,
      };
      settle(state, state.parties[id]);
      const made = state.parties[id];
      note('host_formed', { actors: [made.commander], houses: [owner], place: made.at, pos: made.pos, data: { party: id, men, kind: made.kind } });
      return { op, text: `${made.name} (${state.houses[owner].name}) ${men ? fmt(men) + ' men' : ''} appears at ${placeName(state, ch.at || ch.location) || 'the field'}` };
    }
    case 'army_march': case 'march': case 'fleet_sail': {
      // the story sends a host on its way; the engine walks it at its true pace, and the map shows the road
      const id = findArmy(state, ch.army || ch.id); if (!id) throw new Error('unknown army ' + (ch.army || ch.id));
      const a = state.parties[id];
      if (ctx.protectPlayer && (a.owner === state.meta.player || a.serving === state.meta.player)) throw new Error(`only you move ${a.name}`);
      // a party the great story depends on (the King's progress) keeps to its road; only the engine's beats turn it
      if (ctx.protectPlayer && a.canonLock) throw new Error(`${a.name} keeps to its road`);
      const foe = idOf(ch.to) ?? String(ch.to || ''); const target = state.parties[foe] || state.parties[findArmy(state, foe) || ''];
      if (target && target.id !== a.id) {
        a.march = { to: ref(target.id), since: state.meta.turn }; a.at = null; settle(state, a);
        note('set_out', { actors: [a.commander], houses: [a.owner, target.owner], pos: a.pos, data: { party: a.id, against: target.id }, text: `${a.name} marches against ${target.name}.` });
        return { op, text: `${a.name} marches against ${target.name}` };
      }
      const dest = resolvePlaceId(ch.to); if (!dest || !placePos(dest, state.holdings)) throw new Error('unknown destination ' + ch.to);
      if (a.at === dest) throw new Error(`${a.name} is already at ${placeName(state, dest)}`);
      a.march = { to: dest, since: state.meta.turn }; a.at = null; settle(state, a);
      note('set_out', { actors: [a.commander], houses: [a.owner], pos: a.pos, data: { party: a.id, to: dest } });
      return { op, text: `${a.name} marches for ${placeName(state, dest)}` };
    }
    case 'army_move': case 'fleet_move': case 'move_army': {
      const id = findArmy(state, ch.army || ch.id); if (!id) throw new Error('unknown army ' + (ch.army || ch.id));
      const a = state.parties[id];
      if (ctx.protectPlayer && (a.owner === state.meta.player || a.serving === state.meta.player) && !ctx.mayMove?.includes(a.commander)) throw new Error(`only you move ${a.name}`);
      if (ctx.protectPlayer && a.canonLock) throw new Error(`${a.name} keeps to its road`);
      const dest = posOf(state, ch.to);
      if (!dest) throw new Error('unknown destination ' + ch.to);
      // a host goes no faster for being written about: a short step (a camp nearby, a retreat to the next castle, two
      // days' march at most) is taken at once; anything farther is a march the engine walks at its pace (engine/movement.js)
      const place = resolvePlaceId(ch.to); const foe = !place && state.parties[findArmy(state, idOf(ch.to) ?? String(ch.to)) || ''];
      const miles = Math.hypot(dest[0] - a.pos[0], dest[1] - a.pos[1]) * MILES_PER_UNIT;
      if (miles <= 2 * paceOf(state, a) && (a.kind === 'fleet' || sameLand(a.pos, dest))) {
        a.pos = [...dest]; a.at = place || null; delete a.march; a.route = null; a.asOf = date; settle(state, a);
        note('arrived', { actors: [a.commander], houses: [a.owner], place: place || nearestHolding(state, dest), pos: a.pos, data: { party: a.id, men: a.men, step: true } });
        return { op, text: `${a.name} ${place ? 'moves to' : 'makes camp near'} ${placeName(state, place || nearestHolding(state, dest))}` };
      }
      if (!place && !foe) throw new Error('a host marches to a named place');
      a.march = { to: place || ref(foe.id), since: state.meta.turn }; a.at = null; a.asOf = date; settle(state, a);
      note('set_out', { actors: [a.commander], houses: [a.owner], pos: a.pos, data: { party: a.id, ...(place ? { to: place } : { against: foe.id }) }, ...(place ? {} : { text: `${a.name} marches against ${foe.name}.` }) });
      return { op, text: `${a.name} marches for ${place ? placeName(state, place) : foe.name}` };
    }
    // ── orders the engine carries out itself (so the player's commands really happen) ──
    case 'travel': case 'ride': case 'send_character': {
      const cid = findChar(state, ch.character || ch.id); if (!cid) throw new Error('unknown character ' + (ch.character || ch.id));
      const c = state.characters[cid]; if (!c.alive) throw new Error(`${c.name} is dead`);
      if (/imprisoned|captive/.test(c.status || '')) throw new Error(`${c.name} is a prisoner`);
      // the player's own people go where the player sends them, and nowhere else
      if (ctx.protectPlayer && c.house === state.meta.player && !ctx.mayMove?.includes(c.id)) throw new Error(`only you send ${c.name} anywhere`);
      const dest = resolvePlaceId(ch.to || ch.destination); const to = dest && placePos(dest, state.holdings);
      if (!to) throw new Error('unknown destination ' + (ch.to || ch.destination));
      const riding = rideOf(state, c);
      if (riding?.march?.to === dest) throw new Error(`${c.name} is already on the road to ${placeName(state, dest)}`);
      // one who leads a small company turns the whole company, rather than riding off and leaving it on the road
      const led = partyOf(state, c);
      if (led && !riding && led.commander === c.id && led.men < 400) {
        if (led.march?.to === dest || led.at === dest) throw new Error(`${c.name} is already bound for ${placeName(state, dest)}`);
        led.march = { to: dest, since: state.meta.turn }; led.at = null; settle(state, led);
        note('set_out', { actors: [c.id], houses: [c.house], pos: led.pos, data: { party: led.id, to: dest } });
        return { op, text: `${c.name} turns ${led.name} (${fmt(led.men)} men) for ${placeName(state, dest)}` };
      }
      if (!riding && resolvePlaceId(c.loc) === dest) throw new Error(`${c.name} is already at ${placeName(state, dest)}`);
      // one already on the road turns back from where they are now, not from where they set out
      const from = charPos(state, c); if (!from) throw new Error(`${c.name}'s whereabouts are unknown`);
      const men = Math.max(0, Math.round(num(ch.men) ?? 0));
      if (men >= 20) {
        // a party of men: taken from a host of the house where the character is, else from the household guard
        const here = (led && isForce(led) ? led : null) || forces(state).find((a) => a.owner === c.house && a.kind !== 'fleet' && (a.at === c.loc || Math.hypot(a.pos[0] - from[0], a.pos[1] - from[1]) < 6));
        const guard = state.houses[c.house]?.figures?.menAtArms;
        let taken = 0, src = '';
        if (here && here.men > men + 20) { here.men -= men; taken = men; src = `detached from ${here.name}`; }
        else if (here && here.men <= men + 20 && here.men > 0) { taken = here.men; src = `the whole of ${here.name}`; here.men = 0; }
        else if (guard && Number(guard.v) >= men) { guard.v = Number(guard.v) - men; taken = men; src = 'from the household guard'; }
        else if (guard && Number(guard.v) > 20) { taken = Number(guard.v); guard.v = 0; src = 'every man of the household guard'; }
        if (!taken) throw new Error(`no men to spare where ${c.name} is`);
        let id = slug(`${c.name.split(' ')[0]}_riders`); while (state.parties[id]) id += '_2';
        const origin = riding ? null : c.loc;
        const co = state.parties[id] = { id, kind: 'host', owner: c.house, name: ch.name || `${c.name.replace(/^Ser /, '')}'s company`, commander: c.id, at: null, pos: [...from], men: taken, composition: ch.composition || 'Household men-at-arms, mounted', members: [], morale: 75, supply: 85, asOf: date, march: { to: dest, since: state.meta.turn } };
        joinParty(state, c, co);
        // companions ride with the party: those at the same place (family, officers, wards)
        const comp = (Array.isArray(ch.companions) ? ch.companions : []).map((x) => state.characters[findChar(state, x)]).filter((x) => x && x.alive && x.id !== c.id && !/imprisoned|captive/.test(x.status || '') && origin && x.loc === origin);
        for (const x of comp) joinParty(state, x, co);
        // a host emptied to make the company is no more: its people go with the company
        if (here && here.men <= 0) { moveMembers(state, here, co); delete state.parties[here.id]; }
        planRoute(state, co, to, dest, { toName: placeName(state, dest) }); settle(state, co);
        note('set_out', { actors: [c.id, ...comp.map((x) => x.id)], houses: [c.house], pos: co.pos, data: { party: id, to: dest, men: taken, days: co.route ? Math.max(1, Math.ceil(co.route.days)) : undefined } });
        return { op, text: `${c.name} rides for ${placeName(state, dest)} with ${fmt(taken)} men (${src})${comp.length ? `, with ${comp.map((x) => x.name).join(', ')}` : ''}` };
      }
      const turning = riding ? ` (turning back from the road to ${placeName(state, riding.march?.to)})` : '';
      const p = startRide(state, c, dest);
      note('set_out', { actors: [c.id], houses: [c.house], pos: p.pos, data: { party: p.id, to: dest, days: Math.max(1, Math.ceil(p.route.days)), ...(riding ? { turned: true } : {}) } });
      return { op, text: `${c.name} sets out for ${placeName(state, dest)} (~${Math.max(1, Math.ceil(p.route.days))} days${p.route.sea ? ', part of it by ship' : '\' ride'})${turning}` };
    }
    case 'recruit': case 'hire_men': {
      const hid = findHouse(state, ch.house || ch.owner); if (!hid) throw new Error('unknown house');
      const place = resolvePlaceId(ch.at || ch.location) || state.houses[hid].seat; const pos = placePos(place, state.holdings);
      if (!pos) throw new Error('unknown place ' + (ch.at || ch.location));
      // one may hire only where one's people are: one's own lands, a host there, or someone of the house present
      const present = state.holdings[place]?.owner === hid || Object.values(state.parties).some((a) => a.owner === hid && (a.at === place || Math.hypot(a.pos[0] - pos[0], a.pos[1] - pos[1]) < 8))
        || Object.values(state.characters).some((c) => c.alive && c.house === hid && (c.loc === place || partyOf(state, c)?.at === place));
      if (!present) throw new Error(`House ${state.houses[hid].name} has no one at ${placeName(state, place)} to do the hiring`);
      const kind = /sell|free ?company|merc/i.test(ch.kind || '') ? 'sellswords' : 'men-at-arms';
      const price = kind === 'sellswords' ? 14 : 9; // dragons a head to arm and sign on
      const pop = Number(state.holdings[place]?.pop || state.holdings[place]?.population) || 20000;
      const cap = Math.max(50, Math.round(pop * 0.02));
      const t = state.houses[hid].figures.treasury = state.houses[hid].figures.treasury || { v: 0 };
      let men = Math.min(Math.round(num(ch.men) ?? 200), cap, Math.floor((Number(t.v) || 0) / price));
      if (men < 10) throw new Error(`not enough gold to hire men (${price} dragons a head)`);
      t.v = Math.round(Number(t.v) - men * price);
      let host = forces(state).find((a) => a.owner === hid && a.kind !== 'fleet' && (a.at === place || Math.hypot(a.pos[0] - pos[0], a.pos[1] - pos[1]) < 8));
      if (host) { host.men += men; host.composition = [host.composition, `${kind} hired at ${placeName(state, place)}`].filter(Boolean).join('; '); }
      else {
        let id = slug(`${state.houses[hid].name}_${placeName(state, place)}_company`); while (state.parties[id]) id += '_2';
        const lord = Object.values(state.characters).find((c) => c.alive && c.house === hid && (c.loc === place));
        host = state.parties[id] = { id, owner: hid, name: `The ${state.houses[hid].name} company at ${placeName(state, place)}`, commander: lord?.id || null, at: place, pos: [...pos], men, kind: 'garrison', members: [], composition: `${kind} hired at ${placeName(state, place)}`, morale: 65, supply: 80, asOf: date };
      }
      note(kind === 'sellswords' ? 'sellswords_hired' : 'men_hired', { actors: [host.commander], houses: [hid], place, pos, data: { party: host.id, men, cost: men * price }, text: `${fmt(men)} ${kind} are hired at ${placeName(state, place)} for House ${state.houses[hid].name}.` });
      return { op, text: `${fmt(men)} ${kind} hired at ${placeName(state, place)} for ${fmt(men * price)} dragons${men < (num(ch.men) ?? 200) ? ' (all that could be found or paid for)' : ''}; ${host.name} now ${fmt(host.men)}` };
    }
    case 'hire': case 'hire_officer': {
      const hid = findHouse(state, ch.house || ch.owner); if (!hid) throw new Error('unknown house');
      const ROLE = { spymaster: 'Master of whisperers', steward: 'Steward', maester: 'Maester', captain: 'Captain of the guard', master_at_arms: 'Master-at-arms', knight: 'Sworn sword', envoy: 'Envoy', commander: 'Commander' };
      const role = Object.keys(ROLE).find((r) => r === String(ch.role || '').toLowerCase().replace(/[^a-z_]/g, '_')) || (/spy|whisper/i.test(ch.role || '') ? 'spymaster' : /sword|guard|knight/i.test(ch.role || '') ? 'knight' : null);
      if (!role) throw new Error('unknown office ' + ch.role);
      const place = resolvePlaceId(ch.at || ch.location) || state.houses[hid].seat;
      const t = state.houses[hid].figures.treasury; const cost = role === 'spymaster' ? 600 : role === 'maester' ? 400 : 250;
      if (!t || Number(t.v) < cost) throw new Error(`not enough gold (${cost} dragons)`);
      t.v = Number(t.v) - cost;
      const c = generateKin(state, hid, { female: role === 'spymaster' && random() < 0.3, age: 25 + Math.floor(random() * 25) });
      // officers are hired men, not kin: a common name and a byname, never the house's own
      const BYNAMES = { spymaster: ['the Quiet', 'Softfoot', 'of the Street of Silk', 'Longfingers', 'the Grey'], steward: ['the Careful', 'of the Counting House', 'Inkfingers'], maester: [], captain: ['the Hard', 'Hardhand', 'of the Guard'], master_at_arms: ['Ironarm', 'the Old Bull'], knight: ['the Bold', 'of the Kingswood', 'Blackshield'], envoy: ['Silvertongue', 'the Fair'], commander: ['the Grim', 'Oakheart'] };
      const first = c.name.split(' ')[0]; const by = BYNAMES[role] || [];
      c.name = ch.name ? String(ch.name).slice(0, 60) : role === 'maester' ? `Maester ${first}` : role === 'knight' ? `Ser ${first} ${by[Math.floor(random() * by.length)] || ''}`.trim() : `${first} ${by[Math.floor(random() * by.length)] || ''}`.trim();
      const nid = slug(c.name); if (!state.characters[nid]) { delete state.characters[c.id]; c.id = nid; state.characters[nid] = c; }
      c.roles = [role, ...(role === 'knight' ? [] : [])]; c.title = `${ROLE[role]} of House ${state.houses[hid].name}`;
      c.bio = ch.bio || `Taken into service at ${placeName(state, place)}.`; c.loc = place; c.loyalty = 55; c.father = undefined; c.mother = undefined;
      if (role === 'spymaster') c.traits = 'discreet, watchful, well-connected';
      note('office_granted', { actors: [c.id, lordOf(hid)], houses: [hid], place, data: { office: role, hired: true }, text: `${c.name} enters the service of House ${state.houses[hid].name} as ${ROLE[role]}.` });
      return { op, text: `${c.name} enters the service of House ${state.houses[hid].name} as ${ROLE[role]} at ${placeName(state, place)} (${cost} dragons)` };
    }
    case 'army_update': case 'fleet_update': {
      const id = findArmy(state, ch.army || ch.id); if (!id) throw new Error('unknown army ' + (ch.army || ch.id));
      const a = state.parties[id]; const out = [];
      // the player's hosts are the player's and the engine's: the story may not count, move or re-label them
      if (ctx.protectPlayer && commandable(state, a)) throw new Error(`only you and the engine change ${a.name}`);
      if (ctx.protectPlayer && a.canonLock) throw new Error(`${a.name} is the engine's to move and count`);
      const men = num(ch.men), d = num(ch.delta);
      if (men !== null || d !== null) {
        const old = a.men; let nv = Math.max(0, Math.round(men ?? a.men + d));
        // Physics of the realm: without a battle, siege, ambush, plague or wreck a host loses men only to
        // desertion, sickness and weather: ~2% a moon in summer, 4% in autumn, 8% in winter.
        const violent = ctx.battleHouses?.has(a.owner) || /battle|siege|storm(ed|ing)|ambush|assault|slaughter|massacre|plague|pox|flux|shipwreck|wreck|drown|sack/i.test(`${ch.cause || ''} ${ch.reason || ''} ${ch.note || ''} ${ch.status || ''}`);
        // the player's own men are not whittled away by the story: they fall in battle, on the road, or not at all
        if (nv < old && !violent && ctx.protectPlayer && commandable(state, a)) throw new Error(`${a.name} loses no men without a cause the engine can see`);
        if (nv < old && !violent && a.kind !== 'fleet' && ctx.source !== 'Your decision') {
          const season = state.world?.season || 'summer';
          const rate = ({ summer: 0.02, spring: 0.025, autumn: 0.04, winter: 0.08 })[season] ?? 0.03;
          const months = Math.max(1, (ctx.spanDays || 30) / 30);
          const floor = Math.round(old * (1 - Math.min(0.5, rate * months * (a.state === 'marching' ? 1.5 : 1))));
          if (nv < floor) { nv = floor; out.push(`(losses limited: no battle, ${season})`); }
        }
        a.men = nv; out.push(`men ${fmt(old)} → ${fmt(a.men)}`);
        // men lost to a battle, siege or ambush are that fight's fact; men who melt away are their own
        if (nv < old && !violent && nv > 0) note('desertion', { actors: [a.commander], houses: [a.owner], pos: a.pos, data: { party: a.id, lost: old - nv, men: nv }, text: `${fmt(old - nv)} men slip away from ${a.name}${ch.cause || ch.reason ? ` — ${ch.cause || ch.reason}` : ''}.` });
      }
      if (num(ch.ships) !== null) { a.ships = num(ch.ships); out.push(`ships ${a.ships}`); }
      for (const k of ['morale', 'supply']) if (num(ch[k]) !== null) { a[k] = clamp(num(ch[k]), 0, 100); out.push(`${k} ${a[k]}`); }
      // what a host is doing is the engine's to say (engine/parties.js settle): the story's status words are not kept (B-20)
      // a host is never handed to a name the world does not know: an unresolvable commander is refused, not stored
      if (ch.commander) { const cm = findChar(state, ch.commander); if (!cm) throw new Error('unknown commander ' + ch.commander); if (!state.characters[cm].alive) throw new Error(`${state.characters[cm].name} is dead and cannot command`); if (a.commander !== cm) note('office_granted', { actors: [cm], houses: [a.owner], pos: a.pos, data: { party: a.id, office: 'command' }, text: `${state.characters[cm].name} takes command of ${a.name}.` }); a.commander = cm; out.push(`${state.characters[cm].name} takes command`); }
      if (ch.owner) { const o = findHouse(state, ch.owner); if (o && o !== a.owner) { note('sellswords_turned', { actors: [a.commander], houses: [a.owner, o], pos: a.pos, data: { party: a.id, from: a.owner, to: o }, text: `${a.name} goes over to House ${state.houses[o].name}.` }); a.owner = o; out.push('changes allegiance to ' + state.houses[o].name); } }
      if (ch.name) a.name = ch.name;
      if (ch.composition) a.composition = ch.composition;
      a.asOf = date;
      if (a.men <= 0 && a.kind !== 'fleet') {
        note('host_disbanded', { actors: [a.commander], houses: [a.owner], pos: a.pos, data: { party: a.id, name: a.name, why: ch.cause || ch.reason || 'no men are left' } });
        disband(state, a, a.at || nearestHolding(state, a.pos)); return { op, text: `${a.name} has ceased to exist` };
      }
      return { op, text: `${a.name}: ${out.join(', ')}` };
    }
    case 'army_destroy': case 'army_disband': case 'fleet_destroy': {
      const id = findArmy(state, ch.army || ch.id); if (!id) throw new Error('unknown army');
      const gone = state.parties[id]; const n = gone.name;
      note('host_disbanded', { actors: [gone.commander], houses: [gone.owner], place: gone.at || null, pos: gone.pos, data: { party: id, name: n, men: gone.men, why: ch.reason || (op === 'army_disband' ? 'disbanded' : 'destroyed') } });
      disband(state, gone, gone.at || nearestHolding(state, gone.pos));
      return { op, text: `${n} ${op === 'army_disband' ? 'disbands' : 'is destroyed'}${ch.reason ? ' — ' + ch.reason : ''}` };
    }
    case 'holding': case 'holding_update': case 'province': {
      const hid = resolvePlaceId(ch.id || ch.holding || ch.place); if (!hid || !state.holdings[hid]) throw new Error('unknown holding ' + (ch.id || ch.holding));
      const h = state.holdings[hid]; const out = [];
      const was = { owner: h.owner, status: h.status };
      if (ch.owner) { const o = findHouse(state, ch.owner); if (!o) throw new Error('unknown owner'); if (o !== h.owner) { out.push(`passes from ${state.houses[h.owner]?.name} to ${state.houses[o].name}`); h.owner = o; } }
      for (const k of ['unrest', 'prosperity']) if (num(ch[k]) !== null) { h[k] = clamp(num(ch[k]), 0, 100); out.push(`${k} ${h[k]}`); }
      if (num(ch.garrison) !== null) { h.garrison = Math.max(0, Math.round(num(ch.garrison))); out.push(`garrison ~${fmt(h.garrison)}`); }
      if (num(ch.population) !== null) { h.population = Math.max(0, Math.round(num(ch.population))); out.push(`population ~${fmt(h.population)}`); }
      if (num(ch.fort) !== null) { h.fort = Math.max(0, Math.min(6, num(ch.fort))); out.push(`fortifications ${h.fort}`); }
      if (ch.building) { h.buildings = [...new Set([...(h.buildings || []), String(ch.building)])]; out.push('builds ' + ch.building); }
      if (ch.resource && typeof ch.resource === 'object') { const t = String(ch.resource.type); h.resources = h.resources || {}; h.resources[t] = Math.max(0, (h.resources[t] || 0) + (num(ch.resource.delta) ?? 0)); out.push(`${t} ${num(ch.resource.delta) > 0 ? 'up' : 'down'}`); }
      if (ch.status) { h.status = ch.status; out.push(ch.status); }
      if (ch.name && String(ch.name).trim() && ch.name !== h.name) { out.push(`renamed from ${h.name}`); h.formerNames = [...(h.formerNames || []), h.name]; h.name = String(ch.name).trim().slice(0, 60); registerPlaces(state); }
      if (ch.type && HOLDING_TYPES.includes(ch.type)) { h.type = ch.type; out.push(ch.type); }
      if (ch.note) { h.notes.push(`${date}: ${ch.note}`); h.notes = h.notes.slice(-8); }
      const houses = [...new Set([h.owner, was.owner].filter(Boolean))];
      if (h.owner !== was.owner) {
        const taken = /occupied|sacked|taken|storm|fell|siege|captur|conquer/i.test(`${ch.status || ''} ${ch.note || ''}`);
        note(taken ? 'holding_fell' : 'holding_granted', { actors: [lordOf(h.owner)], houses, place: hid, pos: h.pos, data: { from: was.owner, to: h.owner }, text: taken ? `${h.name} falls to House ${state.houses[h.owner]?.name}.` : `${h.name} passes to House ${state.houses[h.owner]?.name}${ch.note ? ` — ${ch.note}` : ''}.` });
      } else if (h.status !== was.status && /besieged/.test(h.status || '')) note('siege_begun', { houses, place: hid, pos: h.pos, text: `${h.name} is besieged${ch.note ? ` — ${ch.note}` : ''}.` });
      else if (h.status !== was.status && /besieged/.test(was.status || '')) note('siege_lifted', { houses, place: hid, pos: h.pos, text: `The siege of ${h.name} is lifted.` });
      if (ch.building) note('works_done', { houses: [h.owner], place: hid, pos: h.pos, data: { building: String(ch.building) }, text: `${h.name} raises ${ch.building}.` });
      return { op, text: `${h.name}: ${out.join(', ') || 'updated'}` };
    }
    case 'holding_new': case 'found': case 'settlement': {
      // a new castle, town, camp or fortress raised on the map
      const owner = findHouse(state, ch.owner); if (!owner) throw new Error('unknown owner ' + ch.owner);
      const name = String(ch.name || '').trim(); if (!name) throw new Error('a new holding needs a name');
      let id = slug(ch.id || name); if (state.holdings[id] || HOUSE_IDS.has(id)) id = slug(name + '_' + owner);
      if (state.holdings[id]) throw new Error('holding exists: ' + id);
      const near = Array.isArray(ch.at) ? ch.at : posOf(state, ch.at || ch.near);
      if (!near) throw new Error('unknown place ' + (ch.at || ch.near));
      const pos = landNear(near, ch.at && !ch.near ? 0 : 8 + random() * 6);
      if (!pos) throw new Error('no dry land there');
      const type = HOLDING_TYPES.includes(ch.type) ? ch.type : 'castle';
      const region = nearestHolding(state, pos) ? state.holdings[nearestHolding(state, pos)].region : state.houses[owner].region;
      state.holdings[id] = { id, name, fullName: name, pos, owner, seatOf: null, region, type, prosperity: 40, unrest: 15, garrison: null, status: 'normal', notes: [ch.note ? `${date}: ${ch.note}` : `${date}: founded`], resources: {}, population: type === 'town' ? 4000 : type === 'camp' ? 800 : 1500, coastal: isCoastal(pos), founded: date };
      registerPlaces(state);
      note('works_done', { actors: [lordOf(owner)], houses: [owner], place: id, pos, data: { founded: id, type }, text: `House ${state.houses[owner].name} raises ${name}.` });
      return { op, text: `${name} is raised by House ${state.houses[owner].name} near ${placeName(state, ch.at || ch.near)}` };
    }
    case 'landmark': case 'map_label': {
      // a named spot on the map: a battlefield, a camp, a ford where something happened
      const text = String(ch.name || ch.text || '').trim(); if (!text) throw new Error('a landmark needs a name');
      state.landmarks = state.landmarks || [];
      if (ch.remove) { state.landmarks = state.landmarks.filter((l) => l.name !== text); return { op, text: `Landmark removed: ${text}` }; }
      const pos = Array.isArray(ch.at) ? ch.at : posOf(state, ch.at); if (!pos) throw new Error('unknown place ' + ch.at);
      state.landmarks = [...state.landmarks.filter((l) => l.name !== text), { name: text, pos: [pos[0] + (random() - 0.5) * 6, pos[1] + (random() - 0.5) * 6], kind: ch.kind || 'site', note: ch.note || '', date }].slice(-40);
      return { op, text: `On the map: ${text}` };
    }
    case 'character': case 'character_update': {
      const cid = findChar(state, ch.id || ch.character); if (!cid) throw new Error('unknown character ' + (ch.id || ch.character));
      const c = state.characters[cid]; const out = [];
      const was = { alive: c.alive, status: c.status, house: c.house, title: c.title, spouse: c.spouse, secret: c.secretKnown };
      const where = () => resolvePlaceId(c.loc) || partyOf(state, c)?.at || null;
      if (ch.alive === false && c.alive) { c.alive = false; c.status = 'dead'; c.diedTurn = state.meta?.turn ?? 0; c.diedDay = dayNumber(state.meta.date); c.diedBy = ctx.cause?.type || ctx.source || null; if (c.wound) delete c.wound; c.cause = ch.cause || c.cause || null; leaveParty(state, c); out.push('has died' + (ch.cause ? ` (${ch.cause})` : '')); }
      if (ch.loc || ch.location || ch.with) {
        const raw = ch.with || ch.loc || ch.location;
        const army = findArmy(state, idOf(raw) ?? String(raw));
        const l = army && !resolvePlaceId(raw) ? ref(army) : (resolvePlaceId(raw) || String(raw));
        const riding = rideOf(state, c);
        const here = charPos(state, c); const there = isRef(l) ? state.parties[army]?.pos : placePos(l, state.holdings);
        const miles = here && there ? Math.hypot(there[0] - here[0], there[1] - here[1]) * MILES_PER_UNIT * 1.12 : 0;
        const free = c.alive && ch.alive !== false && !/imprisoned|captive|dead/.test(ch.status || c.status || '');
        if (riding?.march?.to === l) out.push(`still on the road to ${placeName(state, l)}`); // the engine brings riders in; the story does not
        else if (ctx.protectPlayer && c.house === state.meta.player && !ctx.mayMove?.includes(c.id) && l !== c.loc) out.push(`stays where you left them (only you send ${c.name} anywhere)`);
        else if (!there) out.push(`stays where they are (no place called ${String(raw).slice(0, 40)})`); // everyone is somewhere real
        else if (ctx.protectPlayer && free && !isRef(l) && bound(state, c)) out.push(`stays: ${c.name} is ${DOING[bound(state, c).kind]}`); // one thing at a time (engine/activity.js)
        else if (miles > 60 && free) {
          // no one crosses the realm in a day: a far move is a journey, taken on the road (a far host is ridden to)
          try {
            const p = startRide(state, c, l); out.push(`sets out for ${placeName(state, l)} (~${Math.max(1, Math.ceil(p.route.days))} days)`);
            note('set_out', { actors: [c.id], houses: [c.house], pos: p.pos, data: { party: p.id, to: isRef(l) ? null : l, ...(isRef(l) ? { joining: idOf(l) } : {}), days: Math.max(1, Math.ceil(p.route.days)) } });
          } catch (e) { out.push(`stays: ${e.message}`); }
        } else {
          setLoc(state, c, l);
          if (c.alive && ch.alive !== false) note('arrived', { actors: [c.id], houses: [c.house], place: isRef(l) ? state.parties[army]?.at || null : l, data: isRef(l) ? { joined: army } : {}, text: `${c.name} is ${isRef(l) ? `now ${placeName(state, l)}` : `now at ${placeName(state, l)}`}.` });
          // placeName already says "with The King's progress" for a host, so do not say "with" twice
          out.push(isRef(l) ? `travels ${placeName(state, l)}` : `now at ${placeName(state, l)}`);
        }
      }
      if (ch.title) { c.title = ch.title; out.push('now ' + ch.title); }
      if (ch.status && ch.alive !== false) { c.status = ch.status; out.push(ch.status); }
      if (ch.house) { const hh = findHouse(state, ch.house); if (hh) { c.house = hh; out.push('joins ' + state.houses[hh].name); } }
      for (const k of ['opinion', 'loyalty']) {
        if (num(ch[k]) !== null) { c[k] = clamp(num(ch[k]), -100, 100); out.push(`${k} ${c[k]}`); }
        else if (num(ch[k + 'Delta']) !== null) { c[k] = clamp((c[k] || 0) + num(ch[k + 'Delta']), -100, 100); out.push(`${k} ${c[k]}`); }
      }
      if (ch.note || ch.memory) { c.memories = [...(c.memories || []), `${date}: ${ch.note || ch.memory}`].slice(-12); }
      if (ch.traits) c.traits = ch.traits;
      if (ch.revealSecret || ch.secretRevealed) { c.secretKnown = true; out.push('their secret is uncovered'); }
      if (ch.secret && typeof ch.secret === 'string') { c.secret = ch.secret; out.push('now hides a secret'); }
      if (ch.spouse) { const sp = findChar(state, ch.spouse); if (sp) { c.spouse = sp; state.characters[sp].spouse = c.id; out.push('wed to ' + state.characters[sp].name); } }
      // what a lord of the realm could notice of all that (opinion, memories and traits are the person's own)
      const f = { actors: [c.id], houses: [c.house], place: where() };
      const held = (x) => /imprisoned|captive|hostage/.test(x || '');
      const why = `${ch.cause || ''} ${ch.note || ''}`;
      if (was.alive && !c.alive) {
        const kind = /battle|victory|slain|the field|fell /i.test(why) ? 'slain_in_battle' : /execut|behead|hanged|headsman/i.test(why) ? 'executed' : 'death';
        // the slots a headline is written from, when the caller knows them: who did it, how, in which battle
        note(kind, { ...f, data: { cause: ch.cause || null, ...(ch.by ? { by: ch.by } : {}), ...(ch.how ? { how: ch.how } : {}), ...(kind === 'slain_in_battle' && ch.battle ? { battle: ch.battle } : {}) } });
      } else if (c.alive) {
        // a captive of the field is held by the host's commander (or, failing him, its house); one taken at a castle, by its lord's house
        const inBattle = /battle/i.test(why);
        if (held(c.status) && !held(was.status)) note(inBattle ? 'captured_in_battle' : 'captured', { ...f, ...(inBattle && !f.place && ch.place ? { place: ch.place } : {}), data: { by: (inBattle ? ch.by : null) ?? (resolvePlaceId(c.loc) && state.holdings[resolvePlaceId(c.loc)]?.owner || null), note: ch.note || null, ...(inBattle && ch.battle ? { battle: ch.battle } : {}) } });
        else if (held(was.status) && !held(c.status)) note(/ransom/i.test(why) ? 'ransomed' : 'released', f);
        if (c.status === 'wounded' && was.status !== 'wounded') note('wounded', { ...f, data: { note: ch.note || null } });
        if (/missing|vanish/i.test(c.status || '') && !/missing|vanish/i.test(was.status || '')) note('vanished', f);
        if (c.house !== was.house && c.house === 'nights_watch') note('sent_to_wall', { ...f, houses: [was.house, c.house] });
        else if (ch.title && c.title !== was.title) note('office_granted', { ...f, data: { title: c.title } });
        if (c.spouse && c.spouse !== was.spouse) note('wedding', { ...f, actors: [c.id, c.spouse], houses: [c.house, state.characters[c.spouse]?.house] });
        if (c.secretKnown && !was.secret) note('secret_revealed', { ...f, vis: { scope: 'secret', houses: [state.meta.player] }, text: `${c.name}'s secret is uncovered.` });
      }
      return { op, text: `${c.name} ${out.join(', ') || 'updated'}` };
    }
    case 'character_new': case 'new_character': {
      const house = findHouse(state, ch.house) || 'baratheon';
      let id = slug(ch.id || ch.name); if (!id) throw new Error('no name');
      if (state.characters[id]) return applyOne(state, { ...ch, op: 'character', id }, { date, src });
      state.characters[id] = {
        id, name: ch.name || id, house, title: ch.title || '', age: num(ch.age) ?? 30, loc: resolvePlaceId(ch.loc || ch.location) || ch.loc || state.houses[house].seat,
        roles: Array.isArray(ch.roles) ? ch.roles : [ch.role || 'family'].filter(Boolean), traits: ch.traits || '', bio: ch.bio || '', alive: true, status: 'free', opinion: num(ch.opinion) ?? 0, loyalty: 60, memories: [], generated: true,
        sex: /^(f|female|woman)$/i.test(String(ch.sex || ch.gender || '')) ? 'f' : /^(m|male|man)$/i.test(String(ch.sex || ch.gender || '')) ? 'm' : sexOf({ title: ch.title }),
        father: findChar(state, ch.father), mother: findChar(state, ch.mother), born: state.meta.date.year - (num(ch.age) ?? 30),
      };
      state.characters[id].skills = deriveSkills(state.characters[id]);
      return { op, text: `${state.characters[id].name} (${state.houses[house].name}) enters the story` };
    }
    case 'liege': case 'set_liege': case 'fealty': {
      const hid = findHouse(state, ch.house); if (!hid) throw new Error('unknown house');
      if (hid === state.meta.player && ctx.protectPlayer && !ctx.playerChoseAllegiance) throw new Error('only the player decides their own allegiance');
      const lg = ch.liege ? findHouse(state, ch.liege) : null;
      if (ch.liege && !lg) throw new Error('unknown liege');
      if (lg === hid) throw new Error('self liege');
      const old = state.houses[hid].liege; state.houses[hid].liege = lg;
      if (ch.independent !== undefined) state.houses[hid].independent = !!ch.independent;
      if (!lg) state.houses[hid].independent = true;
      if (lg !== old) note(lg ? 'fealty_sworn' : 'fealty_renounced', { actors: [lordOf(hid), lg ? lordOf(lg) : null], houses: [hid, lg, old], place: state.houses[hid].seat || null, data: { house: hid, liege: lg, was: old || null }, text: lg ? `House ${state.houses[hid].name} swears fealty to House ${state.houses[lg].name}.` : `House ${state.houses[hid].name} declares itself bound to no one${old ? `, renouncing House ${state.houses[old]?.name}` : ''}.` });
      return { op, text: `${state.houses[hid].name} ${lg ? 'swears fealty to ' + state.houses[lg].name : 'declares independence'}${old && old !== lg ? ` (was sworn to ${state.houses[old]?.name})` : ''}` };
    }
    case 'house_update': case 'house': {
      const hid = findHouse(state, ch.house || ch.id); if (!hid) throw new Error('unknown house');
      const h = state.houses[hid]; const out = [];
      if (ch.lord) { const c = findChar(state, ch.lord); if (c) { h.lord = c; out.push('new lord ' + state.characters[c].name); } }
      if (ch.title) { h.title = ch.title; out.push('title ' + ch.title); }
      if (ch.realmName) { h.realmName = ch.realmName; out.push('realm ' + ch.realmName); }
      if (ch.status) { h.status = ch.status; out.push(ch.status); }
      if (ch.independent !== undefined) h.independent = !!ch.independent;
      if (ch.tribute || ch.levies) { h.obligations = { ...(h.obligations || {}), ...(ch.tribute ? { tribute: ch.tribute } : {}), ...(ch.levies ? { levies: ch.levies } : {}) }; out.push(`obligations ${ch.tribute || ''} ${ch.levies || ''}`); }
      if (ch.note) h.notes = [...h.notes, `${date}: ${ch.note}`].slice(-10);
      if (ch.status && /extinct|ended/i.test(ch.status)) note('house_ended', { houses: [hid], data: { house: hid }, text: `House ${h.name} is ended.` });
      else if (ch.title && /\b(king|queen)\b/i.test(ch.title)) note('claim_proclaimed', { actors: [h.lord], houses: [hid], place: h.seat || null, data: { title: ch.title }, text: `House ${h.name} proclaims: ${ch.title}.` });
      return { op, text: `${h.name}: ${out.join(', ') || 'updated'}` };
    }
    case 'war': {
      const status = String(ch.status || 'start').toLowerCase();
      if (status === 'start' || status === 'declare' || status === 'ongoing') {
        const att = [...new Set((Array.isArray(ch.attackers) ? ch.attackers : [ch.attacker]).map((x) => findHouse(state, x)).filter(Boolean))];
        // no house fights on both sides of the same war: the first side it was named on is the one it is on
        const def = [...new Set((Array.isArray(ch.defenders) ? ch.defenders : [ch.defender]).map((x) => findHouse(state, x)).filter(Boolean))].filter((x) => !att.includes(x));
        // the story may bring war to the player, but only the player declares it
        if (ctx.protectPlayer && !ctx.playerDeclaredWar && att.includes(state.meta.player)) throw new Error('only the player can declare the player\'s wars');
        if (!att.length || !def.length) throw new Error('war needs sides');
        const id = slug(ch.id || ch.name || `${att[0]}_vs_${def[0]}`);
        const existing = state.wars.find((w) => w.id === id);
        if (existing) {
          existing.attackers = [...new Set([...existing.attackers, ...att])];
          const before = new Set([...existing.attackers, ...existing.defenders]);
          existing.defenders = [...new Set([...existing.defenders, ...def])].filter((x) => !existing.attackers.includes(x));
          const joined = [...existing.attackers, ...existing.defenders].filter((x) => !before.has(x));
          if (joined.length) note('war_joined', { actors: joined.map(lordOf), houses: joined, data: { war: existing.id, houses: joined }, text: `${joined.map((x) => `House ${state.houses[x].name}`).join(', ')} ${joined.length > 1 ? 'join' : 'joins'} ${existing.name}.` });
          return { op, text: `${existing.name} widens` };
        }
        state.wars.push({ id, name: ch.name || `War of ${state.houses[att[0]].name} against ${state.houses[def[0]].name}`, attackers: att, defenders: def, started: date, status: 'ongoing', note: ch.reason || ch.note || '', ...(ch.goal ? { goal: ch.goal } : {}), score: 0 });
        note('war_declared', { actors: [lordOf(att[0]), lordOf(def[0])], houses: [...att, ...def], data: { war: id, attackers: att, defenders: def, reason: ch.reason || null }, text: `${state.wars.at(-1).name}: House ${state.houses[att[0]].name} makes war on House ${state.houses[def[0]].name}.` });
        return { op, text: `WAR: ${state.wars.at(-1).name}` };
      }
      const w = state.wars.find((x) => x.id === slug(ch.id || ch.name) || slug(x.name) === slug(ch.name || ''));
      if (!w) throw new Error('unknown war');
      w.status = 'ended'; w.ended = date; w.outcome = ch.outcome || '';
      note('peace_made', { actors: [lordOf(w.attackers[0]), lordOf(w.defenders[0])], houses: [...w.attackers, ...w.defenders], data: { war: w.id, outcome: w.outcome || null }, text: `${w.name} is over${w.outcome ? ` — ${w.outcome}` : ''}.` });
      return { op, text: `PEACE: ${w.name} ends${ch.outcome ? ' — ' + ch.outcome : ''}` };
    }
    case 'war_join': {
      const w = state.wars.find((x) => x.id === slug(ch.war || ch.id) || slug(x.name) === slug(ch.war || ''));
      const hid = findHouse(state, ch.house); if (!w || !hid) throw new Error('bad war_join');
      if (w.status === 'ended') throw new Error('that war is over');
      // war_join is the same power as declaring a war: the story may not march the player into one either
      if (ctx.protectPlayer && !ctx.playerDeclaredWar && hid === state.meta.player && ch.side !== 'defender') throw new Error('only the player can declare the player\'s wars');
      if (w.attackers.includes(hid) || w.defenders.includes(hid)) throw new Error(`${state.houses[hid].name} is already in ${w.name}`);
      (ch.side === 'defender' ? w.defenders : w.attackers).push(hid);
      note('war_joined', { actors: [lordOf(hid)], houses: [hid, ...w.attackers, ...w.defenders], data: { war: w.id, side: ch.side === 'defender' ? 'defender' : 'attacker' }, text: `House ${state.houses[hid].name} joins ${w.name}.` });
      return { op, text: `${state.houses[hid].name} joins ${w.name}` };
    }
    case 'pact': case 'treaty': case 'embargo': case 'trade': case 'alliance': case 'marriage': {
      const type = op === 'pact' || op === 'treaty' ? String(ch.type || 'agreement') : op;
      const a = findHouse(state, ch.a || ch.from), b = findHouse(state, ch.b || ch.to);
      if (!a || !b) throw new Error('pact needs houses');
      const status = String(ch.status || 'active').toLowerCase();
      const id = slug(ch.id || `${type}_${a}_${b}`);
      const ex = state.pacts.find((p) => p.id === id || (p.type === type && ((p.a === a && p.b === b) || (p.a === b && p.b === a)) && p.status !== 'ended'));
      if (status === 'end' || status === 'ended' || status === 'broken') {
        if (!ex) throw new Error('no such pact');
        ex.status = status === 'broken' ? 'broken' : 'ended'; ex.ended = date;
        note('pact_broken', { actors: [lordOf(a), lordOf(b)], houses: [a, b], data: { pact: ex.id, type, status: ex.status }, text: `The ${type} between House ${state.houses[a].name} and House ${state.houses[b].name} is ${ex.status === 'broken' ? 'broken' : 'at an end'}.` });
        return { op, text: `${type} between ${state.houses[a].name} and ${state.houses[b].name} ${ex.status}` };
      }
      if (ex) { Object.assign(ex, { terms: ch.terms || ex.terms, status }); return { op, text: `${type} between ${state.houses[a].name} and ${state.houses[b].name}: ${status}` }; }
      state.pacts.push({ id, type, a, b, terms: ch.terms || '', status, since: date });
      note(type === 'marriage' ? 'betrothal' : 'pact_made', { actors: [lordOf(a), lordOf(b)], houses: [a, b], data: { pact: id, type, terms: ch.terms || null }, text: `House ${state.houses[a].name} and House ${state.houses[b].name} make ${type === 'marriage' ? 'a marriage pact' : `a${/^[aeiou]/i.test(type) ? 'n' : ''} ${type}`}${ch.terms ? `: ${ch.terms}` : ''}.` });
      return { op, text: `${type.toUpperCase()}: ${state.houses[a].name} & ${state.houses[b].name}${ch.terms ? ' — ' + ch.terms : ''}` };
    }
    case 'battle': {
      const pos = posOf(state, ch.at || ch.location);
      // the player's house fights only where the player has a host
      const pl = state.meta.player;
      if (ctx.protectPlayer && [findHouse(state, ch.attacker), findHouse(state, ch.defender)].includes(pl) && !Object.values(state.parties).some((a) => a.owner === pl && pos && Math.hypot(a.pos[0] - pos[0], a.pos[1] - pos[1]) < 45) && !Object.values(state.holdings).some((h) => h.owner === pl && pos && Math.hypot(h.pos[0] - pos[0], h.pos[1] - pos[1]) < 12)) throw new Error('the player has no host there');
      state.battles = state.battles || [];
      state.battles.push({ name: ch.name || `Battle at ${placeName(state, ch.at)}`, pos, date, turn: state.meta.turn, attacker: findHouse(state, ch.attacker), defender: findHouse(state, ch.defender), victor: findHouse(state, ch.victor), losses: ch.losses || {}, summary: ch.summary || '' });
      state.battles = state.battles.slice(-40);
      const bt = state.battles.at(-1);
      // the slots a headline is written from (as on the engine's own battles, shared/battles.js): a story battle names houses, not
      // hosts, so its `winner` is already a house; the loser is the other side; `how` only if the op says it, in plain words
      const loserHouse = bt.victor === bt.attacker ? bt.defender : bt.victor === bt.defender ? bt.attacker : null;
      const how = typeof ch.how === 'string' && /^[a-z][a-z ,'-]{2,59}$/i.test(ch.how.trim()) ? ch.how.trim() : null;
      note('battle', { actors: [], houses: [bt.attacker, bt.defender], place: resolvePlaceId(ch.at || ch.location) || null, pos, data: { attacker: bt.attacker, defender: bt.defender, winner: bt.victor, lost: bt.losses, winnerHouse: bt.victor || null, loserHouse: bt.victor ? loserHouse ?? null : null, ...(how ? { how } : {}) }, text: `${bt.name}${bt.victor ? `: victory for House ${state.houses[bt.victor]?.name}` : ''}.${bt.summary ? ` ${bt.summary}` : ''}` });
      return { op, text: `BATTLE: ${state.battles.at(-1).name}${ch.victor ? ' — victory for ' + (state.houses[findHouse(state, ch.victor)]?.name || ch.victor) : ''}` };
    }
    case 'raven': case 'letter': case 'message': {
      const from = findChar(state, ch.from); const to = ch.to ? findChar(state, ch.to) : null;
      const pl = state.meta.player; const lord = state.houses[pl]?.lord; const fc = from && state.characters[from];
      // a letter between others is the story's, not the player's post
      if (to && to !== lord && state.characters[to].house !== pl) {
        if (ctx.protectPlayer && fc?.house === pl) throw new Error(`only you send ${fc.name}'s letters`);
        const tc = state.characters[to]; tc.memories = [...(tc.memories || []), `${date}: a letter from ${fc?.name || ch.fromName || 'someone'}`].slice(-12);
        note('letter_arrived', { actors: [from, to], houses: [fc?.house, tc.house], data: { from, to }, text: `${fc?.name || ch.fromName || 'Someone'} writes to ${tc.name}.` });
        return { op, text: `${fc?.name || ch.fromName || 'Someone'} writes to ${tc.name}` };
      }
      // one of the household at the lord's side speaks to him; no raven flies across a hall
      const lc = lord && state.characters[lord];
      if (fc && fc.house === pl && lc && !rideOf(state, fc) && !rideOf(state, lc) && fc.loc === lc.loc) throw new Error(`${fc.name} is with you; no raven is needed`);
      state.ravens.unshift({ id: nextId(state, 'r'), day: dayNumber(state.meta.date), from: from || null, fromName: from ? state.characters[from].name : (ch.fromName || ch.from || 'Unknown'), text: String(ch.text || ''), date, read: false });
      state.ravens = state.ravens.slice(0, 60);
      note('letter_arrived', { actors: [from, lord], houses: [fc?.house, pl], data: { raven: state.ravens[0].id, from: from || null }, text: `A raven from ${state.ravens[0].fromName} reaches ${lc?.name || `House ${state.houses[pl]?.name}`}.` });
      return { op, text: `A raven arrives from ${state.ravens[0].fromName}` };
    }
    case 'decision': case 'choice': {
      // every matter is one of the catalogue's templates (data/matters.js) or a Director hook's — never invented (B-28)
      const matter = String(ch.matter || '');
      if (!MATTER_IDS.has(matter) && !(matter.startsWith('hook:') && matter.length > 5)) throw new Error(`no such matter${matter ? ` (${matter})` : ''}: a matter must come from the catalogue`);
      const opts = (Array.isArray(ch.options) ? ch.options : []).map((o) => (typeof o === 'string' ? { label: o } : { label: String(o.label || o.text || ''), hint: String(o.hint || o.effect || ''), ...(Array.isArray(o.fx) ? { fx: o.fx } : {}) })).filter((o) => o.label);
      if (opts.length < 2) throw new Error('a decision needs at least two options');
      state.decisions = state.decisions || [];
      const d = { id: slug(ch.id || ch.title || 'decision') + '_' + nextId(state, 'd'), title: String(ch.title || 'A decision'), text: String(ch.text || ''), from: findChar(state, ch.from) || null, options: opts, date, turn: state.meta.turn, day: dayNumber(state.meta.date), days: Math.max(1, Math.round(num(ch.days) ?? 14)), status: 'pending', matter, ...(resolvePlaceId(ch.where) && state.holdings[resolvePlaceId(ch.where)] ? { where: resolvePlaceId(ch.where) } : {}) };
      state.decisions.push(d);
      note('petition', { actors: [d.from, state.houses[state.meta.player]?.lord], houses: [state.meta.player, state.characters[d.from]?.house], place: d.where || null, data: { matter: d.id }, title: d.title, text: `A matter is brought before ${state.characters[state.houses[state.meta.player]?.lord]?.name || 'the lord'}: ${d.title}.` });
      return { op, text: `A decision awaits you: ${d.title}` };
    }
    case 'report': case 'sighting': case 'rumour_host': {
      // news of a host reaching the player — true, stale, or planted (fog of war: engine/knowledge.js)
      const aid = findArmy(state, ch.army || ch.id);
      const pos = ch.at ? posOf(state, ch.at) : null;
      if (!aid && !ch.false && !ch.lie) throw new Error('unknown army ' + (ch.army || ch.id));
      const r = addReport(state, { army: aid || null, pos: pos || (aid ? state.parties[aid].pos : null), men: num(ch.men), source: ch.source || 'a raven', false: !!(ch.false || ch.lie), owner: findHouse(state, ch.owner) || (aid && state.parties[aid].owner), name: ch.name });
      // what was said, not what is: the fact is the report (its truth stays with the engine, never in the words)
      note('rumour', { houses: [state.meta.player, r.owner], pos: r.pos || null, vis: { scope: 'houses', houses: [state.meta.player] }, data: { report: true, party: aid || null, men: r.men || null, false: !!(ch.false || ch.lie) }, text: `Word reaches House ${state.houses[state.meta.player]?.name} of ${r.name} (~${fmt(r.men)} men).` });
      return { op, text: `A report reaches you: ${r.name} (~${fmt(r.men)} men) near ${ch.at ? placeName(state, ch.at) : 'where it was last seen'} — ${r.source}` };
    }
    // ═══════════════════════════════════════════════════════════════════════════════════════════
    // inject_rule — the model designs a mechanic, and the engine runs it
    //
    // "Fund a network of informants in the Riverlands, paid in stolen Lannister gold" is not any op
    // in this file. It is a new quantity with its own economics, and the Weaver writes it:
    //   { op:'inject_rule', house:'stark', name:'Informants in the Riverlands', kind:'income',
    //     vars:{ informants: 0 },
    //     grow: 'min(60, v.informants + 6 * months * (house.treasury > 2000))',
    //     formula: 'v.informants * 14 * luck * months',
    //     when: 'house.treasury > 500', note: 'Paid out of stolen Lannister coin.' }
    // From the next turn the steward's ledger carries its own line, and the number lives in the save.
    //
    // The formula is a sandboxed expression, never JavaScript (see shared/rules.js for why), it is
    // compiled and dry-run here so a bad rule never reaches a save, and every kind is capped so the
    // model cannot invent its way to a million dragons a moon.
    // ═══════════════════════════════════════════════════════════════════════════════════════════
    case 'inject_rule': case 'rule': case 'mechanic': {
      const hid = findHouse(state, ch.house || ch.owner) || state.meta.player;
      if (!state.houses[hid]) throw new Error('unknown house ' + ch.house);
      // the player's own realm may only be reshaped by the player's own doing, not by passing rumour
      if (ctx.protectPlayer && hid === state.meta.player && !ctx.mayInvent) throw new Error('a new custom of your realm must come from your own order, not from report');
      state.rules = state.rules || [];
      // ending a rule the story itself raised ("the informants are rolled up") needs no formula
      if (/^(end|stop|cancel|lapse|revoke)$/i.test(String(ch.status || ''))) {
        const key = String(ch.id || ch.name || '').toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 40);
        const r = state.rules.find((x) => x.house === hid && x.id === key && x.status !== 'ended');
        if (!r) throw new Error('no such custom to end');
        r.status = 'ended';
        note('custom_created', { houses: [hid], data: { rule: r.id, ended: true }, text: `${r.name} is at an end.` });
        return { op, text: `${r.name} is at an end` };
      }
      const spec = compileRule(state, { ...ch, house: hid, source: ctx.source || 'the story' });
      const existing = state.rules.findIndex((r) => r.id === spec.id && r.house === hid);
      if (state.rules.filter((r) => r.house === hid && !r.status).length >= 12 && existing < 0) throw new Error('this house already keeps as many special customs as its stewards can track');
      if (existing >= 0) { state.rules[existing] = { ...state.rules[existing], ...spec, status: undefined }; note('custom_created', { houses: [hid], data: { rule: spec.id, changed: true }, text: `House ${state.houses[hid].name} changes a custom: ${spec.name}.` }); return { op, text: `${spec.name} is changed` }; }
      state.rules.push(spec);
      note('custom_created', { actors: [lordOf(hid)], houses: [hid], data: { rule: spec.id, kind: spec.kind }, text: `House ${state.houses[hid].name} keeps a new custom: ${spec.name}.` });
      state.vars = state.vars || {}; state.vars[hid] = state.vars[hid] || {};
      for (const [k, v0] of Object.entries(spec.vars || {})) if (state.vars[hid][k] === undefined) state.vars[hid][k] = v0;
      return { op, text: `NEW CUSTOM — ${state.houses[hid].name}: ${spec.name} (${spec.kind}: ${spec.formula})` };
    }
    case 'chronicle': case 'memory': {
      state.chronicle.push({ date, text: String(ch.text || '') });
      return { op, text: 'Recorded in the chronicle' };
    }
    case 'obligation': case 'vassal': {
      const hid = findHouse(state, ch.house); if (!hid) throw new Error('unknown house');
      const h = state.houses[hid]; h.obligations = h.obligations || {}; const out = [];
      if (ch.tribute) { h.obligations.tribute = String(ch.tribute); out.push('tribute: ' + ch.tribute); }
      if (ch.levies) { h.obligations.levies = String(ch.levies); out.push('levies: ' + ch.levies); }
      if (!out.length) throw new Error('nothing to change');
      return { op, text: `House ${h.name} — ${out.join(', ')}${ch.reason ? ' (' + ch.reason + ')' : ''}` };
    }
    case 'tax': case 'policy': {
      const hid = findHouse(state, ch.house); if (!hid) throw new Error('unknown house');
      if (hid === state.meta.player && ctx.protectPlayer) throw new Error('only the player sets their own taxes');
      const lvl = String(ch.level || ch.tax || '').toLowerCase(); if (!TAX_LEVELS[lvl]) throw new Error('bad tax level');
      const wasTax = state.houses[hid].policy?.tax;
      state.houses[hid].policy = { ...(state.houses[hid].policy || {}), tax: lvl };
      if (wasTax !== lvl) note('tax_changed', { actors: [lordOf(hid)], houses: [hid], place: state.houses[hid].seat || null, data: { tax: lvl, was: wasTax || null }, text: `House ${state.houses[hid].name} proclaims ${TAX_LEVELS[lvl].label.toLowerCase()} taxes.` });
      return { op, text: `House ${state.houses[hid].name} sets ${TAX_LEVELS[lvl].label.toLowerCase()} taxes` };
    }
    case 'project': {
      const hid = findHouse(state, ch.house); if (!hid) throw new Error('unknown house');
      state.projects = state.projects || [];
      const status = String(ch.status || 'start').toLowerCase();
      if (status === 'cancel' || status === 'cancelled' || status === 'complete') {
        const p = state.projects.find((x) => x.house === hid && (x.id === ch.id || slug(x.name) === slug(ch.name || '')) && x.status === 'active');
        if (!p) throw new Error('no such project');
        p.status = status === 'complete' ? 'active' : 'cancelled'; if (status === 'complete') p.monthsLeft = 0;
        return { op, text: `${p.name}: ${status}` };
      }
      if (ctx.protectPlayer && hid === state.meta.player) throw new Error('only you begin your own works');
      const cost = Math.max(0, num(ch.cost) ?? 1000), months = Math.max(0.25, num(ch.months) ?? 3);
      const hold = resolvePlaceId(ch.holding || ch.at) || state.houses[hid].seat;
      // the same works at the same place are begun once
      const twin = state.projects.find((x) => x.house === hid && x.status === 'active' && x.holding === hold && ((ch.template && x.template === ch.template) || slug(x.name) === slug(ch.name || 'Works')));
      if (twin) throw new Error(`${twin.name} is already under way`);
      const p = { id: slug(ch.id || ch.name || 'project') + '_' + nextId(state, 'w'), house: hid, ...(ch.template ? { template: String(ch.template) } : {}), name: ch.name || 'Works', holding: hold, cost, remaining: cost, perMonth: cost / months, months, monthsLeft: months, effect: ch.effect || {}, status: 'active', started: date };
      state.projects.push(p);
      note('works_begun', { actors: [lordOf(hid)], houses: [hid], place: hold, data: { project: p.id, name: p.name, cost, months }, text: `House ${state.houses[hid].name} begins works at ${placeName(state, hold)}: ${String(p.name).replace(` at ${placeName(state, hold)}`, '').replace(/^./, (x) => x.toLowerCase())}.` }); // "…at White Harbor: build warships"
      return { op, text: `House ${state.houses[hid].name} begins: ${p.name} (${fmt(cost)} gd over ${months} moons)` };
    }
    case 'season': {
      const sname = String(ch.season || '').toLowerCase();
      if (!['summer', 'autumn', 'winter', 'spring'].includes(sname)) throw new Error('bad season');
      if (state.world?.season !== sname) state.world = { ...(state.world || {}), seasonDays: 0 };
      const turned = state.world?.season !== sname;
      state.world = { ...(state.world || {}), season: sname, seasonNote: ch.note || '' };
      if (turned) note('season_turned', { place: resolvePlaceId('oldtown'), data: { season: sname }, text: `The Citadel sends out its white ravens: ${sname} has come${ch.note ? ` — ${ch.note}` : ''}.` });
      return { op, text: `The season turns: ${sname.toUpperCase()}${ch.note ? ' — ' + ch.note : ''}` };
    }
    case 'marriage_characters': case 'wed': {
      const a = findChar(state, ch.a), b = findChar(state, ch.b); if (!a || !b) throw new Error('unknown characters');
      state.characters[a].spouse = b; state.characters[b].spouse = a;
      note('wedding', { actors: [a, b], houses: [state.characters[a].house, state.characters[b].house], place: resolvePlaceId(state.characters[a].loc) || null });
      return { op, text: `${state.characters[a].name} weds ${state.characters[b].name}` };
    }
    case 'betroth': {
      const a = findChar(state, ch.a), b = findChar(state, ch.b); if (!a || !b) throw new Error('unknown characters');
      state.characters[a].betrothed = b; state.characters[b].betrothed = a;
      note('betrothal', { actors: [a, b], houses: [state.characters[a].house, state.characters[b].house] });
      return { op, text: `${state.characters[a].name} is betrothed to ${state.characters[b].name}` };
    }
    default:
      throw new Error('unknown op ' + op);
  }
}

export function nearestHolding(state, pos) {
  let best = null, bd = Infinity;
  for (const h of Object.values(state.holdings)) { const d = (h.pos[0] - pos[0]) ** 2 + (h.pos[1] - pos[1]) ** 2; if (d < bd) { bd = d; best = h.id; } }
  return best;
}

export function placeName(state, place) {
  if (Array.isArray(place)) return 'the field';
  if (isRef(place)) { const a = partyAt(state, place); return a ? `with ${a.name}` : 'in the field'; }
  const pid = resolvePlaceId(place);
  if (pid && state.holdings[pid]) return state.holdings[pid].name;
  if (pid && JUNCTIONS[pid]) return PLACE_NAMES[pid] || pid.replace(/_/g, ' ');
  if (state.characters?.[place]) return state.characters[place].name;
  return place ? String(place).replace(/_/g, ' ') : 'unknown';
}

export function fmt(n) {
  if (n === null || n === undefined || n === '') return '?';
  if (typeof n !== 'number') return String(n);
  return n.toLocaleString('en-US');
}
