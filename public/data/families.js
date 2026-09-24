// Lineages, marriages, ancestors, appearance and CK3-style skills.

// Dead ancestors & notable dead (so family trees have roots). Same shape as CHARACTERS.
const D = (id, name, house, title, born, died, extra = {}) => ({ id, name, house, title, age: died - born, born, died, loc: null, roles: ['family'], traits: extra.traits || '', bio: extra.bio || '', alive: false, ...extra });
export const ANCESTORS = [
  D('rickard_stark', 'Rickard Stark', 'stark', 'Lord of Winterfell', 230, 282, { bio: 'Burned alive by the Mad King.' }),
  D('lyarra_stark', 'Lyarra Stark', 'stark', 'Lady of Winterfell', 245, 267),
  D('brandon_stark_elder', 'Brandon Stark', 'stark', 'Heir to Winterfell', 262, 282, { bio: 'Strangled before his father\'s eyes in the Red Keep.' }),
  D('lyanna_stark', 'Lyanna Stark', 'stark', '', 266, 283, { bio: 'Died at the Tower of Joy. "Promise me, Ned."' }),
  D('edmyn_tully', 'Edmyn Tully', 'tully', 'Lord of Riverrun', 205, 265),
  D('minisa_whent', 'Minisa Whent', 'tully', 'Lady of Riverrun', 242, 272),
  D('jon_arryn', 'Jon Arryn', 'arryn', 'Hand of the King, Lord of the Eyrie', 218, 298, { bio: 'Died suddenly of a fever — or of poison.' }),
  D('tytos_lannister', 'Tytos Lannister', 'lannister', 'Lord of Casterly Rock', 220, 267, { bio: 'A weak, laughing lord whose vassals mocked him.' }),
  D('joanna_lannister', 'Joanna Lannister', 'lannister', 'Lady of Casterly Rock', 241, 273, { bio: 'Died giving birth to Tyrion.' }),
  D('steffon_baratheon', 'Steffon Baratheon', 'baratheon_se', 'Lord of Storm\'s End', 246, 278, { bio: 'Drowned with his wife in Shipbreaker Bay.' }),
  D('cassana_estermont', 'Cassana Estermont', 'baratheon_se', 'Lady of Storm\'s End', 249, 278),
  D('aerys_targaryen', 'Aerys II Targaryen', 'targaryen', 'The Mad King', 244, 283, { bio: 'Slain by Jaime Lannister. "Burn them all."' }),
  D('rhaella_targaryen', 'Rhaella Targaryen', 'targaryen', 'Queen', 245, 284),
  D('rhaegar_targaryen', 'Rhaegar Targaryen', 'targaryen', 'Prince of Dragonstone', 259, 283, { bio: 'Slain by Robert at the Ruby Ford.' }),
  D('elia_martell', 'Elia Martell', 'martell', 'Princess of Dragonstone', 257, 283, { bio: 'Murdered with her children during the Sack of King\'s Landing.' }),
  D('rhaenys_targaryen', 'Rhaenys Targaryen', 'targaryen', 'Princess', 280, 283),
  D('aegon_targaryen', 'Aegon Targaryen', 'targaryen', 'Prince', 282, 283, { bio: 'Believed murdered by Gregor Clegane.' }),
  D('luthor_tyrell', 'Luthor Tyrell', 'tyrell', 'Lord of Highgarden', 225, 272, { bio: 'Rode off a cliff while hawking.' }),
  D('quellon_greyjoy', 'Quellon Greyjoy', 'greyjoy', 'Lord Reaper of Pyke', 210, 283),
  D('rodrik_greyjoy', 'Rodrik Greyjoy', 'greyjoy', '', 272, 289, { bio: 'Slain at Seagard during the Greyjoy Rebellion.' }),
  D('maron_greyjoy', 'Maron Greyjoy', 'greyjoy', '', 274, 289, { bio: 'Died when the tower of Pyke collapsed.' }),
  D('alannys_harlaw', 'Alannys Harlaw', 'greyjoy', 'Lady of Pyke', 252, 400, { alive: true, died: undefined, age: 46, loc: 'harlaw', roles: ['lady'], traits: 'grieving, withdrawn' }),
  D('lewyn_martell', 'Lewyn Martell', 'martell', 'Kingsguard', 240, 283),
  D('mellario', 'Mellario of Norvos', 'martell', 'Princess of Dorne (estranged)', 255, 400, { alive: true, died: undefined, age: 43, loc: 'norvos', roles: ['lady'] }),
];
// alive "ancestors" fix-up
for (const a of ANCESTORS) if (a.alive) { delete a.died; }

