// The turn told in the chronicle itself: the day's news arrives one event at a time — its headline joins the strip (and its card the
// chronicle, when that is open), the map flies to where it happened, the hosts march on — then the next. Pause, step or skip at the top.
import { app, $, foldText, toast } from './common.js';
import { SPANS, spanOf } from '../shared/world.js';
import { storyEvents, setDrawer } from './drawer.js';
import { sfx } from './sfx.js';
import { planPlayback, runPlan, changedHoldings } from './choreo.js';
import { reducedMotion } from './motion.js';

const wait = (ms, ctl) => new Promise((r) => { const t0 = performance.now(); const tick = () => { if (ctl.skip || ctl.next) return r(); if (ctl.paused) { requestAnimationFrame(tick); return; } if (performance.now() - t0 >= ms) return r(); requestAnimationFrame(tick); }; tick(); });

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-rb]'); const rv = app.reveal; if (!b || !rv) return;
  if (b.dataset.rb === 'pause') { rv.ctl.paused = !rv.ctl.paused; b.textContent = rv.ctl.paused ? 'Resume' : 'Pause'; }
  if (b.dataset.rb === 'next') rv.ctl.next = true;
  if (b.dataset.rb === 'skip') rv.ctl.skip = true;
  if (b.dataset.rb === 'follow') { rv.ctl.noFly = false; if (rv.last && app.map) app.map.flyTo(rv.last, 420); app.renderStrip?.(); } // the camera is the player's until they ask the story to lead it again
});

/** Hide the new day's cards before the state that carries them is shown, so none flashes before its turn. */
export function prepareReveal(turn) {
  const evs = storyEvents(turn); if (!evs.length) { app.reveal = null; return; }
  app.reveal = { turn: turn.turn, n: 0, total: evs.length, shown: new Set(), ctl: { paused: false, skip: false, next: false }, date: evs[0].date || turn.date };
}
/** Keep the map's old look of every holding that changed this turn until its news is told (WP E8): call before `playTurn`, after the new state has been set. */
export function stageTurn(prev, next) {
  if (!app.map || !prev) return;
  const ids = changedHoldings(prev, next); if (ids.length) app.map.stage(next, prev, ids);
}
export async function playTurn(turn, { onDone } = {}) {
  const evs = storyEvents(turn);
  const span = spanOf(turn.span).days;
  // a quiet day: no news, but the hosts and riders still walk their road before your eyes
  if (!evs.length) { app.reveal = null; app.map?.revealAll(); if (app.map) for (let k = 1; k <= 36; k++) { app.map.reelF = k / 36; await new Promise((r) => setTimeout(r, 40)); } onDone?.(); return; }
  if (app.reveal?.turn !== turn.turn) prepareReveal(turn);
  const rv = app.reveal; const ctl = rv.ctl; ctl.noFly = false;
  setDrawer('feed');
  // like a film: the camera travels to the place only for news of weight that is not already in view, the news appears at the head of the chronicle, it holds while it is read, and the map
  // changes at the beat that tells it — then on to the next (ui/choreo.js has the rules and tests them)
  const map = app.map; const s = app.state; const body = document.querySelector('#drawer-body');
  const reduced = reducedMotion(); // the system's setting or the game's own (Settings → Display; ui/motion.js)
  const seat = s.houses[s.meta.player]?.seat; const seatPos = seat && s.holdings[seat]?.pos;
  const plan = planPlayback(evs, {
    holdings: s.holdings, onScreen: (p) => !map || map.onScreen(p), seat: seatPos ? seat : null, reduced,
    changed: [...(map?.staged?.ids || [])], words: (e) => (e.headline || e.title || '').length + (e.summary ?? e.text ?? '').length + foldText(e).length * 0.5,
  });
  const io = {
    fly: (p, d) => map?.flyTo(p, d), cut: (p, d) => map?.cutTo(p, d), pulse: (p) => map?.flash?.(p), reveal: (ids) => map?.reveal(ids), wait: (ms) => wait(ms, ctl),
    home: (p, d, how) => (how === 'cut' ? map?.cutTo(p, d) : map?.flyTo(p, d)),
    show: (st, i) => {
      const e = evs[i]; ctl.next = false;
      const idx = (turn.events || []).indexOf(e); const pos = e.where && s.holdings[e.where]?.pos;
      rv.n = i + 1; rv.date = e.date || turn.date; rv.shown.add(idx); rv.last = pos || rv.last;
      app.renderStrip?.(); // the headline joins the strip as it is told
      // a great thing is also a toast (GDD 18 §2.6): its headline, and a click goes there
      if (e.tier === 'great') toast(e.headline || e.title, false, `great:${turn.turn}:${idx}`, pos && map ? () => map.flyTo(pos, 300) : null);
      const d = $('#rb-date'); if (d) d.textContent = rv.date; const c = $('#rb-count'); if (c) c.textContent = `${rv.n} / ${rv.total}`;
      const card = document.querySelector(`.story[data-news="${turn.turn}:${idx}"]`);
      if (card) { card.classList.remove('unrevealed'); card.classList.add('arrive'); setTimeout(() => card.classList.remove('arrive'), 3000); }
      if (body) body.scrollTo({ top: 0, behavior: 'smooth' }); // the newest is always at the top
      if (map) map.reelF = span > 3 ? Math.min(1, (e.day || 1) / span) : (i + 1) / (evs.length + 1);
      sfx(e.importance >= 4 && e.type === 'war' ? 'horn' : 'open');
    },
  };
  await runPlan(plan, ctl, io, s.holdings);
  map?.revealAll();
  // the rest of the day's march, so every host finishes its road on screen
  if (!ctl.skip && map) { const f0 = map.reelF || 0; for (let k = 1; k <= 20; k++) { map.reelF = f0 + ((1 - f0) * k) / 20; await wait(40, ctl); } }
  app.reveal = null; app.renderStrip?.(); setDrawer('feed'); const top = document.querySelector('#drawer-body'); if (top) top.scrollTop = 0;
  onDone?.();
}
