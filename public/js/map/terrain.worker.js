// Procedural terrain + province generation. Runs in a module Web Worker.
// Produces: RGBA terrain image, land mask, and a province-id map (nearest holding per land pixel).
import { WORLD, LANDMASSES, ISLANDS, LAKES, LAKE_ISLANDS, MOUNTAINS, BIOMES } from '../../data/geography.js';
import { makeNoise } from './noise.js';

self.onmessage = (e) => {
  const { scale = 1, seeds = [], seed = 298 } = e.data;
  const t0 = performance.now();
  const out = generate(scale, seeds, seed, (p, msg) => self.postMessage({ type: 'progress', p, msg }));
  out.ms = Math.round(performance.now() - t0);
  self.postMessage({ type: 'done', ...out }, [out.rgba.buffer, out.province.buffer, out.land.buffer, out.height.buffer]);
};

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const mix3 = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];

function smoothPath(ctx, pts, s) {
  // Closed Catmull-Rom spline through control points
  const n = pts.length;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    if (i === 0) ctx.moveTo(p1[0] * s, p1[1] * s);
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    ctx.bezierCurveTo(c1x * s, c1y * s, c2x * s, c2y * s, p2[0] * s, p2[1] * s);
  }
  ctx.closePath();
}

function ellipse(ctx, [x, y, rx, ry, rot], s) {
  ctx.beginPath();
  ctx.ellipse(x * s, y * s, rx * s, ry * s, rot || 0, 0, Math.PI * 2);
  ctx.fill();
}

function boxBlur(src, W, H, r) {
  const tmp = new Float32Array(W * H), dst = new Float32Array(W * H);
  const inv = 1 / (2 * r + 1);
  for (let y = 0; y < H; y++) {
    let acc = 0; const row = y * W;
    for (let x = -r; x <= r; x++) acc += src[row + Math.min(W - 1, Math.max(0, x))];
    for (let x = 0; x < W; x++) {
      tmp[row + x] = acc * inv;
      acc += src[row + Math.min(W - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < W; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(H - 1, Math.max(0, y)) * W + x];
    for (let y = 0; y < H; y++) {
      dst[y * W + x] = acc * inv;
      acc += tmp[Math.min(H - 1, y + r + 1) * W + x] - tmp[Math.max(0, y - r) * W + x];
    }
  }
  return dst;
}

function distanceTransform(isFeature, W, H, cap = 255) {
  // Chamfer distance (in pixels) to nearest pixel where isFeature is false
  const d = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) d[i] = isFeature[i] ? cap : 0;
  const a = 1, b = 1.4142;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; if (d[i] === 0) continue;
    let v = d[i];
    if (x > 0) v = Math.min(v, d[i - 1] + a);
    if (y > 0) {
      v = Math.min(v, d[i - W] + a);
      if (x > 0) v = Math.min(v, d[i - W - 1] + b);
      if (x < W - 1) v = Math.min(v, d[i - W + 1] + b);
    }
    d[i] = v;
  }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
    const i = y * W + x; if (d[i] === 0) continue;
    let v = d[i];
    if (x < W - 1) v = Math.min(v, d[i + 1] + a);
    if (y < H - 1) {
      v = Math.min(v, d[i + W] + a);
      if (x < W - 1) v = Math.min(v, d[i + W + 1] + b);
      if (x > 0) v = Math.min(v, d[i + W - 1] + b);
    }
    d[i] = v;
  }
  return d;
}

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  const qx = ax + t * dx - px, qy = ay + t * dy - py;
  return Math.sqrt(qx * qx + qy * qy);
}

