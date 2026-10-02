// A lord on the road decrees nothing that needs his hall (docs/BUG-HUNT-2026-10-02.md, ST4): about 140 times in the report's games a lord set out and a
// day or ten later proclaimed heavy taxes at his own castle, began works there, sent a gift, held a feast or judged a prisoner. The weekly minds decide on the
// week's first day, and a lord who is travelling is not in his hall on it.
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.WC_PROVIDER = 'mock';
const { createInitialState } = await import('../public/js/shared/world.js');
const { optionsFor, HOME_VERBS } = await import('../public/js/engine/minds/options.js');
const { joinParty } = await import('../public/js/engine/parties.js');

const LORDS = ['tywin_lannister', 'mace_tyrell', 'hoster_tully', 'roose_bolton', 'doran_martell', 'balon_greyjoy', 'lysa_arryn'];
const homeVerbs = (s, id) => optionsFor(s, id).options.map((o) => o.verb).filter((v) => HOME_VERBS.has(v));

test('ST4: at his seat a lord may decide the affairs of his house; on the road with his party he may decide none of them', () => {
  let athome = 0; const seen = new Set();
  for (const id of LORDS) {
    const s = createInitialState('agot_298', 'stark', { seed: 7 }); const lord = s.characters[id]; const house = s.houses[lord.house];
    const here = homeVerbs(s, id); athome += here.length; here.forEach((v) => seen.add(v));
    // the lord rides out: a retinue with his banner, on the road, bound for a neighbour's hall
    const party = { id: `party_${id}`, owner: house.id, name: `${lord.name}'s party`, commander: id, at: null, pos: [...s.holdings[house.seat].pos], men: 60, kind: 'retinue', members: [], march: { to: 'stark', since: 0 }, purpose: { dest: 'stark', home: house.seat, stay: 3 } };
    s.parties[party.id] = party; joinParty(s, lord, party);
    assert.deepEqual(homeVerbs(s, id), [], `${lord.name} is on the road and decides no affair of his hall (he could have: ${here.join(', ')})`);
  }
  assert.ok(athome >= 8 && seen.size >= 4, `at home, the lords have affairs to decide (${athome} in all; ${[...seen].join(', ')})`);
});

test('ST4: a lord at another castle (a guest at a feast) is not at his seat either; the lord who is home again is', () => {
  const s = createInitialState('agot_298', 'stark', { seed: 7 }); const lord = s.characters.tywin_lannister;
  const here = homeVerbs(s, 'tywin_lannister'); assert.ok(here.length > 0, 'Tywin at the Rock has affairs');
  lord.loc = 'stark'; assert.deepEqual(homeVerbs(s, 'tywin_lannister'), [], 'at Winterfell he decides none of them');
  lord.loc = s.houses.lannister.seat; assert.deepEqual(homeVerbs(s, 'tywin_lannister'), here, 'home again, he does');
});

test('ST4: the verbs a lord on the road keeps are the road\'s: his hosts, his people, war', () => {
  const s = createInitialState('agot_298', 'stark', { seed: 7 }); const lord = s.characters.tywin_lannister;
  const party = { id: 'party_tywin', owner: 'lannister', name: "Tywin's party", commander: 'tywin_lannister', at: null, pos: [...s.holdings.lannister.pos], men: 60, kind: 'retinue', members: [], march: { to: 'stark', since: 0 } };
  s.parties.party_tywin = party; joinParty(s, lord, party);
  const verbs = optionsFor(s, 'tywin_lannister').options.map((o) => o.verb);
  assert.ok(verbs.includes('wait'), 'he may always keep his counsel'); assert.ok(!verbs.some((v) => HOME_VERBS.has(v)));
});

// ── ST15: a canon beat looks at the army on the ground ──
const { advanceThreads, THREADS } = await import('../public/js/shared/plots.js');
const { withRng } = await import('../public/js/engine/rng.js');
const { applyChanges } = await import('../public/js/shared/world.js');

test('ST15: Theon takes Winterfell by night from its few defenders, not from under a Stark host of nineteen thousand', () => {
  const stage = THREADS.find((t) => t.id === 'ironborn').stages.findIndex((x) => x.id === 'winterfell_taken');
  const world = (men) => {
    const s = createInitialState('agot_298', 'lannister', { seed: 7 });
    s.meta.date = { year: 299, month: 6, day: 3 }; s.plots = { stages: { ironborn: stage }, flags: {}, fired: {} };
    withRng(s, () => applyChanges(s, [{ op: 'war', id: 'ironborn_reaving', name: 'The Ironborn Reaving', attackers: ['greyjoy'], defenders: ['stark'], reason: 'The Old Way' }], { source: 'a test' }));
    if (men) s.parties.northern_host = { id: 'northern_host', kind: 'host', owner: 'stark', name: 'The Northern Host', commander: 'robb_stark', at: 'stark', pos: [...s.holdings.stark.pos], men, members: ['robb_stark'] };
    return s;
  };
  const fires = (s) => withRng(s, () => advanceThreads(s)).fired.filter((x) => x === 'ironborn.winterfell_taken'); // (the other threads, at their first beats, have their own business)
  const few = world(0);
  assert.deepEqual(fires(few), ['ironborn.winterfell_taken'], 'the garrison alone is few');
  const many = world(19301);
  assert.deepEqual(fires(many), [], 'with a host of nineteen thousand inside, the beat waits');
  // and when the host has marched away, the night's work is done
  delete many.parties.northern_host; many.meta.date = { year: 299, month: 7, day: 20 };
  assert.deepEqual(fires(many), ['ironborn.winterfell_taken'], 'the host gone, Winterfell is open again within the beat\'s window');
});
