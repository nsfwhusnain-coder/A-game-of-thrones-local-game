// The narrator's style bible (docs/gdd/10-narrative-events.md §8; WP D7), as data: the voice, the words that are
// never written, the headline rule, the few-shot examples (always of a house other than the player's) and the two
// settings of mature content. The narrator's prompt is built from it (server/ai/calls/narrate.js), and every validator
// that reads the models' words — the narrator's, the audiences', the letters', the council's — reads these words.

export const VOICE = [
  'Third person, past tense, behind ONE person\'s eyes: a named person where the facts name one, or a plausible witness of the place (a stable boy at Winterfell, a Frey serving girl, a gold cloak at the Mud Gate).',
  'The senses before the summary: cold wax, wet wool, horse, woodsmoke.',
  'A line or two of speech, in character.',
  'Specific names and places, as the facts give them.',
  'Understatement and dry humour; courtesy as a weapon.',
  'End on what it will cost, or who noticed — never on a moral.',
];

// the words that are never written (§8.2): game words, and the tired phrases of every bad fantasy novel
export const FORBIDDEN = [
  '\\bmorale\\b', '\\bunrest\\b', '\\bprosperity\\b', '\\blevies figure\\b', '\\b(?:this|next|last|each|every|the) turn\\b', '\\bturn \\d+', '\\bturns? (?:of|in) the game\\b',
  '\\bday \\d+\\b', '\\bthe player\'?s?\\b', '\\bplayers?\\b', '\\bengine\\b', '\\bstats?\\b', '\\bmeters?\\b', '\\bgame\\b',
  '\\bthe realm holds its breath\\b', '\\ba storm (?:is|was) brewing\\b', '\\bwinds? of change\\b', '\\blittle did (?:they|he|she) know\\b',
  '\\bin a world where\\b', '\\btapestry\\b', '\\btestament to\\b', '\\ba dance of\\b', '\\bechoed through the halls\\b',
  '\\bdelve[sd]?\\b', '\\ba symphony of\\b', '\\bunbeknownst\\b', '\\bneedless to say\\b', '\\bin the grand scheme\\b',
];
// (the one case-sensitive word: "op", an engine op, is not "Op" in a name)
export const FORBIDDEN_EXACT = ['\\bops?\\b'];

export const HEADLINE = 'a herald\'s cry about a person, at most 70 letters ("Lord Umber marches the banners south"; never "The March" or "Winds of War")';

// few-shot examples (§8.4): each of one house, used only when the player is of another
export const EXAMPLES = [
  { house: 'tarly', headline: 'Lord Tarly hangs the Dornish raiders at the Mander ford', line: 'Randyll Tarly caught three hundred raiders at the ford at dawn and hanged their captain from the mill.', scene: 'The mist had not lifted when the first of them came up out of the water, and Tarly\'s bowmen were waiting in the reeds where they had lain two nights. Afterwards the miller\'s boy counted the horses. "Forty-one," he told his father, who told him to stop counting and fetch the rope. Lord Tarly did not stay to watch; he never did.', pov: 'the miller\'s boy' },
  { house: 'frey', headline: 'Lord Walder raises the toll at the Twins again', line: 'Walder Frey doubled the toll on the Green Fork crossing, and three merchants turned back to the ford.', scene: 'The serving girl brought the ledger up to the old man\'s chair, and he did not look at it. "Double," he said. "They can swim, if they like." By noon the wagons stood a mile back along the causeway, and a Tully knight was shouting at the gate. Lord Walder had himself carried to the window to hear it better.', pov: 'a serving girl at the Twins' },
  { house: 'manderly', headline: 'Lord Wyman launches a war galley at White Harbor', line: 'Wyman Manderly launched the first of four new war galleys from the shipyards below the New Castle.', scene: 'The hull went down the slip slow as a fat man into a bath, and the crowd on the quay cheered as if it had been a fast one. Lord Wyman, carried down in a litter, had a cup of Arbor red poured over the prow and another poured for himself. "The North has never had a fleet," he told the shipwright. "It has never been this close to needing one."', pov: 'the shipwright\'s apprentice' },
  { house: 'greyjoy', headline: 'Ironborn reavers burn a fishing village on the Stony Shore', line: 'Three longships from Pyke burned a fishing village on the Stony Shore and took its boats.', scene: 'They came in with the tide and the smoke was up before the bell was. A boy who hid in the nets said afterwards that the reavers sang while they worked, a song about a god who lived under the sea. By evening the longships were black specks going west, and the village had one boat left, which had a hole in it.', pov: 'a boy of the village' },
];
/** The example for a player of `house`: the first of another house. */
export const exampleFor = (house) => EXAMPLES.find((e) => e.house !== house) || EXAMPLES[0];

// mature content (§8.5): the setting's paragraph, carried by every prompt that tells or speaks
export const MATURITY = {
  book: 'Violence and cruelty as in the books, told without relish; sexual matters alluded to, never described; torture happens off the page. Never anything sexual involving the young.',
  restrained: 'Violence summarised, not shown; cruelty named, not dwelt on; sexual matters left out. Never anything sexual involving the young.',
};
