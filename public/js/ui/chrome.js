// The quiet screen's chrome (docs/gdd/17-ui-declutter.md §2, WP U1–U3), drawn in the maester's desk (GDD 21): the crest and the day, the three
// vitals, the Inbox seal, the menu's three doors, the one map-mode chip and the headline strip. What each says
// is decided by the pure functions of hud.js (which node tests); this file only puts it on the page and opens and closes the little
// popovers. Nothing here changes the game.
import { app, $, esc, fmt, player, modal, closeModal } from './common.js';
import { icon } from './icons.js';
import { vitalsOf, inboxOf, stripOf, seasonOf, MENU } from './hud.js';
import { decisionDaysLeft, leftWord } from '../shared/pins.js';
import { ordinal, MONTHS } from '../engine/time.js';
import { sigilSrc } from '../sigils.js';
import { openWindow } from './windows.js';
import { openDrawer, openChat, decisionsHtml, wireDecisions, openNews } from './drawer.js';
import { sfx } from './sfx.js';

// ───────────── the top bar ─────────────
const crestDate = (d) => `${ordinal(d.day)} of the ${MONTHS[d.month - 1]}, ${d.year} AC`;
const VITAL = { coin: { icon: 'coin', name: 'Coin', open: ['realm', 'economy'] }, men: { icon: 'swords', name: 'Men', open: ['realm', 'wars'] }, food: { icon: 'wheat', name: 'Food', open: ['realm', 'economy'] } };
const TREND = { up: ['up', 'up'], down: ['down', 'down'], steady: ['flat', null] };

export function renderCrest() {
  const s = app.state, h = player(); const se = seasonOf(s);
  $('#crest').innerHTML = `<span class="wc-ribbon"><img src="${sigilSrc(h, 64)}" alt=""></span><div class="wc-crest__text"><div class="wc-label">House ${esc(h.name)}</div><div class="wc-crest__date" title="${esc(se.label)}: ${esc(se.note)}">${esc(crestDate(s.meta.date))}<span class="wc-crest__season" title="${esc(se.label)}: ${esc(se.note)}">${icon(se.icon)}</span></div></div>`;
}
export function renderVitals() {
  $('#vitals').innerHTML = vitalsOf(app.state, app.state.meta.player).map((v) => {
    const V = VITAL[v.key]; const [cls, ic] = TREND[v.trend];
    return `<button class="wc-vital${v.warn ? ' is-warn' : ''}" data-vital="${v.key}" data-open="${V.open[0]}" data-section="${V.open[1]}" aria-label="${esc(v.label)}" title="${esc(v.hover)}">${icon(V.icon)}<span class="wc-vital__txt"><b>${fmt(v.value)}${v.key === 'food' ? ' <em>moons</em>' : ''}</b><small>${V.name}</small></span><span class="wc-trend wc-trend--${cls}" aria-hidden="true">${ic ? icon(ic) : '—'}</span></button>`;
  }).join('');
}

let lastCount = null;
export function renderInboxSeal() {
  const { count } = inboxOf(app.state, app.state.meta.player);
  const b = $('#inbox-btn'); if (!b) return;
  $('#inbox-count').textContent = count ? String(count) : '';
  b.classList.toggle('is-empty', !count);
  b.setAttribute('aria-label', count ? `Letters and matters: ${count} await your word` : 'Letters and matters: none wait');
  if (lastCount !== null && count > lastCount) { b.classList.remove('is-settling'); void b.offsetWidth; b.classList.add('is-settling'); }
  lastCount = count;
  if (!$('#inbox').classList.contains('hidden')) renderInbox();
}

// ───────────── the Inbox ─────────────
const KIND = { letter: ['raven', 'A raven'], matter: ['seal', 'A matter'], audience: ['speak', 'An audience'] };
// a matter says how long it waits; a letter or an audience says what it is about
const inboxHint = (i) => { const left = i.kind === 'matter' ? leftWord(decisionDaysLeft(app.state, i)) : ''; const t = i.text ? String(i.text).slice(0, left ? 70 : 90) : KIND[i.kind][1]; return left ? `${left} · ${t}` : t; };
export function renderInbox() {
  const { items } = inboxOf(app.state, app.state.meta.player);
  $('#inbox-list').innerHTML = items.length ? items.slice(0, 8).map((i) => `<button class="wc-inbox__item" data-inbox="${i.kind}:${esc(i.id)}">${icon(KIND[i.kind][0])}<span class="wc-inbox__t"><b>${esc(i.title)}</b><small>${esc(inboxHint(i))}</small></span></button>`).join('') + (items.length > 8 ? `<div class="wc-inbox__more">and ${items.length - 8} more…</div>` : '')
    : '<p class="wc-inbox__none">No ravens wait, and no matter presses.</p>';
}
export async function openItem(kind, id) {
  closePopovers();
  if (kind === 'letter') return openDrawer('letters');
  if (kind === 'audience') return openChat(id);
  const d = (app.state.decisions || []).find((x) => x.id === id); if (!d) return;
  modal(decisionsHtml([d]), { vellum: true });
  wireDecisions($('#modal-box'), { onAllDone: () => closeModal() });
}

