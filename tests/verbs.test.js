// The verb registry (WP B4; docs/gdd/03-architecture.md §7): every action anyone can take is one verb, defined once,
// with its checks, cost, doing and receipt. Every card action and every kind of written order of earlier versions is
// reachable by a verb; each verb, done where it may be, tells a receipt and records only the facts it says it records;
// refused, it says why in the world's own words and leaves the world exactly as it was.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.WC_PROVIDER = 'mock';
process.env.WC_SAVES = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-verbs-'));
const { VERBS, FAMILIES, perform, check, intentFor, verbOfKind, ORDER_OPS } = await import('../public/js/engine/actions/registry.js');
const { KINDS } = await import('../public/js/engine/facts/kinds.js');
const { createInitialState, applyChanges, rideOf } = await import('../public/js/shared/world.js');
const { withRng } = await import('../public/js/engine/rng.js');
const game = await import('../server/game.js');

test.after(() => fs.rmSync(process.env.WC_SAVES, { recursive: true, force: true }));
const fresh = (house = 'stark') => createInitialState('agot_298', house, { seed: 298 });
const host = (s, id, owner, at, men) => { applyChanges(s, [{ op: 'army_create', id, owner, name: `Host ${id}`, at, men }]); return id; };

test('every verb is whole: a family, a label, typed params, checks, a doing, a receipt, its facts, and whether minds may use it', () => {
  assert.ok(Object.keys(VERBS).length >= 27, `${Object.keys(VERBS).length} verbs`);
  for (const v of Object.values(VERBS)) {
    assert.ok(FAMILIES.includes(v.family), `${v.id}: family ${v.family}`);
    assert.ok(v.label && typeof v.params === 'object', `${v.id}: label and params`);
    for (const f of ['legal', 'start', 'receipt']) assert.equal(typeof v[f], 'function', `${v.id}: ${f}`);
    assert.ok(Array.isArray(v.facts) && v.facts.every((k) => KINDS[k]), `${v.id}: facts are kinds of the catalogue`);
    assert.equal(typeof v.mind?.allowed, 'boolean', `${v.id}: mind.allowed`);
  }
});

test('every card action of earlier versions and every kind of written order is a verb', () => {
  const kinds = [{ kind: 'tax' }, { kind: 'project' }, { kind: 'dues' }, { kind: 'cancel_project' }, { kind: 'call_banners' }, { kind: 'decide' }, { kind: 'appoint' }, { kind: 'grant' }, { kind: 'raise' }, { kind: 'disband' },
    { kind: 'recall', character: 'x' }, { kind: 'recall', army: 'x' }, { kind: 'march', to: 'stark' }, { kind: 'march', to: 'party:x' }, { kind: 'gift' }, { kind: 'feast' }, { kind: 'tourney' },
    { kind: 'judge' }, { kind: 'declare_war' }, { kind: 'scheme', kind2: 'spy' }, { kind: 'scheme', kind2: 'secrets' }, { kind: 'secrecy' }];
  for (const b of kinds) assert.ok(VERBS[verbOfKind(b)], `${JSON.stringify(b)} → ${verbOfKind(b)}`);
  assert.equal(verbOfKind({ kind: 'order' }), null, 'a written order is words for the turn, not a verb');
  for (const [op, v] of Object.entries(ORDER_OPS)) assert.ok(VERBS[v], `order op ${op} → ${v}`);
});

