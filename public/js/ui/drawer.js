// Right drawer: chronicle feed, letters, audiences (one-on-one or council).
import { eventArt } from './event-art.js';
import { app, $, $$, esc, fmt, placeName, api, toast, por, sig, player, charRow, modal } from './common.js';
import { dateStr } from '../shared/world.js';
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
  return `<div class="event imp-${e.importance}${compact ? ' compact' : ''}" ${e.where ? `data-where="${e.where}"` : ''}>${!compact || e.importance >= 4 ? eventArt(e) : ''}<div class="et">${esc(e.title)}</div><div class="eb">${esc(e.text)}</div>${e.details ? `<details class="ev-more"><summary>More</summary><div>${esc(e.details)}</div></details>` : ''}<div class="meta">${e.day ? `day ${e.day} · ` : ''}${esc(e.type)}${e.where ? ' · ' + esc(placeName(app.state, e.where)) : ''}</div></div>`;
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
      <div class="dec-own"><textarea class="input dec-note" rows="2" placeholder="Or answer in your own words — or add conditions to a choice above…"></textarea><button class="btn small dec-custom" data-dec-id="${d.id}" disabled>Answer in my own words</button></div></div>`;
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
function renderFeed(body) {
  const s = app.state;
  const turns = [...s.history].reverse().slice(0, 30);
  // the news, as a list: a date, then one row per event (icon, headline, one line); click a row for the whole story
  body.innerHTML = decisionsHtml() + (turns.length ? turns.map((t) => { const ev = mainEvents(t.events); const bg = (t.events || []).filter((e) => e.bg).length; return `<div class="news-day"><div class="news-date">${esc(t.date)}</div>
      ${ev.map((e, i) => `<div class="news-row imp-${e.importance}" data-news="${t.turn}:${(t.events || []).indexOf(e)}"><span class="news-ico">${NEWS_ICON[e.type] || '❖'}</span><div class="news-txt"><div class="news-t">${esc(e.title)}</div><div class="news-x">${esc(e.text)}</div></div></div>`).join('') || '<div class="news-quiet">No news of note.</div>'}
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
  $$('[data-news]', body).forEach((el) => el.onclick = () => { const [t, i] = el.dataset.news.split(':').map(Number); openNews(t, i); });
  $$('[data-meanwhile]', body).forEach((el) => el.onclick = () => openMeanwhile(Number(el.dataset.meanwhile)));
  $$('.event[data-where], .mw-item[data-where]', body).forEach((el) => el.onclick = () => { const w = el.dataset.where; if (s.holdings[w]) { app.map.flyTo(s.holdings[w].pos); app.map.flash(s.holdings[w].pos); } });
}
export function ravenHtml(r) {
  return `<div class="raven-card ${r.read ? '' : 'unread'}"><div class="from">From ${esc(r.fromName)} · ${esc(r.date)}</div>${esc(r.text)}<div style="margin-top:0.4rem;display:flex;gap:0.3rem">${r.from ? `<button class="btn small" data-talk="${r.from}">Reply</button>` : ''}<button class="btn small" data-read-aloud="${r.from || ''}" data-text="${esc(r.text)}">🔊 Read aloud</button></div></div>`;
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
    logEl.insertAdjacentHTML('beforeend', msgHtml({ role: 'player', text, date: dateStr(s.meta.date) }, c) + `<div class="msg npc" id="typing"><i>${esc(c.name)} ${together ? 'considers…' : 'will reply by raven…'}</i></div>`);
    logEl.scrollTop = 1e9;
    try {
      app.busy = true;
      const r = await api(`/games/${app.saveId}/talk`, { body: { character: c.id, message: text } });
      app.setState(r.state, { keepDrawer: true });
      if (app.drawerTab === 'audience') { renderAudience(body); const last = [...body.querySelectorAll('.msg.npc')].at(-1); if (last) playScene([last]); }
    } catch (e) { toast(e.message, true); $('#typing')?.remove(); }
    finally { app.busy = false; }
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
  if (m.role === 'player') return `<div class="msg player"><div class="who">You · ${esc(m.date || '')}</div>${esc(m.text)}</div>`;
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
    logEl.insertAdjacentHTML('beforeend', msgHtml({ role: 'player', text, date: dateStr(s.meta.date) }) + '<div class="msg npc" id="typing"><i>The council deliberates…</i></div>'); logEl.scrollTop = 1e9;
    try {
      app.busy = true;
      const r = await api(`/games/${app.saveId}/council`, { body: { members: ids, message: text } });
      const before = (app.state.chats['council:' + [...ids].sort().join(',')] || []).length;
      app.setState(r.state, { keepDrawer: true });
      if (app.drawerTab === 'audience') { renderCouncil(body); const fresh = [...body.querySelectorAll('.msg.npc')].slice(-Math.max(1, (r.replies || []).length)); playScene(fresh); }
    } catch (e) { toast(e.message, true); $('#typing')?.remove(); } finally { app.busy = false; }
  };
  $('#chat-send').onclick = () => send();
  $('#chat-text').onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };
  $$('.quick-asks button', body).forEach((b) => b.onclick = () => send(b.dataset.q));
}
