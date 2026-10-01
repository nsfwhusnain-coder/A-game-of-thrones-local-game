// The casting of the voices (docs/gdd/14-audio.md §3; WP H1): who speaks with which voice, and how a name is said. Pure: no page, no sound, so the casting can be tested (tests/audio-map.test.js) and
// read by voice.js. Kokoro has only a handful of English voices, and the British ones (the voice of Westeros, as on the show) are its weakest, so a character's voice is a BLEND: mostly one
// British voice, coloured by a second — every character sounds like themselves. No voice is the clone of anyone's: these are the model's own voices, mixed.
// Voice grades from Kokoro's own notes: af_heart A, af_bella A-, bf_emma B-, af_nicole B-, am_fenrir/am_michael/am_puck C+, bm_george/bm_fable C, bf_isabella C, bm_lewis D+, bm_daniel/bf_alice/bf_lily D, am_adam F+.
// rate: how fast they speak (1 = normal); pitch: a slight shift (1 = none); voice: a blend.

// ── the hand-cast: the principals, each set by ear's description of the person ──
const HAND = {
  eddard_stark: { voice: 'bm_lewis*0.6+am_fenrir*0.4', rate: 0.92, pitch: 0.97 },
  catelyn_stark: { voice: 'bf_emma*0.75+af_nicole*0.25', rate: 0.96 },
  robb_stark: { voice: 'bm_daniel*0.6+am_puck*0.4', rate: 1.02 },
  jon_snow: { voice: 'bm_lewis*0.65+am_puck*0.35', rate: 0.94 },
  sansa_stark: { voice: 'bf_alice*0.6+af_bella*0.4', rate: 1.0, pitch: 1.04 },
  arya_stark: { voice: 'bf_lily*0.7+af_heart*0.3', rate: 1.1, pitch: 1.08 },
  bran_stark: { voice: 'bf_lily*0.8+af_kore*0.2', rate: 1.02, pitch: 1.1 },
  rickon_stark: { voice: 'bf_lily*0.8+af_heart*0.2', rate: 1.12, pitch: 1.14 },
  luwin: { voice: 'bm_george*0.8+bm_fable*0.2', rate: 0.9 },
  rodrik_cassel: { voice: 'bm_george*0.6+am_fenrir*0.4', rate: 0.94, pitch: 0.96 },
  jory_cassel: { voice: 'bm_daniel*0.7+am_michael*0.3', rate: 1.02 },
  vayon_poole: { voice: 'bm_fable*0.7+bm_george*0.3', rate: 0.98 },
  benjen_stark: { voice: 'bm_lewis*0.7+am_michael*0.3', rate: 0.96 },
  tywin_lannister: { voice: 'bm_george*0.8+am_fenrir*0.2', rate: 0.86, pitch: 0.95 },
  cersei_lannister: { voice: 'bf_isabella*0.7+af_bella*0.3', rate: 0.94 },
  jaime_lannister: { voice: 'bm_daniel*0.55+am_michael*0.45', rate: 1.0 },
  tyrion_lannister: { voice: 'bm_fable*0.8+am_puck*0.2', rate: 1.08 },
  kevan_lannister: { voice: 'bm_george*0.6+bm_lewis*0.4', rate: 0.94 },
  lancel_lannister: { voice: 'bm_daniel*0.7+am_puck*0.3', rate: 1.04, pitch: 1.03 },
  robert_baratheon: { voice: 'am_fenrir*0.5+bm_george*0.5', rate: 1.06, pitch: 0.94 },
  stannis_baratheon: { voice: 'bm_lewis*0.75+bm_george*0.25', rate: 0.9, pitch: 0.95 },
  renly_baratheon: { voice: 'bm_daniel*0.6+am_puck*0.4', rate: 1.06 },
  joffrey_baratheon: { voice: 'bm_daniel*0.8+am_puck*0.2', rate: 1.08, pitch: 1.05 },
  petyr_baelish: { voice: 'bm_fable*0.6+am_michael*0.4', rate: 0.98 },
  varys: { voice: 'bm_fable*0.7+bf_isabella*0.3', rate: 0.94, pitch: 1.04 },
  grand_maester_pycelle: { voice: 'bm_george*0.9+bm_lewis*0.1', rate: 0.8, pitch: 0.97 },
  barristan_selmy: { voice: 'bm_george*0.7+bm_lewis*0.3', rate: 0.92 },
  sandor_clegane: { voice: 'am_fenrir*0.6+bm_lewis*0.4', rate: 0.96, pitch: 0.9 },
  gregor_clegane: { voice: 'am_fenrir*0.7+am_onyx*0.3', rate: 0.88, pitch: 0.86 },
  olenna_tyrell: { voice: 'bf_isabella*0.8+bf_emma*0.2', rate: 0.94, pitch: 0.96 },
  margaery_tyrell: { voice: 'bf_emma*0.6+af_heart*0.4', rate: 0.98 },
  mace_tyrell: { voice: 'bm_fable*0.6+am_michael*0.4', rate: 1.06 },
  loras_tyrell: { voice: 'bm_daniel*0.6+am_michael*0.4', rate: 1.02 },
  randyll_tarly: { voice: 'bm_george*0.6+am_fenrir*0.4', rate: 0.9, pitch: 0.94 },
  samwell_tarly: { voice: 'bm_fable*0.7+am_puck*0.3', rate: 1.06, pitch: 1.03 },
  hoster_tully: { voice: 'bm_george*0.85+bm_lewis*0.15', rate: 0.82, pitch: 0.96 },
  edmure_tully: { voice: 'bm_daniel*0.7+am_puck*0.3', rate: 1.04 },
  brynden_tully: { voice: 'bm_lewis*0.6+am_fenrir*0.4', rate: 0.94 },
  lysa_arryn: { voice: 'bf_alice*0.7+bf_isabella*0.3', rate: 1.08, pitch: 1.05 },
  walder_frey: { voice: 'bm_george*0.7+bm_fable*0.3', rate: 0.9, pitch: 1.02 },
  roose_bolton: { voice: 'bm_lewis*0.8+bm_george*0.2', rate: 0.84, pitch: 0.97 },
  greatjon_umber: { voice: 'am_fenrir*0.6+bm_george*0.4', rate: 1.06, pitch: 0.9 },
  wyman_manderly: { voice: 'bm_fable*0.6+am_fenrir*0.4', rate: 0.98, pitch: 0.95 },
  maege_mormont: { voice: 'bf_isabella*0.7+af_kore*0.3', rate: 0.96, pitch: 0.95 },
  jeor_mormont: { voice: 'bm_george*0.6+am_fenrir*0.4', rate: 0.92, pitch: 0.94 },
  maester_aemon: { voice: 'bm_george*0.9+bm_fable*0.1', rate: 0.8, pitch: 0.98 },
  theon_greyjoy: { voice: 'bm_daniel*0.6+am_puck*0.4', rate: 1.06 },
  balon_greyjoy: { voice: 'bm_lewis*0.6+am_fenrir*0.4', rate: 0.88, pitch: 0.92 },
  doran_martell: { voice: 'bm_george*0.6+am_michael*0.4', rate: 0.86 },
  oberyn_martell: { voice: 'am_michael*0.55+bm_daniel*0.45', rate: 1.04 },
  daenerys_targaryen: { voice: 'bf_emma*0.6+af_heart*0.4', rate: 0.96 },
  viserys_targaryen: { voice: 'bm_fable*0.7+am_puck*0.3', rate: 1.1, pitch: 1.04 },
  khal_drogo: { voice: 'am_fenrir*0.7+am_onyx*0.3', rate: 0.88, pitch: 0.88 },
  jorah_mormont: { voice: 'bm_lewis*0.6+am_michael*0.4', rate: 0.94 },
  illyrio_mopatis: { voice: 'am_michael*0.6+bm_fable*0.4', rate: 0.94, pitch: 0.95 },
  mance_rayder: { voice: 'am_michael*0.6+bm_lewis*0.4', rate: 1.0 },
  melisandre: { voice: 'bf_isabella*0.6+af_nicole*0.4', rate: 0.9 },
  davos_seaworth: { voice: 'bm_lewis*0.7+am_puck*0.3', rate: 0.98 },
  brienne_tarth: { voice: 'bf_isabella*0.6+af_kore*0.4', rate: 0.96, pitch: 0.95 },
  janos_slynt: { voice: 'bm_fable*0.6+am_onyx*0.4', rate: 1.02 },
  yoren: { voice: 'am_fenrir*0.5+bm_lewis*0.5', rate: 0.98 },
  // the rest of the personas of data/histories.js (WP H1)
  ramsay_snow: { voice: 'bm_daniel*0.6+am_onyx*0.4', rate: 1.04 },
  rickard_karstark: { voice: 'bm_lewis*0.7+am_fenrir*0.3', rate: 0.9, pitch: 0.95 },
  smalljon_umber: { voice: 'am_fenrir*0.6+bm_daniel*0.4', rate: 1.05, pitch: 0.93 },
  galbart_glover: { voice: 'bm_lewis*0.6+bm_george*0.4', rate: 0.96 },
  howland_reed: { voice: 'bm_fable*0.6+am_michael*0.4', rate: 0.9 },
  barbrey_dustin: { voice: 'bf_isabella*0.7+af_nicole*0.3', rate: 0.94, pitch: 0.96 },
  alliser_thorne: { voice: 'bm_lewis*0.6+bm_george*0.4', rate: 0.92, pitch: 0.96 },
  qhorin_halfhand: { voice: 'bm_george*0.6+am_onyx*0.4', rate: 0.88, pitch: 0.94 },
  cotter_pyke: { voice: 'am_fenrir*0.6+bm_lewis*0.4', rate: 0.98, pitch: 0.93 },
  tormund: { voice: 'am_fenrir*0.6+am_michael*0.4', rate: 1.06, pitch: 0.92 },
  ygritte: { voice: 'bf_lily*0.5+af_kore*0.5', rate: 1.06, pitch: 0.98 },
  craster: { voice: 'bm_lewis*0.5+am_onyx*0.5', rate: 0.94, pitch: 0.94 },
  val: { voice: 'bf_isabella*0.5+af_kore*0.5', rate: 0.96, pitch: 0.97 },
  tommen_baratheon: { voice: 'bf_lily*0.6+am_puck*0.4', rate: 1.04, pitch: 1.12 },
  myrcella_baratheon: { voice: 'bf_lily*0.6+af_heart*0.4', rate: 1.0, pitch: 1.08 },
  ilyn_payne: { voice: 'bm_george*0.6+am_onyx*0.4', rate: 0.86, pitch: 0.92 },
  meryn_trant: { voice: 'bm_daniel*0.5+bm_lewis*0.5', rate: 0.98 },
  boros_blount: { voice: 'bm_fable*0.5+am_onyx*0.5', rate: 0.96 },
  gendry: { voice: 'bm_daniel*0.6+am_puck*0.4', rate: 1.0, pitch: 0.98 },
  selyse_florent: { voice: 'bf_isabella*0.7+bf_emma*0.3', rate: 0.92, pitch: 0.95 },
  cortnay_penrose: { voice: 'bm_george*0.6+bm_lewis*0.4', rate: 0.92 },
  beric_dondarrion: { voice: 'bm_daniel*0.5+am_michael*0.5', rate: 1.0 },
  addam_marbrand: { voice: 'bm_daniel*0.5+am_michael*0.5', rate: 1.0 },
  stevron_frey: { voice: 'bm_george*0.6+bm_fable*0.4', rate: 0.88 },
  black_walder_frey: { voice: 'bm_fable*0.5+am_onyx*0.5', rate: 1.0, pitch: 0.96 },
  lothar_frey: { voice: 'bm_fable*0.7+bm_lewis*0.3', rate: 0.96 },
  tytos_blackwood: { voice: 'bm_george*0.6+am_fenrir*0.4', rate: 0.92 },
  jonos_bracken: { voice: 'bm_lewis*0.6+bm_fable*0.4', rate: 0.96 },
  jason_mallister: { voice: 'bm_george*0.7+bm_fable*0.3', rate: 0.94 },
  robert_arryn: { voice: 'bf_lily*0.6+am_puck*0.4', rate: 1.1, pitch: 1.12 },
  yohn_royce: { voice: 'am_fenrir*0.5+bm_george*0.5', rate: 0.92, pitch: 0.93 },
  nestor_royce: { voice: 'bm_fable*0.6+bm_george*0.4', rate: 0.96 },
  anya_waynwood: { voice: 'bf_isabella*0.7+bf_emma*0.3', rate: 0.94, pitch: 0.98 },
  lyn_corbray: { voice: 'bm_daniel*0.6+am_michael*0.4', rate: 1.04 },
  willas_tyrell: { voice: 'bm_fable*0.6+am_michael*0.4', rate: 0.96 },
  garlan_tyrell: { voice: 'bm_daniel*0.6+am_michael*0.4', rate: 1.0 },
  leyton_hightower: { voice: 'bm_george*0.6+bm_lewis*0.4', rate: 0.88 },
  paxter_redwyne: { voice: 'bm_fable*0.6+am_michael*0.4', rate: 0.96 },
  mathis_rowan: { voice: 'bm_george*0.6+bm_fable*0.4', rate: 0.92 },
  arianne_martell: { voice: 'bf_emma*0.5+af_nicole*0.5', rate: 1.02 },
  quentyn_martell: { voice: 'bm_daniel*0.5+am_michael*0.5', rate: 0.98 },
  areo_hotah: { voice: 'am_michael*0.5+am_onyx*0.5', rate: 0.9, pitch: 0.94 },
  ellaria_sand: { voice: 'af_kore*0.6+bf_isabella*0.4', rate: 0.98 },
  obara_sand: { voice: 'af_kore*0.6+bf_isabella*0.4', rate: 1.04, pitch: 0.96 },
  anders_yronwood: { voice: 'am_michael*0.5+bm_lewis*0.5', rate: 0.98 },
  gerold_dayne: { voice: 'bm_daniel*0.5+am_michael*0.5', rate: 1.0, pitch: 0.98 },
  asha_greyjoy: { voice: 'bf_isabella*0.5+af_kore*0.5', rate: 1.04, pitch: 0.96 },
  victarion_greyjoy: { voice: 'am_fenrir*0.6+bm_lewis*0.4', rate: 0.9, pitch: 0.9 },
  aeron_greyjoy: { voice: 'bm_lewis*0.6+bm_george*0.4', rate: 0.92, pitch: 0.95 },
  euron_greyjoy: { voice: 'bm_fable*0.5+am_onyx*0.5', rate: 0.96, pitch: 0.94 },
  rodrik_harlaw: { voice: 'bm_george*0.6+bm_fable*0.4', rate: 0.88 },
  dagmer_cleftjaw: { voice: 'am_fenrir*0.6+bm_lewis*0.4', rate: 0.94, pitch: 0.92 },
  syrio_forel: { voice: 'am_michael*0.6+bm_fable*0.4', rate: 1.06 },
  jon_connington: { voice: 'bm_lewis*0.6+bm_fable*0.4', rate: 0.94 },
  harry_strickland: { voice: 'bm_george*0.5+am_michael*0.5', rate: 0.96 },
  denys_mallister: { voice: 'bm_george*0.7+bm_lewis*0.3', rate: 0.9 },
  bowen_marsh: { voice: 'bm_fable*0.6+bm_george*0.4', rate: 0.96 },
  wendel_manderly: { voice: 'bm_fable*0.5+am_fenrir*0.5', rate: 0.98, pitch: 0.96 },
  robett_glover: { voice: 'bm_lewis*0.5+bm_daniel*0.5', rate: 1.0 },
  donella_hornwood: { voice: 'bf_isabella*0.6+bf_emma*0.4', rate: 0.94 },
};

