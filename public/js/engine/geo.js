// The shape of the world, for the engine: which cells are land and which are sea, which landmass a point stands on,
// and the shortest way by water between two shores. Rasterised once, lazily, from the atlas polygons the map is drawn
// from (data/geography.js), so the engine and the map agree about where the coast is.
//
// Why the engine needs it (docs/gdd/07-military.md §5 and §9, bug B-11): a host walked from Deepdown on Skagos to
// Winterfell over the Bay of Seals, and paid "the price of the Wall" on the way, because every march was a straight
// line. An island has no road to the mainland; a host on it takes ship or it waits. This module is deterministic and
// has no dependency on the browser: the server plans voyages with it, the client can draw the same routes.
import { WORLD, LAND, LAKES, MILES_PER_UNIT } from '../../data/geography.js';

export const CELL = 4;                       // world units per cell (~7.4 miles): fine enough to keep Tarth and the
const GW = Math.ceil(WORLD.w / CELL);        // Iron Islands apart from their neighbours, coarse enough to route fast
const GH = Math.ceil(WORLD.h / CELL);
const SEA = 0, LANDC = 1, LAKE = 2;

const inPoly = ([x, y], pts) => {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
const segDist = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
  return Math.hypot(ax + t * dx - px, ay + t * dy - py);
};
const bbox = (pts) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return [x0, y0, x1, y1];
};
const LAND_BOX = LAND.map((l) => bbox(l.pts));

// Scanline fill of a polygon's cells (a cell belongs to the polygon when its centre does). Returns the cells filled.
function fill(grid, pts, value) {
  const [, y0, , y1] = bbox(pts);
  const r0 = Math.max(0, Math.floor(y0 / CELL)), r1 = Math.min(GH - 1, Math.floor(y1 / CELL));
  const xs = []; const cells = [];
  for (let r = r0; r <= r1; r++) {
    const cy = (r + 0.5) * CELL; xs.length = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > cy) !== (yj > cy)) xs.push(xi + ((cy - yi) * (xj - xi)) / (yj - yi));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const c0 = Math.max(0, Math.ceil(xs[k] / CELL - 0.5)), c1 = Math.min(GW - 1, Math.floor(xs[k + 1] / CELL - 0.5));
      for (let c = c0; c <= c1; c++) { grid[r * GW + c] = value; cells.push(r * GW + c); }
    }
  }
  return cells;
}

/** The cells whose centres lie inside a polygon (terrain painted onto the raster: forests, bogs, mountains). */
export const polyCells = (pts) => fill(new Uint8Array(GW * GH), pts, 1);

