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

## Checked, and not a bug

- A host told "set out" in the same day as its captain's `released` (the analysis's "captive-acts"): the order of the day's facts, not a prisoner walking free.
- "Euron Greyjoy died … but illness": the analysis counts a `lost_at_sea` fact's actors as dead; his fleet foundered and he lived.
- Cards that "name the dead" in the analysis are the dead *at the end of the game*, named when they lived.
- Pronoun mismatches in the analysis ("Syrio Forel … She learned"): the pupil's.

