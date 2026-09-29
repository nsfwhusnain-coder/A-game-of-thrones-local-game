// Scratch generator for tests/fixtures/headlines/golden.json (not part of the repo).
import fs from 'node:fs';
import { createInitialState } from '/home/user/wc-s1/public/js/shared/world.js';
import { KINDS } from '/home/user/wc-s1/public/js/engine/facts/kinds.js';
const s = createInitialState('agot_298', 'stark', { seed: 298 });
const nm = (id) => s.characters[id].name;
const hn = (id) => s.houses[id].name;
const pl = (id) => s.holdings[id].name;
const fmt = (n) => n.toLocaleString('en-GB');
const north = Object.values(s.houses).filter((h) => h.liege === 'stark').map((h) => h.id);

let seq = 0;
// a fact as the engine records it: the kind, who, where, the slots, the importance, and the engine's own words
const F = (kind, { a = [], h = [], p, d, i, ti, t, vis }) => {
  if (!KINDS[kind]) throw new Error('no kind ' + kind);
  const f = { id: `f1.${++seq}`, kind, actors: a, houses: h };
  if (p) { if (!s.holdings[p]) throw new Error('no holding ' + p); f.place = p; }
  if (d) f.data = d;
  f.importance = i ?? KINDS[kind].importance;
  if (ti) f.title = ti;
  if (t) f.text = t;
  if (vis) f.vis = vis;
  return f;
};
const B = [];
const add = (id, archetype, facts, o) => { seq = 0; B.push({ id, archetype, ...(o.hard ? { hard: o.hard } : {}), facts, must: o.must, mustNot: o.mustNot || [], maxWords: 12, verb: o.verb, reference: o.reference, summary: o.summary }); };
// facts are built before add() resets the counter, so build them inside a thunk
const G = (id, archetype, mk, o) => { seq = 0; const facts = mk(); B.push({ id, archetype, ...(o.hard ? { hard: o.hard } : {}), facts, must: o.must, mustNot: o.mustNot || [], maxWords: 12, verb: o.verb, reference: o.reference, summary: o.summary }); };

// ── battle ───────────────────────────────────────────────────────────────────────────────────────────────────────
G('g-battle-01', 'battle', () => [
  F('battle', { a: ['roose_bolton', 'tywin_lannister'], h: ['lannister', 'bolton'], p: 'frey', i: 4, ti: 'Lannister victorious near The Twins',
    d: { attacker: 'host_bolton', defender: 'host_lannister', winner: 'host_lannister', loser: 'host_bolton', winnerHouse: 'lannister', loserHouse: 'bolton', wiped: false, lost: { host_lannister: 1500, host_bolton: 3100 }, outcome: 'victory', decided: ['numbers and arms', 'generalship'], how: 'held the ford and threw the northmen back' },
    t: "Lord Tywin's host defeated The northern foot." })],
  { must: ['Tywin Lannister', 'Roose Bolton', 'Twins'], mustNot: ['Jaime', 'Riverrun', 'Robb'], verb: 'beats', reference: 'Tywin Lannister beats Roose Bolton at the Twins',
    summary: "The northmen came at the Lannister line across the ford and were thrown back with heavy loss. Lord Tywin's host held the field." });
G('g-battle-02', 'battle', () => [
  F('battle', { a: ['robb_stark', 'kevan_lannister'], h: ['stark', 'lannister'], p: 'tully', i: 5, ti: 'Stark victorious near Riverrun',
    d: { attacker: 'host_stark', defender: 'host_lannister_camp', winner: 'host_stark', loser: 'host_lannister_camp', winnerHouse: 'stark', loserHouse: 'lannister', wiped: false, lost: { host_stark: 700, host_lannister_camp: 4200 }, outcome: 'crushing', surprise: true, decided: ['surprise'], how: 'fell on the camps by night' },
    t: "The Young Wolf's host routed The siege camps." })],
  { must: ['Robb Stark', 'Riverrun'], mustNot: ['Jaime', 'Casterly Rock'], verb: 'breaks', reference: 'Robb Stark breaks the Lannister camps at Riverrun',
    summary: 'The riders came down on the sleeping siege lines by night. Before dawn the besiegers were scattered.' });
G('g-battle-03', 'battle', () => [
  F('battle', { a: ['addam_marbrand', 'edmure_tully'], h: ['lannister', 'tully'], p: 'butterwell', i: 4, ti: 'A bloody draw near Whitewalls',
    d: { attacker: 'host_marbrand', defender: 'host_tully', winner: null, loser: null, wiped: false, lost: { host_marbrand: 1800, host_tully: 1700 }, outcome: 'drawn', decided: [], how: 'neither side would yield the field' },
    t: 'The host of Lannister and The host of Tully fought near Whitewalls until neither could fight on.' })],
  { must: ['Addam Marbrand', 'Edmure Tully', 'Whitewalls'], mustNot: ['Tywin', 'Robb'], verb: 'fight', reference: 'Addam Marbrand and Edmure Tully fight to a draw near Whitewalls',
    summary: 'Neither would give way, and at dusk both drew off to count their dead.' });
G('g-battle-04', 'battle', () => [
  F('battle', { a: ['tywin_lannister', 'theon_greyjoy'], h: ['lannister', 'stark'], p: 'butterwell', i: 5, ti: 'Lannister victorious near Whitewalls',
    d: { attacker: 'host_lannister', defender: 'host_stark_van', winner: 'host_lannister', loser: 'host_stark_van', winnerHouse: 'lannister', loserHouse: 'stark', wiped: false, lost: { host_lannister: 1500, host_stark_van: 3100 }, outcome: 'crushing', caught: true, decided: ['numbers and arms', 'generalship'], how: 'broke the line at the first charge' },
    t: "Lord Tywin's host routed The Stark van." })],
  { hard: ['party'], must: ['Tywin Lannister', 'Whitewalls'], mustNot: ['Robb'], verb: 'beats', reference: 'Tywin Lannister beats the Stark host near Whitewalls',
    summary: 'The Stark line broke at the first charge and never re-formed. Theon Greyjoy commanded it.' });

// ── death in battle ──────────────────────────────────────────────────────────────────────────────────────────────
G('g-slain-01', 'death-in-battle', () => [
  F('slain_in_battle', { a: ['robb_stark'], h: ['stark'], p: 'frey', i: 5, d: { cause: 'killed in battle near The Twins', by: 'tywin_lannister', how: 'charged into the Lannister centre' }, t: 'Robb Stark is slain — killed in battle near The Twins.' })],
  { must: ['Robb Stark', 'Tywin Lannister', 'Twins'], mustNot: ['Jaime', 'Riverrun'], verb: 'slain', reference: 'Robb Stark slain by Tywin Lannister at the Twins',
    summary: 'Robb charged into the Lannister centre and was cut down there.' });
