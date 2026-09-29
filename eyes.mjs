import fs from 'node:fs'; import zlib from 'node:zlib';
process.env.WC_PROVIDER='mock';
const R='/home/user/A-game-of-thrones-local-game';
const K = await import(R+'/public/js/engine/knowledge.js');
const dir = process.argv[2]; const snap = process.argv[3];
const st = JSON.parse(zlib.gunzipSync(fs.readFileSync(`${dir}/snapshots/${snap}.json.gz`))).state;
const me = st.meta.player; const at = st.holdings.stark.pos;
console.log('winterfell', at, 'friends', [...K.friendsOf(st, me)].join(','));
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
for (const h of Object.values(st.holdings)) { if (h.owner===me || st.houses[h.owner]?.liege===me) { const d=dist(h.pos,at); if (d<200) console.log('holding', h.id, h.owner, Math.round(d)); } }
for (const a of Object.values(st.parties)) if (K.friendsOf(st,me).has(a.owner) && a.pos) { const d=dist(a.pos,at); console.log('party', a.id, a.owner, a.kind, Math.round(d), a.men); }
for (const c of Object.values(st.characters)) { if (!c.alive||c.house!==me) continue; const pl=c.loc; console.log('char',c.id,c.loc); }
