// What the order reader got wrong in the bug hunt of 2 October 2026 (docs/BUG-HUNT-2026-10-02.md, OR1 to OR11). Every phrase
// here is one the report quotes; the rule reader (server/orders/parse.js) is shared by every model, so these are read by rule
// alone: no model, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, applyChanges } from '../public/js/shared/world.js';
import { withRng } from '../public/js/engine/rng.js';
import { parseOrder, numbersIn, menIn } from '../server/orders/parse.js';
import { carryOut, answerOrder } from '../server/orders.js';
import { perform } from '../public/js/engine/actions/registry.js';
import { heirOf } from '../public/js/shared/people.js';

const world = (house = 'stark', setup = []) => { const s = createInitialState('agot_298', house, { seed: 298 }); withRng(s, () => applyChanges(s, setup)); return s; };
const withHost = () => world('stark', [{ op: 'army_create', id: 'host_of_winterfell', owner: 'stark', name: 'The Host of Winterfell', at: 'stark', men: 4000, commander: 'robb_stark' }, { op: 'character', id: 'robb_stark', with: 'host_of_winterfell' }]);
const read = (s, text, o) => parseOrder(s, text, o);
const verbs = (p) => p.actions.map((a) => a.verb);

test('OR1: "the Wall" is where men are sent, never walls to build', () => {
  const s = withHost();
  const levy = read(s, 'Raise 200 men at Winterfell and send them to the Wall');
  assert.deepEqual(levy.actions.map((a) => [a.verb, a.params]), [['raise_levies', { at: 'stark', men: 200, to: 'nights_watch' }]], 'the levy is raised and sent: no gold goes on walls');
  assert.ok(levy.complete);
  assert.deepEqual(verbs(read(s, 'Raise 500 men and send them to the Wall.')), ['raise_levies']);
  assert.deepEqual(verbs(read(s, 'Send Jon Snow to the Wall.')), ['send_person']);
  assert.deepEqual(verbs(read(s, 'Send them to the Wall.')), ['march_host']);
  for (const t of ['Send 100 men to the wall', 'Send 100 men to guard the wall', 'Raise 100 men and march them to the Wall', 'Take the host to the Wall', 'Reinforce the Wall with fifty spears']) assert.ok(!verbs(read(s, t)).includes('fund_works'), `${t}: no works`);
});

test('OR1: walls at a castle are still walls', () => {
  const s = withHost();
  for (const t of ['Strengthen the walls at Winterfell.', 'Build walls at Winterfell', 'Build a wall at Winterfell', 'Raise the walls at Winterfell']) {
    const p = read(s, t);
    assert.deepEqual(p.actions.map((a) => [a.verb, a.params.template, a.params.holding]), [['fund_works', 'walls', 'stark']], t);
  }
});

const acts = (p) => p.actions.map((a) => [a.verb, a.params]);
const carry = (s, text, o = {}) => { const w = structuredClone(s); const ord = { id: 'o1', text, ...o }; ord.parsed = parseOrder(w, text); return { w, ord, r: withRng(w, () => carryOut(w, ord)) }; };

test('OR2: a summons to a council is a raven to the lords named, never a call to arms; "to arms" still is one', () => {
  const s = withHost();
  const p = read(s, 'Summon Lord Bolton and Lord Umber to a council at Winterfell');
  assert.deepEqual(p.actions, []); assert.equal(p.letter.to, 'roose_bolton'); assert.deepEqual(p.letter.also, ['greatjon_umber']); assert.ok(p.complete);
  const { r } = carry(s, 'Summon Lord Bolton and Lord Umber to a council at Winterfell');
  assert.equal(r.lines.filter((l) => /raven flies/.test(l.text)).length, 2, 'one raven to each');
  assert.deepEqual(verbs(read(s, 'Summon Lord Bolton and Lord Umber to arms at Winterfell')), ['call_banners']);
  assert.deepEqual(verbs(read(s, 'Call the banners')), ['call_banners']);
});