G('g-slain-02', 'death-in-battle', () => [
  F('slain_in_battle', { a: ['stevron_frey'], h: ['frey'], p: 'butterwell', i: 4, d: { cause: 'killed in battle near Whitewalls', by: 'addam_marbrand', how: 'caught in open ground by the first charge' }, t: 'Ser Stevron Frey is slain — killed in battle near Whitewalls.' })],
  { must: ['Stevron Frey', 'Addam Marbrand', 'Whitewalls'], mustNot: ['Walder', 'Robb'], verb: 'slain', reference: 'Ser Stevron Frey slain by Addam Marbrand at Whitewalls',
    summary: 'The Frey column was caught on open ground, and their heir fell in the first Lannister charge.' });
G('g-slain-03', 'death-in-battle', () => [
  F('slain_in_battle', { a: ['vardis_egen'], h: ['arryn'], p: 'bloody_gate', i: 4, d: { cause: 'killed in battle near The Bloody Gate', how: 'held the gate against the clansmen' }, t: 'Ser Vardis Egen is slain — killed in battle near The Bloody Gate.' })],
  { must: ['Vardis Egen', 'Bloody Gate'], mustNot: ['Robb', 'Winterfell'], verb: 'slain', reference: 'Ser Vardis Egen slain at the Bloody Gate',
    summary: 'Egen held the gate against the clansmen until he was killed.' });
G('g-slain-04', 'death-in-battle', () => [
  F('slain_in_battle', { a: ['greatjon_umber'], h: ['umber'], p: 'butterwell', i: 4, d: { cause: 'killed in battle near Whitewalls', by: 'gregor_clegane', how: 'ridden down in the open' }, t: 'Jon "Greatjon" Umber is slain — killed in battle near Whitewalls.' })],
  { hard: ['byname'], must: ['Umber', 'Gregor Clegane', 'Whitewalls'], mustNot: ['Smalljon'], verb: 'slain', reference: 'Lord Umber slain by Gregor Clegane near Whitewalls',
    summary: "Clegane's riders ran down the Umber column in open country. The lord fell at the head of it." });

// ── death by age, illness, wound ─────────────────────────────────────────────────────────────────────────────────
G('g-death-01', 'death-natural', () => [
  F('death', { a: ['rickard_karstark'], h: ['karstark'], p: 'karstark', i: 4, ti: 'Rickard Karstark is dead', d: { cause: 'old age', age: 61, how: 'age' }, t: 'Rickard Karstark, Lord of Karhold, has died of old age, aged 61.' }),
  F('succession', { a: ['harrion_karstark'], h: ['karstark'], p: 'karstark', i: 4, t: 'Harrion Karstark is now head of House Karstark.' })],
  { must: ['Rickard Karstark', 'Karhold'], mustNot: ['Winterfell', 'Umber'], verb: 'dies', reference: 'Rickard Karstark dies of old age at Karhold',
    summary: "The old lord's years caught up with him. His son Harrion now holds the seat." });
G('g-death-02', 'death-natural', () => [
  F('death', { a: ['old_nan'], h: ['stark'], p: 'stark', i: 3, ti: 'Old Nan is dead', d: { cause: 'old age', age: 95, how: 'age' }, t: 'Old Nan, Nursemaid, has died of old age, aged 95.' })],
  { must: ['Old Nan', 'Winterfell'], mustNot: ['Eddard', 'Robb'], verb: 'dies', reference: 'Old Nan dies at Winterfell',
    summary: 'She had nursed three generations of Starks and died of old age.' });
G('g-death-03', 'death-natural', () => [
  F('death', { a: ['luwin'], h: ['stark'], p: 'stark', i: 3, ti: 'Maester Luwin is dead', d: { cause: 'a fever', age: 60, how: 'fever' }, t: 'Maester Luwin, Maester of Winterfell, has died of a fever, aged 60.' })],
  { must: ['Luwin', 'Winterfell'], mustNot: ['Eddard', 'Riverrun'], verb: 'dies', reference: 'Maester Luwin dies of a fever at Winterfell',
    summary: 'The fever came on in the week, and the maester did not recover from it.' });
G('g-death-04', 'death-natural', () => [
  F('death', { a: ['rodrik_cassel'], h: ['stark'], p: 'stark', i: 3, ti: 'Ser Rodrik Cassel is dead', d: { cause: 'a festering wound', age: 60, how: 'wound' }, t: "Ser Rodrik Cassel's wound festered, and the maesters could not save him." })],
  { must: ['Rodrik Cassel', 'Winterfell'], mustNot: ['Eddard', 'Riverrun'], verb: 'dies', reference: 'Ser Rodrik Cassel dies of his wound at Winterfell',
    summary: 'His wound festered, and the maesters could not save him.' });

// ── execution ────────────────────────────────────────────────────────────────────────────────────────────────────
G('g-exec-01', 'execution', () => [
  F('executed', { a: ['amory_lorch'], h: ['lannister'], p: 'stark', i: 5, d: { cause: 'beheaded for murder', by: 'eddard_stark', how: 'beheaded' }, t: 'Ser Amory Lorch is put to death — beheaded for murder.' })],
  { must: ['Eddard Stark', 'Amory Lorch', 'Winterfell'], mustNot: ['Robb', 'Riverrun'], verb: 'beheads', reference: 'Eddard Stark beheads Ser Amory Lorch at Winterfell',
    summary: 'The knight was condemned for murder and beheaded that day.' });
G('g-exec-02', 'execution', () => [
  F('executed', { a: ['gerold_dayne'], h: ['dayne'], p: 'tarly', i: 5, d: { cause: 'hanged for raiding', by: 'randyll_tarly', how: 'hanged' }, t: 'Ser Gerold Dayne is put to death — hanged for raiding.' })],
  { must: ['Gerold Dayne', 'Randyll Tarly', 'Horn Hill'], mustNot: ['Mace', 'Highgarden'], verb: 'hanged', reference: 'Ser Gerold Dayne hanged by Randyll Tarly at Horn Hill',
    summary: 'The raider was condemned by the lord of the castle and hanged.' });
G('g-exec-03', 'execution', () => [
  F('executed', { a: ['dontos_hollard'], h: ['baratheon'], p: 'baratheon', i: 5, d: { cause: "beheaded on the King's word", by: 'ilyn_payne', how: 'beheaded' }, t: "Ser Dontos Hollard is put to death — beheaded on the King's word." })],
  { must: ['Ilyn Payne', 'Dontos Hollard', "King's Landing"], mustNot: ['Eddard', 'Winterfell'], verb: 'beheads', reference: "Ilyn Payne beheads Ser Dontos Hollard at King's Landing",
    summary: 'The sentence was carried out at once by the royal justice.' });

