// The realm soak (docs/gdd/19-realm-ledger.md §11, WP R7): the ledger held against the truth over 24 moons of three games on the mock.
//   • estimate error against the truth stays within each way-of-learning's bound (own exact, sworn ±5 %, seen ±10 %, reported and
//     rumoured ±25 % while the news is fresh), and no figure is given where the ledger says there is none to give;
//   • a band holds the truth for most houses; a stale figure carries its age;
//   • no leaks: each moon what the viewer cannot know is changed at random (seeded) and the ledger, the council's brief and the lords'
//     summary do not move by one byte; and the check has teeth (what the viewer can know moves them).
// The three games are played by `scripts/realm-dump.js --soak` in three processes at once (a game of 24 moons is a minute of the engine's work);
// the audit itself is tested first, on a tampered view, so a green soak means something.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

process.env.WC_PROVIDER = 'mock';
process.env.WC_SAVES = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-realm-soak-'));
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const game = await import('../server/game.js');
const A = await import('../bench/lib/realm-audit.js');
test.after(() => fs.rmSync(process.env.WC_SAVES, { recursive: true, force: true }));

const TURNS = Number(process.env.REALM_SOAK_TURNS) || 24;
const GAMES = [['stark', 7], ['lannister', 11], ['tyrell', 23]];
// start the three games now; they run while the audit's own tests do
const runs = GAMES.map(([house, seed]) => new Promise((resolve, reject) => {
  execFile(process.execPath, [path.join(ROOT, 'scripts', 'realm-dump.js'), '--soak', '--json', '--house', house, '--seed', String(seed), '--turns', String(TURNS)], { cwd: ROOT, maxBuffer: 1 << 26, timeout: 900000 }, (err, stdout, stderr) => {
    const line = String(stdout).trim().split('\n').filter(Boolean).at(-1);
    try { resolve(JSON.parse(line)); } catch { reject(new Error(`the soak of ${house} gave no result: ${err?.message || ''} ${stderr}`.slice(0, 600))); }
  });
}));
runs.forEach((p) => p.catch(() => {})); // (reported by the tests below, not as an unhandled rejection)

// ── The audit can fail ─────────────────────────────────────────────────────────────────────────────────────────────────────

const clone = (x) => JSON.parse(JSON.stringify(x));
async function aWorld() {
  const { id } = game.newGame('agot_298', 'stark', { seed: 7 });
  for (let i = 0; i < 3; i++) { await game.advance(id, { span: '30d' }); await game.settled(id); }
  return game.loadState(id);
}

test('the audit holds a true ledger to its bounds and finds nothing wrong', async () => {
  const s = await aWorld(); const a = A.auditView(s, s.meta.player);
  assert.ok(a.cells > 500, `${a.cells} cells`);
  assert.deepEqual(a.violations.map((v) => `${v.house} ${v.field} [${v.rule}] ${v.text}`), []);
});

test('the audit has teeth: it names an own figure that is off, a sworn one beyond 5 %, a number given for "nothing known", a coffer given by a rumour, a bad band, an "at least" far too high and a bad mark', async () => {
  const s = await aWorld(); const viewer = s.meta.player;
  const { realmViewFor } = await import('../public/js/engine/realm/view.js');
  const K = await import('../public/js/engine/knowledge.js');
  const friend = [...K.friendsOf(s, viewer)].find((h) => h !== viewer);
  const strangers = (v) => v.rows.filter((r) => r.house !== viewer && r.house !== friend);
  const cases = {
    own: (v) => { v.rows.find((r) => r.house === viewer).cells.power.v += 3; },
    sworn: (v) => { const c = v.rows.find((r) => r.house === friend)?.cells.swords; if (c) c.v = Math.round(c.v * 1.3); },
    none: (v) => { const r = strangers(v).find((x) => x.cells.ships?.mark === '—'); r.cells.ships = { v: 12, mark: '—' }; },
    coffer: (v) => { for (const r of strangers(v)) if (r.cells.gold) { r.cells.gold = { v: 5000, mark: '~', via: 'rumour', age: 0 }; break; } },
    band: (v) => { const r = strangers(v).find((x) => x.cells.power?.band); r.cells.power.band = [90, 10]; },
    least: (v) => { const r = strangers(v).find((x) => x.cells.swords?.mark === '≥'); r.cells.swords.v = 10 ** 7; },
    mark: (v) => { const r = strangers(v).find((x) => x.cells.people?.via === 'seen' || x.cells.people?.via === 'reported'); r.cells.people.mark = '—'; r.cells.people.v = 1; r.cells.people.via = 'self'; },
  };
  for (const [name, fn] of Object.entries(cases)) {
    const a = A.auditView(s, viewer, { lenses: ['strength', 'economy'], viewOf: (st, vw, o) => { const v = clone(realmViewFor(st, vw, o)); if (o.lens === 'strength' || name === 'coffer') fn(v); return v; } });
    assert.ok(a.violations.length >= 1, `${name}: the audit did not see it`);
  }
  // a stale figure is held to its age, not to a bound: the same wrong number, three moons old, is not a fault in itself
  const old = A.auditView(s, viewer, { lenses: ['strength'], viewOf: (st, vw, o) => { const v = clone(realmViewFor(st, vw, o)); const r = strangers(v).find((x) => x.cells.people?.mark === '~'); r.cells.people.v *= 3; r.cells.people.age = 5; return v; } });
  assert.deepEqual(old.violations.filter((v) => v.rule === 'seen' || v.rule === 'reported' || v.rule === 'rumour'), []);
});

