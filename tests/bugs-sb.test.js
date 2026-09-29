// The bug sweep SB (docs/gdd/02-audit.md, bugs B-33…B-38): what a player's-eye playtest found, each pinned by a test
// written before the fix — a hint at a hidden culprit told to every house, an order refused in one half and carried out
// in the other, the wrong host bound to a name, a playtest script that needed a config file, crossings that say "1 men",
// a dead lord's heir who is his clone, and a muster card told every day. Whole rules on the mock; no model.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

process.env.WC_SAVES = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-bugs-sb-'));
process.env.WC_PROVIDER = 'mock';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { createInitialState, applyChanges, resolveSuccessions, addDays } = await import('../public/js/shared/world.js');
const { withRng } = await import('../public/js/engine/rng.js');
const { dayNumber } = await import('../public/js/engine/time.js');
const { parseOrder } = await import('../server/orders/parse.js');
const { carryOut, advanceMusters } = await import('../server/orders.js');
const { withDice } = await import('../server/dice.js');
const { check, intentFor } = await import('../public/js/engine/actions/registry.js');
const { raiseLevies } = await import('../public/js/engine/actions/military.js');
const { KINDS } = await import('../public/js/engine/facts/kinds.js');
const { emit } = await import('../public/js/engine/facts/log.js');
const K = await import('../public/js/engine/knowledge.js');
const { answer } = await import('../public/js/engine/military/muster.js');

test.after(() => fs.rmSync(process.env.WC_SAVES, { recursive: true, force: true }));
const world = (house = 'stark', setup = []) => { const s = createInitialState('agot_298', house, { seed: 298 }); withRng(s, () => applyChanges(s, setup)); return s; };
// an order tried on the world as the turn tries it: the parse, then the verbs, on the dice of a copy
const tryOrder = (s, text, house = s.meta.player) => { const p = parseOrder(s, text, { house }); const r = withDice(s, () => withRng(s, () => carryOut(s, { id: 'o1', text }, p))); return { p, ...r }; };

// ── B-33 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
test('B-33: the fall of Bran tells what any house could see — no card and no note points at a culprit', async () => {
  const { THREADS } = await import('../public/data/beats.js');
  const stage = THREADS.flatMap((t) => t.stages).find((x) => x.id === 'the_fall');
  assert.ok(stage, 'the beat exists');
  for (const house of ['stark', 'lannister', 'martell']) {
    const out = stage.fire(world(house));
    const told = JSON.stringify(out);
    assert.doesNotMatch(told, /very kind/, `${house}: "The Lannisters are very kind" is a hint at the hidden hand, told to every house`);
    assert.doesNotMatch(told, /pushed/, `${house}: the note must not say he was pushed`);
    assert.match(told, /Bran Stark, who climbed every wall of Winterfell and never fell, is found broken at the foot of the old tower\. He lives, but sleeps and does not wake\./);
    assert.match(told, /Found broken at the foot of the old tower; remembers nothing of the fall\./);
  }
});

// ── B-34 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
const NORTHERN_HOST = 'assemble the men of the north at winterfell and create a great northern host of all able body men and boys';

test('B-34: a Lannister may not muster the North at Winterfell — the whole order is refused, no half of it is done', () => {
  const s = world('lannister');
  const { lines } = tryOrder(s, NORTHERN_HOST);
  assert.ok(lines.length >= 1 && lines.every((l) => l.ok === false), `every line is a refusal: ${lines.map((l) => l.ok + ' ' + l.text).join(' | ')}`);
  assert.ok(lines.some((l) => /Winterfell is not your land/.test(l.text)), 'the refusal names the place');
  assert.deepEqual(Object.values(s.houses).filter((h) => h.liege === 'lannister' && h.obligations?.levies === 'called').map((h) => h.id), [], 'no sworn house was called');
  assert.ok(!(s.facts || []).some((f) => f.kind === 'levies_called'), 'no banners were called, so no such fact');
  assert.ok(!Object.values(s.parties).some((a) => a.owner === 'lannister' && a.march), 'no host sets out for Winterfell');
  // the verb itself says why
  const c = check(s, intentFor(s, 'call_banners', { house: 'lannister', params: { vassals: 'all', at: 'stark' } }));
  assert.equal(c?.code, 'not_yours'); assert.match(c.text, /Winterfell is not your land: the banners cannot muster there\./);
});

