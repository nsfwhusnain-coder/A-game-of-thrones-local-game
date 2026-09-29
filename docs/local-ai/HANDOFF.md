# HANDOFF — local AI for Westeros Chronicles (state at 2026-09-29, ~14:40 local)

Read this first, then `C:\wc-ai\NOTES.md` (the running log, with every verified fact and its evidence).
Published findings live on GitHub, branch `wp/local-ai-findings` (`docs/local-ai/`, NOT merged into the default branch).

## 0. The job, and the rules that still apply
Build/tune the best local LLM setup for the owner's game on this PC (RTX 5070 12 GB, Ryzen 5 7500F, 32 GB DDR5-6000, Windows,
llama.cpp behind llama-swap :8033). The owner plays from ANOTHER PC; this PC only hosts the model. The model proposes; the engine decides.
- NEVER kill/restart the owner's `llama-swap` (scheduled task `llamaswap`) or its `llama-server`. Run your own servers on other ports (8090+),
  stop only PIDs you started (`eval/lserve.mjs` records them in `logs/lserve.pids.json`; `node lserve.mjs stop-all`).
- NEVER run any other CUDA program (torch, Unsloth, a 2nd llama-server) while a server or benchmark holds the GPU (see F7).
- No book text in training data; no post-298 knowledge; owner said to save learnings to the game's GitHub repo (new branch, new files only).
- **Owner instruction (relayed): all fine-tuning and testing is permanently HALTED.** Do not restart training. Do not launch GPU jobs
  unless the owner asks. The job daemon is stopped (`eval/queue.stop` exists; the `queue.todo` items were never run).

## 1. What changed since I (Claude) last touched the project — Gemini 3.8 Flash's session
Gemini inspected the PC, validated the 3,518-pair synthesized interpret dataset, patched Unsloth's loss calculation and the LoRA-to-GGUF
conversion for Gemma 4's architecture (scripts `finetune/check_bnb.py, convert_lora.py, measure.py, test_*.py`), and tried a local 4-bit QLoRA
of **Gemma 4 E4B** on the RTX 5070. Result: it cannot train locally. Gemma 4 has ~2.82 B parameters of unquantised per-layer input embeddings
= ~7.0 GB VRAM on their own; with the 42 layers and activations for 2,600–3,700-token dossiers total demand was ~13.7 GB, Windows WDDM spilled
~1.4 GB to system RAM, GPU power fell to ~50 W and steps took ~4.5 min (~63 h ETA). Training was stopped for good at the owner's instruction.
Consequences: a local LoRA of E4B is not viable on 12 GB. Options left (all need owner approval): a shorter-sequence/no-few-shot training format,
a different small dense base (e.g. a Qwen3.5-9B-class model), or the rented-GPU recipe for the 26B-A4B (>40 GB; not yet written).
Gemini's `finetune/` scripts were not reviewed by me; treat them as unverified. `finetune/runs/` contains copies of some results dirs (odd; harmless).

