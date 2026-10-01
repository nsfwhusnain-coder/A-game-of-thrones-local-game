import { REPO } from './paths.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
process.env.WC_PROVIDER='mock'; process.env.WC_SAVES=fs.mkdtempSync(path.join(os.tmpdir(),'wc-bh-miss-'));
const repo=REPO + '/'; const im=(p)=>import(pathToFileURL(repo+p).href);
const game=await im('server/game.js');
const {id}=game.newGame('agot_298','stark',{seed:5}); await game.advance(id,{span:'7d'}); await game.settled(id);
const f=path.join(process.env.WC_SAVES,id,'state.json'); const base=fs.readFileSync(f,'utf8'); const keys=Object.keys(JSON.parse(base));
console.log('top-level keys:',keys.join(','));
const res=[];
for(const k of keys){ if(['version','meta','houses','characters','holdings'].includes(k)) continue; const s=JSON.parse(base); delete s[k]; fs.writeFileSync(f,JSON.stringify(s));
  try{ await game.advance(id,{span:'7d'}); await game.settled(id); res.push(k+': ok'); }catch(e){ res.push(k+': THREW '+String(e.message).slice(0,100)); }
  fs.writeFileSync(f,base); }
for(const r of res) console.log(r);
fs.rmSync(process.env.WC_SAVES,{recursive:true,force:true});
