// Ids and the names people use for things (docs/gdd/03-architecture.md §13; 04-ai-system.md §3.1).
//
// Two jobs. (1) New ids for things the engine creates — letters, orders, decisions, works — from a counter in the save,
// never from the clock or Math.random, so a replayed turn names things the same way. (2) Alias tables: every natural
// name for a place, person or house mapped to its canonical id. The Order Interpreter's parser and the schema builder
// for constrained model calls (server/ai/schema.js) read them; the prefix rule below keeps a grammar from forcing a
// model that began to write "the…" into the only member that starts that way (the bench's `the_wall` → `the_twins`).
import { HOUSES, PLACE_ALIASES } from '../../data/houses.js';
import { JUNCTIONS, PLACE_NAMES, PLACE_ALIAS_OF } from '../../data/geography.js';
import { PERSON_ALIASES } from '../../data/aliases.js';

export const slug = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

/** A new id from the save's counter: `<prefix><turn>_<n>`, stable under replay. */
export function nextId(state, prefix = 'x') {
  const m = state.meta = state.meta || {};
  m.seq = (m.seq || 0) + 1;
  return `${prefix}${m.turn ?? 0}_${m.seq}`;
}

// ── Alias tables: alias → canonical id ──────────────────────────────────────────────────────────────────────────────
const put = (map, alias, id) => { const a = slug(alias); if (a && !map.has(a)) map.set(a, id); };
const variants = (name) => { const s = slug(name); return [s, s.replace(/^the_/, ''), s.replace(/_of_.*$/, '')].filter(Boolean); };

