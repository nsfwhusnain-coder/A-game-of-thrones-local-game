# Westeros Chronicles — improvement and development plan

> **Superseded (2026-09-27):** the Game Design Document in [`docs/gdd/`](gdd/README.md) replaces this document wherever they disagree. Kept for history.


_Written 27 September 2026, alongside `docs/REVIEW.md`. Read that first: it says what is broken and what is
missing. This says what to do about it, in what order, and why that order._

The goal, in the owner's words, is a game that **simulates a true and dynamic world of Westeros** at AAA
quality. The engine is already good enough to carry that. What is missing is the middle of the game — the
systems that make a fifty-turn campaign feel different from a five-turn one — plus a usability pass and the
content to fill the world out.

---

## Guiding principles (keep these)

These are already the project's principles and every item below is written to respect them.

1. **The engine owns numbers and physics; the model owns story.** If something must truly happen, make it
   happen in the engine and *tell* the model. Never hope.
2. **Every model output field is optional and every model change is validated.** A 4B model must not be able
   to corrupt a save.
3. **Prompt order is load-bearing.** The static digest comes first so llama.cpp's cache reuse works. Anything
   new that is per-turn goes after `THE STATE OF THE REALM NOW`.
4. **Book accuracy over invention.** Musters, sigils, looks, histories, personalities.
5. **Ship something playable at the end of every phase.** No six-week refactors with nothing to show.

---

## Phase 0 — Foundations (1 week) · *do this before anything else*

Cheap, unglamorous, and it makes every later phase faster and safer.

| Task | Why |
|---|---|
| **ESLint + Prettier + `.editorconfig`**, with a config that tolerates the existing long-line style but catches unused vars, shadowing, `==`, unreachable code and missing `await`. | The codebase is 15k lines of hand-written JS with no static analysis at all. |
| **GitHub Actions CI**: `npm run check && npm test` on push and PR. Both together take under 10 seconds. | There is no `.github/` today. |
| **A balance table** — `public/data/balance.js` — collecting the ~60 magic numbers now inline in `battles.js`, `warfare.js`, `economy.js`, `vassals.js`, `treachery.js` and `regency.js`. | Prerequisite for difficulty levels, and for tuning anything without archaeology. |
| **Split `advance()` into named phases.** It is ~190 lines and fifteen sequential concerns. Turn it into an ordered array of `{ name, run(ctx) }` phases with a shared context object. | Makes the pipeline testable phase by phase, and makes a "what happened this turn and why" debug view trivial. |
| **A deterministic seeded RNG** threaded through the engine (`ctx.rng`) instead of bare `Math.random()`. | Reproducible turns, reproducible bug reports, replayable saves, and property-based tests. |
| **Client smoke tests** with a lightweight DOM (`linkedom` or `happy-dom`, both dependency-light): mount the HUD and each window against a fixture state and assert they render without throwing. | 3,000 lines of DOM generation currently have zero coverage. |

**Done when:** CI is green on push, `npm run lint` passes, one turn can be replayed byte-identically from a seed.

---

## Phase 1 — Make it a game you can win, lose and understand (2–3 weeks)

The first pass of this shipped in this session (`standing.js`, the end screen, the help page, the regency
system). This phase finishes the thought.

### 1.1 More endings, and endings that feel earned
Current endings: extinction, ruin, the Iron Throne, an independent crown. Add:

- **Attainder** — your liege strips your titles and grants them elsewhere; you become a landless claimant and
  may play on as one.
- **The Wall** — a defeated or disgraced lord takes the black; the campaign continues as the Night's Watch.
- **Exile** — the house flees across the narrow sea with its treasury and its name; a Targaryen-style
  restoration campaign.
- **Dynastic endings** — the house survives 100 years / five generations / holds an unbroken paramountcy.
- **Scenario-specific endings** — surviving the Long Night, seating a particular claimant, saving a particular
  character.

Each ending needs a written epitaph in the game's voice, and the end screen should show the **chronicle's
verdict**: three or four sentences the model writes about the house's whole story, drawn from the chronicle.