// child: [father, mother]
export const PARENTS = {
  eddard_stark: ['rickard_stark', 'lyarra_stark'], benjen_stark: ['rickard_stark', 'lyarra_stark'], brandon_stark_elder: ['rickard_stark', 'lyarra_stark'], lyanna_stark: ['rickard_stark', 'lyarra_stark'],
  robb_stark: ['eddard_stark', 'catelyn_stark'], sansa_stark: ['eddard_stark', 'catelyn_stark'], arya_stark: ['eddard_stark', 'catelyn_stark'], bran_stark: ['eddard_stark', 'catelyn_stark'], rickon_stark: ['eddard_stark', 'catelyn_stark'],
  jon_snow: ['eddard_stark', null], // officially
  catelyn_stark: ['hoster_tully', 'minisa_whent'], lysa_arryn: ['hoster_tully', 'minisa_whent'], edmure_tully: ['hoster_tully', 'minisa_whent'], hoster_tully: ['edmyn_tully', null], brynden_tully: ['edmyn_tully', null],
  robert_arryn: ['jon_arryn', 'lysa_arryn'],
  tywin_lannister: ['tytos_lannister', null], kevan_lannister: ['tytos_lannister', null],
  cersei_lannister: ['tywin_lannister', 'joanna_lannister'], jaime_lannister: ['tywin_lannister', 'joanna_lannister'], tyrion_lannister: ['tywin_lannister', 'joanna_lannister'],
  lancel_lannister: ['kevan_lannister', null],
  joffrey_baratheon: ['robert_baratheon', 'cersei_lannister'], myrcella_baratheon: ['robert_baratheon', 'cersei_lannister'], tommen_baratheon: ['robert_baratheon', 'cersei_lannister'],
  gendry: ['robert_baratheon', null],
  robert_baratheon: ['steffon_baratheon', 'cassana_estermont'], stannis_baratheon: ['steffon_baratheon', 'cassana_estermont'], renly_baratheon: ['steffon_baratheon', 'cassana_estermont'],
  shireen_baratheon: ['stannis_baratheon', 'selyse_florent'],
  rhaegar_targaryen: ['aerys_targaryen', 'rhaella_targaryen'], viserys_targaryen: ['aerys_targaryen', 'rhaella_targaryen'], daenerys_targaryen: ['aerys_targaryen', 'rhaella_targaryen'],
  rhaenys_targaryen: ['rhaegar_targaryen', 'elia_martell'], aegon_targaryen: ['rhaegar_targaryen', 'elia_martell'],
  mace_tyrell: ['luthor_tyrell', 'olenna_tyrell'], willas_tyrell: ['mace_tyrell', null], garlan_tyrell: ['mace_tyrell', null], loras_tyrell: ['mace_tyrell', null], margaery_tyrell: ['mace_tyrell', null],
  balon_greyjoy: ['quellon_greyjoy', null], euron_greyjoy: ['quellon_greyjoy', null], victarion_greyjoy: ['quellon_greyjoy', null], aeron_greyjoy: ['quellon_greyjoy', null],
  theon_greyjoy: ['balon_greyjoy', 'alannys_harlaw'], asha_greyjoy: ['balon_greyjoy', 'alannys_harlaw'], rodrik_greyjoy: ['balon_greyjoy', 'alannys_harlaw'], maron_greyjoy: ['balon_greyjoy', 'alannys_harlaw'],
  arianne_martell: ['doran_martell', 'mellario'], quentyn_martell: ['doran_martell', 'mellario'], trystane_martell: ['doran_martell', 'mellario'],
  obara_sand: ['oberyn_martell', null],
  ramsay_snow: ['roose_bolton', null], harrion_karstark: ['rickard_karstark', null], smalljon_umber: ['greatjon_umber', null],
  dacey_mormont: [null, 'maege_mormont'], jorah_mormont: ['jeor_mormont', null],
  wylis_manderly: ['wyman_manderly', null], wendel_manderly: ['wyman_manderly', null],
  meera_reed: ['howland_reed', null], jojen_reed: ['howland_reed', null],
  stevron_frey: ['walder_frey', null], black_walder_frey: ['walder_frey', null], lothar_frey: ['walder_frey', null],
  patrek_mallister: ['jason_mallister', null], samwell_tarly: ['randyll_tarly', null], dickon_tarly: ['randyll_tarly', null],
  addam_marbrand: ['damon_marbrand', null], jeyne_westerling: ['gawen_westerling', null], brienne_tarth: ['selwyn_tarth', null],
  benfred_tallhart: ['helman_tallhart', null], cley_cerwyn: ['medger_cerwyn', null],
};

