// The party model of WP B2 (docs/gdd/03-architecture.md §3.3–§5, §12, §14): everything that moves is a party that
// lists its people; journeys follow the roads of the atlas and cross water only aboard ship; everyone does one thing
// at a time; an older save arrives whole; and the world holds together turn after turn.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

process.env.WC_PROVIDER = 'mock';
process.env.WC_SAVES = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-parties-'));
const game = await import('../server/game.js');
const { createInitialState, migrateState, applyChanges, rideOf, startRide } = await import('../public/js/shared/world.js');
const { partyOf, setLoc, joinParty, disband, statusText, placeOf, ref } = await import('../public/js/engine/parties.js');
const { landPath, journey, planRoute, advance, pointAt, paceOf } = await import('../public/js/engine/movement.js');
const { activityOf, claim, canAttend, settleActivities } = await import('../public/js/engine/activity.js');
const { validate } = await import('../public/js/engine/state/validate.js');
const { landmassOf } = await import('../public/js/engine/geo.js');
const { ROADS } = await import('../public/data/geography.js');
const { retinueTick } = await import('../public/js/shared/retinues.js');
const { marchTick } = await import('../public/js/shared/marches.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fresh = (house = 'stark', seed = 298) => createInitialState('agot_298', house, { seed });
const H = (s, id) => s.holdings[id].pos;
test.after(() => fs.rmSync(process.env.WC_SAVES, { recursive: true, force: true }));

// ── Where people are ─────────────────────────────────────────────────────────────────────────────────────────────────
test('a person is in one place; a party lists exactly the people in it', () => {
  const s = fresh();
  applyChanges(s, [{ op: 'army_create', id: 'nh', owner: 'stark', name: 'The Northern Host', at: 'stark', men: 3000 }]);
  const robb = s.characters.robb_stark, theon = s.characters.theon_greyjoy;
  joinParty(s, robb, s.parties.nh); joinParty(s, theon, s.parties.nh);
  assert.equal(robb.loc, 'party:nh'); assert.deepEqual(s.parties.nh.members, ['robb_stark', 'theon_greyjoy']);
  assert.equal(placeOf(s, robb), 'stark', 'with the host where it has halted');
  setLoc(s, theon, 'stark');
  assert.deepEqual(s.parties.nh.members, ['robb_stark']);
  disband(s, s.parties.nh, 'stark');
  assert.equal(robb.loc, 'stark'); assert.equal(s.parties.nh, undefined);
  assert.deepEqual(validate(s), []);
});

test('a lone rider is a party on a road: it walks day by day, and gets down at the journey\'s end', () => {
  const s = fresh();
  const jon = s.characters.jon_snow;
  const r = startRide(s, jon, 'nights_watch');
  assert.equal(r.kind, 'rider'); assert.equal(partyOf(s, jon), r); assert.equal(r.march.to, 'nights_watch');
  assert.equal(r.route.pace, 40, 'a lone rider covers forty miles a day');
  assert.ok(r.route.days > 12 && r.route.days < 25, `Winterfell to the Wall in ${r.route.days} days`);
  const days = Math.ceil(r.route.days);
  const mt = marchTick(s, { span: 7, turnStart: 0 });
  assert.ok(s.parties[r.id] && jon.loc === ref(r.id), 'still on the road after a week');
  assert.ok(r.motion.path.length >= 2, 'the ground covered is kept for the map');
  marchTick(s, { span: days, turnStart: 7 });
  assert.equal(s.parties[r.id], undefined, 'the ride is over'); assert.equal(jon.loc, 'nights_watch');
  assert.deepEqual(validate(s), []);
  assert.ok(mt.events.length === 0 || mt.events.every((e) => !/reaches/.test(e.title)));
});

// ── Roads ───────────────────────────────────────────────────────────────────────────────────────────────────────────
test('a march keeps to dry land, and to the kingsroad where there is one', () => {
  const s = fresh();
  const r = landPath(H(s, 'stark'), H(s, 'baratheon'));
  assert.ok(r, 'Winterfell to King\'s Landing by land');
  for (const p of r.path.slice(1, -1)) assert.ok(landmassOf(p, 0) >= 0, `off the land at ${p}`);
  // walk the route a couple of units at a time: most of the miles are on the kingsroad
  const road = ROADS.find((x) => x.name === 'Kingsroad').pts; let on = 0, all = 0;
  for (let i = 1; i < r.path.length; i++) {
    const [a, b] = [r.path[i - 1], r.path[i]]; const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2);
    for (let k = 0; k < n; k++) { const p = [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]; all++; if (road.some((q, j) => j > 0 && segDist(p, road[j - 1], q) < 8)) on++; }
  }
  assert.ok(on / all > 0.65, `${Math.round((on / all) * 100)}% of the way on the kingsroad`);
  assert.equal(landPath(H(s, 'crowl'), H(s, 'stark')), null, 'Skagos has no road to Winterfell');
  assert.equal(landPath(H(s, 'greyjoy'), H(s, 'lannister')), null, 'nor Pyke to Casterly Rock');
});
function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l));
  return Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]);
}

