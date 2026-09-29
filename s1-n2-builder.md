First read and obey the COMMON RULES block in docs/AGENT-PLAYBOOK.md §1 (lines 20–53) — absolute. Then CLAUDE.md.

ROLE: BUILDER for work package N2 — fact hygiene: labels and slots. You may NOT commit.
Working directory: /home/user/wc-s1 (git worktree, branch wp/n1-n2-headline-foundations). Work ONLY there. Another builder (N1) works in the SAME worktree at the same time on disjoint files — never touch theirs, never run git stash/reset/checkout.

Read: docs/gdd/18-headlines.md §1.2 (root causes 5 and 11), §3.1 (label helpers, slots), §3.3 (roles), §5 row N2; the failing test tests/labels.test.js (written from the GDD: your spec; read-only unless provably wrong — then STOP and report); public/js/engine/facts/{log,kinds}.js; public/data/houses.js (or wherever houses are defined — find it) and characters data.

The REAL emitters (the GDD's list is wrong; verified): battle fact = public/js/shared/battles.js:91 `fact('battle')` (data has winner/loser as PARTY ids, lost, wiped; slain/capture character ops built at :56-57, applied :172); slain_in_battle / captured_in_battle / executed / death-by-op / wedding / betrothal come from `note()` in public/js/shared/world.js (the 'character' op ~:893; cause chosen by regex on ch.cause; data is only {cause}); executed's cause from public/js/engine/actions/court.js:89; natural death = server/turn/day.js `theYears` :37/:50 and public/js/engine/people/life.js :46/:61; call_refused = public/js/engine/military/muster.js:181 (no data today).

New slots to ADD (additive only — existing fields keep their names and values):
- battle → data.winnerHouse, data.loserHouse (house ids), data.how (the decisive factor the battle resolution already computes for the report — e.g. 'charge', 'held', 'ambush', 'night', 'numbers', 'ground'; find where "what decided it" is computed in engine/military/battle.js / shared/battles.js and reuse it).
- slain_in_battle → data.by (character id of the enemy commander of the battle, when known), data.how ('battle'), data.battle (battle fact id or name, if available) — pass these through the character op from battles.js:56 into note().
- captured_in_battle → data.by (captor commander id or captor house).
- executed → data.by (the lord who ordered it).
- death (theYears, life.js) → data.how: 'age' | 'illness' | 'wound' | 'fever' | 'winter' (keep data.cause as it is).
- call_refused → data.why (a short plain reason the engine already knows at that point, else omit), data.liege (house id called by).
- public/js/engine/facts/label.js (new, pure, browser-safe, no node: imports, no Math.random/clock): `houseLabel(state, houseId)` ("House Stark", "the Free Folk", "the Night's Watch", "the Crown", never "House The …", never "… of King's Landing"-style suffixes), `who(state, charId)` (short natural name; bynames per the test), `partyLabel(state, party)` ("the Stark host", never "The Banners of Stark"/"Host of House X"), `roughly(n)` (words only, per the test's table), `list(names)`.

RULES: NO new facts, no removed facts, no change to fact ids, order, count, importance or text (the soak invariant and the replay test depend on it); no new RNG draws; engine code deterministic (lint-engine). Existing tests must stay green.

FILES YOU MAY TOUCH (and NO others): public/js/engine/facts/label.js (new), public/js/shared/battles.js, public/js/shared/world.js, public/js/engine/military/muster.js, server/turn/day.js, public/js/engine/people/life.js, public/js/engine/actions/court.js, and (only if the "what decided it" factor lives there and needs exporting) public/js/engine/military/battle.js.
Files you must NOT touch (the N1 builder owns them now): server/ai/validate/*, public/data/style.js, tests/headlines.test.js, tests/fixtures/headlines/**.

Task: make tests/labels.test.js pass; then run `node --test tests/facts.test.js tests/battle.test.js tests/muster.test.js tests/life.test.js tests/replay.test.js tests/engine.test.js` (must stay green) and `npm run check`.
Done when: green; `git status --short` shows only your files (list only yours).

REPORT FORMAT (max 25 lines):
STATUS: done | partial | blocked
FILES CHANGED: <path — why>
COMMANDS RUN + RESULT: pasted last lines
SLOTS ADDED: kind → fields (one line each), and where `how` for battles comes from
DEVIATIONS FROM GDD (draft DECISIONS text)
NOT DONE / RISKS / TESTS YOU BELIEVE ARE WRONG
