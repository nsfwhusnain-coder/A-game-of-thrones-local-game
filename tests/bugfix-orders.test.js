// What the order reader got wrong in the bug hunt of 2 October 2026 (docs/BUG-HUNT-2026-10-02.md, OR1 to OR11). Every phrase
// here is one the report quotes; the rule reader (server/orders/parse.js) is shared by every model, so these are read by rule
// alone: no model, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, applyChanges } from '../public/js/shared/world.js';
import { withRng } from '../public/js/engine/rng.js';
import { parseOrder } from '../server/orders/parse.js';

const world = (house = 'stark', setup = []) => { const s = createInitialState('agot_298', house, { seed: 298 }); withRng(s, () => applyChanges(s, setup)); return s; };
const withHost = () => world('stark', [{ op: 'army_create', id: 'host_of_winterfell', owner: 'stark', name: 'The Host of Winterfell', at: 'stark', men: 4000, commander: 'robb_stark' }, { op: 'character', id: 'robb_stark', with: 'host_of_winterfell' }]);
const read = (s, text, o) => parseOrder(s, text, o);
const verbs = (p) => p.actions.map((a) => a.verb);

test('OR1: "the Wall" is where men are sent, never walls to build', () => {
  const s = withHost();
  const levy = read(s, 'Raise 200 men at Winterfell and send them to the Wall');
  assert.deepEqual(levy.actions.map((a) => [a.verb, a.params]), [['raise_levies', { at: 'stark', men: 200, to: 'nights_watch' }]], 'the levy is raised and sent: no gold goes on walls');
  assert.ok(levy.complete);
  assert.deepEqual(verbs(read(s, 'Raise 500 men and send them to the Wall.')), ['raise_levies']);
  assert.deepEqual(verbs(read(s, 'Send Jon Snow to the Wall.')), ['send_person']);
  assert.deepEqual(verbs(read(s, 'Send them to the Wall.')), ['march_host']);
  for (const t of ['Send 100 men to the wall', 'Send 100 men to guard the wall', 'Raise 100 men and march them to the Wall', 'Take the host to the Wall', 'Reinforce the Wall with fifty spears']) assert.ok(!verbs(read(s, t)).includes('fund_works'), `${t}: no works`);
});

test('OR1: walls at a castle are still walls', () => {
  const s = withHost();
  for (const t of ['Strengthen the walls at Winterfell.', 'Build walls at Winterfell', 'Build a wall at Winterfell', 'Raise the walls at Winterfell']) {
    const p = read(s, t);
    assert.deepEqual(p.actions.map((a) => [a.verb, a.params.template, a.params.holding]), [['fund_works', 'walls', 'stark']], t);
  }
});
