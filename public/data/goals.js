// What the realm's people are working towards (docs/gdd/08-characters-politics.md §4, 09 §2; WP D6): each notable
// person's goals — the aim in a line, its kind, what it is aimed at, the verbs that are its next steps, how much it
// matters (1–3) and whether it is the story's own (`canon`). Goals are given to a person's mind as what they want, their
// house's ways try their steps when nothing presses, and a person with a great goal is weighed higher when the realm's
// minds are chosen. The agendas (data/agendas.js) are the moves the story model may narrate; these are what the engine
// knows the person wants. Everyone else who speaks for a house has goals from their house's rank and nature
// (engine/minds/goals.js).
const G = (text, kind, steps, { target = null, priority = 2, canon = false } = {}) => ({ text, kind, steps, target, priority, canon });

export const GOALS = {
  // ── the Crown and the court ──
  robert_baratheon: [G('be rid of ruling: hunt, feast and drink, and have Ned beside him again', 'pleasure', ['hold_tourney', 'hold_feast'], { priority: 2, canon: true }), G('find gold for the crown without breaking the lords', 'wealth', ['set_tax', 'borrow'], { priority: 1 })],
  cersei_lannister: [G('keep her children safe on the throne and her secret buried', 'family', ['send_person', 'appoint_office'], { priority: 3, canon: true }), G('rule, since the King will not', 'power', ['appoint_office', 'send_gift'], { priority: 2 })],
  jaime_lannister: [G('be near Cersei, and judged for more than one sword stroke', 'family', ['send_person'], { priority: 2, canon: true })],
  tyrion_lannister: [G('see the Wall, and be taken seriously for once', 'honour', ['send_person'], { priority: 1, canon: true })],
  petyr_baelish: [G('climb: chaos is a ladder', 'power', ['send_gift', 'borrow', 'bribe'], { priority: 3, canon: true }), G('Catelyn Tully, or her daughter, or the Vale', 'family', ['send_letter'], { priority: 2, canon: true })],
  varys: [G('the realm stable under the right ruler', 'power', ['gather_secrets', 'plant_spy'], { priority: 3, canon: true })],
  barristan_selmy: [G('guard the King, and keep his vows unstained', 'duty', ['send_person'], { priority: 2 })],
  janos_slynt: [G('gold, and a lordship for a butcher\'s son', 'wealth', ['send_gift'], { priority: 1 })],
  high_septon: [G('keep the Faith fed and the crown in its debt', 'faith', ['send_gift'], { priority: 1 })],
  // ── the Stormlands and Dragonstone ──
  stannis_baratheon: [G('the truth of Joffrey\'s birth known, and his own rights by law', 'crown', ['send_letter', 'raise_levies'], { priority: 3, canon: true }), G('a fleet that answers only to him', 'war', ['fund_works'], { priority: 2 })],
  melisandre: [G('Azor Ahai reborn — and Stannis is he', 'faith', ['send_person'], { priority: 3, canon: true })],
  renly_baratheon: [G('the crown, because he would wear it better than his brothers', 'crown', ['hold_feast', 'hold_tourney', 'send_gift'], { priority: 3, canon: true }), G('the Reach at his back through Loras and Margaery', 'power', ['send_gift', 'send_person'], { priority: 2 })],
  monford_velaryon: [G('keep Driftmark\'s fleet strong and his liege content', 'duty', ['fund_works', 'answer_call'], { priority: 2 })],
  davos_seaworth: [G('serve Lord Stannis honestly, and tell him the truth', 'duty', ['send_person'], { priority: 2 })],
  // ── the North ──
  eddard_stark: [G('keep his family safe from the Lannisters', 'family', ['send_person', 'raise_levies'], { priority: 3, canon: true }), G('fill the North\'s granaries before winter', 'survival', ['fund_works', 'buy_grain'], { priority: 2 })],
  catelyn_stark: [G('protect her children, wherever they are', 'family', ['send_person', 'send_letter'], { priority: 3, canon: true })],
  robb_stark: [G('prove himself a Stark worthy of Winterfell', 'honour', ['raise_levies', 'answer_call'], { priority: 2, canon: true })],
  jon_snow: [G('a place of his own, and honour on the Wall', 'honour', ['send_person'], { priority: 2, canon: true })],
  roose_bolton: [G('wait for the Starks to stumble, and profit from it', 'power', ['raise_levies', 'send_gift'], { priority: 3, canon: true })],
  ramsay_snow: [G('a trueborn name, and everything that comes with it', 'power', ['raise_levies'], { priority: 2 })],
  rickard_karstark: [G('honour for his sons and first place among the Starks\' bannermen', 'honour', ['answer_call', 'raise_levies'], { priority: 2 })],
  greatjon_umber: [G('keep the wildlings off his lands', 'war', ['raise_levies', 'hire_men'], { priority: 2 }), G('be first when the Starks call', 'duty', ['answer_call'], { priority: 2 })],
  wyman_manderly: [G('keep White Harbor rich and build the North a fleet', 'wealth', ['fund_works', 'set_tax'], { priority: 2 }), G('stand by the Starks, who took his house in', 'duty', ['answer_call', 'send_gift'], { priority: 2 })],
  maege_mormont: [G('wash out Jorah\'s shame with service', 'honour', ['answer_call'], { priority: 2 })],
  galbart_glover: [G('serve the Starks and keep Deepwood Motte safe', 'duty', ['answer_call', 'raise_levies'], { priority: 1 })],
  // ── the Wall and beyond ──
  jeor_mormont: [G('men and grain for the Wall', 'survival', ['send_person', 'buy_grain'], { priority: 3 }), G('learn what drives the free folk south', 'knowledge', ['send_person'], { priority: 2, canon: true })],
  benjen_stark: [G('find Ser Waymar Royce\'s ranging', 'duty', ['send_person'], { priority: 2, canon: true })],
  mance_rayder: [G('bring the free folk south of the Wall before the dead come', 'survival', ['raise_levies'], { priority: 3, canon: true })],
  // ── the Iron Islands ──
  balon_greyjoy: [G('a crown for the Iron Islands, and revenge for his sons', 'crown', ['fund_works', 'raise_levies', 'raid_coast'], { priority: 3, canon: true }), G('the Old Way: pay the iron price', 'war', ['raid_coast'], { priority: 2 })],
  theon_greyjoy: [G('his father\'s respect, and a place as the heir of Pyke', 'family', ['send_person'], { priority: 2, canon: true })],
  asha_greyjoy: [G('command of her own ships, and her father\'s seat after him', 'power', ['raid_coast'], { priority: 2 })],
  victarion_greyjoy: [G('the Iron Fleet at sea, and a king worth serving', 'war', ['raid_coast', 'blockade'], { priority: 2 })],
  euron_greyjoy: [G('the Seastone Chair, by any means', 'crown', ['raid_coast'], { priority: 2 })],
  rodrik_harlaw: [G('read his books, keep Harlaw, and keep the Crow\'s Eye off the chair', 'survival', ['fund_works'], { priority: 1 })],
  // ── the Riverlands ──
  hoster_tully: [G('see his children safe before he dies', 'family', ['send_letter'], { priority: 3, canon: true })],
  edmure_tully: [G('rule the Riverlands well and be taken seriously', 'honour', ['call_banners', 'send_person'], { priority: 2 }), G('hold the river lords together', 'duty', ['hold_feast', 'send_person'], { priority: 2 })],
  brynden_tully: [G('guard the Vale\'s gate for Lysa, and his family after', 'duty', ['send_person'], { priority: 1 })],
  walder_frey: [G('marriages for his get, respect, and the toll at the Twins', 'wealth', ['set_tax', 'hold_feast'], { priority: 3, canon: true }), G('pay back every slight the Tullys have given him', 'revenge', ['send_letter'], { priority: 2 })],
  tytos_blackwood: [G('keep the Brackens in their place', 'revenge', ['raise_levies'], { priority: 2 }), G('defend the Riverlands for House Tully', 'duty', ['answer_call'], { priority: 2 })],
  jonos_bracken: [G('humble the Blackwoods', 'revenge', ['raise_levies'], { priority: 2 }), G('marry his daughters well', 'family', ['send_gift'], { priority: 1 })],
  jason_mallister: [G('guard Seagard against the ironborn', 'war', ['fund_works', 'raise_levies'], { priority: 2 })],
  // ── the Vale ──
  lysa_arryn: [G('keep her son safe in the Eyrie', 'family', ['raise_levies'], { priority: 3, canon: true }), G('blame the Lannisters for her husband\'s death', 'revenge', ['send_letter'], { priority: 2, canon: true })],
  yohn_royce: [G('speak for the Vale while the Lady cannot', 'power', ['send_person', 'send_letter'], { priority: 2 })],
  anya_waynwood: [G('keep the Vale\'s lords together, and her sons alive', 'duty', ['send_person'], { priority: 1 })],
  lyonel_corbray: [G('rise with whoever holds the Vale next', 'power', ['send_gift'], { priority: 1 })],
  // ── the West ──
  tywin_lannister: [G('the House of Lannister\'s legacy: the crown in his grandson\'s hand', 'crown', ['send_gift', 'call_debt', 'raise_levies'], { priority: 3, canon: true }), G('answer every insult to the House', 'revenge', ['call_banners', 'declare_war'], { priority: 3, canon: true })],
  kevan_lannister: [G('serve his brother, and keep the family whole', 'duty', ['send_person', 'answer_call'], { priority: 2 })],
  gregor_clegane: [G('blood, and his lord\'s leave to spill it', 'war', ['raid_coast', 'march_host'], { priority: 2 })],
  damon_marbrand: [G('guard the West\'s marches for Casterly Rock', 'duty', ['answer_call', 'raise_levies'], { priority: 2 })],
  leo_lefford: [G('keep the Golden Tooth, the West\'s gate', 'duty', ['fund_works', 'raise_levies'], { priority: 2 })],
  roland_crakehall: [G('win glory for Crakehall in the Lannisters\' service', 'honour', ['answer_call', 'hold_tourney'], { priority: 1 })],
  gawen_westerling: [G('mend the Crag\'s fortunes — the mines are empty', 'wealth', ['fund_works', 'borrow'], { priority: 2 })],
  // ── the Reach ──
  mace_tyrell: [G('a royal grandson, and glory he does not have to fight for', 'crown', ['hold_feast', 'send_gift'], { priority: 3, canon: true }), G('feed the realm at a price', 'wealth', ['fund_works', 'set_tax'], { priority: 2 })],
  olenna_tyrell: [G('Margaery a queen, and the Tyrells above the fools', 'crown', ['send_letter', 'send_person'], { priority: 3, canon: true })],
  margaery_tyrell: [G('be queen — and be loved for it', 'crown', ['hold_feast'], { priority: 2, canon: true })],
  loras_tyrell: [G('win every tourney, and stand by Renly', 'honour', ['hold_tourney'], { priority: 2 })],
  leyton_hightower: [G('keep Oldtown safe and rich, and let others bleed', 'wealth', ['fund_works', 'set_tax'], { priority: 2 })],
  paxter_redwyne: [G('keep the fleet whole and the wine flowing', 'wealth', ['fund_works'], { priority: 2 }), G('keep the ironborn off the Reach\'s coasts', 'war', ['blockade', 'raise_levies'], { priority: 2 })],
  randyll_tarly: [G('win the war he is given', 'war', ['raise_levies', 'answer_call', 'march_host'], { priority: 2 }), G('make a lord of his second son', 'family', ['send_person'], { priority: 1 })],
  alester_florent: [G('rise above the Tyrells', 'power', ['send_gift', 'send_letter'], { priority: 2 }), G('stand behind Stannis if his day comes', 'crown', ['answer_call'], { priority: 2 })],
  mathis_rowan: [G('serve the Reach honestly, and be the Tyrells\' conscience', 'duty', ['answer_call'], { priority: 1 })],
  samwell_tarly: [G('be something other than a disappointment', 'honour', ['send_person'], { priority: 1 })],
  // ── Dorne ──
  doran_martell: [G('justice for Elia — in time — and Dorne safe until then', 'revenge', ['raise_levies', 'send_letter'], { priority: 3, canon: true }), G('keep Dorne out of wars it cannot win', 'survival', ['send_gift'], { priority: 2 })],
  oberyn_martell: [G('vengeance on the Mountain and on Tywin Lannister', 'revenge', ['send_person'], { priority: 3, canon: true })],
  arianne_martell: [G('her birthright, and her father\'s trust', 'power', ['send_person'], { priority: 2 })],
  edric_dayne: [G('grow up, keep Starfall, and earn a knighthood worthy of Dawn', 'honour', ['answer_call'], { priority: 1 })],
  anders_yronwood: [G('the old pride of the Yronwoods, above the Martells', 'power', ['raise_levies', 'send_gift'], { priority: 2 })],
  // ── across the narrow sea ──
  viserys_targaryen: [G('an army to take back his father\'s throne', 'crown', ['send_person', 'send_gift'], { priority: 3, canon: true })],
  daenerys_targaryen: [G('survive, and win the khalasar', 'survival', ['send_person'], { priority: 3, canon: true }), G('cross the narrow sea one day', 'crown', ['raise_levies'], { priority: 2, canon: true })],
  khal_drogo: [G('glory for his khalasar, and whatever the silver-haired woman wants', 'war', ['raise_levies', 'march_host'], { priority: 2, canon: true })],
  jorah_mormont: [G('a pardon, and to go home', 'family', ['send_letter'], { priority: 2, canon: true })],
  illyrio_mopatis: [G('a Targaryen on the Iron Throne, and his fortune with it', 'power', ['send_gift', 'send_letter'], { priority: 3 })],
  harry_strickland: [G('a paymaster who will take the Golden Company home', 'wealth', ['hire_company'], { priority: 2 })],
  vargo_hoat: [G('gold, and the side that pays more', 'wealth', ['hire_company'], { priority: 2 })],
  shagga: [G('steel, and a lord who pays in it', 'wealth', ['raise_levies'], { priority: 1 })],
  ferrego_antaryon: [G('Braavos free and every king in its debt', 'wealth', ['borrow', 'call_debt'], { priority: 2 })],
  nyessos_pentos: [G('trade, and quiet on the narrow sea', 'wealth', ['set_tax'], { priority: 1 })],
  horonno_volantis: [G('Volantis first among the Free Cities again', 'power', ['hire_company'], { priority: 1 })],
};