test('B-34: the same order is still lawful for a Stark, and a house may muster on its own, its vassals\' and an ally\'s land', () => {
  const s = world('stark');
  const { lines } = tryOrder(s, NORTHERN_HOST);
  assert.ok(lines.length >= 3 && lines.every((l) => l.ok === true), lines.map((l) => l.ok + ' ' + l.text).join(' | '));
  assert.ok(Object.values(s.houses).filter((h) => h.liege === 'stark' && h.obligations?.levies === 'called').length >= 10, 'the North is called');
  assert.ok(Object.values(s.parties).some((a) => a.owner === 'stark' && /Northern Host/.test(a.name)), 'and the host is raised');
  const l = world('lannister');
  const at = (place) => check(l, intentFor(l, 'call_banners', { house: 'lannister', params: { vassals: 'all', at: place } }));
  assert.equal(at('lannister'), null, 'Casterly Rock is his own');
  assert.equal(at(l.houses.marbrand.seat), null, 'a sworn lord\'s seat is his liege\'s to muster at');
  assert.equal(at('tyrell')?.code, 'not_yours', 'Highgarden is not, until…');
  l.pacts.push({ id: 'p_sb', type: 'alliance', a: 'lannister', b: 'tyrell', terms: '', status: 'active', since: '298-01-01' });
  assert.equal(at('tyrell'), null, '…the Tyrells are allied');
});

// ── B-35 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
// a Lannister with two hosts, the bigger a Crakehall host serving him: the one the old rule would have grabbed
const lion = () => {
  const s = world('lannister', [
    { op: 'army_create', id: 'host_of_the_rock', owner: 'lannister', name: 'The Host of the Rock', at: 'lannister', men: 6000, commander: 'kevan_lannister' },
    { op: 'army_create', id: 'crakehall_host', owner: 'crakehall', name: 'Host of House Crakehall', at: 'crakehall', men: 9000 },
  ]);
  s.parties.crakehall_host.serving = 'lannister';
  return s;
};

test('B-35: "Robb is to march the Northern Host to Moat Cailin" as a Lannister binds no host of his — it is a refused order about Robb', () => {
  const s = lion();
  const { p, lines } = tryOrder(s, 'Robb is to march the Northern Host to Moat Cailin.');
  assert.ok(!p.actions.some((a) => a.verb === 'march_host' && a.params.army), `no host was bound: ${JSON.stringify(p.actions)}`);
  assert.deepEqual(p.actions.map((a) => [a.verb, a.params.character, a.params.men]), [['send_person', 'robb_stark', 0]]);
  assert.ok(lines.every((l) => l.ok === false) && /No one of yours by that name/.test(lines[0].text), lines.map((l) => l.text).join(' | '));
  assert.ok(!Object.values(s.parties).some((a) => a.march), 'nobody marches');
});

test('B-35: an unmatched "the Northern Host" with no one named is "no host", and the reading says it is unsure; unnamed and own hosts still bind', () => {
  const s = lion();
  const unnamed = parseOrder(s, 'March the Northern Host to Moat Cailin.', { house: 'lannister' });
  assert.deepEqual(unnamed.actions.map((a) => [a.verb, a.params.army ?? null, a.params.to]), [['march_host', null, 'moat_cailin']]);
  assert.equal(unnamed.complete, false, 'a live model may look at it');
  const { lines } = tryOrder(s, 'March the Northern Host to Moat Cailin.');
  assert.match(lines[0].text, /no host in the field/i);
  // what must not change: the lord's host by the lord's words
  for (const text of ['Take the host to Moat Cailin.', 'March them to Moat Cailin.', 'March to Moat Cailin.']) {
    const r = parseOrder(s, text, { house: 'lannister' });
    assert.deepEqual(r.actions.map((a) => [a.verb, a.params.army, a.params.to]), [['march_host', 'crakehall_host', 'moat_cailin']], text);
  }
  assert.equal(parseOrder(s, 'Take the host to Moat Cailin.', { house: 'lannister' }).complete, true, '"the host" is the lord\'s own host: sure');
  // his own commander's name still finds his own host
  const own = parseOrder(s, 'Kevan, march on the Twins.', { house: 'lannister' });
  assert.deepEqual(own.actions.map((a) => [a.verb, a.params.army, a.params.to]), [['march_host', 'host_of_the_rock', 'frey']]);
});