// ── cast by type: the household, the cousins and the sworn swords, each a type of person with the voice and the pace of it, set apart from their neighbours by a little of their own ──
const TYPES = {
  eldest: { voice: ['bm_george', 'bm_lewis'], rate: 0.88, pitch: 0.96 },
  lord: { voice: ['bm_george', 'bm_fable'], rate: 0.96, pitch: 0.98 },
  knight: { voice: ['bm_lewis', 'am_fenrir'], rate: 0.97, pitch: 0.95 },
  youth: { voice: ['bm_daniel', 'am_michael'], rate: 1.03, pitch: 1.0 },
  courtier: { voice: ['bm_fable', 'am_michael'], rate: 0.98, pitch: 1.0 },
  sly: { voice: ['bm_fable', 'am_onyx'], rate: 0.98, pitch: 0.96 },
  steward: { voice: ['bm_fable', 'bm_george'], rate: 0.96, pitch: 1.0 },
  maester: { voice: ['bm_george', 'bm_fable'], rate: 0.88, pitch: 0.98 },
  septon: { voice: ['bm_fable', 'bm_george'], rate: 0.92, pitch: 1.0 },
  servant: { voice: ['bm_daniel', 'bm_lewis'], rate: 1.0, pitch: 1.0 },
  brute: { voice: ['am_fenrir', 'am_onyx'], rate: 0.95, pitch: 0.9 },
  wild: { voice: ['am_fenrir', 'am_michael'], rate: 1.03, pitch: 0.94 },
  blackbrother: { voice: ['bm_lewis', 'am_michael'], rate: 0.98, pitch: 0.97 },
  boy: { voice: ['bm_daniel', 'am_puck'], rate: 1.08, pitch: 1.1 },
  girl: { voice: ['bf_lily', 'af_heart'], rate: 1.06, pitch: 1.1 },
  lady: { voice: ['bf_emma', 'bf_isabella'], rate: 0.96, pitch: 1.0 },
  matron: { voice: ['bf_isabella', 'bf_emma'], rate: 0.94, pitch: 0.97 },
  maid: { voice: ['bf_alice', 'af_heart'], rate: 1.02, pitch: 1.03 },
  warriorwoman: { voice: ['bf_isabella', 'af_kore'], rate: 1.0, pitch: 0.96 },
  dornishman: { voice: ['am_michael', 'bm_daniel'], rate: 1.0, pitch: 0.98 },
  dornishwoman: { voice: ['af_kore', 'bf_isabella'], rate: 0.98, pitch: 1.0 },
  ironborn: { voice: ['bm_lewis', 'am_fenrir'], rate: 0.92, pitch: 0.93 },
  essosman: { voice: ['am_michael', 'bm_fable'], rate: 0.96, pitch: 0.96 },
  essoswoman: { voice: ['af_aoede', 'bf_isabella'], rate: 0.98, pitch: 1.0 },
  rider: { voice: ['am_fenrir', 'am_onyx'], rate: 0.92, pitch: 0.9 },
  courtesan: { voice: ['af_nicole', 'bf_emma'], rate: 0.96, pitch: 1.02 },
};
const BY_TYPE = {
  // Winterfell and the North
  septa_mordane: 'matron', hodor: 'servant', old_nan: 'matron', mikken: 'servant', hallis_mollen: 'knight', jeyne_poole: 'maid', hullen: 'servant', harwin: 'youth', joseth: 'servant', gage: 'servant', septon_chayle: 'septon',
  lyanna_mormont: 'girl', alysane_mormont: 'warriorwoman', dacey_mormont: 'warriorwoman', gawen_glover: 'knight', marlon_manderly: 'courtier', leona_woolfield: 'matron', mors_umber: 'brute', hother_umber: 'brute', arnolf_karstark: 'eldest',
  cley_cerwyn: 'boy', benfred_tallhart: 'youth', harrion_karstark: 'youth', helman_tallhart: 'lord', medger_cerwyn: 'lord', wylis_manderly: 'courtier', meera_reed: 'warriorwoman', jojen_reed: 'boy', jory_cassel: 'knight',
  // beyond and the Wall
  mance_rayder: 'wild', styr: 'wild', rattleshirt: 'wild', harma_dogshead: 'warriorwoman', the_weeper: 'wild', varamyr_sixskins: 'wild', orell: 'wild', othell_yarwyck: 'steward', ottyn_wythers: 'eldest', thoren_smallwood: 'youth',
  jaremy_rykker: 'blackbrother', dywen: 'eldest', halder: 'boy', todder: 'boy', rast: 'blackbrother', albett: 'boy', endrew_tarth: 'blackbrother', hobb: 'servant', black_jack_bulwer: 'blackbrother', mully: 'steward',
  lark_the_sisterman: 'blackbrother', small_paul: 'brute', ulmer: 'blackbrother', will_ranger: 'blackbrother', gared: 'blackbrother', grenn: 'brute', pyp: 'boy', donal_noye: 'brute', eddison_tollett: 'blackbrother', waymar_royce: 'youth',
  // the riverlands and the Freys
  maester_vyman: 'maester', desmond_grell: 'knight', robin_ryger: 'knight', utherydes_wayn: 'steward', marq_piper: 'youth', lucas_blackwood: 'youth', emmon_frey: 'sly', hosteen_frey: 'knight', jared_frey: 'sly', edwyn_frey: 'sly',
  merrett_frey: 'sly', walder_rivers: 'sly', roslin_frey: 'maid', cleos_frey: 'courtier', ryman_frey: 'brute', genna_lannister: 'matron', shella_whent: 'matron', raymun_darry: 'lord', clement_piper: 'lord', karyl_vance: 'knight',
  // the Vale
  robar_royce: 'knight', mya_stone: 'maid', eon_hunter: 'eldest', gilwood_hunter: 'knight', symond_templeton: 'lord', horton_redfort: 'lord', maester_colemon: 'maester', vardis_egen: 'knight', shagga: 'brute', mord: 'brute',
  // the westerlands
  dorna_swyft: 'lady', willem_lannister: 'boy', martyn_lannister: 'boy', janei_lannister: 'girl', stafford_lannister: 'lord', daven_lannister: 'youth', tyrek_lannister: 'boy', joy_hill: 'girl', harys_swyft: 'lord',
  forley_prester: 'lord', flement_brax: 'lord', lyle_crakehall: 'knight', maester_creylen: 'maester', damon_marbrand: 'knight', leo_lefford: 'lord', roland_crakehall: 'knight', andros_brax: 'lord', gawen_westerling: 'lord',
  jeyne_westerling: 'maid', amory_lorch: 'sly', lancel_lannister: 'youth', bronn: 'sly',
  // the Reach
  alerie_hightower: 'matron', desmond_redwyne: 'youth', horas_redwyne: 'boy', hobber_redwyne: 'boy', talla_tarly: 'girl', melessa_tarly: 'matron', colin_florent: 'lord', imry_florent: 'knight', jon_fossoway: 'knight',
  bryan_fossoway: 'knight', dickon_tarly: 'youth', alester_florent: 'lord', axell_florent: 'sly', arwyn_oakheart: 'maid', arys_oakheart: 'knight',
  // the stormlands and the crown
  edric_storm: 'boy', barra: 'girl', balon_swann: 'knight', donnel_swann: 'youth', andrew_estermont: 'knight', guyard_morrigen: 'knight', matthos_seaworth: 'youth', salladhor_saan: 'essosman', shireen_baratheon: 'girl',
  maester_cressen: 'maester', monford_velaryon: 'courtier', selwyn_tarth: 'lord', patchface: 'servant', aron_santagar: 'knight', jacelyn_bywater: 'knight', allar_deem: 'knight', gyles_rosby: 'eldest', lollys_stokeworth: 'maid',
  falyse_stokeworth: 'lady', alayaya: 'courtesan', moon_boy: 'boy', podrick_payne: 'boy', tobho_mott: 'steward', chataya: 'courtesan', dontos_hollard: 'servant', mandon_moore: 'sly', preston_greenfield: 'knight', high_septon: 'septon',
  thoros_of_myr: 'essosman',
  // Dorne
  allyria_dayne: 'dornishwoman', tyene_sand: 'dornishwoman', trystane_martell: 'boy', maester_caleotte: 'maester', edric_dayne: 'boy',
  // across the narrow sea
  haggo: 'rider', cohollo: 'rider', aggo: 'rider', jhogo: 'rider', rakharo: 'rider', qotho: 'rider', khal_jhaqo: 'rider', khal_pono: 'rider', khal_jommo: 'rider', mirri_maz_duur: 'essoswoman', irri: 'essoswoman', jhiqui: 'essoswoman',
  doreah: 'courtesan', mero_titans_bastard: 'sly', prendahl_na_ghezn: 'sly', ferrego_antaryon: 'eldest', vargo_hoat: 'sly', maester_wendamyr: 'maester',
};

