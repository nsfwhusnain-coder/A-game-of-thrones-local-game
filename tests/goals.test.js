// Goals and the house ways (docs/gdd/08-characters-politics.md §4, 09 §2; WP D6): some ninety goals of the realm's
// people, each step a verb the engine knows; every actor the minds may choose has at least one goal; every great and
// major house has ways of its own; and a lord with nothing pressing works at what they want.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../public/js/shared/world.js';
import { GOALS, RANK_GOALS, NATURE_GOALS } from '../public/data/goals.js';
import { HOUSES } from '../public/data/houses.js';
import { VERBS } from '../public/js/engine/actions/registry.js';
import { goalsOf } from '../public/js/engine/minds/goals.js';
import { HOUSES_WITH_WAYS, treeChoice } from '../public/js/engine/minds/houseways.js';
import { scoreActors } from '../public/js/engine/minds/salience.js';

const KINDS = new Set(['power', 'crown', 'wealth', 'revenge', 'survival', 'family', 'duty', 'faith', 'war', 'honour', 'knowledge', 'pleasure']);

test('some ninety goals, each a known person\'s, each step a verb the engine knows', () => {
  const s = createInitialState('agot_298', 'stark', { seed: 1 });
  const all = Object.entries(GOALS).flatMap(([who, gs]) => gs.map((g) => [who, g]));
  assert.ok(all.length >= 90, `${all.length} goals`);
  for (const [who, g] of [...all, ...Object.values(RANK_GOALS).flat().map((g) => ['(rank)', g]), ...Object.values(NATURE_GOALS).map((g) => ['(nature)', g])]) {
    if (who[0] !== '(') assert.ok(s.characters[who], `${who} is someone`);
    assert.ok(g.text && KINDS.has(g.kind) && g.priority >= 1 && g.priority <= 3, `${who}: ${g.text}`);
    for (const v of g.steps) assert.ok(VERBS[v], `${who}: ${v} is a verb`);
  }
});

test('every actor the minds may choose has a goal', () => {
  for (const house of ['stark', 'lannister', 'hightower', 'dayne']) {
    const s = createInitialState('agot_298', house, { seed: 2 });
    const none = scoreActors(s).filter((a) => !goalsOf(s, s.characters[a.id]).length).map((a) => a.id);
    assert.deepEqual(none, [], `as ${house}`);
  }
});

test('every great and major house has ways of its own', () => {
  const missing = HOUSES.filter((h) => ['crown', 'paramount', 'major', 'order', 'tribe', 'exile'].includes(h.rank) && !HOUSES_WITH_WAYS.includes(h.id)).map((h) => h.id);
  assert.deepEqual(missing, []);
});

test('a lord with nothing pressing works at what they want', () => {
  const s = createInitialState('agot_298', 'stark', { seed: 3 });
  let worked = 0;
  for (let k = 0; k < 20; k++) for (const id of ['walder_frey', 'leyton_hightower', 'paxter_redwyne', 'wyman_manderly', 'tywin_lannister', 'mace_tyrell', 'doran_martell', 'yohn_royce']) {
    const c = treeChoice(s, id);
    if (c.rule !== 'goal') continue;
    worked++;
    assert.ok(goalsOf(s, s.characters[id]).some((g) => g.steps.includes(c.verb)), `${id}'s ${c.verb} is a step of a goal`);
    assert.match(c.why, /You work at what you want/);
  }
  assert.ok(worked > 0, 'some weeks, a lord works at a goal');
});
