// Sanity-checks the world data: every reference resolves, ids are unique, positions are in bounds.
import { HOUSES, EXTRA_HOLDINGS } from '../public/data/houses.js';
import { CHARACTERS } from '../public/data/characters.js';
import { ROADS, WORLD } from '../public/data/geography.js';
import { SCENARIOS } from '../public/data/scenarios.js';
import { createInitialState, resolvePlaceId } from '../public/js/shared/world.js';

let problems = 0;
const bad = (m) => { problems++; console.log('✖', m); };
const houseIds = new Set();
for (const h of HOUSES) {
  if (houseIds.has(h.id)) bad('duplicate house ' + h.id);
  houseIds.add(h.id);
  if (h.liege && !HOUSES.some((x) => x.id === h.liege)) bad(`${h.id}: unknown liege ${h.liege}`);
  const [x, y] = h.pos; if (x < 0 || y < 0 || x > WORLD.w || y > WORLD.h) bad(`${h.id}: position out of bounds`);
}
for (const e of EXTRA_HOLDINGS) if (!houseIds.has(e[4])) bad(`holding ${e[0]}: unknown owner ${e[4]}`);
const charIds = new Set();
for (const c of CHARACTERS) {
  if (charIds.has(c.id)) bad('duplicate character ' + c.id);
  charIds.add(c.id);
  if (!houseIds.has(c.house)) bad(`${c.id}: unknown house ${c.house}`);
  if (!resolvePlaceId(c.loc) && c.loc !== 'at_sea') bad(`${c.id}: unresolved location ${c.loc}`);
}
for (const r of ROADS) for (const v of r.via) if (!resolvePlaceId(v)) bad(`road ${r.name}: unknown stop ${v}`);
for (const sc of Object.values(SCENARIOS)) {
  const st = createInitialState(sc.id, 'stark');
  for (const a of Object.values(st.armies)) {
    if (!a.at) bad(`scenario ${sc.id}: army ${a.id} has no location`);
    if (a.commander && !charIds.has(a.commander)) bad(`army ${a.id}: unknown commander ${a.commander}`);
  }
  for (const [a, b] of sc.relations) if (!houseIds.has(a) || !houseIds.has(b)) bad(`relation ${a}-${b}: unknown house`);
  console.log(`scenario ${sc.id}: ${Object.keys(st.houses).length} houses, ${Object.keys(st.holdings).length} holdings, ${Object.keys(st.characters).length} characters, ${Object.keys(st.armies).length} armies`);
}
console.log(problems ? `${problems} problem(s)` : '✔ data OK');
process.exit(problems ? 1 : 0);
