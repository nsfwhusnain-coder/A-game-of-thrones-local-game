// usage: node dump.mjs <root> <out.json> <turns> <house> <seed>
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const [root, out, turnsA, house, seedA] = process.argv.slice(2);
process.env.WC_PROVIDER = 'mock';
process.env.WC_SAVES = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-dump-'));
const imp = (p) => import(pathToFileURL(path.join(root, p)).href);
const game = await imp('server/game.js');
const TURNS = Number(turnsA); const seed = Number(seedA);
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
  } catch (e) { /* refused */ }
  return null;
}
const { id } = game.newGame('agot_298', house, { seed });
for (let t = 1; t <= TURNS; t++) {
  const orders = play(id, t);
  const { turn } = await game.advance(id, { span: 'auto', ...(orders ? { orders } : {}) });
  const s = game.loadState(id); if (s.outcome) break;
}
const facts = game.readFacts(id, { limit: 1e9 });
fs.writeFileSync(out, JSON.stringify(facts));
const s = game.loadState(id);
fs.writeFileSync(out.replace('.json', '.state.json'), JSON.stringify(s));
console.log(house, seed, facts.length, 'facts');
fs.rmSync(process.env.WC_SAVES, { recursive: true, force: true });
