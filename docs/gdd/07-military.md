# 07 · War: levies, hosts, marching, supply, battle, siege and sea

> Fixes B-02 ("they muster up and they kind of stay there"), B-08/B-09/B-20 (the model editing hosts), B-11 (islands,
> natives' tolls). Data model: `Party` in [03-architecture.md](03-architecture.md) §3.3. All constants in
> `public/data/balance.js`.

---

## 1. Design goals

1. **One host per campaign, visibly growing.** Calling the banners creates *one* named host that gathers over days and
   weeks; contingents on the road are part of it and join it wherever it is. The player never finds 18 fragments.
2. **Time is the cost of war.** Ravens take days to reach the lords, the levies take a week or three to gather from the
   fields, the march takes weeks. The player feels a muster as a process with ETAs.
3. **The books' numbers.** A great house fields what it fielded in the books; a quick muster is about a third of a full
   one; a lord who answers late brings fewer men.
4. **Readable outcomes.** Battles and sieges resolve by legible factors (numbers, horse, walls, commander, surprise,
   supply, morale) and the report says which mattered.
5. **The engine fights; the model narrates.** No model call may change men, morale, supply, position or state of any
   party. Minds choose intents ("march on Riverrun", "offer terms"); the engine resolves them.

## 2. Forces

### 2.1 Troop classes (existing `shared/units.js`, kept)

| Class | Role | Speed class | Upkeep ([06](06-economy.md) §6) | Notes |
|---|---|---|---|---|
| Levies (foot) | spears, bows, the smallfolk | foot | 0.25 d in the field | most of any host; poor morale |
| Archers | levy or professional bowmen | foot | 0.3 | Westerlands, Reach, crannogmen (bogs) |
| Men-at-arms | paid professional foot | foot | 0.5 | a lord's standing force |
| Knights (heavy horse) | the charge | horse | 2.0 | Reach, Vale, Westerlands, Stormlands |
| Light horse / riders | scouts, raiders | horse | 1.0 | North (Ryswells), Dorne |
| Clansmen | mountain tribes | foot (fast in mountains) | 0.2 | Vale clans (Stone Crows, Burned Men…) |
| Sellswords | professionals | by type | 2.0 foot / 3.5 horse | obey while paid |
| Sworn brothers | the Night's Watch | foot | 0.3 | never leave the Wall's service |
| Screamers | Dothraki | horse (fastest) | 0 (plunder) | will not cross the sea |

Regional composition for a levy (fractions: knights / riders / foot / archers), from `units.js`, retuned:

| Region | Knights | Riders | Foot | Archers |
|---|---|---|---|---|
| North | 0.03 | 0.13 | 0.68 | 0.16 |
| Riverlands | 0.06 | 0.08 | 0.66 | 0.20 |
| Vale | 0.12 | 0.08 | 0.62 | 0.18 |
| Westerlands | 0.08 | 0.06 | 0.64 | 0.22 |
| Reach | 0.12 | 0.06 | 0.62 | 0.20 |
| Stormlands | 0.09 | 0.08 | 0.65 | 0.18 |
| Dorne | 0.04 | 0.26 | 0.52 | 0.18 |
| Crownlands | 0.06 | 0.06 | 0.68 | 0.20 |
| Iron Islands | 0.00 | 0.00 | 0.85 (reavers) | 0.15 |

### 2.2 Muster sizes (starting `levies` = full muster; quick muster ≈ 40 %)

Great houses' *realm* totals must match [06](06-economy.md) §4. Per-house starting levies for the North, as the worked
example (the others follow the same rule: region total × house's population share):

| House (North) | Full levies | Quick (a moon) | Men-at-arms | Notes |
|---|---|---|---|---|
| Stark (own lands) | 7,500 | 3,000 | 1,200 | + Winterfell household 400 |
| Manderly | 7,000 | 2,800 | 400 | + 25 ships; knights (Andal custom) |
| Umber | 4,000 | 1,600 (the Greatjon brings more: devoted) | 370 | |
| Karstark | 4,000 | 1,600 | 310 | |
| Bolton | 5,000 | 2,000 | 480 | canon: Roose brings ~2,000 foot to Robb |
| Glover | 1,500 | 600 | 80 | |
| Mormont | 1,100 | 450 | 110 | |
| Hornwood | 1,600 | 650 | 90 | |
| Cerwyn | 1,400 | 550 | 90 | |
| Tallhart | 1,400 | 550 | 110 | |
| Dustin, Ryswell | 1,500 each | 600 each | 90 each | Ryswell: riders |
| Flint, Locke, Forrester, Wull, Norrey, Liddle, Crowl, Reed | 500–1,000 each | 200–400 | 30–80 | Reed: crannogmen, archers, pass the Neck freely |
| **The North, total** | **≈ 45,000** | **≈ 18,500** | ≈ 3,900 | canon: 18,000 at Moat Cailin + 1,500 from White Harbor |

## 3. Calling the banners (the muster state machine)

`engine/military/muster.js` replaces `vassalTick`'s banner branch, `advanceMusters`, `gatherMusters`, and
`orders.js callBanners`/`raiseLevies`.

### 3.1 The call

Verb `call_banners { vassals: 'all' | [houseIds], at: place, scope: 'quick' | 'full', host: 'new' | partyId, name?, commander? }`:

1. Creates (or reuses) the **Grand Host** party: `kind: 'host'`, `state: 'mustering'`, at the muster place, owner the
   liege, `leader` the named commander (default: the lord, or the heir if the lord is not at the muster), `name` from the
   order or `"The Host of the <realm>"`. It starts with whatever the liege's own household and raised levies are.
2. For each called vassal: a `Letter` (raven if both seats have rookeries, else rider) is sent; `vassal.obligations.levies
   = { state: 'called', callId, host: grandHostId, scope, sentDay, arriveDay }`.
3. The Grand Host's `muster.expected` lists every called vassal with a **predicted** ETA (raven days + deliberation 2 +
   gathering + march). The receipt and the host card show it ("10 lords expected; the last in ~34 days").
4. Facts: `levies_called` (public within the realm).

### 3.2 A vassal's answer (per vassal, daily)

```
called ──(letter arrives)──► deliberating (1–3 days)
deliberating ──► answered | delayed | refused      // by temper (08 §10), scope, harvest, threats to his own lands, secret talks (treachery.js)
answered ──► gathering (G days) ──► departed (a contingent party sets out, orders: rendezvous → grand host)
delayed ──(10–30 days)──► deliberating again (a second refusal chance)
departed ──(contact with the grand host)──► joined
joined ──► serving ──► released (disband) | deserted (fieldService) | fallen (battle)
```

- **Answer odds** by temper (`vassalTemper`): devoted ≥ 70: answered 95 %; dutiful 45–69: 85 / 13 / 2; wavering 28–44:
  50 / 40 / 10; resentful < 28: 20 / 30 / 50. Modifiers: scope `full` −10 answered; harvest months (autumn) −10; own lands
  threatened −20; secret talks with the enemy → answered-but-slow (a *feint* answer: gathering ×2) or refused.
- **Men sent**: `quick` = 40 % of levies × zeal (devoted 1.1, dutiful 1.0, wavering 0.8, resentful 0.6) + 60 % of
  men-at-arms; `full` = 90 % × zeal + 80 %. Rounded to 50. A late answer after a delay brings ×0.85.
- **Gathering time** G (days) = `base[region] × (scope full ? 1.8 : 1) × (autumn ? 1.4 : 1) × (winter ? 1.6 : 1)`;
  base: North 12 (distances), Riverlands 8, Vale 10 (mountains), Westerlands 6 (half-mustered), Reach 8, Stormlands 9,
  Dorne 10, Crownlands 7, Iron Islands 5 (ships). The contingent forms at the vassal's seat and grows day by day (a
  `muster_grew` fact every few days, importance 1, never a card).
