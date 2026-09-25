// Shared UI state and helpers.
import { sfx } from './sfx.js';
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

// each kind of order has its sound: steel for the host, coin for the treasury, wax for decisions
const ACT_SOUND = { raise: 'steel', call_banners: 'steel', march: 'steel', disband: 'steel', tax: 'coins', dues: 'coins', project: 'coins', cancel_project: 'coins', grant: 'coins', decide: 'seal', appoint: 'seal' };
export async function api(path, opts = {}) {
  const res = await fetch('/api' + path, { method: opts.method || (opts.body ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json' }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok) { if (opts.body) sfx('error'); throw new Error(data.error || `HTTP ${res.status}`); }
  if (path.endsWith('/act') && ACT_SOUND[opts.body?.kind]) sfx(ACT_SOUND[opts.body.kind]);
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

// ── Display: UI scale and the player's house colours ──
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };
export function uiScale() { return Number(store.get('ui-scale')) || 1; }
export function setUiScale(v) { store.set('ui-scale', String(v)); document.documentElement.style.setProperty('--ui-scale', String(v)); }
export function houseTheming() { return store.get('house-theme') !== 'off'; }
export function setHouseTheming(on) { store.set('house-theme', on ? 'on' : 'off'); }
setUiScale(uiScale());

function hexToHsl(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return null;
  const n = parseInt(m[1], 16); const r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0; const l = (mx + mn) / 2;
  if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; }
  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
}
const THEME_VARS = ['--bg', '--panel', '--panel-solid', '--panel2', '--line', '--line2', '--gold', '--gold2', '--muted', '--red', '--accent'];
/** Tint the whole interface in a house's colours (Stark steel-blue, Lannister crimson…). Pass null for the default gold. */
// The colours each great house wears (from the books' heraldry): panels take the house hue,
// buttons its main colour, highlights its metal.
const THEMES = {
  stark: { hue: 212, sat: 30, primary: '#2f5f95', metal: '#c9d6e4' },        // grey direwolf on ice-white: Stark blues and silver
  baratheon: { hue: 42, sat: 30, primary: '#b8861a', metal: '#f2cc55', onPrimary: '#1a1206' }, // black stag on gold
  baratheon_se: { hue: 42, sat: 30, primary: '#b8861a', metal: '#f2cc55', onPrimary: '#1a1206' },
  baratheon_ds: { hue: 20, sat: 34, primary: '#b8861a', metal: '#f2a040', onPrimary: '#1a1206' }, // Stannis: the stag in the fiery heart
  lannister: { hue: 0, sat: 45, primary: '#a01c1c', metal: '#e8c050' },      // golden lion on crimson
  tully: { hue: 215, sat: 38, primary: '#2b5aa0', metal: '#e0a0a0', accent: '#a02828' }, // silver trout on blue and red
  arryn: { hue: 208, sat: 42, primary: '#3f78b8', metal: '#eef4fb' },        // moon-and-falcon, white on sky blue
  tyrell: { hue: 110, sat: 34, primary: '#3a7a2c', metal: '#e8c848' },       // golden rose on green
  martell: { hue: 22, sat: 50, primary: '#c24e18', metal: '#f2b040' },       // red sun pierced by a golden spear
  greyjoy: { hue: 150, sat: 12, primary: '#7a5f1a', metal: '#e6c24a' },      // golden kraken on black
  targaryen: { hue: 0, sat: 30, primary: '#9a1616', metal: '#e0463a' },      // red three-headed dragon on black
  nights_watch: { hue: 220, sat: 6, primary: '#3a3d44', metal: '#d0d4dc' },  // black
  free_folk: { hue: 30, sat: 12, primary: '#5a4a3a', metal: '#d8c8b0' },
  bolton: { hue: 350, sat: 36, primary: '#8e2436', metal: '#f0a8b4' },       // flayed man, red on pink
  frey: { hue: 215, sat: 16, primary: '#4c5c74', metal: '#c8d0dc' },        // two grey towers on blue
  hightower: { hue: 30, sat: 10, primary: '#6a6a6a', metal: '#f4ecd8' },
  redwyne: { hue: 330, sat: 34, primary: '#7a1e44', metal: '#e8c050' },
  velaryon: { hue: 190, sat: 36, primary: '#2a6a7a', metal: '#dde8ea' },
  tarth: { hue: 330, sat: 30, primary: '#b0406a', metal: '#b8d0f0' },
  mormont: { hue: 110, sat: 22, primary: '#3a5a34', metal: '#d8d8c8' },
  umber: { hue: 25, sat: 30, primary: '#6a3e22', metal: '#e8d8c0' },
  manderly: { hue: 175, sat: 34, primary: '#2a7a72', metal: '#e8f0ec' },
};
export function applyHouseTheme(house) {
  const root = document.documentElement.style;
  const color = house?.color;
  const T = house && houseTheming() ? THEMES[house.id] : null;
  if (T) {
    const set = (k, v) => root.setProperty(k, v); const { hue: h, sat: s } = T;
    set('--bg', `hsl(${h} ${Math.round(s * 0.7)}% 5%)`);
    set('--panel', `hsla(${h} ${Math.round(s * 0.7)}% 8% / 0.95)`);
    set('--panel-solid', `hsl(${h} ${Math.round(s * 0.7)}% 8%)`);
    set('--panel2', `hsl(${h} ${Math.round(s * 0.8)}% 13%)`);
    set('--line', `color-mix(in srgb, ${T.primary} 45%, #1a1a1a)`);
    set('--line2', `color-mix(in srgb, ${T.primary} 70%, #2a2a2a)`);
    set('--gold', `color-mix(in srgb, ${T.metal} 85%, ${T.primary})`);
    set('--gold2', T.metal);
    set('--muted', `hsl(${h} 12% 68%)`);
    set('--red', T.primary);
    set('--on-primary', T.onPrimary || '#fff8ea');
    set('--accent', T.accent || T.primary);
    return;
  }
  const hsl = color && houseTheming() ? hexToHsl(color) : null;
  if (!hsl) { for (const v of [...THEME_VARS, '--on-primary']) root.removeProperty(v); return; }
  root.removeProperty('--on-primary');
  const [h, s0] = hsl; const s = Math.max(28, Math.min(70, s0 < 20 ? s0 + 22 : s0)); // grey houses still get a hue
  const set = (k, v) => root.setProperty(k, v);
  set('--bg', `hsl(${h} ${Math.round(s * 0.35)}% 5%)`);
  set('--panel', `hsla(${h} ${Math.round(s * 0.35)}% 8% / 0.94)`);
  set('--panel-solid', `hsl(${h} ${Math.round(s * 0.35)}% 8%)`);
  set('--panel2', `hsl(${h} ${Math.round(s * 0.35)}% 12%)`);
  set('--line', `hsl(${h} ${Math.round(s * 0.5)}% 26%)`);
  set('--line2', `hsl(${h} ${Math.round(s * 0.55)}% 38%)`);
  // highlights take the metal of the sigil (the Lannister lion's gold, the Stark direwolf's grey-white)
  const cands = [house.sigil?.f, house.sigil?.cc].map(hexToHsl).filter(Boolean);
  const metal = cands.sort((a, b) => Math.min(Math.abs(b[0] - h), 360 - Math.abs(b[0] - h)) * (b[1] / 100 + 0.2) - Math.min(Math.abs(a[0] - h), 360 - Math.abs(a[0] - h)) * (a[1] / 100 + 0.2))[0];
  const [mh, ms] = metal && (metal[1] > 25 || metal[2] > 70) ? metal : [h, Math.round(s * 0.5)];
  set('--gold', `hsl(${mh} ${Math.min(70, ms)}% 62%)`);
  set('--gold2', `hsl(${mh} ${Math.min(60, Math.round(ms * 0.8))}% 83%)`);
  set('--muted', `hsl(${h} 14% 64%)`);
  set('--red', `hsl(${h} ${Math.min(75, s + 10)}% 36%)`);
  set('--accent', color);
}
