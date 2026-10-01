# 15 · Quality: tests, coherence checks, CI and the owner's verification

> How the implementing agent proves each phase works **without a GPU or a model**, and how the owner verifies the
> parts that need one. Gates referenced here are defined in [01-vision.md](01-vision.md) §7.

---

## 1. The testing pyramid

| Layer | Tool | Runs where | What |
|---|---|---|---|
| Unit | `node --test` (existing) | CI (Windows + Ubuntu) | engine modules: movement, muster state machine, battle, siege, economy formulas, knowledge spread, activity claims, commitments, verb legality, schema builders, alias canonicalisation, validators |
| Contract | `tests/ai-contract.test.js` | CI | every AI call kind: schema builds, mock output validates, prompt within token budget, prompt snapshot, fallback on provider error ([04](04-ai-system.md) §14) |
| Integration | `tests/turn.test.js`, `tests/http.test.js` (existing, fixed for Windows) | CI | a full jump on the mock provider: facts, events bound to facts, keyframes, invariants ([03](03-architecture.md) §14) |
| Scenario | `tests/scenarios/*.test.js` | CI | scripted multi-turn stories with assertions (§2) |
| Soak | `scripts/soak.js` | CI nightly | 200 turns × 6 houses on mock; invariants every turn; save size; time per turn — ✅ WP B2 (`npm run soak`; 2 × 8 turns in every CI run); WP B3: every engine card backed by a fact, the fact log well formed, each game's seed printed (`--seed` plays it again) |
| Replay | `scripts/replay.js` | CI | determinism: re-run recorded turns from snapshots and diff facts |
| Visual | Playwright + SwiftShader | CI | the dev pages and the main flow; screenshots attached to PRs; DOM/geometry assertions for 12 §14 |
| Model bench | `npm run bench` | **Owner** | the live model's accuracy and latency (04 §13) |
| Live playtest | `npm run playtest` | **Owner** | 12–30 turns with the live model; a report with every call and validator result |

## 2. Scenario tests (the stories that must work)

Each is a scripted sequence of orders/answers on the mock provider with assertions on facts and state. They encode the
owner's complaints so they can never come back.

| Test | Script | Must hold |
|---|---|---|
| `muster-one-host` | Stark: call all banners to Winterfell (quick); next turn order the host to Moat Cailin; jump 40 days | exactly **one** Stark host exists (plus garrisons); all answered contingents joined it or are en route to it with `rendezvous`; none sits at Winterfell after the host left (B-02) |
| `story-matches-map` | Stark, 6 turns as in the audit | every event's named actors are where the facts say on those days; no event claims an arrival without an `arrived` fact (B-03, B-12) — **`tests/narrator.test.js`** (six weeks on the mock and on recorded replies: every told story passes the validator against its facts and the map; a recorded telling with the Greatjon riding into Winterfell a month early is left in the record's words) |
| `kings-progress` | any house, 60 days, no orders | the progress moves along the kingsroad day by day; "The King comes to Winterfell" fires on its `arrived` fact, never before; Robert and the progress's members are in the party until then (B-06) — **`tests/parties.test.js`** (the arrival as the progress reaching Winterfell; the fact comes with B3) |
| `no-feasts-at-war` | Stark calls banners | no called/answered vassal lord starts a retinue journey until released (B-10) — **`tests/parties.test.js`** |
| `islands-need-ships` | Stark calls Crowl (Skagos) and Mormont (Bear Island) | their contingents wait at their ports for transport or sail with their own ships; no land path over the sea; no Wall toll (B-11) — **`tests/sea.test.js`** |
| `natives-pass-free` | Reed contingent marches south through the Neck | no toll, no losses (B-11) — **`tests/sea.test.js`** |
| `audience-binds` | Stark: audience with Roose Bolton, "bring your men to Moat Cailin within the fortnight" → mock verdict agree | a commitment exists; Bolton's contingent orders change to Moat Cailin the next day; on the due day the commitment is kept or broken with a fact (B-14) — **`tests/audience.test.js`** (both a sincere and a false promise) |
| `officers-know-truth` | Stark: after banners are called, audience with Luwin | the audience context lists the true muster state (who arrived, who is on the road, ETAs) (B-15) — **`tests/audience.test.js`** |
| `no-spoilers` | any house | no stop reason, card, tooltip or prompt visible to the player contains a future beat's title (B-18) |
| `canon-order` | 30 moons, Canon gravity, no player interference, as Tyrell (far from the war) | beats fire in the table's order and within windows; Red Wedding before Purple Wedding (B-19) — **`tests/canon.test.js`** (current engine: the schedule and the order with every precondition met; the 30-moon playthrough comes with the beat engine, WP D1) |
| `player-hosts-protected` | any | no non-player cause changes the player's host's men/orders except engine rules (battle, supply, desertion) (B-08, B-20) |
| `vassal-figures-protected` | any | no NPC house's levies change except through engine rules (B-09) |
| `pronouns` | a female lord (Maege Mormont, Barbrey Dustin) answers the banners | every engine text uses she/her (B-22) — **`tests/people.test.js`** |
| `natures` | load | Eddard's tags are "honest, dutiful…", never "cunning"/"cold-blooded" (B-21) — **`tests/people.test.js`** |
| `economy-anchors` | balance sim | [06](06-economy.md) §12 gates |
| `windows-boot` | CI on windows-latest | the server starts, serves `/`, creates `saves/` under the repo (B-01) |

