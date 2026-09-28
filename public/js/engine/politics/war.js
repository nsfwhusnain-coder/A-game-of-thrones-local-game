// The state of war (docs/gdd/07-military.md §11; WP C8). Every war has a goal — the casus belli it was declared for —
// and a score, from −100 to 100 as the attackers see it, moved by what happens: battles won, castles taken, lords slain
// or captured, coasts reaved. A war in which no one fights for six moons goes cold. Peace is sued for with terms — a
// white peace (each keeps what it holds), a concession (the one who sues pays and frees its captives) or a demand (the
// other must concede) — and weighed by the score and the nature of the lord who must answer. When the score is lopsided
// the losing side sues on its own; if the lord is the one to answer, it is a matter for his word.
import { realmOf, applyChanges } from '../../shared/world.js';
import { temperament } from '../../shared/temperament.js';
import { fact } from '../facts/log.js';
import { dayNumber } from '../time.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmt = (n) => Math.round(n).toLocaleString('en-GB');

export const GOALS = {
  free_prisoner: 'to free a prisoner', claim_throne: 'to take the Iron Throne', independence: 'to be free of a liege',
  revenge: 'for revenge', conquest: 'for land', defend_vassal: 'to defend a sworn house',
};
export const TERMS = { white_peace: 'a white peace — each keeps what it holds', concede: 'to concede: pay, and free the captives', demand: 'that the other side concede' };

/** A war's goal from the words it was declared with. */
export function goalOf(reason = '') {
  const t = String(reason).toLowerCase();
  if (/independen|free of|freedom|secede|king in the north/.test(t)) return 'independence';
  if (/free|release|captive|prisoner|hostage|father|brother|son/.test(t)) return 'free_prisoner';
  if (/throne|crown|king|usurp/.test(t)) return 'claim_throne';
  if (/defend|protect|sworn|vassal|bannerm/.test(t)) return 'defend_vassal';
  if (/reveng|vengeance|avenge|insult|murder/.test(t)) return 'revenge';
  return 'conquest';
}

/** Which side of a war a house is on: 'A' (the attackers), 'D' (the defenders) or null — its realm counts. */
export function sideOf(state, w, house) {
  if (!house) return null; const r = realmOf(state, house);
  if (w.attackers.includes(house) || w.attackers.includes(r)) return 'A';
  if (w.defenders.includes(house) || w.defenders.includes(r)) return 'D';
  return null;
}
/** The score as one side sees it. */
export const scoreFor = (w, side) => (side === 'A' ? 1 : -1) * (w.score || 0);
/** Who answers for a side: its first house's lord (the war's leader on that side). */
export const leaderOf = (w, side) => (side === 'A' ? w.attackers[0] : w.defenders[0]);

// what moves a war's score, and for whom: [points, the side's house or null]
function weigh(state, f) {
  const d = f.data || {};
  const partyOwner = (id) => state.parties[id]?.owner || null;
  switch (f.kind) {
    case 'battle': return d.winner ? [10 + (d.wiped ? 5 : 0), partyOwner(d.winner) || f.houses[0]] : null;
    case 'sea_battle': return d.winner ? [6, partyOwner(d.winner) || f.houses[0]] : null;
    case 'holding_fell': { const h = state.holdings[d.holding]; const seat = Object.values(state.houses).some((x) => x.seat === d.holding); return [seat ? 15 : 8, d.by || h?.owner]; }
    case 'storm_assault': { if (!d.carried) return [3, f.houses[1]]; const seat = Object.values(state.houses).some((x) => x.seat === d.holding); return [seat ? 15 : 8, d.by]; } // carried: the castle taken
    case 'siege_lifted': return [4, f.houses[1]];
    case 'raid': return d.holding && !d.beaten ? [2, f.houses[0]] : null;
    case 'captured_in_battle': case 'slain_in_battle': {
      const c = state.characters[f.actors[0]]; if (!c) return null;
      const big = state.houses[c.house]?.lord === c.id || (c.roles || []).includes('heir');
      return [4 + (big ? (f.kind === 'slain_in_battle' ? 8 : 6) : 0), null, c.house]; // a point for the other side
    }
    default: return null;
  }
}

