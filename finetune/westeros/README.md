# finetune/westeros — the pipeline that produced Maester-12B

Scripts, not data and not weights. Recipe, data sizes and results: [`docs/local-ai/TRAINING.md`](../../docs/local-ai/TRAINING.md), [`docs/local-ai/RESULTS.md`](../../docs/local-ai/RESULTS.md).
**These files were written for the owner's PC and keep its paths** (`C:/wc-ai/...`, llama.cpp b11242 at `C:/wc-ai/bin/llama-b11242`, the game clone at `C:/wc-ai/game/latest`): change the constants at the top of each file. They are
not part of the game, are not run by CI, and never import from the game without a file URL.

| folder / file | what |
|---|---|
| `gen/` | the first interpret-order generator (phrasing tables, mock scorer) |
| `gen2/build_interpret2.mjs` | the interpret generator used here: ~45 order families in randomised worlds, every label checked by the game's own `check()`, `readingOf` round-trip and rule pre-parser; decontamination against the dev/hold-out orders |
| `gen2/paraphrase.mjs` | rephrases the human-written gold train orders (never the dev/hold-out ones), keeps a variant only if names, numbers and the label survive the game's checks |
| `gen2/rft.mjs`, `serve-run.mjs`, `scen_*.mjs`, `lib.mjs`, `jobs-*.json` | filtered self-distillation for `mind`, `narrate`, `audience`, `council`, `director`, `consolidate`: scenarios → the model answers through the game's real prompt → kept only if the game's validator passes first try and the leak filters pass |
| `gen2/assemble2.mjs` | builds each phase's training sets (two disjoint halves, gold orders on both, token budgets, rows over 3,400 tokens dropped) |
| `train_kaggle.py` | the Unsloth QLoRA trainer for a Kaggle T4 (fp16, `--init-adapter` continuation, `--time-budget-min`) |
| `kaggle/build_phase.py`, `build_notebook.py` | write the Kaggle notebooks (pinned installs; each GPU runs its own training) |
| `merge_lora.py` | exact average of two LoRA adapters as one rank-64 adapter (no GPU) |
| `eval_adapter.mjs` | convert an adapter to GGUF, write a server spec with `--lora`, queue the game's suites |
| `eval/` | the local measurement tools: `run-candidate.mjs` (start my llama-server, run the suites through a logging proxy), `chain.mjs` + `wait-then-chain.sh` (one GPU job at a time, guards the owner's llama-swap), `fair.mjs` (score on the unseen 125 orders + paired McNemar), `matrix.mjs` (per-order stability across runs), `lora_scale_test.mjs`, `lora_cache_test.mjs`, `lora_cache_control.mjs` (adapter scale / prompt-cache checks), `make_results.mjs` (the published tables), `specs/` (server profiles) |

The portable benchmark harness (no local paths) lives in [`scripts/local-ai/`](../../scripts/local-ai) and is what `RESULTS.md` refers to for reproducing a number on another machine.
