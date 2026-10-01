// What a lord of the realm could do now (docs/gdd/04-ai-system.md §5.2, 09 §2). A mind — the model's or a house's
// behaviour tree — only ever chooses among these: the registry's verbs a mind may use, each with the targets that are
// lawful for this actor at this moment (every candidate is checked with the verb's own legal()), and `wait`: to keep
// one's counsel and let the days pass. Nothing here changes the world.
import { VERBS, intentFor, check } from '../actions/registry.js';
import { commands } from '../actions/military.js';
import { atWar } from '../../shared/warfare.js';
import { getRelation, placeName, resolvePlaceId, realmOf } from '../../shared/world.js';
import { PROJECT_TEMPLATES } from '../../shared/economy.js';
import { MILES_PER_UNIT } from '../../../data/geography.js';
import { dayNumber } from '../time.js';
import { hostsKnownTo } from '../knowledge.js';
import { canonLocked, canonAhead } from '../../shared/plots.js';
import { realmSummary } from '../realm/brief.js';

// How long a house lets pass before doing the same thing again (days): a tourney is an event of the year, a feast of
// the season; taxes are not changed every week, nor gifts sent, nor a son sent riding off each Monday.
export const RESTING = { hold_tourney: 300, hold_feast: 90, send_gift: 120, set_tax: 120, set_dues: 90, send_person: 45, fund_works: 60, hire_men: 60, call_banners: 60, disband_host: 30 };
/** A house did this lately (its mind's memory, `state.minds.done`). */
export const rested = (state, house, verb) => { const d = state.minds?.done?.[house]?.[verb]; return d == null || dayNumber(state.meta.date) - d >= (RESTING[verb] || 0); };
/** Remember that a house did this today. */
export function remember(state, house, verb) {
  state.minds = state.minds || {}; const done = state.minds.done = state.minds.done || {};
  done[house] = { ...(done[house] || {}), [verb]: dayNumber(state.meta.date) };
}

/** The verbs a mind may choose (the registry says which: `mind.allowed`), and `wait` — 04 §5.2's "hold", renamed
 * because "hold" is a prefix of `hold_feast` and a grammar would let a model stop short on it (04 §3.1). */
export const MIND_VERBS = Object.values(VERBS).filter((v) => v.mind?.allowed).map((v) => v.id);
export const HOLD = 'wait';

/** Who speaks for a house now: its regent while the lord is a child or a captive, else its lord. */
export const actorOf = (state, hid) => { const h = state.houses[hid]; const r = state.characters[h?.regent]; return r?.alive ? r : state.characters[h?.lord]?.alive ? state.characters[h.lord] : null; };
const miles = (a, b) => (a && b ? Math.hypot(a[0] - b[0], a[1] - b[1]) * MILES_PER_UNIT : Infinity);
const posOf = (state, id) => state.holdings[id]?.pos || state.parties[String(id).replace(/^party:/, '')]?.pos || null;
const gold = (h) => Math.round(Number(h?.figures?.treasury?.v) || 0);

/**
 * The world as one lord sees it for a decision: their house, liege, vassals, hosts, holdings, wars and foes, friends,
 * prisoners, coin and levies — the facts the options and the behaviour trees are built from.
 */
