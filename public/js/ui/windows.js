// Side windows & detail sheets (CK3-style panels).
import { app, $, $$, esc, fmt, placeName, getRelation, api, doVerb, toast, relHtml, sig, banner, por, player, ruler, meter, charRow, houseRow, armyRow, addOrder, modal, closeModal, confirmModal, sparkline, REGION_NAMES, RANK_NAMES } from './common.js';
import { FIGURE_LABELS, realmOf, realmTotals, vassalsOf, childrenOf, siblingsOf, dateStr } from '../shared/world.js';
import { whereabouts } from '../shared/roads.js';
import { standing, standingWord } from '../shared/standing.js';
import { regencyLine } from '../shared/regency.js';
import { unitsText } from '../shared/units.js';
import { liveRules } from '../shared/rules.js';
import { project, PROJECT_TEMPLATES, RESOURCES, TAX_LEVELS, SEASONS, tradeModifier } from '../shared/economy.js';
import { SKILL_NAMES, SKILL_ICONS } from '../../data/families.js';
import { vassalTemper } from '../shared/vassals.js';
import { disposition } from '../shared/diplomacy.js';
import { atWar, battleOdds, marchDays, siegeEstimate } from '../shared/warfare.js';
import { THREADS, THREATS } from '../shared/plots.js';
import { sfx } from './sfx.js';
import { temperament, natureTags } from '../shared/temperament.js';
import { viewOfArmies, ageText } from '../engine/knowledge.js';
import { DEMEANOURS } from '../../data/demeanours.js';
import { profileFor, VOICE_CHOICES, voiceSettings, setVoiceSetting, speak, stopSpeaking } from './voice.js';
import { forces, partyOf, placeOf, membersOf, together, statusText, sworn } from '../engine/parties.js';
import { daysLeft } from '../engine/movement.js';
import { guestsAt } from '../shared/retinues.js';
import { musterOf } from '../engine/military/muster.js';
import { supplyOf, supplyText, provinceOf } from '../engine/military/supply.js';
import { STANDING } from '../engine/military/battle.js';
import { hullsOf, capacityOf, carriedOf, aboardOf } from '../engine/military/naval.js';
import { TERMS, fortOf, siegeView, garrisonOf } from '../engine/military/siege.js';
import { FORTRESS } from '../../data/fortresses.js';
import { COMPANIES } from '../../data/companies.js';
import { GOALS, sideOf, scoreFor, leaderOf } from '../engine/politics/war.js';
import { dayNumber, dateOfDay } from '../engine/time.js';
import { renderLedger, wireLedger } from './realm.js';

import { TABS, tabTarget } from './hud.js';
import { peopleSections, conditionOf } from './people.js';
import { treeOf, treeHtml } from './tree.js';
import { promiseBookHtml } from './promises.js';
import { rememberOpener, restoreOpener } from './opener.js';
import { icon } from './icons.js';

// Two windows, each with tabs (GDD 17 §4 U4): the Realm (the State of the Realm, your house, the hosts, the treasury, the dealings of the houses) and
// People (the household and court, the council, the shadows). What were six windows are tabs of these, unchanged inside; the old keys and the old
// window names still land where they did (ui/hud.js tabTarget). The map's cards (ui/card.js) take the reading of one castle or host; these are
// for the reading of the realm. A window is one panel: opening a sheet or a card puts it away, and the sheet says how to come back.
const TITLES = { realm: 'Realm', people: 'People' };
const VIEWS = { 'realm/ledger': realmWindow, 'realm/house': realm, 'realm/hosts': military, 'realm/coin': economy, 'realm/courts': diplomacy, 'people/people': people, 'people/council': council, 'people/shadows': intrigue };
const WIRES = { 'realm/ledger': null, 'realm/hosts': 'military', 'realm/coin': 'economy', 'people/people': 'people', 'people/council': 'council', 'people/shadows': 'intrigue' };
const tabLabel = (door, tab) => TABS[door]?.find((t) => t.id === tab)?.label || '';
export function openWindow(name, arg) {
  const { door, tab } = tabTarget(name, arg);
  if (app.win === door && (tab == null || app.tab === tab)) return closeWindow();
  app.closeCard?.(); if (app.sheet) closeSheet();
  app.back = null;
  if (!app.win) rememberOpener('window');
  const first = app.win !== door;
  app.win = door; app.tab = tab || (first ? TABS[door][0].id : app.tab); app.winArg = arg; sfx('open');
  if (door === 'realm' && app.tab === 'ledger') app.coachDone?.('realm');
  $('#window').classList.remove('hidden');
  $('#window').setAttribute('aria-hidden', 'false');
  renderWindow();
}
export function closeWindow(quiet = false) { const was = app.win; if (app.win && !quiet) sfx('close'); app.win = null; wideWindow(false); $('#window').classList.add('hidden'); $('#window').setAttribute('aria-hidden', 'true'); if (was && !quiet) restoreOpener('window'); }
export function renderWindow() {
  if (!app.win || !app.state) return;
  const body = $('#win-body'); const key = `${app.win}/${app.tab}`;
  wideWindow(key === 'realm/ledger');
  $('#win-title').textContent = TITLES[app.win] || app.win;
  const tabs = `<div class="wc-tabs win-tabs" role="tablist" aria-label="${TITLES[app.win]}">${TABS[app.win].map((t) => `<button class="wc-tab" role="tab" data-win-tab="${t.id}" aria-selected="${t.id === app.tab}" title="${esc(t.hint)}">${esc(t.label)}</button>`).join('')}</div>`;
  body.innerHTML = `${tabs}<div class="tab-body" id="tab-body" data-tab="${app.tab}">${(VIEWS[key] || (() => ''))()}</div>`;
  const inner = $('#tab-body', body);
  if (key === 'realm/ledger') { const root = $('#realm-body', inner); if (root) { wireLedger(root); renderLedger(root); } }
  else if (WIRES[key]) wire[WIRES[key]]?.(inner);
}
// The ledger is a wide page (docs/gdd/19 §6.2); the windows beside it and the map's chip make room for it
function wideWindow(on) { $('#window').classList.toggle('wide', on); document.body.classList.toggle('wide-window', on); }
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-win-tab]'); if (!t || !app.win) return;
  if (app.tab !== t.dataset.winTab) { app.tab = t.dataset.winTab; sfx('open'); renderWindow(); }
});

// ───────────── Realm ─────────────
// The Realm door opens the State of the Realm (ui/realm.js); the house's own page, as it was, is the "Your house" tab
function realmWindow() { return '<div id="realm-body" class="realm-body"></div>'; }
function realm() {
  const s = app.state, p = s.meta.player, h = player();
  const liege = h.liege ? s.houses[h.liege] : null;
  const tot = realmTotals(s, p);
  const vas = vassalsOf(s, p);
  const holdings = Object.values(s.holdings).filter((x) => x.owner === p);
  const pop = holdings.reduce((a, x) => a + x.population, 0);
  return `
    <div class="detail-hero"><img class="banner" src="${banner(h, 80, 120)}" alt=""><div>
      <h2>House ${esc(h.name)}</h2><div class="words">${esc(h.words ? '“' + h.words + '”' : '')}</div>
      <div class="muted">${esc(h.title || RANK_NAMES[h.rank])} · ${REGION_NAMES[h.region] || ''}</div>
      <div class="muted">Sworn to: ${liege ? `<a href="#" data-house="${liege.id}">${esc(liege.name)}</a>` : '<b>no one</b>'}</div>
      ${regencyLine(s, p) ? `<div class="muted">⚖ ${esc(regencyLine(s, p))}</div>` : ''}</div></div>
    ${standingPanel(s, p)}
    <div class="stat-grid">
      <div class="s"><div class="k">Smallfolk</div><div class="v">~${fmt(Math.round(pop / 1000))}k</div></div>
      <div class="s"><div class="k">Realm levies</div><div class="v">~${fmt(tot.levies)}</div></div>
      <div class="s"><div class="k">Men-at-arms</div><div class="v">~${fmt(tot.menAtArms)}</div></div>
      <div class="s"><div class="k">Ships</div><div class="v">~${fmt(tot.ships)}</div></div>
      <div class="s"><div class="k">Vassals</div><div class="v">${vas.length}</div></div>
      <div class="s"><div class="k">Holdings</div><div class="v">${holdings.length}</div></div>
    </div>
    <div class="section"><h4>Hold court</h4><div class="row-actions"><button class="btn" data-court="feast" title="Your sworn lords feast at your table: their loyalty rises. ~${fmt(1200 + vassalsOf(s, s.meta.player).length * 150)} dragons.">🍷 Hold a feast</button><button class="btn" data-court="tourney" title="Knights of the realm break lances for your purses: goodwill and glory, and sometimes blood. 5,000 dragons.">🏇 Hold a tourney</button></div></div>
    <div class="section"><h4>Your holdings</h4>${holdings.map((x) => `<div class="row clickable" data-hold="${x.id}"><div class="grow"><div class="title">${esc(x.name)} ${x.status !== 'normal' ? `<span class="pill bad">${esc(x.status)}</span>` : ''}</div>
      <div class="sub">~${fmt(x.population)} souls · walls ${'■'.repeat(x.fort || 0)}${'□'.repeat(Math.max(0, 5 - (x.fort || 0)))} · ${Object.entries(x.resources || {}).filter(([, v]) => v >= 0.5).map(([k]) => RESOURCES[k]?.icon || '').join(' ')}</div>
      <div style="display:flex;gap:0.5rem"><div style="flex:1" title="Prosperity ${x.prosperity}">${meter(x.prosperity, '#7fb85a')}</div><div style="flex:1" title="Unrest ${x.unrest}">${meter(x.unrest, '#d0604a')}</div></div></div>${x.id !== h.seat && vas.length ? `<button class="btn small" data-grant="${x.id}">Grant…</button>` : ''}</div>`).join('')}</div>
    <div class="section"><h4>Sworn vassals</h4>${vas.map((v) => vassalRow(s.houses[v])).join('') || '<div class="muted">None.</div>'}</div>`;
}
// Where the house stands in the realm, in the five measures the campaign is finally scored on. This is the
// player's answer to "am I actually winning?", which the game could not previously tell them at all.
function standingPanel(s, p) {
  const st = standing(s, p); if (!st) return '';
  const bars = [
    ['Lands', st.lands, '#7fb85a', `${st.holdings} holdings`],
    ['Swords', st.might, '#c0604a', `~${fmt(st.swords)} men`],
    ['Gold', st.wealth, '#c9a44a', `${fmt(st.gold)} net`],
    ['Sway', st.sway, '#7a9fd0', `${st.vassals} sworn houses`],
    ['Blood', st.blood, '#b07ec0', `${st.kin} living kin`],
    ['Order', st.order, '#8fbfa8', 'prosperity less unrest'],
  ];
  return `<div class="section standing">
    <h4>The standing of the house</h4>
    <div class="standing-score" title="A weighted measure of lands, swords, gold, sway, blood and good order. It is what the chronicle scores at the end.">
      <b>${st.score}</b><span>/100 — ${esc(standingWord(st))}</span></div>
    <div class="standing-bars">${bars.map(([k, v, c, sub]) => `<div class="sb" title="${esc(sub)}"><div class="sb-k">${k}</div>${meter(v, c)}<div class="sb-v">${v}</div></div>`).join('')}</div>
  </div>`;
}

function obligationPills(v) {
  const t = v.obligations?.tribute || 'paying', l = v.obligations?.levies || 'not_called';
  const tc = t === 'paying' ? 'good' : ['late', 'reduced', 'forgiven'].includes(t) ? 'warn' : 'bad';
  const lc = l === 'answered' ? 'good' : l === 'called' || l === 'delayed' ? 'warn' : l === 'refused' ? 'bad' : '';
  return `<span class="pill ${tc}" title="Tribute">🪙 ${esc(t)}</span><span class="pill ${lc}" title="Levies">⚔ ${esc(l.replace('_', ' '))}</span>`;
}
function temperWord(t) {
  if (t == null) return '';
  const [w, c] = t >= 70 ? ['devoted', '#a8e08a'] : t >= 50 ? ['dutiful', '#cfe0a0'] : t >= 35 ? ['wavering', '#e8c870'] : t >= 20 ? ['resentful', '#ec9a8a'] : ['near rebellion', '#ff6a5a'];
  return `<span style="color:${c}" title="Temper ${t}/100: how willingly this house serves. Loyalty of its lord, friendship with you, your taxes, and its own troubles.">${w}</span>`;
}
function vassalRow(v) {
  const s = app.state; const lord = v.lord ? s.characters[v.lord] : null;
  return `<div class="row clickable" data-house="${v.id}">${sig(v)}<div class="grow"><div class="title">${esc(v.name)}</div><div class="sub">${lord ? esc(lord.name) : '—'} · levies ~${fmt(v.figures.levies.v)} · ${temperWord(vassalTemper(s, v.id))}</div><div>${obligationPills(v)}</div></div>${relHtml(getRelation(s, s.meta.player, v.id))}</div>`;
}

