process.env.WC_PROVIDER = 'mock';
const root = process.argv[2];
const { createInitialState } = await import(root + '/public/js/shared/world.js');
createInitialState('agot_298', 'stark', { seed: 1 });
const a = Array.from({ length: 7 }, () => { const t = performance.now(); createInitialState('agot_298', 'stark', { seed: 298 }); return performance.now() - t; }).sort((x, y) => x - y);
console.log(root.split('/').slice(-1)[0], 'createInitialState median', a[3].toFixed(0), 'ms');
