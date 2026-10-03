// The world moves with you or without you.
//
//  • Threads: the great events of 298–299 AC come on their own schedule — the King rides north, a boy falls,
//    the Hand's tourney, the Imp taken, Robert's last hunt, the War of the Five Kings — but only while the world
//    still fits them. When the player's choices (or the story) have changed things, a beat quietly lapses and
//    the world goes on its own way. When a beat touches the player's own house it becomes a decision instead.
//  • Churn: the other houses live their lives every turn — feasts, feuds, betrothals, outlaws, tourneys.
//  • Threats that grow with time: the free folk massing, the cold beyond the Wall, the Iron Bank's patience.
//  • Opportunities: the world state throws up openings the player must answer in time, or lose.
import { applyChanges } from './world.js';
import { placeOf, joinParty, settle } from '../engine/parties.js';
import { pronouns } from './people.js';
import { happenings } from './happenings.js';
import { random } from '../engine/rng.js';
import { fact } from '../engine/facts/log.js';
import { scheduleLists, listsPending } from './tourney.js';
import { speakerFor } from './regency.js';

const ym = (d) => d.year * 12 + (d.month - 1);
const YM = (y, m) => y * 12 + (m - 1);
const pick = (a, r = random) => a[Math.floor(r() * a.length)];
const C = (s, id) => s.characters[id];
const alive = (s, ...ids) => ids.every((id) => s.characters[id]?.alive);
const free = (s, id) => alive(s, id) && !/imprisoned|captive|hostage/.test(s.characters[id].status || '');
// where someone is: their hall, or wherever the party they travel with has halted (the King's court in its progress)
const at = (s, id, ...places) => places.includes(String(placeOf(s, s.characters[id]) || ''));
const player = (s) => s.meta.player;
const ev = (title, text, where, importance = 3, type = 'court', houses = []) => ({ title, text, where, importance, type, houses });
// A card of the threads or of the realm's own life, recorded as its fact: `kind` (default: a beat of the great story)
// and `actors` ride on the card until it is recorded (engine/facts/log.js).
const record = (s, e, more = {}) => { const { kind = 'canon_beat', actors, data, ...card } = e; return fact(s, kind, card, { ...more, actors, data: { ...data, ...more.data } }); };

// ── The threads ──
export { THREADS } from '../../data/beats.js';
import { THREADS, BEAT_META } from '../../data/beats.js';
import { beatsOf, runBeats, lockedNames, namedAhead } from '../engine/world/beats.js';