// ───────────── Council ─────────────
const SEATS = [
  ['steward', 'Steward', 'Keeps the ledgers, granaries and stores'], ['maester', 'Maester', 'Ravens, healing, lore and counsel'],
  ['master_at_arms', 'Master-at-arms', 'Trains and counts your fighting men'], ['captain', 'Captain of the guard', 'Commands the household guard'],
  ['commander', 'Commander', 'Leads hosts in the field'], ['spymaster', 'Master of whisperers', 'Secrets, spies and plots'],
  ['castellan', 'Castellan', 'Holds your seat when you are away'],
];
function councilMembers() {
  const s = app.state, p = s.meta.player;
  const mine = Object.values(s.characters).filter((c) => c.alive && c.house === p && c.id !== player().lord);
  const onCouncil = Object.values(s.characters).filter((c) => c.alive && c.roles.includes('council') && s.houses[c.house] && (c.house === p || realmOf(s, c.house) === p || (p === 'baratheon' && placeOf(s, c) === 'baratheon')));
  const seats = SEATS.map(([role, label, desc]) => ({ role, label, desc, c: mine.find((c) => c.roles.includes(role)) || (role === 'spymaster' ? onCouncil.find((c) => c.roles.includes('spymaster')) : null) }));
  const family = mine.filter((c) => c.roles.some((r) => ['heir', 'lady', 'family'].includes(r)) && c.age >= 12).slice(0, 4);
  return { seats, family, small: p === 'baratheon' ? onCouncil : [] };
}
function council() {
  const { seats, family, small } = councilMembers();
  const seat = (x) => x.c ? `<div class="council-seat"><img src="${por(x.c, 64)}" alt=""><div class="grow"><div class="role">${x.label}</div><div class="title" data-char="${x.c.id}" style="cursor:pointer">${esc(x.c.name)}</div><div class="sub muted">${esc(x.desc)}</div></div><label style="margin:0"><input type="checkbox" class="cm" value="${x.c.id}" checked></label><button class="btn small" data-talk="${x.c.id}">Audience</button><button class="btn small ghost" data-appoint="${x.role}" title="Replace">⇄</button></div>`
    : `<div class="council-seat empty"><div style="width:3rem;text-align:center;font-size:1.5rem">∅</div><div class="grow"><div class="role">${x.label}</div><div class="sub muted">Vacant — ${esc(x.desc)}</div></div><button class="btn small" data-appoint="${x.role}">Appoint…</button></div>`;
  return `<p class="muted">Summon your advisors together and put a question to them. Each speaks from their own office — and their own interests.</p>
    ${seats.map(seat).join('')}
    ${small.length ? `<h4>The Small Council</h4>${small.map((c) => `<div class="council-seat"><img src="${por(c, 64)}"><div class="grow"><div class="role">${esc(c.title)}</div><div class="title" data-char="${c.id}" style="cursor:pointer">${esc(c.name)}</div></div><label style="margin:0"><input type="checkbox" class="cm" value="${c.id}" checked></label><button class="btn small" data-talk="${c.id}">Audience</button></div>`).join('')}` : ''}
    ${family.length ? `<h4>Family</h4>${family.map((c) => `<div class="council-seat"><img src="${por(c, 64)}"><div class="grow"><div class="role">${esc(c.title || c.roles[0])}</div><div class="title" data-char="${c.id}" style="cursor:pointer">${esc(c.name)}</div></div><label style="margin:0"><input type="checkbox" class="cm" value="${c.id}"></label><button class="btn small" data-talk="${c.id}">Audience</button></div>`).join('')}` : ''}
    <div class="row-actions"><button class="btn primary" id="convene">🕯 Convene the council</button></div>`;
}

// ───────────── Military ─────────────
function military() {
  const s = app.state, p = s.meta.player, h = player();
  const vas = vassalsOf(s, p).map((v) => s.houses[v]);
  const mine = forces(s).filter((a) => a.owner === p || a.serving === p || s.houses[a.owner]?.liege === p);
  const others = forces(s).filter((a) => !mine.includes(a)).sort((a, b) => (app.map?.atWarWith(b.owner) ? 1 : 0) - (app.map?.atWarWith(a.owner) ? 1 : 0));
  const answered = vas.filter((v) => v.obligations?.levies === 'answered').length, refused = vas.filter((v) => v.obligations?.levies === 'refused').length, called = vas.filter((v) => ['called', 'delayed'].includes(v.obligations?.levies)).length;
  return `
    <div class="stat-grid">
      <div class="s"><div class="k">Your levies</div><div class="v">~${fmt(h.figures.levies.v)}</div></div>
      <div class="s"><div class="k">Men-at-arms</div><div class="v">${fmt(h.figures.menAtArms.v)}</div></div>
      <div class="s"><div class="k">Warships</div><div class="v">${fmt(h.figures.ships.v)}</div></div>
      <div class="s"><div class="k">Banners answered</div><div class="v" style="color:#a8e08a">${answered}</div></div>
      <div class="s"><div class="k">Awaiting</div><div class="v" style="color:#ffe0a0">${called}</div></div>
      <div class="s"><div class="k">Refused</div><div class="v" style="color:#ec9a8a">${refused}</div></div>
    </div>
    <div class="row-actions"><button class="btn primary" id="call-banners">📯 Call the banners…</button><button class="btn" id="raise-levies">Raise own levies…</button><button class="btn" data-order-tpl="Hire sellswords: ">Hire sellswords</button></div>
    <div id="banners-form" class="hidden"></div>
    <div class="section" style="margin-top:0.8rem"><h4>Your hosts & fleets</h4>${mine.map((a) => armyRow(a) + ((a.owner === p || a.serving === p) ? `<div class="row-actions" style="margin:0.1rem 0 0.5rem 2.3rem"><button class="btn small" data-march="${a.id}">⤳ March…</button>${a.commander && s.characters[a.commander]?.alive ? `<button class="btn small" data-talk="${a.commander}">Commander</button>` : ''}<button class="btn small" data-order-tpl="${esc(a.name)} is to ">Orders…</button><button class="btn small danger" data-disband="${a.id}">Disband</button></div>` : '')).join('') || '<div class="muted">No hosts in the field. Call your banners to raise one.</div>'}</div>
    ${companiesHtml(s, p)}
    <div class="section"><h4>Vassal levies</h4>${vas.map((v) => `<div class="row clickable" data-house="${v.id}">${sig(v)}<div class="grow"><div class="title">${esc(v.name)}</div><div class="sub">~${fmt(v.figures.levies.v)} levies · ${fmt(v.figures.menAtArms.v)} men-at-arms · ${temperWord(vassalTemper(s, v.id))}</div></div>${obligationPills(v)}</div>`).join('') || '<div class="muted">You have no vassals.</div>'}</div>
    <div class="section"><h4>Known forces</h4>${others.map(armyRow).join('')}</div>`;
}

// the free companies for hire (07 §10): their swords, their price a moon, and whose coin they take now
function companiesHtml(s, p) {
  const rows = Object.entries(COMPANIES).filter(([id]) => s.houses[id]).map(([id, C]) => {
    const host = Object.values(s.parties).find((x) => x.owner === id && x.kind === 'host' && x.men > 0);
    const men = host?.men || C.men || 0; const price = Math.round(men * C.price); const by = host?.contract?.by;
    const status = by === p ? `in your pay · ${fmt(host.contract.price)} a moon` : by ? `in the pay of House ${esc(s.houses[by]?.name)}${C.turncoat ? ` · would come to you for ${fmt(Math.ceil(host.contract.price * 1.5))}` : ' · keeps its contracts'}` : `for hire · ${fmt(price)} a moon`;
    const act = by === p ? `<button class="btn small" data-dismiss-company="${id}">Pay off</button>` : !by || C.turncoat ? `<button class="btn small" data-hire-company="${id}" data-offer="${by ? Math.ceil(host.contract.price * 1.5) : ''}">Hire</button>` : '';
    return `<div class="row"><div class="grow"><div class="title">${esc(C.name.replace(/^./, (x) => x.toUpperCase()))} <span class="muted">~${fmt(men)} swords</span></div><div class="sub">${status}</div></div>${act}</div>`;
  });
  return rows.length ? `<div class="section"><h4>Free companies</h4>${rows.join('')}<p class="muted" style="font-size:max(0.78rem,12px)">A moon paid on signing and each moon after; miss a moon's pay and the company is gone.</p></div>` : '';
}
document.addEventListener('click', (e) => {
  const h = e.target.closest('[data-hire-company]'); if (h) doVerb('hire_company', { company: h.dataset.hireCompany, ...(h.dataset.offer ? { offer: Number(h.dataset.offer) } : {}) }, { after: () => renderWindow() });
  const d = e.target.closest('[data-dismiss-company]'); if (d) doVerb('dismiss_company', { company: d.dataset.dismissCompany }, { after: () => renderWindow() });
});

// a war (07 §11): its sides, its goal, how it goes (the score as your side sees it), and for its leader, peace
function warRow(s, p, w) {
  const side = sideOf(s, w, p); const sc = side ? scoreFor(w, side) : w.score || 0;
  const how = !side ? '' : sc >= 50 ? 'you are winning it' : sc >= 15 ? 'it goes your way' : sc <= -50 ? 'you are losing it' : sc <= -15 ? 'it goes against you' : 'it hangs in the balance';
  const other = side ? leaderOf(w, side === 'A' ? 'D' : 'A') : null; const leads = side && leaderOf(w, side) === p;
  return `<div class="row"><div class="grow"><div class="title">${esc(w.name)} ${side ? '<span class="pill war">your war</span>' : ''}${w.cold ? ' <span class="pill">cold</span>' : ''}</div>
    <div class="sub">${w.attackers.map((x) => esc(s.houses[x]?.name)).join(', ')} ⚔ ${w.defenders.map((x) => esc(s.houses[x]?.name)).join(', ')} · since ${esc(w.started)}${w.goal ? ` · fought ${esc(GOALS[w.goal] || w.goal)}` : ''}${how ? ` · <b>${how}</b>` : ''}</div>
    ${side ? meter(50 + sc / 2, sc >= 0 ? '#7fb85a' : '#c96a4a') : ''}</div>
    ${leads ? `<button class="btn small" data-order-tpl="Offer House ${esc(s.houses[other]?.name)} ${sc >= 40 ? 'peace: they must concede and pay' : sc <= -40 ? 'peace: we will concede and pay' : 'a white peace'}.">Sue for peace</button>` : ''}</div>`;
}

