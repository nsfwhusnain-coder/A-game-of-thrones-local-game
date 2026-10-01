// The Weaver (docs/gdd/04-ai-system.md §10; WP H2): rare, optional, off by default; a rule the model writes is checked in the sandboxed DSL BEFORE it is accepted, must cite the fact that justifies it, never changes the
// player's own house, and costs nothing if the reply is bad. No live model: the mock is the engine's own reading of the same facts. Held: the DSL refuses what is not a number-making expression of the names it may read; the call's
// schema is strict and its check refuses an unoffered fact, a house the fact does not name, the lord's own house and a formula that does not run; the mock gives a rule that compiles; the orchestrator does nothing while
// the Weaver is off, asks at most once a game month, applies an ordinary `inject_rule` op, and replays a turn without asking again.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.WC_PROVIDER = 'mock';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { createInitialState } = await import('../public/js/shared/world.js');
const { compileRule, RuleError, RULE_KINDS, liveRules, describeRules } = await import('../public/js/shared/rules.js');
const W = await import('../server/ai/calls/weaver.js');
const { weaveWeek, weaverOn, WEAVER_DAYS } = await import('../server/weaver.js');
const { runCall, readReply, CALLS } = await import('../server/ai/client.js');
const { fact } = await import('../public/js/engine/facts/log.js');
const { loadConfig } = await import('../server/llm.js');
const { dayNumber } = await import('../public/js/engine/time.js');
const { withRng, makeRng, seedState } = await import('../public/js/engine/rng.js').then((m) => ({ ...m, withRng: m.withRng }));

const world = () => createInitialState('agot_298', 'stark', { seed: 298 });
const embargo = (s, houses = ['tully', 'lannister'], extra = {}) => fact(s, 'embargo', { title: 'The Riverlands close their roads', text: 'The Riverlands close their roads to Lannister goods.', houses, importance: 2, day: dayNumber(s.meta.date), ...extra }, { actors: [] });
const spec = (over = {}) => ({ house: 'tully', name: 'A smuggling ring', kind: 'income', vars: { runners: 2 }, grow: 'min(40, v.runners + 3 * months)', formula: 'v.runners * 12 * luck * months', when: 'house.treasury > 100', ...over });

test('the DSL: the templates compile for the houses that may have them, and what is not a sum of the names a rule may read is refused', async () => {
  const s = world();
  for (const house of ['tully', 'frey', 'lannister', 'tyrell', 'greyjoy', 'martell']) for (const kind of W.WEAVE_KINDS) {
    const t = CALLS.weaver.mock({ state: s, facts: [{ id: 'f', kind, text: 'x', houses: [house] }] }).rules[0]; assert.ok(t, `${kind} gives a rule`);
    const c = compileRule(s, W.specOf(t)); assert.equal(c.house, house); assert.ok(RULE_KINDS.includes(c.kind)); assert.ok(c.formula.length > 3);
  }
  const bad = [
    ['house.secret * 2', 'a name a rule cannot read'], ['process.exit(1)', 'a function that is not there'], ['v.runners = 5', 'an assignment'], ['constructor.constructor("return 1")()', 'a way out of the sandbox'],
    ['while(1){}', 'a loop'], ['', 'nothing'], ['((', 'a broken sum'], ['house.treasury ?? "x"', 'a string'], ['__proto__.x', 'the prototype'],
  ];
  for (const [formula, why] of bad) assert.throws(() => compileRule(s, spec({ formula })), RuleError, `${why}: ${formula}`);
  // what is only odd arithmetic is made safe, not refused: a rule can never be handed an infinity or a NaN to put in the ledger
  const { compile, run, houseScope } = await import('../public/js/shared/rules.js'); const sc = houseScope(s, s.houses.tully, { months: 1, luck: 1, gross: 0 }); sc.v.runners = 2;
  for (const f of ['1 / 0', '9 ** 9 ** 9 ** 9', 'sqrt(-1)']) assert.ok(Number.isFinite(run(compile(f), sc)), `${f} is a number`);
  assert.throws(() => compileRule(s, spec({ kind: 'prestige' })), RuleError, 'a kind that is not one'); assert.throws(() => compileRule(s, spec({ name: '' })), RuleError, 'a rule the steward cannot write down');
  assert.throws(() => compileRule(s, spec({ house: 'nowhere' })), RuleError); assert.throws(() => compileRule(s, spec({ grow: 'v.nothing + 1' })), RuleError, 'a quantity it did not declare');
});