// ── capture ──────────────────────────────────────────────────────────────────────────────────────────────────────
G('g-capture-01', 'capture', () => [
  F('battle', { a: ['robb_stark', 'jaime_lannister'], h: ['stark', 'lannister'], p: 'tully', i: 5, ti: 'Stark victorious near Riverrun',
    d: { attacker: 'host_stark_riders', defender: 'host_lannister_jaime', winner: 'host_stark_riders', loser: 'host_lannister_jaime', winnerHouse: 'stark', loserHouse: 'lannister', wiped: false, lost: { host_stark_riders: 500, host_lannister_jaime: 3000 }, outcome: 'crushing', surprise: true, decided: ['surprise'], how: 'fell on the camp from the trees at night' },
    t: "Robb Stark's riders routed The Kingslayer's host; Jaime Lannister was taken captive." }),
  F('captured_in_battle', { a: ['jaime_lannister'], h: ['lannister'], p: 'tully', i: 5, d: { by: 'robb_stark', note: 'Taken captive in battle near Riverrun', how: 'taken with his household knights' }, t: 'Ser Jaime Lannister is taken captive on the field.' })],
  { must: ['Jaime Lannister', 'Robb Stark'], mustNot: ['Tywin', 'Casterly Rock'], verb: 'captured', reference: 'Jaime Lannister captured by Robb Stark near Riverrun',
    summary: 'The riders fell on the Lannister camp from the trees at night. Jaime was taken with his household knights.' });
G('g-capture-02', 'capture', () => [
  F('captured_in_battle', { a: ['theon_greyjoy'], h: ['greyjoy'], p: 'butterwell', i: 4, d: { by: 'tywin_lannister', note: 'Taken captive in battle near Whitewalls', how: 'taken when the line broke' }, t: 'Theon Greyjoy is taken captive on the field.' })],
  { must: ['Theon Greyjoy', 'Tywin Lannister', 'Whitewalls'], mustNot: ['Balon', 'Pyke'], verb: 'captured', reference: 'Theon Greyjoy captured by Tywin Lannister near Whitewalls',
    summary: 'He was taken when the Stark line broke.' });
G('g-capture-03', 'capture', () => [
  F('captured', { a: ['edmure_tully'], h: ['tully'], p: 'darry', i: 4, d: { by: 'lannister', note: 'Taken in battle at the fords' }, t: 'Edmure Tully is taken captive and held by House Lannister.' })],
  { must: ['Edmure Tully', 'Darry'], mustNot: ['Robb', 'Winterfell'], verb: 'captured', reference: 'Edmure Tully captured by the Lannisters at Darry',
    summary: 'He was taken at the fords and is held by the enemy now.' });

// ── siege begun ──────────────────────────────────────────────────────────────────────────────────────────────────
G('g-siege-01', 'siege-begun', () => [
  F('siege_begun', { a: ['jaime_lannister'], h: ['lannister', 'tully'], p: 'tully', i: 4, ti: 'The siege of Riverrun', d: { holding: 'tully', by: 'lannister', men: 15000 }, t: 'The Host of the West (15,000 men) sits before the walls of Riverrun.' })],
  { must: ['Jaime Lannister', 'Riverrun'], mustNot: ['Tywin', 'Robb'], verb: 'besieges', reference: 'Jaime Lannister besieges Riverrun',
    summary: 'Some fifteen thousand Lannister men now sit before the walls of the castle. The Tully garrison is shut inside.' });
G('g-siege-02', 'siege-begun', () => [
  F('siege_begun', { a: ['gregor_clegane'], h: ['clegane', 'whent'], p: 'whent', i: 3, ti: 'The siege of Harrenhal', d: { holding: 'whent', by: 'clegane', men: 3000 }, t: "The Mountain's Men (3,000 men) sits before the walls of Harrenhal." })],
  { must: ['Gregor Clegane', 'Harrenhal'], mustNot: ['Tywin', 'Robb'], verb: 'lays', reference: 'Gregor Clegane lays siege to Harrenhal',
    summary: 'About three thousand men have drawn up before the walls of the old castle.' });
G('g-siege-03', 'siege-begun', () => [
  F('siege_begun', { a: ['stannis_baratheon'], h: ['baratheon_ds', 'baratheon_se'], p: 'baratheon_se', i: 4, ti: "The siege of Storm's End", d: { holding: 'baratheon_se', by: 'baratheon_ds', men: 4000 }, t: "The Dragonstone Host (4,000 men) sits before the walls of Storm's End." })],
  { hard: ['suffix-house'], must: ['Stannis Baratheon', "Storm's End"], mustNot: ['Renly', 'Tyrell'], verb: 'besieges', reference: "Stannis Baratheon besieges Storm's End",
    summary: "A host from Dragonstone sits before the gates, and the castle's gates are closed against it." });

// ── siege fell ───────────────────────────────────────────────────────────────────────────────────────────────────
G('g-fell-01', 'siege-fell', () => [
  F('holding_fell', { a: ['tywin_lannister', 'shella_whent'], h: ['lannister', 'whent'], p: 'whent', i: 4, ti: 'Harrenhal yields', d: { holding: 'whent', by: 'lannister', how: 'starved', terms: 'yield_and_swear', kept: true }, t: 'Harrenhal yields, starved, to The Host of the West. House Lannister holds it now.' })],
  { must: ['Harrenhal', 'Tywin Lannister'], mustNot: ['Robb', 'Winterfell'], verb: 'falls', reference: 'Harrenhal falls to Tywin Lannister',
    summary: 'The stores ran out before relief came. Lady Whent gave up the castle, and the Lannisters hold it now.' });
G('g-fell-02', 'siege-fell', () => [
  F('holding_fell', { a: ['stannis_baratheon', 'cortnay_penrose'], h: ['baratheon_ds', 'baratheon_se'], p: 'baratheon_se', i: 4, ti: "Storm's End betrayed", d: { holding: 'baratheon_se', by: 'baratheon_ds', how: 'betrayed', terms: null, kept: false }, t: "Storm's End is betrayed: a postern opens in the night, and House Baratheon of Dragonstone holds it by dawn." })],
  { hard: ['suffix-house'], must: ["Storm's End", 'Stannis Baratheon'], mustNot: ['Renly', 'Tyrell'], verb: 'betrayed', reference: "Storm's End betrayed to Stannis Baratheon in the night",
    summary: 'A postern was opened from within, and the walls were held by dawn.' });
G('g-fell-03', 'siege-fell', () => [
  F('storm_assault', { a: ['gregor_clegane'], h: ['clegane', 'darry'], p: 'darry', i: 4, ti: 'Darry is stormed', d: { holding: 'darry', by: 'clegane', carried: true, lost: 400, odds: 1.3 }, t: "The Mountain's Men carries the walls of Darry by storm. House Clegane holds it now." })],
  { must: ['Gregor Clegane', 'Darry'], mustNot: ['Robb', 'Winterfell'], verb: 'storms', reference: 'Gregor Clegane storms Darry',
    summary: 'The walls were carried at dawn with ladders and rams. The attackers lost some four hundred men on them.' });