test('the Wall is crossed only at its gates', () => {
  const s = fresh();
  const r = landPath(H(s, 'stark'), H(s, 'crasters_keep'));
  assert.ok(r, 'there is a way beyond the Wall');
  const gates = ['nights_watch', 'shadow_tower', 'eastwatch'].map((g) => H(s, g));
  // where the road crosses the line of the Wall (y ≈ 550), it is at one of the three castles
  const crossing = r.path.find((p, i) => i && (r.path[i - 1][1] - 552) * (p[1] - 552) <= 0);
  assert.ok(crossing && gates.some((g) => Math.hypot(g[0] - crossing[0], g[1] - crossing[1]) < 16), `crossed at ${crossing}`);
});

test('a rider bound for an island takes ship, and is aboard while at sea', () => {
  const s = fresh();
  const theon = s.characters.theon_greyjoy;
  const r = startRide(s, theon, 'greyjoy');
  assert.ok(r.route.sea, 'part of the way by ship');
  const [a, b] = r.route.sea; const mid = (r.route.t[a] + r.route.t[b]) / 2;
  advance(r, mid); marchTick(s, { span: 0.001, turnStart: 0 }); // settle it where it is
  assert.equal(r.state, 'embarked'); assert.ok(landmassOf(r.pos, 0) < 0, 'on the water');
  assert.deepEqual(validate(s), [], 'aboard ship is no breach of invariant 3');
});

test('a rider at sea is not turned about mid-voyage, and a road that cannot be found leaves the old one standing', () => {
  const s = fresh();
  const theon = s.characters.theon_greyjoy;
  const r = startRide(s, theon, 'greyjoy');
  const [a, b] = r.route.sea; advance(r, (r.route.t[a] + r.route.t[b]) / 2); marchTick(s, { span: 0.001, turnStart: 0 });
  const route = JSON.stringify(r.route);
  // the lord recalls him while he is on the water (the soak found a rider left "camped" on the sea this way)
  const out = applyChanges(s, [{ op: 'travel', character: 'theon_greyjoy', to: 'stark' }]);
  assert.equal(out.applied.length, 0); assert.match(out.rejected[0].reason, /at sea, and can turn only when the ship makes port/);
  assert.equal(JSON.stringify(r.route), route, 'the voyage goes on as it was');
  assert.equal(r.march.to, 'greyjoy');
  marchTick(s, { span: 30, turnStart: 0 });
  assert.equal(theon.loc, 'greyjoy', 'and he lands where the ship was bound'); assert.deepEqual(validate(s), []);
  // on land, a turn to somewhere no road reaches is refused and the ride goes on as before
  const jon = s.characters.jon_snow; const ride = startRide(s, jon, 'nights_watch'); const was = JSON.stringify(ride.march);
  assert.throws(() => startRide(s, jon, 'party:the_silence'), /no road or sea lane/); // a ship on the open sea: no rider reaches it
  assert.equal(JSON.stringify(ride.march), was); assert.ok(ride.route, 'the old road stands');
});

test('a long journey by land may go by sea when a ship is clearly quicker — for a traveller, never a host', () => {
  const s = fresh();
  const ports = Object.values(s.holdings).filter((h) => h.coastal).map((h) => h.pos);
  const ride = journey(H(s, 'stark'), H(s, 'hightower'), 40, { ports, passage: true });
  const walk = journey(H(s, 'stark'), H(s, 'hightower'), 40, { ports });
  assert.equal(walk.sea, null); assert.ok(ride.days < walk.days * 0.9, `${ride.days} by ship, ${walk.days} by road`);
});

