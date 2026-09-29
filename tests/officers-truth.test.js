// B-15 and B-25 of the audit. B-15: the lord's officers speak from the engine's muster, not from the chronicle — the
// dossier of the maester and the master-at-arms carries who has answered, who is on the road and when, and the hosts'
// true sizes, and a council reply that quotes a number the dossier does not give is sent back. B-25: a turn never ends
// "until X reaches Y" for a party that is not actually going to Y.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.WC_SAVES = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-officers-'));
process.env.WC_PROVIDER = 'mock';
const game = await import('../server/game.js');
const { CALLS } = await import('../server/ai/calls/index.js');
const { nextTurnLength } = await import('../public/js/shared/turns.js');
const { forces } = await import('../public/js/engine/parties.js');
test.after(() => fs.rmSync(process.env.WC_SAVES, { recursive: true, force: true }));

test('B-15: the officers\' dossier holds the muster in progress and the hosts\' real sizes', async () => {
  const { id, state } = game.newGame('agot_298', 'stark', { seed: 298 });
  const vassals = Object.values(state.houses).filter((h) => h.liege === 'stark').map((h) => h.id);
  game.act(id, { kind: 'call_banners', vassals, at: 'stark', ownLevies: 3000 });
  for (let i = 0; i < 3; i++) { await game.advance(id, { span: '7d', orders: [] }); await game.settled(id); }
  const s = game.loadState(id);
  const ctx = CALLS.council.context(s, { members: ['luwin', 'rodrik_cassel'], words: 'How stand the banners?' });
  const fmt = (x) => Math.round(x).toLocaleString('en-GB');
  // both officers hear the banners as the engine keeps them
  assert.equal((ctx.dossier.match(/the banners: /g) || []).length, 2);
  const called = vassals.filter((v) => s.houses[v].obligations?.levies && s.houses[v].obligations.levies !== 'none');
  assert.ok(called.length >= 3);
  const gathering = called.filter((v) => s.houses[v].obligations.stage === 'gathering');
  const waiting = called.filter((v) => s.houses[v].obligations.levies === 'called' && ['letter', 'deliberating'].includes(s.houses[v].obligations.stage));
  const road = forces(s).filter((a) => a.men > 0 && a.march && (a.owner === 'stark' || a.serving === 'stark'));
  for (const v of gathering) assert.ok(ctx.dossier.includes(`${s.houses[v].name} ${fmt(s.houses[v].obligations.call.men)} men`), `${v} gathering, with the true count`);
  for (const v of waiting) assert.ok(ctx.dossier.includes(s.houses[v].name), `${v} has not answered, and the dossier says so`);
  for (const a of road) assert.ok(ctx.dossier.includes(fmt(a.men)) && /days out/.test(ctx.dossier), `${a.name} on the road with its true strength and its days`);
  // the hosts' sizes
  for (const a of forces(s).filter((x) => x.owner === 'stark' && x.men > 0)) assert.ok(ctx.dossier.includes(`${a.name} ${fmt(a.men)}`), `${a.name} is ${a.men} strong`);
  // the council check: a figure the dossier does not give is flagged; the dossier's own figures are not
  const say = (text) => ({ speeches: [{ speaker: 'luwin', text }] });
  const owned = forces(s).find((x) => x.owner === 'stark' && x.men > 0);
  assert.deepEqual(CALLS.council.check(say(`My lord, ${fmt(owned.men)} men stand at the ready.`), ctx), []);
  const bad = CALLS.council.check(say('My lord, 47,123 swords are on the road and will be here in nine days.'), ctx);
  assert.ok(bad.some((p) => /not a number the dossier gives/.test(p)), bad.join('|'));
});

test('B-25: no arrival reason from a stale march.to; a host truly marching still gives one', () => {
  const { state } = game.newGame('agot_298', 'stark', { seed: 298 });
  // the lord's own host (none stands at the start: a garrison is not a host)
  const a = state.parties.test_host = { id: 'test_host', owner: 'stark', kind: 'host', name: 'The Host of Winterfell', commander: 'robb_stark', men: 3000, pos: [...state.holdings.stark.pos], at: null, members: [], composition: 'Northern levies', morale: 70, supply: 80 };
  const reason = () => nextTurnLength(state).reason;
  const pos = (id) => state.holdings[id].pos;
  const road = (to, toName, dest) => ({ to, toName, pos: dest, path: [a.pos, dest], t: [0, 9], days: 9, done: 0, daysLeft: 9, paid: [] });
  // besieging elsewhere, with an old order still on it
  a.pos = pos('moat_cailin'); a.at = null; a.march = { to: 'stark', since: 0 }; a.route = null; a.state = 'besieging';
  assert.doesNotMatch(String(reason()), new RegExp(`${a.name} reaches`), 'a besieging host has no arrival');
  // pursuing elsewhere: the live road goes to another party, the old march.to is a holding
  const foe = Object.values(state.parties).find((x) => x.owner !== 'stark' && x.pos && x.men > 0);
  a.state = 'marching'; a.march = { to: 'stark', since: 0 }; a.route = road(`party:${foe.id}`, foe.name, foe.pos);
  assert.doesNotMatch(String(reason()), new RegExp(`${a.name} reaches ${state.holdings.stark.name}`), 'the stale goal is not the reason');
  // genuinely marching for a holding: the reason is there
  a.pos = pos('stark'); a.march = { to: 'moat_cailin', since: 0 }; a.route = road('moat_cailin', 'Moat Cailin', pos('moat_cailin'));
  assert.match(String(reason()), new RegExp(`${a.name} reaches ${state.holdings.moat_cailin.name}`));
});
