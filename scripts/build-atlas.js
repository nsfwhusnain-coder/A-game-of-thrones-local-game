#!/usr/bin/env node
// Builds public/data/atlas.js — the geography of the Known World in game units — from the fan-made GIS data in
// data-src/got-inspired-map (CC BY-NC-SA 3.0: Tear, theMountainGoat & cadaei; the world © George R. R. Martin).
// Run: node scripts/build-atlas.js
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SRC = path.join(ROOT, 'data-src/got-inspired-map');
const load = (f) => JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8')).features;

// Projection: plate carrée, as the source maps were drawn. 38 game units per degree (~1.85 miles per unit).
export const PROJ = { lon0: 0, lat0: 49.6, lon1: 47.5, lat1: -13, S: 38 };
const W = Math.round((PROJ.lon1 - PROJ.lon0) * PROJ.S), H = Math.round((PROJ.lat0 - PROJ.lat1) * PROJ.S);
const proj = ([lon, lat]) => [(lon - PROJ.lon0) * PROJ.S, (PROJ.lat0 - lat) * PROJ.S];
const r1 = (v) => Math.round(v * 10) / 10;

// Douglas–Peucker simplification (tolerance in game units)
function simplify(pts, tol, closed) {
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(); let md = -1, mi = -1;
    const [ax, ay] = pts[a], [bx, by] = pts[b]; const dx = bx - ax, dy = by - ay; const l2 = dx * dx + dy * dy || 1e-9;
    for (let i = a + 1; i < b; i++) {
      const t = Math.max(0, Math.min(1, ((pts[i][0] - ax) * dx + (pts[i][1] - ay) * dy) / l2));
      const d = Math.hypot(pts[i][0] - (ax + t * dx), pts[i][1] - (ay + t * dy));
      if (d > md) { md = d; mi = i; }
    }
    if (md > tol) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
  }
  const out = pts.filter((_, i) => keep[i]);
  return closed && out.length < 3 ? pts : out;
}
// Clip a ring to the world rectangle (Sutherland–Hodgman)
function clipRing(ring) {
  const edges = [[(p) => p[0] >= 0, (a, b) => at(a, b, 0, 0)], [(p) => p[0] <= W, (a, b) => at(a, b, 0, W)], [(p) => p[1] >= 0, (a, b) => at(a, b, 1, 0)], [(p) => p[1] <= H, (a, b) => at(a, b, 1, H)]];
  function at(a, b, k, v) { const t = (v - a[k]) / (b[k] - a[k]); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
  let out = ring;
  for (const [inside, cross] of edges) {
    const inp = out; out = [];
    for (let i = 0; i < inp.length; i++) {
      const cur = inp[i], prev = inp[(i + inp.length - 1) % inp.length];
      if (inside(cur)) { if (!inside(prev)) out.push(cross(prev, cur)); out.push(cur); } else if (inside(prev)) out.push(cross(prev, cur));
    }
    if (!out.length) break;
  }
  return out;
}
function clipLine(pts) { // split a polyline into pieces inside the world
  const parts = []; let cur = [];
  for (const p of pts) { if (p[0] >= -5 && p[1] >= -5 && p[0] <= W + 5 && p[1] <= H + 5) cur.push(p); else if (cur.length) { parts.push(cur); cur = []; } }
  if (cur.length) parts.push(cur);
  return parts.filter((p) => p.length >= 2);
}
const rings = (g) => (g.type === 'Polygon' ? [g.coordinates[0]] : g.type === 'MultiPolygon' ? g.coordinates.map((p) => p[0]) : []);
const lines = (g) => (g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : []);
const polys = (features, tol, filter = () => true) => {
  const out = [];
  for (const f of features) {
    if (!filter(f)) continue;
    for (const r of rings(f.geometry)) {
      const c = clipRing(r.map(proj)); if (c.length < 3) continue;
      const s = simplify(c, tol, true).map(([x, y]) => [r1(x), r1(y)]);
      if (s.length >= 3) out.push({ props: f.properties, pts: s });
    }
  }
  return out;
};
const centroid = (pts) => { let a = 0, x = 0, y = 0; for (let i = 0; i < pts.length; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length]; const c = x0 * y1 - x1 * y0; a += c; x += (x0 + x1) * c; y += (y0 + y1) * c; } return a ? [r1(x / (3 * a)), r1(y / (3 * a))] : pts[0]; };
const area = (pts) => { let a = 0; for (let i = 0; i < pts.length; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length]; a += x0 * y1 - x1 * y0; } return Math.abs(a / 2); };

