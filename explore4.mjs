import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
process.env.WC_PROVIDER = 'mock';
process.env.WC_SAVES = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-audit-'));
const R = '/home/user/wc-s2/public/js/';
const game = await import('/home/user/wc-s2/server/game.js');
const { realmViewFor } = await import(R + 'engine/realm/view.js');
const { validate } = await import(R + 'engine/state/validate.js').catch(() => ({}));
const V = await import(R + 'engine/state/validate.js');
const { standing } = await import(R + 'shared/standing.js');
const clone = (x) => JSON.parse(JSON.stringify(x));
const bad = [];
function walk(x, p, out) {
  if (typeof x === 'number') { if (!Number.isFinite(x)) out.push(p + '=' + x); }
  else if (x === undefined) out.push(p + '=undefined');
  else if (Array.isArray(x)) x.forEach((y, i) => walk(y, p + '[' + i + ']', out));
  else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) { if (v === undefined) out.push(p + '.' + k + '=undefined'); walk(v, p + '.' + k, out); }
}
function sweep(state, label) {
  let n = 0; const houses = Object.keys(state.houses);
  const opts = [];
  for (const lens of ['strength','economy','land']) for (const scope of ['great','all','mine','war']) for (const realm of [false,true]) for (const window of [null, 3, 6, 12]) opts.push({ lens, scope, realm, window });
  for (const h of houses) opts.push({ house: h, scope: 'all' });
  for (const o of opts) {
    let v; try { v = realmViewFor(state, state.meta.player, o); } catch (e) { bad.push(`${label} ${JSON.stringify(o)} THROWS ${e.stack.split('\n').slice(0,3).join(' | ')}`); continue; }
    const out = []; walk(v, 'v', out); if (out.length) bad.push(`${label} ${JSON.stringify(o)} ${out.slice(0,3).join(', ')}`);
    // json null where number expected
    JSON.parse(JSON.stringify(v)); n++;
  }
  return n;
}
const { id, state: st0 } = game.newGame('agot_298', 'stark', { seed: 33 });
let s = game.loadState(id);
console.log('turn0 views', sweep(s, 't0'));
for (let i = 1; i <= 10; i++) {
  await game.advance(id, { span: i % 3 === 0 ? '30d' : '7d', orders: [] }); await game.settled?.(id);
  s = game.loadState(id);
  const v = realmViewFor(s, 'stark', { scope: 'all' });
  const own = v.rows.find(r => r.house === 'stark');
  const hud = s.standing;
  if (own.cells.power.v !== hud.score) bad.push(`turn ${s.meta.turn}: own power ${own.cells.power.v} != state.standing.score ${hud.score}`);
  if (own.cells.swords.v !== hud.swords) bad.push(`turn ${s.meta.turn}: own swords ${own.cells.swords.v} != standing.swords ${hud.swords}`);
  const inv = V.validate ? V.validate(s) : [];
  if (inv.length) bad.push(`turn ${s.meta.turn}: invariants ${inv.slice(0,3)}`);
  if (i % 3 === 0 || i === 1) console.log('turn', s.meta.turn, 'views', sweep(s, 't' + s.meta.turn), 'samples', s.realmStats.samples.length, 'obs houses', Object.keys(s.knowledge.stark.realm).length);
}
// corrupted series caught by invariant 12
{
  const c = clone(s);
  c.realmStats.samples[1].h.lannister = c.realmStats.samples[1].h.lannister.slice(0, 5);
  const p = V.validate(c).filter(x => x.startsWith('12')); console.log('inv12 short row:', p.length);
  const c2 = clone(s); c2.realmStats.samples[1].h.lannister[3] = NaN; c2.realmStats.samples[1].h.lannister[4] = null;
  console.log('inv12 NaN/null row:', V.validate(c2).filter(x => x.startsWith('12')).length);
  const c3 = clone(s); c3.realmStats.samples[2].day = c3.realmStats.samples[1].day;
  console.log('inv12 day order:', V.validate(c3).filter(x => x.startsWith('12')).length);
  const c4 = clone(s); c4.knowledge.stark.realm.lannister.obs.push({ day: 1e9, turn: 1e6, via: 'seen', v: {} });
  console.log('inv12 future obs:', V.validate(c4).filter(x => x.startsWith('12')).length);
  const c5 = clone(s); c5.realmStats.samples[1].h.lannister[2] = 'abc';
  console.log('inv12 string cell:', V.validate(c5).filter(x => x.startsWith('12')).length);
  const c6 = clone(s); c6.realmStats.samples[1].h.lannister[2] = Infinity;
  console.log('inv12 Infinity (JSON->null in file) :', V.validate(clone(c6)).filter(x => x.startsWith('12')).length);
  const c7 = clone(s); c7.realmStats.fields = c7.realmStats.fields.slice(0,3);
  console.log('inv12 fields narrower:', V.validate(c7).filter(x => x.startsWith('12')).length);
  const c8 = clone(s); c8.realmStats.samples = c8.realmStats.samples.slice().reverse(); console.log('inv12 reversed', V.validate(c8).filter(x => x.startsWith('12')).length);
  const c9 = clone(s); c9.realmStats.samples[1].h.lannister[2] = -5; console.log('inv12 negative cell (gold can be negative...)', V.validate(c9).filter(x => x.startsWith('12')).length);
  const c10 = clone(s); c10.realmStats.samples[1].h.lannister[2] = 1.5; console.log('inv12 non-integer cell', V.validate(c10).filter(x => x.startsWith('12')).length);
  const c11 = clone(s); c11.realmStats.samples[1].turn = 9999; console.log('inv12 sample turn in future', V.validate(c11).filter(x => x.startsWith('12')).length);
}
// extinct / liege change
{
  const c = clone(s);
  c.houses.bolton.status = 'extinct';
  c.houses.tyrell.status = 'extinct';
  console.log('extinct sweep', sweep(c, 'extinct'));
  const d = clone(s); d.houses.frey.liege = 'stark'; d.houses.bolton.liege = 'lannister'; console.log('liege sweep', sweep(d, 'liege'));
  const e = clone(s); for (const h of Object.values(e.holdings)) if (h.owner === 'stark') h.owner = 'lannister'; console.log('stark landless sweep', sweep(e, 'landless'));
  const f = clone(s); f.houses.stark.status = 'extinct'; console.log('player extinct sweep', sweep(f, 'playerExtinct'));
}
console.log('BAD', bad.length); bad.slice(0, 25).forEach(b => console.log(' ', b));
fs.rmSync(process.env.WC_SAVES, { recursive: true, force: true });
