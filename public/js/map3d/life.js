// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE LIVING MAP
//
// Between turns the map used to hold its breath: castles, hosts, and nothing else moving. But a
// realm is not its armies. It is carts on the roads, ravens overhead, columns of people walking
// away from a war they did not ask for, outriders sweeping ahead of a host, deserters slipping
// into the trees at dusk.
//
// None of this is decoration for its own sake. Every one of these is READ FROM THE STATE and says
// something true about it: refugees leave holdings that are besieged, sacked or seething; carts
// run between prosperous neighbours and stop when the road is at war; ravens fly the letters that
// were actually sent; deserters leak out of hosts whose morale has broken. If you learn to read
// the map, you can see a war coming before the chronicle tells you.
//
// The simulation tick and the render tick are decoupled: these things move every frame along
// smoothed A* paths, at their own pace, whether or not a turn is being resolved.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import * as THREE from 'three';

const KINDS = {
  refugee: { cap: 260, speed: 2.4, colour: '#8d7a5e', size: [1.5, 2.6, 1.5], y: 0.6 },
  cart: { cap: 160, speed: 4.2, colour: '#6f5637', size: [2.2, 1.6, 1.4], y: 0.5 },
  deserter: { cap: 120, speed: 3.4, colour: '#5b5b52', size: [1.2, 2.2, 1.2], y: 0.5 },
  outrider: { cap: 120, speed: 9.0, colour: '#9a8c6a', size: [1.6, 1.9, 1.6], y: 0.6 },
  raven: { cap: 90, speed: 26, colour: '#1b1b1f', size: [1.5, 0.5, 2.4], y: 26 },
};

const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; };
const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;

export class LivingMap {
  /** @param scene THREE.Scene @param opts { groundAt(x,z), grid, enabled } */
  constructor(scene, opts) {
    this.scene = scene; this.o = opts;
    this.groups = {};
    this.entities = [];
    this.enabled = opts.enabled !== false;
    const dummy = new THREE.Object3D(); this.dummy = dummy;
    for (const [kind, k] of Object.entries(KINDS)) {
      const geo = kind === 'raven'
        ? new THREE.ConeGeometry(k.size[0] * 0.5, k.size[2], 4)
        : kind === 'cart'
          ? new THREE.BoxGeometry(...k.size)
          : new THREE.CylinderGeometry(k.size[0] * 0.35, k.size[0] * 0.45, k.size[1], 5);
      const mat = new THREE.MeshLambertMaterial({ color: k.colour, transparent: true, opacity: 0.95 });
      const mesh = new THREE.InstancedMesh(geo, mat, k.cap);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false;
      mesh.count = 0; mesh.visible = this.enabled;
      mesh.userData.kind = kind;
      scene.add(mesh);
      this.groups[kind] = mesh;
    }
  }

  setEnabled(on) { this.enabled = on; for (const m of Object.values(this.groups)) m.visible = on; }
  dispose() { for (const m of Object.values(this.groups)) { this.scene.remove(m); m.geometry.dispose(); m.material.dispose(); } }

