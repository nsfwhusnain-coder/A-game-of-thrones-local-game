// The muster (docs/gdd/07-military.md §3): a liege calls his banners and each sworn lord's answer is a small machine
// that runs a day at a time — the raven flies to him, he weighs it (by his temper, the season, whether his own lands are
// threatened), he answers, delays or refuses; an answer is his levies gathering at his seat for as many days as his
// country needs (the North is wide), then his host sets out for the liege's host wherever it has gone (the rendezvous:
// shared/vassals.js gatherMusters), and joins it. Every step is dated, so the host card can say who is present, who is
// on the road and when they will come, who is still expected, and who refused — and those days are the engine's own.
//
//   obligations.levies: 'called' | 'delayed' | 'answered' | 'refused'     (what the realm sees, as before)
//   obligations.stage:  'letter' | 'deliberating' | 'gathering' | 'departed' | 'joined' | 'delayed' | 'refused'
//   obligations.call:   { host, muster, scope, sent, arrive, decide, depart, retry, men, gather, predicted, eta, late }
import { applyChanges, placePos, placeName, getRelation } from '../../shared/world.js';
import { ref, isRef, idOf, joinParty, settle, partyAt, forces, placeOf } from '../parties.js';
import { marchDays, atWar, MILES_PER_UNIT } from '../../shared/warfare.js';
import { vassalTemper } from '../../shared/vassals.js';
import { pronouns, isFemale } from '../../shared/people.js';
import { needsShips } from '../../shared/sea.js';
import { rideOf } from '../../shared/world.js';
import { random } from '../rng.js';
import { fact, shown } from '../facts/log.js';
import { tidyHouseNames } from '../facts/tidy.js';
import { dayNumber } from '../time.js';
import { MUSTER } from '../../../data/balance.js';

const round50 = (n) => Math.round(n / 50) * 50;
// who hears a lord's answer to the call, exact men and all: the lord's house and his liege (if he has one), once each
const answerHouses = (v) => [...new Set([v.id, v.liege].filter(Boolean))];
const RAVEN_MILES = 300; // a day's flight (engine/actions/diplomacy.js)

/** The days a sworn lord's levies take to gather at his seat, by his country (07 §3.2; data/balance.js MUSTER). */
export const GATHER = MUSTER.gatherDays;
export function gatherDays(state, v, scope = 'quick') {
  const region = state.holdings[v.seat]?.region || v.region;
  const season = state.world?.season || 'summer';
  return Math.round((GATHER[region] ?? 8) * (scope === 'full' ? 1.8 : 1) * (season === 'autumn' ? 1.4 : 1) * (season === 'winter' ? 1.6 : 1));
}
const bandOf = (t) => (t >= MUSTER.bands.devoted ? 'devoted' : t >= MUSTER.bands.dutiful ? 'dutiful' : t >= MUSTER.bands.wavering ? 'wavering' : 'resentful');

/** How a lord of this temper answers: the chances of answering, delaying and refusing (07 §3.2), after the modifiers. */
export function answerOdds(state, v, { scope = 'quick', late = false } = {}) {
  const t = vassalTemper(state, v.id) ?? 50;
  let [a, d, r] = MUSTER.answer[bandOf(t)];
  const shift = (n) => { const x = Math.min(a, n); a -= x; d += x; };
  if (scope === 'full') shift(10);
  if (state.world?.season === 'autumn') shift(10); // the harvest is not yet in
  if (threatened(state, v)) shift(20);
  // a second asking: those who hedged once hedge less; a second delay is a refusal in all but name
  if (late) { r += Math.round(d / 2); d = Math.round(d / 2); }
  return { answered: a, delayed: d, refused: r, temper: t };
}
/**
 * Why a lord will not march, in the plain words of what already weighed on his temper (shared/vassals.js vassalTemper):
 * bad blood, no loyalty, the tax, hungry lands, a second asking, or simply no heart for it. Null when it was only the
 * roll of the dice (a dutiful lord refuses one time in fifty and has no reason): the fact then says nothing rather than guess.
 */
