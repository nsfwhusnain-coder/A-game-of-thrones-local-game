# Handoff — local AI for Westeros Chronicles (state at 2026-10-01)

*Supersedes the 2026-09-29 handoff (which said fine-tuning was halted: that changed — the owner asked for it and it was done on Kaggle). Read [REPORT.md](REPORT.md) first (one page), then [MAESTER-12B.md](MAESTER-12B.md) if you are building the game.*

## What exists

- **Maester-12B**, the recommended local model: Gemma 4 12B QAT + one LoRA (`docs/local-ai/deploy/ADAPTER.md`), served by llama.cpp **b11242** behind llama-swap with two aliases of one process (`maester-12b` adapter on, `maester-12b:plain` off).
  Numbers: [RESULTS.md](RESULTS.md). Config: [deploy/llama-swap-maester.yaml](deploy/llama-swap-maester.yaml), [deploy/game-routing.json](deploy/game-routing.json). Owner steps: [OWNER-CHECKLIST.md](OWNER-CHECKLIST.md) (nothing has been applied to the live llama-swap config or the game).
- **The pipeline that made it**: `finetune/westeros/` (data generators that use the game's own validators, the Kaggle trainer, adapter averaging, the local evaluation tools). Recipe and cost: [TRAINING.md](TRAINING.md).
- **Where it is weak and how to tell us**: [MODEL-WISHLIST.md](MODEL-WISHLIST.md). Add rows while building the game; the next fine-tune (after the game is feature-complete) is built from that list.
- Game-side recommendations R1–R11: [RECOMMENDATIONS.md](RECOMMENDATIONS.md); ready-to-apply patches for R2, R7, R8 in [patches/](patches/) (they apply cleanly to `255b302`; R8 verified: +2 orders for every model).

## Rules that still apply (owner's PC: RTX 5070 12 GB, 32 GB RAM, Windows)

- Never kill or restart the owner's `llama-swap` / `llama-server`; run your own servers on other ports (8090+) and stop only what you started.
- Never run another CUDA program beside a server or a benchmark; keep total VRAM after load ≤ ~10.7 GB (above it the server halves in speed until restarted).
- Never pin two requests to one llama.cpp slot (`slot: null`); llama.cpp #28280 livelocks.
- The adapter stays **unmerged** (`--lora`); merging it into the 4-bit file erases its effect.
- Score fine-tunes only on orders no training row was built from (the fair 125), with replicates; the same recipe gave 114 and 105 on two halves.
- No book text, no knowledge after year 298 in training data.

## Where things are on the owner's PC (not in git)

`C:\wc-ai\` — `eval\` (harness, `results\<run>\` raw logs), `finetune\` (`runs\p1*…p4*` adapters, `final2\` training sets, `pool*\` filtered data), `kaggle\`, `models\maester\maester-12b-lora.gguf`, `bin\llama-b11242\`, `game\{repo,latest,latest-r8,publish}` (game clones), `NOTES.md` (running log F1–F37 with every measurement and its evidence), `reports\`.

## Suggested next steps

1. Owner applies OWNER-CHECKLIST (5–10 minutes). 2. The game's builder adopts R8 (+2 orders), R10 (seat lords in the dossier) and logs wish-list rows. 3. After the game is feature-complete: freeze prompts, regenerate data, train again (TRAINING.md, "Redoing it").
4. Ideas not tried: preference-style training for narrate (pass/fail pairs), human-written play-test data, the 26B-A4B MoE for narrate only (best untuned narrate, 88 %, but it cannot be tuned here and does not co-reside with the 12B).
