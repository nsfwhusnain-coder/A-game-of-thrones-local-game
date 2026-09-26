// The turn told in the chronicle itself: the day's news arrives one event at a time in the left panel — its card
// appears, the map flies to where it happened, the hosts march on — then the next. Pause, step or skip at the top.
import { app, $ } from './common.js';
import { SPANS } from '../shared/world.js';
import { storyEvents, setDrawer } from './drawer.js';
import { sfx } from './sfx.js';

const wait = (ms, ctl) => new Promise((r) => { const t0 = performance.now(); const tick = () => { if (ctl.skip || ctl.next) return r(); if (ctl.paused) { requestAnimationFrame(tick); return; } if (performance.now() - t0 >= ms) return r(); requestAnimationFrame(tick); }; tick(); });

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-rb]'); const rv = app.reveal; if (!b || !rv) return;
  if (b.dataset.rb === 'pause') { rv.ctl.paused = !rv.ctl.paused; b.textContent = rv.ctl.paused ? 'Resume' : 'Pause'; }
  if (b.dataset.rb === 'next') rv.ctl.next = true;
  if (b.dataset.rb === 'skip') rv.ctl.skip = true;
});

/** Hide the new day's cards before the state that carries them is shown, so none flashes before its turn. */
export function prepareReveal(turn) {
  const evs = storyEvents(turn); if (!evs.length) { app.reveal = null; return; }
  app.reveal = { turn: turn.turn, n: 0, total: evs.length, shown: new Set(), ctl: { paused: false, skip: false, next: false }, date: evs[0].date || turn.date };
}
export async function playTurn(turn, { onDone } = {}) {
  const evs = storyEvents(turn);
  const span = SPANS[turn.span]?.days || 30;
  // a quiet day: no news, but the hosts and riders still walk their road before your eyes
  if (!evs.length) { app.reveal = null; if (app.map) for (let k = 1; k <= 36; k++) { app.map.reelF = k / 36; await new Promise((r) => setTimeout(r, 40)); } onDone?.(); return; }
  if (app.reveal?.turn !== turn.turn) prepareReveal(turn);
  const rv = app.reveal; const ctl = rv.ctl;
  setDrawer('feed');
  // like a film: the camera travels to the place, the news appears at the head of the chronicle, it holds while it is
  // read — then on to the next. One steady beat for every event; nothing rushes.
  const body = document.querySelector('#drawer-body');
  for (let i = 0; i < evs.length && !ctl.skip; i++) {
    const e = evs[i]; ctl.next = false;
    const idx = (turn.events || []).indexOf(e);
    const pos = e.where && app.state.holdings[e.where]?.pos;
    if (pos && app.map) { app.map.flyTo(pos, e.importance >= 4 ? 300 : 420); await wait(1100, ctl); }
    if (ctl.skip) break;
    rv.n = i + 1; rv.date = e.date || turn.date; rv.shown.add(idx);
    const d = $('#rb-date'); if (d) d.textContent = rv.date; const c = $('#rb-count'); if (c) c.textContent = `${rv.n} / ${rv.total}`;
    const card = document.querySelector(`.story[data-news="${turn.turn}:${idx}"]`);
    if (card) { card.classList.remove('unrevealed'); card.classList.add('arrive'); setTimeout(() => card.classList.remove('arrive'), 3000); }
    if (body) body.scrollTo({ top: 0, behavior: 'smooth' }); // the newest is always at the top
    if (pos && app.map) app.map.flash?.(pos);
    if (app.map) app.map.reelF = span > 3 ? Math.min(1, (e.day || 1) / span) : (i + 1) / (evs.length + 1);
    sfx(e.importance >= 4 && e.type === 'war' ? 'horn' : 'open');
    const words = (e.title || '').length + (e.text || '').length + (e.details || '').length * 0.5;
    ctl.next = false;
    await wait(Math.max(3000, Math.min(4800, 2400 + words * 9)), ctl);
  }
  // the rest of the day's march, so every host finishes its road on screen
  if (!ctl.skip && app.map) { const f0 = app.map.reelF || 0; for (let k = 1; k <= 20; k++) { app.map.reelF = f0 + ((1 - f0) * k) / 20; await wait(40, ctl); } }
  app.reveal = null; setDrawer('feed'); const top = document.querySelector('#drawer-body'); if (top) top.scrollTop = 0;
  onDone?.();
}
