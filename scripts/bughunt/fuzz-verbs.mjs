// fuzz the verbs: weird params; perform must refuse in words, never throw, never corrupt
import { REPO } from './paths.mjs';
import { pathToFileURL } from 'node:url';
process.env.WC_PROVIDER = 'mock';
const R = `${REPO}/public/js/`;
const { createInitialState } = await import(pathToFileURL(R + 'shared/world.js').href); const { withRng } = await import(pathToFileURL(R + 'engine/rng.js').href);
const { VERBS, perform, check, intentFor } = await import(pathToFileURL(R + 'engine/actions/registry.js').href);
const { validate } = await import(pathToFileURL(R + 'engine/state/validate.js').href);
let seed = Number(process.argv[2] || 1); const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; }; const pick = (a) => a[Math.floor(rnd() * a.length)];
const s = createInitialState('agot_298', pick(['stark', 'lannister', 'tully', 'greyjoy']), { seed: 11 });
const ids = { chars: Object.keys(s.characters), houses: Object.keys(s.houses), holds: Object.keys(s.holdings), parties: Object.keys(s.parties) };
const W = [0, 1, -1, 50, 1e9, -1e9, NaN, Infinity, '12', '', null, undefined, 'abc', [], {}, true, 'stark', 'Winterfell', 'party:nope'];
const valFor = (type) => { const t = String(type || ''); if (/character/.test(t)) return pick([...ids.chars, 'nobody', null, '']); if (/house/.test(t)) return pick([...ids.houses, 'nope', null]); if (/place/.test(t)) return pick([...ids.holds, 'Winterfell', 'nowhere', null, '']); if (/number/.test(t)) return pick(W); return pick(W.concat(ids.chars, ids.holds)); };
let thrown = 0, corrupt = 0; const seen = new Set(); const names = Object.keys(VERBS); const n = Number(process.argv[3] || 2000);
const scan = () => { const bad = []; const walk = (o, p, d) => { if (d > 6 || !o || typeof o !== 'object') return; for (const [k, v] of Object.entries(o)) { if (typeof v === 'number' && !Number.isFinite(v)) bad.push(`${p}.${k}=${v}`); else if (v && typeof v === 'object') walk(v, `${p}.${k}`, d + 1); } }; for (const key of ['characters', 'houses', 'holdings', 'parties']) walk(s[key], key, 0); return bad.slice(0, 2); };
for (let i = 0; i < n; i++) {
  const verb = pick(names); const def = VERBS[verb]; const params = {}; for (const [k, ty] of Object.entries(def.params || {})) if (rnd() < 0.85 || !String(ty).endsWith('?')) params[k] = valFor(ty);
  const house = pick([s.meta.player, s.meta.player, pick(ids.houses)]);
  try { withRng(s, () => perform(s, verb, { house, params, source: { type: 'intent', ref: pick(ids.chars), by: 'mock' } })); }
  catch (e) { const k = `${verb}: ${String(e.message).slice(0, 80)}`; if (!seen.has(k)) { seen.add(k); thrown++; console.log('THROW', k, JSON.stringify(params).slice(0, 140)); } }
  const bad = scan(); if (bad.length && !seen.has(bad[0])) { seen.add(bad[0]); corrupt++; console.log(`CORRUPT after ${verb} ${JSON.stringify(params).slice(0, 120)}: ${bad.join('; ')}`); }
  if (thrown + corrupt > 14) break;
}
console.log('done', n, 'verb calls; throws', thrown, 'corruptions', corrupt);