// ── muster ───────────────────────────────────────────────────────────────────────────────────────────────────────
G('g-muster-01', 'muster', () => [
  F('levies_called', { a: ['eddard_stark'], h: ['stark', ...north], p: 'stark', i: 5, d: { vassals: north, muster: 'stark' }, t: 'House Stark calls its banners: 19 sworn houses are summoned to Winterfell.' })],
  { must: ['Eddard Stark', 'Winterfell'], mustNot: ['Barristan', 'Robert', 'Riverrun'], verb: 'calls', reference: 'Eddard Stark calls the northern banners to Winterfell',
    summary: 'Nineteen sworn houses are told to bring their men to the castle.' });
G('g-muster-02', 'muster', () => [
  F('host_formed', { a: ['greatjon_umber'], h: ['umber'], p: 'umber', i: 3, d: { party: 'host_umber', men: 150, kind: 'host' }, t: 'Host of House Umber (150 men) is raised at Last Hearth.' }),
  F('call_answered', { a: ['greatjon_umber'], h: ['umber', 'stark'], p: 'umber', i: 3, ti: 'House Umber answers the call', d: { men: 2000, party: 'host_umber', to: 'stark', depart: 12 }, t: 'Jon "Greatjon" Umber answers the call with 2,000 men; they gather at Last Hearth and march for The Banners of Stark in about 12 days.' })],
  { hard: ['byname'], must: ['Greatjon Umber', 'Last Hearth'], mustNot: ['Smalljon', 'Karstark'], verb: 'raises', reference: 'Greatjon Umber raises his men at Last Hearth',
    summary: "Lord Umber's men are gathering at his seat. Some two thousand will march for Winterfell once they are all in." });
G('g-muster-03', 'muster', () => [
  F('levies_called', { a: ['lysa_arryn'], h: ['arryn'], p: 'arryn', i: 4, d: { party: 'host_arryn', men: 9977, now: 1200 }, t: 'House Arryn calls up 9,977 levies at The Eyrie; 8,777 of them are still coming in from the fields.' })],
  { must: ['Lysa Arryn', 'Eyrie'], mustNot: ['Robb', 'Riverrun'], verb: 'raises', reference: "Lysa Arryn raises the Vale's banners at the Eyrie",
    summary: 'Nearly ten thousand men are called to the castle. Nothing yet says against whom they will march.' });
G('g-muster-04', 'muster', () => [
  F('levies_called', { a: ['mance_rayder'], h: ['free_folk'], p: 'free_folk', i: 4, d: { party: 'free_folk_host', men: 45000, now: 6000 }, t: "House The Free Folk calls up 45,000 levies at Mance Rayder's host; 39,000 of them are still coming in from the fields." }),
  F('host_formed', { a: ['mance_rayder'], h: ['free_folk'], p: 'free_folk', i: 3, d: { party: 'free_folk_host', men: 6000, kind: 'host' }, t: "The Host of Mance Rayder (6,000 men) is raised at Mance Rayder's host." })],
  { hard: ['free-folk'], must: ['Mance Rayder'], mustNot: ['Winterfell', 'Robb'], verb: 'gathers', reference: 'Mance Rayder gathers the wildlings beyond the Wall',
    summary: 'A great host of wildlings is answering his call.' });
G('g-muster-05', 'muster', () => {
  const facts = [F('levies_called', { a: ['eddard_stark'], h: ['stark', ...north], p: 'stark', i: 5, d: { vassals: north, muster: 'stark' }, t: 'House Stark calls its banners: 19 sworn houses are summoned to Winterfell.' })];
  north.forEach((id, k) => {
    const h = s.houses[id]; const men = Math.round(Math.min(h.levyCap * 0.5, 2000) / 50) * 50; const days = 8 + ((k * 3) % 14);
    facts.push(F('call_answered', { a: [h.lord], h: [id, 'stark'], p: h.seat, i: 3, ti: `House ${h.name} answers the call`, d: { men, party: `host_${id}`, to: 'stark', depart: days }, t: `${nm(h.lord)} answers the call with ${fmt(men)} men; they gather at ${pl(h.seat)} and march for The Banners of Stark in about ${days} days.` }));
  });
  facts.push(F('host_formed', { a: ['eddard_stark'], h: ['stark'], p: 'stark', i: 3, d: { party: 'host_stark', men: 4000, kind: 'host' }, t: 'The Banners of Stark (4,000 men) is raised at Winterfell.' }));
  return facts;
}, { hard: ['21-facts'], must: ['Stark'], mustNot: ['Barristan', 'Robert'], verb: 'answer', reference: "Nineteen northern houses answer Stark's call",
  summary: 'The Umbers, Manderlys, Karstarks and Boltons gathered their men and took the road to Winterfell. Each lord brought what his lands could spare.' });

// ── march ────────────────────────────────────────────────────────────────────────────────────────────────────────
const setOut = (id, k, to = 'stark', i = 2) => {
  const h = s.houses[id]; const men = Math.round(Math.min(h.levyCap * 0.45, 3300)); const days = 20 + ((k * 7) % 30);
  return F('set_out', { a: [h.lord], h: [id, 'stark'], p: h.seat, i, ti: `Host of House ${h.name} sets out`, d: { party: `host_${id}`, to, eta: days, days }, t: `Host of House ${h.name}, ${fmt(men)} strong, sets out from ${pl(h.seat)} for The Banners of Stark (~${days} days).` });
};
G('g-march-01', 'march', () => ['karstark', 'umber', 'manderly', 'locke', 'wull', 'dustin'].map((id, k) => setOut(id, k)),
  { must: ['Winterfell'], mustNot: ['Barristan', 'Riverrun'], verb: 'march', reference: 'Six northern houses march for Winterfell',
    summary: 'Karstark, Umber and Manderly were the first on the road, and the Karstarks have the longest way to come.' });
G('g-march-02', 'march', () => [
  F('set_out', { a: ['rickard_karstark'], h: ['karstark', 'stark'], p: 'karstark', i: 2, ti: 'Host of House Karstark sets out', d: { party: 'host_karstark', to: 'stark', eta: 48, days: 48 }, t: 'Host of House Karstark, 1,796 strong, sets out from Karhold for The Banners of Stark (~48 days).' })],
  { must: ['Karstark'], mustNot: ['Umber', 'Riverrun'], verb: 'marches', reference: 'Lord Karstark marches south with his host',
    summary: 'The road to Winterfell is long, and the host will be on it for the better part of two months.' });
