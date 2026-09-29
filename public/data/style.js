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

// ── The headline's rules as data (docs/gdd/18-headlines.md §2.2, §5.2; WP N1) ────────────────────────────────────────
// `scoreCard` (server/ai/validate/headline.js) reads a card against these, and so will the writer of N3 and the
// narrator's validator of N5, so the three cannot disagree. FORBIDDEN stays as it was: the audience, consolidate and
// council validators read it too, and none of them tells the ledger's boilerplate from a game word.
export const HEADLINE_MAX_WORDS = 12;
export const HEADLINE_MAX_CHARS = 80;
export const SUMMARY_MAX_CHARS = 340;

// The ledger's boilerplate: whole phrases the engine's log lines are made of, and the wrong forms of names ("House The
// Free Folk"). Patterns written as strings, read with the "i" flag, as FORBIDDEN is. A phrase, never a bare word: "banners"
// is a fine word, "Banners of Stark" is a party's name ("the banners of the North" is English). "Rides for" is not here:
// "King Robert rides for Winterfell" says who, what and where (20 §5.2); the ledger's line is "knights and riders under".
export const BOILERPLATE = [
  '\\b(?:is|are) raised at\\b', '\\bsets? out from\\b', '\\banswers? the call with\\b', '\\bbegins? works at\\b',
  '\\bcalls? up\\b[^.]*\\blevies\\b', '\\bhost of house\\b', '\\bhouse the\\b', '\\bbanners of (?!the\\b)',
  '\\bhouse [\\w\'’-]+ of (?:the )?[a-z]', '\\bknights and riders\\b', '\\bunder the [\\w\'’-]+ banner\\b', '\\braven received\\b',
];
// The ledger's own words: a count as a suffix ("1,796 strong"), the roll-call ("the host now numbers"), and the engine's own
// nouns and ids ("importance 3", "fact f1.2", "story S3", "an op"). Only the engine's usage: "an old story of the Long Night",
// "in fact" and "raises his levies" are English, and a herald may say them.
export const JARGON = [
  '\\b(?:\\d[\\d,]*|hundred|thousand|dozen|score) strong\\b', '\\bthe (?:host|levy|muster) (?:now )?(?:numbers|totals|stands at)\\b',
  '\\bimportance\\b', '\\bfacts? f?\\d', '\\bstor(?:y|ies) S?\\d', '\\bS\\d+\\b', '\\bop\\b', '\\bcharter an? \\w+',
];

