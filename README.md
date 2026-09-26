# Westeros Chronicles

An AI-simulated grand strategy role-playing game set in *A Song of Ice and Fire*. It runs on your own machine and talks to a local LLM.

You play one house: the Starks, the Lannisters, a minor Riverlands lord, the Night's Watch, the Targaryen exiles, and so on. You give orders in plain language, hold audiences with any named character, and advance time. The model acts as the game engine. It simulates every other house, lord, khal and sellsword, writes the events, and changes the map and the numbers.

The game is inspired by [Pax Historia](https://www.paxhistoria.co/): time pauses while you act, then jumps forward and the AI simulates the world. It adds a hand-built map of the Known World, every major house and its vassals, named characters with secrets and loyalties, armies and fleets on the map, an economy, and memory that persists over long campaigns.

> Fan project for personal, local, non-commercial use. *A Song of Ice and Fire* belongs to George R. R. Martin.

## Which model

Tested on an RTX 5070 (12 GB) with 32 GB of RAM. **Qwen3.6 35B A3B** (Unsloth UD-Q4_K_XL, mixture-of-experts, 3B active; 26 expert
layers on the CPU) is the default: it follows the rules and the player's orders closely, writes the richest events and debates,
reads a prompt at ~2,000 tokens/s and writes at ~50/s. Gemma 4 26B A4B (UD-Q4_K_XL) is the faster alternative (~60 tokens/s written)
with shorter events. Both run with thinking off, two slots over one 64k context pool. See `docs/HANDOFF.md` for the numbers, and
`npm run bench` / `node scripts/playtest.js` to test another.

The game reads the next turn's unchanging prompt ahead of time while you watch the day's news, so the model re-reads only what changed.

## Quick start

```bash
git clone -b claude/brave-ramanujan-i8dt0q https://github.com/nsfwhusnain-coder/A-game-of-thrones-local-game.git
cd A-game-of-thrones-local-game

npm start                 # restarts itself when the game's code changes
```

Then open http://127.0.0.1:3298. You only need Node 18+; the 3D engine (three.js) is bundled.

Optional: download the real house sigil art from the wikis for your local copy (takes a few minutes):

```bash
npm run fetch-sigils
```

The first launch builds the map, which takes a few seconds. It is cached in your browser after that. You need a browser with WebGL2 (any recent Chrome, Edge, Opera, Firefox or Safari).

1. Start a local model server with an OpenAI-compatible API:
   - **LM Studio**: load a model and start the server (default `http://localhost:1234/v1`)
   - **Ollama**: `ollama serve` (`http://localhost:11434/v1`). Set a large `num_ctx` in *Extra request parameters*.
   - **llama.cpp**: `llama-server -m model.gguf -c 262144 --jinja --port 8080 --cache-reuse 256` (`http://localhost:8080/v1`). `--jinja` enables the model's own chat template (needed for Qwen3-style thinking on/off), and `--cache-reuse` lets the server reuse most of the prompt from the last turn, which makes turns much faster.
   - **KoboldCpp, text-generation-webui, vLLM** and similar servers also work.
2. Open the game and go to **⚙ Settings & model endpoint**. Pick your server and set **Context window** to match the context your server was started with (for example `262144` for 256k). Click **Test connection**.
3. Pick a house and play. Without a model you can use **Mock** mode to explore the UI.

**Laptops:** in Settings, set *World detail per turn* to **Lean**. Prompts get about 45% smaller (only the houses and people that matter to you), so turns are much faster on a MacBook. Use **Full** with a big context and a fast GPU.

**Relay / game-master mode:** set Provider to *Relay*. Every prompt is written to `relay/<n>-<kind>.prompt.md`, and the game waits for you (or any other app or model) to write the answer to `relay/<n>-<kind>.reply.txt`. This is handy for testing prompts or running a human-GMed campaign.

**Reasoning models (Qwen3, QwQ, DeepSeek-R1 and their fine-tunes):** while the world moves, the waiting screen shows what the model is doing: reading the prompt (with a percentage on llama.cpp), thinking (with a token count), or writing (with tokens per second). In Settings:
- **Thinking**: *Server default*, *On* (deeper turns) or *Off* (fast turns).
- **Thinking budget**: extra room for the model to think before it answers. Long periods (six moons, a year) automatically get more room to write.
- Audiences and councils skip the thinking by default, so characters answer quickly. Tick *Also think in audiences* if you prefer.

If a reply is cut off, the game asks the model to finish it. If the model spends its whole budget thinking, the game asks again without thinking. Broken JSON (raw quotes inside dialogue, stray commas) is repaired where possible, and the model is asked once more if not.

**Model advice:** the simulator juggles hundreds of ids and must return valid JSON, so bigger instruct models do much better. Roughly 24B–70B, or a strong MoE. Larger context lets it see the whole world at once. Keep the temperature around 0.7–0.9.

## What's in the game

- **A 3D map of the Known World, built from real atlas data** (three.js).
  - Geography: the canonical coastlines, islands, lakes, rivers, roads, mountain ranges, forests, swamps and kingdom borders of the fan-made *Lands of Ice and Fire* GIS atlas, projected so that distances are true to the books: the North is a third of Westeros, and Winterfell is some 500 miles from Moat Cailin.
  - Terrain, generated from that data: ridged mountain ranges that rise from foothills to snow-capped cores (the Frostfangs, the Mountains of the Moon with the Giant's Lance under the Eyrie, the Red Mountains of Dorne), the snows beyond the Wall, the heather and pine of the North, the farmland patchwork of the Riverlands and the Reach, the sands and red rock of Dorne, dunes, marshes and beaches. Per-pixel relief lighting, animated water with foam and sun glints, and instanced forests.
  - Every seat sits where the books put it. The canonical places that are not seats are there too: the ruins of the Nightfort, Oldstones, High Heart and Castamere, the abandoned castles along the Wall, the Crossroads Inn, Mole's Town and Queenscrown. Armies can march to any of them.
  - Structures: the 700-foot Wall, and procedurally built castles, towns, cities and camps whose size reflects their importance.
  - Landmarks: King's Landing (Red Keep, Great Sept, Dragonpit), Casterly Rock on its crag, the Hightower, Storm's End, Harrenhal's five towers, the Eyrie on its spire, Pyke's sea stacks, Winterfell, the Twins, Riverrun, Sunspear, White Harbor, and the Titan of Braavos.
  - Every seat flies its house banner: real cloth that ripples in the wind and turns to face you. Armies march under their own.
  - Your realm's border glows, and enemies at war are outlined in red.
  - Armies and fleets are models with men and ships (surcoats in house colours, steel helms, spears and shields in the sigil's field, caparisoned horse), and march along A* paths over land or sea. A host resting at a castle camps before its gates.
  - Map modes: realms, holders, diplomacy, wealth, prosperity, unrest, terrain.
- **A CK3-style HUD** that scales to any screen.
  - Top bar: resources and time controls.
  - Bottom-left: your house banner and your ruler's portrait, with the action ring (Realm · Council · Military · Economy · Diplomacy · Intrigue · People · Chronicle).
  - Bottom: a command bar for free-text orders.
  - Right: a drawer with events, letters and audiences.
- **Characters with depth:** painted portraits drawn from the books' descriptions (Robert's beard and gut, Tywin's golden whiskers, Tyrion's mismatched eyes, the Hound's burns, Euron's eyepatch, Melisandre's ruby, Mormont's raven), six skills (Diplomacy, Martial, Stewardship, Intrigue, Learning, Prowess), traits, loyalty, opinion of you, memories, and family trees (parents, spouses, children, siblings, including the dead ancestors).
- **A real economy** (see below): the ledger, taxation, vassal tribute, upkeep, food stores, seasons, and works to fund (warships, granaries, walls, roads, markets, men-at-arms, mines).
- **Feudal levies:** *Call the banners* sends ravens to the vassals you choose. Each lord answers, delays or refuses based on loyalty and the story, and only the lords who answer add men.
- **A map the story can change:** the simulator can raise new castles, towns and war camps (which claim their own lands on the map), rename places, burn castles to ruins, and mark battlefields and camps as landmarks.
- **Councils and audiences:** talk to anyone one-on-one (by raven if they are far away), or convene several advisors who each speak in their own voice. The principal characters have a manner of speech, wants and fears from the books; each great house plays the game its own way.
- **A world that lives without you.** The great events of 298–300 AC come on their own schedule — the King rides north, a boy falls, the Hand's tourney, the Imp taken, Robert's last hunt, Baelor's Sept, the King in the North, the Blackwater, the Red Wedding, dragons in the Dothraki sea — but only while the world still fits them. Change the story and the world goes its own way. When a beat falls on your house it is your decision (take the Hand's chain or refuse it; proclaim Stannis or bend the knee; pay Walder Frey's price), and silence is an answer too. Threats rise with time and neglect (the free folk, the cold, the Iron Bank, winter); other houses feud, feast, hold tourneys and suffer outlaws; openings arise that you must seize or lose. *Intrigue → Shadows over the realm* shows what is rising and what has come to pass.
- **People who differ.** Every character answers after their own nature, decided by the engine before the model writes a word (`shared/temperament.js`): courage, pride, wits, guile, temper, warmth, stubbornness and what sways them (gold, flattery, fear, duty, family, power, vengeance), read from their history (120 principal characters written from the books) and their manner of speech (`data/demeanours.js`). Your words are read — a request, a demand, a threat, an insult, flattery, a bribe, a proposal — and they carry a mood through the audience, with patience that runs out. The engine settles the outcome (agree, name a price, stall, refuse, refuse in anger, give in from fear, end the audience) and holds the model to it: Janos Slynt takes the bribe, Walder Frey haggles, Tywin sees through flattery and will not be threatened, Viserys throws you out. The audience shows their nature, mood, patience and each answer's outcome.
- **Battles and sieges fought by the engine** (`shared/battles.js`): hosts at war that meet fight by the odds of numbers, morale, supply, the commander's skill and walls; losses, routs, retreats, captured and slain commanders follow; battlefields are marked. Hosts before enemy walls besiege them; high walls hold for many moons. Order a host against an enemy host by picking it on the map.
- **Fog of war** (`shared/intel.js`): you see hosts near your lands and hosts, and your vassals' and allies'; everything else is a dashed report of where it was last heard of — or nothing. Reports age, and the story can plant false ones. Spies placed by your spymaster follow a house's hosts.
- **The road** (`shared/roads.js`): riders and small companies are robbed, ambushed, taken, delayed by the season — or meet a stranger with news. Riders are drawn on the map.
- **The lord's own acts** (`server/court.js`), settled at once: gifts (weighed by what they mean to the receiver), feasts and tourneys, judging prisoners (release, ransom, the Wall, the axe), declaring war (on your liege it is rebellion), planting spies, digging for secrets.
- **Voices of their own:** each character speaks with a blend of two Kokoro voices (British for Westeros), hand-cast for ~60 principals; mood quickens or slows delivery; names are said as the show says them. Pick a voice with a Hear button on any character's sheet; choose the narrator in Settings.
- **The small life of the realm.** Every turn the engine plays out dozens of happenings drawn from the books (`public/data/happenings.js`, ~190 of them, each with variants and filled with real names and places): Lord Walder's boasts at the Twins, Blackwoods and Brackens at it again, Stone Crows on the high road, whalers at White Harbor, drowned men on the Iron Islands, a new maester's chain, bread dear in a war, the old walking into the snow in winter, the Titan roaring at a Summer Isles swan ship. They follow the world (war, winter, unrest, who is alive), nudge prosperity, unrest and old feuds, and cost no model time. They appear under *Meanwhile, across the realm* in each turn; the ones on your own lands are pinned on the map.
- **Pins on the map for what needs your eye.** Unread news and matters awaiting your answer are marked where they happened. Click a pin: news opens as a card you acknowledge (the pin goes), with an optional order about it; a matter shows its choices, or lets you answer in your own words.
- **A world log** (`saves/<game>/world-log.md`, and *Chronicle → World log* in the game): every turn's orders, what was carried out, decisions, great events and background happenings, in plain words.
- **Numbers from the books:** the Reach fields ~100,000 swords, the North, Vale, Riverlands and West ~45,000 each, the Iron Fleet 150 sail; seats have the trades the books give them (Arbor gold, Lannisport's trade, the Rills' horses, Salt Shore's salt).

## Sound, voices and scenes

- **Audiences are scenes,** written like the books: narration in the third person (*Robb stood in the great hall, his posture rigid.*) and the character's own words to you in quotation marks. New replies unfold beat by beat.
- **Voices.** Characters speak with natural neural voices (Kokoro-82M, Apache-2.0) generated in your browser, each with their own voice — mostly British, as in the show — and a narrator reads the scene's actions. The first time, the browser downloads the voice model (~90 MB) and the speech runtime from Hugging Face and a CDN, then caches them; to play fully offline run `npm run fetch-voices` once, which puts them in `public/models/`. Click any line to hear it, or the speaker icon to hear the whole scene top to bottom. You can switch to your system's voices, or to a local speech server with an OpenAI-compatible `/v1/audio/speech` endpoint (such as [Kokoro-FastAPI](https://github.com/remsky/Kokoro-FastAPI)), in *Settings → Sound & voices*. The game will not clone real actors' voices.
- **Your own art.** Drop painted portraits into `public/portraits/` named by character id (`tywin_lannister.png`) and they replace the generated ones everywhere; drop music into `public/music/`.
- **Sound effects,** synthesised in the browser: a bell as time passes, horns for battle, a raven's caw for letters, steel for military orders, coin for the treasury, a wax seal for decisions. They have their own switch and volume.
- **Music.** An original score is composed live in your browser: a cello theme over harp and drone, with moods for the court, the cold North and war that follow your situation. To use your own music instead, drop audio files (mp3, ogg, m4a, wav, flac) into `public/music/`. The music button in the top bar turns it on and off.

## Ruling your house

- **Decisions.** When the world demands an answer (the King offers you the Handship, Walder Frey names his price for the crossing, the King is dying and Renly offers you swords), a decision card appears with options and room for your own conditions. Your answer binds the next turn. Silence is also an answer, and unanswered decisions lapse.
- **Succession.** When a lord dies, the heir takes the seat: male-preference primogeniture (absolute in Dorne), through children, grandchildren, siblings and kin. Sworn brothers, maesters and Kingsguard are skipped. If your ruler dies, you play on as the heir. Characters age every year, and the old and ailing may die.
- **Your officers.** Appoint a steward, master-at-arms, captain, spymaster, commander or castellan from your household and guests. Grant holdings to loyal vassals to bind them to you.
- **The temper of your vassals.** Each sworn house has a temper (devoted, dutiful, wavering, resentful, near rebellion), made up of its lord's loyalty, its friendship with you, your taxes and its own hunger and unrest. Resentful houses pay late or withhold their dues, and delay or refuse your summons. Devoted ones come quickly and bring more men.
- **Your hosts.** Raise your own levies directly (the number of men, the muster point, the commander). When you call the banners, each lord answers, delays or refuses in his own time, then marches to your muster point, where the contingents join into one host. Once the banners are in the field, *you* feed them: the host drains your treasury every moon, and lords kept idle in camp (worst at harvest time) grow restless. A resentful lord will take his men home in the night. Click the map to march. The engine walks the host at marching pace unless the story intervenes. Disband a host to send every banner home to the harvest.
- **Petitions.** When the story brings no matter before you, your own realm does: border quarrels, pleas for forbearance, marriage offers for your children, accused knights, hungry smallfolk, outlaws, loans. Every answer has immediate consequences: relations, loyalty, coin, food, unrest and betrothals change at once. The simulator then narrates how people react.
- **Neglect has a price.** Lands left in high unrest rise in revolt: crush them, hear their grievances, hang the ringleaders, or let it spread. A vassal whose temper collapses and who withholds his dues may defy you openly: march on him, offer terms (and look soft), or release him from his oaths. Ignore it and he leaves your realm anyway.
- **The seasons** turn on their own when the Citadel's white ravens fly. Autumn halves the harvest; winter in the North ends it. Nobody knows how long a season will last.
- **Disposition.** Every lord weighs your proposals (alliance, marriage, trade, fealty) from your relations, his opinion of you, your relative power, the standing of your house and his own traits. Character sheets show where he stands and why, and the simulator is told the same.
- **Hard times.** When stores run low, your steward buys grain from merchants. Grain is dear in autumn, ruinous in winter, and impossible under embargo or siege. The Night's Watch lives on the alms of the great houses that favour it.
- **The war room.** Battles and sieges are grounded in numbers: men, morale, the commander's martial skill, supply, troop quality, walls and stores. Each army panel shows the enemy hosts in reach, march times and your odds. The simulator gets the same estimates.
- **Intrigue.** Characters hide secrets (whose children are whose, who poisoned whom). Schemes and conversations can uncover them, and uncovered secrets appear on character sheets.
- **Trade.** Trade pacts raise, and embargoes and wars cut, the trade-driven income (trade, wine, spice, furs) of everyone involved.

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

### The economy: numbers are reports, not rules

Each turn a **ledger engine** settles the books from causes, not constants:

- Each holding yields rents and resources (Westerlands gold, Reach grain, Arbor wine, northern timber and furs, Braavosi trade…). The yield scales with **population, prosperity, unrest, season, sieges and raids**, plus **luck** (blight, bumper harvests, storms, new veins of ore).
- Each vassal pays a share **only if their obligation is `paying`**. Lords can pay late, pay short, or withhold, depending on the story and their opinion of you. The ledger lists every vassal line, so *"House Bolton withheld its dues"* shows up as a real hole in your income.
- Expenses: hosts and fleets in the field, men-at-arms, court, interest on debts, tribute to your liege, and works in progress. If gold runs out, you borrow.
- Levies regrow toward what your land can bear. Men in the field don't till the fields, so long wars hurt prosperity and food.
- Taxes (low → crushing) change income, unrest and your vassals' opinion.

The AI simulator doesn't write routine income. It changes the **causes**: a lord refuses the banners, a harvest fails, raiders burn a village, the Citadel declares winter. The ledger then does the arithmetic.


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
- **Memory:** every turn is stored in full. Every *N* turns (default 5, set in Settings), older turns are compressed into `chronicle.md` by a consolidation prompt. The model sees the chronicle (capped at ~5k tokens, oldest sections first to go — the engine's own tables still hold every fact) and a compact log of the recent turns: one line per event, the orders and the decisions, rather than whole summaries.
- **Budgeting and caching:** the prompt is ordered so the part that rarely changes comes first — the rules, then the houses (grouped by liege) and the characters (grouped by house, with no locations or relations in them) — and everything that moves each turn (where people are, relations, armies, threads) comes after. llama.cpp's prompt cache then reuses most of the prompt from turn to turn: in a measured save, about 18k of 25k tokens are reused after a turn, where before only ~8k of 35k were.
- **Less for the model to do:** the engine settles the ledger, marches, vassals, canon story beats and the small life of the realm itself, so the model is asked only for the consequential events (3-6 a moon) and can run at a low reasoning effort (*Settings → Reasoning effort*, default low, for models with effort levels such as Qwen3.8).
- **Robustness:** JSON is pulled out of fenced or chatty output (including reasoning that leaked into the answer, and continuations that start the object over), common syntax errors are repaired, brackets closed in the wrong order are rebalanced, truncated output is closed, and malformed replies get one retry — which reuses the cached prompt with thinking off instead of resending the broken reply. `<think>` blocks from reasoning models are stripped. Every prompt and reply is logged in `saves/<game>/llm-log.jsonl`, and the last prompt of each kind is saved as `last-prompt-*.txt` for debugging.

## Project layout

```
server/index.js        HTTP server + API (no dependencies)
server/llm.js          OpenAI-compatible client, JSON extraction/repair, mock mode, config
server/prompts.js      Simulation rules, change-op schema, world digest, chat/advisor/consolidation prompts
server/game.js         Saves, time jumps, audiences, undo, memory consolidation
public/js/shared/world.js  World model shared by server & browser: initial state, place resolution, applyChanges
public/js/map/terrain.worker.js  Terrain from the atlas: heights, ridged ranges, climate & biomes, normals, forests, provinces
public/js/map3d/MapScene.js      3D map: relief mesh, water shader, political overlay & glowing borders, camera, labels, picking
public/js/map3d/models.js        Procedural castles, cities, landmarks, the Wall, banners, armies, fleets, instanced forests
public/js/map3d/pathfind.js      A* over land/sea with road bonuses (march routes & animation)
public/js/shared/economy.js      The ledger engine: yields, tribute, taxes, upkeep, food, levies, projects, seasons
public/js/ui/                    HUD windows, sheets, drawer, portraits
public/data/economy.js           Resources, regional profiles, populations, tax levels
public/data/families.js          Lineages, marriages, dead ancestors, looks, CK3-style skills
public/js/sigils.js    Procedural heraldry
public/js/app.js       UI
public/data/atlas.js       GENERATED geography (scripts/build-atlas.js from data-src/got-inspired-map)
public/data/geography.js   The atlas for the game: named places (inns, ruins), labels, miles per unit
public/data/houses.js      156 houses with seats, lieges, colours, sigils, words
public/data/characters.js  157 named characters (roles, traits, secrets)
public/data/scenarios.js   Scenario lore, starting estimates, armies, relations, wars, pacts
saves/<id>/            state.json, chronicle.md, llm-log.jsonl (git-ignored)
config.json            your model settings (git-ignored)
```

`npm run check` validates the world data after edits; `npm test` runs the engine tests (JSON repair, happenings, pins, prompt caching, temperament, battles, fog of war, succession) with no model needed.
`npm run bench` plays scripted turns and audiences against your configured model and scores speed, readability, whether orders are followed, whether servants obey, third-person narration, and whether characters keep to the engine's verdict (`--only audiences`, `--model <id>`, `--effort low|medium|xhigh`, `--mock`). Reports go to `bench/`.

## Adding content

- **Houses:** add an `H(...)` line in `public/data/houses.js`. The seat position becomes a province automatically.
- **Characters:** add a `C(...)` line in `public/data/characters.js`.
- **Geography:** the source GIS data lives in `data-src/got-inspired-map/`. Run `node scripts/build-atlas.js` to regenerate `public/data/atlas.js`, then bump `GEN_VERSION` in `public/js/map3d/MapScene.js` so browsers rebuild their cached terrain. `public/dev/atlas-preview.html` draws a quick 2D proof of the atlas with every holding on it.

## Credits

The map geography is derived from *A Song of Ice and Fire Speculative World Map*, GIS files by **cadaei**, based on the maps of **Tear** (Cartographers' Guild) and **theMountainGoat**, released under [CC BY-NC-SA 3.0](https://creativecommons.org/licenses/by-nc-sa/3.0/) via [mapbox/GOT-Inspired-Map](https://github.com/mapbox/GOT-Inspired-Map). The data was projected, simplified and annotated for this game. The derived files (`data-src/got-inspired-map/`, `public/data/atlas.js`) are shared under the same licence and must not be used commercially. The world of A Song of Ice and Fire, its places and its characters are © George R. R. Martin. This is a non-commercial fan project.
- **Scenarios:** add an entry to `public/data/scenarios.js`.

See [docs/DESIGN.md](docs/DESIGN.md) for the design notes and roadmap.
