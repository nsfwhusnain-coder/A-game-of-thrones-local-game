# 03 · Architecture: the Truth Pipeline

> The structural rebuild that removes root causes R1–R4 ([02-audit.md](02-audit.md) §2). Everything else in the GDD
> assumes this architecture. Read it fully before touching `server/game.js`, `world.js`, `prompts.js` or `orders.js`.

---

## 1. Principles (normative)

1. **Propose → Resolve → Narrate.** Language models *propose* (a character's intent, the meaning of a player's order).
   The deterministic engine *resolves* proposals into **facts**. Language models *narrate* facts. Nothing else changes
   the world.
2. **The model never mutates state.** No model output is ever passed to `applyChanges`. Model outputs are
   (a) **intents** validated against the verb registry, or (b) **prose** bound to fact ids. (The only exception is the
   dormant custom-rule DSL of phase H, which is also schema-constrained and validated.)
3. **Facts are the only history.** The chronicle, the map playback, the knowledge of every house, the world log and the
   model's memory are all derived from the append-only fact log.
4. **One activity per character, one position per entity.** Every character has exactly one `activity` and one
   `location`. Any system that wants a character must claim the activity (§4).
5. **Everything moves as a party.** Hosts, fleets, the King's progress, a lord riding to a wedding, an envoy, a lone
   rider, a caravan, an outlaw band: one entity type, one movement engine, one map layer (§5).
6. **Deterministic given a seed.** The engine uses a seeded PRNG carried in the save. Given the same state, seed and
   intents, a turn resolves identically. Intents from model calls are recorded in the turn record, so any turn can be
   replayed without the model.
