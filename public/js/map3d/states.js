// The living map's states (docs/gdd/11-map-visuals.md §6.2, §6.4, §10; WP E6 + E7): what each holding, host and place looks like when something is happening to it, and
// how much of that each graphics preset may draw. No three.js and no DOM here: the rules only, so a fixture in every state can be tested without a canvas — the map (effects.js)
// draws what these say and nothing else, and every effect is read from the state (a smoke column is a burning holding; a pavilion is a tourney that was held).

/** The graphics presets: Settings → Graphics. `effects` are the caps the living map keeps (0 or false: none). */
export const PRESETS = {
  fast: { label: 'Fast', seg: 480, dpr: 1, shadows: false, ambient: false, effects: { particles: false, smoke: 0, embers: false, weather: 0, festivals: false, camps: 8, columns: false } }, // (11 §10: no particles, no ambient life; tents and the pavilions' cones are drawn, three instanced calls)
  balanced: { label: 'Balanced', seg: 720, dpr: 1.5, shadows: true, ambient: true, effects: { particles: true, smoke: 16, embers: true, weather: 500, festivals: true, camps: 30, columns: true } },
  high: { label: 'Beautiful', seg: 960, dpr: 2, shadows: true, ambient: true, effects: { particles: true, smoke: 40, embers: true, weather: 1400, festivals: true, camps: 60, columns: true } },
};
export const presetOf = (name) => PRESETS[name] || PRESETS.balanced;
/** The budget the map is held to (11 §10): draw calls at L2 for the presets that draw ambient life and effects. */
export const BUDGET = { drawCalls: 400, fastDrawCalls: 300 };

const SIEGE = new Set(['besieged']);
const FIRE = new Set(['burning', 'sacked']);

/**
 * What a holding looks like, from its status: `{ smoke: 'black'|'grey'|null, embers, siege, torches, mob, watchfires, ruin }`.
 * Burning and sacked: a black column and embers; besieged: the ring of tents (the besieger's own camp draws its tents) and a thin grey smoke from within;
 * rising: torches and a mob at the gate; occupied: watch-fires on the walls; ruin: nothing (the model is the ruin).
 */
export function holdingLook(hd) {
  const st = String(hd?.status || 'normal');
  if (/ruin|destroyed|razed/.test(st)) return { smoke: null, embers: false, siege: false, torches: 0, mob: 0, watchfires: 0, ruin: true };
  return {
    smoke: FIRE.has(st) ? 'black' : SIEGE.has(st) ? 'grey' : null,
    embers: FIRE.has(st), siege: SIEGE.has(st) || FIRE.has(st) || st === 'rising',
    torches: st === 'rising' ? 8 : 0, mob: st === 'rising' ? 14 : 0, watchfires: st === 'occupied' ? 3 : 0, ruin: false,
  };
}

const FESTIVAL_KINDS = { tourney: 'tourney', tourney_result: 'tourney', feast: 'feast', wedding: 'wedding', betrothal: 'feast' };
/**
 * The places where something was celebrated within the last `turns` turns (the tourney, the feast, the wedding, read from the chronicle's cards): Map(holdingId → 'tourney'|'feast'|'wedding').
 * A tourney has pavilions outside the walls; a feast and a wedding, lanterns. The weightier one wins a place.
 */
export function festivalsOf(state, turns = 2) {
  const out = new Map(); const now = state.meta?.turn ?? 0; const weight = { tourney: 3, wedding: 2, feast: 1 };
  for (const t of state.history || []) {
    if (now - t.turn >= turns) continue;
    for (const e of t.events || []) {
      const k = FESTIVAL_KINDS[e.kind] || FESTIVAL_KINDS[e.archetype]; if (!k || !e.where || !state.holdings?.[e.where]) continue;
      if (!out.has(e.where) || weight[k] > weight[out.get(e.where)]) out.set(e.where, k);
    }
  }
  return out;
}

