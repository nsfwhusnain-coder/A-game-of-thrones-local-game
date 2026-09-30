// The realm dump (docs/gdd/19-realm-ledger.md, WP R7): the truth of every house and what the player's ledger says of it, side by side, so
// the owner can see at a glance that the estimates hold. DEV ONLY: it prints the hidden truth of the game (coffers, musters, everything the
// State of the Realm window is made not to show), so it spoils a game you are playing; nothing of the game imports it.
//
//   node scripts/realm-dump.js --play stark --turns 12 [--seed 7]        # a new game on the mock, played on, then dumped
//   node scripts/realm-dump.js --game <id>                               # a save in the saves folder (WC_SAVES or ./saves)
//         [--lens strength|economy|land|all] [--scope great|all] [--house <id>] [--audit] [--json]
//   node scripts/realm-dump.js --soak --house stark --seed 7 --turns 24  # play and audit every turn, print the report (--json for the tests)
//
// `--audit` holds every figure to its tier's bound (bench/lib/realm-audit.js); `--soak` does that after every moon of a game and also changes
// what the player cannot know each moon and checks that the ledger, the council's brief and the lords' summary do not move by one byte.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]] : a), []));
const own = !args.game; // a game of ours is played in a folder of ours; a save of the owner's is only read
if (own) { process.env.WC_PROVIDER = 'mock'; process.env.WC_SAVES = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-realm-dump-')); }
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const game = await imp('server/game.js');
const audit = await imp('bench/lib/realm-audit.js');
const { realmViewFor } = await imp('public/js/engine/realm/view.js');
const { sampleRealm } = await imp('public/js/engine/realm/stats.js');

/** Play `turns` moons of a new mock game; the id. */
async function play(house, seed, turns, each = async () => {}) {
  const { id } = game.newGame('agot_298', house, { seed });
  for (let t = 1; t <= turns; t++) { await game.advance(id, { span: '30d' }); await game.settled(id); await each(game.loadState(id), t); }
  return id;
}
const mulberry = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const clock = (s) => `turn ${s.meta.turn}, ${s.meta.date.day}/${s.meta.date.month}/${s.meta.date.year}`;

async function soak() {
  const house = typeof args.house === 'string' ? args.house : 'stark'; const seed = Number(args.seed) || 7; const turns = Number(args.turns) || 24;
  const t0 = Date.now(); const total = audit.emptyAudit(); const leaks = []; const hid = {}; let hidTurns = 0; let last = null; const ms = { view: [], sample: [] };
  await play(house, seed, turns, async (s, t) => {
    const viewer = s.meta.player; last = s;
    // what the ledger costs (19 §9: the view in 50 ms, the turn's sample in 60): the sample on a copy, for it writes the world
    let a = performance.now(); realmViewFor(s, viewer, { scope: 'great' }); ms.view.push(performance.now() - a);
    const c = JSON.parse(JSON.stringify(s)); a = performance.now(); sampleRealm(c); ms.sample.push(performance.now() - a);
    audit.mergeAudits(total, audit.auditView(s, viewer));
    // what the viewer cannot know, changed at random (seeded: the same game hides the same things): nothing it reads may move
    const rnd = mulberry(seed * 1000 + t); const mask = Object.fromEntries(audit.HIDINGS.map((n) => [n, rnd() < 0.6])); if (!Object.values(mask).some(Boolean)) mask.coffers = true;
    const { state: hidden, done } = audit.hideTruth(s, viewer, (n) => mask[n]);
    for (const n of done) hid[n] = (hid[n] || 0) + 1; hidTurns += done.length ? 1 : 0;
    if (audit.readings(hidden, viewer) !== audit.readings(s, viewer)) leaks.push({ turn: t, done });
  });
  // the check has teeth: what the viewer can know does move what it reads
  const viewer = last.meta.player; const teeth = {}; const base = audit.readings(last, viewer);
  const mine = JSON.parse(JSON.stringify(last)); mine.houses[viewer].figures.treasury.v += 12345; teeth.own = audit.readings(mine, viewer) !== base;
  const friends = [...(await imp('public/js/engine/knowledge.js')).friendsOf(last, viewer)].filter((h) => h !== viewer);
  if (friends.length) { const w = JSON.parse(JSON.stringify(last)); w.houses[friends[0]].figures.treasury.v = (w.houses[friends[0]].figures.treasury.v || 100) * 10 + 5000; teeth.sworn = audit.readings(w, viewer) !== base; }
  const mean = (x) => x.reduce((p, q) => p + q, 0) / Math.max(1, x.length);
  const cost = { viewMean: mean(ms.view), viewMax: Math.max(...ms.view), sampleMean: mean(ms.sample), sampleMax: Math.max(...ms.sample) };
  const result = { house, seed, turns, ms: Date.now() - t0, cost, cells: total.cells, violations: total.violations.slice(0, 50), violationCount: total.violations.length, kinds: total.kinds, bands: total.bands, thinBands: audit.thinBands(total), leaks, hid, hidTurns, teeth };
  if (args.json) { console.log(JSON.stringify(result)); return; }
  console.log(audit.auditReport(total, { title: `Realm audit — ${house}, seed ${seed}, ${turns} moons` }));
  console.log(`\nWhat the viewer cannot know was changed in ${hidTurns} of ${turns} moons (${Object.entries(hid).map(([k, n]) => `${k} ${n}`).join(', ')}): ${leaks.length ? `THE LEDGER MOVED in turns ${leaks.map((l) => l.turn).join(', ')}` : 'the ledger, the brief and the summary did not move by one byte'}.`);
  console.log(`Cost: the view ${cost.viewMean.toFixed(0)} ms on average (${cost.viewMax.toFixed(0)} at most), the turn's sample ${cost.sampleMean.toFixed(0)} ms (${cost.sampleMax.toFixed(0)}).`);
  console.log(`Teeth: your own coffers move the ledger ${teeth.own ? 'yes' : 'NO'}${'sworn' in teeth ? `; a sworn house's ${teeth.sworn ? 'yes' : 'NO'}` : ''}. ${(result.ms / 1000).toFixed(0)} s.`);
  process.exitCode = total.violations.length || leaks.length || result.thinBands.length || !teeth.own ? 1 : 0;
}

function dump(s) {
  const viewer = s.meta.player; const lenses = !args.lens || args.lens === 'all' ? audit.LENSES : [args.lens]; const scope = args.scope === 'all' ? 'all' : 'great';
  if (args.json) { console.log(JSON.stringify({ turn: s.meta.turn, viewer, lenses: Object.fromEntries(lenses.map((l) => [l, audit.sideBySide(s, viewer, { lens: l, scope, house: typeof args.house === 'string' ? args.house : null })])) })); return; }
  console.log(`THE REALM AS ${viewer.toUpperCase()}'S HOUSE KNOWS IT, AND AS IT IS — ${clock(s)}\n(dev only: this shows the truth the game hides from the player)`);
  for (const lens of lenses) {
    console.log(`\n${lens.toUpperCase()} · ${scope === 'all' ? 'every house' : 'the great houses'}`);
    for (const r of audit.sideBySide(s, viewer, { lens, scope, house: typeof args.house === 'string' ? args.house : null })) {
      console.log(`\n${String(r.rank ?? '').padStart(3)}${r.tie ? '≈' : ' '} ${r.house}${r.lord ? ` · ${r.lord}` : ''}`);
      for (const l of r.lines) console.log(`      ${l.field.padEnd(10)} truth ${l.truth.padStart(9)}   shows ${l.shown.padEnd(16)} ${String(l.via).padEnd(9)} ${l.age == null ? '' : `${l.age} turn${l.age === 1 ? ' ' : 's'}`.padEnd(8)} ${l.error}${l.band ? ` band ${l.band}` : ''}`);
    }
  }
  if (args.audit) console.log(`\n${audit.auditReport(audit.auditView(s, viewer), { title: 'Audit' })}`);
}

if (args.soak) await soak();
else if (args.play) { const id = await play(typeof args.play === 'string' ? args.play : 'stark', Number(args.seed) || 7, Number(args.turns) || 12); dump(game.loadState(id)); }
else if (args.game) dump(game.loadState(String(args.game)));
else { console.log('node scripts/realm-dump.js --play stark --turns 12 | --game <id> | --soak --house stark --seed 7 --turns 24   (see the head of this file)'); process.exitCode = 2; }
if (own) fs.rmSync(process.env.WC_SAVES, { recursive: true, force: true });
