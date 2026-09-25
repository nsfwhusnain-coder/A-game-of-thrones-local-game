// Engine tests that need no model: `npm test`. Run from the repo root.
import test from 'node:test';
import assert from 'node:assert/strict';
import { extractJson } from '../server/llm.js';
import { createInitialState } from '../public/js/shared/world.js';
import { initEconomy } from '../public/js/shared/economy.js';
import { happenings, happeningCount } from '../public/js/shared/happenings.js';
import { HAPPENINGS } from '../public/data/happenings.js';
import { openPins } from '../public/js/shared/pins.js';
import { buildJumpPrompt, turnLog } from '../server/prompts.js';

const fresh = (house = 'stark') => { const s = createInitialState('agot_298', house); if (!s.world) initEconomy(s); return s; };

// ── JSON repair: each case is the shape of a reply that really failed in play ──
test('reasoning leaked before the answer: the answer object is found', () => {
  const o = extractJson('The user wants a moon simulated. Let me think {not json} about it.\n\n{"summary":"Rain.","events":[],"changes":[]}');
  assert.equal(o.summary, 'Rain.');
});
test('an event object left open before the array closes is rebalanced', () => {
  const o = extractJson('{"summary":"x","events":[{"title":"A","text":"The North stands."  ],"changes":[{"op":"relation","a":"stark","b":"bolton","delta":-5}]}');
  assert.equal(o.events.length, 1);
  assert.equal(o.changes[0].delta, -5);
});
test('a reply cut off after a key is closed with null', () => {
  const o = extractJson('{"summary":"x","events":[{"title":"A","where":"castle_black","importance":');
  assert.equal(o.events[0].title, 'A');
  assert.equal(o.events[0].importance, null);
});
test('a continuation that started the object over keeps the new object', () => {
  const o = extractJson('{"summary":"The deep winter tightens, though the memory of it l{"summary":"Winter.","events":[],"changes":[]}');
  assert.equal(o.summary, 'Winter.');
});
test('raw quotes and thousands separators are repaired', () => {
  const o = extractJson('{"summary":"He said "no" to the king","men": 8,000}');
  assert.match(o.summary, /no/);
  assert.equal(o.men, 8000);
});

// ── Happenings: the small life of the realm ──
test('the library has unique ids and valid regions', () => {
  const ids = new Set(HAPPENINGS.map((h) => h.id));
  assert.equal(ids.size, HAPPENINGS.length);
  for (const h of HAPPENINGS) assert.match(h.where, /^(any|r:|h:|c:)/, h.id);
});
test('a period brings happenings in proportion to its length, every slot filled', () => {
  const s = fresh();
  for (const days of [7, 30, 90, 360]) {
    s.meta.turn += 10;
    const { events } = happenings(s, days);
    assert.ok(events.length > 0 && events.length <= happeningCount(days));
    for (const e of events) {
      assert.ok(e.bg && s.holdings[e.where], e.title);
      assert.doesNotMatch(e.title + e.text, /\{|undefined|\bnull\b|House an /, e.title);
      assert.ok(e.day >= 1 && e.day <= days);
    }
  }
});
test('a happening does not come again before its cooldown', () => {
  const s = fresh(); s.meta.turn = 50;
  const first = new Set(happenings(s, 360).events.map((e) => e.title));
  const again = happenings(s, 30).events; // same turn: everything just used is cooling down
  assert.ok(again.every((e) => !first.has(e.title) || /\|\|/.test(e.title)));
});
test('happenings never touch the Wall or Essos under "any"', () => {
  const s = fresh(); const any = new Set(HAPPENINGS.filter((h) => h.where === 'any').map((h) => h.id));
  for (let i = 0; i < 40; i++) { s.meta.turn += 7; for (const e of happenings(s, 90).events) if (any.has(e.tpl)) assert.ok(!['wall', 'beyond', 'essos'].includes(s.holdings[e.where].region), e.title); }
});

// ── Pins: unread news and waiting matters, gone once acknowledged ──
test('pins show pending decisions and unread news, and acknowledged news goes', () => {
  const s = fresh();
  s.meta.turn = 1;
  s.history = [{ turn: 1, date: 'x', events: [{ id: '1-0', title: 'War', text: 't', where: 'stark', importance: 3, type: 'war' }, { id: '1-1', title: 'Feast', text: 't', where: 'tyrell', importance: 1, type: 'court' }] }];
  s.decisions = [{ id: 'd1', title: 'Q', text: '', options: [{ label: 'a' }, { label: 'b' }], status: 'pending', from: 'robert_baratheon' }];
  let pins = openPins(s);
  assert.equal(pins.get('stark')?.events.length, 1);
  assert.equal(pins.get('tyrell'), undefined, 'minor news has no pin');
  assert.ok([...pins.values()].some((g) => g.decisions.length === 1));
  s.acks = { '1-0': 1 };
  pins = openPins(s);
  assert.equal(pins.get('stark')?.events.length || 0, 0);
});
test('news older than two turns loses its pin', () => {
  const s = fresh(); s.meta.turn = 5;
  s.history = [{ turn: 2, date: 'x', events: [{ id: '2-0', title: 'Old', text: '', where: 'stark', importance: 4 }] }];
  assert.equal(openPins(s).size, 0);
});

// ── The prompt: small and cache-friendly ──
test('the static part of the prompt does not change when people move', () => {
  const cfg = { contextTokens: 65536, maxTokens: 6000, keepRecentTurns: 4, promptDetail: 'full', thinking: 'auto' };
  const s = fresh();
  const a = buildJumpPrompt(s, [], '1m', '', cfg)[1].content;
  s.characters.jory_cassel.loc = 'baratheon';
  s.relations[Object.keys(s.relations)[0]].v += 7;
  const b = buildJumpPrompt(s, [], '1m', '', cfg)[1].content;
  const staticEnd = a.indexOf('THE STATE OF THE REALM NOW');
  assert.ok(staticEnd > 1000);
  assert.equal(a.slice(0, staticEnd), b.slice(0, staticEnd));
});
test('the recent-turn log is one line per event, background life only when it matters', () => {
  const s = fresh();
  const line = turnLog(s, { turn: 3, dateFrom: 'a', date: 'b', orders: [{ text: 'March south.' }, { text: 'DECISION — X: I choose "Y".' }], events: [{ day: 4, where: 'stark', title: 'T', text: 'x', importance: 3 }, { day: 5, where: 'tyrell', title: 'Fair', text: 'y', importance: 1, bg: true }] });
  assert.match(line, /Orders: March south\./);
  assert.match(line, /Decisions: X: I choose "Y"\./);
  assert.match(line, /- d4 Winterfell: T — x/);
  assert.doesNotMatch(line, /Fair/);
});