/** The battles still fresh on the map (within `turns` turns): [{ id, pos, age }] — a dust puff and the stakes of a field fought. */
export function battleMarks(state, turns = 2) {
  const now = state.meta?.turn ?? 0;
  return (state.battles || []).map((b, i) => ({ id: `battle${i}`, pos: b.pos, age: now - b.turn })).filter((b) => b.pos && b.age >= 0 && b.age < turns);
}

/** A camp: what a host that has stopped shows — tents in its colours (one to a few hundred men, at most twelve), a fire, and siege lines when it besieges. `null` when the host moves. */
export function campLook(a) {
  if (!a || a.kind === 'fleet' || a.kind === 'retinue' || a.kind === 'progress' || a.kind === 'garrison') return null; // (a garrison is a count on its castle's card, not a token: 11 §6.1)
  const st = a.state || a.status; const besieging = st === 'besieging' || !!a.besieging;
  if (!(st === 'camped' || besieging)) return null;
  return { tents: Math.max(3, Math.min(12, Math.round(Math.log2(Math.max(2, (a.men || 0) / 60)) * 1.6))), fire: true, lines: besieging };
}

/** The figures of a company on the road (§6.2), by kind and strength: riders for a retinue (3–12), a long column for the King's progress (about 40), a host's by its men (the formation the token already draws). */
export function figuresFor(a) {
  if (!a) return { count: 0 };
  if (a.kind === 'progress') return { count: 40, knights: 12, wagons: 6, litter: false, wheelhouse: true };
  if (a.kind === 'retinue') {
    const n = Math.max(3, Math.min(12, Math.round(3 + (a.men || 0) / 12)));
    const infirm = (a.members || []).length > 0 && (a.infirm || false);
    return { count: n, litter: !!infirm, wheelhouse: !!a.lady, banner: true };
  }
  return { count: Math.max(1, Math.min(18, Math.round(Math.log2(Math.max(1, a.men || 0) / 120) * 2.2))) };
}

const DAY_HASH = (n) => { let h = (n * 2654435761) >>> 0; h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; return (h >>> 0) / 4294967295; };
/**
 * The weather over the ground the camera looks at: `{ kind: 'snow'|'rain'|null, density: 0…1 }`. Winter snows in the North and the Mountains and sleets elsewhere; autumn rains on some days
 * (by the day's own hash, no dice); spring showers now and then; a summer day is fine. Only from L2 in (`lod` ≥ 1.6): a distant map has no weather.
 */
export function weatherOf({ season = 'summer', region = '', day = 0, lod = 0 } = {}) {
  if (lod < 1.6) return { kind: null, density: 0 };
  const cold = /^(north|wall|beyond|vale|mountains)/.test(region);
  if (season === 'winter') return { kind: cold ? 'snow' : (DAY_HASH(day) < 0.5 ? 'rain' : null), density: cold ? 0.6 + 0.4 * DAY_HASH(day + 7) : 0.35 };
  if (season === 'autumn') return DAY_HASH(day) < 0.3 ? { kind: 'rain', density: 0.4 + 0.4 * DAY_HASH(day + 3) } : { kind: null, density: 0 };
  if (season === 'spring') return DAY_HASH(day) < 0.15 ? { kind: 'rain', density: 0.3 } : { kind: null, density: 0 };
  return { kind: null, density: 0 };
}

/**
 * All the emitters a state asks for, as plain data, capped by a preset's caps and sorted so the ones nearest the player's lands win the cap:
 * `[{ id, kind: 'smoke'|'embers'|'fire'|'lantern'|'campfire'|'dust', x, z, seed, color? }]`. `own` is the player's holdings' positions; `seen` (a Set of party ids) limits the camps to hosts the player's own eyes are on
 * (a host only reported has no tents: it is unconfirmed) — leave it out and every camp is asked for (the tests and the fixture page).
 */
