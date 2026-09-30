# Results — every number behind Maester-12B

*Measured 2026-09-29 → 10-01 on the owner's PC (RTX 5070 12 GB, Ryzen 5 7500F, 32 GB) with the game's own suites, prompts, schemas and validators (game commit `255b302` unless a row says `e3a8a36`).
llama.cpp b11242. Raw request/reply logs stay on the owner's PC (`C:\wc-ai\eval\results\`); compact per-run numbers are in [`results/runs.json`](results/runs.json).
What Maester-12B is and how to use it: [MAESTER-12B.md](MAESTER-12B.md). How it was made: [TRAINING.md](TRAINING.md).*

## 1. How to read the numbers

- **Interpret is scored on the "fair 125"**: the 100 dev orders (suite index % 3 = 0) plus the 25 hold-out orders. The other 200 suite orders are inside the fine-tuning data (twice), so a tuned model's score on all 300 is inflated
  (e.g. p2M 93 % on 300 vs 88 % on the fair 125) and is not quoted as its quality.
- **Noise.** The same untuned model scores 108, 107, 108 of 125 on repeats (105 with MTP); the same adapter 110, 110 (p2M) and 111, 112 (p3M). Test-set sampling noise is larger than run-to-run noise: **treat < 5 orders (4 points) as no difference.**
  Two half-data adapters trained the same way differ by up to 9 orders (phase 2: 114 vs 105), so a single adapter's score is partly luck — the deliverable is the exact average of the two.
- Mind is 123 situations, narrate 60 weeks (212 stories), voices 61 calls (audience 20, council 15, director 20, consolidate 6): small samples; a difference of 1–3 calls is noise.
- "First try" = the model's first reply passes the game's own validator; the retry/fallback machinery of the game is left on, as in play.

## 2. Headline

| | untuned Gemma 4 12B | **Maester-12B v1** (adapter p2M) |
|---|---|---|
| interpret, fair 125 | 107.7 of 125 (86.2 %); runs 107, 108, 108; 105 with MTP | **110 of 125 (88.0 %)**; runs 110, 110; 109 with MTP |
| clarifying questions (of 325 orders) | 6.5 % | **2.5 %** |
| mind in character (123) | 106 (86.2 %), **16 needed the game's fallback** | **110 (89.4 %), 2 fallbacks**; 108 / 3 with MTP |
| council first try (15) | 8 | **13** |
| audience / director / consolidate first try | 18/20 · 17/20 · 6/6 | 18/20 · 19/20 · 6/6 |
| stray foreign-script tokens (all suites, one run each) | **22** | **3** (4 with MTP); the game's gate is 0 |
| retries needed per 100 interpret calls | 7.4 | **4.1** (3.3 with MTP) |
| narrate first try (212 stories) | 84.0 % (repeats 84.5 ±1) | 80.7 % (85.4 % at temperature 0.7) — **no gain, routed to the untuned alias** |
| decode, free text | 55 tok/s (95 with MTP) | 43 tok/s (**75 with MTP**) |

Gates in the design doc (interpret ≥ 95 %, mind ≥ 85 %, narrate ≥ 90 %, script 0): Maester-12B passes **mind** (89 %) and comes close on script glitches; **interpret (88 % on unseen orders) and narrate (~84 %) do not reach the gates**. The ceiling on interpret
with this pipeline is ~93 %: nine of the 125 orders are missed by every model (§5), two of them because of a game-side validator (R8, +2 orders when fixed: untuned 107–108 → 110, p3M 111–112 → 113).

## 3. Every run

