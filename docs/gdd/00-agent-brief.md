# 00 · Brief for the implementing agent

> Read this first. It tells you the situation you are working in, how much latitude you have, the standards you are
> held to, and how to hand the work back. Then read [README.md](README.md) and the documents in its reading order.

---

## 1. What you are doing

You are turning **Westeros Chronicles** — a local, AI-simulated *A Song of Ice and Fire* grand-strategy game — from a
rich but incoherent prototype into a polished, immersive, coherent game. This GDD is the plan: it diagnoses what is
wrong (with evidence from a live playtest on the owner's PC), specifies the target architecture, systems, content,
interface and quality gates, and orders the work into packages ([16-roadmap.md](16-roadmap.md)).

The owner wants it to be **"an absolute beast of a game"**: immersive, grounded in the books, alive on the map,
professional and uncluttered, with the AI's story and the engine's numbers always in agreement. Set your bar there.

## 2. Your environment (and what you cannot do)

- You work **in a cloud VM with GitHub access to this repository only.** You have no access to the owner's PC.
- **There is no GPU and no language model available to you.** You cannot run or test the owner's models (llama-swap,
  Gemma 4 26B A4B, Qwen3.6-35B-A3B). Do not write any task, test or CI step that requires one.
- Therefore everything you build must be testable with the **`mock`** provider (rule-based, schema-valid) and the
  **`replay`** provider (recorded replies), as specified in [04-ai-system.md](04-ai-system.md) §14 and
  [15-qa-tooling.md](15-qa-tooling.md). Real outputs recorded on the owner's PC on 2026-09-27 are in
  [`assets/bench-2026-09-27/`](assets/bench-2026-09-27/) — use them to understand how the real models behave (the
  prefix-collision pitfall, the CJK leak, weak strategy, good prose) and to seed replay fixtures.
- The owner plays on **Windows**. Use GitHub Actions `windows-latest` in CI so Windows breakage (like B-01, which crashed
  the server on native Windows since the first commit) can never ship again.
- WebGL in CI runs on SwiftShader (slow but correct). Use it for screenshots and geometry assertions, not for FPS.
- Anything that needs the real model or real hardware — model accuracy, latency, FPS, "does it feel good" — becomes an
  **owner check**: you ship the script and the checklist; the owner runs it and reports back.

## 3. Latitude (you are trusted)

This GDD is written to be complete, not to cage you. Read it as:

- **Normative** (must): the six pillars ([01](01-vision.md) §3), the principles of [03](03-architecture.md) §1 (the
  model never mutates state; facts are the only history; one activity per character; everything moves as a party;
  deterministic engine; knowledge per house; one verb registry), the quality gates ([01](01-vision.md) §7), the owner's
  decisions (README §2), the scenario tests ([15](15-qa-tooling.md) §2), and the "never do" list below.
- **Specified** (should): the data shapes, schemas, formulas, numbers, layouts and verb lists. Follow them unless you
  find something better.
- **Advisory** (may): examples, wordings, sizes, file names.

**If you find a better design** that satisfies the normative parts and the gates, do it — and record the decision in
`docs/gdd/DECISIONS.md` (date, what, why, what it replaces). If you find a mistake in this GDD (a wrong canon date, a
number that does not balance, a schema that does not work), fix the GDD in the same PR. If you discover a system the
GDD missed that the game plainly needs, add it to the GDD first, then build it. Go beyond the plan where it makes the
game better; never go below the gates.

## 4. Standards

- **Architecture discipline.** No shortcut may let model output change state. No subsystem may emit player-visible text
  that is not a fact. If you are tempted to "just have the model do it", build the verb and the fact instead.
- **Code style.** Match the repository: modern ES modules, no build step, **zero runtime dependencies** (three.js and
  kokoro-js stay vendored), compact code, comments that explain *why* in plain English. Dev-only tools may be installed
  in CI without adding runtime dependencies.
- **Tests with every change.** Unit tests for engine rules; scenario tests for behaviours; contract tests for AI calls;
  screenshots for UI. The scenario tests in [15](15-qa-tooling.md) §2 are the owner's complaints — they must stay green.
