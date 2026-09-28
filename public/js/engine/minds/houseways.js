// The ways of the houses (docs/gdd/09-living-world.md §2.2): what a lord of this house and this nature does now, as
// ordered rules — the first that fits the world and finds a lawful option wins, and every tree ends in holding one's
// counsel. They are the minds' fallback when no model answers, the mock provider's minds (so CI plays the realm with
// them every turn), and the hint a model's mind is given (04 §5.5): "a lord of your nature, whose son is taken,
// answers with force". Deterministic: any chance they take comes from the save's dice.
import { random } from '../rng.js';
import { temperament } from '../../shared/temperament.js';
import { HOUSE_WAYS } from '../../../data/voices.js';
import { optionsFor, HOLD } from './options.js';
import { supplyOf } from '../military/supply.js';
import { archetype, goalsOf } from './goals.js';

// ── helpers over the options: the first lawful pick of a verb that fits ──
const finder = (opts) => (verb, fit = () => true) => {
  const o = opts.options.find((x) => x.verb === verb); if (!o) return null;
  const p = o.picks.find(fit); return p ? { verb, pick: p } : null;
};
// a house's ways take their chances (a feast this week, or not); `eager` — the engine making sure the realm lives —
// takes each rule at its word instead (09 §9)
let eager = false;
const chance = (p) => eager || random() < p;
const hostAt = (w, place) => w.hosts.find((a) => a.at === place && !a.march);
const strength = (w) => w.hosts.reduce((n, a) => n + a.men, 0);
// the first lawful pick of a verb whose choice comes earliest in `order` ("mines before walls before warships")
const prefer = (f, verb, order) => { for (const k of order) { const got = f(verb, (p) => p.choice === k); if (got) return got; } return null; };
// a war that touches this house's neighbours (not any war anywhere in the realm)
const warNear = (w) => (w.state.wars || []).some((x) => x.status !== 'ended' && [...x.attackers, ...x.defenders].some((h) => h === w.house || w.neighbours.some((n) => n.id === h)));
const nearestEnemyHold = (w, a) => w.foes.length ? Object.values(w.state.holdings).filter((h) => w.foes.includes(h.owner)).sort((x, y) => w.miles(x.pos, a.pos) - w.miles(y.pos, a.pos))[0] : null;

