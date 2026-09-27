// Natures for everyone no persona describes (docs/gdd/08-characters-politics.md §2.2): the role gives the base, the
// house's country leans it, the character's written trait words push it, and a little seeded variation keeps two
// castellans from being twins. Nothing here reads prose — only the trait words of data/characters.js, one word at a time,
// through the TRAITS table below. (Reading prose by regex once made Eddard Stark "cunning" and "cold-blooded"; B-21.)
import { NATURE_KEYS, SWAY_KEYS } from './natures.js';
import { HOUSES } from './houses.js';

//                      cou wit gui pri tem war stu hon amb pie
export const ARCHETYPES = {
  lord:                [6, 6, 4, 6, 4, 5, 6, 6, 5, 5],
  lady:                [5, 6, 4, 6, 4, 6, 6, 6, 4, 6],
  ruler:               [6, 6, 5, 8, 5, 4, 7, 5, 7, 4],
  heir:                [6, 5, 3, 6, 5, 6, 5, 7, 5, 5],
  knight:              [7, 5, 3, 6, 5, 5, 6, 7, 4, 5],
  kingsguard:          [8, 5, 2, 6, 4, 4, 7, 7, 2, 5],
  commander:           [7, 6, 3, 6, 4, 4, 7, 6, 5, 4],
  captain:             [7, 5, 2, 5, 5, 5, 6, 8, 3, 4],
  master_at_arms:      [7, 5, 2, 5, 5, 4, 7, 8, 2, 4],
  maester:             [4, 8, 3, 3, 2, 6, 5, 8, 2, 2],
  steward:             [4, 7, 3, 3, 2, 5, 5, 8, 3, 5],
  spymaster:           [4, 8, 8, 4, 2, 3, 6, 3, 5, 2],
  council:             [4, 7, 6, 6, 3, 4, 6, 4, 6, 3],
  envoy:               [4, 7, 6, 5, 2, 6, 5, 5, 4, 3],
  priest:              [5, 6, 3, 5, 3, 6, 7, 7, 3, 9],
  family:              [5, 5, 3, 5, 4, 6, 5, 7, 3, 5],
  ward:                [5, 5, 3, 6, 5, 5, 5, 6, 4, 4],
  bastard:             [6, 6, 4, 5, 5, 5, 6, 6, 5, 3],
  sellsword:           [7, 6, 5, 5, 5, 3, 5, 3, 5, 1],
  wildling:            [8, 5, 3, 6, 6, 5, 7, 7, 3, 2],
  servant:             [4, 4, 2, 3, 3, 6, 5, 8, 1, 5],
};
// which archetype a character takes: their first role that has one (a knight who is also a lord is played as a lord)
const ORDER = ['sellsword', 'ruler', 'lord', 'lady', 'kingsguard', 'commander', 'spymaster', 'council', 'maester', 'steward', 'master_at_arms', 'captain', 'priest', 'envoy', 'wildling', 'heir', 'knight', 'bastard', 'ward', 'servant', 'family'];

// the country leans a nature a little (the books' cultures, not stereotypes of individuals)
const REGION = {
  north: { honesty: 1, warmth: -1, stubbornness: 1 }, beyond: { courage: 1, piety: -2, pride: 1 }, wall: { courage: 1, ambition: -2 },
  iron_islands: { courage: 1, warmth: -1, piety: 2, pride: 1 }, riverlands: { warmth: 1 }, vale: { pride: 1, piety: 1 },
  westerlands: { pride: 1, ambition: 1 }, reach: { pride: 1, piety: 1, courage: -1 }, stormlands: { temper: 1, courage: 1 },
  dorne: { temper: 1, warmth: 1, guile: 1 }, crownlands: { guile: 1, ambition: 1 }, essos: { guile: 1, piety: -2, ambition: 1 },
};

