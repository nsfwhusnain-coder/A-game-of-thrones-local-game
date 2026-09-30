// The small life of the realm (docs/gdd/13-content-data.md §6; WP G4): what the library of happenings must hold for every region to have a life of its own.
//   • every happening is well formed: a unique id, a known kind, a place that exists, conditions and effects the engine knows, slots it can fill, no anachronism, every character it names real;
//   • every one has its own headline and summary (data/happening-heads.js), which pass the headline scorer at the places it can happen, so the chronicle's Meanwhile reads as the small
//     life of the realm and not as "Rumour spreads at Sunflower Hall";
//   • coverage: each region has happenings of its own, and in its winter and its summer, in war and in peace.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.WC_PROVIDER = 'mock';
const { createInitialState } = await import('../public/js/shared/world.js');
const { HAPPENINGS, NAMES, GOODS } = await import('../public/data/happenings.js');
const { HAP_HEADS } = await import('../public/data/happening-heads.js');
const { placesFor, slotsFor, fill, variant, sentenceCase, fits } = await import('../public/js/shared/happenings.js');
const { fact } = await import('../public/js/engine/facts/log.js');
const { ctxFor, HEAD, SUM, TPL } = await import('../public/js/engine/facts/heads.js');
const { scoreCard } = await import('../server/ai/validate/headline.js');
const { anachronismsIn } = await import('../public/data/anachronisms.js');
const { CHARACTERS } = await import('../public/data/characters.js');
const { ANCESTORS } = await import('../public/data/families.js');
const { HOUSES, EXTRA_HOLDINGS } = await import('../public/data/houses.js');

const WHEN = new Set(['war', 'peace', 'winter', 'cold', 'warm', 'summer', 'autumn', 'unrest', 'calm', 'rich', 'poor', 'coast', 'town', 'lord', 'oldlord', 'younglord', 'wildlings', 'dead', 'mine', 'notmine']);
const FX = new Set(['pro', 'unr', 'rel', 'relf', 'note']);
const TYPES = new Set(['court', 'intrigue', 'rumor', 'religion', 'economy', 'war', 'disaster', 'diplomacy', 'magic']);
const SLOTS = new Set(['place', 'house', 'lord', 'lordshort', 'region', 'knight', 'smallfolk', 'smallfolk2', 'goods', 'sea', 'rival', 'friend', 'season', 'liege', 'liegehouse', 'n']);
const REGIONS = ['north', 'wall', 'beyond', 'iron_islands', 'riverlands', 'vale', 'westerlands', 'crownlands', 'reach', 'stormlands', 'dorne', 'essos'];
const charIds = new Set([...CHARACTERS, ...ANCESTORS].map((c) => c.id)); const houseIds = new Set(HOUSES.map((h) => h.id)); const holdIds = new Set([...HOUSES.map((h) => h.id), ...EXTRA_HOLDINGS.map((e) => e[0])]);
const state = () => createInitialState('agot_298', 'stark', { seed: 298 });

