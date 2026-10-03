// Matters of the realm: small petitions and disputes that come before a ruling lord.
// Used when the simulator itself raised nothing for the player this turn.
import { vassalsOf, getRelation, generateKin, applyChanges } from './world.js';
import { isFemale } from './people.js';
import { answerCall, answerRising, answerRebel } from './vassals.js';
import { random, shuffle } from '../engine/rng.js';
import { MATTERS } from '../../data/matters.js';
import { borrow } from '../engine/economy/lenders.js';

const pick = (a) => a[Math.floor(random() * a.length)];
const MATTER_WRITER_AGE = 16; // the age at which a lord is held fit to rule, and so to write (shared/regency.js MAJORITY)

/**
 * What the matters' templates are raised with (data/matters.js): the lord's house, vassals, lands, friends and foes,
 * children, household and captives, and the dice.
 */
export function matterContext(state) {
  const p = state.meta.player; const me = state.houses[p];
  const living = (h) => h?.lord && state.characters[h.lord]?.alive;
  const vas = vassalsOf(state, p).map((v) => state.houses[v]).filter(living);
  const others = Object.values(state.houses).filter((h) => h.id !== p && living(h) && !vas.includes(h) && h.id !== me?.liege);
  const myWars = (state.wars || []).filter((w) => w.status !== 'ended' && [...w.attackers, ...w.defenders].includes(p));
  const foeIds = new Set(myWars.flatMap((w) => (w.attackers.includes(p) ? w.defenders : w.attackers)));
  const lord = state.characters[me?.lord];
  const household = Object.values(state.characters).filter((c) => c.alive && c.house === p);
  return {
    state, p, me, lord, vas, myWars, atWar: myWars.length > 0,
    lordOf: (h) => state.characters[h.lord],
    holdings: Object.values(state.holdings).filter((h) => h.owner === p),
    liege: living(state.houses[me?.liege]) ? state.houses[me.liege] : null,
    friends: others.filter((h) => getRelation(state, p, h.id) > 20 && !foeIds.has(h.id)),
    neutral: others.filter((h) => Math.abs(getRelation(state, p, h.id)) <= 20 && !foeIds.has(h.id)),
    rivals: others.filter((h) => getRelation(state, p, h.id) < -20),
    foes: [...foeIds].map((id) => state.houses[id]).filter(living),
    kids: household.filter((c) => c.age >= 8 && c.age <= 20 && !c.spouse && !c.betrothed && c.id !== me?.lord && !/imprisoned|captive/.test(c.status || '')),
    heir: household.find((c) => (c.roles || []).includes('heir')) || null,
    maester: household.find((c) => (c.roles || []).includes('maester')) || null,
    steward: household.find((c) => (c.roles || []).includes('steward')) || null,
    prisoners: Object.values(state.characters).filter((c) => c.alive && c.house !== p && /imprisoned|captive/.test(c.status || '') && (state.holdings[c.loc]?.owner === p || state.parties[String(c.loc || '').replace(/^party:/, '')]?.owner === p)),
    treasury: Number(me?.figures?.treasury?.v) || 0,
    pick, shuffle, isFemale, r: random,
  };
}

/**
 * A matter from the realm when nothing else came before the lord (10 §6): one of the catalogue's realm, lords' and
 * household templates that the world has a place for, not one raised in the last six turns. Returns the matter (with
 * its template id as `matter`) or null.
 */
export function realmPetition(state) {
  if (!state.houses[state.meta.player]) return null;
  const ctx = matterContext(state);
  const seen = state.plots?.petitioned || {};
  const ids = shuffle(Object.keys(MATTERS).filter((id) => MATTERS[id].raise && state.meta.turn - (seen[id] ?? -99) >= 6));
  for (const id of ids) {
    const m = MATTERS[id].raise(ctx);
    // a boy of six, or a lord in a cell, writes to no one: the matter is not raised in his name ("Robert Arryn (6) writes...")
    const writer = m?.from && state.characters[m.from];
    if (m && !(writer && (!writer.alive || (writer.age ?? 30) < MATTER_WRITER_AGE || /imprisoned|captive|hostage/.test(writer.status || '')))) return { ...m, matter: id };
  }
  return null;
}

