// What the second hunt found, playing the fixed game (docs/bughunt/FOUND.md, N-003 and up). Mock only.
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.WC_PROVIDER = 'mock';
process.env.WC_SAVES = (await import('node:fs')).mkdtempSync((await import('node:path')).join((await import('node:os')).tmpdir(), 'wc-found-'));
const { createInitialState, applyChanges } = await import('../public/js/shared/world.js');
const { tollAlong } = await import('../public/js/shared/marches.js');
const { withRng, seedState } = await import('../public/js/engine/rng.js');
const { BRIEFS } = await import('../public/data/briefs.js');
const { setLoc } = await import('../public/js/engine/parties.js');
const { emit } = await import('../public/js/engine/facts/log.js');
const { clusterFacts } = await import('../public/js/engine/facts/cluster.js');
const { cardOf } = await import('../public/js/engine/facts/headline.js');
const { dateOfDay, dayNumber } = await import('../public/js/engine/time.js');
const { plural3 } = await import('../public/js/engine/facts/heads.js');
const { scoreCard } = await import('../server/ai/validate/headline.js');
const { fact } = await import('../public/js/engine/facts/log.js');
const { bandNews, strainShown } = await import('../public/js/shared/psyche.js');
const { chokepointToll } = await import('../public/js/shared/chokepoints.js');
const { fits } = await import('../public/js/shared/happenings.js');
const { perform, check, intentFor } = await import('../public/js/engine/actions/registry.js');
const { partyOf } = await import('../public/js/engine/parties.js');
const { suitability, refusal } = await import('../public/js/engine/people/family.js');
const { HAPPENINGS } = await import('../public/data/happenings.js');
const { raiseLevies } = await import('../public/js/engine/actions/military.js');
const { regencyTick, speakerFor } = await import('../public/js/shared/regency.js');
const game = await import('../server/game.js');

const world = (house = 'stark', seed = 7) => createInitialState('agot_298', house, { seed });

test('N-003: a man seized with his own riders about him is held where he stands, not carried off by them', () => {
  const s = world('lannister');
  applyChanges(s, [{ op: 'army_create', id: 'eddard_riders', owner: 'stark', name: 'Eddard Stark\'s riders', at: 'baratheon', men: 6, commander: 'eddard_stark' }]);
  const ned = s.characters.eddard_stark; const party = s.parties.eddard_riders; setLoc(s, ned, 'party:eddard_riders');
  assert.equal(ned.loc, 'party:eddard_riders', 'riding with his own riders, at King\'s Landing');
  withRng(s, () => applyChanges(s, [{ op: 'character', id: 'eddard_stark', status: 'imprisoned', note: 'Seized by the City Watch' }]));
  assert.equal(ned.status, 'imprisoned');
  assert.equal(ned.loc, 'baratheon', 'in the black cells of King\'s Landing: where the beat that tries him looks for him');
  assert.ok(!party.members.includes('eddard_stark'), 'and no longer one of the riders, who may ride on without him');
  assert.equal(party.commander, null, 'a prisoner leads no one');
});

test('N-003: a man taken by another house\'s host stays in that host\'s company', () => {
  const s = world('lannister');
  applyChanges(s, [{ op: 'army_create', id: 'jaimes_host', owner: 'lannister', name: 'The Lannister host', at: 'tully', men: 4000, commander: 'jaime_lannister' }, { op: 'army_create', id: 'robbs_host', owner: 'stark', name: 'The northern host', at: 'tully', men: 9000, commander: 'robb_stark' }]);
  const jaime = s.characters.jaime_lannister;
  setLoc(s, jaime, 'party:robbs_host'); // (the field's capture brings him into the captors' company; then he is held)
  withRng(s, () => applyChanges(s, [{ op: 'character', id: 'jaime_lannister', status: 'imprisoned' }]));
  assert.equal(jaime.loc, 'party:robbs_host', 'a captive of the field rides with his captors');
});

test('N-004: a barrier a host has paid is not paid again on a road planned again the next day', () => {
  const s = world('stark'); applyChanges(s, [{ op: 'army_create', id: 'h', owner: 'stark', name: 'Host H', at: 'tully', men: 1000, commander: null }]);
  const a = s.parties.h; a.at = null; a.pos = [380, 1600]; a.march = { to: 'party:q', since: 1 };
  const road = [[380, 1600], [430, 1600]]; // across the line of the Golden Tooth (398,1540)–(412,1680)
  a.route = { path: road, t: [0, 1], done: 0, days: 1 };
  const first = tollAlong(s, a, road, 1);
  assert.ok(first.met.some((m) => m.id === 'golden_tooth') && first.losses > 0, 'the first day pays: the pass is paid for in men and days');
  const losses = first.losses;
  // the quarry has moved: the road is planned again from where the host stands (a new route, with nothing paid on it), and the host, held up four days, stands where it did
  for (let day = 2; day <= 40; day++) {
    a.route = { path: road, t: [0, 1], done: 0, days: 1 };
    const again = tollAlong(s, a, road, 1);
    assert.deepEqual(again.met, [], `day ${day}: the Golden Tooth is paid, once`);
    assert.equal(again.losses, 0);
  }
  assert.deepEqual(a.march.paid, ['golden_tooth']);
  assert.ok(losses < a.men + losses, 'a thousand men are not a company of fifty that loses one a day for seventy');
  // a new order is a new road: it pays again
  a.march = { to: 'tully', since: 2 }; a.route = { path: road, t: [0, 1], done: 0, days: 1 };
  assert.ok(tollAlong(s, a, road, 1).met.some((m) => m.id === 'golden_tooth'), 'a host sent back through the pass pays it again');
});

