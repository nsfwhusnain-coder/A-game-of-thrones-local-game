# Handoff — N, U and R under way: headlines, the look, the realm's figures

*Written 2026-09-29 at the end of a lead session that ran Phases N, U and R with subagents (the previous handoff, at the
end of E5, is [`archive/HANDOFF-2026-09-E5.md`](archive/HANDOFF-2026-09-E5.md)). The plan is the Game Design Document in
[`docs/gdd/`](gdd/README.md); the order of work is [`16-roadmap.md`](gdd/16-roadmap.md); design departures are in
[`DECISIONS.md`](gdd/DECISIONS.md) (now D-001 … D-073); what changed for the player is in [`CHANGELOG.md`](CHANGELOG.md).
**The prompt for the next lead agent is [`NEXT-AGENT-PROMPT.md`](NEXT-AGENT-PROMPT.md).***

## 0. Where things stand (read this first)

- **The default branch `claude/brave-ramanujan-i8dt0q` is clean and green** (CI: windows-latest and ubuntu-latest,
  Node 22 and 24). Everything below is merged; nothing is half-built on it; no PR is left open.
- **Done and merged this session** (PRs #40–#45): the playbook, mockups and Pax reference (#40); **U0** the look — the
  maester's desk (#41, GDD 21); **SB** a bug sweep from the first playtest (#42); **N1+N2** the headline scorer, the
  golden set, labels and fact slots (#43); **R1–R3** the realm's figures, what a house learns of the others, and
  `GET /api/games/:id/realm` (#44); **N3+N4** the deterministic headline writer and one card per story (#45).
- **What the player sees today:** the bug fixes of SB. Everything else is the ground under the next packages: the new
  look is a style tile (`/dev/style.html`), the writer is not yet called by the narrator, the ledger has no window yet.
  That is deliberate — each of those becomes visible in one piece (U1–U3, N5–N7, R4) rather than half at a time.
- **Next, in this order** (§6 has the detail): **U1–U3 the quiet screen** (its failing tests are written, on branch
  `wp/u1-u3-quiet-screen`), **N5+N6+N9** narrator v3, the card in the turn record, ranking and the digest (fresh start),
  then N7+N8 (the feed and pins), R4+R6 (the State of the Realm window), R5, U4+U8, U9, N10, R7; then E6–E8, F, G, H.
- **The owner's rules for this work** (binding, added this session):
  - **No live model** — not in the cloud, not on the owner's PC: the owner is still building and fine-tuning it.
    `WC_PROVIDER=mock` for everything; never call the llama-swap endpoint; never edit the owner's `config.json`.
  - **At most two subagents at once** (usage limits). Every subagent keeps a progress note so it can be resumed
    (AGENT-PLAYBOOK §0).
  - Commit and push work in progress often: an interrupted session must lose nothing.

### How the work has been done (keep doing it this way)

- **Slices** (D-059): related work packages of one chain share a branch `wp/<ids>-<slug>` and one PR (N1+N2, R1–R3,
  N3+N4…); each WP keeps its own acceptance and roadmap mark. A PR into `claude/brave-ramanujan-i8dt0q` with What / Why
  / How tested / Screenshots / What the owner should verify, merged with a merge commit only when all 8 CI jobs are green.
- **Per slice** (AGENT-PLAYBOOK §3): a **test-writer** turns the GDD's acceptance into failing tests (committed first,
  `test: … acceptance, failing`); **builders** make them pass on disjoint files; the lead runs `npm run check && npm
  test` itself; **visual QA** for anything visible; a **player's-eye** read for anything the player reads; a
  **knowledge/leak auditor** for anything that reaches the browser; an **adversarial diff reviewer**; a **docs keeper**
  (CHANGELOG, roadmap status line, GDD "implemented", DECISIONS). Every review this session found real bugs (a scorer
  that rejected its own writer's words, the whole truth series sent to the browser, allies' exact history behind
  their estimates): keep all the gates.
- **Parallel branches all append to `docs/CHANGELOG.md` (top) and `docs/gdd/DECISIONS.md` (tail).** Reserve decision
  numbers per slice before dispatching, and resolve the merge conflicts by keeping both sides in order (newest
  CHANGELOG entry first; decisions in number order). The next free decision is **D-074**.

### Tips and traps learned the hard way

- **Windows** (CI and the owner's PC): a dynamic `import(path.join(...))` fails — use `import(pathToFileURL(p).href)`
  or a relative specifier. A Windows checkout has CRLF: never regex over source files with `\n`; put the logic in an
  importable module (see `public/js/ui/heraldry.js`). Symlinks need admin rights: use junctions (`fs.symlinkSync(…,
  'junction')`) in scripts.
- **`tests/http.test.js` uses a fixed port (3411)**: never run two full `npm test` at once (two worktrees collide).
  Screenshots and a full test run at once can exhaust memory on small machines.
- **Leaks by spread:** `server/view.js` `playerView` spreads `...state`, so every new top-level state field reaches the
  browser unless it is deleted there (that is how `realmStats` leaked; D-069). Every new field: strip it, and add a
  non-interference test (mutate a hidden truth, assert the served bytes are identical).
- **Facts are not in `state` between turns** (they are in `facts.jsonl`): a view that needs old facts reads the log.
- `scripts/screens.js` serves the live working tree; use a clean `git worktree` for another branch. Kill by PID, never
  `pkill -f` with a pattern in your own command line. Bump `GEN_VERSION` in `MapScene.js` when the terrain worker's
  output changes. `var(--ink)` is the dark parchment ink.
- **Engine determinism:** no `Math.random`, no clock in `public/js/engine`, `public/js/shared`, `server/turn` (lint).
  Use the save's dice (`engine/rng.js`), or `hash32` for noise that must not draw dice (the realm's estimates).
- **Canon gravity owns the story's dates**: a test that needs a season to pass or a lord to die needs `canonGravity:
  'sandbox'` or a character the story does not need.
- **Test-writers that prove achievability** (a throwaway reference implementation in the scratchpad, never shipped) and
  **builders that mutate their own code** to show the tests catch each break both paid off: ask for them.

## 1. What was built

All merged into `claude/brave-ramanujan-i8dt0q` with CI green on windows-latest and ubuntu-latest, Node 22 and 24.

### This session (Phases N, U, R begun)

| Slice | PR | What changed |
|---|---|---|
| Docs | #40 | The agent playbook, the eight mockups of the target interface, the Pax Historia reference (GDD 20). |
| **U0** the look | #41 | GDD 21 *the maester's desk*: vellum = the maester wrote this; oak and leather = the frame; iron = press it; wax = awaits your word; gold leaf = read first. `public/css/theme.css` (tokens, `wc-` components), textures painted by `scripts/paint-ui.js` (seeded, byte-identical, ≈ 110 KB), new icons, the house's colours on ribbon, rim and wax (`ui/heraldry.js`). A style tile at `/dev/style.html` (`?house=`). Nothing in the game changes yet: U1–U3 build the screen in it. |
| **SB** bug sweep | #42 | From the first player's-eye playtest: Bran's fall no longer hints at a culprit (B-33); a refused order no longer half-runs (B-34); another house's man or an unknown host is refused, not bound to your biggest host (B-35); a vassal's answer is heard by vassal and liege only (B-32c); musters report at start, weekly and whole, with the place (B-37c); a dead lord's heir is no longer his clone (B-37b); playtest and bench scripts run on Windows and without `config.json` (B-36/38). |
| **N1+N2** | #43 | `scoreCard` (`server/ai/validate/headline.js`): the headline rules of GDD 18 as code; a golden set of 71 stories and 69 bad headlines (`tests/fixtures/headlines/`). Facts carry who did it and how (battle winner/loser/how, slain/captured by, executed by, death how, refusal why); `engine/facts/label.js` names things as a herald would. |
| **R1–R3** | #44 | `engine/realm/`: every house's figures sampled weekly (`state.realmStats`, never sent to the browser); what the player's house observes of the others (`knowledge[me].realm`, `hash32` noise, no dice); `realmViewFor` computed from that knowledge alone; `GET /api/games/:id/realm`. Non-interference proven on every served surface (`tests/leaks-r1-r3.test.js`). |
| **N3+N4** | #45 | The deterministic writer (`engine/facts/heads.js`, `headline.js`: `cardOf`, `meanwhileOf`) for every kind of fact, and clustering v2 (`cluster.js`: roll-ups, splits, lead by weight, late news kept apart, Meanwhile, no cap). **Not yet called by the narrator: N5.** |

### Earlier phases

| WP | PR | What changed for the player |
|---|---|---|
| A (finish) | #3 | Islands need ships; every character has a sex and a nature; canon threads in the books' order. |
| B1 | #4 | The save's own dice: a turn replays byte for byte. |
| B5 | #5 | Every model call constrained by a JSON schema, checked, and never fatal; Settings → *Test connection* reports schema support. |
| B2 | #6 | Everything that moves is a party and walks real roads; the map draws the engine's routes. |
| B3 | #7 | Facts are the history; turn records in `turns/`; undo goes back ten turns (not in ironman). |
| B4 | #8 | Every action is a verb with a receipt. |
| B6 | #9 | Orders are read as you write them, each with a receipt (✓ / ⚠ / ✗) or a question with answer chips. |
| B7 | #10 | The lords of the realm think for themselves each week (minds), in character, from what their house knows. |
| B8 | #11 | The chronicle is told from the facts by a narrator and checked against them; a wrong story is retold or left plain. |
| B9 | #12 | Every house knows only what has reached it; news travels; the browser is never sent a hidden truth. |
| B10 | #13 | A lord's word binds (promises are kept or broken); letters are real and fly; officers know the truth; the council advises. |
| B11 | #14 | The days are lived one by one and told a week at a time, streamed to the screen; *Stop the days here*, and *Stop the last turn sooner* in the undo window. The old five-agent council is gone. |
| B12 | #15 | A Director: some eighty grounded beginnings (a hedge knight, a septon, outlaws, a wreck, a fever…), many as matters for your word; no week passes with nothing of note. |
| B13 | #16 | Lords remember what their house knows (relevant memory); the chronicle is consolidated from the facts, and its open threads must name real things. |
| C2 | #17 | The banners come as lords would bring them: raven, deliberation, gathering at home, the march; the host card shows who is present, on the road (with the day) and expected; *Wait for the banners*. **Milestone 1.** |
| C1a | #18 | Gold means something: the realm as populous as the books, incomes by rents, trade and mines, the Crown's debts, war costing what war costs (`npm run balance`). |
| C1b | #19 | Lenders (the Iron Bank, the Faith, the Tyroshi, the Bank of Oldtown), loans, calls and default; buy grain, bribe, embargo, pay a ransom. |
| C3 | #20 | Supply: rations in days, fed at home, foraging abroad, the land laid waste — the second passage starves; camp fever; the seasons slow the march. |
| C4 | #21 | Battles by stance, standing orders, arms and ground, surprise; routs and bloody draws; lords slain, taken or wounded (the story keeps its own); the record says what decided it. |
| C5 | #22 | Sieges: the great castles' rules (Storm's End fed by sea, the Eyrie by the high road, Riverrun's camps…), terms, storms, treachery, relief. |
| C6 | #23 | The sea: ships by kind; fleets carry hosts (*Go aboard*, *Put them ashore*); blockades; the ironborn reave the coasts; sea fights and storms. |
| C7 | #24 | Free companies by contract (they desert unpaid, the turncoats go over); outlaw bands; the Watch's recruits; the Dothraki refuse the poison water. |
| C8 | #25 | The state of war: goals, the score, cold wars, *Sue for peace* (white peace, concede, demand), the beaten side's offer. **Phase C done.** |
| D1 | #26 | The beat engine: windows, triggers, alternates and lapses; canon locks; *Canon / Loose / Sandbox* on the begin screen. |
| D2 | #27 | Sixty canon beats; the chain made to hold (Q9: 58–60 of 60 in two years for three houses far from the war). |
| D3 | #28 | Sixty-two kinds of matter from the catalogue; no invented matters (B-28). |
| D4 | #29 | Wounds heal or fester, fevers and winter; the story's people are not taken by chance under Canon (invariant 11); canon regents (B-23). |
| D5 | #30 | An opening for every house (27 by hand), with its levers; the council hears the news of the first moons. |
| D6 | #31 | A hundred goals; ways for every great and major house; lords work at what they want. |
| D7 | #32 | The style bible as data; *Book content / Restrained*; examples of other houses; anachronisms keyed to the beats. |
| D8 | #33 | Lords ride out every moon (feasts, weddings, tourneys, pilgrimages, the King's passing) with kin, stay as guests, come home; the calendar and the small council. **Phase D done.** |
| E1 | #34 | The camera frames Westeros and the Narrow Sea; never into the trees; smooth cursor zoom; Home and F. |
| E2 | #35 | Map modes that read: Diplomacy (war, hostile, neutral, friendly, allied, your realm hatched), Knowledge, War; a key for each. |
| E3 | #36 | Painted trees (pines, broadleaves, weirwoods) that sway; a palette by region; the snow line of the season, frozen rivers. |
| E4 | #37 | Names never drawn over one another (placed by priority, at most 120); halos; tooltips that let go (B-31). |
| E5 | #38 | A token and plate for every kind of party; the King's progress seen from L0; "3 hosts · 7,400" stacks that fan out; routes and ETAs for your own parties. |


## 2. What CI verifies, and what the owner verifies

CI (`.github/workflows/ci.yml`) runs `npm run check` and `npm test` (≈ 580 tests) on windows-latest and ubuntu-latest,
Node 22 and 24: the engine, verbs, facts, knowledge, minds, narrator, audiences, the jump, the Director, memory, the
HTTP API end to end, the contract of every model call on the mock and on recorded replies, the two-year canon playtest
Q9 for Hightower, and now the headline scorer and golden set, the writer and clustering, the realm's figures and their
leak tests, and the theme. A nightly soak plays 200 turns × 6 houses; a nightly canon playtest plays three houses for 24
moons.

**New checks for this session's work** (no model needed):

1. `node --test tests/headlines.test.js tests/labels.test.js tests/writer.test.js tests/clusters.test.js` — then open
   `tests/fixtures/headlines/golden.json` and read the `reference` headlines: *is this how events should read?*
2. `npm start`, open http://127.0.0.1:3298/dev/style.html (and `?house=lannister`, `?house=tyrell`,
   `?house=greyjoy`) — *does this look like Westeros?* Say what to change before the quiet screen is built in it.
3. With a game running, http://127.0.0.1:3298/api/games/&lt;id&gt;/realm?scope=all — your house exact, the others as
   estimates with their age.
4. `node --test tests/bugs-sb.test.js`; in a game as Lannister type "assemble the men of the north at Winterfell" → a ✗
   and nothing marches.

**The live-model checklist (when the owner's model is ready — not before):**

**Your checklist** (each one command; what to look for):

1. `git pull` then `npm start` on Windows → the title screen loads at http://127.0.0.1:3298.
2. Settings → *Endpoint URL* `http://127.0.0.1:8033/v1` (llama-swap), model `gemma4-26b-a4b`, context window 65536 →
   *Test connection* says **JSON schema enforced: yes** and **"The Wall" understood as Castle Black: yes**.
3. `npm run bench -- --suite interpret --reader model` and `npm run bench -- --suite mind` and
   `npm run bench -- --suite narrate --judge` → paste the `bench/<date>.md` reports into an issue. The gates: interpret
   exact-action ≥ 95 %, mind in-character ≥ 85 %, narrate: no invented arrivals.
4. `npm run playtest -- --house stark --turns 12` and `npm run playtest -- --house blackwood --turns 12` → paste the
   reports from `playtest/`.
5. A 20-minute play as Stark: call the banners; end a turn that runs over a week and watch the first week's news
   appear while the next is lived; press *Stop the days here* once; hold an audience with Roose Bolton and ask for his
   men at Moat Cailin within the fortnight; write to Riverrun; after the King arrives, open ↶ and try *Stop the last
   turn sooner*; read the Chronicle (h) after two moons. The map, the numbers and the chronicle should agree.
6. A 20-minute war as Lannister (Phase C): declare war on the Tullys; raise 15,000 at the Rock; on the host's card set
   *Always engage* and read its rations; march on Wayfarer's Rest; read the battle's record (what decided it); when the
   siege begins open the castle and *Offer terms*; open Military and hire the Golden Company; open Diplomacy and see the
   war's score move; *Sue for peace*.
7. `npm run balance` → "the economy is in balance".
8. The story (Phase D): `node scripts/canon.js` (≈ 3 minutes a house) → "Q9 passes". Start as Hightower on *Canon story*
   and jump a year: the ravens bring the books' news in order, autumn is declared in 299. Start as Stark on *Loose
   canon*: the King does not come to Winterfell, but his death and the war still do. On the begin screen pick Manderly
   and Glover and read their openings; open a holding with guests (a feast or a tourney) and see them listed.
9. If the bench gates fail: see §4.


## 3. Model guidance

- **Default model for every call:** Gemma 4 26B A4B (llama-swap profile `gemma4-26b-a4b`, the **64k** profile — never
  the 256k one). Evidence in [04 §11.2](gdd/04-ai-system.md): it read the orders right, wrote faithful narration, and
  leaked no foreign script.
- **llama-server flags** for that profile: `-c 65536 --parallel 2 --kv-unified --cache-reuse 256 --jinja`, flash
  attention on, the whole model on the GPU if it fits (it does at Q4 on 12 GB with 64k and a q8_0 KV cache:
  `-ctk q8_0 -ctv q8_0`). Two slots let the narrator keep its long prefix warm on slot 0 while the minds use slot 1.
- **Per-call routing** in `config.json` (all to one model, so llama-swap never swaps mid-turn):

  ```json
  "models": {
    "default":     { "model": "gemma4-26b-a4b", "slot": null },
    "interpret":   { "model": "gemma4-26b-a4b", "slot": 1, "temperature": 0.2 },
    "mind":        { "model": "gemma4-26b-a4b", "slot": 1, "temperature": 0.6 },
    "director":    { "model": "gemma4-26b-a4b", "slot": 1, "temperature": 0.8 },
    "narrate":     { "model": "gemma4-26b-a4b", "slot": 0, "temperature": 0.85 },
    "audience":    { "model": "gemma4-26b-a4b", "slot": 0, "temperature": 0.8 },
    "consolidate": { "model": "gemma4-26b-a4b", "slot": 1, "temperature": 0.3 }
  }
  ```
- **Switching the narrator** to another model (e.g. Qwen3.6 35B A3B for richer prose): set `"narrate": { "model":
  "qwen3.6-35b-a3b", "slot": 0 }`, put both models in one llama-swap group that keeps them resident together, or tick
  *Allow model swaps* (each swap costs ≈ 20–25 s). The narrator's validator drops foreign script and invented facts
  either way.
- Thinking off for every call (the schemas do the work); *Also think in audiences* only if you want slower, deeper
  replies.


## 4. Fine-tuning guidance

**Not yet.** Phase B gives the models small, constrained tasks; fine-tune only if the bench gates in §2 fail. The
runnable recipe (`scripts/finetune/`: dataset build from `llm-log.jsonl`, labelling, Unsloth QLoRA config, GGUF adapter
export, a `gemma4-26b-a4b-wc` llama-swap profile, bench before/after) is roadmap work package **H** and will come with
its README. Until then, keep playing with the live model: every call is logged to `saves/<game>/llm-log.jsonl`, which is
the dataset the recipe will build from. Never train on book text.


## 5. Known limits and open questions

- **The narrator does not yet use the writer.** On the mock and on a failed model call, stories are still told by
  `plainEvent` (the lead fact's own title); with N4's roll-ups that means one card titled after one host for a story of
  five. N5 makes `cardOf` the narrator's draft, mock and fallback — do it first.
- **`playerView` still sends other houses' figures at two significant figures** (D-033, Phase B) to the old windows
  that read them; retire them when the State of the Realm window (R4) replaces those windows. `meta.seed` also reaches
  the browser (the realm's blur uses it; low risk in a single-player game).
- `sampleRealm` takes ≈ 50 ms a turn (all 158 houses, D-068) and the save grows ≈ 0.5 MB by turn 40; an owner index in
  `standing()`/`project()` is R7's (a prototype reached 15 ms).
- Open (D-073): name a regent rather than a child lord as the subject ("Lysa Arryn calls the banners of the Vale",
  not "Robert Arryn")?
- The recorded turn fixtures (`tests/fixtures/headlines/turns/`) predate SB's muster cards; re-record them with
  `tests/fixtures/headlines/turns/record.mjs` when N5/N6 change what the narrator is handed.
- From the previous handoff, still true: the economy settles per week; battle stances and siege terms are rules, not
  model calls; the realm's lords do not yet carry hosts by sea; outlaw bands are a mark, not a party; the King's
  progress has no scheduled stops; the L0 map can get busy with rumoured hosts (U8); garrisons are on the castle card
  only (E6).

## 6. What comes next

1. **U1–U3, the quiet screen** (GDD 17 §2, §4; the look of GDD 21; mockups 02, 03, 07, 08). Branch
   `wp/u1-u3-quiet-screen` holds the failing tests (`tests/hud.test.js`: the pure logic in a new `public/js/ui/hud.js`
   — `vitalsOf`, `inboxOf`, `MENU`/`routeKey`, `stripOf`, `turnLabel` — and the markup rules on `public/index.html`) and
   `scripts/ui-gate.mjs` (dev-only Playwright gate of GDD 17 §5; its "before" table is in the branch's first commit
   message). Merge the default branch into it first. U1+U2 then U3, one builder at a time (they share `index.html`,
   `style.css`, `app.js`); ship the three in one PR so no half-built screen reaches the default branch.
2. **N5+N6+N9** (GDD 18 §3.2, §5): the narrator's story sheet, schema with `summary`, `cardOf` as draft, mock and
   fallback, the headline validator; the card shape in the turn record (`headline/summary/details[]/tier/score`, the
   old `title/text` kept as aliases), the digest replacing `turn.summary`, and the ranking and Meanwhile (`rank.js`).
   Also finish B-32: story cards carry `heard`/`late`, succession cards go through `holdNews` (game.js ~:433).
   Expect to update `tests/__snapshots__/prompts/narrate.txt` and the eight adversarial narrate fixtures.
3. **N7+N8**: the feed, the turn-end digest and the jump feed in the new look (mockups 03–05), then pins.
4. **R4+R6**: the State of the Realm window (mockup 06; key `R`, D-070), wars, momentum, "where to focus"; then retire
   the old windows' foreign figures from `playerView`. **R5**: minds and the council read `realmBrief`.
5. **U4+U8**, **U9** (portraits and family trees improved in place — never degraded), **N10**, **R7**; then E6–E8,
   the rest of F, G, H.
