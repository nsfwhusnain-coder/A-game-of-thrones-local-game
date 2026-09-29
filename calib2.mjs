process.env.WC_PROVIDER='mock';
const R='/home/user/wc-s2/public/js/';
const { createInitialState } = await import(R+'shared/world.js');
const { estimateOf, realmContext } = await import(R+'engine/realm/estimate.js');
const { withRng } = await import(R+'engine/rng.js');
const { addDays } = await import(R+'engine/time.js');
const K = await import(R+'engine/knowledge.js');
const { figuresOf } = await import(R+'engine/realm/figures.js');
const { standing } = await import(R+'shared/standing.js');
const s = createInitialState('agot_298','stark',{seed: Number(process.argv[2]||298)});
const tick = (s, days=7) => { s.meta.turn += 1; s.meta.date = addDays(s.meta.date, days); withRng(s, () => K.updateKnowledge(s, 'stark')); };
for (let i=0;i<6;i++) tick(s);
const ctx = realmContext(s,'stark');
const rows = [];
for (const id of Object.keys(s.houses)) {
  if (ctx.friends.has(id) || s.houses[id].status==='extinct') continue;
  const e = estimateOf(s,'stark',id,ctx); const st = standing(s,id); const h = s.houses[id];
  const f = figuresOf(s,id);
  rows.push([h.rank, id, e.cells.power?.v, st.score, st.lands, st.might, st.wealth, st.sway, st.blood, st.order, e.cells.income?.v, f.income, st.kin, st.vassals, f.levies, f.menAtArms, e.cells.levies?.v, f.people]);
}
const byRank = {};
for (const r of rows) (byRank[r[0]] ||= []).push(r);
for (const [rk, list] of Object.entries(byRank)) {
  const m = (i) => (list.reduce((n,r)=>n+(r[i]||0),0)/list.length).toFixed(1);
  console.log(rk.padEnd(11), list.length, 'estP', m(2), 'trueP', m(3), '| lands', m(4), 'might', m(5), 'wealth', m(6), 'sway', m(7), 'blood', m(8), 'order', m(9), '| estInc', m(10), 'trueInc', m(11), 'kin', m(12), 'vass', m(13), '| levies', m(14), 'estLev', m(16), 'maa', m(15), 'people', m(17));
}