test('every happening is well formed: a unique id, a known kind and place, conditions and effects the engine knows, slots it can fill, no anachronism, real people', () => {
  const ids = new Set(); const bad = [];
  for (const h of HAPPENINGS) {
    const tag = (m) => bad.push(`${h.id}: ${m}`);
    if (ids.has(h.id)) tag('duplicate id'); ids.add(h.id);
    if (!/^[a-z0-9_]+$/.test(h.id)) tag('id characters');
    if (!TYPES.has(h.type)) tag(`type ${h.type}`); if (![1, 2, 3].includes(h.imp)) tag(`importance ${h.imp}`);
    if (!h.t || !h.x || /undefined|null|\[object/.test(h.t + h.x)) tag('words');
    const w = h.where;
    if (w === 'any') { /* anywhere in the realm's heartland */ } else if (w.startsWith('r:')) { for (const r of w.slice(2).split('|')) if (!REGIONS.includes(r)) tag(`region ${r}`); } else if (w.startsWith('h:')) { for (const id of w.slice(2).split('|')) if (!holdIds.has(id)) tag(`holding ${id}`); } else if (w.startsWith('c:')) { if (!charIds.has(w.slice(2))) tag(`character ${w.slice(2)}`); } else tag(`where ${w}`);
    for (const c of h.when || []) { if (c.startsWith('alive:')) { for (const id of c.slice(6).split('+')) if (!charIds.has(id)) tag(`alive ${id}`); } else if (c.startsWith('flag:') || c.startsWith('noflag:')) { /* a story flag */ } else if (!WHEN.has(c)) tag(`condition ${c}`); }
    for (const [k, v] of Object.entries(h.fx || {})) { if (!FX.has(k)) tag(`effect ${k}`); else if (k !== 'note' && (!Number.isFinite(v) || Math.abs(v) > 10)) tag(`effect size ${k}=${v}`); }
    for (const k of ['cd', 'w']) if (h[k] != null && !(h[k] > 0 && Number.isFinite(h[k]))) tag(`${k}`);
    for (const t of [h.t, h.x]) for (const m of t.matchAll(/\{(\w+)(?::[\d-]+)?\}/g)) if (!SLOTS.has(m[1])) tag(`slot {${m[1]}}`);
    if ((h.t + h.x).includes('{n') && /\{n\}/.test(h.t + h.x)) tag('{n} needs a range');
    for (const v of String(h.x).split(' || ').concat(String(h.t).split(' || '))) if (!v.trim()) tag('an empty variant');
    if (anachronismsIn(state(), `${h.t} ${h.x}`)?.length) tag(`anachronism in "${h.t}"`);
    if (h.t.length > 90) tag('title over 90 characters');
  }
  assert.deepEqual(bad.slice(0, 12), [], `${bad.length} faults`);
  assert.ok(HAPPENINGS.length >= 380, `${HAPPENINGS.length} happenings (the roadmap's target is about 400)`);
});

test('every happening has its own headline and summary, and the card passes the scorer at the places it can happen', () => {
  const s = state(); const faults = []; let cards = 0;
  for (const tpl of HAPPENINGS) {
    const own = TPL[tpl.id] || HAP_HEADS[tpl.id]; if (!own) { faults.push(`${tpl.id}: no headline in data/happening-heads.js`); continue; }
    if (!Array.isArray(own[0]) || !own[0].length || typeof own[1] !== 'string') { faults.push(`${tpl.id}: malformed`); continue; }
    const places = placesFor(s, tpl).slice(0, 4); if (!places.length) { if (!tpl.where.startsWith('c:')) faults.push(`${tpl.id}: no place in the world for it`); continue; } // (the conditions are the engine's; a headline does not depend on them; a person who is not in the world at the start has nowhere yet)
    for (const h of places) {
      const { ctx, owner } = slotsFor(s, h, () => 0.3);
      const title = sentenceCase(fill(variant(tpl.t, () => 0.3), ctx, () => 0.3)); const text = sentenceCase(fill(variant(tpl.x, () => 0.3), ctx, () => 0.3));
      for (let k = 0; k < own[0].length; k++) {
        const card = fact(s, 'happening', { title, text, where: h.id, importance: tpl.imp || 1, type: tpl.type || 'rumor', houses: [owner.id], bg: true, tpl: tpl.id, day: 3 }, { data: { tpl: tpl.id }, ...(tpl.where.startsWith('c:') ? { actors: [tpl.where.slice(2)] } : {}) });
        const f = s.facts.find((x) => x.id === card.fact);
        const c = ctxFor(s, { facts: [f], place: h.id }, { pin: k });
        const headline = HEAD.happening(f, s, c); const summary = SUM.happening(f, s, c); cards++;
        const sc = scoreCard({ headline, summary }, { facts: [f] }, s);
        if (!sc.pass) faults.push(`${tpl.id} @${h.id} [${k}]: "${headline}" — ${sc.detail.map((d) => `${d.rule}: ${d.text}`).join('; ').slice(0, 140)}`);
      }
    }
  }
  assert.deepEqual(faults.slice(0, 10), [], `${faults.length} faults in ${cards} cards`);
});

test('every region has a life of its own: happenings made for it, in its winter and its summer, in war and in peace', () => {
  const hregion = new Map(HOUSES.map((h) => [h.id, h.region])); for (const e of EXTRA_HOLDINGS) hregion.set(e[0], hregion.get(e[4]));
  const mine = (h, r) => { const w = h.where; if (w.startsWith('r:')) return w.slice(2).split('|').includes(r); if (w.startsWith('h:')) return w.slice(2).split('|').some((id) => hregion.get(id) === r); return false; };
  const need = { north: 22, wall: 14, beyond: 9, iron_islands: 14, riverlands: 17, vale: 14, westerlands: 14, crownlands: 17, reach: 17, stormlands: 14, dorne: 17, essos: 20 };
  const cold = (h) => (h.when || []).some((c) => c === 'winter' || c === 'cold'); const warm = (h) => (h.when || []).some((c) => c === 'summer' || c === 'warm');
  const war = (h) => (h.when || []).includes('war'); const peace = (h) => (h.when || []).includes('peace');
  const short = [];
  for (const r of REGIONS) {
    const all = HAPPENINGS.filter((h) => mine(h, r));
    if (all.length < need[r]) short.push(`${r}: ${all.length} of its own (${need[r]})`);
    const anyRegion = r !== 'wall' && r !== 'beyond' && r !== 'essos'; const pool = anyRegion ? [...all, ...HAPPENINGS.filter((h) => h.where === 'any')] : all;
    if (all.filter(cold).length < 2) short.push(`${r}: no winter life`); if (all.filter(warm).length < 2) short.push(`${r}: no summer life`);
    if (pool.filter(war).length < 3) short.push(`${r}: no war life`); if (pool.filter(peace).length < 1 && !anyRegion) short.push(`${r}: no peace life`);
  }
  assert.deepEqual(short, []);
});

test('the slots the happenings use are the ones there are names and goods for in every region', () => {
  for (const r of REGIONS) { assert.ok((NAMES[r] || NAMES.default).length >= 5, `${r}: names`); assert.ok((GOODS[r] || GOODS.default).length >= 4, `${r}: goods`); }
  const used = new Set(); for (const h of HAPPENINGS) for (const m of (h.t + h.x).matchAll(/\{(\w+)/g)) used.add(m[1]);
  for (const k of used) assert.ok(SLOTS.has(k), `slot ${k}`);
});

test('the headline tables are read from the data: the writer asks HAP_HEADS before the kind\'s generic line', () => {
  const heads = fs.readFileSync(path.join(ROOT, 'public/js/engine/facts/heads.js'), 'utf8');
  assert.match(heads, /import \{ HAP_HEADS \} from '\.\.\/\.\.\/\.\.\/data\/happening-heads\.js'/); assert.match(heads, /TPL\[id\] \|\| HAP_HEADS\[id\]/);
});