export function whyRefused(state, v, call) {
  const lord = state.characters[v.lord]; const tax = state.houses[v.liege]?.policy?.tax;
  if (getRelation(state, v.id, v.liege) <= -30) return 'bad blood between the houses';
  if ((lord?.loyalty ?? 60) < 30) return 'little loyalty to the liege';
  if (tax === 'crushing' || tax === 'heavy') return "the liege's heavy taxes";
  const food = v.figures?.food?.v; // an empty granary (0) is hunger; only a granary nobody has counted is not
  if ((food == null ? 99 : Number(food)) < 2) return 'hungry lands at home';
  if (call?.late) return 'already put the call off once';
  if ((vassalTemper(state, v.id) ?? 50) < MUSTER.bands.dutiful) return 'no heart for the war';
  return null;
}
/** Men a lord sends: of his levies by the call's scope and his zeal, and of his men-at-arms; a late answer, fewer. */
export function menSent(state, v, { scope = 'quick', late = false } = {}) {
  const t = vassalTemper(state, v.id) ?? 50;
  const zeal = MUSTER.zeal[bandOf(t)];
  const lev = Number(v.figures?.levies?.v) || 0; const maa = Number(v.figures?.menAtArms?.v) || 0;
  const k0 = MUSTER[scope === 'full' ? 'full' : 'quick'];
  const levies = Math.min(lev, Math.round(lev * k0.levies * zeal)); const arms = Math.round(maa * k0.menAtArms);
  const k = late ? 0.85 : 1;
  return { levies: Math.round(levies * k), arms: Math.round(arms * k), men: round50((levies + arms) * k) };
}
// his own lands threatened: a host of his liege's enemies within a few days' march of his seat
function threatened(state, v) {
  const seat = placePos(v.seat, state.holdings); if (!seat) return false;
  return forces(state).some((a) => a.men >= 500 && atWar(state, a.owner, v.id) && Math.hypot(a.pos[0] - seat[0], a.pos[1] - seat[1]) * MILES_PER_UNIT < 120);
}
const ravenDays = (state, from, to) => { const a = placePos(from, state.holdings), b = placePos(to, state.holdings); return Math.max(1, Math.round((a && b ? Math.hypot(a[0] - b[0], a[1] - b[1]) * MILES_PER_UNIT : 600) / RAVEN_MILES)); };
// where the host he is to join stands (or the muster, while there is no host)
const targetOf = (state, call) => { const h = call.host && state.parties[call.host]; return h ? { pos: h.pos, to: ref(h.id), name: h.name } : { pos: placePos(call.muster, state.holdings), to: call.muster, name: placeName(state, call.muster) }; };
const marchFrom = (state, v, call, pos) => { const t = targetOf(state, call); if (!pos || !t.pos) return 0; return needsShips(pos, t.pos) ? 0 : marchDays({ kind: 'host', men: call.men || 1000, owner: v.id }, pos, t.pos, state).days; };

/**
 * Summon one sworn lord: the raven flies today; his call records when it lands, and when he is predicted to join
 * (arrival, two days' thought, the gathering, the march). `host` the party he is to join (if one stands), `muster` the
 * place. Returns the call.
 */
export function summon(state, v, { host = null, muster, scope = 'quick', today = dayNumber(state.meta.date) } = {}) {
  const liege = state.houses[v.liege];
  const arrive = today + ravenDays(state, liege.seat, v.seat);
  const est = menSent(state, v, { scope });
  const call = { host, muster, scope, sent: today, arrive, men: est.men, gather: gatherDays(state, v, scope) };
  call.predicted = arrive + 2 + call.gather + marchFrom(state, v, call, placePos(v.seat, state.holdings));
  const tp = targetOf(state, call).pos; const sp = placePos(v.seat, state.holdings); call.bySea = !!(tp && sp && needsShips(sp, tp));
  v.obligations = { ...(v.obligations || {}), levies: 'called', stage: 'letter', muster, join: host, call };
  delete v.obligations.calledDays;
  return call;
}

/** A save from before the machine: a lord called the old way weighs the call today. */
function adopt(state, v, today) {
  const ob = v.obligations; if (ob.call || !['called', 'delayed'].includes(ob.levies)) return;
  const muster = ob.muster || state.houses[v.liege]?.seat;
  summon(state, v, { host: ob.join && state.parties[ob.join] ? ob.join : null, muster, today: today - 1 });
  v.obligations.call.arrive = today; v.obligations.stage = 'deliberating'; v.obligations.call.decide = today;
}