// ── B-36 + B-38 ──────────────────────────────────────────────────────────────────────────────────────────────────────
test('B-36/B-38: the playtest script plays two turns with no config.json, names the provider, and says when an audience became a raven', () => {
  // a copy of the script's world with no config.json in it: what a fresh checkout (or the CI box) is
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-playtest-root-'));
  try {
    fs.mkdirSync(path.join(root, 'scripts'));
    fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(root, 'package.json'));
    fs.copyFileSync(path.join(ROOT, 'scripts', 'playtest.js'), path.join(root, 'scripts', 'playtest.js'));
    fs.cpSync(path.join(ROOT, 'server'), path.join(root, 'server'), { recursive: true });
    fs.symlinkSync(path.join(ROOT, 'public'), path.join(root, 'public'), 'junction');
    assert.ok(!fs.existsSync(path.join(root, 'config.json')));
    const r = spawnSync(process.execPath, [path.join(root, 'scripts', 'playtest.js'), '--house', 'stark', '--turns', '2'], { cwd: root, env: { ...process.env, WC_PROVIDER: 'mock', WC_SAVES: '' }, encoding: 'utf8', timeout: 240000 });
    assert.equal(r.status, 0, `${r.stderr}\n${String(r.stdout).slice(-600)}`);
    const file = String(r.stdout).match(/Report: (.+\.md)/)?.[1];
    assert.ok(file, 'the script names its report');
    const report = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(report.split('\n')[0], /^# Playtest — House stark — mock — /, 'the header names the provider when no model is configured');
    assert.doesNotMatch(report, /> null/, 'an audience that became a raven is not printed as "null"');
    assert.match(report, /letter sent by raven \(\d+ days?, answer due /, 'and is told as a letter');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

// ── B-37a ────────────────────────────────────────────────────────────────────────────────────────────────────────────
test('B-37a: crossings never say "0 men", "1 men" or "1 days", and a crossing that costs no man says the host is held up', async () => {
  const { crossingLine, chokepointToll, CHOKEPOINTS } = await import('../public/js/shared/chokepoints.js');
  const army = { name: 'The Host of the Rock' }; const cp = { name: 'the Neck', tollText: 'The bogs take their tithe.' };
  assert.equal(crossingLine(army, cp, { gated: false, lost: 0, days: 6 }), 'The bogs take their tithe. The Host of the Rock is held up 6 days.');
  assert.equal(crossingLine(army, cp, { gated: false, lost: 1, days: 1 }), 'The bogs take their tithe. The Host of the Rock loses 1 man on the crossing and is held up 1 day.');
  assert.equal(crossingLine(army, cp, { gated: false, lost: 1200, days: 0 }), 'The bogs take their tithe. The Host of the Rock loses 1,200 men on the crossing.');
  assert.equal(crossingLine(army, cp, { gated: true, gate: 'Moat Cailin', lost: 4, days: 0 }), 'The Host of the Rock crosses at Moat Cailin, and loses 4 men on the crossing.');
  assert.equal(crossingLine(army, cp, { gated: true, gate: 'Moat Cailin', lost: 0, days: 2 }), 'The Host of the Rock crosses at Moat Cailin, and is held up 2 days.');
  assert.equal(crossingLine(army, cp, { gated: true, gate: 'Moat Cailin', lost: 0, days: 0 }), 'The Host of the Rock crosses at Moat Cailin without trouble.');
  // and on the real roads, in every season, for hosts of every size
  const s = world('lannister'); const bad = /\b0 men\b|\b1 men\b|\b1 days\b|lighter/;
  let held = 0;
  for (const season of ['summer', 'autumn', 'winter']) for (const men of [1, 2, 5, 40, 300, 12000]) for (const owner of ['lannister', 'stark']) {
    s.world = { ...(s.world || {}), season };
    for (const [a, b] of [['stark', 'tully'], ['tully', 'stark'], ['baratheon', 'arryn'], ['lannister', 'tully'], ['baratheon', 'martell']]) {
      for (const e of chokepointToll(s, { id: 'h', owner, name: 'A host', men, morale: 70, kind: 'host' }, s.holdings[a].pos, s.holdings[b].pos, 40).events) {
        assert.doesNotMatch(e.text, bad, `${season} ${men} ${owner} ${a}→${b}: ${e.text}`);
        if (/held up/.test(e.text)) held++;
      }
    }
  }
  assert.ok(held > 0, 'somewhere a host is only held up'); assert.ok(CHOKEPOINTS.length > 0);
});

// ── B-37b ────────────────────────────────────────────────────────────────────────────────────────────────────────────
test('B-37b: when a generated lord dies with no heir, the cousin who claims the seat is not his clone (sandbox, deterministic)', () => {
  const heirOfDead = () => {
    const s = world('stark'); s.meta.settings = { ...(s.meta.settings || {}), canonGravity: 'sandbox' };
    const h = Object.values(s.houses).find((x) => s.characters[x.lord]?.generated && x.rank !== 'company' && x.id === 'celtigar')
      || Object.values(s.houses).find((x) => s.characters[x.lord]?.generated && x.rank !== 'company');
    const old = s.characters[h.lord]; old.alive = false; s.meta.turn = 3;
    const notes = resolveSuccessions(s);
    const heir = s.characters[s.houses[h.id].lord];
    return { old, heir, h, notes, s };
  };
  const a = heirOfDead();
  assert.ok(a.notes.some((n) => n.house === a.h.id), 'a succession is recorded');
  assert.notEqual(a.heir.id, a.old.id);
  assert.notEqual(a.heir.name, a.old.name, `"${a.heir.name}" succeeds "${a.old.name}": the heir is not the dead man again`);
  assert.notEqual(a.heir.age, a.old.age, 'nor the same age');
  assert.ok(a.heir.alive && a.heir.generated && a.heir.house === a.h.id);
  const twice = Object.values(a.s.characters).filter((c) => c.house === a.h.id && c.name === a.heir.name);
  assert.equal(twice.length, 1, 'no second man of that name in the house');
  // deterministic: the same world and the same turn give the same cousin
  const b = heirOfDead();
  assert.deepEqual([b.heir.id, b.heir.name, b.heir.age, b.heir.traits], [a.heir.id, a.heir.name, a.heir.age, a.heir.traits]);
  // every house whose lord was raised by the game: when they all fall in one turn, no cousin is his predecessor again
  const s = world('stark'); s.meta.turn = 5;
  const fallen = Object.values(s.houses).filter((x) => x.rank !== 'company' && s.characters[x.lord]?.generated).map((x) => [x.id, s.characters[x.lord]]);
  assert.ok(fallen.length > 50);
  for (const [, lord] of fallen) lord.alive = false;
  resolveSuccessions(s);
  for (const [hid, lord] of fallen) {
    const heir = s.characters[s.houses[hid].lord];
    if (heir.generated && heir.id !== lord.id) assert.notEqual(heir.name, lord.name, `${hid}: ${lord.name}`);
  }
});

// ── B-37c ────────────────────────────────────────────────────────────────────────────────────────────────────────────
test('B-37c: a levy camp tells its muster when it begins, once a week, and when it is whole — each naming the place', () => {
  const s = world('stark');
  const r = withRng(s, () => raiseLevies(s, { house: 'stark', at: 'stark', men: 16000, immediate: false }));
  const host = s.parties[r.host];
  assert.ok(host.muster?.remaining > 10000, 'a great levy walks in over days');
  const cards = [];
  for (let d = 0; d < 14; d++) {
    s.meta.date = addDays(s.meta.date, 1);
    const day = advanceMusters(s, 1);
    for (const c of day) cards.push({ d, ...c });
  }
  assert.ok(cards.length >= 2 && cards.length <= 3, `${cards.length} cards in a fortnight: ${cards.map((c) => c.d + ':' + c.title).join(' | ')}`);
  assert.equal(new Set(cards.map((c) => c.text)).size, cards.length, 'no two cards say the same thing');
  for (const c of cards) { assert.ok(c.where, `"${c.title}" has a place`); assert.match(c.text + c.title, /Winterfell/, 'and names it'); }
  assert.ok(!host.muster, 'the muster is complete by then');
  assert.match(cards.at(-1).text, /whole|complete|all .* have come|reached/i, 'the last card is the completion');
  assert.equal(host.men, 16000, 'every man came');
  // the facts still run day by day (history is facts), only the cards are rationed
  assert.ok((s.facts || []).filter((f) => f.kind === 'muster_grew').length >= 13, 'a fact for every day of the muster');
});

// ── B-32(c)-lite ─────────────────────────────────────────────────────────────────────────────────────────────────────
test('B-32c: a vassal\'s answer to the call, with its exact numbers, is for the houses it touches — not the whole realm', () => {
  assert.equal(KINDS.call_answered.vis, 'houses');
  const s = world('stark'); s.meta.clock = { turn: 1, from: dayNumber(s.meta.date), to: dayNumber(s.meta.date) + 6 };
  const f = emit(s, 'call_answered', { actors: ['greatjon_umber'], houses: ['umber', 'stark'], place: 'umber', on: 2, data: { men: 3800 }, vis: { scope: 'houses', houses: ['umber', 'stark'] } });
  const g = emit(s, 'call_answered', { actors: ['greatjon_umber'], houses: ['umber'], place: 'umber', on: 2, data: { men: 3800 } }); // as the engine makes it: the default scope
  assert.equal(g.vis.scope, 'houses', 'by default it goes to the houses in it');
  for (const fact of [f, g]) {
    assert.equal(K.newsOf(s, fact, 'martell'), null, 'Dorne does not hear a Northern lord\'s numbers');
    assert.equal(K.newsOf(s, fact, 'lannister'), null, 'nor do the Lannisters');
    assert.equal(K.newsOf(s, fact, 'umber').via, 'witness', 'the lord who answered knows');
  }
  assert.equal(K.newsOf(s, f, 'stark').via, 'witness', 'and so does the liege he answered, when the fact names him');
});

test('B-32c: an AI liege hears its own vassal\'s answer to the call (the real muster path); a far house does not', () => {
  const s = world('stark'); const today = dayNumber(s.meta.date);
  s.meta.clock = { turn: 1, from: today, to: today + 6 };
  const v = Object.values(s.houses).find((h) => h.liege === 'tully' && h.id !== 'stark'); assert.ok(v, 'a sworn house of the Riverlands');
  withRng(s, () => answer(s, v, { today }));
  const f = s.facts.find((x) => x.kind === 'call_answered'); assert.ok(f, 'the answer is a fact');
  assert.deepEqual(f.houses.sort(), ['tully', v.id].sort(), 'the fact names the vassal and his liege, once each');
  assert.equal(f.vis.scope, 'houses');
  assert.ok(K.knows(s, 'tully', f, today + 30), 'the liege (an AI house) knows his vassal answered');
  assert.ok(K.knows(s, v.id, f, today + 30), 'and the vassal');
  for (const far of ['martell', 'lannister', 'stark']) assert.ok(!K.knows(s, far, f, today + 30), `${far} does not hear the exact numbers`);
});