let G = null; // { kind: Uint8Array, comp: Int32Array, polyComp: Int32Array, compName: [] }
function build() {
  const kind = new Uint8Array(GW * GH); // SEA everywhere to begin with
  const polyCells = LAND.map((l) => fill(kind, l.pts, LANDC));
  for (const l of LAKES) fill(kind, l.pts, LAKE);
  // islands in lakes (the Isle of Faces in the Gods Eye) are land again
  LAND.forEach((l, i) => { if (LAKES.some((k) => inPoly(l.pts[0], k.pts))) polyCells[i] = fill(kind, l.pts, LANDC); });
  // an islet smaller than a cell still exists: its middle cell is land
  LAND.forEach((l, i) => {
    if (polyCells[i].length) return;
    const [x0, y0, x1, y1] = LAND_BOX[i]; const g = cellOf([(x0 + x1) / 2, (y0 + y1) / 2]);
    if (g >= 0) { kind[g] = LANDC; polyCells[i] = [g]; }
  });
  // landmasses: 4-connected land cells (islands that only touch at a corner stay apart)
  const comp = new Int32Array(GW * GH).fill(-1); let n = 0; const stack = [];
  for (let g0 = 0; g0 < kind.length; g0++) {
    if (kind[g0] !== LANDC || comp[g0] >= 0) continue;
    comp[g0] = n; stack.push(g0);
    while (stack.length) {
      const g = stack.pop(); const x = g % GW, y = (g - x) / GW;
      for (const k of [x > 0 ? g - 1 : -1, x < GW - 1 ? g + 1 : -1, y > 0 ? g - GW : -1, y < GH - 1 ? g + GW : -1]) {
        if (k >= 0 && kind[k] === LANDC && comp[k] < 0) { comp[k] = n; stack.push(k); }
      }
    }
    n++;
  }
  // each atlas polygon belongs to the landmass most of its cells fell into
  const polyComp = new Int32Array(LAND.length).fill(-1);
  LAND.forEach((l, i) => {
    const count = new Map();
    for (const g of polyCells[i]) if (comp[g] >= 0) count.set(comp[g], (count.get(comp[g]) || 0) + 1);
    let best = -1, bn = 0; for (const [c, k] of count) if (k > bn) { bn = k; best = c; }
    polyComp[i] = best;
  });
  // a landmass is named after the largest named polygon in it (Westeros, Essos, Skagos, Bear Island, Pyke…)
  const compName = []; const compSize = [];
  LAND.forEach((l, i) => { const c = polyComp[i]; if (c < 0 || !l.name) return; if (!(compSize[c] >= l.pts.length)) { compSize[c] = l.pts.length; compName[c] = l.name; } });
  // the open sea: the largest body of connected water (a bay the raster closed off, or a lagoon, is not a sea lane)
  const water = new Int32Array(GW * GH).fill(-1); const sizes = []; let w = 0;
  for (let g0 = 0; g0 < kind.length; g0++) {
    if (kind[g0] !== SEA || water[g0] >= 0) continue;
    water[g0] = w; stack.push(g0); let size = 0;
    while (stack.length) {
      const g = stack.pop(); size++; const x = g % GW, y = (g - x) / GW;
      for (const k of [x > 0 ? g - 1 : -1, x < GW - 1 ? g + 1 : -1, y > 0 ? g - GW : -1, y < GH - 1 ? g + GW : -1]) {
        if (k >= 0 && kind[k] === SEA && water[k] < 0) { water[k] = w; stack.push(k); }
      }
    }
    sizes.push(size); w++;
  }
  const ocean = sizes.indexOf(Math.max(...sizes));
  for (let g = 0; g < kind.length; g++) if (kind[g] === SEA && water[g] !== ocean) kind[g] = LAKE;
  G = { kind, comp, polyComp, compName };
}
const grid = () => (G || build(), G);
/** The raster itself, for the land router (engine/movement.js): cell size, width, height, kind per cell, landmasses. */
export const raster = () => ({ CELL, GW, GH, kind: grid().kind, comp: grid().comp, SEA, LAND: LANDC, LAKE });

export function cellOf([x, y]) {
  const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
  return cx < 0 || cy < 0 || cx >= GW || cy >= GH ? -1 : cy * GW + cx;
}
export const centre = (g) => [((g % GW) + 0.5) * CELL, (Math.floor(g / GW) + 0.5) * CELL];

/**
 * The landmass a point stands on: an integer id shared by every point of the same island or continent, or -1 at sea.
 * A point just off the coast (a seat drawn on its shore, a port) belongs to the nearest land within `reach` units.
 */
const landmasses = new Map(); // a point asked again (a host standing at a castle) is answered from memory
export function landmassOf(p, reach = 6) {
  if (!p) return -1;
  const key = `${p[0]},${p[1]},${reach}`; if (landmasses.has(key)) return landmasses.get(key);
  const v = landmassOfPoint(p, reach);
  if (landmasses.size > 50000) landmasses.clear();
  landmasses.set(key, v); return v;
}
function landmassOfPoint(p, reach) {
  const { polyComp } = grid();
  for (let i = 0; i < LAND.length; i++) {
    const b = LAND_BOX[i]; if (p[0] < b[0] || p[0] > b[2] || p[1] < b[1] || p[1] > b[3]) continue;
    if (inPoly(p, LAND[i].pts) && !LAKES.some((k) => inPoly(p, k.pts) && !inPoly(LAND[i].pts[0], k.pts))) return polyComp[i];
  }
  let best = -1, bd = reach;
  for (let i = 0; i < LAND.length; i++) {
    const b = LAND_BOX[i]; if (p[0] < b[0] - bd || p[0] > b[2] + bd || p[1] < b[1] - bd || p[1] > b[3] + bd) continue;
    const pts = LAND[i].pts;
    for (let a = 0, z = pts.length - 1; a < pts.length; z = a++) {
      const d = segDist(p[0], p[1], pts[z][0], pts[z][1], pts[a][0], pts[a][1]);
      if (d < bd) { bd = d; best = polyComp[i]; }
    }
  }
  return best;
}
export const landmassName = (id) => grid().compName[id] || (id < 0 ? 'the sea' : `landmass ${id}`);
/** True when there is a way on foot from a to b (both on the same island or continent). */
export function sameLand(a, b) {
  const x = landmassOf(a), y = landmassOf(b);
  return x >= 0 && x === y;
}
/** Whether a grid cell is open sea (not land, not a lake). */
export const isSeaCell = (g) => g >= 0 && grid().kind[g] === SEA;

