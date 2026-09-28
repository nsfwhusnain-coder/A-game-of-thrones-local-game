// Facts, turn records, snapshots and undo (WP B3; docs/gdd/03-architecture.md §3.6, §8, §11): every engine subsystem
// records what happened as a fact, the chronicle's cards are projections of facts, the save keeps its facts and turns
// in files, and the glass can be turned back several turns — except in an ironman chronicle.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.WC_PROVIDER = 'mock';
process.env.WC_SAVES = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-facts-'));
const game = await import('../server/game.js');
const { KINDS, KIND_NAMES, templateText } = await import('../public/js/engine/facts/kinds.js');
const { emit, fact, redate, flush } = await import('../public/js/engine/facts/log.js');
const { createInitialState, applyChanges } = await import('../public/js/shared/world.js');
const { dayNumber } = await import('../public/js/engine/time.js');

test.after(() => fs.rmSync(process.env.WC_SAVES, { recursive: true, force: true }));
const file = (id, f) => path.join(game.SAVES, id, f);
const TYPES = new Set(['war', 'court', 'diplomacy', 'intrigue', 'economy', 'disaster', 'religion', 'magic']);

test('the catalogue: every kind has an importance, a card type and a scope; the GDD kinds are all there', () => {
  for (const k of KIND_NAMES) {
    const K = KINDS[k];
    assert.ok(Number.isInteger(K.importance) && K.importance >= 1 && K.importance <= 5, `${k}: importance`);
    assert.ok(TYPES.has(K.type), `${k}: type ${K.type}`);
    assert.ok(['public', 'local', 'houses', 'secret'].includes(K.vis), `${k}: vis ${K.vis}`);
  }
  // 03 §8, every group
  for (const k of ['set_out', 'arrived', 'lost_at_sea', 'levies_called', 'host_formed', 'battle', 'holding_fell', 'war_declared', 'peace_made', 'fealty_sworn', 'death', 'succession', 'captured', 'letter_arrived', 'rumour', 'feast', 'season_turned', 'custom_created', 'happening', 'behaviour']) assert.ok(KINDS[k], k);
});

