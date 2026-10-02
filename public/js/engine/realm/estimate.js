// What a house makes of the strength of the others (docs/gdd/19-realm-ledger.md §3.2, §4.2). The truth of another
// house's coffers and muster is never here: a house knows its own exactly, its sworn houses nearly, and every other
// house only by what it has seen, been told or been taught — and it knows that late, roughly, and sometimes not at all.
//
//   observe(state, viewer)    after each week's news: note what the viewer could tell of each other house, blurred by
//                             the way it came, into `state.knowledge[viewer].realm[subject].obs` (≤ 24, newest last)
//   estimateOf(state, viewer, subject)   one house as the viewer may show it: a cell for every figure — `{ v, mark,
//                             via, age, band? }`, or `{ word, via }`, or `{ mark: '—' }` — read from those notes
//
// Marks: '' exact (the viewer's own house), '~' an estimate, '≈' a band (v is its middle), '≥' a lower bound, '—' unknown.
// Ways (`via`): self, sworn, seen, reported, rumour, learned. Ages are in turns.
//
// No dice, ever: every blur is `hash32(save seed, viewer, subject, field, turn)`, a pure function, so the same house
// looks the same however often it is asked, after a reload or a replay — and the truth cannot be had by asking twice.
import { knowledgeOf, friendsOf, eyesOf, seesParty, knows } from '../knowledge.js';
import { forces } from '../parties.js';
import { dayNumber } from '../time.js';
import { hash32 } from '../rng.js';
import { standing } from '../../shared/standing.js';
import { holdingRevenue } from '../economy/ledger.js';
import { ECONOMY } from '../../../data/balance.js';
import { FIELDS, figuresOf, figuresIndex } from './figures.js';

const KEEP = 24;

// ── the blur ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const seedOf = (state) => state.meta.seed ?? hash32(state.meta.created ?? 'wc', state.meta.player);
const unit = (state, ...parts) => hash32(seedOf(state), ...parts) / 4294967296;
/** ±pct of blur, always the same for the same (save, viewer, subject, field, turn). */
export const noise = (state, viewer, subject, field, turn, pct) => (unit(state, viewer, subject, field, turn) * 2 - 1) * pct;
/** `x` to `n` significant figures, and never finer than a whole number. */
export const sig = (x, n) => {
  if (!x || !Number.isFinite(x)) return 0;
  const p = Math.max(1, 10 ** (Math.floor(Math.log10(Math.abs(x))) - n + 1));
  return Math.round(x / p) * p;
};
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

/** A sworn house is known "to a few in a hundred" (±5 %, so the blur is kept inside ±4.5 %), to three figures. */
const SWORN_BLUR = 0.045;
/** How far off the people of a house may be read, by the way the word came. */
const PEOPLE_BLUR = { seen: 0.04, reported: 0.06, rumour: 0.08 };
/** The reach of a band round a figure, by the way it was learned: the wider, the less the viewer can tell. */
const POWER_BAND = { seen: [0.8, 1.6], reported: [0.8, 1.6], learned: [0.85, 1.35], rumour: [0.8, 1.4] }; // as factors: a house's hidden coin and men at home mostly lie above what is seen
const INCOME_BAND = 0.3, ALLY_GOLD_BAND = 0.25, ALLY_OFFSET = 0.15; // the offset keeps the truth inside the band (0.87–1.18 of its middle)

/** How often the viewer hears of a house in a turn, by its rank: the great almost always, a far minor house seldom (knowledge.js newsChance). */
const NEWS = { crown: 0.97, paramount: 0.9, major: 0.6, city_state: 0.55, order: 0.5, company: 0.4, tribe: 0.4, exile: 0.3, minor: 0.25 };
/** What everyone knows of a house from its rank alone (§4.2 `rumour`): the share of its people its lands usually raise. */
const MUSTER_SHARE = { crown: 0.036, paramount: 0.066, major: 0.026, minor: 0.007, city_state: 0.04, tribe: 0.45, order: 0.01, company: 0.01, exile: 0 };
/**
 * How far a muster may differ from its rank's usual share: some houses call a great many, some very few (a band, never a number). The levies are
 * those *raised now*, and a house that has called none has none: the band starts at nothing (the soak of WP R7 measured the truth below 0.4 of the usual
 * share for one house in ten, and always for the Watch and the Golden Company, who raise none). The swords are the levies, the men-at-arms and the hosts:
 * never below a third of the share, and a lesser house may raise up to three times it.
 */