test('OR3: nought and below are questions, "a hundred thousand" is a hundred thousand, money is not men, and more men than the lands have is said', () => {
  const s = withHost();
  assert.deepEqual(numbersIn('a hundred thousand men').map((x) => x.n), [100000]); assert.deepEqual(numbersIn('a hundred men').map((x) => x.n), [100]); assert.deepEqual(numbersIn('raise -5 men').map((x) => x.n), [-5]);
  assert.deepEqual(menIn('hire sellswords with 5 gold'), []); assert.deepEqual(menIn('hire 300 men with 5,000 gold'), [300]); assert.deepEqual(menIn('send two thousand dragons to Tywin'), []);
  for (const t of ['Raise 0 men', 'Raise -5 men at Winterfell', 'Hire sellswords with 5 gold']) { const p = read(s, t); assert.deepEqual(p.actions, [], t); assert.match(p.clarify.question, /How many men/, t); assert.equal(p.clarify.options.length, 3, t); }
  assert.equal(read(s, 'Raise a hundred thousand men').actions[0].params.men, 100000);
  assert.deepEqual(acts(read(s, 'Hire 300 men with 5,000 gold')), [['hire_men', { at: 'stark', men: 300, kind: 'men-at-arms' }]]);
  const w = structuredClone(s); const r = withRng(w, () => perform(w, 'raise_levies', { house: 'stark', params: { at: 'stark', men: 99999999 }, source: { type: 'order', ref: 'o' } }));
  assert.ok(r.ok); assert.ok(r.receipt.some((l) => l.ok === 'warn' && /You asked for 99,999,999; your lands could give/.test(l.text)), JSON.stringify(r.receipt));
});

test('OR4: "my son Bran" is Bran alone; "my ward\'s captain" is not the ward; "my sons" are still all of them', () => {
  const s = withHost();
  assert.deepEqual(acts(read(s, 'Send my son Bran to foster at the Eyrie')).map(([v, p]) => [v, p.character]), [['send_person', 'bran_stark']]);
  assert.deepEqual(acts(read(s, "Make Theon my ward's captain")).map(([v, p]) => [v, p.character, p.role]), [['appoint_office', 'theon_greyjoy', 'captain']]);
  assert.ok(acts(read(s, 'Send my sons to Riverrun')).length >= 3);
});

test('OR5: "Robert" is asked about, with the Roberts to choose from, and the answer is the name in the order; war on one\'s own house is refused in words; no question is left with no answers', () => {
  const s = withHost();
  const p = read(s, 'Send 100000 dragons to Robert'); assert.match(p.clarify.question, /Which Robert/); const names = p.clarify.options.map((o) => o.label);
  assert.ok(names.includes('Robert Baratheon') && names.includes('Robert Arryn'), names.join(', ')); assert.equal(p.clarify.options[0].replace[0], 'robert');
  const o = { id: 'o1', text: 'Send 100000 dragons to Robert', parsed: p }; assert.ok(answerOrder(o, names.indexOf('Robert Baratheon')));
  assert.equal(o.text, 'Send 100000 dragons to Robert Baratheon'); assert.deepEqual(acts(read(s, o.text)), [['send_gift', { to: 'robert_baratheon', gold: 100000 }]]);
  const war = read(s, 'Declare war on House Stark'); assert.deepEqual(acts(war), [['declare_war', { house: 'stark', reason: '' }]]);
  const w = structuredClone(s); const r = perform(w, 'declare_war', { house: 'stark', params: { house: 'stark' }, source: { type: 'order', ref: 'o' } }); assert.equal(r.ok, false); assert.match(r.refusal.text, /does not declare war on itself/);
  assert.ok(read(s, 'I will ride south myself with my daughters').clarify.options.length >= 2, 'a question about where has places to pick');
});

test('OR6: the lord can be told to travel, and takes with him those he names', () => {
  const s = withHost();
  assert.deepEqual(acts(read(s, "Go to King's Landing")), [['send_person', { character: 'eddard_stark', to: 'baratheon', men: 0 }]]);
  assert.deepEqual(acts(read(s, 'Travel to Dragonstone')).map(([v, p]) => [v, p.character]), [['send_person', 'eddard_stark']]);
  const q = read(s, "I will ride to King's Landing myself with my daughters"); const a = q.actions[0];
  assert.equal(a.verb, 'send_person'); assert.equal(a.params.character, 'eddard_stark'); assert.deepEqual([...a.params.companions].sort(), ['arya_stark', 'sansa_stark']);
  // a host marches; a man named is the man who goes
  assert.deepEqual(verbs(read(s, 'March to Riverrun')), ['march_host']); assert.equal(read(s, 'Send Jory Cassel to Riverrun').actions[0].params.character, 'jory_cassel');
  const w = structuredClone(s); const r = withRng(w, () => perform(w, 'send_person', { house: 'stark', params: a.params, source: { type: 'order', ref: 'o' } })); assert.ok(r.ok, r.refusal?.text);
});

