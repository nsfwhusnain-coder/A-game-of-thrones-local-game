// The sea is no road (docs/gdd/07-military.md §5, §9; bug B-11): the owner watched House Crowl march from Skagos to
// Winterfell over the Bay of Seals, paying "the price of the Wall" on the way. Island houses take ship or wait for one;
// natives pass their own country free. Scenario tests `islands-need-ships` and `natives-pass-free` (15-qa-tooling §2).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.WC_PROVIDER = 'mock';
process.env.WC_SAVES = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-sea-'));
const game = await import('../server/game.js');
const geo = await import('../public/js/engine/geo.js');
const { needsShips, transportFor, planVoyage } = await import('../public/js/shared/sea.js');
const { createInitialState } = await import('../public/js/shared/world.js');
const { chokepointToll } = await import('../public/js/shared/chokepoints.js');

test.after(() => fs.rmSync(process.env.WC_SAVES, { recursive: true, force: true }));
const fresh = (house = 'stark') => createInitialState('agot_298', house);

test('every island is its own landmass; the mainland is one', () => {
  const s = fresh(); const m = (id) => geo.landmassOf(s.holdings[id].pos);
  const mainland = m('stark');
  for (const id of ['moat_cailin', 'baratheon', 'lannister', 'tyrell', 'martell', 'arryn', 'nights_watch', 'manderly', 'tully']) assert.equal(m(id), mainland, id);
  const islands = ['crowl', 'mormont', 'greyjoy', 'harlaw', 'goodbrother', 'drumm', 'blacktyde', 'saltcliffe', 'orkwood', 'tarth', 'estermont', 'baratheon_ds', 'velaryon', 'celtigar', 'sunderland', 'farman', 'redwyne', 'hewett', 'serry', 'grimm'];
  for (const id of islands) assert.notEqual(m(id), mainland, `${id} is off the mainland`);
  assert.equal(new Set(['crowl', 'mormont', 'greyjoy', 'tarth', 'baratheon_ds', 'redwyne'].map(m)).size, 6, 'different islands are different landmasses');
  assert.equal(geo.landmassName(m('crowl')), 'Skagos');
  assert.equal(geo.landmassName(m('mormont')), 'Bear Island');
  assert.ok(needsShips(s.holdings.crowl.pos, s.holdings.stark.pos) && !needsShips(s.holdings.karstark.pos, s.holdings.stark.pos));
});

test('a sea lane stays on the water, and a landing is chosen to reach the goal soonest', () => {
  const s = fresh();
  const L = geo.bestLanding(s.holdings.crowl.pos, s.holdings.stark.pos);
  assert.ok(L && L.seaMiles > 0 && L.path.length >= 2);
  assert.ok(!needsShips(L.at, s.holdings.stark.pos), 'the landing is on the mainland');
  // every point of every leg, away from the shores it leaves and reaches, is open sea
  for (let i = 1; i < L.path.length; i++) {
    const [a, b] = [L.path[i - 1], L.path[i]]; const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let t = 0.05; t < 1; t += 0.05) {
      const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      const nearEnd = Math.hypot(p[0] - L.path[0][0], p[1] - L.path[0][1]) < 8 || Math.hypot(p[0] - L.at[0], p[1] - L.at[1]) < 8;
      if (!nearEnd && d > 0) assert.ok(geo.isSeaCell(geo.cellOf(p)), `leg ${i} crosses land at ${p.map(Math.round)}`);
    }
  }
  // Bear Island's men land on the west coast, not across the North
  const B = geo.bestLanding(s.holdings.mormont.pos, s.holdings.stark.pos);
  assert.ok(B.at[0] < s.holdings.stark.pos[0], 'the Mormonts land west of Winterfell');
});

test('who carries them: own ships, a few boats making trips, the realm\'s ships — or none', () => {
  const s = fresh();
  const own = transportFor(s, 'goodbrother', 1500, s.holdings.goodbrother.pos);
  assert.equal(own.kind, 'own', 'an ironborn lord sails his own longships');
  const crowl = transportFor(s, 'crowl', 600, s.holdings.crowl.pos);
  assert.equal(crowl.kind, 'realm'); assert.equal(crowl.by, 'manderly', 'White Harbor\'s ships come for Skagos');
  assert.ok(crowl.wait > 7, 'and they take time to come');
  const bear = transportFor(s, 'mormont', 900, s.holdings.mormont.pos, 5);
  assert.equal(bear.kind, 'ferry', 'Bear Island ferries its men over in its own boats');
  assert.equal(transportFor(s, 'dothraki', 40000, s.holdings.dothraki.pos).kind, 'none', 'the khalasar has no ships');
  // a host planned with no ships at all is stranded, and says so
  const a = { id: 'x', owner: 'dothraki', men: 40000, pos: [...s.holdings.pentos.pos], kind: 'host' };
  const v = planVoyage(s, a, s.holdings.baratheon.pos, 'baratheon', 0);
  assert.equal(v.phase, 'stranded');
});