/**
 * Who leads a house's host: its regent while the lord is a captive or a child (the regent rules in his name), else the lord; but a man of the books
 * or of prayer (a maester, a septon) does not lead an army, whatever he rules: then the lord if he is grown and free, else the best fighter of the house
 * who is free and grown (its commander, its knights, captain, master-at-arms), else no one — the host goes under its banner (ST6: Maester Luwin led
 * the Stark host and was named the man who took Asha Greyjoy prisoner).
 */
const held = (c) => /imprisoned|captive|hostage/.test(c?.status || '');
const FIGHTERS = { commander: 4, kingsguard: 3, knight: 3, captain: 3, master_at_arms: 3 };
const mayLead = (c) => c?.alive && !held(c) && (c.age ?? 30) >= 16 && !(c.roles || []).some((r) => ['maester', 'priest', 'servant'].includes(r)) && !/\b(maester|septon|septa)\b/i.test(c.title || '');
export const hostLeader = (state, v) => {
  const r = v.regent && state.characters[v.regent]; if (mayLead(r)) return r;
  const l = state.characters[v.lord]; if (mayLead(l) && !(v.regent && r?.alive && l.age < 16)) return l;
  const fighters = Object.values(state.characters).filter((c) => c.house === v.id && mayLead(c) && (c.roles || []).some((x) => FIGHTERS[x]));
  const rank = (c) => Math.max(...(c.roles || []).map((x) => FIGHTERS[x] || 0)) * 100 + (c.skills || []).slice(0, 3).reduce((a, b) => a + b, 0);
  return fighters.sort((a, b) => rank(b) - rank(a))[0] || null;
};
const leaderOf = hostLeader;
/** The one who commands the host that gathers at the seat: the first of the house's leaders (its regent, its lord, then its best fighters) who is there; none if none is. */
function leaderAt(state, v) {
  const r = v.regent && state.characters[v.regent]; const l = state.characters[v.lord];
  const fighters = Object.values(state.characters).filter((c) => c.house === v.id && mayLead(c) && (c.roles || []).some((x) => FIGHTERS[x]));
  const rank = (c) => Math.max(...(c.roles || []).map((x) => FIGHTERS[x] || 0)) * 100 + (c.skills || []).slice(0, 3).reduce((a, b) => a + b, 0);
  const order = [mayLead(r) ? r : null, mayLead(l) && !(v.regent && r?.alive && l.age < 16) ? l : null, ...fighters.sort((a, b) => rank(b) - rank(a))].filter(Boolean);
  return order.find((c) => placeOf(state, c) === v.seat) || null;
}
/**
 * A lord answers: his levies begin to gather at his seat today (a host serving his liege, growing day by day), and set
 * out when they are gathered. `now` — he answers at once (the verb answer_call), without the days of thought.
 * Returns { applied, events, men, party, text }.
 */
