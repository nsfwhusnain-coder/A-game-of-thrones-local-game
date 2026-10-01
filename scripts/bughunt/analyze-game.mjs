// Bug hunt: one game, many consistency checks on the facts and the turn cards. Usage: node analyze-game.mjs <house> <seed> <turns> [span]
import { BH_OUT, REPO } from './paths.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
const [house='stark',seed='100',turns='20',span='30d']=process.argv.slice(2);
process.env.WC_PROVIDER='mock'; process.env.WC_SAVES=fs.mkdtempSync(path.join(os.tmpdir(),'wc-bh-an-'));
const repo=REPO + '/'; const im=(p)=>import(pathToFileURL(repo+p).href);
const game=await im('server/game.js'); const Co=await im('bench/lib/coherence.js');
const {id}=game.newGame('agot_298',house,{seed:Number(seed)});
const start=game.loadState(id); const age0=Object.fromEntries(Object.values(start.characters).map(c=>[c.id,c.age]));
const cards=[]; for(let n=1;n<=Number(turns);n++){ const r=await game.advance(id,{span}); await game.settled(id); for(const e of r.turn.events||[]) cards.push({turn:n,...e}); }
const g=Co.readGame(game,id); const s=g.state; const C=s.characters; const facts=[...g.facts].sort((a,b)=>(a.day??0)-(b.day??0));
const out={}; const add=(rule,t)=>{ (out[rule]=out[rule]||new Set()).add(t); };
const nm=(i)=>C[i]?.name||i;
// B posthumous
const died=new Map(); for(const f of facts) if(['death','slain_in_battle','executed','lost_at_sea'].includes(f.kind)) for(const a of (f.kind==='death'||f.kind==='executed'||f.kind==='lost_at_sea'||f.kind==='slain_in_battle'?[f.actors?.[0]]:[])) if(a&&!died.has(a)) died.set(a,f.day);
for(const f of facts){ for(const a of f.actors||[]){ const d=died.get(a); if(d!=null&&f.day>d+1&&!['succession','regency_begun','regency_ended','death','will','funeral'].includes(f.kind)) add('posthumous', `${nm(a)} died day ${d}, but ${f.kind} on day ${f.day}: ${String(f.text||'').slice(0,100)}`); } }
// A pronoun
for(const e of cards){ const f=facts.find(x=>x.id===e.fact); const a=f?.actors?.[0]; const sx=C[a]?.sex; const t=String(e.summary||''); if(!sx) continue; const m=/^(He|She)\b/.exec(t); if(m){ const want=sx==='f'?'She':'He'; if(m[1]!==want) add('pronoun', `${nm(a)} (${sx}): "${e.headline}" — ${t.slice(0,80)}`); } if(sx==='f'&&/\b(Lord|Ser)\s+\w+/.test(e.headline||'')&&new RegExp('\b(Lord|Ser) '+(C[a].name||'').split(' ')[0]).test(e.headline)) add('title-sex', `${nm(a)} is female: "${e.headline}"`); if(sx==='m'&&/\b(Lady|Septa)\s/.test(e.headline||'')&&new RegExp('Lady '+(C[a].name||'').split(' ')[0]).test(e.headline)) add('title-sex', `${nm(a)} is male: "${e.headline}"`); }
// I children leading
for(const f of facts){ if(!['set_out','host_formed','levies_called','tax_changed','works_begun','feast','tourney','gift','judgement'].includes(f.kind)) continue; const a=f.actors?.[0]; const c=C[a]; if(!c) continue; const ageThen=(age0[a]??c.age)+Math.floor(((f.day||0)-107497)/365); if(ageThen<10) add('child-acts', `${c.name} (~${ageThen}) ${f.kind}: ${String(f.text||'').slice(0,100)}`); }
// G the hurt and the held who travel or host
const held=new Map(); for(const f of facts){ if(['captured','captured_in_battle','hostage_taken'].includes(f.kind)) for(const a of f.actors||[]) held.set(a,{from:f.day}); if(['released','ransomed','escaped'].includes(f.kind)) for(const a of f.actors||[]) held.delete(a); if(['feast','tourney','set_out','levies_called','tax_changed','judgement'].includes(f.kind)){ const a=f.actors?.[0]; if(held.has(a)&&f.day>held.get(a).from+1) add('captive-acts', `${nm(a)} ${f.kind} day ${f.day} (held since ${held.get(a).from}): ${String(f.text||'').slice(0,90)}`); } }
// F speed: set_out with eta vs arrived
const out_={}; for(const f of facts){ if(f.kind==='set_out'&&f.data?.party) out_[f.data.party]={day:f.day,eta:f.data.eta,to:f.data.to,text:f.text}; if(f.kind==='arrived'&&f.data?.party&&out_[f.data.party]){ const o=out_[f.data.party]; const took=f.day-o.day; if(o.eta&&o.eta>o.day){ const plan=o.eta-o.day; if(took<plan*0.4&&plan>=6) add('arrives-early', `${f.data.party}: planned ${plan}d, took ${took}d — ${String(o.text||'').slice(0,80)}`); if(took>plan*2.5&&plan>=6) add('arrives-late', `${f.data.party}: planned ${plan}d, took ${took}d — ${String(o.text||'').slice(0,80)}`); } delete out_[f.data.party]; } }
// J cards vs facts: tourney result without announcement, ride to ended tourney
const tourneys=facts.filter(f=>f.kind==='tourney'); const results=facts.filter(f=>f.kind==='tourney_result');
for(const r of results){ const t=tourneys.find(x=>x.place===r.place&&Math.abs(x.day-r.day)<40); if(!t) add('tourney-no-call', `result at ${r.place} day ${r.day} (turn ${r.turn}) with no call within 40 days: ${String(r.text||'').slice(0,80)}`); else if(t.day===r.day||t.turn===r.turn) add('tourney-instant', `${r.place}: called and won on the same day/turn (${t.turn}) — champion ${nm(r.actors?.[0])} of ${C[r.actors?.[0]]?.house}`); }
for(const f of facts){ if(f.kind==='set_out'&&/tourney/i.test(f.text||'')){ const r=results.find(x=>x.day<f.day&&x.day>f.day-60&&(f.text||'').includes((s.holdings[x.place]?.name||'~~'))); if(r) add('ride-to-ended-tourney', `${String(f.text).slice(0,70)} (day ${f.day}), but ${s.holdings[r.place]?.name}'s tourney ended day ${r.day}`); } }
// champion far away
for(const r of results){ const ch=C[r.actors?.[0]]; const h=s.houses[ch?.house]; if(h&&r.place&&h.seat){ const a=s.holdings[h.seat]?.pos, b=s.holdings[r.place]?.pos; if(a&&b){ const d=Math.hypot(a[0]-b[0],a[1]-b[1]); if(d>300) add('champion-far', `${ch.name} of ${ch.house} wins at ${s.holdings[r.place]?.name} (${Math.round(d)} units from his seat) on turn ${r.turn}`); } } }
// K events: who named in headline not in actors/houses (maybe fine) – skip. L dead named alive
for(const e of cards){ for(const [i,c] of Object.entries(C)){ if(!c.alive&&c.name&&c.name.length>6&&(e.headline||'').includes(c.name)&&!/dies|dead|death|funeral|slain|killed|executed|mourn|buried|lost|falls|passes|succe|regent|heir|late |widow|memory|avenge|murder|died|claim|takes the|inherits|grief|burn|rites|poison|assassin/i.test(e.headline||'')){ const df=died.get(i); if(df==null||true) add('dead-named', `turn ${e.turn} "${e.headline}" names the dead ${c.name}`); } } }
const res={}; for(const [r,v] of Object.entries(out)) res[r]=[...v]; fs.writeFileSync(`${BH_OUT}/analyze-${house}-${seed}.json`,JSON.stringify(res,null,1));
for(const [r,v] of Object.entries(res)){ console.log('##',r,v.length); for(const t of v.slice(0,6)) console.log('   ',t.slice(0,220)); }
console.log('cards',cards.length,'facts',facts.length,'tourneys',tourneys.length,'results',results.length);
fs.rmSync(process.env.WC_SAVES,{recursive:true,force:true});
