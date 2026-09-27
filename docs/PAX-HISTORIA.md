# Pax Historia — the symbiotic swarm

> **Superseded (2026-09-27):** the Game Design Document in [`docs/gdd/`](gdd/README.md) replaces this document wherever they disagree. Kept for history.


_What was asked for, what now exists, what was done differently and why, and what comes next._

The premise of this pass: the model should not merely narrate a simulation, it should **design
mechanics for it at runtime**. The engine keeps the hard physics — gold, men, distance, time,
geography — and the model, split into a swarm of specialists, acts as a game designer working
inside those rules, inventing new economies and threads that the engine then settles every moon,
in the save, for the rest of the game.

Everything below is implemented and tested (`npm test`, 100 tests) unless it appears under
**Not built yet**.

---

## 1. The Weaver — `inject_rule`, mechanics written at runtime

**Files:** `public/js/shared/rules.js`, the `inject_rule` case in `public/js/shared/world.js`,
the evaluation in `settle()` in `public/js/shared/economy.js`, `customsSection()` in
`public/js/ui/windows.js`, `CHANGE_SCHEMA` in `server/prompts.js`.

The model can now write a new quantity into the world and give it economics:

```json
{"op":"inject_rule","house":"stark","name":"Informants in the Riverlands","kind":"income",
 "vars":{"informants":4},
 "grow":"min(60, v.informants + 6 * months * (house.treasury > 2000))",
 "formula":"v.informants * 14 * luck * months",
 "when":"house.treasury > 500",
 "note":"Paid out of stolen Lannister coin."}
```

From the next turn the steward's ledger carries its own line, the network grows while it is
funded, the number lives in the save, and the Economy window shows it under **Customs of your
realm** — formula and all.

### Why it is not `eval`

The brief specified `eval`/`new Function` on the model's output. That is remote code execution in
the player's Node process, driven by hallucinated text — and worse for this project, it is
unserialisable: a function cannot go in a save file, cannot be migrated, cannot be shown to the
player, and cannot be refused for being nonsense. So the same capability is delivered by a
**sandboxed expression language**: tokenizer → Pratt parser → AST → step-budgeted interpreter,
about 360 lines, no dependencies.

* **Grammar:** arithmetic, comparison, `&&`/`||`/`??`, ternary, and calls from a fixed whitelist —
  `min max abs round floor ceil sqrt log sign clamp lerp soft if_`.
* **Readable scope:** `months days luck turn year`; `season.{summer,autumn,winter,spring,harshness}`;
  `house.{treasury,debt,income,food,levies,men_at_arms,guard,ships,gross,holdings,vassals,at_war,
  wars,prosperity,unrest,population,soldiers,is_paramount}`; `v.<the rule's own variables>`.
  There is no property access outside a path resolved against that scope, no assignment, no loops,
  no function definitions, no globals.
* **Refused at injection time,** with a message the model can read and correct — unknown names,
  bad syntax, anything over 400 characters, anything that does not produce a finite number on a dry
  run. A bad rule never reaches a save.
* **Bounded at evaluation time:** 2,000 interpreter steps; `/0` and `%0` yield 0; `**` with an
  exponent over 64 yields 0; per-moon caps by kind (income/expense to a fraction of the house's
  gross, food 1.5 moons, unrest 8, prosperity 6, levies 12%), and a capped rule tells the player
  in the steward's notes what it *wanted* to bring.
* **Fails safe:** a rule that starts throwing because the world moved under it is retired with a
  note, not allowed to break the turn. Max 12 live customs per house.

Kinds: `income`, `expense`, `food`, `unrest`, `prosperity`, `levies`, `var`.

## 2. The swarm — five agents instead of one prompt

**Files:** `server/agents.js`, `runSwarm()` in `server/game.js`, the `agent`/`brief` options of
`buildJumpPrompt()` in `server/prompts.js`.

