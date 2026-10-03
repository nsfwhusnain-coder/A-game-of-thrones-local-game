# Bug-hunt harnesses

The probes that produced `docs/BUG-HUNT-2026-10-02.md`. They read and report; none of them changes the game. Run
everything from the repo root on **the mock provider** (each script sets `WC_PROVIDER=mock` itself, or starts its own mock
server on a spare port with a scratch saves folder). Nothing here touches your `saves/` or your `config.json`.

- `WC_REPO` the checkout to test (default: this repo). `BH_OUT` where results go (default `.bughunt-out/`, git-ignored).
- The browser probes need Playwright (a dev tool, not a dependency):
  `npm i --no-save playwright && npx playwright install --with-deps chromium`. They start Chromium with SwiftShader
  (`--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`), so no GPU is needed; they are slow (a minute or two
  per screen).
- The scripts are plain Node, written to be read and edited. Copy one when you need a new probe.

## Whole-game sweeps

| Script | What it does |
|---|---|
| `sweep-soak.mjs <house> <seed> <turns> [span]` | Plays a house on the mock and checks every turn: the engine's invariants, odd text, numbers, people, conquest, lords acting on the road, the coherence checker. Writes `soak-<house>-<seed>.json`. |
| `run-soaks.mjs` | Runs `sweep-soak` over about 60 houses, three at a time (slow; trim the lists). |
| `odd-soaks.sh` | The odd houses (a city, a company, a tribe, the Wall), 14 turns each. |
| `analyze-game.mjs <house> <seed> <turns> [span]` | One game, many consistency checks on the facts: tourneys, champions, the dead and the held acting, children leading, pronouns, speeds. |
| `probe-simul.mjs <house> <seed> <turns> [span]` | One person doing two things that cannot both be true: a lord hosting while on the road, a tourney's host away on a progress, a host whose commander is not with it, a man in two parties, the held or the dead in command. |
| `probe-links.mjs <house> <seed> <turns> [span]` | The web of relations after every turn: a liege that loops or is gone, a hold with no house, a seat held by strangers, a regent in a cell or in the grave, a living spouse who does not answer the vow, a child older than a parent, a siege with no host at the walls, a war with a side that is gone. |
| `play-orders.mjs <house> <seed> <turns> [span]` | Plays a house with plausible orders in its own words (names taken from the world), one or two a week; reads the invariants, odd text in cards and receipts, and a person in two parties. `V=1` prints every order and what it did. |
| `fuzz-ops.mjs <seed> <n>` | `applyChanges` with the ops a model could emit and weird parameters; reports state that goes NaN or breaks an invariant. |
| `fuzz-verbs.mjs <seed> <n>` | every verb with weird parameters; a verb must refuse in words, never throw, never corrupt. |
| `fuzz-orders.mjs <seed> <n>` | random sentences from the words of orders (odd characters, long strings) through the reader and its receipt; reading must refuse in words, never throw. |
| `seed-sweep.mjs <first seed> <count> [turns] [span]` | Many seeds, a few turns each, a different house each time: an exception in a turn, or a world that breaks its own invariants. |
| `play-all-houses.mjs` | Two turns as every one of the 290 houses (about 12 minutes). Prints only the houses with problems. |
| `sweep-world.mjs` | The starting world of every house and character: missing links, ages, duplicates. |
| `seed-loop.sh [house] [first] [last]` | The CI soak (`scripts/soak.js`) on many seeds; prints the ones that fail. |

## Reading what a player reads

`probe-corpus.mjs <house> <seed> <turns> <span> <file>` dumps every card, digest and "meanwhile" of a mock game to a text file
to read by eye; most of the findings in the report came from reading it. `probe-shape.mjs` prints the shape of a turn.

## Targeted probes

`probe-demo.mjs` (births, deaths, ages over 48 turns), `probe-age.mjs`, `probe-econ.mjs` (money over two years),
`probe-realm.mjs` (the ledger view), `probe-data.mjs` (links in the starting data), `probe-orders.mjs` (a battery of orders on the
mock), `probe-undo.mjs`, `probe-det.mjs` (two games, one seed, no differences), `probe-settings.mjs` (ironman, canon gravity),
`probe-gameover.mjs` (the lord, the heir, the family die), `probe-missing.mjs` (a save with a key removed), `probe-oldsaves.mjs <saves
folder copy>` (older saves open and play).

`cases/` holds one-off repros of single findings (`probe-asha.mjs`, `probe-guard.mjs`, `probe-banners.mjs`, `probe-briefs.mjs`).

## Server

`probe-api.mjs`, `probe-api2.mjs` (hostile and odd requests; writes `api.json`, `api2.json`), `probe-race.mjs` (requests while a
jump runs).

## Interface (Playwright)

`sweep-ui.mjs <houses> <sizes>` walks every window and map mode and lists clipped text, tiny controls, odd text, console errors;
`probe-ui2.mjs` (typing HTML into orders, a stuck key, a double End turn, a reload mid-turn); `probe-zoom.mjs` (label clutter at five
camera distances); `probe-houses-ui.mjs <houses>` (the first screen for odd houses); `probe-life.mjs <house> <turns> <seed>` (the
living map's walkers against the terrain); `probe-leak.mjs` (memory, DOM and scene growth over turns).

## `live/` is for the owner

These need the language model, so a cloud agent cannot run them and nothing in CI may call them. Start a server yourself against
your own model (`WC_CONFIG=<a config file> PORT=3424 WC_SAVES=<scratch folder> node server/index.js`) and run
`live/live-play.mjs <name> <house> <seed> <turns>` (turns, audiences and a council; set `ORD`, `AUD`, `COUNCIL`, `CMSG`, `SPAN`),
`live/live-orders.mjs <house>` (a battery of orders through the interpreter) or `live/probe-live-ui.mjs` (the Chronicle with real
text). Transcripts from the first runs are in `docs/bughunt/live-samples/`; use them as text fixtures.
