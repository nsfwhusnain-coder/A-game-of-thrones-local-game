import { HOUSES } from '../data/houses.js';
import { startIconizer, icon } from './ui/icons.js';
import { drawTitleMap } from './ui/titlemap.js';
import { startMusic, setMood, setMusicHouse, musicSettings, setMusic } from './ui/music.js';
import { sfx, wireSfx, sfxSettings, setSfx } from './ui/sfx.js';
import { playTurn, prepareReveal } from './ui/playback.js';
import { voiceSettings, setVoiceSetting, speak } from './ui/voice.js';
import { atWar } from './shared/warfare.js';
import { statusText, ref } from './engine/parties.js';
import { CHARACTERS } from '../data/characters.js';
import { briefFor } from '../data/briefs.js';
import { sigilSrc, bannerURL, loadSigilArt } from './sigils.js';
import { portraitURL, loadCustomPortraits } from './ui/portrait.js';
import { app, $, $$, esc, fmt, api, doVerb, toast, modal, closeModal, md, player, ruler, sig, por, addOrder, saveOrders, answerOrder, confirmModal, REGION_NAMES, RANK_NAMES, applyHouseTheme, uiScale, setUiScale, houseTheming, setHouseTheming } from './ui/common.js';
import { openWindow, closeWindow, renderWindow, openSheet, closeSheet, renderSheet } from './ui/windows.js';
import { renderDrawer, setDrawer, openChat, openCouncil, eventHtml, decisionsHtml, mainEvents, meanwhileHtml, wireDecisions, wireVoices } from './ui/drawer.js';
import { openPin } from './ui/pins.js';
import { dateStr, realmOf, realmTotals, FIGURE_LABELS, placeName, SPANS, spanOf } from './shared/world.js';
import { project, SEASONS } from './shared/economy.js';
import { underway, orderOutcome, STATUS_LABEL } from './shared/errands.js';
import { nextTurnLength } from './shared/turns.js';
import { regencyLine, speakerFor, incapacity } from './shared/regency.js';
import { standing, standingWord, epitaph } from './shared/standing.js';
import { supplyOf } from './engine/military/supply.js';

app.openChat = openChat; app.openCouncil = openCouncil;

// ═════════════ Title screen ═════════════
// the music follows your situation: war drums when you are at war, the cold theme in the North
function moodFor(s) {
  const p = s.meta.player;
  if (s.wars.some((w) => w.status !== 'ended' && (w.attackers.includes(p) || w.defenders.includes(p)))) return 'war';
  const region = s.holdings[s.houses[p]?.seat]?.region || s.houses[p]?.region;
  return ['north', 'wall', 'beyond'].includes(region) ? 'north' : 'court';
}
async function initTitle() {
  wireSfx();
  await loadCustomPortraits();
  setMood('title');
  $('#title-screen').classList.remove('hidden'); $('#game-screen').classList.add('hidden');
  await loadSigilArt();
  const scenarios = await api('/scenarios');
  $('#scenario-list').innerHTML = scenarios.map((s) => `<div class="scenario-card"><h3>${esc(s.name)}</h3><div class="words">${esc(s.subtitle)}</div><p>${esc(s.description)}</p></div>`).join('');
  const filters = [['great', 'Great Houses'], ['north', 'North'], ['riverlands', 'Riverlands'], ['vale', 'Vale'], ['westerlands', 'West'], ['reach', 'Reach'], ['stormlands', 'Stormlands'], ['dorne', 'Dorne'], ['crownlands', 'Crownlands'], ['iron_islands', 'Iron Islands'], ['wall', 'Wall & Beyond'], ['essos', 'Essos'], ['all', 'All']];
  $('#house-filters').innerHTML = filters.map(([k, n]) => `<button data-f="${k}" class="${k === app.houseFilter ? 'active' : ''}">${n}</button>`).join('');
  $('#house-filters').onclick = (e) => { const f = e.target.dataset.f; if (!f) return; app.houseFilter = f; $$('#house-filters button').forEach((b) => b.classList.toggle('active', b.dataset.f === f)); renderHouseGrid(); };
  $('#house-search').oninput = renderHouseGrid;
  // open on the house last played (or the Starks), so the realm is never an empty page
  if (!app.chosenHouse) { let last = null; try { last = localStorage.getItem('wc-last-house'); } catch { /* private window */ } app.chosenHouse = HOUSES.some((h) => h.id === last) ? last : 'stark'; applyHouseTheme(HOUSES.find((h) => h.id === app.chosenHouse)); }
  renderHouseGrid(); renderHouseDetail(); renderSaves(); refreshLLMStatus();
  // ?game=<save id> opens that game at once (a bookmark to a campaign; the visual tests use it); ?dev lends the page's
  // state to the console and to scripts/screens.js as window.__wc
  const qs = new URLSearchParams(location.search);
  if (qs.has('dev')) window.__wc = app;
  if (qs.get('game')) startGame(qs.get('game')).catch((e) => toast(e.message, true));
  $('#house-search').placeholder = `Search ${HOUSES.filter((h) => !h.landless || h.rank === 'exile').length} houses…`;
  try { drawTitleMap($('#title-map')); } catch (e) { console.warn('title map', e); }
  if (!app.titleResize) { app.titleResize = true; let t; window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => { if (!$('#title-screen').classList.contains('hidden')) drawTitleMap($('#title-map')); }, 250); }); }
}
function renderHouseGrid() {
  const q = $('#house-search').value.trim().toLowerCase(); const f = app.houseFilter;
  const list = HOUSES.filter((h) => {
    if (q) return (h.name + ' ' + (h.seat || '') + ' ' + h.region).toLowerCase().includes(q);
    if (f === 'all') return true;
    if (f === 'great') return ['crown', 'paramount'].includes(h.rank) || ['targaryen', 'nights_watch', 'free_folk', 'baratheon_ds', 'frey', 'bolton', 'manderly', 'hightower', 'redwyne'].includes(h.id);
    if (f === 'wall') return h.region === 'wall' || h.region === 'beyond';
    return h.region === f;
  });
  $('#house-grid').innerHTML = list.map((h) => `<div class="house-tile ${app.chosenHouse === h.id ? 'selected' : ''}" data-h="${h.id}"><img src="${bannerURL(h.sigil, 60, 90)}" alt=""><div>${esc(h.name)}</div><div class="rank">${RANK_NAMES[h.rank] || h.rank}</div></div>`).join('');
  $('#house-grid').onclick = (e) => { const t = e.target.closest('.house-tile'); if (!t) return; app.chosenHouse = t.dataset.h; applyHouseTheme(HOUSES.find((x) => x.id === t.dataset.h)); renderHouseGrid(); renderHouseDetail(); };
}
function renderHouseDetail() {
  const h = HOUSES.find((x) => x.id === app.chosenHouse); if (!h) return;
  const liege = HOUSES.find((x) => x.id === h.liege);
  const vassals = HOUSES.filter((x) => x.liege === h.id);
  const people = CHARACTERS.filter((c) => c.house === h.id).slice(0, 10);
  const lord = people.find((c) => c.roles.includes('lord') || c.roles.includes('ruler')) || people[0];
  const blurb = { crown: 'You sit the Iron Throne. Command the paramounts, tax the realm — and pay its crushing debts.', paramount: 'Rule a kingdom of the Seven. Your bannermen are many, and each has his own mind.', major: 'A great bannerman. Your liege needs you — perhaps more than you need him.', minor: 'A small house with big ambitions. Every alliance matters.', city_state: 'A Free City of merchants and intrigue.', order: 'Hold the Wall with too few men and too little bread.', tribe: 'Lead a host beyond the reach of kings.', exile: 'A crown without a kingdom. You have a name — and little else.', company: 'Sellswords for hire. Gold buys loyalty — until it doesn\'t.' }[h.rank] || '';
  $('#house-detail').innerHTML = `
    <div class="detail-hero"><img class="banner" src="${bannerURL(h.sigil, 80, 120)}" alt=""><div><h2>House ${esc(h.name)}</h2><div class="words">${esc(h.words ? '“' + h.words + '”' : '')}</div><div class="muted">${RANK_NAMES[h.rank] || ''} · ${REGION_NAMES[h.region] || h.region}</div></div></div>
    ${lord ? `<div class="lord-card"><img src="${portraitURL({ ...lord, alive: true }, h, 160)}" alt=""><div style="flex:1;min-width:0"><div class="lc-k">You will play as</div><div class="lc-name">${esc(lord.name)}</div><div class="lc-title">${esc(lord.title || '')}</div><div class="lc-traits">${esc(lord.traits || '')}</div></div><div class="begin-box"><button class="btn primary" id="begin">Begin ▶</button><label class="ironman" title="An ironman chronicle is written once: there is no undoing a turn."><input type="checkbox" id="ironman"> Ironman</label></div></div>` : '<div class="begin-box"><button class="btn primary" id="begin">Begin ▶</button><label class="ironman" title="An ironman chronicle is written once: there is no undoing a turn."><input type="checkbox" id="ironman"> Ironman</label></div>'}
    ${(() => { const b = briefFor(h, { houses: Object.fromEntries(HOUSES.map((x) => [x.id, x])) }); return `<p style="line-height:1.45">${esc(b.situation)}</p><div class="grid2"><div><h4>Strengths</h4>${b.strengths.map((x) => `<div style="font-size:0.88rem">✦ ${esc(x)}</div>`).join('')}</div><div><h4>Weaknesses</h4>${b.weaknesses.map((x) => `<div style="font-size:0.88rem">✧ ${esc(x)}</div>`).join('')}</div></div>`; })()}
    <div class="kv"><span class="k">Seat</span><span>${esc(h.seat || '— (landless)')}</span><span class="k">Liege</span><span>${liege ? esc(liege.name) : 'None'}</span><span class="k">Vassals</span><span>${vassals.length ? vassals.length + ' houses' : '—'}</span></div>
    ${people.length ? `<h4>Your people</h4><div class="portrait-row">${people.map((c) => `<div class="p" title="${esc(c.title)}"><img src="${portraitURL({ ...c, alive: true }, h, 96)}"><div>${esc(c.name.replace(/^(Ser|Maester|Lord|Lady|Grand Maester) /, '').split(' ')[0])}</div></div>`).join('')}</div>` : ''}`;
  $('#begin').onclick = async () => { try { try { localStorage.setItem('wc-last-house', h.id); } catch { /* ignore */ } const r = await api('/games', { body: { scenario: 'agot_298', house: h.id, ironman: !!$('#ironman')?.checked } }); startGame(r.id, r.state); } catch (e) { toast(e.message, true); } };
}
async function renderSaves() {
  const saves = await api('/saves');
  $('#save-list').innerHTML = saves.length ? saves.map((s) => {
    const h = HOUSES.find((x) => x.id === s.player);
    return `<div class="save" data-id="${s.id}">${h ? `<img src="${bannerURL(h.sigil, 40, 60)}">` : ''}<div><div>${esc(s.playerName)}</div><div class="muted" style="font-size:0.8rem">${esc(s.date)} · turn ${s.turn}</div></div><button class="btn small del" data-del="${s.id}">✕</button></div>`;
  }).join('') : '<div class="muted">No saved games yet.</div>';
  $('#save-list').onclick = async (e) => {
    const del = e.target.closest('[data-del]')?.dataset.del;
    if (del) { e.stopPropagation(); if (await confirmModal('Burn this chronicle?', 'The save and everything written in it will be gone for good. There is no undoing this.', { yes: 'Burn it', no: 'Keep it', danger: true })) { await api('/games/' + del, { method: 'DELETE' }); renderSaves(); } return; }
    const s = e.target.closest('.save'); if (s) startGame(s.dataset.id);
  };
}
async function refreshLLMStatus() {
  const el = $('#llm-status-title');
  try {
    const cfg = await api('/config');
    if (cfg.provider === 'mock') { el.innerHTML = '<span class="dot mock"></span>Mock mode — no model connected. Good for exploring; connect a model to play.'; return; }
    el.innerHTML = `<span class="dot"></span>Checking ${esc(cfg.baseUrl)}…`;
    const m = await api('/models');
    el.innerHTML = `<span class="dot ok"></span>Model server online<br><span class="muted">${esc(cfg.model || m.models[0] || 'default model')} · ${fmt(cfg.contextTokens)} ctx</span>`;
  } catch { el.innerHTML = '<span class="dot bad"></span>Model server unreachable. Start llama.cpp / LM Studio / Ollama, or switch to mock mode.'; }
}

