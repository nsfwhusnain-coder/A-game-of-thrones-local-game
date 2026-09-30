// Wars, momentum and "where to focus" (docs/gdd/19-realm-ledger.md §4.6, §6.2, §6.4; WP R6): the words for a house's direction and their reasons, the flags, the movement of a war
// as its own side has seen it, and the facts the realm is saying. The engine makes every line from numbers the viewer can already read; these tests hold it to that —
// the movement follows the score delta over the window, another house's war shows no score, a war the viewer has not heard of is absent, a war that ends leaves the list,
// every focus is something the player may lawfully do, and each fact fires on a state built for it and on no other.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.WC_PROVIDER = 'mock';
const { sampleRealm, WAR_KEEP } = await import('../public/js/engine/realm/stats.js');
const { realmViewFor } = await import('../public/js/engine/realm/view.js');
const { warMomentum } = await import('../public/js/engine/politics/war.js');
const { flagsOf, wordOf } = await import('../public/js/engine/realm/notes.js');
const { validate } = await import('../public/js/engine/state/validate.js');
process.env.WC_SAVES = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-realm-wars-'));
const game = await import('../server/game.js');
const { createInitialState } = await import('../public/js/shared/world.js');
const { addDays, dayNumber } = await import('../public/js/engine/time.js');
const { withRng } = await import('../public/js/engine/rng.js');
const { emit } = await import('../public/js/engine/facts/log.js');
const K = await import('../public/js/engine/knowledge.js');
test.after(() => fs.rmSync(process.env.WC_SAVES, { recursive: true, force: true }));

const world = (house = 'stark') => createInitialState('agot_298', house, { seed: 298 });
const view = (s, o) => realmViewFor(s, 'stark', o);
const json = (x) => JSON.stringify(x);
const clone = (x) => JSON.parse(JSON.stringify(x));
const tick = (s, days = 7) => { s.meta.turn += 1; s.meta.date = addDays(s.meta.date, days); sampleRealm(s); withRng(s, () => K.updateKnowledge(s, 'stark')); return s; };
/** A war is on, and Stark has heard of it (it is put in before the first look, which is what every lord knows at the start). */
const war = (s, { heard = true, ...o } = {}) => {
  const w = { id: 'w_north', name: 'The Northern Fray', attackers: ['lannister'], defenders: ['stark'], started: '1 8th moon, 298 AC', status: 'ongoing', note: '', score: 0, ...o }; s.wars.push(w);
  // what Stark knows of it, in the shape learnWars keeps (a war declared and heard of): without it a war begun after the look is a secret
  if (heard) { const k = K.knowledgeOf(s, 'stark'); k.wars = { ...(k.wars || {}), [w.id]: { name: w.name, A: [...w.attackers], D: [...w.defenders], turn: s.meta.turn, day: dayNumber(s.meta.date), fs: [] } }; }
  return w;
};
const score = (s, w, v) => { w.score = v; return v; };

test('warMomentum: the delta over the window says gaining, holding or slipping, from the side\'s own point of view', () => {
  const S = [[0, 0], [7, 4], [14, 9], [21, 14]];                                  // the attackers' score
  assert.deepEqual(warMomentum(S, 'A', 0), { now: 14, delta: 14, word: 'gaining', standing: 'leading' });
  assert.deepEqual(warMomentum(S, 'D', 0), { now: -14, delta: -14, word: 'slipping', standing: 'trailing' }, 'the defenders see the same war the other way');
  assert.equal(warMomentum(S, 'A', 14).delta, 5, 'the window starts at the last sample at or before it'); assert.equal(warMomentum(S, 'A', 14).word, 'holding');
  assert.equal(warMomentum([[10, 3]], 'A', 20).delta, 0, 'one point cannot move');
  assert.equal(warMomentum([[10, 6]], 'A', -Infinity).delta, 6, 'a war begun inside the window began level');
  assert.equal(warMomentum([], 'A'), null); assert.equal(warMomentum(S, 'X'), null);
  assert.equal(warMomentum([[0, 0], [7, 8]], 'A', 0).word, 'gaining', 'eight is enough'); assert.equal(warMomentum([[0, 0], [7, 7]], 'A', 0).word, 'holding');
  assert.equal(warMomentum([[0, 5], [7, -5]], 'A', 0).standing, 'level', 'within ten either way is level');
});