  // ── Reading the realm ────────────────────────────────────────────────────────────────────────
  /**
   * Work out who is on the roads, given the state of the world. Called once per turn, not per
   * frame: paths are expensive, walking them is not.
   */
  sync(state) {
    if (!state || !this.o.grid) return;
    this.state = state;
    const keep = new Map(this.entities.map((e) => [e.id, e]));
    const budget = { n: 48 }; // A* calls this sync
    const next = [];
    const want = (id, kind, from, to, extra = {}) => {
      const old = keep.get(id);
      if (old && old.kind === kind && dist2(old.to, to) < 4) { Object.assign(old, extra); next.push(old); return; }
      // A raven flies straight; everyone else follows the ground. Pathfinding is capped per sync
      // so a realm in chaos cannot cost a frame: the rest are given their roads at the next.
      // (a walker whose road is not found yet waits for the next sync: the straight line it used to take was kept, and crossed the mountains and the lakes)
      if (kind !== 'raven' && budget.n <= 0) { if (old && old.kind === kind) next.push(old); return; }
      const path = kind === 'raven' ? [[...from], [...to]] : (budget.n--, this.o.grid.find(from, to, 'land'));
      if (!path || path.length < 2) return;
      // an A* path can be hundreds of points; walking it every frame for hundreds of entities is
      // needless work, so each road is thinned to at most 64 waypoints once, here
      next.push({ id, kind, from: [...from], to: [...to], path: thin(path, 64), t: old?.t ?? hash(id), ...extra });
    };

    const holdings = Object.values(state.holdings || {});
    const calm = holdings.filter((h) => (h.unrest ?? 0) < 35 && !/besieg|sack|burn|ruin/i.test(h.status || ''));
    const nearestCalm = (h) => {
      let best = null, bd = Infinity;
      for (const c of calm) { if (c.id === h.id) continue; const d = dist2(h.pos, c.pos); if (d < bd && d > 25) { bd = d; best = c; } }
      return best;
    };

    // ── people walking away from a war ──
    for (const h of holdings) {
      const beset = /besieg|sack|burn/i.test(h.status || '');
      const seething = (h.unrest ?? 0) > 58;
      if (!beset && !seething) continue;
      const dest = nearestCalm(h); if (!dest) continue;
      const n = Math.min(5, 1 + Math.round(((beset ? 3 : 0) + (h.unrest ?? 0) / 25) * ((h.population || 5000) / 12000 + 0.5)));
      for (let i = 0; i < n; i++) want(`ref:${h.id}:${i}`, 'refugee', h.pos, dest.pos, { home: h.id, spread: 3 + i });
    }

    // ── trade: carts between prosperous neighbours, and not through a war ──
    const rich = holdings.filter((h) => (h.prosperity ?? 50) > 52 && !/besieg|sack|burn|ruin/i.test(h.status || ''));
    for (const h of rich) {
      let best = null, bd = Infinity;
      for (const o of rich) { if (o.id === h.id || o.owner === undefined) continue; const d = dist2(h.pos, o.pos); if (d < bd && d > 400) { bd = d; best = o; } }
      if (!best || bd > 90000) continue;
      if (this.warBetween(state, h.owner, best.owner)) continue;
      const n = (h.prosperity ?? 50) > 70 ? 2 : 1;
      for (let i = 0; i < n; i++) want(`cart:${h.id}:${i}`, 'cart', h.pos, best.pos, { spread: 2 + i });
    }

    // ── hosts: outriders sweeping ahead, and men slipping away behind ──
    for (const a of Object.values(state.parties || {})) {
      if (a.kind === 'fleet' || a.kind === 'rider') continue;
      if ((a.men || 0) > 2500) {
        const ahead = a.route?.path?.at(-1) || a.pos;
        for (let i = 0; i < (a.men > 12000 ? 3 : 2); i++) want(`scout:${a.id}:${i}`, 'outrider', a.pos, [ahead[0] + Math.cos(i * 2.4) * 26, ahead[1] + Math.sin(i * 2.4) * 26], { loop: true, spread: i });
      }
      if ((a.morale ?? 70) < 45 || (a.supply ?? 80) < 30) {
        const away = this.nearestHolding(state, a.pos, (h) => h.owner === a.owner || (h.unrest ?? 0) < 50);
        if (away) for (let i = 0; i < 2; i++) want(`des:${a.id}:${i}`, 'deserter', a.pos, away.pos, { spread: i });
      }
    }

    // ── ravens: the letters that were really sent ──
    for (const r of (state.ravens || []).slice(0, 12)) {
      const from = this.placePos(state, r.fromLoc || state.characters?.[r.from]?.loc);
      const to = this.placePos(state, r.toLoc || state.characters?.[r.to]?.loc) || this.placePos(state, state.houses?.[state.meta?.player]?.seat);
      if (!from || !to || dist2(from, to) < 100) continue;
      want(`raven:${r.id || r.date + String(r.from)}`, 'raven', from, to, { once: true });
    }

    this.entities = next.slice(0, 700);
  }

