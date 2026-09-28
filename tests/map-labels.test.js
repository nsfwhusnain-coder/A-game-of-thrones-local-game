// The map's labels (docs/gdd/11-map-visuals.md §8; WP E4): one greedy pass, most important first; a label that cannot
// be placed is hidden, never overlapped (the old "KIN~2,400~50 SHIPS NG"); no more than 120 on screen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { placeLabels, overlaps, kindOf, PRIORITY, BUDGET } from '../public/js/map3d/labels.js';
import { createInitialState } from '../public/js/shared/world.js';

const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

test('the order of importance: your seat, the realms far out, the great seats, cities, hosts, castles', () => {
  const P = PRIORITY;
  assert.ok(P.own > P.realm && P.realm > P.great && P.great > P.city && P.city > P.army && P.army > P.castle && P.castle > P.feature);
  assert.equal(kindOf('holding t6'), 'great'); assert.equal(kindOf('holding t5'), 'city'); assert.equal(kindOf('holding t3'), 'castle');
  assert.equal(kindOf('holding t3', { own: true }), 'own'); assert.equal(kindOf('holding t3 dot'), 'dot');
  assert.equal(kindOf('army mine'), 'army'); assert.equal(kindOf('sea big'), 'sea'); assert.equal(kindOf('event pin imp2'), 'pin');
});

test('"KING\'S LANDING", a host of ~2,400 and a fleet of 50 on the same spot: never drawn over one another', () => {
  const items = [
    { id: 'kl', x: 600, y: 400, w: 120, h: 16, pri: PRIORITY.great },
    { id: 'host', x: 604, y: 402, w: 70, h: 18, pri: PRIORITY.army, move: true },
    { id: 'fleet', x: 598, y: 398, w: 80, h: 18, pri: PRIORITY.army, move: true },
    { id: 'rosby', x: 640, y: 404, w: 60, h: 14, pri: PRIORITY.castle },
  ];
  const shown = placeLabels(items);
  assert.equal(overlaps(items, shown), null);
  assert.ok(shown.has('kl'), 'the great seat keeps its name');
  assert.ok(shown.has('host') && shown.has('fleet'), 'the hosts step below and above the name rather than vanish');
  assert.notEqual(shown.get('host').y, 402);
  assert.ok(!shown.has('rosby'), 'the small castle beside them gives way');
});

test('a thousand random labels: no two shown overlap, the budget holds, and the important win', () => {
  const r = rng(298); const kinds = Object.keys(PRIORITY).filter((k) => k !== 'pin');
  const items = Array.from({ length: 1000 }, (_, i) => { const k = kinds[Math.floor(r() * kinds.length)]; return { id: `l${i}`, k, x: r() * 1920, y: r() * 1080, w: 30 + r() * 140, h: 12 + r() * 10, pri: PRIORITY[k], move: k === 'army' }; });
  items.push({ id: 'pin', x: 960, y: 540, w: 20, h: 20, pri: PRIORITY.pin, always: true });
  const shown = placeLabels(items);
  assert.equal(overlaps(items, shown), null);
  assert.ok(shown.size <= BUDGET + 1, `${shown.size} shown`);
  assert.ok(shown.has('pin'), 'news and waiting matters are always findable');
  // every hidden label was hidden by one at least as important
  const mean = (ids) => ids.reduce((a, id) => a + items.find((x) => x.id === id).pri, 0) / Math.max(1, ids.length);
  const hidden = items.filter((x) => !shown.has(x.id)).map((x) => x.id);
  assert.ok(mean([...shown.keys()]) > mean(hidden), 'the shown are on the whole the more important');
});

test('the whole realm\'s holding names at L0 spacing: none overlaps once placed', () => {
  const s = createInitialState('agot_298', 'stark');
  // a crude projection of the map at L0 onto 1366×768: a map unit ≈ 0.3 px
  const items = Object.values(s.holdings).map((hd) => ({ id: hd.id, x: (hd.pos[0] - 300) * 0.3 + 400, y: (hd.pos[1] - 300) * 0.3, w: hd.name.length * 7 + 8, h: 16, pri: hd.id === 'stark' ? PRIORITY.own : s.houses[hd.owner]?.rank === 'paramount' && hd.seatOf === hd.owner ? PRIORITY.great : PRIORITY.castle }));
  const shown = placeLabels(items);
  assert.equal(overlaps(items, shown), null);
  assert.ok(shown.has('stark'), 'your own seat is always named');
  assert.ok(shown.size >= 20, `${shown.size} names fit`);
});
