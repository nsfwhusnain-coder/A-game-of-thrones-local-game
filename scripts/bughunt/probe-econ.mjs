import { REPO } from './paths.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
process.env.WC_PROVIDER='mock'; process.env.WC_SAVES=fs.mkdtempSync(path.join(os.tmpdir(),'wc-bh-econ-'));
const repo=REPO + '/'; const im=(p)=>import(pathToFileURL(repo+p).href);
const game=await im('server/game.js');
const {id}=game.newGame('agot_298','stark',{seed:21});
const snap=(s)=>{const hs=Object.values(s.houses).filter(h=>h.status!=='extinct'); const v=(h,k)=>Number(h.figures?.[k]?.v); return {d:s.meta.date.year+'-'+s.meta.date.month, deficit:hs.filter(h=>v(h,'income')<0).length, broke:hs.filter(h=>v(h,'treasury')<=0).length, negT:hs.filter(h=>v(h,'treasury')<0).length, tot:hs.length, sumT:Math.round(hs.reduce((a,h)=>a+(v(h,'treasury')||0),0)), sumI:Math.round(hs.reduce((a,h)=>a+(v(h,'income')||0),0))}};
console.log(JSON.stringify(snap(game.loadState(id))));
for (let i=1;i<=24;i++){ await game.advance(id,{span:'30d'}); await game.settled(id); if(i%6===0) console.log(i,JSON.stringify(snap(game.loadState(id)))); }
const s=game.loadState(id); const hs=Object.values(s.houses).filter(h=>h.status!=='extinct');
const v=(h,k)=>Number(h.figures?.[k]?.v);
const worst=hs.filter(h=>v(h,'income')<0).sort((a,b)=>v(a,'income')-v(b,'income')).slice(0,12);
for(const h of worst) console.log(h.id,'tier',h.tier??h.rank??'',' treasury',Math.round(v(h,'treasury')),'income',Math.round(v(h,'income')),'levies',Math.round(v(h,'levies')),'holdings',Object.values(s.holdings).filter(l=>l.owner===h.id).length, 'figkeys',Object.keys(h.figures).join(','));
const player=s.houses.stark; console.log('player',JSON.stringify(Object.fromEntries(Object.entries(player.figures).map(([k,f])=>[k,Math.round(f.v)]))));
const neg=hs.filter(h=>v(h,'treasury')<0).slice(0,8).map(h=>h.id+':'+Math.round(v(h,'treasury'))); console.log('negative treasuries',neg.join(' '));
fs.rmSync(process.env.WC_SAVES,{recursive:true,force:true});
