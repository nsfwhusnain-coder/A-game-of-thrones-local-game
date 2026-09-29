// Headlines, part three: clustering v2 (docs/gdd/18-headlines.md §1.2 causes 6–7, §2.4 C1–C7, §5 row N4; WP N4).
// Stories, not facts — but the right ones: one card per thing that happened, not one per line of the ledger and not one
// per week. `clusterFacts(state, facts, opts)` keeps its name and its return shape ({ stories, meanwhile, rest }) and now
//   C1  gives each story an `archetype` (from its lead kind: heads.js ARCHETYPE), a `lead` (the id of the fact that leads it, C4)
//       and, for a roll-up, `rolled: true`
//   C2  rolls up three or more facts of one kind that share a cause, a thread or a destination, of importance 3 or less, into ONE story
//       (five hosts leaving for Winterfell: "Five northern hosts march for Winterfell"); the facts stay in the story, in order
//   C3  splits a muster with a refusal in it: a story of more than six facts of two archetypes is cut at the archetype's edge
//   C4  leads a story by the weightiest fact: importance first, then heads.js LEDE (a death beats an arrival; a refusal beats an
//       answer; the result beats its cause), never by list order
//   C5  merges facts of the same day, place and people into the story of the heaviest (a battle, its captives and its dead)
//   C6  has no cap: every fact of importance 2 or more is in exactly one story and `rest` is always empty (the narrator tells
//       six, the writer the others; that is N5's)
//   C7  sends importance 1 and the small journeys of others (three or more riders of importance 2 or less that touch neither the
//       viewer's house nor its seat) to the Meanwhile, one sentence for all (meanwhileOf, headline.js)
// and, from the bug-sweep (B-32a, late news): facts of different arrival never share a story. A fact handed in from a card
// that news reached late carries `heard` ({ via, happened }, as engine/knowledge.js holdNews stamps its card) and `late: true`;
// a fact with no `heard` was seen. Facts that differ in how or when they were heard are not one story ("the tourney
// at King's Landing, seen" and "the tourney at King's Landing, by raven three weeks on"); a story carries the `heard` of its
// facts and `late: true` when any is late.
// Kept as it is (the recordings the narrator's replay tests read are keyed by it): stories come out earliest day first, the
// weightier first on a day, facts in a story by day then id, ids S1…Sk in that order.
//
// The audit's real turns are recorded in tests/fixtures/headlines/turns/ (Stark, seed 7, six turns of span "auto" on the mock
// provider, with and without the call of the banners); how they were made is in each file's "note".
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.WC_PROVIDER = 'mock';
const { createInitialState } = await import('../public/js/shared/world.js');
const { emit } = await import('../public/js/engine/facts/log.js');
const { KINDS } = await import('../public/js/engine/facts/kinds.js');
const { dayNumber } = await import('../public/js/engine/time.js');
const { clusterFacts } = await import('../public/js/engine/facts/cluster.js');
const tryImport = async (p) => { try { return await import(p); } catch (e) { return { __error: e }; } };
const H = await tryImport('../public/js/engine/facts/heads.js');
const need = (m, what) => { if (m.__error) assert.fail(`${what} cannot be imported: ${String(m.__error.message).split('\n')[0]}`); return m; };

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const load = (name) => JSON.parse(fs.readFileSync(path.join(here, 'fixtures', 'headlines', 'turns', `${name}.json`), 'utf8'));
const SETS = { muster: load('stark-muster-6'), quiet: load('stark-quiet-6') };
const ARCHETYPES = ['muster', 'march', 'battle', 'siege', 'death', 'capture', 'court', 'wedding', 'letter', 'plot', 'omen', 'works', 'harvest', 'feast', 'other'];

// ── Worlds, weeks and facts ──────────────────────────────────────────────────────────────────────────────────────────
const week = (s) => { const d0 = dayNumber(s.meta.date); s.meta.clock = { turn: s.meta.turn + 1, from: d0 + 1, to: d0 + 7 }; return s; };
const world = () => week(createInitialState('agot_298', 'stark', { seed: 298 }));
const stateWith = (turn) => { const s = createInitialState('agot_298', 'stark', { seed: 7 }); for (const [k, p] of Object.entries(turn.parties)) s.parties[k] = { ...p }; s.meta.clock = turn.clock; return s; };
const deepFreeze = (o) => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); } return o; };
const byId = (turn, ...ids) => ids.map((id) => [...turn.facts, ...turn.small].find((f) => f.id === id) || assert.fail(`no fact ${id} in turn ${turn.turn}`));
const storyOf = (res, f) => res.stories.find((s) => s.facts.some((x) => x.id === f.id)) || null;
const inStories = (res, f) => res.stories.filter((s) => s.facts.some((x) => x.id === f.id)).length;
const sameStory = (res, a, b) => { const s = storyOf(res, a); return !!s && s === storyOf(res, b); };
const shape = (res) => res.stories.map((s) => ({ id: s.id, facts: s.facts.map((f) => f.id), lead: s.lead, archetype: s.archetype, rolled: !!s.rolled, heard: s.heard ?? null, late: !!s.late })).concat([{ meanwhile: res.meanwhile.map((f) => f.id), rest: res.rest.map((f) => f.id) }]);
const membership = (res) => res.stories.map((s) => s.facts.map((f) => f.id).sort().join('+')).sort();