test('the truth series keeps the score of each war that is on, weekly, at most twenty-four points, and forgets a war that has ended', () => {
  const s = world(); const w = war(s); sampleRealm(s);
  assert.deepEqual(s.realmStats.wars.w_north, [[dayNumber(s.meta.date), 0]]);
  for (let i = 1; i <= 30; i++) { score(s, w, Math.max(-100, Math.min(100, i * 3))); tick(s); }
  const line = s.realmStats.wars.w_north;
  assert.equal(line.length, WAR_KEEP); assert.equal(line.at(-1)[1], 90); assert.ok(line.every((p, i) => i === 0 || p[0] > line[i - 1][0]), 'days go forward');
  const before = line.length; sampleRealm(s); assert.equal(s.realmStats.wars.w_north.length, before, 'the same day again is not a second point');
  w.status = 'ended'; tick(s); assert.ok(!('w_north' in s.realmStats.wars), 'an ended war leaves the series');
  assert.deepEqual(validate(s).filter((p) => /^12:/.test(p)), [], 'and the series is well-formed');
  s.realmStats.wars.w_x = [[5, 3], [4, 1]]; assert.ok(validate(s).some((p) => /go forward|score series/.test(p)), 'a series that goes back is caught');
});

test('the view shows the movement of a war the viewer is in, over the window, and its swords as the ledger shows them', () => {
  const s = world(); const w = war(s); tick(s);
  for (const v of [8, 15, 22, 30]) { score(s, w, -v); tick(s); }                   // the attackers slip: the defenders (Stark) gain
  const v = view(s, { window: 3 }); const x = v.wars.find((q) => q.id === 'w_north');
  assert.ok(x, 'Stark is in it and knows it'); assert.equal(x.you, 'D');
  assert.deepEqual([x.momentum, x.standing, x.delta > 0], ['gaining', 'leading', true]);
  assert.ok(x.strength.A && x.strength.D && ['≥', '~', '≈', ''].includes(x.strength.D.mark), 'each side has its swords as displayed, never the truth');
  // the window changes what "over the window" is
  const one = view(s, { window: 3 }).wars.find((q) => q.id === 'w_north'); assert.ok(Math.abs(one.delta) <= 100);
});

test('another house\'s war shows no score and no movement: only its sides and the swords each is known to have', () => {
  const s = world(); const w = war(s, { id: 'w_far', name: 'A war beyond the Trident', attackers: ['martell'], defenders: ['lannister'] }); tick(s);
  for (const v of [10, 20, 30, 40]) { score(s, w, v); tick(s); }
  const x = view(s).wars.find((q) => q.id === 'w_far'); assert.ok(x, 'Stark has heard of it');
  assert.equal(x.you, null); for (const k of ['momentum', 'standing', 'delta']) assert.ok(!(k in x), `no ${k}`);
  const t = clone(s); t.wars.find((q) => q.id === 'w_far').score = -77; t.realmStats.wars.w_far = t.realmStats.wars.w_far.map(([d]) => [d, -77]);
  assert.equal(json(view(t)), json(view(s)), 'the score of a war Stark only hears of moves nothing');
});

test('a war the viewer has not heard of is absent, and a war that ends leaves the list', () => {
  const s = world(); tick(s);
  const late = war(s, { id: 'w_secret', name: 'A secret war', attackers: ['martell'], defenders: ['tyrell'], heard: false }); tick(s);
  assert.ok(!view(s).wars.some((q) => q.id === 'w_secret'), 'a war begun in secret, no word of it come');
  // Stark hears of the north's war, then of its peace
  const t = world(); const w = war(t); tick(t); assert.ok(view(t).wars.some((q) => q.id === 'w_north'));
  w.status = 'ended';
  withRng(t, () => { emit(t, 'peace_made', { houses: ['lannister', 'stark'], importance: 4, data: { war: 'w_north', name: w.name }, text: 'Peace is made.' }); });
  tick(t); assert.ok(!view(t).wars.some((q) => q.id === 'w_north'), 'the peace is heard, and the war is gone from the list'); void late;
});

test('a row\'s word is rising, falling or steady from the Power series, only when two turns say so, and its reasons come from its flags', () => {
  const dir = (d) => ({ dir: d, arrow: '·', seems: false });
  assert.deepEqual(wordOf(dir('growing'), [{ id: 'swollen', text: 'has called its banners' }, { id: 'hungry', text: 'under a moon of bread' }]), { word: 'rising', arrow: '·', seems: false, why: ['has called its banners'] });
  assert.deepEqual(wordOf(dir('shrinking'), [{ id: 'reeling', text: 'has lost 2 holdings' }, { id: 'swollen', text: 'x' }]).why, ['has lost 2 holdings']);
  assert.equal(wordOf(dir('steady'), [{ id: 'hungry', text: 'x' }]).why.length, 0); assert.equal(wordOf(dir('—'), []).word, '—');
  const s = world(); for (let i = 0; i < 6; i++) tick(s);
  const v = view(s); for (const r of v.rows) { assert.ok(['rising', 'falling', 'steady', '—'].includes(r.word.word), `${r.house}: ${r.word.word}`); assert.ok(Array.isArray(r.flags) && Array.isArray(r.word.why)); }
  assert.deepEqual(Object.keys(v.going).sort(), ['falling', 'rising']);
  assert.ok([...v.going.rising, ...v.going.falling].every((h) => v.rows.some((r) => r.house === h)), 'the strip names houses that are in the table');
});

