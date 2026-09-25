// Procedural 3D models: castles, cities, towns, camps, ruins, unique landmarks, armies, fleets, trees.
// Every settlement is built from primitives and merged by material, so ~150 settlements stay cheap.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { drawBanner } from '../sigils.js';

// ---------- shared materials ----------
const matCache = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.02, flatShading: true, ...opts }));
  return matCache.get(key);
}
// ---------- surfaces: coursed masonry, tiled roofs, half-timbered plaster ----------
// Shader extensions on the standard material, in the model's own space so the stonework scales with the
// castle. Block colours vary stone by stone, mortar lines are dark, walls weather towards their feet,
// moss creeps up in the wet north and snow lies on ledges beyond the Neck.
const SURF_VERT = ['#include <common>', 'varying vec3 vLP;\nvarying vec3 vLN;\n#include <common>', '#include <begin_vertex>', '#include <begin_vertex>\nvLP = position;\nvLN = normal;'];
const SURF_HEAD = `
varying vec3 vLP; varying vec3 vLN;
uniform float uKind; uniform vec3 uMoss; uniform float uMossAmt; uniform float uSnow;
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
vec3 surfaceTint(vec3 base) {
  vec3 n = normalize(vLN); vec3 p = vLP;
  bool top = n.y > 0.7;
  vec2 uv = top ? p.xz : vec2(abs(n.x) > abs(n.z) ? p.z : p.x, p.y);
  if (uKind < 0.5) { // masonry
    float ch = 0.34, bl = 0.62;
    float row = floor(uv.y / ch); vec2 b = vec2(uv.x / bl + (mod(row, 2.0) * 0.5), uv.y / ch);
    if (top) b = uv / vec2(bl, bl * 0.8);
    vec2 cell = floor(b), f = fract(b);
    float edge = min(min(f.x, 1.0 - f.x) * bl / ch, min(f.y, 1.0 - f.y));
    float mortar = 1.0 - smoothstep(0.03, 0.09, edge);
    float v = h21(cell) - 0.5;
    vec3 c = base * (1.0 + v * 0.22) * mix(vec3(1.0), vec3(1.03, 1.0, 0.95), h21(cell + 7.0));
    c *= 1.0 - 0.12 * vnoise(p.xz * 3.0 + p.y * 2.0);
    c = mix(c, base * 0.5, mortar * 0.6);
    float foot = 1.0 - smoothstep(0.0, 2.2, p.y);
    c *= 1.0 - 0.28 * foot;
    float streak = vnoise(vec2(uv.x * 6.0, p.y * 0.4)) * (1.0 - smoothstep(0.0, 5.0, p.y));
    c = mix(c, uMoss, uMossAmt * clamp(foot * 0.8 + streak * 0.5 - 0.15, 0.0, 1.0));
    if (top) c = mix(c, vec3(0.93, 0.95, 0.97), uSnow * 0.85);
    return c;
  }
  if (uKind < 1.5) { // roof tiles or slate, laid in rows down the slope
    float rowH = 0.22; float along = abs(n.x) > abs(n.z) ? p.z : p.x;
    float row = floor(p.y / rowH); float f = fract(p.y / rowH);
    float tile = floor(along / 0.3 + mod(row, 2.0) * 0.5);
    float v = h21(vec2(tile, row)) - 0.5;
    vec3 c = base * (0.92 + v * 0.2);
    c *= 0.72 + 0.28 * smoothstep(0.0, 0.35, f); // each course shadows the one below
    float seam = abs(fract(along / 0.3 + mod(row, 2.0) * 0.5) - 0.5);
    c *= 0.85 + 0.15 * smoothstep(0.44, 0.5, 0.5 - seam + 0.44);
    c = mix(c, vec3(0.94, 0.96, 0.98), uSnow * smoothstep(0.1, 0.6, n.y) * 0.9);
    return c;
  }
  // half-timbered plaster: dark beams and posts over lime-washed walls
  if (top) return base;
  float post = abs(fract(uv.x / 0.55) - 0.5) * 0.55;
  float beam = min(abs(p.y - 0.08), min(abs(p.y - 0.45), abs(p.y - 0.78)));
  float brace = abs(fract((uv.x + p.y) / 1.1) - 0.5) * 1.1;
  float wood = step(post, 0.045) + step(beam, 0.035) + step(brace, 0.03) * step(0.1, p.y) * step(p.y, 0.44);
  vec3 plaster = base * (0.94 + 0.08 * vnoise(uv * 9.0));
  return mix(plaster, vec3(0.24, 0.16, 0.1), clamp(wood, 0.0, 1.0));
}
`;
const surfCache = new Map();
export function surfaceMaterial(kind, color, { moss = 0, snow = 0, opts = {} } = {}) {
  const key = `${kind}|${color}|${moss}|${snow}`;
  if (kind !== 'roof' && surfCache.has(key)) return surfCache.get(key);
  const m = new THREE.MeshStandardMaterial({ color, roughness: kind === 'roof' ? 0.72 : 0.92, metalness: 0.0, flatShading: true, ...opts });
  const K = { stone: 0, roof: 1, plaster: 2 }[kind];
  m.userData.surf = { uKind: { value: K }, uMoss: { value: new THREE.Color('#4f6a36') }, uMossAmt: { value: moss }, uSnow: { value: snow } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, m.userData.surf);
    sh.vertexShader = sh.vertexShader.replace(SURF_VERT[0], SURF_VERT[1]).replace(SURF_VERT[2], SURF_VERT[3]);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + SURF_HEAD)
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = surfaceTint(diffuseColor.rgb);');
  };
  m.customProgramCacheKey = () => 'surf-v1';
  if (kind !== 'roof') surfCache.set(key, m);
  return m;
}
const WET = { north: 0.55, riverlands: 0.45, vale: 0.25, stormlands: 0.5, reach: 0.25, crownlands: 0.3, iron_islands: 0.35, westerlands: 0.2, wall: 0.2, beyond: 0.3, dorne: 0, essos: 0.1 };
const SNOWY = { wall: 1, beyond: 1, north: 0.35 };

const STONE = { north: '#a19f98', wall: '#8f9396', beyond: '#9a8f80', iron_islands: '#6f716e', riverlands: '#b3aa98', vale: '#d9d6cf', westerlands: '#c7a888', crownlands: '#c9b89c', reach: '#e1d7bf', stormlands: '#9f9a90', dorne: '#e3c890', essos: '#dccaa6' };

