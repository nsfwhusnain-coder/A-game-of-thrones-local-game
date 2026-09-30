// The people of the screen (docs/gdd/17-ui-declutter.md §4 U9; 12 §15): who is in your house and about your court, how a lord is, and whose faces belong on a
// card. Pure functions of the state the player is sent, so node can test them; ui/windows.js and ui/tree.js draw them. Nothing here removes a portrait or a tree:
// it puts the people you care about first, and the whole realm's behind a search.
import { childrenOf, siblingsOf, vassalsOf } from '../shared/world.js';
import { guestsAt } from '../shared/retinues.js';
import { placeOf } from '../engine/parties.js';
import { regencyLine } from '../shared/regency.js';

/**
 * How a person is, in a word and a tone (`good`, `warn`, `bad`, `quiet`): what the ruler's plate says beside the medallion and the ring round it. Only what the house
 * may see of its own people (a wound is a wound; whether it will fester is not told).
 */
export function conditionOf(state, c) {
  if (!c) return { word: '', tone: 'quiet' };
  if (!c.alive) return { word: 'dead', tone: 'bad' };
  const st = String(c.status || '');
  if (/imprison|captive|hostage/i.test(st)) return { word: 'a prisoner', tone: 'bad' };
  if (/missing|lost/i.test(st)) return { word: 'missing', tone: 'bad' };
  if (/wounded/i.test(st)) return { word: 'wounded', tone: 'bad' };
  if (/incapable|maimed|comatose|insensible/i.test(`${st} ${c.traits || ''}`)) return { word: 'unfit to rule', tone: 'bad' };
  if (/ailing|dying|sick|abed|frail/i.test(`${c.traits || ''} ${c.bio || ''}`)) return { word: 'ailing', tone: 'warn' };
  if ((c.age ?? 30) >= 65) return { word: 'advanced in years', tone: 'warn' };
  if ((c.age ?? 30) < 14) return { word: 'a child', tone: 'quiet' };
  return { word: 'in good health', tone: 'good' };
}

/**
 * How they regard your house, in a word and a tone, from their opinion of you (−100..100): what an audience's header says instead of a signed number (12 §5). `null` for your own people
 * and for the middling, who are neither for nor against you.
 */
export function regardOf(state, c) {
  if (!c || c.house === state.meta.player) return null;
  const o = Number(c.opinion) || 0;
  if (o >= 60) return { word: 'trusts you', tone: 'good' };
  if (o >= 25) return { word: 'well disposed', tone: 'good' };
  if (o <= -60) return { word: 'hostile to you', tone: 'bad' };
  if (o <= -25) return { word: 'wary of you', tone: 'warn' };
  return null;
}

const SEATS = [['steward', 'Steward'], ['maester', 'Maester'], ['spymaster', 'Whisperer'], ['castellan', 'Castellan'], ['master_of_arms', 'Master-at-arms'], ['master_at_arms', 'Master-at-arms'], ['kingsguard', 'Kingsguard'], ['council', 'Counsellor']];
/** The seat a counsellor holds, in a word, for the faces at the council table: their office, else their title, else "Counsellor". */
export function seatOf(c) {
  const roles = Array.isArray(c?.roles) ? c.roles : [];
  const hit = SEATS.find(([r]) => roles.includes(r)); if (hit) return hit[1];
  const t = String(c?.title || '').split(/[,;·]/)[0].trim();
  return t && t.length <= 24 ? t : 'Counsellor';
}

/** What the ruler's medallion says on hover: `{ name, title, house, age, condition: { word, tone }, regency, id }`. */
export function rulerCard(state, me = state.meta.player) {
  const h = state.houses[me]; const c = h?.lord ? state.characters[h.lord] : null;
  if (!c) return null;
  return { id: c.id, name: c.name, title: c.title || (c.roles || []).join(', '), house: h.name, age: c.age ?? null, condition: conditionOf(state, c), regency: regencyLine(state, me) || '' };
}

const SEX = { m: { child: 'Son', sib: 'Brother', unc: 'Uncle', nep: 'Nephew', gc: 'Grandson' }, f: { child: 'Daughter', sib: 'Sister', unc: 'Aunt', nep: 'Niece', gc: 'Granddaughter' } };
const term = (c, k) => (SEX[c.sex === 'f' ? 'f' : 'm'][k]);

