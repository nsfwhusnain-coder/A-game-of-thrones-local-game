// The map camera's levels of detail (docs/gdd/11-map-visuals.md §2–3; WP E1): four levels from the whole Known World to
// one castle, a continuous level between them, layers that fade over ±0.15 of a level instead of popping, and an L0
// framed on Westeros and the Narrow Sea (B-29).
import test from 'node:test';
import assert from 'node:assert/strict';
import { LOD, lodOf, layerAlpha, HOME_BOX, KNOWN_BOX, L0_CENTRE } from '../public/js/map3d/lod.js';
import { createInitialState } from '../public/js/shared/world.js';

test('four levels, farthest to closest; the level is continuous and clamped', () => {
  assert.ok(LOD[0] > LOD[1] && LOD[1] > LOD[2] && LOD[2] > LOD[3]);
  assert.equal(lodOf(LOD[0]), 0); assert.equal(lodOf(LOD[3]), 3); assert.equal(lodOf(99999), 0); assert.equal(lodOf(1), 3);
  for (let i = 0; i < 4; i++) assert.ok(Math.abs(lodOf(LOD[i]) - i) < 1e-9);
  let prev = -1; for (let d = LOD[0]; d >= LOD[3]; d *= 0.97) { const l = lodOf(d); assert.ok(l >= prev - 1e-9, 'closer is never a lower level'); prev = l; }
});

test('a layer fades in and out over ±0.15 of a level — never pops', () => {
  assert.equal(layerAlpha(2.5, 2, 3), 1); assert.equal(layerAlpha(1, 2, 3), 0);
  assert.equal(layerAlpha(1.85, 2, 3), 0); assert.equal(layerAlpha(2.15, 2, 3), 1);
  assert.equal(layerAlpha(2, 2, 3), 0.5, 'half seen on the level itself');
  const a = layerAlpha(2, 2, 3), b = layerAlpha(1.95, 2, 3); assert.ok(a > b && b > 0, 'in between, partly seen');
  for (let l = 0; l <= 3; l += 0.01) assert.ok(Math.abs(layerAlpha(l + 0.01, 2, 3) - layerAlpha(l, 2, 3)) < 0.05, 'no jump');
});

test('L0 is framed on Westeros (B-29): the centre lies on the realm, and the pan bounds keep it there', () => {
  const s = createInitialState('agot_298', 'stark', { seed: 1 });
  const west = Object.values(s.holdings).filter((h) => h.region !== 'essos').map((h) => h.pos);
  const bb = [Math.min(...west.map((p) => p[0])), Math.max(...west.map((p) => p[0])), Math.min(...west.map((p) => p[1])), Math.max(...west.map((p) => p[1]))];
  assert.ok(L0_CENTRE[0] > bb[0] && L0_CENTRE[0] < bb[1] + 300, 'the centre is over Westeros or the Narrow Sea');
  assert.ok(Math.abs(L0_CENTRE[1] - (bb[2] + bb[3]) / 2) < 120, 'halfway from the Wall to Dorne');
  assert.ok(HOME_BOX.x0 >= bb[0] && HOME_BOX.x1 <= bb[1] + 300 && HOME_BOX.z0 >= bb[2] && HOME_BOX.z1 <= bb[3]);
  assert.ok(KNOWN_BOX.x0 <= bb[0] && KNOWN_BOX.x1 >= bb[1] && KNOWN_BOX.z0 <= bb[2] && KNOWN_BOX.z1 >= bb[3], 'from L1 the whole realm can be reached');
});