export function answer(state, v, { today = dayNumber(state.meta.date), late = false, cause = { type: 'rule', ref: 'the call' }, mine = v.liege === state.meta.player } = {}) {
  if (!v.obligations?.call) summon(state, v, { host: v.obligations?.join && state.parties[v.obligations.join] ? v.obligations.join : null, muster: v.obligations?.muster || state.houses[v.liege]?.seat, today });
  const ob = v.obligations; const call = ob.call;
  const lead = leaderOf(state, v);
  const lordName = lead ? lead.name : `House ${v.name}`; const P = lead ? pronouns(lead) : { he: 'it', him: 'them', his: 'its' };
  const sent = menSent(state, v, { scope: call.scope, late: late || call.late });
  const seatPos = placePos(v.seat, state.holdings);
  ob.levies = 'answered';
  if (sent.men < 50 || !seatPos) {
    ob.stage = 'joined'; call.men = 0;
    const text = `${lordName} sends word that ${P.he} has no men left to send.`;
    return { applied: [], events: shown(mine, fact(state, 'call_answered', { title: `House ${v.name} answers — with little`, text, where: v.seat, importance: 2, type: 'war', houses: answerHouses(v) }, { actors: [lead?.id], data: { men: 0 }, cause })), men: 0, party: null, text };
  }
  const name = `Host of House ${v.name}`;
  const leadHere = leaderAt(state, v); // (a lord who is away on a ride of his own does not step from the road into the host that gathers at his seat: Renly was feasting at Storm's End a fortnight into his ride to Highgarden, N-046)
  const first = Math.min(sent.men, Math.max(50, round50(sent.men / call.gather)));
  const r = applyChanges(state, [
    { op: 'army_create', owner: v.id, name, at: v.seat, men: first, commander: leadHere?.id || null, composition: `Levies of House ${v.name}${sent.arms > 200 ? ', with knights and men-at-arms' : ''}`, status: 'mustering' },
    { op: 'figure', house: v.id, field: 'levies', delta: -sent.levies, source: 'Muster rolls' },
    { op: 'figure', house: v.id, field: 'menAtArms', delta: -sent.arms, source: 'Muster rolls' },
  ], { cause });
  const told = tidyHouseNames(state, name); // (army_create tells a party's name as a herald would, so it is looked for as told)
  const a = Object.values(state.parties).find((x) => x.owner === v.id && x.name === told && !x.serving);
  let riding = [];
  if (a) {
    a.serving = v.liege; ob.host = a.id;
    if (sent.men > first) a.muster = { remaining: sent.men - first, daily: Math.max(50, Math.ceil((sent.men - first) / Math.max(1, call.gather - 1))), house: v.id, quiet: true };
    // the lord rides with his men — and his grown sons, brothers and sworn knights, as lords do
    if (leadHere) joinParty(state, leadHere, a);
    const leading = new Set(Object.values(state.parties).map((p) => p.commander).filter(Boolean)); // (a man who commands a host or a fleet of his own rides with that, not with the muster: Euron left his ship and Edmure his company)
    const kin = Object.values(state.characters).filter((c) => c.alive && c.house === v.id && c.id !== v.lord && c.id !== lead?.id && !leading.has(c.id) && (!isFemale(c) || /warrior|fighter|shield/i.test(c.traits || '')) && c.age >= 16 && c.age <= 50 && c.status === 'free' && !rideOf(state, c) && (c.loc === v.seat || isRef(c.loc)) && !(c.roles || []).includes('maester'));
    riding = kin.filter(() => random() < 0.55).slice(0, 2);
    for (const c of riding) joinParty(state, c, a);
  }
  ob.stage = 'gathering'; call.men = sent.men; call.decide = today; call.depart = today + call.gather;
  call.predicted = call.depart + marchFrom(state, v, call, seatPos);
  const t = targetOf(state, call);
  const text = `${lordName} answers the call with ${sent.men.toLocaleString('en-GB')} men${riding.length ? `, ${riding.map((c) => c.name).join(' and ')} riding with ${P.him}` : ''}; they gather at ${placeName(state, v.seat)} and march for ${t.name} in about ${call.gather} days.`;
  const events = shown(mine, fact(state, 'call_answered', { title: `House ${v.name} answers the call`, text, where: v.seat, importance: 3, type: 'war', houses: answerHouses(v) }, { actors: [lead?.id, ...riding.map((c) => c.id)], data: { men: sent.men, party: a?.id || null, to: call.host ? ref(call.host) : call.muster || null, depart: call.depart }, cause }));
  return { applied: r.applied, events, men: sent.men, party: a?.id || null, text };
}

// his levies are gathered: the host sets out for the one it is to join (the rendezvous takes it from there)
function depart(state, v, today, mine) {
  const ob = v.obligations; const call = ob.call; const a = state.parties[ob.host];
  ob.stage = 'departed';
  if (!a) return [];
  if (a.muster?.remaining) { a.men += a.muster.remaining; delete a.muster; }
  const t = targetOf(state, call);
  const days = marchFrom(state, v, call, a.pos); const bySea = t.pos && needsShips(a.pos, t.pos);
  // a crossing by sea waits on ships (shared/sea.js): its day is not the road's to promise
  call.bySea = !!bySea; call.eta = bySea ? null : today + days; call.eta0 = call.eta;
  if (t.pos && Math.hypot(a.pos[0] - t.pos[0], a.pos[1] - t.pos[1]) >= 4) { a.march = { to: t.to, since: state.meta.turn }; a.at = null; }
  settle(state, a);
  return shown(mine, fact(state, 'set_out', { title: `${a.name} sets out`, text: `${a.name}, ${a.men.toLocaleString('en-GB')} strong, sets out from ${placeName(state, v.seat)} for ${t.name}${bySea ? ' — by sea' : days ? ` (~${days} days)` : ''}.`, where: v.seat, importance: 2, houses: [v.id, v.liege] }, { actors: [a.commander], data: { party: a.id, to: String(t.to), eta: call.eta } }));
}

