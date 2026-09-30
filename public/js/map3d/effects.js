// The living map's effects (docs/gdd/11-map-visuals.md §6.2, §6.4, §10; WP E6 + E7): smoke over what burns, embers, watch-fires, torches, lanterns and pavilions where a feast or a tourney was held,
// tents and a fire where a host is camped, a dust puff and stakes where a field was fought, and the weather over the ground the camera looks at. Everything here is read from the state by the pure
// rules of states.js and drawn in a handful of draw calls whatever their number: particles are two `Points` (smoke in normal blending, glow in additive), the weather one more, tents and
// pavilions two instanced meshes. The graphics preset says how many of each (states.js PRESETS); the Fast preset draws almost none.
import * as THREE from 'three';
import { emittersOf, presetOf, weatherOf } from './states.js';

const SOFT_VERT = `uniform float uTime; uniform float uScale;
attribute vec3 aBase; attribute vec4 aP; // x phase, y seed, z kind, w size
varying float vA; varying vec3 vCol;
void main(){
  float kind = aP.z;
  float speed = kind < 0.5 ? 0.075 : kind < 1.5 ? 0.06 : 0.16;
  float age = fract(uTime * speed + aP.x);
  float H = kind < 0.5 ? 64.0 : kind < 1.5 ? 24.0 : 12.0;
  float sw = aP.y * 6.2831;
  vec3 drift = vec3(sin(sw + age * 2.2) * age * 4.5 + age * age * 8.0, age * H, cos(sw + age * 1.8) * age * 4.5 + age * age * 3.0);
  vec4 mv = modelViewMatrix * vec4(aBase + drift, 1.0);
  gl_Position = projectionMatrix * mv;
  float sz = mix(5.0, kind < 1.5 ? 24.0 : 14.0, age) * aP.w;
  gl_PointSize = clamp(sz * uScale / max(1.0, -mv.z), 1.0, 96.0);
  vA = pow(1.0 - age, 0.7) * smoothstep(0.0, 0.06, age) * (kind < 0.5 ? 1.0 : kind < 1.5 ? 0.5 : 0.62);
  vCol = kind < 0.5 ? vec3(0.045, 0.04, 0.04) + age * vec3(0.2) : kind < 1.5 ? vec3(0.62, 0.6, 0.57) : vec3(0.68, 0.58, 0.44);
}`;
const SOFT_FRAG = `varying float vA; varying vec3 vCol;
void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = (1.0 - smoothstep(0.15, 1.0, d)) * vA; if (a < 0.01) discard; gl_FragColor = vec4(vCol, a); }`;

const GLOW_VERT = `uniform float uTime; uniform float uScale;
attribute vec3 aBase; attribute vec4 aP; // x phase, y seed, z kind (0 ember, 1 fire, 2 lantern), w size
varying float vA; varying vec3 vCol;
void main(){
  float kind = aP.z; vec3 p = aBase; float a = 1.0;
  if (kind < 0.5) { float age = fract(uTime * 0.22 + aP.x); float sw = aP.y * 6.2831; p += vec3(sin(sw + age * 5.0) * age * 3.0, age * 20.0, cos(sw + age * 4.0) * age * 3.0); a = (1.0 - age) * smoothstep(0.0, 0.06, age); vCol = mix(vec3(1.0, 0.75, 0.25), vec3(1.0, 0.25, 0.05), age); }
  else if (kind < 1.5) { a = 0.75 + 0.25 * sin(uTime * 9.0 + aP.y * 40.0); p.y += sin(uTime * 6.0 + aP.y * 30.0) * 0.25; vCol = vec3(1.0, 0.55, 0.16); }
  else { a = 0.8 + 0.2 * sin(uTime * 2.0 + aP.y * 20.0); vCol = vec3(1.0, 0.82, 0.45); }
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(aP.w * 1.6 * uScale / max(1.0, -mv.z), 1.0, 56.0);
  vA = a;
}`;
const GLOW_FRAG = `varying float vA; varying vec3 vCol;
void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = (1.0 - smoothstep(0.0, 1.0, d)) * vA; if (a < 0.02) discard; gl_FragColor = vec4(vCol * a, a); }`;

