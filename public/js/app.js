import { HOUSES } from '../data/houses.js';
import { startIconizer, icon } from './ui/icons.js';
import { drawTitleMap } from './ui/titlemap.js';
import { startMusic, setMood, musicSettings, setMusic } from './ui/music.js';
import { sfx, wireSfx, sfxSettings, setSfx } from './ui/sfx.js';
import { voiceSettings, setVoiceSetting, speak } from './ui/voice.js';
import { atWar } from './shared/warfare.js';
import { CHARACTERS } from '../data/characters.js';
import { briefFor } from '../data/briefs.js';
import { sigilSrc, bannerURL, loadSigilArt } from './sigils.js';
import { portraitURL, loadCustomPortraits } from './ui/portrait.js';
import { app, $, $$, esc, fmt, api, toast, modal, closeModal, md, player, ruler, sig, por, addOrder, saveOrders, REGION_NAMES, RANK_NAMES, applyHouseTheme, uiScale, setUiScale, houseTheming, setHouseTheming } from './ui/common.js';
import { openWindow, closeWindow, renderWindow, openSheet, closeSheet, renderSheet } from './ui/windows.js';
import { renderDrawer, setDrawer, openChat, openCouncil, eventHtml, decisionsHtml, wireDecisions, wireVoices } from './ui/drawer.js';
import { dateStr, realmOf, realmTotals, FIGURE_LABELS, placeName } from './shared/world.js';
import { project, SEASONS } from './shared/economy.js';

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
    ${(() => { const b = briefFor(h, { houses: Object.fromEntries(HOUSES.map((x) => [x.id, x])) }); return `<p style="line-height:1.45">${esc(b.situation)}</p><div class="grid2"><div><h4>Strengths</h4>${b.strengths.map((x) => `<div style="font-size:0.88rem">✦ ${esc(x)}</div>`).join('')}</div><div><h4>Weaknesses</h4>${b.weaknesses.map((x) => `<div style="font-size:0.88rem">✧ ${esc(x)}</div>`).join('')}</div></div>`; })()}
    <div class="kv"><span class="k">Seat</span><span>${esc(h.seat || '— (landless)')}</span><span class="k">Liege</span><span>${liege ? esc(liege.name) : 'None'}</span><span class="k">Vassals</span><span>${vassals.length ? vassals.length + ' houses' : '—'}</span></div>
    ${people.length ? `<h4>Your people</h4><div class="portrait-row">${people.map((c) => `<div class="p" title="${esc(c.title)}"><img src="${portraitURL({ ...c, alive: true }, h, 96)}"><div>${esc(c.name.replace(/^(Ser|Maester|Lord|Lady|Grand Maester) /, '').split(' ')[0])}</div></div>`).join('')}</div>` : ''}
    ${lord ? `<div class="lord-card"><img src="${portraitURL({ ...lord, alive: true }, h, 160)}" alt=""><div><div class="lc-k">You will play as</div><div class="lc-name">${esc(lord.name)}</div><div class="lc-title">${esc(lord.title || '')}</div><div class="lc-traits">${esc(lord.traits || '')}</div></div></div>` : ''}
    <button class="btn primary" style="font-size:1.05rem;padding:0.6rem 1.4rem;margin-top:0.5rem" id="begin">Begin as House ${esc(h.name)} ▶</button>`;
  $('#begin').onclick = async () => { try { try { localStorage.setItem('wc-last-house', h.id); } catch { /* ignore */ } const r = await api('/games', { body: { scenario: 'agot_298', house: h.id } }); startGame(r.id, r.state); } catch (e) { toast(e.message, true); } };
}
async function renderSaves() {
  const saves = await api('/saves');
  $('#save-list').innerHTML = saves.length ? saves.map((s) => {
    const h = HOUSES.find((x) => x.id === s.player);
    return `<div class="save" data-id="${s.id}">${h ? `<img src="${bannerURL(h.sigil, 40, 60)}">` : ''}<div><div>${esc(s.playerName)}</div><div class="muted" style="font-size:0.8rem">${esc(s.date)} · turn ${s.turn}</div></div><button class="btn small del" data-del="${s.id}">✕</button></div>`;
  }).join('') : '<div class="muted">No saved games yet.</div>';
  $('#save-list').onclick = async (e) => {
    const del = e.target.closest('[data-del]')?.dataset.del;
    if (del) { e.stopPropagation(); if (confirm('Delete this save permanently?')) { await api('/games/' + del, { method: 'DELETE' }); renderSaves(); } return; }
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
        onSelectArmy: (aid) => openSheet('army', aid),
        onHover: showTooltip,
        onEvent: (e) => { setDrawer('feed'); if (e.where && app.state.holdings[e.where]) app.map.flyTo(app.state.holdings[e.where].pos); toast(e.title + ' — ' + e.text); },
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
function renderAll() { renderTop(); renderPlayer(); renderOrders(); renderDrawer(); renderWindow(); renderSheet(); }
app.renderOrders = renderOrders; app.renderTop = renderTop;
app.setState = (s, opts = {}) => { app.state = s; applyHouseTheme(s.houses[s.meta.player]); setMood(moodFor(s)); app.map?.setState(s); renderTop(); renderPlayer(); renderOrders(); renderWindow(); renderSheet(); if (!opts.keepDrawer) renderDrawer(); };

function renderTop() {
  const s = app.state, h = player();
  const pr = project(s, h.id);
  const last = h.ledger?.at(-1);
  const trend = last ? (last.net >= 0 ? `<span class="up">▲${fmt(Math.abs(Math.round(last.net)))}</span>` : `<span class="down">▼${fmt(Math.abs(Math.round(last.net)))}</span>`) : '';
  const tot = realmTotals(s, h.id);
  const season = SEASONS[s.world?.season || 'summer'];
  const food = Number(h.figures.food.v) || 0;
  const foodPct = Math.max(0, Math.min(100, (food / 24) * 100));
  const net = (lo, hi) => `${lo >= 0 ? '+' : '−'}${fmt(Math.abs(lo))} … ${hi >= 0 ? '+' : '−'}${fmt(Math.abs(hi))}`;
  const items = [
    { ic: '🪙', k: 'Treasury', v: `${fmt(h.figures.treasury.v)}`, sub: `${net(pr.low, pr.high)} a moon`, cls: pr.high < 0 ? 'bad' : pr.low < 0 ? 'warn' : 'good', win: 'economy', tip: `Gold dragons in your coffers (${h.figures.treasury.src}, ${h.figures.treasury.asOf}).\nSteward's projection per moon: ${net(pr.low, pr.high)} — luck, harvests and loyal (or disloyal) vassals decide the real figure.${h.figures.debt?.v ? '\nDebt: ' + fmt(h.figures.debt.v) : ''}${last ? `\nLast turn: ${last.net >= 0 ? '+' : ''}${fmt(Math.round(last.net))}` : ''}` },
    { ic: '⚔', k: 'Levies', v: `~${fmt(h.figures.levies.v)}`, sub: `realm ~${fmt(tot.levies)}`, win: 'military', tip: `Your own levies, not yet raised (${h.figures.levies.src}).\nWith every sworn house, if they answer the call: ~${fmt(tot.levies)}` },
    { ic: '🛡', k: 'Men-at-arms', v: fmt(h.figures.menAtArms.v), sub: `guard ${fmt(h.figures.guard.v)}`, win: 'military', tip: 'Standing soldiers in your pay, and your household guard.' },
    { ic: '⛵', k: 'Ships', v: fmt(h.figures.ships.v), sub: `realm ~${fmt(tot.ships)}`, win: 'military', tip: 'Your warships, and those of your whole realm.' },
    { ic: '🌾', k: 'Food', v: `${food} <small>moons</small>`, bar: foodPct, cls: food < 4 ? 'bad' : food < 10 ? 'warn' : 'good', win: 'economy', tip: `Moons of stores in your granaries (${h.figures.food.src}). Winter will empty them.` },
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
  const h = player(); const r = ruler();
  $('#player-banner').innerHTML = `<img src="${bannerURL(h.sigil, 80, 120)}" alt="House ${esc(h.name)}" title="House ${esc(h.name)} — ${esc(h.words)}">`;
  $('#player-portrait').innerHTML = r ? `<img src="${por(r, 160)}" alt="">` : '';
  $('#player-name').innerHTML = `${esc(r?.name || 'House ' + h.name)}<small>${esc(h.title || RANK_NAMES[h.rank])}</small>`;
}

