# Recommendations for the game's builder

Each item names what to change, where, and the evidence ([FINDINGS](FINDINGS.md)). None of them lets model output write game
state; all are about how the game asks the model. Numbers marked *pending* are being measured and will be filled in.

## R1 — Do not pin two concurrent requests to one llama.cpp slot (do this first)

- **Change:** in the routing block ([04 §11.3](../gdd/04-ai-system.md), `docs/HANDOFF.md` §3, `server/ai/models.js`), give every call
  `"slot": null`. If a slot must be pinned, make sure at most one request is in flight on it (for instance the narrator alone on
  slot 0 while no minds run). `server/minds.js` runs two minds at once, so the current `mind: slot 1` puts two requests on one slot.
- **Evidence:** the server livelocks within 5–8 requests on that pattern, on both Gemma 4 26B-A4B and Qwen3.6, on the owner's build
  and on `b11242` (upstream [llama.cpp#28280](https://github.com/ggml-org/llama.cpp/issues/28280), open). Unpinned, or slots
  alternating 0 / 1, ran 120–150 requests clean. (On the game's routing, before it hung, Qwen3.6 minds showed p50 12.1 s and first
  token 7.6 s; the unpinned comparison is pending.)
- **Note:** `slot: null` lets the server choose by longest common prefix, which keeps the narrator's static prefix warm too.

## R2 — Tell the interpreter the words it may choose, and when not to ask

Two edits to `server/ai/calls/interpret.js`, both tested on a scratch copy (results **pending**, see the checklist):

1. In the `ACTIONS ALLOWED` lines, append the valid words for every verb that takes a `[choice]` (from the existing `CHOICE_OF`):
   `` `- ${v}: ${MEANS[v]}${CHOICE_OF[v] ? ` — [choice] is one of: ${CHOICE_OF[v].join(' | ')}` : ''}` ``. Today the model is told
   `[choice: a kind of works]` and never sees `stables`, `harbour`, `spymaster`; it guesses (`almshouse` for a stable and a harbour).
   Cost: about 250 prompt tokens on the verbs that need it.
2. Add one line to `INSTRUCTIONS`: *"Ask only when the missing thing has no sensible default. If the lord has one host, or only one
   person fits, or the missing detail is optional (a leader, a name for the host, "all" meant by a levy), do not ask: take the
   obvious reading and act."* Gemma 4 26B asked an unnecessary question on 12 % of orders (36 of its 46 misses).

## R3 — Log what a fine-tuning set needs

`server/game.js` `logLLM` writes `{ t, kind, promptTokens (an estimate), response }`. The prompt, the schema and the validation
result are not kept (only `last-prompt-<kind>.txt`, the latest). [04 §11.4](../gdd/04-ai-system.md) and `docs/HANDOFF.md` §4
say `llm-log.jsonl` is the dataset. Log the `messages`, the wire schema, the raw reply, the `problems` of every attempt and
whether the call fell back. (The bench harness in this folder already records all of that through a proxy.)

## R4 — Correct the server-flag guidance in `docs/HANDOFF.md` §3

- `--cache-reuse 256` does nothing for Gemma 4 or Qwen3.x (the server disables it). Drop it from the recommended flags or say so.
- Add a VRAM rule: after the model loads, total GPU memory should sit at or below about 10.7 GB of the 12.2 GB. Above that, any other GPU
  program (a game, a torch process) can halve the server's speed until it restarts. The profile in the handoff (`-ncmoe 10 -ub 2048`,
  11.6 GB) is over that line.
- Say that `-cram` and `-ctxcp` are RAM settings: Qwen3.6 at 256k with `-cram 6144` ran the 32 GB machine down to 0.99 GB free.

## R5 — A hard deadline per call

`server/llm.js` defaults `timeoutSec: 1800` and applies it as an *idle-socket* timeout (`req.setTimeout`). The design promise is
that the game never hangs on the model (04 §14); with a hung server the first call waits half an hour, and llama-server's SSE
keep-alive pings (every 30 s by default) may reset an idle timer altogether (not yet verified). A total-time budget per call kind —
say 90 s for `interpret` and `mind`, 300 s for `narrate` — with the existing fallback behind it would make the promise true even
when the server misbehaves.

## R6 — Update §11.2 of the design doc when the numbers are in

The 2026-09-27 table ([04 §11.2](../gdd/04-ai-system.md)) predates the schema pipeline: Gemma read orders better and Qwen "failed"
on three hand-written prompts. On the game's own suites Qwen3.6 is ahead on interpret (91.7 % against 84.7 %, p = 0.003). The default
model should be chosen from the final table in [FINDINGS](FINDINGS.md), not from that one.