// Goals by rank for everyone who speaks for a house and has none of their own (engine/minds/goals.js adds their nature's).
export const RANK_GOALS = {
  crown: [G('rule, and be obeyed', 'power', ['appoint_office', 'hold_feast'])],
  paramount: [G('keep their land whole and their bannermen loyal', 'duty', ['send_gift', 'hold_feast'])],
  major: [G('stand first among their liege\'s bannermen', 'honour', ['answer_call', 'send_gift'])],
  minor: [G('survive the coming storm, and rise if they can', 'survival', ['answer_call', 'fund_works'], { priority: 1 })],
  order: [G('hold, and find men', 'duty', ['send_person'])],
  tribe: [G('feed their people through the winter', 'survival', ['raise_levies'])],
  exile: [G('go home', 'crown', ['send_person'])],
  city_state: [G('grow rich on other men\'s wars', 'wealth', ['set_tax'], { priority: 1 })],
  company: [G('find the side that pays', 'wealth', ['hire_company'], { priority: 1 })],
};
// ... and by their nature (engine/minds/houseways.js archetypes)
export const NATURE_GOALS = {
  ambitious: G('make their house greater than it was', 'power', ['fund_works', 'set_tax'], { priority: 1 }),
  martial: G('win renown in arms', 'honour', ['hold_tourney', 'hire_men'], { priority: 1 }),
  cautious: G('keep what they have', 'survival', ['raise_levies'], { priority: 1 }),
  dutiful: G('serve their liege well', 'duty', ['answer_call', 'set_dues'], { priority: 1 }),
  steady: G('see their lands prosper', 'wealth', ['fund_works'], { priority: 1 }),
};