| run | interpret, fair 125 (dev 100 + holdout 25) | clarify | mind in character | mind fallbacks | narrate first try | voices first try (audience / council / director / consolidate) |
|---|---|---|---|---|---|---|
| Gemma 4 12B, untuned (3 runs) | **107.7 mean/125 = 86.2 %** (runs: 107, 108, 108) | 6.5 % | 106/123 = 86.2 % | 16 | 178/212 = 84 % | 18/20 / 8/15 / 17/20 / 6/6 |
| untuned + MTP | **105/125 = 84 %** (runs: 105) | 6.5 % | 107/123 = 87 % | 19 | – | – |
| untuned, game with the R8 men-count fix | **110/125 = 88 %** (runs: 110) | 6.5 % | – | – | – | – |
| phase 1 (interpret only): p1A | **110/125 = 88 %** (runs: 110) | 2.2 % | – | – | – | – |
| phase 1: p1B | **107/125 = 85.6 %** (runs: 107) | 1.8 % | – | – | – | – |
| phase 1: p1M (average) | **108/125 = 86.4 %** (runs: 108) | 2.2 % | – | – | – | – |
| phase 1: p1A merged into the 4-bit model | **108/125 = 86.4 %** (runs: 108) | 4.3 % | – | – | – | – |
| phase 2: p2A | **114/125 = 91.2 %** (runs: 114) | 2.8 % | 106/123 = 86.2 % | 4 | 164/212 = 77.4 % | 17/20 / 10/15 / 18/20 / 6/6 |
| phase 2: p2B | **105/125 = 84 %** (runs: 105) | 2.2 % | 110/123 = 89.4 % | 3 | 178/212 = 84 % | 17/20 / 12/15 / 17/20 / 6/6 |
| **phase 2: p2M (average of A+B) = Maester-12B v1** | **110 mean/125 = 88 %** (runs: 110, 110) | 2.5 % | 110/123 = 89.4 % | 2 | 171/212 = 80.7 % | 18/20 / 13/15 / 19/20 / 6/6 |
| p2M + MTP (the default served profile) | **109/125 = 87.2 %** (runs: 109) | 2.5 % | 108/123 = 87.8 % | 3 | – | – |
| phase 3: p3A | **112/125 = 89.6 %** (runs: 112) | 2.8 % | – | – | – | – |
| phase 3: p3B | **112/125 = 89.6 %** (runs: 112) | 2.5 % | – | – | – | – |
| phase 3: p3M (average) | **111.5 mean/125 = 89.2 %** (runs: 111, 112) | 3.1 % | 105/123 = 85.4 % | 0 | 180/212 = 84.9 % | 19/20 / 9/15 / 19/20 / 5/6 |
| p3M, game with the R8 men-count fix | **113/125 = 90.4 %** (runs: 113) | 2.8 % | – | – | – | – |
| phase 4: p4M (average) | **111/125 = 88.8 %** (runs: 111) | 3.4 % | 107/123 = 87 % | 6 | – | – |

`R8 fix` rows use the game with the men-count patch ([`patches/R8-…`](patches/R8-men-count-number-words.patch)). "Merged" = the adapter folded into the 4-bit model (no effect: §7).
p1 = interpret-only training; p2 = + mind/narrate/voices data; p3 = + a second round of filtered data; p4 = a short corrective round. Phases 3 and 4 **did not improve on phase 2 measurably** (interpret +1–2 orders, mind −3 to −5, voices −2 to −4 calls: all noise), which is why
v1 is the phase-2 average — the earliest, simplest adapter that already carries the whole gain, and the only one validated end to end (MTP, speed, prompt cache, llama-swap).

## 4. Speed and memory (RTX 5070, b11242, `--parallel 2`, 64k, q8_0 KV; clean runs on the game's real prompts)

| setup | VRAM after load | free-text decode | interpret p50 | mind p50 | narrate p50 |
|---|---|---|---|---|---|
| untuned | 8.7 GB | 55 tok/s | 1.7 s | 3.7 s | 8.1 s |
| untuned + MTP | 9.3 GB | 95 tok/s | 1.0 s | 2.2 s | 4.5 s |
| adapter on (rank 32) | 9.0 GB | 44 tok/s | 2.2 s | 4.2 s | 10.1 s |
| **adapter on + MTP (rank 64 = v1)** | **9.7 GB** (9.9 after a busy session) | **75 tok/s** | **1.4 s** | **2.5 s** | **5.7 s** |

Inside the quality runs (game concurrency, noisy): mind p50 untuned 4.9 s, tuned 5.4 s, tuned + MTP 3.6 s. Everything is under the 10.7 GB line above which any other GPU program halves the server's speed.

## 5. Where the interpreter misses (125 unseen orders; `matrix.mjs` over 3 untuned and 3–5 tuned runs)

- **Missed by every run (untuned and tuned) — 9 orders** in the latest matrix: two men-count (R8: "six/three rangers"), two non-order lines where the gold says "story" and the models ask or act ("Pay the iron price.", "Pay the Iron Bank what we owe."), "Raise the taxes on the thralls." (level `high` vs `crushing`),
  a multi-action muster, and three ambiguous gold labels. These are label/validator questions, not model capacity.
- **Tuned model always right, untuned always wrong — 6 orders**: three non-order lines the untuned model turns into a clarifying question ("Keep watch on the sea for longships.", "Aeron is to preach in the villages.", "Have Hodor carry Bran to the godswood."), "Stand the host down" (untuned halts instead of disbanding), "Raise the Iron Fleet and sail for Moat Cailin" (untuned levies instead of marching) and an escort order.
- **Untuned right, tuned wrong — 3–4 orders**: "a raven to the Eyrie" (the tuned model names a wrong lord; the gold says Lady Lysa and the recipient is not in the dossier — R10), "Bring three thousand spears to White Harbor" (read as a march instead of a levy), "Order the Umbers and the Karstarks to Moat Cailin".
  A corrective phase 4 with 52 canonical "raven to <place>" rows per run did **not** fix the Eyrie orders (only ~4 of those rows were about the Eyrie): the honest fix is a dossier line, not more data.
