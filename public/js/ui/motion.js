// Reduced motion (docs/gdd/12-ui-ux.md §13 and §14 item 16; WP F9). The game moves for a player who wants it to — a camera that flies to the news, panels that slide, a seal that pulses — and holds still for one
// who does not: by the system's own setting ("reduce motion"), or by this one (Settings → Display: follow the system, always reduce, or keep the motion), which wins over the system when it is not "follow".
// Reduced means: the camera cuts instead of flying (ui/choreo.js), no animation or transition runs (css/names.css `.reduce-motion`), and scrolling does not glide.
export const MOTION_KEY = 'reduce-motion';
export const MOTION_CHOICES = [['system', 'Follow my system'], ['reduce', 'Reduce motion'], ['full', 'Keep the motion']];

const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
/** What the player chose: 'system' (the default), 'reduce' or 'full'. */
export const motionChoice = () => { const v = read(MOTION_KEY); return MOTION_CHOICES.some(([k]) => k === v) ? v : 'system'; };
/** Whether motion is reduced: the choice if it is not "system", else the system's own preference. */
export function reducedMotion(choice = motionChoice(), system = systemReduces()) { return choice === 'reduce' ? true : choice === 'full' ? false : !!system; }
function systemReduces() { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } }
/** The page's class for it, and the choice remembered. */
export function applyMotion(choice = motionChoice()) { document.documentElement.classList.toggle('reduce-motion', reducedMotion(choice)); }
export function setMotionChoice(choice) { try { localStorage.setItem(MOTION_KEY, choice); } catch { /* private mode */ } applyMotion(choice); }
/** A scroll that glides unless motion is reduced. */
export const scrollBehavior = () => (reducedMotion() ? 'auto' : 'smooth');
