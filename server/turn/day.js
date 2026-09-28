// One day of the realm (docs/gdd/03-architecture.md §6.2, the day loop). Every rule of the engine that makes time pass
// runs here for a single day, in this order: the year's turn (age and old death), the banners' answers and the musters,
// the roads (marches, arrivals, the road's dangers), the fleets, the hosts' bread, oaths weighed, the battles and sieges, the great threads and the
// realm's small life, regencies, the strain of war, lords on the road, letters landing, promises judged, the season.
// Running each day alone is what lets a jump be streamed a week at a time and stopped on any day: the world at the end
// of day 9 is the same whether the jump was meant to run to day 9 or to day 30 (03 §1.6).
import { applyChanges, dayNumber } from '../../public/js/shared/world.js';
import { dateOfDay } from '../../public/js/engine/time.js';
import { random } from '../../public/js/engine/rng.js';
import { fact, redate } from '../../public/js/engine/facts/log.js';
import { marchTick } from '../../public/js/shared/marches.js';
import { seasonTick } from '../../public/js/shared/economy.js';
import { psycheTick } from '../../public/js/shared/psyche.js';
import { retinueTick } from '../../public/js/shared/retinues.js';
import { vassalTick, gatherMusters, fieldService } from '../../public/js/shared/vassals.js';
import { worldTick, canonAhead } from '../../public/js/shared/plots.js';
import { lifeTick, mayDie } from '../../public/js/engine/people/life.js';
import { resolveWarfare } from '../../public/js/shared/battles.js';
import { roadEncounters } from '../../public/js/shared/roads.js';
import { treacheryTick } from '../../public/js/shared/treachery.js';
import { regencyTick } from '../../public/js/shared/regency.js';
import { musterTick } from '../../public/js/engine/military/muster.js';
import { supplyTick } from '../../public/js/engine/military/supply.js';
import { seaTick } from '../../public/js/engine/military/naval.js';
import { irregularsTick } from '../../public/js/engine/military/companies.js';
import { commitmentsTick } from '../../public/js/engine/politics/commitments.js';
import { warTick } from '../../public/js/engine/politics/war.js';
import { asEvent } from '../../public/js/engine/facts/log.js';
import { advanceMusters } from '../orders.js';
import { resolvePlaceId } from '../../public/js/shared/world.js';

// those a beat still to come names, whom chance does not take under Canon gravity (engine/people/life.js)
const sparedBy = (state) => ((state.meta.settings?.canonGravity || 'canon') === 'canon' ? canonAhead(state) : new Set());

// the year turns: everyone ages, and the very old may not see the next one
function theYears(state, applied) {
  const dead = [];
  // under Canon gravity the years spare those the story still has a part for (Lord Walder lives to see his wedding)
  const spared = sparedBy(state);
  for (const c of Object.values(state.characters)) {
    if (!c.alive || c.age == null) continue;
    c.age += 1;
    if (!mayDie(state, c, spared)) continue;
    const ailing = c.status === 'wounded' || /ailing|dying|sick|abed/i.test(`${c.traits} ${c.bio}`);
    const risk = c.age >= 60 ? ((c.age - 58) ** 2) / 2600 + (ailing ? 0.25 : 0) : ailing && c.age > 45 ? 0.08 : 0;
    if (risk && random() < Math.min(0.85, risk)) dead.push({ c, cause: ailing ? 'illness' : 'old age' });
  }
  // the years' dead are told in the years' own words: their facts are recorded here, before the heirs' (not by the op)
  const cards = dead.map(({ c, cause }) => fact(state, 'death', { title: `${c.name} is dead`, text: `${c.name}${c.title ? ', ' + c.title + ',' : ''} has died of ${c.bio && /ailing|dying/i.test(c.bio) ? 'a long illness' : 'old age'}, aged ${c.age}.`, where: state.houses[c.house]?.seat || null, importance: state.houses[c.house]?.lord === c.id || ['paramount', 'crown'].includes(state.houses[c.house]?.rank) ? 4 : 2, houses: [c.house] }, { actors: [c.id], data: { cause, age: c.age }, cause: { type: 'rule', ref: 'the years' } }));
  const r = applyChanges(state, dead.map(({ c, cause }) => ({ op: 'character', id: c.id, alive: false, cause })), { source: 'The years', spanDays: 1, told: ['character'] });
  applied.push(...r.applied);
  return cards;
}

