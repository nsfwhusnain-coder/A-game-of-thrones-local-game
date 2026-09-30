# 04 · The AI system

> Every call the game makes to a language model: when, with what context, in what shape, how it is checked, what
> happens when it fails, which model runs it. Supersedes the swarm in `server/agents.js` and the prompt builders in
> `server/prompts.js`. Architecture context: [03-architecture.md](03-architecture.md).

---

## 1. What the AI is for (and what it is not)

| Role | Call | Decides? | Writes prose? | Changes state? |
|---|---|---|---|---|
| Understand the player | **Interpreter** (§4) | maps words → verbs | no | **no** (produces intents) |
| Think for characters | **Mind** (§5) | yes — one intent per actor | a public face line | **no** (produces intents) |
| Keep the realm eventful | **Director** (§7) | picks story hooks from a catalogue | no | **no** (produces intents/hooks) |
| Tell what happened | **Narrator** (§6) | no | yes | **no** |
| Speak as a character | **Audience** (§8) | a bounded outcome | yes | **no** (outcome → commitments, validated) |
| Counsel | **Council / Advisor** (§8.4) | no | yes | no |
| Help write orders | **Counsel ideas / Polish** (§8.5) | no | yes | no |
| Remember | **Consolidator** (§9) | no | yes (summaries) | no |
| Write letters | **Letter** (§8.3) | no | yes | no |
| Invent mechanics | **Weaver** (§10, phase H) | yes (a rule) | no | via the sandboxed DSL only |

The rule that replaces the swarm: **small, single-purpose calls, each with a compact context, a JSON schema enforced by
the server, and enums built from the live world.** The model never sees an operation list it could use to write state.

## 2. Shared prompt conventions

1. **Static primer first.** Every call's system message starts with the same `PRIMER` (≈ 900 tokens: the world, the
   date format, the tone, the rules of travel and news) — identical bytes across calls so llama.cpp reuses the KV
   prefix. The call's own instructions follow, then the schema reminder. Keep `WORLD_PRIMER` from `server/prompts.js`
   as the seed, trimmed; it must not mention ids, ops or JSON.
2. **Context is facts, not instructions.** The user message is a structured dossier (headings in capitals, one fact per
   line) followed by one short question. No contradictions between system and user text (the swarm's failure, B-04).
3. **Names and ids together** wherever the model must pick an id: `Winterfell [stark]`. Enums contain ids only; the
   dossier shows the mapping.
4. **Present tense for the present, past for the past.** Dates always as "the 12th day of the 9th moon, 298 AC".
5. **Budget per call** (tokens): Interpreter ≤ 3k in / 400 out · Mind ≤ 3k in / 250 out · Director ≤ 4k / 300 ·
   Narrator ≤ 7k / 1,600 · Audience ≤ 6k / 700 · Council ≤ 7k / 1,200 · Consolidator ≤ 8k / 1,200. All far below the
   64k window so two slots never evict each other.
6. **Thinking off** for every call (`chat_template_kwargs.enable_thinking: false`). Reasoning, if wanted, is a schema
   field (`"reason"`) capped by `maxLength`.
7. **Temperatures:** Interpreter 0.2 · Mind 0.6 · Director 0.8 · Narrator 0.85 · Audience 0.8 · Council 0.8 ·
   Consolidator 0.3.
8. **Difficulty and canon gravity** are injected as one short paragraph each (like Pax Historia's
   `DIFFICULTY_DESCRIPTION_*`), text in §12.

## 3. Constrained decoding (the single most important change)

llama.cpp's server (the build on the owner's PC, verified 2026-09-27) enforces
`response_format: { type: "json_schema", json_schema: { name, strict: true, schema } }`, including `enum` lists. Measured:
a 191-token prompt with a schema of five fields returned valid JSON with only allowed ids in **3.5 s**. Every call in
this document MUST send a schema. Consequences:

- JSON is always valid → the repair/retry machinery in `server/llm.js` becomes a safety net, not the main path (fixes B-26).
- Ids are always real → no `unknown army bolton_muster` rejections.
- Output length is bounded by `maxLength`/`maxItems` → predictable latency.

### 3.1 The prefix-collision pitfall (observed, must be handled)

In the bench, all three models, told "Jon should go to the Wall", chose `the_twins` although `castle_black` was allowed.
Cause: the model began writing `"the` (thinking *the_wall*), and under the grammar the only enum member starting with
`the` was `the_twins`. Rules for every enum the engine builds (`server/ai/schema.js`):

1. **Aliases are enum members.** For every place, include each natural name the player or model may use, as its own
   member, mapped back to the canonical id: `castle_black`, `the_wall` → `castle_black`; `stark`, `winterfell` → `stark`;
   `kings_landing`, `baratheon` (seat) → `baratheon`; `the_eyrie`, `eyrie`, `arryn` → `arryn`. Aliases come from
   `PLACE_ALIASES` (already in `data/houses.js`) plus `places[*].aliases`.
2. **No enum member may be a strict prefix of another unless both map to the same id** (`the_twins` vs `the_twins_bridge`
   is fine; `the` alone is forbidden).
3. **Common articles are dropped** from ids (`twins` and `the_twins` both present, same id).
4. **The dossier lists places by the names people use**, not only ids: `Castle Black on the Wall [castle_black | the_wall]`.
5. For people, include both `firstname_lastname` and the usual short form (`ned`, `lord_eddard`, `the_greatjon`).
6. A post-check maps every alias to its canonical id before validation.

