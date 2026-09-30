// The quiet screen (WP U1 + U2 + U3, GDD 17 §2 and §4, built in the look of GDD 21): a top bar with three vitals and one
// menu, the eight-button dock retired, one Inbox, a headline strip, and a command bar that no longer lives in the chronicle.
//
// Two halves. (1) The pure logic the screen is drawn from: public/js/ui/hud.js (vitalsOf, inboxOf, MENU, routeKey,
// stripOf, turnLabel) — a browser-safe module, so node can run it on real states and compare it with project() and the
// figures, never with constants. (2) The markup: public/index.html read as text (a tiny tag scanner, no DOM library), and
// the wiring in app.js read as text. What only a browser can measure (pixels covered, wrapped text, overlaps) is
// scripts/ui-gate.mjs, which is not part of `npm test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createInitialState, dayNumber } from '../public/js/shared/world.js';
import { project } from '../public/js/shared/economy.js';
import { nextTurnLength } from '../public/js/shared/turns.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const HUD_FILE = 'public/js/ui/hud.js';

// ───────────── the module under test ─────────────
// Loaded once; a missing file or export fails each test that needs it with a plain sentence, not one crash for the file.
let hudMod = null, hudErr = null;
try { hudMod = await import(pathToFileURL(path.join(ROOT, HUD_FILE)).href); } catch (e) { hudErr = e; }
function hud(name) {
  assert.ok(hudMod, `${HUD_FILE} cannot be loaded (${hudErr?.code || hudErr?.message || 'missing'}) — U1–U3 create it`);
  assert.ok(name in hudMod, `${HUD_FILE} does not export ${name}`);
  return hudMod[name];
}

// The server's game module, on the mock provider and a saves folder of its own (it reads both when first imported, so one
// folder serves every test that plays real turns, and goes when they are done).
let gameMod = null; const SAVES = path.join(os.tmpdir(), `wc-hud-${process.pid}`);
async function getGame() {
  if (!gameMod) { process.env.WC_PROVIDER = 'mock'; process.env.WC_SAVES = SAVES; fs.mkdirSync(SAVES, { recursive: true }); gameMod = await import('../server/game.js'); }
  return gameMod;
}
test.after(() => fs.rmSync(SAVES, { recursive: true, force: true }));

// A real opening state, and the house that plays it (`me` is the player's house id, as project() takes it).
const world = (house = 'stark', seed = 298) => createInitialState('agot_298', house, { seed });
const fig = (s, me, f) => Number(s.houses[me].figures[f].v);
// every number written in a line of plain words: "+6,917 a moon; between +5,500 and +8,000" → [6917, 5500, 8000]
const numbersIn = (text) => (String(text).replace(/(?<=\d),(?=\d{3})/g, '').match(/\d+(?:\.\d+)?/g) || []).map(Number);
const vital = (s, key) => { const v = hud('vitalsOf')(s, s.meta.player); const it = v.find((x) => x.key === key); assert.ok(it, `no ${key} vital in ${JSON.stringify(v.map((x) => x.key))}`); return it; };
const TRENDS = ['up', 'down', 'steady'];
const sign = (n) => (n > 0 ? 'up' : n < 0 ? 'down' : 'steady');
// a house that is losing money: works that cost more a moon than the realm earns
const bleeding = (s, me) => { s.projects = [...(s.projects || []), { id: 'w_test', name: 'A great hall', house: me, status: 'active', perMonth: 50000, monthsLeft: 6 }]; return s; };

// ───────────── the source files, read as text ─────────────
const INDEX = read('public/index.html');
const APP = read('public/js/app.js');
const UI_FILES = fs.readdirSync(path.join(ROOT, 'public/js/ui')).filter((f) => f.endsWith('.js')).map((f) => `public/js/ui/${f}`);
const SCRIPT_SOURCES = ['public/js/app.js', ...UI_FILES].map((f) => [f, read(f)]);
const noComments = (js) => js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\'"`])\/\/.*$/gm, '$1');

