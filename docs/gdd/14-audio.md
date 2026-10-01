# 14 · Sound: music, effects and voices

> Keep what exists (`ui/music.js`, `ui/sfx.js`, `ui/voice.js`, `ui/tts-worker.js`, vendored `kokoro-js`); make sound
> follow the story. The implementing agent cannot listen: every rule here is testable as "event X triggers cue Y" in
> unit tests, and the owner judges the result by ear.

---

## 1. Music (`ui/music.js`)

The procedural score (cello theme over harp and drone) and the player's own files in `public/music/` are kept.

| State | Mood | Rule |
|---|---|---|
| Title | *theme* | the house theme if a house is highlighted |
| Planning, peace | *court* (the house's region variant: North = cold drone + cello; Reach = harp and flute; Dorne = oud-like pluck; Iron Islands = low drums) | default |
| Planning, at war | *war* (low strings, drum pulse) | player at war |
| Jump in progress (waiting for segment 1) | *tension* (sustained, rising) | ≤ 20 s |
| Playback, importance ≥ 4 war event | *sting* (a short brass/drum hit) then back to the underlying mood | once per event |
| Playback, a death in the player's family | *lament* (solo cello) for the card's duration | |
| A matter opens | *silence* (fade to 20 % over 1 s) | the player decides in quiet |
| Winter | the *court* mood with a colder mix (more drone, less harp) | season |
| Victory/defeat end screen | *theme* full / *lament* | |

Cross-fades 1.5 s; never restart the same mood; volume and mute persist (existing).

## 2. Sound effects (`ui/sfx.js`)

Existing: click, parchment, bell, raven, horn, steel, coins, seal, error. Map facts → cues (`ACT_SOUND` in
`common.js` extended to `FACT_SOUND`):

| Fact / UI event | Cue |
|---|---|
| Jump pressed | bell (distant) |
| `letter_arrived` for the player | raven caw + parchment |
| `battle` | horn + clash (steel) |
| `holding_fell`, `siege_begun` | horn (low) |
| `levies_called`, `host_formed` | horn (two short) |
| `host_joined` (large contingent) | drums (soft) |
| coin change > 10 % | coins |
| Matter opens | seal (wax crack) |
| Receipt ✓ / ✗ | soft tick / muted error |
| `death` of a great lord | bell (single, deep) |
| `wedding`, `feast` | lute flourish |
| `season_turned` winter | wind |

Rules: at most one cue per 400 ms; cues duck the music by 30 % for their length; a *Sound effects* volume slider
(existing) and mute.

## 3. Voices (`ui/voice.js`)

Kept: Kokoro-82M in a worker, voice blends per character (`PROFILES` ~60 hand-cast, `POOLS` for the rest), mood pace,
name respellings (`SAY`), narrator voice, "play the whole scene", browser/remote TTS fallbacks, local model files via
`npm run fetch-voices`.

Improvements:

1. **Playback narration** (optional, Settings → *The chronicle is read aloud*): the narrator reads the headline and
   scene of importance ≥ 4 cards during playback; playback holds until the reading ends.
2. **Letters** read in the sender's voice when opened (if voices are on).
3. **Council** speeches voiced in turn (existing for audiences; extend).
4. **Casting coverage:** every character with a persona gets a hand-cast voice in `PROFILES` (target 200). Accents:
   British for Westeros (the show's convention), northerners lower and plainer, Dornish warmer; Essosi voices from the
   other pools.
5. **No voice cloning of real actors** (policy kept; README states it).
6. **First-use download** (~90 MB): ask before downloading ("Voices need a one-time download of 90 MB. Download now /
   Use the browser's voices / No voices").

## 4. Tests

- `tests/audio-map.test.js`: every fact kind with a cue maps to an existing sfx id; mood selection by state is a pure
  function tested over fixture states.
- Voice casting: every persona id has a `PROFILES` entry or a deterministic pool assignment; `SAY` covers every name
  containing `ae`, `y`, `gh` or an apostrophe (a list test).

## 5. Implemented (WP H1, D-100)

- **`ui/audio-map.js`** (pure, tested in `tests/audio-map.test.js`): `moodFor` — the title is the theme (the house's if one is highlighted), planning takes the region of the house you rule (north, reach, dorne, iron, or the court), war overrides it, winter colours it (`cold`), a jump awaited is *tension* for at most twenty seconds, a death in the player's family is a *lament* for as long as its card is told, a matter open fades the music to a fifth (`quiet`), the end is the theme or a lament; `FACT_SOUND` and `cueFor`/`cueForCard` — the cue each fact of §2 sounds; `cueGate` — at most one cue in 400 ms.
- **`ui/scene.js`** gives the scene to the music (and watches the modal for a matter opened or put away); `ui/music.js` plays the player's own files by folder — `war/`, `tension/`, `lament/`, `winter/`, `north/`, `reach/`, `dorne/`, `iron/` besides `title/` and the house's — falling back to the nearest fitting one; `ui/sfx.js` has eight new cues (a low horn, two short horns, drums, a lute's flourish, a wind, a tick, a single deep bell, a sting) and `cue()`, which ducks the music by 30 %.
- **Read-aloud** (Settings → Sound & voices, off by default): the narrator reads the headline and summary of each great or major story as playback tells it, and the days wait for the reading (a skip or a step ends it); **letters** are read in the sender's voice when the Letters tab opens (the newest three unread); **council** speeches were already voiced in turn.
- **Casting** (`ui/cast.js`, pure): 296 characters cast (every persona of `data/histories.js` by hand, the household and cousins by type with a little of their own), a stranger's voice stable and sorted by sex, age and homeland; `SAY` respells the names a speech model says wrongly and `SAY_OK` lists the 120 that are said rightly as written — a new name with an "ae", "gh", a medial "y" or an apostrophe fails the test until it is one or the other.
- **The first download** (about 90 MB) is asked for: *Download now / Use the browser's voices / No voices*, and the answer is kept. The headless scripts (`ui-gate`, `visual`, `map-check`) preset the answer so a prompt never stands in their way.
- **Not done:** the procedural score (the folder-of-your-own-music design stands; with no files there is silence); nothing here was listened to.
