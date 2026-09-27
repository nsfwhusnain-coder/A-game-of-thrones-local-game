// The engine fights the battles and the sieges. When hosts at war come into contact, they fight: the odds
// come from the war room (numbers, morale, supply, the commander's skill, walls), the dice decide, and the
// losses, the rout, the captured and the dead follow from how decisive it was. A host sitting before an enemy
// castle besieges it; the siege runs on the castle's stores and walls, or the attackers storm it if they
// have the numbers. The story model narrates around this, and is told the results next turn.
import { applyChanges } from './world.js';
import { atWar, battleOdds, siegeEstimate } from './warfare.js';
import { contingentsHoldBack } from './treachery.js';
import { random } from '../engine/rng.js';
import { settle } from '../engine/parties.js';

const CONTACT = 10;      // map units (~18 miles): hosts this close will meet
const SIEGE_REACH = 7;   // a host this close to an enemy castle sits before its walls
const rnd = (a, b, r) => a + (b - a) * r();
const pick = (arr, r) => arr[Math.floor(r() * arr.length)];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function nearestHolding(state, pos) {
  let best = null, d = Infinity;
  for (const h of Object.values(state.holdings)) { const x = dist(h.pos, pos); if (x < d) { d = x; best = h; } }
  return best;
}
function homeOf(state, a) {
  const seat = state.houses[a.owner]?.seat;
  if (seat && state.holdings[seat]) return seat;
  const own = Object.values(state.holdings).filter((h) => h.owner === a.owner).sort((x, y) => dist(x.pos, a.pos) - dist(y.pos, a.pos));
  return own[0]?.id || null;
}
const nameOf = (state, id) => state.characters[id]?.name || null;

