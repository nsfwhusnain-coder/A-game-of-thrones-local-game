#!/usr/bin/env node
// One-off: move every holding from the old hand-drawn map onto the atlas (public/data/atlas.js).
// Holdings whose seat appears in the atlas take its canonical position; the rest are carried across by a smooth warp
// fitted to the matched ones, then nudged onto dry land. Rewrites public/data/houses.js in place and writes
// public/data/warp.js (the control points, so old saves can be migrated at load time).
import fs from 'node:fs';
import path from 'node:path';
import { HOUSES, EXTRA_HOLDINGS, PLACE_ALIASES } from '../public/data/houses.js';
import { LOCATIONS, LAND, LAKES, WORLD } from '../public/data/atlas.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const norm = (s) => String(s || '').toLowerCase().replace(/[’']/g, '').replace(/\(.*?\)/g, '').replace(/\b(the|castle|of|keep)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
const locIndex = new Map();
for (const l of LOCATIONS) { const k = norm(l.name); if (!locIndex.has(k) || (l.size || 0) > (locIndex.get(k).size || 0)) locIndex.set(k, l); }
// Names the atlas spells differently
const MANUAL = { stark: 'winterfell', nights_watch: 'castle black', baratheon: 'kings landing', royce_gates: null, lannisport: 'lannisport', tyrell: 'highgarden', frey: 'twins', redwyne: null };

const holdings = [];
for (const h of HOUSES) if (h.seat && !h.landless) holdings.push({ id: h.id, names: [h.seat, ...h.seat.split(/,\s*/), h.name], old: h.pos });
for (const e of EXTRA_HOLDINGS) holdings.push({ id: e[0], names: [e[1]], old: [e[2], e[3]] });
for (const h of holdings) for (const [alias, id] of Object.entries(PLACE_ALIASES)) if (id === h.id) h.names.push(alias.replace(/_/g, ' '));

const matched = [], unmatched = [];
for (const h of holdings) {
  let loc = null;
  if (MANUAL[h.id] !== undefined) loc = MANUAL[h.id] ? locIndex.get(norm(MANUAL[h.id])) : null;
  if (!loc) for (const n of h.names) { const k = norm(n); if (k && locIndex.has(k)) { loc = locIndex.get(k); break; } }
  if (loc) { h.pos = [loc.x, loc.y]; h.src = loc.name; matched.push(h); } else unmatched.push(h);
}
const inPoly = ([x, y], pts) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
const onLand = (p) => LAND.some((l) => inPoly(p, l.pts)) && !LAKES.some((l) => inPoly(p, l.pts));
function toLand(p) {
  if (onLand(p)) return p;
  for (let r = 1; r < 60; r += 1) for (let a = 0; a < 16; a++) { const q = [p[0] + Math.cos((a / 16) * Math.PI * 2) * r, p[1] + Math.sin((a / 16) * Math.PI * 2) * r]; if (onLand(q)) return q; }
  return p;
}
// Seats the atlas lacks but whose place is known: an island (by name) or a fixed point
const islandAt = (name, k = 0) => { const l = LAND.filter((x) => x.name === name)[k]; if (!l) return null; let x = 0, y = 0; for (const p of l.pts) { x += p[0]; y += p[1]; } return [x / l.pts.length, y / l.pts.length]; };
const OVERRIDE = {
  crowl: islandAt('Skagos'), drumm: islandAt('Old Wyk'), blacktyde: islandAt('Blacktyde'), orkwood: islandAt('Orkmont'), saltcliffe: islandAt('Saltcliffe'),
  velaryon: islandAt('Driftmark'), celtigar: islandAt('Claw Isle'), mormont: islandAt('Bear Island'), redwyne: islandAt('The Arbor'),
  grimm: [290, 1957], hewett: [302, 1962], serry: [293, 1970],
  lannister: [263, 1677], // Casterly Rock, above Lannisport
  hardhome: [806, 444], royce_gates: [772, 1442],
  clegane: (() => { const l = locIndex.get(norm('Clegane Hall')); return l && [l.x, l.y]; })(),
};
for (const [id, p] of Object.entries(OVERRIDE)) {
  const h = holdings.find((x) => x.id === id); if (!h || !p) continue;
  h.pos = toLand(p); h.src = 'placed'; const i = unmatched.indexOf(h); if (i >= 0) { unmatched.splice(i, 1); matched.push(h); }
}

// Warp for the rest: inverse-distance-weighted displacement from the nearest matched holdings
function warp([x, y]) {
  const near = matched.map((m) => ({ m, d: Math.hypot(m.old[0] - x, m.old[1] - y) })).sort((a, b) => a.d - b.d).slice(0, 6);
  if (near[0].d < 0.01) return [...near[0].m.pos];
  let sx = 0, sy = 0, sw = 0;
  for (const { m, d } of near) { const w = 1 / (d * d); sx += (m.pos[0] - m.old[0]) * w; sy += (m.pos[1] - m.old[1]) * w; sw += w; }
  return [x + sx / sw, y + sy / sw];
}
// islands are small: search a little wider before giving up, and move 2 units inland from the shore
for (const h of unmatched) { h.pos = toLand(warp(h.old)); h.src = 'warped'; }
for (const h of holdings) h.pos = h.pos.map((v) => Math.round(v));
for (const h of holdings) if (!onLand(h.pos)) { h.pos = toLand(h.pos).map((v) => Math.round(v)); }

// Rewrite houses.js
let src = fs.readFileSync(path.join(ROOT, 'public/data/houses.js'), 'utf8');
const byId = new Map(holdings.map((h) => [h.id, h]));
let n = 0;
src = src.replace(/H\('([a-z_0-9]+)',(\s*'(?:[^'\\]|\\.)*',\s*(?:null|'(?:[^'\\]|\\.)*'),\s*)(-?[\d.]+),\s*(-?[\d.]+)/g, (m, id, mid, x, y) => {
  const h = byId.get(id); if (h) { n++; return `H('${id}',${mid}${h.pos[0]}, ${h.pos[1]}`; }
  // landless houses keep a nominal position: carry it across with the warp
  const p = warp([Number(x), Number(y)]).map((v) => Math.round(v)); n++; return `H('${id}',${mid}${p[0]}, ${p[1]}`;
});
src = src.replace(/\['([a-z_0-9]+)',(\s*'(?:[^'\\]|\\.)*',\s*)(-?[\d.]+),\s*(-?[\d.]+),/g, (m, id, mid) => { const h = byId.get(id); if (!h) return m; n++; return `['${id}',${mid}${h.pos[0]}, ${h.pos[1]},`; });
fs.writeFileSync(path.join(ROOT, 'public/data/houses.js'), src);

// Control points for migrating old saves (old → new), plus the world size of the old map
const ctrl = matched.map((m) => [...m.old, ...m.pos]);
fs.writeFileSync(path.join(ROOT, 'public/data/warp.js'), `// GENERATED by scripts/migrate-positions.js: control points [oldX, oldY, newX, newY] from the first map to the atlas.
// Used to carry armies and other free positions in old saves onto the new map.
export const MAP_VERSION = 2;
export const WARP_CTRL = ${JSON.stringify(ctrl)};
export function warpOld([x, y]) {
  const near = WARP_CTRL.map((c) => [c, Math.hypot(c[0] - x, c[1] - y)]).sort((a, b) => a[1] - b[1]).slice(0, 6);
  if (near[0][1] < 0.01) return [near[0][0][2], near[0][0][3]];
  let sx = 0, sy = 0, sw = 0;
  for (const [c, d] of near) { const w = 1 / (d * d); sx += (c[2] - c[0]) * w; sy += (c[3] - c[1]) * w; sw += w; }
  return [Math.round(x + sx / sw), Math.round(y + sy / sw)];
}
`);
console.log(`${matched.length} matched to the atlas, ${unmatched.length} warped; ${n} coordinates rewritten; world ${WORLD.w}×${WORLD.h}`);
console.log('warped:', unmatched.map((h) => `${h.id}→${h.pos}`).join(', '));
