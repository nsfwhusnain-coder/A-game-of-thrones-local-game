// People are data (docs/gdd/08-characters-politics.md §2; bugs B-21, B-22): natures are written numbers, never read out
// of prose, and pronouns come from each character's sex. Scenario tests `natures` and `pronouns` (15-qa-tooling §2).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, applyChanges } from '../public/js/shared/world.js';
import { temperament, natureTags } from '../public/js/shared/temperament.js';
import { vassalTick } from '../public/js/shared/vassals.js';
import { isFemale } from '../public/js/shared/people.js';
import { PERSONAS } from '../public/data/histories.js';
import { NATURES, SWAY } from '../public/data/natures.js';
import { archetypeNature } from '../public/data/archetypes.js';

const fresh = (house = 'stark') => createInitialState('agot_298', house);
// the engine rolls dice for answers and excuses; a test fixes them
const withDice = (v, fn) => { const r = Math.random; Math.random = () => v; try { return fn(); } finally { Math.random = r; } };

test('natures: Eddard Stark is honest and dutiful, never cunning or cold-blooded', () => {
  const s = fresh();
  const { tags, sway } = natureTags(temperament(s.characters.eddard_stark));
  assert.ok(tags.includes('honest') && tags.includes('dutiful'), tags.join(', '));
  assert.ok(!tags.some((t) => /cunning|schemer|cold-blooded|deceitful|unfriendly/.test(t)), tags.join(', '));
  assert.deepEqual(sway, ['duty', 'honour', 'family']);
  // and the ones the books make schemers are
  assert.ok(natureTags(temperament(s.characters.roose_bolton)).tags.includes('a schemer'));
  assert.ok(natureTags(temperament(s.characters.petyr_baelish)).tags.includes('a schemer'));
});

test('natures: every persona is played by written numbers; everyone else by an archetype, never by prose', () => {
  assert.deepEqual(Object.keys(PERSONAS).filter((id) => !NATURES[id] || !SWAY[id]), []);
  const s = fresh();
  // a persona's prose may say anything: the numbers do not move
  const ned = { ...s.characters.eddard_stark, traits: 'cunning, cold-blooded, scheming' };
  assert.equal(temperament(ned).guile, 0.1);
  // an archetype reads trait words, one at a time, and is the same every time
  const a = { id: 'test_knight', house: 'reach', roles: ['knight'], traits: 'brave, pious', age: 30 };
  assert.deepEqual(archetypeNature(a), archetypeNature({ ...a }));
  assert.ok(temperament(a).courage > temperament({ ...a, traits: 'craven' }).courage);
  assert.ok(temperament(a).sway.faith, 'a pious knight is moved by faith');
});

test('pronouns: every character has a sex, and the women of the books are women', () => {
  const s = fresh();
  assert.deepEqual(Object.values(s.characters).filter((c) => !['m', 'f'].includes(c.sex)).map((c) => c.id), []);
  for (const id of ['maege_mormont', 'barbrey_dustin', 'donella_hornwood', 'catelyn_stark', 'old_nan', 'chataya', 'irri', 'olenna_tyrell', 'lyanna_stark']) assert.ok(isFemale(s.characters[id]), id);
  for (const id of ['eddard_stark', 'hodor', 'varys', 'maester_luwin', 'luwin'].filter((i) => s.characters[i])) assert.ok(!isFemale(s.characters[id]), id);
  // a save from before sex was data still knows them
  const old = JSON.parse(JSON.stringify(s)); for (const c of Object.values(old.characters)) { delete c.sex; delete c.gender; }
  applyChanges(old, []); // (migration runs on load; here it is enough that isFemale falls back on the title)
  assert.ok(isFemale(old.characters.maege_mormont));
});

test('pronouns: a lady answers the banners — every line of the engine says she and her', () => {
  const s = fresh();
  const women = ['mormont', 'dustin', 'hornwood'];
  for (const v of women) Object.assign(s.houses[v].obligations = s.houses[v].obligations || {}, { levies: 'called', muster: 'stark', calledDays: 30 });
  const texts = [];
  // answered, with kin riding along
  texts.push(...withDice(0.01, () => vassalTick(s, 20).events).filter((e) => women.some((v) => (e.houses || []).includes(v))).map((e) => `${e.title} ${e.text}`));
  // delayed, then refused
  const s2 = fresh(); for (const v of women) Object.assign(s2.houses[v].obligations = s2.houses[v].obligations || {}, { levies: 'called', muster: 'stark', calledDays: 30 });
  texts.push(...withDice(0.95, () => vassalTick(s2, 20).events).filter((e) => women.some((v) => (e.houses || []).includes(v))).map((e) => `${e.title} ${e.text}`));
  const s3 = fresh(); for (const v of women) { Object.assign(s3.houses[v].obligations = s3.houses[v].obligations || {}, { levies: 'called', muster: 'stark', calledDays: 30 }); s3.characters[s3.houses[v].lord].loyalty = 0; s3.relations[[v, 'stark'].sort().join('|')] = { v: -100 }; }
  texts.push(...withDice(0.95, () => vassalTick(s3, 20).events).filter((e) => women.some((v) => (e.houses || []).includes(v))).map((e) => `${e.title} ${e.text}`));
  assert.ok(texts.length >= 6, `the three ladies were heard from (${texts.length})`);
  for (const t of texts) assert.ok(!/\b(he|him|his|himself)\b/i.test(t.replace(/Winterfell|the harvest|the men/gi, '')), t);
  assert.ok(texts.some((t) => /riding with her|Her men|She will come|her own borders|her neighbour/.test(t)), texts.join('\n'));
});