test('N-005: the Targaryen opening speaks to the ruler it is played as, not to his sister', () => {
  const b = BRIEFS.targaryen;
  assert.match(b.situation, /^You are Viserys/, 'you are Viserys');
  assert.doesNotMatch([b.situation, ...b.strengths, ...b.weaknesses, ...b.goals, ...b.levers, ...b.hints].join(' '), /Your brother Viserys|a cruel, desperate brother|A khal's love|has sold you/i, 'no line in the voice of Daenerys');
  assert.doesNotMatch(b.situation, /stone eggs/, 'the eggs are Daenerys\'s wedding gift: not Viserys\'s to count');
});

test('N-006: a feast with one guest at the table says "sits", with several "sit"', () => {
  const told = (guests) => {
    const s = world('stark'); const day = dayNumber(s.meta.date); s.meta.date = { ...s.meta.date, ...dateOfDay(day) }; s.meta.clock = { turn: 1, from: day, to: day };
    emit(s, 'feast', { actors: ['eddard_stark', ...guests], houses: ['stark'], place: 'stark', importance: 3, text: 'x' });
    return cardOf(s, clusterFacts(s, s.facts).stories[0]).summary;
  };
  assert.match(told(['roose_bolton']), /Roose Bolton sits at the table/);
  assert.match(told(['roose_bolton', 'rickard_karstark']), /Roose Bolton and Rickard Karstark sit at the table/);
});

const storyOf = (s) => clusterFacts(s, s.facts).stories[0];
const today = (s) => { const day = dayNumber(s.meta.date); s.meta.clock = { turn: 1, from: day, to: day }; return day; };

test('N-008: a house told as a people takes the plural verb: "The Tullys seize Stoney Sept", not "seizes"', () => {
  const want = { seizes: 'seize', takes: 'take', carries: 'carry', crushes: 'crush', passes: 'pass', besieges: 'besiege', dies: 'die', goes: 'go', is: 'are', was: 'were', has: 'have', against: 'against', captured: 'captured', its: 'its' };
  for (const [one, many] of Object.entries(want)) assert.equal(plural3(one), many, one);
  const s = world('stark'); today(s);
  const hold = Object.values(s.holdings).find((h) => h.owner === 'tully' && h.name);
  for (const kind of ['holding_fell', 'siege_begun', 'siege_lifted', 'storm_assault', 'siege_tick']) {
    for (let pin = 0; pin < 4; pin++) {
      s.facts = [];
      emit(s, kind, { actors: [], houses: ['tully'], place: hold.id, importance: 3, data: { by: 'tully', holding: hold.id, how: 'taken' }, text: 'x' });
      const st = storyOf(s); const card = cardOf(s, st, { pin });
      assert.doesNotMatch(`${card.headline}. ${card.summary}`, /\bTullys \w+(?:es|s)\b(?<!Tullys against)/, `${kind}/${pin}: "${card.headline}"`);
      if (/^The Tullys/.test(card.headline)) assert.match(card.headline, /^The Tullys (?:take|seize|storm|carry|besiege|lay|close|lift|give|keep|fall back)\b/, `${kind}/${pin}: ${card.headline}`);
      assert.ok(scoreCard({ headline: card.headline, summary: card.summary }, st, s).pass, `${kind}/${pin}: ${card.headline}`);
    }
  }
});

test('N-008: the Crown and a single host are not a crowd: "The royal house besieges", "The Lannister host besieges"', () => {
  const s = world('stark'); today(s); const hold = Object.values(s.holdings).find((h) => h.owner === 'tully' && h.name);
  for (let pin = 0; pin < 4; pin++) {
    s.facts = []; emit(s, 'siege_begun', { actors: [], houses: ['baratheon'], place: hold.id, importance: 3, data: { by: 'baratheon', holding: hold.id }, text: 'x' });
    assert.doesNotMatch(cardOf(s, storyOf(s), { pin }).headline, /royal house (?:besiege|lay|close)\b/);
  }
});

test('N-009: a wife with child in the player\'s house is told as news of the hearth, not as "Rumour spreads — it is only talk"', () => {
  const s = world('stark'); const day = today(s);
  fact(s, 'happening', { title: 'x', text: 'x', where: 'stark', importance: 2, houses: ['stark'] }, { actors: ['catelyn_stark', 'eddard_stark'], data: { family: 'expecting', due: day + 270 } });
  let st = storyOf(s); let card = cardOf(s, st);
  assert.match(card.headline, /Catelyn Stark (?:is with child|carries Eddard Stark's child)/); assert.match(card.summary, /about nine moons/); assert.doesNotMatch(`${card.headline} ${card.summary}`, /Rumour|only talk/);
  assert.equal(card.archetype, 'court'); assert.ok(scoreCard({ headline: card.headline, summary: card.summary }, st, s).pass, card.headline);
  s.facts = [];
  fact(s, 'happening', { title: 'x', text: 'x', where: 'stark', importance: 2, houses: ['stark'] }, { actors: ['catelyn_stark'], data: { family: 'stillborn' } });
  st = storyOf(s); card = cardOf(s, st);
  assert.match(card.headline, /Catelyn Stark (?:loses her child|is brought to bed of a dead child)/); assert.doesNotMatch(`${card.headline} ${card.summary}`, /Rumour|only talk/);
});

test('N-010: a host crossing a barrier its own house holds is let through; a stranger pays', () => {
  const s = world('lannister'); const gate = s.holdings.lefford; assert.ok(gate, 'Lefford keeps the Golden Tooth');
  const holder = gate.owner; assert.ok(s.houses[holder]);
  applyChanges(s, [{ op: 'army_create', id: 'own_h', owner: holder, name: 'Own host', at: 'tully', men: 1000, commander: null }, { op: 'army_create', id: 'stranger', owner: 'greyjoy', name: 'Stranger host', at: 'tully', men: 1000, commander: null }]);
  const own = chokepointToll(s, s.parties.own_h, [380, 1600], [430, 1600], 1);
  assert.ok(own.met.some((m) => m.id === 'golden_tooth' && m.gated), 'the pass is crossed, and by leave'); assert.equal(own.losses, 0, 'its own gatekeepers open the road'); assert.equal(own.days, 0); assert.equal(own.morale, 0); assert.equal(own.events.length, 0, 'and nothing is told of it');
  const other = chokepointToll(s, s.parties.stranger, [380, 1600], [430, 1600], 1);
  assert.ok(other.met.some((m) => m.id === 'golden_tooth') && other.losses > 0, 'a house with no leave pays');
});

test('N-011: a lord\'s strain is told as it worsens, once at each pitch, and says what the household sees', () => {
  const c = { id: 'x' };
  assert.equal(bandNews(c, 'strained', 'weary', 5), true, 'worse: news');
  c.toldBand = { band: 'strained', turn: 5 };
  assert.equal(bandNews(c, 'weary', 'strained', 6), false, 'better: not news');
  assert.equal(bandNews(c, 'strained', 'weary', 6), false, 'back across the same line a turn later: the same story');
  assert.equal(bandNews(c, 'fraying', 'strained', 6), true, 'a worse pitch than the one told is news at once');
  assert.equal(bandNews(c, 'strained', 'weary', 9), false, 'not a few turns on'); assert.equal(bandNews(c, 'strained', 'weary', 17), true, 'told again after a year');
  const s = world('stark'); today(s);
  const seen = new Set();
  for (const band of ['weary', 'strained', 'fraying', 'breaking']) {
    s.facts = []; emit(s, 'behaviour', { actors: ['eddard_stark'], houses: ['stark'], place: 'stark', importance: 3, data: { band }, text: 'x' });
    const card = cardOf(s, storyOf(s)); seen.add(card.headline);
    assert.doesNotMatch(card.headline, /own counsel/, band); assert.ok(card.summary.length > 10, `${band}: a line of its own`);
  }
  assert.equal(seen.size, 4, 'a different headline for each band');
});

test('N-012: a happening that calls a man "Prince" or "Lord" is not told once he is a king', () => {
  const s = world('stark'); const hold = Object.values(s.holdings)[0];
  const tpl = HAPPENINGS.find((t) => t.id === 'p_joffrey');
  assert.equal(fits(s, tpl, hold, null), true, 'a prince, he is told as one');
  applyChanges(s, [{ op: 'character', id: 'joffrey_baratheon', title: 'King of the Andals and the First Men' }]);
  assert.equal(fits(s, tpl, hold, null), false, 'crowned, he is not');
  for (const [id, who] of [['p_stannis', 'stannis_baratheon'], ['kl_dragonstone', 'stannis_baratheon'], ['st_storms_end', 'renly_baratheon'], ['p_renly_charm', 'renly_baratheon']]) {
    const t = HAPPENINGS.find((x) => x.id === id); assert.ok(t.when.includes(`uncrowned:${who}`), id);
  }
});

test('N-013: a host the story makes is made with its leader at its head, not left behind at his hall', () => {
  const s = world('lannister');
  const robb = s.characters.robb_stark; assert.equal(robb.loc, 'stark', 'at Winterfell');
  applyChanges(s, [{ op: 'army_create', id: 'northern_host', owner: 'stark', name: 'The Northern Host', at: 'moat_cailin', men: 18000, commander: 'robb_stark' }]);
  assert.equal(partyOf(s, robb)?.id, 'northern_host', 'Robb rides with the host he commands');
  // a prisoner does not lead, and a man already on the road with another party is not carried off by a new one
  const jaime = s.characters.jaime_lannister; jaime.status = 'imprisoned';
  applyChanges(s, [{ op: 'army_create', id: 'lions', owner: 'lannister', name: 'Lions', at: 'lannister', men: 500, commander: 'jaime_lannister' }]);
  assert.notEqual(partyOf(s, jaime)?.id, 'lions', 'a captive commander stays where he is held');
});

test('N-014: while the lord is a prisoner, the feast, the tourney and the dues are the regent\'s, and the chronicle says so', () => {
  const s = world('stark'); const tully = s.houses.tully; const lord = s.characters[tully.lord];
  const regent = Object.values(s.characters).find((c) => c.house === 'tully' && c.alive && c.id !== lord.id && c.sex === 'f') || Object.values(s.characters).find((c) => c.house === 'tully' && c.alive && c.id !== lord.id);
  tully.regent = regent.id; lord.status = 'imprisoned'; setLoc(s, regent, tully.seat);
  s.houses.tully.figures.treasury.v = 100000;
  const r = withRng(s, () => perform(s, 'hold_feast', { house: 'tully', source: { type: 'intent', ref: regent.id, by: 'mock' } }));
  assert.ok(r.ok, JSON.stringify(r.refusal));
  const feast = s.facts.filter((f) => f.kind === 'feast').at(-1);
  assert.equal(feast.actors[0], regent.id, 'the regent holds it');
  assert.ok(feast.text.startsWith(regent.name), `the fact's own text (the narrator's ground) names the regent, not the prisoner: ${feast.text}`);
  assert.match(cardOf(s, clusterFacts(s, [feast]).stories[0]).headline, new RegExp(regent.name.split(' ')[0]));
});

test('N-016: a day of the realm\'s calendar is told by its own name and words, not as "Rumour spreads at King\'s Landing. It is only talk."', async () => {
  const { CALENDAR, COURTS } = await import('../public/data/calendar.js');
  const s = world('stark'); today(s);
  for (const c of [...CALENDAR, ...COURTS]) {
    const where = c.where === 'baratheon' ? 'baratheon' : Object.keys(s.holdings).includes(c.where) ? c.where : 'baratheon';
    s.facts = [];
    fact(s, 'happening', { title: c.title, text: c.text, where, importance: 1, houses: [s.holdings[where].owner] }, { data: { head: c.head || c.title, sum: c.text } });
    const card = cardOf(s, { facts: [s.facts.at(-1)] }); // (a small fact is a card of its own: the clusterer tells only the news)
    assert.equal(card.headline, (c.head || c.title).replace(/^./, (x) => x.toUpperCase()).replace(/[.;,\s]+$/, '')); assert.ok(card.summary.startsWith(c.text.slice(0, 30)), card.summary);
    assert.doesNotMatch(`${card.headline} ${card.summary}`, /Rumour spreads|only talk/);
  }
});

test('N-017: the same two hosts fighting again on the next day and the next are one running fight, told as one card', () => {
  const s = world('stark'); const day = dayNumber(s.meta.date); s.meta.clock = { turn: 1, from: day, to: day + 59 };
  const hold = Object.values(s.holdings).find((h) => h.owner === 'tully' && h.name);
  const fight = (on, extra = {}, pair = ['lions', 'trouts']) => emit(s, 'battle', { actors: [], houses: ['lannister', 'tully'], place: hold.id, importance: 4, on, text: 'x', data: { attacker: pair[0], defender: pair[1], winner: pair[0], loser: pair[1], winnerHouse: 'lannister', loserHouse: 'tully', lost: { [pair[0]]: 300, [pair[1]]: 700 }, ...extra } });
  for (const on of [1, 2, 3, 4]) fight(on, on === 4 ? { wiped: true } : {});
  fight(40); // a month later: another battle
  const stories = clusterFacts(s, s.facts).stories;
  assert.equal(stories.length, 2, `the four days are one story, the later battle another (${stories.map((x) => x.facts.length)})`);
  const run = stories.find((x) => x.facts.length === 4); const card = cardOf(s, run);
  assert.match(card.headline, /^The Lannisters? (?:host )?(?:destroys|hunts down)|cut down by/); assert.match(card.summary, /^Four battles in four days\. The Tullys lose many more men than the Lannisters\./);
  assert.ok(scoreCard({ headline: card.headline, summary: card.summary }, run, s).pass, card.headline);
  assert.ok(card.details.length >= 2 && card.details.length <= 4, `the first day and the last, not all four: ${JSON.stringify(card.details)}`);
  // the days of a fight that reach a far house by raven, one a day, are still one fight
  s.facts = []; for (const on of [1, 2, 3]) { const f = fight(on); f.heard = { via: 'raven', happened: f.day }; }
  assert.equal(clusterFacts(s, s.facts).stories.length, 1, 'three ravens, one fight');
  // two hosts of one house, fighting the same enemy's host on the same day, are one side: one running fight
  s.facts = []; fight(1, {}, ['lions', 'trouts']); fight(1, {}, ['lions_b', 'trouts']); fight(2, {}, ['lions', 'trouts']);
  assert.equal(clusterFacts(s, s.facts).stories.length, 1, 'the Lannister hosts and the Tully host are two sides');
  // two different pairs on the same days are not one fight
  s.facts = []; fight(1); fight(2); fight(1, { winnerHouse: 'stark', loserHouse: 'frey' }, ['wolves', 'ravens']); fight(2, { winnerHouse: 'stark', loserHouse: 'frey' }, ['wolves', 'ravens']);
  for (const st of clusterFacts(s, s.facts).stories) assert.doesNotMatch(cardOf(s, st).summary, /^\w+ battles in /, 'two pairs of houses are not one running fight');
  // and a draw of the same loss is "about as many", without "than"
  s.facts = []; fight(1, { lost: { lions: 500, trouts: 520 } });
  const one = cardOf(s, storyOf(s)); assert.match(one.summary, /lose about as many men(?! than)/, one.summary);
});

test('N-019: a man who commands a host of his own rides with it, not away with his house\'s muster', async () => {
  const { answer } = await import('../public/js/engine/military/muster.js');
  let drawn = 0;
  for (let seed = 1; seed <= 8; seed++) {
    const s = world('stark', seed); const v = s.houses.blackwood;
    const kin = Object.values(s.characters).find((c) => c.house === 'blackwood' && c.id !== v.lord && c.alive && c.sex === 'm' && c.age >= 16 && c.age <= 50 && c.status === 'free' && c.loc === v.seat);
    assert.ok(kin, 'a Blackwood kinsman at Raventree'); applyChanges(s, [{ op: 'army_create', id: 'kin_company', owner: 'blackwood', name: 'Kin company', at: v.seat, men: 30, commander: kin.id }]);
    assert.equal(partyOf(s, kin)?.id, 'kin_company');
    withRng(s, () => answer(s, v, {})); drawn++;
    assert.equal(partyOf(s, kin)?.id, 'kin_company', `seed ${seed}: he leads his company still`);
    assert.equal(s.parties.kin_company.commander, kin.id);
  }
  assert.equal(drawn, 8);
});

test('N-020: the lord whose lists are to be run is not sent off to hunt before they are', () => {
  const s = world('lannister'); const v = s.houses.tyrell; const lord = s.characters[v.lord];
  const send = (to) => check(s, intentFor(s, 'send_person', { house: 'tyrell', params: { character: lord.id, to }, source: { type: 'intent', ref: lord.id, by: 'mock' } }));
  assert.equal(send('lannister'), null, 'free to go before he calls a tourney');
  s.plots = s.plots || {}; s.plots.lists = { [v.seat]: { house: 'tyrell', called: dayNumber(s.meta.date), on: dayNumber(s.meta.date) + 21 } };
  assert.equal(send('lannister')?.code, 'hosting', 'not while his lists are to be run');
  assert.notEqual(send(v.seat)?.code, 'hosting', 'and his own seat is no leaving'); s.meta.player = 'tyrell';
  assert.equal(send('lannister'), null, 'the player\'s own lord goes where the player says');
});

test('N-021: the lord or the heir of a house is not matched away to another\'s hall: Harlaw\'s heir does not become Merlyn\'s', () => {
  const s = world('stark'); const urragon = s.characters.urragon_harlaw; const gysella = s.characters.gysella_merlyn;
  assert.ok(urragon && gysella, 'both are in the story\'s world'); assert.ok((urragon.roles || []).includes('heir') && s.houses[gysella.house].lord === gysella.id);
  urragon.age = 22; gysella.age = 20;
  assert.equal(suitability(s, urragon, gysella), null, 'an heir and a ruling lady: neither can go');
  assert.match(refusal(s, urragon, gysella) || '', /heart of a house/);
  const other = Object.values(s.characters).find((c) => c.house === 'merlyn' && c.sex === 'f' && c.id !== gysella.id && !(c.roles || []).includes('heir') && s.houses.merlyn.lord !== c.id);
  if (other) { other.age = 20; assert.notEqual(refusal(s, urragon, other), `${urragon.name} and ${other.name} are each the heart of a house: neither can go to the other's hall.`, 'a younger daughter may go to him'); }
});

test('N-022: the turn\'s Meanwhile does not say the same clause in each of its weeks', async () => {
  const { foldMeanwhile } = await import('../public/js/engine/facts/headline.js');
  const weeks = ['Lords ride to feasts across the North; rumour runs at King\'s Landing.', 'Lords ride to hunts across the Reach; the households of Winterfell have small news; rumour runs at King\'s Landing.', 'Rumour runs at King\'s Landing; the households of Winterfell have small news.', 'Rumour runs at King\'s Landing.', ''];
  assert.equal(foldMeanwhile(weeks), 'Lords ride to feasts across the North; rumour runs at King\'s Landing. Lords ride to hunts across the Reach; the households of Winterfell have small news.');
  assert.equal(foldMeanwhile([]), ''); assert.equal(foldMeanwhile(['A lord rides out in Dorne.']), 'A lord rides out in Dorne.');
});

test('N-023: the steward\'s small events are told as what they are: a fire in the granary, a new vein in the mines, not "inspects its accounts"', async () => {
  const { ledgerNote } = await import('../server/game.js');
  const notes = { sickness: 'Hornwood: a sickness among the smallfolk.', outlaws: 'Woolfield Keep: outlaws on the roads.', blight: 'Wull Mountains: blight in the fields.', fire: 'Blackpool: a fire in the granary.', shoals: 'The Dreadfort: fat herring shoals.', fair: 'Deepdown: a great fair drew merchants.', vein: 'Winterfell: a new vein in the mines.', storm: 'Ironrath: a storm wrecked the fishing boats.', harvest: 'Winter Town: a bumper harvest.' };
  for (const [kind, text] of Object.entries(notes)) {
    assert.equal(ledgerNote(text), kind, text);
    const s = world('stark'); today(s); s.facts = [];
    emit(s, 'ledger', { houses: ['stark'], place: 'stark', importance: 1, data: { note: kind }, text });
    const card = cardOf(s, { facts: [s.facts[0]] });
    assert.doesNotMatch(card.headline, /inspects its accounts/, kind); assert.ok(card.summary.length > 10, `${kind}: a line of its own`);
    assert.ok(scoreCard({ headline: card.headline, summary: card.summary }, { facts: [s.facts[0]], actors: [], houses: ['stark'], place: 'stark', days: [1, 1], importance: 1 }, s).pass, `${kind}: ${card.headline}`);
  }
});

test('N-024: the player is told at once of the weariness of his own, and of a lord he merely knows only when it is past weariness', () => {
  const s = world('stark'); const ned = s.characters.eddard_stark; const robb = s.characters.robb_stark; const tywin = s.characters.tywin_lannister;
  assert.equal(strainShown(s, ned, 'weary'), true, 'his own lord'); assert.equal(strainShown(s, robb, 'weary'), true, 'his own house');
  assert.equal(strainShown(s, tywin, 'weary'), false, 'a stranger who sleeps badly is no news');
  for (const band of ['weary', 'strained', 'fraying', 'breaking']) assert.equal(typeof strainShown(s, tywin, band), 'boolean');
});

test('N-025: a man who goes to another party leaves the command of the one he left', () => {
  const s = world('lannister');
  applyChanges(s, [{ op: 'army_create', id: 'company_a', owner: 'stark', name: 'Company A', at: 'stark', men: 50, commander: 'rodrik_cassel' }, { op: 'army_create', id: 'host_b', owner: 'stark', name: 'Host B', at: 'stark', men: 900, commander: null }]);
  const rodrik = s.characters.rodrik_cassel;
  assert.equal(partyOf(s, rodrik)?.id, 'company_a'); assert.equal(s.parties.company_a.commander, 'rodrik_cassel');
  setLoc(s, rodrik, 'party:host_b');
  assert.equal(s.parties.company_a.commander, null, 'the company he left has no commander who is elsewhere');
  setLoc(s, rodrik, 'stark'); // to a hall, from a host he does not command: nothing to clear
  assert.equal(partyOf(s, rodrik), null);
});

test('N-026: a host or fleet that sets out has its commander aboard; one who is held, or nowhere near, leads it no more', async () => {
  const { boardCommanders } = await import('../public/js/engine/parties.js');
  const s = world('lannister'); const seat = s.holdings.greyjoy;
  applyChanges(s, [{ op: 'army_create', id: 'sea_wolves', owner: 'greyjoy', name: 'Sea Wolves', at: 'greyjoy', men: 600, commander: 'victarion_greyjoy', kind: 'fleet' }]);
  const victarion = s.characters.victarion_greyjoy; setLoc(s, victarion, 'greyjoy'); // the fleet is in harbour, its captain in the hall
  boardCommanders(s); assert.equal(partyOf(s, victarion), null, 'a fleet in harbour is not sailing: he stays in his hall');
  const fleet = s.parties.sea_wolves; fleet.at = null; fleet.pos = [seat.pos[0] + 3, seat.pos[1]]; fleet.march = { to: 'flint_finger', since: 1 };
  boardCommanders(s); assert.equal(partyOf(s, victarion)?.id, 'sea_wolves', 'it sailed with him');
  // a commander far away, or a prisoner, leads it no more
  const host = (id, who) => { applyChanges(s, [{ op: 'army_create', id, owner: 'stark', name: id, at: 'stark', men: 100, commander: who }]); const p = s.parties[id]; setLoc(s, s.characters[who], s.characters[who].loc && !String(s.characters[who].loc).startsWith('party:') ? s.characters[who].loc : 'stark'); p.commander = who; return p; };
  const far = host('far_host', 'robb_stark'); setLoc(s, s.characters.robb_stark, 'tyrell'); far.at = null; far.pos = [...s.holdings.stark.pos]; far.march = { to: 'moat_cailin', since: 1 };
  boardCommanders(s); assert.equal(far.commander, null, 'Robb is at Highgarden, and Winterfell\'s host marches without his name');
});

test('N-027: the realm\'s ambient feast between two lords is not told of a host who is on the road with his muster', async () => {
  const { worldTick } = await import('../public/js/shared/plots.js');
  const feasts = (s, rounds) => { let n = 0; for (let i = 0; i < rounds; i++) n += withRng(s, () => worldTick(s, 30)).events.filter((e) => /feasts .* for a fortnight/.test(`${e.text || ''} ${e.summary || ''}`)).length; return n; };
  const home = world('stark', 11); assert.ok(feasts(home, 60) >= 1, 'with the lords in their halls the realm feasts');
  const away = world('stark', 11); for (const h of Object.values(away.houses)) if (h.lord && away.characters[h.lord]) away.characters[h.lord].loc = 'party:nowhere';
  assert.equal(feasts(away, 60), 0, 'with every lord on the road there is no one to feast anyone');
});

test('N-028: a death is a blow once: a widower is not struck by it every week of three moons', async () => {
  const { psycheTick } = await import('../public/js/shared/psyche.js');
  const s = world('stark', 3); s.meta.turn = 5;
  const ned = s.characters.eddard_stark; const cat = s.characters.catelyn_stark; ned.status = 'free'; cat.alive = false; cat.status = 'dead'; cat.diedTurn = 5; cat.diedDay = dayNumber(s.meta.date);
  // a quiet world: no war, no siege, nothing but the grief
  s.wars = []; ned.stress = 0; ned.traits = 'calm';
  const before = ned.stress;
  for (let week = 0; week < 8; week++) withRng(s, () => psycheTick(s, 7));
  assert.ok(ned.stress > 3, `he grieves (${ned.stress})`); assert.ok(ned.stress <= 45, `once, not every week of eight: ${ned.stress} (it was a hundred)`);
  assert.deepEqual(ned.grieved, ['catelyn_stark']);
  assert.ok(before === 0);
});

test('N-029: a child born in play is told with whose child it is, not as a bare name', () => {
  const s = world('stark'); today(s); s.facts = [];
  emit(s, 'birth', { actors: ['bran_stark', 'catelyn_stark', 'eddard_stark'], houses: ['stark'], place: 'stark', importance: 2, data: { mother: 'catelyn_stark', father: 'eddard_stark', sex: 'f' }, text: 'x' });
  const card = cardOf(s, storyOf(s));
  assert.equal(card.summary, 'A daughter of Eddard Stark and Catelyn Stark.', card.summary);
  s.facts = []; emit(s, 'birth', { actors: ['bran_stark', 'catelyn_stark'], houses: ['stark'], place: 'stark', importance: 2, data: { mother: 'catelyn_stark', father: 'robert_baratheon', posthumous: true, sex: 'm' }, text: 'x' });
  assert.equal(cardOf(s, storyOf(s)).summary, 'A son of the late King Robert and Catelyn Stark.');
});

test('N-030: a castle that has fallen is not also "shut in"', () => {
  const s = world('stark'); today(s); const hold = Object.values(s.holdings).find((h) => h.owner === 'tully' && h.name);
  emit(s, 'siege_begun', { actors: [], houses: ['lannister'], place: hold.id, importance: 3, data: { by: 'lannister', holding: hold.id }, text: 'x' });
  emit(s, 'holding_fell', { actors: [], houses: ['lannister'], place: hold.id, importance: 4, data: { by: 'lannister', holding: hold.id }, text: 'x' });
  const st = clusterFacts(s, s.facts).stories.find((x) => x.facts.length === 2) || { facts: s.facts };
  const card = cardOf(s, st); assert.doesNotMatch(card.summary, /shut in/, `${card.headline} / ${card.summary}`);
});

test('N-033: the realm\'s ambient feasts and name-day tourneys read the house\'s speaker: a child lord at home does not hold them while his regent marches', async () => {
  const { worldTick } = await import('../public/js/shared/plots.js');
  const holds = (s, rounds) => { let n = 0; for (let i = 0; i < rounds; i++) n += withRng(s, () => worldTick(s, 30)).events.filter((e) => /calls a tourney for a name-day|feasts .* for a fortnight/.test(`${e.title || ''} ${e.text || ''}`)).length; return n; };
  const prep = (regentAway) => {
    const s = world('stark', 13); s.wars = [];
    for (const h of Object.values(s.houses)) if (h.lord && s.characters[h.lord]) s.characters[h.lord].loc = h.id === 'arryn' ? s.houses.arryn.seat : 'party:nowhere';
    const lysa = s.characters.lysa_arryn; s.houses.arryn.regent = lysa.id; lysa.loc = regentAway ? 'party:nowhere' : s.houses.arryn.seat; s.houses.arryn.lord && (s.characters[s.houses.arryn.lord].age = 8);
    return s;
  };
  assert.ok(holds(prep(false), 120) >= 1, 'with the regent at the Eyrie the Vale holds its feasts and its name-day lists');
  assert.equal(holds(prep(true), 120), 0, 'with her on the road with the host, no one holds them');
});

test('N-034: the Trident beat names Joffrey as he is: a prince while his father lives, the King when he has died', async () => {
  const { THREADS } = await import('../public/data/beats.js');
  const stage = THREADS.find((t) => t.id === 'kings_ride').stages.find((x) => x.id === 'trident');
  const s = world('stark'); let r = stage.fire(s); const text = (x) => `${x.events[0].title} ${x.events[0].text} ${x.events[0].head || ''} ${JSON.stringify(x.events[0])}`;
  assert.match(text(r), /Prince Joffrey/); assert.doesNotMatch(text(r), /King Joffrey/);
  applyChanges(s, [{ op: 'character', id: 'joffrey_baratheon', title: 'King of the Andals and the First Men' }]);
  r = stage.fire(s); assert.match(text(r), /King Joffrey/); assert.doesNotMatch(text(r), /Prince Joffrey/);
});

test('N-035: "about a day on the road", not "1 days"; a party of a man whose name ends in s is "Boggs\' party"', () => {
  const s = world('stark'); today(s); s.facts = [];
  emit(s, 'set_out', { actors: ['robb_stark'], houses: ['stark'], place: 'stark', importance: 2, data: { days: 1, to: 'tully', party: 'nowhere' }, text: 'x' });
  const card = cardOf(s, storyOf(s)); assert.ok(card.details.every((d) => !/\b1 days\b/.test(d)), JSON.stringify(card.details));
  assert.ok(card.details.some((d) => /about a day on the road/.test(d)), JSON.stringify(card.details));
});

test('N-036: the banners the Crown calls do not join the King\'s progress, which is his court and never gives battle', async () => {
  const { gatherMusters } = await import('../public/js/shared/vassals.js');
  const s = world('lannister');
  applyChanges(s, [{ op: 'army_create', id: 'royal_progress', owner: 'baratheon', name: 'The King\'s progress', at: 'baratheon', men: 1400, commander: null },
    { op: 'army_create', id: 'stormlords', owner: 'baratheon_ds', name: 'The Dragonstone host', at: 'baratheon', men: 800, commander: null }]);
  s.parties.royal_progress.kind = 'progress'; // (as the story makes it: engine/world/beats.js, kings_ride)
  const lords = s.parties.stormlords; lords.serving = 'baratheon'; lords.arriveDay = 1;
  const v = s.houses.baratheon_ds; v.obligations = { muster: 'baratheon', call: { men: 800 } };
  assert.equal(s.parties.royal_progress.kind, 'progress');
  withRng(s, () => gatherMusters(s));
  assert.equal(s.parties.royal_progress.men, 1400, 'the court is as it was');
  assert.ok(Object.values(s.parties).some((p) => p.owner === 'baratheon' && p.kind === 'host' && p.men >= 800), 'the Crown\'s banners are a host of their own');
});

test('N-037: the banners raised at a seat while the first host is away are a second host, and the first is not overwritten with its men and its people', async () => {
  const { gatherMusters } = await import('../public/js/shared/vassals.js');
  const s = world('lannister');
  applyChanges(s, [{ op: 'army_create', id: 'tully_banners_tully', owner: 'tully', name: 'The Banners of Tully', at: 'tully', men: 6000, commander: 'edmure_tully' },
    { op: 'army_create', id: 'late_comers', owner: 'blackwood', name: 'The Blackwood host', at: 'tully', men: 700, commander: null }]);
  const first = s.parties.tully_banners_tully; first.at = 'lannister'; first.pos = [...s.holdings.lannister.pos]; delete first.march; // the banners have marched and are camped at Casterly Rock; the seat has none
  const edmure = s.characters.edmure_tully; assert.equal(partyOf(s, edmure)?.id, 'tully_banners_tully');
  const late = s.parties.late_comers; late.serving = 'tully'; late.arriveDay = 1; s.houses.blackwood.obligations = { muster: 'tully', call: { men: 700 } };
  withRng(s, () => gatherMusters(s));
  assert.equal(s.parties.tully_banners_tully.men, 6000, 'the first host stands, with its men');
  assert.equal(partyOf(s, edmure)?.id, 'tully_banners_tully', 'and its people are listed in it');
  assert.ok((s.parties.tully_banners_tully.members || []).includes('edmure_tully'));
  assert.ok(Object.values(s.parties).some((p) => p.id !== 'tully_banners_tully' && p.owner === 'tully' && p.men >= 700), 'the late comers are a host of their own');
});

test('N-038: a house whose lord the story needs elsewhere calls no feast or lists for him to leave', async () => {
  const { storyNeeds } = await import('../public/js/engine/actions/court.js');
  const s = world('lannister');
  assert.equal(storyNeeds(s, 'baratheon')?.code, 'story', 'the King is on the road to Winterfell by the story');
  assert.equal(storyNeeds(s, 'lannister'), null, 'the player\'s own house is its own'); assert.equal(storyNeeds(s, 'greyjoy'), null, 'a lord the story has no use for is free');
  s.meta.settings = { ...(s.meta.settings || {}), canonGravity: 'sandbox' }; assert.equal(storyNeeds(s, 'baratheon'), null, 'and in a sandbox the story needs no one');
});

test('N-039: "1 ship founders", "A winter gale", not "1 ships founder" and "An winter gale"', () => {
  const s = world('stark'); today(s); s.facts = [];
  emit(s, 'lost_at_sea', { actors: [], houses: ['greyjoy'], place: 'greyjoy', importance: 3, data: { ships: 1, drowned: 60 }, text: 'x' });
  const card = cardOf(s, { facts: [s.facts[0]] }); assert.ok(card.details.some((d) => /\b1 ship lost\b/.test(d)), JSON.stringify(card.details)); assert.ok(card.details.every((d) => !/\b1 ships\b/.test(d)));
});

test('N-040: a good harvest or a blight in the realm is told as that, not as "Rumour spreads at …"', () => {
  for (const harvest of ['good', 'blight']) {
    const s = world('stark'); today(s); s.facts = [];
    emit(s, 'happening', { actors: [], houses: ['stark'], place: 'stark', importance: 2, data: { harvest }, text: 'x' });
    const st = storyOf(s); const card = cardOf(s, st);
    assert.doesNotMatch(`${card.headline} ${card.summary}`, /Rumour|only talk/, harvest); assert.match(card.headline, harvest === 'good' ? /harvest/i : /Blight/);
    assert.ok(scoreCard({ headline: card.headline, summary: card.summary }, st, s).pass, `${harvest}: ${card.headline}`);
  }
});

test('N-041: "guards Tristan Deddings\' seat": a regent\'s ward whose name ends in s has the possessive of the language', () => {
  const s = world('stark'); today(s);
  for (let pin = 0; pin < 2; pin++) {
    s.facts = []; emit(s, 'regency_begun', { actors: ['catelyn_stark', 'tristan_mooton'].filter((id) => s.characters[id]).length === 2 ? ['catelyn_stark', 'tristan_mooton'] : ['catelyn_stark', 'roose_bolton'], houses: ['stark'], place: 'stark', importance: 2, data: { why: 'captive' }, text: 'x' });
    const h = cardOf(s, { facts: [s.facts[0]] }, { pin }).headline; assert.doesNotMatch(h, /s's seat/, h);
  }
  s.characters.roose_bolton.name = 'Roose Boltons'; s.facts = []; emit(s, 'regency_begun', { actors: ['catelyn_stark', 'roose_bolton'], houses: ['stark'], place: 'stark', importance: 2, data: {}, text: 'x' });
  const t = cardOf(s, { facts: [s.facts[0]] }, { pin: 1 }).headline; assert.match(t, /Boltons' seat/, t);
});

test('N-042: a fleet that sets out has no commander who is riding with another party', async () => {
  const { boardCommanders } = await import('../public/js/engine/parties.js');
  const s = world('lannister'); const seat = s.holdings.greyjoy;
  applyChanges(s, [{ op: 'army_create', id: 'sea_wolves', owner: 'greyjoy', name: 'Sea Wolves', at: 'greyjoy', men: 600, commander: 'victarion_greyjoy', kind: 'fleet' }, { op: 'army_create', id: 'his_riders', owner: 'greyjoy', name: 'His riders', at: 'greyjoy', men: 20, commander: null }]);
  const victarion = s.characters.victarion_greyjoy; setLoc(s, victarion, 'greyjoy'); setLoc(s, victarion, 'party:his_riders'); // the fleet is in harbour, its captain in the hall: he rides off with his own company ...
  assert.equal(s.parties.sea_wolves.commander, 'victarion_greyjoy', 'the fleet was in harbour: nothing yet says he has left it');
  const fleet = s.parties.sea_wolves; fleet.at = null; fleet.pos = [seat.pos[0] + 3, seat.pos[1]]; fleet.march = { to: 'flint_finger', since: 1 }; // ... and the fleet sails
  boardCommanders(s); assert.equal(fleet.commander, null); assert.equal(partyOf(s, victarion)?.id, 'his_riders');
});

test('N-043: a call to the banners gathers to a host that fights, not to the King\'s progress at the seat', async () => {
  const { fieldHostAt } = await import('../public/js/engine/actions/military.js');
  const s = world('lannister');
  applyChanges(s, [{ op: 'army_create', id: 'royal_progress', owner: 'baratheon', name: 'The King\'s progress', at: 'baratheon', men: 1400, commander: null }]);
  s.parties.royal_progress.kind = 'progress';
  assert.equal(fieldHostAt(s, 'baratheon', 'baratheon'), undefined, 'the court at King\'s Landing is no host to muster to');
  applyChanges(s, [{ op: 'army_create', id: 'gold_host', owner: 'baratheon', name: 'The Crown\'s host', at: 'baratheon', men: 900, commander: null }]);
  assert.equal(fieldHostAt(s, 'baratheon', 'baratheon')?.id, 'gold_host');
});

test('N-044: only a host in the field or a fleet is "on campaign" for the mind: not a garrison\'s captain, nor the court on the King\'s progress', async () => {
  const { stressors } = await import('../public/js/shared/psyche.js');
  const s = world('stark'); const why = (id) => stressors(s, s.characters[id], 30).map((x) => x.why);
  const guard = Object.values(s.parties).find((p) => p.kind === 'garrison' && p.commander && s.characters[p.commander]); assert.ok(guard, 'a garrison with a captain');
  assert.ok(!why(guard.commander).includes('on campaign'), `${s.characters[guard.commander].name}, captain of a castle's garrison`);
  applyChanges(s, [{ op: 'army_create', id: 'royal_progress', owner: 'baratheon', name: 'The King\'s progress', at: 'baratheon', men: 1400, commander: 'robert_baratheon' }]);
  s.parties.royal_progress.kind = 'progress'; setLoc(s, s.characters.tommen_baratheon, 'party:royal_progress');
  assert.ok(!why('tommen_baratheon').includes('on campaign'), 'a child in the court on the road');
  applyChanges(s, [{ op: 'army_create', id: 'field_host', owner: 'stark', name: 'The field host', at: 'stark', men: 5000, commander: 'robb_stark' }]);
  assert.ok(why('robb_stark').includes('on campaign'), 'a host in the field is a campaign');
});

test('N-045: the lists wait for their host: put off a week at a time while he is away, run when he is home, dropped after two moons', async () => {
  const { scheduleLists, listsTick, POSTPONE_DAYS, POSTPONE_MAX } = await import('../public/js/shared/tourney.js');
  const s = world('lannister'); today(s); const seat = s.houses.tully.seat; const lord = s.characters[s.houses.tully.lord];
  scheduleLists(s, seat, 'tully'); const on = s.plots.lists[seat].on; const run = (d) => { s.meta.date = { ...s.meta.date, ...dateOfDay(d) }; s.meta.clock = { turn: 1, from: d, to: d }; listsTick(s); };
  applyChanges(s, [{ op: 'army_create', id: 'riders_x', owner: 'tully', name: 'Riders', at: null, men: 10, commander: lord.id }]); // the lord has ridden out with his own
  const away = s.parties.riders_x; away.at = null; away.pos = [0, 0]; setLoc(s, lord, 'party:riders_x');
  run(on); assert.ok(s.plots.lists[seat], 'his lists are still to be run'); assert.equal(s.plots.lists[seat].on, on + POSTPONE_DAYS, 'a week later');
  setLoc(s, lord, seat); run(on + POSTPONE_DAYS); assert.equal(s.plots.lists[seat], undefined, 'home, he has them run');
  scheduleLists(s, seat, 'tully'); setLoc(s, lord, 'party:riders_x'); let d = s.plots.lists[seat].on;
  for (let i = 0; i <= POSTPONE_MAX; i++) { run(d); d += POSTPONE_DAYS; }
  assert.equal(s.plots.lists[seat], undefined, 'two moons of his absence and there are no lists');
});

test('N-046: a lord who is on a ride of his own does not step from the road into the host that gathers at his seat', async () => {
  const { answer } = await import('../public/js/engine/military/muster.js');
  const s = world('stark', 4); const v = s.houses.blackwood; const lord = s.characters[v.lord];
  s.parties.lord_ride = { id: 'lord_ride', kind: 'rider', owner: 'blackwood', name: 'Ride', commander: lord.id, at: null, pos: [0, 0], men: 0, members: [], morale: 70, supply: 80 };
  setLoc(s, lord, 'party:lord_ride'); assert.equal(partyOf(s, lord)?.id, 'lord_ride');
  withRng(s, () => answer(s, v, {}));
  assert.equal(partyOf(s, lord)?.id, 'lord_ride', 'he is still on his road');
  const host = Object.values(s.parties).find((p) => p.owner === 'blackwood' && p.kind === 'host'); assert.ok(host, 'the house\'s host gathers at its seat all the same');
  assert.notEqual(host.commander, lord.id, 'under another, or under none, while he is away');
  setLoc(s, lord, v.seat); // home, the lord leads it
  const t = world('stark', 4); const w = t.houses.blackwood; withRng(t, () => answer(t, w, {})); assert.equal(Object.values(t.parties).find((p) => p.owner === 'blackwood' && p.kind === 'host').commander, w.lord, 'at home, he commands his own host');
});

test('N-047: a neighbour riding to pay his respects is a card of the court, not of war; a host marching against a foe still is', () => {
  const s = world('stark'); today(s); s.facts = [];
  emit(s, 'set_out', { actors: ['rodrik_cassel'], houses: ['stark'], place: 'stark', importance: 3, data: { party: 'p1', to: 'stark', why: 'to pay his respects to Eddard Stark at Winterfell' }, text: 'x' });
  assert.equal(clusterFacts(s, s.facts).stories[0].type, 'court');
  s.facts = []; emit(s, 'set_out', { actors: ['rodrik_cassel'], houses: ['stark'], place: 'stark', importance: 3, data: { party: 'p2', to: 'stark', against: 'p3' }, text: 'x' });
  assert.equal(clusterFacts(s, s.facts).stories[0].type, 'war');
});

test('N-048: the cards the writer makes of the calendar, a strained lord and the floating market pass the scorer the soak holds every card to', async () => {
  const { CALENDAR, COURTS } = await import('../public/data/calendar.js');
  for (const c of [...CALENDAR, ...COURTS]) {
    const s = world('stark'); today(s); s.facts = [];
    const where = Object.keys(s.holdings).includes(c.where) ? c.where : 'baratheon';
    fact(s, 'happening', { title: c.title, text: c.text, where, importance: 1, houses: [s.holdings[where].owner] }, { data: { head: c.head || c.title, sum: c.text } });
    const f = s.facts.at(-1); const st = { facts: [f], actors: [], houses: f.houses, place: where, days: [1, 1], importance: 1 }; const card = cardOf(s, st);
    const r = scoreCard({ headline: card.headline, summary: card.summary }, st, s); assert.ok(r.pass, `${c.title}: "${card.headline}" ${JSON.stringify(r.detail)}`);
  }
  for (const pin of [0, 1]) {
    const s = world('stark'); today(s); s.facts = []; emit(s, 'behaviour', { actors: ['eddard_stark'], houses: ['stark'], place: 'stark', importance: 3, data: { band: 'strained' }, text: 'x' });
    const st = storyOf(s); const card = cardOf(s, st, { pin }); assert.ok(scoreCard({ headline: card.headline, summary: card.summary }, st, s).pass, card.headline);
  }
  const s = world('stark'); today(s); s.facts = []; emit(s, 'happening', { actors: [], houses: ['stark'], place: 'stark', importance: 2, data: { tpl: 'd_rhoyne' }, text: 'x' });
  for (const pin of [0, 1]) { const st = storyOf(s); const card = cardOf(s, st, { pin }); assert.ok(scoreCard({ headline: card.headline, summary: card.summary }, st, s).pass, card.headline); }
});

test('N-049: a call forgets the host that is gone, so the next host given its name is not taken for it', async () => {
  const { tidyObligations } = await import('../public/js/engine/parties.js');
  const s = world('lannister'); const v = s.houses.blackwood;
  applyChanges(s, [{ op: 'army_create', id: 'host_of_house_blackwood', owner: 'blackwood', name: 'Host of House Blackwood', at: 'blackwood', men: 500, commander: null }]);
  v.obligations = { muster: 'tully', host: 'host_of_house_blackwood', join: 'tully_banners_tully' };
  tidyObligations(s); assert.equal(v.obligations.host, 'host_of_house_blackwood', 'a host that is there is remembered'); assert.equal(v.obligations.join, null, 'one that was never there is not');
  delete s.parties.host_of_house_blackwood; tidyObligations(s);
  assert.equal(v.obligations.host, undefined, 'a host that is gone is forgotten'); assert.equal(v.obligations.muster, 'tully', 'and the rest of the call stands');
});

test('N-050: a running fight is told over "a fortnight", not "fourteen days" (a number the slots do not hold)', () => {
  const s = world('stark'); const day = dayNumber(s.meta.date); s.meta.clock = { turn: 1, from: day, to: day + 29 };
  for (const on of [1, 3, 5, 7, 9, 11, 13]) emit(s, 'battle', { actors: [], houses: ['lannister', 'tully'], place: Object.values(s.holdings).find((h) => h.owner === 'tully').id, importance: 4, on, text: 'x', data: { attacker: 'a', defender: 'b', winner: 'a', loser: 'b', winnerHouse: 'lannister', loserHouse: 'tully', lost: { a: 100, b: 300 } } });
  const st = clusterFacts(s, s.facts).stories.find((x) => x.facts.length === 7); assert.ok(st, 'one story of thirteen days of fighting, a battle every other day');
  const card = cardOf(s, st); assert.match(card.summary, /^Seven battles in a fortnight\./, card.summary);
});

test('N-051: a company hired where there is no host is settled at once, with a state, as every other party is', () => {
  const s = world('stark', 3); const t = s.houses.moreland || s.houses.stark; const hid = t.id; const place = t.seat;
  t.figures.treasury = { ...(t.figures.treasury || {}), v: 1e6 }; for (const p of Object.values(s.parties)) if (p.owner === hid) delete s.parties[p.id];
  withRng(s, () => applyChanges(s, [{ op: 'recruit', house: hid, at: place, men: 100 }]));
  const co = Object.values(s.parties).find((p) => p.owner === hid && /company/.test(p.name)); assert.ok(co, 'the company is made');
  assert.ok(typeof co.state === 'string' && co.state.length, `it has a state (${co.state})`);
});

test('N-052: a verb refuses in words a parameter of the wrong shape: one host named in a word for merge_hosts is a list of one', () => {
  const s = world('stark');
  applyChanges(s, [{ op: 'army_create', id: 'h1', owner: 'stark', name: 'H1', at: 'stark', men: 500, commander: null }, { op: 'army_create', id: 'h2', owner: 'stark', name: 'H2', at: 'stark', men: 300, commander: null }]);
  for (const armies of ['h1', ['h1', 'h2'], '', null, 7]) {
    assert.doesNotThrow(() => check(s, intentFor(s, 'merge_hosts', { house: 'stark', params: { armies }, source: { type: 'intent', ref: 'robb_stark', by: 'mock' } })), JSON.stringify(armies));
  }
});

test('N-053: the muster receipt says what the first men are made of straight after the men, not after the ones still on the road', () => {
  const s = world('stark', 3); s.houses.stark.figures.levies = { ...(s.houses.stark.figures.levies || {}), v: 9000 };
  const r = withRng(s, () => raiseLevies(s, { house: 'stark', at: 'stark', men: 9000, immediate: false }));
  const line = r.lines.find((l) => /levies muster at/.test(l)); assert.ok(line, r.lines.join(' | '));
  assert.match(line, /^[\d,]+ levies muster at Winterfell as [^;(]+ \([^)]*(?:foot|archers|riders|knights)[^)]*\); [\d,]+ more are mustering from the fields$/, line);
});

test('N-054: a regent who is seized or dies gives up the seal: another takes it, and a prisoner never speaks for the house', () => {
  const s = world('stark', 3); const h = s.houses.stark; s.characters.eddard_stark.status = 'imprisoned';
  regencyTick(s, 30); const first = h.regent; assert.ok(first, 'a regent is named for the lord in the cells');
  s.characters[first].status = 'imprisoned'; assert.notEqual(speakerFor(s, 'stark')?.id, first, 'a prisoner is not the one who speaks, even before the tick');
  regencyTick(s, 30); assert.ok(h.regent && h.regent !== first && s.characters[h.regent].alive && !/imprison|captive/.test(s.characters[h.regent].status || ''), `another, free, takes the seal (${h.regent})`);
  const second = h.regent; s.characters[second].alive = false;
  regencyTick(s, 30); assert.ok(!h.regent || (h.regent !== second && s.characters[h.regent].alive), 'a dead regent is not kept as the regent');
});

test('N-055: the first turn of a real game tells no one "takes the regency" for a boy the tale starts with (ST10 was tested with a turn counter at 0 that the game does not have)', async () => {
  const { id } = game.newGame('agot_298', 'stark', { seed: 3 });
  const r = await game.advance(id, { span: '1d' }); await game.settled(id);
  assert.deepEqual((r.turn.events || []).map((e) => e.headline).filter((h) => /regency/i.test(h)), [], 'no card of a regency in the first turn');
  const s = game.loadState(id); assert.ok(s.houses.dayne.regent, 'and the boy\'s regent rules');
  assert.ok(!game.readFacts(id, {}).some((f) => f.kind === 'regency_begun'), 'and no fact of one begun');
});

test('N-056: the realm\'s ambient feast between lords seats the guest house\'s envoys, not its lord (a child at the Eyrie was "feasted for a fortnight" at Winterfell, a month\'s ride from his hall)', async () => {
  const { worldTick } = await import('../public/js/shared/plots.js');
  const s = world('stark', 11); let ev = null;
  for (let i = 0; i < 80 && !ev; i++) ev = withRng(s, () => worldTick(s, 30)).events.find((e) => /for a fortnight/.test(e.text || ''));
  assert.ok(ev, 'the realm feasts'); const f = s.facts.find((x) => x.id === ev.fact); assert.equal(f.kind, 'feast'); assert.equal(f.actors.length, 1, 'one lord, the host'); assert.ok(f.data.envoys, 'and the guest house sends envoys'); assert.match(ev.text, /feasts the envoys of House \w/);
  const t = world('stark', 5); t.facts = []; const day = dayNumber(t.meta.date); t.meta.clock = { turn: 1, from: day, to: day };
  emit(t, 'feast', { actors: [t.houses.tully.lord], houses: ['tully', 'frey'], place: 'tully', importance: 3, text: 'x', data: { envoys: 'frey' } });
  const card = cardOf(t, clusterFacts(t, t.facts).stories[0]); assert.match(card.summary, /^Envoys of House Frey sit at the table\.?$/, card.summary);
});

test('N-057: a party named for a man whose name ends in s is told by its own name ("Ardrian Sunglass\' party"), with no article', async () => {
  const { partyLabel } = await import('../public/js/engine/facts/label.js'); const s = world('stark');
  for (const name of ['Ardrian Sunglass\' party', 'Dagon Volmark\'s party', 'Sunglass\' party']) assert.equal(partyLabel(s, { name, owner: 'stark', kind: 'host' }), name);
});

test('N-058: "a great host" goes home (one thing, one verb), a score of men go home, and twenty men are not "a few dozen"', () => {
  const say = (men) => { const t = world('stark', 5); t.facts = []; const day = dayNumber(t.meta.date); t.meta.clock = { turn: 1, from: day, to: day };
    emit(t, 'host_disbanded', { actors: [t.houses.lannister.lord], houses: ['lannister'], place: 'lannister', importance: 3, text: 'x', data: { men } }); return cardOf(t, clusterFacts(t, t.facts).stories[0]).summary; };
  assert.match(say(12000), /^A great host goes home\./); assert.match(say(20), /^A score of men go home\./); assert.match(say(300), /^Hundreds of men go home\./);
});

test('N-059: the chief of a hill clan is not "Mya The Moon Brothers", and no generated lord is "Lord of The" anything', () => {
  const s = world('stark', 3);
  for (const id of ['burned_men', 'black_ears', 'moon_brothers', 'painted_dogs', 'thenns']) { const c = s.characters[s.houses[id].lord]; assert.doesNotMatch(c.name, /\bThe\b/, c.name); assert.match(c.title, /^(Lord|Lady) of the /, c.title); }
  assert.doesNotMatch(Object.values(s.characters).map((c) => c.title || '').join('\n'), /\b(Lord|Lady) of The /);
});

test('N-060: Hoster Tully, "bedridden and dying", rides to no tourney and is sent nowhere; when he dies Edmure is lord and no longer "Heir to Riverrun"', async () => {
  const { retinueTick } = await import('../public/js/shared/retinues.js');
  const led = new Set(); const day = dayNumber(world('stark', 7).meta.date);
  for (let seed = 1; seed <= 4; seed++) {
    const s = world('stark', 7); s.meta.rngState = seedState(seed); s.facts = [];
    withRng(s, () => { for (let d = 0; d < 60; d++) { s.meta.date = dateOfDay(day + d); s.meta.clock = { turn: 1, from: day + d, to: day + d }; retinueTick(s, 7); for (const [id, p] of Object.entries(s.parties)) if (p.kind === 'retinue') { led.add(p.commander); delete s.parties[id]; } } });
  }
  assert.ok(led.size >= 100, `a good many lords ride out (${led.size})`); assert.ok(!led.has('hoster_tully'), 'the bedridden lord leads no retinue');
  const t = world('stark', 7); const verdict = check(t, intentFor(t, 'send_person', { house: 'tully', params: { character: 'hoster_tully', to: 'baratheon' }, source: { type: 'intent', ref: 'hoster_tully', by: 'mock' } }));
  assert.equal(verdict?.code ?? verdict?.reason?.code, 'ailing', JSON.stringify(verdict));
  applyChanges(t, [{ op: 'character', id: 'hoster_tully', alive: false, cause: 'a long illness' }, { op: 'house', house: 'tully', lord: 'edmure_tully' }]);
  const e = t.characters.edmure_tully; assert.ok(!(e.roles || []).includes('heir') && (e.roles || []).includes('lord'), `Edmure's roles: ${e.roles}`); assert.match(e.title, /^Lord of /, e.title);
});

test('N-061: a card of a recovery or an illness has a second line, with the right pronoun, that the scorer passes; a royal loss is "The royal host lost", not "royal lost"', () => {
  for (const [who, re] of [['daenerys_targaryen', /^She is on her feet again\.?$/], ['robb_stark', /^He is on his feet again\.?$/]]) {
    const t = world('stark', 5); t.facts = []; const day = dayNumber(t.meta.date); t.meta.clock = { turn: 1, from: day, to: day };
    emit(t, 'recovered', { actors: [who], houses: [t.characters[who].house], place: t.characters[who].loc, importance: 3, text: 'x' });
    const st = clusterFacts(t, t.facts).stories[0]; const card = cardOf(t, st); assert.match(card.summary, re, card.summary);
    const r = scoreCard({ headline: card.headline, summary: card.summary }, st, t); assert.ok(r.pass, JSON.stringify(r.detail));
  }
  const t = world('stark', 5); t.facts = []; const day = dayNumber(t.meta.date); t.meta.clock = { turn: 1, from: day, to: day };
  emit(t, 'illness', { actors: ['daenerys_targaryen'], houses: ['targaryen'], place: 'targaryen', importance: 3, text: 'x', data: { why: 'strain' } });
  const card = cardOf(t, clusterFacts(t, t.facts).stories[0]); assert.match(card.summary, /told on her, and the rest she needs/, card.summary);
  const b = world('stark', 5); b.facts = []; b.meta.clock = { turn: 1, from: day, to: day };
  emit(b, 'battle', { actors: [], houses: ['baratheon', 'stark'], place: 'tully', importance: 4, text: 'x', data: { attacker: 'a', defender: 'b', winner: 'a', loser: 'b', winnerHouse: 'baratheon', loserHouse: 'stark', lost: { a: 100, b: 300 } } });
  const bc = cardOf(b, clusterFacts(b, b.facts).stories[0]); assert.match(bc.details.join(' '), /The royal host lost about/, bc.details.join(' | '));
});

test('N-062: no house is made its own vassal\'s vassal: a vassal or a prisoner does not demand your submission, and a liege who is bowed to ends the war (a loop made the House window and the prompts overflow the stack)', async () => {
  const { MATTERS } = await import('../public/data/matters.js'); const P = await import('../public/js/shared/petitions.js'); const { realmTotals } = await import('../public/js/shared/world.js');
  const s = world('stark', 5);
  applyChanges(s, [{ op: 'liege', house: 'stark', liege: 'bolton' }], { source: 'GM' }); assert.notEqual(s.houses.stark.liege, 'bolton', 'the op is refused: Bolton is sworn to Stark');
  assert.doesNotThrow(() => realmTotals(s, 'stark'));
  applyChanges(s, [{ op: 'war', status: 'start', name: 'The Defiance of House Bolton', attackers: ['stark'], defenders: ['bolton'] }]);
  assert.equal(MATTERS.demand_submission.raise({ ...P.matterContext(s), pick: (a) => a[0], shuffle: (a) => a }), null, 'a rebel vassal is not a liege to bow to');
  applyChanges(s, [{ op: 'war', status: 'start', name: 'The Lion\'s War', attackers: ['lannister'], defenders: ['stark'] }]);
  const m = MATTERS.demand_submission.raise({ ...P.matterContext(s), pick: (a) => a.find((h) => h.id === 'lannister') || a[0], shuffle: (a) => a });
  assert.ok(m && /Lannister/.test(m.title), m?.title); applyChanges(s, m.options[0].fx[0].ops, { source: 'GM' });
  assert.equal(s.houses.stark.liege, 'lannister'); assert.equal(s.wars.find((w) => /Lion/.test(w.name)).status, 'ended'); assert.doesNotThrow(() => realmTotals(s, 'stark'));
});

test('N-063: a loan the matters make is a loan in the economy\'s books (lending is lending, a bank\'s coin is owed), and an answer the treasury cannot pay is refused in words', async () => {
  const { applyPetitionFx } = await import('../public/js/shared/petitions.js'); const { MATTERS } = await import('../public/data/matters.js'); const P = await import('../public/js/shared/petitions.js');
  const s = world('stark', 5); const gold = (h) => s.houses[h].figures.treasury.v; const [a0, t0] = [gold('stark'), gold('tully')];
  applyPetitionFx(s, [{ lend: ['tully', 5000, 12] }]);
  const l = s.economy.loans.find((x) => x.lender === 'stark' && x.debtor === 'tully'); assert.ok(l && l.amount === 5000, 'Stark is the lender, Tully the debtor');
  assert.equal(gold('stark'), a0 - 5000); assert.equal(gold('tully'), t0 + 5000); assert.ok(!(s.houses.stark.loans || []).length, 'and nothing is written as a debt of Stark\'s own');
  const b0 = gold('stark'); applyPetitionFx(s, [{ borrow: ['iron_bank', 20000, 24] }]);
  assert.ok(s.economy.loans.some((x) => x.debtor === 'stark' && x.lender === 'iron_bank' && x.amount === 20000), 'a debt to the bank, in the books'); assert.equal(gold('stark'), b0 + 20000);
  assert.ok(!MATTERS.loan_request.raise({ ...P.matterContext(s), treasury: 100 }), 'no loan is asked of an empty treasury');
  const t = world('stark', 5); t.houses.stark.figures.treasury = { ...t.houses.stark.figures.treasury, v: 300 };
  applyChanges(t, [{ op: 'decision', matter: 'loan_request', title: 'A price', text: 't', from: 'robb_stark', options: [{ label: 'Buy him back', hint: '20,000', fx: [{ gold: -20000 }] }, { label: 'Wait', hint: '', fx: [] }], lapse: [] }]);
  const d = t.decisions.at(-1); const verdict = (option) => check(t, intentFor(t, 'answer_matter', { house: 'stark', params: { decision: d.id, option }, source: { type: 'intent', ref: 'eddard_stark', by: 'player' } }));
  assert.equal(verdict(0)?.code, 'gold', JSON.stringify(verdict(0))); assert.equal(verdict(1), null, 'an answer that costs nothing is free to give');
});

test('N-064: a quarrel between the lord\'s own house and a rival is told but not put to him to judge ("Stark-Stark +8"), and a matter is not raised in the name of a boy of six', async () => {
  const D = await import('../public/js/engine/director.js'); const P = await import('../public/js/shared/petitions.js');
  const s = world('stark', 5);
  const r = D.applyHook(s, 'mill_dispute', 'stark', { r: () => 0.3 }); assert.ok(r.cards.length, 'the card is told'); assert.equal(r.matter, null, 'but the lord is not asked to judge his own men');
  const vassal = Object.values(s.houses).find((h) => h.liege === 'stark' && h.lord); s.characters[vassal.lord].age = 6;
  let raised = 0; for (let i = 0; i < 80; i++) { s.plots = { ...(s.plots || {}), petitioned: {} }; const m = P.realmPetition(s); if (m?.from === vassal.lord) raised++; }
  assert.equal(raised, 0, 'no matter comes from the boy');
});

test('N-065: the silence line of a matter says what the story does without you (a man put to death), not "Nothing comes of it"', async () => {
  const M = await import('../public/js/ui/matters.js'); const s = world('stark', 5);
  const line = M.silenceOf(s, { options: [], lapse: [{ ops: [{ op: 'character', id: 'eddard_stark', alive: false }] }] });
  assert.match(line.line, /Eddard Stark will die/); assert.equal(line.tone, 'bad');
});
