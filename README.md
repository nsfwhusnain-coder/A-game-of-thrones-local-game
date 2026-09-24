# Westeros Chronicles

An AI-simulated grand strategy role-playing game set in *A Song of Ice and Fire*. It runs on your own machine and talks to a local LLM.

You play one house: the Starks, the Lannisters, a minor Riverlands lord, the Night's Watch, the Targaryen exiles, and so on. You give orders in plain language, hold audiences with any named character, and advance time. The model acts as the game engine. It simulates every other house, lord, khal and sellsword, writes the events, and changes the map and the numbers.

The game is inspired by [Pax Historia](https://www.paxhistoria.co/): time pauses while you act, then jumps forward and the AI simulates the world. It adds a hand-built map of the Known World, every major house and its vassals, named characters with secrets and loyalties, armies and fleets on the map, an economy, and memory that persists over long campaigns.

> Fan project for personal, local, non-commercial use. *A Song of Ice and Fire* belongs to George R. R. Martin.

## Quick start

```bash
# Node 18+ required, no npm install needed (zero dependencies)
npm start            # → http://127.0.0.1:3298
```

1. Start a local model server with an OpenAI-compatible API:
   - **LM Studio**: load a model and start the server (default `http://localhost:1234/v1`)
   - **Ollama**: `ollama serve` (`http://localhost:11434/v1`). Set a large `num_ctx` in *Extra request parameters*.
   - **llama.cpp**: `llama-server -m model.gguf -c 262144 --port 8080` (`http://localhost:8080/v1`)
   - **KoboldCpp, text-generation-webui, vLLM** and similar servers also work.
2. Open the game and go to **⚙ Model Settings**. Pick your server and set **Context window** to match the context your server was started with (for example `262144` for 256k). Click **Test connection**.
3. Pick a house and play. Without a model you can use **Mock** mode to explore the UI.

**Model advice:** the simulator juggles hundreds of ids and must return valid JSON, so bigger instruct models do much better. Roughly 24B–70B, or a strong MoE. Larger context lets it see the whole world at once. Keep the temperature around 0.7–0.9.

## How to play

| | |
|---|---|
| **Orders** (bottom bar) | Write what your house does, e.g. *"Call the banners. Every lord of the North musters at Winterfell within the moon."*, *"Send Ser Rodrik with 200 men to escort Lady Catelyn to Riverrun."*, *"Embargo Lannisport: no northern timber or furs to the West."* Orders are intentions, not guaranteed outcomes. |
| **✨ Counsel** | Your advisors suggest orders. |
| **Audiences** (Court / People tabs, or click a castle) | Talk to anyone. Your steward, maester and captains know your numbers. Ask them and their answer updates your ledger. Other lords bargain, lie, agree or refuse. Characters in another place get a letter. Deals made here feed into the next turn. |
| **Advance ▶** | Pick a span from 1 week to 1 year. The world simulates, you get a turn report, and the map updates: borders, armies, sieges, battles. |
| **Map modes** | Realms, holders, diplomacy (your relations and wars), unrest, prosperity, terrain. |
| **📜 Chronicle** | Long-term memory of your story (`saves/<game>/chronicle.md`). You can edit it to correct or steer the story. |
| **↶ Undo** | Roll back the last turn. |

### Numbers are reports, not rules

Nothing ticks automatically. There's no "+5 men every 10 seconds". Treasury, levies, men-at-arms, household guard, ships, food stores and every army's size are estimates owned by the simulation. Each figure shows who reported it and when.

Figures change through the story: harvests, tolls, bribes, desertion, casualties, sellswords, a steward's recount, lords sending or withholding men. When you ask your master-at-arms how many swords you have, the number they give becomes the new figure. Numbers for other houses are only rumours (`~`).

## How the simulation works

```
 your orders + audiences ──►  prompt builder  ──► local LLM (the "Maester-Simulator")
                               │ scenario lore           │
                               │ your house sheet        ▼
                               │ world digest       JSON: summary, events[], changes[]
                               │ chronicle + recent turns │
                               ▼                          ▼
                         applyChanges() validates every change against the world
                         (unknown ids are rejected, not crashed on) → map & numbers update
```

- **Change operations** the model can emit: `figure`, `army_create/move/update/destroy`, `holding` (owner, unrest, siege…), `character` (death, capture, location, loyalty, opinion), `character_new`, `relation`, `liege` (vassals switching sides), `war`, `war_join`, `pact` (alliance, trade, embargo, marriage, truce, loan), `battle`, `raven` (letters to you) and `chronicle`. See `server/prompts.js`.
- **Memory:** every turn is stored in full. Every *N* turns (default 5, set in Settings), older turns are compressed into `chronicle.md` by a consolidation prompt, and the latest few stay word-for-word. The chronicle is always in the prompt. Consolidation also runs early if the history grows past 20% of your context window. With a 256k context you can raise the kept turns a lot.
- **Budgeting:** the prompt builder sizes the world digest to your configured context. Large contexts get every house and character; small ones get the most relevant.
- **Robustness:** JSON is pulled out of fenced or chatty output, common syntax errors are repaired, truncated output is closed, and malformed replies get one retry. `<think>` blocks from reasoning models are stripped. Every prompt and reply is logged in `saves/<game>/llm-log.jsonl`, and the last prompt of each kind is saved as `last-prompt-*.txt` for debugging.

## Project layout

```
server/index.js        HTTP server + API (no dependencies)
server/llm.js          OpenAI-compatible client, JSON extraction/repair, mock mode, config
server/prompts.js      Simulation rules, change-op schema, world digest, chat/advisor/consolidation prompts
server/game.js         Saves, time jumps, audiences, undo, memory consolidation
public/js/shared/world.js  World model shared by server & browser: initial state, place resolution, applyChanges
public/js/map/terrain.worker.js  Procedural terrain: fractal coasts, mountains, biomes, hillshading, provinces
public/js/map/renderer.js        Map: pan/zoom, political overlay & borders, rivers, roads, the Wall, castles, armies, labels
public/js/sigils.js    Procedural heraldry
public/js/app.js       UI
public/data/geography.js   Coastlines, islands, lakes, mountains, forests, deserts, rivers, roads, labels
public/data/houses.js      147 houses with seats, lieges, colours, sigils, words
public/data/characters.js  157 named characters (roles, traits, secrets)
public/data/scenarios.js   Scenario lore, starting estimates, armies, relations, wars, pacts
saves/<id>/            state.json, chronicle.md, llm-log.jsonl (git-ignored)
config.json            your model settings (git-ignored)
```

`npm run check` validates the world data after edits.

## Adding content

- **Houses:** add an `H(...)` line in `public/data/houses.js`. The seat position becomes a province automatically.
- **Characters:** add a `C(...)` line in `public/data/characters.js`.
- **Geography:** edit the control points in `public/data/geography.js`. Coastlines are coarse on purpose; fractal detail is added procedurally. Bump `GEN_VERSION` in `renderer.js` to regenerate the cached map.
- **Scenarios:** add an entry to `public/data/scenarios.js`.

See [docs/DESIGN.md](docs/DESIGN.md) for the design notes and roadmap.
