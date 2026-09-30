// The narrator (docs/gdd/04-ai-system.md §6; WP B8): stories from facts, a telling held to them, one more try for a
// story told wrongly, the engine's plain words when that fails too — and the chronicle never wrong: the scenario test
// story-matches-map of 15 §2 on the mock and on recorded replies.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

process.env.WC_SAVES = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-narrator-'));
// recorded replies for this file: the fixture world's, and one written below from the week the engine makes now (any
// change to the engine changes the week, so a recording kept in the repository would go stale)
process.env.WC_REPLAY_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-narrator-replay-'));
fs.mkdirSync(path.join(process.env.WC_REPLAY_DIR, 'narrate'));
fs.copyFileSync(new URL('./fixtures/model/narrate/fixture-world.json', import.meta.url), path.join(process.env.WC_REPLAY_DIR, 'narrate', 'fixture-world.json'));
const { createInitialState } = await import('../public/js/shared/world.js');
const { emit, asEvent } = await import('../public/js/engine/facts/log.js');
const { dayNumber } = await import('../public/js/engine/time.js');
const { clusterFacts } = await import('../public/js/engine/facts/cluster.js');
const { numbersIn, namesIn, checkEvent } = await import('../server/ai/validate/narration.js');
const { anachronismsIn } = await import('../public/data/anachronisms.js');
const { CALLS } = await import('../server/ai/calls/index.js');
const { runCall, readReply } = await import('../server/ai/client.js');
const { narrateTurn } = await import('../server/narrator.js');
const { writerEvent } = await import('../server/ai/calls/narrate.js');
const { scoreCard } = await import('../server/ai/validate/headline.js');
const { cardOf } = await import('../public/js/engine/facts/headline.js');
const { clearReplayCache } = await import('../server/ai/providers/replay.js');
const game = await import('../server/game.js');

const world = () => createInitialState('agot_298', 'stark', { seed: 298 });
const week = (s) => { const d0 = dayNumber(s.meta.date); s.meta.clock = { turn: s.meta.turn + 1, from: d0 + 1, to: d0 + 7 }; return s; };

test('stories: facts that share a party, a cause, or the same day, place and people are one; the small change is the Meanwhile', () => {
  const s = week(world());
  const o = { type: 'order', ref: 'o1' };
  const a = emit(s, 'levies_called', { actors: ['eddard_stark'], houses: ['stark'], place: 'stark', on: 1, cause: o });
  const b = emit(s, 'call_answered', { actors: ['greatjon_umber'], houses: ['umber'], place: 'umber', on: 2, cause: o, data: { men: 3800 } });
  const c = emit(s, 'set_out', { actors: ['jon_snow'], houses: ['stark'], place: 'stark', on: 6, data: { party: 'p_jon', to: 'nights_watch' } });
  const d = emit(s, 'arrived', { actors: ['jon_snow'], houses: ['stark'], place: 'nights_watch', on: 7, data: { party: 'p_jon' } });
  const e = emit(s, 'feast', { actors: ['mace_tyrell'], houses: ['tyrell'], place: 'tyrell', on: 3, importance: 2 });
  const f = emit(s, 'feast', { actors: ['mace_tyrell'], houses: ['tyrell'], place: 'tyrell', on: 6, importance: 2 }); // four days on: its own story
  const g = emit(s, 'happening', { houses: ['stark'], place: 'stark', on: 2, importance: 1, text: 'Poachers are hanged in the wolfswood.' });
  const { stories, meanwhile } = clusterFacts(s, [a, b, c, d, e, f, g]);
  const of = (x) => stories.find((st) => st.facts.includes(x));
  assert.equal(of(a), of(b), 'one order: one story'); assert.equal(of(c), of(d), 'one party: one story');
  assert.notEqual(of(a), of(c)); assert.notEqual(of(e), of(f), 'the same hall, days apart');
  assert.deepEqual(meanwhile, [g]);
  assert.equal(of(a).pov.id, 'eddard_stark'); assert.deepEqual(of(a).days, [1, 2]); assert.equal(of(a).importance, Math.max(a.importance, b.importance));
  assert.deepEqual(stories.map((x) => x.id), stories.map((_, k) => `S${k + 1}`));
  // no cap (18 §2.4 C6): twelve feasts in twelve halls are twelve stories, and none is left to `rest`
  const many = Array.from({ length: 12 }, (_, k) => emit(s, 'feast', { actors: [], houses: ['tyrell'], place: Object.keys(s.holdings)[k * 3], on: 1 + (k % 7), importance: 2 + (k % 3) }));
  const big = clusterFacts(s, many);
  assert.equal(big.stories.length, 12); assert.deepEqual(big.rest, []);
  // no one named: a witness of the place tells it
  const w = clusterFacts(s, [emit(s, 'village_burned', { houses: ['tully'], place: 'tully', on: 2 })]).stories[0];
  assert.match(w.pov.name, /at Riverrun$/);
});