// Each verb, done where it may be done, and refused where it may not. `setup` prepares the world and returns the
// params; `refuse` returns params (or changes the world) so that the verb must be refused, with the refusal's code.
// a Stark fleet in port at White Harbor (the sea verbs, WP C6)
const fleetOf = (s, at) => { applyChanges(s, [{ op: 'army_create', id: 'fl', owner: 'stark', name: 'The White Harbor fleet', at, men: 2500, type: 'fleet' }]); const f = s.parties.fl; f.kind = 'fleet'; f.ships = 25; f.composition = 'War galleys and cogs'; return 'fl'; };
// a Stark host sitting before an enemy castle, at war with its lord (the siege verbs, WP C5)
const siegeOf = (s, hold, foe = 'lannister') => {
  applyChanges(s, [{ op: 'war', status: 'start', name: 'W', attackers: ['stark'], defenders: [foe] }]);
  const id = host(s, 'sg', 'stark', hold, 12000); s.parties[id].besieging = hold; s.holdings[hold].siege = { by: 'stark', days: 10, stores: 4 };
  return { holding: hold, terms: 'march_out_with_arms' };
};
const CASES = {
  call_banners: { ok: () => ({ vassals: 'all', at: 'stark', ownLevies: 1000 }), no: () => [{ vassals: ['no_such_house'], at: 'stark' }, 'no_vassals'] },
  answer_call: { house: 'umber', player: 'stark', ok: (s) => { applyChanges(s, [{ op: 'obligation', house: 'umber', levies: 'called', muster: 'stark' }]); return {}; }, no: () => [{}, 'not_called'] },
  raise_levies: { ok: () => ({ at: 'stark', men: 2000 }), no: () => [{ at: 'lannister', men: 2000 }, 'not_yours'] },
  march_host: { ok: (s) => ({ army: host(s, 'h1', 'stark', 'stark', 3000), to: 'moat_cailin' }), no: (s) => [{ army: host(s, 'h1', 'stark', 'stark', 3000), to: 'the moon' }, 'no_place'] },
  attack_host: { ok: (s) => ({ army: host(s, 'h1', 'stark', 'stark', 3000), to: 'party:' + host(s, 'foe', 'lannister', 'tully', 5000) }), no: (s) => [{ army: host(s, 'h1', 'stark', 'stark', 3000), to: 'party:' + host(s, 'h2', 'stark', 'stark', 500) }, 'own'] },
  halt_host: { ok: (s) => { const id = host(s, 'h1', 'stark', 'stark', 3000); perform(s, 'march_host', { params: { army: id, to: 'moat_cailin' } }); return { army: id }; }, no: (s) => [{ army: host(s, 'h1', 'stark', 'stark', 3000) }, 'not_marching'] },
  wait_banners: { ok: (s) => { const id = host(s, 'h1', 'stark', 'stark', 3000); perform(s, 'call_banners', { params: { vassals: 'all', at: 'stark' } }); return { army: id }; }, no: (s) => [{ army: host(s, 'h1', 'stark', 'stark', 3000) }, 'none_coming'] },
  set_standing_orders: { ok: (s) => ({ army: host(s, 'h1', 'stark', 'stark', 3000), engage: 'avoid' }), no: (s) => [{ army: host(s, 'h1', 'stark', 'stark', 3000), engage: 'charge blindly' }, 'engage'] },
  offer_terms: { ok: (s) => siegeOf(s, 'lannister'), no: (s) => [{ holding: 'lannister', terms: 'march_out_with_arms' }, 'not_besieged'] },
  storm: { ok: (s) => { siegeOf(s, 'frey', 'tully'); return { holding: 'frey' }; }, no: (s) => [siegeOf(s, 'lannister') && { holding: 'lannister' }, 'no_storm'] },
  embark_host: { ok: (s) => ({ army: host(s, 'h1', 'stark', 'manderly', 1000), fleet: fleetOf(s, 'manderly') }), no: (s) => [{ army: host(s, 'h1', 'stark', 'stark', 1000), fleet: fleetOf(s, 'manderly') }, 'cannot'] },
  land_host: { ok: (s) => { const f = fleetOf(s, 'manderly'); perform(s, 'embark_host', { params: { army: host(s, 'h1', 'stark', 'manderly', 1000), fleet: f } }); return { fleet: f }; }, no: (s) => [{ fleet: fleetOf(s, 'manderly') }, 'empty'] },
  blockade: { ok: (s) => { applyChanges(s, [{ op: 'war', status: 'start', name: 'W', attackers: ['stark'], defenders: ['lannister'] }]); return { fleet: fleetOf(s, 'manderly'), holding: 'lannisport' }; }, no: (s) => [{ fleet: fleetOf(s, 'manderly'), holding: 'lannisport' }, 'not_at_war'] },
  raid_coast: { ok: (s) => { applyChanges(s, [{ op: 'war', status: 'start', name: 'W', attackers: ['stark'], defenders: ['greyjoy'] }]); return { fleet: fleetOf(s, 'manderly'), target: 'harlaw' }; }, no: (s) => [{ fleet: fleetOf(s, 'manderly'), target: 'harlaw' }, 'no_targets'] },
  hire_company: { ok: () => ({ company: 'brave_companions' }), no: () => [{ company: 'no_such_company' }, 'no_company'] },
  dismiss_company: { ok: (s) => { perform(s, 'hire_company', { params: { company: 'brave_companions' } }); return { company: 'brave_companions' }; }, no: () => [{ company: 'golden_company' }, 'not_hired'] },
  sue_for_peace: { ok: (s) => { applyChanges(s, [{ op: 'war', status: 'start', name: 'W', attackers: ['stark'], defenders: ['lannister'] }]); return { house: 'lannister', terms: 'concede' }; }, no: () => [{ house: 'lannister', terms: 'white_peace' }, 'not_at_war'] },
  merge_hosts: { ok: (s) => { host(s, 'h1', 'stark', 'stark', 3000); host(s, 'h2', 'stark', 'stark', 500); return {}; }, no: (s) => { host(s, 'h1', 'stark', 'stark', 3000); host(s, 'h2', 'stark', 'moat_cailin', 500); return [{}, 'apart']; } },
  disband_host: { ok: (s) => ({ army: host(s, 'h1', 'stark', 'stark', 3000) }), no: (s) => [{ army: host(s, 'foe', 'lannister', 'lannister', 3000) }, 'not_yours'] },
  set_secrecy: { ok: (s) => ({ army: host(s, 'h1', 'stark', 'stark', 3000), mode: 'feint', to: 'tully' }), no: (s) => [{ army: host(s, 'h1', 'stark', 'stark', 3000), mode: 'invisible' }, 'mode'] },
  send_person: { ok: () => ({ character: 'jon_snow', to: 'nights_watch' }), no: () => [{ character: 'jaime_lannister', to: 'stark' }, 'not_yours'] },
  recall_rider: { ok: (s) => { perform(s, 'send_person', { params: { character: 'jon_snow', to: 'nights_watch' } }); return { character: 'jon_snow' }; }, no: () => [{ character: 'arya_stark' }, 'not_riding'] },
  set_tax: { ok: () => ({ level: 'high' }), no: () => [{ level: 'extortionate' }, 'level'] },
  set_dues: { house: 'umber', ok: () => ({ status: 'withholding' }), no: () => [{ status: 'maybe' }, 'status'] },
  fund_works: { ok: () => ({ template: 'rookery', holding: 'stark' }), no: (s) => { perform(s, 'fund_works', { params: { template: 'rookery', holding: 'stark' } }); return [{ template: 'rookery', holding: 'stark' }, 'twin']; } },
  cancel_works: { ok: (s) => { perform(s, 'fund_works', { params: { template: 'rookery', holding: 'stark' } }); return { project: s.projects.at(-1).id }; }, no: () => [{ project: 'no_such_works' }, 'no_works'] },
  hire_men: { ok: () => ({ at: 'stark', men: 100, kind: 'men-at-arms' }), no: () => [{ at: 'stark', men: 5, kind: 'men-at-arms' }, 'too_few'] },
  hire_officer: { ok: () => ({ role: 'spymaster', at: 'stark' }), no: () => [{ role: '', at: 'stark' }, 'office'] },
  send_gift: { ok: () => ({ to: 'walder_frey', gold: 500 }), no: () => [{ to: 'walder_frey', gold: 10 }, 'insult'] },
  appoint_office: { ok: () => ({ character: 'rodrik_cassel', role: 'captain' }), no: () => [{ character: 'rodrik_cassel', role: 'jester' }, 'office'] },
  grant_holding: { ok: () => ({ holding: 'moat_cailin', house: 'umber' }), no: () => [{ holding: 'stark', house: 'umber' }, 'seat'] },
  hold_feast: { ok: () => ({}), no: (s) => { s.houses.stark.figures.treasury.v = 100; return [{}, 'gold']; } },
  hold_tourney: { ok: () => ({}), no: (s) => { s.houses.stark.figures.treasury.v = 100; return [{}, 'gold']; } },
  judge_prisoner: { ok: (s) => { Object.assign(s.characters.jaime_lannister, { status: 'imprisoned', loc: 'stark' }); return { character: 'jaime_lannister', verdict: 'release' }; }, no: () => [{ character: 'jaime_lannister', verdict: 'release' }, 'no_prisoner'] },
  answer_matter: { ok: (s) => { applyChanges(s, [{ op: 'decision', id: 'm1', title: 'A quarrel', text: 'Two lords quarrel.', options: ['Side with the first', 'Side with the second'] }]); return { decision: s.decisions.at(-1).id, option: 0 }; }, no: () => [{ decision: 'no_such_matter', option: 0 }, 'no_matter'] },
  declare_war: { ok: () => ({ house: 'lannister', reason: 'the attack on Bran' }), no: () => [{ house: 'stark' }, 'no_target'] },
  plant_spy: { ok: () => ({ house: 'lannister' }), no: () => [{ house: 'stark' }, 'no_target'] },
  gather_secrets: { ok: () => ({ house: 'lannister' }), no: (s) => { s.houses.stark.figures.treasury.v = 100; return [{ house: 'lannister' }, 'gold']; } },
  borrow: { ok: () => ({ lender: 'iron_bank', gold: 10000 }), no: () => [{ lender: 'iron_bank', gold: 50 }, 'too_little'] },
  repay: { ok: (s) => { perform(s, 'borrow', { params: { lender: 'iron_bank', gold: 10000 } }); return { lender: 'iron_bank', gold: 5000 }; }, no: () => [{ lender: 'faith' }, 'no_debt'] },
  call_debt: { house: 'lannister', ok: () => ({ debtor: 'baratheon' }), no: () => [{ debtor: 'stark' }, 'no_debt'] },
  buy_grain: { ok: () => ({ moons: 2 }), no: () => [{ moons: 0.1 }, 'too_little'] },
  bribe: { ok: () => ({ to: 'walder_frey', gold: 5000, aim: 'let us cross at the Twins' }), no: () => [{ to: 'walder_frey', gold: 1 }, 'too_little'] },
  embargo: { ok: () => ({ house: 'lannister' }), no: () => [{ house: 'stark' }, 'no_target'] },
  pay_ransom: { ok: (s) => { Object.assign(s.characters.jory_cassel, { status: 'imprisoned', loc: 'lannister' }); return { character: 'jory_cassel' }; }, no: () => [{ character: 'jon_snow' }, 'not_held'] },
  send_letter: { ok: () => ({ to: 'lysa_arryn', text: 'Sister, what did Jon Arryn say in his last days?' }), no: () => [{ to: 'lysa_arryn', text: '   ' }, 'empty'] },
};
// what a verb may bring about besides its own facts (the people it touches ride home; a tourney may kill a knight)
const ALSO = { judge_prisoner: ['set_out', 'arrived'], pay_ransom: ['set_out', 'arrived'], hold_tourney: ['death'], answer_matter: null /* the matter's effects are its own */ };

