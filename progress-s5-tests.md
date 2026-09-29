# progress: s5 test-writer (worktree /home/user/wc-s5, branch wp/u1-u3-quiet-screen, nothing committed)

DONE
- tests/hud.test.js (NEW, 34 tests, syntax-checked). Logic tests (vitals, inbox, strip, turnLabel, MENU, routeKey, purity/determinism)
  import public/js/ui/hud.js via pathToFileURL; each fails with a plain sentence while it is missing. Markup/wiring tests read
  public/index.html with a tiny tag scanner and app.js/ui/*.js as text.
- Validated the tests against a scratch REFERENCE rebuild (scratchpad/ref/root: symlinked repo + a reference hud.js + a patched
  index.html/app.js/drawer.js): 33/34 pass; the 1 fail was a true positive (a stale $('#player-banner')). Against the real tree today:
  ~31 fail (hud.js missing, index.html not rebuilt), 3 regression guards pass (skip link, portraits stay, no stale ids).
- scripts/ui-gate.mjs (NEW, syntax-checked, dev-only): port UI_GATE_PORT (default 3496), mock provider, temp WC_SAVES, Stark game,
  turn 0 and turn 5 x 1920/1366; flags --quick --size=1366 --shots --verbose; exit 1 on a gate failure.

NOT DONE
- ui-gate.mjs ran once (quick, 1366): fails as expected; probes were slow (map render loop) -> now stops the loop; rerunning.
  SwiftShader rAF/evaluate slowness under load (other agents' suites ran alongside). I then added step logging (say()), a cheap map
  (localStorage gfx-quality=fast, map-life=0), a bound on the R-timer wait, and 90 s default timeouts; attempts 2-3 never started
  because npm test suites kept running (launcher waits for 20 s of quiet). No "UI-GATE BEFORE" table exists yet.
- The final `node --test tests/hud.test.js` paste against the real tree was last taken before small edits (shared getGame() helper,
  \bnull\b, esc slice); the file syntax-checks but was not re-run.

EXACT NEXT STEP
1. Wait for a quiet box (no node --test, no chrome). 2. `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers UI_GATE_PORT=3496 node scripts/ui-gate.mjs --quick --size=1366 --verbose`
   (watch stderr timestamps; if the first cell still stalls, find which step in measure()/probes() by the say() lines and fix). 3. Then the full run
   (both sizes, turns 0 and 5) for the BEFORE table. 4. `node --test tests/hud.test.js` alone, paste the first failing lines. 5. Final report (25 lines).
   Helper: scratchpad/run-gate.sh <outname> <gate args> (waits for quiet, writes scratchpad/<outname>.txt, timeout 1500 s).

OPEN QUESTIONS FOR THE LEAD (assumptions baked into the tests; the builders need them stated)
- `me` = the player's house id (state.meta.player); vitalsOf(...).value is a plain NUMBER (coin=treasury, men=levies+menAtArms+hosts' men, food=moons rounded to 0.1);
  hover carries the numbers as plain integers ("+6,917 a moon; between +5,500 and +8,000" -> net, low, high of project()).
- Letters = state.ravens with read:false; matters = state.decisions status 'pending'; a "running audience" = state.chats[id] last entry role 'npc' this turn AND
  state.moods[id].turn === state.meta.turn && !closed (ids: raven id, decision id, character id). My reading - confirm.
- stripOf ids are free-form (unique strings); `where` is e.where or falsy; routeKey('f') is untested; realm/people/chronicle sections for r/p/h are not asserted.
- #menu-pop must be a hidden-by-default element in index.html holding data-action music/undo/help/settings; the old data-action="menu" title-screen return moves to another action.
