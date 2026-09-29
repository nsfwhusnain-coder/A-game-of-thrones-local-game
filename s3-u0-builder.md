First read and obey the COMMON RULES block in docs/AGENT-PLAYBOOK.md §1 (lines 20–53) — absolute. Then CLAUDE.md.

ROLE: BUILDER (visual designer) for work package U0 — "The look: the maester's desk". You may NOT commit.
Working directory: /home/user/wc-s3 (a git worktree, branch wp/u0-the-look). Work ONLY there. node_modules (with Playwright) is symlinked in; Chromium is at /opt/pw-browsers (Playwright finds it).

WHY THIS MATTERS: the owner's main complaint about the interface is that it looks "simple", "modern, made by AI". They want it to look like it comes from the world of A Song of Ice and Fire: heart, design, materials. Your job is the visual language every later screen is built from. Quality bar: a player should look at your style tile and think "a lord's solar in Westeros", not "a dark-mode web app with a fantasy font".

READ FIRST: docs/gdd/21-art-direction.md (YOUR SPEC — every section), docs/mockups/README.md and look at the images docs/mockups/png/02-target-hud-1920x1080.png, 03-headline-feed-1920x1080.png, 05-turn-digest-1920x1080.png, 06-realm-ledger-1920x1080.png, 08-first-run-1920x1080.png (they fix the LAYOUT and hierarchy; your job is to make the same things out of the materials of GDD 21 — richer than the mockups, never busier). Also read public/css/style.css :1–40 (tokens), public/js/ui/common.js applyHouseTheme (~:224) and THEMES, public/js/ui/icons.js (the existing stroked icon set — keep its hand), public/js/ui/portrait.js and public/dev/portraits.html (how a portrait is painted), public/fonts/fonts.css.

MOOD (references for the feel, never to copy): the Painted Table at Dragonstone; a maester's desk with vellum, iron-gall ink and wax; illuminated manuscripts (rubric red, gold leaf initials, restrained margins); the leather-and-iron frames and parchment tooltips of Crusader Kings III; the manuscript pages of Pentiment. What makes it NOT look like AI slop: real material cues (fibre, grain, bevel, pressed wax) kept SUBTLE; one warm light source; restraint (one ornament per surface); exact typographic craft (Cinzel small caps tracked for labels only, EB Garamond for reading, old-style figures in prose, tabular lining figures in tables); no glassmorphism, no backdrop-filter, no neon glow, no pill-shaped rounded buttons, no purple/blue gradients, no emoji, no cartoon burnt-paper edges, no drop shadows on everything. The old blue "End turn" button in the mockups is exactly what not to do.

