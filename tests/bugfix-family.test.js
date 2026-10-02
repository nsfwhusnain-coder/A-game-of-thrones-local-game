// The slow life of the houses (docs/BUG-HUNT-2026-10-02.md, WD1 births and marriages, WD2 old age, WD6 the starting data): children are born, the unwed are matched and wed,
// and the old die at the rate of old people. Mock only; the engine's own day loop is not needed: `familyTick` is called a day at a time on a world, exactly as server/turn/day.js
// calls it.
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.WC_PROVIDER = 'mock';
const { createInitialState } = await import('../public/js/shared/world.js');
const { familyTick, fate, FAMILY, nameFor, suitability, betroth, TIER } = await import('../public/js/engine/people/family.js');
const { ageRisk } = await import('../public/js/engine/people/life.js');
const { dateOfDay } = await import('../public/js/engine/time.js');
const { dayNumber } = await import('../public/js/engine/time.js');
const { validate } = await import('../public/js/engine/state/validate.js');
const { CANON_DEATHS, CANON_PROTECTED } = await import('../public/data/fates.js');
const { clusterFacts } = await import('../public/js/engine/facts/cluster.js');
const { cardOf } = await import('../public/js/engine/facts/headline.js');
const { scoreCard } = await import('../server/ai/validate/headline.js');
const { playerView } = await import('../server/view.js');
const { setLoc } = await import('../public/js/engine/parties.js');
const { settleWorld } = await import('../public/js/engine/state/settle.js');
const { GIVEN } = await import('../public/data/names.js');
const { isFemale } = await import('../public/js/shared/people.js');
const { perform } = await import('../public/js/engine/actions/registry.js');
const { parseOrder } = await import('../server/orders/parse.js');
const { applyChanges, getRelation } = await import('../public/js/shared/world.js');
const { withRng } = await import('../public/js/engine/rng.js');

const world = (house = 'stark', seed = 7) => createInitialState('agot_298', house, { seed });
const setDay = (s, d) => { s.meta.date = { ...s.meta.date, ...dateOfDay(d) }; };
/** Days of the realm, one at a time, as the day loop runs them; the cards of each. */
function live(s, days, spared = new Set()) {
  const cards = []; const start = dayNumber(s.meta.date);
  for (let d = 1; d <= days; d++) { setDay(s, start + d); s.meta.clock = { turn: 1, from: start + d, to: start + d }; cards.push(...familyTick(s, { spared }).events); }
  return cards;
}
const nextSunday = (s) => { let d = dayNumber(s.meta.date); while (d % 7 !== 0) d++; return d; };

test('the family\'s dice are a hash of the seed and the asking: the same, and nothing of the save\'s own stream', () => {
  const s = world(); const t = world('stark', 8);
  assert.equal(fate(s, 'a', 1), fate(s, 'a', 1), 'asked twice, the same');
  assert.notEqual(fate(s, 'a', 1), fate(s, 'a', 2)); assert.notEqual(fate(s, 'a', 1), fate(t, 'a', 1), 'another seed, another fate');
  for (let i = 0; i < 500; i++) { const x = fate(s, 'x', i); assert.ok(x >= 0 && x < 1); }
  const dice = JSON.stringify(s.meta.rngState); live(s, 120);
  assert.equal(JSON.stringify(s.meta.rngState), dice, 'a year of families draws nothing from the save\'s stream: every other roll stays where it was');
});

test('WD1: a woman who is due, at a hall, is brought to bed: a child of the father\'s house, named of his own people, and told as news', () => {
  const s = world('stark', 11); const w = s.characters.lyessa_bolton, m = s.characters.roose_bolton;
  assert.ok(w && m && w.spouse === m.id, 'the Boltons are wed');
  const day = nextSunday(s) + 7; setDay(s, day - 1); s.meta.clock = { turn: 1, from: day - 1, to: day - 1 };
  w.expecting = { by: m.id, since: day - 270, due: day };
  const before = Object.keys(s.characters).length;
  const cards = live(s, 1);
  const child = Object.values(s.characters).find((c) => c.mother === w.id && c.generated);
  assert.ok(child || s.facts.some((f) => f.kind === 'happening'), 'a child, or (one in sixteen) a child born dead');
  if (child) {
    assert.equal(Object.keys(s.characters).length, before + 1);
    assert.equal(child.father, m.id); assert.equal(child.house, 'bolton'); assert.equal(child.age, 0); assert.ok(child.alive && child.status === 'free');
    assert.equal(child.loc, w.loc, 'born where his mother is'); assert.match(child.name, /^[A-Z][a-z]+ Bolton$/);
    assert.ok(['m', 'f'].includes(child.sex)); assert.equal(child.born, s.meta.date.year); assert.equal(child.bornDay, day);
    const f = s.facts.find((x) => x.kind === 'birth'); assert.ok(f, 'a birth fact'); assert.deepEqual(f.actors, [child.id, w.id, m.id]); assert.ok(f.importance >= 2);
    assert.ok(cards.some((c) => c.fact === f.id), 'and a card');
  }
  assert.ok(!w.expecting && w.lastBirth === day, 'she is delivered, and not at once with child again');
});

