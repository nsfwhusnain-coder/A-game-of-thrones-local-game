import { REPO } from './paths.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
process.env.WC_PROVIDER='mock'; process.env.WC_SAVES=fs.mkdtempSync(path.join(os.tmpdir(),'wc-bh-realm-'));
const repo=REPO + '/'; const im=(p)=>import(pathToFileURL(repo+p).href);
const game=await im('server/game.js');
const {id}=game.newGame('agot_298','stark',{seed:5});
for(let i=0;i<3;i++){ await game.advance(id,{span:'30d'}); await game.settled(id); }
const v=game.realmView(id,{}); console.log(Object.keys(v).join(',')); const rows=v.rows||v.houses||[]; console.log('rows',rows.length, JSON.stringify(rows[0]).slice(0,700));
const s=game.loadState(id);
const num=(c)=>{ const x=c?.v??c?.value??c; return typeof x==='number'?x:(typeof x==='object'&&x?.n!=null?x.n:NaN); };
const issues=[]; for(const r of rows){ for(const [k,c] of Object.entries(r.cells||r)){ if(c&&typeof c==='object'&&('text' in c||'v' in c)){ const t=String(c.text??''); if(/undefined|NaN|null|Infinity|\[object/.test(t)) issues.push(`${r.id}.${k}: ${t}`); } } }
console.log('text issues', issues.slice(0,10));
// ships for landlocked, swords > people
const hs=Object.values(s.houses).filter(h=>h.status!=='extinct');
let odd=[]; for(const h of hs){ const f=h.figures||{}; const lev=Number(f.levies?.v), ships=Number(f.ships?.v), maa=Number(f.menAtArms?.v); const pop=Object.values(s.holdings).filter(l=>l.owner===h.id).reduce((a,l)=>a+(l.population||0),0); if(lev>pop*0.5&&pop>0) odd.push(`${h.id}: levies ${Math.round(lev)} vs population ${Math.round(pop)}`); }
console.log('levies > half the population:', odd.length, odd.slice(0,8));
const noLand=hs.filter(h=>!h.landless&&!Object.values(s.holdings).some(l=>l.owner===h.id)); console.log('houses with no holdings (not landless):', noLand.length, noLand.slice(0,8).map(h=>h.id).join(','));
const noMen=hs.filter(h=>Number(h.figures?.levies?.v)===0&&h.rank!=='company'); console.log('houses with 0 levies:', noMen.length);
const rich=hs.sort((a,b)=>Number(b.figures?.treasury?.v)-Number(a.figures?.treasury?.v)).slice(0,5).map(h=>h.id+':'+Math.round(h.figures.treasury.v)); console.log('richest', rich.join(' '));
const big=hs.sort((a,b)=>Number(b.figures?.levies?.v)-Number(a.figures?.levies?.v)).slice(0,6).map(h=>h.id+':'+Math.round(h.figures.levies.v)); console.log('biggest levies', big.join(' '));
fs.rmSync(process.env.WC_SAVES,{recursive:true,force:true});
