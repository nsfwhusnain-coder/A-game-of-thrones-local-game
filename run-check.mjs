import { scoreCard, G, overlaps } from './scratch-scorer.mjs';
import { createInitialState } from '/home/user/wc-s1/public/js/shared/world.js';
import fs from 'node:fs';
const state = createInitialState('agot_298', 'stark', { seed: 298 });
const bad = JSON.parse(fs.readFileSync('/home/user/wc-s1/tests/fixtures/headlines/bad.json', 'utf8'));
const byId = Object.fromEntries(G.map((g) => [g.id, g]));
let nbad = 0;
for (const g of G) {
  const r = scoreCard({ headline: g.reference, summary: g.summary }, g, state);
  const r2 = scoreCard({ headline: g.reference }, g, state);
  const o = overlaps(g.reference, g.summary);
  if (!r.pass || !r2.pass) { nbad++; console.log('GOLDEN FAIL', g.id, JSON.stringify(g.reference), r.faults, r2.faults); }
  if (o.cover >= 0.6) console.log('  overlap high', g.id, o);
}
console.log('golden failures', nbad, 'of', G.length);
let miss = 0;
for (const b of bad) {
  const story = typeof b.story === 'string' ? byId[b.story] : b.story;
  if (!story) { console.log('NO STORY', b.story); continue; }
  const r = scoreCard({ headline: b.headline, summary: b.summary }, story, state);
  if (!r.faults.includes(b.fails)) { miss++; console.log('BAD NOT CAUGHT', b.fails, JSON.stringify(b.headline), '->', r.faults); }
}
console.log('bad misses', miss, 'of', bad.length);
