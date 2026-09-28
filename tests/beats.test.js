// The beat engine (docs/gdd/10-narrative-events.md §3; WP D1): windows, triggers (arrival, death, days after another
// beat), alternates when the world no longer fits the canon, lapses that leave something behind, canon gravity (Canon,
// Loose, Sandbox) and the canon locks on the people a near beat needs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, addDays, applyChanges } from '../public/js/shared/world.js';
import { beatsOf, runBeats, lockedNames, allowed } from '../public/js/engine/world/beats.js';
import { advanceThreads, canonLocked, THREADS } from '../public/js/shared/plots.js';
import { dayNumber } from '../public/js/engine/time.js';
import { optionsFor } from '../public/js/engine/minds/options.js';

const M = (y, m) => y * 12 + (m - 1);
const bare = (date = { year: 298, month: 8, day: 1 }, settings = {}) => ({ meta: { date, turn: 0, settings }, plots: {}, characters: {}, parties: {} });
const stage = (id, at, more = {}) => ({ id, at, grace: 1, needs: () => true, fire: () => ({ events: [{ title: id, text: id, houses: [], day: 1 }] }), ...more });
const run = (s, beats, from, days) => { const fired = []; for (let d = 0; d < days; d++) { s.meta.date = addDays(from, d); fired.push(...runBeats(s, beats).fired); } return fired; };

test('a beat waits for its window, then fires on its date', () => {
  const beats = beatsOf([{ id: 't', stages: [stage('a', M(298, 9))] }]);
  const s = bare();
  assert.deepEqual(run(s, beats, { year: 298, month: 8, day: 1 }, 30), [], 'not before its moon');
  assert.deepEqual(run(s, beats, { year: 298, month: 9, day: 1 }, 5), ['t.a']);
  assert.equal(s.plots.stages.t, 1);
  assert.equal(s.plots.fired['t.a'], dayNumber({ year: 298, month: 9, day: 1 }));
});

test('an arrival trigger waits for the party to reach the place', () => {
  const beats = beatsOf([{ id: 't', stages: [stage('a', M(298, 9))] }], { 't.a': { trigger: { kind: 'arrival', party: 'p', at: 'stark' } } });
  const s = bare({ year: 298, month: 9, day: 1 }); s.parties.p = { at: null, march: { to: 'stark' } };
  assert.deepEqual(runBeats(s, beats).fired, [], 'still on the road');
  s.parties.p = { at: 'stark' };
  assert.deepEqual(runBeats(s, beats).fired, ['t.a']);
});

test('a death trigger waits on the death; an after-trigger waits its days behind the other beat', () => {
  const beats = beatsOf([{ id: 't', stages: [stage('a', M(298, 9)), stage('b', M(298, 9))] }, { id: 'u', stages: [stage('c', M(298, 9))] }],
    { 't.b': { trigger: { kind: 'after', beat: 't.a', days: [5, 10] } }, 'u.c': { trigger: { kind: 'death', actor: 'robert' } } });
  const s = bare(); s.characters.robert = { id: 'robert', alive: true };
  const f1 = run(s, beats, { year: 298, month: 9, day: 1 }, 5);
  assert.deepEqual(f1, ['t.a'], 'the second beat waits five days; the death has not come');
  s.characters.robert.alive = false;
  const f2 = run(s, beats, { year: 298, month: 9, day: 6 }, 2);
  assert.deepEqual(f2.sort(), ['t.b', 'u.c']);
});

test('when the world no longer fits a beat, a fitting alternate happens instead', () => {
  const beats = beatsOf([{ id: 't', stages: [stage('a', M(298, 9), { needs: () => false })] }],
    { 't.a': { alternates: [{ when: (s) => s.plots.flags.other, effects: () => ({ events: [{ title: 'alt', text: 'alt', houses: [], day: 1 }], flags: { took_alt: true } }) }] } });
  const s = bare({ year: 298, month: 9, day: 1 });
  assert.deepEqual(runBeats(s, beats).fired, []);
  s.plots.flags.other = true;
  assert.deepEqual(runBeats(s, beats).fired, ['t.a']);
  assert.equal(s.plots.flags.took_alt, true);
  assert.equal(s.plots.log.at(-1).how, 'alternate');
});

