// Voices for the characters.
// Three engines:
//  - 'neural':  natural voices (Kokoro-82M) generated in the browser itself, in a worker; the default;
//  - 'browser': the system's speech voices (Web Speech API), shaped per character with pitch and pace;
//  - 'server':  any local OpenAI-compatible text-to-speech server (/v1/audio/speech — e.g. Kokoro-FastAPI, openedai-speech,
//               a Piper or XTTS bridge), proxied through the game server, with a voice per character.
// Every character gets a stable voice: the main cast have hand-set profiles, everyone else is assigned one
// from their sex, age and homeland.
import { app, api, toast } from './common.js';

const store = { get: (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } } };
// players who had the old robotic default move to the natural voices once
if (store.get('voice-engine-v2', null) === null) { if (store.get('voice-engine', 'browser') === 'browser') store.set('voice-engine', 'neural'); store.set('voice-engine-v2', true); }
export const voiceSettings = () => ({ engine: store.get('voice-engine', 'neural'), volume: store.get('voice-volume', 0.9), auto: store.get('voice-auto', true), narrate: store.get('voice-narrate', true), narrator: store.get('voice-narrator', 'storyteller'), overrides: store.get('voice-overrides', {}) });
export function setVoiceSetting(k, v) { store.set('voice-' + k, v); }

