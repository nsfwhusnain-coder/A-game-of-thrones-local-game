// Music: your own soundtrack, played by where you are. Put audio files in public/music/:
//   music/<house>/   played while you rule that house (music/stark/, music/lannister/, music/targaryen/ …)
//   music/title/     on the title screen
//   music/war/       while your house is at war
//   music/           anything else, when nothing more fitting is there
// Tracks shuffle within their folder and crossfade when the scene changes. With no files there is silence —
// the generated score is gone. Starts on the first click (browsers forbid sound before that).
const store = { get: (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* */ } } };
export const musicSettings = () => ({ on: store.get('music-on', true), volume: store.get('music-volume', 0.3) });
export function setMusic(k, v) { store.set('music-' + k, v); apply(); }

let library = null, started = false, mood = 'title', house = null, playingGroup = null, el = null, fading = null;
let ctx = null, bus = null;

async function loadLibrary() {
  try { const r = await fetch('/api/music'); const j = await r.json(); return (j.tracks || []).length ? j.tracks : null; } catch { return null; }
}
// the folder that fits the scene best, of those that have music in them
function groupFor() {
  const has = (g) => library?.some((t) => t.group === g);
  if (mood === 'title') return has('title') ? 'title' : has('any') ? 'any' : library?.[0]?.group || null;
  if (mood === 'war' && has('war')) return 'war';
  if (house && has(house)) return house;
  return has('any') ? 'any' : null;
}
function pick(group) {
  const pool = library.filter((t) => t.group === group); if (!pool.length) return null;
  let next = pool[Math.floor(Math.random() * pool.length)];
  if (pool.length > 1 && el && next.url === el.dataset.url) next = pool.find((t) => t.url !== el.dataset.url);
  return next;
}
function volume() { const s = musicSettings(); return s.on ? s.volume : 0; }
function level(a) { return a?._gain ? a._gain.gain.value : a?.volume || 0; }
function setLevel(a, v) { if (!a) return; if (a._gain) a._gain.gain.value = v; else a.volume = v; }
function colour(a) {
  if (!a?._filter || !ctx) return;
  // The same recording changes with the realm: winter muffles the high air, court opens it,
  // and war brings the drums forward. No generated melody is added to the player's soundtrack.
  const hz = mood === 'war' ? 15500 : mood === 'north' ? 4200 : mood === 'court' ? 10500 : 7200;
  a._filter.frequency.cancelScheduledValues(ctx.currentTime); a._filter.frequency.linearRampToValueAtTime(hz, ctx.currentTime + 1.2);
  a._filter.Q.value = mood === 'war' ? 0.9 : 0.35;
}
function wire(a) {
  if (!ctx || !bus) return;
  const source = ctx.createMediaElementSource(a), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
  filter.type = 'lowpass'; filter.frequency.value = 7200; gain.gain.value = 0; source.connect(filter); filter.connect(gain); gain.connect(bus);
  a._gain = gain; a._filter = filter; colour(a);
}
function apply() { if (el && !fading) setLevel(el, volume()); colour(el); }

// play the group's next track, fading the old one out first
function play(group) {
  playingGroup = group;
  const track = group && pick(group);
  const start = () => {
    if (!track) { if (el) { el.pause(); el = null; } return; }
    el = new Audio(track.url); el.dataset.url = track.url; el.crossOrigin = 'anonymous'; el.volume = ctx ? 1 : 0; wire(el);
    el.addEventListener('ended', () => play(playingGroup));
    el.play().catch(() => {});
    fadeTo(el, volume(), 1500);
  };
  if (el && !el.paused) { const old = el; fadeTo(old, 0, 1200, () => { old.pause(); start(); }); } else start();
}
function fadeTo(a, target, ms, done) {
  clearInterval(fading); const from = level(a); const t0 = performance.now();
  fading = setInterval(() => {
    const f = Math.min(1, (performance.now() - t0) / ms); setLevel(a, Math.max(0, Math.min(1, from + (target - from) * f)));
    if (f >= 1) { clearInterval(fading); fading = null; done?.(); }
  }, 50);
}
function refresh() { if (!started || !library) return; const g = groupFor(); if (g !== playingGroup) play(g); else colour(el); }

/** Begin the music (call from a user gesture). */
export async function startMusic() {
  if (started) { if (ctx?.state === 'suspended') await ctx.resume(); return; } started = true;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (AC) { ctx = new AC(); bus = ctx.createGain(); bus.gain.value = 1; bus.connect(ctx.destination); if (ctx.state === 'suspended') await ctx.resume(); }
  library = await loadLibrary();
  refresh();
}
/** The scene: 'title' | 'court' | 'north' | 'war'. The folder changes only when the scene calls for other music. */
export function setMood(m) { if (m === mood) return; mood = m; refresh(); }
/** The house you rule: its folder of music plays in the game. */
export function setMusicHouse(h) { if (h === house) return; house = h; refresh(); }
export const musicDebug = () => ({ started, mood, house, group: playingGroup, tracks: library?.length || 0, playing: el?.dataset.url || null });
