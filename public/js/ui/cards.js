// The contextual cards (docs/gdd/17-ui-declutter.md §4 U4; mockup 07): a click on a castle or a host on the map opens a small card beside it —
// who holds it, what is there, what you may do about it — and "More" opens the whole sheet (ui/windows.js), which loses nothing. Pure functions of
// the state the player is sent (already what its house knows: no hidden figure is reached for), so node can test them and a test can search
// their words for what must not be said; ui/card.js draws them and puts them on the screen.
import { forces, placeOf, statusText } from '../engine/parties.js';
import { garrisonOf } from '../engine/military/siege.js';
import { guestsAt } from '../shared/retinues.js';
import { vassalsOf } from '../shared/world.js';

const n0 = (x) => Math.round(Number(x) || 0).toLocaleString('en-GB');
const PROSPERITY = [[75, 'Flourishing'], [55, 'Prosperous'], [35, 'Getting by'], [20, 'Poor'], [0, 'Wretched']];
const TYPE = { great_castle: 'Great castle', castle: 'Castle', keep: 'Keep', town: 'Town', city: 'City', port: 'Port', village: 'Village', ruin: 'Ruin', tower: 'Tower', citadel: 'Citadel', abbey: 'Abbey' };
const typeWord = (t) => TYPE[t] || String(t || 'Holding').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

/** "Prosperous · restless" — the state of the lands in two words, and what is wrong with them if anything is. */
export function landsWord(hd) {
  const p = Number(hd.prosperity) || 0; const w = PROSPERITY.find(([lo]) => p >= lo)[1];
  const extra = [];
  if (Number(hd.unrest) >= 60) extra.push('seething'); else if (Number(hd.unrest) >= 35) extra.push('restless');
  if (hd.status && hd.status !== 'normal') extra.push(hd.status);
  return [w, ...extra].join(' · ');
}

/** The newest headline of the chronicle that happened at a holding, within the last `turns` turns: `{ text, turn }`, or null. */
export function lastNewsAt(history, where, turns = 6, now = Infinity) {
  for (const t of [...(history || [])].sort((a, b) => b.turn - a.turn)) {
    if (now - t.turn > turns) break;
    const e = (t.events || []).filter((x) => x.where === where && !x.bg).sort((a, b) => (b.importance || 0) - (a.importance || 0))[0];
    if (e) return { text: e.headline || e.title, turn: t.turn };
  }
  return null;
}

/**
 * The card of a holding: `{ kind: 'holding', id, crest, title, sub, rows: [{ k, text?, char?, note? }], news, actions: [{ id, label, primary?, attrs }], more }`.
 * A holding of the player's own shows its garrison as the castellan reckons it; another's shows none (the sheet's "?"), for no eyes of the house count it.
 * `attrs` are the hooks the delegated handlers of the game already answer (`data-talk`, `data-order-tpl`, `data-court`, `data-open-tab`).
 */
