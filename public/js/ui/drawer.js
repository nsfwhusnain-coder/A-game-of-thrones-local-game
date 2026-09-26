// Right drawer: chronicle feed, letters, audiences (one-on-one or council).
import { eventArt } from './event-art.js';
import { app, $, $$, esc, fmt, placeName, api, toast, por, sig, player, charRow, modal } from './common.js';
import { dateStr } from '../shared/world.js';
import { orderOutcome, STATUS_LABEL } from '../shared/errands.js';
import { THREADS } from '../shared/plots.js';
import { briefFor } from '../../data/briefs.js';
import { beats, speak, speakBeats, stopSpeaking, voiceSettings, warmVoices } from './voice.js';
import { temperament, natureTags, VERDICT_LABEL, moodWord } from '../shared/temperament.js';

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

export function eventHtml(e, compact = false) {
  return `<div class="event imp-${e.importance}${compact ? ' compact' : ''}" ${e.where ? `data-where="${e.where}"` : ''}>${!compact || e.importance >= 4 ? eventArt(e) : ''}<div class="et">${esc(e.title)}</div><div class="eb">${esc(e.text)}</div>${e.details ? `<details class="ev-more"><summary>More</summary><div>${esc(e.details)}</div></details>` : ''}<div class="meta">${e.date ? `${esc(e.date.replace(/, \d+ AC$/, ''))} · ` : e.day ? `day ${e.day} · ` : ''}${esc(e.type)}${e.where ? ' · ' + esc(placeName(app.state, e.where)) : ''}</div></div>`;
}
// The small life of the realm, told briefly beneath the turn's great events, grouped by where it happened
const REGION_ORDER = ['north', 'wall', 'beyond', 'iron_islands', 'riverlands', 'vale', 'westerlands', 'crownlands', 'reach', 'stormlands', 'dorne', 'essos'];
const REGION_TITLE = { north: 'The North', wall: 'The Wall', beyond: 'Beyond the Wall', iron_islands: 'The Iron Islands', riverlands: 'The Riverlands', vale: 'The Vale', westerlands: 'The Westerlands', crownlands: 'The Crownlands', reach: 'The Reach', stormlands: 'The Stormlands', dorne: 'Dorne', essos: 'Across the Narrow Sea' };
export const mainEvents = (evs) => (evs || []).filter((e) => !e.bg);
export function meanwhileHtml(evs, open = false) {
  const bg = (evs || []).filter((e) => e.bg); if (!bg.length) return '';
  const s = app.state; const groups = new Map();
  for (const e of bg) { const r = s.holdings[e.where]?.region || 'other'; if (!groups.has(r)) groups.set(r, []); groups.get(r).push(e); }
  const regions = [...groups.keys()].sort((a, b) => REGION_ORDER.indexOf(a) - REGION_ORDER.indexOf(b));
  return `<details class="meanwhile"${open ? ' open' : ''}><summary>Meanwhile, across the realm <span class="muted">(${bg.length})</span></summary>${regions.map((r) => `<div class="mw-region"><div class="mw-title">${esc(REGION_TITLE[r] || 'Elsewhere')}</div>${groups.get(r).map((e) => `<div class="mw-item${e.mine ? ' mine' : ''}" ${e.where ? `data-where="${e.where}"` : ''}><b>${esc(e.title)}.</b> ${esc(e.text)}</div>`).join('')}</div>`).join('')}</details>`;
}

