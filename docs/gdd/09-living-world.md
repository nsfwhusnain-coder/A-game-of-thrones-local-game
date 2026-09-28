# 09 · The living world

> How the realm moves without the player: who decides, who travels, what the smallfolk do, how news and lies travel,
> what threats grow. Fixes B-10 (lords at feasts during a muster), B-06/B-07 (the King's progress), and delivers the
> owner's request: "people wandering, the king's host visible, all the lords and ladies going places … visible on the map."

---

## 1. Three layers of life

| Layer | Who | Decided by | Cost | Visible as |
|---|---|---|---|---|
| **Agency** | ~60 notable actors: kings, heads of great and major houses, regents, commanders, office-holders, key schemers | **Minds** (model, [04](04-ai-system.md) §5) when salient; **behaviour trees** otherwise | a few model calls per week | facts, chronicle cards, parties moving with purpose |
| **Society** | every lord, lady, knight, maester and household | **engine schedulers** (retinues, court calendars, weddings, visits, hunts, pilgrimages) | none | parties on the roads; guests at seats; "Meanwhile" |
| **Ambient** | smallfolk, carts, refugees, ravens, fishing boats, outriders | **the renderer**, from the state ([11](11-map-visuals.md) §6) | none | little moving figures that read true (war, prosperity, sieges) |

## 2. Agency: goals, minds and behaviour trees

### 2.1 Goals

`data/agendas.js` (32 entries) is expanded to cover **every head of a great or major house, every regent and every
office-holder** (~90 goal sets). Each goal:

```js
{ who, id, text: 'see Joffrey on the throne and the Lannister name unassailable', kind: 'power'|'family'|'revenge'|'wealth'|'duty'|'faith'|'survival'|'love',
  canon: true, target, when: (s) => bool, steps: [ { verb, params, note } ], priority 0-100, abandonIf: (s) => bool }
```

Steps are **suggestions** the Mind sees as the hint line ("Might next: send Ser Gregor to raid the Riverlands") and the
behaviour tree's default. Goals are revised by events: a goal whose `abandonIf` holds is dropped and a fallback goal
from the character's nature takes its place (a captive's goal becomes *escape*; a widow's *protect my son*).

### 2.2 Behaviour trees (the no-model fallback, and the mock)

> *Built in WP B7* (`engine/minds/houseways.js`; D-024): what presses first (the house's own answer, then everyone's),
> then the calm ways of the house, the lord's nature and everyone; every great house and Frey, Bolton, Manderly,
> Dragonstone, the Watch and the free folk have ways of their own. The full goal sets of §2.1 are WP D6.

`engine/world/houseways.js` turns `data/voices.js HOUSE_WAYS` into executable trees: an ordered list of `(condition →
verb)` rules per house and per archetype, e.g. for House Lannister:

```
if kin captured by X                → demand release of X; if refused within 14 days → raid X's lands (Gregor), call_banners
if a vassal defies                  → march on the vassal (The Rains of Castamere)
if the Crown is weak and needs coin → lend, and demand office in return
if at war and enemy host in reach   → give battle if odds ≥ 1.1 else hold
else                                → hold court; betroth to advantage
```

and for the archetype *minor lord, dutiful*: `answer the liege's summons · pay dues · feud with the traditional rival if
provoked · attend the liege's feasts · ask the liege for justice`. Every tree ends in a safe default (`hold`). Trees
are also the `mock` provider's Mind implementation, so CI exercises them every turn.

### 2.3 Salience and budget

As [04](04-ai-system.md) §5.1. Characters in canon beats' `names` get salience +20 under Canon gravity. The player's
liege, their neighbours and anyone they wrote to are always strong candidates.

### 2.4 NPC-to-NPC diplomacy

When a Mind chooses `send_letter`/`send_envoy`/`propose` toward another NPC, the recipient decides on arrival:
**deterministically** (disposition + nature + interests) unless the recipient is salient that segment, in which case
their Mind sees the proposal in its context. Deals between NPCs create pacts and commitments like the player's. The
player learns of them only through knowledge (public pacts spread; secret ones do not).

## 3. Society: people on the road

### 3.1 The retinue scheduler (rewrite of `shared/retinues.js`)

Each day, the scheduler may send up to 3 lords/ladies on a journey (cap: 20 abroad at once, 30 in a tourney month):

1. **Pick** a character whose activity is `ruling` or `idle`, with no open commitment due within `2 × trip days`, not
   summoned (`obligations.levies` not `called|answered|gathering|departed|serving`), not besieged, not at war with the
   destination's owner, not a canon-locked character. (Fixes B-10.)
2. **Purpose and destination** by weights: the liege's court (a summons or a courtesy call), a neighbour's feast or
   wedding, a fostered child's household, a market town (horses, iron), a sept or a weirwood (piety), a hunt in the
   lord's own forest, a tourney (when one is announced), a pilgrimage (Oldtown, the Starry Sept, the Isle of Faces —
   rare). Weights from nature (warmth → feasts; piety → septs; ambition → the liege's court) and season (no long
   journeys in winter in the North).