// ───────────── Economy ─────────────
// The last moon's accounts summed from the turns' ledgers (turns are often a single day)
function moonAccounts(h) {
  const Ls = (h.ledger || []); let days = 0; const lines = new Map(); let foodFrom = null;
  for (let i = Ls.length - 1; i >= 0 && days < 30; i--) {
    const e = Ls[i]; days += e.days || 0; foodFrom = e.food;
    for (const l of e.lines || []) { const k = `${l.kind}|${l.label}`; lines.set(k, (lines.get(k) || 0) + (l.amount || 0)); }
  }
  if (!days || Ls.length < 2) return '';
  const inc = [...lines].filter(([k]) => k.startsWith('income')).sort((a, b) => b[1] - a[1]);
  const exp = [...lines].filter(([k]) => k.startsWith('expense')).sort((a, b) => b[1] - a[1]);
  const tot = (a) => a.reduce((n, [, v]) => n + v, 0);
  const row = ([k, v], sign) => `<tr class="${sign > 0 ? 'inc' : 'exp'}"><td>${esc(k.split('|')[1])}</td><td class="n">${sign > 0 ? '+' : '−'}${fmt(Math.round(v))}</td></tr>`;
  const food = Ls.at(-1)?.food;
  return `<div class="section"><h4>The last ${days} days, all told</h4><table class="ledger">${inc.map((x) => row(x, 1)).join('')}${exp.map((x) => row(x, -1)).join('')}
    <tr class="sum"><td>Net</td><td class="n">${tot(inc) - tot(exp) >= 0 ? '+' : ''}${fmt(Math.round(tot(inc) - tot(exp)))}</td></tr>
    <tr><td>Granaries</td><td class="n">${foodFrom != null && food != null ? `${foodFrom} → ${food} moons` : ''}</td></tr></table>
    <p class="muted" style="font-size:max(0.78rem,12px)">Levies cost bread, not wages: a host in the field eats from your granaries and leaves its fields untended. Men-at-arms and sellswords are paid in gold.</p></div>`;
}
// Trade: agreements lift what your markets and ports earn; embargoes and wars choke them
function tradeSection(s, p) {
  const pacts = (s.pacts || []).filter((x) => x.status === 'active' && (x.type === 'trade' || x.type === 'embargo') && (x.a === p || x.b === p));
  const m = tradeModifier(s, p);
  const partners = Object.values(s.houses).filter((h) => h.id !== p && ['paramount', 'city_state', 'crown', 'major'].includes(h.rank) && !pacts.some((x) => [x.a, x.b].includes(h.id))).sort((a, b) => a.name.localeCompare(b.name));
  return `<div class="section"><h4>Trade</h4>
    <div class="muted" style="font-size:max(0.82rem,12px)">Your trade runs at <b style="color:${m >= 1 ? '#a8e08a' : '#ec9a8a'}">${Math.round(m * 100)}%</b> — each agreement +10%, each embargo −18%, each war −10%.</div>
    ${pacts.map((x) => { const o = s.houses[x.a === p ? x.b : x.a]; return `<div class="row clickable" data-house="${o.id}">${sig(o)}<div class="grow"><div class="title">${x.type === 'trade' ? 'Trade agreement' : 'Embargo'} with House ${esc(o.name)}</div><div class="sub">${esc(x.terms || '')}</div></div><span class="pill ${x.type === 'trade' ? '' : 'bad'}">${x.type === 'trade' ? '+10%' : '−18%'}</span></div>`; }).join('') || '<div class="muted">No agreements yet.</div>'}
    <div class="row-actions" style="margin-top:0.4rem"><select id="trade-with">${partners.map((h) => `<option value="${h.id}">House ${esc(h.name)}</option>`).join('')}</select><button class="btn small" id="trade-go">Seek a trade agreement</button></div></div>`;
}

// Customs of the realm: mechanics the chronicler invented and the ledger now settles every moon.
// They are shown apart from the accounts, because they are the part of the world the story wrote.
function customsSection(s, p) {
  const rules = liveRules(s, p);
  if (!rules.length) return '';
  const KIND = { income: ['+', 'dragons a moon'], expense: ['−', 'dragons a moon'], food: ['', 'moons of stores'], unrest: ['', 'unrest on every holding'], prosperity: ['', 'prosperity on every holding'], levies: ['', 'men a moon'], var: ['', ''] };
  return `<div class="section"><h4>Customs of your realm</h4>
    <p class="muted" style="font-size:max(0.8rem,12px);margin:-0.2rem 0 0.5rem">Not laws of the world, but of <i>your</i> world — things the chronicle raised, which your stewards now reckon with every moon.</p>
    ${rules.map((r) => {
      const [sign, unit] = KIND[r.kind] || ['', ''];
      const vals = Object.entries(r.values || {}).map(([k, v]) => `${esc(k.replace(/_/g, ' '))} <b style="color:var(--gold2)">${fmt(Math.round(v))}</b>`).join(' · ');
      return `<div class="proj"><div style="display:flex;justify-content:space-between;gap:0.6rem;align-items:baseline">
        <b>${esc(r.name)}</b><span class="muted" style="font-size:max(0.78rem,12px);white-space:nowrap">${sign}${unit ? esc(unit) : esc(r.kind)}</span></div>
        ${r.note ? `<div class="muted" style="font-size:max(0.82rem,12px)">${esc(r.note)}</div>` : ''}
        ${vals ? `<div style="font-size:max(0.82rem,12px);margin-top:0.2rem">${vals}</div>` : ''}
        ${r.last != null ? `<div class="muted" style="font-size:max(0.78rem,12px)">Last moon: ${r.kind === 'income' || r.kind === 'expense' ? `${sign}${fmt(Math.abs(Math.round(r.last)))} dragons` : `${Math.round(r.last * 10) / 10}`}</div>` : ''}
        <div class="muted" style="font-size:max(0.72rem,12px);margin-top:0.25rem;font-family:var(--mono,monospace);opacity:0.55" title="how your stewards reckon it">${esc(r.formula)}</div>
      </div>`;
    }).join('')}</div>`;
}

