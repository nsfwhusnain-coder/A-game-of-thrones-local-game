// The chronicle as cards (WP N7, GDD 18 §2.6): ui/feed.js decides which cards a turn shows, in what order and under which day, and what the
// maester's report at the end of a turn says. Pure functions of the turn records the player has been sent, so node runs them on real
// games (the mock provider) and on hand-made histories; the markup that draws them is read as text at the end.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const noComments = (js) => js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\'"`])\/\/.*$/gm, '$1');
const F = await import('../public/js/ui/feed.js');

let gameMod = null; const SAVES = path.join(os.tmpdir(), `wc-feed-${process.pid}`);
async function getGame() {
  if (!gameMod) { process.env.WC_PROVIDER = 'mock'; process.env.WC_SAVES = SAVES; fs.mkdirSync(SAVES, { recursive: true }); gameMod = await import('../server/game.js'); }
  return gameMod;
}
test.after(() => fs.rmSync(SAVES, { recursive: true, force: true }));

const card = (o) => ({ headline: 'A headline', summary: 'A summary.', details: [], type: 'court', importance: 3, day: 1, ...o });
const HIST = () => [
  { turn: 1, date: '8 8th moon, 298 AC', dateFrom: '1 8th moon, 298 AC', segments: [{ from: '2 8th moon, 298 AC', to: '8 8th moon, 298 AC', days: [1, 7] }], events: [
    card({ headline: 'Great one', tier: 'great', score: 7, day: 2, mine: true }), card({ headline: 'Minor one', tier: 'minor', score: 2, day: 3 }),
    card({ headline: 'A raven brings news', tier: 'news', score: 4, day: 4, heard: { via: 'raven', happened: '3 8th moon, 298 AC' } }),
    card({ headline: 'Small', bg: true, tier: 'meanwhile', score: 1, day: 5 })], meanwhile: 'Lords ride to feasts.' },
  { turn: 2, date: '15 8th moon, 298 AC', dateFrom: '8 8th moon, 298 AC', segments: [{ from: '9 8th moon, 298 AC', to: '15 8th moon, 298 AC', days: [1, 7] }], events: [
    card({ headline: 'A battle at the ford', tier: 'major', score: 5.5, type: 'war', archetype: 'battle', day: 1 }), card({ headline: 'Rumour of a dragon', tier: 'news', score: 3.6, type: 'rumor', day: 2 }),
    card({ headline: 'Lord Umber writes', tier: 'news', score: 4, day: 2, houses: ['stark'], archetype: 'letter' })], meanwhile: '' },
];
const STATE = (history = HIST()) => ({ meta: { player: 'stark' }, history });

test('by default the chronicle keeps tier news and above, newest turn first and, in a turn, newest day first', () => {
  const { groups, hidden } = F.feedOf(STATE());
  assert.deepEqual(groups.map((g) => g.turn), [2, 1], 'the newest turn first');
  assert.deepEqual(groups[1].cards.map((c) => c.e.headline), ['A raven brings news', 'Great one'], 'day 4 before day 2; the minor one is held back');
  assert.deepEqual(groups[0].cards.map((c) => c.e.headline), ['Lord Umber writes', 'Rumour of a dragon', 'A battle at the ford']);
  assert.equal(hidden, 1, 'one card was held back, and the panel says so');
  assert.equal(groups[1].held, 1); assert.equal(groups[1].small, 1, 'the Meanwhile keeps its count'); assert.equal(groups[1].meanwhile, 'Lords ride to feasts.');
});

test('"Only what matters" off shows every told story, and a card id is its turn and its place in the record', () => {
  const s = STATE(); const { groups, hidden } = F.feedOf(s, { matters: false });
  assert.equal(hidden, 0);
  assert.equal(groups[1].cards.length, 3, 'three told stories in turn 1 (the fourth is the Meanwhile, not a card)');
  for (const g of groups) for (const c of g.cards) { const [t, i] = c.id.split(':').map(Number); assert.equal(s.history.find((x) => x.turn === t).events[i], c.e, `${c.id} finds its card`); }
  assert.equal(new Set(groups.flatMap((g) => g.cards.map((c) => c.id))).size, 6, 'ids are unique');
});

test('Mine, War, Letters and Rumours each keep what they say, one at a time', () => {
  const heads = (only, matters = false) => F.feedOf(STATE(), { only, matters }).groups.flatMap((g) => g.cards.map((c) => c.e.headline)).sort();
  assert.deepEqual(heads('mine'), ['Great one', 'Lord Umber writes'], 'mine: flagged, or the player is one of the houses');
  assert.deepEqual(heads('war'), ['A battle at the ford']);
  assert.deepEqual(heads('letters'), ['A raven brings news', 'Lord Umber writes']);
  assert.deepEqual(heads('rumours'), ['Rumour of a dragon']);
  assert.deepEqual(heads('mine', true), ['Great one', 'Lord Umber writes'], 'and with "only what matters" too');
  assert.deepEqual(F.feedOf(STATE(), { only: 'nonsense', matters: false }).groups.flatMap((g) => g.cards).length, 6, 'an unknown filter is no filter');
  assert.deepEqual(F.FILTERS.map((f) => f.id), ['mine', 'war', 'letters', 'rumours']);
});

test('a card from before the tiers gets one from its score; a tier of the writer stands', () => {
  assert.equal(F.cardTier({ tier: 'great', score: 1 }), 'great');
  assert.equal(F.cardTier({ importance: 5 }), 'major', 'importance 5, no score: a major thing');
  assert.equal(F.cardTier({ importance: 2 }), 'minor');
  assert.equal(F.cardTier({ importance: 1, bg: true }), 'meanwhile');
});