export const hash = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
function fromType(id, type) {
  const T = TYPES[type]; const h = hash(id); const w = 0.62 + ((h >>> 9) % 25) / 100; // 0.62–0.86 of the main voice, as the pools do
  const rate = Math.max(0.78, Math.min(1.14, T.rate + (((h >>> 5) % 9) - 4) * 0.008)); const pitch = Math.max(0.86, Math.min(1.16, T.pitch + (((h >>> 13) % 9) - 4) * 0.005));
  return { voice: `${T.voice[0]}*${w.toFixed(2)}+${T.voice[1]}*${(1 - w).toFixed(2)}`, rate: Math.round(rate * 100) / 100, pitch: Math.round(pitch * 100) / 100, type };
}
/** Everyone who has a casting of their own: the hand-set principals and the cast by type (a hand-set one wins). */
export const PROFILES = { ...Object.fromEntries(Object.entries(BY_TYPE).map(([id, type]) => [id, fromType(id, type)])), ...HAND };

// ── everyone else: from these pools by sex, age and homeland — British for Westeros, the rest for Essos and the free folk ──
export const POOLS = {
  m: { base: ['bm_george', 'bm_lewis', 'bm_fable', 'bm_daniel'], colour: ['am_fenrir', 'am_michael', 'am_puck', 'bm_george', 'bm_lewis'] },
  mOld: { base: ['bm_george', 'bm_lewis'], colour: ['bm_fable', 'am_fenrir'] },
  mYoung: { base: ['bm_daniel', 'bm_fable'], colour: ['am_puck', 'am_michael'] },
  f: { base: ['bf_emma', 'bf_isabella', 'bf_alice'], colour: ['af_heart', 'af_bella', 'af_nicole', 'af_kore', 'bf_emma'] },
  fYoung: { base: ['bf_lily', 'bf_alice'], colour: ['af_heart', 'af_sky', 'af_bella'] },
  mFar: { base: ['am_fenrir', 'am_michael', 'am_puck'], colour: ['bm_fable', 'am_onyx', 'bm_lewis'] },
  fFar: { base: ['af_kore', 'af_aoede', 'af_nicole'], colour: ['bf_isabella', 'af_heart'] },
};
export const VOICE_CHOICES = ['bm_george', 'bm_lewis', 'bm_fable', 'bm_daniel', 'am_fenrir', 'am_michael', 'am_puck', 'am_onyx', 'bf_emma', 'bf_isabella', 'bf_alice', 'bf_lily', 'af_heart', 'af_bella', 'af_nicole', 'af_kore', 'af_aoede', 'af_sky'];
export const isFemale = (c) => c?.gender === 'f' || c?.sex === 'f' || /\b(lady|queen|princess|septa|wife|mother|daughter|sister|spearwife)\b/i.test(`${c?.title || ''} ${(c?.roles || []).join(' ')}`);
const FAR = /essos|beyond/;

