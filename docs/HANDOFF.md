# Handoff — Phases N, R, U, E and F are built: the headlines, the realm's figures, the quiet screen, the living map and the whole interface

*Written 2026-10-01 at the end of Phase F, by the lead engineer who carried Phases N, R, U, E and F from their plans to the default branch (the previous handoff, at the end of Phase U, is
[`archive/HANDOFF-2026-09-U9.md`](archive/HANDOFF-2026-09-U9.md); earlier ones are in [`archive/`](archive/)). The plan is the Game Design Document in
[`docs/gdd/`](gdd/README.md); the order of work is [`16-roadmap.md`](gdd/16-roadmap.md); design departures are in [`DECISIONS.md`](gdd/DECISIONS.md) (D-001 … D-097); what changed for the player is in
[`CHANGELOG.md`](CHANGELOG.md). The local model's own documents are in [`local-ai/`](local-ai/README.md).*

## 0. Where things stand (read this first)

- **The default branch `claude/brave-ramanujan-i8dt0q` is green and playable** (CI: windows-latest and ubuntu-latest, Node 22 and 24; about 800 tests). Everything below is merged. `npm start` → http://127.0.0.1:3298.
- **About 85 of the roadmap's 100 work packages are built.** Done: Phases A–D (the engine, the war, the story), **E (the whole map)**, **N (headlines), R (the State of the Realm), U (the quiet screen)** and **F (the interface: F1–F9)**. Left: **G1–G5** (data: houses, characters, holdings, happenings, scenario) and **H1–H5** (music and read-aloud, the weaver, bench v2, the fine-tune recipe, the final handoff).
- **What the player sees today:** a map with the maester's-desk look (GDD 21) that shows what is happening (smoke over a siege, tents by a host, fields fought over) in three graphics presets; a top bar of three vitals, an Inbox and **End turn with a count of the orders it will carry out**; a headline strip and a chronicle of ranked cards; the turn told on the map by a camera that flies only for weighty news; a command bar (a box, a microphone and a quill: one button sends; a small CPU-only scribe mends spelling before the steward reads);
  **click a castle or a host and a card opens beside it**; two windows with tabs (Realm: Ledger · House · Hosts · Treasury · Diplomacy, with the **promises** between you and others; People); the State of the Realm ledger (marks for how sure);
  **audiences** with promises and outcome chips and letters on the wing; **matters as sealed letters** with the days they wait and what silence will do (and silence now really decides); **every name in the text is a link** with a hover card; **children look like their parents**, and faces show mood in an audience; the family tree with lines; a welcome page and three tips;
  a title screen, Settings in five tabs and a help page in the same look; a keyboard way round the map (**[ ] Enter**), long tooltips styled, reduced motion as a setting.