/** A day of the realm's wars: scores moved by today's deeds, wars gone cold, and (weekly) peace sued for. */
export function warTick(state, r) {
  const events = []; const today = dayNumber(state.meta.date);
  const facts = (state.facts || []).filter((f) => f.day === today);
  for (const w of state.wars || []) {
    if (w.status === 'ended') continue;
    w.score = w.score || 0; w.lastAction = w.lastAction ?? dayNumber(parse(state, w.started));
    // each deed counted once (a day may be reckoned again after a stop, or in a test)
    if (w.tally?.day !== today) w.tally = { day: today, ids: [] };
    for (const f of facts) {
      if (w.tally.ids.includes(f.id)) continue; w.tally.ids.push(f.id);
      const x = weigh(state, f); if (!x) continue;
      const [pts, gainer, loserHouse] = x;
      let side = gainer ? sideOf(state, w, gainer) : null;
      if (!side && loserHouse) { const ls = sideOf(state, w, loserHouse); side = ls === 'A' ? 'D' : ls === 'D' ? 'A' : null; }
      if (!side || !pts) continue;
      // only what happens between the two sides of this war counts for it
      if (!f.houses.some((h) => sideOf(state, w, h) && sideOf(state, w, h) !== side) && f.kind !== 'captured_in_battle' && f.kind !== 'slain_in_battle') continue;
      w.score = clamp(w.score + (side === 'A' ? pts : -pts), -100, 100); w.lastAction = today;
      if (w.cold) { delete w.cold; }
    }
    if (!w.cold && today - w.lastAction >= 180) {
      w.cold = true;
      events.push(fact(state, 'cold_war', { title: `${w.name} goes cold`, text: `Six moons have passed in ${w.name} without a blow struck. The war is not over; it only sleeps.`, houses: [...w.attackers, ...w.defenders], day: 1 }, { data: { war: w.id, score: w.score }, cause: { type: 'rule', ref: 'war' } }));
    }
  }
  if (today % 7 === 0) events.push(...suesForPeace(state, r));
  return { events };
}
const parse = (state, s) => { const m = String(s || '').match(/(\d+) (\d+)\w* moon, (\d+)/); return m ? { day: +m[1], month: +m[2], year: +m[3] } : state.meta.date; };

/**
 * Whether the other side takes these terms: { p, accepted, why }. `side` is the side that must answer. A white peace
 * suits a side that is not winning; a concession offered to it suits it unless it is badly beaten; a demand it takes only
 * when it is losing badly. Pride and stubbornness hold out; a war long and cold wears everyone down.
 */
export function weighPeace(state, w, side, terms, r) {
  const s = scoreFor(w, side); const lord = state.characters[state.houses[leaderOf(w, side)]?.lord]; const T = lord ? temperament(lord) : null;
  const age = dayNumber(state.meta.date) - (w.lastAction ?? dayNumber(parse(state, w.started)));
  let p = terms === 'white_peace' ? 0.45 - s / 60 : terms === 'concede' ? 0.7 + s / 150 : clamp((-s - 30) / 50, 0, 0.95);
  if (w.cold) p += 0.2; else if (age > 90) p += 0.1;
  if (T) p -= 0.15 * (T.pride ?? 0.5) + 0.1 * (T.stubborn ?? 0.5) - 0.1 * (T.warmth ?? 0.5);
  p = clamp(p, 0.02, 0.97);
  const accepted = r() < p;
  const why = s >= 40 ? 'they are winning' : s <= -40 ? 'they are beaten' : w.cold ? 'the war has gone cold' : 'the war is undecided';
  return { p, accepted, why };
}

/**
 * The peace, as changes to the world: the war ends; under a concession the side that concedes pays the other up to three
 * moons of its income and frees its captives; under a white peace both free theirs; each keeps what it holds.
 */