/** The voice a character speaks with (stable across sessions, whatever the machine): `region` is the region of their house; `override` a voice the player chose for them. */
export function castFor(c, region = '', override = null) {
  if (!c) return { pitch: 1, rate: 1, female: false, voice: 'bm_george', srv: 'bm_george' };
  const female = isFemale(c); const p = PROFILES[c.id] || {}; const h = hash(c.id); const age = Number(c.age) || 35;
  let voice = p.voice;
  if (!voice) {
    const pool = POOLS[FAR.test(region) ? (female ? 'fFar' : 'mFar') : female ? (age < 16 ? 'fYoung' : 'f') : age >= 60 ? 'mOld' : age < 20 ? 'mYoung' : 'm'];
    const a = pool.base[h % pool.base.length]; let b = pool.colour[(h >>> 4) % pool.colour.length]; if (b === a) b = pool.colour[((h >>> 4) + 1) % pool.colour.length];
    const w = 0.62 + ((h >>> 9) % 25) / 100; // 0.62-0.86 of the main voice
    voice = `${a}*${w.toFixed(2)}+${b}*${(1 - w).toFixed(2)}`;
  }
  if (override) voice = override;
  // unknown characters: shaped by age and sex, with a little individual colour
  const pitch = p.pitch ?? Math.max(0.9, Math.min(1.14, 1 + (age < 14 ? 0.1 : age > 60 ? -0.03 : 0) + ((h % 9) - 4) * 0.006));
  const rate = p.rate ?? Math.max(0.8, Math.min(1.12, 1 + (age > 65 ? -0.12 : age > 55 ? -0.06 : age < 18 ? 0.05 : 0) + (((h >>> 5) % 9) - 4) * 0.01));
  return { pitch, rate, female, voice, srv: voice.split(/[*+]/)[0], key: h };
}