function seeded(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function hashId(id) { let h = 7; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }

class Kit {
  constructor() { this.parts = {}; }
  add(key, geom, x = 0, y = 0, z = 0, ry = 0, sx = 1, sy = 1, sz = 1) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(sx, sy, sz));
    const g = geom.clone(); g.applyMatrix4(m);
    (this.parts[key] = this.parts[key] || []).push(g.index ? g.toNonIndexed() : g);
  }
  tower(x, z, r, h, { roof = true, crenel = !roof, key = 'stone', roofH = null, segs = 8 } = {}) {
    this.add(key, G.cyl(segs), x, h / 2, z, 0, r, h, r);
    if (roof) this.add('roof', G.cone(segs), x, h + (roofH ?? r * 1.9) / 2, z, 0, r * 1.25, roofH ?? r * 1.9, r * 1.25);
    else if (crenel) { for (let i = 0; i < segs; i += 2) { const a = (i / segs) * Math.PI * 2; this.add(key, G.box, x + Math.cos(a) * r * 0.9, h + r * 0.18, z + Math.sin(a) * r * 0.9, -a, r * 0.35, r * 0.36, r * 0.35); } }
  }
  wall(x1, z1, x2, z2, h, t, key = 'stone') {
    const len = Math.hypot(x2 - x1, z2 - z1), a = Math.atan2(z2 - z1, x2 - x1);
    this.add(key, G.box, (x1 + x2) / 2, h / 2, (z1 + z2) / 2, -a, len, h, t);
    const n = Math.max(2, Math.floor(len / (t * 1.6)));
    for (let i = 0; i < n; i += 2) { const k = (i + 0.5) / n; this.add(key, G.box, x1 + (x2 - x1) * k, h + t * 0.25, z1 + (z2 - z1) * k, -a, len / n * 0.7, t * 0.5, t * 1.02); }
  }
  ring(cx, cz, r, n, h, towerR, towerH, rot = 0, key = 'stone', roofs = true) {
    const pts = [];
    for (let i = 0; i < n; i++) { const a = rot + (i / n) * Math.PI * 2; pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); }
    for (let i = 0; i < n; i++) { const [x1, z1] = pts[i], [x2, z2] = pts[(i + 1) % n]; this.wall(x1, z1, x2, z2, h, towerR * 0.7, key); }
    for (const [x, z] of pts) this.tower(x, z, towerR, towerH, { roof: roofs, key });
    return pts;
  }
  keep(x, z, w, d, h, { key = 'stone', roof = true, ry = 0 } = {}) {
    this.add(key, G.box, x, h / 2, z, ry, w, h, d);
    if (roof) this.add('roof', G.pyr, x, h + Math.min(w, d) * 0.45, z, ry + Math.PI / 4, w * 0.78, Math.min(w, d) * 0.9, d * 0.78);
    else for (let i = -1; i <= 1; i += 2) for (let j = -1; j <= 1; j += 2) this.add(key, G.box, x + i * w * 0.42, h + w * 0.1, z + j * d * 0.42, ry, w * 0.18, w * 0.25, d * 0.18);
  }
  house(x, z, s, ry, key = 'plaster') {
    this.add(key, G.box, x, s * 0.4, z, ry, s, s * 0.8, s * 0.75);
    this.add('roof', G.pyr, x, s * 0.8 + s * 0.28, z, ry + Math.PI / 4, s * 0.75, s * 0.56, s * 0.62);
  }
  dome(x, z, r, y = 0, key = 'white') { this.add(key, G.dome, x, y, z, 0, r, r, r); }
  build(materials, name) {
    const group = new THREE.Group(); group.name = name;
    for (const [key, geoms] of Object.entries(this.parts)) {
      const m = materials[key]; if (!m || !geoms.length) continue;
      const merged = mergeGeometries(geoms, false); merged.computeVertexNormals();
      const mesh = new THREE.Mesh(merged, m); mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.part = key;
      group.add(mesh);
    }
    return group;
  }
}

const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cylCache: {}, coneCache: {},
  cyl(seg = 8) { return this.cylCache[seg] || (this.cylCache[seg] = new THREE.CylinderGeometry(1, 1.06, 1, seg)); },
  cone(seg = 8) { return this.coneCache[seg] || (this.coneCache[seg] = new THREE.ConeGeometry(1, 1, seg)); },
  pyr: new THREE.ConeGeometry(1, 1, 4),
  dome: new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
  rock: new THREE.IcosahedronGeometry(1, 1),
};

export function tierOf(holding, house) {
  if (['baratheon', 'hightower', 'braavos', 'volantis', 'lannisport'].includes(holding.id)) return 6;
  if (holding.type === 'city') return 5;
  if (house?.rank === 'paramount' || house?.rank === 'crown') return 5;
  if (holding.type === 'great_castle') return 5;
  if (house?.rank === 'major' || holding.type === 'fortress') return 4;
  if (holding.type === 'town' || holding.type === 'palace') return 3;
  if (holding.type === 'camp' || holding.type === 'ruin') return 2;
  return 3;
}

