// Each save rolls its own dice (public/js/engine/rng.js). The engine's work on a save — a turn, an order, an audience —
// runs inside a scope holding that save's stream; AsyncLocalStorage carries the scope across every `await`, so a turn
// waiting on the model never lends its dice to another request, and a replayed turn rolls exactly what it rolled before.
import { AsyncLocalStorage } from 'node:async_hooks';
import { rngOf } from '../public/js/engine/rng.js';

const scope = globalThis.__wcDiceScope = globalThis.__wcDiceScope || new AsyncLocalStorage();

/** Run `fn` with the dice of `state` in scope (the stream advances `state.meta.rngState` in place). */
export function withDice(state, fn) { return scope.run(rngOf(state), fn); }
