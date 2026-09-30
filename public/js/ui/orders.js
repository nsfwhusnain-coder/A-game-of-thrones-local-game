// Your orders, read and counted (docs/gdd/12-ui-ux.md §4; WP F3). An order written in the command bar is read at once and gets its receipt, line by line: done, done with a warning,
// refused and why, a question the steward must ask, or a word left to the story. This is the pure side: the mark each line wears (an icon and a word, never a bare glyph, so that
// a screen reader says "Cannot" and the DOM holds no emoji), the receipt as markup, and the count the End-turn plate keeps ("3 orders · 1 cannot be done"), so the lord knows before
// the days run what the turn will do. (Counsel ideas and Polish of GDD 12 §4 are not built: the owner asked for one quill and a scribe instead — D-094.)

/** What each kind of receipt line looks like: an icon (or a glyph for the two that are not judgements), its tone and its word. */
export const MARKS = {
  true: { icon: 'check', tone: 'good', word: 'Done' },
  warn: { icon: 'warn', tone: 'warn', word: 'Careful' },
  false: { icon: 'close', tone: 'bad', word: 'Cannot' },
  ask: { glyph: '?', tone: 'ask', word: 'A question' },
  story: { glyph: '·', tone: 'story', word: 'Left to the story' },
};
/** The mark of a receipt line's `ok` (true, 'warn', false, 'ask', 'story'); anything unknown reads as done. */
export const markOf = (ok) => MARKS[String(ok)] || MARKS.true;
/** The lines a receipt may carry. */
export const RECEIPT_KINDS = Object.keys(MARKS);

/** How an order was read, for the receipt's tooltip. */
export const READER = { rules: 'Read by your steward', model: 'Read by your maester', replay: 'Read by your maester (recorded)', mock: 'Read by your steward', fallback: 'Your maester could not read it; your steward did' };

const markHtml = (ok, { icon }) => { const m = markOf(ok); return `<span class="mk" role="img" aria-label="${m.word}">${m.icon ? icon(m.icon, 'mk-ico') : m.glyph}</span>`; };

/** One receipt line. `env`: `{ esc, icon, link? }` — `link(text)` writes the text with its names as links (ui/names.js), else it is escaped. */
export function lineHtml(l, env) {
  const m = markOf(l.ok);
  return `<div class="rl ${m.tone}" title="${env.esc(l.text)}">${markHtml(l.ok, env)}<span>${(env.link || env.esc)(l.text)}</span></div>`;
}

/** The full receipt of an order: its lines, what the lord answered, and the question's answers as chips. `env`: `{ esc, icon }`. */
export function receiptHtml(o, env) {
  const { esc } = env; const q = o.parsed?.clarify;
  const lines = (o.receipt || []).map((l) => lineHtml(l, env)).join('');
  const chips = q?.options?.length ? `<div class="chips">${q.options.map((op, k) => `<button class="chip" data-answer="${esc(o.id)}" data-k="${k}">${esc(op.label)}</button>`).join('')}</div>` : q ? `<div class="rl story"><span class="mk"></span><span>Say it in the order’s words, and it will be read again.</span></div>` : '';
  const chosen = o.chosen ? `<div class="rl story"><span class="mk">↳</span><span>You answered: ${esc(o.chosen)}</span></div>` : '';
  return `<div class="receipt" title="${esc(READER[o.parsed?.via] || '')}">${lines}${chosen}${chips}</div>`;
}

/** A receipt in one line, for an order that is not the newest: how many parts were carried, and the first that was not. `env`: `{ esc, icon }`. */
export function briefHtml(o, env) {
  const { esc } = env; const ls = o.receipt || []; const bad = ls.find((l) => l.ok === false || l.ok === 'warn');
  const line = bad ? lineHtml(bad, env) : `<div class="rl good">${markHtml(true, env)}<span>${ls.length > 1 ? `${ls.length} parts, all understood` : 'Understood'}</span></div>`;
  return `<div class="receipt brief" title="${esc(ls.map((l) => l.text).join('\n'))}">${line}</div>`;
}

/**
 * What the orders in hand come to: `{ total, reading, cannot, careful, asking }` over the orders still waiting for the turn (not those already carried out, not the standing ones the
 * engine wrote itself). `reading` are those not yet read; `cannot` have a refused line; `careful` a warning and no refusal; `asking` wait on the lord's answer to a question.
 */
export function ordersSummary(orders) {
  const live = (orders || []).filter((o) => !o.auto && !o.executed && (o.status || 'queued') === 'queued' && String(o.text || '').trim());
  const read = live.filter((o) => o.parsedFor === o.text && o.receipt);
  const has = (o, ok) => o.receipt.some((l) => l.ok === ok);
  return {
    total: live.length, reading: live.length - read.length,
    cannot: read.filter((o) => has(o, false)).length,
    careful: read.filter((o) => !has(o, false) && has(o, 'warn')).length,
    asking: read.filter((o) => o.parsed?.clarify && !o.chosen).length,
  };
}

/** The End-turn plate's note on the orders: "", "1 order", "3 orders · 1 cannot be done", "2 orders · 1 asks a question"… */
export function ordersNote(sum) {
  if (!sum.total) return '';
  const parts = [`${sum.total} ${sum.total === 1 ? 'order' : 'orders'}`];
  if (sum.cannot) parts.push(`${sum.cannot} cannot be done`);
  if (sum.asking) parts.push(`${sum.asking} ${sum.asking === 1 ? 'asks' : 'ask'} a question`);
  else if (sum.careful) parts.push(`${sum.careful} ${sum.careful === 1 ? 'needs' : 'need'} care`);
  return parts.join(' · ');
}
/** How the note is drawn: `bad` when an order cannot be done, `warn` when one asks or needs care, else `ok` (and `none` when there are no orders). */
export const noteTone = (sum) => (!sum.total ? 'none' : sum.cannot ? 'bad' : sum.asking || sum.careful ? 'warn' : 'ok');
