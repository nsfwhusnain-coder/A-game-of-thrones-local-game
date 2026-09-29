# 21 · Art direction: the maester's desk

> Owner feedback (2026-09-29): *"It's very simple looking. I do like it, but it must look like it is from the Game of
> Thrones universe, not something modern made by AI. It needs heart and design fitting the kind of game we are
> building."* This document sets the look every screen is built in. It **supersedes [12](12-ui-ux.md) §3.1 and §3.3**
> (dark glass panels with blur, a flat gold accent) wherever they differ; §3.2 (type) and §3.4 (the component list)
> stand, restyled here. Work package **U0** builds it (pulled forward from F1, D-062) before U1–U3 lay out the screen.
> The layouts of [17](17-ui-declutter.md) and the mockups stand; this changes what they are made *of*.

---

## 1. The idea

The player is a lord at their table in the solar. The map is the great painted map on that table; everything around it is
**things a lord would have on a table**: the maester's parchments, a ledger bound in leather, wax-sealed letters, an
iron-bound chest of coin, a candle. Nothing glows, nothing is glass, nothing is a flat modern button. Every surface is a
*material*, and each material means something:

| Material | Means | Used for |
|---|---|---|
| **Vellum** (warm parchment, deckled edge, faint foxing, ruled lines at 3 % ink) | *the maester wrote this for you* | an opened event card, the week's digest, the welcome, letters, matters, the State of the Realm's pages, tooltips of substance |
| **Dark oak and tooled leather** (near-black brown, a slow grain, a blind-tooled border line) | *the lord's table: the frame you hold* | the top bar, the headline strip, the command bar, the menu, the ledger's binding |
| **Iron and bronze** (dark iron with a bevel; bronze studs; warm when touched) | *things you press* | buttons, the End-turn plate, the portrait's rim, frames of tokens |
| **Wax** (a raised seal in the house's colour, pressed with a sigil) | *something awaits your word* | the Inbox count, a matter, a letter's seal, a coach mark's dot |
| **Gold leaf** (a gradient with a burnished edge, used sparingly) | *illumination: the first thing to read* | the illuminated initial of a letter or the welcome (prose, never a headline), the digest's first numeral, tier-great headline rules, the crest frame |
| **Ink** (iron-gall brown-black, and a rubric red for headings) | *words* | all text on vellum; rubric red for the first word of a card's kicker and the date |

The house the player rules tints the frame: its two colours dress a narrow ribbon behind the crest and the rim of the
portrait, and its richest colour is the wax of the Inbox seal. *(As built: the two colours are the field and the charge of
the house's arms, `house.sigil.f` and `.cc`, which `applyHouseTheme` sets as `--house-1` and `--house-2`. `THEMES` is the
UI's accent set and is left alone: its Stark is blue.)* **Wax is pigment, not metal:** `applyHouseTheme` sets `--wax` to
whichever of the two is the richer colour (HSL saturation ≥ 30 %, lightness 10–80 %, weighted toward the darker), so a red
field under a gold lion is red wax and a green one green; arms that are only white, grey and black get oxblood `#7b1e17`.
A Stark table is a grey ribbon and oxblood seals; a Lannister table crimson wax and a crimson-and-gold ribbon; a Tyrell
table green; a Greyjoy table gold wax (black has no pigment) and a black-and-gold ribbon.

## 2. Rules (normative for U0–U9, N7, R4)

1. **Materials, not flat fills.** A panel is vellum or oak, never a translucent grey rectangle with a blur. No
   `backdrop-filter` on chrome (it is also slow on SwiftShader and low-end GPUs).
2. **One ornament per surface.** A vellum page may have corner pieces *or* a fleuron rule, not both; oak has a single
   tooled line inside its edge. No lace everywhere. No ornament on anything smaller than a card.
3. **No emoji, no stock icon fonts.** Icons are the game's own (§5): stroked on a 24-unit grid, `currentColor`,
   readable at 16 px.
4. **Type:** Cinzel for inscriptions (small, tracked 0.08em, never for more than one line); EB Garamond for reading
   (16 px at 1920, never under 13 px at 1366); Cinzel Decorative only for illuminated initials. Old-style figures in
   prose, lining tabular figures in tables and vitals.
5. **Colour is heraldic.** Accents are the house's two colours, gold leaf and rubric red; state colours (loss, gain,
   warning) are muted pigments (madder red, verdigris green, ochre) not neon. Text contrast ≥ 4.5:1 on its material.
6. **Light comes from the candle.** One warm light from the upper left: bevels lighten top-left, shadows fall
   bottom-right, soft and short. Hover warms (a slight brightening toward amber); press sinks (inset shadow). No glow
   halos except the coach mark's slow pulse.
7. **Motion is ink and wax.** Panels unroll or are laid down (160–240 ms, ease-out), text fades in like ink taking; the
   Inbox seal settles when a new matter arrives. `prefers-reduced-motion`: cuts, no motion.
8. **Words in the world's voice.** Labels are the lord's words: "End the day's business" is too long; "End turn" stays,
   but empty states, tooltips and headers speak in the setting ("No ravens wait", "The maester's report"). Never game
   jargon on a surface.
9. **Cheap.** Textures are small tiling images generated once by a committed script (§4); total UI art ≤ 600 KB; no
   runtime dependencies; nothing fetched from the web; everything also looks right with textures missing (the
   materials degrade to their base colours).

## 3. Tokens (`public/css/theme.css`, loaded after `style.css`)

*Implemented in U0.*

```
--vellum:        #e8dcc0   base of parchment        --vellum-shade: #cdb98f  its edges, chips     --vellum-deep: #b39c6c  rules
--ink-iron:      #2a1d12   text on vellum            --ink-soft:     #55402c  second-rank text     --rubric:      #7b1e17  first word of a kicker, dates
--oak:           #1b140e   the frame                 --oak-2:        #261b12  raised strips        --oak-edge:    #3a2a1c  chips, raised edge
--leather:       #2a1d13   what is bound and stitched
--bone:          #e9dfc8   text on oak               --bone-dim:     #b3a78e  secondary text on oak
--iron:          #2b2a28   button face               --iron-hi:      #5a5752  bevel light          --iron-lo:     #171615
--bronze:        #9a7440   studs, rims               --bronze-hi:    #c39a58  rivets, icons        --bronze-lo:   #5b4220
--gold-leaf:     linear-gradient(#e9cf7a, #b98a2e 55%, #8a6420)      --gold-flat: #d8b45c  the same metal as one colour (lettering, contrast maths)
--house-1/-2:    the house's field and charge (defaults #8e1b17, #c9a44a; set by applyHouseTheme)
--wax:           #7b1e17   oxblood; applyHouseTheme sets the arms' richer pigment      --wax-hi: color-mix(in srgb, var(--wax) 70%, white)
--madder:        #a8453a   loss, war (fills)         --madder-lit:   #d9806f  on oak               --madder-ink:  #8c2f25  on vellum
--verdigris:     #6a9a76   gain (on oak)             --verdigris-ink:#37634a  on vellum
--ochre:         #c08a2e   warning, focus ring
--wc-shadow:     0 2px 6px rgba(10,6,2,.55)          (not --shadow: style.css already owns that name and it must not change)
--wc-min:        max(.87rem, 13px)   the smallest text on any surface
--radius-card: 3px   (parchment is cut, not rounded)   --radius-btn: 2px   --radius-seal: 50%
```

`--ink` in `style.css` stays what it is (the dark parchment ink) so nothing old breaks; new code uses the names above.
`theme.css` declares its text/surface pairs in a comment table (`contrast: --ink-iron on --vellum`); `tests/theme.test.js`
computes the WCAG ratio of each (all ≥ 5.0 as built; the tightest are the green ink on vellum, 5.07, and gold on rubric, 5.2).

**Scale.** The game's root size is `min(1.1vw, 2vh)`, so 1366×768 and 1920×1080 are the *same picture at two scales*: the
canvas is always about 91 × 51 rem. Everything in `theme.css` is in rem and em; a screen has 91 × 51 rem to live in, and its
smallest text (`--wc-min`) is 13 px at 1366 and 18 px at 1920. That is why a screen holds about three pages of text, not
five: the mockups were drawn at a 16 px root and carry more than fits at this type size.

## 4. Textures (generated, committed)

*Implemented in U0.*

`scripts/paint-ui.js` (dev only: Playwright's Chromium is the canvas and the JPEG/PNG encoder, as
`scripts/mockup-assets.js` does for portraits) writes `public/img/ui/`. *(As built: the noise is wrapping gradient noise
computed in the page, not `feTurbulence` — it tiles exactly, lights from the upper left without a seam, and does not depend
on how a browser rasterises SVG filters.)*

| File | Size | How |
|---|---|---|
| `vellum.jpg` | 640², tiling, ~40 KB | cloudy tone where the hide was uneven, faint veining, follicle pores, two or three foxed patches; mean exactly `--vellum` |
| `vellum-edge.png` | 9-slice (slice 28), alpha, ~34 KB | a deckled edge, periodic along its length so it tiles and the corners join; aged to a grey-brown toward the cut; `border-image: … 28 / .75rem round` |
| `oak.jpg` | 640×320, tiling, ~14 KB | growth rings from contour lines of a warped field, fine streaks, pores; mean `--oak` |
| `leather.jpg` | 256², tiling, ~8 KB | pebbled hide (cells with grooves), lit from the upper left |
| `iron.jpg` | 128², tiling, ~2 KB | fine hammered speckle with a faint brush of the file (opaque, so a JPEG, not a PNG) |
| `wax.jpg` | 128², tiling, ~4 KB | a grey mottle laid over the house colour with `background-blend-mode: overlay`, so a seal is not one flat fill |
| `ornaments.svg` | sprite, hand-drawn | `<view>`s: `corner-knot` (Solomon's knot), `corner-leaf` (a red weirwood leaf), `fleuron-rule`/`fleuron` (a small red leaf on an ink rule), `tier-diamond` (gold leaf), `rubric-bullet`, `initial-frame` (rubric square, gold rule, a vine) — `background: url(ornaments.svg#corner-leaf)` |

The generator is deterministic (fixed seeds, an integer hash instead of `Math.random`); re-running it gives the same
bytes (checked with `sha256sum`). Total under 115 KB against the 600 KB budget. Each texture is applied with a base colour
behind it so a missing file never leaves an unreadable surface.

## 5. Icons (`public/js/ui/icons.js`, extended)

*Implemented in U0.*

The game already has its own icon set: 69 24-unit icons before U0 (79 after), stroked in the current colour, drawn for this game
(`coin`, `swords`, `wheat`, `ship`, `raven`, `crown`, `scroll`, `people`, `hourglass`, `quill`, `candle`, `sun`, `leaf`,
`snow`, `sprout`, `diamond`…). **Keep that hand** — redrawing them as filled silhouettes would be churn. U0 adds only
what the new screen needs, in the same stroke style and weight:

| New icon | For |
|---|---|
| `chain` | Settings (a maester's chain of three links) instead of the modern gear |
| `weirwood` | People (a weirwood with a face in the trunk) |
| `book` | Help (a closed book with clasps) |
| `seal` | matters and the Inbox (a wax seal with a ribbon) |
| `tier3`, `tier2`, `tier1`, `pip`, `dots` | the headline tiers: great, major, news, minor, meanwhile |
| `inkpot` | the command bar (a quill in an inkpot) |

On oak the icons are drawn in bone and warm to gold leaf on hover; on vellum in iron-gall ink. The emoji still left in
markup (`✨`, `＋`, `✉`, `☰`, `▶`…) are replaced by icons as U1–U3 rebuild the surfaces that hold them.

*Type, as built.* Cinzel mixed case is real small capitals (write "House Stark", not `text-transform`). EB Garamond's
small caps (`font-variant-caps: small-caps`) and tabular lining figures work in the bundled files, and headlines use
them. **Old-style figures do not**: the bundled EB Garamond subset has no `onum` feature (`.wc-prose` asks for it and
will get it the day `public/fonts` is re-subsetted with `onum`, `lnum`, `tnum`, `smcp`, `c2sc` kept). Until then figures
are lining everywhere.

## 6. Components (`theme.css`)

*Implemented in U0.*

| Class | Material | Notes |
|---|---|---|
| `.wc-oak` | oak + tooled inner line | the HUD's bars and panels; 1 px `--oak-edge` inset line 3 px from the edge |
| `.wc-vellum` | vellum + deckled edge | cards and pages; ink text; `h*` in Cinzel `--ink-iron`, first word may be `.rubric` |
| `.wc-btn` | iron plate, bevel, bronze rivets at the ends (pseudo-elements) | primary actions; hover warms; `:active` sinks; `.wc-btn--quiet` is text-only in bone |
| `.wc-plate` | the large End-turn plate | iron with gold-leaf lettering; sub-label under it in bone italic |
| `.wc-seal` | a wax disc with a pressed rim, `--wax` | the Inbox count (number pressed into the wax), matters |
| `.wc-medallion` | a round iron rim with a bronze inner ring and a banner ribbon behind | the ruler's portrait; a small wax-coloured health jewel |
| `.wc-chip` | a strip of vellum or oak with a cut end | filters, tags ("Your house") |
| `.wc-tab` | tooled leather tab | ledger and chronicle tabs; the active one is lighter and sits "on top" |
| `.wc-rule` | a fleuron centred on a thin ink rule | between sections on vellum |
| `.wc-initial` (+ `.wc-lede`) | illuminated capital (gold leaf in a rubric square with a vine) | **prose only, never a headline** (it would break the word): the welcome's first paragraph, letters. Dropped three lines, the text wraps beside it, the rest of the first line in small caps (`.wc-lede::first-line`); the letter is repeated for screen readers in `.wc-sr` |
| `.wc-numeral` (`--leaf`) | a rubric numeral; the first one in gold leaf, larger, with a burnished edge | the digest's numbered headlines (1, 2, 3) |
| `.wc-tier-great/major/news/minor/meanwhile` | the headline's weight | great: gold-leaf diamond ×3, larger Cinzel; major: ×2; news: ×1; minor: a pip; meanwhile: dotted |
| `.wc-tooltip` | a slip of vellum | 250 ms delay, ink text; `.wc-slip` is the same piece without the delay; `data-arrow="up\|down"` points it |
| `.wc-coach` | a wax dot with a slow pulse and a vellum slip | first-run marks |

Added as built (each is a `wc-` class in `theme.css`, shown on the tile):

| Class | Material | Notes |
|---|---|---|
| `.wc-leather` | dark leather, saddle stitching | the command bar; `.wc-ledger__book` binds the ledger the same way |
| `.wc-crest` + `.wc-ribbon` | oak plate; a ribbon of `--house-2` / `--house-1` with the sigil in a gold ring | house, the day, the season |
| `.wc-vitals` / `.wc-vital` / `.wc-trend` | oak, incised dividers, lining tabular figures | Coin, Men, Food; trends in verdigris and madder |
| `.wc-endturn` | oak panel holding `.wc-plate` and `.wc-endturn__why` | the plate's reason, in bone italic |
| `.wc-strip` / `.wc-chronicle` / `.wc-card` | oak; leather cards with a tier leaf along the spine | `.wc-card__head` in Garamond small caps, the diamonds come from the tier class |
| `.wc-vellum` + `.wc-corners-leaf` or `.wc-corners-knot` | two corner pieces (top left, bottom right) | a page has corners **or** a `.wc-rule`, never both |
| `.wc-table`, `.wc-spark`, `.wc-est`, `.wc-none`, `.wc-gain`, `.wc-loss` | ink on vellum, ruled rows, the own row a gilded band with a rubric spine | the ledger: `~` estimates, `—` unknown, six-moon sparkline (estimated stretch dashed) |
| `.wc-ledger` (`__book`, `__page`) | leather binding round a vellum page, `.wc-tabs` above | |
| `.wc-cmd`, `.wc-order`, `.wc-receipt`, `.wc-input` | leather bar, an order as a vellum strip with a cut end, a crooked verdigris receipt stamp, an inkwell field | |
| `.wc-nameplate`, `.wc-mood` | oak plate for the ruler beside the medallion | |
| `.wc-menu` | oak, three doors and a quiet row of icon buttons | `.wc-btn.is-on` is the button that owns it, pressed in |
| `.wc-candle` | a warm vignette to lay over the table (no blur) | |
| `.wc-ink-in`, `.wc-lay-down`, `.is-settling` | motion: ink taking, a page laid down, wax settling | all cut under `prefers-reduced-motion` |

A **style tile** `public/dev/style.html` shows every component on the map background at 1920×1080 and 1366×768 (the
fixture page for Visual QA; it needs the dev server, since it imports the game's own portrait, sigil and icon code).
`?house=stark|lannister|greyjoy|tyrell` tints it. `scripts/screens.js style style-lannister` shoots it and fails if a
component is missing or the page errors.

## 7. Acceptance (U0)

- `public/dev/style.html` renders every component of §6 with no console errors, in both sizes; screenshots in
  `docs/screens/u0/`.
- `node scripts/paint-ui.js` twice gives byte-identical files; the files total ≤ 600 KB.
- Contrast ≥ 4.5:1 for text on each material (a unit test over the tokens: `tests/theme.test.js` computes the WCAG ratio
  of each text/surface pair declared in `theme.css`).
- No emoji in `public/index.html` or `public/js/ui/*.js` markup strings that U0 touches (the test greps them).
- Nothing existing breaks: `theme.css` only adds classes and tokens; `npm test` is unchanged.
- The owner judges it (HANDOFF checklist): "does this look like Westeros?"