FILES YOU MAY TOUCH (and NO others):
- public/css/theme.css (new) — tokens (GDD 21 §3) and components (§6). It must only ADD classes/tokens (prefix `wc-`) and must not change how any existing screen looks today.
- public/index.html — ONLY to add one `<link rel="stylesheet" href="css/theme.css">` after style.css.
- public/js/ui/common.js — ONLY inside applyHouseTheme, to also set `--house-1` and `--house-2` (the house's two colours) so theme.css can use them; nothing else.
- public/js/ui/icons.js — ADD the new icons of GDD 21 §5 (chain, weirwood, book, seal, tier3, tier2, tier1, pip, dots, inkpot) in the same stroke style/weight; change no existing icon.
- scripts/paint-ui.js (new) — dev-only, deterministic texture generator (Playwright renders SVG filter art to images) → public/img/ui/*. Model it on scripts/mockup-assets.js (read it). Fixed seeds; two runs must give byte-identical files (check with sha256sum and paste).
- public/img/ui/** (new) — the generated textures + ornaments.svg (hand-authored SVG sprite: two corner pieces, a fleuron rule, tier diamonds, a rubric bullet, an illuminated-initial frame). Total ≤ 600 KB.
- public/dev/style.html (new) — the STYLE TILE: every component of GDD 21 §6 on a map-like background, laid out as a composed screen (not a boring grid of swatches): top-left the crest+date+season plate and the three vitals; top-right the Inbox seal, the End-turn plate with its sub-label, the menu; left the headline strip (3 lines) and, beside it, the expanded Chronicle with 4 cards of different tiers (great/major/news/minor/meanwhile); centre an opened event card (vellum) and, separately, the week's digest page with an illuminated initial; bottom-centre the command bar with one order chip and a ✓ receipt; bottom-right the ruler's portrait in the medallion (use the REAL portrait painter from ui/portrait.js for Eddard Stark as dev/portraits.html does — portraits must be framed better, never degraded); a ledger table fragment (3 rows: exact own row, `~` estimate, `—` unknown) with a sparkline; tabs; chips; a tooltip; a coach mark; the welcome card. Use the sample words from the mockups (they follow the headline rules). Query params: `?house=stark|lannister|greyjoy|tyrell` to show the house tint working (the frame accents and wax change with the house).
- public/dev/assets/** (new, optional) — a compressed map background for the style tile only (you may copy and recompress e.g. docs/screens/e5/tokens-l1-1920x1080.jpg to ≤ 200 KB).
- tests/theme.test.js (new) — node:test, no browser: parse theme.css `:root` tokens; for each text/surface pair the file declares in a comment table (e.g. `/* contrast: --ink-iron on --vellum */`), compute the WCAG ratio and assert ≥ 4.5; assert public/img/ui total ≤ 600 KB and every file theme.css references exists; assert no emoji code points in public/dev/style.html and theme.css; assert the new icon names exist in icons.js.
- scripts/screens.js — add ONE scenario `style` that opens /dev/style.html (both sizes; and one `style-lannister` with ?house=lannister). Read how the `tokens` scenario does a dev page.
- docs/screens/u0/** — your final screenshots (jpg, both sizes).
- docs/gdd/21-art-direction.md — you may refine it where your build found a better answer (say so in the report).

DO NOT TOUCH anything else (other agents are working on the engine and tests in other worktrees; the lead owns app.js, style.css, drawer.js, windows.js).

PROCESS (do all of it):
1. Build theme.css tokens + components and ornaments.svg; write paint-ui.js and generate textures; build style.html.
2. Screenshot: `SCREENS_PORT=3497 node scripts/screens.js style style-lannister > /tmp/u0-screens.log 2>&1 &` (record the PID; SwiftShader is slow, 1–3 min per size; wait for it; never pkill -f; never run npm test at the same time). Output lands in visual-out/.
3. READ every image yourself (Read tool). Judge like an art director: does it read as Westeros? Is anything muddy, too dark, low-contrast, over-ornamented, cartoonish, misaligned, cramped at 1366×768? Fix and re-shoot. AT LEAST TWO full rounds of look→fix→re-shoot. Check 1366×768 carefully (smallest text ≥ 13 px equivalent; nothing overlaps).
4. `node --test tests/theme.test.js` green; `npm run check` green; `node scripts/lint-engine.js` clean; `git status --short` shows only your files.
5. Copy the final good images to docs/screens/u0/ as `style-1920x1080.jpg`, `style-1366x768.jpg`, `style-lannister-1920x1080.jpg`, `style-lannister-1366x768.jpg`.

REPORT FORMAT (max 30 lines):
STATUS: done | partial | blocked
FILES CHANGED: <path — why> (from git status)
COMMANDS RUN + RESULT: pasted last lines (theme test, check, lint, paint-ui twice with sha256 equal?, screens)
IMAGES: paths; what changed between your rounds (one line per round)
SIZES: total public/img/ui KB
DESIGN CHOICES the lead should know (≤ 8 lines), and where you departed from GDD 21 (draft DECISIONS text)
WEAKEST PART of the result, honestly (what you would improve with more time)
