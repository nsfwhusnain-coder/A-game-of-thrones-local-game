// The soak (docs/gdd/15-qa-tooling.md §1, §7): many turns of several houses on the mock provider, with a player who
// calls the banners, marches, sends riders and recalls them, and the invariants of 03 §14 checked after every turn —
// and the history kept true: every card the engine tells is backed by a fact, every fact well formed and unique.
// Also reports the time a turn takes and how big the save grows. Exits 1 if any invariant broke.
//   node scripts/soak.js [--turns 200] [--houses stark,lannister,tully,greyjoy,martell,tyrell] [--span auto] [--seed N] [--report file.md]
// Every game's seed is printed: `--seed N --houses <house>` plays the very same game again, to the very same failure.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]] : a), []));
process.env.WC_PROVIDER = 'mock';
process.env.WC_SAVES = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-soak-'));
const game = await import('../server/game.js');
const { validate } = await import('../public/js/engine/state/validate.js');
const { KINDS } = await import('../public/js/engine/facts/kinds.js');
const { scoreCard } = await import('../server/ai/validate/headline.js');

const TURNS = Number(args.turns || 200);
const HOUSES = String(args.houses || 'stark,lannister,tully,greyjoy,martell,tyrell').split(',');
const SPAN = String(args.span || 'auto');
// --quiet prints only what went wrong and the verdict
const lines = []; const log = (s, loud = false) => { lines.push(s); if (!args.quiet || loud) console.log(s); };
let broken = 0;

// what a player does, turn by turn: the same few kinds of order every house can give
function play(id, t) {
  const s = game.loadState(id); const p = s.meta.player; const me = s.houses[p];
  const mine = Object.values(s.characters).filter((c) => c.alive && c.house === p && c.id !== me.lord && c.age >= 16 && c.status === 'free');
  const holds = Object.values(s.holdings).filter((h) => h.owner === p || s.houses[h.owner]?.liege === p);
  const pick = (a) => a[(t * 7 + a.length) % Math.max(1, a.length)];
  try {
    if (t === 1) game.act(id, { kind: 'call_banners', vassals: Object.values(s.houses).filter((h) => h.liege === p).map((h) => h.id), at: me.seat, ownLevies: 2000 });
    const hosts = Object.values(s.parties).filter((a) => a.owner === p && a.kind === 'host' && a.men > 0);
    if (t % 5 === 3 && hosts.length) game.act(id, { kind: 'march', army: hosts[0].id, to: pick(holds)?.id || me.seat });
    if (t % 11 === 7 && hosts.length > 1) game.act(id, { kind: 'recall', army: hosts.at(-1).id });
    if (t % 4 === 2 && mine.length) return [{ id: `s${t}`, text: `Send ${pick(mine).name} to ${pick(holds)?.name || s.holdings[me.seat]?.name}.` }];
    if (t % 9 === 5) { const r = Object.values(s.parties).find((x) => x.kind === 'rider' && x.owner === p); if (r) game.act(id, { kind: 'recall', character: r.commander }); }
  } catch (e) { log(`  (turn ${t}: ${e.message})`); } // an order the rules refuse is part of play, not a failure
  return null;
}

