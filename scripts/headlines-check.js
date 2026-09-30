// Owner check for the headlines (docs/gdd/18-headlines.md §5 N10): plays a few weeks of a house on the mock, then tells each week
// with the model in config.json — the same call the game makes — and prints, story by story, the writer's card (what the game
// says when the model is off), what the model wrote, whether the validator took it, and why not. It never runs in CI.
//
//   node scripts/headlines-check.js [--house stark] [--weeks 5] [--seed 7] [--mode scenes|cards] [--raw] [--url http://127.0.0.1:8096/v1] [--model maester-12b]
//
// --raw also prints the model's reply as it came. The verdict at the end is the owner's gate: at least 90 % of the stories the
// model was asked for pass on the first telling, and none of the cards that reach the player has a ledger phrase in it.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]] : a), []));
process.env.WC_SAVES = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-headlines-'));
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const { loadConfig } = await imp('server/llm.js');
const cfg = { ...loadConfig(), ...(args.url ? { baseUrl: args.url, provider: 'openai' } : {}), ...(args.model ? { model: args.model } : {}), ...(args.mode ? { narratorMode: args.mode } : {}) };
if (cfg.provider === 'mock') { console.log('config.json names no model (provider "mock"): the writer would tell everything. Point it at the llama-swap endpoint, or pass --url and --model.'); process.exit(0); }
const { bundles } = await imp('bench/lib/narrate.js');
const { narrateTurn } = await imp('server/narrator.js');
const { cardOf } = await imp('public/js/engine/facts/headline.js');
const { BOILERPLATE, JARGON } = await imp('public/data/style.js');
const BAD = [...BOILERPLATE, ...JARGON].map((p) => new RegExp(p, 'i'));

const house = String(args.house || 'stark'); const weeks = Number(args.weeks || 5); const seed = Number(args.seed || 7);
console.log(`Playing ${weeks} weeks of House ${house} on the mock (seed ${seed}); the model is ${cfg.model || '(server default)'} at ${cfg.baseUrl}\n`);
const suite = [{ file: 'check', games: [{ id: `${house}-check`, house, seed, span: '7d', orders: { 1: house === 'stark' ? ['Call the banners to Winterfell.'] : [] }, tell: Array.from({ length: weeks }, (_, k) => k + 1) }] }];
const list = await bundles({ suites: suite });
const t = { asked: 0, first: 0, again: 0, plain: 0, written: 0, ledger: 0, ms: 0, cards: 0 };
for (const b of list) {
  const replies = [];
  const t0 = Date.now();
  const r = await narrateTurn(b.state, b.cards, { provider: cfg.provider, cfg, log: (kind, messages, reply) => { if (kind === 'narrate') replies.push(reply); } });
  const ms = Date.now() - t0; t.ms += ms;
  const rec = r.record; t.asked += rec.asked?.length || 0; t.again += rec.again; t.plain += rec.plain; t.written += rec.written;
  t.first += (rec.asked?.length || 0) - (rec.via === 'fallback' ? rec.asked.length : rec.via === 'model' ? rec.again : rec.plain);
  console.log(`━━ week ${b.turn} — ${rec.stories} stories, ${rec.asked?.length || 0} asked of the model (${(ms / 1000).toFixed(1)} s): told ${rec.told}, told again ${rec.again}, left to the writer ${rec.plain}, written ${rec.written}${rec.faults?.length ? `\n   the validator said: ${rec.faults.join(' | ')}` : ''}`);
  for (const c of r.cards.filter((x) => x.narrated)) {
    t.cards++; if (BAD.some((re) => re.test(`${c.headline} ${c.summary}`))) t.ledger++;
    const story = { facts: c.facts.map((id) => b.state.facts.find((f) => f.id === id)).filter(Boolean), houses: c.houses, place: c.where };
    const w = cardOf(b.state, story);
    const same = w.headline === c.headline && w.summary === c.summary;
    console.log(`  [${c.tier} ${c.told}] ${c.headline}\n      ${c.summary}${c.scene ? `\n      scene: ${c.scene}` : ''}${!same && c.told === 'model' ? `\n      (the writer's: ${w.headline} — ${w.summary})` : ''}`);
  }
  console.log(`  meanwhile: ${r.meanwhile}`);
  if (args.raw) for (const x of replies) console.log(`  RAW: ${String(x).slice(0, 1500)}`);
}
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)} %` : '—');
console.log(`\nVerdict — ${list.length} weeks, ${t.asked} stories asked of the model, ${(t.ms / 1000 / Math.max(1, list.length)).toFixed(1)} s a week`);
console.log(`  passed on the first telling: ${t.first}/${t.asked} (${pct(t.first, t.asked)}; the gate is 90 %) ${t.asked && t.first / t.asked >= 0.9 ? '✓' : '✗'}`);
console.log(`  told again: ${t.again} · left to the writer after a failure: ${t.plain} · written without asking: ${t.written}`);
console.log(`  ledger phrases in the ${t.cards} cards that reach the player: ${t.ledger} ${t.ledger ? '✗' : '✓'}`);
process.exit(0);