test('OR7: fortify is walls, feeding the poor is an almshouse, an officer can be dismissed, an heir named (and disinherited by naming another), and a prisoner who is not one is refused in words', () => {
  const s = withHost();
  assert.deepEqual(acts(read(s, 'Fortify Winterfell')), [['fund_works', { template: 'walls', holding: 'stark' }]]);
  assert.deepEqual(acts(read(s, 'Feed the poor')), [['fund_works', { template: 'almshouse', holding: 'stark' }]]);
  assert.deepEqual(acts(read(s, 'Dismiss Maester Luwin')), [['dismiss_office', { character: 'luwin' }]]);
  const w = structuredClone(s); const d = withRng(w, () => perform(w, 'dismiss_office', { house: 'stark', params: { character: 'luwin' }, source: { type: 'order', ref: 'o' } }));
  assert.ok(d.ok); assert.match(d.receipt[0].text, /Maester Luwin is dismissed as maester/); assert.ok(!w.characters.luwin.roles.includes('maester')); assert.ok(w.facts.some((f) => f.kind === 'office_stripped'));
  assert.equal(perform(structuredClone(s), 'dismiss_office', { house: 'stark', params: { character: 'jon_snow' }, source: { type: 'order', ref: 'o' } }).refusal.code, 'no_office');
  assert.deepEqual(acts(read(s, 'Make Jon Snow my heir')), [['name_heir', { character: 'jon_snow' }]]);
  const h = structuredClone(s); const n = withRng(h, () => perform(h, 'name_heir', { house: 'stark', params: { character: 'bran_stark' }, source: { type: 'order', ref: 'o' } }));
  assert.ok(n.ok); assert.equal(h.houses.stark.heir, 'bran_stark'); assert.equal(heirOf(h, 'stark', 'eddard_stark').id, 'bran_stark', 'the named heir comes before the order of birth'); assert.ok(!h.characters.robb_stark.roles.includes('heir'));
  const dis = read(s, 'Disinherit Robb'); assert.match(dis.clarify.question, /named heir in Robb Stark's place/); assert.ok(dis.clarify.options.length >= 2); assert.ok(!dis.clarify.options.some((o) => o.label === 'Robb Stark'));
  const ex = carry(s, 'Execute Theon Greyjoy'); assert.ok(ex.r.lines.some((l) => l.ok === false && /not your prisoner/.test(l.text)), JSON.stringify(ex.r.lines));
});

test('OR8, OR10: what the steward could not read is said, and one in the same hall is told aloud, no raven flying across the table', () => {
  const s = withHost();
  const f = carry(s, 'Hold a feast and ask Maester Luwin what the people say');
  assert.ok(f.r.lines.some((l) => /feast is held/.test(l.text)) && f.r.lines.some((l) => l.ok === 'story' && /Left to the story: .ask Maester Luwin what the people say/.test(l.text)), JSON.stringify(f.r.lines));
  const t = carry(s, 'Tell Maester Luwin to write to the Citadel');
  assert.equal(t.ord.parsed.letter, null, 'no raven to a man in the castle'); assert.ok(t.r.lines.some((l) => /Maester Luwin is here and told in person/.test(l.text)), JSON.stringify(t.r.lines));
  assert.equal(read(s, 'Tell Maester Luwin to write to the Citadel').story, false);
});

test('OR11: the spy who has placed eyes is one man, and the verb agrees', () => {
  const s = withHost(); let said = '';
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) { const w = structuredClone(s); w.meta.rngState = (w.meta.rngState || 0) + seed; const r = withRng(w, () => perform(w, 'plant_spy', { house: 'stark', params: { house: 'lannister' }, source: { type: 'order', ref: 'o' } })); if (r.ok) said += r.receipt.map((l) => l.text).join(' '); }
  assert.ok(said.length > 0); assert.doesNotMatch(said, /hired men (has|brings|dug)/i);
});
