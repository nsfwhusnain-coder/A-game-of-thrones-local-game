// Names are links, and who is who (docs/gdd/12-ui-ux.md §15.2–15.3 and §14 items 22–24; WP F7). What must hold:
//   • a person's name in the game's text is a link (a dotted underline, a card on hover, their sheet on click) for every person the roster can name without doubt: a full name, the name
//     without its honorific, the honorific and the given name — never a bare first name, never a name that could be two people (a wrong link is worse than none);
//   • ≥ 95 % of the roster's names in a real chronicle are links; nothing is added that the text did not say; the rest of the text is escaped;
//   • the hover card says only what the player's house already sees of a person;
//   • an audience says what the person is to you; every house opens a family tree, and the house's sheet has its button.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.WC_PROVIDER = 'mock'; process.env.WC_SAVES = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-names-'));
const { createInitialState } = await import('../public/js/shared/world.js');
const N = await import('../public/js/ui/names.js');
const T = await import('../public/js/ui/tree.js');
const game = await import('../server/game.js');
test.after(() => fs.rmSync(process.env.WC_SAVES, { recursive: true, force: true }));

const rd = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const world = (house = 'stark') => createInitialState('agot_298', house, { seed: 298 });

test('the forms a name takes: the full name, without its honorific, and the honorific with the given name — never a bare first name', () => {
  assert.deepEqual(N.formsOf('Ser Rodrik Cassel').sort(), ['Rodrik Cassel', 'Ser Rodrik', 'Ser Rodrik Cassel']);
  assert.deepEqual(N.formsOf('Eddard Stark'), ['Eddard Stark']); assert.deepEqual(N.formsOf('Maester Luwin'), ['Maester Luwin']); assert.deepEqual(N.formsOf('Khal Drogo'), ['Khal Drogo']);
  assert.deepEqual(N.formsOf('Hodor'), [], 'one word is not a form'); assert.deepEqual(N.formsOf(''), []); assert.deepEqual(N.formsOf(undefined), []);
  assert.deepEqual(N.formsOf('Lady Catelyn Stark').sort(), ['Catelyn Stark', 'Lady Catelyn', 'Lady Catelyn Stark']);
  assert.ok(N.formsOf('Ser Jon Umber').every((f) => f.length >= 6));
});

test('the roster links a name that means one person, and only that; the rest is escaped and nothing is added', () => {
  const s = world(); const r = N.rosterOf(s);
  const id = (name) => Object.values(s.characters).find((c) => c.name === name)?.id;
  const link = (t) => N.linkNames(t, r, esc);
  const a = link('Ser Rodrik Cassel rides for Moat Cailin, and Eddard Stark waits.');
  assert.match(a, new RegExp(`data-char="${id('Ser Rodrik Cassel')}">Ser Rodrik Cassel</span>`)); assert.match(a, new RegExp(`data-char="${id('Eddard Stark')}">Eddard Stark</span>`));
  assert.match(a, /^<span class="nm" role="link" tabindex="0" data-char=/); assert.equal(a.replace(/<[^>]+>/g, ''), 'Ser Rodrik Cassel rides for Moat Cailin, and Eddard Stark waits.', 'the text is the text');
  assert.match(link('Ser Rodrik is old.'), /data-char="[^"]+">Ser Rodrik<\/span>/, 'the honorific and the given name');
  assert.doesNotMatch(link('Rodrik is old.'), /class="nm"/, 'a bare first name is not a link'); assert.doesNotMatch(link('Lord Stark is old.'), /class="nm"/, 'a surname could be anyone');
  assert.match(link('House Stark marches.'), /data-house="stark">House Stark<\/span>/);
  assert.match(link('Eddard Stark’s host'), /data-char="[^"]+">Eddard Stark<\/span>’s host/, 'a possessive leaves the name whole');
  assert.doesNotMatch(link('Eddard Starkling'), /class="nm"/); assert.doesNotMatch(link('MEddard Stark'), /class="nm"/, 'only a whole name');
  assert.equal(link('Nobody of note & <b>friends</b>'), 'Nobody of note &#38; &#60;b&#62;friends&#60;/b&#62;', 'without names it is escaped text');
  assert.ok(!/<b>|<script/.test(link('<script>Eddard Stark</script>').replace(/<span class="nm"[^>]*>|<\/span>/g, '')), 'what is around a name is escaped');
  assert.equal(link(undefined), ''); assert.equal(link(''), '');
});

