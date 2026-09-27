# Westeros Chronicles — in-depth review

_Reviewed 27 September 2026, against `arena/01a0e032-a-game-of-thrones-local-game` (branched from `8dabd66`)._

This is a full read of the codebase and a playtest of the simulation, with the bugs found, the systems that
are thin or missing, and an honest assessment of how far the game is from the "AAA" bar the owner has set.
The fixes made in this pass are marked **[fixed]**; everything else is carried into `docs/ROADMAP.md`.

---

## 0. How this review was done, and its limits

- Read every file under `server/`, `public/js/shared/`, `public/js/ui/`, `public/js/app.js`, `public/css/`,
  `public/index.html` and the data modules. (`public/vendor/` — three.js, kokoro-js — was not reviewed; it is
  unmodified third-party code.)
- Ran `npm run check` and `npm test` (66 tests passing before this pass; 75 after).
- Wrote a **soak harness** that drives the real HTTP API in mock mode: six houses × twelve turns each, plus
  every direct action (`tax`, `dues`, `call_banners`, `raise`, `march`, `recall`, `suggest`, `talk`, `undo`),
  scanning every resulting state for NaNs, negative men, dangling ids, out-of-range meters and orphaned
  references. 72 turns, no crashes, no state corruption. That is a genuinely good result for a simulation
  this size and says a lot for the guardrails in `applyChanges`.
- Added a **static syntax and import checker** (`scripts/check-syntax.mjs`, now part of `npm run check`).
  This matters more than it sounds: the entire client is ES modules loaded straight by the browser and is
  never imported by the test suite, so a stray bracket or a renamed export in `windows.js` reaches the player
  as a blank screen with the error only in a console they will not open. 72 files now parse-checked and every
  named import verified on every `npm run check`.

**Limit worth stating plainly:** no browser could be installed in this environment (Playwright's Chromium
download is blocked). So the UI changes here are reviewed and reasoned about from the code, not screenshotted.
Everything engine-side is tested; everything view-side needs one pass of human eyes. The live preview attached
to this session runs the real game in mock mode, so it can be clicked through directly.

---

## 1. What this project already is

It is important to be accurate about the starting point, because it is much further along than a "hobby
project" and a generic review would insult it.

- **158 houses, 165 holdings, 312 named characters, 14 starting armies**, all validated by `check-data.js`.
- A **real deterministic engine** (`public/js/shared/`) that owns the numbers — economy with seasons, harvests,
  famine, tribute and vassal temper; battles with Lanchester-square odds, morale, supply and commander skill;
  sieges; marches at real miles-per-day over a projected atlas; fog of war; treachery; succession.
- A **disciplined engine/story contract**: the model narrates, the engine adjudicates, and `applyChanges` caps,
  validates and refuses. `protectPlayer` alone stops half a dozen classes of model misbehaviour.
- A **model layer that has clearly been through real pain**: SSE streaming with progress phases, thinking
  on/off, continuation on cut-off, multi-stage JSON repair, salvaged turns, prompt-prefix warming for
  llama.cpp cache reuse. This is production-grade plumbing.
- A **3D map** built from real GIS atlas data with terrain generation, cloth banners, A\* pathing and unit models.

The architecture is sound. Almost everything below is a matter of completion and polish, not of rebuilding.

---

## 2. Bugs found

### 2.1 Correctness — the story model could break the rules