// ── Battles ──
function fight(state, att, def, days, r) {
  const place = nearestHolding(state, def.pos);
  const atHold = def.at && state.holdings[def.at] && state.holdings[def.at].owner === def.owner ? state.holdings[def.at] : null;
  // treachery on the field: lords in secret talks with the enemy hold their men back — or turn them
  const betray = []; const eff = { [att.id]: att.men, [def.id]: def.men };
  for (const [side, other] of [[att, def], [def, att]]) for (const b of contingentsHoldBack(state, side, r)) {
    eff[side.id] -= b.men; if (b.turn) eff[other.id] += b.men; betray.push({ ...b, side, other });
  }
  const odds = battleOdds(state, { ...att, men: Math.max(1, eff[att.id]) }, { ...def, men: Math.max(1, eff[def.id]) }, { fort: atHold ? Math.min(2, (atHold.fort || 0) * 0.3) : 0 });
  const p = odds.attacker / 100;
  const attWins = r() < p;
  const [win, lose] = attWins ? [att, def] : [def, att];
  const margin = Math.abs((attWins ? p : 1 - p) - 0.5) * 2; // 0 = a coin toss, 1 = a foregone conclusion
  const winLoss = Math.round(win.men * rnd(0.04, 0.12, r) * (1.2 - margin * 0.7));
  const loseLoss = Math.round(lose.men * rnd(0.18, 0.4, r) * (0.8 + margin * 0.5));
  const before = { [win.id]: win.men, [lose.id]: lose.men };
  const changes = [];
  const wiped = lose.men - loseLoss < Math.max(150, before[lose.id] * 0.15);
  changes.push({ op: 'army_update', army: win.id, delta: -winLoss, morale: Math.min(100, (win.morale ?? 70) + 10), status: 'victorious', cause: 'battle' });
  if (wiped) changes.push({ op: 'army_destroy', army: lose.id, reason: 'destroyed in battle' });
  else {
    changes.push({ op: 'army_update', army: lose.id, delta: -loseLoss, morale: Math.max(5, (lose.morale ?? 70) - 25 - Math.round(margin * 15)), status: 'retreating', cause: 'battle' });
    const home = homeOf(state, lose); if (home) { lose.march = { to: home, since: state.meta.turn }; lose.route = null; lose.at = null; }
  }
  // what the hosts are doing this turn is the engine's word: the loser routed, the victor still in the field
  win.fought = lose.fought = state.meta.turn; win.state = 'engaged'; lose.state = 'routed';
  // the fate of the commanders
  const fates = [];
  const lc = lose.commander && state.characters[lose.commander];
  if (lc?.alive) {
    const roll = r();
    if (roll < (wiped ? 0.12 : 0.05)) { changes.push({ op: 'character', id: lc.id, alive: false, cause: `killed in battle near ${place?.name}` }); fates.push(`${lc.name} was slain`); }
    else if (roll < (wiped ? 0.4 : 0.14)) { changes.push({ op: 'character', id: lc.id, status: 'imprisoned', loc: win.at || place?.id, note: `Taken captive in battle near ${place?.name}` }); fates.push(`${lc.name} was taken captive`); }
  }
  const wc = win.commander && state.characters[win.commander];
  if (wc?.alive && r() < 0.025) { changes.push({ op: 'character', id: wc.id, alive: false, cause: `fell in the hour of victory near ${place?.name}` }); fates.push(`${wc.name} fell in the hour of victory`); }
  // the men who held back or turned leave the host they came with
  for (const b of betray) {
    changes.push({ op: 'army_update', army: b.side.id, delta: -Math.min(b.men, Math.max(0, b.side.men - (b.side === win ? winLoss : loseLoss) - 1)), cause: 'battle' });
    if (b.side.contingents) delete b.side.contingents[b.vid];
    const lordName = state.characters[state.houses[b.vid]?.lord]?.name || `House ${state.houses[b.vid]?.name}`;
    fates.push(b.turn ? `${lordName}'s men turned on their own side at the height of the battle` : `${lordName}'s men held back and let others die`);
  }
  const name = `The Battle of ${place?.name || 'the field'}`;
  const W = state.houses[win.owner], L = state.houses[lose.owner];
  changes.push({ op: 'battle', name, at: place?.id, attacker: att.owner, defender: def.owner, victor: win.owner, losses: { [win.owner]: winLoss, [lose.owner]: wiped ? lose.men : loseLoss }, summary: `${W?.name} defeated ${L?.name}${wiped ? ', whose host was destroyed' : ''}.` });
  changes.push({ op: 'landmark', name, at: place?.id, kind: 'battle', note: `${W?.name} over ${L?.name}` });
  changes.push({ op: 'relation', a: win.owner, b: lose.owner, delta: -8, reason: name });
  const season = state.world?.season || 'summer';
  const how = pick(margin > 0.6
    ? [`The ${L?.name} line broke at the first charge and never re-formed.`, `It was over before noon: the ${L?.name} host was outnumbered and outfought, and knew it.`, `${W?.name} had the ground, the numbers and the sun behind them; the ${L?.name} levies ran.`]
    : margin > 0.25
      ? [`The fighting lasted until dusk; the ${L?.name} left fell back first, and the rest followed.`, `A flank charge by the ${W?.name} knights decided a hard day.`, `Both hosts bled; the ${L?.name} broke when their banners fell.`]
      : [`It could have gone either way — the field was a slaughter, and the ${L?.name} yielded it only at nightfall.`, `A near thing: the ${W?.name} reserve came up at the last hour.`, `Neither side will call it a victory; but ${W?.name} held the field.`], r);
  const weather = { summer: 'under a hot sun', autumn: 'in the rain and mud', winter: 'in the snow', spring: 'across flooded fields' }[season];
  const details = `${how} Fought ${weather}; ${att.name} (${before[att.id].toLocaleString('en-US')}) against ${def.name} (${before[def.id].toLocaleString('en-US')}). ${W?.name} lost ~${winLoss.toLocaleString('en-US')}; ${L?.name} lost ~${(wiped ? before[lose.id] : loseLoss).toLocaleString('en-US')}${wiped ? ' — the host is no more' : ' and are falling back'}.${fates.length ? ' ' + fates.join('; ') + '.' : ''}`;
  const p0 = state.meta.player; const mine = [win.owner, lose.owner].includes(p0);
  const event = { title: `${W?.name} victorious near ${place?.name}`, text: `${win.name} ${wiped ? 'destroyed' : 'defeated'} ${lose.name}${fates.length ? '; ' + fates[0] : ''}.`, details, where: place?.id, importance: mine ? 5 : 4, type: 'war', houses: [win.owner, lose.owner], day: 1 + Math.floor(r() * days) };
  return { changes, event };
}

