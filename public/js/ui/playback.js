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
  for (let i = 0; i < evs.length && !ctl.skip; i++) {
    const e = evs[i]; ctl.next = false;
    const idx = (turn.events || []).indexOf(e);
    rv.n = i + 1; rv.date = e.date || turn.date; rv.shown.add(idx);
    const d = $('#rb-date'); if (d) d.textContent = rv.date; const c = $('#rb-count'); if (c) c.textContent = `${rv.n} / ${rv.total}`;
    const card = document.querySelector(`.story[data-news="${turn.turn}:${idx}"]`);
    if (card) { card.classList.remove('unrevealed'); card.classList.add('arrive'); card.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); setTimeout(() => card.classList.remove('arrive'), 2600); }
    const pos = e.where && app.state.holdings[e.where]?.pos;
    if (pos && app.map) { app.map.flyTo(pos, e.importance >= 4 ? 300 : 420); app.map.flash?.(pos); }
    if (app.map) app.map.reelF = span > 3 ? Math.min(1, (e.day || 1) / span) : (i + 1) / (evs.length + 1);
    sfx(e.importance >= 4 && e.type === 'war' ? 'horn' : 'open');
    await wait(2600 + (e.importance || 2) * 400 + Math.min(3500, ((e.title || '').length + (e.text || '').length) * 18), ctl);
  }
  // the rest of the day's march, so every host finishes its road on screen
  if (!ctl.skip && app.map) { const f0 = app.map.reelF || 0; for (let k = 1; k <= 20; k++) { app.map.reelF = f0 + ((1 - f0) * k) / 20; await wait(40, ctl); } }
  app.reveal = null; setDrawer('feed'); const body = document.querySelector('#drawer-body'); if (body) body.scrollTop = 0;
  onDone?.();
}
