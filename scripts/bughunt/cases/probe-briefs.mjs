import { REPO } from '../paths.mjs';
import { pathToFileURL } from 'node:url';
process.env.WC_PROVIDER = 'mock';
const R = REPO + '/'; const im = (p) => import(pathToFileURL(R + p).href);
const W = await im('public/js/shared/world.js'); const B = await im('public/data/briefs.js'); const { HOUSES } = await im('public/data/houses.js');
const s = W.createInitialState('agot_298', 'stark', { seed: 1 });
const out = []; const seen = new Map();
for (const h of Object.values(s.houses)) {
  let b; try { b = B.briefFor(h, s); } catch (e) { out.push(`${h.id}: briefFor threw ${e.message.slice(0, 80)}`); continue; }
  const txt = JSON.stringify(b);
  if (/undefined|null|NaN|\[object/.test(txt)) out.push(`${h.id}: brief has undefined/null: ${txt.slice(0, 160)}`);
  if (!b.situation || b.situation.length < 40) out.push(`${h.id}: situation is short/empty: "${b.situation}"`);
  if (!(b.goals || []).length) out.push(`${h.id}: no goals`); if (!(b.levers || []).length) out.push(`${h.id}: no levers`);
  const k = b.situation; if (k) { if (!seen.has(k)) seen.set(k, []); seen.get(k).push(h.id); }
}
for (const [k, ids] of seen) if (ids.length > 6) out.push(`${ids.length} houses share the same situation text: "${k.slice(0, 100)}" (${ids.slice(0, 6).join(', ')}…)`);
console.log(out.length, 'findings'); console.log(out.slice(0, 30).join('\n'));
