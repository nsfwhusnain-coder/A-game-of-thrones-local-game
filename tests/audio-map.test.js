// Sound follows the story (docs/gdd/14-audio.md §4; WP H1). The lead cannot listen: every rule is "state X is mood Y" or "fact Z sounds cue C", read here as pure functions over fixture states, and the owner judges the
// result by ear. Held: the music's scene by state (title, planning by region, war, winter, a jump awaited, a lament, a matter's quiet, the end); the cue of each fact the GDD names, every cue one the effects bank has, at most one in
// 400 ms; the casting (every persona hand-cast, every cast voice a real blend of Kokoro's, a stranger's voice stable and sorted by sex, age and homeland); every name that a speech model may stumble on is either respelled or reviewed;
// and the wiring (the narrator reads great stories and the days wait for it, a letter is read in its sender's voice, the first download is asked for).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.WC_PROVIDER = 'mock';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const A = await import('../public/js/ui/audio-map.js');
const { SFX_IDS } = await import('../public/js/ui/sfx.js');
const { KIND_NAMES } = await import('../public/js/engine/facts/kinds.js');
const C = await import('../public/js/ui/cast.js');
const { createInitialState } = await import('../public/js/shared/world.js');
const { PERSONAS } = await import('../public/data/histories.js');
const { CHARACTERS } = await import('../public/data/characters.js');
const { ANCESTORS } = await import('../public/data/families.js');

const world = (house = 'stark') => createInitialState('agot_298', house, { seed: 298 });

// ── the music ──
test('the scene by state: the title is the theme; planning takes the region of the house you rule; war and winter colour it', () => {
  assert.deepEqual(A.moodFor({ screen: 'title', house: 'stark' }), { mood: 'theme', region: 'stark', cold: false, quiet: 1 }, 'the house theme if a house is highlighted');
  for (const [house, region] of [['stark', 'north'], ['tyrell', 'reach'], ['martell', 'dorne'], ['greyjoy', 'iron'], ['lannister', 'court'], ['baratheon', 'court']]) {
    const m = A.moodFor({ screen: 'game', state: world(house) }); assert.equal(m.mood, region, `${house}: ${region}`); assert.equal(m.cold, false);
  }
  const s = world('lannister'); s.wars.push({ id: 'w', status: 'active', attackers: ['lannister'], defenders: ['tully'] });
  assert.equal(A.moodFor({ screen: 'game', state: s }).mood, 'war', 'at war: low strings and a drum pulse'); assert.equal(A.moodFor({ screen: 'game', state: s }).region, 'war');
  const w = world('stark'); w.world.season = 'winter'; assert.deepEqual(A.moodFor({ screen: 'game', state: w }), { mood: 'north', region: 'north', cold: true, quiet: 1 }, 'winter: the same mood with a colder mix');
});

test('a jump awaited is tension for twenty seconds; a family death is a lament for its card; a matter is read in quiet; the end is the theme or a lament', () => {
  const s = world('stark');
  assert.equal(A.moodFor({ screen: 'game', state: s, waiting: 3 }).mood, 'tension'); assert.equal(A.moodFor({ screen: 'game', state: s, waiting: A.TENSION_SECONDS }).mood, 'tension');
  assert.equal(A.moodFor({ screen: 'game', state: s, waiting: A.TENSION_SECONDS + 1 }).mood, 'north', 'after twenty seconds the planning mood comes back');
  assert.equal(A.moodFor({ screen: 'game', state: s, waiting: null }).mood, 'north');
  const mine = { kind: 'death', who: ['catelyn_stark'], importance: 4 }; const theirs = { kind: 'death', who: ['tywin_lannister'], importance: 4 };
  assert.equal(A.moodFor({ screen: 'game', state: s, card: mine }).mood, 'lament', 'a death in the family: solo cello'); assert.equal(A.moodFor({ screen: 'game', state: s, card: theirs }).mood, 'north');
  assert.equal(A.moodFor({ screen: 'game', state: s, card: { kind: 'battle', who: ['catelyn_stark'] } }).mood, 'north', 'only a death is a lament');
  assert.equal(A.familyDeath({ kind: 'slain_in_battle', who: ['robb_stark'] }, s), true); assert.equal(A.familyDeath({ kind: 'executed', actors: ['eddard_stark'] }, s), true);
  const q = A.moodFor({ screen: 'game', state: s, matterOpen: true }); assert.equal(q.quiet, 0.2, 'the music fades to a fifth and the lord decides in quiet'); assert.equal(q.mood, 'north', 'the mood is not changed, only its volume');
  assert.equal(A.moodFor({ screen: 'end', result: 'victory' }).mood, 'theme'); assert.equal(A.moodFor({ screen: 'end', result: 'defeat' }).mood, 'lament');
  for (const m of ['theme', 'court', 'north', 'reach', 'dorne', 'iron', 'war', 'tension', 'lament', 'silence']) assert.ok(A.MOODS.includes(m), m);
});

