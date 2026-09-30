# Model wish-list — where Maester-12B needs to get better

*For the agent building the game. Add a row (or a short section) whenever a model-driven call behaves badly while you build or play-test.
The owner will run another fine-tuning round once the game is feature-complete; this list is what that round is built from, so be specific.*

## How to add an entry

1. **One row per problem**, newest at the bottom of the table. Do not delete rows; mark them `fixed in game`, `fixed by model` or `wontfix`.
2. **Say which call** (`interpret`, `mind`, `narrate`, `audience`, `council`, `director`, `consolidate`, `letter`, `advisor`, `counsel`, `polish`, …).
3. **Say what you saw and what you wanted**, in one line each, and paste the smallest reproducing input (the order text, the situation, the
   story facts). If the game logs the prompt and reply (`llm-log.jsonl`, or the bench's wire log), give the file and line.
4. **Say how often** (once, a few times, every time in the last N turns) and whether the game's own retry or fallback rescued it.
5. **Say if a game-side change would be cheaper** than a model change — say so rather than asking for fine-tuning; a validator or a prompt line is faster and safer.

| # | date | call | what happened | what was wanted | how often / rescued? | game-side fix possible? | status |
|---|---|---|---|---|---|---|---|
| 1 | 2026-09-30 | interpret | "Send Benjen Stark beyond the Wall with six rangers." → `men: 0` | `men: 6` | every time; the men-count check rejects the number word, so the model is forced to retry and drops the count | **yes — R8** (accept number words in `check()`), no model change needed | open (game) |
| 2 | 2026-09-30 | interpret | "Send a raven to Winterfell asking for grain." (recipient not in the dossier) → wrong or invented recipient id ("ned", a sibling) | the head of the seat (`eddard_stark`) | ~1 in 3 tuned runs; the untuned model fails first try and is rescued by the retry | maybe: list each great seat's lord in the dossier | open (model + game) |
| 3 | 2026-09-30 | interpret | non-order lines ("Aeron must bless the fleet before it sails.", "Close Seagard's gates and let no one in.") answered with an action | `story: true` (no action) | ~1 in 5 runs | prompt line could help | open (model) |
| 4 | 2026-09-30 | narrate | first-try faithfulness 81–84 %: invented numbers (sums the model computed), places and arrivals not in the story facts | 90 % (the game's gate) | ~1 story in 6; the game's retry mends about two thirds, the rest fall back to plain words | facts-only checklist in the prompt; keep the retry | open (model — needs preference-style training, not more of the same) |
| 5 | 2026-09-30 | all | stray foreign-script tokens ("our k만") at temperature ≥ 0.6 | none | 22 per full run untuned → 1–4 tuned | keep the script validator | mostly fixed by model |
| 6 | 2026-09-30 | narrate (mode "cards": headline + summary) | Told to say each story's card better than the writer's draft, the untuned model passed the game's own scorer first time on **61 %** of 151 stories over the 60-week suite (mended by a retelling 39, left to the writer 20; 9.7 s a week). Faults: invented names/places (27+10), numbers (17), names of people not in the story (8), ledger phrases copied from the sheet (8), story ids ("S5") written into the Meanwhile, a story told twice. | ≥ 90 % first time, and the card no better or worse than the writer's | 1 story in 3 needed a retry; the writer's card stood for 13 % | **done in game**: the game's default is now mode "scenes" (the writer's cards, the model's scenes), **99 %** first time on 238 stories, 1.4 s a week. Mode "cards" stays an opt-in for a tuned model | fixed in game; **train**: rewrite of a draft card under the scorer (preference pairs from the game's accepted/refused replies, `logCalls`) |
| 7 | 2026-09-30 | narrate (scene) | Scenes are good but formulaic: every one ends "The cost of X was …" (the style bible said "end on what it will cost") and opens on a smell ("The smell of wet wool …"). | A witness's moment that ends on a concrete detail, varied openings | every scene | prompt line changed in the game (`data/style.js` VOICE); the variety is the model's | fixed in game (ending); open (openings — model) |
| 8 | 2026-09-30 | narrate | The `pov` field of the schema degenerated at its length limit ("a serving girl at The Twinsfffffffffffffffffffffzz", the instruction text echoed back). | a name, or nothing | a fifth of the stories | `pov` is no longer asked: the scene's witness is the story's own (cluster.js) | fixed in game |
| 9 | 2026-09-30 | narrate | Names true things the story does not hold: a castle where the lord lives ("Torrhen's Square"), the house of a castle at the story's place ("House Frey" for the Twins), a person's home in a scene about a tourney elsewhere. | only what the sheet lists | 1 story in 6 in mode "cards", 2 in 238 in mode "scenes" | each sheet now has a `NAME ONLY` line of exactly the names the validator allows | mostly fixed in game; residual (model) |
| 10 | 2026-09-30 | council | Asked what the King's offer means, one counsellor (Luwin) gave one long speech; the other two "listened, and said nothing this time". | each seated counsellor speaks, in their own office's words | the one council of the playtest | the schema now demands `min(members, 3)` speeches | fixed in game; check on the next live play |
| 11 | 2026-09-30 | narrate / all | The game's own scorer refused honest roundings ("some three hundred" for 349 men) and ordinary English ("the host of House Stark"). | rounding to one or two figures allowed; ledger phrases only where they are ledger | 6 of 12 rejections in one run | validators changed (numbers to 1–2 figures; "host of House" only opening a sentence) | fixed in game |

## What makes the next fine-tune better (so you can help while building)

- **Freeze the prompts before the final round.** The adapter is trained on the exact prompts, schemas and dossiers of game commit `255b302`
  (interpret and mind unchanged since `e3a8a36`; the narrator was still being rewritten, which is why `narrate` runs the untuned model).
  A large prompt change makes the adapter less useful and can hurt; tell the owner when a call's prompt or schema changes.
- **Keep the game's validators strict and logged.** Every accepted/rejected reply with its `problems` list is training signal
  (rejected → preference pairs; accepted → examples). R3 in `RECOMMENDATIONS.md` asks for the logging.
- **Human-written orders and situations are the scarce resource.** Anything the play-testers actually type or that was resolved by a person
  (a clarification answered, an order that had to be re-typed) is worth more than synthetic data. Save them (owner's consent) with the world state.
- **New call kinds** (letters, advisors, counsel, polish) were not part of this round; they run the untuned model until they are measured.