// ═════════════ Game ═════════════
const LOADING_LINES = [
  'When you play the game of thrones, you win or you die. There is no middle ground.',
  'The man who passes the sentence should swing the sword.',
  'A Lannister always pays his debts.',
  'The night is dark and full of terrors.',
  'Winter is coming.',
  'Fear cuts deeper than swords.',
  'A reader lives a thousand lives before he dies. The man who never reads lives only one.',
  'The things I do for love.',
  'Power resides where men believe it resides.',
  'In the game of thrones, even the humblest pieces can have wills of their own.',
  'The North remembers.',
  'Words are wind.',
];
async function startGame(id, state) {
  app.saveId = id;
  app.state = state || await api('/games/' + id);
  applyHouseTheme(app.state.houses[app.state.meta.player]);
  setMusicHouse(app.state.meta.player); setMood(moodFor(app.state));
  $('#title-screen').classList.add('hidden'); $('#game-screen').classList.remove('hidden');
  if (!app.map) {
    $('#map-loading').classList.remove('hidden');
    const me = app.state.houses[app.state.meta.player];
    $('#map-loading-banner').src = bannerURL(me.sigil, 80, 120);
    $('#map-loading-words').textContent = me.words ? `“${me.words}”` : '';
    let qi = Math.floor(Math.random() * LOADING_LINES.length);
    const showLine = () => { const el = $('#map-loading-quote'); el.classList.remove('in'); void el.offsetWidth; el.textContent = LOADING_LINES[qi++ % LOADING_LINES.length]; el.classList.add('in'); };
    showLine(); app.loadingTimer = setInterval(showLine, 6000);
    try {
      const { MapScene } = await import('./map3d/MapScene.js');
      app.map = new MapScene($('#map-wrap'), {
        onSelect: (hid) => { if (app.picking) return finishPick(hid); if (hid) openSheet('holding', hid); else closeSheet(); },
        onSelectArmy: (aid) => { if (app.picking) return finishPickArmy(aid); openSheet('army', aid); },
        onHover: showTooltip,
        onPin: (where) => openPin(where),
        onChar: (id) => openSheet('char', id),
      });
      await app.map.generate(app.state.holdings, (p, msg) => { $('#map-loading-bar').style.width = Math.round(p * 100) + '%'; $('#map-loading-text').textContent = msg + '…'; });
    } catch (e) {
      console.error(e); app.map = null;
      $('#map-loading-text').innerHTML = `The map failed to load: ${esc(e.message)}<br><small>Check that WebGL is enabled in your browser (opera://settings → System → hardware acceleration). Press F12 → Console for details.</small>`;
      toast('The map failed to load: ' + e.message, true);
      return;
    }
    $('#map-loading').classList.add('hidden'); clearInterval(app.loadingTimer);
  }
  app.map.state = null;
  app.map.setState(app.state);
  closeWindow(); closeSheet(); app.chatWith = null; app.council = null;
  renderAll();
}
function renderAll() { renderTop(); renderPlayer(); renderOrders(); renderDrawer(); renderWindow(); renderSheet(); maybeShowOutcome(); }
app.renderOrders = renderOrders; app.renderTop = renderTop;
// the game's code changed on disk (an update): say so, rather than run a page that no longer matches the server
(async () => {
  let mine = null; try { mine = (await api('/version')).build; } catch { return; }
  setInterval(async () => { try { const b = (await api('/version')).build; if (b !== mine && !$('#update-banner')) document.body.insertAdjacentHTML('beforeend', '<div id="update-banner" class="update-banner">The game has been updated. <button class="btn small primary" onclick="location.reload()">Reload</button></div>'); } catch { /* server restarting */ } }, 20000);
})();
app.setState = (s, opts = {}) => {
  app.state = s; applyHouseTheme(s.houses[s.meta.player]); setMusicHouse(s.meta.player); setMood(moodFor(s)); app.map?.setState(s); renderTop(); renderPlayer(); renderOrders(); renderWindow(); renderSheet(); if (!opts.keepDrawer) renderDrawer();
  // an ironman chronicle has no glass to turn back
  for (const b of document.querySelectorAll('[data-action="undo"]')) b.classList.toggle('hidden', !!s.meta.settings?.ironman);
};

