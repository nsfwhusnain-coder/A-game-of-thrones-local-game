// The realm's minds (docs/gdd/04-ai-system.md §5, 09-living-world.md §2, §9; WP B7): who decides, what they may
// choose, what their house's ways choose, how a model's choice is held to the options, and that the realm lives.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createInitialState, applyChanges } from '../public/js/shared/world.js';
import { withRng } from '../public/js/engine/rng.js';
import { intentFor, check, VERBS } from '../public/js/engine/actions/registry.js';
import { optionsFor, actorOf, HOLD, MIND_VERBS } from '../public/js/engine/minds/options.js';
import { scoreActors, salientActors } from '../public/js/engine/minds/salience.js';
import { treeChoice, hintFor, HOUSES_WITH_WAYS } from '../public/js/engine/minds/houseways.js';
import { runMinds, heard } from '../server/minds.js';
import { withDice } from '../server/dice.js';
import { loadMindSuite, runMindSuite } from '../bench/lib/mind.js';
import { settle } from '../public/js/engine/parties.js';

const world = (house = 'stark', setup = []) => { const s = createInitialState('agot_298', house, { seed: 298 }); withRng(s, () => applyChanges(s, setup)); s.facts = []; return s; };

test('every great house, and the houses the story leans on, has ways of its own', () => {
  const s = world();
  const great = Object.values(s.houses).filter((h) => ['crown', 'paramount'].includes(h.rank)).map((h) => h.id);
  for (const h of great) assert.ok(HOUSES_WITH_WAYS.includes(h), `${h} has no ways`);
  for (const h of ['frey', 'bolton', 'manderly', 'baratheon_ds', 'nights_watch', 'free_folk']) assert.ok(HOUSES_WITH_WAYS.includes(h), h);
});

test('a mind may only choose among lawful options, and never what only the player or a later package may do', () => {
  const s = world();
  for (const h of ['lannister', 'tully', 'greyjoy', 'arryn', 'baratheon', 'tyrell', 'martell', 'frey', 'nights_watch', 'free_folk']) {
    const a = actorOf(s, h); const { options } = optionsFor(s, a.id);
    assert.equal(options.at(-1).verb, HOLD, 'waiting is always a choice');
    for (const o of options) for (const p of o.picks) if (o.verb !== HOLD) assert.equal(check(s, intentFor(s, o.verb, { actor: a.id, house: h, params: p.params })), null, `${h} ${o.verb} ${JSON.stringify(p.params)}`);
  }
  // schemes, secrecy and letters inform only the player until knowledge (B9) and letters (B10) are each house's own
  for (const v of ['plant_spy', 'gather_secrets', 'set_secrecy', 'send_letter', 'answer_matter']) assert.ok(!MIND_VERBS.includes(v), v);
  assert.equal(VERBS.plant_spy.mind.until, 'B9');
  // the Watch levies no taxes and feasts no one; the khalasar keeps to its camp under canon gravity
  const watch = optionsFor(s, 'jeor_mormont').options.map((o) => o.verb);
  assert.ok(!watch.includes('set_tax') && !watch.includes('hold_feast'));
  assert.ok(!optionsFor(s, 'mance_rayder').options.some((o) => o.verb === 'march_host'), 'the free folk host waits for its beat');
  const sandbox = world(); sandbox.meta.settings = { ...(sandbox.meta.settings || {}), canonGravity: 'sandbox' };
  assert.ok(optionsFor(sandbox, 'mance_rayder').options.some((o) => o.verb === 'march_host'), 'in a sandbox it may march');
});

test('a commander moves only the host he leads; the house\'s affairs are its lord\'s', () => {
  const s = world('stark', [{ op: 'army_create', id: 'vanguard', owner: 'lannister', name: 'The Vanguard', at: 'lannisport', men: 4000, commander: 'kevan_lannister' }, { op: 'army_create', id: 'main', owner: 'lannister', name: 'The Main Host', at: 'lannister', men: 9000, commander: 'tywin_lannister' }]);
  const kevan = optionsFor(s, 'kevan_lannister');
  assert.equal(kevan.view.role, 'commander');
  assert.ok(kevan.options.every((o) => ['march_host', 'attack_host', 'halt_host', 'merge_hosts', HOLD].includes(o.verb)), kevan.options.map((o) => o.verb).join());
  assert.ok(kevan.options.flatMap((o) => o.picks).every((p) => !p.host || p.host === 'vanguard'));
  assert.ok(optionsFor(s, 'tywin_lannister').options.some((o) => o.verb === 'set_tax'));
});

