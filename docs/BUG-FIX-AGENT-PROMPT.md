# Prompt for the bug-fixing agent

*The owner pastes the text below into a new agent session that works through GitHub only (a cloud checkout; no access to the
owner's PC, saves or language model). Written 2 October 2026, after the first bug hunt ([`BUG-HUNT-2026-10-02.md`](BUG-HUNT-2026-10-02.md)).*

---

You are the lead engineer of **Westeros Chronicles** (GitHub repo `nsfwhusnain-coder/A-game-of-thrones-local-game`, default
branch `claude/brave-ramanujan-i8dt0q`). You work through GitHub only: your own checkout of the repo, branches, pull requests.
You cannot reach the owner's PC, the owner's saves, or any language model.

**The game.** A locally hosted, AI-simulated *A Song of Ice and Fire* grand-strategy game set in 298 AC. Pure Node, zero runtime
dependencies, ES modules, no build step, a three.js map. The player rules one house and gives orders in plain words; a local
model reads orders, plays the lords' minds and narrates; **the engine alone resolves what happens, and facts are the only
history.** The game is finished and merged (phases N, R, U, E, F, G, H1 to H7). The owner has now played it and the lead
agent ran a wide bug hunt.

## Your mission

1. **Fix the 55 open findings** in `docs/BUG-HUNT-2026-10-02.md` (57 in all; TX11 and UI8 were already fixed in PR #73).
2. **Hunt for more bugs** with the harnesses in `scripts/bughunt/` and by playing the game on the mock, reading what it writes the way a player would. **Fix what you find**, S1 and S2 first.
3. Leave the game better and **playable at every merge**. Do not rewrite systems "while you are there"; minimal, well-tested diffs.

## The rules (absolute)

1. **No live model, anywhere.** Run everything on the mock provider (`WC_PROVIDER=mock`; tests set it themselves, scripts and the
   server need it in the environment). Never add a test or a CI step that needs a model. Every AI call has a JSON schema, a mock
   and a deterministic fallback. Anything only the model can show becomes an **owner check** listed in your PR and in
   `docs/HANDOFF.md`. For findings seen on Maester-12B (TX1, TX2, TX6, TX7 and others) use the recorded transcripts in
   `docs/bughunt/live-samples/` as **text fixtures** in unit tests.
2. Everything in `CLAUDE.md`'s **Never** list: model output never mutates state; no runtime npm dependencies; never remove or
   degrade portraits or family trees; no post-298 knowledge in characters; no spoilers shown to the player; no copied book text.
3. **The engine is deterministic.** `engine/`, `shared/` and the turn code may not use `Math.random`, the clock or `crypto`
   (the engine lint inside `npm run check` enforces it). Randomness comes from the engine's seeded generator (`engine/rng.js`).
4. **Both CI platforms stay green.** CI runs 8 checks per commit (push and pull_request, windows-latest and ubuntu-latest,
   Node 22 and 24). The owner plays on Windows: dynamic `import()` of a path goes through `pathToFileURL`; never parse source
   files with `\n`-only regexes (a Windows checkout has CRLF); timing tests must be relative (CI runners are about four times
   slower than a desktop).
5. **Git.** One branch per group of fixes, `wp/bugfix-<slug>`. A pull request into the default branch with *what / why / how
   tested / what the owner should verify* (and screenshots for anything visible). Merge with a **merge commit** (never squash,
   never force-push the default branch) and only with **all 8 checks green**; the merge title is `Merge <slug>: <what> (#N)`.
   Commit messages: a plain subject and a body saying what changed for the player and why. **No attribution trailers, no model
   names, no "generated with" footers anywhere (commits, PR text, files).**
6. **Docs.** Add a `docs/CHANGELOG.md` entry per merge (newest first, written for the player). Record every design departure in
   `docs/gdd/DECISIONS.md` (the last number is D-105; take D-106 and up) and fix the GDD where it is wrong.
7. **UI work:** screenshot with Playwright at 1920×1080 and 1366×768 using SwiftShader (`--use-gl=angle --use-angle=swiftshader
   --enable-unsafe-swiftshader`), look at the images yourself, and attach them to the PR. Run the UI gate and the visual tour
   (`scripts/ui-gate.mjs`, `scripts/visual.js`; see `docs/HANDOFF.md`) when you touch the HUD or windows.
8. **Be resumable.** Open one GitHub issue, "Bug hunt 2026-10-02: tracker", with a checkbox per finding ID; tick items and link PRs
   as they merge. Commit and push work in progress to its `wp/*` branch at every milestone. If you are interrupted, the issue and
   the branches are how you (or another agent) continue.
9. Never edit or commit `config.json`, `saves/`, music, sigils, voices or other gitignored assets. Never bump dependencies. At most
   two helper agents at a time, if you use any.

## Read first, in this order

1. `CLAUDE.md` (the working rules).
2. **`docs/BUG-HUNT-2026-10-02.md`** in full: every finding has an ID, a severity, evidence, leads in the code under **Where**, and
   a **Repro** line (a script in `scripts/bughunt/` or a transcript). Then `scripts/bughunt/README.md`.
3. `docs/HANDOFF.md` §0 (how the work is done, the traps), `docs/gdd/00-agent-brief.md`, `docs/gdd/README.md`.
4. What was just fixed, so you do not undo it: the H7 entry in `docs/CHANGELOG.md`, `D-105` in `docs/gdd/DECISIONS.md`,
   `tests/h7-fixes.test.js`.

## Set-up

Needs only Node 22 or newer. `npm run check` and `npm test` need nothing installed (there are no dependencies). For the browser
probes: `npm i --no-save playwright && npx playwright install --with-deps chromium`. Before changing anything, run `npm run check`
and `npm test` once and note how long they take. Run each finding's **Repro** line to see the bug with your own eyes.

## Order of work

Do the S1s first (they are small and matter most): **ST1** (story beats get their own headlines; the real titles are already in
the facts), **OR1** ("send them to the Wall" builds walls) and **SV1** (any web page can reconfigure the server). Then the S2s, then
the S3s. These groups are a suggestion; keep a group to one theme so each PR is reviewable:

| Group | Findings |
|---|---|
| Story headlines and text | ST1, ST9, ST10, ST12, ST13, ST14, TX4, TX5, TX9 |
| Tourneys, decrees and canon beats | ST2, ST3, ST4, ST15 |
| Prisoners, garrisons and parties | ST5, ST6, ST7, ST8, ST11 |
| The order reader | OR1 to OR11 |
| Letters and cards | TX1, TX2, TX3, TX6, TX7, TX8, TX10 |
| The living world | WD1 to WD6 |
| Interface and map | UI1 to UI7 |
| Server and saves | SV1 to SV5 |
| Tests and CI | CI1 (print the seed, and make the soak reproducible) |

## How to fix a finding

1. **Reproduce it** with its Repro line. If you cannot, say so in the issue and move on.
2. **Write the failing test first** (`tests/<group>.test.js`, mock only, deterministic, no network). For a visible bug, a test of
   the cause plus a screenshot.
3. **Fix the cause, not the symptom.** The **Where** pointers are leads. Check the neighbours: if a template is wrong in one
   place it is usually wrong in its siblings.
4. Run the Repro line again, then `npm run check` and `npm test`.
5. Keep the traps in mind: recorded model replies in `tests/fixtures/model/mind/*.json` are keyed by a fingerprint of the options
   a lord may choose, so changing which verbs a lord may pick means updating that key (see how D-105 did it); the order reader
   (`server/orders/parse.js`) is rules code shared by every model, so fix its rules there; engine facts are the only history, so
   a fix to what the player reads must come from the facts, not from new state.

### Guidance on the larger findings

- **ST2, ST3 (tourneys).** A tourney should be an event with days in it: called, guests ride (the engine already sends them),
  the lists run, a champion is chosen **among knights actually present** (at the seat, or arrived with a guest's retinue), then the
  result is told. Use the engine's seeded generator. Keep the facts honest (`tourney`, then `tourney_result` on a later day).
- **ST4 (lords decree on the road).** Decisions are taken at the start of the week and dated at its end; either date them at the
  start or hold the ones that need the lord at home while he is away.
- **WD1 (births and marriages).** Deterministic, conservative, and plausible: married couples of fertile age have children at
  historical-ish rates, the `birth` fact kind already exists in `engine/facts/kinds.js` and `heads.js` and nothing emits it. Keep
  canon characters on their canon paths (Canon gravity); do not give the story's protected people children the story forbids.
  Marriages and betrothals between houses may start as an engine-side process; add order verbs only if the GDD has them. Record
  the rates and the choices in `DECISIONS.md` and ask the owner in the PR body.
- **ST1.** `beatHead` and the `canon_beat` summary in `engine/facts/heads.js` ignore the fact's own `title` and `text`; use them.
  Check every beat in `public/data/beats.js` reads well as a headline and a subtitle.
- **SV1.** Same-origin only: reject POSTs whose `Origin` or `Host` is not the server's own (the owner plays at
  `http://127.0.0.1:3298`), require a JSON content type, add basic security headers, answer `OPTIONS`, return clean JSON errors
  (no internals), and keep the game working from `localhost` and `127.0.0.1`.
- **UI1.** Ignore keys pressed with Cmd, Ctrl or Alt, and clear the held keys on window blur and when the tab hides.
- **OR1 to OR11.** Add the failing phrases from the report as tests next to the existing order tests, and keep every existing
  one green.

## Then hunt for more

When the list is done, or when a group is waiting for CI, hunt. Use `scripts/bughunt/` (sweeps over many houses and long games,
the 290-house run, `probe-corpus` read by eye, the browser probes) and `npm run coherence`, and the **Not yet looked at** list at the
end of the report. Read what the game writes as a player would; the best finds so far came from reading, not from asserts.
Log every new finding in `docs/bughunt/FOUND.md` in the report's format with IDs `N-001`, `N-002`, … and a Repro, fix S1 and S2
findings as you go (new tests first), and batch the S3s. Stop when two full passes over different houses find nothing new at S1
or S2.

## When you finish

Update `docs/BUG-HUNT-2026-10-02.md` so each fixed finding says `FIXED` with its PR number; update the issue; add the
model-only checks to the owner's list in `docs/HANDOFF.md`; and post a closing comment on the issue: what was fixed, what was not
and why, the design questions for the owner, and the new findings you made. The owner will pull the default branch and play it.