function renderTop() {
  { const u = app.state && nextTurnLength(app.state); const el = $('#turn-until'); if (el && u) el.innerHTML = `next turn: <b>${u.days} ${u.days === 1 ? 'day' : 'days'}</b> — ${esc(u.reason)}`; }
  const s = app.state, h = player();
  const pr = project(s, h.id);
  const last = h.ledger?.at(-1);
  const trend = last ? (last.net >= 0 ? `<span class="up">▲${fmt(Math.abs(Math.round(last.net)))}</span>` : `<span class="down">▼${fmt(Math.abs(Math.round(last.net)))}</span>`) : '';
  const tot = realmTotals(s, h.id);
  const season = SEASONS[s.world?.season || 'summer'];
  const food = Math.round((Number(h.figures.food.v) || 0) * 10) / 10;
  // the hosts in the field eat from their wagons, not the granaries: their days of rations belong beside the stores (12 §5)
  const rations = Object.values(s.parties).filter((a) => a.owner === h.id && a.kind === 'host').map((a) => ({ a, sp: supplyOf(s, a) })).filter((x) => x.sp.days != null);
  const foodPct = Math.max(0, Math.min(100, (food / 24) * 100));
  const net = (lo, hi) => `${lo >= 0 ? '+' : '−'}${fmt(Math.abs(lo))} … ${hi >= 0 ? '+' : '−'}${fmt(Math.abs(hi))}`;
  const items = [
    { ic: '🪙', k: 'Treasury', v: `${fmt(h.figures.treasury.v)}`, sub: `${net(pr.low, pr.high)} a moon`, cls: pr.high < 0 ? 'bad' : pr.low < 0 ? 'warn' : 'good', win: 'economy', tip: `Gold dragons in your coffers (${h.figures.treasury.src}, ${h.figures.treasury.asOf}).\nSteward's projection per moon: ${net(pr.low, pr.high)} — luck, harvests and loyal (or disloyal) vassals decide the real figure.${h.figures.debt?.v ? '\nDebt: ' + fmt(h.figures.debt.v) : ''}${last ? `\nLast turn: ${last.net >= 0 ? '+' : ''}${fmt(Math.round(last.net))}` : ''}` },
    { ic: '⚔', k: 'Levies', v: `~${fmt(h.figures.levies.v)}`, sub: `realm ~${fmt(tot.levies)}`, win: 'military', tip: `Your own levies, not yet raised (${h.figures.levies.src}).${h.figures.levies.why ? `\nIt drifts, a little each day, toward what your lands can bear (~${fmt(h.figures.levies.why.bear)} at ${h.figures.levies.why.condition}% of their strength, as prosperity and unrest allow) less the ${fmt(h.figures.levies.why.raised)} men already under arms.` : ''}\nWith every sworn house, if they answer the call: ~${fmt(tot.levies)}` },
    { ic: '🛡', k: 'Men-at-arms', v: fmt(h.figures.menAtArms.v), sub: `guard ${fmt(h.figures.guard.v)}`, win: 'military', tip: 'Standing soldiers in your pay, and your household guard.' },
    { ic: '⛵', k: 'Ships', v: fmt(h.figures.ships.v), sub: `realm ~${fmt(tot.ships)}`, win: 'military', tip: 'Your warships, and those of your whole realm.' },
    { ic: '🌾', k: 'Food', v: `${food} <small>moons</small>`, bar: foodPct, cls: food < 4 ? 'bad' : food < 10 ? 'warn' : 'good', win: 'economy', tip: `Moons of stores in your granaries (${h.figures.food.src}). Winter will empty them.${rations.map(({ a, sp }) => `\n${a.name}: ${sp.word === 'starving' ? 'starving' : `${Math.floor(sp.days)} days of rations`}`).join('')}` },
    { ic: { summer: '☀', autumn: '🍂', winter: '❄', spring: '🌱' }[s.world?.season || 'summer'] || '❄', k: 'Season', v: season.label, sub: s.world?.season === 'winter' ? 'nothing grows' : s.world?.season === 'autumn' ? 'the harvest wanes' : s.world?.season === 'spring' ? 'the thaw' : 'fields are full', win: 'economy', tip: s.world?.seasonNote || season.note },
  ];
  $('#res-row').innerHTML = items.map((it) => `<div class="res ${it.cls || ''}" data-win-open="${it.win}" title="${esc(it.tip)}"><span class="ic">${it.ic}</span><div class="res-txt"><div class="k">${it.k}</div><div class="v">${it.v}</div>${it.bar !== undefined ? `<div class="res-bar"><i style="width:${it.bar}%"></i></div>` : `<div class="s">${it.sub || ''}</div>`}</div></div>`).join('');
  $('#date-box').innerHTML = `${esc(dateStr(s.meta.date))}<div class="turn">Turn ${s.meta.turn}</div>`;
  const pendingDec = (s.decisions || []).filter((d) => d.status === 'pending').length;
  $('#date-box').insertAdjacentHTML('beforeend', pendingDec ? `<div class="turn" style="color:#ffb060">⚖ ${pendingDec} decision${pendingDec > 1 ? 's' : ''} awaiting you</div>` : '');
  // badges on the dock: decisions waiting (Realm), wars (Military), letters (Diplomacy)
  const atWarN = s.wars.filter((w) => w.status !== 'ended' && (w.attackers.includes(s.meta.player) || w.defenders.includes(s.meta.player))).length;
  const badge = (win, n, cls = '') => { const b = $(`#action-ring [data-win="${win}"]`); if (!b) return; b.querySelector('.dock-badge')?.remove(); if (n) b.insertAdjacentHTML('beforeend', `<span class="dock-badge ${cls}">${n}</span>`); };
  badge('realm', pendingDec); badge('military', atWarN ? '⚔' : 0, 'war');
  const unread = s.ravens.filter((r) => !r.read).length;
  badge('diplomacy', unread);
  $('#raven-badge').textContent = unread; $('#raven-badge').classList.toggle('hidden', !unread);
}
function renderPlayer() {
  const s = app.state; const h = player(); const r = ruler();
  // Who actually holds the seal: a child lord or a captive one is ruled for, and the card says so plainly
  const speaker = speakerFor(s, h.id); const why = incapacity(s, h.id);
  const isRegent = why && speaker && speaker.id !== h.lord;
  const face = isRegent ? speaker : r;
  $('#player-banner').innerHTML = `<img src="${bannerURL(h.sigil, 80, 120)}" alt="House ${esc(h.name)}" title="House ${esc(h.name)} — ${esc(h.words)}">`;
  $('#player-portrait').innerHTML = face ? `<img src="${por(face, 160)}" alt="Portrait of ${esc(face.name)}">` : '';
  $('#player-portrait').setAttribute('aria-label', face ? `${face.name} — open the character sheet` : 'Your ruler');
  const line = regencyLine(s, h.id);
  $('#player-name').innerHTML = `${esc(face?.name || 'House ' + h.name)}<small>${esc(isRegent ? `Regent · ${h.title || RANK_NAMES[h.rank]}` : (h.title || RANK_NAMES[h.rank]))}</small>`
    + (line ? `<div class="regency-note" title="${esc(line)}">⚖ ${esc(line)}</div>` : '')
    + (why && !isRegent ? `<div class="regency-note warn">⚠ ${esc(why.text)} — and no one of the house is fit to rule for ${esc(r && /lady|queen|princess/i.test(r.title || '') ? 'her' : 'him')}.</div>` : '');
}
app.openRuler = () => { const sp = speakerFor(app.state, player().id); if (sp) openSheet('char', sp.id); };

// ───── the end of the story ─────
// A campaign can now be lost and won. When the engine settles on an outcome the game says so, once, plainly,
// with the ledger of what the house was at the end.
let outcomeShown = null;
function maybeShowOutcome() {
  const o = app.state?.outcome; if (!o || outcomeShown === o.turn) return;
  outcomeShown = o.turn;
  const e = epitaph(app.state);
  const h = player();
  const row = (k, v) => `<div class="k">${k}</div><div>${v}</div>`;
  const st = e.standing;
  modal(`<div class="outcome ${o.victory ? 'win' : 'loss'}">
    <img class="outcome-banner" src="${bannerURL(h.sigil, 90, 135)}" alt="">
    <h2>${esc(o.title)}</h2>
    <p class="outcome-text">${esc(o.text)}</p>
    <div class="kv outcome-ledger">
      ${row('Ended', esc(o.date))}
      ${row('Turns played', e.turns)}
      ${row('Last of the line', esc(e.lord || '—'))}
      ${row('Holdings', e.holdings)}
      ${row('Sworn houses', e.vassals)}
      ${row('Living kin', e.kin)}
      ${row('Wars', `${e.wars} · ${e.battlesWon} of ${e.battles} battles won`)}
      ${row('Standing', `<b>${st.score}</b> / 100 — ${esc(standingWord(st))}`)}
    </div>
    <p class="muted" style="font-size:0.85rem">The world does not stop. You may play on, undo the turn, or begin again with another house.</p>
    <div class="report-actions">
      <button class="btn ghost" data-action="close-modal">Play on</button>
      ${app.state.meta.settings?.ironman ? '' : '<button class="btn" id="oc-undo">Undo the turn</button>'}
      <button class="btn primary" id="oc-menu">A new house</button>
    </div></div>`);
  if ($('#oc-undo')) $('#oc-undo').onclick = async () => { try { const st2 = await api(`/games/${app.saveId}/undo`, { body: { turns: 1 } }); app.setState(st2); outcomeShown = null; closeModal(); toast('The last turn has been undone.'); } catch (err) { toast(err.message, true); } };
  $('#oc-menu').onclick = () => { closeModal(); handleAction('menu'); };
}

// Turning back the glass (docs/gdd/03-architecture.md §11): the server says how far back it can go — the last ten
// turns, none in an ironman chronicle — and the lord chooses the eve to return to. The orders of that turn come back
// written, to be changed and given again.
async function chooseUndo() {
  let u; try { u = await api(`/games/${app.saveId}/undo`); } catch (e) { toast(e.message, true); return; }
  if (u.ironman) { toast('An ironman chronicle cannot be unwritten.', true); return; }
  if (!u.depth) { toast('There is nothing to undo yet.', true); return; }
  const eve = (n) => app.state.history.find((t) => t.turn === u.turn - n + 1)?.dateFrom;
  const last = app.state.history.find((t) => t.turn === u.turn); const stopDays = parseInt(last?.span, 10) || 0;
  modal(`<h2>Turn back the glass?</h2>
    <p style="line-height:1.5">The world returns to how it stood on the eve of the turn you choose, your orders for it still written. Everything that happened since is unwritten.</p>
    <div class="undo-levels">${Array.from({ length: u.depth }, (_, i) => i + 1).map((n) => `<button class="btn${n === 1 ? ' primary' : ''}" data-undo="${n}">${n === 1 ? 'The last turn' : `The last ${n} turns`}${eve(n) ? `<span class="muted"> — back to ${esc(eve(n))}</span>` : ''}</button>`).join('')}</div>
    ${stopDays > 1 ? `<h4 style="margin-top:1rem">Or stop the last turn sooner</h4><p class="muted" style="font-size:0.85rem">The turn is played again with the same orders and the same counsels, as far as the day you choose — those days come out as you saw them; the rest is unwritten.</p>
    <div class="undo-levels"><select id="stop-day">${Array.from({ length: stopDays - 1 }, (_, i) => i + 1).map((d) => `<option value="${d}">Day ${d}</option>`).join('')}</select><button class="btn" id="stop-here">Stop here</button></div>` : ''}
    <div class="settings-actions"><button class="btn ghost" data-action="close-modal">Let it stand</button></div>`);
  $('#stop-here')?.addEventListener('click', async () => {
    const day = Number($('#stop-day').value); closeModal(); busy(true, `The turn is played again to day ${day}…`);
    try { const r = await api(`/games/${app.saveId}/stop`, { body: { day } }); prepareReveal(r.turn); app.setState(r.state); setDrawer('feed'); busy(false); playTurn(r.turn); toast(`The days stopped on day ${day}.`); } catch (e) { toast(e.message, true); } finally { busy(false); }
  });
  $$('[data-undo]').forEach((b) => b.onclick = async () => {
    const n = Number(b.dataset.undo);
    try { const st = await api(`/games/${app.saveId}/undo`, { body: { turns: n } }); closeModal(); app.setState(st); toast(n === 1 ? 'The last turn has been undone.' : `${n} turns have been undone.`); } catch (e) { toast(e.message, true); }
  });
}

