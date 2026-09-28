// Battle v2 (docs/gdd/07-military.md §7; WP C4): power by arms and ground, stances and standing orders, surprise, the
// outcome and its losses, the story's people slain, taken or wounded (and kept for their canon end), the report — and the
// three set-pieces of 298–299 fought with canon numbers: the Green Fork, the Whispering Wood, the Camps.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, applyChanges } from '../public/js/shared/world.js';
import { powerOf, reckon, chances, stanceOf, resolveBattle, keptByStory, fatesOf, WEIGHT } from '../public/js/engine/military/battle.js';
import { resolveWarfare } from '../public/js/shared/battles.js';
import { settle, ref } from '../public/js/engine/parties.js';
import { groundAt } from '../public/js/engine/movement.js';
import { makeRng, seedState } from '../public/js/engine/rng.js';

const world = (house = 'tully') => createInitialState('agot_298', house, { seed: 3 });
const host = (s, id, owner, pos, men, extra = {}) => {
  applyChanges(s, [{ op: 'army_create', id, owner, name: extra.name || `The host ${id}`, at: null, men }], { source: 'test' });
  const p = s.parties[id]; p.pos = [...pos]; p.at = null; delete p.units; Object.assign(p, extra);
  for (const m of [...(p.members || [])]) if (m !== p.commander) p.members = p.members.filter((x) => x !== m);
  if (p.commander) { const c = s.characters[p.commander]; c.loc = ref(id); p.members = [...new Set([...(p.members || []), c.id])]; }
  settle(s, p); return p;
};
const war = (s, a, d) => applyChanges(s, [{ op: 'war', status: 'start', name: 'W', attackers: a, defenders: d }], { source: 'test' });
const rng = (seed) => { const g = makeRng(seedState(seed)); return () => g.next(); };
const fresh = (s) => JSON.parse(JSON.stringify(s));

test('power by arms and ground: knights are worth four levies in the open, two in the woods; bowmen on a hill more', () => {
  const s = world();
  const k = host(s, 'k', 'tyrell', [560, 1440], 1000, { composition: 'Mounted knights and riders' });
  const open = powerOf(s, k, { ground: 'open' }).parts.men; const wood = powerOf(s, k, { ground: 'forest' }).parts.men;
  assert.ok(wood < open * 0.92, 'knights are worth less among the trees');
  const f = host(s, 'f', 'lannister', [560, 1440], 1000);
  const flat = powerOf(s, f, { role: 'defender', ground: 'open' }); const hill = powerOf(s, f, { role: 'defender', ground: 'hills' });
  assert.ok(hill.power > flat.power * 1.25, 'a defender on a hill, his bowmen above');
  assert.equal(powerOf(s, f, { role: 'attacker', ground: 'hills' }).parts.ground, 0.85, 'attacking uphill');
  const clans = host(s, 'c', 'arryn', [560, 1440], 1000, { composition: 'Clansmen of the Mountains of the Moon' });
  assert.ok(powerOf(s, clans, { ground: 'mountains' }).parts.men > 1000 * WEIGHT.clansman * 1.5, 'the clansmen in their mountains');
  assert.ok(powerOf(s, f, { surprise: true }).power > powerOf(s, f, {}).power * 1.2, 'surprise');
});

test('the chances: even odds are a coin or a bloody draw; twice the power is a certain victory', () => {
  const even = chances(1); assert.ok(Math.abs(even.win - even.lose) < 0.05 && even.draw > 0.3);
  assert.equal(chances(2).win, 1); assert.equal(chances(0.4).lose, 1);
  assert.ok(chances(1.2).win > chances(1.1).win);
});

test('stances: a lord attacks at good odds, holds at even, falls back at bad; standing orders speak for the player', () => {
  const s = world('stark'); war(s, ['lannister'], ['stark']);
  const a = host(s, 'a', 'lannister', [560, 1440], 5000, { commander: 'tywin_lannister' });
  const b = host(s, 'b', 'stark', [562, 1440], 5000);
  assert.equal(stanceOf(s, a, b, 1.5), 'attack'); assert.equal(stanceOf(s, a, b, 0.9), 'hold', 'Lord Tywin gives battle at even odds, not worse'); assert.equal(stanceOf(s, a, b, 0.5), 'withdraw');
  assert.equal(stanceOf(s, b, a, 1.25), 'attack', "the player's host engages when the odds favour it");
  b.standing = 'avoid'; assert.equal(stanceOf(s, b, a, 3), 'withdraw');
  b.standing = 'hold'; assert.equal(stanceOf(s, b, a, 3), 'hold');
  b.standing = 'always'; assert.equal(stanceOf(s, b, a, 0.3), 'attack');
  b.standing = 'avoid'; b.march = { to: ref('a') }; assert.equal(stanceOf(s, b, a, 0.3), 'attack', 'a host sent against this very host attacks');
});

