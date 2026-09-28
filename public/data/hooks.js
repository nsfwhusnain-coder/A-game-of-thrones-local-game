// Story hooks (docs/gdd/04-ai-system.md §7; 09 §9 point 3): when the realm's week would be thin, the Director — the
// model, or the engine alone when it is off — picks one of these, grounded in a place the world fits, and the engine
// makes it happen: a fact the chronicle tells, small effects on the place, and, in the lord's own lands, a matter that
// waits on his word. A hook never kills a named person, never touches the canon's locked threads, and never says what
// happens after 298 AC.
//
//  K(id, where, importance, type, title, text, { when, fx, matter, w, cd, tags })
//   where / when: as the happenings (public/data/happenings.js), plus  seat (the place is a house's seat) ·
//                 vassals (its house has sworn lords of its own) · heir (its lord has a living heir)
//   fx:     pro · unr (the place's prosperity / unrest ±) · rel · relf (the house with its rival / friend ±) ·
//           threat: ['free_folk' | 'others' | 'ironborn', ±]
//   matter: in the lord's own realm, a matter for his word: { title, text, options: [{ label, hint, fx }], lapse }
//           — fx in the matters' own words (shared/petitions.js): gold, food, menAtArms, rel: ['$owner', ±],
//           unrest: ['$place', ±], prosperity: ['$place', ±], loyalty: ['$lord', ±], prestige, nwMen, threat.
//           '$owner' is the place's house, '$place' the place, '$lord' its lord, '$rival' its rival house.
//   w: weight (default 1) · cd: days before it can come again anywhere (default 60) · tags: what it is about
//   text slots: those of the happenings ({place} {house} {lord} {region} {knight} {smallfolk} {goods} {sea} {rival}
//               {friend} {season} {n:a-b} …). "A || B" picks one.

const K = (id, where, imp, type, t, x, o = {}) => ({ id, where, imp, type, t, x, ...o });
const judge = (a, b) => [
  { label: a[0], hint: a[1], fx: a[2] },
  { label: b[0], hint: b[1], fx: b[2] },
];

