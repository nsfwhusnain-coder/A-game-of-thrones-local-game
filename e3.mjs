process.env.WC_PROVIDER='mock';
const { createInitialState } = await import('/home/user/wc-s1/public/js/shared/world.js');
const state = createInitialState('agot_298', 'stark', { seed: 298 });
console.log(JSON.stringify(state.parties.royal_fleet), JSON.stringify(state.parties.free_folk_host));