3. **Party:** `kind: 'retinue'`, leader + 0–3 family members + escort (10–450 by rank), `purpose`, route; `state:
   marching → staying (1–6 days) → returning → disbanded` at home. Activities claimed with priority 40 (attending).
4. **Facts:** `set_out` (importance 1 unless great lord: 2), `arrived` at the host's seat (the host's court gets a guest
   list), `returned`. Minor journeys go to "Meanwhile"; a great lord's journey is a small card.
5. **Consequences:** a lord away from his seat cannot answer a raven for the days he is on the road; guests at a seat are
   *present* for audiences there (the player can meet them); meetings on the road are possible `met_on_road` facts;
   a party on the road can be ambushed (`roads.js`).

### 3.2 Courts and calendars

- **King's Landing:** the small council meets; petitioners come; tourneys on the King's and Joffrey's name days (canon:
  Joffrey's name-day tourney in 298 and 299); the Hand's tourney (a beat). The court is a place with a *guest list* (who
  is at court), shown on the holding card.
- **Seats:** a lord's court days (monthly petitions — the source of the player's Matters), harvest feasts (autumn),
  weddings.
- **Religious calendar:** the Faith's feast days (the Maiden's Day, the Father's Day), the old gods' — flavour facts
  that bring septons and pilgrims onto the roads.

### 3.3 The King's progress (a first-class party)

`kind: 'progress'` — Robert, Cersei, Jaime, Tyrion, the royal children, the Hound, Ser Barristan? (No: Barristan rides
with the progress in the books — keep him with it), Ser Boros, Ser Meryn, ~300 knights and men-at-arms, ~1,400 people
in all, the Queen's wheelhouse (speed 10 miles/day), a mile of wagons.

- Route: King's Landing → the kingsroad → the Crossroads Inn → the Twins (courtesy of Lord Walder) → Moat Cailin →
  Winterfell, with **scheduled stops** (a night at each inn, 3 days at the Twins, feasts at stops) — authored in the
  beat so it arrives at Winterfell in the canon window.
- **Canon-locked** while the `kings_ride` thread is active ([03](03-architecture.md) §9): Minds cannot redirect it;
  only the King's own Mind (if salient) may *delay* it by days, and only the beat may change its destination.
- **The beat never teleports** (fixes B-06): *"The King comes to Winterfell"* fires **when the progress party arrives
  at Winterfell** (an `arrived` fact), not on a date. If the progress is destroyed, delayed past its window, or turned
  back (the player as Stark refuses the King at the gate — a Matter), the beat's alternates run (10 §3).
- Visible to all (`visibility: 'public'`): the map always shows it (a large royal token with the crowned stag banner and
  the lion, a long column at close zoom); inns along the road fill (a flavour fact); lords ride out to meet it (the
  retinue scheduler picks lords near its route with purpose `court`).
- The return south (after the Hand's decision and Bran's fall) is the same party, now with Lord Eddard, Sansa, Arya and
  the Stark household (if the Hand accepted) — they are its `members`.