7. **Knowledge is per house.** Every fact has a visibility; news travels at raven, rider or rumour speed; each house
   (including the player's) knows only what has reached it. Minds reason from their house's knowledge, never the truth.
8. **One verb registry.** Every action anyone can take — player, NPC mind, canon beat — is a verb defined once, with
   its legality, cost, duration, resolution and receipt (§7). The registry generates the enums the model may choose
   from, the engine's resolvers, and the UI's receipts.

## 2. System diagram

```
                PLANNING (time frozen)                                    JUMP (time runs)
 ┌───────────────────────────────────────────┐   ┌──────────────────────────────────────────────────────────────┐
 │ Player text ──► Order Interpreter ──► Intents (player)                                                   │
 │   (deterministic parser → constrained LLM)      │                                                          │
 │ Audience / letter / council ──► Commitments,    │   Minds (1 call per salient NPC, constrained) ──► Intents │
 │   Letters in flight, Knowledge                  │   Director (0–1 call) ──► Hooks ──► Intents/Facts        │
 │ Matters answered ──► Effects + Intents          │   Canon beats (engine) ──► Intents/Facts                 │
 └───────────────────────────────────────────┘   │                         │                                │
                                                  │                         ▼                                │
                                                  │   DAY LOOP (engine, deterministic, seeded)               │
                                                  │   intents due → verbs resolve → parties move → contacts →│
                                                  │   battles/sieges → musters → letters → economy → world   │
                                                  │   life → knowledge spreads → interrupts?                 │
                                                  │                         │                                │
                                                  │                         ▼                                │
                                                  │   FACT LOG (append-only) ──► knowledge per house         │
                                                  │                         │                                │
                                                  │   Narrator (constrained) ◄── facts the player knows      │
                                                  │                         │                                │
                                                  │   TURN RECORD: facts + events(bound to facts) + keyframes│
                                                  └─────────────────────────┼────────────────────────────────┘
                                                                            ▼
                                                     CLIENT PLAYBACK: day counter, map changes on the fact's day,
                                                     chronicle cards appear; pause / skip / stop here
```

## 3. Data model v3

The save format moves from `version: 2` to `version: 3`. `migrateState` (in `shared/world.js`, later
`engine/state/migrate.js`) converts old saves (§12).

### 3.1 Top-level state

```js
state = {
  version: 3,
  meta: { scenario, scenarioName, player /*house id*/, date: {year, month, day}, day /*absolute day number*/,
          turn, seed /*uint32*/, rngState /*uint32[4]*/, created,
          settings: { difficulty: 'normal', canonGravity: 'canon', ironman: false, narratorDetail: 'rich', matureContent: 'book' } },
  houses: { [id]: House },
  characters: { [id]: Character },
  holdings: { [id]: Holding },
  places: { [id]: Place },            // non-holding named places (inns, ruins, fords, the Kingsroad mile markers)
  parties: { [id]: Party },            // REPLACES state.armies, c.travel riders, retinue "armies" (a.party)
  letters: { [id]: Letter },           // ravens/riders/envoys in flight or delivered (REPLACES state.post, pendingReplies)
  commitments: { [id]: Commitment },   // promises that bind the engine (NEW)
  schemes: { [id]: Scheme },           // hidden plots (NEW; subsumes state.plotting)
  wars: [War], pacts: [Pact], relations: { 'a|b': { v, reasons: [] } },
  knowledge: { [houseId]: HouseKnowledge },   // REPLACES state.intel
  threads: { [id]: ThreadState },       // canon beats and story threads (REPLACES state.plots.stages, storyThreads)
  matters: [Matter],                    // decisions awaiting the player (REPLACES state.decisions)
  orders: [Order],                      // the player's drafted commands for the next jump
  customs: { [houseId]: [Rule] },       // phase H custom mechanics (unchanged DSL)
  world: { season, seasonDay, harshness, weather: { [regionId]: WeatherState }, snowLine /*map y*/ },
  economy: { prices: PriceState, lenders: { ironbank: LenderState, ... } },
  standing: {...}, outcome: null,
  historyIndex: [ { turn, fromDay, toDay, factRange: [first, last], until } ],   // turn bodies live in files (§11)
}
```

### 3.2 Character

```js
Character = {
  id, name, house, sex: 'm' | 'f',               // NEW required field; pronouns derive from it (fixes B-22)
  born /*year*/, alive, died: null | { day, cause, by, place },
  titles: ['Lord of Winterfell', 'Warden of the North'], offices: ['hand_of_the_king'],   // office ids, see 08 §7
  roles: ['lord'|'heir'|'lady'|'maester'|'steward'|'master_at_arms'|'captain'|'spymaster'|'septon'|'knight'|'sworn_sword'|'ward'|'hostage'|'kingsguard'|'sworn_brother'|...],
  nature: { courage, wits, guile, pride, temper, warmth, stubbornness, honesty, ambition, piety, sway: [..], weakness },  // explicit 0-10 scales, 08 §2
  skills: { dip, mar, stw, int, lrn, prw },       // 0-20 (existing array → object)
  traits: ['honorable', ...],                     // display tags; not used for logic
  health: { wounds: [ {kind, since, severity} ], illness: null | {kind, since, severity}, frail: false },
  status: 'free' | 'captive' | 'hostage' | 'missing' | 'exiled' | 'sworn' /*NW, Kingsguard, maester chain*/,
  captor: null | charId, heldAt: null | holdingId,
  location: { at: holdingId | placeId | null, party: partyId | null, pos: [x, y] },   // exactly one of at/party set
  activity: Activity,                             // §4
  goals: [ Goal ],                                // what they are working towards (09 §2)
  memories: [ { day, text, about: [ids], weight } ],   // capped, weighted
  secrets: [ { id, text, knownBy: [charIds], proof: 0-1 } ],
  opinion: { [charId]: -100..100 },               // sparse; opinion of the player's ruler kept as opinion[playerLord]
  loyalty: -100..100,                             // to their liege lord
  family: { father, mother, spouse, betrothed, children: [], siblings: [] },   // derived index, rebuilt on load
  looks, voice,                                   // references into data/looks.js, ui/voice.js
  canon: { deathWindow: null | { from, to, cause }, protected: false },         // 10 §3.5
}
```

### 3.3 Party (the one mover)

> *Implemented in WP B2* (`engine/parties.js`; [DECISIONS.md#D-007](DECISIONS.md)): a person's place is the one string
> `c.loc` (a place id or `party:<id>`, the `location` below derived from it); `leader` is spelled `commander`, `orders`
> is `march: { to, since }`, `troops` is still `men` + `units` until C1–C3; `contingents` include the owner's share.

```js
Party = {
  id, kind: 'host' | 'fleet' | 'garrison' | 'retinue' | 'progress' | 'envoy' | 'rider' | 'caravan' | 'band',
  name,                              // "The Host of the North", "Lord Bolton's party", "The King's progress"
  owner /*house*/, serving /*liege house when a vassal contingent serves another*/, leader /*charId*/,
  members: [charIds],                // everyone travelling with it (leader included)
  troops: { levies, menAtArms, knights, archers, horse, sellswords, clansmen },   // hosts/garrisons/bands; units.js
  escort: 0,                         // retinues/envoys: armed men with them
  ships: { longships, galleys, cogs, carracks } | null,   // fleets
  carrying: [partyIds],              // fleets carrying embarked parties
  pos: [x, y], at: holdingId | placeId | null,
  route: null | { path: [[x,y]...], to, toName, dayStart, dayEnd, milesPerDay, legs: [ {from, to, days, toll} ] },
  orders: { kind: 'march'|'follow'|'rendezvous'|'hold'|'garrison'|'besiege'|'raid'|'escort'|'return'|'blockade'|'patrol',
            target, since, until, standing: false },
  purpose: null | { kind: 'feast'|'wedding'|'court'|'market'|'hunt'|'pilgrimage'|'visit'|'tourney'|'embassy'|'flight', host: charId, where },
  state: 'forming' | 'mustering' | 'marching' | 'camped' | 'besieging' | 'engaged' | 'routed' | 'embarked' | 'staying' | 'returning' | 'disbanded',
                                     // ENGINE ENUM. No free-text status. Display text is derived (fixes B-20).
  supply: { rations /*man-days*/, wagons, horses, lastForage },          // 07 §6
  morale: 0..100, discipline: 0..100,
  contingents: { [houseId]: men },   // who owns which men in a host
  muster: null | { callId, expected: [ {house, men, eta} ], arrived: [...] },   // a host still gathering (07 §3)
  visibility: 'public' | 'normal' | 'secret', feint: null | { appearsAs: {men, owner} },
  createdDay, lastMovedDay,
}
```

A **garrison** is a party with `kind: 'garrison'`, `at` its holding, `orders.kind: 'garrison'`. A holding's defenders are
always a garrison party (fixes the "garrison: null" ambiguity and makes reinforcing a castle the same verb as sending
men anywhere).

### 3.4 Holding, Place

```js
Holding = { id, name, type: 'great_castle'|'castle'|'fortress'|'tower'|'town'|'city'|'village'|'port'|'camp'|'ruin'|'palace',
  owner, castellan /*charId*/, region, pos, coastal, port: bool, rookery: bool,
  population, prosperity 0..100, unrest 0..100, fort 0..6, buildings: [ids], stores /*food, man-days*/,
  resources: {...}, garrison /*partyId*/, status: 'normal'|'besieged'|'sacked'|'burning'|'occupied'|'ruined'|'rising',
  siege: null | SiegeState, devastation 0..100 /*raided countryside*/, notes: [] }
Place = { id, name, kind: 'inn'|'ford'|'bridge'|'ruin'|'crossroads'|'pass'|'shrine'|'weirwood'|'field'|'sea'|'island', pos, region, aliases: [] }
```

### 3.5 Letter, Commitment, Scheme

```js
Letter = { id, kind: 'raven'|'rider'|'envoy', from, to, fromPlace, toPlace, sentDay, arriveDay,
           body /*text, first person*/, proposal: null | Proposal, replyTo: null | letterId,
           state: 'in_flight'|'delivered'|'lost'|'intercepted', interceptedBy: null | houseId, answered: bool }
Commitment = { id, by /*charId*/, to /*charId or houseId*/, kind, params, madeDay, dueDay,
               source: { type: 'audience'|'letter'|'matter'|'pact'|'order', ref },
               sincerity: 0..1 /*engine-rolled when made, secret*/, state: 'open'|'kept'|'broken'|'expired'|'void',
               publicity: 'private'|'witnessed'|'public' }
Scheme = { id, owner /*charId*/, house, kind, target, progress 0..1, secrecy 0..1, agents: [charIds], budget, startedDay, state }
```

### 3.6 Fact

The atom of history. **Every** change that a player or an NPC could notice produces exactly one fact.

```js
Fact = {
  id: 'f<turn>.<n>',                 // unique, stable
  day,                               // absolute day number
  kind,                              // from the fact catalogue (§8)
  actors: [charIds], houses: [houseIds],
  place: holdingId | placeId | null, pos: [x, y] | null,
  data: { ... },                     // kind-specific, e.g. { party, men, from, to } for 'arrived'
  cause: null | { type: 'order'|'intent'|'beat'|'rule'|'engine', ref },
  vis: { scope: 'public'|'local'|'houses'|'secret', houses: [...], radius /*map units for 'local'*/ },
  importance: 1..5,                  // engine-assigned by kind + actors' rank + player relevance
  thread: null | threadId,
  text,                              // engine one-liner, correct pronouns, e.g. "Lord Umber's host reaches Winterfell (3,800 men)."
  playback: { move: partyId, from: [x,y], to: [x,y], pathKey } | null,   // for the client's map choreography
}
```

> *Implemented in WP B3* (`engine/facts/log.js`, `engine/facts/kinds.js`; [DECISIONS.md#D-011](DECISIONS.md)): facts are
> made where the engine makes the change — every subsystem and every `applyChanges` op — and the chronicle's cards are
> their projections (a card carries `fact`). `title` (the card's headline) is kept beside `text`; `vis.houses` is set
> only where the scope needs it; `playback` waits for jump v2 (B10). `cause.type` is one of the five above.

### 3.7 Intent and Order

```js
Intent = { id, actor /*charId*/, house, verb /*registry id*/, params: {...}, publicFace, secretAim, reason,
           source: { type: 'order'|'mind'|'beat'|'director'|'commitment'|'rule'|'fallback', ref },
           dayFrom, dayTo, priority: 0..100, state: 'pending'|'started'|'done'|'refused'|'failed'|'superseded',
           refusal: null | { code, text } }
Order = { id, text /*player's words*/, parsed: [Intent], receipt: [ReceiptLine], state: 'draft'|'confirmed'|'carried'|'refused',
          clarify: null | { question, options: [ {label, patch} ] } }
ReceiptLine = { ok: true|false|'warn', text, eta: null | days, cost: null | { gold, men, days } }
```

### 3.8 Knowledge

```js
HouseKnowledge = {
  facts: { [factId]: { day /*learned*/, via: 'witness'|'raven'|'rider'|'rumour'|'spy'|'letter', confidence 0..1 } },
  parties: { [partyId]: { pos, men, owner, asOfDay, confidence, source, false: bool } },   // what they believe about hosts
  beliefs: [ { about, text, asOfDay, true: bool } ],   // planted rumours, suspicions
}
```

## 4. Activities (one thing at a time)

> *Implemented in WP B2* (`engine/activity.js`; [DECISIONS.md#D-009](DECISIONS.md)): stored as `{ kind, since, party?,
> until?, source? }` — priority and interruptibility are the kind's; activities that circumstances decide are re-derived
> on every settle, only claims outlive them.

```js
Activity = { kind, party: partyId | null, since, until, priority, source: {type, ref}, interruptible: bool }
```

| kind | priority | examples | interruptible by |
|---|---|---|---|
| `captive` | 100 | a prisoner | only release / escape |
| `commanding` | 90 | leading a host or fleet in the field | death, capture, relief of command |
| `besieged` | 88 | lord inside a besieged holding | end of siege |
| `ruling` | 80 | a lord at their seat running the realm (default for heads of house) | anything ≥ 60 by claim |
| `mustering` | 78 | answering the banners, gathering levies | ≥ 90 |
| `envoy` | 70 | on an embassy | ≥ 78 |
| `travelling` | 60 | a journey with a purpose (party) | ≥ 70 |
| `court_duty` | 55 | serving an office at court (small council, Kingsguard) | ≥ 70 |
| `attending` | 40 | a feast, wedding, tourney, hunt | ≥ 55 |
| `idle` | 0 | children, household | anything |

API (`engine/activity.js`):

```js
claim(state, charId, activity) → { ok, displaced: Activity | null, reason }
  // ok if activity.priority > current.priority, or current is interruptible and done; displaced activities get a fact
release(state, charId, reason)
busyUntil(state, charId) → day | null
canAttend(state, charId, kind) → bool          // used by the retinue scheduler, minds' legality, orders
```

**Every** system that moves or occupies a character must call `claim`. The retinue scheduler (feasts, visits) may only
pick characters whose current activity is `ruling` or `idle` and who have no open commitment due within the trip's
length. This alone fixes B-10.

## 5. Parties and movement

`engine/parties.js` and `engine/movement.js` replace the march block in `server/game.js advance()`, the rider block,
`retinues.js` movement and `life.js`'s notion of "things on roads" (the latter becomes visual only).

- **Speed** (miles/day, before season and road modifiers): foot host 15, mixed host 18, all-horse host 30, forced march
  +30 % speed with daily attrition and morale loss (07 §5), retinue 25, lone rider 40, envoy 30, the royal progress 30
  (wheelhouse), caravan 12, fleet 60–100 by ship type and wind (07 §9). `MILES_PER_UNIT` stays as in `warfare.js`.
- **Routes** are computed once when the order is given (A* over land/sea from `map3d/pathfind.js`, moved to a shared
  module so the server can use it), stored as `route.path`, and advanced by distance each day. The server computes paths;
  the client renders the same path (fixes the "hosts glide straight" / island crossings, B-11). *Implemented in WP B2*
  (`engine/movement.js` on the atlas raster of `engine/geo.js`, [DECISIONS.md#D-008](DECISIONS.md)): the route stores
  the day each point is reached; a rider or envoy whose way is blocked by the sea — or much shorter by it — takes ship
  from the best port. The progress's 10 miles a day could not keep the canon timetable on a 3,000-mile Westeros: 30.
- **Water:** a land party may only cross open sea when embarked on a fleet (verb `embark`). Islands (Skagos, Bear Island,
  the Iron Islands, Tarth, Dragonstone, the Three Sisters) have no land route; their lords' hosts need ships or a
  crossing place (`places.crossings`). Short ferry crossings (the Twins' bridge, the Blackwater Rush fords, the
  Saltpans ferry) are explicit edges with tolls.
- **Contact:** each day, after movement, parties within `CONTACT` (10 map units) of each other are checked: hostile hosts
  → battle (07 §7); a host reaching an enemy holding with orders to besiege → siege; a retinue/envoy meeting a hostile
  host → captured or turned back per 07 §10.
- **Follow and rendezvous:** `orders.kind = 'follow'` targets a party; the path is recomputed daily toward the target's
  position; on contact with a friendly target, a `joined` fact merges it (07 §3.4). `rendezvous` targets a *host*, not a
  place: late contingents always find the host wherever it is (fixes B-02).

## 6. The turn pipeline

`server/turn/pipeline.js` exports `planPhase`, `jump`, `narrate`, `record` and composes named phases. Each phase is a
function `(ctx) → void` that reads/writes `ctx.state` and appends to `ctx.facts`. `ctx.rng` is the seeded PRNG. The
current 190-line `advance()` is retired.

### 6.1 Planning (time frozen)

| Step | Trigger | What happens | Latency target |
|---|---|---|---|
| Order drafted | player types a command and presses Enter | `interpret(order)` → intents + receipt (04 §4). Receipt shown under the order. Ambiguity → clarification chips. | ≤ 5 s |
| Order edited/removed | player | re-interpret / drop | ≤ 5 s |
| Direct action | a button in a card (march here, raise, disband, appoint…) | builds the intent directly (no model) + receipt | < 100 ms |
| Audience line | player speaks | `audience()` → reply beats + outcome → commitments / knowledge / letters (04 §6) | ≤ 12 s |
| Matter answered | player picks an option or writes their own | option effects + intents; own words → `interpret()` with the matter as context | ≤ 5 s |

Nothing in planning advances time. Receipts are **predictions** from a dry run on a copy of the state (the current
`previewOrders` idea) and are re-validated at jump time.

### 6.2 Jump

```
jump(state, { span }):                      // span: 'until' | 7 | 14 | 30 | 90 (days)
  ctx = newContext(state)                   // rng from state.meta.rngState, facts = []
  horizon = span === 'until' ? MAX_UNTIL (30) : span
  segments = splitIntoSegments(horizon, SEGMENT = 7)

  for seg in segments:
    // 1. MINDS: who among the NPCs decides something now? (04 §5)
    actors = salientActors(ctx, seg)                 // scored, budgeted (≤ 6 per 7 days; ≤ 10 per segment max)
    intents = await minds(ctx, actors)               // parallel over 2 slots; each validated against the registry
    intents += fallbackIntents(ctx, triggeredButNotSelected)   // house-ways behaviour trees, no model
    if seg.index === 0: intents += await director(ctx)          // 0-2 hooks (04 §7); optional by setting
    schedule(ctx, intents + player intents (first segment only) + beatIntents(ctx, seg))

    // 2. DAY LOOP
    for day in seg:
      startOfDay(ctx)          // due intents start (verbs' start()), commitments due (keep/break), beats due
      moveParties(ctx)         // routes advance; arrivals; road encounters; chokepoint tolls
      resolveContacts(ctx)     // battles, captures, sieges begin/tick, storms, sallies, reliefs
      musters(ctx)             // answers, gathering, departures, joins
      letters(ctx)             // deliveries, interceptions; NPC replies queued for the next minds pass
      economyDay(ctx)          // daily accruals; monthly settle on month boundary (06)
      worldLife(ctx)           // happenings (flavour facts), retinue scheduler, psyche, regency, treachery, unrest, weather
      spreadKnowledge(ctx)     // facts of the day reach houses at news speed (09 §7)
      if span === 'until' and interrupted(ctx): stop after this day   // 05 §4
    // 3. NARRATE the segment (streamed to the client as soon as it is ready)
    events = await narrate(ctx, factsKnownToPlayer(ctx, seg))       // 04 §6
    emitSegment(ctx, seg, events)                                   // SSE to the client (§10)
    if stopped: break

  close(ctx)                   // season turn, standing, outcome, matters lapse, threads update
  record(ctx)                  // turn record + fact log + chronicle + world log; save; background consolidation + cache warm
```

*(B11, implemented: the day loop is `server/turn/day.js` `engineDay`, one day at a time in the order above; the
segments, minds per segment, narration per segment, interrupts and the stream are in `server/game.js` `advanceWith`.
Departures in DECISIONS D-037–D-039: psyche weekly on the realm's seventh days, the economy still settled per segment,
director and beats wait for B12.)*

**Segmenting is what makes it fast.** Segment 1 (days 1–7) is simulated and narrated first and streamed to the player,
who watches it play back (~40–70 s of reading and camera moves) while segment 2 simulates. For the default
"until something happens" jump there is usually only one segment.

### 6.3 Latency budget for a 7-day segment (RTX 5070, Gemma 4 26B A4B 64k, 2 slots)

| Phase | Calls | Budget |
|---|---|---|
| Minds | ≤ 6 × ~2.5k-token prompts (static prefix cached) → ~120 tokens each | 6 × 3.5 s / 2 slots ≈ **11 s** |
| Director | 0–1 × ~3k → ~150 tokens | ≈ 4 s (parallel with minds) |
| Engine day loop | none | < 1 s |
| Narrator | 1 × ~4–6k → ≤ 1,400 tokens (3–8 events) | ≈ **18–22 s** |
| Total | | **≈ 30–35 s** (Q3 target ≤ 45 s) |

### 6.4 What replaces what

| Old (`server/game.js advance`) | New |
|---|---|
| `carryOutOrders` + `previewOrders` | Order Interpreter at planning time; intents scheduled at jump |
| `runSwarm` (5 agents) | `minds` + `narrate` (+ optional `director`) |
| natural-death loop | `engine/characters/ageing.js` with canon death windows (08 §5) |
| `vassalTick`, `advanceMusters`, `gatherMusters`, `fieldService` | `engine/military/muster.js` state machine (07 §3) |
| march loop, rider loop | `engine/movement.js` |
| `roadEncounters`, `treacheryTick`, `resolveWarfare`, `worldTick`, `regencyTick`, `psycheTick`, `retinueTick`, `deliverReplies` | same modules, called from the day loop, **emitting facts instead of events** |
| `applyChanges(obj.changes)` from the model | removed |
| `settle(state, days)` | `economyDay` + monthly settle |
| `orderEvents`, `dayEngineEvents`, `foldAnswers` | the narrator + the fact clusterer (04 §6.2) |
| `realmPetition` | the Matters generator (10 §6) |
| decisions lapse loop | `close()` |

## 7. The verb registry

`public/js/engine/actions/registry.js` exports `VERBS: { [id]: Verb }`.

```js
Verb = {
  id: 'march_host',
  family: 'military' | 'movement' | 'diplomacy' | 'court' | 'economy' | 'intrigue' | 'canon',
  label: 'March a host',                       // UI
  who: (state, actor) => bool,                 // can this actor ever use it (a lord, a commander, a maester…)
  params: { host: 'party:own_host', to: 'place' },    // typed params, used to build model enums (04 §3)
  legal: (state, actor, params) => null | { code, text },   // null = legal; else an in-world refusal
  cost: (state, actor, params) => { gold, men, days },
  start: (ctx, intent) => void,                // schedules parties, spends gold, emits facts
  tick?: (ctx, intent, day) => void,           // long-running verbs (schemes, sieges, works)
  receipt: (state, intent) => ReceiptLine[],   // "Robb marches the Host of the North (10,500) to Moat Cailin — ~9 days"
  facts: ['march_started', 'arrived'],         // kinds it can emit (documentation + tests)
  mind: { allowed: true, weight: (state, actor) => 0..1 }   // whether minds may choose it, and how natural it is
}
```

> *Implemented in WP B4* (`engine/actions/`; [DECISIONS.md#D-015](DECISIONS.md)): 27 verbs — every action that
> existed (the cards, written orders, the court) — with `legal/cost/start/receipt/facts/mind`, plus `said` (the order
> line the story model is told until B11). The rest of the catalogue arrives with the systems that need it (C, D, E).

The full verb catalogue (≈ 60 verbs) with legality and resolution rules is in [07](07-military.md) §12 (military),
[08](08-characters-politics.md) §12 (diplomacy, court, intrigue) and [06](06-economy.md) §9 (economy). Canon-only verbs
(`crown_self`, `proclaim_claim`, `execute_publicly`, `burn_with_wildfire`…) have `mind.allowed: false` and are used only
by beats.

## 8. The fact catalogue

Kinds, grouped. Each kind has a data shape and an engine text template in `engine/facts/kinds.js`. Importance defaults
in brackets; the engine raises importance by +1 when the player's house or kin is an actor, +1 for a great lord, capped at 5.

- **Movement** — `set_out` [2], `arrived` [2], `turned_back` [2], `met_on_road` [2], `crossed` (chokepoint) [2],
  `delayed` (weather, toll) [1], `embarked` [2], `landed` [3], `lost_at_sea` [4].
- **Military** — `levies_called` [3], `call_answered` [2], `call_delayed` [2], `call_refused` [4], `muster_grew` [1],
  `host_formed` [3], `host_joined` [2], `host_split` [2], `host_disbanded` [2], `desertion` [3], `battle` [4–5],
  `rout` [4], `captured_in_battle` [4], `slain_in_battle` [4–5], `siege_begun` [4], `siege_tick` [1], `sally` [3],
  `storm_assault` [4], `holding_fell` [4–5], `siege_lifted` [4], `raid` [3], `village_burned` [2], `blockade` [3],
  `sea_battle` [4], `sellswords_hired` [3], `sellswords_turned` [4].
- **Politics** — `war_declared` [5], `war_joined` [4], `peace_made` [5], `pact_made` [4], `pact_broken` [5],
  `fealty_sworn` [4], `fealty_renounced` [5], `crowned` [5], `claim_proclaimed` [5], `office_granted` [3],
  `office_stripped` [4], `holding_granted` [3], `attainder` [5].
- **People** — `death` [2–5], `birth` [2], `betrothal` [3], `wedding` [3–5], `captured` [4], `released` [3],
  `ransomed` [3], `executed` [5], `sent_to_wall` [3], `hostage_taken` [3], `ward_fostered` [2], `wounded` [3],
  `illness` [2], `recovered` [2], `came_of_age` [2], `succession` [4–5], `regency_begun` [3], `regency_ended` [3],
  `fled` [4], `vanished` [4].
- **Word** — `letter_sent` [1], `letter_arrived` [2], `letter_intercepted` [3], `envoy_arrived` [3],
  `audience_held` [2], `commitment_made` [2], `commitment_kept` [2], `commitment_broken` [4], `rumour` [1–3],
  `secret_revealed` [4], `scheme_discovered` [4].
- **Court & realm** — `feast` [2], `tourney` [3], `tourney_result` [3], `judgement` [2], `petition` [2],
  `tax_changed` [2], `works_begun` [1], `works_done` [2], `unrest_rising` [3], `rising` [4], `famine` [4],
  `plague` [4], `season_turned` [5], `custom_created` [2].
- **Ambient** — `happening` [1] (flavour from `data/happenings.js`), `behaviour` [1] (psyche lines), `weather` [1].

> *Implemented in WP B3* (`engine/facts/kinds.js`; [DECISIONS.md#D-013](DECISIONS.md)): every kind above, with its card
> type and default scope; templates (pronouns from `shared/people.js`) for the kinds the engine phrases from data alone.
> Added: `ambush` [2] (outlaws on a small company), `men_hired` [2], `gift` [2], `ledger` [1] (the steward's notes),
> `house_ended` [5], `canon_beat` [4] (a beat of the great story, with its `thread`), and `legacy` (facts rebuilt from a
> pre-B3 save's turn records).

## 9. Canon locks

An entity or character a live canon beat depends on (the royal progress while `kings_ride` is active; Khal Drogo's
khalasar until the wedding; Ned while the Hand offer is pending; Joffrey before Baelor's Sept) carries
`canonLock: { thread, until }`. Minds and the Director cannot target a locked entity with verbs outside its beat's
whitelist. The lock releases when the beat completes, lapses, or canon gravity is `sandbox`. Fixes B-06/B-07.

## 10. Client/server contract (HTTP)

| Route | Purpose |
|---|---|
| `GET /api/games/:id` | The **player's view**: state filtered server-side by the player's knowledge (other houses' hosts replaced by `knowledge.parties`, secrets stripped). The client never receives the truth it should not know. |
| `POST /api/games/:id/orders` `{text}` → `{order}` | Draft + interpret + receipt. |
| `PATCH /api/games/:id/orders/:oid` `{text | patch}` / `DELETE …` | Edit/clarify/remove. |
| `POST /api/games/:id/act` `{verb, params}` | Direct actions from cards (no model). *(B4: answers `{ state, receipt, summary }`; a refusal is a 409 with its reason; the old `{ kind, … }` still maps to verbs)* |
| `POST /api/games/:id/audience` `{with, text, mode}` | Audience/letter line (streams reply beats). |
| `POST /api/games/:id/council` `{members, text}` | Council. |
| `POST /api/games/:id/matters/:mid` `{option | text}` | Answer a matter. |
| `POST /api/games/:id/jump` `{span}` → `{jobId}` | Start a jump. *(B11: `{span, orders}` → `{job}`; 409 while one runs)* |
| `GET /api/games/:id/jump/:jobId/stream` (SSE) | `progress` (phase, who is deciding), `segment` (facts + events + keyframes), `done` (turn record summary), `error`. *(B11: `segment` = `{index, days, from, to, events, meanwhile}`; `done` = `{state, turn}` in the player's view; progress stays on `GET …/progress`; keyframes come with E8; a late listener hears the whole jump)* |
| `POST /api/games/:id/jump/:jobId/stop` `{day}` | Intervene: stop after `day` (§6.2; 05 §5). *(B11)* |
| `POST /api/games/:id/stop` `{day}` | *(B11)* Stop here after the fact: the last turn is played again from its snapshot with the same orders and minds' choices to `day` (D-039). |
| `POST /api/games/:id/undo` `{turns: 1}` | Multi-level undo from snapshots (unless ironman). *(B3; `GET …/undo` → `{depth, ironman, turn}`)* |
| `GET /api/games/:id/facts?from&to&house` | Fact log (dev and the world log UI). *(B3; also `kind`, `limit`; the player's view: no other house's secrets)* |
| `GET /api/games/:id/turns/:n` | A turn's record (from `turns/`). *(B3)* |
| `GET /api/games/:id/debug/turn/:n` | Dev only: intents, model calls, rejected items (15 §6). |

## 11. Saves, undo and replays

```
saves/<id>/
  state.json                 current state (v3)
  facts.jsonl                append-only fact log (one JSON per line)
  turns/000123.json          turn record: { turn, fromDay, toDay, until, intents, events, keyframes, ledger, calls:[{kind, ms, tokens}] }
  snapshots/000123.json.gz   state before turn 123 (keep the last 10; ironman keeps none)
  chronicle.md               long-term memory (engine facts + consolidated summaries)
  world-log.md               human-readable per-turn log
  llm-log.jsonl              every prompt and reply (dev), rotated at 50 MB
```

- **Undo** restores a snapshot and truncates `facts.jsonl`/`turns/` to match. Multi-level (up to 10), disabled in ironman.

> *Implemented in WP B3* ([DECISIONS.md#D-012](DECISIONS.md)): the snapshot is taken when the turn is asked for, with
> the orders already written (undo gives them back to be changed), and also keeps the chronicle and the byte lengths of
> `facts.jsonl` and `world-log.md`, which undo cuts back to. `state.history` keeps the last 30 turns (and any not yet
> consolidated) for the prompts and the feed; every turn is in `turns/`. `GET /api/games/:id/undo` says how far back
> the glass can turn. A save from before B3 keeps its one old undo point, and its history is written to `turns/` (with
> a best-effort `legacy` fact per applied line) on its first new turn. Replay-from-snapshot (`scripts/replay.js`) comes
> with the intents of B6; the byte-identical replay test covers the fact log today.
- **Replay** (`scripts/replay.js <save> <turn>`) re-runs a turn from its snapshot with the recorded intents and seed and
  diffs the result against the recorded facts — the determinism test ([15](15-qa-tooling.md) §4).

## 12. Migration v2 → v3

`engine/state/migrate.js`:

1. `state.armies[*]` → `parties` (`kind: 'host'|'fleet'|'garrison'`; `a.party` retinues → `kind: 'retinue'` with
   `purpose`; `royal_progress` → `kind: 'progress'`). `status` free text → `state` enum by keyword map, original text
   dropped.
2. `c.loc` → `location` (`'army:<id>'` → `party`); `c.travel` → a `rider` party with the character as leader.
3. `sex` from `data/characters.js` (new field) → falls back to the existing `people.js` inference.
4. `state.post` + `pendingReplies` → `letters`.
5. `state.decisions` → `matters`; `state.plots.stages` → `threads`; `state.intel` → `knowledge`.
6. `skills` array → object; natures from `data/histories.js` explicit fields (08 §2).
7. History: old `state.history` turn records are written to `turns/` and a best-effort `facts.jsonl` is generated from
   their `applied` lines (kind `legacy`).
8. `meta.seed`/`rngState` created; `activity` set from location and roles.

Migration is covered by a test that loads a v2 fixture save (commit one small save under `tests/fixtures/`).
*Steps 1–3 and 8 implemented in WP B2* (`engine/state/migrate.js`, `tests/fixtures/saves/v2-stark-turn3.json.gz`,
`tests/parties.test.js`): parties with kinds and states, `party:` locations and members, riders as rider parties,
placeless people placed, parties the old straight-line marches left on the sea put back ashore, activities. The rest
arrive with the packages that own them (letters B10, matters/threads B12–D1, knowledge B9, history B3).

## 13. Module layout v3

```
public/js/engine/                    deterministic, shared by server and client (client only reads)
  rng.js time.js ids.js places.js
  state/ create.js migrate.js validate.js view.js (player view filter)
  facts/ kinds.js log.js cluster.js
  activity.js parties.js movement.js knowledge.js
  military/ muster.js battle.js siege.js naval.js supply.js units.js chokepoints.js roads.js
  economy/ ledger.js prices.js food.js lenders.js trade.js works.js
  politics/ relations.js vassals.js commitments.js succession.js regency.js marriage.js offices.js standing.js
  characters/ nature.js ageing.js health.js psyche.js memory.js
  world/ beats.js happenings.js retinues.js threats.js weather.js matters.js
  actions/ registry.js military.js movement.js diplomacy.js court.js economy.js intrigue.js canon.js
  rules/ dsl.js (the existing rules.js)
server/
  index.js                           routes (§10)
  turn/ pipeline.js plan.js jump.js close.js record.js
  ai/ client.js (llm.js) models.js (routing) schema.js (enum builders) cache.js
      calls/ interpret.js mind.js director.js narrate.js audience.js council.js advisor.js brainstorm.js polish.js consolidate.js letter.js
      context/ primer.js actor.js player.js place.js memory.js
      validate/ narration.js intent.js
  saves.js
public/js/ui/ …                      per 12
public/js/map3d/ …                   per 11
```

Old modules are moved, not copied: each work package that moves a module deletes the old file in the same commit and
fixes imports; `npm run check` verifies every import resolves.

## 14. Invariants (tested every turn in dev and in CI soaks)

> *1–4 and 8 implemented in WP B2* (`engine/state/validate.js`): checked after every turn (a breach is logged and kept
> in the turn record), at every scenario start (`npm run check`), in `tests/soak.test.js` (every CI run) and in the
> nightly 200-turn soak (`scripts/soak.js`, `.github/workflows/nightly.yml`).

1. Every character is in exactly one place: `location.at` xor `location.party`, and a party lists them in `members`.
2. Every living character has exactly one activity; a `commanding` activity's party has them as `leader`.
3. No party sits on open sea unless `kind: 'fleet'` or `state: 'embarked'`.
4. Every host's `troops` sum equals the sum of `contingents` (±1 per rounding).
5. Every event in a turn record references ≥ 1 fact id of that turn; every fact of importance ≥ 3 known to the player
   is referenced by some event or by the "Meanwhile" line.
6. No figure is NaN/negative; treasuries may be negative only as `debt`.
7. Every open commitment's `by` is alive or the commitment is `void`.
8. Every letter in flight has `arriveDay > sentDay` and a route distance ≥ 0.
9. Knowledge never contains a fact before its day, and never a fact with `scope: 'secret'` unless learned via spy/scheme.
   *(B9: `engine/state/validate.js` invariant 9, over the stored learnings and the news still on the road.)*
10. The player-view state (`view.js`) contains no hidden truth (spot-checked by a test with a known secret).
    *(B9: `server/view.js` `hiddenTruths`; `tests/knowledge.test.js`, `tests/http.test.js`.)*
