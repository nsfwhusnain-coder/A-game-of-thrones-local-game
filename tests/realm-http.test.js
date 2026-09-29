// The realm route over the wire (docs/gdd/19-realm-ledger.md §7; WP R3): GET /api/games/:id/realm answers with the view
// of the player's own house and no other, changes nothing, and works on a save that has never heard of the ledger.
// The real server on the mock model, as tests/http.test.js runs it; each test is one sentence of the R3 acceptance column.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const PORT = 3413;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const saves = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-realm-http-'));
let srv;
const url = (p) => `http://127.0.0.1:${PORT}/api${p}`;
const api = async (p, body) => {
  const r = await fetch(url(p), body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
  const j = await r.json(); if (!r.ok) throw new Error(j.error || r.status); return j;
};
/** The raw answer: status and the exact text, so "the same body" means the same bytes. */
const raw = async (p) => { const r = await fetch(url(p)); return { status: r.status, text: await r.text() }; };
const stateFile = (id) => path.join(saves, id, 'state.json');
/** Every file of a save with its size, inode and mtime: a rewrite of the same bytes (a no-op save) shows too. */
const listing = (id) => fs.readdirSync(path.join(saves, id), { recursive: true }).sort().map((f) => { const st = fs.statSync(path.join(saves, id, f)); return st.isFile() ? `${f}:${st.size}:${st.ino}:${st.mtimeMs}` : `${f}:dir`; });
/** Wait until the save's directory has stopped changing (a turn's background chronicle work is done). */
async function quiet(id) {
  let last = ''; let same = 0;
  for (let i = 0; i < 40 && same < 2; i++) { await new Promise((r) => setTimeout(r, 100)); const now = JSON.stringify(listing(id)); same = now === last ? same + 1 : 0; last = now; }
}
const KEYS = ['asOf', 'window', 'lens', 'scope', 'realm', 'you', 'rows', 'wars', 'facts', 'focus', 'detail'];

test.before(async () => {
  srv = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), WC_PROVIDER: 'mock', WC_SAVES: saves }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { await api('/version'); return; } catch { await new Promise((r) => setTimeout(r, 100)); } }
  throw new Error('server did not start');
});
test.after(() => { srv?.kill(); fs.rmSync(saves, { recursive: true, force: true }); });

test('200 with the schema above on a new game', async () => {
  const { id, state } = await api('/games', { scenario: 'agot_298', house: 'stark', seed: 5 });
  const r = await raw(`/games/${id}/realm`);
  assert.equal(r.status, 200);
  const v = JSON.parse(r.text);
  for (const k of KEYS) assert.ok(k in v, `key ${k}`);
  assert.equal(v.you, 'stark'); assert.deepEqual([v.lens, v.scope, v.realm], ['strength', 'great', false]);
  assert.equal(v.asOf.turn, 0); assert.equal(typeof v.asOf.date, 'string'); assert.ok(Number.isInteger(v.asOf.day));
  assert.ok(Array.isArray(v.rows) && v.rows.length >= 6 && v.rows.some((x) => x.house === 'stark'));
  assert.ok(Array.isArray(v.wars) && Array.isArray(v.facts) && Array.isArray(v.focus));
  assert.equal(v.detail, null);
  assert.equal(state.meta.turn, 0);
  // the query the window will send
  const q = await api(`/games/${id}/realm?lens=economy&scope=all&realm=1&window=6`);
  assert.deepEqual([q.lens, q.scope, q.realm], ['economy', 'all', true]);
  assert.ok(q.rows.length > v.rows.length, '"all known" lists more than the great houses');
  // the answer is not a state: nothing of the game's own state is in it
  assert.ok(!('meta' in v) && !('parties' in v) && !('houses' in v));
  // an unknown save is the existing 404
  const nope = await raw('/games/no_such_save/realm');
  assert.equal(nope.status, 404);
});

test('house= unknown or never-met → detail.unknown', async () => {
  const { id } = await api('/games', { scenario: 'agot_298', house: 'stark', seed: 6 });
  const known = await api(`/games/${id}/realm?house=lannister`);
  assert.ok(known.detail && known.detail.unknown !== true, 'a great house the viewer knows has its detail');
  assert.equal((await api(`/games/${id}/realm?house=stark`)).detail.unknown !== true, true);
  const hidden = ['no_such_house', 'constructor', '__proto__', '%00'];
  // houses of this game that "all known" does not list are houses the viewer has never met: the API never confirms them
  const all = await api(`/games/${id}/realm?scope=all`); const listed = new Set(all.rows.map((r) => r.house));
  const world = await api(`/games/${id}`);
  for (const h of Object.keys(world.houses)) if (!listed.has(h)) hidden.push(h);
  for (const h of hidden) {
    const d = (await api(`/games/${id}/realm?house=${h}`)).detail;
    assert.equal(d?.unknown, true, `house=${h}`);
    assert.ok(Object.keys(d).every((k) => ['unknown', 'house'].includes(k)), `house=${h}: nothing but "unknown" is said`);
  }
});

