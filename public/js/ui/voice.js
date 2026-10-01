// Voices for the characters.
// Three engines:
//  - 'neural':  natural voices (Kokoro-82M) generated in the browser itself, in a worker; the default;
//  - 'browser': the system's speech voices (Web Speech API), shaped per character with pitch and pace;
//  - 'server':  any local OpenAI-compatible text-to-speech server (/v1/audio/speech — e.g. Kokoro-FastAPI, openedai-speech,
//               a Piper or XTTS bridge), proxied through the game server, with a voice per character.
// Every character gets a stable voice: the main cast have hand-set profiles, everyone else is assigned one
// from their sex, age and homeland.
import { app, api, toast, modal, closeModal, esc } from './common.js';
import { castFor, VOICE_CHOICES, sayable } from './cast.js';

const store = { get: (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } } };
// players who had the old robotic default move to the natural voices once
if (store.get('voice-engine-v2', null) === null) { if (store.get('voice-engine', 'browser') === 'browser') store.set('voice-engine', 'neural'); store.set('voice-engine-v2', true); }
export const voiceSettings = () => ({ engine: store.get('voice-engine', 'neural'), volume: store.get('voice-volume', 0.9), auto: store.get('voice-auto', true), narrate: store.get('voice-narrate', true), readAloud: store.get('voice-readaloud', false), letters: store.get('voice-letters', true), narrator: store.get('voice-narrator', 'storyteller'), overrides: store.get('voice-overrides', {}) });
export function setVoiceSetting(k, v) { store.set('voice-' + (k === 'readAloud' ? 'readaloud' : k), v); }

// ── Casting ── (ui/cast.js: the voices, the pools and the names' respellings; pure, and tested in tests/audio-map.test.js)
/** The voice a character speaks with (stable across sessions). */
export function profileFor(c) { return castFor(c, app.state?.houses?.[c?.house]?.region || '', voiceSettings().overrides[c?.id] || null); }
export { VOICE_CHOICES, sayable };

// How mood colours delivery: anger and fear quicken speech, coldness and grief slow it
const MOOD_PACE = { furious: 1.1, angered: 1.05, afraid: 1.1, uneasy: 1.04, warm: 0.98, distrustful: 0.97, irritated: 1.03, 'will not see you': 1.06 };


// ---------- browser engine ----------
let voices = [];
function loadVoices() { voices = (window.speechSynthesis?.getVoices() || []).filter((v) => /^en/i.test(v.lang)); }
if (window.speechSynthesis) { loadVoices(); window.speechSynthesis.onvoiceschanged = loadVoices; }
const FEMALE_NAMES = /female|woman|samantha|victoria|karen|serena|moira|tessa|fiona|kate|susan|hazel|libby|sonia|zira|aria|jenny|emma|amy|joanna|salli|kimberly|ivy|olivia|natasha|mia|nicky|allison|ava|zoe|sara|martha|catherine/i;
const MALE_NAMES = /male|daniel|arthur|oliver|george|ryan|alex|fred|thomas|rishi|david|mark|guy|james|brian|matthew|joey|justin|kevin|russell|lee|eddy|reed|rocko|grandpa|ralph|bruce|junior/i;
function browserVoice(prof) {
  if (!voices.length) loadVoices();
  // the natural (neural/online) system voices sound far better than the old robotic ones: use them when present
  const natural = voices.filter((v) => /natural|neural|online|google/i.test(v.name));
  const pool0 = natural.length >= 2 ? natural : voices;
  const gb = pool0.filter((v) => /en[-_]GB|en[-_]IE|en[-_]AU|en[-_]NZ/i.test(v.lang)); // the Westerosi speak like the show: British and Irish voices first
  const base = gb.length >= 2 ? gb : pool0;
  const sexed = base.filter((v) => (prof.female ? FEMALE_NAMES.test(v.name) : MALE_NAMES.test(v.name) && !FEMALE_NAMES.test(v.name)));
  const pool = sexed.length ? sexed : base;
  return pool.length ? pool[prof.key % pool.length] : null;
}

