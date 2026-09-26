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
  const total = (s.armies.n1?.men || 0) + (s.armies.l1?.men || 0);
  assert.ok(total < 20000 && total > 10000);
  assert.ok(s.battles.length === 1 && s.landmarks.some((l) => l.kind === 'battle'));
});
test('a great castle is not stormed in a moon; a siege starves it in time', () => {
  const s = fresh();
  apply(s, [{ op: 'war', status: 'start', name: 'W', attackers: ['lannister'], defenders: ['tully'] }, { op: 'army_create', id: 's1', owner: 'lannister', name: 'S', at: 'tully', men: 9000 }]);
  for (const a of Object.values(s.armies)) if (a.id !== 's1' && ['tully', 'stark'].includes(a.owner)) delete s.armies[a.id];
  resolveWarfare(s, 30, { r: () => 0.99 });
  assert.equal(s.holdings.tully.status, 'besieged'); assert.equal(s.holdings.tully.owner, 'tully');
  for (let i = 0; i < 40 && s.holdings.tully.owner === 'tully'; i++) resolveWarfare(s, 30, { r: () => 0.99 });
  assert.equal(s.holdings.tully.owner, 'lannister');
});

// ── Orders read by rule: spelled-out numbers ──
import { wordNumber } from '../server/orders.js';
test('dictated numbers are read: "ten men", "a hundred riders", "two hundred and fifty men"', () => {
  assert.equal(wordNumber('Ride to Oldtown with ten men.'), 10);
  assert.equal(wordNumber('take a hundred riders'), 100);
  assert.equal(wordNumber('two hundred and fifty men'), 250);
  assert.equal(wordNumber('a score of knights'), 20);
  assert.equal(wordNumber('send men north'), null);
});

