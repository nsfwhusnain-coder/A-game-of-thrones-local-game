import { BH_OUT, REPO } from './paths.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
const [house='stark',seed='33',turns='10',span='7d',outf='corpus.txt']=process.argv.slice(2);
process.env.WC_PROVIDER='mock'; process.env.WC_SAVES=fs.mkdtempSync(path.join(os.tmpdir(),'wc-bh-corp-'));
const repo=REPO + '/'; const im=(p)=>import(pathToFileURL(repo+p).href);
const game=await im('server/game.js');
const {id}=game.newGame('agot_298',house,{seed:Number(seed)});
let out='';
for(let n=1;n<=Number(turns);n++){ const r=await game.advance(id,{span}); await game.settled(id); const T=r.turn; const s=game.loadState(id);
  out+=`\n=== turn ${n} · ${T.dateLabel||T.date||JSON.stringify(s.meta.date)} ===\n`;
  for(const e of T.events||[]) out+=`${e.bg?'  (bg) ':'* '}[${e.kind||e.tier||''}] ${e.headline||e.title||''} — ${String(e.summary||e.text||'').slice(0,260)}\n`;
  if(T.meanwhile) out+=`~ meanwhile: ${T.meanwhile}\n`; if(T.digest?.text) out+=`~ digest: ${T.digest.text}\n`;
  for(const a of T.applied||[]) out+=`> applied: ${a.text}\n`; }
fs.writeFileSync(BH_OUT + '/' +outf,out); console.log('lines',out.split('\n').length);
fs.rmSync(process.env.WC_SAVES,{recursive:true,force:true});