// written trait words, and what each one does to the scales (and to what sways them)
export const TRAITS = {
  brave: { courage: 2 }, fearless: { courage: 3 }, bold: { courage: 2 }, reckless: { courage: 3, wits: -1 }, fierce: { courage: 2, temper: 2 },
  craven: { courage: -3 }, cowardly: { courage: -3 }, cautious: { courage: -1, stubbornness: 1 }, timid: { courage: -2 },
  clever: { wits: 2 }, shrewd: { wits: 2, guile: 1 }, wise: { wits: 2 }, learned: { wits: 2 }, brilliant: { wits: 3 }, dim: { wits: -2 }, dull: { wits: -2 }, slow: { wits: -2 },
  cunning: { guile: 3, wits: 1 }, scheming: { guile: 3, honesty: -2 }, sly: { guile: 2 }, secretive: { guile: 2 }, calculating: { guile: 2, warmth: -1 },
  honest: { honesty: 2, guile: -1 }, honorable: { honesty: 2, guile: -1 }, honourable: { honesty: 2, guile: -1 }, just: { honesty: 1 }, dutiful: { stubbornness: 1 },
  deceitful: { honesty: -3 }, treacherous: { honesty: -3, guile: 2 }, corrupt: { honesty: -3 },
  proud: { pride: 2 }, vain: { pride: 3 }, arrogant: { pride: 3 }, haughty: { pride: 2, warmth: -1 }, humble: { pride: -2 }, modest: { pride: -1 },
  wrathful: { temper: 3 }, 'hot-tempered': { temper: 3 }, volatile: { temper: 3 }, quarrelsome: { temper: 2 }, patient: { temper: -2 }, calm: { temper: -2 }, stern: { temper: 1, warmth: -1 },
  cruel: { warmth: -3, temper: 1 }, sadistic: { warmth: -4, temper: 2 }, ruthless: { warmth: -2 }, cold: { warmth: -2, temper: -1 }, grim: { warmth: -1 },
  kind: { warmth: 2 }, gentle: { warmth: 2, temper: -1 }, jovial: { warmth: 2 }, generous: { warmth: 1 }, warm: { warmth: 2 }, courteous: { warmth: 1 }, loyal: { stubbornness: 1 },
  stubborn: { stubbornness: 2 }, obstinate: { stubbornness: 2 }, pliable: { stubbornness: -2 },
  ambitious: { ambition: 3 }, greedy: { ambition: 2 }, lazy: { ambition: -2 }, diligent: { ambition: 1 }, content: { ambition: -2 },
  pious: { piety: 3 }, devout: { piety: 3 }, zealous: { piety: 4 }, fanatic: { piety: 4 }, godless: { piety: -3 }, cynical: { piety: -2, warmth: -1 },
};
export const TRAIT_SWAY = {
  greedy: 'gold', corrupt: 'gold', ambitious: 'power', scheming: 'power', vain: 'flattery', proud: 'flattery', loyal: 'duty', dutiful: 'duty',
  honorable: 'honour', honourable: 'honour', just: 'honour', pious: 'faith', devout: 'faith', zealous: 'faith', vengeful: 'vengeance',
  cowardly: 'safety', craven: 'safety', timid: 'fear', protective: 'family', brave: 'strength', fierce: 'strength',
};
const ROLE_SWAY = {
  lord: ['duty', 'family'], lady: ['family', 'duty'], ruler: ['power', 'family'], heir: ['family', 'honour'], knight: ['honour'], kingsguard: ['duty', 'honour'],
  commander: ['duty', 'strength'], captain: ['duty'], master_at_arms: ['duty'], maester: ['duty'], steward: ['duty'], spymaster: ['gold', 'power'],
  council: ['power'], envoy: ['gold'], priest: ['faith'], family: ['family'], ward: ['family'], bastard: ['honour'], sellsword: ['gold'],
  wildling: ['strength', 'family'], servant: ['duty', 'safety'],
};

const REGION_OF = new Map(HOUSES.map((h) => [h.id, h.region]));
// a small, stable variation per character: the same id always gets the same nudges (FNV-1a hash)
function nudge(id, k) {
  let h = 2166136261; for (const ch of `${id}:${k}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 5) - 2; // -2..+2
}
const words = (t) => String(t || '').toLowerCase().split(/[,;]|\band\b/).map((w) => w.trim()).filter(Boolean);

/** The archetype a character is played by, for display and tests. */
export const archetypeOf = (c) => ORDER.find((r) => (c.roles || []).includes(r)) || 'family';

/** A nature row (0–10 per NATURE_KEYS) for a character with no written one. Deterministic. */
export function archetypeNature(c) {
  const row = [...ARCHETYPES[archetypeOf(c)]];
  const lean = REGION[REGION_OF.get(c.house)] || {};
  const add = (k, d) => { const i = NATURE_KEYS.indexOf(k); if (i >= 0) row[i] += d; };
  for (const [k, d] of Object.entries(lean)) add(k, d);
  for (const w of words(c.traits)) for (const [k, d] of Object.entries(TRAITS[w] || TRAITS[w.split(' ')[0]] || {})) add(k, d);
  // children are not yet what they will be: little guile, less ambition
  if ((c.age ?? 30) < 13) { add('guile', -2); add('ambition', -2); add('wits', -1); }
  return row.map((v, i) => Math.max(0, Math.min(10, Math.round(v + nudge(c.id, NATURE_KEYS[i]) * 0.5))));
}
/** What sways a character with no written sway: their role's, and their trait words'. */
export function archetypeSway(c) {
  const keys = new Set(ROLE_SWAY[archetypeOf(c)] || []);
  for (const w of words(c.traits)) if (TRAIT_SWAY[w]) keys.add(TRAIT_SWAY[w]);
  return Object.fromEntries(SWAY_KEYS.map((k) => [k, keys.has(k)]));
}
