// The living world, the books and the cards (docs/BUG-HUNT-2026-10-02.md, WD3 the income figures, WD5 the same card again and again). Mock only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.WC_SAVES = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-world-'));
process.env.WC_PROVIDER = 'mock';
const { createInitialState, applyChanges } = await import('../public/js/shared/world.js');
const { settle, rateOf } = await import('../public/js/shared/economy.js');
const { withRng } = await import('../public/js/engine/rng.js');
const { supplyTick } = await import('../public/js/engine/military/supply.js');
const { RESTING } = await import('../public/js/engine/minds/options.js');
const { freshNotes, ledgerNote } = await import('../server/game.js');
const { dateOfDay, dayNumber } = await import('../public/js/engine/time.js');
const { emit } = await import('../public/js/engine/facts/log.js');
const { faceOf, realmContext, observe, estimateOf } = await import('../public/js/engine/realm/estimate.js');
const { knowledgeOf } = await import('../public/js/engine/knowledge.js');
const { clusterFacts } = await import('../public/js/engine/facts/cluster.js');
const { cardOf } = await import('../public/js/engine/facts/headline.js');
const { scoreCard } = await import('../server/ai/validate/headline.js');

const world = (house = 'stark', seed = 21) => createInitialState('agot_298', house, { seed });
const setDay = (s, d) => { s.meta.date = { ...s.meta.date, ...dateOfDay(d) }; };

test('WD3: the income the books show is what the coin did: a turn that ends on two days does not show a quarter of it', () => {
  // the rate: a full week stands alone, a stretch of two days is blended with what went before
  assert.equal(rateOf(3900, 2100, 7 / 30), 9000, 'a week: its net over its months');
  assert.equal(rateOf(undefined, 600, 2 / 30), 9000, 'with nothing before it, what it brought');
  const short = rateOf(9000, 600, 2 / 30); assert.ok(short > 8000 && short < 9100, `a two-day stretch of the same true rate keeps the figure where it was (${short}); the old rule said 2,400`);
  // and through the real books: a moon of segments of 7, 7, 7, 7 and 2 days
  const s = world(); const t0 = s.houses.stark.figures.treasury.v;
  withRng(s, () => { for (const d of [7, 7, 7, 7, 2]) settle(s, d); });
  const moon = s.houses.stark.figures.treasury.v - t0; const stated = s.houses.stark.figures.income.v;
  assert.ok(moon > 0 && stated > moon * 0.6 && stated < moon * 1.5, `the figure (${stated} a moon) is the coin's (${moon} in the moon): it was a quarter of it when the last stretch was short`);
});

test('WD3: a company, a tribe or an exile is claimed no income the engine never pays: the Golden Company is not "losing 39,866 a moon" on 60,000 and never losing it', () => {
  const s = world('stark', 5);
  for (const id of ['golden_company', 'dothraki', 'free_folk']) if (s.houses[id]) s.houses[id].figures.income = { v: -30000, asOf: 'x', src: 'x', confidence: 'rough' };
  const coin = Object.fromEntries(['golden_company', 'dothraki', 'free_folk'].map((id) => [id, s.houses[id].figures.treasury.v]));
  withRng(s, () => { for (let i = 0; i < 8; i++) settle(s, 7); });
  for (const id of Object.keys(coin)) { assert.equal(s.houses[id].figures.income.v, 0, `${id} claims no income`); assert.equal(s.houses[id].figures.treasury.v, coin[id], `${id}'s coin is untouched`); }
});

test('WD5: a lord who has raised his levies or called his banners waits before he does either again', () => {
  assert.ok(RESTING.call_banners >= 120, `banners: ${RESTING.call_banners} days (a campaign season is five moons)`);
  assert.ok(RESTING.raise_levies >= 45, `levies: ${RESTING.raise_levies} days`);
});

test('WD5: a camp that sits is told sick once a moon, with its moon\'s sick, not every week', () => {
  const s = world('stark', 5); const start = dayNumber(s.meta.date); s.meta.clock = { turn: 1, from: start, to: start + 100 };
  s.world = { ...(s.world || {}), season: 'autumn' };
  applyChanges(s, [{ op: 'army_create', id: 'camp_one', owner: 'stark', name: 'The Camp Host', at: 'stark', men: 6000, commander: 'robb_stark' }]);
  const camp = s.parties.camp_one; camp.campDays = 200; camp.state = 'camped';
  let told = 0;
  for (let d = 1; d <= 84; d++) {
    setDay(s, start + d); s.meta.clock = { turn: 1, from: start + d, to: start + d };
    camp.rations = 99999; camp.sick = camp.sick || 0;
    told += supplyTick(s, 1).events.filter((e) => /Fever in the camp/.test(e.title || '')).length;
  }
  assert.ok(told >= 1 && told <= 3, `twelve weeks of a sitting camp: ${told} fever cards (it was one a week)`);
});

