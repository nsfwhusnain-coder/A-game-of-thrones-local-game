# Found while fixing the bug hunt of 2 October 2026

New findings made by the agent that fixed the report (`docs/BUG-HUNT-2026-10-02.md`), in the report's format: an ID (`N-001`, …), a
severity (**S1** breaks the story or security, **S2** a visible logic or immersion break, **S3** polish or rare), what is wrong, where
to look, and a repro on the mock. A finding that was fixed says **FIXED** and the pull request. The tracker is issue #75.

## Cards and the headline scorer

The CI soak (`tests/soak.test.js`, `scripts/soak.js`) holds every card the writer tells to the headline scorer, so a card of the writer's
own that the scorer refuses is a latent red build (CI1 is the first of them): it only needs a seed that plays the story that way.

### N-001 · S3 · The soak reads a card written in week one with the world of the turn's last day

"King Robert's feast ends in a brawl" / "Lord Tyrell and Lord Tully come to blows over an old boundary." fails the scorer ("Lord Tully is not in
this story") in a 30-day turn, and the card is right: Hoster Tully was the lord of Tully when the feast was told, and died later in the same turn.
The soak (`scripts/soak.js`) scores every card of a turn against the state at the turn's end, where "Lord Tully" is Edmure; the narrator's own
check, run at the end of each week, does not see it. Only long turns show it (a seven-day turn closes the week the card was written in).

**Where:** `scripts/soak.js` (the state the cards are scored against).
**Repro:** `node scripts/soak.js --turns 14 --span 30d --houses stark --seed 303` (turn 12).
**Not fixed.** The check is the soak's, the cards are right; the CI soak plays short turns. If it ever flakes, score each card with the state of
its own week.

### N-002 · S3 · "A ranger of the Watch tells of empty villages" names no one and no place

The Night's Watch hook that tells the ranger's report fails the scorer's `who` rule: neither a person, nor a house, nor a place of the story is in
its headline ("A ranger of the Watch tells of empty villages / He speaks of wildlings moving south in numbers."), so it is no card for the soak.

**Where:** `engine/facts/heads.js` HOOK table, `ranger_word` (its head named no one). A sweep over every hook found four more that the scorer refuses: `boundary_stone` ("a hundred acres"), `reconciliation_feast` ("Arbor gold"), `fire_granary` ("Winterfell burns" is a phrase the anachronism check keeps for a later chapter) and `village_feud` (no verb)..
**Repro:** `node scripts/soak.js --turns 30 --span 30d --houses stark --seed 303` (turn 28 in one game, turn 16 in another).
**FIXED** (with ST1: the five hooks are reworded, and `tests/bugfix-headlines.test.js` tells every hook of `public/data/hooks.js` at two places and scores it).

## Played, on the fixed game

### N-003 · S1 · A man seized with his own riders about him rides off with them, and the canon runs off the rails

Lord Eddard, arrested at King's Landing with his riders about him, stayed "imprisoned" *in his own riders' party*; the party was a Stark host with no commander, the Stark mind marched it to the Deddings, and for two years the Hand sat "imprisoned" in a camp in the Riverlands. The beat that tries him in the Sept looks for him in the black cells of King's Landing and lapsed in every canon run (Hightower, Redwyne, Dayne): Baelor's Sept, the crowning of the King in the North, Blackwater, the Red Wedding and the Westerlands lapsed with it, and Q9 passed by a hair (90 %).

**Where:** `shared/world.js` the `character` op, where a character becomes held (`held(c.status) && !held(was.status)`).
**Repro:** a canon game as House Hightower, seed 7: `node scripts/canon.js --houses hightower` (lapsed: `crown_justice.baelors_sept`, `king_in_north.crowned`, …); or a script that prints `eddard_stark.status` and `.loc` each moon (it is `imprisoned` and `party:eddard_riders` from the sixth).
**FIXED** with `tests/bugfix-found.test.js`: seized among his own, he is taken out of their party and held where it stands; one taken by another house's host stays in it. In the same run Ned is imprisoned at King's Landing in moon 6 and the Sept fires in moon 7.

### N-004 · S1 · A host that follows another host pays the same barrier every day

"Host of House Broom at The Golden Tooth: forced the crossing, 1 men lost, 4 days", seventy-two times in a row: a company of fifty lost every man to the pass over ten weeks. A barrier is "paid once per road", but the record of what was paid lived on the route, and a host marching *to another party* (a vassal's host on its way to its liege's host, which is on the move) has its road planned again every day, so the record was wiped each day, and the host, held up four days at each crossing, never left the pass. Every vassal host that went to join a moving liege through the Neck, the Bloody Gate, the Twins or the Tooth was eaten alive.

**Where:** `shared/marches.js` `tollAlong` (the paid barriers were `route.paid` only).
**Repro:** `node scripts/bughunt/probe-corpus.mjs martell 105 20 14d corpus.txt` and look for "forced the crossing" in the `applied` lines (seventy-odd); or count `crossed` facts per party: it was 100+ in a game, now 19.
**FIXED** (`tests/bugfix-found.test.js`): what a host has paid is remembered on its order (`march.paid`) as well as on the road.

### N-005 · S2 · The opening of House Targaryen speaks to Daenerys, in a game played as Viserys

The "Your situation" card is headed "Viserys Targaryen", and reads "You are the last of the dragons, living on the charity of a Pentoshi cheesemonger. Your brother Viserys has sold you to a Dothraki khal…"; its strengths ("A khal's love, if you can win it"), weaknesses ("A cruel, desperate brother") and what the council has heard ("Your brother has promised you to Khal Drogo") are all hers. The ruler the player is, is Viserys.
**Where:** `public/data/briefs.js` `targaryen`.
**Repro:** begin as House Targaryen.
**FIXED:** rewritten in Viserys's voice (and without the stone eggs, which are Daenerys's wedding gift).

