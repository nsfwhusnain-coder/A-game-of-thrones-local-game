// Shared rules about people: sex and succession.
// Every character carries `sex` ('m' | 'f') from the data (data/characters.js WOMEN, data/families.js) or from whoever
// created them (the generated lords and kin). Old saves carried `gender`; a character the story invented may carry
// neither, and only then is the title read.
export function isFemale(c) {
  if (!c) return false;
  if (c.sex) return c.sex === 'f';
  if (c.gender) return c.gender === 'f';
  return /\b(lady|queen|princess|spearwife|septa|maid|daughter|wife|mother|widow|khaleesi)\b/i.test(c.title || '');
}
export const sexOf = (c) => (isFemale(c) ? 'f' : 'm');

/** Pronouns for the engine's own text, so Lady Mormont is not written "he". */
export function pronouns(c) {
  return isFemale(c)
    ? { he: 'she', He: 'She', him: 'her', his: 'her', His: 'Her', himself: 'herself', man: 'woman', lord: 'lady' }
    : { he: 'he', He: 'He', him: 'him', his: 'his', His: 'His', himself: 'himself', man: 'man', lord: 'lord' };
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
// Offices that are not inherited: the Free Cities elect, the Night's Watch chooses its Lord Commander, a
// free company its captain, the free folk their king. Blood does not pass them on.
export const ELECTED = ['city_state', 'order', 'company', 'tribe'];
function electedHeir(state, h, deceasedId) {
  if (h.rank === 'city_state') return null; // the magisters choose one of their own: a new name (see world.js)
  const skill = (c) => (c.skills || []).slice(0, 3).reduce((a, b) => a + b, 0) + ((c.roles || []).includes('commander') ? 6 : 0);
  const serving = Object.values(state.characters).filter((c) => c.alive && c.id !== deceasedId && c.house === h.id && (c.age ?? 30) >= 20 && !/imprisoned|captive|missing/.test(c.status || '') && !(c.roles || []).includes('ward'));
  return serving.sort((a, b) => skill(b) - skill(a))[0] || null;
}

export function heirOf(state, houseId, deceasedId) {
  const h = state.houses[houseId]; if (!h) return null;
  if (ELECTED.includes(h.rank)) return electedHeir(state, h, deceasedId);
  const chars = Object.values(state.characters);
  const dorne = h.region === 'dorne';
  const order = (list) => {
    const legit = list.filter((c) => !(c.roles || []).includes('bastard'));
    return dorne ? legit.sort(byAge) : [...legit.filter((c) => !isFemale(c)).sort(byAge), ...legit.filter((c) => isFemale(c)).sort(byAge)];
  };
  const dead = state.characters[deceasedId];
  // 0. the heir the lord named (the verb `name_heir`): his word is the succession's first rule
  const named = h.designated && state.characters[h.designated]; if (named && named.id !== deceasedId && canInherit(named, houseId)) return named;
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
