// Sieges (docs/gdd/07-military.md §8; WP C5), grown from shared/battles.js's siege: a contest of stores and sickness,
// not a timer. The castle eats its granary (unless the sea or the high road feeds it); the camp outside eats the country
// and sickens (engine/military/supply.js); strong garrisons sally. It ends in one of five ways: starved out; terms
// offered and taken (the commonest way castles change hands — a craven castellan takes them early, a proud one not at
// all); a storm, which fails often, by design; treachery, a postern opened by a castellan who took the besieger's gold;
// or the siege lifted — the camp wasted, or a relieving host come near that the besiegers dare not fight.
import { FORTRESS } from '../../../data/fortresses.js';
import { temperament } from '../../shared/temperament.js';
import { realmOf } from '../../shared/world.js';
import { atWar, marchDays } from '../../shared/warfare.js';
import { fact } from '../facts/log.js';
import { ref, settle } from '../parties.js';
import { powerOf, reckon, fallBack } from './battle.js';
import { fedByRations } from './supply.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const rnd = (a, b, r) => a + (b - a) * r();
const fmt = (n) => Math.round(n).toLocaleString('en-GB');
const NOISE = 0.12;

/** The rules of a stronghold: its row of the fortress table, or none. */
export const rulesOf = (h) => FORTRESS[h?.id] || {};
/** How many men hold the walls. */
export const garrisonOf = (state, h) => h.garrison ?? Math.round((Number(state.houses[h.owner]?.figures?.menAtArms?.v) || 200) * 0.5);
/** The walls, 0–6: the table's where it raises them; Harrenhal too great to hold with a few hundred. */
export function fortOf(state, h) {
  const R = rulesOf(h); const f = Math.max(h.fort || 0, R.fort || 0);
  return R.needsMen && garrisonOf(state, h) < R.needsMen ? Math.min(f, 2) : f;
}

/** Who holds a castle for its lord: the lord himself if he is there, else the captain or knight he left, else the lord. */
export function castellanOf(state, h) {
  const house = state.houses[h.owner];
  const here = Object.values(state.characters).filter((c) => c.alive && c.loc === h.id && c.house === h.owner && !/imprisoned|captive/.test(c.status || ''));
  const rank = (c) => (house?.lord === c.id ? 0 : (c.roles || []).some((x) => ['castellan', 'captain', 'master_at_arms', 'commander'].includes(x)) ? 1 : (c.roles || []).includes('knight') ? 2 : (c.roles || []).some((x) => ['heir', 'lady', 'lord'].includes(x)) ? 3 : 9);
  const best = here.filter((c) => rank(c) < 9).sort((a, b) => rank(a) - rank(b))[0];
  return best || state.characters[house?.lord] || null;
}

/** Whether ships of the besiegers' side lie before a holding: a sea-fed castle starves only then. */
export function blockaded(state, h, by) {
  if (h.blockade && realmOf(state, h.blockade.by) === realmOf(state, by)) return true;
  return Object.values(state.parties).some((p) => p.kind === 'fleet' && p.men > 0 && !p.march && realmOf(state, p.owner) === realmOf(state, by) && dist(p.pos, h.pos) <= 30);
}
/** Whether the castle's stores fall today: not while the sea or the high road feeds it. */
export function starving(state, h, by) {
  const R = rulesOf(h);
  if (R.needsSea && !blockaded(state, h, by)) return false;
  if (R.mules && (state.world?.season || 'summer') !== 'winter') return false;
  return true;
}

/** Moons of stores a besieged holding starts with: its lord's granaries, its walls, a seat's store, a granary. */
export function storesOf(state, h) {
  const owner = state.houses[h.owner];
  const food = Math.min(Number(owner?.figures?.food?.v) || 6, 24);
  const seat = h.seatOf || owner?.seat === h.id ? 1.25 : 1;
  const granary = (h.buildings || []).some((b) => /granar/i.test(b)) ? 1.6 : 1;
  return Math.max(0.5, Math.round(food * (fortOf(state, h) >= 4 ? 1.2 : 0.8) * seat * granary * 10) / 10);
}

// ── Storm (§8.3) ─────────────────────────────────────────────────────────────────────────────────────────────────────
/** The odds of carrying the walls now: the besiegers' power (×1.3 once the engines are built) against the garrison's
 * behind them, ×(1 + fort × 0.6) twice over — the first for the walls, the second for the gate and the towers. */
