// The State of the Realm, as the viewer's house may see it (docs/gdd/19-realm-ledger.md §4, §5, §7). One function,
// `realmViewFor`, builds every answer, and it builds it *from the viewer's knowledge*: its own house and its sworn houses
// are read live (estimate.js), every other house only from the notes the house has kept of it. Nothing here is a
// function of another house's truth, so a hidden treasury, a secret debt, the Rock's failing mines or the score of a war
// far away cannot move the view by a byte until word of it reaches the viewer — and the tests hold it to that.
//
// Pure: it reads the state and changes nothing, draws no dice, calls no model. Rows and columns are put in a fixed
// order (rank, then house id), so the same state always gives the same bytes.
import { seriesOf } from './stats.js';
import { estimateOf, realmContext, knownTo, readSworn, learnWars } from './estimate.js';
import { dayNumber, dateOfDay, dateStr } from '../time.js';
import { sideOf } from '../politics/war.js';
import { flagsOf, wordOf, warNote, factsOf } from './notes.js';

/** The columns of each lens (§4.1): the Strength lens leads with Power; every lens's rows are ranked by Power. */
const LENSES = {
  strength: ['power', 'swords', 'levies', 'menAtArms', 'ships', 'holdings', 'people'],
  economy: ['gold', 'income', 'expenses', 'food', 'debt'],
  land: ['holdings', 'people', 'prosperity', 'unrest'],
};
/** The figure each lens draws its little trend line for (§4.5); Economy's is the net, where the viewer has both halves. */
const HEADLINE = { strength: 'power', economy: 'net', land: 'prosperity' };
const SCOPES = ['great', 'mine', 'war', 'all', 'self']; // 'self': only the viewer's own row (the minds' cheap look at their own house's flags: engine/realm/brief.js `ledgerFlags`)
const GREAT = new Set(['crown', 'paramount', 'major']);
/** The figures that add up when a house is shown with its sworn houses ("the North" is Stark and its bannermen). */
const SUMS = ['swords', 'levies', 'menAtArms', 'guard', 'ships', 'holdings', 'people', 'gold', 'debt', 'income', 'expenses'];
/** How much of a figure is nothing to speak of (§4.5): a poor treasury or a handful of swords does not swing a word. */
const FLOOR = { gold: 1000, debt: 1000, swords: 100, levies: 100, income: 100, expenses: 100, net: 100, people: 1000, menAtArms: 50, guard: 20, power: 10, prosperity: 10, unrest: 10 };
const ARROW = { growing: '▲', shrinking: '▼', steady: '▬' };
const WINDOW_MOONS = [3, 6, 12];

// ── direction: growing, shrinking or steady, and only when two turns running say so (§4.5, §4.6) ──────────────────────────
function raw(series, field) {
  if (series.length < 2) return null;
  const then = series[0][1], now = series.at(-1)[1], d = now - then;
  if (field === 'food') return d >= 10 ? 'growing' : d <= -10 ? 'shrinking' : 'steady'; // a moon of bread, in tenths
  const base = Math.max(then, FLOOR[field] ?? 1);
  return d * 100 >= 4 * base ? 'growing' : d * 100 <= -4 * base ? 'shrinking' : 'steady'; // whole numbers: no 3.99 % that is really 4
}
/**
 * Which way a figure is going. `seriesNow` is `[[day, value], …]`, oldest first, already cut to the window;
 * `seriesThen` is the same series as it stood a turn earlier, which is what lets one battle not flip a word: growing or
 * shrinking must be said on both. A house known only by reports "seems" so, and one report cannot say (dir '—').
 */
export function direction(seriesNow, seriesThen, { field = 'power', reported = false } = {}) {
  if (seriesNow.length < 2) return reported ? { dir: '—', arrow: '·', seems: false } : { dir: 'steady', arrow: ARROW.steady, seems: false };
  const now = raw(seriesNow, field), then = raw(seriesThen, field);
  const dir = now && now === then ? now : 'steady';
  return { dir, arrow: ARROW[dir], seems: !!reported };
}

