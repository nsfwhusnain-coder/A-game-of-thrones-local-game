# 08 · People and politics

> Characters, their natures and lives; lords, vassals and lieges; promises, marriages, captives, secrets; audiences and
> councils; every diplomacy, court and intrigue verb. Fixes B-14, B-15, B-21, B-22, B-23, B-24.

---

## 1. Principles

1. **People are the actors.** Houses are families and holdings; decisions are made by named people with natures.
2. **Natures are data, not inference.** A character's nature is authored explicitly (from the books) and never derived
   by regex from prose (fixes B-21).
3. **Words bind.** What a character agrees to becomes a **commitment** the engine tracks; keeping or breaking it is a
   decision made by the character's nature and interests, with consequences everyone remembers (fixes B-14).
4. **Knowledge is personal.** A character in an audience knows what their house knows and what they were told, including
   the true state of things they would plausibly know (musters, their own hosts) — never the chronicle's fiction (B-15).

## 2. Nature

### 2.1 Scales (0–10)

| Scale | 0 | 10 |
|---|---|---|
| courage | craven | fearless |
| wits | dull | brilliant |
| guile | guileless | master schemer |
| pride | humble | arrogant |
| temper | placid | explosive |
| warmth | cold | warm |
| stubbornness | pliable | immovable |
| honesty | liar | cannot lie |
| ambition | content | consumed |
| piety | indifferent | devout |

Plus `sway` (what moves them: `gold, flattery, fear, duty, honour, family, power, vengeance, love, faith, safety`) and
`weakness` (one line: "cannot see lies in those he loves").

### 2.2 Data

