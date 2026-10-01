import { REPO } from './paths.mjs';
import { spawn } from 'node:child_process'; import { createRequire } from 'node:module'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT=REPO; const PORT=3426; const require=createRequire(REPO + '/package.json'); const { chromium }=require('playwright');
const saves=fs.mkdtempSync(path.join(os.tmpdir(),'wc-bh-life-'));
const srv=spawn(process.execPath,['server/index.js'],{cwd:ROOT,env:{...process.env,PORT:String(PORT),WC_PROVIDER:'mock',WC_SAVES:saves},stdio:'ignore'});
const api=async(p,body)=>{ const r=await fetch(`http://127.0.0.1:${PORT}/api${p}`,body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{}); return r.json(); };
let browser;
try{
  for(let i=0;i<100;i++){ try{ await fetch(`http://127.0.0.1:${PORT}/api/version`); break; }catch{ await new Promise(r=>setTimeout(r,100)); } }
  const house=process.argv[2]||'stark'; const adv=Number(process.argv[3]||4);
  const g=await api('/games',{scenario:'agot_298',house,seed:Number(process.argv[4]||5)}); for(let i=0;i<adv;i++) await api(`/games/${g.id}/advance`,{span:'7d',orders:[]});
  browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
  const page=await browser.newPage({viewport:{width:1366,height:768}}); page.setDefaultTimeout(120000);
  await page.addInitScript((gid)=>{ try{ localStorage.setItem('voice-download','"off"'); localStorage.setItem('wc.welcomed.'+gid,'1'); localStorage.setItem('wc.coach.'+gid,'["command","turn","realm"]'); localStorage.setItem('map-life','1'); }catch{} }, g.id);
  await page.goto(`http://127.0.0.1:${PORT}/?game=${g.id}&dev`);
  await page.waitForSelector('#hud-top .advance-btn',{state:'visible',timeout:240000});
  await page.waitForFunction(()=>window.__wc?.map?.life?.entities?.length>=0 && document.querySelector('#map-loading')?.classList.contains('hidden'),null,{timeout:240000,polling:500});
  await page.waitForTimeout(4000);
  const res=await page.evaluate(()=>{
    const m=window.__wc.map, L=m.life, G=m.grid; const out={entities:L.entities.length,kinds:{},straight:[],inWater:[],long:[],speedy:[]};
    const costAt=(x,z)=>{ const i=G.idx(x,z); return i<0?Infinity:G.landCost[i]; };
    for(const e of L.entities){ out.kinds[e.kind]=(out.kinds[e.kind]||0)+1; const p=e.path; if(!p) continue; const chord=Math.hypot(e.to[0]-e.from[0],e.to[1]-e.from[1]);
      if(e.kind!=='raven'){ if(p.length<=2&&chord>30) out.straight.push({id:e.id,kind:e.kind,chord:Math.round(chord),from:e.from.map(Math.round),to:e.to.map(Math.round)});
        let wet=0,n=0; for(let i=0;i<p.length-1;i++){ for(let k=0;k<=10;k++){ const x=p[i][0]+(p[i+1][0]-p[i][0])*k/10, z=p[i][1]+(p[i+1][1]-p[i][1])*k/10; n++; if(costAt(x,z)===Infinity) wet++; } }
        if(wet/n>0.05) out.inWater.push({id:e.id,kind:e.kind,wetPct:Math.round(100*wet/n),pts:p.length}); }
    }
    out.tallhart=L.entities.filter(e=>/tallhart/.test(e.id)||Math.hypot(e.from[0]-451,e.from[1]-950)<60||Math.hypot(e.to[0]-451,e.to[1]-950)<60).map(e=>({id:e.id,kind:e.kind,from:e.from.map(Math.round),to:e.to.map(Math.round),pts:e.path.length,len:Math.round(e.path.reduce((a,p,i)=>i?a+Math.hypot(p[0]-e.path[i-1][0],p[1]-e.path[i-1][1]):0,0)),wet:e.path.slice(1).filter((p,i)=>costAt(p[0],p[1])===Infinity).length}));
    out.sample=L.entities.slice(0,3).map(e=>({id:e.id,kind:e.kind,keys:Object.keys(e).join(',')}));
    return out; });
  console.log(JSON.stringify({entities:res.entities,kinds:res.kinds,straight:res.straight.length,inWater:res.inWater.length},null,0));
  console.log('straight (2-point) walkers:',JSON.stringify(res.straight.slice(0,12))); console.log('paths over water:',JSON.stringify(res.inWater.slice(0,12))); console.log('near Tallhart (451,950):',JSON.stringify(res.tallhart)); console.log(JSON.stringify(res.sample));
}catch(e){ console.log('ERR',e.message); } finally{ try{await browser?.close();}catch{} try{srv.kill();}catch{} fs.rmSync(saves,{recursive:true,force:true}); }
