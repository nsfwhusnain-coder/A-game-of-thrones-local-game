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
