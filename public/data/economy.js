// Economic geography of the Known World. These are *tendencies*, not fixed incomes:
// the ledger engine turns them into noisy, circumstance-dependent yields each turn,
// and the simulator (AI) can raise or ruin any of them through events.

export const RESOURCES = {
  grain: { name: 'Grain', icon: '🌾', desc: 'Feeds people and hosts. The Reach and Riverlands are the breadbaskets.' },
  gold: { name: 'Gold', icon: '🪙', desc: 'Mined in the Westerlands. Pure coin.' },
  silver: { name: 'Silver', icon: '🥈', desc: 'Silver mines and silverwork.' },
  iron: { name: 'Iron', icon: '⛏', desc: 'Arms and armour.' },
  timber: { name: 'Timber', icon: '🪵', desc: 'Ships, siege engines, castles.' },
  furs: { name: 'Furs', icon: '🦫', desc: 'Traded south and across the Narrow Sea.' },
  fish: { name: 'Fish', icon: '🐟', desc: 'Food from the sea and rivers.' },
  wine: { name: 'Wine', icon: '🍷', desc: 'Arbor gold, Dornish reds — prized everywhere.' },
  horses: { name: 'Horses', icon: '🐎', desc: 'Warhorses and sand steeds.' },
  wool: { name: 'Wool', icon: '🐑', desc: 'Cloth and trade.' },
  trade: { name: 'Trade', icon: '⚖', desc: 'Markets, ports and tolls.' },
  salt: { name: 'Salt', icon: '🧂', desc: 'Preserves food for winter.' },
  spice: { name: 'Spice & silk', icon: '🧵', desc: 'Luxuries of the east.' },
};

// Base resource profile per region (0..3 intensity)
export const REGION_PROFILE = {
  north: { grain: 0.6, timber: 1.6, furs: 1.4, fish: 0.8, wool: 0.6, silver: 0.2 },
  wall: { timber: 0.8, furs: 0.4 },
  beyond: { furs: 0.8, timber: 0.6 },
  iron_islands: { iron: 1.4, fish: 1.2, salt: 0.6 },
  riverlands: { grain: 1.6, fish: 1.0, wool: 0.7, horses: 0.4, trade: 0.6 },
  vale: { grain: 1.0, horses: 0.8, wool: 0.6, stone: 0.5, trade: 0.4 },
  westerlands: { gold: 1.2, silver: 0.8, iron: 0.6, grain: 0.6, trade: 0.5 },
  crownlands: { grain: 0.8, fish: 0.8, trade: 1.2 },
  reach: { grain: 2.2, wine: 1.0, wool: 1.0, horses: 0.6, trade: 0.8 },
  stormlands: { timber: 1.2, grain: 0.6, fish: 0.6 },
  dorne: { horses: 1.2, wine: 0.8, spice: 0.4, salt: 0.5, grain: 0.3 },
  essos: { trade: 2.2, spice: 1.0, wine: 0.4, fish: 0.6 },
};

