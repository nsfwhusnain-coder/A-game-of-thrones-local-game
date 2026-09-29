// Scratch generator for tests/fixtures/headlines/bad.json (not part of the repo).
import fs from 'node:fs';
const words = (h) => h.trim().split(/\s+/).length;

// the king's progress (a story no golden bundle tells): B3 and Pax #16
const KING = { facts: [{ id: 'f1.1', kind: 'set_out', actors: ['robert_baratheon'], houses: ['baratheon', 'stark'], place: 'baratheon', data: { party: 'kings_progress', to: 'stark', days: 40 }, importance: 3, title: 'The King rides north', text: 'The King\'s progress sets out from King\'s Landing for Winterfell (~40 days).' }], must: ['King Robert', 'Winterfell'], mustNot: [] };
const TALLHART = { facts: [{ id: 'f1.1', kind: 'host_joined', actors: ['helman_tallhart'], houses: ['tallhart', 'stark'], place: 'stark', data: { party: 'host_tallhart', joined: 'host_stark_banners', men: 499 }, importance: 2, text: '499 men under the Tallhart banner join The Banners of Stark at Winterfell. The host now numbers 896.' }], must: ['Tallhart', 'Winterfell'], mustNot: [] };
const HUNGRY = { facts: [{ id: 'f1.1', kind: 'host_hungry', actors: ['robb_stark'], houses: ['stark'], place: 'tully', data: { party: 'host_stark' }, importance: 3, text: 'The wagons of The Stark host are empty, and the fields about it are bare.' }], must: ['Robb Stark', 'Riverrun'], mustNot: [] };
const PACT = { facts: [{ id: 'f1.1', kind: 'pact_made', actors: ['hoster_tully', 'eddard_stark'], houses: ['tully', 'stark'], place: 'tully', data: { pact: 'p2', type: 'alliance' }, importance: 4, text: 'House Tully and House Stark make an alliance.' }], must: ['Hoster Tully', 'Eddard Stark'], mustNot: [] };
const TOURNEY_ONLY = { facts: [{ id: 'f1.1', kind: 'tourney', actors: ['robert_arryn'], houses: ['arryn'], place: 'arryn', data: { cost: 800, guests: 16 }, importance: 5, text: 'House Arryn holds a tourney at The Eyrie; 16 houses send knights.' }], must: ['Robert Arryn', 'Eyrie'], mustNot: [] };

const B = [];
const bad = (headline, summary, story, fails, note) => B.push({ headline, ...(summary ? { summary } : {}), story, fails, ...(note ? { note } : {}) });

// ── 18 §1.3, B1–B13: what the player read first ──
bad('Host of House Umber (150 men) is raised at Last Hearth', 'Host of House Umber (150 men) is raised at Last Hearth.', 'g-muster-02', 'boiler', 'B1: "is raised at"; the parentheses and the digits fail too');
bad('House Stark calls its banners: 19 sworn houses are summoned to Winterfell.', 'House Stark calls its banners: 19 sworn houses are summoned to Winterfell.', 'g-muster-01', 'punct', 'B2: a colon and a trailing full stop');
bad('The King rides north', 'The King rides north, bound for Winterfell. Men say he means to…', KING, 'punct', 'B3: the summary is cut mid-sentence with an ellipsis (the headline itself is fine: "The King" is an alias of King Robert)');
bad('House Arryn calls up 9,977 levies at The Eyrie', 'House Arryn calls up 9,977 levies at The Eyrie.', 'g-muster-03', 'numbers', 'B4: a digit string');
bad('Host of House Karstark sets out', 'Host of House Karstark, 1,796 strong, sets out from Karhold for Winterfell (~48 days).', 'g-march-02', 'numbers', 'B5: the ledger line as the summary');
bad('House The Free Folk calls up 45,000 levies at Mance Rayder\'s host', 'House The Free Folk calls up 45,000 levies at Mance Rayder\'s host.', 'g-muster-04', 'boiler', 'B6: "House The"');
bad('House Bolton begins works at The Dreadfort: charter a market & fair.', 'House Bolton begins works at The Dreadfort: charter a market & fair.', 'g-works-01', 'boiler', 'B7: "begins works at"');
bad('House Arryn holds a tourney at The Eyrie; 16 houses send knights', 'House Arryn holds a tourney at The Eyrie; 16 houses send knights.', 'g-tourney-01', 'punct', 'B8: a semicolon');
bad('House Tallhart joins The Banners of Stark', '499 men under the Tallhart banner join The Banners of Stark at Winterfell. The host now numbers 896.', TALLHART, 'boiler', 'B9: "Banners of", "the host now numbers"');
bad("Lady Hornwood refuses Stark's summons", "Men say he means to… Donella Hornwood refuses the summons. Her men will stay at home. Host of House Umber (150 men) is raised at Last Hearth. Elsewhere: Dickon Swann leaves Stonehelm with 30 knights and riders under the Swann banner, to feast with Sharna Fell at Felwood; Mace Tyrell leaves Highgarden with 160 knights.", 'g-refusal-01', 'len', 'B10: the turn summary, five ideas in one paragraph, cut with an ellipsis');
bad('Lords ride to feasts across the Reach', 'Elsewhere: Alester Florent leaves Brightwater Keep with 110 knights and riders under the Florent banner, to pay his respects to Mace Tyrell at Highgarden; Mace Tyrell leaves Highgarden with 160 knights and riders under the Tyrell banner, to feast with Paxter Redwyne at The Arbor; Randyll Tarly leaves Horn Hill with 90 knights, to feast with Mathis Rowan at Goldengrove.', 'g-meanwhile-01', 'numbers', 'B11: eight near-identical journeys with digits (and more than 340 characters)');
bad("House Lannister and House Stark meet in battle near The Twins; the field is House Lannister's.", null, 'g-battle-01', 'len', 'B12: sixteen words');
bad('Rickard Karstark is dead', 'Rickard Karstark, Lord of Karhold, has died of old age, aged 61.', 'g-death-01', 'numbers', 'B13: the summary gives an age in digits');

