// Hand-authored geography of the Known World (Westeros + western Essos).
// World units: x 0..WORLD.w, y 0..WORLD.h. North is up.
// Coastlines are coarse control points; the terrain generator smooths them and
// applies fractal domain-warping so they render as natural, detailed shores.

export const WORLD = { w: 1600, h: 2100 };

// ---------- Landmasses (closed polygons) ----------
export const LANDMASSES = [
  {
    id: 'westeros',
    points: [
      [150, -20], [170, 90], [140, 160], [190, 230], [232, 300], [268, 345],
      [290, 405], [268, 468], [226, 505], [182, 522], [148, 560], [108, 602],
      [150, 640], [205, 652], [196, 700], [160, 760], [128, 805], [186, 832],
      [238, 862], [218, 905], [292, 902], [335, 932], [368, 962], [352, 1002],
      [326, 1044], [292, 1090], [262, 1128], [220, 1150], [180, 1172], [150, 1212],
      [122, 1262], [140, 1300], [162, 1330], [150, 1380], [138, 1422], [128, 1470],
      [150, 1520], [140, 1570], [158, 1620], [170, 1680], [182, 1718], [228, 1736],
      [206, 1770], [192, 1805], [232, 1834], [300, 1858], [382, 1866], [424, 1882],
      [482, 1920], [560, 1950], [640, 1962], [718, 1948], [780, 1930], [842, 1912],
      [892, 1880], [922, 1840], [912, 1792], [944, 1742], [902, 1726], [852, 1736],
      [792, 1731], [742, 1716], [702, 1702], [732, 1686], [792, 1680], [852, 1670],
      [882, 1640], [902, 1600], [872, 1562], [832, 1548], [862, 1512], [882, 1472],
      [842, 1440], [802, 1422], [762, 1412], [722, 1392], [682, 1377], [682, 1342],
      [722, 1322], [752, 1292], [722, 1268], [742, 1232], [792, 1202], [762, 1172],
      [722, 1177], [682, 1172], [648, 1162], [620, 1150], [642, 1120], [692, 1110],
      [742, 1104], [782, 1100], [832, 1070], [862, 1030], [852, 980], [822, 952],
      [802, 922], [842, 902], [792, 890], [762, 902], [722, 907], [672, 892],
      [622, 907], [578, 932], [560, 900], [570, 860], [578, 835], [602, 810],
      [652, 800], [702, 780], [762, 760], [792, 720], [762, 680], [782, 620],
      [798, 560], [792, 500], [782, 440], [762, 382], [732, 342], [742, 282],
      [792, 232], [822, 160], [862, 80], [900, -20],
    ],
  },
  {
    id: 'essos',
    points: [
      [1100, -20], [1082, 200], [1112, 400], [1062, 550], [1052, 700], [1092, 800],
      [1070, 860], [1060, 950], [1032, 1080], [1042, 1200], [1030, 1330], [1062, 1420],
      [1102, 1480], [1082, 1530], [1122, 1580], [1092, 1620], [1072, 1690], [1142, 1722],
      [1202, 1762], [1262, 1832], [1302, 1900], [1402, 1942], [1482, 1962], [1620, 1985],
      [1620, -20],
    ],
  },
];

// Islands: [x, y, rx, ry, rotationRadians, name]
export const ISLANDS = [
  [226, 430, 22, 16, 0.3, 'Bear Island'],
  [842, 420, 26, 44, 0.2, 'Skagos'],
  [822, 360, 10, 8, 0, 'Skane'],
  [175, 1012, 26, 20, 0.4, 'Great Wyk'],
  [218, 975, 12, 10, 0, 'Old Wyk'],
  [210, 1066, 13, 10, 0.3, 'Pyke'],
  [252, 1014, 15, 11, 0.5, 'Harlaw'],
  [150, 1080, 11, 8, 0, 'Saltcliffe'],
  [216, 945, 8, 7, 0, 'Blacktyde'],
  [138, 968, 16, 11, 0.6, 'Orkmont'],
  [96, 1242, 16, 11, 0.2, 'Fair Isle'],
  [140, 1880, 22, 42, 0.25, 'The Arbor'],
  [120, 1598, 9, 7, 0, 'Oakenshield'],
  [114, 1640, 9, 7, 0, 'Southshield'],
  [128, 1560, 7, 6, 0, 'Greenshield'],
  [908, 1500, 14, 32, -0.4, 'Tarth'],
  [920, 1602, 12, 10, 0, 'Estermont'],
  [822, 1258, 17, 13, 0, 'Dragonstone'],
  [786, 1312, 16, 10, 0.4, 'Driftmark'],
  [818, 1200, 9, 7, 0, 'Claw Isle'],
  [718, 858, 14, 9, 0.3, 'Sisterton'],
  [752, 846, 10, 8, 0, 'Longsister'],
  [740, 824, 8, 6, 0, 'Littlesister'],
  [964, 1748, 10, 7, 0.4, 'Bloodstone'],
  [988, 1766, 9, 7, 0, 'Grey Gallows'],
  [1012, 1780, 8, 6, 0.3, 'The Stepstones'],
  [1004, 1650, 22, 16, 0.3, 'Tyrosh'],
  [1080, 1776, 26, 18, 0.2, 'Lys'],
  [1142, 868, 20, 16, 0, 'Braavos'],
  [1300, 770, 44, 26, 0.3, 'Lorath'],
  [652, 1130, 6, 5, 0, 'Quiet Isle'],
];

