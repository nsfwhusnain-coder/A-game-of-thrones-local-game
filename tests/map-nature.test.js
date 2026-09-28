// Nature on the map (docs/gdd/11-map-visuals.md §5; WP E3): the season's snow line (beyond the Wall in summer, creeping
// to the Neck through an autumn, the North white in winter), the northern rivers' ice, the painted palette's regional
// tints and the procedural tree atlas the forest impostors are drawn from.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SNOW, snowLineOf, riversFrozen, regionTint, treeAtlas, TREE_TILES, TILE } from '../public/js/map3d/nature.js';
import { seasonTick } from '../public/js/shared/economy.js';
import { createInitialState } from '../public/js/shared/world.js';

test('summer keeps the snow beyond the Wall; autumn creeps toward the Neck; winter reaches the Riverlands', () => {
  assert.ok(snowLineOf({ season: 'summer' }) < SNOW.wall);
  assert.equal(snowLineOf({}), snowLineOf({ season: 'summer', seasonDays: 900 }));
  const a0 = snowLineOf({ season: 'autumn', seasonDays: 0 }), a1 = snowLineOf({ season: 'autumn', seasonDays: 270 }), a2 = snowLineOf({ season: 'autumn', seasonDays: 2000 });
  assert.ok(a0 >= SNOW.wall - 1 && a0 < a1 && a1 < a2 && a2 === SNOW.neck, `autumn ${a0} → ${a1} → ${a2}`);
  const w0 = snowLineOf({ season: 'winter', seasonDays: 0 }), w1 = snowLineOf({ season: 'winter', seasonDays: 400 });
  assert.ok(w0 >= SNOW.neck && w1 === SNOW.riverlands);
  // Winterfell (y 874) lies under snow in winter and in a late autumn, not in summer
  assert.ok(snowLineOf({ season: 'summer' }) < 874 && w0 > 874 && a2 > 874);
  const s1 = snowLineOf({ season: 'spring', seasonDays: 400 });
  assert.ok(s1 <= SNOW.wall && snowLineOf({ season: 'spring', seasonDays: 0 }) > s1, 'spring draws the snow back');
});

test('the rivers freeze only in deep winter', () => {
  assert.equal(riversFrozen({ season: 'autumn', seasonDays: 500 }), false);
  assert.equal(riversFrozen({ season: 'winter', seasonDays: 5 }), false);
  assert.equal(riversFrozen({ season: 'winter', seasonDays: 90 }), true);
});

test('a season ages under Canon gravity too, so the autumn snow can creep', () => {
  const s = createInitialState('agot_298', 'stark');
  s.world.season = 'autumn'; s.world.seasonDays = 0;
  seasonTick(s, 30); seasonTick(s, 30);
  assert.equal(s.world.season, 'autumn', 'the Citadel\'s ravens are still beats of the story');
  assert.equal(s.world.seasonDays, 60);
  assert.ok(snowLineOf(s.world) > SNOW.wall);
});

test('the painted palette: ochre western hills, blue-grey Vale peaks, slate isles — and nothing in the open North', () => {
  const [rock, wRock] = regionTint(290, 1640, 1); assert.ok(rock[0] > rock[2] && wRock > 0.3, 'the Westerlands are ochre');
  const [vale] = regionTint(800, 1400, 1); assert.ok(vale[2] > vale[0], 'the Vale is blue-grey');
  assert.ok(regionTint(290, 1640, 0) === null || regionTint(290, 1640, 0)[1] < wRock, 'the ochre is on the hills');
  assert.equal(regionTint(553, 874, 0.5), null, 'Winterfell keeps the North\'s own colours');
});

test('the tree atlas: four painted tiles, each a silhouette with a clear edge, the weirwood red-crowned and white-barked', () => {
  const { width, height, pixels } = treeAtlas();
  assert.equal(width, TILE * TREE_TILES.length); assert.equal(height, TILE); assert.equal(pixels.length, width * height * 4);
  const tile = (k) => { let solid = 0, red = 0, white = 0, green = 0; for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) { const o = (y * width + k * TILE + x) * 4; if (pixels[o + 3] < 128) continue; solid++; const [r, g, b] = [pixels[o], pixels[o + 1], pixels[o + 2]]; if (r > 120 && g < 70) red++; if (r > 200 && g > 200 && b > 190) white++; if (g > r && g > b) green++; } return { cover: solid / TILE / TILE, red, white, green }; };
  const t = TREE_TILES.map((_, k) => tile(k));
  for (const [k, x] of t.entries()) assert.ok(x.cover > 0.04 && x.cover < 0.75, `${TREE_TILES[k]} covers ${x.cover.toFixed(2)}`);
  assert.ok(t[0].green > t[0].cover * TILE * TILE * 0.6, 'the conifer is green');
  assert.ok(t[1].green > 0 && t[2].green === 0, 'the winter tree is bare');
  assert.ok(t[3].red > 100 && t[3].white > 20, 'the weirwood: red leaves, white bark');
  // the crown is at the top of each tile (row 0), the foot at the bottom, as the shader samples it
  const alphaRow = (k, y) => { let n = 0; for (let x = 0; x < TILE; x++) n += pixels[(y * width + k * TILE + x) * 4 + 3] > 128; return n; };
  assert.equal(alphaRow(1, 0), 0); assert.ok(alphaRow(1, TILE - 3) > 0, 'the trunk stands on the ground');
  // deterministic: the same atlas every startup
  assert.deepEqual(treeAtlas().pixels.slice(0, 4096), pixels.slice(0, 4096));
});
