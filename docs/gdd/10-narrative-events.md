# 10 · Narrative: canon, beats, openings, matters, hooks and the voice

> The story content of *A Game of Thrones — 298 AC* and the rules that tell it. Fixes B-06, B-13, B-19, B-28. Engine
> side: beats are data in `public/data/beats/` executed by `engine/world/beats.js` (rewrite of `shared/plots.js`).

---

## 1. Principles

1. **Canon is a current, not a rail.** Under Canon gravity the books' events happen on their schedule *if the world
   still fits them*; the player can change anything, and the world adapts.
2. **Beats act through the engine.** A beat creates intents, parties, matters and facts through the same verbs as
   everyone else. **No beat sets a character's location directly** (no teleports, B-06).
3. **The future is secret.** Nothing in the UI or in any prompt the player can see names a beat before it happens
   (B-18). Minds see canon goals as *their own intentions*, not as fate.
4. **Adapt, don't break.** Every beat has alternates for the common ways the world diverges, and a lapse.

## 2. Canon gravity (owner decision: adjustable, default Canon)

See [05](05-gameplay-loop.md) §8 for the setting's effect on beats, minds and locks. Beats carry `pillar: true` if they
are pushed even under *Loose*: Robert's death, Ned's arrest, the war's outbreak (Tyrion's seizure → the Riverlands
burning), Robb's call to the banners (if Ned is taken), the dragons' hatching, the ironborn rising, the Red Wedding's
*conditions* (a slighted Frey + a Stark king + a wedding) — never the massacre itself unless its conditions hold.

## 3. The beat schema (v2)

```js
Beat = {
  id: 'kings_ride.arrival', thread: 'kings_ride', title: 'The King comes to Winterfell',   // title used only once it happens
  window: { from: '298-08-20', to: '298-10-30' },           // ISO-like y-m-d in AC; outside it the beat lapses
  pillar: false,
  trigger: { kind: 'arrival', party: 'royal_progress', at: 'stark' }
         | { kind: 'date', at: '298-09-12' } | { kind: 'fact', match: { kind: 'death', actor: 'robert_baratheon' } }
         | { kind: 'after', beat: 'kings_ride.arrival', days: [4, 12] },
  requires: (s) => bool,                                    // preconditions (who is alive/free/where)
  names: ['robert_baratheon', 'eddard_stark', ...],         // canon-locked while pending (03 §9)
  effects: [ Intent | { fact } | { matter } | { party } ],  // via verbs; e.g. { verb: 'hold_feast', actor: 'eddard_stark', params: {...} }
  playerHouse: { stark: { matter: 'hand_offer' } },         // when the beat touches the player's house, the player decides
  alternates: [ { when: (s) => bool, effects: [...] } ],    // if the world diverged
  lapse: { effects: [...] },                                // the window passed
  next: ['kings_ride.the_fall'],
  secretFacts: ['jaime_pushed_bran'],                        // facts created with scope 'secret'
}
```

