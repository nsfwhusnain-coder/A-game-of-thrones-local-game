process.env.WC_PROVIDER='mock'; process.env.WC_SAVES = '/tmp/claude-0/x';
const { createInitialState } = await import('/home/user/wc-sb/public/js/shared/world.js');
const { parseOrder } = await import('/home/user/wc-sb/server/orders/parse.js');
const { carryOut } = await import('/home/user/wc-sb/server/orders.js');
const { withDice } = await import('/home/user/wc-sb/server/dice.js');
const { withRng } = await import('/home/user/wc-sb/public/js/engine/rng.js');
for (const h of ['lannister','stark']) {
  const s = createInitialState('agot_298', h, { seed: 298 });
  const text = 'assemble the men of the north at winterfell and create a great northern host of all able body men and boys';
  const p = parseOrder(s, text);
  console.log(h, JSON.stringify(p.actions), p.complete);
  const r = withDice(s, () => withRng(s, () => carryOut(s, { text, id: 'o1' }, p)));
  console.log(r.lines.map(l=>l.ok+' '+l.text));
  console.log(Object.values(s.houses).filter(x=>x.obligations?.levies==='called').map(x=>x.id));
  console.log(Object.values(s.parties).filter(a=>a.owner===h).map(a=>[a.id,a.men,a.march?.to]));
}