test('the scene is read from the screen by a shim, and the music has the folders and the quiet it needs', () => {
  const scene = read('public/js/ui/scene.js'); const music = read('public/js/ui/music.js'); const app = read('public/js/app.js');
  assert.match(scene, /moodFor\(\{[^}]*matterOpen[^}]*\}\)/); assert.match(scene, /MutationObserver/, 'a matter opened or put away changes the scene'); assert.match(scene, /onDuck\(duck\)/, 'cues duck the music');
  assert.match(music, /export function setScene/); assert.match(music, /export function duck/); assert.match(music, /\['war', 'tension', 'lament'\]/, 'tension and lament have folders of their own');
  assert.match(music, /fadeTo\(el, volume\(\), 1000\)/, 'the quiet comes in over a second'); assert.match(music, /fadeTo\(el, volume\(\), 1500\)/, 'a change of music crossfades over a second and a half');
  assert.match(app, /awaitJump\(\)/, 'a jump awaited is tension'); assert.match(app, /app\.endWait\?\.\(\)/, 'its first week told ends it'); assert.match(app, /app\.screen = 'end'/);
  assert.doesNotMatch(app, /\bsetMood\b/, 'the old three-mood function is gone');
});

// ── the effects ──
test('every fact the GDD names sounds the cue the GDD names, and every cue is one the effects bank has', () => {
  assert.deepEqual([...A.CUES].sort(), [...SFX_IDS].sort(), 'the table of cues and the bank agree');
  for (const k of Object.keys(A.FACT_SOUND)) assert.ok(KIND_NAMES.includes(k), `${k} is a fact kind`);
  const s = world('stark'); const ctx = { state: s, player: 'stark' }; const cue = (f) => A.cueFor(f, ctx);
  assert.deepEqual(cue({ kind: 'letter_arrived', houses: ['stark'] }), ['raven', 'open'], 'a letter for the player: a caw and parchment'); assert.deepEqual(cue({ kind: 'letter_arrived', houses: ['lannister'] }), []);
  assert.deepEqual(cue({ kind: 'battle' }), ['horn', 'steel']); for (const k of ['holding_fell', 'siege_begun']) assert.deepEqual(cue({ kind: k }), ['lowhorn']);
  for (const k of ['levies_called', 'host_formed']) assert.deepEqual(cue({ kind: k }), ['horn2'], 'two short horns');
  assert.deepEqual(cue({ kind: 'host_joined', data: { men: 3000 } }), ['drums']); assert.deepEqual(cue({ kind: 'host_joined', data: { men: 300 } }), [], 'only a large contingent');
  assert.deepEqual(cue({ kind: 'death', importance: 4, actors: ['robert_baratheon'] }), ['toll']); assert.deepEqual(cue({ kind: 'death', importance: 1, actors: ['hodor'] }), [], 'the bell is for a great lord');
  assert.deepEqual(cue({ kind: 'wedding' }), ['lute']); assert.deepEqual(cue({ kind: 'feast' }), ['lute']);
  assert.deepEqual(cue({ kind: 'season_turned', data: { season: 'winter' } }), ['wind']); assert.deepEqual(cue({ kind: 'season_turned', data: { season: 'autumn' }, title: 'Autumn comes' }), []);
  assert.deepEqual(cue({ kind: 'gossip' }), [], 'a fact with no sound is silent'); assert.deepEqual(A.cueForCard({ kind: 'rumour', importance: 5, type: 'war' }), ['horn'], 'a great thing of war with no kind of a sound is a horn'); assert.deepEqual(A.cueForCard({ kind: 'rumour', importance: 1 }), ['open']);
  assert.deepEqual(A.UI_SOUND, { jump: ['bell'], matter: ['seal'], receiptOk: ['tick'], receiptNo: ['error'] }); assert.deepEqual(A.coinCue(1000, 1200), ['coins']); assert.deepEqual(A.coinCue(1000, 1050), []);
  for (const l of [...Object.values(A.UI_SOUND), ...Object.keys(A.FACT_SOUND).map((k) => A.cueFor({ kind: k, importance: 5, houses: ['stark'], data: { men: 9999, season: 'winter' } }, ctx))]) for (const c of l) assert.ok(SFX_IDS.includes(c), c);
});