export function generate(scale, seeds, seed, progress = () => {}) {
  const W = Math.round(WORLD.w * scale), H = Math.round(WORLD.h * scale), N = W * H;
  const { fbm, ridged, noise } = makeNoise(seed);
  const inv = 1 / scale; // pixel -> world units

  // ---------- 1. Rasterise authored shapes ----------
  progress(0.05, 'Charting the coasts');
  const cv = new OffscreenCanvas(W, H);
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#fff';
  for (const lm of LANDMASSES) { smoothPath(ctx, lm.points, scale); ctx.fill(); }
  for (const is of ISLANDS) ellipse(ctx, is, scale);
  ctx.fillStyle = '#000';
  for (const lk of LAKES) ellipse(ctx, lk, scale);
  ctx.fillStyle = '#fff';
  for (const li of LAKE_ISLANDS) ellipse(ctx, li, scale);
  const img = ctx.getImageData(0, 0, W, H).data;
  const base = new Float32Array(N);
  for (let i = 0; i < N; i++) base[i] = img[i * 4] / 255;

  // lake mask (to colour lakes differently)
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#fff';
  for (const lk of LAKES) ellipse(ctx, [lk[0], lk[1], lk[2] + 6, lk[3] + 6, lk[4]], scale);
  const limg = ctx.getImageData(0, 0, W, H).data;

  const field = boxBlur(boxBlur(base, W, H, Math.max(1, Math.round(3 * scale))), W, H, Math.max(1, Math.round(3 * scale)));

  // ---------- 2. Fractal coastline ----------
  progress(0.15, 'Raising the land');
  const land = new Uint8Array(N);
  const sample = (fx, fy) => {
    const x = Math.max(0, Math.min(W - 1.001, fx)), y = Math.max(0, Math.min(H - 1.001, fy));
    const x0 = x | 0, y0 = y | 0, tx = x - x0, ty = y - y0, i = y0 * W + x0;
    return lerp(lerp(field[i], field[i + 1], tx), lerp(field[i + W], field[i + W + 1], tx), ty);
  };
  for (let y = 0; y < H; y++) {
    const wy = y * inv;
    for (let x = 0; x < W; x++) {
      const wx = x * inv;
      const ox = fbm(wx * 0.012, wy * 0.012, 4) * 12 * scale;
      const oy = fbm(wx * 0.012 + 40, wy * 0.012 + 40, 4) * 12 * scale;
      const v = sample(x + ox, y + oy) + fbm(wx * 0.05, wy * 0.05, 4) * 0.2 + fbm(wx * 0.16, wy * 0.16, 3) * 0.12;
      land[y * W + x] = v > 0.5 ? 1 : 0;
    }
  }
  // remove specks
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    const s = land[i - 1] + land[i + 1] + land[i - W] + land[i + W];
    if (land[i] && s === 0) land[i] = 0; else if (!land[i] && s === 4) land[i] = 1;
  }

  progress(0.25, 'Measuring the seas');
  const distLand = distanceTransform(land, W, H, 400); // inside land: distance to water
  const water = new Uint8Array(N); for (let i = 0; i < N; i++) water[i] = land[i] ? 0 : 1;
  const distWater = distanceTransform(water, W, H, 400); // inside water: distance to land

  // ---------- 3. Mountains & biome fields ----------
  progress(0.35, 'Lifting the mountains');
  const mount = new Float32Array(N);
  for (const r of MOUNTAINS) {
    for (let k = 0; k < r.pts.length - 1; k++) {
      const [ax, ay] = r.pts[k], [bx, by] = r.pts[k + 1];
      const pad = r.w * 1.3;
      const x0 = Math.max(0, Math.floor((Math.min(ax, bx) - pad) * scale)), x1 = Math.min(W - 1, Math.ceil((Math.max(ax, bx) + pad) * scale));
      const y0 = Math.max(0, Math.floor((Math.min(ay, by) - pad) * scale)), y1 = Math.min(H - 1, Math.ceil((Math.max(ay, by) + pad) * scale));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const wx = x * inv, wy = y * inv;
        const jx = wx + noise(wx * 0.03, wy * 0.03) * r.w * 0.5, jy = wy + noise(wx * 0.03 + 9, wy * 0.03 + 9) * r.w * 0.5;
        const d = segDist(jx, jy, ax, ay, bx, by) / r.w;
        if (d < 1) { const v = r.s * (1 - d) * (1 - d) * (3 - 2 * (1 - d)) ; const i = y * W + x; if (v > mount[i]) mount[i] = v; }
      }
    }
  }
  const biome = {};
  for (const [type, brushes] of Object.entries(BIOMES)) {
    const f = new Float32Array(N);
    for (const [bx, by, rx, ry, s] of brushes) {
      const x0 = Math.max(0, Math.floor((bx - rx * 1.6) * scale)), x1 = Math.min(W - 1, Math.ceil((bx + rx * 1.6) * scale));
      const y0 = Math.max(0, Math.floor((by - ry * 1.6) * scale)), y1 = Math.min(H - 1, Math.ceil((by + ry * 1.6) * scale));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const dx = (x * inv - bx) / rx, dy = (y * inv - by) / ry;
        const r = Math.sqrt(dx * dx + dy * dy);
        const v = s * smooth(1.35, 0.35, r);
        const i = y * W + x; if (v > f[i]) f[i] = v;
      }
    }
    biome[type] = f;
  }

  // ---------- 4. Height ----------
  progress(0.5, 'Carving valleys');
  const height = new Float32Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, wx = x * inv, wy = y * inv;
    if (land[i]) {
      const coast = Math.min(distLand[i] * inv, 50) / 50;
      const hills = Math.max(0, fbm(wx * 0.008, wy * 0.008, 3) + 0.15) * 0.3 + Math.abs(fbm(wx * 0.03, wy * 0.03, 3)) * 0.05;
      const detail = fbm(wx * 0.05, wy * 0.05, 4) * 0.035;
      const m = mount[i] * (0.65 + 0.5 * fbm(wx * 0.02 + 5, wy * 0.02, 3));
      const rid = m > 0.02 ? m * (0.35 + 1.1 * ridged(wx * 0.03, wy * 0.03, 5)) : 0;
      height[i] = 0.03 + coast * 0.07 + hills * (0.4 + 0.6 * coast) + detail + rid * 0.9 - biome.marsh[i] * 0.05;
    } else {
      height[i] = -Math.min(distWater[i] * inv, 120) / 120;
    }
  }

  // ---------- 5. Colour ----------
  progress(0.65, 'Painting the realm');
  const C = {
    deep: [20, 44, 66], mid: [32, 70, 96], shallow: [62, 110, 128], foam: [132, 166, 170], lake: [58, 104, 122],
    grass: [122, 138, 80], lush: [100, 136, 62], tundra: [132, 136, 114], snow: [232, 236, 240], forest: [50, 80, 46],
    pine: [44, 66, 52], marsh: [92, 104, 68], desert: [214, 186, 128], dry: [178, 158, 104], rock: [122, 112, 100],
    high: [168, 160, 150], beach: [200, 186, 146], steppe: [160, 152, 96],
  };
  const rgba = new Uint8ClampedArray(N * 4);
  const lx = -0.6, ly = -0.8;
  for (let y = 0; y < H; y++) {
    const wy = y * inv;
    const cold = smooth(760, 260, wy);       // 1 = far north
    const frozen = smooth(360, 60, wy);     // beyond the Wall
    const south = smooth(1600, 1900, wy);
    for (let x = 0; x < W; x++) {
      const i = y * W + x, wx = x * inv;
      let col;
      const grain = noise(wx * 0.9, wy * 0.9) * 0.035 + noise(wx * 0.25, wy * 0.25) * 0.03;
      if (!land[i]) {
        const isLake = limg[i * 4] > 128;
        const d = Math.min(distWater[i] * inv, 60) / 60;
        if (isLake) col = mix3(C.shallow, C.lake, Math.min(1, d * 4));
        else {
          col = d < 0.12 ? mix3(C.shallow, C.mid, d / 0.12) : mix3(C.mid, C.deep, Math.min(1, (d - 0.12) / 0.6));
          const nn = fbm(wx * 0.01, wy * 0.01, 3) * 0.06;
          col = [col[0] * (1 + nn), col[1] * (1 + nn), col[2] * (1 + nn)];
          col = mix3(col, [120, 146, 164], frozen * 0.5);
        }
        const foam = distWater[i] * inv < 1.6 ? 0.55 : distWater[i] * inv < 3.5 ? 0.18 : 0;
        if (foam) col = mix3(col, C.foam, foam);
        // subtle wave texture
        const wv = Math.sin(wx * 0.45 + noise(wx * 0.02, wy * 0.02) * 6) * 0.015;
        col = [col[0] * (1 + wv + grain * 0.5), col[1] * (1 + wv + grain * 0.5), col[2] * (1 + wv + grain * 0.5)];
      } else {
        const h = height[i];
        const n1 = fbm(wx * 0.015, wy * 0.015, 4);
        const n2 = fbm(wx * 0.004 + 11, wy * 0.004, 3);
        // base grassland by latitude with broad tonal variation
        col = mix3(C.grass, C.tundra, cold);
        col = mix3(col, C.lush, Math.min(1, biome.lush[i] * 0.9 + Math.max(0, n2) * 0.5) * (1 - cold));
        col = mix3(col, C.steppe, Math.max(0, n1) * 0.4 * (1 - cold) * (1 - biome.lush[i]));
        col = mix3(col, C.dry, Math.min(1, biome.dry[i]));
        const des = Math.min(1, biome.desert[i] * 1.3 + n1 * 0.25);
        if (des > 0) col = mix3(col, C.desert, Math.max(0, Math.min(1, des)));
        // farmland patchwork in fertile lowlands
        const farm = (1 - cold) * (1 - des) * Math.max(0, biome.lush[i] - 0.2);
        if (farm > 0) { const cell = noise(Math.floor(wx / 3) * 1.7, Math.floor(wy / 3) * 1.3); col = mix3(col, cell > 0 ? [150, 150, 86] : [96, 128, 60], farm * 0.25 * Math.abs(cell)); }
        // marsh
        const ms = biome.marsh[i] + fbm(wx * 0.05, wy * 0.05, 3) * 0.3;
        if (ms > 0.35) {
          col = mix3(col, C.marsh, Math.min(1, (ms - 0.35) * 2.5));
          if (noise(wx * 0.4, wy * 0.4) > 0.4) col = mix3(col, C.lake, 0.55);
        }
        // snow cover in the far north, tundra frost
        const fdetail = fbm(wx * 0.05, wy * 0.05, 4);
        col = mix3(col, C.snow, Math.min(1, frozen * (0.8 + 0.2 * fdetail)));
        col = mix3(col, [190, 196, 196], cold * 0.22 * (1 - frozen));
        // forests: authored + scattered woods
        const scattered = Math.max(0, fbm(wx * 0.012 + 77, wy * 0.012, 4) - 0.12) * 1.5 * (1 - biome.desert[i]) * (1 - biome.dry[i] * 0.7) * (1 - frozen * 0.6);
        const fv = biome.forest[i] * 1.05 + scattered + fdetail * 0.3;
        if (fv > 0.45 && mount[i] < 0.7) {
          const t = Math.min(1, (fv - 0.45) * 3);
          let fc = mix3(C.forest, C.pine, cold);
          fc = mix3(fc, [150, 164, 160], frozen * 0.45);
          const tn = noise(wx * 0.8, wy * 0.8), tn2 = noise(wx * 1.9 + 3, wy * 1.9);
          const canopy = 0.78 + 0.28 * tn + 0.14 * tn2;
          col = mix3(col, [fc[0] * canopy, fc[1] * canopy, fc[2] * canopy], t * 0.95);
        }
        // mountains
        const rockT = smooth(0.2, 0.5, h);
        if (rockT > 0) col = mix3(col, mix3(C.rock, C.high, smooth(0.45, 0.85, h)), rockT);
        const snowLine = lerp(0.8, 0.38, cold);
        const snowT = smooth(snowLine, snowLine + 0.1, h + noise(wx * 0.1, wy * 0.1) * 0.06);
        if (snowT > 0) col = mix3(col, C.snow, snowT);
        // beaches in the warm south
        const dl = distLand[i] * inv;
        if (dl < 2.2 && h < 0.2) col = mix3(col, C.beach, 0.5 * (0.2 + south * 0.8) * (1 - frozen));
        // hillshade
        const hl = height[i - 1] ?? h, hr = height[i + 1] ?? h, hu = height[i - W] ?? h, hd = height[i + W] ?? h;
        const sx = (hl - hr) * scale, sy = (hu - hd) * scale;
        let shade = 1 + (sx * -lx + sy * -ly) * 14;
        shade = Math.max(0.55, Math.min(1.45, shade));
        const g = 1 + grain;
        col = [col[0] * shade * g, col[1] * shade * g, col[2] * shade * g];
        // dark coastline edge
        if (dl < 1.3) col = [col[0] * 0.62, col[1] * 0.62, col[2] * 0.66];
      }
      const o = i * 4;
      rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 255;
    }
  }

  // ---------- 6. Provinces ----------
  progress(0.85, 'Drawing the borders');
  const comp = new Int32Array(N).fill(-1);
  let nComp = 0;
  const stack = new Int32Array(N);
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
  // Snap seeds onto land and find their component
  const seedComp = seeds.map((s) => {
    const cx = Math.round(s.x * scale), cy = Math.round(s.y * scale);
    for (let r = 0; r < 30 * scale; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = cx + dx, y = cy + dy; if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const j = y * W + x; if (land[j]) return comp[j];
      }
    }
    return -1;
  });
  const byComp = new Map();
  seeds.forEach((s, k) => { const c = seedComp[k]; if (c < 0) return; if (!byComp.has(c)) byComp.set(c, []); byComp.get(c).push(k); });
  const WALL_Y = 340;
  const province = new Int16Array(N).fill(-1);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; if (!land[i]) continue;
    const list = byComp.get(comp[i]); if (!list) continue;
    const wx = x * inv + fbm(x * inv * 0.02, y * inv * 0.02, 3) * 16;
    const wy = y * inv + fbm(x * inv * 0.02 + 31, y * inv * 0.02 + 17, 3) * 16;
    const north = y * inv < WALL_Y;
    let best = -1, bd = Infinity;
    for (const k of list) {
      const s = seeds[k];
      if (s.x < 900 && ((s.y < WALL_Y) !== north)) continue;
      const dx = wx - s.x, dy = wy - s.y;
      const d = (dx * dx + dy * dy) / (s.w || 1);
      if (d < bd) { bd = d; best = k; }
    }
    if (best < 0) for (const k of list) { const s = seeds[k]; const dx = wx - s.x, dy = wy - s.y; const d = dx * dx + dy * dy; if (d < bd) { bd = d; best = k; } }
    province[i] = best;
  }

  progress(1, 'Done');
  return { W, H, scale, rgba, province, land, height: new Float32Array(height) };
}
