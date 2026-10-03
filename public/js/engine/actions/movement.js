// Movement verbs (docs/gdd/03-architecture.md §5): sending one of the house's people somewhere — alone, with a few
// riders, or at the head of a company — and calling a rider back. The journey itself is the engine's (a rider party on
// a planned road: engine/movement.js, shared/marches.js); the verb decides only whether it may begin.
import { applyChanges, resolvePlaceId, placeName, placePos, rideOf } from '../../shared/world.js';
import { partyOf } from '../parties.js';
import { atSeaOn } from '../movement.js';
import { destination } from './military.js';
import { listsPending } from '../../shared/tourney.js';
import { speakerFor } from '../../shared/regency.js';
import { ailing } from '../../shared/people.js';

const held = (c) => /imprisoned|captive/.test(c?.status || '');
const sentence = (t) => t.replace(/^./, (x) => x.toUpperCase()).replace(/([^.!?…])$/, '$1.');

/** Carry a journey out through the one place journeys are made (the `travel` op), as a receipt. */
function travel(state, i, change) {
  const r = applyChanges(state, [{ op: 'travel', ...change }], { source: 'Your orders', cause: i.source });
  if (!r.applied.length) throw new Error(r.rejected[0]?.reason || 'they cannot go');
  return { text: r.applied[0].text, facts: r.applied[0].facts || [] };
}

export const MOVEMENT = [
  {
    id: 'send_person', family: 'movement', label: 'Send someone somewhere',
    params: { character: 'character:own', to: 'place', men: 'number?', companions: 'character:own[]?' },
    legal: (state, i) => {
      const c = state.characters[i.params.character];
      if (!c || c.house !== i.house) return { code: 'not_yours', text: 'No one of yours by that name.' };
      if (!c.alive) return { code: 'dead', text: `${c.name} is dead.` };
      if (held(c)) return { code: 'captive', text: `${c.name} is a prisoner, and goes nowhere at your word.` };
      if (ailing(c)) return { code: 'ailing', text: `${c.name} is too ill to ride.` };
      const to = resolvePlaceId(i.params.to) || destination(state, i.params.to);
      if (!to || !placePos(to, state.holdings)) return { code: 'no_place', text: `No one knows the way to ${i.params.to || 'nowhere'}.` };
      // the one who holds a tourney is there when its lists are run (a lord of another house is not sent off to hunt while his own lists wait; the player's own lord goes where the player says)
      const seat = state.houses[c.house]?.seat;
      if (c.house !== state.meta.player && seat && listsPending(state, seat) && speakerFor(state, c.house)?.id === c.id && to !== resolvePlaceId(seat)) return { code: 'hosting', text: `${c.name} cannot leave while the lists at ${placeName(state, seat)} are yet to be run.` };
      const ride = rideOf(state, c);
      if (ride?.march?.to === to) return { code: 'already', text: `${c.name} is already on the road to ${placeName(state, to)}.` };
      if (!ride && resolvePlaceId(c.loc) === to && !partyOf(state, c)) return { code: 'there', text: `${c.name} is already at ${placeName(state, to)}.` };
      if (ride?.route && atSeaOn(ride.route, ride.route.done)) return { code: 'at_sea', text: `${c.name} is at sea, and can turn only when the ship makes port.` };
      return null;
    },
    start: (state, i) => travel(state, i, { character: i.params.character, to: resolvePlaceId(i.params.to) || destination(state, i.params.to), men: Number(i.params.men) || 0, ...(i.params.companions ? { companions: i.params.companions } : {}) }),
    receipt: (state, i, d) => [{ ok: true, text: sentence(d.text), eta: Number(d.text.match(/~(\d+) days?/)?.[1]) || null }],
    said: (state, i, d) => ({ status: 'underway', text: sentence(d.text) }),
    facts: ['set_out'], mind: { allowed: true },
  },
  {
    id: 'recall_rider', family: 'movement', label: 'Call a rider back',
    params: { character: 'character:own' },
    legal: (state, i) => {
      const c = state.characters[i.params.character]; const ride = c && rideOf(state, c);
      if (!ride || c.house !== i.house) return { code: 'not_riding', text: 'No one of yours is on that road.' };
      if (ride.route && atSeaOn(ride.route, ride.route.done)) return { code: 'at_sea', text: `${c.name} is at sea, and can turn only when the ship makes port.` };
      return null;
    },
    start: (state, i) => {
      const c = state.characters[i.params.character]; const ride = rideOf(state, c);
      const home = ride.from || state.houses[i.house].seat;
      return { ...travel(state, i, { character: c.id, to: home }), home };
    },
    receipt: (state, i, d) => [{ ok: true, text: sentence(d.text) }],
    said: (state, i, d) => ({ status: 'underway', text: `Recall ${state.characters[i.params.character].name}: turn back for ${placeName(state, d.home)}.` }),
    facts: ['set_out'], mind: { allowed: true },
  },
];
