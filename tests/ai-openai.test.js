// What the owner's server receives (docs/gdd/04-ai-system.md §3, §11.3), checked against a fake OpenAI-compatible
// server in the test: the reply shape is grammar-constrained (response_format json_schema, strict, no private keys),
// thinking is off, the prompt cache is kept, the call goes to its routed model and slot at its temperature and budget,
// a reply that fails the checks is asked for once more with the problems named, and a second failure falls back.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { runCall } from '../server/ai/client.js';
import { routeFor, routingProblems } from '../server/ai/models.js';
import { createInitialState } from '../public/js/shared/world.js';

// a fake llama.cpp: answers each request with the next reply of `script`, streaming it like the real server
function fakeServer(script) {
  const seen = [];
  const srv = http.createServer((req, res) => {
    let body = ''; req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const j = JSON.parse(body); seen.push(j);
      const text = script[Math.min(seen.length - 1, script.length - 1)];
      if (j.stream) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.write(`data: ${JSON.stringify({ model: j.model, choices: [{ delta: { content: text } }] })}\n\n`);
        res.write(`data: ${JSON.stringify({ model: j.model, choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 100, completion_tokens: 20 } })}\n\n`);
        res.end('data: [DONE]\n\n');
      } else { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ model: j.model, choices: [{ message: { content: text }, finish_reason: 'stop' }] })); }
    });
  });
  return new Promise((resolve) => srv.listen(0, '127.0.0.1', () => resolve({ srv, seen, url: `http://127.0.0.1:${srv.address().port}/v1` })));
}
const world = () => createInitialState('agot_298', 'stark', { seed: 298 });
const cfgFor = (url, extra = {}) => ({ provider: 'openai', baseUrl: url, apiKey: '', model: '', temperature: 0.85, maxTokens: 6000, timeoutSec: 20, stream: true, thinking: 'auto', thinkingBudget: 6000, reasoningEffort: '', extraBody: {}, ...extra });

test('the request is grammar-constrained, thinking off, routed to its model and slot', async () => {
  const { srv, seen, url } = await fakeServer(['{"place":"the_wall","words":"Winter is Coming"}']);
  try {
    const cfg = cfgFor(url, { pinSlots: true, models: { default: { model: 'gemma4-26b-a4b' }, probe: { slot: 1 } } });
    const r = await runCall('probe', world(), {}, { cfg });
    assert.equal(r.via, 'model'); assert.equal(r.value.place, 'nights_watch', 'the alias was canonicalised');
    const body = seen[0];
    assert.equal(body.model, 'gemma4-26b-a4b');
    assert.equal(body.id_slot, 1);
    assert.equal(body.cache_prompt, true);
    assert.equal(body.temperature, routeFor(cfg, 'probe').temperature);
    assert.equal(body.max_tokens, routeFor(cfg, 'probe').maxTokens, 'the reply budget, and no thinking budget on top');
    assert.deepEqual(body.chat_template_kwargs, { enable_thinking: false });
    assert.equal(body.response_format.type, 'json_schema');
    assert.equal(body.response_format.json_schema.strict, true);
    const schema = body.response_format.json_schema.schema;
    assert.ok(schema.properties.place.enum.includes('the_wall') && schema.properties.place.enum.includes('castle_black'));
    assert.ok(!JSON.stringify(schema).includes('x-canon'), 'no private keys reach the server');
    assert.match(body.messages[0].content, /^THE WORLD/, 'the static primer comes first, for the prompt cache');
  } finally { srv.close(); }
});

test('a reply that fails the checks is asked for again with the problems named; twice wrong falls back', async () => {
  const { srv, seen, url } = await fakeServer(['{"place":"the_twins","words":"Winter is Coming"}', '{"place":"castle_black","words":"Winter is Coming"}']);
  try {
    const r = await runCall('probe', world(), {}, { cfg: cfgFor(url) });
    assert.equal(r.via, 'model'); assert.equal(r.value.place, 'nights_watch');
    assert.equal(seen.length, 2);
    assert.match(seen[1].messages.at(-1).content, /rode to frey, not to the Wall/, 'the retry says what was wrong');
  } finally { srv.close(); }
  const bad = await fakeServer(['{"place":"the_twins","words":"x"}']);
  try {
    const r = await runCall('probe', world(), {}, { cfg: cfgFor(bad.url) });
    assert.equal(r.via, 'fallback'); assert.equal(bad.seen.length, 2, 'one retry, no more');
    assert.ok(r.problems.some((p) => /not to the Wall/.test(p)));
  } finally { bad.srv.close(); }
});