function economy() {
  const s = app.state, p = s.meta.player, h = player();
  const pr = project(s, p);
  const L = h.ledger?.at(-1);
  const hist = (h.ledger || []).map((e) => e.treasury);
  const tax = h.policy?.tax || 'normal';
  const projs = (s.projects || []).filter((x) => x.house === p);
  const holdings = Object.values(s.holdings).filter((x) => x.owner === p);
  const res = {}; for (const x of holdings) for (const [k, v] of Object.entries(x.resources || {})) res[k] = (res[k] || 0) + v * Math.sqrt(x.population / 10000);
  const steward = Object.values(s.characters).find((c) => c.house === p && c.alive && c.roles.includes('steward')) || Object.values(s.characters).find((c) => c.house === p && c.alive && c.roles.includes('maester'));
  const season = SEASONS[s.world?.season || 'summer'];
  return `
    <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:1rem">
      <div><div class="muted" style="font-size:max(0.75rem,12px)">TREASURY</div><div class="big-num">${fmt(h.figures.treasury.v)} <small style="font-size:max(0.9rem,12px)">gold dragons</small></div>
      <div class="muted" style="font-size:max(0.78rem,12px)">${esc(h.figures.treasury.src)} · ${esc(h.figures.treasury.asOf)}${h.figures.debt?.v ? ` · <span style="color:#ec9a8a">debt ${fmt(h.figures.debt.v)}</span>` : ''}</div></div>
      ${steward ? `<button class="btn small" data-talk="${steward.id}">Ask ${esc(steward.name.split(' ').slice(-1)[0])}</button>` : ''}
    </div>
    ${sparkline(hist)}
    <div class="section"><h4>Steward's projection — next moon</h4>
      <div class="kv"><span class="k">Your lands</span><span>~${fmt(pr.own)}</span><span class="k">Vassal tribute</span><span>~${fmt(pr.tribute)}</span>
      <span class="k">Hosts & fleets</span><span>−${fmt(pr.upkeep)}</span><span class="k">Men-at-arms & guard</span><span>−${fmt(pr.household)}</span><span class="k">Court</span><span>−${fmt(pr.court)}</span>
      ${pr.owed ? `<span class="k">Owed to your liege</span><span>−${fmt(pr.owed)}</span>` : ''}${pr.interest ? `<span class="k">Interest</span><span>−${fmt(pr.interest)}</span>` : ''}${pr.projects ? `<span class="k">Works</span><span>−${fmt(pr.projects)}</span>` : ''}
      <span class="k"><b>Net</b></span><span><b>${fmt(pr.low)} … ${fmt(pr.high)}</b> <span class="muted">(luck, harvests and loyalty decide)</span></span></div>
      <p class="muted" style="font-size:max(0.8rem,12px)">${esc(season.label)}: ${esc(s.world?.seasonNote || season.note)}</p></div>
    <div class="section"><h4>Taxation</h4><div class="tpl-grid">${Object.entries(TAX_LEVELS).map(([k, t]) => `<div class="tpl" data-tax="${k}" style="${k === tax ? 'border-color:var(--gold2);background:var(--panel2)' : ''}"><b>${t.label}${k === tax ? ' ✓' : ''}</b><div class="c">${esc(t.desc)}</div></div>`).join('')}</div></div>
    ${h.liege && s.houses[h.liege] ? (() => { const cur = h.obligations?.tribute || 'paying'; const D = { paying: ['Pay in full', 'What is owed, on time. Your liege is content.'], late: ['Pay late', 'Excuses and partial sums. Patience wears thin.'], withholding: ['Withhold', 'Keep the gold. Your liege will notice, and will act.'] }; return `<div class="section"><h4>Dues to House ${esc(s.houses[h.liege].name)}</h4><div class="tpl-grid">${Object.entries(D).map(([k, [t, d]]) => `<div class="tpl" data-dues="${k}" style="${k === cur ? 'border-color:var(--gold2);background:var(--panel2)' : ''}"><b>${t}${k === cur ? ' ✓' : ''}</b><div class="c">${d}</div></div>`).join('')}</div></div>`; })() : ''}
    ${customsSection(s, p)}
    ${moonAccounts(h)}
    ${tradeSection(s, p)}
    ${L ? `<div class="section"><h4>Last accounts — ${esc(L.date)} (${L.days} day${L.days > 1 ? 's' : ''})${L.reporter ? ', by ' + esc(L.reporter) : ''}</h4><table class="ledger">
      ${L.lines.map((l) => `<tr class="${l.kind === 'income' ? 'inc' : 'exp'} ${l.note && /withheld|late|short/.test(l.note) ? 'warn' : ''}"><td>${esc(l.label)}${l.note ? `<div class="note">${esc(l.note)}${l.expected ? ` — expected ~${fmt(l.expected)}` : ''}</div>` : ''}${l.detail ? `<div class="note">${l.detail.filter((d) => d.amount).slice(0, 6).map((d) => `${esc(d.label)} ${fmt(d.amount)}${d.note ? ' (' + esc(d.note) + ')' : ''}`).join(' · ')}</div>` : ''}</td><td class="n">${l.kind === 'income' ? '+' : '−'}${fmt(l.amount)}</td></tr>`).join('')}
      <tr class="sum"><td>Net</td><td class="n">${L.net >= 0 ? '+' : ''}${fmt(L.net)}</td></tr></table></div>` : '<p class="muted">No accounts yet — the first reckoning comes when time advances.</p>'}
    <div class="section"><h4>Works & projects</h4>${(() => { const act = projs.filter((x) => x.status === 'active'); if (!act.length) return ''; const left = act.reduce((a, x) => a + (x.remaining || 0), 0); const perMoon = act.reduce((a, x) => a + (x.perMonth || 0), 0); return `<div class="muted" style="font-size:max(0.85rem,12px);margin-bottom:0.4rem">Committed: <b style="color:var(--gold2)">${fmt(Math.round(left))}</b> dragons still to spend on ${act.length} work${act.length > 1 ? 's' : ''} — about ${fmt(Math.round(perMoon))} a moon.</div>`; })()}${projs.filter((x) => x.status === 'active').map((x) => `<div class="proj"><div style="display:flex;justify-content:space-between"><b>${esc(x.name)}</b><button class="btn small danger" data-cancel-proj="${x.id}">Cancel</button></div><div class="muted" style="font-size:max(0.78rem,12px)">${fmt(Math.round(x.cost - x.remaining))} / ${fmt(x.cost)} gd · ${Math.round(x.monthsLeft * 10) / 10} moons left</div>${meter(100 - (x.monthsLeft / x.months) * 100)}</div>`).join('') || '<div class="muted" style="font-size:max(0.85rem,12px)">Nothing under way.</div>'}
      ${projs.filter((x) => x.status === 'complete').slice(-3).map((x) => `<div class="muted" style="font-size:max(0.8rem,12px)">✓ ${esc(x.name)}</div>`).join('')}
      <h4 style="margin-top:0.8rem">Fund new works</h4>
      <label>At</label><select id="proj-hold">${holdings.map((x) => `<option value="${x.id}"${x.id === app.projHold ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
      <div class="tpl-grid" style="margin-top:0.4rem">${PROJECT_TEMPLATES.map((t) => `<div class="tpl" data-proj="${t.key}"><b>${t.icon} ${esc(t.name)}</b><div class="c">${fmt(t.cost)} gd · ${t.months} moons</div><div class="c">${esc(t.desc)}</div></div>`).join('')}</div></div>
    <div class="section"><h4>What your lands yield</h4><div>${Object.entries(res).filter(([, v]) => v > 0.2).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<span class="pill" title="${esc(RESOURCES[k]?.desc || '')}">${RESOURCES[k]?.icon || ''} ${esc(RESOURCES[k]?.name || k)} ${v >= 4 ? '●●●' : v >= 1.5 ? '●●' : '●'}</span>`).join('')}</div></div>`;
}

// ───────────── Diplomacy ─────────────
function diplomacy() {
  const s = app.state, p = s.meta.player;
  const wars = s.wars.filter((w) => w.status !== 'ended');
  const pacts = s.pacts.filter((x) => x.status !== 'ended');
  const tops = Object.values(s.houses).filter((x) => x.id !== p && (!x.liege || x.rank === 'paramount' || x.rank === 'crown' || x.independent));
  tops.sort((a, b) => getRelation(s, p, b.id) - getRelation(s, p, a.id));
  const neighbours = Object.values(s.houses).filter((x) => x.id !== p && x.liege === player().liege && x.liege).slice(0, 12);
  return `
    <div class="section"><h4>Wars</h4>${wars.map((w) => warRow(s, p, w)).join('') || '<div class="muted">Peace — for now.</div>'}</div>
    ${promiseBookHtml(s, { esc, icon })}
    <div class="section"><h4>Pacts & agreements</h4>${pacts.map((x) => `<div class="row"><div class="grow"><div class="title">${esc(x.type)} · ${esc(s.houses[x.a]?.name)} & ${esc(s.houses[x.b]?.name)} <span class="pill">${esc(x.status)}</span></div><div class="sub" title="${esc(x.terms)}">${esc(x.terms)}</div></div></div>`).join('') || '<div class="muted">None.</div>'}</div>
    <div class="section"><h4>The great powers</h4>${tops.map((x) => houseRow(x)).join('')}</div>
    ${neighbours.length ? `<div class="section"><h4>Fellow vassals of ${esc(s.houses[player().liege]?.name)}</h4>${neighbours.map((x) => houseRow(x)).join('')}</div>` : ''}`;
}

// ───────────── Intrigue ─────────────
function intrigue() {
  const s = app.state, p = s.meta.player;
  const spy = Object.values(s.characters).find((c) => c.alive && c.roles.includes('spymaster') && (c.house === p || (p === 'baratheon' && placeOf(s, c) === 'baratheon')));
  const recent = s.history.slice(-6).flatMap((t) => t.events.filter((e) => e.type === 'intrigue' || e.type === 'rumor').map((e) => ({ ...e, date: t.date }))).reverse();
  const houses = Object.values(s.houses).filter((h) => h.id !== p).sort((a, b) => a.name.localeCompare(b.name));
  const PLOTS = [['spy', 'Plant spies in the household of'], ['secrets', 'Uncover the secrets of'], ['rumour', 'Spread rumours to discredit'], ['bribe', 'Bribe the servants and knights of'], ['sabotage', 'Sabotage the stores and ships of'], ['assassinate', 'Arrange the quiet death of the lord of'], ['turn', 'Turn a vassal of']];
  return `
    ${spy ? `<div class="council-seat"><img src="${por(spy, 64)}"><div class="grow"><div class="role">Master of whisperers</div><div class="title">${esc(spy.name)}</div></div><button class="btn small" data-talk="${spy.id}">Whispers…</button></div>` : '<div class="council-seat empty"><div class="grow"><div class="role">Master of whisperers</div><div class="sub muted">You have no spymaster. Plots will rely on hired men and luck.</div></div><button class="btn small" data-appoint="spymaster">Appoint…</button></div>'}
    <div class="section"><h4>Hatch a scheme</h4>
      <label>Scheme</label><select id="plot-kind">${PLOTS.map(([k, l]) => `<option value="${k}">${esc(l)}…</option>`).join('')}</select>
      <label>Target</label><select id="plot-target">${houses.map((h) => `<option value="${h.id}">House ${esc(h.name)}</option>`).join('')}</select>
      <label>Means & budget</label><input class="input" id="plot-means" placeholder="e.g. 2,000 dragons, a trusted sellsword, a letter forged in Lord Tywin's hand">
      <div class="row-actions"><button class="btn primary" id="plot-go">🗡 Set it in motion</button></div>
      <p class="muted" style="font-size:max(0.8rem,12px)">Planting spies and uncovering secrets is your spymaster's work, settled at once and paid for now. Every other scheme becomes a secret order that unfolds as time advances — it may take months, fail, or be discovered.</p></div>
    ${shadowsHtml(s)}
    <div class="section"><h4>Whispers & intrigue</h4>${recent.map((e) => `<div class="event"><div class="et">${esc(e.title)}</div><div class="eb">${esc(e.text)}</div><div class="meta">${esc(e.date)}</div></div>`).join('') || '<div class="muted">Nothing yet.</div>'}</div>`;
}

// What is rising in the dark, and what has already come to pass
function shadowsHtml(s) {
  const T = s.plots?.threats; if (!T) return '';
  const tone = (v) => (v > 70 ? 'dire' : v > 45 ? 'grave' : 'calm');
  const meters = Object.entries(THREATS).map(([k, t]) => { const v = Math.round(T[k] || 0); return `<div class="threat ${tone(v)}"><div class="th-top"><b>${esc(t.name)}</b><span>${v > 70 ? 'Dire' : v > 45 ? 'Rising' : 'Distant'}</span></div><div class="meter"><div style="width:${v}%"></div></div><div class="th-blurb">${esc(t.blurb(v))}</div></div>`; }).join('');
  const log = (s.plots.log || []).slice(-12).reverse();
  const thread = Object.fromEntries(THREADS.map((t) => [t.id, t.name]));
  // the great matters that have begun: where each stands, never what comes next
  const matters = THREADS.filter((t) => (s.plots.stages?.[t.id] || 0) > 0).map((t) => {
    const i = s.plots.stages[t.id]; const lastLog = (s.plots.log || []).filter((l) => l.thread === t.id).at(-1);
    const st = i >= t.stages.length ? ['done', 'Resolved'] : ['underway', 'Unfolding'];
    return `<div class="errand"><span class="ost ${st[0]}">${st[1]}</span><div class="grow"><b>${esc(t.name)}</b>${lastLog?.title ? `<div class="muted" style="font-size:max(0.8rem,12px)">Last: ${esc(lastLog.title)}</div>` : ''}</div></div>`;
  }).join('');
  return `${matters ? `<div class="section"><h4>Great matters</h4>${matters}</div>` : ''}<div class="section"><h4>Shadows over the realm</h4><div class="threats">${meters}</div></div>
    ${log.length ? `<div class="section"><h4>What has come to pass</h4><ol class="saga">${log.map((l) => `<li><span class="saga-date">${esc(thread[l.thread] || '')}</span><b>${esc(l.title || '')}</b></li>`).join('')}</ol></div>` : ''}`;
}

// ───────────── People ─────────────
function people() {
  const s = app.state;
  const houses = [...new Set(Object.values(s.characters).map((c) => c.house))].filter((h) => s.houses[h]).sort((a, b) => s.houses[a].name.localeCompare(s.houses[b].name));
  return `<input class="input" id="people-filter" placeholder="Who is who: search every name, title and place in the realm…" value="${esc(app.peopleFilter)}">
    <select id="people-house" style="margin-top:0.4rem"><option value="">All houses</option>${houses.map((h) => `<option value="${h}" ${app.peopleHouse === h ? 'selected' : ''}>${esc(s.houses[h].name)}</option>`).join('')}</select>
    <label style="display:flex;gap:0.4rem;align-items:center"><input type="checkbox" id="people-dead" ${app.peopleDead ? 'checked' : ''}> include the dead</label>
    <div id="people-rows" style="margin-top:0.4rem"></div>`;
}

// ───────────── wiring ─────────────
const wire = {
  council(body) {
    $('#convene', body).onclick = () => { const ids = $$('.cm', body).filter((x) => x.checked).map((x) => x.value); if (!ids.length) return toast('Choose who sits at the table.', true); app.openCouncil(ids); };
  },
  military(body) {
    $('#call-banners', body).onclick = () => {
      const s = app.state, p = s.meta.player; const f = $('#banners-form', body); f.classList.toggle('hidden');
      const vas = vassalsOf(s, p).map((v) => s.houses[v]);
      const holds = Object.values(s.holdings).filter((x) => x.owner === p || s.houses[x.owner]?.liege === p);
      f.innerHTML = `<div class="proj"><h4>Call the banners</h4><div class="checklist">${vas.map((v) => `<label><input type="checkbox" class="bv" value="${v.id}" checked> ${sig(v, 1.1)} ${esc(v.name)} <span class="muted">~${fmt(v.figures.levies.v)}</span> ${relHtml(getRelation(s, p, v.id))}</label>`).join('')}</div>
        <label>Muster at</label><select id="bn-at">${holds.map((x) => `<option value="${x.id}" ${x.id === player().seat ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
        <label>Within</label><select id="bn-dl"><option>a fortnight</option><option selected>the moon</option><option>two moons</option></select>
        <label>Words to your lords (optional)</label><input class="input" id="bn-note" placeholder="The Lannisters hold my wife. The North remembers.">
        <div class="row-actions"><button class="btn primary" id="bn-go">Send the ravens</button></div></div>`;
      $('#bn-go', f).onclick = async () => {
        const vassals = $$('.bv', f).filter((x) => x.checked).map((x) => x.value);
        await doVerb('call_banners', { vassals, at: $('#bn-at', f).value, deadline: $('#bn-dl', f).value, note: $('#bn-note', f).value });
      };
    };
    $$('[data-march]', body).forEach((b) => b.onclick = () => app.startPick('march', b.dataset.march));
    $$('[data-disband]', body).forEach((b) => b.onclick = async () => {
      if (!await confirmModal('Disband the host?', 'Most of these men will go back to their fields, and calling them again will take time and goodwill you may not have.', { yes: 'Send them home', no: 'Keep them under arms' })) return;
      await doVerb('disband_host', { army: b.dataset.disband });
    });
    $('#raise-levies', body).onclick = () => {
      const s = app.state, p = s.meta.player, h = player();
      const holds = Object.values(s.holdings).filter((x) => x.owner === p);
      const cmds = Object.values(s.characters).filter((c) => c.alive && c.house === p && c.age >= 14 && c.status === 'free' && !partyOf(s, c));
      const max = Number(h.figures.levies.v) || 0;
      modal(`<h2>Raise your levies</h2><p class="muted">Your own smallfolk answer you directly — your vassals must be called separately. Men in the field cost coin every moon and leave the fields untended.</p>
        <label>Men: <b id="rl-n">${Math.round(max / 2)}</b> of ~${fmt(max)}</label><input type="range" id="rl-men" min="50" max="${max}" step="50" value="${Math.round(max / 2)}" style="width:100%">
        <label>Muster at</label><select id="rl-at">${holds.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select>
        <label>Commander</label><select id="rl-cmd"><option value="">— none —</option>${cmds.map((c) => `<option value="${c.id}">${esc(c.name)} (⚔ ${c.skills?.[1] ?? '?'})</option>`).join('')}</select>
        <label>Name</label><input class="input" id="rl-name" placeholder="e.g. The Wolfswood Levies">
        <div class="row-actions"><button class="btn primary" id="rl-go">Raise them</button></div>`);
      $('#rl-men').oninput = (e) => { $('#rl-n').textContent = e.target.value; };
      $('#rl-go').onclick = async () => {
        await doVerb('raise_levies', { men: Number($('#rl-men').value), at: $('#rl-at').value, commander: $('#rl-cmd').value, name: $('#rl-name').value || undefined }, { after: () => $('#modal').classList.add('hidden') });
      };
    };
  },
  economy(body) {
    const tg = $('#trade-go', body); if (tg) tg.onclick = () => { const h = app.state.houses[$('#trade-with', body).value]; const lord = h?.lord && app.state.characters[h.lord]; if (!lord?.alive) return toast('There is no one to treat with.', true); app.openChat?.(lord.id, `Let our merchants trade freely between our lands — your goods for ours, with fair tolls on both sides. What say you?`); };
    $$('[data-tax]', body).forEach((el) => el.onclick = () => doVerb('set_tax', { level: el.dataset.tax }));
    $$('[data-dues]', body).forEach((el) => el.onclick = () => doVerb('set_dues', { status: el.dataset.dues }));
    $$('[data-proj]', body).forEach((el) => el.onclick = () => doVerb('fund_works', { template: el.dataset.proj, holding: $('#proj-hold', body).value }));
    $$('[data-cancel-proj]', body).forEach((el) => el.onclick = () => doVerb('cancel_works', { project: el.dataset.cancelProj }));
  },
  intrigue(body) {
    $('#plot-go', body).onclick = () => {
      const kind = $('#plot-kind', body).selectedOptions[0].text.replace('…', ''); const t = app.state.houses[$('#plot-target', body).value];
      const key = $('#plot-kind', body).value;
      // spies and secrets are the spymaster's own work, settled at once; the rest go to the world as secret orders
      if (key === 'spy' || key === 'secrets') { courtAct(key === 'secrets' ? 'gather_secrets' : 'plant_spy', { house: t.id }); return; }
      addOrder(`[SECRET SCHEME] ${kind} House ${t.name}. ${$('#plot-means', body).value}`.trim()); toast('The scheme is added to your orders — in secret.');
    };
  },
  people(body) {
    const draw = () => {
      const s = app.state; const q = app.peopleFilter.toLowerCase();
      // no search asked: the people of your own house first (family, household, guests, bannermen); a search, a house or the dead: the whole realm's list, as before
      if (!q && !app.peopleHouse && !app.peopleDead) {
        const secs = peopleSections(s);
        if (secs.length) { $('#people-rows', body).innerHTML = secs.map((x) => `<section class="ppl-sec" data-sec="${x.id}"><h4>${esc(x.title)} <span class="muted">· ${esc(x.hint)}</span></h4>${x.rows.map(({ c, role }) => charRow(c, { extra: role ? `<span class="pill role">${esc(role)}</span>` : '' })).join('')}</section>`).join('') + '<p class="muted ppl-more">Everyone else in the realm: search above, or choose a house.</p>'; return; }
      }
      const list = Object.values(s.characters).filter((c) => (app.peopleDead || c.alive) && (!app.peopleHouse || c.house === app.peopleHouse || kinOf(s, c, app.peopleHouse)) && (!q || `${c.name} ${c.title} ${s.houses[c.house]?.name} ${whereabouts(s, c).text}`.toLowerCase().includes(q)));
      list.sort((a, b) => (b.alive - a.alive) || a.name.localeCompare(b.name));
      $('#people-rows', body).innerHTML = list.slice(0, 200).map((c) => charRow(c)).join('') || '<div class="muted">No one.</div>';
    };
    draw();
    $('#people-filter', body).oninput = (e) => { app.peopleFilter = e.target.value; draw(); };
    $('#people-house', body).onchange = (e) => { app.peopleHouse = e.target.value; draw(); };
    $('#people-dead', body).onchange = (e) => { app.peopleDead = e.target.checked; draw(); };
  },
};

// appoint & order templates (delegated)
document.addEventListener('click', (e) => {
  const ap = e.target.closest('[data-appoint]');
  if (ap) {
    const role = ap.dataset.appoint; const label = SEATS.find((x) => x[0] === role)?.[1] || role;
    const s = app.state, p = s.meta.player, seat = player().seat;
    const cands = Object.values(s.characters).filter((c) => c.alive && c.id !== player().lord && (c.house === p || placeOf(s, c) === seat) && c.age >= 14 && c.status === 'free');
    modal(`<h2>Appoint a ${esc(label)}</h2><p class="muted">Choose from your household, wards and guests. Or describe whom you seek and the realm will find someone.</p>
      ${cands.map((c) => `<div class="row clickable" data-appoint-pick="${c.id}"><img class="por" src="${por(c, 64)}"><div class="grow"><div class="title">${esc(c.name)}</div><div class="sub">${esc(c.title || c.roles.join(', '))} · ${SKILL_NAMES.map((n, i) => `${SKILL_ICONS[i]}${c.skills?.[i] ?? '?'}`).join(' ')}</div></div></div>`).join('') || '<p class="muted">No one suitable at your seat.</p>'}
      <hr><label>Or seek someone new</label><input class="input" id="seek-text" placeholder="e.g. a hard old knight from the mountain clans who knows siegecraft"><div class="row-actions"><button class="btn" id="seek-go">Send word</button></div>`);
    $$('[data-appoint-pick]').forEach((r) => r.onclick = () => doVerb('appoint_office', { character: r.dataset.appointPick, role }, { after: () => $('#modal').classList.add('hidden') }));
    $('#seek-go').onclick = () => { addOrder(`Find and appoint a new ${label} for my household: ${$('#seek-text').value}`); $('#modal').classList.add('hidden'); toast('The order is given.'); };
  }
  const gr = e.target.closest('[data-grant]');
  if (gr) {
    const s = app.state, p = s.meta.player; const hd = s.holdings[gr.dataset.grant];
    const vas = vassalsOf(s, p).map((v) => s.houses[v]);
    modal(`<h2>Grant ${esc(hd.name)}</h2><p class="muted">Lands are the surest way to bind a lord to you — and to make his neighbours jealous.</p>${vas.map((v) => `<div class="row clickable" data-grant-to="${v.id}">${sig(v)}<div class="grow"><div class="title">House ${esc(v.name)}</div><div class="sub">${esc(v.lord ? s.characters[v.lord]?.name : '')} · loyalty ${s.characters[v.lord]?.loyalty ?? '?'}</div></div>${relHtml(getRelation(s, p, v.id))}</div>`).join('') || '<p class="muted">You have no vassals.</p>'}`);
    $$('[data-grant-to]').forEach((r) => r.onclick = () => doVerb('grant_holding', { holding: hd.id, house: r.dataset.grantTo }, { after: () => $('#modal').classList.add('hidden') }));
  }
  const tpl = e.target.closest('[data-order-tpl]');
  if (tpl) { $('#order-input').value = tpl.dataset.orderTpl; $('#order-input').focus(); }
});

// ═════════════ Detail sheets ═════════════
// A sheet is the whole of one castle, host, lord or house, and takes the window's place (one panel at a time: the map stays the screen); it says where
// it came from and a click takes the lord back there. Closing it (Esc, the cross) puts nothing back.
export function openSheet(kind, id) {
  app.closeCard?.();
  if (app.win) { app.back = { win: app.win, tab: app.tab }; closeWindow(true); }
  if (!app.sheet) rememberOpener('sheet');
  app.sheet = { kind, id };
  const el = $('#sheet'); el.classList.remove('hidden'); el.setAttribute('aria-hidden', 'false'); el.classList.add('solo');
  renderSheet();
}
export function closeSheet() { const was = app.sheet; app.sheet = null; app.back = null; $('#sheet').classList.add('hidden'); $('#sheet').setAttribute('aria-hidden', 'true'); if (was) restoreOpener('sheet'); }
function backFromSheet() { const b = app.back; if (!b) return; closeSheet(); openWindow(b.win, b.tab); }
document.addEventListener('click', (e) => { if (e.target.closest('[data-sheet-back]')) backFromSheet(); });
export function renderSheet() {
  if (!app.sheet || !app.state) return;
  const { kind, id } = app.sheet;
  const html = kind === 'char' ? characterSheet(id) : kind === 'holding' ? holdingSheet(id) : kind === 'army' ? armySheet(id) : kind === 'house' ? houseSheet(id) : '';
  if (!html) return closeSheet();
  const back = app.back ? `<button class="btn ghost small sheet-back" data-sheet-back title="Back to where you were">← ${esc(tabLabel(app.back.win, app.back.tab))}</button>` : '';
  $('#sheet-body').innerHTML = back + html;
  $$('[data-march]', $('#sheet-body')).forEach((b) => b.onclick = () => app.startPick('march', b.dataset.march));
  $$('[data-tree]', $('#sheet-body')).forEach((b) => b.onclick = () => familyTree(b.dataset.tree));
}

function famMember(c, role) {
  if (!c) return '';
  return `<div class="m" data-char="${c.id}"><img src="${por(c, 80)}" alt=""><div class="rl">${role}</div><div>${esc(c.name.split(' ')[0])}${c.alive ? '' : ' ✝'}</div></div>`;
}

// Blood of a house serving elsewhere — Benjen Stark on the Wall, Genna Lannister at the Twins — is still its kin
function kinOf(s, c, house) {
  const h = s.houses[house]; if (!h) return false;
  const par = [c.father, c.mother].map((x) => s.characters[x]).filter(Boolean);
  return par.some((x) => x.house === house) || new RegExp(`\\b${h.name}$`).test(c.name.replace(/ of .*$/, ''));
}

function characterSheet(id) {
  const s = app.state; const c = s.characters[id]; if (!c) return '';
  const h = s.houses[c.house]; const p = s.meta.player;
  const mine = c.house === p;
  const father = c.father && s.characters[c.father], mother = c.mother && s.characters[c.mother], spouse = c.spouse && s.characters[c.spouse], betrothed = c.betrothed && s.characters[c.betrothed];
  const kids = childrenOf(s, id), sibs = siblingsOf(s, id);
  const traits = String(c.traits || '').split(/,\s*/).filter(Boolean);
  const sk = c.skills || [5, 5, 5, 5, 5, 5];
  const isRuler = id === player().lord;
  return `
    <div class="char-hero"><img class="por" src="${por(c, 256)}" alt="Portrait of ${esc(c.name)}"><div style="flex:1;min-width:0">
      <h2>${esc(c.name)}</h2>
      <div class="muted">${esc(c.title || c.roles.join(', '))}</div>
      <div style="margin:0.3rem 0">${sig(h, 1.3)} <a href="#" data-house="${h?.id}">House ${esc(h?.name)}</a></div>
      <div class="kv"><span class="k">Age</span><span>${c.alive ? c.age : `${c.age} (died ${c.died || '?'} AC)`}</span>
      ${c.alive ? `<span class="k">Health</span><span class="cond ${conditionOf(s, c).tone}">${esc(conditionOf(s, c).word)}</span>` : ''}
      <span class="k">Where</span><span>${esc(whereabouts(s, c).text)}</span>
      ${c.alive && c.status !== 'free' ? `<span class="k">Status</span><span class="pill bad">${esc(c.status)}</span>` : ''}
      ${!mine && c.alive ? `<span class="k">Opinion of you</span><span>${relHtml(c.opinion || 0)}</span>` : ''}
      ${c.alive && c.house !== 'free_folk' ? `<span class="k">Loyalty</span><span>${meter(c.loyalty ?? 60, '#7fb85a')}</span>` : ''}</div>
    </div></div>
    <div class="skills">${SKILL_NAMES.map((n, i) => `<div class="sk" title="${n}"><div class="i">${SKILL_ICONS[i]}</div><div class="n">${sk[i]}</div><div class="l">${n.slice(0, 4).toUpperCase()}</div></div>`).join('')}</div>
    <div>${traits.map((t) => `<span class="pill trait">${esc(t)}</span>`).join('')}</div>
    ${c.bio ? `<p style="font-size:max(0.92rem,12px);line-height:1.45">${esc(c.bio)}</p>` : ''}
    ${c.secret && (mine || c.secretKnown) ? `<p style="font-size:max(0.88rem,12px);border-left:3px solid var(--red);padding-left:0.5rem">🗝 <b>Secret:</b> <i>${esc(c.secret)}</i></p>` : (c.secretHidden || c.secret) && !mine ? '<p class="muted" style="font-size:max(0.8rem,12px)">🔒 There is more to this one than meets the eye.</p>' : ''}
    ${natureHtml(c)}
    ${!mine && c.alive && c.house !== p ? dispositionHtml(id) : ''}
    <h4>Family <button class="btn small" data-tree="${c.id}" style="float:right">Family tree</button></h4>
    <div class="family">${famMember(father, 'Father')}${famMember(mother, 'Mother')}${famMember(spouse, 'Spouse')}${famMember(betrothed, 'Betrothed')}${kids.map((k) => famMember(k, 'Child')).join('')}${sibs.slice(0, 8).map((k) => famMember(k, 'Sibling')).join('')}</div>
    ${c.memories?.length ? `<h4>Remembers</h4>${c.memories.slice(-5).map((m) => `<div class="muted" style="font-size:max(0.82rem,12px)">• ${esc(m)}</div>`).join('')}` : ''}
    ${c.alive && !isRuler ? `<hr><div class="row-actions">
      <button class="btn primary" data-talk="${c.id}">${together(s, s.characters[player().lord], c) ? '🗣 Speak' : '✉ Send a raven'}</button>
      <button class="btn" data-order-tpl="Summon ${esc(c.name)} to ${esc(s.holdings[player().seat]?.name || 'my court')}. ">Summon</button>
      ${!mine ? `<button class="btn" data-gift="${c.id}">🎁 Send a gift</button>` : ''}
      ${!c.spouse && c.age >= 10 ? `<button class="btn" data-order-tpl="Propose a match for ${esc(c.name)} with ">Propose match</button>` : ''}
      ${mine ? `<button class="btn" data-order-tpl="Grant ${esc(c.name)} ">Grant…</button>` : ''}
      ${/imprisoned|captive|hostage/.test(c.status || '') && !mine ? `<span class="judge-row"><b>Judge:</b> <button class="btn small" data-judge="release" data-who="${c.id}">Release</button><button class="btn small" data-judge="ransom" data-who="${c.id}">Ransom</button><button class="btn small" data-judge="wall" data-who="${c.id}">Send to the Wall</button><button class="btn small danger" data-judge="execute" data-who="${c.id}">Execute</button></span>` : ''}
      ${s.holdings[placeOf(s, c)] ? `<button class="btn ghost" data-hold="${placeOf(s, c)}">Show on map</button>` : ''}</div>` : ''}`;
}

// Their nature as the engine reads it (what decides how they answer you), and the voice they speak with
const VOICE_NAMES = { bm_george: 'George — deep, older (British)', bm_lewis: 'Lewis — low, grave (British)', bm_fable: 'Fable — light, wry (British)', bm_daniel: 'Daniel — young (British)', am_fenrir: 'Fenrir — rough, strong', am_michael: 'Michael — warm, smooth', am_puck: 'Puck — bright, quick', am_onyx: 'Onyx — very deep', bf_emma: 'Emma — clear, noble (British)', bf_isabella: 'Isabella — cool, mature (British)', bf_alice: 'Alice — soft (British)', bf_lily: 'Lily — girlish (British)', af_heart: 'Heart — warm', af_bella: 'Bella — rich', af_nicole: 'Nicole — breathy, low', af_kore: 'Kore — firm', af_aoede: 'Aoede — light', af_sky: 'Sky — young' };
function natureHtml(c) {
  if (!c.alive) return '';
  const { tags, sway } = natureTags(temperament(c)); const dm = DEMEANOURS[c.id];
  const cur = voiceSettings().overrides[c.id] || '';
  return `<h4>Nature</h4><div>${tags.map((t) => `<span class="pill trait">${esc(t)}</span>`).join('')}${sway.length ? `<span class="muted" style="font-size:max(0.8rem,12px)"> moved by ${esc(sway.join(', '))}</span>` : ''}</div>
    ${dm ? `<div class="muted" style="font-size:max(0.82rem,15px);margin-top:0.2rem"><i>${esc(dm.reg)} — ${esc(dm.tics)}</i></div>` : ''}
    <div class="voice-pick"><label>Voice</label><select data-voice-pick="${c.id}"><option value="">Their own (${esc(profileFor(c).voice.split('+').map((x) => x.split('*')[0].replace(/^[ab][mf]_/, '')).join(' & '))})</option>${VOICE_CHOICES.map((v) => `<option value="${v}"${cur === v ? ' selected' : ''}>${esc(VOICE_NAMES[v] || v)}</option>`).join('')}</select><button class="btn small" data-voice-hear="${c.id}">🔊 Hear</button></div>`;
}
document.addEventListener('change', (e) => {
  const sel = e.target.closest?.('[data-voice-pick]'); if (!sel) return;
  const o = { ...voiceSettings().overrides }; if (sel.value) o[sel.dataset.voicePick] = sel.value; else delete o[sel.dataset.voicePick];
  setVoiceSetting('overrides', o);
  hear(sel.dataset.voicePick);
});
document.addEventListener('click', (e) => { const b = e.target.closest?.('[data-voice-hear]'); if (b) hear(b.dataset.voiceHear); });
function hear(id) {
  const c = app.state.characters[id]; if (!c) return;
  const lines = { f: ['Winter is coming, my lord. Whatever the south may tell you.', 'My house remembers its friends — and its enemies.'], m: ['The realm is a dangerous place, my lord. Choose your friends with care.', 'I have given you my answer. I will not give it twice.'] };
  const pool = profileFor(c).female ? lines.f : lines.m;
  stopSpeaking(); speak(pool[Math.floor(Math.random() * pool.length)], c);
}

const DISP_COLOR = { eager: '#a8e08a', favourable: '#cfe0a0', open: '#e0d8b0', reluctant: '#e8c870', unwilling: '#ec9a8a', hostile: '#ff6a5a' };
function dispositionHtml(id) {
  const d = disposition(app.state, id); if (!d) return '';
  const tip = (x) => esc(x.factors.map(([l, v]) => `${l}: ${v > 0 ? '+' : ''}${v}`).join('\n') || 'No strong feelings');
  const pill = (label, x) => `<span class="pill" title="${tip(x)}" style="color:${DISP_COLOR[x.word]}">${label}: ${x.word}</span>`;
  const N = { alliance: 'Alliance', marriage: 'Marriage', trade: 'Trade', fealty: 'Fealty' };
  return `<h4>Disposition toward you</h4><div>${pill('Overall', d)}${Object.entries(d.proposals).filter(([k]) => !(k === 'fealty' && app.state.houses[app.state.characters[id].house]?.liege === app.state.meta.player)).map(([k, x]) => pill(N[k], x)).join('')}</div><div class="muted" style="font-size:max(0.75rem,12px)">Hover for the reasons. Gifts, favours, threats and good arguments can change minds.</div>`;
}

function familyTree(id, { wider = false } = {}) {
  const s = app.state; const model = treeOf(s, id, { wider }); if (!model) return;
  modal(`<h2>The family of ${esc(model.name)}</h2>${treeHtml(model, { esc, por: (cid) => por(s.characters[cid], 96) })}`, {});
  $('#modal-box').classList.add('is-tree');
  requestAnimationFrame(() => drawTreeLinks($('#tree'), model));
}
// the lines of the tree: a parent (or the pair) down to each child, and the couples joined side by side; measured from the cards as they lie
function drawTreeLinks(root, model) {
  const svg = root?.querySelector('.tree-links'); if (!svg) return;
  const box = root.getBoundingClientRect();
  const at = (cid) => { const e = root.querySelector(`[data-tid="${CSS.escape(cid)}"]`); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left - box.left + r.width / 2, top: r.top - box.top, bottom: r.bottom - box.top, left: r.left - box.left, right: r.right - box.left, mid: r.top - box.top + r.height * 0.42 }; };
  svg.setAttribute('width', root.scrollWidth); svg.setAttribute('height', root.scrollHeight); svg.setAttribute('viewBox', `0 0 ${root.scrollWidth} ${root.scrollHeight}`);
  let d = ''; const byChild = new Map();
  for (const l of model.links) { (byChild.get(l.to) || byChild.set(l.to, []).get(l.to)).push(l.from); }
  for (const [child, parents] of byChild) {
    const c = at(child); const ps = parents.map(at).filter(Boolean); if (!c || !ps.length) continue;
    const px = ps.reduce((n, p) => n + p.x, 0) / ps.length; const py = Math.max(...ps.map((p) => p.bottom)); const dy = Math.max(10, (c.top - py) / 2);
    d += `M${px.toFixed(1)} ${py.toFixed(1)} C${px.toFixed(1)} ${(py + dy).toFixed(1)} ${c.x.toFixed(1)} ${(c.top - dy).toFixed(1)} ${c.x.toFixed(1)} ${c.top.toFixed(1)} `;
  }
  for (const [a, b] of model.couples) { const x = at(a), y = at(b); if (!x || !y) continue; const l = x.left < y.left ? [x, y] : [y, x]; d += `M${l[0].right.toFixed(1)} ${l[0].mid.toFixed(1)} L${l[1].left.toFixed(1)} ${l[1].mid.toFixed(1)} `; }
  svg.innerHTML = `<path d="${d}"/>`;
}
document.addEventListener('change', (e) => { const w = e.target.closest?.('[data-tree-wider]'); if (w) familyTree(w.dataset.treeWider, { wider: w.checked }); });
document.addEventListener('click', (e) => { const m = e.target.closest?.('#tree .tm[data-char]'); if (m) { const id = m.dataset.char; closeModal(); openSheet('char', id); } });

// a castle under siege (07 §8): how long it can hold, and for the besieger, terms or a storm
function siegeHtml(s, hd) {
  const p = s.meta.player; const bes = forces(s).filter((a) => a.besieging === hd.id && a.men > 0);
  const R = FORTRESS[hd.id];
  if (!hd.siege && !R) return '';
  if (!hd.siege) return `<div class="muted" style="font-size:max(0.85rem,12px);margin-top:0.3rem">${esc([R.noStorm ? 'It cannot be taken by storm' : '', R.needsSea ? 'fed by sea: starved only with a fleet before it' : '', R.mules ? 'fed by the high road until winter' : '', R.camps ? 'rivers on two sides: besiegers must lie in divided camps' : '', R.causeway ? 'from the south, only a causeway leads to it' : ''].filter(Boolean).join('; '))}.</div>`;
  const v = siegeView(s, hd, bes); const by = s.houses[hd.siege.by];
  const ours = bes.some((a) => a.owner === p || a.serving === p);
  return `<h4>The siege</h4><div class="kv"><span class="k">Besieged by</span><span>House ${esc(by?.name || '?')}, ${hd.siege.days} day${hd.siege.days === 1 ? '' : 's'}</span>
    <span class="k">Stores</span><span>~${v.months} moons${v.starve ? ` · ${esc(v.starve)}` : ''}</span>
    <span class="k">A storm</span><span>${esc(v.storm)}</span></div>
    ${ours ? `<div class="row-actions"><select class="terms" data-terms-for="${hd.id}">${Object.entries(TERMS).map(([k, t]) => `<option value="${k}">${esc(t.replace(/^./, (x) => x.toUpperCase()))}</option>`).join('')}</select><button class="btn" data-offer-terms="${hd.id}">Offer terms</button>${R?.noStorm ? '' : `<button class="btn danger" data-storm="${hd.id}" title="Heavy losses; it fails often">Storm the walls</button>`}</div>` : ''}`;
}
// a fleet (07 §9): its ships by kind, what it carries, what it is doing — and its orders
function fleetHtml(s, f, mine) {
  const h = hullsOf(s, f); const names = { longship: 'longships', galley: 'war galleys', cog: 'cogs', carrack: 'carracks' };
  const aboard = aboardOf(s, f);
  const doing = f.raid ? `reaving the coast about ${esc(placeName(s, f.raid.target))}${f.raid.done?.length ? ` (${f.raid.done.length} burned, ${fmt(f.raid.loot || 0)} dragons of plunder)` : ''}` : f.blockade ? `blockading ${esc(placeName(s, f.blockade))}` : '';
  return `<span class="k">Ships</span><span>${Object.entries(h).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${names[k] || k}`).join(', ')} · room for ${fmt(capacityOf(s, f) - carriedOf(s, f))} more men</span>
    ${aboard.length ? `<span class="k">Aboard</span><span>${aboard.map((x) => `<a href="#" data-army="${x.id}">${esc(x.name)}</a> (${fmt(x.men)})`).join(', ')}${mine && !f.march ? ` <button class="btn small" data-land="${f.id}">Put them ashore</button>` : ''}</span>` : ''}
    ${doing ? `<span class="k">Doing</span><span>${doing}</span>` : ''}`;
}
function holdingSheet(id) {
  const s = app.state; const hd = s.holdings[id]; if (!hd) return '';
  const owner = s.houses[hd.owner]; const lord = owner?.lord ? s.characters[owner.lord] : null; const p = s.meta.player;
  const chain = []; let cur = owner, g = 0; while (cur?.liege && g++ < 6) { cur = s.houses[cur.liege]; if (cur) chain.push(cur); }
  const here = Object.values(s.characters).filter((c) => placeOf(s, c) === id && c.alive); // those in a party camped here too
  const armies = forces(s).filter((a) => a.at === id);
  const mine = hd.owner === p;
  const myArmies = forces(s).filter((a) => a.owner === p);
  const fig = (f) => `${mine ? '' : '~'}${fmt(owner.figures[f].v)}`;
  return `
    <div class="detail-hero"><img class="banner" src="${banner(owner, 60, 90)}" style="width:4rem" alt=""><div><h2>${esc(hd.name)}</h2>
      <div class="muted">${esc(hd.type.replace('_', ' '))} · ${REGION_NAMES[hd.region] || ''}${hd.coastal ? ' · port' : ''}</div>
      <div>Held by <a href="#" data-house="${owner.id}">House ${esc(owner.name)}</a>${chain.length ? `<span class="muted"> · sworn to ${chain.map((c) => esc(c.name)).join(' → ')}</span>` : ''}</div></div></div>
    <div class="stat-grid">
      <div class="s"><div class="k">Smallfolk</div><div class="v">~${fmt(hd.population)}</div></div>
      <div class="s"><div class="k">Prosperity</div><div class="v">${Math.round(hd.prosperity)}</div>${meter(hd.prosperity, '#7fb85a')}</div>
      <div class="s"><div class="k">Unrest</div><div class="v">${Math.round(hd.unrest)}</div>${meter(hd.unrest, '#d0604a')}</div>
      <div class="s"><div class="k">Walls</div><div class="v">${'■'.repeat(fortOf(s, hd))}${'□'.repeat(Math.max(0, 6 - fortOf(s, hd)))}</div></div>
      <div class="s"><div class="k">Status</div><div class="v" style="font-size:max(0.9rem,12px)">${esc(hd.status)}</div></div>
      <div class="s"><div class="k">Garrison</div><div class="v">${mine ? '~' + fmt(garrisonOf(s, hd)) : hd.garrison != null ? '~' + fmt(hd.garrison) : '?'}</div></div>
    </div>
    ${siegeHtml(s, hd)}
    <div>${Object.entries(hd.resources || {}).filter(([, v]) => v >= 0.3).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<span class="pill" title="${esc(RESOURCES[k]?.desc || '')}">${RESOURCES[k]?.icon || ''} ${esc(RESOURCES[k]?.name || k)} ${v >= 2 ? '●●●' : v >= 1 ? '●●' : '●'}</span>`).join('')}</div>
    ${hd.buildings?.length ? `<div style="margin-top:0.3rem">${hd.buildings.map((b) => `<span class="pill good">${esc(b)}</span>`).join('')}</div>` : ''}
    ${owner.seat === id ? `<h4>${mine ? 'Your' : 'Rumoured'} strength of House ${esc(owner.name)}</h4><div class="kv"><span class="k">Levies</span><span>${fig('levies')}</span><span class="k">Men-at-arms</span><span>${fig('menAtArms')}</span><span class="k">Ships</span><span>${fig('ships')}</span><span class="k">Treasury</span><span>${fig('treasury')} gd</span></div>` : ''}
    ${hd.notes?.length ? `<h4>Recent</h4>${hd.notes.slice(-4).map((n) => `<div class="muted" style="font-size:max(0.85rem,12px)">${esc(n)}</div>`).join('')}` : ''}
    ${(() => { const guests = guestsAt(s, id); const gid = new Set(guests.map((c) => c.id)); const home = here.filter((c) => !gid.has(c.id));
      return `<h4>People here</h4>${home.map((c) => charRow(c)).join('') || '<div class="muted">No one of note.</div>'}${guests.length ? `<h4>Guests at ${esc(hd.name)}</h4>${guests.map((c) => charRow(c)).join('')}` : ''}`; })()}
    ${armies.length ? `<h4>Forces here</h4>${armies.map(armyRow).join('')}` : ''}
    <hr><div class="row-actions">
      ${lord && lord.alive && owner.id !== p ? `<button class="btn primary" data-talk="${lord.id}">✉ Treat with ${esc(lord.name.split(' ')[0])}</button>` : ''}
      ${myArmies.length && !mine ? `<button class="btn" data-order-tpl="Send ${esc(myArmies[0].name)} to ${esc(hd.name)} to ">Send a host here</button>` : ''}
      ${mine ? `<button class="btn" data-win-open="economy">Fund works here</button>` : ''}
      <button class="btn ghost" data-order-tpl="Regarding ${esc(hd.name)}: ">Draft an order…</button></div>`;
}

function armySheet(id) {
  const s = app.state; const p = s.meta.player; const a = s.parties[id]; if (!a) return '';
  const h = s.houses[a.owner]; const cmd = a.commander ? s.characters[a.commander] : null; const mine = a.owner === s.meta.player || a.serving === s.meta.player;
  // fog of war: a host you only have reports of shows the report, not the truth
  const v = viewOfArmies(s).get(id);
  if (!mine && v?.known === 'reported') {
    const near = Object.values(s.holdings).sort((x, y) => Math.hypot(x.pos[0] - v.pos[0], x.pos[1] - v.pos[1]) - Math.hypot(y.pos[0] - v.pos[0], y.pos[1] - v.pos[1]))[0];
    return `<div class="detail-hero"><div class="unknown-banner"></div><div><h2>${a.kind === 'fleet' ? '⛵ A fleet' : '⚔ A host'}, unconfirmed</h2><div class="muted">Said to fly the banners of <a href="#" data-house="${h.id}">House ${esc(h.name)}</a></div></div></div>
      <div class="kv"><span class="k">Men</span><span>~${fmt(v.men)}, by report</span><span class="k">Commander</span><span><i>unknown</i></span><span class="k">Riding with it</span><span><i>unknown</i></span>
      <span class="k">Last heard of</span><span>near ${esc(near?.name || '?')}, ${ageText(v.age)}</span><span class="k">Word came by</span><span>${esc(v.source)}</span></div>
      <p class="muted" style="font-size:max(0.85rem,12px)">No eyes of yours are on this host: it may have moved, grown or dwindled since — or the word may be a lie. Hosts near your lands, your hosts and your allies' are seen as they are. Plant spies in House ${esc(h.name)} (Intrigue) to follow theirs.</p>`;
  }
  return `
    <div class="detail-hero"><img class="banner" src="${banner(h, 60, 90)}" style="width:4rem" alt=""><div><h2>${a.kind === 'fleet' ? '⛵' : '⚔'} ${esc(a.name)}</h2><div class="muted"><a href="#" data-house="${h.id}">House ${esc(h.name)}</a> · ${esc(statusText(s, a))}</div></div></div>
    <div class="stat-grid">
      <div class="s"><div class="k">${a.kind === 'fleet' ? 'Crews' : 'Men'}</div><div class="v">${mine ? '' : '~'}${fmt(a.men)}</div></div>
      ${a.ships ? `<div class="s"><div class="k">Ships</div><div class="v">${fmt(a.ships)}</div></div>` : ''}
      <div class="s"><div class="k">Morale</div><div class="v">${a.morale}</div>${meter(a.morale, '#c9a44a')}</div>
      ${(() => { const sp = mine && a.kind === 'host' ? supplyOf(s, a) : null; return sp?.days != null ? `<div class="s" title="${esc(supplyText(s, a))}"><div class="k">Rations</div><div class="v ${sp.word === 'fed' ? '' : 'bad'}">${sp.word === 'starving' ? 'none' : `${Math.floor(sp.days)} days`}</div>${meter(sp.supply, sp.word === 'fed' ? '#7fb85a' : '#c96a4a')}</div>` : `<div class="s"><div class="k">Supply</div><div class="v">${a.supply ?? '?'}</div>${meter(a.supply ?? 0, '#7fb85a')}</div>`; })()}
    </div>
    <div class="kv"><span class="k">Position</span><span>${a.march ? `bound for ${esc(a.route?.toName || placeName(s, a.march.to))}${(() => { const d = daysLeft(a) ?? (s.holdings[a.march.to]?.pos && marchDays(a, a.pos, s.holdings[a.march.to].pos, s).days); return d ? ` · ~${Math.max(1, Math.round(d))} days away${a.route ? ` (${fmt(a.route.miles)} miles by the road it takes)` : ''}` : ''; })()}` : a.at ? esc(placeName(s, a.at)) : 'in the field'}</span>
    ${mine && a.kind === 'host' && supplyOf(s, a).days != null ? (() => { const sp = supplyOf(s, a); const land = provinceOf(s, a); return `<span class="k">Supply</span><span>${esc(supplyText(s, a))} · ${fmt(sp.wagons)} wagons, eats ${fmt(sp.need)} rations a day${land?.devastation >= 20 ? ` · the lands about ${esc(land.name)} are ${land.devastation >= 70 ? 'stripped bare' : 'picked over'}` : ''}</span>`; })() : ''}
    ${a.kind === 'fleet' ? fleetHtml(s, a, mine) : ''}
    ${a.aboard ? `<span class="k">At sea</span><span>aboard <a href="#" data-army="${a.aboard}">${esc(s.parties[a.aboard]?.name || 'ship')}</a></span>` : ''}
    ${mine && a.kind === 'host' && !a.aboard && !a.march ? (() => { const fl = forces(s).find((x) => x.kind === 'fleet' && x.owner === a.owner && !x.march && Math.hypot(x.pos[0] - a.pos[0], x.pos[1] - a.pos[1]) <= 12); return fl ? `<span class="k">In port</span><span>${esc(fl.name)} lies here · <button class="btn small" data-embark="${a.id}" data-fleet="${fl.id}">Go aboard</button></span>` : ''; })() : ''}
    ${mine && a.kind === 'host' ? `<span class="k">Standing orders</span><span><select class="standing" data-standing="${a.id}" title="What the host does when an enemy host comes within reach">${Object.entries(STANDING).map(([k, v]) => `<option value="${k}"${(a.standing || 'favourable') === k ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select></span>` : ''}
    <span class="k">Composition</span><span>${esc(a.composition || '—')}</span><span class="k">Reported</span><span>${esc(a.asOf || '')}</span></div>
    ${cmd ? `<h4>Commander</h4>${charRow(cmd)}` : ''}
    ${(() => {
      const with_ = membersOf(s, a).filter((c) => c.alive && c.id !== a.commander);
      // only what the house knows: seen hosts as they are, reported ones where the word put them
      const known = viewOfArmies(s);
      const foes = forces(s).filter((b) => atWar(s, a.owner, b.owner) && known.has(b.id)).map((b) => { const k = known.get(b.id); const seen = k.known === 'seen'; const bb = seen ? b : { ...b, pos: k.pos, men: k.men, morale: 70, supply: 80, commander: null }; return { b: bb, seen, m: marchDays(a, a.pos, bb.pos), o: battleOdds(s, a, bb) }; }).sort((x, y) => x.m.days - y.m.days).slice(0, 4);
      const targets = a.kind === 'fleet' ? [] : Object.values(s.holdings).filter((h) => atWar(s, a.owner, h.owner)).map((h) => ({ h, m: marchDays(a, a.pos, h.pos) })).sort((x, y) => x.m.days - y.m.days).slice(0, 3);
      // what it is made of (seen hosts only), and the banners in it
      const banners = sworn(a).filter(([, n]) => n > 0).map(([h, n]) => `${esc(s.houses[h]?.name || h)} ${n.toLocaleString('en-GB')}`);
      return (a.kind !== 'fleet' && (a.owner === p || known.get(a.id)?.known === 'seen') ? `<h4>The host</h4><div class="muted" style="font-size:max(0.88rem,12px)">${esc(unitsText(s, a))}${banners.length ? `<br>Banners: House ${esc(s.houses[a.owner]?.name)}, ${banners.join(', ')}` : ''}</div>` : '')
        + (with_.length ? `<h4>Riding with the host</h4>${with_.map((c) => charRow(c)).join('')}` : '')
        + (foes.length ? `<h4>War room — enemy hosts</h4>${foes.map(({ b, m, o, seen }) => `<div class="row clickable" data-army="${b.id}">${seen ? sig(s.houses[b.owner]) : '<span class="unknown-dot"></span>'}<div class="grow"><div class="title">${seen ? esc(b.name) : 'An unconfirmed host'} <span class="muted">~${fmt(b.men)}</span></div><div class="sub">${m.days} days' march (${m.miles} mi) · if you attack: <b style="color:${o.attacker >= 60 ? '#a8e08a' : o.attacker >= 40 ? '#ffe0a0' : '#ec9a8a'}">${o.attacker}%</b></div></div></div>`).join('')}` : '')
        + (targets.length ? `<h4>Enemy holdings in reach</h4>${targets.map(({ h, m }) => { const e = siegeEstimate(s, h, [a]); return `<div class="row clickable" data-hold="${h.id}"><div class="grow"><div class="title">${esc(h.name)}</div><div class="sub">${m.days} days · walls ${e.fort}/6 · a siege would take ~${e.months} moons · ${esc(e.storm)}</div></div></div>`; }).join('')}` : '');
    })()}
    ${mine && a.owner === p ? musterHtml(a) : ''}
    ${mine && a.kind !== 'fleet' ? `<h4>How it marches</h4><div class="row-actions secrecy"><button class="btn small${(a.secrecy || 'open') === 'open' && !a.feint ? ' on' : ''}" data-secrecy="open" data-army-id="${a.id}" title="On the roads, banners flying: the realm hears of it">Openly</button><button class="btn small${a.secrecy === 'hidden' ? ' on' : ''}" data-secrecy="hidden" data-army-id="${a.id}" title="By night and off the roads, a little slower: the realm loses track of it">In secret</button><button class="btn small${a.feint ? ' on' : ''}" data-feint="${a.id}" title="Spread word that it marches somewhere else">${a.feint ? `Feint: ${esc(s.holdings[a.feint]?.name || '')}` : 'Feint…'}</button></div>` : ''}
    ${mine ? `<hr><div class="row-actions"><button class="btn primary" data-march="${a.id}">⤳ March to…</button><button class="btn" data-order-tpl="${esc(a.name)} is to ">Give orders…</button><button class="btn danger" data-order-tpl="Disband ${esc(a.name)} and send the men home to their fields.">Disband</button></div>` : ''}`;
}

// The muster (07 §3.4; 12 §8): who is with the host, who is on its road and when they will come, who is still expected
// and who refused — the engine's own days — and, while the banners are coming, March now or Wait for the banners.
const STAGE = { letter: 'the raven is on the wing', deliberating: 'weighing the call', gathering: 'gathering at home', delayed: 'delays, with excuses' };
function musterHtml(a) {
  const s = app.state; const m = musterOf(s, a.id);
  if (!m || !(m.present.length + m.road.length + m.expected.length + m.refused.length)) return '';
  const today = dayNumber(s.meta.date); const when = (d) => (d ? (d <= today ? 'any day now' : `~${d - today} days · ${dateStr(dateOfDay(d))}`) : '—');
  const name = (h) => `<a href="#" data-house="${h}">${esc(s.houses[h]?.name || h)}</a>`;
  const rows = (xs, f) => xs.map((x) => `<div class="mu-row">${sig(s.houses[x.house])}<span class="grow">${name(x.house)}</span>${f(x)}</div>`).join('');
  const here = m.present.reduce((n, x) => n + x.men, 0); const coming = m.road.reduce((n, x) => n + (x.men || 0), 0) + m.expected.reduce((n, x) => n + (x.men || 0), 0);
  const w = a.wait;
  return `<h4>The muster <span class="muted">— ${fmt(here)} with the host, ~${fmt(coming)} to come</span></h4><div class="muster">
    ${m.present.length ? `<div class="mu-h">Present</div>${rows(m.present, (x) => `<span class="mu-n">${fmt(x.men)}</span>`)}` : ''}
    ${m.road.length ? `<div class="mu-h">On the road</div>${rows(m.road, (x) => `<span class="mu-n">${fmt(x.men)}</span><span class="mu-d">${x.bySea ? 'by sea, when ships are found' : when(x.eta)}</span>`)}` : ''}
    ${m.expected.length ? `<div class="mu-h">Expected</div>${rows(m.expected, (x) => `<span class="mu-s">${STAGE[x.stage] || ''}</span><span class="mu-d">${x.bySea ? 'then by sea' : when(x.eta)}</span>`)}` : ''}
    ${m.refused.length ? `<div class="mu-h">Refused</div>${rows(m.refused, () => '<span class="mu-s">stays at home</span>')}` : ''}
  </div>
  ${m.road.length + m.expected.length ? `<div class="row-actions">${w ? `<span class="muted grow">Waiting for the banners: ${Math.round(w.share * 100)}% of the men called, or ${when(w.until)}${w.to ? `; then to ${esc(placeName(s, w.to))}` : ''}</span>` : ''}<button class="btn small" data-march="${a.id}" title="March now: the banners still coming will follow the host wherever it goes">March now — the banners will follow</button>${w ? '' : `<button class="btn small" data-wait-banners="${a.id}" title="Hold here until eight in ten of the men called are with the host (or the last expected is overdue), then march where it was bound">Wait for the banners</button>`}</div>` : ''}`;
}
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-offer-terms]'); if (t) { const h = t.dataset.offerTerms; const terms = document.querySelector(`select[data-terms-for="${h}"]`)?.value || 'march_out_with_arms'; doVerb('offer_terms', { holding: h, terms }, { after: () => renderSheet() }); }
  const st = e.target.closest('[data-storm]'); if (st) doVerb('storm', { holding: st.dataset.storm }, { after: () => renderSheet() });
});
document.addEventListener('click', (e) => {
  const l = e.target.closest('[data-land]'); if (l) doVerb('land_host', { fleet: l.dataset.land }, { after: () => renderSheet() });
  const em = e.target.closest('[data-embark]'); if (em) doVerb('embark_host', { army: em.dataset.embark, fleet: em.dataset.fleet }, { after: () => renderSheet() });
});
document.addEventListener('change', (e) => { const sel = e.target.closest('select[data-standing]'); if (sel) doVerb('set_standing_orders', { army: sel.dataset.standing, engage: sel.value }, { after: () => renderSheet() }); });
document.addEventListener('click', (e) => { const b = e.target.closest('[data-wait-banners]'); if (b) doVerb('wait_banners', { army: b.dataset.waitBanners, share: 0.8 }, { after: () => renderSheet() }); });

function houseSheet(id) {
  const s = app.state; const h = s.houses[id]; if (!h) return '';
  const p = s.meta.player; const lord = h.lord ? s.characters[h.lord] : null;
  const members = Object.values(s.characters).filter((c) => c.house === id).sort((a, b) => (b.alive - a.alive) || (a.born || 0) - (b.born || 0));
  const liege = h.liege ? s.houses[h.liege] : null; const vas = vassalsOf(s, id);
  const tot = realmTotals(s, id); const mine = id === p;
  return `
    <div class="detail-hero"><img class="banner" src="${banner(h, 80, 120)}" style="width:5rem" alt=""><div><h2>House ${esc(h.name)}</h2><div class="words">${esc(h.words ? '“' + h.words + '”' : '')}</div>
      <div class="muted">${esc(h.title || RANK_NAMES[h.rank])} · ${REGION_NAMES[h.region] || ''}</div>
      <div class="muted">${liege ? `Sworn to <a href="#" data-house="${liege.id}">${esc(liege.name)}</a>` : 'Answers to no one'}</div></div></div>
    ${!mine ? `<div class="kv" style="margin-top:0.5rem"><span class="k">Relation</span><span>${relHtml(getRelation(s, p, id))}</span>${liege && liege.id === p ? `<span class="k">Obligations</span><span>${obligationPills(h)}</span>` : ''}</div>` : ''}
    <div class="stat-grid"><div class="s"><div class="k">${mine ? '' : 'Rumoured '}levies</div><div class="v">~${fmt(tot.levies)}</div></div><div class="s"><div class="k">Men-at-arms</div><div class="v">~${fmt(tot.menAtArms)}</div></div><div class="s"><div class="k">Ships</div><div class="v">~${fmt(tot.ships)}</div></div></div>
    ${lord ? `<h4>Lord</h4>${charRow(lord)}` : ''}
    <h4>Members${(lord || members[0]) ? `<button class="btn small" data-tree="${(lord || members[0]).id}" style="float:right">Family tree</button>` : ''}</h4>${members.filter((c) => c.id !== h.lord).slice(0, 14).map((c) => charRow(c, { showHouse: false })).join('') || '<div class="muted">No one known.</div>'}
    ${vas.length ? `<h4>Vassals</h4>${vas.map((v) => houseRow(s.houses[v])).join('')}` : ''}
    ${!mine ? `<hr><div class="row-actions">
      ${lord?.alive ? `<button class="btn primary" data-talk="${lord.id}">✉ Treat with ${esc(lord.name.split(' ')[0])}</button>` : ''}
      <button class="btn" data-propose="alliance" data-target="${id}">Propose alliance</button>
      <button class="btn" data-propose="marriage" data-target="${id}">Propose marriage</button>
      <button class="btn" data-propose="trade" data-target="${id}">Trade pact</button>
      <button class="btn" data-order-tpl="Embargo House ${esc(h.name)}: no trade with their lands or ships. ">Embargo</button>
      ${h.liege !== p ? `<button class="btn" data-propose="fealty" data-target="${id}">Demand fealty</button>` : ''}
      <button class="btn" data-gift="${id}">🎁 Send a gift</button>
      <button class="btn danger" data-declare="${id}">⚔ Declare war</button></div>` : ''}`;
}

// proposals open an audience with the lord, pre-filled
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-propose]'); if (!b) return;
  const s = app.state; const h = s.houses[b.dataset.target]; const lord = h.lord && s.characters[h.lord];
  if (!lord?.alive) return toast('There is no lord to treat with.', true);
  const me = player();
  const text = { alliance: `House ${me.name} proposes an alliance with House ${h.name}. What would you ask in return?`, marriage: `I would bind our houses by marriage. Whom of yours would you offer, and whom of mine would you accept?`, trade: `Let our merchants trade freely: your goods for ours, with fair tolls. What say you?`, fealty: `I call upon House ${h.name} to bend the knee and swear fealty to House ${me.name}.` }[b.dataset.propose];
  app.openChat(lord.id, text);
});
document.addEventListener('click', (e) => { const w = e.target.closest('[data-win-open]'); if (w) openWindow(w.dataset.winOpen); });

// ── the lord's own acts, settled by the engine at once (engine/actions: court, diplomacy, military verbs) ──
const courtAct = (verb, params = {}, after) => doVerb(verb, params, { after });
document.addEventListener('click', async (e) => {
  const g = e.target.closest('[data-gift]');
  if (g) {
    const s = app.state; const c = s.characters[g.dataset.gift]; const h = c ? s.houses[c.house] : s.houses[g.dataset.gift];
    const have = Math.floor(Number(player().figures.treasury.v) || 0); const start = Math.min(have, 1000);
    modal(`<h2>🎁 A gift for ${esc(c ? c.name : 'House ' + h.name)}</h2><p class="muted">Gold speaks every tongue — though what is a fortune to a hedge lord is nothing to the Lannisters. Their treasury: ~${fmt(h.figures.treasury.v)} dragons.</p>
      <div class="scale-row"><input type="range" id="gift-n" min="50" max="${Math.max(50, have)}" step="50" value="${start}" style="flex:1"><b id="gift-v">${fmt(start)}</b>&nbsp;dragons</div>
      <div class="report-actions"><button class="btn ghost" data-action="close-modal">Not now</button><button class="btn primary" id="gift-go">Send it</button></div>`);
    $('#gift-n').oninput = (ev) => { $('#gift-v').textContent = fmt(Number(ev.target.value)); };
    $('#gift-go').onclick = () => courtAct('send_gift', { to: g.dataset.gift, gold: Number($('#gift-n').value) }, () => $('#modal').classList.add('hidden'));
    return;
  }
  const j = e.target.closest('[data-judge]');
  if (j) {
    const c = app.state.characters[j.dataset.who];
    if (j.dataset.judge === 'execute' && !await confirmModal(`Take ${c.name}'s head?`, `House ${app.state.houses[c.house]?.name || ''} will never forget it, and neither will the realm. A lord who passes the sentence should swing the sword.`, { yes: 'Pass the sentence', no: 'Stay your hand', danger: true })) return;
    courtAct('judge_prisoner', { character: c.id, verdict: j.dataset.judge });
    return;
  }
  const d = e.target.closest('[data-declare]');
  if (d) {
    const h = app.state.houses[d.dataset.declare];
    modal(`<h2>⚔ War on House ${esc(h.name)}</h2><p>Once the heralds ride, there is no calling them back. ${player().liege === h.id ? '<b>They are your liege: this is rebellion.</b>' : ''}</p><label>Your cause, for the heralds to cry</label><input class="input" id="cb-text" placeholder="e.g. the murder of my father; the lands they stole at the Twins">
      <div class="report-actions"><button class="btn ghost" data-action="close-modal">Stay your hand</button><button class="btn danger" id="cb-go">Declare war</button></div>`);
    $('#cb-go').onclick = () => courtAct('declare_war', { house: h.id, reason: $('#cb-text').value.trim() }, () => $('#modal').classList.add('hidden'));
    return;
  }
  const f = e.target.closest('[data-court]');
  if (f) courtAct({ feast: 'hold_feast', tourney: 'hold_tourney' }[f.dataset.court]);
  const sc = e.target.closest('[data-secrecy]');
  if (sc) courtAct('set_secrecy', { army: sc.dataset.armyId, mode: sc.dataset.secrecy });
  const fe = e.target.closest('[data-feint]');
  if (fe) {
    const s = app.state; const a = s.parties[fe.dataset.feint];
    const opts = Object.values(s.holdings).filter((h) => h.region !== 'essos' && h.region !== 'beyond').sort((x, y) => x.name.localeCompare(y.name));
    modal(`<h2>A feint</h2><p>Let the realm believe that ${esc(a.name)} marches somewhere it does not. Heralds, loose tongues in the taverns, a letter left to be found. Those who see the host with their own eyes will not be fooled.</p>
      <label>Spread word that it marches on</label><select class="input" id="feint-to">${opts.map((h) => `<option value="${h.id}"${a.feint === h.id ? ' selected' : ''}>${esc(h.name)}</option>`).join('')}</select>
      <div class="report-actions"><button class="btn ghost" data-action="close-modal">Cancel</button>${a.feint ? '<button class="btn" id="feint-off">End the feint</button>' : ''}<button class="btn primary" id="feint-go">Spread the word</button></div>`);
    $('#feint-go').onclick = () => courtAct('set_secrecy', { army: a.id, mode: 'feint', to: $('#feint-to').value }, () => $('#modal').classList.add('hidden'));
    const off = $('#feint-off'); if (off) off.onclick = () => courtAct('set_secrecy', { army: a.id, mode: 'open' }, () => $('#modal').classList.add('hidden'));
  }
});