*Implemented in WP B5* (`server/ai/schema.js`, [DECISIONS.md#D-006](DECISIONS.md)): `buildEnum` applies rules 1–3 and
6; the Castle Black holding's id in this world is `nights_watch`, with `castle_black`, `the_wall` and `wall` as aliases.

### 3.2 Schema builder API

```js
// server/ai/schema.js
enumFor(state, kind, { scope })   // kind: 'place'|'own_party'|'party'|'person'|'own_person'|'house'|'verb'; returns { members: [...ids+aliases], canon: Map(alias→id) }
schemaFor(callKind, state, ctx)   // returns the JSON schema object for that call, enums filled
canonicalize(obj, maps)           // alias → id in place
```

## 4. The Interpreter (player orders → intents)

**When:** each time the player adds or edits a command (planning phase), and when they answer a matter "in their own
words". **Goal:** turn free text into 0–4 legal intents plus a receipt, or ask one clarifying question.

> *Implemented in WP B6* — the pre-parser `server/orders/parse.js`; the call `server/ai/calls/interpret.js`; the flow
> (rules → model → fallback) `server/orders/interpret.js`; readings, receipts and answers in `server/orders.js`
> (`readOrders`, `carryOut`, `answerOrder`, `carryOutOrders`); the suite `bench/suites/interpret` (275 orders) and its
> hold-out. Departures: DECISIONS D-016–D-021. "Answer a matter in their own words" still goes through `answer_matter`.

### 4.1 Two stages

1. **Deterministic pre-parse** (`server/orders/parse.js`, grown from `readOrdersByRule` in `server/orders.js`):
   tokenise; find verbs (a lexicon of ~300 phrasings: "march", "ride", "send", "summon", "call the banners", "raise",
   "muster", "join", "bring the host", "go to", "set out", "garrison", "besiege", "write to", "tell", "offer",
   "betroth", "hang", "free"…), people (names, titles, relations: "my wife", "the maester", "Robb", "my heir"), places
   (aliases), numbers (digits and words: "two hundred", "a score", "a few" → 10, "a handful" → 5), durations
   ("within the fortnight" → 14 days). If the parse is **complete and unambiguous** (one verb, all params resolved,
   legal), skip the model. Target: ≥ 60 % of real orders never need the model.
2. **Constrained model call** for everything else, with the parse as a hint.

### 4.2 Context (user message)

```
THE LORD: Eddard Stark [eddard_stark], at Winterfell [stark]. Head of House Stark. Today: 3rd day, 9th moon, 298 AC.
HOSTS AND COMPANIES YOU COMMAND:
- host_of_the_north — "The Host of the North": 4,200 at Moat Cailin [moat_cailin] under Robb Stark; 6,300 more of the sworn lords gathered at Winterfell and joining it
- winterfell_garrison — 200 men of the household at Winterfell
YOUR PEOPLE (where they are):
- robb_stark (Robb, your heir) — with the Host at Moat Cailin
- jon_snow (Jon) — Winterfell · theon_greyjoy (Theon, your ward) — Winterfell · luwin (Maester Luwin) — Winterfell
- catelyn_stark (Catelyn, your wife) — Winterfell · rodrik_cassel (Ser Rodrik, master-at-arms) — White Harbor
YOUR SWORN HOUSES: Bolton, Karstark, Umber, Manderly, … (the banners are called; 14 answered, 3 delayed, 2 not yet)
PLACES OFTEN NAMED: Winterfell [stark|winterfell] · Moat Cailin [moat_cailin] · Castle Black on the Wall [castle_black|the_wall] · White Harbor [manderly|white_harbor] · The Twins [frey|the_twins] · …
THE PRE-PARSE FOUND: verb? "send"; people: jon_snow; places: the_wall; numbers: "a few men" → 5
ORDER: "Send the bannermen gathered at Winterfell down to Robb at Moat Cailin so the whole northern host is one. Jon should go to the Wall with a few men."
Turn the order into actions. If it cannot be done with the actions allowed, say why in "unclear".
```

### 4.3 Schema

> *As built (D-016):* one flat action record serves every verb — `verb, who, subject, at, to, person, houses[], men,
> gold, choice, note` — because the registry's verbs need more than `who/subject/to/men` (a house for war and spies, a
> sum for a gift, an office, a tax level, a verdict). `choice` is one enum of every verb's small words (checked against
> the verb's own); `who` holds the house's people and the wards it keeps, `person` everyone living.

```json
{
  "type": "object", "additionalProperties": false, "required": ["actions", "clarify"],
  "properties": {
    "actions": { "type": "array", "maxItems": 4, "items": {
      "type": "object", "additionalProperties": false, "required": ["verb", "who", "subject", "to", "men", "note"],
      "properties": {
        "verb":    { "enum": ["<verbs legal for the player now>"] },
        "who":     { "enum": ["<own people ids + aliases>", "none"] },
        "subject": { "enum": ["<own party ids + aliases>", "none"] },
        "to":      { "enum": ["<places + aliases>", "<party targets as party:<id>>", "<people as char:<id>>", "none"] },
        "men":     { "type": "integer", "minimum": 0, "maximum": 100000 },
        "note":    { "type": "string", "maxLength": 120 } } } },
    "clarify": { "type": "object", "additionalProperties": false, "required": ["needed", "question", "options"],
      "properties": { "needed": { "type": "boolean" }, "question": { "type": "string", "maxLength": 140 },
                      "options": { "type": "array", "maxItems": 4, "items": { "type": "string", "maxLength": 60 } } } }
  }
}
```

Verbs not relevant to the order's parse family are **removed from the enum** before the call (a "march" order does not
see `hold_feast`) — smaller enums, fewer wrong picks.

### 4.4 After the call

