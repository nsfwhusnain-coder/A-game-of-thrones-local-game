process.env.WC_PROVIDER='mock';
const R='/home/user/wc-s2/public/js/';
const { createInitialState } = await import(R+'shared/world.js');
const { sampleRealm } = await import(R+'engine/realm/stats.js');
const { estimateOf, realmContext } = await import(R+'engine/realm/estimate.js');
const { withRng } = await import(R+'engine/rng.js');
const { addDays } = await import(R+'engine/time.js');
const K = await import(R+'engine/knowledge.js');
const { figuresOf } = await import(R+'engine/realm/figures.js');
const s = createInitialState('agot_298','stark',{seed: Number(process.argv[2]||298)});
const tick = (s, days=7) => { s.meta.turn += 1; s.meta.date = addDays(s.meta.date, days); withRng(s, () => K.updateKnowledge(s, 'stark')); };
for (let i=0;i<6;i++) tick(s);
const ctx = realmContext(s,'stark');
const stat = {};
const add = (k, ok, ratio) => { const x = stat[k] ||= {n:0, in:0, r:[]}; x.n++; if (ok) x.in++; if (ratio!=null && isFinite(ratio)) x.r.push(ratio); };
for (const id of Object.keys(s.houses)) {
  if (ctx.friends.has(id) || s.houses[id].status==='extinct') continue;
  const e = estimateOf(s,'stark',id,ctx); if (e.kind!=='other') continue;
  const t = figuresOf(s,id);
  for (const [f, tv] of [['power',t.power],['income',t.income],['levies',t.levies],['swords',t.swords],['people',t.people]]) {
    const c = e.cells[f]; if (!c || c.mark==='—' || c.word) continue;
    const lo = c.band?c.band[0]:c.v, hi = c.band?c.band[1]:c.v;
    const ok = c.mark==='≥' ? tv >= c.v : c.band ? (tv>=lo && tv<=hi) : Math.abs(tv-c.v) <= 0.15*Math.abs(tv)+1;
    add(f+' '+c.mark+' '+(c.via||''), ok, tv? c.v/tv : null);
  }
}
for (const [k,x] of Object.entries(stat)) { x.r.sort((a,b)=>a-b); console.log(k.padEnd(24), `${x.in}/${x.n}`, 'ratio est/truth p10', x.r[Math.floor(x.r.length*.1)]?.toFixed(2), 'med', x.r[Math.floor(x.r.length*.5)]?.toFixed(2), 'p90', x.r[Math.floor(x.r.length*.9)]?.toFixed(2)); }
