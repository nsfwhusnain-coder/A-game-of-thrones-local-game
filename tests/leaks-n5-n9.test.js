// The headlines' leaks (docs/gdd/18-headlines.md §2.3 S6, §6; 03 §14 invariant 10; WP N5, N6, N9): the words of a card, its rank, its
// details and the turn's digest are built from the facts the house may read and from what the game says of them — never from a
// truth no word of it has reached the house. Twin worlds, one with a hidden truth changed (the coffers, the musters, the secrets and
// tempers, the score of every war, the minds' counsel, the hulls and captains of hosts no eye of the house is on, the true series
// of the realm's figures), told the same visible facts, must give the same cards, ranks and digest byte for byte; and the ranking's
// memory and the model's prompt carry nothing the browser could not be sent.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.WC_PROVIDER = 'mock';
const { createInitialState } = await import('../public/js/shared/world.js');
const { clusterFacts } = await import('../public/js/engine/facts/cluster.js');
const { cardOf, meanwhileOf } = await import('../public/js/engine/facts/headline.js');
const { rankStories, noteFirsts } = await import('../public/js/engine/facts/rank.js');
const { digestOf, shapeCard } = await import('../public/js/engine/facts/digest.js');
const { forces } = await import('../public/js/engine/parties.js');
const K = await import('../public/js/engine/knowledge.js');
const { CALLS } = await import('../server/ai/calls/index.js');
const { narrateTurn } = await import('../server/narrator.js');
const { playerView, hiddenTruths } = await import('../server/view.js');

const here = path.dirname(fileURLToPath(import.meta.url));
const SET = JSON.parse(fs.readFileSync(path.join(here, 'fixtures', 'headlines', 'turns', 'stark-muster-6.json'), 'utf8'));
const clone = (x) => JSON.parse(JSON.stringify(x));
const json = (x) => JSON.stringify(x);
const stateWith = (turn) => { const s = createInitialState('agot_298', 'stark', { seed: 7 }); for (const [k, p] of Object.entries(turn.parties)) s.parties[k] = { ...p }; s.meta.clock = turn.clock; s.meta.turn = turn.turn - 1; s.firsts = {}; return s; };

// what another house could have changed in its own hall with no word reaching Stark
const HIDDEN = {
  'coffers, muster, debts, bread, hulls of other houses': (t, f) => { for (const h of Object.values(t.houses)) if (!f.has(h.id)) { for (const k of Object.keys(h.figures || {})) h.figures[k].v = 987654; h.levyCap = 1; } },
  'ledgers and taxes': (t, f) => { for (const h of Object.values(t.houses)) if (!f.has(h.id)) { h.ledger = [{ note: 'HIDDEN' }]; h.policy = { ...(h.policy || {}), tax: 'harsh' }; } },
  'secret loans': (t) => { t.economy = { ...(t.economy || {}), loans: [{ lender: 'lannister', debtor: 'tyrell', amount: 987654321, rate: 0.3, pays: 'coin' }] }; },
  'the score of every war': (t) => { for (const w of t.wars || []) w.score = 4242; },
  'unrest, ruin and garrisons of others\' lands': (t, f) => { for (const h of Object.values(t.holdings)) if (!f.has(h.owner)) Object.assign(h, { prosperity: 3, unrest: 99, devastation: 90 }); },
  'hosts no eye of Stark\'s is on: banners, captains, men': (t, f) => { for (const a of forces(t)) if (!f.has(a.owner) && !K.seesParty(t, 'stark', a)) Object.assign(a, { men: 7777, commander: 'nobody', contingents: [] }); },
  'other houses\' own knowledge and the minds': (t) => { t.knowledge = { ...t.knowledge, lannister: { parties: {}, spies: {}, facts: {}, beliefs: [{ HIDDEN: 1 }] } }; t.minds = { last: { HIDDEN: 'the Hand plots' } }; },
  'people\'s secrets, tempers and goals': (t, f) => { for (const c of Object.values(t.characters)) if (!f.has(c.house)) Object.assign(c, { secret: 'HIDDEN', stress: 99, paranoia: 99, goals: ['HIDDEN'] }); },
  'the true series of the others': (t, f) => { for (const r of t.realmStats?.samples || []) for (const h of Object.keys(r.h)) if (!f.has(h)) r.h[h] = r.h[h].map((_, i) => 987654 + i); },
};

/** Everything the headlines make of a turn's visible facts: the cards, the ranks, the Meanwhile and the digest. */
function told(state, turn, firsts) {
  state.firsts = firsts;
  const { stories, meanwhile } = clusterFacts(state, turn.facts.map((f) => ({ ...f })));
  const rows = rankStories(state, stories);
  const cards = rows.map((r) => ({ ...shapeCard({ ...cardOf(state, r.story), importance: r.story.importance, score: r.score, tier: r.tier, day: r.story.days[0] }), key: r.key }));
  const mw = meanwhileOf(state, [...meanwhile, ...turn.small]);
  return { cards, mw, digest: digestOf(cards, mw), ranks: rows.map((r) => [r.id, r.score, r.tier, r.why]), next: noteFirsts(state, rows, firsts) };
}