- **The lord rides with his men** (kept from `vassals.js`): his activity becomes `commanding` or `mustering`; up to two
  grown sons/brothers/sworn knights come (women only if warriors: Mormonts). Their activities are claimed (fixes B-10:
  the retinue scheduler can no longer send them to feasts).

### 3.3 The player's own levies

Verb `raise_levies { at, men, into: grandHostId | 'new', commander }`: the men are reserved at once; they gather at
`max(50, men/14)` per day into the target host at `at` (as now), shown growing on the map. If the grand host has marched,
the raised men form a contingent that follows it (same rendezvous rule).

### 3.4 Rendezvous (the fix for B-02)

A contingent's orders are `{ kind: 'rendezvous', target: grandHostId }`, **never a place**. Each day:

- If the grand host is at a holding and not moving: march to that holding.
- If the grand host is marching: path to the **point on its route where the contingent can intercept it soonest**
  (compute both parties' positions for the next N days; choose the earliest reachable point; fall back to its current
  position). Recompute when the grand host's orders change.
- On contact (≤ `CONTACT`): `host_joined` fact; troops and contingents add; members transfer; the lord's activity
  becomes `commanding` under the grand host's leader (or stays `commanding` of his contingent inside the host: the host
  card lists "Lords with the host").
- If the grand host is destroyed or disbanded: the contingent holds where it is and asks its lord (fallback: go home).
- If the grand host enters enemy land and the contingent's path is blocked (a hostile host or a shut gate), it waits at
  the last friendly holding and a `delayed` fact explains why.