// ── Threats that grow: rising 0–100 over time and with neglect ──
export const THREATS = {
  free_folk: { name: 'The free folk', icon: 'axe', blurb: (v) => (v > 75 ? 'Mance Rayder\'s host is at the Wall.' : v > 45 ? 'The wildlings are massing in the Frostfangs.' : 'Raiders slip over the Wall now and then.') },
  others: { name: 'The cold', icon: 'snow', blurb: (v) => (v > 70 ? 'The dead walk. Rangers do not come back.' : v > 40 ? 'Rangers vanish; wildlings flee south of the Wall.' : 'Old Nan\'s stories, surely.') },
  iron_bank: { name: 'The Iron Bank', icon: 'coins', blurb: (v) => (v > 70 ? 'Braavos is backing the crown\'s enemies.' : v > 40 ? 'The Bank sends a keyholder to count the crown\'s silver.' : 'The crown\'s notes are still honoured.') },
  winter: { name: 'Winter', icon: 'snow', blurb: (v) => (v > 70 ? 'Winter is here.' : v > 40 ? 'The white ravens will fly soon.' : 'A long summer, ending.') },
};
function threatTick(s, days) {
  const T = s.plots.threats; const k = days / 30;
  T.free_folk = Math.min(100, T.free_folk + k * (1.4 + (s.houses.nights_watch?.figures?.menAtArms?.v < 800 ? 0.8 : 0)));
  T.others = Math.min(100, T.others + k * (s.world?.season === 'winter' ? 2.2 : s.world?.season === 'autumn' ? 1.1 : 0.5));
  const debt = Number(s.houses.baratheon?.figures?.debt?.v) || 0;
  T.iron_bank = Math.max(0, Math.min(100, T.iron_bank + k * (debt > 4e6 ? 1.2 : debt > 1e6 ? 0.4 : -1.5)));
  T.winter = Math.min(100, s.world?.season === 'winter' ? 90 : s.world?.season === 'autumn' ? 55 + T.others * 0.2 : 20 + T.others * 0.2);
  const out = { events: [], changes: [] };
  // the free folk come over the Wall
  if (T.free_folk > 35 && random() < k * T.free_folk / 260) {
    const north = Object.values(s.holdings).filter((h) => s.houses[h.owner]?.region === 'north' && h.pos[1] < 700);
    const h = pick(north.length ? north : Object.values(s.holdings).filter((x) => s.houses[x.owner]?.region === 'north'));
    if (h) {
      out.events.push({ ...ev('Wildlings over the Wall', `A band of free folk slips over the Wall and falls on the lands of ${h.name}: steadings burned, sheep and women carried off. The Watch is spread too thin.`, h.id, s.houses[h.owner]?.id === player(s) || s.houses[h.owner]?.liege === player(s) ? 4 : 2, 'war', [h.owner, 'free_folk', 'nights_watch']), kind: 'raid', data: { by: 'free_folk' } });
      out.changes.push({ op: 'holding', id: h.id, unrest: Math.min(100, (h.unrest || 0) + 12), prosperity: Math.max(0, (h.prosperity || 50) - 8), note: 'Raided by wildlings' });
      out.raid = h.id;
    }
  }
  if (T.others > 55 && random() < k * 0.18) out.events.push({ ...ev('The dead in the snow', 'Rangers come back from beyond the Wall with a tale no one at court believes: men dead a fortnight rose and walked. At Castle Black they burn their dead now.', 'nights_watch', 4, 'court', ['nights_watch']), kind: 'rumour', data: { threat: 'others' } });
  return out;
}

