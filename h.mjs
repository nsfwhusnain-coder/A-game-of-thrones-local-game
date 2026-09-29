const fnv = (...parts) => { let h = 2166136261; for (const ch of parts.map(String).join('|')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const xs = Array.from({ length: 2000 }, (_, i) => fnv(298, 'stark', 'x', 'y', i) / 2 ** 32);
console.log('fnv mean', xs.reduce((a,b)=>a+b,0)/xs.length, new Set(xs).size);
const ys = Array.from({ length: 2000 }, (_, i) => fnv(298, 'stark', 'lannister', 'swords', i) / 2 ** 32);
console.log('fnv mean2', ys.reduce((a,b)=>a+b,0)/ys.length, new Set(ys).size);
// mulberry-style
const mix = (...parts) => { let h = 1779033703; for (const ch of parts.map(String).join('|')) { h = Math.imul(h ^ ch.charCodeAt(0), 3432918353); h = (h << 13) | (h >>> 19); } h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return (h ^= h >>> 16) >>> 0; };
const zs = Array.from({ length: 2000 }, (_, i) => mix(298, 'stark', 'x', 'y', i) / 2 ** 32);
console.log('mix mean', zs.reduce((a,b)=>a+b,0)/zs.length, new Set(zs).size);
