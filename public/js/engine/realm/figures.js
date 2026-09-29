// One house's figures, from the truth (docs/gdd/19-realm-ledger.md §1, §3.1). This is the only place in the game that
// says what a house's swords, coin, bread and people are *for the ledger of the realm*: the truth series takes its
// samples from here, the view reads the viewer's own house and its sworn houses from here, and the Power number is
// `standing()`'s own, so the HUD's word and this table can never disagree. It draws no dice and changes nothing.
//
// Every figure is a whole number, so a sample is a row of small ints:
//   swords     hosts + levies at home + men-at-arms (what `standing` counts as might)
//   gold       treasury less debt (what `standing` counts as wealth; may be below nothing)
//   income / expenses   the steward's projection of a moon (`project`), the Rock's secret mines and all — the truth
//   food       tenths of a moon of stores (30 moons of bread is 300)
//   people     the souls of the house's holdings; prosperity / unrest the people-weighted mean of them, 0–100
//   power      `standing().score`, 0–100
import { standing } from '../../shared/standing.js';
import { project } from '../../shared/economy.js';

export const FIELDS = ['swords', 'levies', 'menAtArms', 'guard', 'gold', 'debt', 'income', 'expenses', 'food', 'ships', 'holdings', 'people', 'prosperity', 'unrest', 'power'];

const whole = (x) => (Number.isFinite(x) ? Math.round(x) : 0);

/** Holdings by owner, made once for a pass over many houses (a scan of every holding per house is the slow way). */
export function holdingsIndex(state) {
  const by = new Map();
  for (const h of Object.values(state.holdings || {})) { const l = by.get(h.owner); if (l) l.push(h); else by.set(h.owner, [h]); }
  return by;
}

/**
 * The figures of `house` as the world truly stands, keyed by FIELDS; null for a house there is not. `held` is an
 * optional `holdingsIndex(state)` when many houses are done in a row.
 */
export function figuresOf(state, house, held = null) {
  const h = state.houses?.[house]; if (!h) return null;
  const st = standing(state, house); const pr = project(state, house);
  const holds = (held || holdingsIndex(state)).get(house) || [];
  const people = holds.reduce((n, x) => n + (x.population || 0), 0);
  // the mood of the lands, weighted by the people in them (an empty land is plainly worth nothing: 0)
  const mean = (key, fallback) => (holds.length ? (people > 0 ? holds.reduce((n, x) => n + (x[key] ?? fallback) * (x.population || 0), 0) / people : holds.reduce((n, x) => n + (x[key] ?? fallback), 0) / holds.length) : 0);
  const f = h.figures || {};
  return {
    swords: whole(st.swords), levies: whole(f.levies?.v), menAtArms: whole(f.menAtArms?.v), guard: whole(f.guard?.v),
    gold: whole(st.gold), debt: whole(f.debt?.v), income: whole(pr.income), expenses: whole(pr.expenses),
    food: whole((Number(f.food?.v) || 0) * 10), ships: whole(f.ships?.v),
    holdings: holds.length, people: whole(people), prosperity: whole(mean('prosperity', 50)), unrest: whole(mean('unrest', 10)),
    power: whole(st.score),
  };
}
