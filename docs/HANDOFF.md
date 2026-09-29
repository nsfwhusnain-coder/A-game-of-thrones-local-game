# Handoff — end of E1–E5 (the map), and the plan for what comes next

*Written 2026-09-29 (Phase B's handoff, updated at the ends of Phases C and D and now at E5). The plan is the Game
Design Document in [`docs/gdd/`](gdd/README.md); the order of work is [`16-roadmap.md`](gdd/16-roadmap.md) — **read its
"Phases N, U, R" section first: that is what comes next**; design departures are in
[`DECISIONS.md`](gdd/DECISIONS.md); what changed for the player, WP by WP, is in [`CHANGELOG.md`](CHANGELOG.md).*

## 0. Where things stand (for the next agent)

- **Done and merged** into `claude/brave-ramanujan-i8dt0q` (the branch the owner pulls and plays; CI green on
  windows-latest and ubuntu-latest, Node 22 and 24): Phases A, B, C, D in full; Phase E's **E1–E5** (camera and LOD,
  map modes and legend, painted trees and the snow line, labels without overlaps and B-31, party tokens and stacks).
- **Not started:** E6–E8, F1–F9, G1–G5, H1–H5, and the three new plans from the owner's review:
  **N** (Pax-style headlines, [18](gdd/18-headlines.md)), **U** (declutter the interface, [17](gdd/17-ui-declutter.md)),
  **R** (the State of the Realm ledger, [19](gdd/19-realm-ledger.md)). **Do N, U and R next**, in the order the
  roadmap gives; Phase F is re-cut by U.
- **The prompt for the next lead agent** is [`NEXT-AGENT-PROMPT.md`](NEXT-AGENT-PROMPT.md).
- **How to run the work with subagents:** [`AGENT-PLAYBOOK.md`](AGENT-PLAYBOOK.md). **What to build, drawn:** [`mockups/`](mockups/README.md). **What we take from Pax Historia:** [`gdd/20-pax-reference.md`](gdd/20-pax-reference.md).
- **The to-do list is the roadmap**: every work package is a row in [`16-roadmap.md`](gdd/16-roadmap.md) with its
  acceptance; a row is done when it carries "✅" and a CHANGELOG entry. Nothing else is tracked elsewhere.

### How the work has been done (keep doing it this way)

- **One branch per work package** (`wp/<id>-<slug>`), a PR into `claude/brave-ramanujan-i8dt0q` with What / Why /
  How tested / Screenshots / What the owner should verify, merged with a merge commit only when all 8 CI jobs are green.
  Stacking a WP's branch on the previous WP's unmerged branch is fine (say so in the PR); merge in order.
- **Per WP:** code + a `tests/<area>.test.js` (node:test, deterministic, mock provider) + a CHANGELOG entry (what the
  player sees, and what the owner should verify) + the roadmap row marked ✅ + the GDD section marked implemented +
  a `DECISIONS.md` entry (D-0NN) for every departure from the GDD. `npm run check && npm test` before every commit.
- **Screenshots** for anything visible: `node scripts/screens.js <scenario…>` (Playwright + SwiftShader; scenarios are
  a table in the script — add yours), copied into `docs/screens/<wp>/`, both 1920×1080 and 1366×768, and *look at them*
  before opening the PR. Dev pages that build a fixture without a server are the fastest way to show one thing:
  `public/dev/map-lod.html` (`?spot=&lod=&season=&days=&dist=&boxes=1`, and it measures label overlaps) and
  `public/dev/tokens.html` (`?lod=&fan=1`).

### Tips and traps learned the hard way

- **SwiftShader is slow**: a screenshot scenario takes 1–3 minutes per size. Run screenshots in the background, and
  **never run `npm test` at the same time** (the box has been OOM-killed, exit 137). Two screenshot runs at once need
  different ports: `SCREENS_PORT=3499 node scripts/screens.js …`.
- `scripts/screens.js` serves the *working tree live*: if you edit files while it runs, later shots pick up your edits.
  For a clean run of another branch, use `git worktree add` (and symlink `node_modules`).
- **Never `pkill -f scripts/screens.js`** from a shell whose own command line contains that string — it kills itself.
  Kill by PID.
- The game's opening flight to your seat can land after a scenario's camera move: set `map.target`/`map.dist`
  directly and call `map.updateCamera()` (see the `mode-*` scenarios).