// Lakes: [x, y, rx, ry, rot, name]
export const LAKES = [
  [562, 1244, 34, 28, 0.3, "Gods Eye"],
  [560, 470, 12, 40, 0.1, 'Long Lake'],
  [500, 1586, 18, 12, 0, 'Red Lake'],
  [512, 128, 22, 12, 0, 'Frozen Lake'],
];

// Islands inside lakes
export const LAKE_ISLANDS = [[560, 1240, 11, 8, 0.2, 'Isle of Faces']];

// Mountain ranges: polyline, width (world units), strength 0..1
export const MOUNTAINS = [
  { name: 'The Frostfangs', pts: [[210, 40], [250, 110], [290, 190], [320, 270]], w: 80, s: 1.0 },
  { name: 'Mountains of the North', pts: [[360, 470], [400, 430], [450, 420], [500, 450]], w: 50, s: 0.75 },
  { name: 'Northern Hills', pts: [[640, 380], [690, 420], [700, 470]], w: 28, s: 0.5 },
  { name: 'Skagos Peaks', pts: [[840, 390], [846, 450]], w: 18, s: 0.8 },
  { name: 'Mountains of the Moon', pts: [[596, 1062], [630, 1016], [690, 990], [752, 996], [800, 958]], w: 70, s: 1.0 },
  { name: 'Giant\'s Lance', pts: [[680, 1060], [690, 1020], [712, 1002]], w: 28, s: 1.0 },
  { name: 'Westerlands Hills', pts: [[220, 1170], [262, 1236], [292, 1300], [312, 1360]], w: 60, s: 0.5 },
  { name: 'The Red Mountains', pts: [[372, 1776], [440, 1756], [520, 1750], [600, 1746], [690, 1722]], w: 60, s: 1.0 },
  { name: 'Dornish Ridge', pts: [[470, 1790], [520, 1820], [560, 1840]], w: 22, s: 0.5 },
  { name: 'Dragonmont', pts: [[826, 1252], [828, 1262]], w: 14, s: 1.0 },
  { name: 'Axe of Essos', pts: [[1200, 600], [1250, 700], [1300, 820], [1380, 900]], w: 50, s: 0.6 },
  { name: 'Velvet Hills', pts: [[1120, 1420], [1200, 1440], [1260, 1500]], w: 40, s: 0.4 },
];

// Biome brushes: type -> list of [x, y, rx, ry, strength]
export const BIOMES = {
  forest: [
    [500, 170, 230, 110, 1.0],  // Haunted Forest
    [330, 590, 100, 70, 1.0],   // Wolfswood
    [260, 520, 60, 50, 0.8],
    [620, 520, 60, 40, 0.5],
    [440, 530, 40, 40, 0.45],
    [700, 1446, 76, 40, 1.0],   // Kingswood
    [832, 1600, 44, 34, 0.9],   // Rainwood
    [760, 1500, 40, 30, 0.6],
    [540, 1650, 60, 26, 0.6],   // Dornish marches woods
    [410, 1180, 50, 36, 0.4],   // Riverlands woods
    [470, 1080, 40, 30, 0.5],
    [300, 1500, 60, 40, 0.35],  // Reach woods
    [600, 1320, 34, 24, 0.5],
    [1200, 1000, 120, 150, 0.45], // Forest of Qohor-ish
    [1450, 1380, 120, 120, 0.9],
    [270, 1680, 60, 40, 0.3],
  ],
  marsh: [
    [452, 935, 120, 50, 1.0],   // The Neck
    [560, 900, 30, 20, 0.5],
    [640, 1160, 30, 16, 0.4],
    [870, 1920, 30, 16, 0.3],
    [1260, 1320, 70, 40, 0.4],
  ],
  desert: [
    [560, 1880, 280, 80, 1.0],  // Dorne sands
    [460, 1850, 110, 40, 0.8],
    [800, 1840, 110, 60, 0.7],
    [1420, 1800, 200, 120, 0.6], // Disputed / Rhoyne south
  ],
  dry: [
    [420, 1800, 80, 30, 0.6],
    [720, 1780, 100, 40, 0.5],
    [1250, 1500, 160, 120, 0.4],
  ],
  lush: [
    [340, 1560, 160, 120, 1.0],  // The Reach
    [250, 1740, 60, 50, 0.8],
    [460, 1460, 90, 50, 0.7],
    [440, 1170, 110, 90, 0.6],   // Riverlands
    [680, 1880, 30, 50, 0.9],    // Greenblood valley
    [650, 1110, 60, 60, 0.5],
  ],
};

