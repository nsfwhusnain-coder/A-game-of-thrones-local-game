// Paints the maester's desk (GDD 21 §4): the tiling textures that theme.css lays under vellum, oak, leather and iron,
// and the deckled 9-slice edge of a parchment page, into public/img/ui/.   node scripts/paint-ui.js
//
// Dev tool only (Playwright is never a runtime dependency). Chromium is used as the canvas and the JPEG/PNG encoder, as
// scripts/mockup-assets.js does for portraits. Everything is DETERMINISTIC: fixed seeds, an integer hash instead of
// Math.random, noise that wraps so every tile is seamless — two runs write the same bytes (check with sha256sum).
// ornaments.svg is hand-drawn and lives beside these files; it is not generated.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'img', 'ui');
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require(path.join(execSync('npm root -g').toString().trim(), 'playwright')); }

// Runs inside the page. Returns { file: dataURL }.
function paint() {
  // ── noise: integer-hash gradient noise on a lattice that wraps, so a tile of any size is seamless ──
  const H = (x, y, s) => { let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul((s | 0) + 1, 1442695041); h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const gr = (ix, iy, s, dx, dy) => { const a = H(ix, iy, s) * 6.283185307; return Math.cos(a) * dx + Math.sin(a) * dy; };
  const perlin = (u, v, px, py, s) => {
    const x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0;
    const X0 = ((x0 % px) + px) % px, X1 = (X0 + 1) % px, Y0 = ((y0 % py) + py) % py, Y1 = (Y0 + 1) % py;
    const a = gr(X0, Y0, s, fx, fy), b = gr(X1, Y0, s, fx - 1, fy), c = gr(X0, Y1, s, fx, fy - 1), d = gr(X1, Y1, s, fx - 1, fy - 1);
    const sx = fade(fx), sy = fade(fy);
    return Math.max(0, Math.min(1, (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy) * 0.85 + 0.5));
  };
  // fractal noise over a W×H tile: fx, fy = lattice cells across the tile at the first octave (integers, so it wraps)
  const fbm = (x, y, W, Ht, fx, fy, oct, s, gain = 0.5) => {
    let sum = 0, amp = 1, tot = 0;
    for (let o = 0; o < oct; o++) { const px = fx * (1 << o), py = fy * (1 << o); sum += amp * perlin((x / W) * px, (y / Ht) * py, px, py, s + o * 31); tot += amp; amp *= gain; }
    return sum / tot;
  };
  const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const clamp255 = (v) => Math.max(0, Math.min(255, v));

  // pixels → data URL. shade(x, y) returns [r, g, b, a?]; `mean` (if given) shifts the tile so its average is exactly that colour
  const canvasOf = (W, Ht, shade, mean) => {
    const raw = new Float32Array(W * Ht * 4); const sum = [0, 0, 0];
    for (let y = 0; y < Ht; y++) for (let x = 0; x < W; x++) { const c = shade(x, y), i = (y * W + x) * 4; raw[i] = c[0]; raw[i + 1] = c[1]; raw[i + 2] = c[2]; raw[i + 3] = c[3] ?? 255; sum[0] += c[0]; sum[1] += c[1]; sum[2] += c[2]; }
    const sh = mean ? mean.map((m, k) => m - sum[k] / (W * Ht)) : [0, 0, 0];
    const cv = document.createElement('canvas'); cv.width = W; cv.height = Ht; const ctx = cv.getContext('2d'); const im = ctx.createImageData(W, Ht);
    for (let i = 0; i < W * Ht; i++) { im.data[i * 4] = clamp255(raw[i * 4] + sh[0]); im.data[i * 4 + 1] = clamp255(raw[i * 4 + 1] + sh[1]); im.data[i * 4 + 2] = clamp255(raw[i * 4 + 2] + sh[2]); im.data[i * 4 + 3] = raw[i * 4 + 3]; }
    ctx.putImageData(im, 0, 0); return cv;
  };
  // height field → light from the upper left (wraps at the tile's edge)
  const relief = (h, W, Ht, k) => { const out = new Float32Array(W * Ht); const g = (x, y) => h[((y + Ht) % Ht) * W + ((x + W) % W)]; for (let y = 0; y < Ht; y++) for (let x = 0; x < W; x++) out[y * W + x] = (g(x - 1, y - 1) - g(x + 1, y + 1)) * k; return out; };
  const fields = (W, Ht, fn) => { const f = new Float32Array(W * Ht); for (let y = 0; y < Ht; y++) for (let x = 0; x < W; x++) f[y * W + x] = fn(x, y); return f; };

  const res = {};

  // ── vellum: a smooth warm skin, cloudy where the hide was uneven, faint veining, a few follicle pores and a foxed patch or two ──
  {
    const N = 640;
    const cloud = fields(N, N, (x, y) => fbm(x, y, N, N, 3, 3, 4, 11));
    const cloud2 = fields(N, N, (x, y) => fbm(x, y, N, N, 9, 9, 3, 23));
    const vein = fields(N, N, (x, y) => { const f = fbm(x, y, N, N, 2, 2, 3, 31) * 9; const d = Math.abs(f - Math.round(f)); return 1 - smooth(0, 0.07, d); });
    const skin = fields(N, N, (x, y) => fbm(x, y, N, N, 320, 320, 1, 41));
    const lit = relief(skin, N, N, 5);
    const fox = fields(N, N, (x, y) => smooth(0.58, 0.76, fbm(x, y, N, N, 4, 4, 3, 53)) * 0.7 + smooth(0.66, 0.84, fbm(x, y, N, N, 13, 13, 2, 59)) * 0.35);
    const pores = fields(N, N, (x, y) => smooth(0.82, 0.94, fbm(x, y, N, N, 230, 230, 1, 67)));
    res['vellum.jpg'] = canvasOf(N, N, (x, y) => {
      const i = y * N + x; const t = (cloud[i] - 0.5) * 2, t2 = (cloud2[i] - 0.5) * 2;
      const d = t * 10 + t2 * 5 + (skin[i] - 0.5) * 5 + lit[i] * 3 - vein[i] * 6 * (0.4 + Math.abs(t));
      let r = 232 + d, g = 220 + d * 1.04, b = 192 + d * 1.3;
      const f = Math.min(0.2, fox[i] * 0.26); r += (150 - r) * f; g += (104 - g) * f; b += (52 - b) * f; // foxing: a brown that soaks in
      const p = pores[i] * 0.26; r -= p * 70; g -= p * 78; b -= p * 80;
      return [r, g, b];
    }, [232, 220, 192]);
  }

  // ── oak: long grain from contour lines of a warped field (growth rings), fine streaks and a few dark pores ──
  {
    const W = 640, Ht = 320;
    const warp = fields(W, Ht, (x, y) => fbm(x, y, W, Ht, 2, 4, 3, 5));
    const streak = fields(W, Ht, (x, y) => fbm(x, y, W, Ht, 3, 150, 2, 9));
    const cloud = fields(W, Ht, (x, y) => fbm(x, y, W, Ht, 2, 2, 3, 15));
    const pores = fields(W, Ht, (x, y) => smooth(0.74, 0.9, fbm(x, y, W, Ht, 70, 90, 1, 21)));
    const ring = fields(W, Ht, (x, y) => { const t = (y / Ht) * 15 + (warp[y * W + x] - 0.5) * 3.4; return Math.pow(Math.abs(Math.sin(Math.PI * t)), 0.45); });
    res['oak.jpg'] = canvasOf(W, Ht, (x, y) => {
      const i = y * W + x; const v = (ring[i] - 0.5) * 19 + (streak[i] - 0.5) * 17 + (cloud[i] - 0.5) * 12 - pores[i] * 8;
      return [27 + v, 20 + v * 0.78, 14 + v * 0.5];
    }, [29, 21, 15]);
  }

  // ── leather: a pebbled hide — cells with grooves between them, lit from the upper left ──
  {
    const N = 256, C = 34, cs = N / C;
    const pt = (cx, cy) => { const X = ((cx % C) + C) % C, Y = ((cy % C) + C) % C; return [cx * cs + (0.15 + 0.7 * H(X, Y, 71)) * cs, cy * cs + (0.15 + 0.7 * H(X, Y, 73)) * cs]; };
    const cell = fields(N, N, (x, y) => {
      const cx = Math.floor(x / cs), cy = Math.floor(y / cs); let f1 = 1e9, f2 = 1e9;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const p = pt(cx + i, cy + j); const d = Math.hypot(x - p[0], y - p[1]); if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d; }
      return smooth(0, cs * 0.55, f2 - f1);
    });
    const fine = fields(N, N, (x, y) => fbm(x, y, N, N, 64, 64, 2, 79));
    const lit = relief(cell, N, N, 9);
    res['leather.jpg'] = canvasOf(N, N, (x, y) => {
      const i = y * N + x; const v = (cell[i] - 0.6) * 9 + (fine[i] - 0.5) * 8 + lit[i];
      return [42 + v, 29 + v * 0.8, 19 + v * 0.55];
    }, [42, 29, 19]);
  }

  // ── iron: fine hammered speckle with a faint brush of the file ──
  {
    const N = 128;
    const sp = fields(N, N, (x, y) => fbm(x, y, N, N, 64, 64, 2, 83));
    const dim = fields(N, N, (x, y) => fbm(x, y, N, N, 6, 6, 3, 89));
    const br = fields(N, N, (x, y) => fbm(x, y, N, N, 2, 60, 2, 97));
    res['iron.jpg'] = canvasOf(N, N, (x, y) => { const i = y * N + x; const v = (sp[i] - 0.5) * 14 + (dim[i] - 0.5) * 9 + (br[i] - 0.5) * 8; return [43 + v, 42 + v, 40 + v * 0.95]; }, [43, 42, 40]);
  }

  // ── wax: a grey mottle laid over the house's colour with `overlay`, so a seal is not one flat fill. Mid-grey leaves the
  // colour as it is; the swirl and the fine bloom shift it a few per cent either way. ──
  {
    const N = 128;
    const swirl = fields(N, N, (x, y) => fbm(x, y, N, N, 3, 3, 3, 131));
    const bloom = fields(N, N, (x, y) => fbm(x, y, N, N, 22, 22, 2, 137));
    const lit = relief(bloom, N, N, 6);
    res['wax.jpg'] = canvasOf(N, N, (x, y) => { const i = y * N + x; const v = (swirl[i] - 0.5) * 70 + (bloom[i] - 0.5) * 34 + lit[i] * 12; return [128 + v, 128 + v, 128 + v]; }, [128, 128, 128]);
  }

  // ── vellum-edge: the deckled 9-slice for border-image (slice 28, so 14 CSS px at 2×). Each edge is periodic along its
  // length (period 192), so the edge tiles and the four corners continue it without a joint. ──
  {
    const S = 28, P = 192, W = S * 2 + P, M = 3.4;
    const edge = (seed) => {
      const ks = [2, 3, 5, 7, 11, 17, 26, 39, 57]; const ph = ks.map((k, i) => H(i, seed, 101) * 6.283), am = ks.map((k, i) => 1.9 / Math.pow(k, 0.62) * (0.55 + H(i, seed, 103)));
      const bumps = []; for (let i = 0; i < 9; i++) bumps.push([H(i, seed, 107) * P, 0.8 + H(i, seed, 109) * 2.2, 0.9 + H(i, seed, 113) * 2.6]); // fibrous nicks: [at, width, depth]
      return (t) => { let d = M; for (let i = 0; i < ks.length; i++) d += am[i] * (1 + Math.sin(2 * Math.PI * ks[i] * t / P + ph[i])); for (const [c, w, dp] of bumps) { let u = Math.abs(((t - c) % P + P * 1.5) % P - P / 2); if (u < w * 2) d += dp * (1 - u / (w * 2)); } return d; };
    };
    const eL = edge(1), eR = edge(2), eT = edge(3), eB = edge(4);
    const off = (t) => t - S; // image px → position along the edge (0 at the start of the straight run)
    const smin = (a, b, k) => -Math.log(Math.exp(-k * a) + Math.exp(-k * b)) / k;
    const tone = fields(W, W, (x, y) => fbm(x, y, W, W, 3, 3, 3, 121));
    const fine = fields(W, W, (x, y) => fbm(x, y, W, W, 60, 60, 2, 127));
    res['vellum-edge.png'] = canvasOf(W, W, (x, y) => {
      const inBand = x < S || x >= W - S || y < S || y >= W - S;
      if (!inBand) return [0, 0, 0, 0];
      const dl = x + 0.5 - eL(off(y)), dr = (W - x - 0.5) - eR(off(y)), dt = y + 0.5 - eT(off(x)), db = (W - y - 0.5) - eB(off(x));
      const e = smin(smin(dl, dr, 0.9), smin(dt, db, 0.9), 0.9);
      const a = Math.max(0, Math.min(1, e + 0.5)) * 255; if (a <= 0) return [0, 0, 0, 0];
      // aged toward the edge: a burnished brown, and a hair-fine darker line where the knife cut it
      const dark = 0.15 * Math.exp(-e / 5.5) + 0.05 * Math.exp(-e / 15) + 0.08 * Math.exp(-e * 1.4);
      const v = (tone[y * W + x] - 0.5) * 9 + (fine[y * W + x] - 0.5) * 8;
      const k = 1 - dark;
      return [(232 + v) * k, (220 + v * 1.04) * k * 0.985, (192 + v * 1.3) * k * 0.95, a]; // a grey-brown, not a scorched orange
    });
  }

  const out = {};
  for (const [name, cv] of Object.entries(res)) out[name] = name.endsWith('.png') ? cv.toDataURL('image/png') : cv.toDataURL('image/jpeg', name === 'vellum.jpg' ? 0.74 : 0.8);
  return out;
}

const browser = await pw.chromium.launch();
try {
  const page = await browser.newPage();
  const out = await page.evaluate(`(${paint.toString()})()`);
  fs.mkdirSync(OUT, { recursive: true });
  let total = 0;
  for (const [name, url] of Object.entries(out)) { const buf = Buffer.from(url.split(',')[1], 'base64'); fs.writeFileSync(path.join(OUT, name), buf); total += buf.length; console.log(`${name}\t${(buf.length / 1024).toFixed(1)} KB`); }
  const all = fs.readdirSync(OUT).reduce((n, f) => n + fs.statSync(path.join(OUT, f)).size, 0);
  console.log(`painted ${(total / 1024).toFixed(1)} KB; public/img/ui in all ${(all / 1024).toFixed(1)} KB`);
} finally { await browser.close(); }
