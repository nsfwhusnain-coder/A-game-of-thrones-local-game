// The State of the Realm as a page (docs/gdd/19-realm-ledger.md §6; WP R4): what the ledger draws from a view that `GET /api/games/:id/realm` sent. Pure — it makes a string of HTML
// from the view, the request (`q`) and the page's own facts (`env`: a house's crest and name, and which house is the player's), so node can run it on a view full of hostile names.
// Every name and every line of words the server sent goes through `esc`. It adds nothing to what it was sent.
import { icon } from './icons.js';
import { LENS_LABEL, SCOPE_LABEL, FIELD_LABEL, COLUMNS, cellText, provenance, wordChip, sparkPath, sparkLabel, changeWord, warLine, strengthLine, sortRows } from './realm-fmt.js';

const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let env = null;
const crest = (id) => env.crest(id);
const nameOf = (id) => env.nameOf(id);
const youId = () => env.you;

const LENSES = ['strength', 'economy', 'land', 'wars'];
const HEADERS = { strength: ['power', 'swords', 'levies', 'menAtArms', 'ships', 'holdings', 'people'], economy: COLUMNS.economy, land: COLUMNS.land };
const OPTIONAL = new Set(['levies', 'menAtArms', 'expenses', 'debt']); // the columns that give way when the window is narrow
const SHORT = { power: 'Power', swords: 'Swords', levies: 'Levies', menAtArms: 'Arms', ships: 'Ships', holdings: 'Lands', people: 'People', gold: 'Coin', income: 'Income', expenses: 'Outgoings', food: 'Food', debt: 'Debt', prosperity: 'Prosperity', unrest: 'Unrest' };
const MULTIPLES = [['swords', 'Swords'], ['gold', 'Coin'], ['income', 'Income a moon'], ['food', 'Food'], ['people', 'People']];

const dateText = (v) => String(v.asOf?.date || '').replace(/^(\d+) (\d+)(?:st|nd|rd|th) moon, (\d+) AC$/, '$1 · $2 moon · $3 AC');

/** The whole page for a view and a request (`q`: lens, scope, realm, moons, sortKey, sortDir, cols, house). `e` is the page's own facts, for a test. */
export function ledgerHtml(v, q, e) {
  env = e; try { return draw(v, q); } finally { env = null; }
}
function draw(v, q) {
  const lensTabs = LENSES.map((l) => `<button class="wc-tab" role="tab" data-lens="${l}" aria-selected="${q.lens === l}">${LENS_LABEL[l]}</button>`).join('') + `<button class="wc-tab realm-tab-house" role="tab" data-lens="house" aria-selected="false" title="Your own house, in full">Your house</button>`;
  const chips = (list, on, attr, label) => list.map((x) => `<button class="wc-chip${on(x) ? ' is-on' : ''}" data-${attr}="${x}" aria-pressed="${on(x)}">${label(x)}</button>`).join('');
  const body = q.lens === 'wars' ? warsPage(v, q) : tablePage(v, q);
  return `<div class="realm-ledger">
    <div class="realm-top"><span class="wc-kicker">as of ${esc(dateText(v))}</span>
      <span class="realm-ctl"><span class="wc-label">Window</span>${chips([3, 6, 12], (m) => q.moons === m, 'moons', (m) => `${m}`)}<span class="wc-label">moons</span></span></div>
    <div class="wc-tabs realm-tabs" role="tablist">${lensTabs}</div>
    <div class="realm-controls">
      <span class="realm-ctl"><span class="wc-label">Show</span><select class="realm-select" data-scope-select aria-label="Which houses">${Object.entries(SCOPE_LABEL).map(([k, t]) => `<option value="${k}"${q.scope === k ? ' selected' : ''}>${t}</option>`).join('')}</select></span>
      <span class="realm-ctl">${chips([false, true], (r) => q.realm === r, 'realm', (r) => (r ? 'With its sworn houses' : 'The house alone'))}<button class="wc-chip${q.cols ? ' is-on' : ''}" data-cols aria-pressed="${!!q.cols}" title="Show every column, and scroll sideways if the page is narrow">All columns</button></span></div>
    ${body}
    ${lowerPage(v, q)}</div>`;
}

