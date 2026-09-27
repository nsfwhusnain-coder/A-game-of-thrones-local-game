// What each house knows (docs/gdd/09-living-world.md §7; WP B9): news that travels by sight, raven and rumour; facts
// learned by spies; hosts known by report; minds that reason from their house's knowledge; and the player's view, which
// never carries a truth the house does not know (invariants 9 and 10 of 03 §14).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.WC_SAVES = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-knowledge-'));
process.env.WC_PROVIDER = 'mock';
const { createInitialState, applyChanges } = await import('../public/js/shared/world.js');
const { emit, asEvent } = await import('../public/js/engine/facts/log.js');
const { dayNumber } = await import('../public/js/engine/time.js');
const K = await import('../public/js/engine/knowledge.js');
const { worldView } = await import('../public/js/engine/minds/options.js');
const { validate } = await import('../public/js/engine/state/validate.js');
const { playerView, hiddenTruths, viewOf } = await import('../server/view.js');
const { withRng } = await import('../public/js/engine/rng.js');
const game = await import('../server/game.js');

const world = (house = 'stark') => createInitialState('agot_298', house, { seed: 298 });
const week = (s) => { const d0 = dayNumber(s.meta.date); s.meta.clock = { turn: s.meta.turn + 1, from: d0 + 1, to: d0 + 7 }; return s; };

test('news: one\'s own at once, what is seen at once, great news by raven, small news by rumour and not far, secrets never', () => {
  const s = week(world());
  const own = emit(s, 'levies_called', { actors: ['eddard_stark'], houses: ['stark'], place: 'stark', on: 1 });
  assert.deepEqual(K.newsOf(s, own, 'stark'), { day: own.day, via: 'witness', confidence: 1 });
  const seen = emit(s, 'feast', { actors: ['roose_bolton'], houses: ['bolton'], place: 'bolton', on: 2, importance: 2 }); // a sworn castle
  assert.equal(K.newsOf(s, seen, 'stark').via, 'witness');
  const far = emit(s, 'war_declared', { houses: ['martell', 'tyrell'], place: 'martell', on: 1 }); // Sunspear: public, weighty
  const n = K.newsOf(s, far, 'stark');
  assert.equal(n.via, 'raven'); assert.ok(n.day - far.day >= 5 && n.day - far.day <= 10, `${n.day - far.day} days by raven`);
  const small = emit(s, 'feast', { houses: ['martell'], place: 'martell', on: 1, importance: 1 }); // a local matter at Sunspear
  assert.equal(K.newsOf(s, small, 'stark'), null, 'the North does not hear of a Dornish feast');
  assert.equal(K.newsOf(s, small, 'martell').via, 'witness');
  const letter = emit(s, 'pact_made', { houses: ['lannister', 'frey'], place: 'lannister', on: 3, vis: { scope: 'houses', houses: ['lannister', 'frey'] } });
  assert.equal(K.newsOf(s, letter, 'stark'), null); assert.equal(K.newsOf(s, letter, 'frey').via, 'witness');
  const secret = emit(s, 'scheme_discovered', { houses: ['lannister'], place: 'lannister', on: 2, vis: { scope: 'secret' } });
  assert.equal(K.newsOf(s, secret, 'stark'), null);
  K.learn(s, 'stark', secret, { via: 'spy', day: secret.day + 2 });
  assert.equal(K.newsOf(s, secret, 'stark').via, 'spy');
  assert.throws(() => K.learn(s, 'stark', far, { via: 'rumour' }), /not learned by rumour/);
  assert.deepEqual(validate(s, { only: [9] }), []);
  s.knowledge.stark.facts[secret.id].via = 'witness';
  assert.match(validate(s, { only: [9] }).join(' '), /knows the secret/, 'invariant 9 catches a secret known without a spy');
});

