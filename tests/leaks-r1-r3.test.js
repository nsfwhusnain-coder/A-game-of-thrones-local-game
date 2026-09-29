// The realm ledger's leaks (docs/gdd/19-realm-ledger.md §1.3–1.4, §3.1, §5; 03 §14 invariants 9–10; WP R1–R3): an adversarial
// second look, written after the builder's tests, that asks the surfaces those tests do not: what `observe` STORES when
// something hidden has changed (the builder's non-interference test mutates the truth and then only *reads*, so a leak in
// what is written at the turn's close would pass it); the war panel; the ally's coin; the SSE stream, the fact log and the
// parameters of the route over the wire; the own row for every figure; and the order of the world's keys.
//
// Convention: a test whose name starts with "LEAK:" fails on today's code on purpose: it is a hidden truth reaching the
// player (the report names the file and line). Every other test passes today and is here to keep the door shut.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

process.env.WC_PROVIDER = 'mock';
const { sampleRealm } = await import('../public/js/engine/realm/stats.js');
const { realmViewFor } = await import('../public/js/engine/realm/view.js');
const { createInitialState } = await import('../public/js/shared/world.js');
const { standing } = await import('../public/js/shared/standing.js');
const { project } = await import('../public/js/shared/economy.js');
const { dayNumber, addDays } = await import('../public/js/engine/time.js');
const { withRng } = await import('../public/js/engine/rng.js');
const { forces } = await import('../public/js/engine/parties.js');
const { emit } = await import('../public/js/engine/facts/log.js');
const K = await import('../public/js/engine/knowledge.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const world = (house = 'stark', seed = 298) => createInitialState('agot_298', house, { seed });
const clone = (x) => JSON.parse(JSON.stringify(x));
const json = (x) => JSON.stringify(x);
const view = (s, o) => realmViewFor(s, 'stark', o);
/** No word travels: the dice of the reports (updateKnowledge's own, not the realm's) always say "nothing heard". */
const SILENT = () => 0.9999999;
/** One turn on, as the engine's clock moves it: the date, the truth series' sample, and what the house sees and hears. */
const tick = (s, r) => { s.meta.turn += 1; s.meta.date = addDays(s.meta.date, 7); sampleRealm(s); withRng(s, () => K.updateKnowledge(s, 'stark', r)); return s; };
const mature = (turns = 3, r) => { const s = world(); for (let i = 0; i < turns; i++) tick(s, r); return s; };
const keysOf = (x, out = []) => { if (Array.isArray(x)) x.forEach((y) => keysOf(y, out)); else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) { out.push(k); keysOf(v, out); } return out; };

/** Every view the window can ask for, and the details of a few houses (great, minor, sworn, the viewer's own). */
const OPTS = [
  ...['strength', 'economy', 'land'].flatMap((lens) => ['great', 'all', 'mine', 'war'].flatMap((scope) => [false, true].map((realm) => ({ lens, scope, realm })))),
  ...['lannister', 'tyrell', 'frey', 'beesbury', 'stark', 'bolton'].map((house) => ({ house, scope: 'all' })),
];
const same = (a, b, what) => OPTS.forEach((o) => assert.equal(json(view(a, o)), json(view(b, o)), `${what}: view ${json(o)} moved`));

// ── what observe stores: the twin test ───────────────────────────────────────────────────────────────────────────────────

