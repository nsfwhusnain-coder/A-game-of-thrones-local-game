// The map's held keys (bug hunt UI1). The map pans while W, A, S, D or an arrow is held, from a set of keys it adds on key-down and removes on key-up. Two things
// left a letter in the set for ever and the camera drifting: a key pressed with Cmd (Cmd+S, Cmd+D, Cmd+A: on a Mac the browser takes the letter's release), and the window
// losing the keyboard (Cmd+Tab, a dialog, another tab) while a key was held. Keys held with Cmd, Ctrl or Alt are the browser's, not the map's; and whatever the page did
// not hear is forgotten when it loses focus or is hidden.

/** Wire `keys` (a Set) to the window: what is held, and what is let go of. Returns a function that takes the listeners off. */
export function holdKeys({ win, doc, keys, accept = () => true }) {
  const letGo = () => keys.clear();
  const down = (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) { letGo(); return; }
    if (accept(e)) keys.add(String(e.key).toLowerCase());
  };
  const up = (e) => keys.delete(String(e.key).toLowerCase());
  const hidden = () => { if (doc.hidden) letGo(); };
  win.addEventListener('keydown', down); win.addEventListener('keyup', up); win.addEventListener('blur', letGo); doc.addEventListener('visibilitychange', hidden);
  return () => { win.removeEventListener('keydown', down); win.removeEventListener('keyup', up); win.removeEventListener('blur', letGo); doc.removeEventListener('visibilitychange', hidden); };
}
