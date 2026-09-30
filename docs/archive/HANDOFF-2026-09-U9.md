# Handoff — Phases N, R and U are built: headlines, the realm's figures, the quiet screen

*Written 2026-09-30 at the end of Phase U, by the lead engineer who carried Phases N, U and R from their plans to the default branch (the previous handoff, at the end of E5, is
[`archive/HANDOFF-2026-09-E5.md`](archive/HANDOFF-2026-09-E5.md); an interim one, written after N1–N4, is in the git history of this file). The plan is the Game Design Document in
[`docs/gdd/`](gdd/README.md); the order of work is [`16-roadmap.md`](gdd/16-roadmap.md); design departures are in [`DECISIONS.md`](gdd/DECISIONS.md) (D-001 … D-088); what changed for the player is in
[`CHANGELOG.md`](CHANGELOG.md). The local model's own documents are in [`local-ai/`](local-ai/README.md).*

## 0. Where things stand (read this first)

- **The default branch `claude/brave-ramanujan-i8dt0q` is green and playable** (CI: windows-latest and ubuntu-latest, Node 22 and 24; about 740 tests). Everything below is merged. `npm start` → http://127.0.0.1:3298.
- **About three quarters of the game is built** (the work packages of `16-roadmap.md`): Phases A–D (the engine, the war, the story), E1–E5 (the map), and now **all of N (headlines), R (the State of the Realm) and U (the quiet screen)**. Left: **E6–E8** (holding states, graphics presets,
  playback choreography), **F3, F4, F6, F7 (the portraits' generator), F8, F9** (composer v2, audience and letters v2, matters as sealed letters, the title and end screens and the help, accessibility), **G1–G5** (data: houses, characters, holdings, happenings, scenario), **H1–H5** (audio, weaver, bench v2, the fine-tune recipe, the final handoff).
- **What the player sees today:** a map with the maester's-desk look (GDD 21); a top bar of three vitals, an Inbox and End turn; a headline strip and a chronicle of ranked cards with the people's faces; a command bar (a box, a microphone and a quill: one button sends;
  a small CPU-only scribe mends spelling before the steward reads); **click a castle or a host and a card opens beside it**; **two windows with tabs** (Realm: Ledger · House · Hosts · Treasury · Diplomacy; People: family & court · Council · Shadows);
  the **State of the Realm** ledger (every house as your house knows it, with marks for how sure); a welcome page and three tips on a new game; **F** for focus; the family tree with lines; the ruler's plate with how they are.
- **What the owner should check first** (each one command, §2): `npm start` and play a new game as Stark for ten minutes; `node scripts/realm-dump.js --play stark --turns 12`; `node scripts/ui-gate.mjs` and `node scripts/map-check.mjs` (dev-only, need Playwright: `npm i --no-save playwright`).
- **The owner's rules for this work** (binding; from the brief and from what the owner said while it ran):
  - **No model names in commits, PRs or code**; no attribution trailer and no "generated with" footer. Commits have a plain subject and a body that says what changed for the player and why. (The merged commits of PRs #47–#49 carry a trailer; the owner knows.)
  - **The lead does all the work itself: no subagents** (the CLAUDE.md line about at most two subagents is for other sessions).
  - The engine stays deterministic (no `Math.random`, no clock, in `public/js/engine`, `public/js/shared`, `server/turn`; the lint enforces it). Model output never mutates state. No runtime npm dependencies. **Never remove or degrade the portraits or the family trees** (U9 improved them and holds it by test).
  - Every AI call has a JSON schema, a mock and a deterministic fallback; **no test or CI step needs a live model**. Every new player-facing view goes through the knowledge filters with a non-interference test.
  - The owner's model server is theirs: **never kill or restart their `ollama`, `llama-server` or llama-swap**, never touch their `config.json`; the local model may be used only on the lead's own llama-swap (port 8096) and only when the GPU is idle (VRAM ≤ ~10.7 GB).
  - Screenshots at 1920×1080 and 1366×768 for every UI package, looked at, and attached to the PR.
- **Next, in this order:** E6–E8, F3, F4, F6, F7, F8, F9, G1–G5, H1–H5 (§6). **Owed to the owner at the very end:** whether to fine-tune the local model again and on what (§4 has what is known so far).

### How the work has been done (keep doing it this way)

- **A branch per package or slice** (`wp/<ids>-<slug>`; D-059), tests first or with the code, `npm run check && npm test` (about 3 minutes), the UI gate and screenshots for anything visible, docs (CHANGELOG, roadmap ✅, GDD "implemented", DECISIONS), a PR with What / Why / How / How tested / Screenshots / What the owner should verify,
  **merged with a merge commit only when all eight CI jobs are green**. There is no `gh` CLI here: PRs are made and merged with the REST API and the token from `git credential fill`.
- **Measure first, then fix**, and let the measure stay: N10's headline suite found a writer fault ("One lords take the road"), R7's soak found a levies band that missed the truth for one house in five, the U-phase gate now catches a card over the command bar. A bench that has found nothing has not yet been made hard enough.
- **Read the picture.** Every UI package was looked at in both sizes before it was called done; that found a card covering a castle's name, a tab strip that wrapped, a label that split a word, silhouettes where portraits were still being painted.

### Tips and traps learned the hard way

- **Windows** (CI and the owner's PC): a dynamic `import(path)` needs `pathToFileURL`. A Windows checkout has CRLF: never regex over source files with `\n` alone (tests read files and `.replace(/\r\n/g, '\n')`). Edit scripts: read, `split(CRLF).join(LF)`, edit, write back the same endings.
- **In this shell**, backslashes in heredocs and `String.replace` with `$` in the replacement are traps (a `\s` lost its backslash and split names on the letter "s"): write scripts that use `split/join`, and use the editor for anything with a regex.
- **`tests/http.test.js` uses a fixed port (3411)**: never run two full `npm test` at once. Screenshots and a full test run at once can exhaust memory on small machines. **The soak test (`tests/realm-soak.test.js`) plays three 24-moon games in three processes** (about 100 s); the whole suite is about 3 minutes.
- **Leaks by spread:** `server/view.js` `playerView` spreads `...state`, so every new top-level state field reaches the browser unless it is deleted there (that is how `realmStats` leaked; D-069). Every new field: strip it, and add a non-interference test (mutate a hidden truth, assert the served bytes are identical). The realm audit (`bench/lib/realm-audit.js`, `hideTruth`) does this every moon for the ledger.
- **Facts are not in `state` between turns** (they are in `facts.jsonl`). **Canon gravity owns the story's dates**: a test that needs a season to pass or a lord to die needs `canonGravity: 'sandbox'`.
- **`UPDATE_SNAPSHOTS=1` rewrites every prompt snapshot**: run it, look at `git diff --stat`, and `git checkout` the ones you did not mean to change (line endings show as changes).
- **Portraits are painted on demand** (`ui/portrait.js`: about 10 ms each on a real machine, about 200 ms on the cloud's software renderer). A screenshot of a list must wait for them (the shooters poll for placeholders). A long list fills in over a few seconds.
- **Kill by PID, never `pkill -f` a pattern that is in your own command line.** The UI gate and `map-check.mjs` start their own server on their own port and their own saves folder.

## 1. What was built

All merged into `claude/brave-ramanujan-i8dt0q` with CI green on windows-latest and ubuntu-latest, Node 22 and 24.

### Phases N, R and U (this handoff)

| Slice | PR | What changed |
|---|---|---|
| Docs | #40 | The agent playbook, the eight mockups of the target interface, the Pax Historia reference (GDD 20). |
| **U0** the look | #41 | GDD 21 *the maester's desk*: vellum = the maester wrote this; oak and leather = the frame; iron = press it; wax = awaits your word; gold leaf = read first. `public/css/theme.css`, textures painted by `scripts/paint-ui.js`, a style tile at `/dev/style.html`. |
| **SB** bug sweep | #42 | From the first playtest: a refused order no longer half-runs; another house's man is refused, not bound to your biggest host; musters report at start, weekly and whole; a dead lord's heir is no longer his clone; playtest and bench scripts run on Windows. |
| **N1+N2** | #43 | The headline scorer (`server/ai/validate/headline.js`), a golden set of 71 stories and 69 bad headlines, labels and slots on facts. |
| **R1–R3** | #44 | `engine/realm/`: every house's figures sampled weekly (`state.realmStats`, never sent to the browser); what the player's house observes of the others (`knowledge[me].realm`, `hash32` noise, no dice); `realmViewFor`; `GET /api/games/:id/realm`. |
| **N3+N4** | #45 | The deterministic headline writer (`engine/facts/heads.js`, `headline.js`) and clustering v2 (roll-ups, splits, lead by weight, late news apart, Meanwhile). |
| **N5+N6+N9** | #47 | Narrator v3: the writer is the floor and the model's scenes sit on it; the card (headline, summary, details, tier, score) in the turn record; the digest; ranking. The local model was used on the lead's own llama-swap for this (D-074…D-078; `docs/local-ai/`). |
| **U1–U3** | #48 | The quiet screen: a bar of three vitals, one menu with three doors (Realm, People, Chronicle), the Inbox, the headline strip, the command bar. The dock and the drawer's tabs are gone. |
| **N7+N8** | #49 | The chronicle as ranked cards with Details and filters, the maester's report after a turn, playback controls on the strip, pins by tier. |
| **Q1** | #50 | One quill sends; a microphone (speech runs in the page on the CPU); a small CPU-only scribe mends spelling and the stops of a spoken line, its work thrown away if it changes a number, a name or the order of the words (`docs/local-ai/SCRIBE.md`). |
| **R4+R5+R6, N10** | #51 | The State of the Realm window (Strength, Economy, Lands, Wars; ranks shared where bands overlap; marks `~ ≈ ≥ —` for how sure); a word for each house (rising, falling) with reasons; what the realm is saying and where to focus (buttons that only write the order in the box); the lords' minds and the council read the same figures; the headline suite `npm run bench -- --suite headlines`. |
| **R7** | #52 | `scripts/realm-dump.js` (truth beside what the ledger shows; `--soak`), the audit and a 24-moon, three-game soak in CI: own exact, sworn ±5 %, fresh sightings ±10 %, reports and rumours ±25 %, bands that hold the truth, no leak. It widened the levies band. |
| **U4** | #53 | A click on a castle or a host opens a card beside it (holder, garrison of your own, lands, who is here, the latest news, three things to do); six windows became two with tabs; a sheet takes a window's place and says the way back. `tests/fixtures/ui/hooks-before-u4.json` holds that no action was lost. |
| **U8** | #54 | A welcome page once (remembered in the browser and in the save), three coach marks that go away, focus mode **F** (following a host moved to **G**), bars that step back, at most a dozen plates and six pins on the map (`scripts/map-check.mjs`). |
| **U9** | this branch | The People tab opens on your own people; the family tree has portraits and lines and a "wider family"; how the lord is on the plate, a ring and a hover card; faces on the chronicle's cards. `tests/fixtures/ui/portraits-before-u9.json` holds that nothing was removed. |

### Earlier phases

| WP | PR | What changed for the player |
|---|---|---|
| A (finish) | #3 | Islands need ships; every character has a sex and a nature; canon threads in the books' order. |
| B1–B13 | #4–#16 | The save's own dice (a turn replays byte for byte); every model call constrained by a JSON schema; everything that moves is a party on real roads; facts are the only history (undo goes back ten turns); every action is a verb with a receipt; orders are read with a receipt or a question; the lords think for themselves each week; the chronicle is told from the facts and checked against them; every house knows only what has reached it; a lord's word binds; the days are lived one by one; a Director; memory. |
| C1–C8 | #17–#25 | The banners come as lords would bring them (**Milestone 1**); gold means something; lenders and loans; supply, foraging, camp fever, seasons; battles by stance and ground; sieges with the great castles' rules; the sea; free companies and outlaws; the state of war and peace. |
| D1–D8 | #26–#33 | The beat engine and sixty canon beats (Canon / Loose / Sandbox); sixty-two kinds of matter; wounds, fevers and heirs; an opening for every house; goals and ways; the style bible as data; lords ride out every moon. |
| E1–E5 | #34–#38 | The camera frames Westeros; map modes that read; painted trees; names never drawn over one another; a token and plate for every kind of party. |

## 2. What CI verifies, and what the owner verifies

CI (`.github/workflows/ci.yml`) runs `npm run check` and `npm test` (about 740 tests, about 3 minutes) on windows-latest and ubuntu-latest, Node 22 and 24: the engine, verbs, facts, knowledge, minds, narrator, audiences, the jump, the Director, memory, the HTTP API end to end, the contract of every model call on the mock and on recorded replies,
the two-year canon playtest for Hightower, the headline scorer, golden set, writer, clustering and the writer's bench slice, the realm's figures with the 24-moon three-game audit and its leak checks, the pure logic of the whole quiet screen (hud, feed, pins, cards, first run, people, tree). A nightly soak plays 200 turns × 6 houses.

**Dev-only checks that need Playwright** (`npm i --no-save playwright`; not in CI): `node scripts/ui-gate.mjs` (Phase U's acceptance table at both sizes, turn 0 and 5, on real clicks: controls, text blocks, pixels covered, the card beside a castle, the tabs, the welcome and the tips, focus mode, faces, the tree); `node scripts/map-check.mjs` (plates, label overlaps, pins).

**Your checklist for what was built** (each one command; what to look for):

1. `git pull`, `npm start`, open http://127.0.0.1:3298, start a new game as Stark: the welcome page, **Begin**, three tips (write an order, End turn, open the Realm with **R**). Reload: no welcome.
2. Click Winterfell: a card beside it; **Hold court / Call banners / Works** each take you to the right tab; **More ▸** opens the whole sheet with a **← back**. Click a host; press **M E D C I R P**; press **F** and **F**; select a host and press **G**.
3. Play ten turns and read the chronicle (**H**): the headlines say what happened, in a line; the cards carry the faces of the people they name; the maester's report after a turn.
4. **R** then the tabs: does the ledger read as a maester's page? Are the marks (`~ ≈ ≥ —`, "?" for old news) honest? Is "≈ 0–13,104" for a house's levies too vague?
5. `node scripts/realm-dump.js --play stark --turns 12` — do "shows" and "truth" look like a fair guess?
6. **People** (**P**): your family, household, guests, bannermen first; the family tree (the "Family tree" button on a sheet), "Wider family".
7. Say what to change about the look (`/dev/style.html`, `?house=lannister` …) and about the second window's tabs.

**The live-model checklist (only when the owner's model is ready):** `docs/local-ai/OWNER-CHECKLIST.md` puts Maester-12B into play (llama-swap entries, the routing block for `config.json`); then `npm run model:check`, `npm run headlines:check`, `npm run bench -- --suite interpret --reader model`, `--suite mind`, `--suite narrate --judge` (paste the reports into an issue; the gates:
interpret exact-action ≥ 95 %, mind in-character ≥ 85 %, narrate ≥ 90 % faithful first try), `npm run playtest -- --house stark --turns 12`, `npm run balance`, `node scripts/canon.js`.

## 3. Model guidance

- **The model built for this game is Maester-12B** (Gemma 4 12B QAT 4-bit + one LoRA adapter, llama.cpp b11242 behind llama-swap; two aliases of one process: `maester-12b` with the adapter for interpret, mind, council; `maester-12b:plain` without it for the narrator and the untested call kinds). Read `local-ai/REPORT.md` and `local-ai/MAESTER-12B.md`; the owner's checklist is `local-ai/OWNER-CHECKLIST.md`. Measured: 75 tok/s, 9.7 GB VRAM; interpret 88 % on the unseen orders (untuned 85–86 %), mind 89 % in character with 2 fallbacks
  instead of 16; narrate did not improve. **Profiles are 64k context: never recommend a larger one.**
- **The narrator** writes scenes on top of the deterministic writer's cards: with no model, on the mock, and on a failed call, the writer's card stands (100 % through the scorer; `npm run bench -- --suite headlines`). `narratorMode` `scenes` (default: the model adds a scene) or `cards` (the model also says the card; needs the model to keep the scorer's rules — see §4).
- **The scribe** (`models.scribe`, a ~350 MB model on the CPU, its own server) is optional; with none, rules alone mend the line. Speech-to-text and text-to-speech run in the page on the CPU (WASM), never on the GPU; `npm run fetch-ears` puts the files where they are read.
- **Per-call routing** and the old Gemma 4 26B profile (`gemma4-26b-a4b`, `-c 65536 --parallel 2 --kv-unified --cache-reuse 256 --jinja`) are still valid fallbacks; the routing block for the 12B is `local-ai/deploy/game-routing.json`. Thinking off for every call (the schemas do the work).

## 4. Fine-tuning guidance

**Not yet, and not before the game is feature-complete** (the prompts must stop moving: a tuned adapter learns the prompts of one commit). The recipe and data pipeline that made Maester-12B is in `finetune/westeros/` (outside the game's runtime); `local-ai/TRAINING.md` says how to redo it; H4 will add the game-side dataset builder.
What is known so far, for the decision that is owed at the end:

- **Cards mode** (the model writing the headline and the summary as well as the scene) fails the scorer's rules too often on the 12B; the writer's card is better than the model's in most cases. If it is to work, train on **pass/fail preferences with the scorer as the filter** (`server/ai/validate/headline.js` and the `logCalls` data: every call is logged to `saves/<game>/llm-log.jsonl`); never on book text.
- **Scene openings are formulaic** ("The wind…"): a fine-tune on varied openings, or a rule in the prompt, would help.
- **The interpret dossier** does not yet list the seat's own lords by name (R10 of the model's recommendations); the R8 validator ("six rangers") is game-side and worth two orders for every model.
- **`mindRealmBrief`**: the lords' mind prompt has a block ready that tells a lord how the realm stands as his house knows it (`"mindRealmBrief": true` in config); it is off because the adapter was taught the dossier without it. Turn it on for the next round and train with it.
- **Freeze the prompts** (snapshots in `tests/__snapshots__/prompts/`) before the next tuning round; log every call kind that behaves badly in `local-ai/MODEL-WISHLIST.md`.

## 5. Known limits and open questions

- **An "at least" (`≥`) can overstate** a moon or two after a battle, or when a host has merged into another: `knowledge.js` keeps a report of a host that no longer exists for up to six turns, so two reports can stand for one body of men (measured +52 % once). The mark says "at least what was reported" and the age says how old; the audit bounds it at +60 % (D-085).
- **Bands are priors, not promises:** they hold the truth for 92–99 % of houses (levies 96 %), not all.
- **A card is for a castle or a host**; lords and houses keep their sheets; a lord's hover card is only the ruler's (D-086, D-088).
- **The welcome flag lives in the save's `meta`**, so undoing to before it may show the page once more on another browser (the browser's own flag stops it here).
- **Portraits fill in slowly on a slow machine** (a list of thirty is fine; a list of three hundred takes a while); the People tab no longer opens on three hundred.
- `sampleRealm` takes ≈ 20 ms a turn on the mock and the save grows ≈ 0.5 MB by turn 40. `playerView` still sends other houses' figures at two significant figures to the old sheets (D-033); the ledger is the honest view of them now, and the sheets could be cut to the ledger's marks.
- The recorded turn fixtures (`tests/fixtures/headlines/turns/`) predate SB's muster cards; re-record them with `tests/fixtures/headlines/turns/record.mjs` when the narrator's input changes.
- From earlier handoffs, still true: the economy settles per week; battle stances and siege terms are rules, not model calls; the realm's lords do not yet carry hosts by sea; outlaw bands are a mark, not a party; the King's progress has no scheduled stops; garrisons are on the castle card only (E6).
- **`docs/screens/`** is about 50 MB of screenshots (each package's, at both sizes); prune older sets if the repository grows too heavy to clone.

## 6. What comes next

Follow `16-roadmap.md`; the order the lead has kept is E6–E8, then F3, F4, F6, F7, F8, F9, then G1–G5, then H1–H5, with this file rewritten at the end of each phase and the fine-tune recommendation given at the end.

1. **E6–E8 (the map):** holdings in their states (siege, smoke, battle markers, weather) and the parties' figures E5 left (columns ∝ men, camps, retinue riders); graphics presets and a draw-call budget (a "Fast" preset that turns ambient life off); playback choreography (the day counter, facts on their day, camera rules, reduced motion cuts).
2. **F3, F4, F6:** the composer's receipts and clarification chips (the receipts exist; the chips and counsel/polish are Q1's scribe and the old Counsel button's remains); audiences, letters and council panels with letters in flight and outcome chips; matters as sealed letters with the days left and silence shown as an option.
3. **F7 (the portraits' generator), F8, F9:** family resemblance and age breakpoints in `dev/portraits.html` (U9 did the people and trees around the portraits, not the painter); the title, house choice, loading and end screens and a rewritten help (U8 did the first-run part); accessibility, the keyboard map, 1366/1024 layouts and `scripts/visual.js` (the gate is a start).
4. **G1–G5 (data):** houses to ~260 with placeable seats, characters to ~700 with sex, birth, nature, looks and voices, holdings ~300 and places ~120, happenings ~400, and the scenario rebuild (`check-data` and the balance sim are the gates).
5. **H1–H5:** music states and fact sounds and read-aloud; the weaver (optional); bench v2 and the coherence report; the fine-tune recipe under `scripts/finetune/`; the final handoff and README.