// ---------- land & water ----------
const land = [...polys(load('got_continents.geojson'), 0.35), ...polys(load('got_islands.geojson'), 0.25)]
  .map((p) => ({ name: p.props.name || null, pts: p.pts })).filter((p) => area(p.pts) > 1.5);
const lakes = polys(load('got_lakes.geojson'), 0.25).map((p) => ({ name: p.props.name || null, pts: p.pts }));

// ---------- relief & cover ----------
// Mountain ranges get a name and a height by where they lie (the source leaves most unnamed)
const RANGE_NAMES = [
  { name: 'The Frostfangs', at: [13, 40], h: 1.0 }, { name: 'The Mountains of the Moon', at: [21, 14], h: 0.95 },
  { name: 'The Red Mountains', at: [16, -4], h: 0.9 }, { name: 'The Red Mountains', at: [19, -9], h: 0.65 }, { name: 'The Red Mountains', at: [22, -8], h: 0.6 },
  { name: 'The Northern Mountains', at: [12, 28], h: 0.55 }, { name: 'The Lonely Hills', at: [19, 29], h: 0.35 },
  { name: 'The Westerlands Hills', at: [11, 7], h: 0.55 }, { name: 'The Skagos Peaks', at: [24, 35], h: 0.45 }, { name: 'The Skagos Peaks', at: [26, 35], h: 0.45 },
  { name: 'The Axe', at: [38, 11], h: 0.5 }, { name: 'The Velvet Hills', at: [33, 9], h: 0.35 }, { name: 'The Orange Hills', at: [37, 0], h: 0.4 },
];
const landscape = load('got_landscape.geojson');
const mountains = polys(landscape, 0.3, (f) => f.properties.type === 'mountain').map((p) => {
  const c = centroid(p.pts); const lonlat = [c[0] / PROJ.S + PROJ.lon0, PROJ.lat0 - c[1] / PROJ.S];
  const best = RANGE_NAMES.map((r) => ({ r, d: Math.hypot(r.at[0] - lonlat[0], r.at[1] - lonlat[1]) })).sort((a, b) => a.d - b.d)[0];
  const named = best && best.d < 4 ? best.r : null;
  return { name: p.props.name || named?.name || null, h: named?.h ?? 0.5, pts: p.pts };
});
const forests = polys(landscape, 0.3, (f) => f.properties.type === 'forest').map((p) => ({ name: p.props.name || null, pts: p.pts }));
const swamps = polys(landscape, 0.3, (f) => f.properties.type === 'swamp').map((p) => ({ name: p.props.name || 'The Neck', pts: p.pts }));
const steppes = polys(landscape, 0.4, (f) => f.properties.type === 'stepp').map((p) => ({ name: p.props.name || null, pts: p.pts }));

// ---------- lines ----------
const RIVER_SIZE = { Trident: 4, Mander: 3.4, 'Blackwater Rush': 3, Rhoyne: 4, 'Green Fork': 2.6, 'Red Fork': 2.6, 'Blue Fork': 2.2, 'White Knife': 2.2, Greenblood: 2.4, Honeywine: 1.8, 'Last River': 2, 'Weeping Water': 1.8, Noyne: 2, 'Upper Rhoyne': 2.6, 'Little Rhoyne': 2 };
const rivers = [];
for (const f of load('got_rivers.geojson')) for (const l of lines(f.geometry)) for (const part of clipLine(l.map(proj))) {
  const s = simplify(part, 0.25, false).map(([x, y]) => [r1(x), r1(y)]); if (s.length < 2) continue;
  rivers.push({ name: f.properties.name || null, w: RIVER_SIZE[f.properties.name] || (f.properties.name ? 1.6 : 1.1), pts: s });
}
const roads = [];
for (const f of load('got_roads.geojson')) for (const l of lines(f.geometry)) for (const part of clipLine(l.map(proj))) {
  const s = simplify(part, 0.3, false).map(([x, y]) => [r1(x), r1(y)]); if (s.length >= 2) roads.push({ name: f.properties.name || null, pts: s });
}
const wall = load('got_wall.geojson')[0].geometry.coordinates.map(proj).map(([x, y]) => [r1(x), r1(y)]);

