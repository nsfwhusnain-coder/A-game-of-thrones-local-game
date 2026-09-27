// Reading an order (docs/gdd/04-ai-system.md §4.1–4.4): the pre-parser first; the model only for what the rules could
// not read completely and lawfully; the pre-parse again if the model fails. A reading is
//   { actions: [{ verb, params }], letter: { to } | null, clarify: { question, options } | null, story, via }
// where `via` says who read it: 'rules' (no model asked), 'model', 'replay', 'mock' or 'fallback'. Nothing is changed
// here — the turn carries a reading out, and the receipt is the same reading tried on a copy of the world.
import { parseOrder } from './parse.js';
import { runCall } from '../ai/client.js';
import { intentFor, check } from '../../public/js/engine/actions/registry.js';
import { readingOf } from '../ai/calls/interpret.js';

const keep = (p) => ({ actions: p.actions.map(({ verb, params }) => ({ verb, params })), letter: p.letter?.to ? { to: p.letter.to } : null, clarify: p.clarify, story: p.story });

/** The rules' reading of an order, and whether it may skip the model: complete, unambiguous and lawful. */
export function ruleReading(state, text, { house = state.meta.player, addressee = null } = {}) {
  const parse = parseOrder(state, text, { house, addressee });
  const lawful = parse.actions.every((a) => !check(state, intentFor(state, a.verb, { house, params: a.params })));
  return { parse, reading: keep(parse), sure: parse.complete && !parse.clarify && lawful && (parse.actions.length > 0 || !!parse.letter?.to) };
}

/**
 * Read one written order. opts: { house, addressee, provider, cfg, log } — `provider: 'rules'` never asks a model
 * (the pre-parse is then the whole reading, as it is on the mock).
 */
export async function interpretOrder(state, text, { house = state.meta.player, addressee = null, provider, cfg, log } = {}) {
  const { parse, reading, sure } = ruleReading(state, text, { house, addressee });
  if (sure || provider === 'rules') return { ...reading, via: 'rules' };
  const r = await runCall('interpret', state, { text, house, addressee, parse }, { provider, cfg, log });
  // the mock is the pre-parse; a failed call falls back to it — either way the rules' reading stands, whole
  if (r.via === 'mock' || r.via === 'fallback' || !r.value) return { ...reading, via: r.via === 'mock' ? 'mock' : 'fallback', ...(r.problems?.length ? { problems: r.problems } : {}) };
  const read = readingOf(r.value, state, { house });
  // a command the model lets fall to the story is still told its fate (04 §4.4: never silently dropped): what the
  // rules read stands, and its receipt says why it cannot be done
  if (read.story && reading.actions.length) return { ...reading, via: r.via };
  return { ...read, via: r.via };
}
