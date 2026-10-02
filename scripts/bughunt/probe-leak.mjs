import { REPO } from './paths.mjs';
import { spawn } from 'node:child_process'; import { createRequire } from 'node:module'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT=REPO; const PORT=3431; const require=createRequire(REPO + '/package.json'); const { chromium }=require('playwright');
const saves=fs.mkdtempSync(path.join(os.tmpdir(),'wc-bh-leak-'));
const srv=spawn(process.execPath,['server/index.js'],{cwd:ROOT,env:{...process.env,PORT:String(PORT),WC_PROVIDER:'mock',WC_SAVES:saves},stdio:'ignore'});
const api=async(p,body)=>{ const r=await fetch(`http://127.0.0.1:${PORT}/api${p}`,body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{}); return r.json(); };
let browser;
try{
  for(let i=0;i<100;i++){ try{ await fetch(`http://127.0.0.1:${PORT}/api/version`); break; }catch{ await new Promise(r=>setTimeout(r,100)); } }
  const g=await api('/games',{scenario:'agot_298',house:'stark',seed:5});
  browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--enable-precise-memory-info','--js-flags=--expose-gc']});
  const page=await browser.newPage({viewport:{width:1366,height:768}}); page.setDefaultTimeout(120000); const errs=[]; page.on('pageerror',e=>errs.push(e.message.slice(0,160)));
  await page.addInitScript((gid)=>{ try{ localStorage.setItem('voice-download','"off"'); localStorage.setItem('wc.welcomed.'+gid,'1'); localStorage.setItem('wc.coach.'+gid,'["command","turn","realm"]'); }catch{} }, g.id);
  await page.goto(`http://127.0.0.1:${PORT}/?game=${g.id}&dev`); await page.waitForSelector('#hud-top .advance-btn',{state:'visible',timeout:240000}); await page.waitForFunction(()=>{ const l=document.querySelector('#map-loading'); return !l||l.classList.contains('hidden'); },null,{timeout:240000,polling:500}); await page.waitForTimeout(2500);
  const measure=async()=>page.evaluate(()=>{ window.gc?.(); const m=performance.memory; const r=window.__wc.map.renderer?.info; return { heapMB:Math.round(m.usedJSHeapSize/1048576), nodes:document.getElementsByTagName('*').length, labels:document.querySelectorAll('.lbl').length, geoms:r?.memory?.geometries, tex:r?.memory?.textures, calls:r?.render?.calls, tris:r?.render?.triangles, entities:window.__wc.map.life?.entities?.length, turn:window.__wc.state.meta.turn, listeners:undefined }; });
  const comp=async()=>page.evaluate(()=>{ const sc=window.__wc.map.scene; const o={}; const seen=new Set(); let geoms=new Set(); sc.traverse((x)=>{ const k=x.type+(x.geometry?':'+x.geometry.type:'')+(x.isInstancedMesh?'(inst)':'')+(x.userData?.kind?'['+x.userData.kind+']':''); o[k]=(o[k]||0)+1; if(x.geometry) geoms.add(x.geometry.uuid); }); const top=Object.entries(o).sort((a,b)=>b[1]-a[1]).slice(0,14); return {objects:Object.values(o).reduce((a,b)=>a+b,0), uniqueGeoms:geoms.size, top}; });
  const c0=await comp(); console.log('SCENE0',JSON.stringify(c0));
  const rows=[await measure()]; console.log(JSON.stringify(rows[0]));
  for(let i=1;i<=8;i++){
    await page.click('#hud-top .advance-btn').catch(()=>{}); const ask=await page.$('text=Let the days pass'); if(ask) await ask.click().catch(()=>{});
    await page.waitForFunction(()=>document.querySelector('#busy')?.classList.contains('hidden'),null,{timeout:180000,polling:300}).catch(()=>{}); await page.waitForTimeout(1500);
    // poke the windows each turn: realm, people, chronicle then close
    for(const k of ['r','p','h']){ await page.keyboard.press(k); await page.waitForTimeout(500); await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); }
    if(i%2===0){ const m=await measure(); rows.push(m); console.log(JSON.stringify(m)); }
  }
  const c1=await comp(); console.log('SCENE1',JSON.stringify(c1)); console.log('errors',[...new Set(errs)].join(' | ').slice(0,300));
}catch(e){ console.log('ERR',e.message); } finally{ try{await browser?.close();}catch{} try{srv.kill();}catch{} fs.rmSync(saves,{recursive:true,force:true}); }
