// The Director in the jump (docs/gdd/04-ai-system.md §7; 09-living-world.md §9 point 3). On a week's first day, if the
// Director is on and its cadence has come round (light: a hook a fortnight at most; lively: a week), the model chooses a
// hook from those the world fits and the engine makes it happen. And whatever the setting, a whole week that ends with
// fewer than three facts of note anywhere in the realm gets one hook of the dice's choosing on its last day, so no week
// is empty. A stopped or shortened week is not judged thin: the days the lord watched are never changed by a stop.
import { runCall } from './ai/client.js';
import { eligibleHooks, pickHook, applyHook, thinDays } from '../public/js/engine/director.js';
import { dayNumber } from '../public/js/engine/time.js';

/** The Director's setting (config `director`: 'off' | 'light' | 'lively'; default light). */
export const directorMode = (cfg) => (['off', 'light', 'lively'].includes(cfg?.director) ? cfg.director : cfg?.director === false ? 'off' : 'light');
const CADENCE = { light: 14, lively: 7 };

/**
 * The week's first day: a hook if one is due. `day` is the day of the turn the hook's fact falls on (the clock's);
 * `replay` the hooks this week had when the turn was first played (Stop here), reused rather than asked again.
 * Returns { cards, record: [{ hook, place, why, via, when: 'start' }] }.
 */
export async function directWeek(state, { cfg, provider, log, day = 1, replay = null } = {}) {
  const mode = directorMode(cfg); const out = { cards: [], record: [] };
  const apply = (h, via) => { const r = applyHook(state, h.hook, h.place, { day, why: h.why || '' }); if (r) { out.cards.push(...r.cards); out.record.push({ hook: h.hook, place: h.place, why: h.why || '', via, when: 'start' }); } };
  if (replay) { for (const h of replay.filter((x) => x.when === 'start')) apply(h, h.via); return out; }
  if (mode === 'off') return out;
  const today = dayNumber(state.meta.date) + 1;
  if (today - (state.plots?.lastHookDay ?? -1e9) < CADENCE[mode]) return out;
  const offer = eligibleHooks(state); if (!offer.length) return out;
  const r = await runCall('director', state, { max: mode === 'lively' ? 2 : 1, offer }, { provider, cfg, log }).catch(() => null);
  for (const h of r?.value?.hooks || []) apply(h, r.via);
  return out;
}

/**
 * The week's end: a whole week with fewer than three facts of note anywhere gets a hook on its last day (the dice's,
 * no model). `from`, `to` are the week's absolute days; `day` the turn's day its fact falls on.
 */
export function thinWeek(state, { from, to, day, whole = true, had = false } = {}) {
  if (!whole || had || !thinDays(state, from, to)) return { cards: [], record: [] };
  const pick = pickHook(state); if (!pick) return { cards: [], record: [] };
  const r = applyHook(state, pick.hook, pick.place, { day });
  return r ? { cards: r.cards, record: [{ ...pick, why: 'a quiet week', via: 'engine', when: 'thin' }] } : { cards: [], record: [] };
}
