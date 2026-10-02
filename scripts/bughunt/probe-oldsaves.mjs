import { REPO, out } from './paths.mjs';
import fs from 'node:fs'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
process.env.WC_PROVIDER='mock'; process.env.WC_SAVES=out('saves-copy');
const repo=REPO + '/'; const im=(p)=>import(pathToFileURL(repo+p).href);
const game=await im('server/game.js'); const V=await im('public/js/engine/state/validate.js');
for(const id of fs.readdirSync(process.env.WC_SAVES).filter(x=>fs.statSync(path.join(process.env.WC_SAVES,x)).isDirectory())){
  const files=fs.readdirSync(path.join(process.env.WC_SAVES,id)); 
  try{ const s=game.loadState(id); const v0=V.validate(s); const before=s.meta.turn; await game.advance(id,{span:'7d'}); await game.settled(id); const s2=game.loadState(id); const v1=V.validate(s2);
    console.log(id,'| version',s.version,'turn',before,'->',s2.meta.turn,'| invariants before',v0.length,'after',v1.length,'|',v1[0]||'', '| files',files.filter(f=>/state|snap/.test(f)).join(','));
  }catch(e){ console.log(id,'THREW',e.status||'',String(e.message).slice(0,160)); }
}