// ── Fog of war ──
import { viewOfArmies, updateIntel } from '../public/js/shared/intel.js';
test('the player sees hosts near their lands; distant ones by word of mouth, which can be stale or feinted', () => {
  const s = fresh();
  apply(s, [{ op: 'army_create', id: 'far', owner: 'martell', name: 'Dornish spears', at: 'martell', men: 6000 }, { op: 'army_create', id: 'near', owner: 'bolton', name: 'Bolton host', at: 'stark', men: 2000 }]);
  assert.equal(viewOfArmies(s).get('near')?.known, 'seen');
  updateIntel(s, () => 0); // word travels: a great host is heard of
  let v = viewOfArmies(s).get('far'); assert.equal(v.known, 'reported'); assert.ok(Math.abs(v.men - 6000) <= 1600);
  s.armies.far.feint = 'tyrell'; s.meta.turn++; updateIntel(s, () => 0); // a feint sends word the wrong way
  assert.deepEqual(viewOfArmies(s).get('far').pos, s.holdings.tyrell.pos);
  delete s.armies.far.feint; s.armies.far.secrecy = 'hidden'; s.armies.far.pos = [...s.holdings.yronwood.pos];
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
import { executeActions, commandable, carryOutOrders } from '../server/orders.js';
test('"march the whole host to Moat Cailin" sends the sworn hosts on the road there too', async () => {
  const s = fresh();
  apply(s, [{ op: 'army_create', id: 'hb', owner: 'bolton', name: 'Host of House Bolton', at: 'bolton', men: 4000 }]);
  s.houses.bolton.obligations = { levies: 'answered', host: 'hb', muster: 'stark' };
  assert.ok(commandable(s, s.armies.hb));
  s.orders = [{ id: 'o1', text: 'Raise the whole host and march to Moat Cailin.' }];
  await carryOutOrders(s, async () => ({ actions: [{ op: 'raise', order: 1, at: 'stark', men: 3000, to: 'Moat Cailin' }], story: [] }));
  assert.equal(s.armies.hb.march?.to, 'moat_cailin');
  assert.ok(Object.values(s.armies).some((a) => a.owner === 'stark' && a.march?.to === 'moat_cailin'));
});
test('an order against a house marches on its seat', () => {
  const s = fresh(); apply(s, [{ op: 'army_create', id: 'nh', owner: 'stark', name: 'Host', at: 'stark', men: 5000 }]);
  executeActions(s, [{ op: 'march', order: 1, army: 'the army', to: 'the Lannisters' }]);
  assert.equal(s.armies.nh.march?.to, 'lannister');
});

// ── Orders, whereabouts and force counts agree ──
import { applyChanges, roadPos } from '../public/js/shared/world.js';
import { whereabouts } from '../public/js/shared/roads.js';
import { named } from '../server/orders.js';
test('the story model cannot send the player\'s people or move the player\'s hosts', () => {
  const s = fresh(); apply(s, [{ op: 'army_create', id: 'nh', owner: 'stark', name: 'Host', at: 'stark', men: 900 }]);
  const guard = s.houses.stark.figures.menAtArms.v;
  const r = applyChanges(s, [{ op: 'travel', character: 'jon_snow', to: 'kings_landing', men: 400 }, { op: 'army_move', army: 'nh', to: 'lannister' }, { op: 'character', id: 'sansa_stark', loc: 'kings_landing' }], { protectPlayer: true });
  assert.equal(r.rejected.length, 2);
  assert.equal(s.characters.jon_snow.travel, undefined);
  assert.equal(s.characters.sansa_stark.loc, 'stark');
  assert.equal(s.armies.nh.at, 'stark');
  assert.equal(s.houses.stark.figures.menAtArms.v, guard);
});
test('a journey is not begun twice, and a rider turned back starts from the road', () => {
  const s = fresh();
  apply(s, [{ op: 'travel', character: 'jon_snow', to: 'kings_landing' }]);
  assert.equal(apply(s, [{ op: 'travel', character: 'jon_snow', to: 'kings_landing' }]).rejected.length, 1);
  s.characters.jon_snow.travel.left = Math.round(s.characters.jon_snow.travel.days / 2);
  const mid = roadPos(s, s.characters.jon_snow);
  apply(s, [{ op: 'travel', character: 'jon_snow', to: 'stark' }]);
  assert.equal(s.characters.jon_snow.travel.to, 'stark');
  assert.deepEqual(s.characters.jon_snow.travel.from, mid);
  assert.match(whereabouts(s, s.characters.jon_snow).text, /on the road to Winterfell/);
});
test('someone the story moves far away rides there instead of appearing', () => {
  const s = fresh();
  apply(s, [{ op: 'character', id: 'tyrion_lannister', loc: 'castle_black' }]);
  const t = s.characters.tyrion_lannister;
  assert.notEqual(t.loc, 'nights_watch'); assert.equal(t.travel?.to, 'nights_watch');
});
test('an order sends only the one it names, and only with men if it asks for them', () => {
  const s = fresh(); const guard = s.houses.stark.figures.menAtArms.v;
  s.orders = [{ id: 'o1', text: 'Ser Rodrik is to garrison Winterfell and drill the levies.' }, { id: 'o2', text: 'Send Jon north to the Wall.' }];
  const res = executeActions(s, [{ op: 'travel', order: 1, character: 'robb_stark', to: 'Winterfell', men: 400 }, { op: 'travel', order: 2, character: 'jon_snow', to: 'the wall', men: 50 }], s.orders);
  assert.match(res[1][0], /does not name Robb/);
  assert.equal(s.characters.robb_stark.travel, undefined);
  assert.equal(s.houses.stark.figures.menAtArms.v, guard);
  assert.equal(s.characters.jon_snow.travel?.to, 'nights_watch');
  assert.ok(named(s, s.characters.catelyn_stark, 'Send my wife to Riverrun'));
  assert.ok(!named(s, s.characters.arya_stark, 'Send Jon to the Wall'));
});
test('a lord leading a small company turns the company', () => {
  const s = fresh();
  apply(s, [{ op: 'travel', character: 'jory_cassel', to: 'kings_landing', men: 50 }]);
  const co = s.armies[s.characters.jory_cassel.loc.slice(5)];
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
test('an order to garrison and drill hires no one', () => {
  const s = fresh(); const gold = s.houses.stark.figures.treasury.v;
  s.orders = [{ id: 'o1', text: 'Order Ser Rodrik to garrison Winterfell, drill the levies and count our stores for winter.' }, { id: 'o2', text: 'Recruit two hundred men-at-arms at Winterfell.' }];
  const res = executeActions(s, [{ op: 'recruit', order: 1, at: 'Winterfell', men: 1200 }, { op: 'recruit', order: 2, at: 'Winterfell', men: 200 }], s.orders);
  assert.match(res[1][0], /does not ask for men/);
  assert.equal(s.houses.stark.figures.treasury.v, gold - 200 * 9);
});
test('council: each answer is bound to the advisor who gave it', () => {
  const P = { vayon_poole: 'Vayon Poole', luwin: 'Maester Luwin', rodrik_cassel: 'Ser Rodrik Cassel', jory_cassel: 'Jory Cassel' };
  const r = readReplies('{"replies":[{"speaker":"Vayon","text":"The stores are counted."},{"speaker":"maester_luwin","text":"The letters are read."},{"speaker":"","text":"*Ser Rodrik tugs his whiskers.* The gates are watched."}]}', P, 'vayon_poole');
  assert.deepEqual(r.replies.map((x) => x.speaker), ['vayon_poole', 'luwin', 'rodrik_cassel']);
});
test('a raven order sends a letter, not a rider', () => {
  const s = fresh();
  s.orders = [{ id: 'o1', text: 'Have Vayon send a discreet raven to the Eyrie about Jon Arryn\'s last days.' }];
  const res = executeActions(s, [{ op: 'travel', order: 1, character: 'vayon_poole', to: 'The Eyrie', men: 0 }], s.orders);
  assert.match(res[1][0], /letter/);
  assert.equal(s.characters.vayon_poole.travel, undefined);
});
test('a letter is tracked: in flight, delivered, answered', async () => {
  const { postLetters } = await import('../server/orders.js');
  const { postTick, underway } = await import('../public/js/shared/errands.js');
  const { addDays } = await import('../public/js/shared/world.js');
  const s = fresh(); s.post = [];
  postLetters(s, [{ id: 'o1', text: 'Send a discreet raven to Lady Lysa Arryn at the Eyrie about Jon Arryn\'s last days.' }]);
  assert.equal(s.post.length, 1); assert.equal(s.post[0].to, 'lysa_arryn'); assert.equal(s.post[0].status, 'in flight');
  assert.ok(underway(s).some((x) => x.kind === 'raven'));
  s.meta.date = addDays(s.meta.date, s.post[0].days); postTick(s); assert.equal(s.post[0].status, 'delivered');
  apply(s, [{ op: 'raven', from: 'lysa_arryn', to: 'eddard_stark', text: 'Dearest brother…' }]); postTick(s);
  assert.equal(s.post[0].status, 'answered');
});
test('an order\'s receipt changes nothing, and the turn does what it said', async () => {
  const { previewOrders } = await import('../server/orders.js');
  const s = fresh(); const guard = s.houses.stark.figures.menAtArms.v;
  s.orders = [{ id: 'o1', text: 'Send Jory Cassel to King\'s Landing with twenty men.' }];
  const ask = async () => ({ actions: [{ op: 'travel', order: 1, character: 'jory_cassel', to: "King's Landing", men: 20 }], story: [] });
  await previewOrders(s, ask);
  assert.match(s.orders[0].preview[0], /Jory Cassel rides for King's Landing with 20 men/);
  assert.equal(s.characters.jory_cassel.loc, 'stark'); assert.equal(s.houses.stark.figures.menAtArms.v, guard);
  await carryOutOrders(s, async () => { throw new Error('the model is not asked again'); });
  assert.ok(String(s.characters.jory_cassel.loc).startsWith('army:'));
  assert.match(s.orders[0].result[0], /rides for King's Landing/);
});
test('an action the model left without its "op" is still carried out', async () => {
  const { planOrders } = await import('../server/orders.js');
  const s = fresh();
  const acts = await planOrders(s, [{ text: 'Send Jory Cassel to Castle Black with fifty men.' }], async () => ({ actions: [{ order: 1, character: 'jory_cassel', to: 'Castle Black', men: 50 }], story: [] }));
  assert.equal(acts[0].op, 'travel');
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
  const res = executeActions(s, [{ op: 'raise', order: 1, at: 'stark', men: 3000, name: 'The Northern Host', commander: 'robb_stark' }, { op: 'raise', order: 1, at: 'stark', men: 1000 }, { vassals: 'all', order: 1, at: 'Winterfell' }], s.orders);
  const hosts = Object.values(s.armies).filter((a) => a.owner === 'stark' && a.at === 'stark' && !/garrison/i.test(a.status || ''));
  assert.equal(hosts.length, 1); assert.equal(hosts[0].men, 4000); assert.equal(hosts[0].name, 'The Northern Host');
  assert.equal(s.characters.robb_stark.loc, 'army:' + hosts[0].id);
  assert.equal(s.houses.umber.obligations.levies, 'called');
  assert.match(res[1].join(' '), /join The Northern Host, now 4,000 men under Robb Stark/);
});
test('every order has its event, first, even when the story forgot it', async () => {
  const { orderEvents } = await import('../server/orders.js');
  const s = fresh();
  const orders = [{ id: 'a', text: 'Call the banners.', result: ['The banners are called: 20 sworn houses summoned to muster at Winterfell'] }, { id: 'b', text: 'Buy the Iron Throne for sixty million dragons.', result: ['could not be done: not enough gold'] }, { id: 'c', text: 'Tell Robb he did well.' }];
  const told = [{ order: 3, title: 'Ned praises his son', text: '…', houses: [] }];
  const extra = orderEvents(s, orders, told);
  assert.equal(extra.length, 2); assert.ok(told[0].mine);
  assert.match(extra[0].title, /The banners are called/); assert.match(extra[1].title, /Your command fails: not enough gold/);
});
test('a plain order in lower case still raises the host and calls the banners', async () => {
  const { planOrders } = await import('../server/orders.js');
  const s = fresh();
  const o = [{ id: 'o', text: 'assemeble the men of the north at winterfell and create a great northern host of all able body men and boys' }];
  const acts = await planOrders(s, o, async () => ({ actions: [], story: [1] }));
  const res = executeActions(s, acts, o);
  assert.ok(acts.some((a) => a.op === 'raise'), JSON.stringify(acts));
  assert.match(res[1].join(' '), /levies muster at Winterfell/);
});
test('the Pax order: banners called and the Northern Host raised at Winterfell', async () => {
  const { planOrders } = await import('../server/orders.js');
  const s = fresh();
  const o = [{ id: 'o', text: 'assemeble the men of the north at winterfell and create a great northern host of all able body men and boys' }];
  const acts = await planOrders(s, o, async () => ({ actions: [], story: [1] }));
  executeActions(s, acts, o);
  assert.equal(s.houses.umber.obligations.levies, 'called');
  assert.ok(Object.values(s.armies).some((a) => a.owner === 'stark' && a.name === 'The Northern Host' && a.men > 10000));
});