test('the call: a strict schema over the facts offered; the check refuses an unoffered fact, a house the fact does not name, the lord\'s own house and a formula that does not run', async () => {
  const s = world(); const args = CALLS.weaver.fixtureArgs(s); const ctx = CALLS.weaver.context(s, args); const schema = CALLS.weaver.schema(ctx);
  const strict = (x, at = '$') => { const out = []; if (x.type === 'object') { if (x.additionalProperties !== false) out.push(at); if (JSON.stringify([...(x.required || [])].sort()) !== JSON.stringify(Object.keys(x.properties).sort())) out.push(`${at} required`); for (const [k, v] of Object.entries(x.properties)) out.push(...strict(v, `${at}.${k}`)); } if (x.type === 'array') out.push(...strict(x.items, `${at}[]`)); return out; };
  assert.deepEqual(strict(schema), [], 'strict mode'); assert.equal(schema.properties.rules.maxItems, 1, 'one rule at most');
  const item = schema.properties.rules.items.properties; assert.deepEqual(item.kind.enum, RULE_KINDS); assert.deepEqual(item.cite.enum, ['f_weave']); assert.deepEqual(item.house.enum, ['tully']);
  const good = { cite: 'f_weave', house: 'tully', name: 'A smuggling ring', kind: 'income', var: 'runners', start: 2, grow: 'min(40, v.runners + 3 * months)', formula: 'v.runners * 12 * luck * months', when: 'house.treasury > 100', note: 'Goods cross anyway.' };
  const ask = (r) => readReply(JSON.stringify({ rules: [r] }), CALLS.weaver, ctx, schema).problems;
  assert.deepEqual(ask(good), [], 'a good rule passes'); assert.deepEqual(readReply('{"rules":[]}', CALLS.weaver, ctx, schema).problems, [], 'none is an answer');
  assert.ok(ask({ ...good, cite: 'f_other' }).length, 'a fact that was not offered'); assert.ok(ask({ ...good, house: 'lannister' }).length, 'a house the fact does not name');
  assert.ok(ask({ ...good, formula: 'house.nothing * 3' }).some((p) => /formula/.test(p)), 'a name it cannot read'); assert.ok(ask({ ...good, kind: 'prestige' }).length, 'a kind outside the enum');
  assert.ok(ask({ ...good, formula: 'v.runners * 1e9 / 0' }).length, 'not a number'); assert.ok(ask({ ...good, name: 'Ring 戒' }).length, 'a script that is not the realm\'s');
  const own = { ...ctx, facts: [{ id: 'f_weave', kind: 'embargo', text: 'x', houses: ['stark'] }] };
  assert.ok(CALLS.weaver.check({ rules: [{ ...good, house: 'stark' }] }, own).some((p) => /own house/.test(p)), 'the lord\'s own house is not given a custom by the model');
});

test('the facts it is offered: recent, of a kind that leaves something lasting, of a house that is not the player\'s; the mock reads them plainly and the same way every time', () => {
  const s = world(); assert.deepEqual(W.weaverFacts(s), [], 'at the start the story has made nothing');
  const a = embargo(s, ['tully', 'lannister']); embargo(s, ['stark']); fact(s, 'wedding', { title: 'A wedding', text: 'x', houses: ['frey'], importance: 2, day: dayNumber(s.meta.date) }, { actors: [] });
  const old = embargo(s, ['frey']); s.facts.find((x) => x.id === old.fact).day = dayNumber(s.meta.date) - 90; // three moons ago
  const offer = W.weaverFacts(s); assert.deepEqual(offer.map((f) => f.id), [a.fact]); assert.equal(offer.length, 1, 'only the Riverlands\' embargo: not the lord\'s own, not a wedding, not one of three moons ago'); assert.deepEqual(offer[0].houses, ['tully', 'lannister']); void old;
  const ctx = CALLS.weaver.context(s, { offer }); const m1 = CALLS.weaver.mock(ctx), m2 = CALLS.weaver.mock(ctx); assert.deepEqual(m1, m2); assert.equal(m1.rules[0].house, 'tully'); assert.equal(m1.rules[0].cite, offer[0].id);
  assert.deepEqual(CALLS.weaver.mock({ state: s, facts: [{ id: 'g', kind: 'wedding', text: 'x', houses: ['frey'] }] }), { rules: [] }, 'a fact with no custom to leave: none');
  assert.throws(() => CALLS.weaver.context(world()), /nothing the story has made/);
});

