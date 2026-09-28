// canon-order (docs/gdd/15-qa-tooling.md §2; bug B-19): the great threads of the books come in the books' order and in
// the windows of docs/gdd/10-narrative-events.md §4 — the Red Wedding before the Purple Wedding, Ned's execution after
// his arrest, the dragons after the golden crown. This is the current engine's version of the test; the beat engine of
// WP D1 inherits it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { THREADS, advanceThreads } from '../public/js/shared/plots.js';
import { BOOK_ORDER } from '../public/data/beats.js';
import { addDays } from '../public/js/shared/world.js';

const YM = (s) => { const [y, m] = s.split('-').map(Number); return y * 12 + (m - 1); };
const show = (v) => `${Math.floor(v / 12)}-${(v % 12) + 1}`;

// GDD 10 §4, by month (a window "K2 + 3–12 days" is read as the months it can fall in given its anchor's window)
const WINDOWS = {
  'kings_ride.progress': ['298-08', '298-08'], 'kings_ride.arrival': ['298-08', '298-10'], 'kings_ride.the_fall': ['298-08', '298-11'],
  'kings_ride.southward': ['298-09', '298-11'], 'catspaw.assassin': ['298-09', '298-12'], 'hands_tourney.tourney': ['298-10', '298-12'],
  'the_imp.seized': ['298-09', '298-11'], 'the_imp.burning': ['298-09', '298-12'],
  'last_hunt.boar': ['298-10', '298-12'], 'last_hunt.coup': ['298-10', '299-01'], 'last_hunt.banners': ['298-10', '299-01'], 'last_hunt.brothers': ['298-11', '299-03'],
  'crown_justice.baelors_sept': ['299-01', '299-03'], 'king_in_north.crowned': ['299-01', '299-04'],
  'five_kings.twins': ['298-11', '299-02'], 'five_kings.whispering_wood': ['298-11', '299-03'], 'five_kings.shadow': ['299-04', '299-08'],
  'five_kings.blackwater': ['299-07', '299-10'], 'five_kings.red_wedding': ['299-10', '300-02'], 'five_kings.purple_wedding': ['300-01', '300-03'],
  'the_wall.benjen': ['298-09', '298-12'], 'the_wall.wights': ['299-01', '299-03'],
  'dragons.wedding': ['298-08', '298-09'], 'dragons.golden_crown': ['298-10', '298-12'], 'dragons.hatching': ['298-12', '299-03'],
  'ironborn.crown': ['299-03', '299-07'],
  // the full set (WP D2)
  'kings_ride.trident': ['298-10', '298-11'], 'kings_ride.hand_at_court': ['298-10', '299-01'], 'catspaw.littlefingers_lie': ['298-10', '298-11'],
  'the_imp.streets': ['298-11', '298-12'], 'the_imp.trial': ['298-11', '299-01'], 'the_imp.berics_ride': ['298-12', '299-01'],
  'the_imp.lions': ['298-12', '299-02'], 'last_hunt.joffrey_crowned': ['298-12', '299-01'],
  'five_kings.rose_lion': ['299-08', '299-12'], 'five_kings.viper': ['300-01', '300-04'], 'five_kings.tywin_dies': ['300-02', '300-05'],
  'young_wolf.green_fork': ['298-11', '299-03'], 'young_wolf.camps': ['298-11', '299-04'], 'young_wolf.westerlands': ['299-03', '299-08'],
  'young_wolf.fords': ['299-06', '299-08'], 'young_wolf.kingslayer_freed': ['299-06', '299-09'], 'young_wolf.karstark': ['299-09', '299-11'],
  'riverrun.hoster': ['299-06', '299-12'], 'omens.comet': ['299-02', '299-04'], 'omens.autumn': ['299-01', '299-12'], 'omens.winter': ['300-01', '300-12'],
  'the_wall.great_ranging': ['299-02', '299-06'], 'the_wall.fist': ['299-08', '299-11'], 'the_wall.crasters': ['299-09', '300-01'],
  'the_wall.wildlings_attack': ['300-01', '300-04'], 'the_wall.lord_commander': ['300-01', '300-05'],
  'dragons.wine_seller': ['298-10', '299-01'], 'dragons.maegi': ['298-12', '299-02'], 'dragons.red_waste': ['299-01', '300-12'],
  'dragons.qarth': ['299-01', '300-12'], 'dragons.slavers_bay': ['299-01', '300-12'],
  'ironborn.winterfell_taken': ['299-03', '299-08'], 'ironborn.winterfell_burns': ['299-08', '299-11'], 'ironborn.balon_falls': ['299-10', '300-01'],
};
// the books' order, where two threads touch (public/data/beats.js BOOK_ORDER)
const BEFORE = BOOK_ORDER;

test('every canon stage is scheduled inside its window of the GDD', () => {
  const ids = THREADS.flatMap((t) => t.stages.map((s) => `${t.id}.${s.id}`));
  assert.deepEqual(ids.filter((id) => !WINDOWS[id]), [], 'every stage has a window in the table');
  for (const t of THREADS) for (const st of t.stages) {
    const [from, to] = WINDOWS[`${t.id}.${st.id}`];
    assert.ok(st.at >= YM(from) && st.at <= YM(to), `${t.id}.${st.id} scheduled ${show(st.at)}, window ${from} → ${to}`);
  }
});

test('with nothing in the way, the threads fire in the books\' order: the Red Wedding before the Purple Wedding', () => {
  // the real schedule, with every precondition met: what is left is the order the engine keeps
  const threads = THREADS.map((t) => ({ id: t.id, stages: t.stages.map((st) => ({ id: st.id, at: st.at, grace: st.grace, needs: () => true, fire: () => null })) }));
  const s = { meta: { date: { year: 298, month: 8, day: 1 }, turn: 0 }, plots: {} };
  const when = {};
  for (let day = 0; day < 30 * 30; day += 7) {
    s.meta.date = addDays({ year: 298, month: 8, day: 1 }, day);
    for (const id of advanceThreads(s, threads).fired) when[id] = day;
  }
  for (const [a, b] of BEFORE) {
    assert.ok(when[a] != null && when[b] != null, `${a} and ${b} both fire`);
    assert.ok(when[a] <= when[b], `${a} (day ${when[a]}) before ${b} (day ${when[b]})`);
  }
  assert.ok(when['five_kings.red_wedding'] < when['five_kings.purple_wedding'], 'the Red Wedding strictly first');
});

test('a stage the world no longer fits lapses after its grace, and the thread goes on', () => {
  const threads = [{ id: 't', stages: [{ id: 'a', at: 298 * 12 + 7, grace: 1, needs: () => false, fire: () => null }, { id: 'b', at: 298 * 12 + 8, needs: () => true, fire: () => null }] }];
  const s = { meta: { date: { year: 298, month: 8, day: 1 }, turn: 0 }, plots: {} };
  const fired = [];
  for (let day = 0; day < 120; day += 7) { s.meta.date = addDays({ year: 298, month: 8, day: 1 }, day); fired.push(...advanceThreads(s, threads).fired); }
  assert.deepEqual(fired, ['t.b']);
});
