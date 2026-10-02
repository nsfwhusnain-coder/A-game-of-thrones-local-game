// Bug hunt: the web of relations between people, houses and holdings must hold after every turn. Usage: node probe-links.mjs <house> <seed> <turns> [span]
// A liege that loops or is gone; a hold owned by no house; a seat held by strangers while the house still has a lord there; a living spouse who does not answer the vow (a dead husband's old vow stays on him: she may wed again);
// a child older than a parent or born to a mother who was dead; a siege with no besieger at the gate, or a besieger at a gate not besieged; a regent, heir or lord who is dead or a prisoner; a war with a side that is gone.
import { BH_OUT, REPO } from './paths.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
const [house = 'stark', seed = '100', turns = '12', span = '30d'] = process.argv.slice(2);
process.env.WC_PROVIDER = 'mock'; process.env.WC_SAVES = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-bh-links-'));
const im = (p) => import(pathToFileURL(`${REPO}/${p}`).href);
const game = await im('server/game.js');
const { id } = game.newGame('agot_298', house, { seed: Number(seed) });
const out = {}; const add = (rule, t) => { (out[rule] = out[rule] || new Set()).add(t); };
const HELD = /imprisoned|captive|hostage/;
for (let n = 1; n <= Number(turns); n++) {
  await game.advance(id, { span }); await game.settled(id);
  const s = game.loadState(id); const C = s.characters; const H = s.houses; const nm = (i) => C[i]?.name || i; const year = (s.meta.date.year ?? 298);
  const at = `(turn ${n})`;
  for (const h of Object.values(H)) {
    if (h.liege && !H[h.liege]) add('liege-gone', `${h.id}'s liege ${h.liege} is no house ${at}`);
    const seen = new Set([h.id]); let l = h.liege; while (l && H[l]) { if (seen.has(l)) { add('liege-loop', `${h.id} is its own liege through ${[...seen].join(' > ')} ${at}`); break; } seen.add(l); l = H[l].liege; }
    const seat = s.holdings[h.seat]; if (seat && seat.owner !== h.id && !h.landless && h.status === 'active' && !['company', 'tribe'].includes(h.rank) && seat.owner && !(H[seat.owner]?.liege === h.id)) add('seat-held-by-another', `${h.id}'s seat ${seat.name} is held by ${seat.owner} and the house is not landless ${at}`);
    if (h.status === 'extinct' && Object.values(C).some((c) => c.alive && c.house === h.id)) add('extinct-with-living', `${h.id} is extinct and ${Object.values(C).filter((c) => c.alive && c.house === h.id).map((c) => c.name).slice(0, 2).join(', ')} live ${at}`);
    if (h.regent && C[h.regent] && (!C[h.regent].alive || HELD.test(C[h.regent].status || ''))) add('regent-unfit', `${h.id}'s regent ${nm(h.regent)} is ${C[h.regent].alive ? C[h.regent].status : 'dead'} ${at}`);
    if (h.lord && C[h.lord]?.alive && C[h.lord].house !== h.id && !['company', 'tribe'].includes(h.rank) && !C[h.lord].house?.startsWith?.(h.id)) add('lord-of-another-house', `${nm(h.lord)} (${C[h.lord].house}) is lord of ${h.id} ${at}`);
  }
  for (const k of Object.values(s.holdings)) {
    if (k.owner && !H[k.owner]) add('owner-gone', `${k.name} is owned by ${k.owner}, which is no house ${at}`);
    if (k.status === 'besieged') { const bes = Object.values(s.parties).filter((p) => p.kind !== 'fleet' && p.owner !== k.owner && p.pos && Math.hypot(p.pos[0] - k.pos[0], p.pos[1] - k.pos[1]) < 25); if (!bes.length) add('siege-no-besieger', `${k.name} is besieged and no host of another house is near its walls ${at}`); }
  }
  for (const c of Object.values(C)) {
    if (c.spouse) { const w = C[c.spouse]; if (!w) add('spouse-missing', `${c.name}'s spouse ${c.spouse} is nobody ${at}`); else if (w.spouse !== c.id && c.alive) add('spouse-one-sided', `${c.name} is wed to ${w.name}, who is wed to ${nm(w.spouse)} ${at}`) }
    for (const [rel, key] of [['father', 'father'], ['mother', 'mother']]) { const p = C[c[key]]; if (!p || c.born == null || p.born == null) continue; if (c.born > 298 && c.born - p.born < 12) add('parent-too-young', `${p.name} (born ${p.born}) is ${rel} of ${c.name} (born ${c.born}) ${at}`); if (c.born > 298 && !p.alive && p.died != null && c.born > p.died + (key === 'father' ? 1 : 0)) add('born-after-death', `${c.name} born ${c.born}, after ${rel} ${p.name} died in ${p.died} ${at}`); }
    if (c.alive && c.age != null && c.born != null && Math.abs((year - c.born) - c.age) > 1) add('age-born-disagree', `${c.name} is ${c.age} and born ${c.born} in ${year} ${at}`);
  }
  for (const c of Object.values(C)) {
    if (c.betrothed) { const b = C[c.betrothed]; if (!b) add('betrothed-missing', `${c.name} is promised to ${c.betrothed}, who is nobody ${at}`); else if (c.alive && !b.alive) add('betrothed-dead', `${c.name} is promised to ${b.name}, who is dead ${at}`); else if (c.alive && b.betrothed !== c.id) add('betrothed-one-sided', `${c.name} is promised to ${b.name}, who is promised to ${nm(b.betrothed)} ${at}`); }
    if (c.alive && (c.roles || []).includes('heir') && H[c.house]?.lord === c.id) add('lord-still-heir', `${c.name} is lord of ${c.house} and still its heir ${at}`);
  }
  for (const p of s.pacts || []) for (const k of ['a', 'b']) if (p[k] && !H[p[k]]) add('pact-house-gone', `a ${p.type} pact names ${p[k]}, which is no house ${at}`);
  for (const r of Array.isArray(s.ravens) ? s.ravens : []) for (const k of ['from', 'to']) if (typeof r[k] === 'string' && !C[r[k]] && !H[r[k]]) add('raven-nobody', `a raven ${k} ${r[k]}, who is nobody ${at}`);
  for (const w of s.wars || []) { if (w.status !== 'ongoing') continue; for (const side of [...(w.attackers || []), ...(w.defenders || [])]) if (!H[side]) add('war-side-gone', `war ${w.id} has ${side}, which is no house ${at}`); const both = (w.attackers || []).filter((a) => (w.defenders || []).includes(a)); if (both.length) add('war-same-side-both', `${both.join(',')} fight both sides of ${w.id} ${at}`); }
}
const res = Object.fromEntries(Object.entries(out).map(([r, v]) => [r, [...v]]));
fs.writeFileSync(`${BH_OUT}/links-${house}-${seed}.json`, JSON.stringify(res, null, 1));
for (const [r, v] of Object.entries(res)) { console.log('##', r, v.length); for (const t of v.slice(0, 5)) console.log('   ', t.slice(0, 240)); }
console.log('done', house, seed);
fs.rmSync(process.env.WC_SAVES, { recursive: true, force: true });
