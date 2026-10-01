// The music's scene, kept in step with the screen (docs/gdd/14-audio.md §1; WP H1): what ui/audio-map.js `moodFor` says of the screen now — the title, the planning mood by region and war, the tension of a jump awaited, a lament for a
// death in the player's family, the quiet of a matter being read, the end — is given to the music. A page-side shim: the rules are in audio-map.js, tested in node.
import { app } from './common.js';
import { setScene, duck } from './music.js';
import { onDuck } from './sfx.js';
import { moodFor, TENSION_SECONDS } from './audio-map.js';

let wired = false; let tensionTimer = null;
/** Give the music the scene the screen is in now (call whenever one of its inputs changes). */
export function refreshScene() {
  const modal = typeof document !== 'undefined' ? document.getElementById('modal') : null;
  if (app.screen === 'end' && modal?.classList.contains('hidden')) app.screen = 'game'; // the end of the tale put away: play on
  const matterOpen = !!(modal && !modal.classList.contains('hidden') && modal.querySelector('.decision'));
  const waiting = app.waitingSince != null ? (performance.now() - app.waitingSince) / 1000 : null;
  setScene(moodFor({ screen: app.screen || 'game', state: app.state, waiting, matterOpen, card: app.toldCard, result: app.endResult, house: app.titleHouse }));
}
/** A jump is awaited: tension, for at most twenty seconds (then the planning mood comes back); `done()` ends it. */
export function awaitJump() {
  app.waitingSince = performance.now(); refreshScene();
  clearTimeout(tensionTimer); tensionTimer = setTimeout(refreshScene, TENSION_SECONDS * 1000 + 300);
  return () => { clearTimeout(tensionTimer); app.waitingSince = null; refreshScene(); };
}
/** A card is being told in playback: a family death is a lament for as long as the card is held. */
export function toldCard(card, holdMs) {
  app.toldCard = card; refreshScene();
  setTimeout(() => { if (app.toldCard === card) { app.toldCard = null; refreshScene(); } }, Math.max(1500, holdMs || 0));
}
/** Watch the page for a matter being opened or put away, and register the music's ducking with the effects. */
export function watchScene() {
  if (wired || typeof document === 'undefined') return; wired = true;
  onDuck(duck);
  const modal = document.getElementById('modal');
  if (modal) new MutationObserver(() => refreshScene()).observe(modal, { attributes: true, attributeFilter: ['class'], childList: true });
}
