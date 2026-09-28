# 16 · Roadmap: work packages

> The order of work, with acceptance criteria. Each work package (WP) is sized for one focused agent session or a few.
> **Definition of done (every WP):** code + tests + docs updated (this GDD's relevant section marked *implemented* with
> the commit), `npm run check` and `npm test` green on Windows and Ubuntu in CI, screenshots attached for UI work, no
> regression in the scenario tests ([15](15-qa-tooling.md) §2), and a short entry in `docs/CHANGELOG.md`.
> Sizes: **S** ≈ a day, **M** ≈ 2–4 days, **L** ≈ a week+ of agent work.

---

## Phase A — Stabilise the current build (so the owner can play while the rebuild happens)

These patch the *existing* architecture; they are cheap and their tests carry over to the rebuild.

| WP | Title | Fixes | Size | Acceptance |
|---|---|---|---|---|
| A1 | Windows boot: `fileURLToPath` everywhere | B-01 | S | server starts on Windows; `saves/` created in the repo; every `scripts/*.js` uses the helper |
| A2 | Tests pass on Windows + CI workflow (`ci.yml`) | B-30 | S | matrix green (ubuntu + windows, Node 20/22) |
| A3 | Swarm triage: the Bard gets the engine's applied receipts (`briefFromApplied`); the `OUTPUT FORMAT` block is agent-specific (not in the shared system prompt when an agent is set); default `swarm: 'lean'` | B-03, B-04, B-05 (partial) | S | a mock turn's Bard brief contains applied lines; the Hand's schema asks for ops only |
| A4 | Retinues respect duty: no journeys for called/answered/serving vassal lords, the besieged, captives, canon-locked | B-10 | S | `no-feasts-at-war` scenario |
| A5 | Late banners follow the main host wherever it is (not only while it marches) | B-02 | S | `muster-one-host` scenario (old architecture version) |
| A6 | Guards: `army_update` refused on the player's hosts from the story; NPC `figure` changes to levies/menAtArms capped at ±25 % per turn unless caused by an engine event; status text may not overwrite engine states | B-08, B-09, B-20 | S | `player-hosts-protected`, `vassal-figures-protected` |
| A7 | The King's progress: arrival beat fires on arrival; characters travel with the party (no `loc` ops); canon lock on `royal_progress` | B-06, B-07 | M | `kings-progress` |
| A8 | Natives pass chokepoints free; island houses need ships (a simple rule: contingents from island seats wait for transport or use their own ships) | B-11 | M | `natives-pass-free`, `islands-need-ships` |
| A9 | No spoilers in the stop reason / HUD | B-18 | S | `no-spoilers` |
| A10 | Pronouns from `sex`; nature tags from explicit scales for the 50 characters of [08](08-characters-politics.md) §2.3 | B-21, B-22 | S | `pronouns`, `natures` |
| A11 | Canon dates reordered per [10](10-narrative-events.md) §4 in `plots.js` | B-19 | S | `canon-order` (old engine) |

