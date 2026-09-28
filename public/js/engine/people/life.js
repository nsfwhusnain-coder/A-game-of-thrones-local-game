// Life (docs/gdd/08-characters-politics.md §5; WP D4): wounds that heal in one to three moons or fester, the fevers of
// winter and the frailty of great age, and the story's hand on all of it. Under Canon gravity a character whose canon
// death is still to come, or one of the children the story carries through 300 AC, does not die of chance — they are
// taken or wounded instead, and live to meet their own beat; under Loose only the pillars are kept; under Sandbox no one.
// The player's own deliberate orders always have teeth.
import { CANON_DEATHS, CANON_PROTECTED } from '../../../data/fates.js';
import { fact } from '../facts/log.js';
import { dayNumber } from '../time.js';

const ymOf = (d) => d.year * 12 + (d.month - 1);
export const gravityOf = (state) => state.meta?.settings?.canonGravity || 'canon';

/** Whether the story keeps this person from a death of chance today: 'canon' (their end is later), 'protected', or null. */
export function keptByStory(state, c, { playerBattle = false } = {}) {
  const g = gravityOf(state);
  if (g === 'sandbox' || !c) return null;
  const w = CANON_DEATHS[c.id]; const now = ymOf(state.meta.date);
  if (w && now <= w.to[0] * 12 + w.to[1] - 1 && (g === 'canon' || w.pillar)) return 'canon';
  if (g === 'canon' && CANON_PROTECTED.includes(c.id) && !(playerBattle && c.house === state.meta.player)) return 'protected';
  return null;
}

/** Whether a death of chance may take this person: not if the story keeps them, nor if a beat still to come needs them. */
export const mayDie = (state, c, spared = new Set()) => !keptByStory(state, c) && !spared.has(c.id);

// a wound: most heal in one to three moons; one in twelve festers, and a festering wound kills unless the story keeps you
const HEAL = [30, 90];
const FESTER = 1 / 12;

/**
 * A day of the realm's health. `spared`: those a beat still to come names (Canon gravity; shared/plots.js canonAhead).
 * Returns { events, changes } — the changes (deaths, recoveries) for the caller to apply with the facts already told.
 */
export function lifeTick(state, r, { spared = new Set() } = {}) {
  const events = []; const changes = []; const today = dayNumber(state.meta.date);
  const winter = (state.world?.season || 'summer') === 'winter';
  const weekly = today % 7 === 0;
  for (const c of Object.values(state.characters)) {
    if (!c.alive) continue;
    // wounds: reckoned from the day they were first seen, healed or festered on their day
    if (c.status === 'wounded') {
      if (!c.wound) c.wound = { since: today, heals: today + HEAL[0] + Math.floor(r() * (HEAL[1] - HEAL[0])), festers: r() < FESTER };
      if (today >= c.wound.heals) {
        const w = c.wound; delete c.wound;
        if (w.festers && mayDie(state, c, spared)) {
          events.push(fact(state, 'death', { title: `${c.name} is dead`, text: `${c.name}'s wound festered, and the maesters could not save ${c.sex === 'f' ? 'her' : 'him'}.`, where: null, importance: state.houses[c.house]?.lord === c.id ? 4 : 2, houses: [c.house] }, { actors: [c.id], data: { cause: 'a festering wound' }, cause: { type: 'rule', ref: 'life' } }));
          changes.push({ op: 'character', id: c.id, alive: false, cause: 'a festering wound' });
        } else {
          events.push(fact(state, 'recovered', { title: `${c.name} recovers`, houses: [c.house], importance: 2 }, { actors: [c.id], cause: { type: 'rule', ref: 'life' } }));
          changes.push({ op: 'character', id: c.id, status: 'free' });
        }
      }
      continue;
    } else if (c.wound) delete c.wound;
    // fevers and frailty: reckoned once a week; the old, the ailing, and everyone in winter
    if (!weekly) continue;
    const age = c.age ?? 30; const ailing = /ailing|dying|sick|abed|frail/i.test(`${c.traits || ''} ${c.bio || ''}`);
    const risk = (age >= 70 ? 0.0015 * (age - 68) : age >= 60 ? 0.0004 : 0) * (winter ? 2.5 : 1) + (ailing ? 0.003 : 0) + (winter && age < 6 ? 0.0008 : 0);
    if (!risk || r() >= risk || !mayDie(state, c, spared)) continue;
    const cause = winter ? 'a winter chill' : ailing ? 'a long illness' : 'a fever';
    events.push(fact(state, 'death', { title: `${c.name} is dead`, text: `${c.name}${c.title ? `, ${c.title},` : ''} has died of ${cause}, aged ${age}.`, where: state.houses[c.house]?.seat || null, importance: state.houses[c.house]?.lord === c.id ? 4 : 2, houses: [c.house] }, { actors: [c.id], data: { cause, age }, cause: { type: 'rule', ref: 'life' } }));
    changes.push({ op: 'character', id: c.id, alive: false, cause });
  }
  return { events, changes };
}
