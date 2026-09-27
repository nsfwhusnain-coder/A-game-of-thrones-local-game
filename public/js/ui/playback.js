// The turn told in the chronicle itself: days flow continuously while news arrives. Reading an event eases the
// clock instead of stopping it; hosts therefore keep walking their roads while the chronicle is in your hand.
import { app, $ } from './common.js';
import { spanOf } from '../shared/world.js';
import { playbackMoments } from '../shared/turns.js';
import { storyEvents, setDrawer } from './drawer.js';
import { sfx } from './sfx.js';

/** Wait for active (unpaused) time. `frame` receives progress and elapsed milliseconds every render frame. */
const wait = (ms, ctl, frame) => new Promise((resolve) => {
  let elapsed = 0, last = performance.now();
  const tick = (now) => {
    const dt = Math.max(0, Math.min(80, now - last)); last = now;
    if (ctl.skip || ctl.next) return resolve(elapsed / Math.max(1, ms));
    if (!ctl.paused) {
      elapsed += dt;
      frame?.(Math.min(1, elapsed / Math.max(1, ms)), elapsed);
    }
    if (elapsed >= ms) return resolve(1);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

if (typeof document !== 'undefined') document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-rb]'); const rv = app.reveal; if (!b || !rv) return;
  if (b.dataset.rb === 'pause') { rv.ctl.paused = !rv.ctl.paused; b.textContent = rv.ctl.paused ? 'Resume' : 'Pause'; }
  if (b.dataset.rb === 'next') rv.ctl.next = true;
  if (b.dataset.rb === 'skip') rv.ctl.skip = true;
});

/** Hide the new day's cards before the state that carries them is shown, so none flashes before its turn. */
export function prepareReveal(turn) {
  const evs = storyEvents(turn); if (!evs.length) { app.reveal = null; return; }
  app.reveal = { turn: turn.turn, n: 0, total: evs.length, shown: new Set(), ctl: { paused: false, skip: false, next: false }, date: evs[0].date || turn.date, flow: 0 };
}

export async function playTurn(turn, { onDone } = {}) {
  const evs = storyEvents(turn);
  const span = spanOf(turn.span).days;
  const setFlow = (f) => {
    const value = Math.max(0, Math.min(1, f));
    if (app.reveal) app.reveal.flow = value;
    if (app.map) app.map.reelF = value;
  };
  // A quiet stretch is still time: roads, riders and the living map do not wait for a headline.
  if (!evs.length) {
    app.reveal = null;
    const ctl = { paused: false, skip: false, next: false };
    await wait(Math.max(1500, Math.min(5000, span * 260)), ctl, (p) => setFlow(p));
    setFlow(1); onDone?.(); return;
  }
  if (app.reveal?.turn !== turn.turn) prepareReveal(turn);
  const rv = app.reveal; const ctl = rv.ctl;
  const moments = playbackMoments(evs, span);
  setDrawer('feed');
  const body = document.querySelector('#drawer-body');
  let flow = 0;
  const glide = async (to, ms) => {
    const from = flow; ctl.next = false;
    const reached = await wait(ms, ctl, (p) => { flow = from + (to - from) * p; setFlow(flow); });
    flow = from + (to - from) * reached; setFlow(flow);
  };

  for (let i = 0; i < evs.length && !ctl.skip; i++) {
    const e = evs[i];
    const idx = (turn.events || []).indexOf(e);
    const pos = e.where && app.state.holdings[e.where]?.pos;
    const target = Math.max(flow, moments[i]);
    // Camera and clock travel together. The event appears when its date is reached, not before.
    if (pos && app.map) app.map.flyTo(pos, e.importance >= 4 ? 300 : 420);
    await glide(target, Math.max(520, Math.min(1500, 520 + (target - flow) * span * 170)));
    if (ctl.skip) break;
    rv.n = i + 1; rv.date = e.date || turn.date; rv.shown.add(idx);
    const d = $('#rb-date'); if (d) d.textContent = rv.date;
    const c = $('#rb-count'); if (c) c.textContent = `${rv.n} / ${rv.total}`;
    const card = document.querySelector(`.story[data-news="${turn.turn}:${idx}"]`);
    if (card) { card.classList.remove('unrevealed'); card.classList.add('arrive'); setTimeout(() => card.classList.remove('arrive'), 3000); }
    if (body) body.scrollTo({ top: 0, behavior: 'smooth' });
    if (pos && app.map) app.map.flash?.(pos);
    sfx(e.importance >= 4 && e.type === 'war' ? 'horn' : 'open');

    const words = (e.title || '').length + (e.text || '').length + (e.details || '').length * 0.5;
    const hold = Math.max(2500, Math.min(4800, 2100 + words * 8));
    // While the page is read, time eases to roughly a quarter pace. It never freezes.
    const next = moments[i + 1] ?? 1;
    const drift = Math.min(next, target + Math.max(0.002, (next - target) * 0.24));
    await glide(drift, hold);
  }
  if (!ctl.skip) await glide(1, Math.max(700, Math.min(1800, 700 + (1 - flow) * span * 120)));
  else setFlow(1);
  app.reveal = null; setDrawer('feed');
  const top = document.querySelector('#drawer-body'); if (top) top.scrollTop = 0;
  onDone?.();
}
