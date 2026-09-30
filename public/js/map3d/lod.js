// The map camera's levels of detail (docs/gdd/11-map-visuals.md §2–3; WP E1) — no imports, so the rules can be tested.
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ── The camera's levels of detail (docs/gdd/11-map-visuals.md §2–3; WP E1) ──
// L0 the whole Known World, L1 a region, L2 a few holdings, L3 one castle and its lands: camera distances in map units.
// The camera never comes closer than L3 (never into the trees) nor goes farther than L0.
export const LOD = [3500, 1200, 460, 160];
/** The continuous level of detail at a camera distance: 0 (L0) … 3 (L3), fractional between the levels. */
export function lodOf(d) {
  if (d >= LOD[0]) return 0; if (d <= LOD[3]) return 3;
  for (let i = 0; i < 3; i++) if (d <= LOD[i] && d >= LOD[i + 1]) return i + Math.log(LOD[i] / d) / Math.log(LOD[i] / LOD[i + 1]);
  return 0;
}
/** How visible a layer shown from level `from` (to level `to`) is at `lod`: 0…1, faded over ±0.15 of a level — never popping. */
export function layerAlpha(lod, from = 0, to = 3) {
  const ramp = (x) => Math.round(clamp((x + 0.15) / 0.3, 0, 1) * 1e6) / 1e6;
  return Math.min(ramp(lod - from), ramp(to - lod));
}
// L0 frames Westeros and the Narrow Sea (B-29), not the atlas origin; the pan bounds widen as the camera comes down
export const HOME_BOX = { x0: 560, x1: 880, z0: 1200, z1: 1540 }; // where the camera's centre may be at L0
export const KNOWN_BOX = { x0: 200, x1: 1720, z0: 380, z1: 2300 }; // … and at L1 and closer
export const L0_CENTRE = [720, 1370];

/**
 * How many host and fleet plates the map shows at once at a camera distance (WP U8): a few from far out, a dozen at the default zoom (about 520), and every one when
 * the camera is down among a few holdings — where the lord is looking at them. The plates dropped are the farthest from the player's own lands (tokens.js capTokens).
 */
export function tokenCap(dist) {
  const l = lodOf(dist);
  if (l <= 1) return 8;
  if (l <= 2) return Math.round(8 + (l - 1) * 4.6); // 8 → 12.6: at the default zoom (l ≈ 1.87) that is 12
  if (l < 2.6) return Math.round(12 + ((l - 2) / 0.6) * 48);
  return 60;
}
