// The turn told on the map (docs/gdd/11-map-visuals.md §11; WP E8): the rules of ui/choreo.js, pure, and the runner that plays them for the game and for the fixture page.
//   • the camera flies only for news of weight (importance ≥ 3) that is not already on the screen, and for one place a day: the day's weightiest; the rest of the day are only pulsed;
//   • reduced motion cuts; a player who has taken the camera is never flown; the camera goes home once, if the telling took it away;
//   • a holding that changed keeps its old look until its own beat (or the last one), and the map is left on the true state whatever happens (a skip included);
//   • the plan is a function of the events and the screen: the same in, the same out; nothing draws a die or reads a clock.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const C = await import('../public/js/ui/choreo.js');

const holdings = { seat: { pos: [0, 0] }, a: { pos: [500, 0] }, b: { pos: [900, 300] }, c: { pos: [40, 40] }, d: { pos: [-700, 200] }, e: { pos: [300, 900] } };
const near = new Set(['seat', 'c']);
const ctx = (extra = {}) => ({ holdings, seat: 'seat', reduced: false, changed: [], onScreen: (p) => near.has(Object.keys(holdings).find((k) => holdings[k].pos === p)), words: () => 60, ...extra });
const E = (day, where, importance) => ({ day, where, importance, headline: `h${day}${where}` });

test('the camera flies for weight that is off the screen, never for importance two or less, and once a day', () => {
  const ev = [E(1, 'a', 2), E(2, 'b', 5), E(2, 'd', 4), E(3, 'c', 5), E(4, 'e', 1), E(5, 'd', 3), E(5, null, 5)];
  const p = C.planPlayback(ev, ctx());
  assert.deepEqual(p.steps.map((s) => s.action), ['pulse', 'fly', 'pulse', 'pulse', 'pulse', 'fly', 'stay'], 'a day\'s weightiest flies; the rest pulse; news on screen or of no weight only pulses; news with no place stays');
  assert.equal(p.steps[1].dist, 300, 'a great thing is looked at closer'); assert.equal(p.steps[5].dist, 420);
  assert.ok(p.steps.filter((s) => s.importance <= 2).every((s) => s.action === 'pulse' || s.action === 'stay'));
  assert.ok(p.steps[1].hold > p.steps[0].hold, 'a beat the camera moved for is held longer');
  assert.ok(p.steps.every((s) => s.hold >= 1500 && s.hold <= 4800));
  // two events on one day: only the weightiest flies, however the events are ordered
  const swapped = C.planPlayback([E(2, 'd', 4), E(2, 'b', 5)], ctx()).steps.map((s) => s.action); assert.deepEqual(swapped, ['pulse', 'fly']);
  // a day of nothing but light news: no flight
  assert.deepEqual(C.planPlayback([E(1, 'a', 2), E(1, 'b', 1)], ctx()).steps.map((s) => s.action), ['pulse', 'pulse']);
});

test('reduced motion cuts, and the way home is a cut', () => {
  const p = C.planPlayback([E(1, 'a', 5), E(2, 'b', 4)], ctx({ reduced: true }));
  assert.deepEqual(p.steps.map((s) => s.action), ['cut', 'cut']); assert.equal(p.home.action, 'cut');
  const q = C.planPlayback([E(1, 'a', 5)], ctx()); assert.equal(q.home.action, 'fly');
});

test('home is only for a camera the telling took away', () => {
  assert.equal(C.planPlayback([E(1, 'c', 5), E(2, 'a', 2)], ctx()).home, null, 'nothing flew: nowhere to return from');
  assert.equal(C.planPlayback([E(1, 'a', 5)], ctx({ seat: null })).home, null, 'no seat to go to');
  assert.deepEqual(C.planPlayback([E(1, 'a', 5)], ctx()).home, { where: 'seat', dist: 520, action: 'fly' });
});

test('a holding that changed shows its change at its own beat, or at the last one; changedHoldings finds them', () => {
  const before = { holdings: { x: { owner: 'stark', status: 'normal' }, y: { owner: 'lannister', status: 'normal' }, z: { owner: 'tully' }, w: { owner: 'baratheon', status: 'normal' } } };
  const after = { holdings: { x: { owner: 'stark', status: 'besieged' }, y: { owner: 'stark', status: 'normal' }, z: { owner: 'tully', status: 'normal' }, w: { owner: 'baratheon', status: 'normal' }, n: { owner: 'x' } } };
  assert.deepEqual(C.changedHoldings(before, after), ['x', 'y'], 'a new status or a new owner; not a missing status read as normal, not a holding that did not exist');
  assert.deepEqual(C.changedHoldings(null, after), []);
  const h = { ...holdings, x: { pos: [10, 10] }, y: { pos: [20, 20] } };
  const p = C.planPlayback([E(1, 'a', 3), E(2, 'y', 4), E(3, 'b', 3)], { ...ctx({ holdings: h, changed: ['y', 'x'] }), holdings: h });
  assert.deepEqual(p.steps.map((s) => s.reveal), [[], ['y'], ['x']], 'y at its own news; x, which has none, at the last beat');
});

