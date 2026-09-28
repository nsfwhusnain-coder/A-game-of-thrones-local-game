// Sellswords, outlaws and the Watch (docs/gdd/07-military.md §10; WP C7).
//   • The free companies are hired by contract: a moon paid on signing and each moon after from the employer's coin. A
//     company unpaid marches off; a turncoat company goes over to anyone who offers half as much again. A company in
//     Essos crosses by hired passage (shared/sea.js).
//   • Outlaw bands rise where war and foraging have laid the land waste, make its roads deadly and its people poorer, and
//     scatter when the lord's host comes to clear the country.
//   • The Night's Watch takes no side, and takes recruits: some two dozen a moon from the realm's gaols and villages.
//   • The free folk gather beyond the Wall, a little more every moon.
import { COMPANIES } from '../../../data/companies.js';
import { realmOf } from '../../shared/world.js';
import { atWar } from '../../shared/warfare.js';
import { fact } from '../facts/log.js';
import { planRoute } from '../movement.js';
import { settle, forces } from '../parties.js';
import { dayNumber } from '../time.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const fmt = (n) => Math.round(n).toLocaleString('en-GB');
const gold = (h) => Number(h?.figures?.treasury?.v) || 0;
const mine = (state, ...hs) => hs.includes(state.meta.player);

// ── The free companies ───────────────────────────────────────────────────────────────────────────────────────────────
/** The company's host: the one in the world, or (the first time it is wanted) raised at its home. */
export function companyHost(state, id) {
  const C = COMPANIES[id]; if (!C || !state.houses[id]) return null;
  const p = Object.values(state.parties).find((x) => x.owner === id && x.kind === 'host' && x.men > 0);
  if (p) return p;
  const home = state.holdings[C.home]; if (!home || !C.men) return null;
  const pid = `${id}_host`;
  state.parties[pid] = { id: pid, kind: 'host', owner: id, name: C.name.replace(/^./, (x) => x.toUpperCase()), commander: state.houses[id].lord || null, at: home.id, pos: [...home.pos], men: C.men, members: [], composition: C.composition || 'Sellswords', morale: 70, supply: 80 };
  const cap = state.characters[state.houses[id].lord]; if (cap?.alive) { cap.loc = `party:${pid}`; state.parties[pid].members.push(cap.id); }
  settle(state, state.parties[pid]);
  return state.parties[pid];
}
/** A moon of the company, in dragons. */
export const priceOf = (state, id, p = companyHost(state, id)) => Math.round((p?.men || COMPANIES[id]?.men || 0) * (COMPANIES[id]?.price || 2));

/**
 * Whether `house` may hire this company, and at what: null, or { code, text }. A company under contract goes over only
 * if it is a turncoat company and the offer is half as much again (the Second Sons' rule).
 */
export function hireRefusal(state, house, id, offer) {
  const C = COMPANIES[id]; const p = companyHost(state, id);
  if (!C || !p) return { code: 'no_company', text: 'There is no such company to hire.' };
  if (id === house) return { code: 'self', text: 'A company does not hire itself.' };
  const c = p.contract;
  if (c?.by === house) return { code: 'hired', text: `${C.name} is already in your pay.` };
  const price = priceOf(state, id, p); const want = c ? Math.ceil(c.price * 1.5) : price;
  if (c && !C.turncoat) return { code: 'bound', text: `${C.name} is under contract to House ${state.houses[c.by]?.name}, and keeps its word: ${C.motto || 'a contract is a contract'}.` };
  if ((offer ?? want) < want) return { code: 'price', text: `${C.name} will not march for less than ${fmt(want)} dragons a moon.` };
  if (gold(state.houses[house]) < (offer ?? want)) return { code: 'coin', text: `A moon of ${C.name} costs ${fmt(offer ?? want)} dragons, paid on signing; your coffers hold ${fmt(gold(state.houses[house]))}.` };
  return null;
}

/** Sign the contract: the first moon paid now; the company marches for the employer's seat (or where it is sent). */
export function hire(state, house, id, { offer = null, to = null, cause = { type: 'rule', ref: 'companies' } } = {}) {
  const C = COMPANIES[id]; const p = companyHost(state, id); const today = dayNumber(state.meta.date);
  const from = p.contract?.by; const price = offer ?? (p.contract ? Math.ceil(p.contract.price * 1.5) : priceOf(state, id, p));
  state.houses[house].figures.treasury.v = gold(state.houses[house]) - price;
  p.contract = { by: house, price, since: today, next: today + 30, unpaid: 0 };
  p.serving = house; delete p.exile;
  const dest = to || state.houses[house].seat;
  if (dest && state.holdings[dest] && p.at !== dest) { p.march = { to: dest, since: state.meta.turn }; p.at = null; planRoute(state, p, state.holdings[dest].pos, dest, { toName: state.holdings[dest].name }); }
  settle(state, p);
  const H = state.houses[house];
  const card = from
    ? fact(state, 'sellswords_turned', { title: `${C.name} changes sides`, text: `${C.name} (${fmt(p.men)} swords) breaks its contract with House ${state.houses[from]?.name} and goes over to House ${H.name} for ${fmt(price)} dragons a moon.`, houses: [house, from], day: 1 }, { actors: [p.commander], data: { party: p.id, from, to: house, price }, cause })
    : fact(state, 'sellswords_hired', { title: `${C.name} signs with House ${H.name}`, text: `${C.name} (${fmt(p.men)} swords) takes the coin of House ${H.name}: ${fmt(price)} dragons a moon, the first paid on signing.`, houses: [house], day: 1 }, { actors: [p.commander], data: { party: p.id, by: house, price }, cause });
  return { party: p, price, from, card };
}

