// Sanity-checks the world data: every reference resolves, ids are unique, positions are in bounds.
import { HOUSES, EXTRA_HOLDINGS } from '../public/data/houses.js';
import { CHARACTERS } from '../public/data/characters.js';
import { WORLD, LAND, LAKES } from '../public/data/geography.js';
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
// GDD 13 §7 rules 1 and 3: every seat is on land (a harbour may stand within three units of the coast) and no two seats lie closer than five units (a day's ride on the map)
const inPoly = (x, y, pts) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
const coastDist = (x, y) => { let best = Infinity; for (const l of LAND) for (let i = 0; i < l.pts.length; i++) { const a = l.pts[i], b = l.pts[(i + 1) % l.pts.length]; const dx = b[0] - a[0], dy = b[1] - a[1]; const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1))); best = Math.min(best, Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy))); } return best; };
const seats = [...HOUSES.filter((h) => h.pos).map((h) => [h.id, ...h.pos]), ...EXTRA_HOLDINGS.map((e) => [e[0], e[2], e[3]])];
for (const [id, x, y] of seats) if (!LAND.some((l) => inPoly(x, y, l.pts)) && coastDist(x, y) > 3) bad(`${id}: (${x}, ${y}) is not on land`);
const landed = seats.filter(([id]) => !HOUSES.some((h) => h.id === id && h.landless)); // a landless house is where its camp is
for (let i = 0; i < landed.length; i++) for (let j = i + 1; j < landed.length; j++) if (Math.hypot(landed[i][1] - landed[j][1], landed[i][2] - landed[j][2]) < 5) bad(`${landed[i][0]} and ${landed[j][0]} lie closer than five units`);
const seatNames = new Map(); for (const h of HOUSES) if (h.seat && !h.landless) { const k = h.seat.toLowerCase(); if (seatNames.has(k)) bad(`${h.id} and ${seatNames.get(k)} share the seat "${h.seat}"`); seatNames.set(k, h.id); }
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
