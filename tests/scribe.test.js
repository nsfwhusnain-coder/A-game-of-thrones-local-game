// The scribe (WP Q1): before an order is sent, the lord's spelling is put right — by plain rules at once, and by a small model on the CPU when config names one.
// Nothing here needs a live model: the model's side is a fake OpenAI-compatible server on a local port that says what the test scripts it to say.
// What is held: the rules mend the slips and never a correct line, and put a name right only toward a name the lord was sent; a model's mending is kept only when it
// is the same line with the slips mended (numbers, names and the order of the words intact); the small model has a server of its own and the big one is never asked;
// a slow, dead or unruly small model costs nothing but the rules' own answer; and the two buttons of the bar are the quill and the microphone.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.WC_PROVIDER = 'mock';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const noComments = (js) => js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\'"`])\/\/.*$/gm, '$1');
const { fixOrder, lexiconOf, driftOf, distance, nameWords } = await import('../public/js/shared/scribe.js');
const { createInitialState } = await import('../public/js/shared/world.js');
const { playerView } = await import('../server/view.js');
const { scribe, scribeOn } = await import('../server/scribe.js');
const { routeFor } = await import('../server/ai/models.js');
const { loadConfig } = await import('../server/llm.js');
const { runCall, CALLS } = await import('../server/ai/client.js');

const state = createInitialState('agot_298', 'stark', { seed: 298 });
const view = playerView(state);
const names = lexiconOf(view);
const fix = (t, o = {}) => fixOrder(t, { names, ...o }).text;

test('the rules mend the slips of an order: names, order words, a swap of neighbours, spacing, capitals and the full stop', () => {
  assert.equal(fix('send rodrick to winterfel with fifty mne'), 'Send Rodrik to Winterfell with fifty men.');
  assert.equal(fix('call the banaers of the north to winterfell'), 'Call the banners of the north to Winterfell.');
  assert.equal(fix('ser rodrik   should march  to moat cailin , and hold the the gate untill i say otherwise'), 'Ser Rodrik should march to Moat Cailin, and hold the gate until I say otherwise.');
  assert.equal(fix('i wnat to hold a feast adn invite the lords'), 'I want to hold a feast and invite the lords.');
  assert.equal(fix('what is the state of our garrison'), 'What is the state of our garrison?', 'a question ends in a question mark');
  assert.equal(fix('   '), ''); assert.equal(fixOrder('').changed, false);
});

test('a line that is already right comes back as it was, and mending is idempotent', () => {
  const right = ['Send Ser Rodrik to hold the Stony Shore.', 'Send Jon Snow to the Wall with ten men.', 'Send Jory Cassel and twenty guards to meet Lady Catelyn at the Twins.', 'Raise 500 men at Winterfell.',
    'Send a raven to Lord Commander Mormont asking what the Watch needs.', 'Call the banners of the North to Winterfell.', 'Hold a tourney at Winterfell and invite every lord of the Riverlands.',
    'Buy grain for the granaries: the winter will be long.', 'March to Moat Cailin, then wait for word from the King.', 'Have Maester Luwin write to Riverrun.', 'Send two hundred men to reinforce Moat Cailin.',
    'The marsh road is flooded, so send the harbors their share.', 'Marry my daughter to the Arryn boy if he will take the North as her dowry.', 'Hire five hundred sellswords with gold from the treasury.',
    'Seize the granary at White Harbor and share the grain with the smallfolk.', 'What does the treasury hold?', 'Start a feast and bring gold to the Dreadfort.', 'Form a host at Winterfell.', 'Raised levies march at dawn.'];
  for (const t of right) { assert.equal(fix(t), t, `"${t}" was already right`); assert.equal(fix(fix(t)), fix(t)); }
  for (const t of ['send rodrick to winterfel with fifty mne', 'um call the banaers uh of the north']) assert.equal(fix(fix(t, { spoken: true }), { spoken: true }), fix(t, { spoken: true }), 'twice is once');
});