// ── Casting ──
// Kokoro has only a handful of English voices, and the British ones (the voice of Westeros, as on the show)
// are its weakest. So a character's voice is a BLEND: mostly one British voice, coloured by a second — every
// character sounds like themselves, and the better American voices lend the British ones some body.
// Voice grades from Kokoro's own notes: af_heart A, af_bella A-, bf_emma B-, af_nicole B-, am_fenrir/am_michael/
// am_puck C+, bm_george/bm_fable C, bf_isabella C, bm_lewis D+, bm_daniel/bf_alice/bf_lily D, am_adam F+.
// rate: how fast they speak (1 = normal); pitch: a slight shift (1 = none); voice: a blend.
const PROFILES = {
  eddard_stark: { voice: 'bm_lewis*0.6+am_fenrir*0.4', rate: 0.92, pitch: 0.97 },
  catelyn_stark: { voice: 'bf_emma*0.75+af_nicole*0.25', rate: 0.96 },
  robb_stark: { voice: 'bm_daniel*0.6+am_puck*0.4', rate: 1.02 },
  jon_snow: { voice: 'bm_lewis*0.65+am_puck*0.35', rate: 0.94 },
  sansa_stark: { voice: 'bf_alice*0.6+af_bella*0.4', rate: 1.0, pitch: 1.04 },
  arya_stark: { voice: 'bf_lily*0.7+af_heart*0.3', rate: 1.1, pitch: 1.08 },
  bran_stark: { voice: 'bf_lily*0.8+af_kore*0.2', rate: 1.02, pitch: 1.1 },
  rickon_stark: { voice: 'bf_lily*0.8+af_heart*0.2', rate: 1.12, pitch: 1.14 },
  luwin: { voice: 'bm_george*0.8+bm_fable*0.2', rate: 0.9 },
  rodrik_cassel: { voice: 'bm_george*0.6+am_fenrir*0.4', rate: 0.94, pitch: 0.96 },
  jory_cassel: { voice: 'bm_daniel*0.7+am_michael*0.3', rate: 1.02 },
  vayon_poole: { voice: 'bm_fable*0.7+bm_george*0.3', rate: 0.98 },
  benjen_stark: { voice: 'bm_lewis*0.7+am_michael*0.3', rate: 0.96 },
  tywin_lannister: { voice: 'bm_george*0.8+am_fenrir*0.2', rate: 0.86, pitch: 0.95 },
  cersei_lannister: { voice: 'bf_isabella*0.7+af_bella*0.3', rate: 0.94 },
  jaime_lannister: { voice: 'bm_daniel*0.55+am_michael*0.45', rate: 1.0 },
  tyrion_lannister: { voice: 'bm_fable*0.8+am_puck*0.2', rate: 1.08 },
  kevan_lannister: { voice: 'bm_george*0.6+bm_lewis*0.4', rate: 0.94 },
  lancel_lannister: { voice: 'bm_daniel*0.7+am_puck*0.3', rate: 1.04, pitch: 1.03 },
  robert_baratheon: { voice: 'am_fenrir*0.5+bm_george*0.5', rate: 1.06, pitch: 0.94 },
  stannis_baratheon: { voice: 'bm_lewis*0.75+bm_george*0.25', rate: 0.9, pitch: 0.95 },
  renly_baratheon: { voice: 'bm_daniel*0.6+am_puck*0.4', rate: 1.06 },
  joffrey_baratheon: { voice: 'bm_daniel*0.8+am_puck*0.2', rate: 1.08, pitch: 1.05 },
  petyr_baelish: { voice: 'bm_fable*0.6+am_michael*0.4', rate: 0.98 },
  varys: { voice: 'bm_fable*0.7+bf_isabella*0.3', rate: 0.94, pitch: 1.04 },
  grand_maester_pycelle: { voice: 'bm_george*0.9+bm_lewis*0.1', rate: 0.8, pitch: 0.97 },
  barristan_selmy: { voice: 'bm_george*0.7+bm_lewis*0.3', rate: 0.92 },
  sandor_clegane: { voice: 'am_fenrir*0.6+bm_lewis*0.4', rate: 0.96, pitch: 0.9 },
  gregor_clegane: { voice: 'am_fenrir*0.7+am_onyx*0.3', rate: 0.88, pitch: 0.86 },
  olenna_tyrell: { voice: 'bf_isabella*0.8+bf_emma*0.2', rate: 0.94, pitch: 0.96 },
  margaery_tyrell: { voice: 'bf_emma*0.6+af_heart*0.4', rate: 0.98 },
  mace_tyrell: { voice: 'bm_fable*0.6+am_michael*0.4', rate: 1.06 },
  loras_tyrell: { voice: 'bm_daniel*0.6+am_michael*0.4', rate: 1.02 },
  randyll_tarly: { voice: 'bm_george*0.6+am_fenrir*0.4', rate: 0.9, pitch: 0.94 },
  samwell_tarly: { voice: 'bm_fable*0.7+am_puck*0.3', rate: 1.06, pitch: 1.03 },
  hoster_tully: { voice: 'bm_george*0.85+bm_lewis*0.15', rate: 0.82, pitch: 0.96 },
  edmure_tully: { voice: 'bm_daniel*0.7+am_puck*0.3', rate: 1.04 },
  brynden_tully: { voice: 'bm_lewis*0.6+am_fenrir*0.4', rate: 0.94 },
  lysa_arryn: { voice: 'bf_alice*0.7+bf_isabella*0.3', rate: 1.08, pitch: 1.05 },
  walder_frey: { voice: 'bm_george*0.7+bm_fable*0.3', rate: 0.9, pitch: 1.02 },
  roose_bolton: { voice: 'bm_lewis*0.8+bm_george*0.2', rate: 0.84, pitch: 0.97 },
  greatjon_umber: { voice: 'am_fenrir*0.6+bm_george*0.4', rate: 1.06, pitch: 0.9 },
  wyman_manderly: { voice: 'bm_fable*0.6+am_fenrir*0.4', rate: 0.98, pitch: 0.95 },
  maege_mormont: { voice: 'bf_isabella*0.7+af_kore*0.3', rate: 0.96, pitch: 0.95 },
  jeor_mormont: { voice: 'bm_george*0.6+am_fenrir*0.4', rate: 0.92, pitch: 0.94 },
  maester_aemon: { voice: 'bm_george*0.9+bm_fable*0.1', rate: 0.8, pitch: 0.98 },
  theon_greyjoy: { voice: 'bm_daniel*0.6+am_puck*0.4', rate: 1.06 },
  balon_greyjoy: { voice: 'bm_lewis*0.6+am_fenrir*0.4', rate: 0.88, pitch: 0.92 },
  doran_martell: { voice: 'bm_george*0.6+am_michael*0.4', rate: 0.86 },
  oberyn_martell: { voice: 'am_michael*0.55+bm_daniel*0.45', rate: 1.04 },
  daenerys_targaryen: { voice: 'bf_emma*0.6+af_heart*0.4', rate: 0.96 },
  viserys_targaryen: { voice: 'bm_fable*0.7+am_puck*0.3', rate: 1.1, pitch: 1.04 },
  khal_drogo: { voice: 'am_fenrir*0.7+am_onyx*0.3', rate: 0.88, pitch: 0.88 },
  jorah_mormont: { voice: 'bm_lewis*0.6+am_michael*0.4', rate: 0.94 },
  illyrio_mopatis: { voice: 'am_michael*0.6+bm_fable*0.4', rate: 0.94, pitch: 0.95 },
  mance_rayder: { voice: 'am_michael*0.6+bm_lewis*0.4', rate: 1.0 },
  melisandre: { voice: 'bf_isabella*0.6+af_nicole*0.4', rate: 0.9 },
  davos_seaworth: { voice: 'bm_lewis*0.7+am_puck*0.3', rate: 0.98 },
  brienne_tarth: { voice: 'bf_isabella*0.6+af_kore*0.4', rate: 0.96, pitch: 0.95 },
  janos_slynt: { voice: 'bm_fable*0.6+am_onyx*0.4', rate: 1.02 },
  yoren: { voice: 'am_fenrir*0.5+bm_lewis*0.5', rate: 0.98 },
};
// Everyone else: from these pools by sex, age and homeland — British for Westeros, the rest for Essos and the free folk
const POOLS = {
  m: { base: ['bm_george', 'bm_lewis', 'bm_fable', 'bm_daniel'], colour: ['am_fenrir', 'am_michael', 'am_puck', 'bm_george', 'bm_lewis'] },
  mOld: { base: ['bm_george', 'bm_lewis'], colour: ['bm_fable', 'am_fenrir'] },
  mYoung: { base: ['bm_daniel', 'bm_fable'], colour: ['am_puck', 'am_michael'] },
  f: { base: ['bf_emma', 'bf_isabella', 'bf_alice'], colour: ['af_heart', 'af_bella', 'af_nicole', 'af_kore', 'bf_emma'] },
  fYoung: { base: ['bf_lily', 'bf_alice'], colour: ['af_heart', 'af_sky', 'af_bella'] },
  mFar: { base: ['am_fenrir', 'am_michael', 'am_puck'], colour: ['bm_fable', 'am_onyx', 'bm_lewis'] },
  fFar: { base: ['af_kore', 'af_aoede', 'af_nicole'], colour: ['bf_isabella', 'af_heart'] },
};
export const VOICE_CHOICES = ['bm_george', 'bm_lewis', 'bm_fable', 'bm_daniel', 'am_fenrir', 'am_michael', 'am_puck', 'am_onyx', 'bf_emma', 'bf_isabella', 'bf_alice', 'bf_lily', 'af_heart', 'af_bella', 'af_nicole', 'af_kore', 'af_aoede', 'af_sky'];
const hash = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const isFemale = (c) => c?.gender === 'f' || c?.sex === 'f' || /\b(lady|queen|princess|septa|wife|mother|daughter|sister|spearwife)\b/i.test(`${c?.title || ''} ${(c?.roles || []).join(' ')}`);
const FAR = /essos|beyond/;

