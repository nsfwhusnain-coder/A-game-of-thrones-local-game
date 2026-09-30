// The card in the turn record, the digest, and old saves (docs/gdd/18-headlines.md §5 N6, §2.1, §2.5): every event of a turn is
// one card — headline, summary, details[], tier, score, with `title` and `text` kept as aliases — the turn's digest is built from the
// cards by the engine, the chronicle and the world log are written in the new words, an old save still renders in the new shape,
// and undo takes the ranking's memory back with the world.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

process.env.WC_SAVES = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-turncards-'));
process.env.WC_PROVIDER = 'mock';
const game = await import('../server/game.js');
const { viewTurn, playerView, hiddenTruths } = await import('../server/view.js');
const { migrateState } = await import('../public/js/shared/world.js');
const { BOILERPLATE, JARGON, FORBIDDEN } = await import('../public/data/style.js');
const { DIGEST_WORDS } = await import('../public/js/engine/facts/digest.js');

const here = path.dirname(fileURLToPath(import.meta.url));
const words = (t) => String(t).trim().split(/\s+/).filter(Boolean).length;
const BAD = [...BOILERPLATE, ...JARGON, ...FORBIDDEN].map((p) => new RegExp(p, 'i'));
const ORDERS = [[{ text: 'Call the banners to Winterfell.' }], [], [], [], []];

async function play(orders = ORDERS, seed = 7, house = 'stark') {
  const { id } = game.newGame('agot_298', house, { seed });
  const turns = [];
  for (const o of orders) { const t = (await game.advance(id, { span: 'auto', orders: o })).turn; await game.settled(id); turns.push(t); }
  return { id, turns };
}

test('every event of a turn is one card in the one shape, and the old names are its aliases', async () => {
  const { turns } = await play();
  let n = 0;
  for (const t of turns) for (const e of t.events) {
    n++;
    assert.ok(typeof e.headline === 'string' && e.headline.length > 2, `a headline: ${JSON.stringify(e).slice(0, 120)}`);
    assert.equal(typeof e.summary, 'string'); assert.ok(Array.isArray(e.details) && e.details.every((d) => typeof d === 'string'), `details is a list: ${e.headline}`);
    assert.ok(['great', 'major', 'news', 'minor', 'meanwhile'].includes(e.tier), `${e.headline}: ${e.tier}`); assert.ok(Number.isFinite(e.score));
    assert.equal(e.title, e.headline, 'title is the headline\'s alias'); assert.equal(e.text, e.summary, 'text is the summary\'s alias');
    assert.ok(['writer', 'model', 'engine'].includes(e.told), e.told);
    if (e.bg) assert.equal(e.tier, 'meanwhile');
  }
  assert.ok(n >= 12, `${n} cards in five turns`);
  // the cards of the news are the writer's (the mock tells what the writer wrote); only a lord's own order and its receipt are the engine's
  const news = turns.flatMap((t) => t.events.filter((e) => !e.bg && e.narrated));
  assert.ok(news.length >= 8 && news.every((e) => e.told === 'writer' && e.kind && e.archetype), 'the news is told by the writer');
  const left = turns.flatMap((t) => t.events.filter((e) => !e.bg && !e.narrated));
  assert.ok(left.every((e) => e.orderId || e.told === 'writer' || e.told === 'engine'), 'what is not a story is an order\'s card or the like');
  for (const e of news) assert.ok(!BAD.some((re) => re.test(`${e.headline} ${e.summary}`)), `no ledger phrase in "${e.headline}" — "${e.summary}"`);
});

test('the digest of a turn: whole pieces, at most 90 words, the best first, and the turn\'s summary is it', async () => {
  const { turns } = await play();
  for (const t of turns) {
    const d = t.digest; assert.ok(d, `turn ${t.turn} has a digest`);
    assert.ok(d.words <= DIGEST_WORDS && words(d.text) === d.words, `turn ${t.turn}: ${d.words} words`);
    assert.ok(d.top.length <= 3 && d.also.length <= 5 && typeof d.meanwhile === 'string');
    assert.equal(t.summary, d.text, 'the summary is the digest, as text');
    assert.ok(!/…|\.\.\./.test(d.text), 'never cut with an ellipsis'); assert.ok(!BAD.some((re) => re.test(d.text)), `turn ${t.turn}: no ledger phrase — ${d.text}`);
    const cards = t.events.filter((e) => !e.bg);
    if (cards.length) {
      const best = Math.max(...cards.map((e) => e.score));
      assert.equal(cards.find((e) => e.headline === d.top[0].headline).score, best, 'the top of the digest is the best card');
      for (const x of [...d.top, ...d.also]) assert.ok(cards.some((e) => e.id === x.id && e.headline === x.headline), 'each item points at its card');
    }
  }
  assert.ok(turns[0].digest.top.length === 3, 'the first week of a muster fills the top three');
});

