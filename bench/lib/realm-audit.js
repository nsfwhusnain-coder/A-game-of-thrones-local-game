// The realm audit (docs/gdd/19-realm-ledger.md §11, WP R7): the ledger's figures held against the truth they estimate, and the
// ledger held to what it may not know. It reads the truth (`figuresOf`) that the player's view never does, so it is tooling only:
// tests/realm-soak.test.js and scripts/realm-dump.js use it, nothing of the game imports it.
//
// What is held, cell by cell (a cell is one figure of one house as the viewer's ledger shows it):
//   • the viewer's own figures are the truth, exactly, with no mark;
//   • a sworn house's figures are the truth to within ±5 % (a lord knows his bannermen), `~`;
//   • a figure seen, reported or heard of, while it is fresh (this turn's or last turn's news), `~`, is within its tier's bound
//     (seen ±10 %, reported ±25 %, a rumour ±25 %); an older one is marked stale ("?") and not held to a bound, only to its age;
//   • `≥` (at least) does not overstate by more than a battle can have cost since the word came;
//   • a band (`≈ a–b`) is well formed and holds the truth for most houses (BAND_COVERAGE): a band is a prior, not a promise;
//   • no number where there is none to give: a cell marked `—` carries no figure, a cell with no way of knowing (no `via`) none,
//     a rumour never gives a coffer as a number, and every mark is one the way it was learned may give.
// And the ledger's silence: `hideTruth` changes what the viewer cannot know, and the view, the brief and the summary must not move.
import { realmViewFor } from '../../public/js/engine/realm/view.js';
import { figuresOf } from '../../public/js/engine/realm/figures.js';
import { realmBrief, realmSummary } from '../../public/js/engine/realm/brief.js';
import { cellText } from '../../public/js/engine/realm/words.js';
import { forces } from '../../public/js/engine/parties.js';
import { seriesOf } from '../../public/js/engine/realm/stats.js';
import { dayNumber } from '../../public/js/engine/time.js';
import * as K from '../../public/js/engine/knowledge.js';

export const LENSES = ['strength', 'economy', 'land'];
/** Two-sided bounds by how the figure came (§4.2), as a share of the truth. */
export const BOUNDS = { sworn: 0.055, seen: 0.1, reported: 0.25, rumour: 0.25 };
/** The share of a fresh band that must hold the truth. */
export const BAND_COVERAGE = 0.85;
/**
 * A `≥` figure may overstate by this much of the truth. A report is up to a quarter off (knowledge.js), a host that has since bled in a battle is
 * smaller, and a report of a host that merged into another lingers until someone sees the empty field (up to six turns), so two reports can stand for
 * one body of men: the soak measured +52 % in a moon of Frey's muster; and a host may be broken up the very turn it is reported (a Smallwood host of 430 went home, "at least 400" of a house
 * with 200). It is held to the most the truth was since the word came (`peakSince`: a host broken up or lost in a battle that turn); the bound catches a broken sum, not that staleness (which the age shows).
 */
export const LEAST_OVER = 0.6;
export const LEAST_SLACK = 100; // a report of a host is never under a hundred men (knowledge.js), so a house of fifty is "at least 160" of a host it has lost
/** The most a figure of a house was at a sample since a cell of `age` turns was noted (the truth series, a sample a week), and now. */
function peakSince(state, house, field, now, age) {
  const since = dayNumber(state.meta.date) - 30 * ((age ?? 0) + 1);
  return Math.max(now, ...seriesOf(state, house, field).filter(([day]) => day >= since).map(([, v]) => v));
}
/** A figure this many turns old or less is fresh. */
export const FRESH = 1;
const MARKS = { self: [''], sworn: ['~', '≈'], seen: ['~', '≈', '≥'], reported: ['~', '≈', '≥'], rumour: ['~', '≈'], learned: ['~'] };
const SMALL = new Set(['power', 'prosperity', 'unrest']); // 0–100 scales: an integer's rounding is a large share of a small number

/** The room the truth is allowed to be off by: its share, the third significant figure's rounding, and an integer (a little more on the 0–100 scales). */
const room = (t, pct, field) => pct * Math.abs(t) + (t ? 0.5 * 10 ** (Math.floor(Math.log10(Math.abs(t))) - 2) : 0) + (SMALL.has(field) ? 1.5 : 1);