### N-006 · S3 · "Orton Fossoway sit at the table"

A feast with one guest at the table said "sit". And the engine's crossing note said "1 men lost, 1 days".
**Where:** `engine/facts/heads.js` the `feast` summary; `shared/marches.js` the `chokepoint` note.
**FIXED.**

### N-007 · S3 · A spy's old census outlives the lands it counted

In a 24-moon game as House Tyrell (seed 23) the realm view read House Brax at "seen people 150,000" with no land at all: its seat had been taken and its lord was a captive. A census taught by a spy "stands as it is told", and a fresh sighting of the house carried it forward, however much of the land had gone since. (The realm soak holds a figure marked *seen* to ±10 % of the truth, and caught it; the same game passes on other dice, so it was latent.)
**Where:** `engine/realm/estimate.js` `faceOf` (the taught `people`).
**Repro:** `WC_PROVIDER=mock node scripts/realm-dump.js --soak --json --house tyrell --seed 23 --turns 24` on the world branch before the fix.
**FIXED** (`tests/bugfix-world.test.js`): a taught census stands as far as the lands now held (a tenth over); a house with no hold has no people the viewer can see.

### N-008 · S3 · "The Tullys seizes Stoney Sept"

A house told as a people ("the Tullys", "the Free Folk") led a verb written for one: the chronicle strip read "The Tullys seizes Stoney Sept". Siege heads had a one-off plural rule that also made "The royal house besiege" of the Crown.
**Where:** `engine/facts/heads.js` (about a hundred templates with a house as their subject), `facts/headline.js`.
**Repro:** a mock game as House Stark, advance a dozen moons, read the Chronicle strip when a Riverlands holding falls.
**FIXED** (`tests/bugfix-found.test.js`): the context records the names it gave to houses as a people, and the finished headline, summary and details are conjugated after them (`agree`); the siege special case is gone.

### N-009 · S2 · A wife with child in the player's own house is "Rumour spreads at Winterfell. It is only talk."
The pregnancy and stillbirth cards of the family module (WD1) were `happening` facts with no template, which the writer told as the generic rumour of their place.
**Where:** `engine/facts/heads.js` (`happeningHead`, `SUM.happening`), `engine/people/family.js`.
**Repro:** play a house whose lord's wife conceives (a few moons); read the Chronicle.
**FIXED** (`tests/bugfix-found.test.js`): `data.family` gives them their own headline and summary ("Catelyn Stark is with child. The child is looked for in about nine moons."), told as news of the court.

### N-010 · S3 · A host loses men at the pass its own house holds
A Lefford host crossing the Golden Tooth under Lefford's own walls paid the same men and days as a stranger's.
**Where:** `shared/chokepoints.js` `chokepointToll`.
**Repro:** `chokepointToll` for a host of Lefford across the line of the Golden Tooth, before the fix.
**FIXED** (`tests/bugfix-found.test.js`): a host of the house that holds the gate passes untaxed.

