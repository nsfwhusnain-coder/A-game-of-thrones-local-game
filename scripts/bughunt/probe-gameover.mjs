import { REPO } from './paths.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
process.env.WC_PROVIDER='mock'; process.env.WC_SAVES=fs.mkdtempSync(path.join(os.tmpdir(),'wc-bh-over-'));
const repo=REPO + '/'; const im=(p)=>import(pathToFileURL(repo+p).href);
const game=await im('server/game.js'); const V=await im('public/js/engine/state/validate.js');
const say=(...a)=>console.log(...a);
async function scenario(name, killIds){
  const {id}=game.newGame('agot_298','stark',{seed:5}); await game.advance(id,{span:'7d'}); await game.settled(id);
  const r=game.editState(id,{changes:killIds.map(c=>({op:'character',id:c,alive:false,cause:'a test'}))});
  say(`-- ${name}: edit applied ${r.applied.length}, rejected ${JSON.stringify(r.rejected).slice(0,120)}`);
  for(let i=0;i<3;i++){ try{ const out=await game.advance(id,{span:'14d'}); await game.settled(id); const s=game.loadState(id); const me=s.houses.stark; say(`   turn ${s.meta.turn}: lord=${me.lord} (${s.characters[me.lord]?.name}, alive ${s.characters[me.lord]?.alive}) regent=${me.regent||'-'} status=${me.status} heir=${me.heir||'-'} invariants=${V.validate(s).length} events=${(out.turn.events||[]).filter(e=>!e.bg).slice(0,3).map(e=>e.headline).join(' | ').slice(0,200)}`); }catch(e){ say('   THREW',e.status||'',String(e.message).slice(0,160)); break; } }
  const s=game.loadState(id); say('   meta.over?', JSON.stringify(s.meta.over||s.meta.ended||s.meta.gameOver||null), 'player', s.meta.player);
}
await scenario('lord dies',['eddard_stark']);
await scenario('lord and heir die',['eddard_stark','robb_stark']);
await scenario('whole family dies',['eddard_stark','robb_stark','catelyn_stark','sansa_stark','arya_stark','bran_stark','rickon_stark','jon_snow']);
fs.rmSync(process.env.WC_SAVES,{recursive:true,force:true});