test('the matchers: numbers in digits and words, names with bynames, a later chapter only once it has come', () => {
  assert.deepEqual(numbersIn('Some three thousand eight hundred men, a score of riders and 6,300 spears on the 3rd day of the 9th moon, 298 AC; two hundred a day; thousands more'), [6300, 3800, 20, 200]);
  const s = world();
  const found = namesIn(s, 'Jon Umber and Ser Wylis Manderly rode past the Twins while Lord Tywin waited.');
  assert.deepEqual(found.map((x) => [x.kind, x.id]), [['person', 'greatjon_umber'], ['person', 'wylis_manderly'], ['place', 'frey'], ['person', 'tywin_lannister']]);
  assert.deepEqual(namesIn(s, 'House Tully keeps Riverrun.').map((x) => x.id), ['tully'], 'a house is not its seat');
  assert.equal(anachronismsIn(s, 'They call him the King in the North.').length, 1);
  s.plots = { ...s.plots, log: [...(s.plots?.log || []), { thread: 'king_in_north', stage: 'crowned' }] };
  assert.equal(anachronismsIn(s, 'They call him the King in the North.').length, 0, 'once crowned, he may be called so');
  assert.equal(anachronismsIn(s, 'Word of the Red Wedding spread.').length, 1);
});

// a fake llama.cpp answering each request with the next reply of `script`
function fakeServer(script) {
  const seen = [];
  const srv = http.createServer((req, res) => {
    let body = ''; req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const j = JSON.parse(body); seen.push(j);
      const text = script[Math.min(seen.length - 1, script.length - 1)];
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ model: j.model, choices: [{ message: { content: text }, finish_reason: 'stop' }] }));
    });
  });
  return new Promise((resolve) => srv.listen(0, '127.0.0.1', () => resolve({ srv, seen, url: `http://127.0.0.1:${srv.address().port}/v1` })));
}
const cfgFor = (url) => ({ provider: 'openai', baseUrl: url, apiKey: '', model: '', temperature: 0.85, maxTokens: 6000, timeoutSec: 20, stream: false, thinking: 'off', extraBody: {} });
const ADV = (name) => JSON.parse(JSON.parse(fs.readFileSync(new URL(`./fixtures/model/adversarial/narrate-${name}.json`, import.meta.url), 'utf8')).reply);
const good = ADV('true-telling').events; // S1, S2, S3 of the fixture world, told well
// The banners (S1, great) and Jon Snow's ride (S3, news) are what the model is asked; the feast in the Reach (S2, minor) the writer tells alone.
const badS3 = { ...good[2], summary: 'Jon Snow left Winterfell for Castle Black with four hundred men of the household.' };
// the fixture world's facts as the engine's cards
const fixture = () => { const s = world(); const args = CALLS.narrate.fixtureArgs(s); return { s, cards: s.facts.map((f) => asEvent(s, f, f.importance <= 1 ? { bg: true } : {})), args }; };
const storyOfCard = (s, c) => clusterFacts(s, s.facts).stories.find((st) => c.facts.every((id) => st.facts.some((f) => f.id === id)));
const passes = (s, c) => { const st = storyOfCard(s, c); return st ? scoreCard({ headline: c.headline, summary: c.summary }, st, s) : { pass: false, faults: ['no story'] }; };

