// Headlines, part one: the golden set and the scorer (docs/gdd/18-headlines.md §5, §5.1, §5.2; WP N1). Before anyone
// rewrites a headline, the game learns to tell a good one from a bad one: `scoreCard` reads a card (headline + summary)
// against the story it tells and names every rule it breaks. It runs on the mock, without a model, so CI can hold the
// writer of N3 (and the narrator of N5) to it. The fixtures:
//   tests/fixtures/headlines/golden.json   ~70 stories (facts as the engine records them, with their slots), each with
//                                          the names it must and must not carry and a reference card that passes
//   tests/fixtures/headlines/bad.json      the strings of 18 §1.3 (B1–B13), the BAD column of 20 §5.2, and our own, each
//                                          with the rule it must fail
//
// The scorer's contract, as these fixtures read it (18 §5.2, with the tense decision D-058: headlines are news
// headlines, in the present or with a bare passive participle; the rule is `verb`, not `past`):
//   len       headline 3–12 words and at most 80 characters; summary at most 3 sentences and 340 characters
//   who       the headline holds a name from the story's `must`, or of its actors, houses or places
//   invented  every person, place or party the headline or the summary names (namesIn, tablesFor) is of the story;
//             nothing on the story's `mustNot` is said
//   verb      the headline holds a finite verb or a participle of HEADLINE_VERBS (present, past or participle)
//   numbers   no digit and no "~" in headline or summary; at most one number word in the headline; a number above
//             twelve only when the story gives it (±2 %)
//   punct     headline: no ( ) : ; — … "..." and no full stop; summary: no … and it ends with a full stop
//   boiler    none of FORBIDDEN, FORBIDDEN_EXACT, BOILERPLATE, JARGON, in the headline or the summary
//   roles     "X slain/captured/beaten/defeated by Y" and "X slays/captures/beats Y" agree with the fact's victim,
//             captor or loser and its agent
//   dup       the summary is not the headline again
//   outcome   slain, captured, wins/beats, falls, crowned, weds, betrothed, beheads/hanged, dies: a fact of that
//             kind is in the story
// `scoreCard(card, story, state)` → { pass, faults: [rule names] }; a card with no summary is scored on its headline.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.WC_PROVIDER = 'mock';
const { createInitialState } = await import('/home/user/wc-s1/public/js/shared/world.js');
const { KINDS } = await import('/home/user/wc-s1/public/js/engine/facts/kinds.js');
const { plainEvent } = await import('/home/user/wc-s1/server/ai/calls/narrate.js');
const STYLE = await import('/tmp/claude-0/-home-user-A-game-of-thrones-local-game/1a59ec30-8b4e-5558-8c33-823b20aa5156/scratchpad/scratch-style.mjs');
const { scoreCard } = await import('/tmp/claude-0/-home-user-A-game-of-thrones-local-game/1a59ec30-8b4e-5558-8c33-823b20aa5156/scratchpad/scratch-scorer.mjs'); // (new in N1)

const load = (name) => JSON.parse(fs.readFileSync('/home/user/wc-s1/tests/fixtures/headlines/' + name + '.json', 'utf8'));
const GOLDEN = load('golden');
const BAD = load('bad');
const state = createInitialState('agot_298', 'stark', { seed: 298 });
const byId = Object.fromEntries(GOLDEN.map((g) => [g.id, g]));
const storyOf = (b) => (typeof b.story === 'string' ? byId[b.story] : b.story);
const RULES = ['len', 'who', 'invented', 'verb', 'numbers', 'punct', 'boiler', 'roles', 'dup', 'outcome'];
const OTHER_RULES = ['script', 'anachronism', 'maturity']; // the existing validators, reported under their own names
const wordsIn = (t) => String(t).trim().split(/\s+/).filter(Boolean);
const tokens = (t) => (String(t).toLowerCase().match(/[a-z][a-z'’-]*/g) || []).map((w) => w.replace(/['’]s$/, ''));
const sentencesIn = (t) => String(t).split(/(?<=[.!?])\s+/).filter(Boolean);
const score = (headline, story, summary) => scoreCard(summary == null ? { headline } : { headline, summary }, typeof story === 'string' ? byId[story] : story, state);
const faultsOf = (headline, story, summary) => score(headline, story, summary).faults;

