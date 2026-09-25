# Handoff: continuing development of Westeros Chronicles

This document is for whoever picks up development next, human or agent. It covers what the game is and how it runs, how the code is laid out, everything built so far, what was left half-finished, and what still needs doing. It also lists the conventions to keep.

Read it together with `README.md` (player-facing: features, setup, llama.cpp advice) and `docs/DESIGN.md` (design contract: which systems the engine owns and which the story model owns).

---

## 1. What this is, and what the owner wants

Westeros Chronicles is a local, non-commercial grand-strategy and role-play game set in *A Song of Ice and Fire*. It is inspired by Pax Historia.

- **Driving the story:** a local LLM, reached through any OpenAI-compatible server. The owner runs llama.cpp with a Qwen-3.6-35B fine-tune called "Okami" at 256k context.
- **Playing:** you pick a house, write orders in plain language, hold audiences with any named character, and advance time.
- **The simulation:** the LLM narrates and moves the other houses, while a deterministic engine owns the numbers, the physics and the rules.
- **Branch:** all work is on `claude/brave-ramanujan-i8dt0q` of `nsfwhusnain-coder/A-game-of-thrones-local-game`.
- **Git workflow:** commit and push to that branch. Do not open a pull request unless asked.

### The owner's standing goals, in their own terms

- **AAA polish across the board:** UI, banners (moving, flourishing), characters that match their book descriptions, menus, music, sound. The owner explicitly accepted the art as "okay". They care more that everything works and fits together.
- **A living world** that moves on with or without the player: plotlines, threats, houses with their own lives, and openings the player must react to.
- **Book accuracy:** musters, resources, sigils, looks, histories and personalities.
- **Commands must truly happen.** Recruiting, sending people, hiring and marching must work, and the player's servants must obey.
- **Distinct characters:** varied courage, wits and pride. Weak characters yield; fools fall for traps.

### How the owner likes to be treated

- They write long voice-dictated messages. Read them carefully and extract every item.
- Be honest about limits. Do not claim quality you haven't achieved; they are fine with frank assessments.
- Test in the real app with screenshots before claiming anything works.

---

## 2. Running and testing

### Run

```bash
npm start                 # node server/index.js → http://127.0.0.1:3298
npm run check             # validates all data files (houses, holdings, characters, positions)
npm run fetch-voices      # optional: Kokoro voice model + speech runtime into public/models/ (offline voices)
npm run fetch-sigils      # optional: real sigil art from the wikis into public/assets/sigils/
```

- **Dependencies:** no npm install is needed. It's pure Node 18+ with no dependencies, and three.js is vendored in `public/vendor/three/`.
- **Configuration:** the model endpoint and all options live in `config.json`, which is git-ignored and edited through *Settings* in the game. Defaults are in `server/llm.js` under `DEFAULT_CONFIG`.
- **Mock mode:** `"provider": "mock"` runs the whole game with canned model replies. Use it for all UI and engine testing.
- **Saves:** stored in `saves/<id>/`, which is git-ignored. Each save holds `state.json`, `chronicle.md`, `prev-state.json` (undo), `llm-log.jsonl` (every prompt and reply) and `last-prompt-jump.txt`.

### Testing with a real model (what was done here)

A small model stands in for the owner's 35B:

- llama.cpp was built from source at `/tmp/claude-0/llm/llama.cpp/build/bin/llama-server`.
- The model is Qwen3-4B Q4_K_M.
- Start it with `--jinja --cache-reuse 256 -c 32768 --port 8081`.
- It runs on CPU in the sandbox: about 30 prompt tokens/s and about 1 token/s generation. A one-year turn takes roughly 90 minutes and an audience about 7 minutes.
- **Its prose is poor, and that is the 4B model's fault, not the code's.** It invents facts and admits schemes aloud. Judge the plumbing with it, not the writing quality.

### Browser testing (Playwright)