// ───── orders ─────
function renderOrders() {
  const s = app.state;
  $('#orders').innerHTML = s.orders.map((o, i) => `<div class="order ${o.auto ? 'auto' : ''}"><span class="n">${i + 1}.</span><span class="t" contenteditable="true" data-oid="${o.id}">${esc(o.text)}</span><button data-del-order="${o.id}" title="Remove">✕</button></div>`).join('');
  $$('[data-del-order]').forEach((b) => b.onclick = () => { s.orders = s.orders.filter((o) => o.id !== b.dataset.delOrder); saveOrders(); renderOrders(); });
  $$('.order .t').forEach((el) => el.onblur = () => { const o = s.orders.find((x) => x.id === el.dataset.oid); if (o) { o.text = el.textContent.trim(); saveOrders(); } });
}
const orderInput = $('#order-input');
orderInput.addEventListener('input', () => { orderInput.style.height = 'auto'; orderInput.style.height = Math.min(orderInput.scrollHeight, 160) + 'px'; });
orderInput.onkeydown = (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); advance(); return; }
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addOrder(orderInput.value); orderInput.value = ''; orderInput.style.height = 'auto'; }
};

// ───── map picking (march orders by clicking) ─────
app.startPick = (kind, id) => {
  const a = app.state.armies[id];
  app.picking = { kind, id };
  $('#pick-hint').textContent = `Click a destination on the map for ${a.name} (Esc to cancel)`; $('#pick-hint').classList.remove('hidden');
};
function finishPick(hid) {
  const pk = app.picking; app.picking = null; $('#pick-hint').classList.add('hidden');
  if (!hid) return;
  const a = app.state.armies[pk.id]; const hd = app.state.holdings[hid];
  const hostile = hd.owner !== app.state.meta.player && app.map.atWarWith(hd.owner);
  api(`/games/${app.saveId}/act`, { body: { kind: 'march', army: a.id, to: hid, intent: hostile ? 'lay siege and take it' : '' } })
    .then((r) => { app.setState(r.state); toast(`${a.name} marches on ${hd.name}. The route is on the map.`); app.map.flash(hd.pos); })
    .catch((e) => toast(e.message, true));
}

