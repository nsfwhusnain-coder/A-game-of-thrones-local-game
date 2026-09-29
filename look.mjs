process.env.WC_PROVIDER='mock';
const R='/home/user/wc-s2/public/js/';
const { createInitialState } = await import(R+'shared/world.js');
const { sampleRealm } = await import(R+'engine/realm/stats.js');
const { realmViewFor } = await import(R+'engine/realm/view.js');
const { withRng } = await import(R+'engine/rng.js');
const { addDays } = await import(R+'engine/time.js');
const K = await import(R+'engine/knowledge.js');
const { figuresOf } = await import(R+'engine/realm/figures.js');
const s = createInitialState('agot_298','stark',{seed:298});
const tick = (s, days=7) => { s.meta.turn += 1; s.meta.date = addDays(s.meta.date, days); sampleRealm(s); withRng(s, () => K.updateKnowledge(s, 'stark')); };
for (let i=0;i<8;i++) tick(s);
let t=performance.now(); for(let i=0;i<10;i++) sampleRealm(s); console.log('sampleRealm ms', (performance.now()-t)/10);
for (const o of [{}, {scope:'all'}, {scope:'all',lens:'economy'}, {scope:'all',lens:'land',realm:true}, {scope:'all',house:'lannister'}]) {
  const ms = Array.from({length:9},()=>{const t=performance.now(); realmViewFor(s,'stark',o); return performance.now()-t}).sort((a,b)=>a-b);
  console.log(JSON.stringify(o), 'median', ms[4].toFixed(1), 'ms; bytes', JSON.stringify(realmViewFor(s,'stark',o)).length);
}
const v = realmViewFor(s,'stark',{});
const cell = (c)=> c? (c.word? `${c.word}(${c.via})` : c.mark==='—'?'—': `${c.mark}${c.v}${c.band?`[${c.band}]`:''}${c.age!=null?` a${c.age}`:''} ${c.via||''}`):'';
for (const r of v.rows.slice(0,40)) console.log(String(r.rank).padStart(2), r.rankTied?'≈':' ', r.house.padEnd(14), ['power','swords','levies','ships','holdings','people'].map(f=>cell(r.cells[f]).padEnd(28)).join(' '), r.trend.dir, r.trend.series.length);
console.log('truth lannister', figuresOf(s,'lannister'));
console.log(JSON.stringify(v.window), v.wars, v.rows.length);
const e = realmViewFor(s,'stark',{lens:'economy',scope:'all'});
for (const r of e.rows.slice(0,12)) console.log(r.house.padEnd(12), ['gold','income','expenses','food','debt'].map(f=>cell(r.cells[f]).padEnd(30)).join(' '));
console.log('truth', ['lannister','tyrell','bolton'].map(h=>[h, figuresOf(s,h).income, figuresOf(s,h).gold]));
console.log(Object.keys(s.knowledge.stark.realm).length, 'houses observed');
console.log(JSON.stringify(s.knowledge.stark.realm.lannister).slice(0,600));