test('every verb has a case here', () => assert.deepEqual(Object.keys(VERBS).filter((v) => !CASES[v]), []));

for (const [id, c] of Object.entries(CASES)) {
  test(`${id}: done, it tells a receipt and records its facts; refused, it says why and changes nothing`, () => {
    const s = fresh(c.player || c.house); const house = c.house || 'stark';
    withRng(s, () => {
      const params = c.ok(s); s.facts = [];
      const r = perform(s, id, { house, params });
      assert.ok(r.ok, `${id}: ${r.refusal?.text}`);
      assert.ok(r.receipt.length && r.receipt.every((l) => l.text && [true, false, 'warn'].includes(l.ok) && !/undefined|NaN|\[object/.test(l.text)), JSON.stringify(r.receipt));
      const allowed = ALSO[id] === null ? null : new Set([...VERBS[id].facts, ...(ALSO[id] || [])]);
      if (allowed) for (const f of s.facts) assert.ok(allowed.has(f.kind), `${id} recorded a ${f.kind} fact it does not declare`);
      if (id === 'answer_matter') assert.ok(s.facts.some((f) => f.kind === 'judgement'));
      assert.ok(s.facts.every((f) => f.cause?.type === 'order'), 'what the lord does is caused by his order');
    });
    const t = fresh(c.player || c.house);
    withRng(t, () => {
      const out = c.no(t); const [params, code] = out;
      const before = JSON.stringify(t);
      const r = perform(t, id, { house, params });
      assert.equal(r.ok, false, `${id} should be refused`);
      assert.equal(r.refusal.code, code, r.refusal.text);
      assert.match(r.refusal.text, /^[A-Z0-9].*[.?!]$/, 'a sentence of the world');
      assert.doesNotMatch(r.refusal.text, /undefined|Error|null|\bop\b/);
      assert.equal(JSON.stringify(t), before, 'the world is as it was');
    });
  });
}

test('the intent names who acts: the lord of the house, unless another is named', () => {
  const s = fresh();
  const i = intentFor(s, 'set_tax', { params: { level: 'low' } });
  assert.deepEqual([i.actor, i.house], [s.houses.stark.lord, 'stark']);
  assert.equal(intentFor(s, 'set_tax', { house: 'lannister' }).actor, s.houses.lannister.lord);
  assert.equal(check(s, { ...i, verb: 'no_such_verb' }).code, 'unknown');
  // a verb is the same for every house: the Lannisters raise their own levies at the Rock
  const r = withRng(s, () => perform(s, 'raise_levies', { house: 'lannister', params: { at: 'lannister', men: 3000 } }));
  assert.ok(r.ok, r.refusal?.text); assert.ok(Object.values(s.parties).some((a) => a.owner === 'lannister' && a.at === 'lannister' && a.men >= 3000));
});

test('over the wire: { verb, params } is done and its receipt told; a refusal is a 409 with its reason', async () => {
  const { id } = game.newGame('agot_298', 'stark', { seed: 298 });
  const r = game.act(id, { verb: 'set_tax', params: { level: 'high' } });
  assert.match(r.summary, /Heavy taxes are proclaimed/); assert.equal(r.receipt[0].ok, true);
  assert.equal(r.state.houses.stark.policy.tax, 'high');
  assert.ok(r.state.orders.some((o) => /Proclaim heavy taxes/.test(o.text) && o.status === 'done'), 'and the story is told it was done');
  assert.throws(() => game.act(id, { verb: 'set_tax', params: { level: 'extortionate' } }), (e) => e.status === 409 && /low, normal, high or crushing/.test(e.message));
  assert.throws(() => game.act(id, { verb: 'fly_to_the_moon' }), (e) => e.status === 400);
  // the old shape still works
  const old = game.act(id, { kind: 'raise', at: 'stark', men: 1000 });
  assert.match(old.summary, /levies/);
  const jon = game.act(id, { verb: 'send_person', params: { character: 'jon_snow', to: 'nights_watch' } });
  assert.ok(rideOf(jon.state, jon.state.characters.jon_snow)?.march?.to === 'nights_watch');
});