test('a beat whose window closes lapses, leaves what its lapse says, and the thread goes on', () => {
  const beats = beatsOf([{ id: 't', stages: [stage('a', M(298, 9), { needs: () => false }), stage('b', M(298, 11))] }],
    { 't.a': { lapse: { effects: () => ({ flags: { never_came: true } }) } } });
  const s = bare();
  const fired = run(s, beats, { year: 298, month: 9, day: 1 }, 100);
  assert.deepEqual(fired, ['t.b']);
  assert.equal(s.plots.flags.never_came, true);
  assert.ok(s.plots.log.some((l) => l.stage === 'a' && l.how === 'lapsed'));
});

test('canon gravity: Canon keeps every beat, Loose only the pillars, Sandbox none', () => {
  const beats = beatsOf([{ id: 't', stages: [stage('a', M(298, 9))] }, { id: 'u', stages: [stage('p', M(298, 9))] }], { 'u.p': { pillar: true } });
  const fired = (g) => { const s = bare(undefined, { canonGravity: g }); return run(s, beats, { year: 298, month: 9, day: 1 }, 3).sort(); };
  assert.deepEqual(fired('canon'), ['t.a', 'u.p']);
  assert.deepEqual(fired('loose'), ['u.p']);
  assert.deepEqual(fired('sandbox'), []);
  // a beat the setting forbids passes by without a word once its window closes, and the thread goes on
  const s = bare(undefined, { canonGravity: 'sandbox' }); run(s, beats, { year: 298, month: 9, day: 1 }, 90);
  assert.equal(s.plots.stages.t, 1); assert.equal((s.facts || []).length, 0);
  assert.equal(allowed(bare(undefined, { canonGravity: 'loose' }), beats[1]), true);
});

test('the people a near beat names are canon-locked, and the realm\'s minds do not send them away', () => {
  const beats = beatsOf([{ id: 't', stages: [stage('a', M(298, 10))] }], { 't.a': { names: ['ned'] } });
  assert.equal(lockedNames(bare({ year: 298, month: 8, day: 1 }), beats).has('ned'), false, 'too far off');
  assert.equal(lockedNames(bare({ year: 298, month: 9, day: 10 }), beats).has('ned'), true, 'within the moon before');
  assert.equal(lockedNames(bare({ year: 298, month: 9, day: 10 }, { canonGravity: 'sandbox' }), beats).has('ned'), false);
  // the real canon: in the ninth moon of 298 the King's party and Lord Eddard are held for the King's coming
  const s = createInitialState('agot_298', 'tully', { seed: 3 });
  const sent = () => (optionsFor(s, 'robert_baratheon').options.find((o) => o.verb === 'send_person')?.picks || []).map((p) => p.params.character);
  s.meta.date = { year: 298, month: 5, day: 1 };
  assert.ok(sent().includes('cersei_lannister'), 'in spring the King may send the Queen on an errand');
  s.meta.date = { year: 298, month: 9, day: 1 };
  const locked = canonLocked(s);
  assert.ok(locked.has('robert_baratheon') && locked.has('cersei_lannister'));
  assert.ok(!sent().includes('cersei_lannister'), 'but not while the King rides north and the Queen rides with him');
});

test('the real canon: with Lord Eddard far from King\'s Landing, Robert\'s death crowns Joffrey quietly', () => {
  const s = createInitialState('agot_298', 'tully', { seed: 3 });
  s.meta.date = { year: 298, month: 12, day: 5 };
  s.plots = { ...(s.plots || {}), stages: { ...(s.plots?.stages || {}), last_hunt: THREADS.find((t) => t.id === 'last_hunt').stages.findIndex((st) => st.id === 'coup') } };
  s.characters.robert_baratheon.alive = false; s.characters.eddard_stark.loc = 'stark';
  const r = advanceThreads(s);
  assert.ok(r.fired.includes('last_hunt.coup'));
  for (const b of r.batches) applyChanges(s, b.changes, b.ctx);
  assert.match(s.characters.joffrey_baratheon.title, /King of the Andals/);
  assert.equal(s.plots.log.find((l) => l.thread === 'last_hunt' && l.stage === 'coup').how, 'alternate');
});