/** Build a settlement model. Returns { group, anchorHeight, radius } in local units (origin = ground). */
// Roofs: towns and cities are roofed as their region builds (terracotta south, slate north); castles fly
// their lord's colours on their tower roofs, muted as paint and tile would mute them.
const REGION_ROOF = { north: '#5a5f66', wall: '#4e5358', beyond: '#6a5a48', iron_islands: '#43474b', riverlands: '#6e5442', vale: '#6c7079', westerlands: '#8c3d2c', crownlands: '#9a4a30', reach: '#a4553a', stormlands: '#51565d', dorne: '#b8764a', essos: '#b0683e' };
export function roofTone(holding, ownerColor) {
  const reg = REGION_ROOF[holding.region] || '#7a5a44';
  if (holding.type === 'city' || holding.type === 'town' || holding.type === 'palace') return reg;
  return '#' + new THREE.Color(ownerColor || reg).lerp(new THREE.Color(reg), 0.45).getHexString();
}
export function buildSettlement(holding, house, roofColor) {
  const kit = new Kit();
  const rng = seeded(hashId(holding.id));
  const tier = tierOf(holding, house);
  const stone = STONE[holding.region] || '#b8ae9c';
  const materials = {
    stone: surfaceMaterial('stone', stone, { moss: WET[holding.region] ?? 0.2, snow: SNOWY[holding.region] || 0 }),
    dark: surfaceMaterial('stone', '#4a4744', { moss: WET[holding.region] ?? 0.2 }), black: surfaceMaterial('stone', '#2e2c2a'),
    ruinstone: surfaceMaterial('stone', '#77716a', { moss: 0.7 }),
    roof: surfaceMaterial('roof', roofColor, { snow: SNOWY[holding.region] || 0 }),
    plaster: surfaceMaterial('plaster', '#d9ccb0'), wood: mat('#6b4a2e'), white: surfaceMaterial('stone', '#ece6d8'), gold: mat('#d8b24a', { metalness: 0.5, roughness: 0.4 }),
    red: surfaceMaterial('stone', '#a4503a', { moss: 0.1 }), ice: mat('#dff1fb', { roughness: 0.2, metalness: 0.1, emissive: '#2a4a5a', emissiveIntensity: 0.25 }),
    rock: mat('#7a6a5a'), glass: mat('#a8d8e8', { roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.8 }), water: mat('#3a7a9a', { roughness: 0.1 }),
    canvas: mat('#d8c8a0'), fire: mat('#ffb040', { emissive: '#ff8020', emissiveIntensity: 1.5 }),
  };
  let top = 6, radius = 6;
  const special = SPECIALS[holding.id];
  if (special) { const r = special(kit, rng, tier); top = r.top; radius = r.radius; }
  else {
    switch (holding.type) {
      case 'city': ({ top, radius } = city(kit, rng, tier)); break;
      case 'town': ({ top, radius } = town(kit, rng)); break;
      case 'camp': ({ top, radius } = camp(kit, rng)); break;
      case 'ruin': ({ top, radius } = ruin(kit, rng)); break;
      case 'fortress': ({ top, radius } = fortress(kit, rng)); break;
      case 'palace': ({ top, radius } = palace(kit, rng)); break;
      default: ({ top, radius } = castle(kit, rng, tier));
    }
  }
  const group = kit.build(materials, holding.id);
  return { group, top, radius, tier, materials };
}

function castle(kit, rng, tier) {
  const r = 1.6 + tier * 1.05;
  const n = tier >= 5 ? 6 + Math.floor(rng() * 3) : 4 + Math.floor(rng() * 2);
  const wallH = 1.0 + tier * 0.32, towerR = 0.38 + tier * 0.09, towerH = wallH * 1.55;
  const rot = rng() * Math.PI;
  kit.ring(0, 0, r, n, wallH, towerR, towerH, rot);
  const kh = 2.2 + tier * 0.9;
  kit.keep(0, 0, r * 0.55, r * 0.45, kh, { ry: rot });
  if (tier >= 4) kit.tower(r * 0.3, -r * 0.25, towerR * 1.3, kh * 1.35);
  if (tier >= 5) { kit.tower(-r * 0.35, r * 0.2, towerR * 1.1, kh * 1.1); for (let i = 0; i < 4; i++) { const a = rng() * 6.28, d = r * (0.5 + rng() * 0.3); kit.house(Math.cos(a) * d, Math.sin(a) * d, 0.8 + rng() * 0.4, rng() * 3); } }
  // a village outside the walls
  const vill = tier >= 4 ? 7 : tier >= 3 ? 4 : 2;
  for (let i = 0; i < vill; i++) { const a = rng() * 6.28, d = r * (1.35 + rng() * 0.8); kit.house(Math.cos(a) * d, Math.sin(a) * d, 0.7 + rng() * 0.5, rng() * 3); }
  return { top: kh * 1.35 + 2, radius: r * 1.9 };
}

function city(kit, rng, tier) {
  const r = 6 + (tier - 4) * 3.5;
  const n = 9;
  kit.ring(0, 0, r, n, 1.6, 0.6, 2.8, rng() * 3);
  const count = 40 + (tier - 4) * 45;
  for (let i = 0; i < count; i++) {
    const a = rng() * 6.28, d = Math.sqrt(rng()) * (r - 1.2);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (Math.hypot(x - r * 0.35, z + r * 0.3) < r * 0.3) continue;
    kit.house(x, z, 0.8 + rng() * 0.7, rng() * 3, rng() < 0.3 ? 'stone' : 'plaster');
  }
  // citadel
  kit.ring(r * 0.35, -r * 0.3, r * 0.26, 6, 2.2, 0.55, 3.4);
  kit.keep(r * 0.35, -r * 0.3, r * 0.2, r * 0.18, 5.2);
  kit.dome(-r * 0.25, r * 0.2, 1.4, 0.6, 'white');
  kit.add('white', G.box, -r * 0.25, 0.3, r * 0.2, 0, 2.6, 0.6, 2.6);
  // harbour quays outside the walls
  for (let i = 0; i < 6; i++) { const a = rng() * 6.28, d = r * (1.08 + rng() * 0.35); kit.house(Math.cos(a) * d, Math.sin(a) * d, 0.7 + rng() * 0.4, rng() * 3); }
  return { top: 9, radius: r * 1.3 };
}