// ---------- neural engine (Kokoro in a worker) ----------
const REPO = 'onnx-community/Kokoro-82M-v1.0-ONNX';
export const NARRATORS = { storyteller: 'bf_emma*0.7+af_heart*0.3', maester: 'bm_george*0.75+am_michael*0.25', chronicler: 'bm_fable*0.7+am_fenrir*0.3' };
const narrator = () => ({ voice: NARRATORS[voiceSettings().narrator] || NARRATORS.storyteller, srv: 'bf_emma', rate: 1, pitch: 1 });
let worker = null, localModel = null, nid = 0; const reqs = new Map(); let lastPct = -1; let asking = null;
// The first time the natural voices are wanted, and the files are not on the disk: ask before a download of about 90 MB (GDD 14 §3.6). The answer is kept: download now, the browser's own voices, or none.
function askVoices() {
  return new Promise((resolve) => {
    let settled = false; const finish = (c) => { if (settled) return; settled = true; document.removeEventListener('wc-modal-closed', onClose); closeModal(); resolve(c); }; const onClose = () => finish('browser');
    document.addEventListener('wc-modal-closed', onClose);
    modal(`<h2>The voices</h2><p style="line-height:1.5">The natural voices need a one-time download of about 90 MB. They run on this machine and send nothing anywhere. Until then, or if you would rather not, the browser's own voices can read for you.</p>
      <div class="settings-actions"><button class="btn ghost" id="vc-off">No voices</button><button class="btn ghost" id="vc-browser">Use the browser's voices</button><button class="btn primary" id="vc-now">Download now</button></div>`);
    document.getElementById('vc-off').onclick = () => finish('off'); document.getElementById('vc-browser').onclick = () => finish('browser'); document.getElementById('vc-now').onclick = () => finish('now'); document.getElementById('vc-now').focus();
  });
}
async function neuralAllowed() {
  const was = store.get('voice-download', null);
  if (was === 'now') return true;
  if (was === 'browser' || was === 'off') { if (voiceSettings().engine === 'neural') setVoiceSetting('engine', was === 'off' ? 'off' : 'browser'); return false; } // (the choice made once is kept)
  if (localModel === null) localModel = await fetch(`/models/${REPO}/config.json`, { method: 'HEAD' }).then((r) => r.ok).catch(() => false);
  if (localModel) return true; // the files are already here: nothing to download, nothing to ask
  asking ||= askVoices().then((c) => { store.set('voice-download', c); if (c !== 'now') setVoiceSetting('engine', c === 'off' ? 'off' : 'browser'); return c === 'now'; });
  return asking;
}
async function neuralWorker() {
  if (worker) return worker;
  if (!(await neuralAllowed())) throw new Error('declined');
  if (localModel === null) localModel = await fetch(`/models/${REPO}/config.json`, { method: 'HEAD' }).then((r) => r.ok).catch(() => false);
  worker = new Worker('/js/ui/tts-worker.js', { type: 'module' });
  worker.onmessage = (e) => {
    const d = e.data || {};
    if (d.type === 'progress') { const pct = Math.floor((100 * d.loaded) / d.total); if (pct >= lastPct + 25 || (pct === 100 && lastPct < 100)) { lastPct = pct; toast(`Preparing natural voices… ${pct}% (a one-time download)`, false, 'voice-download'); } return; }
    if (d.type === 'ready') return;
    const r = reqs.get(d.id); if (!r) return; reqs.delete(d.id);
    d.error ? r.reject(new Error(d.error)) : r.resolve(d);
  };
  worker.onerror = (e) => { for (const r of reqs.values()) r.reject(new Error(e.message || 'voice worker failed')); reqs.clear(); worker = null; };
  worker.postMessage({ type: 'warm', local: localModel });
  return worker;
}
/** Start the voices loading in the background (called when an audience opens). */
export function warmVoices() { if (voiceSettings().engine === 'neural') neuralWorker().catch(() => {}); }
function synth(text, voice, speed) { return neuralWorker().then((w) => new Promise((resolve, reject) => { const id = ++nid; reqs.set(id, { resolve, reject }); w.postMessage({ id, text, voice, speed, local: localModel }); })); }
let actx = null;
function playPCM(pcm, rate, playbackRate, volume, token) {
  actx ??= new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume();
  return new Promise((resolve) => {
    if (token !== speakToken) return resolve();
    const buf = actx.createBuffer(1, pcm.length, rate); buf.copyToChannel(pcm, 0);
    const src = actx.createBufferSource(); src.buffer = buf; src.playbackRate.value = playbackRate;
    const g = actx.createGain(); g.gain.value = volume; src.connect(g); g.connect(actx.destination);
    src.onended = resolve; current = { stop: () => { try { src.stop(); } catch { /* */ } resolve(); } };
    src.start();
  });
}
// long replies are spoken sentence by sentence: the first plays while the rest are still being voiced
const sentences = (t) => (t.match(/[^.!?…]+[.!?…]+["'”’)]*\s*|[^.!?…]+$/g) || [t]).reduce((acc, x) => { const last = acc.at(-1); if (last && (last.length < 40 || x.length < 12) && last.length + x.length < 220) acc[acc.length - 1] = last + x; else acc.push(x); return acc; }, []).map((x) => x.trim()).filter(Boolean);
// a slight pitch shift so blends that share a main voice still differ; pace from the person and their mood
const paceOf = (prof) => { const pr = Math.max(0.94, Math.min(1.08, prof.pitch || 1)); return { pr, speed: Math.max(0.78, Math.min(1.3, (prof.rate || 1) * (MOOD_PACE[prof.mood] || 1) * 1.06)) / pr }; };
async function speakNeural(text, prof, token) {
  const cfg = voiceSettings(); const { pr, speed } = paceOf(prof);
  const jobs = sentences(sayable(text)).map((t) => synth(t, prof.voice || 'bm_george', speed));
  for (const job of jobs) {
    const d = await job; if (token !== speakToken) return;
    await playPCM(d.pcm, d.rate, pr, cfg.volume, token);
  }
}

// ---------- playback ----------
let current = null; let speakToken = 0; // { stop() }
export function stopSpeaking() { speakToken++; try { current?.stop(); } catch { /* */ } current = null; window.speechSynthesis?.cancel(); }
/** Speak a line as a character (or, with opts.narrator, as the narrator). Resolves when finished. */
export async function speak(text, character, opts = {}) {
  const cfg = voiceSettings(); text = String(text || '').replace(/\*[^*]*\*/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text || cfg.engine === 'off') return;
  if (!opts.keep) stopSpeaking();
  const token = speakToken;
  const prof = opts.narrator ? { ...narrator(), id: '_narrator' } : { ...profileFor(character), id: character?.id, mood: opts.mood };
  if (cfg.engine === 'neural') {
    try { await speakNeural(text, prof, token); return; } catch (e) { if (e.message === 'declined') { if (voiceSettings().engine === 'off') return; } else if (!speak.warnedN) { speak.warnedN = true; toast(`Natural voices unavailable (${e.message}); using your system's voices.`, true); } }
  }
  if (cfg.engine === 'server') {
    try {
      const res = await fetch('/api/tts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: sayable(text), voice: prof.srv, speed: prof.rate }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'TTS server error');
      const url = URL.createObjectURL(await res.blob());
      const audio = new Audio(url); audio.volume = cfg.volume;
      await new Promise((resolve) => { current = { stop: () => { audio.pause(); resolve(); } }; audio.onended = resolve; audio.onerror = resolve; audio.play().catch(resolve); });
      URL.revokeObjectURL(url); return;
    } catch (e) { if (!speak.warned) { speak.warned = true; toast(`Voice server unavailable (${e.message}); using the browser's voices.`, true); } }
  }
  if (!window.speechSynthesis || token !== speakToken) return;
  await new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(sayable(text));
    const v = browserVoice(prof); if (v) u.voice = v;
    u.pitch = prof.pitch; u.rate = (prof.rate || 1) * 1.08; u.volume = cfg.volume;
    let done = false; const finish = () => { if (!done) { done = true; clearInterval(watch); resolve(); } };
    u.onend = finish; u.onerror = finish;
    current = { stop: () => { window.speechSynthesis.cancel(); finish(); } };
    window.speechSynthesis.speak(u);
    // some browsers never fire onend: finish when the synthesiser has truly gone quiet
    let quiet = 0; const watch = setInterval(() => { if (!window.speechSynthesis.speaking && !window.speechSynthesis.pending) { if (++quiet >= 3) finish(); } else quiet = 0; }, 400);
  });
}
/**
 * Voice a line now, to be played later: every sentence is sent to the voice worker at once, so a whole scene (all the
 * counsellors, one after another) is ready to be heard back to back instead of waiting line by line.
 * Returns { play(token) } — play resolves when the line has been spoken.
 */
export function prepareSpeech(text, character, opts = {}) {
  const cfg = voiceSettings(); text = String(text || '').replace(/\*[^*]*\*/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text || cfg.engine === 'off') return { play: async () => {} };
  const prof = opts.narrator ? { ...narrator(), id: '_narrator' } : { ...profileFor(character), id: character?.id, mood: opts.mood };
  if (cfg.engine !== 'neural') return { play: (token) => (token === speakToken ? speak(text, character, { ...opts, keep: true }) : undefined) };
  const { pr, speed } = paceOf(prof);
  const jobs = sentences(sayable(text)).map((t) => synth(t, prof.voice || 'bm_george', speed).catch(() => null));
  return { play: async (token) => { for (const j of jobs) { const d = await j; if (token !== speakToken) return; if (d) await playPCM(d.pcm, d.rate, pr, cfg.volume, token); } } };
}
/** Silence whatever is playing and start a new scene; its lines play only while this token is current. */
export function beginScene() { stopSpeaking(); return speakToken; }
export const sceneToken = () => speakToken;
/** Speak a whole scene top to bottom: narration in the narrator's voice, speech in the character's. */
export async function speakBeats(list, character, onBeat, mood) {
  stopSpeaking(); const token = speakToken; const cfg = voiceSettings();
  for (const b of list) {
    if (token !== speakToken) return;
    if (b.kind === 'act' && !cfg.narrate) continue;
    onBeat?.(b, true);
    await speak(b.text, character, { narrator: b.kind === 'act', keep: true, mood });
    onBeat?.(b, false);
  }
}

/** Split a reply into beats: actions (between asterisks) and speech. */
export function beats(text) {
  const out = []; const re = /\*([^*]+)\*/g; let last = 0, m;
  const pushSay = (t) => { t = t.replace(/^[\s"“”'‘’]+|[\s"“”]+$/g, '').trim(); if (t) out.push({ kind: 'say', text: t }); };
  while ((m = re.exec(text))) { pushSay(text.slice(last, m.index)); const a = m[1].trim(); if (a) out.push({ kind: 'act', text: a }); last = re.lastIndex; }
  pushSay(text.slice(last));
  return out;
}
