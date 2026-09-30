// Focus goes back to what opened a panel (docs/gdd/12-ui-ux.md §14 item 10; WP F9). A player who opened the Realm with a button, a card with a click or the chronicle with its key and closes it
// with Escape should land where they were, not at the top of the page: the panel remembers what had focus when it opened, and gives it back when it closes — if that thing is still there and
// still shown. (A dialog does the same in common.js `modal`/`closeModal`.)
const held = new Map();

/** What had focus when `panel` opened (nothing, when the page itself did: a key was pressed). */
export function rememberOpener(panel) {
  const a = document.activeElement;
  held.set(panel, a && a !== document.body && a !== document.documentElement ? a : null);
}
/** Give focus back to what opened `panel`, if it is still in the page and shown. True when it did. */
export function restoreOpener(panel) {
  const el = held.get(panel); held.delete(panel);
  if (!el || !el.isConnected || !(el.offsetWidth || el.offsetHeight || el.getClientRects?.().length)) return false;
  el.focus?.({ preventScroll: true }); return document.activeElement === el;
}
