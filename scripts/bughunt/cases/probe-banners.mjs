import { REPO } from '../paths.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
process.env.WC_PROVIDER='mock'; process.env.WC_SAVES=fs.mkdtempSync(path.join(os.tmpdir(),'wc-bh-ban-'));
const repo=REPO + '/'; const im=(p)=>import(pathToFileURL(repo+p).href);
const game=await im('server/game.js'); const Co=await im('bench/lib/coherence.js');
const {id}=game.newGame('agot_298','stark',{seed:100});
const T=Number(process.argv[2]||14);
for(let n=1;n<=T;n++){ await game.advance(id,{span:'30d'}); await game.settled(id); }
const g=Co.readGame(game,id); const s=g.state;
const w='tywin_lannister';
const rel=g.facts.filter(f=>(f.actors||[]).includes(w)&&['levies_called','host_formed','host_disbanded','host_joined','battle','set_out','arrived','war_declared','withdrew','desertion','host_hungry'].includes(f.kind)).sort((a,b)=>a.day-b.day);
for(const f of rel.slice(0,70)) console.log(f.turn, f.day, f.kind, '|', String(f.text||'').slice(0,110));
const calls=g.facts.filter(f=>f.kind==='levies_called'); const by={}; for(const f of calls){ const k=(f.houses||[])[0]; by[k]=(by[k]||0)+1;} console.log('levies_called by house', JSON.stringify(Object.entries(by).sort((a,b)=>b[1]-a[1]).slice(0,10)));
console.log('wars', JSON.stringify((s.wars||[]).filter(x=>x.status!=='ended').map(x=>[x.id,x.sides?.map?.(z=>z.houses||z)||'',x.status])).slice(0,300));
fs.rmSync(process.env.WC_SAVES,{recursive:true,force:true});