/** The voice a character speaks with (stable across sessions). */
export function profileFor(c) {
  if (!c) return { pitch: 1, rate: 1, female: false, voice: 'bm_george', srv: 'bm_george' };
  const female = isFemale(c);
  const p = PROFILES[c.id] || {};
  const h = hash(c.id);
  const age = Number(c.age) || 35;
  const region = app.state?.houses?.[c.house]?.region || '';
  let voice = p.voice;
  if (!voice) {
    const pool = POOLS[FAR.test(region) ? (female ? 'fFar' : 'mFar') : female ? (age < 16 ? 'fYoung' : 'f') : age >= 60 ? 'mOld' : age < 20 ? 'mYoung' : 'm'];
    const a = pool.base[h % pool.base.length]; let b = pool.colour[(h >>> 4) % pool.colour.length]; if (b === a) b = pool.colour[((h >>> 4) + 1) % pool.colour.length];
    const w = 0.62 + ((h >>> 9) % 25) / 100; // 0.62-0.86 of the main voice
    voice = `${a}*${w.toFixed(2)}+${b}*${(1 - w).toFixed(2)}`;
  }
  const override = voiceSettings().overrides[c.id];
  if (override) voice = override;
  // unknown characters: shaped by age and sex, with a little individual colour
  const pitch = p.pitch ?? Math.max(0.9, Math.min(1.14, 1 + (age < 14 ? 0.1 : age > 60 ? -0.03 : 0) + ((h % 9) - 4) * 0.006));
  const rate = p.rate ?? Math.max(0.8, Math.min(1.12, 1 + (age > 65 ? -0.12 : age > 55 ? -0.06 : age < 18 ? 0.05 : 0) + (((h >>> 5) % 9) - 4) * 0.01));
  return { pitch, rate, female, voice, srv: voice.split(/[*+]/)[0], key: h };
}