function town(kit, rng) {
  for (let i = 0; i < 14; i++) { const a = rng() * 6.28, d = Math.sqrt(rng()) * 4.2; kit.house(Math.cos(a) * d, Math.sin(a) * d, 0.8 + rng() * 0.5, rng() * 3); }
  kit.tower(0.6, 0.4, 0.7, 4.2);
  const n = 10; for (let i = 0; i < n; i++) { const a = (i / n) * 6.28, b = ((i + 1) / n) * 6.28; kit.wall(Math.cos(a) * 5, Math.sin(a) * 5, Math.cos(b) * 5, Math.sin(b) * 5, 0.9, 0.25, 'wood'); }
  return { top: 6, radius: 6 };
}
function camp(kit, rng) {
  for (let i = 0; i < 16; i++) { const a = rng() * 6.28, d = 1 + rng() * 4.5; kit.add('canvas', G.cone(6), Math.cos(a) * d, 0.6, Math.sin(a) * d, rng() * 3, 0.7, 1.2, 0.7); }
  kit.add('fire', G.cone(5), 0, 0.3, 0, 0, 0.35, 0.6, 0.35);
  return { top: 3, radius: 6 };
}
function ruin(kit, rng) {
  for (let i = 0; i < 5; i++) { const a = rng() * 6.28, d = 1 + rng() * 3; kit.tower(Math.cos(a) * d, Math.sin(a) * d, 0.5 + rng() * 0.4, 1 + rng() * 3.5, { roof: false, crenel: false, key: 'dark' }); }
  kit.wall(-3, -2, 2, -3, 1, 0.4, 'dark');
  return { top: 5, radius: 5 };
}
function fortress(kit, rng) {
  kit.ring(0, 0, 4.2, 4, 2.4, 0.9, 3.6, Math.PI / 4, 'stone', false);
  kit.keep(0, 0, 3, 3, 6.5, { roof: false });
  return { top: 8, radius: 7 };
}
function palace(kit, rng) {
  kit.add('water', G.box, 0, 0.05, 0, 0, 7, 0.1, 4);
  for (let i = 0; i < 5; i++) kit.dome(-3 + i * 1.5, -3, 0.9, 1.4, 'plaster'), kit.add('plaster', G.box, -3 + i * 1.5, 0.7, -3, 0, 1.4, 1.4, 1.4);
  kit.tower(3.5, 2.5, 0.6, 4, { key: 'plaster' });
  return { top: 5, radius: 6 };
}

