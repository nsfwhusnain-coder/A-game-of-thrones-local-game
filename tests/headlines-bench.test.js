// Headlines, the suite (docs/gdd/18-headlines.md §5, WP N10): the writer's own weeks held to the gates every CI run, on a small
// slice (one game, six weeks) so `npm test` stays quick; `npm run bench -- --suite headlines` runs the four games. No model is asked.
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

process.env.WC_PROVIDER = 'mock';
process.env.WC_SAVES = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-headlines-bench-'));
const { runHeadlinesSuite, verdicts, headlinesReport, loadHeadlinesSuite, GATES } = await import('../bench/lib/headlines.js');

const run = await runHeadlinesSuite({ only: ['stark'], weeks: 6 });

test('the writer passes the scorer on every story of six weeks, and every gate of the suite holds', () => {
  assert.ok(run.weeks >= 6 && run.cards >= 30, `${run.weeks} weeks, ${run.cards} stories`);
  const bad = verdicts(run).filter((v) => !v.ok);
  assert.deepEqual(bad.map((v) => `${v.name}: ${v.value} (${v.gate})`), [], run.faultLines.join('\n'));
  assert.equal(run.pass, run.cards);
});

test('the suite is deterministic: the same weeks are told the same way', async () => {
  const again = await runHeadlinesSuite({ only: ['stark'], weeks: 6 });
  assert.deepEqual(again.samples, run.samples);
  assert.equal(again.lengths.total, run.lengths.total);
  assert.equal(again.facts, run.facts);
});

test('the report names every gate, and the suite covers four corners of the realm', () => {
  const text = headlinesReport(run);
  for (const v of verdicts(run)) assert.ok(text.includes(v.name), v.name);
  const games = loadHeadlinesSuite().flatMap((s) => s.games);
  assert.equal(new Set(games.map((g) => g.house)).size, 4);
  assert.ok(GATES.pass === 1 && GATES.boilerplate === 0);
});
