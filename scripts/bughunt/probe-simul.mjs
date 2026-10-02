// Bug hunt: one person doing two things that cannot both be true. Usage: node probe-simul.mjs <house> <seed> <turns> [span]
// Reads a mock game's facts and each turn's end state for: a lord who hosts, judges or builds while a march of his is on the road; a tourney whose host is
// away on a progress; a man at a feast or a wedding who is, that day, a day's ride out on the road; the held and the dead in command; a lord of one house who
// commands another's host; and a man in two parties.
import { BH_OUT, REPO } from './paths.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
const [house = 'stark', seed = '100', turns = '20', span = '30d'] = process.argv.slice(2);
process.env.WC_PROVIDER = 'mock'; process.env.WC_SAVES = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-bh-sim-'));
const im = (p) => import(pathToFileURL(`${REPO}/${p}`).href);
const game = await im('server/game.js'); const Co = await im('bench/lib/coherence.js'); const { dayNumber } = await im('public/js/engine/time.js');
const { id } = game.newGame('agot_298', house, { seed: Number(seed) });
const out = {}; const add = (rule, t) => { (out[rule] = out[rule] || new Set()).add(t); };
for (let n = 1; n <= Number(turns); n++) {
  await game.advance(id, { span }); await game.settled(id);
  const s = game.loadState(id); const C = s.characters; const now = dayNumber(s.meta.date); const nm = (i) => C[i]?.name || i;
  const where = (p) => (p.at == null ? 'on the road' : s.holdings[p.at]?.name || p.at);
  const partyOf = new Map(); // a man in two parties
  for (const p of Object.values(s.parties || {})) for (const m of p.members || []) { if (partyOf.has(m) && partyOf.get(m) !== p.id) add('two-parties', `${nm(m)} is in ${partyOf.get(m)} and ${p.id} (turn ${n})`); partyOf.set(m, p.id); }
  for (const p of Object.values(s.parties || {})) {
    const c = C[p.commander]; if (!c) continue;
    if (!c.alive) add('dead-commands', `${c.name} (dead) commands ${p.name} (turn ${n})`);
    else if (/imprisoned|captive|hostage/.test(c.status || '') && c.house === p.owner) add('held-commands', `${c.name} (${c.status}) commands ${p.name}, ${where(p)} (turn ${n})`);
    if (c.alive && c.house !== p.owner && s.houses[c.house] && p.owner !== s.houses[c.house]?.liege && s.houses[p.owner]?.liege !== c.house) add('foreign-commander', `${c.name} of ${c.house} commands ${p.name} of ${p.owner} (turn ${n})`);
    if (c.alive && !(p.members || []).includes(c.id) && p.at == null) add('commander-not-with-host', `${c.name} commands ${p.name} on the road but is not among its members (turn ${n})`);
  }
  for (const [seat, L] of Object.entries(s.plots?.lists || {})) {
    const lord = C[s.houses[L.house]?.lord]; const p = lord && s.parties[partyOf.get(lord.id)];
    if (p && p.at == null && L.on > now) add('tourney-host-away', `${lord.name} is ${p.kind === 'progress' ? 'on a progress' : 'on the road'} (${p.name}) while the lists at ${s.holdings[seat]?.name || seat} wait for day ${L.on - now} from now (turn ${n})`);
    if (lord && !lord.alive && L.on > now) add('tourney-host-dead', `${lord.name} is dead and the lists at ${seat} are pending (turn ${n})`);
  }
  for (const h of Object.values(s.houses)) { const l = C[h.lord]; if (h.lord && (!l || !l.alive) && !['company', 'tribe'].includes(h.rank)) add('dead-lord', `${h.id}: lord ${h.lord} is ${l ? 'dead' : 'missing'} (turn ${n})`); }
}
const g = Co.readGame(game, id); const C = g.state.characters; const nm = (i) => C[i]?.name || i; const facts = [...g.facts].sort((a, b) => (a.day ?? 0) - (b.day ?? 0));
const road = new Map(); // person -> { party, from, since, to }
for (const f of facts) {
  const a = f.actors?.[0]; const p = f.data?.party;
  if (f.kind === 'set_out' && a && p && !f.data?.returning) road.set(a, { party: p, since: f.day, from: f.place, to: f.data?.to, text: f.text });
  if (['arrived', 'returned', 'turned_back', 'host_disbanded', 'host_joined', 'rout'].includes(f.kind) && p) for (const [who, r] of road) if (r.party === p) road.delete(who);
  if (f.kind === 'arrived' && f.data?.joined && a) road.delete(a); // a man who joins another host is on its road now, not his own
  if (['tourney', 'feast', 'judgement', 'works_begun', 'tax_changed', 'wedding'].includes(f.kind)) {
    for (const who of f.kind === 'wedding' ? (f.actors || []) : [a]) {
      const r = road.get(who); if (!r || f.day <= r.since + 1) continue;
      add('acts-on-the-road', `${nm(who)} ${f.kind} at ${f.place} on day ${f.day}, while on the road since day ${r.since} (${String(r.text || '').slice(0, 70)})`);
    }
  }
}
const res = Object.fromEntries(Object.entries(out).map(([r, v]) => [r, [...v]]));
fs.writeFileSync(`${BH_OUT}/simul-${house}-${seed}.json`, JSON.stringify(res, null, 1));
for (const [r, v] of Object.entries(res)) { console.log('##', r, v.length); for (const t of v.slice(0, 6)) console.log('   ', t.slice(0, 240)); }
console.log('facts', facts.length);
fs.rmSync(process.env.WC_SAVES, { recursive: true, force: true });