/** The nearest open-sea cell to a point, within `reach` world units, or -1 (an inland point has no shore). */
export function shoreCell(p, reach = 16) {
  const { kind } = grid(); const g0 = cellOf(p); if (g0 < 0) return -1;
  if (kind[g0] === SEA) return g0;
  const x0 = g0 % GW, y0 = (g0 - x0) / GW; const R = Math.ceil(reach / CELL);
  let best = -1, bd = Infinity;
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    const x = x0 + dx, y = y0 + dy; if (x < 0 || y < 0 || x >= GW || y >= GH) continue;
    const g = y * GW + x; if (kind[g] !== SEA) continue;
    const d = dx * dx + dy * dy; if (d < bd && d <= R * R) { bd = d; best = g; }
  }
  return best;
}

// ── Sailing ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// Distances by water from one shore cell to every sea cell (Dijkstra, 8-way). A few voyages are planned per turn, so the
// last few fields are kept.
const fields = new Map();
function seaField(start) {
  if (fields.has(start)) { const f = fields.get(start); fields.delete(start); fields.set(start, f); return f; }
  const { kind } = grid();
  const dist = new Float32Array(GW * GH).fill(Infinity), prev = new Int32Array(GW * GH).fill(-1);
  const heap = new Heap(); dist[start] = 0; heap.push(start, 0);
  const STEP = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
  while (heap.size) {
    const [g, d] = heap.pop(); if (d > dist[g]) continue;
    const x = g % GW, y = (g - x) / GW;
    for (const [dx, dy, w] of STEP) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
      const k = ny * GW + nx; if (kind[k] !== SEA) continue;
      // no cutting a corner of land between two diagonal sea cells
      if (dx && dy && (kind[y * GW + nx] !== SEA || kind[ny * GW + x] !== SEA)) continue;
      const nd = Math.fround(d + w * CELL); if (nd < dist[k]) { dist[k] = nd; prev[k] = g; heap.push(k, nd); } // stored as float32: push the same value, or the entry looks stale
    }
  }
  const f = { dist, prev }; fields.set(start, f);
  if (fields.size > 24) fields.delete(fields.keys().next().value); // ~2 MB each: the realm's few dozen ports
  return f;
}

/**
 * The way by water from a shore near `from` to a shore near `to`: { miles, path: [[x,y]…] } or null when there is no
 * way by sea (an inland point, or a lake). The path starts at `from` and ends at `to`.
 */
export function seaRoute(from, to) {
  return seaRouteFrom(from, to, shoreCell(from));
}
/** The same, from a given shore cell (a port the caller has already found). */
export function seaRouteFrom(from, to, s) {
  const t = shoreCell(to); if (s < 0 || t < 0) return null;
  const f = seaField(s); if (!isFinite(f.dist[t])) return null;
  const cells = []; for (let g = t; g >= 0; g = f.prev[g]) cells.push(g);
  cells.reverse();
  const path = simplify([from, ...cells.map(centre), to]);
  return { miles: Math.round(pathUnits(path) * MILES_PER_UNIT), path };
}
/** Miles by water from a shore near `from` to each of `targets` (world points), Infinity where no way by sea. */
// voyages are asked for again every day a host waits on its shore: the same question gets the same answer from memory
const remembered = new Map();
const recall = (key, make) => { if (remembered.has(key)) return remembered.get(key); const v = make(); if (remembered.size > 4000) remembered.clear(); remembered.set(key, v); return v; };
const kp = (p) => `${Math.round(p[0] * 100)},${Math.round(p[1] * 100)}`;
export function seaMilesTo(from, targets) {
  return [...recall(`miles|${kp(from)}|${targets.map(kp).join(';')}`, () => seaMilesToUncached(from, targets))];
}
function seaMilesToUncached(from, targets) {
  const s = shoreCell(from); if (s < 0) return targets.map(() => Infinity);
  const f = seaField(s);
  return targets.map((p) => { const t = shoreCell(p); return t < 0 ? Infinity : (f.dist[t] + Math.hypot(...sub(centre(t), p))) * MILES_PER_UNIT; });
}

/**
 * Where to land for a voyage from `from` to `to` on another landmass: the stretch of the target's coast that gets the
 * men to `to` soonest — days at sea plus days of marching from the beach (the Bay of Seals crossing beats sailing round
 * to White Harbor). Returns { at: [x,y] the landing, path: sea route from `from` to it, seaMiles, landMiles } or null.
 */
