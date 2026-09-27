// Regency: who truly rules when the head of a house cannot.
//
// A boy of eight does not command his bannermen; a lord in an enemy's dungeon does not hold court. Westeros
// answers this with a regent — the widowed mother at the Eyrie, an uncle in the West, a castellan in the
// North — and the realm never quite forgets that the hand on the seal is not the hand that owns it.
//
// The engine owns this: it decides when a regency begins and ends, who takes it, and what it costs the house
// in the eyes of its vassals. The story model is told the result and narrates around it.
import { isFemale } from './people.js';
import { placeOf } from '../engine/parties.js';
import { fact } from '../engine/facts/log.js';

export const MAJORITY = 16; // the age at which a lord is held fit to rule in his own right

/** Why this house cannot rule itself — or null if its head is fit. */
export function incapacity(state, houseId) {
  const h = state.houses[houseId]; if (!h) return null;
  const lord = h.lord ? state.characters[h.lord] : null;
  if (!lord || !lord.alive) return null; // succession, not regency: resolveSuccessions handles it
  if ((lord.age ?? 30) < MAJORITY) return { kind: 'minority', text: `${lord.name} is ${lord.age ?? '?'} years old` };
  if (/imprison|captive|hostage/i.test(lord.status || '')) return { kind: 'captive', text: `${lord.name} is a prisoner` };
  if (/missing|lost/i.test(lord.status || '')) return { kind: 'missing', text: `${lord.name} is missing` };
  if (/incapable|maimed|comatose|insensible/i.test(`${lord.status || ''} ${lord.traits || ''}`)) return { kind: 'infirm', text: `${lord.name} cannot rule` };
  return null;
}

const adult = (c) => c && c.alive && (c.age ?? 30) >= 18 && !/imprison|captive|dead|exiled/i.test(c.status || '');
const skill = (c) => (c.skills || []).slice(0, 3).reduce((a, b) => a + b, 0);

/**
 * Who should hold the regency, in the order Westeros would expect:
 *   1. the lord's mother (the widow of the late lord), if she lives and is of the house
 *   2. an adult full sibling of the young lord
 *   3. an adult uncle or aunt (a sibling of either parent)
 *   4. the most capable adult of the house
 *   5. the castellan, steward or maester of the seat — a sworn man, not a claimant
 * Returns a character or null.
 */
export function chooseRegent(state, houseId) {
  const h = state.houses[houseId]; const lord = h?.lord && state.characters[h.lord];
  if (!lord) return null;
  const all = Object.values(state.characters);
  const ofHouse = (c) => c.house === houseId;
  const mother = lord.mother && state.characters[lord.mother];
  if (adult(mother) && ofHouse(mother)) return mother;
  const sibs = all.filter((c) => c.id !== lord.id && adult(c) && ofHouse(c) && ((lord.father && c.father === lord.father) || (lord.mother && c.mother === lord.mother)));
  if (sibs.length) return sibs.sort((a, b) => (a.born ?? 9999) - (b.born ?? 9999))[0];
  const parents = [lord.father, lord.mother].filter(Boolean).map((id) => state.characters[id]).filter(Boolean);
  const uncles = all.filter((c) => adult(c) && ofHouse(c) && parents.some((p) => (p.father && c.father === p.father) || (p.mother && c.mother === p.mother)));
  if (uncles.length) return uncles.sort((a, b) => skill(b) - skill(a))[0];
  const kin = all.filter((c) => adult(c) && ofHouse(c) && c.id !== lord.id && !(c.roles || []).includes('ward'));
  if (kin.length) return kin.sort((a, b) => skill(b) - skill(a))[0];
  const sworn = all.filter((c) => adult(c) && c.alive && placeOf(state, c) === h.seat && (c.roles || []).some((r) => ['castellan', 'steward', 'maester', 'commander'].includes(r)));
  return sworn.sort((a, b) => skill(b) - skill(a))[0] || null;
}

/** The person who actually speaks and acts for a house: the regent if there is one, else its head. */
export function speakerFor(state, houseId) {
  const h = state.houses[houseId]; if (!h) return null;
  const reg = h.regent && state.characters[h.regent];
  return reg?.alive ? reg : (h.lord && state.characters[h.lord]) || null;
}