// ───── tooltip ─────
function showTooltip(hit, e) {
  const tt = $('#tooltip'); const s = app.state;
  if (!hit || !s) { tt.classList.add('hidden'); return; }
  let html = '';
  if (hit.type === 'army') { const a = s.armies[hit.id]; if (!a) return; html = `<div class="tt-row">${sig(s.houses[a.owner], 1.4)}<div><b>${esc(a.name)}</b><br>${a.owner === s.meta.player ? '' : '~'}${fmt(a.men)} men${a.ships ? ' · ' + a.ships + ' ships' : ''}<br><span class="muted">${esc(a.status || '')}</span></div></div>`; }
  else {
    const hd = s.holdings[hit.id]; if (!hd) return; const o = s.houses[hd.owner]; const realm = s.houses[realmOf(s, hd.owner)];
    html = `<div class="tt-row">${sig(o, 1.4)}<div><b>${esc(hd.name)}</b><br>House ${esc(o?.name)}${realm && realm.id !== o.id ? ` <span class="muted">· ${esc(realm.realmName || realm.name)}</span>` : ''}<br><span class="muted">~${fmt(hd.population)} souls · prosperity ${Math.round(hd.prosperity)}</span>${hd.status !== 'normal' ? `<br>⚠ ${esc(hd.status)}` : ''}${app.picking ? '<br><b>Click to march here</b>' : ''}</div></div>`;
  }
  tt.innerHTML = html; tt.classList.remove('hidden');
  if (e) { tt.style.left = Math.min(window.innerWidth - tt.offsetWidth - 10, e.clientX + 16) + 'px'; tt.style.top = Math.min(window.innerHeight - tt.offsetHeight - 10, e.clientY + 16) + 'px'; }
}