// ── names the speech model would stumble on, respelled the way the show says them ──
export const SAY = [
  [/\bDaenerys\b/g, 'Denairis'], [/\bCersei\b/g, 'Sersee'], [/\bTyrion\b/g, 'Tirion'], [/\bAegon\b/g, 'Eegon'], [/\bTargaryens?\b/g, (m) => m.replace('Targaryen', 'Targairyen')],
  [/\bBaelish\b/g, 'Baylish'], [/\bBraavos(i)?\b/g, 'Brahvos$1'], [/\bDothraki\b/g, 'Dothrahkee'], [/\b[Kk]haleesi\b/g, 'kahleesee'], [/\bArryns?\b/g, (m) => m.replace('Arryn', 'Arrin')],
  [/\bTheon\b/g, 'Theeon'], [/\bJaime\b/g, 'Jaymee'], [/\bBrienne\b/g, 'Bree-enn'], [/\bArya\b/g, 'Ahrya'], [/\bRhaegar\b/g, 'Raygar'], [/\bAerys\b/g, 'Airis'],
  [/\bViserys\b/g, 'Vissairis'], [/\bPycelle\b/g, 'Pie-sell'], [/\bVarys\b/g, 'Vairis'], [/\bOberyn\b/g, 'Oberin'], [/\bQyburn\b/g, 'Kwyburn'], [/\bMargaery\b/g, 'Marjeree'],
  [/\bEdmure\b/g, 'Edmyoor'], [/\bBrynden\b/g, 'Brinden'], [/\bRoose\b/g, 'Rooz'], [/\bYgritte\b/g, 'Eegritt'], [/\bJeor\b/g, 'Jor'], [/\bAemon\b/g, 'Eemon'],
  [/\bCatelyn\b/g, 'Catlin'], [/\bMyrcella\b/g, 'Mersella'], [/\bLyanna\b/g, 'Lee-ahna'], [/\bRhaenys\b/g, 'Raynis'], [/\b[Mm]aester(s)?\b/g, (m) => m.replace(/aester/, 'ayster')],
  [/\bSer\b/g, 'Sir'], [/\bQarth\b/g, 'Kwarth'], [/\bAsshai\b/g, 'Ash-eye'], [/\bValyria(n)?\b/g, 'Valeeria$1'], [/\bR'hllor\b/g, 'Rulor'], [/\bIllyrio\b/g, 'Illeerio'],
  [/\bJorah\b/g, 'Jora'], [/\bWalder\b/g, 'Wallder'], [/\bEssos\b/g, 'Essoss'], [/\bMeereen\b/g, 'Mereen'], [/\bSeptas?\b/g, (m) => m], [/\bAC\b/g, 'A.C.'],
  // WP H1: the names of the new roster that a speech model says wrongly
  [/\bAeron\b/g, 'Airon'], [/\bArys\b/g, 'Aris'], [/\bByrch\b/g, 'Birch'], [/\bChataya\b/g, 'Shataia'], [/\bChayle\b/g, 'Shail'], [/\bDenys\b/g, 'Dennis'], [/\bDyre\b/g, 'Dire'], [/\bEyrie\b/g, 'Eerie'],
  [/\bFalyse\b/g, 'Falees'], [/\bGhezn\b/g, 'Gez'], [/\bGhoyan\b/g, 'Goyan'], [/\bGyles\b/g, 'Giles'], [/\bHaigh\b/g, 'Hague'], [/\bHarys\b/g, 'Harris'], [/\bIlyn\b/g, 'Illin'],
  [/\bJacelyn\b/g, 'Jasselin'], [/\bJeyne\b/g, 'Jane'], [/\bLewyn\b/g, 'Lewin'], [/\bLys\b/g, 'Leess'], [/\bMaege\b/g, 'Maije'], [/\bPetyr\b/g, 'Peter'], [/\bQorgyle\b/g, 'Korgyle'],
  [/\bQuentyn\b/g, 'Quentin'], [/\bRhaella\b/g, 'Rayella'], [/\bSelyse\b/g, 'Selleece'], [/\bStyr\b/g, 'Steer'], [/\bSyrio\b/g, 'Seerio'], [/\bTyrosh\b/g, 'Tyerosh'], [/\bVaramyr\b/g, 'Varameer'],
  [/\bWendamyr\b/g, 'Wendameer'], [/\bWyk\b/g, 'Wick'], [/\bWyl\b/g, 'Wile'], [/\bYronwood\b/g, 'Eyeronwood'], [/\bSealord\b/g, 'Seelord'],
];
export const sayable = (t) => SAY.reduce((x, [re, to]) => x.replace(re, to), String(t));
/** The tokens of names with an "ae", a "gh", a medial "y" or an apostrophe that the speech model says rightly as they are written (each reviewed: tests/audio-map.test.js holds that no new one slips by). */
export const SAY_OK = new Set([
  'Alannys', 'Alayaya', 'Allyria', 'Allyrion', 'Alysane', 'Antaryon', 'Anya', 'Arwyn', 'Blacktyde', 'Brightwater', 'Bryan', 'Bryce', 'Bywater', 'Cerwyn', 
  'Chyttering', 'Costayne', 'Creylen', 'Dayne', 'Dywen', 'Eastwatch-by-the-Sea', 'Edmyn', 'Edwyn', 'Farwynd', 'Ghost', 'Greyguard', 'Greyjoy', 'Greyshield', 
  'Greywater', 'Guyard', 'Hardyng', 'Hastwyck', 'Hayford', 'Haystack', 'High', 'Highgarden', 'Highpoint', 'Hightower', 'Holyhall', 'Honeyholt', 'Jordayne', 
  'Karyl', 'Kayce', 'Kyndall', 'Ladybright', 'Leyton', 'Light', 'Lollys', 'Lyarra', 'Lychester', 'Lydden', 'Lyle', 'Lyn', 'Lynderly', 'Lyonel', 'Lysa', 'Martyn', 
  'Merlyn', 'Merryweather', 'Mertyns', 'Meryn', 'Mya', 'Myr', 'Myre', 'Nayland', 'Night', 'Nightfort', 'Nightsong', 'Noye', 'Nymeros', 'Ottyn', 'Paege', 'Payne', 
  'Pyke', 'Pyle', 'Pypar', 'Randyll', 'Rayder', 'Raymun', 'Redwyne', 'Royce', 'Ryger', 'Rykker', 'Ryman', 'Ryswell', 'Sallydance', 'Selhorys', 'Selwyn', 'Shandystone', 
  'Skyreach', 'Slynt', 'Staedmon', 'Swyft', 'Symond', 'Therys', 'Trystane', 'Tyene', 'Tyrek', 'Tyrell', 'Tytos', 'Tywin', 'Utherydes', 'Valysar', 'Vayon', 
  'Velaryon', 'Vyman', 'Wayfarer', 'Waymar', 'Wayn', 'Waynwood', 'Westwatch-by-the-Bridge', 'Woodswatch-by-the-Pool', 'Wylde', 'Wylis', 'Wyman', 'Wynch', 
  'Wythers', 'Yarwyck', 'Yew', 'Yohn', 'Yoren',
]);
