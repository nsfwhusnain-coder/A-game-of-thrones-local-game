// The contract every model call must keep (docs/gdd/04-ai-system.md §14), checked for every call in the registry, so a
// call is covered the moment it is added: its mock is schema-valid, its prompt fits its budget and matches its snapshot
// (tests/__snapshots__/prompts/<kind>.txt — a reviewer reads exactly what the model will be sent), a dead server gives
// the fallback instead of an exception, and the schema the server receives is strict. Then the adversarial fixtures
// (tests/fixtures/model/adversarial/): hand-written bad replies the checks must catch, and aliases that must resolve.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCall, readReply, budgetOf, CALLS } from '../server/ai/client.js';
import { buildEnum, enumFor, validate, canonicalize, wire, obj, str, int, arr, oneOf, enumProp, hasForeignScript, stripForeignScript } from '../server/ai/schema.js';
import { estimateTokens, loadConfig } from '../server/llm.js';
import { createInitialState } from '../public/js/shared/world.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SNAP = path.join(ROOT, 'tests', '__snapshots__', 'prompts');
const ADV = path.join(ROOT, 'tests', 'fixtures', 'model', 'adversarial');
const world = () => createInitialState('agot_298', 'stark', { seed: 298 });
const dead = { ...loadConfig(), provider: 'openai', baseUrl: 'http://127.0.0.1:9/v1', timeoutSec: 3 };
// a snapshot shows the schema's shape; an enum of the whole world's names is shown by its first members and its size
const brief = (x) => (Array.isArray(x) ? x.map(brief) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, k === 'enum' && v.length > 30 ? [...v.slice(0, 12), `… ${v.length} members`] : brief(v)])) : x);

// strict mode: every object says additionalProperties:false and requires every property; no private keys on the wire
function strict(schema, at = '$') {
  const out = [];
  if (schema.type === 'object') {
    if (schema.additionalProperties !== false) out.push(`${at}: additionalProperties must be false`);
    const keys = Object.keys(schema.properties || {}); if (JSON.stringify([...(schema.required || [])].sort()) !== JSON.stringify([...keys].sort())) out.push(`${at}: every property must be required`);
    for (const [k, s] of Object.entries(schema.properties || {})) out.push(...strict(s, `${at}.${k}`));
  }
  if (schema.type === 'array') out.push(...strict(schema.items, `${at}[]`));
  if (JSON.stringify(schema).includes('"x-')) out.push(`${at}: private keys on the wire`);
  return out;
}

