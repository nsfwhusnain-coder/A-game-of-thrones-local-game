import { REPO } from './paths.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
process.env.WC_PROVIDER='mock'; process.env.WC_SAVES=fs.mkdtempSync(path.join(os.tmpdir(),'wc-bh-set-'));
const repo=REPO + '/'; const im=(p)=>import(pathToFileURL(repo+p).href);
const game=await im('server/game.js'); const V=await im('public/js/engine/state/validate.js'); const S=await im('public/data/scenarios.js');
console.log('scenarios', Object.keys(S.SCENARIOS||S.default||S).join(','));
const out=[]; const note=(t)=>{ out.push(t); console.log(t); };
for(const [label,opts] of [['ironman',{ironman:true}],['sandbox',{canonGravity:'sandbox'}],['loose',{canonGravity:'loose'}],['maturity-mild',{maturity:'mild'}],['maturity-mature',{maturity:'mature'}],['maturity-bogus',{maturity:'zzz'}],['gravity-bogus',{canonGravity:'zzz'}]]){
  try{ const {id}=game.newGame('agot_298','stark',{seed:3,...opts}); let broke=0; for(let i=0;i<6;i++){ await game.advance(id,{span:'14d'}); await game.settled(id); broke+=V.validate(game.loadState(id)).length; }
    let undo; try{ await game.undo(id,{turns:1}); undo='allowed'; }catch(e){ undo='refused: '+e.message; }
    const s=game.loadState(id); const dead=Object.values(s.characters).filter(c=>!c.alive).map(c=>c.id); note(`${label}: ok, invariants broken ${broke}, undo ${undo}, meta.settings=${JSON.stringify(s.meta.settings)}, dead=${dead.length}`);
  }catch(e){ note(`${label}: THREW ${e.status||''} ${e.message}`); }
}
// canon pillars in sandbox: does Eddard/Robert die early?
try{ const {id}=game.newGame('agot_298','stark',{seed:3,canonGravity:'sandbox'}); for(let i=0;i<24;i++){ await game.advance(id,{span:'30d'}); await game.settled(id); } const s=game.loadState(id); note('sandbox 24 months: dead pillars '+['eddard_stark','robert_baratheon','tywin_lannister','jon_snow','daenerys_targaryen','cersei_lannister'].filter(k=>!s.characters[k]?.alive).join(',')+' ; date '+JSON.stringify(s.meta.date)); }catch(e){ note('sandbox long THREW '+e.message); }
fs.rmSync(process.env.WC_SAVES,{recursive:true,force:true});