const LEVY_REACH = [0, 2.4], SWORD_REACH = [0.4, 3];/** The coin a house is reputed to hold by its rank (the Crown's debts are the realm's gossip): all a house knows of another's coffers until a spy has counted them. */
const WEALTH = { crown: 0, paramount: 150000, city_state: 300000, major: 30000, minor: 6000, order: 2000, company: 10000, tribe: 0, exile: 0 };
/** Living kin a house is reputed to have, by rank: a great house's household is large, a minor lord's small. */
const KIN = { crown: 9, paramount: 6, major: 2, minor: 1, city_state: 1, company: 2, tribe: 3, exile: 6, order: 8 };
/** A rank's reputation for wealth as a word, for a house whose coffers no one has counted. */
const wealthWord = (rank) => { const w = WEALTH[rank]; return w == null ? 'unknown' : w >= 100000 ? 'sound' : w >= 15000 ? 'modest' : 'pressed'; };

// ── what a pass over the realm needs, made once ──────────────────────────────────────────────────────────────────────
/** Holdings by owner, vassals by liege, the viewer's friends, and the truth figures of the houses the viewer may read live (each once). */
export function realmContext(state, viewer = state.meta.player) {
  const vassals = new Map(); const figs = new Map(); const ix = figuresIndex(state); const held = ix.holds; // (the index: each house's figures are then worked from lists made once, not from a scan of the world apiece)
  for (const h of Object.values(state.houses)) if (h.liege) { const l = vassals.get(h.liege); if (l) l.push(h.id); else vassals.set(h.liege, [h.id]); }
  return { viewer, held, vassals, friends: friendsOf(state, viewer), figuresOf: (id) => { if (!figs.has(id)) figs.set(id, figuresOf(state, id, ix)); return figs.get(id); } };
}

/** Whether the viewer may list a house at all: its own, its sworn, the houses of standing that all the realm has heard of, and any it has had word of. */
export function knownTo(state, viewer, id, ctx = null) {
  const h = state.houses?.[id]; if (!h || h.status === 'extinct') return false;
  if (id === viewer || (ctx ? ctx.friends : friendsOf(state, viewer)).has(id)) return true;
  return h.rank !== 'minor' || !!state.knowledge?.[viewer]?.realm?.[id]?.obs?.length;
}

// ── the public face of a house: what its rank and the map give, blurred by the way it was learned ───────────────────────
/**
 * The figures the viewer would make of a house from public things — its holdings on the map and their people, its
 * rank, what hosts have been seen — and `standing()`'s own formula run on those (so the Power the viewer ranks by is the
 * Power the viewer could work out). Only what the viewer *knows* goes in: coffers are the rank's reputation unless a spy
 * has counted them, and the mines are their public base, never the Rock's decline.
 */
export function faceOf(state, viewer, subject, ctx, { turn, via, men = null, gold = null, people = null }) {
  const h = state.houses[subject]; const holds = ctx.held.get(subject) || [];
  const truePeople = holds.reduce((n, x) => n + (x.population || 0), 0);
  // the people as the viewer reckons them (a census taught by a spy stands as it is told), and what such lands could raise
  // (a census taught by a spy stands, but not past the lands it counted: a house that has lost its holdings has no more people than the lands left it hold, and the figure was read as 150,000 "seen" of House Brax
  // with no land at all, N-007)
  const souls = people != null ? Math.min(people, truePeople * 1.1) : truePeople * (1 + noise(state, viewer, subject, 'people', turn, PEOPLE_BLUR[via] ?? PEOPLE_BLUR.rumour));
  const raise = souls * (MUSTER_SHARE[h.rank] ?? 0.01);
  const swords = Math.max(men ?? 0, raise);
  const coin = gold ?? WEALTH[h.rank] ?? 5000;
  // standing() on a world of one house as the viewer sees it: the acres, the swords, the coin, its vassals, its kin
  const houses = { [subject]: { rank: h.rank, figures: { levies: { v: swords }, menAtArms: { v: 0 }, treasury: { v: coin }, debt: { v: 0 } } } };
  for (const v of ctx.vassals.get(subject) || []) houses[v] = { liege: subject, status: state.houses[v].status };
  const kin = Array.from({ length: KIN[h.rank] ?? 3 }, () => ({ alive: true, house: subject, roles: [] }));
  const power = standing({ houses, holdings: { land: { owner: subject, population: souls } }, parties: {}, characters: Object.fromEntries(kin.map((c, i) => [i, c])) }, subject).score;
  // rents and trade of the lands as the maesters reckon them at a fair harvest, the mines at their public base, and the
  // share of their sworn houses' rents that a house of its rank takes — the fields' state, the taxes and the Rock's decline are not known
  const revenue = (x) => { const r = holdingRevenue(state, { ...x, prosperity: 50, unrest: 10, status: '', devastation: 0, blockade: false }).lines; return r.rents + r.trade + (ECONOMY.mines?.[x.id] || 0); };
  let income = holds.reduce((n, x) => n + revenue(x), 0);
  const cut = ECONOMY.tribute?.[h.rank] ?? 0.2;
  for (const v of ctx.vassals.get(subject) || []) for (const x of ctx.held.get(v) || []) income += cut * revenue(x);
  income *= 1 + noise(state, viewer, subject, 'income', turn, 0.08);
  return { holdings: holds.length, people: sig(souls, 2), income: sig(income, 2), power };
}

