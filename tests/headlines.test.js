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
const { createInitialState } = await import('../public/js/shared/world.js');
const { KINDS } = await import('../public/js/engine/facts/kinds.js');
const { plainEvent } = await import('../server/ai/calls/narrate.js');
const STYLE = await import('../public/data/style.js');
const { scoreCard } = await import('../server/ai/validate/headline.js'); // (new in N1)

const load = (name) => JSON.parse(fs.readFileSync(new URL(`./fixtures/headlines/${name}.json`, import.meta.url), 'utf8'));
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

// ── Review round: the holes an adversarial reader found in the scorer (WP N1) ────────────────────────────────────────
const { roughly } = await import('../public/js/engine/facts/label.js');
const { hasVerb, entitiesIn } = await import('../server/ai/validate/headline.js');
const detailOf = (headline, story, summary) => score(headline, story, summary).detail.map((d) => `${d.rule}: ${d.text}`).join(' | ');

test('numbers: the writer\'s own roughly() words are the story\'s numbers ("nearly two thousand" for 1,796), other roundings are not', () => {
  // (the words are what label.js says today; pinned so a change of roughly() shows here)
  assert.deepEqual([1796, 150, 45000, 3100].map(roughly), ['nearly two thousand', 'some two hundred', 'some fifty thousand', 'some three thousand']);
  assert.deepEqual(faultsOf('Lord Karstark marches south with nearly two thousand men', 'g-march-02'), [], '1,796');
  assert.deepEqual(faultsOf('Greatjon Umber raises some two hundred men at Last Hearth', 'g-muster-02'), [], '150');
  assert.deepEqual(faultsOf('Greatjon Umber raises a hundred and fifty men at Last Hearth', 'g-muster-02'), [], '150, exactly, in words');
  assert.deepEqual(faultsOf('Mance Rayder gathers some fifty thousand wildlings', 'g-muster-04'), [], '45,000');
  assert.deepEqual(faultsOf('Tywin Lannister beats Roose Bolton', 'g-battle-01', 'The northmen lost some three thousand men at the ford.'), [], '3,100, in a summary');
  // not the story's: a round figure the story never rounds to
  assert.ok(faultsOf('Mance Rayder gathers some thirty thousand wildlings', 'g-muster-04').includes('numbers'), '30,000 is no rounding of 45,000');
  assert.ok(faultsOf('Lord Karstark marches south with a thousand men', 'g-march-02').includes('numbers'), 'a thousand is not 1,796');
  assert.ok(faultsOf('Tywin Lannister beats Roose Bolton', 'g-battle-01', 'The northmen lost some four thousand men at the ford.').includes('numbers'), '4,000 is no rounding of 3,100');
});

test('dup: a summary that names the same people is not a restatement; one that says the headline again is, at 0.8 and no lower', () => {
  const h = 'Robb Stark slain by Tywin Lannister at the Twins';
  assert.ok(!faultsOf(h, 'g-slain-01', 'Robb Stark was killed by Tywin Lannister during the fighting at the Twins.').includes('dup'), 'the same names, another telling');
  assert.ok(faultsOf(h, 'g-slain-01', 'Robb Stark slain by Tywin Lannister at the Twins.').includes('dup'), 'restated');
  assert.ok(faultsOf(h, 'g-slain-01', 'Robb Stark slain.').includes('dup'), 'a piece of the headline, said as a summary');
  // five words of the headline that are no name (quickly, calls, all, northern, banners): four said again fail, three do not
  const five = 'Eddard Stark quickly calls all northern banners to Winterfell';
  assert.ok(faultsOf(five, 'g-muster-01', 'Eddard quickly calls all northern lords.').includes('dup'), '4 of 5');
  assert.ok(!faultsOf(five, 'g-muster-01', 'Everyone calls all northern folk.').includes('dup'), '3 of 5');
  assert.ok(!faultsOf(five, 'g-muster-01', 'Nineteen sworn houses are told to bring their men to the castle.').includes('dup'), 'a clearly different summary');
});

