import { REPO } from '../paths.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
process.env.WC_PROVIDER='mock'; process.env.WC_SAVES=fs.mkdtempSync(path.join(os.tmpdir(),'wc-bh-guard-'));
const repo=REPO + '/'; const im=(p)=>import(pathToFileURL(repo+p).href);
const game=await im('server/game.js'); const Co=await im('bench/lib/coherence.js');
const {id}=game.newGame('agot_298','golden_company',{seed:205});
for(let n=1;n<=13;n++){ await game.advance(id,{span:'30d'}); await game.settled(id); }
const g=Co.readGame(game,id);
const rel=g.facts.filter(f=>(f.place==='stark'||(f.houses||[]).includes('stark')||JSON.stringify(f.data||{}).includes('"stark"'))&&['siege_begun','siege_lifted','holding_fell','war_declared','storm_assault','relief_near','stand_off','sally','withdrew','terms_refused','battle','host_formed','arrived','set_out','levies_called'].includes(f.kind)&&f.day>=107560&&f.day<=107830).sort((a,b)=>a.day-b.day);
for(const f of rel) console.log(f.id,f.turn,f.day,f.kind,'|',String(f.text||'').slice(0,120),'|',JSON.stringify(f.data||{}).slice(0,140),'|',JSON.stringify(f.cause||{}).slice(0,80));
const p=g.state.parties.winterfell_guard; const w=g.state.holdings.stark; console.log('winterfell now', JSON.stringify({owner:w.owner,status:w.status})); console.log('wars', JSON.stringify((g.state.wars||[]).map(x=>({id:x.id,att:x.attackers,def:x.defenders,status:x.status})).slice(0,6)));
fs.rmSync(process.env.WC_SAVES,{recursive:true,force:true});
