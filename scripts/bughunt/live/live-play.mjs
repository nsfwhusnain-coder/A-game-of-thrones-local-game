// Live-model sampling against the isolated server on 3424: orders, 3 turns, audiences, council. Writes out/live-<name>.txt. Reads, never fixes.
import { BH_OUT } from '../paths.mjs';
import fs from 'node:fs';
const PORT=3424; const base=`http://127.0.0.1:${PORT}/api`;
const api=async(p,body,to=600000)=>{ const r=await fetch(base+p,{method:body?'POST':'GET',headers:{'content-type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(to)}); const t=await r.text(); let j; try{j=JSON.parse(t)}catch{j=t} if(!r.ok) throw new Error(r.status+' '+String(j.error||t).slice(0,200)); return j; };
const name=process.argv[2]||'stark'; const house=process.argv[3]||'stark'; const seed=Number(process.argv[4]||7); const turns=Number(process.argv[5]||3);
let log=''; const P=(s)=>{ log+=s+'\n'; console.log(s); };
const g=await api('/games',{scenario:'agot_298',house,seed}); const id=g.id; P(`# game ${id} (${house}, seed ${seed})`);
const ORD=JSON.parse(process.env.ORD);
for(let n=0;n<turns;n++){
  const orders=(ORD[n]||[]).map((text,i)=>({id:`x${n}${i}`,text}));
  const t0=Date.now(); let r; try{ r=await api(`/games/${id}/advance`,{span:process.env.SPAN||'7d',orders}); }catch(e){ P(`!! advance ${n+1} failed: ${e.message}`); break; }
  const T=r.turn||r; P(`\n=== turn ${n+1} · ${T.date} · ${Math.round((Date.now()-t0)/1000)} s ===`);
  for(const o of T.orders||[]) P(`ORDER «${o.text}» → ${o.status}${o.result?': '+[].concat(o.result).join(' / '):''}`);
  P('NARRATION: '+(T.narration||'')); P('SUMMARY: '+(T.summary||'')); P('DIGEST: '+(T.digest?.text||''));
  for(const e of (T.events||[]).filter(e=>!e.bg).slice(0,14)) P(`* [${e.kind}|${e.told||''}] ${e.headline} — ${String(e.summary||'').slice(0,240)}${e.record?'  ¶ '+e.record.join(' ¶ ').slice(0,500):''}`);
  if(T.meanwhile) P('MEANWHILE: '+T.meanwhile);
  if(T.rejected?.length) P('REJECTED: '+JSON.stringify(T.rejected).slice(0,400));
}
// audiences
const AUD=JSON.parse(process.env.AUD);
for(const [c,m] of AUD){ const t0=Date.now(); try{ const r=await api(`/games/${id}/talk`,{character:c,message:m},300000); P(`\nTALK ${c} «${m}» (${Math.round((Date.now()-t0)/1000)} s)\n  → ${JSON.stringify(r.reply||r.text||r).slice(0,700)}`); }catch(e){ P(`\nTALK ${c} failed: ${e.message}`); } }
try{ const r=await api(`/games/${id}/council`,{members:JSON.parse(process.env.COUNCIL),message:process.env.CMSG},300000); P('\nCOUNCIL → '+JSON.stringify(r).slice(0,1200)); }catch(e){ P('\nCOUNCIL failed: '+e.message); }
fs.writeFileSync(`${BH_OUT}/live-${name}.txt`,log);
