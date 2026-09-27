// The world's derived truths, brought up to date: what each party is doing (engine/parties.js settle) and what each
// person is doing (engine/activity.js). Run whenever a state is made, migrated or saved, so no save ever holds a host
// "marching" with no orders or a lord "commanding" a host he has left (03 §14, invariants 1 and 2).
import { settleAll } from '../parties.js';
import { settleActivities } from '../activity.js';

export function settleWorld(state) {
  settleAll(state);
  settleActivities(state);
  return state;
}
