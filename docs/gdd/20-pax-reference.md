# 20 · Pax Historia reference: what to copy, what to beat

> Audience: the next lead agent. Reference game: the **official Pax Historia** only (never "Open Historia", a different,
> unofficial thing). Research date 2026-09-29. This file is a practical brief, not a clone spec. It feeds
> [17](17-ui-declutter.md) (U1–U9), [18](18-headlines.md) (N1–N10) and [19](19-realm-ledger.md) (R1–R7). Target
> mockups will live in `docs/mockups/` (being made by another agent); when they land, they beat any schematic here.

---

## 1. What could and could not be verified

Be honest about the evidence: the game's own wiki and site blocked the fetch tool, so **fine UI detail is thin**.
The owner's description (title, short plain summary, clean map) is the strongest evidence for the event format and is
treated as ground truth for that part.

| Source | Status | What it gave |
|---|---|---|
| https://www.paxhistoria.co (official site) | Reached, but only a stub: "An alternate history sandbox game", a "Get Started" link | Confirms the official domain and tagline. No UI detail. |
| https://wiki.paxhistoria.co/wiki/Basic_Gameplay , /Getting_Started , /Main_Page | **403 to our fetcher**; only search-engine snippets seen | Snippets (below) on Actions, Chats, Advisor, Jump Forward. |
| https://paxhistoria.miraheze.org/wiki/Basic_Gameplay (mirror) | **403 to our fetcher**; snippet only | Same as above. |
| https://www.ycombinator.com/companies/pax-historia and https://www.ycombinator.com/launches/PMu-pax-historia-user-ai-powered-gaming-platform | Reached | The core loop in one line: players "make actions, start diplomatic chats, and jump forward in time", and "the map shows any changes from player actions". YC-backed alpha, creators publish maps and scenarios. |
| https://www.startuphub.ai/ai-news/reviews/2026/pax-historia-review-ai-grand-strategy-game | Reached | Three phases: plain-language actions, a time jump "from one week to one year", then narrative reports. Chat is "freeform diplomatic conversation with AI-simulated heads of state, generals, and advisors". Also an Advisor. Reviewer's caution: "prompt engineering dressed up as a grand strategy game". |
| https://playpile.gg/games/pax-historia , https://kotaku.com/games/pax-historia | Reached | Generic: browser, turn-based, map editing, custom scenarios, "AI generating events based on your inputs". No UI detail. |
| YouTube "Pax Historia Tutorial - How to Play" https://www.youtube.com/watch?v=7WR4klE0cSM | Listed in search; **page did not load** for us (no description or chapters) | Not verified. It is the first place to look for visuals. |
| Reddit, Discord announcements | Not reachable / not indexed by our search | Nothing verified. Search engines only say Discord is very active, Reddit semi-active. |

Search-snippet facts about the main screen (from the wiki, unverified by direct fetch, treat as probably right):

- "click on the lightning symbol (⚡) on the bottom-right" opens the **Actions** panel.
- Chats open from "the 💬 icon in the bottom-left"; then "Start New Chat".
- The player uses "Chats, Actions, Advisor, and Jumping Forward", and after the round sees "the Events and consequences".
- The map is dragged and zoomed; "each polity (country) is represented by regions which it owns".
- Everything costs model tokens (rate limit for free models).

**Uncertain, do not build as fact:** the exact look of the Events list (whether it is a side panel, a modal after the
jump, or both), whether each event has an expandable body, whether nations' "headlines" are a separate feed, the
exact jump-length picker, and where the Advisor lives. These come from the owner's description and general knowledge,
not from a page we could read. If a task depends on one of them, ask the owner for a screenshot or a timestamp.

## 2. Where to look (links and what to look at)

Do not download or commit their images. Look at these, then design in our own style.

| Link | Look at |
|---|---|
| https://www.paxhistoria.co | The Get Started flow: how quickly you reach a map. |
| https://wiki.paxhistoria.co/wiki/Basic_Gameplay | The sections "Actions", "Chats", "Advisor", "Jumping Forward", "Events" (open in a browser; our fetcher gets 403). Screenshots of the icons' positions. |
| https://wiki.paxhistoria.co/wiki/Getting_Started | The first-run steps and the starting map. |
| https://www.youtube.com/watch?v=7WR4klE0cSM | Tutorial. Suggested checkpoints (unverified, adjust when watched): the opening screen with the map alone; opening ⚡ and typing an action; the jump and the events that follow; opening a chat. Note the seconds you find and write them into `docs/mockups/README` when it exists. |
| https://www.ycombinator.com/launches/PMu-pax-historia-user-ai-powered-gaming-platform | The launch post's short clip or images of a full screen with the map star. |

