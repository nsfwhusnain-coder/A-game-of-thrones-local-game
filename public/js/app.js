import { HOUSES } from '../data/houses.js';
import { MapView } from './map/renderer.js';
import { sigilURL } from './sigils.js';
import {
  dateStr, realmOf, realmTotals, vassalsOf, getRelation, fmt, FIGURE_FIELDS, FIGURE_LABELS, placeName, topLiege,
} from './shared/world.js';

// ───────────────────────── helpers ─────────────────────────
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const REGION_NAMES = { north: 'The North', wall: 'The Wall', beyond: 'Beyond the Wall', iron_islands: 'Iron Islands', riverlands: 'Riverlands', vale: 'The Vale', westerlands: 'Westerlands', crownlands: 'Crownlands', reach: 'The Reach', stormlands: 'Stormlands', dorne: 'Dorne', essos: 'Essos' };
const RANK_NAMES = { crown: 'The Crown', paramount: 'Great House', major: 'Major House', minor: 'Minor House', city_state: 'Free City', order: 'Sworn Order', tribe: 'Host', exile: 'Exiles', company: 'Sellswords' };

async function api(path, opts = {}) {
  const res = await fetch('/api' + path, { method: opts.body ? 'POST' : (opts.method || 'GET'), headers: { 'Content-Type': 'application/json' }, body: opts.body ? JSON.stringify(opts.body) : undefined, ...(opts.method ? { method: opts.method } : {}) });
  const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}
