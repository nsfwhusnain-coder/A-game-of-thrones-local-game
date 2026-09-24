// Music: an original score composed live in the browser (Web Audio) — a cello-led theme over harp and drone,
// with moods for the title, the court, the cold North and war. Your own music wins: any audio files in
// public/music/ are played instead (shuffled). Starts on the first click (browsers forbid sound before that).
const store = { get: (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* */ } } };

let ctx = null, master = null, reverb = null, dry = null, started = false, mood = 'title', nextMood = null;
let timer = null, t = 0, bar = 0, playlist = null, audioEl = null;
export const musicSettings = () => ({ on: store.get('music-on', true), volume: store.get('music-volume', 0.45) });
export function setMusic(k, v) { store.set('music-' + k, v); apply(); }

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12); // midi → Hz
// D minor (Aeolian) with a raised seventh for cadences; the melody lives around D4
const KEY = 62; const SCALE = [0, 2, 3, 5, 7, 8, 10];
const deg = (d, oct = 0) => KEY + SCALE[((d % 7) + 7) % 7] + 12 * (Math.floor(d / 7) + oct);
const PROGS = {
  title: [[0, 5, 2, 6], [0, 3, 4, 0], [5, 3, 0, 4]],
  court: [[0, 5, 3, 4], [0, 2, 5, 6], [3, 0, 4, 0]],
  north: [[0, 0, 5, 5], [0, 6, 5, 4], [0, 3, 0, 4]],
  war: [[0, 6, 5, 6], [0, 5, 6, 4], [0, 0, 6, 4]],
};
const TEMPO = { title: 64, court: 72, north: 54, war: 88 };
// a motif (scale steps, beats) that the melody keeps coming back to — gives the score a recognisable theme
const MOTIF = [[4, 1], [3, 0.5], [2, 0.5], [3, 1], [0, 1], [-1, 0.5], [0, 1.5], [2, 1], [1, 1]];

function init() {
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain(); master.gain.value = 0;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3;
  master.connect(comp); comp.connect(ctx.destination);
  // a stone hall: generated impulse response
  reverb = ctx.createConvolver(); const len = ctx.sampleRate * 3.2; const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
  reverb.buffer = ir; const wet = ctx.createGain(); wet.gain.value = 0.55; reverb.connect(wet); wet.connect(master);
  dry = ctx.createGain(); dry.gain.value = 0.75; dry.connect(master);
}
const out = (node, send = 0.5) => { node.connect(dry); if (send) { const g = ctx.createGain(); g.gain.value = send; node.connect(g); g.connect(reverb); } };