test('the pace of a party: riders, households, the King\'s progress, levies and horse', () => {
  const s = fresh();
  assert.equal(paceOf(s, { kind: 'rider' }), 40); assert.equal(paceOf(s, { kind: 'retinue' }), 25); assert.equal(paceOf(s, { kind: 'progress' }), 30);
  assert.equal(paceOf(s, { kind: 'host', owner: 'dothraki', men: 40000, composition: 'Dothraki screamers' }), 24, 'a great horde rides at 30, slowed by its size');
  assert.equal(paceOf(s, { kind: 'host', owner: 'stark', men: 5000, composition: 'Levies of House Stark' }), 18);
  assert.equal(paceOf(s, { kind: 'fleet', owner: 'greyjoy' }), 90, 'longships');
});

test('advancing a route moves exactly by days, and the position is always on the road', () => {
  const s = fresh();
  const p = { id: 'x', kind: 'host', owner: 'stark', men: 3000, pos: [...H(s, 'stark')], members: [] };
  planRoute(s, p, H(s, 'moat_cailin'), 'moat_cailin');
  const total = p.route.days;
  const a = advance(p, 5); assert.equal(a.used, 5); assert.deepEqual(p.pos, pointAt(p.route, 5));
  p.delay = 2; const b = advance(p, 5); assert.equal(b.wait, 2); assert.ok(Math.abs(p.route.done - 8) < 1e-6);
  const c = advance(p, 100); assert.ok(c.arrived); assert.ok(Math.abs(c.used - (total - 8)) < 1e-3);
});

// ── What parties are doing ─────────────────────────────────────────────────────────────────────────────────────────
test('what a host is doing is the engine\'s word: the story\'s status is not kept (B-20)', () => {
  const s = fresh();
  applyChanges(s, [{ op: 'army_create', id: 'lh', owner: 'lannister', name: 'The Host of Casterly Rock', at: 'lannister', men: 12000 }, { op: 'army_march', army: 'lh', to: 'Riverrun' }]);
  const r = applyChanges(s, [{ op: 'army_update', army: 'lh', status: 'holding at the Golden Tooth' }], { protectPlayer: true });
  assert.equal(s.parties.lh.status, undefined); assert.equal(s.parties.lh.state, 'marching');
  assert.match(statusText(s, s.parties.lh), /^marching for Riverrun/);
  assert.equal(r.rejected.length + r.applied.length, 1);
});

test('the story may move a host a short step at once; anything farther is a march the engine walks', () => {
  const s = fresh();
  applyChanges(s, [{ op: 'army_create', id: 'lh', owner: 'lannister', name: 'The Host of Casterly Rock', at: 'lannister', men: 12000 }]);
  applyChanges(s, [{ op: 'army_move', army: 'lh', to: 'Riverrun', progress: 1 }], { protectPlayer: true });
  assert.equal(s.parties.lh.at, null); assert.equal(s.parties.lh.march.to, 'tully'); assert.deepEqual(s.parties.lh.pos, H(s, 'lannister'), 'no teleport');
  applyChanges(s, [{ op: 'army_move', army: 'lh', to: 'lannisport' }], { protectPlayer: true });
  assert.equal(s.parties.lh.at, 'lannisport', 'Lannisport is a morning\'s march from the Rock');
});

// ── One thing at a time ──────────────────────────────────────────────────────────────────────────────────────────────
test('everyone does one thing: lords rule, commanders command, riders ride, prisoners are captive', () => {
  const s = fresh();
  assert.equal(activityOf(s, s.characters.eddard_stark).kind, 'ruling');
  applyChanges(s, [{ op: 'army_create', id: 'nh', owner: 'stark', name: 'The Northern Host', at: 'stark', men: 3000, commander: 'robb_stark' }]);
  joinParty(s, s.characters.robb_stark, s.parties.nh); settleActivities(s);
  assert.equal(activityOf(s, s.characters.robb_stark).kind, 'commanding');
  startRide(s, s.characters.jon_snow, 'nights_watch'); settleActivities(s);
  assert.equal(activityOf(s, s.characters.jon_snow).kind, 'travelling');
  applyChanges(s, [{ op: 'character', id: 'tyrion_lannister', status: 'imprisoned', loc: 'arryn' }]); settleActivities(s);
  assert.equal(activityOf(s, s.characters.tyrion_lannister).kind, 'captive');
  assert.deepEqual(validate(s, { only: [2] }), []);
});