// Rivers: polyline from source to mouth; width grows downstream
export const RIVERS = [
  { name: 'White Knife', pts: [[498, 640], [512, 690], [532, 730], [552, 780], [576, 834]], w: 2.4 },
  { name: 'Broken Branch', pts: [[622, 620], [612, 690], [590, 740], [556, 782]], w: 1.6 },
  { name: 'Last River', pts: [[566, 508], [620, 470], [690, 462], [740, 470], [786, 462]], w: 2.0 },
  { name: 'Weeping Water', pts: [[600, 548], [648, 568], [704, 590], [786, 604]], w: 1.8 },
  { name: 'Saltspear', pts: [[420, 700], [452, 760], [470, 830], [478, 880]], w: 1.4 },
  { name: 'Green Fork', pts: [[454, 962], [444, 1024], [466, 1080], [516, 1128], [560, 1160]], w: 2.2 },
  { name: 'Blue Fork', pts: [[374, 1060], [420, 1098], [480, 1136], [560, 1160]], w: 2.0 },
  { name: 'Tumblestone', pts: [[296, 1118], [350, 1148], [394, 1178]], w: 1.6 },
  { name: 'Red Fork', pts: [[290, 1242], [340, 1202], [394, 1180], [460, 1200], [520, 1190], [560, 1160]], w: 2.4 },
  { name: 'Trident', pts: [[560, 1160], [596, 1152], [626, 1142]], w: 3.4 },
  { name: 'Blackwater Rush', pts: [[400, 1318], [460, 1330], [520, 1334], [574, 1350], [630, 1362], [684, 1374]], w: 2.8 },
  { name: 'Mander', pts: [[592, 1398], [540, 1430], [500, 1452], [440, 1506], [370, 1556], [300, 1590], [224, 1608], [156, 1614]], w: 3.0 },
  { name: 'Cockleswhent', pts: [[500, 1560], [440, 1540], [400, 1528]], w: 1.4 },
  { name: 'Honeywine', pts: [[330, 1650], [290, 1690], [256, 1722], [228, 1742]], w: 1.8 },
  { name: 'Torrentine', pts: [[436, 1778], [410, 1818], [390, 1864]], w: 1.8 },
  { name: 'Greenblood', pts: [[620, 1796], [642, 1846], [672, 1890], [700, 1920], [720, 1948]], w: 2.6 },
  { name: 'Scourge', pts: [[560, 1840], [600, 1860], [650, 1868], [672, 1890]], w: 1.4 },
  { name: 'Vaith', pts: [[520, 1880], [580, 1900], [640, 1906], [690, 1912]], w: 1.2 },
  { name: 'Wendwater', pts: [[640, 1480], [700, 1500], [760, 1520], [826, 1546]], w: 1.6 },
  { name: 'Rhoyne', pts: [[1350, 900], [1360, 1100], [1400, 1300], [1460, 1500], [1470, 1700], [1482, 1960]], w: 3.6 },
  { name: 'Noyne', pts: [[1260, 1060], [1310, 1180], [1340, 1260], [1400, 1300]], w: 1.8 },
];

// Roads between named holdings (ids of settlements in houses.js / places)
export const ROADS = [
  { name: 'The Kingsroad', via: ['castle_black', 'last_hearth_jct', 'winterfell', 'cerwyn', 'barrowton_jct', 'moat_cailin', 'twins_jct', 'crossroads_inn', 'darry', 'kings_landing', 'kingswood_jct', 'storms_end'] },
  { name: 'The River Road', via: ['lannisport', 'golden_tooth', 'riverrun', 'stone_hedge_jct', 'crossroads_inn'] },
  { name: 'The Goldroad', via: ['lannisport', 'deep_den', 'goldroad_jct', 'kings_landing'] },
  { name: 'The Roseroad', via: ['kings_landing', 'tumbleton', 'bitterbridge', 'highgarden', 'horn_hill_jct', 'oldtown'] },
  { name: 'The Ocean Road', via: ['highgarden', 'old_oak', 'crakehall', 'lannisport'] },
  { name: 'The High Road', via: ['crossroads_inn', 'bloody_gate', 'eyrie'] },
  { name: 'Vale Road', via: ['eyrie', 'gulltown', 'runestone'] },
  { name: 'The Boneway', via: ['storms_end', 'nightsong_jct', 'wyl', 'yronwood', 'sunspear'] },
  { name: "The Prince's Pass", via: ['nightsong', 'kingsgrave', 'skyreach', 'yronwood'] },
  { name: 'Barrowton Road', via: ['barrowton_jct', 'barrowton', 'torrhens_square'] },
  { name: 'White Harbor Road', via: ['winterfell', 'white_harbor'] },
  { name: 'Duskendale Road', via: ['kings_landing', 'rosby', 'duskendale', 'maidenpool', 'saltpans'] },
  { name: 'Dornish Road', via: ['sunspear', 'godsgrace', 'hellholt', 'vaith'] },
  { name: 'Western Road', via: ['kingswood_jct', 'bronzegate', 'harvest_hall'] },
];