export const HOOKS = [
  // ── knights, sellswords and service ──
  K('hedge_knight_service', 'any', 2, 'court', '{knight} seeks service at {place}', '{knight}, a hedge knight with a notched shield and a borrowed horse, has come to {place} asking a place in the household of {lord}.', {
    when: ['lord'], tags: ['knights'],
    matter: { title: 'A hedge knight asks for service', text: '{knight} kneels in your hall at {place} and offers his sword for bread, a bed and a cloak in your colours.',
      options: [{ label: 'Take him into your service', hint: 'Ten more men at arms; a little coin', fx: [{ menAtArms: 10 }, { gold: -60 }] }, { label: 'Send him on with a meal', hint: 'Nothing lost', fx: [] }, { label: 'Send him to the Wall', hint: 'The Watch is grateful for a trained sword', fx: [{ nwMen: 1 }, { prestige: 1 }] }] } }),
  K('sellsword_offer', 'r:crownlands|stormlands|riverlands|reach|westerlands|dorne|vale', 2, 'war', 'A sellsword company offers its swords', 'A free company of {n:200-600} swords has crossed from the Free Cities and camps near {place}, offering its steel to whoever pays.', {
    when: ['war'], tags: ['war', 'sellswords'], cd: 90,
    matter: { title: 'Sellswords at your gate', text: 'The captain of a free company camped near {place} offers {n:200-600} swords for a season, half the gold now.',
      options: [{ label: 'Hire them', hint: 'Men now; gold now', fx: [{ menAtArms: 300 }, { gold: -4500 }] }, { label: 'Send them away', hint: 'They may sell to another', fx: [{ unrest: ['$place', 4] }] }] } }),
  K('squire_seeks_knighthood', 'any', 2, 'court', 'A squire asks to be knighted at {place}', 'A squire of {house} who fought well in a skirmish on the marches asks {lord} to knight him before the household.', {
    when: ['lord'], tags: ['knights'],
    matter: { title: 'A squire asks for his spurs', text: 'A squire who stood his ground in a skirmish near {place} asks to be knighted before your household.',
      options: [{ label: 'Knight him in the sept', hint: 'Your household is heartened', fx: [{ prestige: 1 }, { unrest: ['$place', -3] }] }, { label: 'Tell him to wait a year', hint: 'Nothing lost', fx: [] }] } }),
  K('knight_disgraced', 'any', 2, 'court', 'A knight is disgraced at {place}', '{knight} was found to have ridden down a smallfolk family on the road to {place}; the villagers demand justice of {lord}.', {
    when: ['lord'], fx: { unr: 4 }, tags: ['justice'],
    matter: { title: 'A knight accused', text: '{knight} is accused of riding down a family on the road near {place}. The villagers are at your gate.',
      options: [{ label: 'Strip him of his spurs', hint: 'The smallfolk are satisfied; the knights mutter', fx: [{ unrest: ['$place', -6] }, { prestige: -1 }] }, { label: 'Fine him and pay the family', hint: 'A middle course', fx: [{ gold: -200 }, { unrest: ['$place', -3] }] }, { label: 'Dismiss the charge', hint: 'The villages will remember', fx: [{ unrest: ['$place', 8] }] }] } }),
  K('tourney_called', 'any', 2, 'court', '{house} calls a tourney at {place}', '{lord} has sent heralds to proclaim a tourney at {place}, with a purse of {n:500-3000} dragons for the champion.', {
    when: ['lord', 'peace', 'rich'], fx: { pro: 2, relf: 3 }, tags: ['tourney'], cd: 120 }),
  K('melee_quarrel', 'any', 2, 'court', 'A quarrel after the melee at {place}', 'Knights of {house} and {rival} came to blows after the melee at {place}; one lies abed with a broken arm and both houses cry foul.', {
    when: ['lord'], fx: { rel: -5 }, tags: ['knights', 'rivals'] }),

  // ── the Faith ──
  K('septon_preaches', 'any', 2, 'religion', 'A septon preaches against {lord}', 'A barefoot septon in the market of {place} preaches that {lord} is godless and the Seven will punish the land for it.', {
    when: ['lord', 'unrest'], fx: { unr: 4 }, tags: ['faith'],
    matter: { title: 'A septon preaches against you', text: 'A wandering septon in the market at {place} calls your rule godless, and the crowds grow each day.',
      options: [{ label: 'Endow a new sept', hint: 'Costly; the preaching stops', fx: [{ gold: -600 }, { unrest: ['$place', -8] }] }, { label: 'Have him driven out', hint: 'Quick; the faithful will not forget', fx: [{ unrest: ['$place', 6] }] }, { label: 'Let him preach', hint: 'Words are wind — until they are not', fx: [{ unrest: ['$place', 3] }] }] } }),
  K('sept_burned', 'any', 3, 'religion', 'A sept burns at {place}', 'The sept at {place} burned in the night. Some say a candle, some say a man with a grudge against {house}.', {
    when: ['unrest'], fx: { unr: 6, pro: -3 }, tags: ['faith', 'disaster'],
    matter: { title: 'The sept at {place} has burned', text: 'The sept at {place} is ash. The septon begs you to rebuild it before the people take it as an omen.',
      options: [{ label: 'Rebuild it at your cost', hint: 'Coin; the people are grateful', fx: [{ gold: -900 }, { unrest: ['$place', -8] }] }, { label: 'Let the town rebuild it', hint: 'Slow; the people grumble', fx: [{ unrest: ['$place', 4] }] }] } }),
  K('weirwood_cut', 'r:north|riverlands', 2, 'religion', 'A heart tree cut down near {place}', 'Woodsmen clearing land near {place} felled a weirwood; the northmen of the old gods call it an outrage.', {
    fx: { unr: 5 }, tags: ['faith'],
    matter: { title: 'A heart tree has been felled', text: 'Woodsmen near {place} cut down a weirwood. The old gods\' faithful demand the men be punished.',
      options: [{ label: 'Punish the woodsmen', hint: 'The faithful are satisfied', fx: [{ unrest: ['$place', -5] }] }, { label: 'Pay a weregild to the villages', hint: 'Coin', fx: [{ gold: -150 }, { unrest: ['$place', -3] }] }, { label: 'It was only a tree', hint: 'Not to them', fx: [{ unrest: ['$place', 6] }] }] } }),
  K('pilgrims_throng', 'r:reach|crownlands|westerlands|riverlands|vale|stormlands', 1, 'religion', 'Pilgrims throng the roads to {place}', 'A holy man is said to heal the sick at {place}; pilgrims crowd the roads, and the innkeepers grow fat.', {
    when: ['peace'], fx: { pro: 3 }, tags: ['faith', 'trade'] }),
  K('red_priest', 'r:crownlands|stormlands|reach|riverlands', 1, 'religion', 'A red priest preaches at {place}', 'A priest of R\'hllor in red robes preaches at {place} of a war between light and dark; the septons want him gone.', {
    when: ['town'], fx: { unr: 2 }, tags: ['faith', 'essos'] }),
  K('silent_sisters', 'any', 1, 'religion', 'The silent sisters come to {place}', 'The silent sisters have come to {place} to take the dead of a fever house for burial.', {
    when: ['cold'], tags: ['faith', 'sickness'] }),

  // ── quarrels among the lords ──
  K('mill_dispute', 'any', 2, 'court', 'A quarrel over a mill near {place}', '{house} and {rival} both claim a mill and its weir on the stream below {place}; their men have come to blows.', {
    when: ['lord'], fx: { rel: -6 }, tags: ['rivals', 'land'],
    matter: { title: 'A quarrel over a mill', text: 'Men of {house} and {rival} fight over a mill below {place}. Both appeal to you.',
      options: [{ label: 'Judge for {house}', hint: '{house} grateful, {rival} aggrieved', fx: [{ rel: ['$owner', 8] }, { rel: ['$rival', -8] }] }, { label: 'Judge for {rival}', hint: '{rival} grateful, {house} aggrieved', fx: [{ rel: ['$rival', 8] }, { rel: ['$owner', -8] }] }, { label: 'Share the mill', hint: 'Neither pleased', fx: [{ rel: ['$owner', -2] }, { rel: ['$rival', -2] }] }] } }),
  K('boundary_stone', 'any', 2, 'court', 'A boundary stone moved near {place}', 'Someone moved a boundary stone between the lands of {house} and {rival} in the night; a hundred acres changed hands by morning.', {
    when: ['lord'], fx: { rel: -5 }, tags: ['rivals', 'land'],
    matter: { title: 'A boundary stone moved', text: 'A boundary stone between {house} and {rival} was moved in the night near {place}. Both lords want your judgement.',
      options: [{ label: 'Set it back where it stood', hint: 'Just; {rival} is shamed', fx: [{ rel: ['$owner', 5] }, { rel: ['$rival', -6] }] }, { label: 'Leave it where it lies', hint: 'Quiet; {house} is aggrieved', fx: [{ rel: ['$owner', -6] }] }] } }),
  K('cattle_raid', 'r:north|riverlands|stormlands|vale|dorne', 2, 'war', 'Cattle stolen from {place}', 'Riders came by night and drove off {n:40-200} head of cattle from the pastures of {place}; the tracks lead towards the lands of {rival}.', {
    when: ['lord'], fx: { rel: -8, pro: -2 }, tags: ['rivals'] }),
  K('hostage_insult', 'any', 2, 'court', 'An insult at the high table of {place}', 'At a feast at {place} a son of {rival} mocked the lord of {house}; blades were half drawn before the maester intervened.', {
    when: ['lord'], fx: { rel: -7 }, tags: ['rivals', 'court'] }),
  K('reconciliation_feast', 'any', 2, 'court', '{house} and {friend} feast together', '{lord} feasted the lords of {friend} at {place}; old debts were forgiven and a cask of Arbor gold broached.', {
    when: ['lord', 'peace'], fx: { relf: 6 }, tags: ['court'] }),
  K('vassal_grievance', 'any', 2, 'court', 'A sworn lord airs his grievances', 'A sworn knight of {house} complains openly at {place} that {lord} favours others at court.', {
    when: ['lord', 'vassals', 'mine'], tags: ['vassals'],
    matter: { title: 'A grievance at court', text: 'A sworn knight complains at {place} that you favour others. The hall is listening.',
      options: [{ label: 'Grant him a small honour', hint: 'Coin; loyalty', fx: [{ gold: -250 }, { loyalty: ['$lord', 5] }] }, { label: 'Rebuke him', hint: 'Order kept; resentment grows', fx: [{ loyalty: ['$lord', -5] }] }] } }),

  // ── the Citadel, letters and learning ──
  K('citadel_letter', 'any', 2, 'court', 'A letter from the Citadel reaches {place}', 'The archmaesters write to {place} that a white raven may come early this year: the days are shortening faster than the tables allow.', {
    when: ['autumn'], tags: ['maesters', 'season'], cd: 180 }),
  K('maester_dies', 'any', 2, 'court', 'The maester of {place} is failing', 'The old maester of {place} is failing, and {lord} has written to Oldtown for another.', {
    when: ['lord'], tags: ['maesters'], cd: 180 }),
  K('comet_rumour', 'any', 1, 'magic', 'Strange lights over {place}', 'Smallfolk near {place} swear they saw lights in the northern sky; the maester says it is only the season.', {
    tags: ['omens'], cd: 120 }),
  K('old_map', 'any', 1, 'court', 'An old map is found at {place}', 'In the vaults of {place} a maester found a map of the realm older than the Conquest, drawn on dragonhide.', {
    tags: ['maesters'], cd: 180 }),

  // ── roads, outlaws, the broken men ──
  K('outlaws_road', 'any', 2, 'war', 'Outlaws on the road near {place}', 'A band of outlaws has taken to the road near {place}, robbing merchants and burning a waycastle stable.', {
    when: ['unrest'], fx: { unr: 5, pro: -2 }, tags: ['roads', 'outlaws'],
    matter: { title: 'Outlaws on your roads', text: 'Outlaws rob travellers near {place}; the merchants will not come without an escort.',
      options: [{ label: 'Send riders to hunt them', hint: 'A few men risked; the road is safe', fx: [{ menAtArms: -10 }, { unrest: ['$place', -10] }] }, { label: 'Offer a pardon to any who take the black', hint: 'The Watch gains; the road is quieter', fx: [{ nwMen: 8 }, { unrest: ['$place', -5] }] }, { label: 'Leave them be', hint: 'Trade suffers', fx: [{ prosperity: ['$place', -4] }] }] } }),
  K('broken_men', 'r:riverlands|crownlands|stormlands|westerlands', 2, 'war', 'Broken men haunt the woods near {place}', 'Deserters from the hosts have become broken men in the woods near {place}; the villages bar their doors at night.', {
    when: ['war'], fx: { unr: 6, pro: -3 }, tags: ['roads', 'outlaws', 'war'] }),
  K('bridge_down', 'any', 1, 'economy', 'A bridge is down near {place}', 'Spring floods took the bridge near {place}; carts wait a day at the ford, and tolls are lost.', {
    when: ['warm'], fx: { pro: -2 }, tags: ['roads'],
    matter: { title: 'The bridge near {place} is down', text: 'The bridge near {place} is gone with the floods. The ford is slow and the tolls are lost.',
      options: [{ label: 'Rebuild it in stone', hint: 'Costly; trade returns', fx: [{ gold: -700 }, { prosperity: ['$place', 4] }] }, { label: 'A timber bridge will do', hint: 'Cheap; it may go again', fx: [{ gold: -150 }, { prosperity: ['$place', 1] }] }] } }),
  K('ransom_note', 'any', 2, 'intrigue', 'A merchant held for ransom near {place}', 'Outlaws near {place} hold a cloth merchant of {house}\'s town for ransom, and ask {n:100-400} dragons.', {
    when: ['unrest'], tags: ['outlaws'],
    matter: { title: 'A merchant held for ransom', text: 'Outlaws hold a merchant of {place} and ask a ransom. The guild asks you to pay or to fight.',
      options: [{ label: 'Pay the ransom', hint: 'Coin; the guild is grateful', fx: [{ gold: -250 }, { prosperity: ['$place', 2] }] }, { label: 'Storm their camp', hint: 'Men risked', fx: [{ chance: [0.7, [{ unrest: ['$place', -6] }], [{ menAtArms: -15 }, { unrest: ['$place', 4] }]] }] }] } }),

  // ── the sea and trade ──
  K('galley_wrecked', 'any', 2, 'disaster', 'A merchant galley wrecked off {place}', 'A Pentoshi galley laden with {goods} went onto the rocks off {place}; the smallfolk are carrying off what the sea gives up.', {
    when: ['coast'], fx: { pro: 2 }, tags: ['sea', 'trade'],
    matter: { title: 'A wreck on your shore', text: 'A galley wrecked off {place}; its cargo of {goods} washes ashore. The captain\'s factor claims it all.',
      options: [{ label: 'Claim the wreck for the house', hint: 'Coin; the Free Cities complain', fx: [{ gold: 500 }] }, { label: 'Return the cargo', hint: 'An honest name among the traders', fx: [{ prestige: 1 }, { prosperity: ['$place', 2] }] }] } }),
  K('trade_fleet', 'any', 1, 'economy', 'A Braavosi trading fleet at {place}', 'Braavosi cogs have put into {place} to buy {goods}; prices are up and the town is full of sailors.', {
    when: ['coast', 'peace'], fx: { pro: 3 }, tags: ['sea', 'trade'] }),
  K('pirates_sighted', 'any', 2, 'war', 'Pirates sighted off {place}', 'Sails with no banner have been seen off {place}; the fishing fleet stays in harbour.', {
    when: ['coast'], fx: { pro: -2, unr: 2 }, tags: ['sea'] }),
  K('reavers_land', 'r:north|westerlands|reach|riverlands', 3, 'war', 'Ironborn reavers land near {place}', 'Longships came out of the mist and reavers burned a fishing village near {place}, carrying off {n:10-40} women and every scrap of iron.', {
    when: ['coast'], fx: { unr: 8, pro: -5 }, tags: ['sea', 'ironborn'],
    matter: { title: 'Reavers on your coast', text: 'Ironborn burned a village near {place} and sailed off with captives. The fisherfolk want ships and men.',
      options: [{ label: 'Garrison the coast', hint: 'Men and coin; the coast is quieter', fx: [{ gold: -600 }, { unrest: ['$place', -6] }] }, { label: 'Pay the survivors', hint: 'Coin; grief eased', fx: [{ gold: -250 }, { unrest: ['$place', -3] }] }, { label: 'Nothing can be done', hint: 'Bitterness', fx: [{ unrest: ['$place', 6] }] }] } }),
  K('guild_complaint', 'any', 1, 'economy', 'The guilds of {place} complain', 'The guild masters of {place} complain that the lord\'s tolls drive the {goods} trade to other ports.', {
    when: ['town'], tags: ['trade'],
    matter: { title: 'The guilds complain of tolls', text: 'The guilds of {place} say the tolls drive trade away.',
      options: [{ label: 'Lower the tolls', hint: 'Less coin now; more trade', fx: [{ gold: -300 }, { prosperity: ['$place', 5] }] }, { label: 'Keep them', hint: 'Coin now', fx: [{ unrest: ['$place', 3] }] }] } }),
  K('good_harvest', 'any', 1, 'economy', 'A fine harvest at {place}', 'The harvest at {place} is the best in years; the granaries are full and the smallfolk dance at the harvest feast.', {
    when: ['autumn', 'peace'], fx: { pro: 4, unr: -3 }, tags: ['harvest'] }),

  // ── sickness, weather and ruin ──
  K('fever_town', 'any', 3, 'disaster', 'A fever in {place}', 'A bloody flux has broken out in {place}; the maester has closed the gates and the dead are carted out each dawn.', {
    when: ['town'], fx: { pro: -5, unr: 5 }, tags: ['sickness'], cd: 120,
    matter: { title: 'Fever in {place}', text: 'A flux spreads in {place}. The maester asks for coin for boiled water, clean wells and the dead carts.',
      options: [{ label: 'Pay for wells and physick', hint: 'Coin; fewer dead', fx: [{ gold: -500 }, { unrest: ['$place', -5] }, { prosperity: ['$place', 3] }] }, { label: 'Close the town and wait', hint: 'Trade stops a while', fx: [{ prosperity: ['$place', -4] }] }] } }),
  K('great_storm', 'any', 2, 'disaster', 'A great storm strikes {place}', 'A storm out of {sea} tore the roofs from {place} and sank half its fishing boats.', {
    when: ['coast'], fx: { pro: -4 }, tags: ['weather'] }),
  K('early_frost', 'r:north|vale|riverlands', 2, 'disaster', 'An early frost at {place}', 'Frost came early to {place} and blackened the late crops; the smallfolk are already salting what meat they have.', {
    when: ['cold'], fx: { pro: -3 }, tags: ['weather', 'harvest'] }),
  K('mine_collapse', 'r:westerlands|vale|north', 2, 'disaster', 'A mine collapses near {place}', 'A gallery of the mine near {place} fell in; {n:10-40} miners are buried and the ore has stopped.', {
    fx: { pro: -4, unr: 3 }, tags: ['disaster'],
    matter: { title: 'The mine has fallen in', text: 'Miners are buried near {place}. The foreman asks leave and coin to dig.',
      options: [{ label: 'Dig for them', hint: 'Coin; some saved', fx: [{ gold: -300 }, { unrest: ['$place', -4] }] }, { label: 'Seal the gallery', hint: 'Grief and anger', fx: [{ unrest: ['$place', 5] }] }] } }),
  K('fire_granary', 'any', 2, 'disaster', 'The granary of {place} burns', 'Fire took the granary of {place} in the night; a moon of grain is gone.', {
    fx: { unr: 3 }, tags: ['disaster', 'harvest'],
    matter: { title: 'The granary has burned', text: 'The granary at {place} is ash. The steward reckons a moon of grain lost.',
      options: [{ label: 'Buy grain to replace it', hint: 'Coin', fx: [{ gold: -400 }] }, { label: 'Tighten belts', hint: 'Less food', fx: [{ food: -1 }] }] } }),

  // ── family, marriage and blood ──
  K('daughter_elopes', 'any', 2, 'court', 'A daughter of {house} elopes', 'A daughter of a household knight at {place} has run off with a singer; her father begs {lord} to bring her back.', {
    when: ['lord'], tags: ['family'] }),
  K('bastard_claims', 'any', 2, 'court', 'A bastard claims kinship with {house}', 'A young man in {place} claims to be a natural son of the old lord of {house}; he has a ring and a mother who swears to it.', {
    when: ['lord'], tags: ['family', 'bastards'],
    matter: { title: 'A bastard claims your blood', text: 'A young man at {place} claims to be a natural son of your house, with a ring to prove it.',
      options: [{ label: 'Acknowledge him quietly', hint: 'A sword for your house; whispers at court', fx: [{ menAtArms: 1 }, { prestige: -1 }] }, { label: 'Give him coin and send him away', hint: 'Coin', fx: [{ gold: -100 }] }, { label: 'Deny him', hint: 'He may go to your enemies', fx: [{ rel: ['$rival', -2] }] }] } }),
  K('wedding_invitation', 'any', 2, 'court', '{house} invites the realm to a wedding', '{lord} has sent ravens bidding the lords of the {region} to a wedding at {place} before the season turns.', {
    when: ['lord', 'peace'], fx: { relf: 4 }, tags: ['family', 'court'], cd: 120 }),
  K('ward_homesick', 'any', 1, 'court', 'A ward at {place} longs for home', 'A ward fostered at {place} writes home that {lord} treats him coldly; his father is not pleased.', {
    when: ['lord'], fx: { relf: -2 }, tags: ['family'] }),
  K('heir_fever', 'any', 2, 'court', 'The heir of {house} is ill', 'The heir of {house} has taken a fever at {place}; the maester sits up with the child each night.', {
    when: ['lord', 'heir'], tags: ['family', 'sickness'], cd: 180 }),
  K('match_offered', 'any', 2, 'court', 'A match is offered to {house}', '{friend} has offered a daughter to a younger son of {house}; the ravens have gone back and forth all moon.', {
    when: ['lord', 'peace'], fx: { relf: 4 }, tags: ['family', 'marriage'] }),

  // ── the Wall, the wildlings and the North beyond ──
  K('wildling_raid', 'r:north', 3, 'war', 'Wildlings raid near {place}', 'Raiders from beyond the Wall came over the ice or through the Gift and burned a steading near {place}.', {
    when: ['wildlings'], fx: { unr: 7, pro: -3 }, tags: ['wildlings', 'wall'],
    matter: { title: 'Wildlings in the Gift', text: 'Wildling raiders burned a steading near {place}. Your people ask for men.',
      options: [{ label: 'Send men to hunt them', hint: 'Men risked; the steadings are safer', fx: [{ menAtArms: -20 }, { unrest: ['$place', -8] }] }, { label: 'Send men to the Watch instead', hint: 'The Wall holds for all', fx: [{ nwMen: 20 }, { menAtArms: -20 }, { prestige: 1 }] }] } }),
  K('ranger_word', 'r:north|wall', 2, 'magic', 'A ranger\'s strange word at {place}', 'A ranger of the Watch passing through {place} speaks of empty villages beyond the Wall and of wildlings moving south in numbers.', {
    when: ['wildlings'], fx: { threat: ['free_folk', 2] }, tags: ['wall'], cd: 120 }),
  K('watch_recruiter', 'any', 1, 'court', 'A black brother recruits at {place}', 'A black brother of the Night\'s Watch has come to {place} to take men for the Wall from the lord\'s dungeons.', {
    when: ['lord'], tags: ['wall'],
    matter: { title: 'A black brother asks for men', text: 'A recruiter of the Night\'s Watch at {place} asks for the men in your cells.',
      options: [{ label: 'Give him the prisoners', hint: 'The Watch is grateful', fx: [{ nwMen: 12 }, { prestige: 1 }] }, { label: 'Give him prisoners and a purse', hint: 'Coin; honour', fx: [{ nwMen: 12 }, { gold: -100 }, { prestige: 2 }] }, { label: 'Send him away', hint: 'Nothing lost but face', fx: [] }] } }),
  K('deserter_caught', 'r:north', 2, 'court', 'A deserter of the Watch is taken near {place}', 'Men of {house} caught a man in black near {place} who fled the Wall; the law is death.', {
    when: ['lord'], tags: ['wall', 'justice'] }),

  // ── the iron islands ──
  K('kingsmoot_whispers', 'r:iron_islands', 2, 'intrigue', 'Whispers in the longhalls at {place}', 'Captains in the longhall at {place} say the old way is dying under green-land peace; some talk of reaving again.', {
    fx: { threat: ['ironborn', 2] }, tags: ['ironborn'], cd: 120 }),
  K('drowned_priest', 'r:iron_islands', 1, 'religion', 'A drowned priest preaches at {place}', 'A drowned priest with seaweed in his beard calls the captains of {place} to the old way.', {
    tags: ['ironborn', 'faith'] }),

  // ── court and intrigue ──
  K('poison_rumour', 'any', 2, 'intrigue', 'A rumour of poison at {place}', 'A servant of {house} was seen buying sweetsleep in the market of {place}; the kitchens are watched.', {
    when: ['lord'], tags: ['intrigue'] }),
  K('spy_caught', 'any', 2, 'intrigue', 'A spy is caught at {place}', 'A servant at {place} was found with letters in a cipher; under question he named men of {rival}.', {
    when: ['lord'], fx: { rel: -8 }, tags: ['intrigue', 'rivals'] }),
  K('steward_embezzles', 'any', 2, 'intrigue', 'A steward\'s accounts do not add up at {place}', 'The steward of a holdfast near {place} has been skimming the rents; the maester found it in the books.', {
    when: ['mine'], tags: ['intrigue', 'coin'],
    matter: { title: 'The accounts do not add up', text: 'The maester finds a steward near {place} has skimmed the rents for years.',
      options: [{ label: 'Hang him and seize his goods', hint: 'Coin back; a hard name', fx: [{ gold: 400 }, { unrest: ['$place', 2] }] }, { label: 'Send him to the Wall', hint: 'Some coin back', fx: [{ gold: 200 }, { nwMen: 1 }] }, { label: 'Let him repay it over years', hint: 'Mercy', fx: [{ gold: 100 }] }] } }),
  K('forged_letter', 'any', 2, 'intrigue', 'A forged letter at {place}', 'A letter bearing the seal of {lord} and demanding grain of the villages near {place} was a forgery; someone is stealing in his name.', {
    when: ['lord'], fx: { unr: 3 }, tags: ['intrigue'] }),
  K('singer_mocks', 'any', 1, 'court', 'A singer mocks {lord}', 'A singer in the taverns of {place} has a song about {lord} that the smallfolk love and the household hates.', {
    when: ['lord', 'town'], tags: ['court'] }),
  K('prisoner_escapes', 'any', 2, 'court', 'A prisoner escapes from {place}', 'A prisoner broke out of the cells of {place} with a guard\'s keys; the hounds lost the scent at the river.', {
    tags: ['justice'] }),

  // ── coin and debts ──
  K('debt_called', 'any', 2, 'economy', 'A debt is called in at {place}', 'A banker of the Iron Bank has come to {place} to remind {lord} of an old loan, courteously.', {
    when: ['lord', 'poor'], tags: ['coin'], cd: 180 }),
  K('silver_found', 'r:westerlands|vale|north|stormlands', 2, 'economy', 'A seam of silver near {place}', 'Miners near {place} have struck a seam of silver; men are coming from three valleys to dig.', {
    fx: { pro: 5 }, tags: ['coin'], cd: 240 }),
  K('coin_clipped', 'any', 1, 'economy', 'Clipped coin in the markets of {place}', 'Clipped and shaved stags are passing in the markets of {place}; the merchants weigh every coin.', {
    when: ['town'], fx: { pro: -1 }, tags: ['coin'] }),
  K('dowry_dispute', 'any', 2, 'economy', 'A dowry is disputed between {house} and {rival}', '{rival} says a dowry owed since the last wedding was never paid in full; {house} says it was paid twice.', {
    when: ['lord'], fx: { rel: -4 }, tags: ['coin', 'rivals'] }),

  // ── the smallfolk ──
  K('smallfolk_petition', 'any', 1, 'court', 'The smallfolk of {place} petition {lord}', 'The villages near {place} have sent their eldest to beg relief from a lord\'s forester who hangs poachers.', {
    when: ['lord', 'mine'], tags: ['smallfolk'],
    matter: { title: 'The smallfolk beg relief', text: 'The villages near {place} say your forester hangs poachers for a hare.',
      options: [{ label: 'Rein in the forester', hint: 'The villages bless you', fx: [{ unrest: ['$place', -6] }] }, { label: 'The law is the law', hint: 'Resentment', fx: [{ unrest: ['$place', 3] }] }] } }),
  K('rebel_hedge', 'any', 2, 'war', 'Hedge lords defy {lord} near {place}', 'Two landed knights near {place} refuse to pay their dues to {lord} until their grievances are heard.', {
    when: ['lord', 'unrest'], fx: { unr: 4 }, tags: ['vassals'] }),
  K('village_feud', 'any', 1, 'court', 'Two villages feud near {place}', 'Two villages near {place} have fought over a well for three generations; this week blood was spilled over it.', {
    fx: { unr: 2 }, tags: ['smallfolk'] }),
  K('wolf_packs', 'r:north|riverlands|vale', 1, 'disaster', 'Wolves trouble the farms near {place}', 'Wolves in packs of twenty have been taking sheep near {place}; the smallfolk will not go out after dark.', {
    when: ['cold'], fx: { pro: -1 }, tags: ['smallfolk'] }),
  K('fair_announced', 'any', 1, 'economy', 'A fair is announced at {place}', 'A fair at {place} draws merchants with {goods}, mummers and a dancing bear.', {
    when: ['peace', 'warm'], fx: { pro: 2 }, tags: ['trade'] }),

  // ── Essos, far away (only as news) ──
  K('essos_war_rumour', 'r:crownlands|reach|stormlands|dorne', 1, 'rumor', 'Word from the Free Cities at {place}', 'Sailors at {place} say the Free Cities are quarrelling again and sellswords are much in demand across the narrow sea.', {
    when: ['coast'], tags: ['essos'], cd: 120 }),
  K('dothraki_rumour', 'r:crownlands|reach|stormlands|dorne', 1, 'rumor', 'Tales of horselords at {place}', 'A Pentoshi captain in {place} tells of a great khalasar on the move beyond the Free Cities.', {
    when: ['coast'], tags: ['essos'], cd: 180 }),
  K('spice_ship', 'r:dorne|reach|crownlands', 1, 'economy', 'A spice ship reaches {place}', 'A ship from the Summer Isles with spices and green parrots has put into {place}.', {
    when: ['coast'], fx: { pro: 2 }, tags: ['trade', 'essos'] }),

  // ── war-time ──
  K('camp_fever', 'any', 2, 'war', 'Camp fever near {place}', 'Fever has broken out among the soldiers camped near {place}; men die in their tents.', {
    when: ['war'], fx: { unr: 3 }, tags: ['war', 'sickness'] }),
  K('foragers_burn', 'any', 2, 'war', 'Foragers burn farms near {place}', 'Foragers from a passing host burned the fields near {place} and took every cow and chicken.', {
    when: ['war'], fx: { pro: -5, unr: 5 }, tags: ['war'] }),
  K('refugees', 'any', 2, 'war', 'Refugees crowd {place}', 'Smallfolk fleeing the fighting crowd the gates of {place}; the town has no room and little bread.', {
    when: ['war', 'town'], fx: { unr: 5 }, tags: ['war'],
    matter: { title: 'Refugees at your gates', text: 'Smallfolk fleeing the war crowd {place}.',
      options: [{ label: 'Open the granaries', hint: 'Food; gratitude', fx: [{ food: -1 }, { unrest: ['$place', -6] }] }, { label: 'Close the gates', hint: 'Hard; order kept', fx: [{ unrest: ['$place', 4] }] }, { label: 'Send the men to the host', hint: 'Levies; bitter', fx: [{ menAtArms: 40 }, { unrest: ['$place', 3] }] }] } }),
  K('smith_orders', 'any', 1, 'war', 'The smiths of {place} work day and night', 'Every smith in {place} is making swords and spearheads for {lord}; the price of iron has doubled.', {
    when: ['war', 'town'], tags: ['war'] }),
  K('truce_feast', 'any', 2, 'court', 'A truce is sworn at a feast at {place}', 'Knights of two quarrelling houses swore a truce at a feast at {place} under the guest right of {lord}.', {
    when: ['lord', 'war'], fx: { relf: 3 }, tags: ['war', 'court'] }),

  // ── the season ──
  K('winter_stores', 'any', 1, 'economy', '{house} lays in stores at {place}', '{lord} has ordered the granaries of {place} filled against the winter; the markets are thin.', {
    when: ['autumn'], fx: { pro: -1 }, tags: ['season'] }),
  K('long_summer_drought', 'r:reach|dorne|stormlands|crownlands', 2, 'disaster', 'Drought at {place}', 'The long summer has dried the wells of {place}; the smallfolk carry water from the river in buckets.', {
    when: ['summer'], fx: { pro: -3, unr: 2 }, tags: ['season', 'weather'] }),
  K('harvest_festival', 'any', 1, 'religion', 'A harvest festival at {place}', 'The septons of {place} bless the last sheaves and the town feasts for three days.', {
    when: ['autumn', 'peace'], fx: { unr: -3 }, tags: ['season', 'faith'] }),

  // ── lords and their households ──
  K('lord_hunt', 'any', 1, 'court', '{lord} hunts in the wolfswood || {lord} rides to the hunt', '{lord} has ridden out from {place} to hunt with his household; a great boar is spoken of.', {
    when: ['lord', 'peace'], tags: ['court'] }),
  K('new_castellan', 'any', 1, 'court', 'A new castellan at {place}', '{lord} has named a new castellan to hold {place} in his absence.', {
    when: ['lord'], tags: ['court'] }),
  K('knights_quarrel_court', 'any', 2, 'court', 'Two knights of {house} quarrel', 'Two knights of the household at {place} quarrel over a lady\'s favour; one has challenged the other to a trial of arms.', {
    when: ['lord'], tags: ['knights', 'court'],
    matter: { title: 'Two of your knights would duel', text: 'Two knights of your household at {place} will fight over a lady\'s favour unless you forbid it.',
      options: [{ label: 'Forbid it', hint: 'Order; sulking', fx: [] }, { label: 'Let them fight blunted', hint: 'The hall is entertained', fx: [{ prestige: 1 }] }, { label: 'Let them fight to yield', hint: 'A knight may be lost', fx: [{ chance: [0.8, [{ prestige: 1 }], [{ menAtArms: -1 }]] }] }] } }),
  K('gift_horse', 'any', 1, 'court', '{friend} sends a gift to {place}', '{friend} has sent a Dornish sand steed as a gift to {lord} at {place}.', {
    when: ['lord'], fx: { relf: 3 }, tags: ['court'] }),
  K('old_lord_last_wish', 'any', 2, 'court', 'The old lord of {place} makes his will', 'Old {lord} has called his sons and the maester to {place} to hear his last wishes read.', {
    when: ['oldlord'], tags: ['family'], cd: 240 }),
  K('young_lord_regent', 'any', 2, 'court', 'Guardians quarrel over the young lord of {place}', 'The kin of the young lord of {place} quarrel over who shall guide him until he comes of age.', {
    when: ['younglord'], fx: { unr: 3 }, tags: ['family'] }),
];

/** The ids of every hook, for the director's schema and the tests. */
export const HOOK_IDS = HOOKS.map((h) => h.id);
