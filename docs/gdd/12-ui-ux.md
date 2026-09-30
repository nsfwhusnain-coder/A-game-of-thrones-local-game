# 12 · Interface and experience

> Fixes root cause R5 ("cluttered", "AI-slop"). The map and the chronicle are the game; everything else appears when
> asked. Reference for the loop and minimalism: the official Pax Historia (four corner controls, a full-bleed map, events
> that play out one by one). Files: `public/index.html`, `public/css/style.css`, `public/js/app.js`,
> `public/js/ui/*.js`.

---

## 1. Principles

1. **The map is the screen.** In the planning phase with nothing open, the map occupies ≥ 85 % of the screen.
2. **Four corners, one strip.** Persistent chrome is: a slim top bar (date, stop reason, Jump), a 4-item resource strip,
   the Command/Audience controls bottom-left, the council portrait bottom-right. The chronicle is a collapsible panel.
   Nothing else is always on screen.
3. **Numbers with meaning.** Every number carries a unit and, where it matters, what it means ("9 moons of war").
4. **Receipts, not toasts.** An action's result is shown where the action was taken (under the order, on the card) and
   persists until read. Toasts are for transient confirmations only.
5. **In-world words.** "Jump", "moon", "raven", "host", "the realm"; never "turn processing", "AI", "LLM", "tokens" in the
   main UI (they live in Settings → Model and in diagnostics).
6. **No emoji, no native dialogs, no native tooltips for important information.** SVG icons only (`ui/icons.js`);
   in-world confirm modals (existing `confirmModal`); styled tooltips.
7. **Progressive disclosure.** Card → Book → detail. A card answers "what is this and what can I do"; the Book answers
   "how does my realm stand".

## 2. Layout

### 2.1 Planning phase, nothing open (1920×1080)

```
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ ▣ HOUSE STARK   12th day · 9th moon · 298 AC · late summer        Stopped: a raven from Riverrun │ 48 px bar
│   ⛁ 63,900  ⚔ 10,500  ❦ 9 moons  ♜ 52                                         [ Jump ▸ ▾ ]    │ strip
│                                                                                     [Realms ▾]   │
│                                                                                                  │
│                                                                                                  │
│                                        THE MAP (full bleed)                                      │
│                                                                                                  │
│                                                                                                  │
│                                                                                                  │
│ ┌────────────┐                                                                                   │
│ │ Chronicle ›│  (collapsed tab with unread count)                                                │
│ └────────────┘                                                                                   │
│ [ ⚡ Command ]  [ ✉ Audience · 2 ]                                                    ( portrait )│
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Top bar (left):** the house crest (click → the Book, Realm tab), date and season. **Centre-right:** the stop reason
  (after a jump) or, during playback, the day counter and playback controls. **Right:** the Jump button with its menu,
  the settings cog, the menu.
- **Resource strip** (under the crest, 4 items): **Coin** (dragons; hover: income/expenses this moon, war chest in
  moons), **Men** (your men under arms in hosts + levies uncalled; hover: by host), **Food** (moons of stores for your
  people; hover: your hosts' rations), **Standing** (score; hover: the six measures). Click any → the Book tab.
- **Bottom-left:** **Command** (opens the composer panel), **Audience** (opens the audience/letter panel; the badge counts
  unread letters and replies).
- **Bottom-right:** the ruler's (or regent's) portrait → the **Council** panel.
- **Map-mode control:** top-right under the bar, a single dropdown.

### 2.2 Planning phase with panels

- Panels open from their corner and never overlap each other: the composer and audience panels share the left column
  (one at a time, 420–480 px wide); cards open anchored near their map object (or in the right column if space is
  short); the Book is a centred overlay (≤ 1100 px wide) that dims the map.
- The chronicle panel (left column) and the composer can be open together: the chronicle above, the composer docked at
  its foot (as today) — the only stacked pair.

### 2.3 Playback

```
│ ▣ HOUSE STARK   5th day · 9th moon · 298 AC            ▮▮ Pause  › Next  ⏭ Skip  ■ Stop here      │
│ ┌ Chronicle ─────────────────────┐                                                                │
│ │ ● 3rd day · Winterfell          │                     (camera flies to the event)                │
│ │ LORD UMBER MARCHES THE BANNERS  │                                                                │
│ │ SOUTH                            │                                                                │
│ │ The Greatjon sat his horse like  │                                                                │
│ │ a boulder …                      │                                                                │
│ │ ○ 5th day · Castle Black …       │                                                                │
│ └──────────────────────────────────┘                                                                │
```

Cards appear top-down in day order; the current card expanded, others collapsed to headline + line.

## 3. Design system

> **Status:** Superseded for colour, materials, shape and motion by [21 — Art direction](21-art-direction.md) (D-062); §3.2 type and §3.4 components stand, restyled there.

`public/css/tokens.css` (new; `style.css` imports it). The house theme (existing `THEMES` in `common.js`) sets the
`--house-*` variables.

### 3.1 Colour

| Token | Value | Use |
|---|---|---|
| `--ink-900` | `#0f1216` | deepest background (map letterbox) |
| `--ink-800` | `rgba(20,23,28,0.88)` + `backdrop-filter: blur(8px)` | panels |
| `--ink-700` | `#232830` | raised elements |
| `--line` | `rgba(201,165,90,0.22)` | hairlines |
| `--parchment` | `#efe6d2` | letters, matters, scene text surfaces |
| `--parchment-ink` | `#2b2118` | text on parchment |
| `--text` | `#e8e2d4` | primary text on ink |
| `--text-dim` | `#a9a293` | secondary |
| `--gold` | `#c9a55a` | primary actions, focus, the player's realm |
| `--ok` | `#7fa36a` | receipts ✓ |
| `--warn` | `#d0a24a` | receipts ⚠ |
| `--fail` | `#b4574b` | receipts ✗, war |
| `--house-1`, `--house-2` | from `THEMES` | accents: crest frame, player markers |

