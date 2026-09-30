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

## What makes the next fine-tune better (so you can help while building)

- **Freeze the prompts before the final round.** The adapter is trained on the exact prompts, schemas and dossiers of game commit `255b302`
  (interpret and mind unchanged since `e3a8a36`; the narrator was still being rewritten, which is why `narrate` runs the untuned model).
  A large prompt change makes the adapter less useful and can hurt; tell the owner when a call's prompt or schema changes.
- **Keep the game's validators strict and logged.** Every accepted/rejected reply with its `problems` list is training signal
  (rejected → preference pairs; accepted → examples). R3 in `RECOMMENDATIONS.md` asks for the logging.
- **Human-written orders and situations are the scarce resource.** Anything the play-testers actually type or that was resolved by a person
  (a clarification answered, an order that had to be re-typed) is worth more than synthetic data. Save them (owner's consent) with the world state.
- **New call kinds** (letters, advisors, counsel, polish) were not part of this round; they run the untuned model until they are measured.
