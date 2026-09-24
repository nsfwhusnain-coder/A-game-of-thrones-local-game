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

## Roadmap

- [ ] Land-and-sea pathfinding for army movement (roads, rivers, mountain passes); fleets that follow sea lanes.
- [ ] Group audiences / small council meetings (multiple speakers, "next speaker" selection like Pax).
- [ ] Streaming responses so the turn narrative appears as it is written.
- [ ] More scenarios: Robert's Rebellion (282 AC), Dance of the Dragons (129 AC), Aegon's Conquest, and a "Sandbox" start.
- [ ] More houses and characters (every sworn house in the Wiki of Ice and Fire), minor towns and ports.
- [ ] Trade routes and goods (Arbor wine, Lannisport gold, northern timber, Braavosi credit) drawn on the map.
- [ ] Holding buildings and upgrades; sieges with duration; castle garrisons as separate units.
- [ ] Map editor for the geography and provinces.
- [ ] Portraits (procedural or local image model).
- [ ] Optional two-pass turn (plan, then resolve) for smaller models.
