// Prisoners, wards and who leads (docs/BUG-HUNT-2026-10-02.md, ST5, ST6, ST7, ST8, ST11), mock only.
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.WC_PROVIDER = 'mock';
const { createInitialState } = await import('../public/js/shared/world.js');
const { heirOf } = await import('../public/js/shared/people.js');

const world = (seed = 7) => createInitialState('agot_298', 'stark', { seed });

test('ST5: a ward by blood inherits his own house; the ward of another house does not', () => {
  const s = world();
  // Theon Greyjoy is Lord Eddard's ward at Winterfell and Balon's only living son: the Iron Islands are his, not Asha's
  assert.ok(s.characters.theon_greyjoy.roles.includes('ward'));
  assert.equal(heirOf(s, 'greyjoy', 'balon_greyjoy')?.id, 'theon_greyjoy');
  // with Theon gone, the daughter
  s.characters.theon_greyjoy.alive = false;
  assert.equal(heirOf(s, 'greyjoy', 'balon_greyjoy')?.id, 'asha_greyjoy');
  // a ward of a hall who is no blood of it inherits nothing there (Jeyne Poole, a ward at Winterfell, is no Stark; Tyrek no Lannister)
  const t = world(); assert.ok(t.characters.jeyne_poole.roles.includes('ward'));
  for (const id of Object.keys(t.characters)) if (t.characters[id].house === 'stark' && !['jeyne_poole'].includes(id)) t.characters[id].alive = false;
  assert.notEqual(heirOf(t, 'stark', 'eddard_stark')?.id, 'jeyne_poole', 'a ward is not heir to the house that keeps her');
});

// ── ST5: a prisoner of a host is not freed by the desertion of his own house, nor by a disbanding; the card names who rules ──
const { applyChanges, sendHome } = await import('../public/js/shared/world.js');
const { fieldService } = await import('../public/js/shared/vassals.js');
const { joinParty } = await import('../public/js/engine/parties.js');
const { withRng, seedState } = await import('../public/js/engine/rng.js');
const { dayNumber, dateOfDay } = await import('../public/js/engine/time.js');

const captiveInAHost = (seed) => {
  const s = createInitialState('agot_298', 'stark', { seed: 7 }); s.meta.rngState = seedState(seed); s.facts = [];
  const day = dayNumber(s.meta.date); s.meta.clock = { turn: 1, from: day, to: day };
  // House Greyjoy, a vassal of the Crown in the royal host, has Asha for lord: a prisoner of the host, ruled for by Alannys Harlaw
  const g = s.houses.greyjoy; g.liege = 'baratheon'; g.lord = 'asha_greyjoy'; g.regent = 'alannys_harlaw'; s.characters.alannys_harlaw = s.characters.alannys_harlaw || { id: 'alannys_harlaw', name: 'Alannys Harlaw', house: 'greyjoy', sex: 'f', age: 50, alive: true, status: 'free', roles: ['family'], loc: 'greyjoy', memories: [] };
  s.relations['baratheon|greyjoy'] = { v: -100 }; s.characters.alannys_harlaw.loyalty = 0; s.characters.asha_greyjoy.loyalty = 0;
  const host = { id: 'royal_host', kind: 'host', owner: 'baratheon', name: 'The Royal Host', commander: 'robert_baratheon', at: 'baratheon', pos: [...s.holdings.baratheon.pos], men: 9000, members: [], contingents: { greyjoy: 3397 } };
  s.parties.royal_host = host; joinParty(s, s.characters.robert_baratheon, host);
  const asha = s.characters.asha_greyjoy; asha.status = 'imprisoned'; joinParty(s, asha, host);
  return { s, host, asha };
};

test('ST5: the sendHome of a prisoner leaves him held, where he is: no one is freed by being sent home', () => {
  const { s, asha } = captiveInAHost(1); const before = { ...asha };
  withRng(s, () => sendHome(s, asha, 'greyjoy'));
  assert.equal(asha.status, 'imprisoned'); assert.equal(asha.loc, before.loc, 'not moved'); assert.deepEqual(s.facts.filter((f) => f.kind === 'set_out'), [], 'and no ride is told');
});