**Status of Phase A (2026-09-27, commit after `16dd483`, done and verified on the owner's PC with the live model):**
A1 ✅ · A2 ✅ (104 tests; GitHub Actions green on windows-latest and ubuntu-latest, Node 22 and 24, at `70d87a8`) ·
A3 ✅ partial (the Bard gets only applied receipts; the shared system prompt no longer demands a full turn from agents;
default `swarm: 'lean'`; plus an interim check that drops story events claiming arrivals the engine never recorded or
retelling the engine's own news, and weekly folding of "answers the call" cards) · A4 ✅ · A5 ✅ (`obligations.join`;
`tests/muster.test.js`) · A6 ✅ · A7 ✅ (arrival fires on arrival; `canonLock` on the progress) · A8 ✅ (natives
pass the Neck free; the King's progress pays no tolls; northern lords no longer pay "the price of the Wall"; **island
hosts take ship** — own ships, boats making trips, or the realm's ships fetching them — on sea lanes from the shared
geography `engine/geo.js`, and land where the goal is soonest reached: `tests/sea.test.js`, DECISIONS D-001) · A9 ✅ ·
A10 ✅ (`sex` on every character; written scales and sway for all 120 personas; archetypes for everyone else, no prose
read: `tests/people.test.js`, D-003) · A11 ✅ (canon threads in the windows and order of 10 §4, the Red Wedding before
the Purple Wedding: `tests/canon.test.js`, D-002).

Live check after the fixes (Qwen3.6-35B-A3B, 3 turns as Stark): turns 117–137 s (were 198–221 s); every vassal
contingent followed the host to Moat Cailin; the King's progress refused redirection and walked the kingsroad; the
story still invented some arrivals in turn 1 before the record check existed — **the record check is a stopgap; B8's
validator is the real fix.**

## Phase B — The Truth Pipeline ([03](03-architecture.md), [04](04-ai-system.md))

| WP | Title | Depends | Size | Acceptance |
|---|---|---|---|---|
| B1 | Engine foundations: `engine/rng.js` (seeded, in the save), day numbers, `data/balance.js`, id/alias tables, lint rule against `Math.random` in the engine | A2 | M | replay of a mock turn is byte-identical — ✅ `engine/rng.js`, `engine/time.js`, `engine/ids.js`, `data/balance.js`, `data/aliases.js`, `scripts/lint-engine.js`; `tests/replay.test.js` (DECISIONS D-005) |
| B2 | State v3: Party model, Activity system, `movement.js` (server-side routes, shared pathfinding), migration v2→v3 with a fixture save | B1 | L | invariants 1–4, 8 of 03 §14 hold every turn in the soak; the v2 fixture loads — ✅ `engine/parties.js`, `engine/movement.js`, `engine/activity.js`, `engine/state/{migrate,settle,validate}.js`, `shared/marches.js`; riders are parties; `scripts/soak.js` (4 houses × 120 turns: every invariant held; nightly 6 × 200), `tests/parties.test.js`, `tests/soak.test.js`, `tests/fixtures/saves/v2-stark-turn3.json.gz` (DECISIONS D-007–D-010) |
| B3 | Fact log, fact kinds + engine text templates (correct pronouns), turn records in files, snapshots, multi-level undo | B2 | M | every engine subsystem emits facts, not events; undo 3 turns works; ironman disables undo — ✅ `engine/facts/{kinds,log}.js`; every subsystem and `applyChanges` op records facts, cards carry their fact; `facts.jsonl`, `turns/`, `snapshots/` (10), multi-level undo (UI asks how far), ironman; `tests/facts.test.js` (undo 3 turns restores the save byte for byte and replays the same facts) (DECISIONS D-011–D-014) |
| B4 | Verb registry; port every existing action (`act()` kinds, `orders.js executeActions`, `court.js`) to verbs with `legal/cost/start/receipt` | B3 | L | all old actions reachable by verb; receipts for all — ✅ `engine/actions/{registry,military,movement,economy,court,diplomacy}.js`: 27 verbs; `POST /act {verb, params}`; written orders and the cards go through verbs; `server/court.js` retired; `tests/verbs.test.js` (every verb done and refused; every old action reachable) (DECISIONS D-015) |
| B5 | AI client: `response_format` json_schema; providers `mock`/`replay`/`openai`; per-call routing and `id_slot`; CJK filter; schema builder + alias canonicaliser with the prefix rule | B1 | M | `ai-contract` tests; the prefix-collision fixture resolves `the_wall` → `castle_black` — ✅ `server/ai/` (client, providers, schema, models, primer, calls/probe); `tests/ai-contract.test.js`, `tests/ai-openai.test.js`; *Settings → Test connection* is the JSON-schema probe (DECISIONS D-006) |
| B6 | Order Interpreter v2: deterministic pre-parser, constrained call, receipts, clarifications; `bench/suites/interpret` (200 labelled orders) | B4, B5 | L | pre-parser ≥ 60 % exact on the suite in CI; 100 % receipts; bench runner works on mock — ✅ `server/orders/{parse,interpret}.js`, `server/ai/calls/interpret.js`; orders read when written, each with its receipt (✓ ⚠ ✗) and clarify chips; the turn does what the receipt said; `bench/suites/interpret` (275) + hold-out (25); pre-parser 99 % on the suite, 64 % / 84 % / 80 % on three fresh hold-outs before tuning, 89 % of orders read without a model; `npm run bench -- --suite interpret`; `tests/interpret.test.js` (DECISIONS D-016–D-021) |
| B7 | Minds: salience, context builder, constrained intents, retry-with-refusal, house-ways behaviour trees (the fallback and the mock); `bench/suites/mind` | B4, B5 | L | Q4 on mock; every great house has a tree; mind calls recorded in the turn record — ✅ `engine/minds/{salience,options,houseways}.js`, `server/ai/calls/mind.js`, `server/minds.js`; six minds a week through the verbs (the Hand retired when minds are on); verb `answer_call`; `bench/suites/mind` (123 situations; the house ways 98 % in character, all lawful); `tests/minds.test.js` (DECISIONS D-022–D-027) |
| B8 | Narrator: fact clusterer (stories), constrained narration, validator (names/places/numbers/anachronisms/game words/script), single-event regeneration, engine-text fallback; `bench/suites/narrate` | B3, B5 | L | adversarial fixtures all caught; `story-matches-map` passes on mock + replay — ✅ `engine/facts/cluster.js`, `server/ai/calls/narrate.js`, `server/ai/validate/narration.js`, `server/narrator.js`, `data/anachronisms.js`; a told story replaces its engine cards and keeps their lines as "the record"; the lord's orders are told under his words; nine adversarial fixtures caught; `story-matches-map` on mock and replay (`tests/narrator.test.js`); `bench/suites/narrate` (60 weeks of 12 seeded games; the mock 100 % true) (DECISIONS D-028–D-031) |
| B9 | Knowledge: news travel, sight, reports, rumours, feints; player view filtered server-side | B3 | M | invariants 9–10; the client never receives an unseen host's true position — ✅ `engine/knowledge.js` (replaces `shared/intel.js`), `server/view.js` on every answer of the API; late news in the chronicle; minds from their house's knowledge; invariants 9–10 (`tests/knowledge.test.js`, `tests/http.test.js`) (DECISIONS D-032–D-033) |
| B10 | Commitments + Audience v2 (outcome schema) + letters as entities + council/advisor calls | B4, B5, B9 | L | `audience-binds`, `officers-know-truth` — ✅ `engine/politics/commitments.js`, `server/ai/calls/{audience,council}.js`, `server/letters.js`, `server/ai/context/officers.js`; no audience, letter or council changes the world but through the engine; `tests/audience.test.js` (DECISIONS D-034–D-036) |
| B11 | Jump v2: segments, interrupts, SSE streaming, *Stop here*; retire `runSwarm`, `server/agents.js`, the old `advance()` | B6–B10 | L | a 7-day mock jump ≤ 1.5 s engine time; SSE segments render in the client; stop-here reproduces facts up to the day — ✅ `server/turn/day.js` (one day at a time), weeks in `server/game.js` streamed over SSE (`/jump`, `/jump/:job/stream`, `/jump/:job/stop`, `/stop`); a 7-day mock jump ~0.3–1.4 s engine time on the cloud VM; `runSwarm`, `server/agents.js` and the old jump prompt gone; `tests/jump.test.js` (DECISIONS D-037–D-039) |
| B12 | Director + `data/hooks.js` (~80) | B7 | M | liveliness guarantees (09 §9) on mock — ✅ `public/data/hooks.js` (81), `engine/director.js`, `server/ai/calls/director.js`, `server/director.js`; every whole week has three facts of note or a hook; `tests/director.test.js` (DECISIONS D-040) |
| B13 | Memory v2: relevant-memory builder (BM25 over facts + summaries), Consolidator from facts, threads from facts | B3, B5 | M | memory block within budget; no free-model threads — ✅ `server/ai/context/memory.js`, `server/ai/calls/consolidate.js`; `tests/memory.test.js` (DECISIONS D-041) |

## Phase C — War and money ([06](06-economy.md), [07](07-military.md))

| WP | Title | Depends | Size | Acceptance |
|---|---|---|---|---|
| C1 | Economy rebalance: populations, formulas, prices, the §5.2 targets, lenders (Iron Bank, Lannister receivables), `balance-sim.js` | B1 | L | Q10 — C1a ✅ populations, formulas, §5.2 targets, the Crown's loans and Lannister receivables, `scripts/balance-sim.js` in CI (`tests/economy.test.js`); C1b ✅ lenders, loans and default, `borrow`/`repay`/`call_debt`/`buy_grain`/`bribe`/`embargo`/`pay_ransom`, the grain price index (DECISIONS D-043, D-044) |
| C2 | Muster state machine v2: calls, answers, gathering, contingents with rendezvous, host card data (present / on the road / expected) | B2, B4 | L | `muster-one-host`; ETAs within ±2 days of actual in the soak — ✅ `engine/military/muster.js`; the host card's muster and *Wait for the banners*; `tests/muster.test.js` (every lord who marched by land joined within 0–2 days of the day reckoned when he set out) (DECISIONS D-042). **Milestone 1 reached.** |
| C3 | Supply and logistics: merge branch `arena/01a0e08c-…` `logistics.js` adapted to parties; forage, devastation, disease | C2 | M | a host marched twice through a stripped province starves; the war room shows rations in days — ✅ `engine/military/supply.js`: rations and wagons, friendly stores, foraging and devastation, the second passage, hunger, camp fever, the season's pace; the host card and the host rows count rations in days; `tests/supply.test.js` (DECISIONS D-045) |
| C4 | Battle v2: stances, standing orders, surprise/feints, lords' fates with canon protection, battle report facts | C2, B9 | M | unit tests for the Green Fork, Whispering Wood, Camps set-pieces (canon-like outcomes with canon numbers ≥ 70 % of seeds) — ✅ `engine/military/battle.js` (power by arms and ground, stances, standing orders, surprise, outcomes, the story's people kept by `data/fates.js`), `set_standing_orders` and `attack_host … surprise`; the battle report says what decided it; `tests/battle.test.js` (DECISIONS D-046) |
| C5 | Sieges v2: fortress table, terms, storm, relief, treachery | C4 | M | Storm's End cannot be starved without a fleet; terms accepted by a craven castellan — ✅ `engine/military/siege.js`, `data/fortresses.js`; `offer_terms`, `storm`; treachery by a bought castellan; relief; the camps before Riverrun; the castle card's siege; `tests/siege.test.js` (DECISIONS D-047) |
| C6 | The sea: ships, embark/land, storms, blockade, coastal raids, sea battles | C2 | L | ironborn raid the Stony Shore by sea; Stannis's fleet carries a host — ✅ `engine/military/naval.js`: ships by kind, `embark_host`/`land_host`, storms, `blockade`, `raid_coast`, sea fights with prizes; the Greyjoys reave when at war; the fleet's card; `tests/naval.test.js` (DECISIONS D-048) |
| C7 | Sellswords, outlaws, the Watch's recruits, the free folk host, the khalasar rules | C2 | M | hired companies desert when unpaid; the khalasar cannot embark — ✅ `data/companies.js`, `engine/military/companies.js`: contracts paid a moon at a time, desertion unpaid, the turncoat's price, hired passage; outlaw bands; the Watch's recruits and neutrality; the free folk gathering; `hire_company`/`dismiss_company`; the Military window's free companies; `tests/companies.test.js` (DECISIONS D-049) |
| C8 | War state: goals, score, peace terms, cold wars | C4 | S | peace offered when score is lopsided — ✅ `engine/politics/war.js`: goals, the score from the day's deeds, cold wars, `sue_for_peace` (white peace, concede, demand), the beaten side's offer (a matter when the lord is the victor); the Diplomacy window's wars; `tests/war.test.js` (DECISIONS D-050). **Phase C done.** |