export function stormOdds(state, h, besiegers) {
  const R = rulesOf(h); if (R.noStorm) return 0;
  const engines = (h.siege?.days || 0) >= 7 ? 1.3 : 1;
  const south = R.causeway === 'south';
  const att = besiegers.reduce((n, a) => n + powerOf(state, a, { role: 'attacker', ground: 'open' }).power * (south && a.pos[1] > h.pos[1] ? 0.4 : 1), 0) * engines;
  const c = castellanOf(state, h); const m = c?.alive ? (c.skills?.[1] ?? 8) : 5;
  const def = garrisonOf(state, h) * 1.6 * (1 + fortOf(state, h) * 0.6) ** 2 * (1 + (m - 10) * 0.03);
  return att / Math.max(1, def);
}

/** An assault: { carried, odds, attackers lost, defenders lost }. Losses 20–50 % of the stormers; it fails often. */
export function assault(state, h, besiegers, r) {
  const odds = stormOdds(state, h, besiegers);
  const eff = odds * (1 + 2 * NOISE * (2 * r() - 1));
  const carried = eff >= 1.1;
  const men = besiegers.reduce((n, a) => n + a.men, 0);
  const frac = carried ? clamp(0.35 - 0.1 * (eff - 1.1), 0.2, 0.35) : clamp(0.3 + 0.2 * (1.1 - eff), 0.3, 0.5);
  const g = garrisonOf(state, h);
  return { carried, odds, eff, lost: Math.round(men * frac), defendersLost: carried ? g : Math.round(g * rnd(0.1, 0.25, r)) };
}

// ── Terms (§8.3) ─────────────────────────────────────────────────────────────────────────────────────────────────────
export const TERMS = {
  march_out_with_arms: 'march out with their arms and banners, unharmed',
  yield_and_swear: 'yield, and swear fealty — and keep the castle as sworn men',
  yield_hostages: 'give hostages and keep out of the war',
  unconditional: 'yield without terms',
};
const GENEROUS = { march_out_with_arms: 0.45, yield_hostages: 0.3, yield_and_swear: 0.2, unconditional: 0.05 };

/** A host of the holding's side within three days of it: the relief. */
export function reliefOf(state, h, by) {
  return Object.values(state.parties).filter((p) => ['host', 'garrison'].includes(p.kind) && p.men >= 500 && !atWar(state, p.owner, h.owner) && atWar(state, p.owner, by) && dist(p.pos, h.pos) > 7)
    .map((p) => ({ p, d: marchDays(p, p.pos, h.pos, state).days })).filter((x) => x.d <= 3).sort((a, b) => a.d - b.d)[0]?.p || null;
}

/**
 * Whether the castellan takes the terms: { p, accepted, castellan, why }. By the terms, how the odds stand (the host
 * outside against the walls), how long the stores will last, whether help is near, and the castellan's nature — a craven
 * takes terms early, a proud or stubborn one late or never.
 */
export function weighTerms(state, h, besiegers, terms, r) {
  const c = castellanOf(state, h); const T = c ? temperament(c) : null;
  const men = besiegers.reduce((n, a) => n + a.men, 0);
  const pressure = clamp(Math.log10(Math.max(1, men / Math.max(1, garrisonOf(state, h) * (1 + fortOf(state, h) * 0.6)))), 0, 1);
  const stores = h.siege?.stores ?? storesOf(state, h);
  const hunger = starving(state, h, besiegers[0]?.owner) ? clamp(1 - stores / 3, 0, 1) : 0;
  const relief = reliefOf(state, h, besiegers[0]?.owner);
  let p = (GENEROUS[terms] ?? 0.1) + 0.3 * pressure + 0.45 * hunger;
  if (T) {
    if (T.courage < 0.35) p += 0.35; else if (T.courage >= 0.75) p -= 0.25;
    p -= 0.12 * (T.pride ?? 0.5) + 0.1 * (T.stubborn ?? 0.5);
  }
  if (rulesOf(h).noStorm && !hunger) p -= 0.15; // behind walls that cannot be stormed, and not yet hungry
  if (relief) p *= 0.3;
  p = clamp(p, 0.02, 0.98);
  const accepted = r() < p;
  const why = relief ? `${relief.name} is near` : hunger > 0.5 ? 'the stores are nearly gone' : T && T.courage < 0.35 ? 'the castellan has no stomach for a siege' : pressure > 0.6 ? 'the host outside is too great' : '';
  return { p, accepted, castellan: c, why };
}

