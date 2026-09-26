// Lords on the road. No one in the books sits in his castle for long: lords ride to feast with their neighbours,
// to weddings and funerals, to kneel to their liege, to hunt, to the market towns and the septs — always with a
// tail of household knights and guards. Each day the engine sends a few out under their banners; their parties
// travel the map (anyone on the road can see a lord's banners), stay some days, and ride home.
import { placeName, dateStr } from './world.js';

const PURPOSES = [
  { kind: 'liege', w: 3, why: (d) => `to pay his respects to ${d.lordName} at ${d.place}`, stay: [2, 5] },
  { kind: 'neighbour', w: 4, why: (d) => `to feast with ${d.lordName} at ${d.place}`, stay: [2, 4] },
  { kind: 'neighbour', w: 2, why: (d) => `for a wedding at ${d.place}`, stay: [3, 6] },
  { kind: 'neighbour', w: 1, why: (d) => `to settle a border quarrel with ${d.lordName}`, stay: [1, 3] },
  { kind: 'neighbour', w: 1, why: (d) => `to see a ward fostered at ${d.place}`, stay: [2, 4] },
  { kind: 'town', w: 2, why: (d) => `to the market at ${d.place}, for horses and iron`, stay: [1, 3] },
  { kind: 'town', w: 1, why: (d) => `to pray at the sept of ${d.place}`, stay: [1, 2] },
  { kind: 'near', w: 2, why: (d) => `to hunt in the country near ${d.place}`, stay: [1, 3] },
];
const MAX_ABROAD = 14;
const pick = (r, a) => a[Math.floor(r() * a.length)];
const weighted = (r, list) => { const t = list.reduce((n, x) => n + x.w, 0); let k = r() * t; for (const x of list) { k -= x.w; if (k <= 0) return x; } return list[0]; };
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const SIZE = { crown: [250, 450], paramount: [150, 350], major: [60, 180], minor: [20, 70] };

/** Send lords out, bring them home. Returns { events }. Parties are armies with a.party (and a.public). */
export function retinueTick(state, days, r = Math.random) {
  const events = []; const p = state.meta.player;
  // those abroad: arrived parties stay their days, then ride home; home again, the tail disbands
  for (const a of Object.values(state.armies)) {
    const P = a.party; if (!P) continue;
    const lord = state.characters[a.commander];
    if (!lord?.alive || lord.loc !== 'army:' + a.id) { delete state.armies[a.id]; continue; }
    if (a.march) continue;
    if (!P.returning && a.at === P.dest) {
      P.stay -= days;
      if (P.stay <= 0) { P.returning = true; a.march = { to: P.home, since: state.meta.turn }; a.status = 'riding home'; a.at = null; }
    } else if (P.returning && a.at === P.home) {
      lord.loc = P.home; delete state.armies[a.id];
    } else if (!P.returning && a.at && a.at !== P.dest) { a.march = { to: P.dest, since: state.meta.turn }; }
  }
  const abroad = Object.values(state.armies).filter((a) => a.party).length;
  let n = 0; for (let d = 0; d < Math.min(days, 7); d++) { if (r() < 0.7) n++; if (r() < 0.3) n++; }
  for (let k = 0; k < n && abroad + k < MAX_ABROAD; k++) {
    const e = sendOut(state, r); if (e) events.push(e);
  }
  return { events };
}

function sendOut(state, r) {
  const p = state.meta.player;
  const home = (h) => h.seat && state.holdings[h.seat];
  const lords = Object.values(state.houses).filter((h) => h.id !== p && h.lord && home(h) && SIZE[h.rank] && state.characters[h.lord]?.alive && state.characters[h.lord].status === 'free' && state.characters[h.lord].loc === h.seat && !state.characters[h.lord].travel && home(h).status !== 'besieged');
  if (!lords.length) return null;
  // the player's own region is where the eye rests: its lords go out more often
  const mine = state.holdings[state.houses[p]?.seat]?.region;
  const local = lords.filter((x) => home(x).region === mine);
  const h = r() < 0.55 && local.length ? pick(r, local) : pick(r, lords);
  if (!h) return null;
  const seat = home(h); const lord = state.characters[h.lord];
  const purpose = weighted(r, PURPOSES);
  const dest = destination(state, h, seat, purpose, r); if (!dest || dest.id === seat.id) return null;
  const [lo, hi] = SIZE[h.rank]; const men = Math.round((lo + r() * (hi - lo)) / 10) * 10;
  let id = `party_${lord.id}`; if (state.armies[id]) return null;
  const destLord = state.characters[state.houses[dest.owner]?.lord];
  const why = purpose.why({ place: dest.name, lordName: destLord?.name || `the lord of ${dest.name}` });
  state.armies[id] = { id, owner: h.id, name: `${lord.name}'s party`, commander: lord.id, at: null, pos: [...seat.pos], dest: null, men, type: 'army', composition: 'Household knights and riders, mounted', status: `riding ${why}`, morale: 75, supply: 90, asOf: dateStr(state.meta.date), public: true, march: { to: dest.id, since: state.meta.turn }, party: { dest: dest.id, home: seat.id, stay: purpose.stay[0] + Math.floor(r() * (purpose.stay[1] - purpose.stay[0] + 1)), why } };
  lord.loc = 'army:' + id;
  const toYou = dest.owner === p;
  return { title: `${lord.name} rides for ${dest.name}`, text: `${lord.name} leaves ${seat.name} with ${men} knights and riders under the ${h.name} banner, ${why}.`, where: seat.id, importance: toYou ? 3 : 1, type: 'court', houses: [h.id, ...(toYou ? [p] : [])], ...(toYou ? {} : { bg: true }) };
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

/** For the story model: who is abroad with a tail of men, and why. */
export function retinuesDigest(state) {
  return Object.values(state.armies).filter((a) => a.party).map((a) => `${state.characters[a.commander]?.name} (${a.men} men) ${a.party.returning ? `riding home to ${placeName(state, a.party.home)}` : a.at === a.party.dest ? `at ${placeName(state, a.at)}, ${a.party.why.replace(/^to |^for /, 'there ')}` : `on the road, ${a.party.why}`}`).join('; ');
}
