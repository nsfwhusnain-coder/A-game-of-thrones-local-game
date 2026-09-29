// Records the audit's real turns as fixtures (docs/gdd/18-headlines.md §1; tests/clusters.test.js, tests/writer.test.js).
// Not a test and not run by CI: `WC_PROVIDER=mock node tests/fixtures/headlines/turns/record.mjs` plays Stark, seed 7,
// six turns of span "auto" on the mock provider (no model, no network) twice — once with no orders, once with the call of
// the banners in the first turn — and writes stark-quiet-6.json and stark-muster-6.json beside this file.
// Per turn: `clock` (as engine/facts/log.js reads it: day 1 of the turn is `from`), `facts` (the facts of the turn's non-bg
// cards: what server/narrator.js hands to clusterFacts; a fact whose card news reached late carries the card's `heard`
// and `late`, as engine/knowledge.js holdNews stamps them), `small` (the facts of its bg cards: the Meanwhile) and
// `parties` (the hosts the facts name: raised in play, so the initial state does not have them).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.env.WC_PROVIDER = 'mock';
process.env.WC_SAVES = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-record-'));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const game = await import(pathToFileURL(path.join(root, 'server', 'game.js')).href);
const { dayNumber } = await import(pathToFileURL(path.join(root, 'public', 'js', 'engine', 'time.js')).href);
const SEED = 7;
const line = (x) => JSON.stringify(x);

async function record(orders) {
  const { id } = game.newGame('agot_298', 'stark', { seed: SEED });
  const turns = [];
  for (let n = 1; n <= 6; n++) {
    const d0 = dayNumber(game.loadState(id).meta.date);
    const { turn } = await game.advance(id, { span: 'auto', orders: n === 1 ? orders : [] }); await game.settled(id);
    const state = game.loadState(id);
    const all = new Map(game.readFacts(id, { limit: 20000 }).map((f) => [f.id, f]));
    const idsOf = (c) => (c.facts?.length ? c.facts : c.fact ? [c.fact] : []);
    const grab = (cards) => {
      const seen = new Set(); const out = [];
      for (const c of cards) for (const fid of idsOf(c)) {
        const f = all.get(fid); if (!f || seen.has(fid)) continue; seen.add(fid);
        const x = { ...f }; delete x.vis; if (c.heard) x.heard = c.heard; if (c.late) x.late = true; out.push(x);
      }
      return out;
    };
    const facts = grab(turn.events.filter((e) => !e.bg)); const small = grab(turn.events.filter((e) => e.bg));
    const parties = {};
    const walk = (v) => {
      if (typeof v === 'string') { const p = state.parties[v]; if (p) parties[v] = { id: p.id, name: p.name, owner: p.owner, kind: p.kind, commander: p.commander || null }; }
      else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    for (const f of [...facts, ...small]) walk(f.data);
    turns.push({ turn: turn.turn, dateFrom: turn.dateFrom, date: turn.date, clock: { turn: turn.turn, from: d0 + 1, to: dayNumber(state.meta.date) }, parties, facts, small });
  }
  return turns;
}

const note = 'Recorded by tests/fixtures/headlines/turns/record.mjs: server/game.js on WC_PROVIDER=mock, Stark, seed 7, game.advance(id, { span: "auto" }) six times, orders only in turn 1. facts = the facts of the turn\'s non-bg cards (what server/narrator.js hands to clusterFacts), small = the facts of its bg cards (the Meanwhile), parties = the hosts the facts name.';
for (const [name, orders] of [['stark-quiet-6', []], ['stark-muster-6', [{ text: 'Call the banners to Winterfell.' }]]]) {
  const turns = await record(orders);
  const body = turns.map((t) => `  { "turn": ${t.turn}, "dateFrom": ${line(t.dateFrom)}, "date": ${line(t.date)}, "clock": ${line(t.clock)},\n    "parties": ${line(t.parties)},\n    "facts": [\n${t.facts.map((f) => `      ${line(f)}`).join(',\n')}\n    ],\n    "small": [\n${t.small.map((f) => `      ${line(f)}`).join(',\n')}\n    ] }`).join(',\n');
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), `${name}.json`);
  fs.writeFileSync(file, `{ "note": ${line(note)}, "seed": ${SEED}, "house": "stark", "orders": ${line(orders)},\n  "turns": [\n${body}\n  ] }\n`);
  console.log(`wrote ${path.relative(root, file)}: ${turns.map((t) => `T${t.turn} ${t.facts.length}+${t.small.length}`).join(', ')}`);
}
