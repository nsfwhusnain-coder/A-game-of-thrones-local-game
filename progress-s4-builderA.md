BUILDER A (N3 writer) progress — updated after each step
DONE: public/js/engine/facts/heads.js (ROLES incl. siege entries, ARCHETYPE, LEDE, ctxFor, HEAD/SUM/ALSO/DETAIL for all 126 kinds, TPL/HOOK tables); public/js/engine/facts/headline.js (cardOf, meanwhileOf, roll-ups, fitting) written; server/ai/validate/headline.js now imports+re-exports ROLES from heads.js (rest of the scorer untouched).
NOT YET RUN: tests/writer.test.js has not been run once (files just written, likely syntax/logic bugs).
NEXT STEP: node --test tests/writer.test.js 2>&1 | tail -60 ; fix failures; then write a forms harness (scratchpad) to pin every verb form (cardOf opts.pin) of every kind; then golden variety (>=50 distinct verbs of 71), then print the 6 Stark turns; then node --test tests/headlines.test.js tests/labels.test.js tests/facts.test.js ; npm run check ; node scripts/lint-engine.js.
Cleanup TODO in heads.js: hacky .replace() calls in a few HEAD entries (debt_called, loan_taken, loan_defaulted, released, siege_tick DETAIL ordinal, embarked/camp_fever/men_hired DETAIL duplicates, levies_ok DETAIL key).
Last writer.test.js summary: (not run)
