// Where the map first looks, and where Home goes (bug hunt UI2). A house with no seat (Viserys in Pentos, the Golden Company) opened the map over the North and
// the Home key did nothing for it, because "home" was only ever the seat. A house's home is its seat; with none, the place its lord is at; with none, the middle
// of what it holds. Pure: no I/O, no dice, no clock.
import { charPos, resolvePlaceId } from '../shared/world.js';

/** The holding the player's house calls home: its seat, else the holding its lord is in, else null. */
export function homePlace(state) {
  const h = state?.houses?.[state.meta?.player]; if (!h) return null;
  if (h.seat && state.holdings?.[h.seat]) return h.seat;
  const at = resolvePlaceId(state.characters?.[h.lord]?.loc);
  return at && state.holdings?.[at] ? at : null;
}

/** Where the camera rests for the player's house: [x, y] on the atlas, or null when nothing is known. */
export function homeOf(state) {
  const id = homePlace(state); if (id) return state.holdings[id].pos;
  const h = state?.houses?.[state.meta?.player]; if (!h) return null;
  const at = charPos(state, state.characters?.[h.lord]); if (at) return at;
  const held = Object.values(state.holdings || {}).filter((x) => x.owner === h.id && x.pos);
  return held.length ? [held.reduce((a, x) => a + x.pos[0], 0) / held.length, held.reduce((a, x) => a + x.pos[1], 0) / held.length] : null;
}