// ── The fixtures themselves ─────────────────────────────────────────────────────────────────────────────────────────
test('the golden set: well-formed bundles of real facts, real ids, a reference that keeps its own rules', () => {
  const ids = new Set(); const problems = [];
  for (const b of GOLDEN) {
    const bad = (m) => problems.push(`${b.id}: ${m}`);
    if (ids.has(b.id)) bad('id twice'); ids.add(b.id);
    if (!b.facts?.length) bad('no facts');
    for (const f of b.facts || []) {
      if (!KINDS[f.kind]) bad(`no such kind ${f.kind}`);
      for (const a of f.actors || []) if (!state.characters[a]) bad(`no such person ${a}`);
      for (const h of f.houses || []) if (!state.houses[h]) bad(`no such house ${h}`);
      if (f.place && !state.holdings[f.place]) bad(`no such holding ${f.place}`);
      if (!Number.isInteger(f.importance) || f.importance < 1 || f.importance > 5) bad(`importance ${f.importance}`);
      if (!f.text || typeof f.text !== 'string') bad(`${f.kind} has no engine text`);
      const d = f.data || {};
      // parties: the ones the scenario starts with, or hosts raised in play (their ids do not exist in the data)
      for (const k of ['party', 'attacker', 'defender', 'winner', 'loser', 'joined']) if (typeof d[k] === 'string' && !state.parties[d[k]] && !/^(host|rider|kings)_/.test(d[k])) bad(`data.${k} ${d[k]} is no party`);
      if (typeof d.by === 'string' && !state.characters[d.by] && !state.houses[d.by]) bad(`data.by ${d.by}`);
      if (/^letter_/.test(f.kind)) for (const k of ['from', 'to']) if (d[k] && !state.characters[d[k]]) bad(`data.${k} ${d[k]}`);
    }
    if (!b.must?.length) bad('no must');
    const ref = b.reference || ''; const low = ref.toLowerCase();
    for (const m of b.must || []) if (!low.includes(m.toLowerCase())) bad(`the reference does not say "${m}"`);
    for (const m of b.mustNot || []) if (low.includes(m.toLowerCase()) || String(b.summary).toLowerCase().includes(m.toLowerCase())) bad(`says "${m}" from mustNot`);
    if (b.maxWords > 12 || wordsIn(ref).length > b.maxWords) bad(`reference is ${wordsIn(ref).length} words (max ${b.maxWords})`);
    if (/[.…:;()—]|\d/.test(ref)) bad('the reference has a digit or a mark H6 forbids');
    if (!tokens(ref).includes(String(b.verb).toLowerCase())) bad(`the verb "${b.verb}" is not in the reference`);
    const sm = String(b.summary || '');
    if (!sm.endsWith('.') || /…|\.\.\./.test(sm) || sm.length > 340 || sentencesIn(sm).length < 1 || sentencesIn(sm).length > 3) bad('the summary is not 1–3 sentences of at most 340 characters ending in a full stop');
    if (/\d/.test(sm)) bad('a digit in the summary');
    // the summary adds to the headline: it does not say it again
    const H = new Set(tokens(ref)); const S = new Set(tokens(sm));
    const cover = [...H].filter((w) => S.has(w)).length / H.size;
    if (cover >= 0.7) bad(`the summary repeats ${Math.round(cover * 100)}% of the headline's words`);
  }
  assert.deepEqual(problems, []);
});