| # | Bug | Severity | Status |
|---|-----|----------|--------|
| B1 | **`war_join` had none of `war`'s guards.** `war` refuses to make the player an attacker unless the player declared war; `war_join` simply pushed the house onto a side. The story model could therefore drag the player into any war as the aggressor — the exact thing the `war` guard exists to prevent — just by using the other op. | High | **[fixed]** |
| B2 | **A house could fight on both sides of the same war.** Neither `war` nor `war_join` deduplicated or cross-checked the attacker and defender lists. `atWar()` then returned `true` for a house against itself's allies, and `resolveWarfare` would happily pair two hosts of the same house for battle. | High | **[fixed]** — sides are deduplicated, a house named on both sides keeps the first, and `war_join` refuses a house already in the war or a war already ended. |
| B3 | **`army_update` stored unresolvable commanders.** `a.commander = findChar(state, ch.commander) \|\| ch.commander` wrote the model's raw string when the name could not be resolved. Everything downstream (`commanderMartial`, the army sheet, `unitsOf`, the prompt's army lines) then silently degraded — battle odds quietly fell back to a martial of 5 for a host that in fact had a great commander. It could also install a *dead* character. | Medium | **[fixed]** — an unknown or dead commander is now refused with a reason, like every other bad id. |
| B4 | **`holding` op could throw on `resource`.** `h.resources[t] = …` assumed `resources` exists. It does for holdings present at `initEconomy`, but a holding created later by the `holding_new` op and then migrated, or any save predating the economy, has no such object. | Low | **[fixed]** |
| B5 | **Dead siege/battle de-duplication.** `advance()` created `const toldBattles = new Set()` and passed it as `resolveWarfare(…, { skip: toldBattles })`. It was never populated and never could be — warfare resolves *before* the story model is called. The comment "unless the story told that battle itself" described a mechanism that did not exist. | Low (dead code, misleading) | **[fixed]** — removed, and the real ordering documented in the comment. |

### 2.2 Interface and input

| # | Bug | Severity | Status |
|---|-----|----------|--------|
| B6 | **The Diplomacy keyboard shortcut did not exist.** The dock button is labelled `Diplomacy (D)`; the handler maps `f: 'diplomacy'` and has no `d`. Pressing D did nothing. | Medium (it is on screen, promised, and broken) | **[fixed]** — `d` added, `f` kept as an alias. |
| B7 | **Five native `confirm()` dialogs.** Deleting a save, undoing a turn, advancing with decisions pending, disbanding a host, and executing a prisoner all raised the browser's grey modal — breaking straight out of a carefully built parchment-and-gilt world, with the browser's own wording and button labels. For a project whose stated goal is AAA presentation this is the single most jarring thing in the game. | High (presentation) | **[fixed]** — replaced with an in-world `confirmModal()` written in the game's voice ("Take Ser Ilyn's head?" / "Pass the sentence" / "Stay your hand"). |
| B8 | **No keyboard focus indicator anywhere.** The only `:focus` rule in 726 lines of CSS was on text inputs. Every button — the entire dock, every action, every dialog — was invisible under the tab key. | High (accessibility) | **[fixed]** — a `:focus-visible` ring on all interactive elements, and a skip link. |
| B9 | **Effectively no ARIA.** One `aria-hidden` in the whole document. The modal was not a dialog, the drawer tabs were not tabs, the busy overlay and toasts were not live regions, and nothing was labelled. | High (accessibility) | **[fixed]** — dialog semantics with focus capture and restoration, tablist/tab/tabpanel on the drawer, live regions on the busy panel and toasts, labels and `aria-pressed` on the dock, `aria-hidden` kept in step with the window and sheet. |
| B10 | **`prefers-reduced-motion` covered three selectors.** Only banner sway honoured it; the event reveals, camera flies, toasts, storyIn animations and cloth filter did not. | Medium | **[fixed]** — a global reduced-motion rule. |
| B11 | **One breakpoint, at 1100px.** Below roughly 900px the HUD, drawer, window and sheet overlap each other and the map. | Medium | **[partly fixed]** — an 860px breakpoint that narrows the drawer, sheet and window, collapses the standing bars and drops the lowest-priority resource tiles. A genuine small-screen layout is a roadmap item. |

### 2.3 Things that are not bugs but read like them

- `euron_greyjoy.loc = 'at_sea'` and `bronn.loc = 'crossroads_inn'` are not holdings. They resolve through
  `placeName`/`PLACE_ALIASES` and are intentional. Flagged here only because they trip naive validators.
- `undo` deletes `prev-state.json`, so undo is single-depth by design. The UI does not say so; it should.

---

