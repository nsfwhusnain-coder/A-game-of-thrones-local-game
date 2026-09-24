// Shared UI state and helpers.
import { sigilSrc, bannerURL } from '../sigils.js';
import { portraitURL } from './portrait.js';
import { placeName, getRelation, fmt } from '../shared/world.js';

export const app = {
  saveId: null, state: null, map: null, win: null, winArg: null, sheet: null, drawerTab: 'feed', chatWith: null, council: null,
  busy: false, houseFilter: 'great', chosenHouse: null, peopleFilter: '', picking: null,
};

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export { fmt, placeName, getRelation };

export const REGION_NAMES = { north: 'The North', wall: 'The Wall', beyond: 'Beyond the Wall', iron_islands: 'Iron Islands', riverlands: 'Riverlands', vale: 'The Vale', westerlands: 'Westerlands', crownlands: 'Crownlands', reach: 'The Reach', stormlands: 'Stormlands', dorne: 'Dorne', essos: 'Essos' };
export const RANK_NAMES = { crown: 'The Crown', paramount: 'Great House', major: 'Major House', minor: 'Minor House', city_state: 'Free City', order: 'Sworn Order', tribe: 'Host', exile: 'Exiles', company: 'Sellswords' };

export async function api(path, opts = {}) {
  const res = await fetch('/api' + path, { method: opts.method || (opts.body ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json' }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}
export function toast(msg, err = false) {
  const t = document.createElement('div'); t.className = 'toast' + (err ? ' err' : ''); t.textContent = msg;
  $('#toasts').appendChild(t); setTimeout(() => t.remove(), err ? 9000 : 4500);
}
export const relClass = (v) => (v > 10 ? 'pos' : v < -10 ? 'neg' : 'neu');
export const relHtml = (v) => `<span class="rel ${relClass(v)}">${v > 0 ? '+' : ''}${v}</span>`;
export const sig = (house, size = 1.7) => (house ? `<img class="sig" src="${sigilSrc(house, 48)}" style="width:${size}rem" alt="">` : '');
export const banner = (house, w = 60, h = 90) => (house ? bannerURL(house.sigil, w, h) : '');
export const por = (c, size = 96) => (c ? portraitURL(c, app.state?.houses[c.house], size) : '');
export const player = () => app.state.houses[app.state.meta.player];
export const ruler = () => app.state.characters[player().lord];
export const meter = (v, color = 'var(--gold)', max = 100) => `<div class="meter"><div style="width:${Math.max(0, Math.min(100, (v / max) * 100))}%;background:${color}"></div></div>`;

export function charRow(c, { showHouse = true, extra = '' } = {}) {
  const s = app.state; const h = s.houses[c.house];
  const status = !c.alive ? ' · <span style="color:#e0786a">dead</span>' : c.status && c.status !== 'free' ? ` · <b>${esc(c.status)}</b>` : '';
  return `<div class="row clickable" data-char="${c.id}" style="${c.alive ? '' : 'opacity:0.55'}"><img class="por" src="${por(c, 64)}" alt=""><div class="grow"><div class="title">${esc(c.name)} ${showHouse && h ? sig(h, 1) : ''}</div><div class="sub">${esc(c.title || c.roles.join(', '))} · ${esc(placeName(s, c.loc))}${status}</div></div>${extra}${c.alive && c.id !== s.houses[s.meta.player].lord ? `<button class="btn small" data-talk="${c.id}">Speak</button>` : ''}</div>`;
}
export function houseRow(h, extra = '') {
  const s = app.state, p = s.meta.player;
  const lord = h.lord ? s.characters[h.lord] : null;
  const rel = h.id === p ? '' : relHtml(getRelation(s, p, h.id));
  return `<div class="row clickable" data-house="${h.id}">${sig(h)}<div class="grow"><div class="title">${esc(h.name)}</div><div class="sub">${esc(h.seat ? s.holdings[h.seat]?.name : 'landless')}${lord ? ' · ' + esc(lord.name) : ''}</div></div>${extra}${rel}</div>`;
}
export function armyRow(a) {
  const s = app.state; const h = s.houses[a.owner];
  const cmd = a.commander ? s.characters[a.commander]?.name || a.commander : 'no commander';
  const where = a.at ? placeName(s, a.at) : `marching to ${a.destName || '?'}`;
  return `<div class="row clickable" data-army="${a.id}">${sig(h)}<div class="grow"><div class="title">${a.type === 'fleet' ? '⛵' : '⚔'} ${esc(a.name)}</div><div class="sub">${a.owner === s.meta.player ? '' : '~'}${fmt(a.men)} men${a.ships ? ' · ' + a.ships + ' ships' : ''} · ${esc(cmd)} · ${esc(where)}</div>${meter(a.morale, '#c9a44a')}</div></div>`;
}
export function md(text) {
  const lines = esc(text).split('\n'); let html = ''; let inList = false;
  const inline = (s) => s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/_(.+?)_/g, '<i>$1</i>').replace(/\*(.+?)\*/g, '<i>$1</i>');
  for (const l of lines) {
    const li = l.match(/^\s*[-*] (.*)/);
    if (li) { if (!inList) { html += '<ul>'; inList = true; } html += `<li>${inline(li[1])}</li>`; continue; }
    if (inList) { html += '</ul>'; inList = false; }
    const hh = l.match(/^(#{1,4}) (.*)/);
    if (hh) html += `<h${hh[1].length + 1}>${inline(hh[2])}</h${hh[1].length + 1}>`; else if (l.trim()) html += `<p>${inline(l)}</p>`;
  }
  if (inList) html += '</ul>';
  return html;
}
export function modal(html) {
  $('#modal-box').innerHTML = `<button class="close" data-action="close-modal">✕</button>` + html;
  $('#modal').classList.remove('hidden');
}
export function closeModal() { $('#modal').classList.add('hidden'); }

let saveTimer = null;
export function saveOrders() { clearTimeout(saveTimer); saveTimer = setTimeout(() => api(`/games/${app.saveId}/orders`, { body: { orders: app.state.orders } }).catch((e) => toast(e.message, true)), 300); }
export function addOrder(text) {
  text = String(text || '').trim(); if (!text) return;
  app.state.orders.push({ id: Math.random().toString(36).slice(2, 10), text });
  saveOrders(); app.renderOrders?.();
}
export function sparkline(values, color = '#c9a44a') {
  if (values.length < 2) return '';
  const max = Math.max(...values), min = Math.min(...values), span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${40 - ((v - min) / span) * 36 - 2}`).join(' ');
  return `<svg class="spark" viewBox="0 0 100 40" preserveAspectRatio="none"><polyline fill="none" stroke="${color}" stroke-width="1.5" vector-effect="non-scaling-stroke" points="${pts}"/></svg>`;
}
