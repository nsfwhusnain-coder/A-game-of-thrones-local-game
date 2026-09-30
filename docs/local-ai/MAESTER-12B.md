# Maester-12B — what the local model can do, and how to build the game around it

*Written for the agent building the game. Measured 2026-09-29 → 10-01 on the owner's PC (RTX 5070 12 GB) with the game's own suites, prompts, schemas and validators
(commit `255b302`). Every number is in [RESULTS.md](RESULTS.md); how it was made is in [TRAINING.md](TRAINING.md); where it is weak, and how to tell us, is in
[MODEL-WISHLIST.md](MODEL-WISHLIST.md).*

## 1. What it is

**One model:** Gemma 4 12B (QAT, 4-bit, 6.7 GB, wholly on the GPU) plus **one LoRA adapter** trained on every role of the game, served by llama.cpp b11242 behind llama-swap.
One process gives two behaviours by model name:

| model name | adapter | use it for |
|---|---|---|
| `maester-12b` | on | `interpret`, `mind`, `director`, `audience`, `council`, `consolidate` |
| `maester-12b:plain` | off (the untuned Gemma 4 12B: greedy answers identical on a non-MTP server; with the MTP drafter a near-tie can flip, 7 of 8 short answers were identical) | `narrate`, and the call kinds that were not tuned or measured (`letter`, `advisor`, `counsel`, `polish`, `probe`) |

Speed with the MTP drafter (the default profile): **~75 tok/s free-text decode, 9.7 GB VRAM**; per call at the game's own prompt sizes:
`interpret` p50 **1.4 s**, `mind` **2.5 s**, `narrate` **5.7 s** (untuned: 1.7 / 3.7 / 8.1 s without MTP). Two calls run side by side (2 slots, unpinned).

## 2. What it is good at (measured, first-try unless stated)

| call | result | reading |
|---|---|---|
| `interpret` (an order → actions) | **88.0 % (110 of 125; two runs 110, 110; 109 with MTP) of the 125 unseen orders exact** (untuned 84–86 %); clarifying questions 2.5 % (untuned 6 %) | reads plain orders well; the misses are listed in §4 |
| `mind` (a lord's decision) | **89.4 % (110 of 123) in character**, **2 of 123 needed the game's fallback** (untuned 86 %, 16 fallbacks) | sound picks; the game's matcher does the rest |
| `audience` (a scene with a lord) | 18/20 valid first try | good voices, the game's checks pass |
| `council` | **13/15** first try (untuned 8/15) | clearly better than untuned |
| `director` | 19/20 | good |
| `consolidate` | 6/6 | good |
| stray foreign-script tokens | **3 (0–5 across adapters; 4 with MTP) in a full run** (untuned 22; the game's gate is 0) | the tuned model almost never leaks; keep the validator anyway |

## 3. What it is *not* good at

- **`narrate` is the weakest call: 80–86 % of stories are faithful on the first try** (the game's gate is 90 %). Invented numbers, places and arrivals are the faults; the game's retry mends about two thirds and the rest fall back to the engine's plain words (6–8 %).
  Fine-tuning did **not** improve it, and lowering the temperature did not either — so it runs untuned (`:plain`). **Design for it:** keep the retry-then-plain-words fallback, keep facts and numbers in the engine, let the model write only colour around them.
- **Recipients that are not in the dossier.** "Send a raven to Winterfell" needs the lord's id; the dossier only lists your own people. The model sometimes answers with a wrong id. Put the seat's lord in the dossier (`RECOMMENDATIONS.md` R10) rather than hoping.
- **Number words.** "Six rangers" comes out as `men: 0` for every model because the game's `check()` rejects it (R8) — game-side fix.
- **Non-order lines** ("Aeron must bless the fleet.") are sometimes answered with an action instead of `story: true`; a confirm step for low-confidence readings costs the player nothing.
- **First-try validity is not final correctness.** The untuned model often fails a check and is rescued by the retry; the tuned model answers first try but is occasionally confidently wrong. Count what the engine finally does, as the suites do.

## 4. Where it misses (interpret, 125 unseen orders)

Nine orders are missed by **every** model tested (tuned or not): two are the men-count validator (R8), two are non-order lines the gold labels as `story` ("Pay the iron price."), and the rest are ambiguous or multi-action gold labels. Beyond those, the tuned model
misses roughly one in eight orders; the recurring ones are recipient recall for letters to a place, non-order lines read as commands, and "bring N spears to <place>" read as a march rather than a levy. Details: RESULTS.md §5.

## 5. Build the game around it (rules of thumb)

1. **The model proposes, the engine decides** — keep every validator; they are what makes a 88 % reader safe. A rejected reply costs one retry (≈ 1.5 s).
2. **Budget per call** (with MTP, unpinned): interpret ≈ 1.5 s, mind ≈ 2.5 s (two at a time), narrate ≈ 6 s a story, voices 4–9 s. A turn with 6 minds + 1 narrate ≈ 13 s (an estimate: three rounds of two minds at 2.5 s, then one narrate at 5.7 s).
3. **Never pin two requests to one slot** (`slot: null`; llama.cpp #28280 livelock).
4. **Ask when the order is thin, act when it is clear** — the tuned model asks rarely (2.5 %); give the player an "undo/confirm" for consequential orders instead of relying on clarifying questions.
5. **Keep prompts stable.** The adapter is trained on the prompts, schemas and dossiers of `255b302`. Changing what a call is *asked* (its dossier, schema or instructions) can erase part of the gain; changing *when* it is called costs nothing. If a prompt must change, log it in the wish-list so the next round retrains on it.
6. **Route by call kind, not by feature** — the `:plain` alias exists so a call that the adapter does not help can bypass it without a game change (`allowModelSwaps: true` in `config.json`; one process, nothing is swapped).
7. **Tell us what to fix** — add rows to `MODEL-WISHLIST.md` while you build. The next tuning round happens after the game is feature-complete.

## 6. Reproduce a number

`node scripts/local-ai/wc-bench.mjs --help` runs the game's suites against any OpenAI-style endpoint (the portable harness of the first snapshot). The unseen-order score and the paired test are
`finetune/westeros/eval/fair.mjs`; the per-order stability table is `matrix.mjs`. Server settings: `docs/local-ai/deploy/llama-swap-maester.yaml`.