- **Chromium:** at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. The map needs WebGL, so launch with `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`.
- **Mock server copy:** the pattern used was a copy of the repo at `/tmp/claude-0/wc3`, whose `config.json` has provider `mock`, served on port 3399. Refresh it with `cp -r public server` from the repo, then restart it with `PORT=3399 setsid nohup node server/index.js`.
- **Test scripts:** in `/tmp/claude-0/pw/`. They are scratch files, not in the repo.
  - `all.mjs`: every action across 10 houses.
  - `e2e.mjs`: raise, march, decide.
  - `close.mjs`: camera close-ups (`node close.mjs <house> '[["name","holding_or_@house",dist]]' "<js to run first>"`).
  - `intr.mjs`: advance N turns, then screenshot windows.
  - `drag.mjs`: map input.
  - `voice*.mjs`: speech.
  - `reel.mjs`: turn playback.
  - `/tmp` may be wiped; recreate them as needed. They are short.
- **Engine tests without a browser:** import `server/game.js` in a Node script with `process.chdir()` into a mock copy, then call `newGame`, `advance`, `talk` and `act` directly. Scratch examples are `orders-test.mjs`, `talk-test.mjs` and `hand-test.mjs`.

### Sandbox gotchas

- **Killing servers:** never `pkill -f 'server/index'`. It matches your own shell's command line and kills it (exit 144). Kill by cwd plus `comm == node` instead.
- **Slow animations:** software WebGL makes CSS animations crawl. Wait 3–4 s before screenshotting a window that slides in.
- **Network:** outbound HTTPS goes through a proxy with its own CA. Chromium in tests can't reach CDNs or Hugging Face; curl can. Put test assets locally (for example, the Kokoro model under the mock copy's `public/models/`).
- **Environment resets:** the container resets on long pauses. Background servers die; restart them.

---

## 3. Architecture

```
server/
  index.js    HTTP server (node:http), static files, /api routes, TTS proxy, /api/music, /api/portraits listings
  game.js     the turn pipeline (advance), audiences (talk), councils, direct actions (act), saves, undo
  llm.js      OpenAI-compatible client: streaming (SSE), thinking on/off, continuation on cut-off, JSON repair, progress phases, mock mode
  prompts.js  every prompt: world primer, JSON rules, scene style, world digest, personas, turn prompt, audience prompt, council
  orders.js   free-text orders → engine actions (model-read, rule-read fallback) → executed before the story turn
public/js/shared/        the deterministic engine (runs on the server; the client imports it for display)
  world.js    state creation, place resolution, applyChanges() and every change op, calendar, realm helpers, generateKin
  economy.js  the ledger: yields, tribute, upkeep, taxes, projects, seasons, famine
  vassals.js  vassal temper, the banners, field service, the player as a vassal (liege calls)
  petitions.js decisions the realm brings (petitions) and applyPetitionFx() — the effect language of decisions
  plots.js    the living world: canon story threads, rising threats, churn, opportunities; threadsDigest() for the prompt
  warfare.js  march days, battle odds, siege estimates
  diplomacy.js disposition of characters toward the player
  people.js   sex, succession (heirOf)
public/js/ui/            the interface
  app.js (in public/js) title screen, game start, HUD, advance, turn report, settings
  windows.js  Realm/Council/Military/Economy/Diplomacy/Intrigue/People windows and the character/holding/army/house sheets
  drawer.js   right drawer: events feed, letters, audiences (scenes, voices), decision cards
  playback.js the turn told in order (day counter, events one by one, map flies)
  portrait.js painted procedural portraits (+ lazy idle painting, custom portrait override)
  voice.js / tts-worker.js  speech: Kokoro neural voices in a worker, browser voices, TTS server; narrator; speakBeats
  music.js    procedural score (Web Audio) or the player's files in public/music/
  sfx.js      procedural sound effects; ACT_SOUND in common.js maps actions to sounds
  event-art.js SVG illustrations for great events
  common.js   shared UI helpers (api(), por(), banner(), themes, modal, toast)
  icons.js    SVG icon set (replaces emoji via MutationObserver)
public/js/map3d/         three.js map: MapScene.js (terrain, water, camera, input, labels, armies, settlements),
                         models.js (castles, cities, landmarks, cloth banners, soldiers, surfaces), pathfind.js
public/js/map/           terrain.worker.js (heightfield/climate generation), noise.js
public/data/             all content: houses.js (houses, sigils, PLACE_ALIASES), characters.js, families.js (ancestors, parents, skills),
                         scenarios.js (lore, starting figures, armies), economy.js (resources), geography.js/atlas.js/warp.js (map),
                         looks.js (appearance), voices.js (speech manner, house ways), histories.js (past + nature), briefs.js
public/dev/              review pages: portraits.html, banner.html, events.html, sigils.html, atlas-preview.html, terrain.html
public/vendor/           three.js, kokoro-js (unmodified; see its README.txt)
public/fonts/            Cinzel, Cinzel Decorative, EB Garamond (OFL)
scripts/                 build-atlas.js (GIS → atlas.js), check-data.js, fetch-sigils.js, fetch-voices.js, migrate-positions.js
docs/DESIGN.md           design contract (engine vs story); read it
```

