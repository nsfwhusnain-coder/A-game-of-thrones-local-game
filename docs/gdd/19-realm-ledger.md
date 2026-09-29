# 19 · The State of the Realm (the realm ledger)

> Status: **proposed**. An info view, closed by default, that shows the player where the realm is going: the strengths and
> economies of the houses, who is growing and who is shrinking, the wars and who is rising or falling, and the plain facts
> the realm's lords and the council reason from. Read [03](03-architecture.md) §1 and §3.8, [06](06-economy.md),
> [07](07-military.md), [09](09-living-world.md) §7 and [12](12-ui-ux.md) §5, §9 first.
>
> It is **not** the Book's Realm tab ([12](12-ui-ux.md) §9, which is about *your* house). It is the view *across* houses.
> It adds no rules: every number it shows is a number the engine already computes, or one cheap deterministic record of
> them per turn.

---

## 1. Principles (normative)

1. **One source of truth.** One module (`engine/realm/`) computes every figure. The view, the API, the minds' dossier
   and the council's brief all call it. No second formula anywhere; `standing()` and the ledger are reused, not copied.
2. **The engine computes, never a model.** No model call reads, writes or rounds a number here. Words ("rising",
   "a moon of bread") are engine templates over engine numbers.
3. **The player sees what their house knows** ([09](09-living-world.md) §7): own house exact; sworn houses and allies
   nearly exact; everyone else as an estimate (`~`), a band, or a stale value with its age — or `—`. The view is
   *computed from the viewer's knowledge*, not trimmed after the fact (§5), and a test proves that hidden truth cannot
   move it (§11, R2).
4. **No spoilers, no hidden truths.** Never shown: the Lannister mine's depletion, other houses' secret debts, schemes,
   minds' goals and secret aims (`state.minds` is already withheld by `server/view.js`), the canon schedule, a beat's
   name, the true score of a war the viewer only hears of, future anything. Trends are made only from what the viewer
   *observed*, never back-filled from the truth.
5. **Closed by default, one press to open, one to close.** It never appears unasked, never interrupts a turn, never
   changes a jump's stop rules.