test('flags: hungry, broke, reeling, swollen, winning and losing each fire on the numbers built for them and on no other', () => {
  const cell = (v) => ({ v, mark: '' });
  const none = { cells: { food: cell(120), gold: cell(50000), expenses: cell(3000) }, holdings: [[0, 8], [90, 8]], swords: [[0, 1000], [90, 1100]] };
  assert.deepEqual(flagsOf(none), []);
  assert.deepEqual(flagsOf({ ...none, cells: { ...none.cells, food: cell(15) } }).map((f) => f.id), ['hungry']);
  assert.match(flagsOf({ ...none, cells: { ...none.cells, food: cell(8) } })[0].text, /under a moon/);
  assert.deepEqual(flagsOf({ ...none, cells: { ...none.cells, gold: cell(2000) } }).map((f) => f.id), ['broke']);
  assert.deepEqual(flagsOf({ ...none, cells: { ...none.cells, gold: { word: 'sound', via: 'rumour' } } }).map((f) => f.id), [], 'a wealth word is no number to compare');
  assert.deepEqual(flagsOf({ ...none, holdings: [[0, 8], [90, 6]] }).map((f) => f.id), ['reeling']); assert.deepEqual(flagsOf({ ...none, holdings: [[0, 8], [90, 7]] }).map((f) => f.id), []);
  assert.deepEqual(flagsOf({ ...none, swords: [[0, 1000], [90, 1250]] }).map((f) => f.id), ['swollen']); assert.deepEqual(flagsOf({ ...none, swords: [[0, 1000], [90, 1240]] }).map((f) => f.id), []);
  assert.deepEqual(flagsOf({ ...none, war: { word: 'gaining', name: 'the Fray' } }).map((f) => f.id), ['winning']); assert.deepEqual(flagsOf({ ...none, war: { word: 'slipping', name: 'the Fray' } }).map((f) => f.id), ['losing']);
  assert.deepEqual(flagsOf({ ...none, war: { word: 'holding', name: 'the Fray' } }), []);
});