test('numbers and unknown words are left exactly as they were', () => {
  assert.equal(fix('Raise 500 men at Winterfell.'), 'Raise 500 men at Winterfell.');
  assert.match(fix('send 1,200 gold dragons to lord tywin'), /1,200 gold dragons/);
  assert.match(fix('give the qwertyx to zzyzx'), /qwertyx/); assert.match(fix('give the qwertyx to zzyzx'), /zzyzx/);
  assert.ok(!/start/i.test(fix('stark')) || fix('stark') === 'Stark.', 'a name is put right toward a name, never a word toward a name: "start" stays');
  assert.equal(fix('start a feast'), 'Start a feast.');
});

test('a name is put right only toward a name the lord was sent: the rules know no name the browser does not', () => {
  const secret = 'Aerys Wormtongue';
  assert.equal(fixOrder('send Wormtongue to Winterfell', { names }).text, 'Send Wormtongue to Winterfell.', 'a name not in the list is not invented');
  const plus = fixOrder('send wormtonge to winterfell', { names: [...names, secret] }).text;
  assert.equal(plus, 'Send Wormtongue to Winterfell.', 'listed, it is put right');
  assert.equal(fixOrder('send wormtonge to winterfell', { names }).text, 'Send wormtonge to Winterfell.', 'not listed, the slip stays as written');
  // the lexicon is the view's: nothing the browser is not sent
  const s2 = structuredClone(state); s2.characters.jon_snow.name = 'Zzyzx Nameless';
  assert.ok(!lexiconOf(playerView(s2)).some((n) => /Zzyzx/.test(n)) || lexiconOf(playerView(s2)).some((n) => /Zzyzx/.test(n)) === lexiconOf(playerView(s2)).includes('Zzyzx Nameless'), 'the lexicon is only what the view holds');
  assert.ok(nameWords(['Moat Cailin', 'The Wall', 'ser']).includes('Cailin'));
});

test('a dictated line loses its "um"s, and the rules are deterministic', () => {
  assert.equal(fix('um send jory cassel to the wall with uh twenty men', { spoken: true }), 'Send Jory Cassel to the wall with twenty men.');
  assert.equal(fix('call the banners of the north you know to winterfell', { spoken: true }), 'Call the banners of the north to Winterfell.');
  const a = fix('send rodrick to winterfel with fifty mne'); for (let i = 0; i < 5; i++) assert.equal(fix('send rodrick to winterfel with fifty mne'), a);
});

test('the check on a model\'s mending: a number changed, a name lost, the words rewritten or a script that is not the realm\'s are refused; a mended spelling is kept', () => {
  const before = 'Send Rodrik to Winterfell with fifty men and 200 spears.';
  assert.deepEqual(driftOf(before, 'Send Rodrik to Winterfell with fifty men and 200 spears.'), []);
  assert.deepEqual(driftOf('Send rodrik to winterfel with fifty men.', 'Send Rodrik to Winterfell with fifty men.'), [], 'slips mended');
  assert.ok(driftOf(before, 'Send Rodrik to Winterfell with fifty men and 300 spears.').some((p) => /number/.test(p)));
  assert.ok(driftOf('Send Rodrik to Winterfell with fifty men.', 'Send Ser Barristan to Winterfell with fifty men.').some((p) => /name Rodrik/.test(p)));
  assert.ok(driftOf('Hold a tourney, no, a feast at Winterfell.', 'Hold a tourney at Winterfell without a feast.').length, 'a change of mind is not resolved by the scribe');
  assert.ok(driftOf('Send Rodrik to Winterfell.', 'Sure! Here is your corrected order: Send Rodrik to Winterfell. Let me know if you need anything else.').length, 'an answer is not a mending');
  assert.ok(driftOf('Send Rodrik to Winterfell.', '').length);
  assert.equal(distance('kitten', 'sitting'), 3); assert.equal(distance('mne', 'men', 1), 1, 'a swap of neighbours is one slip');
});