- **What the owner should check first** (each one command, §2): `npm start` and play a new game as Stark for ten minutes; `node scripts/ui-gate.mjs` and `node scripts/visual.js` (the quiet screen's and the interface checklist's acceptance, in a real browser; need Playwright: `npm i --no-save playwright`).
- **The owner's rules for this work** (binding; from the brief and from what the owner said while it ran):
  - **No model names in commits, PRs or code**; no attribution trailer and no "generated with" footer. Commits have a plain subject and a body that says what changed for the player and why. (The merged commits of PRs #47–#49 carry a trailer; the owner knows.)
  - **The lead does all the work itself: no subagents** (the CLAUDE.md line about at most two subagents is for other sessions).
  - The engine stays deterministic (no `Math.random`, no clock, in `public/js/engine`, `public/js/shared`, `server/turn`; the lint enforces it). Model output never mutates state. No runtime npm dependencies. **Never remove or degrade the portraits or the family trees** (U9 and F7 improved them and hold it by test).
  - Every AI call has a JSON schema, a mock and a deterministic fallback; **no test or CI step needs a live model**. Every new player-facing view goes through the knowledge filters with a non-interference test.
  - The owner's model server is theirs: **never kill or restart their `ollama`, `llama-server` or llama-swap**, never touch their `config.json`; the local model may be used only on the lead's own llama-swap (port 8096) and only when the GPU is idle (VRAM ≤ ~10.7 GB).
  - Screenshots at 1920×1080 and 1366×768 for every UI package, looked at, and attached to the PR.
  - **No "Counsel ideas" or "Polish" buttons** (the owner removed the sparkle button: one quill, a microphone and the scribe; D-094).
- **Next, in this order:** G1–G5, H1–H5 (§6). **Owed to the owner at the very end:** whether to fine-tune the local model again and on what (§4 has what is known so far).

### How the work has been done (keep doing it this way)

- **A branch per package or slice** (`wp/<ids>-<slug>`; D-059), tests first or with the code, `npm run check && npm test` (about 4 minutes), the UI gate and screenshots for anything visible, docs (CHANGELOG, roadmap ✅, GDD "implemented", DECISIONS), a PR with What / Why / How / How tested / Screenshots / What the owner should verify,
  **merged with a merge commit only when all eight CI jobs are green**. There is no `gh` CLI here: PRs are made and merged with the REST API and the token from `git credential fill`.
- **Measure first, then fix**, and let the measure stay: N10's headline suite found a writer fault, R7's soak found a levies band that missed the truth one time in five, the U-phase gate catches a card over the command bar, **F9's tour found 87 text sizes under 12 px and 40 things a keyboard could not reach**, and a CI soak with a random seed found that the headline scorer did not know "the royal house". A bench that has found nothing has not yet been made hard enough.
- **Read the picture.** Every UI package was looked at in both sizes before it was called done; that found a card covering a castle's name, a tab strip that wrapped, an icon drawn in the wrong colour (every chip's icon was bone-white on vellum), a quick-asks block that took the room of the talk, and a door's ✕ that did nothing.
- **A bug in a shared table is worth looking for when a new screen first shows it:** F6 found that the `decision` op dropped every catalogue matter's `lapse` (silence cost nothing); F4 found that nothing on the screen showed a promise; F3 found a regex that had lost a backslash (the days were never bold).

### Tips and traps learned the hard way

