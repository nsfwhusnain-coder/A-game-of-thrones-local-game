// Voices for the characters.
// Two engines:
//  - 'browser': the system's speech voices (Web Speech API), shaped per character with pitch and pace;
//  - 'server':  any local OpenAI-compatible text-to-speech server (/v1/audio/speech — e.g. Kokoro-FastAPI, openedai-speech,
//               a Piper or XTTS bridge), proxied through the game server, with a voice per character.
// Every character gets a stable voice: the main cast have hand-set profiles, everyone else is assigned one
// from their sex, age and homeland.
import { app, api } from './common.js';

const store = { get: (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } } };
export const voiceSettings = () => ({ engine: store.get('voice-engine', 'browser'), volume: store.get('voice-volume', 0.9), auto: store.get('voice-auto', true), overrides: store.get('voice-overrides', {}) });
export function setVoiceSetting(k, v) { store.set('voice-' + k, v); }

// pitch / rate for the browser engine; srv = preferred voice on a Kokoro-style server; deep = prefer a low male voice
const PROFILES = {
  tywin_lannister: { pitch: 0.72, rate: 0.84, srv: 'bm_george', deep: 1 }, eddard_stark: { pitch: 0.8, rate: 0.9, srv: 'bm_lewis', deep: 1 },
  robert_baratheon: { pitch: 0.74, rate: 1.06, srv: 'am_onyx', deep: 1 }, cersei_lannister: { pitch: 1.0, rate: 0.92, srv: 'bf_isabella' },
  tyrion_lannister: { pitch: 1.02, rate: 1.1, srv: 'bm_fable' }, jaime_lannister: { pitch: 0.94, rate: 1.0, srv: 'bm_daniel' },
  catelyn_stark: { pitch: 1.0, rate: 0.94, srv: 'bf_emma' }, robb_stark: { pitch: 0.98, rate: 1.0, srv: 'bm_daniel' },
  jon_snow: { pitch: 0.92, rate: 0.94, srv: 'bm_lewis' }, sansa_stark: { pitch: 1.2, rate: 0.98, srv: 'bf_alice' },
  arya_stark: { pitch: 1.32, rate: 1.1, srv: 'bf_lily' }, bran_stark: { pitch: 1.42, rate: 1.0, srv: 'bf_lily' },
  daenerys_targaryen: { pitch: 1.12, rate: 0.94, srv: 'bf_emma' }, viserys_targaryen: { pitch: 1.08, rate: 1.12, srv: 'bm_fable' },
  stannis_baratheon: { pitch: 0.7, rate: 0.9, srv: 'bm_george', deep: 1 }, renly_baratheon: { pitch: 1.04, rate: 1.06, srv: 'bm_daniel' },
  petyr_baelish: { pitch: 1.0, rate: 0.96, srv: 'bm_fable' }, varys: { pitch: 1.14, rate: 0.94, srv: 'bm_fable' },
  grand_maester_pycelle: { pitch: 0.82, rate: 0.78, srv: 'bm_george' }, olenna_tyrell: { pitch: 0.96, rate: 0.9, srv: 'bf_isabella' },
  walder_frey: { pitch: 0.84, rate: 0.86, srv: 'bm_george' }, roose_bolton: { pitch: 0.82, rate: 0.82, srv: 'bm_lewis', deep: 1 },
  theon_greyjoy: { pitch: 1.0, rate: 1.06, srv: 'bm_daniel' }, balon_greyjoy: { pitch: 0.72, rate: 0.9, srv: 'am_onyx', deep: 1 },
  doran_martell: { pitch: 0.86, rate: 0.86, srv: 'bm_george' }, oberyn_martell: { pitch: 1.0, rate: 1.06, srv: 'am_michael' },
  mance_rayder: { pitch: 0.9, rate: 1.0, srv: 'am_michael' }, jeor_mormont: { pitch: 0.76, rate: 0.9, srv: 'am_onyx', deep: 1 },
  luwin: { pitch: 0.9, rate: 0.9, srv: 'bm_george' }, rodrik_cassel: { pitch: 0.84, rate: 0.94, srv: 'bm_lewis' },
  sandor_clegane: { pitch: 0.66, rate: 0.96, srv: 'am_onyx', deep: 1 }, gregor_clegane: { pitch: 0.6, rate: 0.9, srv: 'am_onyx', deep: 1 },
  joffrey_baratheon: { pitch: 1.12, rate: 1.08, srv: 'bm_daniel' }, lysa_arryn: { pitch: 1.12, rate: 1.06, srv: 'bf_alice' },
  hoster_tully: { pitch: 0.82, rate: 0.8, srv: 'bm_george' }, edmure_tully: { pitch: 1.0, rate: 1.04, srv: 'bm_daniel' },
  brynden_tully: { pitch: 0.82, rate: 0.94, srv: 'bm_lewis' }, mace_tyrell: { pitch: 0.96, rate: 1.06, srv: 'am_adam' },
  margaery_tyrell: { pitch: 1.12, rate: 0.98, srv: 'bf_emma' }, loras_tyrell: { pitch: 1.04, rate: 1.02, srv: 'bm_daniel' },
  kevan_lannister: { pitch: 0.86, rate: 0.9, srv: 'bm_lewis' }, wyman_manderly: { pitch: 0.88, rate: 0.94, srv: 'am_adam' },
  greatjon_umber: { pitch: 0.7, rate: 1.04, srv: 'am_onyx', deep: 1 }, maege_mormont: { pitch: 0.92, rate: 0.96, srv: 'bf_isabella' },
  khal_drogo: { pitch: 0.66, rate: 0.9, srv: 'am_onyx', deep: 1 }, illyrio_mopatis: { pitch: 0.9, rate: 0.92, srv: 'am_adam' },
  jorah_mormont: { pitch: 0.82, rate: 0.94, srv: 'bm_lewis' }, maester_aemon: { pitch: 0.9, rate: 0.78, srv: 'bm_george' },
  benjen_stark: { pitch: 0.86, rate: 0.96, srv: 'bm_lewis' }, samwell_tarly: { pitch: 1.08, rate: 1.06, srv: 'bm_fable' },
  randyll_tarly: { pitch: 0.74, rate: 0.9, srv: 'bm_george', deep: 1 }, brienne_tarth: { pitch: 0.92, rate: 0.96, srv: 'bf_isabella' },
};
const SERVER_POOLS = {
  m: ['bm_george', 'bm_lewis', 'bm_daniel', 'bm_fable', 'am_adam', 'am_michael', 'am_eric', 'am_liam', 'am_onyx', 'am_echo'],
  f: ['bf_emma', 'bf_isabella', 'bf_alice', 'bf_lily', 'af_heart', 'af_bella', 'af_nicole', 'af_sarah', 'af_sky'],
};
const hash = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const isFemale = (c) => c?.gender === 'f' || /\b(lady|queen|princess|septa|wife|mother|daughter|sister)\b/i.test(`${c?.title || ''} ${(c?.roles || []).join(' ')}`);