// ───── busy overlay ─────
let busyTimer = null;
function busy(on, text) {
  app.busy = on; $('#busy').classList.toggle('hidden', !on); clearInterval(busyTimer);
  if (on) {
    $('#busy-text').textContent = text; const t0 = Date.now();
    const lines = ['Ravens take wing…', 'Lords confer in their solars…', 'Hosts march along the kingsroad…', 'Coin changes hands in the shadows…', 'The maesters scratch at their ledgers…', 'Whispers pass through the Red Keep…', 'The smallfolk bring in the harvest…'];
    $('#busy-time').textContent = '';
    let prog = null, polling = false;
    busyTimer = setInterval(async () => {
      const sec = Math.round((Date.now() - t0) / 1000);
      // what is the model actually doing? (reading the prompt, thinking, or writing)
      if (app.saveId && !polling) { polling = true; api(`/games/${app.saveId}/progress`).then((p) => { prog = p; }).catch(() => {}).finally(() => { polling = false; }); }
      let what = lines[Math.floor(sec / 6) % lines.length];
      if (prog && prog.phase && prog.phase !== 'idle') {
        const tps = prog.tokens && prog.ms ? (prog.tokens / Math.max(1, (prog.ms - (prog.firstTokenMs || 0)) / 1000)).toFixed(0) : null;
        what = prog.phase === 'waiting' ? 'The model is reading the state of the realm (processing the prompt)…'
          : prog.phase === 'reading' ? `Reading the state of the realm… ${Math.round((100 * (prog.promptDone || 0)) / Math.max(1, prog.promptTotal || 1))}% of ${fmt(prog.promptTotal || 0)} tokens${prog.promptCached ? ` (${fmt(prog.promptCached)} remembered from last time)` : ''}`
          : prog.phase === 'thinking' ? `The maesters deliberate… ~${fmt(prog.thinkTokens || 0)} tokens of thought`
          : prog.phase === 'writing' ? `Writing… ~${fmt(prog.tokens || 0)} tokens${tps ? ` (${tps}/s)` : ''}${prog.thinkTokens ? ` after ~${fmt(prog.thinkTokens)} of thought` : ''}`
          : prog.note ? prog.note.charAt(0).toUpperCase() + prog.note.slice(1) + '…' : what;
      }
      $('#busy-time').textContent = `${sec}s — ${what}`;
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
  const army = t.closest('[data-army]'); if (army && !t.closest('.lbl')) { const a = app.state.armies[army.dataset.army]; if (a) { app.map.selectedArmy = a.id; app.map.flyTo(a.pos); openSheet('army', a.id); } return; }
  const ch = t.closest('[data-char]'); if (ch && !t.closest('button')) { openSheet('char', ch.dataset.char); return; }
  const act = t.closest('[data-action]'); if (act) handleAction(act.dataset.action, act);
});
$('#drawer-tabs').addEventListener('click', (e) => { const tab = e.target.closest('[data-tab]')?.dataset.tab; if (tab) setDrawer(tab); });
$('#mapmodes').onclick = (e) => { const b0 = e.target.closest('[data-mode]'); const m = b0?.dataset.mode; if (!m) return; $$('#mapmodes button').forEach((b) => b.classList.toggle('active', b.dataset.mode === m)); app.map.setMode(m); };
$('#modal').onclick = (e) => { if (e.target.id === 'modal') closeModal(); };
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { if (!$('#modal').classList.contains('hidden')) return closeModal(); if (app.picking) { app.picking = null; $('#pick-hint').classList.add('hidden'); return; } if (app.sheet) return closeSheet(); if (app.win) return closeWindow(); }
  if (!app.state || /input|textarea|select/i.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable) return;
  const map = { r: 'realm', c: 'council', m: 'military', e: 'economy', i: 'intrigue', p: 'people', f: 'diplomacy' };
  if (e.key === 'h') return showChronicle();
  if (map[e.key] && !e.ctrlKey && !e.metaKey) openWindow(map[e.key]);
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) advance();
});

