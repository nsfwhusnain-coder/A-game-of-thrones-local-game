First read and obey the COMMON RULES block in docs/AGENT-PLAYBOOK.md §1 (lines 20–53) — absolute. Then CLAUDE.md.

ROLE: BUILDER for work package N1 — the headline scorer (golden set + scoreCard). You may NOT commit.
Working directory: /home/user/wc-s1 (git worktree, branch wp/n1-n2-headline-foundations). Work ONLY there. Another builder (N2) works in the SAME worktree at the same time on disjoint files — never touch theirs, never run git stash/reset/checkout.

Read: docs/gdd/18-headlines.md §1.2, §2.2–2.3, §3.2 (validator), §3.3 (roles), §5 row N1, §5.1–5.2; docs/gdd/20-pax-reference.md §5; the failing tests tests/headlines.test.js and fixtures tests/fixtures/headlines/{golden,bad}.json (written by the test-writer from the GDD: they are your spec; read-only to you unless provably wrong — then STOP and report, do not "fix" a test to pass); server/ai/validate/narration.js (reuse its helpers: namesIn, numbersIn, sentencesOf, storyWorld, GAME_WORDS; tablesFor is private today); public/data/style.js; public/js/engine/facts/kinds.js.

LEAD'S DECISIONS (binding):
- Tense (D-058): news-headline present ("Lady Hornwood refuses Stark's summons") or a bare passive participle when the patient is the news ("Robb Stark slain by Tywin Lannister at the Green Fork"). The rule is `verb` (not `past`): the headline contains a finite verb or participle from HEADLINE_VERBS (a lexicon you create in style.js: present 3rd-person, past and participle forms of the verbs the game's facts need — march, ride, call, answer, refuse, raise, gather, slay/slain, take/taken, capture, fall, die, wed, crown, win, lose, besiege, sack, burn, flee, reach, cross, join, desert, hire, open, hold, hang, execute, betroth, sail, land, raid, sign, swear, break, declare, sue, yield, return, arrive, leave, send, receive, bring, found, build, harvest, starve, sicken, wound, ... — be generous) or matches a conservative morphological fallback you document. A bare noun phrase fails.
- BOILERPLATE and JARGON are NEW, SEPARATE exports in public/data/style.js; do NOT add them to FORBIDDEN (GAME_WORDS built from FORBIDDEN is also used by the audience, consolidate and council validators — they must not change).
- Also export from style.js: HEADLINE_MAX_WORDS = 12, HEADLINE_MAX_CHARS = 80, SUMMARY_MAX_CHARS = 340, HEADLINE_VERBS.
- Do NOT change the existing HEADLINE string, EXAMPLES, instructionsFor, or anything the narrate prompt snapshot reads (tests/__snapshots__/prompts/narrate.txt must stay byte-identical: N5 changes the prompt later).

FILES YOU MAY TOUCH (and NO others):
- server/ai/validate/headline.js (new): `export function scoreCard(card, story, state) → { pass, faults: [ruleName…], detail: [{rule, text}] }` implementing the rules of 18 §5.2 (len, who, invented, verb, numbers, punct, boiler, roles, dup, outcome, plus script, anachronism, maturity by reusing narration.js helpers). ROLES table per 18 §3.3 lives here for now (N3 will move it to engine/facts/heads.js and import it back — keep it a plain exported object `ROLES`). Pure, deterministic, no I/O.
- server/ai/validate/narration.js: ONLY add `export` to `tablesFor` (and any other helper you need exported). No behaviour change.
- public/data/style.js: add the exports above; nothing else changes.
Files you must NOT touch (the N2 builder owns them now): public/js/engine/facts/label.js, shared/battles.js, shared/world.js, engine/military/muster.js, server/turn/day.js, engine/people/life.js, engine/actions/court.js, tests/labels.test.js.

Task: make tests/headlines.test.js pass. Work in small steps: `node --test tests/headlines.test.js` after each. When green, also run `node --test tests/style.test.js tests/narrator.test.js tests/ai-contract.test.js` (must stay green — you changed style.js and narration.js) and `npm run check`.
Done when: those green; `git status --short` shows only your files (and the N2 builder's — list only yours in the report).

REPORT FORMAT (max 25 lines):
STATUS: done | partial | blocked
FILES CHANGED: <path — why>
COMMANDS RUN + RESULT: <command → pass/fail count, last line pasted>
RULE DESIGN: one line per rule on how it decides (so the lead can judge false positives)
DEVIATIONS FROM GDD (draft DECISIONS text)
NOT DONE / RISKS / TESTS YOU BELIEVE ARE WRONG