test('neither will begin it: two hosts face each other, and the chronicle says so once', () => {
  const s = world('stark'); war(s, ['lannister'], ['stark']);
  host(s, 'a', 'lannister', [560, 1440], 5000); host(s, 'b', 'stark', [562, 1440], 5000);
  const r1 = resolveWarfare(s, 1, { r: rng(1) }); const r2 = resolveWarfare(s, 1, { r: rng(2) });
  assert.equal(s.parties.a.men, 5000); assert.equal(s.parties.b.men, 5000);
  assert.equal((s.facts || []).filter((f) => f.kind === 'stand_off').length, 1);
  assert.equal(r1.events.length + r2.events.length, 1);
});

test('the weaker falls back; caught, it fights on the march', () => {
  const s = world('stark'); war(s, ['lannister'], ['stark']);
  const a = host(s, 'a', 'lannister', [560, 1440], 15000, { standing: 'always' }); const b = host(s, 'b', 'stark', [562, 1440], 3000);
  let fled = 0, caught = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const t = fresh(s); resolveWarfare(t, 1, { r: rng(seed) });
    if (t.facts.some((f) => f.kind === 'withdrew')) { fled++; assert.ok(t.parties.b.march, 'it marches for safety'); } else { caught++; assert.equal(t.facts.find((f) => f.kind === 'battle')?.data.caught, true); }
  }
  assert.ok(fled > 0 && caught > 0, `some get away, some are caught (${fled}/${caught})`);
});

test('a battle: losses by the margin, the pursuit, the baggage, the loser falls back, the report says what decided it', () => {
  const s = world('stark'); war(s, ['lannister'], ['stark']);
  const a = host(s, 'a', 'lannister', [560, 1440], 20000, { standing: 'always', commander: 'tywin_lannister' }); const b = host(s, 'b', 'stark', [562, 1440], 8000);
  a.rations = 1000; b.rations = 100000;
  resolveWarfare(s, 1, { r: rng(5) });
  const f = s.facts.find((x) => x.kind === 'battle');
  assert.equal(f.data.winner, 'a'); assert.ok(['victory', 'crushing'].includes(f.data.outcome));
  assert.ok(f.data.decided.includes('numbers and arms'), f.data.decided.join());
  assert.ok(f.data.lost.b > 8000 * 0.15, 'the loser loses a sixth at least');
  assert.ok(f.data.lost.a < 20000 * 0.2);
  assert.ok(s.parties.a.rations > 1000, 'the victor took the baggage');
  if (s.parties.b) assert.ok(s.parties.b.march, 'the beaten host falls back');
  assert.ok(s.battles.length === 1 && s.landmarks.some((l) => l.kind === 'battle'));
});

test('the story keeps its people: Robert does not die in a battle before his boar; a sandbox keeps no one', () => {
  const s = world('stark');
  assert.equal(keptByStory(s, s.characters.robert_baratheon), 'canon');
  assert.equal(keptByStory(s, s.characters.sansa_stark), 'protected');
  assert.equal(keptByStory(s, s.characters.sansa_stark, { playerBattle: true }), null, "the player's own daughter, in the player's battle, is not");
  assert.equal(keptByStory(s, s.characters.theon_greyjoy), null);
  s.meta.settings = { ...(s.meta.settings || {}), canonGravity: 'loose' }; assert.equal(keptByStory(s, s.characters.robert_baratheon), 'canon', 'a pillar');
  assert.equal(keptByStory(s, s.characters.viserys_targaryen), null);
  s.meta.settings.canonGravity = 'sandbox'; assert.equal(keptByStory(s, s.characters.robert_baratheon), null);
  const t = world('tully'); war(t, ['lannister'], ['baratheon']);
  const k = host(t, 'k', 'baratheon', [560, 1440], 3000, { commander: 'robert_baratheon' });
  for (let seed = 1; seed <= 300; seed++) for (const f of fatesOf(t, k, 'lost', { broken: true, r: rng(seed) })) assert.notEqual(f.fate, 'slain');
});