## Phase D — Canon and story ([08](08-characters-politics.md), [09](09-living-world.md), [10](10-narrative-events.md))

| WP | Title | Depends | Size | Acceptance |
|---|---|---|---|---|
| D1 | Beat engine v2 (schema, triggers, alternates, lapses, canon locks, canon gravity setting); port the 11 threads | B3, B4 | L | `kings-progress`, `canon-order` on the new engine — ✅ `engine/world/beats.js` + `data/beats.js`: windows, triggers (date, arrival, death, after), alternates, lapses, canon locks (the minds do not send the named away), the Canon/Loose/Sandbox choice on the begin screen; `tests/beats.test.js`, `canon.test.js`, `parties.test.js` (DECISIONS D-051) |
| D2 | The full canon beat set (10 §4: ~60 beats) | D1, C2, C4 | L | Q9 over 24 moons on 3 non-involved houses — ✅ 60 beats in 15 threads (`data/beats.js`, with `BOOK_ORDER`); the chain made to hold (the boar waits for the Hand and the burning; the years spare those the canon still needs; the canon's wars are not settled by the realm's lords; prisoners the story needs are not judged); seasons by the Citadel's ravens under Canon; `scripts/canon.js` + `tests/q9-canon.test.js`, nightly for Hightower, Redwyne and Dayne (DECISIONS D-052) |
| D3 | Matters catalogue (~70) from `petitions.js` + beats; model cannot create matters freely | D1 | M | every template renders and resolves; B-28 gone — ✅ `data/matters.js` (62 templates + 26 hook matters), drawn by `realmPetition` from what the world has a place for, deduped by template; the `decision` op refuses an uncatalogued matter; `tests/matters.test.js` renders and resolves every template in twelve houses' worlds (DECISIONS D-053) |
| D4 | Life: canon death windows, protected characters, regents data, health/wounds, ageing | B2 | M | no canon lord dies early under Canon gravity in the soak; `chooseRegent` never picks another branch — ✅ `engine/people/life.js` (wounds, fevers, winter, frailty; `keptByStory` over every death of chance), canon regents and `NOT_REGENT` in `data/fates.js`, invariant 11 in the soak; `tests/life.test.js` (DECISIONS D-054) |
| D5 | House openings (10 §5) + briefs for every playable house | — | M | every house has a brief; the §5 houses hand-written — ✅ 27 by hand, the rest by region and rank, with levers and the council's hints; `tests/briefs.test.js` |
| D6 | Goals/agendas (~90) + house-ways trees for all great and major houses | B7 | L | every salient actor has ≥ 1 goal — ✅ 100 goals of 78 people in `data/goals.js` + rank and nature goals; ways for every great, major, order, tribe and exile house (23 new); goals in the mind's dossier, the ways and salience; `tests/goals.test.js` |
| D7 | Style bible, few-shots and `data/anachronisms.js` | B8 | S | narration validator uses the data — ✅ `data/style.js` (voice, forbidden words, headline, four examples of other houses, maturity Book/Restrained on the begin screen); every validator reads its words; anachronisms keyed to the D2 beats; `tests/style.test.js` |
| D8 | Living society: retinue scheduler v2, courts and calendars, the progress as a first-class party, guests at seats | B2, D1 | M | 09 §3 behaviours visible in the soak (≥ 5 journeys a moon realm-wide) — ✅ scheduler v2 (purposes by nature and season, tourneys, pilgrimages, greeting the King, kin, canon locks, guests, homecomings), the calendar and the small council; the soak counts journeys (≈ 26 a moon); `tests/society.test.js`. **Phase D done.** |

