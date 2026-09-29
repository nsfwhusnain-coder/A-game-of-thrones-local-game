process.env.WC_PROVIDER = 'mock';
const root = process.argv[2];
const { createInitialState } = await import(root + '/public/js/shared/world.js');
const { sampleRealm } = await import(root + '/public/js/engine/realm/stats.js');
const s = createInitialState('agot_298', 'stark', { seed: 298 });
s.__ixTick = 1; // prototype only: the index is valid for this pass
const med = (f, n = 15) => { const a = Array.from({ length: n }, () => { const t = performance.now(); f(); return performance.now() - t; }).sort((x, y) => x - y); return `${a[n >> 1].toFixed(1)} ms (best ${a[0].toFixed(1)})`; };
console.log(root.split('/').slice(-1)[0], 'sampleRealm', med(() => { delete s.__alms; s.__ixTick++; sampleRealm(s); }));
