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


// ── Muster v2 (WP C2; docs/gdd/07-military.md §3) ──
const { answerOdds, menSent, gatherDays, musterOf, summon } = await import('../public/js/engine/military/muster.js');
const { createInitialState } = await import('../public/js/shared/world.js');

test('the answer is the lord\'s nature: the devoted answer, the resentful refuse; a full call and the harvest weigh on it', () => {
  const s = createInitialState('agot_298', 'stark', { seed: 1 });
  const v = s.houses.umber; const lord = s.characters[v.lord];
  lord.loyalty = 100; s.relations[['stark', 'umber'].sort().join('|')] = { v: 100 };
  const devoted = answerOdds(s, v); assert.ok(devoted.temper >= 70 && devoted.answered === 95 && devoted.refused === 0, JSON.stringify(devoted));
  lord.loyalty = 0; s.relations[['stark', 'umber'].sort().join('|')] = { v: -100 };
  const bitter = answerOdds(s, v); assert.ok(bitter.refused >= 50, JSON.stringify(bitter));
  lord.loyalty = 60; s.relations[['stark', 'umber'].sort().join('|')] = { v: 40 };
  const q = answerOdds(s, v), f = answerOdds(s, v, { scope: 'full' });
  assert.equal(f.answered, q.answered - 10, 'a full call is answered less readily');
  s.world.season = 'autumn'; assert.equal(answerOdds(s, v).answered, q.answered - 10, 'the harvest keeps men home');
  // men: a quick call is about two fifths of the levies, a full one nine tenths; a late answer brings fewer
  const quick = menSent(s, v), full = menSent(s, v, { scope: 'full' }), late = menSent(s, v, { late: true });
  assert.ok(full.men > quick.men * 1.7 && late.men < quick.men, JSON.stringify({ quick, full, late }));
  assert.equal(quick.men % 50, 0);
  s.world.season = 'summer';
  assert.equal(gatherDays(s, v), 12, 'the North is wide'); assert.equal(gatherDays(s, s.houses.frey), 8);
});

test('muster-one-host: called quick to Winterfell, the host sent to Moat Cailin a week later — one host, the banners joining it or on its road', async () => {
  const { id, state } = game.newGame('agot_298', 'stark', { seed: 7 });
  const vassals = Object.values(state.houses).filter((h) => h.liege === 'stark').map((h) => h.id);
  game.act(id, { kind: 'call_banners', vassals, at: 'stark', ownLevies: 3000 });
  await game.advance(id, { span: '7d' });
  let s = game.loadState(id);
  const host = Object.values(s.parties).find((a) => a.owner === 'stark' && a.kind === 'host' && a.at === 'stark');
  game.act(id, { kind: 'march', army: host.id, to: 'moat_cailin' });
  for (let i = 0; i < 4; i++) await game.advance(id, { span: '10d' });
  s = game.loadState(id);
  const hosts = Object.values(s.parties).filter((a) => a.owner === 'stark' && a.kind === 'host' && a.men > 0 && a.id !== host.id && !/household/i.test(a.name));
  assert.deepEqual(hosts.map((a) => a.name), [], 'exactly one Stark host');
  for (const v of vassals) {
    const ob = s.houses[v].obligations;
    if (ob.stage === 'departed') assert.equal(String(s.parties[ob.host]?.march?.to), 'party:' + host.id, `${v} is on the host's road`);
    if (ob.stage === 'gathering') assert.equal(s.parties[ob.host]?.at, s.houses[v].seat, `${v} gathers at home`);
  }
  assert.ok(!Object.values(s.parties).some((a) => a.serving === 'stark' && a.at === 'stark' && !a.march), 'none sits at Winterfell after the host left');
});

test('the days the muster promises are the days it keeps: every lord who marched by land joined within two days of his reckoning', async () => {
  for (const [house, seed] of [['tully', 2], ['tyrell', 4]]) {
    const { id, state } = game.newGame('agot_298', house, { seed });
    const vassals = Object.values(state.houses).filter((h) => h.liege === house).map((h) => h.id);
    game.act(id, { kind: 'call_banners', vassals, at: state.houses[house].seat, ownLevies: 2000 });
    for (let i = 0; i < 4; i++) await game.advance(id, { span: '14d' });
    const s = game.loadState(id);
    const calls = vassals.map((v) => s.houses[v].obligations.call).filter((c) => c?.joined && c.eta0 && !c.bySea);
    assert.ok(calls.length >= 8, `${house}: ${calls.length} joined`);
    for (const c of calls) assert.ok(Math.abs(c.joined - c.eta0) <= 2, `${house}: joined on ${c.joined}, reckoned ${c.eta0}`);
  }
});

test('the host card\'s muster: present, on the road, expected with a day, refused — and Wait for the banners holds the host until they are in', async () => {
  const { id, state } = game.newGame('agot_298', 'stark', { seed: 12 });
  const vassals = Object.values(state.houses).filter((h) => h.liege === 'stark').map((h) => h.id);
  game.act(id, { kind: 'call_banners', vassals, at: 'stark', ownLevies: 3000 });
  let s = game.loadState(id);
  const host = Object.values(s.parties).find((a) => a.owner === 'stark' && a.kind === 'host' && a.at === 'stark');
  const first = musterOf(s, host.id);
  assert.equal(first.expected.length, vassals.length, 'every lord called is expected');
  assert.ok(first.expected.every((x) => (x.bySea ? x.eta === null : x.eta > 0) && x.men >= 0), 'a day for each, but for those who must cross the sea');
  assert.ok(first.expected.some((x) => x.bySea), 'Bear Island is across the water');
  // wait for eight tenths of them, then march for Moat Cailin
  game.act(id, { kind: 'march', army: host.id, to: 'moat_cailin' });
  const r = game.act(id, { verb: 'wait_banners', params: { army: host.id, share: 80 } });
  assert.match(r.receipt.map((l) => l.text).join(' '), /waits at Winterfell until 80% .* then it marches for Moat Cailin/);
  s = game.loadState(id);
  assert.ok(s.parties[host.id].wait && !s.parties[host.id].march, 'the host holds');
  await game.advance(id, { span: '21d' });
  s = game.loadState(id);
  const m = musterOf(s, host.id);
  assert.ok(m.present.length + m.road.length > 0, 'some have come or are coming');
  for (let i = 0; i < 6 && s.parties[host.id].wait; i++) { await game.advance(id, { span: '7d' }); s = game.loadState(id); }
  assert.ok(!s.parties[host.id].wait && (s.parties[host.id].march || s.parties[host.id].at === 'moat_cailin'), 'the banners are in, or the days are up: it marches');
});
