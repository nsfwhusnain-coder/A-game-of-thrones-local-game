# 11 · The map: art direction, camera, layers, entities and playback

> Owner decision (2026-09-27): **keep the three.js 3D map and restyle it.** Far out it must read like Pax Historia's
> clean political map; close in it is a painted tabletop world where people visibly live and move. Fixes B-29, B-31 and
> delivers the "king's host visible, lords and ladies going places, people wandering" request. Files:
> `public/js/map3d/MapScene.js`, `models.js`, `life.js`, `pathfind.js`, `public/js/map/terrain.worker.js`.

---

## 1. Art direction

**"A maester's painted map, come alive."** Two looks blended by zoom:

| | Far (L0–L1) | Near (L2–L3) |
|---|---|---|
| Reference feel | the books' endpaper maps; Pax Historia's flat political map | a painted tabletop diorama (warm, soft light, hand-painted textures) |
| Land | flat realm colours at 55–70 % over a muted parchment-and-relief base; soft hillshade | full terrain palette, relief lighting, painted ground textures |
| Sea | deep desaturated blue-grey with a subtle paper grain; coastline ink line | animated water (existing shader), foam at coasts |
| Borders | realm borders as a 2–3 px ink line in the realm's dark tone + a soft inner glow; war borders red | faint painted line on the ground |
| Settlements | crest-dot markers (seat: shield icon; city: filled square; castle: small tower glyph) | 3D models, banners, smoke from chimneys |
| People | tokens (banners with numbers) | tokens + little figures (marching columns, carts, riders) |
| Labels | realm names in spaced Cinzel caps, sea names in italic Garamond | place names by rank, road names |

**Palette:** keep the realm colours from `houses.js` but pass them through a single tonal map (value 45–65 %, saturation
35–60 %) so no realm glares; the player's realm gets a gilded border.

**Remove the "low-poly" look:** the icosahedron trees, faceted rocks and untextured boxes (seen at max zoom, B-29) are
replaced (§5.2).

## 2. Camera