test('WD1: a child is named by his own people; no living member of the house has his name; the cast of the story is avoided where the pool allows', () => {
  const s = world(); const first = (c) => c.name.split(' ')[0].toLowerCase();
  const cast = new Set(Object.values(s.characters).map(first));
  for (const [house, sex] of [['stark', 'm'], ['stark', 'f'], ['lannister', 'm'], ['tyrell', 'f'], ['martell', 'm'], ['greyjoy', 'f'], ['tully', 'm']]) {
    const home = new Set(Object.values(s.characters).filter((c) => c.alive && c.house === house).map(first));
    for (let i = 0; i < 25; i++) { const n = nameFor(s, house, sex, `t${i}`); assert.ok(n && /^[A-Z][a-z]+$/.test(n), `${house} ${sex}: "${n}"`); assert.ok(!home.has(n.toLowerCase()), `${house}: ${n} is borne by a living member of the house`); }
  }
  const names = new Set(); for (let i = 0; i < 40; i++) names.add(nameFor(s, 'tully', 'm', `n${i}`));
  assert.ok(names.size >= 4, 'not one name for every boy of a house');
  const north = new Set(); for (let i = 0; i < 40; i++) north.add(nameFor(s, 'umber', 'f', `n${i}`));
  const uncast = GIVEN.north.f.filter((n) => !cast.has(n.toLowerCase()));
  assert.ok(uncast.length >= 5, 'the northern women\'s names the story has not used');
  assert.ok([...north].every((n) => uncast.includes(n)), 'where the pool has names the story has not used, those are the ones');
});

test('WD1: a year of the realm: births in the right numbers, to the right mothers, none the story forbids; no one under sixteen betrothed; the house of the player left alone', () => {
  const s = world('stark', 5);
  // the story's own, on the day of the birth: the children it carries, and those whose end is still to come
  const keptAt = (id, day) => { const d = dateOfDay(day); const w = CANON_DEATHS[id]; return CANON_PROTECTED.includes(id) || (!!w && d.year * 12 + d.month - 1 <= w.to[0] * 12 + w.to[1] - 1); };
  live(s, 1080); // three years
  const facts = s.facts;
  const births = facts.filter((f) => f.kind === 'birth'); const bet = facts.filter((f) => f.kind === 'betrothal'); const wed = facts.filter((f) => f.kind === 'wedding');
  assert.ok(births.length >= 25 && births.length <= 140, `births over three years: ${births.length}`);
  assert.ok(bet.length >= 5 && bet.length <= 90, `betrothals: ${bet.length}`);
  assert.ok(wed.length >= 1, `weddings: ${wed.length} (the brides ride in the game's day loop, not in this test: only those already in their husbands' halls wed here)`);
  for (const f of births) {
    const [cid, mid, fid] = f.actors; const c = s.characters[cid], mother = s.characters[mid], father = s.characters[fid];
    assert.ok(c && mother && father && c.mother === mid && c.father === fid && c.age <= 3);
    assert.ok(mother.age - c.age >= 14 && mother.age - c.age <= 46, `${mother.name} (${mother.age}) bore ${c.name} (${c.age})`);
    assert.ok(!keptAt(mid, f.day) && !keptAt(fid, f.day), `${mother.name} and ${father.name} are the story's: no child by chance`);
  }
  const ids = new Set(Object.keys(s.characters)); assert.equal(ids.size, Object.keys(s.characters).length);
  assert.equal(new Set(Object.values(s.characters).filter((c) => c.alive).map((c) => c.name)).size, Object.values(s.characters).filter((c) => c.alive).length, 'no two living people with one name');
  for (const f of bet) {
    const [a, b] = f.actors.map((id) => s.characters[id]); const [ha, hb] = f.houses; // (the houses they were of when matched: a bride is of her husband's after the wedding)
    assert.ok(ha !== 'stark' && hb !== 'stark', 'the player\'s own house is not matched by chance');
    assert.ok(Math.abs(a.age - b.age) <= FAMILY.AGE_GAP && isFemale(a) !== isFemale(b) && ha !== hb, `${a.name} and ${b.name}`);
    assert.ok(Math.abs(TIER[s.houses[ha].rank] - TIER[s.houses[hb].rank]) <= 1, 'of like rank');
    assert.ok(a.age >= FAMILY.MARRY_AGE && b.age >= FAMILY.MARRY_AGE, 'no one under sixteen is matched by chance');
  }
  settleWorld(s); // (a save is always settled: every person's activity true to the world, the children's too)
  assert.deepEqual(validate(s), [], 'the world is whole after three years of births and weddings');
});