## 3. The coherence checker (`scripts/coherence.js`, also a library used in dev)

Runs after every turn in dev mode and over any save or playtest report. Classes:

- **Class A (must be zero):** a named character acting at a place they are not (by the facts' days); a dead character
  acting; an arrival without a movement; a number of the player's own men that differs from state; a letter delivered
  before it could arrive; a captive acting freely; an event with no facts.
- **Class B (≤ 1 per 10 turns):** a rumour told as fact; a place named that is not on the involved route; a title a
  character does not hold; an anachronism phrase; a game word.
- **Class C (report only):** repetition (the same headline twice in 10 turns), a "Meanwhile" longer than its budget,
  the same NPC decision three turns running.

The checker uses the narration validator's matchers ([04](04-ai-system.md) §6.4) plus the fact log. Its report is part
of the playtest output the owner runs, so the owner can paste it back.

## 4. Determinism and replay

- All engine randomness through `ctx.rng` (a lint rule forbids `Math.random` under `public/js/engine/` and
  `server/turn/`). *Implemented in WP B1*: `random()` from `engine/rng.js` draws from the save's stream in scope
  (`server/dice.js`), and `scripts/lint-engine.js` (part of `npm run check`) also covers `public/js/shared/` and forbids
  the clock and crypto; `tests/replay.test.js` replays three mock turns byte for byte ([DECISIONS.md#D-005](DECISIONS.md)).
- A turn record stores the seed, the intents (including every mind's choice) and the model outputs' hashes.
- `scripts/replay.js <save> <turn>` re-runs the turn from its snapshot with the recorded intents and asserts identical
  facts. CI replays the fixture saves each run.

## 5. CI (GitHub Actions)

`.github/workflows/ci.yml` (new):

```yaml
on: [push, pull_request]
jobs:
  test:
    strategy: { matrix: { os: [ubuntu-latest, windows-latest], node: [20, 22] } }
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: ${{ matrix.node }} }
      - run: npm run check
      - run: npm test
      - run: node scripts/balance-sim.js --ci
      - run: node scripts/coherence.js --fixtures
  visual:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm i --no-save playwright@1 && npx playwright install --with-deps chromium
      - run: node scripts/visual.js   # starts the server on the mock provider, captures dev pages + the main flow, runs 12 §14 assertions
      - uses: actions/upload-artifact@v4
        with: { name: screenshots, path: visual-out/ }
```

`.github/workflows/nightly.yml`: the 200-turn soak on ubuntu, uploads the soak report.

The project stays **zero runtime dependencies**; dev-only tools (Playwright, a linter) are installed in CI with
`--no-save` or listed under `devDependencies` only if the owner approves (document in the handoff).

## 6. Dev tooling in the app

- **Settings → Show diagnostics** (existing): adds a *Turn inspector* panel: the segment's minds (actor, options, choice,
  refusal), the Director's hooks, the narrator's stories and validator results, the facts list, timings per phase and
  token counts. Route `GET /api/games/:id/debug/turn/:n`.
- **Fact log viewer** (the Book → Chronicle → *All facts* in diagnostics mode).
- **State inspector**: a JSON tree of the player view vs the truth (diagnostics only) to verify knowledge filtering.

## 7. Performance checks

- CI: an engine-only 7-day jump on the Stark fixture at turn 60 must take ≤ 1.5 s (mock provider, zero latency); a
  200-turn soak ≤ 15 minutes; `state.json` ≤ 5 MB at turn 200.
- Prompt-size assertions per call kind (04 §2.5) on the largest fixture.
- The map: `dev/map-lod.html` logs draw calls and frame time in SwiftShader (relative checks only; absolute FPS is the
  owner's check).

## 8. The owner's verification (what the agent ships for the owner to run)

In `docs/HANDOFF.md` the agent writes a checklist, each step one command with what to look for:

1. `git pull` → `npm start` on Windows → the title screen loads (B-01).
2. Settings → Model: pick the llama-swap endpoint (`http://127.0.0.1:8033/v1`) and the profile named in the handoff;
   *Test connection* passes with *JSON schema supported: yes* (a new probe that sends a tiny schema request).
3. `npm run bench -- --suite interpret,mind,narrate,audience,latency` → paste `bench/<date>.md` into the PR/issue.
4. `npm run playtest -- --house stark --turns 12` and `--house blackwood --turns 12` → paste the reports.
5. A 20-minute play as Stark: the muster, the King's arrival, a letter to Riverrun, an audience with Roose; confirm the
   map and chronicle agree.
6. If bench thresholds fail: follow `scripts/finetune/README.md` (the recipe the agent prepared).

*(H3, implemented: `bench/lib/coherence.js` is the checker of §3 (`scripts/coherence.js <save>`, or `--play <house> --turns N` on the mock; `npm run coherence`), and the playtest report ends with it. Class A: the world's own invariants (`engine/state/validate.js`), a dead character acting, a captive acting freely, one person arriving in two places on a day, an arrival with no setting out, a letter before it could arrive, a card with no fact, the player's men in the last turn's books against the state. Class B: a game word or ledger phrase, an anachronism, a rumour told as fact, a place named that is not on the route, a title not held. Class C: a headline twice in ten turns, a digest or Meanwhile over its budget, the same decision three turns running. The gates are A = 0 and B ≤ 1 in ten turns. "A named character acting at a place they are not" is checked as one person arriving in two places on one day. DECISIONS D-102.)*