/** The voice a character speaks with (stable across sessions). */
export function profileFor(c) {
  if (!c) return { pitch: 1, rate: 1, female: false, srv: 'bm_george' };
  const female = isFemale(c);
  const p = PROFILES[c.id] || {};
  const h = hash(c.id);
  const age = Number(c.age) || 35;
  // unknown characters: shaped by age and sex, with a little individual colour
  const pitch = p.pitch ?? Math.max(0.6, Math.min(1.5, (female ? 1.1 : 0.9) + (age < 16 ? 0.3 : age > 60 ? -0.12 : 0) + ((h % 17) - 8) * 0.012));
  const rate = p.rate ?? Math.max(0.75, Math.min(1.2, 1 + (age > 60 ? -0.12 : age < 18 ? 0.06 : 0) + (((h >> 5) % 11) - 5) * 0.012));
  const pool = SERVER_POOLS[female ? 'f' : 'm'];
  const srv = voiceSettings().overrides[c.id] || p.srv || pool[h % pool.length];
  return { pitch, rate, female, srv, deep: !!p.deep, key: h };
}

// ---------- browser engine ----------
let voices = [];
function loadVoices() { voices = (window.speechSynthesis?.getVoices() || []).filter((v) => /^en/i.test(v.lang)); }
if (window.speechSynthesis) { loadVoices(); window.speechSynthesis.onvoiceschanged = loadVoices; }
const FEMALE_NAMES = /female|woman|samantha|victoria|karen|serena|moira|tessa|fiona|kate|susan|hazel|libby|sonia|zira|aria|jenny|emma|amy|joanna|salli|kimberly|ivy|olivia|natasha|mia|nicky|allison|ava|zoe|sara|martha|catherine/i;
const MALE_NAMES = /male|daniel|arthur|oliver|george|ryan|alex|fred|thomas|rishi|david|mark|guy|james|brian|matthew|joey|justin|kevin|russell|lee|eddy|reed|rocko|grandpa|ralph|bruce|junior/i;
function browserVoice(prof) {
  if (!voices.length) loadVoices();
  const gb = voices.filter((v) => /en[-_]GB|en[-_]IE|en[-_]AU|en[-_]NZ/i.test(v.lang)); // the Westerosi speak like the show: British and Irish voices first
  const base = gb.length >= 2 ? gb : voices;
  const sexed = base.filter((v) => (prof.female ? FEMALE_NAMES.test(v.name) : MALE_NAMES.test(v.name) && !FEMALE_NAMES.test(v.name)));
  const pool = sexed.length ? sexed : base;
  return pool.length ? pool[prof.key % pool.length] : null;
}