G('g-march-03', 'march', () => [
  F('set_out', { a: ['alester_florent'], h: ['florent', 'tyrell'], p: 'florent', i: 1, d: { party: 'rider_florent', to: 'tyrell', days: 6 }, t: 'Alester Florent leaves Brightwater Keep with 110 knights and riders under the Florent banner, to pay his respects to Mace Tyrell at Highgarden.' })],
  { must: ['Alester Florent', 'Highgarden'], mustNot: ['Robb', 'Winterfell'], verb: 'rides', reference: 'Alester Florent rides to Highgarden',
    summary: 'He goes to pay his respects to the lord of Highgarden.' });
G('g-march-04', 'march', () => {
  const ids = [...north, 'umber', 'karstark']; // nineteen hosts, and a second column each from Umber and Karstark
  return ids.map((id, k) => (k < 19 ? setOut(id, k) : (() => { const f = setOut(id, k); f.actors = [id === 'umber' ? 'smalljon_umber' : 'harrion_karstark']; return f; })()));
}, { hard: ['21-same-kind'], must: ['Winterfell'], mustNot: ['Barristan', 'Riverrun'], verb: 'march', reference: 'Lords from across the North march for Winterfell',
  summary: 'Every sworn lord of the North has put his host on the road. The nearest will reach Winterfell in days; the farthest have weeks to go.' });
G('g-march-05', 'march', () => [
  F('embarked', { a: ['stannis_baratheon'], h: ['baratheon'], p: 'baratheon', i: 2, d: { party: 'royal_fleet', to: 'baratheon_ds' }, t: "The Royal Fleet embarks at King's Landing for Dragonstone." })],
  { hard: ['party'], must: ['Stannis Baratheon', 'Royal Fleet'], mustNot: ['Robb', 'Winterfell'], verb: 'sails', reference: 'Stannis Baratheon sails the Royal Fleet to Dragonstone',
    summary: "The fleet left the harbour of King's Landing with its lord admiral at its head." });

// ── refusal ──────────────────────────────────────────────────────────────────────────────────────────────────────
G('g-refusal-01', 'refusal', () => [
  F('call_refused', { a: ['donella_hornwood'], h: ['hornwood'], p: 'hornwood', i: 4, ti: 'House Hornwood refuses the call', d: { why: 'the harvest is not yet in' }, vis: { scope: 'houses' }, t: 'Donella Hornwood refuses the summons. Her men will stay at home.' })],
  { must: ['Hornwood'], mustNot: ['Barristan', 'Karstark'], verb: 'refuses', reference: "Lady Hornwood refuses Stark's summons",
    summary: 'Donella Hornwood will keep her men at home, saying the harvest is not yet in.' });
G('g-refusal-02', 'refusal', () => [
  F('call_refused', { a: ['rickard_wull'], h: ['wull'], p: 'wull', i: 4, ti: 'House Wull refuses the call', d: { why: 'the clansmen will not leave the mountains' }, vis: { scope: 'houses' }, t: 'Rickard Wull refuses the summons. His men will stay at home.' })],
  { must: ['Wull'], mustNot: ['Barristan', 'Karstark'], verb: 'turns', reference: "Lord Wull turns down Stark's call to arms",
    summary: 'His clansmen will not leave the mountains, and his men will stay at home.' });
G('g-refusal-03', 'refusal', () => [
  F('call_refused', { a: ['jonos_bracken'], h: ['bracken'], p: 'bracken', i: 4, ti: 'House Bracken refuses the call', d: { why: 'an old quarrel with the Blackwoods' }, vis: { scope: 'houses' }, t: 'Jonos Bracken refuses the summons. His men will stay at home.' })],
  { must: ['Jonos Bracken', 'Stone Hedge'], mustNot: ['Robb', 'Winterfell'], verb: 'refuses', reference: 'Jonos Bracken refuses the summons at Stone Hedge',
    summary: 'He cites an old quarrel with the Blackwoods and will keep his men at home.' });

// ── betrothal / wedding ──────────────────────────────────────────────────────────────────────────────────────────
G('g-wed-01', 'wedding', () => [
  F('betrothal', { a: ['joffrey_baratheon', 'sansa_stark'], h: ['baratheon', 'stark'], i: 4, d: { pact: 'p1', type: 'marriage' }, t: 'Joffrey Baratheon is betrothed to Sansa Stark.' })],
  { must: ['Joffrey Baratheon', 'Sansa Stark'], mustNot: ['Tommen', 'Robb'], verb: 'betrothed', reference: 'Joffrey Baratheon betrothed to Sansa Stark',
    summary: 'The match binds the crown to the North.' });
G('g-wed-02', 'wedding', () => [
  F('wedding', { a: ['renly_baratheon', 'margaery_tyrell'], h: ['baratheon_se', 'tyrell'], p: 'tyrell', i: 3, t: 'Renly Baratheon and Margaery Tyrell are wed.' })],
  { hard: ['suffix-house'], must: ['Renly Baratheon', 'Margaery Tyrell', 'Highgarden'], mustNot: ['Loras', 'Robert'], verb: 'weds', reference: 'Renly Baratheon weds Margaery Tyrell at Highgarden',
    summary: 'The match ties the stormlands to the Reach.' });
G('g-wed-03', 'wedding', () => [
  F('wedding', { a: ['robb_stark', 'jeyne_westerling'], h: ['stark', 'westerling'], p: 'westerling', i: 5, t: 'Robb Stark and Jeyne Westerling are wed.' })],
  { must: ['Robb Stark', 'Jeyne Westerling', 'Crag'], mustNot: ['Frey', 'Walder'], verb: 'weds', reference: 'Robb Stark weds Jeyne Westerling at the Crag',
    summary: 'Jeyne is the daughter of a small western house.' });

// ── crowning ─────────────────────────────────────────────────────────────────────────────────────────────────────
G('g-crown-01', 'crowning', () => [
  F('crowned', { a: ['robb_stark'], h: ['stark'], p: 'tully', i: 5, d: { title: 'King in the North', outcome: 'crowned', victory: true }, t: 'Robb Stark is crowned King in the North at Riverrun.' })],
  { must: ['Robb Stark', 'Riverrun'], mustNot: ['Robert', 'Tywin'], verb: 'crowned', reference: 'Robb Stark crowned King in the North at Riverrun',
    summary: 'The northern lords named him their king.' });
G('g-crown-02', 'crowning', () => [
  F('claim_proclaimed', { a: ['stannis_baratheon'], h: ['baratheon_ds'], p: 'baratheon_ds', i: 5, d: { title: 'King of the Andals and the First Men' }, t: 'House Baratheon of Dragonstone proclaims: King of the Andals and the First Men.' })],
  { hard: ['suffix-house'], must: ['Stannis Baratheon', 'Dragonstone'], mustNot: ['Renly', 'Robb'], verb: 'proclaims', reference: 'Stannis Baratheon proclaims himself king at Dragonstone',
    summary: 'The lord of Dragonstone styles himself king of the Andals and the First Men.' });
