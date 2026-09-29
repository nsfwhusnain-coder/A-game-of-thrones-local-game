First read and obey the COMMON RULES block in docs/AGENT-PLAYBOOK.md §1 (lines 20–53) — absolute. Then CLAUDE.md.

ROLE: TEST-WRITER for Slice 2 = work packages R1 (figures + truth series), R2 (knowledge-filtered estimates + the view function), R3 (the API route) — docs/gdd/19-realm-ledger.md.
Working directory: /home/user/wc-s2. Branch wp/r1-r3-realm-data is checked out; do not switch, do not commit.

Read: docs/gdd/19-realm-ledger.md in full (it is the spec; §11's acceptance column is your checklist, one test per sentence), docs/gdd/09-living-world.md §7 (knowledge), docs/gdd/03-architecture.md §14 invariants 9–10, docs/gdd/15-qa-tooling.md §1–§4. Conventions: tests/knowledge.test.js, tests/http.test.js (for the route test: how it boots the server and calls routes), tests/replay.test.js (determinism), tests/facts.test.js (undo).
Code to read (do not edit): public/js/shared/standing.js, public/js/shared/economy.js (project), public/js/shared/world.js (FIGURE_FIELDS, realmTotals), public/js/engine/rng.js, public/js/engine/knowledge.js, public/js/engine/state/migrate.js and validate.js, server/game.js (closeTurn, newGame, undo), server/index.js (route), server/view.js (playerView, hiddenTruths).

LEAD'S DECISIONS:
- Module layout exactly as 19 §2 M3: public/js/engine/realm/figures.js (`figuresOf(state, house)`), public/js/engine/realm/stats.js (`sampleRealm(state)`, `thin(samples)`, `seriesOf(state, house, field)`), public/js/engine/realm/estimate.js (`observe(state, viewer)`, `estimateOf(state, viewer, subject)`), public/js/engine/realm/view.js (`realmViewFor(state, viewer, opts)`, `direction(seriesNow, seriesThen)`); `hash32` exported from public/js/engine/rng.js; server/game.js exports `realmView(id, opts)`; route GET /api/games/:id/realm.
- Field list and sample shape exactly as 19 §3.1 (`state.realmStats = { v:1, fields:[…15], samples:[{day, turn, h:{house:[ints]}}], wars:{} }`).
- The hotkey/UI are NOT in this slice (R4). The minds brief is NOT in this slice (R5). Wars block, momentum and `focus` are R6 — but the view's JSON must already have `wars`, `facts`, `focus` keys (possibly empty arrays) so the shape is stable: assert the keys exist, not their content.
- Tests must be fast (< 20 s each). For "30 turns of the mock jump" use the real server/game.js advance on WC_PROVIDER=mock if it takes < 20 s; otherwise drive `sampleRealm` directly over a state whose day you advance with the engine's own time helpers, and say which you chose.

FILES YOU MAY TOUCH (nothing else): tests/realm-stats.test.js, tests/realm-view.test.js, tests/realm-http.test.js (all new), tests/fixtures/realm/** (new, only if needed).

Write, one test per acceptance sentence of 19 §11 rows R1, R2, R3, named in the GDD's words:
- realm-stats (R1 1–8): a sample exists after createInitialState/newGame; own `power` equals `state.standing.score` exactly after a turn; `swords` equals `standing().swords`; spacing ≥ 7 days, ≤ 48 samples, newest 16 kept; determinism (two runs of one seed → byte-identical realmStats); undo restores the series; old-save migration adds an empty/first-sample series without changing any other field (use the existing v2 fixture save in tests/fixtures/saves/ if migrate handles it, or a state with realmStats deleted); the engine RNG stream is unchanged with the feature (find how rng exposes a draw counter or state; compare after N turns with and without the sample call — if there is no counter, compare the rng state object).
- realm-view (R2 1–10): the NON-INTERFERENCE test (snapshot realmViewFor(state,'stark'); set another house's treasury/levies/debts/the Lannister mine/a war score to absurd values with no news reaching Stark; assert JSON.stringify identical); own row exact and sworn `~` within ±5 %, others `~`/`≈`/`—` and never a bare number for others (walk every cell); a seen host raises `swords` with `≥` and the report's age; a spy/learned fact teaching a treasury shows a dated `~` number, without it gold is a word; rank ties when bands overlap; `direction()` table (growing ≥ +4 %, shrinking ≤ −4 %, floor keeps tiny bases quiet; hysteresis two turns; `seems` when only reported); noise stable (two calls, and save→load→call, identical bytes); the mine depletion cannot change output; ≤ 50 ms; no key named minds|goals|secret|schedule|beat anywhere in the JSON (recursive key walk).
- realm-http (R3): 200 with the §7 response keys (asOf, window, lens, scope, realm, you, rows, wars, facts, focus, detail) on a new game; `?house=<unknown or never-met>` → `detail.unknown === true`; `?viewer=lannister` is ignored (same body as without it); read-only (state file byte-identical before/after); works on a save with no realmStats.

Run each file: they must FAIL for the right reason (missing modules/route), not typos. Paste the first failing line of each.

REPORT FORMAT (max 25 lines):
TESTS WRITTEN: <file: N tests> — names
EXPECTED FAILURE REASON: pasted
CHOICES YOU MADE (e.g. how the 30-turn test is driven, how RNG draws are compared)
GDD SENTENCES NOT TESTABLE ON THE MOCK
MODULE PATHS/EXPORTS THE BUILDER MUST CREATE
