// The war room: grounds battles, sieges and marches in numbers so outcomes stay consistent.
// The simulator still decides what happens — this tells it (and the player) what is *likely*.
import { realmOf, placeName } from './world.js';

export const MILES_PER_UNIT = 1.5;           // Westeros is ~3,000 miles tall; the map ~2,000 units
const SPEED = { foot: 18, horse: 32, fleet: 60 }; // miles per day

export function atWar(state, a, b) {
  if (!a || !b || a === b) return false;
  const ra = realmOf(state, a), rb = realmOf(state, b);
  const side = (w, h, r) => (w.attackers.includes(h) || w.attackers.includes(r) ? 'A' : w.defenders.includes(h) || w.defenders.includes(r) ? 'D' : null);
  return state.wars.some((w) => { if (w.status === 'ended') return false; const sa = side(w, a, ra), sb = side(w, b, rb); return sa && sb && sa !== sb; });
}

function commanderMartial(state, a) {
  const c = a.commander && state.characters[a.commander];
  return c?.alive ? (c.skills?.[1] ?? 8) : 5;
}

/** Effective fighting strength of an army. */
export function strength(state, a) {
  const cav = /horse|cavalry|screamer|knight|rider/i.test(a.composition || '') ? 1.15 : 1;
  const quality = /men-at-arms|knights|heavy|gold cloak|unsullied|golden company/i.test(a.composition || '') ? 1.15 : /levies|farmers|smallfolk|wildling/i.test(a.composition || '') ? 0.85 : 1;
  const m = commanderMartial(state, a);
  return a.men * ((a.morale ?? 70) / 100) * (0.75 + m / 40) * (0.6 + 0.4 * (a.supply ?? 80) / 100) * cav * quality;
}

export function battleOdds(state, att, def, { fort = 0, terrain = 1 } = {}) {
  const sa = strength(state, att);
  const sd = strength(state, def) * (1 + fort * 0.45) * terrain;
  const p = sa ** 2 / (sa ** 2 + sd ** 2); // Lanchester-ish: numbers matter quadratically
  return { attacker: Math.round(p * 100), sa: Math.round(sa), sd: Math.round(sd) };
}

export function marchDays(a, from, to) {
  const d = Math.hypot(to[0] - from[0], to[1] - from[1]) * MILES_PER_UNIT * 1.12;
  const sp = a.type === 'fleet' ? SPEED.fleet : /horse|cavalry|screamer|rider/i.test(a.composition || '') && a.men < 8000 ? SPEED.horse : SPEED.foot;
  const slow = a.men > 15000 ? 0.8 : 1;
  return { miles: Math.round(d), days: Math.max(1, Math.round(d / (sp * slow))) };
}

/** Months a besieged holding can hold out: food, garrison and walls. */
export function siegeEstimate(state, holding, besiegers) {
  const owner = state.houses[holding.owner];
  const food = Math.min(Number(owner?.figures?.food?.v) || 6, 24);
  const garrison = holding.garrison ?? Math.round((owner?.figures?.menAtArms?.v || 200) * 0.5);
  const b = besiegers.reduce((s, a) => s + a.men, 0);
  const storm = holding.fort >= 4 ? (b > garrison * 12 ? 'storming possible at terrible cost' : 'cannot be stormed; only starved or betrayed') : b > garrison * 6 ? 'can be stormed' : 'storming would be bloody';
  return { months: Math.max(0.5, Math.round(food * (holding.fort >= 4 ? 1.2 : 0.8) * 10) / 10), garrison, besiegers: b, storm };
}

/** A textual war-room report for the prompt and the UI. */
export function warRoom(state) {
  const lines = [];
  const armies = Object.values(state.armies);
  // armies in contact
  const seen = new Set();
  for (const a of armies) for (const b of armies) {
    if (a.id >= b.id || !atWar(state, a.owner, b.owner)) continue;
    const d = Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1]);
    if (d > 40) continue;
    const key = [a.id, b.id].sort().join('|'); if (seen.has(key)) continue; seen.add(key);
    const o = battleOdds(state, a, b);
    lines.push(`CONTACT: ${a.name} (${a.owner}, ${a.men} men, morale ${a.morale}) vs ${b.name} (${b.owner}, ${b.men} men, morale ${b.morale}) — ${Math.round(d * MILES_PER_UNIT)} miles apart. If ${a.name} attacks in the field: ~${o.attacker}% to win.`);
  }
  // sieges & threatened holdings
  for (const h of Object.values(state.holdings)) {
    const bes = armies.filter((a) => a.type !== 'fleet' && atWar(state, a.owner, h.owner) && Math.hypot(a.pos[0] - h.pos[0], a.pos[1] - h.pos[1]) < 12);
    if (!bes.length && h.status !== 'besieged') continue;
    if (!bes.length) { lines.push(`${h.name} is marked besieged but no enemy host is near it — the siege should be lifted.`); continue; }
    const est = siegeEstimate(state, h, bes);
    lines.push(`SIEGE of ${h.name} (${h.owner}, walls ${h.fort}/6, garrison ~${est.garrison}) by ${bes.map((a) => `${a.name} ${a.men}`).join(', ')}: can hold ~${est.months} moons on its stores; ${est.storm}.`);
  }
  // marches under way
  for (const a of armies.filter((x) => x.dest)) {
    const m = marchDays(a, a.pos, a.dest);
    lines.push(`MARCH: ${a.name} → ${a.destName || 'destination'}: ~${m.miles} miles, ~${m.days} more days.`);
  }
  // guidance on distances for the player's hosts
  const p = state.meta.player;
  for (const a of armies.filter((x) => x.owner === p && x.type !== 'fleet' && x.men > 500)) {
    const foes = armies.filter((b) => atWar(state, a.owner, b.owner) && b.men > 300)
      .map((b) => ({ b, m: marchDays(a, a.pos, b.pos) })).sort((x, y) => x.m.days - y.m.days).slice(0, 3);
    if (foes.length) lines.push(`${a.name} (${a.men}): nearest enemies — ${foes.map(({ b, m }) => `${b.name} ${b.men} at ${b.at ? placeName(state, b.at) : 'the field'} (~${m.days} days' march; odds if attacking ~${battleOdds(state, a, b).attacker}%)`).join('; ')}.`);
  }
  return lines;
}
