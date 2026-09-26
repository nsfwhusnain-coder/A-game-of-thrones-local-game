// Fog of war: what the player's house KNOWS of other hosts, not what is true.
//  • Confirmed: hosts of the player, their vassals and allies, hosts near their lands, hosts, allies or
//    people, and the hosts of houses where their spymaster has eyes — whose banners, how many, who leads them.
//  • Unconfirmed: everything else is known by report. News travels: ravens, merchants and septons carry word
//    of a great host across the realm within a moon, of a small band less surely. The map shows a grey plate
//    where the report put it, and no more: whose it is said to be, not who leads it.
//  • Deception: a host can march in secret (the realm loses track of it) or feint (word is spread that it
//    marches elsewhere). The player's hosts' secrecy is told to the story model as what the other houses
//    believe; the story may likewise plant false reports on the player (the 'report' op).
// The true state stays in state.armies (the engine and the story model use it); state.intel holds reports.

const SIGHT = { holding: 55, vassal: 45, army: 75, ally: 45, person: 30 };
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
  for (const c of Object.values(state.characters)) if (c.alive && c.house === p && state.holdings[c.loc] && state.holdings[c.loc].owner !== p) out.push([state.holdings[c.loc].pos, SIGHT.person]);
  return { out, friends: fr };
}

export function isSeen(state, a, E = eyes(state)) {
  if (E.friends.has(a.owner)) return true;
  // a lord's party under his banners, a king's progress: the whole realm watches them pass
  if (a.public && a.secrecy !== 'hidden') return true;
  if ((state.intel?.spies || {})[a.owner] != null) return true;
  return E.out.some(([pos, r]) => dist(pos, a.pos) <= r);
}

// How surely word of a host reaches the player in a turn: great hosts are the talk of the realm
function newsChance(a) {
  let c = a.type === 'fleet' ? 0.5 : a.men >= 5000 ? 0.92 : a.men >= 2000 ? 0.7 : a.men >= 500 ? 0.45 : 0.2;
  if (a.secrecy === 'hidden') c *= 0.12;
  return c;
}
function nearestName(state, pos) {
  let best = null, d = Infinity;
  for (const h of Object.values(state.holdings)) { const x = dist(h.pos, pos); if (x < d) { d = x; best = h; } }
  return best?.name || 'the road';
}

/** After a turn: record what the house has seen or heard, and let old reports age. */
export function updateIntel(state, r = Math.random) {
  state.intel = state.intel || { armies: {}, spies: {} };
  const E = eyes(state); const t = state.meta.turn;
  for (const a of Object.values(state.armies)) {
    if (E.friends.has(a.owner)) { delete state.intel.armies[a.id]; continue; }
    if (isSeen(state, a, E)) { state.intel.armies[a.id] = { pos: [...a.pos], men: a.men, turn: t, source: 'seen', owner: a.owner, name: a.name, confirmed: true }; continue; }
    // word travels: ravens, merchants, septons — a feint sends the word the wrong way
    const rooks = state.houses[state.meta.player]?.intel || 0; // rookeries: word comes surer
    if (r() < Math.min(0.98, newsChance(a) * (1 + rooks * 0.25))) {
      const feint = a.feint && state.holdings[a.feint];
      const pos = feint ? [...feint.pos] : [...a.pos];
      const rounded = Math.max(100, Math.round(a.men * (0.75 + r() * 0.5) / 100) * 100); // reports are never exact
      state.intel.armies[a.id] = { pos, men: rounded, turn: t, source: `word from near ${nearestName(state, pos)}`, owner: a.owner, name: a.name };
    }
  }
  // reports of hosts that no longer exist linger until someone sees the empty field, or they are forgotten
  for (const [id, rep] of Object.entries(state.intel.armies)) {
    if (state.armies[id] && !rep.false) continue;
    if (E.out.some(([pos, rad]) => dist(pos, rep.pos) <= rad) || t - rep.turn > 6) delete state.intel.armies[id];
  }
}

/**
 * What the player's map shows for each host: Map(id → { pos, men, known: 'seen'|'reported', age, source, owner })
 * Hosts not in the map are unknown. Reports older than a few turns drop off the map.
 */
export function viewOfArmies(state) {
  const E = eyes(state); const out = new Map(); const t = state.meta.turn;
  for (const a of Object.values(state.armies)) {
    if (isSeen(state, a, E)) { out.set(a.id, { pos: a.pos, men: a.men, known: 'seen', age: 0, source: 'seen', owner: a.owner }); continue; }
    const rep = state.intel?.armies?.[a.id];
    if (rep && t - rep.turn <= 4) out.set(a.id, { pos: rep.pos, men: rep.men, known: 'reported', age: t - rep.turn, source: rep.source, owner: rep.owner || a.owner, false: !!rep.false });
  }
  // false reports of hosts that do not exist at all
  for (const [id, rep] of Object.entries(state.intel?.armies || {})) if (!state.armies[id] && rep.false && t - rep.turn <= 4) out.set(id, { pos: rep.pos, men: rep.men, known: 'reported', age: t - rep.turn, source: rep.source, owner: rep.owner, false: true, ghost: rep });
  return out;
}

/** A report delivered by the story (a raven, a spy, a merchant — or a lie). Used by the 'report' change op. */
export function addReport(state, { army, pos, men, source, false: lie, owner, name }) {
  state.intel = state.intel || { armies: {}, spies: {} };
  const id = army || `rumour_${state.meta.turn}_${Object.keys(state.intel.armies).length + 1}`;
  const real = state.armies[id];
  state.intel.armies[id] = { pos: pos || real?.pos || [0, 0], men: Math.round(Number(men) || real?.men || 0), turn: state.meta.turn, source: String(source || 'a raven'), ...(lie ? { false: true } : {}), owner: owner || real?.owner, name: name || real?.name || 'A host' };
  return state.intel.armies[id];
}

/** For the story model: what the other houses believe about the player's hosts (secret marches, feints). */
export function beliefsAboutPlayer(state, placeName) {
  const p = state.meta.player; const out = [];
  for (const a of Object.values(state.armies)) {
    if (a.owner !== p) continue;
    if (a.secrecy === 'hidden') out.push(`${a.name} (${a.men} men) MARCHES IN SECRET — by night, off the roads: other houses do not know where it is unless it comes within a day's ride of their lands or hosts; they may be surprised by it.`);
    if (a.feint && state.holdings[a.feint]) out.push(`${a.name}: the player has spread word that it marches on ${placeName(state, a.feint)}. Other houses who have not seen it with their own eyes BELIEVE that, and act on it.`);
  }
  return out;
}

export const ageText = (age) => (age <= 0 ? 'this moon' : age === 1 ? 'a turn ago' : `${age} turns ago`);
