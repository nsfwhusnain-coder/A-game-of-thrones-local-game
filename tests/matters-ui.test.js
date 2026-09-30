// Matters as sealed letters (docs/gdd/12-ui-ux.md §10; WP F6). What must hold:
//   • a matter says how long it waits, in words, the same on the map's pin, the Inbox and the letter; and what silence will do, read from what the engine will do;
//   • silence does what the letter says: a matter's `lapse` — which the decision op used to drop, so that silence cost nothing — is kept and applied when the matter lapses;
//   • every matter of the catalogue makes a letter with no holes: who asks, at most three sentences, each answer with its hint, silence, the days left;
//   • the letter keeps the hooks the answering code knows, escapes what it is given, and the map, the pin window and the Inbox are wired to it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.WC_PROVIDER = 'mock'; process.env.WC_SAVES = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-matters-ui-'));
const { createInitialState, applyChanges, getRelation } = await import('../public/js/shared/world.js');
const { MATTERS } = await import('../public/data/matters.js');
const { matterContext, applyPetitionFx } = await import('../public/js/shared/petitions.js');
const { decisionDaysLeft, leftWord } = await import('../public/js/shared/pins.js');
const { dayNumber } = await import('../public/js/engine/time.js');
const M = await import('../public/js/ui/matters.js');
const game = await import('../server/game.js');
test.after(() => fs.rmSync(process.env.WC_SAVES, { recursive: true, force: true }));

const rd = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const env = { esc, por: (c) => `/p/${c.id}.png`, icon: (n) => `<svg data-icon="${n}"></svg>` };
const world = (house = 'stark') => createInitialState('agot_298', house, { seed: 298 });
const brought = (s, o = {}) => { applyChanges(s, [{ op: 'decision', matter: 'border_quarrel', title: 'A border quarrel', text: 'One. Two. Three. Four.', from: 'jon_umber', options: [{ label: 'Judge for Umber', hint: 'Umber grateful' }, { label: 'Judge for Karstark', hint: 'Karstark grateful' }], days: 14, ...o }], { source: 'test' }); return s.decisions.at(-1); };

test('the days a matter has left: the same words everywhere, the last day at zero, nothing for a save with no reckoning', () => {
  const s = world(); const d = brought(s); const today = dayNumber(s.meta.date);
  assert.equal(d.day, today); assert.equal(decisionDaysLeft(s, d), 14);
  assert.equal(decisionDaysLeft(s, { ...d, day: today - 10 }), 4); assert.equal(decisionDaysLeft(s, { ...d, day: today - 20 }), 0, 'never below zero');
  assert.equal(decisionDaysLeft(s, { id: 'x' }), null); assert.equal(decisionDaysLeft(s, { day: 3 }), null);
  assert.deepEqual([null, 0, 1, 6].map(leftWord), ['', 'the last day', '1 day left', '6 days left']);
  assert.deepEqual([null, 0, 2, 3, 5, 6].map(M.toneOfLeft), ['', 'late', 'late', 'soon', 'soon', 'far']);
  assert.equal(M.daysLeftOf, decisionDaysLeft); assert.equal(M.leftWord, leftWord);
});

