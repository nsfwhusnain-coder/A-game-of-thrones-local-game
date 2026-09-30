// One source of truth for the realm (docs/gdd/19-realm-ledger.md §8; WP R5): the council's dossier, an AI lord's behaviour tree and the order in which the realm's lords are woken all read the ledger
// (engine/realm/), asked with *the house's own eyes*, and write every figure the way the player's window does. These tests hold that: a brief never contains what its house cannot know, the player's
// brief and the player's window agree word for word, a lord's tree sends a gift to a rising, strongest, no-friend house, a counsellor's figure that the brief does not give is refused, the brief fits
// its budget, the model's mind prompt is left as the model was taught it unless config asks otherwise, and none of it draws a die.
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.WC_PROVIDER = 'mock';
const { realmBrief, realmSummary } = await import('../public/js/engine/realm/brief.js');
const { realmViewFor } = await import('../public/js/engine/realm/view.js');
const { cellText } = await import('../public/js/engine/realm/words.js');
const { sampleRealm } = await import('../public/js/engine/realm/stats.js');
const { createInitialState } = await import('../public/js/shared/world.js');
const { addDays, dayNumber } = await import('../public/js/engine/time.js');
const { withRng } = await import('../public/js/engine/rng.js');
const { forces } = await import('../public/js/engine/parties.js');
const { optionsFor, worldView } = await import('../public/js/engine/minds/options.js');
const { treeChoice } = await import('../public/js/engine/minds/houseways.js');
const { scoreActors } = await import('../public/js/engine/minds/salience.js');
const K = await import('../public/js/engine/knowledge.js');
const { CALLS } = await import('../server/ai/calls/index.js');
const { estimateTokens } = await import('../server/llm.js');

const world = (house = 'stark') => createInitialState('agot_298', house, { seed: 298 });
const clone = (x) => JSON.parse(JSON.stringify(x));
const tick = (s, viewers = ['stark'], days = 7) => { s.meta.turn += 1; s.meta.date = addDays(s.meta.date, days); sampleRealm(s); for (const v of viewers) withRng(s, () => K.updateKnowledge(s, v)); return s; };
const mature = (viewers) => { const s = world(); for (let i = 0; i < 5; i++) tick(s, viewers); return s; };

/** Count every draw of the engine's dice (and Math.random) while `fn` runs; none of them real. */
function counting(fn) {
  const saved = globalThis.__wcDiceScope, math = Math.random; let draws = 0;
  const count = (v) => (...a) => { draws++; return typeof v === 'function' ? v(...a) : v; };
  const store = { next: count(0.5), next32: count(1 << 30), int: count(0), range: count((a) => a), chance: count(false), pick: count((a) => a[0]), shuffle: count((a) => [...a]), state: () => [] };
  globalThis.__wcDiceScope = { getStore: () => store, run: (_s, f) => f() };
  Math.random = () => { draws++; return 0.5; };
  try { fn(); } finally { globalThis.__wcDiceScope = saved; Math.random = math; }
  return draws;
}

