// The holdings added by WP G3 (docs/gdd/13-content-data.md §4): the Watch's other castles, the towns and ports and the ruins the books name. Rows of EXTRA_HOLDINGS: [id, name, x, y, owner, type].
// Positions are the Lands of Ice and Fire atlas's (data-src/got-inspired-map) unless the row says "inferred" (nearest free land to where the books put the place, at least a day's ride from
// every other holding: scripts/check-data.js). Of the Watch's nineteen castles three are manned in 298 AC (Castle Black, the Shadow Tower, Eastwatch-by-the-Sea); the others stand empty,
// and are ruins on the map. Sources: A Game of Thrones–A Dance with Dragons, The World of Ice & Fire.
export const G3_HOLDINGS = [
  // ── the Wall: the castles nobody keeps (atlas) ──
  ['westwatch', 'Westwatch-by-the-Bridge', 610, 555, 'nights_watch', 'ruin'],
  ['sentinel_stand', 'Sentinel Stand', 635, 554, 'nights_watch', 'ruin'],
  ['greyguard', 'Greyguard', 649, 558, 'nights_watch', 'ruin'],
  ['stonedoor', 'Stonedoor', 662, 553, 'nights_watch', 'ruin'],
  ['hoarfrost_hill', 'Hoarfrost Hill', 671, 553, 'nights_watch', 'ruin'],
  ['icemark', 'Icemark', 682, 555, 'nights_watch', 'ruin'],
  ['nightfort', 'The Nightfort', 690, 557, 'nights_watch', 'ruin'],
  ['deep_lake', 'Deep Lake', 698, 558, 'nights_watch', 'ruin'],
  ['queensgate', 'Queensgate', 706, 560, 'nights_watch', 'ruin'],
  ['oakenshield', 'Old Oakenshield', 727, 562, 'nights_watch', 'ruin'],
  ['woodswatch', 'Woodswatch-by-the-Pool', 736, 563, 'nights_watch', 'ruin'],
  ['sable_hall', 'Sable Hall', 748, 564, 'nights_watch', 'ruin'],
  ['rimegate', 'Rimegate', 759, 565, 'nights_watch', 'ruin'],
  ['long_barrow', 'Long Barrow', 767, 566, 'nights_watch', 'ruin'],
  ['torches', 'The Torches', 776, 567, 'nights_watch', 'ruin'],
  ['greenguard', 'Greenguard', 782, 569, 'nights_watch', 'ruin'],
  // ── the North ──
  ['moles_town', 'Mole\'s Town', 718, 570, 'nights_watch', 'town'], // atlas
  ['winter_town', 'Winter Town', 540, 884, 'stark', 'town'], // inferred: below the walls of Winterfell
  // ── the riverlands and the crownlands ──
  ['fairmarket', 'Fairmarket', 563, 1449, 'tully', 'town'], // atlas
  ['stoney_sept', 'Stoney Sept', 532, 1652, 'tully', 'town'], // atlas
  ['wendish_town', 'Wendish Town', 478, 1616, 'piper', 'town'], // atlas
  ['mummers_ford', 'Mummer\'s Ford', 484, 1610, 'piper', 'town'], // atlas
  ['sallydance', 'Sallydance', 540, 1552, 'tully', 'town'], // atlas
  ['sows_horn', 'Sow\'s Horn', 717, 1641, 'baratheon', 'town'], // atlas
  ['brindlewood', 'Brindlewood', 709, 1675, 'baratheon', 'town'], // atlas
  // ── the westerlands, the Reach, Dorne ──
  ['castamere', 'Castamere', 320, 1592, 'lannister', 'ruin'], // atlas: the seat of the Reynes, a ruin
  ['tarbeck_hall', 'Tarbeck Hall', 267, 1732, 'lannister', 'ruin'], // atlas: the seat of the Tarbecks, a ruin
  ['vinetown', 'Vinetown', 221, 2265, 'redwyne', 'town'], // inferred: the Arbor's port of wine
  ['starfish_harbor', 'Starfish Harbor', 243, 2300, 'redwyne', 'town'], // inferred: the Arbor's other harbour
  ['shandystone', 'Shandystone', 860, 2209, 'santagar', 'town'], // atlas
  ['tower_of_joy', 'The Tower of Joy', 546, 2080, 'manwoody', 'ruin'], // atlas: the ruined tower of the mountains of Dorne
  // ── across the narrow sea ──
  ['selhorys', 'Selhorys', 1567, 2088, 'volantis', 'town'], // atlas
  ['valysar', 'Valysar', 1565, 2156, 'volantis', 'town'], // atlas
  ['volon_therys', 'Volon Therys', 1593, 2199, 'volantis', 'town'], // atlas
  ['sar_mell', 'Sar Mell', 1610, 2195, 'volantis', 'ruin'], // atlas
  ['ghoyan_drohe', 'Ghoyan Drohe', 1334, 1672, 'dothraki', 'ruin'], // atlas
  ['ar_noy', 'Ar Noy', 1597, 1787, 'qohor', 'ruin'], // atlas
  ['ny_sar', 'Ny Sar', 1471, 1759, 'norvos', 'ruin'], // atlas
];