/** The invariants of every clustering: a partition (nothing twice, nothing dropped, no rest), a lead, a weightiest importance. */
function invariants(res, input, label) {
  const bad = []; const at = new Map(); const note = (m) => bad.push(`${label}: ${m}`);
  if (!Array.isArray(res.stories) || !Array.isArray(res.meanwhile) || !Array.isArray(res.rest)) return [`${label}: not { stories, meanwhile, rest }`];
  for (const s of res.stories) for (const f of s.facts) { if (at.has(f.id)) note(`${f.id} in two stories (${at.get(f.id)} and ${s.id})`); at.set(f.id, s.id); }
  for (const f of res.meanwhile) { if (at.has(f.id)) note(`${f.id} in ${at.get(f.id)} and in the Meanwhile`); at.set(f.id, 'meanwhile'); }
  for (const f of input) if (!at.has(f.id)) note(`${f.id} (${f.kind}) is in no story and not in the Meanwhile`);
  if (res.rest.length) note(`rest holds ${res.rest.length} facts (it is always empty now)`);
  for (const s of res.stories) {
    if (!s.facts.length) { note(`${s.id} has no facts`); continue; }
    if (!s.facts.some((f) => f.id === s.lead)) note(`${s.id}: lead ${s.lead} is no fact of the story`);
    if (s.importance !== Math.max(...s.facts.map((f) => f.importance))) note(`${s.id}: importance ${s.importance} is not its weightiest fact's`);
    if (!ARCHETYPES.includes(s.archetype)) note(`${s.id}: archetype ${s.archetype}`);
  }
  if (res.stories.some((s, k) => s.id !== `S${k + 1}`)) note('ids are not S1…Sk');
  return bad;
}

// ── The recordings ───────────────────────────────────────────────────────────────────────────────────────────────────
test('the recorded turns: six of each, facts of real kinds, the clock and the hosts they name', () => {
  for (const [name, set] of Object.entries(SETS)) {
    assert.equal(set.turns.length, 6, name); assert.equal(set.seed, 7); assert.equal(set.house, 'stark');
    const day0 = dayNumber(createInitialState('agot_298', 'stark', { seed: 7 }).meta.date);
    set.turns.forEach((t, k) => {
      assert.ok(t.clock.to >= t.clock.from, `${name} turn ${t.turn}: clock`);
      assert.equal(t.clock.from, k === 0 ? day0 + 1 : set.turns[k - 1].clock.to + 1, `${name} turn ${t.turn}: a turn starts the day after the last one ended`);
      for (const f of [...t.facts, ...t.small]) { assert.ok(KINDS[f.kind], `${name} ${f.id}: kind ${f.kind}`); assert.ok(f.id && Array.isArray(f.actors) && Array.isArray(f.houses) && Number.isInteger(f.importance), f.id); assert.ok(!('vis' in f) && f.text, `${name} ${f.id}`); }
      for (const f of t.facts) assert.ok(!t.small.some((x) => x.id === f.id), `${f.id} is both news and small`);
    });
  }
  const news = SETS.muster.turns.reduce((n, t) => n + t.facts.length, 0); assert.ok(news >= 60, `${news} facts of news in the muster game`);
});