test('salience: rank, what has just happened, nearness to the player; never the player\'s own house', () => {
  const s = world();
  const all = scoreActors(s);
  assert.ok(!all.some((x) => x.house === 'stark'), 'the player is the mind of their own house');
  assert.equal(all[0].id, 'robert_baratheon', 'the King first, at peace');
  const base = all.find((x) => x.id === 'hoster_tully').score;
  applyChanges(s, [{ op: 'war', status: 'start', name: 'W', attackers: ['lannister'], defenders: ['tully'] }, { op: 'army_create', id: 'raiders', owner: 'lannister', name: 'Raiders', at: 'tully', men: 5000 }, { op: 'holding', id: 'tully', status: 'besieged' }]);
  const hoster = scoreActors(s).find((x) => x.id === 'hoster_tully');
  assert.ok(hoster.score >= base + 35 + 30, `${hoster.score} vs ${base}: ${hoster.why.join('; ')}`);
  assert.ok(hoster.why.some((w) => /besieged/.test(w)));
  const { minds } = withRng(s, () => salientActors(s, { budget: 6 }));
  assert.ok(minds.some((x) => x.id === 'hoster_tully'), 'a lord under siege is given a mind this week');
  // decided last week: less likely to be asked again
  s.minds = { last: { robert_baratheon: s.meta.turn } };
  assert.ok(scoreActors(s).find((x) => x.id === 'robert_baratheon').score <= 20);
});

test('the house ways: kin taken, a siege, a summons, a prisoner, winter — each answered in character', () => {
  const pick = (s, id) => withRng(s, () => treeChoice(s, id));
  let s = world('stark', [{ op: 'character', id: 'tyrion_lannister', status: 'imprisoned', loc: 'arryn' }]);
  assert.ok(['call_banners', 'raise_levies', 'declare_war'].includes(pick(s, 'tywin_lannister').verb), 'Tywin answers the seizure of his son with force (04 §5.5)');
  assert.match(hintFor(s, 'tywin_lannister', pick(s, 'tywin_lannister')), /Lannister pays his debts/);
  s = world('stark', [{ op: 'character', id: 'oberyn_martell', status: 'imprisoned', loc: 'baratheon' }]);
  assert.ok(['raise_levies', HOLD].includes(pick(s, 'doran_martell').verb), 'Doran is patient');
  s = world('stark', [{ op: 'war', status: 'start', name: 'W', attackers: ['lannister'], defenders: ['tully'] }, { op: 'army_create', id: 'besiegers', owner: 'lannister', name: 'B', at: 'tully', men: 5000 }, { op: 'holding', id: 'tully', status: 'besieged' }, { op: 'army_create', id: 'riverhost', owner: 'tully', name: 'The River Host', at: 'mallister', men: 6000 }]);
  assert.deepEqual(pick(s, 'hoster_tully').params, { army: 'riverhost', to: 'tully' }, 'a lord relieves his own castle');
  s = world('stark', [{ op: 'obligation', house: 'mallister', levies: 'called', muster: 'tully' }, { op: 'obligation', house: 'frey', levies: 'called', muster: 'tully' }]);
  assert.equal(pick(s, 'jason_mallister').verb, 'answer_call', 'an honourable vassal answers at once');
  assert.equal(pick(s, 'walder_frey').verb, HOLD, 'the late Lord Frey takes his time');
  s = world('stark', [{ op: 'character', id: 'jaime_lannister', status: 'imprisoned', loc: 'tully' }]);
  assert.ok(['judge_prisoner', HOLD].includes(pick(s, 'hoster_tully').verb));
  s = world('stark', [{ op: 'season', season: 'autumn' }]);
  assert.equal(pick(s, 'wyman_manderly').params.template, 'granaries', 'winter is coming');
  // at peace a lord does not call his banners or make war
  s = world('stark', [{ op: 'figure', house: 'lannister', field: 'treasury', value: 60000 }]);
  for (let k = 0; k < 20; k++) { const c = withRng(s, () => treeChoice(s, 'tywin_lannister')); assert.ok(!['call_banners', 'raise_levies', 'declare_war', 'march_host'].includes(c.verb), c.verb); }
});

test('a vassal answering his liege\'s call raises his men and marches them to the muster', () => {
  const s = world('stark', [{ op: 'obligation', house: 'mallister', levies: 'called', muster: 'tully' }]);
  s.meta.clock = { turn: 1, from: 100, to: 100 };
  const r = withRng(s, () => perform(s, 'answer_call', { actor: 'jason_mallister', house: 'mallister' }));
  assert.ok(r.ok, r.refusal?.text);
  const host = Object.values(s.parties).find((a) => a.owner === 'mallister' && a.serving === 'tully');
  assert.ok(host && host.men > 0 && host.march?.to === 'tully');
  assert.equal(s.houses.mallister.obligations.levies, 'answered');
  assert.ok(s.facts.some((f) => f.kind === 'call_answered' && f.cause?.type === 'order'));
  assert.equal(check(s, intentFor(s, 'answer_call', { house: 'stark' })).code, 'who', 'the player answers a summons at court');
});
import { perform } from '../public/js/engine/actions/registry.js';