test('silence in words, from what the engine will do: the King\'s call is refused, a rising goes unanswered, a rebel leaves, a lapse is read effect by effect', () => {
  const s = world(); const d = (o) => ({ id: 'd', from: 'robert_baratheon', options: [], ...o });
  assert.match(M.silenceOf(s, d({ kind: 'liege_call' })).line, /^The King will take your silence as a refusal$/); assert.equal(M.silenceOf(s, d({ kind: 'liege_call' })).tone, 'bad');
  assert.match(M.silenceOf(s, d({ options: [{ label: 'a', fx: [{ rising: ['moat_cailin', 'ignore'] }] }] })).line, /rising goes unanswered/);
  assert.match(M.silenceOf(s, d({ options: [{ label: 'a', fx: [{ rebel: ['bolton', 'release'] }] }] })).line, /take themselves out of your realm/);
  const l = M.silenceOf(s, d({ lapse: [{ rel: ['tully', -4] }, { rel2: ['umber', 'karstark', -8] }, { unrestAll: 2 }, { unrest: ['moat_cailin', 8] }, { prosperity: ['moat_cailin', -3] }, { loyalty: ['roose_bolton', -5] }] }));
  assert.equal(l.tone, 'bad');
  for (const w of [/House Tully will think less of you/, /House Umber and House Karstark grow more bitter/, /unrest grows in your lands/, /unrest grows at Moat Cailin/, /Moat Cailin grows poorer/, /Bolton's loyalty wanes/]) assert.match(l.line, w);
  assert.match(M.silenceOf(s, d({ lapse: [{ rel: ['tully', 4] }] })).line, /think the better of you/); assert.equal(M.silenceOf(s, d({ lapse: [{ rel: ['tully', 4] }] })).tone, 'quiet');
  assert.deepEqual(M.silenceOf(s, d({ lapse: [] })), { line: 'Nothing comes of it, and the matter passes', tone: 'quiet' });
  assert.ok(!/\d/.test(l.line), 'no numbers: a lord reads words');
});

test('silence does what the letter says: a matter\'s lapse is kept by the decision op and applied when it lapses (it was dropped, so silence cost nothing)', async () => {
  const lapse = [{ rel: ['tully', -6] }];
  const s = world(); const d = brought(s, { lapse }); assert.deepEqual(d.lapse, lapse, 'the op keeps what silence decides');
  assert.equal(brought(world(), {}).lapse, undefined, 'a matter with no lapse has none');
  assert.equal(brought(world(), { lapse: 'nonsense' }).lapse, undefined, 'and only a list of effects is kept');
  // the same game twice, one matter long overdue, one with its silence written and one without: the world decides for the lord, and only the lapse differs
  const play = async (withLapse) => {
    const { id, state } = game.newGame('agot_298', 'stark', { seed: 298 });
    const t = structuredClone(state); const day = dayNumber(t.meta.date);
    applyChanges(t, [{ op: 'decision', matter: 'border_quarrel', title: 'A quarrel', text: 'Two claim a mill.', from: 'jon_umber', options: [{ label: 'a', hint: 'x' }, { label: 'b', hint: 'y' }], days: 7, ...(withLapse ? { lapse } : {}) }], { source: 'test' });
    t.decisions.at(-1).day = day - 30;
    fs.writeFileSync(path.join(process.env.WC_SAVES, id, 'state.json'), JSON.stringify(t));
    await game.advance(id, { span: '7d', orders: [] }); await game.settled(id);
    const after = game.loadState(id); return { status: after.decisions.find((x) => x.title === 'A quarrel').status, rel: getRelation(after, 'stark', 'tully') };
  };
  const quiet = await play(false); const spoken = await play(true);
  assert.equal(quiet.status, 'lapsed'); assert.equal(spoken.status, 'lapsed');
  assert.equal(spoken.rel, quiet.rel - 6, 'House Tully thinks less of you for your silence');
});

function* drawn() {
  for (const house of ['stark', 'lannister', 'tully']) {
    const s = world(house);
    for (const [id, T] of Object.entries(MATTERS).filter(([, m]) => m.raise)) for (let k = 0; k < 2; k++) { const m = T.raise(matterContext(s)); if (m) yield { s, id, m }; }
  }
}
test('every matter of the catalogue makes a letter with no holes, and its silence is honest about what the engine does', () => {
  const holes = (t) => /undefined|null|NaN|\$\{|\[object/.test(String(t)); let n = 0, withLapse = 0;
  for (const { s, id, m } of drawn()) {
    const c = structuredClone(s); applyChanges(c, [{ op: 'decision', matter: id, ...m }], { source: 'test' });
    const d = c.decisions.at(-1); const v = M.matterOf(c, d); n++;
    assert.ok(v.title && v.gist && v.options.length >= 2 && v.silence.line, id);
    assert.ok(v.gist.split(/(?<=[.!?])\s+/).length <= 3, `${id}: three sentences at most in the letter itself`);
    assert.equal(`${v.gist} ${v.rest}`.trim(), String(d.text).replace(/\s+/g, ' ').trim(), `${id}: nothing of the matter is lost (the rest is under "More")`);
    assert.equal(v.daysLeft, d.days, `${id}: a matter just brought has all its days`);
    const html = M.matterHtml(v, c, env); assert.ok(!holes(html), `${id}: no holes in the letter`);
    for (const o of d.options) assert.ok(html.includes(esc(o.label)), `${id}: the answer "${o.label}" is there`);
    // silence is honest: if the lapse changes the world, the letter does not say "nothing comes of it"; if it says so, nothing changes
    const before = JSON.stringify(c); const after = structuredClone(c); applyPetitionFx(after, d.lapse || [], 'test');
    const changed = JSON.stringify(after) !== before; if (d.lapse?.length) withLapse++;
    if (changed) assert.notEqual(v.silence.line, 'Nothing comes of it, and the matter passes', `${id}: silence changes the world, and the letter says so`);
    if (v.silence.tone === 'quiet' && !changed) assert.ok(true);
    if (!d.lapse?.length) assert.equal(v.silence.tone, 'quiet', `${id}: no lapse, nothing costs`);
  }
  assert.ok(n > 60 && withLapse > 20, `${n} letters drawn, ${withLapse} with a silence that costs`);
});

test('the letter keeps the hooks the answering code knows, escapes what it is given, and shows the days and silence', () => {
  const s = world(); s.characters.jon_umber = s.characters.jon_umber || { ...s.characters.roose_bolton, id: 'jon_umber', name: 'Jon Umber' };
  const d = brought(s, { title: '<b>Quarrel</b>', text: 'Lord <i>Umber</i> claims a mill. He has bled for it. Both appeal. A fourth sentence.', options: [{ label: '<script>x</script>', hint: 'a "hint"' }, { label: 'Two', hint: 'Two hint' }], lapse: [{ rel: ['tully', -4] }] });
  const v = M.matterOf(s, d); const html = M.matterHtml(v, s, env, { place: 'Winterfell', pos: '2 of 3', later: true });
  assert.doesNotMatch(html, /<b>Quarrel|<script>|<i>Umber/); assert.match(html, /&#60;b&#62;Quarrel/);
  assert.equal((html.match(/class="wc-btn dec-opt"/g) || []).length, 2); assert.match(html, /data-dec-id="[^"]+" data-opt="0"/); assert.match(html, /data-dec-id="[^"]+" data-opt="1"/);
  assert.match(html, /class="input dec-note"/); assert.match(html, /class="wc-btn wc-btn--small dec-custom" data-dec-id=/); assert.match(html, /dec-silence/); assert.match(html, /House Tully will think less of you\./);
  assert.match(html, /14 days left/); assert.match(html, /class="wc-matter__clock is-far" data-days="14"/); assert.match(html, /id="pin-skip"/); assert.match(html, /Winterfell · 2 of 3/);
  assert.match(html, /<summary>More<\/summary>/, 'the fourth sentence is under More'); assert.doesNotMatch(M.matterHtml(v, s, env), /pin-skip/, 'Later only when there are several');
  // a matter nearly out of time is pressing
  const late = M.matterOf(s, { ...d, day: dayNumber(s.meta.date) - 13 }); assert.equal(late.tone, 'late'); assert.match(M.matterHtml(late, s, env), /is-late/); assert.match(late.clock, /It will not wait — 1 day left/);
  // the King is named, and waits for no one
  const call = M.matterOf(s, { ...d, kind: 'liege_call', from: 'robert_baratheon' }); assert.match(call.clock, /^The King will not wait — 14 days left$/); assert.equal(call.asker.word, 'The King');
  // the seal takes the asker's wax
  assert.match(M.matterHtml(call, s, env), /--wax:#/); assert.equal(M.matterOf(s, { ...d, from: null }).asker.word, 'The realm'); assert.doesNotMatch(M.matterHtml(M.matterOf(s, { ...d, from: null }), s, env), /wc-matter__face/);
  // an old matter with no reckoning has no clock, and still a letter
  const old = M.matterOf(s, { ...d, day: undefined, days: undefined }); assert.equal(old.clock, ''); assert.doesNotMatch(M.matterHtml(old, s, env), /wc-matter__clock/);
});

test('the wiring: the drawer draws the letter, the pin window and the Inbox open it on vellum, the map pin is a seal that knows the days, and saying nothing puts it away', () => {
  const drawer = rd('public/js/ui/drawer.js'); const pins = rd('public/js/ui/pins.js'); const chrome = rd('public/js/ui/chrome.js'); const map = rd('public/js/map3d/MapScene.js'); const css = rd('public/css/matters.css'); const html = rd('public/index.html');
  assert.match(drawer, /matterHtml\(matterOf\(s, d\), s, \{ esc, por, icon, link: nm \}, extra\)/); assert.match(drawer, /\.dec-silence/); assert.doesNotMatch(drawer, /<span class="tick">✓<\/span>/); assert.doesNotMatch(drawer, /dec-icon">⚖/);
  assert.match(pins, /decisionsHtml\(\[it\.d\], \{ place, pos:/); assert.match(pins, /\{ vellum: true \}/); assert.match(chrome, /modal\(decisionsHtml\(\[d\]\), \{ vellum: true \}\)/); assert.match(chrome, /inboxHint/); assert.match(chrome, /leftWord\(decisionDaysLeft\(app\.state, i\)\)/);
  assert.match(map, /g\.decisions\.length \? '✉'/); assert.match(map, /leftWord\(decisionDaysLeft\(s, g\.decisions\[0\]\)\)/);
  assert.match(html, /css\/matters\.css/); assert.match(css, /\.lbl\.event\.asks/); assert.match(css, /prefers-reduced-motion: reduce\) \{ \.lbl\.event\.asks \{ animation: none/); assert.match(css, /wc-seal-ask/); assert.match(css, /\.wc-matter__silence/);
});