test('twin worlds, one with a hidden truth changed, are told the same visible facts in the same words, ranks and digest', () => {
  for (const [name, hide] of Object.entries(HIDDEN)) {
    let a = {}; let b = {};
    for (const t of SET.turns) {
      const A = stateWith(t); const B = stateWith(t);
      hide(B, K.friendsOf(B, 'stark'));
      if (t.turn === 1) assert.notEqual(json(A.houses) + json(A.characters) + json(A.holdings) + json(A.wars) + json(A.knowledge) + json(A.economy || {}) + json(A.parties) + json(A.realmStats), json(B.houses) + json(B.characters) + json(B.holdings) + json(B.wars) + json(B.knowledge) + json(B.economy || {}) + json(B.parties) + json(B.realmStats), `${name}: the mutation is real`);
      const ta = told(A, t, a); const tb = told(B, t, b);
      assert.equal(json(ta), json(tb), `${name}: turn ${t.turn}'s cards, ranks or digest moved`);
      a = ta.next; b = tb.next;
    }
  }
});

test('the model is shown what the cards say and the names the story may say — the same in twin worlds, and never a hidden truth', () => {
  for (const [name, hide] of Object.entries(HIDDEN)) {
    const t = SET.turns[0]; const A = stateWith(t); const B = stateWith(t); hide(B, K.friendsOf(B, 'stark'));
    const prompts = [A, B].map((s) => {
      const { stories } = clusterFacts(s, t.facts.map((f) => ({ ...f })));
      const ctx = CALLS.narrate.context(s, { stories, small: [], mode: 'scenes' });
      return CALLS.narrate.prompt(ctx).map((m) => m.content).join('\n');
    });
    assert.equal(prompts[0], prompts[1], `${name}: the narrator's prompt moved`);
    assert.ok(!/HIDDEN|987654|7777|4242/.test(prompts[1]), `${name}: a hidden value is in the prompt`);
  }
});

test('the ranking\'s memory and the digest are the browser\'s to see, and the memory is not: the served game has cards and a digest but no firsts', async () => {
  const s = stateWith(SET.turns[0]);
  const r = told(s, SET.turns[0], {});
  s.firsts = r.next; assert.ok(Object.keys(s.firsts).length >= 1);
  s.history = [{ turn: 1, date: '8 8th moon, 298 AC', events: r.cards.map((c, i) => ({ ...c, id: `1-${i}` })), digest: r.digest, meanwhile: r.mw, minds: [{ secret: 'HIDDEN' }], applied: [{ op: 'x' }] }];
  const view = playerView(s);
  assert.ok(!('firsts' in view), 'no firsts in the served state'); assert.ok(view.history[0].digest.text, 'the digest is served');
  assert.ok(!('minds' in view.history[0]) && !('applied' in view.history[0]), 'the turn record loses its workings');
  assert.deepEqual(hiddenTruths(s, { ...view, firsts: s.firsts }).filter((p) => /firsts/.test(p)).length, 1);
  assert.ok(!/HIDDEN/.test(json(view.history)), 'nothing of the minds in the served record');
});

test('a card told in a played game carries only ids the house knows: no hidden host, no unmet person, in `who` or `record`', async () => {
  const fsx = await import('node:fs'); const os = await import('node:os');
  process.env.WC_SAVES = fsx.mkdtempSync(path.join(os.tmpdir(), 'wc-leaks-n5-'));
  const game = await import('../server/game.js');
  const { id } = game.newGame('agot_298', 'stark', { seed: 7 });
  for (let n = 0; n < 4; n++) { await game.advance(id, { span: 'auto', orders: n === 0 ? [{ text: 'Call the banners to Winterfell.' }] : [] }); await game.settled(id); }
  const s = game.loadState(id); const view = playerView(s);
  const all = game.readFacts(id, { from: 1, to: 9 });
  for (const t of view.history) for (const e of t.events) {
    for (const fid of e.facts || (e.fact ? [e.fact] : [])) {
      const f = all.find((x) => x.id === fid);
      if (!f) continue;
      // (whether the house had heard of it by the day it was told is the knowledge system's, tested there; here: no secret fact is ever a card; a letter's answer that reached the house is kept in its knowledge, which is B9's to test)
      const scope = f.vis?.scope || 'public';
      assert.notEqual(scope, 'secret', `turn ${t.turn}: "${e.headline}" tells the secret fact ${fid}`);
    }
    for (const p of e.who || []) if (s.parties[p]) assert.ok(view.parties[p], `turn ${t.turn}: "${e.headline}" names host ${p}, which the view does not send`);
  }
});
