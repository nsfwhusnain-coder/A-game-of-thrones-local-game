// Words that belong to a later chapter of the story (docs/gdd/10-narrative-events.md §9). The narrator, the audiences
// and the letters may not write them until the thing they name has happened in THIS game: "the Red Wedding" is a
// spoiler in 298 and a wound after it. Each entry: the phrases (case-insensitive regular expressions), and `after(s)` —
// whether this game has reached the point where they may be said. A beat has happened when the story's log holds it
// (shared/plots.js), or when the world plainly shows it (a title, a death, a battle).

const beat = (s, thread, stage) => (s.plots?.log || []).some((l) => l.thread === thread && l.stage === stage);
const titled = (s, id, re) => re.test(s.characters?.[id]?.title || '');
const dead = (s, id) => s.characters?.[id] && !s.characters[id].alive;
const fought = (s, re) => (s.battles || []).some((b) => re.test(b.name || ''));
const flag = (s, k) => !!s.plots?.flags?.[k];

export const ANACHRONISMS = [
  { phrases: ['golden hand', 'one-handed (?:jaime|kingslayer)', "kingslayer'?s stump", "kingslayer'?s (?:lost|missing) hand"], note: 'Jaime has both his hands', after: (s) => flag(s, 'jaime_maimed') },
  { phrases: ['king in the north', 'king robb', 'the young wolf,? king', 'king of the north'], note: 'no one has been crowned King in the North', after: (s) => beat(s, 'king_in_north', 'crowned') || Object.values(s.characters || {}).some((c) => /king in the north|king of the north/i.test(c.title || '')) },
  { phrases: ['red wedding', "the twins'? treachery"], note: 'there has been no Red Wedding', after: (s) => beat(s, 'five_kings', 'red_wedding') },
  { phrases: ['purple wedding'], note: 'there has been no Purple Wedding', after: (s) => beat(s, 'five_kings', 'purple_wedding') },
  { phrases: ['mother of dragons', 'the dragon queen', 'stormborn,? queen', 'the unburnt'], note: 'no dragon has hatched', after: (s) => beat(s, 'dragons', 'hatching') || flag(s, 'dragons_hatched') },
  { phrases: ['khaleesi'], note: 'Daenerys is not yet wed to a khal', after: (s) => beat(s, 'dragons', 'wedding') || !!s.characters?.daenerys_targaryen?.spouse },
  { phrases: ['battle of the blackwater', 'wildfire on the bay', "the hound'?s desertion"], note: 'the Blackwater has not been fought', after: (s) => beat(s, 'five_kings', 'blackwater') || fought(s, /blackwater/i) },
  { phrases: ['lord commander snow'], note: 'Jon Snow commands no one', after: (s) => titled(s, 'jon_snow', /lord commander/i) },
  { phrases: ['queen margaery'], note: 'Margaery is no queen', after: (s) => titled(s, 'margaery_tyrell', /queen/i) },
  { phrases: ["imp'?s trial", 'trial of the imp'], note: 'Tyrion has not been tried', after: (s) => beat(s, 'five_kings', 'purple_wedding') },
  { phrases: ["viper'?s death", 'the red viper (?:died|fell|is dead)'], note: 'Oberyn Martell lives', after: (s) => dead(s, 'oberyn_martell') },
  { phrases: ['lord (?:petyr )?baelish of harrenhal', 'lord of harrenhal,? (?:petyr )?baelish'], note: 'Harrenhal is not Littlefinger\'s', after: (s) => titled(s, 'petyr_baelish', /harrenhal/i) },
  { phrases: ['\\breek\\b'], note: 'no one is called Reek yet', after: (s) => beat(s, 'ironborn', 'winterfell_burns') },
  { phrases: ["robert'?s death", 'the late king robert', 'king robert is dead', 'robert (?:is|lies) dead'], note: 'King Robert lives', after: (s) => dead(s, 'robert_baratheon') },
  { phrases: ['king joffrey', 'joffrey,? (?:the )?king'], note: 'Joffrey is not king', after: (s) => titled(s, 'joffrey_baratheon', /king/i) },
  { phrases: ['queen jeyne', "the young wolf'?s bride"], note: 'Robb Stark is not wed', after: (s) => beat(s, 'young_wolf', 'westerlands') || !!s.characters?.robb_stark?.spouse },
  { phrases: ['king balon', 'king of the iron islands and the north'], note: 'Balon has not crowned himself', after: (s) => beat(s, 'ironborn', 'crown') || titled(s, 'balon_greyjoy', /king/i) },
  { phrases: ['winterfell (?:burned|burns|in ashes|sacked)', 'the sack of winterfell', 'the burning of winterfell'], note: 'Winterfell stands', after: (s) => beat(s, 'ironborn', 'winterfell_burns') },
  { phrases: ['the fist of the first men fell', 'the battle (?:of|on) the fist', 'the fall of the fist'], note: 'the Fist has not been attacked', after: (s) => beat(s, 'the_wall', 'fist') },
  { phrases: ["mutiny at craster'?s", "the old bear'?s death", "the old bear (?:is dead|died)"], note: 'Jeor Mormont lives', after: (s) => beat(s, 'the_wall', 'crasters') || dead(s, 'jeor_mormont') },
  { phrases: ['breaker of chains', 'queen of meereen'], note: 'no one has freed Slaver\'s Bay', after: (s) => beat(s, 'dragons', 'slavers_bay') },
  { phrases: ["lord tywin'?s death", 'tywin (?:lannister )?is dead', 'the late lord tywin'], note: 'Lord Tywin lives', after: (s) => dead(s, 'tywin_lannister') },
  { phrases: ["balon'?s (?:fall|death)", 'the late king balon'], note: 'Balon Greyjoy lives', after: (s) => dead(s, 'balon_greyjoy') },
  { phrases: ['the red comet'], note: 'no comet has been seen', after: (s) => beat(s, 'omens', 'comet') },
  { phrases: ['the war of the five kings'], note: 'there are not five kings', after: (s) => beat(s, 'five_kings', 'twins') || beat(s, 'king_in_north', 'crowned') },
];

const COMPILED = ANACHRONISMS.map((a) => ({ ...a, re: new RegExp(`\\b(?:${a.phrases.join('|')})`, 'i') }));

/** The later-chapter phrases in `text` that this game has not reached: [{ phrase, note }]. */
export function anachronismsIn(state, text) {
  const out = [];
  for (const a of COMPILED) { const m = String(text || '').match(a.re); if (m && !a.after(state)) out.push({ phrase: m[0], note: a.note }); }
  return out;
}