test('an unreadable reply is a problem, not a crash', async () => {
  const { srv, url } = await fakeServer(['I think Jon rides to the Wall.']);
  try {
    const r = await runCall('probe', world(), {}, { cfg: cfgFor(url) });
    assert.equal(r.via, 'fallback'); assert.ok(r.problems.some((p) => /unreadable/.test(p)), r.problems.join('; '));
  } finally { srv.close(); }
});

test('calls of one jump on different models are a problem unless swaps are allowed', () => {
  assert.deepEqual(routingProblems({ models: { default: { model: 'gemma4-26b-a4b' } } }), []);
  const mixed = { models: { default: { model: 'gemma4-26b-a4b' }, narrate: { model: 'qwen3.6-35b-a3b' } } };
  assert.equal(routingProblems(mixed).length, 1);
  assert.deepEqual(routingProblems({ ...mixed, allowModelSwaps: true }), []);
  assert.equal(routeFor(mixed, 'narrate').model, 'qwen3.6-35b-a3b'); assert.equal(routeFor(mixed, 'mind').model, 'gemma4-26b-a4b');
  assert.equal(routeFor(mixed, 'mind').temperature, 0.6, 'the GDD temperature when the config says none');
});

test('no slot is pinned unless the owner asks, and a server that never answers costs the call its deadline, not half an hour', async () => {
  // llama.cpp livelocks with two requests pinned to one slot (#28280): the game sends id_slot only when config.json says pinSlots
  const { srv, seen, url } = await fakeServer(['{"place":"the_wall","words":"Winter is Coming"}']);
  try {
    const cfg = cfgFor(url, { models: { default: { model: 'x' }, probe: { slot: 1 } } });
    assert.equal(routeFor(cfg, 'probe').slot, null); assert.equal(routeFor({ ...cfg, pinSlots: true }, 'probe').slot, 1);
    await runCall('probe', world(), {}, { cfg });
    assert.ok(!('id_slot' in seen[0]), 'no id_slot on the wire');
  } finally { srv.close(); }
  // the deadlines of the calls: a tuned local model needs seconds, so ninety is a hung server
  assert.equal(routeFor({}, 'interpret').deadlineSec, 90); assert.equal(routeFor({}, 'narrate').deadlineSec, 300);
  assert.equal(routeFor({ deadlines: { mind: 20 } }, 'mind').deadlineSec, 20); assert.equal(routeFor({ models: { mind: { deadlineSec: 0 } } }, 'mind').deadlineSec, 0, '0 is no limit');
  // a server that answers its headers and then keeps the socket warm with pings for ever: the idle timeout never fires
  const hang = http.createServer((req, res) => { req.resume(); res.writeHead(200, { 'Content-Type': 'text/event-stream' }); const iv = setInterval(() => res.write(': ping\n\n'), 100); req.on('close', () => clearInterval(iv)); res.on('close', () => clearInterval(iv)); });
  await new Promise((r) => hang.listen(0, '127.0.0.1', r));
  try {
    const t0 = Date.now();
    const r = await runCall('probe', world(), {}, { cfg: cfgFor(`http://127.0.0.1:${hang.address().port}/v1`, { timeoutSec: 60, deadlines: { probe: 1 } }) });
    assert.equal(r.via, 'fallback'); assert.ok(r.problems.some((p) => /did not answer within 1s/.test(p)), r.problems.join('; '));
    assert.ok(Date.now() - t0 < 6000, `the call gave up in ${Date.now() - t0} ms`);
  } finally { hang.closeAllConnections?.(); hang.close(); }
});
