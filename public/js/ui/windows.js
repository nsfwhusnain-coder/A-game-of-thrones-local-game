// Side windows & detail sheets (CK3-style panels).
import { app, $, $$, esc, fmt, placeName, getRelation, api, toast, relHtml, sig, banner, por, player, ruler, meter, charRow, houseRow, armyRow, addOrder, modal, sparkline, REGION_NAMES, RANK_NAMES } from './common.js';
import { FIGURE_LABELS, realmOf, realmTotals, vassalsOf, childrenOf, siblingsOf } from '../shared/world.js';
import { project, PROJECT_TEMPLATES, RESOURCES, TAX_LEVELS, SEASONS } from '../shared/economy.js';
import { SKILL_NAMES, SKILL_ICONS } from '../../data/families.js';
import { vassalTemper } from '../shared/vassals.js';
import { disposition } from '../shared/diplomacy.js';
import { atWar, battleOdds, marchDays, siegeEstimate } from '../shared/warfare.js';

const TITLES = { realm: 'The Realm', council: 'Council', military: 'Military', economy: 'Treasury & Economy', diplomacy: 'Diplomacy', intrigue: 'Intrigue', people: 'People of the Realm' };

export function openWindow(name, arg) {
  if (app.win === name && arg === undefined) return closeWindow();
  app.win = name; app.winArg = arg;
  $('#window').classList.remove('hidden');
  $('#win-title').textContent = TITLES[name] || name;
  $$('#action-ring button').forEach((b) => b.classList.toggle('active', b.dataset.win === name));
  $('#sheet').classList.remove('solo');
  renderWindow();
}
export function closeWindow() { app.win = null; $('#window').classList.add('hidden'); $$('#action-ring button').forEach((b) => b.classList.remove('active')); $('#sheet').classList.add('solo'); }
export function renderWindow() {
  if (!app.win || !app.state) return;
  const body = $('#win-body');
  const fn = { realm, council, military, economy, diplomacy, intrigue, people }[app.win];
  body.innerHTML = fn ? fn() : '';
  wire[app.win]?.(body);
}

// ───────────── Realm ─────────────
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
      <div class="muted">Sworn to: ${liege ? `<a href="#" data-house="${liege.id}">${esc(liege.name)}</a>` : '<b>no one</b>'}</div></div></div>
    <div class="stat-grid">
      <div class="s"><div class="k">Smallfolk</div><div class="v">~${fmt(Math.round(pop / 1000))}k</div></div>
      <div class="s"><div class="k">Realm levies</div><div class="v">~${fmt(tot.levies)}</div></div>
      <div class="s"><div class="k">Men-at-arms</div><div class="v">~${fmt(tot.menAtArms)}</div></div>
      <div class="s"><div class="k">Ships</div><div class="v">~${fmt(tot.ships)}</div></div>
      <div class="s"><div class="k">Vassals</div><div class="v">${vas.length}</div></div>
      <div class="s"><div class="k">Holdings</div><div class="v">${holdings.length}</div></div>
    </div>
    <div class="section"><h4>Your holdings</h4>${holdings.map((x) => `<div class="row clickable" data-hold="${x.id}"><div class="grow"><div class="title">${esc(x.name)} ${x.status !== 'normal' ? `<span class="pill bad">${esc(x.status)}</span>` : ''}</div>
      <div class="sub">~${fmt(x.population)} souls · walls ${'■'.repeat(x.fort || 0)}${'□'.repeat(Math.max(0, 5 - (x.fort || 0)))} · ${Object.entries(x.resources || {}).filter(([, v]) => v >= 0.5).map(([k]) => RESOURCES[k]?.icon || '').join(' ')}</div>
      <div style="display:flex;gap:0.5rem"><div style="flex:1" title="Prosperity ${x.prosperity}">${meter(x.prosperity, '#7fb85a')}</div><div style="flex:1" title="Unrest ${x.unrest}">${meter(x.unrest, '#d0604a')}</div></div></div>${x.id !== h.seat && vas.length ? `<button class="btn small" data-grant="${x.id}">Grant…</button>` : ''}</div>`).join('')}</div>
    <div class="section"><h4>Sworn vassals</h4>${vas.map((v) => vassalRow(s.houses[v])).join('') || '<div class="muted">None.</div>'}</div>`;
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
  const onCouncil = Object.values(s.characters).filter((c) => c.alive && c.roles.includes('council') && s.houses[c.house] && (c.house === p || realmOf(s, c.house) === p || (p === 'baratheon' && c.loc === 'baratheon')));
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
  const mine = Object.values(s.armies).filter((a) => a.owner === p || s.houses[a.owner]?.liege === p);
  const others = Object.values(s.armies).filter((a) => !mine.includes(a)).sort((a, b) => (app.map?.atWarWith(b.owner) ? 1 : 0) - (app.map?.atWarWith(a.owner) ? 1 : 0));
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
    <div class="section"><h4>Vassal levies</h4>${vas.map((v) => `<div class="row clickable" data-house="${v.id}">${sig(v)}<div class="grow"><div class="title">${esc(v.name)}</div><div class="sub">~${fmt(v.figures.levies.v)} levies · ${fmt(v.figures.menAtArms.v)} men-at-arms · ${temperWord(vassalTemper(s, v.id))}</div></div>${obligationPills(v)}</div>`).join('') || '<div class="muted">You have no vassals.</div>'}</div>
    <div class="section"><h4>Known forces</h4>${others.map(armyRow).join('')}</div>`;
}

