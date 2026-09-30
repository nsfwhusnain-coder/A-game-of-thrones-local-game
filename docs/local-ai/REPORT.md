# Westeros Chronicles — local model report (final, 2026-10-01)

**Deliverable: Maester-12B** — Gemma 4 12B (QAT, 4-bit) + one LoRA adapter trained on every role of the game, served by llama.cpp b11242 behind the owner's llama-swap.
One model, two aliases of one process: `maester-12b` (adapter on) and `maester-12b:plain` (adapter off = the untuned 12B, used for narrate and the untested call kinds).
Files: [MAESTER-12B.md](MAESTER-12B.md) (what it can do — for the game's builder) · [RESULTS.md](RESULTS.md) (every number) · [TRAINING.md](TRAINING.md) · [MODEL-WISHLIST.md](MODEL-WISHLIST.md) (where to log what needs improving) ·
[OWNER-CHECKLIST.md](OWNER-CHECKLIST.md) · [deploy/llama-swap-maester.yaml](deploy/llama-swap-maester.yaml) · [deploy/game-routing.json](deploy/game-routing.json) · [deploy/ADAPTER.md](deploy/ADAPTER.md) · [RECOMMENDATIONS.md](RECOMMENDATIONS.md) (R1–R11).

## Bottom line

1. **The untuned Gemma 4 12B was already a good fit** (8.7 GB, ~55 tok/s, ~95 with MTP, no quality cost from MTP). Fine-tuning made it **better in the ways that matter for play, but modestly**:
   - interpret on the 125 unseen orders **88.0 % (110/125) against 85.6–86.4 % untuned** — +2 to +3 orders, inside the noise of a 125-order test (adapter-to-adapter spread was 9 orders, so the deliverable is the exact average of two);
   - the mind call **needs 2 fallbacks instead of 16** and is 89 % in character (untuned 86 %); council 13/15 first try (untuned 8/15);
   - stray foreign-script tokens **22 → 3** per full run; clarifying questions 6.5 % → 2.5 %; retries per 100 interpret calls 7.4 → 4.1.
2. **Narrate did not improve** (80–85 % faithful first try, untuned 84 %; the game's gate is 90 %), so it runs on the untuned alias. Lowering the temperature did not help either.
3. **Speed:** with the MTP drafter and the adapter, **75 tok/s, 9.7 GB VRAM**, interpret p50 1.4 s, mind 2.5 s, narrate 5.7 s (untuned without MTP: 1.7 / 3.7 / 8.1 s).
4. **Gates:** mind passes (≥ 85 %); interpret (88 %) and narrate (~84 %) do not reach 95 % / 90 %. The interpret ceiling with this pipeline is ~93 %: nine of the 125 orders are missed by every model; two of them are a **game-side validator** (R8: "six rangers"), worth +2 orders for every model once fixed (verified).
5. **Per-call adapter switching needs no game code**: llama-swap v252's `setParamsByID` makes two aliases of one process (verified: alias `:plain` = untuned model; prompt cache does not mix scales). The game needs only `"allowModelSwaps": true`.
6. **More rounds of the same training did not help** (phases 3 and 4: within noise of phase 2), so v1 is the phase-2 adapter. The next real gains are game-side (R7, R8, R10) and a fine-tune once the game is feature-complete, from the wish-list.

## What was done

Data (engine-labelled orders, the game's human gold orders, filtered self-distillation for the other calls) → four training phases on Kaggle (two Tesla T4, ~14 GPU-hours of a 30 h weekly quota) → each phase's two half-data adapters averaged → evaluated locally
on the RTX 5070 with the game's own suites (fair yardstick: only orders no training row was built from). The whole path is in `finetune/westeros/`; nothing in the game repo was changed.

## Not done / caveats

- Interpret and narrate gates are missed; the fine-tune is a modest gain, not a step change. A single adapter's score is partly luck; validation used replicates and an average.
- The adapter is trained on the prompts of game commit `255b302` (narrator rewrite still in progress → narrate on the untuned alias). Large prompt changes reduce its benefit — log them.
- Untested call kinds (`letter`, `advisor`, `counsel`, `polish`, `probe`) run the untuned alias. The game was played for 8 scripted turns through the served aliases without errors (18–31 s a turn; `samples/`), but no long playtest (12+ turns, several houses) was run. llama-swap was tested on my own instance (port 8096), the owner's live config was not touched.
- The owner's llama.cpp build (5266f24) was not tested with the 12B or the adapter; b11242 is required.