test('WD1: a match is a betrothal, then a ride, then a wedding in the groom\'s hall: told once, one pact, the bride of her husband\'s house', () => {
  const s = world('stark', 3); const day = nextSunday(s); setDay(s, day);
  const singles = Object.values(s.characters).filter((c) => c.alive && c.status === 'free' && !c.spouse && c.age >= 16 && c.age <= 32 && c.house !== 'stark' && c.roles?.some((r) => ['lord', 'lady', 'heir', 'family'].includes(r)));
  let pair = null;
  for (const a of singles) for (const b of singles) if (a.id < b.id && suitability(s, a, b) != null && !pair) pair = [a, b];
  assert.ok(pair, 'two unwed who suit');
  const [a, b] = pair; const bride = a.sex === 'f' ? a : b, groom = a.sex === 'f' ? b : a; const brideHouse = bride.house, groomHouse = groom.house;
  s.meta.clock = { turn: 1, from: day, to: day };
  const card = betroth(s, a, b, day);
  assert.equal(card.title, `${a.name} is betrothed to ${b.name}`); assert.ok(a.betrothed === b.id && b.betrothed === a.id, 'each is betrothed to the other, by id: the windows and the Matters read it so');
  a.wedOn = b.wedOn = day + 7;
  live(s, 14);
  const [goes, stays] = bride.house !== groom.house && s.houses[bride.house].lord === bride.id ? [groom, bride] : [bride, groom];
  assert.ok(goes.bridal, 'the one who goes sets out when the day comes'); assert.ok(!bride.spouse, 'not wed on the road');
  setLoc(s, goes, s.houses[stays.house].seat); // (the road is the day loop's: here she is at the gate)
  const cards = live(s, 14);
  assert.equal(bride.spouse, groom.id); assert.equal(groom.spouse, bride.id, 'wed both ways');
  assert.ok(!a.betrothed && !b.betrothed, 'the betrothal is done with');
  const lord = (c) => s.houses[c.house]?.lord === c.id;
  assert.ok(bride.house === groom.house || lord(bride), `the bride is of her husband's house (${bride.house}, was ${brideHouse})`);
  assert.equal(s.facts.filter((f) => f.kind === 'wedding' && f.actors.includes(bride.id) && f.actors.includes(groom.id)).length, 1, 'the wedding is told once');
  assert.equal(s.facts.filter((f) => f.kind === 'betrothal' && f.actors.includes(bride.id) && f.actors.includes(groom.id)).length, 1, 'one betrothal fact (the match), and no second one at the wedding for the pact');
  assert.ok(s.pacts.some((p) => p.type === 'marriage' && [p.a, p.b].sort().join() === [brideHouse, groomHouse].sort().join()), 'a marriage pact binds the houses');
  assert.equal(cards.filter((c) => /make a marriage pact/.test(c.text || '')).length, 0, 'no second betrothal at the wedding');
});

test('WD1: a betrothal ends with a death, and a prisoner is not wed', () => {
  const s = world('stark', 4); const day = nextSunday(s); setDay(s, day); s.meta.clock = { turn: 1, from: day, to: day };
  const x = Object.values(s.characters).find((c) => c.alive && c.house !== 'stark' && !c.spouse && c.age >= 17 && c.age <= 28 && c.roles?.includes('family') && c.sex === 'f');
  const y = Object.values(s.characters).find((c) => c.alive && c.house !== 'stark' && !c.spouse && c.age >= 17 && c.age <= 30 && c.sex === 'm' && c.roles?.includes('family') && c.house !== x.house);
  betroth(s, x, y, day); x.wedOn = y.wedOn = day;
  y.status = 'imprisoned'; live(s, 14); assert.ok(x.betrothed && !x.spouse, 'a captive groom is not wed: she waits');
  y.alive = false; live(s, 7); assert.ok(!x.betrothed && !x.spouse, 'a death ends the betrothal');
});

