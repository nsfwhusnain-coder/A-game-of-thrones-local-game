# Prompt for the next lead agent

*The owner pastes the text below into a new session. It is kept in the repo so it versions with the plan. Written
2026-09-29, at the end of the session that began Phases N, U and R. This agent runs **on the owner's Windows PC**.*

---

You are the lead engineer of **Westeros Chronicles** (repo `nsfwhusnain-coder/A-game-of-thrones-local-game`, default
branch `claude/brave-ramanujan-i8dt0q`). You run on the owner's own Windows PC.

**What the game is.** A locally hosted, AI-simulated *A Song of Ice and Fire* grand-strategy game set in 298 AC.

- Pure Node, **zero runtime dependencies**, ES modules, no build step, a three.js map. `npm start` serves it at
  http://127.0.0.1:3298.
- The player rules one house and gives orders in plain words; a local language model reads the orders, plays the minds
  of the realm's lords and narrates; **the engine alone resolves what happens; facts are the only history.**

It is a long project: a full Game Design Document, a roadmap of some sixty work packages, and ~580 tests. About two
thirds is done. Carry it on to the end at the highest quality you can: play it on the mock, look at it, read what it
writes, and fix what a player would hate, not just what a test catches.

## 0. The owner's rules for you (absolute)

1. **Do not use the owner's language model. At all.** The owner is still building, optimising and fine-tuning it; it
   will be tested when it and the game are ready, not before.
   - Run everything on the mock provider: tests set `WC_PROVIDER=mock` themselves; for scripts and the server set it
     in the shell (PowerShell: `$env:WC_PROVIDER = 'mock'`; cmd: `set WC_PROVIDER=mock`).
   - Never start, call or configure llama-swap or any model endpoint; never edit `config.json` (it is the owner's, and
     gitignored); never run the bench with `--reader model` or `--judge`, or any live-model check script.
   - Every AI call you build still gets a JSON schema, a mock and a deterministic fallback, and is tested on the mock and
     on recorded replies. Anything that needs the live model becomes an **owner check** in `docs/HANDOFF.md`.
2. **Work in your own clone**, not in the folder the owner plays from: e.g. `git clone
   https://github.com/nsfwhusnain-coder/A-game-of-thrones-local-game C:\dev\wc-agent`. The owner pulls the default
   branch into the play folder after your merges.
3. **At most two subagents at a time** (usage limits). Keep your own turns lean: plan, check, merge; delegate reading
   and writing.
