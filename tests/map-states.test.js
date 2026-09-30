// The living map's states and the graphics presets (docs/gdd/11-map-visuals.md §6.2, §6.4, §10; WP E6 + E7). The rules are pure (map3d/states.js), so every state can be tested without a canvas:
//   • each holding status has its look (a burning holding a black column and embers, a besieged one a thin grey smoke, a rising one torches and a mob, an occupied one watch-fires, a ruin nothing);
//   • a tourney is pavilions and lanterns, a feast or a wedding lanterns — read from the chronicle's cards of the last two turns and no older; a battle a dust puff and stakes for two turns;
//   • a camped or besieging host has tents and a fire in proportion to its men; a retinue is three to twelve riders and the progress about forty figures;
//   • weather: winter snows in the North and not at L0/L1, autumn rains on some days by the day's own hash, summer none; it is the same on the same day;
//   • the presets: Fast draws no particles, the emitters are capped and the ones nearest the player's lands win the cap, and the order the state lists things in changes nothing;
//   • nothing here draws a die or reads a clock.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const S = await import('../public/js/map3d/states.js');
const { createInitialState } = await import('../public/js/shared/world.js');
const world = () => createInitialState('agot_298', 'stark', { seed: 3 });
const clone = (x) => JSON.parse(JSON.stringify(x));

test('a holding\'s look follows its status', () => {
  assert.deepEqual(S.holdingLook({ status: 'normal' }), { smoke: null, embers: false, siege: false, torches: 0, mob: 0, watchfires: 0, ruin: false });
  assert.equal(S.holdingLook({ status: 'burning' }).smoke, 'black'); assert.equal(S.holdingLook({ status: 'burning' }).embers, true);
  assert.equal(S.holdingLook({ status: 'sacked' }).smoke, 'black');
  assert.equal(S.holdingLook({ status: 'besieged' }).smoke, 'grey'); assert.equal(S.holdingLook({ status: 'besieged' }).siege, true); assert.equal(S.holdingLook({ status: 'besieged' }).embers, false);
  assert.ok(S.holdingLook({ status: 'rising' }).torches > 0 && S.holdingLook({ status: 'rising' }).mob > 0);
  assert.ok(S.holdingLook({ status: 'occupied' }).watchfires > 0);
  const r = S.holdingLook({ status: 'ruin' }); assert.equal(r.ruin, true); assert.equal(r.smoke, null);
  assert.equal(S.holdingLook({ status: 'razed' }).ruin, true); assert.equal(S.holdingLook(null).smoke, null);
});

test('a tourney, a feast, a wedding and a battle are on the map for two turns and no longer', () => {
  const s = world(); const ids = Object.keys(s.holdings);
  s.meta.turn = 5;
  s.history = [
    { turn: 5, events: [{ kind: 'tourney', where: ids[0] }, { kind: 'feast', where: ids[0] }, { kind: 'feast', where: ids[1] }, { kind: 'wedding', where: ids[2] }, { kind: 'death', where: ids[3] }] },
    { turn: 3, events: [{ kind: 'tourney', where: ids[4] }] },
  ];
  const f = S.festivalsOf(s);
  assert.equal(f.get(ids[0]), 'tourney', 'the weightier wins a place'); assert.equal(f.get(ids[1]), 'feast'); assert.equal(f.get(ids[2]), 'wedding');
  assert.ok(!f.has(ids[3]), 'a death is not a festival'); assert.ok(!f.has(ids[4]), 'a tourney three turns ago is over');
  s.battles = [{ turn: 5, pos: [10, 20] }, { turn: 4, pos: [30, 40] }, { turn: 2, pos: [50, 60] }, { turn: 5 }];
  assert.deepEqual(S.battleMarks(s).map((b) => b.pos), [[10, 20], [30, 40]], 'this turn and last; none without a place');
});

test('a camp and the figures of a company on the road', () => {
  assert.equal(S.campLook({ kind: 'host', state: 'marching', men: 5000 }), null);
  const c = S.campLook({ kind: 'host', state: 'camped', men: 3000 }); assert.ok(c.tents >= 3 && c.tents <= 12 && c.fire && !c.lines);
  assert.equal(S.campLook({ kind: 'host', state: 'besieging', men: 3000 }).lines, true);
  assert.ok(S.campLook({ kind: 'host', state: 'camped', men: 20000 }).tents > S.campLook({ kind: 'host', state: 'camped', men: 300 }).tents, 'more men, more tents');
  assert.equal(S.campLook({ kind: 'fleet', state: 'camped', men: 900 }), null); assert.equal(S.campLook({ kind: 'progress', state: 'camped', men: 400 }), null);
  for (const men of [10, 30, 90, 400]) assert.ok(S.figuresFor({ kind: 'retinue', men }).count >= 3 && S.figuresFor({ kind: 'retinue', men }).count <= 12, `a retinue of ${men}`);
  assert.equal(S.figuresFor({ kind: 'progress', men: 380 }).count, 40);
  assert.equal(S.figuresFor({ kind: 'host', men: 100 }).count, 1); assert.equal(S.figuresFor({ kind: 'host', men: 100000 }).count, 18, 'a host\'s figures are capped at eighteen');
});