test('a name that could be two people is not a link; a rename is seen on the next turn', () => {
  const s = world(); const ids = Object.keys(s.characters).slice(0, 2);
  s.characters[ids[0]].name = 'Ser Garth Doubleman'; s.characters[ids[1]].name = 'Garth Doubleman';
  const two = N.rosterOf(s); assert.doesNotMatch(N.linkNames('Garth Doubleman was here', two, esc), /class="nm"/, '"Garth Doubleman" is both');
  assert.match(N.linkNames('Ser Garth Doubleman was here', two, esc), new RegExp(`data-char="${ids[0]}"`), 'the honorific form is only the first');
  const s2 = world(); s2.characters[ids[0]].name = 'Ser Garth Loneman'; const r = N.rosterOf(s2); assert.match(N.linkNames('Garth Loneman', r, esc), /class="nm"/);
  s2.characters[ids[0]].name = 'Ser Hal Newname'; s2.meta.turn += 1; assert.match(N.linkNames('Hal Newname', N.rosterOf(s2), esc), /class="nm"/, 'the roster is asked again when the turn changes');
});

test('in a real chronicle, ≥ 95 % of the names the roster knows are links (checklist 24)', async () => {
  const { id } = game.newGame('agot_298', 'stark', { seed: 7 });
  for (let i = 0; i < 4; i++) { await game.advance(id, { span: '7d', orders: [] }); await game.settled(id); }
  const s = game.loadState(id); const r = N.rosterOf(s);
  const texts = []; for (const t of s.history || []) for (const e of t.events || []) texts.push(e.headline, e.title, e.summary, e.text, e.scene, ...(Array.isArray(e.details) ? e.details : [e.details]));
  const uniq = [...new Set(texts.filter((x) => typeof x === 'string' && x.trim()))];
  let expected = 0, linked = 0;
  for (const t of uniq) {
    const got = new Set(N.namesIn(t, r).map((h) => `${h.kind}:${h.id}`));
    for (const c of Object.values(s.characters)) {
      const form = N.formsOf(c.name).find((f) => /\s/.test(f) && f === c.name); if (!form || r.byForm.get(form)?.id !== c.id) continue; // a full name the roster can name without doubt
      const hit = new RegExp(`(?<![\\p{L}\\p{N}_'’-])${form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}_-])`, 'u').test(t); if (!hit) continue;
      expected++; if (got.has(`char:${c.id}`)) linked++;
    }
  }
  assert.ok(uniq.length > 20 && expected >= 10, `${uniq.length} texts, ${expected} names present`);
  assert.ok(linked / expected >= 0.95, `${linked} of ${expected} names are links`);
});

test('the hover card says what the house already sees: face, house, title, where they are told to be; the dead are not "somewhere"', () => {
  const s = world(); const c = s.characters.eddard_stark;
  const card = N.nameCardOf(s, 'eddard_stark', { whereText: () => 'at Winterfell' });
  assert.deepEqual([card.name, card.house, card.where, card.status], ['Eddard Stark', 'Stark', 'at Winterfell', '']); assert.match(card.title, /Winterfell|North/);
  assert.equal(N.nameCardOf(s, 'nobody'), null);
  c.alive = false; const dead = N.nameCardOf(s, 'eddard_stark', { whereText: () => 'at Winterfell' }); assert.equal(dead.where, ''); assert.equal(dead.status, 'dead'); c.alive = true;
  c.status = 'imprisoned'; assert.equal(N.nameCardOf(s, 'eddard_stark').status, 'imprisoned'); c.status = 'free';
  c.name = '<i>Ned</i> Stark'; const html = N.nameCardHtml(N.nameCardOf(s, 'eddard_stark'), s, { esc, por: (x) => `/p/${x.id}.png`, sig: () => '' });
  assert.doesNotMatch(html, /<i>Ned/); assert.match(html, /<img src="\/p\/eddard_stark\.png"/); assert.match(html, /House Stark/);
});

