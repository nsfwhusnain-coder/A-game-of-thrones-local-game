// Phrasing banks for the synthetic interpret orders. Everything here is English a lord might dictate; nothing is book text.
// The labels do not come from the phrasing: build_interpret.mjs builds each order from a structured intent and checks the
// pair with the game's own validator, so a phrasing that cannot carry its label is dropped, not trusted.

export const UNITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
/** 200 → "two hundred", 5000 → "five thousand", 250 → "two hundred and fifty" (the way the pre-parser reads them). */
export function words(n) {
  if (n < 20) return UNITS[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? `-${UNITS[n % 10]}` : '');
  if (n < 1000) return `${UNITS[Math.floor(n / 100)]} hundred${n % 100 ? ` and ${words(n % 100)}` : ''}`;
  if (n < 1000000) return `${words(Math.floor(n / 1000))} thousand${n % 1000 ? ` ${n % 1000 < 100 ? 'and ' : ''}${words(n % 1000)}` : ''}`;
  return String(n);
}
/** The ways a body of men is counted: [text, value]. `a few` → 10 and the rest as the game's pre-parser reads them. */
export function countPhrases(n) {
  const out = [[words(n), n], [String(n), n]];
  if (n === 100) out.push(['a hundred', 100]);
  if (n === 1000) out.push(['a thousand', 1000]);
  if (n >= 1000 && n % 1000 === 0) out.push([`${n / 1000},000`.replace(/^(\d+),000$/, (m, a) => (n >= 10000 ? `${a},000` : String(n))), n]);
  return out;
}
export const FUZZY_ESCORTS = [['a few men', 10], ['a handful of men', 5], ['a score of men', 20], ['a dozen men', 12], ['a small escort', 10], ['a few riders', 10], ['a few men of the household', 10]];

export const GO_VERBS = ['Send', 'Dispatch', 'Have', 'Order'];
export const MEN_NOUNS = ['men', 'spears', 'swords', 'riders', 'men-at-arms', 'archers'];

// story lines: nothing for the engine to do (a speech, a prayer, a vow, a boast, a wish)
export const STORY_LINES = [
  'Let them come.', 'We will not forget this.', 'Winter is coming.', 'Pray for us, Septon.', 'The gods will judge.', 'Let it be known that I am displeased.',
  'A lord who cannot keep his word is no lord.', 'I trust no one at this table.', 'May the Seven watch over the realm.', 'Tell the smallfolk to keep faith.',
  'Our word is our bond.', 'We remember, and we wait.', 'Let the singers make songs of this.', 'A hard winter makes hard men.', 'Nothing has changed.',
  'I will think on it.', 'Fear is only a cold wind: it passes.', 'The realm will see what our house is made of.', 'Let no man say we were afraid.', 'Offer a prayer for the dead.',
  'The old ways will hold.', 'Everything in its season.', 'History will judge us.', 'I mean to be remembered kindly.', 'Let the councillors speak freely.',
];
// orders too thin to act on (something must be asked): the question is fixed by the builder
export const VAGUE = ['Send men.', 'Ride.', 'Go north.', 'Go south.', 'Make ready.', 'See to it.', 'Send someone.', 'Take the field.', 'Prepare.', 'Move out.'];

// small dressings around an order that change its wording, never its meaning
export const LEAD = ['', '', '', '', '', 'Now, ', 'Then ', 'Also, ', 'And ', 'At once: ', 'First, ', 'Very well. ', 'My decision: ', 'Hear me: '];
export const TAIL = ['', '', '', '', '', ' At once.', ' Without delay.', ' Quickly.', ' See it done.', ' Do not fail me.', ' I will not ask twice.'];
export const JOINERS = [' and ', ', and ', '. Then ', ', then ', '. Also ', '. And '];

