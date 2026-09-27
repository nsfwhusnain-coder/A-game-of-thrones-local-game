# 06 · The economy: one model, anchored in the books

> Fixes root cause R6 and bug B-17 ([02-audit.md](02-audit.md)). All constants below go into **`public/data/balance.js`**
> (new, single source for every tunable number); `economy.js` reads them. Nothing in the economy is hard-coded in
> another file.

---

## 1. The problem, measured

`createInitialState` + 12 × `settle(30)` on 2026-09-27:

| House | Treasury start | Income / moon | Expenses / moon | Treasury ÷ income |
|---|---|---|---|---|
| Stark | 60,000 | 5,392 | 2,472 | 11 moons |
| Lannister | 2,800,000 | 37,111 | 5,432 | **75 moons** |
| Tyrell | 700,000 | 13,636 | 3,426 | 51 moons |
| Arryn | 300,000 | 2,189 | 2,291 | 137 moons |
| Tully | 200,000 | 2,666 | 2,223 | 75 moons |
| Crown | 15,000 (debt 6,000,000) | 32,560 | 40,040 | — |

And a levy in the field costs ≈ 0.04 dragons per man per moon, so a war costs a great house almost nothing. Two
consequences the owner saw: the numbers look arbitrary ("60,000 vs 2 million"), and gold is meaningless.

## 2. Canon anchors

Everything is scaled from these (sources: *A Game of Thrones*, *A Clash of Kings*, *A Storm of Swords*, *The Hedge
Knight*; summarised on A Wiki of Ice and Fire, "Currency").

| Anchor | Value | Use |
|---|---|---|
| A smallfolk man lives well for a year on | **3 gold dragons** (209 AC) | output per head |
| A plain suit of steel armour | ~4 dragons (800 stags) | equipment |
| A palfrey (peace) / a horse in the war-torn Riverlands | ~3.5 / ~1 dragon | horses, war prices |
| A formidable ransom for a knight / a younger son | 300 / 100 dragons | ransoms |
| Edmure's bounty for the Kingslayer | 1,000 dragons | bounties |
| Tourney of the Hand prizes | 40,000 + 20,000 + 20,000 + 10,000 | tourneys |
| Salladhor Saan's sellsails, 24 ships | **30,000 dragons a month** | sellswords at sea |
| The Crown's debt | **6,000,000+**, of which **3,000,000 to House Lannister**, the rest to Mace Tyrell, the Iron Bank, Tyroshi cartels and the Faith (the Faith's share is 900,674 by 300 AC) | the Crown, Lannister receivables |
| King's Landing in war | a melon 6 coppers, a bushel of corn a silver stag, a side of beef a gold dragon | war price multipliers |
| Coins | 1 dragon = 30 silver moons = 210 silver stags = 1,470 copper stars = 11,760 pennies (semi-canon) | display of small sums |
| The Lannister gold mines | the mines of Casterly Rock **ran dry about three years before AFFC** (a secret Tywin kept) | a declining secret yield |

## 3. Units and display

- The ledger's unit is the **gold dragon**. Sums under 1 dragon show as stags (`14 stags`); under 1 stag as coppers.
- Food is counted in **man-moons** (what one grown man eats in a moon). Stores are shown to the player as "moons of
  food for the household / for the host / for the realm", never as a bare number.
- **Every treasury is shown with its meaning** ([12-ui-ux.md](12-ui-ux.md) §5): *"63,900 dragons — about 9 moons of
  this war"*, *"an ocean of gold — the West could pay for this war for years"*.

## 4. Population

The starting populations below replace the current per-holding defaults (which are ~7× too small against the books'
musters). A region's population sets its output and its levies. Holdings carry the population of their **domain** (the
lands around them), so the region total is the sum of its holdings.

