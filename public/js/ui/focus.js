// Everything clickable is reachable by keyboard (docs/gdd/12-ui-ux.md §13 and §14 item 11; WP F9). Most of the game's clickable things are buttons; the rest — the rows of a list of people or
// houses, the cards of a family tree, the plates of the chronicle — were drawn as plain blocks with a click behind them. This makes each of them a stop of the Tab key and a button for a screen
// reader (Enter or Space presses it), wherever the page draws one, without the screens having to know.
const SELECTOR = [
  '.row.clickable', '.clickable[data-char]', '.clickable[data-house]', '.clickable[data-hold]', '.clickable[data-army]',
  '[data-char]:not(.nm):not(button):not(.lbl):not(input):not(select)', '[data-house]:not(.nm):not(button):not(a):not(.lbl)', '[data-hold]:not(.lbl):not(button):not(a)', '[data-army]:not(.lbl):not(button):not(a)',
  '.family .m', '[data-inbox]:not(button)', '[data-strip]:not(button)',
].join(',');

/** Whether an element the page drew needs to be made a button for the keyboard (pure enough to test: it reads attributes only). */
export function needsButton(el) {
  if (!el?.matches?.(SELECTOR)) return false;
  if (el.matches('button, a[href], input, select, textarea, summary') || el.closest('svg')) return false;
  return !el.hasAttribute('tabindex') || el.getAttribute('role') == null;
}
export function makeButton(el) { if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0'); if (!el.getAttribute('role')) el.setAttribute('role', 'button'); }
const sweep = (n) => { if (n.nodeType !== 1) return; if (needsButton(n)) makeButton(n); n.querySelectorAll?.(SELECTOR).forEach((e) => { if (needsButton(e)) makeButton(e); }); };

/** Start: make what is there a button now, and whatever the page draws from now on. */
export function startFocus(root = document.body) {
  sweep(root);
  new MutationObserver((muts) => { for (const m of muts) for (const n of m.addedNodes) sweep(n); }).observe(root, { childList: true, subtree: true });
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[role="button"]:not(button):not(a)') && e.target.hasAttribute('tabindex') && !e.target.matches('.lbl')) { e.preventDefault(); e.target.click(); }
  });
}
export { SELECTOR as FOCUS_SELECTOR };
