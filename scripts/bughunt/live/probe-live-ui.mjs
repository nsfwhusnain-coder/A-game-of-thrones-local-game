import { REPO, out } from '../paths.mjs';
import { createRequire } from 'node:module'; import fs from 'node:fs'; import path from 'node:path';
const require=createRequire(REPO + '/package.json'); const { chromium }=require('playwright');
const PORT=3424; const OUT=out('ui-live'); fs.mkdirSync(OUT,{recursive:true});
const ids=(await (await fetch(`http://127.0.0.1:${PORT}/api/saves`)).json()); const id=(process.argv[2]||ids.find(s=>s.turn>=3)?.id||ids[0].id);
console.log('game',id);
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1366,height:768}}); page.setDefaultTimeout(90000); const errs=[];
page.on('pageerror',e=>errs.push('pageerror '+e.message.slice(0,160))); page.on('console',m=>{ if(m.type()==='error') errs.push('console '+m.text().slice(0,140)); });
await page.addInitScript((gid)=>{ try{ localStorage.setItem('voice-download','"off"'); localStorage.setItem('wc.welcomed.'+gid,'1'); localStorage.setItem('wc.coach.'+gid,'["command","turn","realm"]'); }catch{} }, id);
await page.goto(`http://127.0.0.1:${PORT}/?game=${id}&dev`); await page.waitForSelector('#hud-top .advance-btn',{state:'visible',timeout:240000}); await page.waitForFunction(()=>{ const l=document.querySelector('#map-loading'); return !l||l.classList.contains('hidden'); },null,{timeout:240000,polling:500}); await page.waitForTimeout(3000);
const shot=async(n)=>page.screenshot({path:path.join(OUT,n+'.jpg'),type:'jpeg',quality:60});
await shot('plain');
// the chronicle with long real-model cards
await page.keyboard.press('h'); await page.waitForTimeout(1500); await shot('chronicle');
const scan=await page.evaluate(()=>{ const d=document.querySelector('#drawer'); if(!d) return 'no drawer'; const bad=[]; for(const e of d.querySelectorAll('*')){ if(e.scrollWidth>e.clientWidth+3&&getComputedStyle(e).overflowX==='visible'&&e.clientWidth>0) bad.push(e.tagName+'.'+String(e.className).slice(0,20)+' '+e.scrollWidth+'>'+e.clientWidth); } return {scrollW:d.scrollWidth,clientW:d.clientWidth,overflowing:bad.slice(0,6),cards:d.querySelectorAll('.wc-card').length,text:d.innerText.length}; }); console.log('chronicle scan',JSON.stringify(scan));
// open the card details for Bran's fall
await page.evaluate(()=>{ const c=[...document.querySelectorAll('#drawer .wc-card')].find(x=>/Grave news reaches Winterfell/.test(x.innerText)); c?.scrollIntoView({block:'center'}); }); await page.waitForTimeout(500); await shot('chronicle-grave');
await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
// letters
await page.click('#inbox-btn').catch(()=>{}); await page.waitForTimeout(600); await shot('inbox');
await page.keyboard.press('Escape');
// audience with Robb
await page.keyboard.press('p'); await page.waitForTimeout(1200);
await page.evaluate(()=>{ const b=[...document.querySelectorAll('#window button')].find(x=>/Speak|Audience/i.test(x.innerText)); b?.click(); }); await page.waitForTimeout(1500); await shot('audience');
console.log('errors',[...new Set(errs)].slice(0,5).join(' | '));
await browser.close();
