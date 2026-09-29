import fs from 'node:fs';
process.env.WC_PROVIDER='mock';
const { createInitialState } = await import('/home/user/wc-s1/public/js/shared/world.js');
const { scoreCard } = await import('/home/user/wc-s1/server/ai/validate/headline.js');
const state = createInitialState('agot_298', 'stark', { seed: 298 });
const G = JSON.parse(fs.readFileSync('/home/user/wc-s1/tests/fixtures/headlines/golden.json','utf8'));
for (const g of G) { const r = scoreCard({headline:g.reference, summary:g.summary}, g, state); if (!r.pass) console.log(g.id, g.reference, '=>', JSON.stringify(r.detail)); }
