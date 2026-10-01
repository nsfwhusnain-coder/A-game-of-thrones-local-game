import { REPO } from './paths.mjs';
import { spawn } from 'node:child_process'; import { createRequire } from 'node:module'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT=REPO; const PORT=3428; const require=createRequire(REPO + '/package.json'); const { chromium }=require('playwright');
const saves=fs.mkdtempSync(path.join(os.tmpdir(),'wc-bh-ui2-'));
const srv=spawn(process.execPath,['server/index.js'],{cwd:ROOT,env:{...process.env,PORT:String(PORT),WC_PROVIDER:'mock',WC_SAVES:saves},stdio:'ignore'});
const api=async(p,body)=>{ const r=await fetch(`http://127.0.0.1:${PORT}/api${p}`,body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{}); return r.json(); };
const res=[]; const note=(k,t)=>{ res.push([k,t]); console.log(`[${k}] ${t}`); };
let browser;
try{
  for(let i=0;i<100;i++){ try{ await fetch(`http://127.0.0.1:${PORT}/api/version`); break; }catch{ await new Promise(r=>setTimeout(r,100)); } }
  const g=await api('/games',{scenario:'agot_298',house:'stark',seed:5}); await api(`/games/${g.id}/advance`,{span:'7d',orders:[]});
  browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
  const mk=async()=>{ const page=await browser.newPage({viewport:{width:1366,height:768}}); page.setDefaultTimeout(60000); const errs=[]; page.on('pageerror',e=>errs.push(e.message.slice(0,160))); page.on('console',m=>{ if(m.type()==='error') errs.push('console: '+m.text().slice(0,160)); });
    await page.addInitScript((gid)=>{ try{ localStorage.setItem('voice-download','"off"'); localStorage.setItem('wc.welcomed.'+gid,'1'); localStorage.setItem('wc.coach.'+gid,'["command","turn","realm"]'); }catch{} }, g.id);
    await page.goto(`http://127.0.0.1:${PORT}/?game=${g.id}&dev`); await page.waitForSelector('#hud-top .advance-btn',{state:'visible',timeout:240000}); await page.waitForFunction(()=>{ const l=document.querySelector('#map-loading'); return !l||l.classList.contains('hidden'); },null,{timeout:240000,polling:500}); await page.waitForTimeout(2500); return {page,errs}; };
  { const {page,errs}=await mk();
    // 1. XSS through the command bar
    await page.evaluate(()=>{ window.__xss=0; });
    await page.click('#order-input').catch(()=>{}); const payload='<img src=x onerror="window.__xss=1"><script>window.__xss=2</script><b>bold</b>'; await page.fill('#order-input',payload).catch(async()=>{ await page.keyboard.type(payload); }); await page.keyboard.press('Enter'); await page.waitForTimeout(1500);
    const x=await page.evaluate(()=>({xss:window.__xss, html:document.querySelector('#orders')?.innerHTML.slice(0,400), hasImg:!!document.querySelector('#orders img'), hasB:!!document.querySelector('#orders b:not(.n)')}));
    note('xss-order',`window.__xss=${x.xss}; img in orders: ${x.hasImg}; <b> in orders: ${x.hasB}`);
    await page.evaluate(()=>document.querySelectorAll('[data-del-order]').forEach(b=>b.click())); await page.waitForTimeout(500);
    // 2. stuck key
    const x0=await page.evaluate(()=>window.__wc.map.target.x);
    await page.evaluate(()=>{ document.activeElement?.blur?.(); window.dispatchEvent(new KeyboardEvent('keydown',{key:'d',metaKey:true,bubbles:true})); });
    await page.waitForTimeout(1500); const x1=await page.evaluate(()=>window.__wc.map.target.x);
    await page.evaluate(()=>{ window.dispatchEvent(new Event('blur')); }); await page.waitForTimeout(1500); const x2=await page.evaluate(()=>window.__wc.map.target.x); await page.waitForTimeout(1500); const x3=await page.evaluate(()=>window.__wc.map.target.x);
    note('stuck-key',`target.x ${x0.toFixed(1)} -> after Cmd+D keydown ${x1.toFixed(1)} -> after window blur ${x2.toFixed(1)} -> 1.5 s later ${x3.toFixed(1)} (still moving after blur: ${Math.abs(x3-x2)>1})`);
    // clean the stuck key by pressing and releasing d
    await page.evaluate(()=>{ window.dispatchEvent(new KeyboardEvent('keyup',{key:'d'})); });
    // 3. double click End turn
    const t0=(await api(`/games/${g.id}`)).meta.turn;
    await page.click('#hud-top .advance-btn'); await page.waitForTimeout(150); await page.click('#hud-top .advance-btn',{timeout:2000}).catch(()=>{});
    const ask=await page.$('text=Let the days pass'); if(ask) await ask.click().catch(()=>{});
    await page.waitForTimeout(500); await page.waitForFunction(()=>document.querySelector('#busy')?.classList.contains('hidden'),null,{timeout:120000,polling:300}).catch(()=>{}); await page.waitForTimeout(1500);
    const t1=(await api(`/games/${g.id}`)).meta.turn; note('double-end-turn',`server turn ${t0} -> ${t1} after two quick clicks on End turn`);
    // 4. reload in the middle of a turn
    await page.click('#hud-top .advance-btn').catch(()=>{}); const ask2=await page.$('text=Let the days pass'); if(ask2) await ask2.click().catch(()=>{}); await page.waitForTimeout(300); await page.reload(); await page.waitForSelector('#hud-top .advance-btn',{state:'visible',timeout:240000}).catch(()=>{}); await page.waitForTimeout(6000);
    const busy=await page.evaluate(()=>({busyHidden:document.querySelector('#busy')?.classList.contains('hidden'), loadingHidden:document.querySelector('#map-loading')?.classList.contains('hidden')})); const t2=(await api(`/games/${g.id}`)).meta.turn; note('reload-mid-turn',`after reload: busy overlay hidden=${busy.busyHidden}, loading hidden=${busy.loadingHidden}; server turn ${t1} -> ${t2}`);
    if(errs.length) note('page-errors',[...new Set(errs)].slice(0,6).join(' | ')); await page.close(); }
}catch(e){ note('ERR',e.message); } finally{ try{await browser?.close();}catch{} try{srv.kill();}catch{} fs.rmSync(saves,{recursive:true,force:true}); }
