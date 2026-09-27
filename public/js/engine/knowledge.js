// What each house knows (docs/gdd/09-living-world.md §7; 03-architecture.md §3.8). The truth is the facts and the
// parties; a house knows only what has reached it — by its own eyes, by raven, by a rider or a rumour, by a letter, by
// a spy — and it knows it late. Replaces shared/intel.js (its reports, spies, feints and secret marches are kept).
//
//  • News of a fact is worked out from the fact itself, not stored: where it happened, who may know of it (its `vis`),
//    how weighty it is, and how far it is from the house's eyes. A house's own doings it knows at once; what happens in
//    sight of its castles and hosts, at once; the realm's great news comes by raven (200 miles a day from the nearest
//    rookery); small news by rider and rumour (30 miles a day), and not across the whole realm.
//  • What cannot be worked out is stored in `state.knowledge[house]`: facts learned by a spy, a letter or a confession
//    (with the day and the way), the reports of other houses' hosts (with their noise, age and lies), the spies a house
//    keeps, and its beliefs.
//  • Hosts are known truly within sight; otherwise by report — last-known place, men rounded and ±25 %, age, source —
//    or not at all. A host marching in secret is seldom reported; a feint sends the report the wrong way.
import { random } from './rng.js';
import { placeOf, forces, TRAVELLERS } from './parties.js';
import { dayNumber, dateOfDay, dateStr } from './time.js';
import { factById } from './facts/log.js';
import { MILES_PER_UNIT } from '../../data/geography.js';

/** Sight in map units: own castles, sworn castles, own hosts, allies', one's people abroad — the fog of war's radii as
 * they were tuned in play (09 §7.2 proposes 60/40/80/50; D-032). */
export const SIGHT = { holding: 55, vassal: 45, host: 75, ally: 45, person: 30 };
const RAVEN = 200, RUMOUR = 30; // miles a day
const RUMOUR_REACH = 450; // miles: beyond this a small matter is not talked of
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
/** Ways news can be learned that the engine cannot work out, and so are kept (invariant 9: only these for a secret). */
export const LEARNED = new Set(['spy', 'letter', 'confession', 'scheme', 'witness']);

/** A house's store: { parties, spies, facts, beliefs } (made on first use). */
export function knowledgeOf(state, house = state.meta.player) {
  state.knowledge = state.knowledge || {};
  const k = state.knowledge[house] = state.knowledge[house] || {};
  k.parties = k.parties || {}; k.spies = k.spies || {}; k.facts = k.facts || {}; k.beliefs = k.beliefs || [];
  return k;
}

/** The house, its sworn houses and its allies: whose hosts it knows as its own (a liege keeps its own counsel). */
export function friendsOf(state, house = state.meta.player) {
  const set = new Set([house]);
  for (const x of Object.values(state.houses)) if (x.liege === house) set.add(x.id);
  for (const x of state.pacts || []) if (x.status === 'active' && x.type === 'alliance' && (x.a === house || x.b === house)) set.add(x.a === house ? x.b : x.a);
  return set;
}

/** The eyes of a house: [[pos, radius]] — its castles, its vassals' and allies' castles, their hosts, its people abroad. */
export function eyesOf(state, house = state.meta.player) {
  const fr = friendsOf(state, house); const out = [];
  for (const h of Object.values(state.holdings)) {
    if (h.owner === house) out.push([h.pos, SIGHT.holding]);
    else if (state.houses[h.owner]?.liege === house) out.push([h.pos, SIGHT.vassal]);
    else if (fr.has(h.owner)) out.push([h.pos, SIGHT.ally]);
  }
  for (const a of Object.values(state.parties)) if (fr.has(a.owner) && a.pos) out.push([a.pos, TRAVELLERS.has(a.kind) ? SIGHT.person : SIGHT.host]);
  // its people abroad see what is around them (an envoy at King's Landing sees the city's hosts)
  for (const c of Object.values(state.characters)) {
    if (!c.alive || c.house !== house) continue;
    const at = state.holdings[placeOf(state, c)];
    if (at && at.owner !== house) out.push([at.pos, SIGHT.person]);
  }
  return { out, friends: fr };
}

