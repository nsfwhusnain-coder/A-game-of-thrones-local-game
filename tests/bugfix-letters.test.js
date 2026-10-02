// Bug hunt, the letters group (docs/BUG-HUNT-2026-10-02.md): TX1 a letter is quoted by what it says, not its greeting; TX2 no engine note on a letter card;
// TX3 garbled words are refused; TX6 a rumour is no part of the muster; TX7 the dossier of an audience says where the scene is and how the lord is addressed;
// TX8 the advisor's count and the suggestions as text; TX10 a long turn says so. Mock only: the model's own words are the recorded transcripts in
// docs/bughunt/live-samples/ (the letters quoted here are the ones those transcripts show).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.WC_SAVES = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-letters-'));
process.env.WC_PROVIDER = 'mock';
const game = await import('../server/game.js');
const { quoteOf, isGreeting } = await import('../public/js/engine/facts/quote.js');
const { createInitialState } = await import('../public/js/shared/world.js');
const { garbledIn } = await import('../server/ai/validate/narration.js');
const { CALLS } = await import('../server/ai/calls/index.js');
const { askedCount } = await import('../server/ai/calls/council.js');
const { addressOf: address } = await import('../server/ai/calls/audience.js');
const { suggestionsOf } = await import('../server/prompts.js');
const { clusterFacts } = await import('../public/js/engine/facts/cluster.js');
const { emit } = await import('../public/js/engine/facts/log.js');

test('TX1: a letter is quoted by what it says, not by its greeting', () => {
  assert.equal(quoteOf('Eddard. My dear Ned, I write to ask for your help, and I will pay in gold for it. Come to Riverrun.'), 'I write to ask for your help, and I will pay in gold for it.');
  assert.equal(quoteOf('Lord Targaryen. I have your letter, and I will answer it in person. — Stannis'), 'I have your letter, and I will answer it in person.');
  assert.equal(quoteOf('My dear Prince, my lord—the words you send me are like a fine vintage, warming the blood and stirring the spirit.'), 'The words you send me are like a fine vintage, warming the blood and stirring the spirit.');
  assert.equal(quoteOf('Tywin Lannister. Lord of Casterly Rock. I have the honour to write.'), 'I have the honour to write.');
  assert.equal(quoteOf('*He looks up.* Agreed. We ride at dawn.'), 'Agreed. We ride at dawn.', 'a gesture is not a word, and an answer is not a greeting');
  assert.equal(quoteOf('No.'), 'No.', 'the whole of a letter that refuses');
  assert.equal(quoteOf('Eddard.'), 'Eddard.', 'a letter of nothing else is quoted as it is');
  assert.ok(isGreeting('Eddard.') && isGreeting('Lord Targaryen.') && isGreeting('My dear Ned,') && !isGreeting('No.') && !isGreeting('I will come.'));
  assert.ok(quoteOf('A '.repeat(200)).length <= 221, 'a long one is clipped');
});

test('TX1, TX2: the card of a reply by raven quotes what the letter says and carries no engine note', async () => {
  const { id } = game.newGame('agot_298', 'stark', { seed: 298 });
  const r = await game.talk(id, 'hoster_tully', 'Eddard. My dear Ned, I write to ask for your help, and I will pay in gold for it. Come to Riverrun.');
  assert.ok(r.raven, 'a letter went out');
  let arrived = null;
  for (let i = 0; i < 14 && !arrived; i++) {
    await game.advance(id, { span: '1d', orders: [] }); await game.settled(id);
    arrived = game.readFacts(id, {}).find((f) => f.kind === 'letter_arrived' && f.data?.from === 'hoster_tully');
  }
  assert.ok(arrived, 'the answer arrived');
  assert.match(arrived.text, /^A raven from [^:]+: “[^”]{8,}”$/, `the fact is the place and the words, nothing else: ${arrived.text}`);
  assert.doesNotMatch(arrived.text, /opinion|LOAN|Agreed in audience|—/, 'no bookkeeping note, no figure of the engine');
  assert.doesNotMatch(arrived.text, /“(?:Eddard|Lord [A-Z]\w+)\.”/, 'not the greeting');
});

test('TX3: garbled words are refused, in an audience and in a council', () => {
  assert.match(garbledIn('...and they1. I worry for the children, Ned.'), /glued/);
  assert.match(garbledIn('We should be clearer than the... ...the present.'), /ellipsis/);
  assert.match(garbledIn('Aye, my lord.<|im_end|>'), /token/);
  assert.equal(garbledIn('On the 3rd day of the 8th moon the 10th host, 1st of the levies, rode out... and was not seen again.'), '', 'ordinals and one ellipsis are language');
  const s = createInitialState('agot_298', 'stark', { seed: 7 });
  const ctx = CALLS.audience.context(s, { character: 'roose_bolton', words: 'Bring your men to Moat Cailin.', stance: { verdict: 'refuse', I: {} } });
  const bad = { beats: [{ kind: 'speech', text: 'No, my lord, and they1. I worry for the children.' }], outcome: { agrees_to: [], asks_for: '', reveals: 'none', mood: 'cold' } };
  assert.ok(CALLS.audience.check(bad, ctx).some((p) => /glued/.test(p)), 'the audience check refuses it');
  const cctx = CALLS.council.context(s, { members: ['luwin'], words: 'What now?' });
  assert.ok(CALLS.council.check({ speeches: [{ speaker: 'luwin', text: 'It is clearer than the... ...the present.' }] }, cctx).some((p) => /ellipsis/.test(p)), 'the council check refuses it');
});