G('g-crown-03', 'crowning', () => [
  F('crowned', { a: ['joffrey_baratheon'], h: ['baratheon'], p: 'baratheon', i: 5, d: { title: 'King of the Andals and the First Men', outcome: 'crowned', victory: true }, t: "Joffrey Baratheon is crowned King of the Andals and the First Men at King's Landing." })],
  { hard: ['suffix-house'], must: ['Joffrey Baratheon', "King's Landing"], mustNot: ['Robb', 'Winterfell'], verb: 'crowned', reference: "Joffrey Baratheon crowned king at King's Landing",
    summary: 'The Iron Throne has a new king.' });

// ── letter ───────────────────────────────────────────────────────────────────────────────────────────────────────
G('g-letter-01', 'letter', () => [
  F('letter_arrived', { a: ['lysa_arryn', 'catelyn_stark'], h: ['arryn', 'stark'], i: 3, d: { from: 'lysa_arryn', to: 'catelyn_stark' }, t: 'Lysa Arryn writes to Catelyn Stark.' })],
  { must: ['Lysa Arryn', 'Catelyn Stark'], mustNot: ['Robb', 'Tywin'], verb: 'writes', reference: 'Lysa Arryn writes to Catelyn Stark',
    summary: "The letter came by raven and was put into Catelyn's own hands." });
G('g-letter-02', 'letter', () => [
  F('letter_arrived', { a: ['hoster_tully', 'eddard_stark'], h: ['tully', 'stark'], p: 'stark', i: 3, d: { raven: 'r1', from: 'hoster_tully' }, t: 'A raven from Hoster Tully reaches Eddard Stark at Winterfell.' })],
  { must: ['Hoster Tully', 'Eddard Stark', 'Winterfell'], mustNot: ['Robb', 'Tywin'], verb: 'reaches', reference: 'Raven from Hoster Tully reaches Eddard Stark at Winterfell',
    summary: 'The bird came in the night with a message sealed by the Tully lord.' });
G('g-letter-03', 'letter', () => [
  F('letter_sent', { a: ['eddard_stark', 'robert_baratheon'], h: ['stark', 'baratheon'], i: 2, d: { to: 'robert_baratheon', days: 14, post: 'r2' }, vis: { scope: 'houses', houses: ['stark', 'baratheon'] }, t: 'A raven flies from Eddard Stark to Robert Baratheon (~14 days).' })],
  { must: ['Eddard Stark', 'King Robert'], mustNot: ['Robb', 'Tywin'], verb: 'writes', reference: 'Eddard Stark writes to King Robert',
    summary: 'The raven flies south and will take about two weeks.' });

// ── rumour ───────────────────────────────────────────────────────────────────────────────────────────────────────
G('g-rumour-01', 'rumour', () => [
  F('rumour', { a: ['roose_bolton'], h: ['bolton'], p: 'bolton', i: 3, ti: 'Whispers about House Bolton', vis: { scope: 'houses', houses: ['stark'] }, t: 'Word reaches you that Roose Bolton has been talking with strangers at the Dreadfort. It may be nothing.' })],
  { must: ['Roose Bolton', 'Dreadfort'], mustNot: ['Tywin', 'Lannister'], verb: 'spread', reference: 'Whispers spread about Roose Bolton at the Dreadfort',
    summary: 'Word has it that he has been talking with strangers. It may be nothing.' });
G('g-rumour-02', 'rumour', () => [
  F('rumour', { h: ['tully'], p: 'whent', i: 1, d: { party: 'host_tully', feint: 'whent', false: true }, t: 'Word goes about that The Host of Riverrun marches on Harrenhal.' })],
  { hard: ['unknown-actor'], must: ['Harrenhal'], mustNot: ['Robb', 'Winterfell'], verb: 'spreads', reference: 'Word spreads that the Tully host marches on Harrenhal',
    summary: 'The tale is going about the roads, though no one can say who began it.' });
G('g-rumour-03', 'rumour', () => [
  F('rumour', { h: ['stark', 'clegane'], i: 3, d: { report: true, party: 'mountain_riders', men: 3000, false: false }, vis: { scope: 'houses', houses: ['stark'] }, t: "Word reaches House Stark of The Mountain's Men (~3,000 men)." })],
  { must: ['Gregor Clegane'], mustNot: ['Tywin', 'Winterfell'], verb: 'reaches', reference: "Word reaches the North of Gregor Clegane's riders",
    summary: 'Travellers speak of some three thousand riders on the roads.' });

// ── omen ─────────────────────────────────────────────────────────────────────────────────────────────────────────
G('g-omen-01', 'omen', () => [
  F('happening', { h: ['stark'], p: 'stark', i: 1, ti: 'A weirwood speaks', d: { tpl: 'n_godswood' }, t: "At Winterfell the weirwood's face weeps red sap, and the smallfolk say it is an omen." })],
  { hard: ['no-person'], must: ['Winterfell'], mustNot: ['Eddard', 'Robb'], verb: 'weeps', reference: 'Weirwood weeps red sap at Winterfell',
    summary: 'The smallfolk say it is an omen.' });
G('g-omen-02', 'omen', () => [
  F('happening', { h: ['karstark'], p: 'karstark', i: 1, ti: 'Snow in summer at Karhold', d: { tpl: 'n_snow_summer' }, t: 'A summer snow fell on Karhold; it melted by noon, but the old people say it is a sign that winter is coming.' })],
  { hard: ['no-person'], must: ['Karhold'], mustNot: ['Rickard', 'Winterfell'], verb: 'blankets', reference: 'A summer snow blankets Karhold',
    summary: 'It melted by noon, but the old people call it a sign that winter is coming.' });
G('g-omen-03', 'omen', () => [
  F('happening', { h: ['hornwood'], p: 'hornwood', i: 1, ti: 'A bad omen at Hornwood', d: { tpl: 'g_ravens_dead' }, t: 'A two-headed calf was born near Hornwood. The smallfolk say the gods are warning the lords of something.' })],
  { hard: ['no-person'], must: ['Hornwood'], mustNot: ['Donella', 'Winterfell'], verb: 'born', reference: 'A two-headed calf is born near Hornwood',
    summary: 'The smallfolk say the gods are warning the lords of something.' });

// ── works ────────────────────────────────────────────────────────────────────────────────────────────────────────
G('g-works-01', 'works', () => [
  F('works_begun', { a: ['roose_bolton'], h: ['bolton'], p: 'bolton', i: 1, d: { project: 'market', name: 'Charter a market & fair at The Dreadfort', cost: 400, months: 6 }, t: 'House Bolton begins works at The Dreadfort: charter a market & fair.' })],
  { must: ['Roose Bolton', 'Dreadfort'], mustNot: ['Eddard', 'Robb'], verb: 'opens', reference: 'Roose Bolton opens a market at the Dreadfort',
    summary: 'The Boltons have set up a market and fair in their own lands.' });