### N-011 · S3 · Every lord's strain "keeps his own counsel", and is told again as the band flips
The `behaviour` card was headlined "keeps his own counsel" for all four bands, and told each time a lord's stress crossed a line either way.
**Where:** `shared/psyche.js` (`bandNews`), `engine/facts/heads.js`.
**Repro:** a long war as any house; a lord who hovers about a stress line is told every week.
**FIXED** (`tests/bugfix-found.test.js`): told only as a man gets worse, once at each pitch for four turns; a headline and a summary for each band (what the household sees, never a number).

### N-012 · S3 · "Prince Joffrey" is whipping stableboys after he is King
Happenings with the title of a claimant in their text were still drawn after he was crowned (Joffrey; Renly and Stannis as "Lord").
**Where:** `data/happenings.js`, `data/happenings/people.js`, `shared/happenings.js` (`fits`).
**FIXED** (`tests/bugfix-found.test.js`): a new condition `uncrowned:id` on those five.

### N-013 · S2 · The Northern Host marches on without Robb, who sits at Winterfell
In a game as House Baratheon the host the "North calls its banners" beat makes, 18,000 men with Robb as its commander, marched for Castamere with `members: []`: Robb stayed where he was, and every letter to him, every card about him, said Winterfell.
**Where:** `shared/world.js` `army_create` (a commander was named, never put aboard); the muster verbs and the King's progress already put theirs aboard.
**Repro:** `node scripts/bughunt/probe-simul.mjs baratheon 100 20` before the fix: `commander-not-with-host`.
**FIXED** (`tests/bugfix-found.test.js`): the story's host is made with its commander in it (a free man not already on the road with a party).

### N-014 · S3 · A feast is held "by" the prisoner whose wife rules the house
The facts of a feast, a judgement and a decision were worded with the lord's own name while a regent ruled for a captive lord (the card was right, the fact text, which the narrator is given, named the prisoner).
**Where:** `engine/actions/court.js`.
**FIXED** (`tests/bugfix-found.test.js`): the text names the speaker of the house (`speakerFor`).

### N-015 · S3 · "At least 2,600" of a house whose host has joined its liege's
In the realm view a report of a vassal's host was noted afresh each week for four, whether or not the host was still there: Blackwood's 2,993 joined the Tully banners and the ledger went on saying "at least 2,600" for a moon against a truth of 1,432. Found by the realm soak (Tyrell, seed 23) once the game's path moved.
**Where:** `engine/realm/estimate.js` `observe`; `bench/lib/realm-audit.js` (the "at least" bound did not count a house's men serving in its liege's host).
**Repro:** `WC_PROVIDER=mock node scripts/realm-dump.js --soak --json --house tyrell --seed 23 --turns 24` with N-013 in.
**FIXED** (`tests/bugfix-world.test.js`): word of a host stands only while it is still the house's; the audit counts a house's contingent in another's host as its own.