/** Things another house could change with no word reaching Stark. (Hosts' men are not here: a rider's report of an unseen host is the intel system's own, dice and all.) */
const HIDDEN = {
  'coffers, muster, debts, bread, hulls': (t, f) => { for (const h of Object.values(t.houses)) if (!f.has(h.id)) { for (const k of Object.keys(h.figures)) h.figures[k].v = 987654; h.levyCap = 1; h.popBase = 1; } },
  'ledgers and taxes': (t, f) => { for (const h of Object.values(t.houses)) if (!f.has(h.id)) { h.ledger = [{ note: 'HIDDEN' }]; h.policy = { ...(h.policy || {}), tax: 'harsh' }; } },
  'secret loans': (t) => { for (const l of t.economy.loans) l.amount *= 100; t.economy.loans.push({ lender: 'lannister', debtor: 'tyrell', amount: 987654321, rate: 0.3, pays: 'coin' }); },
  'the score of every war': (t) => { for (const w of t.wars) w.score = 4242; },
  'the mood and state of others\' lands (siege, ruin, unrest, blockade, garrison)': (t, f) => { for (const h of Object.values(t.holdings)) if (!f.has(h.owner)) Object.assign(h, { prosperity: 3, unrest: 99, status: 'besieged', devastation: 90, blockade: true, garrison: 99999, fort: 9 }); },
  'hosts and fleets no eye of Stark\'s is on: their hulls, banners, captains': (t, f) => { for (const a of forces(t)) if (!f.has(a.owner) && !K.seesParty(t, 'stark', a)) Object.assign(a, { ships: 77, commander: 'nobody', contingents: [], composition: { x: 1 } }); },
  'other houses\' own knowledge and the minds': (t) => { t.knowledge.lannister = { parties: {}, spies: {}, facts: {}, beliefs: [], realm: { stark: { obs: [{ day: 1, turn: 1, via: 'seen', v: { swords: 999999 } }] } } }; t.minds = { last: { tywin_lannister: 1 }, tywin_lannister: { goals: ['HIDDEN'] } }; },
  'people\'s secrets, tempers and goals': (t, f) => { for (const c of Object.values(t.characters)) if (!f.has(c.house)) Object.assign(c, { secret: 'HIDDEN', stress: 99, paranoia: 99, goals: ['HIDDEN'] }); },
  'the truth series of the others': (t, f) => { for (const r of t.realmStats.samples) for (const h of Object.keys(r.h)) if (!f.has(h)) r.h[h] = r.h[h].map((_, i) => 987654 + i); },
};

test('observe stores nothing of what is hidden: twin worlds, one with a secret changed, keep the same notes and show the same view a turn later', () => {
  const base = mature(3);
  const friends = K.friendsOf(base, 'stark');
  const plain = tick(clone(base), SILENT);
  assert.ok(Object.keys(plain.knowledge.stark.realm).length >= 4, 'the house keeps notes: the check has something to compare');
  for (const [name, hide] of Object.entries(HIDDEN)) {
    const t = clone(base); hide(t, friends);
    assert.notEqual(json(t), json(base), `${name}: the mutation is real`);
    tick(t, SILENT);
    assert.equal(json(t.knowledge.stark.realm), json(plain.knowledge.stark.realm), `${name}: the notes the house keeps moved`);
    same(t, plain, name);
  }
  // all of them at once, two turns on (a note is written over an earlier one, and the series is thinned)
  const all = clone(base); for (const hide of Object.values(HIDDEN)) hide(all, friends);
  tick(all, SILENT); tick(all, SILENT); tick(plain, SILENT);
  assert.equal(json(all.knowledge.stark.realm), json(plain.knowledge.stark.realm), 'every secret at once, two turns on: the notes');
  same(all, plain, 'every secret at once');
});

test('the check has teeth: a host in sight of Stark does move the notes', () => {
  const base = mature(3);
  const a = clone(base), b = clone(base);
  for (const s of [a, b]) s.parties.dornish_van = { id: 'dornish_van', kind: 'host', owner: 'martell', name: 'A Dornish host', at: 'stark', pos: [...s.holdings.stark.pos], men: 5000, state: 'camped', members: [] };
  b.parties.dornish_van.men = 9000;
  assert.ok(K.seesParty(a, 'stark', a.parties.dornish_van), 'the host is at Winterfell\'s gates');
  tick(a, SILENT); tick(b, SILENT);
  assert.notEqual(json(a.knowledge.stark.realm.martell), json(b.knowledge.stark.realm.martell), 'what Stark sees, it notes');
});

// ── the war panel ────────────────────────────────────────────────────────────────────────────────────────────────────────