/**
 * Hold every cell of the viewer's ledger to the truth: `{ violations: [{ house, field, rule, text }], cells, kinds, bands }`.
 * `kinds` is the measured error by way of learning (`"reported~ people"` → `{ n, fresh, max, over, under }`), `bands` the coverage by field.
 */
export function auditView(state, viewer, { lenses = LENSES, scope = 'all', viewOf = realmViewFor } = {}) {
  const out = { violations: [], cells: 0, kinds: {}, bands: {} };
  const bad = (house, field, rule, text) => out.violations.push({ house, field, rule, text });
  const truths = new Map();
  for (const lens of lenses) {
    const view = viewOf(state, viewer, { lens, scope }); // (`viewOf`: the tests hand it a tampered view to show the audit can fail)
    for (const row of view.rows) {
      const truth = truths.get(row.house) || truths.set(row.house, figuresOf(state, row.house)).get(row.house);
      for (const [field, cell] of Object.entries(row.cells)) {
        out.cells++; const t = truth[field]; const who = row.house;
        const shown = cell.mark === '—' || (cell.v == null && cell.band == null && cell.word == null);
        if (cell.mark === '—' && (cell.v != null || cell.band != null || cell.word != null)) bad(who, field, 'none', `marked "nothing known" and yet gives ${JSON.stringify({ v: cell.v, band: cell.band, word: cell.word })}`);
        if (!cell.via && !shown) bad(who, field, 'none', 'gives a figure with no way of learning it');
        if (shown) continue;
        if (cell.via === 'rumour' && field === 'gold' && cell.v != null) bad(who, field, 'none', 'a rumour gives a coffer as a number');
        if (cell.via && MARKS[cell.via] && cell.v != null && !MARKS[cell.via].includes(cell.mark || '')) bad(who, field, 'mark', `a ${cell.via} figure marked "${cell.mark}"`);
        if (cell.age === undefined ? cell.via !== 'rumour' : !Number.isInteger(cell.age) || cell.age < 0 || cell.age > state.meta.turn) bad(who, field, 'age', `age ${cell.age} of a ${cell.via} figure at turn ${state.meta.turn}`); // a rumour's age may be none: it is "long unheard of"
        if (row.house === viewer) {
          if (cell.mark || cell.via !== 'self' || (typeof t === 'number' && cell.v !== t)) bad(who, field, 'self', `the viewer's own ${field} shows ${cell.mark || ''}${cell.v}, the truth is ${t}`);
          continue;
        }
        if (cell.band) { const k = band(out, field, cell, t, cell.age); if (k) bad(who, field, 'band', k); continue; } // a band is judged by whether it holds the truth, not by its middle
        if (typeof t !== 'number' || cell.v == null) continue;
        const rel = t ? (cell.v - t) / Math.abs(t) : cell.v ? 1 : 0;
        const kind = out.kinds[`${cell.via}${cell.mark || '='} ${field}`] = out.kinds[`${cell.via}${cell.mark || '='} ${field}`] || { n: 0, fresh: 0, max: 0, over: 0, under: 0 };
        kind.n++;
        if ((cell.age ?? Infinity) <= FRESH || cell.via === 'sworn') { kind.fresh++; kind.max = Math.max(kind.max, Math.abs(rel)); if (rel > 0) kind.over = Math.max(kind.over, rel); else kind.under = Math.max(kind.under, -rel); }
        if ((cell.age ?? Infinity) > FRESH && cell.via !== 'sworn') continue; // old news: shown with its age, not held to a bound
        if (cell.mark === '~' && BOUNDS[cell.via] && !(t === 0 && cell.via === 'rumour')) {
          if (Math.abs(cell.v - t) > room(t, BOUNDS[cell.via], field)) bad(who, field, cell.via, `${cell.via} ${field} ${cell.v} against the truth ${t} (${(rel * 100).toFixed(1)} %, the bound is ±${BOUNDS[cell.via] * 100} %)`);
        }
        // (a host reported may have been broken, merged or lost to a battle in the turns since the word came: "at least" is held to the most the truth was in that time)
        if (cell.mark === '≥' && cell.v > peakSince(state, row.house, field, t, cell.age) * (1 + LEAST_OVER) + LEAST_SLACK) bad(who, field, 'least', `"at least ${cell.v}" ${field} where the truth is ${t}`);
      }
    }
  }
  return out;
}
/** Take a band's coverage and shape; returns a fault text or ''. Only a fresh band counts toward coverage. */
function band(out, field, cell, t, age) {
  const b = cell.band; if (!Array.isArray(b) || b.length !== 2 || !(b[0] <= b[1])) return `a band of ${JSON.stringify(b)}`;
  if (cell.v != null && (cell.v < b[0] || cell.v > b[1])) return `${cell.v} is outside its own band ${b[0]}–${b[1]}`;
  if ((age ?? Infinity) <= FRESH && typeof t === 'number') { const c = out.bands[field] = out.bands[field] || { n: 0, held: 0 }; c.n++; if (t >= b[0] && t <= b[1]) c.held++; }
  return '';
}

