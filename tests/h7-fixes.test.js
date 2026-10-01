// What playing the game in a browser found (WP H7): the tip that covered the menu, a ring thrown in from the corner of the screen, carts walking straight over the mountains, a King holding a tourney
// at King's Landing from the road. The first three are in the page and are held by what the page's source says (no browser here); the last is the engine's, held by playing it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.WC_PROVIDER = 'mock';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const F = await import('../public/js/ui/firstrun.js');
const { createInitialState, applyChanges } = await import('../public/js/shared/world.js');
const { perform } = await import('../public/js/engine/actions/registry.js');
const { awayFromSeat, crownWaitsForHand } = await import('../public/js/engine/actions/court.js');
const { withRng } = await import('../public/js/engine/rng.js');

test('the tip about the menu is under the bar and clear of the menu that opens beneath the button: it covers neither the menu\'s doors nor End turn', () => {
  const mark = F.COACH.find((c) => c.id === 'realm'); assert.equal(mark.side, 'below-left'); assert.ok(mark.clear >= 9, 'the room of the menu, in rem');
  for (const [W, H, rem] of [[1920, 1080, 21], [1366, 768, 15], [1024, 768, 13]]) {
    const button = { x0: W - 8 - 2.25 * rem, y0: 0.6 * rem, x1: W - 0.6 * rem, y1: 0.6 * rem + 2.25 * rem };
    const menu = { x0: button.x1 - 9.7 * rem, y0: button.y1, x1: button.x1, y1: button.y1 + 12 * rem };
    const size = { w: 17 * rem, h: 4.4 * rem };
    const p = F.placeCoach(button, size, { w: W, h: H }, mark.side, 14, 8, mark.clear * rem);
    const slip = { x0: p.left, y0: p.top, x1: p.left + size.w, y1: p.top + size.h };
    const hit = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
    assert.ok(!hit(slip, button), `${W}: not on the button`); assert.ok(!hit(slip, menu), `${W}: not on the menu's doors`);
    assert.ok(slip.y0 >= button.y1, `${W}: under the bar, so not on End turn either`); assert.equal(p.arrow, null);
    assert.ok(p.left >= 8 && p.left + size.w <= W - 8, `${W}: on the screen`);
  }
  const src = read('public/js/ui/welcome.js'); assert.match(src, /pointer-events:none/, 'a note, never a lid');
  assert.match(read('public/js/ui/chrome.js'), /if \(name === 'menu'\) app\.coachDone\?\.\('realm'\)/, 'opening the menu puts the tip away');
});

test('the ring that grows where the news is does not own the label\'s transform (the map writes the label\'s screen place into it each frame): it scales with the independent property', () => {
  const css = read('public/css/style.css');
  const k = /@keyframes pulse \{([^}]*\{[^}]*\}[^}]*\{[^}]*\})\s*\}/.exec(css)?.[1] || /@keyframes pulse \{(.*)\}/.exec(css)?.[1];
  assert.ok(k, 'the pulse keyframes are there'); assert.ok(!/transform/.test(k), `no transform in the pulse: ${k}`); assert.match(k, /scale:/);
  assert.match(css, /\.lbl\.pulse \{[^}]*pointer-events: none/, 'a ring is not a thing to click');
});

test('the carts and the refugees walk only the roads that were found: no straight line over the mountains or the sea is made, kept or reused', async () => {
  const src = read('public/js/map3d/life.js');
  assert.ok(!src.includes("budget.n <= 0 ? [[...from], [...to]]"), 'the straight-line fallback is gone');
  assert.ok(src.includes("if (kind !== 'raven' && budget.n <= 0) { if (old && old.kind === kind) next.push(old); return; }"), 'a walker whose road is not found yet waits');
  assert.ok(src.includes("grid.find(from, to, 'land', { strict: true })"), 'a raven flies straight, the rest follow the ground — and only the ground');
  // the grid itself: two islands have no road between them; strict says so, the old way (a march that must be drawn) still gives the line
  const { PathGrid } = await import('../public/js/map3d/pathfind.js');
  const W = 200, H = 100; const land = new Uint8Array(W * H); const height = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) land[y * W + x] = (x < 80 || x >= 120) ? 1 : 0; // two shores, a sea between
  const g = new PathGrid({ W, H, scale: 1, land, height }, 5);
  const a = [20, 50], b = [180, 50], c = [60, 30];
  assert.equal(g.find(a, b, 'land', { strict: true }), null, 'no road across the sea');
  assert.deepEqual(g.find(a, b, 'land'), [a, b], 'an army that must go is still drawn a line');
  const ok = g.find(a, c, 'land', { strict: true }); assert.ok(Array.isArray(ok) && ok.length >= 2, 'a road on one shore is found');
});

