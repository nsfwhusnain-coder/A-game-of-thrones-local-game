# Design notes

## What we take from Pax Historia

Pax Historia is a map-based sandbox where an LLM acts as the game engine. Its core loop:

1. **Decisional pause.** Time is frozen while the player acts.
2. **Free-text actions.** The player writes directives for their nation. AI can brainstorm or polish them.
3. **Diplomacy chats.** One-on-one or group chats with AI nations. What is said there influences the next jump.
4. **Advisor.** Longer strategic counsel.
5. **Jump forward.** The player picks an increment (1 week to 1 year). The AI simulates every nation and writes events. The map shows the changes.
6. **Event consolidation.** Older rounds are summarised in chunks so long games fit the context.
7. **Presets.** Community-made maps and worlds, with editable prompts per preset.

Its internal prompts are grouped as: Chat with User, Chat with Advisor, Jump Forward, Auto Jump Forward, Actions, Next Speaker, Description to Action, and Event Consolidator.

## Where Westeros Chronicles goes further

| Pax Historia | Here |
|---|---|
| Nation-level actors | **Houses → vassals → lieges**, with fealty that can change (`liege` op). Realms are drawn from the liege chain, so a Frey defection redraws the map. |
| Chat with nations | **Audiences with any named character.** Each has traits, a bio, secrets, memories, an opinion of you and their location. Distance means ravens. Officers of your house report your numbers, and their reports update the ledger. |
| Implicit numbers | **Explicit but AI-owned figures**: treasury, income, debt, levies, men-at-arms, guard, ships and food. Each carries its source and date. Nothing auto-ticks, and other houses' numbers are rumours. |
| Battalion markers | **Armies and fleets** with commander, composition, morale, supply, status and a destination arrow. Battles are recorded and marked on the map. |
| Region map | **A hand-built, procedurally detailed map**: fractal coasts, hillshaded mountains, forests, snowfields, deserts, marshes, rivers, the Wall, roads, and about 150 provinces derived from the castles. |
| Consolidated events | **`chronicle.md`**: human-readable long-term memory that the player can edit, plus recent turns kept word-for-word, with budgets sized to your model's context. |
| Cloud models | **Local models** via any OpenAI-compatible server. Handles JSON repair, reasoning tags, retries and long timeouts. |

## Simulation contract

The model returns `{summary, events[], changes[]}`. `applyChanges()` in `public/js/shared/world.js` is the only way the world changes. It is forgiving: it resolves ids by slug or name, accepts `delta` or `value`, and clamps ranges. Anything it can't resolve is **rejected and reported** rather than applied blindly. The same function handles audience outcomes and manual GM edits.

## Engine and story: who decides what

The model narrates and decides the *unusual*. The engine keeps the *routine* moving, so the realm stays alive even with a small or silent model. When the model sets something explicitly in a turn (an obligation, a season, an army move), the engine leaves it alone.

| System | Module | What the engine does on its own |
|---|---|---|
| Ledger | `shared/economy.js` | Yields, tribute, upkeep, interest, projects, food stores, grain buying, famine, Night's Watch alms |
| Seasons | `shared/economy.js` `seasonTick` | White ravens turn the seasons after randomised lengths |
| Vassals | `shared/vassals.js` | Temper (loyalty, friendship, taxes, hardship) drives dues and answers to the banners. Answering hosts march to the muster and merge. Idle lords grow restless and desert. Risings. Defiant vassals |
| Player as vassal | `shared/vassals.js` | A liege at war calls the player's banners as a decision. Dues can be paid, delayed or withheld |
| Petitions | `shared/petitions.js` | Realm matters when the story raised none. Every option carries immediate effects (`fx`) |
| Disposition | `shared/diplomacy.js` | How a character weighs alliance, marriage, trade and fealty. Given to the model in audiences |
| Marches | `server/game.js` | Hosts with orders walk at marching pace |
| Succession & ageing | `shared/world.js`, `server/game.js` | Heirs inherit; the old and ailing die |

Decision options may carry `fx` (engine effects applied the moment the player answers). The order text sent to the model lists what was already settled, so the model narrates reactions instead of applying the effects twice.

## Roadmap

- [x] Land-and-sea pathfinding for army movement; fleets follow sea lanes.
- [x] Council meetings with multiple speakers.
- [x] 3D map with procedural settlements, landmarks, forests, relief and water.
- [x] The map rebuilt from real atlas data (canonical coastlines, rivers, roads, ranges, forests, kingdoms and places), with terrain generated from it.
- [x] The story can change the map: new holdings, renames, ruins, landmarks.
- [x] Ledger engine (vassal tribute, taxes, upkeep, food, projects, seasons).
- [x] Characters: skills, portraits, family trees.
- [ ] Streaming responses so the turn narrative appears as it is written.
- [ ] More scenarios: Robert's Rebellion (282 AC), Dance of the Dragons (129 AC), Aegon's Conquest, and a "Sandbox" start.
- [ ] More houses and characters (every sworn house in the Wiki of Ice and Fire), minor towns and ports.
- [ ] Trade routes and goods (Arbor wine, Lannisport gold, northern timber, Braavosi credit) drawn on the map.
- [ ] Holding buildings and upgrades; sieges with duration; castle garrisons as separate units.
- [ ] Map editor for the geography and provinces (for now: edit `data-src/` and run `scripts/build-atlas.js`).
- [ ] Portraits (procedural or local image model).
- [ ] Optional two-pass turn (plan, then resolve) for smaller models.