test('verb: the news present has a fallback — a word after the subject\'s name, and a wide lexicon; nouns after a name still fail', () => {
  const V = STYLE.HEADLINE_VERBS;
  for (const v of ['clash', 'clashes', 'drives', 'driven', 'drove', 'jails', 'arrests', 'names', 'rings', 'threatens', 'cuts', 'seizes', 'storms', 'sacks', 'relieves', 'lifts', 'dead']) assert.ok(V.includes(v), `"${v}" is a verb of the news`);
  for (const [h, story] of [['Tywin Lannister drives Roose Bolton from the Twins', 'g-battle-01'], ['Robb Stark jails Jaime Lannister', 'g-capture-01'], ['Lord Karstark names Harrion his heir', 'g-death-01'],
    ['Jaime Lannister rings Riverrun', 'g-siege-01'], ['Roose Bolton and Tywin Lannister clash at the Twins', 'g-battle-01'], ['Lady Hornwood threatens to hold her men back', 'g-refusal-01'],
    ['Roose Bolton is driven from the Twins', 'g-battle-01'], ['Rickard Karstark dead at Karhold', 'g-death-01']]) assert.deepEqual(faultsOf(h, story), [], h);
  // a verb the lexicon lacks, right after a person's name, is still a verb; a plural noun after a house or a person is not
  assert.deepEqual(faultsOf('Tywin Lannister requisitions the ford at the Twins', 'g-battle-01'), []);
  for (const [h, story] of [['Karstark banners at Karhold', 'g-march-02'], ['Lord Umber banners at Last Hearth', 'g-muster-02'], ["Lord Karstark's banners at Karhold", 'g-march-02']]) assert.ok(faultsOf(h, story).includes('verb'), h);
  // (a headline that opens on a noun the lexicon also has as a verb does not count it)
  assert.ok(faultsOf('Work at Karhold', 'g-works-03').includes('verb'));
  // the reader of the subject: a person or a party right before the word
  const h = 'Tywin Lannister requisitions the ford'; assert.ok(hasVerb(h, entitiesIn(state, h, { start: true })));
  assert.ok(!hasVerb(h, []), 'without the subject the unknown word is only a word');
});

test('roles: "X wins/loses at P" is checked against the winner and the loser, and a draw has neither', () => {
  assert.ok(faultsOf('Roose Bolton wins at the Twins', 'g-battle-01').includes('roles'), 'Tywin won');
  assert.ok(faultsOf('Tywin Lannister loses at the Twins', 'g-battle-01').includes('roles'), 'Tywin won');
  assert.deepEqual(faultsOf('Tywin Lannister wins at the Twins', 'g-battle-01'), []);
  assert.deepEqual(faultsOf('Roose Bolton loses at the Twins', 'g-battle-01'), []);
  assert.deepEqual(faultsOf('Robb Stark wins the tourney at the Eyrie', { facts: [{ id: 'f1', kind: 'tourney_result', actors: ['robb_stark'], houses: ['stark'], place: 'arryn', data: {}, importance: 3, text: 'Robb Stark is champion of the tourney at The Eyrie.' }], must: ['Robb Stark'], mustNot: [] }), [], 'a tourney is no battle: nothing to check it against');
  // a draw: nobody beats, wins or loses
  for (const h of ['Addam Marbrand beats Edmure Tully near Whitewalls', 'Addam Marbrand wins near Whitewalls', 'Edmure Tully loses near Whitewalls', 'Edmure Tully beaten by Addam Marbrand near Whitewalls']) assert.ok(faultsOf(h, 'g-battle-03').includes('roles'), `a draw: ${h}`);
  assert.deepEqual(faultsOf('Addam Marbrand and Edmure Tully fight to a draw near Whitewalls', 'g-battle-03'), []);
});

test('roles: "cut down", "takes X prisoner", "seizes" and a siege are read like slain, captured and besieged — and not reversed', () => {
  assert.ok(faultsOf('Robb Stark cuts down Tywin Lannister', 'g-slain-01').includes('roles'));
  assert.ok(faultsOf('Tywin Lannister cut down by Robb Stark', 'g-slain-01').includes('roles'));
  assert.deepEqual(faultsOf('Robb Stark cut down by Tywin Lannister', 'g-slain-01'), []);
  assert.deepEqual(faultsOf('Tywin Lannister cuts down Robb Stark', 'g-slain-01'), []);
  assert.ok(faultsOf('Jaime Lannister takes Robb Stark prisoner', 'g-capture-01').includes('roles'));
  assert.deepEqual(faultsOf('Robb Stark takes Jaime Lannister prisoner', 'g-capture-01'), []);
  assert.ok(faultsOf('Jaime Lannister seizes Robb Stark', 'g-capture-01').includes('roles'));
  assert.ok(faultsOf('Robb Stark seized by Jaime Lannister', 'g-capture-01').includes('roles'));
  assert.deepEqual(faultsOf('Jaime Lannister seized by Robb Stark', 'g-capture-01'), []);
  assert.deepEqual(faultsOf('Robb Stark captured Jaime Lannister', 'g-capture-01'), [], 'the past, active: the agent is the one before the verb');
  assert.ok(faultsOf('Jaime Lannister captured Robb Stark', 'g-capture-01').includes('roles'));
  assert.ok(faultsOf('Riverrun lays siege to Jaime Lannister', 'g-siege-01').includes('roles'));
  assert.ok(faultsOf('Jaime Lannister besieged by Riverrun', 'g-siege-01').includes('roles'));
  assert.deepEqual(faultsOf('Jaime Lannister lays siege to Riverrun', 'g-siege-01'), []);
  assert.deepEqual(faultsOf('Riverrun besieged by Jaime Lannister', 'g-siege-01'), []);
  assert.ok(faultsOf('Gregor Clegane lays siege to Stannis Baratheon', 'g-siege-02').includes('roles'), 'the wrong besieged');
});

