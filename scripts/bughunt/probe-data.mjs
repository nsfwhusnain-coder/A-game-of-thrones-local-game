import { REPO } from './paths.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
process.env.WC_PROVIDER='mock'; process.env.WC_SAVES=fs.mkdtempSync(path.join(os.tmpdir(),'wc-bh-data-'));
const repo=REPO + '/'; const im=(p)=>import(pathToFileURL(repo+p).href);
const game=await im('server/game.js');
const {id}=game.newGame('agot_298','stark',{seed:5}); const s=game.loadState(id);
const out=[]; const add=(r,t)=>out.push([r,t]);
const C=s.characters, Hs=s.houses, L=s.holdings;
for(const c of Object.values(C)){
  if(c.spouse){ const sp=C[c.spouse]; if(!sp) add('spouse-missing',`${c.id} spouse ${c.spouse} does not exist`); else if(sp.spouse!==c.id) add('spouse-asymmetric',`${c.id}.spouse=${c.spouse} but ${sp.id}.spouse=${sp.spouse}`); else if(c.sex&&sp.sex&&c.sex===sp.sex) add('spouse-same-sex',`${c.name} & ${sp.name}`); }
  for(const k of ['father','mother']){ const p=C[c[k]]; if(c[k]&&!p) add('parent-missing',`${c.id}.${k} ${c[k]} does not exist`); else if(p){ if(k==='father'&&p.sex==='F') add('parent-sex',`${c.name}'s father ${p.name} is female`); if(k==='mother'&&p.sex==='M') add('parent-sex',`${c.name}'s mother ${p.name} is male`); if(c.born!=null&&p.born!=null&&c.born-p.born<13) add('parent-too-young',`${p.name} (b.${p.born}) parent of ${c.name} (b.${c.born})`); if(c.born!=null&&p.born!=null&&p.alive&&k==='mother'&&c.born-p.born>50) add('mother-too-old',`${p.name} b.${p.born} -> ${c.name} b.${c.born}`);} }
  if(c.house&&!Hs[c.house]) add('house-missing',`${c.id} house ${c.house}`);
  if(c.loc&&!L[c.loc]&&!(s.parties[c.loc])) add('loc-unknown',`${c.id} loc ${c.loc}`);
  if(c.alive&&c.age!=null&&c.born!=null&&Math.abs((298-c.born)-c.age)>1) add('age-born',`${c.name} age ${c.age} born ${c.born}`);
  if(!c.name||/undefined|null/.test(c.name)) add('name',`${c.id} name ${c.name}`);
  if(c.alive&&!c.bio) add('no-bio',c.id);
}
for(const h of Object.values(Hs)){
  if(h.lord&&!C[h.lord]) add('lord-missing',`${h.id} lord ${h.lord}`);
  else if(h.lord&&C[h.lord].house!==h.id&&!h.regent) add('lord-other-house',`${h.id} lord ${h.lord} is of ${C[h.lord].house}`);
  if(h.seat&&!L[h.seat]) add('seat-missing',`${h.id} seat ${h.seat}`);
  if(h.liege&&!Hs[h.liege]) add('liege-missing',`${h.id} liege ${h.liege}`);
  // liege cycles
  let x=h.id,n=0; const seen=new Set(); while(x&&Hs[x]&&n++<20){ if(seen.has(x)){ add('liege-cycle',h.id); break;} seen.add(x); x=Hs[x].liege; }
  if(h.heir&&!C[h.heir]) add('heir-missing',`${h.id} heir ${h.heir}`);
  if(h.heir&&C[h.heir]&&!C[h.heir].alive) add('heir-dead',`${h.id} heir ${h.heir} is dead`);
  if(h.heir&&h.heir===h.lord) add('heir-is-lord',h.id);
}
for(const l of Object.values(L)){ if(l.owner&&!Hs[l.owner]) add('owner-missing',`${l.id} owner ${l.owner}`); if(!l.pos||!Number.isFinite(l.pos[0])) add('holding-pos',l.id); if(!l.name) add('holding-name',l.id); }
for(const p of Object.values(s.parties)){ if(p.commander&&!C[p.commander]) add('party-cmd',`${p.id} commander ${p.commander}`); for(const m of p.members||[]) if(!C[m]) add('party-member',`${p.id} member ${m}`); }
// seats shared by two houses / same name
const names={}; for(const l of Object.values(L)) (names[l.name]=names[l.name]||[]).push(l.id); for(const [n,v] of Object.entries(names)) if(v.length>1) add('dup-holding-name',`${n}: ${v.join(',')}`);
const hn={}; for(const h of Object.values(Hs)) (hn[h.name]=hn[h.name]||[]).push(h.id); for(const [n,v] of Object.entries(hn)) if(v.length>1) add('dup-house-name',`${n}: ${v.join(',')}`);
const cn={}; for(const c of Object.values(C)) (cn[c.name]=cn[c.name]||[]).push(c.id); for(const [n,v] of Object.entries(cn)) if(v.length>1) add('dup-char-name',`${n}: ${v.join(',')}`);
// holdings stacked on the same spot
const at={}; for(const l of Object.values(L)){ const k=l.pos.map(x=>Math.round(x*2)/2).join(','); (at[k]=at[k]||[]).push(l.id); } for(const [k,v] of Object.entries(at)) if(v.length>1) add('holdings-same-spot',`${k}: ${v.join(',')}`);
const by={}; for(const [r,t] of out) (by[r]=by[r]||[]).push(t); for(const [r,v] of Object.entries(by)) console.log(r, v.length, '→', v.slice(0,6).join(' | '));
console.log('chars',Object.keys(C).length,'houses',Object.keys(Hs).length,'holdings',Object.keys(L).length,'parties',Object.keys(s.parties).length);
fs.rmSync(process.env.WC_SAVES,{recursive:true,force:true});