test('no viewer parameter honoured (?viewer=lannister is ignored)', async () => {
  const { id } = await api('/games', { scenario: 'agot_298', house: 'stark', seed: 7 });
  const plain = await raw(`/games/${id}/realm`);
  for (const q of ['?viewer=lannister', '?viewer=lannister&house=stark', '?as=lannister', '?player=lannister']) {
    const r = await raw(`/games/${id}/realm${q}`);
    const base = await raw(`/games/${id}/realm${q.includes('house=stark') ? '?house=stark' : ''}`);
    assert.equal(r.status, 200); assert.equal(r.text, base.text, `${q}: the same body as without it`);
  }
  const l = await raw(`/games/${id}/realm?viewer=lannister&lens=economy&scope=all`);
  const s = await raw(`/games/${id}/realm?lens=economy&scope=all`);
  assert.equal(l.text, s.text); assert.equal(JSON.parse(l.text).you, 'stark');
  assert.equal(JSON.parse(plain.text).you, 'stark');
  // and Lannister's own coffers are as hidden as ever: an estimate, never a bare number
  const gold = JSON.parse(l.text).rows.find((r) => r.house === 'lannister').cells.gold;
  assert.ok('word' in gold || ['~', '≈', '≥', '—'].includes(gold.mark), JSON.stringify(gold));
});

test('read-only: the state file is byte-identical before and after', async () => {
  const { id } = await api('/games', { scenario: 'agot_298', house: 'stark', seed: 8 });
  await api(`/games/${id}/advance`, { span: '7d', orders: [] }); await quiet(id);
  const before = fs.readFileSync(stateFile(id)), files = listing(id);
  for (const q of ['', '?lens=land', '?scope=all&realm=1', '?house=lannister', '?house=nobody', '?lens=economy&scope=all&house=tyrell&window=12']) assert.equal((await raw(`/games/${id}/realm${q}`)).status, 200, q);
  assert.ok(before.equals(fs.readFileSync(stateFile(id))), 'state.json is the same bytes');
  assert.deepEqual(listing(id), files, 'and no file was made, grown, removed or even written again');
  assert.equal((await api(`/games/${id}/undo`)).turn, 1, 'the game is where it was');
});

test('works on a save with no realmStats (empty state, "begins now")', async () => {
  const { id } = await api('/games', { scenario: 'agot_298', house: 'stark', seed: 9 });
  const st = JSON.parse(fs.readFileSync(stateFile(id), 'utf8'));
  assert.ok(st.realmStats, 'a new game has one');
  delete st.realmStats; if (st.knowledge?.stark) delete st.knowledge.stark.realm;
  fs.writeFileSync(stateFile(id), JSON.stringify(st));
  const before = fs.readFileSync(stateFile(id));
  const r = await raw(`/games/${id}/realm`);
  assert.equal(r.status, 200); const v = JSON.parse(r.text);
  for (const k of KEYS) assert.ok(k in v, `key ${k}`);
  assert.ok(v.rows.length >= 6 && v.window.samples <= 1, 'an empty series: the ledger begins now');
  assert.match(r.text, /begins/i, 'and it says so: "the chronicle of figures begins on <date>"');
  const own = v.rows.find((x) => x.house === 'stark');
  assert.equal(typeof own.cells.power.v, 'number', 'the viewer\'s own row is there, exact, from the live world');
  assert.ok(before.equals(fs.readFileSync(stateFile(id))), 'and asking did not write the missing series into the save');
  // the same for a genuinely old save (the v2 fixture: armies, no knowledge, no ledger)
  const old = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ROOT, 'tests/fixtures/saves/v2-stark-turn3.json.gz'))));
  fs.mkdirSync(path.join(saves, 'oldsave'), { recursive: true }); fs.writeFileSync(stateFile('oldsave'), JSON.stringify(old));
  const o = await raw('/games/oldsave/realm');
  assert.equal(o.status, 200); assert.equal(JSON.parse(o.text).you, 'stark'); assert.ok(JSON.parse(o.text).rows.length >= 6);
});

test('asking for the realm changes nothing that follows: the same turns, with and without it', async () => {
  const play = async (ask) => {
    const { id } = await api('/games', { scenario: 'agot_298', house: 'stark', seed: 12 });
    const vassals = Object.values((await api(`/games/${id}`)).houses).filter((h) => h.liege === 'stark').map((h) => h.id);
    await api(`/games/${id}/act`, { kind: 'call_banners', vassals, at: 'stark', ownLevies: 2000 });
    await api(`/games/${id}/advance`, { span: '7d', orders: [] });
    if (ask) for (const q of ['', '?scope=all', '?house=lannister&lens=economy', '?realm=1']) await api(`/games/${id}/realm${q}`);
    await api(`/games/${id}/advance`, { span: '7d', orders: [] });
    const s = JSON.parse(fs.readFileSync(stateFile(id), 'utf8'));
    return { dice: s.meta.rngState, turn: s.meta.turn, standing: s.standing, houses: s.houses, realmStats: s.realmStats, realm: s.knowledge.stark.realm, parties: s.parties };
  };
  const a = await play(false), b = await play(true);
  assert.equal(a.turn, 2);
  assert.deepEqual(b.dice, a.dice, 'the save\'s dice have not moved');
  assert.equal(JSON.stringify(b), JSON.stringify(a), 'the world, the series and what the house has observed are the same');
});