// ── the rules every house shares, most pressing first; `T` is the actor's temperament (0..1 scales) ──
// each: [id, (w, find, T) => { verb, pick } | null, why(w, T) → the hint in the house's own terms]
const PRESSING = [
  ['relieve', (w, f) => w.besieged.length && f('march_host', (p) => w.besieged.includes(p.target)), (w) => `${w.state.holdings[w.besieged[0]]?.name} is besieged: a lord relieves his own castle or loses his lords' faith.`],
  ['strike', (w, f, T) => w.atWar && f('attack_host', (p) => { const a = w.state.parties[p.host]; const foe = w.state.parties[p.target.slice(6)]; return a && foe && a.men >= foe.men * (1.45 - T.courage * 0.5); }), () => 'The enemy is in reach and the odds are yours: bring them to battle.'],
  // a host with nothing in its wagons goes back to its own lord's granaries before it starves (engine/military/supply.js)
  ['bread', (w, f) => { const hungry = w.hosts.filter((a) => supplyOf(w.state, a).word !== 'fed' && !w.holdings.includes(a.march?.to)); return hungry.length && f('march_host', (p) => hungry.some((a) => a.id === p.host) && w.holdings.includes(p.target)); }, (w) => `${w.hosts.find((a) => supplyOf(w.state, a).word !== 'fed')?.name || 'Your host'} is hungry: bring it back to your own granaries before the men desert.`],
  ['defend', (w, f) => w.threatened.length && !strength(w) && (f('call_banners') || f('raise_levies', (p) => p.target === w.threatened[0] || p.target === w.seat)), () => 'An enemy host is near your lands and you have none in the field: call up your men.'],
  // (never on one's own liege: that is rebellion, and treachery has its own rules — shared/treachery.js)
  ['avenge', (w, f, T) => w.kinHeld.length && w.captors.length && (T.pride >= 0.6 || T.sway?.family || T.sway?.vengeance) && (f('declare_war', (p) => w.captors.includes(p.target) && !w.foes.includes(p.target) && p.target !== w.me.liege) || f('call_banners') || f('raise_levies')), (w) => `${w.kinHeld[0].name} is a captive: a lord of your blood answers with force and makes the taker's house pay.`],
  ['answer', (w, f, T) => (T.sway?.duty || T.sway?.honour || T.honesty >= 0.6 || w.rel(w.me.liege) >= 40) && f('answer_call'), (w) => `Your liege of House ${w.liege?.name} has called the banners: a sworn lord answers.`],
  // called, and not the kind to hurry: the call is answered in the lord's own time and temper (shared/vassals.js)
  ['called', (w, f) => ['called', 'delayed'].includes(w.me.obligations?.levies) && f(HOLD), (w) => `House ${w.liege?.name} has called the banners; you will answer in your own time.`],
  ['muster', (w, f) => w.atWar && strength(w) < 2000 && w.levies >= 1000 && (f('call_banners') || f('raise_levies', (p) => p.target === w.seat)), () => 'At war with no host worth the name: raise one.'],
  ['blockade', (w, f) => w.atWar && f('blockade'), (w) => 'An enemy port is besieged by land: close it by sea, and it starves.'],
  ['march', (w, f, T) => w.atWar && T.courage >= 0.5 && w.hosts.some((a) => !a.march && a.men >= 3000) && f('march_host', (p) => { const a = w.state.parties[p.host]; const h = nearestEnemyHold(w, a); return a && !a.march && a.men >= 3000 && h && p.target === h.id; }), () => 'At war, a host that sits idle eats its own lands: carry the war to the enemy.'],
  // a prisoner of a house at peace is judged by the keeper's nature: freed by the honest, ransomed by the greedy, kept
  // as a hostage by the cunning (a hostage is leverage)
  ['prisoner', (w, f, T) => w.prisoners.some((c) => !w.foes.includes(c.house)) && (T.guile >= 0.75 ? f(HOLD) : f('judge_prisoner', (p) => !w.foes.includes(w.state.characters[p.target]?.house) && p.choice === (T.honesty >= 0.7 || T.warmth >= 0.7 ? 'release' : 'ransom')) || f(HOLD)), (w, T) => (T.guile >= 0.75 ? `${w.prisoners[0].name} is worth more to you in your cells than out of them.` : 'A prisoner of a house you are not at war with is worth more judged than kept.')],
];
const CALM = [
  ['granaries', (w, f, T) => ['autumn', 'winter'].includes(w.season) && T.wits >= 0.4 && f('fund_works', (p) => p.choice === 'granaries'), () => 'Winter is coming: fill the granaries while there is grain to buy.'],
  ['disband', (w, f) => !w.atWar && !w.threatened.length && chance(0.4) && f('disband_host', (p) => { const a = w.state.parties[p.host]; return a && !a.muster && a.men >= 1000 && a.men < 20000; }), () => 'At peace, the men are needed in the fields, and a host costs coin every day.'],
  ['poor', (w, f, T) => w.gold < 4000 && w.tax !== 'high' && (T.ambition >= 0.6 || T.pride >= 0.7) && f('set_tax', (p) => p.choice === 'high'), () => 'The treasury is thin: the smallfolk will pay more.'],
  ['dues', (w, f, T) => w.liege && w.dues === 'late' && (T.sway?.duty || T.sway?.honour) && f('set_dues', (p) => p.choice === 'paying'), () => 'Your dues are late: a dutiful vassal pays what he owes.'],
  ['liege_gift', (w, f, T) => w.liege && w.rel(w.liege.id) < 25 && w.gold >= 8000 && (T.sway?.duty || T.honesty >= 0.7) && chance(0.3) && f('send_gift', (p) => p.target === w.liege.lord), (w) => `Your liege of House ${w.liege.name} thinks little of you: a gift mends it.`],
  ['court', (w, f, T) => !w.atWar && w.gold >= 15000 && chance(0.35) && (
    (T.pride >= 0.7 && chance(0.5) && f('hold_tourney')) || (T.warmth >= 0.5 && f('hold_feast')) ||
    (T.wits >= 0.6 && prefer(f, 'fund_works', ['market', 'roads', 'harbour', 'granaries', 'walls'])) || f('hold_feast')), () => 'The realm is at peace and your coffers full: a lord is seen to be generous, or builds.'],
  ['envoy', (w, f) => !w.atWar && chance(0.12) && f('send_person'), () => 'A lord keeps his friends close: send one of your household to their court.'],
];
// a lord works at what they want when nothing presses (engine/minds/goals.js): the first lawful next step of their
// most pressing goal
const GOAL = ['goal', (w, f) => { if (!chance(0.25)) return null; for (const g of goalsOf(w.state, w.actor)) for (const v of g.steps) { const got = f(v); if (got) return got; } return null; }, (w) => `You work at what you want: ${goalsOf(w.state, w.actor)[0]?.text || 'your house\'s good'}.`];

