# 02 · Audit of the current build (27 September 2026)

> What exists, what is broken, and why. Every claim here was observed on the owner's PC on 2026-09-27 against
> `claude/brave-ramanujan-i8dt0q` @ `966064e`. Reproduction scripts are described in §1 so any agent can rerun them.

---

## 1. How this audit was done

| Method | Detail |
|---|---|
| Code read | All of `server/`, `public/js/shared/`, `public/js/map3d/life.js`, the top of `MapScene.js`, `public/index.html`, the data files' structure, all five docs. |
| Mock UI run | Server in mock mode (`WC_PROVIDER=mock`), Chrome driven by Playwright (`playwright-core`, system Chrome, 1920×1080), screenshots of title, main view, every window, map modes, zoom levels, a turn's playback. |
| **Live playtest** | 6 turns as House Stark against **Qwen3.6-35B-A3B UD-Q4_K_XL** (llama-swap profile `qwen3.6-35b-a3b`, 64k, 2 slots), swarm `full`, thinking off. Script: turn 1 call all banners to Winterfell + 4,000 own levies; turn 2 "Robb is to lead the northern host south to Moat Cailin and hold the Neck"; turn 3 audience with Maester Luwin; turn 4 send Ser Rodrik with 200 men to White Harbor; turn 5 audience with Roose Bolton ("bring your men to Moat Cailin within the fortnight"). |
| Model bench | Three task shapes (NPC intent, order interpretation, narration of given facts) with llama.cpp JSON-schema constrained decoding, on `qwen3.6-35b-a3b`, `gemma4-26b-a4b`, `qwen3.8-27b-64k`. See [04-ai-system.md](04-ai-system.md) §11. |
| Economy sim | `createInitialState` + 12 × `settle(state, 30)` for 16 houses, printing treasury, income, expenses, levies. |
| Test suite | `npm test` and `npm run check` on Windows. |

## 2. The headline diagnosis

The project is not short of systems. It has more than forty. What it lacks is **one spine that all of them hang from**.
Six root causes explain almost every symptom the owner reported:

| # | Root cause | Symptoms it produces |
|---|---|---|
| **R1** | **No single source of truth for "what happened".** At least twelve subsystems each write state *and* emit their own event text (`vassals.js`, `retinues.js`, `plots.js`, `happenings.js`, `roads.js`, `battles.js`, `treachery.js`, `regency.js`, `psyche.js`, `economy.js`, `orders.js`, the story model). The story model then writes a *second*, free account of the same days, from the prompt, without being bound to what the engine actually did. | The chronicle says lords arrived who did not; the map shows hosts the story never mentions; characters are in two places; "they muster and stay there". |
| **R2** | **The AI interface is far too wide for the model.** One call is given a ~25,000-token prompt, 30+ change-operation types, 300 characters and 160 houses by id, and asked for free-form JSON containing both prose and state changes. A 3B-active MoE cannot hold that. | Broken JSON 2–3 times per turn; ignored instructions; invented ids; destructive edits (Bolton's levies set to 0); characters placed where they are not; future-canon leaks. |
| **R3** | **The five-agent "swarm" costs 5× and delivers ~1×.** Every agent shares a system prompt whose `OUTPUT FORMAT` demands the full `{summary, events, changes}` turn; the per-agent charge comes last and loses. The Hand and the Weaver wrote full chronicles (thrown away). The Bard — whose chronicle is kept — is given the Hand's *plan*, not the engine's receipts (`briefFromApplied` exists in `server/agents.js` but is never called). | 118–221 s per turn **regardless of span** (a 1-day turn took 221 s); narration of intents that were rejected. |
| **R4** | **Entities have no notion of "what they are doing".** A character's `loc` is a string; nothing prevents three systems giving the same lord three activities. | Roose Bolton answers the banners *and* rides to feast at Last Hearth *and* "moves like a shadow through the halls of Winterfell" in the same week. |
| **R5** | **The interface is a strategy dashboard, not a narrative.** A CK3-style HUD (six resource tiles, date, turn-length text, six system icons, a left drawer, a right window, an eight-button dock and a player card) squeezes the map to a strip. Numbers are shown without meaning. | "Over-cluttered", "AI-slop"; the player cannot tell what matters. |
| **R6** | **Balance numbers are unanchored.** Starting treasuries, incomes and costs were set independently, not from one economic model. | Stark 60,000 vs Lannister 2,800,000; levies cost 0.04 dragons per man per moon, so war costs almost nothing and gold means nothing. |

Everything in [03-architecture.md](03-architecture.md) exists to remove R1–R4; [12-ui-ux.md](12-ui-ux.md) removes R5;
[06-economy.md](06-economy.md) removes R6.

## 3. Evidence from the live playtest

Excerpts, verbatim where quoted. Turn times are wall-clock.

### Turn 1 (1st→8th day, 8th moon; 7 days; **211 s**; 5 model calls of ~21k prompt tokens each)

- The player called all 19 sworn houses to Winterfell. Engine truth at the end of the turn: **every vassal still
  `called`** (the engine waits 10–18 days before a lord answers).
- The chronicle (Bard) nonetheless published, as the player's *order* events:
  *"Roose Bolton arrived at Winterfell with one hundred and ten men"* (day 2), *"Ser Wylis Manderly arrived with five
  hundred men and a dozen wagons of grain"* (day 3), *"Lord Rickard Karstark rode into Winterfell with four hundred men"*
  (day 4), *"Jon 'Greatjon' Umber arrived with two thousand riders"* (day 5). **None of this happened.**
- At the same time the engine's retinue system (`retinues.js`) sent *Roose Bolton riding to feast with the Greatjon at
  Last Hearth* and *Wyman Manderly riding to feast at Oldcastle* — both lords summoned to muster.
- Applied by the model: `figure` **Bolton levies 5,000 → 0**; `army_update` on the **player's** host (men 4,000 → 4,200,
  status "marching" while it stood in the yard); `army_march` **the King's progress to the Crossroads Inn** (south,
  away from Winterfell).
