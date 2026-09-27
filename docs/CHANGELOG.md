# Changelog

Newest first. One entry per merged work package ([docs/gdd/16-roadmap.md](gdd/16-roadmap.md)): the WP id, what changed
for the player, and what the owner should verify.

## 2026-09-27 — B6: your orders are read when you write them (WP B6)

- **Each order gets its receipt as soon as you write it**, line by line: ✓ what will be done ("Jory Cassel rides for
  Moat Cailin with 50 men"), ⚠ what will be done with a warning ("Only 12,000 could be found of the 20,000 asked for"),
  ✗ what cannot be done and why ("The treasury holds 60,000 dragons, not 60,000,000"). Each receipt is tried after the
  orders above it, so a second order sees the first done. The turn then does exactly what the receipts said.
- **When an order is missing one thing, your steward asks** — "How many men?", "Who should go?", "Raise the taxes, or
  lower them?" — with the answers as chips under the order. One click and the order is complete; the receipt updates.
- **Most orders are read without the model at all**, by rules that know your people by name, byname, title and kinship
  ("my wife", "the maester", "Lord Tully", "Lord Commander Mormont"), your hosts by their banners, every place by any
  name it goes by, and numbers as you dictate them ("two hundred and fifty", "a score of knights"). Only what the rules
  cannot read is put to the model — which may only choose among the actions the engine can do, with the names of this
  world — and its reading is checked before it counts; if it fails, the rules' reading stands.
- Better readings: "Send Jory to meet Lady Catelyn at the Twins" sends Jory, not Catelyn; "Kevan, march on the Twins"
  marches the host Ser Kevan leads; "I will lead the host myself" puts you at its head; "Write to my son Theon at
  Winterfell" writes to Theon, not to Lord Stark; "Offer Lord Frey ten thousand dragons for his crossing" is a proposal
  by raven, not a gift; "Call the Harlaws and the Drumms to Pyke" calls only those; "Pray for my son's safe return" is
  left to the story instead of asking where to send him; "March the host to Riverrun" with no host in the field says so.
- A command you give in an audience to one of your own people ("Jory, ride to the Twins") is read the same way.
- For the owner: `npm run bench -- --suite interpret --reader model` measures your model on 300 labelled orders (and
  `--holdout` on 25 it was never tuned on); `--record tests/fixtures/model/interpret` keeps its answers as replay tests.
- Owner to verify: write "Hire sellswords at Winterfell" — the receipt asks how many, click "200 men" and the line turns
  ✓; write "Send someone to the Wall" and pick a name; write "Spend sixty million dragons on the Iron Throne" — ✗ with
  the reason; end the turn — each order's result is its receipt. With the model running, write something the rules
  cannot read ("Bring three thousand spears to White Harbor") and hover the receipt: "Read by your maester".

## 2026-09-27 — B4: every action is a verb, with a receipt (WP B4)

- **Every action you take has one definition, and tells you what it did.** Marching a host, raising levies, calling
  the banners, sending someone on the road, taxes, dues, works, hiring, gifts, offices, grants, feasts, tourneys,
  judgements, answering a matter, declaring war, spies and letters are all "verbs" now: each checks whether it can be
  done, does it, records what happened, and answers with a receipt — "The Host of Winterfell (4,000 men) marches for
  Moat Cailin — ~487 miles, ~27 days". The toasts you see after a card's button are those receipts.
- **A refusal says why, in the world's words**, and changes nothing: "Jon Snow is at sea, and can turn only when the
  ship makes port", "Fill and expand the granaries at Winterfell is already under way", "You are already at war with
  House Lannister" (declaring the same war twice is now refused rather than silently ignored).
- Written orders go through the same verbs as the buttons, so an order and a click can no longer do different things.
- A host you order to march stays at its castle, its road already drawn, until the turn walks it — as before on the
  cards, and now for written orders too.
- Under the hood, the verbs work for any house, not only yours: the lords' own minds (WP B7) will act through them.
- Owner to verify: raise levies and march them from the Military window — the toast is the receipt, with miles and days;
  try to fund the same works twice — the second is refused with its reason; write "Send Jon Snow to Castle Black" and
  end the turn — the order's result line is the same receipt.

## 2026-09-27 — B3: facts are the history; undo goes back ten turns (WP B3)

- **Undo goes further back.** The ↶ button now asks how far: the last turn, or up to the last ten. The world returns to
  the eve of the turn you pick, with the orders you gave for it still written, so you can change a word and go again
  — and the same orders play out the same way. The world log and the chronicle are cut back with it.
- **Ironman.** Beside "Begin" on the title screen: an ironman chronicle is written once, with no undo (the button is
  hidden, and the server refuses it).
- **Everything that happens is recorded as a fact** — who, where, which day, why, and who may know of it — in the
  save's `facts.jsonl`: every march begun and ended, every host raised or disbanded, every death, capture, battle,
  holding taken, war, pact, letter, feast and tax. The chronicle's news cards are drawn from those facts (the narrator
  and the knowledge rules of the next packages read them too), and each fact is on the day its card says.