G('g-works-02', 'works', () => [
  F('works_begun', { a: ['wyman_manderly'], h: ['manderly'], p: 'manderly', i: 1, d: { project: 'shipyard', name: 'Build warships at White Harbor', cost: 900, months: 8 }, t: 'House Manderly begins works at White Harbor: build warships.' })],
  { must: ['Wyman Manderly', 'White Harbor'], mustNot: ['Eddard', 'Robb'], verb: 'begins', reference: 'Wyman Manderly begins building warships at White Harbor',
    summary: 'New ships will be built in the yards of the city.' });
G('g-works-03', 'works', () => [
  F('works_done', { h: ['karstark'], p: 'karstark', i: 2, d: { building: 'a granary' }, t: 'Karhold raises a granary.' })],
  { hard: ['no-person'], must: ['Karhold'], mustNot: ['Rickard', 'Winterfell'], verb: 'raises', reference: 'Karhold raises a new granary',
    summary: 'The building is finished, and the stores are being moved in.' });

// ── harvest ──────────────────────────────────────────────────────────────────────────────────────────────────────
G('g-harvest-01', 'harvest', () => [
  F('happening', { h: ['tyrell'], p: 'tyrell', i: 1, ti: 'A full harvest at Highgarden', d: { tpl: 'harvest_good' }, t: "The barley harvest around Highgarden is the best in ten years. Tyrell's steward is buying new granaries." })],
  { hard: ['no-person'], must: ['Highgarden'], mustNot: ['Robb', 'Winterfell'], verb: 'fills', reference: 'Best harvest in years fills the barns at Highgarden',
    summary: 'The fields round the castle are heavy, and the steward is buying new granaries.' });
G('g-harvest-02', 'harvest', () => [
  F('happening', { h: ['tarly'], p: 'tarly', i: 1, ti: 'Blight at Horn Hill', d: { tpl: 'harvest_bad' }, t: "A black rot has taken the wheat around Horn Hill. The septon says it is the Stranger's work." })],
  { hard: ['no-person'], must: ['Horn Hill'], mustNot: ['Robb', 'Winterfell'], verb: 'takes', reference: 'Black rot takes the wheat at Horn Hill',
    summary: 'The steward is counting what is left of the crop.' });
G('g-harvest-03', 'harvest', () => [
  F('famine', { h: ['tully'], p: 'tully', i: 4, t: 'Famine grips the Riverlands.' })],
  { hard: ['no-person'], must: ['Riverrun'], mustNot: ['Robb', 'Winterfell'], verb: 'grips', reference: 'Famine grips the lands round Riverrun',
    summary: 'The barns are empty, and the smallfolk are hungry.' });

// ── tourney ──────────────────────────────────────────────────────────────────────────────────────────────────────
G('g-tourney-01', 'tourney', () => [
  F('tourney', { a: ['robert_arryn'], h: ['arryn', 'stark', 'tully'], p: 'arryn', i: 5, d: { cost: 800, guests: 16 }, t: 'House Arryn holds a tourney at The Eyrie; 16 houses send knights.' }),
  F('tourney_result', { a: ['rodrik_cassel'], h: ['arryn', 'stark'], p: 'arryn', i: 3, t: 'Ser Rodrik Cassel is champion of the tourney at The Eyrie.' })],
  { must: ['Rodrik Cassel', 'Eyrie'], mustNot: ['Robb', 'Riverrun'], verb: 'wins', reference: 'Ser Rodrik Cassel wins the tourney at the Eyrie',
    summary: 'Sixteen houses sent knights, and it was the biggest tourney the Vale had seen in years.' });
G('g-tourney-02', 'tourney', () => [
  F('tourney', { a: ['robert_baratheon'], h: ['baratheon', 'lannister', 'tyrell'], p: 'baratheon', i: 4, d: { cost: 1200, guests: 12 }, t: "House Baratheon of King's Landing holds a tourney at King's Landing; 12 houses send knights." })],
  { hard: ['suffix-house'], must: ['King Robert', "King's Landing"], mustNot: ['Eddard', 'Winterfell'], verb: 'holds', reference: "King Robert holds a tourney at King's Landing",
    summary: 'Twelve houses have sent knights to the lists, and the city is full of banners.' });
G('g-tourney-03', 'tourney', () => [
  F('tourney_result', { a: ['loras_tyrell'], h: ['tyrell'], p: 'tyrell', i: 3, t: 'Ser Loras Tyrell is champion of the tourney at Highgarden.' })],
  { must: ['Loras Tyrell', 'Highgarden'], mustNot: ['Robb', 'Winterfell'], verb: 'wins', reference: 'Ser Loras Tyrell wins the tourney at Highgarden',
    summary: 'The lists ended with a Tyrell as champion.' });

// ── feast ────────────────────────────────────────────────────────────────────────────────────────────────────────
G('g-feast-01', 'feast', () => [
  F('feast', { a: ['mace_tyrell'], h: ['tyrell'], p: 'tyrell', i: 2, d: { cost: 600, brawl: false }, t: 'Mace Tyrell holds a feast at Highgarden for the lords of the Reach.' })],
  { must: ['Mace Tyrell', 'Highgarden'], mustNot: ['Robb', 'Winterfell'], verb: 'holds', reference: 'Mace Tyrell holds a feast at Highgarden',
    summary: 'The lords of the Reach came to eat at his table.' });
G('g-feast-02', 'feast', () => [
  F('feast', { a: ['wyman_manderly'], h: ['manderly'], p: 'manderly', i: 2, d: { cost: 500, brawl: true }, t: 'Wyman Manderly feasts 5 sworn lords at White Harbor; a brawl breaks out.' })],
  { must: ['Wyman Manderly'], mustNot: ['Robb', 'Winterfell'], verb: 'breaks', reference: "A brawl breaks out at Wyman Manderly's feast",
    summary: 'Old quarrels were aired over the wine, and the hall was in uproar before the night was out.' });
G('g-feast-03', 'feast', () => [
  F('feast', { a: ['lanna_lannister'], h: ['lannisport'], p: 'lannisport', i: 2, d: { cost: 300, brawl: false }, t: 'Lanna Lannister holds a feast for the household at Lannisport.' })],
  { hard: ['suffix-house'], must: ['Lanna Lannister', 'Lannisport'], mustNot: ['Tywin', 'Winterfell'], verb: 'holds', reference: 'Lanna Lannister holds a feast at Lannisport',
    summary: 'The feast was for her own household.' });

