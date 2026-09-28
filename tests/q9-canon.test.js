// Q9 (docs/gdd/01-vision.md §7): a house far from the war plays 24 moons under Canon gravity with no orders — at least
// 90 % of the canon beats that come due fire in their windows, in the books' order, and the world stays whole. The
// nightly run plays three houses (scripts/canon.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.WC_SAVES = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-q9-'));
const { canonPlaytest } = await import('../scripts/canon.js');

test('Q9: 24 moons of Canon as House Hightower — the books\' beats fire, in order', { timeout: 20 * 60 * 1000 }, async () => {
  const r = await canonPlaytest('hightower', { moons: 24, seed: 7 });
  assert.ok(r.due >= 55, `most of the canon comes due in 24 moons (${r.due})`);
  assert.ok(r.rate >= 0.9, `${r.fired}/${r.due} fired; lapsed: ${r.lapsed.join(', ')}; bent: ${r.bent.join(', ')}`);
  assert.deepEqual(r.disorder, [], 'no beat out of the books\' order');
  assert.deepEqual(r.broken, [], 'the invariants hold every moon');
});
