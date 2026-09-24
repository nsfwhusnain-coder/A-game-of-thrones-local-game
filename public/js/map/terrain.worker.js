// Terrain + province generation from the atlas. Runs in a module Web Worker.
// Produces, at `scale` pixels per world unit: an albedo image (no baked light), an object-space normal map,
// heights, land/forest/depth masks, a climate-region map and the province map (nearest holding per land pixel,
// kept inside the kingdom borders of the atlas).
import { WORLD, LAND, LAKES, MOUNTAIN_RANGES, FORESTS, SWAMPS, STEPPES, RIVERS, ROADS, REGIONS } from '../../data/geography.js';
import { makeNoise } from './noise.js';

self.onmessage = (e) => {
  const { scale = 1, seeds = [], seed = 298, heightScale = 55, features = [] } = e.data;
  const t0 = performance.now();
  const out = generate({ scale, seeds, seed, heightScale, features }, (p, msg) => self.postMessage({ type: 'progress', p, msg }));
  out.ms = Math.round(performance.now() - t0);
  self.postMessage({ type: 'done', ...out }, [out.rgba.buffer, out.normal.buffer, out.province.buffer, out.land.buffer, out.height.buffer, out.forest.buffer, out.depth.buffer]);
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// Climate of each kingdom: [arid, fertile, hilly]
export const REGION_KEYS = ['beyond', 'wall', 'north', 'iron_islands', 'riverlands', 'vale', 'westerlands', 'crownlands', 'reach', 'stormlands', 'dorne'];
const CLIMATE = {
  0: [0.3, 0.5, 0.35], // Essos and unclaimed land
  beyond: [0, 0, 0.55], wall: [0, 0.05, 0.35], north: [0, 0.3, 0.5], iron_islands: [0.05, 0.1, 0.9], riverlands: [0, 1, 0.22],
  vale: [0, 0.75, 0.45], westerlands: [0.05, 0.55, 0.8], crownlands: [0, 0.75, 0.35], reach: [0.12, 1, 0.18], stormlands: [0, 0.5, 0.5], dorne: [1, 0.12, 0.4],
};

function boxBlur(src, W, H, r) {
  if (r < 1) return src.slice();
  const tmp = new Float32Array(W * H), dst = new Float32Array(W * H); const inv = 1 / (2 * r + 1);
  for (let y = 0; y < H; y++) {
    const row = y * W; let acc = 0;
    for (let x = -r; x <= r; x++) acc += src[row + clamp(x, 0, W - 1)];
    for (let x = 0; x < W; x++) { tmp[row + x] = acc * inv; acc += src[row + Math.min(W - 1, x + r + 1)] - src[row + Math.max(0, x - r)]; }
  }
  for (let x = 0; x < W; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[clamp(y, 0, H - 1) * W + x];
    for (let y = 0; y < H; y++) { dst[y * W + x] = acc * inv; acc += tmp[Math.min(H - 1, y + r + 1) * W + x] - tmp[Math.max(0, y - r) * W + x]; }
  }
  return dst;
}
const blur3 = (a, W, H, r) => boxBlur(boxBlur(boxBlur(a, W, H, r), W, H, r), W, H, r); // ≈ gaussian

// Chamfer distance (pixels) from each feature pixel to the nearest non-feature pixel
function distanceTransform(isFeature, W, H, cap = 255) {
  const d = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) d[i] = isFeature[i] ? cap : 0;
  const a = 1, b = 1.4142;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; if (d[i] === 0) continue; let v = d[i];
    if (x > 0) v = Math.min(v, d[i - 1] + a);
    if (y > 0) { v = Math.min(v, d[i - W] + a); if (x > 0) v = Math.min(v, d[i - W - 1] + b); if (x < W - 1) v = Math.min(v, d[i - W + 1] + b); }
    d[i] = v;
  }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
    const i = y * W + x; if (d[i] === 0) continue; let v = d[i];
    if (x < W - 1) v = Math.min(v, d[i + 1] + a);
    if (y < H - 1) { v = Math.min(v, d[i + W] + a); if (x < W - 1) v = Math.min(v, d[i + W + 1] + b); if (x > 0) v = Math.min(v, d[i + W - 1] + b); }
    d[i] = v;
  }
  return d;
}

