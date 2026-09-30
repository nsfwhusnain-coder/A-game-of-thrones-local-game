// What matters to the player, in order (docs/gdd/18-headlines.md §2.5; WP N9): the score that ranks a turn's stories, the tiers
// it makes, the fatigue of one kind of news, the first of its kind, and the digest built from the cards by the engine (no model).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.WC_PROVIDER = 'mock';
const { createInitialState } = await import('../public/js/shared/world.js');
const { emit } = await import('../public/js/engine/facts/log.js');
const { dayNumber } = await import('../public/js/engine/time.js');
const { clusterFacts } = await import('../public/js/engine/facts/cluster.js');
const { cardOf, meanwhileOf } = await import('../public/js/engine/facts/headline.js');
const { rankStories, byScore, tierOf, noteFirsts, firstKey, kinOf, TIERS } = await import('../public/js/engine/facts/rank.js');
const { digestOf, shapeCard, firstSentence, DIGEST_WORDS } = await import('../public/js/engine/facts/digest.js');
const { BOILERPLATE, JARGON } = await import('../public/data/style.js');

const here = path.dirname(fileURLToPath(import.meta.url));
const week = (s) => { const d0 = dayNumber(s.meta.date); s.meta.clock = { turn: s.meta.turn + 1, from: d0 + 1, to: d0 + 7 }; return s; };
const world = (house = 'stark') => week(createInitialState('agot_298', house, { seed: 298 }));
const rank = (s, facts, opts) => rankStories(s, clusterFacts(s, facts).stories, opts);

test('the tiers: great from 6.5, major from 5, news from 3.5, minor from 2, meanwhile below', () => {
  assert.deepEqual([9, 6.5, 6.4, 5, 4.9, 3.5, 3.4, 2, 1.9, 0, -1].map(tierOf), ['great', 'great', 'major', 'major', 'news', 'news', 'minor', 'minor', 'meanwhile', 'meanwhile', 'meanwhile']);
  assert.deepEqual(TIERS, ['meanwhile', 'minor', 'news', 'major', 'great']);
});

test('the score: importance, plus one for the house, half for its ground, one for a first, half for a standing thing', () => {
  const s = world();
  // a tourney at a far castle: nothing of the house's in it
  const far = emit(s, 'tourney_result', { actors: ['mace_tyrell'], houses: ['tyrell'], place: 'tyrell', on: 2, importance: 3 });
  const [a] = rank(s, [far], { firsts: { tourney_result: 1 } });
  assert.deepEqual(a.why, { mine: 0, here: 0, first: 0, standing: 0, fatigue: 0 }); assert.equal(a.score, 3); assert.equal(a.tier, 'minor');
  // the same, but the first of its kind this chronicle
  const [b] = rank(s, [far], { firsts: {} });
  assert.equal(b.why.first, 1); assert.equal(b.score, 4); assert.equal(b.tier, 'news');
  // the house's own: Eddard calls the banners at Winterfell (mine, at its seat)
  const call = emit(s, 'levies_called', { actors: ['eddard_stark'], houses: ['stark'], place: 'stark', on: 1, importance: 4 });
  const [c] = rank(s, [call], { firsts: { levies_called: 1 } });
  assert.deepEqual([c.why.mine, c.why.here], [1, 0.5]); assert.equal(c.score, 5.5); assert.equal(c.tier, 'major');
  // a holding that changes hands is a standing thing
  const fell = emit(s, 'holding_fell', { actors: ['tywin_lannister'], houses: ['lannister', 'tully'], place: 'tully', on: 3, importance: 4, data: { holding: 'tully', by: 'lannister' } });
  const [d] = rank(s, [fell], { firsts: { holding_fell: 1 } });
  assert.equal(d.why.standing, 0.5); assert.equal(d.score, 4.5);
});

test('kin: the lord, his wife, his children and their parents are the house\'s own; a stranger is not', () => {
  const s = world(); const kin = kinOf(s);
  for (const id of ['eddard_stark', 'catelyn_stark', 'robb_stark', 'jon_snow', 'rickard_stark']) if (s.characters[id]) assert.ok(kin.has(id), id);
  assert.ok(!kin.has('tywin_lannister'));
  // a fact whose only actor is the lord's wife (of another house by birth) is the house's
  const f = emit(s, 'wedding', { actors: ['catelyn_stark'], houses: [], place: 'tully', on: 2, importance: 3 });
  assert.equal(rank(s, [f], { firsts: { wedding: 1 } })[0].why.mine, 1);
});

