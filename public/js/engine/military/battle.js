// Battle (docs/gdd/07-military.md §7; WP C4), grown from shared/battles.js. When two hostile hosts come within reach,
// each commander takes a stance — give battle, hold his ground, or fall back — by his standing orders, his nature and
// the odds as he sees them. If one gives battle, the engine fights it: each side's power from its knights, riders, foot
// and bowmen on this ground, its commander, heart and bread, the lie of the land and surprise; the odds, the day's
// fortune (±12 % a side) and the outcome — a crushing victory, a victory, a bloody draw — and what follows: the losses,
// the pursuit, the baggage taken, the lords slain, taken or wounded (the story's own people kept for their canon end),
// the loser's retreat. The battle report says what decided it. The model narrates; it never changes a man of it.
import { unitsOf } from '../../shared/units.js';
import { temperament } from '../../shared/temperament.js';
import { difficultyOf } from '../../../data/balance.js';
import { CANON_DEATHS, CANON_PROTECTED } from '../../../data/fates.js';
import { groundAt, paceOf, planRoute } from '../movement.js';
import { idOf, settle } from '../parties.js';
import { supplyOf, fedByRations, feeds, trainOf, capacityOf } from './supply.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// ── Power (§7.2) ─────────────────────────────────────────────────────────────────────────────────────────────────────
export const WEIGHT = { levy: 1, maa: 1.6, clansman: 1.3, archer: 1.2, horse: 1.6, knight: 4 };
export const STANDING = { favourable: 'Engage if the odds favour us', always: 'Always engage', avoid: 'Avoid battle', hold: 'Hold ground' };
const NOISE = 0.12;                      // the day's fortune, a side
const WIN = 1.1, CRUSH = 2.5;            // the odds of a victory and of a crushing one; between 1/1.1 and 1.1, a bloody draw

/** What a host's foot are: levies, men-at-arms, or mountain clansmen. */
function footOf(p) {
  const c = String(p.composition || '');
  if (/clans?(men)?\b|burned men|stone crows|moon brothers|black ears|painted dogs/i.test(c)) return 'clansman';
  if (/men-at-arms|household|guard|gold cloak|sworn swords|sellswords|company|unsullied/i.test(c) && !/levies/i.test(c)) return 'maa';
  return 'levy';
}
const martialOf = (state, p) => { const c = p.commander && state.characters[p.commander]; return c?.alive ? (c.skills?.[1] ?? 8) : 5; };
const breadOf = (state, p) => {
  if (fedByRations(state, p)) { const w = supplyOf(state, p).word; return w === 'starving' ? 0.7 : w === 'short' ? 0.9 : 1; }
  const s = p.supply ?? 80; return s < 35 ? 0.7 : s < 60 ? 0.9 : 1;
};

/**
 * A side's power on this ground: { power, parts } — `parts` the factors the report weighs (men by class, commander,
 * heart, bread, ground, walls, surprise, the realm's difficulty for the player).
 * ctx: { role: 'attacker' | 'defender', ground, surprise, fort, caught (a host caught falling back) }
 */
export function powerOf(state, p, { role = 'attacker', ground = 'open', surprise = false, fort = 0, caught = false, divided = false } = {}) {
  const u = unitsOf(state, p); const foot = footOf(p);
  const rough = ground === 'forest' || ground === 'marsh'; const high = ground === 'hills' || ground === 'mountains';
  const w = {
    knights: WEIGHT.knight * (rough ? 0.5 : 1),
    horse: WEIGHT.horse,
    foot: foot === 'clansman' ? WEIGHT.clansman * (high ? 1.6 : 1) : WEIGHT[foot],
    archers: WEIGHT.archer * (role === 'defender' && (high || fort) ? 1.4 : 1),
  };
  const men = u.knights * w.knights + u.horse * w.horse + u.foot * w.foot + u.archers * w.archers;
  const parts = {
    men,
    commander: 1 + (martialOf(state, p) - 10) * 0.03,
    heart: 0.6 + (p.morale ?? 70) / 250,
    bread: breadOf(state, p),
    ground: role === 'defender' && high ? 1.25 : role === 'attacker' && high ? 0.85 : 1,
    walls: role === 'defender' && fort ? 1 + Math.min(0.6, fort * 0.1) : 1,
    // surprise is worth ×1.6 in the first of the battle's two phases: over the day, the square root of it
    surprise: surprise ? Math.sqrt(1.6) : 1,
    caught: caught ? 0.85 : 1,
    divided: divided ? 0.75 : 1,       // a siege host in its camps across the rivers (Riverrun)
    difficulty: p.owner === state.meta.player ? difficultyOf(state).odds : 1,
  };
  const power = Object.values(parts).reduce((x, v) => x * v, 1);
  return { power, parts };
}