Contrast: all text ≥ 4.5:1 against its surface (checked by a test over computed styles).

### 3.2 Type

- **Display:** Cinzel (small caps feel), for titles, headlines, the house name. Letter-spacing 0.06em.
- **Body:** EB Garamond 16 px / 1.45 at 1920 (scales with UI scale), 15 px minimum at 1366.
- **Numbers:** `font-variant-numeric: lining-nums tabular-nums` everywhere a number sits in a column or strip.
- Scale: 12 / 14 / 16 / 18 / 22 / 28 / 36 px. No text under 12 px ever.

### 3.3 Space, shape, motion

- 4-pt grid: 4, 8, 12, 16, 24, 32, 48. Panel padding 16–24. Radius: panels 8, cards 6, chips 4.
- Elevation by blur + a 1 px `--line` border + one soft shadow; no heavy drop shadows.
- Motion: UI 160 ms, panels 240 ms (ease-out), map transitions per 11 §11. `prefers-reduced-motion`: no slides, no
  camera flights (cuts instead), no banner sway.

### 3.4 Components

`button` (primary gold, secondary outline, quiet text), `chip` (options, clarifications, filters), `receipt-line`
(✓/⚠/✗ icon + text + ETA), `card` (title, portrait/crest, facts, actions), `tabs`, `list-row`, `meter` (only in the Book),
`tooltip` (styled, instant after 250 ms hover, touch: tap-and-hold), `modal` (in-world confirm), `letter` (parchment,
seal), `toast` (bottom-centre, 3 s), `skeleton` (loading shimmer in panels), `empty-state` (a line of in-world text).

> **Built (Q1, 2026-09-30, D-081):** the composer is one input with a quill (send) and a microphone (speak); the spelling is put right by rule and, where set up, by a small model on the CPU
> (`docs/local-ai/SCRIBE.md`). The "Counsel" button described below was removed at the owner's word.

## 4. The Command composer (Pax Historia's Actions panel)