// The verbs of the news (D-058): a headline holds a finite verb (present or past) or a bare passive participle, so
// "Robb Stark slain by Tywin Lannister at the Green Fork" and "Lady Hornwood refuses Stark's summons" both read as
// headlines and "Battle near the Twins" does not. Written as bases ("march"), or "base/past/participle" where the verb is
// irregular; every form (base, -s, past, participle) is a word of the list. Generous on purpose, and never a noun that
// merely looks like one: "battle", "tourney", "progress" and "victory" are things that happen, not things done.
const VERB_TABLE = `
  march ride/rode/ridden call answer refuse raise gather slay/slew/slain take/took/taken capture fall/fell/fallen die wed/wed/wedded
  crown win/won/won lose/lost/lost besiege sack burn flee/fled/fled reach cross join desert hire open hold/held/held hang/hung/hanged
  execute betroth sail land raid sign swear/swore/sworn break/broke/broken declare sue yield return arrive leave/left/left
  send/sent/sent receive bring/brought/brought found/founded/founded build/built/built harvest starve sicken wound
  beat/beat/beaten defeat rout crush destroy kill murder behead poison stab drown sink/sank/sunk wreck scatter storm assault attack
  ambush strike/struck/struck withdraw/withdrew/withdrawn retreat advance pursue chase follow lead/led/led command muster summon order
  dismiss appoint grant strip pardon ransom release free exile banish imprison accuse charge try condemn sentence judge acquit
  forgive betray plot scheme conspire bribe buy/bought/bought sell/sold/sold borrow lend/lent/lent tax pay/paid/paid owe default
  demand offer accept reject decline agree ally pledge promise renounce proclaim claim marry bury mourn celebrate feast host
  joust unhorse fight/fought/fought duel hunt brawl quarrel argue insult snub welcome greet visit meet/met/met hail honour knight
  vow tell/told/told warn whisper spread/spread/spread speak/spoke/spoken say/said/said write/wrote/written read/read/read
  reply deny confess reveal discover uncover expose find/found/found vanish disappear appear emerge weep bleed/bled/bled
  freeze/froze/frozen thaw snow rain blow/blew/blown rage lash flood wither rot blight fail ripen fill empty grow/grew/grown
  rise/rose/risen swell shrink drop climb double halve cut/cut/cut lift seize keep/kept/kept gain give/gave/given get/got/got
  put/put/put set/set/set turn stand/stood/stood stay remain wait watch guard garrison defend fortify repair rebuild restore
  establish close shut/shut/shut finish complete begin/began/begun start end stop halt cease resume continue launch commission
  arm equip train inspect lay/laid/laid blockade relieve raze plunder loot pillage ravage ransack occupy invade conquer subdue
  submit surrender capitulate rally regroup split/split/split merge unite disband discharge recruit enlist assemble convene
  converge embark disembark moor anchor dock depart travel journey run/ran/run fly/flew/flown enter quit abandon approach pass
  escape evade hide/hid/hidden lurk spy scout intercept deliver dispatch invite forbid ban outlaw decree announce pronounce
  anoint enthrone depose dethrone overthrow topple rebel revolt riot mutiny defect switch convert pray curse bless sacrifice
  elope divorce annul heal cure recover perish succumb expire inherit succeed replace resign abdicate retire foster tumble
  shatter scorch smash rescue save spare slaughter massacre wipe hurl shoot hurt shelter forage steal rob smuggle trade barter
  bear/bore/born sit/sat/sat wake/woke/woken bewitch haunt frighten terrify kneel confront challenge defy oppose resist rebuff
  spurn respond retort cheer jeer mock flog whip maim cripple blind torture exchange swap cede repay settle wage plead petition
  appeal beg implore urge haul carry ferry mend hoist toll cry shout scream sing/sang/sung blanket grip cover clothe sweep
  scour ruin spoil lash swallow bury flatten level topple overrun outflank surround trap rescue relieve reinforce strengthen
  weaken divide join force compel persuade convince tempt lure trick fool deceive cheat swindle betray expose denounce
  condemn lament grieve rejoice triumph prevail conquer vanquish overcome subdue tame break
  clash drive/drove/driven jail arrest name ring/rang/rung threaten abduct accompany acquire adopt allow ask assist avenge await
  bind/bound/bound bite block board boast bolster bombard breach broker burst cancel cast/cast/cast catch/caught/caught cause
  check choose/chose/chosen circle clear collapse collect come/came/come complain concede confirm confiscate consult contest
  count crumble dare deal/dealt/dealt decide demolish descend deserve detain determine disarm disown dispute disperse
  dominate draw/drew/drawn drink/drank/drunk dwindle earn eat/ate/eaten elect embrace employ encircle endorse endure engage
  ensnare entertain erupt escort evacuate exceed expand expel explode extend face falter fetch finance fine flatter flock
  flourish flow forge forsake fund gamble go/went/gone govern grab guide harass hasten hatch have/had/had head hear/heard/heard
  hinder hint hurry ignite ignore impose impress incite insist install instruct invest involve issue jump kick kidnap kiss
  know/knew/known lack last laugh leak lean leap let/let/let light/lit/lit linger live loan look loom love maintain
  make/made/made manage mark match mean/meant/meant measure melt mention miss mobilise mobilize move nail need negotiate
  nominate notify obey object oblige observe obtain offend organise organize overtake own pace paint parade pause perform
  permit pick pin pitch plan plant play point ponder position pour prepare present preserve prevent proceed produce promote
  propose protect protest prove provide provoke publish punish purchase purge quell question race rank rattle react reap
  recall reclaim recognise recognize recommend reconcile record redeem reduce refer reform regain register regret reign
  reinforce relax rely remember remind remove renew rent reopen repel repent report represent repress request require
  resemble reserve reside resolve retain retaliate retrieve reunite revenge revive reward ripple roam roar rock roll rule rush
  salute sanction satisfy scare scold score scorn scramble search secure seek/sought/sought seem sense separate serve
  shake/shook/shaken share shield shift shine/shone/shone shock show/showed/shown shrug signal silence skirmish slash
  slide/slid/slid slip slow smile snatch soften solve sound spark spawn speed/sped/sped spend/spent/spent spill spin spit
  spot spring/sprang/sprung sprout spur stagger stall stamp stare state stem step stir stumble suffer suggest suit
  suppose suppress surface surge surprise survive suspect suspend sustain swing tackle talk target taste tear/tore/torn
  tempt tend tender testify thank thrive throw/threw/thrown thwart tie tighten tolerate touch tour track trample transfer
  transport tread treat tremble trigger trust tug twist undergo undermine understand/understood/understood undo unleash
  unload unveil update uphold upset use utter venture verify vote wade wager waive wander want wash waste weaken
  wear/wore/worn weigh wish withhold withstand witness wonder work worry worship approve avoid change delay fear help
`;
const inflect = (spec) => {
  const [base, past, part] = spec.split('/');
  const s3 = /(?:s|x|z|ch|sh|o)$/.test(base) ? `${base}es` : /[^aeiou]y$/.test(base) ? `${base.slice(0, -1)}ies` : `${base}s`;
  const ed = base.endsWith('e') ? `${base}d` : /[^aeiou]y$/.test(base) ? `${base.slice(0, -1)}ied` : `${base}ed`;
  return [base, s3, past || ed, part || past || ed, ...(past === 'hung' ? ['hanged'] : [])];
};
// ("dead" is headline-ese for a participle: "Rickard Karstark dead at Karhold")
export const HEADLINE_VERBS = [...new Set(VERB_TABLE.split(/\s+/).filter(Boolean).flatMap(inflect).concat(['borne', 'ridden', 'wed', 'wedded', 'betrothed', 'beheaded', 'dead']))].filter((v) => /^[a-z]+$/.test(v));