// ---------- unique landmarks ----------
const SPECIALS = {
  lannister(kit, rng) { // Casterly Rock
    kit.add('rock', G.rock, 0, 2, 0, 0.3, 11, 7, 7.5);
    kit.add('rock', G.rock, 5, 1, 3, 1.1, 6, 4.5, 5);
    kit.ring(0, 0, 4.5, 6, 1.6, 0.6, 2.6, 0.2);
    for (const [x, z] of [[0, 0], [2, -1.5], [-2.5, 1]]) { kit.tower(x, z, 0.8, 4.5); }
    kit.parts.roof && null;
    kit.keep(0.5, 0.5, 3, 2.4, 5);
    // lift everything above the rock
    for (const key of ['stone', 'roof']) (kit.parts[key] || []).forEach((g) => g.translate(0, 7.5, 0));
    return { top: 16, radius: 12 };
  },
  baratheon(kit, rng) { // King's Landing
    const r = 20; kit.ring(0, 0, r, 12, 2.2, 0.8, 3.6, 0.1);
    for (let i = 0; i < 260; i++) { const a = rng() * 6.28, d = Math.sqrt(rng()) * (r - 1.5); const x = Math.cos(a) * d, z = Math.sin(a) * d; if (Math.hypot(x - 8, z - 5) < 6.5 || Math.hypot(x + 6, z + 7) < 4.5 || Math.hypot(x + 3, z - 9) < 4.5) continue; kit.house(x, z, 0.9 + rng() * 0.8, rng() * 3, rng() < 0.25 ? 'stone' : 'plaster'); }
    // Red Keep on Aegon's High Hill
    kit.add('rock', G.rock, 8, -0.5, 5, 0, 7, 3, 6);
    const rk = new Kit(); rk.ring(0, 0, 4.8, 7, 2.6, 0.8, 4.6, 0.3, 'red'); rk.keep(0, 0, 3.2, 2.6, 7.5, { key: 'red' }); rk.tower(-1.5, 1.4, 0.9, 9.5, { key: 'red' });
    for (const [k, gs] of Object.entries(rk.parts)) gs.forEach((g) => { g.translate(8, 2.2, 5); (kit.parts[k] = kit.parts[k] || []).push(g); });
    // Great Sept of Baelor on Visenya's Hill
    kit.add('white', G.box, -6, 1.2, -7, 0, 6, 2.4, 6); kit.dome(-6, -7, 3.2, 2.4, 'white');
    for (let i = 0; i < 7; i++) { const a = (i / 7) * 6.28; kit.tower(-6 + Math.cos(a) * 3.6, -7 + Math.sin(a) * 3.6, 0.45, 6.5, { key: 'white', roofH: 1.6 }); }
    kit.add('gold', G.cone(8), -6, 6.2, -7, 0, 0.6, 1.4, 0.6);
    // Dragonpit on Rhaenys's Hill
    // Dragonpit on Rhaenys's Hill: a great weathered drum of stone, its dome fallen in
    kit.add('ruinstone', G.cyl(20), -3, 1.6, 9, 0, 4, 3.2, 4); kit.dome(-3, 9, 3.9, 3.0, 'ruinstone');
    for (let i = 0; i < 9; i++) { const a = rng() * 6.28, d = rng() * 2.2; kit.add('dark', G.box, -3 + Math.cos(a) * d, 6.6 + rng() * 0.4, 9 + Math.sin(a) * d, rng() * 3, 0.7 + rng(), 0.5, 0.5 + rng() * 0.6); }
    return { top: 18, radius: 26 };
  },
  hightower(kit, rng) { // Oldtown + the Hightower
    const r = 15; kit.ring(0, 0, r, 10, 1.8, 0.7, 3.2, 0.4);
    for (let i = 0; i < 160; i++) { const a = rng() * 6.28, d = Math.sqrt(rng()) * (r - 1.5); const x = Math.cos(a) * d, z = Math.sin(a) * d; if (Math.hypot(x - 11, z) < 5) continue; kit.house(x, z, 0.9 + rng() * 0.7, rng() * 3, rng() < 0.4 ? 'stone' : 'plaster'); }
    // the Citadel
    kit.ring(-4, 5, 4, 6, 2, 0.6, 3.4, 0, 'stone'); kit.keep(-4, 5, 3, 3, 5.5); kit.tower(-5.5, 3.5, 0.7, 8);
    // Battle Isle and the Hightower
    let y = 0; const tiers = [[3.4, 8], [2.9, 8], [2.4, 8], [2.0, 8], [1.6, 7], [1.2, 6]];
    for (const [rad, h] of tiers) { kit.add('stone', G.cyl(10), 12, y + h / 2, 0, 0, rad, h, rad); y += h; }
    kit.add('fire', G.cyl(8), 12, y + 1, 0, 0, 0.9, 2, 0.9);
    return { top: y + 5, radius: 22 };
  },
  baratheon_se(kit) { // Storm's End
    kit.ring(0, 0, 6.5, 12, 3, 0.7, 4, 0, 'stone', false);
    kit.add('stone', G.cyl(20), 0, 7, 0, 0, 4.2, 14, 4.2);
    for (let i = 0; i < 12; i++) { const a = (i / 12) * 6.28; kit.add('stone', G.box, Math.cos(a) * 4, 14.5, Math.sin(a) * 4, -a, 1, 1, 1); }
    return { top: 18, radius: 9 };
  },
  whent(kit) { // Harrenhal
    kit.ring(0, 0, 10, 5, 4.5, 1.2, 6, 0.2, 'black', false);
    const names = [[0, 0], [5, 3], [-5, 3], [3, -5], [-4, -4]];
    for (const [x, z] of names) { kit.tower(x, z, 2.2, 13 + (x + z) % 3, { roof: false, key: 'black' }); kit.add('dark', G.cone(8), x + 0.6, 13.5, z, 0.5, 1.5, 2, 1.5); }
    kit.keep(0, 0, 7, 5, 8, { key: 'black', roof: false });
    return { top: 18, radius: 14 };
  },
  arryn(kit) { // The Eyrie — slender white towers on a spire
    kit.add('rock', G.cyl(7), 0, 5, 0, 0, 3.5, 10, 3.5);
    for (const [x, z, h] of [[0, 0, 7], [1.8, 1, 6], [-1.6, 1.2, 5.5], [0.5, -1.9, 6.5], [-1.3, -1.4, 5], [2, -1, 5], [-2.2, -0.2, 4.5]]) kit.tower(x, z, 0.55, h, { key: 'white' });
    for (const key of ['white', 'roof']) (kit.parts[key] || []).forEach((g) => g.translate(0, 10, 0));
    return { top: 20, radius: 6 };
  },
  greyjoy(kit) { // Pyke — towers on sea stacks joined by bridges
    const stacks = [[0, 0, 4], [5, 2, 3], [-4, 3, 3], [2, -5, 2.5]];
    for (const [x, z, r] of stacks) { kit.add('rock', G.cyl(7), x, 2, z, 0.4, r, 6, r); kit.tower(x, z, r * 0.5, 6, { key: 'dark' }); }
    for (const g of kit.parts.dark || []) g.translate(0, 5, 0);
    for (const g of kit.parts.roof || []) g.translate(0, 5, 0);
    kit.wall(0, 0, 5, 2, 0.4, 0.6, 'wood'); kit.wall(0, 0, -4, 3, 0.4, 0.6, 'wood'); kit.wall(0, 0, 2, -5, 0.4, 0.6, 'wood');
    for (const g of kit.parts.wood) g.translate(0, 7, 0);
    return { top: 14, radius: 8 };
  },
  baratheon_ds(kit) { // Dragonstone
    kit.ring(0, 0, 6, 7, 2.6, 0.9, 4, 0.5, 'black');
    kit.keep(0, 0, 4, 3.5, 7, { key: 'black' });
    for (const [x, z] of [[2, 1], [-2, -1.5], [0.5, -2.5]]) kit.tower(x, z, 0.9, 9, { key: 'black', roofH: 3 });
    return { top: 13, radius: 9 };
  },
  stark(kit, rng) { // Winterfell — double curtain walls, towers, glass gardens
    kit.ring(0, 0, 8.5, 8, 2.2, 0.8, 3.4, 0.2, 'stone', false);
    kit.ring(0, 0, 6.2, 8, 3, 0.9, 4.6, 0.6, 'stone');
    kit.keep(0, -1, 3.5, 3, 6);
    kit.tower(2.5, 2, 1, 8.5, { roof: false }); // the First Keep
    kit.tower(-2.8, 1.5, 0.8, 7.5); // Broken Tower (with roof... it is not yet broken)
    kit.add('glass', G.box, -2, 0.8, -4, 0.2, 3, 1.6, 1.4);
    for (let i = 0; i < 10; i++) { const a = rng() * 6.28, d = 10 + rng() * 4; kit.house(Math.cos(a) * d, Math.sin(a) * d, 0.8, rng() * 3); }
    return { top: 12, radius: 14 };
  },
  frey(kit) { // The Twins
    for (const x of [-5, 5]) { kit.ring(x, 0, 3.2, 4, 2.4, 0.7, 3.5, Math.PI / 4); kit.keep(x, 0, 2.6, 2.6, 7.5, { roof: false }); }
    kit.wall(-3, 0, 3, 0, 1.2, 1.4, 'stone'); kit.tower(0, 0, 1.1, 4.5, { roof: false });
    return { top: 10, radius: 10 };
  },
  tully(kit) { // Riverrun — triangular castle between rivers
    kit.ring(0, 0, 6.5, 3, 2.6, 1, 4.4, -Math.PI / 2);
    kit.keep(0, 0, 3.4, 3, 6);
    kit.add('water', G.box, 0, 0.05, 5.5, 0, 16, 0.1, 1.2);
    return { top: 10, radius: 9 };
  },
  braavos(kit, rng) { // Braavos — city of canals and the Titan
    const r = 16; for (let i = 0; i < 220; i++) { const a = rng() * 6.28, d = Math.sqrt(rng()) * r; kit.house(Math.cos(a) * d, Math.sin(a) * d, 1 + rng() * 0.8, rng() * 3, rng() < 0.5 ? 'stone' : 'plaster'); }
    kit.dome(3, -3, 2.5, 1.5, 'white'); kit.add('white', G.box, 3, 0.75, -3, 0, 5, 1.5, 5);
    // the Titan: legs on two islands, torso, head, sword
    const tx = -18, tz = 6;
    kit.add('rock', G.cyl(6), tx - 2, 1, tz, 0, 2, 2, 2); kit.add('rock', G.cyl(6), tx + 2, 1, tz, 0, 2, 2, 2);
    kit.add('stone', G.box, tx - 1.6, 6, tz, 0, 1.2, 8, 1.2); kit.add('stone', G.box, tx + 1.6, 6, tz, 0, 1.2, 8, 1.2);
    kit.add('stone', G.box, tx, 12.5, tz, 0, 4.2, 5.5, 2); kit.add('stone', G.box, tx, 16.4, tz, 0, 1.6, 2.2, 1.6);
    kit.add('dark', G.box, tx + 3, 13, tz, 0, 0.6, 8, 0.4);
    return { top: 20, radius: 22 };
  },
  martell(kit, rng) { // Sunspear
    for (let i = 0; i < 60; i++) { const a = rng() * 6.28, d = 3 + Math.sqrt(rng()) * 7; kit.house(Math.cos(a) * d, Math.sin(a) * d, 0.9 + rng() * 0.5, rng() * 3, 'plaster'); }
    kit.ring(0, 0, 10.5, 10, 1.6, 0.55, 2.6, 0, 'plaster', false);
    kit.tower(0, 0, 1.6, 12, { key: 'plaster', roof: false }); kit.dome(0, 0, 1.8, 12, 'gold');
    kit.tower(3, 1.5, 1.1, 8, { key: 'plaster', roof: false }); kit.dome(3, 1.5, 1.2, 8, 'plaster');
    return { top: 16, radius: 13 };
  },
  nights_watch(kit, rng) { // Castle Black (unwalled, huddled at the foot of the Wall)
    for (const [x, z, w, d, h] of [[0, 3, 3, 2, 3.5], [3.5, 4, 2, 2, 2.5], [-3, 3.5, 2.4, 1.8, 3]]) kit.keep(x, z, w, d, h, { key: 'dark' });
    kit.tower(1.2, 6, 0.9, 6, { roof: false, key: 'dark' }); kit.tower(-4.5, 5.5, 0.7, 4, { key: 'dark' });
    for (let i = 0; i < 6; i++) kit.house(-6 + rng() * 12, 7 + rng() * 3, 0.9, rng() * 3, 'wood');
    return { top: 8, radius: 8 };
  },
  manderly(kit, rng) { // White Harbor — the white city
    const r = 9; kit.ring(0, 0, r, 9, 1.8, 0.6, 3, 0, 'white');
    for (let i = 0; i < 70; i++) { const a = rng() * 6.28, d = Math.sqrt(rng()) * (r - 1); kit.house(Math.cos(a) * d, Math.sin(a) * d, 0.9 + rng() * 0.5, rng() * 3, 'white'); }
    kit.keep(r * 0.4, 0, 3, 2.5, 6, { key: 'white' }); kit.dome(-2, 1, 1.3, 0.2, 'white');
    return { top: 9, radius: 12 };
  },
};