- **Projection:** perspective, top-down with tilt that increases with zoom: 12° at L0 → 38° at L3.
- **Zoom levels** (camera height in map units — tune to the atlas scale): **L0** whole Known World (Westeros + the Free
  Cities' coast), **L1** a region (the North, the Reach), **L2** a few holdings (Winterfell and its neighbours),
  **L3** a single castle and its lands. **Clamp:** no closer than L3 (never into the trees) and no farther than L0.
- **Framing (fix B-29):** at L0 the camera centres on the bounding box of Westeros + the Narrow Sea, not on the atlas
  origin; the pan bounds keep ≥ 40 % of the screen on land.
- **Zoom** toward the cursor, smoothed (lerp the distance toward a goal, keeping the point under the cursor fixed).
  Momentum panning (existing). Keyboard: WASD/arrows pan, +/− zoom, Home = your seat, F = follow the selected party.
- **Fly-to** (playback): ease-in-out 0.9–1.4 s by distance, never faster than 1 region/second; the camera never
  moves while the player is dragging.

*Implemented (WP E1):* `public/js/map3d/lod.js` — `LOD` = [3500, 1200, 460, 160] map units (L0–L3), `lodOf(dist)` the
continuous level, `layerAlpha(lod, from, to)` a ±0.15 fade; the camera is clamped to [L3, L0] (never into the trees),
tilts 12° at L0 to 38° at L3, frames L0 on Westeros and the Narrow Sea (`L0_CENTRE`, `HOME_BOX`) and widens its pan
bounds to the Known World from L1 down. The wheel zooms smoothly toward the cursor (the ground under it stays put);
`flyTo` eases in and out over 0.9–1.4 s (never faster than about a region a second) and never while dragging; Home
flies to your seat (again: the whole realm), F follows the selected party. `public/dev/map-lod.html?spot=&lod=&boxes=1`;
`tests/map-lod.test.js`. The layers of the table below read `layerAlpha` as E2–E7 restyle them.

## 3. Layers and level of detail

| Layer | L0 | L1 | L2 | L3 |
|---|---|---|---|---|
| Political fill | strong | medium | faint | off (terrain only) |
| Realm borders | ink 3 px | ink 2 px | painted line | painted line |
| Realm labels | yes | major realms | — | — |
| Region/feature labels (the Neck, the Wolfswood, the Kingsroad) | seas only | yes | yes | — |
| Holdings | seats of great houses + cities (crest dots) | + major castles | all holdings (models) | + villages, mills, septs |
| Roads | kingsroad and major roads (thin) | all roads | roads + tracks | + ruts, stones |
| Rivers | major | all | all + shimmer | + banks |
| Forests | texture mass | texture mass | canopy clumps | individual trees |
| Hosts / fleets | banner tokens with numbers (clustered) | tokens | tokens + marching figures | full columns |
| Retinues, envoys, riders, the progress | the progress only | + great lords' retinues | all known parties | all + figures |
| Ambient (carts, smallfolk, boats, ravens) | ravens (player's letters) | ravens | carts, refugees, boats, ravens | + walkers |
| Pins (matters, news) | yes | yes | yes | yes |
| Weather overlays | snow line, storms at sea | + rain/fog areas | + particle rain/snow | particles |

Every layer has a budget (§10). Fading between levels is continuous over ±15 % of the zoom range, never popping.

## 4. Map modes

Each mode must be **visibly different at every zoom** (B-29: diplomacy looked like realms). Modes replace the political
fill; borders stay.

| Mode | Fill | Legend |
|---|---|---|
| **Realms** (default) | realm colour by top liege | realm names |
| **Holders** | colour by immediate owner house | house names on hover |
| **Diplomacy** | player's relation: deep red (war) → orange → grey (neutral) → blue → gold (allied/vassal); your realm hatched gold | relation scale |
| **Knowledge** (new) | how fresh your knowledge is: bright where you see, fading grey where reports are old, black fog where unknown | age scale |
| **War** (new) | fronts: holdings besieged/occupied/devastated; hosts only; routes | — |
| **Wealth** | revenue per holding (heat) + trade lanes (06 §8) | scale |
| **Food** (new) | stores in moons (green → red) | scale |
| **Unrest** | unrest heat | scale |
| **Terrain** | no fill; terrain and roads emphasised | — |

The mode control (top-right, compact) shows the active mode's icon and a dropdown; a small legend appears
bottom-centre when a mode other than Realms is active.

*Implemented (WP E2):* `public/js/map3d/modes.js` — the palettes as pure functions (`colorFor`, `diplomacyOf`,
`knowledgeOf`, `warOf`) with their `LEGENDS`; Diplomacy war red → hostile orange → neutral grey → friendly blue → allied
gold, your realm hatched gold; Knowledge from what your eyes see now (`engine/knowledge.js eyesOf`) through fresh and old
reports to fog (the great seats known by common report); War besieged, occupied (held by another than its house of
old), laid waste (devastation, 07 §5). New buttons Knowledge and War; a key under the map for every mode but Realms.
`tests/map-modes.test.js` holds each mode's mean colour distance from Realms above a threshold over every holding — the
pixel-diff of the acceptance, measured on the fills the map draws. Trade lanes (Wealth) come with E6.

## 5. Terrain and nature

> **Implemented (WP E3).** `public/js/map3d/nature.js` holds the snow line, the frozen-river flag, the regional tints
> and the procedural tree atlas; the forests are impostors in `models.js`; the terrain shader draws the snow line, the
> canopy mass at L0–L1 and the paper grain. See D-055 for where it departs from this section.

### 5.1 Palette and biomes (`terrain.worker.js`)

Keep the atlas-driven generation. Retune colours toward a painted palette: the North heather-brown and pine green,
the Riverlands soft green with field patchwork, the Reach golden-green, the Westerlands ochre hills, Dorne sand and red
rock, the Vale blue-grey mountains, the Stormlands dark green woods, the Iron Islands slate, beyond the Wall white and
blue. A subtle paper-grain overlay at L0–L1.

### 5.2 Forests

Replace the low-poly trees with **painted canopy impostors**: instanced camera-facing quads (or crossed quads) with a
small texture atlas (conifer, broadleaf, dead winter tree, weirwood white), size jitter, colour jitter, wind sway in the
vertex shader. At L0–L1 forests are a texture mass (a mask-driven darker canopy tone with soft edges), not trees.
Texture atlas generated procedurally at startup (no downloaded assets) or committed as a small PNG under
`public/assets/nature/` (≤ 256 KB, original work).

### 5.3 Seasons and the snow line

`world.snowLine` (a map latitude) is passed to the terrain shader: north of it, ground blends to snow; the band edge is
noisy. Summer: snow only beyond the Wall and on high peaks. Autumn: the line creeps south from the Wall toward the Neck
as the season ages. Winter: the North white, the line reaching the Riverlands' north. Trees switch to the winter atlas
tile north of the line. Rivers freeze (a shader flag) in deep winter in the North.

## 6. Entities (the living map)

All entities are driven by `parties`, `letters`, holdings' status and the ambient generator (09 §4). The server sends
the player's view (knowledge-filtered). `MapScene.syncParties(prev, next, keyframes)` replaces `syncArmies`,
`syncRiders` and the retinue handling.

### 6.1 Tokens (all zooms)

| Party kind | Token | Plate |
|---|---|---|
| Host | a standard: pole + cloth banner (existing shader) in the owner's colours + sigil; size ∝ log10(men) | "4,200 · Robb Stark" (L1+: leader name) |
| Host (reported, not seen) | translucent, dashed ring, grey plate | "~3,000? · 9 days old" |
| Fleet | a ship silhouette + sail in house colours | "~30 ships" |
| The King's progress | larger standard with the crowned stag and the lion; a gold rim | "The King's progress" |
| Retinue (a lord or lady travelling) | a mounted figure + a small pennant | "Lord Bolton → Last Hearth" (hover) |
| Envoy / rider | a single rider; envoys carry a white pennant | name on hover |
| Caravan | a cart | — |
| Outlaw band (known) | a dark ragged pennant | "outlaws" |
| Garrison | not shown as a token; a count on the holding's card and a small shield pip on the castle | — |

**Clustering:** tokens within 18 px on screen merge into a stack plate ("3 hosts · 11,400") that fans out on hover.
**Plate collision:** plates avoid labels and each other with a greedy priority placement (§8); never cover a seat's name.

### 6.2 Figures (L2–L3)

- **Marching columns:** a host shows a column of little soldiers along its route behind the standard; column length ∝
  men (capped), knights as mounted figures at the head, wagons at the tail (supply). Existing `models.js` soldiers kept
  (surcoats, helms, spears, shields), animated walking.
- **Camps:** a host `camped` shows tents in the owner's colours and campfire smoke; `besieging` shows siege lines, a
  ring of tents and engines.
- **Retinues:** 3–12 riders with the lead rider's banner, a litter for the old or wounded (Lord Hoster), a wheelhouse for
  ladies of high rank.
- **The progress:** a long column: knights, the wheelhouse, wagons (≈ 40 figures).
- **Ambient:** walkers (≈ 2 per village), carts on roads, fishing boats off coasts, refugees (grey, in lines with
  bundles), outriders, deserters (existing kinds), smoke over burning holdings.

### 6.3 Routes and trails

- The player's own parties with orders: a dotted route line to the destination, ETA at the end ("~9 days"); click it to
  change the order.
- Other parties: no route (unless allied: a faint route).
- Trails: a fading painted line behind a party that moved this turn (existing `trailMesh`).

### 6.4 Holdings' states

| State | Visual |
|---|---|
| normal | banners of the owner on the keep |
| besieged | ring of tents, siege engines, the besieger's banners outside, smoke inside at intervals |
| sacked / burning | black smoke column, charred roofs, ember particles at L3 |
| ruined | the ruin model (existing), grey |
| occupied | the occupier's banners over the keep with the old owner's pennant lowered |
| rising | torches, a mob of small figures at the gate |
| a feast/wedding/tourney | lanterns, pavilions (tourney) outside the walls |

## 7. Overlays

- **Battle markers:** crossed swords at the site for 12 moons (fades), with the battle's name on hover (existing landmark).
- **Trade lanes:** in Wealth mode (06 §8).
- **Raven arcs:** a raven flies the arc of each letter to/from the player in playback; the arc fades on arrival.
- **Weather:** rain/snow particles and fog volumes at L2–L3 in regions where the week's weather says so; a storm swirl
  at sea at L0–L1.
- **Cloud shadows, vignette, colour grade** (existing): keep, tone down the vignette at L0.

## 8. Labels

> **Implemented (WP E4)** in `public/js/map3d/labels.js` and `MapScene.updateLabels`. One departure (D-056): the
> realms' names rank above the great seats, since they are only shown far out, where they are the map.

- **Hierarchy:** realm names (L0–L1; Cinzel, spaced caps, 18–26 px), sea names (italic Garamond, 14–20 px, spaced),
  holdings (Garamond; seats of great houses bold; size by rank 12–16 px), features (italic 11–13 px).
- **Placement:** one pass per frame over visible labels sorted by priority (player's seat > great seats > cities >
  hosts' plates > castles > features), greedy placement with bounding-box collision; a label that cannot be placed is
  hidden, never overlapped (fixes "KIN~2,400~50 SHIPS NG").
- **Halo:** a soft dark halo for light text on terrain; light halo for dark text on sea.
- **Budget:** ≤ 120 visible labels.

## 9. Interaction

- **Hover** a holding/party/person: a one-line tooltip (name, owner, one fact: "4,200 men · marching on Moat Cailin").
  Cleared on pointer leave, camera move or window blur (fixes B-31).
- **Click:** opens its **card** (12 §8) anchored near it.
- **Own host selected + right-click on the map:** a context menu — *March here* (shows the route preview and ETA before
  confirming), *Besiege* (on an enemy holding), *Attack* (on an enemy host), *Join* (on a friendly host), *Garrison*.
- **Drag** pans; **double-click** zooms in on the point; **Esc** closes cards.
- **Pins** (matters, unread news) are clickable at all zooms.

## 10. Performance budgets

| Target | Budget |
|---|---|
| RTX 5070, 1920×1080, "Beautiful" | 60 fps at L2 with 40 hosts, 20 retinues, 300 ambient figures |
| Integrated GPU, 1366×768, "Fast" | 30 fps: no ambient figures, impostor forests off at L2, no particles |
| Draw calls | ≤ 400 at L2 (instancing for all repeated meshes) |
| Terrain build | ≤ 6 s first load (cached in IndexedDB, existing) |
| Memory | ≤ 1.2 GB GPU at "Beautiful" |

Graphics presets (Settings → Graphics): Fast / Balanced / Beautiful, each a set of layer toggles and caps.

## 11. Playback choreography

For each segment ([05](05-gameplay-loop.md) §5):

1. The day counter runs; parties interpolate along their `route` by the keyframes (server sends positions at each day
   boundary for parties that moved).
2. On a day with facts: facts change the map at that moment (a holding recolours with a brief ink-wash transition
   0.6 s; a siege ring grows; a battle marker drops with a dust puff; a token appears/disappears with a fade).
3. Camera: if the day's most important event (≥ 3) is off-screen, fly to it; hold while its card is expanded; then return
   toward the player's realm only if the next event is there. Never fly for importance ≤ 2.
4. Multiple events the same day at different places: order by importance; fly to the first, show the rest as cards
   without flying (their pins pulse).
5. The player can take the camera at any time; playback then continues without flying until they click *Follow*.

## 12. Dev pages and screenshot tests

Keep `public/dev/` (portraits, banners, events, sigils, atlas preview, terrain) and add:

- `dev/map-lod.html` — the map at L0–L3 over five fixed spots (King's Landing, Winterfell, the Twins, Pyke, Sunspear)
  with overlays for label boxes.
- `dev/tokens.html` — every token kind, reported vs seen, clustered stacks.
- `dev/playback.html` — a canned segment (fixture) played back.

CI captures these pages with Playwright (SwiftShader WebGL: `--use-gl=angle --use-angle=swiftshader
--enable-unsafe-swiftshader`) and attaches the images to the PR ([15](15-qa-tooling.md) §5). Label overlap is asserted
from the DOM/label layout data, not by eye.