6. **Numbers with meaning** ([12](12-ui-ux.md) §5): every figure has its meaning line ("9 moons of this war", "about
   1 in 5 of the realm's swords"). Meters only with words.

---

## 2. What data exists today (audit of the code, 2026-09-29)

| Need | Where it lives now | Notes |
|---|---|---|
| Levies, men-at-arms, guard, ships, food, treasury, debt, income | `state.houses[id].figures[f].v` for `f` in `FIGURE_FIELDS` (`shared/world.js:25`: treasury, income, debt, levies, menAtArms, guard, ships, food) | `levies` is what is *at home*: `labourFactor` uses `levyCap − figures.levies.v` as "raised"; raised men become parties. Food is in **months of stores**. `income` is the figure a scenario/model may set; the real income is `project()`. |
| What the lands can bear | `house.levyCap`, `house.popBase` (`initEconomy`) | Full muster vs. now gives "levies raised". |
| Real income and its parts | `project(state, houseId)` (`shared/economy.js:142`) → `own, tribute, upkeep, household, court, interest, projects, owed, income, expenses, net, low, high` | Pure; safe to call for any house. `low`/`high` (0.8× / 1.15× income) are already an estimate band. |
| Per-moon ledger lines | `house.ledger[]`, last line copied to each turn record (`record.ledger`, player only) | `server/view.js` strips `ledger` from others' houses. Own house only. |
| Revenue of a set of holdings | `engine/economy/ledger.js` `holdingRevenue(state, h, {tax,trade,labour})`, `prosperityFactor`, `seasonFactor`, `warFactor`, `minesOf` (**the mine secret**), `householdCost`, `wagesOf`, `interestOf` | The estimator for others reuses `holdingRevenue` on *known* holdings, with `minesOf` replaced by the public base (no depletion). |
| Loans | `state.economy.loans[]` `{lender, debtor, amount, pays, called}` | Own loans exact; others' unknown unless a fact was learned. |
| Holdings, population, prosperity, unrest, status, devastation, owner, region | `state.holdings[id]` | Owner is public on the map; `status` ('besieged', 'sacked'…) is seen only in sight or by news. |
| Hosts and fleets | `state.parties` (`kind` host / fleet / garrison, `men`, `ships`, `owner`, `serving`); `forces(state)`; `navalPower`, `hullsOf` (`military/naval.js`) | Others' hosts: only what `k.parties` (reports) or `seesParty` gives. |
| Muster | `house.obligations.levies`, `engine/military/muster.js` `musterOf` | Whether banners are called is public news; how many answered is not. |
| Rank and strength of a house | `standing(state, id)` (`shared/standing.js:21`) → `lands, might, wealth, sway, blood, order, score, swords, gold`; stored for the player as `state.standing` | **The power index already exists.** It is reused as *Power* (§4.4), computed on the viewer's figures. |
| Realm totals | `realmTotals(state, id)`, `realmOf`, `vassalsOf` (`shared/world.js`) | For the "realm" toggle (house + sworn houses). |
| Relations | `getRelation(state, a, b)`; `state.pacts[]` | Relation to *the viewer* is known; between two others only as a rumour word. |
| Wars | `state.wars[]` `{id, name, attackers[], defenders[], started, status, note, score}`; `sideOf`, `scoreFor`, `leaderOf`, `goalOf` (`politics/war.js`) | `score` moves by facts (`battle`, `holding_fell`, `siege_lifted`…). No history of the score is kept. |
| Season | `state.world.season` | Public. |
| What minds read | `engine/minds/options.js` `worldView` (holdings, vassals, hosts, wars, `foeHosts` via `hostsKnownTo`, `gold`, `levies`, `menAtArms`, `rel`, `friends`, `rivals`); `salience.js` `scoreActors`; `goals.js`; `server/minds.js` `knownTo` (weightiest facts a house has heard) | `worldView` reads **own** figures only, and others through knowledge. It has no comparative view of the realm ("who is strongest"), so a mind cannot say "Lannister is twice my size". |
| Turn history | `state.history` (last 30 turn records), `saves/<id>/turns/NNNNNN.json` (every turn, forever), `snapshots/NNNNNN.json.gz` (last 10, for undo), `facts.jsonl` (every fact), `readTurn`, `readFacts(view:'player')`, route `GET /api/games/:id/turns/:n` | **No per-house time series exists.** Turn records hold only the player's ledger line and events. Snapshots are too few and too heavy to mine. Facts hold events, not stocks. |
| Knowledge of others' figures | `state.knowledge[house]` = `{parties, spies, facts, beliefs}` (`engine/knowledge.js`) | **No stored knowledge of other houses' stocks.** Hosts are reported (`men` rounded ±25 %, with age and source); spies/letters teach *facts*. So every estimate in this view must be derived, and the last observation must be stored (§3.2). |

**Missing and to be added** (all deterministic, no model, no RNG draw):

- **M1** `state.realmStats` — the truth series (§3.1), one sample per turn close, plus per-war score series.
- **M2** `state.knowledge[house].realm` — each house's last observations of others (§3.2), source of estimates and of the
  viewer's sparklines for others.
- **M3** `engine/realm/` — `figures.js` (one house's figures from truth), `estimate.js` (from knowledge),
  `view.js` (tables, ranks, trends, wars, facts), `brief.js` (text for minds and council).
- **M4** `route GET /api/games/:id/realm`, the UI window, a hotkey.
- **M5** a seeded hash (`hash32` in `engine/rng.js`) so estimate noise is a pure function of (save seed, viewer,
  subject, field, observation turn): reopening the view, reloading a save or replaying a turn gives the same `~`.

---

## 3. Data model

### 3.1 The truth series: `state.realmStats` (M1)

Written by the engine at the end of each turn (`closeTurn` in `server/game.js`, after `settleWorld`, so it sees the
settled books; also once at new-game creation so a series never starts empty). Cheap: reads figures, sums holdings,
one `project()` per listed house.

```js
state.realmStats = {
  v: 1,
  fields: ['swords','levies','menAtArms','guard','gold','debt','income','expenses','food','ships','holdings','people','prosperity','unrest','power'],
  samples: [ { day, turn, h: { stark: [ …ints, one per field… ], lannister: [ … ] } }, … ],   // oldest first
  wars: { 'war_1': [[day, score], …] },                                                          // engine score, side A's view
};
```

- **Integers only** (people in hundreds, prosperity/unrest ×1, food in tenths of a moon): a sample is ~15 small ints per
  house.
- **Which houses:** every house of rank `crown|paramount|major|order|tribe|city_state|company|exile`, plus any minor
  house that is a vassal of one of those, at war, or the player's. Extinct houses stop being sampled (their last sample
  stays).
- **Thinning** (keeps saves small): at least 7 days between samples (a shorter turn overwrites the last sample of that
  week); keep the newest 16 samples, then every 4th older one, capped at 48 samples (~4 game years at moon turns).
  ≈ 30 houses × 15 ints × 48 ≈ 22k ints ≈ 110 KB. It is in the save and in snapshots (so undo unmakes it), and is
  mirrored **whole-turn** into `turns/NNNNNN.json` as `record.realm` (the same row, unthinned) so tools and the owner's
  scripts have the complete truth series without touching saves. `ms` timings are not involved; a replay is byte-for-byte
  the same.
- The **truth series is never sent to the browser.** The server uses it only for the viewer's *own* house (and for
  sworn houses, §4.2); everything else comes through §3.2.
- **Old saves:** `migrate.js` adds an empty `realmStats` and takes a first sample at load; the own house's earlier
  points may be back-filled from `turns/*.json` `record.ledger` (income and treasury are there); nothing else is
  invented. The view says "The chronicle of figures begins on <date>."

### 3.2 What a house has observed: `state.knowledge[house].realm` (M2)