1. `canonicalize` aliases; build intents; run each verb's `legal()`; compute `receipt()` on a dry-run copy.
2. Refused actions produce a red receipt line with the in-world reason ("The Bloody Gate is shut to you — Lady Lysa
   will not open it"). A **refused order is never silently dropped** (P2).
3. `clarify.needed` → chips under the order; clicking one patches the order and re-runs step 1 without a model call
   where possible.
4. Receipt examples:
   - `✓ The banners at Winterfell (6,300) march to join Robb at Moat Cailin — ~9 days.`
   - `✓ Jon Snow rides for Castle Black with 5 men of the household — ~12 days.`
   - `⚠ Winterfell keeps 195 men; the household is thin.`
5. Store `order.parsed` and `order.receipt`; the jump re-validates and schedules them.

### 4.5 Few-shot

The system message carries 6 short worked examples (order → actions) covering: split a host, merge hosts, send a
person with escort, letter vs journey ("tell my brother…" is a letter unless the order says go), recruit/hire with gold,
and an impossible order. Examples use a different house than the player's to avoid copying.

## 5. Minds (NPC intents)

**When:** at the start of each jump segment ([03](03-architecture.md) §6.2). **Goal:** a salient character decides what
they do next, *in character*, from what *they* know.

> *Implemented in WP B7* — `engine/minds/{salience,options,houseways}.js`, `server/ai/calls/mind.js`, `server/minds.js`;
> once per turn (six minds a week, on the turn's first day) until the jump of B11 runs them per segment. Departures:
> DECISIONS D-022–D-026 (`wait` for `hold`; `host`, `gold`, `choice` in the schema; a refusal told back through the
> client's retry; office-holders wait for verbs of their own).

### 5.1 Salience (who gets a mind call)

`salientActors(ctx, seg)` scores every living head of house, regent, commander of a host, office-holder, and character
with an active goal (09 §2):

```
score = rank weight (king 40, paramount 30, major lord 18, minor lord 8, office-holder 12, commander 10)
      + trigger weight (a letter/envoy arrived for them +25; an enemy host within 3 days +30; a commitment due this
        segment +20; their goal's next step is due +15; they were addressed by the player +25; their holding besieged +35;
        a kinsman captured/killed +25; a canon beat names them +20)
      + proximity to the player's realm (same region +10; bordering +5)
      − recency (had a mind call in the last segment −20; last 2 −10)
```

Budget: **6 minds per 7-day segment** by default (Settings → *How much the realm thinks*: 3 / 6 / 10). Top scores win;
ties broken by rng. Everyone else with a trigger gets a **fallback intent** from their house's behaviour tree (09 §4).

### 5.2 Context (per actor, ≤ 3k tokens)

```
DATE: 12th day, 10th moon, 298 AC. Late summer; autumn is feared.
YOU ARE: Tywin Lannister [tywin_lannister], Lord of Casterly Rock, Warden of the West, 58. At Casterly Rock [lannister].
YOUR NATURE: courage 8, wits 10, guile 9, pride 10, temper 3 (cold), warmth 1, honesty 3, ambition 9. Swayed by: family, power. Never forgets a slight.
WHAT YOU WANT (your goals): 1) the Lannister name feared and unassailable; 2) Jaime free of the Kingsguard and heir to the Rock (long); 3) Tyrion returned, whatever his worth (NOW).
YOUR STRENGTH: coin ~480,000 dragons (the Crown owes you 3,000,000 more); levies of the West ~42,000 uncalled; 4,000 men-at-arms; 30 ships.
YOUR PROMISES: none open.
WHAT YOU KNOW (as it reached you; may be late or wrong):
- 9 days ago Lady Catelyn Stark seized your son Tyrion at the Crossroads Inn and took him east — rumour says the Eyrie. (rider, 4 days old)
- Lord Eddard Stark is Hand of the King in King's Landing. (known)
- Lord Hoster Tully is ailing; his son Edmure commands the Riverlands' levies. (known)
- Jaime is in King's Landing and furious. (raven from Jaime, 2 days old)
RELATIONS: Tully −35 · Stark −30 · Arryn −20 · the Crown +20.
WHAT YOU CAN DO NOW (choose one):
- call_banners — summon the West to a muster point
- raise_levies — raise your own levies at a holding
- march_host — send a host somewhere (you have: rock_garrison 3,000 at Casterly Rock)
- send_letter / send_envoy — to anyone
- demand — demand something of a house (release of a prisoner, payment, submission) with a threat
- raid — send raiders into a neighbour's lands (you would choose the leader)
- bribe · scheme · fortify · hold
```

The **legal options list is generated by the verb registry** for this actor at this moment. The model sees plain-English
options; the schema enum carries the ids.

### 5.3 Schema

```json
{ "type": "object", "additionalProperties": false,
  "required": ["verb", "target", "leader", "men", "with", "public_face", "secret_aim", "line"],
  "properties": {
    "verb":        { "enum": ["<legal verbs for this actor>"] },
    "target":      { "enum": ["<legal targets for those verbs: places, houses, people, parties + aliases>", "none"] },
    "leader":      { "enum": ["<this actor's people who may lead>", "self", "none"] },
    "men":         { "type": "integer", "minimum": 0, "maximum": 100000 },
    "with":        { "type": "string", "maxLength": 120 },
    "public_face": { "type": "string", "maxLength": 160 },
    "secret_aim":  { "type": "string", "maxLength": 160 },
    "line":        { "type": "string", "maxLength": 200 }
  } }
```

`line` is something the character says or writes about it (used by the narrator, never as fact). `public_face` is what
others are told; `secret_aim` is what they truly want (feeds deception and treachery).

### 5.4 After the call

Validate with `legal()`. On refusal, **one** retry with the refusal text appended ("You cannot march on Riverrun: your
host is at Casterly Rock and has no route through the Golden Tooth while the Vances hold it") and the refused option
removed. On a second failure, use the fallback behaviour tree. Record every mind call (actor, options, choice, refusal)
in the turn record for the debug view.

### 5.5 Strategic quality

The bench showed Tywin choosing to "send a letter" when told his son was seized. The prompt must carry **what a person
of this nature does in this situation** as a hint line generated from the behaviour tree ("A lord of your nature, whose
son is taken, answers with force and makes the taker's kin pay"). The model may override it; most of the time it should
not need to. This is how house ways (`data/voices.js HOUSE_WAYS`) and agendas (`data/agendas.js`) reach the decision.

## 6. The Narrator

**When:** at the end of each jump segment. **Goal:** turn the facts the player's house knows into 3–8 chronicle events in
the voice of the books, bound to facts, adding nothing.

> *Implemented in WP B8* ([DECISIONS D-028–D-031](DECISIONS.md)): `engine/facts/cluster.js` (stories), `server/ai/calls/
> narrate.js` (dossier, schema, style-bible instructions with the Tarly example, mock = the facts told plainly),
> `server/ai/validate/narration.js` (every rule of §6.4), `server/narrator.js` (one telling, a failed story told again
> alone, then the engine's cards; a told story replaces the engine's cards for its facts and keeps their lines as "the
> record"), `data/anachronisms.js`. Until jumps are segmented (B11) the narrator tells the whole turn once. The Bard of
> the swarm is not called while the narrator is on (`config.json` `"narrator": "on" | "off"`).

### 6.1 Input: stories, not facts

`engine/facts/cluster.js` groups the segment's player-known facts into **stories** (≤ 8): facts sharing a thread, a party,
a place within 2 days, or a cause chain. Each story has an importance (max of its facts) and a suggested POV (the most
important actor present, or a witness — a stable-hand, a septon, a raven-keeper — from the place's household). Facts of
importance 1 (happenings, steward notes, weather, behaviour) are not stories; they go into one **"Meanwhile"** list the
narrator turns into a single sentence.

### 6.2 Context

```
DATE: from the 3rd to the 9th day of the 9th moon, 298 AC. Late summer in the North: dry roads, cold nights.
WHO IS WHERE (people in these stories): Jon Umber [the Greatjon] — with the banners on the kingsroad south of Winterfell; Roose Bolton — with the banners; Jon Snow — kingsroad north of Winterfell; Robb Stark — Moat Cailin …
STORIES (tell each once; add nothing that is not here; do not contradict anything):
S1 [importance 3] facts f7.3, f7.4 — Day 3. At Winterfell, 6,300 men of the sworn lords (Umber 3,800, Glover 850, Bolton 400, Norrey 700, Liddle 550) break camp and march south for Moat Cailin under Lord Jon Umber, to join Robb Stark. Roose Bolton rides with them. POV: Jon Umber.
S2 [importance 3] facts f7.6 — Day 5. Jon Snow leaves Winterfell for Castle Black with six men of the household. POV: Jon Snow.
S3 [importance 2] facts f7.9 — Day 9. At Moat Cailin Robb Stark mans the three standing towers with archers. POV: a Karstark archer.
MEANWHILE (one sentence for all): a rich harvest at Castle Cerwyn; poachers hanged in the wolfswood; a septon's procession at Barrowton.
WHAT THE PLAYER'S HOUSE DOES NOT KNOW (never hint at it): <nothing listed — secret facts are simply absent>
```

### 6.3 Schema

```json
{ "type": "object", "additionalProperties": false, "required": ["events", "meanwhile"],
  "properties": {
    "events": { "type": "array", "minItems": 1, "maxItems": 8, "items": {
      "type": "object", "additionalProperties": false, "required": ["story", "headline", "line", "scene", "pov"],
      "properties": {
        "story":    { "enum": ["S1", "S2", "S3"] },
        "headline": { "type": "string", "maxLength": 70 },
        "line":     { "type": "string", "maxLength": 200 },
        "scene":    { "type": "string", "maxLength": 900 },
        "pov":      { "type": "string", "maxLength": 50 } } } },
    "meanwhile": { "type": "string", "maxLength": 300 } } }
```

### 6.4 Validation (`server/ai/validate/narration.js`)

For each event:

1. **Names:** every capitalised name found in `headline`/`line`/`scene` that matches a character in the roster must be
   an actor in the story's facts, present at the story's place on its days, or mentioned as absent ("he thought of his
   father in King's Landing"). A present-tense action by a character who is elsewhere → **fail** (fixes B-12).
2. **Numbers:** every number written as digits or words in the text must equal a number in the story's facts (±2 %), or
   be ≤ 12 (small descriptive counts: "three knights"). Otherwise fail.
3. **Places:** a named holding must be the story's place or on the involved party's route.
4. **Anachronism list** ([10](10-narrative-events.md) §9): "golden hand", "King in the North" before the crowning fact,
   "Kingslayer's hand", "the Red Wedding", "Hand of the Queen", "Lord Commander Snow", "Mother of Dragons" before the
   hatching fact, "Khaleesi" before the wedding fact, "the Imp's trial", etc. Any match → fail.
5. **Game words:** "morale", "unrest", "prosperity", "levies figure", "turn", "day 3" (as a counter), "the player", "op",
   "engine" → fail.
6. **Language:** reject any character outside Latin script (the Qwen CJK leak, B-27).

A failed event is regenerated **once** alone (a 300-token call for that story with the failure reason). If it fails
again, the event is replaced by the facts' engine `text` lines (plain but true). The chronicle is never allowed to be
wrong. Validation stats (fail rate by rule) go into the turn record; a rising rate is a regression signal in the bench.

### 6.5 Style bible (system message excerpt; full rules in [10](10-narrative-events.md) §8)

- Third person limited, past tense; one POV per scene; senses before summary; people talk; courtesy as a weapon.
- Name people: "Ser Wylis Manderly", never "a knight" when the fact names him.
- The player's house is written like any other house, in the third person, by name.
- No game words, no meters, no modern idiom, no prophecy-speak, no moral.
- Headlines like a herald's cry, about a person: "Lord Umber marches the banners south". Not "The March".
- `line` = one sentence of plain fact for the collapsed card; `scene` = 2–5 sentences.

*(N10, implemented: the headlines suite, `bench/lib/headlines.js` + `bench/suites/headlines/weeks.json` (four games, six weeks each, played on the mock), `npm run bench -- --suite headlines` →
`bench/headlines-mock-<date>.md`. It tells every story of every week with the deterministic writer and holds it to `scoreCard`: pass rate 100 %, headline mean ≤ 9 / longest ≤ 12 words, no boilerplate, the headline
names someone or somewhere of its story (≥ 99 %), at least two verbs for a kind of story seen six times or more, at least 1.5 facts a card. `tests/headlines-bench.test.js` runs one game × six weeks in `npm test`;
`scripts/soak.js` scores every card it sees; `scripts/headlines-check.js` is the owner's live-model run. The writer is the floor a model's card is measured against.)*

## 7. The Director (story hooks)

**When:** once per jump (first segment), optional (Settings → *A director keeps the realm eventful*: off / light /
lively; default light = one hook per ~2 weeks of game time). **Goal:** when the facts would be thin, pick a grounded
**hook** from a catalogue and parameterise it; the engine instantiates it as intents/facts/matters.

- **Catalogue** (`data/hooks.js`, ~80 entries): *a hedge knight seeks service at {holding}*, *a septon preaches against
  {lord}*, *a quarrel over a mill between {vassalA} and {vassalB}*, *a maester's letter from the Citadel*, *outlaws on
  {road}*, *a merchant galley wrecked off {coast}*, *a sellsword company offers its swords*, *a lord's daughter elopes*,
  *a plague of fever in {town}*, *a bastard claims kinship*, *a wildling raid at {Gift village}*, *an ironborn reaver
  lands at {coast}*, *a boundary stone moved*, *a debt called in*, *a wedding invitation*, *a tourney announced*, …
  Each entry: required conditions, parameter types, the facts/matters/intents it creates, cooldown, region tags.
- **Schema:** `{ "hooks": [ { "hook": enum(eligible hook ids), "params": {…enums…}, "why": string ≤ 120 } ], maxItems 2 }`.
- The Director never touches canon-locked entities and never creates deaths of named characters.

*(B12, implemented: the catalogue is `public/data/hooks.js` (81 hooks), the engine's side `public/js/engine/director.js`
(`eligibleHooks`, `applyHook`, `pickHook`), the call `server/ai/calls/director.js` (schema `{hooks: [{hook, place, why}]}`:
the place is chosen from the hook's own places, not free params), and its place in the jump `server/director.js`. The
Director asks on a week's first day when its cadence is due, not only on the first segment; see DECISIONS D-040.)*

## 8. Voices: audiences, letters, council, advisor, counsel, polish

### 8.1 Audience (face to face)

> *Implemented in WP B10* ([DECISIONS D-034–D-036](DECISIONS.md)): `server/ai/calls/audience.js` (this schema; the
> verdict limits `agrees_to` to the request read from the words), `server/ai/calls/council.js` (council and advisor, §8.4),
> `server/letters.js` (§8.2: read and answered on the day a letter lands), `server/ai/context/officers.js` (B-15). The
> letter call of §8.3 comes with the minds' letters (D6).

Context: persona (history, nature, speech manner from `data/demeanours.js` / `voices.js`), mood (`temperament.js`
moods), what they know (their house's knowledge, *including the true state of musters and hosts they would know* —
fixes B-15), their opinion of the player's lord and why, their open commitments, the engine's **verdict** for this line
(`weighAudience`: obey/agree/bargain/stall/refuse/rage/yield/dismiss), the scene setting (where, who else is present),
the last 8 exchanges, and the player's words.

Schema:

```json
{ "type": "object", "additionalProperties": false, "required": ["beats", "outcome"],
  "properties": {
    "beats": { "type": "array", "minItems": 1, "maxItems": 6, "items": {
      "type": "object", "additionalProperties": false, "required": ["kind", "text"],
      "properties": { "kind": { "enum": ["narration", "speech"] }, "text": { "type": "string", "maxLength": 400 } } } },
    "outcome": { "type": "object", "additionalProperties": false, "required": ["agrees_to", "asks_for", "reveals", "mood"],
      "properties": {
        "agrees_to": { "type": "array", "maxItems": 2, "items": { "type": "object", "additionalProperties": false,
          "required": ["kind", "target", "by_days"],
          "properties": { "kind": { "enum": ["<commitment kinds allowed by the verdict>"] },
                          "target": { "enum": ["<places/parties/people/houses relevant>", "none"] },
                          "by_days": { "type": "integer", "minimum": 0, "maximum": 365 } } } },
        "asks_for": { "type": "string", "maxLength": 160 },
        "reveals": { "enum": ["none", "<secret ids this character holds and may reveal under this verdict>"] },
        "mood": { "enum": ["warm", "courteous", "guarded", "cold", "angry", "afraid", "amused"] } } } } }
```

The verdict **limits the enum**: a `refuse` verdict allows `agrees_to: []` only; `agree` allows the commitment kinds that
match the request; `bargain` allows commitments conditional on `asks_for`. Each `agrees_to` becomes a **Commitment**
([08](08-characters-politics.md) §9) with a sincerity rolled by the engine from nature and relations. Roose Bolton
agreeing to be at Moat Cailin within the fortnight creates `{by: roose_bolton, kind: 'march_to', params: {place:
moat_cailin}, dueDay: +14}` — and his host's orders change the next day (or do not, if he was lying; fixes B-14).

Servants and household (the player's own people) use a separate, shorter prompt: they obey and report; the Interpreter
is run on the player's words with the servant as the addressee, and the reply is written after the receipt, so the
servant describes what they are actually about to do.

### 8.2 Distance: letters instead of audiences

If the character is not at the player lord's location, the audience composer becomes a **letter**. The letter is a
`Letter` entity with real flight time (raven where both ends have rookeries: 200 miles/day; rider otherwise: 40
miles/day). The recipient's reply is generated **when the letter arrives** (during the jump that delivers it), by the
Audience call in letter mode, and flies back. Commitments made by letter are `publicity: 'private'` and date from the
reply's sending day.

### 8.3 Letter (NPC → anyone)

When a mind picks `send_letter`/`send_envoy`, a short call writes the letter body (≤ 180 words, first person, the writer's
voice). Schema: `{ "salutation", "body", "signature", "seal_description" }`.

### 8.4 Council and Advisor

- **Council** (group, the lord's own officers): each member speaks in turn, hearing the others; the schema is
  `{ "speeches": [ { "speaker": enum(member ids), "text" } ] }` with 2–6 speeches. Members have their officer knowledge
  (the steward sees the ledger, the master-at-arms sees the hosts and musters, the maester sees letters and the season,
  the spymaster sees the house's knowledge including rumours).
- **Advisor** (Pax Historia's advisor): one member answers at length with headings and bullets (the only place bullet
  formatting is allowed). Prewritten prompts shown as chips:
  - "Summarise what has happened since we began."
  - "What threatens us most, and what should we do first?"
  - "How do we stand against {largest neighbour}?"
  - "Can we afford a war? For how long?"
  - "Who among our vassals is least loyal, and why?"
  - "What would my father have done?" (flavour; the answer is in character)

### 8.5 Counsel ideas and Polish

- **Counsel ideas** (Pax "Help brainstorm"): 4–6 short suggested orders from the council, each **pre-interpreted** so
  clicking one adds it with its receipt already computed. Schema: `{ "ideas": [ { "text" ≤ 140, "why" ≤ 100 } ] }`.
- **Polish** (Pax "Enhance"): rewrites the player's draft into a clear, complete command in the lord's voice, keeping
  every intention, adding names/places the Interpreter will need. The player sees a diff and accepts or rejects.

## 9. Memory: the chronicle and consolidation

- **Engine memory is complete**: the fact log. The model's memory is a compact view of it.
- For every call, `context/memory.js` builds a **relevant memory** block (≤ 1.2k tokens): facts involving the actor/place/
  thread in question (most recent first), plus consolidated summaries of older periods that mention them. BM25 over
  fact text + summaries (`server/lore.js` generalised) retrieves the right lines.
- **Consolidator** runs in the background every ~30 game days: summarises the period's facts (engine truth) into
  "What happened" (engine-written, dated), "Still open", "Said, not confirmed" — the three-section format already in
  `maybeConsolidate` — and updates `threads`. Schema: `{ "open": [string ≤ 160] ≤ 8, "rumours": [string ≤ 160] ≤ 6,
  "summary": string ≤ 900 }`.
- `chronicle.md` remains player-editable; edits are read as **notes** ("The lord remembers…"), never as facts.

*(B13, implemented: `server/ai/context/memory.js` `relevantMemory` (lately / older / the chronicle's notes, BM25 from
`server/lore.js` `bm25Index`/`bm25Search`, the house's knowledge only, 1,200 tokens) given to minds, audiences and
letters when a model is asked; `server/ai/calls/consolidate.js` (schema as above; "What happened" is
`whatHappened(facts)`, the engine's; every open thread must name what the dossier names — the check, and salvage drops
the rest; the engine's own `openNow` is the mock and the fallback). DECISIONS D-041.)*

## 10. The Weaver (custom mechanics) — phase H, optional

The sandboxed DSL in `shared/rules.js` is kept. When re-enabled, the Weaver is a separate, rare call (≤ 1 per game month)
with a schema whose `kind` is an enum and whose `formula` is a string validated by the DSL parser **before** acceptance
(the existing checks). The Weaver sees only engine facts (what the story created: a smuggling ring, a new toll) and must
cite the fact that justifies the rule. Default off until the rest of the pipeline is stable.

## 11. Models

### 11.1 Hardware and constraint

Owner's PC: RTX 5070 12 GB, Ryzen 5 7500F, 32 GB RAM; llama-swap on port 8033 (`C:\llamaswap\config.yaml`); one model
resident at a time (`gpu` group, exclusive). **Use only the 64k-context profiles** (owner: the 256k profile is very slow).

### 11.2 Bench of 2026-09-27 (constrained decoding, thinking off)

Tasks: **A** Tywin's intent after Tyrion's seizure · **B** interpret "Send the bannermen gathered at Winterfell down to
Robb at Moat Cailin… Jon should go to the Wall with a few men." · **C** narrate three given facts.

| Model (llama-swap profile) | Gen tok/s | A (intent) | B (orders) | C (narration) | CJK leak |
|---|---|---|---|---|---|
| **Gemma 4 26B A4B QAT UD-Q4_K_XL** (`gemma4-26b-a4b`) | 45–69 | in character (cold demand to Stark), still passive | **banners → Moat Cailin, 6,300 men ✓**; Jon → `the_twins` ✗ (prefix pitfall) | faithful, good prose, fastest (≈ 8 s for 3 scenes) | none |
| Qwen3.6 35B A3B UD-Q4_K_XL (`qwen3.6-35b-a3b`) | 43–52 | weak ("send a letter to Kevan") | **failed** (four meaningless letters) | rich prose, ≈ 10–12 s; added "join the Wolf King", "weeks of war" | **yes** ("Um伯", "摆") |
| Qwen3.8 27B dense IQ2_S (`qwen3.8-27b-64k`) | 35–41 | passive | right subject/place, wrong verb (`send_letter`) | faithful, plainer, slowest (≈ 13 s) | none |

**Decision:** default all calls to **Gemma 4 26B A4B** (`gemma4-26b-a4b`, 64k, `--parallel 2 --kv-unified`). Keep
per-call routing in `config.json` so the narrator can be switched to Qwen3.6 for richer prose (with the CJK filter on).
Do not use the IQ2_S dense Qwen3.8 for the interpreter. Re-run `npm run bench` (§13) whenever a model or prompt changes.

### 11.3 Routing config

```json
"models": {
  "default":   { "model": "gemma4-26b-a4b", "slot": null },
  "interpret": { "model": "gemma4-26b-a4b", "slot": 1, "temperature": 0.2 },
  "mind":      { "model": "gemma4-26b-a4b", "slot": 1, "temperature": 0.6 },
  "director":  { "model": "gemma4-26b-a4b", "slot": 1, "temperature": 0.8 },
  "narrate":   { "model": "gemma4-26b-a4b", "slot": 0, "temperature": 0.85 },
  "audience":  { "model": "gemma4-26b-a4b", "slot": 0, "temperature": 0.8 },
  "consolidate": { "model": "gemma4-26b-a4b", "slot": 1, "temperature": 0.3 }
}
```

`slot` pins the request to a llama.cpp slot (`id_slot`) so the narrator's long static prefix stays warm on slot 0 while
minds churn slot 1. All routed models must be in the same llama-swap group profile, or the swap cost (≈ 20–25 s) is paid
per call — the router refuses a config that mixes models within one jump unless *Allow model swaps* is ticked.

### 11.4 Should we fine-tune?

**Not first.** The failures observed were caused by the task shape (one huge call, free JSON, 30 ops), not by model
capacity. The pipeline in this document gives the same models small, constrained tasks. Fine-tune only if, after phase B
([16-roadmap.md](16-roadmap.md)), the bench shows **Interpreter exact-action accuracy < 95 %** or **Mind
in-character rate < 85 %** (§13).

If needed, the plan (the implementing agent writes this recipe as runnable scripts under `scripts/finetune/` with a README; the owner or a rented GPU runs it — the agent cannot):

1. **Data:** every live call is already logged (`llm-log.jsonl`). Build `bench/datasets/{interpret,mind,narrate}.jsonl`
   from real prompts. Label targets by (a) engine validation (legal, receipt matched the player's intent as confirmed by
   the player not editing it), (b) a frontier model offline as a labeller for ambiguous cases, (c) the owner's
   corrections. Target sizes: 2,000 interpreter pairs, 1,500 mind pairs, 800 narration pairs.
2. **Model:** LoRA on the same base the game runs (Gemma 4 26B A4B) so the adapter drops into llama.cpp (`--lora`).
   Training a 26B MoE needs ≥ 48 GB VRAM: rent one A100/H100 for ~4–8 hours (Unsloth QLoRA, rank 16–32, 2–3 epochs).
   Local alternative: a small dense model (e.g. a 4–8B instruct) fine-tuned only for the Interpreter on the 12 GB card,
   routed via §11.3.
3. **Ship:** GGUF adapter in `C:\models\gemma4\adapters\`, a new llama-swap profile `gemma4-26b-a4b-wc`, bench before/after.
4. **Never** train on copyrighted book text; train on the game's own prompts and validated outputs.

## 12. Difficulty and canon-gravity text

Injected into Mind, Director, Audience and Interpreter prompts (one paragraph each), and mirrored by engine multipliers
([05](05-gameplay-loop.md) §7).

- **Very easy** — "The realm is inclined to favour House {player}. Its lords are receptive; its enemies hesitate."
- **Easy** — "Others act in their own interest but give House {player} the benefit of the doubt."
- **Normal** — "Everyone acts in their own interest, realistically. Plans that are unprepared or unrealistic often fail
  or backfire."
- **Hard** — "Rivals are shrewd and quick to exploit weakness; allies are cautious; unprepared plans fail."
- **Impossible** — "The great houses see House {player} as a threat. Nothing major succeeds without preparation, allies and
  leverage."
- **Canon** — "The realm tends towards the course of the chronicles: people act as they did, unless the world has
  changed so much that it no longer makes sense."
- **Loose** — "People keep their natures and ambitions, but the course of events is theirs to make."
- **Sandbox** — "Nothing is fated. Only what has happened is fixed."

## 13. Bench v2 (`npm run bench`)

`scripts/bench.js` is rewritten around labelled suites in `bench/suites/`. **The agent builds the suites and the runner and makes them pass against the `mock` and `replay` providers in CI (structure, scoring, report format); the owner runs them against the live model** and pastes the report into an issue/PR comment for the agent (see §14):

| Suite | Items | Metric | Gate |
|---|---|---|---|
| `interpret` | 200 orders (40 each for Stark, Lannister, a Riverlands lesser house, Night's Watch, Greyjoy) with expected intents | exact action match; param accuracy; clarification rate | ≥ 95 % exact; ≤ 10 % clarify |
| `mind` | 120 situations from the books (e.g. Tywin after Tyrion's seizure → call_banners/raid) with acceptable-verb sets | in-character rate (verb ∈ acceptable) | ≥ 85 % |
| `narrate` | 60 fact bundles | validator pass rate first try; judge score (1–5) for voice | ≥ 90 % pass; ≥ 3.8 |
| `audience` | 80 lines with verdicts | outcome obeys verdict; persona judge score | 100 % verdict; ≥ 3.8 |
| `latency` | a scripted 7-day jump | wall-clock by phase | Q3 |

A judge model scores voice (optional, offline, any capable model). Reports go to `bench/<date>-<model>.md`.

> *`narrate` built in WP B8* (D-031): sixty weeks of twelve seeded games in `bench/suites/narrate`, played on the mock
> and told again by the narrator under test; `npm run bench -- --suite narrate [--judge] [--record <dir>]` writes
> `bench/narrate-<model>-<date>.md`. CI holds the mock's plain telling to ≥ 98 % true on the validator.
>
> *`interpret` built in WP B6* (D-019): 275 orders (55 × Stark, Lannister, Mallister, Night's Watch, Greyjoy) in
> `bench/suites/interpret`, and a hold-out of 25 in `bench/suites/interpret-holdout`; `bench/lib/interpret.js` scores
> them (exact, params, clarify, receipts, and how many the pre-parser reads alone and how many of those are right).
> `npm run bench -- --suite interpret [--reader rules|model] [--holdout] [--record <dir>]` writes
> `bench/interpret-<reader>-<model>-<date>.md`. CI gates the pre-parser (≥ 95 % on the suite, ≥ 80 % on the hold-out,
> ≥ 60 % read alone at ≥ 98 % precision, every action with a receipt) and the mock through the whole call path.

## 14. Building and testing without a model (the implementing agent's situation)

The agent that implements this GDD runs in a cloud VM with GitHub access only: **no GPU, no llama-swap, no local model,
no access to the owner's PC** ([00-agent-brief.md](00-agent-brief.md)). Everything in this document must therefore be
buildable and CI-testable with **no model at all**, and must degrade gracefully on the owner's machine if the model
misbehaves. Three providers make that possible (`server/ai/providers/`):

| Provider | What it does | Used by |
|---|---|---|
| **`mock`** (exists, to be rewritten) | For every call kind, a deterministic, **rule-based** implementation that reads the same context object the prompt builder uses and returns a **schema-valid** reply: the Interpreter mock uses the deterministic pre-parser and picks the first legal action; the Mind mock picks the behaviour-tree fallback's verb; the Narrator mock writes each story from its facts' engine text with light templated prose ("{POV} watched as {text}"); the Audience mock obeys the verdict with stock lines by mood. Seeded; no randomness outside `ctx.rng`. | CI, soaks, the owner's "Mock mode" |
| **`replay`** (new) | Replays recorded real-model replies from `tests/fixtures/model/<kind>/*.json` by matching a **context fingerprint** (call kind + a hash of the salient fields). Unmatched calls fall through to `mock`. | Regression tests that exercise the real model's quirks (prefix pitfall, CJK leak, over-long strings, wrong-but-legal choices) |
| **`openai`** (exists) | Any OpenAI-compatible server (llama.cpp via llama-swap on the owner's PC). Sends `response_format: json_schema`. | The owner |

Contract every AI call must satisfy (enforced by `tests/ai-contract.test.js`; *implemented in WP B5*, each call a
module in `server/ai/calls/`, run by `server/ai/client.js`):

1. A JSON schema builder, a context builder, a prompt builder, a validator, a **mock implementation**, and a fallback.
2. The mock's output validates against the same schema the real model receives.
3. The call never throws into the turn pipeline: on provider error, timeout, schema-invalid or validator failure, it
   returns the fallback and records why.
4. Token budget assertions: `estimateTokens(prompt)` ≤ the budget in §2.5 for a fixture world at its largest (a
   Stark game at turn 60 with 40 facts in the segment).
5. The prompt text for each call kind is snapshot-tested (`tests/__snapshots__/prompts/*.txt`) so a reviewer can read
   exactly what the model will be sent.

**Adversarial fixtures** (`tests/fixtures/model/adversarial/`): hand-written bad replies the validators must catch —
narration that moves a character who is elsewhere, invents a number, names "the Red Wedding" in 298, uses "morale",
contains CJK characters; minds that pick an illegal target; interpreter output with an alias that must be canonicalised
(`the_wall` → `castle_black`). Each fixture states the expected validator verdict.

**Recorded real outputs** from the owner's PC (2026-09-27, Qwen3.6-35B-A3B, Gemma 4 26B A4B, Qwen3.8-27B IQ2_S) are
committed under [`docs/gdd/assets/bench-2026-09-27/`](assets/bench-2026-09-27/) with the exact prompts and schemas that
produced them. Use them to seed `replay` fixtures and to calibrate the mock's realism; do not treat them as the new
prompts (those are yours to write, per this document).

**The owner verifies the real model** with scripts the agent ships: `npm run bench` (§13), `npm run playtest -- --house
stark --turns 12` (writes a report with every call's prompt, reply, latency and validator result), and a checklist in
`docs/HANDOFF.md`. The agent's final handoff states which model and llama-swap profile to use, the exact server flags,
per-call routing, and — if the owner's bench results fall below the §11.4 thresholds — the fine-tuning recipe, ready
to run.