/**
 * Advance the world one day. The caller has set `state.meta.date` to the day before and `state.meta.clock` to
 * { turn, from, to } of the turn; this moves the date on and dates the day's facts on it. ctx: { deliver: async
 * (state) → cards (letters, which may ask a model), touched: Set of vassals already moved this turn }.
 * Returns { cards (the chronicle's, each dated this day of the turn), applied, season (if it turned) }.
 */
export async function engineDay(state, ctx) {
  const clock = state.meta.clock; const day = dayNumber(state.meta.date) + 1;
  const yearBefore = state.meta.date.year;
  state.meta.date = { ...state.meta.date, ...dateOf(day) };
  // everything that happens today is dated today (engine/facts/log.js reads the clock)
  const turnClock = { ...clock }; state.meta.clock = { turn: clock.turn, from: day, to: day };
  const cards = []; const applied = [];
  if (state.meta.date.year !== yearBefore) cards.push(...theYears(state, applied));
  const vt = vassalTick(state, 1, ctx.touched); applied.push(...vt.applied); cards.push(...vt.events);
  // the banners: every called lord's answer, a day at a time (engine/military/muster.js)
  const mu = musterTick(state, ctx.touched); applied.push(...mu.applied); cards.push(...mu.events);
  cards.push(...advanceMusters(state, 1));
  // every party with somewhere to be walks its road one day (a host raised today sets out today)
  const mt = marchTick(state, { span: 1, turnStart: day - 1 }); cards.push(...mt.events); applied.push(...mt.applied);
  // the fleets: hosts aboard sail with them, storms, blockades and raids (engine/military/naval.js)
  { const r = seaTick(state, 1, random); cards.push(...r.events); applied.push(...r.applied); }
  // sellswords paid (or gone), outlaws, the Watch's recruits (engine/military/companies.js)
  { const r = irregularsTick(state, 1, random); cards.push(...r.events); applied.push(...r.applied); }
  // every host eats (engine/military/supply.js): from friendly stores, its wagons, or the country it stands in
  { const r = supplyTick(state, 1); cards.push(...r.events); applied.push(...r.applied); }
  for (const tick of [roadEncounters, treacheryTick, resolveWarfare]) { const r = tick(state, 1); cards.push(...r.events); applied.push(...r.applied); }
  cards.push(...fieldService(state, 1), ...gatherMusters(state));
  for (const tick of [worldTick, regencyTick]) { const r = tick(state, 1); cards.push(...(r.events || [])); applied.push(...(r.applied || [])); }
  // the strain of war works slowly: reckoned once a week, on the realm's own calendar (the seventh days), so a jump
  // stopped midweek has lived the same days as one that ran on
  if (day % 7 === 0) { const r = psycheTick(state, 7); cards.push(...(r.events || [])); applied.push(...(r.applied || [])); }
  // wounds heal or fester; fevers, winter chills and great age (engine/people/life.js)
  { const r = lifeTick(state, random, { spared: sparedBy(state) }); cards.push(...r.events); if (r.changes.length) applied.push(...applyChanges(state, r.changes, { source: 'Life', spanDays: 1, told: ['character'], cause: { type: 'rule', ref: 'life' } }).applied); }
  cards.push(...retinueTick(state, 1).events);
  cards.push(...await ctx.deliver(state));
  // promises kept or broken today, judged after the day's marches (a host that reached Moat Cailin has kept its word)
  cards.push(...commitmentsTick(state).filter((f) => f.houses.includes(state.meta.player)).map((f) => asEvent(state, f, { mine: true })));
  // the wars reckoned: their score moved by the day's deeds, gone cold, or peace sued for (engine/politics/war.js)
  cards.push(...warTick(state, random).events.filter((c) => c.houses?.includes(state.meta.player)));
  // the white raven: a season turns on its day
  let season = null;
  const turned = seasonTick(state, 1);
  if (turned) { season = turned; cards.push(fact(state, 'season_turned', { title: `A white raven: ${turned.season} has come`, text: turned.text, where: resolvePlaceId('oldtown'), importance: 5, houses: [], day: 1 }, { data: { season: turned.season }, cause: { type: 'rule', ref: 'seasons' } })); applied.push({ op: 'season', text: `The season turns: ${turned.season.toUpperCase()}` }); }
  // every card of the day falls on the day (its fact too), counted from the turn's first day
  for (const c of cards) { if (!c.day || c.undated) { c.day = 1; redate(state, c); } c.day = day - turnClock.from + 1; }
  for (const a of Object.values(state.parties)) { delete a.bornDay; delete a.landed; }
  state.meta.clock = turnClock;
  return { cards, applied, season };
}

const dateOf = (n) => dateOfDay(n);
