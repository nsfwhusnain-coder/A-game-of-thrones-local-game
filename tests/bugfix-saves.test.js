// The save, one thing at a time (docs/BUG-HUNT-2026-10-02.md, SV2 to SV5): two End turns were both run; undo, talk, orders and delete were accepted while a long
// jump was writing the same save (and lost, or lost the jump's); a damaged save could not be opened and said nothing; spans of "abc" and "999999999d" were played;
// a 100 KB order was kept; the position of the dice was sent to the page. Mock only; the game module directly (the HTTP edges are tests/bugfix-server.test.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.WC_SAVES = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-saves-'));
process.env.WC_PROVIDER = 'mock';
const game = await import('../server/game.js');
const { viewOf } = await import('../server/view.js');

const busy = (what) => (e) => e.status === 409 && /busy/i.test(e.message) && /written/.test(e.message) ? true : assert.fail(`${what}: expected a 409 "the chronicle is busy", got ${e.status} ${e.message}`);

test('SV2: while a turn is being written, nothing else changes the save, and two End turns are one', async () => {
  const { id } = game.newGame('agot_298', 'stark', { seed: 5 });
  const first = game.advance(id, { span: '7d', orders: [] });
  assert.equal(game.writingNow(id), 'a turn', 'the save is held while the turn is written');
  await assert.rejects(game.advance(id, { span: '7d', orders: [] }), busy('a second End turn'));
  await assert.rejects(game.undo(id, {}), busy('undo'));
  await assert.rejects(game.talk(id, 'robb_stark', 'hello'), busy('talk'));
  await assert.rejects(game.council(id, ['luwin'], 'what now?'), busy('council'));
  await assert.rejects(game.consolidateNow(id), busy('consolidate'));
  await assert.rejects(game.stopHere(id, 3), busy('stop here'));
  for (const [what, call] of [['orders', () => game.setOrders(id, [{ id: 'o1', text: 'Hold a feast.' }])], ['an action', () => game.act(id, { kind: 'order', text: 'x' })], ['an edit', () => game.editState(id, { changes: [] })],
    ['a delete', () => game.deleteSave(id)], ['the ravens', () => game.markRavensRead(id)], ['the welcome', () => game.markWelcomed(id)], ['a page of news', () => game.acknowledge(id, ['1-1'])], ['the chronicle', () => game.writeChronicle(id, 'x')]]) {
    assert.throws(call, busy(what));
  }
  const r = await first;
  assert.equal(r.state.meta.turn, 1, 'the turn advanced by one, not two');
  assert.equal(game.loadState(id).meta.turn, 1);
  assert.equal(game.writingNow(id), null, 'the save is free again');
  // and once it is free, each of them works
  assert.equal(game.setOrders(id, [{ id: 'o1', text: 'Hold a feast.' }]).length, 1);
  assert.ok(game.markRavensRead(id));
  assert.equal((await game.advance(id, { span: '1d', orders: [] })).state.meta.turn, 2);
  assert.equal((await game.undo(id, {})).meta.turn, 1, 'undo works after');
});

test('SV2: a turn that fails frees the save', async () => {
  const { id } = game.newGame('agot_298', 'stark', { seed: 6 });
  await assert.rejects(game.advance(id, { span: 'abc' }), (e) => e.status === 400);
  assert.equal(game.writingNow(id), null);
  game.deleteSave(id);
  await assert.rejects(game.advance(id, { span: '1d' }), (e) => e.status === 404, 'a save that is gone is not found');
  assert.equal(game.writingNow(id), null, 'and does not stay held');
});

test('SV3: a damaged save is listed as damaged and refused in words; a folder with no save in it is no save', () => {
  const { id } = game.newGame('agot_298', 'stark', { seed: 7 });
  fs.writeFileSync(path.join(process.env.WC_SAVES, id, 'state.json'), '{"meta":');
  const bare = path.join(process.env.WC_SAVES, 'scratch-folder'); fs.mkdirSync(bare, { recursive: true });
  const list = game.listSaves();
  const mine = list.find((s) => s.id === id);
  assert.ok(mine?.damaged, 'listed, so that it can be burned');
  assert.ok(!list.some((s) => s.id === 'scratch-folder'), 'a folder with no state.json is not a chronicle');
  assert.throws(() => game.loadState(id), (e) => e.status === 422 && /damaged/.test(e.message) && !/JSON|Unexpected|position/i.test(e.message), 'refused in a player\'s words, not a parser\'s');
  fs.writeFileSync(path.join(process.env.WC_SAVES, id, 'state.json'), '[1,2]');
  assert.throws(() => game.loadState(id), (e) => e.status === 422, 'valid JSON that is not a game');
  game.deleteSave(id);
  assert.ok(!game.listSaves().some((s) => s.id === id), 'a damaged save can be burned');
});

test('SV4: a span is "auto", a named one or n days up to a year; the words a lord writes have a size', async () => {
  const { id } = game.newGame('agot_298', 'stark', { seed: 8 });
  for (const span of ['abc', '-5d', '0d', '1', '7d; DROP', '7D', '9999d', '361d', '999999999d', ' 7d', '1.5d', '1e3d']) await assert.rejects(game.advance(id, { span, orders: [] }), (e) => e.status === 400 && /span of days/.test(e.message), `span ${JSON.stringify(span)}`);
  for (const span of ['auto', '1d', '12d', '360d', '1w', '1m', '1y', undefined, null]) assert.doesNotThrow(() => game.checkSpan(span), `span ${span}`);
  assert.equal(game.loadState(id).meta.turn, 0, 'none of the bad ones was played');
  assert.throws(() => game.setOrders(id, [{ id: 'x', text: 'y'.repeat(2001) }]), (e) => e.status === 413 && /too long/.test(e.message));
  assert.throws(() => game.setOrders(id, Array.from({ length: 61 }, (_, i) => ({ id: `o${i}`, text: 'Hold a feast.' }))), (e) => e.status === 413);
  assert.throws(() => game.setOrders(id, 'not a list'), (e) => e.status === 400);
  assert.equal(game.setOrders(id, [{ id: 'x', text: 'y'.repeat(2000) }]).length, 1, 'two thousand characters are an order');
  await assert.rejects(game.talk(id, 'robb_stark', 'x'.repeat(4001)), (e) => e.status === 413);
  await assert.rejects(game.council(id, ['luwin'], 'x'.repeat(4001)), (e) => e.status === 413);
  assert.throws(() => game.writeChronicle(id, 'x'.repeat(1_000_001)), (e) => e.status === 413);
  assert.equal(game.writingNow(id), null, 'a refusal holds nothing');
});

test('SV5: the page is not sent the position of the dice', async () => {
  const { id } = game.newGame('agot_298', 'stark', { seed: 9 });
  const state = game.loadState(id);
  assert.ok(Array.isArray(state.meta.rngState), 'the save has its dice');
  assert.equal(viewOf(state).meta.rngState, undefined, 'the view does not');
  assert.equal(JSON.stringify(viewOf(state)).includes(JSON.stringify(state.meta.rngState)), false, 'nowhere in the view');
  const r = viewOf(await game.advance(id, { span: '1d', orders: [] }));
  assert.equal(r.state.meta.rngState, undefined, 'nor in the answer to a turn');
  assert.equal(game.loadState(id).meta.rngState.length, 4, 'the save still keeps them');
});