```
┌ Commands for the jump ─────────────────────────────── ✕ ┐
│ ┌──────────────────────────────────────────────────────┐ │
│ │ Send the bannermen at Winterfell down to Robb at     │ │
│ │ Moat Cailin. Jon rides for the Wall with five men.   │ │
│ └──────────────────────────────────────────────────────┘ │
│   ✓ The banners at Winterfell (6,300) march to join Robb │
│     at Moat Cailin — ~9 days                             │
│   ✓ Jon Snow rides for Castle Black with 5 men — ~12 days │
│   ⚠ Winterfell keeps 195 men; the household is thin      │
│ ┌──────────────────────────────────────────────────────┐ │
│ │ Write to Lord Tully: we will stand with Riverrun.    │ │
│ └──────────────────────────────────────────────────────┘ │
│   ✓ A raven to Hoster Tully at Riverrun — arrives ~3 days │
│                                                          │
│ [ Tell your house what to do…                        ]   │
│ [ ✦ Counsel ideas ]  [ ✎ Polish ]           [ Add ↵ ]    │
└──────────────────────────────────────────────────────────┘
```

- Enter adds; Shift+Enter newline; each order is editable in place; ✕ removes.
- While interpreting: a skeleton line "Your steward reads the order…" (≤ 5 s).
- Clarification: chips under the order ("Which host? [The Host of the North] [The Winterfell garrison]").
- **Counsel ideas:** 4–6 suggestion chips from the council; hovering shows why; clicking adds it (already interpreted).
- **Polish:** shows the rewritten order as a diff; Accept / Keep mine.
- The Jump button shows a small count "3 commands" and warns on conflicts.

## 5. Numbers with meaning (display rules)

| Figure | Display | Meaning line (hover or card) |
|---|---|---|
| Coin | `63,900` + dragon glyph | "about 9 moons of this war" / "a year of peace's surplus" / "an ocean of gold" (Lannister) |
| Income | `+1,900 a moon` | "rents 1,100 · tribute 1,300 · the host eats −2,400 …" |
| Men | `10,500` | "in the field: 10,500 (Host of the North) · at home: 7,400 uncalled" |
| Food | `9 moons` | "for your people; the host has 22 days of rations" |
| A host's morale | "steady" (words: eager ≥ 80, steady 60–79, weary 40–59, shaken 25–39, breaking < 25) | never a number outside the Book's detail row |
| Distances | "~9 days" (never map units, rarely miles) | miles on hover |
| Others' figures | "~20,000?" with a report age | "a raven from Lord Vance, 6 days old" |

## 6. The chronicle panel

- **Cards:** headline (Cinzel, 16–18 px), a meta line (date · place · house crests), the one-line text; expand for the
  scene; a footer ("It happened on the 3rd; the raven came on the 6th", "Rumour — said in King's Landing").
- **Your order** cards quote the order in italics above the scene ("Lord Eddard commanded: …").
- **Meanwhile** line: one per segment, dim, expandable to the list of happenings.
- **What changed** block at the top after a jump (05 §6).
- **Threads to follow** (collapsed, ≤ 8).
- **Filters** (icon row): all · your house · war · court · letters · rumours.
- Clicking a card's place flies the map there; a card's crests open the house card.

## 7. Audience, letters and council

### 7.1 Audience panel

```
┌ Robb Stark · Moat Cailin · by raven (arrives ~3 days) ── ✕ ┐
│ ( portrait )  Robb Stark, heir of Winterfell               │
│               loyal · eager · trusts you                    │
│ ─────────────────────────────────────────────────────────── │
│  (parchment scene / letters, oldest first, voiced on click) │
│ ─────────────────────────────────────────────────────────── │
│ [ Speak or write…                                      ] ↵  │
│  Promises: Lord Bolton — his men at Moat Cailin by the 20th │
└─────────────────────────────────────────────────────────────┘
```

- Face-to-face shows "here, at Winterfell"; distant shows "by raven (arrives ~N days)"; a letter's reply appears when it
  lands (the panel shows "in flight").
