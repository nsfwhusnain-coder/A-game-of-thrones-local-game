// Orders, read and counted (docs/gdd/12-ui-ux.md §4 and §14 items 8–9; WP F3). What must hold:
//   • every order the lord writes gets a receipt, and every receipt line is one of done / careful / cannot / a question / left to the story, with words — 300 labelled orders, none without;
//   • a line's mark is an icon and a word (a screen reader says "Cannot"), never a bare ✓ ⚠ ✗ in the page;
//   • the End-turn plate counts the orders in hand and says which cannot be done or ask, before the days run; what it counts is only what the turn will carry out;
//   • the page's markup escapes what it is given, and app.js draws receipts and the count from this module.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.WC_PROVIDER = 'mock';
const O = await import('../public/js/ui/orders.js');
const { loadSuite, worldFor } = await import('../bench/lib/interpret.js');
const { readOrders } = await import('../server/orders.js');
const { interpretOrder } = await import('../server/orders/interpret.js');

const rd = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const icon = (n) => `<svg data-icon="${n}"></svg>`;
const env = { esc, icon };

test('no order ends with no receipt: all 300 labelled orders are read, and every line is one of the five kinds, with words', async () => {
  let n = 0; const kinds = new Set();
  for (const suite of loadSuite()) for (const it of suite.items) {
    const s = worldFor(suite); s.orders = [{ id: 'o1', text: it.text }];
    await readOrders(s, (t) => interpretOrder(s, t, { provider: 'rules' }));
    const o = s.orders[0]; n++;
    assert.ok(Array.isArray(o.receipt) && o.receipt.length >= 1, `"${it.text}" has a receipt`);
    for (const l of o.receipt) {
      assert.ok(O.RECEIPT_KINDS.includes(String(l.ok)), `"${it.text}": line kind ${l.ok}`); kinds.add(String(l.ok));
      assert.ok(typeof l.text === 'string' && l.text.trim().length > 2 && !/undefined|NaN|\[object/.test(l.text), `"${it.text}": words on the line (${l.text})`);
    }
    if (o.receipt.some((l) => l.ok === 'ask')) assert.ok(o.parsed?.clarify, `"${it.text}": a question has its clarification`);
    const html = O.receiptHtml(o, env); assert.match(html, /class="receipt"/); assert.doesNotMatch(html, /[✓⚠✗]/, 'no bare marks in the markup');
  }
  assert.equal(n, 300); for (const k of ['true', 'false', 'ask', 'warn', 'story']) assert.ok(kinds.has(k), `the suite exercises a "${k}" line`);
});

test('a mark is an icon and a word; an unknown one reads as done', () => {
  assert.deepEqual([true, 'warn', false].map((k) => O.markOf(k).icon), ['check', 'warn', 'close']);
  assert.deepEqual([true, 'warn', false, 'ask', 'story'].map((k) => O.markOf(k).word), ['Done', 'Careful', 'Cannot', 'A question', 'Left to the story']);
  assert.equal(O.markOf('nonsense'), O.MARKS.true); assert.equal(O.markOf(undefined), O.MARKS.true);
  const html = O.lineHtml({ ok: false, text: 'The treasury holds 60,000 dragons, not 60,000,000.' }, env);
  assert.match(html, /class="rl bad"/); assert.match(html, /role="img" aria-label="Cannot"/); assert.match(html, /data-icon="close"/);
  assert.equal(O.RECEIPT_KINDS.length, 5);
});

test('the receipt: lines, the lord\'s answer, the question\'s chips; escaped; a quiet brief for an order that is not the newest', () => {
  const o = { id: 'o<1>', text: 'x', parsed: { via: 'model', clarify: { options: [{ label: 'The Host of the North' }, { label: '<b>The garrison</b>' }] } }, receipt: [{ ok: true, text: 'Jory rides for Moat Cailin.' }, { ok: 'warn', text: 'Only 12,000 could be found.' }, { ok: 'ask', text: 'Which host?' }], chosen: 'Jory' };
  const html = O.receiptHtml(o, env);
  assert.equal((html.match(/class="rl /g) || []).length, 4, 'three lines and the answer'); assert.match(html, /title="Read by your maester"/); assert.match(html, /You answered: Jory/);
  assert.equal((html.match(/data-answer=/g) || []).length, 2); assert.match(html, /data-answer="o&#60;1&#62;" data-k="0"/); assert.doesNotMatch(html, /<b>The garrison/);
  const q = O.receiptHtml({ id: 'a', parsed: { clarify: {} }, receipt: [{ ok: 'ask', text: 'What do you mean?' }] }, env); assert.match(q, /Say it in the order’s words/);
  const brief = O.briefHtml({ receipt: [{ ok: true, text: 'a' }, { ok: true, text: 'b' }] }, env); assert.match(brief, /2 parts, all understood/); assert.match(brief, /class="receipt brief"/);
  assert.match(O.briefHtml({ receipt: [{ ok: true, text: 'a' }, { ok: false, text: 'Cannot march: no host.' }] }, env), /Cannot march: no host\./, 'the first line that is not well is the one shown');
  assert.match(O.briefHtml({ receipt: [{ ok: true, text: 'Done.' }] }, env), /Understood/);
});

test('the End-turn plate counts what the turn will carry out, and says which cannot be done or ask', () => {
  const read = (id, lines, extra = {}) => ({ id, text: id, parsedFor: id, parsed: {}, receipt: lines.map(([ok, text]) => ({ ok, text })), ...extra });
  const orders = [
    read('a', [[true, 'ok']]), read('b', [[true, 'ok'], [false, 'no']]), read('c', [['warn', 'care']]), read('d', [['ask', 'which?']], { parsed: { clarify: { options: [] } } }),
    { id: 'e', text: 'still being read' }, read('f', [[true, 'done']], { status: 'done' }), read('g', [[true, 'auto']], { auto: true }), { id: 'h', text: '   ' },
  ];
  const sum = O.ordersSummary(orders);
  assert.deepEqual(sum, { total: 5, reading: 1, cannot: 1, careful: 1, asking: 1 }, 'orders carried out, the engine\'s own and blank ones are not counted');
  assert.equal(O.ordersNote(sum), '5 orders · 1 cannot be done · 1 asks a question'); assert.equal(O.noteTone(sum), 'bad');
  assert.equal(O.ordersNote({ total: 1, reading: 0, cannot: 0, careful: 0, asking: 0 }), '1 order'); assert.equal(O.noteTone({ total: 1, cannot: 0, asking: 0, careful: 0 }), 'ok');
  assert.equal(O.ordersNote({ total: 3, cannot: 0, careful: 2, asking: 0 }), '3 orders · 2 need care'); assert.equal(O.noteTone({ total: 3, cannot: 0, careful: 2, asking: 0 }), 'warn');
  assert.equal(O.ordersNote({ total: 0 }), ''); assert.equal(O.noteTone({ total: 0 }), 'none');
  assert.deepEqual(O.ordersSummary([]), { total: 0, reading: 0, cannot: 0, careful: 0, asking: 0 }); assert.deepEqual(O.ordersSummary(undefined), { total: 0, reading: 0, cannot: 0, careful: 0, asking: 0 });
  // an order that was edited since it was read is not yet read again
  assert.equal(O.ordersSummary([{ id: 'x', text: 'new words', parsedFor: 'old words', receipt: [{ ok: false, text: 'no' }] }]).reading, 1);
});

test('the wiring: receipts and the count come from ui/orders.js, the plate has its badge, no bare marks remain in app.js, and the days are bold again', () => {
  const app = rd('public/js/app.js'); const html = rd('public/index.html'); const css = rd('public/css/audience.css');
  assert.match(app, /from '\.\/ui\/orders\.js'/); assert.match(app, /const receiptHtml = \(o\) => receiptOf\(o, RENv\)/); assert.match(app, /function renderTurnNote\(\)/); assert.match(app, /renderTurnNote\(\);\n\}/);
  assert.doesNotMatch(app, /const MARK = /); assert.doesNotMatch(app, /const TONE = /);
  assert.match(app, /replace\(\/\^next: \(\\d\+ days\?\)\/, 'next: <b>\$1<\/b>'\)/, 'the regex that bolds the days had lost its backslash');
  assert.match(html, /<b class="advance-count" hidden><\/b>/); assert.match(html, /title="End the turn \(Ctrl\+Enter\)"/); assert.match(css, /\.advance-count\[data-tone='bad'\]/); assert.match(css, /\.receipt \.rl \.mk \.ico/);
});
