// Bench v2 and the coherence checker (docs/gdd/04-ai-system.md §13, docs/gdd/15-qa-tooling.md §3, §8; WP H3): the agent builds the suites and the checker and makes them pass on the mock; the owner runs them on the live model.
// What is proved here: the checker catches each planted fault and says nothing of a clean game (and finds Class A at zero in a real mock game); the audience suite's labels are the engine's own verdicts and its scorer sees a reply
// that overturns one; the latency suite runs and reports; `--suite a,b` runs them in turn and writes one report; the playtest ends with the check; and the engine faults the checker found stay mended (a prisoner leads no one, a
// regent does what the house does).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

process.env.WC_PROVIDER = 'mock';
process.env.WC_SAVES = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-bench-v2-'));
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const run = promisify(execFile);
const { coherence, coherenceReport, verdict, readGame } = await import('../bench/lib/coherence.js');
const { createInitialState, applyChanges } = await import('../public/js/shared/world.js');
const { withRng } = await import('../public/js/engine/rng.js');
const { emit } = await import('../public/js/engine/facts/log.js');
const game = await import('../server/game.js');
const A = await import('../bench/lib/audience.js');
const L = await import('../bench/lib/latency.js');
const { sandbox } = await import('../bench/lib/sandbox.js');
const { runCall } = await import('../server/ai/client.js');
const { loadConfig } = await import('../server/llm.js');
test.after(() => fs.rmSync(process.env.WC_SAVES, { recursive: true, force: true }));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'wc-bench-v2-out-'));

const world = () => createInitialState('agot_298', 'stark', { seed: 298 });
let n = 0;
const F = (kind, o = {}) => ({ id: `f1.${++n}`, turn: 1, day: 100, kind, actors: [], houses: [], vis: { scope: 'public' }, importance: 2, text: `${kind}`, ...o });
const card = (o = {}) => ({ headline: 'A card', summary: 'It happened.', fact: 'f1.1', facts: ['f1.1'], ...o });
const rules = (xs) => xs.map((x) => x.rule);

// ── the checker, fault by fault ────────────────────────────────────────────────────────────────────────────────────────────

test('Class A: a dead character acting, a captive acting freely, two places in a day, an arrival with no setting out, a letter too soon, a card with no fact', () => {
  const state = world();
  state.post = [{ id: 'l1', to: 'x', toName: 'Someone', sentDay: 10, arriveDay: 10, status: 'in flight', days: 0 }];
  const facts = [
    F('death', { actors: ['edmure_tully'], day: 100 }), F('set_out', { actors: ['edmure_tully'], day: 105, data: { party: 'pe', to: 'stark' } }),
    F('captured', { actors: ['jon_snow'], day: 100 }), F('gift', { actors: ['jon_snow'], day: 103 }),
    F('arrived', { actors: ['robb_stark'], day: 110, place: 'stark', data: { party: 'p1' } }), F('arrived', { actors: ['robb_stark'], day: 110, place: 'karstark', data: { party: 'p2' } }),
  ];
  const r = coherence({ state, facts, turns: [{ turn: 1, events: [card({ fact: undefined, facts: [] })] }] });
  for (const rule of ['a dead character acts', 'a captive acts freely', 'in two places on one day', 'an arrival without a movement', 'a letter before it could arrive', 'a card with no fact']) assert.ok(rules(r.A).includes(rule), `${rule}: ${JSON.stringify(rules(r.A))}`);
  assert.equal(verdict(r).pass, false); assert.equal(verdict(r).A, false);
});

test('Class A is quiet about what is not a fault: a man set free the day he rides, a prisoner carried by a host, a party that did set out, a letter that lands the day after', () => {
  const state = world(); n = 0;
  state.post = [{ id: 'l1', to: 'x', toName: 'Someone', sentDay: 10, arriveDay: 12, delivered: 12, status: 'delivered', days: 2 }];
  const facts = [
    F('captured', { actors: ['jon_snow'], day: 100 }), F('set_out', { actors: ['jon_snow'], day: 105, data: { party: 'p1', to: 'stark' } }), F('released', { actors: ['jon_snow'], day: 105 }),
    F('captured', { actors: ['robb_stark'], day: 100 }), F('arrived', { actors: ['robb_stark'], day: 110, place: 'stark', data: { party: 'p1' } }),
  ];
  const r = coherence({ state, facts, turns: [{ turn: 1, events: [card({ fact: facts[0].id, facts: [facts[0].id] })] }] });
  assert.deepEqual(r.A, [], JSON.stringify(r.A));
});

