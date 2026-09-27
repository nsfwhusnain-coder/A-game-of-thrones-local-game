// Audiences that bind and officers who know (docs/gdd/04-ai-system.md §8; 08 §9; 15 §2 `audience-binds`,
// `officers-know-truth`; WP B10): the engine's verdict limits what may be promised, a promise is a Commitment the engine
// acts on and judges, and the lord's own officers speak from the true state of the house.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.WC_SAVES = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-audience-'));
process.env.WC_PROVIDER = 'mock';
const game = await import('../server/game.js');
const { CALLS } = await import('../server/ai/calls/index.js');
const { readReply } = await import('../server/ai/client.js');
const { requestOf } = await import('../server/ai/calls/audience.js');
const { createInitialState, applyChanges } = await import('../public/js/shared/world.js');
const { makeCommitment, commitmentsTick } = await import('../public/js/engine/politics/commitments.js');
const { withRng } = await import('../public/js/engine/rng.js');
const { setLoc } = await import('../public/js/engine/parties.js');
const save = (id, s) => fs.writeFileSync(path.join(process.env.WC_SAVES, id, 'state.json'), JSON.stringify(s));

const banners = async () => {
  const { id, state } = game.newGame('agot_298', 'stark', { seed: 298 });
  const vassals = Object.values(state.houses).filter((h) => h.liege === 'stark').map((h) => h.id);
  game.act(id, { kind: 'call_banners', vassals, at: 'stark', ownLevies: 3000 });
  await game.advance(id, { span: '7d', orders: [] }); await game.settled(id);
  return id;
};

test('the request is read from the words, and the verdict decides what may be promised', () => {
  const s = createInitialState('agot_298', 'stark', { seed: 298 });
  assert.deepEqual(requestOf(s, s.characters.roose_bolton, 'Bring your men to Moat Cailin within the fortnight.', { I: {} }), [{ kind: 'march_to', target: 'moat_cailin', by_days: 14 }]);
  assert.deepEqual(requestOf(s, s.characters.roose_bolton, 'Send three thousand spears to the Twins within ten days.', { I: {} }), [{ kind: 'send_men', target: 'frey', by_days: 10, men: 3000 }]);
  const refuse = CALLS.audience.context(s, { character: 'roose_bolton', words: 'Bring your men to Moat Cailin.', stance: { verdict: 'refuse', I: {} } });
  assert.equal(CALLS.audience.schema(refuse).properties.outcome.properties.agrees_to.maxItems, 0, 'one who refuses agrees to nothing');
  const reply = JSON.stringify({ beats: [{ kind: 'speech', text: 'No.' }], outcome: { agrees_to: [{ kind: 'none', target: 'none', by_days: 0 }], asks_for: '', reveals: 'none', mood: 'cold' } });
  assert.ok(readReply(reply, CALLS.audience, refuse, CALLS.audience.schema(refuse)).problems.length, 'a promise under a refusal is refused by the schema');
});

test('audience-binds: Roose Bolton promises his men at Moat Cailin; a sincere promise turns his host the next day and is judged when due', async () => {
  for (const sincere of [true, false]) {
    const id = await banners();
    // Lord Bolton has come to Winterfell ahead of his men, to hear his liege
    { const s0 = game.loadState(id); setLoc(s0, s0.characters.roose_bolton, 'stark'); s0.characters.roose_bolton.opinion = 60; save(id, s0); }
    const r = await game.talk(id, 'roose_bolton', 'Lord Bolton, will you bring your men to Moat Cailin within the fortnight?');
    assert.equal(r.stance.verdict, 'agree', `the engine's verdict (${r.stance.verdict})`);
    assert.match(r.applied.map((a) => a.text).join(' '), /promises to bring his men to Moat Cailin within 14 days/);
    let s = game.loadState(id);
    const cm = s.commitments.find((c) => c.by === 'roose_bolton');
    assert.ok(cm && cm.kind === 'march_to' && cm.params.place === 'moat_cailin' && cm.state === 'open');
    assert.ok(game.readFacts(id, {}).some((f) => f.kind === 'commitment_made' && f.actors.includes('roose_bolton')), 'the promise is a fact');
    // how much he meant it is the engine's secret; the test decides it
    cm.sincerity = sincere ? 0.9 : 0.1; save(id, s);
    await game.advance(id, { span: '1d', orders: [] }); await game.settled(id);
    s = game.loadState(id);
    const bound = Object.values(s.parties).filter((a) => a.owner === 'bolton' && a.kind === 'host' && (a.march?.to === 'moat_cailin' || a.at === 'moat_cailin'));
    if (sincere) assert.ok(bound.length, 'Bolton\'s men are marching for Moat Cailin the next day');
    else assert.equal(bound.length, 0, 'a false promise moves no one');
    for (let i = 0; i < 4 && s.commitments.find((c) => c.id === cm.id).state === 'open'; i++) { await game.advance(id, { span: '7d', orders: [] }); await game.settled(id); s = game.loadState(id); }
    const end = s.commitments.find((c) => c.id === cm.id);
    assert.ok(['kept', 'broken'].includes(end.state), end.state);
    if (!sincere) assert.equal(end.state, 'broken');
    assert.ok(game.readFacts(id, {}).some((f) => f.kind === `commitment_${end.state}` && f.data?.commitment === cm.id), 'kept or broken, with a fact');
  }
});

test('officers-know-truth: after the banners are called, Maester Luwin\'s audience knows who has come, who is on the road and when', async () => {
  const id = await banners();
  const s = game.loadState(id);
  const ctx = CALLS.audience.context(s, { character: 'luwin', words: 'How stand the banners?', stance: { verdict: null, I: { question: true } } });
  assert.match(ctx.dossier, /THE BANNERS: /);
  assert.match(ctx.dossier, /On the road: \w+ [\d,]+ for .*~\d+ days out/);
  assert.match(ctx.dossier, /No answer yet: .*Bolton/);
  assert.match(ctx.dossier, /THE HOUSE'S STRENGTH \(true/);
  const r = await game.talk(id, 'luwin', 'How stand the banners?');
  assert.ok(r.reply && !r.applied.some((a) => /promises/.test(a.text)));
  assert.match(fs.readFileSync(path.join(process.env.WC_SAVES, id, 'last-prompt-audience.txt'), 'utf8'), /THE BANNERS: /);
});

test('promises: paid when the gift is sent, broken by a war on the one promised peace, void when the maker dies', () => {
  const s = createInitialState('agot_298', 'stark', { seed: 298 });
  withRng(s, () => {
    const pay = makeCommitment(s, { by: 'walder_frey', to: 'eddard_stark', kind: 'pay', params: { gold: 500 }, days: 10 }); pay.sincerity = 0.9;
    const peace = makeCommitment(s, { by: 'tywin_lannister', to: 'eddard_stark', kind: 'stay_neutral', days: 90 });
    const dead = makeCommitment(s, { by: 'jon_arryn', to: 'eddard_stark', kind: 'attend', params: { place: 'stark' }, days: 30 });
    s.characters.jon_arryn.alive = false;
    commitmentsTick(s, { phase: 'start' });
    commitmentsTick(s);
    assert.equal(pay.state, 'kept', 'the gold went north');
    assert.equal(dead.state, 'void');
    applyChanges(s, [{ op: 'war', id: 'w', name: 'The Lannister war', attackers: ['lannister'], defenders: ['stark'] }]);
    commitmentsTick(s);
    assert.equal(peace.state, 'broken');
    assert.ok((s.facts || []).some((f) => f.kind === 'commitment_broken' && f.data.commitment === peace.id));
  });
});