test('what a person is to you, in the head of an audience', () => {
  const s = world('stark'); const rel = (id) => N.relationOf(s, id);
  assert.equal(rel('catelyn_stark'), 'your wife'); assert.equal(rel('robb_stark'), 'your son'); assert.equal(rel('sansa_stark'), 'your daughter'); assert.equal(rel('benjen_stark'), 'your brother');
  assert.equal(rel('eddard_stark'), '', 'not to yourself'); assert.equal(rel('nobody'), '');
  assert.equal(rel('roose_bolton'), 'your bannerman');
  const t = world('lannister'); assert.equal(N.relationOf(t, 'cersei_lannister'), 'your daughter'); assert.equal(N.relationOf(t, 'jaime_lannister'), 'your son'); assert.equal(N.relationOf(t, 'joffrey_baratheon'), 'your grandson'); assert.equal(N.relationOf(t, 'tywin_lannister'), '');
  // a liege, and a fellow vassal
  assert.equal(rel('robert_baratheon'), 'your liege'); assert.equal(rel('tywin_lannister'), 'a fellow vassal'); assert.equal(rel('hoster_tully'), 'a fellow vassal'); assert.equal(rel('jon_arryn'), '', 'no kin, no bannerman: no line');
});

test('every house opens a family tree, and the house sheet has its button (checklist 23)', () => {
  let n = 0;
  for (const house of ['stark', 'lannister', 'tyrell']) {
    const s = world(house);
    for (const h of Object.values(s.houses)) {
      const pick = (h.lord && s.characters[h.lord]) || Object.values(s.characters).find((c) => c.house === h.id); if (!pick) continue;
      const tree = T.treeOf(s, pick.id, { wider: true }); assert.ok(tree, `${h.id}: a tree`); assert.ok(T.membersOf(tree).includes(pick.id), `${h.id}: the head is in it`);
      assert.doesNotThrow(() => T.treeHtml(tree, { esc, por: (x) => `/p/${x}.png` }), `${h.id}: it draws`); n++;
    }
  }
  assert.ok(n > 300, `${n} houses opened a tree`);
  assert.match(rd('public/js/ui/windows.js'), /<h4>Members\$\{\(lord \|\| members\[0\]\) \? `<button class="btn small" data-tree="\$\{\(lord \|\| members\[0\]\)\.id\}"/);
});

test('the wiring: names are links in the chronicle, the pin window, letters, scenes, receipts and matters; a click on a name opens the person, not the card; a hover card; the relation line', () => {
  const drawer = rd('public/js/ui/drawer.js'); const pins = rd('public/js/ui/pins.js'); const app = rd('public/js/app.js'); const common = rd('public/js/ui/common.js'); const html = rd('public/index.html'); const css = rd('public/css/names.css'); const orders = rd('public/js/ui/orders.js'); const matters = rd('public/js/ui/matters.js');
  assert.match(common, /export const nm = \(text\) => \(app\.state \? linkNames\(text, rosterOf\(app\.state\), esc\) : esc\(text\)\)/);
  for (const w of ['nm(e.headline || e.title)', 'nm(e.summary ?? e.text)', 'nm(e.scene)', 'nm(l)', 'nm(r.text)', 'nm(b.text)', 'link: nm']) assert.ok(drawer.includes(w), `drawer: ${w}`);
  for (const w of ['nm(e.headline || e.title)', 'nm(e.summary ?? e.text)', 'nm(e.scene)']) assert.ok(pins.includes(w), `pins: ${w}`);
  assert.match(drawer, /if \(!ev\.target\.closest\('\.nm'\)\) go\(\)/, 'the card is not opened by a click on a name'); assert.match(drawer, /relationOf\(s, c\.id\)/);
  assert.match(orders, /\(env\.link \|\| env\.esc\)\(l\.text\)/); assert.match(app, /link: nm \}/); assert.match(matters, /link\(m\.gist\)/);
  assert.match(app, /function showNameCard\(n\)/); assert.match(app, /addEventListener\('focusin'/); assert.match(app, /classList\?\.contains\('nm'\)/);
  assert.match(html, /id="name-card" role="tooltip"/); assert.match(html, /css\/names\.css/); assert.match(css, /\.nm:focus-visible/); assert.match(css, /#name-card\.is-on/);
});
