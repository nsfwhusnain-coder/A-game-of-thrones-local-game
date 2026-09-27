// Parties: everything that moves across the map (docs/gdd/03-architecture.md §3.3, §5). A host, a fleet, a garrison, a
// lord's household on the road, the King's progress, a lone rider: each is a party in `state.parties`, with the people
// travelling in it listed in `members`. A person is always in exactly one place — `c.loc` holds a holding or place id,
// or `party:<id>` — and setLoc() is the one way to change it, so a party's members and its people never disagree.
//
// A party's `state` is an engine enum; what the player reads ("marching to Moat Cailin", "awaiting ships at White
// Harbor") is derived from it by statusText(), never written by a model (B-20: the story once relabelled a host on
// the march as "holding").
import { PLACE_NAMES } from '../../data/geography.js';

export const PREFIX = 'party:';
export const KINDS = ['host', 'fleet', 'garrison', 'retinue', 'progress', 'envoy', 'rider', 'caravan', 'band'];
export const STATES = ['forming', 'mustering', 'marching', 'camped', 'besieging', 'engaged', 'routed', 'embarked', 'staying', 'returning', 'disbanded'];
// the kinds that carry no fighting men of their own: a rider is a person on a horse, not a host
export const TRAVELLERS = new Set(['rider', 'envoy']);

/** `party:<id>` for a party id. */
export const ref = (id) => PREFIX + id;
/** The party id in a `party:<id>` reference (older saves wrote `army:<id>`), or null for anything else. */
export function idOf(where) {
  const s = typeof where === 'string' ? where : '';
  return s.startsWith(PREFIX) ? s.slice(PREFIX.length) : s.startsWith('army:') ? s.slice(5) : null;
}
export const isRef = (where) => idOf(where) != null;
/** The party a reference names, if it still exists. */
export const partyAt = (state, where) => { const id = idOf(where); return id ? state.parties?.[id] || null : null; };
/** The party a character travels with, or null when they are at a place. */
export const partyOf = (state, c) => (c ? partyAt(state, c.loc) : null);
/** The fighting parties: hosts, fleets, garrisons, households with their escorts — not riders and envoys. */
export const forces = (state) => Object.values(state.parties || {}).filter((p) => !TRAVELLERS.has(p.kind));
export const isForce = (p) => !!p && !TRAVELLERS.has(p.kind);

/** The nearest holding to a point (the place a party's people go when it breaks up in the field). */
export function nearestHoldingId(state, pos) {
  let best = null, bd = Infinity;
  for (const h of Object.values(state.holdings || {})) { const d = (h.pos[0] - pos[0]) ** 2 + (h.pos[1] - pos[1]) ** 2; if (d < bd) { bd = d; best = h.id; } }
  return best;
}
/** Where a party stands, as a place id: its holding, else the nearest one. */
export const groundOf = (state, p) => p.at || nearestHoldingId(state, p.pos || [0, 0]);

/**
 * Put a character somewhere: a holding or place id, or `party:<id>`. The one way `c.loc` changes, so the party they
 * leave forgets them and the party they join lists them. Throws on a party that does not exist (an engine bug).
 */
export function setLoc(state, c, where) {
  if (!c) return;
  const to = idOf(where) != null ? ref(idOf(where)) : where;
  const next = partyAt(state, to);
  if (idOf(to) != null && !next) throw new Error(`no party ${idOf(to)} for ${c.name || c.id} to join`);
  const prev = partyOf(state, c);
  if (prev && prev !== next) {
    prev.members = (prev.members || []).filter((id) => id !== c.id);
    if (TRAVELLERS.has(prev.kind) && !prev.members.length) delete state.parties[prev.id]; // a ride with no one on it is over
  }
  c.loc = to;
  if (next && !(next.members || []).includes(c.id)) next.members = [...(next.members || []), c.id];
}
export const joinParty = (state, c, p) => setLoc(state, c, ref(p.id));
/** Take a character out of their party, to `where` (default: the party's ground). */
export function leaveParty(state, c, where = null) {
  const p = partyOf(state, c); if (!p) return;
  setLoc(state, c, where || groundOf(state, p));
}
/** The holding or place a person is at — their own, or the one where the party they are with has halted; null on the road. */
export const placeOf = (state, c) => { const p = partyOf(state, c); return p ? p.at || null : c?.loc || null; };
/** Where a person is, as one token: a place id, or `party:<id>` for someone on the road with a party. */
export const spot = (state, c) => { const p = partyOf(state, c); return p ? (p.at || ref(p.id)) : c?.loc || null; };
/** Two people in the same place (a hall, a camp, the same party on the road): no raven is needed between them. */
export const together = (state, a, b) => !!a && !!b && spot(state, a) != null && spot(state, a) === spot(state, b);
/** The people in a party, from its members list. */
export const membersOf = (state, p) => (p?.members || []).map((id) => state.characters[id]).filter(Boolean);
/** Everyone in `from` joins `to` (two hosts become one). */
export function moveMembers(state, from, to, only = () => true) {
  for (const c of membersOf(state, from)) if (only(c)) joinParty(state, c, to);
}
/**
 * A party breaks up: its people go to `home` (a place id, or a function of the person), and the party is gone.
 * Returns the people who were in it.
 */
export function disband(state, p, home = null) {
  const people = membersOf(state, p);
  for (const c of people) setLoc(state, c, (typeof home === 'function' ? home(c) : home) || groundOf(state, p));
  delete state.parties[p.id];
  return people;
}
/** Everyone in `p` arrives at `place` and leaves the party (a journey's end for a rider, a retinue's return). */
export function setDown(state, p, place, only = () => true) {
  for (const c of membersOf(state, p)) if (only(c)) setLoc(state, c, place);
}

