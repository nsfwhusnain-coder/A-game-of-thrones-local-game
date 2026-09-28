# Changelog

Newest first. One entry per merged work package ([docs/gdd/16-roadmap.md](gdd/16-roadmap.md)): the WP id, what changed
for the player, and what the owner should verify.

## 2026-09-28 — E3: painted trees, a palette by region, and the snow line of the season

- **The forests are painted trees now**, not low-poly cones: pines, broadleaves and here and there a white weirwood with
  red leaves, standing up to the camera and swaying in the wind. From far off a forest is a soft mass of darker canopy,
  and the trees grow out of it as you come down.
- **The land takes its regions' colours**: ochre western hills, blue-grey Vale peaks, slate Iron Islands, the Reach
  golden-green, the Stormlands' dark woods, with a faint paper grain at a distance.
- **The snow follows the season**: in summer only beyond the Wall; through an autumn it creeps south from the Wall toward
  the Neck; in winter the whole North is white down to the Twins, the broadleaves stand bare, the pines carry snow and,
  in deep winter, the northern rivers freeze. Spring draws it back.
- Owner to verify: zoom in on the Wolfswood; then `/dev/map-lod.html?spot=realm&season=winter&days=200` and
  `…&season=autumn&days=400`.

## 2026-09-28 — E2: map modes — Diplomacy that looks like diplomacy, Knowledge and War

- **Diplomacy** now reads at a glance: your enemies in deep red, the hostile in orange, the neutral grey, friends blue,
  allies gold, and your own realm hatched in gold (B-29: it used to look like the Realms map).
- **Knowledge** (new): bright where your eyes are, fading where your reports are old, black fog where you know nothing.
- **War** (new): castles besieged in red, held by an enemy in orange, the land laid waste in brown.
- **A key** under the map explains each mode.
- Owner to verify: declare a war and flip between Realms, Diplomacy, Knowledge and War at full zoom-out.

## 2026-09-28 — E1: the camera — framed on Westeros, never into the trees

- **Zoomed all the way out, you see Westeros and the Narrow Sea**, not half a screen of empty ocean (B-29), and the map
  keeps the realm on screen as you pan.
- **Zoomed all the way in, you stop at a castle and its lands** — no longer inside giant trees.
- **The wheel zooms smoothly toward the cursor**; the view tilts gently as you come down; flights to a place ease in and
  out and never fight your drag.
- **Keys**: Home flies to your seat (press again for the whole realm); F follows the selected host; WASD and the arrows
  pan; + and − zoom.
- Owner to verify: zoom all the way out and in; press Home twice; select a host and press F.

## 2026-09-28 — D8: the living society — lords on the road, guests at the seats (Phase D done)

- **Lords ride out every moon, for the reasons the books give**: to their liege's court, a neighbour's feast or wedding,
  the market, a sept — and now to **tourneys** (a tourney draws its whole region for a moon), on **pilgrimage** to Oldtown
  or the Great Sept, and **to greet the King** when his progress halts nearby. The warm feast, the ambitious go to court,
  the pious pray; autumn is the season of harvest feasts; no one travels far in a northern winter.