The owner's own example of the event format (from [18](18-headlines.md) header): title "Robb Stark slain by Tywin
Lannister at the Battle of the Green Fork", summary "Robb charged foolishly into the Lannister centre…". That single
pair is the north star for the whole of N1–N10.

## 3. The screen as we understand it (schematic, not a screenshot)

```
+--------------------------------------------------------------------------------+
| [date / turn]                                              [menu / settings]   |
|                                                                                |
|                                                                                |
|                     M A P   (regions coloured by owner)                        |
|                     drag to pan, wheel to zoom                                 |
|                     click a region: a small card of that country              |
|                                                                                |
|                                                                                |
| [💬 Chats]                                                        [⚡ Actions] |
+--------------------------------------------------------------------------------+
   Advisor, Jump Forward (time length), Events: behind these buttons/panels
   (exact placement UNCERTAIN)
```

What stays on screen: the map, the date, two or three round buttons. What sits behind buttons: the action box, chats,
advisor, the time-jump choice, and the events of the last jump. There are no stat bars, tech trees or sliders
("no fixed tech trees, no administrative sliders" in reviews).

The turn loop, in their words: write actions in plain text, pick how far to jump (a week to a year), read what
happened, look at the changed map.

```
   write actions  ->  jump forward  ->  AI simulates  ->  events listed  ->  map changes
   (⚡, free text)    (1 wk .. 1 yr)    (tokens)          (title + summary)    (borders move)
        ^                                                                          |
        +--------------------------------------------------------------------------+
   chats (💬) with other countries can happen at any time in between
```

## 4. The event card as we understand it (schematic)

```
+----------------------------------------------------------+
|  Robb Stark slain by Tywin Lannister at the Green Fork   |   <- TITLE: says the whole thing
|                                                          |
|  Robb charged into the Lannister centre and was cut      |   <- SUMMARY: 1-3 plain sentences,
|  down before his reserve could reach him. The North      |      what happened, no numbers dump,
|  has no heir in the field.                               |      no game words
+----------------------------------------------------------+
   one card per event, newest turn's cards together, read top to bottom
```

Point of the format: a player who reads **only titles** knows the turn; one who reads the summaries knows why.
Whether Pax adds a third layer (details, map pin, per-nation headlines) is uncertain; we already have ours (§7).

## 5. What we take from it: the anatomy of a good headline

These restate and extend H1–H10 / S1–S6 in [18 §2.2–2.3](18-headlines.md). They are what N1's scorer and N3's writer
must enforce; use the pairs in §5.2 as golden-set seeds for N1 (`bench/suites/headlines`).

### 5.1 Rules (headline)

1. **A person is the subject, not a party or a house.** Name the doer: "Greatjon Umber", not "Host of House Umber".
2. **Active verb, past or present, one clause.** No "is raised", no "sets out" without who and where to.
3. **Say the outcome, not the process.** "Robb Stark slain", not "Battle near the Green Fork fought".
4. **Name the place only when it is the story** ("at the Green Fork"), or it moves the map. Otherwise leave it to the pin.
5. **No numbers in titles**, except a number that *is* the news ("Six northern houses march for Winterfell").
   Round to words: "thousands", "a dozen".
6. **No game or ledger words:** levies, strong, morale, works, charter, ~48 days, the host now numbers.
7. **One story, one card.** Six musters are one headline (roll-up), not six.
8. **Who did it to whom is in the title** for deaths, captures, betrayals, marriages, wars.
9. **Twelve words or fewer, no full stop.** Title-case is not needed; sentence case reads calmer.
10. **The title must survive on its own** in the strip, the pin and the turn-end list, with the summary hidden.
11. **Real names in the right form.** "The Free Folk", not "House The Free Folk"; "King's Landing", not "House
    Baratheon of King's Landing".
12. **Only what the player knows.** A rumour is told as a rumour ("Word from the Reach: ..."); never leak a hidden
    truth (see R2 and 19 §5, N5 validator).

### 5.2 Good and bad pairs (Westeros, 298 AC)

