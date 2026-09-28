// The canon playtest (docs/gdd/01-vision.md §7 Q9; docs/gdd/15-qa-tooling.md): houses far from the war play 24 moons
// under Canon gravity with no orders, on the mock provider, and the beats of the books are counted — how many fired in
// their windows, in the books' order, which lapsed or bent, and whether the world stayed whole (the invariants of 03 §14
// after every moon). Pass: at least 90 % of the beats that came due fired, and none out of order.
//   node scripts/canon.js [--houses hightower,redwyne,dayne] [--moons 24] [--seed N] [--report file.md]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]] : a), []));
process.env.WC_PROVIDER = 'mock';
process.env.WC_SAVES = process.env.WC_SAVES || fs.mkdtempSync(path.join(os.tmpdir(), 'wc-canon-'));

/** One house's canon playtest: { house, seed, due, fired, bent, lapsed, rate, disorder, broken, log }. */
export async function canonPlaytest(house, { moons = 24, seed = 7 } = {}) {
  const game = await import('../server/game.js');
  const { validate } = await import('../public/js/engine/state/validate.js');
  const { THREADS, BOOK_ORDER } = await import('../public/data/beats.js');
  const { beatsOf } = await import('../public/js/engine/world/beats.js');
  const { dayNumber } = await import('../public/js/engine/time.js');
  const { id } = game.newGame('agot_298', house, { seed, canonGravity: 'canon' });
  const broken = [];
  for (let m = 0; m < moons; m++) {
    await game.advance(id, { span: '30d' });
    const problems = validate(game.loadState(id)); if (problems.length) broken.push(...problems.map((p) => `moon ${m + 1}: ${p}`));
  }
  const s = game.loadState(id); const today = dayNumber(s.meta.date);
  const log = s.plots.log || []; const how = Object.fromEntries(log.map((l) => [`${l.thread}.${l.stage}`, l.how || 'fired']));
  const beats = beatsOf(THREADS);
  // a beat is due once its window has closed, or once it has happened
  const due = beats.filter((b) => how[b.id] || b.window.to < today);
  const fired = due.filter((b) => how[b.id] === 'fired');
  const at = s.plots.fired || {};
  const disorder = BOOK_ORDER.filter(([a, b]) => at[a] != null && at[b] != null && at[a] > at[b]).map(([a, b]) => `${a} after ${b}`);
  return { house, seed, due: due.length, fired: fired.length, bent: due.filter((b) => how[b.id] === 'alternate').map((b) => b.id), lapsed: due.filter((b) => !how[b.id] || how[b.id] === 'lapsed').map((b) => b.id), rate: fired.length / Math.max(1, due.length), disorder, broken };
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('canon.js')) {
  const houses = String(args.houses || 'hightower,redwyne,dayne').split(',');
  const moons = Number(args.moons || 24); const seed = args.seed != null && args.seed !== true ? Number(args.seed) : 7;
  const lines = [`# Canon playtest (Q9) — ${houses.length} houses × ${moons} moons, Canon gravity, mock provider`, ''];
  let ok = true;
  for (const house of houses) {
    const r = await canonPlaytest(house, { moons, seed });
    const pass = r.rate >= 0.9 && !r.disorder.length;
    ok = ok && pass;
    lines.push(`- **${house}** (seed ${seed}): ${r.fired}/${r.due} beats fired (${Math.round(r.rate * 100)} %) — ${pass ? 'pass' : 'FAIL'}`);
    if (r.bent.length) lines.push(`  - bent (alternates): ${r.bent.join(', ')}`);
    if (r.lapsed.length) lines.push(`  - lapsed: ${r.lapsed.join(', ')}`);
    if (r.disorder.length) lines.push(`  - out of the books' order: ${r.disorder.join('; ')}`);
    if (r.broken.length) lines.push(`  - invariants broken: ${r.broken.length} (${r.broken.slice(0, 3).join('; ')})`);
    console.log(lines.slice(-1 - [r.bent, r.lapsed, r.disorder, r.broken].filter((x) => x.length).length).join('\n'));
  }
  lines.push('', ok ? 'Q9 passes.' : 'Q9 FAILS.');
  if (args.report) fs.writeFileSync(args.report, lines.join('\n') + '\n');
  console.log(ok ? 'Q9 passes.' : 'Q9 FAILS.');
  process.exit(ok ? 0 : 1);
}