## Phase E — The map ([11](11-map-visuals.md))

| WP | Title | Depends | Size | Acceptance |
|---|---|---|---|---|
| E1 | Camera: framing, bounds, zoom clamp, cursor zoom, LOD framework | — | M | B-29 camera items; `dev/map-lod.html` at L0–L3 — ✅ `map3d/lod.js` (levels, continuous LOD, fades), clamp, tilt, L0 framing and pan bounds, smoothed cursor zoom, timed fly-to, Home/F; `dev/map-lod.html`; `tests/map-lod.test.js` |
| E2 | Political overlay restyle + map modes (Diplomacy visibly distinct; Knowledge, War, Food) + legend | E1 | M | each mode distinct at L0 (pixel-diff test vs Realms > threshold) — ✅ `map3d/modes.js` (Diplomacy's relation scale and hatched realm, Knowledge, War), the legend; `tests/map-modes.test.js` measures each mode's distance from Realms over every holding's fill |
| E3 | Terrain palette, forest impostors (no low-poly trees), the snow line | E1 | L | L3 shows impostor trees; winter shifts the snow line — ✅ `map3d/nature.js` (snow line, frozen rivers, regional tints, the procedural tree atlas), impostor forests in `models.js`, the snow line and canopy mass in the terrain shader; `tests/map-nature.test.js`, `docs/screens/e3/` |
| E4 | Labels: priority placement, no overlaps, halos; tooltip clearing | E1 | M | label-overlap assertion passes; B-31 gone |
| E5 | Party tokens, clustering, figures (hosts, retinues, the progress, envoys, fleets), routes, trails | B2, E1 | L | `dev/tokens.html`; the progress visible from L0 |
| E6 | Holding states and effects (siege, smoke, battle markers, weather) | E5 | M | fixture holdings in each state render |
| E7 | Ambient life restyle + graphics presets + performance budgets | E5 | M | draw-call budget in SwiftShader test; Fast preset disables ambient |
| E8 | Playback choreography (keyframes, day counter, facts on their day, camera rules) | B11, E5 | M | `dev/playback.html` fixture plays in order; reduced-motion cuts |

## Phase F — The interface ([12](12-ui-ux.md))

| WP | Title | Depends | Size | Acceptance |
|---|---|---|---|---|
| F1 | Design tokens, components, SVG-only icons (remove emoji from markup) | — | M | checklist items 4, 12, 19 |
| F2 | New layout: top bar, 4-item strip, corners, chronicle panel; the Book with tabs; settings tabs | F1 | L | checklist 1, 2, 15, 17 |
| F3 | Command composer v2: receipts, clarification chips, counsel ideas, polish | B6, F2 | M | checklist 8, 9 |
| F4 | Audience, letters, council panels v2 | B10, F2 | M | letters in flight shown; outcome chips |
| F5 | Cards (character, holding, host, house) + map context menu | F2, E5 | M | every card opens from the map and from names in text |
| F6 | Matters as sealed letters + pins | D3, F2 | S | silence shown as an option; days left |
| F7 | **Portraits, family trees, who-is-who** (12 §15) — keep and improve | F5 | L | checklist 21–24; family resemblance and age breakpoints in `dev/portraits.html` |
| F8 | Title, house choice, loading, end, onboarding hints, help rewrite | F2 | M | the main-flow Playwright test passes with no console errors |
| F9 | Accessibility, keyboard map, 1366/1024 layouts, checklist automation (`scripts/visual.js`) | F2–F8 | M | Q8 |

## Phase G — Content ([13](13-content-data.md))

| WP | Title | Depends | Size | Acceptance |
|---|---|---|---|---|
| G1 | Houses to ~260 with placeable seats | — | L | `check-data` rules 1, 3 |
| G2 | Characters to ~700 with sex, born, natures, looks, voices, family links | G1, A10 | L | rule 2; every great house at its minimum |
| G3 | Holdings/towns/places to ~300/~120 | G1 | M | rule 3 |
| G4 | Happenings to ~400 | — | M | every region × season covered |
| G5 | Scenario data rebuild (figures from 06/07, starting parties, pacts) | C1, C2, G1 | M | balance sim + muster table gates |

## Phase H — Sound, polish and handoff

| WP | Title | Depends | Size | Acceptance |
|---|---|---|---|---|
| H1 | Music states, fact sounds, narration read-aloud, voice casting coverage | B11 | M | `audio-map` tests |
| H2 | Weaver re-enabled, schema-constrained (optional, off by default) | B5 | S | DSL checks + a schema |
| H3 | Bench v2 runner + suites + `npm run playtest` report + coherence report | B6–B8 | M | runs on mock in CI; produces the owner's report format |
| H4 | `scripts/finetune/` recipe (dataset builder from logs, Unsloth QLoRA config, GGUF export, llama-swap profile) | H3 | M | dry-run on a tiny fixture dataset in CI (no training) |
| H5 | Docs: README rewritten; `docs/HANDOFF.md` (model guidance, llama-swap flags, owner checklist 15 §8, known limits); superseded docs marked | all | M | the owner can follow the checklist without asking |

## Order and parallelism

```
A (all, small) ──► B1 ─► B2 ─► B3 ─► B4 ─┬─► B6 ─┐
                   └► B5 ────────────────┼─► B7 ─┤
                                          ├─► B8 ─┼─► B11 ─► B12, B13
                                          ├─► B9 ─┤
                                          └─► B10 ┘
          C1 (after B1) ─────────────► C2 ─► C3 ─► C4 ─► C5, C8;  C6, C7 after C2
          D1 (after B4) ─► D2, D3, D6, D8;  D4 after B2;  D5, D7 any time
          E1 ─► E2, E3, E4;  E5 after B2 ─► E6, E7, E8 (E8 after B11)
          F1 ─► F2 ─► F3..F8 ─► F9
          G any time after the schemas settle (G1/G2 after A10, B2)
          H after B11
```

**First milestone ("Truthful turn", end of B11 + A + C2):** a Stark game where the muster becomes one host, the King's
progress arrives on the map when the chronicle says it does, every card is bound to facts, and a week resolves in one
narrator call plus a handful of minds.

**Second milestone ("Looks the part", E1–E5 + F1–F7):** the Pax-style layout, the restyled map with visible parties, the
portraits and family trees improved.

**Third milestone ("The whole war", C3–C8 + D1–D8 + G):** the War of the Five Kings plays out under Canon gravity with
the player able to change any of it.