### 1.2 Goals and ambitions
A running campaign needs mid-term objectives, not only the final score. Give the player's ruler **ambitions**
(drawn from `agendas.js`, which already encodes 32 great players' aims) — *"be named Warden of the North"*,
*"see my daughter wed to a paramount"*, *"break House Bolton"* — each with engine-checkable completion,
a prestige reward, and a line in the standing panel. Let the player choose one at a time.

### 1.3 Difficulty and pacing
- Three difficulties tuning the balance table: enemy AI aggression, the model's licence to hurt you, economic
  margins, treachery rates.
- **Ironman** toggle: no undo, autosave only.
- **Story clock** preference: *brisk* (turns run up to 30 days) / *measured* (current) / *close* (turns break
  on smaller events). `turns.js nextTurnLength` already has the hooks.

### 1.4 Finish the onboarding
The `?` page is a reference, not a tutorial. Add a **first-ten-minutes guided start**: five contextual
prompts, dismissible forever, triggered by state (first order written, first turn ended, first decision
raised, first host raised, first audience). Plus a **"what changed this turn"** summary at the head of the
report: three lines of engine-generated delta (treasury, levies, standing, wars) before the story.

---

## Phase 2 — The dynastic middle game (4–6 weeks) · *the biggest missing system*

This is what turns a strategy toy into a fifty-turn campaign, and it is almost entirely absent today. The ops
(`betroth`, `marriage_characters`) exist; the system does not.

### 2.1 Marriage and the marriage market
- A **match-making surface**: eligible matches across the realm, filtered by age, sex, rank, faith, region and
  existing pacts, each with a computed **match value** (alliance strength, dowry, claims gained, blood
  proximity) and the other house's **willingness**, driven by `vassalTemper`, relations and their own agenda.
- **Negotiation as an audience** — the model plays the other house's head, but the terms are engine-bound:
  dowry in dragons, who fosters the children, whether the match carries a military obligation.
- **Broken betrothals matter.** A refused or broken match is a lasting relation hit and a story thread. (The
  Red Wedding is exactly this mechanic; the game should be able to generate its own.)

### 2.2 Children, ageing and the family tree in motion
- **Births** from marriages, with the existing `generateKin` machinery, inheriting looks from `looks.js` and
  skills from parents via `deriveSkills`.
- **Life stages**: infancy (mortality), childhood (education choice), majority at 16. Education picks a focus
  (martial, stewardship, intrigue, learning, diplomacy, prowess) and a guardian, and modifies adult skills.
- **Health**: wounds from battle that persist, illness, maiming, madness. Today `status` is a bare string.
- **Ageing with consequence**: skills peak and decline; the very old grow frail.

### 2.3 Claims, inheritance and succession crises
- **Claims** as first-class objects: who has a claim on what, how strong, and how it was acquired (blood,
  marriage, conquest, grant, forgery).
- **Succession disputes** when two claims are close — the moment that produces the Dance of the Dragons and
  the Blackfyre rebellions. A disputed succession should be able to split a house's vassals.
- **Bastards and legitimisation.** Both are load-bearing in the source material and neither is modelled.

### 2.4 Faith and culture
- Three faiths that actually do something: the Seven (septons, the Faith's opinion, marriage rules,
  legitimacy), the Old Gods (the North's weirwoods, guest right, oath-weight), R'hllor (fanaticism, a rising
  in the Stormlands). Faith affects marriage validity, unrest, vassal temper and which endings are available.
- Culture (Andal / First Men / Ironborn / Dornish / Rhoynar / Valyrian / Free Folk / Dothraki) driving
  inheritance law (Dorne's absolute primogeniture is already special-cased — generalise it), levy composition
  and acceptance of a foreign liege.

---

## Phase 3 — War, sea and land (3–4 weeks)

The land war is good. The sea does not exist and sieges have only just become interesting.

### 3.1 The navy
- **Transport.** Fleets carry armies. This alone makes the Ironborn, the Redwynes, Dragonstone and any
  Essosi landing playable.
- **Blockade.** A fleet before a coastal holding cuts its trade income and, during a siege, its resupply —
  so a coastal castle cannot be starved without a fleet, which is historically the whole point.
- **Raiding.** The Ironborn's actual game: descend on a coast, take gold, thralls and salt wives, leave.
  `a.type === 'fleet'` plus a `raid` order and a coastal-damage resolution.
- **Sea battles with real terms**: weather, ramming, boarding, fire, the Iron Fleet's quality.

### 3.2 Sieges, part two
- **Relief armies as a mechanic**, not a coincidence: a besieger knows a relief force is coming and must
  choose to storm, stand and fight, or withdraw.
- **Siege engines** as a spend: towers, rams, trebuchets — cost gold and weeks, raise the storm chance.
- **Garrisons as units** with their own morale and commander, able to be reinforced before the lines close.
- **Terms.** A garrison can be offered terms and may accept — the commonest way castles actually change hands.

### 3.3 Terrain, supply and the map
- Terrain modifiers on battle (the map already has mountains, forests, marsh, river crossings) — currently
  `battleOdds` takes a `terrain` parameter that nothing ever passes.
- **Supply lines**: an army far from friendly holdings forages, damages the countryside, and loses supply;
  winter in the North is lethal to a host without a base.
- **Attrition by region and season** so that marching the Reach's levies beyond the Wall in winter is the
  catastrophe it should be.

---

## Phase 4 — The living realm (3–4 weeks)

`plots.js`, `happenings.js`, `retinues.js` and `agendas.js` already make the world move. The gap is that the
world moves *around* the player rather than *with* them.

- **Trade routes on the map.** Goods (Arbor wine, Lannisport gold, northern timber, Braavosi credit, Dornish
  spice) flowing along drawn routes between producers and markets; income tied to the route being open;
  routes interdictable by war, blockade, banditry and embargo. The README has promised this for a while.
- **The Iron Bank as an actor.** It lends, it calls loans, it funds your enemies when you default. `debt` and
  `interest` exist in the ledger and nothing ever comes to collect.
- **Factions within your own realm.** Vassals with shared grievances who act together, not one at a time.
  `treachery.js` is per-house; make conspiracies plural.
- **The court as a place.** Wards, hostages, guests, guest right, hedge knights seeking service, maesters and
  septons assigned. `court.js` exists on the server and is only 169 lines.
- **Rising threats with mechanics, not just flags.** The free folk as an actual migration with numbers; the
  cold as a map-wide seasonal modifier; the Others as a slow, timed, escalating realm threat whose arrival
  reorders everyone's priorities. Given the setting, this is the one supernatural system worth engine support.
- **Dragons.** Daenerys's three, with growth, riders, and a genuinely game-breaking effect on sieges — because
  that is the point of dragons.

---

## Phase 5 — Content and scenarios (ongoing, parallel)

Content work that needs no engine changes and can run alongside everything above.

| Scenario | Notes |
|---|---|
| **Robert's Rebellion, 282 AC** | Highest value after 298. Same map, same houses, different figures and a different starting war. Mostly a `scenarios.js` entry plus ~60 characters. |
| **The Dance of the Dragons, 129 AC** | Needs the dragon system from Phase 4. |
| **Aegon's Conquest, 2 BC** | Seven independent kingdoms; needs the map's borders to be scenario-dependent. |
| **Sandbox** | Randomised relations and figures on the 298 map; the cheapest to build and good for testing. |
| **The Long Night** | Once the Others are modelled. |

Also: every sworn house from the wiki, minor towns and ports, and per-region name generators so
`generateLord` stops producing the same handful of names.

---

## Phase 6 — Presentation and the AAA pass (3–4 weeks)

Assume the engine is done. This is what makes it *feel* finished.

### Interface
- **A real tooltip system** replacing native `title` — styled, instant, touch-aware, and able to hold the
  multi-line explanations the HUD already wants to give (the levy-drift tooltip is four lines of `title` text).
- **Settings in tabs**: Display · Sound & Voice · Graphics · Model · Game. One scroll of 30 controls today.
- **Full keyboard navigation**: roving tabindex through the dock and drawer, arrow keys in lists, a focus trap
  in dialogs (focus capture and restoration landed this pass; the trap did not).
- **A true small-screen layout**, not just narrower panels: the drawer as a bottom sheet, the dock as a
  bottom bar, the map full-bleed behind.
- **An event log with filters** — by house, region, type, importance — over the whole campaign.
- **A "why?" affordance on every number.** The engine knows why the treasury moved and why levies drifted; the
  ledger already records lines. Surface them on click, everywhere.

### Art, sound and moment-to-moment feel
- **Portraits**: the procedural painter is good; a local image-model pipeline (SDXL/Flux via a local endpoint,
  cached to `public/portraits/`) would be the single biggest visual step up, and stays offline-first.
- **Event art** beyond importance 4+, and a proper illustrated card for each canon beat.
- **Music that follows the turn**, not just the house: tension while the model writes, a sting on a battle
  result, silence before a decision.
- **Map polish**: season-driven terrain (snow creeping south through autumn into winter is the single most
  evocative thing this map could do), weather, day/night on long turns, siege camps and burned holdings as
  visible states.
- **The turn replay as cinema.** `playback.js` already flies the camera; give it shot framing, held beats on
  importance-5 events, and a skip.

### Performance
- Prompt budget: currently ~5.7k system + ~12.3k user tokens on a full 298 start (7.9k user in lean mode).
  Fine for 32k+ contexts, tight for anything smaller. Worth a per-section token budget and a "what got cut"
  diagnostic.
- Map: instanced draw calls are already used; add LOD on settlements and frustum culling on banners for
  low-end GPUs, and wire the existing graphics-quality setting to more than one thing.

---

## Suggested order, and why

```
Phase 0  Foundations            ████ 1 wk    everything else is safer and faster after this
Phase 1  Win, lose, understand  ████████ 2-3 wk   the game becomes a game
Phase 2  Dynasty                ████████████████ 4-6 wk   the game becomes long
Phase 3  War and sea            ████████████ 3-4 wk   the game becomes tactical
Phase 4  Living realm           ████████████ 3-4 wk   the world becomes an opponent
Phase 5  Content                ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒ parallel throughout
Phase 6  AAA presentation       ████████████ 3-4 wk   last, deliberately
```

Presentation goes last on purpose. Polishing an interface to systems that are about to change is the most
expensive mistake available here — and the interface is already the strongest part of the project.

---

## What to do first, concretely

If only one week is available, do this, in this order:

1. Wire up CI and ESLint (half a day).
2. Extract the balance table (half a day).
3. Split `advance()` into named phases with a shared context and a seeded RNG (two days).
4. Add the marriage market's *read-only* half — eligible matches with computed value and willingness, shown
   in the Diplomacy window (two days). It is the cheapest slice of Phase 2 and immediately makes the world
   feel like it has a future.
5. Play fifty turns as House Frey against a real model and write down every moment you were confused. That
   list is worth more than any of the above.
