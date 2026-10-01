import { REPO } from '../paths.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
const [house,seed,turns,who,from,to]=process.argv.slice(2);
process.env.WC_PROVIDER='mock'; process.env.WC_SAVES=fs.mkdtempSync(path.join(os.tmpdir(),'wc-bh-who-'));
const repo=REPO + '/'; const im=(p)=>import(pathToFileURL(repo+p).href);
const game=await im('server/game.js'); const Co=await im('bench/lib/coherence.js');
const {id}=game.newGame('agot_298',house,{seed:Number(seed)});
for(let n=1;n<=Number(turns);n++){ await game.advance(id,{span:'30d'}); await game.settled(id); }
const g=Co.readGame(game,id);
const rel=g.facts.filter(f=>(f.actors||[]).includes(who)||JSON.stringify(f.data||{}).includes(who)||(f.text||'').includes(who.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase()))).sort((a,b)=>(a.day??0)-(b.day??0));
for(const f of rel) if(f.day>=Number(from||0)&&f.day<=Number(to||1e9)) console.log(f.id||'', f.turn, f.day, f.kind, '|', String(f.text||'').slice(0,150), '|', JSON.stringify(f.data||{}).slice(0,120));
fs.rmSync(process.env.WC_SAVES,{recursive:true,force:true});
