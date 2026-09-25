// The pin window: click a pin on the map and what happened there opens in front of you.
// News is read and acknowledged (the pin goes); a matter awaiting your word shows its choices, or lets you answer
// in your own words. Several things at one place are shown one after another.
import { app, $, esc, api, modal, closeModal, sig, addOrder, placeName } from './common.js';
import { eventArt } from './event-art.js';
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
    modal(`${head}<div class="pin-body event imp-${e.importance} pin-event">${eventArt(e)}
        <div class="et">${esc(e.title)}</div><div class="eb">${esc(e.text)}</div>
        ${e.details ? `<div class="pin-details">${esc(e.details)}</div>` : ''}
        <div class="meta">${houses.map((h) => sig(s.houses[h], 1.1)).join('')} ${esc(e.date || '')}${e.day ? ` · day ${e.day}` : ''} · ${esc(e.type || '')}${e.where && s.holdings[e.where] ? ' · ' + esc(placeName(s, e.where)) : ''}</div></div>
      <details class="pin-order"><summary>Give an order about this…</summary>
        <textarea class="input" id="pin-order-text" rows="2" placeholder="e.g. Send Ser Rodrik with fifty men to hunt these outlaws down."></textarea>
        <button class="btn small" id="pin-order-add" disabled>Add to my orders</button></details>
      <div class="report-actions">${n - i > 1 ? '<button class="btn ghost" id="pin-all">Acknowledge all here</button>' : ''}<button class="btn primary" id="pin-ack">${n - i > 1 ? 'Acknowledged ›' : 'Acknowledged'}</button></div>`);
    const txt = $('#pin-order-text'), add = $('#pin-order-add');
    txt.oninput = () => { add.disabled = !txt.value.trim(); };
    add.onclick = () => { addOrder(`Regarding "${e.title}" at ${place}: ${txt.value.trim()}`); sfx('seal'); acknowledge([e.key]); next(); };
    $('#pin-ack').onclick = () => { acknowledge([e.key]); next(); };
    const all = $('#pin-all'); if (all) all.onclick = () => { acknowledge(items.slice(i).filter((x) => x.kind === 'event').map((x) => x.e.key)); closeModal(); };
  };
  show();
}
