# 17 · Declutter: a quiet screen, a deep ledger

> **Reconciled with [19 — The State of the Realm](19-realm-ledger.md):** the ledger's data, knowledge filter, API and panel
> are specified there (work packages R1–R7) and supersede this document's U5–U7 wherever they differ (e.g. the
> `state.realmStats` sample rather than `state.trends`; the hotkey is `R`, the Realm button of §2.2 below — not `S`, which
> pans the map: 19 §6.1, [DECISIONS](DECISIONS.md) D-070). R1–R3 are built (Slice 2); the ledger's window is R4. U1–U4, U8
> and U9 stand as written.

> Owner feedback: "The UI is very cluttered — too much information, too many panels, too many things to look at. Hide it
> gracefully, the way big games do. Show what matters all the time; hide the rest behind a few buttons. This is an AI
> simulation: the player watches the world and gives orders in plain words, so they should not face economy and military
> buttons all the time. Keep those views as info panels somewhere hidden — house strengths, economies, growing or shrinking,
> what the AI uses — so I can see where the realm is going and where to focus."
>
> This document refines `12-ui-ux.md` §1–§2 (whose four-corner layout was never fully built) and adds a new view, the
> **State of the Realm**. Reference: the official Pax Historia only. Files: `public/index.html`, `public/css/style.css`,
> `public/js/app.js`, `public/js/ui/{drawer,windows,pins,common}.js`, `public/js/map3d/*`.
> Never degrade portraits or family trees (CLAUDE.md, `12` §15): this plan only moves them, and makes them better.

---

## 1. Audit: what is on screen today

Measured from `public/index.html`, `renderTop()`/`renderPlayer()` in `app.js`, `drawer.js`, and the screenshots
`docs/screens/d5/opening-*.jpg`, `docs/screens/e2/mode-*-1920x1080.jpg` and `-1366x768.jpg` (planning phase, turn 0,
nothing opened by the player).

### 1.1 Always-on chrome (before the player has touched anything)

| # | Element (id / class) | Where | What it shows | Verdict |
|---|---|---|---|---|
| 1 | `#res-row` → 6 `.res` tiles (Treasury, Levies, Men-at-arms, Ships, Food, Season) | top-left, ~1000 px wide at 1920 (about 3/4 of the width at 1366) | 6 labels, 6 values, 6 sub-lines ("+6,917 … +11,412 a moon", "realm ~49,490", "guard 150", "realm ~41", "fields are full") plus a bar | Too much. Keep 3 vitals; the rest moves to the Ledger. |
| 2 | `#date-box` (+ `.turn` "Turn 0", + "N decisions awaiting you") | top-right | date, turn counter, pending matters | Keep date; drop "Turn N" from the default view. |
| 3 | `#turn-until` | top-right | "next turn: 7 days — a quiet week" | Fold into the turn button's sub-label. |
| 4 | `button.advance-btn` "End turn ▶" | top-right | the turn button | Keep. The most important control. |
| 5 | `.sys-btns`: `data-action` ravens, music (`#music-btn`), undo, help, settings, menu | top-right, 6 icon buttons | | Too many. Collapse into one `☰` menu (ravens stays as a badge on the Letters tab). |
| 6 | `#drawer` (left, `--drawer-w` 22–31 rem) with `#drawer-tabs` (Chronicle / Letters / Audience / collapse) and `#drawer-body` | left column, full height (~30 % of width) | the feed, letters, audiences | Right idea, always open and too wide. Becomes a headline feed that collapses to a strip. |
| 7 | Feed: "Your situation" card (`briefFor()` in `drawer.js` `renderFeed`), Aims, Levers | top of `#drawer-body` at turn 0 | 5 lines of prose + 2 lists | Keep once, dismissible; never again after turn 1. |
| 8 | Feed: `<details class="howto">` "How to play" | below it, open at turn 0 | 11 bullets, about 25 lines | Remove from the feed; the same text is `showHelp()` (`?`). Replace by 3 coach marks (§2.6). |
| 9 | `#command` composer inside `#drawer`: `#orders` (`.errands-chip`, order rows with receipts), `#order-input`, "✨" (`suggest`), "＋" (`add-order`) | foot of the drawer | the command bar | Keep, but promote to its own bottom-centre bar so it survives when the drawer collapses. |
| 10 | `#mapmodes`: 9 buttons (Realms, Holders, Diplomacy, Knowledge, War, Wealth, Prosperity, Unrest, Terrain) | top-right column, 9 rows | | 9 is too many. One dropdown (per `12` §2.1), 3 pinned favourites. |
| 11 | `#map-legend` | bottom-right when a mode is on | | Keep; only when a non-default mode is active, auto-fade after 6 s. |
| 12 | `#hud-player`: `#player-banner` (hidden by CSS), `#player-portrait` + `#player-name` (+ `.regency-note`), `#action-ring` with **8** round buttons Realm, Council, Military, Economy, Diplomacy, Intrigue, People, Chronicle | bottom-right, about 30 rem wide | | This is the "economy and military buttons all the time" the owner objects to. Replace by 3 buttons (§2.2). |
| 13 | `.dock-badge` on Realm/Military/Diplomacy, `#raven-badge`, `#letters-count` | | 3 different badge systems for "something needs you" | Unify in one Inbox count. |
| 14 | Map overlays: army/fleet tokens with numbers ("~35,300", "~? SHIPS"), region names, pins (`ui/pins.js`), castle diamonds | map | up to 30 labels at once in the screenshots; some collide (KINGSLANDING/SHIPS, LANNISTER/~300) | Map LOD/label declutter (U8). |
| 15 | `#pick-hint`, `#tooltip`, `#toasts` | transient | fine | Keep. |