- A seasons fix: the white raven announcing a new season was being lost before it reached the chronicle; it now
  arrives on the turn's last day.
- A soak found a rider left stranded on the open sea after being recalled mid-voyage: a traveller aboard ship can now
  only be turned once the ship makes port, and a recall that finds no road leaves the journey as it was.
- Saves stay small: past turns are kept in `turns/` instead of inside `state.json` (the game still shows the last 30).
- Owner to verify: play three turns, press ↶ and choose "The last 3 turns" — you are back on the eve of the first,
  your orders still written; advance again and the same things happen. Start a new game with Ironman ticked: the ↶
  button is gone. `npm run soak -- --turns 40 --houses stark` should end "every invariant held every turn".

## 2026-09-27 — B2: everything that moves is a party, and walks real roads (WP B2)

- **Hosts march along the roads, not in straight lines.** A march is planned once, over the same map you see: by the
  kingsroad where there is one, slower through forest, bog and mountain, around lakes, through the Wall only at Castle
  Black, the Shadow Tower or Eastwatch. The map now draws the road a host will take (dashed) and the ground it covered
  this turn (solid), and the host walks exactly that road day by day. (Route lines were never visible before: a map
  bug that hid every route, trail and road ribbon is fixed.)
- **Riders are on the map too.** Someone you send alone (Jon to the Wall, Luwin to Oldtown) travels as a rider party
  with a real route; your own riders' roads are drawn. Where the sea is in the way — or a ship is much quicker — they
  ride to a port and take ship (Luwin sails from Seagard); a raven finds them where they are on the road.