/** True while someone else rules in the head's name. */
export const underRegency = (state, houseId) => !!(state.houses[houseId]?.regent && state.characters[state.houses[houseId].regent]?.alive && incapacity(state, houseId));

/** A short line for the prompt and the UI: "Lysa Arryn rules as regent for Robert Arryn (8)". */
export function regencyLine(state, houseId) {
  const h = state.houses[houseId]; if (!h?.regent) return null;
  const reg = state.characters[h.regent], lord = state.characters[h.lord];
  if (!reg?.alive || !lord) return null;
  const why = incapacity(state, houseId); if (!why) return null;
  return `${reg.name} rules as regent for ${lord.name} — ${why.text}.`;
}

/**
 * Install, keep or end regencies across the realm, and charge the political cost of being ruled by a proxy.
 * Returns { events, applied } in the same shape as the other ticks.
 */
export function regencyTick(state, days = 30) {
  const events = []; const applied = [];
  const p = state.meta.player;
  for (const h of Object.values(state.houses)) {
    if (h.status === 'extinct' || h.rank === 'company') continue;
    const why = incapacity(state, h.id);
    const cur = h.regent && state.characters[h.regent];
    if (!why) {
      // the lord has come of age, been ransomed, or come home: the regent gives up the seal
      if (cur) {
        const lord = state.characters[h.lord];
        delete h.regent;
        const mine = h.id === p;
        events.push(fact(state, 'regency_ended', {
          title: `${lord?.name || 'The lord'} rules in ${lord && isFemale(lord) ? 'her' : 'his'} own right`,
          text: `${cur.name}'s regency over House ${h.name} is at an end. ${lord?.name || 'The lord'} takes the seal ${(lord?.age ?? 20) >= MAJORITY ? 'on coming of age' : 'once more'}.`,
          where: h.seat, importance: mine ? 4 : 2, type: 'court', houses: [h.id], day: Math.max(1, Math.round(days / 2)),
        }, { actors: [h.lord, cur.id] }));
        applied.push({ op: 'regency', text: `${h.name}: the regency of ${cur.name} ends` });
      }
      continue;
    }
    if (cur?.alive) continue; // the regency stands
    const reg = chooseRegent(state, h.id);
    if (!reg) continue; // nobody fit: the house drifts, and its vassals notice (below)
    h.regent = reg.id;
    const lord = state.characters[h.lord];
    const mine = h.id === p;
    events.push(fact(state, 'regency_begun', {
      title: `${reg.name} takes the regency of House ${h.name}`,
      text: `With ${why.text}, ${reg.name} rules House ${h.name} in ${lord && isFemale(lord) ? 'her' : 'his'} name.`,
      details: `A regent's word carries the house's seal but not its blood: bannermen obey a regent more slowly, and less far, than they obey their lord.`,
      where: h.seat, importance: mine ? 4 : 2, type: 'court', houses: [h.id], day: 1,
    }, { actors: [reg.id, h.lord], data: { why: why.kind } }));
    applied.push({ op: 'regency', text: `${h.name}: ${reg.name} rules as regent (${why.kind})` });
  }
  // The cost of a proxy: bannermen chafe, and the smallfolk grumble, while a child or a captive holds the seat.
  const months = days / 30;
  for (const h of Object.values(state.houses)) {
    const why = incapacity(state, h.id); if (!why) continue;
    const none = !(h.regent && state.characters[h.regent]?.alive);
    const drift = (why.kind === 'minority' ? 0.9 : 1.4) * (none ? 2 : 1) * months;
    for (const v of Object.values(state.houses)) {
      if (v.liege !== h.id) continue;
      const vl = v.lord && state.characters[v.lord]; if (!vl) continue;
      vl.loyalty = Math.max(0, Math.min(100, (vl.loyalty ?? 60) - drift));
    }
    for (const hold of Object.values(state.holdings)) {
      if (hold.owner !== h.id) continue;
      hold.unrest = Math.max(0, Math.min(100, (hold.unrest ?? 10) + drift * 0.6));
    }
  }
  return { events, applied };
}