export function worldView(state, actorId) {
  const actor = state.characters[actorId]; const hid = actor?.house; const me = state.houses[hid];
  if (!actor || !me) return null;
  const seat = me.seat && state.holdings[me.seat] ? me.seat : null;
  const home = posOf(state, seat) || actor.pos || null;
  const holdings = Object.values(state.holdings).filter((h) => h.owner === hid).map((h) => h.id);
  const vassals = Object.values(state.houses).filter((h) => h.liege === hid && state.characters[h.lord]?.alive);
  // who this actor is to the house: its head (or regent) commands all it has; a commander, only the host he leads
  // (fleets are the head's: raiding and blockades, below)
  const role = actorOf(state, hid)?.id === actorId ? 'head' : 'commander';
  const hosts = Object.values(state.parties).filter((a) => commands(state, hid, a) && a.kind !== 'garrison' && a.kind !== 'fleet' && a.men > 0 && (role === 'head' || a.commander === actorId));
  // the house's fleets, which the head of the house sends raiding or to close an enemy port (engine/military/naval.js)
  const fleets = role === 'head' ? Object.values(state.parties).filter((a) => commands(state, hid, a) && a.kind === 'fleet' && a.ships >= 5 && !a.raid && !a.blockade && !a.march && !Object.values(state.parties).some((x) => x.aboard === a.id)) : [];
  const wars = (state.wars || []).filter((w) => w.status !== 'ended' && [...w.attackers, ...w.defenders].includes(hid));
  const foesOf = new Set(wars.flatMap((w) => (w.attackers.includes(hid) ? w.defenders : w.attackers)));
  // the foe's hosts as this house knows them: those it sees, and those its reports place (09 §7.2) — not the truth
  const foeHosts = hostsKnownTo(state, hid).filter((a) => a.men > 0 && (foesOf.has(a.owner) || (a.serving && foesOf.has(a.serving))));
  const near = (pos, mi) => foeHosts.filter((a) => miles(a.pos, pos) <= mi);
  const threatened = holdings.filter((id) => near(state.holdings[id].pos, 70).length);
  const besieged = holdings.filter((id) => ['besieged', 'under siege'].includes(state.holdings[id].status));
  const held = Object.values(state.characters).filter((c) => c.alive && c.status !== 'free' && /imprisoned|captive|hostage/.test(c.status || '')); // (the few who are not free, looked at once)
  const prisoners = held.filter((c) => holdings.includes(resolvePlaceId(c.loc)));
  const kinHeld = held.filter((c) => c.house === hid && /imprisoned|captive/.test(c.status || '') && !holdings.includes(resolvePlaceId(c.loc)));
  const captors = [...new Set(kinHeld.map((c) => state.holdings[resolvePlaceId(c.loc)]?.owner).filter((h) => h && h !== hid))];
  const rel = (b) => getRelation(state, hid, b);
  const others = Object.values(state.houses).filter((h) => h.id !== hid && state.characters[h.lord]?.alive && h.seat && state.holdings[h.seat]);
  const neighbours = others.filter((h) => miles(state.holdings[h.seat].pos, home) < 420);
  const w = {
    state, actor, house: hid, role, me, seat, home, holdings, vassals, hosts, fleets, wars, foes: [...foesOf], foeHosts, threatened, besieged, prisoners, kinHeld, captors,
    liege: me.liege && state.houses[me.liege] ? state.houses[me.liege] : null, realm: realmOf(state, hid),
    gold: gold(me), levies: Math.round(Number(me.figures?.levies?.v) || 0), menAtArms: Math.round(Number(me.figures?.menAtArms?.v) || 0),
    tax: me.policy?.tax || 'normal', dues: me.obligations?.tribute || null,
    bannersCalled: vassals.some((v) => ['called', 'delayed', 'answered'].includes(v.obligations?.levies)),
    atWar: wars.length > 0, neighbours, rel,
    friends: others.filter((h) => rel(h.id) >= 40).sort((a, b) => rel(b.id) - rel(a.id)),
    rivals: neighbours.filter((h) => rel(h.id) <= -40 && !foesOf.has(h.id)).sort((a, b) => rel(a.id) - rel(b.id)),
    season: state.world?.season || 'summer',
    miles, near,
  };
  // how the realm stands, as this house sees it (engine/realm/brief.js: the ledger asked with this house's own eyes, the same figures the player's window and the council's brief use);
  // worked out only when a tree, a trigger or a dossier reads it, since most views never do
  let ledger; Object.defineProperty(w, 'ledger', { enumerable: false, get: () => (ledger ||= realmSummary(state, hid)) });
  return w;
}

