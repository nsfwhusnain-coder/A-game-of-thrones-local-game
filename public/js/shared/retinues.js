// Lords on the road. No one in the books sits in his castle for long: lords ride to feast with their neighbours,
// to weddings and funerals, to kneel to their liege, to hunt, to the market towns and the septs — always with a
// tail of household knights and guards. Each day the engine sends a few out under their banners; their parties
// travel the map (anyone on the road can see a lord's banners), stay some days, and ride home.
import { placeName, dateStr } from './world.js';
import { partyOf, joinParty, disband, settle, forces } from '../engine/parties.js';
import { canAttend } from '../engine/activity.js';
import { emit, fact } from '../engine/facts/log.js';
import { pronouns } from './people.js';
import { random } from '../engine/rng.js';
import { temperament } from './temperament.js';
import { canonLocked } from './plots.js';
import { dayNumber } from '../engine/time.js';

// why a lord rides out (09 §3.1): each purpose weighted, and weighted again by the lord's nature and the season
const PURPOSES = [
  { kind: 'liege', w: 3, by: 'ambition', why: (d) => `to pay ${d.his} respects to ${d.lordName} at ${d.place}`, stay: [2, 5] },
  { kind: 'neighbour', w: 4, by: 'warmth', feast: true, why: (d) => `to feast with ${d.lordName} at ${d.place}`, stay: [2, 4] },
  { kind: 'neighbour', w: 2, by: 'warmth', feast: true, why: (d) => `for a wedding at ${d.place}`, stay: [3, 6] },
  { kind: 'neighbour', w: 1, why: (d) => `to settle a border quarrel with ${d.lordName}`, stay: [1, 3] },
  { kind: 'neighbour', w: 1, why: (d) => `to see a ward fostered at ${d.place}`, stay: [2, 4] },
  { kind: 'town', w: 2, why: (d) => `to the market at ${d.place}, for horses and iron`, stay: [1, 3] },
  { kind: 'town', w: 1, by: 'piety', why: (d) => `to pray at the sept of ${d.place}`, stay: [1, 2] },
  { kind: 'near', w: 2, why: (d) => `to hunt in the country near ${d.place}`, stay: [1, 3] },
  { kind: 'tourney', w: 0, why: (d) => `for the tourney at ${d.place}`, stay: [3, 6] },
  { kind: 'king', w: 0, why: (d) => `to greet the King at ${d.place}`, stay: [1, 3] },
  { kind: 'pilgrim', w: 0.3, by: 'piety', why: (d) => `on pilgrimage to ${d.place}`, stay: [2, 5] },
];
const PILGRIM = ['hightower', 'isle_of_faces', 'baratheon']; // the Starry Sept, the Isle of Faces, the Great Sept of Baelor
const MAX_ABROAD = 20, MAX_TOURNEY = 30;
// a tourney held in the last moon draws the lords of its region (hold_tourney's `tourney` fact)
const tourneyNow = (state) => { const today = dayNumber(state.meta.date); return Object.entries(state.plots?.tourneys || {}).filter(([, d]) => today - d <= 30).map(([seat]) => seat); };
const pick = (r, a) => a[Math.floor(r() * a.length)];
const weighted = (r, list) => { const t = list.reduce((n, x) => n + x.w, 0); let k = r() * t; for (const x of list) { k -= x.w; if (k <= 0) return x; } return list[0]; };
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const SIZE = { crown: [250, 450], paramount: [150, 350], major: [60, 180], minor: [20, 70] };
// A lord with a duty does not ride off to feast: one summoned to the banners (or already answering them), one at war,
// or one who leads a host in the field stays where the duty is.
const SUMMONED = ['called', 'delayed', 'answered'];
export function dutyBound(state, h) {
  if (SUMMONED.includes(h.obligations?.levies)) return true;
  if ((state.wars || []).some((w) => w.status !== 'ended' && (w.attackers.includes(h.id) || w.defenders.includes(h.id)))) return true;
  return forces(state).some((a) => !['retinue', 'garrison'].includes(a.kind) && a.commander === h.lord);
}

/** Send lords out, bring them home. Returns { events }. A lord's household on the road is a party of kind 'retinue'
 *  with a `purpose` (where, why, how long) and `public` banners. */