async function handleAction(action, el) {
  const s = app.state;
  switch (action) {
    case 'add-order': addOrder(orderInput.value); orderInput.value = ''; break;
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
    case 'undo': {
      if (!confirm('Undo the last turn? The world returns to how it was before you advanced.')) return;
      try { const st = await api(`/games/${app.saveId}/undo`, { body: {} }); app.setState(st); toast('The last turn has been undone.'); } catch (e) { toast(e.message, true); }
      break;
    }
    case 'settings': return showSettings();
    case 'music': { startMusic(); const on = !musicSettings().on; setMusic('on', on); toast(on ? 'Music on' : 'Music off'); return; }
    case 'menu': app.state = null; if (app.map) app.map.state = null; closeWindow(); closeSheet(); initTitle(); break;
    case 'close-window': closeWindow(); break;
    case 'close-sheet': closeSheet(); app.map?.select(null); break;
    case 'close-chat': app.chatWith = null; app.council = null; setDrawer('feed'); break;
    case 'close-modal': closeModal(); break;
    case 'toggle-drawer': $('#drawer').classList.toggle('hidden'); $('#drawer-open').classList.toggle('hidden', !$('#drawer').classList.contains('hidden')); break;
    case 'open-realm': openWindow('realm'); break;
    case 'open-ruler': if (ruler()) openSheet('char', ruler().id); break;
  }
}