export const SPOUSES = [
  ['eddard_stark', 'catelyn_stark'], ['rickard_stark', 'lyarra_stark'], ['hoster_tully', 'minisa_whent'], ['jon_arryn', 'lysa_arryn'],
  ['tywin_lannister', 'joanna_lannister'], ['robert_baratheon', 'cersei_lannister'], ['steffon_baratheon', 'cassana_estermont'],
  ['stannis_baratheon', 'selyse_florent'], ['aerys_targaryen', 'rhaella_targaryen'], ['rhaegar_targaryen', 'elia_martell'],
  ['luthor_tyrell', 'olenna_tyrell'], ['balon_greyjoy', 'alannys_harlaw'], ['doran_martell', 'mellario'],
];

// Appearance by house (hair, eyes, skin). Characters can override via `look`.
export const HOUSE_LOOKS = {
  stark: { hair: '#3a2a1e', eyes: '#6c7a86', skin: '#e8cdb4' }, tully: { hair: '#8a3a1c', eyes: '#3a6aa8', skin: '#f0d4bc' },
  lannister: { hair: '#d8b45a', eyes: '#4a8a4a', skin: '#f0d6be' }, baratheon: { hair: '#161412', eyes: '#2a4a8a', skin: '#e6c7aa' },
  baratheon_se: { hair: '#161412', eyes: '#2a4a8a', skin: '#e6c7aa' }, baratheon_ds: { hair: '#161412', eyes: '#2a4a8a', skin: '#e6c7aa' },
  targaryen: { hair: '#e8e4dc', eyes: '#6a4a9a', skin: '#f2dccb' }, martell: { hair: '#171310', eyes: '#2a1a10', skin: '#b98a62' },
  tyrell: { hair: '#6a4a2a', eyes: '#6a8a4a', skin: '#ecd0b4' }, greyjoy: { hair: '#1e1a18', eyes: '#2a2a2a', skin: '#dcc2aa' },
  arryn: { hair: '#8a6a4a', eyes: '#4a7aaa', skin: '#eed4bc' }, bolton: { hair: '#6a6258', eyes: '#c8d4dc', skin: '#efe0d4' },
  free_folk: { hair: '#8a3a1a', eyes: '#4a6a5a', skin: '#e8c8b0' }, dothraki: { hair: '#0e0c0a', eyes: '#2a1a10', skin: '#a8784e' },
  frey: { hair: '#5a4a3a', eyes: '#4a4a4a', skin: '#e6ccb4' }, umber: { hair: '#6a4a2a', eyes: '#4a6a4a', skin: '#e6c4a8' },
};
export const LOOK_OVERRIDES = {
  jon_snow: { hair: '#1a1410' }, sansa_stark: { hair: '#8a3a1c', eyes: '#3a6aa8' }, robb_stark: { hair: '#8a3a1c', eyes: '#3a6aa8' },
  bran_stark: { hair: '#6a3a1c' }, rickon_stark: { hair: '#8a3a1c' }, tyrion_lannister: { hair: '#e0cc9a', eyes: '#3a3a3a' },
  gendry: { hair: '#161412' }, joffrey_baratheon: { hair: '#d8b45a', eyes: '#4a8a4a' }, myrcella_baratheon: { hair: '#d8b45a' }, tommen_baratheon: { hair: '#d8b45a' },
  brienne_tarth: { hair: '#c8a870', eyes: '#2a5aaa' }, melisandre: { hair: '#a01a10', eyes: '#c02010' }, varys: { hair: 'bald' },
  petyr_baelish: { hair: '#2a2420', eyes: '#6a8a6a' }, ygritte: { hair: '#b0401a' }, jorah_mormont: { hair: 'bald' }, maester_aemon: { hair: '#f0f0f0' },
  khal_drogo: { hair: '#0e0c0a' }, olenna_tyrell: { hair: '#dcdcdc' }, walder_frey: { hair: '#dcdcdc' }, jeor_mormont: { hair: '#bbbbbb' },
};

