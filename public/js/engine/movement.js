// How parties cross the realm (docs/gdd/03-architecture.md §5, 07-military.md §5). A journey is planned once, when the
// order is given, over the same atlas the map is drawn from: along the roads where there are roads, slower through
// forest, bog and mountain, never over a lake, through the Wall only at its gates, and over the sea only on a ship.
// The route is stored on the party (`route.path`, with the day each point is reached) and the party walks it day by
// day, so the map draws the road the engine walked and a host never glides in a straight line over the Bay of Seals.
//
// Deterministic and browser-safe: the server plans and walks the routes; the client draws them and asks for estimates.
import { ROADS, MOUNTAIN_RANGES, FORESTS, SWAMPS, WALL, MILES_PER_UNIT } from '../../data/geography.js';
import { HOUSES, EXTRA_HOLDINGS } from '../../data/houses.js';
import { SPEED, SEA, TERRAIN, SUPPLY } from '../../data/balance.js';
import { raster, cellOf, centre, polyCells, landmassOf, shoreCell, seaMilesTo, seaRoute, bestLanding, pathUnits } from './geo.js';
import { unitsOf } from '../shared/units.js';

// ── Terrain ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// How long a mile takes, against a mile of road (the inverse of 07 §5's speeds, data/balance.js TERRAIN): a host that
// leaves the kingsroad for the hills covers fewer miles a day. Hills are the low ranges of the atlas, mountains the high,
// and the peaks of the Mountains of the Moon and the Frostfangs are all but impassable off the roads through them.
const SLOW = Object.fromEntries(Object.entries(TERRAIN).map(([k, v]) => [k, 1 / v]));
const heights = (h) => (h >= 0.9 ? SLOW.peaks : h >= 0.6 ? SLOW.mountains : SLOW.hills);
// the Wall is ice from the Shadow Tower to Eastwatch; its castles are the gates
const GATES = [HOUSES.find((h) => h.id === 'nights_watch')?.pos, ...EXTRA_HOLDINGS.filter((e) => ['shadow_tower', 'eastwatch'].includes(e[0])).map((e) => [e[2], e[3]])].filter(Boolean);

let T = null; // Float32Array: a time factor per cell, Infinity where no one walks
function terrain() {
  if (T) return T;
  const { CELL, GW, GH, kind, LAND } = raster();
  const f = new Float32Array(GW * GH).fill(Infinity);
  for (let g = 0; g < f.length; g++) if (kind[g] === LAND) f[g] = SLOW.open;
  const paint = (cells, v) => { for (const g of cells) if (f[g] !== Infinity) f[g] = Math.max(f[g], v); };
  for (const x of FORESTS) paint(polyCells(x.pts), SLOW.forest);
  for (const x of SWAMPS) paint(polyCells(x.pts), SLOW.marsh);
  for (const x of MOUNTAIN_RANGES) paint(polyCells(x.pts), heights(x.h ?? 0.5));
  // along a line, every cell it passes through (steps of a third of a cell: no gaps a diagonal could slip through)
  const along = (pts, fn) => {
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1]; const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / (CELL / 3)));
      for (let k = 0; k <= n; k++) { const g = cellOf([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]); if (g >= 0) fn(g); }
    }
  };
  for (const r of ROADS) along(r.pts, (g) => { if (f[g] !== Infinity) f[g] = SLOW.road; });
  const gate = (g) => { const c = centre(g); return GATES.some((p) => Math.hypot(p[0] - c[0], p[1] - c[1]) <= CELL * 1.5); };
  along(WALL, (g) => { if (!gate(g)) f[g] = Infinity; });
  T = f;
  return T;
}
/** The time factor of the ground at a point (Infinity on water and on the Wall). */
export const groundFactor = (p) => { const g = cellOf(p); return g < 0 ? Infinity : terrain()[g]; };