/**
 * One day of every sworn lord's answer to a call (the day loop, server/turn/day.js). `touched`: houses the lord's own
 * orders moved this turn. Returns { applied, events }.
 */
export function musterTick(state, touched = new Set()) {
  const applied = []; const events = []; const today = dayNumber(state.meta.date); const p = state.meta.player;
  for (const v of Object.values(state.houses)) {
    if (!v.obligations || !v.liege || !state.houses[v.liege] || v.id === p || !state.characters[v.lord]?.alive) continue;
    if (!['called', 'delayed', 'answered'].includes(v.obligations.levies)) continue;
    adopt(state, v, today);
    const ob = v.obligations; const call = ob.call; if (!call) continue;
    const mine = v.liege === p;
    if (ob.stage === 'letter' && today >= call.arrive) { ob.stage = 'deliberating'; call.decide = today + 1 + Math.floor(random() * 3); }
    if (ob.stage === 'delayed' && today >= call.retry) { ob.stage = 'deliberating'; ob.levies = 'called'; call.late = true; call.decide = today; }
    if (ob.stage === 'deliberating' && today >= call.decide && !touched.has(v.id)) {
      const odds = answerOdds(state, v, { scope: call.scope, late: call.late });
      const roll = random() * 100;
      const choice = roll < odds.answered ? 'answered' : roll < odds.answered + odds.delayed && !call.late ? 'delayed' : roll < odds.answered + odds.delayed ? 'answered' : 'refused';
      const lordName = state.characters[v.lord].name; const P = pronouns(state.characters[v.lord]);
      if (choice === 'answered') { const r = answer(state, v, { today, mine }); applied.push(...r.applied); events.push(...r.events); }
      else if (choice === 'delayed') {
        ob.levies = 'delayed'; ob.stage = 'delayed'; call.retry = today + 10 + Math.floor(random() * 21);
        call.predicted = call.retry + call.gather + marchFrom(state, v, call, placePos(v.seat, state.holdings));
        const excuses = ['the harvest is not yet in', 'fever in the villages', 'the roads are flooded', `${P.his} own borders are threatened`, `${P.his} knights are scattered at a tourney`, `${P.he} must first settle a quarrel with ${P.his} neighbour`];
        const text = `${lordName} writes that ${excuses[Math.floor(random() * excuses.length)]}. ${P.He} will come — later.`;
        events.push(...shown(mine, fact(state, 'call_delayed', { title: `House ${v.name} delays`, text, where: v.seat, importance: 2, type: 'war', houses: [v.id] }, { actors: [v.lord], data: { retry: call.retry } })));
      } else {
        ob.levies = 'refused'; ob.stage = 'refused';
        const text = `${lordName} refuses the summons. ${P.His} men will stay at home.`; const why = whyRefused(state, v, call);
        const k = [v.id, v.liege].sort().join('|');
        state.relations[k] = { ...(state.relations[k] || {}), v: Math.max(-100, Math.min(100, (state.relations[k]?.v ?? 0) - 10)) };
        events.push(...shown(mine, fact(state, 'call_refused', { title: `House ${v.name} refuses the call`, text, where: v.seat, importance: 4, type: 'war', houses: [v.id] }, { actors: [v.lord], data: { liege: v.liege, ...(why ? { why } : {}) } })));
      }
      applied.push({ op: 'obligation', text: `House ${v.name}: banners ${ob.levies}` });
    }
    if (ob.stage === 'gathering' && today >= call.depart) events.push(...depart(state, v, today, mine));
    // the host he is to join may have marched: the prediction follows it
    if (ob.stage === 'departed' && !call.bySea && state.parties[ob.host] && call.host && state.parties[call.host]?.march) call.eta = today + marchFrom(state, v, call, state.parties[ob.host].pos);
  }
  events.push(...waitTick(state, today));
  return { applied, events };
}

