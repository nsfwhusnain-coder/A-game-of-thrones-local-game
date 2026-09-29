import fs from 'node:fs'; import zlib from 'node:zlib';
process.env.WC_PROVIDER='mock';
const R='/home/user/A-game-of-thrones-local-game';
const K = await import(R+'/public/js/engine/knowledge.js');
const {MILES_PER_UNIT} = await import(R+'/public/data/geography.js');
const dir = process.argv[2]; const snap = process.argv[3];
const st = JSON.parse(zlib.gunzipSync(fs.readFileSync(`${dir}/snapshots/${snap}.json.gz`))).state;
console.log('MPU', MILES_PER_UNIT, 'date', JSON.stringify(st.meta.date), 'turn', st.meta.turn, 'player', st.meta.player);
const facts = fs.readFileSync(dir+'/facts.jsonl','utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l));
const me = st.meta.player;
const E = K.eyesOf(st, me);
const re = new RegExp(process.argv[4]||'.');
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
for (const f of facts) {
  if (!re.test(f.text||'')) continue;
  const n = K.newsOf(st, f, me, E);
  const at = f.pos || st.holdings[f.place]?.pos;
  let best=Infinity; for (const [p,r] of E.out) best=Math.min(best, Math.max(0,dist(p,at)-r));
  console.log(f.id, 'day', f.day, f.kind, 'imp', f.importance, JSON.stringify(f.vis), f.place, '-> miles', Math.round(best*MILES_PER_UNIT), JSON.stringify(n), '|', (f.text||'').slice(0,70));
}
