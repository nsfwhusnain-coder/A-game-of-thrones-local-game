// Many seeds, a few turns each, a different house each time: an exception in a turn, or a world that breaks its own invariants. Usage: node seed-sweep.mjs <first seed> <count> [turns] [span]
import { REPO } from './paths.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
const [first = '1', count = '10', turns = '6', span = '30d'] = process.argv.slice(2);
process.env.WC_PROVIDER = 'mock'; process.env.WC_SAVES = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-bh-sweep-'));
const im = (p) => import(pathToFileURL(`${REPO}/${p}`).href);
const game = await im('server/game.js'); const { validate } = await im('public/js/engine/state/validate.js'); const { HOUSES } = await im('public/data/houses/index.js').catch(() => ({ HOUSES: null }));
const houses = HOUSES ? HOUSES.map((h) => h.id) : ['stark', 'lannister', 'tully', 'arryn', 'greyjoy', 'tyrell', 'martell', 'baratheon', 'targaryen', 'frey', 'bolton', 'umber', 'mormont', 'manderly', 'karstark', 'tarly', 'redwyne', 'hightower', 'dayne', 'velaryon'];
let bad = 0;
for (let k = 0; k < Number(count); k++) {
  const seed = Number(first) + k * 7919; const house = houses[(seed >>> 3) % houses.length];
  try {
    const { id } = game.newGame('agot_298', house, { seed });
    for (let t = 1; t <= Number(turns); t++) { await game.advance(id, { span }); await game.settled(id); const problems = validate(game.loadState(id)); if (problems.length) { bad++; console.log(`seed ${seed} ${house} turn ${t}: ${problems.slice(0, 2).join('; ')}`); break; } }
  } catch (e) { bad++; console.log(`seed ${seed} ${house}: THROW ${String(e.stack || e.message).split('\n').slice(0, 3).join(' | ').slice(0, 300)}`); }
}
console.log('done', count, 'seeds from', first, 'bad', bad);
fs.rmSync(process.env.WC_SAVES, { recursive: true, force: true });