### The turn pipeline (`advance` in `server/game.js`), in order

1. **Orders:** `carryOutOrders()` in `server/orders.js` turns the player's fresh written orders into engine actions and executes them. It marks each order with what was done, in a hidden `note` that the story model sees.
2. **The story turn:** `buildJumpPrompt()` then `askJson(kind 'jump')` returns `{summary, events[{day,title,text,details,where,importance,type,houses}], changes[]}`. An unreadable reply is "salvaged": the engine advances alone and the player is told.
3. **Time and ageing:** the date advances; everyone ages; the old and ailing may die.
4. **Applying the story's changes:** `applyChanges(obj.changes, {protectPlayer, spanDays})`. Unknown ids are rejected, not fatal. Guardrails live in the ops, such as the attrition cap and caps on figure jumps.
5. **Vassals:** `vassalTick` for dues and banners.
6. **Marches:** ordered marches move along paths. Arrivals move the people riding with the host to its destination.
7. **Riders:** characters travelling alone (`c.travel`) arrive when their days are spent.
8. **Field service and musters.**
9. **The living world:** `worldTick()` in `plots.js` runs the threads, threats, churn and opportunities.
10. **Season:** the season turns if the story didn't turn it.
11. **The ledger:** `settle()` for money and food.
12. **Events:** each gets a `day` and they are sorted. A record is pushed to `state.history`.
13. **Petitions:** a realm petition (if no decision is pending, with a cooldown).
14. **Lapses:** decisions unanswered for 3 turns lapse, and their `lapse` effects apply.
15. **Save:** the state is saved. Memory consolidation runs in the background every `consolidateEvery` turns.

### The two languages of change

- **Change ops:** applied through `applyChanges(state, changes, ctx)` in `world.js`. The ops are `figure`, `relation`, `army_create`, `army_move`, `army_update`, `army_destroy`, `travel`, `recruit`, `hire`, `holding`, `holding_new`, `landmark`, `character`, `character_new`, `liege`, `house_update`, `war`, `war_join`, `pact`, `battle`, `raven`, `decision`, `chronicle`, `obligation`, `tax`, `project`, `season`, `marriage_characters` and `betroth`. The story model, audiences, plots and orders all speak this language. The model is told the schema in `prompts.js` under `CHANGE_SCHEMA`.
- **Decision effects (`fx`):** handled by `applyPetitionFx` in `petitions.js`. The effects are `rel`, `rel2`, `gold`, `food`, `menAtArms`, `nwMen`, `unrest`, `prosperity`, `unrestAll`, `loyalty`, `tribute`, `betroth`, `betrothNew`, `call`, `rising`, `rebel`, `debt`, `chance`, `ops` (any change ops), `plot` (set a story flag), `prestige` and `threat`. Decisions can carry `lapse: fx`, which is what the world does if the player stays silent.

