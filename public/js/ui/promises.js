// Promises, and what an answer did (docs/gdd/12-ui-ux.md §7.1; WP F4). A lord who says yes makes a promise the engine keeps or breaks: what, to whom, by when. Until F4 nothing on
// the screen showed one. This is the pure side of it, so node can hold it to the rules: which promises a house may see (only its own, never how much they were meant),
// the days left, the words for them, and the chips an answer wears ("Agrees", "Promised: …", "Refuses"). The markup is here too, given `{ esc, icon }`.
import { dayNumber } from '../engine/time.js';
import { saysOf } from '../engine/politics/promise-words.js';
import { VERDICT_LABEL } from '../shared/temperament.js';

const houseOfChar = (s, id) => s.characters?.[id]?.house || null;
/** The house a promise is made to: `to` is a person, or a house. */
const toHouseOf = (s, c) => houseOfChar(s, c.to) || (s.houses?.[c.to] ? c.to : null);
const nameOf = (s, id) => s.characters?.[id]?.name || (s.houses?.[id] ? `House ${s.houses[id].name}` : 'someone');

/** Days left of a promise (the engine judges it on the day it falls due). */
export const daysLeftOf = (s, c) => c.dueDay - dayNumber(s.meta.date);
/** "12 days left", "1 day left", "due today". */
export const whenWord = (n) => (n < 0 ? 'overdue' : n === 0 ? 'due today' : n === 1 ? '1 day left' : `${n} days left`);
/** How pressing: `late` (due), `soon` (within five days), `far`. */
export const toneOfDays = (n) => (n <= 0 ? 'late' : n <= 5 ? 'soon' : 'far');

/**
 * One promise as a row a screen can draw: `{ id, dir, byId, byName, toName, says, days, when, tone, state, why }`. `dir` is `owed` (made to your house), `owe` (made by your house) or `other`.
 * Nothing of how much it was meant is in it: the server does not send that, and this could not show it.
 */
export function promiseRow(s, c) {
  const me = s.meta.player; const byHouse = houseOfChar(s, c.by); const toHouse = toHouseOf(s, c);
  const days = daysLeftOf(s, c);
  return {
    id: c.id, dir: toHouse === me && byHouse !== me ? 'owed' : byHouse === me ? 'owe' : 'other', byId: c.by, byName: nameOf(s, c.by), toId: c.to, toName: nameOf(s, c.to),
    says: saysOf(s, c), days, when: c.state === 'open' ? whenWord(days) : '', tone: c.state === 'open' ? toneOfDays(days) : c.state, state: c.state, dueDay: c.dueDay, why: c.why || '',
  };
}

const bySoonest = (a, b) => a.dueDay - b.dueDay || a.id.localeCompare(b.id);

/** The promises between you and one person: what they have promised your house, and what your house has promised theirs. Open ones only, soonest first. */
export function promisesWith(s, charId) {
  const me = s.meta.player; const c = s.characters?.[charId]; if (!c) return { theirs: [], mine: [] };
  const open = (s.commitments || []).filter((x) => x.state === 'open');
  const theirs = open.filter((x) => x.by === charId && toHouseOf(s, x) === me).map((x) => promiseRow(s, x)).sort(bySoonest);
  const mine = open.filter((x) => houseOfChar(s, x.by) === me && (x.to === charId || toHouseOf(s, x) === c.house)).map((x) => promiseRow(s, x)).sort(bySoonest);
  return { theirs, mine };
}

/** Every promise your house is party to, in three lists: owed to you, owed by you, and the settled ones (kept, broken, void), the latest first. */
export function promiseBook(s, { settled = 6 } = {}) {
  const rows = (s.commitments || []).map((x) => promiseRow(s, x)).filter((r) => r.dir !== 'other');
  const owed = rows.filter((r) => r.state === 'open' && r.dir === 'owed').sort(bySoonest);
  const owe = rows.filter((r) => r.state === 'open' && r.dir === 'owe').sort(bySoonest);
  const done = rows.filter((r) => r.state !== 'open').sort((a, b) => b.dueDay - a.dueDay || b.id.localeCompare(a.id)).slice(0, settled);
  return { owed, owe, settled: done, open: owed.length + owe.length };
}

/** A promise as a sentence: "Roose Bolton — bring his men to Moat Cailin (12 days left)". */
export const promiseSentence = (r) => `${r.byName} — ${r.says}${r.when ? ` (${r.when})` : ''}`;

// ── what an answer did: the chips under a reply ──────────────────────────────────────────────────────────────────────────
const PROMISE_LINE = /(?:^|\s)promises to (.+?)(?:\s+within (\d+) days?)?$/i;
const VERDICT_CHIP = { agree: ['ok', 'check'], yield: ['ok', 'check'], bargain: ['warn', 'scales'], stall: ['warn', 'hourglass'], refuse: ['bad', 'close'], rage: ['bad', 'close'], dismiss: ['bad', 'close'] };

