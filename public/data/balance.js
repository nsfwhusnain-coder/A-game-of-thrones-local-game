// Every tunable number of the game, in one place (docs/gdd/06-economy.md, 07-military.md, 05-gameplay-loop.md §7).
// Modules read their constants from here, so balancing is editing one file and re-running `node scripts/balance-sim.js`
// (WP C1). Sections move in as their systems are rebuilt; a number still hard-coded elsewhere is a debt, not a choice.

// ── Difficulty (05 §7): the prompt paragraph of 04 §12 and these engine multipliers ────────────────────────────────────
export const DIFFICULTY = {
  //                   vassal temper   relation drift/moon   battle odds   income   treachery   mind aggression   sincerity
  very_easy:  { label: 'Very easy',  temper: 15, drift: 2, odds: 1.25, income: 1.3, treachery: 0.4, aggression: 0.6, sincerity: 0.15 },
  easy:       { label: 'Easy',       temper: 7, drift: 1, odds: 1.1, income: 1.15, treachery: 0.7, aggression: 0.8, sincerity: 0.07 },
  normal:     { label: 'Normal',     temper: 0, drift: 0, odds: 1.0, income: 1.0, treachery: 1.0, aggression: 1.0, sincerity: 0 },
  hard:       { label: 'Hard',       temper: -7, drift: -1, odds: 0.92, income: 0.9, treachery: 1.3, aggression: 1.25, sincerity: -0.07 },
  impossible: { label: 'Impossible', temper: -15, drift: -2, odds: 0.85, income: 0.8, treachery: 1.7, aggression: 1.5, sincerity: -0.15 },
};
export const difficultyOf = (state) => DIFFICULTY[state?.meta?.settings?.difficulty] || DIFFICULTY.normal;

// ── Movement (03 §5, 07 §5): miles a day before season and road ────────────────────────────────────────────────────
export const SPEED = {
  foot: 18, horse: 32, fleet: 60,             // the current engine's classes (shared/warfare.js)
  footHost: 15, mixedHost: 18, horseHost: 30, // the party classes of 03 §5 (WP B2)
  retinue: 25, rider: 40, envoy: 30, caravan: 12,
  progress: 30,                               // the King's court keeps the canon timetable: the Twins to Winterfell, ~1,000
                                              // road miles of the atlas, in about a moon (DECISIONS D-008; 03 §5 said 10)
  forced: 1.3,                                // a forced march's speed, at a price in stragglers and heart (07 §5)
};
export const ROAD_FACTOR = 1.12;              // roads wind: a straight line is shorter than the way walked (estimates only)
// How fast a mile goes by off the road, against a mile of road (07 §5). The router (engine/movement.js) walks the roads
// where it can because of these; the season's multipliers come with the supply and weather work (WP C3).
export const TERRAIN = { road: 1, open: 0.85, forest: 0.7, hills: 0.75, mountains: 0.5, peaks: 0.35, marsh: 0.4 };

// ── The sea (07 §9; shared/sea.js) ─────────────────────────────────────────────────────────────────────────────────
export const SEA = {
  shipCarries: 100,                           // men a ship carries: between a longship's 40 and a cog's 200
  sail: { cog: 60, galley: 70, longship: 90, carrack: 55, swan: 110 }, // miles a day
  embarkDays: 1,                              // a day to go aboard and a day to come ashore, taken together
};

// ── Musters (07 §3.2): how a sworn lord answers his liege, by temper (WP C2 reads these) ───────────────────────────
export const MUSTER = {
  answer: { devoted: [95, 5, 0], dutiful: [85, 13, 2], wavering: [50, 40, 10], resentful: [20, 30, 50] }, // answered / delayed / refused, in %
  bands: { devoted: 70, dutiful: 45, wavering: 28 },
  zeal: { devoted: 1.1, dutiful: 1.0, wavering: 0.8, resentful: 0.6 },
  quick: { levies: 0.4, menAtArms: 0.6 }, full: { levies: 0.9, menAtArms: 0.8 },
  gatherDays: { north: 12, riverlands: 8, vale: 10, westerlands: 6, reach: 8, stormlands: 9, dorne: 10, crownlands: 7, iron_islands: 5 },
};

