const { createInitialState } = await import('/home/user/wc-s1/public/js/shared/world.js');
const s = createInitialState('agot_298', 'stark', { seed: 298 });
const hs = Object.values(s.houses);
const f = hs.map((h) => h.figures?.food?.v);
console.log('houses', hs.length, 'food==null', f.filter((x) => x == null).length, 'food===0', f.filter((x) => x === 0).length, 'food<2', f.filter((x) => x != null && x < 2).length);
