// A face over a life (docs/gdd/12-ui-ux.md §15.1 items 2–6; WP F7, second part). What must hold:
//   • a child takes after their parents — the hair, the eyes, the skin, the features that run in families and the proportions of the face — the same way every time; the people the books
//     describe keep their looks, and a person with no known parents looks exactly as before;
//   • the six ages of a face; a youth is not built like a grown man, and a boy has no beard;
//   • the marks of the story (a scar from a wound that healed) and how they are toward you (brow, mouth, wide eyes) change the face and nothing else;
//   • the screens hand the painter the parents, the marks and the mood.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const P = await import('../public/js/ui/portrait.js');
const K = await import('../public/js/ui/looks.js');
const { createInitialState, generateKin } = await import('../public/js/shared/world.js');
const { HOUSES } = await import('../public/data/houses.js');
const { PARENTS } = await import('../public/data/families.js');
const { LOOKS } = await import('../public/data/looks.js');

const rd = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');
const H = Object.fromEntries(HOUSES.map((h) => [h.id, h]));
const person = (id, o = {}) => ({ id, name: id, house: 'stark', sex: 'm', age: 30, alive: true, roles: [], traits: '', status: 'free', ...o });
const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
// the same generator as the painter's, so the test can say what the faces' proportions were before the genes
const hash = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const rngFrom = (seed) => { let s = seed || 1; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); };

const dad = person('eddard_stark'); const mum = person('catelyn_stark', { sex: 'f', house: 'tully' });
const TABLE = { eddard_stark: dad, catelyn_stark: mum };
const kinOf = (map, table = TABLE) => ({ parentsOf: (c) => (map[c.id] || []).map((x) => (x && table[x]) || null), houseOf: (c) => H[c.house] || null });
const child = (i, o = {}) => person(`imagined_${i}`, { age: 16, sex: i % 2 ? 'f' : 'm', ...o });
const family = (n, parents = ['eddard_stark', 'catelyn_stark']) => { const kids = Array.from({ length: n }, (_, i) => child(i)); const map = {}; for (const k of kids) map[k.id] = parents; return { kids, kin: kinOf({ eddard_stark: [], catelyn_stark: [], ...map }) }; };
const looks = (c, opts = {}) => P.lookFor(c, H[c.house], opts);

test('the six ages of a face', () => {
  assert.deepEqual([0, 5, 6, 12, 13, 17, 18, 49, 50, 69, 70, 95].map(P.ageBand), ['small', 'small', 'child', 'child', 'youth', 'youth', 'adult', 'adult', 'elder', 'elder', 'aged', 'aged']);
  assert.equal(P.ageBand(undefined), 'adult'); assert.equal(looks(person('x', { age: 15 })).band, 'youth');
});

test('the genes of a face: thirteen, from the person\'s own seed, and exactly the proportions the painter used before genes', () => {
  assert.equal(P.GENES, 13);
  for (const id of ['eddard_stark', 'nobody_in_particular', 'a']) {
    const g = P.genesOf(id); assert.equal(g.length, 13); assert.ok(g.every((x) => x >= -1 && x <= 1)); assert.deepEqual(g, P.genesOf(id));
    const vr = rngFrom((hash(id) ^ 0x9e3779b9) >>> 0); assert.deepEqual(g, g.map(() => (vr() - 0.5) * 2), 'the old sequence, draw by draw');
  }
  assert.notDeepEqual(P.genesOf('a'), P.genesOf('b'));
});

test('no known parents, no change: a person looks as they did, with or without a family to ask', () => {
  for (const id of ['eddard_stark', 'robb_stark', 'tywin_lannister', 'some_steward']) {
    const c = person(id, { house: id === 'tywin_lannister' ? 'lannister' : 'stark' });
    const a = looks(c), b = looks(c, { kin: kinOf({}) }), z = looks(c, { kin: kinOf({ [id]: [null, null] }) });
    assert.deepEqual(a.genes, P.genesOf(id)); assert.equal(JSON.stringify(a.feat), JSON.stringify(b.feat)); assert.equal(a.hair, b.hair); assert.equal(a.eyes, z.eyes); assert.equal(a.hair, z.hair);
  }
});

