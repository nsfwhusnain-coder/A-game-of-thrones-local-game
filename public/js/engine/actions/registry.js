// The verb registry (docs/gdd/03-architecture.md §7). Every action anyone can take — the player from a card or a
// written order, a lord's mind, a beat of the great story — is one verb, defined once: who may use it, what it takes,
// whether it may be done now (and if not, why, in the world's own words), what it costs, what it does, and the receipt
// that tells it. The engine carries verbs out; the models will only ever choose among them (WP B6, B7).
//
//   Verb = { id, family, label, params, who?, legal, cost?, start, receipt, said?, facts, mind }
//     params   what it takes, typed for the model's enums: 'party:own' | 'party:foe' | 'place' | 'holding:own' | …
//     legal    (state, intent) → null, or a refusal { code, text } told as the world would tell it
//     cost     (state, intent) → { gold, men, days } — what it will take, for the receipt
//     start    (state, intent) → what was done (the verb changes the world here, and records its facts)
//     receipt  (state, intent, done) → [ReceiptLine]   ReceiptLine = { ok: true | false | 'warn', text, eta?, cost? }
//     said     (state, intent, done) → the order as the story model is told it (until the jump of WP B11 retires it)
//     facts    the kinds of fact it records (documentation, and the tests hold it to them)
//     mind     { allowed } — whether a lord's mind may choose it (canon-only verbs may not)
//
// An intent is { verb, actor, house, params, source } (03 §3.7): the actor is a character, the house theirs.
import { MILITARY } from './military.js';
import { MOVEMENT } from './movement.js';
import { ECONOMY } from './economy.js';
import { COURT } from './court.js';
import { DIPLOMACY } from './diplomacy.js';

export const FAMILIES = ['military', 'movement', 'economy', 'court', 'diplomacy', 'intrigue'];
export const VERBS = Object.freeze(Object.fromEntries([...MILITARY, ...MOVEMENT, ...ECONOMY, ...COURT, ...DIPLOMACY].map((v) => [v.id, v])));

/** The intent for a verb: who acts (the player's lord unless named), for which house, with what. */
export function intentFor(state, verb, { actor, house, params = {}, source } = {}) {
  const who = actor || state.houses[house || state.meta.player]?.lord || null;
  return { verb, actor: who, house: house || state.characters[who]?.house || state.meta.player, params: { ...params }, source: source || { type: 'order', ref: null } };
}

/** Whether the verb may be done now: null, or a refusal { code, text } (nothing is changed either way). */
export function check(state, intent) {
  const v = VERBS[intent.verb];
  if (!v) return { code: 'unknown', text: `No one knows how to ${String(intent.verb).replace(/_/g, ' ')}.` };
  if (v.who && !v.who(state, intent)) return { code: 'who', text: `That is not ${state.characters[intent.actor]?.name || 'yours'} to do.` };
  return v.legal ? v.legal(state, intent) : null;
}

/**
 * Carry out a verb. Returns { ok: true, intent, done, receipt } — the world changed and its facts recorded — or
 * { ok: false, intent, refusal, receipt } with nothing changed. A verb that fails after its checks passed is an engine
 * bug: it is refused with its reason rather than left half-done where the caller cannot see it.
 */
export function perform(state, verb, opts = {}) {
  const intent = verb && typeof verb === 'object' ? verb : intentFor(state, verb, opts);
  const refusal = check(state, intent);
  if (refusal) return { ok: false, intent, refusal, receipt: [{ ok: false, text: refusal.text }] };
  const v = VERBS[intent.verb];
  let done;
  try { done = v.start(state, intent); } catch (e) {
    const text = String(e.message || e).replace(/^./, (x) => x.toUpperCase()).replace(/([^.!?])$/, '$1.');
    return { ok: false, intent, refusal: { code: 'failed', text }, receipt: [{ ok: false, text }] };
  }
  const cost = v.cost?.(state, intent) || null;
  const receipt = (v.receipt ? v.receipt(state, intent, done) : [{ ok: true, text: v.label }]).map((l) => ({ ...(cost && !l.cost && l.ok !== false ? { cost } : {}), ...l }));
  return { ok: true, intent, done, receipt };
}

/** The receipt's words in one line (a toast, an order's result). */
export const told = (r) => r.receipt.map((l) => l.text).join(' ');

/** The verbs an actor could use at all (the UI's menus, the models' enums). */
export const verbsFor = (state, intent) => Object.values(VERBS).filter((v) => !v.who || v.who(state, { ...intent, verb: v.id }));

// ── Before B4, actions came as { kind, … } from the cards and as { op, … } from written orders: both map to verbs ──
export const ACT_KINDS = {
  tax: 'set_tax', dues: 'set_dues', project: 'fund_works', cancel_project: 'cancel_works', call_banners: 'call_banners',
  decide: 'answer_matter', appoint: 'appoint_office', grant: 'grant_holding', raise: 'raise_levies', disband: 'disband_host',
  gift: 'send_gift', feast: 'hold_feast', tourney: 'hold_tourney', judge: 'judge_prisoner', declare_war: 'declare_war',
  secrecy: 'set_secrecy',
};
/** An old card action ({ kind, … }) as the verb it is. `order` (a written order) is not a verb and maps to null. */
export function verbOfKind(body) {
  const k = body?.kind;
  if (k === 'march') return String(body.to || '').startsWith('party:') ? 'attack_host' : 'march_host';
  if (k === 'recall') return body.character ? 'recall_rider' : 'halt_host';
  if (k === 'scheme') return body.kind2 === 'secrets' ? 'gather_secrets' : 'plant_spy';
  return ACT_KINDS[k] || null;
}
/** A written order's action ({ op, … }, server/orders.js) as the verb it is. */
export const ORDER_OPS = {
  march: 'march_host', raise: 'raise_levies', banners: 'call_banners', merge: 'merge_hosts', works: 'fund_works',
  feast: 'hold_feast', tourney: 'hold_tourney', appoint: 'appoint_office', travel: 'send_person', recruit: 'hire_men',
  hire: 'hire_officer',
};
