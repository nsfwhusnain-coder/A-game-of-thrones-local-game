import { createInitialState, applyChanges } from '/home/user/wc-s1/public/js/shared/world.js';
import { resolveWarfare } from '/home/user/wc-s1/public/js/shared/battles.js';
import { settle, ref } from '/home/user/wc-s1/public/js/engine/parties.js';
import { makeRng, seedState } from '/home/user/wc-s1/public/js/engine/rng.js';
const world = (house = 'stark') => createInitialState('agot_298', house, { seed: 3 });
const host = (s, id, owner, pos, men, extra = {}) => {
  applyChanges(s, [{ op: 'army_create', id, owner, name: extra.name || `The host ${id}`, at: null, men }], { source: 'test' });
  const p = s.parties[id]; p.pos = [...pos]; p.at = null; delete p.units; Object.assign(p, extra);
  for (const m of [...(p.members || [])]) if (m !== p.commander) p.members = p.members.filter((x) => x !== m);
  if (p.commander) { const c = s.characters[p.commander]; c.loc = ref(id); p.members = [...new Set([...(p.members || []), c.id])]; }
  settle(s, p); return p;
};
const war = (s, a, d) => applyChanges(s, [{ op: 'war', status: 'start', name: 'W', attackers: a, defenders: d }], { source: 'test' });
const rng = (seed) => { const g = makeRng(seedState(seed)); return () => g.next(); };
const fresh = (s) => JSON.parse(JSON.stringify(s));
const s = world('stark'); war(s, ['lannister'], ['stark']);
host(s, 'a', 'lannister', [560, 1440], 30000, { standing: 'always', commander: 'tywin_lannister' });
host(s, 'b', 'stark', [562, 1440], 6000, { commander: 'theon_greyjoy' });
let t0 = Date.now(); const seen = {};
for (let seed = 1; seed <= 200; seed++) {
  const t = fresh(s); resolveWarfare(t, 1, { r: rng(seed) });
  for (const f of t.facts) { if (['battle','slain_in_battle','captured_in_battle','wounded'].includes(f.kind)) { (seen[f.kind] ||= []).push(seed); if (seen[f.kind].length === 1) console.log(seed, JSON.stringify(f)); } }
}
console.log(Object.fromEntries(Object.entries(seen).map(([k,v])=>[k,v.length+':'+v.slice(0,5)])), Date.now()-t0, 'ms');
