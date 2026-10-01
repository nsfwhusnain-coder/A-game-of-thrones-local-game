// Headlines, part two: the deterministic writer (docs/gdd/18-headlines.md §3.1, §3.3, §4, §5 row N3, §6; WP N3).
// The engine's log lines were written for the ledger; the writer tells a story from its facts' SLOTS (who, where, what
// data) into a card a stranger can read: a headline that says what happened, a plain summary, and the numbers
// kept for the "Details" fold. It is the floor under the narrator (N5): the mock returns it, and a model that fails
// leaves it standing, so `scoreCard` (N1) holds it to every rule with no model in sight. The contract these tests read:
//
//   public/js/engine/facts/heads.js      HEAD   kind → (f, s, ctx) => headline string     (an entry for every kind of importance ≥ 3)
//                                        SUM    kind → (f, s, ctx) => 1–2 sentences        (likewise)
//                                        ROLES  who is victim and agent, per kind (moved from server/ai/validate/headline.js, which imports it back)
//                                        LEDE   kind → a rank that decides which fact leads a story when importances tie (C4)
//                                        ARCHETYPE kind → muster march battle siege death capture court wedding letter plot omen works harvest feast other
//   public/js/engine/facts/headline.js   cardOf(state, story) → { headline, summary, details: [strings], kind, archetype, who: [ids], where }
//                                        meanwhileOf(state, facts) → one sentence (≤ 200 chars, a full stop, ≤ 3 clauses, no boilerplate), '' for no facts
//   `story` is what engine/facts/cluster.js makes ({ id, facts, importance, place, days, actors, houses, type, pov }, and
//   after N4 archetype, lead and rolled); cardOf works from the facts alone, so a story without the N4 fields gets the
//   same card as one with them (N6 makes cards for old saves from bare fact lists).
//   The writer builds ONLY from slots (actors, houses, place, data, day): never from f.text or f.title (poisoned below).
//   Numbers are for `details`; a fact about a house that is not the viewer's own, a vassal's or an ally's is told to two
//   significant figures ("about 10,000", never "9,977"; B-32c). The viewer is state.meta.player. Verb forms are picked by
//   a hash of the fact id, never by dice, so the same fact reads the same in every game and on every machine.
//   Tense is D-058: news-headline present or a bare participle, as the scorer enforces.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.WC_PROVIDER = 'mock';
const { createInitialState } = await import('../public/js/shared/world.js');
const { KINDS } = await import('../public/js/engine/facts/kinds.js');
const { friendsOf } = await import('../public/js/engine/knowledge.js');
const { dayNumber } = await import('../public/js/engine/time.js');
const { clusterFacts } = await import('../public/js/engine/facts/cluster.js');
const STYLE = await import('../public/data/style.js');
const V = await import('../server/ai/validate/headline.js'); // the scorer (N1); `ROLES` moves out of it in N3
const { scoreCard, entitiesIn } = V;
const { GAME_WORDS } = await import('../server/ai/validate/narration.js');

// The writer is not written yet when these tests are: a missing module fails the test that needs it, with the reason
const tryImport = async (p) => { try { return await import(p); } catch (e) { return { __error: e }; } };
const H = await tryImport('../public/js/engine/facts/heads.js');
const W = await tryImport('../public/js/engine/facts/headline.js');
const need = (m, what) => { if (m.__error) assert.fail(`${what} cannot be imported: ${String(m.__error.message).split('\n')[0]}`); return m; };

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const load = (name) => JSON.parse(fs.readFileSync(path.join(here, 'fixtures', 'headlines', `${name}.json`), 'utf8'));
const GOLDEN = load('golden');
const TURNS = { muster: load('turns/stark-muster-6'), quiet: load('turns/stark-quiet-6') };

// ── The world, the days, and facts as the emitters make them ─────────────────────────────────────────────────────────
const D0 = dayNumber({ year: 298, month: 8, day: 1 });
const D = (n) => D0 + n; // day n of the turn under test
const newState = (seed = 7) => { const s = createInitialState('agot_298', 'stark', { seed }); s.meta.clock = { turn: 1, from: D0 + 1, to: D0 + 7 }; return s; };
const state = newState();
const viewedBy = (house, more = (s) => s) => { const s = structuredClone(state); s.meta.player = house; return more(s); };
const deepFreeze = (o) => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); } return o; };
const wordsIn = (t) => String(t).trim().split(/\s+/).filter(Boolean);
const ARCHETYPES = ['muster', 'march', 'battle', 'siege', 'death', 'capture', 'court', 'wedding', 'letter', 'plot', 'omen', 'works', 'harvest', 'feast', 'other'];

let seq = 0;
/** A fact as engine/facts/log.js emit() makes it (the engine's own line is neutral: the writer must not read it). */
const mk = (kind, o = {}) => ({
  id: o.id || `f1.${++seq}`, turn: 1, day: o.day ?? D(o.on ?? 3), kind, actors: o.actors || [], houses: o.houses || [],
  ...(o.place ? { place: o.place } : {}), ...(o.data ? { data: o.data } : {}), ...(o.cause ? { cause: o.cause } : {}), ...(o.thread ? { thread: o.thread } : {}),
  vis: { scope: KINDS[kind].vis }, importance: o.importance ?? KINDS[kind].importance, text: o.text || 'A line the engine wrote for its ledger.',
});
/** A story as cluster.js story() builds it (no N4 fields unless asked). */
function storyOf(facts, extra = {}) {
  const top = [...facts].sort((a, b) => b.importance - a.importance)[0];
  const actors = [...new Set(facts.flatMap((f) => f.actors))].filter((a) => state.characters[a]);
  const day = (f) => Math.max(1, f.day - D0);
  return {
    id: 'S1', facts, importance: top.importance, place: top.place || facts.find((f) => f.place)?.place || null, days: [day(facts[0]), day(facts.at(-1))], actors,
    houses: [...new Set(facts.flatMap((f) => f.houses))], type: KINDS[top.kind].type, pov: { name: 'a witness of the place' }, ...extra,
  };
}
const fromGolden = (id, kind, o = {}) => { const g = GOLDEN.find((b) => b.id === id); const f = g.facts.find((x) => x.kind === kind); return mk(kind, { actors: f.actors, houses: f.houses, place: f.place, data: f.data, ...o }); };

