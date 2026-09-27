// The interpret suite (docs/gdd/04-ai-system.md §13): 200 orders, 40 for each of five houses, with what each should be
// read as — its actions (verb and the params that matter), a letter and its recipient, "left to the story", or "ask".
// A reader is anything that turns an order into { actions: [{ verb, params }], letter, story, clarify } — the
// pre-parser, or the interpreter call on a real model, a mock or recorded replies. The scores are those of 04 §13:
// exact reading, param accuracy, clarification rate; and every action read must come back with a receipt.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInitialState, applyChanges, resolvePlaceId } from '../../public/js/shared/world.js';
import { withRng } from '../../public/js/engine/rng.js';
import { perform } from '../../public/js/engine/actions/registry.js';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'suites', 'interpret');

/** The suite's five files: [{ house, about, setup, items: [{ id, text, expect }] }]. */
export function loadSuite(dir = DIR) {
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
}

/** The world an item is read in: the house's game at the start, with the suite's setup (fixed dice, so every run agrees). */
export function worldFor(suite) {
  const s = createInitialState('agot_298', suite.house, { seed: 298 });
  withRng(s, () => applyChanges(s, suite.setup || [], { source: 'The bench' }));
  s.facts = [];
  return s;
}

const same = (key, want, got) => {
  if (want === got) return true;
  if (got == null) return false;
  if (['to', 'at', 'holding'].includes(key)) return resolvePlaceId(String(want)) === resolvePlaceId(String(got).replace(/^party:/, '')) || String(want) === String(got).replace(/^party:/, '');
  return String(want) === String(got);
};
/** How well one reading matches what was expected: { exact, params: [right, of], clarified, kind }. */
export function compare(expect, got) {
  const clarified = !!got.clarify;
  if (expect.clarify) return { exact: clarified, params: [0, 0], clarified, kind: 'clarify' };
  if (expect.story) return { exact: !got.actions?.length && !got.letter?.to && !got.clarify, params: [0, 0], clarified, kind: 'story' };
  if (expect.letter) return { exact: got.letter?.to === expect.letter && !got.actions?.length, params: [got.letter?.to === expect.letter ? 1 : 0, 1], clarified, kind: 'letter' };
  const want = expect.actions || []; const have = [...(got.actions || [])];
  let right = 0, of = 0, matched = 0;
  for (const w of want) {
    const keys = Object.keys(w.params || {}); of += keys.length;
    // the best match of the same verb not yet taken
    let best = -1, bestScore = -1;
    have.forEach((h, k) => { if (h && h.verb === w.verb) { const sc = keys.filter((key) => same(key, w.params[key], h.params?.[key])).length; if (sc > bestScore) { best = k; bestScore = sc; } } });
    if (best < 0) continue;
    right += bestScore; if (bestScore === keys.length) matched++;
    have[best] = null;
  }
  const exact = matched === want.length && (got.actions || []).length === want.length && !got.clarify;
  return { exact, params: [right, of], clarified, kind: 'actions' };
}

/**
 * Read every order with `read(state, text, house) → reading` (sync or async) and score it. Each reading's actions are
 * also done, one by one, on a copy of the world: each must answer with a receipt (done, or refused with its reason).
 * Returns { total, exact, params: [right, of], clarified, receipts: [with, of], alone: [right, of], byHouse, misses } —
 * `alone` counts the readings that call themselves complete (the pre-parser's, which then skip the model).
 */
export async function runSuite(read, { suites = loadSuite(), only = null } = {}) {
  const out = { total: 0, exact: 0, params: [0, 0], clarified: 0, receipts: [0, 0], alone: [0, 0], byHouse: {}, misses: [], ms: 0 };
  for (const suite of suites) {
    if (only && !only.includes(suite.house)) continue;
    const base = worldFor(suite); const h = out.byHouse[suite.house] = { total: 0, exact: 0 };
    for (const item of suite.items) {
      const t0 = Date.now();
      const got = await read(structuredClone(base), item.text, suite.house);
      out.ms += Date.now() - t0;
      const c = compare(item.expect, got);
      out.total++; h.total++; if (c.exact) { out.exact++; h.exact++; } else out.misses.push({ id: item.id, text: item.text, expect: item.expect, got: { actions: got.actions?.map((a) => ({ verb: a.verb, params: a.params })), letter: got.letter, story: got.story, clarify: got.clarify?.question } });
      out.params[0] += c.params[0]; out.params[1] += c.params[1]; if (c.clarified) out.clarified++;
      // a reading that says it is complete skips the model (04 §4.1): how many do, and how many of those are right
      if (got.complete && !got.clarify) { out.alone[1]++; if (c.exact) out.alone[0]++; }
      // every action read gets its receipt
      const dry = structuredClone(base);
      withRng(dry, () => { for (const a of got.actions || []) { out.receipts[1]++; const r = perform(dry, a.verb, { house: suite.house, params: a.params }); if (r.receipt?.length && r.receipt.every((l) => l.text)) out.receipts[0]++; } });
    }
  }
  return out;
}

/** The report of 04 §13, in markdown. */
export function report(r, { title = 'Interpret suite', reader = '' } = {}) {
  const pct = (a, b) => (b ? `${Math.round((100 * a) / b)} %` : '—');
  const lines = [`## ${title}${reader ? ` — ${reader}` : ''}`, '',
    `| measure | value | gate |`, `|---|---|---|`,
    `| exact reading | ${r.exact} / ${r.total} (${pct(r.exact, r.total)}) | ≥ 95 % (model) · ≥ 60 % (pre-parser) |`,
    `| param accuracy | ${pct(r.params[0], r.params[1])} | — |`,
    `| asked to clarify | ${r.clarified} (${pct(r.clarified, r.total)}) | ≤ 10 % |`,
    `| actions with a receipt | ${r.receipts[0]} / ${r.receipts[1]} (${pct(r.receipts[0], r.receipts[1])}) | 100 % |`,
    ...(r.alone[1] ? [`| read without the model | ${r.alone[1]} (${pct(r.alone[1], r.total)}), ${pct(r.alone[0], r.alone[1])} of them exact | ≥ 60 % · ≥ 98 % exact |`] : []),
    `| time | ${(r.ms / 1000).toFixed(1)} s (${Math.round(r.ms / Math.max(1, r.total))} ms an order) | — |`, '',
    `| house | exact |`, `|---|---|`, ...Object.entries(r.byHouse).map(([h, x]) => `| ${h} | ${x.exact} / ${x.total} |`), ''];
  if (r.misses.length) {
    lines.push(`### Misreadings (${r.misses.length})`, '');
    for (const m of r.misses) lines.push(`- \`${m.id}\` “${m.text}” — expected ${JSON.stringify(m.expect)}; read ${JSON.stringify(m.got)}`);
  }
  return lines.join('\n') + '\n';
}
