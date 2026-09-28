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

## D-016 · 2026-09-27 · The interpreter's action is one flat record (WP B6)

**What.** 04 §4.3 gives an action `verb, who, subject, to, men, note`. The registry's verbs need more: a house (war,
spies, secrets, a grant), a person of another house (a letter, a gift, a prisoner's fate), a sum of gold, a place where
something is done that is not where anyone goes (a muster, a hiring, works), and a small word of the verb's own (a tax
level, a verdict, an office, a kind of works, a march's secrecy). So every action is `verb, who, subject, at, to,
person, houses[], men, gold, choice, note`, every field required (strict mode) and unused ones `"none"`, `[]`, `0`,
`""`. `who` is an enum of the house's people and the wards it keeps; `subject` its hosts; `at`/`to` every place (and
`party:<id>` for the enemy hosts it knows of); `person` everyone living; `houses` every house; `choice` one enum of every
verb's small words — `take_the_black`, not `wall`, because `wall` is a prefix of `walls` (04 §3.1). The check refuses a
choice that is not the verb's own, a verb without what it cannot do without, a person the order never names sent on the
road, men the order never asked for, a letter made into a ride, a hiring the order never asked for, a question with no
words, and prose in another script. A letter is the verb `send_letter`; its words are the order's own.

**Why.** One schema for every verb keeps the grammar small and the few-shot examples short; the enums still carry every
name the world knows, and the check says in words what the schema cannot.

## D-017 · 2026-09-27 · When the model is asked (WP B6)

**What.** The pre-parser's reading skips the model when it is *sure*: every clause of the order yielded something (a
prayer or a hope counts), there is no question, every action is lawful now, and something was read (an action or a
letter). Otherwise the model reads the order with the pre-parse as a hint. The model's reading replaces the rules' —
except when the model leaves to the story an order the rules read as an action: then the rules' reading stands, and its
receipt says why it cannot be done (04 §4.4: an order is never silently dropped). A call that fails (no server, an
unreadable answer, a failed check twice) gives the rules' reading. On the mock provider the rules' reading is the whole
reading. An order for part of a host ("three thousand spears" from a host of four thousand) is never sure: splitting a
host is a verb of phase C (07 §12), so the rules march the whole host and the model decides. A march with no host in
the field is read, and refused with that reason, rather than dropped.

**Why.** 04 §4.1: most orders never need a model. On the suite 88 % are read alone, all of them right; on orders it had
never seen, the pre-parser read 60–84 % alone at 93–100 % precision (D-019), and the receipt shows the lord what will be
done before the turn, so a misreading is seen and corrected in the order's words.

## D-018 · 2026-09-27 · Clarifications: chips that patch, chips that add words (WP B6)

**What.** A question the rules ask carries the action it leaves open (`pending`: the verb and the params already read)
and answers that patch it (`{ label, patch }`: "200 men" → `{ men: 200 }`, "Ser Rodrik Cassel" → `{ character }`): one
click completes the reading, no model asked. A question the model asks has plain answers: a click adds the answer to
the order's words ("Send someone to the Wall — Ser Rodrik Cassel") and the order is read again. The chip chosen is shown
under the order ("You answered: 200 men"). An order still waiting on its question at the turn is not done: its result
is "could not be done: the order was not clear — Who should go".

**Why.** A patch is exact where the rules know what is missing; the model's options are free text, and the order's own
words are the record the player sees and can edit.

## D-019 · 2026-09-27 · The interpret suite, and an honest hold-out (WP B6)

**What.** 04 §13 asks for 200 orders; the suite has 300 (60 each for Stark, Lannister, Mallister, the Night's Watch and
Greyjoy, each house with a fixed setup: its host, a prisoner), in `bench/suites/interpret/`. The first 200 were written
with the pre-parser; each of three hold-outs after them was written apart, measured once, then tuned against and folded
into the suite: **64 % (50 orders), 84 % (25), 80 % (25) exact before tuning**. A fourth hold-out of 25 stands in
`bench/suites/interpret-holdout/`, measured once (84 % exact; 60 % read alone, 93 % of those right) and never tuned
against. When it is tuned against, it joins the suite and a fresh one is written. The truest hold-out is the owner's
own orders: every model call is in `llm-log.jsonl`, the seed of the fine-tuning set of phase H.

**Why.** A score on orders the rules were written for says little about the orders a player will write. The gate in CI
is on both: ≥ 95 % on the suite, ≥ 80 % on the hold-out, ≥ 60 % read alone at ≥ 98 % precision on the suite, every
action with a receipt — and the mock through the whole call path must read the suite as the rules do.

## D-020 · 2026-09-27 · Readings, receipts and the turn (WP B6)

**What.** An order is read once for its words (`order.parsed`, `order.parsedFor`); every unexecuted order's receipt
(`order.receipt`: lines `{ ok: true | 'warn' | false | 'ask' | 'story', text }`) is its reading tried in order on one copy
of the world — the second order sees the first done — rolling the copy's own dice, so reading orders never spends the
save's. The turn performs exactly that reading through the verbs; nothing is read twice. Levies raised by a written
order walk in over days, as before. Retired: `planOrders`, `readOrdersByRule`, `executeActions`, `previewOrders`,
`postLetters` and the old orders prompt (the model's `op` actions); their tests now go through readings. A command said
in an audience to one of the house's own people is read by the pre-parser with them as the one addressed, and done
through the verbs. The envoy's answer (`resolveEnvoys`) is weighed for the one the reading writes to. Letters and envoys
stay as they are until WP B10.

**Why.** The receipt must be what happens (P2): the same reading, the same verbs, the same world.

## D-021 · 2026-09-27 · Names a lord uses (WP B6)

**What.** Heads of houses answer to the title the realm gives them: "Lord Tully", "Lady Arryn", "Lord Hoster" (a lord's
first name only when no other lord shares it), "the Lord Commander" and "Lord Commander Mormont". The peoples of the
realm name their houses ("the ironborn", "northmen", "wildlings", "the Watch"); "the Queen"/"her grace" is the King's
wife; "the Neck" is Moat Cailin. The orders list may take up to 40 % of the drawer's height, since receipts and chips
make each order taller.

**Why.** These are the names players write; each was a misreading on the suite or a hold-out.

## D-022 · 2026-09-27 · The realm's minds as built (WP B7)

**What.** `public/js/engine/minds/` holds the engine's side — `salience.js` (04 §5.1: rank, what has just happened to
them, nearness to the player, less if they decided lately), `options.js` (what an actor may do now: candidates for each
verb a mind may use, every one checked with the verb's own `legal()`, and `wait`), `houseways.js` (the behaviour trees)
— and `server/minds.js` runs a week of minds: the best six (config `minds`: 3 | 6 | 10, or `"off"`) think with the model
two at a time, those beyond the budget with something pressing act by their house's ways, and every choice is done
through its verb on the turn's first day, after the player's orders. A turn longer than a week gives six minds a week
(at most 18). The choices and who made them are in the turn record (`minds`); a house remembers what it did lately.

**Departures.** 04 §5.2's no-op `hold` is `wait`: "hold" is a prefix of `hold_feast` and a grammar would let a model
stop short on it (04 §3.1); for the same reason the Wall's verdict is the choice `take_the_black`. The realm's
office-holders get no mind until they have verbs of their own (schemes and counsel, B9–B10); a commander who is not his
house's head moves only the host he leads. Minds do not sail fleets (the war at sea is C6), and under canon gravity the
hosts whose coming is a beat of the story — the free folk, the khalasar, the Golden Company, the Targaryen exiles —
keep to their camps until the story moves them. Houses that are not lordships (the Watch, the peoples, exiles,
companies, the free cities) keep no court and levy no taxes. With minds on, the swarm's Hand — the old way the other
houses were moved, by change operations straight from a model — is not called.

**Why.** 03 §1: models propose, the engine resolves. The Hand wrote changes to the world; a mind can only choose one of
the registry's lawful options, and the verb does it.

## D-023 · 2026-09-27 · The mind call's schema, and how a refusal is told back (WP B7)

**What.** 04 §5.3's `verb, target, leader, men, with, public_face, secret_aim, line`, plus `host` (which of one's hosts),
`gold` (a gift's size) and `choice` (the option's own word: a tax level, a verdict, a kind of works) — the options need
them. The enums hold only what the options name (targets with the names people use for them). The check holds the
answer to one of the options as written, then asks the verb's `legal()` with the answer's numbers; a refusal is told back
through the client's one retry, in the verb's own words. 04 §5.4's "remove the refused option" would need the schema
rebuilt between tries; the model is told why instead. A choice refused when it is done (another lord acted first) is
decided again by the house's ways on the world as it stands. The mock and the fallback are the house's ways, whose
choice and reason are also the hint line the model is given (04 §5.5).

## D-024 · 2026-09-27 · House ways: what presses first; houses rest (WP B7)

**What.** The rules are tried in this order: the house's own answers to what presses (a Lannister answers a seizure by
calling his banners; Dorne waits), then everyone's (relieve a siege, strike at a host in reach on good odds, raise men
when an enemy is at the gates, answer a taken kinsman, answer the liege's call if dutiful, raise a host at war, carry
the war to the nearest enemy holding, judge a prisoner by one's nature), then the house's calm ways, its lord's nature
(ambitious, martial, cautious, dutiful), and everyone's calm (granaries before winter, send the levies home in peace,
taxes when poor, dues when late, a gift to a cold liege, a feast or works when rich, an envoy to a friend's court).
Every house rests between the same acts (a tourney ~300 days, a feast 90, taxes and gifts 120…). Every great house has
ways of its own, and so do Frey, Bolton, Manderly, Dragonstone, the Watch and the free folk.

**Why.** The mind suite (D-026) found the first trees letting a peacetime feast outrank a son's capture, lords making
war on their own liege, and vassals with no way to answer a summons.

## D-025 · 2026-09-27 · Which verbs minds may use now, and `answer_call` (WP B7)

**What.** Schemes (`plant_spy`, `gather_secrets`) and `set_secrecy` inform only the player until each house keeps its own
knowledge (B9); `send_letter` writes into the player's post until letters are things of their own (B10): minds do not
use them yet (`mind: { allowed: false, until }`). New: `answer_call` — a sworn lord answers his liege's summons at once
(his levies raised as a host serving the liege, riding for the muster — or the liege's seat when the call named none),
rather than in his own time and temper; its code is the banners' own answer (`raiseForLiege` in `shared/vassals.js`).
The player answers a summons at court, as before.

## D-026 · 2026-09-27 · Liveliness, what the player hears, and the mind suite (WP B7)

**What.** Q4 (09 §9): if fewer than three lords acted in a week, or none far from the player's country, the next in
salience act by their ways taken at their word (`eager`: the rules without their chances). Until B9 the player hears of
a mind's doings as the realm would: its public facts, its own house's, and what happens in its own country (`heard`);
those become cards of the chronicle. The mind suite (`bench/suites/mind`, 04 §13) is 123 situations in nine kinds — a
kinsman taken, a castle besieged, an enemy at the gates, a host idle in war, peace and full coffers, winter coming, an
empty treasury, a prisoner in the cells, the liege's call — each with the responses in character, written from the
books and the characters' natures. The house ways first scored 79 %; after the fixes of D-024 (and the `called`
situations taught the new verb), 98 %. The model's gate is 85 % (the owner's run); CI holds the ways to ≥ 90 %, every
kind ≥ 75 %, every choice lawful.

## D-027 · 2026-09-27 · Engine fixes the minds found (WP B7)

**What.** (1) A host that fought during a turn kept its banners' shares at their numbers before the battle (invariant 4
broke in the soak): `settle` now rebalances shares first. (2) A host pursuing a party that was destroyed or folded into
another kept following it until the next march: `settle` stops it. (3) The AI client canonicalised a reply before
validating it, so an alias whose id the enum had dropped for a clearer name (`storms_end` → `baratheon_se`) failed the
schema: replies are validated as written, then their names become ids. (4) "House Manderly begins Build warships at
White Harbor at White Harbor" now reads "House Manderly begins works at White Harbor: build warships".

## D-028 · 2026-09-27 · The narrator tells the engine's cards, and a told story replaces them (WP B8)

**What.** 04 §6 has the narrator tell "the facts the player's house knows". Until each house keeps its own knowledge
(B9), what the player's house knows this turn is exactly what the engine already chose to show it: the chronicle's
engine cards (each bound to its fact, a folded week of answers to its facts), plus the facts of the lord's own orders,
which the engine never carded (their receipt card came from the order). So the narrator is handed those facts, gathered
into stories (`engine/facts/cluster.js`: a thread, a party, a binding cause — an order, a mind's intent, a beat; a cause
of a rule such as "the muster" runs everywhere and binds nothing — or a place within two days); cards marked as small
happenings (`bg`) are the Meanwhile. A story told truly becomes **one card that replaces the engine's cards for its
facts**, carrying them (`facts`) and their lines (`record`, shown as "The record" under the scene): the prose never
stands between the player and a true number. A story told under an order is that order's card (the lord's words quoted
above the scene). A story not told truly keeps its engine cards. The facts beyond the eight stories keep theirs too.

**Why.** The alternatives were a narrated card beside each engine card (the chronicle told everything twice — the flood
of B-series cards the A3 fold was written to stop) or narrated cards only (the numbers hidden behind prose that might
round them). Replacing with the record kept is what 03 §1 asks: the facts are the history, the prose is their telling.

## D-029 · 2026-09-27 · How the validator reads a telling (WP B8)

**What.** 04 §6.4, made exact: (1) *names* — a person is found by every name the game knows (id, name, name without a
byname — "Jon Umber" — byname, "Lord Umber", unique given names), longest first; a lone given name directly before
another capitalised word is someone the roster does not know and is skipped. A named person *acts* when a past-tense
verb follows the name, or when the name is the subject of "said/asked/told…". Someone not in the story who acts must be
within 40 miles of the story's place; a sentence that only remembers, writes to, sends for or names the dead ("thought
of", "a letter to", "the late") exempts them. (2) *arrival* — a person or party who arrives, reaches, rides into, comes
to or joins must have an arrival in the story's facts **at that place** (the facts' kinds of arriving, or the facts' own
words); "will", "before", "on their way" and the like mark an arrival not yet made. (3) *numbers* — digits (not ordinals,
not a year "298 AC") and number words ("three thousand eight hundred", "a score"); each must be one of the story's (±2 %,
from its facts' data and words) or ≤ 12. (4) *places* — a holding named must be the story's, named by its facts, within
40 miles of its place, within 25 miles of a road its parties walk, a seat named as a title ("of the Last Hearth"), or
only remembered. (5) the anachronisms of `data/anachronisms.js`, each allowed once this game has reached it (a beat
fired, a title held, a death, a battle fought). (6) game words and the tired phrases of 10 §8.2; (7) Latin script only;
(8) no explicit description. The headline, the line and every sentence of the scene are read separately. The Meanwhile
sentence is held to (5)–(8) only (it names the small happenings in passing).

**Found by the soak.** Run over 5 houses × 16 turns on the mock (which tells only the engine's own words, so any fault is
the validator's): a nipple in a canon beat's boar wound was "explicit", a host's arrival was read from a headline glued
to the next sentence, "700 men … join" did not begin a sentence, and a host *raised* at Last Hearth counted as having
arrived at Winterfell. All four fixed; the soak and the 60-week suite now pass 100 % on the mock.

## D-030 · 2026-09-27 · One more telling, then the record (WP B8)

**What.** The client's one retry of a whole reply (04 §5.4) is wrong for the narrator: one bad story would have the
model tell all eight again. A call may now `salvage` a reply of many parts: the narrator keeps the events that passed,
and each failed story is told again **alone** (`only`, with the faults named, one attempt); if that fails too, the story
keeps the engine's cards. A reply with no event worth keeping is retried whole, once, as before. The mock and replay
providers never retry (a recorded reply is what it is). The turn record's `narration` says how each week was told:
stories, told, told again, left plain, faults by rule and the first twelve faults, the recording key, and the stories'
fact groups — enough for the bench to tell the same week again with another model.

## D-031 · 2026-09-27 · The narrate suite is sixty weeks of seeded games (WP B8)

**What.** 04 §13 asks for "60 fact bundles". A bundle hand-written as JSON would drift from the engine's facts at the
next change of a template; instead the suite (`bench/suites/narrate`) is twelve games — each a house, a seed and its
orders — played on the mock before any narrator is asked, and five weeks of each told again by the narrator under test.
Every model is given the same sixty weeks, and the bundles stay true as the engine grows. Scores: true on the first
telling (the 90 % gate), mended by telling again, left plain, faults by rule; `--judge` asks the model (or another) to
score each told story's voice 1–5 against the style bible (the 3.8 gate). The judge is the bench's, not the game's.
Also: `POST /api/games` now takes a `seed`, so a game — and a bug report — can be played again exactly.

## D-032 · 2026-09-27 · What each house knows: worked out, not stored (WP B9)

**What.** 03 §3.8 has `HouseKnowledge.facts: { factId: { day, via, confidence } }` for every house. Stored for 158
houses and every fact, that is tens of thousands of entries a season in the save. Instead **news of a fact is worked out
from the fact** (`engine/knowledge.js` `newsOf`): a house's own doings and what happens within sight of its castles,
its sworn castles, its hosts and its people abroad, at once (`witness`); public news of weight (importance ≥ 3) by raven,
a day plus a day per 200 miles from the nearest of its eyes (at most ten days for the realm's greatest news, thirty for
the rest); small public news by rumour at 30 miles a day and not beyond 900 miles, local news not beyond 450; a letter's
business only to its houses; a secret never. Only what cannot be worked out is stored in `state.knowledge[house]`: facts
learned by a spy, a letter, a confession or a scheme (with the day, the way, the day it happened and its scope — for
invariant 9), the reports of hosts, the spies a house keeps, the cards of news still on the road (`pending`), beliefs.
`state.intel` (the player's reports and spies) is migrated into `state.knowledge[player]`. The sight radii stay the
tuned ones of the old fog of war (55 / 45 / 75 / 45 / 30 map units, not 09 §7.2's 60 / 40 / 80 / 50), and a house's liege
is not among the friends whose hosts it sees as its own: changing either changed every seeded game's dice for nothing
the player would notice.

## D-033 · 2026-09-27 · The chronicle hears late; the player's view is the server's (WP B9)

**What.** (1) A card of the turn whose fact the player's house hears of later is told on the day its word arrives
(`heard: { via, happened }`, shown as "It happened on the 9th; word came on the 24th"); if the word comes after the
turn, the card waits in `knowledge.pending` and is told in the turn it arrives. The engine still chooses which cards
are news for the player (its `shown()` choices); knowledge only decides *when*. A card whose news the engine cannot work
out (a spy's finding) stands. (2) Minds see only their house's knowledge: their dossier's news is what has reached their
house by now, and the enemy hosts they reason about are those they see or have report of (`hostsKnownTo`), where the
report puts them. (3) Every answer of the API passes through `server/view.js`: other houses' hosts as seen (without
their marches, routes or feints), as reported (whose, how many, where the report says, how old — no more), or not at
all; people riding with a host the house cannot see are "somewhere unknown"; others' secrets, stress, paranoia and
memories stay on the server (`secretHidden` tells the sheet there is more to know); other houses' figures as a
maester's estimate (two significant figures) and no ledgers; only the player's own knowledge; no minds, no replies not
yet arrived, no secret pacts; turn records without the minds' counsel or the engine's applied operations. `hiddenTruths`
checks invariant 10 over a view, in the tests and over a six-week game.

## D-034 · 2026-09-27 · Promises the engine keeps: what can be promised, and how it is judged (WP B10)

**What.** 08 §9.1 lists sixteen kinds of commitment; B10 implements the eight the engine can both act on through its
verbs and judge from the state: `march_to {place}`, `send_men {place, men}`, `attend {place}`, `pay {gold}`,
`release {captive}`, `swear_fealty`, `join_war`, `stay_neutral` (`engine/politics/commitments.js`). The rest (marry,
betroth, hand_over, grant, keep_secret, hold, open_gate, deliver_letter) come with the verbs that can keep them.
Sincerity is rolled once, in secret: `0.25 + 0.55 × honesty + relation/400 − 0.25 under duress (a 'yield') ± 0.15`;
a promise meant (≥ 0.5) is acted on from the next turn's first day through the maker's verbs (a host marched, levies
raised to the place, a gift sent, a prisoner released, fealty sworn, war declared on the promisee's enemy); one not
meant is never acted on. It is judged every turn after the marches: kept as soon as it stands kept (a host within 40
miles of the place; the gold sent; the captive free…), broken on its due day (relation −15 private, −25 witnessed,
−40 public with an `oathbreaker` mark), `stay_neutral` broken the moment the maker goes to war on the promisee, void when
the maker dies or is taken. Every step is a fact. The player's view carries promises made to or by their house, without
their sincerity.

**What the model may promise.** The audience call's `agrees_to` enum is the request the engine read from the lord's
words (`requestOf`: a place and "men/host/banners" → `march_to`, with a number → `send_men`; "come/attend" → `attend`;
"release" and a captive of theirs → `release`; a sum asked → `pay`; fealty, alliance, truce → `swear_fealty`,
`join_war`, `stay_neutral`; "within the fortnight / ten days / a moon" → the days), and only under an `agree` or `yield`
verdict; every other verdict has `maxItems: 0`. The target is that request's place or person. A proposal agreed (an
alliance, a truce, fealty) is still settled by the engine as before (`holdToVerdict`), never by the model.

## D-035 · 2026-09-27 · Audiences, letters and councils change nothing but through the engine (WP B10)

**What.** The old audience and council replies carried `changes` — figures, pacts, marches, relations — applied to the
world from the model's words (a breach of 03 §1 the audit flagged). Both are now constrained calls (`calls/audience.js`,
`calls/council.js`) whose only effects are what the engine derives: the verdict's settlement of a proposal, the
commitments of `agrees_to`, a secret let slip under a `yield` (learned by the lord's house by confession). The lord's
own people are ordered, not asked: their words are read by the order interpreter with them as the addressee and done
through the verbs *before* they answer, and the answer is told what they are about to do. Letters are things
(`server/letters.js`, in `state.post`): a letter is read and weighed on the day it lands, in the world of that day, by
the audience call in letter mode; the answer is a letter too, flying back the same number of days, delivered to the
inbox, the conversation and the chronicle when it lands; its promises are private and date from its writing. Words in
a written order that name a lord of another house and were not read as anything the engine can do go as such a letter.
The old answers written when the letter was sent (`pendingReplies`) are still delivered for older saves. The council's
officers speak from what their office truly knows (the steward the ledger, the master-at-arms the hosts and the
muster, the maester the letters, the season and the muster, the spymaster the reports and spies); the advisor is one
of them, chosen by the question, answering at length under headings.

## D-036 · 2026-09-27 · Lords write letters with their goals (WP D6, not B10)

**What.** Minds may not yet choose `send_letter`: a lord's letter needs something to ask or offer, which the goals and
the NPC-to-NPC diplomacy of 09 §2.1 and §2.4 (WP D6) give. Until then the realm's lords answer the lord's letters and
keep or break what they promise; they do not start correspondence.

## D-037 · 2026-09-28 · The day loop runs the old ticks a day at a time; the economy and the post still settle per week (WP B11)

**What.** `server/turn/day.js` `engineDay` runs every rule that makes time pass for one day — the year's turn, the
banners, the musters, the roads, treachery, battles, field service, the great threads, regencies, retinues, letters
landing, promises judged, the season — in the order of 03 §6.2, and dates the day's facts on it. The modules are the
old ones, called with a span of one day (their rewrite is Phase C: C2 musters, C1 movement). Two things are not yet
daily: the ledger (`settle`) and the post's bookkeeping (`postTick`) are settled at the end of each week for the days
it ran, because the economy's monthly reckoning is C4's work (06 §3); and the strain of war (`psycheTick`) is reckoned
once a week, on the realm's seventh days (`day % 7 === 0`), not once per segment — so a jump stopped midweek has lived
exactly the same days as one that ran on (this is what makes *Stop here* reproduce the days the lord saw).

**Why.** Per-day ticks with a one-day span are what a stoppable, streamable jump needs; a faithful per-day economy
would change every balance at once, which belongs with the economy rewrite.

## D-038 · 2026-09-28 · Weeks are simulated, told and streamed one after another; the council of agents is retired (WP B11)

**What.** A jump is split into weeks (segments of 7 days, the last shorter). For each: the realm's minds decide on its
first day (04 §5), the days run one by one (D-037) and stop on an interrupt (05 §4: always on a major one, on a minor
one only in an "until something happens" jump), the week's news is gathered (09 §7), and the narrator tells it (04
§6). The week is then sent to the browser at once (`POST /api/games/:id/jump` → a job; `GET …/jump/:job/stream`, SSE
`segment` / `done` / `error`), which lists its news under its dates and flashes the map where it happened while the
next week is simulated. The old progress polling stays for "who is deciding" (the `progress` SSE event of 03 §10 is
not needed). `runSwarm`, `server/agents.js`, the jump prompt and its mock clerks, the Settings choice "Who writes the
turn" and the dead chat/council prompts are gone; the director (B12) and beats wait for their WPs. The turn records
its weeks and its timings (`ms.orders/minds/engine/narrate/total`); the timings are kept in the turn's file and not in
the save, so a replay is still the same world byte for byte.

## D-039 · 2026-09-28 · Stop here: live, or after the fact from the snapshot (WP B11)

**What.** 05 §5's *Stop here* has two forms. **While the days pass**, the busy panel's "Stop the days here" asks the
running job (`POST …/jump/:job/stop {day}`) to stop at the end of the week being watched; the day loop checks after
every day. **After the fact**, the undo window offers "Stop the last turn sooner" on any day but the last
(`POST /api/games/:id/stop {day}`, `game.stopHere`): the turn is undone to its snapshot and played again with the same
orders and the same minds' recorded choices (a live model's choices are reused, not asked again) as far as that day.
The dice are the save's and the day loop runs a day at a time, so the days up to the stop come out fact for fact as
they did (`tests/jump.test.js`); what closes a turn — the ledger of the last, shortened week, and a matter the realm may raise as the turn ends — falls on the stop day. Ironman
chronicles cannot be stopped after the fact.

## D-040 · 2026-09-28 · The Director chooses a hook and a place from lists; the engine does the rest (WP B12)

**What.** 04 §7's schema asked for a hook id and "params (enums)". The params are reduced to one: the **place**, chosen
from the places the world fits for that hook (at most six: half in the lord's region, half elsewhere, turned by the
day so the list varies). Everything else a hook names — the house, its lord, its rival and friend, a knight, a
smallfolk name, the region's goods — is filled by the engine from that place (`shared/happenings.js` `slotsFor`), so the
model cannot name what does not exist. The Director is asked on **a week's first day** whenever its cadence has come
round (Settings: light = at most one hook a fortnight, the default; lively = up to two a week; off), not only in the
first segment of a jump. Whatever the setting, a **whole** week that ends with fewer than three facts of importance ≥ 2
anywhere in the realm gets one hook of the dice's choosing on its last day (09 §9 point 3); a week cut short by an
interrupt or a stop is not judged, so a stop never changes the days the lord watched. A hook is a fact of the new kind
`hook` (local; the news travels as any other), small effects on the place (prosperity, unrest), on the house's
relations with its rival or friend and on the realm's threats, and, when the place is in the lord's own realm and the
hook has one, a **matter** for his word whose answers use the matters' own effects. The mock's choice, like a model's,
draws nothing from the save's dice (its own generator is seeded by the save and the day), and the turn records the
hooks it had, so *Stop here* replays them rather than asking again. No hook kills anyone or names a canon-locked
person; the catalogue's texts are original and say nothing of what comes after 298 AC.