test('the taken ride with the victor as his captives', () => {
  const s = world('stark'); war(s, ['lannister'], ['stark']);
  host(s, 'a', 'lannister', [560, 1440], 30000, { standing: 'always' }); host(s, 'b', 'stark', [562, 1440], 6000, { commander: 'theon_greyjoy' });
  for (let seed = 1; seed <= 60; seed++) {
    const t = fresh(s); resolveWarfare(t, 1, { r: rng(seed) });
    const th = t.characters.theon_greyjoy;
    if (/imprisoned/.test(th.status || '')) { assert.equal(th.loc, ref('a')); assert.ok(t.parties.a.members.includes('theon_greyjoy')); assert.ok(t.facts.some((f) => f.kind === 'captured_in_battle')); return; }
  }
  assert.fail('in sixty battles Theon was never taken');
});

// ── The set-pieces: canon-like outcomes with canon numbers in at least 70 % of seeds ──
const SEEDS = 100;
function setPiece(build, check) {
  let ok = 0;
  for (let seed = 1; seed <= SEEDS; seed++) { const s = build(); const { att, def, opts } = s.battle; const B = resolveBattle(s, s.parties[att], s.parties[def], { r: rng(seed), ...opts }); if (check(B, s)) ok++; }
  return ok / SEEDS;
}

test('the Green Fork: Roose Bolton\'s northmen attack Lord Tywin\'s host and are thrown back, but not destroyed', () => {
  const share = setPiece(() => {
    const s = world('tully'); war(s, ['lannister'], ['stark']);
    host(s, 'north', 'bolton', [556, 1420], 16000, { name: 'The northern foot', commander: 'roose_bolton', composition: 'Levies of the North' });
    host(s, 'west', 'lannister', [558, 1422], 20000, { name: "Lord Tywin's host", commander: 'tywin_lannister' });
    s.battle = { att: 'north', def: 'west', opts: {} }; return s;
  }, (B) => B.win.id === 'west' && !B.wiped);
  assert.ok(share >= 0.7, `the Lannisters hold the field and the northmen get away in ${Math.round(share * 100)}% of seeds`);
});

test('the Whispering Wood: Robb Stark\'s riders fall on the Kingslayer unawares among the trees, and take him', () => {
  const ww = [504, 1506];
  assert.equal(groundAt(ww), 'forest', 'the Whispering Wood is a wood');
  let taken = 0; let slain = 0;
  const share = setPiece(() => {
    const s = world('tully'); war(s, ['lannister'], ['stark', 'tully']);
    host(s, 'robb', 'stark', ww, 6000, { name: "Robb Stark's riders", commander: 'robb_stark', composition: 'Mounted riders of the North' });
    host(s, 'jaime', 'lannister', ww, 7000, { name: "The Kingslayer's host", commander: 'jaime_lannister' });
    s.battle = { att: 'robb', def: 'jaime', opts: { surprise: true } }; return s;
  }, (B) => {
    for (const f of B.fates) if (f.c.id === 'jaime_lannister') { if (f.fate === 'captured') taken++; if (f.fate === 'slain') slain++; }
    return B.win.id === 'robb';
  });
  assert.ok(share >= 0.7, `the Young Wolf wins in ${Math.round(share * 100)}% of seeds`);
  assert.equal(slain, 0, 'the Kingslayer is never slain');
  assert.ok(taken > 10, `and is sometimes taken (${taken})`);
});

test('the Camps: the Young Wolf falls on the Lannister siege camps before Riverrun by night, and breaks them', () => {
  const share = setPiece(() => {
    const s = world('tully'); war(s, ['lannister'], ['stark', 'tully']);
    host(s, 'wolf', 'stark', [500, 1522], 12000, { name: 'The Young Wolf\'s host', commander: 'robb_stark', composition: 'Levies of the North, with the riders of the Riverlands' });
    host(s, 'camp', 'lannister', [504, 1524], 12000, { name: 'The siege camps', commander: 'kevan_lannister', composition: 'Levies of the westerlands' });
    s.battle = { att: 'wolf', def: 'camp', opts: { surprise: true } }; return s;
  }, (B) => B.win.id === 'wolf');
  assert.ok(share >= 0.7, `the camps are broken in ${Math.round(share * 100)}% of seeds`);
});
