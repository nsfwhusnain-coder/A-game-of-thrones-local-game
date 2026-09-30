// The State of the Realm (docs/gdd/19-realm-ledger.md §6; WP R4): the Realm door of the menu. A ledger of the houses as this house knows them — every figure with its mark
// (~ an estimate, ≈ a band, ≥ at least, — nothing known) and how old the word is, who is rising and who is falling and why, the wars as they are known, what the realm is saying
// and where to focus. Closed until asked for; it changes nothing (a button of "where to focus" only writes an order into the box). What it shows is what
// `GET /api/games/:id/realm` sends, which is built from this house's knowledge: this file draws it and never adds to it.
import { app, $, $$, esc, api, sig, toast } from './common.js';
import { ledgerHtml as pageOf } from './realm-view.js';

const KEY = 'wc.ledger';
const DEFAULTS = { lens: 'strength', scope: 'great', realm: false, moons: 3, sortKey: 'rank', sortDir: 1, cols: false, house: null };
const store = { get: () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } }, set: (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* not kept */ } } };
/** What the lord last asked the ledger for (a per-viewer convenience, kept in the browser); the selected house is never kept. */
const ask = () => (app.ledger ||= { ...DEFAULTS, ...store.get(), house: null });
const remember = () => { const { house, ...keep } = ask(); store.set(keep); };
let seq = 0;
// What the page draws with that only the window knows: a house's crest and name from the state it holds, and which house is the player's
const liveEnv = () => ({ crest: (id) => { const h = app.state.houses[id]; return h ? sig(h, 1.45) : ''; }, nameOf: (id) => app.state.houses[id]?.name || id, you: app.state.meta.player });
const youId = () => app.state.meta.player;

/** Draw the ledger into `root` (the body of the Realm window) and fetch what it shows. */
export async function renderLedger(root) {
  const q = ask(); const mine = ++seq;
  const lens = q.lens === 'wars' ? 'strength' : q.lens;
  const params = new URLSearchParams({ lens, scope: q.scope, window: String(q.moons), house: q.house || app.state.meta.player }); if (q.realm) params.set('realm', '1');
  // the last page stays until the new one is ready (a turn or an order redraws the window; nothing should flicker)
  root.innerHTML = app.ledgerHtml || '<p class="wc-quiet">The maester turns the pages…</p>'; root.onclick = (e) => onClick(e, root);
  let v; try { v = await api(`/games/${app.saveId}/realm?${params}`); } catch (e) { if (mine === seq) root.innerHTML = `<p class="wc-quiet">The ledger could not be read: ${esc(e.message)}</p>`; return; }
  if (mine !== seq || app.win !== 'realm') return;
  root.innerHTML = app.ledgerHtml = pageOf(v, q, liveEnv()); app.ledgerView = v;
}

// ── the clicks ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function onClick(e, root) {
  const q = ask(); const t = e.target;
  const lens = t.closest('[data-lens]');
  if (lens) { q.lens = lens.dataset.lens; q.house = null; remember(); return void renderLedger(root); }
  if (t.closest('[data-cols]')) { q.cols = !q.cols; remember(); return void renderLedger(root); }
  const moons = t.closest('[data-moons]'); if (moons) { q.moons = Number(moons.dataset.moons); remember(); return void renderLedger(root); }
  const realm = t.closest('[data-realm]'); if (realm) { q.realm = realm.dataset.realm === 'true'; remember(); return void renderLedger(root); }
  const sort = t.closest('[data-sort]'); if (sort) { const k = sort.dataset.sort; q.sortDir = q.sortKey === k ? -q.sortDir : 1; q.sortKey = k; remember(); return void renderLedger(root); }
  if (t.closest('[data-back]')) { q.house = null; return void renderLedger(root); }
  const focus = t.closest('[data-focus]'); if (focus) { writeOrder(focus.dataset.focus); return; }
  const row = t.closest('[data-row]'); if (row) { q.house = row.dataset.row === youId() ? null : row.dataset.row; renderLedger(root).then(() => $('.realm-detail', root)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })); }
}
/** "Where to focus": the order is written in the box for the lord to read and send; nothing is done. */
function writeOrder(text) {
  const box = $('#order-input'); if (!box) return;
  box.value = box.value.trim() ? `${box.value.trim()} ${text}` : text; box.dispatchEvent(new Event('input')); box.focus();
  toast('Written in the order box. Read it, change it, and send it with the quill.');
}
/** The scope select is a change, not a click. */
export function wireLedger(root) {
  root.addEventListener('change', (e) => { const s = e.target.closest?.('[data-scope-select]'); if (!s) return; const q = ask(); q.scope = s.value; q.house = null; remember(); renderLedger(root); });
  root.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const row = e.target.closest?.('tr[data-row]'); if (row) row.click(); } });
}