test('a child takes after their parents: their eyes, their hair, their skin, the features that run in families — always the same, and never a change to what the books fix', () => {
  const { kids, kin } = family(80); const F = looks(dad), M = looks(mum);
  let oneHair = 0, mixHair = 0, bothEyes = new Set();
  for (const k of kids) {
    const L = looks(k, { kin }); assert.equal(JSON.stringify([L.hair0, L.eyes, L.genes]), JSON.stringify((({ hair0, eyes, genes }) => [hair0, eyes, genes])(looks(k, { kin }))), 'the same every time');
    assert.ok([F.eyes, M.eyes].includes(L.eyes), `${k.id}: their eyes are one parent's`); bothEyes.add(L.eyes);
    if ([F.hair0, M.hair0].includes(L.hair0)) oneHair++; else { mixHair++; const lo = Math.min(lum(F.hair0), lum(M.hair0)), hi = Math.max(lum(F.hair0), lum(M.hair0)); assert.ok(lum(L.hair0) >= lo - 0.01 && lum(L.hair0) <= hi + 0.01, `${k.id}: a mixed hair is between theirs`); }
    const lo = Math.min(lum(F.skin0), lum(M.skin0)), hi = Math.max(lum(F.skin0), lum(M.skin0)); assert.ok(lum(L.skin0) >= lo - 0.02 && lum(L.skin0) <= hi + 0.02, `${k.id}: skin between theirs`);
    for (let i = 0; i < 13; i++) { const a = F.genes[i], b = M.genes[i]; const best = Math.min(Math.abs(L.genes[i] - a), Math.abs(L.genes[i] - b), Math.abs(L.genes[i] - (a + b) / 2)); assert.ok(best <= 0.44 + 1e-9, `${k.id}: gene ${i} is theirs`); }
  }
  assert.ok(oneHair >= 40 && mixHair >= 3, `${oneHair} children with one parent's hair, ${mixHair} with a mix`); assert.ok(bothEyes.size === 2 || new Set([F.eyes, M.eyes]).size === 1, 'the eyes of both parents turn up among the children');
  // and in numbers: the children's faces are nearer their parents' than strangers'
  const dist = (a, b) => a.reduce((n, g, i) => n + Math.abs(g - b[i]), 0) / a.length;
  const near = (k, kn) => { const g = looks(k, kn ? { kin } : {}).genes; return Math.min(dist(g, F.genes), dist(g, M.genes)); };
  const kinMean = kids.reduce((n, k) => n + near(k, true), 0) / kids.length; const strangerMean = kids.reduce((n, k) => n + near(k, false), 0) / kids.length;
  assert.ok(kinMean < strangerMean * 0.8, `children ${kinMean.toFixed(3)} from their parents, strangers ${strangerMean.toFixed(3)}`);
  // what the books fix is not changed by blood: Robb is auburn, and blue-eyed, however he is asked
  const robb = person('robb_stark', { age: 14 }); assert.ok(LOOKS.robb_stark);
  const kinR = kinOf({ robb_stark: ['eddard_stark', 'catelyn_stark'] }); const byId = { eddard_stark: dad, catelyn_stark: mum }; const kinRobb = { parentsOf: (c) => (PARENTS[c.id] || []).map((x) => byId[x] || null), houseOf: kinR.houseOf };
  assert.equal(looks(robb, { kin: kinRobb }).hair, looks(robb).hair); assert.equal(looks(robb, { kin: kinRobb }).eyes, looks(robb).eyes); assert.deepEqual(looks(robb, { kin: kinRobb }).genes.length, 13);
});

test('features that run in families: both parents have the nose, most children do; neither, none; one, some', () => {
  const nosed = (id, o = {}) => person(id, { look: { feat: ['hawk_nose'] }, ...o });
  const cases = [['both', [nosed('p1'), nosed('p2', { sex: 'f' })], (n) => n >= 120], ['one', [nosed('p1'), person('p2', { sex: 'f' })], (n) => n >= 55 && n <= 145], ['neither', [person('p1'), person('p2', { sex: 'f' })], (n) => n === 0]];
  for (const [name, [a, b], ok] of cases) {
    const map = {}; const kids = Array.from({ length: 200 }, (_, i) => child(i)); for (const k of kids) map[k.id] = [a.id, b.id];
    const byId = { [a.id]: a, [b.id]: b }; const kin = { parentsOf: (c) => (map[c.id] || []).map((x) => byId[x] || null), houseOf: () => H.stark };
    const n = kids.filter((k) => looks(k, { kin }).feat.has('hawk_nose')).length; assert.ok(ok(n), `${name}: ${n} of 200`);
  }
});