- **They bring their families**, stay as **guests** (a holding's card lists its guests), and come home again.
- **The calendar**: the Maiden's Day, the Father's feast at the Starry Sept, the harvest fires, the old gods' night, the
  Stranger's eve, and the small council sitting each moon, in the chronicle's Meanwhile.
- Owner to verify: play a few moons, open a seat with a feast or a tourney, and see the guests.

## 2026-09-28 — D7: the style bible — the chronicler's voice, and a choice of how much cruelty it tells

- **Book content or Restrained**: a new choice on the begin screen. Book tells the violence of the books without relish;
  Restrained summarises it. Nothing sexual is ever described, and never anything involving the young.
- **The chronicler learns from another house's example**, never your own, and every voice in the game — the chronicle,
  audiences, letters, the council — is held to the same forbidden words ("tapestry", "winds of change", "morale"…).
- **More of the later story stays unsaid until it happens**: no one speaks of the sack of Winterfell, Queen Jeyne, the
  Breaker of Chains or the red comet before your game reaches them.
- Owner to verify: start a game on Restrained and read a battle in the chronicle (with a model connected).

## 2026-09-28 — D6: goals — what the realm's lords want, and how their houses go about it

- **A hundred goals for the realm's people**: Tywin wants the crown in his grandson's hand and every insult answered;
  Walder Frey wants respect and the toll; Doran wants justice for Elia, in time; Randyll Tarly wants the war he is
  given, won. Everyone else who speaks for a house wants what their rank and their nature want.
- **The lords work at what they want**: when nothing presses, a lord takes the next step of his aim — Hightower builds,
  Redwyne launches ships, Walder raises the toll — and the story's great movers are weighed a little higher.
- **Twenty-three more houses have ways of their own**: the Karstarks never last to a muster, the Umbers roaring after
  wildlings, Blackwood and Bracken eyeing each other across the river, Tarly's discipline, Redwyne's fleet closing enemy
  ports, the Dothraki who must ride.
- Owner to verify: play a few moons as any house and read the chronicle — the realm's lords act in character.

## 2026-09-28 — D5: house openings — every house has its situation, levers and news

- **Twelve more houses written by hand**: Manderly, Mormont, Karstark, Umber, Blackwood, Bracken, Tarly, Redwyne,
  Hightower, Florent, Velaryon and Dayne join the fifteen great houses. Every other house now has an opening from its
  own region and rank — a Northern house reads like the North, a Free City like a Free City — instead of one shared text.
- **Levers**: the begin screen and "Your situation" name what your house can pull on (White Harbor's ships and silver,
  the Blackwood–Bracken feud, Dawn).
- **Your council has heard things**: in the first moons your counsellors know the news of the day (the King's party on
  the kingsroad, a ranging overdue) — never what is to come.
- Owner to verify: on the begin screen, pick Manderly, then Glover; hold a council in the first moon and hear the news.

## 2026-09-28 — D4: life — wounds heal, winter kills the old, and the story keeps its own

- **Wounds heal** in one to three moons — or fester. Before, a wounded lord limped for the rest of the game.
- **Fevers, winter chills and great age** take people week by week, the old and the sick most, and far more in winter.
- **Under Canon, chance does not take the story's people** before their time: King Robert does not die of a fever
  before his boar, Robb Stark's wound does not fester before the Twins, and the Stark children live through 300. The
  player's own orders still kill whom they kill. Under Loose only the great deaths are kept; under Sandbox, none.
- **Regents**: Lysa rules for her son, Cersei for hers; the Darkstar never holds Starfall for his young cousin.
- Owner to verify: `node scripts/soak.js --turns 40` reports no broken invariant (number 11 is the story's people).

## 2026-09-28 — D3: the matters catalogue — sixty-two kinds of business before the lord

- **Far more comes before you.** Besides the old handful of petitions, the realm, other lords and your own household
  now bring their business: a poacher in your wood, a deserter from the Wall, a bastard with a letter, a toll on a
  bridge, a knight's inheritance; alliances, marriages and trade proposed; demands for your submission, a captive's
  release, a debt or a hostage; summons to court, feasts, weddings, tourneys; a ransom for your own people; an enemy's
  vassal who would change sides; your steward's famine warning, your maester's winter warning, a poisoner in the
  kitchens, an heir who wants to fight, a daughter who refuses her match.
- **Each is raised only when the world has a place for it** (no ransom without a captive, no submission without a war),
  and never the same kind twice in six turns.
- **No invented matters.** Every matter now comes from the catalogue; the model cannot put a made-up decision before you
  (the old "Death of the Lion" kind).
- Owner to verify: play a few moons as Tully and see the variety of matters; each answer's hint says what it costs.

## 2026-09-28 — D2: the full canon — sixty beats of the books, 298–300 AC

- **The story of the books now runs from the King's progress to the white ravens of winter**: the wolf and the lion on
  the Trident, Littlefinger's word about the dagger, the Kingslayer's swords in the street, the trial by combat in the
  Eyrie, Lord Beric's ride, the lions in the Riverlands, King Joffrey crowned, the Green Fork and the Camps, the Young
  Wolf in the west and his wedding, the Fords, the Kingslayer freed, Karstark's justice, Hoster Tully's funeral, the red
  comet, Winterfell taken and burned, the Rose and the Lion, Balon's fall, the Viper and the Mountain, Lord Tywin's death,
  the Great Ranging, the Fist, Craster's Keep, the battle beneath the Wall, Lord Commander Snow, the wine-seller, the
  maegi, and the rumours of dragons in Qarth and Slaver's Bay.
- **The chain holds.** Watching from Oldtown for two years, the whole canon now comes to pass in order: the King's death
  waits for his Hand to reach King's Landing, old Lord Walder lives to see his wedding, the War of the Five Kings is not
  settled in its second moon, and the Imp is not ransomed before his trial.
- **Under Canon, the seasons are the Citadel's**: autumn is declared in 299 and winter comes in 300.
- Owner to verify: `node scripts/canon.js` (three houses, 24 moons each, about three minutes each) prints how many beats
  fired and passes at 90 %; start a game as Hightower on Canon and jump a year — the ravens should bring the books' news.

## 2026-09-28 — D1: the beat engine — canon gravity, alternates and lapses

- **Choose how hard the story pulls.** The begin screen has a new choice beside Ironman: *Canon* (the books' great events
  happen on their course unless you change the world), *Loose* (only the pillars — the King's death, the war's outbreak,
  Robb's banners, the dragons, the ironborn) or *Sandbox* (none).
- **When you change the world, the story bends rather than breaks.** If the King never reaches Winterfell, Lord Tywin
  takes the Hand's chain; if Robert dies with Lord Eddard far from King's Landing, the Queen crowns Joffrey quietly
  instead of the coup in the throne room.
- **The realm's lords no longer send away the people the story needs next** (the Queen on an errand while the King rides
  north). You are never held back.
- Owner to verify: start a game as Stark on *Loose* and play a few moons — the King's visit does not come, the King's
  death still does; start another on *Canon* and see the progress arrive.

## 2026-09-28 — C8: the state of war — goals, the score and the peace (Phase C done)

- **Every war has a goal and a score.** The Diplomacy window shows each war's goal ("fought to free a prisoner") and
  how it goes for you — battles won, castles taken, lords captured and slain move it.
- **Sue for peace.** "Offer House Lannister a white peace", "…peace: we will concede and pay", or "…peace: they must
  concede and pay" (the Sue for peace button writes it for you). The other side's lord weighs the terms by how the war
  goes for him and his own pride. A concession pays up to three moons of the loser's income and sets its captives free.
- **The beaten sue for peace.** When a war is lopsided, the losing side offers to concede — to you as a matter to accept
  or refuse, or to the victor among the realm's lords. A war with no blow struck for six moons goes cold.
- Owner to verify: as Stark, declare war on the Lannisters "to free Lord Eddard"; open Diplomacy and see the war's goal;
  win a battle or two and see the score move; press Sue for peace.

## 2026-09-28 — C7: sellswords, outlaws, the Watch and the Dothraki

- **Free companies.** The Military window lists them: the Golden Company (ten thousand swords, 25,000 a moon) and the
  Brave Companions. Hire one — a moon paid on signing, each moon after — and it marches for your seat (by hired ships from
  Essos). Miss a moon's pay and it is gone. The Brave Companions go over to anyone who offers half as much again; the
  Golden Company keeps its word.
- **Outlaws.** Where war and foraging have laid the land waste, broken men hold the roads: riders are robbed and taken,
  the smallfolk grow poorer and angrier — until the lord's host rides through and scatters them.
- **The Watch** takes a couple of dozen recruits a moon and no part in the realm's wars. **The Dothraki** will not cross
  the poison water.
- Owner to verify: as Lannister, open Military and hire the Golden Company; follow it across the Narrow Sea; then empty
  your coffers and watch it march away.

## 2026-09-28 — C6: the sea — fleets that carry, blockade and reave

- **Fleets carry hosts.** "Put the host aboard the fleet and sail for Storm's End": the host goes aboard in port, sails
  with the fleet (the fleet's card shows its galleys, cogs or longships, who is aboard and the room left), and comes
  ashore in a day at a port or two on a beach.
- **The ironborn reave.** "Raid the Stony Shore": the longships fall on a village every other day for a fortnight,
  burning and taking the harvest, then sail home with the plunder. At war, the Greyjoys do it on their own.
- **Blockades.** A fleet before an enemy port halves its trade — and a besieged port with no food coming by sea starves
  (Storm's End at last).
- **Sea fights and storms.** Fleets at war that meet fight by their ships, crews and admirals; boarders take prizes.
  Autumn and winter gales take ships at sea.
- Owner to verify: as Stannis, raise your levies at Dragonstone, press *Go aboard* on the host's card, send the fleet to
  Storm's End, and when it arrives press *Put them ashore*. As Greyjoy, declare war on the Starks and write "Raid the
  Stony Shore".

## 2026-09-28 — C5: sieges — terms, storms, treachery and relief

- **The great castles are what the books say.** Storm's End, Pyke and Dragonstone cannot be starved without ships before
  them; the Eyrie is fed down the high road until winter; Winterfell's hot springs stretch its winter stores; Casterly
  Rock, the Eyrie and Storm's End cannot be stormed at all; Harrenhal is too great to hold with a few hundred men;
  Moat Cailin cannot be taken from the south up the causeway; before Riverrun the besiegers lie in divided camps, and a
  relieving host catches them at a disadvantage.
- **Offer terms** from the castle's card (march out with arms, swear and keep the castle, give hostages, or yield
  without terms): a craven castellan takes them early, a proud one late or never — and hunger changes minds.
- **Storm the walls** — dear, and it fails often; the castle's card says whether it can be done.
- **Treachery.** Bribe a castellan, and when your host sits before his walls a postern opens in the night.
- **Relief.** When a host comes to lift the siege, the besiegers hear of it: the realm's lords storm before it comes,
  stand and fight, or break camp.
- Owner to verify: as Lannister, declare war on the Tullys and march on Wayfarer's Rest; when the siege begins, open the
  castle's card and offer terms; then try the same before Riverrun and read what the card says of a storm.

## 2026-09-28 — C4: battles by stance, ground and surprise

- **Standing orders.** Each of your hosts has them on its card: *Engage if the odds favour us* (the default), *Always
  engage*, *Avoid battle*, *Hold ground* — or write "The host is to avoid battle".
- **Lords choose whether to fight.** A bold lord gives battle at even odds, a cautious one only with the odds well in
  hand; outmatched, a host falls back toward a friendly castle — and a slow one may be caught on the march. Two hosts
  that will neither of them begin it stand and watch each other.
- **Arms and ground.** Knights are worth four levies in the open and half that among the trees; bowmen on a hill are
  worth more; clansmen in their mountains most of all. A hungry host fights at seven-tenths.
- **Surprise.** "Attack Lord Jaime's host by surprise" — if they have no eyes on you, you fall on them unawares; in a
  wood, a host that does not see you coming is surprised anyway.
- **What follows.** A victory, a rout or a bloody draw; the pursuit; the loser's baggage taken; lords slain, taken
  captive (they ride with the victor's host) or wounded — though the story keeps its people for their own ends (Robert
  does not die in a skirmish before his boar). The battle's record says what decided it.
- Owner to verify: as Lannister, declare war on the Tullys, raise 15,000 at the Rock, set the host to *Always engage*
  and march on Riverrun; when the battle comes, open its record in the chronicle and read what decided it.

## 2026-09-28 — C3: supply — bread, forage and the stripped land

- **A host carries its bread.** Seven days on the men's backs and a wagon to every forty men: a host sets out with about
  three weeks' rations. The host card and your hosts in the Military window count them in days; the Food figure's
  tooltip lists each host's.
- **Fed at home, foraging abroad.** In your own lands, or a friend's, the granaries feed the host and fill its wagons
  (and the stores fall). In a stranger's country it eats from its wagons, and when they run low it forages — and the
  land is laid waste: its rents fall, its smallfolk grow angry, and a province stripped bare feeds nobody. **March back
  through it and the host starves**: men die and desert, and heart goes.
- **Camps sicken.** A host that sits in one place more than a week, or before a castle's walls, loses men to the flux —
  more in winter, more when hungry.
- **Seasons slow the march**: autumn's rains a little, winter a great deal, and the North's winter most of all.
- **Lords bring hungry hosts home.** A lord whose host is starving marches it back to his own granaries.
- Owner to verify: as Lannister, raise 12,000 men at Casterly Rock and march them to Riverrun; after five or six weeks,
  open the host: its rations fall by a day a day, then it forages and "the lands about Riverrun are picked over".

## 2026-09-28 — C1b: lenders, loans and the price of grain (WP C1, second part)

- **Borrow, repay, and be called to account.** Write "Borrow 50,000 dragons from the Iron Bank for two years": the
  receipt says at what rate and when it is due. The Iron Bank, the Faith, the Tyroshi cartels and the Bank of Oldtown
  lend as much as they think you good for, dearer if you are deep in debt or at war. A loan past its day is called; a
  debt not repaid is a default the whole realm hears of — and the Iron Bank lends no more to your realm.
- **The Lannisters can call in the Crown's debt.** Three million, within three moons, or the Crown defaults.
- **Buy grain** at the season's price (dear in winter, dearer in the North and in war), **bribe** a lord's steward or a
  lord himself (he may take it, or take offence), **embargo** a house (and lift it), and **pay the ransom** of one of
  your people held captive.
- Owner to verify: as Stark, order "Borrow 50,000 dragons from the Iron Bank" and "Buy two moons of grain", and read the
  receipts; the Treasury's accounts show the interest the next moon.

## 2026-09-28 — C1a: gold means something (WP C1, first part)

- **The realm is as populous as the books.** The North holds two million souls, the Reach seven and a half; each
  holding carries the people of its lands, and the great cities their own.
- **Incomes as the books would have them.** Winterfell takes about 12,000 dragons a moon, Casterly Rock 34,000,
  Highgarden 48,000, the Crown 95,000 — rents by your taxes, markets and ports, the mines, and your sworn lords'
  tribute. The Lannisters start with half a million in coin, but the Crown owes them three million; the Rock's gold
  mines are quietly running dry. The Crown spends more than it takes (Robert's court and pleasures, the interest on six
  million of debt) and borrows to pay its way.
- **War costs what war costs.** A levy in the field costs a quarter of a dragon a moon in food and coin, a sellsword
  two; the fields the levies left untilled yield less while they are away. Stark begins with 120,000 dragons — about
  sixteen moons of a full muster.
- An older save keeps its coin; its people and incomes are brought up to the new count.
- Owner to verify: `npm run balance` prints each great house's income against the books' and passes; start a Stark
  game and read the Economy window's accounts after a moon.

## 2026-09-28 — C2: the banners come as the realm's lords would bring them (WP C2 — Milestone 1)

- **Calling the banners takes the time it takes.** The raven reaches each lord, he weighs it for a day or three — by his
  loyalty and his grievances, the harvest, whether his own lands are threatened — and answers, delays with an excuse, or
  refuses. Those who answer gather their levies at their own seats (twelve days in the wide North, less in the
  Westerlands) and then march, every man together, for your host wherever it has gone. A quick call brings about two
  fifths of a lord's levies; a full call nine tenths, but more slowly and less willingly.
- **The host card shows the muster.** Who is with the host and with how many; who is on the road and the day they will
  arrive; who is still expected (the raven on the wing, weighing the call, gathering at home) with the day they should
  come; who refused. The days are the game's own, and they hold: lords arrive within a day or two of the day shown.
- **March now, or wait for the banners.** *March now* sends the host on its way and the banners follow it; *Wait for the
  banners* holds it until eight in ten of the men called are in, then it marches where it was bound. You can also
  write "wait for the banners" as an order.
- Your officers (ask Maester Luwin) know who is gathering and when they will set out.
- **Milestone 1** — a truthful turn: the muster becomes one host, the King's progress keeps to the kingsroad, and the
  chronicle tells only what happened.
- Owner to verify: as Stark, call the banners; open your host's card over the next weeks and watch lords move from
  *expected* to *on the road* to *present*, arriving on the days shown; try *Wait for the banners* with a march order.

## 2026-09-28 — B13: the realm remembers what it knows (WP B13)

- **Lords remember.** When the model speaks for a lord — in his week's decision, in an audience, in answering a
  letter — he is reminded of what has reached his house lately and of older things that bear on the matter (an old
  oath, a quarrel over fishing rights), and of what the chronicle says of them — only what his house could know.
- **The chronicle is written from what happened.** Each moon or so the chronicle gains a section: what happened
  (the game's own record, dated), a short summary, what is still open (your hosts on the march, your sworn lords'
  hosts coming to you, promises not yet due, matters awaiting your word) and what is only rumoured. Threads the model
  might invent are refused: every open thread must name someone or somewhere real in those days.
- `npm run playtest` now exists and works on Windows (it no longer needs administrator rights), and the default context
  window is 64k.
- Owner to verify: play two moons; open the Chronicle (h) and read the new section; `npm run playtest -- --house stark
  --turns 12`.

## 2026-09-28 — B12: the realm is never quiet for long (WP B12)

- **Things begin.** A hedge knight asks for service, a septon preaches against a lord, two houses quarrel over a mill,
  outlaws take to a road, a galley goes onto the rocks, reavers burn a fishing village, a fever closes a town — some
  eighty such beginnings, each happening only where the world fits it (reavers on a coast, wildlings in the North
  when the free folk stir, sellswords in wartime). In your own lands many of them come before you as a matter to
  decide, with answers that cost or gain you coin, men, goodwill or order.
- **No empty weeks.** A whole week in which nothing of note happens anywhere in the realm gets one such beginning.
- **Settings → A director keeps the realm eventful**: light (the default: at most one new thread a fortnight, chosen by
  the model), lively, or off (only the empty-week guarantee). The model only chooses which beginning and where, from a
  list the game offers; the game makes it happen.
- Owner to verify: play four or five weeks as Stark with the live model; a new thread should appear in the chronicle
  every fortnight or so, some as matters awaiting your word; `npm run bench` still passes.

## 2026-09-28 — B11: the days pass a week at a time, and you can stop them (WP B11)

- **The days are lived one by one, and told a week at a time.** The engine now runs each day in turn — the roads, the
  banners, the battles, the letters, promises kept or broken — and after each week the realm's lords take counsel
  again and the chronicle tells that week. In a long jump the first week's news appears in the panel, under its dates,
  with the map flashing where it happened, while the next week is still being lived.
- **Stop the days.** While they pass, "Stop the days here" ends the turn at the end of the week you are watching. After
  a turn, the undo window (↶) offers "Stop the last turn sooner": pick a day and the turn is played again as far as
  that day — the days you saw come out exactly the same, and the rest is unwritten. (Not in an ironman chronicle.)
- **The old council of five is gone.** The turn is no longer written by a chain of big prompts; the lords' minds,
  the engine and the narrator do it. The Settings choice "Who writes the turn" is removed.
- Faster: a week of the engine takes about a second on the mock model.
- Owner to verify: `npm start`, play a Stark game with the live model and call the banners and end a turn that runs
  more than a week (the header says "until …"); watch the first week's news appear while the second is simulated; press
  "Stop the days here" once; then open ↶ and use "Stop the last turn sooner" on an earlier day.

## 2026-09-27 — B10: a lord's word binds (WP B10)

- **What a lord promises in an audience, he is held to.** Ask Roose Bolton to bring his men to Moat Cailin within the
  fortnight; if he agrees, the promise is recorded under his answer ("promises to bring his men to Moat Cailin within
  14 days"). If he meant it, his men turn for Moat Cailin the next day; if he did not — and whether he did is his
  secret — they do not. On the day it falls due the promise is kept or broken, the chronicle says which, and a broken
  promise costs him your house's regard. A lord who refuses promises nothing; one who names a price has not yet agreed.
- **Letters are real.** A letter to someone far away flies for days; it is read and weighed the day it lands, in the
  mood and the world of that day, and the answer flies back and arrives in your Letters, the conversation and the
  chronicle when it lands. Words in your orders to a lord of another house go as such a letter.
- **Your own people do what you command and tell you so.** Commands in an audience with your own people are carried
  out, and their answer describes what they are about to do.
- **Your officers know the truth.** Ask Maester Luwin how the banners stand: who has come, who is on the road and how
  far, who has not answered. The council speaks from what each office knows; the new questions under the council
  ("What threatens us most?", "Can we afford a war?") are answered at length by the counsellor who knows the matter.
- The model no longer changes anything in an audience, a letter or a council: everything that happens goes through the
  game's own rules.
- Owner to verify: call the banners, end a week, bring Roose Bolton to Winterfell (or ask any lord at your court), and
  ask him for his men somewhere within a fortnight; see the promise under his answer and, over the next weeks, in the
  chronicle. Write to Lysa Arryn and watch the raven go and come back.

## 2026-09-27 — B9: every house knows only what has reached it (WP B9)

- **News travels.** What happens within sight of your castles, your sworn lords' castles and your hosts you know at
  once; the realm's great news comes by raven, a day for every two hundred miles; small matters come by rumour, slowly,
  and not from the far end of the realm. A card that came late says so: "It happened on the 9th; word came on the 24th."
  News that has not reached you by the end of a turn arrives in the turn it does.
- **The lords of the realm know only what has reached them too.** A lord's mind decides on the news his house has, and
  on the enemy hosts it can see or has word of — where the word puts them.
- **Your game no longer carries what your house does not know.** The browser is sent other houses' hosts only as seen
  (without where they are going) or as reported (where the report says), others' secrets stay hidden (the sheet still
  tells you there is more to know), other houses' coffers are a maester's estimate, and the lords' private counsel,
  unread answers and secret pacts stay on the server.
- A spy's uncovered secret is now knowledge of your house in its own right.
- Owner to verify: play a few weeks as Stark; far news (a tourney at Casterly Rock, a lord riding to King's Landing)
  shows "word came on …" under it. In the browser's developer tools, the game's state holds no `minds`, and a
  Lannister host far from the North is either absent or marked `reported`.

## 2026-09-27 — B8: the chronicle is told, and never wrong (WP B8)

- **The week is told as stories, in the voice of the books.** What your house learns in a turn is gathered into at most
  eight stories — the banners answering at Karhold, Jon Snow leaving by the Hunter's Gate, the King's progress at the
  Twins — and each is told once: a herald's headline, one plain line, and a short scene behind one person's eyes. The
  small happenings of the realm become one "Meanwhile" sentence above the list of them.
- **Every telling is checked against what truly happened.** A person seen where they are not, an arrival no one made, a
  number the facts do not hold, a castle the story never went near, a word from a later chapter ("the King in the
  North" in 298), a game word or a stray foreign glyph — and the story is told again, alone, with what was wrong. If it
  is wrong twice, it stays in the plain words of the record. The chronicle is never allowed to be wrong.
- **The record is one click away.** Under a told story, "The record" opens the engine's own lines behind it, with their
  exact numbers.
- **Your own orders are told under your words**: "Eddard Stark commanded: 'Send Jon Snow to Castle Black.'" and then
  the scene of it.
- Settings: **Who tells the turn** (the chronicler, or the old bard) and **How many lords think each week** (3, 6, 10 or
  none). `config.json`: `"narrator": "on" | "off"`, `"minds": 3 | 6 | 10 | "off"`.
- Fixes on the way: a regency read "With Edric Dayne is 10 years old, …"; a new game's `seed` was ignored by the API.
- For the owner: `npm run bench -- --suite narrate` tells sixty weeks of twelve seeded games with your model and reports
  how many stories were true on the first telling (the gate is 90 %), and the faults by rule; add `--judge` for a score
  of the voice (the gate is 3.8 of 5).
- Owner to verify: begin a Stark game, order "Call the banners to Winterfell." and "Send Jon Snow to Castle Black.", end
  a week. The chronicle tells stories with scenes; open "The record" under one; your two orders are told under your
  words. In the save's `turns/000001.json`, `narration` says how many stories were told, told again or left plain.

## 2026-09-27 — B7: the lords of the realm think for themselves (WP B7)

- **Every week, the lords who matter decide something.** The King, the great lords, a lord whose castle is besieged or
  whose son has been taken, a commander with an enemy in reach — scored by rank, by what has just happened to them and
  by how near they are to you — each chooses one thing to do: call their banners, raise levies, march, give battle,
  relieve a siege, answer their liege's call, judge a prisoner, fill their granaries, hold a feast or a tourney, send a
  gift or an envoy, set their taxes — or wait. What they do happens through the same actions as your own orders, so it
  is real: hosts appear and march on the map, and the chronicle tells you what your house would hear of it.
- **They act in character.** With a model running, each of the six most salient lords thinks with it, given what they
  know, what they want, their nature and their house's ways, and may only choose among what they can lawfully do now.
  Without a model (or when it fails), each house follows its own ways: Tywin answers the seizure of his son by calling
  his banners; Doran Martell waits; Walder Frey is late to every war; Lysa keeps her knights behind the Bloody Gate; an
  honourable vassal answers his liege at once. At peace, lords govern, build and feast — they do not call their banners.
- **The realm is never idle:** at least three lords act each week, one of them far from your own country.
- The old way the other houses were moved (a model writing changes straight into the world) is retired while minds are
  on. `config.json` `"minds": 3 | 6 | 10 | "off"` sets how many lords think with the model each week (default 6).
- Fixes found on the way: a host that fought kept the wrong count of its banners' men; a host could keep chasing an army
  that no longer existed; a reply naming a place by a name the model was offered could be refused ("Storm's End");
  works in the chronicle read "begins Build warships at White Harbor at White Harbor".
- For the owner: `npm run bench -- --suite mind` measures your model on 123 situations from the books (the gate is 85 %
  in character); `--reader tree` shows the house ways alone.
- Owner to verify: begin a Stark game and end three turns of a week — the chronicle tells of other lords' doings
  (a tourney in King's Landing, works at White Harbor, lords answering calls); open the save's `turns/` files: each has
  `minds`, who decided what and how. With your model running, `llm-log.jsonl` holds the `mind` calls.

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