/** Whether a house sees a host truly now: its own and its friends', a public progress, one watched by its spies, one in sight. */
export function seesParty(state, house, a, E = eyesOf(state, house)) {
  if (E.friends.has(a.owner)) return true;
  if (a.public && a.secrecy !== 'hidden') return true; // a king's progress: the whole realm watches it pass
  if (knowledgeOf(state, house).spies[a.owner] != null) return true;
  return !!a.pos && E.out.some(([pos, r]) => dist(pos, a.pos) <= r);
}

// ── News of facts ────────────────────────────────────────────────────────────────────────────────────────────────────

const originOf = (state, f) => f.pos || state.holdings?.[f.place]?.pos || null;
/** Miles from a point to the nearest of a house's eyes (0 inside their sight). */
function milesToEyes(E, pos) {
  let best = Infinity;
  for (const [p, r] of E.out) best = Math.min(best, Math.max(0, dist(p, pos) - r));
  return best * MILES_PER_UNIT;
}
const ownsFact = (state, f, house) => (f.houses || []).includes(house) || (f.actors || []).some((id) => state.characters?.[id]?.house === house);

/**
 * When and how `house` learns of fact `f`: { day (absolute), via, confidence } — or null if it does not (a secret, a
 * letter to others, small news too far away). Deterministic: the same fact and world give the same answer.
 */
export function newsOf(state, f, house = state.meta.player, E = null) {
  const kept = state.knowledge?.[house]?.facts?.[f.id];
  if (kept) return kept;
  if (ownsFact(state, f, house)) return { day: f.day, via: 'witness', confidence: 1 };
  const scope = f.vis?.scope || 'public';
  if (scope === 'secret') return null;
  if (scope === 'houses') return (f.vis?.houses || []).includes(house) ? { day: f.day, via: 'letter', confidence: 1 } : null;
  const at = originOf(state, f);
  if (!at) return scope === 'public' ? { day: f.day + 3, via: 'rumour', confidence: 0.6 } : null;
  const d = milesToEyes(E || eyesOf(state, house), at);
  if (d === 0) return { day: f.day, via: 'witness', confidence: 1 };
  if (scope === 'public' && f.importance >= 3) return { day: f.day + Math.min(f.importance >= 5 ? 10 : 30, 1 + Math.ceil(d / RAVEN)), via: 'raven', confidence: 0.9 };
  if (d > RUMOUR_REACH * (scope === 'public' ? 2 : 1)) return null;
  return { day: f.day + Math.ceil(d / RUMOUR), via: 'rumour', confidence: scope === 'public' ? 0.7 : 0.5 };
}

/** Whether a house knows a fact by `today` (an absolute day; default: the world's date). */
export function knows(state, house, f, today = dayNumber(state.meta.date), E = null) {
  const n = newsOf(state, f, house, E);
  return !!n && n.day <= today;
}

/** A fact a house learned by a way the engine cannot work out (a spy, a letter, a confession). */
export function learn(state, house, f, { day = dayNumber(state.meta.date), via = 'spy', confidence = 1 } = {}) {
  if (!LEARNED.has(via)) throw new Error(`a fact is not learned by ${via}`); // a programming error, caught by the tests
  knowledgeOf(state, house).facts[f.id] = { day: Math.max(day, f.day), via, confidence, happened: f.day, scope: f.vis?.scope || 'public' };
}

// ── News in the chronicle ─────────────────────────────────────────────────────────────────────────────────────────────

const idsOf = (c) => (c.facts?.length ? c.facts : c.fact ? [c.fact] : []);
const heardOf = (n, happened) => ({ via: n.via, happened: dateStr(dateOfDay(happened)) });

/**
 * The turn's cards as a house learns them (09 §7.1). A card whose news arrives within the turn is told on the day it
 * arrives, with how it came and the day it happened (`heard`); one whose news comes later waits in the house's knowledge
 * (`pending`) for the turn it arrives in (`newsDue`); one the house hears of at once, or whose news the engine cannot
 * work out (a spy's finding, shown because the engine chose to show it), stands as it is.
 */