/** Every name of every place in this world: holdings (id, name, full name, former names), PLACE_ALIASES, the atlas's places. */
export function placeAliases(state) {
  const map = new Map();
  for (const h of Object.values(state.holdings || {})) put(map, h.id, h.id);
  for (const h of Object.values(state.holdings || {})) {
    for (const n of [h.name, h.fullName, ...(h.formerNames || [])]) for (const v of variants(n)) put(map, v, h.id);
    put(map, 'the_' + slug(h.name).replace(/^the_/, ''), h.id);
  }
  for (const [alias, id] of Object.entries(PLACE_ALIASES)) if (state.holdings?.[id]) { put(map, alias, id); put(map, alias.replace(/^the_/, ''), id); put(map, 'the_' + alias.replace(/^the_/, ''), id); }
  // the atlas's named places; one standing on a castle is that castle, and a place's second id is its first
  const holdings = Object.values(state.holdings || {});
  const canonOf = (id) => {
    const [x, y] = JUNCTIONS[id]; const h = holdings.find((q) => Math.hypot(q.pos[0] - x, q.pos[1] - y) < 4);
    return h ? h.id : PLACE_ALIAS_OF[id] || id;
  };
  for (const id of Object.keys(JUNCTIONS)) if (canonOf(id) === id) put(map, id, id);
  for (const id of Object.keys(JUNCTIONS)) { const c = canonOf(id); put(map, id, c); for (const v of variants(PLACE_NAMES[id] || id)) put(map, v, c); }
  return map;
}
/** Every name of every living person: id, name, name without "Ser", bynames in quotes, the table of known bynames. */
export function personAliases(state, { alive = true } = {}) {
  const map = new Map(); const chars = Object.values(state.characters || {}).filter((c) => !alive || c.alive);
  for (const c of chars) put(map, c.id, c.id);
  for (const [alias, id] of Object.entries(PERSON_ALIASES)) if (state.characters?.[id] && (!alive || state.characters[id].alive)) put(map, alias, id);
  for (const c of chars) {
    put(map, c.name, c.id); put(map, c.name.replace(/^(Ser|Maester|Septa|Lord|Lady|Prince|Princess|King|Queen|Khal) /, ''), c.id);
    const by = /"([^"]+)"/.exec(c.name); if (by) { put(map, by[1], c.id); put(map, 'the_' + by[1], c.id); }
  }
  // a first name is a name only when it is nobody else's
  const first = new Map(); for (const c of chars) { const f = slug(c.name.replace(/^(Ser|Maester|Septa|Lord|Lady|Prince|Princess|King|Queen|Khal) /, '').split(' ')[0]); first.set(f, first.has(f) ? null : c.id); }
  for (const [f, id] of first) if (id && f.length > 2 && !['the', 'old', 'young', 'black', 'red', 'little', 'big'].includes(f)) put(map, f, id);
  // offices follow their holders
  const crown = Object.values(state.houses || {}).find((h) => h.rank === 'crown'); const king = crown && state.characters?.[crown.lord];
  if (king?.alive) for (const a of ['the_king', 'his_grace', 'the_crown']) put(map, a, king.id);
  // the King's wife is the Queen (a queen who rules in her own right is "the Queen" and "her grace" by the line above)
  const queen = king?.alive && (king.sex === 'f' ? king : state.characters?.[king.spouse]);
  if (queen?.alive) for (const a of ['the_queen', 'her_grace', 'queen']) put(map, a, queen.id);
  // a head of house by the title the realm gives them: "Lord Tully", "Lady Arryn", "Lord Hoster", "Lord Commander
  // Mormont" (a lord's first name only when no other lord shares it)
  const heads = Object.values(state.houses || {}).map((h) => [h, state.characters?.[h.lord]]).filter(([, c]) => c?.alive);
  const given = (c) => slug(c.name.replace(/^(Ser|Maester|Septa|Lord|Lady|Prince|Princess|King|Queen|Khal) /, '').split(' ')[0]);
  const lordsNamed = new Map(); for (const [, c] of heads) lordsNamed.set(given(c), (lordsNamed.get(given(c)) || 0) + 1);
  for (const [h, c] of heads) {
    const title = c.sex === 'f' ? 'lady' : 'lord';
    put(map, `${title}_${slug(h.name)}`, c.id);
    if (lordsNamed.get(given(c)) === 1) put(map, `${title}_${given(c)}`, c.id);
    if (h.id === 'nights_watch') for (const a of ['lord_commander', 'the_lord_commander', `lord_commander_${slug(c.name.split(' ').at(-1))}`]) put(map, a, c.id);
  }
  return map;
}
// "war on the ironborn", "spies among the wildlings": a people, for the house that speaks for it
const PEOPLES = { ironborn: 'greyjoy', ironmen: 'greyjoy', northmen: 'stark', wildlings: 'free_folk', free_folk: 'free_folk', westermen: 'lannister', rivermen: 'tully', dornishmen: 'martell', dornish: 'martell', valemen: 'arryn', stormlanders: 'baratheon_se', reachmen: 'tyrell', crows: 'nights_watch', black_brothers: 'nights_watch', the_watch: 'nights_watch', dothraki: 'dothraki' };
/** Every name of every house: id, "House X", the name, the plural ("the Freys"), and the people it leads ("the ironborn"). */
export function houseAliases(state) {
  const map = new Map();
  for (const h of Object.values(state.houses || {})) put(map, h.id, h.id);
  for (const h of Object.values(state.houses || {})) {
    const n = slug(h.name); put(map, n, h.id); put(map, 'house_' + n, h.id); put(map, n + 's', h.id); put(map, 'the_' + n + 's', h.id);
  }
  // the peoples of the realm by the names they go by, for the house that leads them
  for (const [alias, id] of Object.entries(PEOPLES)) if (state.houses?.[id]) { put(map, alias, id); put(map, 'the_' + alias, id); }
  return map;
}

/**
 * Pairs of aliases where one is a strict prefix of the other but they name different things (04 §3.1 rule 2): a
 * grammar would let a model stop early on the shorter one, or force it into the longer. Returns [[short, long], …].
 */
export function prefixConflicts(map) {
  const keys = [...map.keys()].sort(); const out = [];
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length && keys[j].startsWith(keys[i]); j++) {
      // "frey" and "frey_" + more: a prefix only counts at a word boundary or when the short one is a whole word of the long
      if (map.get(keys[i]) !== map.get(keys[j])) out.push([keys[i], keys[j]]);
    }
  }
  return out;
}
/** The canonical id for a name of a kind ('place' | 'person' | 'house'), or null. */
export function resolveName(state, kind, name) {
  const map = kind === 'place' ? placeAliases(state) : kind === 'person' ? personAliases(state) : houseAliases(state);
  return map.get(slug(name)) || map.get(slug(name).replace(/^the_/, '')) || null;
}

export const HOUSE_IDS = new Set(HOUSES.map((h) => h.id));
