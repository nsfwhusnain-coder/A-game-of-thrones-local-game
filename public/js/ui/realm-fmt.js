// How the State of the Realm writes what it is sent (docs/gdd/19-realm-ledger.md §4.2, §4.5, §6.2; WP R4): a cell as text with its mark and its age, a series as a line,
// a word as a chip, a war as a sentence. Pure functions of what `GET /api/games/:id/realm` returns — no DOM, no clock, no dice — so node tests them and the window
// (ui/realm.js) only sets them on the page. Nothing here decides what the player may know: the server sent what its house knows, and this writes it down.
import { ageText } from '../engine/knowledge.js';

export const LENS_LABEL = { strength: 'Strength', economy: 'Economy', land: 'Lands', wars: 'Wars' };
export const SCOPE_LABEL = { great: 'Great houses', mine: 'My realm', war: 'At war', all: 'All known' };
export const FIELD_LABEL = { power: 'Power', swords: 'Swords', levies: 'Levies', menAtArms: 'Men-at-arms', ships: 'Ships', holdings: 'Lands', people: 'People', gold: 'Coin', income: 'Income a moon', expenses: 'Outgoings', food: 'Food', debt: 'Debt', prosperity: 'Prosperity', unrest: 'Unrest' };
const WEALTH = { sound: 'said to be rich', modest: 'modest', pressed: 'pressed', unknown: '—' };
const VIA = { self: 'exact: your own house', sworn: 'sworn to you: read to a few in a hundred', seen: 'seen by your riders', reported: 'a raven or a rider told it', learned: 'a spy or a letter taught it', rumour: 'what the realm says of such a house' };
const VIA_SHORT = { self: 'exact · your house', sworn: 'sworn', seen: 'seen', reported: 'a raven', learned: 'a spy', rumour: 'a rumour' };
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

/** The chip's words for a row's direction, and the class the page sets on it. */
export function wordChip(w) {
  if (!w || w.word === '—') return { text: '—', cls: 'none', title: 'Too little word of it to say.' };
  const text = `${w.arrow || ''} ${w.word}`.trim();
  const seems = w.seems ? 'seems ' : '';
  return { text, seems: !!w.seems, cls: w.word === 'rising' ? 'up' : w.word === 'falling' ? 'down' : 'flat', title: w.why?.length ? `${seems}${w.word}: ${w.why.join('; ')}` : `${seems}${w.word}` };
}

// ── the little lines ────────────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * A series `[[day, value], …]` (real points only) as an 84 × 22 line: `{ d, dots, last, dashed }`. `d` is one path through the points, x by the day, y by the value (a flat series is drawn
 * level); `dashed` for a house known only by report (the line joins observed points and does not pretend to know the days between). Fewer than two points: no line.
 */
export function sparkPath(series, { w = 84, h = 22, pad = 2 } = {}) {
  const pts = (series || []).filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
  if (pts.length < 2) return { d: '', dots: [], last: pts[0] ? [w / 2, h / 2] : null };
  const x0 = pts[0][0], x1 = pts.at(-1)[0]; const ys = pts.map((p) => p[1]); const lo = Math.min(...ys), hi = Math.max(...ys);
  const X = (d) => pad + ((d - x0) / Math.max(1, x1 - x0)) * (w - 2 * pad);
  const Y = (v) => (hi === lo ? h / 2 : h - pad - ((v - lo) / (hi - lo)) * (h - 2 * pad));
  const dots = pts.map(([d, v]) => [Math.round(X(d) * 10) / 10, Math.round(Y(v) * 10) / 10]);
  return { d: dots.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' '), dots, last: dots.at(-1) };
}

/** The words a screen reader reads for a line: "Coin: down 18 % over 6 moons (an estimate)". */
export function sparkLabel(label, series, { moons = 3, est = false } = {}) {
  const pts = (series || []).filter((p) => Number.isFinite(p?.[1])); if (pts.length < 2) return `${label}: too few points to draw`;
  const a = pts[0][1], b = pts.at(-1)[1]; const pct = a ? Math.round(((b - a) / Math.abs(a)) * 100) : 0;
  return `${label}: ${pct === 0 ? 'steady' : `${pct > 0 ? 'up' : 'down'} ${Math.abs(pct)} %`} over ${moons} moons${est ? ' (an estimate)' : ''}`;
}

/** The change of a series over its window as a signed percentage word ("+41 %"), or '' with too few points. */
export function changeWord(series) {
  const pts = (series || []).filter((p) => Number.isFinite(p?.[1])); if (pts.length < 2 || !pts[0][1]) return '';
  const pct = Math.round(((pts.at(-1)[1] - pts[0][1]) / Math.abs(pts[0][1])) * 100); return `${pct > 0 ? '+' : pct < 0 ? '−' : ''}${Math.abs(pct)} %`;
}

// ── wars ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
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

// ── rows: sorting and columns ───────────────────────────────────────────────────────────────────────────────────────────────
/** The columns of each lens, as the server sends them (view.js LENSES) with their labels; the House and the Six-moons columns are the window's own. */
export const COLUMNS = {
  strength: ['power', 'swords', 'levies', 'menAtArms', 'ships', 'holdings', 'people'],
  economy: ['gold', 'income', 'expenses', 'food', 'debt'],
  land: ['holdings', 'people', 'prosperity', 'unrest'],
};
/** The value a column sorts by: the middle of what is shown; a house of which nothing is known sorts last, whichever way. */
export function sortValue(row, key) {
  if (key === 'rank') return row.rank ?? null;
  const c = row.cells?.[key]; return c && typeof c.v === 'number' && c.mark !== '—' ? c.v : null;
}
/** The rows in the order of a header: `key` a column or 'rank', `dir` 1 or −1. Stable, and the unknown last. */
export function sortRows(rows, key = 'rank', dir = 1) {
  return rows.map((r, i) => [r, i]).sort(([a, i], [b, j]) => {
    const x = sortValue(a, key), y = sortValue(b, key);
    if (x === null && y === null) return i - j; if (x === null) return 1; if (y === null) return -1;
    // rank is best-first by its number; a figure is best-first by its size
    return (key === 'rank' ? (x - y) * dir : (y - x) * dir) || i - j;
  }).map(([r]) => r);
}
