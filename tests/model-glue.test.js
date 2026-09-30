// The game and the local model working together (docs/local-ai, RECOMMENDATIONS R1, R3, R5; docs/gdd/04-ai-system.md §14): everything here
// runs on the mock and on a fake server — no live model. What is measured on the real one is in the owner's checklist (docs/HANDOFF.md).
//   config profile   WC_CONFIG names the file config.json would be (the live model's profile, kept apart from the game's folder)
//   the call log     `logCalls: true` keeps every attempt whole (prompt, reply, what the checks said) for the next fine-tune (R3)
//   the profile      docs/local-ai's routing (game-routing.json) is valid for the game: one model process, two aliases, no pinned slot
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
process.env.WC_SAVES = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-glue-'));
const cfgDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-glue-cfg-'));
const { loadConfig } = await import('../server/llm.js');
const { routeFor, routingProblems, CALL_DEFAULTS } = await import('../server/ai/models.js');
const game = await import('../server/game.js');

test('WC_CONFIG names the config file: a profile for the live model can live outside the game\'s folder', () => {
  const p = path.join(cfgDir, 'live.json'); fs.writeFileSync(p, JSON.stringify({ baseUrl: 'http://127.0.0.1:8096/v1', model: 'maester-12b', narratorMode: 'cards' }));
  const was = process.env.WC_CONFIG; const provider = process.env.WC_PROVIDER;
  try {
    process.env.WC_CONFIG = p; delete process.env.WC_PROVIDER;
    const c = loadConfig(); assert.equal(c.baseUrl, 'http://127.0.0.1:8096/v1'); assert.equal(c.model, 'maester-12b'); assert.equal(c.narratorMode, 'cards');
    assert.equal(c.provider, 'openai', 'the default provider is any OpenAI-compatible server');
    process.env.WC_PROVIDER = 'mock'; assert.equal(loadConfig().provider, 'mock', 'the tests\' own switch still wins');
    process.env.WC_CONFIG = path.join(cfgDir, 'missing.json'); assert.equal(loadConfig().baseUrl, 'http://localhost:1234/v1', 'a missing profile is the defaults, not a crash');
  } finally { if (was == null) delete process.env.WC_CONFIG; else process.env.WC_CONFIG = was; if (provider == null) delete process.env.WC_PROVIDER; else process.env.WC_PROVIDER = provider; }
});

test('the local model\'s routing (docs/local-ai/deploy/game-routing.json) is one process with two aliases: allowed with allowModelSwaps, never pinned', () => {
  const routing = {
    allowModelSwaps: true,
    models: { default: { model: 'maester-12b', slot: null }, narrate: { model: 'maester-12b:plain', slot: null }, letter: { model: 'maester-12b:plain', slot: null }, advisor: { model: 'maester-12b:plain', slot: null }, counsel: { model: 'maester-12b:plain', slot: null }, polish: { model: 'maester-12b:plain', slot: null }, probe: { model: 'maester-12b:plain', slot: null } },
    contextTokens: 65536,
  };
  assert.deepEqual(routingProblems(routing), []);
  assert.notDeepEqual(routingProblems({ ...routing, allowModelSwaps: false }), [], 'two names are two models to the game unless it is told they are one process');
  for (const kind of Object.keys(CALL_DEFAULTS)) { const r = routeFor(routing, kind); assert.equal(r.slot, null, kind); assert.ok(r.model.startsWith('maester-12b'), kind); assert.ok(r.deadlineSec > 0, `${kind} has a deadline`); }
  assert.equal(routeFor(routing, 'narrate').model, 'maester-12b:plain'); assert.equal(routeFor(routing, 'interpret').model, 'maester-12b');
  // a config that pins slots is ignored unless it says so: the game runs two minds at once, and two requests on one slot hang the server
  assert.equal(routeFor({ models: { mind: { model: 'x', slot: 1 } } }, 'mind').slot, null);
});

test('logCalls keeps every attempt whole for the next fine-tune: the prompt, the reply, and what the checks said of it', async () => {
  const p = path.join(cfgDir, 'log.json'); fs.writeFileSync(p, JSON.stringify({ logCalls: true }));
  const was = process.env.WC_CONFIG; process.env.WC_CONFIG = p; process.env.WC_PROVIDER = 'mock';
  try {
    const { id } = game.newGame('agot_298', 'stark', { seed: 7 });
    await game.advance(id, { span: '7d', orders: [{ text: 'Call the banners to Winterfell.' }] }); await game.settled(id);
    const f = path.join(process.env.WC_SAVES, id, 'llm-calls.jsonl');
    assert.ok(fs.existsSync(f), 'the log exists');
    const rows = fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    assert.ok(rows.length >= 1, `${rows.length} attempts logged`);
    for (const r of rows) {
      assert.ok(r.kind && Array.isArray(r.messages) && r.messages.length >= 2 && typeof r.reply === 'string', r.kind);
      assert.equal(typeof r.accepted, 'boolean'); assert.ok(Array.isArray(r.problems)); assert.equal(r.accepted, r.problems.length === 0);
      assert.ok(Number.isInteger(r.attempt));
    }
  } finally { if (was == null) delete process.env.WC_CONFIG; else process.env.WC_CONFIG = was; }
  // and off by default: a game with no such setting writes no such file
  const { id } = game.newGame('agot_298', 'stark', { seed: 8 });
  await game.advance(id, { span: '7d', orders: [] }); await game.settled(id);
  assert.ok(!fs.existsSync(path.join(process.env.WC_SAVES, id, 'llm-calls.jsonl')));
});

test('the owner\'s deploy files name the game\'s calls: every call kind of the game is routed by the profile, and the profile names no other', () => {
  const routing = JSON.parse(fs.readFileSync(path.join(here, '..', 'docs', 'local-ai', 'deploy', 'game-routing.json'), 'utf8'));
  assert.equal(routing.allowModelSwaps, true);
  const kinds = new Set(Object.keys(CALL_DEFAULTS));
  for (const k of Object.keys(routing.models)) assert.ok(k === 'default' || kinds.has(k), `${k} is a call of the game`);
  assert.deepEqual(routingProblems(routing), []);
});