Counted from the screenshots: at 1920×1080 turn 0 there are **about 40 discrete controls or read-outs** on screen
(6 resource tiles, 2 date lines, 1 turn button + label, 6 system icons, 3 drawer tabs, 2 large text cards, 1 input +
2 buttons, 9 map modes, 8 dock buttons, portrait + name, plus map tokens). At 1366×768 the left drawer plus the top
bar plus the bottom dock cover about 55 % of the pixels; the map is what is left.

### 1.2 Windows (opened on demand, but each is a wall)

`openWindow(name)` in `ui/windows.js` renders one right-hand `#window` (`#win-body`): `realm()`, `council()`,
`military()`, `economy()`, `diplomacy()`, `intrigue()`, `people()`, and (via `showChronicle()`) the chronicle. Each is a
long scroll of rows. `#sheet` (`openSheet('char'|'hold'|'army'|'house')`) is the second panel, so window + sheet + drawer
can be open at once (three columns). The keys R C M E D I P H open them (`keydown` handler in `app.js`).

### 1.3 Root causes

1. The **resource strip and the dock present the simulator's inputs as if the player pushed them**. In this game the
   player *speaks* and the AI *does*; buttons for economy/military invite micromanagement the game does not want.
2. **Three always-open text regions** (drawer, feed, orders) plus the strip compete for reading.
3. **Everything is at the same level**: no notion of "vital" versus "look when curious".
4. **First-run help is permanent furniture** (turn 0 shows the situation card and 11 bullets; a player who has played
   50 turns never sees them, but a player at turn 0 sees a wall).
5. **No overview view.** The player cannot answer "where is my realm going?" except by opening five windows, because
   turn-over-turn history is not kept for anyone but the player (§3.3).

---

## 2. Target design

Principles (in priority order):

1. **The map is the screen.** Nothing opened, nothing in flux: at least 85 % of the pixels are map (gate in U9).
2. **Five always-on things, and no more**: the date, the turn button, three vitals, the command bar, the headline
   strip. Everything else is one click, one hotkey, or a click on the map.
3. **Progressive disclosure, three levels**: *glance* (HUD) → *card* (contextual, anchored to the map object) →
   *book* (the Realm ledger / windows). Each level is reached from the previous one.
4. **The player speaks; menus are for reading.** Economy and Military stop being verbs' homes. Their reading views live
   in the Ledger; their acting is done by typing (orders) or by a card on the thing itself (a host, a castle).
5. **Attention is pulled, not pushed.** A single Inbox count and a pulsing pin say "something needs you"; nothing else
   moves.

### 2.1 The always-on HUD

```
Always visible (6 groups):
  A  Crest + date          top-left    "HOUSE STARK · 18th day, 8th moon, 298 AC · summer"
  B  Three vitals          top-left    Coin · Men · Food   (each: value + one trend arrow; colour only when bad)
  C  Turn button           top-right   "End turn ▶" with its stop-reason under it ("7 days — a quiet week")
  D  Menu + Inbox          top-right   one "☰" (menu) and one "✉ 3" (letters + matters + audiences)
  E  Command bar           bottom-centre  input, ✨ counsel, order chips above it (max 3 visible)
  F  Headline strip        left edge   latest 3 headlines, one line each; expands to the full chronicle
```

The three vitals are the *ones the engine can lose the game on*: **Coin** (treasury with sign of the moon's net; the
hover shows the range `project()` already computes), **Men** (levies + men-at-arms + hosts, one number; hover: the
split), **Food** (moons of stores, red under 4). Ships, guard, realm totals, season name: hover of the vitals and the
Ledger. The season becomes an icon beside the date (sun/leaf/snow), which also feeds the existing `setMood()`.

Bottom-right keeps the ruler's **portrait** (`#player-portrait`, click = character sheet, unchanged; a regent shows the
regent, `regencyLine()` moves to the portrait's hover). It is a portrait, not a menu; the space it shares with the dock
today is freed. Portraits get better (§5).

### 2.2 The menu: three buttons, not eight

Bottom-left of the command bar (or the `☰` menu at 1366 px), three round buttons replace `#action-ring`:

| Button | Key | Opens | Replaces |
|---|---|---|---|
| **Realm** (crest) | `R` | the **State of the Realm** (§3): ledger, houses, trends, wars | Realm, Economy, Military (read view), Diplomacy (read view) |
| **People** (portraits) | `P` | People window: court, family tree, who is who, council (advisors) | People, Council, Intrigue (spies shown as a section) |
| **Chronicle** (scroll) | `H` | full chronicle + letters + audiences | Chronicle, Letters, Audience tabs |

Old hotkeys keep working and route into the new views (`M` opens the Ledger on its Wars tab, `E` on Economy, `D` on
Houses, `C` on People→Council, `I` on People→Shadows) so nothing is lost for keyboard players.
`openWindow(name)` keeps its names; the three buttons call it with a `section` argument (§U4).