/** The site of a battle between two hosts: where the defender stands, its ground, and the walls if it is his own. */
export function siteOf(state, att, def) {
  const at = def.at && state.holdings[def.at];
  let place = at; if (!place) { let d = Infinity; for (const h of Object.values(state.holdings)) { const x = dist(h.pos, def.pos); if (x < d) { d = x; place = h; } } }
  const own = at && at.owner === def.owner;
  return { place, ground: groundAt(def.pos || place?.pos || [0, 0]), fort: own ? at.fort || 0 : 0 };
}

/** The chance of each outcome at these odds: { win, draw, lose } for the side whose odds they are. */
export function chances(odds) {
  const p = (x) => clamp((1 - (x / odds - 1) / (2 * NOISE)) / 2, 0, 1); // P(odds × (1 + 2·NOISE·u) ≥ x), u ∈ [−1, 1]
  const win = p(WIN); const notLose = p(1 / WIN);
  return { win, draw: Math.max(0, notLose - win), lose: 1 - notLose };
}

/** The odds as a war room reckons them (the host card's "if you attack"): power, ratio and chances. */
export function reckon(state, att, def, { surprise = false } = {}) {
  const site = siteOf(state, att, def);
  const a = powerOf(state, att, { role: 'attacker', ground: site.ground, surprise });
  const d = powerOf(state, def, { role: 'defender', ground: site.ground, fort: site.fort });
  const odds = a.power / Math.max(1, d.power);
  return { odds, a, d, site, ...chances(odds) };
}

// ── Stances (§7.1) ───────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * What a host does on meeting this enemy: 'attack' | 'hold' | 'withdraw'. A host sent against this very host attacks;
 * the lord's standing orders speak for his own hosts; else its commander's nature and the odds: attack at 1.2 (the
 * reckless at 1.0, the cautious at 1.5), fall back below 0.7.
 */
export function stanceOf(state, p, foe, odds) {
  if (p.march && idOf(p.march.to) === foe.id) return 'attack';
  if (['retinue', 'progress', 'caravan', 'envoy', 'rider'].includes(p.kind)) return 'withdraw';
  if (p.kind === 'garrison') return 'hold';
  // the lord's own hosts keep his standing orders; left unsaid, they fight when the odds favour them
  const so = p.standing || (p.owner === state.meta.player || p.serving === state.meta.player ? 'favourable' : null);
  if (so === 'always') return 'attack';
  if (so === 'hold') return 'hold';
  if (so === 'avoid') return p.state === 'besieging' ? 'hold' : 'withdraw';
  const c = p.commander && state.characters[p.commander]; const T = c && !so ? temperament(c) : null;
  const want = so === 'favourable' ? 1.2 : T ? (T.courage >= 0.75 ? 1.0 : T.courage <= 0.3 ? 1.5 : 1.2) : 1.2;
  if (odds >= want) return 'attack';
  // a siege is not given up for a host that has not yet attacked it
  if (odds < 0.7 && p.state !== 'besieging') return 'withdraw';
  return 'hold';
}