async function advance() {
  if (app.busy || !app.state) return;
  const undecided = (app.state.decisions || []).filter((d) => d.status === 'pending');
  if (undecided.length && !confirm(`${undecided.length} decision${undecided.length > 1 ? 's await' : ' awaits'} your answer (${undecided.map((d) => d.title).join(', ')}). Silence is also an answer — advance anyway?`)) { setDrawer('feed'); return; }
  const pending = orderInput.value.trim(); if (pending) { addOrder(pending); orderInput.value = ''; }
  const span = $('#span-select').value;
  busy(true, `The world moves forward ${$('#span-select').selectedOptions[0].text}…`);
  try {
    const unreadBefore = app.state.ravens.filter((x) => !x.read).length;
    const r = await api(`/games/${app.saveId}/advance`, { body: { span, orders: app.state.orders } });
    app.setState(r.state); setDrawer('feed');
    // the hours pass; then the news: horns for battle, a raven for letters
    sfx('bell');
    if (r.turn.events.some((e) => e.type === 'war' && e.importance >= 4)) setTimeout(() => sfx('horn'), 1100);
    if (r.state.ravens.filter((x) => !x.read).length > unreadBefore) setTimeout(() => sfx('raven'), 2400);
    showTurnReport(r.turn);
    if (r.turn.salvaged) toast("The model's reply for this period could not be read, so the realm moved on by its own laws (ledger, vassals, seasons, marches). Try again next turn — or lower the period, or switch thinking off in Settings.", true);
  } catch (e) { toast(e.message, true); } finally { busy(false); }
}
function showTurnReport(t) {
  const L = t.ledger;
  const decs = decisionsHtml();
  modal(`<h2>${esc(t.dateFrom)} → ${esc(t.date)}</h2>
    ${decs ? `<h4>Decisions await you</h4>${decs}<hr>` : ''}
    <div class="summary">${esc(t.summary)}</div><hr>
    ${t.events.map(eventHtml).join('')}
    ${L ? `<hr><h4>Your accounts</h4><div class="kv"><span class="k">Income</span><span style="color:#a8e08a">+${fmt(L.income)}</span><span class="k">Expenses</span><span style="color:#ec9a8a">−${fmt(L.expense)}</span><span class="k">Treasury</span><span><b>${fmt(L.prevTreasury)} → ${fmt(L.treasury)}</b></span><span class="k">Food stores</span><span>${L.food} moons</span></div>
      ${L.lines.filter((l) => l.note && /withheld|late|short/.test(l.note)).map((l) => `<div class="muted" style="font-size:0.85rem">⚠ ${esc(l.label)} — ${esc(l.note)}</div>`).join('')}` : ''}
    ${t.applied?.length ? `<hr><details><summary><h4 style="display:inline">The world changes (${t.applied.length})</h4></summary><ul class="changes">${t.applied.map((a) => `<li>${esc(a.text)}</li>`).join('')}</ul></details>` : ''}
    ${t.rejected?.length ? `<p class="muted" style="font-size:0.8rem">${t.rejected.length} proposed change(s) referred to unknown people or places and were ignored.</p>` : ''}
    <div class="report-actions"><button class="btn primary" data-action="close-modal">Continue</button></div>`);
  // once every decision here is answered, the report steps aside (it stays in the Events feed)
  wireDecisions($('#modal-box'), { onAllDone: () => { if (!(app.state.decisions || []).some((d) => d.status === 'pending')) closeModal(); } });
  for (const e of t.events) if (e.where && app.state.holdings[e.where]) app.map.flash(app.state.holdings[e.where].pos);
}

async function showChronicle() {
  if (!app.saveId) return;
  const r = await api(`/games/${app.saveId}/chronicle`);
  modal(`<h2>📜 The Chronicle</h2><p class="muted" style="font-size:0.85rem">The long memory of your story. Every few turns the archmaester compresses older events into this record (<code>saves/${esc(app.saveId)}/chronicle.md</code>). The simulator reads it every turn — edit it to correct or steer the tale.</p>
    <div class="md" id="chron-view">${md(r.text)}</div>
    <textarea class="chronicle-edit hidden" id="chron-edit">${esc(r.text)}</textarea>
    <div class="settings-actions"><button class="btn" id="chron-toggle">Edit</button><button class="btn hidden" id="chron-save">Save</button><button class="btn ghost" id="chron-consolidate">Consolidate now</button></div>`);
  $('#chron-toggle').onclick = () => { $('#chron-view').classList.toggle('hidden'); $('#chron-edit').classList.toggle('hidden'); $('#chron-save').classList.toggle('hidden'); };
  $('#chron-save').onclick = async () => { await api(`/games/${app.saveId}/chronicle`, { body: { text: $('#chron-edit').value } }); toast('Chronicle saved.'); showChronicle(); };
  $('#chron-consolidate').onclick = async () => { busy(true, 'The archmaester writes…'); try { await api(`/games/${app.saveId}/consolidate`, { body: {} }); app.state = await api('/games/' + app.saveId); showChronicle(); } catch (e) { toast(e.message, true); } finally { busy(false); } };
}