/**
 * The chips of a reply: how they took it (`Agrees`, `Refuses`, `Names a price`…), then each thing that came of it — a promise (`Promised: bring his men to Moat Cailin, within 14 days`)
 * or a deed the engine did (`Done: …`). `{ tone: ok|warn|bad, icon, word, text?, days? }`. A plain "obeys" says nothing by itself, and a reply that changed nothing has no chips.
 */
export function outcomeChips(m) {
  const out = [];
  const v = VERDICT_CHIP[m?.verdict]; if (v) out.push({ kind: 'verdict', tone: v[0], icon: v[1], word: VERDICT_LABEL[m.verdict] || m.verdict });
  for (const line of m?.applied || []) {
    const text = String(line || '').trim(); if (!text) continue;
    const p = PROMISE_LINE.exec(text);
    if (p) out.push({ kind: 'promise', tone: 'ok', icon: 'seal', word: 'Promised', text: p[1], days: p[2] ? Number(p[2]) : null });
    else out.push({ kind: 'done', tone: 'ok', icon: 'check', word: 'Done', text: text.replace(/\.$/, '') });
  }
  return out;
}

/** The chips as markup. `env`: `{ esc, icon }`. */
export function chipsHtml(chips, { esc, icon }) {
  if (!chips.length) return '';
  return `<div class="chips" role="list">${chips.map((c) => `<span class="chip chip-${c.tone}" role="listitem" data-chip="${c.kind}">${icon(c.icon, 'chip-ico')}<b>${esc(c.word)}</b>${c.text ? `<span class="chip-text">${esc(c.text)}${c.days ? `, within ${c.days} days` : ''}</span>` : ''}</span>`).join('')}</div>`;
}

/** One promise's line, for the audience panel and the Realm. `env`: `{ esc }`; `who` names the one who made it (the row's own `byName` unless "You"). */
export function promiseLineHtml(r, { esc }, { who = r.byName } = {}) {
  const who2 = r.dir === 'owe' ? 'You' : who;
  return `<div class="pm pm-${r.tone}" data-promise="${esc(r.id)}"><span class="pm-who"${r.dir === 'owe' ? '' : ` data-char="${esc(r.byId)}"`}>${esc(who2)}</span><span class="pm-what">${esc(r.says)}</span>${r.when ? `<span class="pm-when">${esc(r.when)}</span>` : `<span class="pm-when">${r.state === 'kept' ? 'kept' : r.state === 'broken' ? 'broken' : 'void'}</span>`}</div>`;
}

/**
 * The footer of an audience: "Promises: …". What they have promised you, then what you have promised them, at most `max` lines and "+n more" behind them.
 * Empty when there are none (the panel says nothing rather than "no promises").
 */
export function audiencePromisesHtml(s, charId, { esc }, { max = 3 } = {}) {
  const { theirs, mine } = promisesWith(s, charId);
  const all = [...theirs, ...mine]; if (!all.length) return '';
  const first = s.characters[charId]?.name || 'They';
  const shown = all.slice(0, max);
  const lines = shown.map((r) => promiseLineHtml(r, { esc }, { who: r.byId === charId ? first.replace(/^(Ser|Lord|Lady)\s+/, '') : r.byName })).join('');
  return `<div class="promises" aria-label="Promises" data-promises="${all.length}"><div class="pm-h">Promises</div>${lines}${all.length > shown.length ? `<div class="pm-more">+${all.length - shown.length} more in the Realm window</div>` : ''}</div>`;
}

/** The Realm's list of promises (Diplomacy): owed to you, made by you, and lately settled. */
export function promiseBookHtml(s, { esc, icon }) {
  const b = promiseBook(s);
  const sect = (title, rows, empty) => `<div class="pm-sect"><h5>${esc(title)}</h5>${rows.length ? rows.map((r) => promiseLineHtml(r, { esc })).join('') : `<div class="muted pm-none">${esc(empty)}</div>`}</div>`;
  const settled = b.settled.map((r) => `<div class="pm pm-${r.state}" data-promise="${esc(r.id)}"><span class="pm-who" data-char="${esc(r.byId)}">${esc(r.dir === 'owe' ? 'You' : r.byName)}</span><span class="pm-what">${esc(r.says)}${r.state === 'void' && r.why ? ` — ${esc(r.why)}` : ''}</span><span class="pm-when">${icon(r.state === 'kept' ? 'check' : r.state === 'broken' ? 'close' : 'dots', 'chip-ico')}${r.state === 'kept' ? 'kept' : r.state === 'broken' ? 'broken' : 'void'}</span></div>`).join('');
  if (!b.open && !b.settled.length) return `<div class="section" id="promise-book"><h4>Promises</h4><div class="muted">No one has promised you anything, and you have promised no one. A lord who says yes in an audience or a letter is bound to it here, and you can see how long he has.</div></div>`;
  return `<div class="section" id="promise-book"><h4>Promises</h4>${sect('Owed to you', b.owed, 'No one owes you a promise.')}${sect('You promised', b.owe, 'You have promised nothing.')}${settled ? `<div class="pm-sect"><h5>Lately kept or broken</h5>${settled}</div>` : ''}</div>`;
}
