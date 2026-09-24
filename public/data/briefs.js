// Opening briefings: what it is like to rule this house in 298 AC.
export const BRIEFS = {
  baratheon: {
    situation: 'You sit the Iron Throne as King Robert — or rather, you rule through him. Robert hunts, drinks and ignores the realm; his Hand is dead; the treasury is empty and the crown owes six million dragons, half of it to your goodfather Tywin Lannister.',
    strengths: ['The paramounts owe you tribute and fealty', 'King\'s Landing: the richest trade city of Westeros', 'The royal fleet and the gold cloaks', 'The right to name Hands, wardens and heirs'],
    weaknesses: ['Crushing debt — the Iron Bank always collects', 'A Queen who despises the King', 'Few men of your own; your power is borrowed', 'Every great lord has a claim to grievance'],
    goals: ['Choose a new Hand', 'Find gold without breaking the lords', 'Keep the Seven Kingdoms at peace — or crush whoever breaks it'],
  },
  stark: {
    situation: 'The North is a third of the realm and holds a tenth of its people. Your bannermen are hard, proud and loyal — mostly. Summer is ending, and in the North winter kills. The King is riding north to ask you to be his Hand.',
    strengths: ['Deep loyalty among the old northern houses', 'Moat Cailin: the North is nearly impossible to invade from the south', 'Great granaries after a long summer', 'Tens of thousands of levies if the banners answer'],
    weaknesses: ['Little coin; the North trades timber and furs, not gold', 'Vast distances — a raven is fast, an army is not', 'Winter is coming, and it will cut the harvest to nothing', 'A few lords (Bolton, Dustin) nurse old grudges'],
    goals: ['Decide whether to go south as Hand', 'Protect your family from the Lannisters', 'Fill the granaries before winter', 'Keep the Wall manned'],
  },
  lannister: {
    situation: 'You are the richest house in the Seven Kingdoms. Your daughter is Queen, your son is in the Kingsguard, and the crown owes you three million dragons. The realm fears you — and whispers about your grandchildren.',
    strengths: ['Gold: the mines of Casterly Rock and the Golden Tooth', 'The crown\'s debt makes the King your debtor', 'Lannisport\'s trade and a well-drilled host', 'A family that holds the court'],
    weaknesses: ['Few friends: the Starks, Tullys and Martells hate you', 'A secret that could topple your grandson\'s claim', 'Your heir is sworn to the Kingsguard; your other son you despise', 'Western levies are fewer than the Reach\'s or the North\'s'],
    goals: ['Keep a Lannister on the Iron Throne', 'Protect the family\'s secret', 'Turn gold into loyalty'],
  },
  tully: {
    situation: 'Your lands are the rich, flat heart of Westeros, crossed by every road and river — which means every war is fought on your fields. Lord Hoster is dying; Edmure rules in his stead. Your daughters are wed to Stark and Arryn.',
    strengths: ['The fattest farmland in the realm', 'Marriage ties to the North and the Vale', 'Riverrun: nearly impregnable between two rivers', 'Many bannermen'],
    weaknesses: ['No natural defences: armies march straight in', 'Quarrelsome vassals (Blackwood vs Bracken, the treacherous Freys)', 'An ailing lord and an untested heir'],
    goals: ['Keep the Riverlands out of other men\'s wars', 'Hold the Freys to their oaths', 'Learn why Lysa has gone silent'],
  },
  arryn: {
    situation: 'Your lord husband Jon Arryn is dead and you rule the Vale as regent for a sickly six-year-old. The Vale is a fortress: the Mountains of the Moon, the Bloody Gate, the Eyrie itself.',
    strengths: ['The most defensible realm in Westeros', 'Rich valley farms and the port of Gulltown', 'Proud, well-armed knights'],
    weaknesses: ['A child lord and a regent the great Vale lords distrust', 'Mountain clans raid the high road', 'Isolation: help comes slowly, in and out'],
    goals: ['Protect your son', 'Keep Bronze Yohn Royce and the Lords Declarant in line', 'Decide whether to stay out of the coming storm'],
  },
  tyrell: {
    situation: 'The Reach is the most populous, most fertile realm in Westeros. Highgarden commands a hundred thousand swords — and yet the Tyrells were only stewards when Aegon came. Your ambitions are as large as your granaries.',
    strengths: ['The largest host in the realm', 'Food: the Reach feeds the Seven Kingdoms', 'The Redwyne fleet and the Hightower\'s wealth', 'A grandmother who sees everything'],
    weaknesses: ['Proud bannermen with older names than yours (Hightower, Florent, Tarly)', 'Old enmity with Dorne on your southern march', 'Mace is vain and easily flattered'],
    goals: ['Put a Tyrell on the throne — or beside it', 'Marry Margaery well', 'Grow strong while others bleed'],
  },
  martell: {
    situation: 'Dorne is unbowed, unbent and unbroken — and it remembers. The Lannisters murdered your sister Elia and her children, and the Baratheon king rewarded them. You have waited fifteen years. You can wait a little longer.',
    strengths: ['Desert and mountains: no one has ever conquered Dorne', 'Spearmen and sand-steeds bred for this country', 'A secret pact with the Targaryen exiles', 'Absolute primogeniture: daughters rule as sons'],
    weaknesses: ['Few people and little grain', 'Gout keeps the Prince in his chair', 'Headstrong kin (Oberyn, Arianne, the Sand Snakes) who will not wait'],
    goals: ['Vengeance on the Lannisters — at the right moment', 'Keep Dorne out of wars it cannot win', 'Decide what to do about the dragons across the sea'],
  },
  greyjoy: {
    situation: 'The ironborn are reavers who have been told to be farmers. Nine years ago you rose against Robert and lost two sons; your last son is a hostage in Winterfell. The Iron Fleet is the finest in the western seas.',
    strengths: ['Longships: strike anywhere on the western coast', 'Fearless, hard men raised to raid', 'Islands no land army can reach'],
    weaknesses: ['Poor rocky islands: little grain, little gold', 'Your heir is a hostage of the Starks', 'Every other realm hates the ironborn'],
    goals: ['Pay the iron price again', 'Recover Theon', 'Crown yourself when the mainland is weak'],
  },
  baratheon_se: {
    situation: 'You are the King\'s youngest brother, Lord of Storm\'s End and Master of Laws: charming, beloved and twenty-one. Stannis thinks Storm\'s End should have been his. The Tyrells think you should have more.',
    strengths: ['Popularity at court and in the realm', 'Storm\'s End, never taken by force', 'Tyrell friendship through Ser Loras'],
    weaknesses: ['Young and untested in war', 'Two brothers ahead of you in the succession', 'The Stormlands are poorer than the Reach'],
    goals: ['Decide how high to reach'],
  },
  baratheon_ds: {
    situation: 'You are Robert\'s brother, Master of Ships — and you know the truth: the Queen\'s children are not Robert\'s. Jon Arryn knew it too, and now he is dead. You hold Dragonstone and a fleet, and little else.',
    strengths: ['The truth of Joffrey\'s birth', 'A strong fleet with the Velaryons', 'Iron discipline and a brilliant military mind'],
    weaknesses: ['Few lands, few men, fewer friends', 'Nobody likes you', 'A red priestess whispers in your wife\'s ear'],
    goals: ['Claim what is yours by law'],
  },
  nights_watch: {
    situation: 'You hold three hundred miles of Wall with fewer than a thousand men. The wildlings are massing, rangers are disappearing, and the dead are said to walk. The kingdoms south of the Wall have forgotten why the Watch exists.',
    strengths: ['The Wall itself', 'Sworn brothers owe no one but the Watch', 'The Watch takes any man — thief, lordling or bastard'],
    weaknesses: ['No lands but the Gift; you live on charity', 'Too few men to garrison even a third of the castles', 'Many brothers are criminals who never chose the black'],
    goals: ['Recruit, beg and bargain for men and grain', 'Learn what drives the free folk south', 'Survive the winter'],
  },
  free_folk: {
    situation: 'You are Mance Rayder, a deserter of the Night\'s Watch, and you have done what no one has done in a thousand years: united the free folk. You are not marching south to conquer. You are running from what comes behind.',
    strengths: ['Tens of thousands of fighters, giants and mammoths', 'Knowledge of the lands beyond the Wall', 'People who follow you because they choose to'],
    weaknesses: ['No discipline, no armour, little food', 'Clans who hate each other', 'The Wall', 'The Others'],
    goals: ['Get your people south of the Wall before winter'],
  },
  targaryen: {
    situation: 'You are the last of the dragons, living on the charity of a Pentoshi cheesemonger. Your brother Viserys has sold you to a Dothraki khal for an army he has not been given. You have three stone eggs.',
    strengths: ['The blood of the dragon — and the loyalty it still commands in secret', 'A khal\'s love, if you can win it', 'Friends in Dorne and the shadows'],
    weaknesses: ['No land, no gold, no army of your own', 'A cruel, desperate brother', 'The Usurper\'s assassins'],
    goals: ['Survive', 'Win the khalasar', 'Cross the narrow sea one day'],
  },
  frey: {
    situation: 'You are Walder Frey, ninety-one, and you have outlived seven wives and every lord who ever mocked you. You hold the only crossing of the Green Fork for a hundred leagues, and everyone must come to you eventually.',
    strengths: ['The Twins: the crossing everyone needs', 'A hundred descendants to marry off', 'Tolls and patience'],
    weaknesses: ['No one trusts you', 'Your liege Tully looks down on you', 'Too many heirs, all waiting for you to die'],
    goals: ['Profit from every war', 'Marry your blood into the great houses'],
  },
  bolton: {
    situation: 'The Boltons flayed Starks once, long ago. Now you are the Starks\' loyal bannerman, and you speak softly. Your bastard son is a monster. Your patience is endless.',
    strengths: ['The Dreadfort, a strong castle', 'A disciplined, fearsome retinue', 'No one knows what you truly want'],
    weaknesses: ['The other northern lords distrust you', 'Your trueborn son is sickly'],
    goals: ['Wait for the Starks to stumble'],
  },
};

export function briefFor(house, state) {
  if (BRIEFS[house.id]) return BRIEFS[house.id];
  const liege = house.liege && state?.houses?.[house.liege];
  const kind = { minor: 'a minor house', major: 'a great bannerman house', city_state: 'a Free City', company: 'a sellsword company', tribe: 'a host' }[house.rank] || 'a house';
  return {
    situation: `House ${house.name} is ${kind}${liege ? ` sworn to House ${liege.name}` : ''}. Your lands are small, your voice is quiet, and every alliance matters. Great lords will call on you for men and gold when they go to war; what you give — and what you withhold — is your power.`,
    strengths: ['Your liege needs you more than you think', 'Small houses rise through marriage, service and luck'],
    weaknesses: ['Few men and little gold', 'Caught between greater houses'],
    goals: ['Survive the coming storm', 'Rise'],
  };
}
