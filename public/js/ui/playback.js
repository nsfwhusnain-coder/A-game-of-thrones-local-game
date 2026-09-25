// The turn told in order: a day counter runs forward, each event arrives as a herald's headline with one
// line beneath it (and its full account a click away), and the map flies to where it happened.
import { app, $, esc, placeName } from './common.js';
import { addDays, dateStr, SPANS } from '../shared/world.js';
import { sfx } from './sfx.js';

const wait = (ms, ctl) => new Promise((r) => { const t0 = performance.now(); const tick = () => { if (ctl.skip || ctl.next) return r(); if (ctl.paused) { requestAnimationFrame(tick); return; } if (performance.now() - t0 >= ms) return r(); requestAnimationFrame(tick); }; tick(); });

export async function playTurn(turn, { onDone } = {}) {
  const evs = [...(turn.events || [])].filter((e) => e.importance >= 2 && (!e.bg || e.mine)).sort((a, b) => (a.day || 0) - (b.day || 0) || (b.importance || 0) - (a.importance || 0));
  const span = SPANS[turn.span]?.days || 30;
  // a quiet day: no news, but the hosts and riders still walk their road before your eyes
  if (!evs.length) { if (app.map) for (let k = 1; k <= 36; k++) { app.map.reelF = k / 36; await new Promise((r) => setTimeout(r, 40)); } onDone?.(); return; }
  const end = app.state.meta.date;
  const dayDate = (d) => dateStr(addDays(end, d - 1 - span)); // day 1 is the first day of the period
  document.querySelector('#reel')?.remove();
  const el = document.createElement('div'); el.id = 'reel'; el.className = 'reel';
  el.innerHTML = `<div class="reel-head"><div class="reel-date" id="reel-date">${esc(dayDate(1))}</div><div class="reel-day" id="reel-day">${span > 1 ? `Day 1 of ${span}` : ''}</div>
      <div class="reel-bar"><div id="reel-bar"></div></div></div>
    <div class="reel-stack" id="reel-stack"></div>
    <div class="reel-ctl"><button class="btn small ghost" id="reel-pause">Pause</button><button class="btn small ghost" id="reel-next">Next ›</button><span class="grow"></span><span class="reel-count" id="reel-count"></span><button class="btn small" id="reel-skip">Skip ⏭</button></div>`;
  $('#game-screen').appendChild(el);
  const ctl = { paused: false, skip: false, next: false };
  $('#reel-pause').onclick = () => { ctl.paused = !ctl.paused; $('#reel-pause').textContent = ctl.paused ? 'Resume' : 'Pause'; };
  $('#reel-next').onclick = () => { ctl.next = true; };
  $('#reel-skip').onclick = () => { ctl.skip = true; };
  let shownDay = 1;
  const setDay = (d) => { shownDay = d; if (app.map && span > 3) app.map.reelF = d / span; if (span > 1) $('#reel-day').textContent = `Day ${d} of ${span}`; $('#reel-date').textContent = dayDate(d); $('#reel-bar').style.width = `${Math.round((100 * d) / span)}%`; };
  for (let i = 0; i < evs.length && !ctl.skip; i++) {
    const e = evs[i]; ctl.next = false;
    // the days run forward to this event, and the hosts march with them
    const target = Math.max(shownDay, Math.min(span, e.day || shownDay));
    const steps = Math.min(18, target - shownDay);
    for (let k = 1; k <= steps && !ctl.skip; k++) { setDay(Math.round(shownDay + ((target - shownDay) * k) / steps)); await wait(60, ctl); }
    setDay(target);
    const pos = e.where && app.state.holdings[e.where]?.pos;
    if (pos && app.map) { app.map.flyTo(pos, e.importance >= 4 ? 300 : 420); app.map.flash?.(pos); }
    if (app.map && span <= 3) app.map.reelF = (i + 1) / (evs.length + 1); // short turns: the march moves on with each piece of news
    $('#reel-count').textContent = `${i + 1} / ${evs.length}`;
    // a headline and one line — the whole account is in the report and the feed
    const stack = $('#reel-stack');
    for (const old of stack.children) old.classList.add('past');
    stack.insertAdjacentHTML('afterbegin', `<div class="reel-item imp-${e.importance} type-${esc(e.type || 'court')}"><div class="ri-where">${esc(e.where ? placeName(app.state, e.where) : '')}</div><div class="ri-t">${esc(e.title)}</div><div class="ri-x">${esc(e.text)}</div></div>`);
    while (stack.children.length > 4) stack.lastElementChild.remove();
    sfx(e.importance >= 4 && e.type === 'war' ? 'horn' : 'open');
    await wait(2200 + (e.importance || 2) * 500 + Math.min(2500, (e.title.length + (e.text || '').length) * 22), ctl);
  }
  // run the days to the end of the turn, so every march finishes on screen
  if (!ctl.skip) for (let k = 1; k <= 12 && shownDay < span; k++) { setDay(Math.round(shownDay + ((span - shownDay) * k) / 12)); await wait(50, ctl); }
  if (!ctl.skip && span <= 3 && app.map) { const f0 = app.map.reelF || 0; for (let k = 1; k <= 20; k++) { app.map.reelF = f0 + ((1 - f0) * k) / 20; await wait(40, ctl); } } // the rest of the day's march
  el.classList.add('reel-out'); setTimeout(() => el.remove(), 350);
  onDone?.();
}