// ── observe: what the viewer takes away from the week ────────────────────────────────────────────────────────────────
/** Put an observation among a house's, replacing the same way's word of the same turn, oldest first, at most KEEP. */
function note(R, subject, o) {
  const e = R[subject] = R[subject] || { obs: [] };
  const i = e.obs.findIndex((x) => x.turn === o.turn && x.via === o.via);
  if (i >= 0) e.obs.splice(i, 1);
  e.obs.push(o);
  if (e.obs.length > KEEP) e.obs.splice(0, e.obs.length - KEEP);
}
const newest = (obs, field) => { for (let i = obs.length - 1; i >= 0; i--) if (obs[i].v[field] != null) return obs[i]; return null; };

/**
 * After the week's news: what `viewer` has made of each house that is not its own or sworn (those are read live). For
 * each: whether word of it came this turn (a roll of the hash weighted by rank, not of the dice), what hosts of it were
 * seen or reported, and any figure a spy or a letter taught — into that house's notes, once. A house it has no way of
 * hearing of leaves no note (a missing note is "unknown", never zero).
 */
export function observe(state, viewer = state.meta.player) {
  const k = knowledgeOf(state, viewer); const R = (k.realm = k.realm || {});
  const t = state.meta.turn, today = dayNumber(state.meta.date);
  const E = eyesOf(state, viewer); const friends = E.friends; const ctx = realmContext(state, viewer);
  // hosts of the others: what the eyes see now, and what the reports still say (word of a host is kept four turns)
  const hosts = new Map(); const eyed = new Set();
  const at = (owner) => { let o = hosts.get(owner); if (!o) hosts.set(owner, o = { seen: 0, ships: 0, said: 0 }); return o; };
  for (const a of forces(state)) {
    if (friends.has(a.owner) || (a.serving && friends.has(a.serving)) || !(a.men > 0)) continue;
    if (seesParty(state, viewer, a, E)) { const o = at(a.owner); o.seen += a.men; if (a.kind === 'fleet') o.ships += a.ships || 0; eyed.add(a.id); }
  }
  // what was heard: the hosts word came of in one week are as many hosts (two at once are two), but word of a host in another week may be of the same
  // host moved, merged or renamed, so the weeks are not added to one another — the week's fullest picture stands. "At least" may fall short of the
  // truth, never double it.
  const weeks = new Map();
  for (const [id, rep] of Object.entries(k.parties)) {
    if (eyed.has(id) || !rep.owner || friends.has(rep.owner) || t - rep.turn > 4) continue;
    let w = weeks.get(rep.owner); if (!w) weeks.set(rep.owner, w = new Map());
    w.set(rep.turn, (w.get(rep.turn) || 0) + (rep.men || 0));
  }
  // (and the turn of the picture that stands: word of a host a few moons old is noted with its own age, not as this week's. It was noted afresh every week for four, and a host that had
  // since joined its liege's gave "at least 2,600" of a house left with 1,400, as news a moon old, bug hunt N-015)
  for (const [owner, w] of weeks) { const best = Math.max(...w.values()); at(owner).said += best; at(owner).saidTurn = [...w].find(([, men]) => men === best)[0]; }
  // what was taught: a fact carrying `figure = { house, field, value }`, noted once
  const taught = new Map();
  for (const n of Object.values(k.facts)) {
    const g = n.figure;
    if (!g || n.noted != null || !state.houses[g.house] || friends.has(g.house) || !FIELDS.includes(g.field) || !Number.isFinite(g.value)) continue;
    n.noted = t;
    const l = taught.get(g.house) || {}; l[g.field] = sig(g.value, 3); taught.set(g.house, l);
  }
  for (const id of Object.keys(state.houses).sort()) {
    const h = state.houses[id];
    if (friends.has(id) || h.status === 'extinct') continue;
    const o = hosts.get(id); const lesson = taught.get(id);
    const heard = unit(state, viewer, id, 'news', t) < (NEWS[h.rank] ?? 0.25);
    if (!heard && !o && !lesson) continue;
    const before = R[id]?.obs || [];
    // what a spy once counted still stands in the estimate of the house's strength
    const taughtBefore = (f) => { const n = newest(before, f); return n?.via === 'learned' ? n.v[f] : null; };
    if (heard || o) {
      const via = o?.seen ? 'seen' : o?.said ? 'reported' : 'rumour';
      const men = o ? Math.round(o.seen * (1 + noise(state, viewer, id, 'swords', t, 0.1)) + o.said) : 0;
      const v = {};
      if (men > 0) v.swords = sig(men, 2);
      if (o?.ships > 0) v.ships = Math.max(1, Math.round(o.ships * (1 + noise(state, viewer, id, 'ships', t, 0.1))));
      const face = faceOf(state, viewer, id, ctx, { turn: t, via, men: men || null, gold: lesson?.gold ?? taughtBefore('gold'), people: lesson?.people ?? taughtBefore('people') });
      const news = o?.seen || o?.saidTurn == null ? t : Math.min(t, o.saidTurn); // a sighting is this week's; word alone is as old as the word
      note(R, id, { day: today, turn: t, ...(news < t ? { news } : {}), via, v: { holdings: face.holdings, people: face.people, income: face.income, power: face.power, ...v } });
    }
    if (lesson) note(R, id, { day: today, turn: t, via: 'learned', v: { ...lesson } });
  }
  k.wars = learnWars(state, viewer, k.wars);
}