### Direct actions

These are the buttons in the windows, routed through `POST /api/games/:id/act`: `tax`, `project`, `dues`, `cancel_project`, `call_banners`, `decide`, `appoint`, `grant`, `raise`, `disband`, `march` and `order`. The client's `api()` plays a sound for each kind; the mapping is `ACT_SOUND` in `common.js`.

### Principles to keep

- **The engine owns numbers and physics; the model owns story.** Model changes are validated and capped. See the attrition cap in `army_update`, the figure caps, and `protectPlayer`, which stops the model from changing the player's allegiance or taxes.
- **Make things happen in the engine.** If something must happen (an order, a canon event), do it in the engine and tell the model, rather than hoping the model does it.
- **Prompt caching:** the system prompt is static, and the static digest (houses and characters) comes first in the user message, before the dynamic state. llama-server `--cache-reuse` depends on this ordering, so keep it.
- **Small models:** replies must parse even from 4B models. `JSON_RULES`, `extractJson` repair and continuation on cut-off exist for this. Any new model output field must be optional.

---

## 4. Everything done in this session

These are the session's commits, in order. Run `git log` for the full messages, which are detailed.

### Model plumbing (the owner's JSON errors with Okami)

- **Streaming:** SSE streaming with progress phases (waiting, reading with prompt %, thinking, writing, continuing, retrying), polled by the busy overlay through `/api/games/:id/progress`.
- **Thinking:**
  - on / off / auto (`chat_template_kwargs.enable_thinking`), plus a thinking budget;
  - quick kinds (chat, council, suggest, consolidate, orders) skip thinking unless "think in audiences" is on;
  - a reply that runs out of room while thinking is retried with thinking off.
- **Cut-off replies:** continued up to twice and stitched together, with the answer budget scaled to the span.
- **JSON repair:** raw quotes and newlines inside strings, truncation, trailing commas, unquoted keys, thousands separators, and `<think>` blocks.
- **Connection handling:** `agent: false` avoids socket reuse, which caused "socket hang up"; ECONNRESET is retried once.
- **Salvaged turns:** an unreadable reply no longer loses the turn.
- **Progress fix:** llama.cpp's prompt-progress chunks were once miscounted as writing.
- **Id resolution:** near-miss ids are resolved (plural or "of" house names, `the_wall`, an army named after its house), and changes repeated verbatim are applied once.

### Audiences and voices

- **Scene format:** narration in asterisks, in the third person past tense, like the books ("Robb stood in the great hall, his posture rigid"); never "I" inside the asterisks. Speech is first person to the player and rendered in quotation marks (`SCENE_STYLE` in `prompts.js`).
- **Raven or audience:** each prompt states whether the exchange is face to face or by raven, so distant lords write letters.
- **Voices:** Kokoro-82M neural voices run in a Web Worker (`tts-worker.js`, vendored `kokoro-js`), and are the default engine.
  - **Profiles:** about 55 main characters have hand-set voice and pitch in `voice.js` under `PROFILES`; everyone else gets a voice by sex, age and hash.
  - **Narrator:** reads the action lines (voice `am_echo`).
  - **Playback:** sentence-by-sentence, the first sentence playing while the rest are voiced.
  - **Speaker button:** reads the whole scene top to bottom (`speakBeats`).
  - **Loading:** a local copy in `public/models/` is used first, then Hugging Face. The model is about 90 MB; `npm run fetch-voices` downloads it for offline play.
  - **Fallbacks:** browser voices (preferring "natural/online" ones) or an OpenAI-compatible TTS server.
- **Voice cloning:** the game will not clone real actors' voices. The owner asked; this was declined for consent reasons, and the README says so.

### Art, UI and presentation