## 3. Systems that are missing or unfinished

This is the more interesting half of the review. The following are not defects in what exists — they are
holes in what a finished game needs.

### 3.1 The game could not be won or lost — **[fixed, first pass]**

This was the largest single gap. `resolveSuccessions` never lets a house die: when the line fails it invents
a cousin. There was no defeat state, no victory state, no score, and no ending. A campaign simply continued,
forever, at whatever level of ruin. There was also no way for the player to answer the question *"am I
actually doing well?"* — the HUD shows gold and men, but nothing relative to the realm.

Added `public/js/shared/standing.js`:

- **`standing(state, house)`** — six engine-owned measures, each 0–100 (lands, swords, gold, sway, blood,
  good order) and a weighted score. Shown in the Realm window with bars, and given to the model in
  `playerSheet` so the story knows whether the house is ascendant or failing.
- **`outcomeFor(state)`** — the endings. Defeats: **extinction** (no living member of the house anywhere) and
  **ruin** (a landed house with no holding, no host and no treasury, held for two consecutive turns so that a
  single bad turn or a brief occupation cannot end a campaign). Triumphs: **the Iron Throne** (King's Landing
  held, and at peace) and **a crown of one's own** (no liege, six or more holdings, a crowned ruler, at peace).
- An **end screen** with the house's epitaph — turns played, holdings, sworn houses, living kin, wars and
  battles won, final standing — offering *play on*, *undo the turn* or *a new house*. The world does not stop;
  the game simply now says something when the story reaches an end.

This is deliberately conservative. There should eventually be many more endings (see the roadmap).

### 3.2 Regency existed only as a comment — **[fixed]**

`createInitialState` sets `houses.arryn.regent = 'lysa_arryn'` — and nothing in the codebase ever read the
field. `resolveSuccessions` writes the text *"a child of 8; a regent will rule in all but name"* and then does
not appoint one. So an eight-year-old commanded armies, held audiences and levied taxes exactly as a grown
lord would, and the Vale's whole political situation — the thing the house brief describes — was not modelled.

Added `public/js/shared/regency.js`:

- **`incapacity()`** — minority (under 16), captivity, disappearance or infirmity.
- **`chooseRegent()`** — Westerosi order of precedence: the mother, then an adult full sibling, then an uncle
  or aunt, then the most capable adult of the house, then a sworn castellan/steward/maester.
- **`regencyTick()`** — installs regencies, ends them when the lord comes of age or comes home, narrates both,
  and charges the political cost: vassal lords lose loyalty and holdings gain unrest every moon a house is
  ruled by proxy — twice as fast if nobody fit can be found.
- **`speakerFor()`** — wired into the HUD, so the player's portrait, name and card show the regent with a
  *"Lysa Arryn rules as regent for Robert Arryn — Robert Arryn is 8 years old"* line, and into `playerSheet`
  so the model knows it is speaking to a regent.
- `vassalTemper` now subtracts 7 for a minority and 11 for a captive or missing liege. *Men obey a lord, not
  a seal.*

### 3.3 Sieges were free — **[fixed]**

The siege model was: sit still, wait `owner's food × wall factor` months, take the castle. The besieging host
lost not one man, not one point of morale, and not one day of supply. There was no sally, no relief pressure,
no reason ever to storm rather than wait, and no reason a siege could ever fail. Given that sieges are most of
the warfare in the source material, this was the thinnest major system in the game.

Rewritten in `battles.js`:

- **The castle eats its own stores.** `h.siege.stores` is set at the start of the siege and drawn down each
  turn by the number of mouths behind the walls (garrison plus a share of the townsfolk). `siegeEstimate` now
  reports the *live* remaining stores, and accounts for a seat being better provisioned than an outlying
  holdfast and for the `granaries` project actually mattering (×1.6).
- **The camp sickens.** Between 2% (summer) and 4.5% (winter) of the besieging host per moon to the bloody
  flux, cold and desertion, worse when supply is short; morale and supply sag toward floors rather than to
  zero, because a camp forages.