test('what the realm is saying: each kind of fact fires on a state built for it, and not otherwise; heaviest first, in a stable order', () => {
  const kinds = (s, o) => view(s, o).facts.map((f) => f.kind);
  const s = world(); tick(s);
  assert.ok(!kinds(s).some((k) => ['hungry', 'broke', 'besieged', 'unrest', 'debt_due', 'host_near', 'war_turning'].includes(k)), 'a quiet realm says none of these');
  const hungry = clone(s); hungry.houses.stark.figures.food.v = 1.4; assert.ok(kinds(hungry).includes('hungry'));
  const broke = clone(s); broke.houses.stark.figures.treasury.v = 1000; broke.projects = [...(broke.projects || []), { id: 'w_hall', name: 'A great hall', house: 'stark', status: 'active', perMonth: 500000, monthsLeft: 6 }];
  assert.ok(kinds(broke).includes('broke')); const thin = clone(s); thin.houses.stark.figures.treasury.v = 1000; assert.ok(!kinds(thin).includes('broke'), 'a thin purse with a fat income is not broke');
  const besieged = clone(s); const seat = besieged.houses.stark.seat; besieged.holdings[seat].status = 'besieged'; assert.ok(kinds(besieged).includes('besieged'));
  const unrest = clone(s); unrest.holdings[unrest.houses.stark.seat].unrest = 60; assert.ok(kinds(unrest).includes('unrest'));
  const owed = clone(s); owed.economy.loans.push({ id: 'l1', lender: 'lannister', debtor: 'stark', amount: 40000, rate: 0.1, pays: 'coin', since: 0, due: dayNumber(owed.meta.date) + 20 }); assert.ok(kinds(owed).includes('debt_due'));
  const called = clone(s); called.economy.loans.push({ id: 'l2', lender: 'lannister', debtor: 'stark', amount: 40000, rate: 0.1, pays: 'coin', since: 0, due: dayNumber(called.meta.date) + 500, called: true }); assert.ok(kinds(called).includes('debt_due'));
  const later = clone(s); later.economy.loans.push({ id: 'l3', lender: 'lannister', debtor: 'stark', amount: 40000, rate: 0.1, pays: 'coin', since: 0, due: dayNumber(later.meta.date) + 500 }); assert.ok(!kinds(later).includes('debt_due'), 'a debt far off is not news');
  const winter = clone(s); winter.world = { ...(winter.world || {}), season: 'winter', seasonNote: 'Winter has come.' }; assert.ok(kinds(winter).includes('season'));
  const summer = clone(s); summer.world = { ...(summer.world || {}), season: 'summer' }; assert.ok(!kinds(summer).includes('season'));
  // a war turning
  const t = world(); const w = war(t); tick(t); for (const v of [10, 20, 30]) { score(t, w, -v); tick(t); } assert.ok(kinds(t).includes('war_turning'));
  // order: heaviest first, then by id, and the same every time
  const many = clone(hungry); many.holdings[many.houses.stark.seat].status = 'besieged'; many.world = { season: 'winter' };
  const f = view(many).facts; assert.ok(f.length >= 3 && f.length <= 12);
  assert.deepEqual(f.map((x) => x.weight), [...f.map((x) => x.weight)].sort((a, b) => b - a), 'heaviest first'); assert.equal(json(view(many).facts), json(f), 'stable');
  for (const x of f) { assert.ok(x.id && x.kind && x.text && Number.isFinite(x.weight) && x.via !== undefined, `${x.kind}: the shape`); assert.doesNotMatch(x.text, /undefined|NaN|\[object/); }
});

test('a fact about the viewer\'s own house that has an answer carries its order, and the server keeps as focus only what the player may lawfully do', async () => {
  const { id } = game.newGame('agot_298', 'stark', { seed: 5 });
  try {
    const st = game.loadState(id); st.houses.stark.figures.food.v = 1.2; st.houses.stark.figures.treasury.v = 200000;
    const facts = realmViewFor(st, 'stark', {}).facts; const hungry = facts.find((f) => f.kind === 'hungry');
    assert.ok(hungry && hungry.verb === 'buy_grain' && /grain/i.test(hungry.order), 'own hunger answers with grain');
    const { optionsFor } = await import('../public/js/engine/minds/options.js');
    const lawful = new Set(optionsFor(st, st.houses.stark.lord).options.map((o) => o.verb));
    const focus = game.realmFocus(st, facts);
    assert.ok(focus.length <= 3 && focus.every((f) => lawful.has(f.verb)), `every focus verb is lawful: ${focus.map((f) => f.verb)}`);
    assert.ok(focus.some((f) => f.verb === 'buy_grain'), 'the granary is the thing to see to');
    // with no coin for it the same hunger has no lawful answer, and no focus
    st.houses.stark.figures.treasury.v = 100; const poor = game.realmFocus(st, realmViewFor(st, 'stark', {}).facts);
    assert.ok(!poor.some((f) => f.verb === 'buy_grain'), 'no coin, no grain to buy: the button is not offered');
    // facts about others carry no order at all
    for (const f of facts.filter((x) => x.about !== 'stark' && !['besieged', 'unrest', 'host_near', 'debt_due'].includes(x.kind))) assert.ok(!f.verb, `${f.kind} about ${f.about} offers no action`);
  } finally { game.deleteSave(id); }
});

test('non-interference: what Stark cannot know moves no fact, flag, word or war', () => {
  const s = world(); const w = war(s, { id: 'w_far', name: 'A war beyond the Trident', attackers: ['martell'], defenders: ['lannister'] }); tick(s); for (let i = 0; i < 3; i++) tick(s);
  const friends = K.friendsOf(s, 'stark'); const t = clone(s);
  for (const h of Object.values(t.houses)) { if (friends.has(h.id)) continue; for (const f of ['treasury', 'income', 'debt', 'levies', 'menAtArms', 'food']) h.figures[f].v = 987654321; }
  for (const x of t.wars) x.score = 90; for (const h of Object.values(t.holdings)) if (!friends.has(h.owner)) { h.status = 'besieged'; h.unrest = 99; }
  t.economy.loans.push({ id: 'zz', lender: 'lannister', debtor: 'tyrell', amount: 987654321, rate: 0.3, pays: 'coin', since: 0, due: 1 });
  for (const opts of [{}, { lens: 'economy' }, { scope: 'all' }, { scope: 'war' }, { window: 12 }]) assert.equal(json(view(t, opts)), json(view(s, opts)), `view ${json(opts)}`);
  void w;
});