/**
 * The castle yields on its terms: returns { changes, events } for applyChanges. `lead` is the besiegers' host.
 * march out: the garrison goes home, the castle is the besieger's; swear: a lord's seat stays his, sworn now to the
 * besieger; hostages: the house gives one of its own and keeps out of the war; unconditional: the castellan is taken.
 */
export function yieldOn(state, h, lead, terms, { how = 'terms', day = 1 } = {}) {
  const changes = []; const events = []; const L = state.houses[lead.owner]; const house = state.houses[h.owner];
  const c = castellanOf(state, h); const seat = house?.seat === h.id; const great = ['crown', 'paramount'].includes(house?.rank);
  const keeps = seat && !great && (terms === 'yield_and_swear' || terms === 'yield_hostages');
  if (!keeps) changes.push({ op: 'holding', id: h.id, owner: lead.owner, status: 'occupied', garrison: Math.min(800, Math.round(lead.men * 0.08)), note: `Yielded to House ${L?.name}` });
  else changes.push({ op: 'holding', id: h.id, status: 'normal', note: terms === 'yield_and_swear' ? `Sworn to House ${L?.name}` : `Hostages given to House ${L?.name}` });
  if (keeps && terms === 'yield_and_swear') { house.liege = realmOf(state, lead.owner); for (const w of state.wars || []) { w.attackers = w.attackers.filter((x) => x !== house.id); w.defenders = w.defenders.filter((x) => x !== house.id); } }
  if (keeps && terms === 'yield_hostages') {
    const kin = Object.values(state.characters).filter((x) => x.alive && x.house === house.id && x.id !== house.lord && !/imprisoned|captive|hostage/.test(x.status || '')).sort((a, b) => ((b.roles || []).includes('heir') ? 1 : 0) - ((a.roles || []).includes('heir') ? 1 : 0) || (a.age ?? 30) - (b.age ?? 30))[0];
    if (kin) changes.push({ op: 'character', id: kin.id, status: 'hostage', loc: ref(lead.id), note: `Given as a hostage to House ${L?.name} at ${h.name}` });
    for (const w of state.wars || []) { w.attackers = w.attackers.filter((x) => x !== house.id); w.defenders = w.defenders.filter((x) => x !== house.id); }
  }
  if (terms === 'unconditional' && c?.alive && c.loc === h.id) changes.push({ op: 'character', id: c.id, status: 'imprisoned', loc: ref(lead.id), note: `Yielded ${h.name} without terms` });
  const mine = [lead.owner, h.owner].includes(state.meta.player);
  const text = how === 'betrayed' ? `${h.name} is betrayed: a postern opens in the night, and House ${L?.name} holds it by dawn.`
    : how === 'starved' ? `${h.name} yields, starved, to ${lead.name}. House ${L?.name} holds it now.`
      : keeps ? `${h.name} yields to ${lead.name}: ${c?.name || 'its lord'} ${terms === 'yield_and_swear' ? `swears fealty to House ${L?.name}, and keeps the castle as a sworn man` : `gives hostages to House ${L?.name} and keeps out of the war`}.`
        : `${h.name} yields to ${lead.name} on terms: the garrison is to ${TERMS[terms]}. House ${L?.name} holds it now.`;
  events.push(fact(state, 'holding_fell', { title: how === 'betrayed' ? `${h.name} betrayed` : `${h.name} yields`, text, where: h.id, importance: mine ? 5 : 4, type: 'war', houses: [lead.owner, h.owner], day }, { actors: [lead.commander, c?.id], data: { holding: h.id, by: lead.owner, how, terms, kept: keeps } }));
  delete h.siege;
  return { changes, events };
}

// ── The day before the walls (§8.2) ──────────────────────────────────────────────────────────────────────────────────
const mineOf = (state, ...h) => h.includes(state.meta.player);
const weekTurned = (before, after) => Math.floor(before / 7) !== Math.floor(after / 7);

