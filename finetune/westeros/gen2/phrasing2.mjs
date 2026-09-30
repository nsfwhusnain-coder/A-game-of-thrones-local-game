// Extra phrasing banks for interpret v2. Written from scratch in the game's gold convention (see the 13 STORY, 5 CLARIFY and 20 LETTER orders
// of the suite's training portion); none is copied from the dev or holdout orders (build_interpret2.mjs also drops any row whose text is,
// or nearly is, a dev/holdout order). Nothing here is book text: generic statements a lord might make.

// Nothing for the engine to do: a pronouncement, a motto-like remark, thanks or reassurance, a prayer or vow, a routine duty already
// understood, a lament. The chronicle tells it; no action, no question.
export const STORY_PRONOUNCE = [
  'Our house has stood a thousand years and will stand a thousand more.', 'The old oaths still bind us.', 'Let the realm know we are not to be trifled with.',
  'A promise made in anger is still a promise.', 'Blood will tell.', 'Honour is the one thing a lord cannot buy back.', 'The cold does not frighten those born to it.',
  'We have weathered worse than this.', 'The gods see everything.', 'Every man pays in the end.', 'No one will say I was a coward.', 'Let the future remember this day.',
  'Patience wins more wars than swords.', 'It is a long road, and we are only at the start of it.', 'Some debts are paid in silence.', 'We shall see what the spring brings.',
  'A lord is only as strong as his people\'s trust.', 'The past is not done with us.', 'What is decided in the dark must be borne in the light.', 'Let them talk; words break no walls.',
  'I will not be hurried.', 'Time is the only ally that never changes sides.', 'There is no shame in caution.', 'A crown is a heavy thing to carry.', 'The realm will remember who stood firm.',
  'We are what our fathers made us.', 'The road is long but the end is in sight.', 'This too shall pass.', 'Let no man doubt our resolve.', 'The small folk endure; so shall we.',
  'One day this will all be a song.', 'Fortune favours the steady.', 'A wise man listens twice before he speaks once.', 'Some things cannot be hurried and should not be.',
];
export const STORY_THANKS = [
  'Tell my lords I am proud of them.', 'Let my people know they are in my thoughts.', 'Thank the men for their long service.', 'Let it be said the smallfolk were treated fairly.',
  'Assure the household that all is well.', 'Give my thanks to the cooks; the feast was well done.', 'The maester has my gratitude.', 'I am pleased with the harvest.',
  'Tell the household I am grateful for their patience.', 'Let the guards know their vigilance has been noticed.', 'Tell my knights their courage does them honour.',
  'Let all who served me be thanked.', 'Tell my bannermen they have my trust.', 'Let it be known that I value honest counsel.', 'My thanks to everyone who kept the castle through the storm.',
  'Say to the servants that I am content with their work.', 'Tell the stewards they have done well this year.',
];
export const STORY_PRAYER = [
  'Light a candle for the fallen.', 'Pray for rain before the harvest.', 'I swear I will not rest until this is done.', 'May the Father grant us wisdom.',
  'Let the septon offer a blessing on the fields.', 'Pray at the godswood for a mild winter.', 'I will keep vigil tonight.', 'May the Warrior lend us courage.',
  'Let the Mother watch over the children of this house.', 'We give thanks for a safe harvest.', 'May the old gods hear us.', 'I will pray for guidance.',
  'Let us honour the dead with a moment of silence.', 'Ask the gods for a sign.', 'Offer thanks to the Seven for our safe journey.', 'May the Smith mend what is broken.',
];
export const STORY_ROUTINE = [
  'Keep the watchmen alert.', 'Drill the garrison each morning.', 'Keep the beacons ready to be lit.', 'See that the sentries do not sleep.', 'Let the guards keep the gates at night.',
  'Carry on as before.', 'Continue the patrols.', 'Keep an eye on the roads.', 'Stay vigilant.', 'Maintain the watch.', 'Practise at the butts every day.', 'Have the men sharpen their blades.',
  'See that the horses are well fed.', 'The men are to keep their arms clean and ready.', 'Let the night watch be changed on the hour.', 'The sentries are to report anything unusual.',
  'Keep the fires lit in the guardroom.', 'Have the men keep to their drills.', 'The wall is to be walked at every watch.', 'Let the kitchens keep the men well fed.',
  'Everyone is to keep to their duties.', 'Continue as we have been doing.', 'Keep the lamps burning on the walls.', 'Let the hunters bring in what game they can.',
];
export const STORY_LAMENT = [
  'What is a lord without his people?', 'Who can say what the gods intend?', 'Would that my father were here.', 'These are hard times for all of us.',
  'I am weary of this.', 'How quickly the seasons turn.', 'One learns much in a hard winter.', 'A long night is coming.', 'I fear we have not seen the worst of it.',
  'It is quiet tonight; too quiet.', 'The castle feels empty with so many gone.', 'I did not choose this burden.',
];
// "X is to hold Y" / "Let X stay at Y" said of a person who is already at Y: nothing to do (the suite's convention). {P} person, {L} place.
export const STORY_STAY = ['{P} is to hold {L}.', 'Let {P} remain at {L}.', '{P} stays at {L}.', '{P} will keep {L} as before.', 'Let {P} carry on at {L}.', 'Leave {P} at {L}.', '{L} is in good hands with {P}.'];
export const STORY_HOLDS = ['{L} will hold.', '{L} will not fall.', 'Let {L} stand as it has always stood.', '{L} needs nothing from us now.'];

