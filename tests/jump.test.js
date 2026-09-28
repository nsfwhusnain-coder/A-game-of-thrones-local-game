// The jump, day by day (WP B11; docs/gdd/03-architecture.md §6.2): the days run one at a time in weeks, each week told
// as soon as it is done, and the lord may stop them on any day — the world he stopped is the world he watched.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.WC_PROVIDER = 'mock';
process.env.WC_SAVES = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-jump-'));
const game = await import('../server/game.js');
const { dayNumber } = await import('../public/js/engine/time.js');

test.after(() => fs.rmSync(process.env.WC_SAVES, { recursive: true, force: true }));
const factsOf = (id) => fs.readFileSync(path.join(game.SAVES, id, 'facts.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const bare = (f) => { const { id, ...rest } = f; return JSON.stringify(rest); };

function gathering(house = 'stark') {
  const { id, state } = game.newGame('agot_298', house);
  const vassals = Object.values(state.houses).filter((h) => h.liege === house).map((h) => h.id);
  game.act(id, { kind: 'call_banners', vassals, at: state.houses[house].seat, ownLevies: 2000 });
  return { id, day0: dayNumber(state.meta.date) };
}

test('a fortnight is lived in weeks: each is told as it ends, and the turn records its weeks and its timings', async () => {
  const { id } = gathering();
  const weeks = [];
  const r = await game.advance(id, { span: '14d', onSegment: (s) => weeks.push(s) });
  const days = parseInt(r.turn.span, 10);
  assert.equal(weeks.length, Math.ceil(days / 7), 'one telling a week');
  assert.deepEqual(weeks.map((w) => w.index), weeks.map((_, k) => k));
  assert.equal(weeks.at(-1).days[1], days);
  for (const w of weeks) assert.ok(w.events.every((e) => e.day >= w.days[0] && e.day <= w.days[1]), 'a week tells only its own days');
  assert.equal(r.turn.segments.length, weeks.length);
  for (const k of ['orders', 'minds', 'engine', 'narrate', 'total']) assert.ok(Number.isFinite(r.turn.ms[k]), `ms.${k}`);
});

test('the lord stops the days while they pass: the turn ends on his day', async () => {
  const { id } = gathering('lannister');
  const r = await game.advance(id, { span: '14d', stopWanted: () => 3 });
  assert.equal(r.turn.span, '3d');
  assert.equal(r.turn.until, 'the lord stopped the days');
});

test('stop here: the turn played again to day 9 has the same days 1–9, fact for fact', async () => {
  const { id, day0 } = gathering();
  await game.advance(id, { span: '7d' });
  const before = factsOf(id).length;
  const r = await game.advance(id, { span: '14d' });
  const ran = parseInt(r.turn.span, 10);
  const stop = Math.min(9, ran - 1);
  const start = dayNumber(game.loadState(id).meta.date) - ran;
  const upTo = (fs0) => fs0.slice(before).filter((f) => f.day <= start + stop && f.cause?.ref !== 'economy').map(bare);
  const first = upTo(factsOf(id));
  assert.ok(first.length > 3, 'the days had happenings to compare');
  const again = await game.stopHere(id, stop);
  assert.equal(again.turn.span, `${stop}d`);
  assert.equal(again.turn.stoppedAt, stop);
  assert.deepEqual(upTo(factsOf(id)), first, 'the days he watched come out the same');
  assert.equal(dayNumber(again.state.meta.date), start + stop);
  assert.ok(day0 < start);
  await assert.rejects(game.stopHere(id, stop), /stop on one of days/, 'a turn cannot be stopped on its last day or after');
});

test('an ironman chronicle cannot be stopped after the fact', async () => {
  const { id } = game.newGame('agot_298', 'tully', { ironman: true });
  await game.advance(id, { span: '5d' });
  await assert.rejects(game.stopHere(id, 2), /ironman/);
});
