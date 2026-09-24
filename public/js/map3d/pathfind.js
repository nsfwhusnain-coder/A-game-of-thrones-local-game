// A* pathfinding on a coarse grid derived from the terrain. Armies walk on land (mountains cost more,
// roads cost less); fleets sail on water. Used to draw march routes and animate movement.
import { ROADS, JUNCTIONS } from '../../data/geography.js';

export class PathGrid {
  constructor({ W, H, scale, land, height }, holdingsPos, cell = 5) {
    this.cell = cell; this.scale = scale;
    this.gw = Math.ceil(W / scale / cell); this.gh = Math.ceil(H / scale / cell);
    const n = this.gw * this.gh;
    this.landCost = new Float32Array(n); this.seaCost = new Float32Array(n);
    for (let gy = 0; gy < this.gh; gy++) for (let gx = 0; gx < this.gw; gx++) {
      const px = Math.min(W - 1, Math.floor((gx + 0.5) * cell * scale)), py = Math.min(H - 1, Math.floor((gy + 0.5) * cell * scale));
      const i = py * W + px, g = gy * this.gw + gx;
      if (land[i]) {
        const h = height[i];
        this.landCost[g] = 1 + Math.max(0, h - 0.2) * 14; // mountains are slow
        this.seaCost[g] = Infinity;
      } else {
        this.landCost[g] = Infinity;
        this.seaCost[g] = 1;
      }
    }
    // coast cells are usable by both (ports / landings)
    for (let gy = 1; gy < this.gh - 1; gy++) for (let gx = 1; gx < this.gw - 1; gx++) {
      const g = gy * this.gw + gx;
      if (this.landCost[g] === Infinity) continue;
      const nb = [g - 1, g + 1, g - this.gw, g + this.gw];
      if (nb.some((k) => this.seaCost[k] === 1)) this.seaCost[g] = 2.5;
    }
    // roads are fast
    for (const road of ROADS) {
      const pts = road.via.map((id) => holdingsPos(id) || JUNCTIONS[id]).filter(Boolean);
      for (let k = 0; k < pts.length - 1; k++) {
        const [ax, ay] = pts[k], [bx, by] = pts[k + 1];
        const steps = Math.ceil(Math.hypot(bx - ax, by - ay) / cell);
        for (let s = 0; s <= steps; s++) {
          const x = ax + (bx - ax) * (s / steps), y = ay + (by - ay) * (s / steps);
          const g = this.idx(x, y);
          if (g >= 0 && this.landCost[g] !== Infinity) this.landCost[g] = Math.min(this.landCost[g], 0.45);
        }
      }
    }
  }
  idx(x, y) { const gx = Math.floor(x / this.cell), gy = Math.floor(y / this.cell); return gx < 0 || gy < 0 || gx >= this.gw || gy >= this.gh ? -1 : gy * this.gw + gx; }

  nearestPassable(g, cost) {
    if (g >= 0 && cost[g] !== Infinity) return g;
    const gx0 = g % this.gw, gy0 = Math.floor(g / this.gw);
    for (let r = 1; r < 20; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = gx0 + dx, y = gy0 + dy; if (x < 0 || y < 0 || x >= this.gw || y >= this.gh) continue;
      const k = y * this.gw + x; if (cost[k] !== Infinity) return k;
    }
    return -1;
  }

  /** Returns a list of [x,y] world points, or a straight line if no path. */
  find(from, to, mode = 'land') {
    const cost = mode === 'sea' ? this.seaCost : this.landCost;
    const s = this.nearestPassable(this.idx(from[0], from[1]), cost);
    const t = this.nearestPassable(this.idx(to[0], to[1]), cost);
    if (s < 0 || t < 0) return [from, to];
    const W = this.gw, n = W * this.gh;
    const gScore = new Float32Array(n).fill(Infinity), came = new Int32Array(n).fill(-1), closed = new Uint8Array(n);
    const tx = t % W, ty = Math.floor(t / W);
    const heap = new MinHeap();
    gScore[s] = 0; heap.push(s, 0);
    const D = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
    let found = false, iter = 0;
    while (heap.size && iter++ < 400000) {
      const cur = heap.pop();
      if (cur === t) { found = true; break; }
      if (closed[cur]) continue; closed[cur] = 1;
      const cx = cur % W, cy = Math.floor(cur / W);
      for (const [dx, dy, dl] of D) {
        const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= this.gh) continue;
        const nb = ny * W + nx; const c = cost[nb]; if (c === Infinity || closed[nb]) continue;
        const g = gScore[cur] + dl * (c + cost[cur]) * 0.5;
        if (g < gScore[nb]) { gScore[nb] = g; came[nb] = cur; heap.push(nb, g + Math.hypot(nx - tx, ny - ty) * 0.45); }
      }
    }
    if (!found) return [from, to];
    const cells = []; for (let c = t; c !== -1; c = came[c]) cells.push(c);
    cells.reverse();
    const pts = [from, ...cells.map((c) => [(c % W + 0.5) * this.cell, (Math.floor(c / W) + 0.5) * this.cell]), to];
    return smooth(simplify(pts, 1.2));
  }
}

function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = out[out.length - 1], b = pts[i], c = pts[i + 1];
    const cross = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
    if (cross > tol * Math.hypot(c[0] - a[0], c[1] - a[1])) out.push(b);
  }
  out.push(pts[pts.length - 1]);
  return out;
}
function smooth(pts) {
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

class MinHeap {
  constructor() { this.k = []; this.p = []; }
  get size() { return this.k.length; }
  push(k, p) {
    const K = this.k, P = this.p; let i = K.length; K.push(k); P.push(p);
    while (i > 0) { const j = (i - 1) >> 1; if (P[j] <= p) break; K[i] = K[j]; P[i] = P[j]; i = j; }
    K[i] = k; P[i] = p;
  }
  pop() {
    const K = this.k, P = this.p; const top = K[0]; const lk = K.pop(), lp = P.pop();
    if (K.length) {
      let i = 0; const n = K.length;
      while (true) { let l = 2 * i + 1, r = l + 1, m = i; let mp = lp; if (l < n && P[l] < mp) { m = l; mp = P[l]; } if (r < n && P[r] < mp) { m = r; } if (m === i) break; K[i] = K[m]; P[i] = P[m]; i = m; }
      K[i] = lk; P[i] = lp;
    }
    return top;
  }
}

export function pathLength(pts) { let d = 0; for (let i = 1; i < pts.length; i++) d += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return d; }
export function pointAlong(pts, t) {
  const total = pathLength(pts); let target = total * t;
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (target <= seg) { const k = seg ? target / seg : 0; return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k]; }
    target -= seg;
  }
  return pts[pts.length - 1];
}
