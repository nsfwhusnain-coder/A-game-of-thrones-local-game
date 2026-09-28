// The owner's complaint, as a test: "when you call the troops, they all muster up and they kind of stay there".
// Whole turns on the mock model, no server: call the banners, march the host before the lords arrive, and check that the
// banners join the host wherever it has gone instead of forming a second host at the muster point.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.WC_PROVIDER = 'mock';
process.env.WC_SAVES = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-muster-'));
const game = await import('../server/game.js');

test.after(() => fs.rmSync(process.env.WC_SAVES, { recursive: true, force: true }));

test('the banners join the host wherever it has gone: one host, no camp left at the muster', async () => {
  const { id, state } = game.newGame('agot_298', 'stark', { seed: 298 });
  const vassals = Object.values(state.houses).filter((h) => h.liege === 'stark').map((h) => h.id);
  game.act(id, { kind: 'call_banners', vassals, at: 'stark', ownLevies: 4000 });
  let s = game.loadState(id);
  const host = Object.values(s.parties).find((a) => a.owner === 'stark' && a.at === 'stark' && a.kind === 'host');
  assert.ok(host, 'the lord\'s own levies stand at Winterfell');
  assert.ok(vassals.every((v) => s.houses[v].obligations.join === host.id), 'every called lord is told to join that host');
  // the host marches before a single lord has answered
  game.act(id, { kind: 'march', army: host.id, to: 'moat_cailin' });
  for (let i = 0; i < 6; i++) await game.advance(id, { span: '10d' });
  s = game.loadState(id);
  // no second host left standing at the muster point (the Hand's own household riding south with the King is another
  // matter, and may well be on the road by now)
  const left = Object.values(s.parties).filter((a) => a.owner === 'stark' && a.id !== host.id && a.kind === 'host' && a.at === 'stark');
  assert.deepEqual(left.map((a) => a.name), [], 'no host left behind at Winterfell');
  assert.ok(!Object.values(s.parties).some((a) => /^The Banners of/.test(a.name)), 'no orphan "Banners of" host');
  const joined = Object.keys(s.parties[host.id].contingents || {});
  assert.ok(joined.length >= 3, `the lords' men have joined the host (${joined.join(', ')})`);
  // anyone still on the road is making for the host itself, not for the empty muster point
  for (const a of Object.values(s.parties).filter((x) => x.serving === 'stark')) assert.equal(String(a.march?.to), 'party:' + host.id, `${a.name} follows the host`);
});

