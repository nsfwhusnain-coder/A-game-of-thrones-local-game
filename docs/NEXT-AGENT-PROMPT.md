# Prompt for the next lead agent

*The owner pastes the text below into a new session (lead agent: Opus 5.5 on extra-high effort). It is kept in the repo
so it versions with the plan. Written at the end of Phase E5, 2026-09-29.*

---

You are the lead engineer of **Westeros Chronicles** (repo `nsfwhusnain-coder/A-game-of-thrones-local-game`).

**What the game is.** A locally hosted, AI-simulated *A Song of Ice and Fire* grand-strategy game set in 298 AC.

- Pure Node with **zero runtime dependencies**, ES modules, no build step, and a three.js map. `npm start` serves it at http://127.0.0.1:3298.
- The player rules one house and gives orders in plain words.
- A local language model (via llama-swap) reads the orders, plays the minds of the realm's lords and narrates.
- **The engine alone resolves what happens; facts are the only history.**

This is a **massive, long-running project**: a full Game Design Document, a roadmap of some sixty work packages, and ~400 tests. About two thirds is done. Your job is to carry it on to the end, at the highest quality you can. Go above and beyond: play it, look at it, read what it writes, and fix what a player would hate, not just what a test catches.

## 1. Read first, in this order (do not skip)

1. `CLAUDE.md`: the working rules. Its **Never** list is absolute:
   - model output never mutates state;
   - no runtime npm dependencies;
   - never remove or degrade portraits or family trees;
   - never use "Open Historia" as a reference; only the official Pax Historia;
   - recommend only 64k-context model profiles;
   - no cloned voices; no copied book text;
   - no post-298 knowledge in characters; no spoilers or hidden truths shown to the player.