/** The Wall: a 700-foot cliff of ice following its polyline. */
export function buildWall(points, heightAt) {
  const geoms = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [x1, z1] = points[i], [x2, z2] = points[i + 1];
    const len = Math.hypot(x2 - x1, z2 - z1), a = Math.atan2(z2 - z1, x2 - x1);
    const steps = Math.ceil(len / 3);
    for (let s = 0; s < steps; s++) {
      const k0 = s / steps, k1 = (s + 1) / steps;
      const ax = x1 + (x2 - x1) * k0, az = z1 + (z2 - z1) * k0, bx = x1 + (x2 - x1) * k1, bz = z1 + (z2 - z1) * k1;
      const cx = (ax + bx) / 2, cz = (az + bz) / 2; const base = heightAt(cx, cz);
      const g = new THREE.BoxGeometry(Math.hypot(bx - ax, bz - az) + 0.6, 24, 3.6);
      g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(cx, base + 10, cz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -a, 0)), new THREE.Vector3(1, 1, 1)));
      geoms.push(g.toNonIndexed());
    }
  }
  const m = new THREE.Mesh(mergeGeometries(geoms), new THREE.MeshStandardMaterial({ color: '#dcefff', roughness: 0.25, metalness: 0.05, emissive: '#3a5f7a', emissiveIntensity: 0.35 }));
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

// ---------- banners ----------
// Banners are real cloth: a shared vertex shader ripples every banner in the wind, the wave growing
// towards the free end, with normals bent to match so the folds catch the light.
export const clothUniforms = { uTime: { value: 0 }, uWind: { value: 1 } };
const bannerTexCache = new Map();
export function bannerTexture(house) {
  const key = house.id + JSON.stringify(house.sigil);
  if (bannerTexCache.has(key)) return bannerTexCache.get(key);
  const c = document.createElement('canvas'); c.width = 128; c.height = 192;
  drawBanner(c.getContext('2d'), house.sigil, 128, 192);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  bannerTexCache.set(key, t); return t;
}
const CLOTH_WAVE = `
  float hang = clamp(-position.y / 1.5, 0.0, 1.0);
  float seedC = modelMatrix[3][0] * 0.131 + modelMatrix[3][2] * 0.071;
  float ph = uTime * 2.3 * uWind + position.x * 2.2 + position.y * 2.6 + seedC;
  float amp = (0.18 + hang * 0.9) * 0.16 * uWind;
  float wz = sin(ph) * amp + sin(ph * 2.1 + 1.3) * amp * 0.3;
  float dzdy = (cos(ph) * 2.6 + cos(ph * 2.1 + 1.3) * 0.63 * 2.6) * amp;
  float dzdx = (cos(ph) * 2.2 + cos(ph * 2.1 + 1.3) * 0.63 * 2.2) * amp;
`;
const clothMats = new Map();
function clothMaterial(map) {
  if (clothMats.has(map)) return clothMats.get(map);
  const m = new THREE.MeshStandardMaterial({ map, side: THREE.DoubleSide, roughness: 0.82, alphaTest: 0.4, emissive: '#ffffff', emissiveMap: map, emissiveIntensity: 0.22 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = clothUniforms.uTime; sh.uniforms.uWind = clothUniforms.uWind;
    sh.vertexShader = 'uniform float uTime;\nuniform float uWind;\n' + sh.vertexShader
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n${CLOTH_WAVE}\n  objectNormal = normalize(vec3(-dzdx, -dzdy, 1.0));`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n  transformed.z += wz;\n  transformed.x += sin(uTime * 1.1 + position.y * 1.8 + seedC) * 0.05 * hang * uWind;`);
  };
  m.customProgramCacheKey = () => 'cloth-v1';
  clothMats.set(map, m); return m;
}
// hangs from a crossbar: top edge at y=0, 1 wide, 1.5 long, finely divided so it can ripple
const bannerGeom = new THREE.PlaneGeometry(1, 1.5, 10, 14).translate(0, -0.75, 0);
const poleGeom = new THREE.CylinderGeometry(0.035, 0.045, 1, 6).translate(0, 0.5, 0);
const barGeom = new THREE.CylinderGeometry(0.03, 0.03, 1.16, 5).rotateZ(Math.PI / 2);
const finialGeom = new THREE.SphereGeometry(0.075, 8, 6);
export function buildBanner(house, size = 2.2, { lift = 0 } = {}) {
  // lift raises the cloth on a longer pole so it clears roofs below it
  const g = new THREE.Group();
  const wood = mat('#3a2a1a'); const gold = mat('#c9a24a', { metalness: 0.7, roughness: 0.35, flatShading: false });
  const pole = new THREE.Mesh(poleGeom, wood); pole.scale.set(size, size * 2.3 + lift, size); pole.position.y = -lift; g.add(pole);
  const bar = new THREE.Mesh(barGeom, wood); bar.scale.setScalar(size); bar.position.set(0, size * 2.18, 0.02 * size); g.add(bar);
  for (const d of [-1, 1]) { const f = new THREE.Mesh(finialGeom, gold); f.scale.setScalar(size); f.position.set(d * 0.58 * size, size * 2.18, 0.02 * size); g.add(f); }
  const top = new THREE.Mesh(finialGeom, gold); top.scale.setScalar(size * 1.3); top.position.y = size * 2.32; g.add(top);
  const flag = new THREE.Mesh(bannerGeom, clothMaterial(bannerTexture(house)));
  flag.scale.set(size, size, size); flag.position.set(0, size * 2.16, 0.05 * size); flag.userData.flag = true; flag.castShadow = true;
  g.add(flag);
  return g;
}