/** Whether a host falling back gets clear: a faster host outruns a slower, a slow one is caught. */
export function escapes(state, runner, chaser, r) {
  const k = paceOf(state, runner) / Math.max(1, paceOf(state, chaser));
  return r() < clamp(0.2 + 0.5 * k, 0.1, 0.9);
}

/** Where a beaten or withdrawing host goes: the nearest holding that will take it in, else home. */
export function refugeOf(state, p) {
  const ok = Object.values(state.holdings).filter((h) => feeds(state, p, h)).sort((a, b) => dist(a.pos, p.pos) - dist(b.pos, p.pos));
  return ok[0]?.id || state.houses[p.owner]?.seat || null;
}
export function fallBack(state, p) {
  const to = refugeOf(state, p); if (!to || !state.holdings[to]) return null;
  if (p.at === to) return to;
  delete p.besieging; p.march = { to, since: state.meta.turn }; p.at = null; p.wait = undefined; delete p.wait;
  planRoute(state, p, state.holdings[to].pos, to, { toName: state.holdings[to].name }); settle(state, p);
  return to;
}

// ── The story's people (§7.3; 08 §5) ─────────────────────────────────────────────────────────────────────────────────
const ymOf = (d) => d.year * 12 + (d.month - 1);
/** Whether the story keeps this person from death in a battle today: 'canon' (their end is later), 'protected', or null. */
export function keptByStory(state, c, { playerBattle = false } = {}) {
  const g = state.meta.settings?.canonGravity || 'canon';
  if (g === 'sandbox' || !c) return null;
  const w = CANON_DEATHS[c.id]; const now = ymOf(state.meta.date);
  if (w && now <= w.to[0] * 12 + w.to[1] - 1 && (g === 'canon' || w.pillar)) return 'canon';
  if (g === 'canon' && CANON_PROTECTED.includes(c.id) && !(playerBattle && c.house === state.meta.player)) return 'protected';
  return null;
}
const FIGHTING = /lord|heir|knight|kingsguard|commander|captain|master_at_arms|ruler|bastard/;
const fights = (c) => FIGHTING.test((c.roles || []).join(' ')) && (c.age ?? 30) >= 15 && (c.sex !== 'f' || /knight|captain|commander/.test((c.roles || []).join(' ')));

/**
 * The fates of the named people of a side: [{ c, fate: 'slain' | 'captured' | 'wounded' }]. `side`: 'won' | 'lost' |
 * 'drew'; `broken` for a rout. Commanders taken 25 % and slain 8 % on the losing side, knights and lords 15 % and 5 %,
 * the rest 10 % and 1 %; on the winning side 2 % of the fighting men fall; one in ten of those who fought is hurt.
 */
export function fatesOf(state, p, side, { broken = false, playerBattle = false, r }) {
  const out = [];
  for (const id of new Set([p.commander, ...(p.members || [])].filter(Boolean))) {
    const c = state.characters[id]; if (!c?.alive || /imprisoned|captive/.test(c.status || '')) continue;
    const cmd = id === p.commander; const fighter = cmd || fights(c);
    const k = broken ? 1.5 : 1;
    const [take, slay] = side === 'lost' ? (cmd ? [0.25, 0.08] : fighter ? [0.15, 0.05] : [0.1, 0.01]).map((x) => x * k) : side === 'drew' ? (fighter ? [0.05, 0.03] : [0, 0]) : [0, fighter ? 0.02 : 0];
    const roll = r(); let fate = roll < slay ? 'slain' : roll < slay + take ? 'captured' : fighter && roll < slay + take + 0.1 ? 'wounded' : null;
    if (fate === 'slain' && keptByStory(state, c, { playerBattle })) fate = side === 'lost' ? 'captured' : 'wounded';
    if (fate) out.push({ c, fate });
  }
  return out;
}