// ───── orders ─────
// An order's receipt (docs/gdd/04-ai-system.md §4.4): what the turn will do, line by line — ✓ done, ⚠ done with a
// warning, ✗ refused and why — or the one question the steward must ask, with its answers to choose from.
const MARK = { true: '✓', warn: '⚠', false: '✗', ask: '?', story: '·' };
const TONE = { true: 'good', warn: 'warn', false: 'bad', ask: 'ask', story: 'story' };
const READER = { rules: 'Read by your steward', model: 'Read by your maester', replay: 'Read by your maester (recorded)', mock: 'Read by your steward', fallback: 'Your maester could not read it; your steward did' };
function receiptHtml(o) {
  const q = o.parsed?.clarify;
  const lines = (o.receipt || []).map((l) => `<div class="rl ${TONE[l.ok] || 'good'}"><span class="mk">${MARK[l.ok] || '✓'}</span><span>${esc(l.text)}</span></div>`).join('');
  const chips = q?.options?.length ? `<div class="chips">${q.options.map((op, k) => `<button class="chip" data-answer="${o.id}" data-k="${k}">${esc(op.label)}</button>`).join('')}</div>` : q ? '<div class="rl story"><span class="mk"></span><span>Say it in the order’s words, and it will be read again.</span></div>' : '';
  const chosen = o.chosen ? `<div class="rl story"><span class="mk">↳</span><span>You answered: ${esc(o.chosen)}</span></div>` : '';
  return `<div class="receipt" title="${esc(READER[o.parsed?.via] || '')}">${lines}${chosen}${chips}</div>`;
}
function renderOrders() {
  const s = app.state;
  const moving = underway(s); const last = s.history.at(-1); const lastOut = (last?.orders || []).map((o) => orderOutcome(o, s));
  const failed = lastOut.filter((x) => x.status === 'failed').length;
  const chip = moving.length || lastOut.length ? `<button class="errands-chip" data-action="errands">${icon('hourglass', 'tg-ico')} ${moving.length} under way${lastOut.length ? ` · last turn: ${lastOut.length - failed} carried out${failed ? `, <b>${failed} failed</b>` : ''}` : ''}</button>` : '';
  $('#orders').innerHTML = chip + s.orders.map((o, i) => {
    const st = o.status || 'queued'; const done = st !== 'queued';
    const receipt = done || o.auto ? '' : o.parsedFor === o.text && o.receipt ? receiptHtml(o) : '<div class="receipt muted"><i>Your steward reads the order…</i></div>';
    return `<div class="order ${o.auto ? 'auto' : ''} st-${st}"><span class="n">${i + 1}.</span><div class="grow"><span class="t" ${done ? '' : 'contenteditable="true"'} data-oid="${o.id}">${esc(o.text)}</span>${receipt}</div><span class="ost ${st}" title="${esc((o.result || []).join('; '))}">${STATUS_LABEL[st]}</span>${done ? '' : `<button data-del-order="${o.id}" title="Remove">✕</button>`}</div>`;
  }).join('');
  $$('[data-del-order]').forEach((b) => b.onclick = () => { s.orders = s.orders.filter((o) => o.id !== b.dataset.delOrder); saveOrders(); renderOrders(); });
  $$('[data-answer]').forEach((b) => b.onclick = () => { b.disabled = true; answerOrder(b.dataset.answer, Number(b.dataset.k)); });
  $$('.order .t').forEach((el) => el.onblur = () => { const o = s.orders.find((x) => x.id === el.dataset.oid); if (o && o.text !== el.textContent.trim()) { o.text = el.textContent.trim(); saveOrders(); renderOrders(); } });
}
const orderInput = $('#order-input');
orderInput.addEventListener('input', () => { orderInput.style.height = 'auto'; orderInput.style.height = Math.min(orderInput.scrollHeight, 160) + 'px'; });
orderInput.onkeydown = (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); advance(); return; }
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addOrder(orderInput.value); orderInput.value = ''; orderInput.style.height = 'auto'; }
};

// ───── map picking (march orders by clicking) ─────
app.startPick = (kind, id) => {
  const a = app.state.parties[id];
  app.picking = { kind, id };
  $('#pick-hint').textContent = `Click a destination for ${a.name} — or an enemy host to attack it (Esc to cancel)`; $('#pick-hint').classList.remove('hidden');
};
function finishPick(hid) {
  const pk = app.picking; app.picking = null; $('#pick-hint').classList.add('hidden');
  if (!hid) return;
  const a = app.state.parties[pk.id]; const hd = app.state.holdings[hid];
  const hostile = hd.owner !== app.state.meta.player && app.map.atWarWith(hd.owner);
  doVerb('march_host', { army: a.id, to: hid, intent: hostile ? 'lay siege and take it' : '' }, { after: () => app.map.flash(hd.pos) });
}

// march against another host: the engine fights the battle when they meet
function finishPickArmy(aid) {
  const pk = app.picking; app.picking = null; $('#pick-hint').classList.add('hidden');
  const a = app.state.parties[pk.id]; const foe = app.state.parties[aid];
  if (!a || !foe || foe.id === a.id) return;
  if (foe.owner === app.state.meta.player || !app.map.atWarWith(foe.owner)) { toast(`You are not at war with House ${app.state.houses[foe.owner]?.name}. Declare it first, or march to a place.`, true); return; }
  doVerb('attack_host', { army: a.id, to: ref(foe.id), intent: 'bring them to battle' }, { after: () => app.map.flash(foe.pos) });
}

// ───── tooltip ─────
function showTooltip(hit, e) {
  const tt = $('#tooltip'); const s = app.state;
  if (!hit || !s) { tt.classList.add('hidden'); return; }
  let html = '';
  if (hit.type === 'army') { const a = s.parties[hit.id]; if (!a) return; html = `<div class="tt-row">${sig(s.houses[a.owner], 1.4)}<div><b>${esc(a.name)}</b><br>${a.owner === s.meta.player ? '' : '~'}${fmt(a.men)} men${a.ships ? ' · ' + a.ships + ' ships' : ''}<br><span class="muted">${esc(statusText(s, a))}</span></div></div>`; }
  else {
    const hd = s.holdings[hit.id]; if (!hd) return; const o = s.houses[hd.owner]; const realm = s.houses[realmOf(s, hd.owner)];
    html = `<div class="tt-row">${sig(o, 1.4)}<div><b>${esc(hd.name)}</b><br>House ${esc(o?.name)}${realm && realm.id !== o.id ? ` <span class="muted">· ${esc(realm.realmName || realm.name)}</span>` : ''}<br><span class="muted">~${fmt(hd.population)} souls · prosperity ${Math.round(hd.prosperity)}</span>${hd.status !== 'normal' ? `<br>⚠ ${esc(hd.status)}` : ''}${app.picking ? '<br><b>Click to march here</b>' : ''}</div></div>`;
  }
  tt.innerHTML = html; tt.classList.remove('hidden');
  if (e) { tt.style.left = Math.min(window.innerWidth - tt.offsetWidth - 10, e.clientX + 16) + 'px'; tt.style.top = Math.min(window.innerHeight - tt.offsetHeight - 10, e.clientY + 16) + 'px'; }
}

