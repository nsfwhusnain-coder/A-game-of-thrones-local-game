import { REPO } from './paths.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
process.env.WC_PROVIDER='mock'; process.env.WC_SAVES=fs.mkdtempSync(path.join(os.tmpdir(),'wc-bh-demo-'));
const repo=REPO + '/'; const im=(p)=>import(pathToFileURL(repo+p).href);
const game=await im('server/game.js'); const Co=await im('bench/lib/coherence.js');
const {id}=game.newGame('agot_298','stark',{seed:11});
const out={}; 
for (let i=0;i<48;i++){ try{ await game.advance(id,{span:'30d'}); await game.settled(id);}catch(e){ console.log('threw',i,e.message); break; } }
const s=game.loadState(id); const g=Co.readGame(game,id);
const chars=Object.values(s.characters); const alive=chars.filter(c=>c.alive);
console.log('date',JSON.stringify(s.meta.date),'turns',g.turns.length);
console.log('alive',alive.length,'dead',chars.length-alive.length,'born>=298',chars.filter(c=>c.born>=298).length);
const kinds={}; for(const f of g.facts) kinds[f.kind]=(kinds[f.kind]||0)+1; console.log('birth facts',kinds.birth||0,'wedding',kinds.wedding||0,'betrothal',kinds.betrothal||0,'death',kinds.death||0,'succession',kinds.succession||0,'camp_fever',kinds.camp_fever||0,'illness',kinds.illness||0,'recovered',kinds.recovered||0);
// houses: lord alive? heirs? extinct?
const hs=Object.values(s.houses); const ext=hs.filter(h=>h.status==='extinct'); console.log('houses',hs.length,'extinct',ext.length);
const noLord=hs.filter(h=>h.status!=='extinct'&&!h.landless&&(!h.lord||!s.characters[h.lord]?.alive)); console.log('living houses with no living lord',noLord.length, noLord.slice(0,10).map(h=>h.id+':'+h.lord+':'+(h.regent||'-')).join(' '));
const ages=alive.map(c=>c.age).filter(Number.isFinite).sort((a,b)=>a-b); console.log('age min/med/max',ages[0],ages[ages.length>>1],ages.at(-1),'over 70:',ages.filter(a=>a>=70).length);
// player house
const me=s.houses.stark; console.log('stark lord',me.lord,s.characters[me.lord]?.name,'alive',s.characters[me.lord]?.alive);
const stark=chars.filter(c=>c.house==='stark'); console.log('stark folks alive',stark.filter(c=>c.alive).map(c=>c.name+'('+c.age+')').join(', '));
console.log('dead stark',stark.filter(c=>!c.alive).map(c=>c.name).join(', '));
// spouses
const mar=alive.filter(c=>c.spouse); console.log('married alive',mar.length);
const widowed=alive.filter(c=>c.spouse&&!s.characters[c.spouse]?.alive); console.log('alive with dead spouse',widowed.length, widowed.slice(0,5).map(c=>c.name).join(', '));
const orphan=alive.filter(c=>c.age<16&&((c.father&&!s.characters[c.father]?.alive)&&(c.mother&&!s.characters[c.mother]?.alive))); console.log('child orphans',orphan.length);
console.log('wedding/betrothal facts', g.facts.filter(f=>['wedding','betrothal'].includes(f.kind)).map(f=>f.text).join(' | ').slice(0,400));
fs.rmSync(process.env.WC_SAVES,{recursive:true,force:true});