// ── The other houses live their lives ──
function churn(s, days) {
  const out = { events: [], changes: [] };
  const great = Object.values(s.houses).filter((h) => h.status !== 'extinct' && h.lord && s.characters[h.lord]?.alive && h.id !== player(s) && !h.landless);
  const x = (days / 30) * (1.2 + random()); const n = Math.min(4, Math.floor(x) + (random() < x % 1 ? 1 : 0));
  const lordName = (h) => s.characters[h.lord]?.name || `the lord of ${h.name}`;
  const tries = [
    () => { // an old feud flares
      const pairs = Object.entries(s.relations || {}).filter(([, r]) => r.v <= -30).map(([k]) => k.split('|')).filter(([a, b]) => s.houses[a] && s.houses[b] && a !== player(s) && b !== player(s));
      if (!pairs.length) return;
      const [a, b] = pick(pairs); const ha = s.houses[a], hb = s.houses[b];
      const h = Object.values(s.holdings).find((x) => x.owner === b);
      out.events.push({ ...ev(`${lordName(ha)} and ${lordName(hb)} at odds`, `${lordName(ha)}'s men and ${lordName(hb)}'s came to blows over ${pick(['a stolen herd', 'a burned mill', 'a dead squire', 'a boundary stone', 'a runaway bride'])}. ${lordName(ha)} swears it was not his doing; ${lordName(hb)} does not believe him.`, h?.id || hb.seat, 2, 'war', [a, b]), kind: 'raid', actors: [ha.lord, hb.lord], data: { feud: true } });
      out.changes.push({ op: 'relation', a, b, delta: -6 });
      if (h) out.changes.push({ op: 'holding', id: h.id, unrest: Math.min(100, (h.unrest || 0) + 6) });
    },
    () => { // a feast and a match
      const cands = great.filter((h) => h.rank !== 'minor' && speakerFor(s, h.id)?.loc === h.seat); // (the host is in his hall: Walder Frey "feasted Jonos Bracken for a fortnight" at the Twins with his muster on the road to Riverrun)
      const a = pick(cands); if (!a) return;
      const friends = Object.entries(s.relations || {}).filter(([k, r]) => r.v >= 20 && k.split('|').includes(a.id)).map(([k]) => k.split('|').find((x) => x !== a.id)).filter((x) => s.houses[x] && x !== player(s));
      const b = s.houses[pick(friends.length ? friends : great.filter((h) => h.region === a.region && h.id !== a.id).map((h) => h.id))]; if (!b || String(speakerFor(s, b.id)?.loc || '').startsWith('party:')) return; // (nor is his guest on the road with a host)
      out.events.push({ ...ev(`${lordName(a)} feasts the envoys of House ${b.name}`, `At ${s.holdings[a.seat]?.name || a.name}, ${lordName(a)} feasts the envoys of House ${b.name} for a fortnight. There is talk of a match between their children, and more wine than wisdom.`, a.seat, 1, 'court', [a.id, b.id]), kind: 'feast', actors: [a.lord], data: { envoys: b.id } }); // (the guest's lord stays in his own hall, a child or a month's ride away: his envoys sit at the table)
      out.changes.push({ op: 'relation', a: a.id, b: b.id, delta: 5 });
    },
    () => { // outlaws where the land is restless
      const h = pick(Object.values(s.holdings).filter((x) => (x.unrest || 0) > 45 && x.owner !== player(s))); if (!h) return;
      out.events.push({ ...ev(`Outlaws near ${h.name}`, `Broken men and outlaws have taken to the woods around ${h.name}. Travellers go armed, and merchants go around.`, h.id, 1, 'economy', [h.owner]), kind: 'unrest_rising', data: { outlaws: true } });
      out.changes.push({ op: 'holding', id: h.id, prosperity: Math.max(0, (h.prosperity || 50) - 5) });
    },
    () => { // a name-day tourney: called now, and run in three weeks among the knights who are there (shared/tourney.js)
      const a = pick(great.filter((h) => ['paramount', 'major', 'crown'].includes(h.rank) && h.seat && s.holdings[h.seat] && speakerFor(s, h.id)?.loc === h.seat && !listsPending(s, h.seat) && !canonLocked(s).has(speakerFor(s, h.id)?.id) && (s.wars || []).every((w) => w.status === 'ended' || !w.attackers.concat(w.defenders).includes(h.id)))); if (!a) return;
      const hall = s.holdings[a.seat].name; const L = scheduleLists(s, a.seat, a.id, { nameDay: true });
      out.events.push({ ...ev(`${lordName(a)} calls a tourney for a name-day`, `${lordName(a)} has named a day for jousts at ${hall} and asks the knights of the country to ride in.`, a.seat, 1, 'court', [a.id]), kind: 'tourney', actors: [a.lord], data: { cost: 0, nameDay: true, lists: L.on } });
    },
    () => { // a good harvest or a bad one somewhere
      const h = pick(Object.values(s.holdings).filter((x) => x.owner !== player(s) && !['wall', 'beyond', 'essos'].includes(x.region))); if (!h) return;
      const good = random() < 0.55;
      out.events.push({ ...ev(good ? `Full granaries at ${h.name}` : `Blight at ${h.name}`, good ? `The harvest around ${h.name} is the best in memory; the lord's granaries are full to the rafters.` : `A blight has taken the wheat around ${h.name}. The smallfolk are already eating their seed corn.`, h.id, 1, 'economy', [h.owner]), kind: 'happening', data: { harvest: good ? 'good' : 'blight' } });
      out.changes.push({ op: 'holding', id: h.id, prosperity: Math.max(0, Math.min(100, (h.prosperity || 50) + (good ? 6 : -8))) });
    },
  ];
  for (let i = 0; i < n; i++) { try { pick(tries)(); } catch { /* a quiet month */ } }
  return out;
}

