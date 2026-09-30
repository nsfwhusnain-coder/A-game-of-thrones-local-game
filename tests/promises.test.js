// Promises, letters on the wing and what an answer did (docs/gdd/12-ui-ux.md §7; WP F4). What must hold:
//   • a promise is written the same way the engine writes it (one table of sentences), with the days left as words and how pressing it is;
//   • a house sees its own promises — owed to it, made by it, and lately settled — and never how much they were meant, and never one a lord made in a letter whose answer is still on the road;
//   • an answer wears chips: how they took it (Agrees, Refuses, Names a price), each promise it brought (the same words the engine uses) and each deed done;
//   • the letters on the wing are shown soonest first, and an audience by raven says when yours lands; how they regard you is a word, and a counsellor's seat is a word;
//   • the markup escapes what it is given, and the screens are wired to all of it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { createInitialState } = await import('../public/js/shared/world.js');
const { makeCommitment, COMMITMENTS, COMMITMENT_KINDS } = await import('../public/js/engine/politics/commitments.js');
const { SAYS, saysOf } = await import('../public/js/engine/politics/promise-words.js');
const { withRng } = await import('../public/js/engine/rng.js');
const { dayNumber } = await import('../public/js/engine/time.js');
const P = await import('../public/js/ui/promises.js');
const L = await import('../public/js/ui/post.js');
const { regardOf, seatOf } = await import('../public/js/ui/people.js');
const { playerView, hiddenTruths, onTheRoad } = await import('../server/view.js');

const rd = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const icon = (n) => `<svg data-icon="${n}"></svg>`;
const world = () => createInitialState('agot_298', 'stark', { seed: 298 });
const PARAMS = { march_to: { place: 'moat_cailin' }, send_men: { place: 'moat_cailin', men: 1200 }, attend: { place: 'stark' }, pay: { gold: 500 }, release: { captive: 'jon_arryn' }, swear_fealty: {}, join_war: {}, stay_neutral: {} };

/** A world with a handful of promises: two owed to Stark, one Stark's own, one between two others, one kept, one broken. */
function withPromises() {
  const s = world();
  withRng(s, () => {
    makeCommitment(s, { by: 'roose_bolton', to: 'eddard_stark', kind: 'march_to', params: { place: 'moat_cailin' }, days: 14 });
    makeCommitment(s, { by: 'walder_frey', to: 'eddard_stark', kind: 'pay', params: { gold: 500 }, days: 3 });
    makeCommitment(s, { by: 'eddard_stark', to: 'walder_frey', kind: 'attend', params: { place: 'stark' }, days: 40 });
    makeCommitment(s, { by: 'tywin_lannister', to: 'jon_arryn', kind: 'stay_neutral', days: 20 });
    const k = makeCommitment(s, { by: 'roose_bolton', to: 'eddard_stark', kind: 'attend', params: { place: 'stark' }, days: 5 }); k.state = 'kept';
    const b = makeCommitment(s, { by: 'walder_frey', to: 'eddard_stark', kind: 'pay', params: { gold: 90 }, days: 8 }); b.state = 'broken';
  });
  return s;
}