test('one parent known is enough; a grandparent\'s blood comes through the parent; two generations at most are asked', () => {
  const kin1 = kinOf({ imagined_1: ['eddard_stark', null] }); const L = looks(child(1), { kin: kin1 }); assert.ok([looks(dad).eyes].includes(L.eyes)); assert.equal(L.hair0, looks(dad).hair0);
  const gp = person('gp', { look: { hair: 'silver', eyes: 'e_violet' } }); const pa = person('pa'); const ch = child(2);
  const byId = { gp, pa, [ch.id]: ch }; const kin = { parentsOf: (c) => ({ pa: ['gp', null], [ch.id]: ['pa', null] }[c.id] || []).map((x) => byId[x] || null), houseOf: () => H.stark };
  const a = looks(pa, { kin }); assert.equal(a.hair0, looks(gp).hair0, 'silver from the grandmother or grandfather'); assert.equal(looks(ch, { kin }).hair0, a.hair0);
  let asked = 0; const deep = { parentsOf: (c) => { asked++; return [person(`${c.id}_f`), null]; }, houseOf: () => H.stark }; looks(person('x'), { kin: deep }); assert.ok(asked <= 3, `asked ${asked} times: two generations at most`);
});

test('a youth is slight, a boy has no beard, a child is a child; the years grey the hair and leave it, in the parents\' colour, before', () => {
  const builds = new Set(); for (let i = 0; i < 300; i++) for (const age of [13, 15, 17]) builds.add(looks(person(`y${i}`, { age, sex: i % 2 ? 'f' : 'm' })).build);
  assert.deepEqual([...builds].sort(), ['average', 'lean', 'slight'], 'never broad, heavy, fat or huge');
  for (let i = 0; i < 100; i++) { assert.equal(looks(person(`c${i}`, { age: 9 })).build, 'child'); assert.equal(looks(person(`i${i}`, { age: 2 })).build, 'infant'); }
  for (const age of [2, 9, 14, 16]) assert.equal(looks(person('eddard_stark', { age })).beard, 'none', `Eddard at ${age}: the books give him a beard; a boy has none`);
  assert.notEqual(looks(person('eddard_stark', { age: 30 })).beard, 'none');
  assert.ok(!looks(person('eddard_stark', { age: 9 })).feat.has('lined')); assert.ok(looks(person('eddard_stark', { age: 50 })).feat.has('lined'));
  const young = looks(person('plain_lord', { age: 30 })), old = looks(person('plain_lord', { age: 80 })); assert.equal(young.hair0, old.hair0, 'the colour he was born with is kept'); assert.ok(lum(old.hair) > lum(young.hair) + 0.2, 'and the years grey it');
});

test('the marks of the story: a scar from a wound that healed (for some, always the same ones), and what the state names itself', () => {
  const s = createInitialState('agot_298', 'stark', { seed: 1 }); const ids = Object.keys(s.characters).slice(0, 200);
  assert.deepEqual(K.marksOf(s, ids[0]), [], 'no wound, no scar'); assert.deepEqual(K.marksOf(s, 'nobody'), []);
  s.history = [{ turn: 1, events: [{ kind: 'wounded', who: ids }, { kind: 'recovered', who: ids }] }]; s.meta.turn = 2;
  const scarred = ids.filter((id) => K.marksOf(s, id).includes('scar')); assert.ok(scarred.length > 60 && scarred.length < 120, `${scarred.length} of 200 scarred`);
  assert.deepEqual(scarred, ids.filter((id) => K.marksOf(s, id).includes('scar')), 'the same ones every time');
  s.history = [{ turn: 1, events: [{ kind: 'wounded', who: ids }] }]; s.meta.turn = 3; assert.equal(ids.filter((id) => K.marksOf(s, id).includes('scar')).length, 0, 'a wound that has not healed leaves no scar yet');
  s.characters[ids[0]].marks = ['eyepatch']; assert.deepEqual(K.marksOf(s, ids[0]), ['eyepatch']);
  const c = person('x'); assert.ok(looks(c, { marks: ['scar', 'eyepatch'] }).feat.has('scar') && looks(c, { marks: ['eyepatch'] }).feat.has('eyepatch')); assert.ok(!looks(c).feat.has('eyepatch'));
});