| Agent | Charge | Emits |
|---|---|---|
| **Maester** | What is true and what is impossible this period. Moves nothing. | nothing |
| **Hand** | Plays every house but the player's, coldly and in its own interest. No prose at all. | marches, wars, pacts, obligations, holdings, decisions… |
| **Weaver** | Gives the story's inventions real numbers. At most two new customs a period; "nothing this turn" is a good answer. | `inject_rule` |
| **Whisperer** | Secrets, letters, feints, and how crooked the news is when it reaches the player. | ravens, reports, secrets, relations |
| **Bard** | Told only what happened; writes it as GRRM writes. Third person limited, senses before summary, no number of dragons, no morale, no game words. | nothing but prose |

Two design points that matter:

* **The prompt prefix is identical for all five.** Only the last block of the user message
  differs, so a local model server reuses its KV cache and each extra voice costs its own decoding
  rather than a re-read of the realm.
* **What one agent hands the next is plain English, never change operations.** The Bard is given
  the engine's own receipts ("Lord Bolton's host reaches the Twins"), not ops — if it sees the
  machinery, it writes the machinery.

Each agent's output is filtered to the ops it is allowed to emit and applied immediately, so the
next agent reasons about a true world. An unreadable agent is skipped and the turn goes on.

Settings → **Who writes the turn**: the council of five, the Hand and the bard (faster), or one
voice (the old monolithic prompt). The waiting screen now names who is speaking.

## 3. The living map

**Files:** `public/js/map3d/life.js`, wired into `MapScene.setState()` and the render loop;
`roadCongestion()` in `public/js/shared/chokepoints.js`.

Marches were already interpolated along smoothed A\* paths — hosts do not teleport. What was
missing was everything else that moves. The map now carries an instanced layer, read from the
state once a turn and walked every frame:

* **refugees** leaving holdings that are besieged, sacked or seething, for the nearest calm place;
* **carts** between prosperous neighbours, which stop when their houses go to war;
* **outriders** sweeping ahead of any host above 2,500 men;
* **deserters** leaking out of hosts whose morale or supply has broken;
* **ravens** flying the letters that were actually sent.

Pathfinding is budgeted per sync (48 A\* calls; the rest take the straight road), so a realm in
chaos cannot cost a frame. Settings → **A living map**, on by default except on Fast graphics.

And the columns are not scenery: a host marching through a countryside on the move is slowed by up
to **30%**, computed from the same besieged/sacked/restive holdings that put the refugees on the
road in the first place.

## 4. The lore matrix

### Geography that bites — `public/js/shared/chokepoints.js`

Six hard places, each a polyline barrier with a gate that commands it: **the Neck** (Moat Cailin),
**the crossing of the Green Fork** (the Twins), **the Bloody Gate and the Mountains of the Moon**,
**the Golden Tooth**, **the Prince's Pass and the Boneway**, **the Wall**. A host whose road
crosses one pays in days, in men and in morale unless it has leave — its own castle, its liege's,
a friend's (relation ≥ 20 or a standing pact), or crannogman guides through the bogs. The gate is
shut to anyone at war with its holder or merely disliked by them. The Freys charge for their
bridge and the gold changes hands. Winter multiplies every price by 1.6.

Verified against the map: Winterfell→Riverrun crosses the Neck and the Green Fork; King's
Landing→the Eyrie crosses the Bloody Gate; Casterly Rock→Riverrun crosses the Golden Tooth; King's
Landing→Sunspear crosses the Boneway; the riverlands and the North are open country.

The war room states the price before a lord marches, and the Maester agent is handed the matrix as
engine truth, so the model quotes geography instead of inventing it.

### The Citadel's shelves — `server/lore.js`

The brief asked for a vector DB of A Wiki of Ice and Fire (sqlite-vss / Chroma). This project has
zero npm dependencies and must run offline, so instead: a dependency-free **BM25 index** over the
479 passages the game already carries — personas and their histories, houses and their words,
character biographies and secrets, scenario background — plus a **drop-in corpus**: any `.md` or
`.txt` placed in `lore/` (git-ignored) is indexed and quoted. A player who wants the whole wiki
exports it there.

BM25 is instant, needs no model, and never returns something plausible and wrong — which is the
failure mode that matters when the whole point is to stop the model inventing lore.

