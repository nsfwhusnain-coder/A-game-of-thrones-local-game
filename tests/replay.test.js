// Determinism (docs/gdd/03-architecture.md §1.6, 15-qa-tooling.md §4; WP B1): the engine rolls its dice from the save's
// own seeded stream and names new things from the save's own counter, so a turn played twice from the same save, with
// the same orders, comes out byte for byte the same — the foundation of replays, "stop here" and undo.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.WC_PROVIDER = 'mock';
process.env.WC_SAVES = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-replay-'));
const game = await import('../server/game.js');
const { makeRng, seedState, withRng, random } = await import('../public/js/engine/rng.js');
const { createInitialState } = await import('../public/js/shared/world.js');

test.after(() => fs.rmSync(process.env.WC_SAVES, { recursive: true, force: true }));

test('the dice: a seed always gives the same stream, and different seeds differ', () => {
  const a = makeRng(seedState(42)), b = makeRng(seedState(42)), c = makeRng(seedState(43));
  const xs = Array.from({ length: 1000 }, () => a.next());
  assert.deepEqual(xs, Array.from({ length: 1000 }, () => b.next()));
  assert.notDeepEqual(xs.slice(0, 10), Array.from({ length: 10 }, () => c.next()));
  assert.ok(xs.every((x) => x >= 0 && x < 1));
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length; assert.ok(Math.abs(mean - 0.5) < 0.05, `mean ${mean}`);
  // the position is the save's: two saves never share it
  const s1 = { meta: { seed: 7 } }, s2 = { meta: { seed: 7 } };
  const r1 = withRng(s1, () => [random(), random()]);
  const r2 = withRng(s2, () => [random(), random()]);
  assert.deepEqual(r1, r2); assert.deepEqual(s1.meta.rngState, s2.meta.rngState);
});

test('a seed makes the same world', () => {
  const a = createInitialState('agot_298', 'stark', { seed: 1234 }), b = createInitialState('agot_298', 'stark', { seed: 1234 });
  delete a.meta.created; delete b.meta.created;
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test('a turn replayed from the same save is byte-identical (mock provider)', async () => {
  const { id, state } = game.newGame('agot_298', 'stark');
  const vassals = Object.values(state.houses).filter((h) => h.liege === 'stark').map((h) => h.id);
  game.act(id, { kind: 'call_banners', vassals, at: 'stark', ownLevies: 3000 });
  game.setOrders(id, [{ text: 'Send Ser Rodrik Cassel with fifty men to White Harbor.' }, { text: 'Raise 500 levies at Winterfell.' }]);
  const file = path.join(game.SAVES, id, 'state.json');
  const start = fs.readFileSync(file, 'utf8');
  // each replay runs with a different Math.random: if any engine code still used it, the two would part ways
  const play = async (seed) => {
    fs.writeFileSync(file, start);
    const own = makeRng(seedState(seed)); const real = Math.random; Math.random = () => own.next();
    try {
      const turns = [];
      for (const span of ['7d', '12d', '5d']) turns.push((await game.advance(id, { span })).turn);
      return { state: fs.readFileSync(file, 'utf8'), turns: JSON.stringify(turns) };
    } finally { Math.random = real; }
  };
  const first = await play(1); const second = await play(999);
  assert.ok(JSON.parse(first.state).meta.turn === 3, 'three turns were played');
  assert.equal(second.turns, first.turns, 'the turns tell the same story');
  assert.equal(second.state, first.state, 'the world is the same, byte for byte');
});