// Per-holding overrides (added on top of region profile)
export const HOLDING_RESOURCES = {
  lannister: { gold: 3.5, trade: 0.8 }, lefford: { gold: 2.2 }, marbrand: { silver: 1.0 }, westerling: { gold: 0.2 },
  lannisport: { trade: 2.5, fish: 1.0 }, kenning: { gold: 0.8 }, serrett: { silver: 1.5 }, crakehall: { timber: 0.6 },
  baratheon: { trade: 3.0, fish: 0.8 }, hightower: { trade: 3.0, wine: 0.6 }, redwyne: { wine: 3.5, trade: 1.0 },
  tyrell: { grain: 1.5, wine: 0.6 }, manderly: { trade: 2.0, fish: 1.4, salt: 0.4 }, grafton: { trade: 2.0 },
  frey: { trade: 1.2 }, goodbrook: { salt: 1.8, trade: 0.6 }, mooton: { fish: 1.0, trade: 0.6 }, rykker: { trade: 0.8 },
  velaryon: { trade: 1.5, fish: 0.8 }, baratheon_ds: { iron: 0.2 }, arryn: { stone: 0.4 }, royce: { stone: 0.6 },
  martell: { trade: 1.4, spice: 0.6 }, dayne: { wine: 0.8 }, yronwood: { iron: 0.4 }, harlaw: { iron: 0.6 },
  greyjoy: { iron: 1.0 }, stark: { timber: 0.8, furs: 0.6 }, bolton: { furs: 0.6 }, karstark: { furs: 0.6 },
  braavos: { trade: 6.0 }, pentos: { trade: 3.5 }, myr: { trade: 3.0 }, lys: { trade: 3.5, spice: 1.0 }, tyrosh: { trade: 3.0 },
  volantis: { trade: 5.0 }, qohor: { trade: 2.0, iron: 1.5 }, norvos: { trade: 1.5 }, lorath: { fish: 1.5, trade: 1.0 },
  mallister: { fish: 0.6 }, nights_watch: { grain: 0.9, trade: 0.4 }, shadow_tower: { grain: 0.3 }, eastwatch: { fish: 1.0, trade: 0.5 }, tully: { grain: 0.6, fish: 0.6 }, rowan: { grain: 1.0 }, oakheart: { timber: 0.8 },
  tarly: { horses: 0.6 }, florent: { grain: 0.6 }, crane: { fish: 0.6 }, caswell: { trade: 0.8 }, footly: { trade: 0.6 },
  baratheon_se: { timber: 0.6 }, tarth: { fish: 0.4 }, connington: { fish: 0.4 }, planky_town: { trade: 1.2 },
};

// Smallfolk living under each holding (estimates). Type/rank defaults, then overrides.
export const POPULATION_DEFAULTS = { city: 90000, great_castle: 60000, castle: 14000, fortress: 3000, town: 20000, palace: 8000, camp: 5000, ruin: 500 };
export const POPULATION = {
  baratheon: 500000, hightower: 250000, lannisport: 160000, manderly: 70000, grafton: 60000, lannister: 90000, tyrell: 120000,
  stark: 70000, tully: 70000, arryn: 50000, martell: 60000, greyjoy: 18000, baratheon_se: 45000, braavos: 400000,
  volantis: 600000, pentos: 250000, myr: 200000, lys: 200000, tyrosh: 150000, qohor: 200000, norvos: 150000, lorath: 60000,
  free_folk: 100000, dothraki: 90000, nights_watch: 2000, frey: 30000, bolton: 25000, redwyne: 50000, velaryon: 20000,
  golden_company_camp: 12000,
};

// How much of a lord's income typically goes up the chain to their liege (share of vassal revenue), by liege rank
export const TRIBUTE_SHARE = { crown: 0.12, paramount: 0.25, major: 0.2, minor: 0.2, city_state: 0.1, order: 0, tribe: 0, exile: 0, company: 0 };

export const TAX_LEVELS = {
  low: { label: 'Low', income: 0.75, unrest: -1.5, opinion: 4, desc: 'Lords and smallfolk are grateful. Coffers suffer.' },
  normal: { label: 'Customary', income: 1.0, unrest: 0, opinion: 0, desc: 'The old customs.' },
  high: { label: 'Heavy', income: 1.3, unrest: 2.5, opinion: -6, desc: 'More gold, grumbling in the halls.' },
  crushing: { label: 'Crushing', income: 1.6, unrest: 6, opinion: -15, desc: 'Squeeze every penny. Expect defiance and revolt.' },
};

// Yield of one unit of resource intensity per 10,000 people per moon (gold dragons equivalent)
export const RESOURCE_VALUE = { grain: 90, gold: 1400, silver: 600, iron: 300, timber: 160, furs: 200, fish: 90, wine: 380, horses: 220, wool: 160, trade: 520, salt: 180, spice: 600, stone: 80 };
