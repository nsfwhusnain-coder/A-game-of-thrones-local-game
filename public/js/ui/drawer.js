// Right drawer: chronicle feed, letters, audiences (one-on-one or council).
import { app, $, $$, esc, fmt, placeName, api, toast, por, sig, player, charRow } from './common.js';
import { dateStr } from '../shared/world.js';
import { briefFor } from '../../data/briefs.js';

export function setDrawer(tab) { app.drawerTab = tab; renderDrawer(); }
export function renderDrawer() {
  if (!app.state) return;
  $$('#drawer-tabs button[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === app.drawerTab));
  const unread = app.state.ravens.filter((r) => !r.read).length;
  $('#letters-count').textContent = unread ? `(${unread})` : '';
  const body = $('#drawer-body');
  if (app.drawerTab === 'audience') return renderAudience(body);
  if (app.drawerTab === 'letters') return renderLetters(body);
  renderFeed(body);
}

export function eventHtml(e) {
  return `<div class="event imp-${e.importance}" ${e.where ? `data-where="${e.where}"` : ''}><div class="et">${esc(e.title)}</div><div class="eb">${esc(e.text)}</div><div class="meta">${esc(e.type)}${e.where ? ' · ' + esc(placeName(app.state, e.where)) : ''}</div></div>`;
}
export function decisionsHtml() {
  const s = app.state;
  const pend = (s.decisions || []).filter((d) => d.status === 'pending');
  return pend.map((d) => {
    const who = d.from ? s.characters[d.from] : null;
    return `<div class="decision" data-dec="${d.id}"><div class="dec-head">${who ? `<img src="${por(who, 64)}" alt="">` : '<span class="dec-icon">⚖</span>'}<div><div class="dec-title">${esc(d.title)}</div><div class="muted" style="font-size:0.75rem">${who ? esc(who.name) + ' · ' : ''}${esc(d.date)}</div></div></div>
      <div class="eb">${esc(d.text)}</div>
      <div class="dec-opts">${d.options.map((o, i) => `<button class="btn dec-opt" data-dec-id="${d.id}" data-opt="${i}" title="${esc(o.hint || '')}">${esc(o.label)}${o.hint ? `<small>${esc(o.hint)}</small>` : ''}</button>`).join('')}</div>
      <input class="input dec-note" placeholder="Add your own words or conditions (optional)…"></div>`;
  }).join('');
}
export function wireDecisions(root) {
  $$('.dec-opt', root).forEach((b) => b.onclick = async () => {
    const card = b.closest('.decision'); const note = card.querySelector('.dec-note')?.value || '';
    try { const r = await api(`/games/${app.saveId}/act`, { body: { kind: 'decide', decision: b.dataset.decId, option: Number(b.dataset.opt), note } }); app.setState(r.state); toast(r.effects?.length ? `Done. ${r.effects.join(' · ')}` : 'Your answer is given. It will shape what comes next.'); } catch (e) { toast(e.message, true); }
  });
}
function renderFeed(body) {
  const s = app.state;
  const turns = [...s.history].reverse().slice(0, 15);
  body.innerHTML = decisionsHtml() + (turns.length ? turns.map((t) => `<div class="turn-block"><div class="turn-head"><span>Turn ${t.turn}</span><span>${esc(t.date)}</span></div>
      <div class="summary">${esc(t.summary)}</div>${t.events.map(eventHtml).join('')}
      ${t.ledger ? `<div class="changes">🪙 Treasury ${t.ledger.net >= 0 ? '+' : ''}${fmt(t.ledger.net)} → ${fmt(t.ledger.treasury)} gd · food ${t.ledger.food} moons</div>` : ''}
      ${t.applied?.length ? `<details class="changes"><summary>${t.applied.length} changes to the world</summary><ul>${t.applied.map((a) => `<li>${esc(a.text)}</li>`).join('')}</ul></details>` : ''}</div>`).join('')
    : `<div class="summary"><b>${esc(s.meta.scenarioName)}</b></div>
      ${(() => { const b = briefFor(s.houses[s.meta.player], s); return `<div class="event imp-4"><div class="et">Your situation</div><div class="eb">${esc(b.situation)}</div><div class="eb" style="margin-top:0.4rem"><b>Aims:</b> ${b.goals.map(esc).join(' · ')}</div></div>`; })()}
      <div class="event"><div class="et">How to play</div><div class="eb">
      • <b>Command</b> your house in plain words in the bar at the bottom — anything a lord could do.<br>
      • <b>Council</b> (🕯) — ask your steward, maester and master-at-arms for counsel and <i>numbers</i>. Their reports update your ledger.<br>
      • <b>Military</b> (⚔) — call the banners; each lord answers (or doesn't) in his own time. March hosts by clicking the map.<br>
      • <b>Economy</b> (🪙) — taxes, the ledger, and works to fund.<br>
      • <b>Diplomacy</b> (🕊) — treat with any house; proposals open an audience.<br>
      • Click any castle, army or person. Speak to anyone — distant lords get a raven.<br>
      • <b>Advance ▶</b> — time passes; the world acts, the map changes.<br>
      • Map: drag to pan, wheel to zoom, WASD to move, double-click to fly.</div></div>`);
  wireDecisions(body);
  $$('.event[data-where]', body).forEach((el) => el.onclick = () => { const w = el.dataset.where; if (s.holdings[w]) { app.map.flyTo(s.holdings[w].pos); app.map.flash(s.holdings[w].pos); } });
}
export function ravenHtml(r) {
  return `<div class="raven-card ${r.read ? '' : 'unread'}"><div class="from">From ${esc(r.fromName)} · ${esc(r.date)}</div>${esc(r.text)}${r.from ? `<div style="margin-top:0.4rem"><button class="btn small" data-talk="${r.from}">Reply</button></div>` : ''}</div>`;
}
async function renderLetters(body) {
  const s = app.state;
  body.innerHTML = s.ravens.map(ravenHtml).join('') || '<p class="muted">No ravens have come.</p>';
  if (s.ravens.some((r) => !r.read)) { try { const r = await api(`/games/${app.saveId}/ravens/read`, { body: {} }); s.ravens = r.ravens; app.renderTop?.(); } catch { /* */ } }
}

// ───────────── audiences ─────────────
export function openChat(charId, prefill) { app.council = null; app.chatWith = charId; app.chatPrefill = prefill; showDrawer(); setDrawer('audience'); }
export function openCouncil(ids) { app.chatWith = null; app.council = ids; showDrawer(); setDrawer('audience'); }
function showDrawer() { $('#drawer').classList.remove('hidden'); $('#drawer-open').classList.add('hidden'); }

function renderAudience(body) {
  const s = app.state;
  if (app.council) return renderCouncil(body);
  const c = app.chatWith ? s.characters[app.chatWith] : null;
  if (!c) {
    const recent = Object.keys(s.chats).filter((k) => !k.startsWith('council:')).map((id) => s.characters[id]).filter(Boolean).reverse();
    body.innerHTML = `<p class="muted">Choose someone to speak with — from the Council, a castle on the map, or the People window.</p>${recent.length ? '<h4>Recent audiences</h4>' + recent.map((x) => charRow(x)).join('') : ''}`;
    return;
  }
  const h = s.houses[c.house]; const log = s.chats[c.id] || [];
  const p = s.meta.player; const me = s.characters[player().lord];
  const together = me && me.loc === c.loc;
  const quick = c.house === p ? ['How many men can we field?', 'What is in the treasury, and what do we owe?', 'How full are the granaries?', 'Which of my lords can I trust?', 'What news?'] : ['What do you want?', 'I propose an alliance.', 'Will you trade with us?', 'What news from your lands?', 'Where does your house stand?'];
  body.innerHTML = `<div class="chat">
    <div class="chat-head"><img src="${por(c, 80)}" alt=""><div style="flex:1;min-width:0"><div class="title" style="font-family:var(--display);color:var(--gold2)" data-char="${c.id}">${esc(c.name)} ${sig(h, 1)}</div><div class="sub muted" style="font-size:0.78rem">${esc(c.title || '')} · ${esc(placeName(s, c.loc))} · ${together ? 'in person' : '<b>by raven</b>'}${c.house !== p ? ' · opinion ' + (c.opinion || 0) : ''}</div></div><button class="btn small" data-action="close-chat">✕</button></div>
    <div class="chat-log" id="chat-log">${log.length ? log.map((m) => msgHtml(m, c)).join('') : `<div class="muted" style="font-style:italic">${esc(c.bio || '')}</div>`}</div>
    <div class="quick-asks">${quick.map((q) => `<button data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
    <div class="chat-input"><textarea id="chat-text" rows="3" placeholder="${together ? 'Speak…' : 'Write your letter…'}">${esc(app.chatPrefill || '')}</textarea><button class="btn primary" id="chat-send">Send</button></div></div>`;
  app.chatPrefill = null;
  const logEl = $('#chat-log'); logEl.scrollTop = logEl.scrollHeight;
  const send = async (text) => {
    text = (text ?? $('#chat-text').value).trim(); if (!text || app.busy) return;
    $('#chat-text').value = '';
    logEl.insertAdjacentHTML('beforeend', msgHtml({ role: 'player', text, date: dateStr(s.meta.date) }, c) + `<div class="msg npc" id="typing"><i>${esc(c.name)} ${together ? 'considers…' : 'will reply by raven…'}</i></div>`);
    logEl.scrollTop = 1e9;
    try {
      app.busy = true;
      const r = await api(`/games/${app.saveId}/talk`, { body: { character: c.id, message: text } });
      app.setState(r.state, { keepDrawer: true });
      if (app.drawerTab === 'audience') renderAudience(body);
      if (r.applied?.length) toast(r.applied.map((a) => a.text).join(' · '));
    } catch (e) { toast(e.message, true); $('#typing')?.remove(); }
    finally { app.busy = false; }
  };
  $('#chat-send').onclick = () => send();
  $('#chat-text').onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };
  $$('.quick-asks button', body).forEach((b) => b.onclick = () => send(b.dataset.q));
  $('#chat-text').focus();
}
function msgHtml(m, c) {
  const s = app.state; const sp = m.speaker ? s.characters[m.speaker] : c;
  return `<div class="msg ${m.role}"><div class="who">${m.role === 'player' ? 'You' : `<img src="${por(sp, 40)}">${esc(sp?.name || '')}`} · ${esc(m.date || '')}</div>${esc(m.text)}${m.applied?.length ? `<div class="applied">${m.applied.map(esc).join('<br>')}</div>` : ''}</div>`;
}

function renderCouncil(body) {
  const s = app.state; const ids = app.council.filter((i) => s.characters[i]);
  const key = 'council:' + [...ids].sort().join(',');
  const log = s.chats[key] || [];
  body.innerHTML = `<div class="chat">
    <div class="chat-head"><div class="council-faces">${ids.map((i) => `<img src="${por(s.characters[i], 40)}" title="${esc(s.characters[i].name)}">`).join('')}</div><div style="flex:1;margin-left:0.8rem"><div class="title" style="font-family:var(--display);color:var(--gold2)">Council</div><div class="sub muted" style="font-size:0.78rem">${ids.map((i) => esc(s.characters[i].name.split(' ')[0])).join(', ')}</div></div><button class="btn small" data-action="close-chat">✕</button></div>
    <div class="chat-log" id="chat-log">${log.length ? log.map((m) => msgHtml(m, null)).join('') : '<div class="muted" style="font-style:italic">Your counsellors take their seats. What would you put before them?</div>'}</div>
    <div class="quick-asks">${['Give me a full accounting of our strength.', 'What threats face us?', 'What should we do this moon?', 'Can we afford a war?'].map((q) => `<button data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
    <div class="chat-input"><textarea id="chat-text" rows="3" placeholder="Put a question to the council…"></textarea><button class="btn primary" id="chat-send">Ask</button></div></div>`;
  const logEl = $('#chat-log'); logEl.scrollTop = logEl.scrollHeight;
  const send = async (text) => {
    text = (text ?? $('#chat-text').value).trim(); if (!text || app.busy) return;
    $('#chat-text').value = '';
    logEl.insertAdjacentHTML('beforeend', msgHtml({ role: 'player', text, date: dateStr(s.meta.date) }) + '<div class="msg npc" id="typing"><i>The council deliberates…</i></div>'); logEl.scrollTop = 1e9;
    try {
      app.busy = true;
      const r = await api(`/games/${app.saveId}/council`, { body: { members: ids, message: text } });
      app.setState(r.state, { keepDrawer: true }); if (app.drawerTab === 'audience') renderCouncil(body);
      if (r.applied?.length) toast(r.applied.map((a) => a.text).join(' · '));
    } catch (e) { toast(e.message, true); $('#typing')?.remove(); } finally { app.busy = false; }
  };
  $('#chat-send').onclick = () => send();
  $('#chat-text').onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };
  $$('.quick-asks button', body).forEach((b) => b.onclick = () => send(b.dataset.q));
}
