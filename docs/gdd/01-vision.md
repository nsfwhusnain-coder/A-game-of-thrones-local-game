# 01 · Vision, pillars and the quality bar

> Part of the Westeros Chronicles GDD. Read [README.md](README.md) first.
> Status: **authoritative**. Where an older document (`docs/ROADMAP.md`, `docs/REVIEW.md`, `docs/PAX-HISTORIA.md`,
> `docs/DESIGN.md`) disagrees with this GDD, this GDD wins.

---

## 1. The game in one paragraph

**Westeros Chronicles** is a narrative grand-strategy sandbox set in *A Song of Ice and Fire*, in the year 298 AC. You
are the head of one house — Stark or Lannister, or the Blackwoods of Raventree Hall, the Mormonts of Bear Island, the
Night's Watch or the last Targaryens in Pentos. Time stands still while you think. You speak to your house in plain
words ("Call the banners. Every lord of the North is to join Robb at Moat Cailin within the moon"), hold audiences with
anyone in the world, answer the letters and petitions that reach you, and then you **jump forward**. The world plays out
day by day on a living map: hosts march, lords ride to feasts and weddings, the King's great progress crawls up the
kingsroad, ravens cross the sky, castles burn — and a chronicle written in the voice of the books tells you what
happened, who did it and why. Everything you read, the map shows. Everything on the map is real. The numbers are
grounded in the books, so a lord of the Riverlands feels how poor he is next to Casterly Rock, and a host of twenty
thousand men really does take a month to march from Winterfell to the Twins.

## 2. The player fantasy

"I am a lord in Westeros. My words are commands. My people obey me — or fail me for reasons I understand. The other lords
are real people with their own ambitions, and they scheme and fight whether I watch or not. When I look at the map I can
*see* my kingdom breathe: my banners marching, my wife's party on the road to Riverrun, a column of smoke where the
Mountain rode, the King's progress two days from my gates. I can read the realm like a lord reads a raven: what I am told
may be late, partial, or a lie."

## 3. Pillars

Every design decision in this GDD is justified by one or more of these. When two conflict, the lower number wins.

| # | Pillar | What it means in practice |
|---|---|---|
| **P1** | **One truth** | The map, the numbers and the chronicle never disagree. The narrator only tells what the engine settled. If a story event claims Lord Umber reached Winterfell, Lord Umber's host is at Winterfell on the map on that day. If the map shows it, characters in audiences know it (if they could know it). |
| **P2** | **Your word is law — within the world** | Every order you give produces a visible outcome: it happens, it is under way (with an ETA), or it fails for an in-world reason you are told about. Nothing is silently dropped. Your servants obey; your vassals obey *according to their temper*; everyone else must be persuaded. |
| **P3** | **A realm with its own will** | Every notable character pursues their own goals with their own nature. The realm moves every day whether or not the player acts. The books' story happens by default (canon gravity) and bends when the world no longer fits it. |
| **P4** | **Grounded** | Distance, days, men, gold, grain and season are real quantities with book-anchored values. A raven takes days. A host eats. Winter kills. A lord of eight cannot command armies. Magic is rare, slow and costly. |
| **P5** | **Story first, interface quiet** | The map and the chronicle *are* the game. Panels appear only when asked for. Numbers are shown with meaning ("coin for four moons of war"), not as spreadsheets. It should feel like reading a book you are writing, not operating a dashboard. |
| **P6** | **Alive, not slow** | A week of game time resolves in under ~45 seconds on the owner's PC; the player is always watching something happen, never a spinner. |

## 4. Pax Historia: what we take, and where we differ