test('WD1: the cards the writer tells of a child, a match and a wedding pass the scorer the soak holds every card to', () => {
  const s = world('stark', 6); const w = s.characters.lyessa_bolton; const m = s.characters.roose_bolton;
  const day = nextSunday(s) + 7; setDay(s, day - 1); w.expecting = { by: m.id, since: day - 270, due: day };
  live(s, 1);
  s.facts.forEach((f) => { f.day = day; });
  const storyOf = (facts) => clusterFacts(s, facts).stories;
  const born = s.facts.filter((f) => f.kind === 'birth');
  for (const st of storyOf(born)) { const c = cardOf(s, st); const r = scoreCard({ headline: c.headline, summary: c.summary }, st, s); assert.ok(r.pass, `${c.headline} / ${c.summary}: ${JSON.stringify(r.detail)}`); }
});

test('WD1: who is with child in another house is its own news; the player\'s own house sees its own', () => {
  const s = world('stark', 9); const w = s.characters.lyessa_bolton; w.expecting = { by: 'roose_bolton', since: 1, due: 9e9 };
  s.characters.catelyn_stark.expecting = { by: 'eddard_stark', since: 1, due: 9e9 };
  const v = playerView(s);
  assert.equal(v.characters.lyessa_bolton.expecting, undefined, 'another house\'s lady is its own business');
  assert.ok(v.characters.catelyn_stark.expecting, 'the house knows its own lady');
});

test('WD2: the old die at the rate of old people: five per cent a year at seventy, not forty-two', () => {
  assert.equal(ageRisk(59), 0); assert.equal(ageRisk(30), 0);
  assert.ok(Math.abs(ageRisk(70) - 0.05) < 1e-9, `seventy: ${ageRisk(70)}`);
  assert.ok(ageRisk(75) > 0.06 && ageRisk(75) < 0.09, `seventy-five: ${ageRisk(75)}`);
  assert.ok(ageRisk(80) > 0.09 && ageRisk(80) < 0.12 && ageRisk(90) > 0.2 && ageRisk(90) < 0.25 && ageRisk(94) < 0.35, `eighty ${ageRisk(80)}, ninety ${ageRisk(90)}, ninety-four ${ageRisk(94)}`);
  for (let a = 60; a < 105; a++) assert.ok(ageRisk(a + 1) >= ageRisk(a) && ageRisk(a) <= 0.6, `age ${a}`);
  let alive = 1; for (let a = 75; a < 79; a++) alive *= 1 - ageRisk(a);
  assert.ok(alive > 0.7, `of those who are seventy-five, ${Math.round(alive * 100)} in a hundred see seventy-nine (the report: two in forty)`);
});

test('WD6: Bran is Bran, and no two living people, or two holdings, bear one name', () => {
  const s = world();
  assert.equal(s.characters.bran_stark.name, 'Bran Stark'); assert.equal(s.characters.brandon_stark_elder.name, 'Brandon Stark');
  const seen = new Map(); for (const c of Object.values(s.characters).filter((x) => x.alive)) seen.set(c.name, [...(seen.get(c.name) || []), c.id]);
  assert.deepEqual([...seen].filter(([, ids]) => ids.length > 1), [], 'two living people of one name');
  const places = new Map(); for (const h of Object.values(s.holdings)) places.set(h.name, [...(places.get(h.name) || []), h.id]);
  assert.deepEqual([...places].filter(([, ids]) => ids.length > 1), [], 'two holdings of one name');
});

