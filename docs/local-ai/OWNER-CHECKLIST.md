# Owner checklist — putting Maester-12B into play

Nothing below has been done for you: the live llama-swap config, the game's `config.json` and the game code are untouched. Every step is reversible; the untuned 12B stays as a fallback.

## A. One-time file setup (5 minutes)

1. Copy to `C:\models\gemma4\` (from `C:\wc-ai\models\gemma4\`): `gemma-4-12B-it-qat-UD-Q4_K_XL.gguf` (6.7 GB) and `mtp-gemma-4-12B-it.gguf` (0.25 GB).
2. Copy the adapter `C:\wc-ai\models\maester\maester-12b-lora.gguf` (≈ 0.5 GB) to `C:\models\gemma4\maester\`. (Keep the original; its SHA-256 is in `docs/local-ai/deploy/ADAPTER.md`.)
3. Keep the llama.cpp build `C:\wc-ai\bin\llama-b11242\` where it is (or copy the folder and change the path in the config). **The owner's `C:\llamacpp` build (5266f24) is not tested with the 12B or the adapter.**

## B. llama-swap (2 minutes)

4. Open `C:\llamaswap\config.yaml`. From `deploy/llama-swap-maester.yaml` paste the two entries (`maester-12b`, `maester-12b-safe`) under `models:` and add both ids to the members of the `gpu` group.
5. Reload/restart llama-swap the way you normally do (the scheduled task `llamaswap`). Do **not** start it while another GPU program is running.
6. Check: `curl http://localhost:8033/v1/chat/completions -H "content-type: application/json" -d "{\"model\":\"maester-12b\",\"messages\":[{\"role\":\"user\",\"content\":\"Say hello in one line.\"}]}"` answers in a few seconds; `nvidia-smi` shows about 9.7 GB in use (must stay ≤ 10.7 GB); the same call with `"model":"maester-12b:plain"` answers **from the same process** (no reload).

## C. The game

7. In the game's `config.json` (git-ignored) merge `deploy/game-routing.json`: every call to `maester-12b`, `narrate` (and the untested kinds: `letter`, `advisor`, `counsel`, `polish`, `probe`) to `maester-12b:plain`, all `slot: null`, and `"allowModelSwaps": true` (the game otherwise refuses two model names; here they are two aliases of one process, so nothing is swapped).
8. Play one turn. Interpret should feel quicker (≈ 1.4 s a call), and a wrong reading should still be caught by the game's validators exactly as before.

## D. If something is wrong

- Slow or odd: switch the routing to `maester-12b-safe` (no MTP), or to `westeros-gemma12` (the untuned model, no adapter) — a one-line change each.
- Nothing else changes: the adapter is a file loaded at start; removing the `--lora` line gives the plain model.
- Never run another CUDA program (training, image generation, a game) beside the server (VRAM headroom is ~3 GB; above 10.7 GB the server halves in speed until restarted).

## E. For later

- The game's builder logs where the model falls short in `docs/local-ai/MODEL-WISHLIST.md`. When the game is feature-complete, tell an agent to run the next fine-tune from that list (see `TRAINING.md`); the Kaggle account is free and each round costs about 8–14 T4×2 hours.
- Optional: publish the adapter as a GitHub release asset or with Git LFS (≈ 0.5 GB) so it can be fetched on another machine — not done, your call.