// CK3-style skills: diplomacy, martial, stewardship, intrigue, learning, prowess (0-25+)
export const SKILLS = {
  eddard_stark: [10, 15, 11, 3, 8, 14], catelyn_stark: [12, 5, 10, 8, 9, 3], robb_stark: [9, 17, 7, 4, 6, 14], jon_snow: [7, 13, 6, 4, 9, 15],
  sansa_stark: [11, 2, 7, 5, 7, 1], arya_stark: [4, 7, 3, 10, 6, 6], bran_stark: [6, 2, 4, 4, 12, 2], theon_greyjoy: [6, 10, 5, 6, 5, 12],
  rodrik_cassel: [7, 14, 8, 3, 6, 13], luwin: [11, 4, 16, 6, 20, 2], vayon_poole: [8, 3, 15, 4, 8, 3], jory_cassel: [6, 11, 5, 3, 4, 13],
  roose_bolton: [9, 14, 13, 19, 10, 9], ramsay_snow: [3, 12, 5, 16, 4, 12], greatjon_umber: [6, 14, 5, 2, 3, 17], wyman_manderly: [15, 6, 17, 16, 10, 2],
  howland_reed: [8, 11, 7, 12, 14, 12], rickard_karstark: [5, 13, 7, 4, 5, 12], maege_mormont: [6, 12, 7, 5, 5, 11], barbrey_dustin: [8, 5, 11, 13, 7, 2],
  robert_baratheon: [13, 16, 3, 3, 5, 18], cersei_lannister: [10, 4, 7, 15, 6, 2], jaime_lannister: [9, 14, 5, 7, 6, 22], tyrion_lannister: [16, 9, 17, 16, 18, 3],
  tywin_lannister: [14, 18, 20, 17, 12, 8], kevan_lannister: [9, 14, 15, 7, 8, 11], petyr_baelish: [16, 3, 20, 24, 12, 3], varys: [15, 2, 12, 25, 16, 1],
  grand_maester_pycelle: [8, 2, 10, 13, 14, 1], renly_baratheon: [17, 7, 8, 9, 8, 9], stannis_baratheon: [5, 18, 12, 6, 10, 12], barristan_selmy: [9, 16, 5, 4, 7, 21],
  sandor_clegane: [2, 11, 3, 4, 3, 20], gregor_clegane: [1, 12, 2, 5, 1, 23], davos_seaworth: [12, 11, 10, 8, 6, 7], melisandre: [13, 4, 5, 18, 18, 3],
  joffrey_baratheon: [4, 5, 3, 7, 4, 5], janos_slynt: [5, 7, 6, 10, 3, 7], hoster_tully: [11, 9, 11, 10, 8, 3], edmure_tully: [9, 10, 8, 3, 6, 11],
  brynden_tully: [8, 20, 8, 7, 8, 16], walder_frey: [7, 5, 14, 17, 8, 1], tytos_blackwood: [10, 13, 9, 7, 10, 11], jason_mallister: [9, 13, 10, 5, 7, 12],
  lysa_arryn: [6, 2, 5, 11, 5, 1], yohn_royce: [11, 15, 10, 5, 8, 15], nestor_royce: [9, 8, 14, 8, 8, 8], anya_waynwood: [14, 6, 11, 11, 9, 2],
  lyn_corbray: [5, 10, 4, 10, 4, 19], mace_tyrell: [9, 8, 12, 4, 6, 7], olenna_tyrell: [18, 4, 14, 22, 15, 1], willas_tyrell: [12, 5, 14, 8, 15, 4],
  garlan_tyrell: [10, 14, 8, 6, 8, 17], loras_tyrell: [9, 10, 4, 4, 6, 18], margaery_tyrell: [19, 3, 10, 16, 11, 2], randyll_tarly: [6, 21, 11, 5, 8, 16],
  samwell_tarly: [8, 1, 10, 4, 20, 2], paxter_redwyne: [12, 14, 15, 8, 9, 8], leyton_hightower: [12, 12, 16, 10, 16, 5], doran_martell: [16, 8, 15, 21, 14, 1],
  oberyn_martell: [12, 14, 6, 16, 18, 20], arianne_martell: [14, 5, 7, 14, 8, 6], areo_hotah: [3, 12, 3, 4, 3, 19], anders_yronwood: [8, 12, 10, 10, 7, 11],
  gerold_dayne: [5, 11, 4, 14, 8, 19], balon_greyjoy: [6, 14, 7, 9, 5, 12], euron_greyjoy: [10, 17, 6, 22, 18, 17], victarion_greyjoy: [3, 16, 6, 2, 3, 18],
  asha_greyjoy: [11, 13, 8, 10, 8, 12], aeron_greyjoy: [10, 5, 3, 7, 10, 10], rodrik_harlaw: [10, 7, 14, 7, 18, 5], jeor_mormont: [10, 14, 10, 6, 9, 12],
  maester_aemon: [14, 6, 13, 9, 23, 0], alliser_thorne: [3, 12, 5, 8, 4, 14], qhorin_halfhand: [8, 17, 7, 11, 9, 17], mance_rayder: [16, 16, 8, 14, 10, 14],
  tormund: [11, 13, 5, 5, 5, 16], viserys_targaryen: [5, 4, 3, 6, 5, 4], daenerys_targaryen: [13, 6, 8, 6, 9, 2], jorah_mormont: [8, 14, 7, 9, 7, 16],
  illyrio_mopatis: [15, 4, 19, 19, 11, 1], khal_drogo: [6, 20, 3, 3, 2, 23], jon_connington: [9, 16, 9, 8, 10, 14], harry_strickland: [11, 11, 12, 7, 6, 6],
  ferrego_antaryon: [13, 6, 17, 12, 11, 2], syrio_forel: [8, 10, 5, 8, 10, 22],
};