// A plausible fact of every kind, with the slots the emitters (and N2) give it and real ids from the scenario; a kind with
// more than one shape has a list. The real emit sites are in public/js, server/turn and server/*.js.
const G = fromGolden;
const SYN = {
  set_out: [{ actors: ['rickard_karstark'], houses: ['karstark', 'stark'], place: 'karstark', data: { party: 'host_of_house_karstark', to: 'stark', eta: D(48) } },
    { actors: ['stannis_baratheon'], houses: ['baratheon_ds', 'greyjoy'], data: { party: 'dragonstone_fleet', against: 'iron_fleet', days: 9 } },
    { actors: ['alester_florent'], houses: ['florent', 'tyrell'], place: 'florent', data: { party: 'rider_florent', to: 'tyrell', why: 'to feast with Mace Tyrell at Highgarden' } }],
  returned: { actors: ['alester_florent'], houses: ['florent'], place: 'florent', data: { party: 'rider_florent' } },
  arrived: [{ actors: ['jon_snow'], houses: ['stark'], place: 'nights_watch', data: { party: 'jon_snow_party', men: 6, kind: 'retinue' } },
    { actors: ['roose_bolton'], houses: ['bolton', 'stark'], place: 'stark', data: { party: 'host_of_house_bolton', men: 2300, kind: 'host' } }],
  turned_back: { actors: ['roose_bolton'], houses: ['bolton'], data: { party: 'host_of_house_bolton', halted: true } },
  met_on_road: { actors: ['tyrion_lannister'], houses: ['lannister'], place: 'stark' },
  crossed: { actors: ['tywin_lannister'], houses: ['lannister'], place: 'lefford', data: { party: 'party_tywin_lannister', men: 228 } },
  delayed: { actors: ['jonnel_crowl'], houses: ['crowl'], data: { party: 'host_of_house_crowl', why: 'ships', wait: 33, lender: 'manderly' } },
  embarked: { actors: ['maege_mormont'], houses: ['mormont'], data: { party: 'host_of_house_mormont', men: 499, ships: 5, days: 5 } },
  landed: { actors: ['maege_mormont'], houses: ['mormont'], place: 'glover', data: { party: 'host_of_house_mormont', men: 499 } },
  lost_at_sea: { actors: [], houses: ['greyjoy'], place: 'greyjoy', data: { party: 'iron_fleet', ships: 3, drowned: 600 } },
  levies_called: [{ actors: ['robert_arryn'], houses: ['arryn'], place: 'arryn', data: { party: 'arryn_host_the_eyrie', men: 9977, now: 9977 } },
    { actors: ['eddard_stark'], houses: ['stark', 'bolton', 'karstark', 'umber'], place: 'stark', data: { vassals: ['bolton', 'karstark', 'umber'], muster: 'stark' } }],
  call_answered: [{ actors: ['greatjon_umber', 'smalljon_umber'], houses: ['umber', 'stark'], place: 'umber', data: { men: 2000, party: 'host_of_house_umber', to: 'stark', depart: D(12) } },
    { actors: ['jonnel_crowl'], houses: ['crowl'], place: 'crowl', data: { men: 120, party: 'host_of_house_crowl', to: 'stark' } }],
  call_delayed: { actors: ['helman_tallhart'], houses: ['tallhart', 'stark'], place: 'tallhart', data: { retry: D(20) } },
  call_refused: { actors: ['donella_hornwood'], houses: ['hornwood'], place: 'hornwood', data: { liege: 'stark', why: 'the harvest is not yet in' } },
  muster_grew: { actors: ['wyman_manderly'], houses: ['manderly'], place: 'manderly', data: { party: 'host_of_house_manderly', men: 273, total: 573 } },
  host_formed: { actors: ['wyman_manderly'], houses: ['manderly'], place: 'manderly', data: { party: 'host_of_house_manderly', men: 300, kind: 'host' } },
  host_joined: { actors: ['medger_cerwyn'], houses: ['cerwyn', 'stark'], place: 'stark', data: { party: 'host_of_house_cerwyn', host: 'stark_banners_stark', men: 399 } },
  host_split: { actors: ['medger_cerwyn'], houses: ['cerwyn', 'stark'], place: 'stark', data: { party: 'stark_banners_stark', from: 'stark_banners_stark', men: 400 } },
  host_disbanded: { actors: ['roose_bolton'], houses: ['bolton'], place: 'bolton', data: { party: 'bolton_host_the_dreadfort', name: 'The Host of The Dreadfort', men: 1463, why: 'disbanded' } },
  desertion: { actors: ['howland_reed'], houses: ['reed', 'stark'], place: 'stark', data: { party: 'stark_banners_stark', men: 400, why: 'weary of the war' } },
  host_hungry: { actors: ['medger_cerwyn'], houses: ['stark'], place: 'stark', data: { party: 'stark_banners_stark', men: 10994 } },
  land_stripped: { actors: [], houses: ['tully'], place: 'tully', data: { party: 'host_lannister', holding: 'tully' } },
  camp_fever: { actors: ['medger_cerwyn'], houses: ['stark'], place: 'stark', data: { party: 'stark_banners_stark', lost: 31, men: 10994 } },
  battle: [() => G('g-battle-01', 'battle'), () => G('g-battle-03', 'battle')],
  rout: { actors: ['roose_bolton'], houses: ['bolton', 'lannister'], place: 'frey', data: { party: 'host_bolton' } },
  withdrew: { actors: ['tywin_lannister'], houses: ['lannister', 'stark'], place: 'tully', data: { party: 'host_lannister', from: 'host_stark', to: 'lannister' } },
  stand_off: { actors: ['robb_stark', 'tywin_lannister'], houses: ['stark', 'lannister'], place: 'frey', data: { a: 'host_stark', b: 'host_lannister' } },
  captured_in_battle: [() => G('g-capture-01', 'captured_in_battle')],
  slain_in_battle: [() => G('g-slain-01', 'slain_in_battle'), () => G('g-slain-03', 'slain_in_battle')],
  siege_begun: [() => G('g-siege-01', 'siege_begun')],
  siege_tick: { actors: ['jaime_lannister'], houses: ['lannister', 'tully'], place: 'tully', data: { holding: 'tully', by: 'lannister', days: 12 } },
  sally: { actors: ['edmure_tully'], houses: ['tully', 'lannister'], place: 'tully', data: { holding: 'tully', hurt: 220 } },
  storm_assault: [() => G('g-fell-03', 'storm_assault'), { actors: ['gregor_clegane'], houses: ['clegane', 'darry'], place: 'darry', data: { holding: 'darry', by: 'clegane', carried: false, lost: 400, odds: 0.8 } }],
  holding_fell: [() => G('g-fell-01', 'holding_fell')],
  siege_lifted: { actors: ['jaime_lannister'], houses: ['lannister', 'tully'], place: 'tully', data: { holding: 'tully', by: 'lannister' } },
  relief_near: { actors: ['edmure_tully', 'jaime_lannister'], houses: ['tully', 'lannister'], place: 'tully', data: { holding: 'tully', relief: 'host_tully', men: 4000 } },
  terms_offered: { actors: ['tywin_lannister', 'shella_whent'], houses: ['lannister', 'whent'], place: 'whent', data: { holding: 'whent', terms: 'yield_and_swear', accepted: false } },
  terms_refused: { actors: ['shella_whent'], houses: ['lannister', 'whent'], place: 'whent', data: { holding: 'whent', terms: 'yield_and_swear' } },
  raid: { actors: ['balon_greyjoy'], houses: ['greyjoy', 'mallister'], place: 'mallister', data: { fleet: 'iron_fleet', loot: 3400 } },
  village_burned: { actors: [], houses: ['greyjoy', 'goodbrook'], place: 'goodbrook', data: { holding: 'goodbrook', by: 'greyjoy' } },
  blockade: { actors: ['balon_greyjoy'], houses: ['greyjoy', 'mallister'], place: 'mallister', data: { fleet: 'iron_fleet', holding: 'mallister' } },
  sea_battle: { actors: ['stannis_baratheon', 'balon_greyjoy'], houses: ['baratheon_ds', 'greyjoy'], place: 'greyjoy', data: { attacker: 'dragonstone_fleet', defender: 'iron_fleet', winner: 'dragonstone_fleet', loser: 'iron_fleet', ships: { dragonstone_fleet: 3, iron_fleet: 14 }, prizes: 2, odds: 1.4 } },
  sellswords_hired: { actors: [], houses: ['lannister'], data: { party: 'golden_company_host', by: 'lannister', price: 4000 } },
  sellswords_turned: { actors: [], houses: ['lannister', 'baratheon'], data: { party: 'golden_company_host', from: 'baratheon', to: 'lannister', price: 5000 } },
  outlaws_rise: { actors: [], houses: ['darry'], place: 'darry', data: { holding: 'darry', men: 60 } },
  outlaws_scattered: { actors: [], houses: ['darry'], place: 'darry', data: { holding: 'darry', men: 60 } },
  men_hired: { actors: ['randyll_tarly'], houses: ['tarly'], place: 'tarly', data: { party: 'tarly_horn_hill_company', men: 200, cost: 1800 } },
  ambush: { actors: ['rodrik_ryswell'], houses: ['ryswell'], place: 'ryswell', data: { party: 'host_of_house_ryswell', men: 51 } },
  war_declared: { actors: ['tywin_lannister', 'hoster_tully'], houses: ['lannister', 'tully'], data: { war: 'lannister_vs_tully', attackers: ['lannister'], defenders: ['tully'], reason: 'The seizure of Tyrion Lannister' } },
  war_joined: { actors: ['robb_stark'], houses: ['stark', 'tully'], data: { war: 'lannister_vs_tully', side: 'defenders' } },
  peace_made: { actors: ['tywin_lannister', 'hoster_tully'], houses: ['lannister', 'tully'], data: { war: 'lannister_vs_tully', terms: 'white peace' } },
  pact_made: { actors: ['robb_stark', 'walder_frey'], houses: ['stark', 'frey'], data: { type: 'alliance', pact: 'p2' } },
  pact_broken: { actors: ['walder_frey'], houses: ['frey', 'stark'], data: { type: 'alliance', pact: 'p2' } },
  fealty_sworn: { actors: ['walder_frey', 'hoster_tully'], houses: ['frey', 'tully'], place: 'frey', data: { liege: 'tully' } },
  fealty_renounced: { actors: ['roose_bolton'], houses: ['bolton', 'stark'], place: 'bolton', data: { liege: 'stark', to: 'lannister' } },
  crowned: [() => G('g-crown-01', 'crowned')],
  claim_proclaimed: [() => G('g-crown-02', 'claim_proclaimed')],
  office_granted: { actors: ['eddard_stark', 'robert_baratheon'], houses: ['stark', 'baratheon'], data: { office: 'hand', title: 'Hand of the King' } },
  office_stripped: { actors: ['eddard_stark', 'robert_baratheon'], houses: ['stark', 'baratheon'], data: { office: 'hand', title: 'Hand of the King' } },
  holding_granted: { actors: ['robert_baratheon', 'tywin_lannister'], houses: ['baratheon', 'lannister'], place: 'whent', data: { holding: 'whent', to: 'lannister' } },
  attainder: { actors: ['roose_bolton'], houses: ['bolton', 'baratheon'], data: { reason: 'rebellion against the crown' } },
  house_ended: { actors: [], houses: ['whent'], place: 'whent', data: { reason: 'the last of its line is dead' } },
  death: [{ actors: ['rickard_karstark'], houses: ['karstark'], place: 'karstark', data: { cause: 'old age', age: 61, how: 'age' } },
    { actors: ['old_nan'], houses: ['stark'], place: 'stark', data: { cause: 'a fever', age: 94, how: 'fever' } },
    { actors: ['wendel_manderly'], houses: ['manderly'], place: 'cerwyn', data: { cause: 'a lance through the throat in the lists', how: 'wound' } }],
  birth: { actors: ['rickon_stark'], houses: ['stark'], place: 'stark' },
  betrothal: [() => G('g-wed-01', 'betrothal')],
  wedding: [() => G('g-wed-02', 'wedding')],
  captured: [() => G('g-capture-03', 'captured')],
  released: { actors: ['tyrion_lannister'], houses: ['lannister', 'arryn'], place: 'arryn', data: { by: 'arryn' } },
  ransomed: { actors: ['edmure_tully', 'hoster_tully'], houses: ['tully', 'lannister'], place: 'tully', data: { gold: 50000, by: 'lannister' } },
  executed: [() => G('g-exec-01', 'executed'), () => G('g-exec-02', 'executed')],
  sent_to_wall: { actors: ['jon_snow'], houses: ['stark', 'nights_watch'] },
  hostage_taken: { actors: ['theon_greyjoy'], houses: ['greyjoy', 'stark'], place: 'stark', data: { by: 'stark' } },
  ward_fostered: { actors: ['theon_greyjoy'], houses: ['greyjoy', 'stark'], place: 'stark', data: { by: 'stark' } },
  wounded: { actors: ['bran_stark'], houses: ['stark'], place: 'stark', data: { note: 'Fell from the broken tower.' } },
  illness: { actors: ['joffrey_baratheon'], houses: ['baratheon'], place: 'baratheon', data: { why: 'strain' } },
  recovered: { actors: ['bran_stark'], houses: ['stark'], place: 'stark' },
  came_of_age: { actors: ['robb_stark'], houses: ['stark'], place: 'stark' },
  succession: [() => G('g-death-01', 'succession')],
  regency_begun: { actors: ['jorah_mormont', 'daenerys_targaryen'], houses: ['targaryen'], data: { why: 'minority' } },
  regency_ended: { actors: ['jorah_mormont', 'daenerys_targaryen'], houses: ['targaryen'], data: { why: 'minority' } },
  fled: { actors: ['tyrion_lannister'], houses: ['lannister'], place: 'arryn' },
  vanished: { actors: ['benjen_stark'], houses: ['nights_watch'], place: 'nights_watch' },
  letter_sent: { actors: ['eddard_stark', 'robert_baratheon'], houses: ['stark', 'baratheon'], data: { to: 'robert_baratheon', days: 14, post: 'r2' } },
  letter_arrived: { actors: ['lysa_arryn', 'catelyn_stark'], houses: ['arryn', 'stark'], data: { from: 'lysa_arryn', to: 'catelyn_stark' } },
  letter_intercepted: { actors: ['varys'], houses: ['baratheon', 'stark'], data: { from: 'eddard_stark', to: 'robert_baratheon' } },
  envoy_arrived: { actors: ['tyrion_lannister'], houses: ['lannister', 'stark'], place: 'stark', data: { from: 'tyrion_lannister' } },
  audience_held: { actors: ['eddard_stark', 'robert_baratheon'], houses: ['stark', 'baratheon'], place: 'baratheon', data: { verdict: 'agrees' } },
  gift: { actors: ['doran_martell', 'robert_baratheon'], houses: ['martell', 'baratheon'], data: { gold: 13100, warmth: 29 } },
  loan_taken: { actors: ['robert_baratheon'], houses: ['baratheon', 'braavos'], data: { lender: 'braavos', amount: 200000, rate: 0.1, due: D(200) } },
  loan_repaid: { actors: ['robert_baratheon'], houses: ['baratheon', 'braavos'], data: { lender: 'braavos', amount: 50000, still: 150000 } },
  debt_called: { actors: ['robert_baratheon'], houses: ['baratheon', 'braavos'], data: { lender: 'braavos', owed: 150000, by: D(30) } },
  loan_defaulted: { actors: ['robert_baratheon'], houses: ['baratheon', 'braavos'], data: { lender: 'braavos', amount: 150000 } },
  grain_bought: { actors: ['eddard_stark'], houses: ['stark'], data: { moons: 3, cost: 4500 } },
  bribe: { actors: ['petyr_baelish', 'janos_slynt'], houses: ['baelish', 'baratheon'], data: { gold: 2000, aim: 'a quiet word' } },
  bribe_refused: { actors: ['petyr_baelish', 'janos_slynt'], houses: ['baelish', 'baratheon'], data: { gold: 2000 } },
  ransom_demanded: { actors: ['tywin_lannister', 'edmure_tully'], houses: ['lannister', 'tully'], data: { gold: 80000 } },
  embargo: { actors: ['tywin_lannister'], houses: ['lannister', 'tyrell'], data: { lifted: false } },
  peace_sued: { actors: ['hoster_tully', 'tywin_lannister'], houses: ['tully', 'lannister'], data: { war: 'lannister_vs_tully', terms: 'white peace', accepted: false } },
  cold_war: { actors: [], houses: ['lannister', 'tully'], data: { war: 'lannister_vs_tully' } },
  commitment_made: { actors: ['robb_stark'], houses: ['stark', 'frey'], data: { commitment: 'c1', kind: 'aid' } },
  commitment_kept: { actors: ['robb_stark'], houses: ['stark', 'frey'], data: { commitment: 'c1', kind: 'aid' } },
  commitment_broken: { actors: ['walder_frey'], houses: ['frey', 'stark'], data: { commitment: 'c1', kind: 'aid' } },
  rumour: [{ actors: ['roose_bolton'], houses: ['bolton'], place: 'bolton' }, { actors: [], houses: ['tully'], place: 'whent', data: { party: 'host_tully', feint: 'whent', false: true } }],
  secret_revealed: { actors: ['petyr_baelish', 'lysa_arryn'], houses: ['baelish', 'arryn'], data: { matter: 'a hidden marriage' } },
  scheme_discovered: { actors: ['varys', 'petyr_baelish'], houses: ['baratheon', 'baelish'], place: 'baratheon', data: { kind: 'spy' } },
  feast: [{ actors: ['mace_tyrell'], houses: ['tyrell'], place: 'tyrell', data: { cost: 600, brawl: false } }, { actors: ['wyman_manderly'], houses: ['manderly'], place: 'manderly', data: { cost: 500, brawl: true } }],
  tourney: [() => G('g-tourney-01', 'tourney')],
  tourney_result: [() => G('g-tourney-01', 'tourney_result')],
  judgement: { actors: ['eddard_stark', 'roose_bolton'], houses: ['stark', 'bolton'], place: 'stark', data: { verdict: 'guilty' } },
  order_given: { actors: ['eddard_stark'], houses: ['stark'], place: 'stark' },
  petition: { actors: ['robert_baratheon', 'eddard_stark'], houses: ['stark', 'baratheon'], data: { matter: 'hand_offer_d6_11' } },
  tax_changed: { actors: ['mace_tyrell'], houses: ['tyrell'], place: 'tyrell', data: { tax: 'high', was: 'normal' } },
  works_begun: [() => G('g-works-01', 'works_begun'), () => G('g-works-02', 'works_begun')],
  works_done: [() => G('g-works-03', 'works_done')],
  ledger: { actors: [], houses: ['karstark'], place: 'karstark' },
  unrest_rising: { actors: [], houses: ['tully'], place: 'tully', data: { unrest: 40 } },
  rising: { actors: [], houses: ['tully'], place: 'tully', data: { holding: 'tully' } }, // (not King's Landing: the scorer cannot read a place with an apostrophe, so a story with no person there could never name itself)
  famine: [() => G('g-harvest-03', 'famine')],
  plague: { actors: [], houses: ['tully'], place: 'tully' },
  season_turned: { actors: [], houses: [], place: 'hightower', data: { season: 'autumn' } },
  custom_created: { actors: ['eddard_stark'], houses: ['stark'], place: 'stark', data: { custom: 'a yearly hunt' } },
  // (the real progress names no actor — the King is the crown's lord, and the real turns' B3 row tells that one; here the King is an actor)
  canon_beat: [{ actors: ['robert_baratheon'], houses: ['baratheon', 'stark'], place: 'frey', data: { stage: 'progress' }, thread: 'kings_ride', cause: { type: 'beat', ref: 'kings_ride.progress' } },
    { actors: ['bran_stark'], houses: ['stark'], place: 'stark', data: { stage: 'the_fall' }, thread: 'kings_ride', cause: { type: 'beat', ref: 'kings_ride.the_fall' } }],
  happening: [() => G('g-omen-01', 'happening'), () => G('g-harvest-01', 'happening')],
  hook: { actors: ['maege_mormont'], houses: ['mormont'], place: 'mormont', data: { hook: 'tourney_called', why: 'The realm stirs.' } },
  behaviour: { actors: ['wyman_manderly'], houses: ['manderly'] },
  weather: { actors: [], houses: ['stark'], place: 'stark' },
  legacy: { actors: [], houses: ['stark'], place: 'stark' },
};
// The verb of a headline is picked by the hash of the fact id, so every synthetic fact is told under a dozen ids: every
// form a kind has is read by the scorer, and no test depends on the order the tests run in.
const IDS = Array.from({ length: 12 }, (_, k) => `f${k + 1}.${(k * 5) % 11 + 1}`);
/** Every synthetic fact of every kind: [{ kind, label, fact (the first id), variants (one per id), bare, bares }] — `bare` is the same fact with no data, cause or thread. */
function synthetic() {
  const out = [];
  for (const kind of Object.keys(KINDS)) {
    const specs = [SYN[kind]].flat().filter(Boolean);
    specs.forEach((spec, i) => {
      const made = typeof spec === 'function' ? spec() : mk(kind, spec);
      const { data, cause, thread, ...slots } = made;
      const variants = IDS.map((id) => ({ ...made, id })); const bares = IDS.map((id) => ({ ...slots, id }));
      out.push({ kind, label: specs.length > 1 ? `${kind}#${i + 1}` : kind, fact: variants[0], variants, bare: bares[0], bares });
    });
  }
  return out;
}
const verdict = (card, story) => scoreCard({ headline: card.headline, summary: card.summary }, story, state);
const stateWith = (turn) => { const s = newState(); for (const [k, p] of Object.entries(turn.parties)) s.parties[k] = { ...p }; s.meta.clock = turn.clock; return s; };