// ───────────── Economy ─────────────
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
      <div><div class="muted" style="font-size:0.75rem">TREASURY</div><div class="big-num">${fmt(h.figures.treasury.v)} <small style="font-size:0.9rem">gold dragons</small></div>
      <div class="muted" style="font-size:0.78rem">${esc(h.figures.treasury.src)} · ${esc(h.figures.treasury.asOf)}${h.figures.debt?.v ? ` · <span style="color:#ec9a8a">debt ${fmt(h.figures.debt.v)}</span>` : ''}</div></div>
      ${steward ? `<button class="btn small" data-talk="${steward.id}">Ask ${esc(steward.name.split(' ').slice(-1)[0])}</button>` : ''}
    </div>
    ${sparkline(hist)}
    <div class="section"><h4>Steward's projection — next moon</h4>
      <div class="kv"><span class="k">Your lands</span><span>~${fmt(pr.own)}</span><span class="k">Vassal tribute</span><span>~${fmt(pr.tribute)}</span>
      <span class="k">Hosts & fleets</span><span>−${fmt(pr.upkeep)}</span><span class="k">Men-at-arms & guard</span><span>−${fmt(pr.household)}</span><span class="k">Court</span><span>−${fmt(pr.court)}</span>
      ${pr.owed ? `<span class="k">Owed to your liege</span><span>−${fmt(pr.owed)}</span>` : ''}${pr.interest ? `<span class="k">Interest</span><span>−${fmt(pr.interest)}</span>` : ''}${pr.projects ? `<span class="k">Works</span><span>−${fmt(pr.projects)}</span>` : ''}
      <span class="k"><b>Net</b></span><span><b>${fmt(pr.low)} … ${fmt(pr.high)}</b> <span class="muted">(luck, harvests and loyalty decide)</span></span></div>
      <p class="muted" style="font-size:0.8rem">${esc(season.label)}: ${esc(s.world?.seasonNote || season.note)}</p></div>
    <div class="section"><h4>Taxation</h4><div class="tpl-grid">${Object.entries(TAX_LEVELS).map(([k, t]) => `<div class="tpl" data-tax="${k}" style="${k === tax ? 'border-color:var(--gold2);background:#2d2217' : ''}"><b>${t.label}${k === tax ? ' ✓' : ''}</b><div class="c">${esc(t.desc)}</div></div>`).join('')}</div></div>
    ${h.liege && s.houses[h.liege] ? (() => { const cur = h.obligations?.tribute || 'paying'; const D = { paying: ['Pay in full', 'What is owed, on time. Your liege is content.'], late: ['Pay late', 'Excuses and partial sums. Patience wears thin.'], withholding: ['Withhold', 'Keep the gold. Your liege will notice, and will act.'] }; return `<div class="section"><h4>Dues to House ${esc(s.houses[h.liege].name)}</h4><div class="tpl-grid">${Object.entries(D).map(([k, [t, d]]) => `<div class="tpl" data-dues="${k}" style="${k === cur ? 'border-color:var(--gold2);background:#2d2217' : ''}"><b>${t}${k === cur ? ' ✓' : ''}</b><div class="c">${d}</div></div>`).join('')}</div></div>`; })() : ''}
    ${L ? `<div class="section"><h4>Last accounts — ${esc(L.date)} (${L.days} days)${L.reporter ? ', by ' + esc(L.reporter) : ''}</h4><table class="ledger">
      ${L.lines.map((l) => `<tr class="${l.kind === 'income' ? 'inc' : 'exp'} ${l.note && /withheld|late|short/.test(l.note) ? 'warn' : ''}"><td>${esc(l.label)}${l.note ? `<div class="note">${esc(l.note)}${l.expected ? ` — expected ~${fmt(l.expected)}` : ''}</div>` : ''}${l.detail ? `<div class="note">${l.detail.filter((d) => d.amount).slice(0, 6).map((d) => `${esc(d.label)} ${fmt(d.amount)}${d.note ? ' (' + esc(d.note) + ')' : ''}`).join(' · ')}</div>` : ''}</td><td class="n">${l.kind === 'income' ? '+' : '−'}${fmt(l.amount)}</td></tr>`).join('')}
      <tr class="sum"><td>Net</td><td class="n">${L.net >= 0 ? '+' : ''}${fmt(L.net)}</td></tr></table></div>` : '<p class="muted">No accounts yet — the first reckoning comes when time advances.</p>'}
    <div class="section"><h4>Works & projects</h4>${projs.filter((x) => x.status === 'active').map((x) => `<div class="proj"><div style="display:flex;justify-content:space-between"><b>${esc(x.name)}</b><button class="btn small danger" data-cancel-proj="${x.id}">Cancel</button></div><div class="muted" style="font-size:0.78rem">${fmt(Math.round(x.cost - x.remaining))} / ${fmt(x.cost)} gd · ${Math.round(x.monthsLeft * 10) / 10} moons left</div>${meter(100 - (x.monthsLeft / x.months) * 100)}</div>`).join('') || '<div class="muted" style="font-size:0.85rem">Nothing under way.</div>'}
      ${projs.filter((x) => x.status === 'complete').slice(-3).map((x) => `<div class="muted" style="font-size:0.8rem">✓ ${esc(x.name)}</div>`).join('')}
      <h4 style="margin-top:0.8rem">Fund new works</h4>
      <label>At</label><select id="proj-hold">${holdings.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select>
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
    <div class="section"><h4>Wars</h4>${wars.map((w) => `<div class="row"><div class="grow"><div class="title">${esc(w.name)} ${w.attackers.includes(p) || w.defenders.includes(p) ? '<span class="pill war">your war</span>' : ''}</div><div class="sub">${w.attackers.map((x) => esc(s.houses[x]?.name)).join(', ')} ⚔ ${w.defenders.map((x) => esc(s.houses[x]?.name)).join(', ')} · since ${esc(w.started)}</div></div></div>`).join('') || '<div class="muted">Peace — for now.</div>'}</div>
    <div class="section"><h4>Pacts & agreements</h4>${pacts.map((x) => `<div class="row"><div class="grow"><div class="title">${esc(x.type)} · ${esc(s.houses[x.a]?.name)} & ${esc(s.houses[x.b]?.name)} <span class="pill">${esc(x.status)}</span></div><div class="sub" title="${esc(x.terms)}">${esc(x.terms)}</div></div></div>`).join('') || '<div class="muted">None.</div>'}</div>
    <div class="section"><h4>The great powers</h4>${tops.map((x) => houseRow(x)).join('')}</div>
    ${neighbours.length ? `<div class="section"><h4>Fellow vassals of ${esc(s.houses[player().liege]?.name)}</h4>${neighbours.map((x) => houseRow(x)).join('')}</div>` : ''}`;
}

// ───────────── Intrigue ─────────────
function intrigue() {
  const s = app.state, p = s.meta.player;
  const spy = Object.values(s.characters).find((c) => c.alive && c.roles.includes('spymaster') && (c.house === p || (p === 'baratheon' && c.loc === 'baratheon')));
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
      <p class="muted" style="font-size:0.8rem">Schemes are resolved by the world when time advances. They may take months, fail, or be discovered — with consequences.</p></div>
    <div class="section"><h4>Whispers & intrigue</h4>${recent.map((e) => `<div class="event"><div class="et">${esc(e.title)}</div><div class="eb">${esc(e.text)}</div><div class="meta">${esc(e.date)}</div></div>`).join('') || '<div class="muted">Nothing yet.</div>'}</div>`;
}

