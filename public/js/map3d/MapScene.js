// The 3D tabletop map (three.js): relief terrain, animated water, political overlay with your realm
// glowing, instanced forests, procedural castles & cities, the Wall, banners, armies with march routes.
import * as THREE from 'three';
import { WORLD, WALL, LABELS, RIVERS, ROADS, JUNCTIONS, PLACE_NAMES, PLACE_KIND } from '../../data/geography.js';
import { realmOf, getRelation, resolvePlaceId, fmt } from '../shared/world.js';
import { buildSettlement, buildWall, buildBanner, buildArmy, buildForests, bannerTexture, tierOf, armyFigureCount, clothUniforms, roofTone } from './models.js';
import { PathGrid, pathLength, pointAlong } from './pathfind.js';
import { makeNoise } from '../map/noise.js';

const GEN_VERSION = 'atlas-v3';
// Graphics quality (Settings): terrain mesh density, pixel ratio and shadows
const QUALITY = { high: { seg: 960, dpr: 2, shadows: true }, balanced: { seg: 720, dpr: 1.5, shadows: true }, fast: { seg: 480, dpr: 1, shadows: false } };
export const gfx = () => { try { return QUALITY[localStorage.getItem('gfx-quality')] || QUALITY.balanced; } catch { return QUALITY.balanced; } };
const LAND_Y = 55, SEA_Y = 7, WATER_LEVEL = 0.35;

