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
const { createInitialState } = await import('../public/js/shared/world.js');
const { emit, asEvent } = await import('../public/js/engine/facts/log.js');
const { dayNumber } = await import('../public/js/engine/time.js');
const { clusterFacts } = await import('../public/js/engine/facts/cluster.js');
const { numbersIn, namesIn, checkEvent } = await import('../server/ai/validate/narration.js');
const { anachronismsIn } = await import('../public/data/anachronisms.js');
const { CALLS } = await import('../server/ai/calls/index.js');
const { runCall } = await import('../server/ai/client.js');
const { narrateTurn } = await import('../server/narrator.js');
const game = await import('../server/game.js');

const world = () => createInitialState('agot_298', 'stark', { seed: 298 });
const week = (s) => { const d0 = dayNumber(s.meta.date); s.meta.clock = { turn: s.meta.turn + 1, from: d0 + 1, to: d0 + 7 }; return s; };

test('stories: facts that share a party, a cause or a place within two days are one; the small change is the Meanwhile', () => {
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
  // at most eight stories; the least of the rest are left to their own cards
  const many = Array.from({ length: 12 }, (_, k) => emit(s, 'feast', { actors: [], houses: ['tyrell'], place: Object.keys(s.holdings)[k * 3], on: 1 + (k % 7), importance: 2 + (k % 3) }));
  const big = clusterFacts(s, many);
  assert.ok(big.stories.length <= 8 && big.rest.length >= 4);
  assert.ok(Math.min(...big.stories.map((x) => x.importance)) >= Math.max(...big.rest.map((x) => x.importance)), 'the weightiest are told');
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
const badS2 = { ...good[1], line: 'Mace Tyrell feasted four hundred lords of the Reach at Highgarden.' };
// the fixture world's facts as the engine's cards
const fixture = () => { const s = world(); const args = CALLS.narrate.fixtureArgs(s); return { s, cards: s.facts.map((f) => asEvent(s, f, f.importance <= 1 ? { bg: true } : {})), args }; };

test('a telling with one false story keeps the true ones; the false one is told again alone, with what was wrong', async () => {
  const { srv, seen, url } = await fakeServer([JSON.stringify({ events: [good[0], badS2, good[2]], meanwhile: 'Poachers were hanged in the wolfswood.' }), JSON.stringify({ events: [good[1]], meanwhile: '' })]);
  try {
    const { s, cards } = fixture();
    const r = await narrateTurn(s, cards, { provider: 'openai', cfg: cfgFor(url) });
    assert.deepEqual([r.record.stories, r.record.told, r.record.again, r.record.plain], [3, 3, 1, 0]);
    assert.equal(seen.length, 2, 'the good stories were not asked for again');
    const again = seen[1].messages.at(-1).content;
    assert.match(again, /YOUR LAST TELLING OF S2 COULD NOT BE USED: numbers — 400 is not a number of this story/);
    assert.ok(!/^S1 /m.test(again) && /^S2 /m.test(again), 'the story told again alone');
    assert.equal(seen[1].response_format.json_schema.schema.properties.events.maxItems, 1);
    const told = r.cards.filter((c) => c.narrated);
    assert.deepEqual(told.map((c) => c.title).sort(), good.map((e) => e.headline).sort());
    const s1 = told.find((c) => c.title === good[0].headline);
    assert.equal(s1.details, good[0].scene); assert.equal(s1.facts.length, 2);
    assert.equal(s1.record.length, 2, 'the engine\'s lines it tells are kept with it');
    assert.ok(!r.cards.some((c) => !c.narrated && !c.bg), 'every engine card of news is told in its story');
    assert.equal(r.meanwhile, 'Poachers were hanged in the wolfswood.');
  } finally { srv.close(); }
});

test('told wrongly twice: the story is left to the engine\'s own plain words', async () => {
  const { srv, seen, url } = await fakeServer([JSON.stringify({ events: [good[0], badS2, good[2]], meanwhile: '' }), JSON.stringify({ events: [{ ...badS2, scene: 'Tywin Lannister toasted the bride.' }], meanwhile: '' })]);
  try {
    const { s, cards } = fixture();
    const r = await narrateTurn(s, cards, { provider: 'openai', cfg: cfgFor(url) });
    assert.equal(seen.length, 2, 'told again once, not more');
    assert.deepEqual([r.record.told, r.record.again, r.record.plain], [2, 1, 1]);
    const feast = s.facts.find((f) => f.kind === 'feast');
    assert.ok(r.cards.some((c) => c.fact === feast.id && !c.narrated), 'the feast keeps its engine card');
    assert.ok(r.record.problems.numbers >= 1 && r.record.problems.names >= 1, JSON.stringify(r.record.problems));
  } finally { srv.close(); }
});

test('a dead server: every story stays in the engine\'s words, and the turn goes on', async () => {
  const { s, cards } = fixture();
  const r = await narrateTurn(s, cards, { provider: 'openai', cfg: cfgFor('http://127.0.0.1:9/v1') });
  assert.equal(r.record.via, 'fallback'); assert.equal(r.record.plain, 3); assert.equal(r.cards, cards);
});

test('replay: a recorded telling with an invented number keeps its true stories and drops the false one', async () => {
  const { s, args } = fixture();
  const r = await runCall('narrate', s, args, { provider: 'replay' });
  assert.equal(r.via, 'replay'); assert.equal(r.partial, true);
  assert.deepEqual(r.value.events.map((e) => e.story), ['S1', 'S3']);
  assert.ok(r.problems.every((p) => p.startsWith('S2: ')) && r.problems.some((p) => /numbers/.test(p)), r.problems.join('; '));
});

// ── story-matches-map (15 §2): Stark, six turns as in the audit — every telling names people where the facts put them,
// and no one arrives anywhere without an arrival in its facts
async function sixTurns(provider) {
  process.env.WC_PROVIDER = provider;
  const { id } = game.newGame('agot_298', 'stark', { seed: 298 });
  const orders = [[{ text: 'Call the banners to Winterfell.' }, { text: 'Send Jon Snow to Castle Black.' }], [], [{ text: 'March the host to Moat Cailin.' }], [], [], []];
  const out = [];
  for (const o of orders) {
    const t = (await game.advance(id, { span: '7d', orders: o })).turn; await game.settled(id);
    out.push({ t, state: game.loadState(id), facts: game.readFacts(id, { from: t.turn, to: t.turn }) });
  }
  delete process.env.WC_PROVIDER;
  return out;
}
for (const provider of ['mock', 'replay']) {
  test(`story-matches-map on ${provider}: every telling is true to the map and the facts`, async () => {
    const turns = await sixTurns(provider);
    let narrated = 0;
    for (const { t, state, facts } of turns) {
      const byId = new Map(facts.map((f) => [f.id, f]));
      const n = t.narration; assert.ok(n, `turn ${t.turn} was told`);
      assert.equal(n.told + n.plain, n.stories, `turn ${t.turn}: every story told or left plain`);
      for (const e of t.events) {
        assert.ok(e.fact || e.facts?.length || e.orderId, `turn ${t.turn}: "${e.title}" stands on a fact`);
        if (!e.narrated) continue;
        narrated++;
        const fs_ = e.facts.map((id) => byId.get(id)); assert.ok(fs_.every(Boolean), `turn ${t.turn}: "${e.title}" tells facts of its turn`);
        const story = { id: 'S', facts: fs_, actors: [...new Set(fs_.flatMap((f) => f.actors))], place: e.where, houses: e.houses };
        assert.deepEqual(checkEvent(state, { headline: e.title, line: e.text, scene: e.details, pov: e.pov }, story), [], `turn ${t.turn}: "${e.title}"`);
      }
    }
    assert.ok(narrated >= 12, `the turns were told (${narrated} stories)`);
    if (provider === 'replay') {
      const all = turns.flatMap((x) => x.t.events);
      assert.ok(all.some((e) => e.narrated && /said Maester Luwin/.test(e.details || '')), 'the recorded telling of the first week is in the chronicle');
      assert.ok(!all.some((e) => /rode into Winterfell/.test(`${e.text} ${e.details || ''}`)), 'its invented arrival is not');
      assert.ok(turns[0].t.narration.plain >= 1 && turns[0].t.narration.problems.arrival >= 1);
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
  assert.ok(r.firstTry / r.stories >= 0.98, `the mock's plain telling passes the validator: ${r.firstTry}/${r.stories} — ${r.faultLines.join('; ')}`);
  assert.match(narrateReport(r, { reader: 'mock' }), /true on the first telling/);
});