test('TX6: a sworn knight\'s grievance is no part of the muster it was told beside', () => {
  const s = createInitialState('agot_298', 'stark', { seed: 7 });
  emit(s, 'levies_called', { actors: ['eddard_stark'], houses: ['stark'], place: 'stark', importance: 3, text: 'Eddard Stark raises the northern banners at Winterfell.' });
  emit(s, 'hook', { actors: [], houses: ['stark'], place: 'stark', importance: 2, data: { hook: 'vassal_grievance' }, text: 'A sworn knight of House Stark complains openly at Winterfell that Eddard Stark favours others at court.' });
  const { stories } = clusterFacts(s, s.facts);
  assert.equal(stories.length, 2, `two stories (${stories.map((x) => x.facts.map((f) => f.kind).join('+')).join(' / ')})`);
  // and a village burned (a fact that names no one) is still told with the battle at it
  const t = createInitialState('agot_298', 'stark', { seed: 7 });
  emit(t, 'battle', { actors: ['rodrik_cassel'], houses: ['stark', 'greyjoy'], place: 'stark', importance: 4, text: 'A battle at Winterfell.' });
  emit(t, 'village_burned', { actors: [], houses: ['stark'], place: 'stark', importance: 3, text: 'A village burns.' });
  assert.equal(clusterFacts(t, t.facts).stories.length, 1, 'the burning that is of the war is one story with it');
});

test('TX7: the dossier of an audience says where the scene is and how the lord is addressed', () => {
  const dossier = (house, who, face = true) => {
    const s = createInitialState('agot_298', house, { seed: 7 });
    return CALLS.audience.context(s, { character: who, words: 'Will you help me?', stance: { verdict: 'agree', I: {} }, face }).dossier;
  };
  const dany = dossier('targaryen', 'daenerys_targaryen');
  assert.match(dany, /THE PLACE: Pentos, a city\./, 'a city of Essos');
  assert.match(dany, /no great hall, throne or torch-lit gallery/, 'not a keep');
  assert.match(dany, /HOLDS NO LAND: no keep, no granaries/, 'an exile has no granaries');
  assert.match(dany, /You share their exile/);
  assert.match(dany, /"brother" when the moment is private/, 'a sister says brother');
  assert.doesNotMatch(dany, /address the lord: "Lord/i);
  assert.match(dany, /never "Lord Targaryen"/, 'and is told not to say it');
  assert.match(dossier('targaryen', 'jorah_mormont'), /HOW YOU ADDRESS THE LORD: "Your Grace"/, 'an exiled knight speaks to a king as to a king');
  const bolton = dossier('stark', 'roose_bolton');
  assert.match(bolton, /THE PLACE: The Dreadfort, a castle\. What may be seen in the scene: the hall, the solar/);
  assert.doesNotMatch(bolton, /HOLDS NO LAND/, 'a landed house holds its land');
  assert.match(dossier('stark', 'robb_stark'), /"father" when the moment is private/);
  assert.match(dossier('stark', 'roose_bolton', false), /No scene to describe/, 'a letter has no scene');
  const s = createInitialState('agot_298', 'stark', { seed: 7 });
  assert.equal(address(s, s.characters.robb_stark, null), 'my lord', 'no lord, no honour');
});

test('TX8: the advisor is asked for the number of things the lord asks for; a model that gives objects gives lines', () => {
  assert.equal(askedCount('What are the three gravest dangers to this house?'), 3);
  assert.equal(askedCount('Name your two chief worries.'), 2);
  assert.equal(askedCount('Can we afford a war?'), 0);
  const s = createInitialState('agot_298', 'stark', { seed: 7 });
  const ask = CALLS.council.context(s, { members: ['luwin'], words: 'Tell me the three gravest dangers to House Stark.', advisor: true });
  assert.match(ask.dossier, /THE LORD ASKS FOR 3 THINGS: write exactly 3 headings/);
  const mock = CALLS.council.mock(ask).speeches[0].text;
  assert.ok(mock.split('\n').filter((l) => /^[A-Z][A-Z ,'-]+$/.test(l.trim())).length <= 3, `no more than the three asked for:\n${mock}`);
  assert.deepEqual(suggestionsOf({ suggestions: [{ text: 'Call the banners' }, { suggestion: 'Write to Riverrun' }, 'Hold a feast', { order: 'Raise the walls' }, null, ''] }), ['Call the banners', 'Write to Riverrun', 'Hold a feast', 'Raise the walls']);
  assert.deepEqual(suggestionsOf(null, '1. Call the banners\n- Hold a feast\n\n'), ['Call the banners', 'Hold a feast'], 'plain lines lose their bullets');
  assert.ok(!suggestionsOf({ suggestions: [{ nothing: 1 }] }).join('').includes('[object'), 'never "[object Object]"');
});

test('TX10: the wait for a long stretch of days says so before it begins', () => {
  const src = fs.readFileSync(new URL('../public/js/app.js', import.meta.url), 'utf8');
  assert.ok(/LONG_TURN_DAYS = 14/.test(src) && /until\.days >= LONG_TURN_DAYS/.test(src), 'a turn of two weeks or more tells the lord the chronicler may take minutes');
});