test('WD1: the lord betroths one of his own: the other house hears it, and the match is held to the houses\' terms', () => {
  const s = world('stark', 5); const rel = getRelation(s, 'stark', 'tully');
  const r = withRng(s, () => perform(s, 'betroth', { house: 'stark', params: { character: 'sansa_stark', to: 'edmure_tully' } }));
  assert.ok(r.ok, r.refusal?.text);
  assert.equal(s.characters.sansa_stark.betrothed, 'edmure_tully'); assert.equal(s.characters.edmure_tully.betrothed, 'sansa_stark');
  assert.ok(s.characters.sansa_stark.wedOn > dayNumber(s.meta.date) + 360, 'not wed before sixteen: the girl is eleven');
  assert.ok(getRelation(s, 'stark', 'tully') > rel, 'the houses are closer for it');
  const f = s.facts.find((x) => x.kind === 'betrothal'); assert.ok(f && f.actors.join() === 'sansa_stark,edmure_tully' && f.houses.includes('tully'));
  assert.match(r.receipt[0].text, /Sansa Stark is betrothed to Edmure Tully; House Tully is glad of it/);
  const no = (house, params, re, setup = () => {}) => { const t = world(house, 5); setup(t); const x = withRng(t, () => perform(t, 'betroth', { house, params })); assert.ok(!x.ok && re.test(x.refusal.text), `${JSON.stringify(params)}: ${x.refusal?.text}`); };
  no('stark', { character: 'sansa_stark', to: 'arya_stark' }, /your own house/);
  no('stark', { character: 'sansa_stark', to: 'edmure_tully' }, /promised already/, (t) => { t.characters.edmure_tully.betrothed = 'x'; });
  no('stark', { character: 'robb_stark', to: 'catelyn_stark' }, /wed already|own house/);
  no('stark', { character: 'sansa_stark', to: 'edmure_tully' }, /at war/, (t) => applyChanges(t, [{ op: 'war', status: 'start', name: 'W', attackers: ['stark'], defenders: ['tully'] }]));
  no('stark', { character: 'sansa_stark', to: 'edmure_tully' }, /too cold/, (t) => { applyChanges(t, [{ op: 'relation', a: 'stark', b: 'tully', delta: -140 }]); });
  no('stark', { character: 'sansa_stark', to: 'jon_snow' }, /./);
  no('stark', { character: 'sansa_stark', to: 'brynden_tully' }, /./);
});

test('WD1: the order reader reads a betrothal: Betroth Sansa to Joffrey, and asks whom when it is not said', () => {
  const s = world('stark', 298);
  const read = (t) => parseOrder(s, t);
  assert.deepEqual(read('Betroth Sansa to Prince Joffrey.').actions.map((a) => [a.verb, a.params]), [['betroth', { character: 'sansa_stark', to: 'joffrey_baratheon' }]]);
  assert.deepEqual(read('Wed Sansa to Edmure Tully.').actions.map((a) => [a.verb, a.params]), [['betroth', { character: 'sansa_stark', to: 'edmure_tully' }]]);
  assert.deepEqual(read('Marry Sansa to Joffrey Baratheon').actions.map((a) => a.verb), ['betroth']);
  const ask = read('Betroth my daughter Sansa to a son of House Tyrell');
  assert.ok(!ask.complete && /Whom should Sansa Stark be betrothed to\?/.test(ask.clarify.question), ask.clarify?.question);
  assert.ok(ask.clarify.options.length && ask.clarify.options.every((o) => o.patch?.to && /Tyrell/.test(o.label)), 'the chips are sons of the house named, each with his house and years');
  assert.deepEqual(ask.clarify.pending, { verb: 'betroth', params: { character: 'sansa_stark' } });
  assert.ok(/Whom should Robb Stark be betrothed to\?/.test(read('Arrange a marriage for Robb.').clarify.question));
  assert.ok(!read('Write to Lord Tully about a marriage.').actions.some((a) => a.verb === 'betroth'), 'a letter about a marriage is a letter');
  assert.deepEqual(read('Hold a feast.').actions.map((a) => a.verb), ['hold_feast']);
});

test('WD1: an offer accepted in the Matters ends in a wedding all the same: the betrothal the lord made is carried to the church door', () => {
  const s = world('stark', 5); const day = nextSunday(s); setDay(s, day); s.meta.clock = { turn: 1, from: day, to: day };
  // (what petitions.js does when a match is accepted: the two are betrothed, by id, and nothing else)
  const a = s.characters.sansa_stark; const b = s.characters.edmure_tully; a.betrothed = b.id; b.betrothed = a.id;
  live(s, 14);
  assert.ok(a.wedOn > day + 360 && a.wedOn === b.wedOn, `the wedding is fixed for when the girl is sixteen (${a.wedOn - day} days off)`);
  a.age = 16; a.wedOn = b.wedOn = day + 21; b.loc = a.loc; // (she is sixteen; he is at her father's hall)
  const bride = a; const seat = s.houses[b.house].seat; setLoc(s, a, seat); setLoc(s, b, seat); live(s, 21);
  assert.equal(bride.spouse, b.id);
});
