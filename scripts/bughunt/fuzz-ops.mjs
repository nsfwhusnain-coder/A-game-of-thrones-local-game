// fuzz applyChanges with the ops a model could emit: weird parameters; look for corruption (NaN, negatives, invariant breaks), never for throws (those are rejections)
import { REPO } from './paths.mjs';
import { pathToFileURL } from 'node:url';
process.env.WC_PROVIDER = 'mock';
const R = `${REPO}/public/js/`;
const { createInitialState, applyChanges } = await import(pathToFileURL(R + 'shared/world.js').href);
const { validate } = await import(pathToFileURL(R + 'engine/state/validate.js').href);
const { withRng } = await import(pathToFileURL(R + 'engine/rng.js').href);
const OPS = 'alliance army_create army_destroy army_disband army_march army_move army_update battle betroth character character_new character_update choice chronicle decision embargo fealty figure figures fleet_create fleet_destroy fleet_move fleet_sail fleet_update found hire hire_men hire_officer holding holding_new holding_update house house_figure house_update landmark letter liege march marriage marriage_characters memory message move_army new_character obligation pact policy project province raise_army raven recruit relation report ride rumour_host season send_character set_liege settlement sighting tax trade travel treaty vassal war war_join wed'.split(' ');
let seed = Number(process.argv[2] || 1); const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; }; const pick = (a) => a[Math.floor(rnd() * a.length)];
const s = createInitialState('agot_298', 'stark', { seed: 7 });
const chars = Object.keys(s.characters); const houses = Object.keys(s.houses); const holds = Object.keys(s.holdings); const parties = Object.keys(s.parties);
const NUMS = [0, 1, -1, 5, 100, 1e9, -1e9, NaN, Infinity, 0.5, '12', '', null, undefined, 'abc', [], {}, true];
const val = (k) => { if (/^(id|character|char|who|to|name|a|b|army|party)$/.test(k)) return pick([...chars, ...parties, ...holds, ...houses, '', null, 'nobody', 'party:x', 7]); if (/house|owner|liege|vassal|lord/.test(k)) return pick([...houses, '', null, 'x']); if (/holding|place|at|seat|loc|where/.test(k)) return pick([...holds, '', null, 'nowhere']); return pick(NUMS.concat(['strong', 'dead', 'imprisoned', 'free', 'wounded', 'missing'])); };
const KEYS = ['id', 'character', 'name', 'house', 'owner', 'liege', 'to', 'at', 'a', 'b', 'army', 'men', 'delta', 'field', 'value', 'status', 'title', 'alive', 'age', 'loc', 'commander', 'ships', 'gold', 'amount', 'type', 'text', 'unrest', 'prosperity', 'population', 'stress', 'spouse', 'father', 'mother', 'sex', 'roles', 'op'];
let corrupt = 0; const seen = new Set(); const n = Number(process.argv[3] || 3000);
function scan(state) { const bad = []; const walk = (o, path, depth) => { if (depth > 6 || !o || typeof o !== 'object') return; for (const [k, v] of Object.entries(o)) { if (typeof v === 'number' && !Number.isFinite(v)) bad.push(`${path}.${k}=${v}`); else if (v && typeof v === 'object') walk(v, `${path}.${k}`, depth + 1); } }; for (const key of ['characters', 'houses', 'holdings', 'parties']) walk(state[key], key, 0); return bad.slice(0, 3); }
const before = scan(s); if (before.length) console.log('start already has', before);
for (let i = 0; i < n; i++) {
  const op = { op: pick(OPS) }; const k = 1 + Math.floor(rnd() * 5); for (let j = 0; j < k; j++) { const key = pick(KEYS); if (key !== 'op') op[key] = val(key); }
  try { withRng(s, () => applyChanges(s, [op], { source: 'fuzz', protectPlayer: rnd() < 0.5 })); } catch (e) { /* a rejection or a crash of the op: only a crash outside applyChanges' own catch matters */ }
  const bad = scan(s); const prob = validate(s);
  if ((bad.length || prob.length) && !seen.has(bad[0] || prob[0])) { seen.add(bad[0] || prob[0]); corrupt++; console.log(`#${i} ${JSON.stringify(op).slice(0, 160)} -> ${bad.join('; ') || prob.slice(0, 2).join('; ')}`); if (corrupt > 12) break; }
}
console.log('done', n, 'ops, distinct corruptions', corrupt);
