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
const s0 = createInitialState('agot_298', 'stark', { seed: 3 });
const hs = Object.values(s0.holdings);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
// a point on the Whitewalls road, then walk away until no holding is near
for (const off of [[0,0],[0,20],[0,40],[0,-20],[20,0],[-20,0],[40,40]]) {
  const pos = [560 + off[0], 1440 + off[1]]; const near = Math.min(...hs.map((h) => dist(h.pos, pos)));
  const s = createInitialState('agot_298', 'stark', { seed: 3 });
  applyChanges(s, [{ op: 'war', status: 'start', name: 'W', attackers: ['lannister'], defenders: ['stark'] }], { source: 'test' });
  const a = host(s, 'a', 'lannister', pos, 30000, { standing: 'always', commander: 'tywin_lannister' }); const b = host(s, 'b', 'stark', [pos[0] + 2, pos[1]], 6000, { commander: 'theon_greyjoy' });
  let line = `off ${off} nearest holding ${near.toFixed(1)} a.at=${a.at} b.at=${b.at}`;
  const mark = s.facts.length; let seen = {};
  for (let seed = 1; seed <= 80; seed++) { const t = fresh(s); const g = makeRng(seedState(seed)); resolveWarfare(t, 1, { r: () => g.next() }); for (const f of t.facts.slice(mark)) if (['battle','slain_in_battle','captured_in_battle'].includes(f.kind)) { const k = f.kind; seen[k] = seen[k] || `${f.place} news:${JSON.stringify(newsOf(t, f))} seed ${seed}`; } }
  console.log(line, JSON.stringify(seen));
}
fs.rmSync(process.env.WC_SAVES, { recursive: true, force: true });
