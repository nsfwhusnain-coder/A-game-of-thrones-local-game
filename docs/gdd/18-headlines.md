# 18 · Headlines: every event told in a title and a few plain sentences

> Owner feedback (2026-09-29): *the way events are summarised isn't helpful.* Pax Historia does it well: each event has
> a concise **title that alone tells you what happened** ("Robb Stark slain by Tywin Lannister at the Battle of the
> Green Fork") and, under it, a **short summary of exactly what happened** ("Robb charged foolishly into the Lannister
> centre…"): concise, plain words, no jargon, no canned boilerplate. This document audits why ours does not read that
> way, designs the target, and breaks it into work packages N1–N10. It refines [04](04-ai-system.md) §6 (the narrator),
> [10](10-narrative-events.md) §8 (the voice) and [12](12-ui-ux.md) §6 (the chronicle panel). Pax Historia is the only
> reference game. Nothing here lets a model change state: the engine's facts are the history; words are a view of them.

---

## 1. Audit: how a turn's events reach the player today

All of this was read in the code and run: `WC_PROVIDER=mock`, Stark, seed 7, `game.advance(id, {span:'auto'})` for six
turns, printing `turn.events`, `turn.summary`, `turn.narration` and the fact log (362 facts in six turns).

### 1.1 The pipeline

| Stage | Where | What it does |
|---|---|---|
| Fact | `public/js/engine/facts/log.js` `emit()`; kinds in `engine/facts/kinds.js` (126 kinds) | `{id, kind, actors[], houses[], place, data, importance 1–5, title?, text}`. **`text` is a full engine sentence** written by whichever subsystem emitted it, or by the kind's template in `KINDS[kind].text`. Only some facts carry a `title`. |
| Engine card | `server/turn/day.js` (`tick` → `cards`), `shared/world.js` (`note(...)`), `server/game.js` ~L360–441 | Each fact becomes a card `{title, text, details, importance, type, where, houses, day, fact}`. Many titles are the fact text itself (`title: 'House Bolton begins works at The Dreadfort: charter a market & fair.'`). Cards with `bg:true` are "Meanwhile" fodder. |
| Cluster | `engine/facts/cluster.js` `clusterFacts()` (union–find on thread, party, cause, place ≤ 2 days) | At most `MAX_STORIES = 8` stories per turn; importance-1 facts leave for "Meanwhile"; stories beyond 8 are silently dropped from the narrator's input (`rest`). |
| Narrator | `server/narrator.js` `narrateTurn()` → `server/ai/calls/narrate.js` (`context`, `schema`, `mock`, `fallback`, `plainEvent`, `herald`) | One model call for the turn. Schema per story: `headline str(70)`, `line str(200)`, `scene str(900)`, `pov str(50)`; plus one `meanwhile str(300)`. |
| Validator | `server/ai/validate/narration.js` `checkEvent()` | Rules: names, arrival, numbers, places, anachronism, game words (`FORBIDDEN`, `FORBIDDEN_EXACT` in `public/data/style.js`), script, maturity. **No rule looks at the headline as a headline** (length in words, subject–verb–object, boilerplate, digits). |
| Fallback | `narrate.js` `fallback: () => ({events: [], plain: true})`; `narrator.js` keeps the engine's own cards | If the model fails twice, the engine's sentences stand, untouched. On the mock, `plainEvent()` *is* the telling: `headline = herald(top.title \|\| firstSentence(top.text))`, `line = clip(top.text, 200)`, `scene = clip(all fact texts joined, 900)`. |
| Turn record | `server/game.js` ~L431–466: `events` (sorted, ids `turn-k`, dated), `summary` = first 4 narrated `text`s + first `meanwhile`, joined and cut with `…`; `record.narration` (stories/told/again/plain/problems) | Saved in `saves/<id>/turns/NNNNNN.json`; `state.history` keeps recent turns; `chronicle.md` gets `title — text` for importance-5. |
| Feed / cards | `public/js/ui/drawer.js` `eventHtml` (L26): art, `.et` title, `.eb` text, `<details class="ev-more">More</details>` with `details`, meta line `date · type · place` | Every surface shows `title` + `text` + `details` and nothing else; there is no importance treatment beyond a CSS class `imp-N`. |
| Turn-end / jump | `public/js/app.js` ~L362–535 (`bf-seg`, `bf-t` = title only, `bf-mw` = meanwhile), the "what changed" block | Titles alone are listed; `seg.events.filter(!bg).slice(0, 8)`. |
| Chronicle & world log | `app.js` `showChronicle` (L549: the long-memory markdown), the World log tab (L559), `windows.js` L318 ("Whispers & intrigue") | Raw `title`/`text` again. |
| Pins | `public/js/shared/pins.js` `openPins()` / `pinworthy()` (importance ≥ 2 with a `where`; bg only if `mine`); battle pins built from `s.battles[i]` with `title: b.name`, `text: b.summary` (`"${W} defeated ${L}."`, `shared/battles.js` L70); window `public/js/ui/pins.js` | Shows `title`, `text`, `details`, meta. Pins expire after `NEWS_TURNS = 2`. |

### 1.2 Why it reads badly (root causes, each seen in the runs)

1. **The unit of text is the engine sentence, not the story.** Subsystems write log lines for the *ledger* ("`Host of House
   Karstark, 1,796 strong, sets out from Karhold for Winterfell (~48 days).`"). The same string is then reused as the
   headline, the summary and the details, so the three layers repeat each other (every narrated card in the run has
   `details === text` or `details = text + more engine lines`).
2. **Title = lead fact's first sentence.** `herald()` takes the heaviest fact's title or first sentence (≤ 70 chars),
   else cuts at the first `:`/`;`/`—`. A 21-fact muster story got the title *"Host of House Umber (150 men) is raised at
   Last Hearth"* because that fact came first among ties. No slot says who the story is *about*.
3. **Jargon and boilerplate live in the templates.** "N strong", "calls up 9,977 levies", "(~48 days)", "is raised at",
   "begins works at … : charter a market & fair.", "The host now numbers 896", "answers the call with 2,000 men",
   "leaves X with 30 knights and riders under the Swann banner, to feast with…". The validator's `FORBIDDEN` list catches
   game words in *model* output but is never applied to engine text, which is most of what the player reads.
4. **Numbers dumps.** Exact men, days, dragons in every line; nothing rounds them to words or moves them into a
   collapsed detail.
5. **Name defects from raw data.** "House The Free Folk calls up 45,000 levies at Mance Rayder's host", "House Baratheon of
   King's Landing holds a tourney", "The Banners of Stark", "Host of House Umber" (a party name is not a person).
6. **Same-kind facts are separate cards.** Turn 2: three cards "Host of House {Karstark, Umber, Manderly} sets out";
   turn 3: five more ("Locke", "Wull", "Dustin", "Ryswell", "Flint"). Nothing rolls them up into one story
   ("Six northern houses march for Winterfell"), and the cap of 8 stories leaves the rest as raw engine cards.
7. **The opposite failure in the same turn:** one story holds 21 facts (all the muster) and is told by one headline.
8. **Truncation mid-sentence.** `turn.summary` is the first four `text`s clipped: "*Men say he means to…*"; the
   Meanwhile line is 8 facts cut with `…` ("*to pay his respects to Mace Tyrell at King's Landing…*"). `clip()` adds "…" to
   engine text that was never meant to be cut.
9. **The mock and the fallback produce the same bad text**, so CI never sees the problem: `bench/narrate-mock-*.md` scores
   *truth* (validator pass ≥ 98 %) and not *readability*.
10. **No importance ranking on the player's side.** `importance` is a number on a CSS class; the feed is chronological,
    a tourney at the Eyrie (importance 5) and a fishing shoal are the same weight. Pins ignore whether the news is about
    the player.
11. **Deaths, battles and captures have no named subject/agent.** `KINDS.battle` = "House A and House B meet in battle
    near P; the field is House W's." `slain_in_battle` = "Robb Stark is slain — {cause}." (the killer and the place are
    not slots; `data.cause` is free text). A headline like "Robb Stark slain by Tywin Lannister at the Green Fork" cannot
    be built from the fact, by us or by a model that is forbidden to invent.

### 1.3 Before: real output (mock provider, Stark, seed 7)

| # | Turn | Card title (what the player reads first) | Card text / details |
|---|---|---|---|
| B1 | 1 | *Host of House Umber (150 men) is raised at Last Hearth* — story of **21 facts** (the whole muster) | text: same sentence; details: 3 more engine sentences, `answers the call with 2,000 men … in about 12 days` |
| B2 | 1 | *House Stark calls its banners* | text and details identical: "House Stark calls its banners: 19 sworn houses are summoned to Winterfell." |
| B3 | 1 | *The King rides north* | "…bound for Winterfell. Men say he means to…" (cut by `clip`) |
| B4 | 2 | *House Arryn calls up 9,977 levies at The Eyrie* | the same string; nothing says why or against whom |
| B5 | 2 | *Host of House Karstark sets out* / *…Umber sets out* / *…Manderly sets out* (three cards) | "Host of House Karstark, 1,796 strong, sets out from Karhold for Winterfell (~48 days)." |
| B6 | 3 | *House The Free Folk calls up 45,000 levies at Mance Rayder's host* | wrong name form + number dump |
| B7 | 3 | *House Bolton begins works at The Dreadfort: charter a market & fair.* | a ledger line used as a headline |
| B8 | 4 | *House Arryn holds a tourney at The Eyrie; 16 houses send knights* (importance 5) | the champion (Ser Rodrik Cassel) is in the *details*, not the title |
| B9 | 6 | *House Tallhart joins The Banners of Stark* | "499 men under the Tallhart banner join The Banners of Stark at Winterfell. The host now numbers 896." |
| B10 | 1 | Turn summary: "…Men say he means to… Donella Hornwood refuses the summons. Her men will stay at home. Host of House Umber (150 men) is raised at Last Hearth. Elsewhere: Dickon Swann leaves Stonehelm with 30 knights and riders under the Swann banner, to feast with Sharna Fell at Felwood; …" | five ideas in one paragraph, no order of importance |
| B11 | 3 | Meanwhile: "Elsewhere: Alester Florent leaves Brightwater Keep with 110 knights and riders under the Florent banner, to pay his respects to Mace Tyrell at Highgarden; Mace Tyrell leaves Highgarden with 160 knights …" | eight near-identical journeys |
| B12 | any | Battle template, `KINDS.battle` | "House Lannister and House Stark meet in battle near The Twins; the field is House Lannister's." — no man, no loss, no deed |
| B13 | any | Death template, `theYears` in `server/turn/day.js` | title "Rickard Karstark is dead"; text "Rickard Karstark, Lord of Karhold, has died of old age, aged 61." |

---

## 2. Target: the event card

### 2.1 Shape (additive: `title` and `text` stay as aliases so old saves and the map keep working)

```js
Card = {
  id: '12-3',                 // turn-index, as now
  headline: 'Robb Stark slain by Tywin Lannister at the Green Fork',   // = title
  summary:  'Robb led the charge into the Lannister centre and was cut down before the reserve could reach him.',  // = text
  details:  [ 'Stark losses about 2,100; Lannister about 900.', 'Fought on the 3rd day of the 6th moon.' ],  // collapsed; numbers live HERE
  scene:    '…optional 2–5 sentence scene (importance ≥ 4 only)…',       // the old `scene`, off by default in the feed
  importance: 5, tier: 'great',   // great 5 · major 4 · news 3 · minor 2 · meanwhile 1
  score: 7.5,                     // ranking (§2.5)
  kind: 'battle', type: 'war', who: ['robb_stark','tywin_lannister'], where: 'green_fork', houses: [...], day: 3,
  facts: ['f12.4','f12.5'], record: [...engine lines...],   // unchanged: the numbers are one click from the prose
  told: 'model' | 'writer',       // who wrote the words (the deterministic writer, §3.1, or the narrator)
  mine: true, order: 4
}
```

### 2.2 Headline rules (H1–H10; enforced by the scorer in N1 and the validator in N5)

1. **H1** at most 12 words and 80 characters; one clause; ends without a full stop.
2. **H2** a news headline: subject–verb–object in the present (*"Jon Snow reaches Castle Black"*, *"Lady Hornwood refuses
   Stark's summons"*), or a bare passive participle when the patient is the news (*"Robb Stark slain by Tywin
   Lannister"*, taken, crowned). The summary under it is in the simple past. (Corrected: this said "past, always"; see
   `DECISIONS.md#D-058`. §4's own examples were always in the present.)
3. **H3** it names **who** (a person, or a house only if no person is the subject) and **where** (a place, when the story
   has one) — from the story's own facts.
4. **H4** it names nothing that is not in the story (the validator's `names`/`places` rules extended to headlines).
5. **H5** at most one number, only if the story gives it, and only as a word or round figure ("thousands", "three
   hundred"); no `(~12 days)`, no `strong`, no `men`-counts to the digit.
6. **H6** no parentheses, colon, semicolon, em dash, ellipsis.
7. **H7** none of `FORBIDDEN` plus the **boilerplate list** (new, `style.js` `BOILERPLATE`, with the ledger's nouns in
   `JARGON`): `is raised at`, `sets out from`, `answers the call with`, `begins works at`, `calls up N levies`, `strong`,
   `the host now numbers`, `House The`, `Banners of` (but "the banners of the North" is English), `importance`, `op`,
   `fact`, `story`. *Implemented in N1 (Slice 1); the lists as built are in `public/data/style.js`.* `rides for` was on
   this list and is not: "King Robert rides for Winterfell" is a good headline ([20](20-pax-reference.md) §5.2 row 16),
   and the ledger's own line is "knights and riders under the … banner" (`DECISIONS.md#D-060`).
8. **H8** the outcome is never reversed: the killer is not the victim, the victor not the vanquished (role check per kind, §3.3).
9. **H9** different stories get different headlines; ≥ 70 % of a turn's headlines have a distinct main verb.
10. **H10** after nothing later than 298 AC: `data/anachronisms.js`, as now.

### 2.3 Summary rules (S1–S6)

1. **S1** one to three sentences, at most 320 characters, plain words a stranger would understand; the first sentence
   says what happened, the second *how or why* (from `data.how`/`why`/`cause`), the third (optional) what it changes.
2. **S2** does not repeat the headline (word overlap < 80 %); never ends in `…`; never cut mid-sentence (build short, do
   not clip long).
3. **S3** the numbers of the ledger are rounded to words ("about two thousand"); exact figures go into `details`.
4. **S4** no game words, no "the host", "the levy", "the muster" as nouns with a number after them.
5. **S5** the player's house is written in the third person, like any other. Nothing about what its lord feels.
6. **S6** the same knowledge rules as everything else: only what the player's house may read (`fact.vis`; [03](03-architecture.md) §9).

### 2.4 Clustering: one card per story, not per fact

*Implemented in N4 (Slice 4), as built in DECISIONS D-072: `public/js/engine/facts/cluster.js`, `tests/clusters.test.js`.*

Stories are formed as now (`cluster.js`), then **shaped**:

| Rule | Effect |
|---|---|
| **C1 Archetype.** Every story is one of `muster`, `march`, `battle`, `siege`, `death`, `capture`, `court`, `wedding`, `letter`, `plot`, `omen`, `works`, `harvest`, `feast`, `other` from its lead kind. | The headline template and the digest group by archetype. |
| **C2 Roll-up.** ≥ 3 facts of the same kind with the same cause or thread and importance ≤ 3 (five hosts leaving for Winterfell, six houses' journeys) become **one** card whose headline counts the leaders: *"Six northern houses ride for Winterfell"*, `details` lists each house with its men and days. | Fixes B5, B9, B11. |
| **C3 Split.** A story of > 6 facts whose facts fall into ≥ 2 archetypes or ≥ 2 places is split at the archetype/place boundary (a muster with a refusal in it is two stories: the muster, and the refusal). | Fixes B1. |
| **C4 Headline fact.** The story's **lead** is chosen by `importance`, then by a per-kind `lede` rank (a death beats an arrival; a refusal beats an answer; the *result* beats its *cause*), never by list order. | Fixes B1. |
| **C5 Same-day, same-place, same-people** facts merge into the story of the heaviest (a battle, its captives and its dead are one card; the pursuit next day is another). | |
| **C6 No cap that hides news.** The cap moves from "8 stories then raw cards" to **tiers** (§2.5): every story gets a card; the model tells only the top 6 (importance ≥ 3), the deterministic writer (§3.1) tells all the rest. | Fixes the 8-story cliff (root cause 6). |
| **C7 Meanwhile** = importance-1 facts and rolled-up minor journeys, told as **one** sentence by the writer ("Lords ride to feasts and hunts across the Reach; a Pentoshi galley is wrecked off Widow's Watch."), never eight clipped clauses. | Fixes B11. |

### 2.5 Importance, ranking and the digest

*Implemented in N9 and N6 (Slice 5), as built in D-075 and D-076: `engine/facts/rank.js`, `engine/facts/digest.js`, the tiers, the digest of at most ninety words, `state.firsts`.*

`importance` (1–5) stays what the engine says (`weigh()` in `log.js`: +1 own house/kin, +1 great lord). The **score** ranks
what the *player* sees:

```
score = importance
      + 1.0  if the player's house, kin or a person the lord has met is an actor        (mine)
      + 0.5  if it happened at a holding the player owns or in a region their hosts stand in
      + 1.0  if it is the first of its kind this chronicle (first battle, first death of a lord, first raven from X)
      + 0.5  if it changes a standing thing (a holding fell, an office changed, war/peace)
      − 1.0  per earlier card of the same archetype this turn beyond the second (fatigue)
```

Tiers: `great` ≥ 6.5 (top of the feed, pin, toast, on the map), `major` 5–6.4, `news` 3.5–4.9, `minor` 2–3.4 (feed: headline
only, no summary until opened), `meanwhile` < 2 (one sentence).

**The digest** (the turn-end summary): "**The week**" — the top three cards by score as *headline + first sentence of the
summary*, then "**Also**" — up to five more as headlines only, then the Meanwhile sentence. ≤ 90 words in all; it is what
replaces `turn.summary`. It is assembled by the engine from cards (no model), so it can never contradict them.

### 2.6 Where cards show

| Surface | What it shows | Change |
|---|---|---|
| **Feed** (chronicle panel; `drawer.js eventHtml`) | Sorted by day, then score. Headline (Cinzel 16–18 px), one-line meta (date · place · crests), summary (2 lines, tier ≥ news), chevron "Details" (numbers, record, scene). Tier `great`/`major` get the art and a rule; `minor` is one line. Filters as [12](12-ui-ux.md) §6 plus **Only what matters** (tier ≥ news, default on). | rewrite of `eventHtml` |
| **Pins on the map** (`shared/pins.js`, `ui/pins.js`) | Pin exists for tier ≥ news with a `where`, and for `mine` minor. The pin **label on hover is the headline**; the pin window is the full card. Battle pins get the writer's headline ("Stark host beaten by Lannisters at the Green Fork"), not `b.name` + `"X defeated Y."`. | `pinworthy` uses `tier`; battle pins built by the writer |
| **Turn-end summary** (`app.js` ~L503–535, the jump feed `bf-t`) | The digest of §2.5, as a card stack: 3 large, 5 one-liners, the Meanwhile line. During a multi-week jump, each segment prints its top headline, not "title only" of every card. | `bf-t` shows `headline`; digest block |
| **Toast** | Tier `great` only: the headline, click flies the map there. | small |
| **Chronicle window / World log / chronicle.md** | `headline — summary` (no more `title — text` engine sentences); the World log keeps every card, grouped by day. | text swap |
| **The council/Book** | May quote a headline; never needs the model. | none |

---

## 3. How the words are made

The order of authority stays as in [04](04-ai-system.md): **facts → (writer) → card**, the narrator only *rewrites* what the
writer has already written and the validator holds it to the same facts. If the model is off, slow or wrong, the player
still reads a good card, because the deterministic writer is the floor and not an afterthought.

### 3.1 The deterministic writer (`public/js/engine/facts/headline.js`, new; pure, no I/O, used by server and client)

*Implemented in N3 (Slice 4), as built in DECISIONS D-073: `public/js/engine/facts/heads.js`, `headline.js` (`cardOf`, `meanwhileOf`), `tests/writer.test.js`. Not yet called by the narrator: N5.*

`cardOf(state, story) → { headline, summary, details[], kind, who[], where }`

* A per-kind **lede table** (`engine/facts/heads.js`, new, beside `kinds.js`): for each of the 126 kinds, a `head(f, s)` and a
  `sum(f, s)` that build the sentence from the fact's **slots** (`actors`, `data`, `place`), not from `f.text`. Examples:
  `slain_in_battle: (f,s) => \`${nm(victim)} slain${by ? ' by ' + nm(by) : ''}${at}\``,
  `call_answered: … \`${short(house)} answers Stark's call\``, `levies_called: \`${lordShort} calls the banners\``.
* **Label helpers** (`engine/facts/label.js`, new) that fix root cause 5: `houseLabel(state, id)` ("House Stark", "the Free Folk", "the
  Crown", never "House The Free Folk"/"Baratheon of King's Landing"), `who(state, id)` (a natural name: "Robb Stark",
  "Lord Umber" for a byname), `partyLabel(state, p)` ("the Stark host", never "The Banners of Stark"), `roughly(n)` ("some
  three hundred", "nearly two thousand"), `ago/soon(days)` ("within the month"; not built).
  *Implemented in N2 (Slice 1), as built:* every helper takes the state first; there is also `houseShort(state, id)`
  ("Stark", for "the Stark host"); `who` returns the name as the data has it and only drops a quoted byname ("Lord Umber"
  for the Greatjon, "Smalljon Umber" for his son), so a short "Ser Rodrik" form is not built; `roughly` never says
  "thousands" and never a digit ("seven", "some three hundred", "nearly two thousand", "about a million"; `""` for
  what is no number); **`ago/soon` is not built** (no head needs it yet). A house of the data is "House X" without its
  place ("Baratheon of King's Landing" is "House Baratheon", the Crown "the Crown", the Free Folk "the Free Folk", the
  Night's Watch "the Night's Watch"); the details are in `DECISIONS.md#D-061`.
* **Fitting:** if the headline exceeds 12 words: drop the place clause → replace names by `who()` short form → drop the object →
  fall back to the archetype's short template. It always ends with something that passes H1–H8; a unit test asserts it for all kinds.
* **Roll-ups (C2)** use `list(names)` ("Umber, Manderly and Karstark"; ≥ 5 names → "Six northern houses"). *As built in
  N2, `list` gives five or more names as a count with two of them named ("six in all, Umber and Manderly among them");
  the phrase "Six northern houses" (a region and a noun) is the roll-up writer's, N3/N4.*
* **The summary** is built as: sentence 1 = the lead fact's plain statement; sentence 2 = a `data.how/why/cause/outcome` clause
  if the slot exists; sentence 3 = for the player's house only, the plain consequence the engine already has as a fact
  (never a feeling). If a slot is missing the sentence is left out — never padded with boilerplate.
* **New slots** on the emitters that matter most (N2), read by the writer's `head`/`sum` and the scorer's role check.
  *Implemented in N2 (Slice 1).* The slots as built (this list replaces the plan's, which named `data.how:
  'charged'|'held'|'ambushed'|'night'` and slots for `siege_*`, `crowned`, `wedding` and `arrived`; `DECISIONS.md#D-061`).
  A slot is present only when the engine knows it, and nothing else about a fact changes (no fact is added, removed or
  reordered).
  * `battle`: `winnerHouse`, `loserHouse` (the houses behind the two hosts; `null` in a draw) and `how`, the battle's
    decisive factor in the words of the battle report ("numbers and arms", "generalship", "the ground", "surprise",
    "fortune"…), not `'charged'|'held'|'ambushed'|'night'`: the engine resolves by factors, not tactics. `winner`,
    `loser` (party ids) and `lost` were already there.
  * `slain_in_battle`: `by` (the enemy commander left standing, absent if none), `how` (`'battle'`), `battle` (the
    battle's fact id), `place`.
  * `captured_in_battle`: `by` (a character, or the captor house's id when no commander stood), `battle`, `place`.
  * `executed`: `by` (the lord who ordered it).
  * `death`: `how` ∈ `age | illness | wound | fever | winter`, beside the `cause` and `age` it already had.
  * `call_refused`: `liege` and `why` (plain words: "bad blood between the houses", "the liege's heavy taxes"…; absent when
    it was only the roll of the dice).
  * Not built in N2: the slots of `siege_*`, `crowned` (`data.title`), `wedding` and `arrived` (`data.from`).
  * The emitters are `public/js/shared/battles.js`, `public/js/shared/world.js` (`note()`, which puts `by`, `how`,
    `battle` and `place` from a character's change onto the death or capture it tells), `engine/military/muster.js`,
    `engine/actions/court.js`, `engine/people/life.js` and `server/turn/day.js` (`theYears`). `shared/diplomacy.js` emits
    no facts, and `engine/military/battle.js` only resolves a battle (`shared/battles.js` tells it).
  * **The check that a fact of importance ≥ 3 has a `HEAD` entry is a test in N3, not a lint rule:**
    `scripts/lint-engine.js` is a line scanner and cannot see a fact's importance or a table's keys.

### 3.2 The narrator: headline + summary from facts only

*Implemented in N5 (Slice 5), as built in DECISIONS D-074: the model's part is the **scene** by default (mode `scenes`: 99 % of 238 stories first time, 1.4 s a week on Maester-12B) and the whole card only as an opt-in (mode `cards`: 61 %); the sheet, the schema without `pov`, the `NAME ONLY` line, the mock and the fallback as the writer. The plan's text below is the `cards` mode.*

*Input change (the main fix).* Today the model is handed the engine sentences ("`S3 [importance 4] facts f1.2, … — Days
1–1. At Last Hearth: Host of House Umber (150 men) is raised… Jon "Greatjon" Umber answers the call with 2,000 men…`").
That teaches it to copy the boilerplate. Instead it gets a **story sheet** built by `narrate.js context()` from the same
facts, structured, plus the writer's draft:

```
S2 [tier great · archetype battle] Day 3, at the Green Fork (near the Twins)
WHO: Robb Stark (King in the North, Stark, dead) · Tywin Lannister (Lannister, alive)
HAPPENED: Robb Stark was slain in battle; Tywin Lannister's host held the field.
WHY/HOW: Robb charged into the Lannister centre. (data.how)
COUNTS: Stark lost about 2,100; Lannister about 900.   ← for the details only; do not put numbers in the headline
DRAFT (rewrite if you can do better, keep every fact): headline: Robb Stark slain by Tywin Lannister at the Green Fork
                                                        summary: Robb Stark fell at the Green Fork; House Lannister holds the field.
```

*Schema* (`narrate.js schema`, `server/ai/schema.js` helpers `obj/str/arr/oneOf`):

```js
events: arr(obj({
  story: oneOf(ids),
  headline: str(90),          // was str(70): H1 is in words, the validator counts them
  summary: str(340),          // replaces `line`; 1–3 sentences
  scene: str(700, {optional}),// only asked for tier ≥ major; shown behind "Details", never in the feed
  pov: str(50, {optional}),
}), { min: 1, max: stories.length }),
meanwhile: str(200)
```

*Instructions* (`instructionsFor`, `style.js`): `HEADLINE` becomes "a headline in the form *who did what to whom, where* — news
present ("Lady Hornwood refuses Stark's summons") or a bare participle ("Robb Stark slain by Tywin Lannister"), at most 12
words, no numbers unless round and given, no brackets or dashes" (D-058; the summary is in the simple past) with **six few-shot headline+summary
pairs of other houses** (a battle, a death, a march roll-up, a refusal, a wedding, a harvest) and the **anti-patterns
list** taken from §1.3 ("never write `Host of House X sets out (~N days)`; never `calls up N levies`"). The voice list
(senses, dry humour) is kept for `scene` only; `summary` is plain: "one plain sentence of what happened, a second of
how or why. No scene-setting, no adjectives that are not in the facts."

*Mock* (`mock(ctx)`): returns the **writer's card** (`cardOf`) verbatim, so CI runs the whole path and the mock output is
itself the readable baseline. (Today the mock returns `plainEvent`, which is the source of B1–B13.)

*Fallback* (`fallback`): `{ events: ctx.stories.map(cardOf), plain: false }` — the same writer, no model; the record marks
`told: 'writer'`. `narrator.js` no longer returns "the engine's own cards"; it always returns cards with headline+summary.

*Validator* (`validate/narration.js`, new `checkHeadline`, rule name `headline`, `summary`): all existing rules now also read
`headline` (today `checkEvent` reads `line` and `scene`); plus H1, H3–H8, S1–S4, and:
- **invented names/facts**: every capitalised name in headline/summary must resolve through `tablesFor(state)` to the
  story's actors/place (or a house/party the story names); every verb of *outcome* (`slain`, `captured`, `wins`,
  `falls`, `crowned`, `weds`) must be backed by a fact of that kind in the story; every number must be in the story's `COUNTS` (±2 %) or be a small word-number.
- **role check**: for kinds with a victim/agent pair (`slain`, `captured`, `betrayed`, `defeated`) the agent's name must not
  be the patient of the passive verb ("Tywin Lannister slain by Robb Stark" fails when the fact says the reverse).
- **repair**: as today (`salvage`, one retell alone with the reason); after that the **writer's card** stands (not the engine sentence).

### 3.3 Role table (for H8)

`heads.js` also exports `ROLES = { slain_in_battle: { patient: 'victim' }, captured_in_battle: { patient: 'captive', agent: 'captor' }, battle: { winner, loser }, executed: {…} }` — both the writer and the validator read it, so they cannot disagree.
*Implemented in N1 (Slice 1), as `ROLES` in `server/ai/validate/headline.js`:* paths into the fact (`patient: 'actors.0'`,
`agent: 'data.by'`; a battle's `winner: 'data.winnerHouse'`, `loser: 'data.loserHouse'`) for `slain_in_battle`, `executed`,
`death`, `captured_in_battle`, `captured` and `battle`. N3 moves the table to `heads.js` and the writer reads it too.

### 3.4 Where the model is *not* used

Importance, ranking, tiers, roll-ups, the digest, pins and the Meanwhile sentence are engine work. The model may only rewrite the
words of a card for stories the engine already formed. Model output never adds a card, a fact, a name or a number.

---

## 4. After: the same events, told (≥ 10 examples)

Rows 1–9 rewrite the real §1.3 output (the deterministic writer's target text, which the mock returns; a model may
vary the wording within H/S). Rows 10–14 are **illustrative** (facts that the canon beats will produce later; they show
the shape for battles, deaths and captures that the mock game had not yet reached).

| # | Before (§1.3) | Headline | Summary | Details (collapsed) |
|---|---|---|---|---|
| A1 | B1, 21-fact muster | **Eleven northern houses answer Stark's call** | The Umbers, Manderlys, Karstarks and Boltons gathered their men and took the road to Winterfell. Hornwood alone refused. | Umber 2,000 (12 days) · Manderly 3,300 · Karstark 1,800 · Bolton 2,300 · Cerwyn 400 … |
| A2 | B1, the refusal inside it (C3) | **Lady Hornwood refuses Stark's summons** | Donella Hornwood will keep her men at home. Word of it reached Winterfell with the first ravens. | — |
| A3 | B2 | **Lord Eddard calls the banners of the North** | Nineteen sworn houses are told to bring their men to Winterfell. | — |
| A4 | B3 | **King Robert crosses the Green Fork on the road to Winterfell** | The King rides north with the Queen, her brothers and three hundred knights. Men say he means to make Lord Eddard his Hand. | Progress of about 1,400 men, a mile of wagons. |
| A5 | B4 | **Lord Arryn raises his levies at the Eyrie** | House Arryn is calling its banners; nothing yet says against whom. | About 9,977 men called. |
| A6 | B5 (three cards, later five more) | **Six northern hosts march for Winterfell** | Karstark, Umber and Manderly were the first to leave; the Karstarks have the longest road, near two months. | Karstark 1,796 (48 days) · Umber 1,996 (31) · Manderly 3,293 (28) · Locke · Wull · Dustin … |
| A7 | B6 | **Mance Rayder gathers the free folk beyond the Wall** | A great host of wildlings is answering him. The Night's Watch has not yet learned how many. | About 45,000 called. |
| A8 | B7 | **Lord Bolton begins a market at the Dreadfort** | The Boltons have chartered a market and fair in their own lands. | Works ordered at the Dreadfort. |
| A9 | B8 | **Ser Rodrik Cassel wins the tourney at the Eyrie** | Sixteen houses sent knights; Lord Arryn's tourney was the biggest the Vale has seen in years. | 16 houses entered. |
| A10 | B12, illustrative | **Robb Stark slain by Tywin Lannister at the Green Fork** | Robb led the charge into the Lannister centre and was cut down before his reserve could reach him. The Stark host broke and fled north. | Stark losses about 2,100; Lannister about 900. Fought on the 3rd of the 6th moon. |
| A11 | B13 | **Lord Rickard Karstark dies at Karhold** | The old lord died of age at sixty-one, in his own bed. His son Harrion takes the seat. | Aged 61. |
| A12 | illustrative | **Jaime Lannister captured by Robb Stark in the Whispering Wood** | Robb's horse fell on the Lannister camp from the trees at night; Jaime was taken with his household knights and led north in chains. | About 500 Lannister dead or taken. |
| A13 | illustrative | **Lord Walder Frey opens the Twins to Robb Stark** | Frey let the Stark host over the Green Fork in return for two marriages and a promise of his sons as wards. | Terms: Robb weds a Frey daughter; Arya weds Elmar; 4,000 Frey men join. |
| A14 | illustrative | **Winterfell beset by the ironborn** | Theon's men have the walls and the yard; the household is held in the great hall. | Ironborn about 500. |
| A15 | B11, the Meanwhile line | **Meanwhile** — *Lords ride to feasts and hunts across the Reach and the Vale; a Pentoshi galley was wrecked off Widow's Watch.* | | Eight journeys listed. |

**The turn-end digest for turn 1** (replaces B10):

> **The week.** *Eleven northern houses answer Stark's call.* Lords across the North gather their men for Winterfell; only Hornwood refused.
> *King Robert crosses the Green Fork on the road to Winterfell.* The Queen and her brothers ride with him.
> *Lady Hornwood refuses Stark's summons.*
> **Also:** *Tourney at Bear Island proclaimed* · *Lords ride to feasts and hunts across the Reach.*

---

## 5. Work packages

Order: **N1 first** (the golden set and the scorer make every later package test-driven); then N2 and N3; N4 with N3; N5 needs
N1+N3; N6 needs N3+N5; N7 and N8 need N6; N9 with N4; N10 last. Each package: its own branch `wp/n<k>-<slug>` (or one branch for a slice of related packages, `DECISIONS.md#D-059`), a PR per
CLAUDE.md, `docs/CHANGELOG.md` entry, tests on `WC_PROVIDER=mock` only.

| ID | Package | Files | Acceptance (all on the mock; no live model) | Size |
|---|---|---|---|---|
| **N1** | **Golden set + scorer.** The measure before the fix. | `server/ai/validate/headline.js` (new: `scoreCard(card, story, state) → { pass, faults[] }` implementing H1–H10, S1–S6); `public/data/style.js` (+ `BOILERPLATE`, `JARGON`, `HEADLINE_MAX_WORDS`); `tests/fixtures/headlines/golden.json` (≈ 60 story bundles: fact lists with slots, `must: [names]`, `mustNot: [names]`, `maxWords`, a reference headline; built: 71); `tests/fixtures/headlines/bad.json` (the §1.3 B1–B13 strings and 20 more, each with the rule it must fail; built: 69); `tests/headlines.test.js` | The scorer **fails every string in `bad.json` on the named rule** and **passes every reference headline** in `golden.json`; rule unit tests (length 12/13 words, digits, parentheses, `House The`, reversed slain/slayer, invented name "Ser Barristan" in a Stark muster story, ellipsis). Test also asserts the *current* mock output scores < 50 % on the golden set (regression evidence; the assertion is flipped to ≥ 100 % in N3). | M |
| **N2** | **Fact hygiene: labels and slots.** | `public/js/engine/facts/label.js` (new: `houseLabel`, `houseShort`, `who`, `partyLabel`, `roughly`, `list`); the emitters `shared/battles.js`, `shared/world.js` (`note`), `engine/military/muster.js`, `engine/actions/court.js`, `engine/people/life.js`, `server/turn/day.js` (`theYears`), adding the slots of §3.1 — additive (`engine/military/battle.js` only resolves, and `shared/diplomacy.js` emits nothing, so neither is touched); the importance ≥ 3 check is N3's test, not a lint rule (§3.1) | `houseLabel` never yields "House The …" or "… of King's Landing" (table test over every house of the 298 AC scenario, 100+, in `tests/labels.test.js`); `roughly` boundaries; battle/slain/death/capture/refusal facts carry their slots in a scripted scenario (`tests/labels.test.js`); `npm run check` passes; no change to fact ids, order or counts (soak invariant; asserted on a battle's facts). | M |
| **N3** | **Deterministic writer.** | `public/js/engine/facts/heads.js` (new: `HEAD`, `SUM`, `ROLES` for all 126 kinds; rank for C4); `public/js/engine/facts/headline.js` (new: `cardOf(state, story)` with fitting); `tests/headlines.test.js` | For **every kind in `KINDS`** a synthetic fact → a card that `scoreCard` passes (H1–H8, S1–S4); the whole golden set passes ≥ 98 % (target 100 %); B1–B13's underlying facts read like §4; headlines are pure functions of facts (same input → same output, no `Math.random`); works in the browser (no `node:` imports) — asserted by importing it in a client-side test. | L |
| **N4** | **Clustering v2 + roll-ups + tiers.** | `public/js/engine/facts/cluster.js` (archetype C1, roll-up C2, split C3, lead rank C4, merge C5, no hard cap C6, Meanwhile C7); `server/narrator.js` (`clusterFacts` call sites) | On the six mock turns above: turn 2 gives **one** march card (not three), turn 1's muster is 2 stories (muster + refusal), no story > 8 facts unless one archetype/place; **cards per turn ≤ 10 and facts per card mean ≥ 1.5** in the soak (`scripts/soak.js` prints both); a fact never appears in two cards; `tests/facts.test.js` still green; the old `together` hint still honoured. | M |
| **N5** | **Narrator v3: schema, story sheet, validator, mock, fallback.** | `server/ai/calls/narrate.js` (new `context` story sheet with WHO/HAPPENED/WHY/COUNTS/DRAFT; `schema` with `summary`; `instructionsFor` with six few-shot pairs and anti-patterns; `mock` = `cardOf`; `fallback` = `cardOf`; drop `plainEvent`/`herald`); `server/ai/validate/narration.js` (`checkHeadline`, headline in every existing rule, role check); `public/data/style.js` (`HEADLINE`, `BOILERPLATE`, `EXAMPLES` with headline+summary); `server/narrator.js`; `tests/narrator.test.js`, `tests/ai-contract.test.js`, `tests/replay.test.js` (fixtures updated) | Contract test: the schema accepts the writer's card and rejects a 14-word headline, a bracket, a digit-string; the mock's telling passes the validator on **100 %** of `bundles()` weeks (the old ≥ 98 % gate raised); replay-provider fixtures with **bad model outputs** (invented "Ser Barristan", reversed slayer, "Host of House X sets out (~9 days)", a CJK leak) are each rejected with the right rule, salvage retells once, then the writer's card stands; a failed model call yields cards with `told:'writer'` that still pass `scoreCard`. | L |
| **N6** | **Card shape in the turn record, digest, and migration.** | `server/game.js` (~L431–466: build `headline/summary/details[]/tier/score`, keep `title/text/details`(string) aliases; `digest` replaces `summary`; no `…` clipping); `public/js/engine/state/migrate.js` (old saves: lazily `cardOf` on load); `server/view.js`; `appendChronicle` / `appendWorldLog` (headline — summary); `docs/gdd/03-architecture.md` card shape | Loading a save from before N6 still renders (fixture in `tests/fixtures`); `turn.digest` ≤ 90 words, ≤ 3 top + ≤ 5 headlines + 1 Meanwhile; `turn.events` all have `headline`, `summary`, `tier`; `chronicle.md` lines contain no engine boilerplate (scorer over the file); soak invariant added: every card passes `scoreCard`. | M |
| **N7** | **Feed, turn-end digest and jump feed UI.** | `public/js/ui/drawer.js` (`eventHtml` rewrite; tiers; "Details"); `public/js/app.js` (~L362–535 progress feed `bf-t`, "The week" block; toast for tier great); `public/css/*` (card tiers); `public/js/ui/windows.js` (L318 and other `.et/.eb` users); `public/js/ui/event-art.js` | Playwright at 1920×1080 and 1366×768 (SwiftShader flags per CLAUDE.md): a mock turn's feed shows headline + ≤ 2-line summary, details collapsed, ≥ 3 tiers visibly different, no horizontal scroll, headline never wraps to > 2 lines at 1366; DOM test that no card renders `text === details`; "Only what matters" filter hides tier < news; screenshots attached to the PR. | M |
| **N8** | **Pins.** | `public/js/shared/pins.js` (`pinworthy` by tier/`mine`; battle pins from `cardOf`; expiry unchanged), `public/js/ui/pins.js` (window = headline, summary, Details), `public/js/map*/…` pin label = headline on hover; `tests/map-*.test.js` | `openPins` unit test: a tier-`great` fact with a place gets a pin, a minor unrelated one does not, `mine` minor does; battle away from a castle pins with the writer's headline (regression against `"X defeated Y."`); pin label ≤ 12 words; ack behaviour unchanged (`acks` keys stable across N6); screenshot. | S |
| **N9** | **Importance ranking and the Meanwhile sentence.** | `public/js/engine/facts/rank.js` (new: `score`, `tier`, fatigue), `headline.js` (`meanwhileOf(facts)`), `server/game.js` (digest); `tests/headlines.test.js` | Table-driven ranking tests (own-house +1, first-of-kind +1, fatigue −1 after two of an archetype); on six mock turns the tier-`great` card is the same the human reviewer of §4 would pick (asserted on fixtures: turn 1 → the muster, turn 4 → the tourney, turn 5 → the feast); Meanwhile sentence ≤ 200 chars, ends with a full stop, contains no more than 3 clauses, contains none of `BOILERPLATE`. | S |
| **N10** | **Bench suite, soak invariants, owner check, docs.** | `bench/suites/headlines/*.json` + `bench/lib/headlines.js` (reuses `bundles()` from `bench/lib/narrate.js`); `scripts/bench.js` (`--suite headlines`); `scripts/soak.js` (every card passes `scoreCard`; prints cards/turn, facts/card, boilerplate hits = 0); `scripts/headlines-check.js` (owner-run: plays 5 weeks, tells them with the configured live model, prints before/after and the scorer's faults — never in CI); `docs/gdd/04-ai-system.md` §6, `10-narrative-events.md` §8, `12-ui-ux.md` §6 updated; `docs/gdd/DECISIONS.md` (D-0xx: card = headline + summary, model rewrites, writer is the floor; `scene` optional); `docs/CHANGELOG.md`; `docs/HANDOFF.md` (owner checklist) | `npm run bench -- --suite headlines` on the mock writes `bench/headlines-mock-<date>.md` with **pass rate 100 %**, headline length mean ≤ 9 words / max ≤ 12, boilerplate 0, names-present ≥ 99 %, distinct-verb ratio ≥ 70 %, facts/card ≥ 1.5; `npm test` runs a 6-week mini-soak of the same; the replay suite holds recorded model outputs (from `docs/gdd/assets/bench-2026-09-27` style) so the validator's rejection rates are tracked without a model. **Owner to verify** (cannot be tested in the cloud): with the live model, ≥ 90 % of headlines pass first try and a 1–5 judge/eyeball score ≥ 4 on "the headline alone tells what happened". | M |

*Implemented in N1/N2 (Slice 1, one branch and one PR; `DECISIONS.md#D-059`): N1 ✅ N2 ✅. Tests: `node --test
tests/headlines.test.js tests/labels.test.js`. Nothing changes on screen; N3 onward are held to this scorer.*

### 5.1 The golden set (N1) in detail

`tests/fixtures/headlines/golden.json`: each entry

```json
{ "id": "g-slain-01", "facts": [ {"kind":"slain_in_battle","actors":["robb_stark"],"data":{"by":"tywin_lannister","how":"charged the centre"},"place":"green_fork","importance":5} ],
  "must": ["Robb Stark", "Tywin Lannister", "Green Fork"], "mustNot": ["Jaime", "Riverrun"], "maxWords": 12,
  "reference": "Robb Stark slain by Tywin Lannister at the Green Fork" }
```

Coverage: every archetype of C1 ≥ 3 times (battle, death by battle, death by age, execution, capture, siege begun/fell, muster, march roll-up,
refusal, betrothal/wedding, crowning, letter, rumour, omen, works, harvest, tourney, feast, Meanwhile), with the **hard cases** from §1.2:
a bynamed lord ("Jon 'Greatjon' Umber"), a party, "the Free Folk", a house with a place suffix, 21 same-kind facts, a story with no person (a
storm at sea), and a story whose only actor is not known to the player's house (vis filter).
`scoreCard` returns the rule names failed; the test prints a table by rule so a regression is legible.

### 5.2 Rules the scorer implements (`scoreCard`)

| Rule | Check |
|---|---|
| `len` | headline words 3–12, chars ≤ 80; summary ≤ 3 sentences, ≤ 340 chars |
| `who` | ≥ 1 name from `must` / the story's actors, house or place present in the headline |
| `invented` | every capitalised token resolves to the story (reuse `tablesFor`); none from `mustNot` |
| `verb` | headline has a finite verb (present or past) or a bare passive participle from `HEADLINE_VERBS` in `style.js` (slain, taken, held, refuses, marches, crowned …); a bare noun phrase ("Battle near the Twins") fails. Was `past` (past tense or participle); changed by D-058 |
| `numbers` | ≤ 1 number, in the story's data, no `~`, no `N men`/`N strong` |
| `punct` | no `()`, `:`, `;`, `—`, `…`, no trailing full stop in headline; no `…` in summary |
| `boiler` | none of `FORBIDDEN`, `FORBIDDEN_EXACT`, `BOILERPLATE`, `JARGON` |
| `roles` | patient/agent not reversed (ROLES) |
| `dup` | summary is not the headline restated (token overlap < 0.8) |
| `outcome` | outcome verbs are backed by a fact kind in the story |
| `script`, `anachronism`, `maturity` | existing validators |

*Implemented in N1 (Slice 1): `scoreCard(card, story, state) → { pass, faults, detail }` in `server/ai/validate/headline.js`,
its data in `public/data/style.js`. As built, beyond the table (`DECISIONS.md#D-060`):*
* `invented` also fails a house the story does not hold, said as "House X" or "the Xs" (the player's own house excepted);
  `who` accepts the story's houses.
* `boiler` also fails a house written in its ledger form "X of Place". `BOILERPLATE` and `JARGON` are separate exports
  from `FORBIDDEN`, so the audience, council and consolidate validators, which read `FORBIDDEN`, are unchanged.
* `punct` also fails a headline that ends in `!` or `?`. `numbers`: no digit or `~` anywhere, at most one number word in
  the headline, a number above twelve only when the story gives it (±2 %).
* `roles` is read on the summary as well as the headline; `outcome` on the headline only.
* `anachronism` lets a phrase through when the story's own facts say it ("crowned King in the North" in the story of the
  crowning).

---

## 6. Risks and how they are held

* **Headlines all sound alike** (the writer is templated): the fitting step rotates among 3–4 verb forms per kind, chosen from a hash of the fact id
  (deterministic, no dice) and the scorer's H9 (distinct-verb ≥ 70 %) fails the bench if variety falls.
* **A model rewrites into something prettier and wrong**: the validator's `invented`, `outcome` and `roles` rules; a rewrite that fails is dropped for the
  writer's card. Owner check E: compare 20 live rewrites to their drafts.
* **Numbers the player wants**: they are never lost — `details` and `record` keep the engine's exact lines one click away ([04](04-ai-system.md) §6, "the numbers are one click from the prose").
* **Old saves:** N6's lazy `cardOf` on load; aliases `title`/`text` stay for a release.
* **Spoilers:** headlines are built only from facts the player's house may read (`vis`), never from beats not yet happened ([10](10-narrative-events.md) §1.3);
  the scorer's `anachronism` rule runs on every headline.