// ── Sieges ──
// A siege is a contest of stores and sickness, not a timer. The castle eats its own granary; the camp outside
// eats the countryside, and dies of the flux while it waits. Both sides can break before the walls do.
const CAMP_SICKNESS = { summer: 0.020, spring: 0.016, autumn: 0.024, winter: 0.045 }; // share of the camp lost per moon
function besiege(state, h, besiegers, days, r) {
  const est = siegeEstimate(state, h, besiegers);
  const lead = besiegers[0]; const L = state.houses[lead.owner];
  const changes = []; const events = [];
  const fresh = !(h.siege && h.siege.by === lead.owner);
  h.siege = fresh ? { by: lead.owner, days: 0, since: state.meta.turn, stores: est.months } : h.siege;
  if (h.siege.stores == null) h.siege.stores = est.months; // old saves
  h.siege.days += days;
  const men = besiegers.reduce((n, a) => n + a.men, 0);
  for (const a of besiegers) { a.besieging = h.id; settle(state, a); }
  // ── the castle eats. A crowded castle eats faster; a well-provisioned one (granaries) holds far longer.
  const mouths = 1 + Math.min(1.2, (est.garrison + (h.population || 1500) * 0.15) / 2500);
  h.siege.stores = Math.max(0, h.siege.stores - (days / 30) * mouths);
  // ── the camp outside dies too: the bloody flux, bad water, the cold, and men slipping away in the night.
  // This is the real cost of a long siege, and the reason storming is ever worth it.
  const season = state.world?.season || 'summer';
  const sickRate = (CAMP_SICKNESS[season] ?? 0.022) * (days / 30);
  for (const a of besiegers) {
    const sick = Math.round(a.men * sickRate * (a.supply != null && a.supply < 40 ? 1.8 : 1));
    // morale and supply sag but do not vanish: the camp forages, and a siege can still be held by a sullen host
    if (sick > 0) changes.push({ op: 'army_update', army: a.id, delta: -sick, cause: 'siege camp: flux, cold and desertion', morale: Math.max(25, (a.morale ?? 70) - Math.round((days / 30) * 4)), supply: Math.max(20, (a.supply ?? 80) - Math.round((days / 30) * 8)) });
  }
  // the lands around a siege are stripped bare by the foragers
  changes.push({ op: 'holding', id: h.id, unrest: Math.min(100, (h.unrest ?? 10) + Math.round((days / 30) * 5)) });
  // ── sallies: a strong garrison with heart does not simply sit. Now and then it comes out at dawn.
  const sallyChance = Math.min(0.45, (est.garrison / Math.max(1, men)) * 3 * (days / 30) * ((h.fort || 0) >= 4 ? 1.3 : 1));
  if (!fresh && r() < sallyChance) {
    const hurt = Math.round(Math.min(men * 0.05, est.garrison * rnd(0.6, 1.6, r)));
    const cost = Math.round(est.garrison * rnd(0.08, 0.22, r));
    changes.push({ op: 'army_update', army: lead.id, delta: -hurt, cause: 'a sally from the gates', morale: Math.max(5, (lead.morale ?? 70) - 6) });
    changes.push({ op: 'holding', id: h.id, garrison: Math.max(0, est.garrison - cost) });
    events.push({ title: `A sally from ${h.name}`, text: `The garrison of ${h.name} came out at dawn, fired the siege engines and cut down some ${hurt.toLocaleString('en-US')} of ${lead.name} before the gates closed again.`, details: `${cost.toLocaleString('en-US')} defenders did not get back inside.`, where: h.id, importance: [lead.owner, h.owner].includes(state.meta.player) ? 4 : 2, type: 'war', houses: [lead.owner, h.owner], day: Math.max(1, Math.round(r() * days)) });
  }
  const canStorm = (h.fort || 0) < 4 ? men > est.garrison * 6 : men > est.garrison * 12;
  const fall = (how, loss) => {
    changes.push({ op: 'holding', id: h.id, owner: lead.owner, status: 'occupied', garrison: Math.min(800, Math.round(men * 0.08)), note: `Taken by House ${L?.name} (${how})` });
    if (loss) changes.push({ op: 'army_update', army: lead.id, delta: -loss, cause: 'siege' });
    events.push({ title: `${h.name} has fallen`, text: `${h.name} ${how === 'stormed' ? 'was stormed' : 'yielded, starved,'} by ${lead.name}. House ${L?.name} holds it now.`, details: how === 'stormed' ? `Ladders and rams at dawn; the walls were carried at a cost of ~${loss.toLocaleString('en-US')} men.` : `After ${Math.round(h.siege.days / 30 * 10) / 10} moons the stores ran out and the garrison opened the gates.`, where: h.id, importance: [lead.owner, h.owner].includes(state.meta.player) ? 5 : 4, type: 'war', houses: [lead.owner, h.owner], day: Math.min(days, 1 + Math.floor(r() * days)) });
    delete h.siege;
  };
  // high walls and great castles are rarely carried by storm: a moon's chance falls with every course of stone
  const fort = h.fort || 0;
  const stormChance = !canStorm ? 0 : Math.min(0.5, (fort >= 5 ? 0.04 : fort >= 4 ? 0.1 : fort >= 2 ? 0.3 : 0.5) * (h.type === 'great_castle' ? 0.5 : 1) * Math.min(1.5, men / (est.garrison * (fort >= 4 ? 20 : 8))) * (days / 30));
  // ── the camp breaks first: a host that has wasted away or lost heart raises the siege and goes home.
  // Sieges in Westeros are broken by sickness and boredom at least as often as by relieving armies.
  // the lines can no longer be held: too few men left outside to ring the walls and beat off a sally
  const spent = besiegers.every((a) => a.men < Math.max(250, est.garrison * 1.5));
  if (h.siege.stores <= 0) fall('starved');
  else if (r() < stormChance) fall('stormed', Math.round(men * rnd(0.08, 0.16, r) * (1 + fort * 0.15)));
  else if (spent && h.siege.days > 30) {
    // the siege lines melt away
    for (const a of besiegers) { const home = homeOf(state, a); delete a.besieging; if (home) { a.march = { to: home, since: state.meta.turn }; a.route = null; a.at = null; } settle(state, a); }
    changes.push({ op: 'holding', id: h.id, status: 'normal', note: 'The siege is raised' });
    events.push({ title: `The siege of ${h.name} is raised`, text: `${lead.name} has broken camp and marched away from ${h.name}. Sickness, hunger and idleness did what the walls could not.`, details: `After ${Math.round(h.siege.days / 30 * 10) / 10} moons before the gates, the host was too wasted to hold the lines.`, where: h.id, importance: [lead.owner, h.owner].includes(state.meta.player) ? 4 : 3, type: 'war', houses: [lead.owner, h.owner], day: days });
    delete h.siege;
  } else {
    if (h.status !== 'besieged') {
      changes.push({ op: 'holding', id: h.id, status: 'besieged', note: `Besieged by House ${L?.name}` });
      events.push({ title: `The siege of ${h.name}`, text: `${lead.name} (${men.toLocaleString('en-US')} men) sits before the walls of ${h.name}.`, details: `The castle holds ~${est.garrison} men behind walls of ${h.fort || 0}/6; its stores should last ~${Math.round(h.siege.stores * 10) / 10} moons. ${canStorm ? 'The besiegers have the numbers to try the walls.' : 'It cannot be taken by storm with the men at hand; only hunger or treachery will do it.'}`, where: h.id, importance: [lead.owner, h.owner].includes(state.meta.player) ? 4 : 3, type: 'war', houses: [lead.owner, h.owner], day: 1 });
    }
    changes.push({ op: 'holding', id: h.id, prosperity: Math.max(0, (h.prosperity ?? 50) - 6) });
  }
  return { changes, events };
}