// ---------- political regions (the kingdoms as drawn at the start of the story) ----------
const CLAIM = { 'The North': 'north', 'New Gift': 'wall', "Bran's Gift": 'wall', Riverlands: 'riverlands', 'The Iron Islands': 'iron_islands', Dorne: 'dorne', Stormlands: 'stormlands', 'The Vale': 'vale', 'The Westerlands': 'westerlands', Crownsland: 'crownlands', 'The Reach': 'reach' };
const regions = polys(load('got_politcal.geojson'), 0.4).map((p) => ({ region: CLAIM[p.props.name] || (p.props.ClaimedBy === 'Wildlings' ? 'beyond' : null), pts: p.pts })).filter((r) => r.region);

// ---------- labels: seas, bays, forests, lands ----------
const labels = [];
for (const f of load('got_regions.geojson')) {
  const n = f.properties.name; if (!n) continue;
  const r = rings(f.geometry)[0]; if (!r) continue;
  const pts = r.map(proj); const c = centroid(pts); if (c[0] < 0 || c[1] < 0 || c[0] > W || c[1] > H) continue;
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const vertical = Math.max(...ys) - Math.min(...ys) > 2.2 * (Math.max(...xs) - Math.min(...xs));
  labels.push({ t: n, x: c[0], y: c[1], kind: f.properties.type, s: Math.round(Math.min(26, Math.max(8, span / 14))), rot: vertical ? -Math.PI / 2 : 0 });
}
for (const f of [...forests, ...mountains]) if (f.name && !labels.some((l) => l.t === f.name)) { const c = centroid(f.pts); labels.push({ t: f.name, x: c[0], y: c[1], kind: forests.includes(f) ? 'forest' : 'mountain', s: 11, rot: 0 }); }

// ---------- canonical locations ----------
const locations = load('got_locations.geojson').filter((f) => f.properties.name).map((f) => {
  const [x, y] = proj(f.geometry.coordinates); return { name: f.properties.name, type: f.properties.type, size: f.properties.size, x: r1(x), y: r1(y) };
}).filter((l) => l.x >= 0 && l.y >= 0 && l.x <= W && l.y <= H);

const out = `// GENERATED by scripts/build-atlas.js — do not edit by hand.
// Geography of the Known World in game units (x east, y south; ${PROJ.S} units per degree of the source map).
// Derived from "A Song of Ice and Fire Speculative World Map" GIS data by Tear (Cartographers' Guild), theMountainGoat
// and cadaei — CC BY-NC-SA 3.0 (https://creativecommons.org/licenses/by-nc-sa/3.0/). Converted and simplified for this game;
// this file is shared under the same licence. The world and its places are © George R. R. Martin.
export const WORLD = ${JSON.stringify({ w: W, h: H })};
export const PROJ = ${JSON.stringify(PROJ)};
export const LAND = ${JSON.stringify(land)};
export const LAKES = ${JSON.stringify(lakes)};
export const MOUNTAIN_RANGES = ${JSON.stringify(mountains)};
export const FORESTS = ${JSON.stringify(forests)};
export const SWAMPS = ${JSON.stringify(swamps)};
export const STEPPES = ${JSON.stringify(steppes)};
export const RIVER_LINES = ${JSON.stringify(rivers)};
export const ROAD_LINES = ${JSON.stringify(roads)};
export const WALL_LINE = ${JSON.stringify(wall)};
export const REGIONS = ${JSON.stringify(regions)};
export const ATLAS_LABELS = ${JSON.stringify(labels)};
export const LOCATIONS = ${JSON.stringify(locations)};
`;
fs.writeFileSync(path.join(ROOT, 'public/data/atlas.js'), out);
const count = (a) => a.reduce((s, p) => s + p.pts.length, 0);
console.log(`atlas.js: world ${W}×${H}; land ${land.length} polys/${count(land)} pts, lakes ${lakes.length}, mountains ${mountains.length}, forests ${forests.length}, rivers ${rivers.length}/${count(rivers)} pts, roads ${roads.length}, regions ${regions.length}, labels ${labels.length}, locations ${locations.length}; ${(out.length / 1024).toFixed(0)} KB`);