export function emittersOf(state, preset = 'balanced', { own = [], seen = null } = {}) {
  const P = presetOf(preset).effects; const out = [];
  if (!P.particles) return emittersOf.solid(state, P, own, seen);
  const near = (p) => (own.length ? Math.min(...own.map((o) => Math.hypot(p[0] - o[0], p[1] - o[1]))) : 0);
  const seed = (id) => { let h = 2166136261; for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; };
  for (const hd of Object.values(state.holdings || {})) {
    const look = holdingLook(hd);
    if (look.smoke) out.push({ id: `${hd.id}:smoke`, kind: 'smoke', tone: look.smoke, x: hd.pos[0], z: hd.pos[1], seed: seed(hd.id), d: near(hd.pos) });
    if (look.embers && P.embers) out.push({ id: `${hd.id}:embers`, kind: 'embers', x: hd.pos[0], z: hd.pos[1], seed: seed(hd.id + 'e'), d: near(hd.pos) });
    for (let i = 0; i < look.watchfires; i++) out.push({ id: `${hd.id}:watch${i}`, kind: 'fire', x: hd.pos[0], z: hd.pos[1], seed: seed(hd.id + i), slot: i, of: look.watchfires, d: near(hd.pos) });
  }
  if (P.festivals) for (const [where, kind] of festivalsOf(state)) { const hd = state.holdings[where]; out.push({ id: `${where}:${kind}`, kind: 'lantern', festival: kind, x: hd.pos[0], z: hd.pos[1], seed: seed(where + kind), d: near(hd.pos) }); }
  for (const b of battleMarks(state)) out.push({ id: b.id, kind: 'dust', x: b.pos[0], z: b.pos[1], seed: seed(b.id), age: b.age, d: near(b.pos) });
  for (const a of Object.values(state.parties || {})) { const c = seen && !seen.has(a.id) ? null : campLook(a); if (c && a.pos) out.push({ id: `${a.id}:camp`, kind: 'campfire', x: a.pos[0], z: a.pos[1], seed: seed(a.id), tents: c.tents, lines: c.lines, color: state.houses?.[a.owner]?.color, d: near(a.pos) }); }
  const smokes = out.filter((e) => e.kind === 'smoke' || e.kind === 'dust').sort((a, b) => a.d - b.d || a.id.localeCompare(b.id)).slice(0, P.smoke).map((e) => e.id);
  const camps = out.filter((e) => e.kind === 'campfire').sort((a, b) => a.d - b.d || a.id.localeCompare(b.id)).slice(0, P.camps).map((e) => e.id);
  const keep = new Set([...smokes, ...camps]);
  return out.filter((e) => (e.kind === 'smoke' || e.kind === 'dust') ? keep.has(e.id) : e.kind === 'campfire' ? keep.has(e.id) : true).sort((a, b) => a.id.localeCompare(b.id));
}

/** What a preset without particles still draws: the tents of a camp, the pavilions of a tourney (with no lanterns) and the stakes of a field fought — solid things, in instanced calls. */
emittersOf.solid = (state, P, own, seen = null) => {
  const near = (p) => (own.length ? Math.min(...own.map((o) => Math.hypot(p[0] - o[0], p[1] - o[1]))) : 0); const out = [];
  for (const a of Object.values(state.parties || {})) { const c = seen && !seen.has(a.id) ? null : campLook(a); if (c && a.pos) out.push({ id: `${a.id}:camp`, kind: 'campfire', x: a.pos[0], z: a.pos[1], seed: 0.5, tents: c.tents, lines: c.lines, color: state.houses?.[a.owner]?.color, d: near(a.pos), quiet: true }); }
  for (const b of battleMarks(state)) out.push({ id: b.id, kind: 'dust', x: b.pos[0], z: b.pos[1], seed: 0.5, age: b.age, d: near(b.pos), quiet: true });
  return out.sort((a, b) => a.d - b.d || a.id.localeCompare(b.id)).slice(0, P.camps + 4);
};