test('roles: a story\'s battle (world.js note) names its winner as a house and no winnerHouse — the scorer reads it', () => {
  const story = { facts: [{ id: 'f1.1', kind: 'battle', actors: [], houses: ['stark', 'lannister'], place: 'tully', data: { attacker: 'stark', defender: 'lannister', winner: 'stark', lost: { stark: 700, lannister: 4200 } }, importance: 4, text: 'Battle near Riverrun: victory for House Stark.' }], must: ['Riverrun'], mustNot: [] };
  assert.ok(faultsOf('Lannisters beat the Starks near Riverrun', story).includes('roles'));
  assert.ok(faultsOf('The Starks lose near Riverrun', story).includes('roles'));
  assert.deepEqual(faultsOf('The Starks beat the Lannisters near Riverrun', story), []);
  const draw = { ...story, facts: [{ ...story.facts[0], data: { ...story.facts[0].data, winner: null } }] };
  assert.ok(faultsOf('The Starks beat the Lannisters near Riverrun', draw).includes('roles'), 'no winner: no one beats');
});

test('outcome: "takes" or "storms" a holding needs a fall, a storming or a grant in the story — a siege only begun is not one', () => {
  assert.ok(faultsOf('Jaime Lannister storms Riverrun', 'g-siege-01').includes('outcome'));
  assert.ok(faultsOf('Jaime Lannister takes Riverrun', 'g-siege-01').includes('outcome'));
  assert.ok(faultsOf('Riverrun taken by Jaime Lannister', 'g-siege-01').includes('outcome'));
  assert.ok(faultsOf('Jaime Lannister captures Riverrun', 'g-siege-01').includes('outcome'));
  assert.deepEqual(faultsOf('Jaime Lannister lays siege to Riverrun', 'g-siege-01'), []);
  assert.deepEqual(faultsOf('Gregor Clegane storms Darry', 'g-fell-03'), [], 'a storming');
  assert.deepEqual(faultsOf('Tywin Lannister takes Harrenhal', 'g-fell-01'), [], 'a fall');
  assert.deepEqual(faultsOf('Harrenhal taken by Tywin Lannister', 'g-fell-01'), []);
  assert.deepEqual(faultsOf("Lord Karstark's son takes Karhold", 'g-death-01'), [], '20 §5.2 row 10: an inheritance is a holding taken too');
  assert.deepEqual(faultsOf('Black rot takes the wheat at Horn Hill', 'g-harvest-02'), [], 'no holding');
});

test('invented: a house\'s plural opening the headline is not that house; a name the game does not know, given away by an honorific or a castle, is invented', () => {
  assert.deepEqual(faultsOf('Hunters bring down a white stag near Karhold', 'g-omen-02'), [], 'Hunter is a house, and a word');
  assert.ok(faultsOf('Lord Karstark marches south with Ser Aldric Vance', 'g-march-02').includes('invented'), 'Ser + a name no one has');
  assert.ok(faultsOf('Maester Corwin sees Rickard Karstark die at Karhold', 'g-death-01').includes('invented'), 'Maester + a name no one has');
  assert.ok(faultsOf('Lord Karstark marches for Blackmoor Keep', 'g-march-02').includes('invented'), 'a keep no map has');
  assert.ok(faultsOf('Lord Karstark holds a feast at Blackmoor Hall', 'g-march-02').includes('invented'));
  assert.ok(faultsOf('Lord Karstark marches for Castle Blackmoor', 'g-march-02').includes('invented'));
  // and the names the game does know pass: a title alone, a seat named with a possessive, a keep the story has, the Red Keep
  assert.deepEqual(faultsOf('King Robert holds a tourney at King\'s Landing', 'g-tourney-02'), []);
  assert.deepEqual(faultsOf('King Robert holds a tourney at the Red Keep', 'g-tourney-02'), []);
  assert.ok(entitiesIn(state, "Stannis Baratheon besieges Storm's End").some((e) => e.kind === 'place' && e.text === "Storm's End"), 'a place with a possessive is a place');
  assert.ok(faultsOf("Robb Stark slain at King's Landing", 'g-slain-01').includes('invented'), '... and one the story does not have is invented');
});

