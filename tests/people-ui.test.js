// Portraits and family trees, improved in place (docs/gdd/17-ui-declutter.md §4 U9; 12 §15). The rule of the game: *never* remove or degrade a portrait or a tree. So:
//   • every person the old tree showed is still in it, for every person of three houses, and the wider family only adds; the lines of the tree run from a parent to their
//     own child and join only spouses or parents of one child;
//   • no portrait and no tree hook has gone from the UI's sources (counted at the start of U9: tests/fixtures/ui/portraits-before-u9.json);
//   • the People tab opens on your own people (family, household, guests, bannermen), each person once, the ruler nowhere in the list of their own family, and the whole
//     realm is still one search away; how a lord is, in a word and a tone; the faces a story names; the ruler's plate, ring and hover card.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { createInitialState, childrenOf, siblingsOf } = await import('../public/js/shared/world.js');
const P = await import('../public/js/ui/people.js');
const T = await import('../public/js/ui/tree.js');

const rd = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');
const world = (house = 'stark') => createInitialState('agot_298', house, { seed: 298 });
const env = { esc: (t) => String(t).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`), por: (id) => `/p/${id}.png` };

/** The tree as it was drawn before U9: grandparents, parents, the person with spouse and siblings, children, grandchildren. */
function oldTree(s, id) {
  const c = s.characters[id]; const f = c.father && s.characters[c.father], m = c.mother && s.characters[c.mother];
  const gp = [f?.father, f?.mother, m?.father, m?.mother].map((x) => x && s.characters[x]).filter(Boolean);
  const sibs = siblingsOf(s, id); const kids = childrenOf(s, id); const spouse = c.spouse && s.characters[c.spouse];
  const grand = kids.flatMap((k) => childrenOf(s, k.id));
  return new Set([...gp, f, m, c, spouse, ...sibs, ...kids, ...grand].filter(Boolean).map((x) => x.id));
}

test('no one the old tree showed is gone from the new one, for every person of three houses; the wider family only adds', () => {
  const s = world(); let checked = 0, withKin = 0;
  for (const c of Object.values(s.characters).filter((x) => ['stark', 'lannister', 'tyrell', 'baratheon', 'targaryen'].includes(x.house))) {
    const old = oldTree(s, c.id); const tree = T.treeOf(s, c.id); const mem = new Set(T.membersOf(tree));
    for (const id of old) assert.ok(mem.has(id), `${c.id}: ${id} is missing from the tree`);
    const wide = new Set(T.membersOf(T.treeOf(s, c.id, { wider: true })));
    for (const id of mem) assert.ok(wide.has(id), `${c.id}: the wider family lost ${id}`);
    assert.equal(mem.size, T.membersOf(tree).length, `${c.id}: nobody twice`); checked++; if (old.size > 3) withKin++;
  }
  assert.ok(checked > 40 && withKin > 15, `${checked} people, ${withKin} with a family worth a tree`);
});

test('the tree is what the state says: the lines run from a parent to their own child, couples are spouses or parents of one child, the roles are the old ones', () => {
  const s = world();
  const tree = T.treeOf(s, 'eddard_stark', { wider: true }); const mem = new Set(T.membersOf(tree));
  assert.equal(tree.rows.find((r) => r.key === 'self').members[0].self, true, 'the person first among their generation');
  for (const l of tree.links) { const child = s.characters[l.to]; assert.ok(mem.has(l.from) && mem.has(l.to)); assert.ok(child.father === l.from || child.mother === l.from, `${l.from} is a parent of ${l.to}`); }
  for (const [a, b] of tree.couples) { const A = s.characters[a], B = s.characters[b]; const spouses = A.spouse === b || B.spouse === a; const coparents = childrenOf(s, a).some((k) => k.father === b || k.mother === b); assert.ok(spouses || coparents, `${a} and ${b} are a couple`); }
  const roles = new Set(tree.rows.flatMap((r) => r.members.map((x) => x.role)));
  const allowed = ['Self', 'Spouse', 'Sibling', 'Child', 'Father', 'Mother', 'Grandparent', 'Grandchild', 'Uncle', 'Aunt', 'Cousin'];
  for (const r of roles) assert.ok(allowed.includes(r), `the role ${r}`);
  assert.ok(roles.has('Self') && roles.has('Spouse') && roles.has('Child'));
  assert.equal(T.treeOf(s, 'nobody'), null);
  // a lord with a wife and children: they are in it
  assert.ok(mem.has('catelyn_stark') && mem.has('robb_stark'), 'his wife and his heir');
  const html = T.treeHtml(tree, env);
  assert.match(html, /class="tree tree-v2"/); assert.match(html, /data-tree-wider="eddard_stark" checked/); assert.match(html, /data-tid="catelyn_stark"/); assert.match(html, /<svg class="tree-links"/);
  s.characters.catelyn_stark.name = '<img src=x onerror=1> Stark'; assert.ok(!/<img src=x onerror/.test(T.treeHtml(T.treeOf(s, 'eddard_stark'), env)), 'names are escaped');
});

test('a first name under a portrait is the name, not "Ser" or a piece of it', () => {
  const s = world(); const tree = T.treeOf(s, 'joffrey_baratheon', { wider: true });
  const by = Object.fromEntries(tree.rows.flatMap((r) => r.members).map((x) => [x.id, x.first]));
  assert.equal(by.tywin_lannister, 'Tywin'); assert.equal(by.cersei_lannister, 'Cersei'); assert.equal(by.robert_baratheon, 'Robert');
  for (const x of tree.rows.flatMap((r) => r.members)) { assert.ok(!/^(Ser|Lord|Lady)$/.test(x.first), `${x.id}: "${x.first}"`); assert.ok(x.name.includes(x.first), `${x.id}: "${x.first}" is in "${x.name}"`); assert.ok(!/\s/.test(x.first)); }
});

test('no portrait and no tree hook has gone from the UI\'s sources', () => {
  const before = JSON.parse(rd('tests/fixtures/ui/portraits-before-u9.json'));
  for (const [f, n] of Object.entries(before.por)) { const now = (rd(f).match(/\bpor\(/g) || []).length; assert.ok(now >= n, `${f}: ${now} portraits drawn, ${n} before`); }
  for (const [f, n] of Object.entries(before.tree)) { const now = (rd(f).match(/familyTree\(|data-tree=/g) || []).length; assert.ok(now >= n, `${f}: ${now} tree hooks, ${n} before`); }
  const win = rd('public/js/ui/windows.js');
  assert.match(win, /data-tree="\$\{c\.id\}"[^>]*>Family tree</, 'the sheet still has its Family tree button'); assert.match(win, /familyTree\(b\.dataset\.tree\)/);
  assert.match(win, /por\(c, 256\)/, 'the sheet\'s portrait is larger'); assert.match(win, /charRow\(c/, 'the people of a list still have faces');
});

test('how a lord is: a word and a tone, only what the house may see of its own', () => {
  const c = (o) => ({ alive: true, age: 30, status: 'free', traits: '', bio: '', ...o });
  assert.deepEqual(P.conditionOf(null, c({})), { word: 'in good health', tone: 'good' });
  assert.deepEqual(P.conditionOf(null, c({ status: 'wounded', wound: { festers: true } })), { word: 'wounded', tone: 'bad' }, 'a wound is a wound; whether it will fester is not told');
  assert.equal(P.conditionOf(null, c({ status: 'imprisoned at the Eyrie' })).word, 'a prisoner');
  assert.equal(P.conditionOf(null, c({ traits: 'honourable, frail' })).tone, 'warn');
  assert.equal(P.conditionOf(null, c({ age: 71 })).word, 'advanced in years');
  assert.equal(P.conditionOf(null, c({ age: 8 })).word, 'a child');
  assert.equal(P.conditionOf(null, c({ alive: false })).word, 'dead');
  assert.doesNotMatch(JSON.stringify(P.conditionOf(null, c({ status: 'wounded', wound: { festers: true, heals: 12345 } }))), /12345|fester/);
});

test('the People tab opens on your own people: family, household, guests, bannermen — each once, the ruler in none of them', () => {
  for (const house of ['stark', 'lannister', 'tyrell']) {
    const s = world(house); const secs = P.peopleSections(s); const ruler = s.houses[house].lord;
    assert.ok(secs.length >= 2, `${house}: sections`); assert.ok(secs.every((x) => x.rows.length && x.title && x.hint));
    const ids = secs.flatMap((x) => x.rows.map((r) => r.c.id)); assert.equal(new Set(ids).size, ids.length, `${house}: nobody twice`); assert.ok(!ids.includes(ruler), `${house}: the ruler is not in his own list`);
    assert.ok(ids.every((id) => s.characters[id].alive), `${house}: the living only`);
    const fam = secs.find((x) => x.id === 'family'); if (fam) assert.ok(fam.rows.every((r) => ['Spouse', 'Betrothed', 'Father', 'Mother', 'Son', 'Daughter', 'Brother', 'Sister', 'Grandson', 'Granddaughter'].includes(r.role)));
  }
  const s = world('stark'); const fam = P.peopleSections(s).find((x) => x.id === 'family');
  assert.ok(fam.rows.some((r) => r.c.id === 'catelyn_stark' && r.role === 'Spouse'), 'his wife'); assert.ok(fam.rows.some((r) => r.c.id === 'robb_stark' && r.role === 'Son'), 'his heir');
  const men = P.peopleSections(s).find((x) => x.id === 'bannermen'); assert.ok(men && men.rows.length >= 8, 'the lords sworn to the North'); assert.ok(men.rows.every((r) => /^Lord of /.test(r.role)));
  const kin = P.kinOf(s, 'eddard_stark'); assert.equal(kin[0].role, 'Spouse'); assert.equal(new Set(kin.map((k) => k.c.id)).size, kin.length);
});

test('the faces of a story: the people its headline names, in order, never a house, at most two', () => {
  const s = world();
  assert.deepEqual(P.peopleOfCard(s, { who: ['stark', 'eddard_stark', 'robb_stark', 'catelyn_stark'] }), ['eddard_stark', 'robb_stark']);
  assert.deepEqual(P.peopleOfCard(s, { who: ['stark', 'lannister'] }), []); assert.deepEqual(P.peopleOfCard(s, {}), []); assert.deepEqual(P.peopleOfCard(s, { who: ['robb_stark', 'robb_stark'] }), ['robb_stark']);
  const card = P.rulerCard(s); assert.equal(card.name, 'Eddard Stark'); assert.equal(card.condition.tone, 'good'); assert.match(card.title, /Winterfell|North/);
});

test('the wiring: the ruler\'s plate says how they are, the ring follows it, the hover card is there; the chronicle\'s cards carry faces; the People tab shows sections before the search', () => {
  const app = rd('public/js/app.js'); const html = rd('public/index.html'); const css = rd('public/css/hud.css'); const drawer = rd('public/js/ui/drawer.js'); const win = rd('public/js/ui/windows.js');
  assert.match(app, /conditionOf\(s, face\)/); assert.match(app, /dataset\.mood = cond\?\.tone/); assert.match(html, /id="player-card"/);
  assert.match(css, /data-mood='bad'/); assert.match(css, /#hud-player:hover #player-card/); assert.match(css, /\.tree-v2/);
  assert.match(drawer, /peopleOfCard\(s, e, 2\)/); assert.match(drawer, /wc-card__faces/);
  assert.match(win, /peopleSections\(s\)/); assert.match(win, /Who is who/); assert.match(win, /drawTreeLinks\(/); assert.match(win, /data-tree-wider/);
});