- `var(--ink)` is the *dark* parchment ink; on dark panels use explicit light colours.
- The terrain is cached in IndexedDB by `GEN_VERSION` in `MapScene.js`: bump it when `terrain.worker.js` output changes.
- Engine code (`public/js/engine`, `shared`) must be deterministic: no `Math.random`, no clock (the lint enforces it);
  use the save's dice (`engine/rng.js`).
- Under Canon gravity the beats own the story's dates; a test that needs "a season to pass" or "a lord to die" usually
  needs `canonGravity: 'sandbox'` or a character the story does not need.
- **Model output never mutates state.** Every model call has a JSON schema, a mock and a deterministic fallback, and is
  tested on the mock and on recorded replies; no test may need a live model (the cloud has none).

## 1. What was built

All merged into `claude/brave-ramanujan-i8dt0q` with CI green on windows-latest and ubuntu-latest, Node 22 and 24.

| WP | PR | What changed for the player |
|---|---|---|
| A (finish) | #3 | Islands need ships; every character has a sex and a nature; canon threads in the books' order. |
| B1 | #4 | The save's own dice: a turn replays byte for byte. |
| B5 | #5 | Every model call constrained by a JSON schema, checked, and never fatal; Settings → *Test connection* reports schema support. |
| B2 | #6 | Everything that moves is a party and walks real roads; the map draws the engine's routes. |
| B3 | #7 | Facts are the history; turn records in `turns/`; undo goes back ten turns (not in ironman). |
| B4 | #8 | Every action is a verb with a receipt. |
| B6 | #9 | Orders are read as you write them, each with a receipt (✓ / ⚠ / ✗) or a question with answer chips. |
| B7 | #10 | The lords of the realm think for themselves each week (minds), in character, from what their house knows. |
| B8 | #11 | The chronicle is told from the facts by a narrator and checked against them; a wrong story is retold or left plain. |
| B9 | #12 | Every house knows only what has reached it; news travels; the browser is never sent a hidden truth. |
| B10 | #13 | A lord's word binds (promises are kept or broken); letters are real and fly; officers know the truth; the council advises. |
| B11 | #14 | The days are lived one by one and told a week at a time, streamed to the screen; *Stop the days here*, and *Stop the last turn sooner* in the undo window. The old five-agent council is gone. |
| B12 | #15 | A Director: some eighty grounded beginnings (a hedge knight, a septon, outlaws, a wreck, a fever…), many as matters for your word; no week passes with nothing of note. |
| B13 | #16 | Lords remember what their house knows (relevant memory); the chronicle is consolidated from the facts, and its open threads must name real things. |
| C2 | #17 | The banners come as lords would bring them: raven, deliberation, gathering at home, the march; the host card shows who is present, on the road (with the day) and expected; *Wait for the banners*. **Milestone 1.** |
| C1a | #18 | Gold means something: the realm as populous as the books, incomes by rents, trade and mines, the Crown's debts, war costing what war costs (`npm run balance`). |
| C1b | #19 | Lenders (the Iron Bank, the Faith, the Tyroshi, the Bank of Oldtown), loans, calls and default; buy grain, bribe, embargo, pay a ransom. |
| C3 | #20 | Supply: rations in days, fed at home, foraging abroad, the land laid waste — the second passage starves; camp fever; the seasons slow the march. |
| C4 | #21 | Battles by stance, standing orders, arms and ground, surprise; routs and bloody draws; lords slain, taken or wounded (the story keeps its own); the record says what decided it. |
| C5 | #22 | Sieges: the great castles' rules (Storm's End fed by sea, the Eyrie by the high road, Riverrun's camps…), terms, storms, treachery, relief. |
| C6 | #23 | The sea: ships by kind; fleets carry hosts (*Go aboard*, *Put them ashore*); blockades; the ironborn reave the coasts; sea fights and storms. |
| C7 | #24 | Free companies by contract (they desert unpaid, the turncoats go over); outlaw bands; the Watch's recruits; the Dothraki refuse the poison water. |
| C8 | #25 | The state of war: goals, the score, cold wars, *Sue for peace* (white peace, concede, demand), the beaten side's offer. **Phase C done.** |
| D1 | #26 | The beat engine: windows, triggers, alternates and lapses; canon locks; *Canon / Loose / Sandbox* on the begin screen. |
| D2 | #27 | Sixty canon beats; the chain made to hold (Q9: 58–60 of 60 in two years for three houses far from the war). |
| D3 | #28 | Sixty-two kinds of matter from the catalogue; no invented matters (B-28). |
| D4 | #29 | Wounds heal or fester, fevers and winter; the story's people are not taken by chance under Canon (invariant 11); canon regents (B-23). |
| D5 | #30 | An opening for every house (27 by hand), with its levers; the council hears the news of the first moons. |
| D6 | #31 | A hundred goals; ways for every great and major house; lords work at what they want. |
| D7 | #32 | The style bible as data; *Book content / Restrained*; examples of other houses; anachronisms keyed to the beats. |
| D8 | #33 | Lords ride out every moon (feasts, weddings, tourneys, pilgrimages, the King's passing) with kin, stay as guests, come home; the calendar and the small council. **Phase D done.** |
| E1 | #34 | The camera frames Westeros and the Narrow Sea; never into the trees; smooth cursor zoom; Home and F. |
| E2 | #35 | Map modes that read: Diplomacy (war, hostile, neutral, friendly, allied, your realm hatched), Knowledge, War; a key for each. |
| E3 | #36 | Painted trees (pines, broadleaves, weirwoods) that sway; a palette by region; the snow line of the season, frozen rivers. |
| E4 | #37 | Names never drawn over one another (placed by priority, at most 120); halos; tooltips that let go (B-31). |
| E5 | #38 | A token and plate for every kind of party; the King's progress seen from L0; "3 hosts · 7,400" stacks that fan out; routes and ETAs for your own parties. |

