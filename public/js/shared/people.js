// Shared rules about people: gender inference and succession.
const FEMALE = new Set(['catelyn_stark', 'sansa_stark', 'arya_stark', 'lyarra_stark', 'lyanna_stark', 'minisa_whent', 'maege_mormont', 'dacey_mormont', 'meera_reed', 'donella_hornwood', 'barbrey_dustin', 'ygritte', 'val', 'cersei_lannister', 'myrcella_baratheon', 'selyse_florent', 'shireen_baratheon', 'melisandre', 'brienne_tarth', 'jeyne_westerling', 'lysa_arryn', 'anya_waynwood', 'olenna_tyrell', 'margaery_tyrell', 'arianne_martell', 'ellaria_sand', 'obara_sand', 'asha_greyjoy', 'daenerys_targaryen', 'shella_whent', 'arwyn_oakheart', 'joanna_lannister', 'cassana_estermont', 'rhaella_targaryen', 'elia_martell', 'rhaenys_targaryen', 'alannys_harlaw', 'mellario']);
export function isFemale(c) {
  if (!c) return false;
  if (c.gender) return c.gender === 'f';
  return FEMALE.has(c.id) || /\b(lady|queen|princess|spearwife|septa|maid|daughter|wife|mother|widow|khaleesi)\b/i.test(c.title || '');
}

const NO_INHERIT = /night'?s watch|maester|kingsguard|septon|septa|silent sister|recruit/i;
function canInherit(c, houseId) {
  if (!c || !c.alive) return false;
  if (c.status === 'exiled') return false;
  if ((c.roles || []).some((r) => ['maester', 'kingsguard', 'ward'].includes(r))) return false;
  if (c.house !== houseId && c.house !== 'nights_watch') return !NO_INHERIT.test(c.title || '');
  if (c.house === 'nights_watch' || NO_INHERIT.test(c.title || '')) return false;
  return true;
}
const byAge = (a, b) => (a.born ?? 9999) - (b.born ?? 9999);

/** Westerosi male-preference primogeniture (Dorne: absolute primogeniture). Returns the heir or null. */
export function heirOf(state, houseId, deceasedId) {
  const h = state.houses[houseId]; if (!h) return null;
  const chars = Object.values(state.characters);
  const dorne = h.region === 'dorne';
  const order = (list) => {
    const legit = list.filter((c) => !(c.roles || []).includes('bastard'));
    return dorne ? legit.sort(byAge) : [...legit.filter((c) => !isFemale(c)).sort(byAge), ...legit.filter((c) => isFemale(c)).sort(byAge)];
  };
  const dead = state.characters[deceasedId];
  // 1. children (and their lines) of the late lord
  const kids = order(chars.filter((c) => (c.father === deceasedId || c.mother === deceasedId)));
  for (const k of kids) {
    if (canInherit(k, houseId)) return k;
    const gk = order(chars.filter((c) => c.father === k.id || c.mother === k.id)).find((g) => canInherit(g, houseId));
    if (gk) return gk;
  }
  // 2. siblings of the late lord
  if (dead) {
    const sibs = order(chars.filter((c) => c.id !== dead.id && ((dead.father && c.father === dead.father) || (dead.mother && c.mother === dead.mother))));
    for (const sib of sibs) {
      if (canInherit(sib, houseId)) return sib;
      const nephew = order(chars.filter((c) => c.father === sib.id || c.mother === sib.id)).find((g) => canInherit(g, houseId));
      if (nephew) return nephew;
    }
  }
  // 3. heir designate or any adult member of the house
  const members = chars.filter((c) => c.house === houseId && canInherit(c, houseId));
  const heir = members.find((c) => (c.roles || []).includes('heir'));
  if (heir) return heir;
  return order(members)[0] || null;
}
