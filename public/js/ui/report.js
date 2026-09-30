// The maester's report (docs/gdd/18-headlines.md §2.5–2.6, WP N7; mockup 05): when a turn has been told, a page of vellum says it once more in ninety
// words — the three things that mattered most, each with a sentence; the rest as headlines; the Meanwhile; and what awaits your word, so nothing
// waits unseen. The words are the turn's digest, built by the engine from the cards (ui/feed.js `reportOf`); this file only sets them on the page.
import { app, $, esc, modal, closeModal } from './common.js';
import { reportOf } from './feed.js';
import { inboxOf } from './hud.js';
import { icon } from './icons.js';
import { openItem } from './chrome.js';

const KEY = 'wc-report';
/** Is the report shown after each turn? (Settings: on unless the lord turned it off.) */
export const reportOn = () => { try { return localStorage.getItem(KEY) !== '0'; } catch { return true; } };
export const setReportOn = (on) => { try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* not kept */ } };

const WAIT = { letter: ['raven', 'Letter'], matter: ['seal', 'Matter'], audience: ['speak', 'Audience'] };

/** Show the report of a turn; false when there is nothing to tell (a quiet turn shows no page). */
export function showReport(turn) {
  const s = app.state; const t = s.history.find((x) => x.turn === turn); const r = t && reportOf(t); if (!r) return false;
  const waits = inboxOf(s, s.meta.player).items.slice(0, 4);
  modal(`<div class="wc-vellum wc-report" role="document">
    <div class="wc-kicker wc-report__kicker">The maester’s report</div>
    <h2 class="wc-title">${esc(r.title)}</h2>
    <div class="wc-rule"></div>
    ${r.top.length ? `<ol class="wc-digest">${r.top.map((x, i) => `<li><span class="wc-numeral${i === 0 ? ' wc-numeral--leaf' : ''}" aria-hidden="true">${i + 1}</span><div><h3>${esc(x.headline)}</h3>${x.line ? `<p>${esc(x.line)}</p>` : ''}</div></li>`).join('')}</ol>` : ''}
    ${r.meanwhile ? `<div class="wc-kicker">Meanwhile…</div><p class="wc-report__mw">${esc(r.meanwhile)}</p>` : ''}
    ${r.also.length ? `<p class="wc-report__also"><b>Also:</b> ${r.also.map((x) => esc(x.headline.replace(/[.!?]+$/, ''))).join(' · ')}</p>` : ''}
    ${waits.length ? `<div class="wc-kicker">Awaiting your word</div><div class="wc-report__waits">${waits.map((w) => `<button class="wc-report__wait" data-wait="${w.kind}:${esc(w.id)}"><span>${esc(w.title)}</span><span class="wc-chip wc-chip--vellum">${icon(WAIT[w.kind][0])}${WAIT[w.kind][1]}</span></button>`).join('')}</div>` : ''}
    <div class="wc-report__go"><button class="wc-btn wc-btn--gold" data-action="close-modal" id="report-go">Continue ${icon('chevronR')}</button></div>
  </div>`, { vellum: true });
  const box = $('#modal-box');
  box.querySelectorAll('[data-wait]').forEach((b) => b.onclick = () => { const [kind, ...id] = b.dataset.wait.split(':'); closeModal(); openItem(kind, id.join(':')); });
  $('#report-go')?.focus();
  return true;
}