const WEATHER_VERT = `uniform float uTime; uniform vec3 uCentre; uniform float uSize; uniform float uKind; // 0 snow, 1 rain
attribute vec4 aW; // x, z offsets in [-1,1], y phase, w seed
varying float vA;
void main(){
  float fall = fract(aW.y - uTime * (uKind < 0.5 ? 0.09 : 0.55));
  vec3 p = uCentre + vec3(aW.x * uSize, fall * 90.0, aW.z * uSize);
  p.x += sin(uTime * 0.7 + aW.w * 20.0) * (uKind < 0.5 ? 4.0 : 0.5); p.x += fall * (uKind < 0.5 ? 6.0 : 14.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp((uKind < 0.5 ? 2.6 : 1.5) * 600.0 / max(1.0, -mv.z), 1.0, 14.0);
  vA = smoothstep(0.0, 0.1, fall) * (1.0 - smoothstep(0.85, 1.0, fall)) * (uKind < 0.5 ? 0.85 : 0.5);
}`;
const WEATHER_FRAG = `uniform float uKind; varying float vA;
void main(){ vec2 c = gl_PointCoord - 0.5; float a = uKind < 0.5 ? (1.0 - smoothstep(0.05, 0.5, length(c))) : (1.0 - smoothstep(0.1, 0.5, abs(c.x) * 5.0)) * (1.0 - smoothstep(0.3, 0.5, abs(c.y))); a *= vA; if (a < 0.02) discard; gl_FragColor = vec4(uKind < 0.5 ? vec3(0.95, 0.97, 1.0) : vec3(0.7, 0.78, 0.9), a); }`;

const hashSeed = (n) => { let h = (n * 2654435761) >>> 0; h ^= h >>> 13; h = Math.imul(h, 1274126177) >>> 0; return (h >>> 0) / 4294967295; };

