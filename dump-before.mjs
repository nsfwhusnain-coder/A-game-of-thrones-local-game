// "Before" baseline for the headline work: Stark, mock provider, 6 turns, no orders. Dumps every card verbatim.
//   WC_PROVIDER=mock node dump-before.mjs [house] [seed]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SCRATCH = path.dirname(new URL(import.meta.url).pathname);
process.env.WC_PROVIDER = 'mock';
process.env.WC_SAVES = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-dump-'));
const game = await import('/home/user/A-game-of-thrones-local-game/server/game.js');

const house = process.argv[2] || 'stark';
const seed = process.argv[3] != null ? Number(process.argv[3]) : 7; // the audit (18 §1) used seed 7
const { id } = game.newGame('agot_298', house, { seed });
const out = [];
const w = (s = '') => out.push(s);
w(`# BEFORE baseline — ${house} — seed ${seed} — mock provider — 6 turns, no orders — ${new Date().toISOString().slice(0, 16)}`);
w('');
const KNOWN = new Set(['title', 'text', 'details', 'importance', 'type', 'bg']);
const cards = [];
for (let t = 1; t <= 6; t++) {
  const r = await game.advance(id, { span: 'auto' });
  const tr = r.turn;
  w(`## Turn ${tr.turn}  (${tr.dateFrom} -> ${tr.date}, span ${tr.span}${tr.until ? `, until "${tr.until}"` : ''})`);
  w('');
  w(`### turn.summary`);
  w(tr.summary === undefined ? '(undefined)' : JSON.stringify(tr.summary));
  w('');
  w(`### turn.meanwhile`);
  w(tr.meanwhile === undefined ? '(undefined)' : JSON.stringify(tr.meanwhile));
  w('');
  w(`### turn.narration`);
  w(tr.narration === undefined ? '(undefined)' : JSON.stringify(tr.narration, null, 2));
  w('');
  w(`### turn.events (${tr.events.length}; ${tr.events.filter((e) => !e.bg).length} not bg, ${tr.events.filter((e) => e.bg).length} bg)`);
  w('');
  tr.events.forEach((e, k) => {
    cards.push({ turn: tr.turn, ...e });
    w(`#### T${tr.turn} card ${k + 1}  id=${e.id}  date=${e.date}  day=${e.day}`);
    w(`- title: ${JSON.stringify(e.title)}`);
    w(`- text: ${JSON.stringify(e.text)}`);
    w(`- details: ${e.details === undefined ? '(undefined)' : JSON.stringify(e.details)}`);
    w(`- importance: ${e.importance}   type: ${e.type}   bg: ${e.bg ? 'true' : 'false'}   text===details: ${e.text === e.details}   details startsWith text: ${typeof e.details === 'string' && e.details.startsWith(e.text || '\u0000')}`);
    const rest = Object.fromEntries(Object.entries(e).filter(([k2]) => !KNOWN.has(k2) && !['id', 'date', 'day'].includes(k2)));
    w(`- other fields: ${JSON.stringify(rest)}`);
    w('');
  });
  w('### turn.narration.problems / rejected / applied (raw)');
  w(JSON.stringify({ problems: tr.narration?.problems, rejected: tr.rejected, appliedOps: (tr.applied || []).map((a) => a.op) }));
  w('');
}
fs.writeFileSync(path.join(SCRATCH, `before-${house}-6.md`), out.join('\n') + '\n');
fs.writeFileSync(path.join(SCRATCH, `before-${house}-6.cards.json`), JSON.stringify(cards, null, 1));
console.log('wrote', path.join(SCRATCH, `before-${house}-6.md`), out.length, 'lines;', cards.length, 'cards');
