// What a lord may say of the state of the realm (docs/gdd/19-realm-ledger.md §4.6, §6.4; WP R6): the words for a house's direction, the flags that come with them
// and their reasons, the war as its own side has seen it move, and "what the realm is saying" with "where to focus". Everything is made of what the viewer already sees —
// the displayed cells of a row and its observed series (estimate.js, view.js), the wars it has heard of, the hosts its eyes and reports place — so none of it can hold a truth
// the viewer has no way to know, and each line is a template over engine numbers: no model reads, writes or rounds any of it. Pure: no dice, no clock, no change to the state.
import { warMomentum } from '../politics/war.js';
import { placeName } from '../../shared/world.js';
import { hostsKnownTo } from '../knowledge.js';
import { atWar } from '../../shared/warfare.js';
import { milesBetween } from '../facts/cluster.js';
import { dayNumber } from '../time.js';

const num = (c) => (c && typeof c.v === 'number' && c.mark !== '—' ? c.v : null);
const n0 = (x) => Math.round(x).toLocaleString('en-GB');
const moonsOf = (tenths) => (tenths < 10 ? 'under a moon' : `${String(Math.round(tenths) / 10).replace(/\.0$/, '')} moons`);
const WORD = { growing: 'rising', shrinking: 'falling', steady: 'steady' };
const GOOD = new Set(['swollen', 'winning']), BAD = new Set(['reeling', 'hungry', 'broke', 'losing']);

/**
 * The flags of one row (§4.6), each with its reason in plain words, from the row's displayed cells and its observed series only:
 * `hungry` (under two moons of bread), `broke` (less coin than a moon's outgoings), `reeling` (two holdings lost in the window),
 * `swollen` (the swords up by a quarter: it has called its banners), and `winning`/`losing` for a house on a side of a war the viewer knows the score of.
 */
export function flagsOf({ cells, holdings = [], swords = [], war = null }) {
  const out = [];
  const food = num(cells.food); if (food != null && food < 20) out.push({ id: 'hungry', text: `${moonsOf(food)} of bread` });
  const gold = num(cells.gold), exp = num(cells.expenses);
  if (gold != null && exp != null && exp > 0 && gold < exp) out.push({ id: 'broke', text: 'less coin than a moon\'s outgoings' });
  if (holdings.length >= 2) { const d = holdings.at(-1)[1] - holdings[0][1]; if (d <= -2) out.push({ id: 'reeling', text: `has lost ${-d} holdings` }); }
  if (swords.length >= 2 && swords[0][1] >= 100 && (swords.at(-1)[1] - swords[0][1]) * 4 >= swords[0][1]) out.push({ id: 'swollen', text: 'has called its banners' });
  if (war?.word === 'gaining') out.push({ id: 'winning', text: `is gaining ground in ${war.name}` });
  else if (war?.word === 'slipping') out.push({ id: 'losing', text: `is losing ground in ${war.name}` });
  return out;
}

/** The word for a row's direction (`direction()` of its Power series): rising, falling or steady, or nothing yet; and why, from the flags that agree with it. */
export function wordOf(dir, flags) {
  const word = dir.dir === '—' ? '—' : WORD[dir.dir] || 'steady';
  const pool = word === 'rising' ? GOOD : word === 'falling' ? BAD : null;
  return { word, arrow: dir.arrow, seems: !!dir.seems, why: pool ? flags.filter((f) => pool.has(f.id)).map((f) => f.text) : [] };
}

/** A war as its own side has seen it move over the window (§6.2): only for a war the viewer is party to; never for anyone else's. */
export function warNote(state, live, side, since, name) {
  const m = warMomentum(state.realmStats?.wars?.[live.id] || [], side, since);
  return m ? { ...m, name, side } : null;
}

// ── what the realm is saying (§6.4) ────────────────────────────────────────────────────────────────────────────────────────
const BESIEGED = new Set(['besieged', 'sacked', 'burning', 'occupied']);
const FOCUS = {
  hungry: { verb: 'buy_grain', order: 'Buy grain for the granaries.' },
  broke: { verb: 'set_tax', order: 'Raise the taxes for a season.' },
  debt_due: { verb: 'repay', order: (f) => `Repay what we owe ${f.lender}.` },
  besieged: { verb: 'call_banners', order: (f) => `Call the banners to relieve ${f.place}.` },
  host_near: { verb: 'call_banners', order: (f) => `Call the banners to ${f.place}, a foe host is near.` },
  unrest: { verb: 'hold_feast', order: (f) => `Hold a feast to calm ${f.place}.` },
};

/**
 * The typed facts the viewer has heard, ranked (§6.4): `{ id, kind, about, text, via, age, weight, verb?, order? }`, at most twelve, heaviest first, ties by id.
 * `rows` are the view's rows (their cells and words), `wars` the view's wars, `mine` the estimate of the viewer's own house. `verb` and `order` are what would answer a
 * fact about the viewer's own house — the server keeps only those the viewer may lawfully do (`optionsFor`), and a button only writes the order into the box.
 */