test('ST5: when a house goes home from a host, its captive lord stays a captive in it, and the card names the one who rules, not the prisoner', () => {
  let seen = null;
  for (let seed = 1; seed <= 60 && !seen; seed++) {
    const { s, asha } = captiveInAHost(seed);
    withRng(s, () => fieldService(s, 30));
    const d = s.facts.find((f) => f.kind === 'desertion'); if (d) seen = { s, asha, d };
  }
  assert.ok(seen, 'a house with no love for its liege goes home within sixty tries');
  const { s, asha, d } = seen;
  assert.equal(asha.status, 'imprisoned', 'she is no freer for her men leaving'); assert.ok(s.parties.royal_host.members.includes('asha_greyjoy'), 'she is still in the host that holds her');
  assert.doesNotMatch(d.text, /Asha/); assert.match(d.text, /Alannys Harlaw/); assert.deepEqual(d.actors, ['alannys_harlaw'], 'the fact names the one who rules');
});

// ── ST6: a man of the books does not lead the host ──
const { hostLeader } = await import('../public/js/engine/military/muster.js');

test('ST6: Maester Luwin rules Winterfell for a child lord, and the host goes under a man who can lead it', () => {
  const s = createInitialState('agot_298', 'lannister', { seed: 7 }); const h = s.houses.stark;
  assert.equal(hostLeader(s, h).id, 'eddard_stark', 'the lord leads while he is free and grown');
  // Lord Eddard a prisoner, Robb a boy, the maester the regent (the report's game)
  s.characters.eddard_stark.status = 'imprisoned'; h.lord = 'robb_stark'; h.regent = 'luwin'; s.characters.robb_stark.age = 14;
  const lead = hostLeader(s, h); assert.ok(lead, 'someone leads'); assert.notEqual(lead.id, 'luwin', 'not the maester');
  assert.equal(lead.house, 'stark'); assert.ok(lead.roles.some((r) => ['knight', 'captain', 'master_at_arms', 'commander'].includes(r)), `a fighter: ${lead.name} (${lead.roles})`);
  // a regent who can lead, leads
  h.regent = 'rodrik_cassel'; assert.equal(hostLeader(s, h).id, 'rodrik_cassel');
  // no fighter at all, and the lord a boy under a maester: no one (the host goes under its banner)
  for (const c of Object.values(s.characters)) if (c.house === 'stark' && c.id !== 'luwin' && c.id !== 'robb_stark') c.alive = false; h.regent = 'luwin';
  assert.equal(hostLeader(s, h), null);
});

// ── ST7: a host on its road is not sent somewhere else every week ──
const { optionsFor } = await import('../public/js/engine/minds/options.js');

test('ST7: a host that is marching is not offered a new destination by its lord\'s mind; a host that has halted is', () => {
  const s = createInitialState('agot_298', 'stark', { seed: 7 }); const lord = s.characters.tywin_lannister;
  const host = { id: 'host_of_the_rock', kind: 'host', owner: 'lannister', name: 'The Host of the Rock', commander: 'tywin_lannister', at: 'lannister', pos: [...s.holdings.lannister.pos], men: 12000, members: ['tywin_lannister'] };
  s.parties.host_of_the_rock = host; lord.loc = 'lannister';
  const offers = () => optionsFor(s, 'tywin_lannister').options.find((o) => o.verb === 'march_host')?.picks.filter((p) => p.host === 'host_of_the_rock') || [];
  assert.ok(offers().length > 0, 'a host standing at the Rock may be sent somewhere');
  host.march = { to: 'frey', since: 0 }; host.at = null;
  assert.deepEqual(offers(), [], 'once it is on its road, it is not offered another');
  delete host.march; host.at = 'frey';
  assert.ok(offers().length > 0, 'arrived, it may be sent on');
});

// ── ST11: a boy does not lead a party ──
const { retinueTick } = await import('../public/js/shared/retinues.js');

