// Older saves, brought up to the current state model (docs/gdd/03-architecture.md §12). Each step looks for the old
// shape and converts it, so a step is safe to run twice and a save that skipped a version still arrives whole.
// world.js migrateState() calls toV3() first, before anything reads the parties.
import { kindOf, stateFromStatus, idOf, ref, syncMembers, joinParty, settle } from '../parties.js';
import { planRoute, ashore } from '../movement.js';
import { landmassOf } from '../geo.js';
import { JUNCTIONS } from '../../../data/geography.js';
import { SCENARIOS } from '../../../data/scenarios.js';
import { settleWorld } from './settle.js';

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
  if ((state.version || 0) < 3) {
    syncMembers(state); // `army:<id>` becomes `party:<id>`, and every party lists its people
    // the old marches went in straight lines, over the water too: whatever they left on the sea is put back ashore
    for (const p of Object.values(state.parties)) if (p.kind !== 'fleet' && !p.at && p.sea?.phase !== 'sailing' && landmassOf(p.pos, 3) < 0) p.pos = ashore(p.pos) || p.pos;
  }
  ridersToParties(state);
  if ((state.version || 0) < 3) placeless(state);
  settleWorld(state);   // every party's state, and everyone's activity (engine/activity.js)
  state.version = Math.max(3, state.version || 0);
  return state;
}

// A person riding alone (`c.travel` in older saves) becomes a rider party where they had got to on the road, on a route
// planned from there to where they were going.
function ridersToParties(state) {
  const where = (id) => state.holdings?.[id]?.pos || JUNCTIONS[id] || null;
  for (const c of Object.values(state.characters || {})) {
    const t = c.travel; if (!t) continue;
    delete c.travel;
    const to = where(t.to); if (!c.alive || !to) continue;
    const from = t.from || where(c.loc) || to;
    const f = Math.max(0, Math.min(1, 1 - (t.left ?? 0) / Math.max(1, t.days || 1)));
    let id = `rider_${c.id}`; while (state.parties[id]) id += '_2';
    const p = state.parties[id] = { id, kind: 'rider', owner: c.house, name: c.name, commander: c.id, men: 0, at: null, pos: [from[0] + (to[0] - from[0]) * f, from[1] + (to[1] - from[1]) * f], members: [], morale: 75, supply: 85, from: t.fromPlace || null, march: { to: t.to, since: state.meta?.turn ?? 0 } };
    joinParty(state, c, p);
    if (!planRoute(state, p, to, t.to, { toName: state.holdings?.[t.to]?.name || null })) { p.pos = [...to]; p.at = t.to; delete p.march; } // no way from there: they are where they were going
    settle(state, p);
  }
}

// Everyone is somewhere: a person an older save had nowhere ("at sea", with no ship) goes aboard the party the scenario
// gives them (Euron on the Silence), or home to their house's seat.
function placeless(state) {
  const tpls = SCENARIOS[state.meta?.scenario]?.parties || [];
  for (const c of Object.values(state.characters || {})) {
    if (!c.alive || idOf(c.loc) != null || state.holdings?.[c.loc] || JUNCTIONS[c.loc]) continue;
    const tpl = tpls.find((p) => (p.members || []).includes(c.id));
    if (tpl && !state.parties[tpl.id]) state.parties[tpl.id] = { ...tpl, kind: kindOf(tpl), at: null, pos: [...tpl.pos], members: [], morale: 70, supply: 80 };
    if (tpl) joinParty(state, c, state.parties[tpl.id]); else c.loc = state.houses?.[c.house]?.seat || c.loc;
  }
}