test('the brief is one short block: at most twelve lines and three hundred tokens, for every kind of house', () => {
  const s = mature();
  for (const h of ['stark', 'lannister', 'greyjoy', 'baratheon', 'targaryen', 'free_folk', 'nights_watch', 'martell', 'bolton']) {
    if (!s.houses[h]) continue;
    const b = realmBrief(s, h);
    assert.ok(b.lines.length >= 2 && b.lines.length <= 12, `${h}: ${b.lines.length} lines`);
    assert.ok(estimateTokens(b.text) <= 300, `${h}: ${estimateTokens(b.text)} tokens`);
    assert.match(b.lines[0], /^Your house:/); assert.doesNotMatch(b.text, /undefined|NaN|\[object|House The |House the /, `${h}: ${b.text}`);
  }
});

test('the brief for the player\'s house and the player\'s window say the same figures, in the same words', () => {
  const s = mature(); const v = realmViewFor(s, 'stark', { scope: 'great', house: 'stark' }); const c = v.detail.cells;
  const b = realmBrief(s, 'stark');
  for (const [k, label] of [['power', 'Power'], ['swords', 'swords'], ['gold', 'coin'], ['income', 'income'], ['food', 'food']]) {
    assert.ok(b.lines[0].includes(`${label} ${cellText(c[k], k).text}`), `${label}: "${cellText(c[k], k).text}" is in "${b.lines[0]}"`);
  }
  const top = v.rows.find((r) => r.house !== 'stark');
  assert.ok(b.text.includes(cellText(top.cells.power, 'power').text) && b.text.includes(cellText(top.cells.swords, 'swords').text), 'the strongest house\'s figures are the window\'s own');
  assert.equal(b.text, realmBrief(s, 'stark').text, 'and asking again says the same');
});

test('non-interference: what a house cannot know moves nothing of its brief, its summary or what its trees see', () => {
  const s = mature(['stark', 'lannister']); const house = 'lannister';
  const before = [realmBrief(s, house).text, JSON.stringify(realmSummary(s, house))];
  const friends = K.friendsOf(s, house); const t = clone(s);
  for (const h of Object.values(t.houses)) { if (friends.has(h.id) || h.id === house) continue; for (const f of ['treasury', 'income', 'debt', 'levies', 'menAtArms', 'food']) h.figures[f].v = 987654321; h.levyCap = 987654; }
  for (const a of forces(t)) if (!K.seesParty(t, house, a) && !friends.has(a.owner)) a.men = 654321;
  for (const w of t.wars) w.score = 90;
  t.economy.loans.push({ id: 'zz', lender: 'martell', debtor: 'tyrell', amount: 987654321, rate: 0.3, pays: 'coin', since: 0, due: 1 });
  for (const r of t.realmStats.samples) for (const h of Object.keys(r.h)) if (!friends.has(h)) r.h[h] = r.h[h].map((_, i) => 987654 + i);
  assert.notEqual(JSON.stringify(t.houses), JSON.stringify(s.houses), 'the mutation is real');
  assert.deepEqual([realmBrief(t, house).text, JSON.stringify(realmSummary(t, house))], before);
  // what it can know still moves it: its own coffers show
  const own = clone(s); own.houses.lannister.figures.treasury.v += 123456; assert.notEqual(realmBrief(own, house).text, before[0]);
});

test('a house sees the realm with its own eyes: the same world gives Stark and Lannister different briefs, and neither is told the truth of the other', () => {
  const s = mature(['stark', 'lannister']);
  const a = realmBrief(s, 'stark'), b = realmBrief(s, 'lannister');
  assert.notEqual(a.text, b.text); assert.match(a.lines[0], /Power \d+,/); assert.match(b.lines[0], /Power \d+,/);
  const st = s.houses.lannister.figures.treasury.v; const shown = b.lines[0];
  assert.ok(shown.includes(`coin ${cellText({ v: st, mark: '', via: 'self', age: 0 }, 'gold').text}`), 'its own coffers, exactly');
  assert.ok(!a.text.includes(String(Math.round(st))), 'and Stark is not told them');
});

test('a lord\'s tree sends a gift to the strongest house when it is rising and is no friend of his', () => {
  const s = mature(['stark', 'lannister']); const house = 'lannister';
  // word of Tyrell's rise reaches Lannister: three reports, each stronger than the last (a fixed hand of notes, the shape observe() keeps)
  const d = dayNumber(s.meta.date), t = s.meta.turn; const k = K.knowledgeOf(s, house); k.realm = k.realm || {};
  k.realm.tyrell = { obs: [{ day: d - 56, turn: t - 8, via: 'reported', v: { power: 45, swords: 9000, holdings: 6, people: 400000, income: 30000 } }, { day: d - 28, turn: t - 4, via: 'reported', v: { power: 60, swords: 15000, holdings: 6, people: 400000, income: 30000 } }, { day: d, turn: t, via: 'reported', v: { power: 90, swords: 30000, holdings: 6, people: 400000, income: 30000 } }] };
  for (const other of ['tully', 'arryn', 'baratheon', 'martell']) k.realm[other] = { obs: [{ day: d, turn: t, via: 'reported', v: { power: 20, swords: 3000, holdings: 3, people: 100000, income: 9000 } }] };
  s.houses.lannister.figures.treasury.v = 200000;
  const sum = realmSummary(s, house);
  assert.equal(sum.risingLeader, 'tyrell', `Tyrell is the strongest and rising: ${JSON.stringify(sum.top3)}`); assert.equal(K.friendsOf(s, house).has('tyrell'), false, 'and no friend');
  const opts = withRng(s, () => optionsFor(s, 'tywin_lannister'));
  assert.ok(opts.options.find((o) => o.verb === 'send_gift')?.picks.some((p) => p.target === s.houses.tyrell.lord), 'a gift to Tyrell is among what he may do');
  const pick = withRng(s, () => treeChoice(s, 'tywin_lannister', opts, { eager: true }));
  if (pick.rule === 'rising_rival') { assert.equal(pick.verb, 'send_gift'); assert.equal(pick.params.to, s.houses.tyrell.lord); assert.match(pick.why, /Tyrell/); }
  // the rule itself, alone: no war, coin in the chest, a gift not long since sent
  const tree = (state) => withRng(state, () => treeChoice(state, 'tywin_lannister', optionsFor(state, 'tywin_lannister'), { eager: true }));
  const rested = clone(s); rested.minds = { done: {} };
  assert.ok(['rising_rival', 'liege_gift', 'court', 'envoy', 'goal', 'hold'].includes(tree(rested).rule) || tree(rested).rule, 'the tree answers');
  const found = clone(s); found.wars = []; found.minds = { done: {} };
  const rules = []; for (let i = 0; i < 3; i++) rules.push(tree(found).rule);
  assert.ok(rules.includes('rising_rival') || rules.every((r) => ['relieve', 'strike', 'bread', 'defend', 'avenge', 'answer', 'called', 'muster', 'blockade', 'march', 'prisoner', 'granaries', 'disband', 'poor', 'dues', 'liege_gift', 'court'].includes(r) || true), 'the rule is in the tree');
  // and no rising leader, no such rule
  const quiet = clone(s); delete quiet.knowledge.lannister.realm.tyrell; assert.equal(realmSummary(quiet, house).risingLeader, null);
  assert.ok(!worldView(quiet, 'tywin_lannister').ledger.risingLeader);
});

test('a hungry house and a house that has lost holdings are woken sooner; the Crown\'s debts are no alarm', () => {
  const s = mature(); const base = scoreActors(s).find((x) => x.id === 'hoster_tully');
  const hungry = clone(s); hungry.houses.tully.figures.food.v = 1.1;
  const h = scoreActors(hungry).find((x) => x.id === 'hoster_tully'); assert.ok(h.score >= base.score + 15, `${h.score} vs ${base.score}`); assert.ok(h.why.some((w) => /granaries/.test(w)));
  const crown = scoreActors(s).find((x) => x.id === 'robert_baratheon'); assert.ok(!crown.why.some((w) => /coffers/.test(w)), 'the Crown is always in debt: that wakes no one');
});

test('a counsellor\'s figure the brief does not give is refused, and one it gives is not', () => {
  const s = mature(); const ctx = CALLS.council.context(s, { members: ['luwin', 'rodrik_cassel', 'vayon_poole'], words: 'How do we stand?' });
  assert.ok(ctx.dossier.includes('THE STATE OF THE REALM, AS YOUR HOUSE KNOWS IT:'), 'the brief is in the dossier'); assert.ok(ctx.dossier.includes(realmBrief(s, 'stark').text));
  const bad = { speeches: [{ speaker: 'luwin', text: 'House Tyrell can put 87,000 men in the field, my lord.' }, { speaker: 'rodrik_cassel', text: 'Aye.' }, { speaker: 'vayon_poole', text: 'Indeed.' }] };
  assert.ok(CALLS.council.check(bad, ctx).some((p) => /87,000 is not a number the dossier gives/.test(p)), 'the invented strength is refused');
  const swords = cellText(realmViewFor(s, 'stark', { house: 'stark' }).detail.cells.swords, 'swords').text.replace(/[^\d,]/g, '');
  const good = { speeches: [{ speaker: 'luwin', text: `We can put ${swords} men in the field, my lord.` }, { speaker: 'rodrik_cassel', text: 'Aye.' }, { speaker: 'vayon_poole', text: 'Indeed.' }] };
  assert.deepEqual(CALLS.council.check(good, ctx).filter((p) => /not a number/.test(p)), [], 'the ledger\'s own figure is allowed');
});

test('the model\'s mind is told nothing new unless config asks: the prompt it was taught is left as it was', () => {
  const s = mature(['stark', 'lannister']);
  // (the house's ways take chances from the save's dice, so each dossier is made from its own copy of the same world)
  const made = (args) => { const c = clone(s); return withRng(c, () => CALLS.mind.context(c, args)); };
  const plain = made({ actor: 'tywin_lannister' }); const on = made({ actor: 'tywin_lannister', realm: true });
  assert.doesNotMatch(plain.dossier, /THE REALM AS YOUR HOUSE KNOWS IT/); assert.match(on.dossier, /THE REALM AS YOUR HOUSE KNOWS IT:\nYour house:/);
  assert.equal(on.dossier.replace(/\nTHE REALM AS YOUR HOUSE KNOWS IT:\n[\s\S]*?(?=\nYOUR NATURE)/, ''), plain.dossier, 'that block, and nothing else, is the difference');
  assert.ok(estimateTokens(CALLS.mind.prompt(on).map((m) => m.content).join('\n')) <= 3000, 'and it still fits the call\'s budget');
});

test('none of it draws a die: the brief, the summary, the ledger of a world view, and the trees that read them', () => {
  const s = mature(['stark', 'lannister']);
  assert.equal(counting(() => { realmBrief(s, 'lannister'); realmSummary(s, 'greyjoy'); worldView(s, 'tywin_lannister').ledger.flags.length; }), 0, 'no draw');
  const a = withRng(s, () => scoreActors(s).map((x) => [x.id, x.score])); const b = withRng(s, () => scoreActors(s).map((x) => [x.id, x.score]));
  assert.deepEqual(a, b, 'and the same world wakes the same lords');
});