/** The kin of a person, near first, each with what they are to them: `[{ c, role }]`, the living and the dead alike (the tree wants both; the household filters). */
export function kinOf(state, id) {
  const c = state.characters[id]; if (!c) return [];
  const ch = (x) => state.characters[x]; const out = []; const seen = new Set([id]);
  const add = (x, role) => { if (x && !seen.has(x.id)) { seen.add(x.id); out.push({ c: x, role }); } };
  add(ch(c.spouse), 'Spouse'); add(ch(c.betrothed), 'Betrothed');
  add(ch(c.father), 'Father'); add(ch(c.mother), 'Mother');
  for (const k of childrenOf(state, id)) add(k, term(k, 'child'));
  for (const b of siblingsOf(state, id)) add(b, term(b, 'sib'));
  for (const k of childrenOf(state, id)) for (const g of childrenOf(state, k.id)) add(g, term(g, 'gc'));
  for (const p of [ch(c.father), ch(c.mother)]) if (p) { add(ch(p.father), 'Grandfather'); add(ch(p.mother), 'Grandmother'); for (const u of siblingsOf(state, p.id)) add(u, term(u, 'unc')); }
  for (const b of siblingsOf(state, id)) for (const n of childrenOf(state, b.id)) add(n, term(n, 'nep'));
  return out;
}

const OFFICES = ['steward', 'maester', 'master_at_arms', 'captain', 'commander', 'spymaster', 'castellan'];
/**
 * The People tab, by default (the search still reaches everyone in the realm): `[{ id, title, hint, rows: [{ c, role }] }]` — **your family** (the living kin of your ruler),
 * **your household** (your own people who are not kin: officers first, then knights, then the rest), **guests and wards** at your seat, and **your bannermen** (the lords
 * of your sworn houses). A section with no one in it is left out.
 */
export function peopleSections(state, me = state.meta.player) {
  const h = state.houses[me]; if (!h) return [];
  const ruler = h.lord ? state.characters[h.lord] : null; const seat = h.seat;
  const used = new Set(ruler ? [ruler.id] : []);
  const take = (rows) => rows.filter((r) => r.c && !used.has(r.c.id) && (used.add(r.c.id), true));
  const family = take(ruler ? kinOf(state, ruler.id).filter((k) => k.c.alive && ['Spouse', 'Betrothed', 'Father', 'Mother', 'Son', 'Daughter', 'Brother', 'Sister', 'Grandson', 'Granddaughter'].includes(k.role)) : []);
  const rank = (c) => { const i = OFFICES.findIndex((o) => (c.roles || []).includes(o)); return i >= 0 ? i : (c.roles || []).includes('knight') ? 20 : 40; };
  const roleOf = (c) => { const o = OFFICES.find((x) => (c.roles || []).includes(x)); return o ? o.replace(/_/g, '-').replace(/^./, (m) => m.toUpperCase()) : (c.roles || []).includes('knight') ? 'Knight' : (c.roles || []).includes('maester') ? 'Maester' : (c.title || '').split(',')[0] || ''; };
  const household = take(Object.values(state.characters).filter((c) => c.alive && c.house === me && !used.has(c.id)).sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name)).map((c) => ({ c, role: roleOf(c) })));
  const guests = seat ? take([...guestsAt(state, seat), ...Object.values(state.characters).filter((c) => c.alive && c.house !== me && placeOf(state, c) === seat)].filter((c, i, a) => a.indexOf(c) === i).sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({ c, role: /hostage|ward/i.test(c.status || '') ? 'Ward' : `of House ${state.houses[c.house]?.name || '?'}` }))) : [];
  const men = take(vassalsOf(state, me).map((v) => state.houses[v]).filter((x) => x?.lord && state.characters[x.lord]?.alive).sort((a, b) => a.name.localeCompare(b.name)).map((x) => ({ c: state.characters[x.lord], role: `Lord of ${state.holdings?.[x.seat]?.name || x.name}` })));
  return [
    { id: 'family', title: 'Your family', hint: 'Those of your blood and your bed', rows: family },
    { id: 'household', title: 'Your household', hint: 'Officers, knights and servants of House ' + h.name, rows: household },
    { id: 'guests', title: 'Guests and wards', hint: `Under your roof at ${state.holdings?.[seat]?.name || 'your seat'}`, rows: guests },
    { id: 'bannermen', title: 'Your bannermen', hint: 'The lords sworn to you', rows: men },
  ].filter((s) => s.rows.length);
}

/**
 * The faces of a story: up to `max` people named in a card's headline (`e.who`, ids of people and of houses), in the order the headline names them — those of the story who are
 * people, never a house. `[character ids]`.
 */
export function peopleOfCard(state, e, max = 2) {
  const out = [];
  for (const id of e?.who || []) { if (state.characters?.[id] && !out.includes(id)) out.push(id); if (out.length >= max) break; }
  return out;
}