// ───────────── the menu and the popovers ─────────────
export function drawMenu() {
  $('#menu-doors').innerHTML = MENU.map((m) => `<button class="wc-menu__item" data-open="${m.id}" title="${esc(m.hint)}">${icon(m.icon)}<span class="wc-menu__t">${esc(m.label)}<em>${esc(m.hint)}</em></span><kbd>${m.key.toUpperCase()}</kbd></button>`).join('');
}
const POP = { menu: ['#menu-pop', '#menu-btn'], inbox: ['#inbox', '#inbox-btn'], mapmode: ['#mapmode-list', '#mapmode-btn'] };
export const isOpen = (name) => !$(POP[name][0]).classList.contains('hidden');
export function openPopover(name) {
  closePopovers(name);
  const [pop, btn] = POP[name]; $(pop).classList.remove('hidden'); $(btn).setAttribute('aria-expanded', 'true'); $(btn).classList.add('is-on'); sfx('open');
  if (name === 'inbox') { renderInbox(); alignUnder('#inbox', btn); }
  if (name === 'menu') app.coachDone?.('realm'); // the tip that said "open the menu" has been answered
}
// the Inbox opens under its seal, not at the screen's edge: its left edge under the seal's, and never off the screen
function alignUnder(pop, btn) { const p = $(pop), r = $(btn).getBoundingClientRect(); p.style.right = 'auto'; p.style.left = Math.max(8, Math.min(innerWidth - p.offsetWidth - 8, r.left - 8)) + 'px'; }
export function closePopover(name) { const [pop, btn] = POP[name]; if ($(pop).contains(document.activeElement)) $(btn).focus({ preventScroll: true }); $(pop).classList.add('hidden'); $(btn).setAttribute('aria-expanded', 'false'); $(btn).classList.remove('is-on'); }
/** Close every popover (but `except`); true if one was open — Escape closes these before a window or a card (GDD 17 §2.5). */
export function closePopovers(except = null) { let was = false; for (const n of Object.keys(POP)) if (n !== except && isOpen(n)) { closePopover(n); was = true; } return was; }
export function togglePopover(name) { if (isOpen(name)) closePopover(name); else openPopover(name); }
/** Open a door: the Realm, People (with the section a key or a vital names) or the Chronicle. */
export function openDoor(id, section) { closePopovers(); if (id === 'chronicle') return openDrawer('feed'); return openWindow(id, section); }

export function setMapModeName(label) { const el = $('#mapmode-name'); if (el) el.textContent = label; }

// ───────────── the headline strip ─────────────
const TIER_ICON = { great: 'tier3', major: 'tier2', news: 'tier1' };
const seenKey = () => `wc.seen.${app.saveId}`;
export function loadSeen() { app.seen = new Set(); try { const raw = localStorage.getItem(seenKey()); if (raw) for (const x of JSON.parse(raw)) app.seen.add(x); } catch { /* private window: the strip starts unread */ } }
export function markSeen(ids) { for (const i of ids) app.seen.add(i); try { localStorage.setItem(seenKey(), JSON.stringify([...app.seen].slice(-200))); } catch { /* not kept */ } }
/** The events of the turn being told, hidden until its turn to be shown (playback): the strip is the live feed. */
function historyForStrip() {
  const rv = app.reveal; const hist = app.state.history || [];
  if (!rv) return hist;
  return hist.map((t) => (t.turn === rv.turn ? { ...t, events: (t.events || []).map((e, i) => (rv.shown.has(i) ? e : { ...e, bg: true })) } : t));
}
export function renderStrip() {
  if (!app.state) return;
  const lines = stripOf(historyForStrip(), 3, app.seen || new Set());
  const fresh = lines.filter((l) => l.unread).length;
  // while a turn is told the strip is what shows it, so it carries the playback's Pause, Next and Skip (ui/playback.js reads `data-rb`)
  const rv = app.reveal;
  $('#strip-head').innerHTML = rv ? `${esc(String(rv.date || '').replace(/, \d+ AC$/, ''))} · ${rv.n} / ${rv.total}` : `Chronicle${fresh ? ` · <b>${fresh} new</b>` : ''}`;
  const ctl = $('#strip-ctl'); ctl.classList.toggle('hidden', !rv); $('#strip .wc-strip__all')?.classList.toggle('hidden', !!rv);
  if (rv) ctl.innerHTML = `<button class="wc-btn wc-btn--quiet" data-rb="pause">${rv.ctl.paused ? 'Resume' : 'Pause'}</button><button class="wc-btn wc-btn--quiet" data-rb="next" title="The next headline">Next</button><button class="wc-btn wc-btn--quiet" data-rb="skip" title="Tell the rest at once">Skip</button>${rv.ctl.noFly ? '<button class="wc-btn wc-btn--quiet" data-rb="follow" title="The camera is yours; let the story lead it again">Follow</button>' : ''}`;
  $('#strip-lines').innerHTML = lines.length ? lines.map((l) => `<li><button class="wc-strip__line${l.unread ? '' : ' is-old'}" data-strip="${esc(l.id)}"${l.where ? ` data-where="${esc(l.where)}"` : ''} title="${l.where ? 'Show where it happened' : 'Read it'}">${icon(TIER_ICON[l.tier] || (l.unread ? 'tier1' : 'pip'))}<span>${esc(l.text)}</span></button></li>`).join('')
    : '<li class="wc-strip__quiet">The realm waits. Nothing has been told yet.</li>';
  app.stripIds = lines.map((l) => l.id);
}
/** A line of the strip clicked: the map goes to where it happened and the event is told in full. */
export function openStripLine(id) {
  markSeen([id]); renderStrip();
  const [turn, idx] = id.split(':').map(Number);
  const e = app.state.history.find((t) => t.turn === turn)?.events?.[idx]; const pos = e?.where && app.state.holdings[e.where]?.pos;
  if (pos && app.map) { app.map.flyTo(pos, 420); app.map.flash?.(pos); }
  openNews(turn, idx);
}

// ───────────── all of it ─────────────
export function renderChrome() {
  if (!app.state) return;
  renderCrest(); renderVitals(); renderInboxSeal(); renderStrip();
}