  warBetween(state, a, b) {
    if (!a || !b || a === b) return false;
    return (state.wars || []).some((w) => w.status !== 'ended'
      && (((w.attackers || []).includes(a) && (w.defenders || []).includes(b))
        || ((w.defenders || []).includes(a) && (w.attackers || []).includes(b))));
  }
  nearestHolding(state, pos, pred) {
    let best = null, bd = Infinity;
    for (const h of Object.values(state.holdings || {})) { if (pred && !pred(h)) continue; const d = dist2(pos, h.pos); if (d < bd) { bd = d; best = h; } }
    return best;
  }
  placePos(state, id) {
    if (!id) return null;
    const pid = String(id).match(/^(?:party|army):(.+)$/)?.[1]; if (pid) return state.parties?.[pid]?.pos || null;
    return state.holdings?.[id]?.pos || null;
  }

  // ── Walking ──────────────────────────────────────────────────────────────────────────────────
  /** Every frame: move everyone a little way along their road and write the instance matrices. */
  frame(time, dt) {
    if (!this.enabled || !this.entities.length) return;
    const counts = {}; for (const k of Object.keys(KINDS)) counts[k] = 0;
    const d = this.dummy;
    for (const e of this.entities) {
      const k = KINDS[e.kind]; if (!k) continue;
      const mesh = this.groups[e.kind];
      if (counts[e.kind] >= k.cap) continue;
      const len = pathLen(e.path);
      e.t += (k.speed * dt) / Math.max(1, len);
      if (e.t >= 1) {
        if (e.once) { e.dead = true; continue; }
        e.t = e.loop ? 0 : e.t % 1; // carts and refugees keep coming; scouts sweep and sweep again
      }
      const p = along(e.path, e.t);
      const p2 = along(e.path, Math.min(1, e.t + 0.01));
      const heading = Math.atan2(p2[1] - p[1], p2[0] - p[0]);
      const off = ((e.spread || 0) % 5) * 2.2 - 4;
      const x = p[0] + Math.cos(heading + Math.PI / 2) * off;
      const z = p[1] + Math.sin(heading + Math.PI / 2) * off;
      const ground = this.o.groundAt(x, z);
      const y = e.kind === 'raven'
        ? ground + k.y + Math.sin(time * 2 + e.t * 20) * 2.5
        : ground + k.y + (e.kind === 'cart' ? 0 : Math.abs(Math.sin(time * 5 + (e.spread || 0))) * 0.25);
      d.position.set(x, y, z);
      d.rotation.set(e.kind === 'raven' ? Math.PI / 2 : 0, -heading + Math.PI / 2, 0);
      d.scale.setScalar(1);
      d.updateMatrix();
      mesh.setMatrixAt(counts[e.kind]++, d.matrix);
    }
    for (const [kind, mesh] of Object.entries(this.groups)) {
      mesh.count = counts[kind];
      mesh.instanceMatrix.needsUpdate = true;
    }
    if (this.entities.some((e) => e.dead)) this.entities = this.entities.filter((e) => !e.dead);
  }
}

function thin(path, max) {
  if (path.length <= max) return path;
  const out = []; const step = (path.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) out.push(path[Math.round(i * step)]);
  return out;
}
function pathLen(path) {
  if (path.__len) return path.__len;
  let L = 0; for (let i = 1; i < path.length; i++) L += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
  try { Object.defineProperty(path, '__len', { value: L, enumerable: false }); } catch { /* frozen */ }
  return L;
}
function along(path, t) {
  const L = pathLen(path) * Math.max(0, Math.min(1, t));
  let acc = 0;
  for (let i = 1; i < path.length; i++) {
    const seg = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
    if (acc + seg >= L) {
      const f = seg ? (L - acc) / seg : 0;
      return [path[i - 1][0] + (path[i][0] - path[i - 1][0]) * f, path[i - 1][1] + (path[i][1] - path[i - 1][1]) * f];
    }
    acc += seg;
  }
  return [...path[path.length - 1]];
}