- Lore: *"In the capital, King Robert sat at table with Walder Frey"* (he was at the Twins); *"Ser Jaime Lannister sat
  silent, his golden hand wrapped in leather"* (298 AC — he has both hands); *"Benjen Stark rode into the white
  silence"* (he leaves after Bran's fall).
- Agent outputs: the **Hand** (charged "no prose at all") returned a full `summary` + `events`; the **Weaver** (charged
  "only inject_rule") returned a full `summary` + `events`.

### Turn 2 (8th of the 8th → 1st of the 9th moon; 23 days; **198 s**)

- 31 chronicle cards, most of them *"House X answers the call"*.
- The canon beat *"The King comes to Winterfell"* fired on **day 6** — the progress was at the Twins (~30 days' march)
  and had just been sent south by the model. The beat moved Robert, Cersei, Jaime, Tyrion and Joffrey to Winterfell by
  `character loc` ops (a teleport), while the progress host itself stayed at the Crossroads Inn labelled *"camped before
  Winterfell"*. In the same turn the story wrote *"King Robert camps at Crossroads Inn"*.
- *"Host of House Reed passes The Neck, and is 2 men lighter for it"* — the crannogmen pay a toll to cross their own
  swamp.
- *"Maege Mormont answers the call with 900 men, Dacey Mormont riding with him"* (pronoun).

### Turn 3 (1st→5th, 9th moon; 4 days; **133 s**)

- Audience with Maester Luwin (30 s): *"House Manderly came with grain and six thousand five hundred men… House Bolton
  is here… Greatjon Umber's riders have arrived"*. Truth: all three were still on the road. The audience prompt gives
  him figures but not the muster's state; he repeated the chronicle's fiction.
- *"Host of House Crowl pays the price of The Wall"* — House Crowl marches from Deepdown **on Skagos** (an island)
  overland to Winterfell, and the route crosses the Wall's chokepoint polyline.
- Two agents unreadable (JSON broken by a single-quoted string); one retry.

### Turn 4 (5th→6th, 9th moon; **1 day; 221 s**)

- *"A new head of House Tully — Edmure succeeds Hoster"* — a random ageing/illness death in 298 (canon: Hoster dies in
  299).
- *"Renly Baratheon made the court laugh at Stannis's expense… The red priestess watched from the corners"* — Stannis
  and Melisandre are on Dragonstone.
- A junk decision *"The Death of the Lion"* created by the model.

### Turn 5 (6th→16th, 9th moon; 10 days; **187 s**)

- Audience with Roose Bolton: *"I shall have my men at Moat Cailin before the fortnight is out."* Engine verdict
  `agree`. **Applied: `Roose Bolton opinion +3`.** Nothing else: his host kept marching to Winterfell. Agreements in
  audiences do not become engine commitments.
- The banners reaching Winterfell after Robb left formed a **new host, "The Banners of Stark"**, at Winterfell.

### Turn 6 (16th→19th, 9th moon; 3 days; **118 s**)

- *"The Banners of Stark"* (6,300 men) **mustered at Winterfell and stayed**. Robb's *Host of Winterfell* (4,200) at Moat
  Cailin. **Fourteen more hosts** strung along the roads, some `marching → stark`, some `pursuing → army:stark_host_winterfell`.
  After 49 game days the player's army is in **18 pieces**. This is the owner's "they all muster up and they kind of
  stay there."
- The story: *"the last of the northern banners arrive to join Robb Stark at Moat Cailin. The muster is complete"* — false.
- *"Catelyn Stark is not himself — Catelyn Stark has the look of a man who has not slept"* (pronoun).

**Total: 6 turns, 49 game days, ~18 minutes of waiting.**

## 4. Bug register

Severity: **P0** breaks the game or its core promise · **P1** visibly wrong, frequent · **P2** wrong, occasional or cosmetic.
"WP" is the work package in [16-roadmap.md](16-roadmap.md) that fixes it.

| ID | Sev | Symptom | Root cause (file) | WP |
|---|---|---|---|---|
| B-01 | **P0** | `npm start` **crashes on native Windows**: `ENOENT mkdir 'C:\C:\Users\…\saves'`. Present since the first commit. | `path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')` yields `/C:/…` on Windows. `server/index.js:9`, `server/game.js:29`, `server/llm.js:56`, and `scripts/bench.js`, `build-atlas.js`, `check-syntax.mjs`, `fetch-music.js`, `fetch-sigils.js`, `fetch-voices.js`, `migrate-positions.js`, `playtest.js`. Use `fileURLToPath(import.meta.url)`. | A1 |
| B-02 | **P0** | Banners that reach the muster after the main host left form an orphan host that never moves. | `vassals.js gatherMusters`: late banners follow the main host only `if (main.march)`; once the main host has *arrived*, `main.march` is gone, so a new `"<liege>_banners_<place>"` host is created at the muster point. | A5 → C2 |
| B-03 | **P0** | The chronicle narrates arrivals, battles and moves the engine never performed. | The Bard is briefed with the Hand's plan (`briefFromPlan`) and the Maester's notes, never with applied receipts; nothing validates prose against state. `server/game.js runSwarm`, `server/agents.js`. | A3 → B5 |
| B-04 | **P0** | Swarm agents ignore their charges. | `buildJumpPrompt` puts the monolithic `OUTPUT FORMAT` in the **system** prompt shared by all agents; the charge is a user-message suffix. `server/prompts.js:451-466`. | A3 |
| B-05 | **P0** | 118–221 s per turn regardless of span; a 1-day turn = 221 s. | 5 sequential calls + retries, each re-reading ~25k tokens (cache helps prefill, not the 3–10k tokens each writes). | A3 → B |
| B-06 | P1 | The King's progress teleports; its host and its people disagree. | `plots.js` `kings_ride.arrival.needs` is true whenever the progress has **no** march order (the model had redirected it and it arrived elsewhere); the beat then moves characters by `character loc` ops. | A7 |
| B-07 | P1 | The model can redirect canon-critical entities (royal progress, Drogo's khalasar). | No "canon lock" on beat-owned entities. | A7 |
| B-08 | P1 | The model edits the player's host (men, status). | `protectPlayer` guards `army_move`, `army_march`, `army_create`, `travel`, but **not `army_update`**. `world.js`. | A6 |
| B-09 | P1 | The model zeroes an NPC's levies (Bolton 5,000 → 0), crippling later musters. | `figure` op caps protect only the player's ledger. `world.js`. | A6 |
| B-10 | P1 | Lords summoned to war ride off to feasts; lords "ride to pay respects" while delaying the banners. | `retinues.js retinueTick` never checks `obligations.levies` or any activity. | A4 |
| B-11 | P1 | Island houses march over the sea (Crowl from Skagos); Reeds pay the Neck toll; Skagos route crosses the Wall. | `pathfind`/`marchDays` straight-line fallbacks; `chokepoints.js` leave rules lack "natives pass free"; Skagos needs ships. | A8 |
| B-12 | P1 | Characters act where they are not (Renly & Melisandre in the Red Keep; Roose at Winterfell). | Prose is not checked against `WHERE PEOPLE ARE`. | B5 |
| B-13 | P1 | Future canon leaks (Jaime's golden hand; "King in the North" before the crowning; Benjen ranging early). | Base-model knowledge; no "what is known in 298" guard, no banned-anachronism list. | B5, [10](10-narrative-events.md) §9 |
| B-14 | P1 | Audience agreements do nothing mechanical. | `talk()` applies only the reply's ops; the verdict creates no commitment. `server/game.js`, `temperament.js holdToVerdict`. | B6 |
| B-15 | P1 | Officers report fiction (Luwin's muster numbers). | `characterKnowledge` gives figures, not musters in progress, arrivals or ETAs; the chronicle is in context and wins. `server/prompts.js`. | B6 |
| B-16 | P1 | Event spam (31 cards in a turn). | Every subsystem emits its own cards; `foldAnswers` only folds same-day banner answers. | B5 |
| B-17 | P1 | Economy unanchored (see [06](06-economy.md) §1). | `public/data/scenarios.js` figures; `economy.js` upkeep constants (levies ~0.04/man/moon). | C1 |
| B-18 | P1 | The HUD **spoils canon**: *"next turn: 7 days — a quiet week (next: The blood of the dragon, in 30 days)"*. | `turns.js nextTurnLength` reason text includes the next thread's name; shown in `#turn-until`. | A9 |
| B-19 | P1 | Canon order wrong: Purple Wedding (`@3602`, 2nd moon 300 AC) fires **before** the Red Wedding (`@3605`, 5th moon 300 AC). Canon: Red Wedding 299 AC, Purple Wedding 300 AC. Ned's execution, Renly's death, the Blackwater are 299 AC. | `plots.js THREADS.five_kings` stage `at` values. | D1 |
| B-20 | P1 | The model's status writes overwrite engine states (Host of Winterfell shown `holding` mid-march). | `army_update.status` is free text; UI and turn logic read it. | A6 |
| B-21 | P2 | Nature tags wrong: Eddard Stark is "brave, proud, shrewd, **cunning, cold-blooded, unfriendly**". | `temperament.js` derives tags by regex over prose ("cold when angered" → cold-blooded). | A10 |
| B-22 | P2 | Pronoun errors in engine text ("Maege… riding with him", "Barbrey Dustin writes that his", "Catelyn Stark is not himself"). | Hard-coded `he/his/him/man` in `vassals.js`, `psyche.js`, `retinues.js`, `treachery.js`. | A10 |
| B-23 | P2 | Non-canon regents (Ser Gerold "Darkstar" Dayne rules for Edric Dayne). | `regency.js chooseRegent` picks "the ablest adult of the blood" with no canon override. | D4 — ✅ canon regents, `NOT_REGENT` |
| B-24 | P2 | Canon lords die early from random age/illness rolls (Hoster Tully in 298). | `game.js` natural-death roll ignores canon death windows. | D4 |
| B-25 | P2 | The turn-end reason can be false ("until Manderly's host reaches Winterfell" — it was pursuing elsewhere). | `turns.js` reads the stale `march.to`. | B2 |
| B-26 | P2 | JSON unreadable on single quotes (2–3 agents per turn). | Free-form JSON. Fixed by schema-constrained decoding ([04](04-ai-system.md) §3). | B1 |
| B-27 | P2 | CJK tokens leak into Qwen3.6 output ("Lord Um伯", "Winterfell,摆"). | Known Qwen sampling artefact. Filter + prefer Gemma for prose. | B1 |
| B-28 | P2 | Junk decisions from the model ("The Death of the Lion"). | `decision` op open to the model with no template. | B7 — ✅ D3: the op refuses a matter with no catalogued template |
| B-29 | P2 | Map: Westeros off-centre at maximum zoom-out (half the screen empty ocean); army plates cover names ("KIN~2,400~50 SHIPS NG"); diplomacy mode looks identical to realms at far zoom; zoom-in reaches giant low-poly trees. | `MapScene.updateCamera`/bounds, label layout, overlay strength, zoom clamp. | E1–E4 |
| B-30 | P2 | 4 of the HTTP tests fail on Windows ("server did not start"). | Same path bug and spawn assumptions in `tests/http.test.js`. | A2 |
| B-31 | P2 | Tooltips stick after the pointer leaves (Whitewalls card stayed on screen). | `MapScene` hover state not cleared on pointerleave / camera move. | E4 |

## 5. Module disposition

**Keep** = sound, small fixes only · **Rework** = keep the idea and data, change the structure · **Replace** = new
module per this GDD · **Retire** = delete after its replacement lands.

| Module | Verdict | Notes |
|---|---|---|
| `server/index.js` | Keep | Fix B-01. Add routes listed in [03](03-architecture.md) §10. |
| `server/game.js` | **Rework** | `advance()` becomes the phased pipeline in `server/turn/`. Swarm removed. |
| `server/llm.js` | Keep | Excellent plumbing (streaming, continuation, repair). Add `response_format` json_schema, `id_slot`, per-call model routing, CJK filter. |
| `server/prompts.js` | **Replace** | Split into one builder per call in `server/ai/` ([04](04-ai-system.md)). Keep `WORLD_PRIMER`, `SCENE_STYLE` text as seeds. |
| `server/agents.js` | **Retire** | The swarm is replaced by Minds + Narrator. |
| `server/orders.js` | **Rework** | Becomes the Order Interpreter v2: deterministic parser first, constrained model second, receipts always. `raiseLevies`/`callBanners`/`mergeHosts` move to the military engine. |
| `server/court.js` | Keep | Its acts become action resolvers. |
| `server/lore.js` | Keep | BM25 is right for audiences and the council. |
| `shared/world.js` | **Rework** | Keep `applyChanges` as the **engine-internal** mutation gateway; the model no longer calls it. Split ids/places/ops into files. |
| `shared/economy.js` | **Rework** | New constants and model per [06](06-economy.md). |
| `shared/vassals.js` | **Rework** | Muster state machine per [07](07-military.md) §3. |
| `shared/battles.js`, `warfare.js`, `units.js` | Keep | Tune per [07](07-military.md). |
| `shared/plots.js` | **Rework** | Beat schema v2 ([10](10-narrative-events.md) §3): beats move people with parties, never teleport; canon locks; canon-gravity setting. Dates fixed (B-19). |
| `shared/happenings.js` + `data/happenings.js` | Keep | They become flavour **facts**, narrated in one "Meanwhile" line. |
| `shared/retinues.js` | **Rework** | Into the Party system with activity locks ([09](09-living-world.md) §3). |
| `shared/roads.js`, `errands.js` | Keep / merge | Road encounters stay; errands merge into order receipts. |
| `shared/intel.js` | **Rework** | Into the Knowledge system ([09](09-living-world.md) §7). |
| `shared/treachery.js`, `regency.js`, `standing.js`, `diplomacy.js`, `people.js`, `pins.js` | Keep | Small fixes (pronouns, canon regents). |
| `shared/temperament.js` | **Rework** | Natures from explicit data, not regex ([08](08-characters-politics.md) §2). |
| `shared/psyche.js` | Keep | Fix pronouns; its behaviour lines become facts for the narrator. |
| `shared/chokepoints.js` | Keep | Natives pass free; island rules. |
| `shared/rules.js` | Keep (dormant) | The sandboxed DSL is well made. Weaver returns in phase H, schema-constrained. |
| `shared/turns.js` | **Rework** | Interrupt system ([05](05-gameplay-loop.md) §4); no spoilers. |
| `shared/petitions.js` | Keep | Becomes the Matters catalogue ([10](10-narrative-events.md) §6). |
| `map3d/MapScene.js`, `models.js`, `life.js`, `pathfind.js` | **Rework** | Restyle and entity layer per [11](11-map-visuals.md). |
| `map/terrain.worker.js` | Keep | Palette/biome changes only. |
| `ui/*`, `app.js`, `css/style.css`, `index.html` | **Rework** | Layout and components per [12](12-ui-ux.md). Portrait, voice, music, sfx, event-art kept. |
| `data/*` | Keep + expand | Per [13](13-content-data.md). |
| `tests/*` | Keep + expand | Per [15](15-qa-tooling.md). |

## 6. What is genuinely good (do not lose it)

- The **engine-owns-numbers** instinct and the single mutation gateway (`applyChanges`) — the soak tests found no state
  corruption.
- The **ledger** with causes (yields, tribute, obligations) rather than constants.
- The **map built from real GIS atlas data**, projected so distances are true to the books.
- **Book-sourced content**: 120 personas with histories, 150 looks, ~190 happenings, 32 agendas, book musters, house ways.
- **Order receipts** (`previewOrders`) — the right idea; it needs a better interpreter behind it.
- **Prompt-cache awareness** (static prefix first, `warmNext`) — keep the discipline.
- **Portraits and family trees** — the owner's favourite part (2026-09-27): keep and improve ([12-ui-ux.md](12-ui-ux.md) §15); never remove.
- **Cloth banners, Kokoro voices, procedural music and sfx** — keep; restyle, do not rebuild.
- The **sandboxed rule language** (`rules.js`) — keep for phase H.
- The commit history: the bodies explain intent in detail. Read `git log` before touching a module.
