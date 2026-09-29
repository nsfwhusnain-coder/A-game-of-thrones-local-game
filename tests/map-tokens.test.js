// Party tokens and plates (docs/gdd/11-map-visuals.md §6.1; WP E5): each kind of party has its token and plate, a host
// known only by report says so and how old the word is, garrisons are not tokens, the King's progress is seen from
// the farthest zoom, and plates on one spot merge into a stack ("3 hosts · 7,400").
import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenOf, stackText, clusterPlates } from '../public/js/map3d/tokens.js';
import { kindOf, PRIORITY } from '../public/js/map3d/labels.js';
import { createInitialState } from '../public/js/shared/world.js';

const s = createInitialState('agot_298', 'stark');
const seen = (a) => ({ pos: a.pos, men: a.men, known: 'seen', age: 0, source: 'seen', owner: a.owner });
const party = (o) => ({ id: 'x', owner: 'bolton', kind: 'host', name: 'The Dreadfort host', pos: [600, 900], men: 3000, commander: 'roose_bolton', ...o });

test('a host: its count far out, and who leads it from L1 in; your own count is exact, others\' are "~"', () => {
  const a = party();
  assert.equal(tokenOf(s, a, seen(a), 0).plate, '~3,000');
  assert.equal(tokenOf(s, a, seen(a), 1).plate, '~3,000 · Roose Bolton');
  const mine = party({ owner: 'stark', commander: 'robb_stark', men: 4200 });
  assert.equal(tokenOf(s, mine, seen(mine), 2).plate, '4,200 · Robb Stark');
  assert.ok(tokenOf(s, party({ men: 20000 }), seen(party({ men: 20000 }))).scale > tokenOf(s, party({ men: 300 }), seen(party({ men: 300 }))).scale, 'size grows with the log of the men');
});

test('a host known only by report: grey, "?", and how old the word is; one the player has no word of is not shown', () => {
  const a = party();
  const t = tokenOf(s, a, { pos: a.pos, men: 6000, known: 'reported', age: 1, source: 'a trader' }, 2);
  assert.ok(t.reported && t.cls === 'reported');
  assert.equal(t.plate, '~6,000? · 7 days old');
  assert.match(t.hover, /Unconfirmed.*a trader/);
  assert.equal(tokenOf(s, a, { pos: a.pos, men: 6000, known: 'reported', age: 0, source: 'a raven' }, 2).plate, '~6,000?', 'this week\'s word carries no age');
  assert.equal(tokenOf(s, a, undefined, 2), null);
});

test('fleets, outlaws, garrisons, retinues and the King\'s progress', () => {
  const f = party({ kind: 'fleet', ships: 24, owner: 'manderly' });
  assert.equal(tokenOf(s, f, seen(f)).plate, '~24 ships');
  const b = party({ kind: 'band' }); assert.equal(tokenOf(s, b, seen(b)).plate, 'outlaws');
  assert.equal(tokenOf(s, party({ kind: 'garrison' }), seen(party())), null, 'a garrison is a count on its castle, not a token');
  const r = party({ kind: 'retinue', owner: 'hornwood', commander: 'donella_hornwood', men: 30, public: true, march: { to: 'stark' } });
  const rt = tokenOf(s, r, undefined);
  assert.equal(rt.plate, '', 'a retinue is a pennant, named on hover');
  assert.match(rt.hover, /Hornwood → Winterfell/);
  const kp = party({ kind: 'progress', owner: 'baratheon', commander: 'robert_baratheon', men: 380, public: true, march: { to: 'stark' } });
  const kt = tokenOf(s, kp, undefined, 0);
  assert.equal(kt.plate, 'The King\'s progress'); assert.ok(kt.always && kt.scale > 1);
  // and it outranks the great seats' names, so it is seen from L0
  assert.equal(kindOf(`army ${kt.cls}`), 'progress');
  assert.ok(PRIORITY.progress > PRIORITY.great);
});

test('plates on one spot merge into a stack; plates apart stay apart', () => {
  const T = (men, kind = 'host') => ({ kind, men, ships: kind === 'fleet' ? 20 : 0 });
  const items = [
    { id: 'a', x: 100, y: 100, token: T(2800) }, { id: 'b', x: 104, y: 98, token: T(3100) }, { id: 'c', x: 99, y: 106, token: T(1500) },
    { id: 'd', x: 400, y: 100, token: T(4000) },
  ];
  const st = clusterPlates(items);
  assert.equal(st.length, 1);
  assert.deepEqual(new Set(st[0].ids), new Set(['a', 'b', 'c']));
  assert.equal(st[0].text, '3 hosts · 7,400');
  assert.equal(st[0].x, 104, 'the largest host anchors the stack');
  assert.equal(stackText([T(4000), T(0, 'fleet')]), 'a host and a fleet · 4,000');
  assert.equal(stackText([T(0, 'fleet'), T(0, 'fleet')]), '2 fleets · 40 ships');
  assert.deepEqual(clusterPlates([{ id: 'a', x: 0, y: 0, token: T(1) }]), []);
});
