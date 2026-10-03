// The matters that come before a lord (docs/gdd/10-narrative-events.md §6; WP D3): a situation, two to four answers
// with their hints and effects (the `fx` of shared/petitions.js), the days it waits and what silence decides. Every
// matter in the game is one of these templates — the model may not invent one (B-28): the `decision` op refuses a matter
// that names no template here (or a Director hook's, `hook:<id>`, data/hooks.js).
//
// Groups: `realm` (petitions from the lord's own lands and vassals), `lords` (other houses' proposals, demands and
// invitations), `people` (the lord's own household) — each with `raise(ctx)`, drawn when a moon passes with nothing
// before the lord (shared/petitions.js) — and those raised by the engine where they happen: `opportunity`
// (shared/plots.js), `engine` (shared/vassals.js, engine/politics/war.js) and `canon` (the beats, data/beats.js).
// `raise` returns the matter or null when the world has no place for it; `ctx` is petitions.js's `matterContext`.

const fmt = (n) => Math.round(n).toLocaleString('en-GB');
const his = (c) => (c?.sex === 'f' ? 'her' : 'his');
const he = (c) => (c?.sex === 'f' ? 'she' : 'he');
const name = (h) => `House ${h.name}`;

export const MATTERS = {
  // ── Realm petitions: the lord's own lands and sworn houses ──
  border_quarrel: { group: 'realm', gist: 'two vassals claim the same mill and villages', raise: ({ vas, lordOf, shuffle }) => {
    if (vas.length < 2) return null; const [a, b] = shuffle(vas);
    return { title: `A border quarrel: ${a.name} and ${b.name}`, from: a.lord,
      text: `${lordOf(a).name} and ${lordOf(b).name} both claim a mill, a ford and three villages on the land between their seats. Blood has been spilled over it. Both appeal to you for judgement.`,
      options: [
        { label: `Judge for House ${a.name}`, hint: `${a.name} grateful, ${b.name} aggrieved`, fx: [{ rel: [a.id, 12] }, { rel: [b.id, -15] }, { loyalty: [b.lord, -10] }, { rel2: [a.id, b.id, -10] }] },
        { label: `Judge for House ${b.name}`, hint: `${b.name} grateful, ${a.name} aggrieved`, fx: [{ rel: [b.id, 12] }, { rel: [a.id, -15] }, { loyalty: [a.lord, -10] }, { rel2: [a.id, b.id, -10] }] },
        { label: 'Divide the land between them', hint: 'Neither is happy, neither is shamed', fx: [{ rel: [a.id, -2] }, { rel: [b.id, -2] }, { rel2: [a.id, b.id, 5] }] },
        { label: 'Take the land into your own hands', hint: 'Profitable; both lords resent it', fx: [{ gold: 1200 }, { rel: [a.id, -12] }, { rel: [b.id, -12] }, { loyalty: [a.lord, -8] }, { loyalty: [b.lord, -8] }] }],
      lapse: [{ rel2: [a.id, b.id, -8] }, { unrestAll: 2 }] };
  } },
  forbearance_plea: { group: 'realm', gist: 'a vassal begs to be excused a year\'s dues', raise: ({ vas, lordOf, pick }) => {
    if (!vas.length) return null; const v = pick(vas);
    return { title: `House ${v.name} begs forbearance`, from: v.lord,
      text: `${lordOf(v).name} writes that blight and bad weather have ruined half their harvest, and begs to be excused this year's dues.`,
      options: [
        { label: 'Forgive the dues this year', hint: 'Less coin; a grateful vassal', fx: [{ tribute: [v.id, 'forgiven'] }, { rel: [v.id, 15] }, { loyalty: [v.lord, 12] }] },
        { label: 'Halve the dues', hint: 'A middle course', fx: [{ tribute: [v.id, 'reduced'] }, { rel: [v.id, 5] }, { loyalty: [v.lord, 4] }] },
        { label: 'Demand full payment', hint: 'Coin now; resentment later', fx: [{ rel: [v.id, -10] }, { loyalty: [v.lord, -12] }] }],
      lapse: [{ rel: [v.id, -4] }] };
  } },
  marriage_offer_child: { group: 'realm', gist: 'a vassal proposes a match for one of the lord\'s children', raise: ({ state, vas, lordOf, pick, kids, isFemale }) => {
    if (!vas.length || !kids.length) return null; const v = pick(vas); const kid = pick(kids);
    const partner = Object.values(state.characters).find((c) => c.alive && c.house === v.id && !c.spouse && !c.betrothed && Math.abs(c.age - kid.age) <= 8 && c.age <= 25 && isFemale(c) !== isFemale(kid) && !(c.roles || []).some((r) => /watch|maester|septa|kingsguard/.test(r)));
    const who = partner ? partner.name : `${isFemale(kid) ? 'a son' : 'a daughter'} of House ${v.name}`;
    const bond = partner ? { betroth: [kid.id, partner.id] } : { betrothNew: [kid.id, v.id, !isFemale(kid), Math.max(6, kid.age + (isFemale(kid) ? 2 : -2))] };
    return { title: `A match proposed by House ${v.name}`, from: v.lord,
      text: `${lordOf(v).name} proposes a betrothal between ${kid.name} and ${who}, "to bind our houses closer in these uncertain times".`,
      options: [
        { label: 'Accept the match', hint: `House ${v.name} bound closer; ${kid.name}'s hand is spent`, fx: [{ rel: [v.id, 20] }, { loyalty: [v.lord, 15] }, bond] },
        { label: 'Politely refuse', hint: 'Keeps the match free for a greater house', fx: [{ rel: [v.id, -6] }] },
        { label: 'Ask for a larger dowry', hint: 'Coin or men — and some offence', fx: [{ rel: [v.id, -4] }, { chance: [0.6, [{ gold: 1500 }, { rel: [v.id, 8] }, bond], [{ rel: [v.id, -10] }, { loyalty: [v.lord, -6] }]] }] }],
      lapse: [{ rel: [v.id, -6] }] };
  } },
  accused_knight: { group: 'realm', gist: 'a vassal\'s knight is accused by the smallfolk', raise: ({ vas, lordOf, pick }) => {
    if (!vas.length) return null; const v = pick(vas); const l = lordOf(v);
    return { title: 'A knight accused', from: v.lord,
      text: `A sworn knight of House ${v.name} is accused by the smallfolk of burning a village and taking a miller's daughter. ${l.name} asks that the matter be left to ${l.sex === 'f' ? 'her' : 'him'}; the villagers ask for their lord's justice.`,
      options: [
        { label: 'Try the knight yourself', hint: 'Justice seen to be done; the vassal feels slighted', fx: [{ unrestAll: -6 }, { rel: [v.id, -8] }, { loyalty: [v.lord, -5] }] },
        { label: `Leave it to House ${v.name}`, hint: 'Keeps the peace with your vassal; the smallfolk grumble', fx: [{ unrestAll: 5 }, { rel: [v.id, 6] }] },
        { label: 'Send him to the Night\'s Watch', hint: 'A quiet, merciful exile', fx: [{ unrestAll: -2 }, { rel: [v.id, -2] }, { rel: ['nights_watch', 3] }] }],
      lapse: [{ unrestAll: 4 }] };
  } },
  hungry_smallfolk: { group: 'realm', gist: 'smallfolk beg grain from the lord\'s granaries', raise: ({ holdings, pick }) => {
    if (!holdings.length) return null; const h = pick(holdings);
    return { title: `The smallfolk of ${h.name}`, from: null, where: h.id,
      text: `A delegation of smallfolk from the lands of ${h.name} kneels in your hall. The stores are thin, they say, and prices in the market have doubled. They beg grain from your granaries.`,
      options: [
        { label: 'Open the granaries to them', hint: 'Food stores down; unrest down, love up', fx: [{ food: -1.5 }, { unrest: [h.id, -15] }, { prosperity: [h.id, 3] }] },
        { label: 'Sell them grain at a fair price', hint: 'Some coin; some goodwill', fx: [{ food: -1 }, { gold: 400 }, { unrest: [h.id, -5] }] },
        { label: 'Send them away', hint: 'Stores kept; unrest rises', fx: [{ unrest: [h.id, 12] }, { prosperity: [h.id, -2] }] }],
      lapse: [{ unrest: [h.id, 8] }] };
  } },
  outlaws_on_road: { group: 'realm', gist: 'broken men rob travellers near a holding', raise: ({ holdings, pick }) => {
    if (!holdings.length) return null; const h = pick(holdings);
    return { title: 'Outlaws on the roads', from: null, where: h.id,
      text: `Merchants complain of outlaws on the roads near ${h.name}: deserters and broken men who rob travellers and burn holdfasts.`,
      options: [
        { label: 'Send men to hunt them down', hint: 'Costs coin and men; trade recovers', fx: [{ gold: -600 }, { menAtArms: -40 }, { unrest: [h.id, -10] }, { prosperity: [h.id, 4] }] },
        { label: 'Offer them pardon if they take the black', hint: 'Cheap; the Night\'s Watch gains men', fx: [{ unrest: [h.id, -4] }, { rel: ['nights_watch', 5] }, { nwMen: 30 }] },
        { label: 'Let the local lords deal with it', hint: 'Free; the problem may grow', fx: [{ unrest: [h.id, 8] }, { prosperity: [h.id, -4] }] }],
      lapse: [{ unrest: [h.id, 6] }, { prosperity: [h.id, -3] }] };
  } },
  poaching_case: { group: 'realm', gist: 'a poacher taken in the lord\'s wood', raise: ({ holdings, pick }) => {
    if (!holdings.length) return null; const h = pick(holdings);
    return { title: 'A poacher in your wood', from: null, where: h.id,
      text: `Your huntsmen have caught a crofter from ${h.name} with a stag across his shoulders in your forest. The law allows you his hand. His wife and four children wait at the gate.`,
      options: [
        { label: 'Take his hand, as the law allows', hint: 'The law feared; the village resents it', fx: [{ unrest: [h.id, 6] }, { prosperity: [h.id, -1] }] },
        { label: 'A fine, and a warning', hint: 'Mercy with a price', fx: [{ gold: 20 }, { unrest: [h.id, -2] }] },
        { label: 'Send him to the Wall', hint: 'The Watch takes all comers', fx: [{ nwMen: 1 }, { rel: ['nights_watch', 1] }] },
        { label: 'Let him keep the stag — it was a hard winter', hint: 'Loved by the smallfolk; your huntsmen grumble', fx: [{ unrest: [h.id, -6] }] }],
      lapse: [{ unrest: [h.id, 2] }] };
  } },
  inheritance_dispute: { group: 'realm', gist: 'two claimants to a dead knight\'s holdfast', raise: ({ vas, lordOf, pick }) => {
    if (!vas.length) return null; const v = pick(vas);
    return { title: 'An inheritance disputed', from: v.lord,
      text: `A landed knight sworn to House ${v.name} has died, and his younger brother and his daughter both claim his holdfast. ${lordOf(v).name} favours the brother, who has fought for ${his(lordOf(v))} house; the daughter has the old law on her side.`,
      options: [
        { label: 'Uphold the daughter\'s right', hint: 'The law kept; the vassal overruled', fx: [{ rel: [v.id, -6] }, { unrestAll: -2 }, { prestige: 2 }] },
        { label: 'Confirm the brother, as your vassal asks', hint: 'A vassal pleased', fx: [{ rel: [v.id, 8] }, { loyalty: [v.lord, 5] }] },
        { label: 'Wed the daughter to the brother\'s son', hint: 'Both claims joined; no one delighted', fx: [{ rel: [v.id, 3] }] }],
      lapse: [{ rel: [v.id, 2] }] };
  } },
  bastard_claim: { group: 'realm', gist: 'a bastard claims a vassal\'s name', raise: ({ vas, lordOf, pick }) => {
    if (!vas.length) return null; const v = pick(vas);
    return { title: `A bastard of House ${v.name}`, from: null,
      text: `A young man comes to your hall with a letter in the late Lord ${v.name}'s hand, acknowledging him as a son. He asks you to legitimise him. ${lordOf(v).name} calls the letter a forgery.`,
      options: [
        { label: 'Refuse him', hint: 'Your vassal\'s house stays as it is', fx: [{ rel: [v.id, 6] }] },
        { label: 'Petition the King to legitimise him', hint: 'A new claimant in your vassal\'s house', fx: [{ rel: [v.id, -15] }, { loyalty: [v.lord, -10] }] },
        { label: 'Take him into your own service', hint: 'A sword that owes you everything', fx: [{ menAtArms: 1 }, { rel: [v.id, -4] }] }],
      lapse: [] };
  } },
  septon_complaint: { group: 'realm', gist: 'the septons complain of the lord\'s men', raise: ({ holdings, pick, me }) => {
    if (!holdings.length || ['free_folk', 'greyjoy'].includes(me.id)) return null; const h = pick(holdings);
    return { title: 'A septon\'s complaint', from: null, where: h.id,
      text: `The septon of ${h.name} complains that your men-at-arms have been drinking in the sept and gaming on the altar of the Warrior. The Faith, he says gently, has long memories.`,
      options: [
        { label: 'Flog the men and pay for a new altar', hint: 'The Faith pleased; your men sullen', fx: [{ gold: -200 }, { unrest: [h.id, -4] }] },
        { label: 'Give the sept a gift and say no more', hint: 'Coin buys quiet', fx: [{ gold: -400 }, { unrest: [h.id, -2] }] },
        { label: 'Tell the septon to mind his prayers', hint: 'The smallfolk hear of it', fx: [{ unrest: [h.id, 5] }] }],
      lapse: [{ unrest: [h.id, 2] }] };
  } },
  maester_request_rookery: { group: 'realm', gist: 'the maester asks coin for the rookery', raise: ({ me, maester }) => {
    if (!me.seat) return null;
    return { title: 'The rookery', from: maester?.id || null, where: me.seat,
      text: `${maester ? maester.name : 'Your maester'} reports that half the ravens in the rookery are old and slow, and the new birds from the Citadel cost dear. "A lord who hears late decides late."`,
      options: [
        { label: 'Buy the birds', hint: '800 gold; your news comes quicker', fx: [{ gold: -800 }, { prestige: 1 }] },
        { label: 'Make do with the old ones', hint: 'Coin kept', fx: [] }],
      lapse: [] };
  } },
  widow_petition: { group: 'realm', gist: 'a soldier\'s widow asks for her husband\'s pay', raise: ({ holdings, pick, atWar }) => {
    if (!holdings.length) return null; const h = pick(holdings);
    return { title: 'A widow\'s petition', from: null, where: h.id,
      text: `A widow from ${h.name} says her husband died ${atWar ? 'in your war' : 'in your service on the roads'}, owed three moons' pay. She has five children and a roof that leaks.`,
      options: [
        { label: 'Pay her twice what is owed', hint: 'A small cost; word spreads', fx: [{ gold: -60 }, { unrest: [h.id, -3] }] },
        { label: 'Pay what is owed', hint: 'Fair', fx: [{ gold: -30 }] },
        { label: 'Have the steward look into it', hint: 'Nothing, for now', fx: [{ unrest: [h.id, 1] }] }],
      lapse: [{ unrest: [h.id, 1] }] };
  } },
  mill_rights: { group: 'realm', gist: 'a new mill and an old one on the same river', raise: ({ holdings, pick }) => {
    if (!holdings.length) return null; const h = pick(holdings);
    return { title: 'Mill rights', from: null, where: h.id,
      text: `A prosperous freeholder near ${h.name} has built a mill upstream of your own, and your miller says the water no longer turns his wheel. The freeholder offers a tithe of his flour.`,
      options: [
        { label: 'Have the new mill pulled down', hint: 'Your mill\'s dues kept; a rich man offended', fx: [{ prosperity: [h.id, -2] }] },
        { label: 'Take his tithe and let both grind', hint: 'More coin from the river', fx: [{ gold: 150 }, { prosperity: [h.id, 2] }] },
        { label: 'Buy his mill', hint: '600 gold; both mills yours', fx: [{ gold: -600 }, { prosperity: [h.id, 3] }] }],
      lapse: [] };
  } },
  bridge_toll_dispute: { group: 'realm', gist: 'merchants protest a vassal\'s new bridge toll', raise: ({ vas, lordOf, pick }) => {
    if (!vas.length) return null; const v = pick(vas);
    return { title: 'A toll on the bridge', from: null,
      text: `Merchants protest that ${lordOf(v).name} has set a new toll on the bridge below ${v.name}'s seat — a silver stag a wagon. Trade is going the long way round.`,
      options: [
        { label: 'Order the toll lifted', hint: 'Trade flows; your vassal loses his coin', fx: [{ rel: [v.id, -8] }, { unrestAll: -1 }] },
        { label: 'Let it stand, and take a share', hint: 'Coin for you both; trade suffers', fx: [{ gold: 300 }, { rel: [v.id, 4] }] },
        { label: 'Halve it', hint: 'A compromise', fx: [{ rel: [v.id, -2] }] }],
      lapse: [] };
  } },
  deserter_caught: { group: 'realm', gist: 'a deserter from the Night\'s Watch taken on the lord\'s land', raise: ({ holdings, pick, me }) => {
    if (!holdings.length || me.id === 'nights_watch') return null; const h = pick(holdings);
    return { title: 'A deserter from the Watch', from: null, where: h.id,
      text: `Your men have taken a man in black near ${h.name}, half-starved and raving of dead men walking in the snow. He broke his vows. The old law is the sword, and the lord who passes the sentence should swing it.`,
      options: [
        { label: 'Take his head yourself', hint: 'The old law', fx: [{ rel: ['nights_watch', 3] }, { prestige: 2 }] },
        { label: 'Send him back to the Wall in chains', hint: 'The Watch will deal with him', fx: [{ rel: ['nights_watch', 2] }, { nwMen: 1 }] },
        { label: 'Let him go', hint: 'Mercy the Watch will not forgive', fx: [{ rel: ['nights_watch', -8] }] }],
      lapse: [{ rel: ['nights_watch', -2] }] };
  } },
  stolen_cattle: { group: 'realm', gist: 'two villages quarrel over stolen cattle', raise: ({ holdings, pick }) => {
    if (holdings.length < 1) return null; const h = pick(holdings);
    return { title: 'Stolen cattle', from: null, where: h.id,
      text: `Two villages of ${h.name} have come to blows over a herd of forty cattle each says the other stole. A man is dead of it.`,
      options: [
        { label: 'Divide the herd and fine both', hint: 'Order; some coin', fx: [{ gold: 60 }, { unrest: [h.id, -2] }] },
        { label: 'Hang the man who struck the blow', hint: 'Justice, sternly', fx: [{ unrest: [h.id, -4] }] },
        { label: 'Take the herd for your own table', hint: 'Both villages hate you', fx: [{ food: 0.3 }, { unrest: [h.id, 8] }] }],
      lapse: [{ unrest: [h.id, 3] }] };
  } },
  murder_trial: { group: 'realm', gist: 'a man-at-arms kills a merchant\'s son', raise: ({ holdings, pick }) => {
    if (!holdings.length) return null; const h = pick(holdings);
    return { title: 'A killing in the market', from: null, where: h.id,
      text: `One of your own men-at-arms killed a merchant's son in a tavern at ${h.name}. He says the boy drew first; three witnesses say otherwise. The merchants want him hanged.`,
      options: [
        { label: 'Hang him', hint: 'The townsfolk see justice; your men mutter', fx: [{ unrest: [h.id, -6] }, { menAtArms: -1 }] },
        { label: 'Trial by combat, if he asks it', hint: 'The gods decide', fx: [{ chance: [0.5, [{ unrest: [h.id, 4] }], [{ unrest: [h.id, -4] }, { menAtArms: -1 }]] }] },
        { label: 'Pay the blood price', hint: 'Coin settles it', fx: [{ gold: -300 }, { unrest: [h.id, -2] }] }],
      lapse: [{ unrest: [h.id, 4] }] };
  } },
  ward_request: { group: 'realm', gist: 'a vassal asks the lord to foster his son', raise: ({ vas, lordOf, pick, me }) => {
    if (!vas.length || !me.seat) return null; const v = pick(vas);
    return { title: `A ward from House ${v.name}`, from: v.lord,
      text: `${lordOf(v).name} asks that you take ${his(lordOf(v))} younger son into your household to be fostered, as the custom is — a son at your hearth, and a bond between the houses.`,
      options: [
        { label: 'Welcome the boy', hint: 'A bond, and a hostage in all but name', fx: [{ rel: [v.id, 12] }, { loyalty: [v.lord, 10] }, { gold: -100 }] },
        { label: 'Refuse gently: your household is full', hint: 'A small slight', fx: [{ rel: [v.id, -4] }] }],
      lapse: [{ rel: [v.id, -2] }] };
  } },
  hostage_request: { group: 'realm', gist: 'the lord\'s council urges a hostage from a doubtful vassal', raise: ({ vas, lordOf, state, p }) => {
    const doubtful = vas.filter((v) => (state.characters[v.lord]?.loyalty ?? 60) < 45); if (!doubtful.length) return null; const v = doubtful[0];
    return { title: `The loyalty of House ${v.name}`, from: null,
      text: `Your council doubts ${lordOf(v).name}: ${he(lordOf(v))} has been slow with ${his(lordOf(v))} dues and quick with ${his(lordOf(v))} complaints. They urge you to ask for a son as a hostage for ${his(lordOf(v))} good faith.`,
      options: [
        { label: 'Demand a hostage', hint: 'Loyalty assured, or defiance brought forward', fx: [{ chance: [0.7, [{ loyalty: [v.lord, 15] }, { rel: [v.id, -10] }], [{ rel: [v.id, -25] }, { loyalty: [v.lord, -20] }]] }] },
        { label: 'Win them with a gift instead', hint: '1,000 gold', fx: [{ gold: -1000 }, { rel: [v.id, 10] }, { loyalty: [v.lord, 8] }] },
        { label: 'Trust them', hint: 'Nothing given, nothing taken', fx: [] }],
      lapse: [] };
  } },
  loan_request: { group: 'realm', gist: 'a friendly house asks a loan', raise: ({ state, friends, pick, treasury }) => {
    if (!friends.length || treasury < 15000) return null; const f = pick(friends);
    return { title: `A request from House ${f.name}`, from: f.lord,
      text: `${state.characters[f.lord].name} asks for a loan of 5,000 dragons "between friends", to be repaid within the year.`,
      options: [
        { label: 'Lend the gold', hint: 'Friendship deepens; the coin may not return', fx: [{ lend: [f.id, 5000, 12] }, { rel: [f.id, 18] }] },
        { label: 'Lend half', hint: 'A cautious friend', fx: [{ lend: [f.id, 2500, 12] }, { rel: [f.id, 6] }] },
        { label: 'Refuse politely', hint: 'Keeps your gold; cools the friendship', fx: [{ rel: [f.id, -8] }] }],
      lapse: [{ rel: [f.id, -4] }] };
  } },

  // ── Other lords: proposals, demands, invitations ──
  proposal_alliance: { group: 'lords', gist: 'a friendly house proposes an alliance', raise: ({ state, p, friends, pick }) => {
    const f = friends.filter((h) => !(state.pacts || []).some((x) => x.status !== 'ended' && [x.a, x.b].includes(p) && [x.a, x.b].includes(h.id))); if (!f.length) return null; const h = pick(f);
    return { title: `House ${h.name} proposes an alliance`, from: h.lord,
      text: `${state.characters[h.lord].name} writes that the times are uncertain and friends should stand together: a pact of alliance between House ${h.name} and your own, each to come to the other's aid.`,
      options: [
        { label: 'Swear the alliance', hint: 'An ally — and their wars your own', fx: [{ ops: [{ op: 'pact', type: 'alliance', a: p, b: h.id, terms: 'Mutual aid' }] }, { rel: [h.id, 15] }] },
        { label: 'Friendship, but no pact', hint: 'Warm words, free hands', fx: [{ rel: [h.id, 3] }] },
        { label: 'Refuse', hint: 'They will remember', fx: [{ rel: [h.id, -12] }] }],
      lapse: [{ rel: [h.id, -5] }] };
  } },
  proposal_marriage: { group: 'lords', gist: 'a great house proposes a match', raise: ({ state, kids, friends, pick, isFemale }) => {
    if (!kids.length || !friends.length) return null; const h = pick(friends); const kid = pick(kids);
    return { title: `A match from House ${h.name}`, from: h.lord,
      text: `${state.characters[h.lord].name} proposes to join your houses: ${kid.name} to wed ${isFemale(kid) ? 'a son' : 'a daughter'} of House ${h.name} when of age.`,
      options: [
        { label: 'Accept the match', hint: `A bond with House ${h.name}`, fx: [{ betrothNew: [kid.id, h.id, !isFemale(kid), Math.max(6, kid.age)] }, { rel: [h.id, 20] }] },
        { label: 'Refuse courteously', hint: 'The hand kept for another', fx: [{ rel: [h.id, -6] }] }],
      lapse: [{ rel: [h.id, -4] }] };
  } },
  proposal_trade: { group: 'lords', gist: 'a neighbour proposes a trade compact', raise: ({ state, friends, neutral, pick }) => {
    const pool = [...friends, ...neutral]; if (!pool.length) return null; const h = pick(pool);
    return { title: `Trade with House ${h.name}`, from: h.lord,
      text: `${state.characters[h.lord].name} proposes that merchants of both your lands pass free of tolls for five years.`,
      options: [
        { label: 'Agree', hint: 'Prosperity up; some tolls lost', fx: [{ rel: [h.id, 8] }, { gold: -200 }, { unrestAll: -1 }] },
        { label: 'Agree, for a price', hint: 'They pay for the privilege — or walk away', fx: [{ chance: [0.5, [{ gold: 1000 }, { rel: [h.id, 4] }], [{ rel: [h.id, -4] }]] }] },
        { label: 'Decline', hint: 'Tolls kept', fx: [{ rel: [h.id, -2] }] }],
      lapse: [] };
  } },
  demand_submission: { group: 'lords', gist: 'a stronger enemy demands the lord bend the knee', raise: ({ state, p, foes, pick }) => {
    // one who is your own vassal, or sits in your cells, does not demand that you kneel (a liege loop is no house at all)
    const sworn = (id) => { for (let x = state.houses[id]?.liege, n = 0; x && n < 60; x = state.houses[x]?.liege, n++) if (x === p) return true; return false; };
    const pool = foes.filter((h) => !sworn(h.id) && h.lord && state.characters[h.lord]?.alive && !/imprisoned|captive|hostage/.test(state.characters[h.lord].status || ''));
    if (!pool.length) return null; const h = pick(pool);
    const war = (state.wars || []).find((w) => w.status !== 'ended' && [...w.attackers, ...w.defenders].includes(p) && [...w.attackers, ...w.defenders].includes(h.id));
    return { title: `House ${h.name} demands your submission`, from: h.lord,
      text: `${state.characters[h.lord].name} writes that the war can end today if you bend the knee: swear fealty, and keep your lands and your life.`,
      options: [
        { label: 'Bend the knee', hint: `The war ends; you are House ${h.name}'s man`, fx: [{ ops: [{ op: 'liege', house: p, liege: h.id }, ...(war ? [{ op: 'war', status: 'end', id: war.id, outcome: `House ${state.houses[p].name} bends the knee to House ${h.name}` }] : [])] }, { rel: [h.id, 25] }, { prestige: -15 }] },
        { label: 'Refuse, with courtesy', hint: 'The war goes on', fx: [] },
        { label: 'Send back the messenger\'s head', hint: 'The war goes on, and hotter', fx: [{ rel: [h.id, -20] }, { prestige: 5 }] }],
      lapse: [] };
  } },
  demand_release: { group: 'lords', gist: 'a house demands the release of a captive the lord holds', raise: ({ state, prisoners, pick }) => {
    if (!prisoners.length) return null; const c = pick(prisoners); const h = state.houses[c.house]; if (!h?.lord || !state.characters[h.lord]?.alive || h.lord === c.id) return null;
    return { title: `House ${h.name} demands ${c.name}`, from: h.lord,
      text: `${state.characters[h.lord].name} demands that you release ${c.name} at once, "or answer for it".`,
      options: [
        { label: 'Release the captive', hint: 'Goodwill; a hostage lost', fx: [{ ops: [{ op: 'character', id: c.id, status: 'free', note: 'Released at the demand of their house.' }] }, { rel: [h.id, 15] }] },
        { label: 'Ask a ransom', hint: '2,000 gold, if they pay', fx: [{ chance: [0.6, [{ gold: 2000 }, { ops: [{ op: 'character', id: c.id, status: 'free', note: 'Ransomed.' }] }], [{ rel: [h.id, -10] }]] }] },
        { label: 'Refuse', hint: 'The captive stays; they will not forget', fx: [{ rel: [h.id, -15] }] }],
      lapse: [{ rel: [h.id, -8] }] };
  } },
  demand_payment: { group: 'lords', gist: 'a creditor demands repayment', raise: ({ state, me, pick }) => {
    const loans = (me.loans || []).filter((l) => state.houses[l.to] && state.houses[l.to].lord); if (!loans.length) return null; const l = pick(loans); const h = state.houses[l.to];
    return { title: `House ${h.name} wants its gold`, from: h.lord,
      text: `${state.characters[h.lord].name} reminds you of the ${fmt(l.amount)} dragons lent, and asks for it back.`,
      options: [
        { label: 'Repay in full', hint: `${fmt(l.amount)} gold; your word kept`, fx: [{ gold: -l.amount }, { rel: [h.id, 10] }] },
        { label: 'Ask for another year', hint: 'Patience strained', fx: [{ rel: [h.id, -8] }] }],
      lapse: [{ rel: [h.id, -12] }] };
  } },
  demand_hostage: { group: 'lords', gist: 'the liege demands a hostage for the lord\'s loyalty', raise: ({ state, liege, kids }) => {
    if (!liege?.lord || !kids.length) return null; const kid = kids[0];
    return { title: `Your liege asks a hostage`, from: liege.lord,
      text: `${state.characters[liege.lord].name} has heard whispers of your loyalty, and asks that ${kid.name} come to court "to be raised among friends".`,
      options: [
        { label: `Send ${kid.name}`, hint: 'Your liege reassured; your child in their hands', fx: [{ ops: [{ op: 'character', id: kid.id, loc: liege.seat, note: 'Sent to court as a hostage for the house\'s loyalty.' }] }, { rel: [liege.id, 15] }] },
        { label: 'Refuse', hint: 'Suspicion hardens', fx: [{ rel: [liege.id, -15] }] }],
      lapse: [{ rel: [liege.id, -10] }] };
  } },
  request_aid: { group: 'lords', gist: 'a friend at war asks for men', raise: ({ state, p, friends, pick }) => {
    const fighting = friends.filter((h) => (state.wars || []).some((w) => w.status !== 'ended' && [...w.attackers, ...w.defenders].includes(h.id) && ![...w.attackers, ...w.defenders].includes(p))); if (!fighting.length) return null; const h = pick(fighting);
    return { title: `House ${h.name} asks for swords`, from: h.lord,
      text: `${state.characters[h.lord].name} is at war and asks you, as a friend, for men — two hundred would be a kindness, five hundred a debt never forgotten.`,
      options: [
        { label: 'Send five hundred', hint: 'A friend for life; men gone', fx: [{ menAtArms: -500 }, { rel: [h.id, 25] }] },
        { label: 'Send two hundred', hint: 'A token', fx: [{ menAtArms: -200 }, { rel: [h.id, 10] }] },
        { label: 'Send gold instead', hint: '2,000 gold', fx: [{ gold: -2000 }, { rel: [h.id, 8] }] },
        { label: 'Refuse', hint: 'Your men kept home', fx: [{ rel: [h.id, -10] }] }],
      lapse: [{ rel: [h.id, -8] }] };
  } },
  request_passage: { group: 'lords', gist: 'a lord asks passage through the lord\'s lands', raise: ({ state, neutral, pick, me }) => {
    if (!neutral.length || !me.seat) return null; const h = pick(neutral);
    return { title: `House ${h.name} asks passage`, from: h.lord,
      text: `${state.characters[h.lord].name} asks leave for ${his(state.characters[h.lord])} men to cross your lands on the king's business, and promises to pay for what they eat.`,
      options: [
        { label: 'Grant it', hint: 'Goodwill; your roads full of strangers', fx: [{ rel: [h.id, 8] }, { unrestAll: 1 }] },
        { label: 'Grant it, and charge a toll', hint: 'Coin; some offence', fx: [{ gold: 500 }, { rel: [h.id, -2] }] },
        { label: 'Refuse', hint: 'Your lands closed', fx: [{ rel: [h.id, -8] }] }],
      lapse: [{ rel: [h.id, -3] }] };
  } },
  summons_to_court: { group: 'lords', gist: 'the liege summons the lord to court', raise: ({ state, liege, lord }) => {
    if (!liege?.lord || !liege.seat || !lord) return null;
    return { title: 'A summons to court', from: liege.lord,
      text: `${state.characters[liege.lord].name} summons you to ${state.holdings[liege.seat]?.name || 'court'} to give counsel. It would be ill-mannered to refuse.`,
      options: [
        { label: 'Go', hint: 'Favour at court; your lands without you for a while', fx: [{ rel: [liege.id, 10] }, { ops: [{ op: 'character', id: lord.id, loc: liege.seat, note: 'Summoned to court by the liege.' }] }] },
        { label: 'Send your heir in your place', hint: 'Half the courtesy', fx: [{ rel: [liege.id, 3] }] },
        { label: 'Plead illness', hint: 'Suspicion', fx: [{ rel: [liege.id, -8] }] }],
      lapse: [{ rel: [liege.id, -8] }] };
  } },
  dues_demanded: { group: 'lords', gist: 'the liege demands overdue dues', raise: ({ state, liege, me }) => {
    if (!liege?.lord || !['late', 'withholding'].includes(me.obligations?.tribute)) return null;
    return { title: 'Your dues are demanded', from: liege.lord,
      text: `${state.characters[liege.lord].name}'s steward writes, stiffly, that your dues are overdue, and asks when they may be expected.`,
      options: [
        { label: 'Pay what is owed', hint: '1,500 gold; your liege mollified', fx: [{ gold: -1500 }, { rel: [liege.id, 10] }, { tribute: [me.id, 'paying'] }] },
        { label: 'Promise payment next moon', hint: 'Time bought; patience spent', fx: [{ rel: [liege.id, -4] }] },
        { label: 'Refuse outright', hint: 'Defiance', fx: [{ rel: [liege.id, -20] }] }],
      lapse: [{ rel: [liege.id, -8] }] };
  } },
  invitation_feast: { group: 'lords', gist: 'an invitation to a feast', raise: ({ state, friends, neutral, pick }) => {
    const pool = [...friends, ...neutral].filter((h) => h.seat); if (!pool.length) return null; const h = pick(pool);
    return { title: `A feast at ${state.holdings[h.seat]?.name || h.name}`, from: h.lord,
      text: `${state.characters[h.lord].name} invites you to a feast for ${his(state.characters[h.lord])} nameday. Half the lords of the region will be there.`,
      options: [
        { label: 'Go, with a fine gift', hint: '300 gold; friends made', fx: [{ gold: -300 }, { rel: [h.id, 10] }] },
        { label: 'Send your regrets and a gift', hint: '150 gold', fx: [{ gold: -150 }, { rel: [h.id, 3] }] },
        { label: 'Decline', hint: 'Noticed', fx: [{ rel: [h.id, -3] }] }],
      lapse: [{ rel: [h.id, -2] }] };
  } },
  invitation_wedding: { group: 'lords', gist: 'an invitation to a wedding', raise: ({ state, friends, neutral, pick }) => {
    const pool = [...friends, ...neutral]; if (!pool.length) return null; const h = pick(pool);
    return { title: `A wedding in House ${h.name}`, from: h.lord,
      text: `${state.characters[h.lord].name} is marrying a daughter, and bids you come and drink to the match.`,
      options: [
        { label: 'Attend, and bring a gift', hint: '400 gold; a friend made', fx: [{ gold: -400 }, { rel: [h.id, 12] }] },
        { label: 'Send a gift', hint: '200 gold', fx: [{ gold: -200 }, { rel: [h.id, 4] }] },
        { label: 'Stay home', hint: 'A small slight', fx: [{ rel: [h.id, -4] }] }],
      lapse: [{ rel: [h.id, -2] }] };
  } },
  invitation_tourney: { group: 'lords', gist: 'an invitation to a tourney', raise: ({ state, friends, neutral, pick, treasury }) => {
    const pool = [...friends, ...neutral]; if (!pool.length || treasury < 2000) return null; const h = pick(pool);
    return { title: `A tourney in House ${h.name}`, from: h.lord,
      text: `${state.characters[h.lord].name} proclaims a tourney, a thousand dragons to the champion. Your knights are eager.`,
      options: [
        { label: 'Send your best knights', hint: '800 gold; glory or broken bones', fx: [{ gold: -800 }, { chance: [0.3, [{ gold: 1000 }, { prestige: 6 }, { rel: [h.id, 6] }], [{ prestige: 1 }, { rel: [h.id, 3] }]] }] },
        { label: 'Stay away', hint: 'Coin kept', fx: [] }],
      lapse: [] };
  } },
  ransom_offer: { group: 'lords', gist: 'an enemy offers to ransom one of the lord\'s captured people', raise: ({ state, p, pick }) => {
    const held = Object.values(state.characters).filter((c) => c.alive && c.house === p && /imprisoned|captive/.test(c.status || '')); if (!held.length) return null; const c = pick(held);
    const keeper = state.parties[String(c.loc || '').replace(/^party:/, '')]?.owner || state.holdings[c.loc]?.owner; const h = state.houses[keeper]; if (!h?.lord || keeper === p) return null;
    return { title: `A ransom for ${c.name}`, from: h.lord,
      text: `House ${h.name} will return ${c.name} to you for 3,000 dragons.`,
      options: [
        { label: 'Pay the ransom', hint: `3,000 gold; ${c.name} comes home`, fx: [{ gold: -3000 }, { ops: [{ op: 'character', id: c.id, status: 'free', note: 'Ransomed home.' }] }, { rel: [h.id, 5] }] },
        { label: 'Offer half', hint: 'They may accept', fx: [{ chance: [0.5, [{ gold: -1500 }, { ops: [{ op: 'character', id: c.id, status: 'free', note: 'Ransomed home.' }] }], [{ rel: [h.id, -4] }]] }] },
        { label: 'Refuse', hint: `${c.name} stays a captive`, fx: [] }],
      lapse: [] };
  } },
  defection_offer: { group: 'lords', gist: 'an enemy\'s vassal offers to change sides', raise: ({ state, foes }) => {
    const turncoats = Object.values(state.houses).filter((h) => h.lord && state.characters[h.lord]?.alive && foes.some((f) => f.id === h.liege) && (state.characters[h.lord].loyalty ?? 60) < 50); if (!turncoats.length) return null; const h = turncoats[0];
    return { title: `House ${h.name} would change sides`, from: h.lord,
      text: `${state.characters[h.lord].name}, sworn to your enemy, sends word in secret: for lands and your protection, House ${h.name} will declare for you.`,
      options: [
        { label: 'Accept their fealty', hint: 'A new vassal; your enemy weakened', fx: [{ ops: [{ op: 'liege', house: h.id, liege: state.meta.player }] }, { rel: [h.id, 20] }] },
        { label: 'Take their gold instead, and stay silent', hint: 'They pay for your discretion', fx: [{ gold: 1000 }] },
        { label: 'Refuse: a turncoat turns twice', hint: 'Honour', fx: [{ prestige: 2 }] }],
      lapse: [] };
  } },

  // ── The lord's own household ──
  council_advice_war: { group: 'people', gist: 'the council counsels on a war going badly', raise: ({ state, p, myWars }) => {
    const w = myWars.find((x) => ((x.attackers.includes(p) ? 1 : -1) * (x.score || 0)) < -25); if (!w) return null;
    return { title: 'Your council counsels peace', from: null,
      text: `${w.name} goes badly. Your council is divided: some say sue for peace while there is something left to bargain with; others that the gods favour the bold.`,
      options: [
        { label: 'Hold your course', hint: 'The war goes on', fx: [{ prestige: 1 }] },
        { label: 'Raise more men', hint: '2,000 gold for sellswords and levies', fx: [{ gold: -2000 }, { menAtArms: 300 }] },
        { label: 'Look for peace', hint: 'Your envoys go out (sue for peace from the Diplomacy window)', fx: [] }],
      lapse: [] };
  } },
  steward_famine_warning: { group: 'people', gist: 'the steward warns the stores run low', raise: ({ me, steward }) => {
    const food = Number(me.figures?.food?.v) || 0; if (food > 3) return null;
    return { title: 'The stores run low', from: steward?.id || null,
      text: `${steward ? steward.name : 'Your steward'} warns that the granaries hold ${food <= 1 ? 'barely a moon' : 'less than three moons'} of food. "If the harvest fails, men will eat their boots."`,
      options: [
        { label: 'Buy grain from the Reach', hint: '2,500 gold; two moons of food', fx: [{ gold: -2500 }, { food: 2 }] },
        { label: 'Ration the household and the garrison', hint: 'Unrest rises; food stretches', fx: [{ food: 0.5 }, { unrestAll: 4 }] },
        { label: 'Trust to the harvest', hint: 'Nothing spent', fx: [] }],
      lapse: [] };
  } },
  maester_winter_warning: { group: 'people', gist: 'the maester warns of winter', raise: ({ state, maester }) => {
    if ((state.world?.season || 'summer') === 'summer') return null;
    return { title: 'Winter is coming', from: maester?.id || null,
      text: `${maester ? maester.name : 'Your maester'} has read the Citadel's letters and the signs: the autumn will be short and the winter long. He counsels that a fifth of every harvest be put by.`,
      options: [
        { label: 'Put by a fifth of every harvest', hint: 'Less coin now; more food later', fx: [{ gold: -1000 }, { food: 1.5 }] },
        { label: 'Build new granaries', hint: '2,000 gold', fx: [{ gold: -2000 }, { food: 1 }, { prestige: 1 }] },
        { label: 'The winters were always long; we will manage', hint: 'Nothing spent', fx: [] }],
      lapse: [] };
  } },
  spymaster_plot_found: { group: 'people', gist: 'a plot against the lord uncovered', raise: ({ rivals, pick, state }) => {
    if (!rivals.length) return null; const h = pick(rivals);
    return { title: 'A poisoner in the kitchens', from: null,
      text: `Your guards have taken a cook's boy with a vial of something that is not salt. Under questioning he names a man in the pay of House ${h.name} — or says he does.`,
      options: [
        { label: 'Hang him, and say nothing', hint: 'Quiet; your rival learns nothing', fx: [] },
        { label: `Accuse House ${h.name} openly`, hint: 'Honest; relations sour', fx: [{ rel: [h.id, -20] }] },
        { label: 'Turn him, and send him back', hint: 'A spy in their house — if he stays turned', fx: [{ chance: [0.5, [{ prestige: 2 }], [{ rel: [h.id, -5] }]] }] }],
      lapse: [] };
  } },
  captain_prisoner_escape: { group: 'people', gist: 'a captive nearly escaped', raise: ({ prisoners, pick }) => {
    if (!prisoners.length) return null; const c = pick(prisoners);
    return { title: `${c.name} nearly escaped`, from: null,
      text: `The captain of your guard reports that ${c.name} was taken on the wall with a rope of knotted sheets. A guard was bribed.`,
      options: [
        { label: 'Hang the guard', hint: 'A lesson to the rest', fx: [{ menAtArms: -1 }] },
        { label: 'Chain the prisoner in the deepest cell', hint: 'Safe; their house hears of it', fx: [{ rel: [c.house, -5] }] },
        { label: 'Double the guard', hint: '200 gold', fx: [{ gold: -200 }] }],
      lapse: [] };
  } },
  heir_wants_to_fight: { group: 'people', gist: 'the heir begs to ride with the host', raise: ({ heir, atWar }) => {
    if (!heir || !atWar || (heir.age ?? 0) < 14) return null;
    return { title: `${heir.name} wants to fight`, from: heir.id,
      text: `${heir.name} begs to ride with the host. "Every lord of our house has blooded his sword by my age."`,
      options: [
        { label: 'Let the heir ride', hint: 'Glory — and risk to the succession', fx: [{ prestige: 3 }, { loyalty: [heir.id, 10] }] },
        { label: 'Keep the heir at home', hint: 'Safe, and sulking', fx: [{ loyalty: [heir.id, -8] }] },
        { label: 'Give the heir command of the castle', hint: 'A trust, and a lesson', fx: [{ loyalty: [heir.id, 5] }] }],
      lapse: [] };
  } },
  daughter_refuses_match: { group: 'people', gist: 'a betrothed daughter refuses her match', raise: ({ state, p, isFemale }) => {
    const girl = Object.values(state.characters).find((c) => c.alive && c.house === p && isFemale(c) && c.betrothed && c.age >= 12 && state.characters[c.betrothed]?.alive); if (!girl) return null; const b = state.characters[girl.betrothed];
    return { title: `${girl.name} refuses the match`, from: girl.id,
      text: `${girl.name} says she will not marry ${b.name}, not if you drag her to the sept in chains.`,
      options: [
        { label: 'The match stands', hint: 'Your word kept; a daughter\'s tears', fx: [{ loyalty: [girl.id, -15] }] },
        { label: 'Break the betrothal', hint: `House ${state.houses[b.house]?.name || b.house} insulted`, fx: [{ rel: [b.house, -15] }, { unbetroth: [girl.id] }, { loyalty: [girl.id, 15] }] },
        { label: 'Let her meet him first', hint: 'Time, and perhaps a change of heart', fx: [] }],
      lapse: [] };
  } },
  wife_counsel: { group: 'people', gist: 'the lord\'s spouse counsels caution or boldness', raise: ({ state, lord, atWar }) => {
    const sp = lord?.spouse && state.characters[lord.spouse]; if (!sp?.alive) return null;
    return { title: `${sp.name}'s counsel`, from: sp.id,
      text: `${sp.name} speaks to you alone: ${atWar ? '"The war has taken enough. Think of our children."' : '"You are too trusting. Our neighbours smile, and count our swords."'}`,
      options: [
        { label: 'Heed the counsel', hint: 'A united household', fx: [{ loyalty: [sp.id, 10] }] },
        { label: 'Thank them, and do as you think best', hint: 'Your mind your own', fx: [] }],
      lapse: [] };
  } },

  // ── Raised where they happen ──
  wildling_raid: { group: 'opportunity', gist: 'wildlings burn steadings in the lord\'s lands' },
  lender: { group: 'opportunity', gist: 'the Iron Bank offers a loan' },
  sellswords: { group: 'opportunity', gist: 'a free company offers its swords' },
  wardship: { group: 'opportunity', gist: 'a child lord\'s wardship' },
  liege_call: { group: 'engine', gist: 'the liege calls the banners (shared/vassals.js)' },
  rising: { group: 'engine', gist: 'the smallfolk rise (shared/vassals.js)' },
  defiant_vassal: { group: 'engine', gist: 'a vassal defies the lord (shared/vassals.js)' },
  peace_offered: { group: 'engine', gist: 'the beaten side sues for peace (engine/politics/war.js)' },
  hand_offer: { group: 'canon', gist: 'the King asks Lord Eddard to be his Hand', beat: 'kings_ride.arrival' },
  catspaw: { group: 'canon', gist: 'whose was the dagger?', beat: 'catspaw.assassin' },
  tourney_champion: { group: 'canon', gist: 'send a champion to the Hand\'s tourney', beat: 'hands_tourney.tourney' },
  imp_taken: { group: 'canon', gist: 'the Lannisters answer the taking of Tyrion', beat: 'the_imp.seized' },
  riverlands_burn: { group: 'canon', gist: 'the Riverlands burn: what the river lords do', beat: 'the_imp.burning' },
  last_hunt: { group: 'canon', gist: 'the King rides after the boar', beat: 'last_hunt.boar' },
  ned_choice: { group: 'canon', gist: 'Robert is dead: what the Hand does', beat: 'last_hunt.coup' },
  ned_fate: { group: 'canon', gist: 'what becomes of Eddard Stark', beat: 'crown_justice.baelors_sept' },
  kinginthenorth: { group: 'canon', gist: 'the King in the North', beat: 'king_in_north.crowned' },
  twins: { group: 'canon', gist: 'Lord Walder\'s price', beat: 'five_kings.twins' },
};

/** Every template id: what the `decision` op accepts (and `hook:<id>` for the Director's). */
export const MATTER_IDS = new Set(Object.keys(MATTERS));