| # | BAD (today's engine style) | GOOD |
|---|---|---|
| 1 | Host of House Umber (150 men) is raised at Last Hearth | Greatjon Umber raises his men at Last Hearth |
| 2 | House Stark calls its banners: 19 sworn houses are summoned to Winterfell. | Robb Stark calls the northern banners to Winterfell |
| 3 | Host of House Karstark, 1,796 strong, sets out from Karhold for Winterfell (~48 days). | Lord Karstark marches south with his host |
| 4 | Host of House Karstark sets out / Umber sets out / Manderly sets out (3 cards) | Six northern houses march for Winterfell |
| 5 | House The Free Folk calls up 45,000 levies at Mance Rayder's host | Mance Rayder gathers the wildlings beyond the Wall |
| 6 | House Bolton begins works at The Dreadfort: charter a market & fair. | Roose Bolton opens a market at the Dreadfort |
| 7 | House Arryn holds a tourney at The Eyrie; 16 houses send knights | Ser Rodrik Cassel wins the tourney at the Eyrie |
| 8 | House Lannister and House Stark meet in battle near The Twins; the field is House Lannister's. | Lannisters beat Robb Stark's van at the Twins |
| 9 | Rickard Karstark is dead | Rickard Karstark dies in his bed at Karhold |
| 10 | Rickard Karstark, Lord of Karhold, has died of old age, aged 61. (as a title) | Lord Karstark's son takes Karhold |
| 11 | House Tallhart joins The Banners of Stark | Tallhart men join Robb at Winterfell |
| 12 | Alester Florent leaves Brightwater Keep with 110 knights and riders under the Florent banner | Ser Alester Florent rides to Highgarden |
| 13 | House Arryn calls up 9,977 levies at The Eyrie | Lysa Arryn arms the Vale against the Lannisters |
| 14 | Robb Stark is slain: cutting blow in the fighting. | Robb Stark slain by Tywin Lannister at the Green Fork |
| 15 | House Baratheon of King's Landing holds a tourney | King Robert holds a tourney at King's Landing |
| 16 | The King rides north. Men say he means to... | King Robert rides for Winterfell |
| 17 | Refugees flee a besieged holding (mass event on the map) | Smallfolk flee Harrenhal's siege |
| 18 | Supplies of the host are short; morale falls (2 cards) | Robb's army goes hungry outside Riverrun |
| 19 | Diplomacy: House Tully accepts the proposal of House Stark | Tullys agree to march with the North |
| 20 | Raven received from The Eyrie (importance 3) | Lysa Arryn refuses to send men |

Note: rows 7, 10, 14 mean the **fact slots must carry the doer/victim/place** (N2/N3); a model may not invent them
([18 §3.3](18-headlines.md)).

### 5.3 Summary rules (with S1–S6 in 18 §2.3)