export function retinueTick(state, days, r = random) {
  const events = []; const p = state.meta.player;
  // those abroad: arrived parties stay their days, then ride home; home again, the tail disbands
  for (const a of Object.values(state.parties)) {
    const P = a.purpose; if (a.kind !== 'retinue' || !P) continue;
    const lord = state.characters[a.commander];
    if (!lord?.alive || partyOf(state, lord) !== a) { disband(state, a); continue; } // the lord has left it: the tail goes home
    const home = (why) => {
      P.returning = true; a.march = { to: P.home, since: state.meta.turn }; a.at = null; settle(state, a);
      emit(state, 'set_out', { actors: [a.commander], houses: [a.owner], place: P.dest || null, pos: a.pos, data: { party: a.id, to: P.home, returning: true, why }, cause: { type: 'rule', ref: 'retinues' }, text: `${lord.name} rides home to ${state.holdings[P.home]?.name || 'the seat'}${why === 'duty' ? ', called back by the war' : ''}.` });
    };
    // summoned or at war while abroad: the visit is cut short and the lord rides home to raise his men
    if (!P.returning && dutyBound(state, state.houses[a.owner] || {})) { home('duty'); continue; }
    if (a.march) continue;
    if (!P.returning && a.at === P.dest) {
      P.stay -= days;
      if (P.stay <= 0) home('done');
    } else if (P.returning && a.at === P.home) {
      emit(state, 'returned', { actors: [a.commander], houses: [a.owner], place: P.home, pos: a.pos, data: { party: a.id }, cause: { type: 'rule', ref: 'retinues' } });
      disband(state, a, P.home);
    } else if (!P.returning && a.at && a.at !== P.dest) { a.march = { to: P.dest, since: state.meta.turn }; settle(state, a); }
  }
  const abroad = Object.values(state.parties).filter((a) => a.kind === 'retinue').length;
  // up to three a day; twenty abroad at once, thirty in a tourney moon
  let n = 0; for (let d = 0; d < Math.min(days, 7); d++) { if (r() < 0.7) n++; if (r() < 0.4) n++; if (r() < 0.15) n++; }
  const cap = tourneyNow(state).length ? MAX_TOURNEY : MAX_ABROAD;
  for (let k = 0; k < n && abroad + k < cap; k++) {
    const e = sendOut(state, r); if (e) events.push(e);
  }
  return { events };
}