/** Add one audit into another (the soak's whole run), summing the kinds and the bands. */
export function mergeAudits(into, a) {
  into.cells += a.cells; into.violations.push(...a.violations);
  for (const [k, x] of Object.entries(a.kinds)) { const y = into.kinds[k] = into.kinds[k] || { n: 0, fresh: 0, max: 0, over: 0, under: 0 }; y.n += x.n; y.fresh += x.fresh; y.max = Math.max(y.max, x.max); y.over = Math.max(y.over, x.over); y.under = Math.max(y.under, x.under); }
  for (const [k, x] of Object.entries(a.bands)) { const y = into.bands[k] = into.bands[k] || { n: 0, held: 0 }; y.n += x.n; y.held += x.held; }
  return into;
}
export const emptyAudit = () => ({ violations: [], cells: 0, kinds: {}, bands: {} });

/** The bands that hold the truth too seldom: `[{ field, n, held }]`. */
export const thinBands = (audit, floor = BAND_COVERAGE, least = 30) => Object.entries(audit.bands).filter(([, b]) => b.n >= least && b.held / b.n < floor).map(([field, b]) => ({ field, ...b }));

// ── What the viewer cannot know ───────────────────────────────────────────────────────────────────────────────────────────

/** The changes `hideTruth` knows how to make, by name; each returns true if it changed anything. */
const HIDING = {
  // (not the vassals of a friend: an ally's own income is made of its vassals' muster, so what moves there moves an ally's figure, which the viewer may read)
  coffers(t, viewer, friends) { let n = 0; for (const h of Object.values(t.houses)) { if (friends.has(h.id) || friends.has(h.liege) || h.liege === viewer) continue; for (const f of ['treasury', 'income', 'debt', 'levies', 'menAtArms', 'guard', 'ships', 'food']) if (h.figures?.[f]) { h.figures[f].v = 987654321; n++; } h.levyCap = 987654; } return n > 0; },
  hosts(t, viewer, friends) { let n = 0; for (const a of forces(t)) if (!friends.has(a.owner) && !K.seesParty(t, viewer, a)) { a.men = 654321; n++; } return n > 0; },
  // a secret debt between two houses that are neither the viewer's own nor sworn to it (the first two by name)
  loan(t, viewer, friends) { const [lender, debtor] = Object.keys(t.houses).sort().filter((h) => h !== viewer && !friends.has(h)); if (!debtor) return false; (t.economy.loans = t.economy.loans || []).push({ id: 'zz-hidden', lender, debtor, amount: 987654321, rate: 0.3, pays: 'coin', since: 0, due: 1 }); return true; },
  wars(t, viewer, friends) {
    let n = 0; for (const w of t.wars || []) { const sides = [...(w.attackers || []), ...(w.defenders || [])]; if (sides.some((h) => h === viewer || friends.has(h))) continue; w.score = 4242; n++; if (t.realmStats?.wars?.[w.id]) t.realmStats.wars[w.id] = t.realmStats.wars[w.id].map(([d]) => [d, 4242]); }
    return n > 0;
  },
  series(t, viewer, friends) { let n = 0; for (const r of t.realmStats?.samples || []) for (const h of Object.keys(r.h)) if (!friends.has(h)) { r.h[h] = r.h[h].map((_, i) => 987654 + i); n++; } return n > 0; },
};
export const HIDINGS = Object.keys(HIDING);