test('Class B: a game word, an anachronism, a rumour told as fact, a place not on the route, a title not held', () => {
  const state = world(); n = 0;
  const pos = state.holdings.stark.pos;
  const route = F('set_out', { actors: ['jon_snow'], day: 100, place: 'stark', pos, data: { party: 'p1', to: 'stark' } });
  const rumour = F('rumour', { actors: [], day: 100 });
  const plain = F('feast', { actors: ['robb_stark'], day: 100 });
  const turns = [{ turn: 1, events: [
    card({ headline: 'The host numbers 3,000 strong', summary: 'It has importance 3.', fact: plain.id, facts: [plain.id] }),
    card({ headline: 'The Red Wedding is spoken of', summary: 'Nobody has heard such a thing.', fact: plain.id, facts: [plain.id] }),
    card({ headline: 'The Hightower is ruined', summary: 'It is so.', fact: rumour.id, facts: [rumour.id] }),
    card({ headline: 'Jon Snow rides for Highgarden', summary: 'He goes.', fact: route.id, facts: [route.id] }),
    card({ headline: 'King Edmure holds a feast', summary: 'There is a feast.', fact: plain.id, facts: [plain.id] }),
  ] }];
  const r = coherence({ state, facts: [route, rumour, plain], turns });
  for (const rule of ['a game word or a ledger phrase', 'an anachronism', 'a rumour told as fact', 'a place named that is not on the route', 'a title a character does not hold']) assert.ok(rules(r.B).includes(rule), `${rule}: ${JSON.stringify(rules(r.B))}`);
  assert.equal(verdict(r).B, false);
});

test('Class B is quiet about a clean card: a rumour that says whose word it is, a journey that names its own places, a king who is one', () => {
  const state = world(); n = 0;
  const pos = state.holdings.stark.pos;
  const route = F('set_out', { actors: ['jon_snow'], day: 100, place: 'stark', pos, data: { party: 'p1', to: 'stark' } });
  const rumour = F('rumour', { actors: [] });
  const turns = [{ turn: 1, events: [
    card({ headline: 'It is said the Hightower is ruined', summary: 'Men say so.', fact: rumour.id, facts: [rumour.id] }),
    card({ headline: 'Jon Snow rides for Winterfell', summary: 'He goes.', fact: route.id, facts: [route.id] }),
    card({ headline: 'King Robert holds a feast', summary: 'A great feast.', fact: route.id, facts: [route.id] }),
  ] }];
  const r = coherence({ state, facts: [route, rumour], turns });
  assert.deepEqual(r.B, [], JSON.stringify(r.B));
});

test('Class C: the same headline twice in ten turns, a digest and a Meanwhile over their budgets, the same decision three turns running', () => {
  const state = world(); n = 0; const f = F('feast', { actors: ['robb_stark'] });
  const ev = (h) => card({ headline: h, fact: f.id, facts: [f.id] });
  const mind = { actor: 'tywin_lannister', verb: 'raise_levies' };
  const turns = [
    { turn: 1, events: [ev('The same news')], minds: [mind], digest: { words: 30, meanwhile: '' } },
    { turn: 2, events: [ev('The same news')], minds: [mind], digest: { words: 120, meanwhile: Array(60).fill('word').join(' ') } },
    { turn: 3, events: [ev('Other news')], minds: [mind], digest: { words: 30, meanwhile: '' } },
  ];
  const r = coherence({ state, facts: [f], turns });
  for (const rule of ['the same headline twice in ten turns', 'a digest over its budget', 'a Meanwhile over its budget', 'the same decision three turns running']) assert.ok(rules(r.C).includes(rule), `${rule}: ${JSON.stringify(rules(r.C))}`);
  assert.deepEqual(r.A, []); assert.deepEqual(r.B, []);
});

