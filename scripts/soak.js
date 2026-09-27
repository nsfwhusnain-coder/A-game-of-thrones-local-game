// The soak (docs/gdd/15-qa-tooling.md §1, §7): many turns of several houses on the mock provider, with a player who
// calls the banners, marches, sends riders and recalls them, and the invariants of 03 §14 checked after every turn.
// Also reports the time a turn takes and how big the save grows. Exits 1 if any invariant broke.
//   node scripts/soak.js [--turns 200] [--houses stark,lannister,tully,greyjoy,martell,tyrell] [--span auto] [--report file.md]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]] : a), []));
process.env.WC_PROVIDER = 'mock';
process.env.WC_SAVES = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-soak-'));
const game = await import('../server/game.js');
const { validate } = await import('../public/js/engine/state/validate.js');

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
  const { id } = game.newGame('agot_298', house);
  const times = []; let first = null;
  for (let t = 1; t <= TURNS; t++) {
    const orders = play(id, t);
    const a = Date.now();
    await game.advance(id, { span: SPAN, ...(orders ? { orders } : {}) });
    times.push(Date.now() - a);
    const s = game.loadState(id);
    const problems = validate(s);
    if (problems.length) { broken += problems.length; if (!first) first = { t, problems }; log(`- ${house} turn ${t} (${s.meta.date.day}/${s.meta.date.month}/${s.meta.date.year}): ${problems.length} broken — ${problems.slice(0, 5).join('; ')}`, true); }
    if (s.outcome) { log(`- ${house}: the tale ended on turn ${t} (${s.outcome.title})`); break; }
  }
  const s = game.loadState(id);
  const size = fs.statSync(path.join(process.env.WC_SAVES, id, 'state.json')).size;
  const avg = times.reduce((x, y) => x + y, 0) / times.length; const max = Math.max(...times);
  summary.push({ house, turns: times.length, date: `${s.meta.date.day}/${s.meta.date.month}/${s.meta.date.year}`, avg, max, size, parties: Object.keys(s.parties).length, first });
  log(`- ${house}: ${times.length} turns to ${s.meta.date.day}/${s.meta.date.month}/${s.meta.date.year}, ${Math.round(avg)} ms a turn (max ${max}), save ${(size / 1024).toFixed(0)} KB, ${Object.keys(s.parties).length} parties${first ? `, FIRST BROKEN ON TURN ${first.t}` : ', every invariant held'}`);
}
log(`\n| house | turns | reached | ms/turn | max ms | save | parties | invariants |\n|---|---|---|---|---|---|---|---|`);
for (const x of summary) log(`| ${x.house} | ${x.turns} | ${x.date} | ${Math.round(x.avg)} | ${x.max} | ${(x.size / 1024).toFixed(0)} KB | ${x.parties} | ${x.first ? `broken on turn ${x.first.t}` : 'held'} |`);
log(`\n${broken ? `✖ ${broken} broken invariant(s)` : '✔ every invariant held every turn'} — ${((Date.now() - t0) / 1000).toFixed(0)} s in all`, true);
if (args.report) fs.writeFileSync(args.report, lines.join('\n') + '\n');
fs.rmSync(process.env.WC_SAVES, { recursive: true, force: true });
process.exit(broken ? 1 : 0);