// A small HTML reader: tags, attributes, nesting, and the text inside. Enough to ask "is X inside Y" and "how many
// buttons are in Z" of index.html without a DOM library. Comments and <script>/<style> bodies are skipped.
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
function parseHtml(html) {
  const root = { tag: '#root', attrs: {}, children: [], parent: null, from: 0, to: html.length };
  const all = []; let cur = root;
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/g; let m;
  while ((m = re.exec(html))) {
    if (m[0].startsWith('<!--')) continue;
    const [whole, closing, rawTag, rawAttrs] = m; const tag = rawTag.toLowerCase();
    if (closing) {
      let n = cur; while (n && n.tag !== tag) n = n.parent;
      if (n && n !== root) { n.to = m.index; cur = n.parent; }
      continue;
    }
    const attrs = {};
    for (const a of rawAttrs.matchAll(/([^\s=\/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) attrs[a[1].toLowerCase()] = a[2] ?? a[3] ?? a[4] ?? '';
    const node = { tag, attrs, children: [], parent: cur, from: m.index + whole.length, to: m.index + whole.length, outer: m.index };
    cur.children.push(node); all.push(node);
    const selfClosed = /\/\s*$/.test(rawAttrs) || VOID.has(tag);
    if (selfClosed) continue;
    if (tag === 'script' || tag === 'style') { const end = html.indexOf(`</${tag}>`, re.lastIndex); node.to = end < 0 ? html.length : end; re.lastIndex = end < 0 ? html.length : end + tag.length + 3; continue; }
    cur = node;
  }
  const decode = (t) => t.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
  const textOf = (n) => decode(html.slice(n.from, n.to).replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
  const byId = (id) => all.find((n) => n.attrs.id === id) || null;
  const classes = (n) => (n.attrs.class || '').split(/\s+/).filter(Boolean);
  const inside = (n, anc) => { for (let p = n.parent; p; p = p.parent) if (p === anc) return true; return false; };
  const under = (n) => { const out = []; const walk = (x) => { for (const c of x.children) { out.push(c); walk(c); } }; walk(n); return out; };
  return { root, all, byId, classes, inside, under, textOf, html };
}
const DOC = parseHtml(INDEX);
// closed popovers and hidden things do not count as "on the screen"
const isScreen = (n) => DOC.classes(n).includes('screen'); // #game-screen itself is "hidden" until a game starts: not what is meant
const isHiddenSub = (n) => { for (let p = n; p && p.tag !== '#root' && !isScreen(p); p = p.parent) if ('hidden' in p.attrs || DOC.classes(p).includes('hidden') || p.attrs['aria-hidden'] === 'true' || 'inert' in p.attrs) return true; return false; };
const isControl = (n) => n.tag === 'button' || n.tag === 'select' || n.tag === 'textarea' || (n.tag === 'input' && n.attrs.type !== 'hidden') || (n.tag === 'a' && 'href' in n.attrs)
  || 'data-action' in n.attrs || 'data-win' in n.attrs || 'data-win-open' in n.attrs || ['button', 'tab', 'menuitem'].includes(n.attrs.role);
const controlsIn = (node, { visibleOnly = true } = {}) => DOC.under(node).filter((n) => isControl(n) && (!visibleOnly || !isHiddenSub(n)));
const must = (id) => { const n = DOC.byId(id); assert.ok(n, `public/index.html has no #${id}`); return n; };
const accessibleName = (n) => [DOC.textOf(n), n.attrs['aria-label'], n.attrs.title].filter(Boolean).join(' ');

// ═════════════ the numbers on the top bar (U1) ═════════════

test('three vitals, and only three: Coin, Men, Food, each with a value, an arrow, a warning flag, a label and a hover', () => {
  const s = world(); const v = hud('vitalsOf')(s, s.meta.player);
  assert.ok(Array.isArray(v), 'vitalsOf returns a list');
  assert.deepEqual(v.map((x) => x.key), ['coin', 'men', 'food']);
  for (const x of v) {
    assert.equal(typeof x.value, 'number', `${x.key}: value is the plain number (the screen formats it)`);
    assert.ok(Number.isFinite(x.value), `${x.key}: value is finite`);
    assert.ok(TRENDS.includes(x.trend), `${x.key}: trend ${x.trend}`);
    assert.equal(typeof x.warn, 'boolean', `${x.key}: warn`);
    assert.ok(typeof x.label === 'string' && x.label.trim(), `${x.key}: label (it becomes the aria-label)`);
    assert.ok(typeof x.hover === 'string' && x.hover.trim(), `${x.key}: hover`);
  }
  assert.equal(new Set(v.map((x) => x.label)).size, 3, 'three different labels');
});

test('Coin is the treasury, its arrow is the sign of the moon\'s net, and the hover gives the range project() computes', () => {
  for (const make of [() => world(), () => bleeding(world(), 'stark')]) {
    const s = make(); const me = s.meta.player; const pr = project(s, me); const c = vital(s, 'coin');
    assert.equal(c.value, fig(s, me, 'treasury'));
    assert.equal(c.trend, sign(pr.net), `net ${pr.net}`);
    const nums = numbersIn(c.hover);
    for (const n of [pr.net, pr.low, pr.high]) assert.ok(nums.includes(Math.abs(n)), `the hover names ${Math.abs(n)} (of net ${pr.net}, range ${pr.low}…${pr.high}): "${c.hover}"`);
    assert.match(c.hover, /a moon|each moon|per moon/i, 'the hover says the figures are for a moon');
  }
  assert.equal(vital(bleeding(world(), 'stark'), 'coin').trend, 'down', 'a house losing money has a falling arrow');
  assert.equal(vital(world(), 'coin').trend, 'up', 'the Starks open in surplus (project().net > 0)');
});

test('Coin warns only when the moon loses money AND the chest holds under three moons of expenses', () => {
  const at = (make, treasury) => { const s = make(); s.houses[s.meta.player].figures.treasury.v = treasury; return { s, c: vital(s, 'coin'), pr: project(s, s.meta.player) }; };
  const A = at(() => bleeding(world(), 'stark'), 1000);
  assert.ok(A.pr.net < 0 && 1000 < 3 * A.pr.expenses);
  assert.equal(A.c.warn, true, 'losing money and nearly empty: warn');
  const B = at(() => bleeding(world(), 'stark'), 1e9);
  assert.equal(B.c.warn, false, 'losing money but rich: no warning');
  const C = at(() => world(), 1);
  assert.ok(C.pr.net > 0);
  assert.equal(C.c.warn, false, 'a poor house that still earns is not flagged');
  // the line itself: three moons of expenses is the edge (under it warns, at it does not)
  const s0 = bleeding(world(), 'stark'); const e3 = 3 * project(s0, 'stark').expenses;
  assert.equal(at(() => bleeding(world(), 'stark'), e3 - 1).c.warn, true);
  assert.equal(at(() => bleeding(world(), 'stark'), e3).c.warn, false);
});

test('Men is levies plus men-at-arms plus the men of the house\'s hosts: not the guard, not the garrisons, not another house\'s host', () => {
  const s = world(); const me = s.meta.player;
  const hostMen = (st) => Object.values(st.parties).filter((a) => a.owner === me && a.kind === 'host').reduce((n, a) => n + (Number(a.men) || 0), 0);
  assert.ok(Object.values(s.parties).some((a) => a.owner === me && a.kind === 'garrison'), 'the fixture has a garrison that must not be counted');
  assert.equal(vital(s, 'men').value, fig(s, me, 'levies') + fig(s, me, 'menAtArms') + hostMen(s));
  // each part moves the number by exactly its own amount
  const base = vital(s, 'men').value;
  s.houses[me].figures.levies.v += 1000; assert.equal(vital(s, 'men').value, base + 1000, 'levies');
  s.houses[me].figures.menAtArms.v += 250; assert.equal(vital(s, 'men').value, base + 1250, 'men-at-arms');
  s.houses[me].figures.guard.v += 999; assert.equal(vital(s, 'men').value, base + 1250, 'the guard is not counted');
  const other = Object.values(s.parties).find((a) => a.owner && a.owner !== me && a.kind === 'host');
  if (other) { other.men += 5000; assert.equal(vital(s, 'men').value, base + 1250, 'a rival\'s host is not counted'); }
});

test('calling the banners moves men from the levies into a host; the Men vital does not change, and its hover gives the split', async () => {
  const game = await getGame();
  const { id, state } = game.newGame('agot_298', 'stark', { seed: 298 });
  const before = vital(state, 'men').value;
  const vassals = Object.values(state.houses).filter((h) => h.liege === 'stark').map((h) => h.id);
  game.act(id, { kind: 'call_banners', vassals, at: 'stark', ownLevies: 4000 });
  const s = game.loadState(id);
  const host = Object.values(s.parties).find((a) => a.owner === 'stark' && a.kind === 'host');
  assert.ok(host && host.men > 0, 'a host stands at Winterfell');
  const m = vital(s, 'men');
  assert.equal(m.value, before, 'the same men, in the field instead of the fields');
  assert.equal(m.value, fig(s, 'stark', 'levies') + fig(s, 'stark', 'menAtArms') + host.men);
  const nums = numbersIn(m.hover);
  for (const [what, n] of [['levies', fig(s, 'stark', 'levies')], ['men-at-arms', fig(s, 'stark', 'menAtArms')], ['the host', host.men]]) assert.ok(nums.includes(n), `the hover gives ${what}: ${n} in "${m.hover}"`);
});

test('Food is the moons of stores, warns under four, and its arrow follows the last two ledger entries', () => {
  const s = world(); const me = s.meta.player; const h = s.houses[me];
  const f = () => vital(s, 'food');
  assert.ok(Math.abs(f().value - fig(s, me, 'food')) <= 0.05, 'moons of stores');
  assert.equal(f().trend, 'steady', 'no ledger yet: steady');
  h.ledger = [{ turn: 1, food: 8 }]; assert.equal(f().trend, 'steady', 'one entry is not a trend');
  h.ledger = [{ turn: 1, food: 9 }, { turn: 2, food: 8 }]; assert.equal(f().trend, 'down');
  h.ledger = [{ turn: 1, food: 8 }, { turn: 2, food: 9 }]; assert.equal(f().trend, 'up');
  h.ledger = [{ turn: 1, food: 8 }, { turn: 2, food: 8 }]; assert.equal(f().trend, 'steady');
  h.ledger = [{ turn: 1, food: 1 }, { turn: 2, food: 20 }, { turn: 3, food: 19 }]; assert.equal(f().trend, 'down', 'only the last two entries count');
  for (const [moons, warn] of [[3.9, true], [0.5, true], [4, false], [12, false], [30, false]]) { h.figures.food.v = moons; assert.equal(f().warn, warn, `${moons} moons`); }
  h.figures.food.v = 6.3; assert.ok(numbersIn(f().hover).includes(6.3) || numbersIn(f().hover).includes(6), 'the hover says how many moons');
  assert.match(f().hover, /moon/i);
});

test('the hover is plain words: no field names, no undefined, no object dumps', () => {
  for (const s of [world(), bleeding(world('lannister'), 'lannister'), world('greyjoy')]) {
    for (const x of hud('vitalsOf')(s, s.meta.player)) {
      for (const bad of [/undefined|NaN|\bnull\b|\[object|Infinity/, /[a-z][A-Z]/, /\w_\w/, /\.v\b|figures|asOf|treasury\.|menAtArms/]) assert.doesNotMatch(x.hover, bad, `${x.key}: "${x.hover}"`);
      assert.doesNotMatch(x.label, /[a-z][A-Z]|\w_\w|undefined|NaN/, `${x.key} label "${x.label}"`);
    }
  }
});

// ═════════════ one Inbox (U3) ═════════════

test('one Inbox count for letters, matters and audiences', () => {
  const s = world(); const me = s.meta.player; const inbox = hud('inboxOf');
  assert.deepEqual(inbox(s, me).items, [], 'a fresh house has nothing waiting');
  assert.equal(inbox(s, me).count, 0);
  const T = s.meta.turn; const day = dayNumber(s.meta.date);
  s.ravens = [
    { id: 'r1', day, from: 'robb_stark', fromName: 'Robb Stark', text: 'Father, the Freys are late.', date: 'x', read: false },
    { id: 'r2', day, from: 'catelyn_tully', fromName: 'Catelyn Stark', text: 'Come north.', date: 'x', read: false },
    { id: 'r3', day, from: 'luwin', fromName: 'Maester Luwin', text: 'Read already.', date: 'x', read: true },
  ];
  s.decisions = [
    { id: 'd1', title: 'The granary at Wintertown', text: '…', from: null, options: [{ label: 'Open it' }], date: 'x', turn: T, day, days: 14, status: 'pending' },
    { id: 'd2', title: 'A hedge knight begs a place', text: '…', from: null, options: [{ label: 'Take him' }], date: 'x', turn: T, day, days: 14, status: 'pending' },
    { id: 'd3', title: 'Long settled', text: '…', from: null, options: [{ label: 'Aye' }], date: 'x', turn: T, day, days: 14, status: 'answered' },
  ];
  // an audience that is running: the other party has spoken this turn and has not closed the door
  s.chats.jon_snow = [{ role: 'player', text: 'Will you take the black?', date: 'x', turn: T }, { role: 'npc', text: 'I will think on it.', date: 'x', turn: T }];
  s.moods = { jon_snow: { turn: T, full: 100, patience: 3, closed: false } };
  const r = inbox(s, me);
  const of = (kind) => r.items.filter((i) => i.kind === kind);
  assert.equal(of('letter').length, 2, 'the two unread letters (the read one is not waiting on you)');
  assert.equal(of('matter').length, 2, 'the two matters awaiting a decision (the answered one is done)');
  assert.equal(of('audience').length, 1, 'the running audience');
  assert.equal(r.count, 5, 'one count');
  assert.equal(r.count, r.items.length, 'the count is the list');
  assert.deepEqual(of('letter').map((i) => i.id).sort(), ['r1', 'r2']);
  assert.deepEqual(of('matter').map((i) => i.id).sort(), ['d1', 'd2']);
  assert.equal(of('audience')[0].id, 'jon_snow');
  for (const i of r.items) { assert.ok(['letter', 'matter', 'audience'].includes(i.kind)); assert.ok(typeof i.title === 'string' && i.title.trim(), `${i.kind} ${i.id} has a title`); }
  assert.equal(new Set(r.items.map((i) => `${i.kind}:${i.id}`)).size, r.items.length, 'no item twice');
  // answering and reading take things out of the count
  s.ravens[0].read = true; s.decisions[0].status = 'answered';
  assert.equal(inbox(s, me).count, 3);
  // an old audience, from a turn long gone, is not "running"
  s.chats.jon_snow.forEach((m) => { m.turn = T - 5; }); s.moods.jon_snow.turn = T - 5;
  assert.equal(inbox(s, me).count, 2, 'an audience of a past turn no longer waits');
});

test('the old badges are gone: no dock badge, no raven badge, no separate letters counter', () => {
  assert.ok(!DOC.byId('raven-badge'), '#raven-badge is one of the three badge systems the Inbox replaces');
  assert.ok(!DOC.byId('letters-count'), '#letters-count is one of the three badge systems the Inbox replaces');
  for (const [f, src] of SCRIPT_SOURCES) assert.doesNotMatch(noComments(src), /dock-badge|raven-badge|letters-count/, `${f} still draws an old badge`);
});

// ═════════════ the headline strip (U3) ═════════════

const EV = (o) => ({ type: 'court', text: `${o.title} — told at length.`, importance: 3, day: 1, ...o });
const HIST = () => [
  { turn: 1, date: '2nd day, 8th moon, 298 AC', events: [EV({ title: 'A1', importance: 4, day: 2, where: 'stark' }), EV({ title: 'Small', importance: 2, day: 3 })] },
  { turn: 2, date: '9th day, 8th moon, 298 AC', events: [EV({ title: 'B1', importance: 3, day: 1 }), EV({ title: 'B2', headline: 'B2 in a line', importance: 5, day: 4, where: 'winterfell' })] },
  { turn: 3, date: '16th day, 8th moon, 298 AC', events: [EV({ title: 'C1', importance: 3, day: 6, where: 'karhold' }), EV({ title: 'Pip', importance: 1, day: 7 })] },
];

test('the strip is the latest three events of importance three or more, newest first, a headline before a title', () => {
  const strip = hud('stripOf'); const out = strip(HIST());
  assert.deepEqual(out.map((x) => x.text), ['C1', 'B2 in a line', 'B1'], 'newest first; day 4 before day 1 within a turn; the card\'s headline when it has one');
  for (const x of out) { assert.ok(typeof x.id === 'string' && x.id || typeof x.id === 'number', 'an id'); assert.equal(typeof x.unread, 'boolean'); assert.ok('where' in x, 'where (a place to fly to)'); }
  assert.equal(new Set(out.map((x) => x.id)).size, out.length, 'ids are unique');
  assert.equal(out[0].where, 'karhold'); assert.equal(out[1].where, 'winterfell'); assert.ok(!out[2].where, 'no place, no where');
  assert.deepEqual(strip(HIST(), 2).map((x) => x.text), ['C1', 'B2 in a line'], 'n is the length');
  assert.deepEqual(strip(HIST(), 9).map((x) => x.text), ['C1', 'B2 in a line', 'B1', 'A1'], 'importance below three never reaches the strip, however long it is allowed to be');
  assert.deepEqual(strip([]), []); assert.deepEqual(strip([{ turn: 1, date: 'x', events: [] }]), []);
});

test('the strip marks what the player has not seen, from a set of seen ids', () => {
  const strip = hud('stripOf');
  const first = strip(HIST(), 3, new Set());
  assert.ok(first.every((x) => x.unread === true), 'nothing seen yet: all unread');
  const second = strip(HIST(), 3, new Set([first[0].id, first[2].id]));
  assert.deepEqual(second.map((x) => x.unread), [false, true, false]);
  assert.deepEqual(second.map((x) => x.text), first.map((x) => x.text), 'seeing does not reorder');
  assert.ok(strip(HIST(), 3, new Set(first.map((x) => x.id))).every((x) => x.unread === false), 'all seen');
});

test('on a real three-turn game the strip shows only what the chronicle told, the newest first', async () => {
  const game = await getGame();
  const { id } = game.newGame('agot_298', 'stark', { seed: 298 });
  for (let i = 0; i < 3; i++) await game.advance(id, { span: '10d' });
  const s = game.loadState(id);
  const told = s.history.flatMap((t) => (t.events || []).filter((e) => (e.importance || 0) >= 3).map((e) => e.headline || e.title));
  const out = hud('stripOf')(s.history);
  assert.equal(out.length, Math.min(3, told.length), `three, or as many as there are (${told.length} told)`);
  for (const x of out) assert.ok(told.includes(x.text), `"${x.text}" is a headline or title from the record`);
  if (out.length) {
    const last = s.history.filter((t) => (t.events || []).some((e) => (e.importance || 0) >= 3)).at(-1);
    const lastTexts = last.events.filter((e) => (e.importance || 0) >= 3).map((e) => e.headline || e.title);
    assert.ok(lastTexts.includes(out[0].text), 'the first headline is from the latest turn that had one');
  }
});

// ═════════════ the End-turn plate's reason ═════════════

test('the End-turn plate\'s sub-label is the next stop, in one plain line', () => {
  const label = hud('turnLabel');
  const s = world(); const u = nextTurnLength(s);
  assert.equal(label(s), `next: ${u.days} ${u.days === 1 ? 'day' : 'days'} — ${u.reason}`);
  assert.match(label(s), /^next: 7 days — a quiet week$/, 'the opening turn is a quiet week');
  // a raven due tomorrow: one day, singular, and the reason from the same source the turn itself stops for
  const t = world(); t.pendingReplies = [{ char: 'robb_stark', arrivesDay: dayNumber(t.meta.date) + 1 }];
  const u1 = nextTurnLength(t); assert.equal(u1.days, 1);
  assert.equal(label(t), `next: 1 day — ${u1.reason}`);
  assert.doesNotMatch(label(t), /[<>&]/, 'text, not markup (the screen escapes it)');
});

// ═════════════ the three doors and the old keys (U2) ═════════════

test('the menu is three entries, not eight: Realm (R), People (P), Chronicle (H)', () => {
  const MENU = hud('MENU');
  assert.ok(Array.isArray(MENU)); assert.equal(MENU.length, 3);
  assert.deepEqual(MENU.map((m) => [m.id, m.key]), [['realm', 'r'], ['people', 'p'], ['chronicle', 'h']]);
  for (const m of MENU) for (const v of Object.values(m)) if (typeof v === 'string') assert.doesNotMatch(v, /^\s*(economy|military|diplomacy|intrigue)\s*$/i, `${m.id}: "${v}" — those are not doors any more`);
  for (const m of MENU) assert.equal(hud('routeKey')(m.key).open, m.id, `${m.key} opens ${m.id}`);
});

test('every old hotkey still opens its content', () => {
  const route = hud('routeKey');
  const want = { r: ['realm'], p: ['people'], h: ['chronicle'], m: ['realm', 'wars'], e: ['realm', 'economy'], d: ['realm', 'houses'], c: ['people', 'council'], i: ['people', 'shadows'] };
  for (const [k, [open, section]] of Object.entries(want)) {
    const r = route(k); assert.ok(r, `${k} is routed`);
    assert.equal(r.open, open, `${k} opens ${open}`);
    if (section) assert.equal(r.section, section, `${k} lands on ${open}/${section}`);
  }
});

test('the map\'s own keys and every other key are not stolen: the pan keys w a s, arrows, Enter, Escape, digits', () => {
  const route = hud('routeKey');
  for (const k of ['w', 'a', 's', 'W', 'A', 'S', 'ArrowUp', 'ArrowLeft', 'Enter', 'Escape', 'Tab', ' ', '1', '?', 'x', 'q', 'z', '']) assert.equal(route(k), null, `routeKey(${JSON.stringify(k)}) is null`);
});

test('app.js sends the keys through routeKey; the old letter-to-window table and the title-screen "menu" are gone', () => {
  const app = noComments(APP);
  assert.match(app, /routeKey\s*\(/, 'the keydown handler calls routeKey');
  assert.doesNotMatch(app, /\{\s*r:\s*'realm',\s*c:\s*'council'/, 'the old hotkey table is replaced by routeKey');
  const menuCase = app.match(/case 'menu':[^\n]*/)?.[0] || '';
  assert.doesNotMatch(menuCase, /initTitle/, 'the ☰ button opens the menu popover; it no longer throws the player back to the title screen');
  assert.match(app, /initTitle\s*\(/, 'the way back to the title screen is still there, one entry in the popover');
  assert.match(noComments(read('public/js/ui/windows.js')), /export function openWindow\(\s*name\s*,\s*\w+/, 'openWindow(name, arg) takes the section');
});

test('Escape closes the menu and the Inbox first, before the window or the card; Ctrl+Enter still ends the turn', () => {
  const app = noComments(APP);
  const key = app.slice(app.indexOf("addEventListener('keydown'"));
  const esc = key.slice(key.indexOf("'Escape'"));
  assert.ok(esc, 'the keydown handler knows Escape');
  const firstPopover = esc.slice(0, 1200).search(/menu|inbox|popover|closePop/i);
  const firstPanel = Math.min(...['closeSheet', 'closeWindow'].map((n) => { const i = esc.indexOf(n); return i < 0 ? Infinity : i; }));
  assert.ok(firstPopover >= 0, 'Escape reaches the popovers');
  assert.ok(firstPopover < firstPanel, 'the popovers are closed before the window and the sheet');
  assert.match(key, /e\.key === 'Enter' && \(e\.ctrlKey \|\| e\.metaKey\)\)?\s*(?:return\s*)?advance\(\)/, 'Ctrl+Enter ends the turn');
});

// ═════════════ the markup (index.html) ═════════════

test('the top bar has at most eight controls', () => {
  const top = must('hud-top'); const c = controlsIn(top);
  // the three vitals are drawn by renderTop into the bar: unless the markup already holds them, they are three more controls
  const staticVitals = c.filter((n) => 'data-vital' in n.attrs || DOC.classes(n).some((k) => /vital/.test(k))).length;
  const total = c.length + Math.max(0, 3 - staticVitals);
  const names = c.map((n) => n.tag + (n.attrs['data-action'] ? `[${n.attrs['data-action']}]` : '') + (n.attrs.id ? `#${n.attrs.id}` : '')).join(', ');
  assert.ok(total <= 8, `#hud-top will hold ${total} controls (${c.length} in the markup: ${names}; plus the vitals the script draws)`);
  assert.ok(c.some((n) => n.attrs['data-action'] === 'advance'), 'End turn is still on the bar');
});

test('the six system icons are gone from the top bar: letters, music, undo, help, settings live in the menu and the Inbox', () => {
  const top = must('hud-top');
  const inTop = controlsIn(top).map((n) => n.attrs['data-action']).filter(Boolean);
  for (const a of ['ravens', 'music', 'undo', 'help', 'settings']) assert.ok(!inTop.includes(a), `#hud-top still holds data-action="${a}"`);
  assert.ok(!DOC.all.some((n) => DOC.classes(n).includes('sys-btns')), 'no .sys-btns row');
  const pop = must('menu-pop');
  const inPop = DOC.under(pop).map((n) => n.attrs['data-action']).filter(Boolean);
  for (const a of ['music', 'undo', 'help', 'settings']) assert.ok(inPop.includes(a), `#menu-pop has no data-action="${a}" — the quiet buttons move there`);
  assert.ok(isHiddenSub(pop), '#menu-pop starts closed (class "hidden" or aria-hidden, as #window and #sheet do)');
});

test('the date plate carries the day; the turn counter and the "decisions awaiting you" line are gone from it', () => {
  const src = noComments(APP);
  assert.doesNotMatch(src, /class="turn"|>\s*Turn \$\{/, 'no "Turn N" line');
  assert.doesNotMatch(src, /awaiting you/, 'matters awaiting are the Inbox\'s to say');
  assert.doesNotMatch(src, /k:\s*'(Levies|Men-at-arms|Ships|Season)'/, 'the six-tile resource row is gone; the three vitals replace it');
});

test('#turn-until is folded into the End-turn plate, not a loose line beside it', () => {
  const adv = DOC.all.find((n) => n.attrs['data-action'] === 'advance'); assert.ok(adv, 'End turn button');
  const tu = DOC.byId('turn-until');
  if (tu) assert.ok(DOC.inside(tu, adv) || (tu.parent === adv.parent && tu.parent.tag !== '#root' && tu.parent.tag !== 'section'), '#turn-until sits in the plate that holds the End-turn button');
  assert.match(noComments(APP), /turnLabel\s*\(/, 'renderTop writes the plate\'s reason with turnLabel()');
});

test('the eight-button dock is retired: at most three buttons in #action-ring, and no Economy, Military, Diplomacy or Intrigue button in the HUD', () => {
  const ring = DOC.byId('action-ring');
  if (ring) { const b = DOC.under(ring).filter((n) => n.tag === 'button'); assert.ok(b.length <= 3, `#action-ring holds ${b.length} buttons`); }
  const banned = /^\s*(economy|military|diplomacy|intrigue|council)\b/i;
  const hudRoots = ['hud-top', 'hud-player', 'action-ring', 'menu-pop', 'command-bar', 'strip', 'inbox'].map((i) => DOC.byId(i)).filter(Boolean);
  for (const root of hudRoots) for (const n of [root, ...DOC.under(root)]) {
    if (!isControl(n)) continue;
    assert.doesNotMatch(accessibleName(n), banned, `${n.tag}${n.attrs.id ? '#' + n.attrs.id : ''} reads "${accessibleName(n)}"`);
    assert.ok(!['economy', 'military', 'diplomacy', 'intrigue', 'council'].includes(n.attrs['data-win']), `data-win="${n.attrs['data-win']}"`);
  }
});

test('the three doors come from one list (MENU), and the popover they live in is on the page', () => {
  must('menu-pop');
  const users = SCRIPT_SOURCES.filter(([f, src]) => f !== HUD_FILE && new RegExp(`import[^;]*\\bMENU\\b[^;]*from\\s*['"][^'"]*hud\\.js['"]`).test(src)).map(([f]) => f);
  assert.ok(users.length, 'some UI file imports MENU from hud.js to draw the three entries');
});

test('the command bar survives a collapsed chronicle: it is its own bar, not inside the drawer, the strip or the top bar', () => {
  const bar = must('command-bar');
  for (const id of ['drawer', 'strip', 'hud-top', 'hud-player', 'window', 'sheet', 'inbox', 'menu-pop']) { const a = DOC.byId(id); if (a) assert.ok(!DOC.inside(bar, a), `#command-bar is inside #${id}, which can be closed`); }
  const old = DOC.byId('command'), drawer = DOC.byId('drawer');
  if (old && drawer) assert.ok(!DOC.inside(old, drawer), 'the old #command composer is not in the drawer');
  const input = must('order-input');
  assert.ok(DOC.inside(input, bar), '#order-input is inside #command-bar');
  for (const a of ['add-order', 'listen']) assert.ok(DOC.under(bar).some((n) => n.attrs['data-action'] === a), `data-action="${a}" is in the command bar`);
  assert.ok(DOC.under(bar).some((n) => n.attrs.id === 'orders'), 'the order chips (#orders) are in the command bar');
});

test('the skip link still lands on the order input', () => {
  const skip = DOC.all.find((n) => DOC.classes(n).includes('skip-link')); assert.ok(skip, '.skip-link');
  assert.equal(skip.attrs.href, '#order-input');
  assert.ok(DOC.byId('order-input'), 'and #order-input exists for it to land on');
});

test('the headline strip and the Inbox are on the page, and the chronicle no longer owns the left edge', () => {
  const strip = must('strip'); must('inbox');
  const drawer = DOC.byId('drawer'); if (drawer) assert.ok(!DOC.inside(strip, drawer), '#strip is not a child of the old drawer');
  assert.ok(!DOC.byId('drawer-tabs') || !DOC.under(DOC.byId('drawer-tabs')).some((n) => n.attrs['data-tab'] === 'letters'), 'letters are not a tab of the chronicle: they are behind the Inbox');
});

test('one map-mode button replaces the nine', () => {
  assert.ok(!DOC.byId('mapmodes'), '#mapmodes (nine always-visible buttons) is replaced');
  const ids = DOC.all.filter((n) => n.attrs.id === 'mapmode'); assert.equal(ids.length, 1, 'exactly one #mapmode');
  const m = ids[0]; const trigger = m.tag === 'button' ? m : DOC.under(m).find((n) => n.tag === 'button');
  assert.ok(trigger, '#mapmode is (or holds) the one button');
  const visible = controlsIn(m).filter((n) => n.attrs['data-mode']);
  assert.ok(visible.length <= 1, `${visible.length} mode buttons visible in the closed dropdown`);
  for (const [f, src] of SCRIPT_SOURCES) assert.doesNotMatch(noComments(src), /#mapmodes\b/, `${f} still points at #mapmodes`);
});

test('no emoji in index.html: the icons are the game\'s own', () => {
  const hits = new Map();
  for (const m of INDEX.matchAll(/\p{Extended_Pictographic}|\uFE0F|\u200D|[☰＋✉✨▶]/gu)) hits.set(m[0], (hits.get(m[0]) || 0) + 1);
  const list = [...hits].map(([c, n]) => `U+${c.codePointAt(0).toString(16)} ${c} ×${n}`);
  assert.deepEqual(list, [], `index.html still holds emoji: ${list.join('; ')}`);
});

test('portraits stay: the ruler\'s portrait is still on the screen and still opens the sheet, and the family tree is untouched', () => {
  const p = must('player-portrait');
  assert.equal(p.tag, 'button', 'a button');
  assert.equal(p.attrs['data-action'], 'open-ruler', 'click opens the character sheet');
  assert.doesNotMatch(p.attrs.style || '', /display\s*:\s*none/);
  const app = noComments(APP);
  assert.match(app, /#player-portrait/); assert.match(app, /Portrait of/); assert.match(app, /case 'open-ruler'/);
  assert.match(noComments(read('public/js/ui/windows.js')), /function familyTree\s*\(/, 'the family tree is still drawn');
  assert.match(noComments(read('public/js/ui/portrait.js')), /export\s+(async\s+)?function\s+portraitURL/, 'portraits are still painted');
});

test('the screen is drawn from the tested functions: the UI imports vitalsOf, inboxOf, stripOf, turnLabel and routeKey from hud.js', () => {
  const imported = new Set();
  for (const [f, src] of SCRIPT_SOURCES) {
    if (f === HUD_FILE) continue;
    for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]([^'"]*hud\.js)['"]/g)) for (const n of m[1].split(',')) imported.add(n.trim().split(/\s+as\s+/)[0]);
  }
  for (const n of ['vitalsOf', 'inboxOf', 'stripOf', 'turnLabel', 'routeKey']) assert.ok(imported.has(n), `no UI file imports ${n} from hud.js`);
  // a vital is labelled for a screen reader (U1 acceptance: aria-label on each vital)
  assert.ok(SCRIPT_SOURCES.some(([f, src]) => f !== HUD_FILE && /vitalsOf/.test(src) && /aria-label/.test(src)), 'the vitals are drawn with an aria-label');
});

test('no script points at an element the page no longer has (the rebuild removes ids; a stale $(\'#gone\').onclick would stop the game at load)', () => {
  const pageIds = new Set(DOC.all.map((n) => n.attrs.id).filter(Boolean));
  const jsText = SCRIPT_SOURCES.map(([, s]) => s).join('\n');
  const made = new Set([...jsText.matchAll(/\bid=\\?["']([\w-]+)\\?["']|\bid\s*[:=]\s*['"]([\w-]+)['"]|\.id\s*=\s*['"]([\w-]+)['"]/g)].map((m) => m[1] || m[2] || m[3]));
  const dangling = [];
  for (const [f, src] of SCRIPT_SOURCES) {
    for (const line of noComments(src).split('\n')) {
      for (const m of line.matchAll(/\$\(\s*'#([\w-]+)'\s*\)\s*(?:\.|\[)/g)) {
        if (pageIds.has(m[1]) || made.has(m[1])) continue;
        // a guard on the same line ("if ($('#x'))", "a && $('#x').…") is the script already allowing for its absence
        if (new RegExp(`(?:if\\s*\\(|&&|\\|\\||\\?)\\s*!?\\$\\(\\s*'#${m[1]}'\\s*\\)(?!\\s*[.\\[])`).test(line)) continue;
        dangling.push(`${f}: #${m[1]}`);
      }
    }
  }
  assert.deepEqual([...new Set(dangling)], [], 'used without `?.` but neither in index.html nor made by a script');
});

// ═════════════ the module is browser-safe and the functions are pure ═════════════

test('hud.js is browser-safe: no DOM, no node: imports, no clock, no dice', () => {
  assert.ok(fs.existsSync(path.join(ROOT, HUD_FILE)), `${HUD_FILE} does not exist yet`);
  const src = noComments(read(HUD_FILE));
  for (const [re, why] of [[/from\s*['"]node:/, 'a node: import'], [/\brequire\s*\(/, 'require()'], [/\bdocument\b|\bwindow\b|localStorage|sessionStorage|navigator\./, 'the DOM or browser storage'], [/Math\.random|Date\.now|new Date\b|performance\.now/, 'a clock or dice'], [/from\s*['"](?:\.\/|\.\.\/ui\/)common\.js['"]/, 'common.js (it touches the DOM at import)']])
    assert.doesNotMatch(src, re, `hud.js uses ${why}`);
});

test('the same state gives the same answer, and asking changes nothing', () => {
  const H = { vitalsOf: hud('vitalsOf'), inboxOf: hud('inboxOf'), stripOf: hud('stripOf'), turnLabel: hud('turnLabel') };
  const s = bleeding(world('lannister'), 'lannister'); const me = s.meta.player;
  s.ravens = [{ id: 'r1', day: 1, from: 'tywin_lannister', fromName: 'Tywin', text: '…', date: 'x', read: false }];
  s.decisions = [{ id: 'd1', title: 'A matter', text: '…', options: [{ label: 'Aye' }], date: 'x', turn: 0, day: 1, days: 14, status: 'pending' }];
  s.history = HIST();
  const frozen = structuredClone(s);
  const run = (st) => JSON.stringify([H.vitalsOf(st, me), H.inboxOf(st, me), H.stripOf(st.history), H.stripOf(st.history, 2, new Set()), H.turnLabel(st)]);
  const a = run(s), b = run(s), c = run(structuredClone(s));
  assert.equal(a, b, 'twice on one state');
  assert.equal(a, c, 'once on a copy');
  assert.deepEqual(s, frozen, 'no function edited the state it was given');
});