| Region | Population | Full muster (≈ 2 % of people) | Quick muster in a moon (≈ 0.9 %) | Notes |
|---|---|---|---|---|
| The North | 2,000,000 | 45,000 | 18,000–20,000 | Robb marched 12,000 from Winterfell, ~18,000 at Moat Cailin + 1,500 from White Harbor |
| The Riverlands | 3,200,000 | 45,000 | 20,000 | Edmure fields ~11,000 at the Fords after heavy losses |
| The Vale | 2,400,000 | 45,000 | 20,000 | |
| The Westerlands | 2,600,000 | 50,000 | 35,000 (the West is always half-mustered) | Tywin 20,000 + Jaime 15,000 in 298 |
| The Reach | 7,500,000 | 100,000 | 60,000–80,000 | Renly's host 80,000+ (with the Stormlands) |
| The Stormlands | 2,200,000 | 40,000 | 20,000 | |
| Dorne | 1,500,000 | 30,000 | 12,000 | |
| The Crownlands | 1,800,000 (King's Landing 500,000) | 20,000 + 2,000 gold cloaks | 8,000 | |
| The Iron Islands | 400,000 | 20,000 reavers; 100 warships of the Iron Fleet + ~200 longships of the lords | | |
| The Wall and the Gift | 12,000 (+ ~1,000 sworn brothers) | — | — | |
| Beyond the Wall (free folk) | ~200,000 | ~90,000 fighting | | Mance's host 2,000 → 100,000 over time (beats) |

Within a region the population splits among holdings by type: great castle domain 8 %, castle 3–5 %, town 2–6 %,
city per its own figure (Oldtown 500,000, Lannisport 160,000, Gulltown 90,000, White Harbor 60,000 are the cities'
**own** people plus their hinterland share). `scripts/balance-population.js` (new) distributes and writes
`data/economy.js POPULATION`, keeping explicit overrides.

## 5. Output and revenue

### 5.1 Monthly formulas (`engine/economy/ledger.js`)

```
gross(h)     = h.population × OUTPUT_PER_HEAD (0.25 d/moon)
             × prosperityFactor(h)             // 0.55 + 0.009 × prosperity  (prosperity 50 → 1.0)
             × seasonFactor(region, season)    // summer 1.0 · autumn 0.9 (harvests), winter 0.55 (North 0.3), spring 0.8
             × warFactor(h)                    // 1 − 0.5×devastation/100; besieged 0.2; occupied 0.6 to the occupier
             × laborFactor(h)                  // 1 − 0.6 × (levies raised from this domain ÷ domain's full muster)
rents(h)     = gross(h) × RENT_SHARE[taxLevel] // low 0.06 · customary 0.08 · heavy 0.105 · crushing 0.13
trade(h)     = TRADE_BASE[h] × tradeFactor      // ports, markets, tolls; see §8
mines(h)     = MINES[h] × mineDepletion(h)     // gold/silver/iron; secret depletion for Lannister (§5.3)
revenue(h)   = rents + trade + mines + customs(house rules) + tolls(bridges, chokepoints)
tribute(v→l) = revenue(v's holdings) × TRIBUTE_SHARE[liegeRank] when obligation 'paying' (0.2 to a paramount; 0.1 from a paramount to the Crown)
income(H)    = Σ revenue(own holdings) + Σ tribute received − tribute owed
```

### 5.2 Target incomes (the balance sim must land within ±15 %)

| House | Coin at start | Income / moon (peace, customary tax) | Household & court / moon | Owed / owing | Notes |
|---|---|---|---|---|---|
| **The Crown** (Baratheon of King's Landing) | 20,000 | 95,000 | 45,000 (Robert's court) | **owes 6,000,000**: Lannister 3,000,000 · Tyrell 1,000,000 · Iron Bank 1,000,000 · the Faith 700,000 · Tyroshi cartels 300,000 | interest ≈ 40,000/moon; runs a deficit (canon) |
| **Lannister** | **500,000** | 34,000 (mines 10,000 and secretly falling) | 6,000 | **owed 3,000,000 by the Crown** | "the richest house" = coin + the Crown's debt; the debt is leverage, not spendable coin |
| **Tyrell** | 800,000 | 48,000 | 7,000 | owed 1,000,000 by the Crown | richest in land and food |
| **Hightower** (vassal) | 400,000 | 14,000 | 2,500 | | Oldtown's trade, the Bank of Oldtown |
| **Redwyne** (vassal) | 220,000 | 9,000 | 1,500 | | Arbor gold (wine), 200 ships |
| **Arryn** | 350,000 | 15,000 | 3,000 | | |
| **Tully** | 150,000 | 17,000 | 3,000 | | many vassals, poor coin |
| **Stark** | **120,000** | 12,000 | 2,000 | | "little coin; the North trades timber and furs" |
| **Manderly** (vassal) | 200,000 | 9,000 | 1,500 | | the North's richest vassal (White Harbor) |
| **Martell** | 260,000 | 12,000 | 2,500 | | |
| **Baratheon of Storm's End** (Renly) | 200,000 | 13,000 | 2,500 | | |
| **Baratheon of Dragonstone** (Stannis) | 60,000 | 2,500 | 800 | | poor seat; the royal fleet's upkeep is the Crown's |
| **Greyjoy** | 40,000 | 2,600 | 700 | | poor; the iron price is their income in war |
| **Frey** | 160,000 | 4,500 (half from the crossing) | 700 | | Walder hoards |
| **Bolton** | 45,000 | 3,000 | 400 | | |
| **Night's Watch** | 3,000 | 700 (alms and the Gift) | 600 | | always one bad winter from ruin |
| **A minor lord** (e.g. Blackwood, Mormont) | 3,000–15,000 | 600–2,000 | 150–400 | | |
| **A landed knight** | 100–800 | 20–80 | 10–30 | | |

Why Stark goes *up* to 120,000 and Lannister *down* to 500,000: the current values make Lannister 47× richer in coin;
the books make the Lannisters richer mainly through the Crown's debt and a fabled hoard that is quietly running dry.
Keeping 3,000,000 as a **receivable** preserves "the Lannisters own the Crown" without making coin meaningless.

### 5.3 The Lannister mines (a secret with teeth)

`MINES.lannister = 10,000/moon`, depleting 2 % per moon from 298 (secret `lannister_mines_dry`, known to Tywin and his
steward). If revealed (a scheme, a captured steward, Tyrion as master of coin), the Iron Bank raises Lannister interest
and every lender's opinion of Lannister falls. Other Westerlands mines (Castamere, Nunn's Deep, Pendric Hills) are
normal holdings' `mines` and can be seized by raiders (the Greatjon did, in the books).