## 2. Where everything is
| Path | What |
|---|---|
| `C:\wc-ai\NOTES.md` | running log, findings F1–F10, publishing procedure |
| `C:\wc-ai\eval\` | harness (see §4), `specs\*.json` server profiles, `results\<run>\` (summary.json, wire.jsonl = every request/reply, *.md reports), `speed\` |
| `C:\wc-ai\portable\` | repo-relative copies of the harness (paths.mjs); already copied into the publish clone at `scripts/local-ai/` (passes the repo's check-syntax; NOT yet committed) |
| `C:\wc-ai\game\repo` | pinned game clone @ e3a8a36 (measurement baseline; don't switch branch mid-run) |
| `C:\wc-ai\game\repo-patched` | scratch copy with 3 prompt/matcher patches (P1 choice lists, P2 don't over-ask, P3 tolerant mind matcher) — untested A/B |
| `C:\wc-ai\game\publish` | fresh clone on branch `wp/local-ai-findings` for pushing (needs `GIT_TERMINAL_PROMPT=0 GCM_INTERACTIVE=never`) |
| `C:\wc-ai\bin\llama-b11242` | official llama.cpp Windows CUDA 13.4 build (`--no-mmap` removed: use `--load-mode none`) |
| `C:\wc-ai\models\` | Gemma 4 12B QAT + MTP drafters (12B, 26B-A4B, E4B), E4B QAT, Qwen3.6-35B-A3B **MTP** (22.9 GB); owner's models are in `C:\models` |
| `C:\wc-ai\finetune\` | venv (`.venv`, torch 2.12.1+cu132, unsloth 2026.9.12), `gen\build_interpret.mjs` (dataset generator), `data\interpret-train.jsonl` (3,518 rows), `train_interpret.py` |

## 3. Results so far (game commit e3a8a36; owner's llama.cpp 5266f24 unless noted; slots UNPINNED)
Gates: interpret ≥95 %, clarify ≤10 %, mind ≥85 %, narrate first-try ≥90 %, foreign script 0.
| Run | interpret (n=300) | holdout (25) | clarify | mind in-char (123) | mind fallbacks | narrate first-try (233 stories) | plain | foreign |
|---|---|---|---|---|---|---|---|---|
| Qwen3.6-35B-A3B Q4, 256k (RAM-safe flags) | 91.7 % | 76 % | 1.3 % | 88.6 % | 32 | 75.1 % | 15.9 % | 13 |
| Qwen3.6, 64k (sample 40) | 95 % (n=40) | 72 % | 0 | 92.1 % (n=38) | 8 | 69.4 % | 23.4 % | 5 |
| Gemma 4 26B-A4B QAT, 64k (owner profile) | 84.7 % | 68 % | 14.3 % | 93.5 % | 15 | 88.0 % | 4.3 % | 2 |
| Gemma 4 12B QAT dense, b11242 (narrate NOT run) | 90.7 % | 72 % | 2 % | 89.4 % | 19 | — | — | — |
Not run: Gemma E4B, Gemma 26B on b11242, Occamy, Qwen3.8-27B, MTP/ngram speculative decoding, any tuning sweep (`-ncmoe`/`--fit`, `-ub`, KV type,
ctx 16/32/64k, threads), the prompt/matcher A/B, `voices` suite (audience/council/director/consolidate; harness written, mock-tested), fixed-judge
scoring, the 12-turn playtest (use the LATEST game clone: scripts import by file URL there), llama-swap `config.yaml`, `game-routing.json`,
OWNER-CHECKLIST.md, REPORT.md. None of the brief's final deliverables exist yet.
Paired result: Qwen3.6 beats Gemma 26B on interpret (p=0.003). Nobody meets 95 % on the full suite; Gemma 26B misses narrate (88 %), Qwen narrate is worse
and leaks CJK (13 replies). Gemma 12B is the surprise: near-Qwen interpret, fully on GPU (6.7 GB) — most promising for speed; finish its evaluation.

## 4. Key findings (details + evidence in NOTES.md / docs/local-ai)
1. **Hang bug (llama.cpp #28280, still in b11242):** two concurrent requests pinned to the same `id_slot` livelock the server (Gemma 4 and Qwen alike). The game's
   routing (minds pinned to slot 1, run two at a time) triggers it. Use `slot: null` for every call. Safe: unpinned, or distinct slots.
2. **VRAM cliff:** keep total VRAM after load ≤ ~10.7 GB. The owner's Gemma profile (11.6 GB) halves in speed permanently (72→36 tok/s) if anything else touches the GPU;
   `-ncmoe 14` (10.7 GB) is immune (~59 tok/s). Gemini's failed training is the same mechanism.
3. `--cache-reuse` is a no-op on Gemma 4/Qwen3.x. Qwen 256k + `-cram 6144` exhausts 32 GB RAM; use `-cram 1024 -ctxcp 8` (and 64k only).
4. **Game-side bugs found (recommend to the game agent; not fixed):** (a) mind `intentOf` rejects valid answers when the model fills `target`/`leader` on verbs that take none
   (set_tax, hold_tourney, hold_feast) → ~18–26 % first-try failures and 12–26 % fallbacks (P3 patch in repo-patched); (b) interpret `check()` rejects correct `men` counts unless the order has a
   digit or a noun from a short list ("six rangers", "fifty archers" fail → retry → `men:0`); (c) interpret dossier hides valid `[choice]` words (P1); Gemma over-asks clarifying questions (P2);
   (d) `llm-log.jsonl` stores no prompt/schema; (e) `timeoutSec` 1800 idle-socket timeout means a hung server stalls a turn 30 min.
5. Narrate faults are invented numbers/places/names/arrivals (Gemma: numbers 13, places 19, arrival 8, names 5, script 1). Mind text is not scanned for spoilers by the game (`eval/leaks.mjs` does; found 1 "red keep is" and narrate "green fork" hits on Gemma).
6. Old 2026-09-27 toy bench (Gemma better than Qwen at interpret) does NOT hold on the real pipeline.

## 5. Harness cheat-sheet (all in `C:\wc-ai\eval`)
- `node run-candidate.mjs --spec specs\X.json [--name N] [--suites interpret,holdout,mind,narrate,voices] [--sample K] [--append] [--repo C:/wc-ai/game/repo-patched] [--slots free|game]`
  starts MY llama-server (port 8090), runs the game's suites through the logging proxy, writes `results\N\`, stops it; has a 5-min hang watchdog. Specs default to `slots: free`.
- `node aggregate.mjs [--only a,b]` comparison tables; `node compare.mjs runA runB` paired McNemar; `node leaks.mjs results\N`; `node judge.mjs` (fixed judge model, untested);
  `node speed.mjs` / `quick-speed.mjs` (clean speed on real prompts; needs `corpus\`); `hangtest.mjs` / `repro-hang.mjs` (livelock reproducer); `contam-test*.mjs` (VRAM cliff demo).
- Data generator: `node finetune\gen\build_interpret.mjs --worlds 120 --per 26 --seed 11` (dev split = suite index%3==0, plus the 25 holdout, never written to train).
- Rules: one GPU job at a time; check `nvidia-smi` is ~0.3–1 GB before starting; no torch while benchmarking.

## 6. Publishing state
Pushed: `wp/local-ai-findings` @ 5940b4d (README, FINDINGS, RECOMMENDATIONS; CI green). Local, uncommitted in `C:\wc-ai\game\publish`: `scripts/local-ai/*` (portable harness) and this file.
FINDINGS.md still says mind/narrate for Qwen are "pending" — update with §3. R7 (mind matcher), R8 (men-count check) are not yet written into RECOMMENDATIONS.md.
The owner has NOT merged the branch; open PR: https://github.com/nsfwhusnain-coder/A-game-of-thrones-local-game/pull/new/wp/local-ai-findings

## 7. Suggested next steps (need owner go-ahead for anything touching the GPU)
1. Ask the owner whether GPU work may resume. If yes: finish Gemma 12B (narrate, voices), run the P1–P3 A/B, test `slot:null` + `-ncmoe 12–14`/ub tuning for headroom, MTP on 12B.
2. Regardless: write REPORT.md, `llama-swap/config.yaml` (winner + runner-up, one group, sampler flags, `--reasoning off`, `--load-mode none`, VRAM ≤10.7 GB), `game-routing.json` (all `slot:null`), OWNER-CHECKLIST.md,
   R7/R8 in RECOMMENDATIONS; commit `scripts/local-ai/` + docs and push to the same branch.
3. Provisional recommendation from current data: Gemma 4 12B (dense, on GPU, unpinned slots, 64k) as default if its narrate passes; Qwen3.6 only with the CJK/narrate problems accepted. Not final.