export function holdingCard(s, id, { history = s.history || [], regionName = (r) => r } = {}) {
  const hd = s.holdings?.[id]; if (!hd) return null;
  const p = s.meta.player; const owner = s.houses[hd.owner]; const mine = hd.owner === p;
  const lord = owner?.lord ? s.characters[owner.lord] : null; const seat = owner?.seat === id;
  const guests = guestsAt(s, id); const gid = new Set(guests.map((c) => c.id));
  const here = Object.values(s.characters).filter((c) => c.alive && placeOf(s, c) === id && c.id !== lord?.id);
  const hosts = forces(s).filter((a) => a.at === id);
  const rows = [];
  rows.push(lord?.alive ? { k: 'Holder', char: lord.id, name: lord.name, note: lord.id === s.houses[p]?.lord ? 'you' : '' } : { k: 'Holder', text: owner ? `House ${owner.name}` : 'no one' });
  if (mine) rows.push({ k: 'Garrison', text: `~${n0(garrisonOf(s, hd))} men` });
  else if (hosts.length) rows.push({ k: 'Seen here', text: `${hosts.length} host${hosts.length > 1 ? 's' : ''}` });
  rows.push({ k: 'Lands', text: landsWord(hd) });
  const people = [...here.filter((c) => !gid.has(c.id)), ...guests].slice(0, 2);
  if (people.length) rows.push({ k: guests.length && !here.length ? 'Guests' : 'Here', chars: people.map((c) => ({ char: c.id, name: c.name })), more: here.length + guests.length - people.length });
  const news = lastNewsAt(history, id, 6, s.meta.turn);
  // what may be done: the few things a lord does at a place, never more than three
  const actions = [];
  const myHosts = forces(s).filter((a) => a.owner === p && a.kind === 'host');
  const canCourt = mine && seat;
  if (canCourt) actions.push({ id: 'court', label: 'Hold court', primary: true, attrs: { 'data-open-tab': 'house', 'data-then': 'court' }, hint: 'A feast or a tourney: the Your house page' });
  if (mine && seat) actions.push({ id: 'banners', label: 'Call banners', attrs: { 'data-open-tab': 'hosts', 'data-then': 'call-banners' }, hint: 'Summon your sworn lords and their men' });
  if (mine) actions.push({ id: 'works', label: seat ? 'Works' : 'Fund works', attrs: { 'data-open-tab': 'coin', 'data-works': id }, hint: 'Walls, mills, granaries and roads, paid from the coffers' });
  if (!mine && lord?.alive) actions.push({ id: 'raven', label: 'Send a raven', primary: !myHosts.length, attrs: { 'data-talk': lord.id }, hint: `Treat with ${lord.name}` });
  if (!mine && myHosts.length) actions.push({ id: 'host', label: 'Send a host here', primary: true, attrs: { 'data-order-tpl': `Send ${myHosts[0].name} to ${hd.name} to ` }, hint: 'Writes the order in the box; nothing is sent until you send it' });
  return {
    kind: 'holding', id, crest: owner?.id || null, title: hd.name,
    sub: `${typeWord(hd.type)}${seat ? ` · seat of House ${owner.name}` : owner ? ` · House ${owner.name}` : ''} · ${regionName(hd.region) || ''}`.replace(/ · $/, ''),
    rows, news, actions: actions.slice(0, 3), more: true,
    vassals: mine ? vassalsOf(s, p).length : 0,
  };
}

/**
 * The card of a host or a fleet. One the house has only heard of shows the word it has, unconfirmed, and nothing else; your own shows its men, its
 * commander and what it is doing, with the two things you do to a host most: march it and order it.
 */
export function armyCard(s, id, { known = null, regionName = (r) => r } = {}) {
  const a = s.parties?.[id]; if (!a) return null;
  const p = s.meta.player; const h = s.houses[a.owner]; const mine = a.owner === p || a.serving === p;
  const cmd = a.commander ? s.characters[a.commander] : null; const fleet = a.kind === 'fleet';
  const v = known?.get?.(id);
  if (!mine && v?.known === 'reported') {
    return { kind: 'army', id, crest: h?.id || null, title: fleet ? 'A fleet, unconfirmed' : 'A host, unconfirmed', sub: `Said to fly the banners of House ${h?.name || 'unknown'}`, rows: [{ k: 'Men', text: `~${n0(v.men)}, by report` }, { k: 'Last heard', text: `${v.age ? `${v.age} turn${v.age > 1 ? 's' : ''} ago` : 'this moon'}, by ${v.source || 'a rider'}` }], news: null, actions: [], more: true };
  }
  const rows = [{ k: fleet ? 'Crews' : 'Men', text: `${mine ? '' : '~'}${n0(a.men)}${a.ships ? ` · ${n0(a.ships)} ships` : ''}` }];
  if (cmd) rows.push({ k: 'Commander', char: cmd.id, name: cmd.name });
  rows.push({ k: 'Doing', text: statusText(s, a) });
  if (mine) rows.push({ k: 'Morale', text: `${Math.round(a.morale ?? 0)}` });
  const actions = [];
  if (mine && a.owner === p) { actions.push({ id: 'march', label: 'March to…', primary: true, attrs: { 'data-march': a.id }, hint: 'Then click the place on the map' }); actions.push({ id: 'orders', label: 'Give orders…', attrs: { 'data-order-tpl': `${a.name} is to ` }, hint: 'Writes the order in the box' }); }
  return { kind: 'army', id, crest: h?.id || null, title: a.name, sub: `${fleet ? 'Fleet' : 'Host'} of House ${h?.name || 'unknown'}`, rows, news: null, actions, more: true };
}