// ───────────── People ─────────────
function people() {
  const s = app.state;
  const houses = [...new Set(Object.values(s.characters).map((c) => c.house))].filter((h) => s.houses[h]).sort((a, b) => s.houses[a].name.localeCompare(s.houses[b].name));
  return `<input class="input" id="people-filter" placeholder="Search names, titles, places…" value="${esc(app.peopleFilter)}">
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
        try { const r = await api(`/games/${app.saveId}/act`, { body: { kind: 'call_banners', vassals, at: $('#bn-at', f).value, deadline: $('#bn-dl', f).value, note: $('#bn-note', f).value } }); app.setState(r.state); toast(`Ravens fly to ${vassals.length} houses. Their answers will come as time passes.`); } catch (e) { toast(e.message, true); }
      };
    };
    $$('[data-march]', body).forEach((b) => b.onclick = () => app.startPick('march', b.dataset.march));
    $$('[data-disband]', body).forEach((b) => b.onclick = async () => {
      if (!confirm('Disband this host? Most of the men will go home to their fields.')) return;
      try { const r = await api(`/games/${app.saveId}/act`, { body: { kind: 'disband', army: b.dataset.disband } }); app.setState(r.state); toast('The host disbands.'); } catch (e) { toast(e.message, true); }
    });
    $('#raise-levies', body).onclick = () => {
      const s = app.state, p = s.meta.player, h = player();
      const holds = Object.values(s.holdings).filter((x) => x.owner === p);
      const cmds = Object.values(s.characters).filter((c) => c.alive && c.house === p && c.age >= 14 && c.status === 'free' && !String(c.loc).startsWith('army:'));
      const max = Number(h.figures.levies.v) || 0;
      modal(`<h2>Raise your levies</h2><p class="muted">Your own smallfolk answer you directly — your vassals must be called separately. Men in the field cost coin every moon and leave the fields untended.</p>
        <label>Men: <b id="rl-n">${Math.round(max / 2)}</b> of ~${fmt(max)}</label><input type="range" id="rl-men" min="50" max="${max}" step="50" value="${Math.round(max / 2)}" style="width:100%">
        <label>Muster at</label><select id="rl-at">${holds.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select>
        <label>Commander</label><select id="rl-cmd"><option value="">— none —</option>${cmds.map((c) => `<option value="${c.id}">${esc(c.name)} (⚔ ${c.skills?.[1] ?? '?'})</option>`).join('')}</select>
        <label>Name</label><input class="input" id="rl-name" placeholder="e.g. The Wolfswood Levies">
        <div class="row-actions"><button class="btn primary" id="rl-go">Raise them</button></div>`);
      $('#rl-men').oninput = (e) => { $('#rl-n').textContent = e.target.value; };
      $('#rl-go').onclick = async () => {
        try { const r = await api(`/games/${app.saveId}/act`, { body: { kind: 'raise', men: Number($('#rl-men').value), at: $('#rl-at').value, commander: $('#rl-cmd').value, name: $('#rl-name').value || undefined } }); app.setState(r.state); $('#modal').classList.add('hidden'); toast('The levies are called. They muster now.'); } catch (e) { toast(e.message, true); }
      };
    };
  },
  economy(body) {
    $$('[data-tax]', body).forEach((el) => el.onclick = async () => { try { const r = await api(`/games/${app.saveId}/act`, { body: { kind: 'tax', level: el.dataset.tax } }); app.setState(r.state); toast(`Taxes set to ${TAX_LEVELS[el.dataset.tax].label.toLowerCase()}. Your lords will notice.`); } catch (e) { toast(e.message, true); } });
    $$('[data-dues]', body).forEach((el) => el.onclick = async () => { try { const r = await api(`/games/${app.saveId}/act`, { body: { kind: 'dues', status: el.dataset.dues } }); app.setState(r.state); toast(el.dataset.dues === 'paying' ? 'Your dues will be paid in full.' : el.dataset.dues === 'late' ? 'Your steward will find reasons for delay.' : 'Not a single dragon goes to your liege.'); } catch (e) { toast(e.message, true); } });
    $$('[data-proj]', body).forEach((el) => el.onclick = async () => { try { const r = await api(`/games/${app.saveId}/act`, { body: { kind: 'project', template: el.dataset.proj, holding: $('#proj-hold', body).value } }); app.setState(r.state); toast('Work begins. Coin will flow out each moon until it is done.'); } catch (e) { toast(e.message, true); } });
    $$('[data-cancel-proj]', body).forEach((el) => el.onclick = async () => { try { const r = await api(`/games/${app.saveId}/act`, { body: { kind: 'cancel_project', project: el.dataset.cancelProj } }); app.setState(r.state); } catch (e) { toast(e.message, true); } });
  },
  intrigue(body) {
    $('#plot-go', body).onclick = () => {
      const kind = $('#plot-kind', body).selectedOptions[0].text.replace('…', ''); const t = app.state.houses[$('#plot-target', body).value];
      addOrder(`[SECRET SCHEME] ${kind} House ${t.name}. ${$('#plot-means', body).value}`.trim()); toast('The scheme is added to your orders — in secret.');
    };
  },
  people(body) {
    const draw = () => {
      const s = app.state; const q = app.peopleFilter.toLowerCase();
      const list = Object.values(s.characters).filter((c) => (app.peopleDead || c.alive) && (!app.peopleHouse || c.house === app.peopleHouse) && (!q || `${c.name} ${c.title} ${s.houses[c.house]?.name} ${placeName(s, c.loc)}`.toLowerCase().includes(q)));
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
    const cands = Object.values(s.characters).filter((c) => c.alive && c.id !== player().lord && (c.house === p || c.loc === seat) && c.age >= 14 && c.status === 'free');
    modal(`<h2>Appoint a ${esc(label)}</h2><p class="muted">Choose from your household, wards and guests. Or describe whom you seek and the realm will find someone.</p>
      ${cands.map((c) => `<div class="row clickable" data-appoint-pick="${c.id}"><img class="por" src="${por(c, 64)}"><div class="grow"><div class="title">${esc(c.name)}</div><div class="sub">${esc(c.title || c.roles.join(', '))} · ${SKILL_NAMES.map((n, i) => `${SKILL_ICONS[i]}${c.skills?.[i] ?? '?'}`).join(' ')}</div></div></div>`).join('') || '<p class="muted">No one suitable at your seat.</p>'}
      <hr><label>Or seek someone new</label><input class="input" id="seek-text" placeholder="e.g. a hard old knight from the mountain clans who knows siegecraft"><div class="row-actions"><button class="btn" id="seek-go">Send word</button></div>`);
    $$('[data-appoint-pick]').forEach((r) => r.onclick = async () => { try { const res = await api(`/games/${app.saveId}/act`, { body: { kind: 'appoint', character: r.dataset.appointPick, role } }); app.setState(res.state); $('#modal').classList.add('hidden'); toast(`${s.characters[r.dataset.appointPick].name} is now your ${label}.`); } catch (err) { toast(err.message, true); } });
    $('#seek-go').onclick = () => { addOrder(`Find and appoint a new ${label} for my household: ${$('#seek-text').value}`); $('#modal').classList.add('hidden'); toast('The order is given.'); };
  }
  const gr = e.target.closest('[data-grant]');
  if (gr) {
    const s = app.state, p = s.meta.player; const hd = s.holdings[gr.dataset.grant];
    const vas = vassalsOf(s, p).map((v) => s.houses[v]);
    modal(`<h2>Grant ${esc(hd.name)}</h2><p class="muted">Lands are the surest way to bind a lord to you — and to make his neighbours jealous.</p>${vas.map((v) => `<div class="row clickable" data-grant-to="${v.id}">${sig(v)}<div class="grow"><div class="title">House ${esc(v.name)}</div><div class="sub">${esc(v.lord ? s.characters[v.lord]?.name : '')} · loyalty ${s.characters[v.lord]?.loyalty ?? '?'}</div></div>${relHtml(getRelation(s, p, v.id))}</div>`).join('') || '<p class="muted">You have no vassals.</p>'}`);
    $$('[data-grant-to]').forEach((r) => r.onclick = async () => { try { const res = await api(`/games/${app.saveId}/act`, { body: { kind: 'grant', holding: hd.id, house: r.dataset.grantTo } }); app.setState(res.state); $('#modal').classList.add('hidden'); toast(`${hd.name} now belongs to House ${s.houses[r.dataset.grantTo].name}.`); } catch (err) { toast(err.message, true); } });
  }
  const tpl = e.target.closest('[data-order-tpl]');
  if (tpl) { $('#order-input').value = tpl.dataset.orderTpl; $('#order-input').focus(); }
});

// ═════════════ Detail sheets ═════════════
export function openSheet(kind, id) {
  app.sheet = { kind, id };
  const el = $('#sheet'); el.classList.remove('hidden'); el.classList.toggle('solo', !app.win);
  renderSheet();
}
export function closeSheet() { app.sheet = null; $('#sheet').classList.add('hidden'); }
export function renderSheet() {
  if (!app.sheet || !app.state) return;
  const { kind, id } = app.sheet;
  const html = kind === 'char' ? characterSheet(id) : kind === 'holding' ? holdingSheet(id) : kind === 'army' ? armySheet(id) : kind === 'house' ? houseSheet(id) : '';
  if (!html) return closeSheet();
  $('#sheet-body').innerHTML = html;
  $$('[data-march]', $('#sheet-body')).forEach((b) => b.onclick = () => app.startPick('march', b.dataset.march));
  $$('[data-tree]', $('#sheet-body')).forEach((b) => b.onclick = () => familyTree(b.dataset.tree));
}

function famMember(c, role) {
  if (!c) return '';
  return `<div class="m" data-char="${c.id}"><img src="${por(c, 80)}" alt=""><div class="rl">${role}</div><div>${esc(c.name.split(' ')[0])}${c.alive ? '' : ' ✝'}</div></div>`;
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
    <div class="char-hero"><img class="por" src="${por(c, 160)}" alt=""><div style="flex:1;min-width:0">
      <h2>${esc(c.name)}</h2>
      <div class="muted">${esc(c.title || c.roles.join(', '))}</div>
      <div style="margin:0.3rem 0">${sig(h, 1.3)} <a href="#" data-house="${h?.id}">House ${esc(h?.name)}</a></div>
      <div class="kv"><span class="k">Age</span><span>${c.alive ? c.age : `${c.age} (died ${c.died || '?'} AC)`}</span>
      <span class="k">Where</span><span>${c.alive ? esc(placeName(s, c.loc)) : '—'}</span>
      ${c.alive && c.status !== 'free' ? `<span class="k">Status</span><span class="pill bad">${esc(c.status)}</span>` : ''}
      ${!mine && c.alive ? `<span class="k">Opinion of you</span><span>${relHtml(c.opinion || 0)}</span>` : ''}
      ${c.alive && c.house !== 'free_folk' ? `<span class="k">Loyalty</span><span>${meter(c.loyalty ?? 60, '#7fb85a')}</span>` : ''}</div>
    </div></div>
    <div class="skills">${SKILL_NAMES.map((n, i) => `<div class="sk" title="${n}"><div class="i">${SKILL_ICONS[i]}</div><div class="n">${sk[i]}</div><div class="l">${n.slice(0, 4).toUpperCase()}</div></div>`).join('')}</div>
    <div>${traits.map((t) => `<span class="pill trait">${esc(t)}</span>`).join('')}</div>
    ${c.bio ? `<p style="font-size:0.92rem;line-height:1.45">${esc(c.bio)}</p>` : ''}
    ${c.secret && (mine || c.secretKnown) ? `<p style="font-size:0.88rem;border-left:3px solid var(--red);padding-left:0.5rem">🗝 <b>Secret:</b> <i>${esc(c.secret)}</i></p>` : c.secret && !mine ? '<p class="muted" style="font-size:0.8rem">🔒 There is more to this one than meets the eye.</p>' : ''}
    ${!mine && c.alive && c.house !== p ? dispositionHtml(id) : ''}
    <h4>Family <button class="btn small" data-tree="${c.id}" style="float:right">Family tree</button></h4>
    <div class="family">${famMember(father, 'Father')}${famMember(mother, 'Mother')}${famMember(spouse, 'Spouse')}${famMember(betrothed, 'Betrothed')}${kids.map((k) => famMember(k, 'Child')).join('')}${sibs.slice(0, 8).map((k) => famMember(k, 'Sibling')).join('')}</div>
    ${c.memories?.length ? `<h4>Remembers</h4>${c.memories.slice(-5).map((m) => `<div class="muted" style="font-size:0.82rem">• ${esc(m)}</div>`).join('')}` : ''}
    ${c.alive && !isRuler ? `<hr><div class="row-actions">
      <button class="btn primary" data-talk="${c.id}">${s.characters[player().lord]?.loc === c.loc ? '🗣 Speak' : '✉ Send a raven'}</button>
      <button class="btn" data-order-tpl="Summon ${esc(c.name)} to ${esc(s.holdings[player().seat]?.name || 'my court')}. ">Summon</button>
      <button class="btn" data-order-tpl="Send a gift to ${esc(c.name)}: ">Send gift</button>
      ${!c.spouse && c.age >= 10 ? `<button class="btn" data-order-tpl="Propose a match for ${esc(c.name)} with ">Propose match</button>` : ''}
      ${mine ? `<button class="btn" data-order-tpl="Grant ${esc(c.name)} ">Grant…</button>` : ''}
      ${c.status === 'imprisoned' ? `<button class="btn danger" data-order-tpl="Pass judgement on ${esc(c.name)}: ">Judge</button>` : ''}
      ${s.holdings[c.loc] ? `<button class="btn ghost" data-hold="${c.loc}">Show on map</button>` : ''}</div>` : ''}`;
}

const DISP_COLOR = { eager: '#a8e08a', favourable: '#cfe0a0', open: '#e0d8b0', reluctant: '#e8c870', unwilling: '#ec9a8a', hostile: '#ff6a5a' };
function dispositionHtml(id) {
  const d = disposition(app.state, id); if (!d) return '';
  const tip = (x) => esc(x.factors.map(([l, v]) => `${l}: ${v > 0 ? '+' : ''}${v}`).join('\n') || 'No strong feelings');
  const pill = (label, x) => `<span class="pill" title="${tip(x)}" style="color:${DISP_COLOR[x.word]}">${label}: ${x.word}</span>`;
  const N = { alliance: 'Alliance', marriage: 'Marriage', trade: 'Trade', fealty: 'Fealty' };
  return `<h4>Disposition toward you</h4><div>${pill('Overall', d)}${Object.entries(d.proposals).filter(([k]) => !(k === 'fealty' && app.state.houses[app.state.characters[id].house]?.liege === app.state.meta.player)).map(([k, x]) => pill(N[k], x)).join('')}</div><div class="muted" style="font-size:0.75rem">Hover for the reasons. Gifts, favours, threats and good arguments can change minds.</div>`;
}

function familyTree(id) {
  const s = app.state; const c = s.characters[id];
  const f = c.father && s.characters[c.father], m = c.mother && s.characters[c.mother];
  const gp = [f?.father, f?.mother, m?.father, m?.mother].map((x) => x && s.characters[x]).filter(Boolean);
  const sibs = siblingsOf(s, id); const kids = childrenOf(s, id); const spouse = c.spouse && s.characters[c.spouse];
  const grand = kids.flatMap((k) => childrenOf(s, k.id));
  const gen = (list, role) => list.length ? `<div class="gen">${list.map((x) => `<div class="m" data-char="${x.id}" onclick="document.querySelector('#modal').classList.add('hidden')"><img src="${por(x, 80)}"><div class="rl">${typeof role === 'function' ? role(x) : role}</div><div>${esc(x.name)}${x.alive ? '' : ' ✝'}</div></div>`).join('')}</div><div class="conn"></div>` : '';
  modal(`<h2>The family of ${esc(c.name)}</h2><div class="tree family">
    ${gen(gp, 'Grandparent')}${gen([f, m].filter(Boolean), (x) => (x === f ? 'Father' : 'Mother'))}
    ${gen([c, spouse, ...sibs].filter(Boolean), (x) => (x === c ? 'Self' : x === spouse ? 'Spouse' : 'Sibling'))}
    ${gen(kids, 'Child')}${gen(grand, 'Grandchild')}</div>`);
}

function holdingSheet(id) {
  const s = app.state; const hd = s.holdings[id]; if (!hd) return '';
  const owner = s.houses[hd.owner]; const lord = owner?.lord ? s.characters[owner.lord] : null; const p = s.meta.player;
  const chain = []; let cur = owner, g = 0; while (cur?.liege && g++ < 6) { cur = s.houses[cur.liege]; if (cur) chain.push(cur); }
  const here = Object.values(s.characters).filter((c) => c.loc === id && c.alive);
  const armies = Object.values(s.armies).filter((a) => a.at === id);
  const mine = hd.owner === p;
  const myArmies = Object.values(s.armies).filter((a) => a.owner === p);
  const fig = (f) => `${mine ? '' : '~'}${fmt(owner.figures[f].v)}`;
  return `
    <div class="detail-hero"><img class="banner" src="${banner(owner, 60, 90)}" style="width:4rem" alt=""><div><h2>${esc(hd.name)}</h2>
      <div class="muted">${esc(hd.type.replace('_', ' '))} · ${REGION_NAMES[hd.region] || ''}${hd.coastal ? ' · port' : ''}</div>
      <div>Held by <a href="#" data-house="${owner.id}">House ${esc(owner.name)}</a>${chain.length ? `<span class="muted"> · sworn to ${chain.map((c) => esc(c.name)).join(' → ')}</span>` : ''}</div></div></div>
    <div class="stat-grid">
      <div class="s"><div class="k">Smallfolk</div><div class="v">~${fmt(hd.population)}</div></div>
      <div class="s"><div class="k">Prosperity</div><div class="v">${Math.round(hd.prosperity)}</div>${meter(hd.prosperity, '#7fb85a')}</div>
      <div class="s"><div class="k">Unrest</div><div class="v">${Math.round(hd.unrest)}</div>${meter(hd.unrest, '#d0604a')}</div>
      <div class="s"><div class="k">Walls</div><div class="v">${'■'.repeat(hd.fort || 0)}${'□'.repeat(Math.max(0, 5 - (hd.fort || 0)))}</div></div>
      <div class="s"><div class="k">Status</div><div class="v" style="font-size:0.9rem">${esc(hd.status)}</div></div>
      <div class="s"><div class="k">Garrison</div><div class="v">${hd.garrison != null ? '~' + fmt(hd.garrison) : '?'}</div></div>
    </div>
    <div>${Object.entries(hd.resources || {}).filter(([, v]) => v >= 0.3).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<span class="pill" title="${esc(RESOURCES[k]?.desc || '')}">${RESOURCES[k]?.icon || ''} ${esc(RESOURCES[k]?.name || k)} ${v >= 2 ? '●●●' : v >= 1 ? '●●' : '●'}</span>`).join('')}</div>
    ${hd.buildings?.length ? `<div style="margin-top:0.3rem">${hd.buildings.map((b) => `<span class="pill good">${esc(b)}</span>`).join('')}</div>` : ''}
    ${owner.seat === id ? `<h4>${mine ? 'Your' : 'Rumoured'} strength of House ${esc(owner.name)}</h4><div class="kv"><span class="k">Levies</span><span>${fig('levies')}</span><span class="k">Men-at-arms</span><span>${fig('menAtArms')}</span><span class="k">Ships</span><span>${fig('ships')}</span><span class="k">Treasury</span><span>${fig('treasury')} gd</span></div>` : ''}
    ${hd.notes?.length ? `<h4>Recent</h4>${hd.notes.slice(-4).map((n) => `<div class="muted" style="font-size:0.85rem">${esc(n)}</div>`).join('')}` : ''}
    <h4>People here</h4>${here.map((c) => charRow(c)).join('') || '<div class="muted">No one of note.</div>'}
    ${armies.length ? `<h4>Forces here</h4>${armies.map(armyRow).join('')}` : ''}
    <hr><div class="row-actions">
      ${lord && lord.alive && owner.id !== p ? `<button class="btn primary" data-talk="${lord.id}">✉ Treat with ${esc(lord.name.split(' ')[0])}</button>` : ''}
      ${myArmies.length && !mine ? `<button class="btn" data-order-tpl="Send ${esc(myArmies[0].name)} to ${esc(hd.name)} to ">Send a host here</button>` : ''}
      ${mine ? `<button class="btn" data-win-open="economy">Fund works here</button>` : ''}
      <button class="btn ghost" data-order-tpl="Regarding ${esc(hd.name)}: ">Draft an order…</button></div>`;
}

function armySheet(id) {
  const s = app.state; const a = s.armies[id]; if (!a) return '';
  const h = s.houses[a.owner]; const cmd = a.commander ? s.characters[a.commander] : null; const mine = a.owner === s.meta.player || a.serving === s.meta.player;
  return `
    <div class="detail-hero"><img class="banner" src="${banner(h, 60, 90)}" style="width:4rem" alt=""><div><h2>${a.type === 'fleet' ? '⛵' : '⚔'} ${esc(a.name)}</h2><div class="muted"><a href="#" data-house="${h.id}">House ${esc(h.name)}</a> · ${esc(a.status || '')}</div></div></div>
    <div class="stat-grid">
      <div class="s"><div class="k">${a.type === 'fleet' ? 'Crews' : 'Men'}</div><div class="v">${mine ? '' : '~'}${fmt(a.men)}</div></div>
      ${a.ships ? `<div class="s"><div class="k">Ships</div><div class="v">${fmt(a.ships)}</div></div>` : ''}
      <div class="s"><div class="k">Morale</div><div class="v">${a.morale}</div>${meter(a.morale, '#c9a44a')}</div>
      <div class="s"><div class="k">Supply</div><div class="v">${a.supply}</div>${meter(a.supply, '#7fb85a')}</div>
    </div>
    <div class="kv"><span class="k">Position</span><span>${a.at ? esc(placeName(s, a.at)) : 'marching to ' + esc(a.destName || '?')}</span>
    <span class="k">Composition</span><span>${esc(a.composition || '—')}</span><span class="k">Reported</span><span>${esc(a.asOf || '')}</span></div>
    ${cmd ? `<h4>Commander</h4>${charRow(cmd)}` : ''}
    ${(() => {
      const with_ = Object.values(s.characters).filter((c) => c.loc === 'army:' + a.id && c.alive && c.id !== a.commander);
      const foes = Object.values(s.armies).filter((b) => atWar(s, a.owner, b.owner)).map((b) => ({ b, m: marchDays(a, a.pos, b.pos), o: battleOdds(s, a, b) })).sort((x, y) => x.m.days - y.m.days).slice(0, 4);
      const targets = a.type === 'fleet' ? [] : Object.values(s.holdings).filter((h) => atWar(s, a.owner, h.owner)).map((h) => ({ h, m: marchDays(a, a.pos, h.pos) })).sort((x, y) => x.m.days - y.m.days).slice(0, 3);
      return (with_.length ? `<h4>Riding with the host</h4>${with_.map((c) => charRow(c)).join('')}` : '')
        + (foes.length ? `<h4>War room — enemy hosts</h4>${foes.map(({ b, m, o }) => `<div class="row clickable" data-army="${b.id}">${sig(s.houses[b.owner])}<div class="grow"><div class="title">${esc(b.name)} <span class="muted">~${fmt(b.men)}</span></div><div class="sub">${m.days} days' march (${m.miles} mi) · if you attack: <b style="color:${o.attacker >= 60 ? '#a8e08a' : o.attacker >= 40 ? '#ffe0a0' : '#ec9a8a'}">${o.attacker}%</b></div></div></div>`).join('')}` : '')
        + (targets.length ? `<h4>Enemy holdings in reach</h4>${targets.map(({ h, m }) => { const e = siegeEstimate(s, h, [a]); return `<div class="row clickable" data-hold="${h.id}"><div class="grow"><div class="title">${esc(h.name)}</div><div class="sub">${m.days} days · walls ${h.fort}/6 · a siege would take ~${e.months} moons · ${esc(e.storm)}</div></div></div>`; }).join('')}` : '');
    })()}
    ${mine ? `<hr><div class="row-actions"><button class="btn primary" data-march="${a.id}">⤳ March to…</button><button class="btn" data-order-tpl="${esc(a.name)} is to ">Give orders…</button><button class="btn danger" data-order-tpl="Disband ${esc(a.name)} and send the men home to their fields.">Disband</button></div>` : ''}`;
}

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
    <h4>Members</h4>${members.filter((c) => c.id !== h.lord).slice(0, 14).map((c) => charRow(c, { showHouse: false })).join('') || '<div class="muted">No one known.</div>'}
    ${vas.length ? `<h4>Vassals</h4>${vas.map((v) => houseRow(s.houses[v])).join('')}` : ''}
    ${!mine ? `<hr><div class="row-actions">
      ${lord?.alive ? `<button class="btn primary" data-talk="${lord.id}">✉ Treat with ${esc(lord.name.split(' ')[0])}</button>` : ''}
      <button class="btn" data-propose="alliance" data-target="${id}">Propose alliance</button>
      <button class="btn" data-propose="marriage" data-target="${id}">Propose marriage</button>
      <button class="btn" data-propose="trade" data-target="${id}">Trade pact</button>
      <button class="btn" data-order-tpl="Embargo House ${esc(h.name)}: no trade with their lands or ships. ">Embargo</button>
      ${h.liege !== p ? `<button class="btn" data-propose="fealty" data-target="${id}">Demand fealty</button>` : ''}
      <button class="btn danger" data-order-tpl="Declare war on House ${esc(h.name)}. Casus belli: ">Declare war</button></div>` : ''}`;
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
