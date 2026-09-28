// The invariants of the state model (docs/gdd/03-architecture.md §14), checked after every turn in the soak and in
// dev, and by the tests. Each returns plain-words problems; [] means the world holds together.
//
//   1  every character is in exactly one place, and a party lists the people in it
//   2  every living character does exactly one thing; one commanding a host is its leader, and in it
//   3  no party sits on the open sea unless it is a fleet or embarked
//   4  a host's contingents add up to its men
//   8  every letter in flight lands after it was sent
//   9  what a house has learned it learned after it happened, and a secret only by a spy, a scheme or a confession
// (10 — the player's view holds no hidden truth — is the server's: server/view.js `hiddenTruths`; 5–7 need commitments
// and the segmented jump: WP B10–B11.)
import { JUNCTIONS } from '../../../data/geography.js';
import { KINDS, STATES, idOf, ref } from '../parties.js';
import { ACTIVITIES } from '../activity.js';
import { landmassOf } from '../geo.js';
import { capacityOf } from '../military/supply.js';

const finite = (p) => Array.isArray(p) && p.length === 2 && p.every((x) => typeof x === 'number' && isFinite(x));
const isPlace = (state, id) => !!(state.holdings?.[id] || JUNCTIONS[id]);

export const INVARIANTS = {
  1: function onePlace(state) {
    const out = [];
    for (const c of Object.values(state.characters)) {
      if (!c.alive) { if (idOf(c.loc) != null) out.push(`1: ${c.id} is dead but still travels with ${c.loc}`); continue; }
      const pid = idOf(c.loc);
      if (pid == null) { if (!isPlace(state, c.loc)) out.push(`1: ${c.id} is at "${c.loc}", which is no place`); continue; }
      const p = state.parties[pid];
      if (!p) out.push(`1: ${c.id} travels with ${pid}, which does not exist`);
      else if (!(p.members || []).includes(c.id)) out.push(`1: ${c.id} travels with ${pid}, which does not list them`);
    }
    for (const p of Object.values(state.parties)) {
      const seen = new Set();
      for (const id of p.members || []) {
        if (seen.has(id)) out.push(`1: ${p.id} lists ${id} twice`); seen.add(id);
        const c = state.characters[id];
        if (!c) out.push(`1: ${p.id} lists ${id}, who does not exist`);
        else if (c.loc !== ref(p.id)) out.push(`1: ${p.id} lists ${id}, who is at ${c.loc}`);
      }
    }
    return out;
  },
  2: function oneActivity(state) {
    const out = [];
    for (const c of Object.values(state.characters)) {
      if (!c.alive) continue;
      const a = c.activity;
      if (!a || !ACTIVITIES[a.kind]) { out.push(`2: ${c.id} is doing nothing the engine knows (${a?.kind})`); continue; }
      if (a.kind === 'commanding') {
        const p = state.parties[a.party];
        if (!p) out.push(`2: ${c.id} commands ${a.party}, which does not exist`);
        else if (p.commander !== c.id) out.push(`2: ${c.id} is commanding ${p.id}, whose leader is ${p.commander}`);
        else if (c.loc !== ref(p.id)) out.push(`2: ${c.id} commands ${p.id} from ${c.loc}`);
      }
      if (a.party && !state.parties[a.party]) out.push(`2: ${c.id} is ${a.kind} with ${a.party}, which does not exist`);
    }
    return out;
  },
  3: function noneAtSea(state) {
    const out = [];
    for (const p of Object.values(state.parties)) {
      if (!finite(p.pos)) { out.push(`3: ${p.id} is nowhere (${JSON.stringify(p.pos)})`); continue; }
      if (p.kind === 'fleet' || p.state === 'embarked' || p.at) continue; // a party at a port stands in the port
      if (landmassOf(p.pos, 3) < 0) out.push(`3: ${p.id} (${p.kind}, ${p.state}) stands on the open sea at ${p.pos.map(Math.round)}`);
    }
    return out;
  },
  4: function contingentsAddUp(state) {
    const out = [];
    for (const p of Object.values(state.parties)) {
      if (!p.contingents) continue;
      const sum = Object.values(p.contingents).reduce((a, b) => a + b, 0);
      if (Math.abs(sum - (p.men || 0)) > 1) out.push(`4: ${p.id} has ${p.men} men, its banners ${sum}`);
    }
    return out;
  },
  8: function lettersLand(state) {
    const out = [];
    for (const l of state.post || []) {
      if (l.status !== 'in flight') continue;
      if (!(l.arriveDay > l.sentDay)) out.push(`8: letter ${l.id} lands on day ${l.arriveDay}, sent on ${l.sentDay}`);
      if (!(l.days >= 0)) out.push(`8: letter ${l.id} flies ${l.days} days`);
    }
    return out;
  },
  9: function learnedInTime(state) {
    const out = [];
    for (const [house, k] of Object.entries(state.knowledge || {})) {
      for (const [id, n] of Object.entries(k.facts || {})) {
        if (!(n.day >= n.happened)) out.push(`9: House ${house} learned ${id} on day ${n.day}, before it happened (day ${n.happened})`);
        if (n.scope === 'secret' && !SECRET_WAYS.has(n.via)) out.push(`9: House ${house} knows the secret ${id} by ${n.via}`);
      }
      for (const p of k.pending || []) if (!(p.day > p.happened)) out.push(`9: House ${house} waits for news of day ${p.happened} that came on day ${p.day}`);
    }
    return out;
  },
};
const SECRET_WAYS = new Set(['spy', 'scheme', 'confession']);

// the shape of a party: what the engine and the map rely on
function wellFormed(state) {
  const out = [];
  for (const [id, p] of Object.entries(state.parties)) {
    if (p.id !== id) out.push(`party ${id} calls itself ${p.id}`);
    if (!KINDS.includes(p.kind)) out.push(`party ${id} is of no kind (${p.kind})`);
    if (!STATES.includes(p.state)) out.push(`party ${id} is in no state (${p.state})`);
    if ('status' in p) out.push(`party ${id} carries free-text status "${p.status}"`);
    if (p.at && !isPlace(state, p.at)) out.push(`party ${id} is at "${p.at}", which is no place`);
    if (!(p.men >= 0)) out.push(`party ${id} has ${p.men} men`);
    if (p.march && idOf(p.march.to) != null && !state.parties[idOf(p.march.to)]) out.push(`party ${id} follows ${p.march.to}, which is gone`);
    if (p.route && !(p.route.done <= p.route.days + 1e-6)) out.push(`party ${id} has walked past the end of its road`);
    // a host's bread (engine/military/supply.js): never less than nothing, never more than its men and wagons carry
    // (men lost in a battle today leave their bread in the wagons until tomorrow's reckoning: counted at the men it fed)
    const cap = capacityOf({ ...p, men: Math.max(p.men, p.fedMen || 0) });
    if (p.rations != null && !(p.rations >= 0 && p.rations <= cap + 1)) out.push(`party ${id} carries ${p.rations} rations (it can carry ${cap})`);
  }
  for (const h of Object.values(state.holdings || {})) if (h.devastation != null && !(h.devastation >= 0 && h.devastation <= 100)) out.push(`holding ${h.id} is ${h.devastation} devastated`);
  return out;
}

/** Every problem with the state, or [] (pass `only: [1, 2]` for some of the invariants). */
export function validate(state, { only = null } = {}) {
  const out = [];
  for (const [n, check] of Object.entries(INVARIANTS)) if (!only || only.includes(Number(n))) out.push(...check(state));
  if (!only) out.push(...wellFormed(state));
  return out;
}