- The untuned model fails first try more often (7.4 retries per 100 calls against 4.1) and is rescued by the game's retry; the tuned model answers first try and is sometimes confidently wrong. The suites score the final reading.

## 6. Category notes

**Narrate (212 stories, first-try faithful).** Untuned 84.0 % (repeats 85.4, 84.1); 12B at temperature 0.6 / 0.7 / 0.7 (repeat): 85.4 / 87.7 / 84.0 — the temperature is not a lever. Tuned: p2A 77.4 / 79.7, p2B 84.0, p2M 80.7 (85.4 at 0.7), p3M 84.9, p4M 79.2.
Faults by kind (untuned → p2M): numbers 17 → 14, places 22 → 16, arrivals 12 → 8, **foreign script 15 → 1**, names 0 → 4. Tuning removes the script glitches but not the invented numbers/places, so narrate stays on the untuned alias.
For reference, the untuned Gemma 4 26B-A4B reached 88.0 % on narrate (game `e3a8a36`, owner's profile) — the best of the models tried — at 11.6 GB VRAM (over the cliff) and a slower prefill.

**Mind (123).** Untuned 106 in character with 16 fallbacks; p2M 110 with 2. (The suite scores the fallback's pick when the game's matcher rejects the model's; see R7.)

**Voices (61 calls).** Council is the visible gain (8 → 13 of 15; p2A 10, p2B 12, p3M 9, p4M 11): every tuned adapter is at or above the untuned 8.

**Stray foreign script.** Untuned 22 in one full run (mostly mind/narrate/voices at temperature ≥ 0.6; interpret at 0.2 has none). p2M 3, p3M 0, p4M 5: a real reduction (p2A had 14, p2B 2), though not yet the game's gate of 0.

## 7. What did not work

- **Merging the adapter into the 4-bit model**: interpret 108/125 (= untuned), against 110 unmerged. The adapter's update is smaller than the 4-bit quantisation step. Serve it unmerged (−23 % decode speed, repaid by MTP).
- **Phase 1 (interpret-only)**: 110 / 107 / 108 (A / B / average) — no gain; a data defect (recipients of "a raven to <place>") made some orders worse until phase 2b removed it.
- **Sampler flags**: `--min-p 0.05` did not remove the stray script glitches and made narrate worse (76.4 %); temperature 0.6–0.7 did not help narrate.
- **More rounds of the same data (phases 3–4)** did not improve on phase 2. What might: preference-style training on (passing, failing) pairs, human-written data, and game-side fixes (R7, R8, R10).
- **Adapter scale 0.6** instead of 1: same score (111 vs 110).
- **Two-GPU DDP** ran out of memory on the T4s; two independent runs + exact averaging replaced it.

## 8. Earlier baselines (first snapshot, game `e3a8a36`, owner's llama.cpp build 5266f24 unless noted)

| model | interpret n = 300 | fair 125 | hold-out 25 | clarify | mind in character | narrate first try | decode |
|---|---|---|---|---|---|---|---|
| Qwen3.6-35B-A3B Q4, 256k (RAM-safe) | 91.7 % | 108 (86.4 %) | 76 % | 1.3 % | 88.6 % (32 fallbacks) | 75.1 % | 41 tok/s |
| Gemma 4 26B-A4B QAT, 64k (owner profile) | 84.7 % | 106 (84.8 %) | 68 % | 14.3 % | 93.5 % (15 fallbacks) | 88.0 % | 72 tok/s (halves if VRAM > 10.7 GB) |
| Gemma 4 12B QAT (b11242), untuned | 90.7 % | 108 (86.4 %) | 72 % | 2 % | 89.4 % (19 fallbacks) | 85.4 % | 55 tok/s (95 with MTP) |

On the fair 125 the three are indistinguishable (McNemar p 0.8–1.0). The 12B was chosen for speed (wholly on the GPU, MTP), stability (no VRAM cliff) and because a 12B can be fine-tuned on free Kaggle T4s; the 26B MoE could not be (> 40 GB).

## 9. Reproduce

`finetune/westeros/eval/` has the tools (`fair.mjs` for the unseen-order score and paired test, `matrix.mjs`, `make_results.mjs` which produced §3 from the raw runs). The portable harness that runs the game's suites against any endpoint is `scripts/local-ai/wc-bench.mjs`.