// ── Openings the world offers the player ──
function opportunity(s, raidAt) {
  const p = player(s); const me = s.houses[p]; if (!me) return null;
  const treasury = Number(me.figures?.treasury?.v) || 0; const opts = [];
  if (raidAt && (s.holdings[raidAt]?.owner === p || s.houses[s.holdings[raidAt]?.owner]?.liege === p)) {
    const h = s.holdings[raidAt];
    opts.push({
      id: 'wildling_raid', title: `Wildlings at ${h.name}`, from: s.houses[h.owner]?.lord, where: h.id,
      text: `Raiders from beyond the Wall have burned steadings around ${h.name}. The survivors want vengeance; the Night's Watch wants men.`,
      options: [
        { label: 'Send riders to hunt them down', hint: '100 men-at-arms for a season; unrest falls', fx: [{ menAtArms: -100 }, { unrest: [h.id, -12] }, { prosperity: [h.id, 3] }] },
        { label: 'Send men and grain to the Watch', hint: 'Strengthens the Wall; costs you', fx: [{ menAtArms: -150 }, { food: -1 }, { nwMen: 150 }, { rel: ['nights_watch', 15] }, { threat: ['free_folk', -12] }] },
        { label: 'Let them rebuild themselves', hint: 'Nothing spent; resentment grows', fx: [{ unrest: [h.id, 8] }] },
      ],
    });
  }
  if (treasury < 2000 && !(me.loans || []).some((l) => s.meta.turn - l.turn < 12)) {
    opts.push({
      id: 'lender', title: 'A Braavosi keyholder calls', from: null,
      text: `A soft-spoken man in black from the Iron Bank of Braavos has heard House ${me.name}'s coffers are low. The Bank would be pleased to lend — at interest, and the Bank always gets its due.`,
      options: [
        { label: 'Borrow 20,000 dragons', hint: 'Coin now; a debt to Braavos', fx: [{ borrow: ['iron_bank', 20000, 24] }] },
        { label: 'Borrow 5,000 dragons', hint: 'A modest loan', fx: [{ borrow: ['iron_bank', 5000, 24] }] },
        { label: 'Send him away', hint: 'Keep your freedom', fx: [] },
      ],
    });
  }
  const myWars = (s.wars || []).filter((w) => w.status !== 'ended' && w.attackers.concat(w.defenders).includes(p));
  if (myWars.length && treasury > 8000) {
    const co = pick(['the Second Sons', 'the Brave Companions', 'the Stormcrows', 'the Windblown']);
    opts.push({
      id: 'sellswords', title: `${co[0].toUpperCase() + co.slice(1)} offer their swords`,
      text: `A captain of ${co} has crossed the narrow sea with five hundred seasoned men and heard you are at war. Their price is high, and their loyalty lasts exactly as long as your gold.`,
      options: [
        { label: 'Hire them for a season', hint: '8,000 gold; 500 veterans', fx: [{ gold: -8000 }, { menAtArms: 500 }] },
        { label: 'Haggle', hint: 'Cheaper — if they don\'t walk', fx: [{ chance: [0.55, [{ gold: -5000 }, { menAtArms: 500 }], []] }] },
        { label: 'No sellswords', hint: 'Honour, and coin, intact', fx: [] },
      ],
    });
  }
  // a neighbour's lord dies leaving a child heir
  const child = Object.values(s.houses).find((h) => h.id !== p && h.liege === p && s.characters[h.lord]?.alive && s.characters[h.lord].age < 14);
  if (child) {
    const heir = s.characters[child.lord];
    opts.push({
      id: 'wardship_' + child.id, matter: 'wardship', title: `The wardship of ${heir.name}`, from: null,
      text: `${heir.name} is ${pronouns(heir).lord} of ${child.name} at ${heir.age}. Someone must guard the child and ${pronouns(heir).his} lands until ${pronouns(heir).he} comes of age — and whoever holds the wardship holds the house.`,
      options: [
        { label: 'Take the child into your household', hint: 'A loyal house for a generation', fx: [{ rel: [child.id, 15] }, { loyalty: [heir.id, 20] }, { ops: [{ op: 'character', id: heir.id, loc: me.seat, note: `A ward in the household of ${pronouns(heir).his} liege.` }] }] },
        { label: `Name a castellan to rule for ${pronouns(heir).him}`, hint: 'Order kept; the household resents it', fx: [{ rel: [child.id, -5] }, { gold: 800 }] },
        { label: 'Leave the mother to rule', hint: 'Their business', fx: [{ rel: [child.id, 5] }] },
      ],
    });
  }
  s.plots.offered = s.plots.offered || {};
  const fresh = opts.filter((o) => s.meta.turn - (s.plots.offered[o.id.replace(/_.*$/, '')] ?? -99) >= 8);
  const o = fresh.length ? pick(fresh) : null;
  if (o) s.plots.offered[o.id.replace(/_.*$/, '')] = s.meta.turn;
  return o;
}

