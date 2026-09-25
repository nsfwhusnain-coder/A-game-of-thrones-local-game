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

// ── Temperament: different people take the same words differently ──
import { weighAudience, holdToVerdict } from '../public/js/shared/temperament.js';
test('a bribe buys Janos Slynt but not Tywin Lannister', () => {
  const line = 'I offer you 5,000 gold dragons for your alliance.';
  let s = fresh(); assert.equal(weighAudience(s, s.characters.janos_slynt, line).verdict, 'agree');
  s = fresh(); assert.notEqual(weighAudience(s, s.characters.tywin_lannister, line).verdict, 'agree');
});
test('Tywin will not be threatened; Walder Frey is frightened', () => {
  const line = 'Swear fealty to me or I will burn your castle to the ground.';
  let s = fresh(); const t = weighAudience(s, s.characters.tywin_lannister, line); assert.equal(t.verdict, 'refuse'); assert.ok(t.mood.anger > t.mood.fear);
  s = fresh(); const w = weighAudience(s, s.characters.walder_frey, line); assert.ok(w.mood.fear > 0);
});
test('insults run out a proud man\'s patience and close the audience', () => {
  const s = fresh(); let r; let n = 0;
  do { r = weighAudience(s, s.characters.viserys_targaryen, 'You are a craven fool.'); n++; } while (r.verdict !== 'dismiss' && n < 10);
  assert.ok(n <= 2); assert.ok(s.moods.viserys_targaryen.closed);
});
test('a refusal signs no pact; an agreement is recorded even if the model forgets', () => {
  const s = fresh(); const c = s.characters.janos_slynt;
  const refused = holdToVerdict(s, c, { verdict: 'refuse', proposal: 'alliance' }, [{ op: 'pact', type: 'alliance', a: 'stark', b: c.house, status: 'active' }]);
  assert.ok(!refused.some((x) => x.op === 'pact'));
  const agreed = holdToVerdict(s, c, { verdict: 'agree', proposal: 'alliance' }, []);
  assert.ok(agreed.some((x) => x.op === 'pact' && x.type === 'alliance'));
});

// ── Battles and sieges ──
import { resolveWarfare } from '../public/js/shared/battles.js';
import { applyChanges as apply } from '../public/js/shared/world.js';
test('hosts at war in contact fight: losses, a rout, a battlefield on the map', () => {
  const s = fresh();
  apply(s, [{ op: 'war', status: 'start', name: 'W', attackers: ['lannister'], defenders: ['stark'] }, { op: 'army_create', id: 'n1', owner: 'stark', name: 'N', at: 'tully', men: 10000 }, { op: 'army_create', id: 'l1', owner: 'lannister', name: 'L', at: 'tully', men: 10000 }]);
  const r = resolveWarfare(s, 30, { r: () => 0.3 });
  assert.equal(r.events.length, 1);
  const total = (s.armies.n1?.men || 0) + (s.armies.l1?.men || 0);
  assert.ok(total < 20000 && total > 10000);
  assert.ok(s.battles.length === 1 && s.landmarks.some((l) => l.kind === 'battle'));
});
test('a great castle is not stormed in a moon; a siege starves it in time', () => {
  const s = fresh();
  apply(s, [{ op: 'war', status: 'start', name: 'W', attackers: ['lannister'], defenders: ['tully'] }, { op: 'army_create', id: 's1', owner: 'lannister', name: 'S', at: 'tully', men: 9000 }]);
  for (const a of Object.values(s.armies)) if (a.id !== 's1' && ['tully', 'stark'].includes(a.owner)) delete s.armies[a.id];
  resolveWarfare(s, 30, { r: () => 0.99 });
  assert.equal(s.holdings.tully.status, 'besieged'); assert.equal(s.holdings.tully.owner, 'tully');
  for (let i = 0; i < 40 && s.holdings.tully.owner === 'tully'; i++) resolveWarfare(s, 30, { r: () => 0.99 });
  assert.equal(s.holdings.tully.owner, 'lannister');
});

// ── Orders read by rule: spelled-out numbers ──
import { wordNumber } from '../server/orders.js';
test('dictated numbers are read: "ten men", "a hundred riders", "two hundred and fifty men"', () => {
  assert.equal(wordNumber('Ride to Oldtown with ten men.'), 10);
  assert.equal(wordNumber('take a hundred riders'), 100);
  assert.equal(wordNumber('two hundred and fifty men'), 250);
  assert.equal(wordNumber('a score of knights'), 20);
  assert.equal(wordNumber('send men north'), null);
});

// ── Fog of war ──
import { viewOfArmies, updateIntel } from '../public/js/shared/intel.js';
test('the player sees hosts near their lands; distant ones only by report, and the report ages', () => {
  const s = fresh();
  apply(s, [{ op: 'army_create', id: 'far', owner: 'martell', name: 'Dornish spears', at: 'martell', men: 5000 }, { op: 'army_create', id: 'near', owner: 'bolton', name: 'Bolton host', at: 'stark', men: 2000 }]);
  let v = viewOfArmies(s);
  assert.equal(v.get('near')?.known, 'seen');
  assert.notEqual(v.get('far')?.known, 'seen'); // never reported: unknown
  s.armies.far.pos = [...s.holdings.stark.pos]; updateIntel(s); // it marched into view
  s.armies.far.pos = [...s.holdings.martell.pos]; s.meta.turn += 3; // and away again
  v = viewOfArmies(s);
  assert.equal(v.get('far').known, 'reported'); assert.equal(v.get('far').age, 3);
  assert.deepEqual(v.get('far').pos, s.holdings.stark.pos);
});
test('a planted report shows a host that does not exist', () => {
  const s = fresh();
  apply(s, [{ op: 'report', at: 'moat_cailin', men: 8000, source: 'a frightened crofter', false: true, owner: 'lannister', name: 'A Lannister host' }]);
  const ghost = [...viewOfArmies(s).values()].find((x) => x.false);
  assert.ok(ghost && ghost.men === 8000);
});

// ── Succession: elected offices are not inherited ──
import { heirOf } from '../public/js/shared/people.js';
test('the Watch chooses a brother, not the Lord Commander\'s exiled son; Braavos elects', () => {
  const s = fresh();
  const nw = heirOf(s, 'nights_watch', 'jeor_mormont');
  assert.ok(nw && s.characters[nw.id].house === 'nights_watch' && nw.id !== 'jorah_mormont');
  assert.equal(heirOf(s, 'braavos', s.houses.braavos.lord), null);
});
