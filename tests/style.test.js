// The style bible as data (docs/gdd/10-narrative-events.md §8–9; WP D7): the narrator's instructions are built from it
// with an example of another house, the validators read its forbidden words, the chosen maturity rides every prompt,
// and the later chapters of the story stay unsaid until this game reaches them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../public/js/shared/world.js';
import { EXAMPLES, FORBIDDEN, MATURITY, exampleFor } from '../public/data/style.js';
import { anachronismsIn } from '../public/data/anachronisms.js';
import { instructionsFor } from '../server/ai/calls/narrate.js';
import { settingsText } from '../server/ai/context/primer.js';
import { GAME_WORDS } from '../server/ai/validate/narration.js';

test('the few-shot example is always of another house than the player\'s', () => {
  for (const e of EXAMPLES) {
    assert.notEqual(exampleFor(e.house).house, e.house);
    const text = instructionsFor(e.house);
    assert.ok(!text.includes(e.headline), `a ${e.house} player is not shown the ${e.house} example`);
    assert.ok(text.includes(exampleFor(e.house).headline));
  }
});

test('every forbidden word of the style bible is caught by the validators', () => {
  const samples = ['His morale was low.', 'Unrest grew.', 'The realm holds its breath.', 'A tapestry of lies.', 'A testament to his courage.', 'Little did they know.', 'Winds of change blew.', 'It echoed through the halls.', 'She delved into the books.', 'On day 3 they marched.', 'The player chose war.', 'It was the next turn.'];
  for (const t of samples) assert.ok(GAME_WORDS.some((re) => re.test(t)), t);
  assert.ok(GAME_WORDS.length >= FORBIDDEN.length);
  assert.ok(!GAME_WORDS.some((re) => re.test('Ser Loras rode to the Op of the valley')), 'a capitalised name is no engine op');
});

test('the chosen maturity rides the narrator\'s and every speaker\'s prompt', () => {
  assert.ok(instructionsFor('stark', 'restrained').includes(MATURITY.restrained));
  assert.ok(instructionsFor('stark').includes(MATURITY.book));
  const s = createInitialState('agot_298', 'stark', { seed: 1 }); s.meta.settings = { ...(s.meta.settings || {}), maturity: 'restrained' };
  assert.ok(settingsText(s).includes(MATURITY.restrained));
});

test('the later chapters stay unsaid until this game reaches them — by the beats\' own ids', () => {
  const s = createInitialState('agot_298', 'stark', { seed: 1 }); s.plots = { ...(s.plots || {}), log: [] };
  const said = (t) => anachronismsIn(s, t).map((a) => a.phrase.toLowerCase());
  assert.deepEqual(said('Theon was called Reek.'), ['reek']);
  assert.deepEqual(said('The red comet hung over the Red Keep.'), ['the red comet']);
  assert.deepEqual(said('They spoke of the sack of Winterfell.'), ['the sack of winterfell']);
  s.plots.log.push({ thread: 'ironborn', stage: 'winterfell_burns' }, { thread: 'omens', stage: 'comet' });
  assert.deepEqual(said('Theon was called Reek after the sack of Winterfell, under the red comet.'), []);
});
