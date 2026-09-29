// PROTOTYPE for timing only (scratch copy): what an owner index in standing() and project() would buy
import fs from 'node:fs';
const S = '/tmp/claude-0/-home-user-A-game-of-thrones-local-game/1a59ec30-8b4e-5558-8c33-823b20aa5156/scratchpad/opt/public/js/shared/';
let st = fs.readFileSync(S + 'standing.js', 'utf8');
st = st.replace(/const holdingsOf = .*\n/, `const IXS = new WeakMap();
const ix = (s) => { let x = IXS.get(s.holdings); if (x && x.tick === s.__ixTick) return x; x = { tick: s.__ixTick, h: new Map(), a: new Map(), k: new Map() };
  for (const h of Object.values(s.holdings)) (x.h.get(h.owner) || x.h.set(h.owner, []).get(h.owner)).push(h);
  for (const a of Object.values(s.parties)) if (a.men > 0) (x.a.get(a.owner) || x.a.set(a.owner, []).get(a.owner)).push(a);
  for (const c of Object.values(s.characters)) if (c.alive && !(c.roles || []).includes('ward')) (x.k.get(c.house) || x.k.set(c.house, []).get(c.house)).push(c);
  IXS.set(s.holdings, x); return x; };
const holdingsOf = (s, id) => ix(s).h.get(id) || [];
`).replace(/const armiesOf = .*\n/, 'const armiesOf = (s, id) => ix(s).a.get(id) || [];\n').replace(/const kinOf = .*\n/, 'const kinOf = (s, id) => ix(s).k.get(id) || [];\n');
fs.writeFileSync(S + 'standing.js', st);
let ec = fs.readFileSync(S + 'economy.js', 'utf8');
ec = ec.replace(/function houseHoldings\(state, id\) \{.*\}\n/, `const HX = new WeakMap();
function houseHoldings(state, id) { let x = HX.get(state.holdings); if (!x || x.tick !== state.__ixTick) { x = { tick: state.__ixTick, m: new Map() }; for (const h of Object.values(state.holdings)) (x.m.get(h.owner) || x.m.set(h.owner, []).get(h.owner)).push(h); HX.set(state.holdings, x); } return x.m.get(id) || []; }
`);
ec = ec.replace('const alms = almsFor(state).find((x) => x.id === houseId)?.amount || 0;', 'const alms = (state.__alms ||= almsFor(state)).find((x) => x.id === houseId)?.amount || 0;');
fs.writeFileSync(S + 'economy.js', ec);
console.log('patched');
