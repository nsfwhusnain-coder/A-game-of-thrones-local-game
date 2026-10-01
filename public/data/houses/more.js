// The houses added by WP G1 (docs/gdd/13-content-data.md §2): the lesser houses of the books and of the World of Ice & Fire that the first roster left out. Same shape as the
// rows of houses.js; every row says where it comes from. Where the books do not give a seat's place (most of them do not), the position is inferred — the nearest free land to where
// the house lies in the books, at least a day's ride from every other seat (scripts/check-data.js holds that, and that every seat is on land). Sigils and colours are drawn from the
// house's name (deterministic) unless the books give them; they are placeholders for the owner's heraldry. A house with no named lord gets one by generateLord (invented: true).
// GENERATED once by hand-checked script; edit freely.
export const MORE_HOUSES = [
  // ───────────── north ─────────────
  // atlas: Flint's Finger (the Flints of the western coast, apart from the Flints of Widow's Watch)
  { id: 'flint_finger', name: 'Flint of Flint\'s Finger', seat: 'Flint\'s Finger', pos: [305, 1181], liege: 'stark', region: 'north', rank: 'minor', color: '#2d5a2a',
    sigil: { f: '#2d5a2a', c: 'spear', cc: '#e8b923', d: 'bend', t: '#6b3a7a' }, words: '' },
  // World of Ice & Fire, house list: Skagos; the island's ruling house
  { id: 'magnar', name: 'Magnar of Kingshouse', seat: 'Kingshouse', pos: [922, 577], liege: 'stark', region: 'north', rank: 'minor', color: '#141414',
    sigil: { f: '#141414', c: 'axe', cc: '#e9eef2', d: 'plain', t: null }, words: '' },
  // World of Ice & Fire, house list: Skagos
  { id: 'stane', name: 'Stane of Driftwood Hall', seat: 'Driftwood Hall', pos: [917, 600], liege: 'stark', region: 'north', rank: 'minor', color: '#2d5a2a',
    sigil: { f: '#2d5a2a', c: 'spear', cc: '#e8b923', d: 'chevron', t: '#8a4a1a' }, words: '' },
  // World of Ice & Fire, house list: Blackpool, on the White Knife; position inferred
  { id: 'slate', name: 'Slate of Blackpool', seat: 'Blackpool', pos: [705, 1000], liege: 'stark', region: 'north', rank: 'minor', color: '#2d5a2a',
    sigil: { f: '#2d5a2a', c: 'spear', cc: '#e9eef2', d: 'plain', t: null }, words: '' },
  // World of Ice & Fire, house list: Highpoint; position inferred
  { id: 'whitehill', name: 'Whitehill of Highpoint', seat: 'Highpoint', pos: [495, 890], liege: 'stark', region: 'north', rank: 'minor', color: '#8a4a1a',
    sigil: { f: '#8a4a1a', c: 'wolf', cc: '#e9eef2', d: 'plain', t: null }, words: '' },
  // World of Ice & Fire, house list; position inferred
  { id: 'woolfield', name: 'Woolfield of Woolfield', seat: 'Woolfield Keep', pos: [610, 985], liege: 'stark', region: 'north', rank: 'minor', color: '#3a6a7a',
    sigil: { f: '#3a6a7a', c: 'wolf', cc: '#e8b923', d: 'plain', t: null }, words: '' },
  // World of Ice & Fire, house list: the mountain clans; position inferred
  { id: 'harclay', name: 'Harclay of Harclay Hall', seat: 'Harclay Hall', pos: [575, 760], liege: 'stark', region: 'north', rank: 'minor', color: '#1f3f7a',
    sigil: { f: '#1f3f7a', c: 'bear', cc: '#e9eef2', d: 'plain', t: null }, words: '' },
  // World of Ice & Fire, house list: the mountain clans; position inferred
  { id: 'burley', name: 'Burley of Wolf\'s Den', seat: 'Wolf\'s Den', pos: [585, 715], liege: 'stark', region: 'north', rank: 'minor', color: '#6b3a7a',
    sigil: { f: '#6b3a7a', c: 'wolf', cc: '#e8b923', d: 'pale', t: '#a33a2a' }, words: '' },
  // World of Ice & Fire, house list: Goldgrass; position inferred
  { id: 'stout', name: 'Stout of Goldgrass', seat: 'Goldgrass', pos: [415, 1000], liege: 'stark', region: 'north', rank: 'minor', color: '#2d5a2a',
    sigil: { f: '#2d5a2a', c: 'moose', cc: '#e8b923', d: 'pale', t: '#8a4a1a' }, words: '' },
  // ───────────── riverlands ─────────────
  // World of Ice & Fire, house list; atlas: Lord Harroway's Town
  { id: 'roote', name: 'Roote of Lord Harroway\'s Town', seat: 'Lord Harroway\'s Town', pos: [642, 1515], liege: 'tully', region: 'riverlands', rank: 'minor', color: '#3a6a7a',
    sigil: { f: '#3a6a7a', c: 'tower', cc: '#e8b923', d: 'plain', t: null }, words: '' },
  // World of Ice & Fire, house list; atlas: Lord Lychester's Keep
  { id: 'lychester', name: 'Lychester', seat: 'Lychester Keep', pos: [555, 1527], liege: 'tully', region: 'riverlands', rank: 'minor', color: '#3a6a7a',
    sigil: { f: '#3a6a7a', c: 'star', cc: '#e8b923', d: 'fess', t: '#8a4a1a' }, words: '' },
  // World of Ice & Fire, house list: Vance of Atranta (the other branch is Vance of Wayfarer's Rest); position inferred
  { id: 'vance_atranta', name: 'Vance of Atranta', seat: 'Atranta', pos: [495, 1566], liege: 'tully', region: 'riverlands', rank: 'minor', color: '#e9eef2',
    sigil: { f: '#e9eef2', c: 'horse', cc: '#a33a2a', d: 'bend', t: '#8a4a1a' }, words: '' },
  // A Clash of Kings: Ser Robin Ryger; position inferred
  { id: 'ryger', name: 'Ryger of Willow Wood', seat: 'Willow Wood', pos: [530, 1560], liege: 'tully', region: 'riverlands', rank: 'minor', color: '#3a6a7a',
    sigil: { f: '#3a6a7a', c: 'tree', cc: '#e9eef2', d: 'plain', t: null }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'paege', name: 'Paege', seat: 'Paege Hall', pos: [575, 1480], liege: 'tully', region: 'riverlands', rank: 'minor', color: '#8a4a1a',
    sigil: { f: '#8a4a1a', c: 'horse', cc: '#e9eef2', d: 'bend', t: '#e8b923' }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'haigh', name: 'Haigh', seat: 'Haigh Hold', pos: [600, 1450], liege: 'tully', region: 'riverlands', rank: 'minor', color: '#6b3a7a',
    sigil: { f: '#6b3a7a', c: 'fish', cc: '#e8b923', d: 'fess', t: '#1f3f7a' }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'keath', name: 'Keath', seat: 'Keath Keep', pos: [555, 1500], liege: 'tully', region: 'riverlands', rank: 'minor', color: '#2d5a2a',
    sigil: { f: '#2d5a2a', c: 'tree', cc: '#e9eef2', d: 'plain', t: null }, words: '' },
  // A Clash of Kings: Ser Desmond Grell; seat and position inferred
  { id: 'grell', name: 'Grell', seat: 'Grell Tower', pos: [506, 1545], liege: 'tully', region: 'riverlands', rank: 'minor', color: '#1f3f7a',
    sigil: { f: '#1f3f7a', c: 'trout', cc: '#e9eef2', d: 'plain', t: null }, words: '' },
  // A Storm of Swords: Utherydes Wayn; seat and position inferred
  { id: 'wayn', name: 'Wayn', seat: 'Wayn Hold', pos: [485, 1520], liege: 'tully', region: 'riverlands', rank: 'minor', color: '#6b3a7a',
    sigil: { f: '#6b3a7a', c: 'horse', cc: '#e8b923', d: 'fess', t: '#3a6a7a' }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'nayland', name: 'Nayland', seat: 'Nayland Hold', pos: [481, 1551], liege: 'tully', region: 'riverlands', rank: 'minor', color: '#2d5a2a',
    sigil: { f: '#2d5a2a', c: 'tower', cc: '#e9eef2', d: 'plain', t: null }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'terrick', name: 'Terrick', seat: 'Terrick Tower', pos: [625, 1600], liege: 'tully', region: 'riverlands', rank: 'minor', color: '#7a2a3a',
    sigil: { f: '#7a2a3a', c: 'star', cc: '#e9eef2', d: 'fess', t: '#2d5a2a' }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'deddings', name: 'Deddings', seat: 'Deddings Tower', pos: [735, 1585], liege: 'tully', region: 'riverlands', rank: 'minor', color: '#1f3f7a',
    sigil: { f: '#1f3f7a', c: 'horse', cc: '#e8b923', d: 'chevron', t: '#7a2a3a' }, words: '' },
  // World of Ice & Fire, house list: a Frey kin seat; position inferred
  { id: 'erenford', name: 'Frey of Erenford', seat: 'Erenford', pos: [535, 1360], liege: 'frey', region: 'riverlands', rank: 'minor', color: '#2d5a2a',
    sigil: { f: '#2d5a2a', c: 'twintowers', cc: '#e8b923', d: 'plain', t: null }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'heddle', name: 'Heddle', seat: 'Heddle Hall', pos: [705, 1545], liege: 'tully', region: 'riverlands', rank: 'minor', color: '#1f3f7a',
    sigil: { f: '#1f3f7a', c: 'tree', cc: '#e8b923', d: 'pale', t: '#e8b923' }, words: '' },
  // ───────────── vale ─────────────
  // World of Ice & Fire, house list; atlas: Old Anchor
  { id: 'melcolm', name: 'Melcolm of Old Anchor', seat: 'Old Anchor', pos: [904, 1402], liege: 'arryn', region: 'vale', rank: 'minor', color: '#2d5a2a',
    sigil: { f: '#2d5a2a', c: 'fish', cc: '#e8b923', d: 'bend', t: '#e9eef2' }, words: '' },
  // World of Ice & Fire, house list: Shett; near Gulltown
  { id: 'shett', name: 'Shett of Gull Tower', seat: 'Gull Tower', pos: [939, 1431], liege: 'arryn', region: 'vale', rank: 'minor', color: '#7a2a3a',
    sigil: { f: '#7a2a3a', c: 'bird', cc: '#e9eef2', d: 'chevron', t: '#e9eef2' }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'egen', name: 'Egen', seat: 'Egen Hold', pos: [875, 1380], liege: 'arryn', region: 'vale', rank: 'minor', color: '#e9eef2',
    sigil: { f: '#e9eef2', c: 'tree', cc: '#141414', d: 'plain', t: null }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'hersy', name: 'Hersy', seat: 'Hersy Keep', pos: [815, 1400], liege: 'arryn', region: 'vale', rank: 'minor', color: '#3a6a7a',
    sigil: { f: '#3a6a7a', c: 'star', cc: '#e9eef2', d: 'fess', t: '#a33a2a' }, words: '' },
  // World of Ice & Fire, house list: Ser Mandon Moore's house; seat and position inferred
  { id: 'moore', name: 'Moore', seat: 'Moore Tower', pos: [795, 1500], liege: 'arryn', region: 'vale', rank: 'minor', color: '#7a2a3a',
    sigil: { f: '#7a2a3a', c: 'eagle', cc: '#e9eef2', d: 'plain', t: null }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'upcliff', name: 'Upcliff', seat: 'Upcliff Hold', pos: [885, 1340], liege: 'arryn', region: 'vale', rank: 'minor', color: '#a33a2a',
    sigil: { f: '#a33a2a', c: 'eagle', cc: '#e8b923', d: 'bend', t: '#3a6a7a' }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'ruthermont', name: 'Ruthermont', seat: 'Ruthermont Hall', pos: [896, 1306], liege: 'arryn', region: 'vale', rank: 'minor', color: '#8a4a1a',
    sigil: { f: '#8a4a1a', c: 'tree', cc: '#e8b923', d: 'fess', t: '#2d5a2a' }, words: '' },
  // World of Ice & Fire, house list: the Grey Glen (Eddison Tollett's house); position inferred
  { id: 'tollett', name: 'Tollett of the Grey Glen', seat: 'The Grey Glen', pos: [815, 1330], liege: 'arryn', region: 'vale', rank: 'minor', color: '#141414',
    sigil: { f: '#141414', c: 'falcon', cc: '#e9eef2', d: 'plain', t: null }, words: '' },
  // World of Ice & Fire, house list: the Paps
  { id: 'elesham', name: 'Elesham of the Paps', seat: 'The Paps', pos: [935, 1203], liege: 'arryn', region: 'vale', rank: 'minor', color: '#3a6a7a',
    sigil: { f: '#3a6a7a', c: 'tree', cc: '#e8b923', d: 'bend', t: '#141414' }, words: '' },
  // World of Ice & Fire, house list: Hardyng the Young; seat and position inferred
  { id: 'hardyng', name: 'Hardyng', seat: 'Hardyng Keep', pos: [745, 1400], liege: 'arryn', region: 'vale', rank: 'minor', color: '#a33a2a',
    sigil: { f: '#a33a2a', c: 'eagle', cc: '#e8b923', d: 'fess', t: '#6b3a7a' }, words: '' },
  // World of Ice & Fire, house list: the Sisters
  { id: 'borrell', name: 'Borrell of Sweetsister', seat: 'Sweetsister', pos: [717, 1195], liege: 'arryn', region: 'vale', rank: 'minor', color: '#e8b923',
    sigil: { f: '#e8b923', c: 'eagle', cc: '#141414', d: 'plain', t: null }, words: '' },
  // World of Ice & Fire, house list: the Sisters
  { id: 'longthorpe', name: 'Longthorpe of Longsister', seat: 'Longsister', pos: [685, 1217], liege: 'arryn', region: 'vale', rank: 'minor', color: '#141414',
    sigil: { f: '#141414', c: 'eagle', cc: '#e8b923', d: 'fess', t: '#e9eef2' }, words: '' },
  // World of Ice & Fire, house list: the Sisters
  { id: 'torrent', name: 'Torrent of Littlesister', seat: 'Littlesister', pos: [745, 1201], liege: 'arryn', region: 'vale', rank: 'minor', color: '#8a4a1a',
    sigil: { f: '#8a4a1a', c: 'falcon', cc: '#e8b923', d: 'fess', t: '#7a2a3a' }, words: '' },
  // ───────────── westerlands ─────────────
  // World of Ice & Fire, house list: Ilyn Payne's house; seat inferred
  { id: 'payne', name: 'Payne', seat: 'Payne\'s Hall', pos: [325, 1710], liege: 'lannister', region: 'westerlands', rank: 'minor', color: '#2d5a2a',
    sigil: { f: '#2d5a2a', c: 'lion', cc: '#e8b923', d: 'chevron', t: '#e9eef2' }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'plumm', name: 'Plumm', seat: 'Plumm Hold', pos: [400, 1690], liege: 'lannister', region: 'westerlands', rank: 'minor', color: '#a33a2a',
    sigil: { f: '#a33a2a', c: 'star', cc: '#e8b923', d: 'chevron', t: '#1f3f7a' }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'moreland', name: 'Moreland', seat: 'Moreland Hall', pos: [385, 1600], liege: 'lannister', region: 'westerlands', rank: 'minor', color: '#141414',
    sigil: { f: '#141414', c: 'lion', cc: '#e9eef2', d: 'fess', t: '#1f3f7a' }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'stackspear', name: 'Stackspear', seat: 'Stackspear Keep', pos: [315, 1620], liege: 'lannister', region: 'westerlands', rank: 'minor', color: '#a33a2a',
    sigil: { f: '#a33a2a', c: 'spear', cc: '#e8b923', d: 'plain', t: null }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'estren', name: 'Estren', seat: 'Estren Keep', pos: [405, 1650], liege: 'lannister', region: 'westerlands', rank: 'minor', color: '#2d5a2a',
    sigil: { f: '#2d5a2a', c: 'horse', cc: '#e8b923', d: 'chevron', t: '#1f3f7a' }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'hetherspoon', name: 'Hetherspoon', seat: 'Hetherspoon Hold', pos: [305, 1650], liege: 'lannister', region: 'westerlands', rank: 'minor', color: '#a33a2a',
    sigil: { f: '#a33a2a', c: 'bird', cc: '#e8b923', d: 'plain', t: null }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'garner', name: 'Garner', seat: 'Garner Hold', pos: [355, 1700], liege: 'lannister', region: 'westerlands', rank: 'minor', color: '#a33a2a',
    sigil: { f: '#a33a2a', c: 'tower', cc: '#e9eef2', d: 'chevron', t: '#2d5a2a' }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'foote', name: 'Foote', seat: 'Foote Keep', pos: [385, 1760], liege: 'lannister', region: 'westerlands', rank: 'minor', color: '#6b3a7a',
    sigil: { f: '#6b3a7a', c: 'tower', cc: '#e9eef2', d: 'plain', t: null }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'jast', name: 'Jast', seat: 'Jast Tower', pos: [305, 1760], liege: 'lannister', region: 'westerlands', rank: 'minor', color: '#141414',
    sigil: { f: '#141414', c: 'key', cc: '#e9eef2', d: 'plain', t: null }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'algood', name: 'Algood', seat: 'Algood Hall', pos: [257, 1618], liege: 'lannister', region: 'westerlands', rank: 'minor', color: '#141414',
    sigil: { f: '#141414', c: 'key', cc: '#e9eef2', d: 'pale', t: '#a33a2a' }, words: '' },
  // World of Ice & Fire, house list: Ser Amory Lorch's house; seat and position inferred
  { id: 'lorch', name: 'Lorch', seat: 'Lorch Hall', pos: [395, 1530], liege: 'lannister', region: 'westerlands', rank: 'minor', color: '#141414',
    sigil: { f: '#141414', c: 'lion', cc: '#e8b923', d: 'fess', t: '#7a2a3a' }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'ruttiger', name: 'Ruttiger', seat: 'Ruttiger Tower', pos: [435, 1630], liege: 'lannister', region: 'westerlands', rank: 'minor', color: '#141414',
    sigil: { f: '#141414', c: 'horse', cc: '#e9eef2', d: 'plain', t: null }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'greenfield', name: 'Greenfield', seat: 'Greenfield Keep', pos: [330, 1535], liege: 'lannister', region: 'westerlands', rank: 'minor', color: '#2d5a2a',
    sigil: { f: '#2d5a2a', c: 'lion', cc: '#e9eef2', d: 'pale', t: '#e9eef2' }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'kyndall', name: 'Kyndall', seat: 'Kyndall Hold', pos: [271, 1736], liege: 'lannister', region: 'westerlands', rank: 'minor', color: '#6b3a7a',
    sigil: { f: '#6b3a7a', c: 'bird', cc: '#e8b923', d: 'fess', t: '#1f3f7a' }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'broom', name: 'Broom', seat: 'Broom Hold', pos: [371, 1489], liege: 'lannister', region: 'westerlands', rank: 'minor', color: '#2d5a2a',
    sigil: { f: '#2d5a2a', c: 'tower', cc: '#e9eef2', d: 'plain', t: null }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'yew', name: 'Yew', seat: 'Yew Keep', pos: [415, 1580], liege: 'lannister', region: 'westerlands', rank: 'minor', color: '#a33a2a',
    sigil: { f: '#a33a2a', c: 'tree', cc: '#e9eef2', d: 'fess', t: '#2d5a2a' }, words: '' },
  // ───────────── reach ─────────────
  // World of Ice & Fire, house list; atlas: Bandallon
  { id: 'blackbar', name: 'Blackbar of Bandallon', seat: 'Bandallon', pos: [245, 2053], liege: 'tyrell', region: 'reach', rank: 'minor', color: '#141414',
    sigil: { f: '#141414', c: 'star', cc: '#e9eef2', d: 'plain', t: null }, words: '' },
  // World of Ice & Fire, house list: the green-apple Fossoways (the red-apple branch holds Cider Hall)
  { id: 'fossoway_nb', name: 'Fossoway of New Barrel', seat: 'New Barrel', pos: [485, 1965], liege: 'tyrell', region: 'reach', rank: 'minor', color: '#1f3f7a',
    sigil: { f: '#1f3f7a', c: 'tree', cc: '#e9eef2', d: 'pale', t: '#6b3a7a' }, words: '' },
  // World of Ice & Fire, house list: Greenshield; position inferred
  { id: 'chester', name: 'Chester of Greenshield', seat: 'Greenshield', pos: [291, 2000], liege: 'tyrell', region: 'reach', rank: 'minor', color: '#1f3f7a',
    sigil: { f: '#1f3f7a', c: 'tower', cc: '#e9eef2', d: 'bend', t: '#141414' }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'ambrose', name: 'Ambrose', seat: 'Ambrose Keep', pos: [465, 1900], liege: 'tyrell', region: 'reach', rank: 'minor', color: '#6b3a7a',
    sigil: { f: '#6b3a7a', c: 'grapes', cc: '#e8b923', d: 'fess', t: '#e9eef2' }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'appleton', name: 'Appleton', seat: 'Appleton Keep', pos: [575, 1900], liege: 'tyrell', region: 'reach', rank: 'minor', color: '#e9eef2',
    sigil: { f: '#e9eef2', c: 'tree', cc: '#a33a2a', d: 'pale', t: '#1f3f7a' }, words: '' },
  // World of Ice & Fire, house list: Holyhall; position inferred
  { id: 'graceford', name: 'Graceford of Holyhall', seat: 'Holyhall', pos: [395, 2020], liege: 'tyrell', region: 'reach', rank: 'minor', color: '#3a6a7a',
    sigil: { f: '#3a6a7a', c: 'grapes', cc: '#e9eef2', d: 'pale', t: '#1f3f7a' }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'hunt', name: 'Hunt', seat: 'Hunt Keep', pos: [337, 1991], liege: 'tyrell', region: 'reach', rank: 'minor', color: '#3a6a7a',
    sigil: { f: '#3a6a7a', c: 'tree', cc: '#e8b923', d: 'pale', t: '#2d5a2a' }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'norcross', name: 'Norcross', seat: 'Norcross Keep', pos: [485, 2010], liege: 'tyrell', region: 'reach', rank: 'minor', color: '#6b3a7a',
    sigil: { f: '#6b3a7a', c: 'key', cc: '#e8b923', d: 'chevron', t: '#e8b923' }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'norridge', name: 'Norridge', seat: 'Norridge Tower', pos: [535, 2000], liege: 'tyrell', region: 'reach', rank: 'minor', color: '#141414',
    sigil: { f: '#141414', c: 'rose', cc: '#e9eef2', d: 'plain', t: null }, words: '' },
  // The Hedge Knight: Standfast; position inferred
  { id: 'osgrey', name: 'Osgrey of Standfast', seat: 'Standfast', pos: [605, 1940], liege: 'tyrell', region: 'reach', rank: 'minor', color: '#2d5a2a',
    sigil: { f: '#2d5a2a', c: 'bird', cc: '#e8b923', d: 'pale', t: '#8a4a1a' }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'redding', name: 'Redding', seat: 'Redding Keep', pos: [439, 1912], liege: 'tyrell', region: 'reach', rank: 'minor', color: '#6b3a7a',
    sigil: { f: '#6b3a7a', c: 'tree', cc: '#e8b923', d: 'plain', t: null }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'roxton', name: 'Roxton', seat: 'Roxton Tower', pos: [475, 1840], liege: 'tyrell', region: 'reach', rank: 'minor', color: '#7a2a3a',
    sigil: { f: '#7a2a3a', c: 'bird', cc: '#e9eef2', d: 'bend', t: '#8a4a1a' }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'varner', name: 'Varner', seat: 'Varner Tower', pos: [375, 1900], liege: 'tyrell', region: 'reach', rank: 'minor', color: '#1f3f7a',
    sigil: { f: '#1f3f7a', c: 'star', cc: '#e9eef2', d: 'fess', t: '#8a4a1a' }, words: '' },
  // World of Ice & Fire, house list: Coldmoat; position inferred
  { id: 'webber', name: 'Webber of Coldmoat', seat: 'Coldmoat', pos: [512, 2069], liege: 'tyrell', region: 'reach', rank: 'minor', color: '#2d5a2a',
    sigil: { f: '#2d5a2a', c: 'star', cc: '#e9eef2', d: 'chevron', t: '#8a4a1a' }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'oldflowers', name: 'Oldflowers', seat: 'Oldflowers Hold', pos: [355, 2170], liege: 'tyrell', region: 'reach', rank: 'minor', color: '#3a6a7a',
    sigil: { f: '#3a6a7a', c: 'rose', cc: '#e8b923', d: 'bend', t: '#1f3f7a' }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'hastwyck', name: 'Hastwyck', seat: 'Hastwyck Tower', pos: [375, 2040], liege: 'tyrell', region: 'reach', rank: 'minor', color: '#1f3f7a',
    sigil: { f: '#1f3f7a', c: 'grapes', cc: '#e9eef2', d: 'chevron', t: '#7a2a3a' }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'cockshaw', name: 'Cockshaw', seat: 'Cockshaw Hold', pos: [435, 1960], liege: 'tyrell', region: 'reach', rank: 'minor', color: '#a33a2a',
    sigil: { f: '#a33a2a', c: 'key', cc: '#e9eef2', d: 'plain', t: null }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'durwell', name: 'Durwell', seat: 'Durwell Keep', pos: [485, 2100], liege: 'tyrell', region: 'reach', rank: 'minor', color: '#2d5a2a',
    sigil: { f: '#2d5a2a', c: 'rose', cc: '#e9eef2', d: 'plain', t: null }, words: '' },
  // ───────────── stormlands ─────────────
  // World of Ice & Fire, house list; atlas: Fawnton
  { id: 'cafferen', name: 'Cafferen of Fawnton', seat: 'Fawnton', pos: [707, 1850], liege: 'baratheon_se', region: 'stormlands', rank: 'minor', color: '#e8b923',
    sigil: { f: '#e8b923', c: 'stag', cc: '#a33a2a', d: 'chevron', t: '#141414' }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'gower', name: 'Gower', seat: 'Gower Tower', pos: [755, 1960], liege: 'baratheon_se', region: 'stormlands', rank: 'minor', color: '#1f3f7a',
    sigil: { f: '#1f3f7a', c: 'falcon', cc: '#e9eef2', d: 'pale', t: '#141414' }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'hasty', name: 'Hasty', seat: 'Hasty Keep', pos: [715, 1930], liege: 'baratheon_se', region: 'stormlands', rank: 'minor', color: '#a33a2a',
    sigil: { f: '#a33a2a', c: 'stag', cc: '#e9eef2', d: 'plain', t: null }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'horpe', name: 'Horpe', seat: 'Horpe Hall', pos: [855, 1980], liege: 'baratheon_se', region: 'stormlands', rank: 'minor', color: '#1f3f7a',
    sigil: { f: '#1f3f7a', c: 'stag', cc: '#e9eef2', d: 'fess', t: '#8a4a1a' }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'kellington', name: 'Kellington', seat: 'Kellington Keep', pos: [902, 1969], liege: 'baratheon_se', region: 'stormlands', rank: 'minor', color: '#3a6a7a',
    sigil: { f: '#3a6a7a', c: 'falcon', cc: '#e8b923', d: 'bend', t: '#6b3a7a' }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'lonmouth', name: 'Lonmouth', seat: 'Lonmouth Hall', pos: [880, 1895], liege: 'baratheon_se', region: 'stormlands', rank: 'minor', color: '#141414',
    sigil: { f: '#141414', c: 'star', cc: '#e8b923', d: 'chevron', t: '#1f3f7a' }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'musgood', name: 'Musgood', seat: 'Musgood Hall', pos: [795, 1900], liege: 'baratheon_se', region: 'stormlands', rank: 'minor', color: '#141414',
    sigil: { f: '#141414', c: 'fish', cc: '#e9eef2', d: 'chevron', t: '#6b3a7a' }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'peasebury', name: 'Peasebury', seat: 'Peasebury Hall', pos: [825, 2010], liege: 'baratheon_se', region: 'stormlands', rank: 'minor', color: '#7a2a3a',
    sigil: { f: '#7a2a3a', c: 'stag', cc: '#e8b923', d: 'plain', t: null }, words: '' },
  // World of Ice & Fire, house list: Amberly; position inferred
  { id: 'rogers', name: 'Rogers of Amberly', seat: 'Amberly', pos: [745, 1830], liege: 'baratheon_se', region: 'stormlands', rank: 'minor', color: '#141414',
    sigil: { f: '#141414', c: 'falcon', cc: '#e8b923', d: 'fess', t: '#3a6a7a' }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'staedmon', name: 'Staedmon', seat: 'Staedmon Hold', pos: [871, 1882], liege: 'baratheon_se', region: 'stormlands', rank: 'minor', color: '#e9eef2',
    sigil: { f: '#e9eef2', c: 'bird', cc: '#a33a2a', d: 'plain', t: null }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'wensington', name: 'Wensington', seat: 'Wensington Tower', pos: [785, 1850], liege: 'baratheon_se', region: 'stormlands', rank: 'minor', color: '#e8b923',
    sigil: { f: '#e8b923', c: 'fish', cc: '#a33a2a', d: 'plain', t: null }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'whitehead', name: 'Whitehead', seat: 'Whitehead Keep', pos: [777, 2031], liege: 'baratheon_se', region: 'stormlands', rank: 'minor', color: '#2d5a2a',
    sigil: { f: '#2d5a2a', c: 'fish', cc: '#e8b923', d: 'chevron', t: '#7a2a3a' }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'bolling', name: 'Bolling', seat: 'Bolling Hold', pos: [715, 2000], liege: 'baratheon_se', region: 'stormlands', rank: 'minor', color: '#2d5a2a',
    sigil: { f: '#2d5a2a', c: 'bird', cc: '#e9eef2', d: 'plain', t: null }, words: '' },
  // ───────────── dorne ─────────────
  // World of Ice & Fire, house list: Dorne; seat and position inferred
  { id: 'drinkwater', name: 'Drinkwater', seat: 'Drinkwater Keep', pos: [686, 2141], liege: 'martell', region: 'dorne', rank: 'minor', color: '#e9eef2',
    sigil: { f: '#e9eef2', c: 'spear', cc: '#a33a2a', d: 'pale', t: '#7a2a3a' }, words: '' },
  // World of Ice & Fire, house list: Dorne; seat and position inferred
  { id: 'ladybright', name: 'Ladybright', seat: 'Ladybright Hall', pos: [735, 2190], liege: 'martell', region: 'dorne', rank: 'minor', color: '#e8b923',
    sigil: { f: '#e8b923', c: 'spear', cc: '#a33a2a', d: 'plain', t: null }, words: '' },
  // World of Ice & Fire, house list: Dorne; seat and position inferred
  { id: 'wells', name: 'Wells', seat: 'Wells Hold', pos: [605, 2100], liege: 'martell', region: 'dorne', rank: 'minor', color: '#6b3a7a',
    sigil: { f: '#6b3a7a', c: 'sun', cc: '#e9eef2', d: 'bend', t: '#3a6a7a' }, words: '' },
  // ───────────── crownlands ─────────────
  // World of Ice & Fire, house list; position inferred
  { id: 'sunglass', name: 'Sunglass of Sweetport Sound', seat: 'Sweetport Sound', pos: [780, 1722], liege: 'baratheon', region: 'crownlands', rank: 'minor', color: '#e8b923',
    sigil: { f: '#e8b923', c: 'key', cc: '#141414', d: 'bend', t: '#6b3a7a' }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'chelsted', name: 'Chelsted', seat: 'Chelsted Hall', pos: [745, 1650], liege: 'baratheon', region: 'crownlands', rank: 'minor', color: '#1f3f7a',
    sigil: { f: '#1f3f7a', c: 'star', cc: '#e8b923', d: 'bend', t: '#141414' }, words: '' },
  // World of Ice & Fire, house list: Ser Boros Blount's house; seat and position inferred
  { id: 'blount', name: 'Blount', seat: 'Blount Hall', pos: [700, 1715], liege: 'baratheon', region: 'crownlands', rank: 'minor', color: '#7a2a3a',
    sigil: { f: '#7a2a3a', c: 'hand', cc: '#e9eef2', d: 'plain', t: null }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'thorne', name: 'Thorne', seat: 'Thorne Hall', pos: [795, 1620], liege: 'baratheon', region: 'crownlands', rank: 'minor', color: '#8a4a1a',
    sigil: { f: '#8a4a1a', c: 'bird', cc: '#e9eef2', d: 'fess', t: '#6b3a7a' }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'mallery', name: 'Mallery', seat: 'Mallery Tower', pos: [782, 1769], liege: 'baratheon', region: 'crownlands', rank: 'minor', color: '#1f3f7a',
    sigil: { f: '#1f3f7a', c: 'key', cc: '#e9eef2', d: 'fess', t: '#e9eef2' }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'gaunt', name: 'Gaunt', seat: 'Gaunt Hold', pos: [794, 1695], liege: 'baratheon', region: 'crownlands', rank: 'minor', color: '#a33a2a',
    sigil: { f: '#a33a2a', c: 'bird', cc: '#e8b923', d: 'plain', t: null }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'byrch', name: 'Byrch', seat: 'Byrch Hall', pos: [705, 1760], liege: 'baratheon', region: 'crownlands', rank: 'minor', color: '#e8b923',
    sigil: { f: '#e8b923', c: 'star', cc: '#141414', d: 'plain', t: null }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'bywater', name: 'Bywater', seat: 'Bywater Tower', pos: [775, 1640], liege: 'baratheon', region: 'crownlands', rank: 'minor', color: '#1f3f7a',
    sigil: { f: '#1f3f7a', c: 'bird', cc: '#e8b923', d: 'plain', t: null }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'chyttering', name: 'Chyttering', seat: 'Chyttering Hold', pos: [842, 1754], liege: 'baratheon', region: 'crownlands', rank: 'minor', color: '#2d5a2a',
    sigil: { f: '#2d5a2a', c: 'star', cc: '#e8b923', d: 'pale', t: '#e8b923' }, words: '' },
  // World of Ice & Fire, house list: Crackclaw Point; position inferred
  { id: 'crabb', name: 'Crabb', seat: 'Crackclaw Point', pos: [897, 1723], liege: 'baratheon', region: 'crownlands', rank: 'minor', color: '#7a2a3a',
    sigil: { f: '#7a2a3a', c: 'fish', cc: '#e8b923', d: 'plain', t: null }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'cressey', name: 'Cressey', seat: 'Cressey Tower', pos: [806, 1762], liege: 'baratheon', region: 'crownlands', rank: 'minor', color: '#e8b923',
    sigil: { f: '#e8b923', c: 'bird', cc: '#141414', d: 'plain', t: null }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'harte', name: 'Harte', seat: 'Harte Tower', pos: [715, 1620], liege: 'baratheon', region: 'crownlands', rank: 'minor', color: '#e8b923',
    sigil: { f: '#e8b923', c: 'hand', cc: '#141414', d: 'fess', t: '#8a4a1a' }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'pyle', name: 'Pyle', seat: 'Pyle Hall', pos: [806, 1642], liege: 'baratheon', region: 'crownlands', rank: 'minor', color: '#e8b923',
    sigil: { f: '#e8b923', c: 'star', cc: '#141414', d: 'chevron', t: '#1f3f7a' }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'boggs', name: 'Boggs', seat: 'Boggs Hall', pos: [695, 1730], liege: 'baratheon', region: 'crownlands', rank: 'minor', color: '#1f3f7a',
    sigil: { f: '#1f3f7a', c: 'bird', cc: '#e8b923', d: 'chevron', t: '#7a2a3a' }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'farring', name: 'Farring', seat: 'Farring Keep', pos: [858, 1609], liege: 'baratheon', region: 'crownlands', rank: 'minor', color: '#a33a2a',
    sigil: { f: '#a33a2a', c: 'bird', cc: '#e8b923', d: 'chevron', t: '#141414' }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'edgerton', name: 'Edgerton', seat: 'Edgerton Tower', pos: [755, 1780], liege: 'baratheon', region: 'crownlands', rank: 'minor', color: '#8a4a1a',
    sigil: { f: '#8a4a1a', c: 'tower', cc: '#e9eef2', d: 'pale', t: '#1f3f7a' }, words: '' },
  // ───────────── iron_islands ─────────────
  // World of Ice & Fire, house list; atlas: Pebbleton
  { id: 'merlyn', name: 'Merlyn of Pebbleton', seat: 'Pebbleton', pos: [268, 1445], liege: 'greyjoy', region: 'iron_islands', rank: 'minor', color: '#3a6a7a',
    sigil: { f: '#3a6a7a', c: 'fish', cc: '#e8b923', d: 'chevron', t: '#a33a2a' }, words: '' },
  // World of Ice & Fire, house list: Lordsport, the port of Pyke
  { id: 'botley', name: 'Botley of Lordsport', seat: 'Lordsport', pos: [286, 1452], liege: 'greyjoy', region: 'iron_islands', rank: 'minor', color: '#3a6a7a',
    sigil: { f: '#3a6a7a', c: 'fish', cc: '#e9eef2', d: 'pale', t: '#141414' }, words: '' },
  // World of Ice & Fire, house list: the Lonely Light; position inferred
  { id: 'farwynd', name: 'Farwynd of the Lonely Light', seat: 'The Lonely Light', pos: [297, 1404], liege: 'greyjoy', region: 'iron_islands', rank: 'minor', color: '#a33a2a',
    sigil: { f: '#a33a2a', c: 'kraken', cc: '#e9eef2', d: 'plain', t: null }, words: '' },
  // World of Ice & Fire, house list: Great Wyk
  { id: 'goodbrother_sh', name: 'Goodbrother of Shatterstone', seat: 'Shatterstone', pos: [235, 1418], liege: 'greyjoy', region: 'iron_islands', rank: 'minor', color: '#6b3a7a',
    sigil: { f: '#6b3a7a', c: 'kraken', cc: '#e8b923', d: 'plain', t: null }, words: '' },
  // World of Ice & Fire, house list: Great Wyk
  { id: 'goodbrother_dd', name: 'Goodbrother of Downdelving', seat: 'Downdelving', pos: [223, 1434], liege: 'greyjoy', region: 'iron_islands', rank: 'minor', color: '#7a2a3a',
    sigil: { f: '#7a2a3a', c: 'kraken', cc: '#e8b923', d: 'plain', t: null }, words: '' },
  // World of Ice & Fire, house list: Great Wyk
  { id: 'goodbrother_cl', name: 'Goodbrother of Corpse Lake', seat: 'Corpse Lake', pos: [255, 1442], liege: 'greyjoy', region: 'iron_islands', rank: 'minor', color: '#6b3a7a',
    sigil: { f: '#6b3a7a', c: 'kraken', cc: '#e9eef2', d: 'chevron', t: '#3a6a7a' }, words: '' },
  // World of Ice & Fire, house list: Great Wyk; position inferred
  { id: 'goodbrother_cs', name: 'Goodbrother of Crow Spike Keep', seat: 'Crow Spike Keep', pos: [233, 1410], liege: 'greyjoy', region: 'iron_islands', rank: 'minor', color: '#141414',
    sigil: { f: '#141414', c: 'kraken', cc: '#e8b923', d: 'pale', t: '#3a6a7a' }, words: '' },
  // World of Ice & Fire, house list: Harlaw
  { id: 'harlaw_gg', name: 'Harlaw of Grey Garden', seat: 'Grey Garden', pos: [328, 1442], liege: 'harlaw', region: 'iron_islands', rank: 'minor', color: '#1f3f7a',
    sigil: { f: '#1f3f7a', c: 'tree', cc: '#e8b923', d: 'chevron', t: '#e8b923' }, words: '' },
  // World of Ice & Fire, house list: Harlaw
  { id: 'harlaw_hh', name: 'Harlaw of Harlaw Hall', seat: 'Harlaw Hall', pos: [342, 1412], liege: 'harlaw', region: 'iron_islands', rank: 'minor', color: '#7a2a3a',
    sigil: { f: '#7a2a3a', c: 'tower', cc: '#e8b923', d: 'bend', t: '#8a4a1a' }, words: '' },
  // World of Ice & Fire, house list: Harlaw
  { id: 'harlaw_hv', name: 'Harlaw of Harridan Hill', seat: 'Harridan Hill', pos: [329, 1430], liege: 'harlaw', region: 'iron_islands', rank: 'minor', color: '#8a4a1a',
    sigil: { f: '#8a4a1a', c: 'tower', cc: '#e9eef2', d: 'plain', t: null }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'myre', name: 'Myre', seat: 'Myre Hold', pos: [280, 1468], liege: 'greyjoy', region: 'iron_islands', rank: 'minor', color: '#3a6a7a',
    sigil: { f: '#3a6a7a', c: 'fish', cc: '#e9eef2', d: 'bend', t: '#1f3f7a' }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'sparr', name: 'Sparr', seat: 'Sparr Hall', pos: [221, 1427], liege: 'greyjoy', region: 'iron_islands', rank: 'minor', color: '#141414',
    sigil: { f: '#141414', c: 'spear', cc: '#e9eef2', d: 'plain', t: null }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'stonehouse', name: 'Stonehouse', seat: 'Stonehouse Hold', pos: [226, 1410], liege: 'greyjoy', region: 'iron_islands', rank: 'minor', color: '#6b3a7a',
    sigil: { f: '#6b3a7a', c: 'tower', cc: '#e8b923', d: 'pale', t: '#2d5a2a' }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'stonetree', name: 'Stonetree', seat: 'Stonetree Hold', pos: [242, 1445], liege: 'greyjoy', region: 'iron_islands', rank: 'minor', color: '#2d5a2a',
    sigil: { f: '#2d5a2a', c: 'tree', cc: '#e9eef2', d: 'fess', t: '#1f3f7a' }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'sunderly', name: 'Sunderly', seat: 'Sunderly Tower', pos: [232, 1403], liege: 'greyjoy', region: 'iron_islands', rank: 'minor', color: '#141414',
    sigil: { f: '#141414', c: 'axe', cc: '#e8b923', d: 'plain', t: null }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'tawney', name: 'Tawney', seat: 'Tawney Hall', pos: [286, 1414], liege: 'greyjoy', region: 'iron_islands', rank: 'minor', color: '#7a2a3a',
    sigil: { f: '#7a2a3a', c: 'spear', cc: '#e8b923', d: 'plain', t: null }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'volmark', name: 'Volmark', seat: 'Volmark Tower', pos: [312, 1415], liege: 'greyjoy', region: 'iron_islands', rank: 'minor', color: '#8a4a1a',
    sigil: { f: '#8a4a1a', c: 'tower', cc: '#e8b923', d: 'bend', t: '#e9eef2' }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'weaver', name: 'Weaver', seat: 'Weaver Hall', pos: [239, 1438], liege: 'greyjoy', region: 'iron_islands', rank: 'minor', color: '#1f3f7a',
    sigil: { f: '#1f3f7a', c: 'kraken', cc: '#e9eef2', d: 'plain', t: null }, words: '' },
  // World of Ice & Fire, house list: Iron Holt
  { id: 'wynch', name: 'Wynch of Iron Holt', seat: 'Iron Holt', pos: [270, 1462], liege: 'greyjoy', region: 'iron_islands', rank: 'minor', color: '#a33a2a',
    sigil: { f: '#a33a2a', c: 'fish', cc: '#e9eef2', d: 'chevron', t: '#3a6a7a' }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'codd', name: 'Codd', seat: 'Codd Tower', pos: [344, 1432], liege: 'greyjoy', region: 'iron_islands', rank: 'minor', color: '#7a2a3a',
    sigil: { f: '#7a2a3a', c: 'fish', cc: '#e9eef2', d: 'fess', t: '#141414' }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'humble', name: 'Humble', seat: 'Humble Hold', pos: [274, 1431], liege: 'greyjoy', region: 'iron_islands', rank: 'minor', color: '#e9eef2',
    sigil: { f: '#e9eef2', c: 'axe', cc: '#a33a2a', d: 'bend', t: '#141414' }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'netley', name: 'Netley', seat: 'Netley Hold', pos: [350, 1437], liege: 'greyjoy', region: 'iron_islands', rank: 'minor', color: '#6b3a7a',
    sigil: { f: '#6b3a7a', c: 'axe', cc: '#e8b923', d: 'plain', t: null }, words: '' },
  // World of Ice & Fire, house list; seat and position inferred
  { id: 'shepherd', name: 'Shepherd', seat: 'Shepherd Hold', pos: [341, 1419], liege: 'greyjoy', region: 'iron_islands', rank: 'minor', color: '#e9eef2',
    sigil: { f: '#e9eef2', c: 'axe', cc: '#a33a2a', d: 'plain', t: null }, words: '' },
  // ───────────── the clans ─────────────
  // Mountains of the Moon clans
  { id: 'burned_men', name: 'The Burned Men', seat: null, pos: [840, 1237], liege: null, region: 'vale', rank: 'tribe', color: '#e9eef2',
    sigil: { f: '#e9eef2', c: 'flame', cc: '#141414', d: 'plain', t: null }, words: '', landless: true, realmName: 'The clans of the Burned Men' },
  // Mountains of the Moon clans
  { id: 'black_ears', name: 'The Black Ears', seat: null, pos: [877, 1246], liege: null, region: 'vale', rank: 'tribe', color: '#a33a2a',
    sigil: { f: '#a33a2a', c: 'spear', cc: '#e9eef2', d: 'fess', t: '#2d5a2a' }, words: '', landless: true, realmName: 'The clans of the Black Ears' },
  // Mountains of the Moon clans
  { id: 'moon_brothers', name: 'The Moon Brothers', seat: null, pos: [826, 1238], liege: null, region: 'vale', rank: 'tribe', color: '#6b3a7a',
    sigil: { f: '#6b3a7a', c: 'moon', cc: '#e9eef2', d: 'chevron', t: '#8a4a1a' }, words: '', landless: true, realmName: 'The clans of the Moon Brothers' },
  // Mountains of the Moon clans
  { id: 'painted_dogs', name: 'The Painted Dogs', seat: null, pos: [868, 1219], liege: null, region: 'vale', rank: 'tribe', color: '#6b3a7a',
    sigil: { f: '#6b3a7a', c: 'dogs', cc: '#e8b923', d: 'fess', t: '#7a2a3a' }, words: '', landless: true, realmName: 'The clans of the Painted Dogs' },
  // A Storm of Swords / World of Ice & Fire: the Thenns, who live in the Frostfangs
  { id: 'thenns', name: 'The Thenns', seat: null, pos: [662, 438], liege: null, region: 'beyond', rank: 'tribe', color: '#1f3f7a',
    sigil: { f: '#1f3f7a', c: 'axe', cc: '#e9eef2', d: 'bend', t: '#8a4a1a' }, words: '', landless: true, realmName: 'The clans of the Thenns' },
];

// The clans' camps: a landless house is somewhere (its lord stands in the camp), as the Stone Crows' and the free folk's are
export const MORE_HOLDINGS = [
  ['burned_men_camp', "Camp of the Burned Men", 840, 1237, 'burned_men', 'camp'],
  ['black_ears_camp', "Camp of the Black Ears", 877, 1246, 'black_ears', 'camp'],
  ['moon_brothers_camp', "Camp of the Moon Brothers", 826, 1238, 'moon_brothers', 'camp'],
  ['painted_dogs_camp', "Camp of the Painted Dogs", 868, 1219, 'painted_dogs', 'camp'],
  ['thenn_valley', "The Thenn Valley", 662, 438, 'thenns', 'camp'],
];
export const MORE_ALIASES = { burned_men: 'burned_men_camp', black_ears: 'black_ears_camp', moon_brothers: 'moon_brothers_camp', painted_dogs: 'painted_dogs_camp', thenns: 'thenn_valley' };