// Road junction points (not holdings)
export const JUNCTIONS = {
  last_hearth_jct: [498, 470],
  barrowton_jct: [440, 790],
  twins_jct: [452, 1030],
  crossroads_inn: [520, 1180],
  stone_hedge_jct: [450, 1190],
  goldroad_jct: [470, 1340],
  kingswood_jct: [720, 1460],
  horn_hill_jct: [310, 1690],
  nightsong_jct: [650, 1690],
};

// The Wall
export const WALL = [[270, 336], [340, 334], [420, 338], [505, 336], [580, 334], [660, 338], [735, 336]];

// Map labels for seas & large geographic features
export const LABELS = [
  { t: 'THE SUNSET SEA', x: 50, y: 1250, s: 22, rot: -Math.PI / 2, kind: 'sea' },
  { t: 'THE NARROW SEA', x: 975, y: 1150, s: 20, rot: -Math.PI / 2, kind: 'sea' },
  { t: 'THE SHIVERING SEA', x: 960, y: 330, s: 22, rot: 0, kind: 'sea' },
  { t: 'THE SUMMER SEA', x: 700, y: 2040, s: 22, rot: 0, kind: 'sea' },
  { t: 'The Bite', x: 690, y: 872, s: 13, rot: 0, kind: 'sea' },
  { t: 'Blackwater Bay', x: 740, y: 1355, s: 11, rot: -0.2, kind: 'sea' },
  { t: 'Sea of Dorne', x: 820, y: 1706, s: 11, rot: 0, kind: 'sea' },
  { t: "Ironman's Bay", x: 230, y: 1110, s: 11, rot: 0, kind: 'sea' },
  { t: 'Bay of Ice', x: 230, y: 380, s: 10, rot: 0, kind: 'sea' },
  { t: 'Bay of Seals', x: 790, y: 300, s: 10, rot: 0, kind: 'sea' },
  { t: 'Shipbreaker Bay', x: 900, y: 1540, s: 10, rot: 0, kind: 'sea' },
  { t: 'Bay of Crabs', x: 700, y: 1140, s: 10, rot: 0, kind: 'sea' },
  { t: 'THE HAUNTED FOREST', x: 500, y: 190, s: 13, rot: 0, kind: 'feature' },
  { t: 'THE LANDS OF ALWAYS WINTER', x: 520, y: 40, s: 13, rot: 0, kind: 'feature' },
  { t: 'Wolfswood', x: 330, y: 585, s: 11, rot: 0, kind: 'feature' },
  { t: 'The Neck', x: 455, y: 945, s: 11, rot: 0, kind: 'feature' },
  { t: 'Kingswood', x: 700, y: 1440, s: 10, rot: 0, kind: 'feature' },
  { t: 'Mountains of the Moon', x: 700, y: 975, s: 10, rot: -0.2, kind: 'feature' },
  { t: 'The Red Mountains', x: 540, y: 1735, s: 10, rot: 0, kind: 'feature' },
  { t: 'Frostfangs', x: 265, y: 160, s: 10, rot: 1.0, kind: 'feature' },
  { t: 'The Stepstones', x: 990, y: 1805, s: 10, rot: 0, kind: 'feature' },
  { t: 'Rainwood', x: 835, y: 1615, s: 9, rot: 0, kind: 'feature' },
  { t: 'The Dornish Sands', x: 560, y: 1895, s: 11, rot: 0, kind: 'feature' },
  { t: 'Flatlands', x: 1300, y: 1150, s: 11, rot: 0, kind: 'feature' },
  { t: 'The Disputed Lands', x: 1250, y: 1600, s: 11, rot: 0, kind: 'feature' },
  { t: 'Forest of Qohor', x: 1450, y: 1380, s: 11, rot: 0, kind: 'feature' },
];
