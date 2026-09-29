import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const root = '/home/user/wc-s1';
process.env.WC_PROVIDER = 'mock'; process.env.WC_SAVES = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-d-'));
const { createInitialState, applyChanges } = await import(`${root}/public/js/shared/world.js`);
const { resolveWarfare } = await import(`${root}/public/js/shared/battles.js`);
const { settle, ref } = await import(`${root}/public/js/engine/parties.js`);
const { makeRng, seedState } = await import(`${root}/public/js/engine/rng.js`);
const { newsOf } = await import(`${root}/public/js/engine/knowledge.js`);
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
const t = fresh(s); const g = makeRng(seedState(5)); resolveWarfare(t, 1, { r: () => g.next() });
for (const f of t.facts.slice(s.facts.length)) console.log(f.id, f.kind, f.day, f.importance, f.vis.scope, JSON.stringify(newsOf(t, f)), JSON.stringify(newsOf(t, {...f, place: undefined})));
console.log(t.meta.clock, t.meta.factSeq, t.meta.factTurn, s.meta.factSeq, s.meta.factTurn);
fs.rmSync(process.env.WC_SAVES, { recursive: true, force: true });