/**
 * Resolve the period's clashes. skip: houses whose battle the story itself told this turn (not fought twice).
 * Returns { events, applied }.
 */
export function resolveWarfare(state, days, { skip = new Set(), r = random } = {}) {
  const events = []; const applied = []; const fought = new Set();
  const armies = () => Object.values(state.parties).filter((a) => a.men > 0);
  // battles: the closest pairs first
  const pairs = [];
  const all = armies();
  for (const a of all) for (const b of all) {
    if (a.id >= b.id || !atWar(state, a.owner, b.owner)) continue;
    if ((a.kind === 'fleet') !== (b.kind === 'fleet')) continue;
    if (skip.has(a.owner) && skip.has(b.owner)) continue;
    const d = dist(a.pos, b.pos); if (d <= CONTACT * (a.kind === 'fleet' ? 1.6 : 1)) pairs.push([d, a, b]);
  }
  pairs.sort((x, y) => x[0] - y[0]);
  for (const [, a, b] of pairs) {
    if (fought.has(a.id) || fought.has(b.id) || !state.parties[a.id] || !state.parties[b.id]) continue;
    // the side that marched into the other attacks; else the stronger one does
    const aMoving = a.march && !b.march, bMoving = b.march && !a.march;
    const [att, def] = aMoving ? [a, b] : bMoving ? [b, a] : a.men >= b.men ? [a, b] : [b, a];
    const res = fight(state, att, def, days, r);
    const out = applyChanges(state, res.changes, { source: 'The field of battle', battleHouses: new Set([a.owner, b.owner]), spanDays: days });
    applied.push(...out.applied); events.push(res.event); fought.add(a.id); fought.add(b.id);
  }
  // sieges: hosts that sit before an enemy castle, and did not just fight
  const byHold = new Map();
  for (const a of armies()) {
    if (a.kind === 'fleet' || fought.has(a.id) || a.march) continue;
    for (const h of Object.values(state.holdings)) {
      if (!atWar(state, a.owner, h.owner) || dist(a.pos, h.pos) > SIEGE_REACH) continue;
      if (!byHold.has(h.id)) byHold.set(h.id, []); byHold.get(h.id).push(a); break;
    }
  }
  for (const [hid, bes] of byHold) {
    const h = state.holdings[hid]; if (!h) continue;
    // a relieving host of the defenders nearby fights first (handled above); otherwise the siege goes on
    const res = besiege(state, h, bes.sort((x, y) => y.men - x.men), days, r);
    const out = applyChanges(state, res.changes, { source: 'The siege lines', battleHouses: new Set(bes.map((a) => a.owner)), spanDays: days });
    applied.push(...out.applied); events.push(...res.events);
  }
  // sieges with no one left outside the walls are lifted
  for (const h of Object.values(state.holdings)) {
    if (h.status !== 'besieged' || byHold.has(h.id)) continue;
    const near = armies().some((a) => a.kind !== 'fleet' && atWar(state, a.owner, h.owner) && dist(a.pos, h.pos) <= SIEGE_REACH);
    if (!near) { const out = applyChanges(state, [{ op: 'holding', id: h.id, status: 'normal', note: 'The siege is lifted' }]); applied.push(...out.applied); delete h.siege; }
  }
  return { events, applied };
}