const attrsOf = (o, esc) => Object.entries(o || {}).map(([k, v]) => ` ${k}="${esc(v)}"`).join('');
/**
 * The card as markup. `env`: `{ esc, banner(house) → url, por(char) → url, char(id) → character }`. Every name is escaped (a test draws it on hostile names).
 */
export function cardHtml(card, env) {
  const { esc } = env;
  const chip = (id, name, note) => `<button class="card-chip" data-char="${esc(id)}" title="${esc(name)}"><img class="por" src="${esc(env.por(id))}" alt=""><span>${esc(name)}</span>${note ? `<small>${esc(note)}</small>` : ''}</button>`;
  const rows = card.rows.map((r) => `<div class="card-row"><span class="k">${esc(r.k)}</span><span class="v">${
    r.char ? chip(r.char, r.name, r.note) : r.chars ? `${r.chars.map((c) => chip(c.char, c.name)).join('')}${r.more > 0 ? `<small class="card-more">+ ${r.more} more</small>` : ''}` : esc(r.text)
  }</span></div>`).join('');
  return `<header class="card-head">${card.crest ? `<img class="card-crest" src="${esc(env.banner(card.crest))}" alt="">` : ''}<div class="grow"><h3>${esc(card.title)}</h3><div class="sub">${esc(card.sub)}</div></div><button class="win-close" data-action="close-card" aria-label="Close">✕</button></header>
    <div class="card-rows">${rows}</div>
    ${card.news ? `<button class="card-news" data-card-news="${esc(card.id)}"><i></i>In the chronicle: ${esc(card.news.text)}</button>` : ''}
    <footer class="card-actions">${card.actions.map((x) => `<button class="btn${x.primary ? ' primary' : ''}"${attrsOf(x.attrs, esc)} title="${esc(x.hint || '')}">${esc(x.label)}</button>`).join('')}${card.more ? `<button class="btn ghost" data-card-more="${esc(card.kind)}:${esc(card.id)}">More ▸</button>` : ''}</footer>`;
}

/**
 * Where a card of `size` {w,h} goes beside `anchor` {x,y} on a `screen` {w,h}, clear of every rect in `avoid` ([left, top, right, bottom]: the top bar, the strip,
 * the command bar, the portrait, an open window). It tries the right of the object, then the left, then above and below, keeping `gap` from the object and
 * `margin` from the screen's edge; a place that overlaps nothing is taken as soon as it is found. `{ left, top, side }`; `side` is where the object is in relation to the card ('left' when the card is to its right).
 */
export function placeCard(anchor, size, screen, avoid = [], { gap = 22, margin = 10 } = {}) {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const hit = (l, t) => avoid.some(([x0, y0, x1, y1]) => l < x1 && l + size.w > x0 && t < y1 && t + size.h > y0);
  const cands = [];
  const ytry = (cy) => { const t = clamp(cy - size.h / 2, margin, screen.h - size.h - margin); return [t, t - 80, t + 80, t - 160, t + 160].map((y) => clamp(y, margin, screen.h - size.h - margin)); };
  for (const y of ytry(anchor.y)) cands.push({ left: anchor.x + gap, top: y, side: 'left' });
  for (const y of ytry(anchor.y)) cands.push({ left: anchor.x - gap - size.w, top: y, side: 'right' });
  const xs = (cx) => { const l = clamp(cx - size.w / 2, margin, screen.w - size.w - margin); return [l, l - 120, l + 120]; };
  for (const x of xs(anchor.x)) cands.push({ left: x, top: anchor.y - gap - size.h, side: 'below' });
  for (const x of xs(anchor.x)) cands.push({ left: x, top: anchor.y + gap, side: 'above' });
  const fits = (c) => c.left >= margin && c.top >= margin && c.left + size.w <= screen.w - margin && c.top + size.h <= screen.h - margin && !hit(c.left, c.top);
  const ok = cands.find(fits); if (ok) return { left: Math.round(ok.left), top: Math.round(ok.top), side: ok.side };
  // nothing is clear (a small screen with a wide window): the least bad, the right of the object clamped into the screen
  const c = cands[0]; return { left: Math.round(clamp(c.left, margin, screen.w - size.w - margin)), top: Math.round(clamp(c.top, margin, screen.h - size.h - margin)), side: c.side, crowded: true };
}