// ── The turn ──
/**
 * The great threads move a beat at a time (engine/world/beats.js): each when its window has opened, its trigger come and
 * the world still fits it — or an alternate of it does; a beat the world no longer fits lapses when its window closes.
 * Returns what fired: { events, changes, decisions, fired, batches }. Exported so the canon order can be tested on its
 * own (tests/canon.test.js); `threads` in the old shape ({ id, stages: [{ id, at, grace, needs, fire }] }).
 */
export function advanceThreads(s, threads = THREADS) {
  return runBeats(s, threads === THREADS ? BEATS : beatsOf(threads));
}
const BEATS = beatsOf(THREADS, BEAT_META);
/** The people the canon holds where they are while their beat is near (the minds do not send them away). */
export const canonLocked = (s) => lockedNames(s, BEATS);
/** The people the canon still has a part for: under Canon gravity they do not die of their years before it. */
export const canonAhead = (s) => namedAhead(s, BEATS);

export function worldTick(state, days) {
  const s = state;
  s.plots = s.plots || {};
  s.plots.stages = s.plots.stages || {};
  s.plots.flags = s.plots.flags || {};
  s.plots.threats = s.plots.threats || { free_folk: 30, others: 12, iron_bank: 20, winter: 20 };
  const { events, decisions, batches } = advanceThreads(s);
  const applied = [];
  for (const b of batches) applied.push(...applyChanges(s, b.changes, b.ctx).applied);
  const changes = [];
  const th = threatTick(s, days); events.push(...(th.events || []).map((e) => record(s, e))); changes.push(...(th.changes || []));
  const ch = churn(s, days); events.push(...ch.events.map((e) => record(s, { ...e, bg: true }))); changes.push(...ch.changes);
  // and the thousand small lives of the realm, from the books
  const hp = happenings(s, days); events.push(...hp.events); changes.push(...hp.changes);
  applied.push(...applyChanges(s, changes, { source: 'The ravens' }).applied);
  const pending = (s.decisions || []).filter((d) => d.status === 'pending').length;
  if (!decisions.length && pending < 2 && random() < 0.6 * Math.min(1, days / 30)) { const o = opportunity(s, th.raid); if (o) decisions.push(o); }
  for (const d of decisions.slice(0, 2)) {
    const r = applyChanges(s, [{ op: 'decision', matter: d.matter || d.id, ...d }]); applied.push(...r.applied);
    const made = s.decisions.at(-1); if (made && d.lapse) made.lapse = d.lapse; if (made && d.from && s.characters[d.from]) made.from = d.from;
  }
  return { events, applied };
}
