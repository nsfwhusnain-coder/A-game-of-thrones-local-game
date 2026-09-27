# Westeros Chronicles — working rules for Claude

A local, AI-simulated *A Song of Ice and Fire* grand-strategy game (298 AC). Pure Node, zero runtime dependencies,
three.js map, ES modules, no build step. `npm start` → http://127.0.0.1:3298.

**The plan is the Game Design Document in `docs/gdd/`. Read `docs/gdd/00-agent-brief.md` first, then
`docs/gdd/README.md`; the order of work is `docs/gdd/16-roadmap.md`; what is already done is in `docs/CHANGELOG.md`.**

## Environment

- Cloud sessions have **no GPU and no language model**. Run everything on the mock provider (`WC_PROVIDER=mock`);
  build every AI call with a schema, a mock and a fallback (`docs/gdd/04-ai-system.md` §14). Never add a test or CI
  step that needs a live model — the owner verifies the live model with the scripts you ship.
- Checks: `npm run check` and `npm test` before every commit. CI (`.github/workflows/ci.yml`) runs them on
  windows-latest and ubuntu-latest; the owner plays on Windows — keep both green.
- UI work: screenshot with Playwright (Chromium, SwiftShader WebGL: `--use-gl=angle --use-angle=swiftshader
  --enable-unsafe-swiftshader`) at 1920×1080 and 1366×768, and attach the images to the PR.

## Never

- Let model output mutate state (models propose intents and narrate facts; the engine resolves; facts are the only
  history — `docs/gdd/03-architecture.md` §1).
- Add runtime npm dependencies (dev tools installed with `--no-save` in CI/scripts are fine).
- Remove or degrade the portraits and family trees — improve them (`docs/gdd/12-ui-ux.md` §15).
- Use "Open Historia" as a reference (only the official Pax Historia); recommend the 256k-context model profile
  (64k only); clone real actors' voices; copy book text; put post-298 knowledge into characters; show the player
  spoilers or hidden truths.

## Git

- Default branch `claude/brave-ramanujan-i8dt0q` is what the owner pulls and plays: keep it playable at every merge
  (unfinished rebuilds behind `config.json` `engine: 'v2' | 'v3'`).
- One branch per work package, `wp/<id>-<slug>`; a PR into the default branch with what/why/how-tested/screenshots/
  what-the-owner-should-verify; merge only with CI green. Add a `docs/CHANGELOG.md` entry per merge.
- Record design departures from the GDD in `docs/gdd/DECISIONS.md`; fix the GDD when it is wrong.

## Style

Match the surrounding code: compact modern JS, comments that explain *why* in plain English, often in the game's own
voice. Commit messages: a plain subject and a body that says what changed for the player and why.

## Handing back

At the end of each phase write `docs/HANDOFF.md` per `docs/gdd/00-agent-brief.md` §7 (what was built, the owner's
verification commands, model and llama-swap guidance, the fine-tuning recipe, known limits).