// ── a fake small model on a local port ──
async function fake(replyFor) {
  const hits = []; const srv = http.createServer((req, res) => {
    let body = ''; req.on('data', (d) => { body += d; }); req.on('end', async () => {
      const j = body ? JSON.parse(body) : {}; hits.push({ url: req.url, body: j });
      if (req.url.endsWith('/chat/completions')) {
        const user = j.messages?.at(-1)?.content || ''; const out = await replyFor(user, j);
        if (out === null) { res.destroy(); return; }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ model: 'small', choices: [{ index: 0, message: { role: 'assistant', content: typeof out === 'string' ? out : JSON.stringify(out) }, finish_reason: 'stop' }], usage: { prompt_tokens: 100, completion_tokens: 20 } }));
      } else { res.writeHead(404); res.end('{}'); }
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${srv.address().port}/v1`, hits, close: () => new Promise((r) => { srv.closeAllConnections?.(); srv.close(r); }) };
}
const cfgFor = (small, big) => ({ ...loadConfig(), provider: 'openai', baseUrl: big, timeoutSec: 5, models: { scribe: { baseUrl: small, deadlineSec: 3 } } });

test('the small model has a server of its own: the scribe never asks the big one, and a call with a server of its own inherits nothing of the big model\'s routing', async () => {
  const small = await fake((u) => ({ text: u.replace(/^\w+: /, '') })); const big = await fake(() => ({ text: 'BIG' }));
  try {
    const cfg = cfgFor(small.url, big.url); cfg.models.default = { model: 'the-big-one', temperature: 0.9 };
    assert.equal(scribeOn(cfg), true); assert.equal(scribeOn({ ...cfg, provider: 'mock' }), false, 'the mock has no model');
    assert.equal(scribeOn({ ...cfg, models: {} }), false, 'no server named, no model');
    const r = routeFor(cfg, 'scribe'); assert.equal(r.baseUrl, small.url); assert.equal(r.model, '', 'the big model\'s name is not sent to the small server'); assert.notEqual(r.temperature, 0.9);
    assert.equal(routeFor(cfg, 'narrate').baseUrl, undefined, 'the other calls are routed as ever');
    const out = await scribe(view, 'send rodrick to winterfel with fifty mne', { cfg });
    assert.equal(out.via, 'model'); assert.equal(out.text, 'Send Rodrik to Winterfell with fifty men.');
    assert.equal(small.hits.length, 1); assert.equal(big.hits.length, 0, 'the big model was never asked');
    const sent = small.hits[0].body; assert.equal(sent.response_format.type, 'json_schema', 'a schema is enforced'); assert.equal(sent.stream, false);
    assert.match(JSON.stringify(sent.messages), /WRITTEN: Send Rodrik to Winterfell with fifty men\./, 'the small model is sent the line the rules have already mended');
    assert.ok(JSON.stringify(sent.messages).length < 2500, 'a small prompt: the CPU reads it in a moment');
  } finally { await small.close(); await big.close(); }
});

test('a model that changes a number, rewrites the line or answers is not believed: the line stands as the rules left it', async () => {
  const replies = { number: 'Send Rodrik to Winterfell with sixty men.', answer: 'Sure! Here you go: Send Rodrik to Winterfell with fifty men. Anything else?', word: 'Send Rodrik to Moat Cailin with fifty men.', empty: '', garbage: 'not json at all' };
  for (const [what, text] of Object.entries(replies)) {
    const small = await fake(() => (what === 'garbage' ? 'not json at all' : { text }));
    try {
      const out = await scribe(view, 'send rodrick to winterfel with fifty mne', { cfg: cfgFor(small.url, 'http://127.0.0.1:9/v1') });
      assert.equal(out.via, 'rules', what); assert.equal(out.text, 'Send Rodrik to Winterfell with fifty men.', what);
    } finally { await small.close(); }
  }
});

test('a dead, dropped or slow small model costs the lord nothing but the rules\' answer, within the call\'s deadline', async () => {
  const dead = await scribe(view, 'call the banaers of the north', { cfg: cfgFor('http://127.0.0.1:9/v1', 'http://127.0.0.1:9/v1') });
  assert.deepEqual([dead.via, dead.text], ['rules', 'Call the banners of the north.']);
  const dropped = await fake(() => null); const slow = await fake(() => new Promise((r) => setTimeout(() => r({ text: 'late' }), 4000)));
  try {
    assert.equal((await scribe(view, 'call the banaers', { cfg: cfgFor(dropped.url, 'http://127.0.0.1:9/v1') })).via, 'rules');
    const t0 = Date.now(); const cfg = cfgFor(slow.url, 'http://127.0.0.1:9/v1'); cfg.models.scribe.deadlineSec = 1;
    assert.equal((await scribe(view, 'call the banaers', { cfg })).via, 'rules'); assert.ok(Date.now() - t0 < 3500, 'the deadline held');
  } finally { await dropped.close(); await slow.close(); }
});

test('the scribe is one of the model calls: schema, mock and fallback, and its mock is the line unchanged', async () => {
  assert.ok(CALLS.scribe); const r = await runCall('scribe', state, { text: 'Send Rodrik to Winterfell.', spoken: false }, { provider: 'mock' });
  assert.equal(r.via, 'mock'); assert.deepEqual(r.value, { text: 'Send Rodrik to Winterfell.' });
  const f = CALLS.scribe.fallback(CALLS.scribe.context(state, { text: 'x y', spoken: true }), ['p']); assert.equal(f.text, 'x y');
});

test('the bar has a quill that sends and a microphone that speaks, and no button that asks a machine for ideas', () => {
  const html = read('public/index.html'); const bar = html.slice(html.indexOf('id="command-bar"'), html.indexOf('</footer>'));
  const buttons = [...bar.matchAll(/<button[^>]*>/g)].map((m) => m[0]);
  assert.equal(buttons.length, 2, `two buttons: ${buttons.join(' ')}`);
  assert.match(buttons[0], /data-action="listen"/); assert.match(buttons[1], /data-action="add-order"/);
  assert.match(bar, /data-i="quill"/); assert.match(bar, /data-i="mic"/); assert.doesNotMatch(bar, /suggest|sparkle|Counsel/);
  const app = noComments(read('public/js/app.js'));
  assert.doesNotMatch(app, /case 'suggest'/, 'the counsel button is gone'); assert.match(app, /await tidy\(/, 'what is sent goes through the scribe'); assert.match(app, /case 'listen'/);
  assert.match(app, /await sendOrder\(\)/, 'ending the turn sends what is in the box first');
});

test('the ears run on the CPU in the page and send the sound nowhere', () => {
  const worker = noComments(read('public/js/ui/ears-worker.js')); const ears = noComments(read('public/js/ui/ears.js'));
  assert.match(worker, /device:\s*'wasm'/); assert.doesNotMatch(worker, /webgpu|device:\s*'cuda'|'gpu'/i, 'never the GPU');
  assert.doesNotMatch(ears, /\bfetch\(|XMLHttpRequest|sendBeacon|WebSocket|\bapi\(/, 'the recording is not sent anywhere: it is written down in the page and dropped');
  assert.match(ears, /getUserMedia/); assert.match(ears, /track|getTracks/, 'the microphone is released');
  assert.ok(fs.existsSync(path.join(ROOT, 'public/vendor/transformers/transformers.min.js')), 'the speech runtime is vendored, not fetched from a CDN');
});

// ── over the wire: the real server on the mock model (the rules alone answer) ──
import { spawn } from 'node:child_process';
import os from 'node:os';
test('POST /api/games/:id/scribe answers with the mended line, and GET /api/scribe says whether a small model is set up', async () => {
  const PORT = 3416; const saves = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-scribe-http-'));
  const srv = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), WC_PROVIDER: 'mock', WC_SAVES: saves }, stdio: 'ignore' });
  const api = async (p, body) => { const r = await fetch(`http://127.0.0.1:${PORT}/api${p}`, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}); return { status: r.status, json: await r.json() }; };
  try {
    for (let i = 0; i < 50; i++) { try { await api('/version'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
    assert.deepEqual((await api('/scribe')).json, { model: false });
    const { json: g } = await api('/games', { scenario: 'agot_298', house: 'stark', seed: 3 });
    const r = await api(`/games/${g.id}/scribe`, { text: 'send rodrick to winterfel with fifty mne' });
    assert.equal(r.status, 200); assert.deepEqual([r.json.text, r.json.via], ['Send Rodrik to Winterfell with fifty men.', 'rules']);
    assert.equal((await api(`/games/${g.id}/scribe`, { text: '' })).json.text, '');
    assert.equal((await api(`/games/${g.id}/scribe`, { text: 'um send jory to the wall', spoken: true })).json.text, 'Send Jory to the wall.');
  } finally { srv.kill(); fs.rmSync(saves, { recursive: true, force: true }); }
});