test('the weather: snow in the North in winter, from L2 in only; rain on some autumn days by the day\'s hash; the same on the same day', () => {
  assert.equal(S.weatherOf({ season: 'winter', region: 'north', day: 100, lod: 1.0 }).kind, null, 'a distant map has no weather');
  const w = S.weatherOf({ season: 'winter', region: 'north', day: 100, lod: 2 }); assert.equal(w.kind, 'snow'); assert.ok(w.density >= 0.6 && w.density <= 1);
  assert.notEqual(S.weatherOf({ season: 'winter', region: 'dorne', day: 100, lod: 2 }).kind, 'snow');
  assert.equal(S.weatherOf({ season: 'summer', region: 'north', day: 100, lod: 3 }).kind, null);
  let rainy = 0; for (let d = 0; d < 300; d++) if (S.weatherOf({ season: 'autumn', region: 'riverlands', day: d, lod: 2 }).kind === 'rain') rainy++;
  assert.ok(rainy > 50 && rainy < 130, `${rainy} rainy days of 300 (about 30 %)`);
  assert.deepEqual(S.weatherOf({ season: 'autumn', region: 'vale', day: 77, lod: 2 }), S.weatherOf({ season: 'autumn', region: 'vale', day: 77, lod: 2 }));
});

test('the presets: Fast draws no particles and no ambient life; the emitters are capped, nearest the player\'s lands first, whatever order the state lists them in', () => {
  assert.equal(S.PRESETS.fast.effects.particles, false); assert.equal(S.PRESETS.fast.ambient, false); assert.equal(S.PRESETS.fast.shadows, false);
  assert.ok(S.PRESETS.high.effects.smoke > S.PRESETS.balanced.effects.smoke && S.PRESETS.high.effects.weather > S.PRESETS.balanced.effects.weather);
  assert.equal(S.presetOf('nonsense'), S.PRESETS.balanced);
  const s = world(); const own = Object.values(s.holdings).filter((h) => h.owner === 'stark').map((h) => h.pos);
  const burning = Object.values(s.holdings).slice(0, 60); burning.forEach((h) => { h.status = 'burning'; });
  const bal = S.emittersOf(s, 'balanced', { own }); const smokes = bal.filter((e) => e.kind === 'smoke');
  assert.equal(smokes.length, S.PRESETS.balanced.effects.smoke, 'capped at the preset\'s smoke');
  const nearest = burning.map((h) => ({ id: h.id, d: Math.min(...own.map((o) => Math.hypot(h.pos[0] - o[0], h.pos[1] - o[1]))) })).sort((a, b) => a.d - b.d || a.id.localeCompare(b.id)).slice(0, S.PRESETS.balanced.effects.smoke).map((x) => `${x.id}:smoke`).sort();
  assert.deepEqual(smokes.map((e) => e.id).sort(), nearest, 'the ones nearest the player\'s lands win the cap');
  const t = clone(s); t.holdings = Object.fromEntries(Object.entries(t.holdings).reverse());
  assert.deepEqual(S.emittersOf(t, 'balanced', { own }), bal, 'the order of the state changes nothing');
  assert.equal(S.emittersOf(s, 'fast', { own }).filter((e) => e.kind === 'smoke' || e.kind === 'embers' || e.kind === 'lantern').length, 0, 'Fast: no smoke, embers or lanterns');
  assert.equal(S.emittersOf(world(), 'balanced', { seen: new Set() }).length, 0, 'a quiet world, with no host in sight, asks for nothing');
  // a camp is drawn only for a host the player's eyes are on: one only reported has no tents, and a garrison (not a token) none
  const w = world(); const camped = Object.values(w.parties).filter((p) => p.state === 'camped' && p.kind !== 'garrison' && p.kind !== 'fleet');
  assert.ok(camped.length >= 3, 'the scenario has camped hosts'); assert.ok(Object.values(w.parties).some((p) => p.kind === 'garrison' && p.state === 'camped'));
  assert.deepEqual(S.emittersOf(w, 'balanced', { seen: new Set([camped[0].id]) }).map((e) => e.id), [`${camped[0].id}:camp`], 'only the host in sight');
  const garrisons = new Set(Object.values(w.parties).filter((p) => p.kind === 'garrison').map((p) => `${p.id}:camp`));
  assert.ok(!S.emittersOf(w, 'balanced').some((e) => garrisons.has(e.id)), 'no tents for a garrison');
});

test('the solid things of a camp and a field are asked for even at Fast (tents and stakes: instanced, no particles)', () => {
  const s = world(); s.meta.turn = 4; s.battles = [{ turn: 4, pos: [100, 100] }];
  s.parties.c1 = { id: 'c1', owner: 'stark', kind: 'host', state: 'camped', men: 1200, pos: [50, 60] };
  const fast = S.emittersOf(s, 'fast'); assert.ok(fast.some((e) => e.kind === 'campfire' && e.tents >= 3) && fast.some((e) => e.kind === 'dust'));
  const bal = S.emittersOf(s, 'balanced'); assert.ok(bal.some((e) => e.kind === 'campfire') && bal.some((e) => e.kind === 'dust'));
});

test('the map draws what these rules say: the effects are wired into the scene and its settings, and nothing in them draws a die or reads a clock', () => {
  const rd = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');
  const map = rd('public/js/map3d/MapScene.js'); const fx = rd('public/js/map3d/effects.js'); const st = rd('public/js/map3d/states.js'); const app = rd('public/js/app.js');
  assert.match(map, /this\.syncEffects\(\)/); assert.match(map, /new Effects\(this\.scene/); assert.match(map, /this\.effects\.frame\(time/); assert.match(map, /const QUALITY = PRESETS/);
  assert.match(map, /const sd = Math\.min\(560, this\.dist \* 0\.62\)/, 'the shadow frustum is no wider than the view');
  assert.doesNotMatch(st, /Math\.random|Date\.now|performance\.now|new Date/); assert.doesNotMatch(fx, /Math\.random|Date\.now|new Date/);
  assert.match(app, /Beautiful/); assert.match(app, /value="fast">Fast/);
  assert.ok(fs.existsSync(path.join(ROOT, 'public/dev/holdings.html')), 'the fixture page');
});