- **People stay with their party.** Robb stays with his host when it reaches Moat Cailin, and marches on with it; the
  King's court rides in the King's progress and is at Winterfell when the progress is. What a host is doing ("marching
  for Moat Cailin, ~18 days", "awaiting ships at White Harbor", "besieging Riverrun") is the engine's word, never the
  story's.
- **One thing at a time.** Everyone is ruling, commanding, answering the banners, travelling, visiting or a prisoner —
  and a lord called to your banners does not ride off to a feast; a lord leading a host is not sent visiting by the story.
- The world is checked after every turn (everyone in one place, doing one thing; no host standing on the sea; a host's
  banners adding up to its men; letters landing after they are sent). A 480-turn soak held every check every turn.
- Older saves load: armies become parties, riders on the road become rider parties, and anything the old straight-line
  marches left on the water is put back ashore.
- Owner to verify: load an existing save; call the banners and march your host — its dashed route follows the
  kingsroad, and it arrives when the route says; send someone to Castle Black and watch the 🐎 rider on its road; hover a
  host for what it is doing. `npm run soak -- --turns 40 --houses stark` should end "every invariant held every turn".

## 2026-09-27 — B5: every model call constrained, checked and never fatal (WP B5)

- **Settings → Test connection** now tells you what matters about your model server: whether it enforces a JSON schema
  (llama.cpp does), and whether "the Wall" is understood as Castle Black — the pitfall that sent Jon to the Twins in
  the bench of 2026-09-27. It also warns when calls are routed to different models (each switch is a model swap).
- Under the hood, `server/ai/` is the new way every model call will be made: a schema from the live world (every name
  people use is allowed, no name can be mistaken for another), a check of the reply, one retry that says what was wrong,
  and a fallback — never an error in the middle of a turn. Mock and recorded-reply providers let all of it be tested
  without a model. The calls themselves (orders, minds, the narrator, audiences) move onto it in the next packages.
- Stray Chinese characters from Qwen ("Lord Um伯") no longer reach the chronicle, audiences or the council.
- Owner to verify: Settings → Test connection against llama-swap: expect "JSON schema enforced: yes" and "The Wall
  understood as Castle Black: yes"; paste the result if not.

## 2026-09-27 — B1: the engine's own dice (WP B1)

- **Every game has its own dice.** Everything the engine decides by chance — who answers the banners, a road's outlaws,
  a battle's turn — is rolled from a seeded stream kept in the save, never from the computer's clock. The same save and
  the same orders always give the same turn: the foundation for *Stop here*, undo and replays in later work, and for
  bug reports the owner can send back as a save.
- Names people use are tables now (`public/data/aliases.js`, `engine/ids.js`): "Ned", "the Greatjon", "the Wall", "the
  Freys", "the King" (whoever holds the throne) — the order parser and the constrained model calls of the next work
  packages read them. Tunable numbers begin to gather in `public/data/balance.js` (difficulty, speeds, the sea, musters).
- `npm run check` now also fails if engine code rolls dice with `Math.random` or reads the clock.
- Owner to verify: nothing to see in play — an old save still loads and plays; a new game plays as before.

## 2026-09-27 — Phase A finished: islands need ships, people are data, canon in the books' order (WPs A8, A10, A11)

- **A8 — The sea is no road.** An island lord's men no longer walk over the water: they take ship. House Mormont ferries
  its 900 men across from Bear Island in its own boats and lands near Deepwood Motte; House Crowl of Skagos, with no
  ships, waits while Lord Manderly's galleys come round from White Harbor, then lands near Last Hearth — and nobody from
  Skagos pays "the price of the Wall" any more. The map draws a host at sea as its ships, on the sea lane the engine
  planned. Any host sent to another island or shore does the same (own ships, a few boats making trips, the realm's
  ships sent to fetch it, or it waits on the shore and says why). Island lords have small fleets of their own now.
- **A10 — People are data.** Every character has a sex (Old Nan, Chataya and Daenerys's handmaids are no longer "he"),
  and every line the engine writes uses it. All 120 characters with a written history have their nature written down
  as numbers (and what sways them); everyone else is played by an archetype of their role and country and their written
  traits. Eddard Stark reads "brave, honest, stubborn, dutiful"; nothing is guessed from prose any more.
- **A11 — Canon in order.** The books' great events come in the books' order and in the windows of the GDD: the Red
  Wedding (late 299) before the Purple Wedding (300); the dragons hatch early in 299; the dead rise at Castle Black in
  early 299 whatever the "cold" meter says.
- Dev: `node scripts/screens.js` takes the PR screenshots at 1920×1080 and 1366×768; `/?game=<id>` opens a save.
- Owner to verify: `npm start` → a Stark game → *Call the banners* (all) → end a few turns: House Mormont's ships cross
  from Bear Island, House Crowl waits for White Harbor's ships; the chronicle says so, and no one crosses the Wall.

## 2026-09-27 — Phase A: the worst bugs, fixed in the current build

- **Windows:** the server no longer crashes on start on native Windows (`fileURLToPath` everywhere); all 103 tests pass
  on Windows; GitHub Actions CI on Windows and Linux.
- **Musters become one host:** the banners join the host they were called to, wherever it has marched; no more
  "Banners of Stark" left sitting at Winterfell (`tests/muster.test.js`).
- **The King's progress** walks the kingsroad and the King arrives at Winterfell when the progress does (no teleport);
  the story can no longer redirect it.
- **The story tells what happened:** the Bard is given the engine's receipts instead of the Hand's plans; story events
  that claim an arrival the engine never recorded, or retell the engine's own news, are dropped; a week's "answers the
  call" cards fold into one. Default council is now the Hand and the Bard (two calls a turn, faster).
- **Guards:** the story can no longer change the player's hosts or empty a lord's levies at a stroke; lords summoned to
  the banners or at war no longer ride off to feasts.
- **No spoilers:** the "next turn" line no longer names coming story events.
- **People:** she/her in the engine's text for women; explicit natures for 58 principal characters (Eddard Stark is
  "brave, honest, stubborn", not "cunning, cold-blooded").
- **Roads:** crannogmen pass the Neck free; the King's progress pays no tolls; northern lords no longer pay "the price
  of the Wall".
- Owner to verify: `npm start` on Windows; a Stark game — call the banners, march the host early, watch the lords follow.
  Note: if your `config.json` has `"swarm": "full"`, switch *Settings → Who writes the turn* to the lean council.

## 2026-09-27 — The Game Design Document

- Added `docs/gdd/` (00–16 + assets): the audit of the current build with a live playtest on the owner's PC, the Truth
  Pipeline architecture, the AI system with constrained decoding, economy, military, characters, living world, canon
  beats 298–300 AC, map, interface, content, audio, QA and the work-package roadmap.
- Marked `docs/ROADMAP.md`, `docs/REVIEW.md`, `docs/PAX-HISTORIA.md`, `docs/DESIGN.md` as superseded.
