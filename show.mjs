import fs from 'node:fs'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
process.env.WC_PROVIDER = 'mock';
const root = process.argv[2]; const only = process.argv[3]; const turn = process.argv[4];
const imp = (p) => import(pathToFileURL(path.join(root, p)).href);
const { createInitialState } = await imp('public/js/shared/world.js');
const { clusterFacts } = await imp('public/js/engine/facts/cluster.js');
for (const name of ['stark-muster-6', 'stark-quiet-6']) {
  if (only && !name.includes(only)) continue;
  const set = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/headlines/turns', name + '.json'), 'utf8'));
  let nf = 0, ns = 0;
  for (const t of set.turns) {
    const s = createInitialState('agot_298', 'stark', { seed: 7 }); for (const [k, p] of Object.entries(t.parties)) s.parties[k] = { ...p }; s.meta.clock = t.clock;
    const r = clusterFacts(s, t.facts); nf += r.stories.reduce((n, x) => n + x.facts.length, 0); ns += r.stories.length;
    if (turn && +turn !== t.turn) continue;
    console.log(`\n== ${name} turn ${t.turn}: ${t.facts.length} news, ${t.small.length} small -> ${r.stories.length} stories, meanwhile ${r.meanwhile.length}`);
    for (const st of r.stories) console.log(`${st.id} [${st.importance}] ${st.archetype}${st.rolled ? ' ROLLED' : ''}${st.late ? ' LATE' : ''} d${st.days} @${st.place} lead=${st.lead} : ${[...new Map(st.facts.map(f => [f.kind, 0])).keys()].map(k => k + '×' + st.facts.filter(f => f.kind === k).length).join(' ')} | ${st.facts.slice(0, 3).map(f => f.id).join(',')}`);
  }
  console.log(`${name}: ${nf} facts in ${ns} stories = ${(nf / ns).toFixed(2)}`);
}