// ───── busy overlay ─────
let busyTimer = null;
const showDiagnostics = () => { try { return localStorage.getItem('model-diagnostics') === '1'; } catch { return false; } };
// live: the turn is being written — the map stays in view, and the news appears as the model writes it
function busy(on, text, { live = false } = {}) {
  app.busy = on; $('#busy').classList.toggle('hidden', !on); $('#busy').classList.toggle('live', on && live); clearInterval(busyTimer);
  // the day being written sits at the head of the chronicle; any other wait covers the screen
  if (on && live && $('#drawer')) { $('#drawer').classList.remove('hidden'); $('#drawer').insertBefore($('#busy'), $('#drawer-body')); }
  else if ($('#busy').parentElement !== document.body) document.body.appendChild($('#busy'));
  if (on) {
    $('#busy-text').textContent = text; const t0 = Date.now(); $('#busy-feed').innerHTML = ''; let shown = 0;
    const lines = ['Ravens take wing…', 'Lords confer in their solars…', 'Hosts march along the kingsroad…', 'Coin changes hands in the shadows…', 'The maesters scratch at their ledgers…', 'Whispers pass through the Red Keep…', 'The smallfolk bring in the harvest…'];
    $('#busy-time').textContent = '';
    let prog = null, polling = false;
    busyTimer = setInterval(async () => {
      const sec = Math.round((Date.now() - t0) / 1000);
      // what is the model actually doing? (reading the prompt, thinking, or writing)
      if (app.saveId && !polling) { polling = true; api(`/games/${app.saveId}/progress`).then((p) => { prog = p; }).catch(() => {}).finally(() => { polling = false; }); }
      let what = lines[Math.floor(sec / 6) % lines.length];
      if (prog && prog.phase && prog.phase !== 'idle') {
        // in the world's words; the numbers only for those who ask for them (Settings → model diagnostics)
        const pct = prog.phase === 'reading' ? Math.round((100 * (prog.promptDone || 0)) / Math.max(1, prog.promptTotal || 1)) : null;
        // the council of five names whoever is speaking, so the wait is part of the world
        const who = prog.agentLabel ? `${prog.agentLabel}…${prog.agentTotal > 1 ? ` (${prog.agentStep}/${prog.agentTotal})` : ''}` : null;
        what = prog.phase === 'waiting' || prog.phase === 'reading' ? (who || `The maesters read the letters of the realm…${pct !== null ? ` ${pct}%` : ''}`)
          : prog.phase === 'thinking' ? (who || 'The maesters deliberate…')
          : prog.phase === 'writing' ? (live && prog.events?.length ? `The news comes in… (${prog.events.length} so far)` : (who || 'The chronicle is written…'))
          : prog.note ? prog.note.charAt(0).toUpperCase() + prog.note.slice(1) + '…' : what;
        if (showDiagnostics()) {
          const tps = prog.tokens && prog.ms ? (prog.tokens / Math.max(1, (prog.ms - (prog.firstTokenMs || 0)) / 1000)).toFixed(0) : null;
          what += ` [${prog.phase}${prog.promptTotal ? ` · prompt ${fmt(prog.promptTotal)}${prog.promptCached ? `, ${fmt(prog.promptCached)} cached` : ''}` : ''}${prog.thinkTokens ? ` · think ${fmt(prog.thinkTokens)}` : ''}${prog.tokens ? ` · out ${fmt(prog.tokens)}` : ''}${tps ? ` @ ${tps}/s` : ''}]`;
        }
      }
      $('#busy-time').textContent = `${sec}s — ${what}`;
      // the events already written: each appears once, and the camera goes to where it happened
      const evs = live && prog?.events || [];
      for (; shown < evs.length; shown++) {
        const e = evs[shown];
        $('#busy-feed').insertAdjacentHTML('beforeend', `<div class="bf-item"><div class="bf-t">${esc(e.title)}</div></div>`);
        const pos = e.where && app.state?.holdings[e.where]?.pos; if (pos && app.map) app.map.flash?.(pos);
        sfx('open');
      }
    }, 1000);
  }
}

// ───── actions ─────
document.addEventListener('click', (e) => {
  const t = e.target;
  const talk = t.closest('[data-talk]'); if (talk) { e.preventDefault(); e.stopPropagation(); openChat(talk.dataset.talk); return; }
  const win = t.closest('#action-ring [data-win]'); if (win) { if (win.dataset.win === 'chronicle') return showChronicle(); openWindow(win.dataset.win); return; }
  if (!app.state) { const a = t.closest('[data-action]'); if (a) handleAction(a.dataset.action, a); return; }
  const hold = t.closest('[data-hold]'); if (hold && !t.closest('.lbl')) { e.preventDefault(); app.map.select(hold.dataset.hold, { fly: true }); openSheet('holding', hold.dataset.hold); return; }
  const house = t.closest('[data-house]'); if (house) { e.preventDefault(); openSheet('house', house.dataset.house); const hh = app.state.houses[house.dataset.house]; if (hh?.seat) app.map.select(hh.seat, { fly: true }); return; }
  const army = t.closest('[data-army]'); if (army && !t.closest('.lbl')) { const a = app.state.parties[army.dataset.army]; if (a) { app.map.selectedArmy = a.id; app.map.flyTo(a.pos); openSheet('army', a.id); } return; }
  const ch = t.closest('[data-char]'); if (ch && !t.closest('button')) { openSheet('char', ch.dataset.char); return; }
  const act = t.closest('[data-action]'); if (act) handleAction(act.dataset.action, act);
});
$('#drawer-tabs').addEventListener('click', (e) => { const tab = e.target.closest('[data-tab]')?.dataset.tab; if (tab) setDrawer(tab); });
$('#mapmodes').onclick = (e) => { const b0 = e.target.closest('[data-mode]'); const m = b0?.dataset.mode; if (!m) return; const box = $('#mapmodes'); if (!box.classList.contains('open')) { box.classList.add('open'); return; } box.classList.remove('open'); $$('#mapmodes button').forEach((b) => b.classList.toggle('active', b.dataset.mode === m)); app.map.setMode(m); };
$('#modal').onclick = (e) => { if (e.target.id === 'modal') closeModal(); };
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { if (!$('#modal').classList.contains('hidden')) return closeModal(); if (app.picking) { app.picking = null; $('#pick-hint').classList.add('hidden'); return; } if (app.sheet) return closeSheet(); if (app.win) return closeWindow(); }
  if (!app.state || /input|textarea|select/i.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable) return;
  // the letters shown on the dock buttons; f stays as an old alias for diplomacy
  const map = { r: 'realm', c: 'council', m: 'military', e: 'economy', i: 'intrigue', p: 'people', d: 'diplomacy', f: 'diplomacy' };
  if (e.key === 'h') return showChronicle();
  if (e.key === '?') return showHelp();
  if (map[e.key] && !e.ctrlKey && !e.metaKey) openWindow(map[e.key]);
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) advance();
});

// What is under way, and how last turn's orders came out — read from the same state the map and People show
function showErrands() {
  const s = app.state; const moving = underway(s); const last = s.history.at(-1);
  const ICON = { ride: 'horse', march: 'swords', banners: 'flag', works: 'hammer', raven: 'raven' };
  const stop = (m) => (m.kind === 'ride' ? `<button class="btn small" data-recall-char="${m.id}" title="Turn back for where they set out">Call back</button>` : m.kind === 'march' ? `<button class="btn small" data-recall-army="${m.id}" title="Stop and hold where it stands">Halt</button>` : '');
  const rows = moving.map((m) => `<div class="errand"><span class="ei">${icon(ICON[m.kind])}</span><div class="grow"><b>${esc(m.who)}</b> <span class="muted">${esc(m.text)}</span></div><span class="ed">${m.days ? `~${m.days} ${m.days === 1 ? 'day' : 'days'}` : '—'}</span>${stop(m)}</div>`).join('') || '<div class="muted">Nothing of yours is on the road or being built.</div>';
  const outs = (last?.orders || []).map((o) => { const r = orderOutcome(o, s); return `<div class="errand"><span class="ost ${r.status}">${STATUS_LABEL[r.status]}</span><div class="grow">${esc(o.text)}${r.lines.length ? `<div class="muted" style="font-size:0.8rem">${r.lines.map(esc).join(' · ')}</div>` : ''}</div></div>`; }).join('');
  const recall = (params) => doVerb(params.character ? 'recall_rider' : 'halt_host', params, { after: showErrands });
  setTimeout(() => {
    $$('[data-recall-char]').forEach((b) => b.onclick = () => recall({ character: b.dataset.recallChar }));
    $$('[data-recall-army]').forEach((b) => b.onclick = () => recall({ army: b.dataset.recallArmy }));
  });
  modal(`<h2>Under way</h2>${rows}${outs ? `<h4 style="margin-top:1rem">Your orders of ${esc(last.dateFrom || last.date)}</h4>${outs}` : ''}`);
}

async function handleAction(action, el) {
  const s = app.state;
  switch (action) {
    case 'add-order': addOrder(orderInput.value); orderInput.value = ''; break;
    case 'errands': return showErrands();
    case 'advance': return advance();
    case 'suggest': {
      busy(true, 'Your advisors deliberate…');
      try {
        const r = await api(`/games/${app.saveId}/suggest`, { body: {} });
        modal(`<h2>Counsel of your advisors</h2><p class="muted">Click a suggestion to add it to your orders.</p>${r.suggestions.map((x) => `<div class="event" data-sugg="${esc(x)}"><div class="eb">${esc(x)}</div></div>`).join('')}`);
        $$('[data-sugg]').forEach((el2) => el2.onclick = () => { addOrder(el2.dataset.sugg); el2.style.opacity = 0.4; });
      } catch (e) { toast(e.message, true); } finally { busy(false); }
      break;
    }
    case 'ravens': setDrawer('letters'); $('#drawer').classList.remove('hidden'); $('#drawer-open').classList.add('hidden'); break;
    case 'undo': return chooseUndo();
    case 'settings': return showSettings();
    case 'help': return showHelp();
    case 'music': { startMusic(); const on = !musicSettings().on; setMusic('on', on); toast(on ? 'Music on' : 'Music off'); return; }
    case 'menu': app.state = null; if (app.map) app.map.state = null; closeWindow(); closeSheet(); initTitle(); break;
    case 'close-window': closeWindow(); break;
    case 'close-sheet': closeSheet(); app.map?.select(null); break;
    case 'close-chat': app.chatWith = null; app.council = null; setDrawer('feed'); break;
    case 'close-modal': closeModal(); break;
    case 'toggle-drawer': $('#drawer').classList.toggle('hidden'); $('#drawer-open').classList.toggle('hidden', !$('#drawer').classList.contains('hidden')); break;
    case 'open-realm': openWindow('realm'); break;
    case 'open-ruler': app.openRuler(); break;
  }
}

