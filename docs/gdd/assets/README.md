# Evidence recorded on the owner's PC, 2026-09-27

Machine: RTX 5070 12 GB, Ryzen 5 7500F, 32 GB RAM, Windows 11. Models via llama-swap (`http://127.0.0.1:8033/v1`),
64k-context profiles, thinking off. The implementing agent cannot reproduce these runs (no GPU); use them to understand
how the real models and the current build behave.

| Folder | What | How it was produced |
|---|---|---|
| `bench-2026-09-27/` | `bench-<model>.json`: the three task shapes of [04-ai-system.md](../04-ai-system.md) §11.2 (A: Tywin's intent after Tyrion's seizure; B: interpret a Stark order; C: narrate three facts; plus C without a schema) on `gemma4-26b-a4b`, `qwen3.6-35b-a3b`, `qwen3.8-27b-64k`, each with latency and tokens/s. `modelbench.mjs` holds the exact prompts and JSON schemas (llama.cpp `response_format: json_schema`). | `node modelbench.mjs <model> <runs>` |
| `playtest-2026-09-27/` | `stark-6-turns-qwen3.6-35b-a3b.md`: six turns of the **current build** (swarm `full`) as House Stark, with every model call's raw output (in `<details>` lines), applied and rejected changes, hosts, vassal statuses and figures per turn — the evidence behind [02-audit.md](../02-audit.md) §3. `play.mjs` is the harness. | `WC_SAVES=… node play.mjs stark 6` in a copy of the repo with a Windows path fix |
| `screenshots-2026-09-27/` | The current UI and map in mock mode at 1920×1080 (downscaled to 1440×810): title, main view, windows (realm, military, economy, intrigue), the ruler's sheet, map zoom levels and the diplomacy mode, a turn's playback. | Playwright + system Chrome (`playwright-core`) |

Things to notice in the recordings:

- **Prefix-collision pitfall** (B of every model): "Jon should go to the Wall" → `the_twins`, because under the grammar
  the only enum member starting with `the` was `the_twins` ([04](../04-ai-system.md) §3.1).
- **CJK leak** in Qwen3.6 output ("Lord Um伯", "摆").
- **Strategy is weak** in single-shot intents (Tywin writes a letter when his son is seized) — hence the hint line from
  behaviour trees ([04](../04-ai-system.md) §5.5).
- **Narration from given facts is good** on every model — the narrator is the model's strength; keep it bound to facts.
- In the playtest: the swarm's Hand and Weaver writing full chronicles; the Bard narrating arrivals that never happened;
  the muster splitting into 18 hosts; the King's progress teleporting; turn times of 118–221 s.
