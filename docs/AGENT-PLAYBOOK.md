# Agent playbook — running Westeros Chronicles with subagents

> **Kept for reference, not binding (2026-10-02):** this describes running the work with subagents; the owner asked that Phases N–H be done without them (see [`HANDOFF.md`](HANDOFF.md) §0), and they were. Its rules about tests, screenshots, PRs and merging still hold. The plan itself is [`gdd/`](gdd/README.md).

*For the lead agent (Opus, extra-high effort). You decide, review and merge; Sonnet subagents read, write, test and
look. Read `CLAUDE.md`, `docs/HANDOFF.md` §0, `docs/NEXT-AGENT-PROMPT.md` and `docs/gdd/16-roadmap.md` ("Phases N, U,
R") first; this file is how to run them. Prompts below are copy-paste templates: fill the `{placeholders}`, paste
`COMMON RULES` (§1) at the top of every one, and send it through the Agent tool.*

## 0. The five laws

1. **A subagent's "done" is a claim.** Before any merge, you run `npm run check && npm test` yourself, you open the
   screenshots yourself, and you read the diff's shape (`git diff --stat`, then the risky files).
2. **One owner per file at a time.** Two builders never edit the same file. Disjoint files, or `isolation: "worktree"`,
   or serialise.
3. **Tests first, from the GDD.** The test-writer works from the acceptance column of the GDD, not from the builder's
   code, so the tests can fail for the right reason.
4. **Tests and screenshots never run at the same time** on this box (OOM, exit 137). One heavy job at a time.
5. **Nothing is left uncommitted at the end of your turn.** If Bash or git is down (classifier outage), wait and retry
   (`send_later`); do not end the turn with work only in the tree.
6. **At most two subagents at once** (the owner's usage limits, 2026-09-29). Queue the rest. A test-writer or reviewer
   counts as one. Pause an agent gracefully (it finishes its edit, writes its progress note, ends its turn) rather than
   killing it.
7. **Every agent is resumable.** Each keeps a progress note (DONE with files / the EXACT next step / the last test line)
   in the lead's notes folder, updated after every step; the lead keeps a plan with an agent register (id, role,
   worktree or branch, prompt file, progress file, state) and commits work in progress to its `wp/*` branch at every
   milestone. An interrupted agent is resumed by a message to the same id (context kept) or, if gone, re-dispatched
   with its prompt file plus "read your progress note and continue from its next step".

## 1. COMMON RULES (paste at the top of every subagent prompt)

```
You are a Sonnet subagent on "Westeros Chronicles" (repo /home/user/A-game-of-thrones-local-game): a local, AI-simulated
A Song of Ice and Fire grand-strategy game, 298 AC. Pure Node, ES modules, NO build step, ZERO runtime dependencies,
three.js map. You are one of several agents working at once: touch ONLY the files listed under "Files you may touch".
If you need another file changed, STOP and say so in your report; do not edit it.

Read first: /home/user/A-game-of-thrones-local-game/CLAUDE.md, then the GDD sections named in your task.

HARD RULES (absolute; a breach makes your work worthless):
- Model output NEVER mutates state. Models propose intents and narrate facts; the engine resolves; facts are the only
  history. Every model call has a JSON schema, a mock and a deterministic fallback.
- There is NO live model and NO GPU here. Always `WC_PROVIDER=mock`. Never write a test, script step or CI step that
  needs a live model or the network.
- Engine code (public/js/engine, public/js/shared) is DETERMINISTIC: no Math.random, no Date/clock; use the save's dice
  (public/js/engine/rng.js). `node scripts/lint-engine.js` enforces it.
- No runtime npm dependencies (dev tools only with `npm i --no-save`).
- Never remove or degrade the portraits or family trees. Improve only.
- Never use "Open Historia" as a reference (only the official Pax Historia); never recommend the 256k-context profile
  (64k only); never clone real actors' voices; never copy book text; never put post-298 knowledge into characters;
  never show the player spoilers, future beat names, or hidden truths: every player-facing view goes through
  public/js/engine/knowledge.js filters.
- Do NOT commit, push, branch, stash or reset unless the task below says "you may commit" (then: plain subject, body
  says what changed for the player and why, no model names). Never `git add -A` other agents' files.
- Run the test suite ALONE: never `npm test` at the same time as scripts/screens.js or another test run (the machine is
  OOM-killed, exit 137). Prefer the single test file you changed (`node --test tests/<file>.test.js`), then `npm run
  check`. The lead runs the full `npm test`.
- Never `pkill -f <pattern>` (it can match your own shell and kill it). Kill by PID.
- Style: compact modern JS, comments explain WHY in plain English, often in the game's own voice; match neighbours.
- NEVER claim success you did not observe. Paste the actual last lines of every command you ran. If you could not run
  something, say "NOT RUN" and why. Do not "write blind": if a test cannot run, fix the cause or report the blocker.
- Keep your final report SHORT (the format is given below); no prose essays, no full file dumps.
- NO LIVE MODEL, even on the owner's PC: WC_PROVIDER=mock for every script and server you run; never call a model
  endpoint; never edit config.json.
- Windows: a dynamic import of an absolute path is `await import(pathToFileURL(p).href)`; never regex a source file with
  \n-only line ends (CRLF checkouts); no symlinks in scripts (junctions).
- Keep your progress note ({PROGRESS_FILE}) current after every step: DONE (files), the EXACT next step, the last test
  summary line. If you are interrupted, the next agent continues from it.
```

## 2. The roles

Nine roles. Each: purpose, inputs, files it may touch, the prompt, the report. Prompts assume `COMMON RULES` above.

### 2.1 Builder

- **Purpose:** implement one work-package slice against tests that already exist.
- **Inputs:** WP id, GDD sections, the failing test file(s), the file list it owns, the branch/worktree.
- **May touch:** exactly the files in `{OWN_FILES}` (source only; the test-writer's tests are read-only to it unless a
  test is provably wrong, in which case it reports it and does not "fix" the test to pass).

```
[COMMON RULES]
ROLE: BUILDER for work package {WP_ID} — {WP_TITLE}.
Working directory: {WORKTREE_OR_REPO}. Branch: {BRANCH} (already checked out; do not switch).
Read: docs/gdd/{GDD_FILE} §{SECTIONS} (the spec and its acceptance criteria), docs/gdd/16-roadmap.md row {WP_ID},
docs/HANDOFF.md §0, and the failing tests {TEST_FILES}.
Files you may touch (and NO others): {OWN_FILES}
Files you must NOT touch (owned by other agents right now): {FORBIDDEN_FILES}
Task: make {TEST_FILES} pass by implementing the spec. Work in small steps: run `node --test {TEST_FILES}` after each.
Do not weaken or delete a test to make it pass; if a test contradicts the GDD, stop and report it.
Add a `docs/gdd/DECISIONS.md` note DRAFT in your report (not in the file) for every departure from the GDD.
Player-visible? Then also: add or extend a scenario in scripts/screens.js (only if it is in your file list) and a
fixture page under public/dev/ if a system has no server-free way to be shown.
Done when: {TEST_FILES} green; `npm run check` green; `node scripts/lint-engine.js` clean; no file outside your list
changed (`git status --short` proves it).
REPORT FORMAT (max 25 lines):
STATUS: done | partial | blocked
FILES CHANGED: <path — one-line why> (from git status)
COMMANDS RUN + RESULT: <command → pass/fail count, last line pasted>
DEVIATIONS FROM GDD (draft DECISIONS text): ...
NOT DONE / RISKS: ...
NEEDS FROM LEAD (files outside my list, decisions): ...
```

### 2.2 Test-writer

- **Purpose:** turn the GDD's acceptance column into failing `node:test` tests before any code exists.
- **Inputs:** WP id, GDD sections, existing test conventions.
- **May touch:** `tests/<area>.test.js` (new), `tests/fixtures/**` (new files), nothing under `public/`, `server/`,
  `scripts/`.

```
[COMMON RULES]
ROLE: TEST-WRITER for work package {WP_ID} — {WP_TITLE}.
Working directory: {WORKTREE_OR_REPO}.
Read: docs/gdd/{GDD_FILE} §{SECTIONS} (the acceptance criteria are your spec), docs/gdd/15-qa-tooling.md §1–§4, and
two existing tests for conventions: tests/knowledge.test.js and tests/style.test.js.
Conventions (match them exactly): node:test + node:assert/strict; at the top
`process.env.WC_SAVES = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-{area}-'))` and `process.env.WC_PROVIDER = 'mock'`;
dynamic `await import('../public/js/...')` after those; a file header comment saying which GDD section and WP it proves;
fixed seeds (createInitialState('agot_298', house, { seed: 298 })); under Canon gravity the story owns the dates, so any
test that needs a season to pass or a lord to die uses `canonGravity: 'sandbox'` or a character the story does not need;
no clock, no Math.random, no network, no live model, no test that takes > 20 s.
Files you may touch: tests/{AREA}.test.js, tests/fixtures/{FIXTURE_DIR}/** — nothing else.
Task: write the acceptance tests for {WP_ID}: one test per acceptance sentence, named in the GDD's words. Include at
least: the happy path; a boundary; a NON-INTERFERENCE test if the WP shows anything to the player (mutate a hidden
truth, assert the player-facing view is byte-identical); a determinism test (same seed → same output twice) if the WP
is engine code. The code under test does not exist yet: import the paths the GDD specifies; the tests must FAIL because
the module or behaviour is missing, not because of a typo. Run `node --test tests/{AREA}.test.js` and paste the failure
summary to prove they fail for the right reason.
REPORT FORMAT (max 20 lines):
TESTS WRITTEN: <file: N tests> — list of test names
EXPECTED FAILURE REASON (pasted first failing line per test group)
GDD SENTENCES NOT TESTABLE ON THE MOCK (owner-only) : ...
MODULE PATHS/EXPORTS THE BUILDER MUST CREATE: <path: exports>
```

### 2.3 Visual QA

- **Purpose:** look at the game as a player would at both sizes and report defects with coordinates. It reports; it
  does not fix.
- **Inputs:** WP id, scenarios to run, the rubric (§5.2), the worktree path (screens.js serves the live tree).
- **May touch:** `visual-out/**`, `docs/screens/{WP_ID}/**`, and (only if told) new scenarios in `scripts/screens.js`.

```
[COMMON RULES]
ROLE: VISUAL QA for {WP_ID}. Working directory: {WORKTREE} (a clean worktree of branch {BRANCH}; nobody edits it while
you shoot). Ensure `node_modules` is symlinked from the main repo and Playwright is available (`npm i --no-save
playwright` if not; `npx playwright install chromium` if the browser is missing).
Files you may touch: visual-out/**, docs/screens/{WP_ID}/** . Nothing else. You do NOT fix code.
Machine care: SwiftShader is slow (1–3 min per scenario per size). Run in the background with a fixed port
(`SCREENS_PORT={PORT} node scripts/screens.js {SCENARIOS} > /tmp/screens-{WP_ID}.log 2>&1 &`), record the PID, wait
for it, and NEVER run `npm test` meanwhile. Kill by PID only.
Task: (1) shoot {SCENARIOS} at 1920×1080 and 1366×768 (the script does both). (2) Read EVERY image with the Read tool
and judge it against this rubric: clutter count (count interactive controls and 2+-line text blocks visible), overlap
(labels, tokens, panels: must be 0), readability at 1366×768 (smallest text ≥ 12 px equivalent, no wrapped top bar),
token consistency (colours, radii, fonts, spacing the same as neighbours; `--ink` is DARK: no dark-on-dark), portraits
and family trees present and not worse than before, no emoji in markup, no console errors in the log. (3) Copy the
good final images to docs/screens/{WP_ID}/ named `<scenario>-1920x1080.jpg` and `<scenario>-1366x768.jpg`.
Compare with baseline images in {BASELINE_DIR} if given.
REPORT FORMAT (max 30 lines):
SCENARIOS RUN: <name: 1920 ok/fail, 1366 ok/fail, seconds>
DEFECTS (severity S1 blocker / S2 must-fix / S3 polish), one per line:
  <S#> <image file> @ (x,y)–(x2,y2) px: <what is wrong> — <what it should be>
COUNTS (per image): controls=N, text-blocks=N, overlaps=N, HUD-coverage≈N%
PORTRAITS/TREES: unchanged | improved | DEGRADED (where)
CONSOLE ERRORS: none | <lines>
VERDICT: PASS | FAIL
```

### 2.4 Player's-eye reviewer

- **Purpose:** play a mock game headless for N turns and read the chronicle and headlines as a player, grading them by
  GDD 18's rules. Mandatory for N, U (headline strip) and R (ledger prose).
- **Inputs:** house, turns, WP id, `docs/gdd/18-headlines.md` §2, §4, §5.2.
- **May touch:** `playtest/**`, a scratch script in the scratchpad; never source.

```
[COMMON RULES]
ROLE: PLAYER'S-EYE REVIEWER for {WP_ID}. Working directory: {WORKTREE}. Provider: mock only.
Read: docs/gdd/18-headlines.md §2 (the card), §4 (good examples), §5.2 (the scorer's rules); docs/gdd/01-vision.md §7.
Files you may touch: playtest/**, and scratch files in {SCRATCHPAD}. No source edits.
Task: play {HOUSE} for {N} turns on the mock: `WC_PROVIDER=mock node scripts/playtest.js --house {HOUSE} --turns {N}`
(it writes playtest/<house>-<date>.md), then repeat for {HOUSE2} and {HOUSE3}. Then READ what it wrote as a player who
has never seen the code: the headline strip / cards, the chronicle, the digest, any ledger text. For each turn quote the
headline(s) and grade each card: (a) at most 12 words; (b) names who, and where when there is a place; (c) a news-headline verb (present, or a participle: D-058);
(d) no jargon or boilerplate (fact kinds, "holds court", "Word came that", "…and N more", "~N men", ids like
`house_x`); (e) no invented name (every capitalised name exists in the game); (f) one card per story, not one line per
fact; (g) the summary adds something the headline lacks; (h) nothing the player's house could not know (no spoilers,
no hidden truths, no future beat). Note anything a player would hate even if it passes the rules: repetition, dull turns,
walls of text, a story that contradicts the map.
REPORT FORMAT (max 40 lines):
RUNS: <house, turns, file>
TABLE of the 12 WORST cards: <turn | headline | rule broken | suggested rewrite>
STATS: cards/turn (mean, max), words/headline (mean, max), % passing rules a–h, repeated-verb share
LEAKS/SPOILERS: none | <quote + why>
WHAT A PLAYER WOULD HATE (top 5, most important first)
VERDICT: SHIP | FIX FIRST (list)
```

### 2.5 Knowledge and spoiler auditor

- **Purpose:** prove every player-facing view is filtered by house knowledge and leaks no truth, no post-298
  knowledge and no future beat.
- **Inputs:** the diff (`git diff {BASE}...HEAD --stat`), the new views/routes/UI text.
- **May touch:** `tests/*-knowledge*.test.js` or `tests/leaks-{WP_ID}.test.js` (new tests only) and its report.

```
[COMMON RULES]
ROLE: KNOWLEDGE / SPOILER AUDITOR for branch {BRANCH} (WP {WP_ID}). Working directory: {WORKTREE}.
Read: docs/gdd/03-architecture.md §14 invariants 9 and 10, docs/gdd/09-living-world.md §7, docs/gdd/19-realm-ledger.md
§5, docs/gdd/17-ui-declutter.md §3.5, public/js/engine/knowledge.js, server/view.js (playerView, hiddenTruths).
Files you may touch: tests/leaks-{WP_ID}.test.js (new) only. No source edits.
Task: (1) list every new or changed thing that reaches the browser (routes in server/index.js, fields in
server/view.js, strings in public/js/ui/*, public/data/*, cards, tooltips, stop reasons): `git diff {BASE}...HEAD`.
(2) For each, trace whether it passes through engine/knowledge.js (viewOf/knownFacts/estimate etc.) or is public data.
(3) Write NON-INTERFERENCE tests: build a state, snapshot the view for house {HOUSE}; mutate what {HOUSE} cannot know
(another house's treasury, levies, plots, a future beat's flag, a hidden parentage) with no news reaching {HOUSE};
assert the JSON is byte-identical. (4) Grep the player-facing text and data for post-298 knowledge (names, titles,
events after 298 AC: `public/data/anachronisms.js` is the list) and for canon-schedule leaks (a future beat's title,
window or id). (5) Check that no `viewer` parameter from the request can widen the view.
REPORT FORMAT (max 25 lines):
SURFACES AUDITED: <path:symbol → filtered? yes/no/public>
LEAKS FOUND (S1 = hidden truth or spoiler): <where, how to reproduce, one-line fix>
TESTS ADDED: <name → passes on current code? (a passing leak test proves the closure; a failing one is the leak)>
VERDICT: CLEAN | LEAKS (n)
```

### 2.6 Determinism and performance auditor

- **Purpose:** run the lint, soak, canon playtest and timings; catch nondeterminism, regressions and slowness.
- **Inputs:** branch, what changed in the engine.
- **May touch:** nothing (output to the scratchpad). Runs alone: it is the heaviest job.

```
[COMMON RULES]
ROLE: DETERMINISM & PERFORMANCE AUDITOR for branch {BRANCH}. Working directory: {WORKTREE}. You are the ONLY heavy job
running: the lead has stopped tests and screenshots for you. Run commands ONE AT A TIME, in the background for the long
ones with output to {SCRATCHPAD}/{name}.log, and wait.
Files you may touch: none (write logs only under {SCRATCHPAD}).
Task, in this order:
1. `npm run check` (data, syntax, engine lint). Paste the last 5 lines.
2. `node scripts/soak.js --turns 60 --houses stark,lannister,tyrell --quiet` (the nightly runs 200 × 6; if you were told
   the change is engine-wide, run `--turns 200`). Note the printed seeds, ms per turn, save size, invariant breaks.
3. `node scripts/canon.js` if the change touches beats, life, knowledge, facts or the turn loop: Q9 must pass
   (≈ 3 min a house).
4. `npm run balance` if it touches economy/muster/war: "the economy is in balance".
5. Determinism probe: play the same seed twice through 8 turns on the mock (a scratch script in {SCRATCHPAD} using
   server/game.js as scripts/soak.js does) and compare the saved state JSON byte for byte. Any difference is S1.
6. Budgets (docs/gdd/15-qa-tooling.md §7): a 7-day jump at turn 60 ≤ 1.5 s; state.json ≤ 5 MB at turn 200; a 200-turn
   save ≤ 50 MB; note before/after numbers against the base branch {BASE} if you can (use a second worktree).
REPORT FORMAT (max 25 lines):
LINT: pass/fail  SOAK: pass/fail (seeds, turns, houses) INVARIANT BREAKS: none | <turn, house, seed, message>
CANON Q9: pass (n/60 per house) | fail | not needed
BALANCE: ok | n/a
DETERMINISM: identical | DIFFERS (first differing path)
TIMINGS: ms/turn now vs base; save size now vs base; any budget exceeded
REPRO COMMANDS for every failure (with seeds)
VERDICT: PASS | FAIL
```

### 2.7 Docs keeper

- **Purpose:** keep the paperwork true and consistent: CHANGELOG, roadmap ✅, GDD "implemented" note, DECISIONS,
  HANDOFF at phase end. It runs after the code is final.
- **Inputs:** the diff, the builders' draft DECISIONS text, screenshots list.
- **May touch:** `docs/CHANGELOG.md`, `docs/gdd/16-roadmap.md`, the GDD file of the WP, `docs/gdd/DECISIONS.md`,
  `docs/HANDOFF.md` (phase end only), `docs/gdd/README.md` index if a doc was added.

```
[COMMON RULES]
ROLE: DOCS KEEPER for {WP_ID} — {WP_TITLE}. Working directory: {WORKTREE}, branch {BRANCH}.
Files you may touch: docs/CHANGELOG.md, docs/gdd/16-roadmap.md, docs/gdd/{GDD_FILE}, docs/gdd/DECISIONS.md
{, docs/HANDOFF.md — only if this is the last WP of a phase}. No code, no tests.
Inputs: `git diff {BASE}...HEAD --stat`; builders' draft decision text: {DECISIONS_DRAFT}; screenshots in
docs/screens/{WP_ID}/.
Task: (1) CHANGELOG: one entry in the existing format (look at the last three), written for the PLAYER (what they see
now) plus "what the owner should verify" as concrete commands/clicks; no model names. (2) Roadmap: mark the {WP_ID}
row ✅ (and only that row). (3) GDD: add "*implemented in {WP_ID} (PR #{PR})*" under the section(s) built; fix any
place where the GDD is now wrong (numbers, file names, schemas) instead of leaving it inconsistent. (4) DECISIONS.md:
append D-0NN (next free number: read the tail) for EACH departure: date 2026-09-29-style ISO, what, why, what it
replaces. (5) Cross-check every file path and command you wrote actually exists (`ls`, `grep`).
REPORT FORMAT (max 15 lines):
EDITED: <file — what>
DECISIONS ADDED: D-0NN … (one line each)
GDD ERRORS FIXED: ...
UNVERIFIABLE CLAIMS I LEFT OUT: ...
```

### 2.8 Diff reviewer (adversarial)

- **Purpose:** try to break the branch before its PR: bugs, rule breaches, scope creep, weak tests.
- **Inputs:** base and head, the WP spec.
- **May touch:** nothing.

```
[COMMON RULES]
ROLE: ADVERSARIAL DIFF REVIEWER for branch {BRANCH} against {BASE} (WP {WP_ID}). Working directory: {WORKTREE}. Read-only:
you edit nothing. Assume the builder is confident and wrong; your job is to prove it.
Read: docs/gdd/{GDD_FILE} §{SECTIONS}, then `git diff {BASE}...HEAD --stat` and the whole diff (per file, not in one
gulp: `git diff {BASE}...HEAD -- <path>`).
Hunt, in this order:
1. CLAUDE.md Never-list breaches: model output reaching state; runtime deps in package.json; Math.random / Date in
   engine or shared; portraits/trees removed or degraded; spoilers or unfiltered views; live-model needs in tests.
2. Correctness: off-by-ones, NaN/undefined in numbers shown to the player, save migration (old saves must still load),
   missing `esc()` on names put into HTML, ordering that depends on object key or hash order (nondeterminism), state
   mutated inside a "view" function.
3. Tests that cannot fail: assertions on constants, `assert.ok(x || true)`, snapshots regenerated without review,
   skipped tests, tests that pass with the feature stubbed out. For 3 of the most important tests, name the one-line
   change to the code that would break the feature but keep the test green.
4. Scope creep and files outside the WP's list; dead code; duplicated helpers that already exist (grep first);
   comments that say WHAT not WHY; huge functions.
5. Windows: path separators, `process.kill`, symlinks (use junctions), CRLF.
REPORT FORMAT (max 30 lines), findings only, most severe first:
<S1 blocker | S2 must-fix | S3 nit> <path:line> — <problem> — <one-line fix or reproduction>
TESTS THAT WOULD NOT CATCH A BREAK: <test → the mutation that survives>
VERDICT: MERGE | FIX FIRST (n S1, n S2)
```

### 2.9 Explorer (read-only researcher)

- **Purpose:** broad searches so the lead's context stays clean: "where is X built", "who calls Y", "what files does
  WP Z really touch".
- **Inputs:** a question. **May touch:** nothing.

```
ROLE: EXPLORER (read-only; edit nothing, run no tests). Repo /home/user/A-game-of-thrones-local-game.
Question: {QUESTION}
Search broadly (grep/glob, then read only the lines that matter). Answer in at most {N} lines: file:line references,
the exact function names, and anything surprising. No code dumps longer than 5 lines. If you cannot find it, say what
you searched.
```

## 3. The per-WP pipeline

Each row: who acts, and **what you, the lead, must verify at the gate**.

| # | Step | Who | Lead's gate (do it yourself) |
|---|---|---|---|
| 0 | **Plan.** Read the WP's row and GDD section (not the whole GDD). Write a 10-line plan: files, order, parallel slices, risks. Branch `wp/<id>-<slug>` from the default branch (or stack on the previous unmerged WP, say so in the PR). | lead (Explorer for "which files really") | The file list has no overlap with a WP running in parallel (§4). |
| 1 | **Tests first.** | Test-writer | Run its file alone: it FAILS, for the right reason (missing module, not a typo). Read the test names against the GDD acceptance: every sentence covered? Commit them (`test: {WP_ID} acceptance, failing`) so builders see them. |
| 2 | **Build.** One Builder per slice, in parallel on **disjoint files**, or each with `isolation: "worktree"` and you merge branches. Serialise anything touching `server/game.js`, `public/app.js`, `public/css/style.css`, `public/index.html`, `migrate.js`. | Builders | `git status --short` matches the promised file list; nothing outside it. |
| 3 | **Check and test.** `cd` to the tree, then `npm run check && npm test`, alone, nothing else running. | **lead** | All green, paste count (≈ 400+ tests). A red you did not cause on the base branch is still a stop. Never accept "tests pass" from a report. |
| 4 | **Visual QA** (any visible change). Add/extend the scenario in `scripts/screens.js`, then run in a clean worktree. | Visual QA | **Open at least the 1366×768 images yourself** and the worst-defect coordinates it named. S1/S2 defects go back to a Builder; re-shoot after the fix. Nothing else running during shooting. |
| 5 | **Player's-eye review** (N, U headline strip, R prose; any change to text the player reads). | Player's-eye reviewer | Read its 12 worst cards; decide if the writer or the rules must change. A leak = stop. |
| 6 | **Audits** (engine/turn-loop/knowledge/view changes): spoiler auditor for anything that reaches the browser; determinism/perf auditor for engine changes. Alone, sequentially, never with screenshots. | Auditors | Determinism DIFFERS or invariant break = stop; new leak test must be committed. |
| 7 | **Diff review.** After fixes, before the PR. | Diff reviewer | Fix every S1/S2 (via a Builder), re-run step 3. Sample two of its "tests that would not catch a break" and check them. |
| 8 | **Docs.** | Docs keeper | Read CHANGELOG entry as the owner: is there a concrete "verify by" step? Roadmap ✅ only for this WP. DECISIONS for each departure. |
| 9 | **Commit and PR** into `claude/brave-ramanujan-i8dt0q`: What / Why / How tested (commands and counts you ran) / Screenshots (docs/screens/{WP_ID}/, both sizes) / What the owner should verify. Attribution lines per the session reminder. | lead | `git diff --stat` reviewed; no `visual-out/`, `playtest/`, `saves/` or logs committed; `node_modules` untouched. |
| 10 | **CI.** 8 jobs (push + pull_request × ubuntu/windows × Node 22/24 — `.github/workflows/ci.yml`). Subscribe to the PR (`subscribe_pr_activity`) and `send_later` a check-in (e.g. 12 min); do other planning meanwhile, but not heavy local jobs on the same tree. | lead | All 8 green. On a red: read the failing job's log (`get_job_logs`), reproduce, fix; Windows-only failures are usually paths/kill/symlinks. |
| 11 | **Merge** with a **merge commit**, only with 8/8 green. | lead | Then pull the default branch, delete the WP branch. |
| 12 | **Sync.** Pull the default branch into your session branch and into each parallel worktree; re-run `npm test` on the next WP's first build. Update your plan. | lead | The next builders start from the merged tree. |

**Phase end** (after the last N, U or R WP): a "loose ends" audit (Explorer: TODOs, unmarked roadmap rows, GDD
sections lacking "implemented"), a fresh Player's-eye review of three houses, the full soak and Q9 canon run, then the
Docs keeper rewrites `docs/HANDOFF.md` per `docs/gdd/00-agent-brief.md` §7.

## 4. Parallelism plan for Phases N, U, R

Files come from the WPs' tables in GDD 17, 18 and 19. **Hot files** (many WPs want them; only one owner at a time):
`server/game.js`, `public/js/engine/state/migrate.js`, `public/js/app.js`, `public/index.html`, `public/css/style.css`,
`public/js/ui/drawer.js`, `public/js/ui/windows.js`, `public/data/style.js`, `server/view.js`, `server/index.js`.

### 4.1 File map

| WP | Files (main) | Hot files it needs |
|---|---|---|
| N1 golden set + scorer | `server/ai/validate/headline.js`, `tests/fixtures/headlines/*`, `tests/headlines.test.js` (scorer part) | `public/data/style.js` (adds `BOILERPLATE`, `JARGON`) |
| N2 labels and slots | `engine/facts/label.js`, emitters in `shared/battles.js`, `shared/world.js`, `engine/military/{battle,siege}.js`, `server/turn/day.js`, `shared/plots.js`, `engine/world/beats.js`, `shared/diplomacy.js`, `scripts/lint-engine.js` | — |
| N3 deterministic writer | `engine/facts/heads.js`, `engine/facts/headline.js`, `tests/headlines.test.js` | — |
| N4 clustering v2 | `engine/facts/cluster.js`, `server/narrator.js` | — |
| N5 narrator v3 | `server/ai/calls/narrate.js`, `server/ai/validate/narration.js` | `public/data/style.js` |
| N6 card shape + migration | `server/game.js` (~L431–466), `engine/state/migrate.js`, `server/view.js` | **all three** |
| N7 feed and digest UI | `ui/drawer.js`, `app.js`, `css/*`, `ui/windows.js`, `ui/event-art.js` | **all** |
| N8 pins | `shared/pins.js`, `ui/pins.js`, `map3d/*` | — |
| N9 ranking and Meanwhile | `engine/facts/rank.js`, `headline.js`, `server/game.js` | `server/game.js` |
| N10 bench, soak, owner check | `bench/*`, `scripts/{bench,soak,headlines-check}.js` | — |
| U1 quiet HUD | `index.html` (`#hud-top`), `css/style.css`, `app.js` (`renderTop`), `ui/icons.js` | **all** |
| U2 three-entry menu | `index.html`, `css/style.css`, `app.js`, `ui/windows.js` | **all** |
| U3 headline strip, inbox, command bar | `index.html`, `css/style.css`, `ui/drawer.js`, `ui/playback.js`, `app.js` | **all** |
| U4 contextual cards | `ui/windows.js`, sheets, `app.js` | **all** |
| U8 first-run, focus, map declutter | `index.html`, `css`, `app.js`, `ui/drawer.js`, `ui/common.js`, `ui/pins.js`, `map3d/{lod,labels,tokens}.js` | **all** |
| U9 portraits and trees | `ui/portrait.js`, `ui/windows.js` (`people`, `familyTree`, `characterSheet`), `css` | `windows.js`, `css` |
| R1 figures + series | `engine/realm/{figures,stats}.js`, `server/game.js` (`closeTurn`), `migrate.js`, `state/validate.js`, `engine/rng.js` | `game.js`, `migrate.js` |
| R2 estimates + view fn | `engine/realm/{estimate,view}.js`, `engine/knowledge.js` | — |
| R3 API route | `server/index.js`, `server/game.js` (`realmView`) | `index.js`, `game.js` |
| R4 window UI | `ui/realm.js`, `app.js`, `ui/windows.js`, `css`, `ui/icons.js` | **all** |
| R5 minds read the ledger | `engine/realm/brief.js`, `engine/minds/*`, `server/ai/calls/{mind,council}.js` | — |
| R6 wars and focus | `engine/realm/view.js`, `engine/politics/war.js` | — |
| R7 polish, tooling | `scripts/realm-dump.js`, docs | — |

### 4.2 Waves (each wave = agents that can run at once)

- **Wave 1 (start together, three lanes):**
  - *Lane N-a:* **N1** (test-writer writes the scorer tests; builder writes `headline.js` validator + golden set). Owns `public/data/style.js` until it merges.
  - *Lane N-b:* **N2** (label/slots/emitters/lint) — disjoint from N1. Also **N3's test-writer** can start (tests only) as soon as N1's scorer API is fixed.
  - *Lane U:* **U1 → U2 → U3 as one lane, one builder at a time** (they share `index.html`, `style.css`, `app.js`). U3's headline strip waits for N6's card shape: stub it with the old `title` until then.
  - *Lane R:* **R1** touches `server/game.js` and `migrate.js`; start it only if N6 is not being edited (see wave 2), otherwise start **R2's** pure modules (`estimate.js`, `view.js`) against a fixture state first: R2 needs R1's `figuresOf` shape, which is in GDD 19 §3, so the test-writer can write both now.
- **Wave 2:** N3 (needs N1 merged) ∥ N4 (needs N2's labels for names only; `cluster.js` is its own file) ∥ R1 (if not already done). Merge N1, N2 first.
- **Wave 3:** N5 (needs N1+N3; owns `style.js` and the narrate call) ∥ R2 → R3 (R3 after R1's `game.js` change is merged) ∥ U continues.
- **Wave 4:** **N6** alone on `server/game.js`/`migrate.js`/`view.js` (needs N3+N5). Nothing else touches those three files this wave. R lane pauses or does UI-free work (R5's brief module, R6's `war.js` export).
- **Wave 5:** N7 ∥ R4 **conflict** (`app.js`, `windows.js`, `css`): serialise, N7 first (it unblocks U3's strip), or split by giving one builder both and two test-writers. N8 ∥ N9 ∥ R5 ∥ R6 are disjoint from that (N9 needs `game.js`: after N6 only).
- **Wave 6:** U4, U8 (UI hot files, serial), N10, R7; **U9** last (portraits: improve, never degrade); then the phase-end audits.

### 4.2b Status at the 2026-09-29 handoff, and the remaining order (two agents at a time)

Done: N1–N4, U0, R1–R3 (and the bug sweep SB). U1–U3's failing tests are on `wp/u1-u3-quiet-screen`. Remaining, in
order, one builder plus one test-writer or reviewer at a time: **U1+U2 → U3** (hot files, serial) ∥ **N5+N6+N9**
(`server/game.js`, `narrate.js`, `migrate.js`: disjoint from U's files) → **N7+N8** and **R4+R6** (both touch `app.js`,
`windows.js`, `style.css`: serialise) → **R5** → **U4+U8** → **U9** → **N10**, **R7** → phase-end audits and HANDOFF.

### 4.3 Critical path

`N1 → N3 → N5 → N6 → N7 → (U3 strip) → U4 → U8 → U9`. Everything else (N2, N4, N8–N10, R1–R7, U1–U2) hangs off it and
should be scheduled into the gaps. The first player-visible payoff is N6 + N7 + U3: protect that chain, keep it on
the earliest waves, and keep your best-reviewed builders on it. R1–R3 change nothing visible and are safe to merge as
soon as green.

**Rule of thumb:** at most **3 builders at once**, and at most **1 heavy job** (full tests, screenshots, soak) on the
machine. Test-writers and Explorers are cheap and can overlap with anything.

## 5. Quality bar

### 5.1 PR checklist (the lead ticks every line)

- [ ] Branch `wp/<id>-<slug>`; PR into `claude/brave-ramanujan-i8dt0q`; What / Why / How tested / Screenshots / Owner verifies; attribution lines.
- [ ] `npm run check && npm test` green **on my run**, counts pasted; 8/8 CI jobs green.
- [ ] New tests written first, from the GDD acceptance; none skipped or weakened; a non-interference test for anything shown to the player.
- [ ] No `Math.random`, no clock in engine/shared; `lint-engine` clean; same seed twice gives identical saves.
- [ ] No runtime deps (`package.json` diff empty on `dependencies`); no live-model need anywhere.
- [ ] Every model call touched has schema + mock + fallback; model output changes no state.
- [ ] Knowledge: every new view/route/text goes through `engine/knowledge.js`; the spoiler auditor said CLEAN.
- [ ] Old saves still load (migration fixture); `state.json` size and turn time within §7 budgets.
- [ ] UI: screenshots at 1920×1080 **and** 1366×768 in `docs/screens/<wp>/`, I looked at them; visual rubric (§5.2) passed.
- [ ] Portraits and family trees present and not degraded.
- [ ] Unfinished rebuilds behind a `config.json` switch; the default branch stays playable.
- [ ] Docs: CHANGELOG (player-facing + owner verify), roadmap ✅ on this row only, GDD "implemented", DECISIONS for each departure.
- [ ] No stray files: `visual-out/`, `playtest/`, `saves/`, logs, scratch scripts.
- [ ] Diff reviewer's S1/S2 all fixed; commit subject plain, body says what changes for the player.

### 5.2 Visual rubric (Visual QA and the lead)

| Criterion | Pass |
|---|---|
| Clutter | Interactive controls visible ≤ 16 at turn 5, ≤ 20 at turn 0; text blocks of ≥ 2 lines ≤ 3; HUD covers ≤ 15 % of pixels at 1920, ≤ 20 % at 1366 (GDD 17 §5) |
| Old docks | No Economy / Military / Diplomacy / Intrigue buttons in the HUD (they live in the menu and the Realm ledger) |
| Overlap | 0 overlapping labels, tokens, panels, tooltips at the default zoom, at both sizes |
| Readability at 1366×768 | Top bar ≤ 48 px and never wraps; body text ≥ 12 px; contrast fine on both light parchment and dark panels (`--ink` is DARK: never on a dark panel) |
| Tokens | Colours, radii, spacing, fonts come from the CSS tokens; no one-off hex or px that neighbours do not use; SVG icons, no emoji in markup |
| Portraits and trees | Present; the change is an improvement in place (family resemblance, age steps, readable tree at 1366) or untouched; never removed |
| Motion | Reduced-motion respected; nothing flickers between shots |
| Console | Zero errors or warnings in the Playwright log |
| Coordinates | Every defect reported as image + (x,y)–(x2,y2) + what it should be |

### 5.3 Headline rubric (GDD 18 §5.2; the scorer `scoreCard` implements it)

A headline passes only if **all** hold: 3–12 words (≤ 80 chars); names **who** (and **where** if it has a place);
a news-headline verb, present or passive participle ("refuses", "slain", "crowned"; D-058); at most one number, from the story's data, no `~`, no
"N men"; no `()`, `:`, `;`, `—`, `…`, no trailing full stop; none of the boilerplate or jargon lists (fact kinds,
"Word came that", "holds court", ids like `house_x`, "…and N more"); **no invented name** (every capitalised token
resolves to the story); roles not reversed (who did it to whom); the summary is 1–3 sentences (≤ 340 chars), says
something the headline does not, and is not the headline restated; nothing the house cannot know. Across a run: ≤ 10
cards per turn, mean ≥ 1.5 facts per card, verb variety ≥ 70 % distinct. Model: *"Robb Stark slain by Tywin Lannister
at the Green Fork"* — never *"Battle at green_fork: Lannister defeated Stark (~4000 men)."*

### 5.4 Code rubric

- **Small modules**: one job per file, a pure function where possible (`cardOf(state, story)`, `figuresOf(state, house)`), functions that fit one screen.
- **Comments explain why**, in plain English, often in the game's own voice; no comment that only restates the line.
- **Deterministic and pure**: view functions never mutate state; ordering never depends on object key or set order; the save's dice only.
- **Zero runtime dependencies**, ES modules, no build step; dev tools `--no-save`.
- **Reuse before writing**: grep for an existing helper (`esc`, `tablesFor`, `standing`, `project`, `hash32`) first.
- **Escape everything** put into HTML (`esc`); no `innerHTML` with unescaped names.
- **Compatibility**: aliases and lazy migration for old saves; config switch for unfinished rebuilds.
- **Windows-safe**: `fileURLToPath`, `path.join`, junctions not symlinks in scripts, no `kill` by pattern.

## 6. Failure modes seen here, and how to avoid them

| Failure | Symptom | What to do |
|---|---|---|
| **OOM when tests and screenshots overlap** | exit 137, tests or Chromium killed | One heavy job at a time. Tell every agent so (COMMON RULES). Run screenshots in the background, wait for the PID, then run tests. |
| **`screens.js` serves the live working tree** | later shots show half-finished edits, or another branch | Shoot from a clean `git worktree add ../wc-shots <branch>` with `node_modules` symlinked; nobody edits it while it runs. Two runs need different `SCREENS_PORT`. |
| **`pkill -f scripts/screens.js` kills its own shell** | the tool call dies | Kill by PID (`kill <pid>`), record the PID when launching in the background. |
| **Bash classifier outage** | commands refused or timing out for a while | Wait; retry with `send_later`; do not switch to risky workarounds. **Never end a turn with uncommitted work**: commit a WIP on the WP branch first when Bash returns. |
| **Subagents that "write blind"** | a report says "done", tests never ran, or it invented output | Require pasted command output in every report; the lead re-runs `npm run check && npm test` and sees the images. A report without `COMMANDS RUN + RESULT` is sent back. |
| **Canon gravity blocks tests** | a test waiting for a season or a death never happens | The story owns the dates: use `canonGravity: 'sandbox'` or a character the story does not need. Tell the test-writer. |
| **Stale terrain in screenshots or IndexedDB** | the map looks old after a change to `terrain.worker.js` | Bump `GEN_VERSION` in `MapScene.js` whenever the worker's output changes. |
| **`var(--ink)` is a dark colour** | unreadable text on dark panels | Use explicit light colours on dark panels; Visual QA checks contrast. |
| **Opening flight lands after a scenario's camera move** | screenshot framed wrongly | Set `map.target`/`map.dist` and call `map.updateCamera()` (see `mode-*` scenarios). |
| **Two builders on a hot file** | conflicts, lost edits | §4 hot-file list; serialise, or give one builder the whole surface. |
| **A builder "fixes" the test** | green, but wrong | Tests are committed first and read-only to builders; the diff reviewer lists tests that survive a mutation. |
| **Model-shaped features that need a live model** | untestable in CI | Schema + mock + fallback, tested on the mock and on recorded replies; the owner runs the live check via a shipped script (`scripts/headlines-check.js`, `npm run bench`). |
| **Leaks by convenience** | a new endpoint returns raw state | Every new view: knowledge-filtered, non-interference test, spoiler auditor. |
| **Docs drift** | roadmap ✅ without CHANGELOG, GDD out of date | Docs keeper is a mandatory pipeline step; fix the GDD in the same PR. |
| **Nondeterminism from iteration order or clocks** | soak seed cannot be replayed | `lint-engine`; the determinism probe; sort before iterating anything that reaches a fact. |
| **Windows-only CI failures** | `ERR_UNSUPPORTED_ESM_URL_SCHEME` ("Received protocol 'd:'"); a regex over a source file returns null | `import(pathToFileURL(p).href)`; put logic a test needs in an importable module (e.g. `ui/heraldry.js`), never regex the source (CRLF). |
| **Two full test runs at once** | `EADDRINUSE`/flaky `http.test.js` | Port 3411 is fixed: one full `npm test` at a time across all worktrees. |
| **A new state field leaks** | the browser receives the truth (`realmStats` did) | `playerView` spreads `...state`: delete every new field there; test with a non-interference run on `GET /api/games/:id`. |
| **Parallel branches' docs collide** | merge conflicts in the top of CHANGELOG and the tail of DECISIONS | Reserve decision numbers per slice; merge by keeping both sides in order (newest CHANGELOG entry first, decisions by number). |
| **Usage limits cut agents off** | an agent's run fails mid-generation with a rate-limit error | Progress notes, WIP commits, the agent register (law 7); resume by message after the reset. |
| **A test that cannot fail** | green with the feature broken | Ask builders and reviewers to mutate their own code (the N2 builder broke it 34 ways) and to prove each test catches its break. |

## 7. Context hygiene for the lead

- **Your context is for decisions**: plans, gates, merge calls, owner-facing wording. Delegate reading and writing.
- **Ask for short reports** (formats above cap the length). Reject essays; ask for a follow-up on one point if needed.
- **Never read huge files whole**: `wc -l` first, then `sed -n a,bp`, `grep -n`, or the Read tool with offset/limit. Tests, `app.js`, `windows.js`, `server/game.js` and the GDD 17–19 are large; read the WP's section only.
- **Broad questions go to Explorer agents** ("who calls `closeTurn`", "every place `plainEvent` is used"), with a line cap on the answer.
- **Trust but verify**: read a diff by `--stat` first, then only the hot spots; open the images; run the tests.
- **Parallel calls**: launch independent agents in one message; never launch two agents that share a file.
- **While CI runs** (≈ 10–15 min): `subscribe_pr_activity` on the PR so failures and comments arrive as events, and `send_later` a check-in (`delay_minutes: 12`) as a backstop. Use the wait to plan the next wave or dispatch a test-writer or Explorer (cheap), never a heavy local job on the tree that CI is checking.
- **Long jobs** (screens, soak, canon): run in the background, note the PID and the log path in your plan, and set a `send_later` check-in rather than polling.
- **Keep a running plan** (in your reply or a scratch file in the scratchpad): the wave, the agents out, the files each owns, the branch each is on, what you verify next. Update it after every merge.
- **At every turn end**: everything committed on its branch, no agent running unattended, the plan current.

## 8. Quick reference

```bash
npm run check && npm test                                   # the gate (run alone)
node --test tests/<file>.test.js                            # one file
node scripts/lint-engine.js                                 # determinism lint
node scripts/soak.js --turns 60 --houses stark,lannister,tyrell --quiet
node scripts/canon.js                                       # Q9, ≈ 3 min a house
npm run balance                                             # economy in balance
WC_PROVIDER=mock node scripts/playtest.js --house stark --turns 12
SCREENS_PORT=3499 node scripts/screens.js <scenario…> > /tmp/screens.log 2>&1 &   # then note the PID; output in visual-out/
git worktree add ../wc-shots <branch> && ln -s "$PWD/node_modules" ../wc-shots/node_modules
```