// ── Routing on land (A*) ────────────────────────────────────────────────────────────────────────────────────────────
let score = null, came = null, stamp = null, gen = 0;
function astar(s, t) {
  const { GW, GH } = raster(); const f = terrain(); const n = GW * GH;
  if (!score) { score = new Float64Array(n); came = new Int32Array(n); stamp = new Uint32Array(n); }
  gen++;
  const tx = t % GW, ty = (t - tx) / GW;
  const heap = new Heap(); score[s] = 0; came[s] = -1; stamp[s] = gen; heap.push(s, 0);
  const STEP = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
  while (heap.size) {
    const [g, pri] = heap.pop();
    if (g === t) break;
    const x = g % GW, y = (g - x) / GW; const d = score[g];
    if (pri - Math.hypot(x - tx, y - ty) > d + 1e-9) continue; // a stale entry
    for (const [dx, dy, w] of STEP) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
      const k = ny * GW + nx; if (f[k] === Infinity) continue;
      if (dx && dy && (f[y * GW + nx] === Infinity || f[ny * GW + x] === Infinity)) continue; // no slipping past a corner
      const nd = d + w * (f[g] + f[k]) * 0.5;
      if (stamp[k] !== gen || nd < score[k]) { stamp[k] = gen; score[k] = nd; came[k] = g; heap.push(k, nd + Math.hypot(nx - tx, ny - ty)); }
    }
  }
  if (stamp[t] !== gen) return null;
  const cells = []; for (let g = t; g >= 0; g = g === s ? -1 : came[g]) cells.push(g);
  cells.reverse();
  return { cells, cost: cells.map((g) => score[g]) };
}
// the nearest cell someone can stand on, near a point (a castle drawn on its shore, a port, a ford), on `comp` if given
function standOn(p, comp = null, reach = 8) {
  const { GW, GH, comp: C } = raster(); const f = terrain(); const g0 = cellOf(p); if (g0 < 0) return -1;
  if (f[g0] !== Infinity && (comp == null || C[g0] === comp)) return g0;
  const x0 = g0 % GW, y0 = (g0 - x0) / GW; let best = -1, bd = Infinity;
  for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) {
    const x = x0 + dx, y = y0 + dy; if (x < 0 || y < 0 || x >= GW || y >= GH) continue;
    const g = y * GW + x; if (f[g] === Infinity || (comp != null && C[g] !== comp)) continue;
    const d = dx * dx + dy * dy; if (d < bd) { bd = d; best = g; }
  }
  return best;
}
/** The nearest dry ground to a point, within about a day's ride (a party an old save left on the water), or null. */
export function ashore(p, reach = 12) { const g = standOn(p, null, reach); return g < 0 ? null : round(centre(g)); }
const cache = new Map();
/**
 * The way on foot from `from` to `to`: { path: [[x,y]…], eff: [effort-miles to each point], miles } or null when the
 * sea (or a lake, or the Wall) is in the way. Effort-miles are road-miles: a mile of bog counts two and a half.
 */