- **Heraldry:** SVG book heraldry for about 31 houses (`sigil-art.js`, `sigils.js`, blazons in `houses.js`).
- **House themes:** the interface takes the house's palette (`THEMES` in `common.js`); Stark is blue-grey, Lannister crimson and gold, Baratheon gold.
- **Portraits:** painted procedural portraits (`portrait.js`, driven by `data/looks.js`, about 150 characters described from the books).
  - Garb follows office and region, and regalia follows title.
  - The dead are shown in sepia with a ribbon; prisoners behind bars.
  - Each face has its own structure (eye spacing, nose, lips, jaw, tilt).
  - Painting is lazy and happens in idle time.
  - `public/portraits/<id>.png` overrides a portrait (listed by `/api/portraits`).
- **Cloth banners on the map:** a vertex-shader wave, facing the camera, hanging from a crossbar with gilt finials. In the UI, banners sway using CSS and an SVG turbulence filter.
- **Soldiers:** surcoats in house colours, helms, spears, shields in the sigil's field, and horse with lances. Marching hosts bob as they walk. A garrison camps outside its castle.
- **Castle surfaces:** masonry, tile or slate roofs, and half-timbering, shaded in model space (`surfaceMaterial` in `models.js`).
  - Regional roof colours; castles tinted with their lord's colours.
  - The Dragonpit is a ruin.
  - Seats too close together shrink rather than overlap (`fitSettlements`).