test('the feed reads the turn records and the player\'s own house, and nothing else of the state (so it can carry no hidden truth)', () => {
  const s = STATE(); const seen = new Set();
  const spy = new Proxy(s, { get(t, k) { seen.add(String(k)); return t[k]; } });
  F.feedOf(spy, { matters: false }); F.feedIds(spy); for (const t of s.history) F.reportOf(t);
  assert.deepEqual([...seen].sort(), ['history', 'meta'], `it touched ${[...seen]}`);
});

test('the report is the digest of the turn and its title says the days told', () => {
  const t = { ...HIST()[0], digest: { top: [{ id: '1-0', headline: 'Great one', line: 'It matters.' }], also: [{ id: '1-2', headline: 'A raven brings news' }], meanwhile: 'Lords ride to feasts.', words: 12, text: '' } };
  const r = F.reportOf(t);
  assert.equal(r.title, 'The week of 2nd–8th of the 8th moon, 298 AC');
  assert.deepEqual([r.top.length, r.also.length, r.meanwhile], [1, 1, 'Lords ride to feasts.']);
  assert.equal(F.reportOf({ ...HIST()[0], events: [], meanwhile: '', digest: undefined }), null, 'a turn with nothing to tell has no report');
  const built = F.reportOf(HIST()[1]); assert.ok(built.top.length >= 1, 'a turn from before the digests has one built from its cards');
  const T = (a, b, c, d) => F.reportTitle({ dateFrom: a, date: b, segments: c ? [{ from: c, to: d }] : [] });
  assert.equal(T('1 9th moon, 298 AC', '1 9th moon, 298 AC', '1 9th moon, 298 AC', '1 9th moon, 298 AC'), 'The 1st of the 9th moon, 298 AC');
  assert.equal(T('1 9th moon, 298 AC', '5 9th moon, 298 AC', '2 9th moon, 298 AC', '5 9th moon, 298 AC'), 'The 4 days of 2nd–5th of the 9th moon, 298 AC');
  assert.equal(T('25 9th moon, 298 AC', '10 10th moon, 298 AC', '26 9th moon, 298 AC', '10 10th moon, 298 AC'), 'The days from 26th of the 9th moon to 10th of the 10th moon, 298 AC');
  assert.equal(T('28 12th moon, 298 AC', '3 1st moon, 299 AC', '29 12th moon, 298 AC', '3 1st moon, 299 AC'), 'The 5 days of 29th of the 12th moon, 298 AC to 3rd of the 1st moon, 299 AC');
});

test('on a real three-turn game the chronicle keeps every story the old feed did, the report is under ninety words, and no card says its summary twice', async () => {
  const game = await getGame();
  const { id } = game.newGame('agot_298', 'stark', { seed: 298 });
  for (let i = 0; i < 3; i++) await game.advance(id, { span: '7d' });
  const s = game.loadState(id);
  const all = F.feedOf(s, { matters: false });
  assert.equal(all.groups.reduce((n, g) => n + g.cards.length, 0), s.history.reduce((n, t) => n + (t.events || []).filter((e) => !e.bg).length, 0), 'the same story count as the old feed');
  const some = F.feedOf(s);
  assert.equal(some.hidden + some.groups.reduce((n, g) => n + g.cards.length, 0), all.groups.reduce((n, g) => n + g.cards.length, 0), 'what the default holds back is counted');
  for (const g of all.groups) for (const c of g.cards) {
    assert.ok(c.e.headline && c.e.summary, `${c.id} has a headline and a summary`);
    assert.notEqual(c.e.summary, (c.e.details || []).join(' '), `${c.id} does not say its summary again as its details`);
    assert.ok(['great', 'major', 'news', 'minor'].includes(c.tier), `${c.id} tier ${c.tier}`);
  }
  for (const t of s.history) { const r = F.reportOf(t); if (!r) continue; const w = [...r.top.flatMap((x) => [x.headline, x.line]), ...r.also.map((x) => x.headline), r.meanwhile].join(' ').split(/\s+/).filter(Boolean).length; assert.ok(w <= 90, `turn ${t.turn}: ${w} words`); }
});

test('the module is browser-safe and pure: no DOM, no node: imports, no clock, no dice', () => {
  const src = noComments(read('public/js/ui/feed.js'));
  for (const [re, why] of [[/from\s*['"]node:/, 'a node: import'], [/\brequire\s*\(/, 'require()'], [/\bdocument\b|\bwindow\b|localStorage/, 'the DOM or storage'], [/Math\.random|Date\.now|new Date\b|performance\.now/, 'a clock or dice'], [/from\s*['"](?:\.\/)common\.js['"]/, 'common.js']]) assert.doesNotMatch(src, re, `feed.js uses ${why}`);
});

test('the chronicle panel is drawn from feed.js: cards with tiers and a Details fold, the filters as chips, and the old blocks are gone', () => {
  const src = noComments(read('public/js/ui/drawer.js'));
  assert.match(src, /from\s*['"]\.\/feed\.js['"]/, 'drawer.js imports feed.js');
  for (const n of ['feedOf', 'feedIds']) assert.match(src, new RegExp(n), `drawer.js uses ${n}`);
  assert.match(src, /wc-card/, 'a card is a wc-card'); assert.match(src, /wc-tier-/, 'with its tier'); assert.match(src, /Details/, 'and a Details fold');
  assert.match(src, /Only what matters/, 'the default filter is named');
  assert.doesNotMatch(src, /function storyHtml\b/, 'the old story rows are gone');
  const report = noComments(read('public/js/ui/report.js'));
  assert.match(report, /reportOf/); assert.match(report, /wc-vellum/, 'the report is on vellum'); assert.match(report, /Continue/);
});