// the places a host of this house might be sent: its own lands, its liege's muster, the enemy's holdings in reach,
// its friends' seats — nearest first, a handful
function placesFor(w, a) {
  const { state } = w;
  const liegeMuster = w.liege && w.me.obligations?.levies === 'called' ? w.me.obligations.muster || w.liege.seat : null;
  const enemy = Object.values(state.holdings).filter((h) => w.foes.includes(h.owner)).map((h) => h.id);
  const ids = [...new Set([...w.besieged, ...w.threatened, liegeMuster, ...w.holdings, ...enemy, ...w.friends.slice(0, 3).map((h) => h.seat)])]
    .filter((id) => id && state.holdings[id] && id !== a.at && (!a.march || a.march.to !== id));
  // a campaign may be long (Robb marched from Winterfell to the Riverlands), but not across the known world
  const near = ids.map((id) => [id, miles(state.holdings[id].pos, a.pos)]).filter(([id, d]) => d < (enemy.includes(id) ? 1600 : 900)).sort((x, y) => x[1] - y[1]).slice(0, 8).map(([id]) => id);
  // and always the way home: the nearest of the house's own holdings, where the granaries are (engine/military/supply.js)
  const home = w.holdings.filter((id) => state.holdings[id] && id !== a.at).sort((x, y) => miles(state.holdings[x].pos, a.pos) - miles(state.holdings[y].pos, a.pos))[0];
  return home && !near.includes(home) ? [...near, home] : near;
}

// Houses that are not lordships: an order, a people, exiles, a company, a free city keep no court and levy no taxes
const LORDSHIP = (w) => !['order', 'tribe', 'exile', 'company', 'city_state'].includes(w.me.rank);
// Under canon gravity the great hosts whose coming is a beat of the story (the free folk south of the Wall, the
// khalasar west) keep to their camps until the story moves them (docs/gdd/03-architecture.md §9; D-022)
const CANON_HELD = new Set(['free_folk', 'dothraki', 'golden_company', 'targaryen']);
const held = (w) => CANON_HELD.has(w.house) && (w.state.meta.settings?.canonGravity || 'canon') !== 'sandbox';
const COMMANDER_VERBS = new Set(['march_host', 'attack_host', 'halt_host', 'merge_hosts']);
// the one of the household a lord sends as envoy or companion: a knight, an envoy, a steward, a grown son
const ERRAND = ['envoy', 'knight', 'steward', 'heir', 'family', 'captain', 'commander'];