export function holdNews(state, cards, house = state.meta.player) {
  const clock = state.meta.clock; if (!clock) return cards;
  const E = eyesOf(state, house); const out = [];
  for (const c of cards) {
    const fs = idsOf(c).map((id) => factById(state, id)).filter(Boolean);
    const news = fs.map((f) => newsOf(state, f, house, E));
    if (!fs.length || news.some((n) => !n)) { out.push(c); continue; }
    const n = news.reduce((a, b) => (b.day < a.day ? b : a)); // the first word of it
    const happened = Math.min(...fs.map((f) => f.day));
    if (n.day <= happened) { out.push(c); continue; }
    if (n.day > clock.to) { const k = knowledgeOf(state, house); (k.pending = k.pending || []).push({ card: { ...c }, day: n.day, via: n.via, happened }); continue; }
    out.push({ ...c, day: n.day - clock.from + 1, heard: heardOf(n, happened) });
  }
  return out;
}

/** The news of earlier days that reaches a house in this turn: its waiting cards, each on the day its word arrives. */
export function newsDue(state, house = state.meta.player) {
  const clock = state.meta.clock; const k = state.knowledge?.[house];
  if (!clock || !k?.pending?.length) return [];
  const due = k.pending.filter((p) => p.day <= clock.to);
  k.pending = k.pending.filter((p) => p.day > clock.to);
  return due.map((p) => ({ ...p.card, day: Math.max(1, p.day - clock.from + 1), heard: heardOf(p, p.happened), late: true }));
}

// ── Hosts by report (the old shared/intel.js, for any house) ───────────────────────────────────────────────────────────

function newsChance(a) {
  let c = a.kind === 'fleet' ? 0.5 : a.men >= 5000 ? 0.92 : a.men >= 2000 ? 0.7 : a.men >= 500 ? 0.45 : 0.2;
  if (a.secrecy === 'hidden') c *= 0.12;
  return c;
}
function nearestName(state, pos) {
  let best = null, d = Infinity;
  for (const h of Object.values(state.holdings)) { const x = dist(h.pos, pos); if (x < d) { d = x; best = h; } }
  return best?.name || 'the road';
}

/** After a turn: what a house has seen or heard of other hosts, and its old reports aged. */
export function updateKnowledge(state, house = state.meta.player, r = random) {
  const k = knowledgeOf(state, house);
  const E = eyesOf(state, house); const t = state.meta.turn;
  for (const a of forces(state)) { // hosts are reported; a lone rider is not news
    if (E.friends.has(a.owner)) { delete k.parties[a.id]; continue; }
    if (seesParty(state, house, a, E)) { k.parties[a.id] = { pos: [...a.pos], men: a.men, turn: t, source: 'seen', owner: a.owner, name: a.name, confirmed: true }; continue; }
    // word travels: ravens, merchants, septons — a feint sends the word the wrong way
    const rooks = state.houses[house]?.intel || 0; // rookeries: word comes surer
    if (r() < Math.min(0.98, newsChance(a) * (1 + rooks * 0.25))) {
      const feint = a.feint && state.holdings[a.feint];
      const pos = feint ? [...feint.pos] : [...a.pos];
      const rounded = Math.max(100, Math.round(a.men * (0.75 + r() * 0.5) / 100) * 100); // reports are never exact
      k.parties[a.id] = { pos, men: rounded, turn: t, source: `word from near ${nearestName(state, pos)}`, owner: a.owner, name: a.name };
    }
  }
  // reports of hosts that no longer exist linger until someone sees the empty field, or they are forgotten
  for (const [id, rep] of Object.entries(k.parties)) {
    if (state.parties[id] && !rep.false) continue;
    if (E.out.some(([pos, rad]) => dist(pos, rep.pos) <= rad) || t - rep.turn > 6) delete k.parties[id];
  }
  // what was learned by spies and letters is forgotten after a season; the facts themselves are in the log
  const today = dayNumber(state.meta.date);
  for (const [id, n] of Object.entries(k.facts)) if (today - n.day > 120) delete k.facts[id];
}

/**
 * What a house's map shows of each host: Map(id → { pos, men, known: 'seen'|'reported', age, source, owner }). Hosts not
 * in the map are unknown to it; reports older than a few turns drop off. On the player's view (server/view.js) the
 * server has already put each host where the house believes it is.
 */
