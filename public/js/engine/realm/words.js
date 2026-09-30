// How a figure of the State of the Realm is written (docs/gdd/19-realm-ledger.md §4.2, §8; WP R4, R5): a cell as text with its mark (~ ≈ ≥ —) and its age, and how a house is known in a line.
// One place for it, so the window the player reads, the brief the council hears and the dossier a lord's mind is given write every figure the same way, byte for byte.
// Pure: no DOM, no clock, no dice; a function of a cell the view sent.
import { ageText } from '../knowledge.js';

export const FIELD_LABEL = { power: 'Power', swords: 'Swords', levies: 'Levies', menAtArms: 'Men-at-arms', ships: 'Ships', holdings: 'Lands', people: 'People', gold: 'Coin', income: 'Income a moon', expenses: 'Outgoings', food: 'Food', debt: 'Debt', prosperity: 'Prosperity', unrest: 'Unrest' };
const WEALTH = { sound: 'said to be rich', modest: 'modest', pressed: 'pressed', unknown: '—' };
const VIA = { self: 'exact: your own house', sworn: 'sworn to you: read to a few in a hundred', seen: 'seen by your riders', reported: 'a raven or a rider told it', learned: 'a spy or a letter taught it', rumour: 'what the realm says of such a house' };
export const VIA_SHORT = { self: 'exact · your house', sworn: 'sworn', seen: 'seen', reported: 'a raven', learned: 'a spy', rumour: 'a rumour' };
/** Older than two turns is stale: a faded "?" (§4.2). */
export const STALE_AFTER = 2;

const n0 = (x) => Math.round(x).toLocaleString('en-GB');
/** A number for a table: whole with commas, and a k or an m only where it would run long. */
export function compact(n, field = '') {
  const x = Math.round(Number(n) || 0);
  if (field === 'people' || field === 'gold' || field === 'debt') { const a = Math.abs(x); if (a >= 1e6) return `${(x / 1e6).toFixed(1).replace(/\.0$/, '')}m`; if (a >= 1e4) return `${Math.round(x / 1000)}k`; }
  if (Math.abs(x) >= 1e6) return `${(x / 1e6).toFixed(1).replace(/\.0$/, '')}m`;
  return n0(x);
}
/** The edge of a band: a thousand and more in k, so a range fits a cell ("≈ 17k–100k"). */
const edge = (v, field) => (field === 'food' || Math.abs(v) < 10000 ? numberOf(v, field) : `${Math.round(v / 1000)}k`);
const numberOf = (v, field) => (field === 'food' ? `${String(Math.round(v) / 10).replace(/\.0$/, '')} moons` : field === 'income' || field === 'expenses' ? compact(v, field) : compact(v, field));

/**
 * One cell of a row as the window writes it: `{ text, kind, stale, title }`.
 * `kind` is exact | est | band | least | word | none, so the page can set an estimate in ink that says it is one; `text` carries the mark (~ ≈ ≥ —);
 * `stale` is true for word older than two turns (the page fades it and adds a "?"); `title` is the hover: how the word came, and how old it is.
 */
export function cellText(cell, field = '') {
  if (!cell || cell.mark === '—') return { text: '—', kind: 'none', stale: false, title: 'Nothing is known of this.' };
  if (cell.word !== undefined) { const t = WEALTH[cell.word] ?? cell.word; return t === '—' ? { text: '—', kind: 'none', stale: false, title: VIA[cell.via] || '' } : { text: t, kind: 'word', stale: false, title: `${VIA[cell.via] || 'as the realm says'}; a word, never a number` }; }
  const age = cell.age; const stale = typeof age === 'number' && age > STALE_AFTER;
  const via = VIA[cell.via] ? `${VIA[cell.via]}${typeof age === 'number' ? `, ${ageText(age)}` : ''}` : '';
  const m = cell.mark || '';
  if (m === '≈' && Array.isArray(cell.band)) return { text: `≈ ${edge(cell.band[0], field)}–${edge(cell.band[1], field)}`, kind: 'band', stale, title: `${via}; somewhere between the two` };
  const body = numberOf(cell.v, field);
  if (m === '~') return { text: `~${body}`, kind: 'est', stale, title: `${via}; an estimate` };
  if (m === '≥') return { text: `≥${body}`, kind: 'least', stale, title: `${via}; at least so many` };
  if (m === '≈') return { text: `≈${body}`, kind: 'band', stale, title: `${via}; a rough figure` };
  return { text: body, kind: 'exact', stale: false, title: via || 'exact' };
}

/** The line under a house's name: how its state is known, in the world's words. */
export function provenance(row) {
  // the freshest word of any figure the row carries (a lens shows only its own columns): a way it came, and how old it is
  const withVia = Object.values(row.cells || {}).filter((x) => x && x.via && x.mark !== '—');
  const c = withVia.filter((x) => typeof x.age === 'number').sort((a, b) => a.age - b.age)[0] || withVia[0] || {};
  if (c.via === 'self' || c.via === 'sworn') return VIA_SHORT[c.via] + (c.via === 'sworn' ? ' · this moon' : '');
  if (!c.via || c.mark === '—') return 'long unheard of';
  if (typeof c.age !== 'number') return VIA_SHORT[c.via] || c.via;
  const age = c.age <= 0 ? 'this moon' : c.age === 1 ? 'a turn old' : `${c.age} turns old`;
  return `${VIA_SHORT[c.via] || c.via}, ${age}`;
}

// ── wars ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const MOMENT = { gaining: ['gaining ground', 'up'], holding: ['holding', 'flat'], slipping: ['slipping', 'down'] };
/** A war's standing for the player, in words: "You are leading, gaining ground (+9 in 3 moons)"; null for a war it is not in (no score is known). */
export function warLine(war, moons = 3) {
  if (!war?.momentum) return null;
  const [m, cls] = MOMENT[war.momentum] || MOMENT.holding; const d = war.delta;
  const stand = war.standing === 'leading' ? 'You are leading' : war.standing === 'trailing' ? 'You are behind' : 'The war is level';
  return { text: `${stand}; ${m}${d ? ` (${d > 0 ? '+' : '−'}${Math.abs(d)} in ${moons} moons)` : ''}`, cls };
}
/** "~31,000 vs ≥52,000": each side's swords as the ledger shows them. */
export function strengthLine(war) {
  const c = (x) => (x && x.mark !== '—' && typeof x.v === 'number' ? cellText(x, 'swords').text : '—');
  return `${c(war?.strength?.A)} against ${c(war?.strength?.D)}`;
}

