import { BH_OUT, REPO } from './paths.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
process.env.WC_PROVIDER='mock'; process.env.WC_SAVES=fs.mkdtempSync(path.join(os.tmpdir(),'wc-bh-all-'));
const repo=REPO + '/'; const im=(p)=>import(pathToFileURL(repo+p).href);
const game=await im('server/game.js'); const V=await im('public/js/engine/state/validate.js'); const H=await im('public/data/houses.js');
const ids=Object.keys((await im('server/game.js')).loadState((game.newGame('agot_298','stark',{seed:1})).id).houses);
const BAD=/\bundefined\b|\bNaN\b|\[object|\bnull\b|\{\{|\}\}|\bthe the\b|\bundefined's|Infinity/;
const res=[]; const t0=Date.now();
for(const h of ids){
  const rec={house:h,issues:[]};
  try{ const {id}=game.newGame('agot_298',h,{seed:7}); const s0=game.loadState(id); if(!s0.houses[h].lord&&!s0.houses[h].landless) rec.issues.push('no lord'); 
    for(let i=0;i<2;i++){ const r=await game.advance(id,{span:'14d'}); await game.settled(id); const T=r.turn; for(const e of T.events||[]) for(const x of [e.headline,e.summary,...(e.details||[]),...(e.record||[])]) if(typeof x==='string'&&BAD.test(x)) rec.issues.push('text: '+x.slice(0,100)); for(const x of [T.summary,T.digest?.text,T.meanwhile]) if(typeof x==='string'&&BAD.test(x)) rec.issues.push('turn text: '+x.slice(0,100)); const v=V.validate(game.loadState(id)); if(v.length) rec.issues.push('invariant: '+v[0]); }
    // the player's own views
    const rv=game.realmView(id,{}); if(!rv?.rows?.length) rec.issues.push('empty realm view');
    const st=game.loadState(id); const me=st.houses[h]; const lordName=st.characters[me.lord]?.name; if(me.lord&&!lordName) rec.issues.push('lord has no name'); 
    game.deleteSave(id);
  }catch(e){ rec.issues.push('THREW '+String(e.message).slice(0,160)); }
  if(rec.issues.length){ res.push(rec); console.log(h, JSON.stringify([...new Set(rec.issues)].slice(0,3))); }
}
console.log('played',ids.length,'houses in',Math.round((Date.now()-t0)/1000),'s; with issues',res.length);
fs.writeFileSync(BH_OUT + '/play-all-houses.json',JSON.stringify(res,null,1));
fs.rmSync(process.env.WC_SAVES,{recursive:true,force:true});
