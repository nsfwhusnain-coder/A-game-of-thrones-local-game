// A short soak in every CI run (the long one runs nightly: .github/workflows/nightly.yml): two houses play eight turns
// on the mock provider — banners called, hosts marched and halted, riders sent and recalled — and the invariants of
// docs/gdd/03-architecture.md §14 must hold after every one of them (scripts/soak.js exits 1 on the first breach).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// The seed is the clock's unless WC_SOAK_SEED says otherwise, and it is in the failure message with the command that plays that game again (bug hunt CI1: a run failed once on CI
// and could not be played again, because the game it played came from the clock and nothing printed which).
test('soak: invariants 1–4 and 8 hold every turn (2 houses × 8 turns, mock provider)', () => {
  const seed = Number(process.env.WC_SOAK_SEED) || (Date.now() % 1_000_000);
  const args = ['--turns', '8', '--houses', 'stark,greyjoy', '--seed', String(seed)];
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'soak.js'), ...args, '--quiet'], { cwd: ROOT, encoding: 'utf8', timeout: 240000 });
  assert.equal(r.status, 0, `seed ${seed}; play it again with: node scripts/soak.js ${args.join(' ')}\n${r.stdout}\n${r.stderr}`);
});