/** A contingent has joined its liege's host: the call is done (shared/vassals.js gatherMusters says when). */
export function joined(state, v, today = dayNumber(state.meta.date)) {
  const ob = v.obligations; if (!ob) return;
  ob.stage = 'joined'; if (ob.call) ob.call.joined = today;
}
/** Whether a lord's host is still gathering at his seat (it stays there: the rendezvous leaves it be). */
export const gathering = (state, v) => v?.obligations?.stage === 'gathering';

/**
 * The muster of a host as its card shows it (07 §3.4; 12 §8): who is present (and with how many), who is on the road
 * (and when they will come), who is still expected (the raven, their deliberation or their gathering, and a predicted
 * day), who delays and who refused. Days are absolute.
 */
export function musterOf(state, hostId) {
  const host = state.parties[hostId]; if (!host) return null;
  const out = { present: [], road: [], expected: [], refused: [] };
  for (const [h, men] of Object.entries(host.contingents || {})) out.present.push({ house: h, men });
  for (const v of Object.values(state.houses)) {
    const ob = v.obligations; const call = ob?.call;
    if (!call || v.liege !== host.owner || (call.host !== hostId && ob.join !== hostId && !(!call.host && call.muster === host.at))) continue;
    if (ob.stage === 'refused') out.refused.push({ house: v.id });
    else if (ob.stage === 'departed') out.road.push({ house: v.id, men: state.parties[ob.host]?.men || call.men, eta: call.bySea ? null : call.eta ?? call.predicted, bySea: !!call.bySea, party: ob.host });
    else if (['letter', 'deliberating', 'gathering', 'delayed'].includes(ob.stage)) out.expected.push({ house: v.id, stage: ob.stage, men: call.men, eta: call.bySea ? null : call.predicted, bySea: !!call.bySea });
  }
  const by = (a, b) => (a.eta ?? Infinity) - (b.eta ?? Infinity); out.road.sort(by); out.expected.sort(by);
  return out;
}

/**
 * Wait for the banners (07 §3.4): a host holds where it stands until a share of the men expected are with it, or a day
 * comes; then it goes where it was going. Returns the host's wait.
 */
export function waitForBanners(state, host, { share = 0.8, until = null } = {}) {
  const m = musterOf(state, host.id) || { road: [], expected: [] };
  const last = Math.max(0, ...m.road.map((x) => x.eta || 0), ...m.expected.map((x) => x.eta || 0));
  host.wait = { share, until: until ?? (last ? last + 3 : dayNumber(state.meta.date) + 14), to: host.march?.to ?? null };
  delete host.march; settle(state, host);
  return host.wait;
}
function waitTick(state, today) {
  const events = [];
  for (const a of Object.values(state.parties)) {
    if (!a.wait) continue;
    const m = musterOf(state, a.id); const here = m.present.reduce((s, x) => s + x.men, 0);
    const coming = here + m.road.reduce((s, x) => s + (x.men || 0), 0) + m.expected.reduce((s, x) => s + (x.men || 0), 0);
    const full = !coming || here >= a.wait.share * coming;
    if (!full && today < a.wait.until) continue;
    const to = a.wait.to; delete a.wait;
    if (to) { a.march = { to, since: state.meta.turn }; a.at = null; settle(state, a); }
    const where = to ? (isRef(to) ? state.parties[idOf(to)]?.name : placeName(state, to)) : null;
    events.push(...shown(a.owner === state.meta.player, fact(state, 'set_out', { title: full ? `The banners are in: ${a.name}${to ? ' marches' : ' is whole'}` : `${a.name} waits no longer`, text: `${a.name} has waited for the banners${full ? ' and they have come' : ', and will wait no longer'}: ${a.men.toLocaleString('en-GB')} men${to ? ` march for ${where}` : ' stand ready'}.`, where: a.at || null, importance: 3, houses: [a.owner] }, { actors: [a.commander], data: { party: a.id, to: to ? String(to) : null } })));
  }
  return events;
}
