// Names are links (docs/gdd/12-ui-ux.md §15.3; WP F7). Wherever the game's text names someone — a chronicle card, a letter, a receipt, a scene in an audience, a matter — the name is a link
// with a dotted underline: hover shows who they are (face, title, house, where) and a click opens their sheet. This is the pure side: the roster of the forms a name may take, the
// matcher that finds them in a plain string and returns markup, the hover card and the line "what they are to you". A name that could mean more than one person is not a link
// (a wrong link is worse than none), and a single first name is never one: "Ser Rodrik" and "Rodrik Cassel" are, "Rodrik" alone is not.
import { kinOf } from './people.js';
import { vassalsOf } from '../shared/world.js';

const HONORIFICS = ['Ser', 'Lord', 'Lady', 'Maester', 'Septon', 'Septa', 'Prince', 'Princess', 'King', 'Queen', 'Khal', 'Archmaester', 'Grand Maester', 'High Septon', 'Lord Commander', 'Maegi', 'Master', 'Captain'];
const HON_RE = new RegExp(`^(${[...HONORIFICS].sort((a, b) => b.length - a.length).join('|')})\\s+`);
const escRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The forms a person's name takes in text: "Ser Rodrik Cassel", "Rodrik Cassel", "Ser Rodrik". Never a bare first name, never a single short word. */
export function formsOf(name) {
  const full = String(name || '').trim(); if (!full) return [];
  const out = new Set(); const m = HON_RE.exec(full); const bare = m ? full.slice(m[0].length) : full;
  if (/\s/.test(full)) out.add(full); if (/\s/.test(bare)) out.add(bare);
  const given = bare.split(/\s+/)[0];
  if (m && given.length > 2 && /^[A-Z]/.test(given)) out.add(`${m[1]} ${given}`);
  return [...out].filter((f) => f.length >= 6);
}

/**
 * The roster of a game: `{ re, byForm }` — one pattern over every form that means exactly one person (or one house: "House Stark"), the longest first, and the map from a form to what it names,
 * `{ kind: 'char' | 'house', id }`. The living and the dead alike are in it (the chronicle tells of the dead). Cheap to ask again for the same game state: it is kept per state.
 */
const kept = new WeakMap();
export function rosterOf(state) {
  const sig = `${Object.keys(state.characters || {}).length}|${Object.keys(state.houses || {}).length}|${state.meta?.turn}`;
  const c = kept.get(state); if (c && c.sig === sig) return c.roster;
  const seen = new Map(); // form → Set of "kind:id"
  const add = (form, key) => { if (!seen.has(form)) seen.set(form, new Set()); seen.get(form).add(key); };
  for (const c2 of Object.values(state.characters || {})) for (const f of formsOf(c2.name)) add(f, `char:${c2.id}`);
  for (const h of Object.values(state.houses || {})) if (h.name && h.rank !== 'order' && /^[A-Z]/.test(h.name)) add(`House ${h.name}`, `house:${h.id}`);
  const byForm = new Map(); for (const [f, ids] of seen) if (ids.size === 1) { const [kind, id] = [...ids][0].split(':'); byForm.set(f, { kind, id }); }
  const forms = [...byForm.keys()].sort((a, b) => b.length - a.length || a.localeCompare(b));
  const re = forms.length ? new RegExp(`(?<![\\p{L}\\p{N}_'’-])(${forms.map(escRe).join('|')})(?![\\p{L}\\p{N}_-])`, 'gu') : null;
  const roster = { re, byForm, size: forms.length };
  kept.set(state, { sig, roster });
  return roster;
}

/** Every name in `text` that is a link: `[{ form, kind, id, at }]`, in order. */
export function namesIn(text, roster) {
  if (!roster?.re) return [];
  const out = []; for (const m of String(text ?? '').matchAll(roster.re)) { const t = roster.byForm.get(m[1]); if (t) out.push({ form: m[1], ...t, at: m.index }); }
  return out;
}