/** A war between two houses far from Stark, of which Stark has been told (a public declaration, by raven). */
function farWar() {
  const s = mature(3);
  s.wars.push({ id: 'w_far', name: 'The Marcher War', attackers: ['martell'], defenders: ['tyrell'], started: '—', status: 'ongoing', note: 'told in the hall', score: 0 });
  const f = emit(s, 'war_declared', { houses: ['martell', 'tyrell'], place: 'stark', importance: 5, data: { war: 'w_far' }, vis: { scope: 'public' } });
  assert.ok(K.knows(s, 'stark', f), 'Stark has heard of it');
  return s;
}
const warOf = (s) => view(s, { scope: 'all' }).wars.find((w) => w.id === 'w_far');

test('a war Stark has heard of is on the panel with no score; the war\'s score and notes moving change nothing', () => {
  const s = farWar();
  assert.ok(warOf(s), 'the war Stark was told of is listed');
  const t = clone(s); const w = t.wars.find((x) => x.id === 'w_far'); w.score = 4242; w.note = 'HIDDEN NOTE'; w.started = 'HIDDEN';
  same(t, s, 'a known war\'s score and note');
  assert.ok(!keysOf(warOf(s)).some((k) => /score|delta/i.test(k)), 'a war of other houses carries no numeric score (§5: a momentum word only, from R6)');
});

test('LEAK: a house that joined a war without word reaching Stark is not on its side of the panel (sides as known, §5)', () => {
  const s = farWar(); const t = clone(s);
  t.wars.find((x) => x.id === 'w_far').attackers.push('lannister'); // a secret treaty: no war_joined fact, no raven
  assert.deepEqual(warOf(t)?.sides, warOf(s).sides, 'Lannister\'s secret entry into the war is on the panel');
});

test('LEAK: a war that ended, or was renamed, without word reaching Stark is still the war it was (wars as the house heard them)', () => {
  const s = farWar();
  const ended = clone(s); ended.wars.find((x) => x.id === 'w_far').status = 'ended';
  assert.ok(warOf(ended), 'a war made peace of in secret vanishes from the panel the moment it ends');
  const named = clone(s); named.wars.find((x) => x.id === 'w_far').name = 'HIDDEN NAME';
  assert.equal(warOf(named)?.name, 'The Marcher War', 'a war renamed by the engine is renamed on the panel');
});

// ── the sworn and the allied ───────────────────────────────────────────────────────────────────────────────────────────────

test('LEAK: an ally\'s coin is only a band (§4.2): the series of its gold is not the exact truth beside a ≈ cell', () => {
  const s = world(); s.pacts.push({ id: 'p_ally', a: 'stark', b: 'tully', type: 'alliance', status: 'active' });
  for (let i = 0; i < 4; i++) tick(s);
  assert.ok(K.friendsOf(s, 'stark').has('tully') && s.houses.tully.liege !== 'stark', 'Tully is an ally, not a vassal');
  const d = view(s, { house: 'tully', scope: 'all' }).detail;
  assert.equal(d.cells.gold.mark, '≈', 'the cell says a band');
  const truth = standing(s, 'tully').gold;
  const exact = d.series.gold.filter(([, v]) => v === truth).length;
  assert.ok(exact < d.series.gold.length || d.series.gold.length === 0, `${exact} of ${d.series.gold.length} points of the series are the ally's exact treasury (${truth})`);
});

// ── the own row, for every figure ──────────────────────────────────────────────────────────────────────────────────────────

