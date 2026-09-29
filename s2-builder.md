First read and obey the COMMON RULES block in docs/AGENT-PLAYBOOK.md §1 (lines 20–53) — absolute. Then CLAUDE.md.

ROLE: BUILDER for work packages R1 → R2 → R3 (in that order) — the State of the Realm's data: figures and the truth series, knowledge-filtered estimates and the view function, the API route. No UI in this slice. You may NOT commit.
Working directory: /home/user/wc-s2 (git worktree, branch wp/r1-r3-realm-data). Work ONLY there.

Read: docs/gdd/19-realm-ledger.md in full (your spec); the failing tests tests/realm-stats.test.js, tests/realm-view.test.js, tests/realm-http.test.js (written from the GDD: read-only to you unless provably wrong — then STOP and report; do not weaken a test).

VERIFIED CODE FACTS (use them; the GDD is stale in places):
- standing(state, id) public/js/shared/standing.js:21 → {lands,might,wealth,sway,blood,order,score,holdings,vassals,swords,gold,kin}; swords = hosts + levies + menAtArms. `state.standing` is set only in closeTurn (server/game.js:499), for the player.
- project(state, id) public/js/shared/economy.js:142 → {own,tribute,vassals,upkeep,household,court,interest,accrues,projects,owed,income,expenses,net,low,high}. FIGURE_FIELDS public/js/shared/world.js:25; realmTotals :371.
- engine/rng.js has no hash32; a private splitmix32 at :14. ADD `export function hash32(...parts)` (pure, strings/numbers → uint32, e.g. FNV-1a over the joined parts then a splitmix finaliser). It must NOT touch any rng state.
- New state fields are added in `migrateState(state)` public/js/shared/world.js:185 (flat idempotent "if missing, add" steps, called by server/game.js loadState :62). Not in engine/state/migrate.js.
- engine/knowledge.js updateKnowledge(state, house, r = random) DRAWS FROM THE ENGINE RNG and runs once per 7-day segment (game.js:404) for the player only. Your observations must use hash32 only — never the rng. Prefer a separate `observe(state, viewer)` in engine/realm/estimate.js, called from server/game.js right after the existing updateKnowledge call (or at closeTurn), rather than changing updateKnowledge.
- server/view.js playerView already rounds foreign figures with about() (2 sig figs); hiddenTruths(state, view) :105. The /realm route returns a plain object (viewOf only touches objects with meta+parties) — realmViewFor itself must be the filter.
- server/index.js route(method, pattern, handler) :33; GET routes like `/api/games/:id/chronicle` (~:113).
- Validation invariants: engine/state/validate.js INVARIANTS (:24) / wellFormed (:117).
- The Lannister mines' secret depletion: engine/economy/ledger.js minesOf — never read it from the viewer's side.
- The hotkey/UI/minds brief/wars momentum/focus are NOT this slice; the JSON keys `wars`, `facts`, `focus` must exist (arrays; `wars` may list known wars minimally), per 19 §7.

FILES YOU MAY TOUCH (and NO others): public/js/engine/realm/figures.js, stats.js, estimate.js, view.js (all new); public/js/engine/rng.js (add hash32 only); public/js/shared/world.js (ONLY migrateState, to add realmStats); server/game.js (closeTurn + new game: sampleRealm; record.realm in the turn record; the observe call; export realmView(id, opts)); public/js/engine/state/validate.js (realmStats well-formed: arrays match fields, no NaN, monotone days); server/index.js (the route); public/js/engine/knowledge.js ONLY if a tiny export is needed (say why).
Another agent is editing public/js/shared/world.js's note()/character op on ANOTHER branch: touch ONLY migrateState there, so git can merge both.

PRINCIPLES (19 §1, §5, §9 — normative): one module computes every figure (figures.js), the view is computed FROM THE VIEWER'S KNOWLEDGE (non-interference: changing another house's hidden truth with no news must not change a byte of the output), no model anywhere, no RNG draw anywhere in engine/realm (hash32 noise only), view functions never mutate state, integers only in samples, deterministic ordering (sort; never rely on object key order for anything that reaches the output), budgets (sampleRealm ≤ 10 ms, realmViewFor ≤ 50 ms on the full scenario).

Order: R1 (figures.js, stats.js, hash32, migrateState, closeTurn/new game, record.realm, validate) → run `node --test tests/realm-stats.test.js` green → R2 (estimate.js, view.js) → `node --test tests/realm-view.test.js` green → R3 (route, game.realmView) → `node --test tests/realm-http.test.js` green. Then run `node --test tests/replay.test.js tests/knowledge.test.js tests/http.test.js tests/facts.test.js tests/jump.test.js tests/soak.test.js` (must stay green: the replay must be byte-identical run-to-run and the RNG stream unchanged) and `npm run check`. Then `node scripts/soak.js --turns 40 --houses stark,lannister --quiet` and paste its summary (invariants, ms/turn, save size).

REPORT FORMAT (max 30 lines):
STATUS: done | partial | blocked
FILES CHANGED: <path — why>
COMMANDS RUN + RESULT: pasted last lines of each
TIMINGS: sampleRealm ms, realmViewFor ms, save size growth at 40 turns
DESIGN NOTES: how observe() decides what the viewer learns; how estimates are blurred; the tiers you implemented
DEVIATIONS FROM GDD (draft DECISIONS text)
NOT DONE / RISKS / TESTS YOU BELIEVE ARE WRONG

ADDENDUM FROM THE LEAD (after the tests were written; these override the file list above where they differ):
- The tests' contract is in each test file's HEADER — read all three headers first. Notably: the first sample is taken inside createInitialState (public/js/shared/world.js) and migrateState adds the series when missing; closeTurn samples after settleWorld and sets record.realm; validate() rejects a bad series; `updateKnowledge` in engine/knowledge.js calls `observe` (with zero dice draws); a spy-learned figure is a fact with data.realm = {house, field, value} learned via K.learn(…, {via:'spy'}) and `learn` must keep the figure in knowledge (the fact leaves state.facts at the turn's end).
- So you MAY edit: public/js/shared/world.js (createInitialState's first sample + migrateState ONLY — another branch edits note() in that file), public/js/engine/knowledge.js (updateKnowledge → observe; learn keeps data.realm figures; nothing else).
- The test-writer left a throwaway reference implementation in /tmp/claude-0/-home-user-A-game-of-thrones-local-game/1a59ec30-8b4e-5558-8c33-823b20aa5156/scratchpad/copy that passes the tests. You may READ it for the contract, but write your own code to the GDD's quality bar (small pure modules, why-comments in the game's voice, deterministic ordering) — do not copy it wholesale.
- Never pipe a test run through `head` (it kills the run and leaks the http test's server).
