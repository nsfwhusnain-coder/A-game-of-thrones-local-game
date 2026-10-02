// fuzz the order reader and its receipt: random sentences from the words of orders, odd characters, long strings; reading and carrying out an order must refuse in words, never throw, never corrupt
import { REPO } from './paths.mjs';
import { pathToFileURL } from 'node:url';
process.env.WC_PROVIDER = 'mock';
const im = (p) => import(pathToFileURL(`${REPO}/${p}`).href);
const { createInitialState } = await im('public/js/shared/world.js'); const { parseOrder } = await im('server/orders/parse.js'); const { carryOut } = await im('server/orders.js'); const { withRng } = await im('public/js/engine/rng.js');
let seed = Number(process.argv[2] || 1); const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; }; const pick = (a) => a[Math.floor(rnd() * a.length)];
const s = createInitialState('agot_298', pick(['stark', 'tully', 'lannister']), { seed: 5 });
const names = Object.values(s.characters).slice(0, 80).map((c) => c.name); const places = Object.values(s.holdings).slice(0, 80).map((h) => h.name); const houses = Object.values(s.houses).slice(0, 60).map((h) => `House ${h.name}`);
const VERBS = ['Send', 'March', 'Raise', 'Call', 'Hold', 'Release', 'Execute', 'Marry', 'Betroth', 'Declare war on', 'Make peace with', 'Fortify', 'Hire', 'Disband', 'Merge', 'Recall', 'Write to', 'Send a raven to', 'Appoint', 'Grant', 'Feast', 'Tourney', 'Tax', 'Buy grain', 'Stay', 'Wait', 'Ride to', 'Sail to', 'Besiege', 'Storm', 'Parley with', 'Yield to'];
const BITS = ['with fifty men', 'with 1e9 men', 'with -5 men', 'with NaN men', 'and hold a feast', 'then march on', 'to the Wall', 'at once', 'in secret', 'for ransom', 'at 99999999999999999999 dragons', '🐺', '\u0000', '<script>', '${x}', '"quoted"', 'ü'.repeat(40), 'the the the', '', '?', '12', 'a third of the host', 'all of them', 'nobody', 'my heir', 'my wife', 'the King', 'the Hand'];
const word = () => pick([...names, ...places, ...houses, ...BITS]); const text = () => `${pick(VERBS)} ${word()} ${rnd() < 0.6 ? pick(['to', 'at', 'against', 'for', 'from']) + ' ' + word() : ''} ${rnd() < 0.5 ? pick(BITS) : ''}`.trim() + (rnd() < 0.5 ? '.' : '');
const n = Number(process.argv[3] || 1500); let thrown = 0; const seen = new Set();
for (let i = 0; i < n; i++) {
  const t = rnd() < 0.05 ? 'x'.repeat(Math.floor(rnd() * 20000)) : text();
  try { const reading = parseOrder(s, t); const copy = structuredClone(s); withRng(copy, () => carryOut(copy, { id: 'f', text: t, parsed: reading }, reading)); }
  catch (e) { const k = String(e.message).slice(0, 90); if (!seen.has(k)) { seen.add(k); thrown++; console.log('THROW', k, '::', JSON.stringify(t).slice(0, 120)); } }
  if (thrown > 12) break;
}
console.log('done', n, 'orders; throws', thrown);