// Derive skills for characters without explicit entries from their roles & traits
export function deriveSkills(c) {
  if (SKILLS[c.id]) return SKILLS[c.id];
  const t = (c.traits || '').toLowerCase(); const r = c.roles || [];
  let s = [7, 7, 7, 6, 6, 8];
  if (r.includes('maester')) s = [9, 2, 13, 5, 17, 2];
  if (r.includes('steward')) s = [8, 3, 14, 5, 8, 4];
  if (r.includes('master_at_arms')) s = [5, 13, 6, 3, 5, 15];
  if (r.includes('captain') || r.includes('commander')) s = [6, 13, 6, 5, 5, 13];
  if (r.includes('knight') || r.includes('kingsguard')) s[5] += 5;
  if (r.includes('spymaster')) s[3] += 8;
  if (r.includes('priest')) s[4] += 5;
  const bump = (i, n) => { s[i] = Math.max(0, s[i] + n); };
  if (/cunning|scheming|secretive|clever|shrewd/.test(t)) bump(3, 4);
  if (/charming|charismatic|jovial/.test(t)) bump(0, 4);
  if (/brave|warrior|fierce|martial|skilled/.test(t)) { bump(1, 3); bump(5, 3); }
  if (/wise|learned|bookish/.test(t)) bump(4, 4);
  if (/cruel|brutal|sadistic/.test(t)) bump(0, -3);
  if (c.age < 14) s = s.map((v) => Math.round(v * 0.45));
  return s;
}
export const SKILL_NAMES = ['Diplomacy', 'Martial', 'Stewardship', 'Intrigue', 'Learning', 'Prowess'];
export const SKILL_ICONS = ['🕊', '⚔', '🪙', '🗡', '📜', '🛡'];
