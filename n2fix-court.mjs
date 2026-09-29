import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const root = '/home/user/wc-s1';
process.env.WC_PROVIDER = 'mock'; process.env.WC_SAVES = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-d-'));
const { perform } = await import(`${root}/public/js/engine/actions/registry.js`);
const { createInitialState } = await import(`${root}/public/js/shared/world.js`);
const { withRng, seedState } = await import(`${root}/public/js/engine/rng.js`);
const fresh = (s) => JSON.parse(JSON.stringify(s));
const s0 = createInitialState('agot_298', 'stark', { seed: 5 });
Object.assign(s0.characters.jaime_lannister, { status: 'imprisoned', loc: 'stark' });
const t = fresh(s0); t.facts = [];
const r = withRng(t, () => perform(t, 'judge_prisoner', { house: 'stark', params: { character: 'jaime_lannister', verdict: 'execute' } }));
console.log(r.ok, r.refusal, JSON.stringify(t.facts.filter((f) => f.kind === 'executed')));
let found = 0;
for (let seed = 1; seed <= 400 && !found; seed++) { const u = fresh(createInitialState('agot_298', 'stark', { seed: 5 })); u.meta.rngState = seedState(seed); u.facts = []; const r2 = withRng(u, () => perform(u, 'hold_tourney', { house: 'stark', params: {} })); const d = u.facts.find((f) => f.kind === 'death'); if (d) { found = seed; console.log(seed, r2.ok, JSON.stringify(d.data), d.text); } }
console.log('found', found);
fs.rmSync(process.env.WC_SAVES, { recursive: true, force: true });
