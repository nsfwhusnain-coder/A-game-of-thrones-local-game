// The order interpreter (docs/gdd/04-ai-system.md §4, WP B6): the pre-parser reads orders by rule, the model is asked
// only for what the rules cannot read completely and lawfully, and a model's reading is checked before it counts.
// The interpret suite (bench/suites/interpret, 04 §13) is the gate: what the pre-parser reads must stay right.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, applyChanges } from '../public/js/shared/world.js';
import { withRng } from '../public/js/engine/rng.js';
import { parseOrder, numbersIn, daysIn, clausesOf } from '../server/orders/parse.js';
import { interpretOrder, ruleReading } from '../server/orders/interpret.js';
import { loadSuite, runSuite, compare } from '../bench/lib/interpret.js';
import { loadConfig } from '../server/llm.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const world = (house = 'stark', setup = []) => { const s = createInitialState('agot_298', house, { seed: 298 }); withRng(s, () => applyChanges(s, setup)); return s; };
const withHost = () => world('stark', [{ op: 'army_create', id: 'host_of_winterfell', owner: 'stark', name: 'The Host of Winterfell', at: 'stark', men: 4000, commander: 'robb_stark' }, { op: 'character', id: 'robb_stark', with: 'host_of_winterfell' }]);
const read = (s, text, o) => { const p = parseOrder(s, text, o); return { verbs: p.actions.map((a) => a.verb), p }; };
const dead = { ...loadConfig(), provider: 'openai', baseUrl: 'http://127.0.0.1:9/v1', timeoutSec: 2 };

test('numbers and spans a lord dictates', () => {
  const n = (t) => numbersIn(t).map((x) => x.n);
  assert.deepEqual(n('two thousand spears and a score of knights'), [2000, 20]);
  assert.deepEqual(n('1,500 men'), [1500]);
  assert.deepEqual(n('two hundred and fifty riders'), [250]);
  assert.deepEqual(n('one thousand men'), [1000]);
  assert.deepEqual(n('twenty five archers'), [25]);
  assert.equal(numbersIn('a few men')[0].n, 10);
  assert.equal(daysIn('within a fortnight'), 14); assert.equal(daysIn('in ten days'), 10); assert.equal(daysIn('by the next moon'), 30);
});

test('an order is split where a second command begins, not where one command goes on', () => {
  assert.deepEqual(clausesOf('Raise the levies and march them to Moat Cailin.'), ['Raise the levies and march them to Moat Cailin']);
  assert.deepEqual(clausesOf('Send Jon to the Wall, and have Maester Luwin write to Riverrun.'), ['Send Jon to the Wall', 'have Maester Luwin write to Riverrun']);
  assert.equal(clausesOf('Call the banners. Then march the host south.').length, 2);
});

test('who an order means: names, bynames, kinship, office — and not the one met or fetched', () => {
  const s = withHost();
  assert.deepEqual(read(s, 'Send my wife to Riverrun.').p.actions[0].params.character, 'catelyn_stark');
  assert.equal(read(s, 'The maester should ride to White Harbor.').p.actions[0].params.character, 'luwin');
  // "to meet Lady Catelyn at the Twins": Jory goes, Catelyn is where he goes to
  const meet = read(s, 'Send Jory Cassel and twenty guards to meet Lady Catelyn at the Twins.').p.actions;
  assert.deepEqual(meet.map((a) => [a.params.character, a.params.to, a.params.men]), [['jory_cassel', 'frey', 20]]);
  // "Theon Greyjoy" names a man, not a journey to Pyke
  assert.equal(read(s, 'Send Theon Greyjoy to White Harbor.').p.actions[0].params.to, 'manderly');
  // hailed by name, with a title: the host he leads goes
  const l = world('lannister', [{ op: 'army_create', id: 'host_of_the_rock', owner: 'lannister', name: 'The Host of the Rock', at: 'lannister', men: 12000, commander: 'kevan_lannister' }, { op: 'character', id: 'kevan_lannister', with: 'host_of_the_rock' }]);
  assert.deepEqual(read(l, 'Kevan, march on the Twins.', { house: 'lannister' }).p.actions.map((a) => [a.verb, a.params.army, a.params.to]), [['march_host', 'host_of_the_rock', 'frey']]);
  // the lord himself at the head of his host
  assert.equal(read(l, 'I will lead the host to the Golden Tooth myself.', { house: 'lannister' }).p.actions[0].params.commander, 'tywin_lannister');
});