test('islands-need-ships: Crowl and Mormont answer the call — they wait, sail and land; they never walk the sea or pay the Wall', async () => {
  const { id } = game.newGame('agot_298', 'stark');
  const file = path.join(game.SAVES, id, 'state.json');
  const s0 = JSON.parse(fs.readFileSync(file, 'utf8'));
  const home = {};
  for (const [h, men] of [['crowl', 600], ['mormont', 900]]) {
    const seat = s0.holdings[h];
    s0.parties[`host_of_house_${h}`] = { id: `host_of_house_${h}`, owner: h, serving: 'stark', name: `Host of House ${s0.houses[h].name}`, commander: s0.houses[h].lord, at: h, pos: [...seat.pos], men, kind: 'host', members: [], composition: `Levies of House ${s0.houses[h].name}`, morale: 70, supply: 80, march: { to: 'stark', since: 0 } };
    home[h] = geo.landmassOf(seat.pos);
  }
  fs.writeFileSync(file, JSON.stringify(s0));
  const mainland = geo.landmassOf(s0.holdings.stark.pos);
  const seen = { crowl: new Set(), mormont: new Set() }; const landed = {};
  for (let t = 0; t < 16; t++) {
    const { turn } = await game.advance(id, { span: '7d' });
    const s = game.loadState(id);
    for (const h of ['crowl', 'mormont']) {
      const a = s.parties[`host_of_house_${h}`]; if (!a) continue; // joined the host, or arrived and stood down
      const where = geo.landmassOf(a.pos, 3);
      if (turn.events.some((e) => new RegExp(`${s.houses[h].name}'s men land`).test(e.title))) landed[h] = true;
      assert.ok(where === home[h] || where === -1 || (where === mainland && landed[h]), `${a.name} stands on ${geo.landmassName(where)} at turn ${t} without having landed`);
      if (a.sea) seen[h].add(a.sea.phase);
      if (a.status === 'at sea') seen[h].add('at sea');
    }
    // no toll of the Wall for men who came by sea (the old straight line from Skagos crossed it)
    assert.ok(!turn.applied.some((x) => /(Crowl|Mormont).*(Wall)/.test(x.text || '')), 'no island host at the Wall');
    if (landed.crowl && landed.mormont && Object.values(s.parties).every((a) => !['crowl', 'mormont'].includes(a.owner) || a.at === 'stark')) break;
  }
  assert.ok(seen.crowl.has('waiting'), 'Crowl waited for ships');
  assert.ok(landed.crowl && landed.mormont, 'both came ashore on the mainland');
  const s = game.loadState(id);
  for (const h of ['crowl', 'mormont']) {
    const a = s.parties[`host_of_house_${h}`];
    if (a) assert.equal(geo.landmassOf(a.pos, 3), mainland, `${a.name} is on the mainland now`);
  }
});

test('natives-pass-free: crannogmen cross the Neck and northmen the North without toll', () => {
  const s = fresh();
  const reed = { id: 'r', owner: 'reed', name: 'Host of House Reed', men: 700, morale: 70, kind: 'host' };
  const t = chokepointToll(s, reed, s.holdings.reed.pos, s.holdings.tully.pos, 40);
  const neck = t.met.find((m) => m.id === 'the_neck');
  assert.ok(!neck || (!neck.lost && !neck.days), 'no loss and no delay in their own bogs');
  const umber = { id: 'u', owner: 'umber', name: 'Host of House Umber', men: 3800, morale: 70, kind: 'host' };
  const w = chokepointToll(s, umber, s.holdings.umber.pos, s.holdings.stark.pos, 40);
  assert.ok(!w.met.some((m) => m.id === 'the_wall'), 'a northern lord pays nothing to the Wall');
});