// ── each great house's own ways, tried before the common rules (09 §2.2; data/voices.js HOUSE_WAYS) ──
const WAYS = {
  lannister: [
    ['answer_insult', (w, f, T) => w.kinHeld.length && (f('call_banners') || f('raise_levies', (p) => p.target === w.seat)), (w) => `${w.kinHeld[0].name} is taken: a Lannister pays his debts — call the banners, and make the Riverlands bleed for it.`, 'pressing'],
    ['gold_first', (w, f) => !w.atWar && w.gold >= 60000 && chance(0.15) && prefer(f, 'fund_works', ['mines', 'walls', 'warships']), () => 'Use gold before swords: the Rock grows stronger while others squander.'],
  ],
  stark: [
    ['honour_kin', (w, f) => w.kinHeld.length && (f('call_banners') || f('raise_levies')), (w) => `${w.kinHeld[0].name} is taken: the North is slow to anger, and relentless once roused.`, 'pressing'],
    ['winter', (w, f) => w.season !== 'summer' && f('fund_works', (p) => p.choice === 'granaries'), () => 'Winter is coming: the North fills its granaries before anything else.'],
  ],
  greyjoy: [
    ['iron_price', (w, f) => w.atWar && (f('raid_coast') || f('march_host', (p) => w.foes.includes(w.state.holdings[p.target]?.owner))), () => 'We do not sow: take what is weak, and pay the iron price for it.', 'pressing'],
    ['longships', (w, f) => !w.atWar && chance(0.2) && f('fund_works', (p) => p.choice === 'warships'), () => 'Count the longships, and build more: the ironborn wait for their moment.'],
  ],
  tully: [
    ['daughters', (w, f) => ['stark', 'arryn'].some((h) => (w.state.wars || []).some((x) => x.status !== 'ended' && [...x.attackers, ...x.defenders].includes(h))) && f('call_banners'), () => 'Family, duty, honour: the houses of your daughters are at war — hold the rivers ready.', 'pressing'],
    ['quarrels', (w, f) => !w.atWar && chance(0.15) && (f('send_person', (p) => p.leader === 'edmure_tully') || f('send_person')), () => 'Keep the quarrelsome river lords together: send your son among them.'],
  ],
  arryn: [
    ['bloody_gate', (w, f) => (w.threatened.length || warNear(w) || w.kinHeld.length) && !strength(w) && (f('raise_levies') || f(HOLD)), () => 'Hoard your knights behind the Bloody Gate: trust no one, and let no one in.', 'pressing'],

  ],
  baratheon: [
    ['kings_tourney', (w, f) => !w.atWar && w.gold >= 20000 && chance(0.3) && (f('hold_tourney') || f('hold_feast')), () => 'The King would rather feast and fight in the lists than sit in council; the debts mount.'],
  ],
  baratheon_se: [
    ['renly_court', (w, f) => !w.atWar && chance(0.3) && (f('hold_feast') || f('hold_tourney')), () => 'Charm and feasts: the young lords of the Reach and the Stormlands love you for it.'],
  ],
  baratheon_ds: [
    ['the_law', (w, f) => w.prisoners.length && f('judge_prisoner', (p) => p.choice === 'take_the_black' || p.choice === 'execute'), () => 'The law, grimly and to the letter.', 'pressing'],
    ['ships', (w, f) => !w.atWar && chance(0.2) && f('fund_works', (p) => p.choice === 'warships'), () => 'Dragonstone is an island; its strength is its ships.'],
  ],
  tyrell: [
    ['grow_strong', (w, f) => !w.atWar && chance(0.3) && (prefer(f, 'fund_works', ['market', 'granaries', 'roads']) || f('hold_feast')), () => 'Grow strong: feed the realm at a price, and feast the lords who will matter.'],
  ],
  martell: [
    ['patience', (w, f) => w.threatened.length && !strength(w) && f('raise_levies'), () => 'Unbowed, unbent, unbroken: patient — but the mountains are held.', 'pressing'],
    ['kin_patience', (w, f) => w.kinHeld.length && (f('raise_levies') || f(HOLD)), (w) => `${w.kinHeld[0].name} is a captive: Dorne gathers its strength, and waits for the moment.`, 'pressing'],
  ],
  frey: [
    ['tolls', (w, f) => w.tax !== 'high' && chance(0.3) && f('set_tax', (p) => p.choice === 'high'), () => 'The crossing pays: raise the toll, and let them wait at the gate.'],
    ['kin_price', (w, f) => w.kinHeld.length && (f('raise_levies') || f(HOLD)), () => 'Walder Frey has sons to spare, and weighs what each is worth.', 'pressing'],
    ['late', (w, f) => ['called', 'delayed'].includes(w.me.obligations?.levies) && f(HOLD), () => 'Late to every war: let the liege wait, and see who is winning.', 'pressing'],
    ['weddings', (w, f) => !w.atWar && w.gold >= 10000 && chance(0.15) && f('hold_feast'), () => 'Another wedding at the Twins: a Frey marries, and the Freys are remembered.'],
  ],
  bolton: [
    ['patience', (w, f) => w.threatened.length && f('raise_levies'), () => 'Our blades are sharp: cold patience, and men ready when it pays.', 'pressing'],
  ],
  manderly: [
    ['galleys', (w, f) => !w.atWar && chance(0.25) && prefer(f, 'fund_works', ['warships', 'harbour']), () => 'White Harbor grows rich on the sea: build galleys, and remember who took us in.'],
  ],
  nights_watch: [
    ['recruits', (w, f) => !Object.values(w.state.parties).some((a) => a.kind === 'rider' && w.state.characters[a.commander]?.house === 'nights_watch') && chance(0.4) && f('send_person'), () => 'The Watch begs for men: send a recruiter south to the cities and the dungeons.'],
  ],
  free_folk: [
    ['clans', (w, f) => chance(0.3) && f('raise_levies'), () => 'Gather every clan of the free folk before the dead come: none will come alone.'],
  ],
  // ── the great bannermen and the houses beyond the sea (WP D6) ──
  velaryon: [
    ['tides', (w, f) => !w.atWar && chance(0.2) && prefer(f, 'fund_works', ['warships', 'harbour']), () => 'The Lords of the Tides live by their ships: build them.'],
  ],
  karstark: [
    ['first_to_answer', (w, f) => f('answer_call'), (w) => `House ${w.liege?.name} calls: a Karstark is never last to the muster.`, 'pressing'],
    ['vengeance', (w, f) => w.kinHeld.length && (f('raise_levies') || f('call_banners')), (w) => `${w.kinHeld[0].name} is taken: the Karstarks do not forgive.`, 'pressing'],
  ],
  umber: [
    ['wildlings', (w, f) => w.threatened.length && (f('raise_levies') || f('hire_men')), () => 'Wildlings on your lands: the Umbers meet them with axes.', 'pressing'],
    ['loud', (w, f) => f('answer_call'), () => 'The Starks call: the Greatjon comes roaring.', 'pressing'],
  ],
  harlaw: [
    ['books', (w, f) => !w.atWar && chance(0.2) && prefer(f, 'fund_works', ['market', 'walls']), () => 'The Reader keeps Harlaw rich and quiet while louder men shout.'],
  ],
  blackwood: [
    ['feud', (w, f) => w.rel('bracken') <= -30 && chance(0.1) && f('raise_levies', (p) => p.target === w.seat), () => 'The Brackens are across the river, as they have always been: keep your archers ready.'],
    ['old_gods', (w, f) => f('answer_call'), (w) => `Riverrun calls: the Blackwoods answer, and remember who did not.`, 'pressing'],
  ],
  bracken: [
    ['feud', (w, f) => w.rel('blackwood') <= -30 && chance(0.1) && f('raise_levies', (p) => p.target === w.seat), () => 'The Blackwoods took what was yours: keep your horsemen ready.'],
    ['horses', (w, f) => !w.atWar && chance(0.15) && f('hire_men'), () => 'Stone Hedge breeds the best horses in the Riverlands: mount men on them.'],
  ],
  mallister: [
    ['seagard', (w, f) => !w.atWar && chance(0.2) && prefer(f, 'fund_works', ['walls', 'warships']), () => 'Seagard was built against the ironborn: keep its walls high and its ships ready.'],
  ],
  royce: [
    ['bronze', (w, f) => f('answer_call'), () => 'Bronze Yohn answers his liege — and tells her what he thinks of her.', 'pressing'],
    ['runes', (w, f) => !w.atWar && chance(0.2) && f('hold_tourney'), () => 'The Royces are the Vale\'s first knights: hold the lists and prove it.'],
  ],
  waynwood: [
    ['steady', (w, f) => !w.atWar && chance(0.15) && f('send_gift', (p) => p.target === w.liege?.lord), () => 'Keep the Vale\'s lords together; a gift to the Eyrie keeps the peace.'],
  ],
  corbray: [
    ['lady_forlorn', (w, f) => !w.atWar && chance(0.15) && f('hold_tourney'), () => 'Lady Forlorn is a sword for the lists: let the Vale see it.'],
  ],
  marbrand: [
    ['marches', (w, f) => f('answer_call'), () => 'Ashemark guards the West\'s marches: when Casterly Rock calls, you ride first.', 'pressing'],
  ],
  lefford: [
    ['golden_tooth', (w, f) => (w.threatened.length || warNear(w)) && prefer(f, 'fund_works', ['walls']), () => 'The Golden Tooth is the West\'s gate: make it stronger while there is time.', 'pressing'],
  ],
  crakehall: [
    ['boar', (w, f) => f('answer_call'), () => 'The Crakehalls ride where the Lannisters point.', 'pressing'],
  ],
  hightower: [
    ['beacon', (w, f) => !w.atWar && chance(0.2) && prefer(f, 'fund_works', ['market', 'harbour', 'walls']), () => 'Oldtown grows rich in peace: build, trade, and let others bleed.'],
  ],
  redwyne: [
    ['fleet', (w, f) => w.atWar && f('blockade'), () => 'The Redwyne fleet is the Reach\'s sword at sea: close the enemy\'s ports.', 'pressing'],
    ['wine', (w, f) => !w.atWar && chance(0.2) && prefer(f, 'fund_works', ['warships', 'harbour']), () => 'Arbor gold pays for ships: keep the fleet the strongest after the King\'s.'],
  ],
  tarly: [
    ['discipline', (w, f) => f('answer_call'), (w) => `House ${w.liege?.name} calls: Lord Randyll answers at once, and in good order.`, 'pressing'],
    ['drill', (w, f) => !w.atWar && chance(0.15) && f('hire_men'), () => 'Discipline wins wars: keep men drilled and ready.'],
  ],
  florent: [
    ['stannis', (w, f) => (w.state.wars || []).some((x) => x.status !== 'ended' && [...x.attackers, ...x.defenders].includes('baratheon_ds')) && f('raise_levies', (p) => p.target === w.seat), () => 'Your niece\'s lord husband is at war: the Florents stand ready.', 'pressing'],
  ],
  rowan: [
    ['golden_tree', (w, f) => f('answer_call'), () => 'The Rowans serve the Reach honestly: answer the call.', 'pressing'],
  ],
  dayne: [
    ['starfall', (w, f) => w.threatened.length && f('raise_levies'), () => 'Starfall holds for its young lord: raise the spears.', 'pressing'],
  ],
  yronwood: [
    ['bloodroyal', (w, f) => !w.atWar && chance(0.15) && (f('hire_men') || f('hold_feast')), () => 'The Yronwoods were kings before the Martells: keep your strength, and let Sunspear remember it.'],
  ],
  dothraki: [
    ['khalasar', (w, f) => w.atWar && f('march_host', (p) => w.foes.includes(w.state.holdings[p.target]?.owner)), () => 'A khalasar that does not ride is not a khalasar: ride, and take.', 'pressing'],
  ],
  targaryen: [
    ['the_blood', (w, f) => chance(0.15) && f('send_person'), () => 'The last dragons must find friends: send word to those who remember.'],
  ],
  stone_crows: [
    ['clans', (w, f) => w.threatened.length && f('raise_levies'), () => 'The Stone Crows take what passes on the high road.', 'pressing'],
  ],
};