test('letters go to the one written to; offers and "tell" are ravens; prayers are the story\'s', () => {
  const s = world('greyjoy');
  assert.equal(parseOrder(s, 'Write to my son Theon at Winterfell.', { house: 'greyjoy' }).letter.to, 'theon_greyjoy');
  assert.equal(parseOrder(s, 'Tell Theon to come home.', { house: 'greyjoy' }).letter.to, 'theon_greyjoy');
  const st = world();
  assert.equal(parseOrder(st, 'Send a raven to Lord Commander Mormont asking what the Watch needs.').letter.to, 'jeor_mormont');
  assert.equal(parseOrder(st, 'Luwin must write to Riverrun.').letter.to, 'hoster_tully');
  const offer = parseOrder(world('lannister'), 'Offer Lord Frey ten thousand dragons for the use of his crossing.', { house: 'lannister' });
  assert.equal(offer.letter.to, 'walder_frey'); assert.equal(offer.actions.length, 0, 'an offer is a proposal, not a gift');
  const pray = parseOrder(world('mallister'), "Pray for my son's safe return.", { house: 'mallister' });
  assert.ok(pray.story && pray.complete && !pray.clarify);
});

test('the banners: all of them, some of them by name, or their lords', () => {
  const s = world('greyjoy');
  assert.deepEqual(parseOrder(s, 'Call the Harlaws, the Drumms and the Goodbrothers to Pyke.', { house: 'greyjoy' }).actions[0].params, { vassals: ['harlaw', 'drumm', 'goodbrother'], at: 'greyjoy' });
  assert.deepEqual(parseOrder(s, 'Summon Lord Harlaw to Pyke.', { house: 'greyjoy' }).actions[0].params.vassals, ['harlaw']);
  assert.equal(parseOrder(world(), 'Muster the North\'s levies at the Dreadfort.').actions[0].params.at, 'bolton');
});

test('an order the rules cannot finish asks one question, and its answers patch the action left open', () => {
  const s = withHost();
  const q = parseOrder(s, 'Hire sellswords at Winterfell.');
  assert.match(q.clarify.question, /How many men/); assert.equal(q.clarify.pending.verb, 'hire_men');
  assert.deepEqual(q.clarify.options.map((o) => o.patch.men), [50, 200, 500]);
  const who = parseOrder(s, 'Send someone to the Wall.');
  assert.match(who.clarify.question, /Who should go/); assert.ok(who.clarify.options.length >= 2 && who.clarify.options.every((o) => o.patch.character));
});

test('a march with no host in the field is read, and refused with the reason — never dropped', async () => {
  const s = world();
  const r = await interpretOrder(s, 'March the host to Riverrun.', { provider: 'rules' });
  assert.deepEqual(r.actions.map((a) => a.verb), ['march_host']);
  const { check, intentFor } = await import('../public/js/engine/actions/registry.js');
  assert.match(check(s, intentFor(s, 'march_host', { params: r.actions[0].params })).text, /no host in the field/);
});

test('the model is asked only for what the rules cannot read completely and lawfully', async () => {
  const s = withHost();
  // plain and lawful: the rules read it, and a dead model server is never called
  const plain = await interpretOrder(s, 'Send Jon Snow to the Wall with ten men.', { cfg: dead });
  assert.equal(plain.via, 'rules'); assert.equal(plain.actions[0].params.men, 10);
  // three thousand of a host of four thousand: part of it, or new levies? the model decides (a recorded answer)
  const part = await interpretOrder(s, 'Bring three thousand spears to White Harbor.', { provider: 'replay' });
  assert.equal(part.via, 'replay'); assert.deepEqual(part.actions, [{ verb: 'raise_levies', params: { at: 'stark', men: 3000, to: 'manderly' } }]);
  // a model's answer that fails its checks falls back to the rules' reading
  const bad = await interpretOrder(s, 'Send two hundred men to reinforce Moat Cailin.', { provider: 'replay' });
  assert.equal(bad.via, 'fallback'); assert.ok(bad.problems.some((p) => /needs subject/.test(p))); assert.equal(bad.actions[0].verb, 'march_host');
  // a model that lets a command fall to the story: the rules' reading stands, and its receipt will say why not
  const story = await interpretOrder(s, 'March the host to Winterfell.', { provider: 'replay' });
  assert.equal(story.via, 'replay'); assert.equal(story.actions[0].verb, 'march_host');
  // a dead server: the rules' reading, never an exception
  const down = await interpretOrder(s, 'Bring three thousand spears to White Harbor.', { cfg: dead });
  assert.equal(down.via, 'fallback'); assert.equal(down.actions[0].verb, 'march_host');
});

