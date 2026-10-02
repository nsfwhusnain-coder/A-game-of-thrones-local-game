// The realm as one house sees it, for those who must reason from it (docs/gdd/19-realm-ledger.md §8; WP R5): the council's dossier and the lord's mind, an AI lord's behaviour tree and the
// order in which the realm's lords are woken. There is one source: `realmViewFor` (view.js), asked for the *house's own* eyes — the same estimates, the same marks, the same words as the
// window the player reads (the figures are written by words.js, byte for byte) — so an AI lord and the player agree on what "the strongest house" means, a counsellor cannot quote a strength
// the ledger does not show, and no house is told what it has no way to know. Pure: no dice, no clock, no model, no change to the state.
import { realmViewFor } from './view.js';
import { cellText, provenance, warLine, strengthLine } from './words.js';
import { friendsOf } from '../knowledge.js';
import { houseLabel } from '../facts/label.js';
import { ordinal as digits } from '../time.js';

const ORD = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
const ordinal = (n) => ORD[n] || digits(n); // ("21st", "22nd", "23rd", "31st": the one function of the calendar, TX9)
const T = (cell, field) => cellText(cell, field).text;

/**
 * What a lord's behaviour tree reads (§8): `{ rank, tied, power, word, flags, peers, top3, risingLeader, threats }` — the house's rank among the great houses it knows, its own Power and word,
 * the flags on it (`hungry`, `broke`, `reeling`…), the other great houses best first (`{ house, rank, power, dir, seems, swords, via, age, friend }`), and the one strongest house that is rising and is
 * not its friend, if there is one. From `realmViewFor(state, house)` — that house's knowledge, never the player's, never the truth.
 */
export function realmSummary(state, house, view = realmViewFor(state, house, { scope: 'great' })) {
  const friends = friendsOf(state, house); const me = view.rows.find((r) => r.house === house);
  const peers = view.rows.filter((r) => r.house !== house).map((r) => ({
    house: r.house, rank: r.rank, power: typeof r.cells.power?.v === 'number' && r.cells.power.mark !== '—' ? r.cells.power.v : null, dir: r.word.word, seems: r.word.seems,
    swords: typeof r.cells.swords?.v === 'number' && r.cells.swords.mark !== '—' ? r.cells.swords.v : null, via: r.cells.power?.via ?? null, age: r.cells.power?.age ?? null, friend: friends.has(r.house),
  }));
  const leader = view.rows.find((r) => r.rank === 1 && r.house !== house);
  return {
    rank: me?.rank ?? null, tied: !!me?.rankTied, power: me && me.cells.power?.mark !== '—' ? me.cells.power.v : null, word: me?.word.word ?? '—', flags: (me?.flags || []).map((f) => f.id),
    peers, top3: peers.slice(0, 3), risingLeader: leader && !friends.has(leader.house) && leader.word.word === 'rising' ? leader.house : null,
    threats: (view.facts || []).filter((f) => f.kind === 'host_near').map((f) => f.about),
  };
}

/** The flags on a house, as it reads them of itself (`hungry`, `reeling`…): its own row of the ledger alone, which is what the realm's lords are woken by each week — a house's whole view of the realm is not needed for it. */
export function ledgerFlags(state, house) {
  const me = realmViewFor(state, house, { scope: 'self' }).rows.find((r) => r.house === house);
  return (me?.flags || []).map((f) => f.id);
}

/**
 * The block of the dossier that says how the realm stands (§8): at most twelve short lines, about three hundred tokens, each figure written as the ledger writes it.
 * `{ lines, text }`. Your house first, then the strongest, the others, the wars, and what the realm is saying about you.
 */
export function realmBrief(state, house) {
  const v = realmViewFor(state, house, { scope: 'great', house }); const sum = realmSummary(state, house, v);
  const name = (id) => houseLabel(state, id); const c = v.detail?.cells || {};
  const me = v.rows.find((r) => r.house === house);
  const lines = [];
  lines.push(`Your house: ${sum.rank ? `${ordinal(sum.rank)}${sum.tied ? ' (level with others)' : ''} of the ${v.rows.length} houses of standing you know` : 'among the houses you know'}${sum.word !== '—' ? `, ${sum.word}` : ''}. Power ${T(c.power, 'power')}, swords ${T(c.swords, 'swords')}, coin ${T(c.gold, 'gold')}, income ${T(c.income, 'income')} a moon, food ${T(c.food, 'food')}.`);
  if (me?.flags?.length) lines.push(`Troubles: ${me.flags.map((f) => f.text).join('; ')}.`);
  const top = v.rows.find((r) => r.house !== house);
  if (top) lines.push(`The strongest you know: ${name(top.house)}, power ${T(top.cells.power, 'power')}, swords ${T(top.cells.swords, 'swords')}, ${top.word.word === '—' ? 'no word of its course' : `${top.word.seems ? 'seems to be ' : ''}${top.word.word}`} (${provenance(top)}); ${sum.peers.find((p) => p.house === top.house)?.friend ? 'a friend of yours' : 'no friend of yours'}.`);
  const rest = v.rows.filter((r) => r.house !== house && r.house !== top?.house).slice(0, 4);
  if (rest.length) lines.push(`Also great: ${rest.map((r) => `${name(r.house)} (power ${T(r.cells.power, 'power')}${r.word.word !== '—' ? `, ${r.word.word}` : ''})`).join('; ')}.`);
  for (const w of (v.wars || []).slice(0, 2)) { const l = warLine(w, 3); lines.push(`War: ${w.name}: ${w.sides.A.map(name).join(', ') || '—'} against ${w.sides.D.map(name).join(', ') || '—'}; ${strengthLine(w)}${l ? `; ${l.text}` : ''}.`); }
  const facts = (v.facts || []).filter((f) => f.about === house || f.kind === 'host_near' || f.kind === 'besieged').slice(0, 3);
  if (facts.length) lines.push(`Word of the realm: ${facts.map((f) => f.text.replace(/\.$/, '')).join('; ')}.`);
  const out = lines.slice(0, 12);
  return { lines: out, text: out.join('\n') };
}
