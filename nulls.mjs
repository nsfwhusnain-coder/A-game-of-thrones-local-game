import fs from 'node:fs'; import zlib from 'node:zlib';
process.env.WC_PROVIDER='mock';
const R='/home/user/A-game-of-thrones-local-game';
const K = await import(R+'/public/js/engine/knowledge.js');
for (const dir of process.argv.slice(2)) {
  const facts = new Map(fs.readFileSync(dir+'/facts.jsonl','utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l)).map(f=>[f.id,f]));
  console.log('==', dir);
  for (let t=1;t<=5;t++) {
    const snap = String(t+1).padStart(6,'0');
    const st = JSON.parse(zlib.gunzipSync(fs.readFileSync(`${dir}/snapshots/${snap}.json.gz`))).state.meta ? JSON.parse(zlib.gunzipSync(fs.readFileSync(`${dir}/snapshots/${snap}.json.gz`))).state : null;
    if (!st) continue;
    const E = K.eyesOf(st, st.meta.player);
    const turn = JSON.parse(fs.readFileSync(`${dir}/turns/${String(t).padStart(6,'0')}.json`,'utf8'));
    for (const e of turn.events) {
      const ids = e.facts?.length ? e.facts : e.fact ? [e.fact] : []; if (!ids.length) continue;
      const fs_ = ids.map(i=>facts.get(i)).filter(Boolean);
      const ns = fs_.map(f=>K.newsOf(st,f,st.meta.player,E));
      const nullAny = ns.some(n=>!n); const late = ns.filter(n=>n).map(n=>n.day - Math.min(...fs_.map(f=>f.day)));
      const witnessAll = ns.every(n=>n&&n.via==='witness');
      if (e.bg) continue;
      if (witnessAll) continue;
      console.log(`T${t} day${e.day} imp${e.importance} ${e.heard?'HEARD ':''}${nullAny?'NULLNEWS ':''}${late.length&&Math.min(...late)>0?'LATE+'+Math.min(...late)+' ':''}${e.narrated?'narrated ':''}| ${e.title.slice(0,70)} [${fs_.map(f=>f.kind+':'+(f.vis.scope)).slice(0,3).join(',')}]`);
    }
  }
}