test('the golden set: every archetype of 18 §2.4 C1 at least three times, and the hard cases of 18 §1.2', () => {
  assert.ok(GOLDEN.length >= 60, `${GOLDEN.length} bundles`);
  const count = {}; for (const b of GOLDEN) count[b.archetype] = (count[b.archetype] || 0) + 1;
  for (const a of ['battle', 'death-in-battle', 'death-natural', 'execution', 'capture', 'siege-begun', 'siege-fell', 'muster', 'march', 'refusal', 'wedding', 'crowning', 'letter', 'rumour', 'omen', 'works', 'harvest', 'tourney', 'feast', 'meanwhile']) assert.ok(count[a] >= 3, `${a}: ${count[a] || 0}`);
  const hasFact = (pred) => GOLDEN.some((b) => b.facts.some(pred));
  // a bynamed lord, a party, the Free Folk, a house with a place suffix, 21 facts, 21 of one kind, no person, an unknown actor
  assert.ok(hasFact((f) => f.actors.some((a) => /"/.test(state.characters[a].name))), 'a bynamed lord (Jon "Greatjon" Umber)');
  assert.ok(hasFact((f) => state.parties[f.data?.party]), 'a party of the scenario');
  assert.ok(hasFact((f) => f.houses.includes('free_folk')), 'the Free Folk');
  assert.ok(hasFact((f) => f.houses.some((h) => / of /.test(state.houses[h].name))), 'a house with a place suffix (Baratheon of King\'s Landing)');
  assert.ok(GOLDEN.some((b) => b.facts.length >= 21), 'a story of 21 facts');
  assert.ok(GOLDEN.some((b) => Object.values(b.facts.reduce((m, f) => ({ ...m, [f.kind]: (m[f.kind] || 0) + 1 }), {})).some((n) => n >= 21)), '21 facts of one kind');
  assert.ok(GOLDEN.filter((b) => b.facts.every((f) => !f.actors.length)).length >= 3, 'stories with no person in them (a storm at sea)');
  assert.ok(GOLDEN.filter((b) => (b.hard || []).includes('unknown-actor')).length >= 2, 'stories whose actor the player\'s house does not know');
  assert.ok(hasFact((f) => f.kind === 'lost_at_sea' && !f.actors.length), 'a storm at sea');
});

test('the bad set: the strings of 18 §1.3 and 20 §5.2 are all there, each with a rule and a story', () => {
  assert.ok(BAD.length >= 33, `${BAD.length} strings`);
  const per = {}; for (const b of BAD) { assert.ok(RULES.includes(b.fails), `${b.headline}: rule ${b.fails}`); assert.ok(storyOf(b)?.facts?.length, `${b.headline}: story ${b.story}`); per[b.fails] = (per[b.fails] || 0) + 1; }
  for (const r of RULES) assert.ok(per[r] >= 2, `${r}: ${per[r] || 0} strings`);
  const has = (h) => assert.ok(BAD.some((b) => b.headline === h), `bad.json lacks: ${h}`);
  // B1–B13 (B10 and B11 are told by their summaries)
  for (const h of ['Host of House Umber (150 men) is raised at Last Hearth', 'House Stark calls its banners: 19 sworn houses are summoned to Winterfell.', 'The King rides north', 'House Arryn calls up 9,977 levies at The Eyrie', 'Host of House Karstark sets out', "House The Free Folk calls up 45,000 levies at Mance Rayder's host", 'House Bolton begins works at The Dreadfort: charter a market & fair.', 'House Arryn holds a tourney at The Eyrie; 16 houses send knights', 'House Tallhart joins The Banners of Stark', "House Lannister and House Stark meet in battle near The Twins; the field is House Lannister's.", 'Rickard Karstark is dead']) has(h);
  assert.ok(BAD.some((b) => /Elsewhere: Dickon Swann leaves Stonehelm/.test(b.summary || '')), 'B10');
  assert.ok(BAD.some((b) => /Elsewhere: Alester Florent leaves Brightwater Keep/.test(b.summary || '')), 'B11');
  // 20 §5.2, the BAD column (row 4 is a roll-up, not a scorer matter; the rest not already above)
  for (const h of ['Host of House Karstark, 1,796 strong, sets out from Karhold for Winterfell (~48 days)', 'Rickard Karstark, Lord of Karhold, has died of old age, aged 61.', 'Alester Florent leaves Brightwater Keep with 110 knights and riders under the Florent banner', 'Robb Stark is slain: cutting blow in the fighting.', "House Baratheon of King's Landing holds a tourney", 'The King rides north. Men say he means to...', 'Refugees flee a besieged holding (mass event on the map)', 'Supplies of the host are short; morale falls (2 cards)', 'Diplomacy: House Tully accepts the proposal of House Stark', 'Raven received from The Eyrie (importance 3)']) has(h);
});

// ── The data the scorer reads (public/data/style.js) ────────────────────────────────────────────────────────────────
test('style.js: the boilerplate, the jargon, the headline length and the verbs are data', () => {
  const { BOILERPLATE, JARGON, HEADLINE_MAX_WORDS, HEADLINE_VERBS } = STYLE;
  assert.equal(HEADLINE_MAX_WORDS, 12);
  for (const [name, list] of [['BOILERPLATE', BOILERPLATE], ['JARGON', JARGON]]) {
    assert.ok(Array.isArray(list) && list.length >= 5, `${name} is a list`);
    for (const x of list) { assert.ok(typeof x === 'string' && x.length, `${name}: ${x}`); assert.doesNotThrow(() => new RegExp(x, 'i'), `${name}: ${x} is a pattern`); }
  }
  // (as FORBIDDEN is: patterns written as strings, read with the "i" flag)
  const said = (t) => [...BOILERPLATE, ...JARGON].some((x) => new RegExp(x, 'i').test(t));
  for (const phrase of ['is raised at', 'sets out from', 'begins works at', 'calls up 9,977 levies', 'answers the call with', 'The host now numbers 896', 'Host of House Karstark, 1,796 strong', 'House The Free Folk', 'The Banners of Stark', "House Baratheon of King's Landing"]) assert.ok(said(phrase), `"${phrase}" is boilerplate`);
  for (const g of GOLDEN) { assert.ok(!said(g.reference), `the reference of ${g.id} is boilerplate`); assert.ok(!said(g.summary), `the summary of ${g.id} is boilerplate`); }
  // the verbs: present, past and participle forms, lower case, one word each
  const verbs = new Set(HEADLINE_VERBS);
  assert.ok(verbs.size >= 100, `${verbs.size} verbs`);
  for (const v of verbs) assert.match(v, /^[a-z]+$/, `${v} is one lower-case word`);
  for (const v of ['refuses', 'refused', 'slain', 'captured', 'marches', 'dies', 'died', 'crowned', 'falls', 'gathers', 'beaten', 'wed', 'betrothed', 'raises', 'sails']) assert.ok(verbs.has(v), `"${v}" is a verb of the news`);
  for (const g of GOLDEN) assert.ok(verbs.has(g.verb.toLowerCase()), `the verb of ${g.id} ("${g.verb}") is in HEADLINE_VERBS`);
  for (const w of ['the', 'of', 'and', 'battle', 'tourney', 'progress']) assert.ok(!verbs.has(w), `"${w}" is no verb`);
});

// ── The scorer ───────────────────────────────────────────────────────────────────────────────────────────────────────
test('scoreCard: a verdict of { pass, faults } that names known rules once each, and touches nothing', () => {
  const g = byId['g-slain-01']; const before = JSON.stringify(state); const bundle = JSON.stringify(g);
  const ok = scoreCard({ headline: g.reference, summary: g.summary }, g, state);
  assert.equal(ok.pass, true); assert.deepEqual(ok.faults, []);
  const no = scoreCard({ headline: 'Battle near the Twins.', summary: 'A battle…' }, g, state);
  assert.equal(no.pass, false); assert.ok(no.faults.length >= 2);
  for (const r of no.faults) assert.ok([...RULES, ...OTHER_RULES].includes(r), `a rule named ${r}`);
  assert.equal(new Set(no.faults).size, no.faults.length, 'each rule once');
  assert.deepEqual(scoreCard({ headline: 'Battle near the Twins.', summary: 'A battle…' }, g, state), no, 'the same card, the same verdict');
  assert.equal(JSON.stringify(state), before, 'the state is left as it was'); assert.equal(JSON.stringify(g), bundle, 'so is the story');
  assert.equal(scoreCard({ headline: g.reference, summary: '' }, g, state).pass, true, 'no summary, no summary rules');
});

test('every reference headline of the golden set passes, alone and with its summary', () => {
  const fails = [];
  for (const g of GOLDEN) {
    const alone = scoreCard({ headline: g.reference }, g, state); const both = scoreCard({ headline: g.reference, summary: g.summary }, g, state);
    if (!alone.pass) fails.push(`${g.id} "${g.reference}": ${alone.faults}`);
    if (!both.pass) fails.push(`${g.id} "${g.reference}" + summary: ${both.faults}`);
  }
  assert.deepEqual(fails, []);
});

test('every string of bad.json fails on the rule it is named for', () => {
  const misses = [];
  for (const b of BAD) { const r = scoreCard({ headline: b.headline, ...(b.summary ? { summary: b.summary } : {}) }, storyOf(b), state); if (r.pass || !r.faults.includes(b.fails)) misses.push(`${b.fails}: "${b.headline}"${b.summary ? ` / "${b.summary.slice(0, 50)}…"` : ''} → [${r.faults}]`); }
  assert.deepEqual(misses, []);
});

test('the scorer\'s report: a table of faults by rule, so a regression is legible', () => {
  const rows = RULES.map((rule) => { const mine = BAD.filter((b) => b.fails === rule); const caught = mine.filter((b) => scoreCard({ headline: b.headline, ...(b.summary ? { summary: b.summary } : {}) }, storyOf(b), state).faults.includes(rule)).length; return { rule, strings: mine.length, caught }; });
  const golden = GOLDEN.filter((g) => scoreCard({ headline: g.reference, summary: g.summary }, g, state).pass).length;
  const line = (r) => `  ${r.rule.padEnd(9)} ${String(r.strings).padStart(3)} strings  ${String(r.caught).padStart(3)} caught  ${r.caught === r.strings ? 'ok' : 'MISSED ' + (r.strings - r.caught)}`;
  console.log(['', 'headline scorer — faults by rule (bad.json)', ...rows.map(line), `  golden references passing: ${golden}/${GOLDEN.length}`].join('\n'));
  assert.ok(rows.every((r) => r.caught === r.strings) && golden === GOLDEN.length);
});

// ── The rules, in the words of the GDD ───────────────────────────────────────────────────────────────────────────────
test('H1: at most twelve words — twelve pass, thirteen fail `len`; two words fail it too', () => {
  const twelve = 'Tywin Lannister beats Roose Bolton at the Twins after a long fight';
  assert.equal(wordsIn(twelve).length, 12);
  assert.deepEqual(faultsOf(twelve, 'g-battle-01'), []);
  const thirteen = 'Tywin Lannister beats Roose Bolton at the Twins after a long hard fight';
  assert.equal(wordsIn(thirteen).length, 13);
  assert.deepEqual(faultsOf(thirteen, 'g-battle-01'), ['len']);
  assert.ok(faultsOf('Robb slain', 'g-slain-01').includes('len'), 'a headline of two words says too little');
});

test('H5: numbers as words, never digits — "1,796" fails, "(~48 days)" fails twice', () => {
  assert.ok(faultsOf('Lord Karstark marches south with 1,796 men', 'g-march-02').includes('numbers'));
  const f = faultsOf('Lord Karstark marches for Winterfell (~48 days)', 'g-march-02');
  assert.ok(f.includes('numbers') && f.includes('punct'), `[${f}]`);
  assert.deepEqual(faultsOf('Lord Karstark marches for Winterfell', 'g-march-02'), [], 'the same headline without them');
  assert.deepEqual(faultsOf('Nineteen northern houses answer Stark\'s call', 'g-muster-05'), [], 'a number the story gives, in words');
});

test('H6: no parentheses, colon, semicolon, em dash, ellipsis; no full stop at the end of a headline', () => {
  for (const [h, why] of [['Lady Hornwood refuses Stark\'s summons (again)', 'parentheses'], ['Hornwood: Lady Donella refuses the summons', 'colon'], ['Lady Hornwood refuses; her men stay at home', 'semicolon'], ['Lady Hornwood refuses — and stays home', 'em dash'], ['Lady Hornwood refuses…', 'ellipsis'], ['Lady Hornwood refuses...', 'three dots'], ['Lady Hornwood refuses Stark\'s summons.', 'full stop']]) assert.ok(faultsOf(h, 'g-refusal-01').includes('punct'), why);
});

test('H7: "House The Free Folk" and the other boilerplate of the ledger fail `boiler`', () => {
  assert.ok(faultsOf('House The Free Folk gathers beyond the Wall', 'g-muster-04').includes('boiler'));
  for (const [h, story] of [['Lord Umber answers the call with his banners', 'g-muster-02'], ['Lord Karstark sets out from Karhold for Winterfell', 'g-march-02'], ["Lord Umber's host is raised at Last Hearth", 'g-muster-02'], ['House Bolton begins works at the Dreadfort', 'g-works-01'], ['House Tallhart joins The Banners of Stark', 'g-march-02'], ["Lord Karstark's morale rises at Karhold", 'g-march-02']]) assert.ok(faultsOf(h, story).includes('boiler'), h);
  assert.ok(faultsOf('Greatjon Umber raises his men at Last Hearth', 'g-muster-02', 'The host now numbers some two thousand men.').includes('boiler'), 'the summary too');
  assert.ok(!faultsOf("Lysa Arryn raises the Vale's banners at the Eyrie", 'g-muster-03').includes('boiler'), 'banners, in lower case and no party\'s name, are fine');
});

test('H8: the outcome is never reversed — slain and slayer, captive and captor, victor and vanquished', () => {
  assert.deepEqual(faultsOf('Robb Stark slain by Tywin Lannister at the Twins', 'g-slain-01'), []);
  for (const [h, story] of [['Tywin Lannister slain by Robb Stark at the Twins', 'g-slain-01'], ['Robb Stark slays Tywin Lannister at the Twins', 'g-slain-01'], ['Robb Stark captured by Jaime Lannister near Riverrun', 'g-capture-01'], ['Roose Bolton beats Tywin Lannister at the Twins', 'g-battle-01'], ['Ser Stevron Frey slays Addam Marbrand at Whitewalls', 'g-slain-02']]) assert.ok(faultsOf(h, story).includes('roles'), h);
  assert.deepEqual(faultsOf('Jaime Lannister captured by Robb Stark near Riverrun', 'g-capture-01'), []);
  assert.deepEqual(faultsOf('Tywin Lannister beats Roose Bolton at the Twins', 'g-battle-01'), []);
});

test('H4: nothing the story does not name — "Ser Barristan" in a Stark muster story fails `invented`', () => {
  assert.ok(faultsOf('Ser Barristan raises the northern banners at Winterfell', 'g-muster-01').includes('invented'));
  assert.deepEqual(faultsOf('Eddard Stark raises the northern banners at Winterfell', 'g-muster-01'), [], 'Lord Eddard, who called them, may');
  assert.ok(faultsOf('Lord Karstark marches for Riverrun', 'g-march-02').includes('invented'), 'a castle the story never names');
  assert.ok(faultsOf('Robb Stark slain by Jaime Lannister at the Twins', 'g-slain-01').includes('invented'), 'a person the story never names');
  assert.ok(faultsOf("Lady Hornwood refuses Stark's summons", 'g-refusal-01', 'Donella Hornwood is kept at home by Ser Barristan.').includes('invented'), 'in the summary as well');
});

test('S2: an ellipsis in a summary fails `punct`, and so does a summary cut short without its full stop', () => {
  const h = "Lady Hornwood refuses Stark's summons";
  assert.ok(faultsOf(h, 'g-refusal-01', 'Donella Hornwood will keep her men at home, and word of it…').includes('punct'));
  assert.ok(faultsOf(h, 'g-refusal-01', 'Donella Hornwood will keep her men at home, and word of it...').includes('punct'));
  assert.ok(faultsOf(h, 'g-refusal-01', 'Donella Hornwood will keep her men at home').includes('punct'));
  assert.deepEqual(faultsOf(h, 'g-refusal-01', 'Donella Hornwood will keep her men at home.'), []);
});

test('S2: a summary that is the headline again fails `dup`', () => {
  const g = byId['g-slain-01'];
  assert.ok(faultsOf(g.reference, g, `${g.reference}.`).includes('dup'));
  assert.ok(faultsOf('Karhold raises a new granary', 'g-works-03', 'Karhold raises a new granary.').includes('dup'));
  assert.deepEqual(faultsOf(g.reference, g, g.summary), []);
});

test('S1: a summary is one to three sentences and at most 340 characters', () => {
  const h = "Lady Hornwood refuses Stark's summons";
  assert.deepEqual(faultsOf(h, 'g-refusal-01', 'Donella Hornwood will keep her men at home. She says the harvest is not in. Her neighbours have not been told.'), [], 'three sentences');
  assert.ok(faultsOf(h, 'g-refusal-01', 'Donella Hornwood will keep her men at home. She says the harvest is not in. Her neighbours have not been told. Nobody minded.').includes('len'), 'four');
});

test('outcome: "slain" with no death fact in the story fails `outcome`; with one it passes', () => {
  const g = byId['g-battle-01'];
  assert.ok(faultsOf('Roose Bolton slain by Tywin Lannister at the Twins', g).includes('outcome'));
  const withDeath = { ...g, facts: [...g.facts, { id: 'f1.9', kind: 'slain_in_battle', actors: ['roose_bolton'], houses: ['bolton'], place: 'frey', data: { by: 'tywin_lannister', cause: 'killed in battle near The Twins' }, importance: 4, text: 'Roose Bolton is slain — killed in battle near The Twins.' }] };
  assert.deepEqual(faultsOf('Roose Bolton slain by Tywin Lannister at the Twins', withDeath), []);
  assert.ok(faultsOf('Robb Stark crowned King in the North at Riverrun', 'g-battle-02').includes('outcome'), 'crowned');
  assert.ok(faultsOf('Riverrun falls to Jaime Lannister', 'g-siege-01').includes('outcome'), 'falls, with the siege only begun');
});

test('D-058: news headlines — present tense and a bare passive participle pass `verb`, past passes, a noun phrase fails', () => {
  assert.deepEqual(faultsOf("Lady Hornwood refuses Stark's summons", 'g-refusal-01'), [], 'present');
  assert.deepEqual(faultsOf("Lady Hornwood refused Stark's summons", 'g-refusal-01'), [], 'past');
  assert.deepEqual(faultsOf('Robb Stark slain by Tywin Lannister at the Twins', 'g-slain-01'), [], 'a bare participle');
  for (const [h, story] of [['Battle near the Twins', 'g-battle-01'], ['Tourney at the Eyrie', 'g-tourney-01'], ['The Lannister victory at the Twins', 'g-battle-01']]) assert.ok(faultsOf(h, story).includes('verb'), h);
  assert.ok(faultsOf('Karstark banners at Karhold', 'g-march-02').includes('verb'));
});

test('H3: a headline names who — a story with no one in it is named by its place or party, and a nameless one fails `who`', () => {
  assert.deepEqual(faultsOf('A storm scatters the Iron Fleet off Pyke', 'g-storm-01'), [], 'no person: a party and a place');
  assert.deepEqual(faultsOf('Karhold raises a new granary', 'g-works-03'), [], 'no person: a place');
  assert.ok(faultsOf('The northern banners gather', 'g-muster-01').includes('who'));
  assert.ok(faultsOf('The Freys march to war', 'g-battle-04').includes('who'), 'a house that is not in the story');
  assert.ok(!faultsOf('The Starks march to war', 'g-battle-04').includes('who'), 'a house that is');
});

// ── Regression evidence: what the game says today ────────────────────────────────────────────────────────────────────
test('regression evidence: the current mock\'s telling (plainEvent) scores under half on the golden set', () => {
  // N3 flips this: the writer's cardOf must pass ≥ 98 % (target 100 %); N5 drops plainEvent with the old mock
  const hist = {}; let passing = 0;
  for (const g of GOLDEN) {
    const facts = g.facts.map((f) => ({ ...f, day: 1 }));
    const story = { id: 'S1', facts, actors: [...new Set(facts.flatMap((f) => f.actors))], houses: [...new Set(facts.flatMap((f) => f.houses))], place: facts.find((f) => f.place)?.place || null, days: [1, 1], importance: Math.max(...facts.map((f) => f.importance)), pov: null };
    const e = plainEvent(state, story);
    const r = scoreCard({ headline: e.headline, summary: e.line }, g, state);
    if (r.pass) passing++; for (const f of r.faults) hist[f] = (hist[f] || 0) + 1;
  }
  const rate = passing / GOLDEN.length;
  console.log(`\nthe mock's telling today: ${passing}/${GOLDEN.length} pass (${Math.round(rate * 100)} %); faults ${Object.entries(hist).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ')}`);
  assert.ok(rate < 0.5, `${Math.round(rate * 100)} % of the mock's cards already pass: the scorer is too lenient`);
});
