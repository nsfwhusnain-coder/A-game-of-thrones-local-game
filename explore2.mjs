process.env.WC_PROVIDER = 'mock';
const R = '/home/user/wc-s2/public/js/';
const { sampleRealm } = await import(R + 'engine/realm/stats.js');
const { realmViewFor } = await import(R + 'engine/realm/view.js');
const { createInitialState } = await import(R + 'shared/world.js');
const { addDays } = await import(R + 'engine/time.js');
const { withRng } = await import(R + 'engine/rng.js');
const K = await import(R + 'engine/knowledge.js');
const { standing } = await import(R + 'shared/standing.js');
const s = createInitialState('agot_298', 'stark', { seed: 298 });
const tick = (s, days = 7) => { s.meta.turn += 1; s.meta.date = addDays(s.meta.date, days); sampleRealm(s); withRng(s, () => K.updateKnowledge(s, 'stark')); return s; };
s.pacts = s.pacts || [];
s.pacts.push({ id: 'p_ally', a: 'stark', b: 'tully', type: 'alliance', status: 'active' });
for (let i = 0; i < 4; i++) tick(s);
console.log('friends has tully', K.friendsOf(s,'stark').has('tully'));
const d = realmViewFor(s, 'stark', { house: 'tully', lens: 'economy', scope: 'all' });
console.log('tully cells gold', JSON.stringify(d.detail.cells.gold), 'truth gold', standing(s,'tully').gold);
console.log('tully detail.series.gold', JSON.stringify(d.detail.series.gold));
console.log('tully swords series', JSON.stringify(d.detail.series.swords), 'cell', JSON.stringify(d.detail.cells.swords), 'truth', standing(s,'tully').swords);
const row = d.rows.find(r => r.house==='tully'); console.log('tully economy trend series (net)', JSON.stringify(row.trend));
// the bolton (vassal)
const b = realmViewFor(s, 'stark', { house: 'bolton', scope: 'all' });
console.log('bolton cells.swords', JSON.stringify(b.detail.cells.swords), 'series', JSON.stringify(b.detail.series.swords), 'truth', standing(s,'bolton').swords);
// "other" house series: lannister obs
const l = realmViewFor(s, 'stark', { house: 'lannister', scope: 'all' });
console.log('lannister detail keys', Object.keys(l.detail), JSON.stringify(l.detail.series).slice(0,400));
console.log('lannister obs', JSON.stringify(s.knowledge.stark.realm.lannister.obs.slice(-2)));
// meta.seed present in playerView?
const { playerView } = await import('/home/user/wc-s2/server/view.js');
const pv = playerView(s);
console.log('playerView meta.seed', pv.meta.seed, 'rngState', Array.isArray(pv.meta.rngState));
console.log('playerView has economy.loans', Array.isArray(pv.economy?.loans), pv.economy?.loans?.length, 'wars score', pv.wars.map(w=>w.score));
console.log('pv.knowledge keys', Object.keys(pv.knowledge), 'stark realm keys', Object.keys(pv.knowledge.stark.realm||{}).length);
console.log('pv.houses.lannister.figures.treasury', JSON.stringify(pv.houses.lannister.figures.treasury), 'truth', s.houses.lannister.figures.treasury.v);
console.log('pv.houses.tully treasury', pv.houses.tully.figures.treasury.v, 'has ledger', !!pv.houses.tully.ledger);
