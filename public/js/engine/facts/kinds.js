// The fact catalogue (docs/gdd/03-architecture.md §3.6, §8): every kind of thing that can happen in the world, with
// its default importance, the kind of news it is (the chronicle's card type), who may know of it by default, and — for
// the kinds the engine can phrase from the fact's data alone — its one-line text, pronouns and all. A subsystem that
// already has its own words passes them; the template is for facts built from data (a host arriving, a lord dying).
//
//   importance: 1..5, raised by one when the player's house or kin is an actor and by one for a great lord (cap 5)
//   type: the chronicle card ('war' | 'court' | 'diplomacy' | 'intrigue' | 'economy' | 'disaster' | 'religion' | 'magic')
//   vis: 'public' | 'local' (seen by those near) | 'houses' (the houses involved) | 'secret' (only by spy or scheme)
import { pronouns } from '../../shared/people.js';

const nameOf = (s, id) => s.characters?.[id]?.name || s.parties?.[id]?.name || s.houses?.[id]?.name || s.holdings?.[id]?.name || String(id || '').replace(/_/g, ' ');
const placeOf = (s, id) => s.holdings?.[id]?.name || String(id || 'the field').replace(/_/g, ' ');
const men = (n) => Number(n || 0).toLocaleString('en-GB');
const who = (s, f, i = 0) => s.characters?.[f.actors[i]] || null;
const nm = (c) => c?.name || 'Someone';
// who moves: a host, a fleet or a progress by its banner; one who rides alone (or with a few riders) by name
const mover = (s, f) => { const p = s.parties?.[f.data.party]; return p && !['rider', 'envoy'].includes(p.kind) ? p.name : nm(who(s, f)) !== 'Someone' ? nm(who(s, f)) : nameOf(s, f.data.party); };
const toward = (s, f) => (f.data.against ? `marches against ${nameOf(s, f.data.against)}` : `sets out for ${placeOf(s, f.data.to)}`);

