// The great strongholds and their rules (docs/gdd/07-military.md §8.1). `fort` is the walls (0–6) where the table
// raises a holding above its type's; the rest are the rules the sieges of the books turned on.
//   noStorm      no assault carries it: it is starved, betrayed, or not taken
//   needsSea     supplied by sea while the besiegers hold no ships before it: starved only by land and sea
//   mules        supplied down the high road until winter shuts it: not starved by land alone before then
//   camps        rivers on two sides: the besiegers divide into camps, and fight a relieving host at ×0.75
//   winterStores its stores last this much longer in winter (Winterfell's hot springs)
//   causeway     attacked from the south, the assault fights at ×0.4 (the Neck's causeway)
//   needsMen     too great to hold with fewer: below it the walls count as 2
export const FORTRESS = {
  arryn: { name: 'The Eyrie', fort: 6, noStorm: true, mules: true },
  baratheon_se: { name: "Storm's End", fort: 6, noStorm: true, needsSea: true },
  lannister: { name: 'Casterly Rock', fort: 6, noStorm: true },
  tully: { name: 'Riverrun', fort: 5, camps: true },
  stark: { name: 'Winterfell', fort: 5, winterStores: 1.3 },
  moat_cailin: { name: 'Moat Cailin', fort: 5, causeway: 'south' },
  whent: { name: 'Harrenhal', fort: 4, needsMen: 1500 },
  greyjoy: { name: 'Pyke', fort: 5, needsSea: true },
  frey: { name: 'The Twins', fort: 4 },
  baratheon: { name: "King's Landing", fort: 3 },
  martell: { name: 'Sunspear', fort: 4 },
  baratheon_ds: { name: 'Dragonstone', fort: 5, needsSea: true },
  tyrell: { name: 'Highgarden', fort: 4 },
  hightower: { name: 'Oldtown', fort: 3 },
};
