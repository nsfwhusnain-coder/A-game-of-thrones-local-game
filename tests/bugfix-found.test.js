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
