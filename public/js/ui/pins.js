// The pin window: click a pin on the map and what happened there opens in front of you.
// News is read and acknowledged (the pin goes); a matter awaiting your word shows its choices, or lets you answer
// in your own words. Several things at one place are shown one after another.
import { app, $, esc, api, modal, closeModal, sig, addOrder, placeName, detailLines } from './common.js';
import { shortDate } from './feed.js';
import { decisionsHtml, wireDecisions } from './drawer.js';
import { openPins } from '../shared/pins.js';
import { sfx } from './sfx.js';

// Remember what has been read (locally at once, on the server in the background)
function acknowledge(keys) {
  const s = app.state; s.acks = s.acks || {};
  for (const k of keys) s.acks[k] = s.meta.turn;
  app.map?.syncEventPins();
  api(`/games/${app.saveId}/ack`, { body: { keys } }).catch(() => { /* the pin may come back after a reload; harmless */ });
}

export function openPin(where) {
  const g = openPins(app.state).get(where);
  if (!g) return;
  const items = [...g.decisions.map((d) => ({ kind: 'decision', d })), ...g.events.map((e) => ({ kind: 'event', e }))];
  let i = 0;
  const place = app.state.holdings[where]?.name || (g.events[0]?.title ?? 'The field');
  if (g.pos || app.state.holdings[where]) app.map?.flyTo(g.pos || app.state.holdings[where].pos, 380);
  sfx('open');

  const next = () => { i++; if (i >= items.length) { closeModal(); return; } show(); };
  const show = () => {
    const it = items[i]; const n = items.length;
    const head = `<div class="pin-head"><span class="pin-place">${esc(place)}</span>${n > 1 ? `<span class="pin-count">${i + 1} of ${n}</span>` : ''}</div>`;
    if (it.kind === 'decision') {
      modal(`${head}<div class="pin-body">${decisionsHtml([it.d])}</div>
        <div class="report-actions">${n > 1 ? '<button class="btn ghost" id="pin-skip">Later ›</button>' : ''}<button class="btn ghost" data-action="close-modal">Decide later</button></div>`);
      wireDecisions($('#modal-box'), { onDecided: () => setTimeout(next, 150) });
      const sk = $('#pin-skip'); if (sk) sk.onclick = next;
      return;
    }
    const e = it.e; const s = app.state;
    const houses = (e.houses || []).filter((h) => s.houses[h]).slice(0, 4);
    // the card of the story, on vellum (mockup 04): its headline, the plain summary, and the details — the scene, the numbers — under it
    const at = e.where && s.holdings[e.where] ? placeName(s, e.where) : place;
    modal(`<div class="wc-vellum wc-pin"><div class="wc-pin__head"><span class="wc-kicker">${esc(at)}${e.date ? ` · ${esc(shortDate(e.date))}` : ''}</span>${n > 1 ? `<span class="wc-kicker">${i + 1} of ${n}</span>` : ''}</div>
      <h2 class="wc-title">${esc(e.headline || e.title)}</h2><div class="wc-rule"></div>
      <p class="wc-pin__sum wc-prose">${esc(e.summary ?? e.text)}</p>
      ${e.scene ? `<p class="wc-pin__scene wc-prose">${esc(e.scene)}</p>` : ''}
      ${detailLines(e).length ? `<ul class="wc-bullets wc-pin__facts">${detailLines(e).map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
      ${houses.length ? `<div class="wc-pin__houses">${houses.map((h) => `<span class="wc-chip wc-chip--vellum">${sig(s.houses[h], 0.95)} ${esc(s.houses[h].name)}</span>`).join('')}</div>` : ''}
      <details class="pin-order"><summary>Give an order about this…</summary>
        <textarea class="input" id="pin-order-text" rows="2" placeholder="e.g. Send Ser Rodrik with fifty men to hunt these outlaws down."></textarea>
        <button class="wc-btn wc-btn--small" id="pin-order-add" disabled>Add to my orders</button></details>
      <div class="wc-report__go">${n - i > 1 ? '<button class="wc-btn wc-btn--quiet" id="pin-all">Acknowledge all here</button>' : ''}<button class="wc-btn wc-btn--gold" id="pin-ack">${n - i > 1 ? 'Acknowledged ›' : 'Acknowledged'}</button></div></div>`, { vellum: true });
    const txt = $('#pin-order-text'), add = $('#pin-order-add');
    txt.oninput = () => { add.disabled = !txt.value.trim(); };
    add.onclick = () => { addOrder(`Regarding "${e.title}" at ${place}: ${txt.value.trim()}`); sfx('seal'); acknowledge([e.key]); next(); };
    $('#pin-ack').onclick = () => { acknowledge([e.key]); next(); };
    const all = $('#pin-all'); if (all) all.onclick = () => { acknowledge(items.slice(i).filter((x) => x.kind === 'event').map((x) => x.e.key)); closeModal(); };
  };
  show();
}