## 6. Expenses and prices

All per moon unless noted; multiplied by the **price index** (§6.3).

### 6.1 Standing costs

| Item | Cost | Notes |
|---|---|---|
| Household & court | per house table §5.2 (≈ 10–20 % of income; the Crown ≈ 45 %) | raised by feasts, guests, a royal visit |
| Man-at-arms / household guard (standing, paid) | 0.5 d each | wages ~3½ stags a week |
| Household knight (with squire and horses) | 2 d each | |
| Garrison soldier | 0.5 d each | |
| Warship: war galley · longship · cog · carrack | 80 · 25 · 40 · 60 d | crews paid; laid up = 30 % |
| The Night's Watch per sworn brother | 0.3 d (paid by the Watch) | |
| Interest | per loan (§7) | |

### 6.2 Campaign costs

| Item | Cost | Borne by |
|---|---|---|
| Levy in the field — **food and a little coin** | **0.25 d per man** (+ forage offsets, 07 §6) | the contingent's own lord for its first 40 days; then the liege whose host it serves |
| Men-at-arms / knights in the field | as standing + 0.15 d food | owner |
| Sellsword foot / horse | **2 d / 3.5 d per man**, one moon paid in advance | hirer |
| The Golden Company (10,000) | 30,000 d/moon + 60,000 on signing | hirer |
| Sellsails | 1,250 d per ship (Salladhor's rate) | hirer |
| Siege works (rams, towers, trebuchets) | 2,000–15,000 once | besieger |
| Horses (war) | palfrey 3 · courser 10 · destrier 30–60 d | |
| Armour & arms for a man | levy kit 1 · man-at-arms 5 · knight 25–60 d | recruitment |
| Lost labour | not coin: `laborFactor` cuts `gross` of the domain the levies came from, and food output (§10) | the domain |

**Check (Stark, full quick muster):** 18,000 levies × 0.25 = 4,500 + 1,200 men-at-arms × 0.65 = 780 + 300 knights × 2.15
= 645 → **≈ 5,900 d/moon** against 12,000 income, *and* the North's gross falls ~25 % while the men are away. Savings
of 120,000 → the war is affordable for ~2 years on paper, ~1 year once lost harvests and the winter are counted. That
is the tension the books describe.

### 6.3 Price index

`state.economy.prices = { food, horses, arms, labour }` per region, each a multiplier (1.0 at peace in summer):

- season: autumn food ×1.3, winter food ×2.5 (North ×3.5)
- war in the region: food ×1.5, horses ×1.4 (a horse is "a dragon" in the war-torn Riverlands because they are
  requisitioned and cheap for the taker, dear for the buyer — model as ×0.3 to the seizer, ×2 to the buyer)
- siege/blockade of a city: food ×4 (King's Landing, 299 AC: ×5)
- famine (stores < 1 moon for the region): food ×3
- decays 10 %/moon toward 1.0 when causes end

### 6.4 One-off prices (for verbs, matters and the model's context)

| Thing | Range (d) |
|---|---|
| Feast: a knight's · a lord's · a great lord's · royal | 50 · 500–2,000 · 3,000–8,000 · 10,000–30,000 |
| Tourney: small · lord's · great · royal | 2,000 · 10,000 · 30,000–60,000 · 90,000–150,000 |
| Wedding of a lord's child · great house · royal | 1,000 · 10,000–30,000 · 100,000+ |
| Dowry: minor house · major · great house | 500–5,000 · 10,000–50,000 · 100,000–300,000 |
| Ransom: hedge knight · landed knight · younger son · minor lord · major lord · great lord or heir | 20–50 · 100–300 · 100–500 · 1,000–5,000 · 5,000–25,000 · 50,000–250,000 |
| Bribe: a gaoler · a captain of the watch · a council clerk · a lord's steward · a lord's allegiance | 5 · 100–500 · 200–2,000 · 1,000–5,000 · 5,000–50,000 |
| Bounty on an outlaw captain / a great enemy | 100 / 1,000–10,000 |
| New war galley · longship · cog | 3,000 (6 moons) · 600 (2 moons) · 1,200 (3 moons) |
| Raise walls one level (fort +1) · a new tower · a new castle | 20,000–80,000 · 5,000 · 60,000–200,000 |
| A maester (from the Citadel, a year) | 60 |
| A rookery | 400 |

## 7. Credit: lenders, loans and default

`engine/economy/lenders.js`. Lenders are actors with ledgers and memories.

| Lender | Lends to | Rate / year | Behaviour |
|---|---|---|---|
| **The Iron Bank of Braavos** | anyone with land | 8 % (Crown in 298) → up to 25 % by risk | "The Iron Bank will have its due." On default it (1) raises rates on all your loans, (2) demands repayment, (3) **funds your rivals** (a matter/intent: loans to your enemy at low rates, sellswords paid), (4) refuses new loans to your whole realm (canon 300 AC). |
| **The Faith of the Seven** | the Crown (and pious lords) | 0–4 % | Patient; debt becomes political leverage (the Faith Militant beats of 300 AC are out of scope but the lever exists). |
| **House Lannister** | the Crown (and whoever Tywin chooses) | 0 % (political) | Tywin can **call** the debt (a Mind verb) — ruin for the Crown, or a lever to become Hand. |
| **Tyroshi / Pentoshi cartels** | anyone | 15–30 % | Impatient; sell debts to others. |
| **The Bank of Oldtown** (Hightower) | Reach and Crownlands lords | 6–12 % | |

- **Creditworthiness** = f(income, coin, receivables, standing, existing debt, past defaults, war status). Shown in the
  Ledger as *"The Iron Bank would lend you ~250,000 at 11 %"*.
- **Default** = a payment missed for 2 moons. Facts: `loan_defaulted`; knowledge spreads publicly.

## 8. Trade

Kept simple and legible; no full goods simulation.

- **Trade income** per holding: `TRADE_BASE[h]` (ports, markets, tolls, the Twins' crossing) × `tradeFactor`.
- `tradeFactor` = 1 ± 0.15 per active trade pact with a partner in reach · −0.3 if the holding's region is at war ·
  −0.5 if blockaded (a hostile fleet within 10 units of a port) · −1 (zero) under embargo by the partner · +0.1 in a
  tourney/feast month in that city.
- **Routes on the map** ([11-map-visuals.md](11-map-visuals.md) §7): the top 12 trade links (Oldtown–King's Landing,
  Lannisport–Oldtown, White Harbor–Braavos, Gulltown–Braavos, King's Landing–Pentos, …) are drawn as faint sea/road
  lanes in the Wealth map mode; a blockaded or embargoed link is drawn broken.
- **Tolls:** the Twins (Frey) charge each crossing host 1 d per 20 men (already in `chokepoints.js`), each merchant
  caravan 2 %; the Bloody Gate, the Golden Tooth and Moat Cailin charge nothing but can be **shut**.

## 9. Economy verbs

> *In the registry since WP B4* (`engine/actions/economy.js`): `set_tax`, `set_dues`, `fund_works`, `cancel_works`,
> `hire_men` (men-at-arms or sellswords), `hire_officer`, `send_gift`. Grain, loans, ransoms and embargoes come with C1.

| Verb | Params | Legal when | Cost / effect |
|---|---|---|---|
| `set_tax` | level | head of house | rents share; unrest ±; vassal opinion ± (existing `TAX_LEVELS`) |
| `fund_works` | template, holding | own holding, coin ≥ first instalment | monthly instalments; effect on completion (§11) |
| `buy_grain` | amount, from | not under embargo/siege | price index × 0.12 d per man-moon; arrives by caravan/ship (a party) |
| `borrow` | lender, amount, term | lender willing | coin now; interest monthly |
| `repay` | lender, amount | coin ≥ amount | |
| `call_debt` | debtor | lender (Tywin, the Iron Bank) | debtor must repay in N moons or default |
| `gift` | person/house, amount or item | coin | opinion by the receiver's nature (greedy ×2) |
| `bribe` | person, amount, aim | coin; secret | success by the target's nature (`swayedBy: gold`), honesty, and amount vs table §6.4 |
| `pay_ransom` / `demand_ransom` | captive | captive held | per table |
| `hire_sellswords` | company, months | a company in reach (Free Cities, the Disputed Lands) | per table; the company becomes a host that obeys **while paid** (07 §10) |
| `embargo` / `lift_embargo` | house | at peace or war | trade factor both sides |
| `seize_goods` | holding/caravan | host present | plunder (§9.1) |

### 9.1 Plunder and the iron price

Raiding a holding's lands yields loot = 1–3 moons of its **rents** (by host size vs defenders), sets devastation
+15–40, and moves the loot to the raider's coin. Sacking a town/castle yields 3–6 moons of its revenue plus a share of its
lord's coin if the seat falls. The ironborn's income in war is almost entirely this.

## 10. Food

- **Stores** per holding (man-moons) and per party (rations). A house's "food" figure is the sum over its holdings shown
  as moons for its people.
- **Harvest:** in autumn each holding adds `gross food` = population × FOOD_PER_HEAD × season × laborFactor ×
  (1 − devastation). Summer adds a smaller surplus. Winter adds nothing in the North and little elsewhere.
- **Consumption:** population eats 1 man-moon per 3 people per moon (women, children and the old eat less on average) —
  i.e. stores are consumed at `population / 3` man-moons per moon, less what the land yields that moon.
- **Hosts** eat 1 man-moon per man per moon (horses: 1 per 2 horses) from their rations; resupply from friendly
  holdings in reach or by foraging (07 §6).
- **Famine** when stores < 0.5 moons: unrest +8/moon, population −1 %/moon, levies desert, the price index ×3.
- **Winter** (season `winter`): the North's stores must last the season; the Citadel's white raven starts it; its length
  is unknown to the player (engine: 2–6 years; canon winter arrives in 300 AC). A lord who fills granaries in summer
  (works: granaries) survives.

## 11. Works (buildings)

`PROJECT_TEMPLATES` in `economy.js` is kept and extended into `data/works.js`. Each: cost, months, prerequisites,
effect, visible map change.

| Work | Cost | Months | Effect | On the map |
|---|---|---|---|---|
| Granaries | 4,000 | 3 | stores cap ×1.6; famine resistance | granary huts by the keep |
| Walls (fort +1, max 6) | 20,000–80,000 by size | 6–18 | siege estimate, storm odds | taller walls |
| Rookery | 400 | 1 | enables ravens from this holding (news speed) | a tower with birds |
| Harbour / quays | 8,000 | 6 | port; trade +20 % | quays and ships |
| Shipyard + war galleys | 3,000 per galley | 6 | ships | hulls on slipways |
| Market charter | 2,500 | 2 | trade +15 %, prosperity +3 | market square |
| Roads (a region's kingsroad stretch) | 6,000 | 6 | march speed +10 % on that stretch | paved road ribbon |
| Barracks & armoury | 5,000 | 4 | men-at-arms cap, recruit cost −20 % | barracks |
| Stud farm | 3,000 | 6 | horse for hosts from this domain +10 % | paddocks |
| Almshouse / sept | 1,500 | 2 | unrest −5, the Faith's opinion + | a sept |
| Inn on the road | 800 | 2 | travellers' speed, rumours heard (knowledge) | an inn |
| Weirwood grove tended (North) | 200 | 1 | the old gods' followers +; flavour | — |

## 12. Balance simulation (the gate Q10)

`scripts/balance-sim.js` (new): for every house, starting state, 24 moons at peace (no model; fallback minds only) and 24
moons with a scripted war (Stark vs Lannister with canon musters), printing income, expenses, coin, food and debt. CI
fails if any great house's peace income is outside ±15 % of §5.2, if the Crown does not run a deficit, if any house's
coin goes NaN/negative, or if Stark's full-muster war chest is outside 8–20 moons.

## 13. What the model is told about money

Minds and audiences get **meaning, not ledgers**: *"Your coffers: ~120,000 dragons — enough for about a year of war.
The Crown owes you nothing. Grain: the granaries are full."* Officers (the steward, the master of coin) get the ledger
lines. The narrator never writes sums except those in the facts (ransoms, prizes, bribes that happened).