*Implemented (WP D8):* `shared/retinues.js` — up to three a day, twenty abroad (thirty in a tourney moon); purposes
weighted by nature (warmth → feasts, ambition → the liege, piety → septs and pilgrimages to Oldtown and King's Landing)
and season (feasts doubled in autumn; no long journeys in a northern winter); tourneys draw their region, the King's
progress draws the lords near where it halts; 0–3 of the family ride along; the canon-locked stay home; guests at a
seat (`guestsAt`) on its card; `returned` told on the way home. `data/calendar.js`: the Faith's days, the harvest fires,
the old gods' night, the small council's first-day sitting — Meanwhile flavour. The soak fails under five journeys a
moon. Not built: the progress's scheduled stops. `tests/society.test.js`.

## 4. Ambient life (map-only, read from the state)

Rendered by `map3d/life.js` (restyled, [11](11-map-visuals.md) §6); generated deterministically from the state each
sync; never saved; never narrated except through happenings.

| Figures | Where | Driven by |
|---|---|---|
| Smallfolk walking between villages and market towns | near holdings with prosperity ≥ 40 | population, prosperity; fewer in winter; none within 3 days of a hostile host |
| Carts and wagons | on roads between prosperous neighbours | trade income; stop when either side is at war (existing) |
| Refugees | from besieged, sacked, raided, burning or rising holdings toward the nearest calm place | devastation, sieges (existing) |
| Fishing boats | off coastal holdings | season; none in winter storms |
| Ravens | letters actually in flight (existing) | `letters` |
| Outriders | ahead of hosts > 2,500 (existing) | host orders |
| Deserters | from hosts with low morale/supply (existing) | host state |
| Smoke | burning holdings, camps, battle sites (1 year) | holding status, landmarks |
| Pilgrims, septons | on roads toward septs on feast days | calendar |
| Snow / mud tint on roads | season, road damage | weather, logistics |

## 5. Threats (clocks that grow)

`engine/world/threats.js`, grown from `plots.js` threats. Each threat is a clock 0–100 with visible signs at thresholds,
driving beats and hooks:

| Threat | Grows with | Signs (facts at 25/50/75) | At 100 |
|---|---|---|---|
| **The free folk** | time; Mance's unity; the Watch's weakness | rangers lost; villages of the Gift raided; a host of wildlings sighted | an assault on the Wall (the canon beat 300 AC) |
| **The cold / the Others** | time (slow) | wights (the canon beat at Castle Black), dead animals, the Fist (beat) | out of 298–300 scope except the canon beats |
| **The Iron Bank** | the Crown's debt, missed payments | letters from Braavos, raised rates | refusal of credit; funding the Crown's enemies |
| **Winter** | season length | white ravens; frost in the North; failed harvests | winter (the season engine) |
| **The dragon's blood** | Daenerys's beats | rumours from Essos: a Targaryen princess wed to a khal; then dragons | a rumour that reaches the Crown (the assassination attempt beat) |
| **Outlaws** | devastation, war | outlaw bands on roads | a Brotherhood (the canon beat after Beric) |
| **Plague/flux** | sieges, crowded camps, famine | fevers | a plague in a city (a hook) |

## 6. Weather and seasons

- **Season** engine as now (`economy.js seasonTick`): white ravens; unknown lengths; canon: autumn declared in 299 AC,
  winter in 300 AC (under Canon gravity, the engine schedules the white ravens in those windows).
- **Weather** per region per week: `clear | rain | storm | fog | snow | blizzard | heat`, from season and region
  (`world.weather`). **Weather must fit the season** (fixes the "summer blizzard" class of error): blizzards only in winter
  or beyond the Wall / high mountains; snow in the North only from late autumn.
- Weather affects march speed ([07](07-military.md) §5), sea storms, harvest luck, and is given to the narrator as
  setting (not as a fact to narrate unless it matters).
- **The snow line** (`world.snowLine`, a map latitude) creeps south through autumn into winter and is drawn on the map
  ([11](11-map-visuals.md) §5.3).

## 7. Knowledge, news and fog of war

`engine/knowledge.js` replaces `shared/intel.js` (keeping its good parts: reports, spies, feints, secrecy).

> *Implemented in WP B9* ([DECISIONS D-032–D-033](DECISIONS.md)): news worked out from each fact (`newsOf`), only
> what cannot be worked out stored per house; the chronicle tells late news on the day it arrives; minds see their
> house's knowledge; the player's view is filtered on the server (`server/view.js`). Rumours as beliefs (§7.3) come with
> the `spread_rumour` verb (B10).

### 7.1 How news travels

Every fact has an origin (place/pos) and a visibility scope:

| Scope | Who learns it, when |
|---|---|
| `public` | every house, when the news reaches its seat: by **raven** from the nearest seat with a rookery within 1 day of the event (200 miles/day), else by **rider/rumour** along roads (30 miles/day). Great events (a king's death) are public by raven everywhere within ~3–10 days. |
| `local` | houses with a holding or party within `radius` (sight), immediately; others by rumour later with lower confidence |
| `houses` | only the listed houses (a private letter, a pact's secret terms), immediately on delivery |
| `secret` | only the actors; others learn only via a spy scheme, a captured messenger, a confession (audience reveal), or a hook |

The player's house sees facts only when they are known to it. The chronicle shows the day the news **arrived** and, in the
card's footer, the day it **happened** ("It happened on the 3rd; the raven came on the 6th").

### 7.2 Sight and reports

- **Sight radius** (map units): own holdings 60, own hosts 80, vassals' holdings 40, allies' hosts 50, spies in a house
  (its hosts and letters). Within sight, hosts are known truly.
- **Reports** for everything else: last-known position, men (±30 % noise, ±10 % for spies), owner, age in days,
  confidence; they age (confidence −0.15 per 7 days) and can be **false** (feints, planted rumours).
- Minds see only their house's knowledge (their sight, reports and letters).

### 7.3 Rumours and lies

- `spread_rumour` creates a `rumour` fact with chosen content and scope, and **beliefs** in houses that hear it.
- Rumours shift opinions and minds' choices but never the engine truth.
- The narrator may tell a rumour only as a rumour ("It is said in King's Landing that…"), with its source.

### 7.4 What the player sees on the map

True positions for what they can see; ghost tokens (translucent, dashed outline, age label) for reports; nothing for
the unknown. Server-side filtering ([03](03-architecture.md) §10): the client never receives the truth it should not see.

## 8. Happenings (the small life of the realm)

`data/happenings.js` (~190 templates) is kept and **expanded to ~400** ([13](13-content-data.md) §6). Changes:

- Happenings emit `happening` **facts** (importance 1, `local` scope), never cards of their own.
- Frequency: ~7 per moon realm-wide (existing), plus 1–3 per moon in the player's own realm.
- They join the narrator's "Meanwhile" list; the narrator writes one sentence for them per segment.
- Effects stay small (prosperity ±2, unrest ±3, a relation ±5) and are engine-applied.
- The ones on the player's lands can be pinned if they carry a Matter (a poaching case → a judgement).

## 9. Liveliness guarantees (Q4)

> *Points 1, 2 and 4 hold from WP B7* (`server/minds.js`; D-026): three lords act each week, one far from the player; the
> movements are the minds' own and the retinues'; no card says nothing happened. *Point 3 holds from WP B12*
> (`server/director.js` `thinWeek`; `tests/director.test.js`): a whole week with fewer than three facts of note gets a hook.

Per 7-day segment, the engine ensures:

1. ≥ 3 NPC decisions resolved (minds or trees) somewhere in the realm, at least one outside the player's region;
2. ≥ 1 visible party movement not caused by the player (retinue, envoy, host);
3. if the realm's facts of importance ≥ 2 number fewer than 3, the Director (or, with the Director off, a deterministic
   hook from `data/hooks.js`) adds one grounded hook;
4. never a fact or event whose content is "nothing happened".
