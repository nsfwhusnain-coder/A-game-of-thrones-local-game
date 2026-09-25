// Fog of war: what the player's house KNOWS of other hosts, not what is true.
//  • Seen: hosts of the player, their vassals and allies, and any host near their lands, their hosts, or
//    their allies' lands — confirmed, as they are.
//  • Reported: everything else is known only from the last sighting or report (a raven, a merchant, a spy):
//    where it was, how many, how long ago, and from whom. Reports age, and some are lies.
//  • Unknown: hosts no one has reported are not on the player's map at all.
// The true state stays in state.armies (the engine and the story model use it); state.intel holds reports.
const SIGHT = { holding: 55, vassal: 45, army: 75, ally: 45 };
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function friends(state) {
  const p = state.meta.player; const set = new Set([p]);
  for (const h of Object.values(state.houses)) if (h.liege === p) set.add(h.id);
  for (const x of state.pacts || []) if (x.status === 'active' && x.type === 'alliance' && (x.a === p || x.b === p)) set.add(x.a === p ? x.b : x.a);
  return set;
}

/** Eyes of the player's house: points on the map and how far each sees. */
function eyes(state) {
  const p = state.meta.player; const fr = friends(state); const out = [];
  for (const h of Object.values(state.holdings)) {
    if (h.owner === p) out.push([h.pos, SIGHT.holding]);
    else if (state.houses[h.owner]?.liege === p) out.push([h.pos, SIGHT.vassal]);
    else if (fr.has(h.owner)) out.push([h.pos, SIGHT.ally]);
  }
  for (const a of Object.values(state.armies)) if (fr.has(a.owner)) out.push([a.pos, SIGHT.army]);
  // the player's people abroad see what is around them (an envoy at King's Landing sees the city's hosts)
  for (const c of Object.values(state.characters)) if (c.alive && c.house === p && state.holdings[c.loc] && state.holdings[c.loc].owner !== p) out.push([state.holdings[c.loc].pos, 30]);
  // spies placed in a house show its hosts (see the 'report' and scheme ops)
  return { out, friends: fr };
}

export function isSeen(state, a, E = eyes(state)) {
  if (E.friends.has(a.owner)) return true;
  if ((state.intel?.spies || {})[a.owner]) return true;
  return E.out.some(([pos, r]) => dist(pos, a.pos) <= r);
}

/** After a turn: record what the house has seen, and let old reports age. */
export function updateIntel(state) {
  state.intel = state.intel || { armies: {}, spies: {} };
  const E = eyes(state); const t = state.meta.turn;
  for (const a of Object.values(state.armies)) {
    if (E.friends.has(a.owner)) { delete state.intel.armies[a.id]; continue; }
    if (isSeen(state, a, E)) state.intel.armies[a.id] = { pos: [...a.pos], men: a.men, turn: t, source: 'seen', owner: a.owner, name: a.name };
  }
  // reports of hosts that no longer exist linger until someone sees the empty field
  for (const [id, r] of Object.entries(state.intel.armies)) {
    if (state.armies[id]) continue;
    if (E.out.some(([pos, rad]) => dist(pos, r.pos) <= rad) || t - r.turn > 12) delete state.intel.armies[id];
  }
}

/**
 * What the player's map shows for each host: Map(id → { pos, men, known: 'seen'|'reported', age, source, false })
 * Hosts not in the map are unknown.
 */
export function viewOfArmies(state) {
  const E = eyes(state); const out = new Map(); const t = state.meta.turn;
  for (const a of Object.values(state.armies)) {
    if (isSeen(state, a, E)) { out.set(a.id, { pos: a.pos, men: a.men, known: 'seen', age: 0, source: 'seen' }); continue; }
    const r = state.intel?.armies?.[a.id];
    if (r) out.set(a.id, { pos: r.pos, men: r.men, known: 'reported', age: t - r.turn, source: r.source, false: !!r.false });
  }
  // false reports of hosts that do not exist at all
  for (const [id, r] of Object.entries(state.intel?.armies || {})) if (!state.armies[id] && r.false) out.set(id, { pos: r.pos, men: r.men, known: 'reported', age: t - r.turn, source: r.source, false: true, ghost: r });
  return out;
}

/** A report delivered by the story (a raven, a spy, a merchant — or a lie). Used by the 'report' change op. */
export function addReport(state, { army, at, pos, men, source, false: lie, owner, name }) {
  state.intel = state.intel || { armies: {}, spies: {} };
  const id = army || `rumour_${Object.keys(state.intel.armies).length + 1}`;
  const real = state.armies[id];
  state.intel.armies[id] = { pos: pos || real?.pos || [0, 0], men: Math.round(Number(men) || real?.men || 0), turn: state.meta.turn, source: String(source || 'a raven'), ...(lie ? { false: true } : {}), owner: owner || real?.owner, name: name || real?.name || 'A host' };
  return state.intel.armies[id];
}

export const ageText = (age) => (age <= 0 ? 'this moon' : age === 1 ? 'a turn old' : `${age} turns old`);