function toast(msg, err = false) {
  const t = document.createElement('div'); t.className = 'toast' + (err ? ' err' : ''); t.textContent = msg;
  $('#toasts').appendChild(t); setTimeout(() => t.remove(), err ? 9000 : 4000);
}
function relClass(v) { return v > 10 ? 'pos' : v < -10 ? 'neg' : 'neu'; }
function relHtml(v) { return `<span class="rel ${relClass(v)}">${v > 0 ? '+' : ''}${v}</span>`; }
function sig(house, size = 26) { return house?.sigil ? `<img class="sig" src="${sigilURL(house.sigil, 48)}" style="width:${size}px" alt="">` : ''; }
function md(text) {
  // tiny markdown renderer for the chronicle
  const lines = esc(text).split('\n'); let html = ''; let inList = false;
  for (const l of lines) {
    const li = l.match(/^\s*[-*] (.*)/);
    if (li) { if (!inList) { html += '<ul>'; inList = true; } html += `<li>${inline(li[1])}</li>`; continue; }
    if (inList) { html += '</ul>'; inList = false; }
    const hh = l.match(/^(#{1,4}) (.*)/);
    if (hh) html += `<h${hh[1].length + 1}>${inline(hh[2])}</h${hh[1].length + 1}>`;
    else if (l.trim()) html += `<p>${inline(l)}</p>`;
  }
  if (inList) html += '</ul>';
  return html;
  function inline(s) { return s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/_(.+?)_/g, '<i>$1</i>').replace(/\*(.+?)\*/g, '<i>$1</i>'); }
}

// ───────────────────────── app state ─────────────────────────
const app = {
  saveId: null, state: null, map: null, leftTab: 'realm', rightTab: 'feed', chatWith: null,
  selectedHolding: null, selectedArmy: null, busy: false, houseFilter: 'great', chosenHouse: null, peopleFilter: '',
};

// ───────────────────────── title screen ─────────────────────────
async function initTitle() {
  $('#title-screen').classList.remove('hidden'); $('#game-screen').classList.add('hidden');
  const scenarios = await api('/scenarios');
  $('#scenario-list').innerHTML = scenarios.map((s) => `<div class="scenario-card"><h3>${esc(s.name)}</h3><div class="words">${esc(s.subtitle)}</div><p>${esc(s.description)}</p></div>`).join('');
  const filters = [['great', 'Great Houses'], ['north', 'North'], ['riverlands', 'Riverlands'], ['vale', 'Vale'], ['westerlands', 'West'], ['reach', 'Reach'], ['stormlands', 'Storm'], ['dorne', 'Dorne'], ['crownlands', 'Crown'], ['iron_islands', 'Iron Is.'], ['wall', 'Wall & Beyond'], ['essos', 'Essos'], ['all', 'All']];
  $('#house-filters').innerHTML = filters.map(([k, n]) => `<button data-f="${k}" class="${k === app.houseFilter ? 'active' : ''}">${n}</button>`).join('');
  $('#house-filters').onclick = (e) => { const f = e.target.dataset.f; if (!f) return; app.houseFilter = f; $$('#house-filters button').forEach((b) => b.classList.toggle('active', b.dataset.f === f)); renderHouseGrid(); };
  $('#house-search').oninput = renderHouseGrid;
  renderHouseGrid();
  renderSaves();
  refreshLLMStatus();
}

function renderHouseGrid() {
  const q = $('#house-search').value.trim().toLowerCase();
  const f = app.houseFilter;
  let list = HOUSES.filter((h) => {
    if (q) return (h.name + ' ' + (h.seat || '') + ' ' + h.region).toLowerCase().includes(q);
    if (f === 'all') return true;
    if (f === 'great') return ['crown', 'paramount'].includes(h.rank) || ['targaryen', 'nights_watch', 'free_folk', 'baratheon_ds', 'frey', 'bolton'].includes(h.id);
    if (f === 'wall') return h.region === 'wall' || h.region === 'beyond';
    return h.region === f;
  });
  $('#house-grid').innerHTML = list.map((h) => `<div class="house-tile ${app.chosenHouse === h.id ? 'selected' : ''}" data-h="${h.id}"><img src="${sigilURL(h.sigil, 48)}" alt=""><div>${esc(h.name)}</div><div class="rank">${RANK_NAMES[h.rank] || h.rank}</div></div>`).join('');
  $('#house-grid').onclick = (e) => { const t = e.target.closest('.house-tile'); if (!t) return; app.chosenHouse = t.dataset.h; renderHouseGrid(); renderHouseDetail(); };
}

function renderHouseDetail() {
  const h = HOUSES.find((x) => x.id === app.chosenHouse); if (!h) return;
  const lieges = HOUSES.find((x) => x.id === h.liege);
  const vassals = HOUSES.filter((x) => x.liege === h.id);
  $('#house-detail').innerHTML = `
    <div class="detail-head"><img src="${sigilURL(h.sigil, 72)}" alt=""><div><h2 style="margin:0">House ${esc(h.name)}</h2><div class="words">${esc(h.words ? '“' + h.words + '”' : '')}</div><div class="muted">${RANK_NAMES[h.rank] || ''} · ${REGION_NAMES[h.region] || h.region}</div></div></div>
    <hr>
    <div class="kv"><span class="k">Seat</span><span>${esc(h.seat || '— (landless)')}</span>
    <span class="k">Liege</span><span>${lieges ? esc(lieges.name) : 'None'}</span>
    <span class="k">Vassals</span><span>${vassals.length ? vassals.map((v) => esc(v.name)).join(', ') : '—'}</span></div>
    <hr>
    <p class="muted" style="font-size:0.9rem">You will play as the head of this house. Every other house, lord, knight and khal is played by your local model. Your numbers are only what your people report to you — ask your steward, maester and captains.</p>
    <button class="btn primary big" id="begin">Begin as House ${esc(h.name)} ▶</button>`;
  $('#begin').onclick = async () => {
    try { const r = await api('/games', { body: { scenario: 'agot_298', house: h.id } }); startGame(r.id, r.state); } catch (e) { toast(e.message, true); }
  };
}

async function renderSaves() {
  const saves = await api('/saves');
  $('#save-list').innerHTML = saves.length ? saves.map((s) => {
    const h = HOUSES.find((x) => x.id === s.player);
    return `<div class="save" data-id="${s.id}">${h ? `<img src="${sigilURL(h.sigil, 32)}" width="28">` : ''}<div><div>${esc(s.playerName)}</div><div class="muted" style="font-size:0.8rem">${esc(s.date)} · turn ${s.turn}</div></div><button class="btn small del" data-del="${s.id}">✕</button></div>`;
  }).join('') : '<div class="muted">No saved games yet.</div>';
  $('#save-list').onclick = async (e) => {
    const del = e.target.dataset.del;
    if (del) { e.stopPropagation(); if (confirm('Delete this save permanently?')) { await api('/games/' + del, { method: 'DELETE' }); renderSaves(); } return; }
    const s = e.target.closest('.save'); if (s) startGame(s.dataset.id);
  };
}

async function refreshLLMStatus() {
  const el = $('#llm-status-title');
  try {
    const cfg = await api('/config');
    if (cfg.provider === 'mock') { el.innerHTML = '<span class="dot mock"></span>Mock mode (no model connected)'; return; }
    el.innerHTML = `<span class="dot"></span>Checking ${esc(cfg.baseUrl)}…`;
    const m = await api('/models');
    el.innerHTML = `<span class="dot ok"></span>Model server online · ${esc(cfg.model || m.models[0] || 'default model')}`;
  } catch (e) {
    el.innerHTML = `<span class="dot bad"></span>Model server unreachable. Start LM Studio / Ollama / llama.cpp, or use mock mode.`;
  }
}

// ───────────────────────── game ─────────────────────────
async function startGame(id, state) {
  app.saveId = id;
  app.state = state || await api('/games/' + id);
  $('#title-screen').classList.add('hidden'); $('#game-screen').classList.remove('hidden');
  if (!app.map) {
    app.map = new MapView($('#map'), {
      onSelect: (hid) => { app.selectedHolding = hid; app.selectedArmy = null; renderSelection(); },
      onSelectArmy: (aid) => { app.selectedArmy = aid; app.selectedHolding = null; renderSelection(); },
      onHover: showTooltip,
    });
    $('#map-loading').classList.remove('hidden');
    await app.map.generate(app.state.holdings, (p, msg) => { $('#map-loading-bar').style.width = Math.round(p * 100) + '%'; $('#map-loading-text').textContent = msg + '…'; });
    $('#map-loading').classList.add('hidden');
  }
  app.map.state = null;
  app.map.setState(app.state);
  renderAll();
}

function renderAll() {
  renderTopbar(); renderLeft(); renderRight(); renderOrders(); renderSelection();
}

function setState(s) { app.state = s; app.map.setState(s); renderAll(); }

function player() { return app.state.houses[app.state.meta.player]; }

function renderTopbar() {
  const s = app.state, h = player();
  const lord = h.lord ? s.characters[h.lord] : null;
  $('#tb-house').innerHTML = `<img src="${sigilURL(h.sigil, 48)}" alt=""><div><div class="name">House ${esc(h.name)}</div><div class="lord">${lord ? esc(lord.name) : ''}</div></div>`;
  $('#tb-house').onclick = () => { app.map.select(h.seat, { fly: true }); app.selectedHolding = h.seat; renderSelection(); };
  const show = ['treasury', 'income', 'levies', 'menAtArms', 'guard', 'ships', 'food'];
  const tot = realmTotals(s, h.id);
  $('#tb-stats').innerHTML = show.map((f) => {
    const x = h.figures[f];
    const suffix = f === 'food' ? ' <small>moons</small>' : f === 'treasury' || f === 'income' ? ' <small>gd</small>' : '';
    const realm = ['levies', 'menAtArms', 'ships'].includes(f) && vassalsOf(s, h.id).length ? `\nWith vassals (their own reports): ~${fmt(tot[f])}` : '';
    return `<div class="stat" title="${esc(FIGURE_LABELS[f])}\nAs of ${esc(x.asOf)} — source: ${esc(x.src)} (${esc(x.confidence)})${esc(realm)}${h.figures.debt?.v ? '\nDebt: ' + fmt(h.figures.debt.v) : ''}"><div class="k">${FIGURE_LABELS[f].replace(/ \(.*\)/, '').replace(' / month', '/moon')}</div><div class="v">${fmt(x.v)}${suffix}</div></div>`;
  }).join('');
  $('#tb-date').innerHTML = `${esc(dateStr(s.meta.date))}<div class="turn">Turn ${s.meta.turn} · ${esc(s.meta.scenarioName)}</div>`;
  const unread = s.ravens.filter((r) => !r.read).length;
  $('#raven-badge').textContent = unread; $('#raven-badge').classList.toggle('hidden', !unread);
}

// ───── left panel ─────
function renderLeft() {
  $$('#left-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === app.leftTab));
  const body = $('#left-body');
  const s = app.state, p = s.meta.player, h = player();
  switch (app.leftTab) {
    case 'realm': {
      const vas = vassalsOf(s, p);
      const holdings = Object.values(s.holdings).filter((x) => x.owner === p);
      const liege = h.liege ? s.houses[h.liege] : null;
      body.innerHTML = `
        <div class="section"><h3>House ${esc(h.name)}</h3>
          <div class="words">${esc(h.words ? '“' + h.words + '”' : '')}</div>
          <div class="kv" style="margin-top:6px"><span class="k">Liege</span><span>${liege ? `${sig(liege, 16)} ${esc(liege.name)}` : 'None — you answer to no one'}</span>
          <span class="k">Realm</span><span>${esc(s.houses[realmOf(s, p)]?.realmName || '')}</span></div></div>
        <div class="section"><h3>Known figures</h3><div class="fig">${FIGURE_FIELDS.map((f) => `<span>${FIGURE_LABELS[f]}</span><b>${fmt(h.figures[f].v)}</b><span class="src">${esc(h.figures[f].src)} · ${esc(h.figures[f].asOf)}</span>`).join('')}</div>
          <p class="muted" style="font-size:0.8rem">These are reports, not certainties. Summon your steward, maester or captain in the Court tab to get fresh counts.</p></div>
        <div class="section"><h3>Holdings (${holdings.length})</h3>${holdings.map((x) => `<div class="row clickable" data-hold="${x.id}"><div class="grow"><div class="title">${esc(x.name)}</div><div class="sub">${esc(x.type.replace('_', ' '))} · unrest ${x.unrest} · prosperity ${x.prosperity}${x.status !== 'normal' ? ' · ' + esc(x.status) : ''}</div></div></div>`).join('')}</div>
        <div class="section"><h3>Sworn Vassals (${vas.length})</h3>${vas.map((v) => houseRow(s.houses[v])).join('') || '<div class="muted">None</div>'}</div>`;
      break;
    }
    case 'court': {
      const chars = Object.values(s.characters).filter((c) => c.house === p);
      const order = ['lord', 'lady', 'heir', 'steward', 'maester', 'master_at_arms', 'captain', 'commander', 'knight', 'family', 'ward', 'bastard'];
      const rank = (c) => Math.min(...c.roles.map((r) => (order.indexOf(r) + 1) || 99));
      chars.sort((a, b) => (b.alive - a.alive) || rank(a) - rank(b));
      body.innerHTML = `<p class="muted" style="font-size:0.85rem">Summon anyone to an audience. Officers know your numbers; lords have their own agendas.</p>` + chars.map((c) => charRow(c)).join('') +
        `<hr><div class="section"><h4>Wards & guests at your seat</h4>${Object.values(s.characters).filter((c) => c.house !== p && c.loc === h.seat && c.alive).map((c) => charRow(c)).join('') || '<div class="muted">None</div>'}</div>`;
      break;
    }
    case 'forces': {
      const mine = Object.values(s.armies).filter((a) => a.owner === p || s.houses[a.owner]?.liege === p);
      const others = Object.values(s.armies).filter((a) => !mine.includes(a));
      body.innerHTML = `<div class="section"><h3>Your hosts & fleets</h3>${mine.map(armyRow).join('') || '<div class="muted">No forces in the field. Order your banners called to raise a host.</div>'}</div>
        <div class="section"><h3>Known forces of the realm</h3>${others.map(armyRow).join('')}</div>`;
      break;
    }
    case 'diplomacy': {
      const wars = s.wars.filter((w) => w.status !== 'ended');
      const pacts = s.pacts.filter((x) => x.status !== 'ended');
      const tops = Object.values(s.houses).filter((x) => x.id !== p && (!x.liege || x.rank === 'paramount' || x.rank === 'crown' || x.independent));
      tops.sort((a, b) => getRelation(s, p, b.id) - getRelation(s, p, a.id));
      body.innerHTML = `
        <div class="section"><h3>Wars</h3>${wars.map((w) => `<div class="row"><div class="grow"><div class="title">${esc(w.name)}</div><div class="sub">${w.attackers.map((x) => esc(s.houses[x]?.name)).join(', ')} ⚔ ${w.defenders.map((x) => esc(s.houses[x]?.name)).join(', ')}</div></div>${w.attackers.includes(p) || w.defenders.includes(p) ? '<span class="pill war">yours</span>' : ''}</div>`).join('') || '<div class="muted">Peace, for now.</div>'}</div>
        <div class="section"><h3>Pacts & Agreements</h3>${pacts.map((x) => `<div class="row"><div class="grow"><div class="title">${esc(x.type)} · ${esc(s.houses[x.a]?.name)} & ${esc(s.houses[x.b]?.name)}</div><div class="sub" title="${esc(x.terms)}">${esc(x.status)} — ${esc(x.terms)}</div></div></div>`).join('') || '<div class="muted">None</div>'}</div>
        <div class="section"><h3>The Great Powers</h3>${tops.map((x) => houseRow(x)).join('')}</div>`;
      break;
    }
    case 'houses': {
      body.innerHTML = `<input class="input" id="house-filter" placeholder="Search houses…" value="${esc(app.houseSearch || '')}"><div id="house-rows" style="margin-top:6px"></div>`;
      const draw = () => {
        const q = (app.houseSearch || '').toLowerCase();
        const list = Object.values(s.houses).filter((x) => !q || (x.name + ' ' + (x.seat ? s.holdings[x.seat]?.name : '') + ' ' + x.region).toLowerCase().includes(q));
        list.sort((a, b) => a.region.localeCompare(b.region) || a.name.localeCompare(b.name));
        let region = '';
        $('#house-rows').innerHTML = list.map((x) => { const head = x.region !== region ? `<h4 style="margin-top:10px">${REGION_NAMES[x.region] || x.region}</h4>` : ''; region = x.region; return head + houseRow(x); }).join('');
      };
      draw();
      $('#house-filter').oninput = (e) => { app.houseSearch = e.target.value; draw(); };
      break;
    }
    case 'people': {
      body.innerHTML = `<input class="input" id="people-filter" placeholder="Search people, houses, titles…" value="${esc(app.peopleFilter)}"><div id="people-rows" style="margin-top:6px"></div>`;
      const draw = () => {
        const q = app.peopleFilter.toLowerCase();
        const list = Object.values(s.characters).filter((c) => !q || `${c.name} ${c.title} ${s.houses[c.house]?.name} ${placeName(s, c.loc)}`.toLowerCase().includes(q));
        list.sort((a, b) => (b.alive - a.alive) || a.name.localeCompare(b.name));
        $('#people-rows').innerHTML = list.slice(0, 250).map((c) => charRow(c, true)).join('');
      };
      draw();
      $('#people-filter').oninput = (e) => { app.peopleFilter = e.target.value; draw(); };
      break;
    }
  }
}

function houseRow(h) {
  const s = app.state, p = s.meta.player;
  const lord = h.lord ? s.characters[h.lord] : null;
  const rel = h.id === p ? '' : relHtml(getRelation(s, p, h.id));
  return `<div class="row clickable" data-house="${h.id}">${sig(h)}<div class="grow"><div class="title">${esc(h.name)}</div><div class="sub">${esc(h.seat ? s.holdings[h.seat]?.name : 'landless')}${lord ? ' · ' + esc(lord.name) : ''}</div></div>${rel}</div>`;
}
function charRow(c, showHouse = false) {
  const s = app.state; const h = s.houses[c.house];
  const status = !c.alive ? ' · <span style="color:#e0786a">dead</span>' : c.status && c.status !== 'free' ? ` · <b>${esc(c.status)}</b>` : '';
  return `<div class="row clickable" data-char="${c.id}" style="${c.alive ? '' : 'opacity:0.5'}">${showHouse ? sig(h, 20) : ''}<div class="grow"><div class="title">${esc(c.name)}</div><div class="sub">${esc(c.title || c.roles.join(', '))} · ${esc(placeName(s, c.loc))}${status}</div></div>${c.alive ? `<button class="btn small" data-talk="${c.id}">Speak</button>` : ''}</div>`;
}
function armyRow(a) {
  const s = app.state; const h = s.houses[a.owner];
  const cmd = a.commander ? s.characters[a.commander]?.name || a.commander : 'no commander';
  const where = a.at ? placeName(s, a.at) : `marching to ${a.destName || '?'}`;
  return `<div class="row clickable" data-army="${a.id}">${sig(h, 22)}<div class="grow"><div class="title">${a.type === 'fleet' ? '⛵' : '⚔'} ${esc(a.name)}</div><div class="sub">${fmt(a.men)} men${a.ships ? ' · ' + a.ships + ' ships' : ''} · ${esc(cmd)} · ${esc(where)}</div><div class="bar-mini" title="morale ${a.morale}"><div style="width:${a.morale}%;background:#c9a44a"></div></div></div></div>`;
}

// delegated clicks for rows everywhere
document.addEventListener('click', (e) => {
  const talk = e.target.closest('[data-talk]');
  if (talk) { e.stopPropagation(); openChat(talk.dataset.talk); return; }
  const hold = e.target.closest('[data-hold]');
  if (hold) { app.selectedHolding = hold.dataset.hold; app.selectedArmy = null; app.map.select(hold.dataset.hold, { fly: true }); renderSelection(); return; }
  const house = e.target.closest('[data-house]');
  if (house && app.state) { const hh = app.state.houses[house.dataset.house]; if (hh.seat) { app.selectedHolding = hh.seat; app.selectedArmy = null; app.map.select(hh.seat, { fly: true }); } else { app.selectedHolding = null; app.selectedHouse = hh.id; } renderSelection(hh.id); return; }
  const army = e.target.closest('[data-army]');
  if (army && app.state) { const a = app.state.armies[army.dataset.army]; if (a) { app.selectedArmy = a.id; app.selectedHolding = null; app.map.selectedArmy = a.id; app.map.flyTo(a.pos); renderSelection(); } return; }
  const ch = e.target.closest('[data-char]');
  if (ch && app.state) { const c = app.state.characters[ch.dataset.char]; const hid = app.state.holdings[c.loc] ? c.loc : null; if (hid) { app.selectedHolding = hid; app.map.select(hid, { fly: true }); renderSelection(); } return; }
  const act = e.target.closest('[data-action]');
  if (act) handleAction(act.dataset.action, act);
});

$('#left-tabs').onclick = (e) => { const t = e.target.dataset.tab; if (t) { app.leftTab = t; renderLeft(); } };
$('#right-tabs').onclick = (e) => { const t = e.target.dataset.tab; if (t) { app.rightTab = t; renderRight(); } };
$('#mapmodes').onclick = (e) => { const m = e.target.dataset.mode; if (!m) return; $$('#mapmodes button').forEach((b) => b.classList.toggle('active', b.dataset.mode === m)); app.map.setMode(m); };

// ───── selection card ─────
function renderSelection(houseOnly) {
  const card = $('#selection-card'); const s = app.state;
  if (app.selectedArmy && s.armies[app.selectedArmy]) {
    const a = s.armies[app.selectedArmy]; const h = s.houses[a.owner];
    const cmd = a.commander ? s.characters[a.commander] : null;
    card.innerHTML = `<button class="close" data-action="close-sel">✕</button>
      <div class="detail-head">${sig(h, 44)}<div><h3 style="margin:0">${a.type === 'fleet' ? '⛵' : '⚔'} ${esc(a.name)}</h3><div class="muted">${esc(h?.name)}</div></div></div><hr>
      <div class="kv"><span class="k">Strength</span><span>${a.owner === s.meta.player ? '' : '~'}${fmt(a.men)} men${a.ships ? `, ${a.ships} ships` : ''}</span>
      <span class="k">Commander</span><span>${cmd ? `${esc(cmd.name)} ${cmd.alive ? `<button class="btn small" data-talk="${cmd.id}">Speak</button>` : '(dead)'}` : '—'}</span>
      <span class="k">Position</span><span>${a.at ? esc(placeName(s, a.at)) : 'en route to ' + esc(a.destName || '?')}</span>
      <span class="k">Status</span><span>${esc(a.status || '')}</span>
      <span class="k">Morale</span><span>${a.morale}</span><span class="k">Supply</span><span>${a.supply}</span>
      <span class="k">Composition</span><span>${esc(a.composition || '')}</span>
      <span class="k">Reported</span><span>${esc(a.asOf || '')}</span></div>
      ${a.owner === s.meta.player ? `<hr><button class="btn" data-action="order-army" data-id="${a.id}">Give orders to this host…</button>` : ''}`;
    card.classList.remove('hidden'); return;
  }
  const hid = app.selectedHolding;
  if (!hid || !s.holdings[hid]) { card.classList.add('hidden'); return; }
  const hd = s.holdings[hid]; const owner = s.houses[hd.owner];
  const lord = owner?.lord ? s.characters[owner.lord] : null;
  const chain = []; let cur = owner; let g = 0; while (cur?.liege && g++ < 6) { cur = s.houses[cur.liege]; if (cur) chain.push(cur); }
  const here = Object.values(s.characters).filter((c) => c.loc === hid && c.alive);
  const armies = Object.values(s.armies).filter((a) => a.at === hid);
  const isMine = hd.owner === s.meta.player;
  const fig = (f) => `${isMine ? '' : '~'}${fmt(owner.figures[f].v)}`;
  card.innerHTML = `<button class="close" data-action="close-sel">✕</button>
    <div class="detail-head">${sig(owner, 48)}<div><h3 style="margin:0">${esc(hd.name)}</h3><div class="muted">${esc(hd.type.replace('_', ' '))} · ${REGION_NAMES[hd.region] || ''}</div></div></div>
    <hr>
    <div class="kv"><span class="k">Held by</span><span><a href="#" data-house="${owner.id}">House ${esc(owner.name)}</a></span>
    ${owner.words ? `<span class="k">Words</span><span class="words">${esc(owner.words)}</span>` : ''}
    <span class="k">Lord</span><span>${lord ? esc(lord.name) + (lord.alive ? '' : ' (dead)') : '—'}</span>
    <span class="k">Sworn to</span><span>${chain.map((c) => esc(c.name)).join(' → ') || 'None'}</span>
    ${owner.id !== s.meta.player ? `<span class="k">Relation</span><span>${relHtml(getRelation(s, s.meta.player, owner.id))}</span>` : ''}
    <span class="k">Status</span><span>${esc(hd.status)}</span>
    <span class="k">Unrest</span><span>${hd.unrest}</span><span class="k">Prosperity</span><span>${hd.prosperity}</span>
    ${hd.garrison != null ? `<span class="k">Garrison</span><span>~${fmt(hd.garrison)}</span>` : ''}</div>
    ${owner.seat === hid ? `<hr><h4>${isMine ? 'Your' : 'Rumoured'} strength of House ${esc(owner.name)}</h4><div class="kv"><span class="k">Levies</span><span>${fig('levies')}</span><span class="k">Men-at-arms</span><span>${fig('menAtArms')}</span><span class="k">Ships</span><span>${fig('ships')}</span><span class="k">Treasury</span><span>${fig('treasury')} gd</span></div>` : ''}
    ${hd.notes.length ? `<hr><h4>Recent</h4>${hd.notes.slice(-4).map((n) => `<div class="muted" style="font-size:0.85rem">${esc(n)}</div>`).join('')}` : ''}
    <hr><h4>People here</h4>${here.map((c) => charRow(c, true)).join('') || '<div class="muted">No one of note.</div>'}
    ${armies.length ? `<hr><h4>Forces here</h4>${armies.map(armyRow).join('')}` : ''}
    <hr><button class="btn" data-action="order-about" data-id="${hid}">Draft an order concerning ${esc(hd.name)}…</button>`;
  card.classList.remove('hidden');
}

function showTooltip(hit, e) {
  const tt = $('#tooltip'); const s = app.state;
  if (!hit || !s) { tt.classList.add('hidden'); return; }
  let html = '';
  if (hit.type === 'army') { const a = s.armies[hit.id]; html = `<b>${esc(a.name)}</b><br>${esc(s.houses[a.owner]?.name)} · ${fmt(a.men)} men${a.ships ? ' · ' + a.ships + ' ships' : ''}<br><span class="muted">${esc(a.status || '')}</span>`; }
  else { const hd = s.holdings[hit.id]; if (!hd) return; const o = s.houses[hd.owner]; const realm = s.houses[realmOf(s, hd.owner)]; html = `<b>${esc(hd.name)}</b><br>House ${esc(o?.name)}${realm && realm.id !== o.id ? `<br><span class="muted">${esc(realm.realmName || realm.name)}</span>` : ''}${hd.status !== 'normal' ? `<br>⚠ ${esc(hd.status)}` : ''}`; }
  tt.innerHTML = html; tt.classList.remove('hidden');
  if (e) { const r = $('#map-wrap').getBoundingClientRect(); tt.style.left = Math.min(r.width - 290, e.clientX - r.left + 14) + 'px'; tt.style.top = (e.clientY - r.top + 14) + 'px'; }
}

// ───── right panel: feed & chat ─────
function renderRight() {
  $$('#right-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === app.rightTab));
  if (app.rightTab === 'chat') return renderChat();
  const s = app.state; const body = $('#right-body');
  const turns = [...s.history].reverse().slice(0, 12);
  const unread = s.ravens.filter((r) => !r.read);
  body.innerHTML = (unread.length ? `<div class="section"><h3>Ravens (${unread.length} unread)</h3>${unread.slice(0, 3).map(ravenHtml).join('')}<button class="btn small" data-action="ravens">Read all letters</button></div>` : '') +
    (turns.length ? turns.map((t) => `<div class="turn-block"><div class="turn-head"><span>Turn ${t.turn}</span><span>${esc(t.date)}</span></div><div class="summary">${esc(t.summary)}</div>${t.events.map(eventHtml).join('')}${t.applied?.length ? `<details class="changes"><summary>${t.applied.length} changes to the world</summary><ul>${t.applied.map((a) => `<li>${esc(a.text)}</li>`).join('')}</ul></details>` : ''}</div>`).join('')
      : `<div class="summary">${esc(s.meta.scenarioName)}</div><p class="muted">Nothing has happened yet. Give your orders below, speak with your people, and advance time when ready.</p>` + introHtml());
  $$('.event[data-where]', body).forEach((el) => el.onclick = () => { const w = el.dataset.where; if (s.holdings[w]) { app.map.flyTo(s.holdings[w].pos); app.map.flash(s.holdings[w].pos); } });
}
function introHtml() {
  return `<div class="event"><div class="et">How to play</div><div class="eb">• <b>Orders</b>: type what your house does in plain language at the bottom — anything from raising armies to secret letters.<br>• <b>Speak</b>: summon any character (Court / People tabs, or click a castle) for an audience or send a raven. Ask your steward how much gold there is — their answer updates your ledger.<br>• <b>Advance</b>: choose how much time passes. The world simulates, reacts, and the map changes.<br>• <b>Chronicle</b> (📜): long-term memory of your story; edit it any time.</div></div>`;
}
function eventHtml(e) {
  return `<div class="event imp-${e.importance}" ${e.where ? `data-where="${e.where}"` : ''}><div class="et">${esc(e.title)}</div><div class="eb">${esc(e.text)}</div><div class="meta">${esc(e.type)}${e.where ? ' · ' + esc(placeName(app.state, e.where)) : ''}</div></div>`;
}
function ravenHtml(r) {
  return `<div class="raven-card ${r.read ? '' : 'unread'}"><div class="from">From ${esc(r.fromName)} · ${esc(r.date)}</div>${esc(r.text)}${r.from ? `<div style="margin-top:6px"><button class="btn small" data-talk="${r.from}">Reply</button></div>` : ''}</div>`;
}

function openChat(charId) {
  app.chatWith = charId; app.rightTab = 'chat'; renderRight();
  setTimeout(() => $('#chat-text')?.focus(), 50);
}

function renderChat() {
  const body = $('#right-body'); const s = app.state;
  const c = app.chatWith ? s.characters[app.chatWith] : null;
  if (!c) {
    const recent = Object.keys(s.chats).map((id) => s.characters[id]).filter(Boolean);
    body.innerHTML = `<p class="muted">Choose someone to speak with from the Court or People tabs, or click a castle on the map.</p>${recent.length ? '<h4>Recent audiences</h4>' + recent.map((x) => charRow(x, true)).join('') : ''}`;
    return;
  }
  const h = s.houses[c.house]; const log = s.chats[c.id] || [];
  const p = s.meta.player; const pLord = s.characters[player().lord];
  const sameplace = pLord && pLord.loc === c.loc;
  const quick = c.house === p ? ['How many men can we field?', 'What is in the treasury?', 'How are the granaries?', 'What news?', 'Your counsel, honestly.'] : ['What do you want?', 'I propose an alliance.', 'Will you trade with us?', 'What news from your lands?'];
  body.innerHTML = `<div class="chat">
    <div class="chat-head">${sig(h, 34)}<div class="grow"><div class="title" style="font-family:var(--display);color:var(--gold2)">${esc(c.name)}</div><div class="sub muted" style="font-size:0.8rem">${esc(c.title || '')} · ${esc(placeName(s, c.loc))}${sameplace ? '' : ' · by raven'}${c.house !== p ? ' · opinion ' + (c.opinion || 0) : ''}</div></div><button class="btn small" data-action="close-chat">✕</button></div>
    <div class="chat-log" id="chat-log">${log.length ? log.map((m) => `<div class="msg ${m.role}"><div class="who">${m.role === 'player' ? 'You' : esc(c.name)} · ${esc(m.date)}</div>${esc(m.text)}${m.applied?.length ? `<div class="applied">${m.applied.map(esc).join('<br>')}</div>` : ''}</div>`).join('') : `<div class="muted" style="font-style:italic">${esc(c.bio || '')}</div>`}</div>
    <div class="quick-asks">${quick.map((q) => `<button data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
    <div class="chat-input"><textarea id="chat-text" rows="3" placeholder="${sameplace ? 'Speak…' : 'Write your letter…'}"></textarea><button class="btn primary" id="chat-send">Send</button></div></div>`;
  const logEl = $('#chat-log'); logEl.scrollTop = logEl.scrollHeight;
  const send = async () => {
    const text = $('#chat-text').value.trim(); if (!text || app.busy) return;
    $('#chat-text').value = '';
    s.chats[c.id] = [...log, { role: 'player', text, date: dateStr(s.meta.date) }];
    renderChat();
    $('#chat-log').insertAdjacentHTML('beforeend', `<div class="msg npc" id="typing"><i>${esc(c.name)} considers…</i></div>`);
    $('#chat-log').scrollTop = 1e9;
    try {
      app.busy = true;
      const r = await api(`/games/${app.saveId}/talk`, { body: { character: c.id, message: text } });
      app.state = r.state; app.map.setState(r.state);
      renderTopbar(); if (app.rightTab === 'chat') renderChat(); renderLeft();
      if (r.applied?.length) toast(r.applied.map((a) => a.text).join(' · '));
    } catch (e) { toast(e.message, true); $('#typing')?.remove(); s.chats[c.id].pop(); }
    finally { app.busy = false; }
  };
  $('#chat-send').onclick = send;
  $('#chat-text').onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };
  $$('.quick-asks button', body).forEach((b) => b.onclick = () => { $('#chat-text').value = b.dataset.q; send(); });
}

// ───── orders ─────
function renderOrders() {
  const s = app.state;
  $('#orders-list').innerHTML = s.orders.length ? s.orders.map((o, i) => `<div class="order"><span class="n">${i + 1}.</span><span class="t" contenteditable="true" data-oid="${o.id}">${esc(o.text)}</span><button data-del-order="${o.id}" title="Remove">✕</button></div>`).join('') : '<div class="orders-empty">No orders yet. Your house will simply watch and wait.</div>';
  $$('[data-del-order]').forEach((b) => b.onclick = () => { s.orders = s.orders.filter((o) => o.id !== b.dataset.delOrder); saveOrders(); renderOrders(); });
  $$('.order .t').forEach((el) => el.onblur = () => { const o = s.orders.find((x) => x.id === el.dataset.oid); if (o) { o.text = el.textContent.trim(); saveOrders(); } });
}
function addOrder(text) {
  text = text.trim(); if (!text) return;
  app.state.orders.push({ id: Math.random().toString(36).slice(2, 10), text });
  saveOrders(); renderOrders();
}
let saveTimer = null;
function saveOrders() { clearTimeout(saveTimer); saveTimer = setTimeout(() => api(`/games/${app.saveId}/orders`, { body: { orders: app.state.orders } }).catch((e) => toast(e.message, true)), 300); }
$('#order-input').onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addOrder(e.target.value); e.target.value = ''; } };

// ───── busy overlay ─────
let busyTimer = null;
function busy(on, text) {
  app.busy = on; $('#busy').classList.toggle('hidden', !on);
  clearInterval(busyTimer);
  if (on) {
    $('#busy-text').textContent = text; const t0 = Date.now();
    const lines = ['Ravens take wing…', 'Lords confer in their solars…', 'Hosts march along the kingsroad…', 'Coin changes hands in the shadows…', 'The maesters scratch at their ledgers…', 'Whispers pass through the Red Keep…'];
    busyTimer = setInterval(() => { const sec = Math.round((Date.now() - t0) / 1000); $('#busy-time').textContent = `${sec}s — ${lines[Math.floor(sec / 6) % lines.length]}`; }, 1000);
  }
}

// ───── actions ─────
async function handleAction(action, el) {
  const s = app.state;
  switch (action) {
    case 'add-order': addOrder($('#order-input').value); $('#order-input').value = ''; break;
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
    case 'chronicle': return showChronicle();
    case 'ravens': {
      modal(`<h2>Letters</h2>${s.ravens.map(ravenHtml).join('') || '<p class="muted">No ravens have come.</p>'}`);
      if (s.ravens.some((r) => !r.read)) { const r = await api(`/games/${app.saveId}/ravens/read`, { body: {} }); s.ravens = r.ravens; renderTopbar(); renderRight(); }
      break;
    }
    case 'undo': {
      if (!confirm('Undo the last turn? The world will return to how it was before you advanced.')) return;
      try { const st = await api(`/games/${app.saveId}/undo`, { body: {} }); setState(st); toast('The last turn has been undone.'); } catch (e) { toast(e.message, true); }
      break;
    }
    case 'settings': return showSettings();
    case 'menu': app.state = null; app.map.state = null; initTitle(); break;
    case 'close-sel': app.selectedHolding = null; app.selectedArmy = null; app.map.select(null); app.map.selectedArmy = null; renderSelection(); break;
    case 'close-chat': app.chatWith = null; renderChat(); break;
    case 'close-modal': $('#modal').classList.add('hidden'); break;
    case 'order-about': { const hd = s.holdings[el.dataset.id]; $('#order-input').value = `Regarding ${hd.name}: `; $('#order-input').focus(); break; }
    case 'order-army': { const a = s.armies[el.dataset.id]; $('#order-input').value = `${a.name} is to `; $('#order-input').focus(); break; }
  }
}

async function advance() {
  if (app.busy) return;
  const pending = $('#order-input').value.trim(); if (pending) { addOrder(pending); $('#order-input').value = ''; }
  const span = $('#span-select').value;
  busy(true, `The world moves forward ${$('#span-select').selectedOptions[0].text}…`);
  try {
    const r = await api(`/games/${app.saveId}/advance`, { body: { span, orders: app.state.orders } });
    setState(r.state);
    app.rightTab = 'feed'; renderRight();
    showTurnReport(r.turn);
    for (const e of r.turn.events) if (e.where && r.state.holdings[e.where]) app.map.flash(r.state.holdings[e.where].pos, e.importance >= 4 ? '#ff6a4a' : '#ffd76a');
    if (r.turn.rejected?.length) console.warn('Rejected changes', r.turn.rejected);
  } catch (e) { toast(e.message, true); }
  finally { busy(false); }
}

function showTurnReport(t) {
  modal(`<h2>${esc(t.dateFrom)} → ${esc(t.date)}</h2>
    <div class="summary">${esc(t.summary)}</div><hr>
    <div class="report-events">${t.events.map(eventHtml).join('')}</div>
    ${t.applied?.length ? `<hr><h4>The world changes</h4><ul class="changes">${t.applied.map((a) => `<li>${esc(a.text)}</li>`).join('')}</ul>` : ''}
    ${t.rejected?.length ? `<p class="muted" style="font-size:0.8rem">${t.rejected.length} proposed change(s) could not be applied (unknown names) — see the browser console.</p>` : ''}
    <div class="settings-actions"><button class="btn primary" data-action="close-modal">Continue</button></div>`);
}

function modal(html) {
  $('#modal-box').innerHTML = `<button class="close" data-action="close-modal">✕</button>` + html;
  $('#modal').classList.remove('hidden');
}
$('#modal').onclick = (e) => { if (e.target.id === 'modal') $('#modal').classList.add('hidden'); };
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('#modal').classList.add('hidden'); });

async function showChronicle() {
  const r = await api(`/games/${app.saveId}/chronicle`);
  modal(`<h2>The Chronicle</h2><p class="muted" style="font-size:0.85rem">Long-term memory. Every few turns the maesters compress older events into this record (it lives in <code>saves/${esc(app.saveId)}/chronicle.md</code>). The simulator reads it every turn — edit it to correct or steer the story.</p>
    <div class="md" id="chron-view">${md(r.text)}</div>
    <textarea class="chronicle-edit hidden" id="chron-edit">${esc(r.text)}</textarea>
    <div class="settings-actions"><button class="btn" id="chron-toggle">Edit</button><button class="btn hidden" id="chron-save">Save</button><button class="btn ghost" id="chron-consolidate">Consolidate now</button></div>`);
  $('#chron-toggle').onclick = () => { $('#chron-view').classList.toggle('hidden'); $('#chron-edit').classList.toggle('hidden'); $('#chron-save').classList.toggle('hidden'); };
  $('#chron-save').onclick = async () => { await api(`/games/${app.saveId}/chronicle`, { body: { text: $('#chron-edit').value } }); toast('Chronicle saved.'); showChronicle(); };
  $('#chron-consolidate').onclick = async () => { busy(true, 'The archmaester writes…'); try { await api(`/games/${app.saveId}/consolidate`, { body: {} }); app.state = await api('/games/' + app.saveId); showChronicle(); } catch (e) { toast(e.message, true); } finally { busy(false); } };
}

async function showSettings() {
  const c = await api('/config');
  const presets = [['LM Studio', 'http://localhost:1234/v1'], ['Ollama', 'http://localhost:11434/v1'], ['llama.cpp', 'http://localhost:8080/v1'], ['KoboldCpp', 'http://localhost:5001/v1'], ['text-gen-webui', 'http://localhost:5000/v1'], ['vLLM', 'http://localhost:8000/v1']];
  modal(`<h2>Model Settings</h2>
    <p class="muted" style="font-size:0.9rem">Any OpenAI-compatible server works. Load a capable instruct model (larger is better — the simulator must juggle hundreds of names and output JSON). Set the context size to match what your server was started with.</p>
    <div class="grid2">
      <div><label>Provider</label><select class="input" id="cfg-provider"><option value="openai">OpenAI-compatible (local server)</option><option value="mock">Mock (no model, for testing)</option></select></div>
      <div><label>Model name <span class="muted">(blank = server default)</span></label><input class="input" id="cfg-model" list="model-list" value="${esc(c.model)}"><datalist id="model-list"></datalist></div>
      <div style="grid-column:1/-1"><label>Server URL</label><input class="input" id="cfg-url" value="${esc(c.baseUrl)}"><div class="presets">${presets.map(([n, u]) => `<button class="btn small" data-url="${u}">${n}</button>`).join('')}</div></div>
      <div><label>API key <span class="muted">(usually blank)</span></label><input class="input" id="cfg-key" value="${esc(c.apiKey)}"></div>
      <div><label>Context window (tokens)</label><input class="input" id="cfg-ctx" type="number" value="${c.contextTokens}"></div>
      <div><label>Max response tokens</label><input class="input" id="cfg-max" type="number" value="${c.maxTokens}"></div>
      <div><label>Temperature</label><input class="input" id="cfg-temp" type="number" step="0.05" value="${c.temperature}"></div>
      <div><label>Consolidate memory every N turns</label><input class="input" id="cfg-cons" type="number" value="${c.consolidateEvery}"></div>
      <div><label>Recent turns kept verbatim</label><input class="input" id="cfg-keep" type="number" value="${c.keepRecentTurns}"></div>
      <div><label>Request timeout (seconds)</label><input class="input" id="cfg-timeout" type="number" value="${c.timeoutSec}"></div>
      <div><label><input type="checkbox" id="cfg-json" ${c.jsonMode ? 'checked' : ''}> Force JSON mode (response_format)</label></div>
      <div style="grid-column:1/-1"><label>Extra request parameters (JSON, e.g. {"top_p":0.9,"min_p":0.05,"num_ctx":65536})</label><input class="input" id="cfg-extra" value="${esc(JSON.stringify(c.extraBody || {}))}"></div>
    </div>
    <div class="settings-actions"><button class="btn primary" id="cfg-save">Save</button><button class="btn" id="cfg-test">Test connection</button><button class="btn ghost" id="cfg-models">Fetch models</button></div>
    <div id="cfg-result" class="muted" style="margin-top:10px;white-space:pre-wrap;font-size:0.85rem"></div>`);
  $('#cfg-provider').value = c.provider;
  $$('[data-url]').forEach((b) => b.onclick = () => { $('#cfg-url').value = b.dataset.url; });
  const collect = () => {
    let extra = {}; try { extra = JSON.parse($('#cfg-extra').value || '{}'); } catch { toast('Extra parameters are not valid JSON', true); }
    return { provider: $('#cfg-provider').value, model: $('#cfg-model').value.trim(), baseUrl: $('#cfg-url').value.trim(), apiKey: $('#cfg-key').value, contextTokens: Number($('#cfg-ctx').value), maxTokens: Number($('#cfg-max').value), temperature: Number($('#cfg-temp').value), consolidateEvery: Number($('#cfg-cons').value), keepRecentTurns: Number($('#cfg-keep').value), timeoutSec: Number($('#cfg-timeout').value), jsonMode: $('#cfg-json').checked, extraBody: extra };
  };
  $('#cfg-save').onclick = async () => { await api('/config', { body: collect() }); toast('Settings saved.'); refreshLLMStatus(); };
  $('#cfg-test').onclick = async () => {
    await api('/config', { body: collect() });
    $('#cfg-result').textContent = 'Testing…';
    try { const r = await api('/llm/test', { body: {} }); $('#cfg-result').textContent = `✔ Connected (${r.ms} ms, ${r.model || 'model'})\n${r.text}`; } catch (e) { $('#cfg-result').textContent = '✖ ' + e.message; }
    refreshLLMStatus();
  };
  $('#cfg-models').onclick = async () => {
    await api('/config', { body: collect() });
    try { const r = await api('/models'); $('#model-list').innerHTML = r.models.map((m) => `<option value="${esc(m)}">`).join(''); $('#cfg-result').textContent = 'Models: ' + r.models.join(', '); } catch (e) { $('#cfg-result').textContent = '✖ ' + e.message; }
  };
}

initTitle().catch((e) => toast(e.message, true));
window.__app = app; // for debugging in the console