test('a feast or a tourney is held in a hall: with the lord on the road, or at another castle, it is refused (the King held a tourney at King\'s Landing from the Neck)', () => {
  const s = createInitialState('agot_298', 'stark', { seed: 7 });
  assert.equal(awayFromSeat(s, 'tully'), null, 'a lord at home may');
  const lord = s.characters[s.houses.tully.lord];
  withRng(s, () => applyChanges(s, [{ op: 'character', id: lord.id, loc: 'stark' }], { source: 'a test' })); // at Winterfell, a guest
  assert.equal(awayFromSeat(s, 'tully').code, 'away'); assert.match(awayFromSeat(s, 'tully').text, /not at Riverrun/);
  const t = withRng(s, () => perform(s, 'hold_tourney', { house: 'tully', source: { type: 'intent', ref: 'hoster_tully', by: 'mock' } }));
  assert.equal(t.ok, false, JSON.stringify(t.refusal)); const f = withRng(s, () => perform(s, 'hold_feast', { house: 'tully', source: { type: 'intent', ref: 'hoster_tully', by: 'mock' } })); assert.equal(f.ok, false);
  // on the road with a party: not at the seat either
  const s2 = createInitialState('agot_298', 'stark', { seed: 7 }); const rb = s2.characters.robert_baratheon;
  s2.parties.royal_ride = { id: 'royal_ride', kind: 'host', owner: 'baratheon', name: 'The King\'s ride', commander: 'robert_baratheon', at: null, pos: [500, 600], men: 100, members: ['robert_baratheon'], march: { to: 'stark', since: 0 } }; rb.loc = 'party:royal_ride';
  assert.equal(awayFromSeat(s2, 'baratheon').code, 'away', 'on the road');
  // a regent holds it for a prisoner lord; he must be at the seat
  const s3 = createInitialState('agot_298', 'stark', { seed: 7 }); s3.characters[s3.houses.tully.lord].status = 'imprisoned'; s3.houses.tully.regent = 'edmure_tully'; s3.characters.edmure_tully.loc = 'tully';
  assert.equal(awayFromSeat(s3, 'tully'), null, 'the regent at Riverrun holds it for the prisoner'); s3.characters.edmure_tully.loc = 'stark'; assert.equal(awayFromSeat(s3, 'tully').code, 'away');
});

test('the Crown\'s own tourney waits for the Hand\'s (canon beat): not before it under Canon or Loose, not held back under Sandbox, never held back for the player, free after the 12th moon of 298', () => {
  const s = createInitialState('agot_298', 'stark', { seed: 7 });
  assert.equal(crownWaitsForHand(s, 'baratheon').code, 'canon'); assert.equal(crownWaitsForHand(s, 'lannister'), null, 'only the Crown');
  assert.equal(perform(s, 'hold_tourney', { house: 'baratheon', source: { type: 'intent', ref: 'robert_baratheon', by: 'mock' } }).ok, false);
  // nor a feast at King's Landing in those weeks (the day-one mind is asked before the progress is on the road: "feasts 33 lords at King's Landing" beside "passes the Twins")
  const fe = perform(s, 'hold_feast', { house: 'baratheon', source: { type: 'intent', ref: 'robert_baratheon', by: 'mock' } }); assert.equal(fe.ok, false); assert.match(JSON.stringify(fe.refusal), /no feast at King's Landing/);
  assert.equal(crownWaitsForHand(s, 'lannister', 'feast'), null, 'only the Crown');
  s.meta.settings = { ...(s.meta.settings || {}), canonGravity: 'sandbox' }; assert.equal(crownWaitsForHand(s, 'baratheon'), null, 'sandbox');
  s.meta.settings.canonGravity = 'canon'; s.plots = { ...(s.plots || {}), log: [{ thread: 'hands_tourney', stage: 'tourney' }] }; assert.equal(crownWaitsForHand(s, 'baratheon'), null, 'the Hand\'s tourney has been held');
  s.plots.log = []; s.meta.date = { ...s.meta.date, month: 12 }; assert.equal(crownWaitsForHand(s, 'baratheon'), null, 'after the 12th moon');
  const mine = createInitialState('agot_298', 'baratheon', { seed: 7 }); assert.equal(crownWaitsForHand(mine, 'baratheon'), null, 'the player is never held back');
});