test('a promise is written as the engine writes it: one table of sentences, every kind, and an unknown kind does not break a screen', () => {
  const s = world();
  assert.deepEqual(Object.keys(SAYS).sort(), [...COMMITMENT_KINDS].sort(), 'the words and the engine know the same kinds');
  withRng(s, () => {
    for (const kind of COMMITMENT_KINDS) {
      const c = makeCommitment(s, { by: 'roose_bolton', to: 'eddard_stark', kind, params: PARAMS[kind], days: 10 });
      assert.equal(saysOf(s, c), COMMITMENTS[kind].says(s, c), `${kind}: the same sentence`);
      assert.ok(saysOf(s, c).length > 6 && !/undefined|NaN|\[object/.test(saysOf(s, c)), `${kind}: "${saysOf(s, c)}"`);
    }
  });
  assert.equal(saysOf(s, { kind: 'from_a_later_build', params: {} }), 'keep their word');
  assert.match(saysOf(s, { kind: 'march_to', by: 'roose_bolton', params: { place: 'moat_cailin' } }), /^bring his men to /);
});

test('the days left, as words and as how pressing: due today, tomorrow, soon, far', () => {
  assert.equal(P.whenWord(0), 'due today'); assert.equal(P.whenWord(1), '1 day left'); assert.equal(P.whenWord(12), '12 days left'); assert.equal(P.whenWord(-2), 'overdue');
  assert.deepEqual([0, 3, 5, 6, 40].map(P.toneOfDays), ['late', 'soon', 'soon', 'far', 'far']);
  const s = withPromises(); const c = s.commitments.find((x) => x.by === 'walder_frey' && x.kind === 'pay' && x.state === 'open');
  const r = P.promiseRow(s, c); assert.equal(r.days, 3); assert.equal(r.when, '3 days left'); assert.equal(r.tone, 'soon'); assert.equal(r.dir, 'owed');
  assert.ok(!('sincerity' in r), 'how much it was meant is not a thing a row can carry');
});

test('the promises of an audience: what they promised you, what you promised them, soonest first; the settled and other people\'s are not in it', () => {
  const s = withPromises();
  const w = P.promisesWith(s, 'walder_frey');
  assert.deepEqual(w.theirs.map((r) => r.says), ['pay 500 dragons'], 'only the open one they made to you (the broken one is history)');
  assert.deepEqual(w.mine.map((r) => r.says), [`come to ${s.holdings.stark ? s.holdings.stark.name : 'Winterfell'}`].map((x) => x), 'and the one you made them');
  assert.equal(w.mine[0].dir, 'owe');
  const r = P.promisesWith(s, 'roose_bolton'); assert.equal(r.theirs.length, 1, 'the kept one is not open'); assert.equal(r.theirs[0].says, 'bring his men to Moat Cailin'); assert.equal(r.mine.length, 0);
  assert.deepEqual(P.promisesWith(s, 'tywin_lannister'), { theirs: [], mine: [] }, 'a promise made to someone else is not yours to see');
  assert.deepEqual(P.promisesWith(s, 'nobody'), { theirs: [], mine: [] });
  const both = P.promisesWith(s, 'walder_frey'); assert.ok([...both.theirs, ...both.mine].every((x) => x.state === 'open'));
});

test('the Realm\'s list: owed to you, made by you, lately settled with the latest first; never a promise of two other houses', () => {
  const s = withPromises(); const b = P.promiseBook(s);
  assert.deepEqual(b.owed.map((r) => r.byId), ['walder_frey', 'roose_bolton'], 'soonest first');
  assert.deepEqual(b.owe.map((r) => r.byId), ['eddard_stark']);
  assert.equal(b.open, 3);
  assert.deepEqual(b.settled.map((r) => r.state).sort(), ['broken', 'kept']);
  assert.ok(![...b.owed, ...b.owe, ...b.settled].some((r) => r.byId === 'tywin_lannister'), 'Tywin\'s promise to Jon Arryn is theirs');
  // a long history is cut to the latest few
  const t = withPromises(); withRng(t, () => { for (let i = 0; i < 9; i++) { const c = makeCommitment(t, { by: 'roose_bolton', to: 'eddard_stark', kind: 'attend', params: { place: 'stark' }, days: 2 + i }); c.state = i % 2 ? 'kept' : 'broken'; } });
  const cut = P.promiseBook(t, { settled: 4 }).settled; assert.equal(cut.length, 4); assert.ok(cut.every((r, i) => i === 0 || cut[i - 1].dueDay >= r.dueDay), 'latest first');
  assert.deepEqual(P.promiseBook(world()), { owed: [], owe: [], settled: [], open: 0 });
});

test('the chips of an answer: how they took it, each promise in the engine\'s own words, each deed; a plain obeying says nothing', () => {
  const said = P.outcomeChips({ verdict: 'agree', applied: ['Roose Bolton promises to bring his men to Moat Cailin within 14 days', 'Sends 300 men to Moat Cailin.'] });
  assert.deepEqual(said.map((c) => [c.kind, c.tone]), [['verdict', 'ok'], ['promise', 'ok'], ['done', 'ok']]);
  assert.equal(said[0].word, 'Agrees'); assert.equal(said[1].text, 'bring his men to Moat Cailin'); assert.equal(said[1].days, 14); assert.equal(said[2].text, 'Sends 300 men to Moat Cailin');
  assert.deepEqual(P.outcomeChips({ verdict: 'refuse' }).map((c) => [c.tone, c.word]), [['bad', 'Refuses']]);
  assert.deepEqual(P.outcomeChips({ verdict: 'rage' }).map((c) => c.tone), ['bad']); assert.deepEqual(P.outcomeChips({ verdict: 'dismiss' }).map((c) => c.tone), ['bad']);
  assert.deepEqual(P.outcomeChips({ verdict: 'bargain' }).map((c) => [c.tone, c.word]), [['warn', 'Names a price']]);
  assert.deepEqual(P.outcomeChips({ verdict: 'stall' }).map((c) => c.tone), ['warn']);
  assert.deepEqual(P.outcomeChips({ verdict: 'obey' }), []); assert.deepEqual(P.outcomeChips({}), []); assert.deepEqual(P.outcomeChips(null), []); assert.deepEqual(P.outcomeChips({ applied: ['', null] }), []);
  // a letter's answer words it without the name
  const letter = P.outcomeChips({ applied: ['Promises to pay 500 dragons within 10 days'] })[0]; assert.equal(letter.kind, 'promise'); assert.equal(letter.text, 'pay 500 dragons'); assert.equal(letter.days, 10);
  assert.equal(P.outcomeChips({ applied: ['Promises to keep out of House Lannister\'s quarrels'] })[0].days, null, 'no days named');
});

test('the words the server writes into a reply are the words the chips read: a promise line is a promise chip for every kind', () => {
  const s = world();
  withRng(s, () => {
    for (const kind of COMMITMENT_KINDS) {
      const c = makeCommitment(s, { by: 'roose_bolton', to: 'eddard_stark', kind, params: PARAMS[kind], days: 14 });
      const audience = `Roose Bolton promises to ${COMMITMENTS[kind].says(s, c)} within ${c.dueDay - c.madeDay} days`; // server/game.js
      const letter = `Promises to ${COMMITMENTS[kind].says(s, c)} within ${c.dueDay - c.madeDay} days`; // server/letters.js
      for (const line of [audience, letter]) { const ch = P.outcomeChips({ applied: [line] })[0]; assert.equal(ch.kind, 'promise', line); assert.equal(ch.text, COMMITMENTS[kind].says(s, c), line); assert.equal(ch.days, 14); }
    }
  });
  assert.match(rd('server/game.js'), /promises to \$\{COMMITMENTS\[cm\.kind\]\.says\(state, cm\)\} within/); assert.match(rd('server/letters.js'), /Promises to \$\{COMMITMENTS\[x\.kind\]\.says\(state, x\)\} within/);
});

test('the markup escapes what it is given, says nothing when there is nothing, and cuts a long list', () => {
  const s = withPromises(); s.characters.walder_frey.name = '<img src=x onerror=1> Frey';
  const html = P.audiencePromisesHtml(s, 'walder_frey', { esc });
  assert.doesNotMatch(html, /<img src=x onerror/); assert.match(html, /class="promises"/); assert.match(html, /pay 500 dragons/); assert.match(html, /3 days left/); assert.match(html, /You/);
  assert.equal(P.audiencePromisesHtml(s, 'tywin_lannister', { esc }), '', 'no promises, no footer, and no "no promises"');
  const many = withPromises(); withRng(many, () => { for (let i = 0; i < 4; i++) makeCommitment(many, { by: 'roose_bolton', to: 'eddard_stark', kind: 'attend', params: { place: 'stark' }, days: 20 + i }); });
  const cut = P.audiencePromisesHtml(many, 'roose_bolton', { esc }, { max: 3 }); assert.equal((cut.match(/class="pm /g) || []).length, 3); assert.match(cut, /\+2 more in the Realm window/);
  const book = P.promiseBookHtml(s, { esc, icon }); assert.match(book, /id="promise-book"/); assert.match(book, /Owed to you/); assert.match(book, /You promised/); assert.match(book, /Lately kept or broken/); assert.doesNotMatch(book, /<img src=x onerror/);
  assert.match(P.promiseBookHtml(world(), { esc, icon }), /No one has promised you anything/);
  const chips = P.chipsHtml(P.outcomeChips({ verdict: 'refuse', applied: ['X promises to <b>go</b> within 3 days'] }), { esc, icon }); assert.doesNotMatch(chips, /<b>go<\/b>/); assert.match(chips, /chip-bad/); assert.equal(P.chipsHtml([], { esc, icon }), '');
});

test('what the player is sent: promises of their house without how much they were meant, and none from a letter still on the road', () => {
  const s = withPromises(); s.meta.turn = 3;
  const letter = withRng(s, () => makeCommitment(s, { by: 'jon_arryn', to: 'eddard_stark', kind: 'pay', params: { gold: 700 }, days: 9, source: { type: 'letter', ref: 'post9' }, publicity: 'private' }));
  s.post = [{ id: 'post9', to: 'jon_arryn', toName: 'Jon Arryn', status: 'delivered', text: 'Send the gold.', sent: '1st of the 8th moon, 298 AC', arriveDay: dayNumber(s.meta.date) + 1 },
    { id: 'post10', reply: true, replyTo: 'post9', from: 'jon_arryn', to: 'eddard_stark', status: 'in flight', text: 'It will be done.', arriveDay: dayNumber(s.meta.date) + 3, applied: ['Promises to pay 700 dragons within 9 days'] }];
  assert.equal(onTheRoad(s, letter), true);
  let v = playerView(s);
  assert.ok(v.commitments.length >= 5 && v.commitments.every((c) => !('sincerity' in c)), 'promises are sent, and never how much they were meant');
  assert.ok(!v.commitments.some((c) => c.id === letter.id), 'a promise made in a letter is not known until the raven lands');
  assert.ok(!v.commitments.some((c) => c.by === 'tywin_lannister'), 'and never a promise of two other houses');
  assert.deepEqual(hiddenTruths(s, v).filter((x) => /promise|road/.test(x)), [], 'the invariant holds');
  const leaked = { ...v, commitments: [...v.commitments, letter] }; assert.ok(hiddenTruths(s, leaked).some((x) => /promise from a letter still on the road/.test(x)), 'and the check would catch a leak');
  s.post[1].status = 'delivered';
  v = playerView(s); assert.equal(onTheRoad(s, letter), false); assert.ok(v.commitments.some((c) => c.id === letter.id), 'read when it lands');
  assert.ok(v.commitments.every((c) => !('sincerity' in c)));
});

test('letters on the wing: soonest first, when they land in words, and an audience by raven says when yours does', () => {
  const s = world(); const today = dayNumber(s.meta.date);
  s.post = [
    { id: 'p1', to: 'lysa_arryn', toName: 'Lysa Arryn', status: 'in flight', text: 'Sister, I need the Vale\'s swords.', sent: '20th of the 8th moon, 298 AC', arriveDay: today + 6 },
    { id: 'p2', to: 'hoster_tully', toName: 'Hoster Tully', status: 'in flight', text: 'Riverrun, hold the crossing.', sent: '22nd of the 8th moon, 298 AC', arriveDay: today + 1 },
    { id: 'p3', to: 'robert_baratheon', toName: 'Robert Baratheon', status: 'delivered', text: 'Old news.', sent: '1st of the 8th moon, 298 AC', arriveDay: today - 5 },
    { id: 'p4', reply: true, from: 'lysa_arryn', to: 'eddard_stark', status: 'in flight', text: 'no', arriveDay: today + 2 },
  ];
  const wing = L.lettersOnTheWing(s);
  assert.deepEqual(wing.map((l) => [l.toName, l.days]), [['Hoster Tully', 1], ['Lysa Arryn', 6]], 'soonest first; delivered ones and answers are not on the wing');
  assert.equal(wing[1].sent, '20th of the 8th moon'); assert.equal(L.landsWord(1), 'lands tomorrow'); assert.equal(L.landsWord(6), 'lands in ~6 days'); assert.equal(L.landsWord(0), 'lands tomorrow');
  assert.equal(L.letterTo(s, 'lysa_arryn').days, 6); assert.equal(L.letterTo(s, 'robert_baratheon'), null); assert.equal(L.letterTo(world(), 'lysa_arryn'), null);
});

test('how they regard you is a word (only for those who are not yours, and only when it is not middling); a counsellor\'s seat is a word', () => {
  const s = world(); const c = (o) => ({ ...s.characters.tywin_lannister, ...o });
  assert.equal(regardOf(s, c({ opinion: 70 })).word, 'trusts you'); assert.equal(regardOf(s, c({ opinion: 30 })).word, 'well disposed'); assert.equal(regardOf(s, c({ opinion: 0 })), null);
  assert.equal(regardOf(s, c({ opinion: -30 })).tone, 'warn'); assert.equal(regardOf(s, c({ opinion: -80 })).word, 'hostile to you'); assert.equal(regardOf(s, c({ opinion: 90, house: 'stark' })), null, 'your own people are not "regarding" you');
  assert.equal(seatOf({ roles: ['steward'] }), 'Steward'); assert.equal(seatOf({ roles: ['maester', 'family'] }), 'Maester'); assert.equal(seatOf({ roles: ['spymaster'] }), 'Whisperer');
  assert.equal(seatOf({ roles: ['lord'], title: 'Lord of Highgarden, Warden of the South' }), 'Lord of Highgarden'); assert.equal(seatOf({ roles: [] }), 'Counsellor');
  assert.equal(seatOf({ roles: ['lord'], title: 'Hand of the King and Lord Paramount of the Stormlands and more' }), 'Counsellor', 'a title too long for a caption is not one');
});

test('the wiring: the audience has its chips and promises, the letters their wing, the Realm its list, the council its seats; the speaker an icon; one stylesheet', () => {
  const drawer = rd('public/js/ui/drawer.js'); const win = rd('public/js/ui/windows.js'); const html = rd('public/index.html'); const css = rd('public/css/audience.css');
  assert.match(drawer, /chipsHtml\(outcomeChips\(m\), \{ esc, icon \}\)/); assert.match(drawer, /audiencePromisesHtml\(s, c\.id, \{ esc \}\)/); assert.match(drawer, /lettersOnTheWing\(s\)/); assert.match(drawer, /letterTo\(s, c\.id\)/); assert.match(drawer, /seatOf\(m\)/); assert.match(drawer, /regardOf\(s, c\)/);
  assert.doesNotMatch(drawer, /class="applied"/, 'the dashed list is the chips now'); assert.doesNotMatch(drawer, /<span class="verdict/, 'the verdict is a chip');
  assert.ok(!drawer.includes('\u{1F50A}'), 'the speaker is an icon, not an emoji');
  assert.match(win, /promiseBookHtml\(s, \{ esc, icon \}\)/);
  assert.match(html, /css\/audience\.css/); assert.match(css, /\.chip-ok/); assert.match(css, /\.promises/); assert.match(css, /\.pm-soon/); assert.match(css, /prefers-reduced-motion/);
});
