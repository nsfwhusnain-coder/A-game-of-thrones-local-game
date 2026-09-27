// The narrate suite (docs/gdd/04-ai-system.md §13): sixty weeks of the realm to be told — twelve games, each played on
// the mock from a fixed seed with its orders, and five of its weeks told again by the narrator under test. Scores: the
// validator's pass rate on the first telling (the 90 % gate), how many were mended by telling a story again, how many
// were left plain, the faults by rule, the time; and, when asked for, a judge's score for the voice (1–5, the 3.8 gate).
// The games are played before any narrator is asked, on the mock, so every model is given the same sixty weeks.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'suites', 'narrate');

/** The suite's files: [{ file, about, games: [{ id, house, seed, span, orders: { turn: [text] }, tell: [turn] }] }]. */
export function loadNarrateSuite(dir = DIR) {
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => ({ file: f.replace(/\.json$/, ''), ...JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) }));
}

/**
 * Play every game on the mock and keep the weeks to be told: [{ id, game, house, turn, state, cards }] — `state` the
 * world at the week's end with its facts in hand, `cards` the stories' facts as the narrator is given them.
 */
export async function bundles({ suites = loadNarrateSuite(), only = null } = {}) {
  process.env.WC_SAVES = process.env.WC_SAVES || fs.mkdtempSync(path.join(os.tmpdir(), 'wc-bench-narrate-'));
  const was = process.env.WC_PROVIDER; process.env.WC_PROVIDER = 'mock';
  const game = await import('../../server/game.js');
  const { dayNumber } = await import('../../public/js/engine/time.js');
  const out = [];
  try {
    for (const suite of suites) for (const g of suite.games) {
      if (only && !only.includes(g.house)) continue;
      const { id } = game.newGame('agot_298', g.house, { seed: g.seed });
      const last = Math.max(...g.tell);
      for (let n = 1; n <= last; n++) {
        const t = (await game.advance(id, { span: g.span || '7d', orders: (g.orders?.[n] || []).map((text) => ({ text })) })).turn;
        await game.settled(id);
        if (!g.tell.includes(n)) continue;
        const state = game.loadState(id);
        state.facts = game.readFacts(id, { from: t.turn, to: t.turn });
        state.meta.clock = { turn: t.turn, from: dayNumber(parseDate(t.dateFrom)) + 1, to: dayNumber(parseDate(t.date)) };
        state.orders = t.orders || [];
        const n0 = t.narration || { groups: [], small: [] };
        const cards = [...n0.groups.map((facts) => ({ facts, text: '' })), ...(n0.small || []).map((text) => ({ bg: true, text }))];
        out.push({ id: `${g.id}-w${n}`, game: g.id, house: g.house, turn: t.turn, state, cards });
      }
    }
  } finally { if (was == null) delete process.env.WC_PROVIDER; else process.env.WC_PROVIDER = was; }
  return out;
}
// "12 8th moon, 298 AC" → { day, month, year }
const parseDate = (s) => { const m = String(s).match(/(\d+)\D+?(\d+)\D+?moon, (\d+)/); return { day: Number(m[1]), month: Number(m[2]), year: Number(m[3]) }; };

/**
 * Tell every bundle with `narrate(state, cards) → { cards, meanwhile, record }` (server/narrator.js narrateTurn) and score it.
 * Returns { weeks, stories, firstTry, mended, plain, faults: { rule: n }, samples, ms, byGame }.
 */