// candidate intents for each verb, before the verb's own legal() is asked
const CANDIDATES = {
  answer_call: (w) => (w.liege && ['called', 'delayed'].includes(w.me.obligations?.levies) ? [{ params: {}, target: w.me.obligations.muster || w.liege.seat }] : []),
  call_banners: (w) => (w.vassals.length && !w.bannersCalled && w.seat ? [{ params: { vassals: 'all', at: w.seat }, target: w.seat }] : []),
  raise_levies: (w) => (w.levies >= 200 ? w.holdings.slice(0, 3).map((h) => ({ params: { at: h, men: Math.round(w.levies * 0.5) }, target: h, men: true })) : []),
  march_host: (w) => (held(w) ? [] : w.hosts).filter((a) => !a.canonLock).flatMap((a) => placesFor(w, a).map((p) => ({ params: { army: a.id, to: p, ...(w.foes.includes(w.state.holdings[p]?.owner) ? { intent: 'lay siege' } : {}) }, host: a.id, target: p }))),
  attack_host: (w) => (held(w) ? [] : w.hosts).filter((a) => !a.canonLock).flatMap((a) => w.near(a.pos, 150).filter((f) => a.march?.to !== 'party:' + f.id).map((f) => ({ params: { army: a.id, to: 'party:' + f.id, intent: 'bring them to battle' }, host: a.id, target: 'party:' + f.id }))),
  // a fleet sent reaving along the nearest enemy coasts, or to close an enemy port
  raid_coast: (w) => (w.atWar ? w.fleets.flatMap((f) => Object.values(w.state.holdings).filter((h) => h.coastal && (w.foes.includes(h.owner) || w.foes.includes(realmOf(w.state, h.owner)))).sort((a, b) => miles(a.pos, f.pos) - miles(b.pos, f.pos)).slice(0, 3).map((h) => ({ params: { fleet: f.id, target: h.id }, host: f.id, target: h.id }))) : []),
  blockade: (w) => (w.atWar ? w.fleets.flatMap((f) => Object.values(w.state.holdings).filter((h) => h.coastal && w.foes.includes(h.owner) && h.status === 'besieged').slice(0, 2).map((h) => ({ params: { fleet: f.id, holding: h.id }, host: f.id, target: h.id }))) : []),
  halt_host: (w) => w.hosts.filter((a) => a.march && !a.canonLock).map((a) => ({ params: { army: a.id }, host: a.id })),
  merge_hosts: (w) => { const at = new Map(); for (const a of w.hosts) if (a.at) at.set(a.at, (at.get(a.at) || 0) + 1); return [...at.values()].some((n) => n > 1) ? [{ params: {} }] : []; },
  disband_host: (w) => (w.atWar || held(w) ? [] : w.hosts.filter((a) => a.kind === 'host' && !a.canonLock && !a.march).map((a) => ({ params: { army: a.id }, host: a.id }))),
  send_person: (w) => {
    if (!LORDSHIP(w) && w.me.rank !== 'order') return []; // the Watch sends its recruiters south
    const crown = Object.values(w.state.houses).find((h) => h.rank === 'crown')?.seat;
    const locked = canonLocked(w.state); // those a near beat of the story needs where they are (engine/world/beats.js)
    // of the household: at one of the house's own holdings (a ward at another lord's hearth is not the lord's to send)
    const people = Object.values(w.state.characters).filter((c) => c.alive && c.house === w.house && !locked.has(c.id) && w.holdings.includes(c.loc) && c.id !== w.actor.id && (c.age ?? 20) >= 16 && (c.roles || []).some((r) => ERRAND.includes(r)) && !/imprisoned|captive|hostage/.test(c.status || '') && !String(c.loc || '').startsWith('party:')).slice(0, 2);
    const courts = [...new Set([w.liege?.seat, ...w.friends.slice(0, 2).map((h) => h.seat), w.me.rank === 'order' ? crown : null])].filter((p) => p && w.state.holdings[p] && p !== w.seat);
    return people.flatMap((c) => courts.map((p) => ({ params: { character: c.id, to: p, men: 20 }, leader: c.id, target: p })));
  },
  set_tax: (w) => (LORDSHIP(w) ? ['low', 'normal', 'high'] : []).filter((l) => l !== w.tax).map((l) => ({ params: { level: l }, choice: l })),
  set_dues: (w) => (w.liege ? ['paying', 'late', 'withholding'].filter((x) => x !== w.dues).map((x) => ({ params: { status: x }, choice: x })) : []),
  fund_works: (w) => (w.seat ? PROJECT_TEMPLATES.filter((t) => (t.cost || 0) <= w.gold * 0.6).slice(0, 6).map((t) => ({ params: { template: t.key, holding: w.seat }, choice: t.key, target: w.seat })) : []),
  hire_men: (w) => (w.seat && w.gold >= 4000 ? [{ params: { at: w.seat, men: 200, kind: 'men-at-arms' }, target: w.seat, men: true, choice: 'men-at-arms' }] : []),
  send_gift: (w) => [...new Set([w.liege, ...w.friends.slice(0, 2), ...w.rivals.slice(0, 1), ...(w.ledger.risingLeader && w.state.houses[w.ledger.risingLeader]?.lord ? [w.state.houses[w.ledger.risingLeader]] : [])].filter(Boolean))].map((h) => ({ params: { to: h.lord, gold: Math.max(500, Math.round(w.gold * 0.05 / 100) * 100) }, target: h.lord, gold: true })),
  hold_feast: (w) => (LORDSHIP(w) ? [{ params: {} }] : []),
  hold_tourney: (w) => (LORDSHIP(w) && ['crown', 'paramount', 'major'].includes(w.me.rank) ? [{ params: {} }] : []),
  // (the Wall's verdict is "take_the_black" as a choice: "wall" is a prefix of the works' "walls")
  // a prisoner the story still has a part for is kept for it (the Imp for his trial by combat) — see canonAhead
  judge_prisoner: (w) => { const kept = canonAhead(w.state); return w.prisoners.filter((c) => !kept.has(c.id)).flatMap((c) => ['release', 'ransom', 'wall', 'execute'].map((v) => ({ params: { character: c.id, verdict: v }, target: c.id, choice: v === 'wall' ? 'take_the_black' : v }))); },
  // the lenders' levers and a steward's prudence (06 §7, §10)
  call_debt: (w) => (w.state.economy?.loans || []).filter((l) => l.lender === w.house && l.amount > 0 && !l.called && w.rel(l.debtor) <= -40).map((l) => ({ params: { debtor: l.debtor, months: 3 }, target: l.debtor })),
  repay: (w) => [...new Set((w.state.economy?.loans || []).filter((l) => l.debtor === w.house && l.amount > 0 && l.pays === 'coin' && w.gold > l.amount * 3).map((l) => l.lender))].map((x) => ({ params: { lender: x }, choice: x })),
  buy_grain: (w) => (LORDSHIP(w) && (Number(w.me.figures?.food?.v) || 0) < 2 && w.gold > 5000 ? [{ params: { moons: 2 } }] : []),
  pay_ransom: (w) => w.kinHeld.filter((c) => c.house === w.house).map((c) => ({ params: { character: c.id }, target: c.id })),
  declare_war: (w) => w.rivals.slice(0, 3).map((h) => ({ params: { house: h.id, reason: `the wrongs done to House ${w.me.name}` }, target: h.id })),
};

