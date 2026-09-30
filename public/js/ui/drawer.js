// Right drawer: chronicle feed, letters, audiences (one-on-one or council).
import { peopleOfCard, regardOf, seatOf } from './people.js';
import { eventArt } from './event-art.js';
import { app, $, $$, esc, nm, fmt, placeName, api, toast, por, sig, player, charRow, modal, closeModal, foldText, detailLines } from './common.js';
import { feedOf, feedIds, FILTERS, TIER_LABEL, storyOrder, shortDate, daysOf } from './feed.js';
import { dateStr } from '../shared/world.js';
import { orderOutcome, STATUS_LABEL } from '../shared/errands.js';
import { icon } from './icons.js';
import { THREADS } from '../shared/plots.js';
import { beats, speak, speakBeats, stopSpeaking, voiceSettings, warmVoices, prepareSpeech, beginScene, sceneToken } from './voice.js';
import { temperament, natureTags, moodWord } from '../shared/temperament.js';
import { together as sameSpot } from '../engine/parties.js';
import { outcomeChips, chipsHtml, audiencePromisesHtml } from './promises.js';
import { matterOf, matterHtml } from './matters.js';
import { relationOf } from './names.js';
import { lettersOnTheWing, letterTo, landsWord } from './post.js';

// The chronicle panel (GDD 17 §2.3): closed, the headline strip is its one-line form; opened (H, the strip's "All", an audience, the Inbox) it shows the
// news in full, the letters, or the audience in hand. `setDrawer` chooses what it shows and refreshes it if it is open; `openDrawer` opens it.
const DRAWER_TITLE = { feed: 'Chronicle', letters: 'Letters', audience: 'Audience' };
export const drawerOpen = () => !$('#drawer').classList.contains('hidden');
export function setDrawer(tab) { app.drawerTab = tab; renderDrawer(); }
export function openDrawer(tab = app.drawerTab) {
  app.drawerTab = tab; $('#drawer').classList.remove('hidden'); document.body.classList.add('has-drawer'); renderDrawer();
}
/** Shut the panel; what the chronicle showed is read (the strip's "N new" clears), unless `read` is false (a game just loaded). */
export function closeDrawer({ read = true } = {}) {
  if (read && app.state && drawerOpen() && app.drawerTab === 'feed') { app.markSeen?.(feedIds(app.state)); app.renderStrip?.(); }
  $('#drawer').classList.add('hidden'); document.body.classList.remove('has-drawer'); app.chatWith = null; app.council = null; app.drawerTab = 'feed';
}
export function renderDrawer() {
  if (!app.state || !drawerOpen()) return;
  const body = $('#drawer-body');
  $('#drawer-title').textContent = app.drawerTab === 'audience' && app.council ? 'Council' : DRAWER_TITLE[app.drawerTab] || 'Chronicle';
  $('#drawer-sub').textContent = ''; $('#drawer-filters')?.classList.toggle('hidden', app.drawerTab !== 'feed');
  if (app.drawerTab === 'audience') return renderAudience(body);
  if (app.drawerTab === 'letters') return renderLetters(body);
  renderFeed(body);
}

export function eventHtml(e, compact = false) {
  return `<div class="event imp-${e.importance}${compact ? ' compact' : ''}" ${e.where ? `data-where="${e.where}"` : ''}>${!compact || e.importance >= 4 ? eventArt(e) : ''}<div class="et">${nm(e.headline || e.title)}</div><div class="eb">${nm(e.summary ?? e.text)}</div>${foldText(e) ? `<details class="ev-more"><summary>More</summary><div>${esc(foldText(e))}</div></details>` : ''}<div class="meta">${e.date ? `${esc(e.date.replace(/, \d+ AC$/, ''))} · ` : e.day ? `day ${e.day} · ` : ''}${esc(e.type)}${e.where ? ' · ' + esc(placeName(app.state, e.where)) : ''}</div></div>`;
}
// The small life of the realm, told briefly beneath the turn's great events, grouped by where it happened
const REGION_ORDER = ['north', 'wall', 'beyond', 'iron_islands', 'riverlands', 'vale', 'westerlands', 'crownlands', 'reach', 'stormlands', 'dorne', 'essos'];
const REGION_TITLE = { north: 'The North', wall: 'The Wall', beyond: 'Beyond the Wall', iron_islands: 'The Iron Islands', riverlands: 'The Riverlands', vale: 'The Vale', westerlands: 'The Westerlands', crownlands: 'The Crownlands', reach: 'The Reach', stormlands: 'The Stormlands', dorne: 'Dorne', essos: 'Across the Narrow Sea' };
export const mainEvents = (evs) => (evs || []).filter((e) => !e.bg);
/** The turn's news in the order it is told: by day; on a day, what the lord ordered first, then the weightiest. */
export const storyEvents = storyOrder;
export function meanwhileHtml(evs, open = false) {
  const bg = (evs || []).filter((e) => e.bg); if (!bg.length) return '';
  const s = app.state; const groups = new Map();
  for (const e of bg) { const r = s.holdings[e.where]?.region || 'other'; if (!groups.has(r)) groups.set(r, []); groups.get(r).push(e); }
  const regions = [...groups.keys()].sort((a, b) => REGION_ORDER.indexOf(a) - REGION_ORDER.indexOf(b));
  return `<details class="meanwhile"${open ? ' open' : ''}><summary>Meanwhile, across the realm <span class="muted">(${bg.length})</span></summary>${regions.map((r) => `<div class="mw-region"><div class="mw-title">${esc(REGION_TITLE[r] || 'Elsewhere')}</div>${groups.get(r).map((e) => `<div class="mw-item${e.mine ? ' mine' : ''}" ${e.where ? `data-where="${e.where}"` : ''}><b>${esc(e.title)}.</b> ${esc(e.text)}</div>`).join('')}</div>`).join('')}</details>`;
}