// ── the table ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function goingHtml(v) {
  const chip = (ids, cls, arrow) => ids.map((id) => `<button class="wc-chip realm-going realm-going--${cls}" data-row="${esc(id)}" title="${esc(nameOf(id))}: ${cls === 'up' ? 'rising' : 'falling'}">${arrow} ${esc(nameOf(id))}</button>`).join('');
  const up = chip(v.going?.rising || [], 'up', '▲'), down = chip(v.going?.falling || [], 'down', '▼');
  if (!up && !down) return '<div class="realm-going-row"><span class="wc-quiet">No house is clearly rising or falling yet: the ledger has only begun to be kept, or the word has not come.</span></div>';
  return `<div class="realm-going-row">${up ? `<span class="wc-label">Rising</span>${up}` : ''}${down ? `<span class="wc-label">Falling</span>${down}` : ''}</div>`;
}
function sparkSvg(series, { est, label, cls = '' }) {
  const p = sparkPath(series); if (!p.d) return '<span class="wc-none">—</span>';
  return `<svg class="wc-spark ${cls}" viewBox="0 0 84 22" role="img" aria-label="${esc(label)}"><path class="${est ? 'est' : ''}" d="${p.d}"/>${p.last ? `<circle cx="${p.last[0]}" cy="${p.last[1]}" r="1.9"/>` : ''}</svg>`;
}
function cellHtml(row, key) {
  const c = cellText(row.cells?.[key], key);
  return `<td class="c-${key}${OPTIONAL.has(key) ? ' c-opt' : ''}${c.kind === 'none' ? ' wc-none' : ''}"><span class="rc rc--${c.kind}${c.stale ? ' is-stale' : ''}" title="${esc(c.title)}">${esc(c.text)}${c.stale ? '<i class="rc-q" aria-hidden="true">?</i>' : ''}</span></td>`;
}
function tablePage(v, q) {
  const cols = HEADERS[q.lens] || HEADERS.strength; const rows = sortRows(v.rows, q.sortKey, q.sortDir);
  const head = (k, label, cls = '') => `<th class="${cls}" scope="col"><button class="realm-sort${q.sortKey === k ? ' is-on' : ''}" data-sort="${k}" title="Sort by ${esc(label)}">${esc(label)}${q.sortKey === k ? `<i aria-hidden="true">${q.sortDir === 1 ? '▾' : '▴'}</i>` : ''}</button></th>`;
  const you = youId();
  const trs = rows.map((r) => {
    const w = wordChip(r.word); const est = r.trend?.series && !['self', 'sworn'].includes(r.cells?.power?.via);
    const lab = sparkLabel(FIELD_LABEL[r.trend?.field] || 'Power', r.trend?.series, { moons: q.moons, est });
    const flags = (r.flags || []).map((f) => `<span class="realm-flag realm-flag--${esc(f.id)}" title="${esc(f.text)}">${esc(f.id)}</span>`).join('');
    return `<tr class="${r.house === you ? 'is-you' : ''}${q.house === r.house ? ' is-open' : ''}" data-row="${esc(r.house)}" tabindex="0">
      <td class="c-rank">${r.rank ? `${r.rankTied ? '≈' : ''}${r.rank}` : '—'}</td>
      <td class="c-house">${crest(r.house)}<span class="wc-table__house">${esc(nameOf(r.house))}${r.house === you ? ' <span class="wc-chip wc-chip--wax">You</span>' : ''}</span><span class="wc-table__note">${esc(provenance(r))}${flags ? ` ${flags}` : ''}</span></td>
      ${cols.map((k) => cellHtml(r, k)).join('')}
      <td class="c-trend">${sparkSvg(r.trend?.series, { est, label: lab, cls: w.cls === 'up' ? 'up' : w.cls === 'down' ? 'down' : '' })}<span class="wc-chip wc-chip--${w.cls === 'up' ? 'gain' : w.cls === 'down' ? 'loss' : 'flat'} realm-word${w.seems ? " is-seems" : ""}" title="${esc(w.title)}">${esc(w.text)}</span></td></tr>`;
  }).join('');
  return `<div class="wc-ledger"><div class="wc-ledger__book"><div class="wc-ledger__page">${goingHtml(v)}
    <div class="realm-table-wrap${q.cols ? ' all-cols' : ''}"><table class="wc-table realm-table"><thead><tr>${head('rank', '#', 'c-rank')}<th class="c-house" scope="col">House</th>${cols.map((k) => head(k, SHORT[k], `c-${k}${OPTIONAL.has(k) ? ' c-opt' : ''}`)).join('')}<th class="c-trend" scope="col">${q.moons} moons</th></tr></thead><tbody>${trs || '<tr><td colspan="9" class="wc-none">No house is listed.</td></tr>'}</tbody></table></div>
    <p class="realm-legend"><b>~</b> an estimate, dated as the word reached you · <b>≈</b> a band · <b>≥</b> at least · <b>?</b> older than two turns · <b>—</b> nothing known · a dashed line is estimated history</p>
  </div></div></div>`;
}

// ── wars ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function warsList(v, q) {
  const items = (v.wars || []).map((w) => {
    const l = warLine(w, q.moons); const sides = (hs) => hs.map((h) => esc(nameOf(h))).join(', ') || '—';
    return `<li class="realm-war"><div class="realm-war__t"><b>${esc(w.name)}</b> <span class="wc-none">${sides(w.sides.A)} against ${sides(w.sides.D)}</span></div>
      <div class="realm-war__s"><span>${esc(strengthLine(w))}</span>${l ? `<span class="wc-chip wc-chip--${l.cls === 'up' ? 'gain' : l.cls === 'down' ? 'loss' : 'flat'}">${esc(l.text)}</span>` : '<span class="wc-chip wc-chip--flat" title="You are not in this war, so no score of it is known to you.">watching</span>'}</span></div></li>`;
  }).join('');
  return items ? `<ul class="realm-wars">${items}</ul>` : '<p class="wc-quiet">No war is known to you.</p>';
}
function warsPage(v, q) { return `<div class="wc-ledger"><div class="wc-ledger__book"><div class="wc-ledger__page"><div class="wc-kicker">Wars, as your house knows them</div>${warsList(v, q)}</div></div></div>`; }

