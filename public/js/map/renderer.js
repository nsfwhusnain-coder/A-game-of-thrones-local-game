// Interactive map: terrain raster + political overlay + vector rivers/roads + holdings, armies and labels.
import { WORLD, RIVERS, ROADS, WALL, LABELS, JUNCTIONS } from '../../data/geography.js';
import { realmOf, getRelation, fmt, resolvePlaceId } from '../shared/world.js';
import { drawSigil } from '../sigils.js';
import { makeNoise } from './noise.js';

const GEN_VERSION = 'terrain-v7';
const TERRAIN_SCALE = 1;

// ---------- small IndexedDB cache so the world is only generated once ----------
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('westeros-cache', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function cacheGet(key) {
  try { const db = await idb(); return await new Promise((res) => { const q = db.transaction('kv').objectStore('kv').get(key); q.onsuccess = () => res(q.result); q.onerror = () => res(null); }); } catch { return null; }
}
async function cacheSet(key, val) {
  try { const db = await idb(); await new Promise((res) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(val, key); t.oncomplete = res; t.onerror = res; }); } catch { /* ignore */ }
}

function hexToRgb(hex) {
  let h = String(hex || '#888').replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function jitterLine(pts, seed, amp, step = 4) {
  // Catmull-Rom densify + perpendicular noise for natural meanders
  const { noise } = makeNoise(seed);
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const n = Math.max(2, Math.round(len / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
      const y = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
      out.push([x, y]);
    }
  }
  out.push(pts[pts.length - 1]);
  // perpendicular displacement, tapered at ends
  const res = out.map((p, i) => {
    const a = out[Math.max(0, i - 1)], b = out[Math.min(out.length - 1, i + 1)];
    let nx = -(b[1] - a[1]), ny = b[0] - a[0]; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
    const taper = Math.min(1, i / 4, (out.length - 1 - i) / 4);
    const d = (noise(i * 0.12, seed) + 0.5 * noise(i * 0.4, seed + 7)) * amp * taper;
    return [p[0] + nx * d, p[1] + ny * d];
  });
  return res;
}

export class MapView {
  constructor(canvas, handlers = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.h = handlers;
    this.mode = 'political';
    this.cam = { x: 520, y: 1000, z: 0.5 };
    this.selected = null;         // holding id
    this.selectedArmy = null;
    this.hover = null;
    this.highlights = [];         // [{pos,[x,y], color, t0}]
    this.state = null;
    this.dirty = true;
    this.dpr = Math.max(1, window.devicePixelRatio || 1);
    this.rivers = RIVERS.map((r, i) => ({ ...r, line: jitterLine(r.pts, 100 + i, 4 + r.w, 3) }));
    this.wall = jitterLine(WALL, 5, 1.2, 4);
    this.bindInput();
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement || canvas);
    this.resize();
    const loop = (t) => { this.now = t; if (this.dirty || this.highlights.length) { this.draw(); this.dirty = false; } requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  async generate(holdings, onProgress) {
    this.seeds = Object.values(holdings).map((h) => ({ id: h.id, x: h.pos[0], y: h.pos[1], w: h.type === 'great_castle' || h.type === 'city' ? 1.35 : h.type === 'camp' || h.type === 'ruin' ? 0.7 : 1 }));
    const key = GEN_VERSION + ':' + TERRAIN_SCALE + ':' + this.seeds.map((s) => s.id + s.x + s.y).join('|').length + ':' + this.seeds.length;
    let data = await cacheGet(key);
    if (!data || !data.seedIds || data.seedIds.join() !== this.seeds.map((s) => s.id).join()) {
      data = await new Promise((resolve, reject) => {
        const w = new Worker(new URL('./terrain.worker.js', import.meta.url), { type: 'module' });
        w.onmessage = (e) => {
          if (e.data.type === 'progress') onProgress?.(e.data.p, e.data.msg);
          else if (e.data.type === 'done') { w.terminate(); resolve(e.data); }
        };
        w.onerror = (e) => reject(e);
        w.postMessage({ scale: TERRAIN_SCALE, seeds: this.seeds });
      });
      data.seedIds = this.seeds.map((s) => s.id);
      cacheSet(key, data);
    }
    this.W = data.W; this.H = data.H; this.scale = data.scale;
    this.province = data.province; this.land = data.land;
    const tc = document.createElement('canvas'); tc.width = data.W; tc.height = data.H;
    tc.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(data.rgba.buffer ? data.rgba : data.rgba), data.W, data.H), 0, 0);
    this.terrain = tc;
    this.overlay = document.createElement('canvas'); this.overlay.width = data.W; this.overlay.height = data.H;
    this.selCanvas = document.createElement('canvas'); this.selCanvas.width = data.W; this.selCanvas.height = data.H;
    this.provPixels = null;
    this.computeProvinceStats();
    this.dirty = true;
  }

  computeProvinceStats() {
    // centroid & pixel count per province (for labels)
    const n = this.seeds.length, sx = new Float64Array(n), sy = new Float64Array(n), cnt = new Uint32Array(n);
    const { W, H, province } = this;
    for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) { const k = province[y * W + x]; if (k >= 0) { sx[k] += x; sy[k] += y; cnt[k]++; } }
    this.provStats = this.seeds.map((s, k) => ({ cx: cnt[k] ? sx[k] / cnt[k] / this.scale : s.x, cy: cnt[k] ? sy[k] / cnt[k] / this.scale : s.y, area: cnt[k] * 4 }));
  }

  setState(state) {
    const first = !this.state;
    this.state = state;
    this.recolor();
    if (first) this.fitTo(state.holdings[state.houses[state.meta.player]?.seat]?.pos || [500, 1000], 0.62);
    this.dirty = true;
  }

  setMode(m) { this.mode = m; this.recolor(); this.dirty = true; }

  colorFor(holdingId) {
    const s = this.state; const hd = s.holdings[holdingId]; if (!hd) return [128, 128, 128];
    const owner = s.houses[hd.owner];
    const p = s.meta.player;
    switch (this.mode) {
      case 'houses': return hexToRgb(owner?.color);
      case 'diplomacy': {
        const realm = realmOf(s, hd.owner);
        if (hd.owner === p || realm === realmOf(s, p) && (s.houses[hd.owner]?.liege === p || hd.owner === p)) return [70, 120, 220];
        const inWar = s.wars.some((w) => w.status !== 'ended' && ((w.attackers.includes(p) && (w.defenders.includes(hd.owner) || w.defenders.includes(realm))) || (w.defenders.includes(p) && (w.attackers.includes(hd.owner) || w.attackers.includes(realm)))));
        if (inWar) return [200, 40, 30];
        const r = getRelation(s, p, hd.owner) || getRelation(s, p, realm);
        if (r >= 0) return [Math.round(200 - r * 1.4), 190, Math.round(120 - r * 0.6)];
        return [220, Math.round(190 + r * 1.3), Math.round(120 + r * 0.6)];
      }
      case 'unrest': { const u = hd.unrest / 100; return [Math.round(80 + 170 * u), Math.round(170 - 130 * u), 60]; }
      case 'prosperity': { const u = hd.prosperity / 100; return [Math.round(200 - 140 * u), Math.round(120 + 90 * u), 60]; }
      default: return hexToRgb(s.houses[realmOf(s, hd.owner)]?.color);
    }
  }

  recolor() {
    if (!this.province || !this.state) return;
    const { W, H, province } = this;
    const n = this.seeds.length;
    const pal = new Uint8Array(n * 3), realmIdx = new Int32Array(n), ownerIdx = new Int32Array(n);
    const realmIds = new Map();
    for (let k = 0; k < n; k++) {
      const id = this.seeds[k].id; const c = this.colorFor(id);
      pal[k * 3] = c[0]; pal[k * 3 + 1] = c[1]; pal[k * 3 + 2] = c[2];
      const owner = this.state.holdings[id]?.owner;
      const r = realmOf(this.state, owner);
      if (!realmIds.has(r)) realmIds.set(r, realmIds.size);
      realmIdx[k] = realmIds.get(r);
      if (!realmIds.has('o:' + owner)) realmIds.set('o:' + owner, realmIds.size);
      ownerIdx[k] = realmIds.get('o:' + owner);
    }
    const ctx = this.overlay.getContext('2d');
    const img = ctx.createImageData(W, H); const d = img.data;
    const fillA = this.mode === 'terrain' ? 0 : this.mode === 'political' ? 110 : 140;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, k = province[i]; if (k < 0) continue;
      const o = i * 4;
      const kr = x < W - 1 ? province[i + 1] : k, kd = y < H - 1 ? province[i + W] : k;
      const kl = x > 0 ? province[i - 1] : k, ku = y > 0 ? province[i - W] : k;
      let border = 0;
      for (const kk of [kr, kd, kl, ku]) {
        if (kk === k) continue;
        if (kk < 0) continue;
        if (realmIdx[kk] !== realmIdx[k]) border = Math.max(border, 3);
        else if (ownerIdx[kk] !== ownerIdx[k]) border = Math.max(border, 2);
        else border = Math.max(border, 1);
      }
      if (border === 3 && this.mode !== 'terrain') { d[o] = pal[k * 3] * 0.35; d[o + 1] = pal[k * 3 + 1] * 0.35; d[o + 2] = pal[k * 3 + 2] * 0.35; d[o + 3] = 235; }
      else if (border === 2) { d[o] = 30; d[o + 1] = 24; d[o + 2] = 18; d[o + 3] = this.mode === 'terrain' ? 60 : 150; }
      else if (border === 1) { d[o] = 30; d[o + 1] = 24; d[o + 2] = 18; d[o + 3] = this.mode === 'terrain' ? 30 : 70; }
      else { d[o] = pal[k * 3]; d[o + 1] = pal[k * 3 + 1]; d[o + 2] = pal[k * 3 + 2]; d[o + 3] = fillA; }
    }
    ctx.putImageData(img, 0, 0);
    // realm label anchors
    const agg = new Map();
    for (let k = 0; k < n; k++) {
      const owner = this.state.holdings[this.seeds[k].id]?.owner;
      const r = realmOf(this.state, owner);
      const st = this.provStats[k]; if (!st.area) continue;
      const a = agg.get(r) || { sx: 0, sy: 0, area: 0, minx: 1e9, maxx: -1e9, miny: 1e9, maxy: -1e9 };
      a.sx += st.cx * st.area; a.sy += st.cy * st.area; a.area += st.area;
      a.minx = Math.min(a.minx, st.cx); a.maxx = Math.max(a.maxx, st.cx); a.miny = Math.min(a.miny, st.cy); a.maxy = Math.max(a.maxy, st.cy);
      agg.set(r, a);
    }
    this.realmLabels = [...agg.entries()].map(([r, a]) => ({ realm: r, x: a.sx / a.area, y: a.sy / a.area, area: a.area / (this.scale * this.scale), w: a.maxx - a.minx, h: a.maxy - a.miny }));
    this.drawSelection();
  }

  drawSelection() {
    const ctx = this.selCanvas.getContext('2d');
    ctx.clearRect(0, 0, this.W, this.H);
    if (!this.selected || !this.province) return;
    const k = this.seeds.findIndex((s) => s.id === this.selected); if (k < 0) return;
    const { W, H, province } = this;
    const img = ctx.createImageData(W, H); const d = img.data;
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x; if (province[i] !== k) continue;
      const edge = province[i + 1] !== k || province[i - 1] !== k || province[i + W] !== k || province[i - W] !== k;
      const o = i * 4;
      if (edge) { d[o] = 255; d[o + 1] = 230; d[o + 2] = 140; d[o + 3] = 255; } else { d[o] = 255; d[o + 1] = 240; d[o + 2] = 200; d[o + 3] = 45; }
    }
    ctx.putImageData(img, 0, 0);
  }

  select(holdingId, { fly = false } = {}) {
    this.selected = holdingId; this.drawSelection(); this.dirty = true;
    if (fly && this.state?.holdings[holdingId]) this.flyTo(this.state.holdings[holdingId].pos);
  }

  flash(pos, color = '#ffd76a') { this.highlights.push({ pos, color, t0: performance.now() }); }

  // ---------- camera ----------
  resize() {
    const r = this.canvas.parentElement.getBoundingClientRect();
    this.cssW = r.width; this.cssH = r.height;
    this.canvas.width = Math.round(r.width * this.dpr); this.canvas.height = Math.round(r.height * this.dpr);
    this.canvas.style.width = r.width + 'px'; this.canvas.style.height = r.height + 'px';
    this.dirty = true;
  }
  fitTo(pos, z) { this.cam.x = pos[0]; this.cam.y = pos[1]; this.cam.z = z; this.clampCam(); this.dirty = true; }
  flyTo(pos, z) {
    const from = { ...this.cam }, to = { x: pos[0], y: pos[1], z: z || Math.max(this.cam.z, 1.1) };
    const t0 = performance.now(), dur = 600;
    const step = () => {
      const t = Math.min(1, (performance.now() - t0) / dur), e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      this.cam.x = from.x + (to.x - from.x) * e; this.cam.y = from.y + (to.y - from.y) * e; this.cam.z = from.z + (to.z - from.z) * e;
      this.dirty = true; if (t < 1) requestAnimationFrame(step);
    };
    step();
  }
  clampCam() {
    this.cam.z = Math.max(0.28, Math.min(7, this.cam.z));
    this.cam.x = Math.max(0, Math.min(WORLD.w, this.cam.x)); this.cam.y = Math.max(0, Math.min(WORLD.h, this.cam.y));
  }
  toScreen(x, y) { return [(x - this.cam.x) * this.cam.z + this.cssW / 2, (y - this.cam.y) * this.cam.z + this.cssH / 2]; }
  toWorld(sx, sy) { return [(sx - this.cssW / 2) / this.cam.z + this.cam.x, (sy - this.cssH / 2) / this.cam.z + this.cam.y]; }

  bindInput() {
    const c = this.canvas; let drag = null; let moved = false;
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = c.getBoundingClientRect(); const mx = e.clientX - r.left, my = e.clientY - r.top;
      const [wx, wy] = this.toWorld(mx, my);
      this.cam.z *= Math.exp(-e.deltaY * 0.0015);
      this.clampCam();
      this.cam.x = wx - (mx - this.cssW / 2) / this.cam.z; this.cam.y = wy - (my - this.cssH / 2) / this.cam.z;
      this.clampCam(); this.dirty = true;
    }, { passive: false });
    c.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, cx: this.cam.x, cy: this.cam.y }; moved = false; c.setPointerCapture(e.pointerId); });
    c.addEventListener('pointermove', (e) => {
      const r = c.getBoundingClientRect();
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
        if (moved) { this.cam.x = drag.cx - dx / this.cam.z; this.cam.y = drag.cy - dy / this.cam.z; this.clampCam(); this.dirty = true; c.style.cursor = 'grabbing'; }
      } else {
        const hit = this.hitTest(e.clientX - r.left, e.clientY - r.top);
        const key = hit ? hit.type + hit.id : null;
        if (key !== this.hoverKey) { this.hoverKey = key; this.hover = hit; this.dirty = true; this.h.onHover?.(hit, e); }
        else if (hit) this.h.onHover?.(hit, e);
        c.style.cursor = hit ? 'pointer' : 'default';
      }
    });
    c.addEventListener('pointerup', (e) => {
      c.style.cursor = 'default';
      if (drag && !moved) {
        const r = c.getBoundingClientRect();
        const hit = this.hitTest(e.clientX - r.left, e.clientY - r.top);
        if (hit?.type === 'army') { this.selectedArmy = hit.id; this.h.onSelectArmy?.(hit.id); }
        else if (hit?.type === 'holding') { this.selectedArmy = null; this.select(hit.id); this.h.onSelect?.(hit.id); }
        else { this.selectedArmy = null; this.select(null); this.h.onSelect?.(null); }
        this.dirty = true;
      }
      drag = null;
    });
    c.addEventListener('pointerleave', () => { this.hover = null; this.hoverKey = null; this.h.onHover?.(null); this.dirty = true; });
  }

  hitTest(sx, sy) {
    if (!this.state) return null;
    // armies (screen-space counters)
    for (const a of this.armyLayout || []) {
      if (Math.abs(sx - a.sx) < 20 && Math.abs(sy - a.sy) < 12) return { type: 'army', id: a.id };
    }
    // holding icons
    let best = null, bd = 12 * 12;
    for (const h of Object.values(this.state.holdings)) {
      if (!this.holdingVisible(h)) continue;
      const [x, y] = this.toScreen(h.pos[0], h.pos[1]);
      const d = (x - sx) ** 2 + (y - sy) ** 2; if (d < bd) { bd = d; best = h.id; }
    }
    if (best) return { type: 'holding', id: best };
    const [wx, wy] = this.toWorld(sx, sy);
    const px = Math.floor(wx * this.scale), py = Math.floor(wy * this.scale);
    if (px < 0 || py < 0 || px >= this.W || py >= this.H) return null;
    const k = this.province[py * this.W + px];
    return k >= 0 ? { type: 'holding', id: this.seeds[k].id, area: true } : null;
  }

  holdingVisible(h) {
    const z = this.cam.z;
    if (h.type === 'great_castle' || h.type === 'city') return true;
    const lord = this.state.houses[h.owner];
    if (h.seatOf && lord?.rank === 'major') return z > 0.55;
    return z > 0.85;
  }

  // ---------- drawing ----------
  draw() {
    const { ctx, cam } = this;
    const dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0f1f2e'; ctx.fillRect(0, 0, this.cssW, this.cssH);
    if (!this.terrain) return;
    ctx.save();
    ctx.translate(this.cssW / 2, this.cssH / 2); ctx.scale(cam.z, cam.z); ctx.translate(-cam.x, -cam.y);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.terrain, 0, 0, WORLD.w, WORLD.h);
    // rivers
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const r of this.rivers) {
      const L = r.line; const n = L.length;
      for (let i = 0; i < n - 1; i++) {
        const t = i / n; ctx.beginPath(); ctx.moveTo(L[i][0], L[i][1]); ctx.lineTo(L[i + 1][0], L[i + 1][1]);
        ctx.strokeStyle = 'rgba(52,96,122,0.95)'; ctx.lineWidth = (0.5 + r.w * (0.35 + 0.65 * t)) * Math.max(0.7, 1 / Math.sqrt(cam.z)); ctx.stroke();
      }
    }
    // political overlay
    if (this.overlay) { ctx.globalAlpha = this.mode === 'terrain' ? 1 : Math.max(0.45, Math.min(0.95, 1.12 - cam.z * 0.3)); ctx.drawImage(this.overlay, 0, 0, WORLD.w, WORLD.h); ctx.globalAlpha = 1; }
    if (this.selCanvas && this.selected) ctx.drawImage(this.selCanvas, 0, 0, WORLD.w, WORLD.h);
    // The Wall
    ctx.beginPath(); this.wall.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.strokeStyle = 'rgba(40,60,80,0.9)'; ctx.lineWidth = 6; ctx.stroke();
    ctx.strokeStyle = '#e9f4fb'; ctx.lineWidth = 3.6; ctx.stroke();
    // roads
    if (cam.z > 0.5) {
      ctx.setLineDash([3, 2.5]); ctx.lineWidth = 1.1 / Math.max(1, cam.z * 0.5); ctx.strokeStyle = 'rgba(92,64,34,0.75)';
      for (const road of ROADS) {
        const pts = road.via.map((id) => this.placePos(id)).filter(Boolean);
        if (pts.length < 2) continue;
        ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    ctx.restore();

    // ----- screen-space layers -----
    this.drawLabels();
    this.drawBattles();
    this.drawHoldings();
    this.drawArmies();
    this.drawHighlights();
  }

  placePos(id) {
    const pid = resolvePlaceId(id) || id;
    if (this.state?.holdings[pid]) return this.state.holdings[pid].pos;
    if (JUNCTIONS[pid]) return JUNCTIONS[pid];
    return null;
  }

  drawLabels() {
    const { ctx, cam } = this;
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    // sea & feature labels
    for (const l of LABELS) {
      if (l.kind === 'feature' && cam.z < 0.7) continue;
      if (l.kind === 'sea' && l.s < 14 && cam.z < 0.6) continue;
      const [x, y] = this.toScreen(l.x, l.y);
      if (x < -300 || y < -300 || x > this.cssW + 300 || y > this.cssH + 300) continue;
      const size = Math.max(9, Math.min(28, l.s * Math.sqrt(cam.z) * 0.95));
      ctx.save(); ctx.translate(x, y); ctx.rotate(l.rot || 0);
      ctx.font = `${l.kind === 'sea' ? 'italic ' : ''}${size}px "Cinzel", "IM Fell English", Georgia, serif`;
      ctx.letterSpacing = l.kind === 'sea' ? `${size * 0.35}px` : `${size * 0.12}px`;
      ctx.fillStyle = l.kind === 'sea' ? 'rgba(190,215,230,0.55)' : 'rgba(40,30,20,0.6)';
      if (l.kind !== 'sea') { ctx.strokeStyle = 'rgba(240,230,200,0.35)'; ctx.lineWidth = 3; ctx.strokeText(l.t, 0, 0); }
      ctx.fillText(l.t, 0, 0);
      ctx.restore();
    }
    // realm names (big) when zoomed out, largest first, skipping collisions
    if (this.realmLabels && this.mode !== 'terrain' && cam.z < 1.6) {
      const alpha = Math.max(0, Math.min(1, (1.6 - cam.z) / 0.7));
      const placed = [];
      const labels = [...this.realmLabels].sort((a, b) => b.area - a.area);
      for (const r of labels) {
        const h = this.state.houses[r.realm]; if (!h) continue;
        const name = (h.realmName || h.name).toUpperCase();
        const [x, y] = this.toScreen(r.x, r.y);
        const extent = Math.max(r.w, 60) * cam.z;
        let size = Math.min(34, Math.sqrt(r.area) * cam.z * 0.1, (extent * 1.1) / (name.length * 0.95));
        size = Math.max(9, size);
        ctx.font = `600 ${size}px "Cinzel", Georgia, serif`;
        ctx.letterSpacing = `${size * 0.25}px`;
        const tw = ctx.measureText(name).width;
        const box = [x - tw / 2 - 4, y - size / 2 - 2, x + tw / 2 + 4, y + size / 2 + 2];
        if (placed.some((b) => !(box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3]))) continue;
        placed.push(box);
        ctx.globalAlpha = alpha * 0.85;
        ctx.strokeStyle = 'rgba(20,14,8,0.55)'; ctx.lineWidth = Math.max(2, size * 0.12); ctx.strokeText(name, x, y);
        ctx.fillStyle = 'rgba(248,238,214,0.92)'; ctx.fillText(name, x, y);
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  drawHoldings() {
    const { ctx, cam } = this;
    const s = this.state; if (!s) return;
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const list = Object.values(s.holdings).filter((h) => this.holdingVisible(h));
    for (const h of list) {
      const [x, y] = this.toScreen(h.pos[0], h.pos[1]);
      if (x < -40 || y < -40 || x > this.cssW + 40 || y > this.cssH + 40) continue;
      const owner = s.houses[h.owner];
      const great = h.type === 'great_castle' || h.type === 'city';
      const size = Math.max(5, Math.min(great ? 16 : 11, (great ? 9 : 6) * Math.sqrt(cam.z) * 1.2));
      this.drawCastleIcon(ctx, x, y, size, h, owner);
      const showName = great ? cam.z > 0.45 : cam.z > 1.05;
      if (showName) {
        const fs = Math.max(9, Math.min(15, (great ? 11 : 9.5) * Math.sqrt(cam.z)));
        ctx.font = `${great ? '600 ' : ''}${fs}px "Cinzel", Georgia, serif`;
        ctx.letterSpacing = '0.5px';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(20,14,8,0.85)'; ctx.strokeText(h.name, x, y + size * 0.75);
        ctx.fillStyle = h.id === this.selected ? '#ffe28a' : '#f4ead2'; ctx.fillText(h.name, x, y + size * 0.75);
      }
      if (cam.z > 1.6 && owner?.sigil && h.seatOf) drawSigil(ctx, owner.sigil, x + size * 1.05, y - size * 0.7, size * 0.95);
      if (h.status && h.status !== 'normal') {
        ctx.font = `${Math.max(10, size)}px serif`; ctx.fillText(h.status === 'besieged' ? '⚔' : h.status === 'burning' || h.status === 'sacked' ? '🔥' : '⚑', x - size * 1.1, y - size * 1.2);
      }
    }
    ctx.restore();
  }

  drawCastleIcon(ctx, x, y, s, h, owner) {
    const col = owner?.color || '#888';
    ctx.save();
    ctx.translate(x, y);
    ctx.lineWidth = Math.max(1, s * 0.12); ctx.strokeStyle = '#1b140d';
    if (h.type === 'city') {
      ctx.fillStyle = '#e8dcc0';
      ctx.beginPath(); ctx.arc(0, 0, s * 0.62, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, s * 0.34, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    } else if (h.type === 'camp') {
      ctx.fillStyle = '#d8c8a0'; ctx.beginPath(); ctx.moveTo(-s * 0.6, s * 0.4); ctx.lineTo(0, -s * 0.6); ctx.lineTo(s * 0.6, s * 0.4); ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (h.type === 'ruin') {
      ctx.fillStyle = '#8a8378'; ctx.fillRect(-s * 0.5, -s * 0.2, s * 0.3, s * 0.6); ctx.fillRect(s * 0.05, -s * 0.45, s * 0.3, s * 0.85);
    } else {
      // keep with crenellations
      const w = s * (h.type === 'great_castle' || h.type === 'fortress' ? 1.1 : 0.85), hh = s * 0.75;
      ctx.fillStyle = '#e4d6b4';
      ctx.beginPath();
      ctx.moveTo(-w / 2, hh / 2); ctx.lineTo(-w / 2, -hh / 2);
      const m = 5; for (let i = 0; i < m; i++) { const x0 = -w / 2 + (w / m) * i; ctx.lineTo(x0, -hh / 2 - (i % 2 === 0 ? s * 0.2 : 0)); ctx.lineTo(x0 + w / m, -hh / 2 - (i % 2 === 0 ? s * 0.2 : 0)); }
      ctx.lineTo(w / 2, hh / 2); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = col; ctx.fillRect(-w * 0.18, -hh * 0.05, w * 0.36, hh * 0.55);
    }
    if (h.id === this.selected) { ctx.strokeStyle = '#ffd76a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, s * 0.95, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();
  }

  drawArmies() {
    const { ctx } = this; const s = this.state; if (!s) return;
    const layout = []; const stackCount = new Map();
    ctx.save();
    for (const a of Object.values(s.armies)) {
      const key = Math.round(a.pos[0] / 6) + ',' + Math.round(a.pos[1] / 6);
      const idx = stackCount.get(key) || 0; stackCount.set(key, idx + 1);
      let [x, y] = this.toScreen(a.pos[0], a.pos[1]);
      x += 20 + idx * 6; y -= 16 + idx * 15;
      if (a.dest) {
        const [dx, dy] = this.toScreen(a.dest[0], a.dest[1]);
        ctx.setLineDash([6, 4]); ctx.strokeStyle = 'rgba(255,240,200,0.9)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x - 20, y + 16); ctx.lineTo(dx, dy); ctx.stroke(); ctx.setLineDash([]);
        const ang = Math.atan2(dy - (y + 16), dx - (x - 20));
        ctx.fillStyle = 'rgba(255,240,200,0.95)'; ctx.beginPath(); ctx.moveTo(dx, dy); ctx.lineTo(dx - 10 * Math.cos(ang - 0.4), dy - 10 * Math.sin(ang - 0.4)); ctx.lineTo(dx - 10 * Math.cos(ang + 0.4), dy - 10 * Math.sin(ang + 0.4)); ctx.fill();
      }
      if (x < -60 || y < -40 || x > this.cssW + 60 || y > this.cssH + 40) continue;
      layout.push({ id: a.id, sx: x, sy: y });
      const owner = s.houses[a.owner];
      const w = 44, h = 20;
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x - w / 2 + 2, y - h / 2 + 2, w, h);
      ctx.fillStyle = owner?.color || '#777'; ctx.fillRect(x - w / 2, y - h / 2, w, h);
      ctx.strokeStyle = a.id === this.selectedArmy ? '#ffd76a' : (a.owner === s.meta.player ? '#f5e6b8' : '#1b140d');
      ctx.lineWidth = a.id === this.selectedArmy ? 2.5 : 1.5; ctx.strokeRect(x - w / 2, y - h / 2, w, h);
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(x - w / 2, y - h / 2, 16, h);
      ctx.fillStyle = '#f5ecd6'; ctx.font = '12px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(a.type === 'fleet' ? '⛵' : '⚔', x - w / 2 + 8, y + 1);
      ctx.font = '600 11px "Cinzel", Georgia, serif';
      const label = a.men >= 1000 ? (a.men / 1000).toFixed(a.men >= 10000 ? 0 : 1) + 'k' : String(a.men);
      ctx.fillText(a.type === 'fleet' && a.ships ? `${a.ships}` : label, x + 8, y + 1);
      // pin line to actual position
      const [px, py] = this.toScreen(a.pos[0], a.pos[1]);
      ctx.strokeStyle = 'rgba(20,14,8,0.8)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x - w / 2, y + h / 2); ctx.stroke();
      ctx.fillStyle = owner?.color || '#777'; ctx.beginPath(); ctx.arc(px, py, 2.5, 0, 7); ctx.fill();
    }
    ctx.restore();
    this.armyLayout = layout;
  }

  drawBattles() {
    const { ctx } = this; const s = this.state; if (!s?.battles) return;
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const b of s.battles) {
      if (!b.pos || s.meta.turn - b.turn > 3) continue;
      const [x, y] = this.toScreen(b.pos[0], b.pos[1]);
      ctx.globalAlpha = 1 - (s.meta.turn - b.turn) * 0.25;
      ctx.fillStyle = 'rgba(120,10,10,0.85)'; ctx.beginPath(); ctx.arc(x, y, 11, 0, 7); ctx.fill();
      ctx.strokeStyle = '#f2d18a'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.font = '13px serif'; ctx.fillStyle = '#fff'; ctx.fillText('⚔', x, y + 1);
    }
    ctx.restore();
  }

  drawHighlights() {
    const { ctx } = this; const now = performance.now();
    this.highlights = this.highlights.filter((h) => now - h.t0 < 6000);
    for (const h of this.highlights) {
      const [x, y] = this.toScreen(h.pos[0], h.pos[1]);
      const t = ((now - h.t0) % 1500) / 1500;
      ctx.strokeStyle = h.color; ctx.globalAlpha = 1 - t; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, 6 + t * 30, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
    }
  }
}