for (const [kind, call] of Object.entries(CALLS)) {
  test(`${kind}: the mock is schema-valid, the prompt fits its budget and its snapshot`, async () => {
    const state = world(); const args = call.fixtureArgs?.(state) || {};
    const r = await runCall(kind, state, args, { provider: 'mock' });
    assert.equal(r.via, 'mock', r.problems.join('; ')); assert.deepEqual(r.problems, []);
    const ctx = call.context(state, args); const messages = call.prompt(ctx);
    const tokens = estimateTokens(messages.map((m) => m.content).join('\n'));
    assert.ok(tokens <= budgetOf(kind).in, `${kind}: prompt ${tokens} tokens, budget ${budgetOf(kind).in}`);
    const text = messages.map((m) => `### ${m.role.toUpperCase()}\n${m.content}`).join('\n\n') + `\n\n### SCHEMA\n${JSON.stringify(brief(wire(call.schema(ctx))), null, 1)}\n`;
    const file = path.join(SNAP, `${kind}.txt`);
    if (process.env.UPDATE_SNAPSHOTS === '1' || !fs.existsSync(file)) { fs.mkdirSync(SNAP, { recursive: true }); fs.writeFileSync(file, text); }
    assert.equal(text.replace(/\r\n/g, '\n'), fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'), `the ${kind} prompt changed: review it, then run UPDATE_SNAPSHOTS=1 npm test`);
  });
  test(`${kind}: a dead server gives the fallback, never an exception; the wire schema is strict`, async () => {
    const state = world(); const args = call.fixtureArgs?.(state) || {};
    const r = await runCall(kind, state, args, { cfg: dead });
    assert.equal(r.via, 'fallback'); assert.ok(r.problems.some((p) => /could not be reached/.test(p)), r.problems.join('; '));
    assert.deepEqual(strict(wire(call.schema(call.context(state, args)))), []);
  });
}

test('adversarial replies: each is accepted or refused as its fixture says, and aliases become ids', () => {
  const files = fs.readdirSync(ADV).filter((f) => f.endsWith('.json'));
  assert.ok(files.length >= 3);
  for (const f of files) {
    const fx = JSON.parse(fs.readFileSync(path.join(ADV, f), 'utf8'));
    const call = CALLS[fx.kind]; assert.ok(call, `${f}: unknown call ${fx.kind}`);
    const state = world(); const ctx = call.context(state, fx.args || call.fixtureArgs?.(state) || {});
    // `$PLACE(hook)` is the first place the world offers for that hook (the offer moves as the map grows: a fixture should not hold a place by name)
    const fill = (t) => (typeof t === 'string' ? t.replace(/\$PLACE\((\w+)\)/g, (_, hook) => ctx.hooks?.find((h) => h.id === hook)?.places[0] ?? '') : t);
    const { value, problems } = readReply(fill(fx.reply), call, ctx, call.schema(ctx));
    if (fx.expect === 'accept') {
      assert.deepEqual(problems, [], `${f}: ${problems.join('; ')}`);
      for (const [k, v] of Object.entries(fx.canonical || {})) assert.deepEqual(k.split('.').reduce((x, key) => x?.[key], value), fill(v), `${f}: ${k}`);
    } else {
      assert.ok(problems.length, `${f}: should have been refused`);
      if (fx.problem) assert.ok(problems.some((p) => p.includes(fx.problem)), `${f}: ${problems.join('; ')}`);
    }
  }
});

test('enums: every natural name is a member, and no member is a prefix of another thing\'s', () => {
  const s = world();
  const places = enumFor(s, 'place');
  for (const m of ['the_wall', 'castle_black', 'winterfell', 'the_twins', 'kings_landing', 'dragonstone', 'storms_end']) assert.ok(places.members.includes(m), m);
  assert.equal(places.canon.get('the_wall'), 'nights_watch'); assert.equal(places.canon.get('dragonstone'), 'baratheon_ds');
  // no member is a strict prefix of a member naming another place
  const ms = places.members;
  for (const a of ms) for (const b of ms) if (a !== b && b.startsWith(a)) assert.equal(places.canon.get(a), places.canon.get(b), `${a} < ${b}`);
  // every place keeps a name
  assert.ok(new Set(places.canon.values()).size >= Object.keys(s.holdings).length);
  const people = enumFor(s, 'person', { ids: new Set(Object.values(s.characters).filter((c) => c.house === 'stark' && c.alive).map((c) => c.id)) });
  assert.equal(people.canon.get('ned'), 'eddard_stark');
  assert.ok(!people.members.some((m) => people.canon.get(m) !== 'jon_snow' && m.startsWith('jon') && people.members.includes('jon')), 'Jon is not a prefix of another Stark');
});

test('buildEnum drops the clashing name that its thing can spare', () => {
  const m = new Map([['baratheon', 'baratheon'], ['kings_landing', 'baratheon'], ['baratheon_ds', 'baratheon_ds'], ['dragonstone', 'baratheon_ds'], ['jon', 'jon_snow'], ['jon_snow', 'jon_snow'], ['jonos_bracken', 'jonos_bracken']]);
  const en = buildEnum(m);
  assert.ok(en.members.includes('kings_landing') && en.members.includes('dragonstone'));
  assert.ok(!(en.members.includes('baratheon') && en.members.includes('baratheon_ds')), 'the clash is gone');
  assert.ok(!en.members.includes('jon'), 'the nickname that shadowed Jonos goes');
  assert.deepEqual(en.unresolved, []);
});

test('the validator speaks the JSON Schema we send, and canonicalize follows the schema', () => {
  const en = buildEnum(new Map([['the_wall', 'nights_watch'], ['nights_watch', 'nights_watch'], ['winterfell', 'stark'], ['stark', 'stark']]));
  const schema = obj({ to: enumProp(en, 'place'), men: int(0, 100), note: str(10), tags: arr(oneOf(['a', 'b']), { max: 2 }) });
  assert.deepEqual(validate({ to: 'the_wall', men: 5, note: 'ok', tags: ['a'] }, schema), []);
  const bad = validate({ to: 'the_twins', men: 500, note: 'far too long a note', tags: ['a', 'b', 'c'], extra: 1 }, schema);
  for (const want of ['not one of', 'above 100', 'longer than 10', 'more than 2', 'not allowed']) assert.ok(bad.some((p) => p.includes(want)), want);
  assert.ok(validate({ to: 'stark' }, schema).some((p) => p.includes('missing')));
  const v = canonicalize({ to: 'the_wall', men: 5, note: '', tags: [] }, schema, { place: en.canon });
  assert.equal(v.to, 'nights_watch');
  assert.ok(!JSON.stringify(wire(schema)).includes('x-canon'));
});

test('a foreign script in the prose is caught (the Qwen leak) and can be stripped', () => {
  assert.ok(hasForeignScript('Lord Um伯 rode south')); assert.ok(hasForeignScript('Winterfell,摆 the gates'));
  assert.ok(!hasForeignScript('Ser Waymar Royce — “Dáreon”, the Lord’s … naïve')); // accents and typographic marks are Westerosi enough
  assert.equal(stripForeignScript('Lord Um伯 rode to Winterfell,摆 at dawn.'), 'Lord Um rode to Winterfell, at dawn.');
});
