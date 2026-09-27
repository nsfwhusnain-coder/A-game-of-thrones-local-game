// Sanity-checks the world data: every reference resolves, ids are unique, positions are in bounds.
import { HOUSES, EXTRA_HOLDINGS } from '../public/data/houses.js';
import { CHARACTERS } from '../public/data/characters.js';
import { WORLD } from '../public/data/geography.js';
import { SCENARIOS } from '../public/data/scenarios.js';
import { createInitialState, resolvePlaceId } from '../public/js/shared/world.js';
import { validate } from '../public/js/engine/state/validate.js';
import { ANCESTORS } from '../public/data/families.js';
import { PERSONAS } from '../public/data/histories.js';
import { NATURES, NATURE_KEYS, SWAY, SWAY_KEYS } from '../public/data/natures.js';

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
  const inParty = String(c.loc).startsWith('party:') && Object.values(SCENARIOS).some((sc) => sc.parties.some((p) => 'party:' + p.id === c.loc && (p.members || []).includes(c.id)));
  if (!resolvePlaceId(c.loc) && !inParty) bad(`${c.id}: unresolved location ${c.loc}`);
}
// every character has a sex (pronouns and succession read it; docs/gdd/13-content-data.md §7 rule 2)
for (const c of [...CHARACTERS, ...ANCESTORS]) if (!['m', 'f'].includes(c.sex)) bad(`${c.id}: no sex ('m' or 'f')`);
// every persona is played by written numbers, never by prose (GDD 08 §2.2): scales 0–10 and what sways them
for (const id of Object.keys(PERSONAS)) {
  const row = NATURES[id];
  if (!row) bad(`${id}: persona without nature scales in data/natures.js`);
  else if (row.length !== NATURE_KEYS.length || row.some((v) => !Number.isInteger(v) || v < 0 || v > 10)) bad(`${id}: nature scales must be ${NATURE_KEYS.length} integers 0–10`);
  if (!SWAY[id]?.length) bad(`${id}: persona without sway in data/natures.js`);
  else for (const k of SWAY[id]) if (!SWAY_KEYS.includes(k)) bad(`${id}: unknown sway "${k}"`);
}
for (const sc of Object.values(SCENARIOS)) {
  const st = createInitialState(sc.id, 'stark');
  for (const a of Object.values(st.parties)) {
    if (!a.at && !(a.kind === 'fleet' && Array.isArray(a.pos))) bad(`scenario ${sc.id}: party ${a.id} has no location`);
    if (a.commander && !charIds.has(a.commander)) bad(`army ${a.id}: unknown commander ${a.commander}`);
  }
  for (const [a, b] of sc.relations) if (!houseIds.has(a) || !houseIds.has(b)) bad(`relation ${a}-${b}: unknown house`);
  for (const c of Object.values(st.characters)) if (!['m', 'f'].includes(c.sex)) bad(`scenario ${sc.id}: ${c.id} has no sex`);
  // the world holds together before anyone moves (03 §14: everyone somewhere, doing one thing; no host on the sea)
  for (const m of validate(st)) bad(`scenario ${sc.id}: ${m}`);
  console.log(`scenario ${sc.id}: ${Object.keys(st.houses).length} houses, ${Object.keys(st.holdings).length} holdings, ${Object.keys(st.characters).length} characters, ${Object.keys(st.parties).length} parties`);
}
console.log(problems ? `${problems} problem(s)` : '✔ data OK');
process.exit(problems ? 1 : 0);