// How mood colours delivery: anger and fear quicken speech, coldness and grief slow it
const MOOD_PACE = { furious: 1.1, angered: 1.05, afraid: 1.1, uneasy: 1.04, warm: 0.98, distrustful: 0.97, irritated: 1.03, 'will not see you': 1.06 };

// Names the speech model would stumble on, respelled the way the show says them
const SAY = [
  [/\bDaenerys\b/g, 'Denairis'], [/\bCersei\b/g, 'Sersee'], [/\bTyrion\b/g, 'Tirion'], [/\bAegon\b/g, 'Eegon'], [/\bTargaryens?\b/g, (m) => m.replace('Targaryen', 'Targairyen')],
  [/\bBaelish\b/g, 'Baylish'], [/\bBraavos(i)?\b/g, 'Brahvos$1'], [/\bDothraki\b/g, 'Dothrahkee'], [/\b[Kk]haleesi\b/g, 'kahleesee'], [/\bArryns?\b/g, (m) => m.replace('Arryn', 'Arrin')],
  [/\bTheon\b/g, 'Theeon'], [/\bJaime\b/g, 'Jaymee'], [/\bBrienne\b/g, 'Bree-enn'], [/\bArya\b/g, 'Ahrya'], [/\bRhaegar\b/g, 'Raygar'], [/\bAerys\b/g, 'Airis'],
  [/\bViserys\b/g, 'Vissairis'], [/\bPycelle\b/g, 'Pie-sell'], [/\bVarys\b/g, 'Vairis'], [/\bOberyn\b/g, 'Oberin'], [/\bQyburn\b/g, 'Kwyburn'], [/\bMargaery\b/g, 'Marjeree'],
  [/\bEdmure\b/g, 'Edmyoor'], [/\bBrynden\b/g, 'Brinden'], [/\bRoose\b/g, 'Rooz'], [/\bYgritte\b/g, 'Eegritt'], [/\bJeor\b/g, 'Jor'], [/\bAemon\b/g, 'Eemon'],
  [/\bCatelyn\b/g, 'Catlin'], [/\bMyrcella\b/g, 'Mersella'], [/\bLyanna\b/g, 'Lee-ahna'], [/\bRhaenys\b/g, 'Raynis'], [/\b[Mm]aester(s)?\b/g, (m) => m.replace(/aester/, 'ayster')],
  [/\bSer\b/g, 'Sir'], [/\bQarth\b/g, 'Kwarth'], [/\bAsshai\b/g, 'Ash-eye'], [/\bValyria(n)?\b/g, 'Valeeria$1'], [/\bR'hllor\b/g, 'Rulor'], [/\bIllyrio\b/g, 'Illeerio'],
  [/\bJorah\b/g, 'Jora'], [/\bWalder\b/g, 'Wallder'], [/\bEssos\b/g, 'Essoss'], [/\bMeereen\b/g, 'Mereen'], [/\bSeptas?\b/g, (m) => m], [/\bAC\b/g, 'A.C.'],
];
export const sayable = (t) => SAY.reduce((x, [re, to]) => x.replace(re, to), String(t));

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
let worker = null, localModel = null, nid = 0; const reqs = new Map(); let lastPct = -1;
async function neuralWorker() {
  if (worker) return worker;
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
async function speakNeural(text, prof, token) {
  const cfg = voiceSettings();
  // a slight pitch shift so blends that share a main voice still differ; pace from the person and their mood
  const pr = Math.max(0.94, Math.min(1.08, prof.pitch || 1));
  const speed = Math.max(0.78, Math.min(1.3, (prof.rate || 1) * (MOOD_PACE[prof.mood] || 1) * 1.06)) / pr;
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
    try { await speakNeural(text, prof, token); return; } catch (e) { if (!speak.warnedN) { speak.warnedN = true; toast(`Natural voices unavailable (${e.message}); using your system's voices.`, true); } }
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