test('fatigue: of one archetype the heaviest two are told at full weight, each after them loses a point more', () => {
  const s = world();
  const feasts = ['tyrell', 'lannister', 'tully', 'arryn', 'greyjoy'].map((h, k) => emit(s, 'feast', { actors: [], houses: [h], place: h, on: 1 + k, importance: 3 }));
  const rows = rank(s, feasts, { firsts: { feast: 1 } });
  assert.deepEqual(rows.map((r) => r.why.fatigue).sort((a, b) => a - b), [-3, -2, -1, 0, 0]);
  assert.deepEqual(rows.map((r) => r.score).sort((a, b) => b - a), [3, 3, 2, 1, 0]);
  // a different archetype is not tired by them
  const battle = emit(s, 'battle', { actors: [], houses: ['lannister', 'tully'], place: 'tully', on: 3, importance: 3, data: { winnerHouse: 'lannister', loserHouse: 'tully' } });
  const all = rank(s, [...feasts, battle], { firsts: { feast: 1, battle: 1 } });
  assert.equal(all.find((r) => r.archetype === 'battle').why.fatigue, 0);
});

test('a first of its kind is remembered: noteFirsts adds the news of a turn, and the next battle is no longer the first', () => {
  const s = world();
  const b = emit(s, 'battle', { actors: [], houses: ['lannister', 'tully'], place: 'tully', on: 2, importance: 4, data: { winnerHouse: 'lannister', loserHouse: 'tully' } });
  const rows = rank(s, [b], { firsts: {} });
  assert.equal(rows[0].why.first, 1); assert.equal(rows[0].key, 'battle');
  const firsts = noteFirsts(s, rows, {});
  assert.deepEqual(Object.keys(firsts), ['battle']);
  assert.equal(rank(s, [b], { firsts })[0].why.first, 0);
  // no firsts for small things: a second feast is no milestone, and a minor thing is not noted
  const small = emit(s, 'feast', { actors: [], houses: ['tyrell'], place: 'tyrell', on: 3, importance: 2 });
  assert.equal(firstKey(s, clusterFacts(s, [small]).stories[0]), null);
  // a raven is the first from that house
  const raven = emit(s, 'letter_arrived', { actors: ['lysa_arryn'], houses: ['arryn', 'stark'], place: 'stark', on: 4, importance: 3 });
  assert.equal(firstKey(s, clusterFacts(s, [raven]).stories[0]), 'letter_arrived:arryn');
});

test('ranking is a function of the stories and the memory: the same in any order, and it never draws dice or reads the clock', () => {
  const s = world();
  const fs_ = [emit(s, 'levies_called', { actors: ['eddard_stark'], houses: ['stark'], place: 'stark', on: 1, importance: 4 }), emit(s, 'feast', { actors: [], houses: ['tyrell'], place: 'tyrell', on: 2, importance: 3 }), emit(s, 'battle', { actors: [], houses: ['lannister', 'tully'], place: 'tully', on: 3, importance: 4, data: { winnerHouse: 'lannister', loserHouse: 'tully' } })];
  const dice = JSON.stringify(s.meta.rngState);
  const once = byScore(rank(s, fs_)).map((r) => [r.story.lead, r.score]);
  const rev = byScore(rank(s, [...fs_].reverse())).map((r) => [r.story.lead, r.score]);
  assert.deepEqual(once, rev); assert.equal(JSON.stringify(s.meta.rngState), dice, 'no dice were drawn');
});

// ── The six recorded turns: the human's pick is the machine's ───────────────────────────────────────────────────────
const SET = JSON.parse(fs.readFileSync(path.join(here, 'fixtures', 'headlines', 'turns', 'stark-muster-6.json'), 'utf8'));
const stateWith = (turn, firsts) => { const s = createInitialState('agot_298', 'stark', { seed: 7 }); for (const [k, p] of Object.entries(turn.parties)) s.parties[k] = { ...p }; s.meta.clock = turn.clock; s.meta.turn = turn.turn - 1; s.firsts = firsts; return s; };

test('the six turns of the audit: the muster leads turn 1, a tourney or feast leads turns 3 to 5, and the small change never leads', () => {
  let firsts = {}; const top = [];
  for (const t of SET.turns) {
    const s = stateWith(t, firsts); const { stories } = clusterFacts(s, [...t.facts]);
    const rows = rankStories(s, stories); const best = byScore(rows)[0];
    top.push(best ? { turn: t.turn, arch: best.archetype, tier: best.tier, headline: cardOf(s, best.story).headline, score: best.score } : null);
    for (const r of rows) assert.ok(!(r.tier === 'meanwhile' && r.story.importance >= 4), `turn ${t.turn}: news of weight 4 is never the Meanwhile (${cardOf(s, r.story).headline})`);
    firsts = noteFirsts(s, rows, firsts);
  }
  assert.equal(top[0].arch, 'muster', 'turn 1: the muster'); assert.equal(top[0].tier, 'great');
  assert.equal(top[2].arch, 'feast', 'turn 3: the King\'s tourney'); assert.equal(top[3].arch, 'feast', 'turn 4'); assert.equal(top[4].arch, 'feast', 'turn 5: the Dreadfort tourney');
  assert.match(top[4].headline, /Dreadfort/);
  assert.ok(top.every((x) => x && TIERS.indexOf(x.tier) >= TIERS.indexOf('news')), 'every turn has a card of news or better to lead it');
});