### N-016 · S2 · The Father's feast at Oldtown is "Rumour spreads at the Hightower. It is only talk."
The days of the realm's calendar (the turning of the year, the Maiden's Day, the harvest fires, the old gods' night, the small council's moon) were told as the generic rumour of their place, and the card's real name and words were thrown away. Found reading a mock game's cards by eye (Stark, moon 12: "Rumour spreads at King's Landing" for the Stranger's eve).
**Where:** `server/turn/day.js` (the calendar's `happening` fact carried no slot for its name), `engine/facts/heads.js` (`happeningHead`, `SUM.happening`).
**Repro:** play any house twelve moons; read the Chronicle for the Stranger's eve (12/21) or the Father's feast (6/14).
**FIXED** (`tests/bugfix-found.test.js`): the fact carries `data.head` and `data.sum`, the writer tells them.

### N-017 · S2 · Seven victories in seven days over the same host
In a Stark game the Lannister and Tully hosts met on the same ground seven days running (and in the same game four times more, in runs of four, four and five): a routed host stays in contact and is fought again at every day's end, until it is destroyed. Each day was a card ("The Lannister host beats the Tully host", "defeats", "crushes", "breaks"…), each with the same summary.
**Where:** `engine/facts/cluster.js`, `engine/facts/headline.js` (`rollOf`), `engine/facts/heads.js` (`RUN`). The engine itself is untouched: it is a pursuit, and Q9's battles are as they were.
**Repro:** `node scripts/bughunt/probe-simul.mjs stark 101 14`, then read turns 13 and 14 (or any game of a long war).
**FIXED** (`tests/bugfix-found.test.js`): battles of the same two hosts within two days of each other are one story, told as one card ("The Lannister host destroys the Tully host near Wayfarer's Rest. Seven battles in seven days. …"), with its first day's losses and its last.

### N-018 · S3 · "The Tullys lose about as many men than the Lannisters"
The battle summary's comparison of losses had no form for equal losses that read.
**Where:** `engine/facts/heads.js` (`lossLine`).
**FIXED** (`tests/bugfix-found.test.js`): "The Tullys and the Lannisters lose about as many men".

### N-019 · S2 · Euron rides with the Greyjoy muster while his fleet sails without him
`probe-simul` on a Lannister game found hosts and fleets whose commander was not aboard: "The Silence" (Euron Greyjoy's fleet, at sea) and "Edmure Tully's company" (on the road for Deddings) had both lost their captain to the muster of his house, which took every kinsman at hand to ride with its host, including men who command a host or a fleet of their own.
**Where:** `engine/military/muster.js` `answer` (the lords who ride with the host).
**Repro:** `node scripts/bughunt/probe-simul.mjs lannister 102 12` before the fix: `commander-not-with-host`.
**FIXED** (`tests/bugfix-found.test.js`): a man who commands a party stays with it.

### N-020 · S2 · A lord rides off to feast while the tourney he called waits for its lists
(The user's own example, found by the probe: Yohn Royce on the road with the lists at Runestone five days off; Renly Baratheon at Storm's End twice.) The King's own calling of a tourney is already refused while he is away (`awayFromSeat`), but a lord who had called one was free to ride out the next day, so the lists were run in his absence.
**Where:** `shared/retinues.js` `sendOut` (a household's ride), `engine/actions/movement.js` `send_person`.
**FIXED** (`tests/bugfix-found.test.js`): the lord (or regent) of a house whose lists are pending is not sent out, and a mind may not send him; the player's own lord goes where the player says.

### N-021 · S2 · Harlaw's heir is wed into Merlyn, and his company stays Harlaw's
In a Greyjoy game Urragon Harlaw ("Heir to Harlaw of Grey Garden") was betrothed to the Lady of Merlyn, and when they wed the groom changed house, since she was the lord of hers. He was Merlyn's from then on, his title still said Harlaw's heir, and he commanded "Urragon Harlaw's company" of Harlaw for another six moons. Found by `probe-simul` ("foreign-commander").
**Where:** `engine/people/family.js` (`whoGoes`, `suitability`, `refusal`: my own WD1 code).
**FIXED** (`tests/bugfix-found.test.js`): the lord or the heir of a house does not go to another's hall; when one of the two is such a one the other goes (if he is not); when both are, the match is not made (and the player's own order is refused in words).

### N-022 · S3 · "Rumour runs at King's Landing" in every week of the Meanwhile
A turn's Meanwhile is a sentence for each week, and the same small clause ("rumour runs at King's Landing", "the households of Winterfell have small news") was said again in each of them: four times in a moon.
**Where:** `server/game.js` (the weeks joined as they came), `engine/facts/headline.js`.
**FIXED** (`tests/bugfix-found.test.js`): `foldMeanwhile` leaves out a clause an earlier week of the turn has said.

## Checked, and not a bug

- A host told "set out" in the same day as its captain's `released` (the analysis's "captive-acts"): the order of the day's facts, not a prisoner walking free.
- "Euron Greyjoy died … but illness": the analysis counts a `lost_at_sea` fact's actors as dead; his fleet foundered and he lived.
- Cards that "name the dead" in the analysis are the dead *at the end of the game*, named when they lived.
- Pronoun mismatches in the analysis ("Syrio Forel … She learned"): the pupil's.

- `probe-simul`'s "foreign-commander" for Jon Snow: the rider party that takes him to the Wall is Stark's, and he is the Watch's the day he is sent. A boy riding to take the black under his father's escort, not a man commanding another house's host.
- `probe-simul`'s "acts-on-the-road" for a vassal's lord whose host was beaten and joined another host: the road was ended by the join, which the probe did not read until it learned `host_joined`.

## Seen, and left alone

- S4. A neighbour riding to pay his respects at the player's seat is a `[war]` card (a set out is a march in the clusterer's archetypes, and the small rides of other houses are typed `court` only when they are background). Retyping them means changing the roll-up of rides ("Six lords ride for Winterfell"); left for the owner to judge.
