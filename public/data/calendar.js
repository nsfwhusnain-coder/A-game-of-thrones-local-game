// The realm's calendar (docs/gdd/09-living-world.md §3.2; WP D8): the days that bring septons and pilgrims onto the
// roads, the small council to its table, and the smallfolk to the harvest fires. Flavour facts only (the Meanwhile of
// the chronicle): nothing in them changes the world. `when(s)` optional — the day comes only while the world fits it.
export const CALENDAR = [
  { month: 1, day: 1, where: 'baratheon', title: 'The turning of the year', head: "King's Landing welcomes the new year", text: 'Bells ring from the Great Sept of Baelor for the turning of the year, and the smallfolk of King\'s Landing light fires in the streets.' },
  { month: 3, day: 7, where: 'baratheon', title: 'The Maiden\'s Day', head: "King's Landing honours its maidens", text: 'On the Maiden\'s Day the girls of King\'s Landing carry white flowers to the septs, and the septas lead them singing through the streets.' },
  { month: 6, day: 14, where: 'hightower', title: 'The Father\'s feast', head: "Pilgrims gather at the Hightower", text: 'The Starry Sept of Oldtown keeps the Father\'s feast; pilgrims crowd the roads of the Reach to hear the Most Devout.' },
  { month: 9, day: 20, where: 'tyrell', title: 'The harvest fires', head: "Highgarden celebrates the harvest", text: 'The harvest fires burn across the Reach, and the smallfolk dance around them until the grey of morning.', when: (s) => ['summer', 'autumn'].includes(s.world?.season || 'summer') },
  { month: 10, day: 30, where: 'stark', title: 'The old gods\' night', head: "Winterfell kneels beneath its heart tree", text: 'In the North the old families keep the long night before the first snows beneath their heart trees, and say little about it.' },
  { month: 12, day: 21, where: 'baratheon', title: 'The Stranger\'s eve', head: "King's Landing keeps its vigil", text: 'On the Stranger\'s eve the septons pray for the dead of the year, and the silent sisters walk the streets with lanterns.' },
];
// the courts that sit each moon: the small council at King's Landing on the first day (09 §3.2)
export const COURTS = [
  { day: 1, where: 'baratheon', title: 'The small council sits', head: "King's Landing hears its petitioners", text: 'The small council meets in the council chamber of the Red Keep; petitioners wait in the yard below.' },
];