test('a week of minds on the mock: lords decide through the verbs, at least three act, one far away (Q4)', async () => {
  const s = world(); s.meta.clock = { turn: 1, from: 100, to: 100 };
  const r = await withDice(s, () => runMinds(s, { budget: 6 }));
  const acted = r.record.filter((x) => x.verb !== HOLD);
  assert.ok(acted.length >= 3, JSON.stringify(r.record.map((x) => x.verb)));
  const region = s.holdings.stark.region;
  assert.ok(acted.some((x) => s.holdings[s.houses[x.house].seat]?.region !== region), 'one outside the player\'s country');
  assert.ok(r.record.every((x) => x.house !== 'stark'));
  // what they did is in the facts, caused by their intent, and the player's cards are only what the player would hear
  for (const x of acted) assert.ok(s.facts.some((f) => f.cause?.type === 'intent' && f.cause.ref === x.actor), x.actor);
  for (const c of r.cards) assert.ok(heard(s, s.facts.find((f) => f.id === c.fact)), c.title);
  assert.ok(r.cards.every((c) => !/nothing happened|nothing of note/i.test(`${c.title} ${c.text}`)));
  assert.ok(s.minds.last.robert_baratheon != null, 'who decided is remembered');
});

test('a model\'s mind is held to its options: a recorded answer is done, a bad one falls to the house\'s ways', async () => {
  const s = world(); s.meta.clock = { turn: 1, from: 100, to: 100 };
  const r = await withDice(s, () => runMinds(s, { budget: 6, provider: 'replay' }));
  const tywin = r.record.find((x) => x.actor === 'tywin_lannister');
  assert.equal(tywin.via, 'replay'); assert.equal(tywin.verb, 'call_banners'); assert.match(tywin.words.line, /every sworn sword/);
  assert.equal(s.houses.lannisport.obligations.levies, 'called');
  const robert = r.record.find((x) => x.actor === 'robert_baratheon');
  assert.equal(robert.via, 'fallback'); assert.ok(robert.problems.some((p) => /verb/.test(p)), robert.problems.join('; '));
});

test('houses rest between feasts and tourneys', async () => {
  const s = world(); s.meta.clock = { turn: 1, from: 100, to: 100 };
  const { remember, rested } = await import('../public/js/engine/minds/options.js');
  remember(s, 'lannister', 'hold_tourney');
  assert.ok(!rested(s, 'lannister', 'hold_tourney'));
  assert.ok(!optionsFor(s, 'tywin_lannister').options.some((o) => o.verb === 'hold_tourney'));
  s.meta.date = { ...s.meta.date, year: s.meta.date.year + 1 };
  assert.ok(rested(s, 'lannister', 'hold_tourney'));
});

test('a turn with minds: recorded in the turn record, the Hand not asked, the save replays', async () => {
  process.env.WC_PROVIDER = 'mock';
  const saves = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-minds-'));
  process.env.WC_SAVES = saves;
  const game = await import('../server/game.js');
  const { id } = game.newGame('agot_298', 'stark', { seed: 11 });
  const { turn } = await game.advance(id, { span: '7d', orders: [] });
  assert.ok(turn.minds?.length >= 3, 'the minds are in the turn record');
  assert.ok(turn.minds.every((m) => m.actor && m.via && m.verb));
  const log = fs.existsSync(path.join(saves, id, 'llm-log.jsonl')) ? fs.readFileSync(path.join(saves, id, 'llm-log.jsonl'), 'utf8') : '';
  assert.ok(!/"kind":"jump"[^\n]*"agent":"hand"/.test(log));
  assert.equal(game.mindsBudget({ minds: 'off' }), 0); assert.equal(game.mindsBudget({ minds: 10 }), 10); assert.equal(game.mindsBudget({}), 6);
  fs.rmSync(saves, { recursive: true, force: true });
});

test('a host that fought this turn still has its banners add up; no one follows a party that is gone', () => {
  const s = world('stark', [{ op: 'army_create', id: 'h', owner: 'tully', name: 'H', at: 'tully', men: 1000 }, { op: 'army_create', id: 'prey', owner: 'lannister', name: 'P', at: 'lannister', men: 500 }]);
  const h = s.parties.h; h.contingents = { tully: 400, mallister: 600 }; h.men = 500; h.fought = s.meta.turn; h.state = 'engaged';
  settle(s, h);
  assert.equal(Object.values(h.contingents).reduce((a, b) => a + b, 0), 500);
  h.march = { to: 'party:prey' }; delete s.parties.prey; settle(s, h);
  assert.equal(h.march, undefined);
});

// the gate (04 §13): the house ways on the mind suite — the model's gate (≥ 85 %) is the owner's to measure
test('the mind suite: the house ways are in character and always lawful', async () => {
  const r = await runMindSuite((s, actor) => treeChoice(s, actor));
  assert.ok(r.total >= 120, `${r.total} situations`);
  assert.equal(r.lawful, r.total, 'every choice lawful');
  assert.ok(r.inCharacter / r.total >= 0.9, `in character ${r.inCharacter}/${r.total}: ${r.misses.map((m) => m.id).join(', ')}`);
  for (const [file, [ok, of]] of Object.entries(r.byFile)) assert.ok(ok / of >= 0.75, `${file}: ${ok}/${of}`);
  assert.ok(loadMindSuite().every((s) => s.items.every((i) => i.acceptable.length && i.actor && i.situation)));
});
