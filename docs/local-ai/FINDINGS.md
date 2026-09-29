# Findings — 2026-09-29 (first snapshot)

Everything here was measured on the owner's PC against the game's own suites at commit `e3a8a36` (see [README](README.md)). Where a
number is still being produced it says **pending**.

## 1. The server can hang, and the game's slot routing triggers it (act on this first)

**What happens.** llama-server livelocks when a request is queued behind a *busy, pinned* slot: two requests in flight with the
same `id_slot`. The second waits for the slot, and when it starts the slot spins forever with no tokens decoded. The log
(owner's build) fills with `erasing old context checkpoint (pos_min == pos_max == n_tokens-1)` every ~10 ms; the newer build stalls
silently. Nothing recovers it but stopping the server. This is upstream and open:
[ggml-org/llama.cpp#28280](https://github.com/ggml-org/llama.cpp/issues/28280).

**Why the game hits it.** [04 §11.3](../gdd/04-ai-system.md) and `docs/HANDOFF.md` §3 pin `interpret`, `mind`, `director` and
`consolidate` to `id_slot: 1`, and `server/minds.js` runs the minds two at a time (`Promise.all` over pairs). Two minds,
one slot: the pattern above.

**Reproduction** (a few minutes; ten real mind/interpret prompts from the bench, `max_tokens` 12, two at a time):

| Server | Pinning | Result |
|---|---|---|
| owner's build `5266f24`, Qwen3.6-35B-A3B | both `id_slot: 1` | **stalled at request 5** |
| owner's build, Qwen3.6-35B-A3B | none (server chooses), 2 at a time | 150 / 150 ok |
| owner's build, Qwen3.6-35B-A3B | `id_slot: 1`, one at a time | 150 / 150 ok |
| owner's build, Qwen3.6-35B-A3B | slots alternating 0 / 1, 2 at a time | 120 / 120 ok |
| owner's build, Gemma 4 26B-A4B | both `id_slot: 1` | **stalled at request 8** |
| owner's build, Gemma 4 26B-A4B | none, 2 at a time | 120 / 120 ok |
| owner's build, Gemma 4 26B-A4B | slots alternating 0 / 1 | 120 / 120 ok |
| official `b11242`, Qwen3.6 and Gemma 4 26B | both `id_slot: 1` | **stalled** (request 5 and 8) |

It is not specific to one model family: it hit the hybrid Qwen (recurrent layers) and the sliding-window Gemma alike. In a full
bench run on the game's routing the Qwen server hung after about 43 mind calls (22 minutes).

**Also:** on the game's routing (Qwen3.6, minds pinned to slot 1, two at a time, before the hang) mind p50 was **12.1 s** and
time-to-first-token p50 **7.6 s** (n = 43) for a ~1,500-token prompt and ~170 tokens out. Whether pinning also stops the pair running
side by side is being measured separately (unpinned figure **pending**).

**Fix (game side):** `slot: null` for every call, or never two requests on one slot at once. The server's own slot choice
(longest common prefix, else least recently used) keeps the narrator's static prefix warm anyway. See
[RECOMMENDATIONS](RECOMMENDATIONS.md) R1.

## 2. The VRAM cliff: 1 GB of headroom is not enough

The owner's Gemma profile (`-ncmoe 10 -ub 2048`, q8_0 KV, 64k) uses **11.6 of 12.2 GB**. Any other program that touches the GPU while
the server is up — a PyTorch process for three seconds, or a second llama-server — makes Windows demote the server's buffers to
system memory, and the server then runs at **half speed until it is restarted**:

| | decode | note |
|---|---|---|
| Gemma 26B, `-ncmoe 10` (11.6 GB), before | 72 tok/s | |
| same, after a 3-second torch CUDA process exits | **35.8 tok/s** | stays there 20 s later, and after a second server exits |
| bench run, same moment | prefill ~1,300 → ~200 tok/s | GPU shows 100 % "utilisation" at only 55 W: it is waiting on memory traffic |
| Gemma 26B, `-ncmoe 14` (10.7 GB), before | 58 tok/s | |
| same, after the torch process | **62 tok/s** | no effect |

So headroom has a price (72 → ~59 tok/s here) and a floor: **keep total VRAM after load at or below about 10.7 GB**, and never
run other CUDA work (training, image generation, a game on this PC) beside the server. The recommended profile is tuned to that.

## 3. Baselines on the game's real pipeline

Server flags are the owner's profiles; the game's prompts, schemas, validators and scoring; unpinned slots; every order put to
the model (`--reader model`). Gates: interpret ≥ 95 %, clarify ≤ 10 %, mind ≥ 85 %, narrate first-try ≥ 90 %, no foreign script.

| Model / profile | interpret (n = 300) | hold-out (n = 25) | clarify | mind in character (n = 123) | mind → fallback | narrate first try (60 weeks) |
|---|---|---|---|---|---|---|
| Qwen3.6-35B-A3B UD-Q4_K_XL, 256k | **91.7 %** (275) | 76 % (19) | 1.3 % | pending | pending | pending |
| Gemma 4 26B-A4B QAT UD-Q4_K_XL, 64k | 84.7 % (254) | 68 % (17) | **14.3 %** | **93.5 %** (115) | 15 of 123 | pending |

Paired on the same 300 orders, Qwen3.6 is better than Gemma with p = 0.003 (McNemar exact: 34 orders only Qwen reads right, 13
only Gemma). The 2026-09-27 result in [04 §11.2](../gdd/04-ai-system.md) — Gemma reads orders better, Qwen "fails" — does not
hold on the current pipeline: that bench used three hand-written prompts and free-form schemas, not this one.

**Why the misses happen** (both runs; the miss lists are in the raw results):

- **Gemma asks when it should act.** 36 of its 46 misses (12 % of all orders) are clarification questions the order did not need: "Which host should
  march to Moat Cailin?" when the lord commands one host; "Who should lead the levies?" when a leader is optional. That is a
  policy the prompt can fix (R2) or a small LoRA can teach.
- **The dossier hides the valid words.** `fund_works` and `hire_officer` are described as `[choice: a kind of works]` / `[choice:
  the office]`; the words themselves (`stables`, `harbour`, `spymaster`) live only in the grammar, which the model cannot read.
  Qwen answered "Build a stable at Seagard" with `almshouse`, "Build a new harbour" with `almshouse`, and "a master of whisperers"
  with `master_at_arms`. Listing them in the dossier is R2.
- **Counting blind spots.** "Six rangers" became `men: 0` (twice): the model did not count rangers as men.
- **Debatable labels.** "Seagard will hold." (expected: no action) and "Go north." (expected: ask) are read the other way by both
  models; "Send two hundred men to reinforce Moat Cailin" is labelled `raise_levies`, which the game's own pre-parser also misses.

## 4. What one call costs (from the wire, real token counts)

| Call | Prompt | Of which static prefix | Reply | Notes |
|---|---|---|---|---|
| interpret | ~2,600 tokens | ~1,400 | ~70–80 tokens | ~55 of them are the forced JSON scaffold (`"who":"none","subject":"none",…`); the schema is 38 KB (591 places, 829 people, 650 houses) and decodes at full speed |
| mind | ~1,500 tokens | ~850 | ~160–170 tokens | |
| narrate | pending | | pending | the dominant cost of a turn |

Prefill is about half the latency of a short call: only the static prefix is cached, and every call still reads ~1,100 new tokens.
Measured on the owner's Gemma profile (clean, fresh server, one request at a time): interpret p50 2.4 s, mind p50 3.3 s, decode
64–66 tok/s under a schema (72 free text), prefill 800–1,300 tok/s. Qwen3.6 with all experts on the CPU: 41 tok/s, prefill ~880 tok/s.

## 5. Flags that do nothing, and memory that runs out

- `--cache-reuse 256` is **silently disabled** for both model families ("cache_reuse is not supported by this context"). Prefix
  caching by slot and the RAM prompt cache (`-cram`) are what work.
- Qwen3.6 at **256k** with all experts in RAM leaves 3.7 GB free after load (working set 20.9 GB); during a bench run with
  `-cram 6144` free RAM fell to **0.99 GB** (process private memory 34 GB). The RAM prompt cache and the recurrent checkpoints
  (63 MiB each, up to 32 per slot by default) are the likely growth. A memory-safe variant (`-cram 1024 -ctxcp 8`) is used for the
  Qwen mind and narrate numbers. The game's own guidance (64k only) is right; the RAM is the reason as much as speed.
- llama.cpp `b11242` removed `--no-mmap`: use `--load-mode none`.
- Prompt-cache checkpoints for these models are large (Qwen3.6 63 MiB each, Gemma 106 MiB), so `-ctxcp` and `-cram` are RAM
  settings, not free performance.

## 6. The model landscape (September 2026), and what was set aside

Fits 12 GB VRAM + 32 GB RAM and is being measured: Gemma 4 **12B** dense QAT (6.7 GB, wholly on the GPU), Gemma 4 **26B-A4B** QAT,
Gemma 4 **E4B** QAT (small specialist), Qwen3.6-35B-A3B, Qwen3.8-27B (dense, 3-bit), Occamy-1.0 (35B-A3B). Speculative decoding:
the Gemma 4 MTP drafters are 0.25 GB files; Qwen3.6 has an MTP build.
Set aside on size or speed: GLM-5.3-Flash (321 B parameters), Inkling-Small (264 B), Qwen3.8-Flash-Next (125 B-A6B), Mistral Small 4
(119 B-A6B), Muse-Glimmer-30B (dense 29.6 B — too slow on this card). Stretch: Nemotron-3.5-Lightning-30B-A3B, Ternary-Bonsai-2-27B.

## 7. Fine-tuning on this PC works

Unsloth runs natively on Windows on the RTX 5070 (torch 2.12.1+cu132 sees compute capability 12.0; unsloth 2026.9.12, trl 0.24,
peft 0.21, bitsandbytes 0.50.2): no WSL needed. Gemma 4 E4B QLoRA needs about 10 GB; the 26B-A4B MoE needs more than 40 GB
(rented GPU). It must never run while the model server is up (§2).

## Checklist (updated as it is done)

- [x] Baselines: interpret and hold-out for Qwen3.6 (256k) and Gemma 26B; mind for Gemma
- [ ] Baselines: mind and narrate for Qwen3.6; narrate for Gemma; 12-turn playtest
- [ ] Candidates: Gemma 12B, E4B, Occamy, Qwen3.8-27B; MTP and n-gram speculative decoding
- [ ] Tuning: expert placement, batch, KV type, context (16k / 32k / 64k / 256k), threads, `--fit`
- [ ] The two prompt fixes, measured (R2), and a schema pattern against foreign script
- [ ] llama-swap `config.yaml`, the game's routing block, the owner's checklist
- [ ] LoRA for interpret (only if the gates are still missed)
