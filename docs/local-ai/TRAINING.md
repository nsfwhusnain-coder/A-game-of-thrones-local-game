# How Maester-12B was made (recipe, data, cost) — and how to redo it

*Everything here was done 2026-09-29 → 2026-10-01 by an AI agent (Claude) on the owner's PC and a free Kaggle account (2× Tesla T4, 15 GB each; ~30 GPU-hours a week, ~16 used). The training and evaluation code is in [`finetune/westeros/`](../../finetune/westeros/README.md).*

## The recipe in one paragraph

**Filtered self-distillation.** Gemma 4 12B QAT is asked to do the game's own calls on thousands of generated situations; only the answers that
pass the game's **own validators on the first try** (plus leak filters and, for `mind`, an oracle) are kept as training examples. The
interpreter is additionally trained on **engine-labelled** orders (the game's own generator, checked by the game's own `check()`, round-trip
and rule pre-parser) and on the game's **human-written gold orders** (200 of the 300 suite orders, twice; the other 100 + the 25 hold-out are
never seen). No book text, no post-298 knowledge, no model-written labels for orders. The result is a LoRA (QLoRA, 4-bit base) on the 12B.

## Data

| source | what | how it is labelled | filters |
|---|---|---|---|
| interpret, engine-labelled | ~45 order families (the game's generator's 24 plus 21 added here: send_person, march_host, letters, levies, taxes, works, non-order lines, clarify cases, multi-action …) in randomised worlds | the intent that generated the order → `perform` on a copy of the state (must be legal) → `check()` accepts → `readingOf` round-trips → the rule pre-parser does not read it differently | drops near-duplicates of dev/hold-out orders (text overlap ≥ 0.8) |
| interpret, gold | the game's human-written labelled orders (suite index % 3 ≠ 0), ×2 | the game's `expect` | – |
| interpret, paraphrases | rephrasings of the gold train orders by the base model | kept only if every name and number survives, `check()` accepts the gold label, the label round-trips, the rule parser agrees | not near a dev/hold-out order |
| mind (natural + suite-like) | the game's mind situations, model answers | first-try `check()` pass **and** (natural) agrees with the rule-based house ways, which are 94 % in character on the suite; (suite-like) picks a CORE verb of the suite with the suite's (type, actor) pairs held out | – |
| narrate, audience, council, director, consolidate | the game's calls in generated scenarios (`scen_*.mjs`) | first-try validator pass (numbers, places, names, arrivals, script, anachronism) | leak filters: foreign script, anachronism, post-298 spoilers |

Sizes per training phase (each of the two GPUs gets a *different half* of the synthetic rows; the gold orders go to both):

| phase | purpose | rows per run | tokens per run | learning rate | steps (≈ 130 s each on a T4) |
|---|---|---|---|---|---|
| 1 | interpret only | 858 | 2.27 M | 1.5e-4 → 15 % | 108 |
| 2 (restarted as 2b/2c after a data defect) | + mind, narrate, audience, council, director, consolidate, interpret replay, repair rows | 860 | 1.73 M | 1e-4 → 0 | 108 |
| 3 | round-2 filtered rows (teacher = base 12B + the phase-1 adapter) + interpret replay | 798 | 1.73 M | 6e-5 | 100 |
| 4 | short corrective phase: canonical "raven to <place>" rows, unseen gold slice, retention mix | 439 | 0.98 M | 4e-5 | 55 |

## Training setup (both GPUs, each its own single-GPU run)

- Unsloth QLoRA on `unsloth/gemma-4-12b-it` (4-bit NF4 base, fp16 compute — a T4 has no bf16); LoRA r = 32, α = 32, dropout 0, all attention and MLP projections
  of the text decoder; AdamW 8-bit, weight decay 0.001, cosine schedule with 6 % warm-up decaying to 15 % of the peak (phase 2: to zero), effective batch 8 (1 × 8 accumulation), gradient
  checkpointing; loss only on the assistant answer; rows over **3,400 tokens are dropped, never truncated**; `expandable_segments` allocator. Peak 13.2 GB per T4.
- Versions that work (pinned in the notebooks): unsloth 2026.9.12, unsloth_zoo 2026.9.8, trl 0.24.0, peft 0.21.0, accelerate 1.15.0, bitsandbytes 0.50.2, datasets 4.3.0, then
  `transformers==5.10.0` **after** Unsloth (Gemma 4 12B is `gemma4_unified`; Unsloth pins ≤ 5.5, which cannot load it; the override works).
- Two-GPU training with DDP ran out of memory (+1.3 GB for DDP buffers on top of 13.2 GB), so each T4 trains its own adapter on its own data half and the two are **averaged exactly**
  (mean of the two weight updates, expressed as one rank-64 LoRA — `merge_lora.py`, no GPU needed). One half alone is noisy (114 vs 105 of 125 for the two phase-2 halves); the average is the deliverable.
- Each phase continues from the previous phase's adapters (`--init-adapter`), so the phases are one long training run split to fit a Kaggle session (12 h cap).

## Serving the adapter (what to know)

- Convert with llama.cpp's `convert_lora_to_gguf.py` (stock in b11242; base model id `unsloth/gemma-4-12b-it`, f16): `finetune/westeros/eval_adapter.mjs` does it.
- Load it with `--lora <file>` on top of the 4-bit GGUF — **do not merge it into the 4-bit file** (llama-export-lora + requantise): the adapter's effect is smaller than the 4-bit
  step and disappears (interpret 108/125 = untuned, unmerged 110/125). Cost of the unmerged adapter: ~23 % decode speed; the MTP drafter more than pays that back.
- Per-request scale: `"lora": [{"id": 0, "scale": 0}]` turns the adapter off for one request (identical to the plain model, verified); `1` turns it on. llama-server reuses cached
  prompt tokens only between requests of the same scale (verified), so alternating costs one prefix re-read.

## Redoing it after the game is finished

1. Freeze the prompts/schemas of `interpret`, `mind`, `narrate`, `audience`, `council`, `director`, `consolidate` (and add the other kinds you want tuned: letters, advisors, counsel, polish).
2. Regenerate the data against the final game (`finetune/westeros/gen2/`: `build_interpret2.mjs`, `serve-run.mjs` + `rft.mjs` jobs, `assemble2.mjs`), folding in `MODEL-WISHLIST.md` and any logged
   play-test failures (rejected replies → preference pairs; corrected replies → examples).
3. Train the phases on Kaggle (`finetune/westeros/kaggle/build_phase.py` writes the notebooks), download, average, convert, score on the **unseen** orders with `eval/fair.mjs`, and
   **score several adapters and replicates** before believing a number (noise ±2–5 orders of 125; adapter-to-adapter spread 9).
4. What would move narrate (stuck at ~84 % first-try): preference-style training on (passing, failing) pairs for the same prompt; more of the same filtered examples did not help.
