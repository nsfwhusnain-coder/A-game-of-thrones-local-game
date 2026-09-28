// The matters catalogue (docs/gdd/10-narrative-events.md §6; WP D3): every matter is a template — the model may not
// invent one (B-28) — and every template renders (words with no holes, two to four answers with hints) and resolves
// (each answer's effects and its silence apply cleanly).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createInitialState, applyChanges, getRelation } from '../public/js/shared/world.js';
import { MATTERS, MATTER_IDS } from '../public/data/matters.js';
import { HOOKS } from '../public/data/hooks.js';
import { matterContext, realmPetition, applyPetitionFx } from '../public/js/shared/petitions.js';

const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

// a world with something of everything in it, as one house sees it: coin and hunger, a war, captives both ways, a doubtful
// vassal, a debt, late dues, autumn, a betrothed daughter, friends at war, a turncoat in the enemy's camp
function rich(house) {
  const s = createInitialState('agot_298', house, { seed: 11 });
  const me = s.houses[house]; const others = Object.values(s.houses).filter((h) => h.id !== house && h.lord && s.characters[h.lord]?.alive && h.id !== me.liege && h.liege !== house);
  me.figures.treasury.v = 20000; me.figures.food = { v: 1 };
  if (me.liege) me.obligations = { ...(me.obligations || {}), tribute: 'late' };
  s.world = { ...(s.world || {}), season: 'autumn' };
  const [foe, f1, f2, f3, third] = others.sort((a, b) => getRelation(s, house, a.id) - getRelation(s, house, b.id)).filter((h) => h.rank !== 'order');
  for (const f of [f1, f2, f3]) applyChanges(s, [{ op: 'relation', a: house, b: f.id, delta: 60 - getRelation(s, house, f.id) }], { source: 'test' });
  applyChanges(s, [{ op: 'relation', a: house, b: third.id, delta: -40 - getRelation(s, house, third.id) }], { source: 'test' });
  applyChanges(s, [{ op: 'war', status: 'start', name: 'The test war', attackers: [foe.id], defenders: [house] }, { op: 'war', status: 'start', name: 'A friend\'s war', attackers: [f1.id], defenders: [third.id] }], { source: 'test' });
  s.wars.find((w) => w.name === 'The test war').score = 40;
  const theirs = Object.values(s.characters).find((c) => c.alive && c.house === foe.id && c.id !== foe.lord);
  if (theirs) Object.assign(theirs, { status: 'imprisoned', loc: me.seat });
  const mine = Object.values(s.characters).filter((c) => c.alive && c.house === house && c.id !== me.lord);
  const held = mine.find((c) => c.age > 20); if (held) Object.assign(held, { status: 'imprisoned', loc: foe.seat });
  const v = Object.values(s.houses).find((h) => h.liege === house && h.lord); if (v) s.characters[v.lord].loyalty = 30;
  const fv = Object.values(s.houses).find((h) => h.liege === foe.id && h.lord); if (fv) s.characters[fv.lord].loyalty = 30;
  me.loans = [{ to: f2.id, amount: 3000, turn: 0 }];
  const girl = mine.find((c) => c.sex === 'f' && c.age >= 12 && !c.betrothed && !c.spouse);
  const boy = Object.values(s.characters).find((c) => c.alive && c.house === f3.id && c.sex !== 'f' && !c.betrothed && !c.spouse);
  if (girl && boy) { girl.betrothed = boy.id; boy.betrothed = girl.id; }
  return s;
}
const HOUSES = ['stark', 'tully', 'lannister', 'tyrell', 'arryn', 'baratheon', 'martell', 'frey', 'bolton', 'karstark', 'hightower', 'mormont'];
const WORLDS = HOUSES.map(rich);

