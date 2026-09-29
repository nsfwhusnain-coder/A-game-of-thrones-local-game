# Local AI for Westeros Chronicles — measurements, findings, tuning

*Started 2026-09-29 on the owner's PC (RTX 5070 12 GB, Ryzen 5 7500F, 32 GB DDR5-6000, Windows 11). Work in progress: this folder is
updated as results arrive. Nothing here changes the game's code; it is evidence and advice for the game's builder and the owner.*

| File | What it is |
|---|---|
| [`FINDINGS.md`](FINDINGS.md) | What was measured and what it means: the baselines on the game's real pipeline, the server hang, the VRAM cliff, the prompt gaps. Numbers first. |
| [`RECOMMENDATIONS.md`](RECOMMENDATIONS.md) | Concrete changes for the game's builder, each with the file it touches and the evidence for it. |

## How the numbers were made

- **Game code:** commit `e3a8a36` of `claude/brave-ramanujan-i8dt0q`. Up to #42 the AI code and prompts (`server/ai/`, `bench/`,
  `server/llm.js`, `server/minds.js`, `server/narrator.js`) are unchanged apart from `scripts/bench.js` and `scripts/playtest.js`
  importing by file URL; small engine fixes landed (musters, chokepoints, `world.js`), so differences of a point or two should be
  re-measured on the current branch before they are relied on.
- **Suites and scoring:** the game's own — `bench/suites/*` (300 interpret orders + 25 hold-out, 123 mind situations, 60 narrate
  weeks), scored by the game's own `bench/lib/*.js`, with the game's own prompts, schemas and validators, imported (never copied
  or modified) by a runner that also records every request and reply through a logging proxy.
- **What the runner adds:** per-call latency and time-to-first-token, real prompt sizes from the server's own token counts,
  cache hits, first-try validity, retries, deterministic-fallback counts, foreign-script leaks, and the game's real concurrency
  (minds two at a time; everything else one at a time).
- **Servers:** llama.cpp `0.4.0-dev` commit `5266f24` (the owner's build) and the official `b11242` Windows CUDA 13.4 build, each on
  its own port, apart from the owner's llama-swap (untouched).
- **Raw material** (wire logs of every request and reply, tens of MB each) stays on the owner's PC in `C:\wc-ai\eval\results\`.
  Small summaries are committed here as they are produced.

## Status

See the checklist at the end of [`FINDINGS.md`](FINDINGS.md).
