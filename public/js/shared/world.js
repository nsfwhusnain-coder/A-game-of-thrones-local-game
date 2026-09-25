// Shared world logic used by both the server (simulation) and the browser (display).
import { HOUSES, EXTRA_HOLDINGS, PLACE_ALIASES } from '../../data/houses.js';
import { CHARACTERS } from '../../data/characters.js';
import { SCENARIOS } from '../../data/scenarios.js';
import { JUNCTIONS, PLACE_NAMES, LAND, LAKES } from '../../data/geography.js';
import { MAP_VERSION, warpOld } from '../../data/warp.js';
import { ANCESTORS, PARENTS, SPOUSES, deriveSkills } from '../../data/families.js';
import { initEconomy, TAX_LEVELS, project } from './economy.js';
import { heirOf } from './people.js';

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
  const a0 = Math.random() * Math.PI * 2;
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

export function createInitialState(scenarioId, playerHouse) {
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
    characters[c.id] = { ...c, loc: c.loc ? (resolvePlaceId(c.loc) || c.loc) : null, status: c.alive === false ? 'dead' : 'free', opinion: 0, loyalty: 60, memories: [] };
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
  const armies = {};
  for (const a of sc.armies) {
    const at = resolvePlaceId(a.at);
    armies[a.id] = { ...a, at, pos: placePos(at, holdings) || [0, 0], dest: null, morale: 70, supply: 80, asOf: dateStr(sc.date) };
  }
  const relations = {};
  for (const [a, b, v] of sc.relations) relations[relKey(a, b)] = { v, note: '' };

  const state = {
    version: 2,
    meta: {
      scenario: sc.id, scenarioName: sc.name, player: playerHouse, date: { ...sc.date }, turn: 0, mapVersion: MAP_VERSION,
      created: new Date().toISOString(),
    },
    houses, characters, holdings, armies, relations,
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
  return state;
}

/** Bring older saves up to date with new world features. */
export function migrateState(state) {
  // Saves from the first, hand-drawn map: carry every position onto the atlas
  if ((state.meta.mapVersion || 1) < MAP_VERSION) {
    const canon = new Map([...HOUSES.filter((h) => h.seat && !h.landless).map((h) => [h.id, h.pos]), ...EXTRA_HOLDINGS.map((e) => [e[0], [e[2], e[3]]])]);
    for (const h of Object.values(state.holdings)) h.pos = canon.has(h.id) ? [...canon.get(h.id)] : warpOld(h.pos);
    for (const h of Object.values(state.holdings)) h.coastal = isCoastal(h.pos);
    for (const h of Object.values(state.houses)) if (canon.has(h.id)) h.pos = [...canon.get(h.id)]; else if (h.pos) h.pos = warpOld(h.pos);
    for (const a of Object.values(state.armies)) {
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
function generateLord(h, year) {
  let seed = 0; for (const ch of h.id) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
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
    roles: essos ? ['ruler'] : [female ? 'lady' : 'lord'], traits, bio: `Head of House ${h.name}.`, alive: true, status: 'free', opinion: 0, loyalty: 50 + Math.floor(rnd() * 40), memories: [], generated: true, gender: female ? 'f' : 'm',
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
  let first = pool[Math.floor(Math.random() * pool.length)], id = slug(`${first}_${surname}`), n = 2;
  while (state.characters[id]) id = slug(`${first}_${surname}_${n++}`);
  const lord = state.characters[h.lord];
  const traits = [TRAIT_POOL[Math.floor(Math.random() * TRAIT_POOL.length)]].join(', ');
  const year = state.meta?.date?.year || 298;
  const c = { id, name: `${first} ${surname}`, house: houseId, title: '', age, born: year - age, loc: h.seat || houseId, roles: ['family'], traits, bio: `${female ? 'Daughter' : 'Son'} of House ${h.name}${lord ? `, kin to ${lord.name}` : ''}.`, alive: true, status: 'free', opinion: 0, loyalty: 60, memories: [], generated: true, gender: female ? 'f' : 'm', skills: deriveSkills({ roles: ['family'], traits, age }) };
  if (lord && lord.age - age >= 16) c[isFemaleLord(lord) ? 'mother' : 'father'] = lord.id;
  state.characters[id] = c;
  return c;
}
const isFemaleLord = (c) => c.gender === 'f' || /^(Lady|Queen|Princess)\b/.test(c.title || '');

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

// ---------- Calendar ----------
export const MONTHS = ['1st moon', '2nd moon', '3rd moon', '4th moon', '5th moon', '6th moon', '7th moon', '8th moon', '9th moon', '10th moon', '11th moon', '12th moon'];
export function dateStr(d) { return `${d.day} ${MONTHS[d.month - 1]}, ${d.year} AC`; }
export function addDays(d, days) {
  let total = (d.year * 12 + (d.month - 1)) * 30 + (d.day - 1) + days;
  const year = Math.floor(total / 360); total -= year * 360;
  const month = Math.floor(total / 30) + 1; const day = (total % 30) + 1;
  return { year, month, day };
}
export const SPANS = {
  '1w': { days: 7, label: 'one week' }, '2w': { days: 14, label: 'two weeks' }, '1m': { days: 30, label: 'one moon' },
  '3m': { days: 90, label: 'three moons' }, '6m': { days: 180, label: 'half a year' }, '1y': { days: 360, label: 'one year' },
};

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
function findChar(state, id) {
  if (!id) return null;
  const s = slug(id);
  if (state.characters[s]) return s;
  for (const c of Object.values(state.characters)) if (slug(c.name) === s || slug(c.name.replace(/^ser_/i, '')) === s.replace(/^ser_/, '')) return c.id;
  return null;
}
function findArmy(state, id) {
  if (!id) return null;
  if (state.armies[id]) return id;
  const s = slug(id);
  if (state.armies[s]) return s;
  for (const a of Object.values(state.armies)) if (slug(a.name) === s) return a.id;
  // A house named as the army: fine when that house fields exactly one host
  const hid = findHouse(state, s);
  if (hid) { const own = Object.values(state.armies).filter((a) => a.owner === hid); if (own.length === 1) return own[0].id; }
  return null;
}
function posOf(state, place) {
  if (Array.isArray(place) && place.length === 2) return [num(place[0]) ?? 0, num(place[1]) ?? 0];
  const pid = resolvePlaceId(place);
  if (pid) return placePos(pid, state.holdings);
  const c = findChar(state, place);
  if (c) return posOf(state, state.characters[c].loc);
  const a = findArmy(state, place);
  if (a) return [...state.armies[a].pos];
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
      const r = applyOne(state, ch, { date, src, ...ctx });
      if (r) applied.push(r); else rejected.push({ change: ch, reason: 'no effect' });
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
      const female = heir.gender === 'f' || /lady|princess|queen/i.test(heir.title || '');
      if (h.rank === 'crown') heir.title = `${female ? 'Queen' : 'King'} of the Andals and the First Men, ${female ? 'Lady' : 'Lord'} of the Seven Kingdoms`;
      else if (!/king|queen/i.test(heir.title || '')) heir.title = `${female ? 'Lady' : 'Lord'} of ${seat}`;
      heir.roles = [...new Set([...(heir.roles || []).filter((r) => r !== 'heir'), female ? 'lady' : 'lord'])];
      text = `SUCCESSION: ${heir.name} succeeds ${prev} as head of House ${h.name}${(heir.age ?? 20) < 16 ? ` — a child of ${heir.age}; a regent will rule in all but name` : ''}`;
    } else {
      const c = generateLord(h, state.meta.date.year);
      c.id = c.id + '_' + state.meta.turn; c.bio = `A cousin who claimed the seat of House ${h.name} when the main line failed.`;
      state.characters[c.id] = c; h.lord = c.id;
      text = `SUCCESSION: the main line of House ${h.name} has failed; a cousin, ${c.name}, claims the seat`;
    }
    state.chronicle.push({ date, text });
    out.push({ op: 'succession', text, house: h.id });
  }
  return out;
}

function applyOne(state, ch, ctx) {
  const { date, src } = ctx;
  if (!ch || typeof ch !== 'object') throw new Error('not an object');
  const op = String(ch.op || ch.type || '').toLowerCase();
  switch (op) {
    case 'figure': case 'figures': case 'house_figure': {
      const hid = findHouse(state, ch.house); if (!hid) throw new Error('unknown house ' + ch.house);
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
      const pos = posOf(state, ch.at || ch.location) || placePos(owner, state.holdings) || placePos(state.houses[owner].seat, state.holdings);
      if (!pos) throw new Error('no position');
      let id = slug(ch.id || ch.name || `${owner}_host`);
      while (state.armies[id]) id += '_2';
      const men = Math.max(0, Math.round(num(ch.men) ?? 0));
      state.armies[id] = {
        id, owner, name: ch.name || `Host of ${state.houses[owner].name}`, commander: findChar(state, ch.commander) || ch.commander || null,
        at: resolvePlaceId(ch.at || ch.location), pos, dest: null, men, ships: num(ch.ships) ?? undefined,
        type: op === 'fleet_create' || ch.type === 'fleet' ? 'fleet' : 'army', composition: ch.composition || '',
        status: ch.status || 'mustering', morale: num(ch.morale) ?? 70, supply: num(ch.supply) ?? 80, asOf: date,
      };
      return { op, text: `${state.armies[id].name} (${state.houses[owner].name}) ${men ? fmt(men) + ' men' : ''} appears at ${placeName(state, ch.at || ch.location) || 'the field'}` };
    }
    case 'army_move': case 'fleet_move': case 'move_army': {
      const id = findArmy(state, ch.army || ch.id); if (!id) throw new Error('unknown army ' + (ch.army || ch.id));
      const a = state.armies[id];
      const dest = posOf(state, ch.to);
      if (!dest) throw new Error('unknown destination ' + ch.to);
      const p = clamp(num(ch.progress) ?? 1, 0, 1);
      const from = a.pos;
      a.pos = [from[0] + (dest[0] - from[0]) * p, from[1] + (dest[1] - from[1]) * p];
      if (p >= 1) { a.at = resolvePlaceId(ch.to); a.dest = null; a.destName = null; } else { a.at = null; a.dest = dest; a.destName = placeName(state, ch.to); }
      if (ch.status) a.status = ch.status;
      a.asOf = date; a.movedTurn = state.meta.turn;
      if (a.march && p >= 1 && resolvePlaceId(ch.to) === resolvePlaceId(a.march.to)) delete a.march;
      return { op, text: `${a.name} ${p >= 1 ? 'arrives at' : 'marches toward'} ${placeName(state, ch.to)}` };
    }
    case 'army_update': case 'fleet_update': {
      const id = findArmy(state, ch.army || ch.id); if (!id) throw new Error('unknown army ' + (ch.army || ch.id));
      const a = state.armies[id]; const out = [];
      const men = num(ch.men), d = num(ch.delta);
      if (men !== null || d !== null) {
        const old = a.men; let nv = Math.max(0, Math.round(men ?? a.men + d));
        // Physics of the realm: without a battle, siege, ambush, plague or wreck a host loses men only to
        // desertion, sickness and weather: ~2% a moon in summer, 4% in autumn, 8% in winter.
        const violent = ctx.battleHouses?.has(a.owner) || /battle|siege|storm(ed|ing)|ambush|assault|slaughter|massacre|plague|pox|flux|shipwreck|wreck|drown|sack/i.test(`${ch.cause || ''} ${ch.reason || ''} ${ch.note || ''} ${ch.status || ''}`);
        if (nv < old && !violent && a.type !== 'fleet' && ctx.source !== 'Your decision') {
          const season = state.world?.season || 'summer';
          const rate = ({ summer: 0.02, spring: 0.025, autumn: 0.04, winter: 0.08 })[season] ?? 0.03;
          const months = Math.max(1, (ctx.spanDays || 30) / 30);
          const floor = Math.round(old * (1 - Math.min(0.5, rate * months * (/march/.test(a.status || '') ? 1.5 : 1))));
          if (nv < floor) { nv = floor; out.push(`(losses limited: no battle, ${season})`); }
        }
        a.men = nv; out.push(`men ${fmt(old)} → ${fmt(a.men)}`);
      }
      if (num(ch.ships) !== null) { a.ships = num(ch.ships); out.push(`ships ${a.ships}`); }
      for (const k of ['morale', 'supply']) if (num(ch[k]) !== null) { a[k] = clamp(num(ch[k]), 0, 100); out.push(`${k} ${a[k]}`); }
      if (ch.status) { a.status = ch.status; out.push(ch.status); }
      if (ch.commander) { a.commander = findChar(state, ch.commander) || ch.commander; out.push('new commander'); }
      if (ch.owner) { const o = findHouse(state, ch.owner); if (o) { a.owner = o; out.push('changes allegiance to ' + state.houses[o].name); } }
      if (ch.name) a.name = ch.name;
      if (ch.composition) a.composition = ch.composition;
      a.asOf = date;
      if (a.men <= 0 && a.type !== 'fleet') { delete state.armies[id]; return { op, text: `${a.name} has ceased to exist` }; }
      return { op, text: `${a.name}: ${out.join(', ')}` };
    }
    case 'army_destroy': case 'army_disband': case 'fleet_destroy': {
      const id = findArmy(state, ch.army || ch.id); if (!id) throw new Error('unknown army');
      const gone = state.armies[id]; const n = gone.name;
      const home = gone.at || nearestHolding(state, gone.pos);
      for (const c of Object.values(state.characters)) if (c.loc === 'army:' + id) c.loc = home;
      delete state.armies[id];
      return { op, text: `${n} ${op === 'army_disband' ? 'disbands' : 'is destroyed'}${ch.reason ? ' — ' + ch.reason : ''}` };
    }
    case 'holding': case 'holding_update': case 'province': {
      const hid = resolvePlaceId(ch.id || ch.holding || ch.place); if (!hid || !state.holdings[hid]) throw new Error('unknown holding ' + (ch.id || ch.holding));
      const h = state.holdings[hid]; const out = [];
      if (ch.owner) { const o = findHouse(state, ch.owner); if (!o) throw new Error('unknown owner'); if (o !== h.owner) { out.push(`passes from ${state.houses[h.owner]?.name} to ${state.houses[o].name}`); h.owner = o; } }
      for (const k of ['unrest', 'prosperity']) if (num(ch[k]) !== null) { h[k] = clamp(num(ch[k]), 0, 100); out.push(`${k} ${h[k]}`); }
      if (num(ch.garrison) !== null) { h.garrison = Math.max(0, Math.round(num(ch.garrison))); out.push(`garrison ~${fmt(h.garrison)}`); }
      if (num(ch.population) !== null) { h.population = Math.max(0, Math.round(num(ch.population))); out.push(`population ~${fmt(h.population)}`); }
      if (num(ch.fort) !== null) { h.fort = Math.max(0, Math.min(6, num(ch.fort))); out.push(`fortifications ${h.fort}`); }
      if (ch.building) { h.buildings = [...new Set([...(h.buildings || []), String(ch.building)])]; out.push('builds ' + ch.building); }
      if (ch.resource && typeof ch.resource === 'object') { const t = String(ch.resource.type); h.resources[t] = Math.max(0, (h.resources[t] || 0) + (num(ch.resource.delta) ?? 0)); out.push(`${t} ${num(ch.resource.delta) > 0 ? 'up' : 'down'}`); }
      if (ch.status) { h.status = ch.status; out.push(ch.status); }
      if (ch.name && String(ch.name).trim() && ch.name !== h.name) { out.push(`renamed from ${h.name}`); h.formerNames = [...(h.formerNames || []), h.name]; h.name = String(ch.name).trim().slice(0, 60); registerPlaces(state); }
      if (ch.type && HOLDING_TYPES.includes(ch.type)) { h.type = ch.type; out.push(ch.type); }
      if (ch.note) { h.notes.push(`${date}: ${ch.note}`); h.notes = h.notes.slice(-8); }
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
      const pos = landNear(near, ch.at && !ch.near ? 0 : 8 + Math.random() * 6);
      if (!pos) throw new Error('no dry land there');
      const type = HOLDING_TYPES.includes(ch.type) ? ch.type : 'castle';
      const region = nearestHolding(state, pos) ? state.holdings[nearestHolding(state, pos)].region : state.houses[owner].region;
      state.holdings[id] = { id, name, fullName: name, pos, owner, seatOf: null, region, type, prosperity: 40, unrest: 15, garrison: null, status: 'normal', notes: [ch.note ? `${date}: ${ch.note}` : `${date}: founded`], resources: {}, population: type === 'town' ? 4000 : type === 'camp' ? 800 : 1500, coastal: isCoastal(pos), founded: date };
      registerPlaces(state);
      return { op, text: `${name} is raised by House ${state.houses[owner].name} near ${placeName(state, ch.at || ch.near)}` };
    }
    case 'landmark': case 'map_label': {
      // a named spot on the map: a battlefield, a camp, a ford where something happened
      const text = String(ch.name || ch.text || '').trim(); if (!text) throw new Error('a landmark needs a name');
      state.landmarks = state.landmarks || [];
      if (ch.remove) { state.landmarks = state.landmarks.filter((l) => l.name !== text); return { op, text: `Landmark removed: ${text}` }; }
      const pos = Array.isArray(ch.at) ? ch.at : posOf(state, ch.at); if (!pos) throw new Error('unknown place ' + ch.at);
      state.landmarks = [...state.landmarks.filter((l) => l.name !== text), { name: text, pos: [pos[0] + (Math.random() - 0.5) * 6, pos[1] + (Math.random() - 0.5) * 6], kind: ch.kind || 'site', note: ch.note || '', date }].slice(-40);
      return { op, text: `On the map: ${text}` };
    }
    case 'character': case 'character_update': {
      const cid = findChar(state, ch.id || ch.character); if (!cid) throw new Error('unknown character ' + (ch.id || ch.character));
      const c = state.characters[cid]; const out = [];
      if (ch.alive === false && c.alive) { c.alive = false; c.status = 'dead'; out.push('has died' + (ch.cause ? ` (${ch.cause})` : '')); }
      if (ch.loc || ch.location || ch.with) {
        const raw = ch.with || ch.loc || ch.location;
        const army = findArmy(state, String(raw).replace(/^army:/, ''));
        const l = army && !resolvePlaceId(raw) ? 'army:' + army : (resolvePlaceId(raw) || String(raw));
        c.loc = l; out.push((army ? 'travels with ' : 'now at ') + placeName(state, l));
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
      return { op, text: `${c.name} ${out.join(', ') || 'updated'}` };
    }
    case 'character_new': case 'new_character': {
      const house = findHouse(state, ch.house) || 'baratheon';
      let id = slug(ch.id || ch.name); if (!id) throw new Error('no name');
      if (state.characters[id]) return applyOne(state, { ...ch, op: 'character', id }, { date, src });
      state.characters[id] = {
        id, name: ch.name || id, house, title: ch.title || '', age: num(ch.age) ?? 30, loc: resolvePlaceId(ch.loc || ch.location) || ch.loc || state.houses[house].seat,
        roles: Array.isArray(ch.roles) ? ch.roles : [ch.role || 'family'].filter(Boolean), traits: ch.traits || '', bio: ch.bio || '', alive: true, status: 'free', opinion: num(ch.opinion) ?? 0, loyalty: 60, memories: [], generated: true,
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
      return { op, text: `${h.name}: ${out.join(', ') || 'updated'}` };
    }
    case 'war': {
      const status = String(ch.status || 'start').toLowerCase();
      if (status === 'start' || status === 'declare' || status === 'ongoing') {
        const att = (Array.isArray(ch.attackers) ? ch.attackers : [ch.attacker]).map((x) => findHouse(state, x)).filter(Boolean);
        const def = (Array.isArray(ch.defenders) ? ch.defenders : [ch.defender]).map((x) => findHouse(state, x)).filter(Boolean);
        if (!att.length || !def.length) throw new Error('war needs sides');
        const id = slug(ch.id || ch.name || `${att[0]}_vs_${def[0]}`);
        const existing = state.wars.find((w) => w.id === id);
        if (existing) { existing.attackers = [...new Set([...existing.attackers, ...att])]; existing.defenders = [...new Set([...existing.defenders, ...def])]; return { op, text: `${existing.name} widens` }; }
        state.wars.push({ id, name: ch.name || `War of ${state.houses[att[0]].name} against ${state.houses[def[0]].name}`, attackers: att, defenders: def, started: date, status: 'ongoing', note: ch.reason || ch.note || '' });
        return { op, text: `WAR: ${state.wars.at(-1).name}` };
      }
      const w = state.wars.find((x) => x.id === slug(ch.id || ch.name) || slug(x.name) === slug(ch.name || ''));
      if (!w) throw new Error('unknown war');
      w.status = 'ended'; w.ended = date; w.outcome = ch.outcome || '';
      return { op, text: `PEACE: ${w.name} ends${ch.outcome ? ' — ' + ch.outcome : ''}` };
    }
    case 'war_join': {
      const w = state.wars.find((x) => x.id === slug(ch.war || ch.id) || slug(x.name) === slug(ch.war || ''));
      const hid = findHouse(state, ch.house); if (!w || !hid) throw new Error('bad war_join');
      (ch.side === 'defender' ? w.defenders : w.attackers).push(hid);
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
        return { op, text: `${type} between ${state.houses[a].name} and ${state.houses[b].name} ${ex.status}` };
      }
      if (ex) { Object.assign(ex, { terms: ch.terms || ex.terms, status }); return { op, text: `${type} between ${state.houses[a].name} and ${state.houses[b].name}: ${status}` }; }
      state.pacts.push({ id, type, a, b, terms: ch.terms || '', status, since: date });
      return { op, text: `${type.toUpperCase()}: ${state.houses[a].name} & ${state.houses[b].name}${ch.terms ? ' — ' + ch.terms : ''}` };
    }
    case 'battle': {
      const pos = posOf(state, ch.at || ch.location);
      state.battles = state.battles || [];
      state.battles.push({ name: ch.name || `Battle at ${placeName(state, ch.at)}`, pos, date, turn: state.meta.turn, attacker: findHouse(state, ch.attacker), defender: findHouse(state, ch.defender), victor: findHouse(state, ch.victor), losses: ch.losses || {}, summary: ch.summary || '' });
      state.battles = state.battles.slice(-40);
      return { op, text: `BATTLE: ${state.battles.at(-1).name}${ch.victor ? ' — victory for ' + (state.houses[findHouse(state, ch.victor)]?.name || ch.victor) : ''}` };
    }
    case 'raven': case 'letter': case 'message': {
      const from = findChar(state, ch.from);
      state.ravens.unshift({ id: Date.now() + Math.random(), from: from || null, fromName: from ? state.characters[from].name : (ch.fromName || ch.from || 'Unknown'), text: String(ch.text || ''), date, read: false });
      state.ravens = state.ravens.slice(0, 60);
      return { op, text: `A raven arrives from ${state.ravens[0].fromName}` };
    }
    case 'decision': case 'choice': {
      const opts = (Array.isArray(ch.options) ? ch.options : []).map((o) => (typeof o === 'string' ? { label: o } : { label: String(o.label || o.text || ''), hint: String(o.hint || o.effect || ''), ...(Array.isArray(o.fx) ? { fx: o.fx } : {}) })).filter((o) => o.label);
      if (opts.length < 2) throw new Error('a decision needs at least two options');
      state.decisions = state.decisions || [];
      const d = { id: slug(ch.id || ch.title || 'decision') + '_' + Math.random().toString(36).slice(2, 6), title: String(ch.title || 'A decision'), text: String(ch.text || ''), from: findChar(state, ch.from) || null, options: opts, date, turn: state.meta.turn, status: 'pending' };
      state.decisions.push(d);
      return { op, text: `A decision awaits you: ${d.title}` };
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
      state.houses[hid].policy = { ...(state.houses[hid].policy || {}), tax: lvl };
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
      const cost = Math.max(0, num(ch.cost) ?? 1000), months = Math.max(0.25, num(ch.months) ?? 3);
      const hold = resolvePlaceId(ch.holding || ch.at) || state.houses[hid].seat;
      const p = { id: slug(ch.id || ch.name || 'project') + '_' + Math.random().toString(36).slice(2, 6), house: hid, name: ch.name || 'Works', holding: hold, cost, remaining: cost, perMonth: cost / months, months, monthsLeft: months, effect: ch.effect || {}, status: 'active', started: date };
      state.projects.push(p);
      return { op, text: `House ${state.houses[hid].name} begins: ${p.name} (${fmt(cost)} gd over ${months} moons)` };
    }
    case 'season': {
      const sname = String(ch.season || '').toLowerCase();
      if (!['summer', 'autumn', 'winter', 'spring'].includes(sname)) throw new Error('bad season');
      if (state.world?.season !== sname) state.world = { ...(state.world || {}), seasonDays: 0 };
      state.world = { ...(state.world || {}), season: sname, seasonNote: ch.note || '' };
      return { op, text: `The season turns: ${sname.toUpperCase()}${ch.note ? ' — ' + ch.note : ''}` };
    }
    case 'marriage_characters': case 'wed': {
      const a = findChar(state, ch.a), b = findChar(state, ch.b); if (!a || !b) throw new Error('unknown characters');
      state.characters[a].spouse = b; state.characters[b].spouse = a;
      return { op, text: `${state.characters[a].name} weds ${state.characters[b].name}` };
    }
    case 'betroth': {
      const a = findChar(state, ch.a), b = findChar(state, ch.b); if (!a || !b) throw new Error('unknown characters');
      state.characters[a].betrothed = b; state.characters[b].betrothed = a;
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
  if (typeof place === 'string' && place.startsWith('army:')) { const a = state.armies?.[place.slice(5)]; return a ? `with ${a.name}` : 'in the field'; }
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