// ── ranks: shared where the bands overlap, so the view never claims a lead it cannot see (§4.3) ──────────────────────────
/** items: [{ id, lo, hi, mid }] → [{ rank, tied }] in the same order. Competition ranks; a tie is any band that touches another. */
function rankIntervals(items) {
  const order = items.map((_, i) => i).sort((a, b) => items[b].mid - items[a].mid || (items[a].id < items[b].id ? -1 : 1));
  const out = new Array(items.length); let prev = 0;
  for (const i of order) {
    const x = items[i]; let above = 0, tied = false;
    for (let j = 0; j < items.length; j++) { if (j === i) continue; const o = items[j]; if (o.lo > x.hi) above++; else if (o.hi >= x.lo) tied = true; }
    prev = Math.max(prev, 1 + above); // a house clear above another is never ranked below it
    out[i] = { rank: prev, tied };
  }
  return out;
}
const spanOf = (c) => (c && typeof c.v === 'number' && c.mark !== '—' ? { lo: c.band ? c.band[0] : c.v, hi: c.band ? c.band[1] : c.v, mid: c.v } : null);

// ── one house with its sworn houses (the House ↔ Realm toggle) ────────────────────────────────────────────────────────
const WEAK = ['self', 'sworn', 'seen', 'learned', 'reported', 'rumour']; // strongest way first
/** The houses whose figures make up a house's realm: itself and all who are sworn to it (a crown's do not include its paramounts'). */
function realmMembers(state, ctx, id) {
  const out = [id]; const stop = state.houses[id].rank === 'crown';
  const walk = (x) => { for (const v of ctx.vassals.get(x) || []) { if (!state.houses[v] || state.houses[v].status === 'extinct' || out.includes(v)) continue; if (stop && (state.houses[v].rank === 'paramount' || state.houses[v].independent)) continue; out.push(v); walk(v); } };
  walk(id);
  return out;
}
/** A figure summed over a realm: exact only if every part is; a part that is not known makes the sum a lower bound. */
function pooled(parts, own) {
  const nums = parts.filter((c) => spanOf(c));
  if (!nums.length) return own;
  const lo = nums.reduce((n, c) => n + spanOf(c).lo, 0), hi = nums.reduce((n, c) => n + spanOf(c).hi, 0), v = nums.reduce((n, c) => n + c.v, 0);
  const missing = nums.length < parts.length;
  const via = WEAK[Math.max(...nums.map((c) => WEAK.indexOf(c.via)))] || 'rumour';
  const ages = nums.map((c) => c.age).filter((a) => a !== undefined);
  const cell = { v, mark: missing ? '≥' : nums.every((c) => c.mark === '') ? '' : nums.some((c) => c.mark === '≈') ? '≈' : nums.some((c) => c.mark === '≥') ? '≥' : '~', via };
  if (cell.mark === '≈') cell.band = [lo, hi];
  if (ages.length) cell.age = Math.max(...ages);
  return cell;
}