export function factsOf(state, viewer, { rows, wars, ests }) {
  const out = []; const add = (f) => out.push({ via: 'self', age: 0, ...f, id: `rf_${f.kind}_${f.about}` });
  const cellsOf = (id) => ests(id).cells;
  // your own house, and those sworn to it, whose granaries and coffers you can read
  const sworn = Object.keys(state.houses).filter((h) => state.houses[h].liege === viewer).sort();
  for (const id of [viewer, ...sworn]) {
    if (!state.houses[id] || state.houses[id].status === 'extinct') continue;
    const c = cellsOf(id); const self = id === viewer; const name = self ? 'Your' : `House ${state.houses[id].name}'s`;
    const food = num(c.food), gold = num(c.gold), exp = num(c.expenses), inc = num(c.income);
    if (food != null && food < 20) add({ kind: 'hungry', about: id, text: `${name} granaries hold ${moonsOf(food)} of bread.`, weight: 9, ...(self ? FOCUS.hungry : {}) });
    if (gold != null && exp != null && inc != null && inc < exp && gold < 3 * exp) add({ kind: 'broke', about: id, text: `${name} coffers will not carry three moons of outgoings.`, weight: 9, ...(self ? FOCUS.broke : {}) });
  }
  // debts you owe that are called or fall due within two moons
  const day = dayNumber(state.meta.date);
  for (const l of (state.economy?.loans || []).filter((x) => x.debtor === viewer && x.amount > 0 && (x.called || (x.due != null && x.due - day <= 60)))) {
    const lender = state.houses[l.lender]?.name ? `House ${state.houses[l.lender].name}` : 'the lender';
    add({ kind: 'debt_due', about: l.lender, text: l.called ? `${lender} has called its loan of ${n0(l.amount)} dragons.` : `${n0(l.amount)} dragons are owed to ${lender} within two moons.`, weight: 8, ...FOCUS.debt_due, lender });
  }
  // your own and your sworn houses' holdings under siege or in ruin, and the unrest of your own
  for (const h of Object.values(state.holdings)) {
    const mine = h.owner === viewer, theirs = !mine && state.houses[h.owner]?.liege === viewer;
    if (!mine && !theirs) continue;
    if (BESIEGED.has(h.status)) add({ kind: 'besieged', about: h.id, text: `${h.name} is ${h.status === 'occupied' ? 'held by the enemy' : h.status}.`, weight: 9, ...(mine ? { ...FOCUS.besieged, order: FOCUS.besieged.order({ place: h.name }) } : {}) });
    else if (mine && (h.unrest ?? 0) >= 40) add({ kind: 'unrest', about: h.id, text: `The people of ${h.name} are restless.`, weight: 6, ...FOCUS.unrest, order: FOCUS.unrest.order({ place: h.name }) });
  }
  // a foe host you know of, near your lands: what your eyes and your reports place
  const mineHolds = Object.values(state.holdings).filter((h) => h.owner === viewer);
  for (const a of hostsKnownTo(state, viewer)) {
    if (a.owner === viewer || !atWar(state, viewer, a.owner) || !(a.men > 0)) continue;
    let best = null; for (const h of mineHolds) { const d = milesBetween(a.pos, h.pos); if (!best || d < best.d) best = { d, h }; }
    if (best && best.d <= 150) add({ kind: 'host_near', about: a.id, text: `A host of House ${state.houses[a.owner]?.name || 'the enemy'}, about ${n0(a.men)} men${a.reported ? ' (by report)' : ''}, is within ${Math.round(best.d / 10) * 10} miles of ${best.h.name}.`, weight: 8, via: a.reported ? 'reported' : 'seen', ...FOCUS.host_near, order: FOCUS.host_near.order({ place: best.h.name }) });
  }
  // the strongest house, if it is rising and is no friend of yours
  const top = rows.find((r) => r.rank === 1 && r.house !== viewer);
  if (top && top.word?.word === 'rising') add({ kind: 'leader_rising', about: top.house, text: `House ${state.houses[top.house].name}, the strongest of the houses you know, is rising${top.word.seems ? ' (so it seems)' : ''}.`, weight: 5, via: top.cells.power?.via || 'rumour', age: top.cells.power?.age ?? 0 });
  // your wars, when they turn
  for (const w of wars.filter((x) => x.momentum && x.momentum !== 'holding')) add({ kind: 'war_turning', about: w.id, text: `${w.name} ${w.momentum === 'gaining' ? 'goes your way' : 'goes against you'}: ${w.delta > 0 ? '+' : '−'}${Math.abs(w.delta)} over the window.`, weight: 6 });
  // the season ahead
  const season = state.world?.season;
  if (season === 'autumn' || season === 'winter') add({ kind: 'season', about: season, text: state.world?.seasonNote || (season === 'winter' ? 'Winter has come: nothing grows.' : 'The harvest wanes; winter is near.'), weight: 3 });
  return out.sort((a, b) => b.weight - a.weight || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).slice(0, 12);
}
