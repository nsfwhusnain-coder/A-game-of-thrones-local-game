process.env.WC_PROVIDER = 'mock';
const { createInitialState } = await import('/home/user/wc-s2/public/js/shared/world.js');
const { playerView, viewTurn } = await import('/home/user/wc-s2/server/view.js');
const s = createInitialState('agot_298', 'stark', { seed: 298 });
const v = playerView(s);
console.log('playerView carries realmStats:', !!v.realmStats, '| lannister row:', JSON.stringify(v.realmStats?.samples[0].h.lannister));
console.log('viewTurn keeps realm:', 'realm' in viewTurn({ turn: 1, events: [], realm: { h: {} } }));
