# Local AI for Westeros Chronicles — measurements, the Maester-12B model, and how to use it

*Started 2026-09-29 on the owner's PC (RTX 5070 12 GB, Ryzen 5 7500F, 32 GB DDR5-6000, Windows 11). Nothing here changes the game's code: it is evidence, advice, ready-to-apply patches and a tuned local model for the game's builder and the owner.*

**Start here:** [`REPORT.md`](REPORT.md) (one page) → [`MAESTER-12B.md`](MAESTER-12B.md) (what the model can and cannot do, and how to build the game around it).

| File | What it is |
|---|---|
| [`REPORT.md`](REPORT.md) | The final report: what was built, what it achieves, what it does not. |
| [`MAESTER-12B.md`](MAESTER-12B.md) | **For the game's builder:** the model's capabilities per call kind, its weaknesses, design rules, budgets. |
| [`RESULTS.md`](RESULTS.md) | Every number: headline, all runs (auto-generated table), speed and memory, per-order misses, what did not work, earlier baselines. [`results/`](results/) has the machine-readable runs. |
| [`MODEL-WISHLIST.md`](MODEL-WISHLIST.md) | **Add a row whenever a model-driven call behaves badly** — the next fine-tune is built from this list. |
| [`samples/`](samples/) | A real 8-turn scripted playtest of the game on Maester-12B (orders, audience, council, minds, narrator) — read it to see what the model actually writes. |
| [`RECOMMENDATIONS.md`](RECOMMENDATIONS.md) | R1–R11: concrete changes for the game (file, evidence). [`patches/`](patches/) has ready patches for R2, R7, R8. |
| [`TRAINING.md`](TRAINING.md) | How Maester-12B was made (data, recipe, cost) and how to redo it. Code: [`../../finetune/westeros/`](../../finetune/westeros/README.md). |
| [`OWNER-CHECKLIST.md`](OWNER-CHECKLIST.md), [`deploy/`](deploy/) | Putting it into play: llama-swap entries, the game's routing block, the adapter's identity. Nothing has been applied. |
| [`FINDINGS.md`](FINDINGS.md) | The first snapshot (2026-09-29): baselines, the slot-pinning hang, the VRAM cliff, flags that do nothing. Superseded for the model choice; still right about the hang and the cliff. |
| [`HANDOFF.md`](HANDOFF.md) | State and rules for the next agent. |

## How the numbers were made

- **Game code:** commit `255b302` of `claude/brave-ramanujan-i8dt0q` for the final results (`e3a8a36` for the first baselines). Interpret/mind prompts and validators are unchanged between the two; the narrator was rewritten in between.
- **Suites and scoring:** the game's own — `bench/suites/*` (300 interpret orders + 25 hold-out, 123 mind situations, 60 narrate weeks, the voices suite), scored by the game's own `bench/lib/*.js`, with the game's own prompts, schemas and validators, imported (never copied or modified) by a runner that records every
  request and reply through a logging proxy. **Tuned models are scored on the 125 orders no training row was built from.**
- **Servers:** llama.cpp `b11242` (official Windows CUDA 13.4 build) on its own port, apart from the owner's llama-swap (untouched); the first baselines also used the owner's build `5266f24`.
- **Raw material** (wire logs of every request and reply, tens of MB each) stays on the owner's PC in `C:\wc-ai\eval\results\`; compact summaries are committed here.
