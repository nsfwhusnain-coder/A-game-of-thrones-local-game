# Design decisions

> Every place where the implementation departs from, extends or corrects this GDD: date, what, why, what it replaces.
> Newest last. Referenced from the GDD sections they touch as `DECISIONS.md#<id>`.

---

## D-001 · 2026-09-27 · The sea is a real place for the engine (WP A8)

**What.** `public/js/engine/geo.js` rasterises the atlas's land and lake polygons (the same ones the map is drawn from)
into a 4-unit grid (~7 miles a cell): landmasses are the 4-connected land regions, the sea is the largest connected
body of water. It answers *which landmass is this point on* and *the shortest way by water* (Dijkstra, no corner-cutting
over land; legs simplified only while they stay on open water). `public/js/shared/sea.js` uses it for the current
engine's rule that **a host bound for another landmass takes ship**:

- the landing is the stretch of the target's coast that gets the men there soonest (days at sea at 60 mi/day — 90 for
  ironborn longships — plus days marching on at 18 mi/day): Skagos lands near Last Hearth rather than sailing round to
  White Harbor; Bear Island lands near Deepwood Motte;
- transport is, in order of speed: the house's **own ships** (100 men a ship); **a few boats making trips** (each extra
  trip costs a round voyage); **ships the realm sends** (the liege, the liege's liege or a fellow vassal with enough
  hulls, whose ships must first sail from their port to fetch the men); or **none**, and the host waits on the shore
  and the player is told why;
- a host at sea pays no road tolls, and walks again only from where it lands.

Island lords were given small fleets in the scenario (`public/data/scenarios.js`, marked *inferred* where the books give
no number): the ironborn lords' longships, Bear Island 6, the Shield Islands 5 each, Celtigar 10, the Three Sisters 8,
Fair Isle 6, Tarth and Estermont 4. House Crowl of Skagos has none, so its men wait for White Harbor's ships.

**Why.** The GDD's A8 asked for "a simple rule: contingents from island seats wait for transport or use their own ships".
A rule that only knows island *seats* breaks for any other crossing (a mainland host ordered to Pyke, a khalasar sent
to Westeros, a contingent following a host that has crossed), and straight lines cannot tell a strait from an isthmus.
One geography that the engine and the map share fixes the whole class, and it is the first piece of the server-side
routing WP B2 asks for (`movement.js` builds on `geo.js`).

**Replaces.** The straight-line march over water; the "price of the Wall" paid by men from Skagos (B-11).

## D-002 · 2026-09-27 · Canon dates: the books' order is binding, the dates are the game's (WP A11)