// [importance, type, vis, template?]
const K = (importance, type, vis = 'public', text = null) => ({ importance, type, vis, text });
export const KINDS = {
  // ── Movement ──
  set_out: K(2, 'war', 'local', (f, s) => `${mover(s, f)} ${toward(s, f)}${f.data.days ? ` (~${f.data.days} days)` : ''}.`),
  returned: K(1, 'court', 'local', (f, s) => `${mover(s, f)} is home again at ${placeOf(s, f.place)}.`),
  arrived: K(2, 'war', 'local', (f, s) => `${mover(s, f)} reaches ${placeOf(s, f.place)}${f.data.men ? ` (${men(f.data.men)} men)` : ''}.`),
  turned_back: K(2, 'war', 'local'),
  met_on_road: K(2, 'court', 'local'),
  crossed: K(2, 'war', 'local'),
  delayed: K(1, 'war', 'local'),
  embarked: K(2, 'war', 'local'),
  landed: K(3, 'war', 'local'),
  lost_at_sea: K(4, 'disaster'),
  // ── Military ──
  levies_called: K(3, 'war'),
  call_answered: K(2, 'war'),
  call_delayed: K(2, 'war', 'houses'),
  call_refused: K(4, 'war', 'houses'),
  muster_grew: K(1, 'war', 'local'),
  host_formed: K(3, 'war', 'local', (f, s) => `${nameOf(s, f.data.party)} (${men(f.data.men)} men) is raised at ${placeOf(s, f.place)}.`),
  host_joined: K(2, 'war', 'local'),
  host_split: K(2, 'war', 'local'),
  host_disbanded: K(2, 'war', 'local', (f, s) => `${f.data.name || nameOf(s, f.data.party)} disbands${f.data.why ? ` — ${f.data.why}` : ''}.`),
  desertion: K(3, 'war', 'houses'),
  host_hungry: K(3, 'war', 'houses'),    // a host's wagons and the fields about it are both empty (engine/military/supply.js)
  land_stripped: K(3, 'disaster', 'local'), // foragers have left a province nothing: the next host through it starves
  camp_fever: K(2, 'disaster', 'houses'), // the flux in a camp that has sat too long
  battle: K(4, 'war', 'public', (f, s) => `House ${nameOf(s, f.data.attacker)} and House ${nameOf(s, f.data.defender)} meet in battle${f.place ? ` near ${placeOf(s, f.place)}` : ''}${f.data.winner ? `; the field is House ${nameOf(s, f.data.winner)}'s` : ''}.`),
  rout: K(4, 'war'),
  withdrew: K(3, 'war', 'local'),     // a host that would not give battle falls back (engine/military/battle.js)
  stand_off: K(3, 'war', 'local'),    // two hosts in reach, and neither will begin it
  captured_in_battle: K(4, 'war', 'public', (f, s) => `${nm(who(s, f))} is taken captive on the field.`),
  slain_in_battle: K(4, 'war', 'public', (f, s) => `${nm(who(s, f))} is slain${f.data.cause ? ` — ${f.data.cause}` : ''}.`),
  siege_begun: K(4, 'war'),
  siege_tick: K(1, 'war', 'local'),
  sally: K(3, 'war', 'local'),
  storm_assault: K(4, 'war'),
  holding_fell: K(4, 'war'),
  siege_lifted: K(4, 'war'),
  relief_near: K(3, 'war', 'houses'),   // a relieving host within three days of a besieged castle (engine/military/siege.js)
  terms_offered: K(2, 'war', 'houses'),
  terms_refused: K(3, 'war', 'houses'),
  raid: K(3, 'war', 'local'),
  village_burned: K(2, 'war', 'local'),
  blockade: K(3, 'war'),
  sea_battle: K(4, 'war'),
  sellswords_hired: K(3, 'war', 'local'),
  sellswords_turned: K(4, 'war'),
  outlaws_rise: K(2, 'disaster', 'local'),     // a band holds the roads where war laid the land waste (engine/military/companies.js)
  outlaws_scattered: K(2, 'war', 'local'),
  men_hired: K(2, 'economy', 'local'),   // men-at-arms taken into a house's pay (sellswords have their own kind)
  ambush: K(2, 'war', 'local'),     // outlaws or foragers fall on a small company on the road
  // ── Politics ──
  war_declared: K(5, 'war'),
  war_joined: K(4, 'war'),
  peace_made: K(5, 'diplomacy'),
  pact_made: K(4, 'diplomacy', 'houses'),
  pact_broken: K(5, 'diplomacy'),
  fealty_sworn: K(4, 'diplomacy'),
  fealty_renounced: K(5, 'diplomacy'),
  crowned: K(5, 'court'),
  claim_proclaimed: K(5, 'court'),
  office_granted: K(3, 'court', 'public', (f, s) => `${nm(who(s, f))} is named ${f.data.title || String(f.data.office || 'to an office').replace(/_/g, ' ')}.`),
  office_stripped: K(4, 'court'),
  holding_granted: K(3, 'court'),
  attainder: K(5, 'court'),
  house_ended: K(5, 'court'),
  // ── People ──
  death: K(2, 'court', 'public', (f, s) => { const c = s.characters?.[f.actors[0]]; return `${c?.name || 'Someone'}${c?.title ? `, ${c.title},` : ''} is dead${f.data.cause ? ` — ${f.data.cause}` : ''}.`; }),
  birth: K(2, 'court', 'public', (f, s) => { const c = who(s, f); return `${nm(c)} is born${c?.house ? ` to House ${nameOf(s, c.house)}` : ''}.`; }),
  betrothal: K(3, 'court', 'public', (f, s) => `${nm(who(s, f))} is betrothed to ${nm(who(s, f, 1))}.`),
  wedding: K(3, 'court', 'public', (f, s) => `${nm(who(s, f))} and ${nm(who(s, f, 1))} are wed.`),
  captured: K(4, 'war', 'public', (f, s) => `${nm(who(s, f))} is taken captive${f.data.by ? ` and held by House ${nameOf(s, f.data.by)}` : ''}.`),
  released: K(3, 'court', 'public', (f, s) => { const c = who(s, f); return `${nm(c)} is free again${c ? `; ${pronouns(c).his} captors have let ${pronouns(c).him} go` : ''}.`; }),
  ransomed: K(3, 'court', 'public', (f, s) => { const c = who(s, f); return `${nm(c)} is ransomed, and goes home to ${c ? pronouns(c).his : 'their'} own people.`; }),
  executed: K(5, 'court', 'public', (f, s) => `${nm(who(s, f))} is put to death${f.data.cause ? ` — ${f.data.cause}` : ''}.`),
  sent_to_wall: K(3, 'court', 'public', (f, s) => { const c = who(s, f); return `${nm(c)} is sent to the Wall to take the black; ${c ? pronouns(c).he : 'they'} will hold no lands and father no children.`; }),
  hostage_taken: K(3, 'court', 'houses'),
  ward_fostered: K(2, 'court'),
  wounded: K(3, 'court', 'local', (f, s) => `${nm(who(s, f))} is wounded${f.data.note ? ` — ${f.data.note}` : ''}.`),
  illness: K(2, 'court', 'local', (f, s) => `${nm(who(s, f))} falls ill.`),
  recovered: K(2, 'court', 'local', (f, s) => { const c = who(s, f); return `${nm(c)} is on ${c ? pronouns(c).his : 'their'} feet again.`; }),
  came_of_age: K(2, 'court', 'public', (f, s) => { const c = who(s, f); return `${nm(c)} comes of age, and answers for ${c ? pronouns(c).himself : 'themselves'} now.`; }),
  succession: K(4, 'court', 'public', (f, s) => `${nameOf(s, f.actors[0])} is now head of House ${nameOf(s, f.houses[0])}.`),
  regency_begun: K(3, 'court'),
  regency_ended: K(3, 'court'),
  fled: K(4, 'court', 'public', (f, s) => { const c = who(s, f); return `${nm(c)} has fled${c ? `, and ${pronouns(c).his} people do not know where` : ''}.`; }),
  vanished: K(4, 'court', 'public', (f, s) => { const c = who(s, f); return `${nm(c)} has vanished; no one can say where ${c ? pronouns(c).he : 'they'} went.`; }),
  // ── Word ──
  letter_sent: K(1, 'diplomacy', 'houses'),
  letter_arrived: K(2, 'diplomacy', 'houses'),
  letter_intercepted: K(3, 'intrigue', 'secret'),
  envoy_arrived: K(3, 'diplomacy'),
  audience_held: K(2, 'diplomacy', 'houses'),
  gift: K(2, 'diplomacy', 'houses'),
  loan_taken: K(2, 'economy', 'houses'),       // coin borrowed from a lender (engine/economy/lenders.js)
  loan_repaid: K(2, 'economy', 'houses'),
  debt_called: K(4, 'economy'),                // a lender calls in what it is owed — the realm hears of it
  loan_defaulted: K(4, 'economy'),
  grain_bought: K(1, 'economy', 'houses'),
  bribe: K(2, 'intrigue', 'secret'),           // gold for a favour; known to the two of them (and whoever finds out)
  bribe_refused: K(3, 'intrigue', 'houses'),
  ransom_demanded: K(3, 'court', 'houses'),
  embargo: K(3, 'economy'),       // gold sent to win a lord's goodwill
  peace_sued: K(3, 'diplomacy'),       // terms of peace offered (engine/politics/war.js), taken or refused
  cold_war: K(2, 'diplomacy'),         // a war with no blow struck in six moons
  commitment_made: K(2, 'diplomacy', 'houses'),
  commitment_kept: K(2, 'diplomacy', 'houses'),
  commitment_broken: K(4, 'diplomacy'),
  rumour: K(1, 'intrigue'),
  secret_revealed: K(4, 'intrigue'),
  scheme_discovered: K(4, 'intrigue'),
  // ── Court & realm ──
  feast: K(2, 'court', 'local'),
  tourney: K(3, 'court'),
  tourney_result: K(3, 'court'),
  judgement: K(2, 'court', 'local'),
  petition: K(2, 'court', 'houses'),
  tax_changed: K(2, 'economy', 'houses'),
  works_begun: K(1, 'economy', 'local'),
  works_done: K(2, 'economy', 'local'),
  ledger: K(1, 'economy', 'houses'),
  unrest_rising: K(3, 'disaster', 'local'),
  rising: K(4, 'disaster'),
  famine: K(4, 'disaster'),
  plague: K(4, 'disaster'),
  season_turned: K(5, 'court'),
  custom_created: K(2, 'court', 'houses'),
  canon_beat: K(4, 'court'),        // a great matter of the story (shared/plots.js) — its own words, its thread
  // ── Ambient ──
  happening: K(1, 'court', 'local'),
  hook: K(2, 'court', 'local'), // a story hook the Director raised (engine/director.js)
  behaviour: K(1, 'court', 'local'),
  weather: K(1, 'disaster', 'local'),
  // ── History ──
  legacy: K(1, 'court'),            // a line of a save from before the fact log, kept as it was written (03 §12.7)
};
export const KIND_NAMES = Object.keys(KINDS);

/** The engine's one-line text for a fact of a kind that has a template (null if it has none). */
export function templateText(fact, state) {
  const t = KINDS[fact.kind]?.text;
  try { return t ? t({ actors: [], houses: [], data: {}, ...fact }, state) : null; } catch { return null; }
}