test('the model is asked for the top of the ranking, the writer tells the rest: the feast is never asked', async () => {
  const { srv, seen, url } = await fakeServer([JSON.stringify({ events: [good[0], good[2]], meanwhile: 'Poachers were hanged in the wolfswood.' })]);
  try {
    const { s, cards } = fixture();
    const r = await narrateTurn(s, cards, { provider: 'openai', cfg: cfgFor(url) });
    assert.deepEqual([r.record.stories, r.record.told, r.record.again, r.record.plain, r.record.written], [3, 2, 0, 0, 1]);
    assert.deepEqual(r.record.asked, ['S1', 'S3']); assert.equal(seen.length, 1);
    const ask = seen[0].messages.at(-1).content;
    assert.ok(/^S1 \[great/m.test(ask) && /^S3 \[/m.test(ask) && !/^S2 /m.test(ask), 'the sheets of the two stories asked, with their tiers; the feast is not in them');
    assert.match(ask, /DRAFT headline: Eddard Stark/); assert.match(ask, /DRAFT summary: /);
    assert.deepEqual(seen[0].response_format.json_schema.schema.properties.events.items.required, ['story', 'headline', 'summary', 'scene', 'pov']);
    const told = r.cards.filter((c) => c.narrated);
    assert.equal(told.length, 3, 'every story is one card');
    assert.deepEqual(told.map((c) => c.told).sort(), ['model', 'model', 'writer']);
    for (const c of told) {
      assert.ok(c.headline && c.summary && Array.isArray(c.details) && c.tier && Number.isFinite(c.score), c.headline);
      assert.equal(c.title, c.headline); assert.equal(c.text, c.summary);
      assert.deepEqual(passes(s, c).faults, [], `"${c.headline}" passes the scorer`);
    }
    assert.equal(told.find((c) => c.headline === good[0].headline).scene, good[0].scene, "the scene is the model's, the numbers in details the writer's");
    assert.ok(told.find((c) => c.headline === good[0].headline).details.some((d) => /3,800/.test(d)), "the engine's figure is in the fold");
    assert.equal(r.meanwhile, 'Poachers were hanged in the wolfswood.');
    assert.ok(!r.cards.some((c) => !c.narrated && !c.bg), 'every engine card of news is told in its story');
  } finally { srv.close(); }
});

test('a telling with one false story keeps the true ones; the false one is told again alone, with what was wrong', async () => {
  const { srv, seen, url } = await fakeServer([JSON.stringify({ events: [good[0], badS3], meanwhile: '' }), JSON.stringify({ events: [good[2]], meanwhile: '' })]);
  try {
    const { s, cards } = fixture();
    const r = await narrateTurn(s, cards, { provider: 'openai', cfg: cfgFor(url) });
    assert.deepEqual([r.record.stories, r.record.told, r.record.again, r.record.plain, r.record.written], [3, 2, 1, 0, 1]);
    assert.equal(seen.length, 2, 'the good story was not asked for again');
    const again = seen[1].messages.at(-1).content;
    assert.match(again, /YOUR LAST TELLING OF S3 COULD NOT BE USED: numbers — 400 is not a number of this story/);
    assert.ok(!/^S1 /m.test(again) && /^S3 /m.test(again), 'the story told again alone');
    assert.equal(seen[1].response_format.json_schema.schema.properties.events.maxItems, 1);
    const told = r.cards.filter((c) => c.narrated && c.told === 'model');
    assert.deepEqual(told.map((c) => c.headline).sort(), [good[0].headline, good[2].headline].sort());
    const s1 = told.find((c) => c.headline === good[0].headline);
    assert.equal(s1.facts.length, 2); assert.equal(s1.record.length, 2, "the engine's lines it tells are kept with it");
  } finally { srv.close(); }
});

test("told wrongly twice: the writer's card stands, never the engine's line", async () => {
  const { srv, seen, url } = await fakeServer([JSON.stringify({ events: [good[0], badS3], meanwhile: '' }), JSON.stringify({ events: [{ ...badS3, scene: 'Tywin Lannister toasted the bride.' }], meanwhile: '' })]);
  try {
    const { s, cards } = fixture();
    const r = await narrateTurn(s, cards, { provider: 'openai', cfg: cfgFor(url) });
    assert.equal(seen.length, 2, 'told again once, not more');
    assert.deepEqual([r.record.told, r.record.again, r.record.plain, r.record.written], [1, 1, 1, 1]);
    const jon = s.facts.find((f) => f.kind === 'set_out');
    const card = r.cards.find((c) => c.facts?.includes(jon.id));
    assert.ok(card.narrated && card.told === 'writer' && card.headline && card.summary, "a card of the writer's");
    assert.notEqual(card.summary, badS3.summary); assert.deepEqual(passes(s, card).faults, []);
    assert.ok(r.record.problems.numbers >= 1 && r.record.problems.names >= 1, JSON.stringify(r.record.problems));
  } finally { srv.close(); }
});

test("a dead server: every story is the writer's card, still true and still readable, and the turn goes on", async () => {
  const { s, cards } = fixture();
  const r = await narrateTurn(s, cards, { provider: 'openai', cfg: cfgFor('http://127.0.0.1:9/v1') });
  assert.equal(r.record.via, 'fallback'); assert.deepEqual([r.record.plain, r.record.written, r.record.told], [2, 1, 0]);
  const told = r.cards.filter((c) => c.narrated);
  assert.equal(told.length, 3); assert.ok(told.every((c) => c.told === 'writer'));
  for (const c of told) assert.deepEqual(passes(s, c).faults, [], c.headline);
  assert.ok(!r.cards.some((c) => !c.narrated && !c.bg), 'no engine line is left in the news');
  assert.ok(r.meanwhile && /\.$/.test(r.meanwhile), "the Meanwhile is the writer's sentence");
});

test('replay: a recorded telling with an invented number keeps its true stories and drops the false one', async () => {
  const { s, args } = fixture();
  const r = await runCall('narrate', s, args, { provider: 'replay' });
  assert.equal(r.via, 'replay', r.problems.join('; ')); assert.equal(r.partial, true);
  assert.deepEqual(r.value.events.map((e) => e.story), ['S1', 'S3']);
  assert.ok(r.problems.every((p) => p.startsWith('S2: ')) && r.problems.some((p) => /numbers/.test(p)), r.problems.join('; '));
});

test('the mock tells what the writer wrote, so CI runs the whole path and the mock is the readable baseline', async () => {
  const { s, args } = fixture();
  const r = await runCall('narrate', s, args, { provider: 'mock' });
  assert.equal(r.via, 'mock'); assert.deepEqual(r.problems, []);
  const { stories } = clusterFacts(s, s.facts);
  for (const e of r.value.events) { const c = cardOf(s, stories.find((x) => x.id === e.story)); assert.equal(e.headline, c.headline); assert.equal(e.summary, c.summary); }
});

// ── The headline validator on what a model may write (18 §5 N5): each bad telling is refused under its rule; the writer's card stands
test('bad model headlines are each refused under the right rule', () => {
  const { s, args } = fixture();
  const call = CALLS.narrate; const ctx = call.context(s, args); const schema = call.schema(ctx);
  const one = (over, story = 'S1') => { const base = good.find((e) => e.story === story); return readReply(JSON.stringify({ events: [{ ...base, ...over }], meanwhile: '' }), call, ctx, schema); };
  const said = (r, rule) => r.problems.some((p) => p.includes(`: ${rule} — `));
  assert.deepEqual(one({}).problems, [], 'the true telling passes (the control)');
  assert.ok(one({ headline: 'Lord Stark calls the banners of the North and all the sworn houses come to Winterfell in a great host' }).problems.length, 'a headline of many words');
  assert.ok(said(one({ headline: 'Lord Stark calls the banners of the North (again)' }), 'punct'), 'a bracket');
  assert.ok(said(one({ headline: 'Host of House Umber sets out from Last Hearth (~9 days)' }), 'boiler'), "the ledger's phrase");
  assert.ok(said(one({ headline: 'Lord Stark calls 3,800 men to Winterfell' }), 'numbers'), 'a digit string');
  assert.ok(said(one({ headline: 'Ser Barristan Selmy calls the banners at Winterfell' }), 'invented'), 'a man the story never names');
  assert.ok(said(one({ summary: 'Eddard Stark called his bannermen to Winterfell…' }), 'punct'), 'an ellipsis');
  assert.ok(said(one({ headline: 'Lord Stark calls the banners of the North', summary: 'Lord Stark calls the banners of the North.' }), 'dup'), 'a summary that is the headline again');
  assert.ok(said(one({ scene: 'Jon Umber rode into Winterfell at dusk.' }), 'arrival'), 'an arrival no fact records');
  assert.ok(said(one({ summary: 'Eddard Stark called his bannermen to Winterfell.伯' }), 'script'), 'a foreign script');
});

test('the role check: a slayer is never made the victim, in a headline the model writes', () => {
  const s = week(world());
  const f = emit(s, 'slain_in_battle', { actors: ['robb_stark'], houses: ['stark'], place: 'frey', on: 3, importance: 5, data: { by: 'tywin_lannister', how: 'battle' } });
  const { stories } = clusterFacts(s, [f]);
  const call = CALLS.narrate; const ctx = call.context(s, { stories, small: [] }); const schema = call.schema(ctx);
  const tell = (headline) => readReply(JSON.stringify({ events: [{ story: 'S1', headline, summary: 'Robb Stark fell at the Twins.', scene: '', pov: '' }], meanwhile: '' }), call, ctx, schema);
  assert.deepEqual(tell('Robb Stark slain by Tywin Lannister at the Twins').problems, []);
  assert.ok(tell('Tywin Lannister slain by Robb Stark at the Twins').problems.some((p) => /roles/.test(p)));
});

// ── story-matches-map (15 §2): Stark, six turns as in the audit — every telling names people where the facts put them,
// and no one arrives anywhere without an arrival in its facts
const MARK = 'The ravens were counted twice.';
const INVENTED = 'at dusk, roaring for ale';
// the first week, recorded as a model might tell it: every story true (the writer's words, and a line of colour), save one
// whose teller has a lord ride into his journey's end a fortnight early (B-03)
async function recordFirstWeek(orders) {
  process.env.WC_PROVIDER = 'mock';
  const { id } = game.newGame('agot_298', 'stark', { seed: 298 });
  const t = (await game.advance(id, { span: '7d', orders: orders[0] })).turn; await game.settled(id);
  const state = game.loadState(id); const byId = new Map(game.readFacts(id, { from: 1, to: 1 }).map((f) => [f.id, f]));
  const asked = new Set(t.narration.asked);
  const stories = t.narration.groups.map((g, k) => ({ id: `S${k + 1}`, facts: g.map((x) => byId.get(x)), pov: { name: '' } })).filter((st) => asked.has(st.id));
  const setOut = (st) => st.facts.find((f) => f.kind === 'set_out' && state.holdings[f.data?.to]);
  const liar = stories.findIndex((st) => setOut(st));
  const events = stories.map((st, k) => {
    const e = writerEvent(state, st);
    if (k !== liar) return { ...e, scene: `${e.summary} ${MARK}`.slice(0, 700) };
    const f = setOut(st); const who = state.characters[f.actors[0]]?.name;
    return { ...e, scene: `${who} rode into ${state.holdings[f.data.to].name} ${INVENTED}.` };
  });
  fs.writeFileSync(path.join(process.env.WC_REPLAY_DIR, 'narrate', 'first-week.json'), JSON.stringify({ kind: 'narrate', fingerprint: t.narration.key, model: 'written by the test', reply: JSON.stringify({ events, meanwhile: '' }) }));
  clearReplayCache();
  delete process.env.WC_PROVIDER;
  return liar >= 0;
}
async function sixTurns(provider) {
  process.env.WC_PROVIDER = provider;
  const { id } = game.newGame('agot_298', 'stark', { seed: 298 });
  const orders = [[{ text: 'Call the banners to Winterfell.' }, { text: 'Send Jon Snow to Castle Black.' }], [], [{ text: 'March the host to Moat Cailin.' }], [], [], []];
  const out = [];
  for (const o of orders) {
    const t = (await game.advance(id, { span: '7d', orders: o })).turn; await game.settled(id);
    out.push({ t, state: game.loadState(id), facts: game.readFacts(id, { from: 1, to: t.turn }) }); // (the news of an earlier week that reaches the house now is told from its own turn's facts)
  }
  delete process.env.WC_PROVIDER;
  return out;
}
for (const provider of ['mock', 'replay']) {
  test(`story-matches-map on ${provider}: every telling is true to the map and the facts, and reads as a card`, async () => {
    const liar = provider === 'replay' ? await recordFirstWeek([[{ text: 'Call the banners to Winterfell.' }, { text: 'Send Jon Snow to Castle Black.' }]]) : false;
    const turns = await sixTurns(provider);
    let narrated = 0;
    for (const { t, state, facts } of turns) {
      const byId = new Map(facts.map((f) => [f.id, f]));
      const n = t.narration; assert.ok(n, `turn ${t.turn} was told`);
      assert.equal(n.told + n.plain + n.written, n.stories, `turn ${t.turn}: every story told by the model, left to the writer after a failure, or written`);
      for (const e of t.events) {
        assert.ok(e.fact || e.facts?.length || e.orderId, `turn ${t.turn}: "${e.headline}" stands on a fact`);
        assert.ok(e.headline && typeof e.summary === 'string' && Array.isArray(e.details) && e.tier && Number.isFinite(e.score), `turn ${t.turn}: a card of the one shape: ${e.title}`);
        if (!e.narrated) continue;
        narrated++;
        const fs_ = e.facts.map((id) => byId.get(id)); assert.ok(fs_.every(Boolean), `turn ${t.turn}: "${e.headline}" tells facts of its turn`);
        const story = { id: 'S', facts: fs_, actors: [...new Set(fs_.flatMap((f) => f.actors))], place: e.where, houses: e.houses };
        assert.deepEqual(checkEvent(state, { headline: e.headline, summary: e.summary, scene: e.scene, pov: e.pov }, story), [], `turn ${t.turn}: "${e.headline}"`);
        if (!e.bg) assert.deepEqual(scoreCard({ headline: e.headline, summary: e.summary }, story, state).faults, [], `turn ${t.turn}: "${e.headline}" — "${e.summary}"`);
      }
    }
    assert.ok(narrated >= 12, `the turns were told (${narrated} stories)`);
    if (provider === 'replay') {
      const all = turns.flatMap((x) => x.t.events);
      assert.ok(all.some((e) => e.narrated && e.told === 'model' && (e.scene || '').includes(MARK)), 'the recorded telling of the first week is in the chronicle');
      assert.ok(!all.some((e) => `${e.summary} ${e.scene || ''}`.includes(INVENTED)), 'its invented arrival is not');
      assert.ok(liar, 'the week had a journey to tell falsely');
      assert.ok(turns[0].t.narration.plain >= 1 && turns[0].t.narration.problems.arrival >= 1, JSON.stringify(turns[0].t.narration));
    }
  });
}

test('the narrate suite: sixty weeks of twelve games; the mock tells them through the call and the validator', async () => {
  const { loadNarrateSuite, bundles, runNarrateSuite, narrateReport } = await import('../bench/lib/narrate.js');
  const suites = loadNarrateSuite();
  assert.equal(suites.flatMap((x) => x.games).length, 12);
  assert.equal(suites.flatMap((x) => x.games).reduce((n, g) => n + g.tell.length, 0), 60, 'sixty weeks');
  const list = await bundles({ suites, only: ['stark', 'greyjoy'] });
  assert.equal(list.length, 15);
  const r = await runNarrateSuite(list, (state, cards) => narrateTurn(state, cards, { provider: 'mock' }));
  assert.ok(r.stories >= 30, `${r.stories} stories`);
  assert.equal(r.firstTry, r.stories, `the mock's telling is the writer's, and passes the validator every time: ${r.firstTry}/${r.stories} — ${r.faultLines.join('; ')}`);
  assert.match(narrateReport(r, { reader: 'mock' }), /true on the first telling/);
});