export function decisionsHtml(list) {
  const s = app.state;
  const pend = list || (s.decisions || []).filter((d) => d.status === 'pending');
  return pend.map((d) => {
    const who = d.from ? s.characters[d.from] : null;
    return `<div class="decision" data-dec="${d.id}"><div class="dec-head">${who ? `<img src="${por(who, 64)}" alt="">` : '<span class="dec-icon">⚖</span>'}<div><div class="dec-title">${esc(d.title)}</div><div class="muted" style="font-size:0.75rem">${who ? esc(who.name) + ' · ' : ''}${esc(d.date)}</div></div></div>
      <div class="eb">${esc(d.text)}</div>
      <div class="dec-opts">${d.options.map((o, i) => `<button class="btn dec-opt" data-dec-id="${d.id}" data-opt="${i}" title="${esc(o.hint || '')}">${esc(o.label)}${o.hint ? `<small>${esc(o.hint)}</small>` : ''}</button>`).join('')}</div>
      <div class="dec-own"><textarea class="input dec-note" rows="2" placeholder="Or write your own answer here (the button wakes when you do) — or add conditions to a choice above…"></textarea><button class="btn small dec-custom" data-dec-id="${d.id}" disabled title="Write your answer in the box first">Answer in my own words</button></div></div>`;
  }).join('');
}
export function wireDecisions(root, { onAllDone, onDecided } = {}) {
  $$('.dec-note', root).forEach((t) => t.oninput = () => { const b = t.parentElement.querySelector('.dec-custom'); if (b) b.disabled = !t.value.trim(); });
  $$('.dec-opt, .dec-custom', root).forEach((b) => b.onclick = async () => {
    const card = b.closest('.decision'); if (card.classList.contains('busy')) return;
    const own = b.classList.contains('dec-custom');
    const note = card.querySelector('.dec-note')?.value || '';
    if (own && !note.trim()) return;
    card.classList.add('busy'); $$('.dec-opt, .dec-custom', card).forEach((x) => { x.disabled = true; x.classList.toggle('chosen', x === b); });
    try {
      const r = await api(`/games/${app.saveId}/act`, { body: own ? { kind: 'decide', decision: b.dataset.decId, custom: note } : { kind: 'decide', decision: b.dataset.decId, option: Number(b.dataset.opt), note } });
      // acknowledge the choice where it was made, then fold the card away
      const label = own ? note.trim() : b.childNodes[0]?.textContent || b.textContent;
      const title = card.querySelector('.dec-title')?.textContent || '';
      card.classList.remove('busy'); card.classList.add('decided');
      card.innerHTML = `<div class="dec-done"><span class="tick">✓</span><div><div class="dec-title">${esc(title)}</div><div>You chose <b>${esc(label)}</b>.${r.effects?.length ? ` <span class="muted">${esc(r.effects.join(' · '))}</span>` : ' <span class="muted">Your word goes out; the realm will answer.</span>'}</div></div></div>`;
      setTimeout(() => {
        card.classList.add('folding');
        setTimeout(() => {
          app.setState(r.state);
          onDecided?.(b.dataset.decId);
          if (!$$('.decision:not(.decided)', root).length) onAllDone?.();
        }, 450);
      }, 1100);
    } catch (e) { card.classList.remove('busy'); $$('.dec-opt, .dec-custom', card).forEach((x) => { x.disabled = false; x.classList.remove('chosen'); }); toast(e.message, true); }
  });
}
const NEWS_ICON = { war: '⚔', diplomacy: '✉', intrigue: '🗡', economy: '⚖', court: '♛', disaster: '🔥', religion: '✧', magic: '✦', rumor: '❝' };
// One event, told in full, in a window over the map
function openNews(turn, idx) {
  const s = app.state; const t = s.history.find((x) => x.turn === turn); const e = t?.events?.[idx]; if (!e) return;
  if (e.where && s.holdings[e.where]) { app.map?.flyTo(s.holdings[e.where].pos, 420); app.map?.flash(s.holdings[e.where].pos); }
  modal(`<div class="pin-head"><span class="pin-place">${esc(e.where ? placeName(s, e.where) : '')}</span><span class="pin-count">${esc(t.date)}</span></div>
    <div class="pin-body event imp-${e.importance}">${eventArt(e)}<div class="et">${esc(e.title)}</div><div class="eb">${esc(e.text)}</div>${e.details ? `<div class="pin-details">${esc(e.details)}</div>` : ''}</div>
    <div class="report-actions"><button class="btn primary" data-action="close-modal">Close</button></div>`);
}
function openMeanwhile(turn) {
  const t = app.state.history.find((x) => x.turn === turn); if (!t) return;
  modal(`<h2>Across the realm — ${esc(t.date)}</h2>${meanwhileHtml(t.events, true)}<div class="report-actions"><button class="btn primary" data-action="close-modal">Close</button></div>`);
}
// The story's open threads: the great matters under way (engine) and what the chronicle last found unresolved
function threadsHtml(s) {
  const great = THREADS.filter((t) => (s.plots?.stages?.[t.id] || 0) > 0 && s.plots.stages[t.id] < t.stages.length).map((t) => { const last = (s.plots.log || []).filter((l) => l.thread === t.id).at(-1); return `<li><b>${esc(t.name)}</b>${last?.title ? ` — last: ${esc(last.title)}` : ''}</li>`; });
  const open = (s.storyThreads || []).map((t) => `<li><b>${esc(t.title)}</b> — ${esc(t.last)} <span class="muted">(${esc(t.date.replace(/, \d+ AC$/, ''))})</span></li>`);
  if (!great.length && !open.length) return '';
  return `<details class="threads"${app.threadsOpen ? ' open' : ''}><summary>🧵 Threads to follow <span class="muted">(${great.length + open.length})</span></summary>${open.length ? '' : ''}<ul>${great.join('')}</ul>${open.length ? `<ul>${open.join('')}</ul>` : ''}</details>`;
}
// One event as the story reads it: a plain headline; where, when, who; the whole account inline — no modal needed
function storyHtml(s, t, e) {
  const p = s.meta.player; const mine = e.mine || (e.houses || []).includes(p);
  const rumour = e.type === 'rumor' || /^(rumou?r|it is said|word comes|men say)/i.test(e.text || '');
  const houses = (e.houses || []).filter((h) => s.houses[h]).slice(0, 3);
  const date = (e.date || t.date).replace(/, \d+ AC$/, '');
  return `<div class="story imp-${e.importance}${mine ? ' mine' : ''}" data-news="${t.turn}:${(t.events || []).indexOf(e)}">
    <div class="story-h">${NEWS_ICON[e.type] ? `${NEWS_ICON[e.type]} ` : ''}${esc(e.title)}</div>
    <div class="story-tags">${e.where && s.holdings[e.where] ? `<span class="tag place" data-goto="${e.where}">📍 ${esc(placeName(s, e.where))}</span>` : ''}<span class="tag">${esc(date)}</span>${houses.map((h) => `<span class="tag">${sig(s.houses[h], 0.9)} ${esc(s.houses[h].name)}</span>`).join('')}${mine ? '<span class="tag you">Your house</span>' : ''}${rumour ? '<span class="tag rumour">Rumour</span>' : ''}</div>
    <div class="story-x">${esc(e.text)}</div>${e.details ? `<div class="story-d">${esc(e.details)}</div>` : ''}</div>`;
}
// what the player ordered that day, and what the engine made of it — your hand in the day's story
function yoursHtml(t) {
  const rows = (t.orders || []).filter((o) => !o.auto || o.status).map((o) => { const r = orderOutcome(o, app.state); return `<div class="yo">“${esc(o.text.length > 110 ? o.text.slice(0, 110) + '…' : o.text)}”</div>${r.lines.slice(0, 3).map((l) => `<div class="yr${/^could not/i.test(l) ? ' bad' : ''}">→ ${esc(l.replace(/^could not be done: /i, 'Could not: '))}</div>`).join('') || `<div class="yr">→ ${esc(STATUS_LABEL[r.status])}</div>`}`; }).join('');
  return rows ? `<div class="yours"><div class="yh">Your orders</div>${rows}</div>` : '';
}
function renderFeed(body) {
  const s = app.state;
  const turns = [...s.history].reverse().slice(0, 30);
  // the news, as a list: a date, then one row per event (icon, headline, one line); click a row for the whole story
  body.innerHTML = decisionsHtml() + threadsHtml(s) + (turns.length ? turns.map((t) => { const ev = mainEvents(t.events); const bg = (t.events || []).filter((e) => e.bg).length; return `<div class="news-day"><div class="news-date">${esc(t.date)}</div>
      ${yoursHtml(t)}${ev.map((e) => storyHtml(s, t, e)).join('') || '<div class="news-quiet">No news of note.</div>'}
      ${bg ? `<div class="news-more" data-meanwhile="${t.turn}">+ ${bg} small happening${bg > 1 ? 's' : ''} across the realm</div>` : ''}</div>`; }).join('')
    : `<div class="summary"><b>${esc(s.meta.scenarioName)}</b></div>
      ${(() => { const b = briefFor(s.houses[s.meta.player], s); return `<div class="event imp-4"><div class="et">Your situation</div><div class="eb">${esc(b.situation)}</div><div class="eb" style="margin-top:0.4rem"><b>Aims:</b> ${b.goals.map(esc).join(' · ')}</div></div>`; })()}
      <details class="event howto"${s.meta.turn === 0 ? ' open' : ''}><summary class="et">How to play</summary><div class="eb">
      • <b>Command</b> your house in plain words in the bar at the bottom — anything a lord could do.<br>
      • <b>Council</b> (🕯) — ask your steward, maester and master-at-arms for counsel and <i>numbers</i>. Their reports update your ledger.<br>
      • <b>Military</b> (⚔) — call the banners; each lord answers (or doesn't) in his own time. March hosts by clicking the map.<br>
      • <b>Economy</b> (🪙) — taxes, the ledger, and works to fund.<br>
      • <b>Diplomacy</b> (🕊) — treat with any house; proposals open an audience.<br>
      • Click any castle, army or person. Speak to anyone — distant lords get a raven. Each answers after their nature and mood: some bargain, some refuse, some throw you out.<br>
      • <b>Pins</b> on the map mark news you have not read and matters awaiting your word — click one to read it or answer.<br>
      • <b>Hold court</b> (Realm): feasts and tourneys. Send gifts, judge prisoners, declare war from a person's or house's sheet.<br>
      • You see only what your house knows: hosts in grey are unconfirmed word — whose, and who leads them, you cannot be sure. Plant spies (Intrigue) to follow a house; march in secret or feint to fool them in turn.<br>
      • <b>Advance ▶</b> — time passes; the world acts, the map changes.<br>
      • Map: drag to pan, wheel to zoom, WASD to move, double-click to fly.</div></details>`);
  wireDecisions(body);
  // a place tag flies the map there; the card itself focuses its place too — the full account is already here
  const th = $('.threads', body); if (th) th.ontoggle = () => { app.threadsOpen = th.open; };
  $$('[data-goto]', body).forEach((el) => el.onclick = (ev) => { ev.stopPropagation(); const h = s.holdings[el.dataset.goto]; if (h) { app.map.flyTo(h.pos, 420); app.map.flash(h.pos); } });
  $$('[data-news]', body).forEach((el) => el.onclick = () => { const [tn, i] = el.dataset.news.split(':').map(Number); const e = s.history.find((x) => x.turn === tn)?.events?.[i]; const h = e?.where && s.holdings[e.where]; if (h) { app.map.flyTo(h.pos, 420); app.map.flash(h.pos); } else openNews(tn, i); });
  $$('[data-meanwhile]', body).forEach((el) => el.onclick = () => openMeanwhile(Number(el.dataset.meanwhile)));
  $$('.event[data-where], .mw-item[data-where]', body).forEach((el) => el.onclick = () => { const w = el.dataset.where; if (s.holdings[w]) { app.map.flyTo(s.holdings[w].pos); app.map.flash(s.holdings[w].pos); } });
}
// While an answer is written: what is happening, in the world's words (a reply that fails says so, with a retry)
function waitStatus(who, together) {
  const t0 = Date.now();
  const iv = setInterval(async () => {
    const el = $('#typing'); if (!el) return clearInterval(iv);
    let p = null; try { p = await api(`/games/${app.saveId}/progress`); } catch { /* keep the last words */ }
    const sec = Math.round((Date.now() - t0) / 1000);
    const what = p?.phase === 'writing' ? (together ? `${who} speaks…` : `${who} writes the letter…`) : p?.phase === 'thinking' ? `${who} weighs the words…` : together ? `${who} considers…` : `The raven flies to ${who}…`;
    el.innerHTML = `<i>${esc(what)}</i> <span class="muted" style="font-size:0.75rem">${sec}s</span>`;
  }, 1000);
  return () => clearInterval(iv);
}
function answerFailed(e, retry) {
  const el = $('#typing'); if (!el) { toast(e.message, true); return; }
  el.id = ''; el.classList.add('failed');
  el.innerHTML = `<i>No answer came${e.message ? ` — ${esc(e.message)}` : ''}.</i> <button class="btn small">Try again</button>`;
  el.querySelector('button').onclick = () => { el.remove(); $('#pending-msg')?.remove(); retry(); };
}
export function ravenHtml(r) {
  return `<div class="raven-card ${r.read ? '' : 'unread'}"><div class="from">From ${esc(r.fromName)} · ${esc(r.date)}</div>${esc(r.text)}<div style="margin-top:0.4rem;display:flex;gap:0.3rem">${r.from ? `<button class="btn small" data-talk="${r.from}">Reply</button>` : ''}<button class="btn small" data-read-aloud="${r.from || ''}" data-text="${esc(r.text)}">🔊 Read aloud</button></div></div>`;
}
async function renderLetters(body) {
  const s = app.state;
  const LABEL = { 'in flight': ['underway', 'In flight'], delivered: ['done', 'Delivered'], answered: ['answered', 'Answered'] };
  const today = s.meta.date.year * 360 + (s.meta.date.month - 1) * 30 + (s.meta.date.day - 1);
  const sent = (s.post || []).slice(0, 12).map((x) => { const [c, l] = LABEL[x.status] || ['', x.status]; return `<div class="errand"><span class="ost ${c}">${l}</span><div class="grow"><b>To ${esc(x.toName)}</b> <span class="muted">· sent ${esc(x.sent.replace(/, \d+ AC$/, ''))}${x.status === 'in flight' ? ` · lands in ~${Math.max(1, x.arriveDay - today)} ${x.arriveDay - today === 1 ? 'day' : 'days'}` : ''}</span><div class="muted" style="font-size:0.8rem">${esc(x.text.slice(0, 140))}${x.text.length > 140 ? '…' : ''}</div></div></div>`; }).join('');
  body.innerHTML = `<h4>Received</h4>${s.ravens.map(ravenHtml).join('') || '<p class="muted">No ravens have come.</p>'}${sent ? `<h4 style="margin-top:1rem">Sent</h4>${sent}` : ''}`;
  if (s.ravens.some((r) => !r.read)) { try { const r = await api(`/games/${app.saveId}/ravens/read`, { body: {} }); s.ravens = r.ravens; app.renderTop?.(); } catch { /* */ } }
}

