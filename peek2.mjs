process.env.WC_PROVIDER='mock';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
process.env.WC_SAVES = fs.mkdtempSync(path.join(os.tmpdir(),'wc-x-'));
const { createInitialState, applyChanges } = await import('/home/user/wc-s1/public/js/shared/world.js');
const { resolveWarfare } = await import('/home/user/wc-s1/public/js/shared/battles.js');
const { settle, ref } = await import('/home/user/wc-s1/public/js/engine/parties.js');
const { makeRng, seedState } = await import('/home/user/wc-s1/public/js/engine/rng.js');
const s = createInitialState('agot_298','stark',{seed:298});
applyChanges(s,[{op:'character',id:'jaime_lannister',alive:false,cause:'executed by order of House Stark',by:'eddard_stark'}],{source:'t'});
console.log(JSON.stringify(s.facts.at(-1)));
const b = createInitialState('agot_298','stark',{seed:3});
applyChanges(b,[{op:'war',status:'start',name:'W',attackers:['lannister'],defenders:['stark']}],{source:'test'});
const host=(id,owner,pos,men,extra)=>{applyChanges(b,[{op:'army_create',id,owner,name:'H '+id,at:null,men}],{source:'t'});const p=b.parties[id];p.pos=[...pos];p.at=null;delete p.units;Object.assign(p,extra);for(const m of [...(p.members||[])]) if(m!==p.commander)p.members=p.members.filter(x=>x!==m);const c=b.characters[p.commander];c.loc=ref(id);p.members=[...new Set([...(p.members||[]),c.id])];settle(b,p);};
host('a','lannister',[560,1440],30000,{standing:'always',commander:'tywin_lannister'}); host('b','stark',[562,1440],6000,{commander:'theon_greyjoy'});
for (const seed of [5,32,53]) { const t=JSON.parse(JSON.stringify(b)); const g=makeRng(seedState(seed)); resolveWarfare(t,1,{r:()=>g.next()}); for (const f of t.facts.slice(b.facts.length)) if (/battle/.test(f.kind)) console.log(seed, f.kind, JSON.stringify({place:f.place, data: f.kind==='battle'? {winnerHouse:f.data.winnerHouse, loserHouse:f.data.loserHouse, how:f.data.how}: f.data})); }
fs.rmSync(process.env.WC_SAVES,{recursive:true,force:true});
