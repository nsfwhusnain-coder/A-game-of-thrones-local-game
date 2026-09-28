// The map's modes (docs/gdd/11-map-visuals.md §4; WP E2): each mode visibly different from Realms at L0 — here, over
// every holding's fill, the mean colour distance from the Realms fill is above a threshold (B-29: Diplomacy looked like
// Realms) — and each draws what it says: war red, your realm gold, the unknown in fog, a siege in red.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, applyChanges } from '../public/js/shared/world.js';
import { colorFor, diplomacyOf, knowledgeOf, warOf, DIPLO, KNOW, WAR, LEGENDS } from '../public/js/map3d/modes.js';

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const fills = (s, mode) => Object.keys(s.holdings).map((id) => colorFor(s, mode, id));

test('every mode is visibly different from Realms across the whole map', () => {
  const s = createInitialState('agot_298', 'stark', { seed: 1 });
  applyChanges(s, [{ op: 'war', status: 'start', name: 'A test war', attackers: ['stark'], defenders: ['lannister'] }], { source: 'test' });
  const realms = fills(s, 'political');
  for (const mode of ['diplomacy', 'knowledge', 'war', 'houses', 'economy']) {
    const f = fills(s, mode); const mean = f.reduce((n, c, i) => n + dist(c, realms[i]), 0) / f.length;
    assert.ok(mean > (mode === 'houses' ? 20 : 60), `${mode}: mean distance ${mean.toFixed(1)} from Realms`);
  }
  // and Diplomacy is not one colour: war, neutral and your own realm all show
  const keys = new Set(Object.values(s.holdings).map((h) => diplomacyOf(s, h).key));
  for (const k of ['mine', 'war', 'neutral']) assert.ok(keys.has(k), `Diplomacy shows ${k}`);
});

test('each mode draws what it says', () => {
  const s = createInitialState('agot_298', 'stark', { seed: 1 });
  applyChanges(s, [{ op: 'war', status: 'start', name: 'A test war', attackers: ['stark'], defenders: ['lannister'] }], { source: 'test' });
  assert.deepEqual(diplomacyOf(s, s.holdings.stark).rgb, DIPLO.mine); assert.ok(diplomacyOf(s, s.holdings.stark).hatch);
  assert.deepEqual(diplomacyOf(s, s.holdings.lannister).rgb, DIPLO.war);
  assert.deepEqual(knowledgeOf(s, s.holdings.stark).rgb, KNOW.seen, 'Winterfell is seen');
  const far = Object.values(s.holdings).filter((h) => h.region === 'essos').map((h) => knowledgeOf(s, h).key);
  assert.ok(far.includes('fog') || far.includes('old'), 'Essos is fog or old report to the North');
  s.holdings.tully.status = 'besieged'; assert.deepEqual(warOf(s, s.holdings.tully).rgb, WAR.besieged);
  s.holdings.frey.devastation = 80; assert.equal(warOf(s, s.holdings.frey).key, 'devastated');
  for (const m of ['political', 'houses', 'diplomacy', 'knowledge', 'war', 'economy', 'prosperity', 'unrest', 'terrain']) assert.ok(LEGENDS[m]?.title, `${m} has a legend`);
});