// ── wars, as the house has heard of them ─────────────────────────────────────────────────────────────────────────────────
const WAR_FACTS = new Set(['war_declared', 'war_joined', 'peace_made']);
/**
 * What `viewer` knows of the realm's wars: `{ [warId]: { name, A, D, turn, day, fs, over? } }`, from the wars as they stood
 * when it first looked (what every lord knows at the start) and every war fact it has heard since — a declaration, a house
 * joining, a peace. A war is never read from the live list after that, so a house that joined in secret, a peace made in
 * secret or a war renamed does not show until word of it comes. Pure: `notes` is returned as a changed copy, and `observe`
 * keeps it. A fact's own words (`data.name`, `data.attackers`, `data.defenders`, `data.side`) are preferred to the war's
 * state now; the war is looked at only to fill what the fact does not say, at the moment the fact is first heard.
 */
export function learnWars(state, viewer, notes) {
  const t = state.meta.turn, today = dayNumber(state.meta.date);
  const out = notes ? structuredClone(notes) : {};
  if (!notes) for (const w of state.wars || []) if (w.status !== 'ended') out[w.id] = { name: w.name, A: [...w.attackers], D: [...w.defenders], turn: t, day: today, fs: [] };
  let E = null;
  for (const f of state.facts || []) {
    const id = f.data?.war;
    if (!WAR_FACTS.has(f.kind) || !id || out[id]?.fs.includes(f.id)) continue;
    if (!knows(state, viewer, f, today, (E ||= eyesOf(state, viewer)))) continue;
    const live = (state.wars || []).find((w) => w.id === id);
    const n = out[id] ||= { name: f.data.name ?? live?.name ?? 'a war', A: [], D: [], turn: t, day: today, fs: [] };
    if (f.kind === 'peace_made') n.over = { turn: t, day: today };
    else {
      const joined = f.kind === 'war_declared' ? f.houses : f.data.side !== undefined ? f.houses.slice(0, 1) : f.data.houses || f.houses;
      for (const h of joined) {
        const side = f.data.attackers?.includes(h) ? 'A' : f.data.defenders?.includes(h) ? 'D' : f.data.side !== undefined ? (f.data.side === 'defender' ? 'D' : 'A') : live?.attackers.includes(h) ? 'A' : live?.defenders.includes(h) ? 'D' : null;
        if (side && !n[side].includes(h)) n[side].push(h);
      }
    }
    n.fs = [...n.fs, f.id].slice(-12);
  }
  for (const [id, n] of Object.entries(out)) if (n.over && t - n.over.turn > 6) delete out[id]; // a peace is remembered a few turns, then the war is history
  return out;
}

// ── estimateOf: one house as the viewer may show it ──────────────────────────────────────────────────────────────────
const exact = (v) => ({ v, mark: '', via: 'self', age: 0 });
/**
 * A sworn house's figure as its liege reads it, for a cell and for every point of a series alike: one steady misjudgement
 * per house and figure (±4.5 %, to three figures) — so its trend is true, its exact level is not, and asking again next
 * turn cannot average the blur away. An ally's coin is only a band whose middle is put off the truth by a like steady
 * amount, so the band does not give the treasury away by where its centre lies.
 */
