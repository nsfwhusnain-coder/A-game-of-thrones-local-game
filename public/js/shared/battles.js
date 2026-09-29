// The engine fights the battles and the sieges. When hosts at war come into contact, they fight: the odds
// come from the war room (numbers, morale, supply, the commander's skill, walls), the dice decide, and the
// losses, the rout, the captured and the dead follow from how decisive it was. A host sitting before an enemy
// castle besieges it; the siege runs on the castle's stores and walls, or the attackers storm it if they
// have the numbers. The story model narrates around this, and is told the results next turn.
import { applyChanges } from './world.js';
import { atWar } from './warfare.js';
import { siegeTick, rulesOf } from '../engine/military/siege.js';
import { contingentsHoldBack } from './treachery.js';
import { random } from '../engine/rng.js';
import { settle, ref, idOf } from '../engine/parties.js';
import { navalPower, fightAtSea } from '../engine/military/naval.js';
import { resolveBattle, reckon, stanceOf, escapes, fallBack, refugeOf } from '../engine/military/battle.js';
import { groundAt } from '../engine/movement.js';
import { seesParty } from '../engine/knowledge.js';
import { fact } from '../engine/facts/log.js';

const CONTACT = 10;      // map units (~18 miles): hosts this close will meet
const SIEGE_REACH = 7;   // a host this close to an enemy castle sits before its walls
const pick = (arr, r) => arr[Math.floor(r() * arr.length)];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function nearestHolding(state, pos) {
  let best = null, d = Infinity;
  for (const h of Object.values(state.holdings)) { const x = dist(h.pos, pos); if (x < d) { d = x; best = h; } }
  return best;
}
const nameOf = (state, id) => state.characters[id]?.name || null;

