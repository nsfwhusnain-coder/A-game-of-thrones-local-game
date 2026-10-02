// Bug hunt, sweep 2: play a house for N turns on the mock and look for inconsistencies at every turn. Reads, never fixes. Usage: node sweep-soak.mjs <house> <seed> <turns> [span] [repo]
// Writes $BH_OUT/soak-<house>-<seed>.json: { findings: [{ rule, turn, text }], stats }
import { BH_OUT, REPO } from './paths.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { pathToFileURL } from 'node:url';
const [house, seed, turns, span = '30d', repo = REPO + '/'] = process.argv.slice(2);
process.env.WC_PROVIDER = 'mock'; process.env.WC_SAVES = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-bh-'));
const im = (p) => import(pathToFileURL(repo + p).href);
const game = await im('server/game.js'); const V = await im('public/js/engine/state/validate.js'); const Co = await im('bench/lib/coherence.js');
const { id } = game.newGame('agot_298', house, { seed: Number(seed) });
const findings = []; const seen = new Set(); const add = (rule, turn, text) => { const k = rule + '|' + text.slice(0, 120); if (seen.has(k)) return; seen.add(k); findings.push({ rule, turn, text }); };
const stats = { turnMs: [], alive: [], houses: 0, wars: [], deaths: 0, births: 0, flips: 0 };
const TEXT_BAD = /\bundefined\b|\bNaN\b|\[object|\bnull\b|\{\{|\}\}|%s|\bthe the\b|\ba a\b|\ban an\b|\ba [aeiou]\w+|,\s*,|\.\s*\.(?!\.)|\bHouse House\b|\bLord Lord\b|\bSer Ser\b|\bLady Lady\b|\s{2,}\S|\bhis her\b|\bher his\b|\(\s*\)|\bundefined's/;
const textsOf = (t) => [...(t.events || []).flatMap((e) => [e.headline, e.summary, e.title, e.text, ...(Array.isArray(e.details) ? e.details : [])]), t.summary, t.digest?.text, t.meanwhile, ...(t.applied || []).map((a) => a.text)].filter((x) => typeof x === 'string');
let prev = null;
for (let n = 1; n <= Number(turns); n++) {
  const t0 = Date.now();
  let r; try { r = await game.advance(id, { span }); await game.settled(id); } catch (e) { add('crash', n, `advance threw: ${String(e.message).slice(0, 200)}`); break; }
  stats.turnMs.push(Date.now() - t0);
  const s = game.loadState(id); const T = r.turn;
  // 1. the engine's own invariants
  for (const v of V.validate(s)) add('invariant', n, v);
  // 2. text anomalies in everything the player reads
  for (const x of textsOf(T)) { const m = TEXT_BAD.exec(x); if (m) add('text', n, `"${m[0]}" in: ${x.slice(0, 160)}`); }
  // 3. numbers
  for (const h of Object.values(s.houses)) { for (const [k, f] of Object.entries(h.figures || {})) { const v = Number(f?.v); if (!Number.isFinite(v)) add('number', n, `${h.id}.${k} is ${f?.v}`); else if (v < 0 && k !== 'debt' && k !== 'income') add('number', n, `${h.id}.${k} is negative: ${Math.round(v)}`); else if (v > 5e7) add('number', n, `${h.id}.${k} is ${Math.round(v)}`); } if (h.status !== 'extinct' && !h.landless && h.lord && !s.characters[h.lord]?.alive && !h.regent) add('succession', n, `${h.id}: lord ${h.lord} is dead and no regent or successor`); }
  for (const l of Object.values(s.holdings)) { if (!Number.isFinite(l.population) || l.population < 0) add('number', n, `${l.id} population ${l.population}`); if (!Number.isFinite(l.prosperity) || !Number.isFinite(l.unrest)) add('number', n, `${l.id} prosperity/unrest ${l.prosperity}/${l.unrest}`); }
  for (const p of Object.values(s.parties)) { if (!Number.isFinite(p.men) || p.men < 0) add('number', n, `party ${p.id} men ${p.men}`); if (!p.pos || !Number.isFinite(p.pos[0])) add('party', n, `party ${p.id} has no position`); }
  { const broke = Object.values(s.houses).filter((h) => h.status !== 'extinct' && Number(h.figures?.treasury?.v) <= 0).length; const deficit = Object.values(s.houses).filter((h) => Number(h.figures?.income?.v) < 0).length; (stats.broke = stats.broke || []).push(broke); (stats.deficit = stats.deficit || []).push(deficit); }
  // 4. people
  const alive = Object.values(s.characters).filter((c) => c.alive); stats.alive.push(alive.length);
  for (const c of alive) { if (c.age != null && c.age > 105) add('person', n, `${c.name} is ${c.age} and alive`); if (!c.loc) add('person', n, `${c.name} is alive and nowhere`); }
  const inParty = {}; for (const p of Object.values(s.parties)) for (const m of p.members || []) { if (inParty[m] && inParty[m] !== p.id) add('person', n, `${s.characters[m]?.name || m} is in two parties: ${inParty[m]} and ${p.id}`); inParty[m] = p.id; }
  // 5. the story against the world (the coherence check, per turn on the new part)
  // 6. conquest and war
  if (prev) { let flips = 0; for (const l of Object.values(s.holdings)) if (prev.holdings[l.id] && prev.holdings[l.id] !== l.owner) { flips++; add('conquest', n, `${l.id}: ${prev.holdings[l.id]} → ${l.owner}`); } stats.flips += flips; }
  prev = { holdings: Object.fromEntries(Object.values(s.holdings).map((l) => [l.id, l.owner])) };
  stats.wars.push((s.wars || []).filter((w) => w.status !== 'ended').length);
  // 7. the player's own house: its own numbers move sanely
  const me = s.houses[s.meta.player]; if (me) { const g = Number(me.figures?.treasury?.v); if (n > 1 && (g < 0)) add('player', n, `the player's treasury is ${Math.round(g)}`); }
}
// the whole-game checks
const g = Co.readGame(game, id); const co = Co.coherence(g);
for (const x of co.A) add('coherence-A', x.turn ?? 0, `${x.rule}: ${x.text}`);
for (const x of co.B) add('coherence-B', x.turn ?? 0, `${x.rule}: ${x.text}`);
// acts by a lord while he is on the road (between his party's setting out and its arrival)
{ const ACT = new Set(['feast', 'tourney', 'judgement', 'gift', 'works_begun', 'tax_changed', 'grain_bought', 'bribe', 'embargo', 'loan_taken', 'levies_called', 'petition', 'office_granted']);
  const sorted = [...g.facts].sort((a, b) => (a.day ?? 0) - (b.day ?? 0));
  const open = new Map(); // party -> { from, who:Set }
  for (const f of sorted) {
    const party = f.data?.party;
    if (f.kind === 'set_out' && party) open.set(party, { from: f.day, who: new Set(f.actors || []), leader: f.actors?.[0] });
    else if ((f.kind === 'arrived' || f.kind === 'turned_back' || f.kind === 'host_disbanded') && party) open.delete(party);
    else if (ACT.has(f.kind) && f.actors?.[0]) { for (const [p, o] of open) if (o.who.has(f.actors[0]) && f.day > o.from) { const nm = g.state.characters[f.actors[0]]?.name || f.actors[0]; add('act-on-the-road', f.turn ?? 0, nm + ' ' + f.kind + ' on day ' + f.day + ' (' + String(f.text || '').slice(0, 90) + ') while party ' + p + ' set out on day ' + o.from + ' is on the road'); break; } }
  } }
const cs = {}; for (const x of co.C) cs[x.rule] = (cs[x.rule] || 0) + 1;
const heads = {}; for (const t of g.turns) for (const e of t.events || []) if (!e.bg) { const h = String(e.headline || e.title || ''); heads[h] = (heads[h] || 0) + 1; }
const topHeads = Object.entries(heads).sort((a, b) => b[1] - a[1]).slice(0, 12);
const kinds = {}; for (const f of g.facts) kinds[f.kind] = (kinds[f.kind] || 0) + 1;
// who holds what at the end, deaths, wars
const s = g.state; stats.houses = Object.keys(s.houses).length; stats.deaths = g.facts.filter((f) => ['death', 'slain_in_battle', 'executed'].includes(f.kind)).length; stats.births = g.facts.filter((f) => f.kind === 'birth').length;
const out = { house, seed: Number(seed), turns: g.turns.length, findings, coherenceC: cs, topHeads, kinds, stats: { ...stats, turnMsMean: Math.round(stats.turnMs.reduce((a, b) => a + b, 0) / Math.max(1, stats.turnMs.length)), turnMsLast: stats.turnMs.at(-1), brokeMax: Math.max(...(stats.broke || [0])), brokeLast: (stats.broke || []).at(-1), deficitLast: (stats.deficit || []).at(-1), broke: undefined, deficit: undefined, aliveFirst: stats.alive[0], aliveLast: stats.alive.at(-1), turnMs: undefined, alive: undefined }, ending: { treasury: Math.round(Number(s.houses[house]?.figures?.treasury?.v)), levies: Math.round(Number(s.houses[house]?.figures?.levies?.v)), lord: s.houses[house]?.lord, date: s.meta.date } };
fs.mkdirSync(BH_OUT, { recursive: true });
fs.writeFileSync(`${BH_OUT}/soak-${house}-${seed}.json`, JSON.stringify(out, null, 1));
console.log(house, seed, 'turns', out.turns, 'findings', findings.length, JSON.stringify(findings.reduce((a, f) => ((a[f.rule] = (a[f.rule] || 0) + 1), a), {})));
fs.rmSync(process.env.WC_SAVES, { recursive: true, force: true });