### The toll a war takes on a mind — `public/js/shared/psyche.js`

Every named person carries hidden **stress** and **paranoia**, fed by captivity, war (worse for
those who command, worse again on two fronts), campaigning, a host coming apart beneath them, a
seat under siege, empty granaries, restive smallfolk, debts that cannot be paid, a buried child or
spouse, and the weight of a seat — and eased by home, family, quiet and faith. A person's nature
decides how much of it reaches them (`resilience()`), and children feel everything twice.

Neither number is ever shown. They surface as **behaviour**: a lord who has not slept, who is
short with the servants, who reads treason into a courtesy, who trusts his liege a little less
each moon, who is found grey-faced on the floor of the solar at dawn. The prompt is given the
behaviour, never the figure — and a test enforces that no stress score can leak into a prompt.

---

## Not built yet — the four months

These are the parts of the brief that remain. In order, because each leans on the one before.

### Month 1 — the sandbox grows teeth
* **Rule kinds beyond the ledger:** `battle` (a modifier a custom applies to an engagement),
  `travel` (a custom that changes march pace), `event` (a custom that fires an event when its
  condition first holds). The DSL and the caps already generalise; the hooks do not exist.
* **Rules that belong to a holding or a character,** not only a house — `holding` is already on
  the rule shape and is stored, but nothing reads it.
* **A Weaver review pass:** each turn, retire customs whose story has plainly ended, so a long
  game does not silt up with twelve dead mechanics per house.
* **A rule inspector for the player** — the Economy window shows the customs; it should let a
  player argue with one through an audience with their steward.

### Month 2 — logistics, properly
* **A caloric engine:** a host consumes food by men, horses and season; a baggage train has a
  capacity and a speed; foraging strips the land it crosses, and a countryside stripped twice
  starves. This subsumes the current flat `supply` number.
* **Dynamic terrain degradation:** roads churn to mud under repeated marches and under rain, and
  recover over seasons; the living map's carts and columns should slow where that has happened.
* **Winter as a campaign-ender,** with the Wall and the North modelled separately from the south.

### Month 3 — the Iron Bank, and money with a will
* **An Iron Bank agent** with its own ledger and its own memory of who pays: interest that rises
  with risk, calls on debt at the worst moment, and — the canonical move — funding your rival when
  you default.
* **Rule-aware lending:** a house whose customs are visibly productive borrows cheaply; a house
  whose customs are a smuggling ring does not.
* **Merchant houses and trade routes as first-class objects,** so an embargo has a map.

### Month 4 — HBO polish
* **Diegetic presentation:** no modal pop-ups. A raven lands and you unroll the letter; a sealed
  scroll for a decision; the maester's voice for counsel; the steward's ledger as a physical book.
* **Web Audio:** a score that follows the state — tension from the war room, a house's theme when
  its banner takes the field, silence when it should be silent.
* **The exportable chronicle:** a three-minute video of a reign — the map replaying the campaign,
  the chronicle's own lines as titles, the events pinned where they happened.

---

## Honest notes

* **Nothing in this pass has been verified in a browser.** This sandbox has no Chromium and cannot
  download one; Playwright's install fails on both fonts and network. The engine work is covered by
  100 tests and by running the real server against the mock provider; the map and UI work
  (`life.js`, the Economy window's customs section, the settings toggles, the swarm's progress
  labels) is **code-reviewed but unverified on screen**. It should be looked at before anyone calls
  it done.
* **The swarm has only been exercised against the mock provider.** The mock answers in each agent's
  shape, so the pipeline, the op filters, the briefs and the fallbacks are all exercised — but how
  a 7B model at home actually answers five charges, and how long five calls take on one GPU, is
  unknown. The `lean` and `off` settings exist for exactly that reason.
* **`inject_rule` is a powerful thing to hand a small model.** The caps and the whitelist are the
  defence, and they are tested — including that `process.exit(1)`, `(function(){})()` and
  `house.treasury = 0` are all refused. If a model still finds a way to make the ledger silly, the
  cap constants in `RULE_CAPS` are the dial.