/**
 * A copy of the world in which what the viewer cannot know is changed: `{ state, done: [names] }`. `pick` (a function of a name, true to make
 * that change) chooses among `HIDINGS`; the default is all of them. The viewer's own house and its sworn houses, and every host it sees, are left alone.
 */
export function hideTruth(state, viewer, pick = () => true) {
  const t = JSON.parse(JSON.stringify(state)); const friends = K.friendsOf(t, viewer); const done = [];
  for (const name of HIDINGS) if (pick(name) && HIDING[name](t, viewer, friends)) done.push(name);
  return { state: t, done };
}

const OPTS = [...LENSES.flatMap((lens) => ['great', 'all'].map((scope) => ({ lens, scope }))), { realm: true }, { scope: 'all', realm: true }];
/** Everything the viewer's house reads of the realm, as one string: every lens and row set, the brief and the summary. */
export function readings(state, viewer, opts = OPTS) {
  return JSON.stringify([...opts.map((o) => realmViewFor(state, viewer, o)), realmBrief(state, viewer).text, realmSummary(state, viewer)]);
}

// ── The two sides of a house, for the dump ────────────────────────────────────────────────────────────────────────────────

const FIELD_ORDER = { strength: ['power', 'swords', 'levies', 'menAtArms', 'ships', 'holdings', 'people'], economy: ['gold', 'income', 'expenses', 'food', 'debt'], land: ['holdings', 'people', 'prosperity', 'unrest'] };
const num = (x) => (typeof x === 'number' ? (Math.abs(x) >= 1000 ? Math.round(x).toLocaleString('en-GB') : String(Math.round(x * 10) / 10)) : '—');
/** The truth and what the viewer's ledger says, one line a figure: `[{ house, lord, rank, tie, lines: [{ field, truth, shown, via, age, error }] }]`. */
export function sideBySide(state, viewer, { lens = 'strength', scope = 'great', house = null } = {}) {
  const view = realmViewFor(state, viewer, { lens, scope, ...(house ? { house } : {}) });
  return view.rows.filter((r) => !house || r.house === house).map((row) => {
    const truth = figuresOf(state, row.house);
    return {
      house: row.house, lord: row.lord, rank: row.rank, tie: row.rankTied,
      lines: FIELD_ORDER[lens].filter((f) => row.cells[f]).map((field) => {
        const c = row.cells[field]; const t = truth[field];
        const rel = typeof t === 'number' && typeof c.v === 'number' && c.mark !== '≈' ? (t ? (c.v - t) / Math.abs(t) : c.v ? 1 : 0) : null;
        return { field, truth: num(t), shown: cellText(c, field).text, via: c.via || '—', age: c.age ?? null, error: rel == null ? '' : `${rel >= 0 ? '+' : '−'}${Math.abs(rel * 100).toFixed(1)} %`, band: c.band ? (t >= c.band[0] && t <= c.band[1] ? 'holds' : 'misses') : '' };
      }),
    };
  });
}

/** The audit's report, in the words of the bench reports (the soak prints it; the dump adds it under `--audit`). */
export function auditReport(a, { title = 'Realm audit' } = {}) {
  const rows = Object.entries(a.kinds).sort();
  return [
    `# ${title}`, '', `${a.cells} cells held against the truth; ${a.violations.length} outside their bound.`, '',
    '| how it came · field | cells | fresh | worst fresh error | over | under |', '|---|---|---|---|---|---|',
    ...rows.map(([k, x]) => `| ${k} | ${x.n} | ${x.fresh} | ${(x.max * 100).toFixed(1)} % | ${(x.over * 100).toFixed(0)} % | ${(x.under * 100).toFixed(0)} % |`),
    '', '| band of | fresh bands | hold the truth |', '|---|---|---|',
    ...Object.entries(a.bands).sort().map(([f, b]) => `| ${f} | ${b.n} | ${((b.held / b.n) * 100).toFixed(0)} % |`),
    ...(a.violations.length ? ['', '## Outside the bound (first twenty)', '', ...a.violations.slice(0, 20).map((v) => `- ${v.house} ${v.field} [${v.rule}] ${v.text}`)] : []),
  ].join('\n');
}