test('at most one cue in 400 ms; a cue ducks the music by 30 % for its length', () => {
  const g = A.cueGate(); assert.equal(g.allow(1000), true); assert.equal(g.allow(1399), false); assert.equal(g.allow(1400), true); assert.equal(A.CUE_GAP_MS, 400); assert.equal(A.DUCK, 0.3);
  const sfx = read('public/js/ui/sfx.js'); assert.match(sfx, /t - gateAt < 400/); assert.match(sfx, /duckHandler\?\.\(0\.3,/);
});

// ── the voices ──
test('every persona has a hand-cast voice, every cast voice is a blend of the voices Kokoro has, and a stranger\'s voice is stable and sorted by sex, age and homeland', () => {
  const ids = new Set([...CHARACTERS, ...ANCESTORS].map((c) => c.id));
  assert.ok(Object.keys(C.PROFILES).length >= 200, `${Object.keys(C.PROFILES).length} cast (the target is 200)`);
  const missing = Object.keys(PERSONAS).filter((id) => !C.PROFILES[id]); assert.deepEqual(missing, [], 'every persona is cast');
  assert.deepEqual(Object.keys(C.PROFILES).filter((id) => !ids.has(id)), [], 'every cast voice is a character of the game');
  for (const [id, p] of Object.entries(C.PROFILES)) {
    const parts = p.voice.split('+').map((x) => x.split('*')); assert.ok(parts.length === 2, `${id}: a blend of two`);
    for (const [v, w] of parts) { assert.ok(C.VOICE_CHOICES.includes(v), `${id}: ${v} is a voice`); assert.ok(Number(w) > 0 && Number(w) < 1, `${id}: a weight`); }
    assert.ok(Math.abs(parts.reduce((n, [, w]) => n + Number(w), 0) - 1) < 0.011, `${id}: the weights make one`);
    assert.ok(p.rate >= 0.78 && p.rate <= 1.14 && (p.pitch ?? 1) >= 0.86 && (p.pitch ?? 1) <= 1.16, `${id}: pace and pitch in reason`);
  }
  const a = C.castFor({ id: 'someone_unnamed', age: 40, sex: 'm' }, 'reach'), b = C.castFor({ id: 'someone_unnamed', age: 40, sex: 'm' }, 'reach'); assert.deepEqual(a, b, 'stable');
  assert.equal(C.castFor({ id: 'maid_one', age: 30, sex: 'f' }, 'reach').female, true); assert.match(C.castFor({ id: 'maid_one', age: 30, sex: 'f' }, 'reach').voice, /^b?f|^af|^bf/, 'a woman: a woman\'s voices');
  assert.match(C.castFor({ id: 'khal_x', age: 30, sex: 'm' }, 'essos').voice, /^am_/, 'the far countries: the other pools'); assert.match(C.castFor({ id: 'old_x', age: 70, sex: 'm' }, 'north').voice, /^bm_(george|lewis)/, 'the old: the older voices');
  assert.equal(C.castFor({ id: 'tywin_lannister', sex: 'm', age: 57 }, 'westerlands', 'am_puck*0.5+bm_george*0.5').voice, 'am_puck*0.5+bm_george*0.5', 'a voice the player chose wins');
  const different = new Set(['bran_stark', 'rickon_stark', 'hullen', 'gage', 'mors_umber', 'hother_umber'].map((id) => C.castFor({ id }).voice)); assert.ok(different.size >= 5, 'the household do not all sound alike');
});

test('every name a speech model may stumble on — an "ae", a "gh", a medial "y", an apostrophe — is respelled or reviewed', () => {
  const s = world(); const names = new Set();
  for (const h of Object.values(s.holdings)) names.add(h.name); for (const h of Object.values(s.houses)) names.add(h.name); for (const c of Object.values(s.characters)) if (!c.generated) names.add(c.name);
  const toks = new Set(); for (const n of names) for (const t of String(n).split(/[\s,]+/)) { const w = t.replace(/^[^A-Za-z]+|[^A-Za-z'’]+$/g, '').replace(/['’]s$/, ''); if (w.length > 2 && /^[A-Z]/.test(w)) toks.add(w); }
  const loose = [...toks].filter((t) => /ae|gh|y(?!$)|['’]/i.test(t) && C.sayable(t) === t && !C.SAY_OK.has(t)).sort();
  assert.deepEqual(loose, [], 'a new name that a speech model may say wrongly: respell it in SAY (ui/cast.js) or, if it is said rightly as written, add it to SAY_OK');
  assert.equal(C.sayable('Ser Aeron met Maester Ilyn at the Eyrie'), 'Sir Airon met Mayster Illin at the Eerie'); assert.equal(C.sayable('Daenerys of House Targaryen'), 'Denairis of House Targairyen');
});

// ── the wiring ──
test('the chronicle read aloud: the narrator reads the great stories of a turn and the days wait for it; a letter is read in its sender\'s voice; the first download is asked for', () => {
  const play = read('public/js/ui/playback.js'); const drawer = read('public/js/ui/drawer.js'); const voice = read('public/js/ui/voice.js'); const app = read('public/js/app.js');
  assert.match(play, /voiceSettings\(\)\.readAloud/); assert.match(play, /e\.importance >= 4 \|\| e\.tier === 'great'/, 'the great stories'); assert.match(play, /speak\(line, null, \{ narrator: true \}\)/);
  assert.match(play, /holdWait/, 'playback holds until the reading ends'); assert.match(play, /ctl\.skip \|\| ctl\.next/, 'a skip or a step ends the reading'); assert.match(play, /cue\(cueForCard\(e,/); assert.match(play, /toldCard\(e, st\.hold\)/);
  assert.match(drawer, /voiceSettings\(\)\.letters/); assert.match(drawer, /s\.characters\[r\.from\]/, 'in the sender\'s voice');
  assert.match(voice, /readAloud: store\.get\('voice-readaloud', false\)/, 'off by default (Settings → Sound)'); assert.match(voice, /function askVoices/); assert.match(voice, /Download now/); assert.match(voice, /Use the browser's voices/); assert.match(voice, /No voices/);
  assert.match(voice, /one-time download of about 90 MB/); assert.match(voice, /neuralAllowed/);
  assert.match(app, /id="snd-read"/); assert.match(app, /id="snd-letters"/);
  for (const f of ['scripts/ui-gate.mjs', 'scripts/visual.js', 'scripts/map-check.mjs']) assert.match(read(f), /voice-download/, `${f} is not asked about the download`);
});
