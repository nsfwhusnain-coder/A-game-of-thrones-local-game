// Older saves, brought up to the current state model (docs/gdd/03-architecture.md §12). Each step looks for the old
// shape and converts it, so a step is safe to run twice and a save that skipped a version still arrives whole.
// world.js migrateState() calls toV3() first, before anything reads the parties.
import { kindOf, stateFromStatus, idOf, ref, syncMembers, settleAll } from '../parties.js';

/** v2 → v3: armies become parties (with kinds and engine states); `army:<id>` becomes `party:<id>`. */
export function toV3(state) {
  if (state.armies && !state.parties) { state.parties = state.armies; delete state.armies; }
  state.parties = state.parties || {};
  for (const a of Object.values(state.parties)) {
    a.kind = kindOf(a);
    if (a.party) { a.purpose = a.party; delete a.party; }                       // a lord's household on the road
    if (!a.state) a.state = stateFromStatus({ ...a, party: a.purpose });
    delete a.status; delete a.type;                                            // free text, now derived (B-20)
    if (idOf(a.march?.to) != null) a.march.to = ref(idOf(a.march.to));
    if (!Array.isArray(a.members)) a.members = [];
  }
  if (state.intel?.armies && !state.intel.parties) { state.intel.parties = state.intel.armies; delete state.intel.armies; }
  syncMembers(state);   // `army:<id>` locations become `party:<id>`, and every party lists its people
  settleAll(state);
  state.version = Math.max(3, state.version || 0);
  return state;
}
