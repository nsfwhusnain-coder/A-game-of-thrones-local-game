// Long explanations are styled tooltips, not native titles (docs/gdd/12-ui-ux.md §14 item 5; WP F9). A native `title` is slow, unstyled, unreadable for long text and invisible to the keyboard;
// so a title of more than `TIP_MAX` characters is moved to `data-tip` and shown in the game's own tooltip — on hover after a short wait, and on keyboard focus. A short title stays as it is.
// `tipOf` is the pure rule; `startTips` watches the page (every panel draws its own markup, and any of it may carry a title).

export const TIP_MAX = 60;

/** The tooltip a title becomes: `{ tip }` for a long one (its text, trimmed and in one paragraph), `{ tip: null }` for one that may stay a title. */
export function tipOf(title) {
  const t = String(title ?? '').replace(/\s+\n/g, '\n').trim();
  return t.length > TIP_MAX ? { tip: t } : { tip: null };
}

/**
 * Where a tooltip of `size` {w,h} goes for the thing at `r` (a rect: left, top, right, bottom) on a `screen` {w,h}: under it if there is room, else over it, centred on it and kept `margin` from the
 * screen's edge. It never covers the thing it explains unless the screen is too small for anything else.
 */
export function placeTip(r, size, screen, { gap = 8, margin = 8 } = {}) {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const left = clamp((r.left + r.right) / 2 - size.w / 2, margin, Math.max(margin, screen.w - size.w - margin));
  const below = r.bottom + gap; const above = r.top - gap - size.h;
  const top = below + size.h <= screen.h - margin ? below : above >= margin ? above : clamp(below, margin, Math.max(margin, screen.h - size.h - margin));
  return { left: Math.round(left), top: Math.round(top) };
}

/** The name an element needs for a screen reader when its text is only an icon: the first sentence of its tooltip. */
export const nameFromTip = (tip) => { const s = String(tip).split(/(?<=[.!?])\s|\n/)[0].trim(); return s.length > 80 ? `${s.slice(0, 77)}…` : s; };

let tipEl = null, timer = null;
function show(el) {
  const text = el.dataset.tip; if (!text || !tipEl) return;
  tipEl.textContent = text; tipEl.classList.add('is-on'); tipEl.setAttribute('aria-hidden', 'false');
  const r = el.getBoundingClientRect(); const z = tipEl.getBoundingClientRect();
  const p = placeTip(r, { w: z.width, h: z.height }, { w: innerWidth, h: innerHeight });
  tipEl.style.left = `${p.left}px`; tipEl.style.top = `${p.top}px`;
}
function hide() { clearTimeout(timer); if (tipEl) { tipEl.classList.remove('is-on'); tipEl.setAttribute('aria-hidden', 'true'); } }

function convert(el) {
  if (!el.getAttribute || !el.hasAttribute('title')) return;
  const { tip } = tipOf(el.getAttribute('title')); if (!tip) return;
  el.dataset.tip = tip; el.removeAttribute('title');
  if (!el.getAttribute('aria-label') && !(el.textContent || '').trim()) el.setAttribute('aria-label', nameFromTip(tip));
}
const sweep = (n) => { if (n.nodeType !== 1) return; convert(n); n.querySelectorAll?.('[title]').forEach(convert); };

/** Start watching the page: long titles become tooltips now and whenever one appears. */
export function startTips(root = document.body) {
  tipEl = document.getElementById('tip');
  if (!tipEl) { tipEl = document.createElement('div'); tipEl.id = 'tip'; tipEl.className = 'wc-slip'; tipEl.setAttribute('role', 'tooltip'); tipEl.setAttribute('aria-hidden', 'true'); document.body.append(tipEl); }
  sweep(root);
  new MutationObserver((muts) => { for (const m of muts) { if (m.type === 'attributes') convert(m.target); else for (const n of m.addedNodes) sweep(n); } })
    .observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['title'] });
  document.addEventListener('mouseover', (e) => { const el = e.target.closest?.('[data-tip]'); if (!el) return; clearTimeout(timer); timer = setTimeout(() => show(el), 450); });
  document.addEventListener('mouseout', (e) => { if (e.target.closest?.('[data-tip]')) hide(); });
  document.addEventListener('focusin', (e) => { const el = e.target.closest?.('[data-tip]'); if (el) show(el); });
  document.addEventListener('focusout', (e) => { if (e.target.closest?.('[data-tip]')) hide(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
  document.addEventListener('click', hide, true); document.addEventListener('scroll', hide, true);
}
