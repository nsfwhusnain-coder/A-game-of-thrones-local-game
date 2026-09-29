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
const setup = (aMen, bMen, ea = {}, eb = {}) => { const s = createInitialState('agot_298', 'stark', { seed: 3 }); applyChanges(s, [{ op: 'war', status: 'start', name: 'W', attackers: ['lannister'], defenders: ['stark'] }], { source: 'test' });
  host(s, 'a', 'lannister', [560, 1440], aMen, { standing: 'always', commander: 'tywin_lannister', ...ea }); host(s, 'b', 'stark', [562, 1440], bMen, { commander: 'theon_greyjoy', ...eb }); return s; };
const run = (name, s) => { const mark = s.facts.length; const hows = {}; for (let seed = 1; seed <= 60; seed++) { const t = fresh(s); const g = makeRng(seedState(seed)); resolveWarfare(t, 1, { r: () => g.next() }); const b = t.facts.slice(mark).find((f) => f.kind === 'battle'); if (!b) continue; const k = `${b.data.winner}|${b.data.how}|${JSON.stringify(b.data.decided)}`; hows[k] = (hows[k] || 0) + 1; } console.log(name, hows); };
run('base 30000 v 6000', setup(30000, 6000));
run('equal, stark starving', setup(8000, 8000, {}, { supply: 5, morale: 20 }));
run('equal, lannister surprise', setup(8000, 8000, { surprise: true }, {}));
run('equal, stark low morale', setup(8000, 8000, {}, { morale: 10 }));
run('equal, lannister morale 100 v 30', setup(8000, 8000, { morale: 100 }, { morale: 30 }));
fs.rmSync(process.env.WC_SAVES, { recursive: true, force: true });