// ── meanwhile ────────────────────────────────────────────────────────────────────────────────────────────────────
G('g-meanwhile-01', 'meanwhile', () => {
  const trips = [['alester_florent', 'florent', 'tyrell'], ['mace_tyrell', 'tyrell', 'redwyne'], ['randyll_tarly', 'tarly', 'rowan'], ['leyton_hightower', 'hightower', 'tyrell'], ['mathis_rowan', 'rowan', 'redwyne'], ['orton_fossoway', 'fossoway', 'tyrell'], ['arthor_caswell', 'caswell', 'tyrell'], ['lyonel_ashford', 'ashford', 'tarly']];
  return trips.map(([who, from, to], k) => F('set_out', { a: [who], h: [from, to], p: from, i: 1, d: { party: `rider_${from}`, to, days: 3 + (k % 4) }, t: `${nm(who)} leaves ${pl(from)} with ${60 + k * 10} knights and riders under the ${hn(from)} banner, to feast with ${nm(s.houses[to].lord)} at ${pl(to)}.` }));
}, { must: ['Reach'], mustNot: ['Winterfell', 'Robb'], verb: 'ride', reference: 'Lords ride to feasts and hunts across the Reach',
  summary: 'Alester Florent goes to pay his respects at Highgarden, and seven other lords are on the roads to feasts and hunts.' });
G('g-meanwhile-02', 'meanwhile', () => [
  F('happening', { h: ['stark'], p: 'stark', i: 1, ti: 'Wolves in the wolfswood', d: { tpl: 'n_wolfswood' }, t: 'Woodsmen say the wolves of the wolfswood have grown bold; one pack followed a party from Deepwood Motte right to the gates.' }),
  F('happening', { h: ['stark'], p: 'stark', i: 1, t: 'Poachers are hanged in the wolfswood.' }),
  F('happening', { h: ['stark'], p: 'stark', i: 1, ti: 'Deserters hanged at Winterfell', d: { tpl: 'deserters' }, t: 'Four men who ran from the host were caught near Winterfell and hanged at the crossroads.' })],
  { hard: ['no-person'], must: ['wolfswood'], mustNot: ['Eddard', 'Robb'], verb: 'grow', reference: 'Wolves grow bold in the wolfswood',
    summary: 'Woodsmen say a pack followed travellers right to the castle gates. Poachers and deserters have been hanged.' });
G('g-meanwhile-03', 'meanwhile', () => [
  F('lost_at_sea', { h: ['pentos'], p: 'flint', i: 1, d: { ships: 1, drowned: 40 }, t: "A gale falls on a Pentoshi galley off Widow's Watch: 1 ship founders, and 40 men with it." }),
  F('feast', { a: ['mace_tyrell'], h: ['tyrell'], p: 'tyrell', i: 1, t: 'Mace Tyrell holds a feast at Highgarden for the lords of the Reach.' })],
  { hard: ['no-person'], must: ["Widow's Watch"], mustNot: ['Robb', 'Winterfell'], verb: 'wrecked', reference: "A Pentoshi galley is wrecked off Widow's Watch",
    summary: "A gale caught the ship off the coast, and some forty men were lost. Mace Tyrell feasts his lords at Highgarden." });

// ── other: storms at sea, an actor the player does not know ──────────────────────────────────────────────────────
G('g-storm-01', 'other', () => [
  F('lost_at_sea', { h: ['greyjoy'], p: 'greyjoy', i: 4, ti: 'A storm scatters The Iron Fleet', d: { party: 'iron_fleet', ships: 3, drowned: 600 }, t: 'An autumn gale falls on The Iron Fleet: 3 ships founder, and 600 men with them.' })],
  { hard: ['no-person', 'party'], must: ['Iron Fleet', 'Pyke'], mustNot: ['Balon', 'Robb'], verb: 'scatters', reference: 'A storm scatters the Iron Fleet off Pyke',
    summary: 'Three ships foundered, and some six hundred men went down with them.' });
G('g-storm-02', 'other', () => [
  F('lost_at_sea', { h: ['redwyne'], p: 'redwyne', i: 3, ti: 'A storm scatters Redwyne Fleet', d: { party: 'redwyne_fleet', ships: 2, drowned: 300 }, t: 'An autumn gale falls on Redwyne Fleet: 2 ships founder, and 300 men with them.' })],
  { hard: ['no-person', 'party'], must: ['Arbor'], mustNot: ['Balon', 'Tywin'], verb: 'sinks', reference: 'Storm sinks two Redwyne ships off the Arbor',
    summary: 'Some three hundred men went down with them.' });
G('g-unknown-01', 'other', () => [
  F('village_burned', { h: ['greyjoy', 'goodbrook'], p: 'goodbrook', i: 3, vis: { scope: 'public' }, t: 'A village near Saltpans is burned by raiders from the sea.' })],
  { hard: ['unknown-actor'], must: ['Saltpans'], mustNot: ['Balon', 'Victarion', 'Euron'], verb: 'burn', reference: 'Ironborn raiders burn a village near Saltpans',
    summary: 'Raiders from the sea came ashore, burned the houses and rowed away.' });
G('g-unknown-02', 'other', () => [
  F('rumour', { h: ['stark'], i: 3, d: { report: true, men: 5000, false: false }, vis: { scope: 'houses', houses: ['stark'] }, t: 'Word reaches House Stark of a host on the Kingsroad (~5,000 men).' })],
  { hard: ['unknown-actor'], must: ['Kingsroad'], mustNot: ['Tywin', 'Jaime', 'Lannister'], verb: 'reaches', reference: 'Word reaches Stark of a host on the Kingsroad',
    summary: 'Travellers speak of some five thousand men on the road, and no one knows whose banner they follow.' });

// ── write ────────────────────────────────────────────────────────────────────────────────────────────────────────
const one = (v) => JSON.stringify(v);
const out = ['['];
B.forEach((b, i) => {
  out.push('  {');
  out.push(`    "id": ${one(b.id)}, "archetype": ${one(b.archetype)},${b.hard ? ` "hard": ${one(b.hard)},` : ''}`);
  out.push('    "facts": [');
  b.facts.forEach((f, k) => out.push(`      ${one(f)}${k < b.facts.length - 1 ? ',' : ''}`));
  out.push('    ],');
  out.push(`    "must": ${one(b.must)}, "mustNot": ${one(b.mustNot)}, "maxWords": ${b.maxWords}, "verb": ${one(b.verb)},`);
  out.push(`    "reference": ${one(b.reference)},`);
  out.push(`    "summary": ${one(b.summary)}`);
  out.push(`  }${i < B.length - 1 ? ',' : ''}`);
});
out.push(']', '');
fs.mkdirSync('/home/user/wc-s1/tests/fixtures/headlines', { recursive: true });
fs.writeFileSync('/home/user/wc-s1/tests/fixtures/headlines/golden.json', out.join('\n'));
const counts = {}; for (const b of B) counts[b.archetype] = (counts[b.archetype] || 0) + 1;
console.log(B.length, 'bundles', counts);