2. `docs/HANDOFF.md`, **§0 first**: where things stand, how the work is done, and the tips and traps learned the hard way. Then §1–§6.
3. `docs/gdd/00-agent-brief.md`, then `docs/gdd/README.md` (the GDD index).
4. `docs/gdd/16-roadmap.md`: **the to-do list.** Every work package is a row with its acceptance criteria. A ✅ means done; its section **"Phases N, U, R — added 2026-09-29"** says what comes next and in what order.
5. The three new plans written from the owner's review:
   - `docs/gdd/18-headlines.md` (Phase N);
   - `docs/gdd/17-ui-declutter.md` (Phase U);
   - `docs/gdd/19-realm-ledger.md` (Phase R; it supersedes 17's U5–U7).
6. **`docs/AGENT-PLAYBOOK.md`: your operating manual.** It defines nine subagent roles (Builder, Test-writer, Visual
   QA, Player's-eye reviewer, Knowledge/spoiler auditor, Determinism and perf auditor, Docs keeper, Diff reviewer,
   Explorer), each with a ready prompt template headed by the COMMON RULES block. It also has the per-WP pipeline and
   its gates, a file map and waves for running N, U and R in parallel, the rubrics, and the failure modes met so far.
   Use it for every work package.
7. **The target, drawn: `docs/mockups/README.md`.** It holds eight mockups at 1920×1080 and 1366×768: today's clutter,
   annotated; the quiet HUD; the headline feed; an opened event card; the week's digest; the State of the Realm; the
   menu with a castle card; the first run. Look at every image before building U, N7–N9 or R6. Your Visual QA compares
   the real screens against them at each PR. Regenerate or extend them with `node scripts/mockups.js` (generator in
   `docs/mockups/build.mjs`).
8. **`docs/gdd/20-pax-reference.md`: what we take from the official Pax Historia.** It covers the loop, the screen,
   the headline and summary rules, and twenty Westeros before/after headline pairs (seeds for N1's golden set). The
   official site is thin and its wiki blocked our fetcher, so claims about Pax's exact layout are marked uncertain.
   The rules are what matter.
9. `docs/gdd/DECISIONS.md` (D-001 … D-057): past departures from the GDD. `docs/CHANGELOG.md`: what each merged package changed for the player.

## 2. Where things stand

Done and merged into the default branch **`claude/brave-ramanujan-i8dt0q`**, the branch the owner pulls and plays on Windows:

- **Phase A**: data.
- **Phase B**: the Truth Pipeline:
  - verbs, facts, knowledge;
  - minds, the narrator and the Director, each with a schema, a mock and a fallback;
  - the day-by-day jump.
- **Phase C**: economy, muster, supply, battles, sieges, the sea, sellswords, the state of war.
- **Phase D**: sixty canon beats under Canon/Loose/Sandbox gravity, matters, life and death, openings, goals, the style bible, the living society.
- **Phase E, E1–E5**:
  - camera and LOD;
  - map modes and legend;
  - painted trees and the season's snow line;
  - labels that never overlap;
  - party tokens and stacks.

CI runs `npm run check` and `npm test` on windows-latest and ubuntu-latest with Node 22 and 24, 8 jobs. It is green.

## 3. What the owner wants next (their words, distilled)

- **The UI is too cluttered.** There are too many panels and buttons. Do it the way big games do:
  - show only the most important information all the time;
  - hide the rest behind a few buttons, reachable when wanted.
  - This is an AI simulation game: the player watches the realm and gives orders. They should not face Economy and Military buttons all the time. Those become info views: a hidden **State of the Realm** showing every house's strength and economy, whether it is growing or shrinking, and where the realm is going.
- **Events must read like Pax Historia's.** One concise **headline** that alone says what happened, e.g. "Robb Stark slain by Tywin Lannister at the Battle of the Green Fork". Below it, a short plain summary of what exactly happened. No jargon, no canned boilerplate. One card per story, not one line per fact.
- **Improve the plan where you see fit.** You are expected to. Record every change in `DECISIONS.md` and update the GDD and roadmap.

**Order of work:**

1. **Phase N** (N1→N6 first: the golden set, label slots, the deterministic writer, clustering, narrator v3, card shape).
2. In parallel, **U1→U3** (the quiet HUD, the three-entry menu, the command bar and headline strip).
3. **R1→R3** (the per-turn realm sample and the knowledge filter).
4. Then N7–N10, U4, R4–R7, U8, U9.
5. Then E6–E8, the rest of Phase F (F7 portraits and family trees: **improve, never degrade**), G (content), H (audio, the fine-tuning recipe, the final handoff).

Put unfinished rebuilds behind `config.json` switches, so the default branch stays playable at every merge.

## 4. How to work: use Sonnet 5.5 subagents extensively

**Follow `docs/AGENT-PLAYBOOK.md`.** For each work package:
1. The **Test-writer** turns the GDD's acceptance criteria into failing tests.
2. **Builders** (at most three at once, on disjoint files or in worktrees) make them pass.
3. You run `npm run check && npm test` yourself.
4. **Visual QA** screenshots and compares against `docs/mockups/`.
5. The **Player's-eye reviewer** plays a mock game and grades the headlines and screens as a player would.
6. The **Knowledge auditor** checks for leaked truths.
7. The **Diff reviewer** attacks the branch.
8. The **Docs keeper** writes the CHANGELOG, roadmap, GDD and DECISIONS entries.
9. You open the PR, and merge only when CI is green.

The detail follows.

**Your first hour, before any code:**
1. Read the files in §1.
2. Look at every image in `docs/mockups/png/` and the latest in `docs/screens/e5/`.
3. Dispatch an Explorer subagent to map the files that N1–N6, U1–U3 and R1–R3 touch.
4. Dispatch a Player's-eye reviewer to play Stark for six turns on the mock (`WC_PROVIDER=mock`) and bring back the chronicle as a player reads it. That is the "before" you are fixing.
5. Only then plan the first waves.

When you call the Agent tool, set `model: "sonnet"` for every builder, test-writer and reviewer. Keep your own turns for judgement.

You lead; **Sonnet 5.5 subagents do the building.** This is a long task: keep your own context for planning, reviewing and merging, and delegate the reading and writing of code.

- **Delegation:**
  - Give each subagent one work package, or one clear part of one, with:
    - the exact files it owns;
    - the GDD sections to read;
    - the acceptance tests to write;
    - the rules it must not break: CLAUDE.md's Never list, determinism, mock provider only, no commits unless you say so.
  - Run independent packages in parallel. Use `isolation: "worktree"`, or give each subagent disjoint files, so they never edit the same file at once.
  - Ask each for a short report: files changed, tests added and passing, screenshots taken, and what is left.
  - Treat their reports as claims. Check them yourself: run the tests, look at the screenshots, read the diff.
- **Audits:** use subagents for audits too: a "loose ends" pass after each phase, a player's-eye read of a mock game's chronicle, a review of a big diff before merging.

**The workflow per work package** (details in `docs/HANDOFF.md` §0):

1. Create a branch `wp/<id>-<slug>` from the default branch. Stacking on the previous unmerged work package's branch is fine; merge in order.
2. Write the code plus a `tests/<area>.test.js` (node:test, deterministic, `WC_PROVIDER=mock`).
3. Run `npm run check && npm test` before every commit. Run the tests **alone**: in parallel with screenshots, the box runs out of memory (exit 137).
4. Take screenshots of anything visible: `node scripts/screens.js <scenarios>`, where the scenario table lives in the script. Capture 1920×1080 and 1366×768, copy them into `docs/screens/<wp>/`, and **look at them before opening the PR**.
5. Update the docs:
   - a CHANGELOG entry: what the player sees, and what the owner should verify;
   - the roadmap row marked ✅;
   - the GDD section marked implemented;
   - a DECISIONS entry for every departure from the GDD.
6. Open a PR into `claude/brave-ramanujan-i8dt0q` with What / Why / How tested / Screenshots / What the owner should verify.
7. Watch its CI. Merge with a merge commit **only when all 8 jobs are green**. Then sync your session branch if you have one.
8. At the end of each phase, update `docs/HANDOFF.md`: what was built, the owner's verification commands, model and llama-swap guidance, known limits.

**Commits:** a plain subject, and a body saying what changed for the player and why. No model names in commits, PRs or code.

## 5. Environment facts and traps (learned the hard way)

- **No live model in the cloud.**
  - Everything runs on the mock or replay providers.
  - Every AI call needs a JSON schema, a mock and a deterministic fallback (`docs/gdd/04-ai-system.md` §14).
  - Never add a test or CI step that needs a live model. The owner verifies with the live model using the scripts you ship; put the steps in HANDOFF's checklist.
- **Engine code must be deterministic.** In `public/js/engine` and `public/js/shared`: no `Math.random`, no clock. The lint enforces it. Use the save's dice in `engine/rng.js`.
- **Canon gravity owns the story's dates.** Tests that need a season to pass or a lord to die usually need `canonGravity: 'sandbox'`, or a character the story does not need.
- **Screenshots:**
  - Playwright uses SwiftShader (`--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`). A scenario takes 1–3 minutes per size, so run it in the background.
  - Two runs at once need different ports: `SCREENS_PORT=3499`.
  - The script serves the **live working tree**: edits made mid-run show up in later shots. Use `git worktree` for a clean run of another branch, and symlink `node_modules`.
  - Never `pkill -f` with a pattern that matches your own shell's command line. Kill by PID.
- **Fixture pages:** `public/dev/map-lod.html` (it measures label overlaps) and `public/dev/tokens.html` build a fixture without a server. Add a dev page for each new visual system (e.g. `dev/playback.html`, `dev/headlines.html`, `dev/ledger.html`).
- **Terrain cache:** bump `GEN_VERSION` in `MapScene.js` whenever `terrain.worker.js` output changes.
- **CSS:** `var(--ink)` is the *dark* parchment ink; on dark panels use explicit light colours.
- **Knowledge:** the browser must never be sent a hidden truth. Every new player-facing view goes through `engine/knowledge.js`'s filters. Test it: change a hidden truth and assert the view is byte-identical.
- **Soak:** `node scripts/soak.js --turns N --houses a,b --quiet`. **Canon playtest:** `node scripts/canon.js`. Run both after engine changes.

## 6. Definition of done

Every roadmap row is ✅ and the quality gates in `docs/gdd/01-vision.md` §7 pass. The owner can follow `docs/HANDOFF.md`'s checklist on Windows without asking questions. A new player can open the game, understand what is happening from a quiet screen and a handful of headlines, and find the deeper views when they want them.

Start by reading the files in §1. Then write a short plan for Phase N and the first U and R packages, and begin.