test('ST11: Robert Arryn, six years old, never sets out at the head of a party; his grown peers do', () => {
  const led = new Set();
  for (let seed = 1; seed <= 8; seed++) {
    const s = createInitialState('agot_298', 'stark', { seed: 7 }); s.meta.rngState = seedState(seed); s.facts = [];
    assert.ok(s.characters.robert_arryn.age < 15 && s.houses.arryn.lord === 'robert_arryn', 'the scenario: a child lord at the Eyrie');
    const day = dayNumber(s.meta.date);
    withRng(s, () => {
      for (let d = 0; d < 60; d++) {
        s.meta.date = dateOfDay(day + d); s.meta.clock = { turn: 1, from: day + d, to: day + d }; retinueTick(s, 7);
        // (no road is walked here: each party is noted and sent on its way, so that the day's sends are not stopped by twenty abroad)
        for (const [id, p] of Object.entries(s.parties)) if (p.kind === 'retinue') { led.add(p.commander); delete s.parties[id]; }
      }
    });
  }
  assert.ok(led.size >= 150, `a good many lords ride out (${led.size})`); assert.ok(!led.has('robert_arryn'), 'the boy leads no retinue');
});

// ── ST8: a garrison does not arrive where it never left for; a fallen hall's household does not camp before its own walls ──
const { fallBack } = await import('../public/js/engine/military/battle.js');
const { marchTick } = await import('../public/js/shared/marches.js');

test('ST8: a host that falls back sets out first (a quiet departure), so that its arrival is not from nowhere', () => {
  const s = createInitialState('agot_298', 'stark', { seed: 7 }); s.facts = []; const day = dayNumber(s.meta.date); s.meta.clock = { turn: 1, from: day, to: day };
  const host = { id: 'the_household', kind: 'garrison', owner: 'stark', name: 'Winterfell Household', commander: 'rodrik_cassel', at: null, pos: [...s.holdings.stark.pos].map((x, i) => x + (i ? 6 : 0)), men: 233, members: [], march: null };
  s.parties.the_household = host; s.characters.rodrik_cassel.loc = 'party:the_household'; host.members = ['rodrik_cassel'];
  const to = withRng(s, () => fallBack(s, host)); assert.ok(to, 'a refuge is found');
  const out = s.facts.filter((f) => f.kind === 'set_out' && f.data?.party === 'the_household'); assert.equal(out.length, 1, 'one departure, told');
  assert.equal(out[0].data.to, to); assert.equal(out[0].importance, 1, 'quietly: the siege has its own card');
  // and the whole road: every arrival of the party has the departure before it
  withRng(s, () => { for (let d = 1; d <= 20; d++) { s.meta.clock = { turn: 1, from: day + d, to: day + d }; s.meta.date = dateOfDay(day + d); marchTick(s, { span: 1, turnStart: day + d - 1 }); } });
  const arr = s.facts.find((f) => f.kind === 'arrived' && f.data?.party === 'the_household'); if (arr) assert.ok(out[0].day <= arr.day, 'departure first');
});

test('ST8: when a hall falls to the enemy its household is overcome there: it does not camp before its own walls, and does not later "arrive" in a town', () => {
  const s = createInitialState('agot_298', 'lannister', { seed: 7 }); s.facts = []; const day = dayNumber(s.meta.date); s.meta.clock = { turn: 1, from: day, to: day };
  assert.equal(s.parties.winterfell_guard.at, 'stark');
  withRng(s, () => applyChanges(s, [{ op: 'holding', id: 'stark', owner: 'greyjoy', status: 'occupied', note: 'Taken by Theon Greyjoy in the night' }], { source: 'a test' }));
  assert.equal(s.holdings.stark.owner, 'greyjoy'); assert.equal(s.parties.winterfell_guard, undefined, 'the household is gone from the field');
  const gone = s.facts.find((f) => f.kind === 'host_disbanded'); assert.ok(gone, 'and its end is told'); assert.equal(gone.place, 'stark'); assert.match(gone.data.why, /fell/);
  // a hall that is only granted, or won by terms with the garrison marching out with its arms, keeps no such end
  const t = createInitialState('agot_298', 'lannister', { seed: 7 }); t.facts = []; t.meta.clock = { turn: 1, from: day, to: day };
  withRng(t, () => applyChanges(t, [{ op: 'holding', id: 'stark', owner: 'bolton', note: 'Granted by the liege' }], { source: 'a test' }));
  assert.ok(t.parties.winterfell_guard, 'a grant takes no household');
});