// thin orders: something must be asked (the question is fixed by the builder). [text, question]
export const VAGUE2 = [
  ['Do something.', 'What is to be done, my lord?'], ['Handle it.', 'Handle what, my lord?'], ['Deal with them.', 'Deal with whom, my lord?'], ['Send word.', 'To whom shall I send word, and what shall it say?'],
  ['Bring them here.', 'Whom shall I bring, and from where?'], ['Take care of the matter.', 'Which matter, my lord?'], ['Send the men.', 'Which men, and where are they to go?'], ['March.', 'Which host is to march, and where to?'],
  ['Ride out.', 'Who is to ride out, and where?'], ['Send help.', 'Help for whom, and where?'], ['Fetch him.', 'Whom shall I fetch?'], ['Raise men.', 'How many men, and where are they to be raised?'],
  ['Build something.', 'What shall be built, and where?'], ['Hire someone.', 'Whom shall I hire, and for what office?'], ['Pay them.', 'Pay whom, and how much?'], ['Attack.', 'Which host is to attack, and whom?'],
  ['Get me more.', 'More of what, my lord?'], ['Tell them.', 'Tell whom, and what?'], ['Do as I said.', 'What did you say, my lord?'], ['Go there.', 'Who is to go, and where?'],
  ['Stop them.', 'Whom shall be stopped, and how?'], ['Have it done.', 'Have what done, my lord?'], ['Send a message.', 'To whom, and what shall it say?'], ['Move the men.', 'Which men, and where to?'],
];
// a raven "to a place" goes to the lord of that place. {L} the place; the builder resolves the lord.
export const LETTER_PLACE = ['Send a raven to {L}.', 'Write to {L}.', 'Send word to {L}.', 'Write to {L} asking for men.', 'Send a raven to {L} asking for grain.', 'Have the maester write to {L}.', 'Send word to {L} that I am coming.', 'Ask {L} for news by raven.'];
export const MEN_NOUNS2 = ['men', 'spears', 'swords', 'riders', 'men-at-arms', 'archers', 'knights', 'soldiers', 'guards', 'horsemen', 'footmen', 'crossbowmen', 'spearmen'];
export const MERGE_TEXT = ['Merge our hosts.', 'Join the hosts into one.', 'Combine the hosts.', 'Let the hosts be joined as one.', 'Unite the hosts under a single banner.', 'Make one host of them.', 'Merge the {A} with the {B}.', 'Join the {A} to the {B}.'];
export const GRANT_TEXT = ['Grant {L} to {H}.', 'Give {L} to {H}.', 'Let {H} have {L}.', '{L} is to be granted to {H}.', 'I grant {L} to {H}, to hold in my name.', 'Bestow {L} on {H}.'];
