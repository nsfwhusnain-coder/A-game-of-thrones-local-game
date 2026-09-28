// Nature on the map (docs/gdd/11-map-visuals.md §5; WP E3): where the snow lies this season, whether the northern
// rivers are frozen, the regional tints of the painted palette, and the painted tree atlas the forests are drawn from.
// No three.js here: everything is plain numbers and pixels, so it can be tested without a canvas.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * clamp(t, 0, 1);

// map latitudes (the y of the atlas, the z of the scene): the lands beyond the Wall, the Wall, the Neck, the Twins
export const SNOW = { beyond: 520, wall: 600, neck: 1120, riverlands: 1340 };

/**
 * The snow line of the season (§5.3): north of it the ground is white and the broadleaf trees are bare.
 * Summer: only beyond the Wall. Autumn: it creeps from the Wall toward the Neck as the season ages.
 * Winter: the North white, the line reaching the Riverlands' north. Spring: it draws back to the Wall.
 */
export function snowLineOf(world = {}) {
  const d = world.seasonDays || 0;
  switch (world.season) {
    case 'autumn': return lerp(SNOW.wall, SNOW.neck, d / 540);
    case 'winter': return lerp(SNOW.neck, SNOW.riverlands, d / 120);
    case 'spring': return lerp(SNOW.riverlands, SNOW.wall, d / 300);
    default: return SNOW.beyond;
  }
}

/** Deep winter freezes the rivers of the North (a shader flag, north of the snow line only). */
export const riversFrozen = (world = {}) => world.season === 'winter' && (world.seasonDays || 0) >= 45;

// The painted palette's regional tints (§5.1): soft pools of colour over the atlas' biomes — Westerlands ochre hills,
// the Reach golden-green, the Vale blue-grey mountains, the Stormlands dark woods, the Iron Islands slate.
// [x, y, radius, rgb, strength, where] — where: 'high' (hills and mountains), 'low' (the plains) or 'all'.
export const REGION_TINTS = [
  [290, 1640, 230, [176, 142, 82], 0.42, 'high'],   // the Westerlands: ochre hills
  [520, 1960, 330, [158, 156, 74], 0.3, 'low'],     // the Reach: golden-green
  [800, 1400, 190, [120, 128, 146], 0.5, 'high'],   // the Vale: blue-grey mountains
  [800, 1880, 170, [58, 90, 50], 0.35, 'all'],      // the Stormlands: dark green woods
  [150, 1380, 110, [98, 104, 110], 0.5, 'all'],     // the Iron Islands: slate
  [870, 2140, 260, [206, 150, 96], 0.25, 'all'],    // Dorne: sand and red rock
];
/** The tint a point takes: [rgb, weight] or null. `high` is 0..1 (how hilly the ground is). */
export function regionTint(x, y, high = 0) {
  let best = null, bw = 0;
  for (const [cx, cy, r, rgb, k, where] of REGION_TINTS) {
    const d = Math.hypot(x - cx, y - cy) / r; if (d >= 1) continue;
    const fall = (1 - d * d) ** 2;
    const w = k * fall * (where === 'high' ? high : where === 'low' ? 1 - high : 1);
    if (w > bw) { bw = w; best = rgb; }
  }
  return best ? [best, bw] : null;
}

// ───────────── the painted tree atlas (§5.2) ─────────────
// Four tiles side by side, drawn procedurally at startup (no downloaded assets): a conifer, a broadleaf, a dead winter
// tree and a weirwood (white bark, red leaves). Painted, not modelled: a soft silhouette, a lit side and a shaded side.
export const TREE_TILES = ['conifer', 'broadleaf', 'bare', 'weirwood'];
export const TILE = 64;

function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** The atlas as RGBA pixels: width 4×TILE, height TILE, row 0 at the top (the canopy's crown). */
export function treeAtlas(T = TILE) {
  const W = T * TREE_TILES.length, px = new Uint8Array(W * T * 4);
  const put = (tile, x, y, rgb, a = 255) => {
    x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= T || y >= T) return;
    const o = (y * W + tile * T + x) * 4; const k = a / 255, keep = px[o + 3] / 255 * (1 - k);
    const out = k + keep; if (out <= 0) return;
    for (let c = 0; c < 3; c++) px[o + c] = Math.round((rgb[c] * k + px[o + c] * keep) / out);
    px[o + 3] = Math.round(out * 255);
  };
  const disc = (tile, cx, cy, r, rgb, lit = 0.25) => {
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      const d = Math.hypot(x - cx, y - cy) / r; if (d > 1) continue;
      // lit from the upper left, shaded to the lower right; the rim fades soft
      const l = 1 + lit * ((cx - x) + (cy - y)) / r * 0.5;
      put(tile, x, y, rgb.map((c) => clamp(c * l, 0, 255)), 255 * clamp((1 - d) * 3, 0, 1));
    }
  };
  const trunk = (tile, x0, y0, y1, w, rgb) => { for (let y = y0; y <= y1; y++) for (let x = -w; x <= w; x++) put(tile, x0 + x, y, rgb.map((c) => c * (x < 0 ? 1.1 : 0.8))); };
  const branch = (tile, x0, y0, ang, len, w, rgb, r, depth) => {
    const x1 = x0 + Math.cos(ang) * len, y1 = y0 - Math.sin(ang) * len;
    for (let t = 0; t <= 1; t += 1 / (len * 2)) { const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t; for (let k = -w; k <= w; k += 0.5) put(tile, x + k, y, rgb); }
    if (depth > 0) for (const s of [-1, 1]) branch(tile, x1, y1, ang + s * (0.35 + r() * 0.35), len * (0.62 + r() * 0.12), Math.max(0.5, w * 0.6), rgb, r, depth - 1);
  };
  const r = rng(298);
  // 0 — the conifer: tiers of dark needles narrowing to a point
  trunk(0, T / 2, T * 0.8, T - 2, 1.5, [70, 50, 34]);
  for (let k = 0; k < 7; k++) { const y = T * (0.18 + k * 0.1), w = T * (0.08 + k * 0.045); for (let j = 0; j < 5; j++) disc(0, T / 2 + (r() - 0.5) * w, y + r() * 4, w * (0.55 + r() * 0.2), [38 + r() * 12, 70 + r() * 14, 48], 0.35); }
  // 1 — the broadleaf: a round crown of clustered leaves
  trunk(1, T / 2, T * 0.55, T - 2, 2, [84, 62, 40]);
  for (let j = 0; j < 22; j++) { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * T * 0.24; disc(1, T / 2 + Math.cos(a) * d, T * 0.38 + Math.sin(a) * d * 0.85, T * (0.1 + r() * 0.06), [70 + r() * 20, 108 + r() * 20, 46], 0.3); }
  // 2 — the bare winter tree: grey-brown branches, a little snow on the crooks
  branch(2, T / 2, T - 2, Math.PI / 2, T * 0.3, 2, [96, 84, 72], r, 4);
  for (let j = 0; j < 14; j++) disc(2, T * (0.25 + r() * 0.5), T * (0.2 + r() * 0.35), 1.6, [236, 240, 246], 0);
  // 3 — the weirwood: white bark, a crown of blood-red leaves
  trunk(3, T / 2, T * 0.5, T - 2, 3, [232, 226, 214]);
  for (let j = 0; j < 20; j++) { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * T * 0.26; disc(3, T / 2 + Math.cos(a) * d, T * 0.34 + Math.sin(a) * d * 0.8, T * (0.09 + r() * 0.06), [150 + r() * 40, 28 + r() * 16, 22], 0.3); }
  return { width: W, height: T, pixels: px };
}
