// The turn told in order: a day counter runs forward, each event arrives as a herald's headline with one
// line beneath it (and its full account a click away), and the map flies to where it happened.
import { app, $, esc, placeName } from './common.js';
import { addDays, dateStr, SPANS } from '../shared/world.js';
import { eventArt } from './event-art.js';
import { sfx } from './sfx.js';

const wait = (ms, ctl) => new Promise((r) => { const t0 = performance.now(); const tick = () => { if (ctl.skip || ctl.next) return r(); if (ctl.paused) { requestAnimationFrame(tick); return; } if (performance.now() - t0 >= ms) return r(); requestAnimationFrame(tick); }; tick(); });

export async function playTurn(turn, { onDone } = {}) {
  const evs = [...(turn.events || [])].filter((e) => e.importance >= 2).sort((a, b) => (a.day || 0) - (b.day || 0) || (b.importance || 0) - (a.importance || 0));
  if (!evs.length) { onDone?.(); return; }
  const span = SPANS[turn.span]?.days || 30;
  const end = app.state.meta.date;
  const dayDate = (d) => dateStr(addDays(end, d - 1 - span)); // day 1 is the first day of the period
  document.querySelector('#reel')?.remove();
  const el = document.createElement('div'); el.id = 'reel'; el.className = 'reel';
  el.innerHTML = `<div class="reel-head"><div class="reel-day" id="reel-day">Day 1 of ${span}</div><div class="reel-date" id="reel-date">${esc(dayDate(1))}</div>
      <div class="reel-bar"><div id="reel-bar"></div></div></div>
    <div class="reel-card" id="reel-card"></div>
    <div class="reel-ctl"><button class="btn small" id="reel-pause">Pause</button><button class="btn small" id="reel-next">Next ›</button><span class="grow"></span><span class="reel-count" id="reel-count"></span><button class="btn small primary" id="reel-skip">To the report ⏭</button></div>`;
  $('#game-screen').appendChild(el);
  const ctl = { paused: false, skip: false, next: false };
  $('#reel-pause').onclick = () => { ctl.paused = !ctl.paused; $('#reel-pause').textContent = ctl.paused ? 'Resume' : 'Pause'; };
  $('#reel-next').onclick = () => { ctl.next = true; };
  $('#reel-skip').onclick = () => { ctl.skip = true; };
  let shownDay = 1;
  const setDay = (d) => { shownDay = d; $('#reel-day').textContent = `Day ${d} of ${span}`; $('#reel-date').textContent = dayDate(d); $('#reel-bar').style.width = `${Math.round((100 * d) / span)}%`; };
  for (let i = 0; i < evs.length && !ctl.skip; i++) {
    const e = evs[i]; ctl.next = false;
    // the days run forward to this event
    const target = Math.max(shownDay, Math.min(span, e.day || shownDay));
    const steps = Math.min(18, target - shownDay);
    for (let k = 1; k <= steps && !ctl.skip; k++) { setDay(Math.round(shownDay + ((target - shownDay) * k) / steps)); await wait(45, ctl); }
    setDay(target);
    const pos = e.where && app.state.holdings[e.where]?.pos;
    if (pos && app.map) { app.map.flyTo(pos, e.importance >= 4 ? 300 : 420); app.map.flash?.(pos); }
    $('#reel-count').textContent = `${i + 1} / ${evs.length}`;
    $('#reel-card').innerHTML = `<div class="event imp-${e.importance} reel-event">${eventArt(e)}
        <div class="et">${esc(e.title)}</div><div class="eb">${esc(e.text)}</div>
        ${e.details ? `<details class="ev-more"><summary>How it happened, and what it means</summary><div>${esc(e.details)}</div></details>` : ''}
        <div class="meta">${esc(e.type || '')}${e.where ? ' · ' + esc(placeName(app.state, e.where)) : ''}</div></div>`;
    $('#reel-card').firstElementChild.classList.add('reel-in');
    sfx(e.importance >= 4 && e.type === 'war' ? 'horn' : 'open');
    await wait(2600 + (e.importance || 2) * 700 + Math.min(4000, (e.text || '').length * 30), ctl);
  }
  el.classList.add('reel-out'); setTimeout(() => el.remove(), 350);
  onDone?.();
}