*Implemented (WP D1):* `public/js/engine/world/beats.js` is the engine and `public/data/beats.js` the data — the
threads' stages with a `BEAT_META` table keyed by `thread.stage` for `pillar`, `trigger` (`date`, `arrival`, `death`,
`after`), `names`, `alternates` and `lapse`. Windows run from the first day of a stage's moon to the end of its moon +
grace. `effects` stay functions returning engine ops, facts and matters (the verbs' way is D2's), and the fact-match
trigger is written as `death` for now ([DECISIONS.md#D-051](DECISIONS.md)). `tests/beats.test.js`.

### 3.1 Timekeeping

The scenario starts on the **1st day of the 8th moon, 298 AC**. **The books' order is binding; the dates are the
game's** ([DECISIONS.md#D-002](DECISIONS.md)). The conventional reconstruction (A Wiki of Ice and Fire's year pages) puts
all of *A Game of Thrones* in 298 AC, but the game begins with the King's progress still at the Twins, and a royal
progress at ten miles a day cannot reach Winterfell, return and see the Hand arrested within the five moons left of the
year. So in play: **298 AC** — Robert's visit, Bran's fall, the Hand's tourney, Tyrion's seizure, the Riverlands burned,
Robert's death, Ned's arrest, the dragons' golden crown; **early 299 AC** — the North's banners, the Twins, Ned
executed, the Whispering Wood and the Camps, Robb crowned, the dragons hatched, the dead at Castle Black; **299 AC** —
the red comet, Renly's death, the ironborn in the North, the Blackwater, Winterfell sacked, the Red Wedding (late),
Balon's death, autumn declared; **300 AC** — the Purple Wedding, Tywin's death, the battle at the Wall, the kingsmoot,
winter. The table below is authoritative. *(B-19 — the Purple Wedding before the Red Wedding — fixed in WP A11:
`plots.js` keeps these windows and this order; `tests/canon.test.js`.)*

## 4. The canon beats, 298–300 AC

Windows are *target* windows for Canon gravity. "Player" column: what the player gets if they are that house (a Matter
or an interrupt), else the beat runs through minds/engine.

*Implemented (WP D2):* sixty beats in `public/data/beats.js`, in fifteen threads — the rows below plus `young_wolf`
(W3, W5, W9, W11, W12, W16), `riverrun` (W17) and `omens` (W7 and the white ravens of §4.10). The books' order where
threads touch is `BOOK_ORDER` in the same file. Q9 is `scripts/canon.js` (and `tests/q9-canon.test.js`); what the
playtest found and fixed is [DECISIONS.md#D-052](DECISIONS.md).

### 4.1 The King rides north (`kings_ride`)

| # | Beat | Window | Trigger / requires | Engine effects | Player | Alternates |
|---|---|---|---|---|---|---|
| K1 | **The progress on the road** (start state) | 298-08-01 | start | `royal_progress` party (03 §3.3; 09 §3.3) at the Twins, route north with stops; canon-locked | — | — |
| K2 | **The King comes to Winterfell** | 08-20 → 10-30 | **arrival** of `royal_progress` at `stark` | feast (`hold_feast` by Eddard, royal scale); Robert's audience with Ned; **Matter `hand_offer`** to Eddard | Stark: Matter (accept / accept with conditions / refuse / "own words"); days 10 | progress destroyed/turned back → K2 lapses, K3–K7 lapse, `last_hunt` adapts (Robert returns south alone) |
| K3 | **The betrothal** | with K2 | K2 | Matter `sansa_joffrey` (Robert proposes Sansa for Joffrey) | Stark: Matter | if Sansa betrothed elsewhere: Robert is offended (relation −10) |
| K4 | **Lysa's letter** | K2 ± 3 days | Catelyn at Winterfell | a Letter from Lysa to Catelyn (secret: `lysa_letter`): the Lannisters killed Jon Arryn | Stark: a letter card | Catelyn elsewhere: the letter follows her |
| K5 | **The fall** | K2 + 3–12 days | Jaime, Cersei, Bran at Winterfell | secret fact `jaime_pushed_bran`; public fact `bran_fell` (Bran wounded, in a sleep); Stark psyche + | — (no choice; it is the world) | Bran not at Winterfell / Jaime absent → skip; the catspaw (C1) lapses |
| K6 | **The Hand rides south** | K2 + 10–25 | Hand accepted (or Ned appointed another way) | the progress departs south with members Ned, Sansa, Arya, the Stark household (Jory, Vayon Poole, septa Mordane, 50 guards) — the Stark player's own people join via their **receipt** (the player chose; nothing is moved without the Matter's answer) | Stark: whom to take (Matter options) | Hand refused: Robert names Jon Arryn's successor by mind (Tywin is his wife's choice; Stannis if Ned suggests) |
| K7 | **Jon and Benjen to the Wall** | with K6 | Jon's fate | Jon, Benjen, Tyrion (Tyrion's own intent: to see the Wall) ride north as a party | Stark: Matter `jon_future` (the Wall / stay / foster elsewhere) | |
| K8 | **The wolf and the lion on the Trident** | progress at the Inn at Darry (route) | Arya, Joffrey, Sansa with the progress | facts: Mycah killed by the Hound; Lady killed at the Queen's demand; Nymeria driven off | Stark (if Ned is with the progress): Matter `lady` (kill Lady yourself / refuse / plead) | Arya not with the progress → skip |
| K9 | **The Hand in King's Landing** | progress arrives at KL | Ned Hand | office granted; small council meets; fact: the Crown's debt revealed to the Hand (knowledge) | Stark: council Matter `the_debt` | |

### 4.2 A dagger of Valyrian steel (`catspaw`)

| # | Beat | Window | Trigger / requires | Effects | Player | Alternates |
|---|---|---|---|---|---|---|
| C1 | **The catspaw** | K6 + 5–20 | Bran asleep at Winterfell; Catelyn there | an assassin party (1 man) → attack; Catelyn wounded; Summer kills the man; the dagger found | — | Bran awake/elsewhere → skip |
| C2 | **Catelyn rides south** | C1 + 2–5 | Catelyn alive | Catelyn + Ser Rodrik secretly by ship from White Harbor to KL (a secret party) | Stark: Matter `catelyn_south` (let her go / forbid / send someone else) | |
| C3 | **Littlefinger's lie** | Catelyn in KL | Petyr in KL | secret fact: Petyr names Tyrion as the dagger's owner; Catelyn believes (knowledge) | — | |

### 4.3 The Tourney of the Hand (`hands_tourney`)