// ── lords without a house's ways of their own play their nature (engine/minds/goals.js archetype) ──
const ARCHETYPE = {
  ambitious: [['ambition', (w, f) => !w.atWar && chance(0.25) && (prefer(f, 'fund_works', ['mines', 'market', 'roads']) || f('set_tax', (p) => p.choice === 'high')), () => 'An ambitious lord builds his house\'s fortune, whatever the smallfolk say.']],
  martial: [['arms', (w, f) => !w.atWar && chance(0.15) && (f('hold_tourney') || f('hire_men')), () => 'A lord who loves a fight keeps men and horses ready, and a tourney now and then.']],
  cautious: [['careful', (w, f) => w.threatened.length && f('raise_levies'), () => 'A careful lord keeps his men close and his gates shut.', 'pressing']],
  dutiful: [['duty', (w, f) => w.liege && w.dues && w.dues !== 'paying' && f('set_dues', (p) => p.choice === 'paying'), () => 'A dutiful vassal pays his dues and answers his liege.']],
  steady: [],
};

/** The rules a lord of this house and nature tries, in order: what presses (their house's own answer first), then
 * the calm of their house's ways, their nature's, and everyone's. */
export function rulesFor(state, actorId) {
  const c = state.characters[actorId]; const T = temperament(c);
  const own = [...(WAYS[c.house] || []), ...(ARCHETYPE[archetype(T)] || [])];
  const pressing = own.filter((r) => r[3] === 'pressing'); const calm = own.filter((r) => r[3] !== 'pressing');
  return { T, rules: [...pressing, ...PRESSING, ...calm, ...CALM, GOAL], archetype: archetype(T) };
}