export function bestLanding(from, to, opts = {}) {
  const v = recall(`landing|${kp(from)}|${kp(to)}|${opts.seaSpeed ?? 60}|${opts.landSpeed ?? 18}|${opts.roads ?? 1.12}`, () => bestLandingUncached(from, to, opts));
  return v && { ...v, at: [...v.at], path: v.path.map((q) => [...q]) };
}
function bestLandingUncached(from, to, { seaSpeed = 60, landSpeed = 18, roads = 1.12 } = {}) {
  const s = shoreCell(from); const target = landmassOf(to); if (s < 0 || target < 0) return null;
  const { comp } = grid(); const f = seaField(s);
  let best = -1, bestLand = -1, bc = Infinity;
  for (let g = 0; g < comp.length; g++) {
    if (!isFinite(f.dist[g])) continue;
    const x = g % GW, y = (g - x) / GW;
    let land = -1;
    for (const k of [x > 0 ? g - 1 : -1, x < GW - 1 ? g + 1 : -1, y > 0 ? g - GW : -1, y < GH - 1 ? g + GW : -1]) if (k >= 0 && comp[k] === target) { land = k; break; }
    if (land < 0) continue;
    const c = centre(land);
    const cost = (f.dist[g] * MILES_PER_UNIT) / seaSpeed + (Math.hypot(c[0] - to[0], c[1] - to[1]) * MILES_PER_UNIT * roads) / landSpeed;
    if (cost < bc) { bc = cost; best = g; bestLand = land; }
  }
  if (best < 0) return null;
  const at = centre(bestLand);
  const cells = []; for (let g = best; g >= 0; g = f.prev[g]) cells.push(g);
  const path = simplify([from, ...cells.reverse().map(centre), at]);
  return { at, path, seaMiles: Math.round(pathUnits(path) * MILES_PER_UNIT), landMiles: Math.round(Math.hypot(at[0] - to[0], at[1] - to[1]) * MILES_PER_UNIT * roads) };
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
export function pathUnits(pts) { let d = 0; for (let i = 1; i < pts.length; i++) d += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return d; }
/** The point a fraction `t` (0..1) of the way along a path. */
export function alongPath(pts, t) {
  let left = pathUnits(pts) * Math.max(0, Math.min(1, t));
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (left <= seg) { const k = seg ? left / seg : 0; return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k]; }
    left -= seg;
  }
  return [...pts[pts.length - 1]];
}
// Whether a straight leg between two points stays on open water (its ends may touch the shore they leave from)
function clearWater(a, b) {
  const { kind } = grid(); const d = Math.hypot(b[0] - a[0], b[1] - a[1]); const n = Math.ceil(d / (CELL / 3));
  for (let i = 1; i < n; i++) {
    const t = i / n; if (t * d < CELL * 1.5 || (1 - t) * d < CELL * 1.5) continue;
    const g = cellOf([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); if (g < 0 || kind[g] !== SEA) return false;
  }
  return true;
}
// A route of cells becomes a few legs: skip ahead as far as the water stays open (a leg never cuts over land)
function simplify(pts) {
  if (pts.length < 3) return pts;
  const out = [pts[0]]; let i = 0;
  while (i < pts.length - 1) {
    let j = Math.min(pts.length - 1, i + 1);
    for (let k = pts.length - 1; k > i + 1; k--) if (clearWater(pts[i], pts[k])) { j = k; break; }
    out.push(pts[j]); i = j;
  }
  return out.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
}

class Heap {
  constructor() { this.k = []; this.p = []; }
  get size() { return this.k.length; }
  push(k, p) {
    const K = this.k, P = this.p; let i = K.length; K.push(k); P.push(p);
    while (i > 0) { const j = (i - 1) >> 1; if (P[j] <= p) break; K[i] = K[j]; P[i] = P[j]; i = j; }
    K[i] = k; P[i] = p;
  }
  pop() {
    const K = this.k, P = this.p; const top = [K[0], P[0]]; const lk = K.pop(), lp = P.pop();
    if (K.length) {
      let i = 0; const n = K.length;
      for (;;) { const l = 2 * i + 1, r = l + 1; let m = i, mp = lp; if (l < n && P[l] < mp) { m = l; mp = P[l]; } if (r < n && P[r] < mp) m = r; if (m === i) break; K[i] = K[m]; P[i] = P[m]; i = m; }
      K[i] = lk; P[i] = lp;
    }
    return top;
  }
}
