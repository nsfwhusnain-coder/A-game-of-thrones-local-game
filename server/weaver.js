// The Weaver in the jump (docs/gdd/04-ai-system.md §10; WP H2): rare, optional, off by default. On a week's first day, if the Weaver is on (config `weaver: true`) and a game month has passed since it last wove, the model may turn one lasting
// thing the story made into a custom of one lord's house; the engine checks the rule in its sandbox before anything is kept (ai/calls/weaver.js) and applies it as an ordinary `inject_rule` op. The player's own house is never given one.
import { runCall } from './ai/client.js';
import { weaverFacts, specOf } from './ai/calls/weaver.js';
import { applyChanges } from '../public/js/shared/world.js';
import { dayNumber } from '../public/js/engine/time.js';

/** The Weaver's setting (config `weaver`: true to turn it on; default off). */
export const weaverOn = (cfg) => cfg?.weaver === true || cfg?.weaver === 'on';
/** A game month between one weaving and the next. */
export const WEAVER_DAYS = 30;

/**
 * The week's first day: a custom if one is due. `replay` the rules this week had when the turn was first played (Stop here), reused rather than asked again.
 * Returns { record: [{ cite, house, name, kind, via, when: 'weave' }] }.
 */
export async function weaveWeek(state, { cfg, provider, log, replay = null } = {}) {
  const out = { record: [] };
  const apply = (r, via) => {
    const res = applyChanges(state, [{ op: 'inject_rule', ...specOf(r) }], { source: `the weaver (cites ${r.cite})` }); // (the rule keeps the fact it cites in its `source`)
    if (res.rejected?.length) return false;
    out.record.push({ cite: r.cite, house: r.house, name: r.name, kind: r.kind, var: r.var, start: r.start, grow: r.grow, formula: r.formula, when: r.when, note: r.note, via, when_: 'weave' });
    return true;
  };
  if (replay) { for (const r of replay) apply(r, r.via); return out; }
  if (!weaverOn(cfg)) return out;
  const today = dayNumber(state.meta.date) + 1;
  state.plots = state.plots || {};
  if (today - (state.plots.lastWeaverDay ?? -1e9) < WEAVER_DAYS) return out;
  const offer = weaverFacts(state); if (!offer.length) return out;
  const r = await runCall('weaver', state, { offer }, { provider, cfg, log }).catch(() => null);
  state.plots.lastWeaverDay = today; // (a month is counted from the asking, whatever the answer)
  for (const rule of r?.value?.rules || []) apply(rule, r.via);
  return out;
}