- Mood and patience as words and a small candle that burns down (not a bar with a number).
- Outcome chips after an NPC line: "✓ agreed: his men at Moat Cailin within 14 days" / "✗ refused".
- Voices: the speaker icon plays the scene (existing `playScene`).

### 7.2 Letters

An envelope list (unread first) with seal, sender, date sent/received; opening shows the letter on parchment; *Reply*
opens the audience panel in letter mode.

### 7.3 Council (bottom-right portrait)

Officers' portraits in a row (steward, maester, master-at-arms, spymaster, castellan; empty seats with *Appoint*); the
prewritten questions as chips ([04](04-ai-system.md) §8.4); answers as speeches in turn; *Let them talk* (existing).

## 8. Cards

Anchored to the map object; 360–420 px; closable with Esc; one per kind at a time (a second click replaces it).

- **Character:** portrait, name, titles, age, where (and doing what: "riding to Last Hearth, 3 days out"), house crest,
  nature tags (from scales, [08](08-characters-politics.md) §2), opinion of you in words with the top reason, promises to
  you, family (click → tree), secrets you know, voice picker (existing), actions: *Speak/Write*, *Invite*, *Appoint*,
  *Betroth…*, *Imprison* (if in your custody)…
- **Holding:** name, owner crest, type, population in words ("a great castle and ~150,000 souls in its lands"), who is
  there now (lord, guests, hosts), stores in moons, walls (fort as words: "strong walls"), status (besieged, …),
  buildings, actions: *Works…*, *Garrison…*, *Grant…*, *Besiege* (enemy), *March here* (with a host selected).
- **Host:** as [07](07-military.md) §13 — plus the muster timeline, orders, standing orders, supply, and the
  *March now / Wait for the banners* pair while mustering.
- **House:** crest, words, head, liege and vassals, relation with you and why, known strength (reported), pacts, wars.

## 9. The Book (the ledger)