- **Map atmosphere:** drifting cloud shadows, a lens vignette, and a warm colour grade.
- **Map handling** (the owner's bugs):
  - no text selection when dragging;
  - dragging on labels pans the map;
  - momentum panning;
  - settlements keep a constant size at any zoom (King's Landing no longer grows);
  - far seats become small diamond markers instead of vanishing.
- **Events:**
  - parchment cards that no longer go black on hover;
  - illustrated headers for importance 4+ (`event-art.js`);
  - the headline / one-liner / "More" structure;
  - the day-by-day turn replay (`playback.js`).
- **Title and loading screens:**
  - the title opens on the last house played, with gilded corners and a "you will play as" portrait card;
  - the Begin button stays pinned;
  - the loading screen shows the banner, the house words and rotating book quotes.
- **Fonts:** bundled locally (they were silently falling back to Georgia).
- **HUD:** a ledger-style top bar, dock tiles with badges, and a command bar positioned clear of the dock.
- **Sound:** procedural sound effects (click, parchment, bell, raven, horn, steel, coins, seal, error) and a procedural music score with moods.

### World, lore and simulation

- **Living world (`plots.js`):**
  - **Canon threads, 298–300 AC:** the King's ride north, Bran's fall, the catspaw, the Hand's tourney, the Imp seized, the Riverlands burned, Robert's hunt, the throne-room coup, Baelor's Sept, the North's banners, the King in the North, the Twins, the Whispering Wood, Renly's shadow, the Blackwater, the Purple and Red Weddings, dragons, the ironborn, Benjen, and the wights.
  - **Conditions:** each beat fires only while the world fits it and lapses otherwise.
  - **Player decisions:** beats that touch the player's house become decisions with `lapse` defaults.
  - **Threats:** free folk, the cold, the Iron Bank and winter, which drive wildling raids.
  - **Churn:** feuds, feasts, tourneys, outlaws and harvests.
  - **Opportunities:** raids, lenders, sellswords and wardships, with cooldowns.
  - **UI:** shown in *Intrigue → Shadows over the realm*.
- **Musters and resources:** set to the book numbers (`scenarios.js`, `economy.js`).
- **Voices of houses and characters:** `voices.js` holds speech manner, wants and fears, plus `HOUSE_WAYS`, which is given to the turn prompt.
- **Histories and personalities:** `histories.js` holds each character's past up to 298 AC (no future events) and their nature: courage, wits, guile, pride, temper, what sways them and their weakness. The audience prompt includes the nature, a derived line such as "you are not clever…", and **the odds** (both sides' strength with a sensible stance).
- **Servants obey:** people of the player's house are told they are sworn men who obey at once and never refuse or lecture. Their commands (travel, recruit, hire) take effect, with a rule-reader fallback if the model forgets the change.
- **Orders happen:** see `server/orders.js`.
  - **New ops:** `travel` (with men detached from a host or the household guard, and companions), `recruit` (only where the house has people, paid in gold, capped by city size) and `hire` (officers under commoner names).
  - **The Hand's journey:** accepting the Hand's chain sends Ned south with 300 men, Jory, Vayon Poole and the girls.
  - **Army sheets** show who rides with the host and the march ETA.
- **Attrition:** non-battle losses are capped by season (about 2% a month in summer, 4% in autumn, 8% in winter, ×1.5 on the march). The turn prompt spells out which weather each season allows.
- **Earlier, before this session:** economy, vassals, petitions, the war room, succession, ageing, famine, seasons, disposition, map rebuild from the GIS atlas, and more. See the older commits and `README.md`.

---

## 5. In the middle of (when this was written)

- **Turn playback:** finished and committed (`74380dd`).
- **Fog of war and intelligence:** the next task, **not started**. The design is in §6.1.

## 6. Still to do: the owner's list, and known gaps

### 6.1 Fog of war and intelligence (owner request; highest priority)

The owner wants the map to show what the player's house knows, not everything:

- Armies near the player's lands, hosts, vassals and spies are **confirmed**.
- Others are known only from **reports** (ravens, spies, merchants). They are shown lighter or dashed, with a confidence level and "as of" date, and may be **false**.
- Robb-style deception should be possible: split forces, feints, false reports planted through spies.

Suggested design:

- **Data:** keep true state as it is, and add `state.intel = { armies: { [armyId]: { pos, men, asOf, confidence 0–1, source, false? } } }`.
- **Knowledge pass:** a function in a new `shared/intel.js`, run each turn after marches.
  - Sight radius, in map units: about 60 around player holdings, 80 around player armies, plus vassal holdings. Anything within sight is confirmed.
  - Spies: add intrigue scheme ops or hire spymasters. Each spy placed in a house gives sight of that house's armies.
  - Otherwise, the report decays. Confidence drops by about 0.15 per turn, and the position stays where last seen.
- **The model:** add a change op `report` `{army, at, men, source, confidence, false:true?}` so the story can deliver ravens and spy reports, including planted lies. Show it in the turn prompt schema.
- **Client:**
  - `MapScene.syncArmies` should render enemy armies from `state.intel` for the player, not from `state.armies`.
  - Unknown armies are hidden.
  - Reported armies get a translucent model and a label like "~3,000? (raven, 12 days old)". Lighter means less certain.
  - Army sheets show "reported" figures.
- **Server:**
  - `GET /api/games/:id` should keep sending the full state, because the client needs it for its own logic.
  - Filter in the client for honesty; or better, strip other houses' true army positions when sending. Decide which, and keep it simple.
  - Mind the prompts: the story model still sees the truth, but the audience prompt should give characters only what they plausibly know.
- **Deception:**
  - the player's orders, such as "spread word that we march on the Twins", become false `report`s in enemy intel;
  - enemies can plant them on the player;
  - `threadsDigest` or the prompt should tell the model this is allowed.

### 6.2 Other items from the owner's latest notes: status

| Owner's note | Status |
|---|---|
| Text gets highlighted when dragging the map | Done |
| Event card goes black on hover | Done |
| Narration should be "Robb stood…", not "As I stand…" | Done in the prompt. Verify with the real 35B model. |
| Speaker button should play every line top to bottom | Done |
| Voices sound robotic | Done with Kokoro neural voices, which are the default. Per-character override is available as JSON in Settings. A per-character voice picker UI would be nicer (to do). |
| Deep history and distinct personalities; weak characters should yield | Done for about 45 characters plus a derived nature for the rest. Extend `PERSONAS` to more characters; consider having the turn prompt include one-line natures for key NPCs. |
| Structured events with headline and details; day-by-day streaming with map changes | Done: events, details and replay. **Missing:** map changes that actually appear progressively during the replay (armies moving at the event's day, pins appearing). The map currently shows the end state; the camera only flies. |
| Fog of war and intelligence | **To do** (§6.1) |
| Map scrolling feels tricky | Improved: pan from labels, momentum, no selection. Could add zoom smoothing (lerp the distance toward a goal while keeping the cursor anchored) and edge-of-screen panning. |
| Actions do nothing (recruiting in King's Landing, men static at 250) | Done: the orders engine and recruit op. **Verify with the real model** that the order interpreter prompt (`ordersPrompt`) produces good actions; only the rule reader was exercised in mock mode. |
| Army sheet should show Jory and others in the host | Done ("Riding with the host"). Ned's escort now carries them. |
| A hired spymaster should appear in the host or city | Done: hires appear at the place, and the holding sheet's "People here" lists them. |
| Servants are disrespectful (Jory) | Done in the prompt plus enforcement. Verify with the real model. |
| Lost 750 of 1,000 men to a summer blizzard | Done: attrition cap plus season-weather instruction |
| King's Landing grows as you zoom out; cities vanish when zoomed out | Done |
| Commands to go to Oldtown should be followed, with events en route | Travel and march are done; "events en route" (encounters, bandits, battles on the road) is not simulated by the engine. Consider an encounter roll per turn for hosts and riders passing hostile or restless land. |

### 6.3 Known gaps and ideas

- **Characters travelling alone** (`c.travel`) are not drawn on the map. Draw a small rider marker moving along the line.
- **Portraits:** babies and toddlers (Rhaenys, Aegon) render as adults. Add an `infant` build. Children look like small adults generally.
- **Voices:** the first use downloads about 90 MB. Consider prompting before download, and a per-character voice picker in the character sheet.
- **Playback:** only importance ≥ 2 events are replayed; economy notes appear only in the report. Consider grouping minor events into "Meanwhile…" lines.
- **Order interpreter:** it runs only at Advance. Consider an immediate "Carry out now" so the player sees results before the turn.
- **The turn prompt** doesn't yet include character natures (token budget). Consider adding them for characters appearing in recent events.
- **Saves:** existing saves predate the new musters and the living world. New features apply to new games (plots start at stage 0 for old saves, which is fine).
- **Mock mode's canned replies** don't use the new event fields (day and details); they're filled in by the server.
- **The `relay/` folder:** "relay GM mode" writes prompts and replies there for a human-in-the-loop game master. It is git-ignored.

---

## 7. Conventions

- **Commits:** a descriptive subject plus a body explaining what and why for players, ending with the Co-Authored-By and Claude-Session lines the environment specifies. Push after each logical unit (a Stop hook enforces a clean, pushed tree).
- **Code style:** match the surrounding code, which is compact modern JS (ES modules, no build step, no dependencies). Comments explain *why* in plain English, often in the game's voice. Don't add frameworks.
- **Data accuracy:** the books first, the show only where the books are silent. Never put post-298 AC events into histories, or characters will "know" the future. Validate with `npm run check` and by checking ids against `characters.js` and `houses.js` (see the checks used in commits).
- **Verify visually:** screenshot every UI change; the dev pages in `public/dev/` render the whole cast, all banners and all event art at once.
- **Honesty:** say what was verified and how. When something is limited by the small test model, say so.

## 8. Read first, in this order

1. `README.md`: what the game does, for players.
2. `docs/DESIGN.md`: the engine-versus-story contract.
3. `server/game.js`, the `advance()` function: the turn pipeline.
4. `public/js/shared/world.js`, `applyChanges`: every change op.
5. `server/prompts.js`: what the model is told. Keep caching order and small-model robustness.
6. `public/js/shared/plots.js`: the living world. Add threads here.
7. `server/orders.js`: how orders become actions.
8. `public/js/map3d/MapScene.js` and `models.js`: the map, before touching fog of war.
9. `public/js/ui/drawer.js`, `windows.js`, `app.js`: the UI.
10. `git log`: the commit bodies are a detailed changelog of intent.
