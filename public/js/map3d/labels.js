// Label placement (docs/gdd/11-map-visuals.md §8; WP E4): one greedy pass a frame over the labels on screen, most
// important first; a label that cannot be placed clear of the others is hidden, never overlapped (the old
// "KIN~2,400~50 SHIPS NG"). A host's plate may step below or above its spot before it gives up; nothing else moves.
// No three.js and no DOM here: boxes in, boxes out, so the rule can be tested without a canvas.

/** Priority by kind (higher first): the player's seat, the realms' names (shown only far out, where they are the map), the
 *  great seats, cities, hosts' plates, castles, then the small things. */
export const PRIORITY = { pin: 200, own: 120, progress: 110, realm: 105, great: 100, city: 80, army: 70, sea: 60, rider: 55, castle: 50, landmark: 40, feature: 30, place: 20, dot: 10 };
export const BUDGET = 120;
const PAD = 2;

/** A label's kind from its class list and tier (MapScene's `cls`): see PRIORITY. */
export function kindOf(cls, { own = false } = {}) {
  if (cls.startsWith('event') || cls.startsWith('pulse')) return 'pin';
  if (cls.startsWith('holding')) {
    if (own) return 'own';
    if (/\bdot\b/.test(cls)) return 'dot';
    const tier = Number(cls.match(/t(\d)/)?.[1] || 3);
    return tier >= 6 ? 'great' : tier >= 5 ? 'city' : 'castle';
  }
  if (cls.startsWith('army') && /\bprogress\b/.test(cls)) return 'progress'; // the King's progress: seen from the farthest zoom
  if (cls.startsWith('stack')) return 'army';
  if (cls.startsWith('eta')) return 'army';
  for (const k of ['realm', 'army', 'sea', 'rider', 'landmark', 'feature', 'place']) if (cls.startsWith(k)) return k;
  return 'feature';
}

const hits = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
const boxAt = (x, y, w, h) => ({ x0: x - w / 2 - PAD, x1: x + w / 2 + PAD, y0: y - h / 2 - PAD, y1: y + h / 2 + PAD });

/**
 * Place labels. `items`: { id, x, y, w, h, pri, move?, always? } (x, y the centre on screen; `move`: may step up or down
 * a line; `always`: shown whatever — pins, which are small and must stay findable — but still reserve their room).
 * Returns Map id → { x, y } for the labels to show; any label not in it is hidden. At most `budget` are shown.
 */
export function placeLabels(items, budget = BUDGET) {
  const order = items.map((it, i) => [it, i]).sort((a, b) => (b[0].always - a[0].always) || (b[0].pri - a[0].pri) || (a[1] - b[1]));
  const placed = [], out = new Map();
  for (const [it] of order) {
    if (out.size >= budget && !it.always) break;
    const tries = it.move ? [0, 1, -1, 2] : [0];
    for (const k of tries) {
      const y = it.y + k * (it.h + 3);
      const b = boxAt(it.x, y, it.w, it.h);
      if (!it.always && placed.some((p) => hits(p, b))) continue;
      placed.push(b); out.set(it.id, { x: it.x, y }); break;
    }
  }
  return out;
}

/** Whether any two shown boxes overlap (the test's assertion, and a dev-page check). */
export function overlaps(items, shown) {
  const boxes = items.filter((it) => shown.has(it.id) && !it.always).map((it) => { const p = shown.get(it.id); return { id: it.id, ...boxAt(p.x, p.y, it.w, it.h) }; });
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    // the padding is each box's own margin: overlapping margins are not overlapping labels
    if (a.x0 + PAD < b.x1 - PAD && a.x1 - PAD > b.x0 + PAD && a.y0 + PAD < b.y1 - PAD && a.y1 - PAD > b.y0 + PAD) return [a.id, b.id];
  }
  return null;
}
