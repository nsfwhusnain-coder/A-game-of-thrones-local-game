process.env.WC_PROVIDER = 'mock';
const R = '/home/user/wc-s2/public/js/';
const { sampleRealm } = await import(R + 'engine/realm/stats.js');
const { realmViewFor } = await import(R + 'engine/realm/view.js');
const { createInitialState } = await import(R + 'shared/world.js');
const { addDays } = await import(R + 'engine/time.js');
const { withRng } = await import(R + 'engine/rng.js');
const K = await import(R + 'engine/knowledge.js');
const { playerView } = await import('/home/user/wc-s2/server/view.js');
const tick = (s, days = 7) => { s.meta.turn += 1; s.meta.date = addDays(s.meta.date, days); sampleRealm(s); withRng(s, () => K.updateKnowledge(s, 'stark')); return s; };
const s = createInitialState('agot_298', 'stark', { seed: 298 });
const size = (x) => JSON.stringify(x).length;
console.log('state total (turn 0)', size(s));
for (let i = 1; i <= 60; i++) { tick(s); if ([10, 30, 60].includes(i)) console.log('turn', i, 'state', size(s), 'realmStats', size(s.realmStats), 'knowledge.stark.realm', size(s.knowledge.stark.realm), 'pv', size(playerView(s))); }
// timing
const t = (o, n = 15) => { const ms = []; for (let i = 0; i < n; i++) { const a = performance.now(); realmViewFor(s, 'stark', o); ms.push(performance.now() - a); } ms.sort((a, b) => a - b); return `${ms[Math.floor(n/2)].toFixed(1)}ms med, ${ms.at(-1).toFixed(1)}ms max`; };
console.log('view all', t({ scope: 'all' }), '| all+realm', t({ scope: 'all', realm: true }), '| econ all realm', t({ scope: 'all', lens: 'economy', realm: true }), '| detail', t({ scope: 'all', house: 'lannister' }));
const a = performance.now(); for (let i = 0; i < 10; i++) sampleRealm(s); console.log('sampleRealm ms', ((performance.now() - a) / 10).toFixed(1));
const b = performance.now(); for (let i = 0; i < 10; i++) withRng(s, () => K.updateKnowledge(s, 'stark')); console.log('updateKnowledge (incl observe) ms', ((performance.now() - b) / 10).toFixed(1));
const { observe } = await import(R + 'engine/realm/estimate.js');
const c = performance.now(); for (let i = 0; i < 10; i++) observe(s, 'stark'); console.log('observe ms', ((performance.now() - c) / 10).toFixed(1));