test('the chronicle and the world log are written in the new words: no engine line, no ledger phrase', async () => {
  const { id } = await play();
  const chronicle = game.readChronicle(id); const log = game.readWorldLog(id);
  const lines = chronicle.split(/\r?\n/).filter((l) => l.startsWith('- '));
  assert.ok(lines.length >= 1, 'the muster of the first week is in the chronicle');
  for (const l of lines) { assert.ok(!BAD.some((re) => re.test(l)), l); assert.ok(!/…/.test(l), l); assert.match(l, / — /, 'headline — summary'); }
  assert.match(log, /\*\*Eddard Stark raises the northern banners at Winterfell\*\*/, 'the world log keeps the headline');
  const news = log.split(/\r?\n/).filter((l) => l.startsWith('- _day '));
  assert.ok(news.length >= 10, 'every card is in the log, the Meanwhile among them');
  assert.ok(news.every((l) => !/…/.test(l) && !BAD.some((re) => re.test(l))), 'and no line of the news is cut short or in the ledger\'s words');
});

test('a succession is not written into the chronicle in the engine\'s words: the op keeps the line as its record, the turn\'s writer tells it', async () => {
  const { createInitialState, resolveSuccessions } = await import('../public/js/shared/world.js');
  const s = createInitialState('agot_298', 'stark', { seed: 298 });
  s.characters[s.houses.braavos.lord].alive = false;
  const notes = resolveSuccessions(s).filter((n) => n.op === 'succession');
  assert.equal(notes.length, 1, 'the sealord\'s seat is filled');
  assert.match(notes[0].text, /^SUCCESSION: the magisters of Braavos choose /, 'the op keeps the engine\'s line');
  assert.ok(!s.chronicle.some((c) => /SUCCESSION/.test(c.text)), 'the chronicle gets none of it from the engine');
});

test('an old save renders in the new shape: cards from their title, text and details, and a digest for every turn', async () => {
  const raw = zlib.gunzipSync(fs.readFileSync(path.join(here, 'fixtures', 'saves', 'v2-stark-turn3.json.gz'))).toString('utf8');
  const state = migrateState(JSON.parse(raw));
  assert.ok(state.history.length >= 1);
  const view = playerView(state);
  for (const t of view.history) {
    assert.ok(t.digest && typeof t.digest.text === 'string', `turn ${t.turn} has a digest`);
    for (const e of t.events || []) { assert.ok(e.headline && Array.isArray(e.details) && e.tier, `an old card renders: ${e.title}`); assert.equal(e.title, e.headline); }
  }
  // the record on disk is not rewritten for it
  assert.ok(state.history.every((t) => !('digest' in t) || t.digest), 'the stored turn is left as it was');
  const one = viewTurn({ turn: 1, events: [{ title: 'Old', text: 'Words.', details: 'More words.', importance: 4 }], meanwhile: 'Elsewhere it rained.' });
  assert.deepEqual([one.events[0].headline, one.events[0].details, one.digest.top.length], ['Old', ['More words.'], 1]);
});

test('the ranking\'s memory is the state\'s, not the browser\'s: firsts are kept, undone with the turn, and never sent', async () => {
  const { id } = game.newGame('agot_298', 'stark', { seed: 7 });
  await game.advance(id, { span: 'auto', orders: [{ text: 'Call the banners to Winterfell.' }] }); await game.settled(id);
  const after1 = game.loadState(id); assert.ok(after1.firsts && Object.keys(after1.firsts).length >= 1, JSON.stringify(after1.firsts));
  const keys1 = Object.keys(after1.firsts).sort();
  await game.advance(id, { span: 'auto', orders: [] }); await game.settled(id);
  const after2 = game.loadState(id);
  assert.ok(keys1.every((k) => k in after2.firsts), 'a first stays a first');
  const view = playerView(after2); assert.ok(!('firsts' in view), 'the browser is not sent it');
  assert.deepEqual(hiddenTruths(after2, { ...view, firsts: after2.firsts }).filter((p) => /firsts/.test(p)).length, 1, 'and the audit would catch it');
  await game.undo(id, { turns: 1 });
  assert.deepEqual(Object.keys(game.loadState(id).firsts).sort(), keys1, 'undo takes the memory back with the world');
});

test('a turn told by the writer is the same on every machine: the same seed gives the same cards, byte for byte', async () => {
  const a = await play(ORDERS.slice(0, 3)); const b = await play(ORDERS.slice(0, 3));
  const strip = (t) => JSON.stringify(t.events.map((e) => [e.headline, e.summary, e.details, e.tier, e.score, e.day]));
  assert.deepEqual(a.turns.map(strip), b.turns.map(strip));
  assert.deepEqual(a.turns.map((t) => t.digest), b.turns.map((t) => t.digest));
});
