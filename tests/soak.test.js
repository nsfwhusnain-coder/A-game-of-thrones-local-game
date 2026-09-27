// A short soak in every CI run (the long one runs nightly: .github/workflows/nightly.yml): two houses play eight turns
// on the mock provider — banners called, hosts marched and halted, riders sent and recalled — and the invariants of
// docs/gdd/03-architecture.md §14 must hold after every one of them (scripts/soak.js exits 1 on the first breach).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('soak: invariants 1–4 and 8 hold every turn (2 houses × 8 turns, mock provider)', () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'soak.js'), '--turns', '8', '--houses', 'stark,greyjoy', '--quiet'], { cwd: ROOT, encoding: 'utf8', timeout: 240000 });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
});