test('the own row is the truth for every figure, live (not only the ones the builder\'s table lists)', () => {
  const s = mature(2);
  // the lord acts in mid-turn: the row must show the world as it is now, not the last sample
  s.houses.stark.figures.levies.v -= 1500; s.houses.stark.figures.treasury.v += 4321; s.houses.stark.figures.debt.v = 777; s.houses.stark.figures.food.v = 7.3; s.houses.stark.figures.ships.v = 6; s.houses.stark.figures.guard.v = 123;
  const c = view(s, { house: 'stark', scope: 'all' }).detail.cells; const f = s.houses.stark.figures;
  const holds = Object.values(s.holdings).filter((h) => h.owner === 'stark'); const people = holds.reduce((n, h) => n + h.population, 0);
  const mean = (k) => Math.round(holds.reduce((n, h) => n + h[k] * h.population, 0) / people);
  const pr = project(s, 'stark'); const st = standing(s, 'stark');
  const truth = { swords: st.swords, levies: f.levies.v, menAtArms: f.menAtArms.v, guard: 123, gold: st.gold, debt: 777, income: Math.round(pr.income), expenses: Math.round(pr.expenses), food: 73, ships: 6, holdings: holds.length, people, prosperity: mean('prosperity'), unrest: mean('unrest'), power: st.score };
  for (const [k, v] of Object.entries(truth)) { assert.equal(c[k]?.v, v, `stark.${k}`); assert.equal(c[k].mark, '', `stark.${k}: exact carries no mark`); }
  assert.equal(Object.keys(truth).length, 15, 'all fifteen figures of §3.1');
});

// ── determinism: the order of the world's keys ─────────────────────────────────────────────────────────────────────────────

test('nothing depends on the order the world lists its houses, holdings, people and wars: reversed, the views and the notes are the same bytes', () => {
  const s = mature(3);
  const rev = (o) => Object.fromEntries(Object.entries(o).reverse());
  const t = clone(s); for (const k of ['houses', 'holdings', 'characters']) t[k] = rev(t[k]);
  t.wars = [...t.wars].reverse(); for (const h of Object.values(t.houses)) if (h.figures) h.figures = rev(h.figures);
  same(t, s, 'reversed keys');
  tick(s, SILENT); tick(t, SILENT);
  const sorted = (r) => json(Object.fromEntries(Object.entries(r).sort(([x], [y]) => (x < y ? -1 : 1))));
  assert.equal(sorted(t.knowledge.stark.realm), sorted(s.knowledge.stark.realm), 'the notes');
  assert.equal(json(t.realmStats.samples.at(-1).h), json(s.realmStats.samples.at(-1).h), 'the sample (houses sampled in sorted order)');
  same(t, s, 'reversed keys, a turn on');
});

// ── over the wire ────────────────────────────────────────────────────────────────────────────────────────────────────────

const saves = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-leaks-r1-r3-'));
let srv, PORT;
const url = (p) => `http://127.0.0.1:${PORT}/api${p}`;
const api = async (p, body) => { const r = await fetch(url(p), body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}); const j = await r.json(); if (!r.ok) throw new Error(j.error || r.status); return j; };
const raw = async (p) => { const r = await fetch(url(p)); return { status: r.status, text: await r.text() }; };
const stateFile = (id) => path.join(saves, id, 'state.json');
const listing = (id) => fs.readdirSync(path.join(saves, id), { recursive: true }).sort().map((f) => { const st = fs.statSync(path.join(saves, id, f)); return st.isFile() ? `${f}:${st.size}:${st.mtimeMs}` : `${f}:dir`; });
async function quiet(id) { let last = ''; let same = 0; for (let i = 0; i < 40 && same < 2; i++) { await new Promise((r) => setTimeout(r, 100)); const now = json(listing(id)); same = now === last ? same + 1 : 0; last = now; } }
/** The whole jump as the browser hears it: [{ event, data }], the stream read to its end. */
async function jump(id, span) {
  const { job } = await api(`/games/${id}/jump`, { span });
  const text = await (await fetch(url(`/games/${id}/jump/${job}/stream`))).text();
  return text.split('\n\n').filter(Boolean).map((b) => { const m = b.match(/^event: (\w+)\ndata: ([\s\S]*)$/); return m ? { event: m[1], data: JSON.parse(m[2]) } : null; }).filter(Boolean);
}
const freePort = () => new Promise((res) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

test.before(async () => {
  PORT = await freePort();
  srv = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), WC_PROVIDER: 'mock', WC_SAVES: saves }, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { try { await api('/version'); return; } catch { await new Promise((r) => setTimeout(r, 100)); } }
  throw new Error('server did not start');
});
test.after(() => { srv?.kill(); fs.rmSync(saves, { recursive: true, force: true }); });

