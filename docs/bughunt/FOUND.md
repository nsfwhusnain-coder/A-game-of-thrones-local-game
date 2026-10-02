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
