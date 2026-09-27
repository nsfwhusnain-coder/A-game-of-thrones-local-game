// What people call one another in 298 AC (docs/gdd/04-ai-system.md §3.1 rule 5): the short forms and bynames a player
// or a model may use for a character, mapped to the character's id. Only names already in use at the start of the
// scenario — never a name the future gives them (no "Young Wolf", no "Reek", no "Lord Commander Snow").
// Place names live with the places (data/houses.js PLACE_ALIASES, holding names, the atlas's named places). Names of an
// office ("the King", "the Hand") are not here: they follow whoever holds it (engine/ids.js).
export const PERSON_ALIASES = {
  ned: 'eddard_stark', lord_eddard: 'eddard_stark', lord_stark: 'eddard_stark',
  lady_catelyn: 'catelyn_stark', cat: 'catelyn_stark', robb: 'robb_stark', bran: 'bran_stark', rickon: 'rickon_stark',
  sansa: 'sansa_stark', arya: 'arya_stark', jon: 'jon_snow', the_bastard_of_winterfell: 'jon_snow', theon: 'theon_greyjoy',
  ser_rodrik: 'rodrik_cassel', maester_luwin: 'luwin', benjen: 'benjen_stark',
  greatjon: 'greatjon_umber', the_greatjon: 'greatjon_umber', smalljon: 'smalljon_umber', the_smalljon: 'smalljon_umber',
  lord_bolton: 'roose_bolton', roose: 'roose_bolton', lord_manderly: 'wyman_manderly', lord_wyman: 'wyman_manderly',
  lord_karstark: 'rickard_karstark', lady_mormont: 'maege_mormont', lady_maege: 'maege_mormont', lady_dustin: 'barbrey_dustin',
  the_old_bear: 'jeor_mormont', lord_mormont: 'jeor_mormont', halfhand: 'qhorin_halfhand', the_halfhand: 'qhorin_halfhand',
  king_robert: 'robert_baratheon', queen_cersei: 'cersei_lannister',
  joffrey: 'joffrey_baratheon', prince_joffrey: 'joffrey_baratheon', tommen: 'tommen_baratheon', myrcella: 'myrcella_baratheon',
  the_kingslayer: 'jaime_lannister', kingslayer: 'jaime_lannister', jaime: 'jaime_lannister', ser_jaime: 'jaime_lannister',
  the_imp: 'tyrion_lannister', imp: 'tyrion_lannister', tyrion: 'tyrion_lannister', lord_tywin: 'tywin_lannister', tywin: 'tywin_lannister', ser_kevan: 'kevan_lannister',
  littlefinger: 'petyr_baelish', lord_baelish: 'petyr_baelish', the_spider: 'varys', lord_varys: 'varys', pycelle: 'grand_maester_pycelle',
  the_hound: 'sandor_clegane', hound: 'sandor_clegane', the_mountain: 'gregor_clegane', ser_gregor: 'gregor_clegane', ser_barristan: 'barristan_selmy', barristan_the_bold: 'barristan_selmy',
  lord_stannis: 'stannis_baratheon', stannis: 'stannis_baratheon', lord_renly: 'renly_baratheon', renly: 'renly_baratheon', the_onion_knight: 'davos_seaworth', ser_davos: 'davos_seaworth',
  the_red_woman: 'melisandre', the_evenstar: 'selwyn_tarth', lord_walder: 'walder_frey', the_late_lord_frey: 'walder_frey',
  lord_hoster: 'hoster_tully', edmure: 'edmure_tully', the_blackfish: 'brynden_tully', blackfish: 'brynden_tully', ser_brynden: 'brynden_tully',
  lady_lysa: 'lysa_arryn', lysa: 'lysa_arryn', bronze_yohn: 'yohn_royce', lord_royce: 'yohn_royce',
  lord_mace: 'mace_tyrell', the_queen_of_thorns: 'olenna_tyrell', lady_olenna: 'olenna_tyrell', the_knight_of_flowers: 'loras_tyrell', ser_loras: 'loras_tyrell', margaery: 'margaery_tyrell',
  lord_tarly: 'randyll_tarly', prince_doran: 'doran_martell', the_red_viper: 'oberyn_martell', prince_oberyn: 'oberyn_martell',
  lord_balon: 'balon_greyjoy', the_crows_eye: 'euron_greyjoy', the_damphair: 'aeron_greyjoy', the_reader: 'rodrik_harlaw', darkstar: 'gerold_dayne',
  the_beggar_king: 'viserys_targaryen', viserys: 'viserys_targaryen', daenerys: 'daenerys_targaryen', dany: 'daenerys_targaryen', magister_illyrio: 'illyrio_mopatis',
  ser_jorah: 'jorah_mormont', drogo: 'khal_drogo', the_king_beyond_the_wall: 'mance_rayder', mance: 'mance_rayder',
};
