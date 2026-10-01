# Westeros Chronicles

A grand-strategy role-playing game of *A Song of Ice and Fire*, set in 298 AC, that runs on your own machine with a local language model. You rule one house — the Starks, the Lannisters, a Riverlands lord, the Night's Watch, the Targaryens in exile, any of 290 — give orders in plain words, hold audiences with anyone the books name, and let time run. The world goes on without you: lords muster, marry, quarrel, die and come of age; letters take days; the winter comes.

It is inspired by [Pax Historia](https://www.paxhistoria.co/) (time pauses while you act, then jumps and the world is simulated) and built on one rule: **the engine decides, the model tells.** The simulation is deterministic Node code — the ledger, the roads, the battles, who knows what and when — and the model is asked only to read your orders, to give a lord a voice, and to dress the facts in prose. Whatever a model says, it never changes the world by saying it; and with no model at all (Mock mode) the whole game still plays, in the engine's own plain words.

> A fan project for personal, local, non-commercial use. *A Song of Ice and Fire* belongs to George R. R. Martin. No book text is copied, nothing after the year 298 is known to the characters, and no real person's voice is cloned or imitated (see *Sound and voices*).

## Quick start

```bash
git clone -b claude/brave-ramanujan-i8dt0q https://github.com/nsfwhusnain-coder/A-game-of-thrones-local-game.git
cd A-game-of-thrones-local-game
npm start            # http://127.0.0.1:3298 — restarts itself when the code changes
```

Node 20 or newer; **no runtime dependencies** (the 3D map's three.js is bundled). Use a browser with WebGL2. The first launch builds the map in a few seconds and your browser keeps it. Optional, once: `npm run fetch-sigils` (house sigil art from the wikis, for your own copy).

Open the page, pick a house, and read the welcome page (three tips). **Without a model**, choose *Mock* in Settings → Model and play: you will see every system and the writer's own headlines. To play with a model:

1. Start a local server with an OpenAI-compatible API — llama.cpp (`llama-server`), LM Studio, Ollama, vLLM, KoboldCpp.
2. Settings → Model: set the endpoint, the model name, and **Context window to the context the server was started with**; press *Test connection*.
3. Play. On a laptop set *World detail per turn* to **Lean** (prompts about 45 % smaller).

## Which model — and why 64k

The prompts are budgeted for, and every profile in this repository is tested at, a **64k context** (`-c 65536`, two slots over one pool). A larger context costs the VRAM the cache needs and the speed with it; the game does not ask for it and the docs never recommend it. Thinking off for every call (the schemas do the work).

- **Built for this game: Maester-12B** — a 12B-class base (4-bit) with one LoRA adapter trained on the game's own calls, behind llama-swap (two ids of one process: the adapter on for interpret, mind and council; off for the narrator). It runs in under 10 GB of VRAM at about 75 tokens/s on a 12 GB card. How it was made, what it measured and how to put it into play: [`docs/local-ai/`](docs/local-ai/README.md) (start with `REPORT.md` and `OWNER-CHECKLIST.md`). The finished game has been played on it — twelve turns as two houses and the five bench suites; a seven-day jump takes about 19 seconds, a thirty-day jump 39: [`PLAYTEST-2026-10-02.md`](docs/local-ai/PLAYTEST-2026-10-02.md).
- **Any other model** works if it keeps to JSON schemas; every call has one, a mock and a deterministic fallback, so a weak reply costs a plainer sentence, never a broken game. `npm run bench` scores a model on this game's own tasks (below).
- **Relay mode** (Settings → Model → *Relay*) writes each prompt to `relay/` and waits for an answer file — a way to play with any model or person by hand.
- A small **scribe** model on the CPU can mend spelling in the command bar (`docs/local-ai/SCRIBE.md`); without one, rules alone mend the line.

## Playing

| | |
|---|---|
| **Orders** (the command bar) | Write what your house does — *"Call the banners. Every lord of the North musters at Winterfell within the moon."* A box, a microphone and one quill: the quill sends. The steward answers each order with a **receipt** (what will be done, what cannot, what he needs to ask). |
| **End turn** | Pick a span, from a week to a year. The plate counts the orders it will carry out. The world plays out day by day; the news comes as ranked cards, and the map tells it — smoke over a siege, tents by a host, the camera flying only for weighty news. |
| **Click a castle or a host** | A card opens beside it. Names in any text are links with a hover card; every house opens a family tree. |
| **Audiences** | Talk to anyone. Far away, it is a **letter** that flies for days and is answered in days. Promises a lord makes are shown as chips and kept on the *Diplomacy* list, with the days left. |
| **Matters** | A wax seal on the map: a sealed letter with the days it will wait and what silence will cost. Silence decides. |
| **Realm / People** | Two windows with tabs: the ledger (what your house truly has, and what it knows of others, marked for how sure it is), hosts, treasury, diplomacy, the people and their trees. |
| **Keys** | `?` for help; **[ ]** step through the map's pins, **Enter** opens, **Esc** closes and returns focus; Settings → Display → Motion. |
| **Undo** | Roll back the last turn(s). |

Each turn is saved whole; the **chronicle** (`saves/<game>/chronicle.md`) is the story's long memory and may be edited to steer it.

## What is in the game

- **A world of 290 houses, 1,011 people and 335 holdings** — every region's great houses and 130 lesser ones, every landed house with a head, a spouse and an heir, the Wall's empty castles, the Free Cities, the clans beyond the Wall, the free companies for hire (the Golden Company, the Second Sons, the Stormcrows, the Brave Companions); **425 small happenings** drawn from the books' world. An old save keeps its old world; only a new game has the new roster.
- **A real economy.** A ledger settles each week from causes: rents scale with people, prosperity, unrest, season and war; vassals pay only while their obligation is `paying`; lenders, loans, grain prices, works to fund. The model never writes a routine income; it changes a *cause* (a refused banner, a failed harvest) and the ledger does the arithmetic.
- **People who differ, and who know only what reached them.** Every character answers from a nature the engine fixes before any prose; every house knows only what its eyes, riders and ravens have brought it, as late as they brought it. A leak test keeps what a player may not know off every screen.
- **War on real roads.** Everything that moves is a party on A\* paths over land and sea; the Neck, the Twins, the Bloody Gate. Battles by numbers, stance and ground; sieges that eat their stores; fog of war; outlaws; the sea; free companies.
- **A story with a shape.** Sixty canon beats come on their own schedule (*Canon*, *Loose* or *Sandbox* gravity); a Director may open a grounded scene; a house can end, be broken, win a crown or the Iron Throne, and the end screen gives it its epitaph.
- **Regency.** A child, a captive or a missing lord is ruled for by a regent, and the realm knows it; what a house does is then done in the regent's name — and a prisoner is never seen to hold a feast.
- **The State of the Realm.** One ledger of every house's swords, coin, bread and people, each figure marked *exact*, *sworn*, *seen*, *reported* or *rumoured*, with a trend and what it is saying.
- **Headlines in the books' manner.** A deterministic writer (the floor) makes every card's headline and line from the facts; the model's scenes sit on it, and a scorer holds both to the same rules (a named person, a verb, no game word, nothing invented, nothing from after 298).
- **The Weaver (optional, off by default).** When the story makes something that lasts — a smuggling ring after an embargo — the model may propose a small custom for a lord's house in a sandboxed formula language; the engine checks it before keeping it, caps it, and never gives one to your own house.
- **A 3D map of the Known World** from real atlas data (three.js): relief, rivers, roads, banners, procedurally built castles and cities, the Wall, three graphics presets.

## Sound and voices

- **Music follows the story.** The music is yours: files in `public/music/` (`npm run fetch-music` downloads a free Creative Commons set, credited in `public/music/CREDITS.txt`). The game picks by mood — folders named for them (`war/`, `tension/`, `lament/`, `winter/`, `north/`, `reach/`, `dorne/`, `iron/`, each falling back to the nearest fitting one): the colour of your region, war, tension while the days pass, a lament when your family loses someone, winter's colder mix. With no files it is silent.
- **Facts have sounds**, synthesised in the browser: a raven and parchment for a letter, a horn and a clash for a battle, two short horns for a muster, a single deep bell for a great lord's death, a lute for a wedding or a feast, wind for winter's coming — never more than one in 400 ms, each lowering the music a little.
- **Voices.** Characters speak in natural neural voices generated **in your browser, on the CPU** (Kokoro-82M, Apache-2.0), each cast by sex, age, house and manner from stock voices — mostly British. Reading aloud is a setting (Settings → Sound & voices): the story, a letter in its sender's voice. The first time, the browser asks before it downloads the voice files. Speech-to-text for the microphone also runs in the page.
- **No voice is cloned.** The game casts stock voices to characters; it does not imitate any real actor or person, will not, and any change that did would be refused.

## Checking the game

Everything that does not need a model is in CI (windows and ubuntu, Node 22 and 24). What the owner runs on the live model, each one command:

| | |
|---|---|
| `npm run check` · `npm test` | the data (land, spacing, seats), syntax and imports, determinism of the engine; about 850 tests, none needing a live model |
| `npm run bench -- --suite interpret,mind,narrate,audience,latency` | the model's accuracy and pace on this game's tasks, one report `bench/<date>.md` to paste back (gates: interpret ≥ 95 %, mind ≥ 85 %, narrate ≥ 90 %, audience 100 % to the verdict, the pace of GDD Q3) |
| `npm run playtest -- --house stark --turns 12` | a scripted playthrough with every call's prompt, reply and latency; ends with the coherence check |
| `npm run coherence -- --play stark --turns 12` | does the story the game told agree with the world it kept? (a dead man acting, a prisoner feasting, a letter before it could land, a game word in a headline) — or give it a save's id |
| `npm run soak` · `npm run realm:soak` | 200 turns × 6 houses; the realm ledger held against the truth over 24 moons |
| `npm run balance` · `node scripts/canon.js` | the economy's anchors; the canon beats |
| `node scripts/ui-gate.mjs` · `node scripts/visual.js` | the interface's acceptance in a real browser (needs `npm i --no-save playwright`) |
| `scripts/finetune/` | the recipe for tuning a model on the game's own logged calls ([README](scripts/finetune/README.md)) |

## Project layout

```
server/                   HTTP server and API (no dependencies), saves, the jump, audiences, the narrator, the weaver
server/ai/                every model call: a JSON schema, a prompt, a mock, a deterministic fallback, a validator
public/js/engine/         the deterministic engine: facts, verbs, parties, knowledge, minds, realm ledger, military, economy
public/js/shared/         the world model shared by server and browser; applyChanges() validates every change
public/js/ui/ · map3d/    the interface (the maester's desk) and the 3D map
public/data/              houses, characters, holdings, scenarios, happenings, the style bible, anachronisms (content is data)
bench/ · scripts/         the suites, the coherence checker, the checks, the fine-tune recipe
tests/                    the engine, the interface's pure logic, the contract of every call on the mock and on recorded replies
docs/gdd/                 the Game Design Document: the plan, the architecture, every system, the roadmap, DECISIONS
saves/<game>/             state.json, facts.jsonl, turns/, chronicle.md (git-ignored); config.json is yours (git-ignored)
```

`npm run check` validates the world's data after an edit; the engine lint forbids `Math.random`, the clock and crypto under `public/js/engine`, `public/js/shared` and `server/turn`, so a turn replays byte for byte from its seed.

## Adding content

- **Houses and characters:** `public/data/houses.js` and `public/data/houses/more.js`, `public/data/characters.js` and `characters/more.js` — rows of data; `npm run check` holds land, spacing, unique seats and names. A new house changes the world's numbers (the regional people, the great houses' incomes, the ledger's bands): run `npm run balance` and the soak.
- **Happenings, matters, beats:** `public/data/happenings/`, `matters.js`, `beats.js` (each happening has its own headline and summary; a test holds them to the headline scorer).
- **Geography:** the source GIS data is in `data-src/got-inspired-map/`; `node scripts/build-atlas.js` regenerates `public/data/atlas.js`.
- **Scenarios:** an entry in `public/data/scenarios.js`.

## Where to read next

The plan is the Game Design Document, [`docs/gdd/`](docs/gdd/README.md) (start with `00-agent-brief.md`; the order of work is `16-roadmap.md`; departures from the plan are in `DECISIONS.md`). What changed for the player: [`docs/CHANGELOG.md`](docs/CHANGELOG.md). The state of the work and the owner's checklist: [`docs/HANDOFF.md`](docs/HANDOFF.md). The local model: [`docs/local-ai/`](docs/local-ai/README.md). Older notes ([`DESIGN.md`](docs/DESIGN.md), [`PAX-HISTORIA.md`](docs/PAX-HISTORIA.md), [`REVIEW.md`](docs/REVIEW.md), [`ROADMAP.md`](docs/ROADMAP.md)) are kept for the history and are superseded by the GDD where they differ.

## Credits

The map geography is derived from *A Song of Ice and Fire Speculative World Map*, GIS files by **cadaei**, based on the maps of **Tear** (Cartographers' Guild) and **theMountainGoat**, released under [CC BY-NC-SA 3.0](https://creativecommons.org/licenses/by-nc-sa/3.0/) via [mapbox/GOT-Inspired-Map](https://github.com/mapbox/GOT-Inspired-Map). The data was projected, simplified and annotated for this game. The derived files (`data-src/got-inspired-map/`, `public/data/atlas.js`) are shared under the same licence and must not be used commercially. The world of A Song of Ice and Fire, its places and its characters are © George R. R. Martin. This is a non-commercial fan project.
