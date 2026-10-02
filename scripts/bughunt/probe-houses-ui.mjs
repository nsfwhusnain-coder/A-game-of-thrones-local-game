import { REPO, out } from './paths.mjs';
import { spawn } from 'node:child_process'; import { createRequire } from 'node:module'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT=REPO; const PORT=3429; const require=createRequire(REPO + '/package.json'); const { chromium }=require('playwright');
const saves=fs.mkdtempSync(path.join(os.tmpdir(),'wc-bh-hui-')); const OUT=out('ui-houses'); fs.mkdirSync(OUT,{recursive:true});
const srv=spawn(process.execPath,['server/index.js'],{cwd:ROOT,env:{...process.env,PORT:String(PORT),WC_PROVIDER:'mock',WC_SAVES:saves},stdio:'ignore'});
const api=async(p,body)=>{ const r=await fetch(`http://127.0.0.1:${PORT}/api${p}`,body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{}); return r.json(); };
let browser;
try{
  for(let i=0;i<100;i++){ try{ await fetch(`http://127.0.0.1:${PORT}/api/version`); break; }catch{ await new Promise(r=>setTimeout(r,100)); } }
  browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
  for(const house of (process.argv[2]||'nights_watch,free_folk,targaryen,golden_company,dothraki,braavos').split(',')){
    const errs=[]; const g=await api('/games',{scenario:'agot_298',house,seed:5}); if(!g.id){ console.log(house,'NO GAME',JSON.stringify(g).slice(0,100)); continue; }
    for(let i=0;i<2;i++) await api(`/games/${g.id}/advance`,{span:'7d',orders:[]}).catch(e=>errs.push('advance '+e.message));
    const page=await browser.newPage({viewport:{width:1366,height:768}}); page.setDefaultTimeout(60000);
    page.on('pageerror',e=>errs.push('pageerror: '+e.message.slice(0,200))); page.on('console',m=>{ if(m.type()==='error') errs.push('console: '+m.text().slice(0,160)); }); page.on('response',r=>{ if(r.status()>=400) errs.push(`http ${r.status()} ${r.url().replace(`http://127.0.0.1:${PORT}`,'').slice(0,80)}`); });
    await page.addInitScript((gid)=>{ try{ localStorage.setItem('voice-download','"off"'); localStorage.setItem('wc.welcomed.'+gid,'1'); localStorage.setItem('wc.coach.'+gid,'["command","turn","realm"]'); }catch{} }, g.id);
    try{
      await page.goto(`http://127.0.0.1:${PORT}/?game=${g.id}&dev`); await page.waitForSelector('#hud-top .advance-btn',{state:'visible',timeout:240000}); await page.waitForFunction(()=>{ const l=document.querySelector('#map-loading'); return !l||l.classList.contains('hidden'); },null,{timeout:240000,polling:500}); await page.waitForTimeout(2500);
      await page.screenshot({path:path.join(OUT,`${house}-plain.jpg`),type:'jpeg',quality:60});
      const info=await page.evaluate(()=>{ const s=window.__wc.state; const h=s.houses[s.meta.player]; return { name:h.name, seat:h.seat, seatName:s.holdings[h.seat]?.name, lord:s.characters[h.lord]?.name, landless:!!h.landless, hudText:document.querySelector('#hud-top')?.innerText.replace(/\s+/g,' ').slice(0,160), turn:document.querySelector('#turn-until')?.innerText, player:document.querySelector('#hud-player')?.innerText.replace(/\s+/g,' ').slice(0,120) }; });
      console.log(house,'|',JSON.stringify(info));
      for(const [key,name] of [['r','realm'],['p','people'],['h','chron']]){ await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.keyboard.press(key); await page.waitForTimeout(1200); await page.screenshot({path:path.join(OUT,`${house}-${name}.jpg`),type:'jpeg',quality:55}); const t=await page.evaluate(()=>{ const w=document.querySelector('#window:not(.hidden), #drawer:not(.hidden)'); return w?w.innerText.replace(/\s+/g,' ').slice(0,260):'(nothing opened)'; }); console.log('   ',name,':',t); }
      const bad=await page.evaluate(()=>{ const t=document.body.innerText; const m=t.match(/undefined|NaN|\[object|null\b/g); return m?[...new Set(m)]:[]; }); if(bad.length) console.log('   BAD TEXT',bad.join(','));
    }catch(e){ console.log(house,'FAILED',e.message.split('\n')[0]); }
    if(errs.length) console.log('   errors:',[...new Set(errs)].slice(0,6).join(' | ')); await page.close();
  }
}catch(e){ console.log('ERR',e.message); } finally{ try{await browser?.close();}catch{} try{srv.kill();}catch{} fs.rmSync(saves,{recursive:true,force:true}); }