Anything that used to be an **action** in those windows stays reachable, but from the object, not the menu:
click a host on the map → army card (march, halt, muster: `armySheet()`); click a castle → holding card (works,
garrison: `holdingSheet()`); click a person → character card (audience, gift, judge). The economy's tax setting and
project list become a section at the foot of the Ledger's Economy tab, with the plain-words alternative always
stated ("or just tell your steward: 'raise the tax'").

### 2.3 Headline feed instead of a wall

The left drawer (`#drawer`) is replaced by a **headline strip** (F): the last 3 events of importance ≥ 3, one line each
(icon + title + place), 22 rem wide, at the left edge under the top bar. Interaction:

- Click a headline: the camera flies to it and its card (the existing `.story` body: text, "The record") opens as a
  floating card beside the strip, not as a scroll.
- The strip grows to the full chronicle (`renderFeed()`, unchanged content) on `H` or on clicking its header; it
  collapses again on `Esc`, or by itself 8 s after the last interaction if the player did not pin it.
- During playback (`app.reveal`, `ui/playback.js`) the strip *is* the live feed: one headline at a time, as `12` §2.3.
- Unread ones carry a dot; the header shows `Chronicle · 2 new`. Importance ≤ 2 items fold into "+ 6 small happenings"
  (`.news-more`, already built).
- Letters and audiences are not tabs of the strip: they sit behind the Inbox (`✉`, D above), which opens a popover
  listing letters awaiting reply, matters (`decisionsHtml()`), and running audiences; choosing one opens the existing
  `renderAudience()` panel as a floating panel (left column, one at a time).

### 2.4 The command bar

`#command` moves out of `#drawer` into `#command-bar`, bottom-centre, 40 rem wide (100 % − 2 rem at ≤ 1100 px):

```
   ┌ order chips (max 3; "+2 more" chip opens the list, receipts under each) ─────────────┐
   │ ① Declare war on House Lannister …  ✓ DONE                                           │
   │ ┌ Command your house…                                                     ┐ ✨  ＋  │
   └─────────────────────────────────────────────────────────────────────────────────────┘
```