export function peaceOps(state, w, { conceder = null } = {}) {
  const winner = conceder === 'A' ? 'D' : conceder === 'D' ? 'A' : null;
  const ch = []; let tribute = 0;
  if (conceder) {
    const L = state.houses[leaderOf(w, conceder)], W = state.houses[leaderOf(w, winner)];
    tribute = Math.max(0, Math.min(Number(L?.figures?.treasury?.v) || 0, 3 * Math.max(0, Number(L?.figures?.income?.v) || 0)));
    if (tribute) ch.push({ op: 'figure', house: L.id, field: 'treasury', delta: -tribute }, { op: 'figure', house: W.id, field: 'treasury', delta: tribute });
  }
  // captives go home: the conceder's prisoners to the winner's side, or both ways in a white peace
  for (const c of Object.values(state.characters)) {
    if (!c.alive || !/imprisoned|captive/.test(c.status || '')) continue;
    const held = sideOf(state, w, c.house); if (!held) continue;
    const keeper = state.parties[String(c.loc || '').replace(/^party:/, '')]?.owner || state.holdings[c.loc]?.owner;
    const ks = sideOf(state, w, keeper); if (!ks || ks === held) continue;
    if (conceder && ks !== conceder) continue;
    ch.push({ op: 'character', id: c.id, status: 'free', loc: state.houses[c.house]?.seat || c.loc, note: `Freed by the peace that ended ${w.name}` });
  }
  ch.push({ op: 'war', status: 'end', id: w.id, outcome: conceder ? `House ${state.houses[leaderOf(w, conceder)]?.name} concedes${tribute ? ` and pays ${fmt(tribute)} dragons` : ''}` : 'a white peace: each keeps what it holds' });
  ch.push({ op: 'relation', a: w.attackers[0], b: w.defenders[0], delta: 10, reason: 'the peace' });
  return { ops: ch, tribute };
}
export function makePeace(state, w, terms, { conceder = null, cause } = {}) {
  const { ops, tribute } = peaceOps(state, w, { conceder });
  applyChanges(state, ops, { source: 'The peace', cause: cause || { type: 'rule', ref: 'war' }, playerChoseAllegiance: true });
  return { tribute };
}

/** The losing side of a lopsided war sues for peace (weekly): the lord answers it as a matter; the realm's lords weigh it. */
function suesForPeace(state, r) {
  const events = []; const today = dayNumber(state.meta.date); const p = state.meta.player;
  for (const w of state.wars || []) {
    if (w.status === 'ended' || Math.abs(w.score || 0) < 50 || today - (w.offered || 0) < 30) continue;
    if (today - dayNumber(parse(state, w.started)) < 30) continue;
    const loser = w.score > 0 ? 'D' : 'A', winner = loser === 'A' ? 'D' : 'A';
    const L = leaderOf(w, loser), W = leaderOf(w, winner);
    w.offered = today;
    if (L === p) continue; // the lord sues for himself, or fights on
    if (W === p) {
      const LH = state.houses[L]; const { ops, tribute } = peaceOps(state, w, { conceder: loser });
      applyChanges(state, [{ op: 'decision', id: `peace_${w.id}`, title: `House ${LH?.name} sues for peace`, from: LH?.lord, days: 14,
        text: `Beaten in ${w.name}, House ${LH?.name} sends to ask for peace: it will concede, pay ${fmt(tribute)} dragons and free the captives it holds.`,
        options: [
          { label: 'Accept their surrender', hint: `The war ends; ${fmt(tribute)} dragons; your people freed`, fx: [{ ops }] },
          { label: 'Fight on', hint: 'Finish what you began', fx: [] },
        ] }], { source: 'The war' });
      continue;
    }
    const answer = weighPeace(state, w, winner, 'concede', r);
    if (answer.accepted) {
      makePeace(state, w, 'concede', { conceder: loser });
      const f = fact(state, 'peace_sued', { title: `House ${state.houses[L]?.name} sues for peace`, text: `Beaten in ${w.name}, House ${state.houses[L]?.name} concedes to House ${state.houses[W]?.name}.`, houses: [L, W], day: 1 }, { data: { war: w.id, terms: 'concede', accepted: true }, cause: { type: 'rule', ref: 'war' } });
      if ([L, W].includes(p) || state.houses[L]?.liege === p || state.houses[W]?.liege === p) events.push(f);
    }
  }
  return events;
}