- **Book accuracy.** [13-content-data.md](13-content-data.md) §1. Books first; the show only where the books are silent;
  no post-298 knowledge in characters; cite sources in data comments; prefer omission to invention.
- **Honesty.** Say what you verified and how. Never claim a model-dependent result you could not measure; mark it
  "owner to verify". If a gate cannot be met, say so and why.
- **Performance.** Respect the prompt-token budgets ([04](04-ai-system.md) §2.5) and the engine-time budgets
  ([15](15-qa-tooling.md) §7) — they are how the owner's turns get fast.

## 5. How to work

1. Read, in order: this brief → [README](README.md) → [01](01-vision.md) → [02](02-audit.md) → [03](03-architecture.md)
   → [04](04-ai-system.md) → the rest as your work package needs → `docs/HANDOFF.md` (the previous sessions' notes;
   superseded where this GDD differs) → `git log` (the commit bodies explain intent).
2. Run `npm run check` and `npm test` (some HTTP tests fail on Windows today — WP A2).
3. Work through [16-roadmap.md](16-roadmap.md) in order: **Phase A first** (small fixes the owner benefits from at once),
   then B1–B5, then the rest with the parallelism shown. Some Phase A items may already be done in the commit that
   added this GDD — check `docs/CHANGELOG.md` and the roadmap's status marks.
4. **Git:** work on branches named `wp/<id>-<slug>` (e.g. `wp/b2-parties`), open a pull request into
   `claude/brave-ramanujan-i8dt0q` (the repository's default branch, which the owner pulls and plays) per work package
   or per small group of related packages, with: what changed, why, how it was tested, screenshots, what the owner
   should verify. Merge only with CI green. If the owner's task instructions say otherwise, follow them.
5. Keep the game **playable at every merge**. The owner pulls and plays the default branch; a half-migrated state must
   stay behind a feature flag (`config.json` `engine: 'v2' | 'v3'`) until it is complete.
6. Update the GDD as you go: mark sections *implemented in <commit>*, fix what turned out wrong, record decisions.

## 6. Never do

- Never let model output mutate state (no `applyChanges(modelOutput)`).
- Never require a GPU or a live model in tests or CI.
- Never remove or degrade the **portraits and family trees** (owner's favourite; [12](12-ui-ux.md) §15 — improve them).
- Never add runtime npm dependencies.
- Never use "Open Historia" or other clones as a design reference — only the official Pax Historia (owner's instruction).
- Never recommend the 256k-context model profiles (owner: too slow) — 64k profiles only.
- Never clone real actors' voices.
- Never copy text from the books into the game or into training data.
- Never show the player the engine's canon schedule, a future beat's name, or hidden truths (spoilers, fog of war).
- Never ship a UI change without screenshots at 1920×1080 and 1366×768.

## 7. Handing back

When your work (or a phase of it) is done, write **`docs/HANDOFF.md`** anew (the current file is from earlier
sessions; move it to `docs/archive/HANDOFF-2026-09.md`). It must contain:

1. What was built, by phase, with the commits/PRs.
2. What is verified (by CI) and what the owner must verify (the checklist of [15](15-qa-tooling.md) §8, as commands).
3. **Model guidance for the owner:** which llama-swap profile and model to use by default (the evidence in
   [04](04-ai-system.md) §11 points to Gemma 4 26B A4B 64k), the exact server flags you recommend (`--parallel 2
   --kv-unified`, context 65536, cache reuse), the per-call routing `config.json`, temperatures, and how to switch the
   narrator to another model.
4. **Fine-tuning guidance:** when to do it (the bench thresholds of [04](04-ai-system.md) §11.4), the recipe in
   `scripts/finetune/` step by step (dataset build from `llm-log.jsonl`, labelling, QLoRA config, where to rent a GPU,
   GGUF adapter export, the llama-swap profile to add), and how to bench before/after.
5. Known limits, open questions for the owner, and what you would do next.