/** One stretch of `days` of a siege: returns { changes, events }. besiegers: the hosts before the walls, largest first. */
export function siegeTick(state, h, besiegers, days, r) {
  const lead = besiegers[0]; const L = state.houses[lead.owner]; const R = rulesOf(h);
  const changes = []; const events = [];
  const fresh = !(h.siege && h.siege.by === lead.owner);
  h.siege = fresh ? { by: lead.owner, days: 0, since: state.meta.turn, stores: storesOf(state, h) } : h.siege;
  if (h.siege.stores == null) h.siege.stores = storesOf(state, h); // old saves
  const before = h.siege.days; h.siege.days += days;
  const men = besiegers.reduce((n, a) => n + a.men, 0); const g = garrisonOf(state, h); const fort = fortOf(state, h);
  for (const a of besiegers) { a.besieging = h.id; settle(state, a); }
  const day = (d = days) => Math.max(1, Math.min(days, Math.round(d)));
  // ── the castle eats (a crowded castle faster) — unless the sea or the high road feeds it
  if (starving(state, h, lead.owner)) {
    const mouths = 1 + Math.min(1.2, (g + (h.population || 1500) * 0.15) / 2500);
    const cold = (state.world?.season === 'winter' && R.winterStores) || 1;
    h.siege.stores = Math.max(0, h.siege.stores - (days / 30) * mouths / cold);
  }
  // ── the camp outside: the free folk, khalasars and companies sicken here; the landed hosts by their rations
  const season = state.world?.season || 'summer';
  for (const a of besiegers) {
    if (fedByRations(state, a)) continue;
    const sick = Math.round(a.men * ({ summer: 0.02, spring: 0.016, autumn: 0.024, winter: 0.045 }[season] ?? 0.022) * (days / 30) * (a.supply != null && a.supply < 40 ? 1.8 : 1));
    if (sick > 0) changes.push({ op: 'army_update', army: a.id, delta: -sick, cause: 'siege camp: flux, cold and desertion' });
  }
  changes.push({ op: 'holding', id: h.id, unrest: Math.min(100, (h.unrest ?? 10) + (days / 30) * 5) });
  // ── sallies: a strong garrison with heart does not simply sit
  const sallyChance = Math.min(0.45, (g / Math.max(1, men)) * 3 * (days / 30) * (fort >= 4 ? 1.3 : 1));
  if (!fresh && r() < sallyChance) {
    const hurt = Math.round(Math.min(men * 0.05, g * rnd(0.6, 1.6, r))); const cost = Math.round(g * rnd(0.08, 0.22, r));
    changes.push({ op: 'army_update', army: lead.id, delta: -hurt, cause: 'a sally from the gates', morale: Math.max(5, (lead.morale ?? 70) - 6) });
    changes.push({ op: 'holding', id: h.id, garrison: Math.max(0, g - cost) });
    events.push(fact(state, 'sally', { title: `A sally from ${h.name}`, text: `The garrison of ${h.name} came out at dawn, fired the siege engines and cut down some ${fmt(hurt)} of ${lead.name} before the gates closed again.`, details: `${fmt(cost)} defenders did not get back inside.`, where: h.id, importance: mineOf(state, lead.owner, h.owner) ? 4 : 2, type: 'war', houses: [lead.owner, h.owner], day: day(r() * days) }, { actors: [lead.commander], data: { holding: h.id, party: lead.id } }));
  }
  if (h.status !== 'besieged' && fresh) {
    changes.push({ op: 'holding', id: h.id, status: 'besieged', note: `Besieged by House ${L?.name}` });
    const hows = R.noStorm ? 'It cannot be taken by storm: only hunger, terms or treachery will do it.' : stormOdds(state, h, besiegers) >= 1.3 ? 'The besiegers have the numbers to try the walls.' : 'It cannot be stormed with the men at hand; only hunger, terms or treachery will do it.';
    const fed = !starving(state, h, lead.owner) ? (R.needsSea ? ' Ships bring it food by sea: without a fleet before it, it will not starve.' : ' The high road feeds it until winter.') : '';
    events.push(fact(state, 'siege_begun', { title: `The siege of ${h.name}`, text: `${lead.name} (${fmt(men)} men) sits before the walls of ${h.name}.`, details: `The castle holds ~${fmt(g)} men behind walls of ${fort}/6; its stores should last ~${Math.round(h.siege.stores * 10) / 10} moons.${fed} ${hows}`, where: h.id, importance: mineOf(state, lead.owner, h.owner) ? 4 : 3, type: 'war', houses: [lead.owner, h.owner], day: 1 }, { actors: [lead.commander], data: { holding: h.id, by: lead.owner, men } }));
  }
  const fall = (res) => { changes.push(...res.changes); events.push(...res.events); };
  // ── treachery: a castellan who took the besiegers' gold opens a postern
  const c = castellanOf(state, h);
  if (c?.bought && realmOf(state, c.bought.by) === realmOf(state, lead.owner) && h.siege.days >= 3) { fall(yieldOn(state, h, lead, 'march_out_with_arms', { how: 'betrayed', day: day() })); return { changes, events }; }
  // ── starved: the garrison yields
  if (h.siege.stores <= 0) { fall(yieldOn(state, h, lead, 'unconditional', { how: 'starved', day: day() })); return { changes, events }; }
  // ── a relieving host within three days: the besiegers hear of it once, and (the realm's lords) choose
  const relief = reliefOf(state, h, lead.owner);
  if (relief && h.siege.relief !== relief.id) {
    h.siege.relief = relief.id;
    events.push(fact(state, 'relief_near', { title: `${relief.name} comes to relieve ${h.name}`, text: `Scouts bring word to ${lead.name}: ${relief.name} (~${fmt(relief.men)} men) is within three days of ${h.name}.`, where: h.id, importance: mineOf(state, lead.owner, relief.owner) ? 4 : 2, type: 'war', houses: [lead.owner, relief.owner, h.owner], day: day() }, { actors: [lead.commander, relief.commander], data: { holding: h.id, relief: relief.id, by: lead.owner }, cause: { type: 'rule', ref: 'siege' } }));
    if (lead.owner !== state.meta.player && lead.serving !== state.meta.player) {
      const so = stormOdds(state, h, besiegers); const field = reckon(state, lead, relief).odds;
      if (so >= 1.2) h.siege.stormNow = true;                  // storm before the relief comes
      else if (field < 0.9) {                                  // the relief is too strong: lift the siege
        for (const a of besiegers) fallBack(state, a);
        changes.push({ op: 'holding', id: h.id, status: 'normal', note: 'The siege is raised before a relieving host' });
        events.push(fact(state, 'siege_lifted', { title: `The siege of ${h.name} is raised`, text: `${lead.name} breaks camp before ${relief.name} can come up, and marches away from ${h.name}.`, where: h.id, importance: 3, type: 'war', houses: [lead.owner, h.owner], day: day() }, { actors: [lead.commander], data: { holding: h.id, by: lead.owner, relief: relief.id } }));
        delete h.siege; return { changes, events };
      }                                                         // else: stand and fight when it comes
    }
  }
  // ── a storm: ordered (the verb), or the realm's lords once a week when the odds are good and the engines built
  const npc = lead.owner !== state.meta.player && lead.serving !== state.meta.player;
  const ordered = besiegers.some((a) => a.storm === h.id) || h.siege.stormNow;
  const weekly = npc && weekTurned(before, h.siege.days) && h.siege.days >= 14 && stormOdds(state, h, besiegers) >= 1.3;
  if (!R.noStorm && (ordered || weekly)) {
    for (const a of besiegers) delete a.storm; delete h.siege.stormNow;
    const A = assault(state, h, besiegers, r);
    const share = (a) => Math.round(A.lost * a.men / Math.max(1, men));
    for (const a of besiegers) changes.push({ op: 'army_update', army: a.id, delta: -share(a), cause: 'storming the walls', morale: clamp((a.morale ?? 70) + (A.carried ? 10 : -15), 5, 100) });
    if (A.carried) {
      changes.push({ op: 'holding', id: h.id, owner: lead.owner, status: 'occupied', garrison: Math.min(800, Math.round((men - A.lost) * 0.08)), note: `Stormed by House ${L?.name}` });
      events.push(fact(state, 'storm_assault', { title: `${h.name} is stormed`, text: `${lead.name} carries the walls of ${h.name} by storm. House ${L?.name} holds it now.`, details: `Ladders and rams at dawn; the walls were carried at a cost of ~${fmt(A.lost)} men.`, where: h.id, importance: mineOf(state, lead.owner, h.owner) ? 5 : 4, type: 'war', houses: [lead.owner, h.owner], day: day() }, { actors: [lead.commander, c?.id], data: { holding: h.id, by: lead.owner, carried: true, lost: A.lost, odds: Math.round(A.odds * 100) / 100 } }));
      if (c?.alive && c.loc === h.id) changes.push({ op: 'character', id: c.id, status: 'imprisoned', loc: ref(lead.id), note: `Taken when ${h.name} was stormed` });
      delete h.siege;
    } else {
      changes.push({ op: 'holding', id: h.id, garrison: Math.max(0, g - A.defendersLost) });
      events.push(fact(state, 'storm_assault', { title: `The storm of ${h.name} fails`, text: `${lead.name} throws its men at the walls of ${h.name}, and is thrown back.`, details: `~${fmt(A.lost)} of the stormers are dead or broken below the walls; the defenders lost ~${fmt(A.defendersLost)}.`, where: h.id, importance: mineOf(state, lead.owner, h.owner) ? 4 : 3, type: 'war', houses: [lead.owner, h.owner], day: day() }, { actors: [lead.commander, c?.id], data: { holding: h.id, by: lead.owner, carried: false, lost: A.lost, odds: Math.round(A.odds * 100) / 100 } }));
    }
    return { changes, events };
  }
  // ── the realm's lords offer terms once a week after the first
  if (npc && weekTurned(before, h.siege.days) && h.siege.days >= 7) {
    const T = lead.commander && state.characters[lead.commander] ? temperament(state.characters[lead.commander]) : null;
    const terms = T && T.warmth < 0.3 && T.pride > 0.6 ? 'unconditional' : state.houses[h.owner]?.seat === h.id ? 'yield_and_swear' : 'march_out_with_arms';
    const w = weighTerms(state, h, besiegers, terms, r);
    if (w.accepted) { fall(yieldOn(state, h, lead, terms, { day: day() })); return { changes, events }; }
    if (!h.siege.refused) { h.siege.refused = true; events.push(fact(state, 'terms_refused', { title: `${h.name} refuses terms`, text: `${w.castellan?.name || 'The castellan'} refuses the terms of House ${L?.name}: ${h.name} will hold.`, where: h.id, importance: mineOf(state, h.owner) ? 3 : 2, type: 'war', houses: [lead.owner, h.owner], day: day() }, { actors: [w.castellan?.id, lead.commander], data: { holding: h.id, by: lead.owner, terms } })); }
  }
  // ── the camp breaks first: too few left outside to ring the walls
  const spent = besiegers.every((a) => a.men < Math.max(250, g * 1.5));
  if (spent && h.siege.days > 30) {
    for (const a of besiegers) fallBack(state, a);
    changes.push({ op: 'holding', id: h.id, status: 'normal', note: 'The siege is raised' });
    events.push(fact(state, 'siege_lifted', { title: `The siege of ${h.name} is raised`, text: `${lead.name} has broken camp and marched away from ${h.name}. Sickness, hunger and idleness did what the walls could not.`, details: `After ${Math.round(h.siege.days / 30 * 10) / 10} moons before the gates, the host was too wasted to hold the lines.`, where: h.id, importance: mineOf(state, lead.owner, h.owner) ? 4 : 3, type: 'war', houses: [lead.owner, h.owner], day: day() }, { actors: [lead.commander], data: { holding: h.id, by: lead.owner } }));
    delete h.siege;
    return { changes, events };
  }
  changes.push({ op: 'holding', id: h.id, prosperity: Math.max(0, (h.prosperity ?? 50) - 6 * days / 30) });
  return { changes, events };
}

/** The siege as a war room reckons it: { months, garrison, fort, storm (words), starve (words), odds }. */
export function siegeView(state, h, besiegers) {
  const R = rulesOf(h); const odds = besiegers.length ? stormOdds(state, h, besiegers) : 0;
  const storm = R.noStorm ? 'cannot be stormed' : odds >= 1.5 ? 'can be stormed' : odds >= 1 ? 'storming would be bloody, and may fail' : 'cannot be stormed with these men';
  const starve = R.needsSea ? 'fed by sea: starved only with a fleet before it' : R.mules ? 'fed by the high road until winter' : R.winterStores ? 'its hot springs make its winter stores last' : '';
  return { months: h.siege?.stores != null ? Math.round(h.siege.stores * 10) / 10 : storesOf(state, h), garrison: garrisonOf(state, h), fort: fortOf(state, h), storm, starve, odds };
}
