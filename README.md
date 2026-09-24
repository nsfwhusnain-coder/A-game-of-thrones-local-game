# Westeros Chronicles

An AI-simulated grand strategy role-playing game set in *A Song of Ice and Fire*. It runs on your own machine and talks to a local LLM.

You play one house: the Starks, the Lannisters, a minor Riverlands lord, the Night's Watch, the Targaryen exiles, and so on. You give orders in plain language, hold audiences with any named character, and advance time. The model acts as the game engine. It simulates every other house, lord, khal and sellsword, writes the events, and changes the map and the numbers.

The game is inspired by [Pax Historia](https://www.paxhistoria.co/): time pauses while you act, then jumps forward and the AI simulates the world. It adds a hand-built map of the Known World, every major house and its vassals, named characters with secrets and loyalties, armies and fleets on the map, an economy, and memory that persists over long campaigns.

> Fan project for personal, local, non-commercial use. *A Song of Ice and Fire* belongs to George R. R. Martin.

## Quick start

```bash
git clone -b claude/brave-ramanujan-i8dt0q https://github.com/nsfwhusnain-coder/A-game-of-thrones-local-game.git
cd A-game-of-thrones-local-game

npm start
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
   - **llama.cpp**: `llama-server -m model.gguf -c 262144 --port 8080` (`http://localhost:8080/v1`)
   - **KoboldCpp, text-generation-webui, vLLM** and similar servers also work.
2. Open the game and go to **⚙ Model Settings**. Pick your server and set **Context window** to match the context your server was started with (for example `262144` for 256k). Click **Test connection**.
3. Pick a house and play. Without a model you can use **Mock** mode to explore the UI.

**Laptops:** in Settings, set *World detail per turn* to **Lean**. Prompts get about 45% smaller (only the houses and people that matter to you), so turns are much faster on a MacBook. Use **Full** with a big context and a fast GPU.

**Relay / game-master mode:** set Provider to *Relay*. Every prompt is written to `relay/<n>-<kind>.prompt.md`, and the game waits for you (or any other app or model) to write the answer to `relay/<n>-<kind>.reply.txt`. This is handy for testing prompts or running a human-GMed campaign.

**Model advice:** the simulator juggles hundreds of ids and must return valid JSON, so bigger instruct models do much better. Roughly 24B–70B, or a strong MoE. Larger context lets it see the whole world at once. Keep the temperature around 0.7–0.9.

## What's in the game

- **A 3D tabletop map** (three.js).
  - Terrain: hillshaded relief with snow-capped mountains, animated water with foam and sun glints, about 100k instanced trees, and rivers and roads.
  - Structures: the 700-foot Wall, and procedurally built castles, towns, cities and camps whose size reflects their importance.
  - Landmarks: King's Landing (Red Keep, Great Sept, Dragonpit), Casterly Rock on its crag, the Hightower, Storm's End, Harrenhal's five towers, the Eyrie on its spire, Pyke's sea stacks, Winterfell, the Twins, Riverrun, Sunspear, White Harbor, and the Titan of Braavos.
  - Every seat flies its house banner.
  - Your realm's border glows, and enemies at war are outlined in red.
  - Armies and fleets are models with men and ships, and march along A* paths over land or sea.
  - Map modes: realms, holders, diplomacy, wealth, prosperity, unrest, terrain.
- **A CK3-style HUD** that scales to any screen.
  - Top bar: resources and time controls.
  - Bottom-left: your house banner and your ruler's portrait, with the action ring (Realm · Council · Military · Economy · Diplomacy · Intrigue · People · Chronicle).
  - Bottom: a command bar for free-text orders.
  - Right: a drawer with events, letters and audiences.
- **Characters with depth:** procedural portraits, six skills (Diplomacy, Martial, Stewardship, Intrigue, Learning, Prowess), traits, loyalty, opinion of you, memories, and family trees (parents, spouses, children, siblings, including the dead ancestors).
- **A real economy** (see below): the ledger, taxation, vassal tribute, upkeep, food stores, seasons, and works to fund (warships, granaries, walls, roads, markets, men-at-arms, mines).
- **Feudal levies:** *Call the banners* sends ravens to the vassals you choose. Each lord answers, delays or refuses based on loyalty and the story, and only the lords who answer add men.
- **Councils and audiences:** talk to anyone one-on-one (by raven if they are far away), or convene several advisors who each speak in their own voice.

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
public/js/map/terrain.worker.js  Procedural terrain: fractal coasts, heightmap, biomes, forest mask, provinces
public/js/map3d/MapScene.js      3D map: relief mesh, water shader, political overlay & glowing borders, camera, labels, picking
public/js/map3d/models.js        Procedural castles, cities, landmarks, the Wall, banners, armies, fleets, instanced forests
public/js/map3d/pathfind.js      A* over land/sea with road bonuses (march routes & animation)
public/js/shared/economy.js      The ledger engine: yields, tribute, taxes, upkeep, food, levies, projects, seasons
public/js/ui/                    HUD windows, sheets, drawer, portraits
public/data/economy.js           Resources, regional profiles, populations, tax levels
public/data/families.js          Lineages, marriages, dead ancestors, looks, CK3-style skills
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