test('a claim is refused when something that matters more holds them — unless their liege commands it', () => {
  const s = fresh();
  applyChanges(s, [{ op: 'army_create', id: 'nh', owner: 'stark', name: 'The Northern Host', at: 'stark', men: 3000, commander: 'robb_stark' }]);
  joinParty(s, s.characters.robb_stark, s.parties.nh); settleActivities(s);
  const no = claim(s, s.characters.robb_stark, { kind: 'attending' });
  assert.equal(no.ok, false); assert.match(no.reason, /leading a host/);
  assert.equal(claim(s, s.characters.robb_stark, { kind: 'travelling' }, { force: true }).ok, true);
  assert.equal(canAttend(s, s.characters.eddard_stark, 'attending'), true, 'a lord at home may go visiting');
});

test('no-feasts-at-war: a lord called to the banners rides to no feast while the call stands (B-10)', () => {
  const s = fresh(); let seed = 11; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const h of Object.values(s.houses)) if (h.liege === 'tully') h.obligations = { ...(h.obligations || {}), levies: 'called', muster: 'tully' };
  const called = new Set(Object.values(s.houses).filter((h) => h.liege === 'tully').map((h) => h.lord));
  for (let day = 0; day < 60; day++) {
    retinueTick(s, 1, r);
    for (const a of Object.values(s.parties).filter((x) => x.kind === 'retinue')) assert.ok(!called.has(a.commander), `${a.commander} went visiting while called`);
    marchTick(s, { span: 1, turnStart: day });
  }
  for (const id of called) if (s.characters[id]?.alive && s.characters[id].loc === s.houses[s.characters[id].house]?.seat) assert.equal(activityOf(s, s.characters[id]).kind, 'mustering');
});

// ── The King's progress (15 §2 kings-progress, B-06) ────────────────────────────────────────────────────────────────
test('kings-progress: the court rides in the progress along the kingsroad, and is at Winterfell only when it arrives', async () => {
  const { id } = game.newGame('agot_298', 'tyrell');
  let arrivedTurn = null;
  for (let t = 1; t <= 12 && arrivedTurn == null; t++) {
    const r = await game.advance(id, { span: '7d' });
    const s = game.loadState(id); const pg = s.parties.royal_progress;
    const told = r.turn.events.some((e) => /King comes to Winterfell/.test(e.title));
    if (pg && pg.at !== 'stark') {
      assert.ok(!told, `turn ${t}: the King "comes to Winterfell" while the progress is at ${pg.at || pg.pos}`);
      assert.ok(landmassOf(pg.pos, 1) >= 0, 'the progress is on land');
      assert.equal(s.characters.robert_baratheon.loc, 'party:royal_progress', 'Robert rides in it until it arrives');
    }
    if (pg?.at === 'stark') arrivedTurn = t;
    assert.deepEqual(validate(s), [], `turn ${t}`);
  }
  assert.ok(arrivedTurn, 'the progress reaches Winterfell within twelve weeks');
});

// ── Older saves ─────────────────────────────────────────────────────────────────────────────────────────────────────
test('the v2 fixture save loads: armies become parties, riders become parties, and the world holds together', async () => {
  const raw = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ROOT, 'tests/fixtures/saves/v2-stark-turn3.json.gz'))));
  assert.equal(raw.version, 2); assert.ok(raw.armies && !raw.parties);
  const s = migrateState(structuredClone(raw));
  assert.equal(s.version, 3); assert.equal(s.armies, undefined);
  assert.ok(Object.values(s.parties).every((p) => p.kind && p.state && !('status' in p) && !('type' in p)));
  assert.ok(!Object.values(s.characters).some((c) => String(c.loc).startsWith('army:') || c.travel), 'no army: locations, no loose riders');
  assert.equal(rideOf(s, s.characters.luwin)?.march.to, 'hightower', 'Luwin, riding for Oldtown in the old save, is a rider party');
  assert.equal(s.parties.royal_progress.kind, 'progress');
  assert.deepEqual(validate(s), []);
  // and it plays on
  const id = 'v2-fixture';
  fs.mkdirSync(path.join(process.env.WC_SAVES, id), { recursive: true });
  fs.writeFileSync(path.join(process.env.WC_SAVES, id, 'state.json'), JSON.stringify(raw));
  const r = await game.advance(id, { span: '7d' });
  assert.equal(r.turn.invariants, undefined, (r.turn.invariants || []).join('; '));
  assert.deepEqual(validate(game.loadState(id)), []);
});