- **Windows** (CI and the owner's PC): a dynamic `import(path)` needs `pathToFileURL`. A Windows checkout has CRLF: never regex over source files with `\n` alone (tests read files and `.replace(/\r\n/g, '\n')`). Edit scripts: read, `split(CRLF).join(LF)`, edit, write back the same endings.
- **In this shell**, backslashes in heredocs and in strings passed through `node -e` are traps (a `\s` lost its backslash and split names on the letter "s"; a `\d+` became `d+`): write edit scripts with the file tool, or use the editor for anything with a regex. A heredoc containing an apostrophe can also fail to parse: write the file with the file tool.
  **`String.replace`/`rep` replace every occurrence**: anchor on something unique. **An edit helper that inserts "before a marker" must not include the marker itself** (a method header appeared twice, twice).
- **A command started with `&` inside a background task is killed when the task ends**: run long things in the foreground with a timeout (the UI gate takes about 4 minutes, `scripts/visual.js` about 8, `npm test` about 4) or as the background task itself, never as a child of it. **Never run two of them at once on the same port.**
- **`tests/http.test.js` uses a fixed port (3411)**: never run two full `npm test` at once. **The soak test (`tests/realm-soak.test.js`) plays three 24-moon games in three processes** (about 100 s).
  **`scripts/soak.js` takes a random seed from the clock**: a failure there is a real bug that only some seeds show; it prints the seed (`--seed N --houses <house>` plays it again).
- **Leaks by spread:** `server/view.js` `playerView` spreads `...state`, so every new top-level state field reaches the browser unless it is deleted there (that is how `realmStats` leaked; D-069). Every new field: strip it, and add a non-interference test. **A fact the player has not been told yet must not be drawn**: F4 holds back a promise a lord made in a letter until his answer lands (`onTheRoad`) and `hiddenTruths` watches for it.
- **Facts are not in `state` between turns** (they are in `facts.jsonl`). **Canon gravity owns the story's dates**: a test that needs a season to pass or a lord to die needs `canonGravity: 'sandbox'`.
- **`UPDATE_SNAPSHOTS=1` rewrites every prompt snapshot**: run it, look at `git diff --stat`, and `git checkout` the ones you did not mean to change (line endings show as changes).
- **Portraits are painted on demand** (`ui/portrait.js`: about 10 ms each on a real machine, about 200 ms on the cloud's software renderer). A screenshot of a list must wait for them (the shooters poll for placeholders).
- **The root font size shrinks in a small window** (13 px at 1024 wide, 15 px at 1366): `rem` sizes under 0.93 are wrapped in `max(…, 12px)` and a static test holds it. **Kill by PID, never `pkill -f` a pattern that is in your own command line.** The UI gate, `map-check.mjs` and `visual.js` start their own server on their own port and their own saves folder.

## 1. What was built

All merged into `claude/brave-ramanujan-i8dt0q` with CI green on windows-latest and ubuntu-latest, Node 22 and 24.

### Phases N, R, U (the previous handoff)

| Slice | PR | What changed |
|---|---|---|
| Docs | #40 | The agent playbook, the eight mockups of the target interface, the Pax Historia reference (GDD 20). |
| **U0** the look | #41 | GDD 21 *the maester's desk*: vellum = the maester wrote this; oak and leather = the frame; iron = press it; wax = awaits your word; gold leaf = read first. `public/css/theme.css`, textures painted by `scripts/paint-ui.js`, a style tile at `/dev/style.html`. |
| **SB** bug sweep | #42 | A refused order no longer half-runs; musters report at start, weekly and whole; a dead lord's heir is no longer his clone; playtest and bench scripts run on Windows. |
| **N1+N2** | #43 | The headline scorer (`server/ai/validate/headline.js`), a golden set of 71 stories and 69 bad headlines. |
| **R1–R3** | #44 | `engine/realm/`: every house's figures sampled weekly; what the player's house observes of the others (`hash32` noise, no dice); `GET /api/games/:id/realm`. |
| **N3+N4**, **N5+N6+N9** | #45, #47 | The deterministic headline writer, clustering v2, narrator v3 (the writer is the floor and the model's scenes sit on it). |
| **U1–U3**, **N7+N8**, **Q1** | #48–#50 | The quiet screen; the chronicle as ranked cards; one quill, a microphone and a CPU-only scribe. |
| **R4–R7, N10** | #51, #52 | The State of the Realm window, the headline suite, the ledger audit and soak. |
| **U4**, **U8**, **U9** | #53–#55 | Cards beside a castle or host, two windows with tabs; the welcome page, coach marks, focus mode; people, trees and faces. |

### Phases E and F (this handoff)

| Slice | PR | What changed |
|---|---|---|
| **E6+E7** | #56 | A map that shows what is happening: siege smoke, tents and pavilions by a host (only for hosts you have seen), fields fought over, weather; three graphics presets (Fast draws no particles) within a draw-call budget (`scripts/map-perf.mjs`). |
| **E8** | #57 | The turn told on the map: the camera flies only for weighty news off the screen, the map changes at the beat that tells it, the camera is yours (Follow gives it back), reduced motion cuts (`scripts/playback-check.mjs`). |
| **F8** | #58 | The title, Settings in five tabs, the help page and the end of the tale in the maester's look; a headline-scorer fix found by a CI soak ("the royal house"). |
| **F4** | #59 | Promises on the screen (the audience's footer, the Realm's Diplomacy list, days left), outcome chips under a reply, letters on the wing, the audience in the maester's look, the council's seats; a promise made in a letter is hidden until its answer lands. |
| **F6** | #60 | A matter is a wax seal on the map and a sealed letter on vellum with the days it waits and what silence will do; **silence now decides** (the engine dropped every catalogue matter's `lapse`). |
| **F3** | #61 | The End-turn plate counts the orders and says which cannot be done or ask; receipts in icons with words; all 300 bench orders get a receipt. |
| **F7** | #62, #63 | Names are links with a hover card; "who is this" in an audience; every house opens a family tree. Children look like their parents (hair, eyes, skin, family features and the proportions of the face), the six ages of a face, a scar from a healed wound, mood in an audience's portrait; `dev/portraits.html` shows it all. |
| **F9** | #64 | The interface checklist (GDD 12 §14) automated: `scripts/visual.js` tours 14 screens at three sizes (1920, 1366, 1024) and checks emoji, long titles (now styled tooltips), text sizes (12 px floor; 15 px for long text at 1366), overlaps, keyboard reach, focus rings, contrast, motion, horizontal scroll, and the whole way in with no console errors; the keyboard's way round the map, focus returning to what opened a panel, a reduced-motion setting, the 1024 layout. `tests/a11y-static.test.js` holds the static half. |

### Earlier phases

| WP | PR | What changed for the player |
|---|---|---|
| A (finish) | #3 | Islands need ships; every character has a sex and a nature; canon threads in the books' order. |
| B1–B13 | #4–#16 | The save's own dice (a turn replays byte for byte); every model call constrained by a JSON schema; everything that moves is a party on real roads; facts are the only history (undo goes back ten turns); every action is a verb with a receipt; orders are read with a receipt or a question; the lords think for themselves each week; the chronicle is told from the facts and checked against them; every house knows only what has reached it; a lord's word binds; the days are lived one by one; a Director; memory. |
| C1–C8 | #17–#25 | The banners come as lords would bring them (**Milestone 1**); gold means something; lenders and loans; supply, foraging, camp fever, seasons; battles by stance and ground; sieges with the great castles' rules; the sea; free companies and outlaws; the state of war and peace. |
| D1–D8 | #26–#33 | The beat engine and sixty canon beats (Canon / Loose / Sandbox); sixty-two kinds of matter; wounds, fevers and heirs; an opening for every house; goals and ways; the style bible as data; lords ride out every moon. |
| E1–E5 | #34–#38 | The camera frames Westeros; map modes that read; painted trees; names never drawn over one another; a token and plate for every kind of party. |

## 2. What CI verifies, and what the owner verifies

CI (`.github/workflows/ci.yml`) runs `npm run check` and `npm test` (about 800 tests, about 4 minutes) on windows-latest and ubuntu-latest, Node 22 and 24: the engine, verbs, facts, knowledge, minds, narrator, audiences, the jump, the Director, memory, the HTTP API end to end, the contract of every model call on the mock and on recorded replies,
the two-year canon playtest for Hightower, the headline scorer, golden set, writer, clustering and the writer's bench slice, the realm's figures with the 24-moon three-game audit and its leak checks, the pure logic of the whole interface (hud, feed, pins, cards, first run, people, tree, promises, matters, orders, names, portraits' looks, tips, focus, motion) and its static checklist (`tests/a11y-static.test.js`). A nightly soak plays 200 turns × 6 houses.

**Dev-only checks that need Playwright** (`npm i --no-save playwright`; not in CI):
- `node scripts/ui-gate.mjs` — Phase U's acceptance table at both sizes, turn 0 and 5, on real clicks (controls, text blocks, pixels covered, the card beside a castle, the tabs, the welcome and the tips, focus mode, faces, the tree) **and now the audience, matters, orders, names and the keyboard**. About 4 minutes; it has flaked once on a slow map load (run it again).
- `node scripts/visual.js [--size=1366] [--scene=audience] [--verbose] [--shots]` — the interface checklist (GDD 12 §14) over every screen at 1920, 1366 and 1024, and the main flow (title → house → welcome → order → jump → playback → matter) with no console errors. About 8 minutes.
- `node scripts/map-check.mjs` (plates, label overlaps, pins), `node scripts/map-perf.mjs` (draw-call budget per preset), `node scripts/playback-check.mjs` (the camera's rules on a canned turn).

**Your checklist for what was built** (each one command or a few minutes; what to look for):

1. `git pull`, `npm start`, open http://127.0.0.1:3298: the title, a new game as Stark: the welcome page, **Begin**, three tips. Reload: no welcome.
2. Write three orders with the quill ("Raise 200 archers at Winterfell.", "Send someone to the Wall.", "Spend sixty million dragons on the Iron Throne."): the End-turn plate shows a red **3**; hover it.
3. Open an audience with a lord far away, ask for men: while the raven flies, **Letters** shows it *On the wing*; when the answer lands the reply has **Agrees** and **Promised** chips and the audience ends with **Promises**; **D** (Diplomacy) lists them.
4. When a matter comes, a red wax seal is on the map; click it: a sealed letter with the days left and what silence does. Leave one alone until it lapses: the cost is real now.
5. **H**: the names in the cards are underlined; hover and click them. Open an audience: it says what the person is to you. Open `/dev/portraits.html?kids=eddard_stark,catelyn_stark` and `?ages=eddard_stark`.
6. Keyboard: Tab to the map, **]** steps through what is on it, **Enter** opens; **Esc** closes a panel and focus returns to where it was; Settings → Display → Motion.
7. Play ten turns; `node scripts/realm-dump.js --play stark --turns 12` — do "shows" and "truth" look like a fair guess?

**The live-model checklist (only when the owner's model is ready):** `docs/local-ai/OWNER-CHECKLIST.md` puts Maester-12B into play (llama-swap entries, the routing block for `config.json`); then `npm run model:check`, `npm run headlines:check`, `npm run bench -- --suite interpret --reader model`, `--suite mind`, `--suite narrate --judge` (paste the reports into an issue; the gates:
interpret exact-action ≥ 95 %, mind in-character ≥ 85 %, narrate ≥ 90 % faithful first try), `npm run playtest -- --house stark --turns 12`, `npm run balance`, `node scripts/canon.js`.

## 3. Model guidance

- **The model built for this game is Maester-12B** (Gemma 4 12B QAT 4-bit + one LoRA adapter, llama.cpp b11242 behind llama-swap; two aliases of one process: `maester-12b` with the adapter for interpret, mind, council; `maester-12b:plain` without it for the narrator and the untested call kinds). Read `local-ai/REPORT.md` and `local-ai/MAESTER-12B.md`; the owner's checklist is `local-ai/OWNER-CHECKLIST.md`. Measured: 75 tok/s, 9.7 GB VRAM; interpret 88 % on the unseen orders (untuned 85–86 %), mind 89 % in character with 2 fallbacks
  instead of 16; narrate did not improve. **Profiles are 64k context: never recommend a larger one.**
- **The narrator** writes scenes on top of the deterministic writer's cards: with no model, on the mock, and on a failed call, the writer's card stands (100 % through the scorer; `npm run bench -- --suite headlines`). `narratorMode` `scenes` (default: the model adds a scene) or `cards` (the model also says the card; needs the model to keep the scorer's rules — see §4).
- **The scribe** (`models.scribe`, a ~350 MB model on the CPU, its own server) is optional; with none, rules alone mend the line. Speech-to-text and text-to-speech run in the page on the CPU (WASM), never on the GPU; `npm run fetch-ears` puts the files where they are read.
- **Per-call routing** and the old Gemma 4 26B profile (`gemma4-26b-a4b`, `-c 65536 --parallel 2 --kv-unified --cache-reuse 256 --jinja`) are still valid fallbacks; the routing block for the 12B is `local-ai/deploy/game-routing.json`. Thinking off for every call (the schemas do the work).
- **New since the last handoff, and not model work:** a matter's silence now applies its `lapse` (F6), which changes how many small favours and grudges accumulate over a long game; a lord's promise in an audience is a commitment the UI now shows (F4). The audience prompts did not change.

## 4. Fine-tuning guidance

**Not yet, and not before the game is feature-complete** (the prompts must stop moving: a tuned adapter learns the prompts of one commit). The recipe and data pipeline that made Maester-12B is in `finetune/westeros/` (outside the game's runtime); `local-ai/TRAINING.md` says how to redo it; H4 will add the game-side dataset builder.
What is known so far, for the decision that is owed at the end:

- **Cards mode** (the model writing the headline and the summary as well as the scene) fails the scorer's rules too often on the 12B; the writer's card is better than the model's in most cases. If it is to work, train on **pass/fail preferences with the scorer as the filter** (`server/ai/validate/headline.js` and the `logCalls` data: every call is logged to `saves/<game>/llm-log.jsonl`); never on book text. (The scorer now also knows "the royal house".)
- **Scene openings are formulaic** ("The wind…"): a fine-tune on varied openings, or a rule in the prompt, would help.
- **The interpret dossier** does not yet list the seat's own lords by name (R10 of the model's recommendations); the R8 validator ("six rangers") is game-side and worth two orders for every model.
- **`mindRealmBrief`**: the lords' mind prompt has a block ready that tells a lord how the realm stands as his house knows it (`"mindRealmBrief": true` in config); it is off because the adapter was taught the dossier without it. Turn it on for the next round and train with it.
- **Freeze the prompts** (snapshots in `tests/__snapshots__/prompts/`) before the next tuning round; log every call kind that behaves badly in `local-ai/MODEL-WISHLIST.md`.
- **Audience replies carry a verdict and promises that the UI now shows as chips**: a model that agrees in words but whose verdict is "refuse" (or promises something the engine will not let) now shows as a contradiction to the player. The `audience` call's schema and the engine's verdict already constrain it; more examples of the two agreeing would help.

## 5. Known limits and open questions

- **An "at least" (`≥`) can overstate** a moon or two after a battle, or when a host has merged into another (measured +52 % once); the audit bounds it at +60 % (D-085). **Bands are priors, not promises:** they hold the truth for 92–99 % of houses.
- **A card is for a castle or a host**; lords and houses keep their sheets; a lord's hover card is only the ruler's (D-086, D-088); any person's name in text has a small slip (D-095).
- **Hard-coded colours remain in the stylesheets** (style.css 340, hud.css 89…): GDD 12 §14 item 19 asks for tokens everywhere. A test holds that none grows (`tests/fixtures/ui/colours-before-f9.json`); tidying them is cosmetic work for whoever wants a light theme.
- **The Interpreter's receipt for "Answer in my own words" on a matter is not built** (the words go to the ledger as written); neither are Counsel ideas and Polish (the owner's choice), the patience "candle" (the pips are kept), *Appoint* on empty council seats, a missing hand or the Night's Watch black on a portrait, and the image-model portrait generator script (the owner's GPU, the owner's run).
- **A matter's silence now costs** what its template says (a few points of a house's regard, a little unrest): balance was checked with the soak, not by play. If petitions feel punishing, lower the `lapse` numbers in `data/matters.js`.
- **Names are links only for names the roster can name without doubt** (a full name, or an honorific and a given name, never a bare first name or one that could be two people); "Lord Stark" is not a link.
- **The UI gate flaked once on a slow map load** in the first-run probe (a 240 s timeout); run it again. **`scripts/visual.js` uses the same thresholds at 1024 as 1366 except for long-text size (15 px at 1366 only)**; at 1024 the chronicle and audience lie over the map and the command bar steps aside.
- **The welcome flag lives in the save's `meta`**, so undoing to before it may show the page once more on another browser. **Portraits fill in slowly on a slow machine.** `sampleRealm` takes ≈ 20 ms a turn on the mock and the save grows ≈ 0.5 MB by turn 40. `playerView` still sends other houses' figures at two significant figures to the old sheets (D-033).
- The recorded turn fixtures (`tests/fixtures/headlines/turns/`) predate SB's muster cards; re-record them with `tests/fixtures/headlines/turns/record.mjs` when the narrator's input changes.
- From earlier handoffs, still true: the economy settles per week; battle stances and siege terms are rules, not model calls; the realm's lords do not yet carry hosts by sea; outlaw bands are a mark, not a party; the King's progress has no scheduled stops.
- **`docs/screens/`** is about 70 MB of screenshots (each package's, at both sizes); prune older sets if the repository grows too heavy to clone.

## 6. What comes next

Follow `16-roadmap.md`; the order the lead has kept is G1–G5, then H1–H5, with this file rewritten at the end of each phase and the fine-tune recommendation given at the end.

1. **G1–G5 (data):** houses to ~260 with placeable seats (158 now), characters to ~700 with sex, birth, nature, looks and voices (312 now), holdings ~300 and places ~120 (165 now), happenings ~400, and the scenario rebuild (`check-data` and the balance sim are the gates). The interface holds for any number of houses (the tree, the people browser and the ledger are searched, not listed); the map's plate and pin caps (U8) keep it readable.
2. **H1–H5:** music states and fact sounds and read-aloud; the weaver (optional); bench v2 and the coherence report; the fine-tune recipe under `scripts/finetune/`; the final handoff and README.
