process.env.WC_PROVIDER='mock'; process.env.WC_SAVES = '/tmp/claude-0/x';
const { createInitialState, applyChanges } = await import('/home/user/wc-sb/public/js/shared/world.js');
const { parseOrder } = await import('/home/user/wc-sb/server/orders/parse.js');
const { withRng } = await import('/home/user/wc-sb/public/js/engine/rng.js');
const s = createInitialState('agot_298', 'lannister', { seed: 298 });
withRng(s, () => applyChanges(s, [{ op: 'army_create', id: 'host_of_the_rock', owner: 'lannister', name: 'The Host of the Rock', at: 'lannister', men: 6000, commander: 'kevan_lannister' }, { op: 'army_create', id: 'crakehall_host', owner: 'crakehall', name: 'Host of House Crakehall', at: 'crakehall', men: 9000 }]));
s.parties.crakehall_host.serving = 'lannister';
for (const t of ['Robb is to march the Northern Host to Moat Cailin.', 'March the Northern Host to Moat Cailin.', 'Robb Stark should march to Moat Cailin.', 'March to Moat Cailin.', 'Take the host to Moat Cailin.', 'March them to Moat Cailin.', 'Kevan is to march the Rock Host to Moat Cailin', 'The Stark host must march to Moat Cailin', 'Robb should march the host to the Twins and demand passage.']) {
  const p = parseOrder(s, t, { house: 'lannister' });
  console.log(t, '\n   ', JSON.stringify(p.actions.map(a=>[a.verb,a.params])), p.complete, p.clarify?.question||'');
}