| # | Beat | Window | Requires | Effects |
|---|---|---|---|---|
| T1 | **The tourney announced** | Ned in KL + 3–10 | Robert alive | `hold_tourney` by the Crown (90,000 in prizes: [06](06-economy.md) §2); retinues of lords from the Reach, Vale, Stormlands and West converge (09 §3) |
| T2 | **The tourney** | T1 + 10–20 | | `tourney_result` facts: Ser Hugh of the Vale killed by Gregor; Loras beats Gregor with a mare in heat; the Hound saves Loras; Loras yields → the Hound champion (40,000); Thoros the melee; Anguy the archery. The **player's house may enter knights** (a matter/verb before T2): results by `prw` rolls, canon results kept for canon entrants under Canon gravity unless the player's knights change the lists |

### 4.4 The Imp taken (`the_imp`) — the war's outbreak (pillar)

| # | Beat | Window | Trigger / requires | Effects | Alternates |
|---|---|---|---|---|---|
| I1 | **The Crossroads Inn** | 298-09 → 298-11 | Tyrion riding south from the Wall **and** Catelyn riding north from KL **meet** at the Inn at the Crossroads (both parties on the road — engine contact) | Catelyn seizes Tyrion (her mind is scripted by the beat); a party to the Eyrie via the high road | they do not meet → I1 lapses; `pillar`: the war still starts via I3 when Tywin learns of **any** insult (Catelyn's accusation, Ned's inquiry) |
| I2 | **The high road and the Eyrie** | I1 + 5–15 | | clansmen attack; Bronn; the trial by combat (Bronn vs Ser Vardis Egen) → Tyrion freed with Bronn; recruits the Stone Crows (a band party) | Tyrion killed on the high road → Tywin's vengeance ×2 |
| I3 | **The Mountain rides** | I1 + 7–14 | Tywin alive, the West at peace | Tywin's intents: `call_banners` (West), Gregor `raid` Red Fork lands (Sherrer, Wendish Town, the Mummer's Ford) | |
| I4 | **The Kingslayer in the streets** | I1 + 10–20 | Jaime & Ned in KL | Jaime's men attack Ned's: Jory Cassel, Heward, Wyl slain; Ned's leg broken (`wounded`); Jaime leaves for the Rock | Ned elsewhere → Jaime simply leaves |
| I5 | **Lord Beric's ride** | I3 + 5–15 | Ned acting Hand, Robert hunting | Ned sends Beric with 120 men to bring Gregor to justice (Stark player: Matter) | |
| I6 | **The Lions in the Riverlands** | I3 + 15–40 | | Jaime (15,000) → the Golden Tooth battle (Vance slain), Riverrun besieged, Edmure captured; Tywin (20,000) takes Raventree, Harrenhal yields, Darry falls | if the Riverlands are ready (a player Tully/vassal warned), battles resolve by the engine with those forces |

### 4.5 The King's last hunt (`last_hunt`) — pillar

