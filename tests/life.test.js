// Life (docs/gdd/08-characters-politics.md §5, §8; WP D4): wounds heal in one to three moons or fester; fevers, winter
// and great age; the story's people are not taken by chance under Canon gravity (invariant 11); regents the books name,
// and never another branch's man.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, applyChanges } from '../public/js/shared/world.js';
import { lifeTick, keptByStory, mayDie } from '../public/js/engine/people/life.js';
import { chooseRegent } from '../public/js/shared/regency.js';
import { validate } from '../public/js/engine/state/validate.js';
import { dateOfDay, dayNumber } from '../public/js/engine/time.js';

const world = (house = 'tully', settings = {}) => { const s = createInitialState('agot_298', house, { seed: 4 }); s.meta.settings = { ...(s.meta.settings || {}), ...settings }; return s; };
const days = (s, n, r) => { const out = []; for (let i = 0; i < n; i++) { s.meta.date = { ...dateOfDay(dayNumber(s.meta.date) + 1) }; const x = lifeTick(s, r); out.push(...x.events); applyChanges(s, x.changes, { source: 'Life', told: ['character'], cause: { type: 'rule', ref: 'life' } }); } return out; };
const never = () => 0.99; const always = () => 0.0;

test('a wound heals in one to three moons, and the healed are told of', () => {
  const s = world(); const c = s.characters.edmure_tully; c.status = 'wounded';
  const told = days(s, 95, () => 0.5);
  assert.equal(c.status, 'free'); assert.ok(!c.wound);
  assert.ok(told.length && (s.facts || []).some((f) => f.kind === 'recovered' && f.actors.includes('edmure_tully')), 'a fact of the recovery');
});

test('a festering wound kills — unless the story keeps the wounded for later', () => {
  const s = world(); const knight = Object.values(s.characters).find((c) => c.alive && (c.roles || []).includes('knight') && !keptByStory(s, c) && c.status === 'free');
  knight.status = 'wounded'; s.characters.robb_stark.status = 'wounded';
  days(s, 95, () => 0.01); // every wound festers
  assert.equal(knight.alive, false, `${knight.name} dies of the wound`);
  assert.equal(s.characters.robb_stark.alive, true, 'Robb, whose end is the Red Wedding, lives');
  assert.equal(s.characters.robb_stark.status, 'free');
});

test('winter and great age kill the old — never the story\'s own, under Canon; anyone under Sandbox', () => {
  for (const [g, expect] of [['canon', true], ['sandbox', false]]) {
    const s = world('tully', { canonGravity: g }); s.world = { ...(s.world || {}), season: 'winter' };
    s.characters.walder_frey.age = 91; s.characters.hoster_tully.age = 90;
    days(s, 7 * 60, always);
    assert.equal(s.characters.hoster_tully.alive, expect, `${g}: Lord Hoster, whose death is the story's, ${expect ? 'lives' : 'may die'}`);
    assert.ok(Object.values(s.characters).some((c) => !c.alive && c.cause === 'a winter chill'), `${g}: winter takes someone`);
  }
  assert.equal(mayDie(world('tully', { canonGravity: 'loose' }), world().characters.hoster_tully), true, 'Loose keeps only the pillars');
});

test('invariant 11: no one the story keeps died of chance before their time; a beat or an order may kill anyone', () => {
  const s = world();
  applyChanges(s, [{ op: 'character', id: 'robert_baratheon', alive: false, cause: 'a fever' }], { source: 'Life', cause: { type: 'rule', ref: 'life' } });
  assert.match(validate(s).join(' '), /11: Robert Baratheon died of a fever/);
  const t = world();
  applyChanges(t, [{ op: 'character', id: 'robert_baratheon', alive: false, cause: 'gored by a boar' }], { source: 'The ravens', cause: { type: 'beat', ref: 'last_hunt.boar' } });
  applyChanges(t, [{ op: 'character', id: 'sansa_stark', alive: false, cause: 'executed' }], { source: 'Your order', cause: { type: 'order', ref: 'o1' } });
  assert.doesNotMatch(validate(t).join(' '), /11:/);
  const u = world('tully', { canonGravity: 'sandbox' });
  applyChanges(u, [{ op: 'character', id: 'robert_baratheon', alive: false, cause: 'a fever' }], { source: 'Life', cause: { type: 'rule', ref: 'life' } });
  assert.doesNotMatch(validate(u).join(' '), /11:/, 'Sandbox keeps no one');
});

test('regents: the ones the books name, the widow of whatever house, and never another branch\'s man (B-23)', () => {
  const s = world('arryn');
  assert.equal(chooseRegent(s, 'arryn')?.id, 'lysa_arryn');
  const k = world('lannister');
  applyChanges(k, [{ op: 'character', id: 'robert_baratheon', alive: false, cause: 'a boar' }], { source: 'test', cause: { type: 'beat' } });
  k.houses.baratheon.lord = 'joffrey_baratheon';
  assert.equal(chooseRegent(k, 'baratheon')?.id, 'cersei_lannister', 'the Queen Regent for her son');
  const d = world('dayne');
  assert.notEqual(chooseRegent(d, 'dayne')?.id, 'gerold_dayne', 'the Darkstar never holds Starfall for his cousin');
});
