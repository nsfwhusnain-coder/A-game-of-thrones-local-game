// The coherence checker, on a game (docs/gdd/15-qa-tooling.md §3): does the story the game told agree with the world it kept?
//   node scripts/coherence.js <save-id>                    check a save in saves/ (or --saves <dir>)
//   node scripts/coherence.js --play stark --turns 12      play a game on the mock first (--seed N, --span 7d), then check it
//   add --json for the data, --out <file> to write the report, --limit N for how many of each kind to list
// Exit status 1 when Class A is not zero or Class B is over one in ten turns, so a script can gate on it. Nothing here asks a model (--play is on the mock unless you pass --live).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]] : a), []));
const id0 = process.argv.slice(2).find((x, i, all) => !x.startsWith('--') && !(all[i - 1] || '').startsWith('--'));
if (!args.play && !id0) { console.log('node scripts/coherence.js <save-id> [--saves dir] | --play <house> [--turns 12] [--seed 7] [--span 7d]   [--json] [--out file] [--limit 40]'); process.exit(2); }

const { coherence, coherenceReport, verdict, readGame } = await import(pathToFileURL(path.join(ROOT, 'bench', 'lib', 'coherence.js')).href);
let game, id, dispose = () => {};
if (args.play) {
  if (!args.live) process.env.WC_PROVIDER = 'mock'; // a check of the game's coherence needs no model, and must not borrow the owner's
  const { sandbox } = await import(pathToFileURL(path.join(ROOT, 'bench', 'lib', 'sandbox.js')).href);
  const sb = await sandbox({ root: ROOT, prefix: 'wc-coherence-' }); game = sb.game; dispose = sb.dispose;
  const house = typeof args.play === 'string' ? args.play : 'stark';
  ({ id } = game.newGame('agot_298', house, { seed: Number(args.seed) || 7 }));
  for (let t = 1; t <= (Number(args.turns) || 12); t++) { await game.advance(id, { span: args.span || '30d' }); await game.settled(id); }
} else {
  if (args.saves) process.env.WC_SAVES = path.resolve(String(args.saves));
  game = await import(pathToFileURL(path.join(ROOT, 'server', 'game.js')).href); id = id0;
  if (!fs.existsSync(path.join(game.SAVES, id, 'state.json'))) { console.error(`No save "${id}" in ${game.SAVES}`); process.exit(2); }
}
const g = readGame(game, id); const r = coherence(g); const v = verdict(r);
if (args.json) console.log(JSON.stringify({ id, verdict: v, ...r }));
else {
  const text = coherenceReport(r, { title: `Coherence — House ${g.state.houses[g.state.meta.player]?.name || g.state.meta.player}, ${id}`, limit: Number(args.limit) || 40 });
  console.log(text);
  if (typeof args.out === 'string') { fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true }); fs.writeFileSync(args.out, text + '\n'); console.log(`Written to ${args.out}`); }
}
dispose();
process.exitCode = v.pass ? 0 : 1;