async function advance() {
  if (app.busy || !app.state) return;
  const undecided = (app.state.decisions || []).filter((d) => d.status === 'pending');
  if (undecided.length && !await confirmModal(
    undecided.length > 1 ? 'Matters still await your word' : 'A matter still awaits your word',
    `${undecided.map((d) => d.title).join('; ')}. Silence is an answer too — the world will decide without you.`,
    { yes: 'Let the days pass', no: 'Hear them first' })) { setDrawer('feed'); return; }
  const pending = orderInput.value.trim(); if (pending) { addOrder(pending); orderInput.value = ''; }
  const span = 'auto'; const until = nextTurnLength(app.state);
  busy(true, `The days pass${until.days > 1 ? ` — until ${until.reason}` : ''}…`, { live: true });
  try {
    const unreadBefore = app.state.ravens.filter((x) => !x.read).length;
    const r = await jump({ span, orders: app.state.orders });
    // the hosts march across the map as the replay's days go by
    if (app.map) { app.map.reelHold = true; app.map.reelF = 0; }
    prepareReveal(r.turn); app.setState(r.state); setDrawer('feed');
    // the hours pass; then the news is told in order, day by day, before the report
    sfx('bell');
    const newRavens = r.state.ravens.filter((x) => !x.read).length > unreadBefore;
    busy(false);
    playTurn(r.turn, { onDone: () => {
      if (app.map) { app.map.reelHold = false; app.map.reelF = 1; }
      // a day's turn ends on your choices, if any wait on you; a longer one with the full report
      // the chronicle has told the turn; what waits on the lord's word comes before him
      // an ending trumps everything else waiting on the lord's word
      if (app.state.outcome && app.state.outcome.turn === app.state.meta.turn) maybeShowOutcome();
      else if ((app.state.decisions || []).some((d) => d.status === 'pending' && d.turn === app.state.meta.turn)) showChoices();
      if (newRavens) sfx('raven');
    } });
    if (r.turn.salvaged) toast("The model's reply for this period could not be read, so the realm moved on by its own laws (ledger, vassals, seasons, marches). Try again next turn — or lower the period, or switch thinking off in Settings.", true);
  } catch (e) { toast(e.message, true); } finally { busy(false); }
}
// The days pass as a stream (03 §6.2, §10): each week is sent the moment it is told — its news in the feed, the map
// flashing where it happened — while the next is simulated; the lord may stop the days on the week he is watching.
// A server of an older build without the stream is asked the old way.
async function jump(body) {
  let job;
  try { job = (await api(`/games/${app.saveId}/jump`, { body })).job; } catch (e) { if (/not found/i.test(e.message)) return api(`/games/${app.saveId}/advance`, { body }); throw e; }
  const feed = $('#busy-feed'); let lastDay = 0;
  const stop = document.createElement('button'); stop.className = 'btn small busy-stop'; stop.textContent = 'Stop the days here'; stop.title = 'The days stop at the end of the week you are watching';
  stop.onclick = async () => { stop.disabled = true; stop.textContent = 'The days will stop…'; try { await api(`/games/${app.saveId}/jump/${job}/stop`, { body: { day: Math.max(1, lastDay) } }); } catch (e) { toast(e.message, true); } };
  feed.before(stop);
  try {
    return await new Promise((resolve, reject) => {
      const es = new EventSource(`/api/games/${app.saveId}/jump/${job}/stream`);
      es.addEventListener('segment', (m) => {
        const seg = JSON.parse(m.data); lastDay = seg.days?.[1] || lastDay;
        feed.insertAdjacentHTML('beforeend', `<div class="bf-seg">${esc(seg.from)}${seg.to !== seg.from ? ` – ${esc(seg.to)}` : ''}</div>`);
        for (const e of (seg.events || []).filter((x) => !x.bg).slice(0, 8)) {
          feed.insertAdjacentHTML('beforeend', `<div class="bf-item"><div class="bf-t">${esc(e.title)}</div></div>`);
          const pos = e.where && app.state?.holdings[e.where]?.pos; if (pos && app.map) app.map.flash?.(pos);
        }
        if (seg.meanwhile) feed.insertAdjacentHTML('beforeend', `<div class="bf-item bf-mw"><div class="bf-x">${esc(seg.meanwhile)}</div></div>`);
        feed.scrollTop = feed.scrollHeight; sfx('open');
      });
      es.addEventListener('done', (m) => { es.close(); resolve(JSON.parse(m.data)); });
      es.addEventListener('error', (m) => { es.close(); reject(new Error(m.data ? JSON.parse(m.data).error : 'The stream of days was lost; reload to see where the realm stands.')); });
    });
  } finally { stop.remove(); }
}
// Matters that came before you this turn, and nothing else
function showChoices() {
  const fresh = (app.state.decisions || []).filter((d) => d.status === 'pending' && d.turn === app.state.meta.turn);
  if (!fresh.length) return;
  modal(`<h2>${fresh.length > 1 ? 'Matters await your word' : 'A matter awaits your word'}</h2>${decisionsHtml(fresh)}<div class="report-actions"><button class="btn ghost" data-action="close-modal">Decide later</button></div>`);
  wireDecisions($('#modal-box'), { onAllDone: () => closeModal() });
}
async function showChronicle() {
  if (!app.saveId) return;
  const r = await api(`/games/${app.saveId}/chronicle`);
  modal(`<div class="chron-tabs"><button class="btn small active" id="chron-tab-c">The Chronicle</button><button class="btn small" id="chron-tab-w">World log</button></div><h2>📜 The Chronicle</h2><p class="muted" style="font-size:0.85rem">The long memory of your story. Every few turns the archmaester compresses older events into this record (<code>saves/${esc(app.saveId)}/chronicle.md</code>). The simulator reads it every turn — edit it to correct or steer the tale.</p>
    <div class="md" id="chron-view">${md(r.text)}</div>
    <textarea class="chronicle-edit hidden" id="chron-edit">${esc(r.text)}</textarea>
    <div class="settings-actions"><button class="btn" id="chron-toggle">Edit</button><button class="btn hidden" id="chron-save">Save</button><button class="btn ghost" id="chron-consolidate">Consolidate now</button></div>`);
  $('#chron-toggle').onclick = () => { $('#chron-view').classList.toggle('hidden'); $('#chron-edit').classList.toggle('hidden'); $('#chron-save').classList.toggle('hidden'); };
  $('#chron-save').onclick = async () => { await api(`/games/${app.saveId}/chronicle`, { body: { text: $('#chron-edit').value } }); toast('Chronicle saved.'); showChronicle(); };
  $('#chron-consolidate').onclick = async () => { busy(true, 'The archmaester writes…'); try { await api(`/games/${app.saveId}/consolidate`, { body: {} }); app.state = await api('/games/' + app.saveId); showChronicle(); } catch (e) { toast(e.message, true); } finally { busy(false); } };
  $('#chron-tab-w').onclick = showWorldLog;
}
// Everything that happened, turn by turn, newest first — the orders, the decisions, the great events and the small ones
async function showWorldLog() {
  const r = await api(`/games/${app.saveId}/worldlog`);
  const turns = r.text.split(/\n(?=## Turn )/).filter((t) => t.startsWith('## Turn'));
  modal(`<div class="chron-tabs"><button class="btn small" id="chron-tab-c">The Chronicle</button><button class="btn small active" id="chron-tab-w">World log</button></div><h2>📖 World log</h2><p class="muted" style="font-size:0.85rem">Everything that has happened, turn by turn — your orders, your decisions, the great events and the small life of the realm. Newest first. Also kept as <code>saves/${esc(app.saveId)}/world-log.md</code>.</p>
    <div class="md world-log">${turns.length ? md(turns.reverse().join('\n\n')) : '<p class="muted">Nothing yet — advance time and the log begins.</p>'}</div>`);
  $('#chron-tab-c').onclick = showChronicle;
}

// ───── how to play ─────
// There was no in-game guidance of any kind: every control had to be discovered by clicking. This is the
// one page that explains the loop, the keys, and what the engine decides versus what the story decides.
const HELP_KEYS = [
  ['Ctrl / ⌘ + Enter', 'End the turn — time runs on until the next thing that matters'],
  ['Enter', 'Add what you have written as an order'],
  ['R', 'Realm'], ['C', 'Council'], ['M', 'Military'], ['E', 'Economy'],
  ['D', 'Diplomacy'], ['I', 'Intrigue'], ['P', 'People'], ['H', 'Chronicle'],
  ['?', 'This page'],
  ['Esc', 'Close whatever is open; cancel a march you are aiming'],
];
function showHelp() {
  modal(`<h2>How the game is played</h2>
    <div class="help-cols">
      <div>
        <h4>The loop</h4>
        <p>Time is stopped until you end the turn. Write orders in plain words at the foot of the chronicle —
        <i>“Send Jory to Moat Cailin with fifty men”</i>, <i>“Call the banners of the North to Winterfell”</i> —
        and your steward reads each one back to you before it happens. Then end the turn. The engine carries out
        your orders, marches the hosts, fights the battles and settles the books; the model tells the story that
        grows around them.</p>
        <h4>A turn is not a fixed length</h4>
        <p>It runs until the next thing that matters to you: a host arrives, an answer lands, an enemy draws near,
        works are finished. At most a moon. The bar by <b>End turn</b> says what it is waiting for.</p>
        <h4>Who decides what</h4>
        <p>The <b>engine</b> owns the numbers and the physics — gold, food, distances, battle odds, sieges,
        succession, regency. The <b>story model</b> owns what people say and do. It cannot empty your treasury,
        move your people, or declare your wars. If something must truly happen, it happens in the engine.</p>
      </div>
      <div>
        <h4>Things new players miss</h4>
        <ul style="line-height:1.5">
          <li>Click a host, then <b>March</b>, then click anywhere on the map — including an enemy host.</li>
          <li>You can speak with <i>anyone</i> alive, anywhere. If they are far away it becomes a letter, and the answer takes days to come back.</li>
          <li>Silence is an answer. A decision left unanswered lapses, and the world chooses for you.</li>
          <li>The <b>Chronicle</b> file is the game's long memory. You may edit it by hand to correct or steer the tale.</li>
          <li>The <b>standing of your house</b> (Realm window) is what the campaign is finally scored on.</li>
          <li>Sieges cost the besieger. Camps sicken; a long siege can break the host outside the walls.</li>
        </ul>
        <h4>Keys</h4>
        <div class="kv help-keys">${HELP_KEYS.map(([k, v]) => `<span class="k"><kbd>${esc(k)}</kbd></span><span>${esc(v)}</span>`).join('')}</div>
      </div>
    </div>
    <div class="settings-actions"><button class="btn primary" data-action="close-modal">Back to the realm</button></div>`);
}

async function showSettings() {
  const c = await api('/config');
  const presets = [['llama.cpp', 'http://localhost:8080/v1'], ['LM Studio', 'http://localhost:1234/v1'], ['Ollama', 'http://localhost:11434/v1'], ['KoboldCpp', 'http://localhost:5001/v1'], ['text-gen-webui', 'http://localhost:5000/v1'], ['vLLM', 'http://localhost:8000/v1']];
  modal(`<h2>Settings</h2>
    <h4>Display</h4>
    <div class="scale-row"><label style="margin:0;white-space:nowrap">Interface size</label><input type="range" id="ui-scale" min="0.6" max="1.8" step="0.05" value="${uiScale()}"><span id="ui-scale-v" style="width:3.5rem;text-align:right">${Math.round(uiScale() * 100)}%</span><button class="btn small" id="ui-scale-reset">Reset</button></div>
    <div class="scale-row"><label style="margin:0;white-space:nowrap" title="Refugees leaving a sacked town, carts between prosperous holdings, outriders ahead of a host, deserters slipping away, ravens carrying the letters that were really sent"><input type="checkbox" id="gfx-life"> A living map</label></div>
    <div class="scale-row"><label style="margin:0;white-space:nowrap">Graphics</label><select id="gfx-q" style="flex:1"><option value="high">High — sharpest relief, full resolution</option><option value="balanced">Balanced (recommended for laptops)</option><option value="fast">Fast — for older machines</option></select></div>
    <label style="display:flex;gap:0.4rem;align-items:center"><input type="checkbox" id="house-theme" ${houseTheming() ? 'checked' : ''}> Colour the interface in my house's colours</label>
    <div class="settings-section"></div>
    <h4>Sound &amp; voices</h4>
    <div class="grid2">
      <div><label style="display:flex;gap:0.4rem;align-items:center"><input type="checkbox" id="snd-music" ${musicSettings().on ? 'checked' : ''}> Music</label><input type="range" id="snd-mvol" min="0" max="1" step="0.05" value="${musicSettings().volume}" style="width:100%"></div>
      <div><label>Character voices</label><select id="snd-engine"><option value="neural">Natural voices (runs in your browser; ~90 MB once)</option><option value="browser">Your system's voices</option><option value="server">Local voice server (Kokoro, Piper, XTTS…)</option><option value="off">Off</option></select><input type="range" id="snd-vvol" min="0" max="1" step="0.05" value="${voiceSettings().volume}" style="width:100%"></div>
      <div><label style="display:flex;gap:0.4rem;align-items:center"><input type="checkbox" id="snd-sfx" ${sfxSettings().on ? 'checked' : ''}> Sound effects</label><input type="range" id="snd-svol" min="0" max="1" step="0.05" value="${sfxSettings().volume}" style="width:100%"></div>
      <div><label style="display:flex;gap:0.4rem;align-items:center"><input type="checkbox" id="snd-narrate" ${voiceSettings().narrate ? 'checked' : ''}> A narrator reads the scene's actions</label></div>
      <div><label style="display:flex;gap:0.4rem;align-items:center"><input type="checkbox" id="snd-auto" ${voiceSettings().auto ? 'checked' : ''}> Speak replies aloud as they arrive</label></div>
      <div><button class="btn small" id="snd-test">Hear Lord Tywin</button> <button class="btn small" id="snd-test2">Hear Lady Catelyn</button></div>
      <div style="grid-column:1/-1"><label>Voice server URL <span class="muted">(OpenAI-compatible <code>/v1/audio/speech</code>, e.g. Kokoro-FastAPI <code>http://localhost:8880/v1</code>)</span></label><input class="input" id="snd-tts" value="${esc(c.ttsUrl || '')}" placeholder="http://localhost:8880/v1"></div>
      <div><label>Narrator</label><select id="snd-narrator"><option value="storyteller">The storyteller — a woman's voice, clear and warm</option><option value="maester">The maester — an old man, grave</option><option value="chronicler">The chronicler — a man, wry and light</option></select></div>
      <div><label>Character voices</label><div class="muted" style="font-size:0.82rem">Every character has a voice of their own. To change one, open their sheet and choose under <i>Nature → Voice</i>.</div></div>
      <p class="muted" style="grid-column:1/-1;font-size:0.78rem;margin:0">Every character has a voice of their own. The main cast are shaped by hand (Tywin deep and slow, Robert booming, Arya quick and young); everyone else by sex, age and homeland. Drop your own music into <code>public/music/</code> to replace the score.</p>
    </div>
    <div class="settings-section"></div>
    <h4>Model endpoint</h4>
    <p class="muted" style="font-size:0.9rem">Any OpenAI-compatible server works (llama.cpp's <code>llama-server</code>, LM Studio, Ollama…). The simulator juggles hundreds of names and must answer in JSON, so larger instruct models do best. Set the context window to what your server was started with (e.g. <code>-c 262144</code> → 262144).</p>
    <div class="grid2">
      <div><label>Provider</label><select id="cfg-provider"><option value="openai">OpenAI-compatible (local server)</option><option value="mock">Mock (no model, for testing)</option><option value="relay">Relay (you or another app writes the replies — see README)</option></select></div>
      <div><label>Model name <span class="muted">(blank = server default)</span></label><input class="input" id="cfg-model" list="model-list" value="${esc(c.model)}"><datalist id="model-list"></datalist></div>
      <div style="grid-column:1/-1"><label>Endpoint URL <span class="muted">(any OpenAI-compatible server, local or on your network: e.g. <code>http://192.168.1.20:8080/v1</code>; a bare <code>host:port</code> or a full <code>…/chat/completions</code> URL also works)</span></label><input class="input" id="cfg-url" value="${esc(c.baseUrl)}" placeholder="http://localhost:8080/v1"><div class="presets">${presets.map(([n, u]) => `<button class="btn small" data-url="${u}">${n}</button>`).join('')}</div></div>
      <div><label>API key <span class="muted">(usually blank)</span></label><input class="input" id="cfg-key" value="${esc(c.apiKey)}"></div>
      <div><label>Context window (tokens)</label><input class="input" id="cfg-ctx" type="number" value="${c.contextTokens}"></div>
      <div><label>Max response tokens</label><input class="input" id="cfg-max" type="number" value="${c.maxTokens}"></div>
      <div><label>Temperature</label><input class="input" id="cfg-temp" type="number" step="0.05" value="${c.temperature}"></div>
      <div><label>Consolidate memory every N turns</label><input class="input" id="cfg-cons" type="number" value="${c.consolidateEvery}"></div>
      <div><label>Recent turns kept verbatim</label><input class="input" id="cfg-keep" type="number" value="${c.keepRecentTurns}"></div>
      <div><label>Request timeout (seconds)</label><input class="input" id="cfg-timeout" type="number" value="${c.timeoutSec}"></div>
      <div><label>World detail per turn</label><select id="cfg-detail"><option value="full">Full — every house & person (best with big context & fast GPU)</option><option value="lean">Lean — only what matters to you (much faster on laptops)</option></select></div>
      <div><label>A director keeps the realm eventful</label><select id="cfg-director"><option value="light">Light — a new thread at most once a fortnight, when the weeks run quiet</option><option value="lively">Lively — up to two a week</option><option value="off">Off — only when a whole week passes with nothing of note</option></select><small class="muted">The director chooses among grounded beginnings (a hedge knight seeking service, outlaws on a road, a quarrel over a mill); the game makes them happen.</small></div>
      <div><label>Who tells the turn</label><select id="cfg-narrator"><option value="on">The chronicler — the week's stories told from what truly happened, and checked against it</option><option value="off">The old bard — free prose, lightly checked</option></select><small class="muted">A story the chronicler tells wrongly is told again once, then left in the plain words of the record.</small></div>
      <div><label>How many lords think each week</label><select id="cfg-minds"><option value="3">Three — fastest</option><option value="6">Six — the realm feels alive</option><option value="10">Ten — busiest, slowest</option><option value="off">None — the old Hand moves the realm</option></select><small class="muted">The rest act by their house's ways when something presses them.</small></div>
      <div><label>Thinking (reasoning models such as Qwen3)</label><select id="cfg-think"><option value="auto">Server default</option><option value="on">On — deeper, slower turns</option><option value="off">Off — fast turns</option></select></div>
      <div><label style="display:flex;gap:0.4rem;align-items:center"><input type="checkbox" id="cfg-thinkchat" ${c.thinkInAudiences ? 'checked' : ''}> Also think in audiences &amp; councils (slower replies)</label></div>
      <div><label>Thinking budget (extra tokens)</label><input class="input" id="cfg-tbudget" type="number" value="${c.thinkingBudget ?? 6000}"></div>
      <div><label>Reasoning effort per turn</label><select class="input" id="cfg-effort"><option value="">Server default</option><option value="low">Low — fastest; the engine hands the model a digested world</option><option value="medium">Medium</option><option value="xhigh">Highest — slowest</option></select><small class="muted">For models with effort levels (Qwen3.8). Others ignore it.</small></div>
      <div><label style="display:flex;gap:0.4rem;align-items:center"><input type="checkbox" id="cfg-stream" ${c.stream !== false ? 'checked' : ''}> Stream replies (shows live progress)</label></div>
      <div><label style="display:flex;gap:0.4rem;align-items:center"><input type="checkbox" id="cfg-diag" ${showDiagnostics() ? 'checked' : ''}> Show model diagnostics while the turn is written (tokens, cache, speed)</label></div>
      <div><label style="display:flex;gap:0.4rem;align-items:center"><input type="checkbox" id="cfg-json" ${c.jsonMode ? 'checked' : ''}> Force JSON mode (response_format)</label></div>
      <div style="grid-column:1/-1"><label>Extra request parameters (JSON, e.g. {"top_p":0.9,"min_p":0.05})</label><input class="input" id="cfg-extra" value="${esc(JSON.stringify(c.extraBody || {}))}"></div>
    </div>
    <div class="settings-actions"><button class="btn primary" id="cfg-save">Save</button><button class="btn" id="cfg-test">Test connection</button><button class="btn ghost" id="cfg-models">Fetch models</button></div>
    <div id="cfg-result" class="muted" style="margin-top:0.6rem;white-space:pre-wrap;font-size:0.85rem"></div>`);
  $('#cfg-provider').value = c.provider; $('#cfg-detail').value = c.promptDetail || 'full'; $('#cfg-narrator').value = c.narrator === 'off' || c.narrator === false ? 'off' : 'on'; $('#cfg-director').value = ['off', 'lively'].includes(c.director) ? c.director : 'light'; $('#cfg-minds').value = String(c.minds ?? 6); $('#cfg-think').value = c.thinking || 'auto'; $('#cfg-effort').value = c.reasoningEffort ?? 'low';
  const showScale = (v) => { setUiScale(v); $('#ui-scale-v').textContent = Math.round(v * 100) + '%'; };
  $('#ui-scale').oninput = (e) => showScale(Number(e.target.value));
  $('#ui-scale-reset').onclick = () => { $('#ui-scale').value = 1; showScale(1); };
  $('#house-theme').onchange = (e) => { setHouseTheming(e.target.checked); applyHouseTheme(app.state ? app.state.houses[app.state.meta.player] : HOUSES.find((x) => x.id === app.chosenHouse)); };
  $('#cfg-url').onchange = () => { if ($('#cfg-provider').value === 'mock') $('#cfg-provider').value = 'openai'; };
  $('#snd-engine').value = voiceSettings().engine; $('#snd-narrator').value = voiceSettings().narrator;
  try { $('#gfx-q').value = localStorage.getItem('gfx-quality') || 'balanced'; } catch { /* */ }
  $('#cfg-diag').onchange = (e) => { try { localStorage.setItem('model-diagnostics', e.target.checked ? '1' : '0'); } catch { /* */ } };
  try { $('#gfx-life').checked = (localStorage.getItem('map-life') ?? (localStorage.getItem('gfx-quality') === 'fast' ? '0' : '1')) === '1'; } catch { /* */ }
  $('#gfx-life').onchange = (e) => { app.map?.setLife(e.target.checked); };
  $('#gfx-q').onchange = (e) => { try { localStorage.setItem('gfx-quality', e.target.value); } catch { /* */ } toast('Graphics quality changes when the map next loads (reload the page).'); };
  $('#snd-music').onchange = (e) => { startMusic(); setMusic('on', e.target.checked); };
  $('#snd-sfx').onchange = (e) => { setSfx('on', e.target.checked); sfx('bell'); };
  $('#snd-svol').onchange = (e) => { setSfx('volume', Number(e.target.value)); sfx('seal'); };
  $('#snd-mvol').oninput = (e) => { startMusic(); setMusic('volume', Number(e.target.value)); };
  $('#snd-engine').onchange = (e) => setVoiceSetting('engine', e.target.value);
  $('#snd-vvol').oninput = (e) => setVoiceSetting('volume', Number(e.target.value));
  $('#snd-auto').onchange = (e) => setVoiceSetting('auto', e.target.checked);
  $('#snd-narrate').onchange = (e) => setVoiceSetting('narrate', e.target.checked);
  $('#snd-narrator').onchange = (e) => { setVoiceSetting('narrator', e.target.value); speak('The night is dark, and the realm holds its breath.', null, { narrator: true }); };
  $('#snd-tts').onchange = async (e) => { await api('/config', { body: { ttsUrl: e.target.value.trim() } }); };
  $('#snd-test').onclick = () => speak('A lion does not concern himself with the opinion of sheep. Sit. We have much to discuss.', { id: 'tywin_lannister', age: 57 });
  $('#snd-test2').onclick = () => speak('I have given the North five children. I will not give it a sixth for nothing.', { id: 'catelyn_stark', age: 35, gender: 'f' });
  $$('[data-url]').forEach((b) => b.onclick = () => { $('#cfg-url').value = b.dataset.url; });
  const collect = () => {
    let extra = {}; try { extra = JSON.parse($('#cfg-extra').value || '{}'); } catch { toast('Extra parameters are not valid JSON', true); }
    return { provider: $('#cfg-provider').value, model: $('#cfg-model').value.trim(), baseUrl: $('#cfg-url').value.trim(), apiKey: $('#cfg-key').value, contextTokens: Number($('#cfg-ctx').value), maxTokens: Number($('#cfg-max').value), temperature: Number($('#cfg-temp').value), consolidateEvery: Number($('#cfg-cons').value), keepRecentTurns: Number($('#cfg-keep').value), timeoutSec: Number($('#cfg-timeout').value), jsonMode: $('#cfg-json').checked, promptDetail: $('#cfg-detail').value, narrator: $('#cfg-narrator').value, director: $('#cfg-director').value, minds: $('#cfg-minds').value === 'off' ? 'off' : Number($('#cfg-minds').value), thinking: $('#cfg-think').value, thinkInAudiences: $('#cfg-thinkchat').checked, thinkingBudget: Number($('#cfg-tbudget').value) || 0, reasoningEffort: $('#cfg-effort').value, stream: $('#cfg-stream').checked, extraBody: extra };
  };
  $('#cfg-save').onclick = async () => { const r = await api('/config', { body: collect() }); $('#cfg-url').value = r.baseUrl; toast('Settings saved.'); refreshLLMStatus(); };
  $('#cfg-test').onclick = async () => { await api('/config', { body: collect() }); $('#cfg-result').textContent = 'Testing…'; try { const r = await api('/llm/test', { body: {} }); $('#cfg-result').textContent = `${r.ok ? '✔' : '⚠'} Connected (${r.ms} ms, ${r.model || 'model'})\nJSON schema enforced: ${r.schema ? 'yes' : 'no — update llama.cpp, or the game falls back more often'}\n"The Wall" understood as Castle Black: ${r.prefixSafe ? 'yes' : 'no'}${r.words ? `\nHouse Stark's words: ${r.words}` : ''}${(r.routing || []).map((x) => `\n⚠ ${x}`).join('')}${r.problems?.length ? `\n${r.problems.join('; ')}` : ''}`; } catch (e) { $('#cfg-result').textContent = '✖ ' + e.message; } refreshLLMStatus(); };
  $('#cfg-models').onclick = async () => { await api('/config', { body: collect() }); try { const r = await api('/models'); $('#model-list').innerHTML = r.models.map((m) => `<option value="${esc(m)}">`).join(''); $('#cfg-result').textContent = 'Models: ' + r.models.join(', '); } catch (e) { $('#cfg-result').textContent = '✖ ' + e.message; } };
}

startIconizer();
document.addEventListener('pointerdown', () => startMusic(), { once: true });
wireVoices($('#drawer-body'));
$$('[data-mi]').forEach((b) => b.insertAdjacentHTML('afterbegin', icon(b.dataset.mi)));
initTitle().catch((e) => toast(e.message, true));
window.__app = app;