/**
 * Rebuild every party's members from where the people are (migration, and a repair after a model-era save). A person
 * who claims a party that no longer exists is set down at the nearest holding to where it was last known.
 */
export function syncMembers(state) {
  for (const p of Object.values(state.parties || {})) p.members = [];
  for (const c of Object.values(state.characters || {})) {
    const id = idOf(c.loc); if (id == null) continue;
    const p = state.parties?.[id];
    // the dead travel with no one; a party that is gone leaves its people at home
    if (!p || !c.alive) { c.loc = p ? groundOf(state, p) : state.houses?.[c.house]?.seat || null; continue; }
    c.loc = ref(id); p.members.push(c.id);
  }
}

// ── State and what the player reads ─────────────────────────────────────────────────────────────────────────────────
/**
 * The state a party is in, from what it is doing: a voyage under way is `embarked`, a march `marching` (or
 * `returning`, for a household riding home), a siege `besieging`, a levy still gathering `mustering`, a household at
 * its hosts' `staying`; otherwise `camped`. Battles set `engaged`/`routed` for the turn they are fought.
 */
export function settle(state, p) {
  if (p.fought === state.meta?.turn && (p.state === 'routed' || p.state === 'engaged')) return p.state;
  // a host the siege engine put before the walls (shared/battles.js), with no new orders, is besieging while it lasts
  const h = p.besieging && state.holdings?.[p.besieging];
  const besieging = !!(h?.siege && !p.march);
  if (!besieging) delete p.besieging;
  p.state = p.sea?.phase === 'sailing' ? 'embarked'
    : p.march ? (p.purpose?.returning ? 'returning' : 'marching')
      : besieging ? 'besieging'
        : p.muster?.remaining > 0 ? 'mustering'
          : p.purpose && !p.purpose.returning && p.at ? 'staying'
            : 'camped';
  return p.state;
}
export const settleAll = (state) => { for (const p of Object.values(state.parties || {})) settle(state, p); };

const placeText = (state, id) => state.holdings?.[id]?.name || PLACE_NAMES[id] || (id ? String(id).replace(/_/g, ' ') : 'the field');
/** What the player reads about a party, derived from its state and orders (never stored, never written by a model). */
export function statusText(state, p) {
  if (!p) return '';
  const to = p.march?.to; const toName = idOf(to) != null ? state.parties?.[idOf(to)]?.name || 'another host' : placeText(state, to);
  const days = p.route?.daysLeft;
  const eta = days ? ` (~${Math.max(1, Math.round(days))} day${Math.round(days) === 1 ? '' : 's'})` : '';
  if (p.sea?.phase === 'waiting') return `awaiting ships at ${placeText(state, p.sea.port?.id || p.at)}`;
  if (p.sea?.phase === 'stranded') return `stranded at ${placeText(state, p.at)}: no ships`;
  switch (p.state) {
    case 'embarked': return `at sea, bound for ${p.sea?.landingName || toName}`;
    case 'marching':
      if (p.kind === 'rider') return `riding for ${toName}${eta}`;
      if (idOf(to) != null) return p.serving ? `following ${toName}` : `pursuing ${toName}`;
      return `${p.kind === 'fleet' ? 'sailing' : p.kind === 'retinue' ? 'riding' : 'marching'} for ${toName}${eta}`;
    case 'returning': return `riding home to ${toName}${eta}`;
    case 'besieging': return `besieging ${placeText(state, p.besieging || p.at)}`;
    case 'mustering': return `mustering at ${placeText(state, p.at)} (${Number(p.muster?.remaining || 0).toLocaleString('en-GB')} still to come)`;
    case 'staying': return `at ${placeText(state, p.at)}${p.purpose?.why ? `, ${String(p.purpose.why).replace(/^to |^for /, '')}` : ''}`;
    case 'engaged': return 'in battle';
    case 'routed': return 'routed, falling back';
    case 'forming': return 'forming';
    case 'disbanded': return 'disbanded';
    default:
      if (p.kind === 'garrison') return `garrisoning ${placeText(state, p.at)}`;
      if (p.kind === 'fleet') return p.at ? `at anchor off ${placeText(state, p.at)}` : 'at sea';
      return p.at ? `camped at ${placeText(state, p.at)}` : 'camped in the field';
  }
}

// ── Older saves ─────────────────────────────────────────────────────────────────────────────────────────────────────
/** The kind of a party from an older save's army record. */
export function kindOf(a) {
  if (a.kind && KINDS.includes(a.kind)) return a.kind;
  if (a.type === 'fleet') return 'fleet';
  if (a.id === 'royal_progress') return 'progress';
  if (a.party) return 'retinue';
  if (/garrison/i.test(a.status || '') || /^garrison of /i.test(a.name || '')) return 'garrison';
  return 'host';
}
/** The engine state an older save's free-text status meant (the text itself is dropped: it is derived now). */
export function stateFromStatus(a) {
  const s = String(a.status || '').toLowerCase();
  if (a.sea?.phase === 'sailing' || /at sea|sailing|embark/.test(s)) return 'embarked';
  if (/rout|retreat|fled|broken/.test(s)) return 'routed';
  if (/battle|engag/.test(s)) return 'engaged';
  if (/sieg|invest/.test(s)) return 'besieging';
  if (/muster|gather|forming/.test(s) || a.muster?.remaining > 0) return 'mustering';
  if (/home|return/.test(s)) return 'returning';
  if (a.march) return 'marching';
  if (a.party && a.at) return 'staying';
  return 'camped';
}