// ---------- instruments ----------
function harp(freq, when, vel = 0.5) {
  const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
  o.type = 'triangle'; o2.type = 'sine'; o.frequency.value = freq; o2.frequency.value = freq * 2.002;
  f.type = 'lowpass'; f.frequency.setValueAtTime(freq * 8, when); f.frequency.exponentialRampToValueAtTime(freq * 2, when + 1.2);
  g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(0.16 * vel, when + 0.006); g.gain.exponentialRampToValueAtTime(0.0008, when + 2.4);
  const g2 = ctx.createGain(); g2.gain.value = 0.25; o2.connect(g2); g2.connect(g);
  o.connect(g); g.connect(f); out(f, 0.6); o.start(when); o2.start(when); o.stop(when + 2.5); o2.stop(when + 2.5);
}
function cello(freq, when, dur, vel = 0.5) {
  const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter(), lfo = ctx.createOscillator(), lg = ctx.createGain();
  o.type = 'sawtooth'; o2.type = 'sawtooth'; o.frequency.value = freq; o2.frequency.value = freq * 1.004;
  lfo.frequency.value = 5.2; lg.gain.value = freq * 0.006; lfo.connect(lg); lg.connect(o.frequency); lg.connect(o2.frequency);
  f.type = 'lowpass'; f.frequency.value = Math.min(2400, freq * 5); f.Q.value = 0.7;
  const a = Math.min(0.35, dur * 0.3);
  g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(0.07 * vel, when + a); g.gain.setValueAtTime(0.07 * vel, when + dur - 0.1); g.gain.linearRampToValueAtTime(0, when + dur + 0.4);
  o.connect(g); o2.connect(g); g.connect(f); out(f, 0.5);
  for (const x of [o, o2, lfo]) { x.start(when); x.stop(when + dur + 0.5); }
}
function drone(freq, when, dur, vel = 0.4) {
  for (const k of [1, 1.5, 2]) {
    const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = k === 1.5 ? 'triangle' : 'sawtooth'; o.frequency.value = freq * k * (1 + (Math.random() - 0.5) * 0.002);
    f.type = 'lowpass'; f.frequency.value = 520;
    g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(0.028 * vel / k, when + 2.2); g.gain.setValueAtTime(0.028 * vel / k, when + dur - 1); g.gain.linearRampToValueAtTime(0, when + dur + 1.5);
    o.connect(f); f.connect(g); out(g, 0.7); o.start(when); o.stop(when + dur + 1.6);
  }
}
function choir(freqs, when, dur, vel = 0.3) {
  for (const fr of freqs) for (const det of [-0.004, 0.004]) {
    const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.value = fr * (1 + det);
    f.type = 'bandpass'; f.frequency.value = 800; f.Q.value = 1.2; // an "ah" vowel
    g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(0.012 * vel, when + 1.6); g.gain.setValueAtTime(0.012 * vel, when + dur - 0.8); g.gain.linearRampToValueAtTime(0, when + dur + 1.2);
    o.connect(f); f.connect(g); out(g, 0.9); o.start(when); o.stop(when + dur + 1.3);
  }
}
function drum(when, vel = 0.6, low = true) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(low ? 95 : 160, when); o.frequency.exponentialRampToValueAtTime(low ? 42 : 80, when + 0.35);
  g.gain.setValueAtTime(0.5 * vel, when); g.gain.exponentialRampToValueAtTime(0.001, when + 0.6);
  o.connect(g); out(g, 0.3); o.start(when); o.stop(when + 0.65);
  const n = ctx.createBufferSource(); const b = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const nf = ctx.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 900; const ng = ctx.createGain(); ng.gain.value = 0.12 * vel;
  n.buffer = b; n.connect(nf); nf.connect(ng); out(ng, 0.2); n.start(when);
}
function wind(when, dur) {
  const n = ctx.createBufferSource(); const b = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  n.buffer = b; n.loop = true; const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.8; f.frequency.setValueAtTime(400, when); f.frequency.linearRampToValueAtTime(900, when + dur / 2); f.frequency.linearRampToValueAtTime(350, when + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(0.02, when + dur / 2); g.gain.linearRampToValueAtTime(0, when + dur);
  n.connect(f); f.connect(g); out(g, 0.4); n.start(when); n.stop(when + dur);
}

// ---------- the composer: one bar at a time, a little ahead of the clock ----------
function scheduleBar() {
  if (nextMood) { mood = nextMood; nextMood = null; bar = 0; }
  const bpm = TEMPO[mood]; const beat = 60 / bpm; const barLen = beat * 4;
  const prog = PROGS[mood][Math.floor(bar / 4) % PROGS[mood].length];
  const root = prog[bar % 4];
  const chord = [root, root + 2, root + 4];
  const when = t;
  // harmony
  if (bar % 4 === 0) drone(NOTE(deg(root, -2)), when, barLen * 4 - 0.5, mood === 'war' ? 0.6 : 0.45);
  if (mood !== 'war' && bar % 8 === 4) choir(chord.map((d) => NOTE(deg(d, 0))), when, barLen * 2, 0.35);
  // harp arpeggios (not in the bleak North, which gets sparse plucks)
  if (mood === 'north') { if (bar % 2 === 0) harp(NOTE(deg(chord[Math.floor(Math.random() * 3)], 0)), when + beat * 2, 0.35); if (bar % 8 === 0) wind(when, barLen * 6); }
  else if (mood !== 'war') for (let i = 0; i < 8; i++) harp(NOTE(deg(chord[[0, 1, 2, 1, 0, 2, 1, 2][i]] + (i >= 4 ? 7 : 0), -1)), when + i * beat * 0.5, i % 4 === 0 ? 0.55 : 0.35);
  // war: drums and a driving low ostinato
  if (mood === 'war') { for (let i = 0; i < 4; i++) drum(when + i * beat, i % 2 ? 0.45 : 0.8); drum(when + beat * 3.5, 0.35, false); for (let i = 0; i < 8; i++) cello(NOTE(deg(root, -1)) * (i % 4 === 3 ? 1.5 : 1), when + i * beat * 0.5, beat * 0.42, 0.55); }
  // melody: the motif on phrases 1 and 3, answered by free variation on 2 and 4; rests for breath
  const phrase = Math.floor(bar / 2) % 4;
  if (bar % 2 === 0 && (mood !== 'north' || phrase % 2 === 0)) {
    let at = when; const shift = phrase === 2 ? 2 : 0;
    const line = phrase % 2 === 0 ? MOTIF : MOTIF.map(([d, l], i) => [i === MOTIF.length - 1 ? chord[0] : d + (Math.random() < 0.4 ? (Math.random() < 0.5 ? 1 : -1) : 0), l]);
    for (const [d, l] of line) {
      const dur = l * beat;
      if (at - when > barLen * 2 - 0.01) break;
      cello(NOTE(deg(d + shift, mood === 'north' ? -1 : 0)), at, dur * 0.95, mood === 'war' ? 0.7 : 0.55);
      at += dur;
    }
  }
  t += barLen; bar++;
}
function tick() {
  if (!ctx || playlist) return;
  while (t < ctx.currentTime + 1.5) scheduleBar();
}

async function loadPlaylist() {
  try { const r = await fetch('/api/music'); const j = await r.json(); return j.files?.length ? j.files : null; } catch { return null; }
}
function playNextFile() {
  if (!playlist?.length) return;
  const i = Math.floor(Math.random() * playlist.length);
  audioEl.src = playlist[i]; audioEl.play().catch(() => {});
}
function apply() {
  const s = musicSettings();
  if (audioEl) audioEl.volume = s.on ? s.volume : 0;
  if (master && ctx) master.gain.setTargetAtTime(s.on ? s.volume * 0.9 : 0, ctx.currentTime, 0.6);
}

/** Begin the music (call from a user gesture). */
export async function startMusic() {
  if (started) return; started = true;
  playlist = await loadPlaylist();
  if (playlist) {
    audioEl = new Audio(); audioEl.addEventListener('ended', playNextFile); apply(); playNextFile(); return;
  }
  init(); if (ctx.state === 'suspended') await ctx.resume();
  t = ctx.currentTime + 0.2; apply();
  timer = setInterval(tick, 250); tick();
}
/** Change the mood: 'title' | 'court' | 'north' | 'war'. Takes effect at the next bar. */
export function setMood(m) { if (PROGS[m] && m !== mood) nextMood = m; }