function idb() { return new Promise((res, rej) => { const r = indexedDB.open('westeros-cache', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function cacheGet(key) { try { const db = await idb(); return await new Promise((res) => { const q = db.transaction('kv').objectStore('kv').get(key); q.onsuccess = () => res(q.result); q.onerror = () => res(null); }); } catch { return null; } }
async function cacheSet(key, val) { try { const db = await idb(); await new Promise((res) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').clear(); t.objectStore('kv').put(val, key); t.oncomplete = res; t.onerror = res; }); } catch { /* */ } }
const hexToRgb = (hex) => { let h = String(hex || '#888').replace('#', ''); if (h.length === 3) h = h.split('').map((c) => c + c).join(''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class MapScene {
  constructor(container, handlers = {}) {
    this.container = container; this.h = handlers;
    this.mode = 'political'; this.selected = null; this.selectedArmy = null; this.state = null;
    this.target = new THREE.Vector3(520, 0, 1000); this.dist = 900; this.goal = null;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(gfx().dpr, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = gfx().shadows; this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.className = 'map-canvas';
    this.labelLayer = document.createElement('div'); this.labelLayer.className = 'map-labels'; container.appendChild(this.labelLayer);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0c1824');
    this.scene.fog = new THREE.Fog('#0c1824', 2000, 5000);
    this.camera = new THREE.PerspectiveCamera(34, 1, 1, 12000);
    this.hemi = new THREE.HemisphereLight('#e6eef5', '#4a3e30', 1.15); this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff0d8', 2.4);
    this.sun.castShadow = true; this.sun.shadow.mapSize.set(2048, 2048); this.sun.shadow.bias = -0.0006; this.sun.shadow.normalBias = 0.6;
    this.scene.add(this.sun, this.sun.target);
    this.t0 = performance.now(); this.tPrev = this.t0;
    this.labels = []; this.armyObjs = new Map(); this.settlements = new Map(); this.eventPins = [];
    this.bindInput();
    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ───────────── generation ─────────────
  async generate(holdings, onProgress) {
    this.seeds = Object.values(holdings).filter((h) => !h.founded).map((h) => ({ id: h.id, x: h.pos[0], y: h.pos[1], w: h.type === 'great_castle' || h.type === 'city' ? 1.35 : h.type === 'camp' || h.type === 'ruin' ? 0.7 : 1 }));
    // Landmarks the atlas cannot draw: the Giant's Lance under the Eyrie, Dragonmont smoking over Dragonstone
    const at = (id) => holdings[id]?.pos;
    const features = [
      at('arryn') && { type: 'peak', x: at('arryn')[0] + 4, y: at('arryn')[1] + 3, r: 24, h: 1.45 },
      at('baratheon_ds') && { type: 'volcano', x: at('baratheon_ds')[0] + 3, y: at('baratheon_ds')[1] - 2, r: 9, h: 0.6 },
      at('lannister') && { type: 'peak', x: at('lannister')[0] - 1, y: at('lannister')[1] - 1, r: 5, h: 0.22 },
    ].filter(Boolean);
    const key = GEN_VERSION + ':' + this.seeds.map((s) => s.id + s.x + s.y).join('|') + JSON.stringify(features);
    let data = await cacheGet(key);
    if (!data) {
      data = await new Promise((resolve, reject) => {
        const w = new Worker(new URL('../map/terrain.worker.js', import.meta.url), { type: 'module' });
        w.onmessage = (e) => { if (e.data.type === 'progress') onProgress?.(e.data.p * 0.8, e.data.msg); else if (e.data.type === 'done') { w.terminate(); resolve(e.data); } };
        w.onerror = (e) => reject(new Error('Terrain worker failed: ' + (e.message || 'unknown')));
        w.postMessage({ scale: 1, seeds: this.seeds, heightScale: LAND_Y, features });
      });
      cacheSet(key, data);
    }
    Object.assign(this, { W: data.W, H: data.H, scale: data.scale, province: data.province, land: data.land, heightF: data.height, forestMask: data.forest, depthMask: data.depth });
    onProgress?.(0.82, 'Raising the mountains');
    await tick();
    this.buildTerrain(data);
    this.buildWater(data);
    onProgress?.(0.88, 'Planting the forests');
    await tick();
    this.forests = buildForests({ W: data.W, H: data.H, scale: data.scale, forest: data.forest, land: data.land, northY: 1180, snowY: 640 }, (x, z) => this.heightAt(x, z));
    this.scene.add(this.forests);
    this.wallMesh = buildWall(WALL, (x, z) => this.heightAt(x, z)); this.scene.add(this.wallMesh);
    this.buildRivers();
    onProgress?.(0.94, 'Charting roads');
    this.grid = new PathGrid({ W: data.W, H: data.H, scale: data.scale, land: data.land, height: data.height });
    this.provinceStats();
    this.buildSeaLabels();
    onProgress?.(1, 'Ready');
  }

  heightAt(x, z) {
    if (!this.heightF) return 0;
    const px = clamp(x * this.scale, 0, this.W - 1.001), py = clamp(z * this.scale, 0, this.H - 1.001);
    const x0 = px | 0, y0 = py | 0, tx = px - x0, ty = py - y0, i = y0 * this.W + x0, H = this.heightF;
    const h = (H[i] * (1 - tx) + H[i + 1] * tx) * (1 - ty) + (H[i + this.W] * (1 - tx) + H[i + this.W + 1] * tx) * ty;
    return h > 0 ? h * LAND_Y + WATER_LEVEL + 0.1 : h * SEA_Y;
  }
  groundAt(x, z) { return Math.max(WATER_LEVEL, this.heightAt(x, z)); }

  buildTerrain(data) {
    const segX = gfx().seg, segY = Math.round(segX * WORLD.h / WORLD.w);
    const geo = new THREE.PlaneGeometry(WORLD.w, WORLD.h, segX, segY);
    geo.rotateX(-Math.PI / 2); geo.translate(WORLD.w / 2, 0, WORLD.h / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, this.heightAt(pos.getX(i), pos.getZ(i)));
    geo.computeVertexNormals();
    const cv = document.createElement('canvas'); cv.width = data.W; cv.height = data.H;
    cv.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(data.rgba), data.W, data.H), 0, 0);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy(); tex.generateMipmaps = true;
    // per-pixel relief: an object-space normal map from the full-resolution heights (crisp ridges on a lighter mesh)
    const nmap = new THREE.DataTexture(new Uint8Array(data.normal.buffer || data.normal), data.W, data.H, THREE.RGBAFormat, THREE.UnsignedByteType);
    nmap.flipY = true; nmap.magFilter = THREE.LinearFilter; nmap.minFilter = THREE.LinearMipmapLinearFilter; nmap.generateMipmaps = true; nmap.anisotropy = tex.anisotropy; nmap.needsUpdate = true;
    this.overlayCanvas = document.createElement('canvas'); this.overlayCanvas.width = data.W; this.overlayCanvas.height = data.H;
    this.hlCanvas = document.createElement('canvas'); this.hlCanvas.width = data.W; this.hlCanvas.height = data.H;
    this.overlayTex = new THREE.CanvasTexture(this.overlayCanvas); this.overlayTex.colorSpace = THREE.SRGBColorSpace;
    this.hlTex = new THREE.CanvasTexture(this.hlCanvas);
    const uniforms = this.terrainUniforms = { uOverlay: { value: this.overlayTex }, uHL: { value: this.hlTex }, uStrength: { value: 0.6 }, uTime: { value: 0 } };
    const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.94, metalness: 0, normalMap: nmap, normalMapType: THREE.ObjectSpaceNormalMap });
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uniforms);
      sh.vertexShader = 'varying vec3 vWPos;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = `uniform sampler2D uOverlay; uniform sampler2D uHL; uniform float uStrength; uniform float uTime; varying vec3 vWPos;
        float dh(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float dn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(dh(i),dh(i+vec2(1,0)),f.x), mix(dh(i+vec2(0,1)),dh(i+vec2(1,1)),f.x), f.y); }
` + sh.fragmentShader
        .replace('#include <map_fragment>', `#include <map_fragment>
          // close-up detail so the land never looks like a stretched picture
          float near = 1.0 - smoothstep(60.0, 420.0, length(cameraPosition - vWPos));
          float det = dn(vWPos.xz * 1.7) * 0.55 + dn(vWPos.xz * 5.3) * 0.3 + dn(vWPos.xz * 13.0) * 0.15;
          diffuseColor.rgb *= 1.0 + (det - 0.5) * 0.22 * near;
          float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
          diffuseColor.rgb = clamp(mix(vec3(lum), diffuseColor.rgb, 1.2) * vec3(1.03, 1.0, 0.96), 0.0, 1.0);
          vec4 ov = texture2D(uOverlay, vMapUv);
          diffuseColor.rgb = mix(diffuseColor.rgb, ov.rgb, ov.a * uStrength);
          vec4 hl = texture2D(uHL, vMapUv);
          float pulse = 0.7 + 0.3 * sin(uTime * 2.4);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 1.0, 0.42), clamp(hl.r * pulse, 0.0, 1.0) * 0.85);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.22, 0.12), hl.g * 0.85);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.93, 0.62), hl.b * 0.55);
          // the shadows of high clouds drift slowly across the land
          vec2 cq = vWPos.xz * 0.0035 + vec2(uTime * 0.0045, uTime * 0.002);
          float cloud = dn(cq) * 0.6 + dn(cq * 2.3 + 7.0) * 0.3 + dn(cq * 5.1 - 3.0) * 0.1;
          diffuseColor.rgb *= 1.0 - 0.2 * smoothstep(0.52, 0.72, cloud);`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          totalEmissiveRadiance += vec3(0.35, 0.8, 0.25) * hl.r * pulse * 0.55 + vec3(0.8, 0.12, 0.05) * hl.g * 0.35 + vec3(0.5, 0.45, 0.25) * hl.b * 0.25;`);
    };
    this.terrain = new THREE.Mesh(geo, m); this.terrain.receiveShadow = true;
    this.scene.add(this.terrain);
  }

  buildWater(data) {
    const dtex = new THREE.DataTexture(data.depth, data.W, data.H, THREE.RedFormat, THREE.UnsignedByteType);
    dtex.flipY = true; dtex.magFilter = THREE.LinearFilter; dtex.minFilter = THREE.LinearFilter; dtex.needsUpdate = true;
    const geo = new THREE.PlaneGeometry(WORLD.w + 6000, WORLD.h + 6000, 1, 1); geo.rotateX(-Math.PI / 2); geo.translate(WORLD.w / 2, WATER_LEVEL, WORLD.h / 2);
    this.waterUniforms = { uTime: { value: 0 }, uDepth: { value: dtex }, uSun: { value: new THREE.Vector3(-0.45, 0.8, -0.4).normalize() }, uCam: { value: new THREE.Vector3() }, fogColor: { value: new THREE.Color('#0c1824') }, fogNear: { value: 2000 }, fogFar: { value: 5000 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.waterUniforms, transparent: true, fog: true,
      vertexShader: `varying vec3 vW; varying float vFogDepth; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vec4 mv = viewMatrix * w; vFogDepth = -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float uTime; uniform sampler2D uDepth; uniform vec3 uSun; uniform vec3 uCam; uniform vec3 fogColor; uniform float fogNear; uniform float fogFar; varying vec3 vW; varying float vFogDepth;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
        void main(){
          vec2 uv = vec2(vW.x / ${WORLD.w.toFixed(1)}, 1.0 - vW.z / ${WORLD.h.toFixed(1)});
          float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
          float d = mix(1.0, texture2D(uDepth, uv).r, inside);
          vec3 shallow = vec3(0.23, 0.46, 0.52), mid = vec3(0.1, 0.27, 0.38), deep = vec3(0.04, 0.12, 0.2);
          vec3 col = d < 0.12 ? mix(shallow, mid, d / 0.12) : mix(mid, deep, clamp((d - 0.12) / 0.5, 0.0, 1.0));
          float north = smoothstep(760.0, 380.0, vW.z); col = mix(col, vec3(0.52, 0.62, 0.68), north * 0.55);
          vec2 p = vW.xz * 0.06;
          float t = uTime * 0.35;
          float nx = n(p + vec2(t, t*0.7)) - n(p * 1.7 - vec2(t*0.8, -t*0.4) + 10.0);
          float nz = n(p * 1.3 + vec2(-t*0.6, t)) - n(p * 2.1 + vec2(t*0.5, t*0.3) + 33.0);
          float farK = 1.0 - smoothstep(120.0, 900.0, vFogDepth);
          vec3 N = normalize(vec3(nx * 0.18 * farK, 1.0, nz * 0.18 * farK));
          vec3 V = normalize(uCam - vW);
          vec3 R = reflect(-uSun, N);
          float spec = pow(max(dot(R, V), 0.0), 180.0) * 0.35;
          float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
          col += spec * farK * vec3(1.0, 0.92, 0.75) + fres * farK * vec3(0.05, 0.08, 0.1);
          float foam = smoothstep(0.035, 0.0, d) * (0.55 + 0.45 * sin(uTime * 1.6 + vW.x * 0.3 + vW.z * 0.25));
          col = mix(col, vec3(0.82, 0.88, 0.92), foam * 0.3 * inside);
          float alpha = mix(0.8, 0.97, smoothstep(0.0, 0.2, d));
          float fogF = smoothstep(fogNear, fogFar, vFogDepth);
          gl_FragColor = vec4(mix(col, fogColor, fogF), alpha);
          #include <colorspace_fragment>
        }`,
    });
    this.water = new THREE.Mesh(geo, mat); this.water.renderOrder = 1;
    this.scene.add(this.water);
  }

  buildRivers() {
    // rivers are painted into the land itself (and carved into it); only the roads are ribbons
    // roads: dusty tracks along the atlas roads (the Kingsroad, the Roseroad, the Goldroad…)
    this.roadMat = new THREE.MeshStandardMaterial({ color: '#8a6a44', roughness: 1, transparent: true, opacity: 0.85 });
    this.roadGroup = new THREE.Group();
    for (const road of ROADS) this.roadGroup.add(this.ribbon(catmull(road.pts, 3), road.name ? 0.7 : 0.5, this.roadMat, 0.15));
    this.scene.add(this.roadGroup);
  }

  drawRoads() {}

  ribbon(pts, width, material, lift = 0.3, water = false) {
    const verts = [], idx = [], uvs = []; let acc = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      let nx = -(b[1] - a[1]), ny = b[0] - a[0]; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
      if (i) acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      const w = typeof width === 'function' ? width(i, pts.length) : width;
      const [x, z] = pts[i]; const y = (water ? Math.max(WATER_LEVEL + 0.05, this.heightAt(x, z)) : this.groundAt(x, z)) + lift;
      verts.push(x + nx * w, y, z + ny * w, x - nx * w, y, z - ny * w); uvs.push(acc, 0, acc, 1);
      if (i) { const k = (i - 1) * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, material); m.receiveShadow = true; return m;
  }

  provinceStats() {
    const n = this.seeds.length, sx = new Float64Array(n), sy = new Float64Array(n), cnt = new Uint32Array(n);
    const { W, H, province } = this;
    for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) { const k = province[y * W + x]; if (k >= 0) { sx[k] += x; sy[k] += y; cnt[k]++; } }
    this.provStats = this.seeds.map((s, k) => ({ cx: cnt[k] ? sx[k] / cnt[k] / this.scale : s.x, cy: cnt[k] ? sy[k] / cnt[k] / this.scale : s.y, area: cnt[k] * 4 }));
    this.seedIndex = new Map(this.seeds.map((s, k) => [s.id, k]));
  }

  // ───────────── state sync ─────────────
  setState(state) {
    const first = !this.state;
    const prev = this.state;
    this.state = state;
    this.recolor();
    this.syncSettlements();
    if (this.provDirty) { this.provDirty = false; this.recolor(); }
    this.syncArmies(prev);
    this.syncEventPins();
    this.syncLandmarks();
    if (first) this.buildPlaces();
    if (first) {
      this.drawRoads();
      const seat = state.holdings[state.houses[state.meta.player]?.seat];
      const p = seat?.pos || [500, 1000];
      this.target.set(p[0], 0, p[1]); this.dist = 520;
    }
  }
  setMode(m) { this.mode = m; this.recolor(); }

  colorFor(holdingId) {
    const s = this.state; const hd = s.holdings[holdingId]; if (!hd) return [128, 128, 128];
    const p = s.meta.player;
    switch (this.mode) {
      case 'houses': return hexToRgb(s.houses[hd.owner]?.color);
      case 'diplomacy': {
        const realm = realmOf(s, hd.owner), mine = realmOf(s, p);
        if (hd.owner === p) return [80, 200, 90];
        if (s.houses[hd.owner]?.liege === p || (realm === mine && realm === p)) return [120, 210, 140];
        if (this.atWarWith(hd.owner)) return [210, 50, 40];
        if (s.pacts.some((x) => x.status === 'active' && x.type === 'alliance' && [x.a, x.b].includes(p) && [x.a, x.b].includes(realm))) return [70, 130, 220];
        const r = getRelation(s, p, hd.owner) || getRelation(s, p, realm);
        return r >= 0 ? [Math.round(200 - r * 1.2), 200, Math.round(130 - r * 0.4)] : [225, Math.round(200 + r * 1.3), Math.round(130 + r * 0.8)];
      }
      case 'unrest': { const u = hd.unrest / 100; return [Math.round(90 + 165 * u), Math.round(180 - 140 * u), 60]; }
      case 'prosperity': { const u = hd.prosperity / 100; return [Math.round(210 - 150 * u), Math.round(110 + 110 * u), 60]; }
      case 'economy': { const tot = Object.values(hd.resources || {}).reduce((a, b) => a + b, 0) * Math.sqrt(hd.population / 10000); const u = clamp(tot / 25, 0, 1); return [Math.round(60 + 190 * u), Math.round(60 + 150 * u), Math.round(40 + 30 * u)]; }
      default: return hexToRgb(s.houses[realmOf(s, hd.owner)]?.color);
    }
  }
  atWarWith(houseId) {
    const s = this.state, p = s.meta.player, realm = realmOf(s, houseId);
    return s.wars.some((w) => w.status !== 'ended' && ((w.attackers.includes(p) && (w.defenders.includes(houseId) || w.defenders.includes(realm))) || (w.defenders.includes(p) && (w.attackers.includes(houseId) || w.attackers.includes(realm)))));
  }

  recolor() {
    if (!this.province || !this.state) return;
    const { W, H, province } = this; const s = this.state; const n = this.seeds.length;
    const pal = new Uint8Array(n * 3), realmIdx = new Int32Array(n), ownerIdx = new Int32Array(n), mine = new Uint8Array(n), enemy = new Uint8Array(n);
    const ids = new Map(); const id = (k) => { if (!ids.has(k)) ids.set(k, ids.size); return ids.get(k); };
    const myRealm = realmOf(s, s.meta.player);
    const playerTop = s.houses[s.meta.player];
    for (let k = 0; k < n; k++) {
      const hid = this.seeds[k].id; const c = this.colorFor(hid); pal.set(c, k * 3);
      const owner = s.holdings[hid]?.owner; const r = realmOf(s, owner);
      realmIdx[k] = id('r:' + r); ownerIdx[k] = id('o:' + owner);
      // "your realm": you and everyone sworn (directly or not) to you; if you are a vassal, your own lands
      let x = s.houses[owner], g = 0, isMine = owner === s.meta.player;
      while (!isMine && x?.liege && g++ < 8) { if (x.liege === s.meta.player) isMine = true; x = s.houses[x.liege]; }
      mine[k] = isMine ? 1 : 0; enemy[k] = this.atWarWith(owner) ? 1 : 0;
    }
    const ov = this.overlayCanvas.getContext('2d'); const img = ov.createImageData(W, H); const d = img.data;
    const hl = this.hlCanvas.getContext('2d'); const himg = hl.createImageData(W, H); const hd = himg.data;
    const fillA = this.mode === 'terrain' ? 0 : this.mode === 'political' ? 125 : 180;
    const selK = this.selected ? this.seedIndex.get(this.selected) : -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, k = province[i]; if (k < 0) continue;
      const o = i * 4;
      let border = 0, mineEdge = 0, enemyEdge = 0;
      for (const j of [x < W - 1 ? i + 1 : i, x > 0 ? i - 1 : i, y < H - 1 ? i + W : i, y > 0 ? i - W : i, (x < W - 2 ? i + 2 : i), (x > 1 ? i - 2 : i), (y < H - 2 ? i + 2 * W : i), (y > 1 ? i - 2 * W : i)]) {
        const kk = province[j]; if (kk === k) continue;
        const near = Math.abs(j - i) === 1 || Math.abs(j - i) === W;
        if (kk < 0) { if (mine[k] && near) mineEdge = 1; continue; }
        if (near) { if (realmIdx[kk] !== realmIdx[k]) border = Math.max(border, 3); else if (ownerIdx[kk] !== ownerIdx[k]) border = Math.max(border, 2); else border = Math.max(border, 1); }
        if (mine[k] !== mine[kk]) mineEdge = Math.max(mineEdge, near ? 1 : 0.6);
        if (enemy[k] && !enemy[kk]) enemyEdge = Math.max(enemyEdge, near ? 1 : 0.6);
      }
      if (this.mode === 'terrain') { if (border) { d[o] = 40; d[o + 1] = 30; d[o + 2] = 20; d[o + 3] = border === 3 ? 120 : 50; } }
      else if (border === 3) { d[o] = pal[k * 3] * 0.3; d[o + 1] = pal[k * 3 + 1] * 0.3; d[o + 2] = pal[k * 3 + 2] * 0.3; d[o + 3] = 245; }
      else if (border === 2) { d[o] = pal[k * 3] * 0.55; d[o + 1] = pal[k * 3 + 1] * 0.55; d[o + 2] = pal[k * 3 + 2] * 0.55; d[o + 3] = 200; }
      else if (border === 1) { d[o] = pal[k * 3] * 0.8; d[o + 1] = pal[k * 3 + 1] * 0.8; d[o + 2] = pal[k * 3 + 2] * 0.8; d[o + 3] = Math.min(255, fillA + 30); }
      else { d[o] = pal[k * 3]; d[o + 1] = pal[k * 3 + 1]; d[o + 2] = pal[k * 3 + 2]; d[o + 3] = fillA; }
      hd[o] = mineEdge * 255; hd[o + 1] = enemyEdge * 255; hd[o + 2] = k === selK ? (border ? 255 : 90) : 0; hd[o + 3] = 255;
    }
    ov.putImageData(img, 0, 0); hl.putImageData(himg, 0, 0);
    this.overlayTex.needsUpdate = true; this.hlTex.needsUpdate = true;
    this.buildRealmLabels();
  }

  select(id, { fly = false } = {}) {
    this.selected = id; this.recolor();
    if (fly && id && this.state?.holdings[id]) this.flyTo(this.state.holdings[id].pos);
  }
  flyTo(pos, dist) { this.goal = { x: pos[0], z: pos[1], d: dist ?? Math.min(this.dist, 420) }; }
  flash(pos) { this.pulse(pos, 'flash'); }

  // ───────────── settlements ─────────────
  syncSettlements() {
    const s = this.state;
    for (const [id, rec] of this.settlements) if (!s.holdings[id]) { this.scene.remove(rec.group); rec.label.el.remove(); this.labels = this.labels.filter((l) => l !== rec.label); this.settlements.delete(id); }
    for (const hd of Object.values(s.holdings)) {
      const owner = s.houses[hd.owner];
      let rec = this.settlements.get(hd.id);
      // a holding founded during play claims its own lands on the map
      if (this.seedIndex && !this.seedIndex.has(hd.id)) this.addSeed(hd);
      // burned to the ground: the castle becomes a ruin (and is rebuilt if the story rebuilds it)
      const shape = /ruin|destroyed|razed/.test(hd.status || '') ? 'ruin' : hd.type;
      if (rec && rec.shape !== shape) { this.scene.remove(rec.group); rec.label.el.remove(); this.labels = this.labels.filter((l) => l !== rec.label); this.settlements.delete(hd.id); rec = null; }
      if (!rec) {
        const b = buildSettlement({ ...hd, type: shape }, owner, owner?.color || '#777');
        const [x, z] = hd.pos;
        const y = this.groundAt(x, z);
        b.group.position.set(x, y - 0.1, z);
        b.group.rotation.y = (hd.id.length * 0.7) % (Math.PI * 2);
        this.scene.add(b.group);
        rec = { ...b, holding: hd.id, owner: null, banner: null, shape };
        this.settlements.set(hd.id, rec);
        const lbl = this.addLabel(hd.name, [x, y, z], `holding t${rec.tier}`, { holding: hd.id });
        rec.label = lbl;
      }
      if (rec.owner !== hd.owner) {
        rec.owner = hd.owner;
        rec.materials.roof.color.set(roofTone(hd.region ? hd : { ...hd, region: owner?.region }, owner?.color || '#777'));
        if (rec.banner) { rec.group.remove(rec.banner); rec.banner = null; }
        if (owner && (hd.seatOf || rec.tier >= 4)) {
          const bs = 1.2 + rec.tier * 0.25; const lift = bs * 0.5;
          rec.banner = buildBanner(owner, bs, { lift });
          rec.banner.position.set(0, rec.top - 1 + lift, 0); 
          rec.group.add(rec.banner);
        }
      }
      const sieged = ['besieged', 'burning', 'sacked', 'rising'].includes(hd.status);
      if (sieged && !rec.siege) {
        const col = hd.status === 'besieged' ? '#ff4a2a' : '#ff9a2a';
        const ring = new THREE.Mesh(new THREE.TorusGeometry(rec.radius * 0.75, 0.35, 6, 40), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85 }));
        ring.rotation.x = -Math.PI / 2; ring.position.y = 0.6; ring.userData.siege = true;
        const tents = new THREE.Group();
        for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; const t = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.1, 5), new THREE.MeshStandardMaterial({ color: '#c8b48a', flatShading: true })); t.position.set(Math.cos(a) * rec.radius * 0.95, 0.55, Math.sin(a) * rec.radius * 0.95); tents.add(t); }
        rec.siege = new THREE.Group(); rec.siege.add(ring, tents); rec.group.add(rec.siege);
      } else if (!sieged && rec.siege) { rec.group.remove(rec.siege); rec.siege = null; }
      if (rec.label.el.textContent !== hd.name) rec.label.el.textContent = hd.name;
      rec.label.el.classList.toggle('mine', this.isMine(hd.owner));
      rec.label.el.classList.toggle('enemy', this.atWarWith(hd.owner));
      rec.label.el.dataset.status = hd.status !== 'normal' ? hd.status : '';
    }
  }
  addSeed(hd) {
    const k = this.seeds.length; if (k >= 32000) return;
    const seed = { id: hd.id, x: hd.pos[0], y: hd.pos[1], w: hd.type === 'camp' || hd.type === 'ruin' ? 0.7 : 1 };
    this.seeds.push(seed); this.seedIndex.set(hd.id, k);
    const { W, H, scale, province, land } = this; const R = 34;
    const x0 = Math.max(0, Math.floor((seed.x - R) * scale)), x1 = Math.min(W - 1, Math.ceil((seed.x + R) * scale)), y0 = Math.max(0, Math.floor((seed.y - R) * scale)), y1 = Math.min(H - 1, Math.ceil((seed.y + R) * scale));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * W + x; const cur = province[i]; if (!land[i] || cur < 0) continue;
      const wx = x / scale, wy = y / scale; const o = this.seeds[cur];
      const dNew = ((wx - seed.x) ** 2 + (wy - seed.y) ** 2) / seed.w, dOld = ((wx - o.x) ** 2 + (wy - o.y) ** 2) / (o.w || 1);
      if (dNew < dOld && dNew < R * R) province[i] = k;
    }
    this.provinceStats(); this.provDirty = true;
  }
  isMine(owner) { const s = this.state; let x = s.houses[owner], g = 0; if (owner === s.meta.player) return true; while (x?.liege && g++ < 8) { if (x.liege === s.meta.player) return true; x = s.houses[x.liege]; } return false; }

  // Neighbouring seats can sit closer than their models are wide (Castle Cerwyn is half a day from
  // Winterfell): the lesser one is drawn smaller so the two never grow into each other.
  fitSettlements() {
    const recs = [...this.settlements.values()]; const base = 1.7;
    for (const r of recs) r.fit = 1;
    for (let i = 0; i < recs.length; i++) for (let j = i + 1; j < recs.length; j++) {
      const a = recs[i], b = recs[j]; if (!a.radius || !b.radius) continue;
      const d = Math.hypot(a.group.position.x - b.group.position.x, a.group.position.z - b.group.position.z);
      const [big, small] = a.tier > b.tier || (a.tier === b.tier && a.radius >= b.radius) ? [a, b] : [b, a];
      const room = d - big.radius * base * big.fit * 0.8;
      if (room < small.radius * base * small.fit) small.fit = Math.max(0.35, room / (small.radius * base));
    }
    this.fitDirty = this.settlements.size;
  }

  // ───────────── armies ─────────────
  syncArmies(prev) {
    const s = this.state;
    for (const [id, rec] of this.armyObjs) if (!s.armies[id]) { this.scene.remove(rec.group); if (rec.route) this.scene.remove(rec.route); rec.label.el.remove(); this.labels = this.labels.filter((l) => l !== rec.label); this.armyObjs.delete(id); }
    for (const a of Object.values(s.armies)) {
      const owner = s.houses[a.owner];
      let rec = this.armyObjs.get(a.id);
      const sig = `${a.owner}|${a.type}|${armyFigureCount(a.men)}|${a.ships || 0}|${a.composition}`;
      if (!rec || rec.sig !== sig) {
        const oldPos = rec?.pos;
        if (rec) { this.scene.remove(rec.group); if (rec.route) this.scene.remove(rec.route); rec.label.el.remove(); this.labels = this.labels.filter((l) => l !== rec.label); }
        const group = buildArmy(a, owner); this.scene.add(group);
        rec = { group, sig, pos: oldPos || [...a.pos], anim: null, route: null, label: this.addLabel('', [0, 0, 0], 'army', { army: a.id }) };
        this.armyObjs.set(a.id, rec);
      }
      const mode = a.type === 'fleet' ? 'sea' : 'land';
      if (rec.pos[0] !== a.pos[0] || rec.pos[1] !== a.pos[1]) {
        const path = this.grid.find(rec.pos, a.pos, mode);
        rec.anim = { path, t0: performance.now(), dur: 1800 + Math.min(2500, pathLength(path) * 4) };
      }
      rec.pos = [...a.pos];
      if (rec.route) { this.scene.remove(rec.route); rec.route = null; }
      if (a.dest) {
        const path = this.grid.find(a.pos, a.dest, mode);
        rec.route = this.routeMesh(path, a.owner === s.meta.player ? '#f6e27a' : this.atWarWith(a.owner) ? '#ff5a44' : '#e8e0d0');
        this.scene.add(rec.route);
      }
      const men = a.type === 'fleet' ? `${a.ships || '?'} ships` : fmt(a.men);
      const cmd = a.commander ? s.characters[a.commander]?.name : '';
      rec.label.el.innerHTML = `<span class="flag" style="background:${owner?.color || '#777'}"></span><b>${a.owner === s.meta.player ? '' : '~'}${men}</b>${cmd ? `<i>${cmd.split(' ').slice(-1)[0]}</i>` : ''}`;
      rec.label.el.classList.toggle('mine', this.isMine(a.owner));
      rec.label.el.classList.toggle('enemy', this.atWarWith(a.owner));
      rec.label.el.classList.toggle('sel', a.id === this.selectedArmy);
    }
  }
  routeMesh(path, color) {
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, uniforms: { uTime: this.waterUniforms.uTime, uColor: { value: new THREE.Color(color) } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform float uTime; uniform vec3 uColor; varying vec2 vUv; void main(){ float dash = step(0.45, fract(vUv.x * 0.12 - uTime * 0.6)); float edge = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.75, vUv.y); gl_FragColor = vec4(uColor, dash * edge * 0.95); }',
    });
    const g = this.ribbon(path, 1.1, m, 0.6);
    const end = path.at(-1), prev = path.at(-2) || path[0];
    const cone = new THREE.Mesh(new THREE.ConeGeometry(2.2, 5, 4), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 }));
    const ang = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
    cone.rotation.set(0, 0, -Math.PI / 2); const wrap = new THREE.Group(); wrap.add(cone); wrap.rotation.y = -ang; wrap.position.set(end[0], this.groundAt(end[0], end[1]) + 1.5, end[1]);
    const grp = new THREE.Group(); grp.add(g, wrap); grp.renderOrder = 3;
    return grp;
  }

  syncEventPins() {
    for (const p of this.eventPins) p.el.remove();
    this.labels = this.labels.filter((l) => !this.eventPins.includes(l));
    this.eventPins = [];
    const s = this.state; const last = s.history.at(-1); if (!last) return;
    for (const e of last.events) {
      if (!e.where || !s.holdings[e.where]) continue;
      const [x, z] = s.holdings[e.where].pos;
      const lbl = this.addLabel(e.type === 'war' ? '⚔' : e.type === 'economy' ? '🪙' : e.type === 'diplomacy' ? '✉' : e.type === 'intrigue' ? '🗡' : e.type === 'disaster' ? '🔥' : '❖', [x, this.groundAt(x, z) + 14, z], `event imp${e.importance}`, { event: e });
      lbl.el.title = e.title; this.eventPins.push(lbl);
    }
    for (const b of (s.battles || []).filter((b) => b.pos && s.meta.turn - b.turn <= 2)) {
      const lbl = this.addLabel('⚔', [b.pos[0], this.groundAt(b.pos[0], b.pos[1]) + 10, b.pos[1]], 'event battle', { battle: b }); lbl.el.title = b.name; this.eventPins.push(lbl);
    }
  }
  // Canonical places that are not holdings: ruins (the Nightfort, Oldstones, Castamere), abandoned Wall castles,
  // inns and villages — small models with labels when you look closely
  buildPlaces() {
    const neutral = { id: 'none', color: '#8a847a', rank: 'minor' };
    this.places = [];
    for (const [id, pos] of Object.entries(JUNCTIONS)) {
      if (resolvePlaceId(id) !== id || this.state.holdings[id] || /_\d|^the_/.test(id) && !PLACE_KIND[id]) continue;
      const kind = PLACE_KIND[id]; const name = PLACE_NAMES[id]; if (!kind || !name) continue;
      if (this.places.some((p) => Math.hypot(p.pos[0] - pos[0], p.pos[1] - pos[1]) < 2)) continue;
      const type = kind === 'ruin' || (kind === 'site' && /^(nightfort|deep_lake|queensgate|oakensheild|woodswatch|sable_hall|rimegate|long_barrow|torches|greenguard|greyguard|stonedoor|hoarfrost|icemark|sentinel_stand|westwatch)/.test(id)) ? 'ruin' : kind === 'castle' ? 'castle' : 'town';
      const b = buildSettlement({ id, name, type, region: '' }, neutral, '#7a6a5a');
      const y = this.groundAt(pos[0], pos[1]);
      b.group.position.set(pos[0], y - 0.1, pos[1]); b.group.scale.setScalar(type === 'castle' ? 0.8 : 0.6); b.group.rotation.y = (id.length * 0.9) % 6.28;
      this.scene.add(b.group);
      const label = this.addLabel(name, [pos[0], y, pos[1]], 'place ' + type, { place: id });
      this.places.push({ id, pos, group: b.group, label });
    }
  }
  syncLandmarks() {
    const s = this.state; const want = s.landmarks || [];
    const key = JSON.stringify(want.map((l) => [l.name, l.pos]));
    if (key === this.landmarkKey) return; this.landmarkKey = key;
    for (const l of this.landmarkEls || []) l.el.remove();
    this.labels = this.labels.filter((l) => !(this.landmarkEls || []).includes(l));
    this.landmarkEls = want.map((lm) => {
      const icon = lm.kind === 'battle' ? '⚔' : lm.kind === 'camp' ? '⛺' : lm.kind === 'grave' ? '✝' : '◆';
      const l = this.addLabel(`${icon} ${lm.name}`, [lm.pos[0], this.groundAt(lm.pos[0], lm.pos[1]) + 3, lm.pos[1]], 'landmark', {});
      l.el.title = lm.note || lm.name; return l;
    });
  }
  pulse(pos, cls) { const l = this.addLabel('', [pos[0], this.groundAt(pos[0], pos[1]) + 2, pos[1]], 'pulse ' + cls, {}); setTimeout(() => { l.el.remove(); this.labels = this.labels.filter((x) => x !== l); }, 4500); }

  // ───────────── labels (HTML overlay) ─────────────
  addLabel(text, pos, cls, data = {}) {
    const el = document.createElement('div'); el.className = 'lbl ' + cls; if (text) el.textContent = text;
    this.labelLayer.appendChild(el);
    const l = { el, pos: new THREE.Vector3(...pos), cls, data };
    Object.assign(el.dataset, Object.fromEntries(Object.entries(data).filter(([, v]) => typeof v === 'string')));
    this.labels.push(l); return l;
  }
  buildRealmLabels() {
    if (!this.realmLabelEls) this.realmLabelEls = [];
    for (const l of this.realmLabelEls) l.el.remove();
    this.labels = this.labels.filter((l) => !this.realmLabelEls.includes(l));
    this.realmLabelEls = [];
    const s = this.state; const agg = new Map();
    for (let k = 0; k < this.seeds.length; k++) {
      const owner = s.holdings[this.seeds[k].id]?.owner; const r = realmOf(s, owner); const st = this.provStats[k]; if (!st.area) continue;
      const a = agg.get(r) || { sx: 0, sy: 0, area: 0, minx: 1e9, maxx: -1e9 };
      a.sx += st.cx * st.area; a.sy += st.cy * st.area; a.area += st.area; a.minx = Math.min(a.minx, st.cx); a.maxx = Math.max(a.maxx, st.cx); agg.set(r, a);
    }
    for (const [r, a] of agg) {
      const h = s.houses[r]; if (!h) continue;
      const x = a.sx / a.area, z = a.sy / a.area;
      const size = clamp(Math.sqrt(a.area) * 0.05, 10, 44);
      const l = this.addLabel((h.realmName || h.name).toUpperCase(), [x, this.groundAt(x, z) + 30, z], 'realm' + (r === realmOf(s, s.meta.player) ? ' own' : ''), {});
      l.size = size; l.area = a.area; this.realmLabelEls.push(l);
    }
  }
  buildSeaLabels() {
    for (const l of LABELS) {
      const lbl = this.addLabel(l.t, [l.x, 2, l.y], l.kind === 'sea' ? 'sea' + (l.s >= 14 ? ' big' : '') : 'feature', {});
      lbl.rot = l.rot || 0; lbl.size = l.s;
    }
  }

  updateLabels() {
    const w = this.cssW, h = this.cssH; const v = new THREE.Vector3(); const d = this.dist;
    const placed = []; const armyBoxes = [];
    // realm labels: size scales with realm and zoom, largest first to avoid collisions
    for (const l of this.labels) {
      v.copy(l.pos).project(this.camera);
      const vis = v.z < 1 && v.x > -1.2 && v.x < 1.2 && v.y > -1.2 && v.y < 1.2;
      let show = vis; let scale = 1;
      const c = l.cls;
      if (c.startsWith('holding')) {
        const tier = Number(c.match(/t(\d)/)?.[1] || 3);
        // near: the name; farther: a small seat marker so no castle ever simply vanishes; farthest: hidden
        const nameD = tier >= 6 ? 99999 : tier >= 5 ? 1500 : tier >= 4 ? 800 : 480;
        const dotD = tier >= 5 ? 99999 : tier >= 4 ? 2400 : 1500;
        show = vis && d < dotD;
        const dot = d >= nameD;
        if (l.dot !== dot) { l.dot = dot; l.el.classList.toggle('dot', dot); }
      } else if (c.startsWith('realm')) {
        show = vis && d > 620 && this.mode !== 'terrain';
        scale = clamp((l.size * 900) / d, 9, 46) / 16;
        l.el.style.opacity = clamp((d - 620) / 300, 0, 1);
      } else if (c.startsWith('sea')) { show = vis && (c.includes('big') ? d > 500 : d < 1400 && d > 200); scale = clamp(((l.size || 12) * 700) / d, 8, 30) / 14; }
      else if (c.startsWith('feature')) { show = vis && d < 1300 && d > 250; }
      else if (c.startsWith('army')) { show = vis; }
      else if (c.startsWith('event')) { show = vis && d < 2200; }
      else if (c.startsWith('landmark')) { show = vis && d < 1100; }
      else if (c.startsWith('place')) { show = vis && d < 330; }
      if (!show) { if (l.shown !== false) { l.el.style.display = 'none'; l.shown = false; } continue; }
      if (l.shown !== true) { l.el.style.display = ''; l.shown = true; }
      const x = (v.x * 0.5 + 0.5) * w; let y = (-v.y * 0.5 + 0.5) * h;
      if (c.startsWith('army')) {
        // stack army plates that would overlap on screen
        const bw = (l.el.offsetWidth || 90), bh = (l.el.offsetHeight || 20) + 3;
        let guard = 0;
        while (guard++ < 8 && armyBoxes.some((b) => Math.abs(b.x - x) < (b.w + bw) / 2 && Math.abs(b.y - y) < bh)) y -= bh;
        armyBoxes.push({ x, y, w: bw });
      }
      l.sx = x; l.sy = y;
      l.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)${scale !== 1 ? ` scale(${scale.toFixed(3)})` : ''}${l.rot ? ` rotate(${l.rot}rad)` : ''}`;
      if (c.startsWith('realm')) {
        const bw = (l.el.offsetWidth || 100) * scale, bh = 20 * scale;
        const box = [x - bw / 2, y - bh / 2, x + bw / 2, y + bh / 2];
        if (placed.some((b) => !(box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3]))) { l.el.style.display = 'none'; l.shown = false; continue; }
        placed.push(box);
      }
    }
  }

  // ───────────── camera & input ─────────────
  resize() {
    const r = this.container.getBoundingClientRect();
    this.cssW = r.width; this.cssH = r.height;
    this.renderer.setSize(r.width, r.height);
    this.camera.aspect = r.width / Math.max(1, r.height); this.camera.updateProjectionMatrix();
  }
  updateCamera() {
    this.dist = clamp(this.dist, 40, 2700);
    this.target.x = clamp(this.target.x, 0, WORLD.w); this.target.z = clamp(this.target.z, -100, WORLD.h);
    const t = clamp((this.dist - 40) / 1600, 0, 1);
    const elev = THREE.MathUtils.lerp(0.72, 1.32, Math.pow(t, 0.7)); // radians above the horizon
    const ty = this.heightF ? this.groundAt(this.target.x, this.target.z) * (1 - t) : 0;
    this.target.y = THREE.MathUtils.lerp(this.target.y, ty, 0.2);
    this.camera.position.set(this.target.x, this.target.y + Math.sin(elev) * this.dist, this.target.z + Math.cos(elev) * this.dist);
    this.camera.lookAt(this.target);
    this.scene.fog.near = this.dist * 1.6; this.scene.fog.far = this.dist * 5 + 800;
    this.waterUniforms && (this.waterUniforms.fogNear.value = this.scene.fog.near, this.waterUniforms.fogFar.value = this.scene.fog.far, this.waterUniforms.uCam.value.copy(this.camera.position));
    // shadows follow the view
    const sd = Math.min(700, this.dist * 0.9);
    this.sun.position.set(this.target.x - 520, 420, this.target.z - 300); this.sun.target.position.copy(this.target);
    const sc = this.sun.shadow.camera; sc.left = -sd; sc.right = sd; sc.top = sd; sc.bottom = -sd; sc.near = 10; sc.far = 1800; sc.updateProjectionMatrix();
    this.sun.castShadow = this.dist < 900;
    // model visibility / scale by zoom
    // settlements keep one true size at every zoom (they no longer swell as you pull back); too far to model,
    // they are shown by their map marker instead
    if (this.fitDirty !== this.settlements.size) this.fitSettlements();
    for (const rec of this.settlements.values()) {
      const vis = rec.tier >= 6 ? this.dist < 2600 : rec.tier >= 5 ? this.dist < 1900 : rec.tier >= 4 ? this.dist < 1100 : this.dist < 700;
      rec.group.visible = vis; if (vis) rec.group.scale.setScalar(1.7 * (rec.fit || 1));
    }
    for (const pl of this.places || []) pl.group.visible = this.dist < 520;
    const af = clamp(this.dist / 160, 1, 9);
    for (const rec of this.armyObjs.values()) rec.group.scale.setScalar(af);
    if (this.forests) this.forests.visible = this.dist < 900;
    if (this.roadGroup) this.roadGroup.visible = this.dist < 1300;
    if (this.terrainUniforms) this.terrainUniforms.uStrength.value = this.mode === 'terrain' ? 0 : THREE.MathUtils.lerp(0.28, 0.92, clamp((this.dist - 150) / 1200, 0, 1));
  }
  screenToGround(sx, sy) {
    const ndc = new THREE.Vector2((sx / this.cssW) * 2 - 1, -(sy / this.cssH) * 2 + 1);
    const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, this.camera);
    const o = ray.ray.origin, dir = ray.ray.direction;
    // march the ray until it dips under the terrain
    let t = dir.y < 0 ? (o.y - 60) / -dir.y : 0; let last = null;
    for (let i = 0; i < 200; i++) {
      const p = o.clone().addScaledVector(dir, t);
      const gh = p.x >= 0 && p.z >= 0 && p.x <= WORLD.w && p.z <= WORLD.h ? this.groundAt(p.x, p.z) : WATER_LEVEL;
      if (p.y <= gh) { return last ? last.lerp(p, 0.5) : p; }
      last = p; t += Math.max(1, (p.y - gh) * 0.5);
    }
    const tt = (o.y - WATER_LEVEL) / -dir.y; return o.clone().addScaledVector(dir, tt);
  }
  bindInput() {
    // pointer input on the whole map (canvas and labels), so a drag that starts on a place name still pans
    const el = this.container; const cv = this.renderer.domElement; let drag = null; let moved = false; let last = null;
    el.addEventListener('selectstart', (e) => e.preventDefault());
    el.addEventListener('mousedown', (e) => { if (e.detail > 1) e.preventDefault(); }); // no word-select on double click
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('wheel', (e) => {
      e.preventDefault(); this.goal = null;
      const r = el.getBoundingClientRect(); const mx = e.clientX - r.left, my = e.clientY - r.top;
      const before = this.screenToGround(mx, my);
      this.dist *= Math.exp(e.deltaY * 0.0012); this.updateCamera();
      const after = this.screenToGround(mx, my);
      this.target.x += before.x - after.x; this.target.z += before.z - after.z; this.updateCamera();
    }, { passive: false });
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !e.isPrimary) return;
      this.goal = null; this.vel = null; const r = el.getBoundingClientRect();
      drag = { sx: e.clientX, sy: e.clientY, g: this.screenToGround(e.clientX - r.left, e.clientY - r.top), target: e.target, id: e.pointerId }; moved = false; last = null;
    });
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect(); const mx = e.clientX - r.left, my = e.clientY - r.top;
      if (drag) {
        if (!moved && Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) > 4) { moved = true; try { el.setPointerCapture(drag.id); } catch { /* */ } }
        if (moved) {
          const g = this.screenToGround(mx, my); const dx = drag.g.x - g.x, dz = drag.g.z - g.z;
          this.target.x += dx; this.target.z += dz; this.updateCamera(); el.style.cursor = 'grabbing';
          const now = performance.now(); if (last) { const dt = Math.max(8, now - last.t); this.velSample = { x: dx / dt * 1000, z: dz / dt * 1000 }; } last = { t: now };
        }
      } else {
        const hit = this.hitTest(mx, my); const key = hit ? hit.type + hit.id : null;
        el.style.cursor = hit && !hit.area ? 'pointer' : 'default';
        if (key !== this.hoverKey) { this.hoverKey = key; }
        this.h.onHover?.(hit, e);
      }
    });
    el.addEventListener('pointerup', (e) => {
      el.style.cursor = 'default';
      // a flick keeps the map gliding a moment
      if (drag && moved && this.velSample && last && performance.now() - last.t < 80) this.vel = { ...this.velSample };
      this.velSample = null;
      if (drag && !moved) {
        const lbl = drag.target?.closest?.('.lbl');
        if (lbl) { this.labelClick(lbl); drag = null; return; }
        const r = el.getBoundingClientRect(); const hit = this.hitTest(e.clientX - r.left, e.clientY - r.top);
        if (hit?.type === 'army') { this.selectedArmy = hit.id; this.h.onSelectArmy?.(hit.id); this.syncArmies(); }
        else if (hit?.type === 'holding') { this.selectedArmy = null; this.select(hit.id); this.h.onSelect?.(hit.id); }
        else { this.selectedArmy = null; this.select(null); this.h.onSelect?.(null); }
      }
      drag = null;
    });
    el.addEventListener('pointercancel', () => { drag = null; });
    el.addEventListener('pointerleave', () => this.h.onHover?.(null));
    el.addEventListener('dblclick', (e) => { if (e.target.closest('.lbl')) return; const r = el.getBoundingClientRect(); const g = this.screenToGround(e.clientX - r.left, e.clientY - r.top); this.flyTo([g.x, g.z], Math.max(120, this.dist * 0.5)); });
    this.keys = new Set();
    window.addEventListener('keydown', (e) => { if (/input|textarea|select/i.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable) return; this.keys.add(e.key.toLowerCase()); });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    void cv;
  }
  labelClick(t) {
    {
      if (t.dataset.army) { this.selectedArmy = t.dataset.army; this.h.onSelectArmy?.(t.dataset.army); this.syncArmies(); }
      else if (t.dataset.holding) { this.select(t.dataset.holding); this.h.onSelect?.(t.dataset.holding); }
      else { const l = this.labels.find((x) => x.el === t); if (l?.data?.event) this.h.onEvent?.(l.data.event); }
    }
  }
  hitTest(sx, sy) {
    if (!this.state || !this.heightF) return null;
    for (const [id, rec] of this.armyObjs) { const l = rec.label; if (l.shown && Math.abs(l.sx - sx) < 34 && Math.abs(l.sy - sy) < 14) return { type: 'army', id }; }
    const v = new THREE.Vector3();
    let best = null, bd = 16 * 16;
    for (const rec of this.settlements.values()) {
      if (!rec.group.visible) continue;
      v.copy(rec.group.position); v.y += 3; v.project(this.camera);
      const x = (v.x * 0.5 + 0.5) * this.cssW, y = (-v.y * 0.5 + 0.5) * this.cssH; const dd = (x - sx) ** 2 + (y - sy) ** 2;
      if (dd < bd) { bd = dd; best = rec.holding; }
    }
    if (best) return { type: 'holding', id: best };
    const g = this.screenToGround(sx, sy);
    const px = Math.floor(g.x * this.scale), py = Math.floor(g.z * this.scale);
    if (px < 0 || py < 0 || px >= this.W || py >= this.H) return null;
    const k = this.province[py * this.W + px];
    return k >= 0 ? { type: 'holding', id: this.seeds[k].id, area: true } : null;
  }
  placePos(id) { const pid = resolvePlaceId(id) || id; if (this.state?.holdings[pid]) return this.state.holdings[pid].pos; if (JUNCTIONS[pid]) return JUNCTIONS[pid]; return null; }

  frame() {
    const nowT = performance.now(); const dt = Math.min(0.05, (nowT - this.tPrev) / 1000); this.tPrev = nowT; const time = (nowT - this.t0) / 1000;
    // keyboard pan
    if (this.keys?.size) {
      const sp = this.dist * 0.9 * dt;
      if (this.keys.has('w') || this.keys.has('arrowup')) this.target.z -= sp;
      if (this.keys.has('s') || this.keys.has('arrowdown')) this.target.z += sp;
      if (this.keys.has('a') || this.keys.has('arrowleft')) this.target.x -= sp;
      if (this.keys.has('d') || this.keys.has('arrowright')) this.target.x += sp;
      if (this.keys.has('q') || this.keys.has('-')) this.dist *= 1 + dt * 1.2;
      if (this.keys.has('e') || this.keys.has('=')) this.dist *= 1 - dt * 1.2;
    }
    if (this.vel) {
      this.target.x += this.vel.x * dt; this.target.z += this.vel.z * dt;
      const f = Math.pow(0.04, dt); this.vel.x *= f; this.vel.z *= f;
      if (Math.abs(this.vel.x) + Math.abs(this.vel.z) < this.dist * 0.01) this.vel = null;
    }
    if (this.goal) {
      const k = 1 - Math.pow(0.02, dt);
      this.target.x += (this.goal.x - this.target.x) * k; this.target.z += (this.goal.z - this.target.z) * k; this.dist += (this.goal.d - this.dist) * k;
      if (Math.abs(this.goal.x - this.target.x) + Math.abs(this.goal.z - this.target.z) < 0.5 && Math.abs(this.goal.d - this.dist) < 1) this.goal = null;
    }
    this.updateCamera();
    if (this.terrainUniforms) this.terrainUniforms.uTime.value = time;
    if (this.waterUniforms) this.waterUniforms.uTime.value = time;
    // armies: animate marches and place on terrain
    const now = performance.now();
    const stacks = new Map();
    for (const [id, rec] of this.armyObjs) {
      const a = this.state?.armies[id]; if (!a) continue;
      let p = a.pos, heading = null;
      if (rec.anim) {
        const t = clamp((now - rec.anim.t0) / rec.anim.dur, 0, 1); const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
        p = pointAlong(rec.anim.path, e); const p2 = pointAlong(rec.anim.path, Math.min(1, e + 0.02)); heading = Math.atan2(p2[1] - p[1], p2[0] - p[0]);
        if (t >= 1) rec.anim = null;
      }
      // a host resting at a castle camps before its gates, not inside the keep
      if (!rec.anim && a.type !== 'fleet') {
        for (const st of this.settlements.values()) {
          const rr = (st.radius || 0) * st.group.scale.x; if (!rr) continue;
          const dx = p[0] - st.group.position.x, dz = p[1] - st.group.position.z;
          if (dx * dx + dz * dz < rr * rr) { p = [st.group.position.x + rr * 0.55, st.group.position.z + rr * 1.02]; break; }
        }
      }
      // armies sharing a spot fan out so both models and labels stay readable
      const key = Math.round(p[0] / 8) + ',' + Math.round(p[1] / 8);
      const idx = stacks.get(key) || 0; stacks.set(key, idx + 1);
      if (idx) { const ang = idx * 2.1; const r = 5 * rec.group.scale.x; p = [p[0] + Math.cos(ang) * r, p[1] + Math.sin(ang) * r]; }

      const y = a.type === 'fleet' ? WATER_LEVEL + Math.sin(time * 1.3 + id.length) * 0.15 : this.groundAt(p[0], p[1]);
      rec.group.position.set(p[0], y, p[1]);
      if (heading !== null) rec.group.rotation.y = -heading + Math.PI / 2;
      // a marching host strides: the files rise and fall and sway a little; at rest they stand still
      const marching = !!rec.anim && a.type !== 'fleet';
      for (const m of rec.group.children) if (m.isInstancedMesh) { m.position.y = marching ? Math.abs(Math.sin(time * 7 + m.id)) * 0.09 : 0; m.rotation.z = marching ? Math.sin(time * 3.5) * 0.02 : 0; }
      rec.label.pos.set(p[0], y + 6 * rec.group.scale.x, p[1]);
    }
    // banners flutter
    clothUniforms.uTime.value = time;
    // banners turn to face the viewer, so the sigil always reads and the pole stays behind the cloth
    const yaw = Math.atan2(this.camera.position.x - this.target.x, this.camera.position.z - this.target.z);
    for (const rec of this.armyObjs.values()) { const b = rec.group?.userData.banner; if (b) b.rotation.y = yaw - rec.group.rotation.y; }
    for (const rec of this.settlements.values()) {
      if (rec.banner) rec.banner.rotation.y = yaw - rec.group.rotation.y;
      if (rec.siege) rec.siege.children[0].material.opacity = 0.55 + 0.35 * Math.sin(time * 3);
    }
    this.renderer.render(this.scene, this.camera);
    this.updateLabels();
  }
}

const tick = () => new Promise((r) => setTimeout(r, 0));
// Catmull-Rom resampling of a polyline, one point every `step` units
function catmull(pts, step = 2) {
  if (pts.length < 3) return pts;
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const n = Math.max(1, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts.at(-1));
  return out;
}