export function landPath(from, to) {
  const lm = landmassOf(from), lt = landmassOf(to);
  if (lm < 0 || lt < 0 || lm !== lt) return null;
  const s = standOn(from, lm), t = standOn(to, lm); if (s < 0 || t < 0) return null;
  const key = `${s}>${t}`;
  let r = cache.get(key);
  if (r === undefined) {
    const a = astar(s, t);
    r = a && squeeze(a.cells.map(centre), a.cost.map((c) => c * raster().CELL * MILES_PER_UNIT));
    cache.set(key, r); if (cache.size > 600) cache.delete(cache.keys().next().value);
  }
  if (!r) return null;
  // the exact ends: from where the party stands to the gate of the place it is going to
  const head = Math.hypot(r.path[0][0] - from[0], r.path[0][1] - from[1]) * MILES_PER_UNIT * SLOW.open;
  const tail = Math.hypot(r.path.at(-1)[0] - to[0], r.path.at(-1)[1] - to[1]) * MILES_PER_UNIT * SLOW.open;
  const path = [[...from], ...r.path, [...to]]; const eff = [0, ...r.eff.map((e) => e + head), r.eff.at(-1) + head + tail];
  return { path: path.map(round), eff, miles: Math.round(pathUnits(path) * MILES_PER_UNIT) };
}
// a route of cells becomes a few legs: drop the points a straight run passes through, keeping each kept point's effort
function squeeze(pts, eff) {
  if (pts.length < 3) return { path: pts, eff };
  const keep = [0];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[keep.at(-1)], b = pts[i], c = pts[i + 1];
    const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (Math.abs(cross) > 1e-6 * Math.hypot(c[0] - a[0], c[1] - a[1]) || i - keep.at(-1) >= 12) keep.push(i);
  }
  keep.push(pts.length - 1);
  return { path: keep.map((i) => pts[i]), eff: keep.map((i) => eff[i]) };
}
const round = ([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10];

// ── Pace ────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Miles a day on a road for a party of this kind and make-up, in this season (07 §5; forced marches come with C4). */
export function paceOf(state, p) {
  switch (p.kind) {
    case 'rider': return SPEED.rider;
    case 'envoy': return SPEED.envoy;
    case 'retinue': return SPEED.retinue;
    case 'progress': return SPEED.progress;
    case 'caravan': return SPEED.caravan;
    case 'fleet': return state.houses?.[p.owner]?.region === 'iron_islands' ? SEA.sail.longship : SEA.sail.cog;
  }
  const u = unitsOf(state, p); const men = Math.max(1, p.men || 0);
  const riders = (u.horse + u.knights) / men;
  const base = riders >= 0.85 ? SPEED.horseHost : riders <= 0.05 ? SPEED.footHost : SPEED.mixedHost;
  return base * (p.men > 15000 ? 0.8 : 1) * (p.secrecy === 'hidden' ? 0.85 : 1) * seasonPace(state, p); // a great host is slow; so is one that marches by night
}

/** A host's pace by the season (07 §5; WP C3): autumn's rains, winter's snows, the North's and beyond the Wall worst of all. */
export function seasonPace(state, p) {
  const s = state?.world?.season || 'summer';
  if (s === 'autumn') return SUPPLY.season.autumn;
  if (s !== 'winter') return 1;
  const at = p.pos || state.holdings?.[p.at]?.pos; let region = state.holdings?.[p.at]?.region;
  if (!region && at) { let bd = Infinity; for (const h of Object.values(state.holdings || {})) { const d = (h.pos[0] - at[0]) ** 2 + (h.pos[1] - at[1]) ** 2; if (d < bd) { bd = d; region = h.region; } } }
  return region === 'beyond' ? SUPPLY.season.winterBeyond : ['north', 'wall'].includes(region) ? SUPPLY.season.winterNorth : SUPPLY.season.winter;
}

// ── Journeys ────────────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * The way from `from` to `to` at `pace` miles a day: over land where there is land; where the sea is in the way, a
 * ride to the port that gets them there soonest, a day to find a ship and go aboard, the voyage, and on from the
 * landing. Returns { path, t: [day each point is reached], days, miles, sea: [first, last] point index at sea | null }
 * or null when there is no way (an inland lake, a place off the map). `ports` are [x,y] of coastal holdings.
 */
export function journey(from, to, pace, { ports = [], boat = SEA.sail.cog, board = SEA.embarkDays, passage = false } = {}) {
  const key = `${cellOf(from)}>${cellOf(to)}@${pace}/${boat}${passage ? '+' : ''}`;
  if (trips.has(key)) return trips.get(key);
  const j = plan(from, to, pace, ports, boat, board, passage);
  trips.set(key, j); if (trips.size > 300) trips.delete(trips.keys().next().value);
  return j && { ...j, path: [[...from], ...j.path.slice(1, -1), [...to]] };
}
const trips = new Map();
function plan(from, to, pace, ports, boat, board, passage) {
  const land = landPath(from, to);
  const walk = land && { path: land.path, t: land.eff.map((e) => e / pace), days: land.eff.at(-1) / pace, miles: land.miles, sea: null };
  // a long way by land: a traveller (never a host, which needs ships of its own) may do better to take ship
  if (walk && !(passage && walk.days > 15 && ports.length)) return walk;
  const bySea = voyage(from, to, pace, ports, boat, board);
  return walk && (!bySea || bySea.days >= walk.days * 0.9) ? walk : bySea || walk; // a ship only if it is clearly quicker
}
function voyage(from, to, pace, ports, boat, board) {
  const lm = landmassOf(from); if (lm < 0 || landmassOf(to) < 0) return null;
  // ports on this shore, ranked by a first guess (by sea when the goal has a shore of its own), then tried properly
  const mine = ports.filter((q) => landmassOf(q) === lm); if (!mine.length) return null;
  const sea = shoreCell(to) >= 0 ? seaMilesTo(to, mine) : mine.map(() => 0);
  const guess = mine.map((q, i) => ({ q, est: (Math.hypot(q[0] - from[0], q[1] - from[1]) * MILES_PER_UNIT * SLOW.open) / pace + sea[i] / boat }))
    .filter((x) => isFinite(x.est)).sort((a, b) => a.est - b.est).slice(0, 3);
  let best = null;
  for (const { q } of guess) {
    const ride = landPath(from, q); if (!ride) continue;
    const lane = bestLanding(q, to, { seaSpeed: boat, landSpeed: pace }); if (!lane) continue;
    const on = landPath(lane.at, to); if (!on) continue;
    const seaMiles = pathUnits(lane.path) * MILES_PER_UNIT;
    const days = ride.eff.at(-1) / pace + board + seaMiles / boat + on.eff.at(-1) / pace;
    if (!best || days < best.days) best = { ride, lane, on, days, seaMiles };
  }
  if (!best) return null;
  // one path: the ride; the quay twice (arriving, and a day later going aboard); the voyage; the road from the landing
  const { ride, lane, on } = best;
  const path = [...ride.path]; const t = ride.eff.map((e) => e / pace);
  path.push([...path.at(-1)]); t.push(t.at(-1) + board);
  const first = path.length - 1; const vp = lane.path.slice(1); let acc = 0;
  for (let i = 0; i < vp.length; i++) { const prev = i ? vp[i - 1] : path[first]; acc += Math.hypot(vp[i][0] - prev[0], vp[i][1] - prev[1]) * MILES_PER_UNIT; path.push(round(vp[i])); t.push(t[first] + acc / boat); }
  const last = path.length - 1; const tl = t.at(-1);
  on.path.slice(1).forEach((q, i) => { path.push(q); t.push(tl + on.eff[i + 1] / pace); });
  return { path, t, days: t.at(-1), miles: Math.round(ride.miles + best.seaMiles + on.miles), sea: [first, last] };
}

/**
 * Plan (or re-plan) a party's route to a point. `key` names the goal (a place id, or `party:<id>` for a host it
 * follows) so an unchanged order keeps its route. Returns the route or null when there is no way.
 */
export function planRoute(state, p, to, key, { toName = null } = {}) {
  const pace = paceOf(state, p);
  const j = p.kind === 'fleet' ? sailing(p.pos, to, pace) : journey(p.pos, to, pace, { ports: portsOf(state), passage: TRAVEL_BY_SHIP.has(p.kind) });
  if (!j) return (p.route = null);
  p.route = { to: key, toName, pos: round(to), pace, path: j.path, t: j.t.map((x) => Math.round(x * 1000) / 1000), days: Math.round(j.days * 1000) / 1000, miles: j.miles, sea: j.sea, done: 0, paid: [] };
  p.route.daysLeft = Math.round(p.route.days * 10) / 10;
  return p.route;
}
// a fleet's way: the sea lane from where it lies to the shore nearest its goal
function sailing(from, to, pace) {
  const r = seaRoute(from, to); if (!r) return null;
  const t = [0]; for (let i = 1; i < r.path.length; i++) t.push(t[i - 1] + (Math.hypot(r.path[i][0] - r.path[i - 1][0], r.path[i][1] - r.path[i - 1][1]) * MILES_PER_UNIT) / pace);
  return { path: r.path, t, days: t.at(-1), miles: r.miles, sea: [0, r.path.length - 1] };
}
/**
 * How far and how long, without planning anything: { miles, days } for party `p` from `from` to `to`, by the same ways
 * planRoute() would take (null `state` is allowed: then no sea passages are considered).
 */
export function estimate(state, p, from, to) {
  const pace = paceOf(state, p);
  const j = p.kind === 'fleet' ? sailing(from, to, pace) : journey(from, to, pace, { ports: state ? portsOf(state) : [], passage: TRAVEL_BY_SHIP.has(p.kind) });
  return j ? { miles: j.miles, days: Math.max(1, Math.round(j.days)) } : null;
}
// who may book a passage on a merchant ship when it is quicker than the road (a host needs ships of its own: sea.js)
const TRAVEL_BY_SHIP = new Set(['rider', 'envoy']);
const portsOf = (state) => Object.values(state.holdings || {}).filter((h) => h.coastal && !/ruin/.test(h.type || '')).map((h) => h.pos);
/** True when a party's route no longer fits its order (a new goal, a quarry that moved, a new pace). */
export function stale(state, p, key, to) {
  const r = p.route;
  return !r || r.to !== key || Math.hypot(r.pos[0] - to[0], r.pos[1] - to[1]) > 6 || Math.abs(r.pace - paceOf(state, p)) > 0.01;
}

/** The point `d` days along a route. */
export function pointAt(r, d) {
  const { path, t } = r; if (d <= 0) return [...path[0]]; if (d >= t.at(-1)) return [...path.at(-1)];
  let i = 1; while (i < t.length - 1 && t[i] < d) i++;
  const span = t[i] - t[i - 1]; const k = span > 0 ? (d - t[i - 1]) / span : 1;
  return round([path[i - 1][0] + (path[i][0] - path[i - 1][0]) * k, path[i - 1][1] + (path[i][1] - path[i - 1][1]) * k]);
}
/** The ground covered between day `d0` and day `d1` of a route: the points, in order, ends included. */
export function stretch(r, d0, d1) {
  const out = [pointAt(r, d0)];
  for (let i = 0; i < r.path.length; i++) if (r.t[i] > d0 && r.t[i] < d1) out.push([...r.path[i]]);
  out.push(pointAt(r, d1));
  return out;
}
/** Whether day `d` of a route finds the party aboard ship (after the quay, before the landing). */
export const atSeaOn = (r, d) => !!r?.sea && d > r.t[r.sea[0]] + 1e-9 && d < r.t[r.sea[1]] - 1e-9;

/**
 * Walk a party `days` days along its route. Days of delay (a lamed horse, a flooded ford, the wait at a gate) are spent
 * first, standing still. Returns { wait, used, path, arrived }: days waited, days of the turn used in all, the ground
 * covered, and whether the road's end was reached.
 */
export function advance(p, days) {
  const r = p.route; if (!r) return { wait: 0, used: 0, path: [], arrived: false };
  const wait = Math.min(days, Math.max(0, p.delay || 0)); if (p.delay) p.delay = Math.max(0, p.delay - wait);
  const d0 = r.done, d1 = Math.min(r.days, d0 + Math.max(0, days - wait));
  const path = stretch(r, d0, d1);
  r.done = Math.round(d1 * 1000) / 1000; p.pos = pointAt(r, r.done);
  r.daysLeft = Math.round(Math.max(0, r.days - r.done) * 10) / 10;
  return { wait, used: wait + (d1 - d0), path, arrived: r.done >= r.days - 1e-6 };
}
/** Days until a party reaches the end of its route (its delays included), or null without one. */
export const daysLeft = (p) => (p.route ? Math.max(0, p.route.days - p.route.done) + (p.delay || 0) : null);

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
