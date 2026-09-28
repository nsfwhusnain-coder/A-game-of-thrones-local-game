// Who among the lords of the realm decides something now (docs/gdd/04-ai-system.md §5.1, 09 §2.3). Everyone who
// speaks for a house, leads a host or holds an office is scored — by rank, by what has just happened to them, by how
// near they stand to the player's realm, less if they decided lately — and the best few are given a mind this week
// (a model's, or their house's ways). The rest who have something pressing act by their house's ways alone.
import { random } from '../rng.js';
import { actorOf, worldView, miles } from './options.js';
import { dayNumber } from '../time.js';
import { goalsOf } from './goals.js';

const RANK = { crown: 40, paramount: 30, major: 18, order: 18, tribe: 18, exile: 14, minor: 8, city_state: 8, company: 8 };

/**
 * Score every actor who could have a mind now: [{ id, house, score, why: [words], trigger }] best first. `player`'s
 * own house never has one (the player is its mind); a captive decides nothing.
 */
export function scoreActors(state, { player = state.meta.player } = {}) {
  const p = state.houses[player]; const pSeat = p?.seat && state.holdings[p.seat]?.pos; const pRegion = p?.seat && state.holdings[p.seat]?.region;
  const last = state.minds?.last || {};
  const today = dayNumber(state.meta.date);
  const out = [];
  const seen = new Set();
  const consider = (c, base, why) => {
    if (!c?.alive || c.house === player || seen.has(c.id) || /imprisoned|captive|hostage/.test(c.status || '')) return;
    const w = worldView(state, c.id); if (!w) return;
    seen.add(c.id);
    const reasons = [why]; let score = base; let trigger = 0;
    const add = (n, words, isTrigger = true) => { score += n; reasons.push(words); if (isTrigger) trigger += n; };
    // what has just happened to them
    if (w.besieged.length) add(35, `${state.holdings[w.besieged[0]]?.name} is besieged`);
    if (w.threatened.length) add(30, 'an enemy host is near their lands');
    if (w.hosts.some((a) => w.near(a.pos, 60).length)) add(30, 'an enemy host is near their host');
    if (w.kinHeld.length) add(25, `${w.kinHeld[0].name} is a captive`);
    if ((state.post || []).some((x) => x.to === c.id && x.arriveDay != null && x.arriveDay <= today && today - x.arriveDay <= 14)) add(25, 'a raven from the player arrived');
    if (w.liege && w.me.obligations?.levies === 'called') add(15, 'their liege has called the banners');
    if (w.atWar) add(10, 'at war');
    // a great aim of their own (data/goals.js): the story's movers are weighed a little higher
    const great = goalsOf(state, c).find((g) => g.priority >= 3);
    if (great) add(5, `pursues ${great.text.split(/[,:—]/)[0]}`, false);
    // how near to the player's realm
    const seat = w.seat && state.holdings[w.seat];
    if (seat && pRegion && seat.region === pRegion) add(10, 'in the player\'s country', false);
    else if (seat && pSeat && miles(seat.pos, pSeat) < 500) add(5, 'a neighbour of the player', false);
    // less if they decided lately
    const ago = last[c.id] != null ? (state.meta.turn - last[c.id]) : Infinity;
    if (ago <= 1) add(-20, 'decided last week', false); else if (ago <= 2) add(-10, 'decided lately', false);
    out.push({ id: c.id, house: c.house, score, why: reasons, trigger });
  };
  for (const h of Object.values(state.houses)) {
    const a = actorOf(state, h.id); if (!a) continue;
    const base = RANK[h.rank] ?? 8;
    consider(a, base + (h.rank === 'crown' ? 0 : 0), h.regent === a.id ? `regent of House ${h.name}` : `head of House ${h.name}`);
  }
  // the commanders of hosts in the field (the realm's office-holders get minds when they have verbs of their own:
  // schemes and counsel, WP B9–B10)
  for (const a of Object.values(state.parties)) if (a.commander && a.kind === 'host' && a.men >= 500) consider(state.characters[a.commander], 10, `commands ${a.name}`);
  return out.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
}

/**
 * The actors given a mind this week: the best `budget` (ties broken by the dice), and — beyond the budget — those with
 * a pressing trigger (≥ 25), who act by their house's ways (the fallback trees), at most `extra` of them.
 */
export function salientActors(state, { budget = 6, extra = 6, player = state.meta.player } = {}) {
  const all = scoreActors(state, { player });
  // equal scores are ordered by the dice, so the same few lords do not always win a tie
  const jitter = new Map(all.map((x) => [x.id, random()]));
  all.sort((a, b) => b.score - a.score || jitter.get(a.id) - jitter.get(b.id));
  const minds = all.slice(0, budget);
  const pressed = all.slice(budget).filter((x) => x.trigger >= 25).slice(0, extra);
  return { minds, pressed, all };
}
