process.env.WC_PROVIDER = 'mock';
const R = '/home/user/wc-s2/public/js/';
const { sampleRealm } = await import(R + 'engine/realm/stats.js');
const { realmViewFor } = await import(R + 'engine/realm/view.js');
const { createInitialState } = await import(R + 'shared/world.js');
const { addDays } = await import(R + 'engine/time.js');
const { withRng } = await import(R + 'engine/rng.js');
const K = await import(R + 'engine/knowledge.js');
const V = await import(R + 'engine/state/validate.js');
const { standing } = await import(R + 'shared/standing.js');
const tick = (s, days = 7) => { s.meta.turn += 1; s.meta.date = addDays(s.meta.date, days); sampleRealm(s); withRng(s, () => K.updateKnowledge(s, s.meta.player)); return s; };
function walk(x, p, out) {
  if (typeof x === 'number') { if (!Number.isFinite(x)) out.push(p + '=' + x); }
  else if (Array.isArray(x)) x.forEach((y, i) => walk(y, p + '[' + i + ']', out));
  else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) { if (v === undefined) out.push(p + '.' + k + '=undefined'); walk(v, p + '.' + k, out); }
}
const rank = {};
const s0 = createInitialState('agot_298', 'stark', { seed: 1 });
const hs = Object.values(s0.houses);
const pick = ['stark', 'lannister', 'baratheon', 'targaryen', 'nights_watch', 'bolton', 'frey', 'beesbury', 'greyjoy', 'braavos', 'golden_company', 'free_folk', 'dothraki'].filter(h => s0.houses[h]);
for (const h of pick) {
  let s; try { s = createInitialState('agot_298', h, { seed: 2 }); } catch (e) { console.log(h, 'cannot play:', e.message); continue; }
  for (let i = 0; i < 3; i++) tick(s);
  const bad = [];
  for (const lens of ['strength','economy','land']) for (const scope of ['great','all','mine','war']) for (const realm of [false, true]) {
    let v; try { v = realmViewFor(s, h, { lens, scope, realm }); } catch (e) { bad.push('THROW ' + e.message); continue; }
    walk(v, 'v', bad);
    const own = v.rows.find(r => r.house === h);
    if (!own) { if (scope !== 'war') bad.push(`own row missing scope ${scope}`); continue; }
    if (!realm && lens === 'strength' && own.cells.power.v !== standing(s, h).score) bad.push('own power != standing');
  }
  const inv = V.validate(s).filter(x => x.startsWith('12'));
  console.log(h.padEnd(16), s0.houses[h].rank.padEnd(10), 'bad:', bad.length, bad.slice(0, 2).join(' | '), 'inv12:', inv.length, 'samples', s.realmStats.samples.length, 'own listed in samples', !!s.realmStats.samples.at(-1).h[h]);
}