test('engine code, not server code: cluster.js has no node: import, no dice and no clock', () => {
  const src = fs.readFileSync(path.join(root, 'public', 'js', 'engine', 'facts', 'cluster.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
  assert.doesNotMatch(src, /\bfrom\s*['"](?:node:|\.\.\/\.\.\/\.\.\/server)|\brequire\s*\(|\bprocess\./); assert.doesNotMatch(src, /Math\.random|\bDate\b|performance\.now/);
});

// ── The shape ────────────────────────────────────────────────────────────────────────────────────────────────────────
test('the shape: { stories, meanwhile, rest } as before, and each story with archetype, lead and rolled as well', () => {
  const s = world(); const { ARCHETYPE } = need(H, 'heads.js');
  const o = { type: 'order', ref: 'o1' };
  const a = emit(s, 'levies_called', { actors: ['eddard_stark'], houses: ['stark'], place: 'stark', on: 1, importance: 4, cause: o });
  const b = emit(s, 'call_answered', { actors: ['greatjon_umber'], houses: ['umber', 'stark'], place: 'umber', on: 2, importance: 3, cause: o, data: { men: 3800, to: 'stark' } });
  const c = emit(s, 'feast', { actors: ['mace_tyrell'], houses: ['tyrell'], place: 'tyrell', on: 4, importance: 2 });
  const d = emit(s, 'happening', { houses: ['stark'], place: 'stark', on: 3, importance: 1, text: 'Poachers are hanged in the wolfswood.' });
  const res = clusterFacts(s, [a, b, c, d]);
  assert.deepEqual(Object.keys(res).sort(), ['meanwhile', 'rest', 'stories']);
  assert.deepEqual(invariants(res, [a, b, c, d], 'shape'), []);
  assert.deepEqual(res.meanwhile.map((f) => f.id), [d.id]); assert.deepEqual(res.rest, []);
  const [s1, s2] = res.stories; assert.equal(res.stories.length, 2);
  assert.deepEqual([s1.facts.map((f) => f.id), s1.lead, s1.archetype, !!s1.rolled], [[a.id, b.id], a.id, 'muster', false]);
  assert.deepEqual([s2.facts.map((f) => f.id), s2.lead, s2.archetype], [[c.id], c.id, ARCHETYPE.feast]);
  for (const st of res.stories) {
    assert.ok(st.facts.every((f) => f.id), 'facts, not ids'); assert.equal(typeof st.importance, 'number'); assert.ok(Array.isArray(st.days) && st.days.length === 2 && st.days[0] <= st.days[1]);
    assert.ok(Array.isArray(st.actors) && Array.isArray(st.houses)); assert.equal(typeof st.type, 'string'); assert.ok(st.pov && typeof st.pov === 'object');
    assert.ok(st.rolled === undefined || typeof st.rolled === 'boolean');
  }
  assert.deepEqual(s1.days, [1, 2]); assert.equal(s1.place, 'stark'); assert.equal(s1.pov.id, 'eddard_stark');
});

test('the order the recordings and the prompt snapshot rely on: earliest day first, facts by day then id, S1…Sk', () => {
  // the fixture world of server/ai/calls/narrate.js fixtureArgs — its replay fixture is keyed by "levies_called+call_answered|feast|set_out"
  const s = world(); const call = { type: 'order', ref: 'o_fixture' };
  const fs_ = [
    emit(s, 'levies_called', { actors: ['eddard_stark'], houses: ['stark'], place: 'stark', on: 1, importance: 4, cause: call }),
    emit(s, 'call_answered', { actors: ['greatjon_umber'], houses: ['umber', 'stark'], place: 'umber', on: 2, cause: call, data: { men: 3800, days: 12 } }),
    emit(s, 'set_out', { actors: ['jon_snow'], houses: ['stark'], place: 'stark', on: 5, data: { to: 'nights_watch', days: 14 } }),
    emit(s, 'feast', { actors: ['mace_tyrell'], houses: ['tyrell'], place: 'tyrell', on: 4, importance: 2 }),
    emit(s, 'happening', { houses: ['stark'], place: 'stark', on: 3, importance: 1 }),
  ];
  for (const order of [fs_, [...fs_].reverse()]) {
    const res = clusterFacts(s, order);
    assert.equal(res.stories.map((st) => st.facts.map((f) => f.kind).join('+')).join('|'), 'levies_called+call_answered|feast|set_out');
    assert.deepEqual(res.stories.map((st) => st.id), ['S1', 'S2', 'S3']); assert.deepEqual(res.meanwhile.map((f) => f.kind), ['happening']);
    assert.deepEqual(res.stories.map((st) => st.days), [[1, 2], [4, 4], [5, 5]]);
  }
});

// ── The audit's turns ────────────────────────────────────────────────────────────────────────────────────────────────
test('the six recorded turns of both games: every fact in exactly one story, nothing dropped, rest empty, importance 1 in the Meanwhile', () => {
  const bad = [];
  for (const [name, set] of Object.entries(SETS)) for (const t of set.turns) {
    const s = stateWith(t); const res = clusterFacts(s, t.facts); const label = `${name} turn ${t.turn}`;
    bad.push(...invariants(res, t.facts, label));
    for (const f of t.facts.filter((x) => x.importance <= 1)) if (!res.meanwhile.some((m) => m.id === f.id)) bad.push(`${label}: ${f.id} (${f.kind}, importance 1) is not in the Meanwhile`);
    for (const st of res.stories) for (const f of st.facts) if (f.importance <= 1) bad.push(`${label}: ${f.id} (importance 1) is in ${st.id}`);
    const news = t.facts.filter((x) => x.importance > 1).length; const told = res.stories.reduce((n, st) => n + st.facts.length, 0);
    if (told > news) bad.push(`${label}: the stories hold ${told} facts, ${news} are news`);
  }
  assert.deepEqual(bad, []);
});

test('the six recorded turns: at most ten cards a turn, no story of more than eight facts unless one archetype and one place (or a roll-up), a fact mean of 1.5', () => {
  const { ARCHETYPE } = need(H, 'heads.js'); const bad = []; const pooled = { muster: [0, 0], quiet: [0, 0] };
  for (const [name, set] of Object.entries(SETS)) for (const t of set.turns) {
    const res = clusterFacts(stateWith(t), t.facts); const label = `${name} turn ${t.turn}`;
    if (res.stories.length > 10) bad.push(`${label}: ${res.stories.length} cards`);
    for (const st of res.stories) {
      const arch = new Set(st.facts.map((f) => ARCHETYPE[f.kind])); const places = new Set(st.facts.map((f) => f.place).filter(Boolean));
      if (st.facts.length > 8 && !st.rolled && (arch.size > 1 || places.size > 1)) bad.push(`${label} ${st.id}: ${st.facts.length} facts of ${[...arch]} at ${places.size} places, not a roll-up`);
      if (st.rolled && st.facts.length < 3) bad.push(`${label} ${st.id}: rolled with ${st.facts.length} facts`);
    }
    pooled[name][0] += res.stories.reduce((n, st) => n + st.facts.length, 0); pooled[name][1] += res.stories.length;
  }
  console.log(`\nclusters on the audit's turns: muster game ${pooled.muster[0]} facts in ${pooled.muster[1]} stories (${(pooled.muster[0] / pooled.muster[1]).toFixed(2)} a story); quiet game ${pooled.quiet[0]} in ${pooled.quiet[1]} (${(pooled.quiet[0] / pooled.quiet[1]).toFixed(2)})`);
  assert.deepEqual(bad, []);
  assert.ok(pooled.muster[0] / pooled.muster[1] >= 1.5, `facts per story ${(pooled.muster[0] / pooled.muster[1]).toFixed(2)}`);
});

test('turn 1, the call of the banners: the muster is told as one, the refusal in it is a story of its own (C2, C3)', () => {
  const t = SETS.muster.turns[0]; const s = stateWith(t); const res = clusterFacts(s, t.facts);
  const answers = t.facts.filter((f) => f.kind === 'call_answered'); assert.ok(answers.length >= 15, `${answers.length} houses answered`);
  const refusal = byId(t, 'f1.26')[0]; assert.equal(refusal.kind, 'call_refused');
  const refusalStory = storyOf(res, refusal); assert.ok(refusalStory, 'the refusal is told');
  assert.deepEqual(refusalStory.facts.filter((f) => ['call_answered', 'host_formed', 'levies_called'].includes(f.kind)).map((f) => f.id), [], 'the refusal is not part of the muster');
  assert.ok(res.stories.length >= 2 && res.stories.length <= 10, `${res.stories.length} stories`);
  assert.ok(answers.every((f) => storyOf(res, f)), 'every house that answered is in a story (none left over in `rest`, none dropped)');
  const told = new Set(answers.map((f) => storyOf(res, f).id)); assert.ok(told.size <= 2, `${answers.length} answers told in ${told.size} stories`);
  const muster = res.stories.filter((st) => st.facts.filter((f) => f.kind === 'call_answered').length >= 15);
  assert.equal(muster.length, 1, 'one story holds the answers'); assert.equal(muster[0].rolled, true, 'a roll-up'); assert.equal(muster[0].archetype, 'muster');
  assert.notEqual(refusalStory, muster[0]);
  // the King's ride and the call itself are their own news
  const beat = byId(t, 'f1.14')[0]; assert.ok(storyOf(res, beat) && storyOf(res, beat).facts.every((f) => f.kind === 'canon_beat'), 'the King\'s ride is not the muster');
});

test('turn 2, the hosts leave: five hosts on the road to Winterfell are ONE story, a roll-up (B5, C2)', () => {
  const t = SETS.muster.turns[1]; const res = clusterFacts(stateWith(t), t.facts);
  const hosts = t.facts.filter((f) => f.kind === 'set_out'); assert.equal(hosts.length, 5);
  assert.ok(hosts.every((f) => inStories(res, f) === 1)); const st = storyOf(res, hosts[0]);
  assert.ok(hosts.every((f) => storyOf(res, f) === st), 'five set-outs, one story'); assert.equal(st.rolled, true); assert.equal(st.archetype, 'march');
  assert.equal(st.facts.filter((f) => f.kind === 'set_out').length, 5); assert.equal(st.facts[0].kind, 'set_out');
  // no cause, no thread: the hosts share only where they are going (data.to) — that is what the roll-up reads
  assert.ok(hosts.every((f) => !f.cause && !f.thread && f.data.to === 'stark'));
  // the Arryn call to arms, by itself, is its own story and is not a march
  const arryn = byId(t, 'f2.5')[0]; assert.notEqual(storyOf(res, arryn), st); assert.equal(storyOf(res, arryn).rolled ?? false, false);
  assert.equal(res.stories.length, 2, `${res.stories.length} cards for turn 2`);
});

test('turn 3, eleven more hosts: the hosts with no other business are one roll-up; a voyage and a delay stay with their own host', () => {
  const t = SETS.muster.turns[2]; const res = clusterFacts(stateWith(t), t.facts);
  const clean = t.facts.filter((f) => f.kind === 'set_out' && f.data?.to === 'stark' && ['locke', 'wull', 'ryswell', 'flint', 'forrester', 'norrey', 'liddle', 'glover', 'tallhart', 'dustin', 'reed'].includes(f.houses[0]));
  assert.equal(clean.length, 11); const st = storyOf(res, clean[0]);
  assert.ok(clean.every((f) => storyOf(res, f) === st), 'eleven hosts, one story'); assert.equal(st.rolled, true); assert.equal(st.archetype, 'march');
  const mormont = t.facts.filter((f) => f.data?.party === 'host_of_house_mormont'); assert.deepEqual(mormont.map((f) => f.kind).sort(), ['embarked', 'landed', 'set_out']);
  assert.ok(mormont.every((f) => storyOf(res, f) === storyOf(res, mormont[0])), 'a host\'s own voyage is one story');
  const crowl = t.facts.filter((f) => f.data?.party === 'host_of_house_crowl'); assert.ok(crowl.length >= 2 && crowl.every((f) => storyOf(res, f) === storyOf(res, crowl[0])));
  assert.deepEqual(invariants(res, t.facts, 'turn 3'), []); assert.ok(res.stories.length <= 10, `${res.stories.length} cards`);
  // the Free Folk's call is its own news
  const mance = byId(t, 'f3.1')[0]; assert.ok(storyOf(res, mance).facts.every((f) => f.kind === 'levies_called'));
});

test('the tourney and its champion are one story (18 §4 A9); its dead man, of the same cause, may ride with it', () => {
  for (const [name, turn, ids] of [['quiet', 4, ['f4.3', 'f4.5']], ['muster', 4, ['f4.3', 'f4.4']]]) {
    const t = SETS[name].turns[turn - 1]; const res = clusterFacts(stateWith(t), t.facts); const [a, b] = byId(t, ...ids);
    assert.deepEqual([a.kind, b.kind], ['tourney', 'tourney_result']); assert.ok(sameStory(res, a, b), `${name}: the lists and their champion`);
    assert.equal(storyOf(res, a).archetype, need(H, 'heads.js').ARCHETYPE.tourney);
  }
});

// ── C4: the lead ─────────────────────────────────────────────────────────────────────────────────────────────────────
function leadOf(specs, { together = true } = {}) {
  const s = world(); const fs_ = specs.map(([kind, o]) => emit(s, kind, { on: 3, houses: [], actors: [], ...o }));
  const run = (list) => clusterFacts(s, list, { together: together ? [list.map((f) => f.id)] : [] });
  const a = run(fs_); const b = run([...fs_].reverse());
  assert.equal(a.stories.length, 1, `one story: ${a.stories.map((x) => x.facts.map((f) => f.kind))}`); assert.equal(b.stories.length, 1);
  assert.equal(a.stories[0].lead, b.stories[0].lead, 'the lead does not depend on the order of the list');
  return { lead: fs_.find((f) => f.id === a.stories[0].lead), story: a.stories[0], facts: fs_ };
}
test('C4: the lead is the weightiest fact, then the kind that reads as the news; never the first in the list', () => {
  const { ARCHETYPE } = need(H, 'heads.js');
  const at = (kind, o) => [kind, { place: 'stark', ...o }];
  // importance first: an arrival of weight 4 leads a death of weight 2
  assert.equal(leadOf([at('death', { actors: ['old_nan'], houses: ['stark'], importance: 2 }), at('arrived', { actors: ['jon_snow'], houses: ['stark'], importance: 4 })]).lead.kind, 'arrived');
  // then the kind: a death beats an arrival, a refusal beats an answer
  let r = leadOf([at('arrived', { actors: ['jon_snow'], houses: ['stark'], importance: 3 }), at('death', { actors: ['old_nan'], houses: ['stark'], importance: 3 })]); assert.equal(r.lead.kind, 'death'); assert.equal(r.story.archetype, 'death');
  r = leadOf([at('call_answered', { actors: ['greatjon_umber'], houses: ['umber'], importance: 3, data: { men: 2000, to: 'stark' } }), at('call_refused', { actors: ['donella_hornwood'], houses: ['hornwood'], importance: 3, data: { liege: 'stark' } })]); assert.equal(r.lead.kind, 'call_refused');
  // the result beats its cause
  for (const [cause, result] of [['siege_begun', 'holding_fell'], ['battle', 'slain_in_battle'], ['battle', 'captured_in_battle'], ['tourney', 'tourney_result']]) {
    r = leadOf([at(cause, { actors: ['robb_stark'], houses: ['stark', 'lannister'], place: 'tully', importance: 4 }), at(result, { actors: ['jaime_lannister'], houses: ['lannister', 'stark'], place: 'tully', importance: 4, data: { by: 'robb_stark' } })]);
    assert.equal(r.lead.kind, result, `${result} leads ${cause}`);
  }
  // the story's archetype is its lead's, and its importance its weightiest fact's
  r = leadOf([at('siege_begun', { actors: ['jaime_lannister'], houses: ['lannister', 'tully'], place: 'tully', importance: 4 }), at('holding_fell', { actors: ['jaime_lannister'], houses: ['lannister', 'tully'], place: 'tully', importance: 5 })]);
  assert.deepEqual([r.lead.kind, r.story.archetype, r.story.importance], ['holding_fell', ARCHETYPE.holding_fell, 5]);
  // two of one kind and one weight: the same lead whichever way the list runs
  r = leadOf([at('feast', { actors: ['mace_tyrell'], houses: ['tyrell'], place: 'tyrell', importance: 3 }), at('feast', { actors: ['wyman_manderly'], houses: ['manderly'], place: 'manderly', importance: 3 })]); assert.ok(r.lead);
});

// ── C5: the same day, the same place, the same people ───────────────────────────────────────────────────────────────
test('C5: a battle, its captives and its dead are one story; the pursuit the next day is another', () => {
  const s = world(); const place = 'tully';
  const battle = emit(s, 'battle', { actors: ['robb_stark', 'jaime_lannister'], houses: ['stark', 'lannister'], place, on: 3, importance: 4, data: { winner: 'host_stark', loser: 'host_lannister', winnerHouse: 'stark', loserHouse: 'lannister', lost: { host_stark: 900, host_lannister: 2100 } } });
  const captive = emit(s, 'captured_in_battle', { actors: ['jaime_lannister'], houses: ['lannister'], place, on: 3, importance: 4, data: { by: 'robb_stark' } });
  const dead = emit(s, 'slain_in_battle', { actors: ['rodrik_cassel'], houses: ['stark'], place, on: 3, importance: 4, data: { by: 'jaime_lannister' } });
  const pursuit = emit(s, 'set_out', { actors: ['robb_stark'], houses: ['stark', 'lannister'], place, on: 4, importance: 3, data: { party: 'host_stark', against: 'host_lannister' } });
  const res = clusterFacts(s, [battle, captive, dead, pursuit]);
  assert.deepEqual(invariants(res, [battle, captive, dead, pursuit], 'C5'), []);
  assert.ok(sameStory(res, battle, captive) && sameStory(res, battle, dead), 'the battle, its captive and its dead: one story');
  assert.ok(!sameStory(res, battle, pursuit), 'the pursuit next day is another story'); assert.equal(res.stories.length, 2);
  assert.ok(['battle', 'capture', 'death'].includes(storyOf(res, battle).archetype));
  // shuffled: the same two stories
  assert.deepEqual(membership(clusterFacts(s, [pursuit, dead, captive, battle])), membership(res));
});

// ── C2: roll-ups ─────────────────────────────────────────────────────────────────────────────────────────────────────
const marches = (s, n, o = {}) => Array.from({ length: n }, (_, k) => emit(s, 'set_out', { actors: [['rickard_karstark', 'greatjon_umber', 'wyman_manderly', 'roose_bolton', 'medger_cerwyn', 'helman_tallhart'][k]], houses: [['karstark', 'umber', 'manderly', 'bolton', 'cerwyn', 'tallhart'][k], 'stark'], place: ['karstark', 'umber', 'manderly', 'bolton', 'cerwyn', 'tallhart'][k], on: 1 + (k % 5), importance: 2, data: { party: `host_${k}`, to: 'stark' }, ...o }));
test('C2: three or more facts of one kind that share a cause, of weight 3 or less, are one story with rolled: true', () => {
  const s = world(); const cause = { type: 'order', ref: 'o7' };
  const five = marches(s, 5, { cause });
  const res = clusterFacts(s, five); assert.deepEqual(invariants(res, five, 'roll'), []);
  assert.equal(res.stories.length, 1); assert.equal(res.stories[0].rolled, true); assert.equal(res.stories[0].archetype, 'march'); assert.equal(res.stories[0].facts.length, 5);
  assert.deepEqual(res.stories[0].facts.map((f) => f.day), [...five.map((f) => f.day)].sort((a, b) => a - b), 'the facts of a roll-up stay in the order of their days');
  // exactly three roll; two do not
  const three = marches(s, 3, { cause: { type: 'order', ref: 'o8' } }); const r3 = clusterFacts(s, three); assert.equal(r3.stories.length, 1); assert.equal(r3.stories[0].rolled, true);
  const two = marches(s, 2, { cause: { type: 'order', ref: 'o9' } }); const r2 = clusterFacts(s, two); assert.ok(r2.stories.every((st) => !st.rolled), 'two are no roll-up');
  // the same cause but of weight 4 (three refusals): heavy news is told one by one, never rolled
  const heavy = ['hornwood', 'wull', 'norrey'].map((h, k) => emit(s, 'call_refused', { actors: [['donella_hornwood', 'rickard_wull', 'torrhen_norrey'][k]], houses: [h], place: h, on: 2 + k, importance: 4, cause: { type: 'order', ref: 'o10' }, data: { liege: 'stark' } }));
  assert.ok(clusterFacts(s, heavy).stories.every((st) => !st.rolled), 'importance 4 is not rolled up');
  // three feasts in three halls with nothing between them: three stories
  const feasts = ['tyrell', 'manderly', 'karstark'].map((h, k) => emit(s, 'feast', { actors: [], houses: [h], place: h, on: 1 + k * 2, importance: 3 }));
  const rf = clusterFacts(s, feasts); assert.equal(rf.stories.length, 3); assert.ok(rf.stories.every((st) => !st.rolled));
  // a mixed handful with one cause is a story, not a roll-up
  const mixed = [emit(s, 'levies_called', { actors: ['eddard_stark'], houses: ['stark'], place: 'stark', on: 1, importance: 4, cause: { type: 'order', ref: 'o11' } }), emit(s, 'call_answered', { actors: ['greatjon_umber'], houses: ['umber'], place: 'umber', on: 2, importance: 3, cause: { type: 'order', ref: 'o11' }, data: { to: 'stark', men: 2000 } })];
  assert.ok(clusterFacts(s, mixed).stories.every((st) => !st.rolled));
});

test('C3: a muster of a dozen answers with a refusal in it is two stories — the muster and the refusal — however they are linked', () => {
  const s = world(); const cause = { type: 'order', ref: 'o1' };
  const houses = ['umber', 'manderly', 'karstark', 'bolton', 'cerwyn', 'locke', 'wull', 'glover', 'tallhart', 'dustin', 'ryswell', 'flint'];
  const lords = ['greatjon_umber', 'wyman_manderly', 'rickard_karstark', 'roose_bolton', 'medger_cerwyn', 'jonnel_locke', 'rickard_wull', 'galbart_glover', 'helman_tallhart', 'barbrey_dustin', 'rodwell_flint'];
  const call = emit(s, 'levies_called', { actors: ['eddard_stark'], houses: ['stark', ...houses], place: 'stark', on: 1, importance: 5, cause, data: { muster: 'stark' } });
  const answers = lords.map((l, k) => emit(s, 'call_answered', { actors: [l], houses: [houses[k], 'stark'], place: houses[k], on: 1 + (k % 5), importance: 3, cause, data: { men: 400 + 100 * k, to: 'stark' } }));
  const refusal = emit(s, 'call_refused', { actors: ['donella_hornwood'], houses: ['hornwood'], place: 'hornwood', on: 3, importance: 4, cause, data: { liege: 'stark', why: 'the harvest is not yet in' } });
  const all = [call, ...answers, refusal]; const res = clusterFacts(s, all);
  assert.deepEqual(invariants(res, all, 'C3'), []);
  assert.ok(res.stories.length >= 2, `${res.stories.length} stories`);
  assert.ok(!sameStory(res, refusal, answers[0]) && !sameStory(res, refusal, call), 'the refusal is not in the muster'); assert.equal(storyOf(res, refusal).archetype, need(H, 'heads.js').ARCHETYPE.call_refused);
  assert.ok(new Set(answers.map((f) => storyOf(res, f).id)).size <= 2, 'the answers are told as one');
  // and with the hint the narrator gives (the engine's cards, one card the call and its answers): the refusal is still its own
  const res2 = clusterFacts(s, all, { together: [[call.id, ...answers.map((f) => f.id)]] });
  assert.deepEqual(invariants(res2, all, 'C3 together'), []); assert.ok(!sameStory(res2, refusal, call) && !sameStory(res2, refusal, answers[0]), 'the refusal is still its own');
});

test('a heap: thirty facts of a dozen kinds in ten places, all on one thread — every rule of the shape still holds', () => {
  const { ARCHETYPE } = need(H, 'heads.js'); const s = world(); const thread = 'war_of_the_test';
  const kinds = ['set_out', 'arrived', 'raid', 'village_burned', 'siege_begun', 'sally', 'storm_assault', 'holding_fell', 'battle', 'captured_in_battle', 'slain_in_battle', 'call_answered', 'feast', 'death', 'letter_arrived'];
  const places = ['tully', 'whent', 'darry', 'frey', 'stark', 'karstark', 'umber', 'mallister', 'tyrell', 'arryn'];
  const facts = Array.from({ length: 30 }, (_, k) => emit(s, kinds[k % kinds.length], { actors: [['robb_stark', 'tywin_lannister', 'jaime_lannister', 'hoster_tully'][k % 4]], houses: [['stark', 'lannister', 'tully'][k % 3]], place: places[k % places.length], on: 1 + (k % 7), importance: 2 + (k % 3), thread, data: { party: `p${k % 4}`, to: places[(k + 3) % places.length] } }));
  const res = clusterFacts(s, facts); assert.deepEqual(invariants(res, facts, 'heap'), []);
  const bad = res.stories.filter((st) => st.facts.length > 8 && !st.rolled && (new Set(st.facts.map((f) => ARCHETYPE[f.kind])).size > 1 || new Set(st.facts.map((f) => f.place)).size > 1));
  assert.deepEqual(bad.map((st) => `${st.id}: ${st.facts.length} facts`), [], 'no story of more than eight facts unless one archetype and one place (or a roll-up)');
  assert.ok(res.stories.length >= 4, `${res.stories.length} stories from a heap`);
});

// ── C6, C7 ───────────────────────────────────────────────────────────────────────────────────────────────────────────
test('C6: no cap — a dozen stories are a dozen stories, none hidden, none left over, whatever `max` is asked', () => {
  const s = world(); const places = Object.keys(s.holdings);
  const many = Array.from({ length: 12 }, (_, k) => emit(s, 'feast', { actors: [], houses: ['tyrell'], place: places[k * 3], on: 1 + (k % 7), importance: 2 + (k % 3) }));
  for (const opts of [undefined, {}, { max: 3 }, { max: 8 }]) {
    const res = clusterFacts(s, many, opts); assert.deepEqual(invariants(res, many, `no cap ${JSON.stringify(opts)}`), []);
    assert.equal(res.stories.length, 12, `twelve feasts in twelve halls: ${res.stories.length} stories with ${JSON.stringify(opts)}`); assert.deepEqual(res.rest, []);
  }
});

test('C7: importance 1 goes to the Meanwhile, even beside a story; three small journeys of others are the Meanwhile too, but hosts for the viewer\'s seat are news', () => {
  const s = world(); const cause = { type: 'order', ref: 'o1' };
  const call = emit(s, 'levies_called', { actors: ['eddard_stark'], houses: ['stark'], place: 'stark', on: 1, importance: 4, cause });
  const works = emit(s, 'works_begun', { actors: ['eddard_stark'], houses: ['stark'], place: 'stark', on: 1, importance: 1, cause });
  const poachers = emit(s, 'happening', { houses: ['stark'], place: 'stark', on: 2, importance: 1 });
  // four lords of the Reach riding to Mace Tyrell's feast: one cause, one road's end, none of them the viewer's business
  const riders = [['alester_florent', 'florent'], ['randyll_tarly', 'tarly'], ['leyton_hightower', 'hightower'], ['paxter_redwyne', 'redwyne']]
    .map(([a, h], k) => emit(s, 'set_out', { actors: [a], houses: [h, 'tyrell'], place: h, on: 1 + k, importance: 2, cause: { type: 'rule', ref: 'retinues' }, data: { party: `rider_${k}`, to: 'tyrell', why: 'to feast with Mace Tyrell at Highgarden' } }));
  const res = clusterFacts(s, [call, works, poachers, ...riders]); assert.deepEqual(invariants(res, [call, works, poachers, ...riders], 'C7'), []);
  assert.ok(res.meanwhile.some((f) => f.id === works.id) && res.meanwhile.some((f) => f.id === poachers.id), 'importance 1 goes to the Meanwhile');
  assert.ok(!res.stories.some((st) => st.facts.some((f) => [works.id, poachers.id].includes(f.id))), 'and is in no story, though it shares a cause and a place with one');
  for (const r of riders) assert.ok(res.meanwhile.some((f) => f.id === r.id) && inStories(res, r) === 0, `a rider of the Reach (${r.data.why}) is the Meanwhile`);
  assert.deepEqual(storyOf(res, call).facts.map((f) => f.id), [call.id]);
  // the same four journeys towards the viewer's seat are news: a march, not the Meanwhile
  const sy = world(); const yours = marches(sy, 4); const ry = clusterFacts(sy, yours);
  assert.equal(ry.meanwhile.length, 0, 'four hosts for Winterfell are not the Meanwhile'); assert.equal(ry.stories.length, 1); assert.equal(ry.stories[0].rolled, true);
});

// ── The hint, and the arrival ────────────────────────────────────────────────────────────────────────────────────────
test('together: the facts of one card are one story, however far apart (the narrator\'s hint, honoured as before)', () => {
  const s = world();
  const a = emit(s, 'wedding', { actors: ['renly_baratheon', 'margaery_tyrell'], houses: ['baratheon_se', 'tyrell'], place: 'tyrell', on: 2, importance: 3 });
  const b = emit(s, 'feast', { actors: ['mace_tyrell'], houses: ['tyrell'], place: 'darry', on: 6, importance: 2 });
  const c = emit(s, 'famine', { houses: ['tully'], place: 'tully', on: 5, importance: 4 });
  assert.ok(!sameStory(clusterFacts(s, [a, b, c]), a, b), 'unrelated, they are apart');
  const res = clusterFacts(s, [a, b, c], { together: [[a.id, b.id]] });
  assert.ok(sameStory(res, a, b) && !sameStory(res, a, c), 'the hint joins its facts and only them'); assert.deepEqual(invariants(res, [a, b, c], 'together'), []);
  assert.deepEqual(clusterFacts(s, [a, b, c], { together: [[a.id, 'f99.99', b.id]] }).stories.length, 2, 'an id that is not in the list is ignored');
});

test('B-32(a): a fact seen and a fact heard late do not share a story, even at one place on one day', () => {
  const s = world(); const place = 'tyrell';
  const cause = { type: 'intent', ref: 'mace_tyrell', by: 'mock' }; // the lists and their champion have one cause, as the emitters give them
  const lists = emit(s, 'tourney', { actors: ['mace_tyrell'], houses: ['tyrell', 'stark'], place, on: 3, importance: 4, cause, data: { guests: 12 } });
  const champ = () => emit(s, 'tourney_result', { actors: ['loras_tyrell'], houses: ['tyrell'], place, on: 3, importance: 3, cause });
  const raven = { via: 'raven', happened: '3 8th moon, 298 AC' };
  // the control: both seen — the lists and their champion are one story
  const seen = champ(); assert.ok(sameStory(clusterFacts(s, [lists, seen]), lists, seen), 'control: seen together, one story');
  // one seen, one by raven: two stories
  const late = { ...champ(), heard: raven, late: true }; const res = clusterFacts(s, [lists, late]);
  assert.equal(res.stories.length, 2, 'the tourney was seen, the champion heard of by raven: two stories'); assert.deepEqual(invariants(res, [lists, late], 'arrival'), []);
  assert.equal(storyOf(res, late).late, true); assert.deepEqual(storyOf(res, late).heard, raven); assert.ok(!storyOf(res, lists).late && storyOf(res, lists).heard == null, 'the story of what was seen carries no heard and is not late');
  // both heard the same way of the same day: one story again, carrying the word and its lateness
  const both = [{ ...lists, heard: raven, late: true }, late]; const r2 = clusterFacts(s, both);
  assert.equal(r2.stories.length, 1); assert.deepEqual(r2.stories[0].heard, raven); assert.equal(r2.stories[0].late, true);
  // heard in another way (rumour, not raven): apart
  const rumour = { ...champ(), heard: { via: 'rumour', happened: raven.happened }, late: true };
  assert.equal(clusterFacts(s, [{ ...lists, heard: raven, late: true }, rumour]).stories.length, 2, 'raven and rumour are not one arrival');
  // heard of on another day (the same news at another remove): apart
  const later = { ...champ(), heard: { via: 'raven', happened: '4 8th moon, 298 AC' }, late: true };
  assert.equal(clusterFacts(s, [{ ...lists, heard: raven, late: true }, later]).stories.length, 2, 'news of two days is two arrivals');
  // a heard fact that is not late (word came within the week) is still a different arrival from a fact seen
  const soon = { ...champ(), heard: { via: 'rumour', happened: raven.happened } };
  const rs = clusterFacts(s, [lists, soon]); assert.equal(rs.stories.length, 2); assert.ok(!storyOf(rs, soon).late && storyOf(rs, soon).heard.via === 'rumour');
  // three marches on one cause, one of them heard of late: two are no roll-up, and the late one stands apart
  const m = marches(s, 3, { cause: { type: 'order', ref: 'o5' } }); const mixed = [m[0], m[1], { ...m[2], heard: raven, late: true }];
  const rm = clusterFacts(s, mixed); assert.ok(rm.stories.every((st) => !st.rolled), 'two seen and one heard are no roll-up'); assert.ok(!sameStory(rm, mixed[0], mixed[2]));
  // six on the cause, three seen and three heard alike: two roll-ups
  const six = marches(s, 6, { cause: { type: 'order', ref: 'o6' } }); const halves = six.map((f, k) => (k < 3 ? f : { ...f, heard: raven, late: true }));
  const r6 = clusterFacts(s, halves); assert.equal(r6.stories.length, 2); assert.ok(r6.stories.every((st) => st.rolled)); assert.deepEqual(r6.stories.map((st) => !!st.late).sort(), [false, true]);
});

test('B-32(a), the real turns: the news that reached the chronicle late is told apart from what was seen, and carries how it came', () => {
  let late = 0;
  for (const [name, set] of Object.entries(SETS)) for (const t of set.turns) {
    const s = stateWith(t); const res = clusterFacts(s, t.facts);
    for (const st of res.stories) {
      const arrivals = new Set(st.facts.map((f) => JSON.stringify(f.heard ?? null)));
      assert.equal(arrivals.size, 1, `${name} turn ${t.turn} ${st.id}: facts of ${arrivals.size} arrivals in one story (${st.facts.map((f) => `${f.id}:${f.heard?.via || 'seen'}`)})`);
      const heard = st.facts[0].heard ?? null;
      assert.deepEqual(st.heard ?? null, heard, `${name} turn ${t.turn} ${st.id}: the story carries the word its facts came by`);
      assert.equal(!!st.late, st.facts.some((f) => f.late), `${name} turn ${t.turn} ${st.id}: late`); if (st.late) late++;
    }
  }
  assert.ok(late >= 3, `${late} late stories among the recorded turns`);
  const t = SETS.muster.turns[3]; const res = clusterFacts(stateWith(t), t.facts); const [tr, r1, r2] = byId(t, 'f3.48', 'f3.49', 'f3.51');
  assert.ok(sameStory(res, tr, r1), 'Stannis\'s lists and their champion came by the same raven: one story'); assert.ok(!sameStory(res, r1, r2), 'the champion at King\'s Landing is another tourney');
  assert.equal(storyOf(res, tr).late, true); assert.equal(storyOf(res, tr).heard.via, 'raven');
});

// ── Determinism ──────────────────────────────────────────────────────────────────────────────────────────────────────
test('determinism: the same facts, the same stories and ids — in any order, on a copy of the world, with nothing changed and no dice drawn', () => {
  const random = Math.random; const now = Date.now; const bad = [];
  try {
    Math.random = () => { throw new Error('Math.random'); }; Date.now = () => { throw new Error('Date.now'); };
    for (const [name, set] of Object.entries(SETS)) for (const t of set.turns) {
      const s = stateWith(t); const label = `${name} turn ${t.turn}`; const facts = structuredClone(t.facts); deepFreeze(facts); const frozen = deepFreeze(stateWith(t));
      const before = JSON.stringify(t.facts);
      let a; let b; let c; let d;
      try { a = clusterFacts(frozen, facts); b = clusterFacts(s, structuredClone(t.facts)); c = clusterFacts(s, [...t.facts].reverse()); d = clusterFacts(s, [...t.facts].sort((x, y) => (x.id < y.id ? -1 : 1))); } catch (e) { bad.push(`${label}: ${e.message}`); continue; }
      if (JSON.stringify(shape(a)) !== JSON.stringify(shape(b))) bad.push(`${label}: two runs, two clusterings`);
      if (JSON.stringify(membership(a)) !== JSON.stringify(membership(c)) || JSON.stringify(membership(a)) !== JSON.stringify(membership(d))) bad.push(`${label}: another order of the same facts, other stories`);
      if (JSON.stringify(shape(a).map((x) => x.id)) !== JSON.stringify(shape(c).map((x) => x.id))) bad.push(`${label}: the ids move with the order of the list`);
      if (JSON.stringify(a.stories.map((st) => st.lead)) !== JSON.stringify(c.stories.map((st) => st.lead))) bad.push(`${label}: the leads move with the order of the list`);
      if (JSON.stringify(t.facts) !== before) bad.push(`${label}: the input facts were changed`);
    }
  } finally { Math.random = random; Date.now = now; }
  assert.deepEqual(bad, []);
});