export function decisionsHtml(list, extra = {}) {
  const s = app.state;
  const pend = list || (s.decisions || []).filter((d) => d.status === 'pending');
  return pend.map((d) => matterHtml(matterOf(s, d), s, { esc, por, icon, link: nm }, extra)).join('');
}
export function wireDecisions(root, { onAllDone, onDecided } = {}) {
  // saying nothing is a choice: the letter is put away and the days run (what silence does is written on it)
  $$('.dec-silence', root).forEach((b) => b.onclick = () => { const card = b.closest('.decision'); const left = card?.querySelector('.wc-matter__clock')?.dataset.days; closeModal(); toast(left != null && left !== '' ? `You say nothing. The matter waits ${Number(left) <= 0 ? 'no longer than today' : `${left} more ${Number(left) === 1 ? 'day' : 'days'}`}.` : 'You say nothing. The matter waits.'); });
  $$('.dec-note', root).forEach((t) => t.oninput = () => { const b = t.parentElement.querySelector('.dec-custom'); if (b) b.disabled = !t.value.trim(); });
  $$('.dec-opt, .dec-custom', root).forEach((b) => b.onclick = async () => {
    const card = b.closest('.decision'); if (card.classList.contains('busy')) return;
    const own = b.classList.contains('dec-custom');
    const note = card.querySelector('.dec-note')?.value || '';
    if (own && !note.trim()) return;
    card.classList.add('busy'); $$('.dec-opt, .dec-custom', card).forEach((x) => { x.disabled = true; x.classList.toggle('chosen', x === b); });
    try {
      const r = await api(`/games/${app.saveId}/act`, { body: { verb: 'answer_matter', params: own ? { decision: b.dataset.decId, custom: note } : { decision: b.dataset.decId, option: Number(b.dataset.opt), note } } });
      // acknowledge the choice where it was made, then fold the card away
      const label = own ? note.trim() : b.childNodes[0]?.textContent || b.textContent;
      const title = card.querySelector('.dec-title')?.textContent || '';
      card.classList.remove('busy'); card.classList.add('decided');
      card.innerHTML = `<div class="dec-done"><span class="tick">${icon('check')}</span><div><div class="dec-title">${esc(title)}</div><div>You chose <b>${esc(label)}</b>.${r.effects?.length ? ` <span class="muted">${esc(r.effects.join(' · '))}</span>` : ' <span class="muted">Your word goes out; the realm will answer.</span>'}</div></div></div>`;
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
// One event, told in full, in a window over the map
export function openNews(turn, idx) {
  const s = app.state; const t = s.history.find((x) => x.turn === turn); const e = t?.events?.[idx]; if (!e) return;
  if (e.where && s.holdings[e.where]) { app.map?.flyTo(s.holdings[e.where].pos, 420); app.map?.flash(s.holdings[e.where].pos); }
  modal(`<div class="pin-head"><span class="pin-place">${esc(e.where ? placeName(s, e.where) : '')}</span><span class="pin-count">${esc(t.date)}</span></div>
    <div class="pin-body event imp-${e.importance}">${eventArt(e)}<div class="et">${nm(e.headline || e.title)}</div><div class="eb">${nm(e.summary ?? e.text)}</div>${foldText(e) ? `<div class="pin-details">${nm(foldText(e))}</div>` : ''}${recordHtml(e)}</div>
    <div class="report-actions"><button class="btn primary" data-action="close-modal">Close</button></div>`);
}
function openMeanwhile(turn) {
  const t = app.state.history.find((x) => x.turn === turn); if (!t) return;
  modal(`<h2>Across the realm — ${esc(t.date)}</h2>${t.meanwhile ? `<p class="news-meanwhile">${esc(t.meanwhile)}</p>` : ''}${meanwhileHtml(t.events, true)}<div class="report-actions"><button class="btn primary" data-action="close-modal">Close</button></div>`);
}
// The story's open threads: the great matters under way (engine) and what the chronicle last found unresolved
function threadsHtml(s) {
  const great = THREADS.filter((t) => (s.plots?.stages?.[t.id] || 0) > 0 && s.plots.stages[t.id] < t.stages.length).map((t) => { const last = (s.plots.log || []).filter((l) => l.thread === t.id).at(-1); return `<li><b>${esc(t.name)}</b>${last?.title ? ` — last: ${esc(last.title)}` : ''}</li>`; });
  const open = (s.storyThreads || []).map((t) => `<li><b>${esc(t.title)}</b> — ${esc(t.last)} <span class="muted">(${esc(t.date.replace(/, \d+ AC$/, ''))})</span></li>`);
  if (!great.length && !open.length) return '';
  return `<details class="threads"${app.threadsOpen ? ' open' : ''}><summary>${icon('scroll', 'tg-ico')} Threads to follow <span class="muted">(${great.length + open.length})</span></summary>${open.length ? '' : ''}<ul>${great.join('')}</ul>${open.length ? `<ul>${open.join('')}</ul>` : ''}</details>`;
}
// One story as a card of the chronicle (GDD 18 §2.6, mockup 03): its tier's rule and marks, the headline, two lines of summary, where and when, whose it is,
// and "Details" — the order that led to it, the scene, the numbers, the engine's record — folded away until asked for. A minor card is its headline alone.
const CAME_SHORT = { raven: 'by raven', rumour: 'a rumour', letter: 'by letter', rider: 'by rider' };
// the faces of a story: the people its headline names (ui/people.js), small, before the headline
function facesHtml(s, e) {
  const ids = peopleOfCard(s, e, 2); if (!ids.length) return '';
  return `<span class="wc-card__faces">${ids.map((id) => `<img src="${por(s.characters[id], 64)}" alt="" title="${esc(s.characters[id].name)}">`).join('')}</span>`;
}
function cardHtml(s, t, c, fresh) {
  const e = c.e; const p = s.meta.player;
  const hidden = app.reveal && app.reveal.turn === t.turn && !app.reveal.shown.has(c.idx);
  const date = shortDate(e.date || t.date);
  const place = e.where && s.holdings[e.where] ? placeName(s, e.where) : '';
  const yours = (e.houses || []).includes(p) ? 'Your house' : c.mine ? 'Your people' : '';
  const late = e.heard?.via ? CAME_SHORT[e.heard.via] || 'word came' : c.rumour ? 'a rumour' : '';
  const ordered = e.orderId && (t.orders || []).find((o) => o.id === e.orderId);
  const foldParts = [
    c.tier === 'minor' && e.summary ? `<p class="wc-card__sum">${nm(e.summary)}</p>` : '',
    ordered ? `<p class="story-order">${esc(s.characters[s.houses[p].lord]?.name || 'The lord')} commanded: “${esc(ordered.text.replace(/\s*\[[^\]]*\]\s*/g, ' ').trim())}”</p>` : '',
    e.scene ? `<p class="wc-card__scene">${nm(e.scene)}</p>` : '',
    detailLines(e).length ? `<ul class="wc-card__facts">${detailLines(e).map((l) => `<li>${nm(l)}</li>`).join('')}</ul>` : '',
    recordHtml(e), heardHtml(e, date),
  ].filter(Boolean);
  return `<article class="wc-card wc-tier-${c.tier} story${hidden ? ' unrevealed' : ''}${fresh ? ' is-new' : ''}" data-news="${c.id}" tabindex="0">
    ${c.tier === 'minor' ? '' : facesHtml(s, e)}<h3 class="wc-card__head">${nm(e.headline || e.title)}</h3>
    ${c.tier === 'minor' ? '' : `<p class="wc-card__body">${nm(e.summary ?? e.text)}</p>`}
    <div class="wc-card__meta"><span class="wc-label">${TIER_LABEL[c.tier] || ''}</span>${yours ? `<span class="wc-chip wc-chip--wax">${esc(yours)}</span>` : ''}${place || date ? `<span class="wc-card__where">${icon('pin')}${esc(date)}${place ? ` · <em>${esc(place)}</em>` : ''}</span>` : ''}${late ? `<em>${esc(late)}</em>` : ''}${foldParts.length ? `<button class="wc-card__more" data-fold aria-expanded="false" title="The numbers, the record and the scene">Details ${icon('chevronR')}</button>` : ''}</div>
    ${foldParts.length ? `<div class="wc-card__fold" hidden>${foldParts.join('')}</div>` : ''}</article>`;
}
// news that came late: the day it happened, and how word of it came (09 §7.1)
const CAME = { raven: 'the raven came', rumour: 'word came', letter: 'the letter came', rider: 'the rider came' };
function heardHtml(e, date) {
  if (!e.heard?.happened) return '';
  return `<div class="story-heard">It happened on ${esc(e.heard.happened.replace(/, \d+ AC$/, ''))}; ${CAME[e.heard.via] || 'word came'} on ${esc(date)}.</div>`;
}
// a story the chronicler told: the engine's own lines behind it, one click away (the numbers are always true there)
function recordHtml(e) {
  if (!e.narrated || !e.record?.length) return '';
  return `<details class="story-rec"><summary>The record</summary><ul>${e.record.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></details>`;
}
// what the player ordered that day, and what the engine made of it — your hand in the day's story
function yoursHtml(t) {
  const told = new Set((t.events || []).map((e) => e.orderId).filter(Boolean));
  const rows = (t.orders || []).filter((o) => (!o.auto || o.status) && !told.has(o.id)).map((o) => { const r = orderOutcome(o, app.state); return `<div class="yo">“${esc(o.text.length > 110 ? o.text.slice(0, 110) + '…' : o.text)}”</div>${r.lines.slice(0, 3).map((l) => `<div class="yr${/^could not/i.test(l) ? ' bad' : ''}">→ ${esc(l.replace(/^could not be done: /i, 'Could not: '))}</div>`).join('') || `<div class="yr">→ ${esc(STATUS_LABEL[r.status])}</div>`}`; }).join('');
  return rows ? `<div class="yours"><div class="yh">The commands of ${esc(app.state.characters[app.state.houses[app.state.meta.player].lord]?.name || 'the lord')}</div>${rows}</div>` : '';
}
// The filters above the cards: "Only what matters" (on by default) and, one at a time, Mine, War, Letters, Rumours
const feedState = () => (app.feed ||= { matters: true, only: null });
function renderFilters() {
  const el = $('#drawer-filters'); if (!el) return;
  const f = feedState(); const chip = (id, label, on, hint) => `<button class="wc-chip${on ? ' is-on' : ''}" data-feed="${id}" aria-pressed="${on}" title="${esc(hint)}">${on && id === 'matters' ? icon('check') : ''}${esc(label)}</button>`;
  el.innerHTML = chip('matters', 'Only what matters', f.matters, 'Hide the small news') + FILTERS.map((x) => chip(x.id, x.label, f.only === x.id, x.hint)).join('');
}
function renderFeed(body) {
  const s = app.state; const f = feedState();
  const { groups, hidden } = feedOf(s, { matters: f.matters, only: f.only });
  const seen = app.seen || new Set();
  const fresh = groups.flatMap((g) => g.cards).filter((c) => !seen.has(c.id) && !(app.reveal && app.reveal.turn === c.turn && !app.reveal.shown.has(c.idx))).length;
  const last = s.history.at(-1);
  $('#drawer-sub').textContent = last ? `${last.date.replace(/^\d+ /, '')}${fresh ? ` · ${fresh} new` : ''}` : '';
  renderFilters();
  // playback (Pause, Next, Skip) lives on the strip, which is what shows while a turn is told; here it is shown too when the chronicle is open
  const rv = app.reveal;
  const bar = rv ? `<div class="reveal-bar"><span class="rb-date" id="rb-date">${esc(rv.date || '')}</span><button class="wc-btn wc-btn--small" data-rb="pause">${rv.ctl.paused ? 'Resume' : 'Pause'}</button><button class="wc-btn wc-btn--small" data-rb="next">Next</button><button class="wc-btn wc-btn--small" data-rb="skip">Skip</button><span class="rb-count" id="rb-count">${rv.n} / ${rv.total}</span></div>` : '';
  const day = (g) => { const t = s.history.find((x) => x.turn === g.turn); return `<div class="wc-day"><span>${esc(daysOf(t).text)}</span></div>${yoursHtml(t)}`; };
  const quiet = (g) => `<p class="wc-quiet">${g.held ? `Nothing of note${g.held ? ` — ${g.held} small ${g.held === 1 ? 'matter is' : 'matters are'} held back` : ''}.` : 'No news of note.'}</p>`;
  const blocks = groups.map((g) => {
    const t = s.history.find((x) => x.turn === g.turn);
    const bg = g.small;
    return `<section class="wc-daygroup">${day(g)}<div class="wc-chronicle__cards">${g.cards.map((c) => cardHtml(s, t, c, !seen.has(c.id))).join('') || quiet(g)}</div>${g.meanwhile ? `<p class="news-meanwhile">${esc(g.meanwhile)}</p>` : ''}${bg ? `<button class="news-more" data-meanwhile="${g.turn}">${bg} small happening${bg > 1 ? 's' : ''} across the realm</button>` : ''}</section>`;
  }).join('');
  // a game not yet begun has nothing to tell: the situation is the welcome card (ui/welcome.js), which can be read again from here
  const first = `<p class="wc-quiet">Nothing has happened yet. Write an order below and end the turn, and the days begin.</p><p class="wc-quiet"><button class="news-more" data-action="welcome">Read your situation again</button></p>`;
  body.innerHTML = bar + threadsHtml(s) + (groups.length ? blocks + (hidden && f.matters ? `<p class="wc-quiet wc-quiet--foot">${hidden} smaller ${hidden === 1 ? 'story is' : 'stories are'} held back. <button class="news-more" data-feed="matters">Show them</button></p>` : '') : first);
  // a card opens on a click (the map goes to its place); Details folds out what is behind it; the small happenings open across the realm
  const th = $('.threads', body); if (th) th.ontoggle = () => { app.threadsOpen = th.open; };
  $$('[data-fold]', body).forEach((b) => b.onclick = (ev) => { ev.stopPropagation(); const fold = b.closest('.wc-card').querySelector('.wc-card__fold'); const open = fold.hidden; fold.hidden = !open; b.setAttribute('aria-expanded', String(open)); b.classList.toggle('is-open', open); });
  $$('[data-news]', body).forEach((el) => { const go = () => { const [tn, i] = el.dataset.news.split(':').map(Number); const e = s.history.find((x) => x.turn === tn)?.events?.[i]; const h = e?.where && s.holdings[e.where]; if (h) { app.map.flyTo(h.pos, 420); app.map.flash(h.pos); } else openNews(tn, i); }; el.onclick = (ev) => { if (!ev.target.closest('.nm')) go(); }; el.onkeydown = (ev) => { if (ev.key === 'Enter' && ev.target === el) go(); }; });
  $$('[data-meanwhile]', body).forEach((el) => el.onclick = () => openMeanwhile(Number(el.dataset.meanwhile)));
  $$('[data-feed="matters"]', body).forEach((el) => el.onclick = () => { feedState().matters = false; renderDrawer(); });
}
/** A filter chip pressed: "Only what matters" toggles; the others are one at a time, and pressing the chosen one again clears it. */
export function pickFilter(id) {
  const f = feedState();
  if (id === 'matters') f.matters = !f.matters; else f.only = f.only === id ? null : id;
  renderDrawer();
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
  return `<div class="raven-card ${r.read ? '' : 'unread'}"><div class="from">From ${esc(r.fromName)} · ${esc(r.date)}</div>${nm(r.text)}<div style="margin-top:0.4rem;display:flex;gap:0.3rem">${r.from ? `<button class="btn small" data-talk="${r.from}">Reply</button>` : ''}<button class="btn small" data-read-aloud="${r.from || ''}" data-text="${esc(r.text)}">${icon('speaker')} Read aloud</button></div></div>`;
}
async function renderLetters(body) {
  const s = app.state;
  const LABEL = { 'in flight': ['underway', 'In flight'], delivered: ['done', 'Delivered'], answered: ['answered', 'Answered'] };
  const today = s.meta.date.year * 360 + (s.meta.date.month - 1) * 30 + (s.meta.date.day - 1);
  const wing = lettersOnTheWing(s).map((l) => `<div class="errand wing" data-letter="${esc(l.id)}"><span class="ost underway">${icon('raven', 'ost-ico')} On the wing</span><div class="grow"><b>To ${esc(l.toName)}</b> <span class="muted">· sent ${esc(l.sent)} · ${esc(landsWord(l.days))}</span><div class="muted" style="font-size:0.8rem">${esc(l.text.slice(0, 140))}${l.text.length > 140 ? '…' : ''}</div></div></div>`).join('');
  const sent = (s.post || []).filter((x) => !x.reply && x.status !== 'in flight').slice(0, 12).map((x) => { const [c, l] = LABEL[x.status] || ['', x.status]; return `<div class="errand"><span class="ost ${c}">${l}</span><div class="grow"><b>To ${esc(x.toName)}</b> <span class="muted">· sent ${esc(x.sent.replace(/, \d+ AC$/, ''))}${x.status === 'in flight' ? ` · lands in ~${Math.max(1, x.arriveDay - today)} ${x.arriveDay - today === 1 ? 'day' : 'days'}` : ''}</span><div class="muted" style="font-size:0.8rem">${esc(x.text.slice(0, 140))}${x.text.length > 140 ? '…' : ''}</div></div></div>`; }).join('');
  body.innerHTML = `${wing ? `<h4>On the wing</h4>${wing}` : ''}<h4${wing ? ' style="margin-top:1rem"' : ''}>Received</h4>${s.ravens.map(ravenHtml).join('') || '<p class="muted">No ravens have come.</p>'}${sent ? `<h4 style="margin-top:1rem">Sent</h4>${sent}` : ''}`;
  if (s.ravens.some((r) => !r.read)) { try { const r = await api(`/games/${app.saveId}/ravens/read`, { body: {} }); s.ravens = r.ravens; app.renderTop?.(); } catch { /* */ } }
}

// ───────────── audiences ─────────────
export function openChat(charId, prefill) { app.council = null; app.chatWith = charId; app.chatPrefill = prefill; openDrawer('audience'); }
export function openCouncil(ids) { app.chatWith = null; app.council = ids; openDrawer('audience'); }

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
  const together = me && sameSpot(app.state, me, c);
  const flying = together ? null : letterTo(s, c.id); const regard = regardOf(s, c);
  const mood = s.moods?.[c.id]; const closed = !!(mood?.closed && mood.turn === s.meta.turn);
  const quick = c.house === p ? ['How many men can we field?', 'What is in the treasury, and what do we owe?', 'How full are the granaries?', 'Which of my lords can I trust?', 'What news?'] : ['What news from your lands?', 'What do you want?', 'I propose an alliance between our houses.', 'Will you trade with us?', 'I offer you 1,000 gold dragons for your friendship.', 'Swear fealty to me.'];
  body.innerHTML = `<div class="chat${log.length ? ' has-log' : ''}">
    <div class="chat-head"><img src="${por(c, 80)}" alt=""><div style="flex:1;min-width:0"><div class="title" data-char="${c.id}">${esc(c.name)} ${sig(h, 1)}</div><div class="sub sub-t" title="${esc(c.title || '')}">${esc(c.title || '')}</div><div class="sub sub-b">${relationOf(s, c.id) ? `<i class="rel-line">${esc(relationOf(s, c.id))}</i> · ` : ''}${esc(placeName(s, c.loc))} · ${together ? 'in person' : `<b>by raven</b>${flying ? ` — a letter of yours ${landsWord(flying.days)}` : ''}`}${regard ? ` · <span class="regard r-${regard.tone}" title="Their opinion of you: ${(c.opinion || 0) > 0 ? '+' : ''}${c.opinion || 0}">${esc(regard.word)}</span>` : ''}</div>${temperHtml(c)}</div><button class="wc-btn wc-btn--quiet" data-action="close-chat" title="Back to the chronicle" aria-label="Back to the chronicle">${icon('chevronL')} Back</button></div>
    <div class="chat-log" id="chat-log">${log.length ? log.map((m) => msgHtml(m, c)).join('') : `<div class="muted" style="font-style:italic">${esc(c.bio || '')}</div>`}</div>
    ${closed ? '' : `<div class="quick-asks">${quick.map((q) => `<button data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>`}
    ${closed ? `<div class="chat-closed">${esc(c.name)} will not hear you again this moon.${together ? ' The doors are shut to you.' : ' Your ravens come back unanswered.'}</div>` : `<div class="chat-input"><textarea id="chat-text" rows="3" placeholder="${together ? 'Speak…' : 'Write your letter…'}">${esc(app.chatPrefill || '')}</textarea><button class="wc-btn wc-btn--gold" id="chat-send">${together ? 'Speak' : 'Send'}</button></div>`}${audiencePromisesHtml(s, c.id, { esc })}</div>`;
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
  const mood = fresh ? (m.word || moodWord(m)) : 'composed'; // the server sends the word a face shows, not the numbers
  const pips = fresh && m.full ? `<span class="pips" title="Patience left">${Array.from({ length: m.full }, (_, i) => `<i class="${i < m.patience ? 'on' : ''}"></i>`).join('')}</span>` : '';
  return `<div class="temper"><span class="mood m-${mood.replace(/\s.*/, '')}">${esc(mood)}</span>${pips}<span class="tags">${esc(tags.slice(0, 4).join(' · '))}${sway.length ? ` <span class="muted">— moved by ${esc(sway.slice(0, 2).join(', '))}</span>` : ''}</span></div>`;
}
function msgHtml(m, c) {
  const s = app.state; const sp = m.speaker ? s.characters[m.speaker] : c;
  if (m.role === 'player') return `<div class="msg player"><div class="who">You · ${esc(m.date || '')}${m.via === 'raven' ? ' · sent by raven' : ''}</div>${esc(m.text)}</div>`;
  // a letter's answer is on the wing: it is read when the raven lands, not before
  if (m.pending) return `<div class="msg npc pending"><div class="who">${icon('raven', 'tg-ico')} ${esc(sp?.name || '')}</div><i>Your raven is on the wing. An answer may come by ${esc(m.date || 'a few days')} — it will reach your Letters and the chronicle when it lands.</i></div>`;
  // the advisor's answer: an opening, then headings (a line in capitals) with their points ("- ")
  if (m.advisor) {
    const lines = String(m.text).split(/\n+/).map((l) => l.trim()).filter(Boolean);
    const html = lines.map((l) => (/^- /.test(l) ? `<li>${esc(l.slice(2))}</li>` : /^[A-Z][A-Z ,'’-]{3,}$/.test(l) ? `</ul><h5 class="adv-h">${esc(l)}</h5><ul class="adv-l">` : `<p class="beat say">${esc(l)}</p>`)).join('');
    return `<div class="msg npc advisor" data-speaker="${sp?.id || ''}"><div class="who"><img src="${por(sp, 40)}">${esc(sp?.name || '')} · ${esc(m.date || '')}</div><div class="beats"><ul class="adv-l">${html}</ul></div></div>`.replace(/<ul class="adv-l"><\/ul>/g, '');
  }
  // a reply is a small scene: what you see them do, and what they say
  const bs = beats(m.text);
  // narration reads as a novel's prose; speech is set in quotation marks
  const body = bs.map((b) => (b.kind === 'act' ? `<p class="beat act" title="Click to hear it">${nm(b.text)}</p>` : `<p class="beat say" title="Click to hear it">“${nm(b.text.replace(/^[“"]+|[”"]+$/g, ''))}”</p>`)).join('') || esc(m.text);
  return `<div class="msg npc" data-speaker="${sp?.id || ''}" data-mood="${esc(m.mood || '')}"><div class="who"><img src="${por(sp, 40)}">${esc(sp?.name || '')} · ${esc(m.date || '')}<button class="speak-all" title="Hear it" aria-label="Hear it">${icon('speaker')}</button></div><div class="beats">${body}</div>${chipsHtml(outcomeChips(m), { esc, icon })}</div>`;
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
  // the whole scene is voiced at once, in order; then it is played through without pauses, each line appearing as spoken
  const voiced = auto ? beginScene() : null;
  const lines = all.map(({ b, m }) => {
    const narrated = b.classList.contains('act') && voiceSettings().narrate;
    return auto && (b.classList.contains('say') || narrated) ? prepareSpeech(b.textContent.replace(/^[“"]+|[”"]+$/g, ''), app.state.characters[m.dataset.speaker], { narrator: narrated, mood: m.dataset.mood }) : null;
  });
  for (let i = 0; i < all.length; i++) {
    const { b } = all[i];
    if (playScene.token !== token || (voiced !== null && sceneToken() !== voiced)) { all.forEach(({ b: x }) => x.classList.remove('hidden-beat')); return; }
    b.classList.remove('hidden-beat'); b.classList.add('reveal');
    b.closest('.chat-log')?.scrollTo({ top: 1e9, behavior: 'smooth' });
    if (lines[i]) { b.classList.add('speaking'); await lines[i].play(voiced); b.classList.remove('speaking'); }
    else await wait(b.classList.contains('act') ? 500 + Math.min(1200, b.textContent.length * 14) : 300 + Math.min(1800, b.textContent.length * 16));
  }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function renderCouncil(body) {
  const s = app.state; const ids = app.council.filter((i) => s.characters[i]);
  const key = 'council:' + [...ids].sort().join(',');
  const log = s.chats[key] || [];
  body.innerHTML = `<div class="chat">
    <div class="chat-head council-head"><div class="council-faces" role="list">${ids.map((i) => { const m = s.characters[i]; return `<button class="cf" role="listitem" data-char="${esc(i)}" title="${esc(m.name)}"><img src="${por(m, 64)}" alt=""><b>${esc(m.name.replace(/^(Ser|Lord|Lady|Maester|Septon|Septa)\s+/, '').split(' ')[0])}</b><span>${esc(seatOf(m))}</span></button>`; }).join('')}</div><button class="wc-btn wc-btn--quiet" data-action="close-chat" title="Back to the chronicle" aria-label="Back to the chronicle">${icon('chevronL')} Back</button></div>
    <div class="chat-log" id="chat-log">${log.length ? log.map((m) => msgHtml(m, null)).join('') : '<div class="muted" style="font-style:italic">Your counsellors take their seats. What would you put before them?</div>'}</div>
    <div class="quick-asks">${ADVISOR_ASKS(s).map((q) => `<button data-q="${esc(q)}" data-advisor="1" title="One of them answers at length">${esc(q)}</button>`).join('')}</div>
    <div class="chat-input"><textarea id="chat-text" rows="3" placeholder="Put a question to the council…"></textarea><div class="chat-btns"><button class="wc-btn wc-btn--gold" id="chat-send">Ask</button>${log.some((m) => m.role === 'npc') ? '<button class="wc-btn wc-btn--quiet" id="chat-listen" title="Say nothing — let them go on among themselves">Let them talk</button>' : ''}</div></div></div>`;
  const logEl = $('#chat-log'); logEl.scrollTop = logEl.scrollHeight;
  const send = async (text, listen = false, advisor = false) => {
    text = listen ? '' : (text ?? $('#chat-text').value).trim(); if ((!text && !listen) || app.busy) return;
    if (!listen) $('#chat-text').value = '';
    logEl.insertAdjacentHTML('beforeend', `${listen ? '' : `<div id="pending-msg">${msgHtml({ role: 'player', text, date: dateStr(s.meta.date) })}</div>`}<div class="msg npc" id="typing"><i>${listen ? 'You say nothing. They go on among themselves…' : 'The council deliberates…'}</i></div>`); logEl.scrollTop = 1e9;
    const stop = waitStatus('The council', true);
    try {
      app.busy = true;
      const r = await api(`/games/${app.saveId}/council`, { body: { members: ids, message: text, advisor } });
      const before = (app.state.chats['council:' + [...ids].sort().join(',')] || []).length;
      app.setState(r.state, { keepDrawer: true });
      if (app.drawerTab === 'audience') { renderCouncil(body); const fresh = [...body.querySelectorAll('.msg.npc')].slice(-Math.max(1, (r.replies || []).length)); playScene(fresh); }
    } catch (e) { answerFailed(e, () => send(text, listen)); } finally { stop(); app.busy = false; }
  };
  $('#chat-send').onclick = () => send();
  const ls = $('#chat-listen'); if (ls) ls.onclick = () => send('', true);
  $('#chat-text').onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };
  $$('.quick-asks button', body).forEach((b) => b.onclick = () => send(b.dataset.q, false, !!b.dataset.advisor));
}
// the advisor's questions (04 §8.4): one counsellor answers each at length
function ADVISOR_ASKS(s) {
  const p = s.meta.player; const home = s.holdings[s.houses[p].seat]?.pos;
  const big = Object.values(s.houses).filter((h) => h.id !== p && h.liege !== p && s.holdings[h.seat] && home).map((h) => [h, Math.hypot(s.holdings[h.seat].pos[0] - home[0], s.holdings[h.seat].pos[1] - home[1]) / 400 - (Number(h.figures?.levies?.v) || 0) / 10000]).sort((a, b) => a[1] - b[1])[0]?.[0];
  return ['Summarise what has happened since we began.', 'What threatens us most, and what should we do first?', ...(big ? [`How do we stand against ${/^the /i.test(big.name) ? big.name : `House ${big.name}`}?`] : []), 'Can we afford a war? For how long?', 'Who among our vassals is least loyal, and why?', 'What would my father have done?'];
}