async function showSettings() {
  const c = await api('/config');
  const presets = [['llama.cpp', 'http://localhost:8080/v1'], ['LM Studio', 'http://localhost:1234/v1'], ['Ollama', 'http://localhost:11434/v1'], ['KoboldCpp', 'http://localhost:5001/v1'], ['text-gen-webui', 'http://localhost:5000/v1'], ['vLLM', 'http://localhost:8000/v1']];
  modal(`<h2>Settings</h2>
    <h4>Display</h4>
    <div class="scale-row"><label style="margin:0;white-space:nowrap">Interface size</label><input type="range" id="ui-scale" min="0.6" max="1.8" step="0.05" value="${uiScale()}"><span id="ui-scale-v" style="width:3.5rem;text-align:right">${Math.round(uiScale() * 100)}%</span><button class="btn small" id="ui-scale-reset">Reset</button></div>
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
      <div style="grid-column:1/-1"><label>Voice for a character <span class="muted">(optional overrides as JSON, e.g. {"tywin_lannister":"bm_george"})</span></label><input class="input" id="snd-over" value="${esc(JSON.stringify(voiceSettings().overrides))}"></div>
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
      <div><label>Thinking (reasoning models such as Qwen3)</label><select id="cfg-think"><option value="auto">Server default</option><option value="on">On — deeper, slower turns</option><option value="off">Off — fast turns</option></select></div>
      <div><label style="display:flex;gap:0.4rem;align-items:center"><input type="checkbox" id="cfg-thinkchat" ${c.thinkInAudiences ? 'checked' : ''}> Also think in audiences &amp; councils (slower replies)</label></div>
      <div><label>Thinking budget (extra tokens)</label><input class="input" id="cfg-tbudget" type="number" value="${c.thinkingBudget ?? 6000}"></div>
      <div><label style="display:flex;gap:0.4rem;align-items:center"><input type="checkbox" id="cfg-stream" ${c.stream !== false ? 'checked' : ''}> Stream replies (shows live progress)</label></div>
      <div><label style="display:flex;gap:0.4rem;align-items:center"><input type="checkbox" id="cfg-json" ${c.jsonMode ? 'checked' : ''}> Force JSON mode (response_format)</label></div>
      <div style="grid-column:1/-1"><label>Extra request parameters (JSON, e.g. {"top_p":0.9,"min_p":0.05})</label><input class="input" id="cfg-extra" value="${esc(JSON.stringify(c.extraBody || {}))}"></div>
    </div>
    <div class="settings-actions"><button class="btn primary" id="cfg-save">Save</button><button class="btn" id="cfg-test">Test connection</button><button class="btn ghost" id="cfg-models">Fetch models</button></div>
    <div id="cfg-result" class="muted" style="margin-top:0.6rem;white-space:pre-wrap;font-size:0.85rem"></div>`);
  $('#cfg-provider').value = c.provider; $('#cfg-detail').value = c.promptDetail || 'full'; $('#cfg-think').value = c.thinking || 'auto';
  const showScale = (v) => { setUiScale(v); $('#ui-scale-v').textContent = Math.round(v * 100) + '%'; };
  $('#ui-scale').oninput = (e) => showScale(Number(e.target.value));
  $('#ui-scale-reset').onclick = () => { $('#ui-scale').value = 1; showScale(1); };
  $('#house-theme').onchange = (e) => { setHouseTheming(e.target.checked); applyHouseTheme(app.state ? app.state.houses[app.state.meta.player] : HOUSES.find((x) => x.id === app.chosenHouse)); };
  $('#cfg-url').onchange = () => { if ($('#cfg-provider').value === 'mock') $('#cfg-provider').value = 'openai'; };
  $('#snd-engine').value = voiceSettings().engine;
  try { $('#gfx-q').value = localStorage.getItem('gfx-quality') || 'balanced'; } catch { /* */ }
  $('#gfx-q').onchange = (e) => { try { localStorage.setItem('gfx-quality', e.target.value); } catch { /* */ } toast('Graphics quality changes when the map next loads (reload the page).'); };
  $('#snd-music').onchange = (e) => { startMusic(); setMusic('on', e.target.checked); };
  $('#snd-sfx').onchange = (e) => { setSfx('on', e.target.checked); sfx('bell'); };
  $('#snd-svol').onchange = (e) => { setSfx('volume', Number(e.target.value)); sfx('seal'); };
  $('#snd-mvol').oninput = (e) => { startMusic(); setMusic('volume', Number(e.target.value)); };
  $('#snd-engine').onchange = (e) => setVoiceSetting('engine', e.target.value);
  $('#snd-vvol').oninput = (e) => setVoiceSetting('volume', Number(e.target.value));
  $('#snd-auto').onchange = (e) => setVoiceSetting('auto', e.target.checked);
  $('#snd-narrate').onchange = (e) => setVoiceSetting('narrate', e.target.checked);
  $('#snd-over').onchange = (e) => { try { setVoiceSetting('overrides', JSON.parse(e.target.value || '{}')); } catch { toast('Voice overrides are not valid JSON', true); } };
  $('#snd-tts').onchange = async (e) => { await api('/config', { body: { ttsUrl: e.target.value.trim() } }); };
  $('#snd-test').onclick = () => speak('A lion does not concern himself with the opinion of sheep. Sit. We have much to discuss.', { id: 'tywin_lannister', age: 57 });
  $('#snd-test2').onclick = () => speak('I have given the North five children. I will not give it a sixth for nothing.', { id: 'catelyn_stark', age: 35, gender: 'f' });
  $$('[data-url]').forEach((b) => b.onclick = () => { $('#cfg-url').value = b.dataset.url; });
  const collect = () => {
    let extra = {}; try { extra = JSON.parse($('#cfg-extra').value || '{}'); } catch { toast('Extra parameters are not valid JSON', true); }
    return { provider: $('#cfg-provider').value, model: $('#cfg-model').value.trim(), baseUrl: $('#cfg-url').value.trim(), apiKey: $('#cfg-key').value, contextTokens: Number($('#cfg-ctx').value), maxTokens: Number($('#cfg-max').value), temperature: Number($('#cfg-temp').value), consolidateEvery: Number($('#cfg-cons').value), keepRecentTurns: Number($('#cfg-keep').value), timeoutSec: Number($('#cfg-timeout').value), jsonMode: $('#cfg-json').checked, promptDetail: $('#cfg-detail').value, thinking: $('#cfg-think').value, thinkInAudiences: $('#cfg-thinkchat').checked, thinkingBudget: Number($('#cfg-tbudget').value) || 0, stream: $('#cfg-stream').checked, extraBody: extra };
  };
  $('#cfg-save').onclick = async () => { const r = await api('/config', { body: collect() }); $('#cfg-url').value = r.baseUrl; toast('Settings saved.'); refreshLLMStatus(); };
  $('#cfg-test').onclick = async () => { await api('/config', { body: collect() }); $('#cfg-result').textContent = 'Testing…'; try { const r = await api('/llm/test', { body: {} }); $('#cfg-result').textContent = `✔ Connected (${r.ms} ms, ${r.model || 'model'})\n${r.text}`; } catch (e) { $('#cfg-result').textContent = '✖ ' + e.message; } refreshLLMStatus(); };
  $('#cfg-models').onclick = async () => { await api('/config', { body: collect() }); try { const r = await api('/models'); $('#model-list').innerHTML = r.models.map((m) => `<option value="${esc(m)}">`).join(''); $('#cfg-result').textContent = 'Models: ' + r.models.join(', '); } catch (e) { $('#cfg-result').textContent = '✖ ' + e.message; } };
}

startIconizer();
document.addEventListener('pointerdown', () => startMusic(), { once: true });
wireVoices($('#drawer-body'));
$$('[data-mi]').forEach((b) => b.insertAdjacentHTML('afterbegin', icon(b.dataset.mi)));
initTitle().catch((e) => toast(e.message, true));
window.__app = app;