- **Sallies.** A strong garrison behind high walls comes out at dawn, fires the engines, kills men and loses
  some of its own. Chance scales with the garrison-to-besieger ratio.
- **The lines can break.** If every besieging host has withered below the strength needed to ring the walls
  and beat off a sally, the siege is raised, the hosts march home, and the event says why. Sieges can now fail.
- **The countryside suffers.** Unrest rises around a siege as foragers strip it.

Storming is now a real decision — a bloody way to avoid a slow, expensive, uncertain one — which is exactly
what it should be.

### 3.4 Still thin or missing (carried to the roadmap)

| Area | What is missing |
|---|---|
| **Scenarios** | One (`agot_298`). Robert's Rebellion, the Dance, the Conquest and a sandbox are in the README's list and not begun. The data layer is scenario-shaped already, so this is content work, not architecture. |
| **Navy** | Fleets exist, march, and fight each other — but cannot blockade, cannot transport an army across water, cannot raid a coast, and cannot support a siege. The Ironborn and the Redwynes are therefore barely playable as themselves. |
| **Sieges → holdings** | There is no garrison-as-unit, no storming with siege engines as a modelled cost, no relief-army mechanic (a relieving host must happen to come within `CONTACT` of the besiegers by chance). |
| **Trade** | `tradeModifier` is three lines: pacts nudge a multiplier. No routes, no goods moving, nothing on the map, no way to interdict. The README promises this. |
| **Buildings** | `PROJECT_TEMPLATES` is a flat list of 15 one-shot purchases with no prerequisites, no levels, no per-holding building slots, and no visual consequence on the map. |
| **Characters** | No ageing beyond a birthday and a death roll; no children born; no education, no lifestyle, no skill growth, no health/wounds beyond a status string; no friendships or rivalries between NPCs that the player can see or use. |
| **Marriage & bloodline** | `betroth` and `marriage_characters` ops exist, but there is no marriage market, no dowry, no alliance value, and children are not generated from marriages. This is the main long-game engine in every comparable title and is essentially absent. |
| **Faith, the North's gods, the Red God** | Referenced everywhere in the writing; modelled nowhere. |
| **The supernatural** | Dragons, the Others and the free folk exist as story threads in `plots.js` but have no mechanics. Given the setting, at least the Others as a rising, timed, realm-wide threat deserves engine support. |
| **Difficulty & pacing options** | None. No difficulty, no ironman/undo toggle, no turn-length preference, no way to ask for a slower or faster story clock. |
| **Onboarding** | There was none at all. **[part-fixed]** — an in-game *How the game is played* page (`?` key, `?` button on the HUD, and a link on the title screen) covering the loop, the engine/story split, the keys, and the six things new players most reliably miss. A real first-run tutorial is still wanted. |
| **CI** | No `.github/`. `npm run check` and `npm test` are good and fast (≈7 s) and should simply run on every push. |

---

## 4. Interface and experience: a candid assessment

The visual design is genuinely good — the parchment, the gilt, the Cinzel/Garamond pairing, the house
theming that recolours the entire interface from the sigil's heraldry, the procedural portraits, the cloth
banners. That is not the problem. The problems are structural:

1. **It was not usable without a mouse, and invisible to assistive technology.** Fixed at the level described
   above; the next step is a proper focus order and roving tabindex through the dock and the drawer.
2. **Information density with no hierarchy.** The Realm window is a wall of rows; the Economy window sums a
   moon; the People window lists everyone. There is no "what should I care about right now" surface anywhere
   except the decision cards. The new standing panel is a first attempt at an answer.
3. **The player could not tell whether they were winning.** Now addressed.
4. **Tooltips are native `title` attributes.** They appear after a second, cannot be styled, and are dropped on
   touch devices — and several of them carry genuinely important information (the levy drift explanation in
   the HUD is four lines of `title` text). These should be real tooltips.
5. **No undo affordance.** Undo is single-depth and destroys the restore point. The button says nothing about
   either fact.