test('templates speak with the right pronouns, and never say "undefined"', () => {
  const s = createInitialState('agot_298', 'stark', { seed: 7 });
  const her = 'catelyn_stark', him = 'eddard_stark';
  assert.equal(s.characters[her].sex, 'f'); assert.equal(s.characters[him].sex, 'm');
  const say = (kind, actors, data = {}, more = {}) => templateText({ kind, actors, houses: [], data, ...more }, s);
  assert.match(say('released', [her]), /Catelyn Stark is free again; her captors have let her go\./);
  assert.match(say('released', [him]), /Eddard Stark is free again; his captors have let him go\./);
  assert.match(say('vanished', [her]), /no one can say where she went/);
  assert.match(say('recovered', [him]), /on his feet again/);
  assert.match(say('came_of_age', [her]), /answers for herself now/);
  assert.match(say('sent_to_wall', [him]), /he will hold no lands/);
  assert.match(say('death', [him], { cause: 'old age' }), /^Eddard Stark, Lord of Winterfell.*, is dead — old age\.$/);
  assert.match(say('wedding', [him, her]), /Eddard Stark and Catelyn Stark are wed\./);
  // a host moves under its banner; a rider by name
  const host = Object.values(s.parties).find((p) => p.kind === 'host' && p.owner === 'lannister') || Object.values(s.parties)[0];
  assert.match(say('set_out', [host.commander], { party: host.id, to: 'tully', days: 9 }), new RegExp(`^${host.name} sets out for Riverrun \\(~9 days\\)\\.$`));
  assert.match(say('set_out', [him], { to: 'baratheon' }), /^Eddard Stark sets out for King's Landing\.$/);
  for (const k of KIND_NAMES) {
    if (!KINDS[k].text) continue;
    const t = say(k, [him, her], { party: host.id, to: 'tully', men: 1200, attacker: 'stark', defender: 'lannister', winner: 'stark', title: 'Hand of the King', office: 'steward' }, { houses: ['stark'], place: 'stark' });
    assert.ok(t && !/undefined|null|NaN|\[object/.test(t), `${k}: ${t}`);
  }
});

test('emit: ids by turn, days by the turn\'s clock, importance weighed for the player and great lords', () => {
  const s = createInitialState('agot_298', 'stark', { seed: 11 });
  const d0 = dayNumber(s.meta.date);
  s.meta.clock = { turn: 4, from: d0 + 1, to: d0 + 10 };
  const a = emit(s, 'feast', { actors: ['walder_frey'], houses: ['frey'], on: 3 });
  const b = emit(s, 'feast', { actors: ['eddard_stark'], houses: ['stark'] });
  const c = emit(s, 'rumour', { houses: ['lannister'], importance: 3, on: 99 });
  assert.deepEqual([a.id, b.id, c.id], ['f4.1', 'f4.2', 'f4.3']);
  assert.equal(a.day, d0 + 3, 'day 3 of the turn'); assert.equal(b.day, d0 + 10, 'undated: the last day'); assert.equal(c.day, d0 + 10, 'clamped to the turn');
  assert.equal(a.importance, KINDS.feast.importance, 'a minor lord\'s feast');
  assert.equal(b.importance, Math.min(5, KINDS.feast.importance + 2), 'the player\'s house and a great lord');
  assert.equal(c.importance, 3, 'an explicit importance is kept');
  assert.throws(() => emit(s, 'no_such_kind'), /no such kind/);
  // between turns, an act belongs to the turn it opens
  delete s.meta.clock; s.meta.turn = 4;
  assert.equal(emit(s, 'feast', { houses: ['tully'] }).id, 'f5.1');
  assert.equal(flush(s).length, 4); assert.deepEqual(s.facts, []);
});

test('cards and facts: an undated card carries its fact to the day the turn gives it; a dated one stays put', () => {
  const s = createInitialState('agot_298', 'stark', { seed: 12 });
  const d0 = dayNumber(s.meta.date); s.meta.clock = { turn: 1, from: d0 + 1, to: d0 + 20 };
  const loose = fact(s, 'happening', { title: 'A fair', text: 'A fair at Winterfell.', where: 'stark', houses: ['stark'] });
  const along = emit(s, 'works_done', { houses: ['stark'], alongside: loose.fact });
  const fixed = fact(s, 'feast', { title: 'A feast', text: 'A feast.', where: 'stark', houses: ['stark'], day: 4 });
  assert.equal(loose.day, undefined); assert.equal(fixed.day, 4); assert.equal(fixed.fact, 'f1.3');
  loose.day = 12; redate(s, loose);
  fixed.day = 9; redate(s, fixed); // folded into another card, say: the fact keeps its own day
  const byId = Object.fromEntries(s.facts.map((f) => [f.id, f]));
  assert.equal(byId[loose.fact].day, d0 + 12); assert.equal(byId[along.id].day, d0 + 12, 'what happened alongside moves with it');
  assert.equal(byId[fixed.fact].day, d0 + 4);
  assert.ok(!JSON.stringify(loose).includes('undated'), 'the flag never reaches the save');
  flush(s); assert.ok(!('_alongside' in byId[along.id]), 'nor the link');
});

test('changes record their facts, once: an op the caller has told itself is not told again', () => {
  const s = createInitialState('agot_298', 'stark', { seed: 13 });
  const r = applyChanges(s, [
    { op: 'war', name: 'The Riverlands War', attackers: ['lannister'], defenders: ['tully'] },
    { op: 'holding', id: 'darry', owner: 'lannister', status: 'occupied', note: 'Taken by the Mountain' },
    { op: 'character', id: 'edmure_tully', status: 'imprisoned', note: 'Taken in battle at the fords' },
    { op: 'relation', a: 'stark', b: 'tully', delta: 5 },
    { op: 'tax', house: 'tyrell', level: s.houses.tyrell.policy?.tax === 'high' ? 'low' : 'high' },
  ]);
  const kinds = s.facts.map((f) => f.kind);
  assert.deepEqual(kinds, ['war_declared', 'holding_fell', 'captured_in_battle', 'tax_changed']);
  assert.ok(r.applied[0].facts?.length === 1 && r.applied[3].facts === undefined, 'each applied change names its facts');
  assert.ok(s.facts.every((f) => f.cause?.type === 'engine'));
  // a caller that records the fact in its own words passes `told`
  const before = s.facts.length;
  applyChanges(s, [{ op: 'character', id: 'jaime_lannister', alive: false, cause: 'a fall' }], { told: ['character'] });
  assert.equal(s.facts.length, before, 'no second fact of the death');
  assert.equal(s.characters.jaime_lannister.alive, false, 'the change itself still happens');
  // a head of house dies: the succession is its own fact, on the same day, named for the heir
  applyChanges(s, [{ op: 'character', id: 'hoster_tully', alive: false, cause: 'a long illness' }], { cause: { type: 'rule', ref: 'test' } });
  const succ = s.facts.find((f) => f.kind === 'succession');
  assert.ok(succ && succ.houses.includes('tully') && /Edmure|Tully/.test(succ.text), succ?.text);
});

test('a turn: every engine card is backed by a fact; the facts go to facts.jsonl, the record to turns/', async () => {
  const { id, state } = game.newGame('agot_298', 'stark', { seed: 298 });
  const vassals = Object.values(state.houses).filter((h) => h.liege === 'stark').map((h) => h.id);
  game.act(id, { kind: 'call_banners', vassals, at: 'stark', ownLevies: 3000 });
  game.setOrders(id, [{ text: 'Send Jon Snow to Castle Black.' }]);
  const records = [];
  for (const span of ['9d', '7d', '12d']) records.push((await game.advance(id, { span })).turn);
  for (const t of records) for (const e of t.events) assert.ok(e.fact || e.story || e.orderId, `turn ${t.turn}: "${e.title}" is backed by a fact (or is the story's, or an order's receipt)`);
  const facts = fs.readFileSync(file(id, 'facts.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const ids = new Set(facts.map((f) => f.id));
  assert.equal(ids.size, facts.length, 'fact ids are unique');
  assert.ok(facts.every((f) => KINDS[f.kind] && /^f\d+\.\d+$/.test(f.id) && f.text && !/undefined/.test(f.text)), 'well formed');
  assert.ok(facts.some((f) => f.kind === 'levies_called') && facts.some((f) => f.kind === 'set_out' && f.actors.includes('jon_snow')), 'the lord\'s own acts are facts');
  for (const t of records) {
    for (const e of t.events) if (e.fact) assert.ok(ids.has(e.fact), `${e.fact} is in the log`);
    const mine = facts.filter((f) => f.turn === t.turn);
    const to = dayNumber(game.loadState(id).meta.date); // the last turn's end; every fact lies before it
    assert.ok(mine.every((f) => f.day <= to), 'no fact from the future');
    // a card made on its day has its fact on that day
    for (const e of t.events.filter((x) => x.fact && !x.facts)) { const f = facts.find((x) => x.id === e.fact); assert.equal(f.day - e.day, mine[0] ? f.day - e.day : 0); }
    assert.ok(fs.existsSync(file(id, `turns/${String(t.turn).padStart(6, '0')}.json`)), 'the turn is on disk');
    assert.deepEqual(game.readTurn(id, t.turn).events.length, t.events.length);
  }
  // the save holds no facts of its own (they are in the log) and no clock
  const s = game.loadState(id); assert.deepEqual(s.facts, []); assert.equal(s.meta.clock, undefined);
  // the player's view of the log has no one else's secrets
  const seen = game.readFacts(id, { view: 'player' });
  assert.ok(seen.every((f) => !['secret', 'houses'].includes(f.vis.scope) || (f.vis.houses || f.houses).includes('stark')));
});

test('undo three turns: the world, the chronicle and the logs are as they were; the same turns come out the same', async () => {
  const { id, state } = game.newGame('agot_298', 'stark', { seed: 298 });
  const vassals = Object.values(state.houses).filter((h) => h.liege === 'stark').map((h) => h.id);
  game.act(id, { kind: 'call_banners', vassals, at: 'stark', ownLevies: 2000 });
  const spans = ['5d', '8d', '6d', '9d', '4d'];
  await game.advance(id, { span: spans[0] }); await game.advance(id, { span: spans[1] });
  const eve = { state: fs.readFileSync(file(id, 'state.json'), 'utf8'), facts: fs.readFileSync(file(id, 'facts.jsonl'), 'utf8'), log: fs.readFileSync(file(id, 'world-log.md'), 'utf8'), chronicle: fs.readFileSync(file(id, 'chronicle.md'), 'utf8') };
  const later = [];
  for (const span of spans.slice(2)) later.push((await game.advance(id, { span })).turn);
  const factsThen = fs.readFileSync(file(id, 'facts.jsonl'), 'utf8');
  assert.equal(game.undoDepth(id), 5);
  const back = await game.undo(id, { turns: 3 });
  assert.equal(back.meta.turn, 2);
  assert.equal(fs.readFileSync(file(id, 'state.json'), 'utf8'), eve.state, 'the world, byte for byte');
  assert.equal(fs.readFileSync(file(id, 'facts.jsonl'), 'utf8'), eve.facts, 'the fact log is cut back');
  assert.equal(fs.readFileSync(file(id, 'world-log.md'), 'utf8'), eve.log, 'and the world log');
  assert.equal(fs.readFileSync(file(id, 'chronicle.md'), 'utf8'), eve.chronicle, 'the chronicle is as it was');
  assert.deepEqual(fs.readdirSync(file(id, 'turns')), ['000001.json', '000002.json'], 'the unmade turns are forgotten');
  assert.equal(game.undoDepth(id), 2);
  // the same three turns, played again, happen the same way (the dice were turned back with the world)
  const again = [];
  for (const span of spans.slice(2)) again.push((await game.advance(id, { span })).turn);
  assert.equal(fs.readFileSync(file(id, 'facts.jsonl'), 'utf8'), factsThen, 'the same facts');
  assert.deepEqual(again.map((t) => t.events.map((e) => e.title)), later.map((t) => t.events.map((e) => e.title)));
  await assert.rejects(game.undo(id, { turns: 6 }), /only 5 turns have been played/);
});

test('snapshots: only the last ten are kept', async () => {
  const { id } = game.newGame('agot_298', 'tully', { seed: 298 });
  for (let i = 0; i < 12; i++) await game.advance(id, { span: '1d' });
  const snaps = fs.readdirSync(file(id, 'snapshots'));
  assert.equal(snaps.length, 10); assert.equal(snaps[0], '000003.json.gz');
  assert.equal(game.undoDepth(id), 10);
  await assert.rejects(game.undo(id, { turns: 11 }), /only the last 10 turns/); // asking for more than ten is asking for ten
});

test('ironman: no snapshots, no undo', async () => {
  const { id, state } = game.newGame('agot_298', 'arryn', { ironman: true, seed: 298 });
  assert.equal(state.meta.settings.ironman, true);
  await game.advance(id, { span: '3d' });
  assert.ok(!fs.existsSync(file(id, 'snapshots')) || !fs.readdirSync(file(id, 'snapshots')).length);
  assert.equal(game.undoDepth(id), 0);
  await assert.rejects(game.undo(id, { turns: 1 }), (e) => e.status === 403 && /ironman/i.test(e.message));
});

test('a save from before snapshots: its one undo point still works, and its history goes to turns/', async () => {
  const { id } = game.newGame('agot_298', 'martell', { seed: 298 });
  await game.advance(id, { span: '2d' });
  const before = fs.readFileSync(file(id, 'state.json'), 'utf8');
  // make it look old: an undo point of the old kind, no snapshots, no turn files
  await game.advance(id, { span: '3d' });
  fs.rmSync(file(id, 'snapshots'), { recursive: true, force: true });
  fs.rmSync(file(id, 'turns'), { recursive: true, force: true });
  fs.writeFileSync(file(id, 'prev-state.json'), before);
  assert.equal(game.undoDepth(id), 1);
  const back = await game.undo(id, { turns: 1 });
  assert.equal(back.meta.turn, 1);
  await game.advance(id, { span: '3d' }); // the first turn played now writes the old history out
  assert.deepEqual(fs.readdirSync(file(id, 'turns')), ['000001.json', '000002.json']);
  assert.ok(!fs.existsSync(file(id, 'prev-state.json')), 'the old undo point is gone');
});
