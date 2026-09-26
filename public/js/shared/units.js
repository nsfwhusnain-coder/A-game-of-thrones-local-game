// What a host is made of: knights, riders, foot and archers. A northern levy is mostly spears and axes with a few
// light horse; the Reach sends heavy knights; Dorne rides and shoots; a mounted company is all riders; a khalasar is
// nothing but horse. The breakdown follows the host through merges and losses, and its riders set its pace.
const MIX = {
  north:   { knights: 0.02, horse: 0.12, foot: 0.72, archers: 0.14 },
  reach:   { knights: 0.09, horse: 0.1, foot: 0.64, archers: 0.17 },
  west:    { knights: 0.08, horse: 0.1, foot: 0.66, archers: 0.16 },
  vale:    { knights: 0.1, horse: 0.12, foot: 0.62, archers: 0.16 },
  dorne:   { knights: 0.05, horse: 0.22, foot: 0.45, archers: 0.28 },
  iron:    { knights: 0.01, horse: 0.02, foot: 0.87, archers: 0.1 },
  wall:    { knights: 0.02, horse: 0.18, foot: 0.6, archers: 0.2 },
  levy:    { knights: 0.04, horse: 0.1, foot: 0.7, archers: 0.16 },
  maa:     { knights: 0.12, horse: 0.3, foot: 0.45, archers: 0.13 },
  riders:  { knights: 0.1, horse: 0.9, foot: 0, archers: 0 },
  horde:   { knights: 0, horse: 1, foot: 0, archers: 0 },
};
const REGION_MIX = { north: 'north', beyond: 'wall', wall: 'wall', reach: 'reach', westerlands: 'west', vale: 'vale', dorne: 'dorne', iron_islands: 'iron', riverlands: 'levy', stormlands: 'levy', crownlands: 'levy' };
export const UNIT_NAMES = { knights: 'knights', horse: 'riders', foot: 'foot', archers: 'archers' };

function mixFor(state, a) {
  const comp = String(a?.composition || '');
  if (/dothraki|khalasar|screamer/i.test(comp) || a?.owner === 'dothraki') return MIX.horde;
  if (/mounted|riders|outriders|horse(men)?\b|cavalry/i.test(comp) && !/levies/i.test(comp)) return MIX.riders;
  if (/men-at-arms|household|guard|gold cloak|sworn swords|sellswords|company/i.test(comp) && !/levies/i.test(comp)) return MIX.maa;
  const region = state?.houses?.[a?.owner]?.region || state?.holdings?.[state?.houses?.[a?.owner]?.seat]?.region;
  return MIX[REGION_MIX[region]] || MIX.levy;
}
/** A breakdown of `men` by this host's kind: whole numbers that add up to men. */
export function unitsFor(state, a, men) {
  const m = mixFor(state, a); const n = Math.max(0, Math.round(men));
  const u = { knights: Math.round(n * m.knights), horse: Math.round(n * m.horse), archers: Math.round(n * m.archers) };
  u.foot = Math.max(0, n - u.knights - u.horse - u.archers);
  return u;
}
/** The host's breakdown now: kept as it was made and merged, scaled to the men it has left. */
export function unitsOf(state, a) {
  if (!a) return { knights: 0, horse: 0, foot: 0, archers: 0 };
  const u = a.units; const total = u ? u.knights + u.horse + u.foot + u.archers : 0;
  if (!u || !total) return unitsFor(state, a, a.men);
  if (total === a.men) return { ...u };
  const f = a.men / total; const out = { knights: Math.round(u.knights * f), horse: Math.round(u.horse * f), archers: Math.round(u.archers * f) };
  out.foot = Math.max(0, a.men - out.knights - out.horse - out.archers);
  return out;
}
export const addUnits = (x, y) => ({ knights: x.knights + y.knights, horse: x.horse + y.horse, foot: x.foot + y.foot, archers: x.archers + y.archers });
/** Mostly mounted: the host rides at horse pace. */
export const mounted = (state, a) => { const u = unitsOf(state, a); return a.men > 0 && (u.horse + u.knights) / a.men >= 0.85; };
/** "480 knights, 1,400 riders, 11,200 foot, 2,400 archers" — only the kinds it has. */
export function unitsText(state, a) {
  const u = unitsOf(state, a);
  return Object.entries(UNIT_NAMES).filter(([k]) => u[k] > 0).map(([k, name]) => `${u[k].toLocaleString('en-GB')} ${name}`).join(', ');
}