6. **Errors are toasts.** A refused order, a failed march and a broken model reply all produce the same
   transient orange box. Orders at least have receipts; actions do not.
7. **No settings for pacing, and settings are one long modal.** The Settings dialog mixes display, audio,
   voice, graphics and eleven model-tuning fields in a single scroll. It wants tabs.

---

## 5. Code health

Good:

- Zero runtime dependencies, Node 20+, three.js vendored. `npm start` really does just work.
- The shared-engine-imported-by-both-sides pattern is the right call and is applied consistently.
- `applyChanges` as a single validated mutation gateway is excellent discipline and is why the soak test
  found no state corruption.
- Comments are unusually good — they explain *why*, in the game's own register.

Weak:

- **Very long lines and very large functions.** `advance()` in `server/game.js` is ~190 lines and does
  fifteen things in sequence; `world.js` has single lines over 600 characters. It works, and it is commented,
  but it is hard to change safely. The turn pipeline should become an ordered list of named phase functions.
- **No linter or formatter.** No ESLint, no Prettier, no editorconfig. For a codebase this size with this
  much string-heavy HTML generation, that is a real risk.
- **Client code untested.** 75 tests, all engine/server. The UI modules — 3,000+ lines of DOM generation —
  have no coverage at all. The new syntax/import check is a floor, not a substitute.
- **`innerHTML` everywhere.** `esc()` is used carefully and consistently and I found no injection path, but
  it is one careless template away, and model output flows into these strings.
- **Magic numbers in the balance layer.** Battle, siege, economy and loyalty constants are inline literals
  scattered across six files. They should be one tunable table — both for balancing and for difficulty levels.

---

## 6. Summary of changes made in this pass

**Engine**
- `world.js` — `war`/`war_join` guards, side deduplication, commander validation, `resources` guard.
- `battles.js` — full siege rework: stores, camp attrition, sallies, broken sieges, countryside damage.
- `warfare.js` — `siegeEstimate` reports live stores and respects seats and granaries.
- `regency.js` — **new**: the whole regency system.
- `standing.js` — **new**: house standing, victory, defeat, epitaph.
- `vassals.js` — vassal temper accounts for a liege who cannot rule.
- `game.js` — `regencyTick` in the turn pipeline; standing and outcome settled at the end of every turn; dead
  battle-skip removed.
- `prompts.js` — the model is told about regencies and about where the house stands.

**Interface**
- `common.js` — `confirmModal()`, dialog semantics, focus capture and restoration.
- `app.js` — regent-aware player card, end-of-game screen, *How the game is played*, `D` shortcut, five
  `confirm()` calls replaced.
- `windows.js` — standing panel in the Realm window, `aria-hidden`/`aria-pressed` upkeep, in-world confirms.
- `drawer.js` — `aria-selected` on the tabs.
- `index.html` — landmark roles, tablist, live regions, labels, skip link, help button.
- `style.css` — focus rings, global reduced motion, danger buttons, regency note, standing bars, end screen,
  help layout, an 860px breakpoint.

**Tooling and tests**
- `scripts/check-syntax.mjs` — **new**: parses all 72 source files and verifies every named import; wired
  into `npm run check`.
- Nine new engine tests (66 → 75), covering regency installation and dissolution, the loyalty cost of a
  captive liege, standing, ruin, extinction, the throne ending, the `war_join` guard, commander validation
  and siege attrition.

Everything passes: `npm run check`, `npm test` (75/75), and a 72-turn six-house soak with no corruption.

---

## 7. The honest headline

This is a **strong, unusually well-engineered simulation with a beautiful skin and a missing middle**. The
engine is better than the game around it: there was no way to win, no way to lose, no way to tell how you were
doing, no explanation of how anything worked, and no way to play it with a keyboard. Those four things are now
addressed at a first-pass level. What remains between here and "AAA" is not architecture — it is a marriage
and bloodline system, a navy, trade, buildings with depth, more scenarios, and one honest pass of usability
testing with a real person who has never seen it. That is the plan in `docs/ROADMAP.md`.