Opens with **L** or from the strip/crest. Tabs: **Realm** (standing, ambitions, holdings, vassals' temper), **Hosts**
(all your parties, musters, fleets), **Coin** (the moon's ledger lines, loans, creditworthiness, works), **People**
(family, household, court, prisoners), **Diplomacy** (relations with reasons, pacts, wars, promises made/owed),
**Knowledge** (what you know of others: hosts reported, rumours, secrets you hold), **Chronicle** (the world log and the
long chronicle, filterable). Each tab: a summary header of ≤ 4 figures with meaning, then lists. Meters appear only
here, always with words.

## 10. Matters (sealed letters)

A pin on the map (a wax-sealed letter, pulsing gently) and a count on the Jump button. Opening shows a parchment letter:
who asks, the situation (≤ 3 sentences), options as large buttons with a one-line hint each ("Answer the call — ~2,500
men march for Riverrun; Lord Hoster is pleased"), *Answer in my own words* (a text field → the Interpreter, with a
receipt before confirming), and "The King will not wait: 6 days left". Silence is shown as an option ("Say nothing —
the King will take it as a refusal").

## 11. Title, house choice, loading, end

- **Title:** the painted map breathing behind; the game title; *Continue* (the last campaign: crest, ruler portrait,
  date) and *New chronicle*.
- **House choice:** a region filter row, a searchable grid of crests (Great Houses first), a detail pane (banner, words,
  ruler portrait, 3-line situation, 3 strengths/weaknesses as short lines, difficulty & canon gravity selectors with a
  one-line explanation each), one **Begin** button. (The current screen is close; declutter it: remove the scenario
  essay block once only one scenario exists — show it as a one-line subtitle.)
- **Loading:** the house banner, the words, a book quote (existing), a real progress line ("Unrolling the map… 62 %").
- **End:** existing end screen restyled (epitaph, the chronicle's verdict, play on / undo / new house).

## 12. Settings (tabs)

**Game** (difficulty, canon gravity, ironman, how much the realm thinks, a director keeps the realm eventful, narrator
detail, mature content) · **Display** (UI scale, text size, reduced motion, colour-blind-safe realm palette) ·
**Graphics** (Fast / Balanced / Beautiful + advanced toggles) · **Sound & voices** (existing) · **Model** (provider,
endpoint, per-call routing, test connection, show diagnostics — collapsed under "Advanced"). The current single long
modal is replaced.

## 13. Accessibility and input

- Full keyboard: Tab order through corners and panels; arrow keys in lists and chips; Enter/Space activate; Esc closes
  the top-most panel; focus rings (existing `:focus-visible`).
- ARIA: dialogs, tabs, live regions for receipts and the chronicle (existing work kept).
- Keys: **Space** jump · **Shift+Space** jump menu · **C** command · **A** audience · **K** council · **L** the Book ·
  **M** map mode · **P** pause playback · **→** next card · **S** skip · **Home** your seat · **F** follow · **?** help.
- Colour-blind-safe palette option for map modes (Diplomacy uses blue–orange with hatching for war).
- Screen sizes: 1920×1080 (reference), 1366×768 (must be fully usable: panels 380 px, strip wraps to icons), 1024×768
  (usable, panels overlay the map). No horizontal scrolling anywhere.

## 14. Interface acceptance checklist (gate Q8)

Every item is checked at 1920×1080 and 1366×768, by a Playwright script where possible (DOM/geometry assertions) and
by screenshots attached to the PR:

1. With nothing open in planning, ≤ 6 persistent UI regions are visible and the map covers ≥ 85 % of the viewport.
2. No two open panels overlap (bounding boxes), except the documented chronicle+composer stack.
3. No text renders below 12 px; body text ≥ 15 px at 1366.
4. No emoji characters in the DOM (regex over text nodes).
5. No `title=` attribute carries more than 60 characters (long explanations use styled tooltips).
6. No `window.confirm/alert/prompt` calls in the codebase (grep test).
7. Every number in the strip, cards and Book has a unit or a meaning line.
8. Every async action shows an in-world loading state within 150 ms and a result or error within its latency budget.
9. Every receipt line is one of ✓/⚠/✗ with text; no order ends with no receipt.
10. Esc closes the top-most panel; focus returns to the opener.
11. All interactive elements reachable by keyboard; visible focus ring.
12. Text contrast ≥ 4.5:1 (computed styles test).
13. Map labels never overlap each other or a plate (label layout data assertion).
14. The Jump button's stop reason never names a future beat (a test over `turns.js`/stop reasons against beat titles).
15. The strip shows exactly 4 figures; everything else is one click away.
16. Reduced motion: no camera flights, no slide-ins (check computed transitions with the media emulation).
17. Settings have tabs; the Model tab is collapsed under Advanced.
18. The chronicle shows ≤ 12 main cards per 7-day segment and exactly one Meanwhile line.
19. Dark/light: all surfaces use tokens (no hard-coded colours outside `tokens.css` except the map).
20. The title → first order → jump → playback → matter flow completes with no console errors (Playwright, mock mode).

## 15. Portraits, family trees and "who is who" (owner: keep and improve — never remove)

The owner likes seeing **who they are playing, who their family is, and the family trees of houses they do not know**.
The procedural painted portraits (`ui/portrait.js`, `data/looks.js`), the family data (`data/families.js`) and the
family-tree view are **kept** and are a priority to *improve*, not a candidate for simplification. No work package may
remove or hide them.

### 15.1 Portraits

Keep the painter; improve:

1. **Everywhere a person appears, their face appears:** chronicle cards (the POV and the main actor as small roundels),
   receipts that name a person, letters (the sender's seal and face), matters (who asks), host cards (leader and lords
   riding), holding cards (who is there), the council, the resource strip's ruler crest, the end screen.
2. **Family resemblance:** a child's `looks` derive from both parents (hair, eyes, jaw, nose) with seeded variation, so
   the Stark children read as Tullys or Starks as the books say (Robb, Sansa, Bran, Rickon Tully-red; Arya and Jon
   Stark-long-faced); generated kin (`generateKin`) inherit too.
3. **Age over time:** portraits re-render on name days (every year) — children grow, the old grey; stored as
   `looks.age` breakpoints so the painter changes build and features across 0–5, 6–12, 13–17, adult, 50+, 70+.
4. **Marks of the story:** wounds and losses show (a scar, an eyepatch, a missing hand if it ever happens in the
   campaign, a burned face), captivity (bars, existing), death (sepia with a ribbon, existing), the black of the
   Night's Watch when a character takes the black, a crown when crowned.
5. **Mood in audiences:** the audience portrait takes a subtle expression by mood (warm, guarded, angry, afraid) — a
   brow/mouth parameter in the painter, not a new image.
6. **Consistency:** the same person always renders identically (seeded by id + age breakpoint), cached in IndexedDB
   (existing lazy painting kept).
7. **Owner-supplied art stays supported:** `public/portraits/<id>.png` overrides (existing). The agent may add a
   script `scripts/portraits/generate.js` that calls a **local image model on the owner's PC** (the owner has
   Qwen-Image 2.1 on llama-swap, OpenAI-compatible `/v1/images/generations`) to paint portraits from `looks.js`
   descriptions in a consistent house style, writing to `public/portraits/` — the agent writes and documents it; **the
   owner runs it** (the agent cannot).

### 15.2 Family trees

The tree view is kept and becomes a first-class screen (the Book → People → *Family tree*, and *Family tree* on every
character and house card):

- **Generations** laid out top-down with marriages as double lines, children under the couple, birth order left to
  right; the living in colour, the dead in sepia with the year and cause of death on hover; bastards with a dashed
  link and their regional surname; wards and hostages shown as a dotted "living with" link to the house that holds them.
- **Where everyone is now and what they are doing**, one line under each portrait ("at King's Landing — a hostage",
  "riding with the Host of the North").
- **Succession highlighted:** the heir line in gold; "next in line" numbers; the effect of a death or a legitimisation
  previewed on hover ("If Robb dies: Bran inherits").
- **Claims and marriages across houses:** a toggle shows in-laws and the houses married into (the Tully–Stark–Arryn
  knot), with links that open the other house's tree.
- **Any house, even unknown ones:** every house's tree is available, with members the player's house would know
  (lords, heirs, spouses) and "unknown" nodes where the knowledge system says the player does not know (a bastard kept
  secret stays hidden until revealed).
- **Pan, zoom and search** inside the tree; click a person to open their card; right-click → *Speak/Write*, *Propose a
  match*.
- **Ancestors:** the dead ancestors already in `families.js` (Rickard, Brandon, Lyanna, …) appear with a short line of
  history from `histories.js`.

### 15.3 Who is who

- **Names are links.** In chronicle cards, letters, receipts and audience scenes, every roster name is a link (dotted
  underline) that shows a hover card (portrait, name, house crest, one line: title and where they are) and opens the
  full card on click. The narrator validator already finds these names (04 §6.4); reuse its matcher.
- **House cards** for houses the player has never dealt with: crest, words, seat on the map, head of house with
  portrait, liege and vassals, three lines from the house's history (`data/histories.js`/`briefs.js`), the family tree
  button, and what the player's house knows of their strength (reported).
- **People browser** (the Book → People): search by name or title; filter by house, region, role (lords, ladies,
  knights, maesters, captives, at court, in your realm); sort by importance; each row with portrait, where, doing what.
- **"Who is this?"** in audiences: the panel header shows how the person relates to the player's lord ("your wife's
  sister", "your bannerman", "the Queen's brother").

Acceptance additions to §14: (21) every chronicle card with a named actor shows that actor's portrait roundel;
(22) every character card has a working *Family tree* button; (23) every house (all ~250) opens a tree without errors;
(24) names in chronicle text are links for ≥ 95 % of roster names present (test over a fixture turn).
