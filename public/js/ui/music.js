// Music: your own soundtrack, played by where you are. Put audio files in public/music/:
//   music/<house>/   played while you rule that house (music/stark/, music/lannister/, music/targaryen/ …)
//   music/title/     on the title screen
//   music/war/       while your house is at war
//   music/tension/ music/lament/ music/winter/ music/north/ music/reach/ music/dorne/ music/iron/    (optional, WP H1) while a jump is awaited; for a death in your family; in winter; and by the region you rule
//   music/           anything else, when nothing more fitting is there
// Tracks shuffle within their folder and crossfade when the scene changes. With no files there is silence —
// the generated score is gone. Starts on the first click (browsers forbid sound before that).
const store = { get: (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* */ } } };
export const musicSettings = () => ({ on: store.get('music-on', true), volume: store.get('music-volume', 0.3) });
export function setMusic(k, v) { store.set('music-' + k, v); apply(); }

let library = null, started = false, mood = 'title', house = null, playingGroup = null, el = null, fading = null;
let region = null, cold = false, quiet = 1, ducked = 1, duckTimer = null; // WP H1: the region's variant, winter's colder mix, a matter's quiet, a cue's ducking (ui/audio-map.js says when)

async function loadLibrary() {
  try { const r = await fetch('/api/music'); const j = await r.json(); return (j.tracks || []).length ? j.tracks : null; } catch { return null; }
}
// the folder that fits the scene best, of those that have music in them
function groupFor() {
  const has = (g) => library?.some((t) => t.group === g);
  if (mood === 'title' || mood === 'theme') return has('title') ? 'title' : has('any') ? 'any' : library?.[0]?.group || null;
  // the moods of the story, each with a folder of its own if the player has put music there; else the nearest fitting one
  if (['war', 'tension', 'lament'].includes(mood) && has(mood)) return mood;
  if (mood === 'tension' && has('war')) return 'war';
  if (cold && has('winter')) return 'winter';
  if (region && region !== 'court' && has(region)) return region;
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
function volume() { const s = musicSettings(); return s.on ? s.volume * quiet * ducked : 0; }
function apply() { if (el && !fading) el.volume = volume(); }

// play the group's next track, fading the old one out first
function play(group) {
  playingGroup = group;
  const track = group && pick(group);
  const start = () => {
    if (!track) { if (el) { el.pause(); el = null; } return; }
    el = new Audio(track.url); el.dataset.url = track.url; el.volume = 0;
    el.addEventListener('ended', () => play(playingGroup));
    el.play().catch(() => {});
    fadeTo(el, volume(), 1500);
  };
  if (el && !el.paused) { const old = el; fadeTo(old, 0, 1200, () => { old.pause(); start(); }); } else start();
}
function fadeTo(a, target, ms, done) {
  clearInterval(fading); const from = a.volume; const t0 = performance.now();
  fading = setInterval(() => {
    const f = Math.min(1, (performance.now() - t0) / ms); a.volume = Math.max(0, Math.min(1, from + (target - from) * f));
    if (f >= 1) { clearInterval(fading); fading = null; done?.(); }
  }, 50);
}
function refresh() { if (!started || !library) return; const g = groupFor(); if (g !== playingGroup) play(g); }

/** Begin the music (call from a user gesture). */
export async function startMusic() {
  if (started) return; started = true;
  library = await loadLibrary();
  refresh();
}
/** The scene: 'title' | 'court' | 'north' | 'war'. The folder changes only when the scene calls for other music. */
export function setMood(m) { if (m === mood) return; mood = m; refresh(); }
/**
 * The scene as ui/audio-map.js `moodFor` gives it: { mood, region, cold, quiet }. The same mood is never restarted; a change of folder crossfades (1.2 s out, 1.5 s in); a matter's quiet
 * fades the music to a fifth of its volume over a second and the player decides in quiet; winter keeps the mood's folder unless a folder called winter is there.
 */
export function setScene(sc) {
  const next = { mood: sc.mood || 'court', region: sc.region || null, cold: !!sc.cold, quiet: typeof sc.quiet === 'number' ? sc.quiet : 1 };
  const changed = next.mood !== mood || next.region !== region || next.cold !== cold;
  mood = next.mood; region = next.region; cold = next.cold;
  if (next.quiet !== quiet) { quiet = next.quiet; if (el) fadeTo(el, volume(), 1000); }
  if (changed) refresh();
}
/** A cue ducks the music by `by` (0.3 = 30 %) for `ms`, then it comes back. */
export function duck(by, ms) {
  ducked = Math.max(0, 1 - by); if (el && !fading) el.volume = volume();
  clearTimeout(duckTimer); duckTimer = setTimeout(() => { ducked = 1; if (el && !fading) el.volume = volume(); }, ms);
}
/** The house you rule: its folder of music plays in the game. */
export function setMusicHouse(h) { if (h === house) return; house = h; refresh(); }
export const musicDebug = () => ({ started, mood, region, cold, quiet, house, group: playingGroup, tracks: library?.length || 0, playing: el?.dataset.url || null });