test('the Weaver in the jump: off by default; when on, one custom a game month at most, an ordinary rule of the house cited, never the lord\'s own; a replay asks nothing', async () => {
  assert.equal(loadConfig().weaver, false, 'off by default'); assert.equal(weaverOn({}), false); assert.equal(weaverOn({ weaver: true }), true);
  const cfg = { provider: 'mock', weaver: true };
  // off: nothing is asked and nothing is made
  const off = world(); embargo(off); const r0 = await weaveWeek(off, { cfg: { provider: 'mock' }, provider: 'mock' }); assert.deepEqual(r0.record, []); assert.equal((off.rules || []).length, 0);
  // on: one custom for Tully, from the embargo, in the house's ledger
  const s = world(); const f = embargo(s); const r1 = await weaveWeek(s, { cfg, provider: 'mock' });
  assert.equal(r1.record.length, 1, 'one custom'); assert.equal(r1.record[0].house, 'tully'); assert.equal(r1.record[0].cite, f.fact); assert.equal(s.rules[0].source, `the weaver (cites ${f.fact})`); assert.equal(liveRules(s, 'tully').length, 1);
  assert.match(describeRules(s, 'tully').join(' '), /smuggling ring/i); assert.ok((s.facts || []).some((x) => x.kind === 'custom_created' && x.houses.includes('tully')), 'a fact: the custom was made');
  assert.equal(s.rules.some((r) => r.house === 'stark'), false, 'never the lord\'s own house');
  // the month: asking again at once gives nothing; a month on gives another (another fact)
  embargo(s, ['frey', 'lannister']); const r2 = await weaveWeek(s, { cfg, provider: 'mock' }); assert.deepEqual(r2.record, [], 'not twice in a month');
  s.meta.date = { ...s.meta.date, ...(await import('../public/js/engine/time.js')).dateOfDay(dayNumber(s.meta.date) + WEAVER_DAYS) };
  embargo(s, ['frey', 'lannister']); const r3 = await weaveWeek(s, { cfg, provider: 'mock' }); assert.equal(r3.record.length, 1); assert.equal(r3.record[0].house, 'frey');
  // a replay reuses what was recorded and asks nothing (no model, no cadence)
  const t = world(); const rep = await weaveWeek(t, { cfg: { provider: 'mock' }, replay: r1.record }); assert.equal(rep.record.length, 1); assert.equal(liveRules(t, 'tully').length, 1);
  // the ledger carries it: the rule gives the house a line
  assert.ok(liveRules(s, 'frey')[0].formula.includes('v.runners') || liveRules(s, 'frey')[0].formula.includes('v.'), 'its formula is the sandbox\'s');
});

test('the wiring: a switch in Settings, a config flag, the jump asks once a week and records what it made, and the model\'s call never touches the state', () => {
  const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
  assert.match(read('server/llm.js'), /weaver: false/); assert.match(read('public/js/app.js'), /id="cfg-weaver"/); assert.match(read('public/js/app.js'), /weaver: \$\('#cfg-weaver'\)\.checked/);
  const game = read('server/game.js'); assert.match(game, /weaveWeek\(state, \{ cfg/); assert.match(game, /weaver: weaverRecord/); assert.match(game, /replayWeaver: t\.weaver/);
  const call = read('server/ai/calls/weaver.js'); assert.doesNotMatch(call, /applyChanges|state\.rules\s*=|state\.rules\.push|state\.facts\.push/, 'the call proposes; the engine applies');
  assert.ok(CALLS.weaver && CALLS.weaver.kind === 'weaver'); void makeRng; void seedState; void withRng;
});
