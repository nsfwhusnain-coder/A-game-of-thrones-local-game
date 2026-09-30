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

## D-041 · 2026-09-28 · Memory is built from the log for each call; the chronicle is consolidated from facts (WP B13)

**What.** A call that speaks for a lord (a mind, an audience, a letter's answer) is given **the relevant memory** when a
model is asked: what has reached that lord's house in the last fortnight (what touches them, their house and where they
are first, then the realm's weightiest news), older facts of the last hundred days that bear on who and what is in
question, and the chronicle's summary lines that do, found by BM25 — within about 1,200 tokens, and only facts the
house knows. The chronicle's lines are given as *notes, not certain*, because the lord may edit it. With the mock
nothing changes (its choices do not read memory), so the replayable engine and every recorded fixture stay as they were.
The **Consolidator** is now a constrained call over the stretch's facts **as the lord's house knows them** (the chronicle
is the player's and must hold no other house's secrets): "What happened" is written by the engine from the facts of
importance ≥ 3, dated; the model writes a short summary, what is still open and what is only said. Every open thread
must name a person, house or place the dossier names (the facts, and what the engine knows is open: the house's wars,
the marches of its hosts and its sworn lords', promises, matters and letters in flight), or it is refused and dropped:
the model cannot start a thread of its own. With the mock (and as the fallback) the open threads are the engine's own.
The old turn-record digest (`engineFacts`) and the free-JSON consolidation prompt are gone.

## D-042 · 2026-09-28 · The muster runs a day at a time, with the old words kept (WP C2)

**What.** Each called lord's answer is a small machine (`engine/military/muster.js`) stepped once a day in the day
loop, as 07 §3.2 lays out, with its odds by temper, its men by the call's scope and the lord's zeal, and its gathering
days by country. Departures and details:
- `obligations.levies` keeps its old values (`called`, `delayed`, `answered`, `refused`) for everything that reads them
  (minds, officers, the realm window); the finer step is `obligations.stage` and the dated record is
  `obligations.call`. A save from before is adopted on its first day: a lord already called weighs it that day.
- The call's raven is not a letter entity in `state.post`: its flight is the raven's days between the two seats (a day
  per 300 miles), because the lord's call is one act and hundreds of letters would crowd the Letters tab.
- A call is `quick` unless the order or the verb says `full` (canon: the North's quick muster brought ~18,000).
- A lord's levies gather **at his seat** as a host serving his liege that grows quietly each day (a `muster_grew` fact,
  never a card); they set out on the day the gathering ends, with every man, for the host they are to join wherever it
  is (the rendezvous of `gatherMusters`). The lord's answer (`call_answered`) says how many and when they will march; the
  departure (`set_out`) says how many days out.
- Every date the card shows is the engine's own: *predicted* at the call (raven, two days' thought, the gathering, the
  march), then fixed when he answers and again when he sets out; a lord who must cross the sea gets no promised day
  (ships decide it). In the soak's test every lord who marched by land joined within 0–2 days of the day reckoned when
  he set out (early by the contact distance, never late).
- **Wait for the banners** holds a host where it stands, its march kept, until eight tenths of the men called and still
  coming are with it or the last expected is three days overdue; then it marches. **March now** is the ordinary march:
  the banners still coming follow it (and it stops waiting).
- "His own lands threatened" is a host of his liege's enemies of 500 or more within 120 miles of his seat.

## D-043 · 2026-09-28 · The economy's calibration knobs, and C1 in two parts (WP C1)

**What.** 06 §5.1's formulas are in `engine/economy/ledger.js` with every number in `data/balance.js ECONOMY`, and
`scripts/balance-sim.js` (`npm run balance`, and `tests/economy.test.js` in CI) holds them to §5.2. To land every great
house within ±15 % with one output per head, three knobs were needed that 06 does not name:
- **`regionOutput`**: what a head yields by the land (the Reach and the Westerlands 1.0, the North 0.8, the Vale 0.75,
  the Riverlands 0.65 — many lords, many wars — the Stormlands 0.8, the Iron Islands 0.5).
- **`domainOf`**: lords whose lands are wider or narrower than a castle's (the Dreadfort, Karhold, Last Hearth, the
  Twins wider; Dragonstone's rock narrower). Within a region people are shared by domain size, the cities keeping their
  own figures (King's Landing and Oldtown 500,000, Lannisport 160,000, Gulltown 90,000, White Harbor 60,000).
- **`tradeBase`**: markets, ports, tolls and customs per holding — King's Landing's customs are most of the Crown's
  income (72,000), White Harbor's most of Manderly's.
Tribute is a share of the sworn lord's revenue by the liege's rank (0.2; 0.1 to the Crown), no longer scaled by the
liege's taxes. The Crown's debts are loans (`state.economy.loans`): the Iron Bank, the Faith, the Tyroshi and the
Tyrells are paid in coin; **the Lannisters' interest is added to the debt** (leverage, not coin: their income stays at
§5.2's 34,000). Robert's court costs 45,000 a moon and his pleasures 25,000 more while he lives, so the Crown runs the
deficit the books describe (its coin runs out in a few moons and it borrows). The **war chest** of §12 is the coin
against a full muster's campaign cost a moon (Stark: 120,000 against ~7,300 → 16.5 moons). An older save keeps its
coin; its people grow to the new count and each house's measure of its lands with them.

**C1 in two parts.** C1a (this) is the model and its balance. C1b adds the lenders as actors (creditworthiness, the
Iron Bank's temper, default), the economy verbs of 06 §9 (`borrow`, `repay`, `call_debt`, `buy_grain`, `bribe`,
ransoms, `embargo`) and the price index of §6.3.

## D-044 · 2026-09-28 · Lenders and the economy verbs, kept to what the engine can judge (WP C1b)

**What.** `engine/economy/lenders.js` and eight verbs (`borrow`, `repay`, `call_debt`, `buy_grain`, `bribe`,
`embargo`, `pay_ransom`; a ransom *demanded* stays `judge_prisoner … ransom`). Departures from 06 §7 and §9:
- **Default** is a loan past its day and called (two moons' grace), or a debt called by its lender, not repaid when the
  day comes. A house that runs short in a moon still borrows the shortfall from the moneylenders as before; that alone
  is not a default (the Crown lives on such borrowing, as in the books). On a default the realm hears of it, the lender
  (if a house) is wronged (−30), and the Iron Bank raises that loan's rate and lends nothing more to the defaulter's
  whole realm. *Funding the defaulter's rivals* waits for the NPC diplomacy of D6.
- **Creditworthiness**: about eighteen moons of income, half the coin and a third of what is owed to the house, less its
  debts; the rate rises with the burden of debt, war and past defaults, by each lender's appetite for risk. The Bank of
  Oldtown lends only in the Reach and the Crownlands.
- **The price index** covers grain only (season, war in the region, a besieged city); horses, arms and labour come with
  C3's supply. `buy_grain` buys moons of the house's own people's needs (a man-moon for every three souls) at that price;
  under embargo no more than two moons.
- **A bribe** is taken with a chance by the sum against the person's station (§6.4), their love of gold and their
  honesty; refused, the purse comes home and the house takes offence (−8) and hears of it. What a taken bribe buys is
  recorded on the person (and in a secret fact) for the minds and the audiences to weigh; it is not a binding promise.
- **An embargo** is a pact of kind `embargo`, both ways, and can be lifted.
- `hire_sellswords` by company is C7's (07 §10).

## D-045 · 2026-09-28 · Supply: bread in man-days, the lord of the land feeds his own (WP C3)

**What.** `engine/military/supply.js`, run once a day after the marches, grown from the arena branch's
`shared/logistics.js` and fitted to the parties. Departures from 07 §6:
- **Friendly stores.** 07 §6 feeds a host from a friendly holding within two days' march. The North's castles are
  many days apart on the atlas, so a Stark host on its own kingsroad went hungry at home; a host is also fed by the lord
  of the province it stands in (the nearest holding), if he is friendly: its own house, its realm, a lord sworn to it,
  or an ally in a war. A holding gives up to a tenth of a man-day a day per head of its people, from its lord's granaries
  (the house's `food` figure, moons for its people); a castle loads a few days' bread a day, not the whole train. A lord
  feeds his liege's host freely; another's costs a point of goodwill a week.
- **"Up to 40 days" with wagons.** A wagon to every forty men with 600 man-days is fifteen days, so a host sets out with
  twenty-two days (seven on the men's backs); forty is the cap if it has more wagons than that.
- **Starving**: 1 % a day dead or fallen out, and the deserters (a fifth of a percent a day) three times over — 1.6 % a
  day, never more than a quarter of the host at once; morale −3 a day. Told once when it begins, and the week's losses on
  the realm's seventh day.
- **Disease** is this module's for the hosts of landed houses (the siege camp's own sickness in `shared/battles.js` is
  kept only for the free folk, khalasars and companies, who live off the land and have no rations).
- **Horses** graze where there is grass; in winter or on stripped land they eat half a man-day each.
- **Devastation** heals 0.2–0.4 a day where no forager came (none in winter). Road wear and mud (the arena branch's)
  wait for E, where the map can show them.
- **The price index** stays grain only (D-044 hoped for horses, arms and labour here): nothing in the game buys them
  yet; they come with the sellswords and the arms of C7.
- **The minds**: a lord whose host is short or starving marches it to the nearest of his own holdings (the house ways'
  `bread` rule); the nearest home is always among a host's places to go.

## D-046 · 2026-09-28 · Battles by stance and by the ground; the story keeps its people (WP C4)

**What.** `engine/military/battle.js` decides; `shared/battles.js` applies it. Departures from 07 §7:
- **Stances are a rule, not a mind call.** Each commander's stance comes from the host's standing orders, else from his
  courage: attack at odds 1.2 (1.0 if bold, 1.5 if cautious), fall back below 0.7, else hold. A per-battle model call
  (§7.1's "the commander's mind is consulted") was left out: battles happen inside the day loop, where a model call
  would stall a streamed week, and the weekly minds already choose whom to march against (`attack_host`, which always
  attacks). The lord's own hosts default to *Engage if the odds favour us*.
- **Neither attacks → a stand-off.** Two hosts that both hold stand in sight of each other, told once. In the old engine
  every contact was a battle.
- **Cornered**: a host whose refuge is where it stands cannot fall back and holds its ground.
- **Falling back**: a host gets clear with a chance of 0.2 + 0.5 × its pace ÷ its pursuer's (0.1–0.9); caught, it
  fights at ×0.85, and the report says so.
- **The day's fortune**: ±12 % a side is ±24 % on the odds taken together, one draw of the dice, so the war room's
  chances are exact: at even odds ~29 % a victory each way and ~42 % a bloody draw; at 1.4 a certain victory. Upsets
  come from what the war room cannot see (a turncoat's men, surprise, hunger), not from the dice.
- **Surprise** (×1.6 in the first of two phases, so ×1.26 over the day) when an `attack_host` order asks for it and the
  enemy has no eyes on the host, or when the attacker falls on a host in a wood that does not see it.
- **The story's people**: `data/fates.js` holds 08 §5's canon deaths and protected people. Jaime Lannister is added
  to the protected: his capture in the Whispering Wood is a beat of the story.
- **Rivers and fords** (×1.4) and **raids** (§7.6) are not yet: the atlas has no fords for the engine to read (C6
  brings the coasts and the raids). Night attacks are a surprise.

## D-047 · 2026-09-28 · Sieges: terms, storms and the castles that cannot be starved (WP C5)

**What.** `engine/military/siege.js` (from `shared/battles.js`'s siege) and `data/fortresses.js`. Departures from 07 §8:
- **The fortress table raises walls, it never lowers them**, except Harrenhal under 1,500 men. Its `fort` is the walls
  the engine fights; the holdings keep their own number for everything else.
- **The storm's odds**: the besiegers' field power (×1.3 once the siege is a week old: the engines) against the
  garrison as men-at-arms × (1 + fort × 0.6) **squared** — once for the walls, once for the gates and towers. With the
  GDD's single factor a great host carried any castle; squared, Riverrun's two thousand throw back twelve thousand, and
  sixty men cannot hold a small castle against fifteen thousand. A storm carried costs 20–35 %, a failed one 30–50 %.
- **Terms** are weighed at once by a rule, not a castellan's mind: how generous the terms (marching out 0.45 …
  unconditional 0.05), the host outside against the walls, the stores left (if the castle is starving at all), relief
  near (×0.3), and the castellan's courage, pride and stubbornness. **Swear and keep** and **hostages** leave a lord his
  own seat (not a great lord's); the house leaves the war, and swears to the besieger's realm or gives one of its own
  (an heir first) as a hostage. The realm's besiegers offer terms once a week after the first; the lord offers them from
  the castle's card, no more than once a week.
- **Starved**, a castle yields without terms, and its castellan is taken.
- **Treachery**: a castellan who took gold from the besiegers' realm (`bribe`, which now records `bought` on the person)
  opens a postern after three days. Other schemes wait for D (intrigue).
- **Relief**: a host of the castle's side within three days' march is announced once; the realm's besiegers storm first
  if they can (≥ 1.2), stand if they can meet it (field odds ≥ 0.9), else lift the siege. The lord decides for his own.
- **Blockade** is only ships of the besiegers' side lying within ~55 miles; the verb and its trade effects are C6's.
- **Not yet**: the Red Keep and the Hightower as keeps within their cities; the Rock's sea caves (a scheme).

## D-048 · 2026-09-28 · The sea: fleets carry, blockade and reave; the old crossings stay (WP C6)

**What.** `engine/military/naval.js` and the verbs `embark_host`, `land_host`, `blockade`, `raid_coast`. Departures from
07 §9:
- **Two ways over water.** A host ordered to march to another landmass still finds its own passage (A8's
  `shared/sea.js`: its ships, a few boats making trips, or the realm's ships sent to fetch it). A fleet that *carries* a
  host is the new, deliberate way: aboard in port, the fleet sails where it is sent, and the host is put ashore where it
  lies. Both stay: the first keeps islands' lords answering the banners without the player's help.
- **Ships by kind** are reckoned for each fleet from its house and make-up (the ironborn all longships, the Essos cities
  carracks and galleys, fleets of "galleys" four in five galleys, the rest half galleys and half cogs) and scale with the
  ships it keeps. Embarking takes no time in the engine (the day per 2,000 men is told, not waited for); landing does.
- **Raids** last a fortnight from the **first landing** (a voyage from Pyke to the Stony Shore is two weeks and more),
  over the enemy's coast within ~220 miles of the holding named ("the Stony Shore" names Deepwood Motte); a village
  every other day. A garrison more than six-tenths the raiders' strength beats them off. Captives are a flavour line
  ("thralls and salt wives"), never people in the state (10 §8.5).
- **Blockade** is the fleet lying within ~55 miles of the port; sailing away lifts it. A besieged port is starved by a
  blockade or by any ships of the besiegers' side lying before it (D-047).
- **Sea fights** are fought when fleets at war meet and one is sent against the other or outweighs it by 1.2; a third
  of the loser's lost ships are the victor's prizes; a beaten fleet runs for its home port; a fleet sunk takes its hosts
  down with it. Wildfire (the Blackwater) and hired passage (Salladhor Saan, the Braavosi) wait for C7.
- **Minds**: the head of a house sends its fleets (the house ways' `iron_price` for the ironborn: reave; everyone's
  `blockade` when an enemy port is besieged). The fleet verbs are offered to the order interpreter only for a house that
  has a fleet, and the siege verbs only for one before a castle's walls (the prompt's budget).

## D-049 · 2026-09-28 · Free companies by contract; outlaws as a mark on the land (WP C7)

**What.** `engine/military/companies.js`, `data/companies.js`. Departures from 07 §10:
- **Only the companies the scenario has.** The Golden Company and the Brave Companions exist as houses in 298; the
  Second Sons, the Stormcrows and the Windblown come with Essos (WP G). A company's price is a man's wage a moon (the
  Golden Company 2.5, the Brave Companions 3), paid a moon at a time from the employer's coin — on signing and every
  thirty days after — outside the ledger's projection (the receipt and the Military window say it).
- **Loyalty**: every company marches off after one moon unpaid; only a turncoat company (the Brave Companions) goes
  over, and only for half as much again as its contract; the Golden Company keeps its word.
- **Hired passage**: a company that must cross the sea buys its passage (a week to find ships, then the voyage).
  The Dothraki are refused both ships and passage — "the poison water" — and `embark_host` refuses a khalasar.
- **Outlaw bands are a mark on a holding** (`h.outlaws`), not a party: they rise where war and foraging have laid the
  land waste (devastation ≥ 40, the land at war), make its roads deadlier (+0.2 danger), take a little prosperity and
  add unrest each week, and scatter when 500 men of the land's own realm come within ~25 miles, or melt away a moon after
  the war and the waste are over. A party of their own, hunted over the map, waits for E (the living map).
- **The Night's Watch** takes 20–30 recruits a moon; no house declares war on it, and it declares war on no one.
- **The free folk** grow 1 % a moon to 90,000 (the scenario begins them at 60,000, more than 07 §10's 2,000: the host
  beyond the Wall in 298 is the scenario's). They stay held beyond the Wall until the story moves them (D-022).

## D-050 · 2026-09-28 · War score from the facts; peace by terms, weighed (WP C8)

**What.** `engine/politics/war.js`. Departures from 07 §11 and 08 §12:
- **The score is reckoned from the day's facts** (battles, sea fights, castles taken or stormed, sieges raised, raids,
  lords taken or slain) between the war's two sides; each fact counts once. Devastation does not count on its own (the
  raids and sieges that cause it do).
- **Peace is three terms, not a treaty table**: a white peace (each keeps what it holds; both free their captives); a
  concession (the side that concedes pays up to three moons of its income and frees its captives); a demand (the other
  side must concede). Holdings are not traded in the terms: each keeps what it holds. Border treaties, marriages and
  hostages as terms wait for D (politics).
- **The answer is a rule** (the score as the answering side sees it, the war's weariness, the leader's pride,
  stubbornness and warmth), not a mind call; the realm's lords answer at once.
- **Who makes peace**: the leader of each side (the first house named on it, or the realm's head for its sworn houses);
  a sworn lord cannot make a separate peace (he can withdraw from the war with D's politics).
- **The beaten side sues** once the score is 50 either way and the war a moon old, at most once a moon; when the lord is
  the victor it is a matter with two answers, when he is the beaten one he must sue for himself.
- **Cold wars** are marked after six moons without a blow and told once; the score does not decay.

## D-051 · 2026-09-28 · The beat engine: data and meta apart, effects as functions (WP D1)

- **Two files.** The threads (dates, preconditions, what happens) moved from `plots.js` to `public/data/beats.js`; the
  v2 schema's extra fields sit in a `BEAT_META` table keyed by `thread.stage` beside them, so the 11 threads were ported
  without rewriting each beat. `engine/world/beats.js` turns both into beats and runs them.
- **Effects stay functions** that return ops, facts and matters, as before; routing them through the verbs (10 §3's
  `{ verb, actor, params }`) waits for D2, when the full beat set is written anew.
- **Triggers:** `date` (the window opens), `arrival` (a party halted at a place), `death` (a character dead — the
  schema's fact-match trigger, narrowed to the one fact the ported threads need) and `after` (days behind another beat,
  the lower bound of the range).
- **Canon gravity** is chosen at the begin screen (Canon, Loose, Sandbox) and kept in `meta.settings.canonGravity`. A beat
  the setting forbids passes silently when its window closes. Under Loose the pillars are: the Imp taken and the
  Riverlands burning, the boar, Ned's arrest (or Joffrey's quiet crowning), Robb's banners, the Twins, the dragons, the
  ironborn crown.
- **Canon locks** cover the people a beat names from a moon before its window to its end. They bind the realm's minds
  (a lord does not send a named person on an errand); the player is never bound — what the player does may make a beat
  take its alternate or lapse.

## D-052 · 2026-09-28 · The full canon: 60 beats, and what keeps the chain whole (WP D2)

- **Sixty beats in fifteen threads**, one per row of 10 §4 where the row is a thing that happens (K3 and K4, the
  betrothal and Lysa's letter, stay inside the King's matter at Winterfell; the Tourney is one beat, not two; T1–T2, I3
  and H4 were already there; D6 is three rumours from Essos). New threads: `young_wolf` (the Green Fork to Karstark's
  justice), `riverrun` (Hoster's death) and `omens` (the red comet and the Citadel's white ravens). Effects stay functions
  returning ops (D-051); the verbs' way still waits.
- **What the playtest found and what now holds the chain** — each was a real break, not a tuning:
  - the boar came before the Hand reached King's Landing (he rides at a household's pace): under Canon it now waits for
    the Hand at court, and for the Riverlands to burn, as in the books;
  - Lord Walder died of his years before his bridge was needed: under Canon the years spare anyone a beat still to come
    names (`canonAhead`) — the story kills them, or the window passes;
  - the realm's lords sued for peace in the War of the Five Kings in its second moon: the wars the canon begins
    (`lannister_vs_tully`, `war_of_five_kings`, `ironborn_reaving`, the Watch's) are not settled by the realm's minds
    under Canon; the player may still sue;
  - Lady Lysa ransomed the Imp before his trial, and Lord Hoster released his own son: the minds do not judge a prisoner
    the canon still needs, and a captive is held in the captor's camp, not his own hall;
  - Lord Balon sent his son away from Winterfell on an errand: a lord sends only the household at his own holdings;
  - a beaten host fled across the sea to its island seat: a refuge must be reachable on foot.
- **The Whispering Wood under Canon is the books' outcome**; if the war has already taken the Kingslayer another way, the
  beat bends (the river lords bring him in chains) and the thread goes on.
- **Seasons:** under Canon the Citadel's white ravens of 299 (autumn) and 300 (winter) are beats; the dice's season clock
  waits until 301. Loose and Sandbox keep the dice.
- **Q9 measure:** a beat counts as fired only when it fired as written (an alternate is "bent", not fired); a beat is due
  once its window has closed or it has happened. `scripts/canon.js` runs it; one house runs in CI, three nightly.

## D-053 · 2026-09-28 · The matters catalogue: templates with `raise`, and an op that refuses the rest (WP D3)

- **One file, `public/data/matters.js`.** A template is `{ group, gist, raise(ctx) }`; `raise` returns the matter (title,
  text, who asks, where, two to four answers with hints and `fx`, the silence's `lapse`) or null when the world has no
  place for it. `ctx` (`matterContext` in `shared/petitions.js`) gives it the house's vassals, lands, friends, neutrals,
  rivals, foes, children, household, captives and treasury. The matters raised where they happen (vassals, the war, the
  beats, the Director's opportunities) are catalogued by id and gist only; their words stay beside the rules that raise them.
- **The `decision` op requires `matter`**: a catalogue id or `hook:<id>`. There is no path left for words the engine
  did not write to become a matter; a matter records its template, and the "not twice in six turns" rule now keys on it
  (before, it keyed on a mangled title).
- **Drawn, not scripted**: when a moon passes with nothing before the lord, one template the world has a place for is
  drawn at random among the realm's, the lords' and the household's; a lord at war is asked for peace or submission, a
  lord with captives is asked to free them, a lord in autumn is warned of winter.
- **Fewer than the GDD's list, by design**: the GDD's canon matters that belong to beats not yet written as matters
  (Renly's offer, the Iron Price, the kingsmoot, Jon's future, Lady, the debt, Jeyne, Karstark, Tyrion's trial) arrive
  with them; `terms_offered` stays a verb (`offer_terms`), not a matter.

## D-054 · 2026-09-28 · Life: one guard over every death of chance; fates as data, not character fields (WP D4)

- **The windows stay in `data/fates.js`** (`CANON_DEATHS`, `CANON_PROTECTED`, and now `CANON_REGENTS`, `NOT_REGENT`)
  rather than a `canon.deathWindow` on each character in `data/characters.js` as 08 §5 has it: one table the story's
  rules read, beside the beats that kill, and no migration of saved characters.
- **`keptByStory` moved to `engine/people/life.js`** and guards every death the rules roll for — the year's turning, a
  festering wound, a fever, a winter chill, a lance in the lists, a battle. Deaths by a beat, by the player's order, by
  a mind's deliberate act (a judgement) or by a decision are not chance and are not guarded. Under Canon, anyone a
  beat still to come names is spared too (D-052's `canonAhead`).
- **Wounds heal.** Before, `wounded` was forever (the D2 playtest showed half the realm's great lords limping for two
  years). A wound is reckoned from the day it is first seen: it heals in 30–90 days, one in twelve festers.
- **Invariant 11** records each death's day and what caused it (`diedDay`, `diedBy`) and fails when, under Canon, a
  character with a canon death died of chance before their window opened, or a protected one before 301.
- **Regency (B-23):** the named regent first; the widowed mother whatever house she was born to (Cersei is a Lannister);
  the seat's sworn officers before distant kin; never another branch's man or an outlaw. Starfall under Edric has no fit
  regent in the data: the house drifts, as regencyTick already charges.

## D-055 · 2026-09-28 · Nature on the map: billboards, a latitude snow line, tints over the atlas' biomes (WP E3)

- **Billboards, not crossed quads.** Each tree is one camera-facing quad that turns about its own upright and leans
  back a little toward the camera (45% of the way to a true billboard), so trees read from the steep L2–L3 views without
  the X-shaped silhouettes crossed quads show from above. They cast no shadows (the budget of §10); the canopy's mass
  in the terrain shader gives the forests their weight.
- **The atlas is drawn in code** (`treeAtlas()` in `map3d/nature.js`, 256×64 RGBA) rather than committed as a PNG: no
  asset to keep, deterministic, and testable in Node.
- **The snow line is a latitude in map units** from `world.season` and `world.seasonDays` (summer 520, the Wall 600, the
  Neck 1120, the Twins 1340), not `world.snowLine` in the state: it is how the map draws the season, not a fact of the
  world, and so needs no migration. For it to creep through an autumn under Canon gravity, `seasonTick` now counts a
  season's days even while the Citadel's ravens are held for their beats.
- **The regional palette is a tint over the atlas' biomes** (six soft pools of colour, on the hills or the plains)
  rather than a new biome table: the worker's climate stays as it was, and the tints are data (`REGION_TINTS`).
- **Weirwoods are drawn by chance** (about one tree in 250 in the North, one in 1,250 south of the Neck), not
  placed at each godswood: the godswoods are inside the castles, which the settlement models draw.

## D-056 · 2026-09-28 · Labels: realms above the great seats; pins always shown; plates may step (WP E4)

- **The realms' names rank above the great seats** (11 §8 lists the player's seat, great seats, cities, plates, castles,
  features, and does not place the realms). Realm names are shown only from L1 out, where they are what the map is
  for; a great seat that collides with its realm's name gives way until the camera comes closer.
- **News pins and waiting matters are always shown** and reserve their room first: they are small, few, and must stay
  findable at every zoom (B10).
- **A host's plate may step one line below, above or two below its point** before it is hidden, as the old stacking
  did; nothing else moves.
- **The overlap assertion is measured in the browser** (`dev/map-lod.html` counts overlapping drawn boxes, and the
  `labels-*` screenshot scenarios fail on any) as well as on the pure placement in `tests/map-labels.test.js`; CI runs
  only the latter (no browser in `npm test`).

## D-057 · 2026-09-28 · Tokens: plates over the existing figures; syncParties later (WP E5)

- **The plates and the stack are new; the 3D figures are the existing ones** (`models.js` buildArmy: soldiers, ships,
  banners), scaled with the log of the men. §6.2's marching columns ∝ men, camps with tents and smoke, retinues of
  riders with litters and wheelhouses, and the progress's 40-figure column are left for E6/E7 (states and ambient
  life), which rebuild those models anyway. The token's size and the progress's gold rim are the E5 part.
- **`syncArmies` keeps its name** rather than becoming §6's `syncParties(prev, next, keyframes)`: the keyframes are
  E8's (playback choreography), and riders stay in `syncRiders` until then.
- **A stack forms on screen, not in the world**: plates within 18 px merge, whatever their owners; the pointer on a
  stack fans it out until it moves 90 px away. The anchor is the largest party. Each plate is anchored at its party's
  true point (the models still fan out so each stays visible).
- **Garrisons are not drawn** as tokens or plates; the castle's card already gives the garrison. The "small shield
  pip on the castle" waits for E6 (holding states).
- **Routes (§6.3)**: your own in gold with the days left at the end; an ally's faint blue; an enemy's is no longer drawn
  (it was red): the map shows what the player would know of others' orders, which is nothing.
- **This week's word carries no age** on a reported plate ("~6,000?"); older word says how old ("· 7 days old").

## D-058 · 2026-09-29 · Headline tense: the news present, or a bare participle; summaries in the past (WP N1)

- **A headline is news-headline present, or a bare passive participle when the patient is the news**: "Lady Hornwood
  refuses Stark's summons", "King Robert crosses the Green Fork", "Robb Stark slain by Tywin Lannister at the Green
  Fork". **The summary under it is in the simple past.**
- **Why.** 18's own §4 examples and 20 §5 are in the present, and newspapers and Pax are too; "past, always" (18 H2)
  would read "Lady Hornwood refused Stark's summons" in a feed that is already history, and contradicts the examples
  the same document gives.
- **Replaces** 18 H2 ("past tense … past, always") and §3.2's instruction to the narrator, and the scorer's rule `past`,
  which is now `verb`: the headline holds a finite verb or a participle from `HEADLINE_VERBS` (`public/data/style.js`); a
  bare noun phrase ("Battle near the Twins") fails.

## D-059 · 2026-09-29 · Work packages ship in slices (all WPs)

- **Related work packages of one chain share a branch and a PR**: N1+N2 (Slice 1), then, as planned, R1–R3, N3+N4,
  U1–U3, N5+N6+N9 and so on. Every WP keeps its own acceptance criteria, its own roadmap mark and (in the slice's
  changelog entry) its own line; a slice is merged only when all of its packages are.
- **Why.** The packages of a chain share files and are tested together (N2's slots are read by N1's fixtures; the writer of
  N3 is scored by N1), and `00-agent-brief.md` §5 (item 4) allows a PR "per small group of related packages". One PR per
  package would be four reviews of the same files.
- **Departs from** the one-branch-per-package wording of `docs/gdd/18-headlines.md` §5 ("its own branch
  `wp/n<k>-<slug>`") and of `CLAUDE.md`'s Git rules, for chains only; the branch is then named for the slice
  (`wp/n1-n2-headline-foundations`).

## D-060 · 2026-09-29 · The headline scorer's shape (WP N1)

- **`BOILERPLATE` and `JARGON` are new exports of `public/data/style.js`, separate from `FORBIDDEN`**, so the audience,
  council and consolidate validators, which read `FORBIDDEN`, are unchanged. The scorer's `boiler` rule reads all of
  them. "Rides for" is not boilerplate ([20](20-pax-reference.md) §5.2 row 16 calls "King Robert rides for Winterfell"
  good); "Banners of" is, unless "the" follows ("the banners of the North" is English).
- **Beyond 18 §5.2 the scorer also fails**: an uncalled-for "House X" or "the Xs" (`invented`: a house the story does
  not hold, the player's own excepted); a house written "X of Place" (`boiler`: the ledger's form); a headline ending in
  `!` or `?` (`punct`). It **accepts the story's houses for `who`** (a house of the story counts as a name, as a person
  or a place does).
- **An anachronism phrase is allowed when the story's own facts say it** ("crowned King in the North" in the story of the
  crowning): the guard is against a headline that knows more than its facts, not against the facts.
- **`roles` is read on the summary as well as the headline; `outcome` on the headline only** (a summary may say how a
  death came without claiming an outcome the headline does not).

## D-061 · 2026-09-29 · Fact slots and labels as built (WP N2)

- **The slots** (additive; a slot is present only when the engine knows it):
  `battle`: `winnerHouse`, `loserHouse`, `how`; `slain_in_battle`: `by`, `how`, `battle`, `place`;
  `captured_in_battle`: `by`, `battle`, `place`; `executed`: `by`; `death`: `how` ∈ `age | illness | wound | fever |
  winter`; `call_refused`: `why`, `liege` (no `why` when it was only the roll of the dice). Emitters:
  `shared/battles.js`, `shared/world.js` (`note()`), `engine/military/muster.js`, `engine/actions/court.js`,
  `engine/people/life.js`, `server/turn/day.js`. `shared/diplomacy.js` emits nothing and `engine/military/battle.js` only
  resolves, so neither changed. The slots for `siege_*`, `crowned`, `wedding` and `arrived` in 18 §3.1 are not built.
- **Battle `how` reuses the battle report's decisive-factor phrases** ("numbers and arms", "generalship", "the ground",
  "surprise", "fortune"), not 18's `'charged' | 'held' | 'ambushed' | 'night'`: the engine resolves by factors, not
  tactics, and the writer of N3 turns a factor into a clause. A draw has `null` houses and no `how`.
- **`captured_in_battle.data.by` is a commander's id, else the captor house's id**: consumers look up characters first,
  then houses. A slain man is put to the enemy commander who stood at the end of the day, never to one who fell or was
  taken on the same field.
- **Labels** (`public/js/engine/facts/label.js`): "the Crown" for the crown; "House Martell" (the data's "Nymeros" epithet
  dropped); "House Baratheon", not "Baratheon of King's Landing"; a branch's host by its seat when two houses share a name
  ("the Dragonstone host"); five or more names become a count with two named ("six in all, Umber and Manderly among
  them"). `ago/soon` is not built.
- **The lint rule** "importance ≥ 3 ⇒ a `HEAD` entry" of 18 §3.1 (and "⇒ has slots" of N2's row) becomes a test in N3:
  `scripts/lint-engine.js` is a line scanner and cannot see a fact's importance.
## D-062 · 2026-09-29 · Art direction "the maester's desk" replaces the dark glass panels (WP U0)

- **[GDD 21](21-art-direction.md) supersedes [12](12-ui-ux.md) §3.1 and §3.3** (dark glass panels, a flat gold accent).
  Each surface is a material with a meaning: *vellum* = the maester wrote it; *oak and leather* = the frame you hold;
  *iron* = press it; *wax* = awaits your word; *gold leaf* = read first. No `backdrop-filter` on chrome; one ornament
  per surface.
- **Why:** the owner's review found the interface "modern, made by AI"; the setting needs heart. Pulled forward from
  F1 so that U1–U3 are built in the new look once, not restyled afterwards. §3.2 (type) and §3.4 (the component list)
  of 12 stand, restyled in 21.

## D-063 · 2026-09-29 · Textures are generated, not fetched (WP U0)

- **`scripts/paint-ui.js` paints them** in a browser canvas with fixed seeds (byte-identical runs) and the files are
  committed to `public/img/ui` (about 110 KB).
- **Why:** no licences, no network, deterministic, tiny. Every material degrades to its base colour if a file is
  missing.

## D-064 · 2026-09-29 · Wax is pigment; the ribbon keeps the arms (WP U0)

- **`--wax` is the richer of the arms' two colours** (saturation ≥ 30 %, lightness 10–80 %), else oxblood `#7b1e17`.
  The ribbon and the portrait's rim keep the arms' colours: `--house-1` and `--house-2` come from the house's sigil
  (`house.sigil.f` and `.cc`), not from `THEMES` (whose Stark is blue).
- **In play:** Stark, oxblood wax on a grey ribbon; Lannister, crimson; Tyrell, green; Greyjoy, gold.

## D-065 · 2026-09-29 · Icons keep the game's stroked hand (WP U0)

- **The existing set is kept** (69 icons before U0, 79 after), drawn on a 24-unit grid in the current colour. U0 adds
  `chain`, `weirwood`, `book`, `seal`, the tier marks and `inkpot` in the same stroke, rather than redrawing the set as
  filled silhouettes.

## D-066 · 2026-09-29 · Illuminated initials are for prose only (WP U0)

- **The illuminated initial belongs to prose** (the welcome, letters), with the rest of the first line in small caps.
  Headlines and the digest are numbered instead, the first numeral in gold leaf.
- **Lining figures everywhere for now:** the bundled EB Garamond subset has no old-style figures (`onum`), so `.wc-prose`
  gets them only when the fonts are re-subset (F1).

## D-067 · 2026-09-29 · Refused and unsure orders (WP SB)

- **`call_banners` holds to a land rule, as `raise_levies` does** (B-34). The muster point must be the house's own land,
  a sworn lord's, an active ally's, or a point that is no holding; anywhere else the verb is refused whole
  ("Winterfell is not your land: the banners cannot muster there"). It is a little wider than `raise_levies`, which
  takes only the house's own land and its sworn lords': a host may gather among allies, but a lord's own levies are
  raised only where he rules.
- **An order that names another house's person is not bound to your biggest host** (B-35). "Robb is to march the
  Northern Host…" as a Lannister is read as `send_person` for Robb, which the verb refuses ("No one of yours by that
  name"); a sworn lord who leads a host that answers to the house is still the house's to move. A "the <Adj> host" that
  is none of the lord's (nor a generic word such as "whole" or "royal") is `march_host` with no host: "no host in the
  field".
- **A guessed host marks the reading unsure** (`complete = false`): when nothing in the words said which host, the
  house's biggest is a best guess, and a model may be asked (with its schema, mock and fallback) rather than the rule
  moving an army on a hunch.

**Why.** A receipt must never say ✗ while half the order runs (B-34), and a lord must not move the wrong army (B-35).

**Cost.** The pre-parser's sure readings on the order suite go 266 → 263 (three orders now ask); the exact reading on
the mock is unchanged at 99 %. Tests: `tests/bugs-sb.test.js`.
## D-068 · 2026-09-29 · The realm sample covers every house of the scenario, thinned by 28-day buckets (WP R1)

- **Every house of the scenario is sampled** (158 today: the houses of standing and every minor house sworn to one), not
  the ~30 that 19 §3.1 pictured. Older samples are thinned to the first of each 28-day bucket (by the day's own number, so
  thinning twice changes nothing); the newest 16 are kept whole, and never more than 48 in all.
- **Budget: 60 ms and about 0.8 MB at the cap, instead of 10 ms and 110 KB** (≈ 0.5 MB at 40 turns). Why: the tests and the
  ledger's "all known" scope need the minor houses, and the save stays far under the 5 MB state budget.
- **`people` is stored in whole souls, holdings are counted from the map's public owners** (19 said hundreds).
- **Follow-up (R7):** an owner index inside `standing()` and `project()`, which scan every holding per house (a prototype
  reached 15 ms). `tests/soak.test.js` does not yet assert the sampling budget (19 §9 said it did); R7's soak should.

## D-069 · 2026-09-29 · The truth series never leaves the server (WP R1)

- **`playerView` drops `realmStats`, `viewTurn` drops `record.realm`, and invariant 10 flags both** (`hiddenTruths`).
- Found by the R builder: before the fix, `GET /api/games/:id` carried every house's true figures (coin, levies, income).
  The State of the Realm is asked of the server (`GET /realm`), which builds it from the house's knowledge, so the
  browser has no use for the series and must not have it.

## D-070 · 2026-09-29 · The State of the Realm opens with R, not S (WP R4, decided in R1–R3)

- **The hotkey is `R`**, the Realm button of 17 §2.2, not `S`: 19 §6.1 found `S` free among the dock's letters, but `S`
  pans the map (`public/js/map3d/MapScene.js`, with `W A D` and the arrows). 19 §6.1, §10 and R4's acceptance, and 17's
  reconciliation note, are corrected.
- **One look, no light theme** (GDD 21): R4's screenshots are at the two resolutions only, not "light and dark".

## D-071 · 2026-09-29 · Estimates as built: the tiers, and where they depart from 19 §4.2 (WP R2)

- **The tiers.** Self: exact, live. Sworn house: read live, blurred by ±4.5 % (so 3 significant figures never read
  further than ±5 % off) — an ally's coin is a band (±25 %). Every other house: the newest observation of each figure,
  by the way it came — swords and ships `≥` (hosts and fleets seen or reported), people and holdings `~`, income and
  Power `≈` bands, levies a band from believed people × the rank's muster share, gold a word ("sound", "modest",
  "pressed") unless a spy has taught it (then `~`, 3 figures, dated).
- **Power of others is `standing()` run on the displayed inputs**, shown as a band (`≈`, the middle is what ranks), so the
  viewer's ranking is the one it could make.
- **Who is listed:** a minor house only once it has been heard of; the greater ranks from turn 0, on a rank-based prior
  (`rumour`) until an observation replaces it.
- **A reported series of fewer than two points has no direction** (`—`, not "steady"); a house watched live with one
  sample says `—` too, until the record has a second.
- **`observe` runs in `updateKnowledge`, for the player's house only** (as 19 §3.2 allowed), with `hash32` noise and no
  dice. A spy's figure is a fact with `data.realm = { house, field, value }`, kept by `learn()` beside what was learned
  (the fact itself leaves the log at the turn's end). Wars are listed when a friend is a side or a
  `war_declared`/`war_joined` fact is known; flags, facts and focus are empty until R6. Extra scopes: `mine`, `war`.

## D-072 · 2026-09-29 · Clustering as built (WP N4)

- **Cuts:** a story is cut at an archetype boundary above 6 facts and at a place boundary above 8 (18 §2.4 said 6 for
  both: a muster of one place with its host's forming reads as one story); a story that buries news of weight 4 or more
  in another archetype is cut however small (a refusal inside a muster).
- **Roll-ups by road**, beyond set-outs: vassals answering one call (`call_answered` by `data.to`), hosts joining one
  host (`host_joined`), arrivals at one place. A host's same-day, same-place, same-people facts ride with it.
- **The Meanwhile (C7) takes more:** a lone minor march (importance ≤ 2) touching neither the player's house nor seat,
  and "ambient" stories (kinds whose default importance is 1) — about a third of all cards in a 60-turn soak were such
  noise. Nothing is dropped: they are one sentence.
- **Arrival:** facts heard at different times (`heard.via` and day) are never one story (B-32); the narrator copies each
  card's `heard`/`late` onto its facts before clustering. Ids sort naturally (f3.9 before f3.10).
- Why: GDD 18 §2.4's aim — one card per story, not one line per fact — measured on two recorded games (tests/fixtures/
  headlines/turns); facts per story 2.7 on a muster game, 1.5 on a quiet one.

## D-073 · 2026-09-29 · The writer as built (WP N3)

- Templates per kind (`HEAD`, `SUM`, `DETAIL`) with two to four forms chosen by a hash of the fact id; a natural death
  always reads "<name> dies (of X) at <place>" (plain beats varied there).
- Other houses' figures appear only in `details`, rounded to two significant figures ("about 10,000"); the viewer's
  own house, its vassals and allies keep exact figures. Headlines and summaries never hold digits.
- A holding named for the one who leads it ("Mance Rayder's host") is never used as a place clause; an order, a tribe
  or a company is never pluralised ("the Night's Watch", not "Night's Watchs"); a foreign call to arms says against
  whom when a war is public, and "nothing yet says against whom" when it is not.
- Open: a minor lord under a regent (Robert Arryn) is named as the subject; naming the regent (Lysa Arryn) may read
  better — left for N5/N6 with the owner's eye.

## D-074 · 2026-09-30 · Narrator v3 as built (WP N5): the writer's cards, the model's scenes

- **Departure from 18 §3.2.** The plan had the model say every card better than the writer's draft. Measured on the tuned local model
  (Maester-12B, `maester-12b:plain`; 60 weeks of 12 seeded games, `npm run bench -- --suite narrate --mode cards`): **61 %** of 151 stories
  passed the game's own validator first time (39 mended by a retelling, 20 left to the writer; 9.7 s a week). Asked only for a *scene*
  (`--mode scenes`): **99 %** of 238 stories first time, 1.4 s a week. So the narrator has two modes, config `narratorMode`:
  `"scenes"` (**the default**: every headline and summary is the deterministic writer's, always true, instant; the model writes a scene
  of two to four sentences, behind one witness's eyes, for at most **3** stories of tier major or great) and `"cards"` (the model also
  says the card and the Meanwhile sentence, for the **6** best stories of tier news and above; an opt-in for a model tuned for it).
  The scene shows behind "Details"; a card without one is a whole card.
- **The floor is the writer.** The mock and the fallback are `cardOf`, so CI runs the whole path and a dead or wrong model leaves
  cards that read well. A story told wrongly is told again alone, once, with what was wrong; told wrongly twice, the writer's card
  stands (no scene). `told` on a card says who wrote its words: `'model'` (a scene, or in cards mode the card) or `'writer'`.
- **The prompt** (story sheet per story: WHO, WHY/HOW, COUNTS in cards mode, THE CARD or a DRAFT, `NAME ONLY` — the names the validator
  allows, in the herald's forms — and POV) has no "who is where" line (it made the model name the castles its people live in) and no
  `pov` field in the schema (a length-limited free string degenerated into "The Twinsfffff"); the scene's witness is the clusterer's.
  The style bible's last line no longer asks scenes to end on "what it will cost" (every scene did). Snapshot: `tests/__snapshots__/prompts/narrate.txt`.
- **Checks on a model's telling:** the names/arrivals/places/numbers of `validate/narration.js`; in cards mode also `scoreCard` and a
  headline not used twice; in both a scene must not be a note to the reader ("(Correction: …)", "as requested") or run on to nothing
  (`sceneProblems`). Numbers may be a rounding to one or two figures of a story's own ("some three hundred" for 349, "four thousand" for
  3,800: `numberFits`); ledger phrases are refused where they are ledger ("Host of House Umber (…)" opening a line), not where they are English
  ("the host of House Stark", "the banners of House Stark").
- **Record** (per week, summed per turn): `mode`, `asked` (the story ids put to the model), `smallIds`, `told` (asked and answered),
  `again`, `plain` (asked and the writer stands after a failure), `written` (never asked). `told + plain + written = stories`. The bench
  scores "true on the first telling" over the stories *asked*.

## D-075 · 2026-09-30 · The card in the turn record, and the digest (WP N6)

- A card is `{ headline, summary, details: [strings], scene?, pov?, tier, score, kind, archetype, who, told, … }`; `title` and `text` stay as
  aliases of the headline and the summary, so every surface not yet rewritten (and every old save) still reads them. **`details` is a list**
  (it was a string): `shapeCard` (`engine/facts/digest.js`) makes any card into this shape — an old card's string becomes one line — and the
  UI reads it through `foldText`. A story's card carries the engine's own lines as `record` ("the numbers are one click from the prose").
- **The digest** replaces the turn's `summary` (which keeps its name, holding the digest's text, for the world log, the bench and the
  playtest): `{ top: [{ id, headline, line }] (≤ 3, the best cards by score, each a headline and the first whole sentence of its summary), also: [{ id, headline }]
  (≤ 5), meanwhile (one sentence), words, text }`, at most **90 words**, built from whole pieces (a sentence that will not fit is left out, never cut),
  by the engine from the cards, so it can never contradict them.
- **Old saves** are read in the new shape at the view (`server/view.js` `viewTurn`): every card shaped, a digest made if the turn has none.
  Nothing on disk is rewritten, and the old turns keep their old words.
- **Late news** (a raven, a rumour from an earlier turn reaching the house now) is told from the fact log (`lookup`), in the same words as the
  rest; a fact of an earlier turn is no longer a raw engine card (B-32). A card whose facts are all small news, and a small news card, are
  told by the writer too and shown in the Meanwhile (`tier: 'meanwhile'`, `bg: true`).
- **The chronicle** (`chronicle.md`), **the consolidated "What happened"** and **the world log** are written from the cards (headline — first
  sentence), never from the engine's lines (`toldHappenings`); the lord's answered matters are told as his answer ("Eddard Stark settles the
  matter of a grievance at court — He chose to grant him a small honour"); the succession card is the writer's.
- `state.firsts` (`{ key: turn }`, the ranking's memory, D-076) lives in the save, comes back with an undo, and is stripped from what the
  browser is sent (`playerView`, `hiddenTruths`).

## D-076 · 2026-09-30 · Ranking as built (WP N9)

- `engine/facts/rank.js`: score = importance + 1 the house's own (its houses, its kin — a wife, a child, a parent — or its people are in the
  story) + 0.5 at a holding it owns or where its hosts stand (40 miles) + 1 the first of its kind this chronicle (only news of weight 3 or more has a first:
  `battle`, `slain_in_battle`, a raven from a house) + 0.5 a standing thing changes (a holding fell, an office, war or peace, a house's end) − 1 for each card of
  one archetype beyond the second, heaviest first. Tiers: great ≥ 6.5, major ≥ 5, news ≥ 3.5, minor ≥ 2, meanwhile below.
- Calibrated on the six recorded Stark turns: the muster leads turn 1 (great); a tourney or feast leads turns 3–5; no story of weight 4 is ever the
  Meanwhile. (18 §4's "turn 4 → the tourney, turn 5 → the feast" is a major, not a great: not every week has a great card.)

## D-077 · 2026-09-30 · The writer and the scorer agree (found by the soak, 4 houses × 60 turns)

- A call to arms says against whom from the fact's own word (`data.against`, set when the levies are raised in an open, not cold, war);
  the writer no longer reads the state's war list for it (D-073 said it did): what the house has not been told it may not read.
- A host is named after the place it was raised at ("the host of Casterly Rock"): naming a held host admits that place (`storyWorld`). "Takes the
  Blacktyde host to sea" is no holding taken (the place before "host", "army", "men"…); "a prisoner escapes" claims no capture.
- The Dothraki are "the Dothraki" (their ledger name is "Khalasar of Drogo"); a person's party ("Jon Snow", "Benjen Stark's company") takes no
  article. A feast that ends in a brawl names the two who came to blows and what over (`data.brawlers`, `data.over`); a host that grows says so in words.
- The soak (`scripts/soak.js`) now asks that every card the narrator or writer tells passes `scoreCard`, and prints cards a turn and facts a card
  (5.7 and 1.3 on the Stark game of 40 turns; N4's target of 1.5 facts a card is not met by the small news: the news alone is above it).

## D-078 · 2026-09-30 · The game and the local model (docs/local-ai)

- **Merged** `wp/local-ai-findings` (the tuned model's measurements, deploy files, patches, the fine-tuning pipeline) into the default branch's
  history, so the game's builder reads it there. Permission: the owner allowed the live local model for this work (2026-09-30); it is
  run as a private llama-swap on its own port and never touches the owner's.
- **No slot is pinned** unless config says `"pinSlots": true` (llama.cpp #28280: two requests pinned to one slot livelock the server; the game runs
  two minds at once) — R1. **Every call has a total deadline** (`CALL_DEFAULTS[kind].deadline`: probe 30 s, interpret/mind/director 90, letter/counsel 120, audience
  180, council/advisor 240, narrate/consolidate 300; config `deadlines`, or a route's `deadlineSec`; 0 = none) over the whole exchange and its retries, not the
  idle socket — R5. `WC_CONFIG` names the config file. `logCalls: true` keeps every attempt whole in `saves/<id>/llm-calls.jsonl` (prompt, reply, what the
  checks said) — the next fine-tune's data (R3). The men-count check accepts number words and companies of rangers (R8, +2 orders on the suite for every model).
- **Not applied:** R2 (the interpret prompt's choice words and "do not over-ask": measured inside the noise on the untuned model, and the adapter is trained
  on the old prompt), R7 (the tolerant mind matcher: it lowered in-character from 89 % to 85 % by hiding what the fallback had been rescuing), R10 (the seat's lord in the
  interpret dossier: a prompt change, left for the next fine-tune; logged in `MODEL-WISHLIST.md`). The interpret and mind prompts are unchanged.
- **The council** seats every counsellor: at least `min(members, 3)` speeches (the tuned model answered with one and the other two "said nothing").
- `docs/local-ai/deploy/config.maester-12b.json` is a whole config for Maester-12B; `npm run model:check` puts one question of every kind to the model through the
  game's own call and reports; `npm run headlines:check` tells a few mock weeks with it and prints what the writer and the model each wrote.

## D-079 · 2026-09-30 · The quiet screen as built (WP U1–U3)

- **The pieces.** `ui/hud.js` decides what the bar says (`vitalsOf`, `inboxOf`, `stripOf`, `turnLabel`, `routeKey`, `MENU`: pure, browser-safe, tested in node);
  `ui/chrome.js` draws it and runs the popovers; `public/css/hud.css` places it on the desk of `theme.css`. Nothing here reads the state anywhere the old screen did not.
- **The bar is 2.6 rem** (55 px at 1920, 39 px at 1366) because the reason for the turn sits *beside* the End-turn plate, not under it (the mockup's two-line plate made the bar 68 px).
  The house's ribbon hangs a little below the bar, over the map; the bar's own box is what the gate measures.
- **The strip is 27 rem wide** (the style tile's width), not the "left column ≤ 22 rem" of §4 U3: it is a foot strip 8 rem tall, not a column, and the map keeps
  87–90 % of the screen. Closed chronicle = the strip; open = the old feed in a panel over it (the cards inside are N7's).
- **M is the wars, not the map mode.** The old hotkeys are kept (U2: "each old hotkey still opens its content"), so the map-mode chip has no key; the chip and its list are a click.
- **A matter no longer opens a card after the turn** (`showChoices` is gone): attention is pulled, not pushed (§1.5). The seal settles with its number; End turn still asks once when
  matters wait; a matter opens as a card from the Inbox.
- **Orders:** three in view, the rest behind "+N earlier"; the newest order (and any with a steward's question) shows every line of its receipt, two lines each, the whole line in its hover.
- **No `ui: 'v3'|'v4'` switch** (§4): the old screen is replaced outright. The old markup's ids are gone (`#res-row`, `#date-box`, `#action-ring`, `#mapmodes`, `#drawer-tabs`, `#raven-badge`) and
  a test (`tests/hud.test.js`) fails if a script still points at one, so a stale handler cannot stop the game at load.

## D-080 · 2026-09-30 · The chronicle as cards, the report and the pins as built (WP N7 + N8)

- **`ui/feed.js` is pure** and reads only `state.history` and the player's house id (a test hands it a Proxy that throws on any other key), so the feed can carry nothing that the turn records the server sent
  did not; the cards are those records, already through the knowledge filters (D-074…D-076).
- **The chronicle keeps every story the old feed did** when "Only what matters" is off (the test counts them on a real game); on, it is tier news and above (18 §2.6). "Read" is when the panel is closed (not when it is opened), so the
  "N new" of a session is stable while you read it. The matters that waited at the head of the old feed are the Inbox's now (U3); "Threads to follow" stays.
- **The maester's report is a modal after each turn** (mockup 05), skipped for a quiet turn and when an ending is being told, and it can be switched off in Settings (`localStorage` `wc-report`, on by default): a page every turn is
  a beat some will not want. It is the turn's `digest` (or one built from its cards for a save from before), so it cannot contradict the cards.
- **Playback controls moved to the strip** (they lived in the chronicle's head): the strip is what shows the turn being told now that the chronicle is closed by default.
- **Pins:** tier decides (news and above; a minor one only if it is the player's); a card from before the tiers keeps the old importance rule; the small life of the realm (Meanwhile) only when it touched the player's own and mattered a little.
  A battle pin takes the recent battle card of the same two houses; if none was told, the old line stands rather than nothing. The map's pin glyphs are still emoji (a map job: E-phase).
- `modal(html, { vellum: true })` frames nothing (no border, no ✕) so a page of vellum is the whole dialog; the report and a pin's card use it. A matter's card and a confirmation keep the old frame until U8.

## D-081 · 2026-09-30 · The quill, the microphone and the scribe (WP Q1)

- **Owner's word:** one button at the bottom to send, a quill, no machine ideas; a small model on the CPU to mend spelling; a speaking mode. So: the bar is the input, a microphone and a quill; "Counsel" (`suggest`) is
  gone from the UI (the server route stays, unused).
- **The scribe is a call** (`scribe`: schema, mock, fallback, an 8 s deadline) with **a server of its own**: `models.scribe.baseUrl`, inheriting nothing of the big model's routing (`routeFor`). It is on only if config names
  that server; on the mock provider it is the rules. It runs on the CPU (`scripts/start-scribe.ps1`: no layers offloaded, `CUDA_VISIBLE_DEVICES=-1`, refuses a port in use), so nothing about it can disturb the GPU or any other server.
- **The rules come first and are the floor** (`public/js/shared/scribe.js`, pure, shared by browser and server): they never mend a word they do not know, never a short word toward a name, and put a name right only toward
  a name in the player's view (`lexiconOf(view)`), so they cannot say a name the lord has not met. The model's mending is kept only if `driftOf` finds none: a number (in figures or words) changed, a name lost, the words
  reordered or replaced (LCS of the words ≥ 85 %), the length off by more than 30–40 %, another script. A change of mind ("a tourney, no, a feast") is left to the steward: the model is told to keep it, and a rewrite that resolves it is refused.
- **The ears run in the page, on the CPU** (WebAssembly, never WebGPU; `ui/ears-worker.js`), with the runtime vendored (`public/vendor/transformers/`, Apache-2.0, the same version as the voices' runtime) and the model from
  `npm run fetch-ears` or, once, the hub. The recording is decoded, written down and dropped; `ears.js` has no network call (a test holds it to that). Single-threaded (the page is not cross-origin isolated): about 3.5 s for 9 s of speech.
- **Spoken words wait in the box** for the lord to read and press the quill, rather than being sent: a misheard word must not become an order unseen.

## D-082 · 2026-09-30 · The State of the Realm as built (WP R4 + R6)

- **The words are the engine's** (`engine/realm/notes.js`), made from the displayed cells and the observed series of each row and from the wars and hosts the viewer knows: a house's word is rising, falling or steady only when
  the Power series says so on two turns running (`direction`), "seems" for a house known by reports; a flag has its reason in plain words; a war's movement is `warMomentum` of the war's score series, and only for a war the viewer's
  own house or realm is in (`sideOf`) — the score of any other war is never read. `state.realmStats.wars` keeps each live war's score weekly (24 points), invariant 12 checks it, and an ended war is forgotten.
- **"Where to focus" is the server's** (`game.realmFocus`, not the view function): facts about the viewer's own house that carry a verb and an order, kept only if `optionsFor` for the player's lord offers the verb — the
  legality the minds and the order interpreter answer to — three at most. The button writes the order into the box (`toast`s that it did) and sends nothing.
- **The window:** the Realm door opens the ledger; the old own-house page is its "Your house" tab (the portraits, the family tree and the court actions are untouched). The page is drawn by a pure function of the view (`realm-view.js`),
  so a test runs it on hostile names; every name and line the server sent goes through `esc`. Bands are written in k (`≈ 17k–100k`), people in k or m. The lord's last choices (lens, rows, window, sort, columns) are kept in `localStorage` (`wc.ledger`), never the selected house.
- **Not built:** `banners_called` and `great_debt` facts, a war's holdings note, the Neighbours chip, the wide-window "steps aside" behaviour of GDD 17 §2.9 (the window only moves the map's chip and the sheets), and the quiet pip on the Realm door when a word turns.

## D-083 · 2026-09-30 · The minds and the council read the same numbers (WP R5)

- **One source, the house's own eyes.** `realmSummary(state, house)` and `realmBrief(state, house)` call `realmViewFor(state, house, { scope: 'great' })`: a house with no notes of another sees it as the public prior (rank and the map),
  its own and its sworn houses live, exactly what the estimates give it and no more; figures are written by `engine/realm/words.js`, the same functions the window uses, so the brief and the window agree word for word (a test).
- **`w.ledger`, not `w.realm`:** `worldView` already has `realm` (the id of the house's realm's head). `ledger` is a lazy getter (about 3 ms; computed only when a trigger, a tree or a dossier reads it).
- **Triggers:** a hungry house is woken a little sooner (+15, not a trigger), a house that has lost holdings sooner still (+20, a trigger). An empty purse is *not* one: the Crown is always in debt (its canon), and it would wake it every week.
- **The tree:** a new calm rule `rising_rival` — no war, six thousand dragons, the strongest house rising and no friend: send it a gift — with no dice of its own (the ledger's word is the only reason, and a gift rests a season), and that house
  joins `send_gift`'s targets only while it is the rising leader. The soak (2 houses × 30 turns) holds every invariant.
- **The council's dossier** opens with the brief (its snapshot is updated); its existing check (a counsellor's figure must be one the dossier gives) now covers the ledger's figures too.
- **The tuned model's mind prompt is not changed.** The adapter was taught the dossier without a realm block (D-078); the block is built and tested, and `"mindRealmBrief": true` in config adds it to the call (`realm: true`) for the next tuning round.
  The engine's own minds (the trees and the order in which lords are woken) read it now.
- **Not built:** `observe` for houses other than the player's (a mind's house sees the public prior for those it has no notes of); `docs/gdd/04-ai-system.md` §5's one-line pointer.
