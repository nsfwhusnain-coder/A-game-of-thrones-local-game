import { BH_OUT } from '../paths.mjs';
import fs from 'node:fs';
const base='http://127.0.0.1:3424/api'; const api=async(p,body,to=300000)=>{ const r=await fetch(base+p,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body||{}),signal:AbortSignal.timeout(to)}); const t=await r.text(); try{return JSON.parse(t)}catch{return {raw:t}} };
const g=await (await fetch(base+'/games',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({scenario:'agot_298',house:process.argv[2]||'stark',seed:9})})).json(); const id=g.id;
const ORD=(process.argv[3]?JSON.parse(fs.readFileSync(process.argv[3],'utf8')):[
 'Raise 0 men','Raise 200 men at Winterfell and send them to the Wall','Go to King\'s Landing and bring Sansa and Arya','I will ride south myself with my daughters',
 'Marry Robb to a Frey girl','Betroth Sansa to Prince Joffrey','Send Jon Snow to the Night\'s Watch','Make Theon my ward\'s captain','Execute the deserter in the yard','Pardon the poacher',
 'Hold a tourney','Lower the grain price in Winter Town','Build a new granary and a sept','Hire 500 sellswords','Buy grain from White Harbor with all our gold',
 'Tell Maester Luwin to write to the Citadel about the long summer','Declare war on the Lannisters','Make peace with the Greyjoys','Do nothing and rest','Prepare for winter','Send my son Bran to foster at the Eyrie',
 'Ask Robert for his help against the Free Folk','Spy on the King\'s court','Poison the Lannister envoy','Give 5000 dragons to the Night\'s Watch','Fortify Moat Cailin',
 'Raise 5 men','Raise a hundred thousand men','Summon Lord Bolton and Lord Umber to a council at Winterfell','Name Ser Rodrik commander of the host and march on the Twins','Sell the grain to the Reach']);
let out=''; for(const text of ORD){ await api(`/games/${id}/orders`,{orders:[{id:'o1',text}]}); const t0=Date.now(); const r=await api(`/games/${id}/orders/preview`,{}); const o=(r.orders||[])[0]||{}; const p=o.parsed||{}; const line=`> ${text}\n   via=${p.via} actions=${JSON.stringify((p.actions||[]).map(a=>a.verb+':'+JSON.stringify(a.params)))} letter=${JSON.stringify(p.letter)} clarify=${JSON.stringify(p.clarify&&{q:p.clarify.question,opts:(p.clarify.options||[]).map(x=>x.label)})} story=${p.story}\n   receipt=${JSON.stringify((o.receipt||[]).map(x=>(x.ok===true?'OK ':x.ok===false?'NO ':String(x.ok)+' ')+x.text)).slice(0,420)} (${Math.round((Date.now()-t0)/1000)}s)`; out+=line+'\n'; console.log(line); }
fs.writeFileSync(BH_OUT + '/live-orders.txt',out);
