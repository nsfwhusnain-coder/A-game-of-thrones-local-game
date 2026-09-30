// Pins on the map (WP N8, GDD 18 §2.6): which news is pinned is the tier's to say, a battle away from a castle is pinned under the headline the writer
// made of it (never "X defeated Y."), a pin's hover is its headline, and acknowledging news works as it did (the key of a card is stable).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInitialState } from '../public/js/shared/world.js';
import { openPins, pinworthy, eventKey } from '../public/js/shared/pins.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const fresh = () => { const s = createInitialState('agot_298', 'stark', { seed: 298 }); s.meta.turn = 3; s.acks = {}; s.battles = []; return s; };
const card = (o) => ({ headline: 'A headline', summary: 'A summary.', details: [], type: 'court', importance: 3, day: 1, where: 'stark', ...o });
const inTurn = (s, events) => { s.history = [{ turn: 3, date: '20 8th moon, 298 AC', events }]; return s; };
const words = (t) => String(t).trim().split(/\s+/).length;

test('a card of tier news or above with a place gets a pin; a minor one does not, unless it is the player\'s own', () => {
  const s = inTurn(fresh(), [
    card({ headline: 'Great one', tier: 'great', where: 'stark' }), card({ headline: 'Major one', tier: 'major', where: 'tyrell' }), card({ headline: 'News one', tier: 'news', where: 'lannister' }),
    card({ headline: 'Minor, not mine', tier: 'minor', where: 'arryn' }), card({ headline: 'Minor, mine', tier: 'minor', mine: true, where: 'tully' }),
    card({ headline: 'No place', tier: 'great', where: null }), card({ headline: 'A place that is not on the map', tier: 'great', where: 'nowhere' }),
  ]);
  const pins = openPins(s);
  assert.deepEqual([...pins.keys()].sort(), ['lannister', 'stark', 'tully', 'tyrell'], 'great, major, news and the player\'s own minor');
  assert.equal(pins.get('arryn'), undefined, 'a minor one that is no business of the player\'s has no pin');
  assert.ok(!pinworthy(s, card({ tier: 'meanwhile', where: 'stark' })), 'the Meanwhile is not pinned');
  assert.ok(pinworthy(s, card({ tier: 'meanwhile', bg: true, mine: true, importance: 2, where: 'stark' })), 'unless it touched the player\'s own and mattered a little');
});

test('a card from before the tiers is judged as it was, by its importance', () => {
  const s = fresh();
  assert.ok(pinworthy(s, { where: 'stark', importance: 3 })); assert.ok(!pinworthy(s, { where: 'stark', importance: 1 }));
  assert.ok(!pinworthy(s, { importance: 5 }), 'no place, no pin');
});

test('acknowledging news still removes its pin, and the key of a card is the same as before the tiers', () => {
  const s = inTurn(fresh(), [card({ id: '3-0', tier: 'great', where: 'stark' }), card({ tier: 'news', where: 'tyrell' })]);
  const pins = openPins(s);
  assert.deepEqual(pins.get('stark').events.map((e) => e.key), ['3-0'], 'a card with an id is keyed by it');
  assert.equal(pins.get('tyrell').events[0].key, eventKey(3, s.history[0].events[1], 1), 'one without is keyed by its turn and place');
  assert.equal(eventKey(3, {}, 1), '3-1');
  s.acks = { '3-0': 3 };
  assert.equal(openPins(s).get('stark'), undefined, 'acknowledged, the pin goes');
  assert.ok(openPins(s).get('tyrell'), 'and only that one');
});

test('a battle away from any castle is pinned under the writer\'s headline, not "X defeated Y."', () => {
  const s = fresh(); s.meta.turn = 3;
  s.battles = [{ name: 'Battle at the Green Fork', pos: [640, 900], date: '19 8th moon, 298 AC', turn: 3, attacker: 'lannister', defender: 'tully', victor: 'lannister', losses: { lannister: 400, tully: 900 }, summary: 'Lannister defeated Tully.' }];
  inTurn(s, [card({ headline: 'The Tully host is beaten by the Lannisters at the Green Fork', summary: 'The Lannisters carry the field and the road to Riverrun lies open.', archetype: 'battle', houses: ['lannister', 'tully'], where: null, tier: 'major', importance: 5 })]);
  const g = openPins(s).get('@battle0');
  assert.ok(g, 'the field is pinned'); assert.deepEqual(g.pos, [640, 900]);
  const e = g.events[0];
  assert.equal(e.headline, 'The Tully host is beaten by the Lannisters at the Green Fork', 'the writer\'s headline');
  assert.match(e.summary, /road to Riverrun/); assert.doesNotMatch(e.headline + e.summary, /defeated/, 'never the engine\'s line');
  assert.ok(words(e.headline) <= 12, 'a pin\'s label is at most twelve words');
  // with no card told for it (a save from before), the old line stands rather than nothing
  s.history = [{ turn: 3, date: 'x', events: [] }];
  assert.equal(openPins(s).get('@battle0').events[0].title, 'Battle at the Green Fork');
  // a battle's card of other houses is not this battle's
  inTurn(s, [card({ headline: 'The Freys beat the Boltons', archetype: 'battle', houses: ['frey', 'bolton'], tier: 'major', where: null })]);
  assert.equal(openPins(s).get('@battle0').events[0].title, 'Battle at the Green Fork');
  assert.equal(openPins(s).get('@battle0').events[0].key, 'battle-3-0', 'the battle\'s key is what it was');
});

test('every card the writer makes on a real game is short enough to be a pin\'s label', async () => {
  process.env.WC_PROVIDER = 'mock';
  const os = await import('node:os'); const dir = path.join(os.tmpdir(), `wc-pins-${process.pid}`); fs.mkdirSync(dir, { recursive: true }); process.env.WC_SAVES = dir;
  try {
    const game = await import('../server/game.js');
    const { id } = game.newGame('agot_298', 'stark', { seed: 298 });
    for (let i = 0; i < 3; i++) await game.advance(id, { span: '7d' });
    const s = game.loadState(id);
    for (const t of s.history) for (const e of t.events) assert.ok(words(e.headline || e.title) <= 13, `"${e.headline}" is ${words(e.headline)} words`);
    const pins = openPins(s);
    for (const g of pins.values()) for (const e of g.events) assert.ok((e.tier ? ['great', 'major', 'news', 'minor'].includes(e.tier) : e.importance >= 2), `pinned "${e.headline || e.title}" is ${e.tier}/${e.importance}`);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the pin window is the card on vellum, and the map\'s hover is the headline', () => {
  const ui = read('public/js/ui/pins.js'); const map = read('public/js/map3d/MapScene.js');
  assert.match(ui, /wc-vellum/); assert.match(ui, /e\.headline \|\| e\.title/); assert.match(ui, /detailLines\(e\)/, 'the details are the card\'s lines');
  assert.match(map, /top\.headline \|\| top\.title/, 'the pin\'s hover names the headline');
});