const holes = (t) => /undefined|null|NaN|\$\{|\[object/.test(String(t));
function checkShape(id, m) {
  assert.ok(m.title && m.text && !holes(m.title) && !holes(m.text), `${id}: words with no holes — ${m.title} / ${m.text}`);
  assert.ok(m.options.length >= 2 && m.options.length <= 4, `${id}: two to four answers`);
  for (const o of m.options) {
    assert.ok(o.label && !holes(o.label), `${id}: every answer has words`);
    assert.ok(typeof o.hint === 'string' && o.hint.length && !holes(o.hint), `${id}: every answer has a hint (${o.label})`);
    assert.ok(Array.isArray(o.fx), `${id}: every answer has effects (${o.label})`);
  }
}

test('the catalogue: some seventy templates, each with a group and a gist; with the Director\'s hooks, more', () => {
  const ids = Object.keys(MATTERS);
  assert.ok(ids.length >= 60, `${ids.length} templates`);
  for (const [id, m] of Object.entries(MATTERS)) {
    assert.ok(['realm', 'lords', 'people', 'opportunity', 'engine', 'canon'].includes(m.group), `${id} has a group`);
    assert.ok(m.gist, `${id} has a gist`);
    assert.equal(!!m.raise, ['realm', 'lords', 'people'].includes(m.group), `${id}: drawn templates raise, the others are raised where they happen`);
  }
  const hooks = HOOKS.filter((h) => h.matter).length;
  assert.ok(ids.length + hooks >= 70, `${ids.length} templates + ${hooks} hook matters`);
});

test('no matter without a template: the decision op refuses an invented one (B-28)', () => {
  const s = createInitialState('agot_298', 'stark', { seed: 1 });
  const m = { title: 'The Death of the Lion', text: 'Something grand.', options: ['Yes', 'No'] };
  const r = applyChanges(s, [{ op: 'decision', ...m }], { source: 'test' });
  assert.match(r.rejected[0]?.reason || '', /no such matter/); assert.equal((s.decisions || []).length, 0, 'nothing reaches the lord');
  assert.match(applyChanges(s, [{ op: 'decision', matter: 'death_of_the_lion', ...m }], { source: 'test' }).rejected[0]?.reason || '', /no such matter/);
  applyChanges(s, [{ op: 'decision', matter: 'border_quarrel', ...m }], { source: 'test' });
  assert.equal(s.decisions.at(-1).matter, 'border_quarrel');
  applyChanges(s, [{ op: 'decision', matter: 'hook:holdfast_fire', ...m }], { source: 'test' });
  assert.equal(s.decisions.length, 2);
});

test('every drawn template renders somewhere, and every answer and every silence resolves', () => {
  for (const [id, T] of Object.entries(MATTERS).filter(([, m]) => m.raise)) {
    let seen = 0;
    for (const s of WORLDS) for (let k = 0; k < 4; k++) {
      const m = T.raise(matterContext(s)); if (!m) continue;
      seen++; checkShape(id, m);
      for (const fx of [...m.options.map((o) => o.fx), m.lapse || []]) {
        const c = structuredClone(s);
        assert.doesNotThrow(() => applyPetitionFx(c, fx, 'test'), `${id}: effects apply`);
      }
      const c = structuredClone(s);
      const r = applyChanges(c, [{ op: 'decision', matter: id, ...m }], { source: 'test' });
      assert.deepEqual(r.rejected, [], `${id}: the matter is brought`); assert.equal(c.decisions.at(-1).matter, id);
    }
    assert.ok(seen, `${id} is raised in at least one of the worlds`);
  }
});

test('the realm brings a matter from the catalogue, and not the same one twice in six turns', () => {
  const s = WORLDS[0]; s.plots = s.plots || {}; s.plots.petitioned = {};
  const got = new Set();
  for (let t = 0; t < 12; t++) { const m = realmPetition(s); assert.ok(m && MATTERS[m.matter], 'a catalogued matter'); got.add(m.matter); s.plots.petitioned[m.matter] = s.meta.turn; }
  assert.ok(got.size >= 10, `variety: ${[...got].join(', ')}`);
});

test('the matters raised where they happen are raised there, by their template ids', () => {
  const src = ['public/js/shared/vassals.js', 'public/js/engine/politics/war.js', 'public/js/shared/plots.js'].map(read).join('\n');
  for (const [id, m] of Object.entries(MATTERS).filter(([, x]) => ['engine', 'opportunity'].includes(x.group))) {
    assert.ok(new RegExp(`(matter|id): '${id}'`).test(src), `${id} is raised in the engine`);
  }
  // the beats' matters are catalogued, and every matter the beats raise is in the catalogue
  const beats = read('public/data/beats.js');
  const raised = [...beats.matchAll(/decision[^{]*\{\s*id: '([a-z_]+)'/g)].map((x) => x[1]);
  assert.ok(raised.length >= 8, `${raised.length} canon matters`);
  for (const id of raised) assert.ok(MATTER_IDS.has(id), `${id} (a beat's matter) is catalogued`);
  for (const [id, m] of Object.entries(MATTERS).filter(([, x]) => x.group === 'canon')) assert.ok(raised.includes(id), `${id} is raised by ${m.beat}`);
});