export function generate({ scale, seeds, seed, heightScale, features }, progress = () => {}) {
  const W = Math.round(WORLD.w * scale), H = Math.round(WORLD.h * scale), N = W * H;
  const { fbm, ridged, noise } = makeNoise(seed);
  const inv = 1 / scale;

  // ---------- 1. Rasterise the atlas ----------
  progress(0.03, 'Charting the coasts');
  const cv = new OffscreenCanvas(W, H);
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const path = (pts) => { ctx.beginPath(); for (let i = 0; i < pts.length; i++) { const [x, y] = pts[i]; if (i) ctx.lineTo(x * scale, y * scale); else ctx.moveTo(x * scale, y * scale); } ctx.closePath(); };
  const line = (pts) => { ctx.beginPath(); for (let i = 0; i < pts.length; i++) { const [x, y] = pts[i]; if (i) ctx.lineTo(x * scale, y * scale); else ctx.moveTo(x * scale, y * scale); } };
  const clear = () => { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); };
  const read = () => { const d = ctx.getImageData(0, 0, W, H).data; const o = new Uint8Array(N); for (let i = 0; i < N; i++) o[i] = d[i * 4]; return o; };
  const readF = () => { const d = ctx.getImageData(0, 0, W, H).data; const o = new Float32Array(N); for (let i = 0; i < N; i++) o[i] = d[i * 4] / 255; return o; };

  clear(); ctx.fillStyle = '#fff'; for (const l of LAND) { path(l.pts); ctx.fill(); }
  ctx.fillStyle = '#000'; for (const l of LAKES) { path(l.pts); ctx.fill(); }
  const landF = readF();
  clear(); ctx.fillStyle = '#fff'; for (const l of LAKES) { path(l.pts); ctx.fill(); }
  const lakeM = read();
  // kingdoms (climate regions): colour = index+1
  // one mask per kingdom, thresholded, so antialiased edges never produce a false in-between kingdom
  const regionRaw = new Uint8Array(N);
  REGION_KEYS.forEach((key, k) => {
    const polys = REGIONS.filter((r) => r.region === key); if (!polys.length) return;
    clear(); ctx.fillStyle = '#fff'; for (const r of polys) { path(r.pts); ctx.fill(); }
    const d = ctx.getImageData(0, 0, W, H).data; for (let i = 0; i < N; i++) if (d[i * 4] >= 128) regionRaw[i] = k + 1;
  });
  // mountain ranges: colour = index+1
  clear(); MOUNTAIN_RANGES.forEach((m, k) => { ctx.fillStyle = `rgb(${k + 1},0,0)`; path(m.pts); ctx.fill(); });
  const rangeRaw = read();
  clear(); ctx.fillStyle = '#fff'; for (const f of FORESTS) { path(f.pts); ctx.fill(); }
  const forestF = readF();
  clear(); ctx.fillStyle = '#fff'; for (const f of SWAMPS) { path(f.pts); ctx.fill(); }
  const swampF = readF();
  clear(); ctx.fillStyle = '#fff'; for (const f of STEPPES) { path(f.pts); ctx.fill(); }
  const steppeF = readF();
  clear(); ctx.strokeStyle = '#fff'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const r of RIVERS) { ctx.lineWidth = Math.max(1.3, r.w * 1.05 * scale); line(r.pts); ctx.stroke(); }
  const riverF = readF();
  clear(); ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1, 0.9 * scale);
  for (const r of ROADS) { line(r.pts); ctx.stroke(); }
  const roadF = readF();

  // ---------- 2. Coastline: the atlas shore, lightly roughened ----------
  progress(0.1, 'Raising the land');
  const landBlur = boxBlur(landF, W, H, Math.max(1, Math.round(1.5 * scale)));
  const land = new Uint8Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, wx = x * inv, wy = y * inv;
    const v = landBlur[i] + fbm(wx * 0.15, wy * 0.15, 3) * 0.22 + noise(wx * 0.6, wy * 0.6) * 0.08;
    land[i] = v > 0.5 ? 1 : 0;
  }
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x; const s = land[i - 1] + land[i + 1] + land[i - W] + land[i + W]; if (land[i] && s === 0) land[i] = 0; else if (!land[i] && s === 4) land[i] = 1; }
  const distLand = distanceTransform(land, W, H, 400);
  const waterM = new Uint8Array(N); for (let i = 0; i < N; i++) waterM[i] = land[i] ? 0 : 1;
  const distWater = distanceTransform(waterM, W, H, 400);

  // ---------- 3. Climate fields (smooth, so kingdom borders never show in the land) ----------
  progress(0.18, 'Reading the weather');
  const aridR = new Float32Array(N), fertR = new Float32Array(N), hillR = new Float32Array(N);
  for (let i = 0; i < N; i++) { const k = regionRaw[i]; const c = CLIMATE[k ? REGION_KEYS[k - 1] : 0] || CLIMATE[0]; aridR[i] = c[0]; fertR[i] = c[1]; hillR[i] = c[2]; }
  const br = Math.max(2, Math.round(14 * scale));
  const arid = blur3(aridR, W, H, br), fertile = blur3(fertR, W, H, br), hilly = blur3(hillR, W, H, br);
  // mountain interior distance, and a blurred "range height" field for foothills
  const inRange = new Uint8Array(N), inRangeF = new Float32Array(N), rangeH = new Float32Array(N);
  for (let i = 0; i < N; i++) { const k = rangeRaw[i]; if (k) { inRange[i] = 1; inRangeF[i] = 1; rangeH[i] = MOUNTAIN_RANGES[k - 1]?.h ?? 0.5; } }
  const mIn = distanceTransform(inRange, W, H, 200);
  const mr = Math.max(2, Math.round(6 * scale));
  const mSoft = blur3(inRangeF, W, H, mr), hSoft = blur3(rangeH, W, H, mr);
  const riverV = blur3(riverF, W, H, Math.max(1, Math.round(3 * scale)));
  const swamp = blur3(swampF, W, H, Math.max(1, Math.round(3 * scale)));
  const steppe = blur3(steppeF, W, H, Math.max(1, Math.round(6 * scale)));

  // ---------- 4. Height ----------
  progress(0.3, 'Lifting the mountains');
  const height = new Float32Array(N);
  for (let y = 0; y < H; y++) {
    const wy = y * inv;
    for (let x = 0; x < W; x++) {
      const i = y * W + x, wx = x * inv;
      if (!land[i]) { height[i] = -Math.min(distWater[i] * inv, 90) / 90; continue; }
      const coast = Math.min(distLand[i] * inv, 30) / 30;
      const hl = hilly[i];
      const n1 = fbm(wx * 0.006, wy * 0.006, 4), n2 = fbm(wx * 0.022 + 7, wy * 0.022, 4);
      let h = 0.012 + coast * 0.03 + (0.5 + 0.5 * n1) * 0.1 * (0.25 + hl) * (0.3 + 0.7 * coast) + Math.abs(n2) * 0.05 * (0.3 + hl);
      // mountains: a soft, noise-frayed edge (never the polygon's straight line), massifs split by valleys and passes,
      // and ridged, jagged cores that rise higher the deeper into the range
      let rh = 0;
      if (mSoft[i] > 0.01) {
        const m = clamp(mSoft[i] + fbm(wx * 0.03 + 11, wy * 0.03, 3) * 0.45, 0, 1);
        const shape = smooth(0.22, 0.95, m);
        if (shape > 0) {
          const hr = hSoft[i] / Math.max(0.05, mSoft[i]);
          const massif = 0.4 + 0.6 * smooth(-0.35, 0.35, fbm(wx * 0.011 + 5, wy * 0.011, 3));
          const core = smooth(0, 40, mIn[i] * inv);
          const warpx = fbm(wx * 0.01 + 3, wy * 0.01, 3) * 18, warpy = fbm(wx * 0.01, wy * 0.01 + 9, 3) * 18;
          const r = ridged((wx + warpx) * 0.028, (wy + warpy) * 0.028, 6);
          rh = hr * shape;
          h += hr * shape * massif * (0.5 + 0.5 * core) * (0.22 + 1.1 * r);
        }
      }
      // dunes in the deep desert
      if (arid[i] > 0.6 && rh === 0) h += (Math.sin(wx * 0.9 + fbm(wx * 0.03, wy * 0.03, 2) * 6) * 0.5 + 0.5) * 0.012 * (arid[i] - 0.6);
      // river valleys and marshes lie low
      h -= riverV[i] * 0.04 * (1 - smooth(0.3, 0.8, h));
      h = lerp(h, 0.014 + Math.abs(n2) * 0.01, clamp(swamp[i] * 1.2, 0, 1));
      // the land slopes down to every shore and lake bank instead of standing in walls
      height[i] = h * lerp(0.25, 1, smooth(0, 7, distLand[i] * inv));
    }
  }
  // Special peaks: the Giant's Lance, Dragonmont…
  for (const f of features) {
    const R = f.r * scale, x0 = Math.max(0, Math.floor(f.x * scale - R)), x1 = Math.min(W - 1, Math.ceil(f.x * scale + R)), y0 = Math.max(0, Math.floor(f.y * scale - R)), y1 = Math.min(H - 1, Math.ceil(f.y * scale + R));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * W + x; if (!land[i]) continue;
      const d = Math.hypot(x - f.x * scale, y - f.y * scale) / R; if (d >= 1) continue;
      const cone = Math.pow(1 - d, 1.6) * f.h * (0.85 + 0.3 * ridged(x * inv * 0.08, y * inv * 0.08, 3));
      const crater = f.type === 'volcano' ? Math.max(0, 0.18 - d) * f.h * 2.2 : 0;
      height[i] = Math.max(height[i], height[i] * 0.4 + cone - crater);
    }
  }
  // Rivers run just above the sea
  for (let i = 0; i < N; i++) if (land[i] && riverF[i] > 0.45) height[i] = Math.min(height[i], 0.006);

  // ---------- 5. Normals (object space, from the full-resolution heights) ----------
  progress(0.5, 'Carving valleys');
  const normal = new Uint8Array(N * 4);
  const hs = heightScale, k2 = scale / 2;
  const hv = (i) => (height[i] > 0 ? height[i] * hs : height[i] * 7);
  const slope = new Float32Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const dx = (hv(x < W - 1 ? i + 1 : i) - hv(x > 0 ? i - 1 : i)) * k2, dz = (hv(y < H - 1 ? i + W : i) - hv(y > 0 ? i - W : i)) * k2;
    const l = Math.hypot(dx, 1, dz); const nx = -dx / l, ny = 1 / l, nz = -dz / l;
    const o = i * 4; normal[o] = (nx * 0.5 + 0.5) * 255; normal[o + 1] = (ny * 0.5 + 0.5) * 255; normal[o + 2] = (nz * 0.5 + 0.5) * 255; normal[o + 3] = 255;
    slope[i] = Math.sqrt(dx * dx + dz * dz);
  }
  const hBlur = boxBlur(height, W, H, Math.max(2, Math.round(4 * scale)));

  // ---------- 6. Colour ----------
  progress(0.6, 'Painting the realm');
  const C = {
    deep: [18, 40, 60], mid: [30, 66, 90], shallow: [58, 108, 124], foam: [150, 178, 180], lake: [52, 98, 116], river: [58, 102, 124],
    grass: [98, 128, 60], lush: [82, 124, 48], meadow: [128, 144, 70], northGrass: [118, 124, 86], heather: [112, 94, 92], tundra: [146, 148, 128],
    snow: [236, 240, 246], snowShade: [196, 208, 226], ice: [210, 226, 236],
    fieldGold: [196, 170, 92], fieldGreen: [120, 148, 60], fieldBrown: [148, 118, 76], fieldPale: [176, 168, 110],
    dry: [172, 156, 98], sand: [220, 192, 140], redSand: [200, 138, 90], redRock: [152, 88, 64],
    rock: [120, 112, 104], rockLight: [164, 156, 146], cliff: [84, 78, 74],
    marsh: [80, 96, 60], marshWater: [66, 92, 90], beach: [214, 200, 158],
    forest: [46, 74, 38], pine: [38, 60, 44], snowyPine: [150, 166, 168], steppe: [168, 160, 96], road: [150, 124, 88],
  };
  const rgba = new Uint8ClampedArray(N * 4);
  const forest = new Uint8Array(N);
  const depth = new Uint8Array(N);
  let col = [0, 0, 0];
  const mix = (c, t) => { if (t <= 0) return; if (t > 1) t = 1; col[0] += (c[0] - col[0]) * t; col[1] += (c[1] - col[1]) * t; col[2] += (c[2] - col[2]) * t; };
  const set = (c) => { col[0] = c[0]; col[1] = c[1]; col[2] = c[2]; };
  const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  for (let y = 0; y < H; y++) {
    const wy = y * inv;
    const frozen = smooth(700, 420, wy);    // beyond the Wall: snow
    const cold = smooth(1250, 560, wy);     // the North
    const warm = smooth(1500, 2250, wy);    // the south
    for (let x = 0; x < W; x++) {
      const i = y * W + x, wx = x * inv;
      const grain = noise(wx * 1.3, wy * 1.3) * 0.05 + noise(wx * 0.3, wy * 0.3) * 0.04;
      if (!land[i]) {
        depth[i] = Math.min(255, Math.round(distWater[i] * inv * 4));
        const d = Math.min(distWater[i] * inv, 60) / 60;
        if (lakeM[i] > 128 && d < 0.3) { set(C.shallow); mix(C.lake, d * 5); }
        else { set(C.shallow); mix(C.mid, d / 0.12); if (d > 0.12) mix(C.deep, (d - 0.12) / 0.6); }
        mix(C.ice, frozen * 0.55 * (0.8 + 0.4 * fbm(wx * 0.02, wy * 0.02, 3)));
        const g = 1 + grain * 0.4;
        rgba[i * 4] = col[0] * g; rgba[i * 4 + 1] = col[1] * g; rgba[i * 4 + 2] = col[2] * g; rgba[i * 4 + 3] = 255;
        continue;
      }
      const h = height[i], sl = slope[i], ar = arid[i], fe = fertile[i];
      const n1 = fbm(wx * 0.012, wy * 0.012, 4), n3 = fbm(wx * 0.05 + 21, wy * 0.05, 3);
      // grassland by latitude, dryness and fertility
      set(C.grass); mix(C.meadow, 0.35 + 0.35 * n1); mix(C.lush, clamp(fe * 0.6 + n3 * 0.3, 0, 1) * (1 - cold));
      mix(C.northGrass, cold); mix(C.heather, cold * clamp(0.5 + n3 * 1.4, 0, 1) * 0.55 * (1 - frozen)); mix(C.tundra, clamp(frozen * 1.4 + cold * 0.15, 0, 1));
      mix(C.dry, clamp(ar * 1.2 - 0.1 + n1 * 0.3, 0, 1) * 0.8); mix(C.steppe, steppe[i] * 0.7);
      const desert = clamp((ar - 0.55) * 2.5 + n1 * 0.4, 0, 1);
      mix(C.sand, desert); mix(C.redSand, desert * clamp(0.3 + n3, 0, 1) * 0.6);
      // farmland patchwork in the fertile lowlands
      const farm = fe * (1 - cold * 0.85) * (1 - desert) * (1 - smooth(0.12, 0.25, h)) * (1 - forestF[i]) * clamp(0.8 + n1, 0, 1);
      if (farm > 0.25) {
        const cs = 5.5, cx = Math.floor(wx / cs), cy = Math.floor(wy / cs); let best = 1e9, id = 0;
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) { const px = (cx + ox + hash(cx + ox, cy + oy)) * cs, py = (cy + oy + hash(cy + oy, cx + ox + 77)) * cs; const dd = (px - wx) ** 2 + (py - wy) ** 2; if (dd < best) { best = dd; id = hash(cx + ox + 311, cy + oy + 97); } }
        const crop = id < 0.3 ? C.fieldGold : id < 0.55 ? C.fieldGreen : id < 0.75 ? C.fieldPale : id < 0.88 ? C.fieldBrown : C.lush;
        mix(crop, clamp((farm - 0.25) * 1.6, 0, 0.62));
      }
      // marsh
      if (swamp[i] > 0.2) { mix(C.marsh, clamp((swamp[i] - 0.2) * 2, 0, 1)); if (noise(wx * 0.45, wy * 0.45) > 0.35 && swamp[i] > 0.5) mix(C.marshWater, 0.6); }
      // forest floor (the trees themselves are models)
      const scattered = clamp(fbm(wx * 0.014 + 77, wy * 0.014, 4) - 0.18, 0, 1) * 1.6 * (1 - ar) * (1 - fe * 0.7) * (1 - frozen * 0.4);
      const fv = forestF[i] * (0.85 + 0.3 * n3) + scattered;
      if (fv > 0.4 && h < 0.55) {
        const t = clamp((fv - 0.4) * 3, 0, 1);
        mix(cold > 0.4 ? C.pine : C.forest, t * 0.85); mix(C.snowyPine, t * frozen * 0.6);
        forest[i] = Math.round(t * 255);
      }
      // rock on steep slopes and high ground; red rock in Dorne
      const rockT = clamp(smooth(0.22, 0.55, h) + smooth(0.8, 1.9, sl) * 0.75, 0, 1);
      if (rockT > 0) { const rc = [lerp(C.rock[0], C.redRock[0], ar), lerp(C.rock[1], C.redRock[1], ar), lerp(C.rock[2], C.redRock[2], ar)]; mix(rc, rockT); mix(C.rockLight, rockT * smooth(0.4, 0.9, h) * 0.6); mix(C.cliff, smooth(1.4, 2.6, sl) * 0.5); }
      // snow: a snow line that falls toward the north, plus the white lands beyond the Wall
      const snowLine = lerp(1.05, 0.58, clamp(cold, 0, 1)) - frozen * 0.3 + noise(wx * 0.08, wy * 0.08) * 0.07;
      const snowT = smooth(snowLine, snowLine + 0.1, h) * (1 - smooth(1.2, 2.2, sl) * 0.5);
      mix(C.snow, snowT); mix(C.snow, frozen * clamp(0.75 + 0.35 * n3, 0, 1) * (1 - forest[i] / 400));
      if (frozen > 0.1) mix(C.snowShade, frozen * clamp(-n1, 0, 0.4));
      // beaches in the warm south
      if (distLand[i] * inv < 2.5 && h < 0.08) mix(C.beach, 0.55 * (0.25 + warm * 0.75) * (1 - frozen));
      // rivers and roads
      if (riverF[i] > 0.2) mix(C.river, clamp(riverF[i] * 1.4, 0, 1) * (1 - frozen * 0.5));
      if (roadF[i] > 0.15 && riverF[i] < 0.3) mix(C.road, roadF[i] * 0.55 * (1 - frozen * 0.7));
      // valleys darker, ridges lighter (baked cavity) + fine grain
      const cav = clamp((height[i] - hBlur[i]) * 9, -0.25, 0.18);
      const g = (1 + grain) * (1 + cav);
      rgba[i * 4] = col[0] * g; rgba[i * 4 + 1] = col[1] * g; rgba[i * 4 + 2] = col[2] * g; rgba[i * 4 + 3] = 255;
    }
  }

  // ---------- 7. Provinces: nearest holding, within its own kingdom where possible ----------
  progress(0.82, 'Drawing the borders');
  const comp = new Int32Array(N).fill(-1); let nComp = 0; const stack = new Int32Array(N);
  for (let i = 0; i < N; i++) {
    if (!land[i] || comp[i] >= 0) continue;
    let sp = 0; stack[sp++] = i; comp[i] = nComp;
    while (sp) {
      const j = stack[--sp]; const x = j % W, y = (j / W) | 0;
      if (x > 0 && land[j - 1] && comp[j - 1] < 0) { comp[j - 1] = nComp; stack[sp++] = j - 1; }
      if (x < W - 1 && land[j + 1] && comp[j + 1] < 0) { comp[j + 1] = nComp; stack[sp++] = j + 1; }
      if (y > 0 && land[j - W] && comp[j - W] < 0) { comp[j - W] = nComp; stack[sp++] = j - W; }
      if (y < H - 1 && land[j + W] && comp[j + W] < 0) { comp[j + W] = nComp; stack[sp++] = j + W; }
    }
    nComp++;
  }
  const seedInfo = seeds.map((s) => {
    const cx = Math.round(s.x * scale), cy = Math.round(s.y * scale);
    for (let r = 0; r < 30 * scale; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = cx + dx, y = cy + dy; if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const j = y * W + x; if (land[j]) return { comp: comp[j], region: regionRaw[j] };
    }
    return { comp: -1, region: 0 };
  });
  const byComp = new Map(), byCompRegion = new Map();
  seeds.forEach((s, k) => {
    const { comp: c, region } = seedInfo[k]; if (c < 0) return;
    if (!byComp.has(c)) byComp.set(c, []); byComp.get(c).push(k);
    const key = c * 16 + region; if (!byCompRegion.has(key)) byCompRegion.set(key, []); byCompRegion.get(key).push(k);
  });
  const province = new Int16Array(N).fill(-1);
  const sx = Float32Array.from(seeds, (s) => s.x), sy = Float32Array.from(seeds, (s) => s.y), sw = Float32Array.from(seeds, (s) => s.w || 1);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; if (!land[i]) continue;
    const list = byCompRegion.get(comp[i] * 16 + regionRaw[i]) || byComp.get(comp[i]); if (!list) continue;
    const wx = x * inv + fbm(x * inv * 0.02, y * inv * 0.02, 3) * 14, wy = y * inv + fbm(x * inv * 0.02 + 31, y * inv * 0.02 + 17, 3) * 14;
    let best = -1, bd = Infinity;
    for (let n = 0; n < list.length; n++) { const k = list[n]; const dx = wx - sx[k], dy = wy - sy[k]; const d = (dx * dx + dy * dy) / sw[k]; if (d < bd) { bd = d; best = k; } }
    province[i] = best;
  }

  progress(1, 'Done');
  return { W, H, scale, rgba, normal, province, land, height, forest, depth };
}
