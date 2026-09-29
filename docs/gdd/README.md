# Westeros Chronicles — Game Design Document

> Written 2026-09-27 after a full audit of the codebase, a live playtest against the owner's local models, a model
> bench, and a study of the official Pax Historia. **This GDD supersedes** `docs/ROADMAP.md`, `docs/REVIEW.md`,
> `docs/PAX-HISTORIA.md` and `docs/DESIGN.md` wherever they disagree. `docs/HANDOFF.md` remains the log of past
> sessions until the implementing agent replaces it ([00-agent-brief.md](00-agent-brief.md) §7).

## 1. What this is for

A complete plan for turning Westeros Chronicles into a polished, immersive, coherent game: an AI-simulated narrative
grand-strategy sandbox in *A Song of Ice and Fire*, played like Pax Historia, grounded in the books' numbers, alive on
the map. It is written for an implementing agent working from GitHub alone (no local model), and for the owner.

## 2. The owner's decisions (binding)

| Date | Decision |
|---|---|
| 2026-09-27 | **Canon gravity, adjustable** (Canon / Loose / Sandbox), default Canon ([10](10-narrative-events.md) §2) |
| 2026-09-27 | **Keep the 3D map and restyle it** (clean political map far out, painted tabletop close in) ([11](11-map-visuals.md)) |
| 2026-09-27 | **One scenario, done perfectly:** *A Game of Thrones — 298 AC*; other eras out of scope for now |
| 2026-09-27 | **Only the official Pax Historia** as the design reference; never Open Historia |
| 2026-09-27 | **64k-context model profiles only**; the 256k profile is too slow |
| 2026-09-27 | **Portraits and family trees: keep and improve**, never remove ([12](12-ui-ux.md) §15) |
| 2026-09-27 | The implementing agent has **no model access**: everything CI-testable with mock/replay; the owner verifies the live model with shipped scripts ([00](00-agent-brief.md)) |
| earlier | Book accuracy first; the show only where the books are silent; no real-actor voice cloning; zero runtime dependencies |

## 3. Reading order and map

| # | Document | What it covers |
|---|---|---|
| 00 | [Agent brief](00-agent-brief.md) | the implementing agent's situation, latitude, standards, never-do list, handoff |
| 01 | [Vision](01-vision.md) | the game in one paragraph, pillars, Pax Historia comparison, target experience, scope, **quality gates** |
| 02 | [Audit](02-audit.md) | the evidence: root causes R1–R6, the live playtest, the **bug register B-01…B-31** (fixed ones are marked ✅ with the WP), module dispositions |
| 03 | [Architecture](03-architecture.md) | **the Truth Pipeline**: propose → resolve → narrate; data model v3; parties; activities; facts; verbs; the turn pipeline; saves; migration |
| 04 | [AI system](04-ai-system.md) | every model call: interpreter, minds, narrator, director, audience, council, memory; **constrained decoding**; models and bench; fine-tuning; **testing without a model** |
| 05 | [Gameplay loop](05-gameplay-loop.md) | planning, the jump, interrupts, playback, turn summary, difficulty, canon gravity, endings, ambitions, onboarding, pacing |
| 06 | [Economy](06-economy.md) | canon anchors, population, formulas, **target incomes and treasuries**, prices, credit, trade, food, works |
| 07 | [Military](07-military.md) | forces, **the muster state machine and rendezvous**, orders, movement, supply, battle, siege, the sea, sellswords, war state |
| 08 | [Characters & politics](08-characters-politics.md) | natures (explicit scales, calibration table), life and canon death windows, succession, offices, regency, **commitments**, vassals, relations, verbs, marriage, captives, secrets |
| 09 | [Living world](09-living-world.md) | goals, minds and behaviour trees, society on the roads, **the King's progress**, ambient life, threats, weather, **knowledge and fog of war** |
| 10 | [Narrative & events](10-narrative-events.md) | beat schema, **the canon beats 298–300 AC**, house openings, matters, hooks, the narrator's style bible, anachronism guard |
| 11 | [Map & visuals](11-map-visuals.md) | art direction, camera, LOD, map modes, terrain, **entities and tokens**, overlays, labels, interaction, performance, playback |
| 12 | [UI & UX](12-ui-ux.md) | layout (Pax-style corners), design system, composer, numbers with meaning, chronicle, audiences, cards, the Book, matters, settings, accessibility, **checklist**, **portraits & family trees** |
| 13 | [Content & data](13-content-data.md) | sourcing rules, houses to add, character targets, holdings and places, data files, validation |
| 14 | [Audio](14-audio.md) | music states, sound cues from facts, voices |
| 15 | [QA & tooling](15-qa-tooling.md) | test pyramid, **scenario tests (the owner's complaints)**, coherence checker, determinism, CI, dev tools, owner verification |
| 16 | [Roadmap](16-roadmap.md) | **work packages A–H** with dependencies and acceptance criteria; milestones |
| 17 | [Declutter the interface](17-ui-declutter.md) | the owner's review: a quiet HUD, three menu entries, the headline strip, contextual cards, first-run guidance; **U1–U9** |
| 18 | [Headlines](18-headlines.md) | Pax-style event cards: a headline that says what happened, a plain summary; the deterministic writer under the narrator; **N1–N10** |
| 19 | [The State of the Realm](19-realm-ledger.md) | the hidden ledger of every house's strength and trend, knowledge-filtered, one source for the minds and the council; **R1–R7** |
| 20 | [Pax Historia reference](20-pax-reference.md) | what we take from the official Pax Historia: its loop, its screen, headline and summary rules with twenty Westeros before/after pairs |
| — | [Mockups](../mockups/README.md) | **the target interface, drawn**: eight screens at 1920×1080 and 1366×768 (the quiet HUD, headline feed, event card, digest, the State of the Realm, menu and card, first run, and today's clutter annotated) |
| — | [assets/](assets/) | recorded model outputs and screenshots from 2026-09-27 |

## 4. Status legend

Sections may carry a status line: **authoritative** (decided), **proposed** (open to the agent's better design),
**implemented in `<commit>`** (done), **superseded by `DECISIONS.md#<id>`**.

## 5. Glossary

| Term | Meaning |
|---|---|
| **Fact** | an engine-recorded thing that happened (the only history) |
| **Intent** | a proposed action by a character (from a mind, the player's order, a beat) |
| **Verb** | an action type in the registry (legality, cost, resolution, receipt) |
| **Party** | anything that moves: host, fleet, retinue, envoy, rider, the progress, caravan, band |
| **Mind** | a model call that chooses one character's intent |
| **Narrator** | the model call that writes chronicle events from facts |
| **Receipt** | the immediate ✓/⚠/✗ lines under an order |
| **Matter** | a decision put to the player (Pax Historia's catalyst) |
| **Beat** | a canon story event with a window, preconditions, effects and alternates |
| **Canon gravity** | how strongly the books' course is pushed (Canon / Loose / Sandbox) |
| **Commitment** | a promise the engine tracks and resolves |
| **Knowledge** | what a house knows: facts learned, reports of hosts, rumours |
| **Segment** | a ≤ 7-day slice of a jump, simulated and narrated as a unit |
| **The Book** | the ledger overlay (realm, hosts, coin, people, diplomacy, knowledge, chronicle) |
