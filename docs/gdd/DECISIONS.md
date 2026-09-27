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

## D-007 · 2026-09-27 · The party model as built (WP B2)

**What.** `state.parties` replaces `state.armies`; hosts, fleets, garrisons, lords' households, the King's progress and
lone riders are all parties (`engine/parties.js`). Where this differs from the letter of 03 §3.2–§3.3:
- **A person's place is one string**, `c.loc`: a holding or place id, or `party:<id>` (was `army:<id>`). The GDD's
  `location: { at, party, pos }` is derived (`placeOf`, `partyOf`, `charPos`): one string cannot say two places, so
  invariant 1's "exactly one" holds by construction and 105 reads of `c.loc` kept their meaning. `setLoc` is the one
  way to change it; it keeps the party's `members` in step (and a rider's party ends when its last rider leaves it).
- **Field names kept from the old engine**: `commander` is the GDD's `leader` (the word the player reads), `march:
  { to, since }` is the GDD's `orders` for the kinds this engine has (march, follow — `to: 'party:<id>'`), `men` and
  `composition`/`units` stand for `troops` until the military rework (C1–C3). `a.party` (a household's errand) is now
  `purpose`, as the GDD has it.
- **`state` is an engine enum, `status` is gone.** `settle()` derives the state from what the party is doing (a voyage,
  a march, a siege, a levy still gathering, a household at its hosts'); battles set `engaged`/`routed` for the turn.
  What the player reads comes from `statusText()`; the story model's status words are not stored (B-20).
- **Members stay with their party at rest.** A host that reaches Moat Cailin still has Robb in it: people travelling
  with a party are with it, halted or not, and `placeOf()` says where they are. (The old engine set everyone down at
  the destination, so a host marched on without its commander.) A rider's party ends at its destination, and the
  rider gets down there.
- **Contingents include the owner's own share.** `shares()` keeps `contingents` adding up to the host's `men`
  (invariant 4): the sworn houses' men, cut in proportion when the host is smaller than its banners brought, and the
  owner's share is the rest. `sworn(p)` lists the banners without the owner's share.
- **Euron sails the Silence**: the one character the data had "at sea" is a member of a one-ship fleet party at sea that
  no player commands (`exile: true`), so everyone is somewhere real from turn 0.

**Why.** Everything that moves being one thing is what lets the map, the numbers and the chronicle agree about where
anyone is; the smaller departures keep the diff reviewable and the old saves loading, without weakening an invariant.

## D-008 · 2026-09-27 · Routes over the atlas, and the pace of the King's progress (WP B2)

**What.** `engine/movement.js` plans a route once, when the order is given, on the engine's raster of the atlas
(`engine/geo.js`, 4-unit cells): A* over land with 07 §5's terrain multipliers as time costs (road 1, open 0.85, forest
0.7, hills 0.75, mountains 0.5, the high peaks 0.35, marsh 0.4 — `data/balance.js TERRAIN`), the Wall's line shut
except at Castle Black, the Shadow Tower and Eastwatch, lakes and the sea impassable. The route (`route.path` with the
day each point is reached) is walked day by day (`advance`), so a host is always on its road, and the map draws that
road (`MapScene.roadAhead`) and animates along the ground the engine covered (`motion.path`). Where the sea is in the
way a traveller (a rider, an envoy) rides to the best port, waits a day for a ship and sails; on a long overland
journey it takes ship if that is clearly quicker (Winterfell to Oldtown by Seagard and the sea). A host never books a
passage: it needs ships of its own or its realm's (`shared/sea.js`, D-001). The march loop moved from `server/game.js`
to `shared/marches.js`. The story's `army_move` no longer teleports: a step of two days' march at most is taken at
once, anything farther becomes a march the engine walks.

**The progress.** 03 §5 gave the royal progress 10 miles a day (a wheelhouse). The canon timetable (A11) has the court
at the Twins at the start of the 8th moon and at Winterfell in the 9th; on this atlas — a Westeros of about 3,000 miles
from the Wall to Sunspear, as the books have it — that is ~1,000 road miles, about 30 miles a day. Books first: the
progress rides at 30 (`SPEED.progress`); the GDD is corrected.

**Why.** "Hosts glide straight" and "Skagos marches over the sea" (B-11) end only when the engine and the map walk the
same road; planning once and walking it keeps a turn fast (A* results are cached; a soak turn takes ~0.8 s).

## D-009 · 2026-09-27 · Activities, stored compactly and derived where they can be (WP B2)

**What.** `engine/activity.js` implements 03 §4's table (priorities; what each yields to) with `claim`, `release`,
`busyUntil`, `canAttend` and `bound`. An activity is stored as `{ kind, since, party?, until?, source? }`: its priority
and whether it may be interrupted are its kind's, so they are not repeated in every save. Activities that circumstances
decide (a head of house at the seat rules; a lord called to the banners musters; the leader of a host commands it; a
rider travels; a prisoner is captive) are re-derived whenever the state is settled (`engine/state/settle.js`, on every
create, load and save), and only a claim (it has a `source`) outlives them. The retinue scheduler sends out only lords
who are ruling or idle (`canAttend(…, 'attending')`, 03 §4, B-10); the story model may not move anyone held by a
binding duty (commanding, mustering, an embassy, a siege, a cell). The player's own orders are a liege's command and
are never refused for it.

**Why.** Invariant 2 — everyone does exactly one thing — holds by construction after every settle, and the few places
that must ask ("is Robb free to go to a feast?") ask one function.

## D-010 · 2026-09-27 · The map's ribbons face the sky

**What.** `MapScene.ribbon()` wound its triangles facing down, so every ribbon drawn with a one-sided material — the
dashed route ahead of a host, the trail behind it, the dusty road tracks — was culled and never seen (the roads showed
only because they are also painted into the terrain). The winding is fixed; routes are resampled densely before they
are drawn so they lie on the hills between the engine's few waypoints.

**Why.** Found while taking the B2 screenshots: the engine's routes were right and invisible.

## D-011 · 2026-09-27 · Facts are made where the change is made; cards are their projections (WP B3)

**What.** `engine/facts/log.js` records a fact with `emit(state, kind, …)`: id `f<turn>.<n>`, the absolute day from the
turn's clock (`meta.clock = { turn, from, to }`, set by the server for the length of a turn and never saved), actors,
houses, place, data, cause, scope and importance (the kind's default, +1 for the player's house or kin, +1 for a great
lord, capped at 5 — or the importance the teller gives). A subsystem that tells a card calls `fact(state, kind, card,
more)`, which records the fact and returns the card bound to it (`card.fact`); `shown(mine, …)` records it always and
shows it only where the player should read it. Every `applyChanges` op that changes something a lord could notice (a
host raised or disbanded, a march begun, a death, a capture, a holding taken or granted, war and peace, fealty, pacts,
taxes, works, customs, seasons, weddings, letters) records its own fact, and the applied line names it (`facts`). A
caller that tells the change in its own words passes `told: [ops]` (a battle tells its battle; the road tells its
ambush; the years tell their dead) so nothing is recorded twice. A card made without a day is placed by the turn as
before, and its fact follows it there (`redate`); facts of the same moment (`alongside`: a beat's changes, an heir's
succession) move with it. The facts of the turn live in `state.facts` until the save writes them to `facts.jsonl`
(`saveState` flushes), so a dry run on a copy leaves no trace and a replay makes the same ones — the replay test now
compares the fact log byte for byte.

**The story model's own events** are not facts: they are marked `story: true` and stay what they are — telling —
until the narrator of WP B8 tells facts instead. The order receipts (`orderId`) likewise wait for B4's verbs.

**Why.** "Facts are the only history" (03 §1) needs every change to leave one record, made by the code that made the
change; making them at the event sites (rather than diffing states) keeps the engine's own words and the exact day.

## D-012 · 2026-09-27 · Turn records in files, snapshots before the orders are carried out, undo by bytes (WP B3)

**What.** Each turn's record is written to `turns/NNNNNN.json`; `state.history` keeps the last 30 turns and any the
chronicle has not yet taken in (the prompts, the feed and the pins read no further back). Before a turn is played —
with the orders the player gave already written, before the engine carries them out — the save keeps a snapshot
(`snapshots/NNNNNN.json.gz`: the state, the chronicle, and the byte lengths of `facts.jsonl` and `world-log.md`); the
last ten are kept. `undo(id, { turns })` restores the snapshot of the earliest turn unmade, cuts the logs back to those
lengths, rewrites the chronicle and forgets the later turns and snapshots; the dice are turned back with the world, so
the same orders make the same turns again. `newGame(…, { ironman: true })` sets `meta.settings.ironman`: no
snapshots, and undo is refused (403). The title screen offers it beside "Begin"; the undo button is hidden in such a
game, and otherwise asks how many turns to turn back (`GET /api/games/:id/undo` says how many can be).

**Why.** Undo that gives back the orders is the useful kind (change one word and go again). Cutting the logs by byte
length is exact and cheap, where rewriting them line by line is neither; ten gzipped snapshots of a ~0.7 MB state cost
~1.5 MB on disk.

## D-013 · 2026-09-27 · Fact kinds beyond the catalogue (WP B3)

**What.** Kinds added to 03 §8, each where the catalogue had no word for a thing the engine already does: `ambush`
(outlaws falling on a small company), `men_hired` (men-at-arms taken into pay; sellswords keep `sellswords_hired`),
`gift` (gold sent for goodwill), `ledger` (the steward's notes that reach the chronicle), `house_ended`, `canon_beat`
(a beat of the great story, carrying its `thread`), `legacy` (a line of a pre-B3 save). The GDD is updated.

## D-014 · 2026-09-27 · A traveller at sea goes where the ship goes; the soak is replayable (WP B3)

**What.** The soak found a rider left "camped" on the open sea: a rider re-aimed while aboard ship could not plan a road
from the water, and the failed re-aim left the ride pointing at the new place with no road, so the next turn dropped
the march where the ship was. Now a traveller aboard ship cannot be turned until it lands (the order is refused with
that reason); a re-aim that finds no road leaves the old journey standing; and a traveller who can go no further on the
water is set down at the nearest port. The soak prints each game's seed and takes `--seed`, so a failure it finds can
be played again exactly.

## D-015 · 2026-09-27 · The verb registry as built (WP B4)

**What.** `public/js/engine/actions/` holds the registry (`registry.js`) and one module per family: `military.js`
(`call_banners`, `raise_levies`, `march_host`, `attack_host`, `halt_host`, `merge_hosts`, `disband_host`,
`set_secrecy`), `movement.js` (`send_person`, `recall_rider`), `economy.js` (`set_tax`, `set_dues`, `fund_works`,
`cancel_works`, `hire_men`, `hire_officer`, `send_gift`), `court.js` (`appoint_office`, `grant_holding`, `hold_feast`,
`hold_tourney`, `judge_prisoner`, `answer_matter`) and `diplomacy.js` (`declare_war`, `plant_spy`, `gather_secrets`,
`send_letter`). A verb is `{ id, family, label, params, who?, legal, cost?, start, receipt, said?, facts, mind }` as in
03 §7; an intent is `{ verb, actor, house, params, source }`. `perform()` checks, does and tells: a refusal (`{ code,
text }`, in the world's words) changes nothing; what is done records its facts with the intent's source as their cause.
Every card action (`POST /act`, now `{ verb, params }`; the old `{ kind, … }` still maps) and every kind of written
order (`executeActions`) goes through a verb; `server/court.js` is gone, its acts are verbs. The order-reading rules
(who the order names, whether men go, whether it is a letter after all) stay in `server/orders.js`, in front of the verb.

**Departures.** `said()` is added to the verb: the order line the story model is told (the old `addOrder` texts), until
the jump of WP B11 retires the story model's reading of orders. The verbs take the house from the intent, so the minds
of B7 can use them for any lord; the old helpers assumed the player. Journeys and hiring still go through their ops in
`world.js` (`travel`, `recruit`, `hire`), the one place those are done for the story as well. A march no longer clears
the host's place: it is at its castle, with its road planned, until the turn walks it.

**Why.** One definition per action is what lets the interpreter (B6) and the minds (B7) choose among real actions, the
engine resolve them the same way whoever chose, and every order get its receipt.