Rules: one text row (grows to 3 lines on focus and shrinks on blur); receipts (`receiptHtml()`) appear under a chip
only for the newest order or when the chip is clicked; the placeholder text is shortened to "Command your house…" with
the Enter / Ctrl+Enter hint moved to a `title` and the first-run coach mark. The `.errands-chip` ("2 under way · last
turn: 3 carried out") becomes a small pill on the left of the bar. `Ctrl+Enter` and the top-right `End turn` stay.

### 2.5 Contextual opening from the map (Pax Historia's cards)

The map is the primary navigation, so the menu buttons are needed less:

| Click | Card (existing sheet) | Also reachable from |
|---|---|---|
| a castle / city | `holdingSheet(id)` | a headline's place tag, the Ledger's holdings list |
| a host / fleet | `armySheet(id)` | the Ledger's Wars tab |
| a person | `characterSheet(id)` with portrait, `familyTree(id)` | People, headlines |
| a region / house colour | `houseSheet(id)` (house strengths row from the Ledger, §3.4) | Ledger's Houses tab |
| a pin | the news or matter it marks | Inbox |

Cards float **anchored next to the object** (right column if short of room), never over the command bar. `#sheet` stays
the single card slot (one card at a time), and `#window` (the Ledger) never opens together with the drawer at the same
width: opening the Ledger collapses the headline strip to its one-line form (already the layout rule: `.window` is on
the right, the strip is on the left, both narrow).

### 2.6 First-run guidance that goes away

- Turn 0: one dismissible **welcome card** (centre, not in the feed) with the `briefFor()` situation, Aims and Levers
  (existing strings), and one button "Begin". Never shown again after dismissal (`localStorage` `wc.welcomed.<saveId>`,
  wrapped in try/catch; the server also stores `meta.welcomed` so a fresh browser does not re-show it).
- **Three coach marks**, each a pulsing ring with one sentence, shown once, in order, and advanced by doing the thing:
  1. command bar: "Tell your house what to do, in your own words." (dismissed by adding the first order)
  2. turn button: "Then let the world move." (dismissed by the first End turn)
  3. Realm button: "See how your house stands against the others." (dismissed on first open of the Ledger)
- The "How to play" bullets live in `showHelp()` only (`?` in the menu); the `<details class="howto">` block is removed
  from `renderFeed()`.
- A **"Quiet UI" tip** after turn 3: "Press `F` to hide everything but the map."

### 2.7 Focus mode and auto-hide

- **Focus mode** (`F`, or the eye in the menu): hides HUD groups A–D and F, keeps the map and the command bar; a
  second press restores. During playback it also hides the command bar (`Space` pauses/resumes).
- **Auto-hide while the map is dragged or zoomed**: the strip and cards fade to 25 % opacity while `pointerdown` is held on
  the map (CSS class `body.map-active`), restore on release. Nothing is removed from layout.
- **Collapsible** everything: strip, cards, Ledger have a `⟨` collapse; the state is remembered per viewer in
  `localStorage` (`wc.ui`), with the layout defaulting to the quiet state if the key is unreadable.
- **Idle dim**: 20 s without input in planning phase dims the vitals to 60 %.
- All hidden things are reachable by keyboard, remain in the DOM with `aria-hidden` set correctly, and the skip link
  (`.skip-link` → `#order-input`) still works.

### 2.8 Map modes

`#mapmodes` (9 always-visible buttons) becomes `#mapmode` (one button "Realms ▾", top-right below the date) that opens
a list: Realms, Holders, Diplomacy, Knowledge, War, Wealth, Prosperity, Unrest, Terrain. `M`-cycling stays (existing
`modes.js`). The legend `#map-legend` shows only in a non-default mode. The **default mode is Realms**. The Ledger has
"Show on map" buttons per column (Wealth, Prosperity, Unrest) so the player can jump from a number to its map.

### 2.9 Wireframes

**1920×1080, planning phase, nothing open** (target). Map ≥ 88 %.

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ ▣ STARK · 18th day, 8th moon, 298 AC ☀      ⛁ 120,000 ▲   ⚔ 17,200   ❦ 30 moons          ✉ 3  [End turn ▶]  ☰  │  56 px
│                                                                                       7 days · a quiet week    │
│ ┌ Chronicle · 2 new ───────┐                                                                  [ Realms ▾ ]     │
│ │ ● Lord Umber musters ▸   │                                                                                    │
│ │ ● A raven from Riverrun ▸│                                                                                    │
│ │ ○ Snow falls at the Wall │                     THE MAP (full bleed)                                           │
│ └──────────────────────────┘                                                                                    │
│                                                                                                                 │
│                                                                                                                 │
│                                                                                                                 │
│ (Realm)(People)(Chronicle)   ┌ ① Declare war on House Lannister      ✓ ┐                              ┌──────┐  │
│                              │ Command your house…              ✨  ＋ │                              │ face │  │
│                              └──────────────────────────────────────────┘                              └──────┘  │
└────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

**1366×768, planning phase, nothing open** (target). Same groups; the three vitals stay, the strip is one line high.

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ ▣ STARK · 18 Moon 8 · 298 AC  ⛁120k▲ ⚔17k ❦30        ✉3 [End turn ▶]  ☰            │ 48
│ ● Lord Umber musters ▸ (+2)                                       [ Realms ▾ ]        │
│                                                                                       │
│                                                                                       │
│                                  THE MAP                                              │
│                                                                                       │
│                                                                                       │
│ (Realm)(People)(Chron.)  ┌ Command your house…                     ✨ ＋ ┐    ┌────┐ │
│                          └──────────────────────────────────────────────┘    │face│ │
└──────────────────────────────────────────────────────────────────────────────┴────┴─┘
```

**1920×1080 with the State of the Realm open** (the Ledger is a right-hand panel; the strip shrinks to one line; the
command bar stays):

```
┌──────────────────────────────────────────────────────────────────────────┬─────────────────────────────────────┐
│ ▣ STARK · … ⛁ ⚔ ❦                                   ✉3 [End turn ▶]  ☰ │ STATE OF THE REALM              ✕  │
│ ● Lord Umber musters ▸ (+2)                                                │ [Houses][Wars][Economy][Lands][Rumours]│
│                                                                            │ House      Men   Coin  Food  Trend │
│                        THE MAP (dimmed 10 %)                               │ ▣ Stark   17k    120k  30m  ▲▁▂▅  │
│                                                                            │ ▣ Lannister 38k  410k  18m  ▲▂▅▇  │
│                                                                            │ ▣ Tully    9k     40k  12m  ▼▇▅▃  │
│                                                                            │  …  (click a row → house card)     │
│ (Realm)(People)(Chron.)  ┌ Command your house…             ✨ ＋ ┐  ┌────┐ │ Rising: Lannister · Falling: Tully │
│                          └──────────────────────────────────────────┘  │face│ │ Where to look: Food (Stark)…      │
└──────────────────────────────────────────────────────────────────────────┴────┴─────────────────────────────────────┘
```

At 1366 the Ledger is a centred overlay (≤ 92 vw, 82 vh) with a dimmed map; the strip and command bar are hidden while it
is open (Esc closes).

---

## 3. The State of the Realm (the Realm ledger)

One button (`Realm`, `R`), one panel, five tabs, all read-only except deep links into cards. It answers: *who is
strong, who is growing, who is falling, where is the war, where should I look?* — using the same numbers the AI
uses (the `figures`, `standing()` and the war and loan records), never new secret ones.

### 3.1 Tabs

1. **Houses** (default). One row per house **the player knows** (§3.5): sigil, name, rank, **Men** (levies + men-at-arms
   + hosts), **Coin** (treasury − debt), **Food** (moons), **Ships**, **Lands** (holdings, smallfolk), **Standing**
   (0–100 score with the six measures on hover), and a 12-turn **sparkline + arrow** for Men, Coin and Standing.
   Sort by any column; filter: my liege and vassals / my neighbours / Great Houses / all known. Above the table: a
   "Rising" and a "Falling" strip (top 3 each by 12-turn standing change), and a **"Where to look"** line of up to 3
   items chosen by rules (below).
2. **Wars.** Each war in `state.wars` (not ended) that the player's house knows: sides, casus belli, moons of war, sieges
   (`h.status`), hosts known (`viewOfArmies`) with ~men, "war weariness" if computed by `warTick`, and the player's
   part. Click a row → fly the map / open the host card. The old `military()` window's "your hosts" list appears here
   as "Your hosts" (with supply days: `supplyOf()`).
3. **Economy.** *My* house: income/expenses lines of the last moon (`house.ledger.at(-1).lines`), the moons' net as a
   24-point sparkline (`house.ledger` has 24 entries for the player), tax level, works under way (`state.projects`), debts
   and lenders (`state.economy.loans`), trade and customs (`tradeSection()`, `customsSection()` reused). Tax and works
   controls are kept at the foot ("or tell your steward…").
4. **Lands.** My holdings with prosperity and unrest meters and population, the trend of each (12 turns),
   `standingPanel()` (five measures), and a "Show on map" for Prosperity/Unrest. Reuses `realm()`'s holdings list.
5. **Rumours** (optional; U7). Facts the house has *heard* about others' growth: "House Bolton is said to be raising
   levies". Only from `knowledge` (no exact figures).

### 3.2 "Where to look" rules (deterministic, no model)

Each fires at most once per turn, is written in the game's voice, and links to the tab or card. Examples: Food under 6
moons and falling; Coin net negative for 2 turns; levies more than 25 % below the house's `levyCap`; a vassal's
`obligations.tribute` late; an unrest > 50 holding; a known enemy host within 6 days' march of a holding; a rival's
Standing up 8+ points in 6 turns. (The AI's own "what matters" is `04-ai-system.md`'s brief; this list is the
engine's cheap mirror of it: `briefFor()`, `standing()`, `project()`.)

### 3.3 Which state fields it reads, and whether history exists

Findings from the code (verified by grep):

| Need | Current source | Turn history? |
|---|---|---|
| Coin, levies, men-at-arms, guard, ships, food, income, debt | `state.houses[id].figures.{treasury,levies,menAtArms,guard,ships,food,income,debt}` = `{ v, asOf, src, confidence }` (`shared/world.js` `FIGURE_FIELDS`) | **Current value only.** Written by `economy.settle()` |
| Realm totals | `realmTotals(state, houseId)` (`shared/world.js`) | current only |
| Standing (lands, might, wealth, sway, blood, order, score) | `standing(state, id)` in `shared/standing.js`, computed on demand | **none** (a pure function of current state) |
| Prosperity, unrest, population, fort, status | `state.holdings[id].{prosperity,unrest,population,fort,status}`; drift in `economy.settle()` | current only |
| Income and expenses by line | `state.houses[id].ledger[]` entry `{turn,date,days,lines,income,expense,net,treasury,prevTreasury,food,reporter}` | **Yes, but only the player's house**: 24 entries kept for the player, 2 for every other house (`economy.js` line ~353), none for tribes and companies |
| Wars, sieges, pacts, loans | `state.wars`, `state.pacts`, `state.economy.loans`, holdings `status` | current only (ended wars stay with `status:'ended'`) |
| Turn records | `state.history[]` keeps the last **30** turns (`KEEP_HISTORY` in `server/game.js`); each `record` has events, orders, `ledger` (the player's only) and `applied`; full records in `saves/<id>/turns/000123.json` via `GET /api/games/:id/turns/:n` (`viewTurn()`) | events yes; **no per-house numbers** except the player's ledger |
| Snapshots | `saves/<id>/snapshots/000123.json.gz` (state before each turn, last 10 kept: `KEEP_SNAPSHOTS`), used for undo only | 10 turns, **full state, unfiltered, server-side only**; not exposed to the client and must not be (spoilers) |
| Facts | `state.facts` and `saves/<id>/facts` (`GET /api/games/:id/facts`, filtered by `knows()`) | every event, but text, not numeric series |

**Conclusion: there is no per-house time series today**, so "growing or shrinking, with sparklines" cannot be drawn
from existing data except for the player's own ledger. New work (U5): a compact `state.trends` series.

Proposed shape, written by `closeTurn()` in `server/game.js` (one place, after `state.history.push`), engine-side and
pure (`public/js/engine/state/trends.js`, unit-tested):

```
state.trends = { turns: [t, t, …],                      // last 48 turn numbers (ring)
                 byHouse: { stark: { men:[…], coin:[…], food:[…], ships:[…], lands:[…], pop:[…], score:[…] }, … } }
```

~48 turns × ~155 houses × 7 series × 4 bytes is ≈ 210 kB uncompressed in the save: prune to houses that matter (any house
with rank ≠ tribe/exile that is *known* at any point) or store only every 2nd point older than 24 turns. Values are the
**true** values; the view filters them (§3.5). `migrate.js` seeds `state.trends` from the last ledger entries for old saves
(the player's house only; others start empty and fill forward). Saves stay valid (field optional; `validate.js` allows it).

### 3.4 API

`GET /api/games/:id/realm` (new route in `server/index.js`, code in `server/view.js`): returns the *player's view* of the
Ledger — rows, sparklines, wars, "where to look", "rising/falling" — computed **server-side** from the true state and
**then filtered** (§3.5). The client draws it (`public/js/ui/ledger.js`, new). No client ever receives true foreign numbers
(mirrors `playerView()` in `server/view.js`, which already blurs foreign `figures` through `about()`).

### 3.5 Knowledge filtering (no spoilers)

Rules, all computed with `engine/knowledge.js` (`knowledgeOf`, `friendsOf`, `eyesOf`, `knows`, `newsOf`, `viewOfArmies`):

- **Own house, sworn vassals, and allies** (`friendsOf`): exact-ish figures from their reporting; trend series shown
  in full. Vassals report on the schedule of tribute (their figure carries `asOf`).
- **Other houses**: a row exists only if the player *knows of* the house (a fact about it has been `knows()`-visible, or
  it owns a holding in `eyesOf` sight, or it is a liege/neighbour named in a letter). Figures are `about()`-rounded to
  two significant figures, shown as "~", and carry their age (`ageText(age)`: "3 turns ago"), from
  `figures[f].asOf`/`confidence`. **Sparklines for unknown houses are drawn only from the points the player has been
  told**, not from `state.trends` directly: the view samples the series at the turns the house's figures were last
  updated/heard (`asOf`), so a rival's sudden collapse is invisible until word reaches you.
- **Hidden truths** (`hiddenTruths()`, secrets, plots, spies' identities, exact enemy levies): never in the Ledger.
  Enemy hosts appear only as `viewOfArmies` shows them ("~? men, by report").
- **"Rising / Falling"** is computed on what the player can see (their own known-series), so it can be *wrong*, which is
  the game's point (and the Knowledge map mode already shows freshness).
- The Rumours tab lists only `knows()`-visible facts.
- Test (U6): a fixture where a rival's true coin collapses in a hidden turn: the API returns the old figure with an age,
  never the new one; a house never mentioned to the player has no row.

### 3.6 Look and behaviour

- Uses the existing panel styling (`.window`, `.stat-grid`, `.row`, `.meter()`); no emoji (use `ui/icons.js`);
  sparklines are inline SVG `<polyline>`s, 64×16 px, colour by direction (up = green `var(--green)`, down = red);
  colour-blind safe (also an ▲/▼ glyph and a `title`: "Men: 12,400 → 15,900 over 12 turns").
- Tab state and sort remembered per viewer (`localStorage`, try/catch).
- Refreshes after each turn (`app.setState()` already re-renders `renderWindow()`); costs one fetch.
- The panel never asks for a model; it works on the mock provider and offline.
- Reachable in ≤ 1 click from the HUD (`R`), and from a vital: clicking Coin/Men/Food opens the Ledger on the matching
  tab and column (today `data-win-open` on `.res`).

---

## 4. Work packages

Order: U1 → U2 → (U3, U4) → U5 → U6 → U7 → U8 → U9. Every package: `npm run check` and `npm test` green on
windows-latest and ubuntu-latest; screenshots at 1920×1080 and 1366×768 (Playwright Chromium, SwiftShader flags from
CLAUDE.md) attached to the PR; a `docs/CHANGELOG.md` entry; the branch is `wp/u<n>-<slug>`. The `config.json`
`ui: 'v3'|'v4'` switch keeps the default branch playable while U1–U4 are unfinished (as CLAUDE.md asks for rebuilds).

### U1 · Quiet HUD (top bar, vitals, menu)
- **Scope**: `#res-row` from 6 tiles to 3 vitals (Coin, Men, Food) with a trend arrow; season becomes an icon by the date;
  `#date-box` loses "Turn N" (hover only); `#turn-until` becomes the sub-label of the End-turn button; `.sys-btns` (6) →
  one `☰` menu (Letters is not in it: it is the Inbox, U3); `.dock-badge`, `#raven-badge`, `#letters-count` unified to
  one Inbox count.
- **Files**: `public/index.html` (`#hud-top`), `public/css/style.css` (`.res`, `.sys-btns`, `#date-box`),
  `public/js/app.js` (`renderTop()`, `handleAction`), `public/js/ui/icons.js` (season icons).
- **Acceptance**: at 1920 and 1366, the top bar has ≤ 8 interactive elements and a height ≤ 56 px / 48 px; no text
  wraps at 1366; Playwright counts `#hud-top button, #hud-top .res` ≤ 8; hover on Coin still shows the `project()` range;
  a11y: `aria-label` on each vital; existing tests (`http`, `ui` if any) pass.
- **Depends on**: none.

### U2 · Three-button menu; retire the eight-button dock
- **Scope**: `#action-ring` → three buttons (Realm, People, Chronicle), keys R/P/H, legacy keys M/E/D/C/I routed into
  sections; ruler portrait stays bottom-right (`#hud-player`), banner stays hidden, regency note moves to the portrait hover.
- **Files**: `index.html` (`#hud-player`, `#action-ring`), `style.css` (`#hud-player`, `.action-ring`), `app.js`
  (`keydown` map, `renderTop` badges, `renderPlayer`), `ui/windows.js` (`openWindow(name, arg)` gains `{section}`).
- **Acceptance**: ≤ 3 buttons in `#action-ring`; each old hotkey still opens its content (Playwright presses R C M E D I P H
  and asserts the visible section title); portrait click opens `characterSheet`; 1366 layout has no overlap between the
  menu, the command bar and the portrait (bounding-box test).
- **Depends on**: U1 (badge unification), U4 for the sections it routes to (stub the sections until then).

### U3 · Headline strip, Inbox, and the command bar
- **Scope**: replace `#drawer` and its tabs with (a) the headline strip (3 lines, expandable to the full chronicle,
  auto-collapse), (b) the Inbox popover (`✉ n`: letters, matters via `decisionsHtml()`, audiences), (c) `#command`
  moved to `#command-bar` bottom-centre with order chips and one-line input; playback (`app.reveal`) feeds the strip.
- **Files**: `index.html` (`#drawer` → `#strip`, `#inbox`, `#command-bar`), `style.css` (the `LAYOUT v3` block at
  ~line 696 and `.drawer*`), `ui/drawer.js` (split: `renderFeed` → strip + full chronicle window; `renderLetters`,
  `renderAudience` unchanged but hosted in a floating panel), `ui/playback.js`, `app.js` (`toggle-drawer`, `ravens`).
- **Acceptance**: turn-0 screenshot has the command bar and ≤ 3 headline rows visible and no left column wider than
  22 rem; expanding the strip shows every story that the old feed did (test on a 3-turn mock game: same story count);
  an audience still opens and replies (`tests/audience.test.js` unchanged); `#order-input` is focusable by the skip link;
  during a jump the strip shows one headline at a time; reduced-motion respected.
- **Depends on**: U1.

### U4 · Contextual cards; windows become the Ledger's tabs
- **Scope**: make map clicks the main path (castle, host, person, house/region, pin) open `#sheet` cards; add "Hold court",
  "Works", "Call banners" as buttons *on* the holding/army cards where they belong; convert `military()` (reading part),
  `economy()` (reading part), `diplomacy()` (reading part) into Ledger tabs (U6) and People sections; leave the acting
  parts on cards or on the typed command with a plain-words hint. Cards anchor next to their object and never cover the
  command bar; `#window` and `#sheet` cannot both be wider than 45 % of the screen together.
- **Files**: `ui/windows.js` (`military`, `economy`, `diplomacy`, `intrigue`, `council`, `people`, `openSheet`, sheets),
  `app.js` (map click → `openSheet`), `map3d/MapScene.js` (pick events), `style.css` (`.sheet`, `.window`).
- **Acceptance**: no action available before U4 is lost (a checklist table in the PR: every `data-court`, `data-verb`
  and `doVerb` call site is still reachable); Playwright: click a castle → card, click a host → card, Esc closes;
  window + sheet never overlap the command bar at 1366 (bounding boxes).
- **Depends on**: U2.

### U5 · Trend history (`state.trends`)
- **Scope**: `public/js/engine/state/trends.js` (pure `recordTrends(state)` and `sampleKnown(series, asOf)`), called from
  `closeTurn()` in `server/game.js`; ring of 48 turns; migration for old saves (`state/migrate.js`); `validate.js`
  accepts it; the `KEEP_HISTORY` and undo paths keep it consistent (undo restores it with the snapshot, since it lives
  in `state`); determinism check: trends never feed back into the simulation (no RNG, not read by any tick).
- **Files**: `public/js/engine/state/{trends,migrate,validate}.js` (new/edit), `server/game.js`, `tests/trends.test.js` (new).
- **Acceptance**: unit tests: series length ≤ 48, one point per turn, per-house `men/coin/food/ships/lands/pop/score`
  equal `standing()`/`figures`; a save from before U5 loads and starts filling; undo n turns removes n points; save size on
  a 60-turn mock game grows ≤ 300 kB; replay determinism test (`tests/replay*.test.js` if present, else `jump.test.js`)
  unchanged.
- **Depends on**: none (can run in parallel with U1–U4).

### U6 · State of the Realm: API and panel (Houses, Wars, Economy, Lands)
- **Scope**: `GET /api/games/:id/realm` (§3.4) with the knowledge filter of §3.5 in `server/view.js`; panel
  `public/js/ui/ledger.js` (tabs, sort, filters, sparklines, "Rising/Falling", "Where to look" rules of §3.2); wire the
  `Realm` button (`R`), vitals click-through, "Show on map" buttons; reuse `standingPanel()`, `vassalRow()`, `warRow()`,
  `moonAccounts()`, `tradeSection()`, `customsSection()`.
- **Files**: `server/index.js`, `server/view.js`, `public/js/ui/ledger.js` (new), `public/js/ui/windows.js` (`realm()`
  becomes the ledger host), `public/css/style.css` (`.ledger*`, `.spark`), `tests/ledger.test.js` (new), `tests/http.test.js`.
- **Acceptance**: **knowledge tests** (mandatory): a house never met has no row; a rival's hidden collapse is not visible
  until news arrives; figures are rounded with an age; hidden truths absent from the payload (search the JSON for known
  secret ids). UI: on a mock game at turn 5 the Houses table lists ≥ 10 rows, sorted by Men by default, with 3-series
  sparklines; Rising/Falling show at least one house each; "Where to look" is empty rather than made up when nothing
  fires; Playwright screenshots of all four tabs at 1920×1080 and 1366×768 (overlay at 1366, no horizontal scroll); the
  panel opens within 250 ms after a turn on the mock provider.
- **Depends on**: U5 (sparklines) and U2 (the button); the tables can ship first with arrows only if U5 slips.

### U7 · Rumours tab and "why is it moving" hovers
- **Scope**: Rumours tab from `knows()`-visible facts about other houses' growth or decline; hover on a trend arrow
  shows the cause the engine already records (`figures.levies.why`, the ledger's lines, `warTick` weariness); everything
  in the game's voice.
- **Files**: `ui/ledger.js`, `server/view.js`, `engine/facts/kinds.js` (tags if needed), `tests/ledger.test.js`.
- **Acceptance**: no fact the player does not `knows()` appears (test); each arrow has a non-empty reason for the player's
  own house; screenshot of the hover.
- **Depends on**: U6.

### U8 · First-run, focus mode, auto-hide, and map declutter
- **Scope**: welcome card and 3 coach marks (§2.6, remove `.howto` block from `renderFeed()`); `F` focus mode;
  `body.map-active` fade; idle dim; map mode picker `#mapmodes` → one dropdown `#mapmode` with the legend fading;
  map tokens/labels: cap simultaneous army/fleet tokens by zoom (`map3d/lod.js`, `labels.js`, `tokens.js`) to ≤ 12 at the
  default zoom (nearest to the player's holdings first), fix the collisions seen in `docs/screens/e2` (KING'S LANDING vs
  "~? SHIPS", LANNISTER vs "~300"), and pins (`ui/pins.js`) show at most 6 unread at once with a "+n" bubble.
- **Files**: `index.html`, `style.css`, `app.js`, `ui/drawer.js`, `ui/common.js`, `ui/pins.js`, `map3d/{lod,labels,tokens}.js`,
  `tests/map-lod.test.js`, `tests/map-labels.test.js`, `tests/map-tokens.test.js`.
- **Acceptance**: a fresh save shows the welcome card once and never again after "Begin" (reload test); coach marks appear
  in order and vanish on the action; focus mode leaves only the map and the command bar (element count ≤ 6 visible
  controls); no two map labels' bounding boxes overlap at the default zoom on the opening scene at both resolutions
  (script checks); tokens ≤ 12; the keyboard path (Tab order) is unchanged.
- **Depends on**: U1, U3 (for the surfaces it hides); the map part can start earlier.

### U9 · Portraits and family trees, improved in place; acceptance gate
- **Scope**: since the new layout gives the ruler's portrait and People more room: portrait in the HUD gets a hover card
  (name, title, age, mood, regency line) and a small mood ring; People window keeps `familyTree()` and gains the
  full-width layout the Ledger frees (`12` §15.2), with "who is who" search; `characterSheet()` shows the portrait larger.
  No portrait or tree is removed (assert in a test). Then the **gate**: run the whole acceptance table below.
- **Files**: `ui/portrait.js`, `ui/windows.js` (`people()`, `familyTree()`, `characterSheet()`), `style.css`, tests.
- **Acceptance**: every tree that rendered before still renders (snapshot test on 3 houses); portraits appear in the HUD,
  cards, chronicle headlines' people, audience; the final gate table (§5) is green.
- **Depends on**: U2, U4.

---

## 5. Acceptance gate for the whole plan (add to `15-qa-tooling.md` and `12` §14)

Measured by a Playwright script (`scripts/ui-gate.mjs`, dev-dependency installed with `--no-save`, mock provider) on a new
game at turn 0 and turn 5, at 1920×1080 and 1366×768, panels closed:

| Check | Target |
|---|---|
| Interactive controls visible (buttons, inputs, links, tabs) | ≤ 16 at turn 5; ≤ 20 at turn 0 (the welcome card) |
| Distinct text blocks of ≥ 2 lines visible at once | ≤ 3 (strip headlines count as 1) |
| Pixels covered by HUD elements (union of bounding boxes) | ≤ 15 % at 1920, ≤ 20 % at 1366 |
| Top bar height | ≤ 56 px / 48 px |
| Map labels/tokens overlapping | 0 pairs at the default zoom |
| Any of Economy/Military/Diplomacy/Intrigue buttons visible in the HUD | 0 |
| State of the Realm reachable | one click on `Realm` or `R`; opens ≤ 250 ms |
| Ledger knowledge tests | pass (no unknown houses, aged rounded figures) |
| Portraits and family trees | still present, the snapshot test passes |
| Reduced-motion, keyboard-only play: add an order, End turn, open Ledger, close | passes |
| Windows + Linux CI | green |

Screenshots (`docs/screens/u*/…-1920x1080.jpg` and `-1366x768.jpg`): opening, planning with vitals warning (food low),
headline strip expanded, Ledger Houses / Wars / Economy / Lands, card on a castle, focus mode, playback.

## 6. What the owner should verify

1. Start a new game: the screen is the map, a slim top line, three numbers, a command bar, and a few headlines.
2. Type an order, press End turn: the headlines appear one at a time; nothing else changes on screen.
3. Press `R`: the State of the Realm shows the houses, who is rising and falling, wars, your economy; hover an arrow to
   see why; the rivals' numbers are rounded and dated, and unknown houses are absent.
4. Click a castle, a host and a person on the map: their cards open and close; nothing you used to do is lost.
5. Press `F`: only the map and the command bar remain.

## 7. Risks and decisions to record in `DECISIONS.md`

- **D-U1**: departing from `12` §2.1 ("Command / Audience buttons bottom-left, chronicle collapsed tab") toward a bottom
  command bar and a headline strip. Reason: the command bar is the core verb and must survive a collapsed chronicle.
- **D-U2**: "Economy" and "Military" as top-level buttons are removed; their reading views join the Ledger, their
  acting views live on cards and in typed orders. Reason: this is an AI-simulated game (`01-vision.md`); the player
  speaks and watches.
- **D-U3**: `state.trends` stores true values; only the server's `realm` view filters by knowledge (same rule as
  `playerView`). Never send `state.trends` to the client.
- **Risk**: hiding actions might strand players who liked the buttons; mitigated by keeping every hotkey, by the
  in-panel "tell your steward: …" hints, and by the `config.json` `ui` switch during rollout.
- **Risk**: saves grow with `state.trends` (bounded, §3.3); undo restores it with the snapshot.