test('how they are toward you: the brow, the mouth and the eyes change, and nothing else', () => {
  assert.deepEqual([P.moodOf('warm'), P.moodOf('afraid'), P.moodOf('furious'), P.moodOf('composed'), P.moodOf(''), P.moodOf('nonsense'), P.moodOf('distrustful of you')], [{ expr: 1, afraid: false }, { expr: 0, afraid: true }, { expr: -2, afraid: false }, { expr: 0, afraid: false }, { expr: 0, afraid: false }, { expr: 0, afraid: false }, { expr: -1, afraid: false }]);
  const c = person('catelyn_stark', { sex: 'f', house: 'tully' }); const base = looks(c);
  const strip = (l) => { const { expr, afraid, mood, skin, ...rest } = l; return JSON.stringify({ ...rest, feat: [...l.feat].sort() }); };
  for (const m of ['warm', 'furious', 'afraid', 'distrustful']) assert.equal(strip(looks(c, { mood: m })), strip(base), `${m}: the same face`);
  assert.notEqual(looks(c, { mood: 'furious' }).skin, base.skin, 'a flush'); assert.notEqual(looks(c, { mood: 'afraid' }).skin, base.skin, 'a pallor'); assert.equal(looks(c, { mood: 'warm' }).skin, base.skin);
  assert.ok(looks(c, { mood: 'furious' }).expr < base.expr); assert.ok(looks(c, { mood: 'warm' }).expr > base.expr); assert.equal(looks(c, { mood: 'afraid' }).afraid, true);
  assert.ok(looks(person('grim', { traits: 'grim, cold' }), { mood: 'furious' }).expr === -2, 'a grim man in a fury is no further than furious'); assert.ok(looks(person('merry', { traits: 'jovial' }), { mood: 'warm' }).expr === 2);
});

test('generated kin are the lord\'s and the lord\'s spouse\'s, and so look like both', () => {
  const s = createInitialState('agot_298', 'stark', { seed: 5 }); const lord = s.characters[s.houses.stark.lord]; const mate = s.characters[lord.spouse];
  const kid = generateKin(s, 'stark', { age: 12 }); assert.ok(kid);
  assert.equal(kid.father, lord.id); assert.equal(kid.mother, mate.id, 'the lord\'s wife is the mother');
  const L = P.lookFor(kid, s.houses.stark, { kin: K.kinFor(s) }); assert.ok([P.lookFor(lord, s.houses.stark).eyes, P.lookFor(mate, s.houses.tully).eyes].includes(L.eyes));
  assert.equal(K.kinFor(s), K.kinFor(s), 'the resolver is kept for the game'); assert.deepEqual(K.kinFor(s).parentsOf(kid).map((x) => x.id), [lord.id, mate.id]);
});

test('the wiring: the painter asks for the parents, the marks and the mood; every face goes through por(); an audience shows how they are; the dev page shows it all', () => {
  const common = rd('public/js/ui/common.js'); const drawer = rd('public/js/ui/drawer.js'); const port = rd('public/js/ui/portrait.js'); const dev = rd('public/dev/portraits.html');
  assert.match(common, /export const por = \(c, size = 96, extra = \{\}\) => \(c \? portraitLazy\(c, app\.state\?\.houses\[c\.house\], size, lookOpts\(app\.state, c, extra\)\) : ''\)/);
  assert.match(drawer, /por\(c, 80, \{ mood: moodNow\(s, c\.id\) \}\)/); assert.match(drawer, /por\(sp, 40, \{ mood: m\.mood \|\| '' \}\)/);
  assert.match(port, /\$\{opts\.mood \|\| ''\}\|\$\{\(opts\.marks \|\| \[\]\)\.join\(','\)\}\|\$\{opts\.kin/, 'a different mood, mark or parentage is a different picture in the cache');
  assert.match(port, /portraitURL\(c, house, size = 128, opts = \{\}\)/); assert.match(port, /pending\.set\(ph, \[c, house, size, opts\]\)/);
  for (const m of ['family', 'kids', 'ages', 'moods', 'marks']) assert.ok(dev.includes(`q.get('${m}')`), `the dev page has ${m}`);
});
