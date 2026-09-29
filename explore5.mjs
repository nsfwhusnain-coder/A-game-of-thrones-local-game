process.env.WC_PROVIDER = 'mock';
const R = '/home/user/wc-s2/public/js/';
const { sampleRealm } = await import(R + 'engine/realm/stats.js');
const { realmViewFor } = await import(R + 'engine/realm/view.js');
const { createInitialState } = await import(R + 'shared/world.js');
const { addDays } = await import(R + 'engine/time.js');
const { withRng } = await import(R + 'engine/rng.js');
const { emit, flush } = await import(R + 'engine/facts/log.js');
const K = await import(R + 'engine/knowledge.js');
const clone = (x) => JSON.parse(JSON.stringify(x));
const json = JSON.stringify;
const tick = (s, days = 7) => { s.meta.turn += 1; s.meta.date = addDays(s.meta.date, days); sampleRealm(s); withRng(s, () => K.updateKnowledge(s, 'stark')); return s; };
const s = createInitialState('agot_298', 'stark', { seed: 298 });
for (let i = 0; i < 3; i++) tick(s);
// a far war that Stark has heard of: fact war_declared with data.war, public
const w = { id: 'w_far', name: 'The Marcher War', attackers: ['martell'], defenders: ['tyrell'], started: '—', status: 'ongoing', note: '', score: 0 };
s.wars.push(w);
const f = emit(s, 'war_declared', { houses: ['martell', 'tyrell'], place: 'stark', importance: 5, data: { war: 'w_far' }, vis: { scope: 'public' } });
console.log('fact known to stark', K.knows(s, 'stark', f));
const opt = { scope: 'all' };
const v0 = realmViewFor(s, 'stark', opt);
console.log('wars', JSON.stringify(v0.wars));
// secret joiner
const t = clone(s); t.wars.find(x => x.id === 'w_far').attackers.push('lannister');
const t2 = clone(s); t2.wars.find(x => x.id === 'w_far').score = 4242;
const t3 = clone(s); t3.wars.find(x => x.id === 'w_far').status = 'ended';
const t4 = clone(s); t4.wars.find(x => x.id === 'w_far').note = 'SECRET NOTE'; t4.wars.find(x => x.id === 'w_far').name = 'SECRETNAME';
for (const [n, x] of [['secret joiner', t], ['score', t2], ['ended secretly', t3], ['note/name', t4]]) {
  const v = realmViewFor(x, 'stark', opt);
  console.log(n, 'changes wars?', json(v.wars) !== json(v0.wars), json(v.wars).slice(0, 200));
}
// lord swap
const l1 = clone(s); l1.houses.lannister.lord = 'jaime_lannister';
console.log('lord swap changes view?', json(realmViewFor(l1,'stark',opt)) !== json(v0), 'row lord', realmViewFor(l1,'stark',opt).rows.find(r=>r.house==='lannister').lord, 'was', v0.rows.find(r=>r.house==='lannister').lord);
// unknown-house probing oracles: rank-based
for (const id of ['stark','lannister','frey','nonexistent','beesbury']) {
  const v = realmViewFor(s, 'stark', { house: id });
  console.log('detail', id, json(v.detail).slice(0, 120));
}
// hosts seen through spies?
console.log('done');