// ── The modules ──────────────────────────────────────────────────────────────────────────────────────────────────────
test('heads.js: HEAD, SUM, ROLES, LEDE and ARCHETYPE — a head and a summary for every kind of importance 3 or more', () => {
  const { HEAD, SUM, ROLES, LEDE, ARCHETYPE } = need(H, 'heads.js');
  const heavy = Object.entries(KINDS).filter(([, k]) => k.importance >= 3).map(([n]) => n);
  assert.ok(heavy.length >= 40, `${heavy.length} kinds of importance 3 or more`);
  const noHead = heavy.filter((k) => typeof HEAD[k] !== 'function'); const noSum = heavy.filter((k) => typeof SUM[k] !== 'function');
  assert.deepEqual(noHead, [], `kinds of importance ≥ 3 with no HEAD entry: ${noHead}`); assert.deepEqual(noSum, [], `kinds of importance ≥ 3 with no SUM entry: ${noSum}`);
  // the kinds the real turns of the audit hold, whatever importance the player's house raised them to, are all told
  const seen = new Set(Object.values(TURNS).flatMap((set) => set.turns.flatMap((t) => [...t.facts, ...t.small].map((f) => f.kind))));
  assert.deepEqual([...seen].filter((k) => typeof HEAD[k] !== 'function'), [], 'a kind of the recorded turns has no HEAD entry');
  for (const [name, table] of [['HEAD', HEAD], ['SUM', SUM]]) for (const k of Object.keys(table)) assert.ok(KINDS[k], `${name}.${k} is no kind of fact`);
  // the archetype of every kind, and a rank to lead by for every kind that can be told
  for (const kind of Object.keys(KINDS)) assert.ok(ARCHETYPES.includes(ARCHETYPE[kind]), `ARCHETYPE.${kind} = ${ARCHETYPE[kind]}`);
  for (const kind of Object.keys(HEAD)) assert.ok(Number.isFinite(LEDE[kind]), `LEDE.${kind} = ${LEDE[kind]}`);
  // the archetypes the GDD names and the split of C3 relies on: a muster is not a refusal, a march is not a battle
  assert.deepEqual(['levies_called', 'call_answered', 'host_formed'].map((k) => ARCHETYPE[k]), ['muster', 'muster', 'muster']);
  assert.deepEqual(['set_out', 'arrived'].map((k) => ARCHETYPE[k]), ['march', 'march']);
  assert.equal(ARCHETYPE.battle, 'battle'); assert.equal(ARCHETYPE.siege_begun, 'siege'); assert.equal(ARCHETYPE.death, 'death'); assert.equal(ARCHETYPE.wedding, 'wedding'); assert.equal(ARCHETYPE.works_begun, 'works');
  assert.notEqual(ARCHETYPE.call_refused, ARCHETYPE.call_answered, 'a refusal is not part of the muster: the split of C3 needs the archetypes to differ');
  // ROLES: the table the scorer reads (18 §3.3), in one place so the writer and the scorer cannot disagree
  for (const [kind, spec] of Object.entries({ slain_in_battle: 'death', executed: 'death', death: 'death', captured_in_battle: 'capture', captured: 'capture', battle: 'defeat' })) assert.equal(ROLES[kind]?.act, spec, `ROLES.${kind}`);
  assert.equal(ROLES.slain_in_battle.patient, 'actors.0'); assert.equal(ROLES.slain_in_battle.agent, 'data.by'); assert.equal(ROLES.captured_in_battle.agent, 'data.by');
  if (V.ROLES) assert.equal(V.ROLES, ROLES, 'the scorer imports the table back from heads.js: one table, not two');
});

