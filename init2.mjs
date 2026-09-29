process.env.WC_PROVIDER = 'mock';
const R = '/home/user/wc-s2/public/js/';
const { createInitialState } = await import(R + 'shared/world.js');
const { sampleRealm } = await import(R + 'engine/realm/stats.js');
const s = createInitialState('agot_298', 'stark', { seed: 1 });
const med = (f, n = 15) => { const a = Array.from({ length: n }, () => { const t = performance.now(); f(); return performance.now() - t; }).sort((x, y) => x - y); return `${a[n >> 1].toFixed(1)} ms (best ${a[0].toFixed(1)})`; };
console.log('createInitialState (with first sample)', med(() => createInitialState('agot_298', 'stark', { seed: 298 }), 9));
console.log('sampleRealm on a fresh world          ', med(() => sampleRealm(s)));