test('ruleReading says when the model may be skipped', () => {
  const s = withHost();
  assert.equal(ruleReading(s, 'Take the host to Castle Cerwyn.').sure, true);
  assert.equal(ruleReading(s, 'March the host to Winterfell.').sure, false, 'unlawful: it is already there');
  assert.equal(ruleReading(s, 'Send someone to the Wall.').sure, false, 'a question');
  assert.equal(ruleReading(s, 'Hold the line and pray.').sure, false, 'a clause the rules could not read');
});

test('compare: exact reading, param accuracy and questions are scored as 04 §13 says', () => {
  const want = { actions: [{ verb: 'send_person', params: { character: 'jon_snow', to: 'nights_watch' } }] };
  assert.ok(compare(want, { actions: [{ verb: 'send_person', params: { character: 'jon_snow', to: 'castle_black', men: 0 } }] }).exact);
  assert.deepEqual(compare(want, { actions: [{ verb: 'send_person', params: { character: 'robb_stark', to: 'nights_watch' } }] }).params, [1, 2]);
  assert.ok(!compare(want, { actions: [], clarify: { question: '?' } }).exact);
  assert.ok(compare({ clarify: true }, { actions: [], clarify: { question: 'Who?' } }).exact);
  assert.ok(compare({ letter: 'hoster_tully' }, { actions: [], letter: { to: 'hoster_tully' } }).exact);
});

// the gate (04 §13): the pre-parser on the suite and on orders it was never tuned on
test('the interpret suite: the pre-parser reads right, and every action it reads gets its receipt', async () => {
  const r = await runSuite((s, text, house) => parseOrder(s, text, { house }));
  assert.ok(r.total >= 250, `${r.total} orders`);
  assert.ok(r.exact / r.total >= 0.95, `exact ${r.exact}/${r.total}: ${r.misses.map((m) => m.id).join(', ')}`);
  assert.equal(r.receipts[0], r.receipts[1], 'every action read has its receipt');
  assert.ok(r.alone[1] / r.total >= 0.6, `read without the model: ${r.alone[1]}/${r.total}`);
  assert.ok(r.alone[0] / r.alone[1] >= 0.98, `of those, exact: ${r.alone[0]}/${r.alone[1]}`);
  assert.ok(r.clarified / r.total <= 0.1, `asked: ${r.clarified}`);
});
test('the hold-out: orders written apart from the pre-parser stay mostly right', async () => {
  const r = await runSuite((s, text, house) => parseOrder(s, text, { house }), { suites: loadSuite(path.join(ROOT, 'bench', 'suites', 'interpret-holdout')) });
  assert.ok(r.exact / r.total >= 0.8, `hold-out exact ${r.exact}/${r.total}: ${r.misses.map((m) => m.id).join(', ')}`);
  assert.equal(r.receipts[0], r.receipts[1]);
});
test('the interpret call on the mock reads the suite as the rules do: the schema carries every reading whole', async () => {
  const { runCall } = await import('../server/ai/client.js');
  const { readingOf } = await import('../server/ai/calls/interpret.js');
  const r = await runSuite(async (s, text, house) => { const x = await runCall('interpret', s, { text, house }, { provider: 'mock' }); return readingOf(x.value, s, { house }); });
  assert.ok(r.exact / r.total >= 0.95, `exact ${r.exact}/${r.total}: ${r.misses.map((m) => m.id).join(', ')}`);
});
