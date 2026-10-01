// The roster of houses and people (docs/gdd/13-content-data.md §2–§3; WPs G1, G2): the lesser houses of the books are in the world with seats that can be found on the map, every landed house
// has a household of at least three, the families hold together (a spouse is the spouse's spouse, an heir is the head's child), and the same game begins with the same families.
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.WC_PROVIDER = 'mock';
const { createInitialState } = await import('../public/js/shared/world.js');
const { HOUSES, EXTRA_HOLDINGS, MORE_HOUSE_IDS } = await import('../public/data/houses.js');
const { CHARACTERS } = await import('../public/data/characters.js');
const { MORE_CHARACTERS } = await import('../public/data/characters/more.js');
const addedIds = new Set(MORE_CHARACTERS.map((c) => c.id));
const { LAND } = await import('../public/data/geography.js');

const world = (seed = 298, house = 'stark') => createInitialState('agot_298', house, { seed });
const SKIP = new Set(['crown', 'company', 'tribe', 'exile', 'order', 'city_state']);

test('G1: the lesser houses are in the roster, each sworn to a house that is there, on land, with a seat of its own', () => {
  assert.ok(HOUSES.length >= 280, `${HOUSES.length} houses (the roadmap asks for about 260)`);
  assert.ok(MORE_HOUSE_IDS.length >= 100, `${MORE_HOUSE_IDS.length} lesser houses`);
  const ids = new Set(HOUSES.map((h) => h.id)); assert.equal(ids.size, HOUSES.length, 'ids are unique');
  for (const h of HOUSES) if (h.liege) assert.ok(ids.has(h.liege), `${h.id}: its liege ${h.liege} is a house`);
  const s = world();
  for (const id of MORE_HOUSE_IDS) { const hold = s.holdings[id]; assert.ok(hold, `${id} has a seat on the map`); assert.ok(hold.lesser, `${id}'s domain is a lesser one`); assert.equal(s.houses[id].region, hold.region); }
  // every region has some of them, as the books' lords of the small houses are everywhere
  const regions = new Set(MORE_HOUSE_IDS.map((id) => s.houses[id].region));
  for (const r of ['north', 'riverlands', 'vale', 'westerlands', 'crownlands', 'reach', 'stormlands', 'dorne', 'iron_islands']) assert.ok(regions.has(r), `${r} has lesser houses`);
  // the clans are camps: a landless house has somewhere to stand
  for (const id of ['burned_men', 'black_ears', 'moon_brothers', 'painted_dogs', 'thenns']) { assert.ok(s.houses[id].landless); assert.ok(s.characters[s.houses[id].lord], `${id} has a head`); }
  assert.ok(LAND.length > 10 && EXTRA_HOLDINGS.length >= 16);
});

test('G2: every landed house has at least three living people, the head among them, and the families hold together', () => {
  const s = world();
  const byHouse = {}; for (const c of Object.values(s.characters)) if (c.alive !== false) (byHouse[c.house] = byHouse[c.house] || []).push(c);
  const thin = [];
  for (const h of Object.values(s.houses)) {
    if (SKIP.has(h.rank) || h.landless || !h.seat || h.region === 'essos' || h.region === 'wall' || h.region === 'beyond') continue;
    assert.ok(h.lord && s.characters[h.lord]?.alive !== false, `${h.id} has a head`);
    if ((byHouse[h.id] || []).length < 3) thin.push(`${h.id}: ${(byHouse[h.id] || []).length}`);
  }
  assert.deepEqual(thin, [], 'houses of fewer than three');
  for (const c of Object.values(s.characters)) {
    if (c.spouse) assert.equal(s.characters[c.spouse]?.spouse, c.id, `${c.id}: the spouse's spouse`);
    for (const p of [c.father, c.mother]) if (p) assert.ok(s.characters[p], `${c.id}: parent ${p} is in the world`);
    if (c.father && c.born != null && (c.generated || addedIds.has(c.id))) assert.ok(c.born > (s.characters[c.father].born ?? -1e9) + 12, `${c.id}: a father more than a dozen years older`);
  }
  // what is generated is flagged, and carries a sex, an age and a place that is a place
  const made = Object.values(s.characters).filter((c) => c.generated);
  assert.ok(made.length >= 300, `${made.length} people were raised for the households and the lesser houses`);
  for (const c of made) { assert.ok(['m', 'f'].includes(c.sex), c.id); assert.ok(Number.isInteger(c.age) && c.age >= 0 && c.born === 298 - c.age, c.id); assert.ok(s.holdings[c.loc], `${c.id} stands at ${c.loc}`); }
  // the canon names that were added are not made heads of houses whose heads the books do not name
  for (const id of ['hullen', 'dorna_swyft', 'alerie_hightower', 'robar_royce', 'mya_stone']) assert.ok(s.characters[id], id);
  assert.equal(s.houses.hunter.lord, 'eon_hunter'); assert.equal(s.houses.lannister.lord, 'tywin_lannister'); assert.notEqual(s.houses.tyrell.lord, 'alerie_hightower');
});

test('G2: the same game begins with the same families, whatever the seed (the households are the roster, not the dice)', () => {
  const a = world(1), b = world(2);
  const roster = (s) => Object.values(s.characters).filter((c) => c.generated).map((c) => `${c.id}:${c.name}:${c.age}:${c.house}:${c.spouse || ''}:${c.father || ''}`).sort().join('|');
  assert.equal(roster(a), roster(b));
  const names = Object.values(a.characters).map((c) => c.name); const dup = names.filter((n, i) => names.indexOf(n) !== i);
  assert.ok(dup.length < 40, `${dup.length} names are shared by two people (the books reuse names; not many)`);
});

test('the canon roster and the lesser houses do not collide: no two characters share an id, and no canon person was overwritten', () => {
  const ids = CHARACTERS.map((c) => c.id); assert.equal(new Set(ids).size, ids.length, 'unique ids');
  const s = world();
  for (const c of CHARACTERS) assert.equal(s.characters[c.id].name, c.name, `${c.id} is still ${c.name}`);
});
