// The Director and its hooks (WP B12; docs/gdd/04-ai-system.md §7, 09-living-world.md §9): a catalogue of grounded
// story hooks, offered where the world fits them, made to happen by the engine alone; and no whole week in which
// nothing of note happens anywhere in the realm.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.WC_PROVIDER = 'mock';
process.env.WC_SAVES = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-director-'));
const game = await import('../server/game.js');
const { HOOKS } = await import('../public/data/hooks.js');
const { eligibleHooks, applyHook, pickHook, HOOK_BY_ID } = await import('../public/js/engine/director.js');
const { createInitialState } = await import('../public/js/shared/world.js');
const { dayNumber } = await import('../public/js/engine/time.js');
const { withRng } = await import('../public/js/engine/rng.js');
const { viewTurn } = await import('../server/view.js');

test.after(() => fs.rmSync(process.env.WC_SAVES, { recursive: true, force: true }));
const WHEN = new Set(['war', 'peace', 'winter', 'cold', 'warm', 'summer', 'autumn', 'unrest', 'calm', 'rich', 'poor', 'coast', 'town', 'lord', 'oldlord', 'younglord', 'wildlings', 'dead', 'mine', 'notmine', 'seat', 'vassals', 'heir']);
const FX = new Set(['gold', 'food', 'menAtArms', 'rel', 'unrest', 'prosperity', 'loyalty', 'prestige', 'nwMen', 'threat', 'chance']);

test('the catalogue: some eighty hooks, each well formed, none that kills or says what is to come', () => {
  assert.ok(HOOKS.length >= 80, `${HOOKS.length} hooks`);
  assert.equal(new Set(HOOKS.map((h) => h.id)).size, HOOKS.length, 'ids are unique');
  for (const h of HOOKS) {
    assert.ok(h.t && h.x && h.imp >= 1 && h.imp <= 5, h.id);
    assert.ok(/^(any|r:|h:|c:)/.test(h.where), `${h.id}: where`);
    for (const w of h.when || []) assert.ok(WHEN.has(w) || /^(alive|flag|noflag):/.test(w), `${h.id}: when ${w}`);
    assert.doesNotMatch(`${h.t} ${h.x}`, /\b(dies|died|killed|slain|murdered|beheaded)\b/i, `${h.id}: a hook never kills`);
    if (h.matter) {
      assert.ok(h.matter.options.length >= 2, `${h.id}: a matter has at least two answers`);
      for (const o of h.matter.options) for (const e of o.fx) for (const k of Object.keys(e)) assert.ok(FX.has(k), `${h.id}: effect ${k}`);
    }
  }
});

test('the offer: only hooks the world fits, at their own places, the same offer twice (no dice)', () => {
  const s = createInitialState('agot_298', 'stark', { seed: 298 });
  const a = eligibleHooks(s), b = eligibleHooks(s);
  assert.deepEqual(a, b);
  assert.ok(a.length >= 6);
  for (const h of a) { assert.ok(HOOK_BY_ID[h.id]); for (const p of h.places) assert.ok(s.holdings[p], p); }
  // a war-only hook is not offered in peace; a wildling raid needs the free folk stirring
  assert.ok(!a.some((h) => ['sellsword_offer', 'broken_men', 'camp_fever'].includes(h.id)));
  // the lord's own region is offered, and elsewhere too
  const regions = new Set(a.flatMap((h) => h.places.map((p) => s.holdings[p].region)));
  assert.ok(regions.has('north') && regions.size > 2, [...regions].join(','));
});

test('a hook in the lord\'s lands is a fact and a matter; elsewhere a fact only; the same place and dice tell it the same', () => {
  const s = createInitialState('agot_298', 'stark', { seed: 7 });
  s.meta.clock = { turn: 1, from: dayNumber(s.meta.date) + 1, to: dayNumber(s.meta.date) + 1 };
  const before = (s.decisions || []).length;
  const home = withRng(s, () => applyHook(s, 'mill_dispute', 'mormont'));
  assert.equal(home.cards[0].title, 'A quarrel over a mill near Bear Island');
  assert.match(home.cards[0].text, /House Mormont and House \w+/);
  assert.ok(home.matter, 'the matter comes before the lord');
  assert.equal(s.decisions.length, before + 1);
  assert.ok(home.matter.options.every((o) => o.fx.every((e) => !JSON.stringify(e).includes('$'))), 'the matter\'s effects name real houses');
  const f = s.facts.findLast((x) => x.kind === 'hook'); assert.equal(f.data.hook, 'mill_dispute'); assert.equal(f.cause.ref, 'director');
  const away = withRng(s, () => applyHook(s, 'tourney_called', 'beesbury'));
  assert.equal(away.matter, null, 'a tourney in the Reach asks nothing of Winterfell');
  assert.equal(s.decisions.length, before + 1);
  // cooldown: the same hook is not offered again for its days
  assert.ok(!eligibleHooks(s).some((h) => h.id === 'mill_dispute'));
  const pick = withRng(s, () => pickHook(s)); assert.ok(pick && HOOK_BY_ID[pick.hook]);
});

test('no whole week is empty: each has three facts of note in the realm, or a hook (09 §9 point 3)', async () => {
  const { id } = game.newGame('agot_298', 'martell', { seed: 298 });
  const cfg = game.loadState(id);
  for (let i = 0; i < 6; i++) await game.advance(id, { span: '7d' });
  const facts = fs.readFileSync(path.join(game.SAVES, id, 'facts.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const day0 = dayNumber(cfg.meta.date);
  for (let w = 0; w < 6; w++) {
    const week = facts.filter((f) => f.day > day0 + w * 7 && f.day <= day0 + w * 7 + 7);
    const noted = week.filter((f) => f.importance >= 2).length;
    assert.ok(noted >= 3 || week.some((f) => f.kind === 'hook'), `week ${w + 1}: ${noted} facts of note and no hook`);
  }
});

test('the Director on the mock: a hook on a week\'s first day at most once a fortnight, recorded and kept from the player', async () => {
  const { id } = game.newGame('agot_298', 'stark', { seed: 298 });
  const r = await game.advance(id, { span: '21d' });
  const starts = (r.turn.hooks || []).filter((h) => h.when === 'start');
  assert.ok(starts.length && starts.every((h) => h.via === 'mock' && HOOK_BY_ID[h.hook]), JSON.stringify(r.turn.hooks));
  assert.equal(starts[0].segment, 0);
  assert.ok(!starts.some((h) => h.segment === 1), 'the second week is too soon for another');
  assert.equal(viewTurn(r.turn).hooks, undefined, 'where the realm\'s hooks were set is not the player\'s to read');
});
