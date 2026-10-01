import { REPO } from './paths.mjs';
import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
const ROOT=REPO; const PORT=3430; const saves=fs.mkdtempSync(path.join(os.tmpdir(),'wc-bh-race-'));
const srv=spawn(process.execPath,['server/index.js'],{cwd:ROOT,env:{...process.env,PORT:String(PORT),WC_PROVIDER:'mock',WC_SAVES:saves},stdio:'ignore'});
const call=async(m,p,body,to=120000)=>{ const t0=Date.now(); try{ const r=await fetch(`http://127.0.0.1:${PORT}/api${p}`,{method:m,headers:{'content-type':'application/json'},body:body!==undefined?JSON.stringify(body):undefined,signal:AbortSignal.timeout(to)}); const t=await r.text(); let j; try{j=JSON.parse(t)}catch{j=t} return {s:r.status,j,ms:Date.now()-t0}; }catch(e){ return {s:'ERR',j:String(e.message),ms:Date.now()-t0}; } };
const V=await import(pathToFileURL(REPO + '/public/js/engine/state/validate.js').href);
const out=[]; const note=(k,t)=>{ out.push(k); console.log(`[${k}] ${t}`); };
try{
  for(let i=0;i<100;i++){ const r=await call('GET','/version'); if(r.s===200) break; await new Promise(r=>setTimeout(r,100)); }
  const g=(await call('POST','/games',{scenario:'agot_298',house:'stark',seed:5})).j; const id=g.id;
  // A: start a long jump and poke the save while it runs
  const job=(await call('POST',`/games/${id}/jump`,{span:'90d',orders:[]})).j; note('jump',`started ${JSON.stringify(job)}`);
  await new Promise(r=>setTimeout(r,800));
  const u=await call('POST',`/games/${id}/undo`,{turns:1}); note('undo-during-jump',`${u.s} ${JSON.stringify(u.j).slice(0,120)}`);
  const t=await call('POST',`/games/${id}/talk`,{character:'robb_stark',message:'hello'}); note('talk-during-jump',`${t.s} ${JSON.stringify(t.j).slice(0,100)}`);
  const o=await call('POST',`/games/${id}/orders`,{orders:[{id:'z1',text:'lower taxes'}]}); note('orders-during-jump',`${o.s} ${JSON.stringify(o.j).slice(0,100)}`);
  const j2=await call('POST',`/games/${id}/jump`,{span:'7d'}); note('second-jump',`${j2.s} ${JSON.stringify(j2.j).slice(0,100)}`);
  const a=await call('POST',`/games/${id}/advance`,{span:'7d',orders:[]}); note('advance-during-jump',`${a.s} ${typeof a.j==='string'?a.j.slice(0,80):'ok'}`);
  const d=await call('DELETE',`/games/${id}`); note('delete-during-jump',`${d.s} ${JSON.stringify(d.j).slice(0,80)}`);
  await new Promise(r=>setTimeout(r,25000));
  const after=await call('GET',`/games/${id}`); note('after',`${after.s} ${after.s===200?`turn ${after.j.meta?.turn}, date ${JSON.stringify(after.j.meta?.date)}, invariants ${V.validate(after.j).length}`:JSON.stringify(after.j).slice(0,100)}`);
  const list=await call('GET','/saves'); note('saves',`${JSON.stringify(list.j).length} bytes, ${Array.isArray(list.j)?list.j.length:'?'} saves`);
  // B: SSE stream of a job
  const g2=(await call('POST','/games',{scenario:'agot_298',house:'stark',seed:6})).j; const jb=(await call('POST',`/games/${g2.id}/jump`,{span:'30d',orders:[]})).j.job;
  const r=await fetch(`http://127.0.0.1:${PORT}/api/games/${g2.id}/jump/${jb}/stream`).catch(e=>({ok:false,status:'ERR '+e.message})); note('stream',`status ${r.status}`);
  if(r.ok){ const txt=await r.text(); note('stream-body',`${txt.length} bytes; events: ${[...txt.matchAll(/^event: (\w+)/gm)].map(m=>m[1]).join(',')}`); }
}catch(e){ console.log('ERR',e.message); } finally{ try{srv.kill();}catch{} fs.rmSync(saves,{recursive:true,force:true}); }
