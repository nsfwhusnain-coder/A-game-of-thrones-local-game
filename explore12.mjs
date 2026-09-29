import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
process.env.WC_PROVIDER = 'mock';
process.env.WC_SAVES = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-audit-'));
const R = '/home/user/wc-s2/public/js/';
const game = await import('/home/user/wc-s2/server/game.js');
const { sampleRealm } = await import(R + 'engine/realm/stats.js');
const { createInitialState } = await import(R + 'shared/world.js');
const { addDays } = await import(R + 'engine/time.js');
const { withRng } = await import(R + 'engine/rng.js');
const K = await import(R + 'engine/knowledge.js');
const s = createInitialState('agot_298', 'stark', { seed: 298 });
for (let i = 0; i < 40; i++) { s.meta.turn++; s.meta.date = addDays(s.meta.date, 7); sampleRealm(s); withRng(s, () => K.updateKnowledge(s, 'stark')); }
fs.mkdirSync(path.join(process.env.WC_SAVES, 'g'), { recursive: true });
fs.writeFileSync(path.join(process.env.WC_SAVES, 'g', 'state.json'), JSON.stringify(s));
console.log('state.json KB', (fs.statSync(path.join(process.env.WC_SAVES, 'g', 'state.json')).size / 1024) | 0);
for (const o of [{ scope: 'all', realm: true }, { scope: 'all', lens: 'economy' }, {}]) {
  const ms = []; for (let i = 0; i < 12; i++) { const a = performance.now(); game.realmView('g', o); ms.push(performance.now() - a); }
  ms.sort((a, b) => a - b); console.log(JSON.stringify(o), 'route (load+migrate+view) median', ms[6].toFixed(1), 'ms, max', ms.at(-1).toFixed(1));
}
fs.rmSync(process.env.WC_SAVES, { recursive: true, force: true });