test('the chronicle hears late: a card is told the day its word arrives, or waits for the turn it does', () => {
  const s = week(world());
  const near = emit(s, 'levies_called', { actors: ['eddard_stark'], houses: ['stark'], place: 'stark', on: 1 });
  const soon = emit(s, 'war_declared', { houses: ['lannister', 'tully'], place: 'tully', on: 1 }); // Riverrun: a raven in days
  const late = emit(s, 'village_burned', { houses: ['martell'], place: 'martell', on: 6, importance: 3, vis: { scope: 'public' } }); // far, on day 6
  const cards = [near, soon, late].map((f) => asEvent(s, f));
  const told = K.holdNews(s, cards);
  assert.equal(told.find((c) => c.fact === near.id).heard, undefined, 'one\'s own is told when it happens');
  const w = told.find((c) => c.fact === soon.id); assert.equal(w.heard.via, 'raven'); assert.ok(w.day > 1);
  assert.ok(!told.some((c) => c.fact === late.id), 'the Dornish news has not come yet');
  assert.equal(s.knowledge.stark.pending.length, 1);
  // the next week: it arrives, with the day it happened
  s.meta.clock = { turn: s.meta.clock.turn + 1, from: s.meta.clock.to + 1, to: s.meta.clock.to + 21 }; // a long turn: the raven is on the wing ~10 days
  const due = K.newsDue(s);
  assert.equal(due.length, 1); assert.equal(due[0].fact, late.id); assert.ok(due[0].late && due[0].heard.happened);
  assert.deepEqual(s.knowledge.stark.pending, []);
});

test('minds reason from their house\'s knowledge: an enemy host they have no word of is not among their foes\' hosts', () => {
  const s = world('stark');
  withRng(s, () => applyChanges(s, [
    { op: 'war', id: 'w', name: 'A war', attackers: ['martell'], defenders: ['lannister'] },
    { op: 'army_create', id: 'dornish_band', owner: 'martell', name: 'Dornish riders', at: 'martell', men: 400 },
  ]));
  const tywin = worldView(s, 'tywin_lannister');
  assert.ok(!tywin.foeHosts.some((a) => a.id === 'dornish_band'), 'four hundred riders at Sunspear are no news at Casterly Rock');
  s.parties.dornish_band.pos = [...s.holdings.lannister.pos]; s.parties.dornish_band.at = 'lannister';
  assert.ok(worldView(s, 'tywin_lannister').foeHosts.some((a) => a.id === 'dornish_band'), 'at the gates, they are seen');
});

test('the player\'s view: an unseen host is not sent where it stands; secrets, minds and unread answers stay on the server', () => {
  const s = world('stark');
  withRng(s, () => applyChanges(s, [{ op: 'army_create', id: 'secret_host', owner: 'lannister', name: 'A Lannister host', at: 'lannister', men: 2000 }]));
  s.parties.secret_host.pos = [s.parties.secret_host.pos[0] + 7, s.parties.secret_host.pos[1] + 3]; delete s.parties.secret_host.at;
  s.parties.secret_host.march = { to: 'tully' };
  s.minds = { last: { tywin_lannister: 1 } }; s.pendingReplies = [{ char: 'lysa_arryn', text: 'I will not.' }];
  s.history = [{ turn: 1, events: [], minds: [{ who: 'tywin_lannister', secret_aim: 'to crush the Tullys' }], applied: [{ text: 'x' }] }];
  const v = playerView(s);
  assert.deepEqual(hiddenTruths(s, v), []);
  const h = v.parties.secret_host;
  assert.ok(!h || (h.known === 'reported' && JSON.stringify(h.pos) !== JSON.stringify(s.parties.secret_host.pos)), 'not where it truly stands');
  assert.ok(!JSON.stringify(v).includes('fathered by her twin'), 'Cersei\'s secret is not sent');
  assert.equal(v.characters.cersei_lannister.secretHidden, true);
  assert.ok(v.characters.eddard_stark.secret, 'the lord\'s own secret is his');
  assert.ok(!('minds' in v) && !('pendingReplies' in v) && !v.history[0].minds && !v.history[0].applied);
  assert.equal(s.parties.secret_host.march.to, 'tully', 'the truth is untouched');
  // the truth on the other side of the view would break it
  const leaky = { ...v, parties: { ...v.parties, secret_host: { ...s.parties.secret_host } } };
  assert.ok(hiddenTruths(s, leaky).length, 'invariant 10 catches a leak');
  assert.equal(viewOf({ state: s, ok: true }).state.parties.secret_host?.march, undefined);
});

test('over the turns: the view never leaks and every house learned in time (Stark, six weeks)', async () => {
  const { id } = game.newGame('agot_298', 'stark', { seed: 7 });
  for (let t = 0; t < 6; t++) {
    const r = await game.advance(id, { span: '7d', orders: t === 0 ? [{ text: 'Call the banners to Winterfell.' }] : [] }); await game.settled(id);
    const s = game.loadState(id);
    assert.deepEqual(hiddenTruths(s, playerView(s)), [], `turn ${r.turn.turn}`);
    assert.deepEqual(validate(s, { only: [9] }), []);
    for (const e of r.turn.events) if (e.heard) assert.ok(e.day >= 1 && e.heard.happened, `turn ${r.turn.turn}: "${e.title}" says when it happened`);
  }
});