test('the jump stream carries no truth series and no turn row of every house; and a hidden change to it moves not one byte of the stream', async () => {
  const { id } = await api('/games', { scenario: 'agot_298', house: 'stark', seed: 41 });
  const twin = 'leaktwin'; fs.cpSync(path.join(saves, id), path.join(saves, twin), { recursive: true });
  // the twin's other houses' true series is nonsense; the engine never reads it back, the player must never see it
  const disk = JSON.parse(fs.readFileSync(stateFile(twin), 'utf8'));
  const mine = new Set(['stark', ...Object.values(disk.houses).filter((h) => h.liege === 'stark').map((h) => h.id)]);
  for (const s of disk.realmStats.samples) for (const h of Object.keys(s.h)) if (!mine.has(h)) s.h[h] = s.h[h].map((_, i) => 987654321 + i);
  fs.writeFileSync(stateFile(twin), JSON.stringify(disk));
  const a = await jump(id, '14d'), b = await jump(twin, '14d');
  assert.deepEqual(a.map((e) => e.event), b.map((e) => e.event)); assert.ok(a.length >= 2 && a.at(-1).event === 'done', `${a.map((e) => e.event)}`);
  for (const e of a.filter((x) => x.event === 'segment')) assert.ok(!keysOf(e.data).some((k) => k === 'realm' || k === 'realmStats'), 'a week sent as it is told carries no realm');
  const done = a.at(-1).data;
  assert.ok(!('realm' in done.turn), 'the finished turn has no realm row'); assert.ok(!keysOf(done.state).includes('realmStats'), 'nor the state a realmStats');
  assert.ok(done.state.history.every((t) => !('realm' in t)), 'nor the history'); assert.deepEqual(Object.keys(done.state.knowledge), ['stark'], 'only Stark\'s own knowledge');
  const norm = (evs) => evs.map((e) => { const d = clone(e.data); if (e.event === 'done') delete d.turn.ms; return json({ event: e.event, data: d }); }); // the turn's clock timings are the machine's
  const na = norm(a), nb = norm(b);
  na.forEach((x, i) => assert.equal(nb[i], x, `event ${i} (${a[i].event}) moved with a hidden truth series`));
  const after = await raw(`/games/${twin}/realm?scope=all`), before = await raw(`/games/${id}/realm?scope=all`);
  assert.equal(after.text, before.text, 'and the realm view after the jump');
  await quiet(id); await quiet(twin);
});

