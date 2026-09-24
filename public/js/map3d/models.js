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
export function buildSettlement(holding, house, roofColor) {
  const kit = new Kit();
  const rng = seeded(hashId(holding.id));
  const tier = tierOf(holding, house);
  const stone = STONE[holding.region] || '#b8ae9c';
  const materials = {
    stone: mat(stone), dark: mat('#4a4744'), black: mat('#2a2826'), roof: new THREE.MeshStandardMaterial({ color: roofColor, roughness: 0.7, flatShading: true }),
    plaster: mat('#d9ccb0'), wood: mat('#6b4a2e'), white: mat('#f0ece2'), gold: mat('#d8b24a', { metalness: 0.5, roughness: 0.4 }),
    red: mat('#9c4636'), ice: mat('#dff1fb', { roughness: 0.2, metalness: 0.1, emissive: '#2a4a5a', emissiveIntensity: 0.25 }),
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
    kit.add('dark', G.cyl(16), -3, 1.6, 9, 0, 4, 3.2, 4); kit.dome(-3, 9, 4, 3.2, 'dark');
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
const bannerTexCache = new Map();
export function bannerTexture(house) {
  const key = house.id + JSON.stringify(house.sigil);
  if (bannerTexCache.has(key)) return bannerTexCache.get(key);
  const c = document.createElement('canvas'); c.width = 64; c.height = 96;
  drawBanner(c.getContext('2d'), house.sigil, 64, 96);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  bannerTexCache.set(key, t); return t;
}
const bannerGeom = new THREE.PlaneGeometry(1, 1.5, 4, 1).translate(0.5, -0.75, 0);
const poleGeom = new THREE.CylinderGeometry(0.05, 0.05, 1, 5).translate(0, 0.5, 0);
export function buildBanner(house, size = 2.2) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(poleGeom, mat('#3a2a1a')); pole.scale.set(size, size * 2.2, size); g.add(pole);
  const flag = new THREE.Mesh(bannerGeom, new THREE.MeshStandardMaterial({ map: bannerTexture(house), side: THREE.DoubleSide, roughness: 0.9, transparent: true, alphaTest: 0.3 }));
  flag.scale.set(size, size, size); flag.position.set(0.05 * size, size * 2.15, 0); flag.userData.flag = true; flag.castShadow = true;
  g.add(flag);
  return g;
}

// ---------- armies & fleets ----------
const soldierGeom = (() => {
  const body = new THREE.BoxGeometry(0.38, 0.62, 0.26).translate(0, 0.31, 0);
  const head = new THREE.SphereGeometry(0.14, 6, 4).translate(0, 0.76, 0);
  const spear = new THREE.BoxGeometry(0.04, 1.3, 0.04).translate(0.22, 0.6, 0);
  return mergeGeometries([body.toNonIndexed(), head.toNonIndexed(), spear.toNonIndexed()]);
})();
const horseGeom = (() => {
  const b = new THREE.BoxGeometry(0.3, 0.35, 0.9).translate(0, 0.55, 0);
  const n = new THREE.BoxGeometry(0.2, 0.4, 0.25).translate(0, 0.82, 0.45);
  const legs = [[-0.1, -0.3], [0.1, -0.3], [-0.1, 0.3], [0.1, 0.3]].map(([x, z]) => new THREE.BoxGeometry(0.08, 0.4, 0.08).translate(x, 0.2, z).toNonIndexed());
  const rider = new THREE.BoxGeometry(0.28, 0.45, 0.2).translate(0, 0.95, 0);
  const lance = new THREE.BoxGeometry(0.03, 0.03, 1.6).translate(0.15, 1.0, 0.5);
  return mergeGeometries([b.toNonIndexed(), n.toNonIndexed(), ...legs, rider.toNonIndexed(), lance.toNonIndexed()]);
})();
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
    const b = buildBanner(house, 0.9); b.position.set(0, 2.4, -1); g.add(b);
    g.userData.kind = 'fleet';
    return g;
  }
  const n = armyFigureCount(army.men);
  const bodyM = new THREE.MeshStandardMaterial({ color, roughness: 0.8, flatShading: true });
  const steelM = mat('#8a8e92', { metalness: 0.4, roughness: 0.5 });
  const cav = /horse|cavalry|screamer|rider|knight/i.test(army.composition || '') ? Math.ceil(n * 0.4) : Math.floor(n * 0.15);
  const soldiers = new THREE.InstancedMesh(soldierGeom, bodyM, Math.max(1, n - cav));
  const horses = cav ? new THREE.InstancedMesh(horseGeom, steelM, cav) : null;
  const m4 = new THREE.Matrix4(); let si = 0, hi = 0;
  const cols = Math.ceil(Math.sqrt(n * 1.6));
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols), c = i % cols;
    const x = (c - (cols - 1) / 2) * 0.62, z = r * 0.75 - 0.4;
    if (i < cav && horses) { m4.makeTranslation(x * 1.3, 0, z - 1.2); horses.setMatrixAt(hi++, m4); }
    else { m4.makeTranslation(x, 0, z); soldiers.setMatrixAt(si++, m4); }
  }
  soldiers.count = si; soldiers.castShadow = true; g.add(soldiers);
  if (horses) { horses.count = hi; horses.castShadow = true; g.add(horses); }
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.12, 20), new THREE.MeshStandardMaterial({ color, roughness: 0.6, transparent: true, opacity: 0.55 }));
  const br = Math.max(1.4, cols * 0.42); base.scale.set(br, 1, br * 0.9); base.position.y = 0.06; g.add(base);
  const b = buildBanner(house, 0.8); b.position.set(-cols * 0.33 - 0.3, 0, -0.8); g.add(b);
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
