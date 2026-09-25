// The life of the realm: the thousand small things that happen whether the player is watching or not.
// A library of happenings drawn from the books (public/data/happenings.js) is played out by the engine every
// turn — no model tokens spent. Most are colour (a fair at Maidenpool, a whale on the shore at Ib); some move the
// numbers a little (a blight, a bandit crew, a new sept); a few touch the great houses' quarrels. Together they
// make the map feel inhabited, and the story model is spared from writing the small life of the realm.
import { HAPPENINGS, NAMES, GOODS, SEAS, REGION_LABEL } from '../../data/happenings.js';
import { getRelation, realmOf } from './world.js';

const pickR = (a, r) => a[Math.floor(r() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// how many happenings a period brings: a fortnight a handful, a year several dozen
// a quiet day may bring nothing; a moon about seven
export function happeningCount(days, r = Math.random) { const x = (days / 30) * 7; return clamp(Math.floor(x) + (r() < x % 1 ? 1 : 0), 0, 60); }

function atWar(s, house) {
  const r = realmOf(s, house);
  return (s.wars || []).some((w) => w.status !== 'ended' && [...w.attackers, ...w.defenders].some((x) => x === house || x === r || realmOf(s, x) === r));
}
const lordOf = (s, h) => { const c = s.characters[s.houses[h.owner]?.lord]; return c?.alive ? c : null; };
const inPlayerRealm = (s, h) => { const p = s.meta.player; const o = s.houses[h.owner]; return !!o && (o.id === p || realmOf(s, o.id) === realmOf(s, p) && (o.liege === p || o.id === p)); };

// Does the world fit this happening at this place?
function fits(s, tpl, h, lord) {
  const season = s.world?.season || 'summer';
  for (const w of tpl.when || []) {
    if (w === 'war' && !atWar(s, h.owner)) return false;
    if (w === 'peace' && atWar(s, h.owner)) return false;
    if (w === 'winter' && season !== 'winter') return false;
    if (w === 'cold' && !['autumn', 'winter'].includes(season)) return false;
    if (w === 'warm' && !['summer', 'spring'].includes(season)) return false;
    if (w === 'summer' && season !== 'summer') return false;
    if (w === 'autumn' && season !== 'autumn') return false;
    if (w === 'unrest' && (h.unrest || 0) < 40) return false;
    if (w === 'calm' && (h.unrest || 0) > 35) return false;
    if (w === 'rich' && (h.prosperity || 50) < 60) return false;
    if (w === 'poor' && (h.prosperity || 50) > 40) return false;
    if (w === 'coast' && !h.coastal) return false;
    if (w === 'town' && !['city', 'town', 'great_castle', 'palace'].includes(h.type)) return false;
    if (w === 'lord' && !lord) return false;
    if (w === 'oldlord' && !(lord && lord.age >= 60)) return false;
    if (w === 'younglord' && !(lord && lord.age < 18)) return false;
    if (w === 'wildlings' && (s.plots?.threats?.free_folk || 0) < 45) return false;
    if (w === 'dead' && (s.plots?.threats?.others || 0) < 40) return false;
    if (w === 'mine' && !inPlayerRealm(s, h)) return false;
    if (w === 'notmine' && inPlayerRealm(s, h)) return false;
    if (w.startsWith('alive:') && !w.slice(6).split('+').every((id) => s.characters[id]?.alive)) return false;
    if (w.startsWith('flag:') && !s.plots?.flags?.[w.slice(5)]) return false;
    if (w.startsWith('noflag:') && s.plots?.flags?.[w.slice(7)]) return false;
  }
  return true;
}

// Where a happening may take place
function placesFor(s, tpl) {
  const all = Object.values(s.holdings).filter((h) => h.status !== 'ruined' && s.houses[h.owner]);
  const w = tpl.where;
  if (w === 'any') return all.filter((h) => !['essos', 'beyond', 'wall'].includes(h.region));
  if (w.startsWith('r:')) { const rs = w.slice(2).split('|'); return all.filter((h) => rs.includes(h.region)); }
  if (w.startsWith('h:')) { const ids = w.slice(2).split('|'); return all.filter((h) => ids.includes(h.id)); }
  if (w.startsWith('c:')) {
    const c = s.characters[w.slice(2)]; if (!c?.alive || /imprisoned|captive/.test(c.status || '')) return [];
    const h = s.holdings[c.loc]; return h ? [h] : [];
  }
  return [];
}

function smallName(r, region) {
  const pool = NAMES[region] || NAMES.default;
  return pickR(pool, r);
}
// a bastard's surname by region, for the hedge knights no one has heard of yet
const BASTARD = { north: 'Snow', dorne: 'Sand', reach: 'Flowers', riverlands: 'Rivers', stormlands: 'Storm', vale: 'Stone', westerlands: 'Hill', crownlands: 'Waters', iron_islands: 'Pyke' };
function knightOf(s, h, r) {
  const ks = Object.values(s.characters).filter((c) => c.alive && (c.roles || []).includes('knight') && s.houses[c.house]?.region === h.region && !/imprisoned/.test(c.status || ''));
  if (ks.length && r() < 0.7) return pickR(ks, r).name;
  return `Ser ${pickR(['Arlan', 'Duncan', 'Glendon', 'Harwin', 'Lucas', 'Osmund', 'Perwyn', 'Tallad', 'Wendel', 'Alyn', 'Creighton', 'Hyle'], r)} ${BASTARD[h.region] || 'Hill'}`;
}
function rivalOf(s, house) {
  let best = null, v = -15;
  for (const k of Object.keys(s.houses)) { if (k === house || !s.houses[k].seat) continue; const x = getRelation(s, house, k); if (x < v) { v = x; best = k; } }
  if (best) return best;
  const own = s.houses[house]; const near = Object.values(s.houses).filter((x) => x.id !== house && x.region === own?.region && x.seat);
  return near.length ? near[Math.floor(Math.random() * near.length)].id : null;
}
function friendOf(s, house) {
  let best = null, v = 15;
  for (const k of Object.keys(s.houses)) { if (k === house || !s.houses[k].seat) continue; const x = getRelation(s, house, k); if (x > v) { v = x; best = k; } }
  return best;
}
const num = (spec, r) => { const [a, b] = spec.split('-').map(Number); const n = Math.round(a + r() * ((b || a) - a)); return n >= 1000 ? n.toLocaleString('en-US') : String(n); };

function fill(text, ctx, r) {
  return text.replace(/\{(\w+)(?::([\d-]+))?\}/g, (m, k, spec) => {
    if (k === 'n') return num(spec || '10-100', r);
    const v = ctx[k]; return v == null ? m : typeof v === 'function' ? v() : v;
  });
}
// a slot that opens a sentence ("a mason named Gerold lost everything") takes a capital
const sentenceCase = (t) => t.replace(/(^|[.!?]\s+)([a-z])/g, (m, a, b) => a + b.toUpperCase());
const variant = (t, r) => { const vs = String(t).split(' || '); return vs[Math.floor(r() * vs.length)]; };

/**
 * Play out the small life of the realm for a period.
 * Returns { events, changes } — events are marked bg:true (background), changes are ordinary change ops.
 */
export function happenings(state, days, r = Math.random) {
  const s = state; const out = { events: [], changes: [] };
  s.plots = s.plots || {}; const cd = (s.plots.hap = s.plots.hap || {});
  const turn = s.meta.turn;
  const want = happeningCount(days, r);
  const usedPlaces = new Set();
  // gather everything the world fits now, with its weight
  const cands = [];
  for (const tpl of HAPPENINGS) {
    if (turn - (cd[tpl.id] ?? -99) < (tpl.cd ?? 6)) continue;
    // a happening that names a rival or a friend needs the house to have one
    const needR = /\{rival\}/.test(tpl.t + tpl.x), needF = /\{friend\}/.test(tpl.t + tpl.x);
    const places = placesFor(s, tpl).filter((h) => fits(s, tpl, h, lordOf(s, h)) && (!needR || rivalOf(s, h.owner)) && (!needF || friendOf(s, h.owner)));
    if (!places.length) continue;
    // the player's own lands and region come up a little more often: that is where they are listening
    const pr = s.holdings[s.houses[s.meta.player]?.seat]?.region;
    const bias = places.some((h) => h.region === pr) ? 1.4 : 1;
    cands.push({ tpl, places, w: (tpl.w ?? 1) * bias });
  }
  for (let i = 0; i < want && cands.length; i++) {
    const total = cands.reduce((a, c) => a + c.w, 0); let x = r() * total; let k = 0;
    for (; k < cands.length - 1; k++) { x -= cands[k].w; if (x <= 0) break; }
    const { tpl, places } = cands.splice(k, 1)[0];
    const fresh = places.filter((h) => !usedPlaces.has(h.id));
    const h = pickR(fresh.length ? fresh : places, r); usedPlaces.add(h.id);
    const owner = s.houses[h.owner]; const lord = lordOf(s, h);
    const rival = rivalOf(s, owner.id); const friend = friendOf(s, owner.id);
    const ctx = {
      place: h.name, house: owner.name, lord: lord?.name || `the lord of ${h.name}`, lordshort: lord ? lord.name.split(' ')[0] : 'the lord',
      region: REGION_LABEL[h.region] || h.region, knight: () => knightOf(s, h, r), smallfolk: () => smallName(r, h.region), smallfolk2: () => smallName(r, h.region),
      goods: () => pickR(GOODS[h.region] || GOODS.default, r), sea: SEAS[h.region] || 'the narrow sea',
      rival: rival ? s.houses[rival].name : 'a neighbour', friend: friend ? s.houses[friend].name : 'an old friend',
      season: s.world?.season || 'summer',
    };
    const title = sentenceCase(fill(variant(tpl.t, r), ctx, r)); const text = sentenceCase(fill(variant(tpl.x, r), ctx, r));
    const mine = inPlayerRealm(s, h);
    const e = { title, text, where: h.id, importance: tpl.imp || 1, type: tpl.type || 'rumor', houses: [owner.id], bg: true, tpl: tpl.id, day: 1 + Math.floor(r() * days) };
    if (mine) e.mine = true;
    out.events.push(e);
    cd[tpl.id] = turn;
    // small, bounded effects on the place and its house
    const fx = tpl.fx || {};
    const hold = { op: 'holding', id: h.id };
    if (fx.pro) hold.prosperity = clamp((h.prosperity ?? 50) + fx.pro, 0, 100);
    if (fx.unr) hold.unrest = clamp((h.unrest ?? 10) + fx.unr, 0, 100);
    if (fx.note) hold.note = title;
    if (hold.prosperity != null || hold.unrest != null || hold.note) out.changes.push(hold);
    if (fx.rel && rival) out.changes.push({ op: 'relation', a: owner.id, b: rival, delta: fx.rel, reason: title });
    if (fx.relf && friend) out.changes.push({ op: 'relation', a: owner.id, b: friend, delta: fx.relf, reason: title });
  }
  return out;
}
