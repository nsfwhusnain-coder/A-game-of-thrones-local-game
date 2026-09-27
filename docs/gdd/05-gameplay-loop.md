# 05 · The gameplay loop, time and pacing

> How a turn feels from the player's side: planning, the jump, playback, interrupts, the summary, difficulty, canon
> gravity, endings, onboarding. UI layouts for everything named here are in [12-ui-ux.md](12-ui-ux.md).

---

## 1. The loop

```
 ┌──────────── PLANNING (time frozen) ────────────┐      ┌──────── JUMP ────────┐     ┌──── PLAYBACK ────┐
 │ read the chronicle · look at the map            │      │ choose how far       │     │ day counter runs  │
 │ write commands (receipts appear)                │ ───► │ (default: until      │ ──► │ map changes on the│
 │ hold audiences / write letters / hold council   │      │ something happens)   │     │ day facts happen  │
 │ answer matters (sealed letters on the map)      │      │ the realm decides    │     │ cards appear      │
 │ direct actions from cards (march here, raise…)  │      │ (minds, engine)      │     │ pause/skip/stop   │
 └─────────────────────────────────────────────────┘      └──────────────────────┘     └────────┬─────────┘
            ▲                                                                                     │
            └──────────────────────────── TURN SUMMARY ("What changed") ◄─────────────────────────┘
```

A **turn** is one planning phase plus one jump. Turns have no fixed length.

## 2. Planning: everything the player can do without time passing

| Action | Where | Model? | Result |
|---|---|---|---|
| **Command** (free text) | Command composer, bottom-left | Interpreter (≤ 5 s), often not needed | intents + receipt under the order |
| **Counsel ideas** | ✦ in the composer | 1 call | 4–6 suggested commands, pre-interpreted |
| **Polish** | ✎ on a draft | 1 call | a clearer command (diff; accept/reject) |
| **Direct action** | buttons on host/holding/person cards; right-click on the map | no | intents + receipt instantly |
| **Audience** (same place) | click a person → *Speak*; or Audience composer | Audience | a scene; possibly commitments |
| **Letter** (elsewhere) | same composer, automatically a letter | none now; reply generated when it arrives | a letter in flight with ETA |
| **Council** | ruler portrait, bottom-right | Council/Advisor | speeches or a briefing |
| **Answer a matter** | sealed-letter pin or the Matters list | none (options) / Interpreter (own words) | effects + intents |
| **Ledger** | the Book (L) | no | realm, hosts, coin, vassals, people, knowledge |
| **Undo** | menu | no | restore a snapshot (not in ironman) |

Rules:

- A command may name several things; the receipt lists each.
- Commands are **drafts** until the jump; the player can edit or delete them; receipts refresh.
- Direct actions and commands produce the same intents (one verb registry, [03](03-architecture.md) §7). A player who
  never types can play entirely with cards; a player who never clicks can play entirely by typing.
