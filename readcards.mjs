// Print the writer's cards for recorded turns, as a player reads them.
import fs from 'node:fs';
const W = '/home/user/wc-s4';
const { createInitialState } = await import(W + '/public/js/shared/world.js');
const { clusterFacts } = await import(W + '/public/js/engine/facts/cluster.js');
const { cardOf, meanwhileOf } = await import(W + '/public/js/engine/facts/headline.js');
const { scoreCard } = await import(W + '/server/ai/validate/headline.js');
for (const name of process.argv.slice(2)) {
  const set = JSON.parse(fs.readFileSync(`${W}/tests/fixtures/headlines/turns/${name}.json`, 'utf8'));
  console.log(`\n######## ${name}`);
  for (const t of set.turns) {
    const s = createInitialState('agot_298', 'stark', { seed: 7 }); for (const [k, p] of Object.entries(t.parties)) s.parties[k] = { ...p }; s.meta.clock = t.clock;
    const res = clusterFacts(s, t.facts);
    console.log(`\n== Turn ${t.turn} (${t.facts.length} facts → ${res.stories.length} stories)`);
    for (const st of res.stories) {
      const c = cardOf(s, st); const sc = scoreCard(c, st, s);
      console.log(`• ${c.headline}${sc.pass ? '' : '   ✗ ' + sc.faults.join(',')}\n    ${c.summary}`);
    }
    const mw = meanwhileOf(s, [...res.meanwhile, ...t.small]); if (mw) console.log(`  Meanwhile: ${mw}`);
  }
}
