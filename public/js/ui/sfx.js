// Sound effects, synthesised in the browser so nothing needs downloading: a wooden click for buttons,
// parchment when a window opens, a deep bell as time passes, a raven's caw for letters, a war horn for
// battle, steel for military orders, coins for the treasury, and the thump of a wax seal for decisions.
const store = { get: (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private window */ } } };
export const sfxSettings = () => ({ on: store.get('sfx-on', true), volume: store.get('sfx-volume', 0.5) });
export function setSfx(k, v) { store.set('sfx-' + k, v); if (bus) bus.gain.value = sfxSettings().volume; }

let ctx = null, bus = null, noiseBuf = null, verb = null;
function init() {
  if (ctx) return ctx.state === 'suspended' ? ctx.resume() : null;
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  ctx = new AC();
  bus = ctx.createGain(); bus.gain.value = sfxSettings().volume; bus.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  // a short stone-room tail, shared
  verb = ctx.createConvolver(); const len = ctx.sampleRate * 1.6; const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const x = ir.getChannelData(c); for (let i = 0; i < len; i++) x[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
  verb.buffer = ir; const wet = ctx.createGain(); wet.gain.value = 0.25; verb.connect(wet); wet.connect(bus);
}
const now = () => ctx.currentTime;
function env(g, t, a, peak, dec) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); }
function route(node, wet = 0.3) { node.connect(bus); if (wet) { const s = ctx.createGain(); s.gain.value = wet; node.connect(s); s.connect(verb); } }
function noise(t, dur, { type = 'bandpass', freq = 2000, q = 1, peak = 0.3, a = 0.005, wet = 0.2, sweepTo = null } = {}) {
  const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
  const g = ctx.createGain(); env(g, t, a, peak, dur);
  src.connect(f); f.connect(g); route(g, wet); src.start(t); src.stop(t + a + dur + 0.05);
}
function tone(t, freq, dur, { type = 'sine', peak = 0.2, a = 0.004, wet = 0.3, glideTo = null, detune = 0 } = {}) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t); o.detune.value = detune;
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
  const g = ctx.createGain(); env(g, t, a, peak, dur);
  o.connect(g); route(g, wet); o.start(t); o.stop(t + a + dur + 0.05);
}

const SOUNDS = {
  click() { const t = now(); noise(t, 0.035, { freq: 1800, q: 2.5, peak: 0.18, wet: 0.05 }); tone(t, 190, 0.06, { peak: 0.08, wet: 0 }); },
  open() { const t = now(); for (let i = 0; i < 3; i++) noise(t + i * 0.045 + Math.random() * 0.02, 0.09, { freq: 3000 + Math.random() * 2500, q: 0.8, peak: 0.07, wet: 0.1 }); },
  close() { const t = now(); noise(t, 0.08, { freq: 2600, q: 0.9, peak: 0.06, wet: 0.08, sweepTo: 1400 }); },
  bell() { // the hours pass: an inharmonic bronze bell
    const t = now(); const f = 98;
    for (const [m, p, d] of [[1, 0.22, 4.5], [2.0, 0.1, 3.5], [2.76, 0.09, 3], [5.4, 0.05, 2], [8.9, 0.03, 1.2]]) tone(t, f * m, d, { peak: p, a: 0.006, wet: 0.6 });
    noise(t, 0.05, { freq: 3500, q: 1, peak: 0.08, wet: 0.3 });
  },
  raven() { // two harsh caws
    const t = now();
    for (const k of [0, 0.32]) { tone(t + k, 620, 0.22, { type: 'sawtooth', peak: 0.05, glideTo: 380, wet: 0.35 }); noise(t + k, 0.2, { freq: 1300, q: 3, peak: 0.1, wet: 0.35 }); }
    for (let i = 0; i < 4; i++) noise(t + 0.7 + i * 0.07, 0.06, { freq: 900, q: 1.5, peak: 0.04, wet: 0.2 }); // wingbeats
  },
  horn() { // a war horn, low and swelling
    const t = now(); const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.35); g.gain.setValueAtTime(0.16, t + 1.3); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 2;
    const vib = ctx.createOscillator(); vib.frequency.value = 4.5; const vg = ctx.createGain(); vg.gain.value = 2.5; vib.connect(vg);
    for (const [f, dt] of [[110, 0], [110, 7], [220, -5]]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f * 0.94, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.3); o.detune.value = dt; vg.connect(o.frequency); o.connect(lp); o.start(t); o.stop(t + 2.5); }
    vib.start(t); vib.stop(t + 2.5); lp.connect(g); route(g, 0.7);
  },
  steel() { const t = now(); noise(t, 0.35, { type: 'highpass', freq: 2500, q: 0.7, peak: 0.12, wet: 0.3, sweepTo: 7000 }); for (const f of [2400, 3710, 5230]) tone(t + 0.05, f, 0.6, { peak: 0.025, wet: 0.4 }); },
  coins() { const t = now(); for (let i = 0; i < 6; i++) { const k = t + i * 0.05 + Math.random() * 0.03; tone(k, 3000 + Math.random() * 2500, 0.16, { peak: 0.04, wet: 0.2 }); noise(k, 0.03, { freq: 6000, q: 2, peak: 0.05, wet: 0.1 }); } },
  seal() { const t = now(); tone(t, 90, 0.18, { peak: 0.2, glideTo: 55, wet: 0.15 }); noise(t, 0.06, { freq: 600, q: 1, peak: 0.15, wet: 0.15 }); tone(t + 0.12, 880, 0.9, { peak: 0.03, wet: 0.5 }); tone(t + 0.12, 1318, 0.8, { peak: 0.02, wet: 0.5 }); },
  error() { const t = now(); tone(t, 140, 0.2, { type: 'triangle', peak: 0.1, glideTo: 90, wet: 0.1 }); },
};

export function sfx(name) {
  if (!sfxSettings().on) return;
  try { init(); if (!ctx) return; SOUNDS[name]?.(); } catch (e) { if (window.__sfxDebug) console.error('sfx', name, e.message); /* sound is a nicety */ }
}

// Buttons click on their own; the game calls sfx() for the rest.
let wired = false;
export function wireSfx() {
  if (wired) return; wired = true;
  document.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('button, .btn, .house-tile, .save, [data-action], [data-win], .dec-opt, summary');
    if (b && !b.disabled) sfx('click');
  }, true);
}