test('browser-safety: heads.js, headline.js and label.js hold no node: import, no server code, no dice and no clock', () => {
  const files = ['heads.js', 'headline.js', 'label.js'].map((f) => path.join(root, 'public', 'js', 'engine', 'facts', f));
  const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
  const bad = [];
  for (const f of files) {
    assert.ok(fs.existsSync(f), `${path.relative(root, f)} does not exist`);
    const src = strip(fs.readFileSync(f, 'utf8')); const name = path.basename(f);
    if (/\bfrom\s*['"]node:|\brequire\s*\(|\bprocess\.|\bBuffer\b|\bimport\s+fs\b/.test(src)) bad.push(`${name}: a node-only API`);
    if (/Math\.random|crypto\.getRandomValues|randomUUID/.test(src)) bad.push(`${name}: dice (Math.random)`);
    if (/\bDate\b|performance\.now|setTimeout|setInterval/.test(src)) bad.push(`${name}: a clock (Date)`);
  }
  // every module they reach is a relative import inside public/ (the client can fetch it), never node: nor server/
  const seen = new Set(); const walk = (f) => {
    if (seen.has(f)) return; seen.add(f);
    const src = strip(fs.readFileSync(f, 'utf8'));
    for (const m of src.matchAll(/\bfrom\s*['"]([^'"]+)['"]|(?:^|\n)\s*import\s*['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      const spec = m[1] || m[2] || m[3];
      if (!spec.startsWith('.')) { bad.push(`${path.relative(root, f)} imports ${spec}`); continue; }
      const next = path.resolve(path.dirname(f), spec);
      if (!next.startsWith(path.join(root, 'public') + path.sep)) { bad.push(`${path.relative(root, f)} imports ${spec} (outside public/)`); continue; }
      if (!fs.existsSync(next)) { bad.push(`${path.relative(root, f)} imports ${spec} (no such file)`); continue; }
      walk(next);
    }
  };
  files.filter((f) => fs.existsSync(f)).forEach(walk);
  assert.deepEqual(bad, []);
});

// ── Every kind, told ─────────────────────────────────────────────────────────────────────────────────────────────────
test('every kind of fact: a synthetic fact with its slots becomes a card the scorer passes (headline and summary)', () => {
  const { cardOf } = need(W, 'headline.js');
  const missing = Object.keys(KINDS).filter((k) => !SYN[k]); assert.deepEqual(missing, [], `the test has no synthetic fact for: ${missing}`);
  const rows = synthetic(); const problems = [];
  for (const { kind, label, variants } of rows) {
    for (const fact of variants) {
      const story = storyOf([fact]); let card;
      try { card = cardOf(state, story); } catch (e) { problems.push(`${label} ${fact.id}: threw ${e.message}`); break; }
      if (typeof card?.headline !== 'string' || !card.headline || typeof card.summary !== 'string') { problems.push(`${label} ${fact.id}: no headline or summary`); break; }
      if (KINDS[kind].importance >= 3 && !card.summary) { problems.push(`${label} ${fact.id}: an empty summary for a kind of importance ${KINDS[kind].importance}`); break; }
      const v = verdict(card, story);
      if (!v.pass) { problems.push(`${label} ${fact.id}: [${v.faults}] "${card.headline}" / "${card.summary}"`); break; }
    }
  }
  console.log(`\nthe writer, every kind: ${rows.length - problems.length}/${rows.length} synthetic facts pass the scorer under ${IDS.length} ids each`);
  assert.deepEqual(problems, []);
});

test('every kind of fact, its slots stripped to who and where: still a card the scorer passes (nothing padded, nothing broken)', () => {
  const { cardOf } = need(W, 'headline.js'); const problems = [];
  for (const { label, bares } of synthetic()) {
    for (const bare of bares) {
      const story = storyOf([bare]); let card;
      try { card = cardOf(state, story); } catch (e) { problems.push(`${label} ${bare.id}: threw ${e.message}`); break; }
      const v = verdict(card, story);
      if (!v.pass) { problems.push(`${label} ${bare.id}: [${v.faults}] "${card.headline}" / "${card.summary}"`); break; }
    }
  }
  assert.deepEqual(problems, []);
});

test('the card: its shape, its kind, archetype, who and where, and details that are plain strings', () => {
  const { cardOf } = need(W, 'headline.js'); const { ARCHETYPE } = need(H, 'heads.js'); const problems = [];
  const known = (id) => state.characters[id] || state.houses[id] || state.parties[id] || state.holdings[id];
  for (const { kind, label, fact } of synthetic()) {
    const story = storyOf([fact]); const card = cardOf(state, story); const bad = (m) => problems.push(`${label}: ${m}`);
    if (card.kind !== kind) bad(`kind ${card.kind}`);
    if (card.archetype !== ARCHETYPE[kind] || !ARCHETYPES.includes(card.archetype)) bad(`archetype ${card.archetype} (${ARCHETYPE[kind]})`);
    // who: the ids the headline is about — all known, all from the fact's own slots, and someone when the fact names someone
    const slotIds = new Set(); const collect = (v) => { if (typeof v === 'string') slotIds.add(v); else if (Array.isArray(v)) v.forEach(collect); else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { slotIds.add(k); collect(x); } };
    collect([fact.actors, fact.houses, fact.place, fact.data]);
    if (!Array.isArray(card.who) || card.who.some((id) => typeof id !== 'string' || !known(id) || !slotIds.has(id))) bad(`who ${JSON.stringify(card.who)}`);
    else if ((fact.actors.length || fact.houses.length) && !card.who.length) bad('who is empty');
    if (card.where !== (story.place || null)) bad(`where ${card.where} (${story.place})`);
    if (!Array.isArray(card.details) || card.details.some((d) => typeof d !== 'string' || !d.trim())) bad(`details ${JSON.stringify(card.details)}`);
    const all = [card.headline, card.summary, ...(card.details || [])].join('\n');
    if (/undefined|\bnull\b|NaN|\[object|\{\{|Invalid Date|\$\{/.test(all)) bad(`a hole in the words: ${all.match(/undefined|\bnull\b|NaN|\[object|\{\{|Invalid Date|\$\{/)[0]}`);
    if (/\b(?:f\d+\.\d+|S\d+)\b/.test(card.headline + card.summary)) bad('an id in the words');
    if (card.headline !== card.headline.trim() || /\s{2,}/.test(card.headline + card.summary)) bad('stray spaces');
    if (!/^[A-Z“"]/.test(card.headline)) bad(`the headline does not open with a capital: "${card.headline}"`);
  }
  assert.deepEqual(problems, []);
});

test('the story\'s own N4 fields change nothing: archetype and lead given, or derived from the facts, the same card', () => {
  const { cardOf } = need(W, 'headline.js'); const { ARCHETYPE } = need(H, 'heads.js'); const problems = [];
  for (const { label, kind, fact } of synthetic()) {
    const plain = cardOf(state, storyOf([fact])); const rich = cardOf(state, storyOf([fact], { archetype: ARCHETYPE[kind], lead: fact.id, rolled: false }));
    if (JSON.stringify(plain) !== JSON.stringify(rich)) problems.push(`${label}: "${plain.headline}" ≠ "${rich.headline}"`);
  }
  assert.deepEqual(problems, []);
});

// ── The rules of the writer ──────────────────────────────────────────────────────────────────────────────────────────
test('the writer builds from slots only: poisoned engine text and titles change nothing and never show', () => {
  const { cardOf } = need(W, 'headline.js'); const problems = [];
  const poison = (f) => ({ ...f, text: 'ZZ9 POISONED ENGINE TEXT', title: 'ZZ9 POISONED TITLE' });
  const cases = synthetic().map(({ label, fact }) => [label, [fact]]);
  GOLDEN.forEach((g, k) => cases.push([g.id, goldenFacts(g, k)]));
  for (const [label, facts] of cases) {
    const a = cardOf(state, storyOf(facts)); const b = cardOf(state, storyOf(facts.map(poison)));
    if (JSON.stringify(a) !== JSON.stringify(b) || /ZZ9|POISON/.test(JSON.stringify(b))) problems.push(`${label}: "${a.headline}" vs "${b.headline}"`);
  }
  assert.deepEqual(problems, []);
});

test('numbers are for details: no digit in a headline or summary, and a fact\'s men and ships are there', () => {
  const { cardOf } = need(W, 'headline.js'); const problems = [];
  for (const { label, fact } of synthetic()) { const c = cardOf(state, storyOf([fact])); if (/\d/.test(c.headline + c.summary)) problems.push(`${label}: a digit in "${c.headline}" / "${c.summary}"`); }
  assert.deepEqual(problems, []);
  const c = cardOf(state, storyOf([mk('levies_called', SYN.levies_called[0])]));
  assert.ok(c.details.length >= 1 && /\d/.test(c.details.join(' ')), `a call of nearly ten thousand men keeps its number in details: ${JSON.stringify(c.details)}`);
});

test('B-32(c): the numbers of a house that is not yours, a vassal\'s or an ally\'s are told to two figures; your own stay exact', () => {
  const { cardOf } = need(W, 'headline.js');
  const details = (s, fact) => cardOf(s, storyOf([fact])).details.join(' | ');
  const numbers = (t) => [...t.replace(/\b298 AC\b/g, '').replace(/\b\d+(?:st|nd|rd|th)\b/g, '').matchAll(/\d{1,3}(?:,\d{3})+|\d+/g)].map((m) => Number(m[0].replace(/,/g, '')));
  const figures = (n) => String(n).replace(/0+$/, '').length;
  const arryn = mk('levies_called', SYN.levies_called[0]); // 9,977 men called at the Eyrie
  assert.ok(!friendsOf(state, 'stark').has('arryn') && friendsOf(state, 'stark').has('umber'), 'the scenario: Arryn is no friend of Stark, Umber is sworn to it');
  // a foreign house: about 10,000, never 9,977 — and everything it prints of the kind is to two figures
  const foreign = details(state, arryn);
  assert.match(foreign, /about 10,000/i, foreign); assert.doesNotMatch(foreign, /9,?977/, foreign);
  const foreignHost = mk('levies_called', { actors: ['doran_martell'], houses: ['martell'], place: 'martell', data: { party: 'nymeros_martell_host_sunspear', men: 5979, now: 5979 } });
  assert.match(details(state, foreignHost), /about 6,000/i); assert.doesNotMatch(details(state, foreignHost), /5,?979/);
  const marbrand = mk('call_answered', { actors: ['addam_marbrand'], houses: ['marbrand'], place: 'marbrand', data: { men: 1996, party: 'host_marbrand', to: 'lannister', depart: D(12) } });
  const battle = mk('battle', { actors: ['tywin_lannister', 'edmure_tully'], houses: ['lannister', 'tully'], place: 'tully', data: { attacker: 'host_lannister', defender: 'host_tully', winner: 'host_lannister', loser: 'host_tully', winnerHouse: 'lannister', loserHouse: 'tully', wiped: false, lost: { host_lannister: 1537, host_tully: 3142 }, outcome: 'victory', decided: ['generalship'], how: 'held the ford' } });
  for (const [label, f] of [['a foreign call answered', marbrand], ['a foreign battle', battle], ['a foreign call', arryn]]) for (const n of numbers(details(state, f))) assert.ok(n < 100 || figures(n) <= 2, `${label}: ${n} has more than two figures in ${details(state, f)}`);
  assert.match(details(state, battle), /about 1,500/i); assert.match(details(state, battle), /about 3,100/i);
  // your own house: exact
  const own = mk('host_formed', { actors: ['eddard_stark'], houses: ['stark'], place: 'stark', data: { party: 'stark_banners_stark', men: 1996, kind: 'host' } });
  assert.match(details(state, own), /1,?996/, details(state, own));
  // a sworn house and an ally are the friends the engine already knows (knowledge.js friendsOf): exact too
  const umber = mk('call_answered', { actors: ['greatjon_umber'], houses: ['umber'], place: 'umber', data: { men: 1996, party: 'host_of_house_umber', to: 'stark', depart: D(12) } });
  assert.match(details(state, umber), /1,?996/, `a vassal: ${details(state, umber)}`);
  const allied = viewedBy('stark', (s) => { s.pacts = [...(s.pacts || []), { id: 'p_test', type: 'alliance', a: 'stark', b: 'martell', status: 'active' }]; return s; });
  assert.ok(friendsOf(allied, 'stark').has('martell'));
  assert.match(details(allied, foreignHost), /5,?979/, `an ally: ${details(allied, foreignHost)}`);
  // the viewer is state.meta.player: to Arryn, its own call is exact and Stark's numbers are the foreign ones
  const asArryn = viewedBy('arryn');
  assert.match(details(asArryn, arryn), /9,?977/, `to Arryn: ${details(asArryn, arryn)}`); assert.doesNotMatch(details(asArryn, arryn), /about 10,000/i);
  const starkMen = mk('host_formed', { actors: ['eddard_stark'], houses: ['stark'], place: 'stark', data: { party: 'stark_banners_stark', men: 1996, kind: 'host' } });
  assert.match(details(asArryn, starkMen), /about 2,000/i, `to Arryn, Stark's host: ${details(asArryn, starkMen)}`); assert.doesNotMatch(details(asArryn, starkMen), /1,?996/);
  // and the rounding is in details only: the headline and the summary never had a digit to round
  const c = cardOf(state, storyOf([arryn])); assert.doesNotMatch(`${c.headline} ${c.summary}`, /\d/);
});

test('the writer is a pure function of the facts: same input, same card; nothing changed; no dice, no clock', () => {
  const { cardOf } = need(W, 'headline.js');
  const cases = synthetic().map(({ label, fact }) => [label, storyOf([fact])]);
  GOLDEN.forEach((g, k) => cases.push([g.id, storyOf(goldenFacts(g, k))]));
  const frozen = deepFreeze(structuredClone(state)); const other = newState();
  const random = Math.random; const now = Date.now; const problems = [];
  try {
    Math.random = () => { throw new Error('Math.random'); }; Date.now = () => { throw new Error('Date.now'); };
    for (const [label, story] of cases) {
      const before = JSON.stringify(story); deepFreeze(story);
      let a, b, c;
      try { a = cardOf(frozen, story); b = cardOf(frozen, story); c = cardOf(other, JSON.parse(before)); } catch (e) { problems.push(`${label}: ${e.message}`); continue; }
      if (JSON.stringify(a) !== JSON.stringify(b)) problems.push(`${label}: two calls, two cards`);
      if (JSON.stringify(a) !== JSON.stringify(c)) problems.push(`${label}: another copy of the same world, another card`);
      if (JSON.stringify(story) !== before) problems.push(`${label}: the story was changed`);
    }
  } finally { Math.random = random; Date.now = now; }
  assert.deepEqual(problems, []);
  assert.equal(JSON.stringify(frozen.meta.rngState), JSON.stringify(state.meta.rngState), 'the save\'s dice were not drawn from');
});

// ── The golden set ───────────────────────────────────────────────────────────────────────────────────────────────────
/** The bundle's facts as a story of the engine would hold them: ids of their own (the verb is chosen by the id), a day in the turn. */
const goldenFacts = (g, k) => g.facts.map((f, n) => ({ ...f, id: `f${k + 1}.${n + 1}`, turn: 1, day: f.day ?? D(3) }));
const goldenStory = (g, k) => storyOf(goldenFacts(g, k));
const scoredAgainst = (g, k) => ({ ...goldenStory(g, k), must: g.must, mustNot: g.mustNot }); // what the scorer reads: the story and what it must and must not say

test('the golden set: cardOf on every bundle passes the scorer for at least 98 % (the failures are printed)', () => {
  const { cardOf } = need(W, 'headline.js');
  const fails = []; const byRule = {}; let pass = 0;
  GOLDEN.forEach((g, k) => {
    const card = cardOf(state, goldenStory(g, k)); const v = scoreCard({ headline: card.headline, summary: card.summary }, scoredAgainst(g, k), state);
    if (v.pass) pass++; else { fails.push(`${g.id} [${v.faults}] "${card.headline}" / "${card.summary}"`); for (const r of v.faults) byRule[r] = (byRule[r] || 0) + 1; }
  });
  console.log(`\nthe writer on the golden set: ${pass}/${GOLDEN.length} pass (${Math.round(100 * pass / GOLDEN.length)} %)${fails.length ? `; faults ${JSON.stringify(byRule)}` : ''}`);
  for (const f of fails) console.log(`  ${f}`);
  assert.ok(pass / GOLDEN.length >= 0.98, `${pass}/${GOLDEN.length} = ${Math.round(1000 * pass / GOLDEN.length) / 10} %: ${fails.join(' ;; ')}`);
});

// A name the story's own slots can say: a person, a house, a place or a party the ids of its slots name, a region of theirs,
// the name a data slot gives (works). A `must` of the golden set that no such slot holds ("Kingsroad", "wolfswood": said only
// in the engine's own line or by a template's key) is not the writer's to say; the test prints those it leaves out.
function derivable(g, name) {
  const words = new Set(); const add = (t) => { for (const w of String(t || '').toLowerCase().replace(/["“”]/g, '').match(/[a-z'’]+/g) || []) words.add(w.replace(/['’]s$/, '')); };
  const ids = new Set(); const walk = (v) => { if (typeof v === 'string') ids.add(v); else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
  for (const f of g.facts) { walk(f.actors); walk(f.houses); walk(f.place); walk(f.data); add(f.data?.name); }
  // an id is often a house and a holding at once ("frey": House Frey, The Twins): every table that has it says its name
  for (const id of ids) { for (const x of [state.characters[id], state.houses[id], state.holdings[id], state.parties[id]]) if (x) { add(x.name); add(x.fullName); add(x.region); } if (state.characters[id]) add(state.houses[state.characters[id].house]?.region); }
  const TITLES = new Set(['the', 'of', 'king', 'lord', 'lady', 'ser', 'maester', 'old']);
  return String(name).toLowerCase().replace(/["“”]/g, '').match(/[a-z'’]+/g).filter((w) => !TITLES.has(w.replace(/['’]s$/, ''))).every((w) => words.has(w.replace(/['’]s$/, '')));
}
test('the golden set: the names each bundle must carry are in the writer\'s headline or summary', () => {
  const { cardOf } = need(W, 'headline.js'); const misses = []; const skipped = [];
  GOLDEN.forEach((g, k) => {
    const card = cardOf(state, goldenStory(g, k)); const said = `${card.headline} ${card.summary}`.toLowerCase().replace(/["“”]/g, '');
    for (const m of g.must) {
      if (!derivable(g, m)) { skipped.push(`${g.id}: "${m}"`); continue; }
      if (!said.includes(m.toLowerCase().replace(/["“”]/g, ''))) misses.push(`${g.id}: "${m}" is not in "${card.headline}" / "${card.summary}"`);
    }
  });
  if (skipped.length) console.log(`\nmust names no slot can say (not the writer's to say): ${skipped.join('; ')}`);
  assert.deepEqual(misses, []);
});

test('the golden set: no name the bundle must not say, and a headline that does not repeat its summary', () => {
  const { cardOf } = need(W, 'headline.js'); const problems = [];
  GOLDEN.forEach((g, k) => {
    const card = cardOf(state, goldenStory(g, k)); const said = `${card.headline} ${card.summary}`.toLowerCase();
    for (const m of g.mustNot || []) if (said.includes(m.toLowerCase())) problems.push(`${g.id}: says "${m}"`);
    if (card.summary.trim() === card.headline.trim()) problems.push(`${g.id}: the summary is the headline`);
    if (wordsIn(card.headline).length > g.maxWords) problems.push(`${g.id}: ${wordsIn(card.headline).length} words (max ${g.maxWords})`);
  });
  assert.deepEqual(problems, []);
});

// the main verb of a headline: its first word that is a verb of the news, in lower case
const VERBS = new Set(STYLE.HEADLINE_VERBS);
// (the first verb-like word that is not a noun before its own verb: in "Six northern hosts march for Winterfell" the verb is "march")
const mainVerb = (h) => { const ws = String(h).match(/[A-Za-z][A-Za-z'’-]*/g) || []; const verbish = (w) => !!w && /^[a-z]/.test(w) && VERBS.has(w.toLowerCase().replace(/['’]s$/, '')); return ws.find((w, i) => verbish(w) && !verbish(ws[i + 1])) || null; };
test('variety: over the golden set at least 70 % of the headlines have a main verb of their own', () => {
  const { cardOf } = need(W, 'headline.js');
  const verbs = GOLDEN.map((g, k) => mainVerb(cardOf(state, goldenStory(g, k)).headline));
  const distinct = new Set(verbs.filter(Boolean)); const ratio = distinct.size / GOLDEN.length;
  const count = {}; for (const v of verbs) count[v] = (count[v] || 0) + 1;
  console.log(`\nthe writer's variety: ${distinct.size} distinct main verbs in ${GOLDEN.length} headlines (${Math.round(ratio * 100)} %); the most used: ${Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([v, n]) => `${v} ${n}`).join(', ')}`);
  assert.ok(!verbs.includes(null), `a headline with no verb of the news: ${GOLDEN.filter((g, k) => !verbs[k]).map((g) => g.id)}`);
  assert.ok(ratio >= 0.7, `${distinct.size} distinct verbs in ${GOLDEN.length} headlines: ${Math.round(ratio * 100)} %`);
});

test('variety: 2 to 4 verb forms for the kinds that fill a turn, chosen by the fact id — the same id always the same form (a death is always "dies")', () => {
  const { cardOf } = need(W, 'headline.js'); const problems = [];
  for (const kind of ['set_out', 'call_answered', 'levies_called', 'feast', 'arrived', 'host_formed', 'tourney_result', 'works_begun']) {
    const spec0 = [SYN[kind]].flat()[0]; const spec = typeof spec0 === 'function' ? spec0() : spec0; const forms = new Set();
    for (let n = 1; n <= 60; n++) {
      const id = `f${n}.${(n * 7) % 13 + 1}`; const f = mk(kind, { ...spec, id });
      const a = cardOf(state, storyOf([f])).headline; const b = cardOf(newState(), storyOf([{ ...f }])).headline;
      if (a !== b) problems.push(`${kind} ${id}: two calls, two headlines`);
      forms.add(mainVerb(a));
    }
    if (forms.size < 2 || forms.size > 4) problems.push(`${kind}: ${forms.size} verb forms over 60 ids (${[...forms]})`);
  }
  assert.deepEqual(problems, []);
});

// ── The audit's own turns, told (18 §1.3 B1–B13, §4) ─────────────────────────────────────────────────────────────────
const facts = (set, n, ids) => { const t = TURNS[set].turns[n - 1]; return ids.map((id) => [...t.facts, ...t.small].find((f) => f.id === id) || assert.fail(`${set} turn ${n} has no ${id}`)); };
const ofKind = (set, n, kind, pred = () => true) => TURNS[set].turns[n - 1].facts.filter((f) => f.kind === kind && pred(f));
// what a story of the engine looks like for these facts (the roll-ups carry `rolled`, as N4 marks them)
const realStory = (set, n, fs, extra = {}) => { const s = stateWith(TURNS[set].turns[n - 1]); const st = { ...storyOf(fs), ...extra }; st.days = [Math.max(1, fs[0].day - s.meta.clock.from + 1), Math.max(1, fs.at(-1).day - s.meta.clock.from + 1)]; return { s, st }; };
const REAL = [
  // B1/A1: the muster — the eighteen houses that answered, told as one
  { row: 'B1 muster', set: 'muster', turn: 1, pick: (t) => ofKind('muster', 1, 'call_answered'), rolled: true, head: [/Stark/, /\b(answer|answers|answered|gather|gathers|gathered|rally|rallies|rallied|muster|musters)\b/i], anywhere: /north/i },
  // B2/A3: the call itself
  { row: 'B2 the call', set: 'muster', turn: 1, ids: ['f1.1'], head: [/(Eddard|Ned|Lord|Stark)/, /\b(call|calls|called|banners|summon|summons|raise|raises)\b/i], noHead: [/\b19\b/] },
  // B3/A4: the King's ride north
  { row: 'B3 the king', set: 'muster', turn: 1, ids: ['f1.14'], head: [/(Robert|King)/, /(Twins|Winterfell|Green Fork)/] },
  // A2: the refusal
  { row: 'A2 the refusal', set: 'muster', turn: 1, ids: ['f1.26'], head: [/Hornwood/, /\b(refuse|refuses|refused|declines|declined|defies|turns down)\b/i] },
  // B4/A5: a foreign call to arms, at the Eyrie
  { row: 'B4 Arryn', set: 'muster', turn: 2, ids: ['f2.5'], head: [/(Arryn|Lysa)/, /Eyrie/, /\b(raise|raises|raised|call|calls|called|arm|arms|gather|gathers|muster|musters)\b/i], details: [/about 10,000/i], noDetails: [/9,?977/] },
  // B5/A6: the hosts that leave for Winterfell, as one march
  { row: 'B5 hosts march', set: 'muster', turn: 2, pick: () => ofKind('muster', 2, 'set_out', (f) => f.importance <= 3), rolled: true, head: [/\bfive\b/i, /Winterfell/, /\b(march|marches|marched|ride|rides|rode|set|leave|leaves|left|head|heads|answer|answers)\b/i], detailsHave: [/Karstark/, /Umber/, /Manderly/, /Bolton/, /Cerwyn/] },
  // B6/A7: the free folk
  { row: 'B6 Mance', set: 'muster', turn: 3, ids: ['f3.1'], head: [/(Mance|Free Folk|free folk|wildlings)/], noHead: [/House The/], details: [/45,000/] },
  // B7/A8: a market at the Dreadfort
  { row: 'B7 the market', set: 'muster', turn: 3, ids: ['f3.4'], head: [/(Bolton|Roose)/, /(Dreadfort|market)/] },
  // B9/A: a house joins the host at Winterfell
  { row: 'B9 joins', set: 'muster', turn: 3, ids: ['f3.25'], head: [/(Cerwyn|Medger)/, /(Winterfell|Stark|Robb|host)/] },
  // B8/A9: the tourney, and who won it
  { row: 'B8 the tourney', set: 'muster', turn: 4, ids: ['f4.3', 'f4.4'], head: [/Wendel Manderly/, /Last Hearth/, /\b(wins|won|takes|took|claims|champion)\b/i] },
  // B13/A11: a natural death
  { row: 'B13 death', set: 'quiet', turn: 1, ids: ['f1.10'], headExact: /^Old Nan dies(?: of a fever)? at Winterfell$/ },
];
test('B1–B13, told: the audit\'s real facts name who and where (18 §4), and every one passes the scorer', () => {
  const { cardOf } = need(W, 'headline.js'); const problems = [];
  for (const r of REAL) {
    const fs = r.ids ? facts(r.set, r.turn, r.ids) : r.pick(); const { s, st } = realStory(r.set, r.turn, fs, r.rolled ? { rolled: true } : {});
    const card = cardOf(s, st); const bad = (m) => problems.push(`${r.row}: ${m} — "${card.headline}" / "${card.summary}" / ${JSON.stringify(card.details).slice(0, 200)}`);
    for (const re of r.head || []) if (!re.test(card.headline)) bad(`the headline lacks ${re}`);
    for (const re of r.noHead || []) if (re.test(card.headline)) bad(`the headline has ${re}`);
    if (r.headExact && !r.headExact.test(card.headline)) bad(`the headline is not ${r.headExact}`);
    if (r.anywhere && !r.anywhere.test(`${card.headline} ${card.summary}`)) bad(`neither headline nor summary has ${r.anywhere}`);
    for (const re of r.details || []) if (!re.test(card.details.join(' | '))) bad(`details lack ${re}`);
    for (const re of r.noDetails || []) if (re.test(card.details.join(' | '))) bad(`details have ${re}`);
    for (const re of r.detailsHave || []) if (!re.test(card.details.join(' '))) bad(`the roll-up's details lack ${re}`);
    const v = scoreCard({ headline: card.headline, summary: card.summary }, st, s); if (!v.pass) bad(`the scorer: [${v.faults}]`);
  }
  assert.deepEqual(problems, []);
});

test('a natural death reads "<name> dies at <place>" under every id, the age kept for the details', () => {
  const { cardOf } = need(W, 'headline.js');
  for (let n = 1; n <= 24; n++) {
    const karstark = mk('death', { ...SYN.death[0], id: `f${n}.${n % 9 + 1}` }); const card = cardOf(state, storyOf([karstark]));
    assert.match(card.headline, /^(?:Lord |Lady |Ser )?Rickard Karstark dies(?: of [a-z ]+)? at Karhold$/, card.headline);
    assert.doesNotMatch(`${card.headline} ${card.summary}`, /\d/, 'the age is a detail, in words at most');
    assert.ok(card.details.join(' ').includes('61'), `the age is in details: ${JSON.stringify(card.details)}`);
  }
  const wound = cardOf(state, storyOf([mk('death', SYN.death[2])]));
  assert.match(wound.headline, /Wendel Manderly/); assert.doesNotMatch(wound.headline, /\bof (?:old )?age\b/, 'a death in the lists is not told as a death of age');
});

test('a battle, its dead and its captives: the headline says who beat whom and where, and never the reverse (18 §4 A10, A12)', () => {
  const { cardOf } = need(W, 'headline.js');
  const slain = mk('slain_in_battle', { ...G('g-slain-01', 'slain_in_battle') });
  const c = cardOf(state, storyOf([slain])); assert.match(c.headline, /^Robb Stark (?:\w+ ){0,2}by Tywin Lannister at the Twins$/, c.headline);
  const jaime = cardOf(state, storyOf([G('g-capture-01', 'captured_in_battle')])); assert.match(jaime.headline, /Jaime Lannister.*\b(?:captured|taken|seized)\b.*Robb Stark|Robb Stark.*\b(?:captures|takes|seizes|took|captured)\b.*Jaime Lannister/, jaime.headline);
  const b = mk('battle', G('g-battle-01', 'battle')); const bc = cardOf(state, storyOf([b]));
  assert.match(bc.headline, /Tywin Lannister/); assert.match(bc.headline, /Twins/);
  const swapped = { ...b, data: { ...b.data, winner: b.data.loser, loser: b.data.winner, winnerHouse: b.data.loserHouse, loserHouse: b.data.winnerHouse } };
  assert.notEqual(cardOf(state, storyOf([swapped])).headline, bc.headline, 'the headline follows the winner slot');
  assert.equal(verdict(cardOf(state, storyOf([swapped])), storyOf([swapped])).pass, true, 'and still passes the scorer with the roles the other way');
});

test('a roll-up: five hosts on one road are one card, the count in the headline, the houses and men in details', () => {
  const { cardOf } = need(W, 'headline.js');
  const fs = ofKind('muster', 2, 'set_out', (f) => f.importance <= 3); assert.equal(fs.length, 5);
  const { s, st } = realStory('muster', 2, fs, { rolled: true }); const card = cardOf(s, st);
  assert.match(card.headline, /\bfive\b/i); assert.doesNotMatch(card.headline, /\d/);
  assert.ok(card.details.join(' ').match(/Karstark|Umber|Manderly|Bolton|Cerwyn/g)?.length >= 5, `each house is in details: ${JSON.stringify(card.details)}`);
  assert.ok(wordsIn(card.headline).length <= 12);
  // the same five hosts as five separate stories are five different headlines (the fitting of 18 §6), none the count
  const alone = fs.map((f) => cardOf(s, storyOf([f])).headline);
  assert.equal(new Set(alone).size, 5, `five hosts, five headlines: ${alone.join(' / ')}`);
  // eighteen answers of the muster: a count in words, and the roll-up survives a 21-fact story
  const g = GOLDEN.find((b) => b.id === 'g-muster-05'); const k = GOLDEN.indexOf(g);
  const big = cardOf(state, { ...goldenStory(g, k), rolled: true }); assert.doesNotMatch(big.headline, /\d/); assert.ok(wordsIn(big.headline).length <= 12, big.headline);
});

// ── The Meanwhile (C7; N9's sentence, here from N4's facts) ──────────────────────────────────────────────────────────
const BOILER = [...STYLE.BOILERPLATE, ...STYLE.JARGON].map((p) => new RegExp(p, 'i'));
function meanwhileFaults(text, s, facts) {
  const out = []; const say = (m) => out.push(m);
  if (typeof text !== 'string' || !text.trim()) return ['empty'];
  if (text.length > 200) say(`${text.length} chars`);
  if (!/[.]$/.test(text)) say('no full stop'); if (/\.\s+\S/.test(text) || /[!?]/.test(text)) say('more than one sentence');
  if (text.split(/;/).length > 3) say('more than three clauses');
  if (/\d/.test(text) || /…|\.\.\.|[():—]/.test(text)) say('a digit or a mark that is not the herald\'s');
  if (/\belsewhere\b/i.test(text)) say('"Elsewhere:" list style');
  for (const re of BOILER) if (re.test(text)) say(`boilerplate ${re}`);
  for (const re of GAME_WORDS) if (re.test(text)) say(`game word ${re}`);
  // it names only what the facts hold
  const people = new Set(facts.flatMap((f) => f.actors)); const places = new Set(facts.map((f) => f.place).filter(Boolean)); const houses = new Set([...facts.flatMap((f) => f.houses), ...facts.flatMap((f) => f.actors).map((a) => s.characters[a]?.house)]);
  for (const e of entitiesIn(s, text)) { const ok = e.kind === 'person' ? people.has(e.ids[0]) || [...people].some((p) => s.characters[p]?.house === s.characters[e.ids[0]]?.house) : e.kind === 'place' ? places.has(e.ids[0]) : e.kind === 'house' ? e.ids.some((i) => houses.has(i)) : true; if (!ok) say(`names ${e.text}, who is not in the facts`); }
  return out;
}
test('meanwhileOf: one sentence of at most 200 characters, a full stop, three clauses at most, no boilerplate — for every turn of the audit', () => {
  const { meanwhileOf } = need(W, 'headline.js'); const problems = []; let told = 0;
  for (const [set, data] of Object.entries(TURNS)) for (const t of data.turns) {
    const s = stateWith(t); if (!t.small.length) continue;
    const text = meanwhileOf(s, t.small); told++;
    for (const m of meanwhileFaults(text, s, t.small)) problems.push(`${set} turn ${t.turn}: ${m} — "${text}"`);
  }
  assert.ok(told >= 8, `${told} turns with a Meanwhile`); assert.deepEqual(problems, []);
});

test('meanwhileOf: eight riders to feasts (B11) are one clause of the herald, not eight clipped journeys; no facts, no sentence', () => {
  const { meanwhileOf } = need(W, 'headline.js');
  const g = GOLDEN.find((b) => b.id === 'g-meanwhile-01'); const fs = goldenFacts(g, 0); assert.equal(fs.length, 8);
  const text = meanwhileOf(state, fs); assert.deepEqual(meanwhileFaults(text, state, fs), [], text);
  assert.ok(text.length < 200 && !/leaves .* with .* knights/i.test(text), text);
  assert.equal(meanwhileOf(state, []), '', 'a week with nothing small says nothing');
  const gone = meanwhileOf(state, [{ id: 'f9.1', kind: 'happening', day: D(2), actors: ['nobody_at_all'], houses: ['no_such_house'], place: 'nowhere', importance: 1, text: 'x', data: { tpl: 'nothing' } }]);
  assert.ok(typeof gone === 'string' && !/undefined|null|NaN/.test(gone), `unknown ids do not leak: "${gone}"`);
  // pure: the same facts, the same sentence; the facts and the world untouched
  const frozen = deepFreeze(structuredClone(state)); const list = deepFreeze(structuredClone(fs));
  assert.equal(meanwhileOf(frozen, list), text);
});

// ── Robustness: a story with holes never breaks the page ─────────────────────────────────────────────────────────────
test('ids the world does not know (a host raised in play, a lord born since) never crash the writer or leak into the words', () => {
  const { cardOf } = need(W, 'headline.js');
  const holes = [
    mk('call_answered', { actors: ['a_lord_no_one_knows'], houses: ['a_house_no_one_knows'], place: 'nowhere_at_all', data: { men: 400, party: 'host_of_nobody', to: 'nowhere_at_all' } }),
    mk('slain_in_battle', { actors: ['nobody'], houses: ['no_house'], data: { by: 'no_one' } }),
    mk('battle', { actors: [], houses: [], place: 'nowhere', data: { winner: 'x', loser: 'y', lost: { x: 5, y: 7 } } }),
    mk('death', { actors: ['nobody'], houses: ['no_house'] }), mk('happening', { actors: [], houses: [] }), mk('wedding', { actors: ['only_one'], houses: [] }),
  ];
  for (const f of holes) {
    let card; assert.doesNotThrow(() => { card = cardOf(state, storyOf([f])); }, f.kind);
    assert.ok(card.headline && typeof card.summary === 'string', f.kind);
    assert.doesNotMatch([card.headline, card.summary, ...card.details].join(' '), /undefined|\bnull\b|NaN|\[object|a_lord_no_one_knows|host_of_nobody|nowhere_at_all/, f.kind);
  }
});

// ── The whole pipeline: N4's stories of the audit's turns, told by N3 ────────────────────────────────────────────────
test('every story of the six recorded turns (as the clusterer makes them) is told by the writer, and the scorer passes them all', () => {
  const { cardOf } = need(W, 'headline.js'); const fails = []; let n = 0; const cards = new Map();
  for (const [set, data] of Object.entries(TURNS)) for (const t of data.turns) {
    const s = stateWith(t); const { stories } = clusterFacts(s, t.facts);
    for (const st of stories) { n++; const card = cardOf(s, st); cards.set(`${set}${t.turn}:${st.facts[0].id}`, { card, st }); const v = scoreCard({ headline: card.headline, summary: card.summary }, st, s); if (!v.pass) fails.push(`${set} T${t.turn} ${st.id} [${v.faults}] "${card.headline}" / "${card.summary}" (${st.facts.map((f) => f.kind).join('+')})`); }
  }
  console.log(`\nthe writer on the audit's stories: ${n - fails.length}/${n} pass`);
  assert.ok(n >= 25, `${n} stories`); assert.deepEqual(fails, []);
  // the two stories the GDD tells as one card each (18 §4 A1 and A6): the muster, and the hosts on the road — whatever the
  // clusterer put beside them (the hosts formed, the lead by kind), the card is the roll-up
  const told = (set, turn, pred) => { const t = TURNS[set].turns[turn - 1]; const { stories } = clusterFacts(stateWith(t), t.facts); const st = stories.find(pred); assert.ok(st, `${set} turn ${turn}: the story`); return { st, card: cardOf(stateWith(t), st) }; };
  const muster = told('muster', 1, (st) => st.facts.filter((f) => f.kind === 'call_answered').length >= 15);
  assert.match(muster.card.headline, /Stark/, muster.card.headline); assert.match(muster.card.headline, /\b(answer|answers|answered|gather|gathers|gathered|rally|rallies|rallied)\b/i, muster.card.headline);
  assert.match(`${muster.card.headline} ${muster.card.summary}`, /north/i); assert.doesNotMatch(muster.card.headline, /\d/);
  const hosts = told('muster', 2, (st) => st.facts.filter((f) => f.kind === 'set_out').length >= 5);
  assert.match(hosts.card.headline, /\bfive\b/i, hosts.card.headline); assert.match(hosts.card.headline, /Winterfell/, hosts.card.headline);
});