// ── the trend of one row ────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * `[[day, value]]` of one figure of one row. The viewer's own house is the truth series; a sworn house's is read the way
 * its cell is (estimate.js `readSworn`, the same steady blur, so the last point is the cell and the trend is true, and an
 * ally's coin is offset like its band); any other house only from what was observed of it, gaps left as gaps.
 */
function seriesFor(state, viewer, est, field, since) {
  const id = est.house;
  const read = (f, s) => (est.kind === 'sworn' ? s.map(([d, v]) => [d, readSworn(state, viewer, id, f, v, est.ally)]) : s);
  let s;
  if (est.kind === 'other') {
    const f = field === 'net' ? 'income' : field;
    s = (state.knowledge?.[viewer]?.realm?.[id]?.obs || []).filter((o) => o.v[f] != null).map((o) => [o.day, o.v[f]]);
  } else if (field === 'net') {
    const inc = read('income', seriesOf(state, id, 'income')), exp = read('expenses', seriesOf(state, id, 'expenses'));
    s = inc.map(([d, v], i) => [d, v - (exp[i]?.[1] ?? 0)]);
  } else s = read(field, seriesOf(state, id, field));
  return s.filter(([d]) => d >= since);
}
function trendOf(state, viewer, est, lens, since) {
  const field = HEADLINE[lens]; const series = seriesFor(state, viewer, est, field, since);
  const reported = est.kind === 'other';
  const d = direction(series, series.slice(0, -1), { field, reported });
  // a house we watch with fewer than two points to its name has no direction to speak of: the ledger has only begun
  const said = !reported && series.length < 2 ? { dir: '—', arrow: '·', seems: false } : d;
  return { field, ...said, why: [], series };
}

// ── wars, as the viewer has heard of them (the momentum and the score come with WP R6) ─────────────────────────────────────
/** From the viewer's own notes of the wars and the war facts it has just heard (estimate.js `learnWars`) — never from the live list. */
function warsKnown(state, viewer, ctx, since = -Infinity, estimate = null) {
  const notes = learnWars(state, viewer, state.knowledge?.[viewer]?.wars ?? null);
  const out = [];
  for (const [id, n] of Object.entries(notes)) {
    if (n.over) continue;
    const A = n.A.filter((h) => knownTo(state, viewer, h, ctx)), D = n.D.filter((h) => knownTo(state, viewer, h, ctx));
    const war = { id, name: n.name, sides: { A, D }, you: A.some((h) => ctx.friends.has(h)) ? 'A' : D.some((h) => ctx.friends.has(h)) ? 'D' : null };
    // the movement and the score are the viewer's to read only in a war its own house or realm is in (the score of a war it only hears of is not known to it)
    const live = (state.wars || []).find((w) => w.id === id);
    const mine = live && live.status !== 'ended' ? sideOf(state, live, viewer) : null;
    if (mine) {
      const m = warNote(state, live, mine, since, n.name);
      if (m) Object.assign(war, { you: mine, momentum: m.word, standing: m.standing, delta: m.delta });
    }
    // the swords each side is known to have, as the ledger shows them (a lower bound where a house is only heard of)
    if (estimate) {
      const side = (hs) => { const parts = hs.map((h) => estimate(h).cells.swords); return parts.length ? pooled(parts, { mark: '—' }) : { mark: '—' }; };
      war.strength = { A: side(A), D: side(D) };
    }
    out.push(war);
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : 1));
}

// ── the view ────────────────────────────────────────────────────────────────────────────────────────────────────────────
const pick = (v, ok, fallback) => (ok.includes(v) ? v : fallback);

/**
 * `opts`: `{ lens, scope, realm, window, house }`, any of them null or missing for its default (the route passes null
 * for a query parameter that was not asked for). `house` asks for that house's detail; a house the viewer has never
 * heard of is only `{ unknown: true }`.
 */
