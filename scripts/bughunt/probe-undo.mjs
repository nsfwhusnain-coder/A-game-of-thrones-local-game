import { REPO } from './paths.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import crypto from 'node:crypto'; import { pathToFileURL } from 'node:url';
process.env.WC_PROVIDER='mock'; process.env.WC_SAVES=fs.mkdtempSync(path.join(os.tmpdir(),'wc-bh-undo-'));
const repo=REPO + '/'; const im=(p)=>import(pathToFileURL(repo+p).href);
const game=await im('server/game.js');
const H=(s)=>{ const c=JSON.parse(JSON.stringify(s)); delete c.history; return crypto.createHash('sha1').update(JSON.stringify(c)).digest('hex').slice(0,10); };
const mk=()=>game.newGame('agot_298','stark',{seed:5}).id;
const a=mk(); const hs=[H(game.loadState(a))]; const dates=[JSON.stringify(game.loadState(a).meta.date)];
for(let i=0;i<4;i++){ await game.advance(a,{span:'7d'}); await game.settled(a); const s=game.loadState(a); hs.push(H(s)); dates.push(JSON.stringify(s.meta.date)); }
console.log('forward hashes',hs.join(' '));
console.log('undo depth',game.undoDepth(a));
const back=[]; for(let i=0;i<4;i++){ try{ await game.undo(a,{turns:1}); }catch(e){ back.push('ERR '+e.message); break; } back.push(H(game.loadState(a))+'@'+JSON.stringify(game.loadState(a).meta.date).slice(0,30)); }
console.log('after undos  ',back.join(' ')); console.log('expected back',[...hs].reverse().slice(1).join(' '));
// re-advance: same as before?
const re=[]; for(let i=0;i<4;i++){ await game.advance(a,{span:'7d'}); await game.settled(a); re.push(H(game.loadState(a))); } console.log('re-advance   ',re.join(' '),' same as first run:',JSON.stringify(re)===JSON.stringify(hs.slice(1)));
// a second game, same seed: determinism between games
const b=mk(); const hb=[H(game.loadState(b))]; for(let i=0;i<4;i++){ await game.advance(b,{span:'7d'}); await game.settled(b); hb.push(H(game.loadState(b))); } console.log('second game  ',hb.join(' '),' same as first:',JSON.stringify(hb)===JSON.stringify(hs));
// undo with orders pending / undo on turn 0
const c=mk(); try{ const r=await game.undo(c,{turns:1}); console.log('undo at turn 0 ->',JSON.stringify(r).slice(0,120)); }catch(e){ console.log('undo at turn 0 threw',e.status,e.message); }
try{ const r=await game.undo(a,{turns:99}); console.log('undo 99 ->',JSON.stringify(r).slice(0,160), 'now', JSON.stringify(game.loadState(a).meta.date)); }catch(e){ console.log('undo 99 threw',e.status,e.message); }
fs.rmSync(process.env.WC_SAVES,{recursive:true,force:true});
