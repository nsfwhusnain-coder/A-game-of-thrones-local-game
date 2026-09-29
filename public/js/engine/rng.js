// The engine's dice (docs/gdd/03-architecture.md §1.6, 15-qa-tooling.md §4). Given the same state, seed and intents,
// a turn resolves the same way twice: every roll the engine makes comes from one seeded stream whose position is kept
// in the save (`state.meta.rngState`). A model call's choice is recorded in the turn, so a turn can be replayed without
// the model and must come out byte for byte the same.
//
// The stream is xoshiro128** (four 32-bit words; fast, well mixed, trivially serialisable), seeded through splitmix32.
// Engine code calls `random()` — the drop-in for Math.random, which `npm run check` forbids in engine files. The
// server runs each save's engine work inside a scope carrying that save's stream (server/dice.js, an AsyncLocalStorage
// the stream survives `await`s in), so two saves resolved in one process never draw from each other's dice. The stream
// advances the four words of `state.meta.rngState` in place: whatever saves the state saves the dice's position.

const u32 = (x) => x >>> 0;
function splitmix32(seed) {
  let s = u32(seed);
  return () => { s = u32(s + 0x9e3779b9); let z = s; z = Math.imul(z ^ (z >>> 16), 0x85ebca6b); z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35); return u32(z ^ (z >>> 16)); };
}
const rotl = (x, k) => u32((x << k) | (x >>> (32 - k)));

/** Four words of stream state from a 32-bit seed. */
export function seedState(seed) {
  const sm = splitmix32(seed); const s = [sm(), sm(), sm(), sm()];
  if (!(s[0] | s[1] | s[2] | s[3])) s[0] = 1; // xoshiro may not start from all zeros
  return s;
}

/** A stream over a four-word state array (the array is advanced in place, so it can live in the save). */
export function makeRng(s) {
  const next32 = () => {
    const r = u32(Math.imul(rotl(u32(Math.imul(s[1], 5)), 7), 9));
    const t = u32(s[1] << 9);
    s[2] = u32(s[2] ^ s[0]); s[3] = u32(s[3] ^ s[1]); s[1] = u32(s[1] ^ s[2]); s[0] = u32(s[0] ^ s[3]);
    s[2] = u32(s[2] ^ t); s[3] = rotl(s[3], 11);
    return r;
  };
  const next = () => next32() / 4294967296;
  return {
    next, next32,
    int: (n) => Math.floor(next() * n),
    range: (a, b) => a + next() * (b - a),
    chance: (p) => next() < p,
    pick: (a) => a[Math.floor(next() * a.length)],
    // Fisher–Yates on a copy (never `sort(() => random() - 0.5)`: biased, and engine-dependent)
    shuffle: (a) => { const o = [...a]; for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; } return o; },
    state: () => [...s],
  };
}

// ── The active stream ────────────────────────────────────────────────────────────────────────────────────────────────
// Outside a bound stretch (the browser computing a projection, a script) the engine still gets fixed dice: a stream
// with a constant seed, so nothing in the engine ever depends on Math.random.
let active = makeRng(seedState(298));
const stack = [];

/** Run `fn` (synchronous) with the dice of `state` (tests, scripts, the browser; the server uses server/dice.js). */
export function withRng(state, fn) {
  stack.push(active); active = rngOf(state);
  try { return fn(); } finally { active = stack.pop(); }
}

/** The dice of a save, over its own `state.meta.rngState` (created from `meta.seed` if the save has none yet). */
export function rngOf(state) {
  const meta = state.meta = state.meta || {};
  if (!Array.isArray(meta.rngState) || meta.rngState.length !== 4) meta.rngState = seedState(meta.seed ?? 298);
  return makeRng(meta.rngState);
}
// the stream of the save being simulated, if the server has put one in scope (server/dice.js)
const current = () => globalThis.__wcDiceScope?.getStore?.() || active;
/** A float in [0, 1) from the active stream: the engine's Math.random. */
export const random = () => current().next();
export const randInt = (n) => current().int(n);
export const chance = (p) => current().next() < p;
export const pick = (a) => a[current().int(a.length)];
export const shuffle = (a) => current().shuffle(a);
/** A fresh 32-bit seed for a new game (not from the stream: games differ from one another). */
export function newSeed() {
  try { const b = new Uint32Array(1); globalThis.crypto.getRandomValues(b); return b[0]; } catch { return u32(Date.now() ^ 0x5bd1e995); } // lint-allow: a new game's seed, not a roll
}

/**
 * A pure 32-bit hash of its arguments (strings and numbers): the same parts always give the same number, and no part
 * can slide into its neighbour ("ab","c" is not "a","bc"). It touches no stream and no save: it is how a figure the
 * house only estimates gets its blur without one roll of the dice (docs/gdd/19-realm-ledger.md §2 M5), so reopening the
 * view, reloading a save or replaying a turn shows the same `~`. FNV-1a over the parts, then a splitmix finaliser.
 */
export function hash32(...parts) {
  let h = 2166136261;
  const s = parts.map(String).join('\u0001');
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  let z = u32(h + 0x9e3779b9);
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b); z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
  return u32(z ^ (z >>> 16));
}
