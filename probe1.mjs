import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
process.env.WC_SAVES = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-probe-')); process.env.WC_PROVIDER='mock';
const game = await import('/home/user/wc-s2/server/game.js');
const { standing } = await import('/home/user/wc-s2/public/js/shared/standing.js');
let t0=Date.now();
const { id, state } = game.newGame('agot_298','stark',{seed:298});
console.log('newGame', Date.now()-t0, Object.keys(state).join(','));
console.log(Object.entries(state.houses).map(([k,h])=>k+':'+h.rank+':'+h.status).join(' '));
console.log(JSON.stringify(state.meta.date), state.meta.turn, state.meta.rngState);
for (let i=0;i<5;i++){ t0=Date.now(); const r = await game.advance(id,{span:'7d'}); await game.settled(id); console.log('turn', r.turn.turn, Date.now()-t0, JSON.stringify(r.turn.span), r.turn.dateFrom, r.turn.dateTo); }
const s = game.loadState(id);
console.log(s.standing.score, standing(s,'stark').score, JSON.stringify(s.meta.rngState));
console.log(Object.keys(s.knowledge), Object.keys(s.knowledge.stark));
console.log(Object.values(s.wars).map(w=>w.id+':'+w.name+':'+w.status+':'+JSON.stringify(w.attackers)+JSON.stringify(w.defenders)+w.score));
