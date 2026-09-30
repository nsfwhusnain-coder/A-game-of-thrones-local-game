// The headlines suite (docs/gdd/18-headlines.md §5, WP N10): the measure of a good headline over real weeks. The games of bench/suites/headlines are played on the mock (the same twelve-game
// harness as the narrate suite: `bundles()`), and every story of every week is written by the deterministic writer and held to the scorer (server/ai/validate/headline.js), the same rules a
// model's card must keep. What is reported: the scorer's pass rate (the gate is 100 %: the writer is the floor), the headline's length, boilerplate in the words, whether the headline names
// someone or somewhere of its story, the variety of verbs by kind of story, and how many facts a card tells. No model is asked: this is the floor a model's telling is measured against.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundles } from './narrate.js';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'suites', 'headlines');
export const GATES = { pass: 1, meanWords: 9, maxWords: 12, boilerplate: 0, names: 0.99, formsPerKind: 2, factsPerCard: 1.5 };

/** The suite's files, in the narrate suite's own shape (`about`, `games`). */
export function loadHeadlinesSuite(dir = DIR) {
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => ({ file: f.replace(/\.json$/, ''), ...JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) }));
}

const words = (t) => String(t || '').trim().split(/\s+/).filter(Boolean).length;
/** The main verb of a headline: its first word that is a verb of the news and is not a noun before its own verb. */
const mainVerb = (h, VERBS) => { const ws = String(h).match(/[A-Za-z][A-Za-z'’-]*/g) || []; const verbish = (w) => !!w && /^[a-z]/.test(w) && VERBS.has(w.toLowerCase().replace(/['’]s$/, '')); return ws.find((w, i) => verbish(w) && !verbish(ws[i + 1])) || null; };

/**
 * Tell every week of the suite's games with the writer and score each story: `{ weeks, cards, pass, faults: {rule: n}, faultLines, lengths: { total, max }, boilerplate, names, kinds: { kind: { n, forms } },
 * facts, samples, ms }`. `only` narrows to houses, `weeks` to the first N weeks of each game.
 */
export async function runHeadlinesSuite({ suites = loadHeadlinesSuite(), only = null, weeks = Infinity } = {}) {
  const { clusterFacts } = await import('../../public/js/engine/facts/cluster.js');
  const { cardOf } = await import('../../public/js/engine/facts/headline.js');
  const { scoreCard } = await import('../../server/ai/validate/headline.js');
  const STYLE = await import('../../public/data/style.js');
  const VERBS = new Set(STYLE.HEADLINE_VERBS); const BP = [...STYLE.BOILERPLATE].map((p) => new RegExp(p, 'i'));
  const trimmed = suites.map((s) => ({ ...s, games: s.games.map((g) => ({ ...g, tell: g.tell.filter((n) => n <= weeks) })) }));
  const list = await bundles({ suites: trimmed, only });
  const out = { weeks: 0, cards: 0, pass: 0, faults: {}, faultLines: [], lengths: { total: 0, max: 0 }, boilerplate: 0, names: 0, kinds: {}, facts: 0, samples: [], ms: 0 };
  for (const b of list) {
    const t0 = Date.now(); const { stories } = clusterFacts(b.state, (b.state.facts || []).map((f) => ({ ...f }))); out.weeks++;
    for (const story of stories) {
      const card = cardOf(b.state, story); const r = scoreCard(card, story, b.state); out.cards++; out.facts += story.facts.length;
      if (r.pass) out.pass++;
      for (const f of r.detail || []) { out.faults[f.rule] = (out.faults[f.rule] || 0) + 1; if (out.faultLines.length < 20) out.faultLines.push(`${b.id} [${f.rule}] ${f.text} — “${card.headline}”`); }
      const hw = words(card.headline); out.lengths.total += hw; out.lengths.max = Math.max(out.lengths.max, hw);
      if (BP.some((re) => re.test(`${card.headline} ${card.summary}`))) out.boilerplate++;
      if (!(r.faults || []).includes('who')) out.names++;
      const k = out.kinds[story.archetype] = out.kinds[story.archetype] || { n: 0, verbs: new Set() }; k.n++; const v = mainVerb(card.headline, VERBS); if (v) k.verbs.add(v);
      if (out.samples.length < 10 && story.importance >= 4) out.samples.push({ week: b.id, headline: card.headline, summary: card.summary });
    }
    out.ms += Date.now() - t0;
  }
  return out;
}

const pct = (a, b) => (b ? `${Math.round((a / b) * 1000) / 10} %` : '—');
/** The gates' verdict on a run: `[{ name, value, gate, ok }]`. */
export function verdicts(r) {
  const busy = Object.values(r.kinds).filter((k) => k.n >= 6);
  const forms = busy.length ? busy.reduce((a, k) => a + k.verbs.size, 0) / busy.length : Infinity;
  return [
    { name: 'the scorer passes every card', value: pct(r.pass, r.cards), gate: '100 %', ok: r.cards > 0 && r.pass === r.cards },
    { name: 'headline length, mean', value: (r.lengths.total / Math.max(1, r.cards)).toFixed(1), gate: `≤ ${GATES.meanWords} words`, ok: r.lengths.total / Math.max(1, r.cards) <= GATES.meanWords },
    { name: 'headline length, longest', value: String(r.lengths.max), gate: `≤ ${GATES.maxWords} words`, ok: r.lengths.max <= GATES.maxWords },
    { name: 'engine boilerplate in the words', value: String(r.boilerplate), gate: '0', ok: r.boilerplate === GATES.boilerplate },
    { name: 'the headline names someone or somewhere of its story', value: pct(r.names, r.cards), gate: '≥ 99 %', ok: r.cards > 0 && r.names / r.cards >= GATES.names },
    { name: 'verbs by kind of story (kinds seen six times or more)', value: forms === Infinity ? '—' : forms.toFixed(1), gate: `≥ ${GATES.formsPerKind} forms`, ok: forms >= GATES.formsPerKind },
    { name: 'facts a card tells', value: (r.facts / Math.max(1, r.cards)).toFixed(2), gate: `≥ ${GATES.factsPerCard}`, ok: r.facts / Math.max(1, r.cards) >= GATES.factsPerCard },
  ];
}

/** The report (bench/headlines-mock-<date>.md). */
export function headlinesReport(r) {
  const v = verdicts(r);
  return [
    '# Headlines suite — the writer (no model)', '',
    `${r.weeks} weeks, ${r.cards} stories, ${(r.ms / 1000).toFixed(1)} s.`, '',
    '| | value | gate | |', '|---|---|---|---|',
    ...v.map((x) => `| ${x.name} | **${x.value}** | ${x.gate} | ${x.ok ? '✓' : '✗'} |`),
    '', '## Faults by rule', '', Object.entries(r.faults).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(' · ') || 'none',
    ...(r.faultLines.length ? ['', '## The first twenty', '', ...r.faultLines.map((f) => `- ${f}`)] : []),
    '', '## Verbs by kind of story', '', '| kind | stories | verbs |', '|---|---|---|',
    ...Object.entries(r.kinds).sort((a, b) => b[1].n - a[1].n).map(([k, x]) => `| ${k} | ${x.n} | ${[...x.verbs].sort().join(', ')} |`),
    '', '## Samples', '', ...r.samples.flatMap((s) => [`**${s.headline}** _(${s.week})_  `, `${s.summary}`, '']),
  ].join('\n');
}
