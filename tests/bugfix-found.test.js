// What the second hunt found, playing the fixed game (docs/bughunt/FOUND.md, N-003 and up). Mock only.
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.WC_PROVIDER = 'mock';
const { createInitialState, applyChanges } = await import('../public/js/shared/world.js');
const { tollAlong } = await import('../public/js/shared/marches.js');
const { withRng } = await import('../public/js/engine/rng.js');
const { BRIEFS } = await import('../public/data/briefs.js');
const { setLoc } = await import('../public/js/engine/parties.js');
const { emit } = await import('../public/js/engine/facts/log.js');
const { clusterFacts } = await import('../public/js/engine/facts/cluster.js');
const { cardOf } = await import('../public/js/engine/facts/headline.js');
const { dateOfDay, dayNumber } = await import('../public/js/engine/time.js');
const { plural3 } = await import('../public/js/engine/facts/heads.js');
const { scoreCard } = await import('../server/ai/validate/headline.js');
const { fact } = await import('../public/js/engine/facts/log.js');
const { bandNews } = await import('../public/js/shared/psyche.js');
const { chokepointToll } = await import('../public/js/shared/chokepoints.js');
const { fits } = await import('../public/js/shared/happenings.js');
const { perform, check, intentFor } = await import('../public/js/engine/actions/registry.js');
const { partyOf } = await import('../public/js/engine/parties.js');
const { suitability, refusal } = await import('../public/js/engine/people/family.js');
const { HAPPENINGS } = await import('../public/data/happenings.js');

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
  assert.equal(bandNews(c, 'strained', 'weary', 9), true, 'told again after a few turns');
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
    fact(s, 'happening', { title: c.title, text: c.text, where, importance: 1, houses: [s.holdings[where].owner] }, { data: { head: c.title, sum: c.text } });
    const card = cardOf(s, { facts: [s.facts.at(-1)] }); // (a small fact is a card of its own: the clusterer tells only the news)
    assert.equal(card.headline, c.title.replace(/^./, (x) => x.toUpperCase()).replace(/[.;,\s]+$/, '')); assert.ok(card.summary.startsWith(c.text.slice(0, 30)), card.summary);
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
  // two different pairs on the same days are not one fight
  s.facts = []; fight(1); fight(2); fight(1, {}, ['wolves', 'ravens']); fight(2, {}, ['wolves', 'ravens']);
  for (const st of clusterFacts(s, s.facts).stories) assert.doesNotMatch(cardOf(s, st).summary, /^\w+ battles in /, 'two pairs of hosts are not one running fight');
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
  const s = world('lannister'); const v = s.houses.tully; const lord = s.characters[v.lord];
  const send = (to) => check(s, intentFor(s, 'send_person', { house: 'tully', params: { character: lord.id, to }, source: { type: 'intent', ref: lord.id, by: 'mock' } }));
  assert.equal(send('lannister'), null, 'free to go before he calls a tourney');
  s.plots = s.plots || {}; s.plots.lists = { [v.seat]: { house: 'tully', called: dayNumber(s.meta.date), on: dayNumber(s.meta.date) + 21 } };
  assert.equal(send('lannister')?.code, 'hosting', 'not while his lists are to be run');
  assert.notEqual(send(v.seat)?.code, 'hosting', 'and his own seat is no leaving'); s.meta.player = 'tully';
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