// ---------- playback ----------
let current = null; // { stop() }
export function stopSpeaking() { try { current?.stop(); } catch { /* */ } current = null; window.speechSynthesis?.cancel(); }
/** Speak a line as a character. Resolves when finished (or immediately if voices are off). */
export async function speak(text, character) {
  const cfg = voiceSettings(); text = String(text || '').replace(/\*[^*]*\*/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text || cfg.engine === 'off') return;
  stopSpeaking();
  const prof = profileFor(character);
  if (cfg.engine === 'server') {
    try {
      const res = await fetch('/api/tts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, voice: prof.srv, speed: prof.rate }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'TTS server error');
      const url = URL.createObjectURL(await res.blob());
      const audio = new Audio(url); audio.volume = cfg.volume;
      await new Promise((resolve) => { current = { stop: () => { audio.pause(); resolve(); } }; audio.onended = resolve; audio.onerror = resolve; audio.play().catch(resolve); });
      URL.revokeObjectURL(url); return;
    } catch (e) { if (!speak.warned) { speak.warned = true; app.toast?.(`Voice server unavailable (${e.message}); using the browser's voices.`, true); } }
  }
  if (!window.speechSynthesis) return;
  await new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    const v = browserVoice(prof); if (v) u.voice = v;
    u.pitch = prof.pitch; u.rate = prof.rate * 0.95; u.volume = cfg.volume;
    u.onend = resolve; u.onerror = resolve;
    current = { stop: () => { window.speechSynthesis.cancel(); resolve(); } };
    window.speechSynthesis.speak(u);
    // some browsers never fire onend for long lines
    setTimeout(resolve, 1500 + text.length * 90);
  });
}

/** Split a reply into beats: actions (between asterisks) and speech. */
export function beats(text) {
  const out = []; const re = /\*([^*]+)\*/g; let last = 0, m;
  const pushSay = (t) => { t = t.replace(/^[\s"“”'‘’]+|[\s"“”]+$/g, '').trim(); if (t) out.push({ kind: 'say', text: t }); };
  while ((m = re.exec(text))) { pushSay(text.slice(last, m.index)); const a = m[1].trim(); if (a) out.push({ kind: 'act', text: a }); last = re.lastIndex; }
  pushSay(text.slice(last));
  return out;
}