**The player can always see and steer the muster:** the host card shows *present · on the road · expected · refused*
with a timeline, and two buttons: **March now — the banners will follow** (default behaviour) and **Wait for the
banners** (orders.kind `hold` until X % present or a date).

### 3.5 Service, pay and restlessness

Kept from `fieldService` and retuned: after 40 days in the field, the liege pays the contingent's food ([06](06-economy.md)
§6.2). Idle hosts (camped > 20 days without an enemy in reach) lose vassal relation 1.2/moon (2.5 in autumn); a
resentful lord (temper < 22) may take his men home in the night (`desertion` fact, importance 4). Victories raise
temper; defeats lower it.

## 4. Host orders (all engine enums)

| Order | Meaning | Ends when |
|---|---|---|
| `march` → place | go there by the computed route | arrival (then `camped`) |
| `follow` → party | shadow a friendly or hostile party | target gone / order changed |
| `rendezvous` → host | join that host (§3.4) | joined |
| `hold` | stay; defend if attacked | changed |
| `garrison` → holding | enter a holding as its garrison (splits if needed) | changed |
| `besiege` → holding | invest the holding (§8) | fell / lifted |
| `storm` → holding | assault now (§8.4) | resolved |
| `raid` → region/holding | ride through, plunder, burn (§7.6) | N days or recalled |
| `escort` → party | protect a party on its road | its arrival |
| `return` | go home and disband on arrival | home |
| `patrol` → route | march back and forth on a stretch (the Watch on the Wall, a march lord) | changed |
| `blockade` → port (fleets) | §9.4 | changed |

Status text on cards and in prose is **derived** from `state` + `orders` ("marching on Riverrun, ~6 days"), never stored
free text (fixes B-20).

## 5. Movement

- Speeds and routing as in [03](03-architecture.md) §5.
- Terrain multipliers per path segment (from the atlas terrain grid): road 1.0, open 0.85, forest 0.7, hills 0.75,
  mountains 0.5 (passes only; high passes shut in winter), marsh 0.4 (the Neck: 0.25 without crannogman guides),
  snow 0.5. Season: autumn rain ×0.85; winter ×0.6 (North ×0.45, beyond the Wall ×0.35).
- **Forced march** (order flag `forced`): speed ×1.3; 1 %/day stragglers (return later at 50 %), morale −2/day.
  Roose Bolton's night march on the Green Fork is a forced march.
