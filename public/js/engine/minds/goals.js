// What a person wants (docs/gdd/08-characters-politics.md §4; WP D6): their own goals from data/goals.js, or — for
// everyone else who speaks for a house — a goal from their house's rank and one from their nature. A goal names the
// verbs that are its next steps; the house's ways try them when nothing presses, and a mind is told the goals as what
// the person wants.
import { GOALS, RANK_GOALS, NATURE_GOALS } from '../../../data/goals.js';
import { temperament } from '../../shared/temperament.js';

/** A lord's nature, for the ways and the goals: ambitious, martial, cautious, dutiful or steady. */
export function archetype(T) {
  if (T.ambition >= 0.7) return 'ambitious';
  if (T.courage >= 0.8) return 'martial';
  if (T.courage <= 0.4) return 'cautious';
  if (T.honesty >= 0.7 || T.sway?.duty) return 'dutiful';
  return 'steady';
}

/** The goals of a person, most pressing first: their own, or their house's rank's and their nature's. */
export function goalsOf(state, c) {
  if (!c) return [];
  const own = GOALS[c.id];
  if (own?.length) return [...own].sort((a, b) => b.priority - a.priority);
  const h = state.houses[c.house]; const speaks = h && (h.lord === c.id || h.regent === c.id);
  if (!speaks) return [];
  return [...(RANK_GOALS[h.rank] || RANK_GOALS.minor), NATURE_GOALS[archetype(temperament(c))]].filter(Boolean);
}