// ── The digest ──────────────────────────────────────────────────────────────────────────────────────────────────────
const words = (t) => String(t).trim().split(/\s+/).filter(Boolean).length;
const BP = [...BOILERPLATE, ...JARGON].map((p) => new RegExp(p, 'i'));

test('the digest: the top three as a headline and a sentence, five more as headlines, the Meanwhile — at most 90 words, all whole', () => {
  let firsts = {}; const seen = [];
  for (const t of SET.turns) {
    const s = stateWith(t, firsts); const { stories, meanwhile } = clusterFacts(s, [...t.facts]);
    const rows = rankStories(s, stories); firsts = noteFirsts(s, rows, firsts);
    const cards = rows.map((r) => ({ ...shapeCard({ ...cardOf(s, r.story), importance: r.story.importance, score: r.score, tier: r.tier, day: r.story.days[0] }) }));
    const d = digestOf(cards, meanwhileOf(s, [...meanwhile, ...t.small.map((f) => ({ ...f }))]));
    seen.push(d);
    assert.ok(d.words <= DIGEST_WORDS && words(d.text) <= DIGEST_WORDS, `turn ${t.turn}: ${words(d.text)} words`);
    assert.ok(d.top.length <= 3 && d.also.length <= 5, `turn ${t.turn}`); assert.equal(d.words, words(d.text));
    assert.ok(!/…|\.\.\./.test(d.text), 'nothing is cut with an ellipsis'); assert.ok(/\.$/.test(d.text), 'it ends on a full stop');
    assert.ok(!BP.some((re) => re.test(d.text)), `turn ${t.turn}: no ledger phrase — ${d.text}`);
    if (cards.length) assert.deepEqual(d.top.map((x) => x.headline), [...cards].sort((a, b) => b.score - a.score).slice(0, d.top.length).map((c) => c.headline), 'the best first');
  }
  assert.ok(seen[0].top.length === 3 && seen[0].also.length >= 1 && seen[0].meanwhile === '' || seen[0].meanwhile, 'a busy turn fills the top and the Also');
  // no cut sentence: a long summary is never clipped to fit; it is left out
  const long = { headline: 'A very long day at Winterfell for everyone', summary: `${'The lords and ladies of the great houses of the North gathered in the yard and waited for word from the King. '.repeat(5)}`, score: 7 };
  const d = digestOf([long, long, long], 'Rumour runs at Winterfell.');
  assert.ok(d.words <= DIGEST_WORDS && !d.text.includes('…'));
  assert.equal(firstSentence('It fell. It rose again.'), 'It fell.'); assert.equal(firstSentence('No full stop here'), 'No full stop here');
  assert.deepEqual(digestOf([], ''), { top: [], also: [], meanwhile: '', words: 0, text: '' });
});

test('shapeCard: every card in the one shape, whatever it was made as; the old names stay as aliases and nothing is changed in place', () => {
  const old = { title: 'Lord Umber marches', text: 'The Greatjon takes the road.', details: 'He leaves with two thousand men.', importance: 3, mine: true };
  const frozen = JSON.stringify(old);
  const c = shapeCard(old);
  assert.deepEqual([c.headline, c.summary, c.details, c.tier, c.title, c.text, c.told], ['Lord Umber marches', 'The Greatjon takes the road.', ['He leaves with two thousand men.'], 'news', 'Lord Umber marches', 'The Greatjon takes the road.', 'engine']);
  assert.equal(c.score, 4); assert.equal(JSON.stringify(old), frozen);
  const w = shapeCard({ headline: 'H', summary: 'S.', details: ['a', 'b'], tier: 'great', score: 8, told: 'model' });
  assert.deepEqual([w.details, w.tier, w.score, w.told, w.title], [['a', 'b'], 'great', 8, 'model', 'H']);
  assert.equal(shapeCard({ title: 'x', text: 'y', bg: true, importance: 1 }).tier, 'meanwhile');
  assert.deepEqual(shapeCard({ title: 'x', text: 'y' }).details, []);
});