/**
 * A plain string as markup, every name in it a link: `<span class="nm" role="link" tabindex="0" data-char="…">Name</span>` (a house: `data-house`). The rest is escaped with `esc`.
 * Nothing is added that the text did not say.
 */
export function linkNames(text, roster, esc) {
  const t = String(text ?? ''); const hits = namesIn(t, roster); if (!hits.length) return esc(t);
  let out = '', at = 0;
  for (const h of hits) { out += esc(t.slice(at, h.at)); out += `<span class="nm" role="link" tabindex="0" data-${h.kind === 'house' ? 'house' : 'char'}="${esc(h.id)}">${esc(h.form)}</span>`; at = h.at + h.form.length; }
  return out + esc(t.slice(at));
}

/** What a hover card says of a person: `{ id, name, title, house, houseId, where, status }` — only what the player's house already sees in its People list (title, where they are told to be, how they are). */
export function nameCardOf(state, id, { whereText = () => '' } = {}) {
  const c = state.characters?.[id]; if (!c) return null;
  const h = state.houses?.[c.house];
  return { id: c.id, name: c.name, title: c.title || (c.roles || []).filter((r) => r !== 'family').join(', '), house: h?.name || '', houseId: c.house, where: c.alive ? whereText(c) : '', status: !c.alive ? 'dead' : c.status && c.status !== 'free' ? c.status : '', age: c.age ?? null };
}

/** The hover card as markup. `env`: `{ esc, por(c, size), sig(house) }` — the face, the name, the house, the title and where they are. */
export function nameCardHtml(card, state, env) {
  const { esc } = env; const c = state.characters[card.id]; const h = state.houses?.[card.houseId];
  return `<div class="nc-face">${env.por(c, 64) ? `<img src="${esc(env.por(c, 64))}" alt="">` : ''}</div><div class="nc-text"><b>${esc(card.name)}</b>${card.house ? `<span class="nc-house">${env.sig ? env.sig(h) : ''}House ${esc(card.house)}</span>` : ''}${card.title ? `<span class="nc-title">${esc(card.title)}</span>` : ''}${card.where || card.status ? `<span class="nc-where">${esc([card.where, card.status].filter(Boolean).join(' · '))}</span>` : ''}</div>`;
}

/**
 * What a person is to the lord of the player's house, for the head of an audience: "your wife", "your son", "your bannerman", "your liege", "a lord sworn to House Tully"… or '' when they are
 * no kin and no bannerman. Kin are read from the same tree as the Family tree.
 */
export function relationOf(state, id) {
  const me = state.meta?.player; const lordId = state.houses?.[me]?.lord; const c = state.characters?.[id];
  if (!c || !lordId || id === lordId) return '';
  const kin = kinOf(state, lordId).find((k) => k.c.id === id);
  if (kin) { const r = { Spouse: 'your wife', Betrothed: 'your betrothed', Father: 'your father', Mother: 'your mother', Son: 'your son', Daughter: 'your daughter', Brother: 'your brother', Sister: 'your sister', Grandson: 'your grandson', Granddaughter: 'your granddaughter' }[kin.role]; if (r) return kin.c.sex === 'f' && kin.role === 'Spouse' ? 'your wife' : kin.c.sex === 'm' && kin.role === 'Spouse' ? 'your husband' : r; return `your ${kin.role.toLowerCase()}`; }
  const house = state.houses?.[c.house]; const mine = state.houses?.[me];
  if (c.house === me) return c.roles?.includes('council') ? 'of your council' : 'of your household';
  if (house && c.id === house.lord && house.liege === me) return 'your bannerman';
  if (mine?.liege && c.house === mine.liege && c.id === house?.lord) return 'your liege';
  if (house && house.liege && c.id === house.lord && vassalsOf(state, house.liege).includes(me)) return 'a fellow vassal';
  if (house && c.id === house.lord && house.liege) return `sworn to House ${state.houses[house.liege]?.name}`;
  return '';
}
