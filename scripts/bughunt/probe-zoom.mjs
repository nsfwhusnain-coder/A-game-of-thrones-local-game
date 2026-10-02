import { REPO, out } from './paths.mjs';
import { spawn } from 'node:child_process'; import { createRequire } from 'node:module'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT=REPO; const PORT=3427; const require=createRequire(REPO + '/package.json'); const { chromium }=require('playwright');
const saves=fs.mkdtempSync(path.join(os.tmpdir(),'wc-bh-zoom-')); const OUT=out('ui-zoom'); fs.mkdirSync(OUT,{recursive:true});
const srv=spawn(process.execPath,['server/index.js'],{cwd:ROOT,env:{...process.env,PORT:String(PORT),WC_PROVIDER:'mock',WC_SAVES:saves},stdio:'ignore'});
const api=async(p,body)=>{ const r=await fetch(`http://127.0.0.1:${PORT}/api${p}`,body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{}); return r.json(); };
let browser; const results=[];
try{
  for(let i=0;i<100;i++){ try{ await fetch(`http://127.0.0.1:${PORT}/api/version`); break; }catch{ await new Promise(r=>setTimeout(r,100)); } }
  const house=process.argv[2]||'stark'; const g=await api('/games',{scenario:'agot_298',house,seed:5}); for(let i=0;i<5;i++) await api(`/games/${g.id}/advance`,{span:'7d',orders:[]});
  browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
  for(const [w,h] of [[1366,768],[1920,1080]]){
    const page=await browser.newPage({viewport:{width:w,height:h}}); page.setDefaultTimeout(120000);
    await page.addInitScript((gid)=>{ try{ localStorage.setItem('voice-download','"off"'); localStorage.setItem('wc.welcomed.'+gid,'1'); localStorage.setItem('wc.coach.'+gid,'["command","turn","realm"]'); }catch{} }, g.id);
    await page.goto(`http://127.0.0.1:${PORT}/?game=${g.id}&dev`); await page.waitForSelector('#hud-top .advance-btn',{state:'visible',timeout:240000});
    await page.waitForFunction(()=>{ const l=document.querySelector('#map-loading'); return !l||l.classList.contains('hidden'); },null,{timeout:240000,polling:500}); await page.waitForTimeout(3000);
    const targets=await page.evaluate(()=>{ const m=window.__wc.map; return { dist:m.dist, keys:Object.keys(m).filter(k=>/dist|target|minDist|maxDist|zoom/i.test(k)), seat:window.__wc.state.houses[window.__wc.state.meta.player].seat }; });
    for(const dist of [60,160,330,700,1400]){
      await page.evaluate((d)=>{ const m=window.__wc.map; m.tween=null; m.follow=null; m.dist=d; if(m.distT!==undefined) m.distT=d; if(m.targetDist!==undefined) m.targetDist=d; },dist); await page.waitForTimeout(1500);
      const r=await page.evaluate(()=>{ const L=[...document.querySelectorAll('.lbl')].filter(e=>{ const r=e.getBoundingClientRect(); const cs=getComputedStyle(e); return r.width>2&&r.height>2&&cs.display!=='none'&&cs.visibility!=='hidden'&&+cs.opacity>0.2&&r.right>0&&r.left<innerWidth&&r.bottom>0&&r.top<innerHeight; });
        const rects=L.map(e=>({e,r:e.getBoundingClientRect(),t:(e.textContent||'').trim().slice(0,24),cls:String(e.className).slice(0,30)})); let over=0; const ex=[];
        for(let i=0;i<rects.length;i++) for(let j=i+1;j<rects.length;j++){ const a=rects[i].r,b=rects[j].r; const ox=Math.min(a.right,b.right)-Math.max(a.left,b.left), oy=Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top); if(ox>6&&oy>6&&(ox*oy)>0.25*Math.min(a.width*a.height,b.width*b.height)){ over++; if(ex.length<4) ex.push(rects[i].t+' ⟂ '+rects[j].t); } }
        // labels covering HUD
        const hud=[...document.querySelectorAll('#hud-top, #hud-player, #strip, #command-bar, #orders, .wc-medallion')].map(e=>e.getBoundingClientRect()); let underHud=0; for(const x of rects){ for(const h of hud){ if(h.width>0&&x.r.left<h.right&&x.r.right>h.left&&x.r.top<h.bottom&&x.r.bottom>h.top) { underHud++; break; } } }
        return { labels:rects.length, overlaps:over, ex, underHud, smallest:Math.min(...rects.map(x=>x.r.height)) }; });
      results.push({w,h,dist,...r}); await page.screenshot({path:path.join(OUT,`${house}-${w}-d${dist}.jpg`),type:'jpeg',quality:60}).catch(()=>{});
    }
    await page.close();
  }
}catch(e){ console.log('ERR',e.message); } finally{ try{await browser?.close();}catch{} try{srv.kill();}catch{} fs.rmSync(saves,{recursive:true,force:true}); }
for(const r of results) console.log(JSON.stringify(r));
