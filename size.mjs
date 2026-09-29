process.env.WC_PROVIDER='mock';
const R='/home/user/wc-s2/public/js/';
const { createInitialState } = await import(R+'shared/world.js');
const { sampleRealm } = await import(R+'engine/realm/stats.js');
const { withRng } = await import(R+'engine/rng.js');
const { addDays } = await import(R+'engine/time.js');
const K = await import(R+'engine/knowledge.js');
const s = createInitialState('agot_298','stark',{seed:298});
const tick = (s, days=7) => { s.meta.turn += 1; s.meta.date = addDays(s.meta.date, days); sampleRealm(s); withRng(s, () => K.updateKnowledge(s, 'stark')); };
const kb = (x) => (JSON.stringify(x).length / 1024).toFixed(0) + ' KB';
for (const n of [1, 16, 40, 100]) {
  while (s.meta.turn < n) tick(s);
  console.log('turn', s.meta.turn, 'samples', s.realmStats.samples.length, 'realmStats', kb(s.realmStats), 'knowledge.realm', kb(s.knowledge.stark.realm), 'whole state', kb(s));
}
let t = performance.now(); for (let i = 0; i < 20; i++) K.updateKnowledge(s, 'stark'); console.log('updateKnowledge ms', ((performance.now() - t) / 20).toFixed(1));