test('the report: counts and verdicts first, then each class; and a verdict that passes says so', () => {
  const state = world(); n = 0; const f = F('feast', { actors: ['robb_stark'] });
  const r = coherence({ state, facts: [f], turns: [{ turn: 1, events: [card({ fact: f.id, facts: [f.id] })], digest: { words: 10, meanwhile: '' } }] });
  const text = coherenceReport(r, { title: 'Coherence — a test' });
  assert.match(text, /^## Coherence — a test/); assert.match(text, /\*\*Pass\.\*\*/); assert.match(text, /\| A — the story contradicts the world \| 0 \|/); assert.match(text, /### Class A\n- none/);
  const bad = coherence({ state, facts: [F('death', { actors: ['robb_stark'], day: 1 }), F('feast', { actors: ['robb_stark'], day: 2 })], turns: [] });
  assert.match(coherenceReport(bad), /\*\*Fail\.\*\*/); assert.match(coherenceReport(bad), /a dead character acts: Robb Stark/);
});

// ── a real game ────────────────────────────────────────────────────────────────────────────────────────────────────────────

test('a real mock game, a few jumps: nothing the story told contradicts the world (Class A is zero), and the game is read back whole', async () => {
  const { id } = game.newGame('agot_298', 'stark', { seed: 7 });
  for (let i = 0; i < 4; i++) { await game.advance(id, { span: '14d' }); await game.settled(id); }
  const g = readGame(game, id);
  assert.equal(g.turns.length, 4); assert.ok(g.facts.length > 100); assert.ok(g.turns.every((t) => t.events.length));
  const r = coherence(g);
  assert.deepEqual(r.A, [], `Class A: ${JSON.stringify(r.A.slice(0, 5))}`);
  assert.ok(verdict(r).B, `Class B: ${JSON.stringify(r.B.slice(0, 5))}`);
  assert.equal(r.stats.turns, 4);
});

// ── the faults the checker found in the engine, kept mended ───────────────────────────────────────────────────────────────

test('a prisoner leads no one: when a lord is taken or dies, the hosts he led go on without him', () => {
  for (const how of [{ status: 'imprisoned', note: 'Taken in the night' }, { alive: false, cause: 'a fever' }]) {
    const s = world(); const host = Object.values(s.parties).find((p) => p.commander && s.characters[p.commander]?.alive);
    assert.ok(host, 'a host with a commander'); const who = host.commander;
    withRng(s, () => applyChanges(s, [{ op: 'character', id: who, ...how }], { source: 'a test' }));
    assert.equal(s.parties[host.id].commander, null, `${how.status || 'dead'}: still led by ${who}`);
  }
});

test('what a house does as a house is done by its regent while the lord is a prisoner, and by no one named if there is none', () => {
  const s = world(); s.meta.clock = { from: 1000, to: 1007 };
  const lord = s.houses.tully.lord; const regent = 'edmure_tully';
  s.characters[lord].status = 'imprisoned'; s.houses.tully.regent = regent; s.characters[regent].alive = true;
  const a = withRng(s, () => emit(s, 'gift', { actors: [lord, 'robert_baratheon'], houses: ['tully', 'baratheon'] }));
  assert.deepEqual(a.actors.slice(0, 1), [regent], `the regent gives: ${a.actors}`);
  s.characters[regent].status = 'imprisoned'; // a regent in a cell rules no more than the lord he rules for
  const held = withRng(s, () => emit(s, 'gift', { actors: [lord, 'robert_baratheon'], houses: ['tully', 'baratheon'] }));
  assert.ok(!held.actors.includes(lord) && !held.actors.includes(regent), `neither prisoner gives: ${held.actors}`);
  s.characters[regent].status = 'free'; s.houses.tully.regent = null;
  const b = withRng(s, () => emit(s, 'gift', { actors: [lord, 'robert_baratheon'], houses: ['tully', 'baratheon'] }));
  assert.ok(!b.actors.includes(lord), 'a prisoner with no regent is not named as the giver');
  s.characters[lord].status = 'free';
  const c = withRng(s, () => emit(s, 'gift', { actors: [lord, 'robert_baratheon'], houses: ['tully', 'baratheon'] }));
  assert.equal(c.actors[0], lord, 'a free lord gives in his own name');
  const d = withRng(s, () => emit(s, 'death', { actors: [lord], houses: ['tully'] }));
  assert.deepEqual(d.actors, [lord], 'what is done to a man is still his');
});

test('the lord\'s own word is history too: a command the story tells nothing of has a card with a fact behind it (the live playtest found it without)', async () => {
  const { id } = game.newGame('agot_298', 'stark', { seed: 7 });
  const text = 'Let it be known throughout the North that House Stark mourns the old Hand.';
  game.setOrders(id, [{ id: 't1o0', text }]);
  await game.advance(id, { span: '7d', orders: game.loadState(id).orders }); await game.settled(id);
  const g = readGame(game, id);
  const given = g.facts.filter((f) => f.kind === 'order_given');
  assert.ok(given.length >= 1 && given.every((f) => f.cause?.type === 'order' && f.houses.includes('stark') && f.actors.includes('eddard_stark')), JSON.stringify(given));
  const card = g.turns[0].events.find((e) => e.orderId === 't1o0');
  assert.ok(card?.fact && given.some((f) => f.id === card.fact), `the card of the command names its fact: ${JSON.stringify(card?.fact)}`);
  assert.deepEqual(coherence(g).A, []);
});

test('only the lord\'s own people sit at his council: another house\'s maester is not asked, and so tells no house\'s books (found by the live playtest of a Blackwood game)', async () => {
  const { id } = game.newGame('agot_298', 'blackwood', { seed: 7 });
  await assert.rejects(game.council(id, ['luwin', 'rodrik_cassel', 'catelyn_stark'], 'How much coin have we?'), /no one of yours/);
  const own = Object.values(game.loadState(id).characters).find((c) => c.house === 'blackwood' && c.alive);
  const r = await game.council(id, [own.id], 'How fares the house?');
  assert.ok(r.replies.length >= 1 && r.replies.every((x) => x.speaker === own.id), JSON.stringify(r.replies.map((x) => x.speaker)));
});

// ── the audience suite ─────────────────────────────────────────────────────────────────────────────────────────────────────

test('the audience suite: eighty lines, labelled with the engine\'s own verdicts (a changed weighing shows here), ten kinds of words to eight people', () => {
  const suites = A.loadAudienceSuite(); const items = A.itemsOf(suites);
  assert.equal(items.length, 80); assert.equal(new Set(items.map((x) => x.id)).size, 80);
  assert.ok(new Set(items.map((x) => x.verdict)).size >= 5, 'the verdicts vary');
  for (const it of items) { const s = A.worldFor(it); assert.ok(s.characters[it.who]?.alive, `${it.id}: ${it.who} lives`); assert.equal(A.stanceOf(s, it).verdict, it.verdict, `${it.id}: the engine's verdict for "${it.words.slice(0, 50)}"`); }
  assert.equal(new Set(items.map((x) => x.who)).size, 8); assert.equal(new Set(items.map((x) => x.id.split('-').pop())).size, 10);
});

test('the audience scorer: a reply that overturns its verdict is seen — a refusal that promises, a yes that says no, a bargain that asks nothing, a promise from nothing', () => {
  const reply = (speech, agrees = [], extra = {}) => ({ beats: [{ kind: 'speech', text: speech }], outcome: { agrees_to: agrees, asks_for: '', reveals: 'none', mood: 'guarded', ...extra } });
  const promise = [{ kind: 'send_men', target: 'moat_cailin', by_days: 14 }];
  assert.equal(A.obeys(reply('No. I will not.'), 'refuse').ok, true);
  assert.match(A.obeys(reply('No.', promise), 'refuse').why, /promises/);
  assert.match(A.obeys(reply('Very well. You have my word.'), 'refuse').why, /says yes/);
  assert.match(A.obeys(reply('Ha.', [], { mood: 'warm' }), 'rage').why, /warm/);
  assert.match(A.obeys(reply('Perhaps.'), 'bargain').why, /asks for nothing/);
  assert.equal(A.obeys(reply('Perhaps.', [], { asks_for: 'a hostage' }), 'bargain').ok, true);
  assert.match(A.obeys(reply('I must think on it.', promise), 'stall').why, /promises/);
  assert.match(A.obeys(reply('I will not. Never.'), 'agree', { asked: promise }).why, /refuses/);
  assert.match(A.obeys(reply('Yes, my lord.'), 'agree', { asked: promise }).why, /promises nothing/);
  assert.equal(A.obeys(reply('Yes, my lord.', promise), 'agree', { asked: promise }).ok, true);
  assert.match(A.obeys(reply('Of course.', promise), null).why, /nothing was settled/);
  assert.match(A.obeys(null, 'agree').why, /no reply/);
});

test('the audience suite on the mock: every reply keeps to its verdict, first try; the report names the gates', async () => {
  const cfg = loadConfig();
  const read = (state, item, stance) => runCall('audience', state, { character: item.who, words: item.words, stance, face: true }, { cfg, provider: 'mock' });
  const r = await A.runAudienceSuite(read);
  assert.equal(r.n, 80); assert.equal(r.ok, 80, JSON.stringify(r.items.filter((x) => !x.ok).slice(0, 3))); assert.equal(r.fallback, 0); assert.equal(r.labelOff, 0);
  assert.ok(A.verdicts(r).every((v) => v.ok));
  const text = A.audienceReport(r, { reader: 'mock' });
  assert.match(text, /^# Audience suite — mock/); assert.match(text, /\| the reply keeps to the verdict \| 80 of 80 \(100 %\) \| 100 % \| ok \|/); assert.match(text, /\| refuse \|/);
  // a judge that is given scores the replies, and its mean is held to the gate
  const j = await A.runAudienceSuite(read, { limit: 5, judge: async () => ({ score: 3 }) });
  assert.equal(j.judged, 5); assert.equal(j.judge, 3); assert.equal(A.verdicts(j).at(-1).ok, false); assert.match(A.audienceReport(j), /judge/);
});

// ── the latency suite ──────────────────────────────────────────────────────────────────────────────────────────────────────

test('the latency suite on the mock: a few jumps, an audience, a receipt, each call timed; the report is against the pace of Q3', async () => {
  const sb = await sandbox({ root: ROOT, config: { ...loadConfig(), logCalls: true }, prefix: 'wc-latency-test-' });
  try {
    const r = await L.runLatencySuite({ game: sb.game, saves: sb.saves, jumps: 2, longSpan: '14d' });
    assert.equal(r.jumps7.length, 2); assert.ok(r.jumps7.every((x) => x.wall > 0 && x.phases.total > 0), JSON.stringify(r.jumps7[0]));
    assert.equal(r.jump30.span, '14d'); assert.ok(r.audience.ms >= 0 && !r.audience.error, JSON.stringify(r.audience)); assert.ok(r.receipt.ms >= 0 && !r.receipt.error, JSON.stringify(r.receipt));
    assert.ok(r.calls.length && r.calls.every((c) => c.n > 0 && c.p95 >= c.p50), 'the call log is read back per kind');
    const v = L.verdicts(r); assert.equal(v.length, 5); assert.ok(v.every((x) => x.ok), 'the mock is far inside the pace');
    const text = L.latencyReport(r, { reader: 'mock' });
    assert.match(text, /^# Latency suite — mock/); assert.match(text, /\| 7-day jump, median \|/); assert.match(text, /\| call \| attempts \|/); assert.match(text, /\| 14d \|/);
    assert.equal(L.verdicts({ ...r, jumps7: [{ wall: 80000 }], jump30: { wall: 1 } })[1].ok, false, 'a 7-day jump of 80 s is over the 95th-percentile gate');
  } finally { sb.dispose(); }
});

// ── the scripts ────────────────────────────────────────────────────────────────────────────────────────────────────────────

test('bench --suite a,b runs each in turn and writes one report with them all', async () => {
  const out = tmp();
  const { stdout } = await run(process.execPath, [path.join(ROOT, 'scripts', 'bench.js'), '--suite', 'audience,latency', '--mock', '--limit', '6', '--jumps', '1', '--long', '7d', '--out', out], { cwd: ROOT, env: { ...process.env, WC_PROVIDER: 'mock' }, maxBuffer: 1 << 24, timeout: 600000 });
  const files = fs.readdirSync(out); const stamp = new Date().toISOString().slice(0, 10);
  assert.ok(files.includes(`${stamp}.md`), files.join()); assert.ok(files.some((f) => f.startsWith('audience-mock')) && files.some((f) => f.startsWith('latency-mock')), files.join());
  const all = fs.readFileSync(path.join(out, `${stamp}.md`), 'utf8');
  assert.match(all, /^# Bench — mock/); assert.match(all, /- audience: every gate met/); assert.match(all, /- latency: every gate met/); assert.match(all, /# Audience suite/); assert.match(all, /# Latency suite/);
  assert.match(stdout, /All the reports in one/);
  const bad = await run(process.execPath, [path.join(ROOT, 'scripts', 'bench.js'), '--suite', 'audience,nonesuch', '--mock', '--out', out], { cwd: ROOT, env: { ...process.env, WC_PROVIDER: 'mock' } }).catch((e) => e);
  assert.equal(bad.code, 2); assert.match(String(bad.stderr), /No such suite: nonesuch/);
  fs.rmSync(out, { recursive: true, force: true });
});

test('scripts/coherence.js plays a game on the mock and checks it: the report, the JSON, the file', async () => {
  const out = tmp(); const file = path.join(out, 'report.md');
  const base = [path.join(ROOT, 'scripts', 'coherence.js'), '--play', 'stark', '--turns', '2', '--span', '7d', '--seed', '7'];
  const { stdout } = await run(process.execPath, [...base, '--json'], { cwd: ROOT, env: { ...process.env, WC_PROVIDER: 'mock' }, maxBuffer: 1 << 26, timeout: 600000 });
  const j = JSON.parse(stdout.trim().split('\n').at(-1));
  assert.equal(j.stats.turns, 2); assert.equal(j.verdict.pass, true, JSON.stringify(j.A.slice(0, 3))); assert.ok(Array.isArray(j.A) && Array.isArray(j.B) && Array.isArray(j.C));
  const t = await run(process.execPath, [...base, '--out', file], { cwd: ROOT, env: { ...process.env, WC_PROVIDER: 'mock' }, maxBuffer: 1 << 26, timeout: 600000 });
  assert.match(t.stdout, /^## Coherence — House Stark/m); assert.match(fs.readFileSync(file, 'utf8'), /### Class A/);
  const usage = await run(process.execPath, [path.join(ROOT, 'scripts', 'coherence.js')], { cwd: ROOT }).catch((e) => e); assert.equal(usage.code, 2);
  fs.rmSync(out, { recursive: true, force: true });
});

test('the playtest report ends with the coherence of the game just played (and a scratch directory takes it, so a test leaves nothing behind)', async () => {
  const out = tmp();
  await run(process.execPath, [path.join(ROOT, 'scripts', 'playtest.js'), '--house', 'stark', '--turns', '2', '--seed', '7', '--out', out], { cwd: ROOT, env: { ...process.env, WC_PROVIDER: 'mock' }, maxBuffer: 1 << 26, timeout: 900000 });
  const md = fs.readdirSync(out).find((f) => f.endsWith('.md')); assert.ok(md, fs.readdirSync(out).join());
  const text = fs.readFileSync(path.join(out, md), 'utf8');
  assert.match(text, /## Turn 2/); assert.match(text, /## Coherence\n/); assert.match(text, /\| A — the story contradicts the world \|/);
  fs.rmSync(out, { recursive: true, force: true });
});