| # | Beat | Window | Requires | Effects | Player | Alternates |
|---|---|---|---|---|---|---|
| H1 | **The boar** | 298-10 → 298-12 | Robert alive, hunting in the Kingswood (an intent the beat gives him) | Robert gored (Lancel's strongwine: secret `cersei_killed_robert`); dies in 1–3 days; his will names Ned Protector (a letter/document entity) | Stark: Matter `protector` (proclaim Stannis / proclaim Joffrey with conditions / seize the children / flee); Crown player (Robert): the player can refuse to hunt → the beat adapts (Cersei's alternate: poison, later) | Robert not in KL → a fever on the road; Robert with the Stark player in the North → he dies there of the same cause (Lancel is with him) |
| H2 | **The throne room** | H1 + 1–3 | Ned in KL, Cersei in KL | Littlefinger's betrayal (the gold cloaks); Ned arrested; the Stark household slain (Tower of the Hand); Sansa held; Arya flees (a hidden party) | Stark (as Ned): if the player bribed the gold cloaks / had Stannis's letter sent / sent the girls away beforehand, the engine resolves it differently (the beat's conditions check those facts) | Ned not in KL → the coup is bloodless; Cersei crowns Joffrey |
| H3 | **Joffrey crowned** | H1 + 3–10 | Joffrey alive | `crowned`; Barristan dismissed (flees; a party); Tywin named Hand; Janos Slynt Lord of Harrenhal | | |
| H4 | **The brothers' claims** | H3 + 10–60 | | Renly flees to Highgarden → weds Margaery → crowned (`crowned`, 299 early); Stannis's letter on the incest (a public `rumour` with proof `stannis`) | | |

### 4.6 The King's justice (`crown_justice`)

| # | Beat | Window | Requires | Effects | Alternates |
|---|---|---|---|---|---|
| J1 | **The Great Sept of Baelor** | 299-01 → 299-03 | Ned a captive in KL, Joffrey king | Ned confesses (Varys's bargain) and is beheaded by Ser Ilyn at Joffrey's word | Ned freed/exchanged/escaped → lapse; Robb's cause changes (vengeance → negotiation) |

### 4.7 The War of the Five Kings (`five_kings`)

| # | Beat | Window | Requires | Effects | Player | Alternates |
|---|---|---|---|---|---|---|
| W1 | **The North calls its banners** | H2 + 5–20 | Ned captive; Robb at Winterfell | Robb's intents: `call_banners` (all, quick, at Winterfell; later White Harbor), march south | Stark player: this is the player's choice, never forced — an interrupt and a council | |
| W2 | **The Twins** | Robb's host at the Green Fork | Walder Frey alive | Frey's terms (a Matter for the player if Stark): passage for Robb to wed a Frey daughter, Arya to wed Elmar, Olyvar as squire, Frey wards; 4,000 Frey men join | Stark: Matter `frey_terms` | Robb crosses elsewhere (the ruby ford) → battle risk |
| W3 | **The Green Fork** | W2 + 3–10 | Roose's foot and Tywin's host in reach | engine battle; Canon gravity biases Roose's stance to *give battle at night* (a forced march) | | |
| W4 | **The Whispering Wood** | W2 + 5–15 | Robb's horse (~6,000) and Jaime's host at Riverrun | Robb's intent: `surprise` attack from the wood (feint via the Blackfish); Jaime captured on a canon result | | |
| W5 | **The Camps** | W4 + 1 | besiegers of Riverrun | engine battle with the Riverrun two-camp rule ([07](07-military.md) §8.1); Riverrun relieved | | |
| W6 | **The King in the North** | W5 + 3–30 (after J1) | Robb alive, the lords at Riverrun | `crowned` Robb (King in the North and of the Trident) | Stark: Matter `crown` (accept / refuse / defer) | Ned alive → lords push, Robb's nature decides |
| W7 | **The red comet** | 299-02 → 299-04 | — | a public sign (fact) seen everywhere; rumours by region (the ironborn: the Drowned God; the Watch: an omen) | | |
| W8 | **Storm's End and the shadow** | 299-04 → 299-08 | Renly and Stannis both claiming, Stannis besieging Storm's End | Renly slain by a shadow (secret `melisandre_shadow`); most of Renly's host goes to Stannis; Cortnay Penrose slain; Storm's End yields | | Stannis not at Storm's End → Renly marches on KL; Melisandre's shadow requires her with Stannis |
| W9 | **Oxcross and the Crag** | 299-03 → 299-08 | Robb at Riverrun, Tywin at Harrenhal | Robb's western campaign intents; Oxcross; the Crag; Robb wounded; **Jeyne Westerling** (Robb weds her — the Frey pact broken, `commitment_broken`) | Stark: Matter `jeyne` | Robb wed/betrothed already → skip |
| W10 | **The ironborn rise** | 299-03 → 299-07 | Balon alive, Theon at Pyke (Robb's envoy) | Balon crowned (`crowned`); invasions: Victarion → Moat Cailin, Asha → Deepwood Motte, Theon → the Stony Shore → Winterfell (taken) | Stark: interrupts; Greyjoy: player's choice | Theon not sent → Balon rises later, alone |
| W11 | **The Fords** | 299-06 → 299-08 | Tywin marching west, Edmure on the Red Fork | engine battle (Edmure holds the fords) | | |
| W12 | **Catelyn frees the Kingslayer** | 299-06 → 299-09 | Jaime captive at Riverrun; news of Bran and Rickon's "deaths" | Catelyn's intent: release Jaime with Brienne (a secret party south) | | |
| W13 | **The Blackwater** | 299-07 → 299-10 | Stannis's host and fleet vs King's Landing | engine siege/battle + canon verb `wildfire` (Tyrion's chain and the fire ships); the Tyrell–Lannister relief arrives (Tywin's host joins the Tyrells after W8) | | |
| W14 | **Winterfell burns** | 299-08 → 299-11 | Theon holding Winterfell, Ramsay's men near | Ramsay sacks Winterfell (holding `sacked`), Theon captured (secret), the Northmen at the gates slain | | |
| W15 | **The Rose and the Lion** | W13 + 5–30 | Tyrell–Lannister alliance | Joffrey sets Sansa aside, betrothed to Margaery | | |
| W16 | **Karstark's justice** | 299-09 → 299-11 | Rickard Karstark with Robb; Lannister captives (Tion Frey, Willem Lannister) at Riverrun | Rickard murders the boys; Robb executes him; the Karstarks leave | Stark: Matter `karstark` (behead / imprison / pardon) | |
| W17 | **Hoster Tully dies** | 299-06 → 299-12 | Hoster alive | `death` (old age), funeral on the river (Edmure's arrow) | | |
| W18 | **The Red Wedding** | 299-10 → 300-02 | Robb king; Frey pact broken (W9); a wedding agreed (Edmure–Roslin) at the Twins; Roose with Robb | Walder and Roose's secret intents; at the wedding feast, guest right broken; Robb, Catelyn slain; the Northmen massacred; Roose named Warden of the North | Stark: the player may avoid it — every precondition is a door (keep the Frey pact; do not go; bring a larger escort; distrust Roose). If the player is Frey: the player decides whether to do it | preconditions unmet → lapse |
| W19 | **Balon falls** | 299-10 → 300-01 | Balon alive, Euron at sea | `death` (a fall from a bridge at Pyke, secret: Euron's Faceless Man) → the kingsmoot hook (300) | | |
| W20 | **The Purple Wedding** | 300-01 → 300-03 | Joffrey king, wed to Margaery | Joffrey poisoned (secret: Olenna and Petyr); Tyrion accused (a trial Matter for a Lannister player) | Lannister: Matter `tyrions_trial` | |
| W21 | **The Viper and the Mountain** | W20 + 10–30 | Tyrion accused, Oberyn in KL | trial by combat; Gregor kills Oberyn (poisoned spear: Gregor dying) | | |
| W22 | **The Lord of Casterly Rock dies** | W21 + 1–10 | Tyrion condemned, Jaime frees him | Tyrion kills Tywin; flees with Varys | | |

### 4.8 The Wall (`the_wall`)

| # | Beat | Window | Effects |
|---|---|---|---|
| N1 | **Benjen rides beyond the Wall** | Jon at Castle Black + 1–10 | Benjen's ranging party beyond the Wall; he vanishes (`vanished`) |
| N2 | **The dead come back** | 299-01 → 299-03 | Othor and Jafer's corpses rise at Castle Black; Jon saves the Old Bear (Longclaw) |
| N3 | **The Great Ranging** | 299-02 → 299-06 | Mormont leads ~300 north to the Fist; Qhorin; Jon with the wildlings |
| N4 | **The Fist** | 299-08 → 299-11 | the Others attack; the retreat to Craster's |
| N5 | **Craster's Keep** | N4 + 10–30 | the mutiny; Mormont slain |
| N6 | **The wildlings at the Wall** | 300-01 → 300-04 | Mance's host assaults Castle Black (engine battle); Stannis's host arrives by sea and land and breaks it (if Stannis alive and at Dragonstone after W13) |
| N7 | **Lord Commander Snow** | N6 + 5–20 | election (Jon if alive and at the Wall) |

### 4.9 The blood of the dragon (`dragons`)

| # | Beat | Window | Effects |
|---|---|---|---|
| D1 | **A Dothraki wedding** | 298-08 → 298-09 | Daenerys weds Drogo outside Pentos; dragon eggs given (Illyrio) |
| D2 | **The golden crown** | 298-10 → 298-12 | Vaes Dothrak; Viserys threatens Daenerys; Drogo crowns him with molten gold |
| D3 | **The wine-seller** | after Robert learns of her pregnancy (Jorah → Varys) | the assassination attempt; Drogo vows the Iron Throne |
| D4 | **The Lhazareen and the maegi** | 298-12 → 299-02 | Drogo wounded; Mirri Maz Duur; Rhaego stillborn; Drogo dies |
| D5 | **Fire and blood** | D4 + 1–10 | Drogo's pyre; three dragons hatch (public rumour in Essos; reaches Westeros slowly) |
| D6 | **The red waste, Qarth, Astapor, Yunkai, Meereen** | 299–300 | low-detail Essos threads (rumours to Westeros; engine tracks Dany's host and dragons' growth) |

### 4.10 Always-on canon texture

- **White ravens:** autumn declared 299 (Canon), winter 300.
- **Name days, tourneys:** Joffrey's name day (a small tourney), the King's name day.
- **The Faith, the Citadel:** the High Septon's death in the riots (299), maesters' chains forged (flavour).

## 5. Openings for each playable house

Every playable house gets an **opening** in `data/briefs.js` (kept, expanded): situation (3 sentences), aims (3–4,
which seed the first ambitions), what canon will throw at them in the first moons (never shown literally — the council
hints at it), unique levers. Required for the houses below at release; every other house gets a template brief from its
region and rank.

| House | Situation (298-08) | Pressures to come | Levers |
|---|---|---|---|
| **Stark** | The King rides north; summer ends | the Hand's chain, the girls in the south, Bran's fall, the war | the North's loyalty, Moat Cailin, White Harbor's ships, the old gods |
| **Lannister** | the Crown in debt to you; Jaime at court; Tyrion wanders | Tyrion's seizure, the Riverlands war, Robb | coin, the debt, the West's quick muster, Gregor |
| **Baratheon (the Crown)** | Robert: bored, in debt, grieving Jon Arryn | the Hand, the hunt, his wife | the throne's authority; appointments; tourneys |
| **Baratheon of Dragonstone** | Stannis brooding; Melisandre at his side; he knows about the children | Robert's death, his claim | the royal fleet; the proof; the red god |
| **Baratheon of Storm's End** | Renly: master of laws, charming, ambitious | the succession | the Stormlands and (through Loras) the Reach |
| **Tyrell** | the Reach at peace; Mace wants to be the power behind a throne | a king to back | the largest host, the food of the realm, Olenna |
| **Martell** | Doran waits; Elia unavenged | a Lannister proposal (Myrcella), the war | the mountain passes, patience, Oberyn |
| **Arryn** | Lysa rules for a sickly boy of eight; she has fled to the Eyrie | Tyrion at her door | the Bloody Gate, the Vale's knights, Littlefinger's hold on Lysa |
| **Tully** | Hoster dying; Edmure rules in all but name; the Blackfish at the Gate | the Lannister invasion | many vassals, rivers, the Freys' crossing |
| **Greyjoy** | Balon brooding on 289; Theon a hostage at Winterfell | the ironborn rising | the Iron Fleet, the reaving, surprise |
| **Frey** | Walder, ninety, many heirs, many grudges | who will pay for the crossing | the Twins, many sons and grandsons, marriages |
| **Bolton** | Roose, patient; Ramsay a bastard at the Dreadfort | a war to profit from | leeches, secrets, the Dreadfort |
| **Manderly** | Wyman, fat and shrewd; White Harbor rich | the war, later vengeance | ships, silver, knights |
| **Night's Watch** | Jeor Mormont; too few men; Benjen about to range | the dead, the wildlings | the Wall, the rangers, Maester Aemon |
| **Targaryen** | Viserys and Daenerys in Pentos, guests of Illyrio | the Dothraki wedding | the blood, the eggs, Illyrio's plans |
| **Mormont** | Maege rules Bear Island; Jorah exiled | the war | fierce women, the bear, a small island |
| **Karstark / Umber** | loyal, proud, far | the war | numbers, honour |
| **Blackwood / Bracken** | an ancient feud on the Trident | the Riverlands burning | the feud, Raventree's weirwood / Stone Hedge's horses |
| **Tarly** | Randyll, the Reach's best commander | the Tyrells' king | Horn Hill, Heartsbane, discipline |
| **Redwyne** | Paxter, 200 ships, Arbor gold | the war at sea | the fleet, wine |
| **Hightower** | Leyton, Oldtown, the Citadel, the Bank | the war | wealth, knowledge, the Hightower's beacon |
| **Florent** | Alester; Selyse is Stannis's queen | Stannis's cause | a claim to the Reach's primacy |
| **Velaryon** | Monford (young), Driftmark's fleet | Stannis | ships |
| **Dayne** | Edric, a boy; Starfall; Dawn | Dorne's choices | the Sword of the Morning |
| **Free folk** (experimental) | Mance gathering the clans | the Wall | numbers, giants |

*Implemented (WP D5):* `public/data/briefs.js` — the 27 houses above by hand (situation, strengths, weaknesses, aims,
`levers`, and `hints`: what the council has heard in the 8th moon of 298, never what is to come), every other house from
`REGIONS` × `RANKS`. The begin screen and the chronicle's "Your situation" show the levers; the council's dossier
carries the hints until the year's end. `tests/briefs.test.js` (with a spoiler guard on the hints).

## 6. Matters (decisions)

A **Matter** is Pax Historia's "catalyst" here: a situation, 2–4 options with visible hints, and *answer in my own words*
(Interpreter). Options carry engine effects (`fx`, existing in `petitions.js`) and/or intents. Each has `days` to answer
and a `lapse` (silence is an answer). **The model may not invent Matters** (B-28); it may only *request* a template via
the Director or a Mind (`demand`, `propose` produce Matters from templates).

Catalogue (`data/matters.js`, from `petitions.js` + beats). Template ids with one-line gist:

- **Realm petitions** (existing kinds, kept): `border_quarrel`, `forbearance_plea`, `marriage_offer_child`, `accused_knight`,
  `hungry_smallfolk`, `outlaws_on_road`, `loan_request`, `rising`, `defiant_vassal`, `poaching_case`, `inheritance_dispute`,
  `bastard_claim`, `septon_complaint`, `maester_request_rookery`, `widow_petition`, `mill_rights`, `bridge_toll_dispute`,
  `deserter_caught` (the Watch's law), `stolen_cattle`, `murder_trial`, `ward_request`, `hostage_request`.
- **From other lords:** `proposal_alliance`, `proposal_marriage`, `proposal_trade`, `demand_submission`, `demand_release`,
  `demand_payment`, `demand_hostage`, `request_aid` (send men), `request_passage`, `summons_to_court`, `liege_call`
  (the banners, existing), `dues_demanded`, `invitation_feast`, `invitation_wedding`, `invitation_tourney`,
  `ransom_offer`, `terms_offered` (a siege), `peace_offered`, `defection_offer` (an enemy vassal wants to change sides).
- **From your own people:** `council_advice_war`, `steward_famine_warning`, `maester_winter_warning`,
  `spymaster_plot_found`, `captain_prisoner_escape`, `heir_wants_to_fight`, `daughter_refuses_match`, `wife_counsel`.
- **From canon beats:** `hand_offer`, `sansa_joffrey`, `jon_future`, `lady`, `catelyn_south`, `the_debt`, `protector`,
  `frey_terms`, `crown`, `jeyne`, `karstark`, `tyrions_trial`, `stannis_or_joffrey` (lords choosing sides), `renly_offer`
  (Renly asks for swords when Robert is dying), `the_iron_price` (Balon's call to the ironborn), `kingsmoot`.

Each template specifies: conditions, who asks, where (the pin), options with `fx` and hints, `days`, lapse, and the
facts it produces. Pins on the map (existing `pins.js`) show pending Matters as sealed letters.

*Implemented (WP D3):* `public/data/matters.js` — 62 templates (20 realm, 16 lords', 8 household, and the 18 raised where
they happen: the Director's opportunities, the vassals' call, rising and defiance, the peace offered, and the beats'
ten), with the Director's 26 hook matters (`hook:<id>`, `data/hooks.js`) 88 in all. The `decision` op refuses a matter
that names no template (B-28 closed). Templates of this list not yet written (`terms_offered` as a matter — a siege's
terms are a verb; `renly_offer`, `stannis_or_joffrey`, `the_iron_price`, `kingsmoot`, `jon_future`, `lady`, `the_debt`,
`frey_terms` beyond `twins`, `jeyne`, `karstark`, `tyrions_trial`) come with the beats that raise them.
`tests/matters.test.js` renders and resolves every one.

## 7. Hooks (the Director's catalogue)

`data/hooks.js`, ~80 entries, each `{ id, when(s), params: {types}, creates: [intents|facts|matters|parties], cooldown,
regions }`. Seed list (group, then ids):

- **Road & wilderness:** `hedge_knight_seeks_service`, `outlaw_band_forms`, `merchant_robbed`, `wolves_in_the_hills`,
  `bridge_washed_out`, `mountain_clans_raid`, `crannogmen_guides_offer`, `pilgrims_on_the_road`.
- **Court:** `a_bastard_claims_kin`, `a_lord_dies_heir_disputed`, `a_love_match_elopes`, `a_quarrel_at_a_feast`,
  `a_knight_insults_a_lord`, `a_septon_preaches`, `a_new_maester_arrives`, `a_singer_mocks_a_lord`,
  `a_ward_runs_away`, `a_widow_remarries`, `a_lord_takes_the_black`.
- **Economy:** `a_bumper_harvest`, `blight_in_the_fields`, `a_ship_wrecked`, `a_new_vein_of_silver`, `a_fair_at_{town}`,
  `grain_speculators`, `the_iron_bank_writes`, `a_toll_raised`, `smugglers_found`.
- **War & sea:** `ironborn_reavers_land`, `wildlings_cross_the_wall`, `sellsword_company_offers`, `deserters_turn_outlaw`,
  `a_castle_poorly_held`, `a_sally_rumoured`, `a_spy_caught`, `a_raven_intercepted`.
- **Faith & omen:** `a_red_priest_arrives`, `a_weirwood_weeps` (flavour only), `a_comet_sighting` (canon W7 only),
  `a_miracle_at_a_sept`, `a_holy_man_gathers_followers`.
- **Essos (as rumours):** `magisters_quarrel`, `a_khalasar_raids_the_free_cities`, `braavosi_ship_arrives`.

Hooks may not kill named characters, may not target canon-locked entities, and must be grounded in an existing
condition (a hook's `when` must reference state).

## 8. The narrator's style bible

Used by the Narrator ([04](04-ai-system.md) §6), Letters, Audiences.

### 8.1 Voice

- **Third person limited, past tense**, one POV per scene, a named person where the facts name one, or a plausible
  witness from the place (a stable boy at Winterfell, a Frey serving girl, a gold cloak at the Mud Gate).
- **Senses before summary.** Cold wax, wet wool, horse, woodsmoke, the smell of the tannery by the river.
- **People talk.** One or two lines of speech per scene, in character (use `data/demeanours.js` manners).
- **Specific names and places.** "Ser Wylis Manderly", "the Mud Gate", "the Kingsroad below the Neck".
- **Understatement and dry humour.** Courtesy as a weapon.
- **Ending on consequence,** not a moral: what it will cost, who noticed.

### 8.2 Forbidden

- Game words: morale, unrest, prosperity, levies figure, turn, day N (as a counter), player, engine, op, stat, meter,
  "the realm holds its breath" (overused), "a storm is brewing", "winds of change", "little did they know",
  "in a world where", "tapestry", "testament to", "a dance of", "echoed through the halls".
- Modern idiom and anachronistic technology.
- Numbers not in the facts; ranks/titles not in the data.
- Describing the player's feelings or deciding for the player.
- Prophecy-speak and foreshadowing of beats the player does not know.

### 8.3 Headlines

A herald's cry about a person: *"Lord Umber marches the banners south"*, *"The Kingslayer taken in the Whispering Wood"*,
*"A raven from Riverrun: Lord Hoster is failing"*. ≤ 70 characters. No generic titles ("The March", "Winds of War").

### 8.4 Examples (for the few-shot; different houses from the player's)

> **Headline:** Lord Tarly hangs the Dornish raiders at the Mander ford
> **Line:** Randyll Tarly caught three hundred raiders at the ford at dawn and hanged their captain from the mill.
> **Scene:** The mist had not lifted when the first of them came up out of the water, and Tarly's bowmen were waiting in
> the reeds where they had lain two nights. Afterwards the miller's boy counted the horses. "Forty-one," he told his
> father, who told him to stop counting and fetch the rope. Lord Tarly did not stay to watch; he never did.

### 8.5 Content maturity

Setting *Mature content*: **Book** (default) — violence and cruelty as in the books, told without relish; sexual content
alluded to, never described; **never** any sexual content involving minors in any setting; torture off-screen.
**Restrained** — violence summarised. The prompts carry the chosen paragraph. The validator rejects explicit sexual
description in any setting.

*Implemented (WP D7):* `public/data/style.js` — `VOICE`, `FORBIDDEN` (the §8.2 words and a few more tired ones),
`HEADLINE`, four few-shot `EXAMPLES` (Tarly, Frey, Manderly, Greyjoy; the narrator is shown one of another house than the
player's) and `MATURITY` (Book / Restrained, chosen on the begin screen, carried by the narrator's instructions and every
prompt's settings). The narration, audience, letter, council and memory validators read the same words.
`tests/style.test.js`.

## 9. Anachronism guard

`data/anachronisms.js`: phrases the narrator/audience/letter validators reject **unless** the named fact has happened:

| Phrase | Allowed after |
|---|---|
| "golden hand", "one-handed Jaime", "the Kingslayer's stump" | Jaime loses his hand (not in 298) |
| "King in the North", "the Young Wolf" (as a king), "King Robb" | W6 |
| "Red Wedding", "the Twins' treachery" | W18 |
| "Purple Wedding" | W20 |
| "Mother of Dragons", "Stormborn" as queen, "the dragon queen" | D5 |
| "Khaleesi" | D1 |
| "the Blackwater", "wildfire on the bay" | W13 |
| "Lord Commander Snow" | N7 |
| "Queen Margaery" | a wedding to a king |
| "the Imp's trial", "the Viper's death" | W20/W21 |
| "Lord of Harrenhal Baelish" | the grant |
| "Reek" | W14+ |
| "Hodor" as a name | fine (he is Hodor already) |
| "the Hound's desertion" | W13 |
| "Robert's death", "the late King Robert" | H1 |

Plus a general guard in every narration prompt: "Only what has happened by today has happened."

> *Implemented in WP B8*: `data/anachronisms.js` (`anachronismsIn(state, text)`), each phrase allowed once this game has
> reached it — the beat in the story's log, a title held, a death, a battle fought. *WP D7* added the D2 beats' phrases
> (Queen Jeyne, King Balon, the sack of Winterfell, the Fist, the Old Bear's death, the Breaker of Chains, Lord Tywin's
> and Balon's deaths, the red comet) and ties Reek to `ironborn.winterfell_burns`. Added: "King Joffrey" before Joffrey is king, "the War of the Five Kings"
> before there are kings to count. The narrator's validator reads it; the audience and letter validators will (B10).

## 10. Threads the player follows

Kept from the current feed ("Threads to follow"): up to 8 open threads per player, each a title + latest line, built
from **facts** (grouped by thread id and cause chains) and the Consolidator's "Still open" list — not from free model
output. Canon threads are never listed until their first beat has happened.