// ── The economy (06; WP C1): one model anchored in the books. `scripts/balance-sim.js` checks it against §5.2 ─────────
export const ECONOMY = {
  // §4: the people of each region (the holdings carry their domains'); the cities' own figures are fixed, and the rest of
  // a region's people are shared among its holdings by the size of their domains
  population: { north: 2000000, riverlands: 3200000, vale: 2400000, westerlands: 2600000, reach: 7500000, stormlands: 2200000, dorne: 1500000, crownlands: 1800000, iron_islands: 400000, wall: 12000, beyond: 200000 },
  cities: { baratheon: 500000, hightower: 500000, lannisport: 160000, grafton: 90000, manderly: 60000 },
  domain: { great_castle: 8, castle: 4, town: 4, city: 4, palace: 3, fortress: 1, camp: 1, ruin: 0.1 },
  // lords whose lands are wider or narrower than a castle's (the Dreadfort's, Dragonstone's rock)
  domainOf: { bolton: 7, karstark: 5, umber: 5, baratheon_ds: 2, frey: 5 },
  // how much a head yields by the land (§5.1 is the Reach's measure): the North's thin soil, the Vale's mountains,
  // the Riverlands' many lords and wars, the Stormlands' rain, the rock of the Iron Islands
  regionOutput: { north: 0.8, riverlands: 0.65, vale: 0.75, westerlands: 1, reach: 1, stormlands: 0.8, dorne: 1, crownlands: 1, iron_islands: 0.5, wall: 1, beyond: 0.3 },
  // §5.1: what a head of the smallfolk yields a moon, and the lord's share of it by his taxes
  outputPerHead: 0.25,
  rentShare: { low: 0.06, normal: 0.08, high: 0.105, crushing: 0.13 },
  season: { summer: 1, autumn: 0.9, winter: 0.55, spring: 0.8 }, winterNorth: 0.3,
  // tribute up the chain: a sworn lord's revenue × this, by the liege's rank (0.2 to a paramount; 0.1 to the Crown)
  tribute: { crown: 0.1, paramount: 0.2, major: 0.2, minor: 0.2, city_state: 0.1 },
  // §8: markets, ports, tolls and customs a moon, before the trade factor (the calibration of §5.2 lives here)
  tradeBase: {
    baratheon: 72000, hightower: 3000, lannisport: 4500, lannister: 6000, tyrell: 2000, redwyne: 2000, grafton: 3000, arryn: 2000,
    manderly: 8000, tully: 2500, frey: 1300, martell: 500, planky_town: 500, baratheon_se: 1500, stark: 2000, greyjoy: 600, velaryon: 1200,
    mooton: 400, goodbrook: 300, kenning: 300, caswell: 300, footly: 300, dustin: 200, rykker: 300, nights_watch: 300,
  },
  // §5.3: gold, silver and iron a moon; the Lannister mines are quietly running dry (a secret)
  mines: { lannister: 10000, lefford: 1200, marbrand: 400, serrett: 500, kenning: 300, greyjoy: 300, harlaw: 150 },
  mineDepletion: { lannister: 0.02 },
  // §5.2: coin at the start and the household's cost a moon, for the houses the books name; the rest by rank
  start: {
    baratheon: { coin: 20000, household: 45000 }, lannister: { coin: 500000, household: 6000 }, tyrell: { coin: 800000, household: 7000 },
    hightower: { coin: 400000, household: 2500 }, redwyne: { coin: 220000, household: 1500 }, arryn: { coin: 350000, household: 3000 },
    tully: { coin: 150000, household: 3000 }, stark: { coin: 120000, household: 2000 }, manderly: { coin: 200000, household: 1500 },
    martell: { coin: 260000, household: 2500 }, baratheon_se: { coin: 200000, household: 2500 }, baratheon_ds: { coin: 60000, household: 800 },
    greyjoy: { coin: 40000, household: 700 }, frey: { coin: 160000, household: 700 }, bolton: { coin: 45000, household: 400 },
    nights_watch: { coin: 3000, household: 600 },
  },
  household: { crown: 20000, paramount: 2500, major: 400, minor: 200, city_state: 5000, order: 300 },
  // the King's pleasures (tourneys, hunts, feasts): Robert's alone, and they die with him
  kingsPleasures: 25000,
  // §6.1–6.2: wages and campaign costs a moon, in dragons a man
  wages: { manAtArms: 0.5, guard: 0.5, knight: 2, brother: 0 }, // a sworn brother's keep is the Watch's household
  field: { levy: 0.25, manAtArmsFood: 0.15, sellswordFoot: 2, sellswordHorse: 3.5, ship: 80, shipLaidUp: 0.3, longship: 25 },
  // §7: what the Crown owes, and to whom; a house's loan is leverage: its interest is added to the debt, not paid in coin
  crownDebt: [
    { lender: 'lannister', amount: 3000000, rate: 0.06, pays: 'accrues' },
    { lender: 'tyrell', amount: 1000000, rate: 0.08, pays: 'coin' },
    { lender: 'iron_bank', amount: 1000000, rate: 0.12, pays: 'coin' },
    { lender: 'faith', amount: 700000, rate: 0.04, pays: 'coin' },
    { lender: 'tyroshi', amount: 300000, rate: 0.25, pays: 'coin' },
  ],
  // §6.3–6.4: grain, a man-moon; ransoms by who the captive is
  grainPerManMoon: 0.12,
  ransom: { heir: 50000, great: 50000, lord: 10000, minor: 2000, knight: 200, other: 100 },
  // what an ordinary loan (a shortfall borrowed to pay one's way) costs a year
  shortfallRate: 0.12,
  // §5.1: the smallfolk away with the levies do not till the fields
  labour: 0.6,
};
