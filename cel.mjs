import fs from 'node:fs'; import zlib from 'node:zlib';
const dir = 'playtest/lannister-mulyhuy8-c2a0';
const st = JSON.parse(zlib.gunzipSync(fs.readFileSync(`${dir}/snapshots/000002.json.gz`))).state;
console.log(JSON.stringify(st.houses.celtigar).slice(0,600));
for (const c of Object.values(st.characters)) if (c.house==='celtigar') console.log(c.id, c.name, c.alive, c.age, c.status, c.title, JSON.stringify(c.roles), c.father, c.mother);
const facts = fs.readFileSync(dir+'/facts.jsonl','utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l)).filter(f=>/Celtigar/.test(f.text));
for (const f of facts) console.log(JSON.stringify(f));
const t = JSON.parse(fs.readFileSync(dir+'/turns/000001.json','utf8'));
console.log(JSON.stringify(t.applied.filter(a=>/Celtigar|succession/i.test(JSON.stringify(a)))));