/** The contract ended: the company is its own again and goes home. */
export function release(state, p, why, cause = { type: 'rule', ref: 'companies' }) {
  const C = COMPANIES[p.owner]; const by = p.contract?.by; delete p.contract; delete p.serving;
  const home = state.holdings[C?.home];
  if (home && p.at !== home.id) { p.march = { to: home.id, since: state.meta.turn }; p.at = null; planRoute(state, p, home.pos, home.id, { toName: home.name }); }
  settle(state, p);
  return fact(state, 'desertion', { title: why === 'unpaid' ? `${C?.name || p.name} marches off unpaid` : `${C?.name || p.name} is dismissed`, text: why === 'unpaid' ? `No coin came from House ${state.houses[by]?.name} this moon: ${C?.name || p.name} strikes its tents and marches away. Sellswords are paid, or they are gone.` : `House ${state.houses[by]?.name} pays off ${C?.name || p.name}, and the company marches away.`, houses: [by, p.owner].filter(Boolean), day: 1 }, { actors: [p.commander], data: { party: p.id, from: by, why, men: p.men }, cause });
}

// ── Outlaws ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const warIn = (state, h) => (state.wars || []).some((w) => w.status !== 'ended' && [...w.attackers, ...w.defenders].some((x) => x === h.owner || realmOf(state, h.owner) === x));
/** Whether a lord's host stands in the country to clear it: 500 men of the land's own realm within ~25 miles. */
const cleared = (state, h) => forces(state).some((p) => p.men >= 500 && p.kind !== 'fleet' && realmOf(state, p.owner) === realmOf(state, h.owner) && dist(p.pos, h.pos) <= 14);

/**
 * A day of the realm's irregulars: company contracts paid (or broken), outlaw bands rising and scattering (a week at
 * a time), the Watch's recruits and the free folk gathering (a moon at a time). Returns { events, applied }.
 */
export function irregularsTick(state, days, r) {
  const events = []; const applied = []; const today = dayNumber(state.meta.date);
  // the companies' pay
  for (const p of Object.values(state.parties)) {
    const c = p.contract; if (!c || today < c.next) continue;
    const H = state.houses[c.by]; c.next += 30;
    if (!H || gold(H) < c.price) {
      c.unpaid += 1;
      if (c.unpaid >= (COMPANIES[p.owner]?.desertAfter ?? 1)) { const card = release(state, p, 'unpaid'); if (mine(state, c.by)) events.push(card); applied.push({ op: 'companies', text: `${p.name} deserts House ${H?.name} unpaid` }); }
      continue;
    }
    H.figures.treasury.v = gold(H) - c.price; c.unpaid = 0;
  }
  // outlaws, weekly: where war has laid the land waste they rise; where the lord's men come, they scatter
  if (today % 7 === 0) {
    for (const h of Object.values(state.holdings)) {
      if (h.outlaws) {
        if (cleared(state, h) || (!warIn(state, h) && (h.devastation || 0) < 20 && today - h.outlaws.since > 30)) {
          const f = fact(state, 'outlaws_scattered', { title: `Outlaws scattered near ${h.name}`, text: cleared(state, h) ? `The lord's men ride through the country about ${h.name}; the outlaws who held its roads scatter into the woods, and some hang.` : `The outlaws about ${h.name} melt away, back to their villages or on to richer roads.`, where: h.id, houses: [h.owner], day: 1 }, { data: { holding: h.id, men: h.outlaws.men }, cause: { type: 'rule', ref: 'outlaws' } });
          if (mine(state, h.owner)) events.push(f); delete h.outlaws; continue;
        }
        h.unrest = clamp((h.unrest ?? 20) + 2, 0, 100); h.prosperity = clamp((h.prosperity ?? 50) - 1, 0, 100);
        continue;
      }
      if ((h.devastation || 0) >= 40 && warIn(state, h) && !cleared(state, h) && r() < 0.15) {
        const men = Math.round(40 + r() * 200);
        h.outlaws = { men, since: today };
        const f = fact(state, 'outlaws_rise', { title: `Outlaws on the roads near ${h.name}`, text: `Broken men — deserters, burned-out smallfolk, masterless swords — hold the roads about ${h.name}: some ${fmt(men)} of them. No rider is safe there.`, where: h.id, houses: [h.owner], day: 1 }, { data: { holding: h.id, men }, cause: { type: 'rule', ref: 'outlaws' } });
        if (mine(state, h.owner)) events.push(f);
        applied.push({ op: 'outlaws', text: `outlaws rise near ${h.name}` });
      }
    }
  }
  // the Watch and the free folk, a moon at a time (on the realm's thirtieth days)
  if (today % 30 === 0) {
    const nw = Object.values(state.parties).find((p) => p.owner === 'nights_watch' && p.kind === 'garrison');
    if (nw) { const n = 20 + Math.floor(r() * 11); nw.men += n; applied.push({ op: 'watch', text: `${n} recruits reach the Wall` }); }
    const ff = Object.values(state.parties).find((p) => p.owner === 'free_folk' && p.kind === 'host');
    if (ff && ff.men < 90000) ff.men = Math.min(90000, Math.round(ff.men * 1.01));
  }
  return { events, applied };
}
