import { REPO } from './paths.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
process.env.WC_PROVIDER='mock'; process.env.WC_SAVES=fs.mkdtempSync(path.join(os.tmpdir(),'wc-bh-age-'));
const repo=REPO + '/'; const im=(p)=>import(pathToFileURL(repo+p).href);
const game=await im('server/game.js');
const {id}=game.newGame('agot_298','stark',{seed:7});
const a=game.loadState(id); const pick=['eddard_stark','robb_stark','bran_stark','sansa_stark','arya_stark','rickon_stark','jon_snow','joffrey_baratheon','tommen_baratheon'];
const snap=(s)=>Object.fromEntries(pick.map(k=>[k,[s.characters[k]?.age,s.characters[k]?.birth??s.characters[k]?.born??s.characters[k]?.birthYear]]));
console.log('start',s0(a)); function s0(s){return JSON.stringify({date:s.meta.date,...snap(s)})}
for (let i=0;i<8;i++){ await game.advance(id,{span:'1y'}).catch(e=>console.log('err',e.message)); await game.settled(id); const s=game.loadState(id); console.log(s0(s)); }
const s=game.loadState(id); console.log('char keys', Object.keys(s.characters.eddard_stark).join(','));
console.log('alive', Object.values(s.characters).filter(c=>c.alive).length,'children<16', Object.values(s.characters).filter(c=>c.alive&&c.age<16).length);
fs.rmSync(process.env.WC_SAVES,{recursive:true,force:true});
