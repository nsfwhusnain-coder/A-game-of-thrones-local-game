// How the State of the Realm writes what it is sent (docs/gdd/19-realm-ledger.md §4.2, §4.5, §6.2; WP R4): a cell as text with its mark and its age, a series as a line,
// a word as a chip, a war as a sentence. Pure functions of what `GET /api/games/:id/realm` returns — no DOM, no clock, no dice — so node tests them and the window
// (ui/realm.js) only sets them on the page. Nothing here decides what the player may know: the server sent what its house knows, and this writes it down.

export const LENS_LABEL = { strength: 'Strength', economy: 'Economy', land: 'Lands', wars: 'Wars' };
export const SCOPE_LABEL = { great: 'Great houses', mine: 'My realm', war: 'At war', all: 'All known' };
export { STALE_AFTER, compact, cellText, provenance, FIELD_LABEL, warLine, strengthLine } from '../engine/realm/words.js';
import { cellText } from '../engine/realm/words.js';

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
