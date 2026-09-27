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
  retinue: 25, rider: 40, envoy: 30, progress: 10, caravan: 12,
  forced: 1.3,                                // a forced march's speed, at a price in stragglers and heart (07 §5)
};
export const ROAD_FACTOR = 1.12;              // roads wind: a straight line is shorter than the way walked

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