- **Chokepoints** (`chokepoints.js`, kept): the Neck (Moat Cailin), the Green Fork crossing (the Twins), the Bloody
  Gate and the high road, the Golden Tooth, the Prince's Pass and the Boneway, the Wall. **Natives pass free**: houses
  whose seat lies within the chokepoint's region (the Reeds and all crannogmen for the Neck; the Mountain clans for the
  high road) pay no toll and suffer no loss. (Fixes the Reed toll, B-11.)
- **Islands** need ships (§9). Skagos, Bear Island, the Iron Islands, Tarth, Dragonstone, Driftmark, the Three Sisters,
  the Shield Islands, the Arbor, Estermont have no land route; their contingents call for transport (their liege's fleet,
  their own ships, or a hired passage) and wait at their port until it comes. (Fixes Crowl's march from Skagos.)
  *Implemented in WP A8 for the current engine* (`engine/geo.js`, `shared/sea.js`; [DECISIONS.md#D-001](DECISIONS.md)):
  any host bound for another landmass sails — own ships, a few boats making trips, or the realm's ships sent to fetch
  it — and lands on the coast that gets it to its goal soonest; hired passage comes with WP C6.

## 6. Supply

Adopt and extend the logistics work on branch `arena/01a0e08c-a-game-of-thrones-local-game` (`shared/logistics.js`:
rations, horses, wagons, carrying capacity, foraging, stripped countryside, road damage). Merge it as part of WP C3,
adapted to the party model.

- **Rations** (man-days) carried: foot 7 days on their backs; with wagons (1 per 40 men, 600 man-days each) up to 40
  days. Horses eat forage; without forage (winter, stripped land) 1 man-day per 2 horses.
- **Resupply** each day within 2 days' march of a friendly holding with stores: draw up to the holding's surplus (its
  stores fall; its lord's opinion falls if the host is not his liege's).
- **Forage** when rations run low: yield per day = f(province prosperity, season, devastation, host size); foraging adds
  devastation (+1 per 1,000 men per day) and unrest; a province stripped (devastation ≥ 70) yields nothing — marching
  back through it starves the host (the "second passage" rule).
- **Starving** (rations 0, no forage): attrition 1 %/day, desertion ×3, morale −3/day.
- **Disease** in camps and sieges: summer 2 %/moon, autumn 3 %, winter 4.5 %, ×1.5 when supply is short (existing siege
  numbers).

## 7. Battle

`engine/military/battle.js`, grown from `shared/battles.js` (keep its Lanchester core).

### 7.1 When battles happen

- Two hostile hosts come within `CONTACT` and at least one side's orders or stance is *attack*, or neither can withdraw
  (cornered, a river at its back).
- **Stance** is decided the day before contact: each side's commander's **mind** is consulted if the commander is
  salient (a great lord, the player's enemy's main host) — options `give_battle`, `hold_defensive_ground`, `withdraw`,
  `offer_parley`; otherwise a rule: attack if odds ≥ 1.2 (reckless 1.0, cautious 1.5), withdraw if odds < 0.7 and a
  route exists.
- The **player** decides for their own hosts through the host's *standing orders* (card: *Engage if the odds favour us* /
  *Always engage* / *Avoid battle* / *Hold ground*). A major interrupt fires when a battle is imminent (enemy within
  2 days) so the player can change orders.

### 7.2 Resolution (one call to `resolveBattle(ctx, sideA, sideB, site)`)

```
power(side) = Σ class men × classWeight × qualityFactor
classWeight: levy 1.0 · archer 1.2 (×1.4 defending on ground/walls) · man-at-arms 1.6 · rider 1.6 · knight 4.0 (×0.5 in marsh/forest/night) · clansman 1.3 (×1.6 in mountains)
× commander: 1 + (martial − 10) × 0.03  (martial 0–20)
× morale:   0.6 + morale/250
× supply:   starving 0.7 · short 0.9 · fed 1.0
× terrain:  defender on hills/river line ×1.25; ford ×1.4 for the defender; attacking uphill ×0.85
× surprise: ambush/night attack (a surprise flag on the attacker's intent, 07 §7.4) ×1.6 for the first phase
× difficulty (player only, 05 §7)
odds = powerA / powerB; outcome by Lanchester square with noise ±12 % (ctx.rng)
```

Outcomes: *crushing victory* (odds ≥ 2.5), *victory*, *bloody draw* (both withdraw), *defeat*, *rout*. Losses: the
loser 15–40 % (+ pursuit 5–20 % if the victor has horse), the victor 5–20 %. Morale changes ±10–30.

### 7.3 Lords in battle

Each named character in a host rolls: on the losing side, commanders captured 25 %, slain 8 % (knights 15 % captured —
ransom — 5 % slain), others by class; on the winning side slain 2 %. **Canon protection** applies to characters whose
canon death window is later ([08](08-characters-politics.md) §5) under Canon gravity: they are captured or wounded
instead of slain. Facts: `slain_in_battle`, `captured_in_battle`, `wounded`.

### 7.4 Surprise, ambush and feints

- An intent can carry `surprise: true` when the host's route is not known to the enemy (knowledge: the enemy's belief
  about the host is stale or false, [09](09-living-world.md) §7) and the terrain allows cover (forest, night, a split
  force). The Whispering Wood is `surprise` + forest + a feint (Robb's split).
- **Feint:** a party with `feint` shows false numbers/owner to enemy knowledge (existing `a.feint`/`a.secrecy` in
  `intel.js`, kept).

### 7.5 After battle

The winner holds the field (a landmark `battle` marker for a year), may pursue (1 day), captures baggage (rations,
wagons, coin carried). The loser retreats toward the nearest friendly holding. Captives go to the victor's leader's host
as `members` with status `captive`.

### 7.6 Raids

Order `raid` on a region: each day the raiding party burns/plunders one holding's lands in reach (not its castle):
`village_burned`/`raid` facts, loot per [06](06-economy.md) §9.1, devastation, refugees (the living map shows them),
unrest, relations −. Gregor Clegane's raids across the Red Fork are this verb.

## 8. Sieges

`engine/military/siege.js`, keeping the rework already in `shared/battles.js` (stores, camp attrition, sallies, broken
sieges).

### 8.1 Fortress table (fort 0–6 and special rules)

| Holding | Fort | Rule |
|---|---|---|
| The Eyrie | 6 | cannot be stormed or starved by land alone (the Gates of the Moon, the high road; supplied by mules until winter) |
| Storm's End | 6 | cannot be stormed; starved only by land *and* sea blockade (the siege of 282 AC) |
| Casterly Rock | 6 | cannot be stormed by main assault; the sea caves are a weakness (a scheme) |
| Riverrun | 5 | rivers on two sides: besiegers must divide into camps (the Battle of the Camps rule: −25 % to besiegers attacked by a relief host) |
| Winterfell | 5 | hot springs: winter stores last ×1.3 |
| Moat Cailin | 5 (ruined) | from the south: attackers ×0.4 (the causeway); from the north: normal |
| Harrenhal | 4 | too large to garrison: needs ≥ 1,500 defenders or fort counts as 2 |
| Pyke | 5 | bridges; siege only by sea + land |
| The Twins | 4 | two castles; holding the crossing = control of the Green Fork |
| King's Landing | 3 (city) + Red Keep 5 | the city can be stormed; the Red Keep must be starved or betrayed |
| Sunspear | 4 | the shadow city outside the walls |
| Dragonstone | 5 | island; needs a fleet |
| Highgarden | 4 | |
| Oldtown (Hightower) | 3 city + 6 tower | |
| Typical castle | 2–4 | |
| Holdfast / tower | 1–2 | |

### 8.2 Siege ticks

Daily: the garrison eats its stores (garrison + a share of townsfolk); the camp sickens (§6); sallies by strong
garrisons; the besiegers' supply as §6. **Duration estimate** is shown on both sides' cards ("the stores will last ~7
moons").

### 8.3 Ending a siege

- **Starvation:** stores 0 → the garrison asks terms (a mind, if the castellan is salient; else yields).
- **Terms:** verb `offer_terms { holding, terms: 'march_out_with_arms' | 'yield_and_swear' | 'yield_hostages' |
  'unconditional' }`, weighed by the castellan's nature and the odds — the most common way castles change hands.
- **Storm:** verb `storm`: odds use fort ×(1 + fort × 0.6) for defenders, siege engines ×1.3 for attackers; losses heavy
  (attackers 20–50 %). Fails often (by design).
- **Relief:** a friendly host within 3 days of a besieged holding is announced to the besiegers (knowledge); the
  besieging commander's mind chooses *storm now*, *stand and fight*, *lift the siege*.
- **Treachery:** a scheme (bribe the castellan, a postern opened) — `treachery.js` + `bribe`.
- **Lifted:** besiegers withered below the strength to ring the walls (existing rule).

## 9. The sea

`engine/military/naval.js` (new; `fleet` parties exist today but cannot carry, blockade or raid).

### 9.1 Ships

| Type | Crew | Carries soldiers | Speed mi/day | Notes |
|---|---|---|---|---|
| Longship (ironborn) | 40 | 40 (the crew fights) | 90 (oars) | beach landings anywhere |
| War galley | 150 oarsmen | 100 | 70 | the royal fleet, Redwyne, Velaryon |
| Cog / merchant | 30 | 200 | 60 (wind) | transport |
| Carrack / great ship | 60 | 300 | 55 | Braavos, Lys, Volantis |
| Swan ship (Summer Isles) | 50 | 50 | 110 | trade only |

Starting fleets (canon): the Iron Fleet ~100 warships + the lords' ~200 longships; the Redwyne fleet ~200 ships (galleys
and cogs); the royal fleet ~60 war galleys, most at Dragonstone under Stannis (master of ships) in 298; Velaryon ~50;
Manderly 25 (+ a secret fleet built at White Harbor later: a beat); Braavos 600 (not a Westerosi actor);
Lys/Tyrosh/Myr 60–80 each; Salladhor Saan 24–30 sellsails.

### 9.2 Transport

Verb `embark { host, fleet }` at a port (1 day per 2,000 men), `land { fleet, at }` on a coast (a port 1 day; a beach
2 days; longships 0.5). Embarked hosts move with the fleet and fight at sea only as marines. Capacity from §9.1.

### 9.3 Weather at sea

Autumn storms: 3 %/week chance a fleet at sea loses 5–20 % of ships (fewer near the coast); winter 5 %. The Narrow Sea
crossings take 3–7 days.

### 9.4 Blockade and raiding

- `blockade` a port: its trade income ×0.5, no resupply by sea during a siege (required to starve Storm's End, Pyke,
  Dragonstone), relation hits.
- `raid` a coast (ironborn): as land raids but from the sea; captives taken ("thralls, salt wives": a flavour fact, no
  sexual content beyond the books' own mention — [10](10-narrative-events.md) §8.5).

### 9.5 Sea battles

`power = Σ ships × typeWeight (longship 1, galley 2, carrack 2.5, cog 0.8) × crewQuality (Iron Fleet 1.3) × admiral` ±
noise; boarding captures ships; fire (wildfire: a canon verb, the Blackwater) destroys.

## 10. Sellswords, outlaws and others

- **Companies** (`data/companies.js`, new): the Golden Company (10,000; Disputed Lands; contracted to Myr in 298),
  the Brave Companions (~200; Tywin hires them in the books), the Second Sons (500, Essos), the Stormcrows (500, Essos),
  the Windblown (2,000; later). Each has a captain (character), price, loyalty rules (desert if unpaid 1 moon; turn if
  outbid ×1.5 — the Second Sons' rule), and a home region.
- **Outlaw bands** (`kind: 'band'`): spawned by devastation and war (the Brotherhood without Banners is a canon beat after
  Beric's ride); they raid caravans and riders (`roads.js`).
- **The Night's Watch:** ~1,000 men at Castle Black (~600), the Shadow Tower (~200), Eastwatch (~200); recruits ~25/moon
  from the realm (more when lords send criminals — a verb for any lord: `send_to_wall`); rangings are parties beyond the
  Wall; it takes no side in the realm's wars (`legal()` refuses).
- **The free folk:** Mance Rayder's host starts at ~2,000 near the Milkwater and grows by beats toward ~100,000 people
  (~30,000 fighters) by 300 AC; the Wall is its goal.
- **The Dothraki:** Drogo's khalasar ~40,000 riders; moves as a horde across the Dothraki sea; never boards ships ("the
  poison water") — `embark` illegal.
- **Dragons:** hatch by beat (Dany's three, 298/299 AC). Mechanically inert until ~301 (growth); present in the world
  as story assets and a secret/rumour vector. Out of combat scope for 298–300.

## 11. War and peace (the state of war)

`wars[]` keep sides and add `goal` (casus belli: `free_prisoner`, `claim_throne`, `independence`, `revenge`,
`conquest`, `defend_vassal`), `score` (−100..100 from battles won, holdings taken, captives, devastation), and
`started`. Peace comes by `sue_for_peace`/`offer_terms` (diplomacy verbs, [08](08-characters-politics.md) §12) weighed
by score and natures. A war with no fighting for 6 moons becomes a *cold war* (no score drift) until someone acts.

## 12. Military verbs

| Verb | Params | Who | Legal when | Resolution |
|---|---|---|---|---|
| `call_banners` | vassals, at, scope, name, commander | a liege | has vassals; not at war with them | §3 |
| `raise_levies` | at, men, into, commander | head of house | own holding; levies available | §3.3 |
| `march_host` | host, to, forced? | commander/owner | route exists | §5 |
| `follow_host` | host, target | owner | target visible/known | §4 |
| `merge_hosts` | hosts[], name, commander | owner | co-located (≤ CONTACT) | fold |
| `split_host` | host, men/classes, name, leader | owner | host ≥ 100 | new party |
| `garrison` | host, holding, men | owner | own/ally holding | |
| `besiege` / `storm` / `lift_siege` / `offer_terms` | host, holding | commander | at the holding; at war | §8 |
| `raid` | host, region/holding, days | commander | at war (or `deniable` at peace, with a scheme's risk) | §7.6 |
| `disband` | host | owner | not besieged | men home over days |
| `hire_sellswords` / `dismiss_sellswords` | company, months | head of house | coin; company in reach | §10 |
| `embark` / `land` / `blockade` / `send_fleet` | fleet, host, place | owner | §9 | |
| `set_standing_orders` | host, engage: 'favourable'|'always'|'avoid'|'hold' | owner | | §7.1 |
| `declare_war` | house, goal | head of house (vassals only on their liege's enemies unless rebelling) | | war fact; knowledge |
| `sue_for_peace` | war, terms | a side's leader | | diplomacy (08) |

## 13. What the player sees (summary; full UI in [12](12-ui-ux.md) §8)

- **Host card:** name, banner, leader portrait, men by class (icons), lords with the host, present/on the road/expected,
  supply in days, morale in words (steady, eager, weary, shaken, breaking), orders + ETA + route on the map, standing
  orders, odds against the nearest known enemy host ("Lord Tywin's host: ~20,000 — the odds are against us, 2 to 3").
- **Map:** the host token grows as contingents join; contingents on the road are thin tokens with a dashed line to the
  host; the route is a dotted path; a siege ring; a battle marker for a year.
- **Receipts:** every military order says men, days, and what will happen on arrival.