// what a lord calls the works, by template key
export const WORKS = {
  warships: ['warships', 'longships', 'a war fleet', 'more ships of war'], granaries: ['the granaries', 'the grain stores', 'a great granary'], walls: ['the walls', 'the castle walls', 'the defences'],
  roads: ['the roads', 'the roads and bridges', 'the kingsroad'], market: ['a market', 'a market and fair', 'a market square'], men_at_arms: ['men-at-arms', 'a trained garrison'],
  sept: ['a sept', 'a godswood', 'a sept and a godswood'], rookery: ['a rookery', 'the rookery', 'a maester\'s tower'], harbour: ['the harbour', 'a new harbour', 'the wharves'],
  barracks: ['barracks', 'new barracks'], smithy: ['the smithies', 'a smithy', 'an armoury'], stables: ['stables', 'a stable', 'the stables and studs'],
  inn: ['an inn', 'inns on the road', 'a toll bridge'], almshouse: ['an almshouse', 'a hospice', 'a house for the poor'], mines: ['the mines', 'new mine shafts', 'the silver mines'],
};
export const WORKS_VERBS = { warships: ['Build', 'Lay down', 'Fund'], granaries: ['Fill', 'Expand', 'Fund', 'Build'], walls: ['Strengthen', 'Repair', 'Raise'], roads: ['Repair', 'Mend', 'Fund'], market: ['Charter', 'Found', 'Fund'], men_at_arms: ['Train', 'Fund'], sept: ['Endow', 'Build', 'Found'], rookery: ['Raise', 'Build'], harbour: ['Deepen', 'Repair', 'Expand', 'Fund'], barracks: ['Build', 'Raise'], smithy: ['Endow', 'Build'], stables: ['Build', 'Breed horses in', 'Fund'], inn: ['Build', 'Raise'], almshouse: ['Found', 'Build', 'Endow'], mines: ['Open', 'Dig'] };
export const TAX_UP = ['Raise the taxes.', 'Raise the taxes on the smallfolk.', 'Taxes must go up.', 'Squeeze the smallfolk a little harder.', 'Levy a heavier tax.'];
export const TAX_LOW = ['Lower the taxes.', 'Ease the taxes on the smallfolk.', 'Taxes are to be lightened.', 'Lower taxes for the winter.', 'The smallfolk are hungry: lower the taxes.'];
export const TAX_NORMAL = ['Restore the usual taxes.', 'Return the taxes to normal.', 'Let the taxes be as they were.'];
export const TAX_CRUSH = ['Crush the smallfolk with taxes.', 'Set the taxes as high as they will go.', 'Tax them to the bone.'];
export const DUES = { paying: ['Pay what we owe our liege.', 'Send our dues to our liege in full.', 'Our dues to our liege are to be paid.'], late: ['Delay the dues to our liege.', 'Our dues to our liege will be late this year.', 'Let the dues to our liege wait a while.'], withholding: ['Withhold the dues from our liege.', 'Not one coin more to our liege.', 'We will pay our liege nothing.'] };
export const VERDICTS = { release: ['Release {P}.', 'Let {P} go free.', 'Open the cell of {P} and send them home.', 'Free {P}.'], ransom: ['Ransom {P}.', 'Hold {P} for ransom.', 'Sell {P} back to their kin.'], wall: ['Send {P} to the Wall.', 'Let {P} take the black.', '{P} is to take the black.'], execute: ['Take the head of {P}.', 'Execute {P}.', 'Hang {P}.', '{P} dies at dawn.'] };
export const ROLE_TEXT = { spymaster: ['a spymaster', 'a master of whisperers', 'someone to keep my secrets and steal my enemies\''], steward: ['a steward', 'a new steward'], maester: ['a maester', 'a new maester'], captain: ['a captain', 'a captain of the guard'], master_at_arms: ['a master-at-arms', 'a new master-at-arms'], commander: ['a commander', 'a commander for the host'], knight: ['a sworn sword', 'a knight for my service'], envoy: ['an envoy', 'an envoy to carry my words'], castellan: ['a castellan', 'a castellan'] };