test('punct: mark-up, a spaced hyphen and an emoji fail, in the headline and in the summary', () => {
  for (const h of ['Lord Karstark marches south [again]', 'Lord Karstark marches <south>', 'Lord Karstark marches *south*', 'Lord Karstark marches south #war', 'Lord Karstark marches south - at last', 'Lord Karstark marches south 🐺']) assert.ok(faultsOf(h, 'g-march-02').includes('punct'), h);
  for (const s of ['The road is long. It is **very** long.', 'The road is long - very long.', 'The road is long 🐺.']) assert.ok(faultsOf('Lord Karstark marches south', 'g-march-02', s).includes('punct'), s);
  assert.deepEqual(faultsOf('A two-headed calf is born near Hornwood', 'g-omen-03'), [], 'a hyphen inside a word is a hyphen');
});

test('boiler: the jargon is the engine\'s, not English — "levies", "stories" and "in fact" are fine; ids, counts and importance are not', () => {
  const said = (t) => [...STYLE.BOILERPLATE, ...STYLE.JARGON].some((x) => new RegExp(x, 'i').test(t));
  for (const t of ['story S3', 'stories S3', 'fact f1.2', 'S3 tells', 'importance 3', 'an op is run', '1,796 strong', 'two thousand strong', 'The host now numbers 896', 'calls up 9,977 levies']) assert.ok(said(t), t);
  for (const t of ['The old stories of the Long Night', 'In fact he stayed', 'Lord Arryn raises his levies', 'a story is told']) assert.ok(!said(t), t);
  assert.deepEqual(faultsOf('Lysa Arryn raises her levies at the Eyrie', 'g-muster-03'), []);
  assert.deepEqual(faultsOf('Weirwood weeps red sap at Winterfell', 'g-omen-01', 'The old stories of the Long Night call it an omen, and in fact the smallfolk agree.'), []);
});

test('the checks that reuse the narration validator each fail a crafted card: script, anachronism, maturity, mustNot', () => {
  assert.ok(faultsOf('Lord Karstark marches south 北方', 'g-march-02').includes('script'), 'a CJK leak');
  assert.ok(faultsOf('Lord Karstark marches south', 'g-march-02', 'Он идёт на юг.').includes('script'), 'a Cyrillic summary');
  assert.ok(faultsOf('Lord Karstark marches for the Red Wedding', 'g-march-02').includes('anachronism'), 'a later chapter');
  assert.ok(faultsOf('Lord Karstark marches south', 'g-march-02', 'The men speak of the Red Wedding.').includes('anachronism'), '... in the summary');
  assert.deepEqual(faultsOf(byId['g-crown-01'].reference, 'g-crown-01', byId['g-crown-01'].summary), [], 'unless the story\'s own facts say it');
  assert.ok(faultsOf('Lord Karstark marches south', 'g-march-02', 'His men speak of intercourse on the road.').includes('maturity'));
  assert.ok(faultsOf("Lady Hornwood refuses the Karstark summons", 'g-refusal-01').includes('invented'), 'mustNot: Karstark');
  assert.match(detailOf("Lady Hornwood refuses the Karstark summons", 'g-refusal-01'), /must not say/);
  assert.ok(faultsOf('Lady Hornwood refuses Stark\'s summons', 'g-refusal-01', 'Donella will not send Barristan.').includes('invented'), 'mustNot: Barristan, in a summary');
});

// ── Review round, part two: places with an apostrophe, offices, and the free cities ──────────────────────────────────────
const placeStory = (place, house, text = 'Something happened.', actors = []) => ({ facts: [{ id: 'f1.1', kind: 'happening', actors, houses: [house], place, data: {}, importance: 2, text }], must: [], mustNot: [] });

