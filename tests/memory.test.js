// Memory v2 (WP B13; docs/gdd/04-ai-system.md §9): the relevant-memory block a call is given — only what the house
// knows, what touches the matter first, older facts and the chronicle's notes found by BM25, within its budget — and
// the Consolidator, whose "what happened" is the engine's and whose open threads must name what the facts name.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.WC_PROVIDER = 'mock';
process.env.WC_SAVES = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-memory-'));
const game = await import('../server/game.js');
const { relevantMemory, chronicleNotes } = await import('../server/ai/context/memory.js');
const { createInitialState } = await import('../public/js/shared/world.js');
const { dayNumber } = await import('../public/js/engine/time.js');
const { estimateTokens } = await import('../server/llm.js');
const { CALLS, readReply } = await import('../server/ai/client.js');

test.after(() => fs.rmSync(process.env.WC_SAVES, { recursive: true, force: true }));

function world() {
  const s = createInitialState('agot_298', 'stark', { seed: 298 });
  const today = dayNumber(s.meta.date);
  const f = (n, day, kind, actors, houses, place, importance, text, vis = { scope: 'public' }) => ({ id: `f0.${n}`, turn: 0, day, kind, actors, houses, place, importance, text, vis });
  s.facts = [
    f(1, today - 3, 'set_out', ['roose_bolton'], ['bolton'], 'bolton', 3, 'Roose Bolton rides out of the Dreadfort with forty men.'),
    f(2, today - 2, 'feast', ['robert_baratheon'], ['baratheon'], 'baratheon', 3, 'King Robert feasts his knights at the Red Keep.'),
    f(3, today - 1, 'scheme_discovered', ['cersei_lannister'], ['lannister', 'baratheon'], 'baratheon', 5, 'The Queen\'s letters to Casterly Rock are read by no one but her brother.', { scope: 'secret' }),
    f(4, today - 60, 'fealty_sworn', ['roose_bolton'], ['bolton', 'stark'], 'bolton', 3, 'Roose Bolton renews his oath to Winterfell at the Dreadfort, and asks for the fishing rights of the Weeping Water.'),
    f(5, today - 70, 'feast', ['walder_frey'], ['frey'], 'frey', 2, 'Walder Frey weds his seventh wife at the Twins.'),
  ];
  return s;
}

test('relevant memory: what touches the matter first, older facts by relevance, only what the house knows, within budget', () => {
  const s = world();
  const notes = chronicleNotes('# Chronicle\n\n## 1 7th moon, 298 AC — 30 7th moon, 298 AC\n### What happened\n- **3 7th moon** — Roose Bolton quarrelled with the Karstarks over the Weeping Water fishing rights.\n- **9 7th moon** — A trading fleet came to White Harbor.\n');
  assert.equal(notes.length, 2);
  const m = relevantMemory(s, { facts: s.facts, notes, house: 'bolton', actors: ['roose_bolton'], houses: ['bolton'], places: ['bolton'], words: 'the Weeping Water' });
  const lines = m.text.split('\n');
  assert.match(lines[0], /^LATELY/);
  assert.match(lines[1], /Roose Bolton rides out/, 'his own news comes first');
  assert.match(m.text, /OLDER, AS REMEMBERED:\n- [^\n]*fishing rights of the Weeping Water/, 'an old fact that bears on the words is found');
  assert.doesNotMatch(m.text, /Walder Frey weds/, 'an old fact that bears on nothing is left out');
  assert.match(m.text, /FROM THE CHRONICLE \(notes, not certain\):\n- [^\n]*Weeping Water/);
  assert.doesNotMatch(m.text, /Queen's letters/, 'a secret the house does not know is never in its memory');
  const small = relevantMemory(s, { facts: s.facts, notes, house: 'bolton', actors: ['roose_bolton'], words: 'Weeping Water', budget: 40 });
  assert.ok(estimateTokens(small.text) <= 60, small.text);
});

test('the consolidator: the engine writes what happened; an open thread that names nothing of the dossier is refused', () => {
  const s = world(); const call = CALLS.consolidate;
  const ctx = call.context(s, call.fixtureArgs(s));
  const good = readReply(JSON.stringify({ open: ['As of 4 8th moon: Greatjon Umber marches for Winterfell.'], rumours: [], summary: 'The North stirred.' }), call, ctx, call.schema(ctx));
  assert.deepEqual(good.problems, []);
  const free = readReply(JSON.stringify({ open: ['As of 4 8th moon: Greatjon Umber marches for Winterfell.', 'As of 4 8th moon: a dragon is seen over Braavos.'], rumours: [], summary: '' }), call, ctx, call.schema(ctx));
  assert.ok(free.problems.some((p) => /names no one and nowhere/.test(p)), free.problems.join('; '));
  assert.deepEqual(call.salvage(free.value, free.problems, ctx).open, ['As of 4 8th moon: Greatjon Umber marches for Winterfell.'], 'the thread that names the dossier is kept');
});

test('a game\'s chronicle is consolidated from its facts: what happened, dated, and what is still open, as of its end', async () => {
  const { id, state } = game.newGame('agot_298', 'stark', { seed: 4242 });
  const vassals = Object.values(state.houses).filter((h) => h.liege === 'stark').map((h) => h.id);
  game.act(id, { kind: 'call_banners', vassals, at: 'stark', ownLevies: 2000 });
  for (let i = 0; i < 5; i++) { await game.advance(id, { span: '14d' }); await game.settled(id); }
  const md = game.readChronicle(id);
  assert.match(md, /### What happened\n- \*\*\d+ \w+ moon, 298 AC\*\* — /);
  assert.match(md, /### Still open, as of /);
  const s = game.loadState(id);
  assert.ok(s.consolidatedThrough >= 1);
  assert.ok(s.openThreads?.items.length, 'the feed has threads to follow');
  // every thread names something real: a house, a person, a place of this world, or a matter before the lord
  const names = [...Object.values(s.houses).map((h) => h.name), ...Object.values(s.characters).map((c) => c.name), ...Object.values(s.holdings).map((h) => h.name), ...(s.decisions || []).map((d) => d.title.replace(/^./, (x) => x.toLowerCase()))];
  for (const t of s.openThreads.items) assert.ok(names.some((n) => t.includes(n)), t);
});

test('the memory the realm\'s lords are given with a live model: built from the save\'s log and chronicle, their house\'s view', async () => {
  const { id, state } = game.newGame('agot_298', 'stark', { seed: 99 });
  const vassals = Object.values(state.houses).filter((h) => h.liege === 'stark').map((h) => h.id);
  game.act(id, { kind: 'call_banners', vassals, at: 'stark', ownLevies: 2000 });
  await game.advance(id, { span: '14d' }); await game.settled(id);
  const s = game.loadState(id);
  const text = game.memoryOf(id, s)(s.characters.roose_bolton, { words: 'Winterfell and the banners' });
  assert.match(text, /^LATELY, AS IT REACHED YOU:\n- \d+ \w+ moon, 298 AC: /);
  assert.ok(estimateTokens(text) <= 1300, `${estimateTokens(text)} tokens`);
  assert.equal(game.memoryOf(id, s)(null), '');
});