1. **One to three plain sentences**, 45 words or fewer. Sentence one adds what the title cannot (why, how, who else).
2. **Never repeat the title.** If the summary says the same thing, cut it or add the cause.
3. **Cause and consequence, not mechanism.** "The Lannisters held the ford; the North lost its way south."
4. **Numbers are rounded and rare**; exact figures go into the collapsed `details[]`.
5. **No cut-off text.** A summary ends on a full stop, never on "…" (today's `clip()` bug, 18 §1.2 item 8).
6. **Third person, present or simple past, no game voice**, no "you"/"the player" except for the player's own orders.
7. **Voice is plain.** GRRM-style flavour lives in the optional `scene` (importance 4+), not in the summary.
8. **Never claim more than the fact says.** Facts are the history; the words are a view of them (CLAUDE.md "Never").

## 6. How many, and how important

| Question | Rule (Pax-like calm, Westeros scale) | Tie |
|---|---|---|
| Events per turn shown on the always-on strip | **3 to 5 cards**; the strip shows at most 3 at a time, the rest behind "More" | U3, N7, N9 |
| Cards in the turn-end digest | **5 to 8** ordered by tier then score; roll-ups count as one | N4, N9 |
| Everything else | Behind one line, "Meanwhile: ..." (a single sentence), and the Inbox / Ledger | N9 (Meanwhile), U3 |
| Long jumps (a season+) | Digest **by week or by month**, not by day; still 8 or fewer per section | N7 |
| Player's own affairs | Always shown, ahead of equal-importance news elsewhere (`mine: true`) | N6, N9 |

How importance is conveyed (calmly, no exclamation marks):

- **Order first:** great, major, news, minor, meanwhile (tiers in 18 §2.1). The most important card is first.
- **Size and weight:** great = larger title with a scene line; news = one line title + one line summary; minor =
  title only; meanwhile = one grey sentence. No coloured badges, no numbers on chips.
- **A single accent tick** on the left edge for `mine: true` and one for deaths of named people; nothing else glows.
- **Map echo:** only great and major cards get a pin on the map (N8); minor stays in the strip.
- **Never** show `importance: 4` or a score to the player.

## 7. The always-on screen for Westeros Chronicles

Pax's rule: the map is the star, chrome is a few buttons. Ours, mapped to [17 §2](17-ui-declutter.md):

```
+--------------------------------------------------------------------------------+
| 12 Third Moon 298 AC  Winter, 3 days       (vitals: gold, food, men: 1 line)  [End turn]  [Menu] |   U1, U2
|                                                                                |
| +------------------+                                                           |
| | Headline strip   |            THE MAP (living parties, pins, fog)            |   U3, N7
| | 3 cards, 1 line  |                                                           |
| | each; [More]     |            click a place, host or person: a card          |   U4
| +------------------+                                                           |
|                                                                                |
| [ Command your house...                                        ] [orders chip] |   U3 command bar
+--------------------------------------------------------------------------------+
   Behind buttons: Realm ledger (R4), Inbox, Chats/letters, People and trees (U9), Settings
```

Always on: date, one vitals line, the End turn button, a three-button menu (Ledger, Inbox, Settings), the headline strip
(max three cards), the command bar, the map with pins. Everything else opens on demand and closes on Esc:

- **Ledger** (R1–R7): houses, wars, economy, lands, rumours. Closed at start; a small pip shows something changed.
- **Cards from the map** (U4): a castle, host, person or region opens a card next to it; one card at a time.
- **Focus mode / auto-hide** (U8): hide the strip and vitals on request; hide idle chrome after a few seconds.
- **First-run coach marks** (U8) that vanish; no permanent tutorial text.
- **Never removed:** portraits and family trees (CLAUDE.md, U9); they move behind card clicks, they do not go away.

## 8. What we should do better than Pax Historia

Pax is a text-first engine with a static, region-coloured map. Ours is a simulation with facts. Use that.

| Where we beat it | How (owner-facing) | Tie |
|---|---|---|
| **Living parties on the map** | Hosts, ravens, smallfolk and riders move every frame along real roads; a headline's place tag flies the camera there; a click on the party opens its card. Pax's map only changes after a jump. | U4, N8, `map3d/life.js` |
| **Knowledge fog** | The player sees only what their house could know: a rumour reads as a rumour, an estimate as "roughly", a hidden truth stays hidden. Headlines and the ledger share one filter. Pax has no fog to speak of. | N5 validator, R2, 19 §5 |
| **Day-by-day playback** | A turn is really days; the jump plays back as a short feed, each day's events one by one, the party markers walking the map, then the digest. Pax shows the result. | N7, U3 |
| **Facts behind every line** | Every headline links to its facts and numbers under "Details"; nothing said is invented. Pax's AI can contradict itself (reviews). | N6, N10 |
| **Numbers you can trust** | The Realm ledger shows figures with honest tiers (exact, rough, unknown), ranks and trends; Pax has no such tables. | R1–R4 |
| **Deterministic mock and scorer** | Headlines are scored in CI without a model (N1, N10); Pax's quality depends on the model that day. | N1, N10 |
| **Diplomacy with consequences** | Chats and letters are proposals; the engine resolves them (CLAUDE.md "Never"); a chat is a card, not a wall. | 04, 10 |

## 9. Anti-patterns to avoid (from Pax and from our own audit)

- A long, wall-like events panel after every jump. Keep it to titles first.
- Free text that "works" or "fails" silently. Show a one-line receipt under the command bar (existing `receiptHtml()`).
- Jargon or model-flavoured boilerplate ("The tapestry of fate shifts...").
- Reviewers' warning that quality depends on how you word the prompt: our command bar should accept plain words and
  answer with a receipt, and the engine, not the phrasing, decides the outcome.
- Adding always-on widgets "just in case". Each new one must remove one, or live in the Ledger.

## 10. Work-package map (where each point lands)

| Point | Packages |
|---|---|
| Headline anatomy, pairs, golden set | N1 (scorer), N2 (labels and slots), N3 (writer), N5 (validator), N10 (bench) |
| Summary rules, no clipping | N3, N5, N6 (card shape and aliases) |
| Events per turn, roll-ups, tiers | N4, N9 |
| Feed, digest and jump playback UI | N7, U3 |
| Importance conveyed by order, size, pin | N8, N9, U3 |
| Always-on screen, three-button menu, cards from the map | U1, U2, U4, U8 |
| Ledger as the deep view (not on screen) | U6, R1–R4, R6 |
| Knowledge fog | N5, R2, U7 (rumours tab) |
| Portraits and trees kept | U9 |

## 11. Owner checks (short)

1. Read a turn's strip with the summaries hidden: can you say what happened from titles alone?
2. Count: at most three cards on screen at rest; the digest at most about eight.
3. Search the feed for digits and words from the game-word list: they should be nearly absent.
4. Screenshot at 1920x1080 and 1366x768 next to the Pax tutorial's opening frame (§2): the map should be at least as
   clear, with only the elements in §7 visible.
5. Compare against `docs/mockups/` when it exists.

## 12. Open items

- Watch the tutorial video and the wiki's Events section in a browser, then fix §3–§4 where the schematics are wrong;
  record timestamps in §2.
- Ask the owner whether Pax's nation "headlines" are a separate feed (not verified here) before N7 treats them as one.
- If any Pax detail here is corrected, record the departure or the correction in `DECISIONS.md`.