// ───────────── audiences ─────────────
export function openChat(charId, prefill) { app.council = null; app.chatWith = charId; app.chatPrefill = prefill; showDrawer(); setDrawer('audience'); }
export function openCouncil(ids) { app.chatWith = null; app.council = ids; showDrawer(); setDrawer('audience'); }
function showDrawer() { $('#drawer').classList.remove('hidden'); $('#drawer-open').classList.add('hidden'); }

function renderAudience(body) {
  warmVoices(); // start the natural voices loading while you choose your words
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
  const mood = s.moods?.[c.id]; const closed = !!(mood?.closed && mood.turn === s.meta.turn);
  const quick = c.house === p ? ['How many men can we field?', 'What is in the treasury, and what do we owe?', 'How full are the granaries?', 'Which of my lords can I trust?', 'What news?'] : ['What news from your lands?', 'What do you want?', 'I propose an alliance between our houses.', 'Will you trade with us?', 'I offer you 1,000 gold dragons for your friendship.', 'Swear fealty to me.'];
  body.innerHTML = `<div class="chat">
    <div class="chat-head"><img src="${por(c, 80)}" alt=""><div style="flex:1;min-width:0"><div class="title" style="font-family:var(--display);color:var(--gold2)" data-char="${c.id}">${esc(c.name)} ${sig(h, 1)}</div><div class="sub muted" style="font-size:0.78rem">${esc(c.title || '')} · ${esc(placeName(s, c.loc))} · ${together ? 'in person' : '<b>by raven</b>'}${c.house !== p ? ' · opinion ' + (c.opinion || 0) : ''}</div>${temperHtml(c)}</div><button class="btn small" data-action="close-chat">✕</button></div>
    <div class="chat-log" id="chat-log">${log.length ? log.map((m) => msgHtml(m, c)).join('') : `<div class="muted" style="font-style:italic">${esc(c.bio || '')}</div>`}</div>
    ${closed ? '' : `<div class="quick-asks">${quick.map((q) => `<button data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>`}
    ${closed ? `<div class="chat-closed">${esc(c.name)} will not hear you again this moon.${together ? ' The doors are shut to you.' : ' Your ravens come back unanswered.'}</div>` : `<div class="chat-input"><textarea id="chat-text" rows="3" placeholder="${together ? 'Speak…' : 'Write your letter…'}">${esc(app.chatPrefill || '')}</textarea><button class="btn primary" id="chat-send">Send</button></div>`}</div>`;
  app.chatPrefill = null;
  const logEl = $('#chat-log'); logEl.scrollTop = logEl.scrollHeight;
  if (closed) return;
  const send = async (text) => {
    text = (text ?? $('#chat-text').value).trim(); if (!text || app.busy) return;
    $('#chat-text').value = '';
    logEl.insertAdjacentHTML('beforeend', `<div id="pending-msg">${msgHtml({ role: 'player', text, date: dateStr(s.meta.date) }, c)}</div><div class="msg npc" id="typing"><i>${esc(c.name)} ${together ? 'considers…' : 'will reply by raven…'}</i></div>`);
    logEl.scrollTop = 1e9;
    const stop = waitStatus(c.name, together);
    try {
      app.busy = true;
      const r = await api(`/games/${app.saveId}/talk`, { body: { character: c.id, message: text } });
      app.setState(r.state, { keepDrawer: true });
      if (r.raven) toast(`Your raven flies to ${c.name} (~${r.raven.days} ${r.raven.days === 1 ? 'day' : 'days'}). An answer may come by ${r.raven.back}.`);
      if (app.drawerTab === 'audience') { renderAudience(body); const last = [...body.querySelectorAll('.msg.npc:not(.pending)')].at(-1); if (last && !r.raven) playScene([last]); }
    } catch (e) { answerFailed(e, () => send(text)); }
    finally { stop(); app.busy = false; }
  };
  $('#chat-send').onclick = () => send();
  $('#chat-text').onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };
  $$('.quick-asks button', body).forEach((b) => b.onclick = () => send(b.dataset.q));
  $('#chat-text').focus();
}
// Who they are and how they feel right now: nature tags, mood, and the patience left in this audience
function temperHtml(c) {
  const s = app.state; if (c.house === s.meta.player) return '';
  const { tags, sway } = natureTags(temperament(c));
  const m = s.moods?.[c.id]; const fresh = m && m.turn === s.meta.turn;
  const mood = fresh ? moodWord(m) : 'composed';
  const pips = fresh && m.full ? `<span class="pips" title="Patience left">${Array.from({ length: m.full }, (_, i) => `<i class="${i < m.patience ? 'on' : ''}"></i>`).join('')}</span>` : '';
  return `<div class="temper"><span class="mood m-${mood.replace(/\s.*/, '')}">${esc(mood)}</span>${pips}<span class="tags">${esc(tags.slice(0, 4).join(' · '))}${sway.length ? ` <span class="muted">— moved by ${esc(sway.slice(0, 2).join(', '))}</span>` : ''}</span></div>`;
}
function msgHtml(m, c) {
  const s = app.state; const sp = m.speaker ? s.characters[m.speaker] : c;
  if (m.role === 'player') return `<div class="msg player"><div class="who">You · ${esc(m.date || '')}${m.via === 'raven' ? ' · sent by raven' : ''}</div>${esc(m.text)}</div>`;
  // a letter's answer is on the wing: it is read when the raven lands, not before
  if (m.pending) return `<div class="msg npc pending"><div class="who">🕊 ${esc(sp?.name || '')}</div><i>Your raven is on the wing. An answer may come by ${esc(m.date || 'a few days')} — it will reach your Letters and the chronicle when it lands.</i></div>`;
  // a reply is a small scene: what you see them do, and what they say
  const bs = beats(m.text);
  // narration reads as a novel's prose; speech is set in quotation marks
  const body = bs.map((b) => (b.kind === 'act' ? `<p class="beat act" title="Click to hear it">${esc(b.text)}</p>` : `<p class="beat say" title="Click to hear it">“${esc(b.text.replace(/^[“"]+|[”"]+$/g, ''))}”</p>`)).join('') || esc(m.text);
  const verdict = m.verdict && m.verdict !== 'obey' ? `<span class="verdict v-${m.verdict}">${esc(VERDICT_LABEL[m.verdict] || m.verdict)}</span>` : '';
  return `<div class="msg npc" data-speaker="${sp?.id || ''}" data-mood="${esc(m.mood || '')}"><div class="who"><img src="${por(sp, 40)}">${esc(sp?.name || '')} · ${esc(m.date || '')}${verdict}<button class="speak-all" title="Hear it">🔊</button></div><div class="beats">${body}</div>${m.applied?.length ? `<div class="applied">${m.applied.map(esc).join('<br>')}</div>` : ''}</div>`;
}
// Voices: click a line to hear it, or the speaker icon to hear the whole reply
export function wireVoices(root) {
  root.addEventListener('click', async (e) => {
    const ra = e.target.closest('[data-read-aloud]');
    if (ra) { stopSpeaking(); await speak(ra.dataset.text, app.state.characters[ra.dataset.readAloud] || { id: 'maester', age: 60 }); return; }
    const msg = e.target.closest('.msg.npc'); if (!msg) return;
    const who = app.state.characters[msg.dataset.speaker];
    const clean = (p) => p.textContent.replace(/^[“"]+|[”"]+$/g, '');
    if (e.target.closest('.speak-all')) {
      // the whole scene, top to bottom: narration and speech in order
      const ps = [...msg.querySelectorAll('.beat')];
      await speakBeats(ps.map((p) => ({ kind: p.classList.contains('act') ? 'act' : 'say', text: clean(p), p })), who, (b, on) => b.p.classList.toggle('speaking', on), msg.dataset.mood);
      return;
    }
    const line = e.target.closest('.beat'); if (!line) return;
    msg.querySelectorAll('.speaking').forEach((x) => x.classList.remove('speaking'));
    line.classList.add('speaking'); await speak(clean(line), who, { narrator: line.classList.contains('act'), mood: msg.dataset.mood }); line.classList.remove('speaking');
  });
}
/** Play the newest replies as a scene: each beat appears in turn, and the spoken lines are voiced. */
export async function playScene(msgs) {
  const token = (playScene.token = (playScene.token || 0) + 1);
  const all = msgs.flatMap((m) => [...m.querySelectorAll('.beat')].map((b) => ({ b, m })));
  all.forEach(({ b }) => b.classList.add('hidden-beat'));
  const auto = voiceSettings().auto && voiceSettings().engine !== 'off';
  for (const { b, m } of all) {
    if (playScene.token !== token) { all.forEach(({ b: x }) => x.classList.remove('hidden-beat')); return; }
    b.classList.remove('hidden-beat'); b.classList.add('reveal');
    b.closest('.chat-log')?.scrollTo({ top: 1e9, behavior: 'smooth' });
    const narrated = b.classList.contains('act') && voiceSettings().narrate;
    if (auto && (b.classList.contains('say') || narrated)) { b.classList.add('speaking'); await speak(b.textContent.replace(/^[“"]+|[”"]+$/g, ''), app.state.characters[m.dataset.speaker], { narrator: narrated, mood: m.dataset.mood }); b.classList.remove('speaking'); await wait(200); }
    else await wait(b.classList.contains('act') ? 700 + Math.min(1600, b.textContent.length * 18) : 400 + Math.min(2500, b.textContent.length * 22));
  }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

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
    logEl.insertAdjacentHTML('beforeend', `<div id="pending-msg">${msgHtml({ role: 'player', text, date: dateStr(s.meta.date) })}</div><div class="msg npc" id="typing"><i>The council deliberates…</i></div>`); logEl.scrollTop = 1e9;
    const stop = waitStatus('The council', true);
    try {
      app.busy = true;
      const r = await api(`/games/${app.saveId}/council`, { body: { members: ids, message: text } });
      const before = (app.state.chats['council:' + [...ids].sort().join(',')] || []).length;
      app.setState(r.state, { keepDrawer: true });
      if (app.drawerTab === 'audience') { renderCouncil(body); const fresh = [...body.querySelectorAll('.msg.npc')].slice(-Math.max(1, (r.replies || []).length)); playScene(fresh); }
    } catch (e) { answerFailed(e, () => send(text)); } finally { stop(); app.busy = false; }
  };
  $('#chat-send').onclick = () => send();
  $('#chat-text').onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };
  $$('.quick-asks button', body).forEach((b) => b.onclick = () => send(b.dataset.q));
}
