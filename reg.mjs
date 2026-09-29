import { scoreCard, G } from './scratch-scorer.mjs';
import { createInitialState } from '/home/user/wc-s1/public/js/shared/world.js';
import { plainEvent } from '/home/user/wc-s1/server/ai/calls/narrate.js';
const state = createInitialState('agot_298', 'stark', { seed: 298 });
let pass = 0; const hist = {};
for (const g of G) {
  const facts = g.facts.map((f) => ({ ...f, day: 1 }));
  const s = { id: 'S1', facts, actors: [...new Set(facts.flatMap((f) => f.actors))], place: facts[0].place || null, houses: [...new Set(facts.flatMap((f) => f.houses))], days: [1, 1], importance: Math.max(...facts.map((f) => f.importance)), pov: null };
  const e = plainEvent(state, s);
  const r = scoreCard({ headline: e.headline, summary: e.line }, g, state);
  if (r.pass) pass++;
  for (const f of r.faults) hist[f] = (hist[f] || 0) + 1;
  if (r.pass) console.log('PASS', g.id, e.headline);
}
console.log(pass, '/', G.length, hist);
