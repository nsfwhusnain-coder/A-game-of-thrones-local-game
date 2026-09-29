import fs from 'node:fs';
process.env.WC_PROVIDER='mock';
const { createInitialState } = await import('/home/user/wc-s1/public/js/shared/world.js');
const { scoreCard } = await import('/home/user/wc-s1/server/ai/validate/headline.js');
const state = createInitialState('agot_298', 'stark', { seed: 298 });
const G = JSON.parse(fs.readFileSync('/home/user/wc-s1/tests/fixtures/headlines/golden.json','utf8'));
let pass=0, tot=0; const pairs=[];
for (const a of G) for (const b of G) { if (a===b) continue; tot++; const r = scoreCard({headline:a.reference, summary:a.summary}, b, state); if (r.pass) { pass++; pairs.push(a.id+' -> '+b.id); } }
console.log('cross pass', pass, '/', tot); console.log(pairs.join('\n'));
// degenerate inputs
for (const c of [{}, {headline:''}, {headline:null,summary:null}, undefined, {headline:'   '}, {headline: 'Robb Stark slain', summary: '   '}]) console.log(JSON.stringify(c), scoreCard(c, {facts: []}, state).faults.join(','));
console.log(scoreCard({headline:'Robb Stark slain by Tywin Lannister'}, {}, state).faults.join(','));
console.time('t'); for (let i=0;i<20;i++) for (const g of G) scoreCard({headline:g.reference, summary:g.summary}, g, state); console.timeEnd('t');
