# progress: s2 leak-audit fixes (worktree /home/user/wc-s2, do not commit)
DONE (all in worktree, uncommitted):
- estimate.js: `readSworn` (steady per-house/figure blur ±4.5 %, ally gold band centre offset by hash ±15 %), est.ally, `learnWars` (per-viewer war notes k.wars from war facts the viewer knows; observe keeps them)
- view.js: sworn series read through `readSworn` (same as cell); warsKnown reads notes via learnWars, never live wars
- server/view.js: playerView `delete k.realm` (own knowledge), realmStats deleted, viewTurn drops realm, hiddenTruths flags both (earlier round)
- validate.js inv 12: FIELDS must equal R.fields (said once), integer cells, sample.turn <= meta.turn, <= KEEP_MAX(48) samples; stats.js exports split (check-syntax wants one export per const)
- tests/realm-http.test.js: 3 extra leak tests (earlier round)
LAST RUN: node --test leaks-r1-r3 realm-stats realm-view realm-http http knowledge => tests 68 pass 67 fail 1; npm run check clean
REMAINING FAIL: leaks test 18 "war ... renamed": needs engine/facts/log.js (NOT on my list) to record name+sides into war facts at emit. Verified in scratchpad/opt2: with the patch all 12 leak tests pass, and facts/replay/war/jump/narrator/canon tests pass. Patch = in emit(), just before `fact.vis = ...`: if kind in [war_declared, war_joined, peace_made] and fact.data?.war and a live war w exists: fact.data = { name: w.name, attackers: [...w.attackers], defenders: [...w.defenders], ...fact.data }.
NEXT STEP: send final report (<=12 lines) to the lead with that patch; ask lead to approve log.js edit (or apply it).