## 2. What CI verifies, and what you should verify

CI (`.github/workflows/ci.yml`) runs `npm run check` and `npm test` (≈ 400 tests, among them the two-year canon playtest Q9 for Hightower: engine, verbs, facts, knowledge,
minds, narrator, audiences, the jump, the Director, memory, the HTTP API end to end, and the contract of every model
call on the mock and on recorded replies). A nightly soak plays 200 turns × 6 houses and checks the invariants every turn (and at least five lords' journeys a moon); a nightly canon playtest (`node scripts/canon.js`) plays three houses for 24 moons.

**Your checklist** (each one command; what to look for):

1. `git pull` then `npm start` on Windows → the title screen loads at http://127.0.0.1:3298.
2. Settings → *Endpoint URL* `http://127.0.0.1:8033/v1` (llama-swap), model `gemma4-26b-a4b`, context window 65536 →
   *Test connection* says **JSON schema enforced: yes** and **"The Wall" understood as Castle Black: yes**.
3. `npm run bench -- --suite interpret --reader model` and `npm run bench -- --suite mind` and
   `npm run bench -- --suite narrate --judge` → paste the `bench/<date>.md` reports into an issue. The gates: interpret
   exact-action ≥ 95 %, mind in-character ≥ 85 %, narrate: no invented arrivals.
4. `npm run playtest -- --house stark --turns 12` and `npm run playtest -- --house blackwood --turns 12` → paste the
   reports from `playtest/`.
5. A 20-minute play as Stark: call the banners; end a turn that runs over a week and watch the first week's news
   appear while the next is lived; press *Stop the days here* once; hold an audience with Roose Bolton and ask for his
   men at Moat Cailin within the fortnight; write to Riverrun; after the King arrives, open ↶ and try *Stop the last
   turn sooner*; read the Chronicle (h) after two moons. The map, the numbers and the chronicle should agree.
6. A 20-minute war as Lannister (Phase C): declare war on the Tullys; raise 15,000 at the Rock; on the host's card set
   *Always engage* and read its rations; march on Wayfarer's Rest; read the battle's record (what decided it); when the
   siege begins open the castle and *Offer terms*; open Military and hire the Golden Company; open Diplomacy and see the
   war's score move; *Sue for peace*.
7. `npm run balance` → "the economy is in balance".
8. The story (Phase D): `node scripts/canon.js` (≈ 3 minutes a house) → "Q9 passes". Start as Hightower on *Canon story*
   and jump a year: the ravens bring the books' news in order, autumn is declared in 299. Start as Stark on *Loose
   canon*: the King does not come to Winterfell, but his death and the war still do. On the begin screen pick Manderly
   and Glover and read their openings; open a holding with guests (a feast or a tourney) and see them listed.
9. If the bench gates fail: see §4.

## 3. Model guidance

- **Default model for every call:** Gemma 4 26B A4B (llama-swap profile `gemma4-26b-a4b`, the **64k** profile — never
  the 256k one). Evidence in [04 §11.2](gdd/04-ai-system.md): it read the orders right, wrote faithful narration, and
  leaked no foreign script.
- **llama-server flags** for that profile: `-c 65536 --parallel 2 --kv-unified --cache-reuse 256 --jinja`, flash
  attention on, the whole model on the GPU if it fits (it does at Q4 on 12 GB with 64k and a q8_0 KV cache:
  `-ctk q8_0 -ctv q8_0`). Two slots let the narrator keep its long prefix warm on slot 0 while the minds use slot 1.
- **Per-call routing** in `config.json` (all to one model, so llama-swap never swaps mid-turn):

  ```json
  "models": {
    "default":     { "model": "gemma4-26b-a4b", "slot": null },
    "interpret":   { "model": "gemma4-26b-a4b", "slot": 1, "temperature": 0.2 },
    "mind":        { "model": "gemma4-26b-a4b", "slot": 1, "temperature": 0.6 },
    "director":    { "model": "gemma4-26b-a4b", "slot": 1, "temperature": 0.8 },
    "narrate":     { "model": "gemma4-26b-a4b", "slot": 0, "temperature": 0.85 },
    "audience":    { "model": "gemma4-26b-a4b", "slot": 0, "temperature": 0.8 },
    "consolidate": { "model": "gemma4-26b-a4b", "slot": 1, "temperature": 0.3 }
  }
  ```
- **Switching the narrator** to another model (e.g. Qwen3.6 35B A3B for richer prose): set `"narrate": { "model":
  "qwen3.6-35b-a3b", "slot": 0 }`, put both models in one llama-swap group that keeps them resident together, or tick
  *Allow model swaps* (each swap costs ≈ 20–25 s). The narrator's validator drops foreign script and invented facts
  either way.
- Thinking off for every call (the schemas do the work); *Also think in audiences* only if you want slower, deeper
  replies.

## 4. Fine-tuning guidance

**Not yet.** Phase B gives the models small, constrained tasks; fine-tune only if the bench gates in §2 fail. The
runnable recipe (`scripts/finetune/`: dataset build from `llm-log.jsonl`, labelling, Unsloth QLoRA config, GGUF adapter
export, a `gemma4-26b-a4b-wc` llama-swap profile, bench before/after) is roadmap work package **H** and will come with
its README. Until then, keep playing with the live model: every call is logged to `saves/<game>/llm-log.jsonl`, which is
the dataset the recipe will build from. Never train on book text.

## 5. Known limits and open questions

- The economy still settles per week, not per day; the price index covers grain only.
- Battle stances and siege terms are rules, not model calls (D-046, D-047); the model narrates them.
- Winterfell → the Twins by road is about 1,000 miles (the atlas's road graph; E).
- The realm's lords raid and blockade with their fleets but do not yet carry hosts by sea; they do not start letters of
  their own (D6); outlaw bands are a mark on a holding, not a party on the map (E).
- One soak run broke an invariant for Tyrell at turn 82 on a seed that was not recorded; six re-runs with fixed seeds
  held. The nightly soak prints its seeds; if it recurs, replay it with `node scripts/soak.js --seed N --houses tyrell`.
- The canon beats' effects are functions that return ops (D-051); routing them through the verbs waits. The GDD's canon
  matters that belong to beats not yet written as matters (Renly's offer, the Iron Price, the kingsmoot, Jon's future,
  Lady, the debt, Jeyne, Karstark, Tyrion's trial) come with them (D-053).
- The King's progress has no scheduled stops; lords near it ride to greet it when it halts (D8).
- Portraits and family trees are unchanged in Phases B–E; U9 and F7 improve them (never degrade them).
- E5 shows every rumoured host far out; the L0 map can get busy with grey "~N?" plates (see the roadmap's proposals).
- Garrisons are no longer drawn on the map (E5); the castle's card gives them. The shield pip comes with E6.
- Open question: do you want the Director *lively* by default once you have seen it with the live model?

## 6. What comes next

**N, U and R first** (the owner's review, 2026-09-29): events as Pax-style headlines with plain summaries
([18](gdd/18-headlines.md)); a quiet interface with the rest a click away ([17](gdd/17-ui-declutter.md)); the State of
the Realm ledger ([19](gdd/19-realm-ledger.md)). Then E6–E8 (holding states and the §6.2 figures, ambient life and
graphics presets, playback), the rest of F (portraits and family trees improved, the Book, accessibility), G (content),
H (audio, the fine-tuning recipe, the final handoff).