test('the runner tells every event in order, reveals at the beat, pulses, flies and goes home; a skip stops it and a taken camera is never flown', async () => {
  const mk = () => { const log = []; return { log, io: { fly: (p, d) => log.push(`io fly ${d}`), cut: () => log.push('io cut'), pulse: () => log.push('io pulse'), reveal: (ids) => log.push(`io reveal ${ids}`), show: (s, i) => log.push(`io show ${i}`), home: (p, d, how) => log.push(`io home ${how}`), wait: async () => {} } }; };
  const ev = [E(1, 'a', 2), E(2, 'b', 5), E(3, 'd', 3)]; const plan = C.planPlayback(ev, ctx({ changed: ['b'] }));
  const a = mk(); const l = await C.runPlan(plan, { skip: false, noFly: false }, a.io, holdings);
  assert.deepEqual(l, ['show 0', 'pulse a', 'fly b', 'show 1', 'reveal b', 'fly d', 'show 2', 'home fly']);
  assert.deepEqual(a.log.filter((x) => x.startsWith('io show')), ['io show 0', 'io show 1', 'io show 2'], 'in order, once each');
  assert.ok(a.log.indexOf('io fly 300') < a.log.indexOf('io show 1'), 'the camera arrives before the news is told'); assert.ok(a.log.indexOf('io reveal b') > a.log.indexOf('io show 1'), 'the map changes at its beat, not before');
  // a taken camera: no fly, cut or home
  const t = mk(); const lt = await C.runPlan(plan, { skip: false, noFly: true }, t.io, holdings);
  assert.ok(!lt.some((x) => /^(fly|cut|home)/.test(x)), lt.join()); assert.equal(lt.filter((x) => x.startsWith('show')).length, 3);
  // the player takes the camera mid-way
  const m = mk(); const ctl = { skip: false, noFly: false }; m.io.show = (s, i) => { m.log.push(`io show ${i}`); if (i === 0) ctl.noFly = true; };
  const lm = await C.runPlan(plan, ctl, m.io, holdings); assert.ok(!lm.some((x) => /^(fly|home)/.test(x)));
  // a skip: nothing after it is told (the caller shows the true state)
  const k = mk(); const ck = { skip: false, noFly: false }; k.io.show = (s, i) => { k.log.push(`io show ${i}`); if (i === 0) ck.skip = true; };
  const lk = await C.runPlan(plan, ck, k.io, holdings); assert.deepEqual(lk.filter((x) => x.startsWith('show')), ['show 0']); assert.ok(!lk.includes('home fly'));
});

test('the same events and screen give the same plan, and the rules read no clock and roll no die', () => {
  const ev = [E(1, 'a', 2), E(2, 'b', 5), E(2, 'd', 4), E(3, 'c', 5)];
  assert.deepEqual(C.planPlayback(ev, ctx({ changed: ['b'] })), C.planPlayback(ev, ctx({ changed: ['b'] })));
  const src = fs.readFileSync(path.join(ROOT, 'public/js/ui/choreo.js'), 'utf8');
  assert.doesNotMatch(src, /Math\.random|Date\.now|performance\.now|new Date|setTimeout/);
  assert.equal(C.FLY_FROM, 3);
});

test('the wiring: the game plays turns by the plan, stages the map, and hands the camera back on Follow', () => {
  const rd = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');
  const pb = rd('public/js/ui/playback.js'); const app = rd('public/js/app.js'); const map = rd('public/js/map3d/MapScene.js'); const chrome = rd('public/js/ui/chrome.js');
  assert.match(pb, /planPlayback\(evs,/); assert.match(pb, /runPlan\(plan, ctl, io, s\.holdings\)/); assert.match(pb, /map\?\.revealAll\(\)/); assert.match(pb, /matchMedia\('\(prefers-reduced-motion: reduce\)'\)/);
  assert.match(pb, /data-rb === 'follow'|dataset\.rb === 'follow'/); assert.match(chrome, /data-rb="follow"/);
  assert.equal((app.match(/stageTurn\(prevState, r\.state\)/g) || []).length, 2, 'both ways a turn is told stage the map');
  assert.match(app, /app\.reveal\.ctl\.noFly = true/);
  assert.match(map, /stage\(next, prev, ids\)/); assert.match(map, /revealAll\(\)/); assert.match(map, /cutTo\(pos, dist\)/); assert.match(map, /onScreen\(pos, margin/);
  assert.ok(fs.existsSync(path.join(ROOT, 'public/dev/playback.html')) && fs.existsSync(path.join(ROOT, 'scripts/playback-check.mjs')));
});