export function readSworn(state, viewer, subject, field, v, ally = false) {
  if (v === 0) return 0;
  if (ally && field === 'gold') return sig(v * (1 + noise(state, viewer, subject, 'gold-centre', 'steady', ALLY_OFFSET)), 3);
  const x = sig(v * (1 + noise(state, viewer, subject, field, 'steady', SWORN_BLUR)), 3);
  return field === 'power' ? clamp(x, 0, 100) : x;
}
/** A figure as a band: `reach` is a share either side, or [low factor, high factor]; `v` is the middle the viewer ranks by. */
const band = (v, reach, via, age, max = Infinity) => {
  const [lo, hi] = Array.isArray(reach) ? reach : [1 - reach, 1 + reach];
  return { v, mark: '≈', via, age, band: [Math.max(0, Math.round(v * lo)), Math.min(max, Math.round(v * hi))] };
};

/**
 * `{ house, kind: 'self' | 'sworn' | 'other', cells: { [field]: cell } }` — a cell for every figure (FIELDS). The viewer's
 * own house is exact and live; a sworn house is read live to three figures (an ally's coin only as a band); any other
 * house is read from the notes, the newest for each figure, with its way and its age, and from the rank's reputation
 * where nothing was ever noted. Pure: it changes nothing.
 */
export function estimateOf(state, viewer, subject, ctx = realmContext(state, viewer)) {
  const h = state.houses?.[subject]; if (!h) return null;
  const cells = {}; const turn = state.meta.turn;
  if (subject === viewer) {
    const f = ctx.figuresOf(subject);
    for (const k of FIELDS) cells[k] = exact(f[k]);
    return { house: subject, kind: 'self', cells };
  }
  if (ctx.friends.has(subject)) {
    const f = ctx.figuresOf(subject); const ally = h.liege !== viewer;
    for (const k of FIELDS) {
      cells[k] = k === 'holdings' ? { v: f[k], mark: '~', via: 'sworn', age: 0 }
        : k === 'gold' && ally ? band(readSworn(state, viewer, subject, k, f[k], true), ALLY_GOLD_BAND, 'sworn', 0)
        : { v: readSworn(state, viewer, subject, k, f[k]), mark: '~', via: 'sworn', age: 0 };
    }
    return { house: subject, kind: 'sworn', ally, cells };
  }
  const obs = state.knowledge?.[viewer]?.realm?.[subject]?.obs || [];
  let prior = null; const rumour = () => (prior ||= faceOf(state, viewer, subject, ctx, { turn: 0, via: 'rumour' }));
  const ageOf = (o) => Math.max(0, turn - (o.news ?? o.turn));
  const gone = { mark: '—' };
  for (const k of FIELDS) {
    const o = newest(obs, k);
    if (o?.via === 'learned') { cells[k] = { v: o.v[k], mark: '~', via: 'learned', age: ageOf(o) }; continue; }
    switch (k) {
      case 'swords': case 'ships': cells[k] = o ? { v: o.v[k], mark: '≥', via: o.via, age: ageOf(o) } : gone; break; // hosts and fleets seen or reported: at least so many
      case 'holdings': case 'people': cells[k] = o ? { v: o.v[k], mark: '~', via: o.via, age: ageOf(o) } : { v: rumour()[k], mark: '~', via: 'rumour' }; break;
      case 'income': cells[k] = o ? band(o.v[k], INCOME_BAND, o.via, ageOf(o)) : band(rumour().income, INCOME_BAND, 'rumour', undefined); break;
      case 'power': cells[k] = o ? band(o.v[k], POWER_BAND[o.via] ?? POWER_BAND.rumour, o.via, ageOf(o), 100) : band(rumour().power, POWER_BAND.rumour, 'rumour', undefined, 100); break;
      case 'gold': cells[k] = { word: wealthWord(h.rank), via: 'rumour' }; break;
      default: cells[k] = gone;
    }
  }
  // swords with no host ever heard of: what its lands could raise, as a band; levies always so (the muster is never told)
  const people = cells.people.v; const share = MUSTER_SHARE[h.rank] ?? 0.01;
  if (people > 0 && share > 0 && cells.levies.mark === '—') cells.levies = band(Math.round(people * share), LEVY_REACH, 'rumour', cells.people.age);
  if (people > 0 && share > 0 && cells.swords.mark === '—') cells.swords = band(Math.round(people * share), SWORD_REACH, 'rumour', cells.people.age);
  for (const c of Object.values(cells)) if (c.age === undefined) delete c.age;
  return { house: subject, kind: 'other', cells };
}
