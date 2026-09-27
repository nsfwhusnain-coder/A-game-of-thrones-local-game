// Engine tests that need no model: `npm test`. Run from the repo root.
import test from 'node:test';
import assert from 'node:assert/strict';
import { extractJson } from '../server/llm.js';
import { createInitialState } from '../public/js/shared/world.js';
import { initEconomy } from '../public/js/shared/economy.js';
import { happenings, happeningCount } from '../public/js/shared/happenings.js';
import { HAPPENINGS } from '../public/data/happenings.js';
import { openPins } from '../public/js/shared/pins.js';
import { buildJumpPrompt, turnLog } from '../server/prompts.js';

const fresh = (house = 'stark') => { const s = createInitialState('agot_298', house); if (!s.world) initEconomy(s); return s; };

// ── JSON repair: each case is the shape of a reply that really failed in play ──
test('reasoning leaked before the answer: the answer object is found', () => {
  const o = extractJson('The user wants a moon simulated. Let me think {not json} about it.\n\n{"summary":"Rain.","events":[],"changes":[]}');
  assert.equal(o.summary, 'Rain.');
});
test('an event object left open before the array closes is rebalanced', () => {
  const o = extractJson('{"summary":"x","events":[{"title":"A","text":"The North stands."  ],"changes":[{"op":"relation","a":"stark","b":"bolton","delta":-5}]}');
  assert.equal(o.events.length, 1);
  assert.equal(o.changes[0].delta, -5);
});
test('a reply cut off after a key is closed with null', () => {
  const o = extractJson('{"summary":"x","events":[{"title":"A","where":"castle_black","importance":');
  assert.equal(o.events[0].title, 'A');
  assert.equal(o.events[0].importance, null);
});
test('a continuation that started the object over keeps the new object', () => {
  const o = extractJson('{"summary":"The deep winter tightens, though the memory of it l{"summary":"Winter.","events":[],"changes":[]}');
  assert.equal(o.summary, 'Winter.');
});
test('raw quotes and thousands separators are repaired', () => {
  const o = extractJson('{"summary":"He said "no" to the king","men": 8,000}');
  assert.match(o.summary, /no/);
  assert.equal(o.men, 8000);
});