**What.** The canon threads of `public/js/shared/plots.js` now fall inside the windows of 10 §4 and in the books'
order (tested in `tests/canon.test.js`). 10 §3.1 said *298 AC: … the Green Fork, the Whispering Wood, the Camps, Robb
crowned* and *299 AC: Ned executed (early)* in the same breath, while §4 makes Robb's crowning follow Ned's execution
(W6 "after J1"). The section is corrected: in the game, which begins on the 1st day of the 8th moon with the King's
progress still at the Twins, the end of *A Game of Thrones* (Ned's execution, the Whispering Wood, Robb crowned) falls
in the first moons of 299 AC; the conventional reconstruction (A Wiki of Ice and Fire) dates those to 298 AC.

**Why.** A royal progress that walks ten miles a day cannot reach Winterfell, return to King's Landing and hold a
tourney before the Hand's arrest in the five moons of 298 left after the start. Keeping the order and letting the
dates follow the world's real travel times is what "canon is a current, not a rail" (10 §1) means.

**Also.** The wights beat (N2) no longer waits for the "cold" threat meter to reach 35 (it grew 0.5 a moon in summer
and could not arrive in its window): under Canon gravity the dead rise at Castle Black early in 299 while Jeor Mormont
lives.

## D-003 · 2026-09-27 · Natures: written numbers for personas, archetypes read trait words (WP A10)

**What.** Every persona (120) has explicit scales and an explicit *sway* list in `public/data/natures.js`; a check and a
test fail if one is missing. Everyone else is played by `public/data/archetypes.js`: the role's archetype, the house's
country leaning it by a point or two, the character's **written trait words** applied through a fixed table
(`brave` +2 courage, `cruel` −3 warmth…), and a deterministic ±1 nudge per scale from the id. `temperament()` no
longer reads any prose. Tags are a pure reading of the scales plus *dutiful* when duty sways them. Every character has
`sex` (`'m' | 'f'`) as data (`WOMEN` in `data/characters.js`, the ancestors in `data/families.js`); saves from before
are migrated from the data.

**Why.** 08 §2.2 says archetypes "by role, region and rank … never from regex". The authored trait words of the roster
(`'cold, patient, calculating, ruthless'` for Roose Bolton) are data written from the books, one word per property; a
table lookup over them is not the prose-regex that made Eddard "cunning" (B-21), and ignoring them would throw away
book knowledge for the ~190 characters without a persona. The ±2 variation of the GDD became ±1 (the half of a ±2
nudge, rounded) so that two archetype characters differ without contradicting their written traits.

## D-004 · 2026-09-27 · Screenshots are a script, and a save can be opened by URL

**What.** `scripts/screens.js` starts the server on the mock provider, sets a named scenario up over the HTTP API,
opens it in Chromium (Playwright, SwiftShader WebGL) and writes `visual-out/<scenario>-<w>x<h>.png` at 1920×1080 and
1366×768. The client opens `/?game=<id>` straight into that game, and `/?dev` exposes the page's state as
`window.__wc` for scripts. Playwright stays a dev tool (global install or `npm i --no-save playwright`).

**Why.** CLAUDE.md requires screenshots at both sizes for every UI change; a script makes that one command and is the
seed of `scripts/visual.js` (WP F9).

## D-005 · 2026-09-27 · The save's dice, in scope rather than passed by hand (WP B1)

**What.** 03 §6 has every phase take `ctx.rng`. The engine's ~70 rolls live in two dozen modules written before that, many
several calls deep; threading an `rng` argument through all of them would touch every signature for no gain. Instead
`public/js/engine/rng.js` exports `random()` (and `chance`, `pick`, `shuffle`) as the drop-in for `Math.random`, drawing
from **the stream of the save being simulated**. On the server, `server/dice.js` runs each engine entry point (a turn,
an action, an audience, a council, an order preview) inside an `AsyncLocalStorage` scope holding that save's stream, so
the dice follow the save across every `await` and two saves in one process never share them. In the browser and in
tests a fixed-seed fallback stream (or `withRng(state, fn)`) is used. The stream is xoshiro128** over the four words of
`state.meta.rngState`, advanced in place, so whatever saves the state saves the dice. New games take a fresh seed;
`createInitialState(…, { seed })` makes the same world for the same seed. Ids the engine mints (letters, orders,
decisions, works) come from `state.meta.seq` via `nextId()`. The absolute day is derived (`dayNumber(meta.date)`), not
stored twice. `npm run check` runs `scripts/lint-engine.js`, which fails on `Math.random`, the clock, crypto or a `node:`
import in `public/js/engine/`, `public/js/shared/` and `server/turn/`.

**Why.** The same guarantee (a turn replays byte for byte: `tests/replay.test.js`, which even swaps `Math.random` between
the two runs) at a fraction of the churn, and the rebuilt modules of later work packages can still take `ctx.rng`
explicitly where that reads better — `random()` and `ctx.rng` draw from the same stream.

## D-006 · 2026-09-27 · One module per model call, and one runner that never throws (WP B5)

**What.** `server/ai/` is the only way the game talks to a model from now on:
- `calls/<kind>.js` carries the whole contract of 04 §14 in one place — `context`, `schema`, `prompt`, `check`, `mock`,
  `fallback`, and `fingerprint` for recorded replies — and `calls/index.js` registers it. `tests/ai-contract.test.js`
  runs over the registry: a new call is under test the moment it exists (mock schema-valid, prompt within budget and
  equal to its snapshot in `tests/__snapshots__/prompts/`, fallback when the server is dead, strict wire schema).
- `client.js runCall()` reads, canonicalises and checks every reply; a failed check earns **one** retry that names the
  problems (04 §5.4), then the call's fallback. It never throws into a turn; the record says why.
- `providers/`: `openai` (response_format json_schema strict, thinking off, `cache_prompt`, `id_slot`, the routed model
  and temperature, no "continue where you stopped" — a continuation would restart the grammar), `mock` (each call's
  rule-based reply, serialised and read like a model's, so the mock passes the same checks), `replay` (recorded replies
  by fingerprint from `tests/fixtures/model/<kind>/`, falling through to the mock).
- `schema.js`: enums from the live world. `buildEnum` keeps every natural name as a member and removes clashes where one
  member is a strict prefix of another naming something else — dropping the name its thing can spare (`baratheon_ds`
  goes, `dragonstone` stays; `jon` goes, `jon_snow` stays). Our private `x-canon` marks tell `canonicalize` which map
  turns a member back into an id and are stripped from the schema on the wire. A small validator covers the JSON Schema
  subset we send. `hasForeignScript`/`stripForeignScript` handle the Qwen CJK leak (B-27); the current pipeline strips
  stray glyphs from the chronicle, audiences and council already.
- `models.js`: per-call routing from `config.json` `models` (04 §11.3), the GDD's temperatures and budgets, and a
  warning when one jump's calls would swap models.
- `context/primer.js`: the static primer every call begins with, then the difficulty and canon-gravity paragraphs.
- *Settings → Test connection* runs the `probe` call: it reports whether the server enforces a JSON schema and whether
  "the Wall" lands on Castle Black (the bench's pitfall).

**Ids.** The GDD's examples call the Wall's castle `castle_black`; this world's holding id for it is `nights_watch`
(Castle Black is the Night's Watch's seat), and `castle_black`, `the_wall`, `wall` are its aliases. The acceptance
"`the_wall` → `castle_black`" is met as `the_wall` → the Castle Black holding.

**Why.** Everything a call needs, tested and reviewed in one file, is what keeps a dozen calls honest as the pipeline
grows (B6–B13); the runner's guarantees are what let a turn survive any model misbehaving.
