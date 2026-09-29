import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const root = '/home/user/wc-s1';
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
const s = createInitialState('agot_298', 'stark', { seed: 3 }); s.meta.settings = { ...(s.meta.settings || {}), canonGravity: 'sandbox' };
applyChanges(s, [{ op: 'war', status: 'start', name: 'W', attackers: ['lannister'], defenders: ['stark'] }], { source: 'test' });
host(s, 'a', 'lannister', [560, 1440], 30000, { standing: 'always', commander: 'tywin_lannister' });
host(s, 'b', 'stark', [562, 1440], 6000, { commander: 'theon_greyjoy' });
const mark = s.facts.length; const found = {};
for (let seed = 1; seed <= 20000; seed++) {
  const t = fresh(s); const g = makeRng(seedState(seed)); resolveWarfare(t, 1, { r: () => g.next() });
  const fs_ = t.facts.slice(mark); const tyw = fs_.find((f) => f.kind === 'slain_in_battle' && f.actors[0] === 'tywin_lannister'); if (!tyw) continue;
  const th = fs_.find((f) => ['slain_in_battle', 'captured_in_battle'].includes(f.kind) && f.actors[0] === 'theon_greyjoy'); if (!th) continue;
  if (!found[th.kind]) { found[th.kind] = seed; console.log(seed, th.kind, JSON.stringify(th.data), 'tywin', JSON.stringify(tyw.data)); }
}
console.log(found);
fs.rmSync(process.env.WC_SAVES, { recursive: true, force: true });