The official Pax Historia (paxhistoria.co and its wiki at wiki.paxhistoria.co) is the reference for the loop and the
interface. **Do not use "Open Historia" or other clones as a reference** (owner's instruction).

### 4.1 What we take from Pax Historia

| Pax Historia | Westeros Chronicles equivalent | GDD section |
|---|---|---|
| **Decisional pause**: time frozen while the player acts | Same. The planning phase has no clock. | [05](05-gameplay-loop.md) |
| **Actions** written in free text (⚡ bottom-left), with *Help brainstorm* and *Enhance/Polish* | **Commands** composer, bottom-left, with *Counsel* (brainstorm) and *Polish*. Each command gets an instant **receipt** (what will happen, with numbers and ETA). | [05](05-gameplay-loop.md), [04](04-ai-system.md) §4 |
| **Chats** 1-on-1 or group (💬 bottom-left); "everything you say is taken seriously"; AI-initiated chats from events | **Audiences** (face to face) and **letters** (by raven, with real delay); **council** (group). Agreements become engine **commitments**. NPCs may request an audience or write first. | [08](08-characters-politics.md) |
| **Advisor** (your flag, bottom-right) with prewritten prompts | **Your council** (your ruler's portrait, bottom-right): maester, steward, master-at-arms, spymaster, with prewritten questions. | [12](12-ui-ux.md), [04](04-ai-system.md) §8 |
| **Jump Forward** (⏩ top-right): "next major event" or a date 1 week–1 year | **Jump**: *Until something happens* (default) · 1 week · 2 weeks · 1 moon · 3 moons. | [05](05-gameplay-loop.md) |
| Events appear one by one while the map changes; **Save** and **Intervene** during the jump | **Playback**: a day counter runs, the map changes on the day each fact happens, cards appear in the chronicle; *Pause*, *Skip*, *Stop here* (intervene). | [05](05-gameplay-loop.md), [11](11-map-visuals.md) |
| **Catalysts** (AI storylines with choices) | **Matters** — sealed letters/petitions/demands with 2–4 options plus "answer in my own words", pinned on the map. | [10](10-narrative-events.md) §6 |
| **Difficulty** Very Easy → Impossible, injected into prompts | Same five levels, injected as text **and** as engine balance multipliers. | [05](05-gameplay-loop.md) §7 |
| **Event consolidation** for long games | The **chronicle** (engine facts + consolidated summaries). | [04](04-ai-system.md) §9 |
| **Simulation Rules / World Before** kept identical across prompts | A **static primer** shared by every call, cached by llama.cpp. | [04](04-ai-system.md) §2 |
| **Map features**: cities, capitals, battalions; clean political map | Holdings (castles, towns, villages), seats (capitals), hosts/fleets/parties as tokens; clean political colours at far zoom. | [11](11-map-visuals.md) |

### 4.2 Where we deliberately differ

1. **The AI does not write the world; it proposes and narrates.** Pax lets the model change regions directly. That is
   exactly what broke this game: a 3-billion-active-parameter local model given 30 operation types and a 25,000-token
   prompt contradicts itself. Here the model *decides for characters* (intents), *interprets the player* (orders), and
   *tells the story* (narration) — and the deterministic engine resolves everything in between. See
   [03-architecture.md](03-architecture.md).
2. **Numbers are first-class and engine-owned.** Men, gold, food, days. Pax keeps numbers implicit.
3. **People, not nations.** The actors are characters with families, locations and natures, not polities.
4. **Fog of war and slow news.** Pax shows the true world; here the player's house knows what its ravens and spies tell it.
5. **Local and offline.** Runs on a 12 GB GPU with a 64k-context local model. No tokens, no cloud.

## 5. What a session feels like (target experience)

This is the experience every work package is building towards. Agents should read it and ask "does my change make this
happen?"

### 5.1 House Stark, the first ten minutes

1. **Title.** A painted map of the Known World breathes behind a short list of houses (Great Houses first). Choosing Stark
   shows Winterfell's banner, Lord Eddard's portrait, three lines on the situation ("The King is riding north to ask you to
   be his Hand. Summer is ending.") and one button: **Begin**.
2. **Arrival.** The camera settles over the North. The chronicle panel on the left holds a single card — *"A raven from
   the Twins: the King's progress has crossed the Green Fork"* — and a small note on how to give a command. Top-left:
   the date and the season. Bottom-left: **Command** and **Audience**. Bottom-right: Lord Eddard's portrait (council).
   Top-right: **Jump ▸ Until something happens**. Nothing else.
3. **First command.** The player types *"Have the castle prepared for the King. Send Jory with twenty men to meet the
   progress at the kingsroad and escort it in."* The **receipt** appears under it within ~3 seconds:
   *✓ Jory Cassel rides south with 20 men of the household — meets the progress in ~6 days.*
   *✓ The steward prepares Winterfell for the King (−600 dragons, +feast when he arrives).*
4. **Jump.** The day counter runs. On the map a small grey-and-white party leaves Winterfell's gate and walks down the
   kingsroad. Far south a great gold-and-black column (the King's progress, 1,400 people, the Queen's wheelhouse) is
   visibly crawling north. A raven flies from Castle Black to Winterfell — a letter from Benjen. On day 6 the two columns
   meet; the camera eases over; a card: *"Jory Cassel meets the King's progress at the Barrowlands"*, three sentences
   behind Jory's eyes. The turn stops: *"The King is two days from Winterfell."*
5. **A matter.** A sealed letter icon pulses at Winterfell: *The King asks you to be his Hand* — four options and "answer in
   my own words". The player decides next turn, or lets it wait (the King will not wait forever).

### 5.2 A lesser house: the Blackwoods of Raventree Hall

1. Lord Tytos Blackwood has ~2,500 levies, ~8,000 dragons in coin, a feud with the Brackens older than the Andals, and a
   liege (Hoster Tully) who is dying.
2. The player writes: *"Send Brynden with forty riders to burn the Bracken mill at the Stone Hedge ford. Deny everything."*
   The receipt: *✓ Brynden Blackwood rides with 40 riders (~1 day) · ⚠ Lord Hoster forbade private war — if it is traced to
   you, expect a summons to Riverrun.*
3. The jump shows the riders, a small fire icon at the ford, and a chronicle card behind a Bracken miller's eyes. Two days
   later a **rumour** card — Lord Jonos Bracken blames the Blackwoods. A week later a raven from Riverrun (engine: Edmure
   heard of it; his mind chose *demand*): *Lord Edmure summons you to answer for the Stone Hedge mill.*
4. Meanwhile, the War of the Five Kings is coming whether the player likes it or not: Gregor Clegane's raiders appear on
   the Red Fork when the canon beat fires, and the Blackwoods are in their path.

### 5.3 What the player never sees

- A number of "morale", "unrest 43", "prosperity 60" in prose. Meters exist in the ledger, never in the story.
- A lord in two places at once.
- A letter that arrives the day it was sent.
- "The North remains quiet."
- The engine's schedule of canon events ("next: The blood of the dragon, in 30 days"). Canon is a secret the world
  keeps.

## 6. Scope

### In scope (owner decisions of 2026-09-27)

- **One scenario, done perfectly:** *A Game of Thrones — 298 AC* (start 1st day of the 8th moon, 298 AC), playable
  through the whole War of the Five Kings and beyond (open-ended; canon beats defined through 300 AC).
- **Every great house and every lesser house with a seat on the map is playable** (see [13-content-data.md](13-content-data.md)).
- **Canon gravity, adjustable** (Canon / Loose / Sandbox), default *Canon*. See [10-narrative-events.md](10-narrative-events.md) §2.
- **Keep the three.js 3D map, restyled** — a clean political map at far zoom, a painted tabletop world close up.
  See [11-map-visuals.md](11-map-visuals.md).
- **Local models via llama-swap, 64k-context profiles only.** See [04-ai-system.md](04-ai-system.md) §11.

### Out of scope (for now; do not build)

- Other eras (Robert's Rebellion, the Dance, the Conquest). The data layer stays scenario-shaped so they can come later.
- Multiplayer.
- An in-game map editor.
- Cloud model providers as defaults (an OpenAI-compatible endpoint remains supported).
- Real-actor voice cloning (declined for consent reasons; keep declining).

## 7. The quality bar ("AAA", made measurable)

"AAA polish" is not a feeling; these are the gates. A phase in [16-roadmap.md](16-roadmap.md) is not done until its gates pass.

**Who verifies what.** The implementing agent works in a cloud VM with GitHub access only — no GPU, no local model, no
access to the owner's PC ([00-agent-brief.md](00-agent-brief.md)). So every gate has a **CI form** the agent must make
pass with the mock and replay providers ([04-ai-system.md](04-ai-system.md) §14), and, where a real model matters, an
**owner form** the agent prepares as a one-command script and a checklist in `docs/HANDOFF.md`. Column "Verified by":
**CI** = GitHub Actions, agent-owned; **Owner** = run by the owner locally with the scripts the agent ships.

| Gate | Measure | Target | Verified by |
|---|---|---|---|
| **Q1 Truth** | Coherence checker ([15-qa-tooling.md](15-qa-tooling.md) §3) over scripted 30-turn playtests for 5 houses | 0 contradictions of class A (position, life/death, arrival, numbers of the player's own forces); ≤ 1 class B per 10 turns | **CI** with mock + replay providers (the validator must also reject every seeded contradiction in the adversarial fixture set); **Owner** with the live model via `npm run playtest` |
| **Q2 Orders** | Order-interpreter bench (200 labelled orders) | ≥ 95 % exact actions; 100 % of orders get a receipt; 0 silent drops | **CI**: the deterministic pre-parser alone must reach ≥ 60 % exact on the suite, and 100 % of orders must get a receipt; **Owner**: `npm run bench -- --suite interpret` for the model's accuracy |
| **Q3 Pace** | Wall-clock on RTX 5070 12 GB, 32 GB RAM, Gemma 4 26B A4B 64k | 7-day jump ≤ 45 s p50 / ≤ 75 s p95; 30-day jump ≤ 90 s p50; audience reply ≤ 12 s; receipt ≤ 5 s | **CI**: engine-only jump (mock provider, 0 ms model latency) ≤ 1.5 s per 7 days; call count and prompt-token budgets per call asserted; **Owner**: `npm run bench -- --suite latency` |
| **Q4 Liveliness** | Per 7-day jump | ≥ 3 named NPC decisions resolved; ≥ 1 visible party/host movement not caused by the player; 0 "nothing happened" events | **CI** (mock minds are rule-based and must meet this too) |
| **Q5 Readability** | Chronicle cards per 7-day jump | 3–8 main cards (never > 12), background life collapsed into one "Meanwhile" line | **CI** |
| **Q6 Stability** | 200-turn mock soak × 6 houses | 0 crashes, 0 NaN, 0 dangling ids, save size < 5 MB | **CI** (nightly workflow) |
| **Q7 Platform** | CI | `npm test` and `npm run check` green on **windows-latest** and ubuntu-latest | **CI** |
| **Q8 Interface** | Heuristic checklist in [12-ui-ux.md](12-ui-ux.md) §14 | 100 % of items pass on 1920×1080 and 1366×768 | **CI**: Playwright screenshots (SwiftShader WebGL) attached to each PR + DOM assertions; **Owner**: a visual pass on real hardware |
| **Q9 Canon** | Canon playtest (no player interference, Canon gravity) for 24 moons | ≥ 90 % of canon beats fire within their window, in order, with no teleports | **CI** (beats are engine-driven; mock minds suffice) |
| **Q10 Economy** | Balance simulation ([06-economy.md](06-economy.md) §12) | Every great house within ±15 % of its target income; war chest in months matches the table | **CI** |