test('places with an apostrophe are read, straight or curly: a story of a place only can pass `who` at "Storm\'s End", "Widow\'s Watch", "King\'s Landing"', () => {
  for (const [h, place, house] of [["Fire breaks out at Storm's End", 'baratheon_se', 'baratheon_se'], ['Fire breaks out at Storm’s End', 'baratheon_se', 'baratheon_se'],
    ["Wolves gather near Widow's Watch", 'flint', 'flint'], ['Wolves gather near Widow’s Watch', 'flint', 'flint'],
    ["Rats overrun the Street of Steel at King's Landing", 'baratheon', 'baratheon'], ['Rats overrun the Street of Steel at King’s Landing', 'baratheon', 'baratheon'],
    ["Riots break out at the Sealord's Palace", 'braavos', 'braavos'], ['Riots break out at the Sealord’s Palace', 'braavos', 'braavos']]) assert.deepEqual(faultsOf(h, placeStory(place, house)), [], h);
  // the entities are read from the text as it is
  for (const [t, kind, text] of [["Stannis Baratheon besieges Storm's End", 'place', "Storm's End"], ['Fire at Widow’s Watch', 'place', 'Widow’s Watch'], ["The Night's Watch rides out", 'house', "Night's Watch"]]) {
    assert.ok(entitiesIn(state, t, { start: true }).some((e) => e.kind === kind && e.text === text), `${kind} "${text}" in "${t}"`);
  }
  // and a place the story does not have is a place it does not have
  const karhold = placeStory('karstark', 'karstark');
  assert.ok(faultsOf("Fire breaks out at Storm's End", karhold).includes('invented'));
  assert.ok(faultsOf("Fire breaks out at Storm's End", karhold).includes('who'));
});

test('offices: "the Queen", "the King", "the Hand" mean the story\'s own holder of the office — not the crown\'s, and not invented', () => {
  const death = (id, place, cause) => ({ facts: [{ id: 'f1.1', kind: 'death', actors: [id], houses: [state.characters[id].house], place, data: { cause, how: 'fever' }, importance: 3, text: `${state.characters[id].name} is dead.` }], must: [], mustNot: [] });
  // the Queen of the story is not the Queen the crown has (the alias reads "the Queen" as Cersei)
  const rhaella = death('rhaella_targaryen', 'baratheon_ds', 'a fever');
  assert.deepEqual(faultsOf('The Queen dies of a fever at Dragonstone', rhaella), []);
  assert.ok(faultsOf('The Queen dies at Karhold', 'g-death-01').includes('invented'), 'no queen in that story');
  // the Hand: no alias knows the office; a story of the man who held it
  const jon = death('jon_arryn', 'arryn', 'a fever');
  assert.deepEqual(faultsOf('The Hand dies of a fever at the Eyrie', jon), []);
  assert.deepEqual(faultsOf('The Hand of the King dies of a fever at the Eyrie', jon), []);
  assert.ok(faultsOf('The Hand names a new captain at Karhold', 'g-march-02').includes('invented'), 'no Hand in that story');
  assert.ok(faultsOf('The Hand names a new captain', 'g-march-02').includes('who'), 'and names no one of the story');
  // the King: the story's, and the crown's when the story has him
  assert.deepEqual(faultsOf('The King holds a tourney at King\'s Landing', 'g-tourney-02'), []);
  assert.ok(faultsOf('The King rides north', 'g-march-02').includes('invented'));
  // "the King" inside "the Hand of the King" is not the King
  const ents = entitiesIn(state, 'The Hand of the King dies', { start: true });
  assert.deepEqual(ents.map((e) => [e.kind, e.ids[0]]), [['office', 'hand']]);
});

test('a free city is house and holding at once: "Pentos" and "Braavos" are the story\'s when its place or its house is', () => {
  // (a story of a Pentoshi galley, told at Widow's Watch: the house is Pentos, the place is not)
  assert.deepEqual(faultsOf("Pentos loses a galley off Widow's Watch", 'g-meanwhile-03'), []);
  assert.ok(faultsOf("Pentos loses a galley off Widow's Watch", 'g-meanwhile-01').includes('invented'), 'a story without Pentos');
  // (a story told at Braavos, no house named: the house is the city)
  const braavos = placeStory('braavos', 'braavos');
  assert.deepEqual(faultsOf('Braavos raises a new harbour chain', { ...braavos, facts: [{ ...braavos.facts[0], houses: [] }] }), []);
  assert.deepEqual(faultsOf('House Braavos raises a new harbour chain', { ...braavos, facts: [{ ...braavos.facts[0], houses: [] }] }), [], 'the house named, the place the story has');
  // an ordinary house and its castle are not the same thing: Tully is not Riverrun
  assert.ok(faultsOf('House Tully sends a raven to Riverrun', placeStory('tully', 'lannister')).includes('invented'), 'House Tully is not in a story of Lannisters at Riverrun');
});