// ── Happenings: the small life of the realm ──
test('the library has unique ids and valid regions', () => {
  const ids = new Set(HAPPENINGS.map((h) => h.id));
  assert.equal(ids.size, HAPPENINGS.length);
  for (const h of HAPPENINGS) assert.match(h.where, /^(any|r:|h:|c:)/, h.id);
});
test('a period brings happenings in proportion to its length, every slot filled', () => {
  const s = fresh();
  for (const days of [7, 30, 90, 360]) {
    s.meta.turn += 10;
    const { events } = happenings(s, days);
    assert.ok(events.length <= 60 && (days < 30 || events.length > 0)); // a quiet week may bring nothing
    for (const e of events) {
      assert.ok(e.bg && s.holdings[e.where], e.title);
      assert.doesNotMatch(e.title + e.text, /\{|undefined|\bnull\b|House an /, e.title);
      assert.ok(e.day >= 1 && e.day <= days);
    }
  }
});
test('a happening does not come again before its cooldown', () => {
  const s = fresh(); s.meta.turn = 50;
  const first = new Set(happenings(s, 360).events.map((e) => e.tpl));
  const again = happenings(s, 30).events; // same turn: every template just used is cooling down
  assert.ok(again.every((e) => !first.has(e.tpl)));
});
test('happenings never touch the Wall or Essos under "any"', () => {
  const s = fresh(); const any = new Set(HAPPENINGS.filter((h) => h.where === 'any').map((h) => h.id));
  for (let i = 0; i < 40; i++) { s.meta.turn += 7; for (const e of happenings(s, 90).events) if (any.has(e.tpl)) assert.ok(!['wall', 'beyond', 'essos'].includes(s.holdings[e.where].region), e.title); }
});

// ── Pins: unread news and waiting matters, gone once acknowledged ──
test('pins show pending decisions and unread news, and acknowledged news goes', () => {
  const s = fresh();
  s.meta.turn = 1;
  s.history = [{ turn: 1, date: 'x', events: [{ id: '1-0', title: 'War', text: 't', where: 'stark', importance: 3, type: 'war' }, { id: '1-1', title: 'Feast', text: 't', where: 'tyrell', importance: 1, type: 'court' }] }];
  s.decisions = [{ id: 'd1', title: 'Q', text: '', options: [{ label: 'a' }, { label: 'b' }], status: 'pending', from: 'robert_baratheon' }];
  let pins = openPins(s);
  assert.equal(pins.get('stark')?.events.length, 1);
  assert.equal(pins.get('tyrell'), undefined, 'minor news has no pin');
  assert.ok([...pins.values()].some((g) => g.decisions.length === 1));
  s.acks = { '1-0': 1 };
  pins = openPins(s);
  assert.equal(pins.get('stark')?.events.length || 0, 0);
});
test('news older than two turns loses its pin', () => {
  const s = fresh(); s.meta.turn = 5;
  s.history = [{ turn: 2, date: 'x', events: [{ id: '2-0', title: 'Old', text: '', where: 'stark', importance: 4 }] }];
  assert.equal(openPins(s).size, 0);
});

// ── The prompt: small and cache-friendly ──
test('the static part of the prompt does not change when people move', () => {
  const cfg = { contextTokens: 65536, maxTokens: 6000, keepRecentTurns: 4, promptDetail: 'full', thinking: 'auto' };
  const s = fresh();
  const a = buildJumpPrompt(s, [], '1m', '', cfg)[1].content;
  s.characters.jory_cassel.loc = 'baratheon';
  s.relations[Object.keys(s.relations)[0]].v += 7;
  const b = buildJumpPrompt(s, [], '1m', '', cfg)[1].content;
  const staticEnd = a.indexOf('THE STATE OF THE REALM NOW');
  assert.ok(staticEnd > 1000);
  assert.equal(a.slice(0, staticEnd), b.slice(0, staticEnd));
});
test('the recent-turn log is one line per event, background life only when it matters', () => {
  const s = fresh();
  const line = turnLog(s, { turn: 3, dateFrom: 'a', date: 'b', orders: [{ text: 'March south.' }, { text: 'DECISION — X: I choose "Y".' }], events: [{ day: 4, where: 'stark', title: 'T', text: 'x', importance: 3 }, { day: 5, where: 'tyrell', title: 'Fair', text: 'y', importance: 1, bg: true }] });
  assert.match(line, /Orders: March south\./);
  assert.match(line, /Decisions: X: I choose "Y"\./);
  assert.match(line, /- d4 Winterfell: T — x/);
  assert.doesNotMatch(line, /Fair/);
});

// ── Temperament: different people take the same words differently ──
import { weighAudience, holdToVerdict } from '../public/js/shared/temperament.js';
test('a bribe buys Janos Slynt but not Tywin Lannister', () => {
  const line = 'I offer you 5,000 gold dragons for your alliance.';
  let s = fresh(); assert.equal(weighAudience(s, s.characters.janos_slynt, line).verdict, 'agree');
  s = fresh(); assert.notEqual(weighAudience(s, s.characters.tywin_lannister, line).verdict, 'agree');
});
test('Tywin will not be threatened; Walder Frey is frightened', () => {
  const line = 'Swear fealty to me or I will burn your castle to the ground.';
  let s = fresh(); const t = weighAudience(s, s.characters.tywin_lannister, line); assert.equal(t.verdict, 'refuse'); assert.ok(t.mood.anger > t.mood.fear);
  s = fresh(); const w = weighAudience(s, s.characters.walder_frey, line); assert.ok(w.mood.fear > 0);
});
test('insults run out a proud man\'s patience and close the audience', () => {
  const s = fresh(); let r; let n = 0;
  do { r = weighAudience(s, s.characters.viserys_targaryen, 'You are a craven fool.'); n++; } while (r.verdict !== 'dismiss' && n < 10);
  assert.ok(n <= 2); assert.ok(s.moods.viserys_targaryen.closed);
});
test('a refusal signs no pact; an agreement is recorded even if the model forgets', () => {
  const s = fresh(); const c = s.characters.janos_slynt;
  const refused = holdToVerdict(s, c, { verdict: 'refuse', proposal: 'alliance' }, [{ op: 'pact', type: 'alliance', a: 'stark', b: c.house, status: 'active' }]);
  assert.ok(!refused.some((x) => x.op === 'pact'));
  const agreed = holdToVerdict(s, c, { verdict: 'agree', proposal: 'alliance' }, []);
  assert.ok(agreed.some((x) => x.op === 'pact' && x.type === 'alliance'));
});

// ── Battles and sieges ──
import { resolveWarfare } from '../public/js/shared/battles.js';
import { applyChanges as apply } from '../public/js/shared/world.js';
test('hosts at war in contact fight: losses, a rout, a battlefield on the map', () => {
  const s = fresh();
  apply(s, [{ op: 'war', status: 'start', name: 'W', attackers: ['lannister'], defenders: ['stark'] }, { op: 'army_create', id: 'n1', owner: 'stark', name: 'N', at: 'tully', men: 10000 }, { op: 'army_create', id: 'l1', owner: 'lannister', name: 'L', at: 'tully', men: 10000 }]);
  const r = resolveWarfare(s, 30, { r: () => 0.3 });
  assert.equal(r.events.length, 1);
  const total = (s.parties.n1?.men || 0) + (s.parties.l1?.men || 0);
  assert.ok(total < 20000 && total > 10000);
  assert.ok(s.battles.length === 1 && s.landmarks.some((l) => l.kind === 'battle'));
});
test('a great castle is not stormed in a moon; a siege starves it in time', () => {
  const s = fresh();
  apply(s, [{ op: 'war', status: 'start', name: 'W', attackers: ['lannister'], defenders: ['tully'] }, { op: 'army_create', id: 's1', owner: 'lannister', name: 'S', at: 'tully', men: 9000 }]);
  for (const a of Object.values(s.parties)) if (a.id !== 's1' && ['tully', 'stark'].includes(a.owner)) delete s.parties[a.id];
  resolveWarfare(s, 30, { r: () => 0.99 });
  assert.equal(s.holdings.tully.status, 'besieged'); assert.equal(s.holdings.tully.owner, 'tully');
  for (let i = 0; i < 40 && s.holdings.tully.owner === 'tully'; i++) resolveWarfare(s, 30, { r: () => 0.99 });
  assert.equal(s.holdings.tully.owner, 'lannister');
});

// ── Orders read by rule: spelled-out numbers ──
import { numbersIn } from '../server/orders/parse.js';
test('dictated numbers are read: "ten men", "a hundred riders", "two hundred and fifty men"', () => {
  const first = (t) => numbersIn(t)[0]?.n ?? null;
  assert.equal(first('Ride to Oldtown with ten men.'), 10);
  assert.equal(first('take a hundred riders'), 100);
  assert.equal(first('two hundred and fifty men'), 250);
  assert.equal(first('a score of knights'), 20);
  assert.equal(first('send men north'), null);
});

// ── Fog of war ──
import { viewOfArmies, updateIntel } from '../public/js/shared/intel.js';
test('the player sees hosts near their lands; distant ones by word of mouth, which can be stale or feinted', () => {
  const s = fresh();
  apply(s, [{ op: 'army_create', id: 'far', owner: 'martell', name: 'Dornish spears', at: 'martell', men: 6000 }, { op: 'army_create', id: 'near', owner: 'bolton', name: 'Bolton host', at: 'stark', men: 2000 }]);
  assert.equal(viewOfArmies(s).get('near')?.known, 'seen');
  updateIntel(s, () => 0); // word travels: a great host is heard of
  let v = viewOfArmies(s).get('far'); assert.equal(v.known, 'reported'); assert.ok(Math.abs(v.men - 6000) <= 1600);
  s.parties.far.feint = 'tyrell'; s.meta.turn++; updateIntel(s, () => 0); // a feint sends word the wrong way
  assert.deepEqual(viewOfArmies(s).get('far').pos, s.holdings.tyrell.pos);
  delete s.parties.far.feint; s.parties.far.secrecy = 'hidden'; s.parties.far.pos = [...s.holdings.yronwood.pos];
  for (let i = 0; i < 5; i++) { s.meta.turn++; updateIntel(s, () => 0.5); } // in secret: the realm loses track of it
  assert.equal(viewOfArmies(s).get('far'), undefined);
});
test('a planted report shows a host that does not exist', () => {
  const s = fresh();
  apply(s, [{ op: 'report', at: 'moat_cailin', men: 8000, source: 'a frightened crofter', false: true, owner: 'lannister', name: 'A Lannister host' }]);
  const ghost = [...viewOfArmies(s).values()].find((x) => x.false);
  assert.ok(ghost && ghost.men === 8000);
});

// ── Succession: elected offices are not inherited ──
import { heirOf } from '../public/js/shared/people.js';
test('the Watch chooses a brother, not the Lord Commander\'s exiled son; Braavos elects', () => {
  const s = fresh();
  const nw = heirOf(s, 'nights_watch', 'jeor_mormont');
  assert.ok(nw && s.characters[nw.id].house === 'nights_watch' && nw.id !== 'jorah_mormont');
  assert.equal(heirOf(s, 'braavos', s.houses.braavos.lord), null);
});

// ── Treachery ──
import { treacheryTick } from '../public/js/shared/treachery.js';
test('a losing war tempts the schemers first: the Boltons treat with the enemy long before the Manderlys waver', () => {
  const s = fresh(); apply(s, [{ op: 'war', status: 'start', name: 'W', attackers: ['lannister'], defenders: ['stark'] }]); s.battles = [];
  for (let t = 1; t <= 10; t++) { s.meta.turn = t; if (t % 3 === 0) s.battles.push({ turn: t, attacker: 'lannister', defender: 'stark', victor: 'lannister' }); treacheryTick(s, 30, () => 0.2); }
  const boltonTurned = s.houses.bolton.liege === 'lannister' || s.plotting.bolton?.with === 'lannister';
  assert.ok(boltonTurned);
  assert.ok(!s.plotting.manderly?.with && s.houses.manderly.liege === 'stark');
});

// ── Orders: the sworn hosts answering the call are the player's to command ──
import { commandable, carryOutOrders, readOrders, carryOut, raiseLevies } from '../server/orders.js';
import { interpretOrder } from '../server/orders/interpret.js';
// orders read by the rules alone (what the game does on the mock), and a reading as a model would give it
const byRule = (s) => (text) => interpretOrder(s, text, { provider: 'rules' });
const asRead = (actions, extra = {}) => async () => ({ actions, letter: null, clarify: null, story: !actions.length, via: 'model', ...extra });
const said = (o) => (o.receipt || []).map((l) => l.text).join(' ');
test('"march the whole host to Moat Cailin" sends the sworn hosts on the road there too', async () => {
  const s = fresh();
  apply(s, [{ op: 'army_create', id: 'hb', owner: 'bolton', name: 'Host of House Bolton', at: 'bolton', men: 4000 }]);
  s.houses.bolton.obligations = { levies: 'answered', host: 'hb', muster: 'stark' };
  assert.ok(commandable(s, s.parties.hb));
  s.orders = [{ id: 'o1', text: 'Raise the whole host and march to Moat Cailin.' }];
  await carryOutOrders(s, asRead([{ verb: 'raise_levies', params: { at: 'stark', men: 3000, to: 'moat_cailin' } }]));
  assert.equal(s.parties.hb.march?.to, 'moat_cailin');
  assert.ok(Object.values(s.parties).some((a) => a.owner === 'stark' && a.march?.to === 'moat_cailin'));
});
test('an order against a house marches on its seat', async () => {
  const s = fresh(); apply(s, [{ op: 'army_create', id: 'nh', owner: 'stark', name: 'Host', at: 'stark', men: 5000 }]);
  s.orders = [{ id: 'o1', text: 'Attack the Lannisters with the host.' }];
  await carryOutOrders(s, byRule(s));
  assert.equal(s.parties.nh.march?.to, 'lannister');
});

// ── Orders, whereabouts and force counts agree ──
import { applyChanges, roadPos, rideOf } from '../public/js/shared/world.js';
import { partyOf } from '../public/js/engine/parties.js';
import { advance as walk } from '../public/js/engine/movement.js';
const rideTo = (s, id) => rideOf(s, s.characters[id])?.march?.to; // where someone riding alone is bound
import { whereabouts } from '../public/js/shared/roads.js';
import { named } from '../server/orders.js';
test('the story model cannot send the player\'s people or move the player\'s hosts', () => {
  const s = fresh(); apply(s, [{ op: 'army_create', id: 'nh', owner: 'stark', name: 'Host', at: 'stark', men: 900 }]);
  const guard = s.houses.stark.figures.menAtArms.v;
  const r = applyChanges(s, [{ op: 'travel', character: 'jon_snow', to: 'kings_landing', men: 400 }, { op: 'army_move', army: 'nh', to: 'lannister' }, { op: 'character', id: 'sansa_stark', loc: 'kings_landing' }], { protectPlayer: true });
  assert.equal(r.rejected.length, 2);
  assert.equal(rideOf(s, s.characters.jon_snow), null);
  assert.equal(s.characters.sansa_stark.loc, 'stark');
  assert.equal(s.parties.nh.at, 'stark');
  assert.equal(s.houses.stark.figures.menAtArms.v, guard);
});
test('a journey is not begun twice, and a rider turned back starts from the road', () => {
  const s = fresh();
  apply(s, [{ op: 'travel', character: 'jon_snow', to: 'kings_landing' }]);
  assert.equal(apply(s, [{ op: 'travel', character: 'jon_snow', to: 'kings_landing' }]).rejected.length, 1);
  const ride = rideOf(s, s.characters.jon_snow);
  walk(ride, ride.route.days / 2); // halfway down the kingsroad
  const mid = roadPos(s, s.characters.jon_snow);
  apply(s, [{ op: 'travel', character: 'jon_snow', to: 'stark' }]);
  assert.equal(rideTo(s, 'jon_snow'), 'stark');
  assert.deepEqual(rideOf(s, s.characters.jon_snow).route.path[0], mid, 'the road home starts where he turned');
  assert.match(whereabouts(s, s.characters.jon_snow).text, /on the road to Winterfell/);
});
test('someone the story moves far away rides there instead of appearing', () => {
  const s = fresh();
  apply(s, [{ op: 'character', id: 'tyrion_lannister', loc: 'castle_black' }]);
  const t = s.characters.tyrion_lannister;
  assert.notEqual(t.loc, 'nights_watch'); assert.equal(rideTo(s, 'tyrion_lannister'), 'nights_watch');
});
test('an order sends only the one it names, and only with men if it asks for them', async () => {
  const s = fresh(); const guard = s.houses.stark.figures.menAtArms.v;
  s.orders = [{ id: 'o1', text: 'Ser Rodrik is to garrison Winterfell and drill the levies.' }, { id: 'o2', text: 'Send Jon north to the Wall.' }];
  await carryOutOrders(s, byRule(s));
  assert.equal(rideOf(s, s.characters.robb_stark), null); assert.equal(rideOf(s, s.characters.rodrik_cassel), null);
  assert.equal(s.houses.stark.figures.menAtArms.v, guard, 'no one took men');
  assert.equal(rideTo(s, 'jon_snow'), 'nights_watch');
  assert.ok(named(s, s.characters.catelyn_stark, 'Send my wife to Riverrun'));
  assert.ok(!named(s, s.characters.arya_stark, 'Send Jon to the Wall'));
});
test('a lord leading a small company turns the company', () => {
  const s = fresh();
  apply(s, [{ op: 'travel', character: 'jory_cassel', to: 'kings_landing', men: 50 }]);
  const co = partyOf(s, s.characters.jory_cassel);
  assert.equal(co.march.to, 'baratheon'); // King's Landing
  apply(s, [{ op: 'travel', character: 'jory_cassel', to: 'stark' }]);
  assert.equal(co.march.to, 'stark');
  assert.match(whereabouts(s, s.characters.jory_cassel).text, /marching to Winterfell/);
});

// ── Council answers: never raw JSON or code fences ──
import { readReplies } from '../server/llm.js';
const COUNCIL = { luwin: 'Maester Luwin', rodrik_cassel: 'Ser Rodrik Cassel' };
test('council: fenced JSON is read, not shown', () => {
  const r = readReplies('```json\n{"replies":[{"speaker":"luwin","text":"The ravens are ready, my lord."}],"changes":[]}\n```', COUNCIL, 'luwin');
  assert.deepEqual(r.replies, [{ speaker: 'luwin', text: 'The ravens are ready, my lord.' }]);
});
test('council: broken JSON gives up its answers', () => {
  const r = readReplies('{"replies":[{"speaker":"luwin","text":"Winter is coming, my lord."},{"speaker":"rodrik_cassel","text":"The men are \\"ready\\"."', COUNCIL, 'luwin');
  assert.equal(r.replies.length, 2); assert.equal(r.replies[1].text, 'The men are "ready".');
});
test('council: prose by name, and fragments of one speaker joined', () => {
  const r = readReplies('Maester Luwin: We should write to Riverrun.\nSer Rodrik: I will drill the men.\nAnd count the stores.', COUNCIL, 'luwin');
  assert.equal(r.replies.length, 2); assert.equal(r.replies[1].speaker, 'rodrik_cassel'); assert.match(r.replies[1].text, /count the stores/);
});
test('council: only gestures is not an answer', () => {
  assert.equal(readReplies('{"replies":[{"speaker":"luwin","text":"*He strokes his chain.*"}]}', COUNCIL, 'luwin').spoken, false);
});

// ── The chronicle's facts come from the engine, dated ──
import { engineFacts } from '../server/prompts.js';
test('chronicle facts are the engine\'s record, dated by turn', () => {
  const f = engineFacts([
    { turn: 3, dateFrom: '3 8th moon, 298 AC', date: '4 8th moon, 298 AC', span: '1d', carried: [{ result: ['Jory Cassel sets out for King\'s Landing (~48 days\' ride)', 'could not be done: no gold'] }], applied: [{ op: 'relation', text: 'Stark–Umber 60 → 65' }, { op: 'character', text: 'Robert Baratheon arrives at Winterfell' }], events: [{ importance: 2, title: 'Whispers' }, { importance: 3, title: 'House Umber answers the call' }] },
  ]);
  assert.match(f, /\*\*4 8th moon, 298 AC\*\* — Jory Cassel sets out/);
  assert.match(f, /Robert Baratheon arrives at Winterfell/);
  assert.match(f, /House Umber answers the call/);
  assert.doesNotMatch(f, /could not|Stark–Umber|Whispers/);
});
test('an order to garrison and drill hires no one', async () => {
  const s = fresh(); const gold = s.houses.stark.figures.treasury.v;
  s.orders = [{ id: 'o1', text: 'Order Ser Rodrik to garrison Winterfell, drill the levies and count our stores for winter.' }, { id: 'o2', text: 'Recruit two hundred men-at-arms at Winterfell.' }];
  await carryOutOrders(s, byRule(s));
  assert.equal(s.orders[0].result, undefined, 'the first is left to the story');
  assert.equal(s.houses.stark.figures.treasury.v, gold - 200 * 9);
});
test('council: each answer is bound to the advisor who gave it', () => {
  const P = { vayon_poole: 'Vayon Poole', luwin: 'Maester Luwin', rodrik_cassel: 'Ser Rodrik Cassel', jory_cassel: 'Jory Cassel' };
  const r = readReplies('{"replies":[{"speaker":"Vayon","text":"The stores are counted."},{"speaker":"maester_luwin","text":"The letters are read."},{"speaker":"","text":"*Ser Rodrik tugs his whiskers.* The gates are watched."}]}', P, 'vayon_poole');
  assert.deepEqual(r.replies.map((x) => x.speaker), ['vayon_poole', 'luwin', 'rodrik_cassel']);
});
test('a raven order sends a letter, not a rider', async () => {
  const s = fresh(); s.post = [];
  s.orders = [{ id: 'o1', text: 'Have Vayon send a discreet raven to the Eyrie about Jon Arryn\'s last days.' }];
  await carryOutOrders(s, byRule(s));
  assert.match(s.orders[0].result.join(' '), /raven flies to Lysa Arryn/);
  assert.equal(rideOf(s, s.characters.vayon_poole), null);
});
test('a letter is tracked: in flight, delivered, answered', async () => {
  const { postTick, underway } = await import('../public/js/shared/errands.js');
  const { addDays } = await import('../public/js/shared/world.js');
  const s = fresh(); s.post = [];
  s.orders = [{ id: 'o1', text: 'Send a discreet raven to Lady Lysa Arryn at the Eyrie about Jon Arryn\'s last days.' }];
  await carryOutOrders(s, byRule(s));
  assert.equal(s.post.length, 1); assert.equal(s.post[0].to, 'lysa_arryn'); assert.equal(s.post[0].status, 'in flight');
  assert.ok(underway(s).some((x) => x.kind === 'raven'));
  s.meta.date = addDays(s.meta.date, s.post[0].days); postTick(s); assert.equal(s.post[0].status, 'delivered');
  apply(s, [{ op: 'raven', from: 'lysa_arryn', to: 'eddard_stark', text: 'Dearest brother…' }]); postTick(s);
  assert.equal(s.post[0].status, 'answered');
});
test('an order\'s receipt changes nothing, and the turn does what it said', async () => {
  const s = fresh(); const guard = s.houses.stark.figures.menAtArms.v; const dice = [...s.meta.rngState || []];
  s.orders = [{ id: 'o1', text: 'Send Jory Cassel to King\'s Landing with twenty men.' }];
  await readOrders(s, asRead([{ verb: 'send_person', params: { character: 'jory_cassel', to: 'baratheon', men: 20 } }]));
  assert.match(said(s.orders[0]), /Jory Cassel rides for King's Landing with 20 men/);
  assert.equal(s.characters.jory_cassel.loc, 'stark'); assert.equal(s.houses.stark.figures.menAtArms.v, guard);
  assert.deepEqual(s.meta.rngState || [], dice, 'the receipt rolled the copy\'s dice, not the save\'s');
  await carryOutOrders(s, async () => { throw new Error('the order is not read again'); });
  assert.ok(String(s.characters.jory_cassel.loc).startsWith('party:'));
  assert.match(s.orders[0].result[0], /rides for King's Landing/);
});
test('each receipt is tried after the orders above it: the second march of one host is told where it will be', async () => {
  const s = fresh(); apply(s, [{ op: 'army_create', id: 'nh', owner: 'stark', name: 'The Host', at: 'stark', men: 3000 }]);
  const gold = s.houses.stark.figures.treasury.v;
  s.orders = [{ id: 'a', text: 'Recruit two hundred men-at-arms at Winterfell.' }, { id: 'b', text: 'Spend sixty million gold dragons to buy the Iron Throne from King Robert.' }, { id: 'c', text: 'Pray for the old gods to keep us.' }];
  await readOrders(s, byRule(s));
  assert.equal(s.orders[0].receipt[0].ok, true);
  assert.equal(s.orders[1].receipt[0].ok, false); assert.match(said(s.orders[1]), /treasury holds/);
  assert.equal(s.orders[2].receipt[0].ok, 'story');
  assert.equal(s.houses.stark.figures.treasury.v, gold, 'reading spends nothing');
});
test('a question the rules must ask is answered with a chip, and the answer is done', async () => {
  const { answerOrder } = await import('../server/orders.js');
  const s = fresh();
  s.orders = [{ id: 'a', text: 'Hire sellswords at Winterfell.' }, { id: 'b', text: 'Send someone to the Wall.' }];
  await readOrders(s, byRule(s));
  assert.equal(s.orders[0].receipt[0].ok, 'ask'); assert.match(said(s.orders[0]), /How many men/);
  assert.ok(answerOrder(s.orders[0], 1)); // 200 men
  assert.equal(s.orders[0].parsed.actions[0].params.men, 200); assert.equal(s.orders[0].chosen, '200 men');
  assert.match(s.orders[1].parsed.clarify.question, /Who should go/);
  const k = s.orders[1].parsed.clarify.options.findIndex((o) => o.patch.character === 'rodrik_cassel');
  assert.ok(answerOrder(s.orders[1], k));
  await readOrders(s, byRule(s));
  assert.match(said(s.orders[0]), /\b200\b/); assert.equal(s.orders[0].receipt[0].ok, true); assert.match(said(s.orders[1]), /Rodrik Cassel sets out for Castle Black/);
  await carryOutOrders(s, async () => { throw new Error('answered orders are not read again'); });
  assert.equal(rideTo(s, 'rodrik_cassel'), 'nights_watch');
});
test('the story cannot empty the player\'s treasury', () => {
  const s = fresh(); const gold = s.houses.stark.figures.treasury.v;
  const r = applyChanges(s, [{ op: 'figure', house: 'stark', field: 'treasury', value: 0 }, { op: 'figure', house: 'lannister', field: 'treasury', delta: -100 }], { protectPlayer: true });
  assert.equal(s.houses.stark.figures.treasury.v, gold); assert.equal(r.rejected.length, 1); assert.equal(r.applied.length, 1);
});

// ── One host where the men are ──
test('raising levies where a host stands joins it; banners and merge from plain orders', async () => {
  const s = fresh();
  s.orders = [{ id: 'o1', text: 'Assemble the men of the North at Winterfell as the Northern Host under Robb.' }];
  const { lines } = carryOut(s, s.orders[0], { actions: [{ verb: 'raise_levies', params: { at: 'stark', men: 3000, name: 'The Northern Host', commander: 'robb_stark', immediate: true } }, { verb: 'raise_levies', params: { at: 'stark', men: 1000 } }, { verb: 'call_banners', params: { vassals: 'all', at: 'stark' } }] });
  const hosts = Object.values(s.parties).filter((a) => a.owner === 'stark' && a.at === 'stark' && a.kind === 'host');
  assert.equal(hosts.length, 1); assert.equal(hosts[0].name, 'The Northern Host');
  assert.equal(hosts[0].men + (hosts[0].muster?.remaining || 0), 4000, 'one host: those in camp and those still walking in');
  assert.equal(s.characters.robb_stark.loc, 'party:' + hosts[0].id);
  assert.equal(s.houses.umber.obligations.levies, 'called');
  assert.match(lines.map((l) => l.text).join(' '), /join The Northern Host, now [\d,]+ men under Robb Stark/);
});
test('every order has its event, first, even when the story forgot it', async () => {
  const { orderEvents } = await import('../server/orders.js');
  const s = fresh();
  const orders = [{ id: 'a', text: 'Call the banners.', result: ['The banners are called: 20 sworn houses summoned to muster at Winterfell'] }, { id: 'b', text: 'Buy the Iron Throne for sixty million dragons.', result: ['could not be done: not enough gold'] }, { id: 'c', text: 'Tell Robb he did well.' }];
  const told = [{ order: 3, title: 'Ned praises his son', text: '…', houses: [] }];
  const extra = orderEvents(s, orders, told);
  assert.equal(extra.length, 2); assert.ok(told[0].mine);
  assert.match(extra[0].title, /The banners are called/); assert.match(extra[1].title, /Eddard Stark's command comes to nothing/); assert.match(extra[1].text, /not enough gold/);
});
test('the Pax order, in lower case and misspelt: banners called and the Northern Host raised at Winterfell', async () => {
  const s = fresh();
  s.orders = [{ id: 'o', text: 'assemeble the men of the north at winterfell and create a great northern host of all able body men and boys' }];
  await carryOutOrders(s, byRule(s));
  assert.equal(s.orders[0].parsed.via, 'rules', 'the rules read it whole: no model needed');
  assert.match(s.orders[0].result.join(' '), /levies muster at Winterfell/);
  assert.equal(s.houses.umber.obligations.levies, 'called');
  const host = Object.values(s.parties).find((a) => a.owner === 'stark' && a.name === 'The Northern Host');
  assert.ok(host && host.men + (host.muster?.remaining || 0) > 10000, 'every able man is called up (most still walking in)');
});

// ── From the 20-day run on the live model ──
test('gold an order cannot pay is refused before anything is done', async () => {
  const { goldIn } = await import('../server/orders.js');
  assert.equal(goldIn('Spend sixty million gold dragons to buy the Iron Throne'), 60e6);
  assert.equal(goldIn('offer 2,000 dragons'), 2000);
  const s = fresh(); s.orders = [{ id: 'o', text: 'Spend sixty million gold dragons to buy the Iron Throne from King Robert.' }];
  await carryOutOrders(s, asRead([{ verb: 'send_gift', params: { to: 'robert_baratheon', gold: 60e6 } }]));
  assert.match(s.orders[0].result[0], /could not be done: the treasury holds 60,000 dragons, not 60,000,000/i);
});
test('an untagged story event that tells an order becomes its event (no duplicate)', async () => {
  const { orderEvents } = await import('../server/orders.js');
  const s = fresh();
  const told = [{ title: 'Jory Cassel departs for the Neck', text: 'Fifty of the household guard ride south toward Moat Cailin under Jory Cassel.', houses: [] }];
  const extra = orderEvents(s, [{ id: 'a', text: 'Send Jory Cassel to Moat Cailin with fifty men.', result: ['Jory Cassel rides for Moat Cailin with 50 men (detached from Winterfell Household)'] }], told);
  assert.equal(extra.length, 0); assert.equal(told[0].orderId, 'a');
});
test('a letter to "Lord Commander Mormont" is addressed to Jeor', async () => {
  const s = fresh(); s.post = [];
  s.orders = [{ id: 'o', text: 'Send a raven to Lord Commander Mormont asking what the Watch needs.' }];
  await carryOutOrders(s, byRule(s));
  assert.equal(s.post[0]?.to, 'jeor_mormont');
});
test('banners arriving after the host has marched follow it and join it — no second army', async () => {
  const { gatherMusters } = await import('../public/js/shared/vassals.js');
  const s = fresh();
  apply(s, [{ op: 'army_create', id: 'nh', owner: 'stark', name: 'The Northern Host', at: 'stark', men: 16000 }, { op: 'army_create', id: 'hw', owner: 'hornwood', name: 'Host of House Hornwood', at: 'stark', men: 850 }]);
  s.parties.hw.serving = 'stark'; s.houses.hornwood.obligations = { levies: 'answered', muster: 'stark' };
  s.parties.nh.march = { to: 'moat_cailin' }; s.parties.nh.at = null; s.parties.nh.pos = [s.parties.nh.pos[0], s.parties.nh.pos[1] + 30];
  gatherMusters(s);
  assert.equal(s.parties.hw.march?.to, 'party:nh');
  s.parties.hw.pos = [...s.parties.nh.pos];
  gatherMusters(s);
  assert.equal(s.parties.hw, undefined); assert.equal(s.parties.nh.men, 16850);
  assert.equal(Object.values(s.parties).filter((a) => a.owner === 'stark' && /Banners/.test(a.name)).length, 0);
});
test('works ordered in words are begun — and a second time refused with the reason', async () => {
  const s = fresh();
  s.orders = [{ id: 'a', text: 'Fund the expansion of the granaries at Winterfell.' }];
  await carryOutOrders(s, byRule(s));
  assert.match(s.orders[0].result[0], /Work begins: Fill and expand the granaries at Winterfell/);
  s.orders = [{ id: 'b', text: 'Fund the expansion of the granaries at Winterfell.' }];
  await carryOutOrders(s, byRule(s));
  assert.match(s.orders[0].result[0], /could not be done: .*already under way/);
});
test('every kind of order is read by the rules and carried out by the engine', async () => {
  const s = fresh(); apply(s, [{ op: 'army_create', id: 'h1', owner: 'stark', name: 'Host A', at: 'stark', men: 1000 }, { op: 'army_create', id: 'h2', owner: 'stark', name: 'Host B', at: 'stark', men: 500 }]);
  const texts = ['Send Jon Snow to Castle Black.', 'March Host A to Moat Cailin.', 'Recruit a hundred men-at-arms at Winterfell.', 'Hire a spymaster at Winterfell.', 'Appoint Ser Rodrik captain of the guard.', 'Call the banners to Winterfell.', 'Build a rookery at Winterfell.', 'Hold a feast.', 'Hold a tourney.', 'Raise two thousand levies at Winterfell.'];
  s.orders = texts.map((text, i) => ({ id: 'o' + i, text }));
  await carryOutOrders(s, byRule(s));
  s.orders.forEach((o) => { assert.equal(o.parsed.via, 'rules', o.text); assert.ok(o.result?.length && !o.result.some((l) => /^could not/.test(l)), `${o.text}: ${JSON.stringify(o.result)}`); });
  s.orders = [{ id: 'm', text: 'Join the hosts at Winterfell into one.' }];
  await carryOutOrders(s, byRule(s));
  assert.match(s.orders[0].result[0], /are joined into/);
});
test('a refused order is told once, and nothing of it happens elsewhere', async () => {
  const { orderEvents } = await import('../server/orders.js');
  const s = fresh(); const told = [{ order: 1, title: 'The treasurer laughs', text: '…' }, { order: 1, title: 'Gold travels south', text: 'A chest of gold is sent to King\'s Landing.' }];
  orderEvents(s, [{ id: 'a', text: 'Spend sixty million dragons.', result: ['could not be done: the treasury holds 60,000 dragons, not 60,000,000'] }], told);
  assert.equal(told.length, 1); assert.equal(told[0].title, 'The treasurer laughs');
});
test('an order that names a leader puts them at the head of the host', async () => {
  const s = fresh(); apply(s, [{ op: 'army_create', id: 'nh', owner: 'stark', name: 'The Northern Host', at: 'stark', men: 16000 }]);
  s.orders = [{ id: 'o', text: 'Robb is to march the Northern Host to Moat Cailin.' }];
  await carryOutOrders(s, byRule(s));
  assert.equal(s.parties.nh.commander, 'robb_stark'); assert.equal(s.characters.robb_stark.loc, 'party:nh');
  assert.match(s.orders[0].result[0], /16,000 men under Robb Stark\) marches for Moat Cailin/);
});
test('an engine-written order headline is one short sentence', async () => {
  const { orderEvents } = await import('../server/orders.js');
  const s = fresh();
  const ev = orderEvents(s, [{ id: 'f', text: 'Hold a great feast.', result: ['The feast is held (4,050 dragons). Your lords are glad of it. At the high table, two lords came to blows.'] }], []);
  assert.equal(ev[0].title, 'The feast is held');
});

// ── What hosts are made of ──
import { unitsOf, unitsText, mounted } from '../public/js/shared/units.js';
test('a host knows its knights, riders, foot and archers — through merges and losses', async () => {
  const s = fresh();
  carryOut(s, { text: 'Raise the Northern Host.' }, { actions: [{ verb: 'raise_levies', params: { at: 'stark', men: 2000, name: 'The Northern Host', immediate: true } }] });
  const h = Object.values(s.parties).find((a) => a.name === 'The Northern Host');
  const u = unitsOf(s, h); assert.equal(u.knights + u.horse + u.foot + u.archers, 2000); assert.ok(u.foot > u.horse);
  apply(s, [{ op: 'army_create', id: 'mh', owner: 'manderly', name: 'Host of House Manderly', at: 'stark', men: 1000, composition: 'Levies of House Manderly' }]);
  s.parties.mh.serving = 'stark';
  carryOut(s, { text: 'Join the hosts.' }, { actions: [{ verb: 'merge_hosts', params: {} }] });
  assert.equal(Object.values(unitsOf(s, h)).reduce((a, b) => a + b, 0), 3000);
  h.men = 1500; assert.equal(Object.values(unitsOf(s, h)).reduce((a, b) => a + b, 0), 1500);
  assert.match(unitsText(s, h), /foot/);
});
test('a mounted company rides at horse pace; a levy walks', () => {
  const s = fresh();
  apply(s, [{ op: 'travel', character: 'jory_cassel', to: 'kings_landing', men: 100 }]);
  const co = partyOf(s, s.characters.jory_cassel);
  assert.ok(mounted(s, co));
  apply(s, [{ op: 'army_create', id: 'lv', owner: 'stark', name: 'Levies', at: 'stark', men: 5000, composition: 'Levies of House Stark' }]);
  assert.ok(!mounted(s, s.parties.lv));
});

// ── Lords on the road ──
import { retinueTick } from '../public/js/shared/retinues.js';
import { marchDays } from '../public/js/shared/warfare.js';
import { marchTick } from '../public/js/shared/marches.js';
test('lords ride out with their households, stay, ride home — and the realm sees them', async () => {
  const { isSeen } = await import('../public/js/shared/intel.js');
  const s = fresh(); let seed = 7; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const went = new Set(); let home = 0;
  for (let day = 0; day < 60; day++) {
    retinueTick(s, 1, r);
    for (const a of Object.values(s.parties).filter((x) => x.kind === 'retinue')) {
      went.add(a.id); assert.ok(isSeen(s, a), 'a party under banners is seen');
      assert.equal(s.characters[a.commander].loc, 'party:' + a.id);
      assert.deepEqual(a.members, [a.commander], 'the lord rides in it, and the party knows it');
    }
    marchTick(s, { span: 1, turnStart: day }); // the engine's march step, as advance() does it
    for (const id of went) if (!s.parties[id]) home++;
  }
  assert.ok(went.size >= 5, `parties sent: ${went.size}`);
  assert.ok(home > 0, 'some came home and disbanded');
  assert.ok(Object.values(s.parties).filter((x) => x.kind === 'retinue').length <= 14);
});

// ── Turns that run until something happens ──
import { nextTurnLength } from '../public/js/shared/turns.js';
test('a turn runs until the next thing that matters', () => {
  const s = fresh();
  const q = nextTurnLength(s); assert.ok(q.days >= 1 && q.days <= 30, JSON.stringify(q));
  apply(s, [{ op: 'army_create', id: 'nh', owner: 'stark', name: 'The Northern Host', at: 'stark', men: 5000 }]);
  carryOut(s, { text: 'March to Moat Cailin.' }, { actions: [{ verb: 'march_host', params: { army: 'nh', to: 'moat_cailin' } }] });
  const t = nextTurnLength(s);
  assert.match(t.reason, /reaches Moat Cailin|The King rides north/);
  // the turn runs to the day the host arrives: its road is ~27.1 days, so it is there on the 28th
  assert.ok(t.days <= marchDays(s.parties.nh, s.parties.nh.pos, s.holdings.moat_cailin.pos).days + 1, JSON.stringify(t));
  s.pendingReplies = [{ char: 'lysa_arryn', arrivesDay: (s.meta.date.year * 360 + (s.meta.date.month - 1) * 30 + s.meta.date.day - 1) + 1, changes: [] }];
  assert.equal(nextTurnLength(s).days, 1);
});
test('the story can march any host but the player\'s, and the engine walks it', () => {
  const s = fresh();
  apply(s, [{ op: 'army_create', id: 'lh', owner: 'lannister', name: 'Host of the Rock', at: 'lannister', men: 8000 }, { op: 'army_create', id: 'nh', owner: 'stark', name: 'The Northern Host', at: 'stark', men: 5000 }]);
  const r = applyChanges(s, [{ op: 'army_march', army: 'lh', to: 'Riverrun' }, { op: 'army_march', army: 'nh', to: 'Riverrun' }], { protectPlayer: true });
  assert.equal(s.parties.lh.march.to, 'tully'); assert.equal(r.rejected.length, 1);
  assert.equal(s.parties.nh.march, undefined);
});

// ═══════════════════════════════════════════════════════════════════════════
// Regency, standing and the end of a story — the systems added in the AAA pass
// ═══════════════════════════════════════════════════════════════════════════
import { incapacity, chooseRegent, regencyTick, speakerFor, regencyLine, underRegency } from '../public/js/shared/regency.js';
import { standing, standingWord, outcomeFor, epitaph } from '../public/js/shared/standing.js';
import { applyChanges as apply2 } from '../public/js/shared/world.js';

test('a child lord is ruled for: the mother takes the regency, and gives it up at sixteen', () => {
  const s = fresh('arryn');
  // Robert Arryn is eight in 298; Lysa is his mother
  assert.equal(incapacity(s, 'arryn')?.kind, 'minority');
  const reg = chooseRegent(s, 'arryn');
  assert.equal(reg?.id, 'lysa_arryn');
  const r = regencyTick(s, 30);
  assert.equal(s.houses.arryn.regent, 'lysa_arryn');
  assert.ok(r.events.some((e) => /regency/i.test(e.title)));
  assert.equal(speakerFor(s, 'arryn').id, 'lysa_arryn');
  assert.ok(underRegency(s, 'arryn'));
  assert.match(regencyLine(s, 'arryn'), /Lysa Arryn rules as regent/);
  // the boy comes of age
  s.characters[s.houses.arryn.lord].age = 17;
  const r2 = regencyTick(s, 30);
  assert.equal(s.houses.arryn.regent, undefined);
  // told in the engine's own words, and recorded as a fact (a slip in WP B3 once wrote code into this title)
  const heir = s.characters[s.houses.arryn.lord];
  assert.ok(r2.events.some((e) => e.title === `${heir.name} rules in his own right` && e.fact), r2.events.map((e) => e.title).join(' | '));
  assert.ok([...r.events, ...r2.events].every((e) => e.fact && !/\$|fact\(/.test(`${e.title} ${e.text}`)));
});

test('a captive lord is ruled for too, and the vassals like it less each moon', () => {
  const s = fresh('stark');
  const lordId = s.houses.stark.lord;
  s.characters[lordId].status = 'imprisoned';
  assert.equal(incapacity(s, 'stark')?.kind, 'captive');
  const before = Object.values(s.houses).filter((v) => v.liege === 'stark').map((v) => s.characters[v.lord]?.loyalty ?? 60);
  regencyTick(s, 60);
  assert.ok(s.houses.stark.regent, 'someone must hold the seat');
  const after = Object.values(s.houses).filter((v) => v.liege === 'stark').map((v) => s.characters[v.lord]?.loyalty ?? 60);
  assert.ok(after.some((v, i) => v < before[i]), 'a captive liege costs loyalty');
});

test('the standing of a house is measured, and a great house outranks a small one', () => {
  const s = fresh('stark');
  const big = standing(s, 'stark'), small = standing(s, 'cassel') || standing(s, 'mormont');
  assert.ok(big.score > small.score);
  assert.ok(big.score >= 0 && big.score <= 100);
  assert.equal(typeof standingWord(big), 'string');
});

test('a house stripped of everything is broken — but not on the first bad turn', () => {
  const s = fresh('mormont');
  for (const h of Object.values(s.holdings)) if (h.owner === 'mormont') h.owner = 'bolton';
  for (const a of Object.values(s.parties)) if (a.owner === 'mormont') delete s.parties[a.id];
  s.houses.mormont.figures.treasury.v = 0;
  assert.equal(outcomeFor(s, 'mormont'), null, 'one turn of ruin is not the end');
  const o = outcomeFor(s, 'mormont');
  assert.equal(o?.kind, 'ruin');
  assert.equal(o.victory, false);
});

test('the line ending is the end of the story', () => {
  const s = fresh('mormont');
  for (const c of Object.values(s.characters)) if (c.house === 'mormont') c.alive = false;
  const o = outcomeFor(s, 'mormont');
  assert.equal(o?.kind, 'extinct');
  assert.match(o.title, /line of House Mormont is ended/);
});

test('taking King\'s Landing and making peace wins the game', () => {
  const s = fresh('stark');
  s.holdings.baratheon.owner = 'stark';
  s.wars = [];
  const o = outcomeFor(s, 'stark');
  assert.equal(o?.kind, 'throne');
  assert.equal(o.victory, true);
  const e = epitaph(s, 'stark');
  assert.equal(e.house, 'Stark');
  assert.ok(e.standing.score > 0);
});

test('the story may not march the player into a war, by war_join or otherwise', () => {
  const s = fresh('stark');
  apply2(s, [{ op: 'war', status: 'start', id: 'w1', name: 'A war', attackers: ['lannister'], defenders: ['tully'] }]);
  const r = apply2(s, [{ op: 'war_join', war: 'w1', house: 'stark', side: 'attacker' }], { protectPlayer: true });
  assert.equal(r.applied.length, 0);
  assert.match(r.rejected[0].reason, /only the player/);
  // and no house fights on both sides of the same war
  const r2 = apply2(s, [{ op: 'war_join', war: 'w1', house: 'lannister', side: 'defender' }]);
  assert.equal(r2.applied.length, 0);
  const w = s.wars.find((x) => x.id === 'w1');
  assert.equal(w.defenders.includes('lannister'), false);
});

test('a host is never given to a commander the world does not know', () => {
  const s = fresh('stark');
  apply2(s, [{ op: 'army_create', id: 'h1', owner: 'stark', name: 'A host', at: 'stark', men: 1000 }]);
  const r = apply2(s, [{ op: 'army_update', army: 'h1', commander: 'ser_nobody_of_nowhere' }]);
  assert.match(r.rejected[0]?.reason || '', /unknown commander/);
  assert.ok(!s.parties.h1.commander);
});

test('a siege costs the besieger: the camp sickens, and the castle eats its stores', () => {
  const s = fresh('lannister');
  apply2(s, [{ op: 'war', status: 'start', name: 'W', attackers: ['lannister'], defenders: ['tully'] },
    { op: 'army_create', id: 'sg', owner: 'lannister', name: 'The siege host', at: 'tully', men: 12000 }]);
  for (const a of Object.values(s.parties)) if (a.id !== 'sg' && ['tully', 'stark'].includes(a.owner)) delete s.parties[a.id];
  const men0 = s.parties.sg.men;
  resolveWarfare(s, 30, { r: () => 0.99 });
  assert.equal(s.holdings.tully.status, 'besieged');
  const stores0 = s.holdings.tully.siege.stores;
  resolveWarfare(s, 30, { r: () => 0.99 });
  assert.ok(s.parties.sg.men < men0, 'the camp loses men to the flux and desertion');
  assert.ok(s.holdings.tully.siege.stores < stores0, 'the castle eats');
  assert.ok((s.parties.sg.supply ?? 80) >= 20, 'a foraging host does not starve to nothing');
});

// ── The rule sandbox: the model designs a mechanic, the engine runs it ──
import { compile, run, compileRule, evaluateRules, houseScope, liveRules, RuleError } from '../public/js/shared/rules.js';
import { settle } from '../public/js/shared/economy.js';

const scopeFor = (s, h = 'stark') => houseScope(s, s.houses[h], { months: 1, luck: 1, gross: 1000 });

test('a formula is arithmetic, and arithmetic works', () => {
  const s = fresh();
  assert.equal(run(compile('2 + 3 * 4'), scopeFor(s)), 14);
  assert.equal(run(compile('clamp(99, 0, 10)'), scopeFor(s)), 10);
  assert.equal(run(compile('if_(1 > 2, 5, 7)'), scopeFor(s)), 7);
  assert.equal(run(compile('house.at_war * 200'), scopeFor(s)), 0); // 298 AC: the North is at peace
  assert.equal(run(compile('1 / 0'), scopeFor(s)), 0); // no infinities reach the ledger
});

test('a formula cannot reach out of its sandbox', () => {
  const s = fresh();
  for (const src of ['process.exit(1)', 'globalThis', '(function(){})()', 'house.treasury = 0', 'constructor', '[]', 'house["treasury"]', 'x'.repeat(500)]) {
    assert.throws(() => run(compile(src), scopeFor(s)), RuleError, `should have refused: ${src}`);
  }
});

test('an unknown name is refused at injection time, not silently zeroed', () => {
  const s = fresh();
  assert.throws(() => compileRule(s, { house: 'stark', name: 'Nonsense', kind: 'income', formula: 'house.dragons * 3' }), /is not something a rule can read/);
});

test('an injected rule becomes a line in the steward\'s ledger, moon after moon', () => {
  const s = fresh();
  const r = applyChanges(s, [{
    op: 'inject_rule', house: 'stark', name: 'Informants in the Riverlands', kind: 'income',
    vars: { informants: 4 }, grow: 'min(60, v.informants + 6 * months)',
    formula: 'v.informants * 14 * months', when: 'house.treasury > 500', note: 'Paid in stolen Lannister gold.',
  }], { source: 'test' });
  assert.equal(r.rejected.length, 0);
  assert.equal(s.rules.length, 1);
  settle(s, 30);
  const line = s.houses.stark.ledger.at(-1).lines.find((l) => l.rule === 'informants_in_the_riverlands');
  assert.ok(line, 'the rule should have paid out');
  assert.equal(line.kind, 'income');
  assert.equal(s.vars.stark.informants, 10); // the network grew this moon
  settle(s, 30);
  assert.equal(s.vars.stark.informants, 16);
  assert.ok(s.houses.stark.ledger.at(-1).lines.find((l) => l.rule === 'informants_in_the_riverlands').amount > line.amount);
  assert.equal(liveRules(s, 'stark')[0].name, 'Informants in the Riverlands');
});

test('a rule cannot mint gold: every kind is capped per moon', () => {
  const s = fresh();
  applyChanges(s, [{ op: 'inject_rule', house: 'stark', name: 'A dragon hoard', kind: 'income', formula: '9999999' }], { source: 'test' });
  const out = evaluateRules(s, s.houses.stark, { months: 1, luck: 1, gross: 4000 });
  assert.equal(out.capped.length, 1);
  assert.ok(out.lines[0].amount < 9999999 / 100);
});

test('a rule whose condition is false costs nothing', () => {
  const s = fresh();
  applyChanges(s, [{ op: 'inject_rule', house: 'stark', name: 'War tax', kind: 'income', formula: '500', when: 'house.at_war' }], { source: 'test' });
  assert.equal(evaluateRules(s, s.houses.stark, { months: 1, luck: 1, gross: 1000 }).lines.length, 0);
});

test('a rule can be ended by the story that raised it', () => {
  const s = fresh();
  applyChanges(s, [{ op: 'inject_rule', house: 'stark', name: 'Smugglers of White Harbour', kind: 'income', formula: '300' }], { source: 'test' });
  const r = applyChanges(s, [{ op: 'inject_rule', house: 'stark', id: 'smugglers_of_white_harbour', status: 'end' }], { source: 'test' });
  assert.equal(r.rejected.length, 0);
  assert.equal(evaluateRules(s, s.houses.stark, { months: 1, luck: 1, gross: 1000 }).lines.length, 0);
  assert.equal(liveRules(s, 'stark').length, 0);
});

test('an injected rule survives a save round-trip (it is data, not code)', () => {
  const s = fresh();
  applyChanges(s, [{ op: 'inject_rule', house: 'stark', name: 'Tithe to the red priest', kind: 'expense', formula: 'house.holdings * 20' }], { source: 'test' });
  const back = JSON.parse(JSON.stringify(s));
  const out = evaluateRules(back, back.houses.stark, { months: 1, luck: 1, gross: 1000 });
  assert.equal(out.lines[0].kind, 'expense');
  assert.ok(out.lines[0].amount > 0);
});

test('a rule that runs away is stopped, not allowed to hang the turn', () => {
  const s = fresh();
  assert.equal(run(compile('2 ** 999999'), scopeFor(s)), 0); // no Infinity in the ledger
  assert.throws(() => compile('1' + ' + 1'.repeat(400)), RuleError); // and no formula long enough to stall a turn
});

// ── Geography that bites: the hard places of Westeros ──
import { crossings, chokepointToll, roadWarnings, hasLeave, roadCongestion, CHOKEPOINTS } from '../public/js/shared/chokepoints.js';

const host = (owner, men = 12000) => ({ id: 'h', owner, name: 'A host', men, morale: 70, kind: 'host' });

test('the roads of Westeros cross the places they should, and no others', () => {
  const s = fresh();
  const names = (a, b) => crossings(s.holdings[a].pos, s.holdings[b].pos).map((c) => c.cp.id).sort();
  assert.deepEqual(names('stark', 'tully'), ['green_fork', 'the_neck']); // south out of the North
  assert.deepEqual(names('baratheon', 'arryn'), ['bloody_gate']);        // into the Vale by land
  assert.deepEqual(names('lannister', 'tully'), ['golden_tooth']);
  assert.deepEqual(names('baratheon', 'martell'), ['princes_pass']);
  assert.deepEqual(names('baratheon', 'tully'), []);  // the riverlands are open country
  assert.deepEqual(names('stark', 'umber'), []);      // and so is the North itself
});

test('the Neck is kind to Starks and cruel to everyone else', () => {
  const s = fresh();
  const from = s.holdings.stark.pos, to = s.holdings.tully.pos;
  const north = chokepointToll(s, host('stark'), from, to, 40);
  const lion = chokepointToll(s, host('lannister'), to, from, 40); // marching the other way, uninvited
  const neckN = north.met.find((m) => m.id === 'the_neck');
  const neckL = lion.met.find((m) => m.id === 'the_neck');
  assert.equal(neckN.gated, true, 'Moat Cailin is Stark-held');
  assert.equal(neckL.gated, false, 'a Lannister host has no leave');
  assert.ok(neckL.lost > neckN.lost * 3, 'the bogs eat an unwelcome host');
  assert.ok(lion.days > north.days);
});

test('the crannogmen will guide a friend through the bogs', () => {
  const s = fresh();
  s.holdings.moat_cailin.owner = 'bolton'; // no longer the player's gate
  const a = host('tully');
  assert.equal(hasLeave(s, a, CHOKEPOINTS.find((c) => c.id === 'the_neck')), null);
  s.relations['reed|tully'] = { v: 45 };
  assert.equal(hasLeave(s, a, CHOKEPOINTS.find((c) => c.id === 'the_neck')), 'guides');
});

test('the Freys charge for their bridge, and the gold changes hands', () => {
  const s = fresh();
  const cp = CHOKEPOINTS.find((c) => c.id === 'green_fork');
  const a = host('stark', 10000);
  const t = chokepointToll(s, a, s.holdings.stark.pos, s.holdings.tully.pos, 40);
  assert.ok(t.gold >= (10000 / 1000) * cp.toll.perThousand * 0.9, 'a host of ten thousand pays for ten thousand');
});

test('winter doubles what a mountain costs', () => {
  const s = fresh();
  const summer = chokepointToll(s, host('lannister'), s.holdings.baratheon.pos, s.holdings.arryn.pos, 40);
  s.world.season = 'winter';
  const winter = chokepointToll(s, host('lannister'), s.holdings.baratheon.pos, s.holdings.arryn.pos, 40);
  assert.ok(winter.losses > summer.losses && winter.days > summer.days);
});

test('a fleet does not care about mountain passes', () => {
  const s = fresh();
  const t = chokepointToll(s, { ...host('greyjoy'), kind: 'fleet' }, s.holdings.stark.pos, s.holdings.tully.pos, 40);
  assert.equal(t.met.length, 0);
});

test('a lord is told what the road will cost before he takes it', () => {
  const s = fresh();
  const w = roadWarnings(s, host('lannister'), s.holdings.lannister.pos, s.holdings.arryn.pos);
  assert.ok(w.some((x) => /Bloody Gate|Mountains of the Moon/.test(x)), w.join(' | '));
});

// ── The toll a war takes on a mind ──
import { psycheTick, stressors, mindLine, stressBand, mindsDigest } from '../public/js/shared/psyche.js';

test('peace and home leave a man steady', () => {
  const s = fresh();
  for (let i = 0; i < 6; i++) psycheTick(s, 30);
  const ned = s.characters.eddard_stark;
  assert.equal(stressBand(ned), 'steady');
  assert.equal(mindLine(ned), '');
});

test('captivity, war and a dead child wear a man down', () => {
  const s = fresh();
  const c = s.characters.eddard_stark;
  c.status = 'imprisoned';
  s.wars.push({ name: 'The war', status: 'active', attackers: ['lannister'], defenders: ['stark'] });
  const why = stressors(s, c, 30).map((x) => x.why);
  assert.ok(why.includes('a captive'));
  assert.ok(why.some((w) => /war/.test(w)));
  for (let i = 0; i < 6; i++) psycheTick(s, 30);
  assert.ok((c.stress ?? 0) > 50, `expected a worn man, got ${c.stress}`);
  assert.ok(/strain|fraying|breaking/.test(mindLine(c)), mindLine(c));
});

test('the numbers never reach the player: the model is given behaviour, not figures', () => {
  const s = fresh();
  const c = s.characters.eddard_stark;
  c.stress = 72; c.paranoia = 80;
  const d = mindsDigest(s, 'stark');
  assert.ok(/fraying/.test(d));
  assert.ok(!/72|80/.test(d), 'a stress score must never be written into a prompt');
});

test('a mind that is breaking is felt by the house, not reported as a stat', () => {
  const s = fresh();
  const c = s.characters.eddard_stark;
  c.stress = 40;
  c.status = 'imprisoned';
  let events = [];
  for (let i = 0; i < 3 && !events.some((e) => e.mind); i++) events = psycheTick(s, 30).events;
  assert.ok(events.some((e) => e.mind), 'the household should notice');
  assert.ok(events.every((e) => !/\bstress\b|\d\d\/100/.test(e.text)));
});

test('a countryside on the move slows the host that marches through it', () => {
  const s = fresh();
  const from = s.holdings.stark.pos, to = s.holdings.manderly.pos;
  assert.equal(roadCongestion(s, from, to), 0, 'a realm at peace has clear roads');
  s.holdings.manderly.status = 'sacked';
  s.holdings.manderly.unrest = 90;
  const jam = roadCongestion(s, from, to);
  assert.ok(jam > 0.05 && jam <= 0.3, `expected a jammed road, got ${jam}`);
});

// ── The Citadel's shelves: retrieval instead of invention ──
import { searchLore, loreFor, loreBlock, loreIndex } from '../server/lore.js';

test('the shelves hold the lore the game ships with', () => {
  assert.ok(loreIndex().N > 300, 'expected a few hundred passages');
});

test('a question about the bogs finds the crannogmen, not a Lannister', () => {
  const hits = searchLore('the Neck Moat Cailin crannogmen bogs', 4);
  assert.ok(hits.length);
  assert.ok(/reed|crannog|neck|moat/i.test(hits[0].title + hits[0].text), hits[0].title);
});

test('what the maester has open on the table follows the game in progress', () => {
  const s = fresh('lannister');
  const block = loreBlock(s, { k: 5 });
  assert.ok(/Lannister/i.test(block), block.slice(0, 200));
  assert.ok(block.length < 4000, 'the shelves must not crowd out the world');
});

test('an empty question returns nothing rather than noise', () => {
  assert.deepEqual(searchLore('   ', 5), []);
});

test('north of the Wall resolves beyond the Wall, never Winterfell or Casterly Rock', () => {
  const s = fresh();
  const army = Object.values(s.parties).find((a) => a.owner === 'stark' && a.kind !== 'fleet'); // Winterfell's own garrison
  const { lines } = carryOut(s, { text: 'March north of the Wall.' }, { actions: [{ verb: 'march_host', params: { army: army.id, to: 'north of the Wall' } }] });
  assert.match(lines[0].text, /Hardhome/);
  assert.equal(s.parties[army.id].march.to, 'hardhome');
});

test('a large levy call starts a camp and the men arrive over days', () => {
  const s = fresh();
  const before = s.houses.stark.figures.levies.v;
  const { lines } = raiseLevies(s, { at: 'stark', men: 20000, name: 'The Northern Host', immediate: false });
  const host = Object.values(s.parties).find((a) => a.name === 'The Northern Host');
  assert.ok(host.muster.remaining > 0, lines.join(' '));
  assert.ok(host.men < 20000);
  assert.equal(s.houses.stark.figures.levies.v, before - Math.min(before, 20000));
});