test('WD5: the same steward\'s note is told once a moon, and a card says what the note says', () => {
  const s = world('stark', 5); setDay(s, 107600);
  const note = (text) => ({ house: 'karstark', text, important: true });
  const week = () => freshNotes(s, [note('Hunger stalks the lands of House Karstark. The granaries are nearly empty.'), note('The steward of House Karstark bought 1.8 moons of grain for 5,400 dragons.')]);
  assert.equal(week().length, 2, 'told the first week');
  for (let d = 7; d < 28; d += 7) { setDay(s, 107600 + d); assert.equal(week().length, 0, `silent on day ${d}: it is the same note`); }
  setDay(s, 107600 + 28); assert.equal(week().length, 2, 'told again after a moon');
  setDay(s, 107600 + 35); assert.equal(freshNotes(s, [note('Hunger stalks the lands of House Karstark. The granaries are nearly empty.'), { house: 'umber', text: 'Hunger stalks the lands of House Umber. The granaries are nearly empty.' }]).length, 1, 'another house\'s note is its own');
  assert.equal(freshNotes(s, [{ house: 'karstark', text: 'The steward of House Karstark bought 9.9 moons of grain for 1,000 dragons.' }]).length, 0, 'the same note with other figures is the same note');
  assert.deepEqual(['Hunger stalks the lands of House Karstark.', 'Famine in the lands of House Karstark: the old die first.', 'The steward of House Karstark bought 2.5 moons of grain for 9,000 dragons.', 'House Karstark withholds its dues from House Stark.', 'Rookery is complete.', 'Winterfell: a bumper harvest.'].map(ledgerNote), ['hunger', 'famine', 'grain', 'dues', 'works', null]);
  for (const [note2, re] of [['hunger', /goes hungry/], ['famine', /faces famine/], ['grain', /buys grain/], ['dues', /withholds its dues/], ['works', /finishes its works/]]) {
    const t = world('stark', 5); setDay(t, 107700); t.meta.clock = { turn: 1, from: 107700, to: 107700 };
    emit(t, 'ledger', { houses: ['stark'], place: 'stark', importance: 3, data: { note: note2 }, text: 'x' });
    const st = clusterFacts(t, t.facts).stories[0]; const card = cardOf(t, st);
    assert.match(card.headline, re, `${note2}: ${card.headline}`);
    const r = scoreCard({ headline: card.headline, summary: card.summary }, st, t); assert.ok(r.pass, `${note2}: "${card.headline}" / "${card.summary}": ${JSON.stringify(r.detail)}`);
  }
  const plain = world('stark', 5); plain.meta.clock = { turn: 1, from: 107700, to: 107700 }; setDay(plain, 107700);
  emit(plain, 'ledger', { houses: ['stark'], importance: 1, text: 'x' });
  assert.match(cardOf(plain, clusterFacts(plain, plain.facts).stories[0] || { facts: plain.facts, actors: [], houses: ['stark'], place: null, days: [1, 1], importance: 1 }).headline, /inspects its accounts/, 'a note that says nothing in particular is still the steward at his books');
});

test('N-007: a census a spy taught stands only as far as the lands it counted: a house that lost every hold is not "seen" with 150,000 people', () => {
  const s = world('tyrell', 23); const subject = 'brax';
  const truth = Object.values(s.holdings).filter((h) => h.owner === subject).reduce((n, h) => n + (h.population || 0), 0);
  assert.ok(truth > 0);
  const told = (people) => faceOf(s, 'tyrell', subject, realmContext(s, 'tyrell'), { turn: 5, via: 'seen', people }).people;
  assert.ok(Math.abs(told(truth) - truth) <= truth * 0.05, 'while the lands are the lands it counted, the census stands');
  assert.ok(told(truth * 40) <= truth * 1.15, 'it is not larger than the lands now hold (a census of 150,000 over lands of a few thousand)');
  for (const h of Object.values(s.holdings)) if (h.owner === subject) h.owner = 'lannister';
  assert.equal(told(150000), 0, 'a house with no hold has no people the viewer can see');
});

test('N-015: word of a host a few moons old is noted with its own age, not as this week\'s news: Blackwood is not "at least 2,600" afresh for a moon after its host joined its liege\'s', () => {
  const s = world('tyrell', 23); const k = knowledgeOf(s, 'tyrell'); s.meta.turn = 9;
  k.parties.host_of_house_gone = { owner: 'brax', men: 2600, turn: 7 }; // heard of two moons ago; the host has since joined another's
  const swords = () => (knowledgeOf(s, 'tyrell').realm?.brax?.obs || []).filter((o) => o.v.swords != null);
  const age = () => estimateOf(s, 'tyrell', 'brax').cells.swords.age;
  observe(s, 'tyrell');
  assert.equal(swords().length, 1, 'the word is kept');
  assert.equal(age(), 2, 'and the ledger shows it two moons old');
  k.parties.host_b = { owner: 'brax', men: 3000, turn: 9 }; // a fuller, fresh word
  observe(s, 'tyrell');
  assert.equal(age(), 0, 'fresh word is this week\'s');
});