// ── Battles (engine/military/battle.js decides; this applies it) ──
const fmt = (n) => Math.round(n).toLocaleString('en-GB');
function fight(state, att, def, days, r, { surprise = false, caught = false, stances = {}, divided = false } = {}) {
  // treachery on the field: lords in secret talks with the enemy hold their men back — or turn them
  const betray = []; const held = { [att.id]: 0, [def.id]: 0 }; const turned = { [att.id]: 0, [def.id]: 0 };
  for (const [side, other] of [[att, def], [def, att]]) for (const b of contingentsHoldBack(state, side, r)) {
    held[side.id] += b.men; if (b.turn) turned[other.id] += b.men; betray.push({ ...b, side, other });
  }
  // the battle is fought with the men who fight: the held-back stand aside, the turncoats change sides for the day
  const menA = att.men, menD = def.men;
  att.men = Math.max(1, menA - held[att.id] + turned[att.id]); def.men = Math.max(1, menD - held[def.id] + turned[def.id]);
  const B = resolveBattle(state, att, def, { r, surprise, caught, divided });
  att.men = menA; def.men = menD;
  const { win, lose } = B; const place = B.site.place;
  const winLoss = Math.min(win.men - 1, B.lost[win.id]); const loseLoss = B.wiped ? lose.men : Math.min(lose.men, B.lost[lose.id]);
  const changes = [];
  const moraleWin = B.drawn ? -10 : Math.round(10 + 20 * B.m); const moraleLose = B.drawn ? -10 : -Math.round(10 + 20 * B.m);
  changes.push({ op: 'army_update', army: win.id, delta: -winLoss, morale: clamp((win.morale ?? 70) + moraleWin, 5, 100), cause: 'battle' });
  if (B.wiped) changes.push({ op: 'army_destroy', army: lose.id, reason: 'destroyed in battle' });
  else changes.push({ op: 'army_update', army: lose.id, delta: -loseLoss, morale: clamp((lose.morale ?? 70) + moraleLose, 5, 100), cause: 'battle' });
  // the baggage changes hands
  if (B.spoils) { win.rations += B.spoils; if (!B.wiped) lose.rations = Math.max(0, lose.rations - B.spoils); }
  // the fates of the story's people: slain, taken to the victor's host, or hurt
  const fates = [];
  // a fallen or captured man is put to the enemy commander who stood at the end of the day; a commander who was himself
  // slain or taken on this field is not (a slot says who did it only when it is so: the fact log is history)
  const fell = new Set(B.fates.filter((f) => f.fate === 'slain' || f.fate === 'captured').map((f) => f.c.id));
  const cmdOf = (p) => (p.commander && state.characters[p.commander]?.alive && !fell.has(p.commander) ? p.commander : null);
  for (const { c, fate } of B.fates) {
    const theirs = [win.members || [], win.commander].flat().includes(c.id) ? win : lose; const foe = theirs === win ? lose : win;
    if (fate === 'slain') { changes.push({ op: 'character', id: c.id, alive: false, cause: `killed in battle near ${place?.name}`, how: 'battle', ...(cmdOf(foe) ? { by: cmdOf(foe) } : {}) }); fates.push(`${c.name} was slain`); }
    else if (fate === 'captured' && state.parties[foe.id] && !(B.wiped && foe === lose)) { changes.push({ op: 'character', id: c.id, status: 'imprisoned', loc: ref(foe.id), note: `Taken captive in battle near ${place?.name}`, by: cmdOf(foe) || foe.owner, place: place?.id }); fates.push(`${c.name} was taken captive`); }
    else if (fate === 'wounded' || fate === 'captured') { changes.push({ op: 'character', id: c.id, status: 'wounded', note: `Wounded in battle near ${place?.name}` }); fates.push(`${c.name} was wounded`); }
  }
  // the men who held back or turned leave the host they came with
  for (const b of betray) {
    changes.push({ op: 'army_update', army: b.side.id, delta: -Math.min(b.men, Math.max(0, b.side.men - (b.side === win ? winLoss : loseLoss) - 1)), cause: 'battle' });
    if (b.side.contingents) delete b.side.contingents[b.vid];
    const lordName = state.characters[state.houses[b.vid]?.lord]?.name || `House ${state.houses[b.vid]?.name}`;
    fates.push(b.turn ? `${lordName}'s men turned on their own side at the height of the battle` : `${lordName}'s men held back and let others die`);
  }
  const name = `The Battle of ${place?.name || 'the field'}`;
  const W = state.houses[win.owner], L = state.houses[lose.owner];
  if (!B.drawn) {
    changes.push({ op: 'battle', name, at: place?.id, attacker: att.owner, defender: def.owner, victor: win.owner, losses: { [win.owner]: winLoss, [lose.owner]: loseLoss }, summary: `${W?.name} defeated ${L?.name}${B.wiped ? ', whose host was destroyed' : ''}.` });
    changes.push({ op: 'landmark', name, at: place?.id, kind: 'battle', note: `${W?.name} over ${L?.name}` });
  }
  changes.push({ op: 'relation', a: win.owner, b: lose.owner, delta: -8, reason: name });
  const season = state.world?.season || 'summer';
  const how = B.drawn ? pick([`Neither host would yield the field; at dusk both drew off, and the crows had the rest.`, `A long day of slaughter decided nothing: both hosts fell back to count their dead.`], r)
    : pick(B.broken
      ? [`The ${L?.name} line broke at the first charge and never re-formed.`, `It was over before noon: the ${L?.name} host was outnumbered and outfought, and knew it.`]
      : B.m > 0.3 ? [`The fighting lasted until dusk; the ${L?.name} left fell back first, and the rest followed.`, `A flank charge by the ${W?.name} knights decided a hard day.`]
        : [`It could have gone either way — the ${L?.name} yielded the field only at nightfall.`, `A near thing: the ${W?.name} reserve came up at the last hour.`], r);
  const weather = { summer: 'under a hot sun', autumn: 'in the rain and mud', winter: 'in the snow', spring: 'across flooded fields' }[season];
  const ground = { forest: 'among the trees', marsh: 'in the bogs', hills: 'on broken hills', mountains: 'in the high passes', open: 'on open ground' }[B.site.ground] || '';
  const decided = B.decided.length ? ` What decided it: ${B.decided.join(' and ')}.` : '';
  const spoils = B.spoils ? ` ${W?.name} took the ${L?.name} baggage.` : '';
  const details = B.drawn
    ? `${how} Fought ${ground} ${weather}; ${att.name} (${fmt(att.men)}) against ${def.name} (${fmt(def.men)}). ${W?.name} lost ~${fmt(winLoss)}; ${L?.name} ~${fmt(loseLoss)}.${fates.length ? ' ' + fates.join('; ') + '.' : ''}`
    : `${how} Fought ${ground} ${weather}${surprise ? ', the attack falling on an enemy who did not see it coming' : ''}; ${att.name} (${fmt(att.men)}) against ${def.name} (${fmt(def.men)}). ${W?.name} lost ~${fmt(winLoss)}; ${L?.name} lost ~${fmt(loseLoss)}${B.pursuit ? ' (many cut down in the pursuit)' : ''}${B.wiped ? ' — the host is no more' : ' and are falling back'}.${spoils}${decided}${fates.length ? ' ' + fates.join('; ') + '.' : ''}`;
  const mine = [win.owner, lose.owner].includes(state.meta.player);
  const report = { outcome: B.outcome, odds: Math.round(B.odds * 100) / 100, fortune: Math.round(B.fortune * 100) / 100, ground: B.site.ground, surprise, caught, stances, decided: B.decided, pursuit: Math.round(B.pursuit * 100) / 100, spoils: B.spoils, power: { [att.id]: Math.round(B.a.power), [def.id]: Math.round(B.d.power) } };
  const title = B.drawn ? `A bloody draw near ${place?.name}` : `${W?.name} victorious near ${place?.name}`;
  const text = B.drawn ? `${att.name} and ${def.name} fought near ${place?.name} until neither could fight on.` : `${win.name} ${B.wiped ? 'destroyed' : B.broken ? 'routed' : 'defeated'} ${lose.name}${fates.length ? '; ' + fates[0] : ''}.`;
  // the slots a headline is written from (docs/gdd/18-headlines.md §3.1): the houses behind the two hosts, and what decided
  // it — the first of the factors the report already weighs (a win with none furthest from even was the day's fortune)
  const slots = B.drawn ? { winnerHouse: null, loserHouse: null } : { winnerHouse: win.owner, loserHouse: lose.owner, how: B.decided[0] || 'fortune' };
  const event = fact(state, 'battle', { title, text, details, where: place?.id, importance: mine ? 5 : 4, type: 'war', houses: [win.owner, lose.owner], day: days > 1 ? 1 + Math.floor(r() * days) : 1 }, { actors: [att.commander, def.commander], data: { attacker: att.id, defender: def.id, winner: B.drawn ? null : win.id, loser: B.drawn ? null : lose.id, wiped: B.wiped, lost: { [win.id]: winLoss, [lose.id]: loseLoss }, ...report, ...slots }, pos: place?.pos });
  // the dead and the taken are told with the battle they fell in (world.js `note` puts it on their facts)
  for (const c of changes) if (c.op === 'character') c.battle = event.fact;
  if (B.broken && !B.wiped) fact(state, 'rout', { title: `${lose.name} routed`, text: `${lose.name} breaks and flees the field near ${place?.name}.`, where: place?.id, houses: [lose.owner, win.owner], day: event.day }, { actors: [lose.commander], data: { party: lose.id }, alongside: event.fact });
  return { changes, event, B };
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// the enemy hosts a host has already stood off or fallen back from, while they stay in reach: told once, not daily
const faces = (p, q) => Array.isArray(p.facing) && p.facing.includes(q.id);
const face = (p, q) => { p.facing = [...new Set([...(Array.isArray(p.facing) ? p.facing : []), q.id])]; };

/** A host that will not give battle falls back toward a friendly holding (07 §7.1). */
function withdraw(state, p, foe) {
  const to = fallBack(state, p); if (!to) return [];
  // a company of riders slipping away is no news; a host refusing battle is
  if (p.men < 500 && ![p.owner, foe.owner].includes(state.meta.player)) return [];
  const f = fact(state, 'withdrew', { title: `${p.name} will not give battle`, text: `${p.name} falls back before ${foe.name}, making for ${state.holdings[to]?.name}.`, where: to, houses: [p.owner, foe.owner], day: 1 }, { actors: [p.commander], data: { party: p.id, from: foe.id, to }, cause: { type: 'rule', ref: 'battle' } });
  return [p.owner, foe.owner].includes(state.meta.player) ? [f] : [];
}
/** Two hosts in reach of each other, and neither will attack. */
function standOff(state, a, b) {
  const place = nearestHolding(state, a.pos);
  return fact(state, 'stand_off', { title: `${a.name} and ${b.name} face each other`, text: `${a.name} and ${b.name} stand in sight of each other near ${place?.name}; neither will begin it.`, where: place?.id, houses: [a.owner, b.owner], day: 1 }, { actors: [a.commander, b.commander], data: { a: a.id, b: b.id }, cause: { type: 'rule', ref: 'battle' } });
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
    if (a.aboard || b.aboard) continue; // soldiers aboard ship fight only as their fleet does
    if (skip.has(a.owner) && skip.has(b.owner)) continue;
    const d = dist(a.pos, b.pos); if (d <= CONTACT * (a.kind === 'fleet' ? 1.6 : 1)) pairs.push([d, a, b]);
  }
  pairs.sort((x, y) => x[0] - y[0]);
  for (const [, a, b] of pairs) {
    if (fought.has(a.id) || fought.has(b.id) || !state.parties[a.id] || !state.parties[b.id]) continue;
    const aMoving = a.march && !b.march, bMoving = b.march && !a.march;
    let att, def, caught = false; const stances = {};
    if (a.kind === 'fleet') {
      // fleets meet at sea (engine/military/naval.js): the stronger gives battle at 1.2, or one sent against the other
      const pa = navalPower(state, a), pb = navalPower(state, b);
      const aGoes = (a.march && idOf(a.march.to) === b.id) || pa >= pb * 1.2, bGoes = (b.march && idOf(b.march.to) === a.id) || pb >= pa * 1.2;
      if (!aGoes && !bGoes) continue;
      const cards = fightAtSea(state, aGoes ? a : b, aGoes ? b : a, r, 1);
      events.push(...cards); fought.add(a.id); fought.add(b.id); continue;
    }
    else {
      // each commander takes his stance (engine/military/battle.js): give battle, hold his ground, or fall back
      const oa = reckon(state, a, b).odds, ob = reckon(state, b, a).odds;
      // a host with nowhere to fall back to (it stands in its refuge already) holds its ground: cornered
      const cornered = (p, st) => (st === 'withdraw' && (!refugeOf(state, p) || p.at === refugeOf(state, p)) ? 'hold' : st);
      const sa = cornered(a, stanceOf(state, a, b, oa)), sb = cornered(b, stanceOf(state, b, a, ob)); stances[a.id] = sa; stances[b.id] = sb;
      if (sa === 'attack' && sb === 'attack') [att, def] = aMoving ? [a, b] : bMoving ? [b, a] : oa >= ob ? [a, b] : [b, a];
      else if (sa === 'attack') [att, def] = [a, b];
      else if (sb === 'attack') [att, def] = [b, a];
      else {
        // no one gives battle: whoever means to fall back does, and the rest stand and watch each other
        for (const [p, q, st] of [[a, b, sa], [b, a, sb]]) if (st === 'withdraw' && !faces(p, q)) events.push(...withdraw(state, p, q));
        if (sa !== 'withdraw' && sb !== 'withdraw' && !faces(a, b)) events.push(standOff(state, a, b));
        face(a, b); face(b, a);
        continue;
      }
      if (stances[def.id] === 'withdraw') {
        if (escapes(state, def, att, r)) { events.push(...withdraw(state, def, att)); face(def, att); fought.add(def.id); continue; }
        caught = true;
      }
    }
    // an attack the defender never saw coming: a host that marched unseen, in the woods (07 §7.4)
    const surprise = !!att.surprise || (groundAt(def.pos) === 'forest' && !seesParty(state, def.owner, att));
    // before Riverrun the besiegers lie in camps across the rivers: a relieving host meets them divided (07 §8.1)
    const divided = !!(def.besieging && rulesOf(state.holdings[def.besieging]).camps);
    const res = fight(state, att, def, days, r, { surprise, caught, stances, divided });
    // the battle tells its own fact; the dead, the taken and the broken hosts are recorded on the battle's day
    const out = applyChanges(state, res.changes, { source: 'The field of battle', battleHouses: new Set([a.owner, b.owner]), spanDays: days, told: ['battle'], on: res.event.day, alongside: res.event.fact, cause: { type: 'rule', ref: 'battle' } });
    applied.push(...out.applied); events.push(res.event); fought.add(a.id); fought.add(b.id);
    // after the battle (07 §7.5): the loser falls back toward a friendly holding; after a draw, both do
    const { win, lose, drawn } = res.B;
    for (const p of drawn ? [win, lose] : [lose]) if (state.parties[p.id] && p.kind !== 'fleet' && p.kind !== 'garrison') fallBack(state, p);
    delete att.surprise;
    for (const p of [win, lose]) if (state.parties[p.id]) { p.fought = state.meta.turn; p.facing = (p.facing || []).filter((x) => x !== (p === win ? lose : win).id); }
    if (state.parties[win.id] && !drawn) win.state = 'engaged';
    if (state.parties[lose.id] && !drawn) lose.state = 'routed';
  }
  // hosts no longer face anyone they faced
  for (const p of Object.values(state.parties)) if (p.facing) { p.facing = p.facing.filter((x) => state.parties[x] && dist(p.pos, state.parties[x].pos) <= CONTACT); if (!p.facing.length) delete p.facing; }
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
    const res = siegeTick(state, h, bes.sort((x, y) => y.men - x.men), days, r);
    const out = applyChanges(state, res.changes, { source: 'The siege lines', battleHouses: new Set(bes.map((a) => a.owner)), spanDays: days, told: ['holding'], cause: { type: 'rule', ref: 'siege' } });
    applied.push(...out.applied); events.push(...res.events);
  }
  // sieges with no one left outside the walls are lifted
  for (const h of Object.values(state.holdings)) {
    if (h.status !== 'besieged' || byHold.has(h.id)) continue;
    const near = armies().some((a) => a.kind !== 'fleet' && atWar(state, a.owner, h.owner) && dist(a.pos, h.pos) <= SIEGE_REACH);
    if (!near) { const out = applyChanges(state, [{ op: 'holding', id: h.id, status: 'normal', note: 'The siege is lifted' }], { cause: { type: 'rule', ref: 'siege' } }); applied.push(...out.applied); delete h.siege; }
  }
  return { events, applied };
}