/**
 * What the house's ways choose for this actor now: { verb, params, rule, why, pick } — `hold` when nothing fits.
 * `opts` are the actor's options (optionsFor), built once and shared with the model's dossier.
 */
export function treeChoice(state, actorId, opts = optionsFor(state, actorId), { eager: keen = false } = {}) {
  const w = opts.view; if (!w) return { verb: HOLD, params: {}, rule: 'none', why: 'Nothing to decide.' };
  const { T, rules } = rulesFor(state, actorId); const f = finder(opts);
  eager = keen;
  try {
    for (const [id, when, why] of rules) {
      const got = when(w, f, T);
      if (got && got.verb) return { verb: got.verb, params: { ...got.pick.params }, pick: got.pick, rule: id, why: why(w, T) };
    }
  } finally { eager = false; }
  return { verb: HOLD, params: {}, rule: 'hold', why: HOUSE_WAYS[w.house] || 'Nothing presses: keep your counsel.' };
}

/**
 * The hint line a model's mind is given (04 §5.5): what a person of this nature and house does in this situation —
 * the tree's own choice and its reason, and the house's ways. The model may choose otherwise.
 */
export function hintFor(state, actorId, choice) {
  const c = state.characters[actorId]; const ways = HOUSE_WAYS[c?.house];
  const what = choice.verb === HOLD ? `would keep ${c?.sex === 'f' ? 'her' : 'his'} counsel this week` : `would most likely ${VERB_WORDS[choice.verb] || choice.verb.replace(/_/g, ' ')}`;
  return `${choice.rule === 'hold' ? '' : `${choice.why} `}A ${c?.sex === 'f' ? 'lady' : 'lord'} of your nature ${what}.${ways ? ` Your house's way: ${ways}` : ''}`;
}
const VERB_WORDS = { raid_coast: 'send the longships raiding', blockade: 'close an enemy port with the fleet', answer_call: 'answer the call', call_banners: 'call the banners', raise_levies: 'raise levies', march_host: 'march', attack_host: 'give battle', halt_host: 'halt the host', merge_hosts: 'join the hosts', disband_host: 'send the men home', send_person: 'send someone of the household', set_tax: 'change the taxes', set_dues: 'change the dues', fund_works: 'build', hire_men: 'hire men', send_gift: 'send a gift', hold_feast: 'hold a feast', hold_tourney: 'hold a tourney', judge_prisoner: 'judge a prisoner', declare_war: 'declare war' };

/** Every great house (and the houses whose ways the story leans on) has ways of its own (B7 gate). */
export const HOUSES_WITH_WAYS = Object.keys(WAYS);