export class Effects {
  /** @param scene THREE.Scene, @param opts { groundAt(x, z), radiusOf(id) → world radius of a holding's model, preset } */
  constructor(scene, opts = {}) {
    this.scene = scene; this.o = opts; this.presetName = opts.preset || 'balanced'; this.preset = presetOf(this.presetName); this.sig = ''; this.weatherSig = '';
    const soft = new THREE.ShaderMaterial({ vertexShader: SOFT_VERT, fragmentShader: SOFT_FRAG, uniforms: { uTime: { value: 0 }, uScale: { value: 800 } }, transparent: true, depthWrite: false });
    const glow = new THREE.ShaderMaterial({ vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG, uniforms: { uTime: { value: 0 }, uScale: { value: 800 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.soft = new THREE.Points(new THREE.BufferGeometry(), soft); this.glow = new THREE.Points(new THREE.BufferGeometry(), glow);
    for (const p of [this.soft, this.glow]) { p.frustumCulled = false; p.renderOrder = 6; p.visible = false; scene.add(p); }
    // tents and pavilions: two instanced cones
    this.tents = new THREE.InstancedMesh(new THREE.ConeGeometry(0.9, 1.6, 5), new THREE.MeshStandardMaterial({ color: '#d8c9a2', roughness: 0.9, flatShading: true }), 800);
    this.pavilions = new THREE.InstancedMesh(new THREE.ConeGeometry(2.2, 3.4, 6), new THREE.MeshStandardMaterial({ color: '#e8dcc0', roughness: 0.85, flatShading: true }), 120);
    for (const m of [this.tents, this.pavilions]) { m.frustumCulled = false; m.count = 0; m.visible = false; m.castShadow = false; scene.add(m); }
    // the stakes of a field fought: thin posts, instanced
    this.stakes = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.09, 3.2, 4), new THREE.MeshStandardMaterial({ color: '#4a3a2a', roughness: 1, flatShading: true }), 240);
    this.stakes.frustumCulled = false; this.stakes.count = 0; this.stakes.visible = false; scene.add(this.stakes);
    // the weather: one Points over the camera's ground
    const wmat = new THREE.ShaderMaterial({ vertexShader: WEATHER_VERT, fragmentShader: WEATHER_FRAG, uniforms: { uTime: { value: 0 }, uCentre: { value: new THREE.Vector3() }, uSize: { value: 220 }, uKind: { value: 0 } }, transparent: true, depthWrite: false });
    this.weather = new THREE.Points(new THREE.BufferGeometry(), wmat); this.weather.frustumCulled = false; this.weather.visible = false; this.weather.renderOrder = 7; scene.add(this.weather);
    this.counts = { soft: 0, glow: 0, tents: 0, pavilions: 0, stakes: 0, weather: 0 };
  }

  setPreset(name) { this.presetName = name; this.preset = presetOf(name); this.sig = ''; this.weatherSig = ''; }

  /** Rebuild what the state asks for (only when it has changed): the smoke, the glow, the tents, the pavilions, the stakes. */
  sync(state, { own = [], seen = null } = {}) {
    if (!state) return;
    const list = emittersOf(state, this.presetName, { own, seen });
    const sig = JSON.stringify(list.map((e) => [e.id, e.tents || 0, e.age || 0]));
    if (sig === this.sig) return; this.sig = sig;
    const g = this.o.groundAt || (() => 0); const rad = this.o.radiusOf || (() => 4);
    const soft = [], glow = []; const tents = [], pav = [], stakes = [];
    const S = (base, phase, seed, kind, size) => soft.push(base[0], base[1], base[2], phase, seed, kind, size);
    const G = (base, phase, seed, kind, size) => glow.push(base[0], base[1], base[2], phase, seed, kind, size);
    for (const e of list) {
      const y = g(e.x, e.z);
      if (e.quiet && e.kind === 'dust') { for (let i = 0; i < 4; i++) stakes.push([e.x + (i - 1.5) * 1.6, y + 1.4, e.z + ((i * 37) % 3 - 1) * 1.3, (i - 1.5) * 0.3]); }
      else if (e.quiet && e.kind === 'campfire') { const n = e.tents || 3; const r = 3.4 + n * 0.25; for (let i = 0; i < n; i++) { const a = (i / n) * 6.28; tents.push([e.x + Math.cos(a) * r, y + 0.8, e.z + Math.sin(a) * r, a, e.color || '#d8c9a2']); } }
      else if (e.kind === 'smoke') { const n = 40; for (let i = 0; i < n; i++) S([e.x, y + 6, e.z], i / n, hashSeed(i * 7 + Math.floor(e.seed * 9999)), e.tone === 'black' ? 0 : 1, e.tone === 'black' ? 1 : 0.7); }
      else if (e.kind === 'dust') { const n = 18; for (let i = 0; i < n; i++) S([e.x, y + 1, e.z], i / n, hashSeed(i * 5 + Math.floor(e.seed * 9999)), 2, 1.1 - e.age * 0.4); for (let i = 0; i < 4; i++) stakes.push([e.x + (i - 1.5) * 1.6, y + 1.4, e.z + ((i * 37) % 3 - 1) * 1.3, (i - 1.5) * 0.3]); }
      else if (e.kind === 'embers') { for (let i = 0; i < 22; i++) { const a = hashSeed(i + Math.floor(e.seed * 999)) * 6.28; const r = rad(e.id.split(':')[0]) * 0.5; G([e.x + Math.cos(a) * r, y + 5, e.z + Math.sin(a) * r], i / 22, hashSeed(i * 3 + 1), 0, 2.2); } }
      else if (e.kind === 'fire') { const r = rad(e.id.split(':')[0]) * 0.8; const a = (e.slot / Math.max(1, e.of)) * 6.28 + e.seed * 6; for (let k = 0; k < 3; k++) G([e.x + Math.cos(a) * r, y + 4 + k * 0.6, e.z + Math.sin(a) * r], k / 3, hashSeed(k + Math.floor(e.seed * 999)), 1, 3.4 - k * 0.7); }
      else if (e.kind === 'lantern') {
        const hid = e.id.split(':')[0]; const r = rad(hid) * (e.festival === 'tourney' ? 1.7 : 1.15);
        const n = e.festival === 'tourney' ? 22 : 14; for (let i = 0; i < n; i++) { const a = (i / n) * 6.28 + e.seed; G([e.x + Math.cos(a) * r, y + 2.4, e.z + Math.sin(a) * r], i / n, hashSeed(i + Math.floor(e.seed * 999)), 2, 2.4); }
        if (e.festival === 'tourney') { const k = 5; for (let i = 0; i < k; i++) { const a = Math.PI * 0.15 + (i / k) * Math.PI * 0.7 + e.seed; pav.push([e.x + Math.cos(a) * r * 1.15, y + 1.6, e.z + Math.sin(a) * r * 1.15, i]); } }
      } else if (e.kind === 'campfire') {
        const n = e.tents || 3; const r = 3.4 + n * 0.25;
        for (let i = 0; i < n; i++) { const a = (i / n) * 6.28 + e.seed * 6; tents.push([e.x + Math.cos(a) * r, y + 0.8, e.z + Math.sin(a) * r, a, e.color || '#d8c9a2']); }
        G([e.x, y + 1.2, e.z], 0.1, e.seed, 1, 2.6); for (let i = 0; i < 7; i++) S([e.x, y + 1.6, e.z], i / 7, hashSeed(i + Math.floor(e.seed * 999)), 1, 0.45);
        if (e.lines) for (let i = 0; i < n * 2; i++) { const a = (i / (n * 2)) * 6.28; tents.push([e.x + Math.cos(a) * (r + 3), y + 0.8, e.z + Math.sin(a) * (r + 3), a, '#a89870']); }
      }
    }
    const setPts = (pts, arr) => {
      const n = arr.length / 7; const base = new Float32Array(n * 3), p4 = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) { base.set(arr.slice(i * 7, i * 7 + 3), i * 3); p4.set(arr.slice(i * 7 + 3, i * 7 + 7), i * 4); }
      pts.geometry.dispose(); const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(base, 3)); geo.setAttribute('aBase', new THREE.BufferAttribute(base, 3)); geo.setAttribute('aP', new THREE.BufferAttribute(p4, 4));
      pts.geometry = geo; pts.visible = n > 0; return n;
    };
    this.counts.soft = setPts(this.soft, soft); this.counts.glow = setPts(this.glow, glow);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
    const fillInst = (mesh, arr, scale) => { const n = Math.min(mesh.instanceMatrix.count, arr.length); for (let i = 0; i < n; i++) { const t = arr[i]; q.setFromAxisAngle(up, t[3] || 0); m.compose(v.set(t[0], t[1], t[2]), q, sc.set(scale, scale, scale)); mesh.setMatrixAt(i, m); mesh.setColorAt(i, col.set(t[4] || (i % 2 ? '#c0392b' : '#e8dcc0'))); } mesh.count = n; mesh.visible = n > 0; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; return n; };
    this.counts.tents = fillInst(this.tents, tents, 1); this.counts.pavilions = fillInst(this.pavilions, pav.map((p) => [p[0], p[1], p[2], p[3], p[3] % 2 ? '#a8322a' : '#e8dcc0']), 1);
    const nS = Math.min(this.stakes.instanceMatrix.count, stakes.length); for (let i = 0; i < nS; i++) { q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), stakes[i][3]); m.compose(v.set(stakes[i][0], stakes[i][1], stakes[i][2]), q, sc.set(1, 1, 1)); this.stakes.setMatrixAt(i, m); }
    this.stakes.count = nS; this.stakes.visible = nS > 0; this.stakes.instanceMatrix.needsUpdate = true; this.counts.stakes = nS;
  }

  /** The weather over the ground: `{ kind, density }` from states.js weatherOf; the particles are as many as the preset allows times the density. */
  setWeather(w) {
    const cap = this.preset.effects.weather; const kind = cap && w?.kind ? w.kind : null; const n = kind ? Math.round(cap * Math.max(0.2, Math.min(1, w.density || 0.5))) : 0;
    const sig = `${kind}:${n}`; if (sig === this.weatherSig) return; this.weatherSig = sig;
    if (!n) { this.weather.visible = false; this.counts.weather = 0; return; }
    const a = new Float32Array(n * 4); for (let i = 0; i < n; i++) { a[i * 4] = hashSeed(i * 3 + 1) * 2 - 1; a[i * 4 + 1] = hashSeed(i * 3 + 2); a[i * 4 + 2] = hashSeed(i * 3 + 3) * 2 - 1; a[i * 4 + 3] = hashSeed(i * 3 + 4); }
    this.weather.geometry.dispose(); const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); geo.setAttribute('aW', new THREE.BufferAttribute(a, 4)); this.weather.geometry = geo;
    this.weather.material.uniforms.uKind.value = kind === 'snow' ? 0 : 1; this.weather.visible = true; this.counts.weather = n;
  }

  /** Every frame: the clock, the size of a point on this screen, and where the weather is centred (the camera's ground). */
  frame(time, { camera, height, target } = {}) {
    for (const p of [this.soft, this.glow]) { p.material.uniforms.uTime.value = time; if (camera && height) p.material.uniforms.uScale.value = (height * 0.5) / Math.tan((camera.fov * Math.PI) / 360); }
    const u = this.weather.material.uniforms; u.uTime.value = time; if (target) u.uCentre.value.set(target.x, (target.y || 0) - 10, target.z);
  }
  /** What is drawn now (draw calls and particles): for the budget checks and the dev page. */
  stats() { return { ...this.counts, drawCalls: [this.soft, this.glow, this.tents, this.pavilions, this.stakes, this.weather].filter((o) => o.visible).length }; }
  dispose() { for (const o of [this.soft, this.glow, this.tents, this.pavilions, this.stakes, this.weather]) { this.scene.remove(o); o.geometry?.dispose?.(); o.material?.dispose?.(); } }
}
export { weatherOf };
