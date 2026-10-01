// First-run guidance and focus mode on the screen (WP U8; rules in ui/firstrun.js). A new game opens with one card of vellum — the situation, the aims, the levers,
// and "Begin" — shown once and never again (here in `localStorage`, and on the server so a fresh browser does not show it again). Then three coach marks, one at a
// time, each a wax dot and a slip that points at a thing and goes when the thing is done. `F` hides everything but the map and the command bar. While the map is
// being moved the bars fade back, and after a minute of nothing they dim: the map is the screen.
import { app, $, esc, api, modal, closeModal, toast } from './common.js';
import { welcomeOf, shouldWelcome, nextCoach, coachAfter, quietTip, QUIET_TIP, placeCoach } from './firstrun.js';
import { icon } from './icons.js';

const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode: it is shown again, which is harmless */ } },
};
const wKey = () => `wc.welcomed.${app.saveId}`, cKey = () => `wc.coach.${app.saveId}`, tKey = () => `wc.tip.focus.${app.saveId}`;
const doneList = () => { try { return JSON.parse(store.get(cKey()) || '[]'); } catch { return []; } };

// ── the welcome card ──────────────────────────────────────────────────────────────────────────────────────────────────
function welcomeHtml(w) {
  return `<div class="wc-vellum wc-welcome" role="document">
    <div class="wc-kicker wc-welcome__kicker">${esc(w.kicker)}</div>
    <h2 class="wc-title">${esc(w.title)}</h2>
    <div class="wc-welcome__lord">${esc(w.lord)}</div>
    <div class="wc-rule"></div>
    <p class="wc-welcome__situation">${esc(w.situation)}</p>
    ${w.aims.length ? `<p class="wc-welcome__line"><span class="wc-kicker">Aims</span> ${w.aims.map(esc).join(' · ')}</p>` : ''}
    ${w.levers.length ? `<p class="wc-welcome__line"><span class="wc-kicker">Levers</span> ${w.levers.map(esc).join(' · ')}</p>` : ''}
    <div class="wc-welcome__go"><span class="wc-welcome__note">${w.again ? 'Read it again any time from the chronicle.' : 'You will not see this again.'}</span><button class="wc-btn wc-btn--gold" id="welcome-go">Begin ${icon('chevronR')}</button></div>
  </div>`;
}
/** Show the welcome card (`again`: the lord asked for it, so it says nothing of never seeing it again and sets nothing). */
export function showWelcome({ again = false } = {}) {
  const s = app.state; if (!s) return;
  modal(welcomeHtml({ ...welcomeOf(s), again }), { vellum: true });
  $('#welcome-go').onclick = () => { closeModal(); if (!again) { store.set(wKey(), '1'); api(`/games/${app.saveId}/welcome`, { body: {} }).catch(() => { /* the flag is kept here anyway */ }); s.meta.welcomed = true; } showCoach(); };
}
/** After a game is opened: the card on a new game not yet read; otherwise the marks still to do. */
export function startFirstRun() {
  const s = app.state; if (!s) return;
  if (shouldWelcome(s, { localFlag: store.get(wKey()) === '1' })) showWelcome(); else showCoach();
}

// ── the coach marks ───────────────────────────────────────────────────────────────────────────────────────────────────
let current = null;
function coachEl() { let e = $('#coach'); if (!e) { e = document.createElement('div'); e.id = 'coach'; e.className = 'wc-coach-layer'; $('#game-screen').appendChild(e); } return e; }
/** Draw the mark that is next (or none): a wax dot on the target and a slip beside it; nothing on a game past its first turns, nor while a modal is open. */
export function showCoach() {
  const el = coachEl(); const s = app.state;
  const mark = s && (s.meta.turn || 0) <= 2 ? nextCoach(doneList()) : null;
  if (!mark || !$('#modal').classList.contains('hidden') || document.body.classList.contains('focus')) { el.innerHTML = ''; current = null; return; }
  const target = document.querySelector(mark.target); const r = target?.getBoundingClientRect();
  if (!r || !r.width) { el.innerHTML = ''; current = null; return; }
  const n = doneList().length;
  el.innerHTML = `<div class="wc-coach" data-mark="${mark.id}"><span class="wc-coach__dot"></span><div class="wc-slip" role="note"><span class="wc-kicker">Tip · ${n + 1} of 3</span>${esc(mark.text)}</div></div>`;
  const box = el.firstElementChild, slip = box.querySelector('.wc-slip');
  const p = placeCoach({ x0: r.left, y0: r.top, x1: r.right, y1: r.bottom }, { w: slip.offsetWidth, h: slip.offsetHeight }, { w: window.innerWidth, h: window.innerHeight }, mark.side, 14, 8, (mark.clear || 0) * parseFloat(getComputedStyle(document.documentElement).fontSize));
  slip.style.cssText = `position:fixed;left:${p.left}px;top:${p.top}px;--arrow-x:${p.arrowX}px;--arrow-y:${p.arrowY ?? 16}px;pointer-events:none`; if (p.arrow) slip.dataset.arrow = p.arrow; else delete slip.dataset.arrow; // (a note, never a lid: a click goes through it to what is under it)
  const dot = box.querySelector('.wc-coach__dot'); dot.style.cssText = `position:fixed;left:${p.dot.x - 8}px;top:${p.dot.y - 8}px`;
  current = mark.id;
}
/** The lord has done a thing the marks wait for ('order', 'turn', 'realm'): put that mark away and show the next. */
export function coachDone(event) {
  const before = doneList(); const after = coachAfter(before, event);
  if (after.length !== before.length) { store.set(cKey(), JSON.stringify(after)); showCoach(); }
}
window.addEventListener('resize', () => { if (current) showCoach(); });

// ── the tip about focus mode, once, from the third turn ───────────────────────────────────────────────────────────────
export function maybeQuietTip() {
  const s = app.state; if (!s || !quietTip(s.meta.turn, store.get(tKey()) === '1')) return;
  store.set(tKey(), '1'); toast(QUIET_TIP);
}

// ── focus mode, and the bars that step back ───────────────────────────────────────────────────────────────────────────
export function toggleFocus(on) {
  const b = document.body; const want = on ?? !b.classList.contains('focus');
  b.classList.toggle('focus', want);
  if (want) { $('#coach') && ($('#coach').innerHTML = ''); } else showCoach();
  const btn = $('#focus-exit'); if (btn) btn.hidden = !want;
  return want;
}
let idleTimer = 0, activeTimer = 0;
const IDLE_MS = 60000;
function wake() { document.body.classList.remove('idle'); clearTimeout(idleTimer); idleTimer = setTimeout(() => document.body.classList.add('idle'), IDLE_MS); }
/** The map is being moved: the bars fade back until the hand rests (900 ms). */
export function mapActive() { document.body.classList.add('map-active'); clearTimeout(activeTimer); activeTimer = setTimeout(() => document.body.classList.remove('map-active'), 900); }
export function watchIdle() {
  for (const ev of ['pointermove', 'pointerdown', 'keydown', 'wheel']) document.addEventListener(ev, wake, { passive: true });
  wake();
}