// ── below the table: a house in detail, what the realm is saying, where to focus ──────────────────────────────────────────────────
function multiples(v, q) {
  const d = v.detail; if (!d || d.unknown || !d.series) return '';
  const est = d.kind === 'other';
  return `<div class="realm-multi">${MULTIPLES.map(([k, label]) => {
    const s = d.series[k] || []; const last = s.at(-1)?.[1]; const cell = d.cells?.[k]; const txt = cell ? cellText(cell, k).text : (last != null ? String(last) : '—'); const ch = changeWord(s);
    return `<div class="realm-multi__c"><span class="wc-label">${esc(label)}</span><b>${esc(txt)}</b>${sparkSvg(s, { est, label: sparkLabel(label, s, { moons: q.moons, est }) })}<em class="${ch.startsWith('+') ? 'wc-gain' : ch.startsWith('−') ? 'wc-loss' : ''}">${esc(ch)}</em></div>`;
  }).join('')}</div>`;
}
function detailBlock(v, q) {
  const d = v.detail; if (!d) return '';
  if (d.unknown) return '<p class="wc-quiet">Nothing is known of that house.</p>';
  const row = v.rows.find((r) => r.house === d.house); const you = d.house === youId();
  const cells = Object.entries(d.cells || {}).filter(([k]) => FIELD_LABEL[k]).map(([k, c]) => { const t = cellText(c, k); return `<div class="realm-cell"><span class="wc-label">${esc(FIELD_LABEL[k])}</span><span class="rc rc--${t.kind}${t.stale ? ' is-stale' : ''}" title="${esc(t.title)}">${esc(t.text)}</span></div>`; }).join('');
  const w = row ? wordChip(row.word) : null;
  const inWar = (v.wars || []).filter((x) => [...x.sides.A, ...x.sides.D].includes(d.house)).map((x) => esc(x.name));
  return `<section class="realm-detail"><div class="realm-detail__h">${crest(d.house)}<div><h3>${you ? 'Your house' : `House ${esc(d.name)}`}</h3><span class="wc-none">${esc(d.lord || '')}${d.liege ? ` · sworn to ${esc(nameOf(d.liege))}` : ''}${row ? ` · ${esc(provenance(row))}` : ''}</span></div>
    ${w ? `<span class="wc-chip wc-chip--${w.cls === 'up' ? 'gain' : w.cls === 'down' ? 'loss' : 'flat'}" title="${esc(w.title)}">${esc(w.text)}</span>` : ''}${q.house ? '<button class="wc-btn wc-btn--small" data-back>Back to your house</button>' : ''}</div>
    ${row?.flags?.length ? `<div class="realm-flags">${row.flags.map((f) => `<span class="realm-flag realm-flag--${esc(f.id)}">${esc(f.id)}: ${esc(f.text)}</span>`).join('')}</div>` : ''}
    <div class="realm-cells">${cells}</div>${inWar.length ? `<p class="wc-none">At war: ${inWar.join(', ')}</p>` : ''}${multiples(v, q)}</section>`;
}
function saying(v) {
  const f = v.facts || []; if (!f.length) return '<p class="wc-quiet">Nothing presses.</p>';
  return `<ul class="realm-facts">${f.map((x) => `<li><span>${esc(x.text)}</span>${x.via && x.via !== 'self' ? ` <em class="wc-none">${esc(x.via)}${x.age ? `, ${x.age} turn${x.age === 1 ? '' : 's'} old` : ''}</em>` : ''}</li>`).join('')}</ul>`;
}
function focusList(v) {
  const f = v.focus || []; if (!f.length) return '<p class="wc-quiet">Nothing of yours needs an order now.</p>';
  return `<ul class="realm-focus">${f.map((x) => `<li><span>${esc(x.text)}</span><button class="wc-btn wc-btn--small" data-focus="${esc(x.order)}" title="Write this order in the box (nothing is sent)">${icon('quill')}<span>${esc(x.order.replace(/\.$/, ''))}</span></button></li>`).join('')}</ul>`;
}
function lowerPage(v, q) {
  const wars = q.lens === 'wars' ? '' : `<div class="realm-lower__wars"><div class="wc-kicker">Wars, as your house knows them</div>${warsList(v, q)}</div>`;
  return `<div class="wc-ledger"><div class="wc-ledger__book"><div class="wc-ledger__page realm-lower">${detailBlock(v, q)}${wars}
    <div class="realm-say"><div><div class="wc-kicker">What the realm is saying</div>${saying(v)}</div><div><div class="wc-kicker">Where to focus</div>${focusList(v)}</div></div></div></div></div>`;
}