// ---------- armies & fleets ----------
// Soldiers and riders are split by material (surcoat, shield, steel, leather) so each part takes its
// own colour: house colours on the tabard, the sigil's field on the shield, steel helms and spearpoints.
const nx = (g) => (g.index ? g.toNonIndexed() : g);
const merge = (...gs) => mergeGeometries(gs.map(nx));
const FOOT = {
  tabard: merge(new THREE.CylinderGeometry(0.15, 0.2, 0.46, 7).translate(0, 0.52, 0), new THREE.BoxGeometry(0.44, 0.1, 0.2).translate(0, 0.72, 0)),
  shield: merge(new THREE.CylinderGeometry(0.19, 0.13, 0.04, 8, 1).rotateX(Math.PI / 2).scale(1, 1.35, 1).translate(-0.24, 0.52, 0.1)),
  steel: merge(new THREE.SphereGeometry(0.12, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.6).translate(0, 0.86, 0), new THREE.BoxGeometry(0.02, 0.1, 0.03).translate(0, 0.83, 0.12),
    new THREE.ConeGeometry(0.04, 0.16, 4).translate(0.22, 1.42, 0.02), new THREE.SphereGeometry(0.035, 5, 4).translate(-0.24, 0.52, 0.14)),
  dark: merge(new THREE.BoxGeometry(0.08, 0.32, 0.09).translate(-0.07, 0.16, 0), new THREE.BoxGeometry(0.08, 0.32, 0.09).translate(0.07, 0.16, 0),
    new THREE.CylinderGeometry(0.018, 0.018, 1.2, 4).translate(0.22, 0.76, 0.02), new THREE.SphereGeometry(0.085, 6, 5).translate(0, 0.8, 0.02)),
};
const HORSE = {
  hide: merge(new THREE.CapsuleGeometry(0.17, 0.55, 3, 8).rotateX(Math.PI / 2).translate(0, 0.62, 0),
    new THREE.CylinderGeometry(0.07, 0.1, 0.42, 6).rotateX(-0.75).translate(0, 0.86, 0.38), new THREE.BoxGeometry(0.1, 0.12, 0.26).rotateX(0.35).translate(0, 1.02, 0.56),
    ...[[-0.09, -0.25], [0.09, -0.25], [-0.09, 0.25], [0.09, 0.25]].map(([x, z]) => new THREE.CylinderGeometry(0.035, 0.03, 0.46, 5).translate(x, 0.23, z))),
  tabard: merge(new THREE.CylinderGeometry(0.2, 0.21, 0.26, 10, 1, true).rotateX(Math.PI / 2).scale(1.05, 1, 1).translate(0, 0.6, -0.05), // caparison
    new THREE.CylinderGeometry(0.11, 0.14, 0.38, 7).translate(0, 1.02, -0.05)), // rider
  steel: merge(new THREE.SphereGeometry(0.1, 8, 6).translate(0, 1.3, -0.05), new THREE.ConeGeometry(0.03, 0.14, 4).rotateX(Math.PI / 2).translate(0.16, 1.1, 1.22)),
  dark: merge(new THREE.CylinderGeometry(0.018, 0.022, 1.5, 4).rotateX(Math.PI / 2 - 0.12).translate(0.16, 1.04, 0.45)),
};
const shipGeom = (() => {
  const hull = new THREE.CylinderGeometry(0.5, 0.25, 3.2, 6, 1, false).rotateZ(Math.PI / 2).rotateY(Math.PI / 2).scale(1, 0.55, 1).translate(0, 0.25, 0);
  const deck = new THREE.BoxGeometry(0.8, 0.12, 2.6).translate(0, 0.5, 0);
  const mast = new THREE.CylinderGeometry(0.05, 0.05, 2.6, 5).translate(0, 1.8, 0);
  return mergeGeometries([hull.toNonIndexed(), deck.toNonIndexed(), mast.toNonIndexed()]);
})();
const sailGeom = new THREE.PlaneGeometry(1.6, 1.5, 3, 2).translate(0, 2.1, 0.05);

export function armyFigureCount(men) { return Math.max(1, Math.min(18, Math.round(Math.log2(Math.max(1, men) / 120) * 2.2))); }