export function realmViewFor(state, viewer, opts = {}) {
  opts = opts || {};
  const lens = pick(opts.lens, Object.keys(LENSES), 'strength'), scope = pick(opts.scope, SCOPES, 'great');
  const realm = opts.realm === true || opts.realm === 1 || opts.realm === '1';
  const days = 30 * (WINDOW_MOONS.includes(Number(opts.window)) ? Number(opts.window) : 3);
  const today = dayNumber(state.meta.date), since = today - days;
  const ctx = realmContext(state, viewer);
  const houses = state.houses;

  // the rows listed: who the viewer may name, and which of them the chip asks for
  const known = scope === 'self' ? [viewer] : Object.keys(houses).filter((id) => knownTo(state, viewer, id, ctx)).sort();
  let ids;
  if (scope === 'all' || scope === 'self') ids = known;
  else if (scope === 'mine') { const own = houses[viewer]?.liege; ids = known.filter((id) => id === viewer || id === own || ctx.friends.has(id)); }
  else if (scope === 'war') { const at = new Set(warsKnown(state, viewer, ctx).flatMap((w) => [...w.sides.A, ...w.sides.D])); ids = known.filter((id) => id === viewer || at.has(id)); }
  else ids = known.filter((id) => id === viewer || GREAT.has(houses[id].rank));

  const ests = new Map(); // each house is worked out once per view, whoever asks (its own row, or as a part of a liege's realm)
  const estimate = (id) => { let e = ests.get(id); if (!e) ests.set(id, e = estimateOf(state, viewer, id, ctx)); return e; };
  // House ↔ Realm: each figure that adds up is summed over the house and its sworn houses, as each is known
  const cellsOf = (id) => {
    const est = estimate(id); if (!realm) return est.cells;
    const members = realmMembers(state, ctx, id).map(estimate);
    const cells = { ...est.cells };
    for (const f of SUMS) cells[f] = pooled(members.map((m) => m.cells[f]), est.cells[f]);
    return cells;
  };
  const wanted = LENSES[lens];
  const all = ids.map((id) => ({ id, est: estimate(id), cells: cellsOf(id), span: spanOf(estimate(id).cells.power) }));

  // Power ranks the rows, exactly as the viewer knows it; a house whose power is not known sorts last
  const powered = all.filter((r) => r.span);
  rankIntervals(powered.map((r) => ({ id: r.id, ...r.span }))).forEach((x, n) => { powered[n].rank = x.rank; powered[n].rankTied = x.tied; });
  all.sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || (b.span?.mid ?? -1) - (a.span?.mid ?? -1) || (a.id < b.id ? -1 : 1));

  // each numeric column is ranked among the rows shown (a word or a dash has no rank)
  const shown = all.map((r) => Object.fromEntries(wanted.map((f) => [f, { ...r.cells[f] }])));
  wanted.forEach((f) => {
    const idx = shown.map((_, i) => i).filter((i) => spanOf(shown[i][f]));
    const rk = rankIntervals(idx.map((i) => ({ id: all[i].id, ...spanOf(shown[i][f]) })));
    idx.forEach((i, n) => { shown[i][f].rank = rk[n].rank; if (rk[n].tied) shown[i][f].tied = true; });
  });

  // the wars the viewer is in, with their movement: what puts a house on the winning or the losing side of one
  const wars = warsKnown(state, viewer, ctx, since, estimate);
  const inWar = new Map(); // house → the movement of a war its side is in, as seen from that house's side
  for (const w of wars) if (w.momentum) for (const [k, hs] of Object.entries(w.sides)) for (const h of hs) if (!inWar.has(h)) inWar.set(h, { word: k === w.you ? w.momentum : w.momentum === 'gaining' ? 'slipping' : w.momentum === 'slipping' ? 'gaining' : 'holding', name: w.name });
  const rows = all.map((r, i) => {
    const trend = trendOf(state, viewer, r.est, lens, since);
    const ps = seriesFor(state, viewer, r.est, 'power', since); const reported = r.est.kind === 'other';
    const dir = !reported && ps.length < 2 ? { dir: '—', arrow: '·', seems: false } : direction(ps, ps.slice(0, -1), { field: 'power', reported });
    const flags = flagsOf({ cells: r.est.cells, holdings: seriesFor(state, viewer, r.est, 'holdings', since), swords: seriesFor(state, viewer, r.est, 'swords', since), war: inWar.get(r.id) || null });
    const word = wordOf(dir, flags);
    return { house: r.id, lord: houses[r.id].lord ? state.characters?.[houses[r.id].lord]?.name ?? null : null,
      rank: r.rank ?? null, rankTied: !!r.rankTied, cells: shown[i], trend: { ...trend, why: word.why }, word, flags };
  });
  const going = { rising: rows.filter((r) => r.word.word === 'rising').map((r) => r.house), falling: rows.filter((r) => r.word.word === 'falling').map((r) => r.house) };

  // the chronicle of figures: how many samples the truth series has in the window, and when it began
  const S = state.realmStats?.samples || [];
  const window = { days, samples: S.filter((s) => s.day >= since).length };
  if (S.length <= 1) window.begins = `The chronicle of figures begins on ${dateStr(dateOfDay(S[0]?.day ?? today))}.`;

  let detail = null;
  if (opts.house != null && opts.house !== '') {
    const id = opts.house;
    if (typeof id === 'string' && Object.hasOwn(houses, id) && knownTo(state, viewer, id, ctx)) {
      const est = estimate(id); const h = houses[id];
      const series = Object.fromEntries(['swords', 'gold', 'income', 'food', 'people'].map((f) => [f, seriesFor(state, viewer, est, f, since)]));
      detail = { house: id, name: h.name, lord: h.lord ? state.characters?.[h.lord]?.name ?? null : null, rank: h.rank, kind: est.kind, liege: h.liege && knownTo(state, viewer, h.liege, ctx) ? h.liege : null, cells: est.cells, series };
    } else detail = { unknown: true };
  }

  return {
    asOf: { turn: state.meta.turn, date: dateStr(state.meta.date), day: today },
    window, lens, scope, realm, you: viewer, rows,
    going, wars, facts: scope === 'self' ? [] : factsOf(state, viewer, { rows, wars, ests: estimate }), focus: [], detail,
  };
}