/**
 * The options of one actor now: [{ verb, label, picks: [{ params, target?, host?, leader?, choice?, men?, gold? }] }],
 * every pick lawful (legal() passed), `wait` last. `except` removes picks already refused ([{ verb, target }]).
 */
export function optionsFor(state, actorId, { except = [] } = {}) {
  const w = worldView(state, actorId); if (!w) return { view: null, options: [{ verb: HOLD, label: 'Keep your counsel and wait', picks: [{ params: {} }] }] };
  const out = [];
  for (const verb of MIND_VERBS) {
    const gen = CANDIDATES[verb]; if (!gen || !rested(state, w.house, verb)) continue;
    if (w.role !== 'head' && !COMMANDER_VERBS.has(verb)) continue; // a commander moves his host; the house's affairs are its lord's
    const picks = gen(w).filter((p) => !except.some((x) => x.verb === verb && (x.target == null || x.target === p.target) && (x.host == null || x.host === p.host)))
      .filter((p) => !check(state, intentFor(state, verb, { actor: actorId, house: w.house, params: p.params })));
    if (picks.length) out.push({ verb, label: VERBS[verb].label, picks });
  }
  out.push({ verb: HOLD, label: 'Keep your counsel and wait', picks: [{ params: {} }] });
  return { view: w, options: out };
}

/** A pick in words, for the dossier: "The Host of the Rock → Riverrun (~310 miles)". */
export function pickText(state, verb, p, w) {
  const place = (id) => (String(id).startsWith('party:') ? state.parties[id.slice(6)]?.name : placeName(state, id));
  const host = p.host && state.parties[p.host];
  const far = host && p.target ? ` (~${Math.round(miles(host.pos, posOf(state, p.target)))} miles)` : '';
  switch (verb) {
    case 'march_host': case 'attack_host': return `${host?.name} → ${place(p.target)}${far}`;
    case 'halt_host': case 'disband_host': return host?.name || '';
    case 'send_person': return `${state.characters[p.leader]?.name} → ${place(p.target)}`;
    case 'send_gift': return `${state.characters[p.target]?.name || p.target}`;
    case 'judge_prisoner': return `${state.characters[p.target]?.name}: ${p.choice}`;
    case 'declare_war': return `House ${state.houses[p.target]?.name}`;
    case 'raise_levies': case 'call_banners': return place(p.target);
    default: return p.choice || (p.target ? place(p.target) : '');
  }
}
export { miles, posOf };