function sendOut(state, r) {
  const p = state.meta.player;
  const home = (h) => h.seat && state.holdings[h.seat];
  // a child lord (a boy of six at the Eyrie) does not ride out with his household knights to hunt in the country (ST11); the people a near beat of the story needs stay where they are (engine/world/beats.js; B-10)
  const locked = canonLocked(state);
  const lords = Object.values(state.houses).filter((h) => h.id !== p && h.lord && home(h) && SIZE[h.rank] && state.characters[h.lord]?.alive && state.characters[h.lord].status === 'free' && (state.characters[h.lord].age ?? 30) >= 15 && state.characters[h.lord].loc === h.seat && home(h).status !== 'besieged' && !dutyBound(state, h) && !locked.has(h.lord) && canAttend(state, state.characters[h.lord], 'attending'));
  if (!lords.length) return null;
  // the player's own region is where the eye rests: its lords go out more often
  const mine = state.holdings[state.houses[p]?.seat]?.region;
  const local = lords.filter((x) => home(x).region === mine);
  const h = r() < 0.55 && local.length ? pick(r, local) : pick(r, lords);
  if (!h) return null;
  const seat = home(h); const lord = state.characters[h.lord];
  const T = temperament(lord); const season = state.world?.season || 'summer';
  const tourneys = tourneyNow(state).filter((x) => state.holdings[x]?.region === seat.region);
  const progress = Object.values(state.parties).find((a) => a.kind === 'progress' && a.at && dist(state.holdings[a.at]?.pos || [9e9, 9e9], seat.pos) < 120);
  const purpose = weighted(r, PURPOSES.map((x) => ({ ...x,
    w: (x.kind === 'tourney' ? (tourneys.length ? 24 : 0) : x.kind === 'king' ? (progress ? 10 : 0) : x.w)
      * (x.by ? 0.5 + (T[x.by] ?? 0.5) : 1) * (x.feast && season === 'autumn' ? 2 : 1), // the harvest feasts of autumn
  })));
  // no long journeys in a northern winter
  if (season === 'winter' && seat.region === 'north' && !['near', 'king'].includes(purpose.kind)) return null;
  const dest = purpose.kind === 'tourney' ? state.holdings[pick(r, tourneys)] : purpose.kind === 'king' ? state.holdings[progress.at]
    : purpose.kind === 'pilgrim' ? state.holdings[pick(r, PILGRIM.filter((x) => state.holdings[x]))] : destination(state, h, seat, purpose, r);
  if (!dest || dest.id === seat.id) return null;
  const [lo, hi] = SIZE[h.rank]; const men = Math.round((lo + r() * (hi - lo)) / 10) * 10;
  let id = `party_${lord.id}`; if (state.parties[id]) return null;
  const destLord = state.characters[state.houses[dest.owner]?.lord];
  const why = purpose.why({ place: dest.name, lordName: destLord?.name || `the lord of ${dest.name}`, his: pronouns(lord).his });
  state.parties[id] = { id, owner: h.id, name: `${lord.name}'s party`, commander: lord.id, at: null, pos: [...seat.pos], men, kind: 'retinue', members: [], composition: 'Household knights and riders, mounted', morale: 75, supply: 90, asOf: dateStr(state.meta.date), public: true, march: { to: dest.id, since: state.meta.turn }, purpose: { dest: dest.id, home: seat.id, stay: purpose.stay[0] + Math.floor(r() * (purpose.stay[1] - purpose.stay[0] + 1)), why } };
  joinParty(state, lord, state.parties[id]);
  // a wife, a grown son or daughter may ride along (0–3 of the family at the seat)
  const kin = Object.values(state.characters).filter((c) => c.alive && c.house === h.id && c.id !== lord.id && c.loc === h.seat && c.status === 'free' && (c.age ?? 20) >= 12 && !locked.has(c.id) && (c.roles || []).some((x) => ['lady', 'heir', 'family'].includes(x)) && canAttend(state, c, 'attending'));
  for (const c of kin.slice(0, Math.floor(r() * 4))) joinParty(state, c, state.parties[id]);
  settle(state, state.parties[id]);
  const toYou = dest.owner === p;
  return fact(state, 'set_out', { title: `${lord.name} rides for ${dest.name}`, text: `${lord.name} leaves ${seat.name} with ${men} knights and riders under the ${h.name} banner, ${why}.`, where: seat.id, importance: toYou ? 3 : 1, type: 'court', houses: [h.id, ...(toYou ? [p] : [])], ...(toYou ? {} : { bg: true }) }, { actors: [lord.id], data: { party: id, to: dest.id, why } });
}

function destination(state, h, seat, purpose, r) {
  const hs = Object.values(state.holdings);
  if (purpose.kind === 'liege') { const lg = state.houses[h.liege]; return lg?.seat && state.holdings[lg.seat] ? state.holdings[lg.seat] : null; }
  const near = hs.filter((x) => x.id !== seat.id && x.region === seat.region && dist(x.pos, seat.pos) < 160);
  if (purpose.kind === 'town') { const towns = near.filter((x) => /town|city|port/.test(x.type || '')); return towns.length ? pick(r, towns) : null; }
  if (purpose.kind === 'near') { const close = near.filter((x) => dist(x.pos, seat.pos) < 60); return close.length ? pick(r, close) : null; }
  const others = near.filter((x) => x.owner !== h.id && state.houses[x.owner]?.lord && x.seatOf);
  return others.length ? pick(r, others) : null;
}

/** The guests at a seat (09 §3.1): the lords whose parties are staying there, and whom they brought. */
export function guestsAt(state, holdingId) {
  return Object.values(state.parties).filter((a) => a.kind === 'retinue' && a.at === holdingId && a.purpose?.dest === holdingId && !a.purpose.returning)
    .flatMap((a) => (a.members || []).map((id) => state.characters[id]).filter(Boolean));
}

/** For the story model: who is abroad with a tail of men, and why. */
export function retinuesDigest(state) {
  return Object.values(state.parties).filter((a) => a.kind === 'retinue' && a.purpose).map((a) => `${state.characters[a.commander]?.name} (${a.men} men) ${a.purpose.returning ? `riding home to ${placeName(state, a.purpose.home)}` : a.at === a.purpose.dest ? `at ${placeName(state, a.at)}, ${a.purpose.why.replace(/^to |^for /, 'there ')}` : `on the road, ${a.purpose.why}`}`).join('; ');
}