export function viewOfArmies(state, house = state.meta.player) {
  const E = eyesOf(state, house); const out = new Map(); const t = state.meta.turn; const k = state.knowledge?.[house] || {};
  for (const a of forces(state)) {
    if (a.known) { out.set(a.id, { pos: a.pos, men: a.men, known: a.known, age: a.age || 0, source: a.source || 'seen', owner: a.owner, ...(a.false ? { false: true } : {}) }); continue; } // the player's view
    if (seesParty(state, house, a, E)) { out.set(a.id, { pos: a.pos, men: a.men, known: 'seen', age: 0, source: 'seen', owner: a.owner }); continue; }
    const rep = k.parties?.[a.id];
    if (rep && t - rep.turn <= 4) out.set(a.id, { pos: rep.pos, men: rep.men, known: 'reported', age: t - rep.turn, source: rep.source, owner: rep.owner || a.owner, false: !!rep.false });
  }
  // false reports of hosts that do not exist at all
  for (const [id, rep] of Object.entries(k.parties || {})) if (!state.parties[id] && rep.false && t - rep.turn <= 4) out.set(id, { pos: rep.pos, men: rep.men, known: 'reported', age: t - rep.turn, source: rep.source, owner: rep.owner, false: true, ghost: rep });
  return out;
}

/**
 * The hosts a house's mind reasons about: those it sees, and those its reports place — where the report places them.
 * A host it has no word of is not among them (minds see only their house's knowledge, 09 §7.2). Minds of houses
 * without stored reports hear of great hosts (≥ 3,000) within 700 miles, as the realm talks of them.
 */
export function hostsKnownTo(state, house) {
  const E = eyesOf(state, house); const k = state.knowledge?.[house]; const out = [];
  for (const a of forces(state)) {
    if (seesParty(state, house, a, E)) { out.push(a); continue; }
    const rep = k?.parties?.[a.id];
    if (rep && state.meta.turn - rep.turn <= 4) { out.push({ ...a, pos: rep.pos, men: rep.men, reported: true }); continue; }
    if (!k?.parties && a.men >= 3000 && a.secrecy !== 'hidden' && a.pos && milesToEyes(E, a.pos) <= 700) out.push({ ...a, reported: true });
  }
  return out;
}

/** A report delivered by the story (a raven, a spy, a merchant — or a lie). Used by the 'report' change op. */
export function addReport(state, { army, pos, men, source, false: lie, owner, name }, house = state.meta.player) {
  const k = knowledgeOf(state, house);
  const id = army || `rumour_${state.meta.turn}_${Object.keys(k.parties).length + 1}`;
  const real = state.parties[id];
  k.parties[id] = { pos: pos || real?.pos || [0, 0], men: Math.round(Number(men) || real?.men || 0), turn: state.meta.turn, source: String(source || 'a raven'), ...(lie ? { false: true } : {}), owner: owner || real?.owner, name: name || real?.name || 'A host' };
  return k.parties[id];
}

/** For the story model: what the other houses believe about the player's hosts (secret marches, feints). */
export function beliefsAboutPlayer(state, placeName) {
  const p = state.meta.player; const out = [];
  for (const a of forces(state)) {
    if (a.owner !== p) continue;
    if (a.secrecy === 'hidden') out.push(`${a.name} (${a.men} men) MARCHES IN SECRET — by night, off the roads: other houses do not know where it is unless it comes within a day's ride of their lands or hosts; they may be surprised by it.`);
    if (a.feint && state.holdings[a.feint]) out.push(`${a.name}: the player has spread word that it marches on ${placeName(state, a.feint)}. Other houses who have not seen it with their own eyes BELIEVE that, and act on it.`);
  }
  return out;
}

/** What every lord knows at the start: where the great hosts and fleets of the realm were last heard of. */
export function seedKnowledge(state, house = state.meta.player) {
  const k = knowledgeOf(state, house);
  for (const a of Object.values(state.parties)) k.parties[a.id] = { pos: [...a.pos], men: a.men, turn: state.meta.turn, source: 'common knowledge', owner: a.owner, name: a.name };
  updateKnowledge(state, house);
}

export const ageText = (age) => (age <= 0 ? 'this moon' : age === 1 ? 'a turn ago' : `${age} turns ago`);