export function buildArmy(army, house) {
  const g = new THREE.Group();
  const color = house?.color || '#888';
  if (army.type === 'fleet') {
    const n = Math.max(1, Math.min(7, Math.round(Math.log2((army.ships || 1) + 1) * 1.3)));
    const hullM = mat('#5a3a22'); const sailM = new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.9, flatShading: true });
    for (let i = 0; i < n; i++) {
      const s = new THREE.Group();
      const hull = new THREE.Mesh(shipGeom, hullM); hull.castShadow = true;
      const sail = new THREE.Mesh(sailGeom, sailM); sail.castShadow = true;
      s.add(hull, sail);
      const row = Math.floor(i / 3), col = i % 3;
      s.position.set((col - 1) * 1.8 + (row % 2) * 0.9, 0, row * 3.2 - 1);
      s.rotation.y = 0.15;
      g.add(s);
    }
    const b = buildBanner(house, 0.9); b.position.set(0, 2.4, -1); g.add(b); g.userData.banner = b;
    g.userData.kind = 'fleet';
    return g;
  }
  const n = armyFigureCount(army.men);
  const field = house?.sigil?.f || color, charge = house?.sigil?.cc || '#ddd';
  const M = {
    tabard: new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true }),
    shield: new THREE.MeshStandardMaterial({ color: field, roughness: 0.6, metalness: 0.1, flatShading: true, emissive: charge, emissiveIntensity: 0.06 }),
    steel: mat('#9aa0a6', { metalness: 0.65, roughness: 0.38 }),
    dark: mat('#3a2e24'),
    hide: mat('#4a3526'),
  };
  const cav = /horse|cavalry|screamer|rider|knight|khalasar|dothraki/i.test(army.composition || '') ? Math.ceil(n * 0.4) : Math.floor(n * 0.15);
  const foot = Math.max(1, n - cav);
  const meshes = [];
  const add = (geom, m, count) => { const im = new THREE.InstancedMesh(geom, m, count); im.castShadow = true; g.add(im); meshes.push(im); return im; };
  const F = Object.fromEntries(Object.entries(FOOT).map(([k, geom]) => [k, add(geom, M[k], foot)]));
  const Hs = cav ? Object.fromEntries(Object.entries(HORSE).map(([k, geom]) => [k, add(geom, M[k], cav)])) : null;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const rnd = seeded(hashId(army.id || 'army')); const tint = new THREE.Color();
  let si = 0, hi = 0;
  const cols = Math.ceil(Math.sqrt(n * 1.6));
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols), c = i % cols;
    const x = (c - (cols - 1) / 2) * 0.62 + (rnd() - 0.5) * 0.12, z = r * 0.75 - 0.4 + (rnd() - 0.5) * 0.12;
    q.setFromAxisAngle(v.set(0, 1, 0), (rnd() - 0.5) * 0.25);
    if (i < cav && Hs) { m4.compose(v.set(x * 1.3, 0, z - 1.2), q, one); for (const k in Hs) Hs[k].setMatrixAt(hi, m4); hi++; }
    else {
      m4.compose(v.set(x, 0, z), q, one);
      for (const k in F) F[k].setMatrixAt(si, m4);
      F.tabard.setColorAt(si, tint.set(color).offsetHSL(0, 0, (rnd() - 0.5) * 0.08));
      si++;
    }
  }
  for (const k in F) F[k].count = si;
  if (Hs) { for (const k in Hs) Hs[k].count = hi; }
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.12, 20), new THREE.MeshStandardMaterial({ color, roughness: 0.6, transparent: true, opacity: 0.55 }));
  const br = Math.max(1.4, cols * 0.42); base.scale.set(br, 1, br * 0.9); base.position.y = 0.06; g.add(base);
  const b = buildBanner(house, 0.8); b.position.set(-cols * 0.33 - 0.3, 0, -0.8); g.add(b); g.userData.banner = b;
  g.userData.kind = 'army';
  return g;
}

// ---------- trees (chunked instancing for frustum culling) ----------
export function buildForests({ W, H, scale, forest, land, northY = 900, snowY = 380 }, heightAt, tile = 200) {
  const conifer = mergeGeometries([new THREE.ConeGeometry(0.9, 2.4, 6).translate(0, 1.8, 0).toNonIndexed(), new THREE.CylinderGeometry(0.12, 0.15, 0.7, 5).translate(0, 0.35, 0).toNonIndexed()]);
  const leafy = mergeGeometries([new THREE.IcosahedronGeometry(0.95, 0).translate(0, 1.7, 0).toNonIndexed(), new THREE.CylinderGeometry(0.12, 0.16, 1, 5).translate(0, 0.5, 0).toNonIndexed()]);
  const matC = new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true });
  const group = new THREE.Group(); group.name = 'forests';
  const rng = seeded(1234);
  const tilesX = Math.ceil(W / scale / tile), tilesY = Math.ceil(H / scale / tile);
  const buckets = new Map();
  const step = 2.4;
  const col = new THREE.Color(); const m4 = new THREE.Matrix4(); const q = new THREE.Quaternion(); const up = new THREE.Vector3(0, 1, 0);
  for (let y = 0; y < H / scale; y += step) for (let x = 0; x < W / scale; x += step) {
    const jx = x + (rng() - 0.5) * step, jy = y + (rng() - 0.5) * step;
    const px = Math.floor(jx * scale), py = Math.floor(jy * scale); if (px < 0 || py < 0 || px >= W || py >= H) continue;
    const i = py * W + px; if (!land[i]) continue;
    const f = forest[i] / 255; if (f < 0.25 || rng() > f * 0.85) continue;
    const north = jy < northY; const type = north || rng() < 0.25 ? 0 : 1;
    const key = `${Math.floor(jx / tile)},${Math.floor(jy / tile)},${type}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push([jx, jy, 0.7 + rng() * 0.6, rng() * 6.28, north, jy < snowY - rng() * 80]);
  }
  for (const [key, list] of buckets) {
    const type = Number(key.split(',')[2]);
    const im = new THREE.InstancedMesh(type === 0 ? conifer : leafy, matC, list.length);
    list.forEach(([x, z, s, r, north, snowy], k) => {
      q.setFromAxisAngle(up, r);
      m4.compose(new THREE.Vector3(x, heightAt(x, z), z), q, new THREE.Vector3(s, s * (0.9 + (k % 7) * 0.05), s));
      im.setMatrixAt(k, m4);
      if (snowy) col.setRGB(0.78, 0.84, 0.86); else if (type === 0) col.setRGB(0.16 + (k % 5) * 0.012, 0.27 + (k % 3) * 0.02, 0.2); else col.setRGB(0.22 + (k % 5) * 0.015, 0.36 + (k % 4) * 0.02, 0.16);
      im.setColorAt(k, col);
    });
    im.castShadow = true; im.receiveShadow = false;
    im.computeBoundingSphere();
    group.add(im);
  }
  return group;
}