`data/histories.js P(...)` entries gain an explicit `nature` object (the prose fields stay for prompts). A character with
no persona gets a nature from **archetype defaults** by role, region and rank (`data/archetypes.js`, new), plus ±2 seeded
variation — never from regex. *Implemented in WP A10* ([DECISIONS.md#D-003](DECISIONS.md)): the scales and sway live in
`data/natures.js` (every persona; checked by `npm run check`), archetypes also read the character's written trait words
through a fixed table, and `sex` is data on every character. `temperament.js` reads the scales; `natureTags()` becomes a pure function of the scales
(e.g. `honesty ≥ 8 → "honest"`, `guile ≥ 7 → "a schemer"`, `temper ≥ 7 → "hot-tempered"`, `warmth ≤ 2 → "cold"`).

### 2.3 Calibration table (authoritative starting values)

| Character | cou | wit | gui | pri | tem | war | stu | hon | amb | pie | sway | weakness |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Eddard Stark | 8 | 6 | 1 | 6 | 3 | 6 | 8 | 10 | 2 | 6 | duty, honour, family | cannot see lies in those he trusts |
| Catelyn Stark | 7 | 7 | 4 | 6 | 6 | 7 | 7 | 7 | 3 | 7 | family, duty | fear for her children overrules judgement |
| Robb Stark | 9 | 7 | 2 | 6 | 6 | 7 | 7 | 8 | 4 | 5 | honour, family | honour and the heart over policy |
| Jon Snow | 8 | 7 | 2 | 5 | 5 | 6 | 7 | 9 | 3 | 4 | duty, honour | wants to belong |
| Sansa Stark (298) | 3 | 6 | 2 | 5 | 2 | 7 | 4 | 7 | 5 | 6 | love, courtesy | believes the songs |
| Arya Stark (298) | 8 | 7 | 4 | 5 | 7 | 6 | 9 | 6 | 2 | 1 | family, vengeance | cannot let a wrong go |
| Theon Greyjoy | 5 | 5 | 4 | 8 | 6 | 4 | 5 | 4 | 7 | 2 | power, pride | needs to be seen as a man by his father |
| Roose Bolton | 5 | 9 | 9 | 7 | 1 | 0 | 6 | 2 | 7 | 1 | power, safety | trusts only what he controls |
| Ramsay Snow | 6 | 6 | 6 | 8 | 9 | 0 | 6 | 0 | 8 | 0 | power, cruelty | cannot resist cruelty |
| Wyman Manderly | 5 | 8 | 8 | 5 | 3 | 7 | 8 | 4 | 3 | 7 | family, vengeance | a long memory hidden under a fat man's laughter |
| Jon Umber (the Greatjon) | 9 | 4 | 1 | 7 | 8 | 7 | 7 | 9 | 3 | 5 | honour, strength | quick to draw steel |
| Rickard Karstark | 7 | 5 | 2 | 8 | 8 | 3 | 9 | 7 | 4 | 4 | vengeance, pride | vengeance for his sons |
| Maege Mormont | 8 | 6 | 2 | 6 | 5 | 5 | 8 | 8 | 2 | 5 | duty, honour | — |
| Robert Baratheon | 9 | 5 | 1 | 7 | 8 | 7 | 5 | 6 | 1 | 2 | pleasure, friendship | wine, women, the past |
| Cersei Lannister | 6 | 6 | 7 | 10 | 8 | 2 | 8 | 2 | 10 | 2 | power, family | thinks herself Tywin and is not |
| Jaime Lannister | 10 | 7 | 3 | 9 | 6 | 4 | 6 | 5 | 3 | 1 | family (Cersei), honour (hidden) | Cersei |
| Tyrion Lannister | 5 | 10 | 7 | 6 | 5 | 6 | 6 | 5 | 6 | 1 | recognition, love, wine | wants his father's regard |
| Tywin Lannister | 8 | 10 | 9 | 10 | 3 | 1 | 9 | 3 | 9 | 2 | family, power | the family name above his children |
| Kevan Lannister | 7 | 7 | 4 | 5 | 3 | 6 | 7 | 8 | 2 | 5 | duty, family | loyal past reason |
| Joffrey Baratheon | 2 | 3 | 3 | 10 | 9 | 0 | 8 | 1 | 7 | 1 | flattery, fear | a coward who must humiliate |
| Stannis Baratheon | 8 | 8 | 3 | 8 | 4 | 2 | 10 | 10 | 6 | 6 | duty, justice | cannot bend, even to win |
| Renly Baratheon | 6 | 7 | 5 | 7 | 3 | 8 | 4 | 5 | 8 | 3 | flattery, love, power | believes war is a pageant |
| Petyr Baelish | 3 | 10 | 10 | 6 | 2 | 3 | 5 | 0 | 10 | 0 | power, gold | Catelyn |
| Varys | 3 | 10 | 10 | 3 | 1 | 4 | 8 | 3 | 5 | 1 | the realm (as he sees it) | — |
| Pycelle | 2 | 6 | 7 | 5 | 3 | 3 | 5 | 2 | 4 | 2 | Lannister power, safety | pretends to be older than he is |
| Barristan Selmy | 9 | 7 | 1 | 6 | 3 | 5 | 8 | 10 | 1 | 7 | duty, honour | his oaths bound him to bad kings |
| Sandor Clegane | 8 (not fire: 1) | 6 | 1 | 5 | 8 | 2 | 6 | 9 | 1 | 0 | none | fire; his brother |
| Gregor Clegane | 8 | 2 | 1 | 7 | 10 | 0 | 6 | 3 | 3 | 0 | fear, blood | — |
| Walder Frey | 3 | 8 | 8 | 8 | 7 | 2 | 8 | 2 | 7 | 2 | gold, flattery, respect | never forgets a slight to his dignity |
| Hoster Tully | 6 | 7 | 4 | 6 | 5 | 6 | 7 | 7 | 4 | 6 | family, duty | dying |
| Edmure Tully | 7 | 4 | 1 | 6 | 6 | 8 | 5 | 8 | 4 | 6 | honour, love of his people | acts before he thinks |
| Brynden Tully (the Blackfish) | 9 | 8 | 3 | 5 | 4 | 5 | 9 | 9 | 1 | 4 | duty, family | — |
| Lysa Arryn | 2 | 5 | 6 | 7 | 8 | 2 | 7 | 2 | 5 | 4 | love (Petyr), her son's safety | paranoid, jealous |
| Yohn Royce (Bronze Yohn) | 8 | 7 | 3 | 7 | 4 | 5 | 8 | 9 | 4 | 6 | honour, the Vale | — |
| Mace Tyrell | 5 | 3 | 2 | 8 | 4 | 7 | 5 | 6 | 8 | 5 | flattery, ambition | vanity |
| Olenna Tyrell | 5 | 10 | 9 | 6 | 3 | 5 | 8 | 4 | 6 | 3 | family, power | — |
| Margaery Tyrell | 6 | 8 | 7 | 5 | 2 | 8 | 6 | 5 | 8 | 6 | family, power | — |
| Loras Tyrell | 9 | 5 | 1 | 8 | 7 | 7 | 6 | 8 | 4 | 5 | love (Renly), honour | Renly |
| Randyll Tarly | 8 | 8 | 3 | 8 | 5 | 1 | 9 | 7 | 5 | 5 | duty, strength | contempt for weakness (his son) |
| Doran Martell | 5 | 10 | 9 | 5 | 1 | 5 | 9 | 4 | 6 | 3 | vengeance (hidden), Dorne | patience mistaken for weakness |
| Oberyn Martell | 9 | 9 | 5 | 7 | 8 | 7 | 7 | 7 | 4 | 2 | vengeance, love, pleasure | Elia's death |
| Balon Greyjoy | 7 | 5 | 3 | 10 | 7 | 1 | 10 | 6 | 9 | 7 (Drowned God) | the Old Way, pride | cannot forget 289 |
| Euron Greyjoy | 9 | 9 | 9 | 10 | 5 | 0 | 6 | 1 | 10 | 0 | power | — |
| Victarion Greyjoy | 9 | 3 | 1 | 8 | 7 | 2 | 8 | 7 | 6 | 7 | duty, pride | jealousy of Euron |
| Asha Greyjoy | 8 | 8 | 5 | 7 | 5 | 6 | 7 | 6 | 7 | 4 | power, family | — |
| Jeor Mormont | 8 | 7 | 3 | 5 | 5 | 6 | 8 | 8 | 1 | 5 | duty | his son's disgrace |
| Aemon (Maester) | 6 | 9 | 2 | 2 | 1 | 8 | 6 | 9 | 0 | 6 | duty | — |
| Benjen Stark | 8 | 7 | 2 | 4 | 3 | 6 | 7 | 9 | 1 | 5 | duty | — |
| Mance Rayder | 8 | 9 | 6 | 6 | 3 | 7 | 7 | 6 | 7 | 1 | freedom, his people | — |
| Viserys Targaryen | 2 | 3 | 3 | 10 | 10 | 0 | 8 | 2 | 10 | 1 | flattery, power | a coward who threatens |
| Daenerys Targaryen (298) | 4 → grows | 7 | 2 | 4 → grows | 4 | 8 | 6 | 8 | 3 → grows | 2 | family, the helpless | — (her scales change at beats) |
| Illyrio Mopatis | 3 | 9 | 9 | 5 | 2 | 6 | 7 | 2 | 6 | 1 | gold, a secret cause | — |
| Jorah Mormont | 8 | 7 | 5 | 6 | 5 | 5 | 7 | 4 (spying) | 3 | 2 | a pardon, Daenerys (later) | — |
| Khal Drogo | 10 | 6 | 1 | 9 | 7 | 5 | 8 | 9 | 5 | 5 | strength, Daenerys | — |
| Melisandre | 7 | 9 | 7 | 7 | 2 | 3 | 9 | 5 | 6 | 10 | faith | — |
| Davos Seaworth | 7 | 7 | 3 | 2 | 2 | 8 | 7 | 10 | 1 | 3 | duty, Stannis | — |

Values for the remaining ~250 characters come from their personas where they exist (the agent converts each `P(...)`
prose field to scales by reading it — once, offline, committed as data; a test fails if any persona lacks explicit
scales) and from archetypes otherwise.

## 3. Skills

The six CK3-style skills stay (`dip, mar, stw, int, lrn, prw`, 0–20), used for: battle (`mar`), duels and melees (`prw`),
the ledger (`stw` of the steward modifies waste ±5 %), schemes (`int`), letters and persuasion (`dip`), the maester's
advice quality (`lrn`). Skills grow slowly with age and use (`+1` per 2 years in an office that uses them, cap by age
curve), and decline after 60.

## 4. Goals (what people are working towards)

Each notable character carries 1–3 `goals` (from `data/agendas.js`, expanded to every head of house, regent and
office-holder): `{ id, text, kind, target, steps: [verbs], priority, canon: bool }`. Goals feed the Mind's context and
salience ([04](04-ai-system.md) §5). Full living-world treatment in [09-living-world.md](09-living-world.md) §2.

*Implemented (WP D6):* `public/data/goals.js` — 100 goals of 78 people (`G(text, kind, steps, { target, priority, canon })`), with
`RANK_GOALS` and `NATURE_GOALS` for everyone else who speaks for a house (`engine/minds/goals.js` `goalsOf`). A mind is
told its top two goals as what it wants; the house's ways try a goal's steps when nothing else fits (the `goal` rule,
last before holding); a priority-3 goal weighs +5 in salience. `tests/goals.test.js`.

## 5. Life: ageing, health and death

- **Ageing:** yearly on the 1st of the 1st moon (as now).
- **Health:** wounds from battle/duels (`wounded` → heals in 1–3 moons or festers), illness (seasonal fevers, the flux in
  camps, winter chills), frailty after 70. Deaths from health rolls use `health` and age.
- **Canon death windows** (`canon.deathWindow` in `data/characters.js`): under Canon gravity a character with a later
  window **cannot die of random causes or in battle** before it (captured or wounded instead). When their canon moment's
  beat fires, the beat causes the death (if its preconditions hold). If the window passes without it (the world has
  diverged), the protection ends. Under Loose, protection applies only to `pillar` deaths; under Sandbox, none.

| Character | Canon window | Cause (beat) |
|---|---|---|
| Jon Arryn | before start | poisoned (the start) |
| Robert Baratheon | 298 AC, 10th–12th moon | the boar (`last_hunt`) |
| Viserys Targaryen | 298 AC, late | molten gold (`dragons.golden_crown`) |
| Eddard Stark | 299 AC, early | Baelor's Sept (`crown_justice`) |
| Khal Drogo | 299 AC, early | wound festers; Mirri Maz Duur |
| Renly Baratheon | 299 AC, mid | Melisandre's shadow (`five_kings.shadow`) |
| Cortnay Penrose | 299 AC, mid | the second shadow |
| Hoster Tully | 299 AC, mid | old age and illness |
| Balon Greyjoy | 299 AC, late | a fall from a bridge at Pyke |
| Jeor Mormont | 299 AC, late | the mutiny at Craster's Keep |
| Rickard Karstark | 299 AC, late | executed by Robb for murdering captives |
| Robb Stark, Catelyn Stark | 299 AC, late | the Red Wedding |
| Joffrey Baratheon | 300 AC, early | poisoned at his wedding |
| Tywin Lannister | 300 AC, early | Tyrion's crossbow |
| Lysa Arryn | 300 AC | the Moon Door |

- **Protected characters** (`canon.protected: true`): the children the canon story keeps alive through 300 AC — Sansa,
  Arya, Bran, Rickon, Jon Snow, Tyrion, Daenerys, Tommen, Myrcella — cannot die of *random* causes (illness rolls, road
  encounters, a battle they are merely present at) under Canon gravity. They are **not** protected from the player's own
  deliberate orders, nor from a battle the player placed them in; the player's choices always have teeth. Under Loose
  and Sandbox there is no protection.

*Implemented (WP D4):* `engine/people/life.js` — wounds heal in 30–90 days (one in twelve festers), weekly fevers,
winter chills and frailty after 60/70, `keptByStory` (canon windows and protected characters by gravity, moved here from
the battle engine) guarding every death of chance: the years, wounds, illness, the lists and battle; under Canon those a
beat still to come names are spared as well (`canonAhead`). The windows live in `data/fates.js` rather than on the
characters (DECISIONS D-054). Invariant 11 (`engine/state/validate.js`) fails the soak if anyone the story keeps died of
chance before their time. `tests/life.test.js`.

## 6. Succession

`shared/people.js heirOf` is kept and extended with explicit laws per house (`houses.js law`):

| Law | Houses | Rule |
|---|---|---|
| Male-preference primogeniture | most of Westeros | eldest son → his line → next sons → eldest daughter → … → brothers → sisters → cousins |
| Equal primogeniture | Dorne | eldest child regardless of sex |
| The kingsmoot | the Iron Islands' crown | on a king's death a kingsmoot is called (a beat/hook), candidates by strength |
| Election | the Night's Watch (Lord Commander), the free folk | a vote/beat |
| Appointment | offices (Hand, Kingsguard, maesters) | the king/lord appoints |
| Merchant oligarchy | Free Cities | out of scope |

Sworn brothers, maesters and Kingsguard are skipped (existing rule). **Bastards** do not inherit unless legitimised
(a royal decree verb). **Disputed successions**: when two claims are close (a legitimised bastard vs a daughter, a
grandson through a daughter vs an uncle), vassals split by opinion — a hook for a civil war within the house.

## 7. Offices

| Office id | Title | Held by (298) | Powers |
|---|---|---|---|
| `hand_of_the_king` | Hand of the King | vacant (Jon Arryn dead) → the King's choice | issues the King's orders; runs the small council; in the game: may act for the Crown |
| `master_of_coin` | Master of Coin | Petyr Baelish | the Crown's ledger; borrowing |
| `master_of_laws` | Master of Laws | Renly Baratheon | the City Watch |
| `master_of_ships` | Master of Ships | Stannis Baratheon (absent on Dragonstone) | the royal fleet |
| `master_of_whisperers` | Master of Whisperers | Varys | the Crown's knowledge (spies everywhere) |
| `grand_maester` | Grand Maester | Pycelle | the Citadel's ravens |
| `lord_commander_kingsguard` | Lord Commander of the Kingsguard | Barristan Selmy | the King's guard |
| `warden_north` / `_west` / `_east` / `_south` | Wardens | Stark / Lannister / **vacant** (Jon Arryn's death; the boy Robert Arryn does not inherit it — a matter for the Crown) / Tyrell | lead the realm's hosts in their quarter |
| `lord_commander_nw` | Lord Commander of the Night's Watch | Jeor Mormont | the Watch |
| household offices | steward, maester, master-at-arms, captain of the guard, castellan, septon, spymaster | per house | the council members of a house; their knowledge and advice (§15) |

Offices have `holder`, `appointedBy`, `since`. The verb `appoint_office` checks who may appoint (the King for the
small council; a lord for his household).

## 8. Regency

`shared/regency.js` is kept. Fix B-23: `data/characters.js` carries explicit canon regents where the books name them —
Lysa Arryn for Robert Arryn; Cersei (Queen Regent) for Joffrey after Robert's death and for Tommen until her arrest.
Where the books name none (e.g. Edric Dayne), `chooseRegent` must prefer the house's castellan/steward/maester or the
mother over a cadet-branch adult, and must never choose a character flagged `outlaw` or `other_branch` (Gerold Dayne is
of the Daynes of High Hermitage).

*Implemented (WP D4):* `data/fates.js` `CANON_REGENTS` (Lysa; Cersei for Joffrey and Tommen) and `NOT_REGENT` (the
Darkstar); `chooseRegent` takes the named regent, then the late lord's widow of whatever house, siblings, uncles and
aunts, then the seat's sworn officers, and only then other kin — never another branch's man or an outlaw.

## 9. Commitments (promises that bind the engine)

`engine/politics/commitments.js`.

> *Implemented in WP B10* ([DECISIONS D-034](DECISIONS.md)): eight kinds the engine can act on and judge; sincerity,
> acting on it, judging and voiding as §9.2. Guest right (§9.3) comes with the beats that need it (D1–D2).

### 9.1 Kinds

`march_to {place}` · `send_men {men, to, by}` · `join_war {war, side}` · `stay_neutral {war}` · `pay {amount, by}` ·
`marry {a, b}` · `betroth {a, b}` · `release {captive}` · `hand_over {person|holding}` · `swear_fealty {to}` ·
`attend {event|place}` · `grant {holding}` · `keep_secret {secretId}` · `hold {place}` · `open_gate {chokepoint}` ·
`deliver_letter {to}`.

### 9.2 Lifecycle

1. **Made** (audience outcome, letter reply, matter option, pact): `sincerity` rolled secretly =
   `base(honesty) + relationTerm + interestTerm(does keeping it serve their goals?) − fearTerm(if made under duress) ±
   difficulty`. Roose Bolton (honesty 2) agreeing under a devoted temper has low sincerity; the Greatjon (honesty 9) high.
2. **Acting on it:** from `madeDay`, the maker's intents include the commitment's verb with priority 70; if the maker is
   a Mind actor, the commitment is in their context ("You promised Lord Stark your men at Moat Cailin by the 20th").
3. **Due:** on `dueDay` the engine checks: kept (fact `commitment_kept`, opinion/relation +) or broken (fact
   `commitment_broken`, relation −15 to −40 by severity, a `reputation` tag `oathbreaker` for public commitments, a
   memory for the wronged).
4. **Void** if the maker dies or the condition becomes impossible (a host destroyed) — the other party is told why.

### 9.3 Guest right and oaths

Guest right (bread and salt) is a special public commitment made automatically when a guest is received under a lord's
roof. Breaking it (murdering or arresting guests) is the gravest crime: relation −60 with every house that learns of it,
`kinslayer/guestbreaker` reputation, the Faith and the old gods' followers furious. The Red Wedding is this.

## 10. Lords and vassals

`shared/vassals.js vassalTemper` is kept: loyalty of the vassal lord, friendship, taxes, hardship, regency, commitments
kept/broken by the liege, victories/defeats. Temper bands: devoted ≥ 70, dutiful 45–69, wavering 28–44, resentful
< 28, near rebellion < 15.

- **Dues:** paying / late / withholding (existing), plus *paying in kind* (grain instead of coin in hard times).
- **Banners:** §07 3.
- **Defiance:** a resentful vassal may refuse summons, withhold dues, treat with the liege's enemies (`treachery.js`
  secret talks), and finally renounce fealty (a `fealty_renounced` fact and a war or a new liege).
- **Player as vassal:** the liege's summons, dues, a summons to court, being stripped of a holding (attainder) — each as
  a Matter with consequences.
- **Granting** holdings to vassals binds them (existing `grant`).

## 11. Relations and opinion

- **House relations** (`relations['a|b']`, −100..100) with a capped reasons log (last 12 reasons with dates) —
  shown in the Diplomacy view as "why".
- **Personal opinion** of a character toward another (sparse). The player-lord's opinion is kept per character (the
  existing `c.opinion` migrates to `opinion[playerLord]`).
- **Drift:** relations decay 1/moon toward a baseline set by culture and history (Blackwood–Bracken −40 baseline;
  Stark–Lannister −10 after 283 AC; Martell–Lannister −50: Elia).
- **Reputation tags** (house-wide, public): `honourable`, `oathbreaker`, `kinslayer`, `guestbreaker`, `turncloak`,
  `generous`, `cruel`, `craven`, `victorious`. Each shifts every house's opinion and every Mind's willingness.

## 12. Diplomacy, court and intrigue verbs

> *In the registry since WP B4* (`engine/actions/{court,diplomacy,movement}.js`): `send_letter` (a raven by order),
> `declare_war`, `grant_holding`, `appoint_office`, `judge_prisoner` (release, ransom, the Wall, the axe),
> `hold_feast`, `hold_tourney`, `send_gift`, `plant_spy`, `gather_secrets`, `answer_matter`, and the journeys
> `send_person` and `recall_rider`. Envoys, proposals and the rest come with B10 and phase D.

| Verb | Params | Legal when | Resolution |
|---|---|---|---|
| `send_letter` | to, body intent, proposal? | a rookery at the sender's location or a rider | a `Letter`; reply generated on arrival ([04](04-ai-system.md) §8.2) |
| `send_envoy` | envoy, to, proposal | envoy free; route | an `envoy` party; on arrival an audience between envoy and target resolves by nature, odds and the envoy's `dip` |
| `propose` | kind (alliance, trade, non-aggression, truce, marriage, betrothal, fealty, ransom, hostage exchange, passage), terms | via letter/envoy/audience | weighed by `diplomacy.js disposition` + nature + interests; yes → pact + commitments |
| `demand` | of, what (release, payment, submission, hostages, a head), threat | | refusal/compliance by fear vs pride; a refused demand with a threat creates a matter for the demander |
| `declare_war` | house, goal | | war fact; knowledge spreads |
| `sue_for_peace` / `offer_terms` | war, terms | | by war score and natures |
| `swear_fealty` / `renounce_fealty` | to | | liege change; the realm redraws |
| `grant_holding` | holding, to | own holding, to a vassal | existing |
| `appoint_office` / `dismiss_office` | office, person | the appointer | §7 |
| `knight` | person | a knight may knight | title "Ser"; +opinion |
| `legitimise` | bastard | a king | the bastard takes the house name; succession changes |
| `betroth` / `wed` | a, b | eligible (§13) | pact `marriage`; commitments; a wedding party/feast |
| `foster` / `take_ward` / `take_hostage` | child, to/from | | child moves (a party); relations; leverage |
| `imprison` / `release` / `execute` / `send_to_wall` / `pardon` | person | in custody | facts; relations by the victim's house and every observer's nature |
| `judge` | case | a matter | existing `court.judge` |
| `hold_feast` / `hold_tourney` | where, invite? | coin | existing court acts; invitations create retinue parties of the invited (09 §3) |
| `host_guest` | person | | guest right (§9.3) |
| `gift` / `bribe` | | coin | [06](06-economy.md) §9 |
| `plant_spy` | house | a spymaster or coin | a scheme; gives knowledge of that house's hosts and letters (existing `intel.spies`) |
| `gather_secrets` | person/house | a spy in place | a scheme; may reveal a secret (§16) |
| `spread_rumour` | content, where | | a false or true `rumour` fact with chosen scope; beliefs in other houses' knowledge |
| `forge_letter` | as, to, body | a scheme with a skilled agent (int ≥ 12) | a letter that appears to be from someone else; discovery risk |
| `incite` | vassal/holding | spy in place | unrest / defiance in the target's realm |
| `assassinate` | target | spymaster int ≥ 14, a scheme ≥ 60 % progress, coin ≥ 5,000 | success chance low (≤ 25 % for a guarded lord); discovery likely; canon-protected targets fail under Canon gravity; the victim's kin never forget. **Minds may not pick it unless their nature has guile ≥ 8 and honesty ≤ 3.** |
| `sabotage` | holding/works/fleet | spy in place | delays or destroys works; fire |

## 13. Marriage, children and blood

- **Eligibility:** betrothal at any age; marriage at 13+ for girls and 14+ for boys in the books' Westeros (the game
  follows the books' custom but **never depicts sexual content involving minors**; see [10](10-narrative-events.md)
  §8.5); no marriage between close kin (except House Targaryen's custom); the Faith requires a septon, the North
  accepts the old gods' heart tree.
- **Match value** (for the diplomacy view and minds): alliance weight (relation +20 to +40), the other house's power,
  claims gained (a daughter of a house with no sons carries a claim), dowry, prestige.
- **Children:** a married couple under 45 has a monthly conception chance (~5–8 %); pregnancy 9 moons (a `birth` fact;
  mother's risk ~2 %); canon births where the books have them.
- **Bastards:** surnames by region — Snow (North), Rivers (Riverlands), Stone (Vale), Hill (Westerlands), Flowers (Reach),
  Storm (Stormlands), Sand (Dorne), Waters (Crownlands), Pyke (Iron Islands).

## 14. Captivity, hostages and ransom

Captives are `members` of their captor's party or held at a holding (`status: 'captive'`, `heldAt`). Verbs: ransom
(demand/pay), exchange, release, execute, send to the Wall. A captive's house's minds prioritise their return
(salience +25). Captives can escape (a scheme or a hook). Canon: Jaime captured at the Whispering Wood, Tyrion at the
Crossroads Inn, Ned in the Red Keep, Sansa a hostage in King's Landing, Theon a ward (hostage) at Winterfell.

## 15. Audiences and councils (player-facing)

- **Audience** composer: speak to anyone at the lord's location (face to face) or write to anyone elsewhere (a letter).
  The engine's `weighAudience` reads intent (request, demand, threat, insult, flattery, bribe, proposal), updates mood
  (anger, fear, trust, patience) and returns a verdict; the Audience call ([04](04-ai-system.md) §8.1) writes the scene
  within it; `outcome.agrees_to` becomes commitments. Patience runs out → the audience ends for the moon (existing).
- **Servants** (the player's own household) obey; their replies describe what they are about to do per the receipt.
- **What people know in audiences:** their house's knowledge + officers' ledgers + "WHAT YOU CAN SEE FROM HERE" (the
  hosts and parties at or near their location, true numbers) — Luwin at Winterfell knows exactly who has arrived.
- **Council:** the lord's officers; each sees their domain (steward: coin/food; master-at-arms: hosts/musters;
  maester: letters/the season/health; spymaster: knowledge and rumours; castellan: the holding's defences).

## 16. Secrets (canon, 298 AC)

`secrets` on characters, with `knownBy` and `proof`. Revealing a secret requires proof or a credible witness to be
believed; rumours without proof spread as `rumour` facts that shift beliefs, not facts.

| Secret | Known by (298) | If revealed |
|---|---|---|
| Joffrey, Myrcella and Tommen are Jaime's children | Cersei, Jaime; suspected: Stannis; Jon Arryn (dead) found it; Ned learns by beat (the book of lineages, Gendry) | the Baratheon succession passes to Stannis; war |
| Jon Snow is the son of Lyanna Stark and Rhaegar Targaryen | Eddard Stark, Howland Reed | a Targaryen claimant (sandbox dynamite; the Citadel's records do not prove it) |
| Lysa Arryn poisoned Jon Arryn at Petyr Baelish's urging; Lysa's letter blaming the Lannisters was Petyr's plan | Lysa, Petyr | Lysa ruined; Baelish exposed |
| The catspaw's dagger was Littlefinger's lie ("won from me by Tyrion") | Petyr (and the truth: the dagger was Robert's, the catspaw sent by Joffrey — known to no one) | the Stark–Lannister war's pretext collapses |
| Jorah Mormont informs for Varys | Jorah, Varys | Daenerys's trust broken |
| Varys and Illyrio plot a Targaryen restoration | Varys, Illyrio | the Crown hunts Varys |
| Cersei's plan to kill Robert (Lancel's strongwine) | Cersei, Lancel | treason |
| Jaime pushed Bran from the tower | Jaime, Cersei, Tyrion (suspects); Bran (when he wakes, cannot remember) | Stark vengeance |
| Gendry, Mya Stone, Edric Storm and Barra are Robert's bastards | Jon Arryn (dead), Stannis (the list), Varys | claims; the proof of the incest |
| Renly and Loras are lovers | an open secret at court | little, in the books' world; a lever with Margaery's marriage |
| The Lannister mines are running dry | Tywin, his steward | [06](06-economy.md) §5.3 |
| Walder Frey's grudge against the Tullys | everyone knows he is offended; no one knows how deep | the Red Wedding's roots |
| Roose Bolton's ambition | Roose | — |
| Daenerys is with child (later 298) | Dany, Jorah, Drogo, her handmaids | the Crown sends an assassin (a beat) |