// ── 20 §5.2, the BAD column (rows already above: 1 = B1, 2 = B2, 5 = B6, 6 = B7, 7 = B8, 8 = B12, 9 = B13, 11 = B9, 13 = B4; row 4 is a roll-up, not a scorer matter) ──
bad('Host of House Karstark, 1,796 strong, sets out from Karhold for Winterfell (~48 days)', null, 'g-march-02', 'len', 'Pax 3: fourteen words');
bad('Rickard Karstark, Lord of Karhold, has died of old age, aged 61.', null, 'g-death-01', 'punct', 'Pax 10: a trailing full stop');
bad('Alester Florent leaves Brightwater Keep with 110 knights and riders under the Florent banner', null, 'g-march-03', 'numbers', 'Pax 12');
bad('Robb Stark is slain: cutting blow in the fighting.', null, 'g-slain-01', 'punct', 'Pax 14: a colon and a trailing full stop');
bad("House Baratheon of King's Landing holds a tourney", null, 'g-tourney-02', 'boiler', 'Pax 15: a raw house name with its place (BOILERPLATE must hold a "House X of Place" pattern)');
bad('The King rides north. Men say he means to...', null, KING, 'punct', 'Pax 16: a full stop inside and an ellipsis at the end');
bad('Refugees flee a besieged holding (mass event on the map)', null, 'g-siege-01', 'punct', 'Pax 17: parentheses');
bad('Supplies of the host are short; morale falls (2 cards)', null, HUNGRY, 'boiler', 'Pax 18: "morale" is a game word');
bad('Diplomacy: House Tully accepts the proposal of House Stark', null, PACT, 'punct', 'Pax 19: a colon');
bad('Raven received from The Eyrie (importance 3)', null, 'g-letter-01', 'punct', 'Pax 20: parentheses');

