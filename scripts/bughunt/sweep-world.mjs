// Bug hunt, sweep 1: the starting world of EVERY house, looked at for inconsistencies. Reads, never fixes. Writes findings as JSON lines to $BH_OUT/world.jsonl
import { BH_OUT, REPO } from './paths.mjs';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
process.env.WC_PROVIDER = 'mock';
const R = process.argv[2] || REPO + '/';
const im = (p) => import(pathToFileURL(R + p).href);
const W = await im('public/js/shared/world.js'); const { HOUSES } = await im('public/data/houses.js');
const V = await im('public/js/engine/state/validate.js');
fs.mkdirSync(BH_OUT, { recursive: true });
const out = []; const add = (kind, id, text, extra = {}) => out.push({ kind, id, text, ...extra });
const base = W.createInitialState('agot_298', 'stark', { seed: 298 });
const s = base; const C = s.characters, H = s.houses, L = s.holdings;
const placeOk = (id) => id && (L[id] || String(id).startsWith('party:') || W.resolvePlaceId(id));
// ── houses
for (const h of Object.values(H)) {
  if (h.status !== 'extinct' && !h.lord && !h.landless) add('house', h.id, 'no lord');
  if (h.lord && !C[h.lord]) add('house', h.id, `lord ${h.lord} is no character`);
  if (h.lord && C[h.lord] && C[h.lord].house !== h.id) add('house', h.id, `lord ${h.lord} belongs to ${C[h.lord].house}`);
  if (h.lord && C[h.lord] && !C[h.lord].alive) add('house', h.id, `lord ${h.lord} is dead at the start`);
  if (h.liege && !H[h.liege]) add('house', h.id, `liege ${h.liege} is no house`);
  let x = h, n = 0; while (x?.liege && n++ < 12) x = H[x.liege]; if (n >= 12) add('house', h.id, 'liege chain does not end (a cycle)');
  if (!h.landless && h.seat && !L[h.seat]) add('house', h.id, `seat ${h.seat} is no holding`);
  if (!h.landless && h.seat && L[h.seat] && L[h.seat].owner !== h.id) add('house', h.id, `seat ${h.seat} is held by ${L[h.seat].owner}`);
  if (!h.name || /undefined|null|\[object/.test(JSON.stringify([h.name, h.words, h.title, h.realmName]))) add('house', h.id, 'a field says undefined/null', { v: [h.name, h.words, h.title] });
  if (!h.words) add('house', h.id, 'no house words (sigil card)');
  if (!/^#[0-9a-f]{3,8}$/i.test(h.color || '')) add('house', h.id, `colour ${h.color}`);
  const f = h.figures || {}; for (const k of Object.keys(f)) if (!Number.isFinite(Number(f[k]?.v))) add('house', h.id, `figure ${k} is ${f[k]?.v}`);
  const fam = Object.values(C).filter((c) => c.house === h.id && c.alive);
  if (!h.landless && h.rank !== 'order' && fam.length < 2) add('house', h.id, `only ${fam.length} living people`);
}
// ── characters
const nameCount = {};
for (const c of Object.values(C)) {
  nameCount[c.name] = (nameCount[c.name] || []).concat(c.id);
  if (!H[c.house]) add('char', c.id, `house ${c.house} is no house`);
  if (c.alive && c.loc && !placeOk(c.loc)) add('char', c.id, `at "${c.loc}", which is no place`);
  if (c.alive && !c.loc) add('char', c.id, 'alive and nowhere');
  if (c.born != null && c.age != null && Math.abs((298 - c.born) - c.age) > 1) add('char', c.id, `born ${c.born}, age ${c.age} in 298`);
  for (const [k, p] of [['father', c.father], ['mother', c.mother]]) { if (!p) continue; const pc = C[p]; if (!pc) { add('char', c.id, `${k} ${p} is no character`); continue; } if (pc.born != null && c.born != null && c.born - pc.born < 13) add('char', c.id, `${k} ${pc.name} is only ${c.born - pc.born} years older`); if (k === 'mother' && pc.sex === 'm') add('char', c.id, `mother ${pc.name} is male`); if (k === 'father' && pc.sex === 'f') add('char', c.id, `father ${pc.name} is female`); }
  if (c.spouse) { const sp = C[c.spouse]; if (!sp) add('char', c.id, `spouse ${c.spouse} is no character`); else if (sp.spouse !== c.id) add('char', c.id, `spouse ${sp.name} does not have ${c.name} as spouse (has ${sp.spouse})`); else if (sp.sex === c.sex) add('char', c.id, `married to ${sp.name} of the same sex`); }
  if (/undefined|null|\[object|NaN/.test(JSON.stringify([c.name, c.title, c.traits, c.roles]))) add('char', c.id, 'a field says undefined/null', { v: [c.name, c.title] });
  if (!c.sex) add('char', c.id, 'no sex'); if (!c.skills) add('char', c.id, 'no skills');
  if (c.age != null && (c.age < 0 || c.age > 100)) add('char', c.id, `age ${c.age}`);
  if (c.house === 'nights_watch' && c.spouse) add('char', c.id, 'a sworn brother with a spouse');
}
for (const [n, ids] of Object.entries(nameCount)) if (ids.length > 1) add('dupname', ids.join(','), `${ids.length} people called "${n}"`);
// heir sanity: the lord's heir
for (const h of Object.values(H)) { if (h.landless || !h.lord) continue; const heirs = Object.values(C).filter((c) => c.house === h.id && c.alive && (c.roles || []).includes('heir')); if (!heirs.length && h.rank !== 'order' && h.rank !== 'tribe') add('house', h.id, 'no heir named'); if (heirs.length > 2) add('house', h.id, `${heirs.length} heirs named`); }
// ── holdings
for (const l of Object.values(L)) {
  if (!H[l.owner]) add('holding', l.id, `owner ${l.owner} is no house`);
  if (!Number.isFinite(l.population) || l.population <= 0) add('holding', l.id, `population ${l.population}`);
  if (!l.pos || !Number.isFinite(l.pos[0])) add('holding', l.id, 'no position');
  if (!l.name || /undefined/.test(l.name)) add('holding', l.id, `name ${l.name}`);
}
// ── parties
for (const p of Object.values(s.parties)) {
  if (!H[p.owner]) add('party', p.id, `owner ${p.owner} is no house`);
  if (p.commander && !C[p.commander]) add('party', p.id, `commander ${p.commander} is no character`);
  if (p.commander && C[p.commander] && !C[p.commander].alive) add('party', p.id, 'commander is dead');
  for (const m of p.members || []) if (!C[m]) add('party', p.id, `member ${m} is no character`);
  if (!(p.men >= 0)) add('party', p.id, `men ${p.men}`);
  if (p.at && !L[p.at] && !W.resolvePlaceId(p.at)) add('party', p.id, `at ${p.at}, which is no place`);
}
// ── wars, pacts, relations
for (const w of s.wars || []) for (const x of [...(w.attackers || []), ...(w.defenders || [])]) if (!H[x]) add('war', w.id, `side ${x} is no house`);
for (const k of Object.keys(s.relations || {})) { const [a, b] = k.split('|'); if (!H[a] || !H[b]) add('relation', k, 'names a house that is not'); }
// ── the engine's own invariants
for (const v of V.validate(s)) add('invariant', '-', v);
fs.writeFileSync(BH_OUT + '/world.jsonl', out.map((x) => JSON.stringify(x)).join('\n') + '\n');
const by = {}; for (const x of out) by[x.kind] = (by[x.kind] || 0) + 1; console.log('findings', out.length, JSON.stringify(by));
