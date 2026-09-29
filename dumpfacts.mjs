// usage: node dumpfacts.mjs <root>   — prints the facts of the three recorded battles, as the code at <root> makes them
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const root = process.argv[2];
process.env.WC_PROVIDER = 'mock'; process.env.WC_SAVES = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-d-'));
const { createInitialState, applyChanges } = await import(`${root}/public/js/shared/world.js`);
const { resolveWarfare } = await import(`${root}/public/js/shared/battles.js`);
const { settle, ref } = await import(`${root}/public/js/engine/parties.js`);
const { makeRng, seedState } = await import(`${root}/public/js/engine/rng.js`);
const fresh = (s) => JSON.parse(JSON.stringify(s));
const host = (s, id, owner, pos, men, extra = {}) => {
  applyChanges(s, [{ op: 'army_create', id, owner, name: extra.name || `The host ${id}`, at: null, men }], { source: 'test' });
  const p = s.parties[id]; p.pos = [...pos]; p.at = null; delete p.units; Object.assign(p, extra);
  for (const m of [...(p.members || [])]) if (m !== p.commander) p.members = p.members.filter((x) => x !== m);
  if (p.commander) { const c = s.characters[p.commander]; c.loc = ref(id); p.members = [...new Set([...(p.members || []), c.id])]; }
  settle(s, p); return p;
};
const s = createInitialState('agot_298', 'stark', { seed: 3 });
applyChanges(s, [{ op: 'war', status: 'start', name: 'W', attackers: ['lannister'], defenders: ['stark'] }], { source: 'test' });
host(s, 'a', 'lannister', [560, 1440], 30000, { standing: 'always', commander: 'tywin_lannister' });
host(s, 'b', 'stark', [562, 1440], 6000, { commander: 'theon_greyjoy' });
const out = {};
for (const seed of [5, 32, 53]) {
  const t = fresh(s); const g = makeRng(seedState(seed)); resolveWarfare(t, 1, { r: () => g.next() });
  out[seed] = t.facts.slice(s.facts.length);
}
console.log(JSON.stringify(out));
fs.rmSync(process.env.WC_SAVES, { recursive: true, force: true });