test('hideTruth changes what the viewer cannot know and leaves what it can', async () => {
  const s = await aWorld(); const viewer = s.meta.player; const K = await import('../public/js/engine/knowledge.js');
  const { state: t, done } = A.hideTruth(s, viewer);
  assert.ok(done.includes('coffers') && done.includes('series'), done.join());
  assert.notEqual(JSON.stringify(t.houses), JSON.stringify(s.houses));
  assert.deepEqual(t.houses[viewer], s.houses[viewer], 'the viewer\'s own house is untouched');
  for (const f of K.friendsOf(s, viewer)) assert.deepEqual(t.houses[f], s.houses[f], `${f}, sworn to it, is untouched`);
  assert.equal(A.readings(t, viewer), A.readings(s, viewer), 'and the readings do not move');
  assert.equal(A.hideTruth(s, viewer, () => false).done.length, 0, 'a pick of none changes nothing');
});

// ── The soak ───────────────────────────────────────────────────────────────────────────────────────────────────────────────

for (const [i, [house, seed]] of GAMES.entries()) {
  test(`${TURNS} moons of ${house} (seed ${seed}): every figure within its tier's bound, no number where there is none, bands that hold, and no leak`, { timeout: 900000 }, async () => {
    const r = await runs[i];
    assert.equal(r.turns, TURNS);
    assert.ok(r.cells > 20000, `${r.cells} cells held against the truth`);
    // the ways of learning that were met: the soak means little if only one of them was
    const ways = new Set(Object.keys(r.kinds).map((k) => k.replace(/[~≈≥=].*$/, '')));
    for (const w of ['sworn', 'reported', 'rumour']) assert.ok(ways.has(w), `no ${w} figure in ${TURNS} moons (met: ${[...ways]})`);
    assert.deepEqual(r.violations.map((v) => `${v.house} ${v.field} [${v.rule}] ${v.text}`), [], `${r.violationCount} figures outside their bound`);
    assert.deepEqual(r.thinBands, [], 'a band that holds the truth too seldom');
    assert.deepEqual(r.leaks, [], 'the ledger moved when what the viewer cannot know was changed');
    assert.ok(r.hidTurns >= TURNS * 0.9, `what the viewer cannot know was changed in only ${r.hidTurns} of ${TURNS} moons`);
    assert.ok((r.hid.coffers || 0) >= TURNS * 0.3 && (r.hid.hosts || 0) >= 1, JSON.stringify(r.hid));
    // what it costs (19 §9 budgets the view at 50 ms and the sample at 60): a loose guard, three times over, for a loaded box
    assert.ok(r.cost.viewMean < 150 && r.cost.sampleMean < 180, JSON.stringify(r.cost));
    assert.equal(r.teeth.own, true, 'the viewer\'s own coffers must move the ledger');
    if ('sworn' in r.teeth) assert.equal(r.teeth.sworn, true, 'a sworn house\'s coffers must move it');
  });
}