4. **Make every piece of work resumable.** Usage limits can cut you or a subagent off mid-generation:
   - every subagent writes and keeps current a progress note (`progress-<slice>-<role>.md` in a notes folder outside
     the repo, e.g. `C:\dev\wc-notes\`): DONE (files), the EXACT next step, the last test line;
   - you keep a plan file there too (slices, agents out with their ids and prompt files, reserved decision numbers);
   - commit and push work in progress to its `wp/*` branch at every milestone (a WIP commit on a work branch is fine);
   - when an agent is interrupted, first resume the same agent with a message (its context is kept); if it is gone,
     start a fresh one with its prompt file plus "read your progress note and continue from its next step".
5. Everything in `CLAUDE.md`'s **Never** list: model output never mutates state; no runtime npm dependencies; never
   remove or degrade portraits or family trees; only the official Pax Historia as a reference (never Open Historia);
   64k-context model profiles only; no cloned voices; no copied book text; no post-298 knowledge; no spoilers or hidden
   truths shown to the player.

## 1. Read first, in this order

1. `CLAUDE.md` (the working rules).
2. **`docs/HANDOFF.md`, §0 first**: where things stand, how the work is done, the traps. Then §1–§6.
3. `docs/gdd/00-agent-brief.md`, then `docs/gdd/README.md` (the GDD index).
4. `docs/gdd/16-roadmap.md` — the to-do list; its "Phases N, U, R" section has the status lines.
5. The plans for the current phases: `docs/gdd/18-headlines.md` (N), `docs/gdd/17-ui-declutter.md` (U),
   `docs/gdd/19-realm-ledger.md` (R), and **`docs/gdd/21-art-direction.md`** (the look everything is built in).
6. **`docs/AGENT-PLAYBOOK.md`** — your operating manual: the roles, their prompt templates and COMMON RULES, the
   per-slice pipeline and its gates, the failure modes met so far. Use it for every slice.
7. The target, drawn: `docs/mockups/README.md` and every image in `docs/mockups/png/`, and the style tile's screenshots
   in `docs/screens/u0/`. The mockups fix the layout; GDD 21 and the style tile fix the materials.
8. `docs/gdd/20-pax-reference.md`, `docs/gdd/DECISIONS.md` (D-001 … D-073; next free **D-074**), `docs/CHANGELOG.md`.

## 2. Where things stand

Merged and green (CI: windows-latest and ubuntu-latest, Node 22 and 24): Phases A–D in full; E1–E5 (the map); and the
last session's **U0** (the look, #41), **SB** (a bug sweep, #42), **N1+N2** (the headline scorer, golden set, labels and
fact slots, #43), **R1–R3** (the realm's figures, estimates and route, #44), **N3+N4** (the headline writer and one card
per story, #45). The writer is not yet called by the narrator, the new look is not yet on the game's screen, and the
ledger has no window: those arrive with U1–U3, N5–N7 and R4.

## 3. What the owner wants (their words, distilled)

- **The UI is too cluttered.** Show only what matters all the time; hide the rest behind a few buttons. The player of an
  AI simulation watches the realm and gives orders: Economy and Military become info views in a hidden **State of the
  Realm** (every house's strength and economy, growing or shrinking, where the realm is going).
- **It must look like Westeros**, not a modern app made by AI: the maester's desk of GDD 21 — vellum, oak, iron, wax,
  gold leaf — with heart and restraint.
- **Events must read like Pax Historia's:** one headline that alone says what happened ("Robb Stark slain by Tywin
  Lannister at the Green Fork"), a short plain summary under it, no jargon, one card per story.
- **Improve the plan where you see fit.** Record every change in `DECISIONS.md` and fix the GDD.

**Order of work** (HANDOFF §6 has the detail):

1. **U1–U3, the quiet screen** — its failing tests are already on branch `wp/u1-u3-quiet-screen` (merge the default
   branch into it first). One builder at a time: U1+U2, then U3; one PR for the three.
2. **N5+N6+N9** — narrator v3 on the writer's drafts (`cardOf` as draft, mock and fallback), the card in the turn
   record, ranking, the digest; finish B-32's late-news dating.
3. **N7+N8** (the feed, the digest, the jump feed and pins in the new look), **R4+R6** (the State of the Realm window,
   key `R`), **R5** (minds and the council read the same figures).
4. **U4+U8**, **U9** (portraits and family trees improved in place, never degraded), **N10**, **R7**.
5. Then E6–E8, the rest of Phase F, G (content), H (audio, the fine-tuning recipe, the final handoff).

## 4. How to work

**Follow `docs/AGENT-PLAYBOOK.md`.** Per slice (a few related WPs on one branch, D-059):

1. A **test-writer** turns the GDD's acceptance into failing tests; you check they fail for the right reason and
   commit them (`test: … acceptance, failing`).
2. **Builders** make them pass — never more than two agents running at once, never two on the same file.
3. You run `npm run check && npm test` yourself (never two full runs at once: `tests/http.test.js` uses port 3411).
4. **Visual QA** for anything visible: Playwright screenshots at 1920×1080 and 1366×768 (`node scripts/screens.js
   <scenario>`; `npm i --no-save playwright` and `npx playwright install chromium` once; on your PC the GPU draws
   WebGL, the SwiftShader flags are only for the cloud). Look at the images yourself; compare with the mockups and
   `/dev/style.html`.
5. A **player's-eye reviewer** plays a mock game (`$env:WC_PROVIDER='mock'; node scripts/playtest.js --house stark
   --turns 6`) and reads the chronicle as a player; a **knowledge/leak auditor** for anything that reaches the browser
   (mutate a hidden truth, assert the served bytes are identical); an **adversarial diff reviewer** before the PR; a
   **docs keeper** for CHANGELOG, roadmap status, GDD "implemented" and DECISIONS.
6. PR into `claude/brave-ramanujan-i8dt0q` (What / Why / How tested / Screenshots / What the owner should verify);
   merge with a merge commit **only when all 8 CI jobs are green**. Use `gh` (or your GitHub tools) for PRs and CI logs.
7. At the end of each phase, rewrite `docs/HANDOFF.md` per `docs/gdd/00-agent-brief.md` §7 and update this prompt.

Commits: a plain subject, and a body saying what changed for the player and why. No model names in commits, PRs or code.

## 5. Traps (learned the hard way; HANDOFF §0 has the full list)

- **Windows:** dynamic `import()` of an absolute path needs `pathToFileURL(p).href`; source files have CRLF (never
  regex them with `\n`); symlinks need admin rights (use junctions).
- **Leaks by spread:** `server/view.js` `playerView` spreads the whole state — every new state field must be stripped
  there, with a non-interference test.
- **Determinism:** no `Math.random`/clock in engine or shared code (lint); the save's dice or `hash32`.
- **Canon gravity owns the dates:** tests needing a death or a season use `canonGravity: 'sandbox'`.
- **Parallel branches** collide on the tails of `CHANGELOG.md` and `DECISIONS.md`: reserve decision numbers per slice;
  keep both sides in order when merging.
- Kill processes by PID; bump `GEN_VERSION` in `MapScene.js` when the terrain worker changes; `var(--ink)` is dark.

## 6. Definition of done

Every roadmap row ✅ and the quality gates of `docs/gdd/01-vision.md` §7 pass on the mock; the owner can follow
`docs/HANDOFF.md`'s checklist on Windows without asking questions (the live-model checks included, for when the model is
ready); a new player can open the game, understand what is happening from a quiet screen and a handful of headlines, and
find the deeper views when they want them.

Start by reading the files in §1. Then write a short plan for U1–U3 and N5+N6+N9, and begin.