Filled in `updateKnowledge(state, house)` (already run after every turn for the player's house; **run it for every house
that has a mind or is a friend of the player only if the minds' dossier uses this brief — §8**, otherwise player only).

```js
knowledge[house].realm = {
  [subject]: { obs: [ { day, turn, via, v: { swords?, levies?, gold?, income?, food?, ships?, holdings?, people?, power? } } ] }   // ≤ 24, newest last
};
```

Only fields the viewer could really have learned are present (a missing key means "unknown", never zero). `via` is one
of `'self' | 'sworn' | 'seen' | 'reported' | 'rumour' | 'learned'` (§5). An observation is **stored as the true value
already blurred by the via's noise**, using `hash32` (M5), so the stored number, not the truth, is what the estimate
returns and the truth cannot be recovered by re-querying. No truth is copied for the viewer's own house or for sworn
houses — those are read live.

### 3.3 Nothing else is stored

Ranks, trends, the "rising/falling" word, wars' momentum and the fact list are **derived on read** from §3.1/§3.2 and
the live state. They are never saved (no stale copies to disagree with the engine).

---

## 4. The figures, ranks and trends

### 4.1 The columns (one table, three lenses)

The main table has one row per house and a **lens** switch (tabs above the table). Every lens has the same first columns
(rank `#`, crest + house, lord) and a trailing **Trend**.

| Lens | Columns (after crest, house) | Source of a cell (own house) |
|---|---|---|
| **Strength** (default) | Power · Swords · Levies (home / raised) · Men-at-arms · Ships · Holdings · People | `standing().score`; `swords` = hosts + levies + men-at-arms (as `standing` counts it); `figures.levies/menAtArms/ships`; `levyCap − levies` = raised; holdings owned; Σ `population` |
| **Economy** | Gold · Income /moon · Outgoings /moon · Net · Food · Debt · Tax | `figures.treasury − debt`; `project().income/expenses/net`; `figures.food.v` (moons); `policy.tax` |
| **Land** | Holdings · People · Prosperity · Unrest · Besieged/occupied · Harvest | holdings' `prosperity` (population-weighted mean), `unrest`, count of `status` ∈ besieged/sacked/burning/occupied/rising, `seasonFactor` word |

Rows listed (chips): **Great houses** (default: crown, paramount, plus majors the viewer knows), **My realm** (own house,
liege, sworn houses), **At war**, **Neighbours** (seats within the salience radius of `scoreActors`), **All known**. A
toggle **House ↔ Realm** switches the row between the house alone and `realmTotals` (house + sworn houses), because "the
North" is Stark plus its bannermen.

### 4.2 The estimate tiers (what the player sees for each house)

A cell has a **value** (a number or a band), a **mark** (`` exact, `~` estimate, `≈…` band, `≥` lower bound, `—` unknown)
and an **age** (`this moon`, `3 turns ago`) shown on hover and as a faded `?` when older than 2 turns. Precision is by
*who* the house is to the viewer and *how* it was learned:

| via | Who / how | Precision | Age |
|---|---|---|---|
| `self` | the viewer's own house | exact, live | 0 |
| `sworn` | a house sworn to the viewer, or an ally (`friendsOf`) | `~`, 3 sig. figs (±5 %); their food and gold given as `~` too (a lord knows his bannermen's granaries); an ally's **coin is only a band** | 0 |
| `seen` | holdings and hosts within `SIGHT` of the viewer's eyes (`eyesOf`, `seesParty`) | `~`, 2 sig. figs (±10 %) for what is seen (hosts in the field, holdings' status), nothing for what is not | 0 |
| `reported` | a raven/rider report (`k.parties`, facts `knows()`): hosts `men` as the report gave (±25 %, existing `addReport` rounding); holdings that changed hands by known facts | `~`, 2 sig. figs, lower bound `≥` for a sum of only some hosts | the report's age |
| `rumour` | nothing recent; the prior from public knowledge (rank, region, the count of known holdings' population) | a **band** `≈ 10–20k`, or a word ("great", "modest", "small") | "long unheard of" |
| `learned` | a spy, letter or confession taught a fact (`k.facts`, `LEARNED`) that states a figure ("Lannister's treasury is 500,000") | `~`, 3 sig. figs, dated | the fact's day |
| none | no way to know | `—` | |

How each figure of another house is *derived* (all in `engine/realm/estimate.js`, pure, deterministic):

- **Holdings and People:** the holdings the viewer believes the house owns: start-of-scenario owner amended by known
  facts (`holding_fell`, `sworn`, `granted`…) and by the map's owner where the viewer's eyes reach. Count exact for
  believed holdings; People = Σ believed holdings' `population`, `~` 2 sig. figs, with the age of the *oldest* holding
  fact used.
- **Swords:** Σ known/seen/reported hosts' `men` (`≥`, "and what they have not raised") + levies estimated from
  believed People × the rank's muster share (`MUSTER` in `data/balance.js`; the public "a great house can raise
  about…") shown as a **band**. Never the truth of an unreported raise.
- **Ships:** fleets seen or reported (`ships` from `k.parties`), `≥`; else the public reputation for houses with the sea
  (`Iron Islands`, `Redwyne`, `Crown`) as a band; else `—`.
- **Income:** `holdingRevenue()` over the believed holdings with *default* taxes and no hidden mines, scaled by the
  season the viewer would know; shown `~` with `low/high` band = the same `low`/`high` idea as `project()`. Not the
  house's real `income`.
- **Gold:** **never** derived for houses the viewer has no window on: shown as a **wealth word** (`sound`, `modest`,
  `pressed`, `unknown`) from public signs (does it pay its levies? has a known default / loan call / hired sellswords /
  sold grain been *learned*?). A number appears only under `sworn` (band for allies) or `learned`. The Lannister hoard
  and the mines' decline are never inferable.
- **Food:** `sworn` gives `~ moons`; others: only the word from known famine/plenty facts and the season ("a hard
  winter ahead"), else `—`.
- **Power:** `standing()`'s formula run on the *displayed* (estimated) inputs, so the viewer's ranking is the ranking the
  viewer could make, and a house of unknown means is ranked with its band's midpoint and marked `≈`.

`observe(state, viewer, subject)` records a new observation each turn **only when the viewer has a way to know** (its
via is not none): the weight of news is the same as `knowledge.js` `newsChance` — a great house's state is heard of
almost every turn, a far minor house's rarely — and the roll is `hash32`, not `random()`, so **the engine's RNG stream is
not consumed** (existing replay/soak tests stay valid).

### 4.3 Ranks

- Each numeric column is ranked among the *listed rows*, on the **displayed** values (estimates for others), highest
  first; `#1..#n` shown small beside the value.
- When two rows' bands overlap the ranks are shown tied (`≈#2`), so the view never claims a lead the viewer cannot see.
- The rank column at the left is the **Power** rank. Unknown rows sort last and show `—`.
- Sorting by any column header; the sort is stable and the default (Power) breaks ties by house id, so the order is
  deterministic.

### 4.4 Power

`standing()` as it is (lands 26 %, might 24 %, wealth 16 %, sway 18 %, blood 10 %, order 6 %), so the number in this view
is *the same* as the `standing` word on the HUD for the player (`state.standing` = own row, exact, must match to the
integer — test R1). Its constants are the balance's; if the owner retunes them here, the view follows. The view shows the
six components as a small bar set in the house detail (§6.3) with words, never as raw meters elsewhere.

### 4.5 Trends and sparklines

- **Series:** for the own house and sworn houses, from `realmStats` (truth); for others, from the viewer's `obs`
  (their own irregular dots; **gaps stay gaps**, drawn as a dotted line joining observed points, the last dot open when
  stale). Never interpolated from truth.
- **Window:** the last 12 samples or 6 game months, whichever is longer (the view's control: 3 / 6 / 12 moons).
- **Sparkline:** inline SVG, 84×22, no library, one path, last point a dot, `currentColor` tokens in both themes;
  `aria-label` "Gold: down 18 % over 6 moons (estimate)". Shown per row for the lens's headline figure (Strength:
  Power; Economy: Net; Land: Prosperity), and a **full-size small multiple** (5 sparklines: swords, gold, income, food,
  people) in the house detail.
- **Direction of a figure** over the window: `Δ% = (now − then) / max(then, floor)`, where `floor` keeps tiny bases from
  swinging (`gold` 1,000, `swords` 100, `income` 100). Words: `growing` Δ ≥ +4 %, `shrinking` Δ ≤ −4 %, else `steady`;
  arrows `▲ ▼ ▬`. Food uses absolute moons (±1 moon). Estimated Δ is shown with `~` and greyed unless at least 2
  observations lie in the window (`too few reports to say`).

### 4.6 "Rising or falling" (the rule)

For each listed house, over the window `W` (default 90 days; the viewer's data only):

```
P_then = Power at the sample nearest (today − W)        // observation or truth, per §4.5
Δ      = P_now − P_then                                  // Power is 0..100
rankΔ  = rank_then − rank_now                            // among the same listed houses, on the same data
score  = Δ + 2 × rankΔ
rising   if score ≥ +4  (two consecutive turns)
falling  if score ≤ −4  (two consecutive turns)
otherwise steady
```

Flags, each with a plain reason drawn from engine facts (never invented):

| Flag | Rule | Reason text (example) |
|---|---|---|
| **Reeling** | lost ≥ 2 holdings *or* a seat besieged/occupied in the window | "lost Harrenhal; its seat is besieged" |
| **Broke** | gold < 1 moon of net outgoings *or* `interest` unpaid *or* a loan called | "cannot pay its host beyond a moon" |
| **Hungry** | food < 2 moons *or* famine fact | "two moons of bread" |
| **Swollen** | swords up ≥ 25 % *and* levies raised | "has called its banners" |
| **Winning / losing** | in a war where `scoreFor(w, side)` moved ≥ ±8 in `W` | "the North holds the field" |

Hysteresis (two consecutive turns) stops a single battle from flipping a house's word back and forth. For a house seen
only through reports the word is prefixed `seems` ("seems to be rising") and needs ≥ 2 observations; else `—`.
The rule is one function, `direction(seriesNow, seriesThen)`, used by the table, the war panel and the minds' brief.

---

## 5. Knowledge filtering (how the leak is closed)

- The realm view is built **only** by `realmViewFor(state, viewerHouse, opts)` (`engine/realm/view.js`), which reads the
  full `state` for the *viewer's own* house and for `sworn`/`seen` sources, and reads *stored observations* for every
  other house. Nothing else in the output is a function of another house's truth. This is the *only* function the route
  calls.
- The server route does **not** run `playerView` first (that would strip what `realmViewFor` needs); the property is
  guaranteed by the function's design and by the non-interference test (R2): **changing any hidden truth (another house's
  treasury, levies, mines, debts, a war's score) with no news to the viewer must not change the output by a single byte.**
- **Wars:** listed only if the viewer knows of them (`war_declared`/`war_joined` facts pass `knows()`, or the viewer is a
  party or a sworn house of a party). For other houses' wars: sides (as known), the war's *name*, a **momentum word**
  built from facts the viewer knows ("the West has won two battles this season"); no numeric score. For own wars: the
  numeric `scoreFor` as a bar with words (`leading`, `even`, `losing`) as the Book does.
- **Facts list (§6.4):** only facts for which `knows(state, viewer, fact)` is true; ages by `newsOf`.
- **Mines, secrets, plots, `minds`, `commitments.sincerity`, `stress/paranoia`, canon beats:** never read.
- **Player-facing sameness:** the numbers shown for the player's own house equal the HUD's and the Book's (same call).

---

## 6. What the window shows

### 6.1 Entry point (closed by default)

- A small **"State of the Realm"** button in the top-right dock (crown-and-scales glyph), and the hotkey **`S`** (free
  today: `r c m e i p d f h ?` are taken in `app.js`). `Esc` or `S` again closes. It opens as a **window** in the existing
  window system (`ui/windows.js`, like Realm/Military), *not* a modal, so the map stays visible beside it and time stays
  frozen (planning phase only; hidden during playback).
- **Never auto-opens.** When something changes materially (a war ends, a great house's word turns `falling`), the button
  gets a small quiet pip; nothing else.
- Remembers only per-viewer conveniences in `localStorage` (lens, chips, window), wrapped in try/catch.

### 6.2 Wireframe (1920×1080, window ~900×760, right side of the screen)

```
+------------------------------------------------------------------------------------------------+
| STATE OF THE REALM        as of 14 Moon 298 AC          [House | Realm]   window [3|6|12 moons]  x |
+------------------------------------------------------------------------------------------------+
| Lens: [ Strength ] Economy  Land  Wars        Show: [Great houses] My realm  At war  Neighbours  All |
+------------------------------------------------------------------------------------------------+
| WHERE THE REALM IS GOING                                                                        |
|  ▲ Lannister  rising   (won two fields; the West is mustered)        ▼ Baratheon (Crown)  falling |
|  ▲ Stark      rising   (your house)                                  ▬ Tyrell    steady            |
+------------------------------------------------------------------------------------------------+
| #  House            Power  Swords   Levies  Men-at-arms  Ships  Holdings  People    Trend         |
| 1 (crest) Lannister  71 ~  ~52,000  ~30,000  ~ 6,000     ~40    ~  9    ~2.6m   /\_/‾  ▲ rising |
| 2 (crest) Tyrell     64 ≈  ~48,000  ~40,000  ~ 3,000     ~20    ~ 12    ~7.5m   ‾‾‾‾   ▬ steady |
| 3 (crest) STARK      58    31,400    16,000     1,200       4      14     2.0m   _/‾‾   ▲ rising |
|   (you)            ... exact figures, bold, no "~"                                              |
| 4 (crest) Baratheon  44 ~  ~30,000  seems ...      —         ~60   ≥ 6      ~1.8m   ‾\__   ▼ falling|
| 5 (crest) Arryn      41 ≈  ~24,000   ...                                                        |
|   · rank badge #n beside each figure; "~" estimate; faded "?" = word older than 2 turns          |
+------------------------------------------------------------------------------------------------+
| WARS (as your house knows them)                                                                 |
|  War of the Five Kings' Fray   Stark+Tully  vs  Lannister        You are LEADING  ▲ (+9 in 3 moons) |
|    strength ~31k+~18k  vs  ~52k       Riverlands: 2 holdings besieged                            |
|  Greyjoy raids on the Stony Shore      Greyjoy vs  Stark          you are HOLDING   ▬               |
+------------------------------------------------------------------------------------------------+
| WHAT THE REALM IS SAYING (facts your house has heard)                               where to focus |
|  · Two moons of bread left in the North; winter is close.          [Buy grain]   ← same engine rules |
|  · Lannister banners are called (raven, 4 days old).                                             |
|  · The Crown owes 6,000,000 dragons (public); Lannister holds half.                              |
+------------------------------------------------------------------------------------------------+
```

Click a row: the **house detail** (§6.3) slides over the lower half. Column headers sort. Hover on any cell: meaning line
and provenance (`a raven from Lord Vance, 6 days old`). At 1366×768 the window is full-height, the People column and
Trend collapse under the house name (two-line rows), and the lens tabs become a select.

### 6.3 House detail

- **Header:** crest (`sigils`), lord's portrait (`portrait.js`; **portraits and family trees stay**, [12](12-ui-ux.md)
  §15 — the detail links to the family tree), the house's **word** (rising/falling with reasons), rank among great
  houses.
- **Strength:** swords broken into *in the field* / *in garrison* / *at home uncalled* (own & sworn: known; others: only
  what is reported), ships and their kinds, levies raised vs. the muster the lands can bear (`levyCap`, own only).
- **Economy:** for the own house the same lines the steward reads (`project()`: rents, tribute, trade, mines shown as
  the steward reads them today, customs; outgoings: the host, the household, the court, interest, works, tribute owed;
  net, and `low..high`), loans (`state.economy.loans` as lender and as debtor), the tax level, food in moons for people
  and for the host. For a sworn house the same as `~` numbers. For others only what §4.2 gives, each row with its via
  and age.
- **Land:** holdings list (name, population, prosperity word, status), harvest word for the season.
- **Politics:** liege, sworn houses, relation to the viewer with the reasons the diplomacy panel already gives; wars of
  the house; the promises made/owed by the viewer (from `commitments`, the viewer's own).
- **Trends:** five small multiples (swords, gold, income, food, people), each `Δ%` in words.
- **Never:** goals, secret aims, plots, hidden debts, mines.

### 6.4 "What the realm is saying" and "where to focus"

`realmFacts(state, viewer)` returns a short, ranked list (≤ 12) of **typed engine facts** the viewer knows, each
`{ id, kind, about: houseId|holdingId, text (template), via, age, weight, verb? }`. They are computed from the same
figures (§4) and known facts, never from a model:

| kind | rule (viewer-known data only) | weight |
|---|---|---|
| `hungry` | own/sworn `food` < 2 moons, or a known famine | 9 |
| `broke` | own/sworn net < 0 and gold < 3 moons of outgoings | 9 |
| `debt_due` | a loan called or due within 60 days (own) | 8 |
| `besieged` | a known holding besieged/sacked/burning | 9 |
| `banners_called` | a house's call is known (`obligations.levies` public news) | 6 |
| `host_near` | a known foe host within 150 miles of a viewer holding (`hostsKnownTo`) | 8 |
| `leader_rising` | the top-Power house's word is `rising` and it is not a friend | 5 |
| `war_turning` | a war's momentum changed sign in `W` (known) | 6 |
| `unrest` | own holdings with unrest ≥ 40 | 6 |
| `season` | winter/harvest ahead for the viewer's regions | 3 |
| `great_debt` | the Crown's debt (public canon, `state.economy.loans`, only the totals the viewer knows) | 3 |

**Where to focus**: the top 3 facts about the *viewer's* house, each with the registry's lawful `verb` that answers it
(`buy_grain`, `set_tax`, `call_banners`, `repay`, `hold_feast`…). The button only pre-fills the order composer
([12](12-ui-ux.md) §4) with `optionsFor()` results — the same legality the player and the minds have; it changes no
state by itself.

---

## 7. API

`server/index.js` style (`route(method, pattern, handler)`, JSON, `game.loadState` — see `routes` there):

```js
route('GET', '/api/games/:id/realm', (req, p) => {
  const q = new URL(req.url, 'http://x').searchParams;
  return game.realmView(p.id, { lens: q.get('lens'), scope: q.get('scope'), realm: q.get('realm') === '1', window: q.get('window'), house: q.get('house') });
});
```

`game.realmView` = `realmViewFor(loadState(id), state.meta.player, opts)`; **no viewer parameter** (the client cannot ask
for another house's eyes). Response:

```jsonc
{
  "asOf": {"turn": 41, "date": "14 Moon 298 AC", "day": 108714},
  "window": {"days": 90, "samples": 4},
  "lens": "strength", "scope": "great", "realm": false,
  "you": "stark",
  "rows": [ { "house": "lannister", "lord": "tywin", "rank": 1, "rankTied": false,
              "cells": { "power": {"v": 71, "mark": "~", "via": "reported", "age": 1, "band": [66, 76], "rank": 1},
                         "swords": { … }, "levies": { … }, "gold": {"word": "sound", "via": "rumour", "age": 6} },
              "trend": { "dir": "rising", "arrow": "▲", "seems": true, "why": ["won two battles"], "series": [[day, v], …] },
              "flags": ["swollen"] } ],
  "wars": [ { "id": "war_2", "name": "…", "sides": {"A": [ … ], "D": [ … ]}, "you": "A", "momentum": "leading", "delta": 9,
              "strength": {"A": {"v": 49000, "mark": "~"}, "D": {"v": 52000, "mark": "~"}}, "note": "…" } ],
  "facts": [ { "id": "rf_hungry_stark", "kind": "hungry", "text": "…", "via": "self", "age": 0, "weight": 9, "verb": "buy_grain" } ],
  "focus": [ …top 3 of facts about you… ],
  "detail": null
}
```

`GET /api/games/:id/realm?house=lannister` adds `"detail"` (§6.3). Errors: `404` for an unknown save (existing);
`house` unknown to the viewer → `detail: {unknown: true}` (the API never confirms hidden houses). The route is read-only,
has no side effects, does not advance or save anything, and is cheap (< 10 ms on the full scenario; §11 R2 asserts a
budget of 50 ms).

---

## 8. One source of truth: how minds and the council use the same numbers

`engine/realm/figures.js` is the only place a house's strength is computed. Callers:

| Caller | Uses | Filtered by |
|---|---|---|
| **This view** | `realmViewFor(state, player)` | the player's knowledge (§5) |
| **`worldView(state, actorId)`** (`engine/minds/options.js`) | adds `w.realm = { rank, power, word, peers: [{house, power, dir, swords, via, age}], top3, threats }` from `realmViewFor(state, actor.house, {scope:'great'})` | **the mind's own house's knowledge** (a mind sees the realm as its house does; not the player's, not the truth) |
| **`scoreActors` / salience** (`minds/salience.js`) | may use `flags` (`reeling`, `broke`, `hungry`) already in the same list as *triggers* (add(…) weights), instead of re-deriving them | the mind's house |
| **Behaviour trees** (`minds/houseways.js`) | conditions read `w.realm.rank`, `w.realm.threats`, `w.gold`, `w.realm.peers[0].dir` ("the strongest house is rising and is not my friend": `send_gift`, `declare_war` weights) | the mind's house |
| **The mind's dossier** (`server/ai/calls/mind.js` context; primer stays static) | one block, `realmBrief(state, house)`, ≤ 12 lines, ≤ 300 tokens: *"Your house: 4th of the great houses, falling: gold ~3 moons, food 2 moons. The strongest, Lannister (~52k men, rising, word 4 days old), is not your friend. War: …"* | the mind's house (the same estimates, the same `~`) |
| **The council** (`server/ai/calls/council.js`) | the same `realmBrief(state, playerHouse)` prepended to the counsellors' dossier, plus `focus` facts so advice cites the ledger's own numbers, and a check in `validate` (`ai/validate`) that every number the counsellor quotes for a house appears in the brief (existing "names must appear" style check) | the player's knowledge |
| **The narrator / consolidator** | no numbers; they receive facts as today | — |
| **Order interpreter** | unchanged | — |

Consequences: (a) an AI lord and the player agree on what "strongest" means; (b) if a mind is told "you are broke", the
player's view of that house's `broke` flag says the same (if the player can know it); (c) a model cannot invent a
strength: `realmBrief` is produced by the engine, and any number in a model's reply that is not in the brief is a
validation problem (the existing repair/fallback path).

**Mind privacy stays:** the view never exposes `state.minds`, goals, hidden plans. "What the realm is saying" is the
*facts* the viewer's house has heard, the same set `server/minds.js` `knownTo` gives a mind for its own house.

---

## 9. Performance and determinism

- `sampleRealm` runs once per turn close: ≈ 30 `project()` calls + sums. Budget ≤ 10 ms; asserted in `soak.test.js`.
- `realmViewFor` ≤ 50 ms for the full scenario; results are memoised on `(state.meta.turn, viewer, opts)` inside the
  request only (no cache across turns, no cache in the save).
- **No RNG draw** anywhere in `engine/realm/`: noise from `hash32(seed, viewer, subject, field, obsTurn)`. A replay
  (`tests/replay.test.js`) and every `soak` remain byte-identical with the feature on or off, except for the added
  `realmStats` field.
- `WC_PROVIDER=mock` for every test; no model call anywhere in this document's scope.

---

## 10. Owner-facing behaviours (acceptance in words)

1. Press `S`: the window opens on **Strength**, **Great houses**, sorted by Power; press `S` or `Esc`: it closes and the
   game is as it was.
2. Your row is exact and matches the HUD word; every other house shows `~`, `≈` or `—`, never an unqualified number.
3. After three turns the sparklines have dots; a house the player has no news of shows fewer dots with gaps, not a smooth
   line.
4. A house's "rising/falling" changes only after two consecutive turns and always carries a reason from a known fact.
5. Raising banners, losing a castle, a harvest failing all show up in the next turn's figures and in the facts list.
6. Nothing in the window names a beat, a schedule, a secret or a model's plan.

---

## 11. Work packages

Each WP follows the roadmap's definition of done ([16](16-roadmap.md)): tests, `npm run check` + `npm test` green on
ubuntu and windows, `docs/CHANGELOG.md` entry, this document marked *implemented*, one branch `wp/r<n>-<slug>`.
All tests are `node:test`, deterministic (fixed seed), `WC_PROVIDER=mock`, no network.

| WP | Title | Files | Acceptance tests | Screenshots | Size |
|---|---|---|---|---|---|
| **R1** | Figures and the truth series | new `public/js/engine/realm/figures.js` (`figuresOf(state, house)` = swords/levies/menAtArms/guard/gold/debt/income/expenses/food/ships/holdings/people/prosperity/unrest/power; reuses `standing`, `project`), new `engine/realm/stats.js` (`sampleRealm`, `thin`, `seriesOf`), `server/game.js` (`closeTurn` + new game + record `realm`), `engine/state/migrate.js` (old saves), `engine/state/validate.js` (invariants: sample arrays match `fields`, no NaN, monotone days), `engine/rng.js` (`hash32`) | `tests/realm-stats.test.js`: (1) after `createInitialState` a sample exists; (2) own `power` equals `state.standing.score` exactly after a turn; (3) `swords` equals `standing().swords`; (4) 30 turns of the mock jump: one sample per ≥ 7 days, ≤ 48 samples, thinning keeps the newest 16; (5) sample is deterministic: two runs of the same seed give byte-identical `realmStats`; (6) undo restores the series (snapshot); (7) old-save migration adds an empty series without changing any other field; (8) engine RNG stream unchanged with the feature on (draw counter equal) | — | M |
| **R2** | Knowledge-filtered estimates and the view function | new `engine/realm/estimate.js` (`observe`, `estimateOf`, tiers §4.2), new `engine/realm/view.js` (`realmViewFor`: rows, cells, ranks with ties, direction, flags, wars, facts, focus, detail), `engine/knowledge.js` (`updateKnowledge` stores `realm` observations; `seedKnowledge` seeds the public prior), `shared/economy.js` untouched | `tests/realm-view.test.js`: (1) **non-interference**: build a state, snapshot `realmViewFor(state, 'stark')`; set another house's treasury/levies/debts/mines/war score to absurd values with no news reaching Stark; the JSON is identical; (2) own row exact, sworn `~` within ±5 %, others `~`/`≈`/`—`, never a bare number for others; (3) a host *seen* raises `swords` `≥` with the report's age; (4) a `spy` fact teaching a treasury shows a `~` number dated; without it `gold` is a word; (5) rank ties when bands overlap; (6) `direction()` table: growing/steady/shrinking at ±4 %, floor keeps tiny bases quiet; hysteresis needs two turns; `seems` when only reported; (7) noise is stable: two calls, and a save-load-call, return identical bytes; (8) the Lannister mine depletion cannot change any output; (9) performance ≤ 50 ms; (10) no key named `minds|goals|secret|schedule|beat` appears anywhere in the JSON | — | L |
| **R3** | API route | `server/index.js` (route), `server/game.js` (`realmView`), `tests/http.test.js` additions | `tests/realm-http.test.js`: 200 with the schema above on a new game; `house=` unknown → `detail.unknown`; no viewer parameter honoured (`?viewer=lannister` ignored); read-only (state file byte-identical before/after); works on a save with no `realmStats` (empty state, "begins now") | — | S |
| **R4** | The window (UI) | new `public/js/ui/realm.js` (window contents, table, sparkline SVG helper, war panel, facts list, house detail), `public/js/app.js` (button, `S` hotkey, pip), `ui/windows.js` (register), `public/css` (tokens; light/dark), `ui/icons.js` (glyph) | `tests/realm-ui.test.js` (pure): the row-formatting helper renders `~`, `≈`, `≥`, `—` and ages by the mark; sparkline path for gaps; `aria-label` text; hotkey map has `s` and does not collide; escapes HTML in names (`esc`). Playwright (owner + CI optional): closed by default on load; opens on `S`; closes on `Esc`; does not open during playback | 1920×1080 and 1366×768: closed; open on Strength; Economy; Wars; a house's detail; a stale/unknown row; light and dark | L |
| **R5** | Minds and council read the same numbers | `engine/realm/brief.js` (`realmBrief`), `engine/minds/options.js` (`worldView.realm`), `engine/minds/houseways.js` (conditions), `engine/minds/salience.js` (use flags), `server/ai/calls/mind.js` and `council.js` (context + validate), `docs/gdd/04-ai-system.md` §5 (one-line pointer) | `tests/realm-minds.test.js`: (1) the brief for a house never contains a figure the house cannot know (non-interference run for the mind's house); (2) the brief's figures for the *player's* house equal the view's, byte for byte, when the same viewer is used; (3) a mind's tree chooses `send_gift` toward a rising strongest non-friend under a fixed seed (a scenario); (4) token budget of the block ≤ 300 (`countTokens` helper); (5) council validation flags a quoted number absent from the brief (mock reply) and repairs it; (6) with `WC_PROVIDER=mock` the full 12-moon soak is deterministic and unchanged in the RNG draw count | — | M |
| **R6** | Wars, momentum and "where to focus" | `engine/realm/view.js` (wars block, `war` series `state.realmStats.wars` sampled in `sampleRealm`), `engine/politics/war.js` (no change to the rules; export `warMomentum`), `realmFacts` table §6.4, focus→`optionsFor` verbs | `tests/realm-wars.test.js`: momentum word follows the score delta over `W`; other houses' wars show no numeric score; a war unknown to the viewer is absent; ended wars leave the list next turn; every `focus` verb is legal per `optionsFor` for the player; facts ordering by weight is stable; each fact kind fires on a hand-built state and not otherwise | war panel, facts list, focus buttons | M |
| **R7** | Polish, docs, tooling | `scripts/realm-dump.js` (prints the truth and the player's view side by side for a save — the owner's check that estimates hold; dev only), `docs/gdd/12-ui-ux.md` §9 pointer, `docs/gdd/16-roadmap.md` row, `docs/gdd/DECISIONS.md` entry, `docs/CHANGELOG.md`, `docs/HANDOFF.md` note | `tests/realm-soak.test.js`: 24 moons on the mock, 3 seeds: estimate error against truth stays within each tier's bound (sworn ±5 %, seen ±10 %, reported ±25 %) and never has a number where the tier says none; no leaks (§11 R2 test rerun each turn on a random hidden mutation) | final set at both resolutions attached to the PR | S |

**Order:** R1 → R2 → R3 → (R4 ∥ R5) → R6 → R7. R1–R3 change no visible behaviour and are safe to merge at once; R4 is the
first player-visible change; R5 changes what minds see, so its scenario test must run against the existing
`tests/minds.test.js`, `tests/goals.test.js` and the Q9 canon soak before merge.

**Owner verifies** (only what CI cannot): (1) the numbers *feel* right against play (the `realm-dump` script, one command);
(2) with a live model, that a counsellor quoting a house's strength matches the window; (3) the window's clarity at a
glance on his monitor.

---

## 12. Open questions and departures to record

- **Viewer for allies' coin:** the rule shows an ally's gold only as a band. If the owner wants allies to be open books,
  change one row of §4.2 (record in `DECISIONS.md`).
- **`state.realmStats` in saves vs. only in `turns/`:** chosen in-save for undo consistency and fast reads; the turn
  files hold the unthinned copy. If save size grows, drop the in-save series to the last 16 samples.
- **Minds running on their own knowledge (R5):** running `updateKnowledge` for every house that has a mind costs
  ≈ 30 × the player's pass; if it exceeds the 10 ms budget, observe only for houses in `salientActors` this week and use
  the public prior for the rest (record the departure).
- **Book overlap:** the Book's Realm/Coin tabs keep the *own-house* detail. This view links to them rather than
  duplicating; both call `figuresOf` so they cannot disagree.
