// Bug hunt: play a house with plausible orders in its own words, one or two a week, and read what the world does with them.
// Usage: node play-orders.mjs <house> <seed> <turns> [span]. Each turn: the invariants, odd text in cards and receipts, a person in two places, and orders the reader took without a word to say what it did.
import { BH_OUT, REPO } from './paths.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
const [house = 'stark', seed = '1', turns = '12', span = '7d'] = process.argv.slice(2);
process.env.WC_PROVIDER = 'mock'; process.env.WC_SAVES = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-bh-play-'));
const im = (p) => import(pathToFileURL(`${REPO}/${p}`).href);
const game = await im('server/game.js'); const { validate } = await im('public/js/engine/state/validate.js');
let st = (Number(seed) * 2654435761) >>> 0; const rnd = () => { st = (st + 0x6D2B79F5) >>> 0; let t = st; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const { id } = game.newGame('agot_298', house, { seed: Number(seed) });
const BAD = /\bundefined\b|\bNaN\b|\[object|\bnull\b|\{\{|\}\}|\bthe the\b|Infinity|\bnull's/;
const out = {}; const add = (rule, t) => { (out[rule] = out[rule] || new Set()).add(t); };
const TEMPLATES = [
  (w) => `Raise the levies at ${w.hold}`, (w) => `Call the banners`, (w) => `Send ${w.kin} to ${w.otherHold}`, (w) => `Send ${w.kin} to ${w.otherHold} with ${pick([50, 200, 600])} men`, (w) => `Hold a tourney at ${w.hold}`,
  (w) => `Hold a feast at ${w.hold}`, (w) => `Send a raven to ${w.lordOther} asking for friendship`, (w) => `Send a raven to ${w.lordOther} demanding tribute`, (w) => `Lower the taxes`, (w) => `Raise the taxes`,
  (w) => `Raise ${pick([100, 500, 2000])} men at ${w.hold}`, (w) => `Go to ${w.otherHold}`, (w) => `Return home`, (w) => `Build a sept at ${w.hold}`, (w) => `Fortify ${w.hold}`,
  (w) => `Betroth ${w.kin} to the heir of House ${w.houseOther}`, (w) => `Foster ${w.kin} with House ${w.houseOther}`, (w) => `Make ${w.kin} my heir`, (w) => `March on ${w.enemyHold}`, (w) => `Declare war on House ${w.houseOther}`,
  (w) => `Make peace with House ${w.houseOther}`, (w) => `Imprison ${w.kin}`, (w) => `Release ${w.kin}`, (w) => `Send ${w.kin} as a hostage to ${w.otherHold}`, (w) => `Hire sellswords`,
  (w) => `Disband the host`, (w) => `Stay here`, (w) => `Dismiss ${w.kin}`, (w) => `Name ${w.kin} regent`, (w) => `Send ${w.kin} to the Wall`, (w) => `Summon ${w.lordOther} to ${w.hold}`,
];
const words = (s) => {
  const me = s.houses[house]; const mine = Object.values(s.characters).filter((c) => c.alive && c.house === house && c.id !== me.lord);
  const own = Object.values(s.holdings).filter((h) => h.owner === house); const others = Object.values(s.houses).filter((h) => h.id !== house && h.lord && s.characters[h.lord]?.alive && !['company', 'tribe'].includes(h.rank));
  const holdings = Object.values(s.holdings).filter((h) => h.owner !== house && h.region !== 'beyond');
  const ho = pick(others) || me; const lo = s.characters[ho.lord] || { name: 'the lord' };
  return { hold: (pick(own) || { name: 'the castle' }).name, otherHold: pick(holdings).name, kin: (pick(mine) || { name: 'my son' }).name, lordOther: lo.name, houseOther: ho.name, enemyHold: pick(holdings).name };
};
const C0 = { turn: 0 };
for (let n = 1; n <= Number(turns); n++) {
  const s0 = game.loadState(id); const w = words(s0); const k = rnd() < 0.5 ? 1 : 2; const orders = [];
  for (let i = 0; i < k; i++) orders.push({ id: `o${n}_${i}`, text: pick(TEMPLATES)(w) });
  let r; try { game.setOrders(id, orders); const plan = await game.previewOrderPlans(id); r = await game.advance(id, { span, orders: plan.orders }); await game.settled(id); } catch (e) { add('threw', `turn ${n}: ${orders.map((o) => o.text).join(' / ')}: ${String(e.message).slice(0, 140)}`); break; }
  const T = r.turn || {}; const s = game.loadState(id);
  if (process.env.V) for (const o of T.orders || r.orders || []) console.log(`t${n} > ${o.text}\n      ${[typeof o.receipt === 'string' ? o.receipt : o.receipt?.text || o.receipt?.say || JSON.stringify(o.receipt), ...(o.result || [])].flat().filter(Boolean).join(' | ').slice(0, 300)}`);
  for (const o of T.orders || r.orders || []) for (const x of [typeof o.receipt === 'string' ? o.receipt : JSON.stringify(o.receipt || ''), ...(o.result || [])].flat()) if (typeof x === 'string' && BAD.test(x)) add('bad-receipt', `turn ${n}: ${o.text}: ${x.slice(0, 160)}`);
  for (const e of T.events || []) for (const x of [e.headline, e.summary, ...(e.details || [])]) if (typeof x === 'string' && BAD.test(x)) add('bad-card', `turn ${n}: ${x.slice(0, 160)}`);
  for (const p of validate(s)) add('invariant', `turn ${n}: ${p.slice(0, 200)} (orders: ${orders.map((o) => o.text).join(' / ')})`);
  const partyOf = new Map();
  for (const p of Object.values(s.parties || {})) for (const m of p.members || []) { if (partyOf.has(m) && partyOf.get(m) !== p.id) add('two-parties', `${s.characters[m]?.name} is in ${partyOf.get(m)} and ${p.id} (turn ${n})`); partyOf.set(m, p.id); }
  for (const p of Object.values(s.parties || {})) { const c = s.characters[p.commander]; if (c && !c.alive) add('dead-commands', `${c.name} commands ${p.name} (turn ${n})`); if (c && c.alive && /imprisoned|captive|hostage/.test(c.status || '') && c.house === p.owner) add('held-commands', `${c.name} (${c.status}) commands ${p.name} (turn ${n})`); }
  for (const h of Object.values(s.houses)) { const l = s.characters[h.lord]; if (h.lord && (!l || !l.alive) && !['company', 'tribe'].includes(h.rank)) add('dead-lord', `${h.id} (turn ${n})`); }
  C0.turn = n;
}
const res = Object.fromEntries(Object.entries(out).map(([r, v]) => [r, [...v]]));
fs.writeFileSync(`${BH_OUT}/play-orders-${house}-${seed}.json`, JSON.stringify(res, null, 1));
for (const [r, v] of Object.entries(res)) { console.log('##', r, v.length); for (const t of v.slice(0, 6)) console.log('   ', t.slice(0, 260)); }
console.log('done', house, seed, 'turns', C0.turn);
fs.rmSync(process.env.WC_SAVES, { recursive: true, force: true });