export async function runNarrateSuite(list, narrate, { judge = null } = {}) {
  const out = { weeks: 0, stories: 0, firstTry: 0, mended: 0, plain: 0, faults: {}, faultLines: [], samples: [], ms: 0, byGame: {}, judged: [], empty: 0 };
  for (const b of list) {
    const t0 = Date.now();
    const r = await narrate(b.state, b.cards);
    out.ms += Date.now() - t0;
    const rec = r.record; out.weeks++;
    if (!rec.stories) { out.empty++; continue; }
    // failed the first telling: all of them if the call fell back; on a model, those told again; else those left plain
    const failedFirst = rec.via === 'fallback' ? rec.stories : rec.via === 'model' ? rec.again : rec.plain;
    const first = rec.stories - failedFirst;
    out.stories += rec.stories; out.firstTry += first; out.mended += Math.max(0, rec.told - first); out.plain += rec.plain;
    for (const [k, v] of Object.entries(rec.problems || {})) out.faults[k] = (out.faults[k] || 0) + v;
    for (const f of rec.faults || []) if (out.faultLines.length < 20) out.faultLines.push(`${b.id} ${f}`);
    const g = out.byGame[b.game] = out.byGame[b.game] || [0, 0]; g[0] += first; g[1] += rec.stories;
    const told = r.cards.filter((c) => c.narrated);
    if (told.length && out.samples.length < 8) out.samples.push({ week: b.id, ...pick(told) });
    if (judge) for (const c of told.slice(0, 2)) { const j = await judge(b.state, c); if (j) out.judged.push({ week: b.id, headline: c.title, ...j }); }
  }
  return out;
}
const pick = (told) => { const c = [...told].sort((a, b) => b.importance - a.importance)[0]; return { headline: c.title, line: c.text, scene: c.details, pov: c.pov }; };

const pct = (a, b) => (b ? `${Math.round((a / b) * 100)} %` : '—');
/** The report the owner pastes back (bench/narrate-<model>-<date>.md). */
export function narrateReport(r, { reader }) {
  const firstRate = r.stories ? r.firstTry / r.stories : 0;
  const judged = r.judged.length ? r.judged.reduce((a, j) => a + j.score, 0) / r.judged.length : null;
  const lines = [
    `# Narrate suite — ${reader}`, '',
    `| | |`, `|---|---|`,
    `| weeks told | ${r.weeks} (${r.stories} stories${r.empty ? `; ${r.empty} weeks had nothing to tell` : ''}) |`,
    `| **true on the first telling** | **${pct(r.firstTry, r.stories)}** (gate ≥ 90 %) ${firstRate >= 0.9 ? '✓' : '✗'} |`,
    `| mended by telling a story again | ${r.mended} |`,
    `| left in the engine's plain words | ${r.plain} (${pct(r.plain, r.stories)}) |`,
    `| faults by rule | ${Object.entries(r.faults).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ') || 'none'} |`,
    `| voice (judge, 1–5) | ${judged == null ? 'not judged (run with --judge)' : `**${judged.toFixed(2)}** over ${r.judged.length} stories (gate ≥ 3.8) ${judged >= 3.8 ? '✓' : '✗'}`} |`,
    `| time | ${(r.ms / 1000).toFixed(1)} s (${r.weeks ? (r.ms / r.weeks / 1000).toFixed(1) : 0} s a week) |`,
    '', '## By game', '', '| game | true first time |', '|---|---|',
    ...Object.entries(r.byGame).map(([g, [a, b]]) => `| ${g} | ${a}/${b} |`),
    ...(r.faultLines.length ? ['', '## Faults (the first twenty)', '', ...r.faultLines.map((f) => `- ${f}`)] : []),
    '', '## Samples', '',
    ...r.samples.flatMap((s) => [`**${s.headline}** _(${s.week}; ${s.pov || 'no pov'})_  `, `${s.line}  `, s.scene ? `> ${s.scene}` : '', '']),
    ...(r.judged.length ? ['## The judge', '', ...r.judged.map((j) => `- ${j.score} — ${j.headline}: ${j.why}`), ''] : []),
  ];
  return lines.join('\n');
}

// ── The judge (optional): a model scores a told story's voice against the style bible (10 §8), 1–5 ──
export const JUDGE = `You judge prose for a chronicle written in the manner of George R. R. Martin's A Song of Ice and Fire. Score the scene from 1 to 5:
5 — reads like the books: one person's eyes, the senses before the summary, people talking in character, understatement, ends on consequence.
4 — good: specific and grounded, a clear point of view, one weak line.
3 — competent but plain: accurate, little life, or a summary more than a scene.
2 — flat or generic: stock phrases, no point of view, modern idiom.
1 — wrong for the world: game words, anachronism, purple prose, or a moral.
Answer with the score and one short reason.`;
export const judgeSchema = { type: 'object', additionalProperties: false, required: ['score', 'why'], properties: { score: { type: 'integer', minimum: 1, maximum: 5 }, why: { type: 'string', maxLength: 200 } } };