log(`# Soak — ${HOUSES.length} houses × ${TURNS} turns (mock provider, span ${SPAN}) — ${new Date().toISOString().slice(0, 16)}\n`);
const t0 = Date.now(); const summary = [];
for (const house of HOUSES) {
  const seed = args.seed != null && args.seed !== true ? Number(args.seed) : (Date.now() ^ (house.length * 2654435761)) >>> 0;
  const { id } = game.newGame('agot_298', house, { seed });
  log(`- ${house}: seed ${seed}`);
  const times = []; let first = null;
  // the headlines (18 §5 N6): every card the narrator or the writer tells passes the scorer, and how many facts a card holds
  const factsById = new Map(); let cardsTold = 0, factsTold = 0, cardFaults = 0;
  for (let t = 1; t <= TURNS; t++) {
    const orders = play(id, t);
    const a = Date.now();
    const { turn } = await game.advance(id, { span: SPAN, ...(orders ? { orders } : {}) });
    times.push(Date.now() - a);
    const unbacked = turn.events.filter((e) => !e.fact && !e.story && !e.orderId);
    if (unbacked.length) { broken += unbacked.length; log(`- ${house} turn ${t}: ${unbacked.length} card(s) with no fact behind them — ${unbacked.slice(0, 3).map((e) => e.title).join('; ')}`, true); }
    const s = game.loadState(id);
    for (const f of game.readFacts(id, { from: t, to: t })) factsById.set(f.id, f);
    for (const e of turn.events.filter((x) => x.narrated && !x.bg)) {
      const fs_ = (e.facts || []).map((x) => factsById.get(x)).filter(Boolean); if (!fs_.length) continue;
      cardsTold++; factsTold += fs_.length;
      const r = scoreCard({ headline: e.headline, summary: e.summary }, { facts: fs_, actors: [...new Set(fs_.flatMap((f) => f.actors || []))], houses: e.houses, place: e.where }, s);
      if (!r.pass && args.debug) console.log("   ", JSON.stringify(fs_.map((f) => ({ kind: f.kind, data: f.data, place: f.place, houses: f.houses }))).slice(0, 600), JSON.stringify(Object.values(s.parties).filter((p) => fs_.some((f) => f.data?.party === p.id)).map((p) => [p.id, p.name])));
      if (!r.pass) { broken++; cardFaults++; log(`- ${house} turn ${t}: a card fails the scorer [${r.faults}] (${r.detail.map((d) => d.text).join("; ")}) — "${e.headline}" / "${e.summary}"`, true); }
    }
    const problems = validate(s);
    if (problems.length) { broken += problems.length; if (!first) first = { t, problems }; log(`- ${house} turn ${t} (${s.meta.date.day}/${s.meta.date.month}/${s.meta.date.year}): ${problems.length} broken — ${problems.slice(0, 5).join('; ')}`, true); }
    if (s.outcome) { log(`- ${house}: the tale ended on turn ${t} (${s.outcome.title})`); break; }
  }
  const s = game.loadState(id);
  const size = fs.statSync(path.join(process.env.WC_SAVES, id, 'state.json')).size;
  // the fact log: every line a fact of a known kind, every id once, the turns in order
  const facts = game.readFacts(id, { limit: 1e9 }); const seen = new Set(); let last = 0;
  for (const f of facts) {
    const bad = !KINDS[f.kind] ? `unknown kind ${f.kind}` : seen.has(f.id) ? `${f.id} twice` : f.turn < last ? `${f.id} out of order` : !f.text || /undefined|NaN/.test(f.text) ? `${f.id} says "${f.text}"` : null;
    if (bad) { broken++; log(`- ${house}: fact log — ${bad}`, true); }
    seen.add(f.id); last = f.turn;
  }
  const logSize = fs.statSync(path.join(process.env.WC_SAVES, id, 'facts.jsonl')).size;
  // the living society (09 §3): lords riding out on their own business, at least five a moon realm-wide
  const days = Math.max(1, (facts.at(-1)?.day ?? 0) - (facts[0]?.day ?? 0));
  const journeys = facts.filter((f) => f.kind === 'set_out' && f.data?.why && !f.data?.returning).length;
  const perMoon = journeys / (days / 30);
  if (days >= 60 && perMoon < 5) { broken++; log(`- ${house}: only ${perMoon.toFixed(1)} journeys a moon (09 §3 wants at least 5)`, true); }
  const avg = times.reduce((x, y) => x + y, 0) / times.length; const max = Math.max(...times);
  summary.push({ house, journeys: perMoon, turns: times.length, date: `${s.meta.date.day}/${s.meta.date.month}/${s.meta.date.year}`, avg, max, size, parties: Object.keys(s.parties).length, first, facts: facts.length, logSize });
  log(`- ${house}: ${times.length} turns to ${s.meta.date.day}/${s.meta.date.month}/${s.meta.date.year}, ${Math.round(avg)} ms a turn (max ${max}), save ${(size / 1024).toFixed(0)} KB, ${facts.length} facts (${(logSize / 1024).toFixed(0)} KB), ${Object.keys(s.parties).length} parties, ${perMoon.toFixed(1)} journeys a moon, ${(cardsTold / Math.max(1, times.length)).toFixed(1)} cards a turn of ${(factsTold / Math.max(1, cardsTold)).toFixed(1)} facts${cardFaults ? `, ${cardFaults} FAIL THE SCORER` : ''}${first ? `, FIRST BROKEN ON TURN ${first.t}` : ', every invariant held'}`);
}
log(`\n| house | turns | reached | ms/turn | max ms | save | facts | parties | invariants |\n|---|---|---|---|---|---|---|---|---|`);
for (const x of summary) log(`| ${x.house} | ${x.turns} | ${x.date} | ${Math.round(x.avg)} | ${x.max} | ${(x.size / 1024).toFixed(0)} KB | ${x.facts} (${(x.logSize / 1024).toFixed(0)} KB) | ${x.parties} | ${x.first ? `broken on turn ${x.first.t}` : 'held'} |`);
log(`\n${broken ? `✖ ${broken} broken invariant(s)` : '✔ every invariant held every turn'} — ${((Date.now() - t0) / 1000).toFixed(0)} s in all`, true);
if (args.report) fs.writeFileSync(args.report, lines.join('\n') + '\n');
fs.rmSync(process.env.WC_SAVES, { recursive: true, force: true });
process.exit(broken ? 1 : 0);