// ── The battle (§7.2, §7.5) ──────────────────────────────────────────────────────────────────────────────────────────
const NAMES = { men: 'numbers and arms', commander: 'generalship', heart: 'the men\'s heart', bread: 'hunger', ground: 'the ground', walls: 'the walls', surprise: 'surprise', caught: 'being caught on the march', divided: 'the besiegers divided in their camps', difficulty: 'fortune' };
/** What decided a battle, in the winner's favour: the two factors furthest from even. */
export function decisive(win, lose) {
  return Object.keys(win.parts).map((k) => [k, win.parts[k] / Math.max(1e-9, lose.parts[k])]).filter(([, x]) => x > 1.04)
    .sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => NAMES[k]);
}

/**
 * Fight a battle: `att` attacks `def`. Returns { outcome, win, lose, odds, fortune, lost: {id: men}, pursuit, fates,
 * decided, site, spoils, wiped, broken, a, d } — the numbers only; the caller applies them (shared/battles.js).
 */
export function resolveBattle(state, att, def, { r, surprise = false, caught = false, divided = false } = {}) {
  const site = siteOf(state, att, def);
  const a = powerOf(state, att, { role: 'attacker', ground: site.ground, surprise });
  const d = powerOf(state, def, { role: 'defender', ground: site.ground, fort: site.fort, caught, divided });
  const odds = a.power / Math.max(1, d.power);
  // the day's fortune: ±12 % a side, taken together (the war room's chances reckon the same)
  const fortune = 1 + 2 * NOISE * (2 * r() - 1);
  const eff = odds * fortune;
  const drawn = eff < WIN && eff > 1 / WIN;
  const aWins = eff >= WIN;
  const [win, lose, wp, lp] = aWins || drawn ? [att, def, a, d] : [def, att, d, a];
  const e = aWins || drawn ? eff : 1 / eff; // the victor's odds on the day
  const m = clamp((e - WIN) / (CRUSH - WIN), 0, 1); // 0 a hard-won field, 1 a crushing one
  const broken = !drawn && e >= CRUSH;
  const outcome = drawn ? 'draw' : broken ? 'crushing' : 'victory';
  const horse = (u) => (u.knights + u.horse) / Math.max(1, u.knights + u.horse + u.foot + u.archers);
  let winFrac, loseFrac, pursuit = 0;
  if (drawn) { const close = 1 - Math.abs(Math.log(eff)) / Math.log(WIN); winFrac = loseFrac = 0.08 + 0.07 * close; }
  else {
    winFrac = 0.2 - 0.15 * m; loseFrac = 0.15 + 0.25 * m;
    const h = horse(unitsOf(state, win)); if (h >= 0.1) pursuit = (0.05 + 0.15 * m) * Math.min(1, h / 0.3);
  }
  const lost = { [win.id]: Math.round(win.men * winFrac), [lose.id]: Math.round(lose.men * Math.min(0.85, loseFrac + pursuit)) };
  const wiped = !drawn && lose.men - lost[lose.id] < Math.max(150, lose.men * 0.15);
  const playerBattle = [att.owner, def.owner].includes(state.meta.player);
  const fates = drawn
    ? [...fatesOf(state, att, 'drew', { r, playerBattle }), ...fatesOf(state, def, 'drew', { r, playerBattle })]
    : [...fatesOf(state, win, 'won', { r, playerBattle }), ...fatesOf(state, lose, 'lost', { broken: broken || wiped, r, playerBattle })];
  // the victor takes the loser's baggage: half its bread, as much as the wagons will carry
  let spoils = 0;
  if (!drawn && fedByRations(state, win) && fedByRations(state, lose)) {
    trainOf(state, win); trainOf(state, lose);
    spoils = Math.max(0, Math.min(Math.round(lose.rations * (wiped ? 1 : 0.5)), capacityOf(win) - win.rations));
  }
  return { outcome, drawn, win, lose, odds, fortune, eff, m, lost, pursuit, fates, decided: drawn ? [] : decisive(wp, lp), site, spoils, wiped, broken, a, d, winFrac, loseFrac };
}

export const standingText = (p) => STANDING[p?.standing] || null;