// ── our own, each aimed at one rule ──
bad('Lord Karstark marches south with his host and all his banners to Winterfell', null, 'g-march-02', 'len', 'thirteen words');
bad('Robb slain', null, 'g-slain-01', 'len', 'two words');
bad('Rickard Karstark dies unremarkably of extraordinarily advanced old age at Karhold', null, 'g-death-01', 'len', 'eleven words, but more than eighty characters');
bad('Lady Hornwood refuses Stark\'s summons', 'Lady Hornwood said no. Her men stayed at home. The others went on without her. Nobody minded.', 'g-refusal-01', 'len', 'four sentences');
bad('Tywin Lannister beats Roose Bolton at the Twins', 'The northmen came at the Lannister line across the ford at first light and broke on it, and the Lannister horse came out of the mist on their flank and rode them down among the reeds, and a great many of them died in the water before the rest could break away and run north along the river road, leaving their wagons, their banners and their wounded behind them for the Lannisters to gather up.', 'g-battle-01', 'len', 'a summary of more than 340 characters');
bad('The northern banners gather', null, 'g-muster-01', 'who', 'no name of the story');
bad('Lords gather their men for war', null, 'g-muster-05', 'who', 'no name of the story');
bad('The Freys march to war', null, 'g-battle-04', 'who', 'a house, but not one of this story');
bad('Ser Barristan raises the northern banners at Winterfell', null, 'g-muster-01', 'invented', 'the Kingsguard in a Stark muster');
bad('Lord Karstark marches for Riverrun', null, 'g-march-02', 'invented', 'a castle the story never names');
bad('Robb Stark slain by Jaime Lannister at the Twins', null, 'g-slain-01', 'invented', 'a name on the story\'s mustNot list (and not of the story)');
bad('Battle near the Twins', null, 'g-battle-01', 'verb', 'a noun phrase');
bad('The Lannister victory at the Twins', null, 'g-battle-01', 'verb', 'a noun phrase');
bad("The King's progress", null, KING, 'verb', 'a noun phrase (the lead\'s own example)');
bad('Tourney at the Eyrie', null, 'g-tourney-01', 'verb', 'a noun phrase');
bad('Robb Stark leads 2,100 men against Tywin Lannister', null, 'g-slain-01', 'numbers', 'a digit string');
bad("Three lords answer Stark's call with two thousand men each", null, 'g-muster-05', 'numbers', 'two numbers');
bad('Some forty thousand Northmen march for Winterfell', null, 'g-march-01', 'numbers', 'a number the story does not give');
bad('Lord Karstark marches south — at last', null, 'g-march-02', 'punct', 'an em dash');
bad('Lord Karstark marches south…', null, 'g-march-02', 'punct', 'an ellipsis');
bad("Lady Hornwood refuses Stark's summons.", null, 'g-refusal-01', 'punct', 'a trailing full stop');
bad("Lady Hornwood refuses Stark's summons (again)", null, 'g-refusal-01', 'punct', 'parentheses');
bad('Hornwood: Lady Donella refuses the summons', null, 'g-refusal-01', 'punct', 'a colon');
bad('Lady Hornwood refuses; her men stay at home', null, 'g-refusal-01', 'punct', 'a semicolon');
bad("Lady Hornwood refuses Stark's summons", 'Donella Hornwood will keep her men at home, and word of it…', 'g-refusal-01', 'punct', 'an ellipsis in the summary');
bad("Lady Hornwood refuses Stark's summons", 'Donella Hornwood will keep her men at home', 'g-refusal-01', 'punct', 'a summary that does not end with a full stop');
bad('Lord Umber answers the call with his banners', null, 'g-muster-02', 'boiler', '"answers the call with"');
bad('Lord Karstark sets out from Karhold for Winterfell', null, 'g-march-02', 'boiler', '"sets out from"');
bad('House Bolton begins works at the Dreadfort', null, 'g-works-01', 'boiler', '"begins works at"');
bad("Lord Umber's host is raised at Last Hearth", null, 'g-muster-02', 'boiler', '"is raised at"');
bad('Greatjon Umber raises his men at Last Hearth', 'The host now numbers some two thousand men.', 'g-muster-02', 'boiler', 'the summary says "the host now numbers"');
bad("Lord Karstark's morale rises at Karhold", null, 'g-march-02', 'boiler', 'a game word');
bad('House The Free Folk gathers beyond the Wall', null, 'g-muster-04', 'boiler', '"House The"');
bad('Lord Karstark marches south', "Karstark's morale is high, and the player has been told to expect him on the next turn.", 'g-march-02', 'boiler', 'game words in the summary');
bad('Tywin Lannister slain by Robb Stark at the Twins', null, 'g-slain-01', 'roles', 'slayer and slain reversed');
bad('Robb Stark slays Tywin Lannister at the Twins', null, 'g-slain-01', 'roles', 'slayer and slain reversed, active voice');
bad('Robb Stark captured by Jaime Lannister near Riverrun', null, 'g-capture-01', 'roles', 'captor and captive reversed');
bad('Roose Bolton beats Tywin Lannister at the Twins', null, 'g-battle-01', 'roles', 'victor and vanquished reversed');
bad('Ser Stevron Frey slays Addam Marbrand at Whitewalls', null, 'g-slain-02', 'roles', 'slayer and slain reversed');
bad("Robb Stark slain by Tywin Lannister at the Twins", 'Robb Stark slain by Tywin Lannister at the Twins.', 'g-slain-01', 'dup', 'the summary is the headline again');
bad('Karhold raises a new granary', 'Karhold raises a new granary.', 'g-works-03', 'dup', 'the summary is the headline again');
bad('Roose Bolton slain by Tywin Lannister at the Twins', null, 'g-battle-01', 'outcome', 'slain, but the story holds no death');
bad('Robb Stark crowned King in the North at Riverrun', null, 'g-battle-02', 'outcome', 'crowned, but the story holds no crowning');
bad('Riverrun falls to Jaime Lannister', null, 'g-siege-01', 'outcome', 'falls, but the siege has only begun');
bad('Kevan Lannister captured by Robb Stark at Riverrun', null, 'g-battle-02', 'outcome', 'captured, but no one was taken');
bad('Robert Arryn wins the tourney at the Eyrie', null, TOURNEY_ONLY, 'outcome', 'wins, but no result is in the story');

for (const b of B) { const n = words(b.headline); if (['len'].includes(b.fails) && !b.summary && b.headline.length <= 80 && n <= 12 && n >= 3) console.log('CHECK len', b.headline, n, b.headline.length); }
fs.writeFileSync('/home/user/wc-s1/tests/fixtures/headlines/bad.json', '[\n' + B.map((b) => '  ' + JSON.stringify(b)).join(',\n') + '\n]\n');
const c = {}; for (const b of B) c[b.fails] = (c[b.fails] || 0) + 1;
console.log(B.length, 'bad strings', c);
