// The contextual card on the screen (WP U4): a click on a castle or a host opens the small card of ui/cards.js beside it, and keeps it beside it as the
// map moves; it never covers the top bar, the strip, the command bar or the ruler. One card at a time, and never with a window or a sheet: opening one
// closes the others (the map is the screen). "More" opens the whole sheet, which has everything the card leaves out.
import { app, $, esc, banner, por, REGION_NAMES } from './common.js';
import { holdingCard, armyCard, cardHtml, placeCard } from './cards.js';
import { openSheet, openWindow, closeWindow, closeSheet } from './windows.js';
import { viewOfArmies } from '../engine/knowledge.js';

// what the card keeps clear of: the bars, the strip and the chronicle, the command bar, the ruler, the map-mode button
const KEEP_CLEAR = ['#hud-top .hud-left', '#hud-top .hud-right', '#strip', '#drawer:not(.hidden)', '#command-bar', '#hud-player', '#mapmode', '#menu-pop:not(.hidden)', '#inbox:not(.hidden)'];
const rectOf = (sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return r.width && r.height ? [r.left, r.top, r.right, r.bottom] : null; };

const env = { esc, banner: (hid) => banner(app.state.houses[hid]), por: (cid) => por(app.state.characters[cid], 64) };

function model(kind, id) {
  const s = app.state; const regionName = (r) => REGION_NAMES[r] || '';
  return kind === 'army' ? armyCard(s, id, { known: viewOfArmies(s), regionName }) : holdingCard(s, id, { history: s.history, regionName });
}
/** Where the card's object is on the screen: { x, y } in CSS pixels, or null when it is not in view. */
function anchorOf(kind, id) {
  const s = app.state; const pos = kind === 'army' ? s.parties?.[id]?.pos : s.holdings?.[id]?.pos;
  return pos && app.map?.screenOf ? app.map.screenOf(pos[0], pos[1]) : null;
}

let raf = 0;
function put() {
  const el = $('#card'); if (!el || el.classList.contains('hidden') || !app.card) return;
  const a = anchorOf(app.card.kind, app.card.id);
  const off = !a || a.x < -30 || a.y < -30 || a.x > window.innerWidth + 30 || a.y > window.innerHeight + 30;
  if (off) { el.style.visibility = 'hidden'; return; } // the object is off the screen: the card waits for it
  el.style.visibility = '';
  const w = el.offsetWidth, h = el.offsetHeight; const screen = { w: window.innerWidth, h: window.innerHeight };
  const p = placeCard(a, { w, h }, screen, KEEP_CLEAR.map(rectOf).filter(Boolean), { gap: Math.round(el.offsetWidth * 0.2) }); // (a castle's name is written beside it, and a host stands in one: leave them clear)
  if (el.dataset.at !== `${p.left},${p.top}`) { el.dataset.at = `${p.left},${p.top}`; el.style.left = `${p.left}px`; el.style.top = `${p.top}px`; el.dataset.side = p.side; }
}
const follow = () => { put(); raf = app.card ? requestAnimationFrame(follow) : 0; };

/** Put the card away and let go of the castle or host it was about (the map's own selection). */
export function dismissCard() { closeCard(); app.map?.select(null); if (app.map) app.map.selectedArmy = null; }
export function closeCard() {
  app.card = null; const el = $('#card'); if (!el) return;
  el.classList.add('hidden'); el.setAttribute('aria-hidden', 'true'); el.dataset.at = '';
  cancelAnimationFrame(raf); raf = 0;
}
app.closeCard = closeCard;

/** Open the card of a holding or a host beside it; the sheet and the window make way. */
export function openCard(kind, id) {
  const m = model(kind, id); const el = $('#card'); if (!m || !el) return false;
  closeSheet(); closeWindow();
  app.card = { kind, id };
  el.innerHTML = cardHtml(m, env); el.classList.remove('hidden'); el.setAttribute('aria-hidden', 'false'); el.dataset.at = ''; el.style.visibility = 'hidden';
  el.setAttribute('aria-label', m.title);
  put(); if (!raf) raf = requestAnimationFrame(follow);
  return true;
}
/** After the state has changed (a turn, an order): draw the open card again, or drop it if its object is gone. */
export function refreshCard() {
  if (!app.card) return; const { kind, id } = app.card; const m = model(kind, id);
  if (!m) return closeCard();
  $('#card').innerHTML = cardHtml(m, env); $('#card').dataset.at = ''; put();
}

document.addEventListener('click', (e) => {
  const t = e.target;
  const more = t.closest('[data-card-more]');
  if (more) { const [kind, id] = more.dataset.cardMore.split(':'); closeCard(); openSheet(kind, id); return; }
  const news = t.closest('[data-card-news]');
  if (news) { const id = news.dataset.cardNews; closeCard(); if (app.openPin && app.state.holdings[id]) app.openPin(id); return; }
  const tab = t.closest('[data-open-tab]');
  if (tab) {
    const { openTab, then, works } = tab.dataset; closeCard();
    if (works) app.projHold = works;
    openWindow('realm', openTab);
    if (then === 'call-banners') setTimeout(() => $('#call-banners')?.click(), 0);
    if (then === 'court') setTimeout(() => document.querySelector('[data-court]')?.scrollIntoView?.({ block: 'center' }), 0);
    return;
  }
  const ch = t.closest('#card [data-char]'); if (ch) { const id = ch.dataset.char; closeCard(); openSheet('char', id); return; }
  const mb = t.closest('#card [data-march]'); if (mb) { const id = mb.dataset.march; closeCard(); app.startPick('march', id); return; }
  if (t.closest('[data-action="close-card"]')) dismissCard();
  if (t.closest('[data-order-tpl], [data-talk]') && t.closest('#card')) setTimeout(closeCard, 0);
});