test('the fact log: a secret fact that carries a house\'s true coffers is not served, not shown in the realm — until a spy has learned it, and then only as a ~ figure', async () => {
  const { id } = await api('/games', { scenario: 'agot_298', house: 'stark', seed: 43 });
  await api(`/games/${id}/advance`, { span: '7d', orders: [] }); await quiet(id);
  const st = JSON.parse(fs.readFileSync(stateFile(id), 'utf8')); const today = dayNumber(st.meta.date);
  const MARK = 424242424;
  const fact = { id: 'f9999.1', turn: st.meta.turn, day: today, kind: 'scheme_discovered', actors: [], houses: ['lannister'], place: 'lannister', vis: { scope: 'secret' }, importance: 4, text: 'A spy has counted the Rock\'s coffers.', data: { realm: { house: 'lannister', field: 'gold', value: MARK } } };
  fs.appendFileSync(path.join(saves, id, 'facts.jsonl'), json(fact) + '\n');
  const asks = ['/facts', '/facts?house=lannister', '/facts?kind=scheme_discovered', `/facts?from=${st.meta.turn}`, `/facts?to=${st.meta.turn}&limit=5000`];
  for (const q of asks) { const r = await raw(`/games/${id}${q}`); assert.equal(r.status, 200); assert.ok(!r.text.includes(String(MARK)) && !r.text.includes('f9999.1'), `GET ${q} served a fact Stark has not heard`); }
  const realmAsks = ['strength', 'economy', 'land'].flatMap((lens) => ['great', 'all'].map((scope) => `/games/${id}/realm?lens=${lens}&scope=${scope}&house=lannister&realm=1`));
  for (const q of realmAsks) assert.ok(!(await raw(q)).text.includes('4242424'), `${q} shows the secret figure`);
  const rows = (await api(`/games/${id}/realm?lens=economy&scope=all`)).rows;
  assert.ok('word' in rows.find((r) => r.house === 'lannister').cells.gold, 'Lannister\'s coin is a word');
  // a spy brings the figure home: the fact is learned (what `learn()` stores), and a turn goes by
  st.knowledge.stark.facts['f9999.1'] = { day: today, via: 'spy', confidence: 1, happened: today, scope: 'secret', figure: fact.data.realm };
  fs.writeFileSync(stateFile(id), JSON.stringify(st));
  assert.ok((await raw(`/games/${id}/facts?kind=scheme_discovered`)).text.includes('f9999.1'), 'once learned, the fact is served (the control: the filter opens for what Stark knows)');
  await api(`/games/${id}/advance`, { span: '7d', orders: [] }); await quiet(id);
  const gold = (await api(`/games/${id}/realm?lens=economy&scope=all`)).rows.find((r) => r.house === 'lannister').cells.gold;
  assert.deepEqual([gold.mark, gold.via], ['~', 'learned']); assert.ok(Math.abs(gold.v - MARK) <= 0.005 * MARK, `~${gold.v}`);
});

test('no parameter borrows another house\'s eyes: every lens, row set, toggle and window, with viewer= as= player= house=<own> added, answers byte for byte as without', async () => {
  const { id } = await api('/games', { scenario: 'agot_298', house: 'stark', seed: 44 });
  let n = 0;
  for (const lens of ['strength', 'economy', 'land', 'bogus']) for (const scope of ['great', 'all', 'mine', 'war', 'bogus']) for (const realm of [0, 1]) {
    const base = `lens=${lens}&scope=${scope}&realm=${realm}&window=${realm ? 12 : 'x'}`;
    const plain = await raw(`/games/${id}/realm?${base}`);
    const sly = await raw(`/games/${id}/realm?${base}&viewer=lannister&as=lannister&player=lannister&perspective=lannister&you=lannister`);
    assert.equal(plain.status, 200); assert.equal(sly.text, plain.text, base); assert.equal(JSON.parse(plain.text).you, 'stark'); n++;
  }
  assert.equal(n, 40);
  // a house the viewer has never met, one that is not in the world, and a name that is not a house: the same three words, no echo
  const all = await api(`/games/${id}/realm?scope=all`); const listed = new Set(all.rows.map((r) => r.house));
  const world = await api(`/games/${id}`); const never = Object.keys(world.houses).filter((h) => !listed.has(h));
  assert.ok(never.length >= 3, `${never.length} houses Stark has never met`);
  const nothing = (await raw(`/games/${id}/realm?house=no_such_house`)).text;
  for (const h of [...never, 'constructor', '__proto__', 'hasOwnProperty', 'STARK', ' stark', 'stark%20']) {
    const r = await raw(`/games/${id}/realm?house=${encodeURIComponent(h)}`);
    assert.equal(r.text, nothing, `house=${h} answers differently from a house that does not exist`);
  }
});

test('the saves listing and the progress of a jump say nothing of any house\'s figures', async () => {
  const { id } = await api('/games', { scenario: 'agot_298', house: 'stark', seed: 45 });
  const list = await api('/saves'); const mine = list.find((s) => s.id === id);
  assert.deepEqual(Object.keys(mine).sort(), ['date', 'id', 'player', 'playerName', 'scenario', 'turn', 'updated']);
  assert.ok(!keysOf(await api(`/games/${id}/progress`)).some((k) => /realm/i.test(k)));
});