- The number of commands is not limited, but receipts warn when orders conflict ("Robb cannot both hold Moat Cailin and
  ride to Riverrun").

## 3. The jump

The jump button (top-right) has a primary action and a menu:

| Option | Days | Notes |
|---|---|---|
| **Until something happens** (default) | stops at the first interrupt, max 30 | Pax Historia's "next major event" |
| One week | 7 | ignores minor interrupts, stops for major ones (§4) |
| A fortnight | 14 | |
| A moon | 30 | |
| Three moons | 90 | only offered at peace (no war involving the player, no host of the player's in the field); runs in 7-day segments with minds each segment |

Keyboard: **Space** = jump with the current option; **Shift+Space** = open the menu.

## 4. Interrupts

An interrupt ends an *Until* jump at the end of the day it fires. **Major** interrupts also end fixed-length jumps early
(the player chose "a moon" but an enemy host appeared at their border on day 4: the jump stops on day 4 with a reason).

| Interrupt | Class | Condition |
|---|---|---|
| A matter arrives for the player | major | a Matter is created (a decision the realm demands) |
| A matter is about to lapse | major | a pending matter has ≤ 2 days left |
| Enemy host sighted | major | a host of a house at war with the player (or with a hostile stance, relation ≤ −50) enters `sight` of the player's holdings or hosts (09 §7.2) |
| Battle involving the player | major | a battle fact with the player's house |
| Siege of the player's holding | major | begun, stormed, fallen, lifted |
| Death, capture, birth in the player's family | major | fact with a player-family actor |
| A letter to the player lord arrives | minor | letter delivered (letters from the liege or a king are major) |
| The player's party/host arrives | minor | any `arrived` fact for a party the player ordered |
| Works finished | minor | |
| A commitment to the player is kept or broken | major if broken | |
| A canon beat that names the player's house | major | (the King at the gates, the Hand's chain) — the reason text never names the beat |
| Season turns | major | white raven |

The top bar shows the **reason the jump stopped** in the world's words: *"Stopped: a raven from Riverrun"*, *"Stopped:
Lannister outriders sighted near the Golden Tooth"*. It never shows what is coming (fixes the spoiler B-18).

## 5. Playback

- The client receives segments as the server finishes them ([03](03-architecture.md) §10). Playback starts as soon as the
  first segment arrives.
- A **day counter** (in the date bar) advances at ~1.2 s per quiet day, slowing to hold on days with events.
- Parties move along their real paths in step with the days. Facts change the map **on their day**: a host appears at a
  castle the day it arrives, borders recolour the day a holding falls, a siege ring appears the day it begins, a raven
  flies the day a letter is sent and lands on its arrival day.
- Each event card appears in the chronicle when its day comes. For importance ≥ 3, the camera eases to the place
  (≈ 1.1 s), the card expands, holds (3–5 s by length), then collapses. Importance ≤ 2 appear without a camera move.
- Controls: **Pause** (P), **Next** (→), **Skip to end** (S), **Stop here** (intervene).
- **Stop here** ends the turn at the current day: the server re-simulates from the snapshot to that day with the
  recorded intents (deterministic, [03](03-architecture.md) §1.6) and discards later facts. The player can then act on
  what they just saw. (Pax Historia's *Intervene*.)
- Voices (optional): the narrator reads the headline and scene of importance ≥ 4 events.

## 6. The turn summary ("What changed")

When playback ends, a compact panel (collapsible, top of the chronicle) shows at most 5 engine-written lines:

```
What changed — 3rd to 9th day of the 9th moon
• The banners are marching to Moat Cailin: 10,500 men will be joined in ~4 days.
• Coin: 63,900 dragons (−2,100 this week: the host eats).        [ledger ›]
• Lord Bolton promised his men at Moat Cailin within the fortnight.
• A raven from Riverrun waits unread.
• Stopped: the King's progress is two days from Winterfell.
```

Lines are chosen by rule: (1) the jump's stop reason, (2) the largest change to the player's forces, (3) coin if it moved
> 5 % or the war chest fell below 3 moons, (4) new/broken commitments, (5) unread letters/pending matters.

## 7. Difficulty

Five levels (Pax Historia's names). Each sets the prompt paragraph in [04](04-ai-system.md) §12 **and** engine
multipliers in `data/balance.js`:

| Key | Very easy | Easy | Normal | Hard | Impossible |
|---|---|---|---|---|---|
| Vassal temper bias | +15 | +7 | 0 | −7 | −15 |
| NPC relation drift toward the player / moon | +2 | +1 | 0 | −1 | −2 |
| Player battle odds multiplier | 1.25 | 1.1 | 1.0 | 0.92 | 0.85 |
| Player income multiplier | 1.3 | 1.15 | 1.0 | 0.9 | 0.8 |
| Treachery/scheme rate vs the player | 0.4 | 0.7 | 1.0 | 1.3 | 1.7 |
| Mind aggression toward the player | 0.6 | 0.8 | 1.0 | 1.25 | 1.5 |
| Commitment sincerity toward the player | +0.15 | +0.07 | 0 | −0.07 | −0.15 |

Difficulty can be changed at any time except in ironman.

## 8. Canon gravity (owner decision: adjustable, default Canon)

| Setting | Canon beats | Minds | Canon locks |
|---|---|---|---|
| **Canon** (default) | Fire in their windows when their preconditions hold; the player's house gets decisions where the beat touches it; if a precondition fails the beat **adapts** (its alternates, [10](10-narrative-events.md) §3) or lapses | The canon agenda of each character is weighted +30 in salience and appears as the hint line | On |
| **Loose** | Only beats marked `pillar: true` (Bran's fall, Robert's death, the war's outbreak, the dragons) are pushed; others become *possible* hooks for the Director | Natures and goals from the books, no pushing | Only for pillar beats |
| **Sandbox** | None, beyond the starting situation | Natures and goals only | Off |

Chosen at game start (title screen → *House* → *How closely the world keeps to the chronicles*), changeable later
(a warning explains the consequences; not in ironman).

## 9. Ironman, undo and saves

- **Ironman:** autosave every turn, no undo, difficulty and canon gravity locked. Marked on the save.
- **Undo:** up to 10 turns back (snapshots). A confirmation modal states what will be lost.
- **Saves:** one per campaign plus manual "Save as" copies. The title screen lists campaigns with house, ruler portrait,
  date, turn, standing.

## 10. Winning, losing and ambitions

Kept from `shared/standing.js` and extended.

### 10.1 Standing

Six engine measures, 0–100 (lands, swords, gold, sway, blood, good order) and a score, shown in the Ledger. Fix the
current oddity (a new Stark game shows sway 100, blood 100, order 95 but lands 8): normalise each measure against the
**house's own starting value** (starting position = 50) so the score reads "better or worse than when you began", with
the absolute realm rank shown separately ("4th of the great houses").

### 10.2 Ambitions (new)

The player may pick **one ambition** at a time from 3 offered (derived from the house's canon agendas in
`data/agendas.js` and its situation). Each has an engine-checkable goal, a deadline in moons (or none), and a reward
(prestige/standing, a relation, a unique title). Examples:

| House | Ambition | Check |
|---|---|---|
| Stark | *Bring the girls home* | Sansa and Arya alive, free and at a Stark holding |
| Stark | *Justice for Jon Arryn* | the Lannister incest secret revealed to ≥ 3 great houses |
| Lannister | *A Lannister on every seat of power* | Hand, Master of Coin and Lord Commander held by house members |
| Tyrell | *Margaery a queen* | Margaery wed to a crowned king |
| Frey | *The Freys respected* | a Frey marriage into three great houses |
| Greyjoy | *The Old Way* | independent crown + 3 holdings on the mainland held 6 moons |
| Night's Watch | *Man the Wall* | 3 more castles garrisoned; 2,000 sworn brothers |
| Lesser house | *Rise* | granted a new holding, or the house wed into a paramount's line |

### 10.3 Endings

Existing: extinction, ruin, the Iron Throne, a crown of one's own. Add: **attainder** (the house's titles stripped; play
on as a landless claimant or the Watch), **the Wall** (the ruler takes the black; continue as the Watch or as the heir),
**exile** (flight across the narrow sea with coin and name), **the long night** (only if the Others arrive — out of
scope for 298–300 unless the player's campaign runs long; keep the hook). The end screen offers *play on*, *undo*, *new
house*, and shows the chronicle's verdict (a Consolidator call over the whole chronicle, ≤ 150 words).

## 11. Playing unusual houses

| House kind | Differences |
|---|---|
| **A vassal** (most lesser houses) | Has a liege who calls its banners (a matter), expects dues, and may summon the lord to court. Defiance is possible and costly ([08](08-characters-politics.md) §10). |
| **The Crown** (Baratheon of King's Landing) | The player is Robert (or whoever holds the throne). The small council is the council; every great house is a vassal; the Crown's debt matters from day one. |
| **Night's Watch** | No lands to tax; income is alms and the Gift; recruits come from the realm's prisons (a steady trickle of men, [07](07-military.md) §11); the Watch takes no part in the realm's wars (a refusal receipt explains). Threats: wildlings, the cold, the Others (beats). |
| **Targaryen exiles** (Viserys/Daenerys in Pentos) | No lands, no levies; everything is persuasion, patronage (Illyrio), and later the khalasar and the dragons (beats). |
| **The free folk** (Mance Rayder) | A host of clans, not a feudal realm; unity is a meter the engine tracks; the Wall is the goal. |
| **Free Cities / Braavos** | Playable later; not a design target for 298. Mark as *experimental*. |

## 12. Onboarding

- **First turn guide:** five dismissible hints, each shown once when its situation first arises: (1) the composer ("Tell
  your house what to do, in your own words"), (2) the receipt ("✓ means it will happen; ⚠ is a warning; ✗ explains why
  not"), (3) the jump ("Time runs until something needs you"), (4) a matter pin ("The realm wants an answer"),
  (5) a host card ("Click your host to march it").
- **The Book → *How the game is played*** (existing help page, rewritten to match this GDD).
- **Tone:** hints are written in the world's voice where possible ("Your maester suggests…").

## 13. Pacing targets

| Measure | Target |
|---|---|
| Time from pressing Jump to the first card | ≤ 20 s (segment 1 narrated first) |
| Typical 7-day jump total | 30–45 s |
| Playback of a 7-day jump at normal speed | 40–70 s (the next segment simulates meanwhile) |
| Receipt for a typed command | ≤ 5 s (≤ 0.5 s when the pre-parser handles it) |
| Audience reply | ≤ 12 s (first beat streamed ≤ 4 s) |
| Game days per hour of play (typical) | 60–120 (2–4 moons) |