// Settle the immediate, mechanical consequences of a petition choice. The simulator narrates the rest.
export function applyPetitionFx(state, fx, date = '') {
  const p = state.meta.player; const me = state.houses[p]; const out = [];
  const fig = (k) => me.figures[k] || (me.figures[k] = { v: 0 });
  const setFig = (k, v) => { me.figures[k] = { ...fig(k), v, asOf: date, src: 'Your steward', confidence: 'reported' }; };
  const rel = (a, b, d) => { if (!state.houses[a] || !state.houses[b]) return; const k = [a, b].sort().join('|'); const cur = state.relations[k]?.v ?? 0; state.relations[k] = { ...(state.relations[k] || {}), v: Math.max(-100, Math.min(100, cur + d)) }; out.push(`${state.houses[a].name}–${state.houses[b].name} ${d > 0 ? '+' : ''}${d}`); };
  const hold = (id, k, d) => { const h = state.holdings[id]; if (!h) return; h[k] = Math.max(0, Math.min(100, (h[k] || 0) + d)); out.push(`${h.name} ${k} ${d > 0 ? '+' : ''}${d}`); };
  for (const e of fx || []) {
    if (e.rel) rel(p, e.rel[0], e.rel[1]);
    if (e.rel2) rel(e.rel2[0], e.rel2[1], e.rel2[2]);
    if (e.gold) { setFig('treasury', Math.max(0, Math.round((Number(fig('treasury').v) || 0) + e.gold))); out.push(`treasury ${e.gold > 0 ? '+' : ''}${e.gold}`); }
    if (e.food) { setFig('food', Math.max(0, Math.round(((Number(fig('food').v) || 0) + e.food) * 10) / 10)); out.push(`food ${e.food > 0 ? '+' : ''}${e.food} moons`); }
    if (e.menAtArms) { setFig('menAtArms', Math.max(0, (Number(fig('menAtArms').v) || 0) + e.menAtArms)); out.push(`men-at-arms ${e.menAtArms}`); }
    if (e.nwMen && state.houses.nights_watch) { const f = state.houses.nights_watch.figures.menAtArms; if (f) f.v = (Number(f.v) || 0) + e.nwMen; out.push(`the Watch +${e.nwMen} men`); }
    if (e.unrest) hold(e.unrest[0], 'unrest', e.unrest[1]);
    if (e.prosperity) hold(e.prosperity[0], 'prosperity', e.prosperity[1]);
    if (e.unrestAll) { for (const h of Object.values(state.holdings)) if (h.owner === p) h.unrest = Math.max(0, Math.min(100, (h.unrest || 0) + e.unrestAll)); out.push(`unrest in your lands ${e.unrestAll > 0 ? '+' : ''}${e.unrestAll}`); }
    if (e.loyalty) { const c = state.characters[e.loyalty[0]]; if (c) { c.loyalty = Math.max(0, Math.min(100, (c.loyalty ?? 60) + e.loyalty[1])); out.push(`${c.name} loyalty ${e.loyalty[1] > 0 ? '+' : ''}${e.loyalty[1]}`); } }
    if (e.tribute) { const h = state.houses[e.tribute[0]]; if (h) { h.obligations = { ...(h.obligations || {}), tribute: e.tribute[1], tributeUntil: (state.meta.date.year * 12 + state.meta.date.month) + 12 }; out.push(`House ${h.name} tribute ${e.tribute[1]}`); } }
    if (e.betroth) { const [a, b] = e.betroth.map((x) => state.characters[x]); if (a && b && a.alive && b.alive && !a.betrothed && !b.betrothed) { a.betrothed = b.id; b.betrothed = a.id; out.push(`${a.name} betrothed to ${b.name}`); } }
    if (e.betrothNew) { const [kidId, hid, female, age] = e.betrothNew; const kid = state.characters[kidId]; if (kid?.alive && !kid.betrothed) { const c = generateKin(state, hid, { female, age }); if (c) { kid.betrothed = c.id; c.betrothed = kid.id; out.push(`${kid.name} betrothed to ${c.name}`); } } }
    if (e.unbetroth) { const a = state.characters[e.unbetroth[0]]; const b = state.characters[a?.betrothed]; if (a) { if (b?.betrothed === a.id) delete b.betrothed; delete a.betrothed; out.push(`${a.name}'s betrothal broken`); } }
    if (e.call) out.push(...answerCall(state, e.call));
    if (e.rising) out.push(...answerRising(state, e.rising));
    if (e.rebel) out.push(...answerRebel(state, e.rebel));
    if (e.debt) { me.loans = [...(me.loans || []), { to: e.debt[0], amount: e.debt[1], turn: state.meta.turn }]; }
    // a real loan, in the books the economy keeps (engine/economy/lenders.js): you lend to a house, or you borrow from a bank; interest, a day and a default follow
    if (e.lend && state.houses[e.lend[0]]) { borrow(state, { house: e.lend[0], lender: p, amount: e.lend[1], months: e.lend[2] || 12, cause: { type: 'decision', ref: 'matter' } }); out.push(`${e.lend[1].toLocaleString('en-GB')} dragons lent to House ${state.houses[e.lend[0]].name}`); }
    if (e.borrow) { borrow(state, { house: p, lender: e.borrow[0], amount: e.borrow[1], months: e.borrow[2] || 24, cause: { type: 'decision', ref: 'matter' } }); out.push(`${e.borrow[1].toLocaleString('en-GB')} dragons borrowed`); }
    if (e.ops) out.push(...applyChanges(state, e.ops, { source: 'Your decision' }).applied.map((x) => x.text));
    if (e.plot) { state.plots = state.plots || {}; state.plots.flags = { ...(state.plots.flags || {}), [e.plot[0]]: e.plot[1] }; }
    if (e.prestige) { me.prestige = (me.prestige || 0) + e.prestige; out.push(`prestige ${e.prestige > 0 ? '+' : ''}${e.prestige}`); }
    if (e.threat && state.plots?.threats) { const [k, d] = e.threat; state.plots.threats[k] = Math.max(0, Math.min(100, (state.plots.threats[k] || 0) + d)); }
    if (e.chance) { const [pr, yes, no] = e.chance; out.push(...applyPetitionFx(state, random() < pr ? yes : no, date)); }
  }
  return out;
}
