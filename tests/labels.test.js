// Fact hygiene: names that read like names, and facts that say who did it (docs/gdd/18-headlines.md §1.2 causes 4, 5 and
// 11, §3.1; WP N2). Two halves:
//   the label helpers (engine/facts/label.js): houseLabel, who, partyLabel, roughly, list — so that no headline can say
//   "House The Free Folk", "Baratheon of King's Landing", "The Banners of Stark" or "1,796 strong" again;
//   the slots (additive, on the facts the real engine emits): battle → winnerHouse, loserHouse, how; slain_in_battle →
//   by, how; captured_in_battle → by; a death → how; call_refused → why. Each is driven through the engine's own code
//   (shared/battles.js, shared/world.js `note`, engine/people/life.js, server/turn/day.js theYears, engine/military/
//   muster.js) so that a slot the writer needs is a slot the game really records.
// Hardened after review: every slot test is tied to what the engine did (the commander who stood, the battle fact's id, the
// decisive factor of that very battle), the "nothing else changed" test compares every field of every fact with a record
// made from the code before N2, and each reason a lord gives for refusing the call has a case of its own.
// Decisions the tests hold (the builder follows them):
//   houseLabel   "House Stark"; a suffix of place is dropped ("House Baratheon" for Dragonstone and Storm's End, "the
//                Crown" or "House Baratheon" for the throne); orders, tribes, companies and cities take no "House" and a
//                lower-case "the" ("the Free Folk", "the Night's Watch", "the Golden Company"; "Braavos")
//   who          the name as it is, minus any quoted byname; a bynamed lord is "Lord Umber", his heir "Smalljon Umber"
//   partyLabel   a host by its house, "the Stark host", whatever it was called ("The Banners of Stark", "Host of House
//                Umber", "Host of Stark"); a fleet, "the … fleet"
//   roughly      words only, never digits; none for 0, nothing ("") for a number that is not one
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { houseLabel, who, partyLabel, roughly, list } from '../public/js/engine/facts/label.js'; // (new in N2)

process.env.WC_PROVIDER = 'mock';
process.env.WC_SAVES = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-labels-'));
const { createInitialState, applyChanges } = await import('../public/js/shared/world.js');
const { resolveWarfare } = await import('../public/js/shared/battles.js');
const { settle, ref } = await import('../public/js/engine/parties.js');
const { makeRng, seedState, withRng } = await import('../public/js/engine/rng.js');
const { dayNumber, dateOfDay } = await import('../public/js/engine/time.js');
const { lifeTick } = await import('../public/js/engine/people/life.js');
const { summon, musterTick, whyRefused } = await import('../public/js/engine/military/muster.js');
const { vassalTemper } = await import('../public/js/shared/vassals.js');
const { newsOf } = await import('../public/js/engine/knowledge.js');
const { perform } = await import('../public/js/engine/actions/registry.js');
const { engineDay } = await import('../server/turn/day.js');
const { listsTick, LISTS_AFTER } = await import('../public/js/shared/tourney.js');
const { withDice } = await import('../server/dice.js');
test.after(() => fs.rmSync(process.env.WC_SAVES, { recursive: true, force: true }));

const state = createInitialState('agot_298', 'stark', { seed: 298 });
const BAD = /undefined|null|NaN|\[object/;
const fresh = (s) => JSON.parse(JSON.stringify(s));

// ── houseLabel ───────────────────────────────────────────────────────────────────────────────────────────────────────
test('houseLabel: every house of the scenario reads as a name — never "House The …", never a suffix of place, never empty', () => {
  const holdings = Object.values(state.holdings).map((h) => h.name.replace(/^The /, '').toLowerCase());
  const table = []; const problems = [];
  for (const h of Object.values(state.houses)) {
    const label = houseLabel(state, h.id); const bad = (m) => problems.push(`${h.id} (${h.name}) → "${label}": ${m}`);
    if (typeof label !== 'string' || !label.length) { bad('not a string, or empty'); continue; }
    if (label !== label.trim()) bad('not trimmed');
    if (BAD.test(label)) bad('says undefined, null or NaN');
    if (/\bHouse The\b/i.test(label) || /\bHouse House\b/i.test(label)) bad('House The / House House');
    if (/^The\b/.test(label)) bad('a capital "The": a label sits inside a sentence');
    // "Baratheon of King's Landing", "Brune of the Dyre Den", "Royce of the Gates of the Moon": a place is not part of the name
    const m = label.match(/ of (?:the )?(.+)$/i); if (m && holdings.includes(m[1].toLowerCase())) bad(`a suffix of place ("${m[0].trim()}")`);
    if (['crown', 'paramount', 'major', 'minor', 'exile'].includes(h.rank)) { if (!/^(House [A-Z][\w' -]+|the Crown)$/.test(label)) bad('a house is "House X" (or the Crown)'); } else if (/^House /.test(label)) bad(`a ${h.rank} is no house`);
    table.push(`${h.id}: ${label}`);
  }
  assert.deepEqual(problems, []);
  assert.ok(table.length >= 100, `${table.length} houses read`);
});

test('houseLabel: the names the GDD gives — House Stark, the Free Folk, the Night\'s Watch — and the suffixes dropped', () => {
  const L = (id) => houseLabel(state, id);
  assert.equal(L('stark'), 'House Stark'); assert.equal(L('lannister'), 'House Lannister'); assert.equal(L('umber'), 'House Umber'); assert.equal(L('tully'), 'House Tully');
  assert.equal(L('free_folk'), 'the Free Folk'); assert.equal(L('nights_watch'), "the Night's Watch");
  assert.equal(L('golden_company'), 'the Golden Company'); assert.equal(L('brave_companions'), 'the Brave Companions'); assert.equal(L('stone_crows'), 'the Stone Crows');
  assert.match(L('baratheon'), /^(House Baratheon|the Crown)$/, "not \"Baratheon of King's Landing\"");
  assert.equal(L('baratheon_ds'), 'House Baratheon'); assert.equal(L('baratheon_se'), 'House Baratheon');
  assert.equal(L('lannisport'), 'House Lannister'); assert.equal(L('brune_dd'), 'House Brune'); assert.equal(L('royce_gates'), 'House Royce'); assert.equal(L('dayne_hh'), 'House Dayne');
  assert.match(L('martell'), /^House (Nymeros )?Martell$/);
  assert.equal(L('braavos'), 'Braavos'); assert.doesNotMatch(L('dothraki'), /^House /); assert.equal(L('targaryen'), 'House Targaryen');
  assert.doesNotThrow(() => houseLabel(state, 'no_such_house')); assert.equal(typeof houseLabel(state, 'no_such_house'), 'string');
});

// ── who ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
test('who: the name as it is; a byname without its quotes — "Lord Umber" for the Greatjon, "Smalljon Umber" for his son', () => {
  assert.equal(who(state, 'robb_stark'), 'Robb Stark'); assert.equal(who(state, 'rodrik_cassel'), 'Ser Rodrik Cassel'); assert.equal(who(state, 'jon_snow'), 'Jon Snow');
  assert.equal(who(state, 'donella_hornwood'), 'Donella Hornwood'); assert.equal(who(state, 'old_nan'), 'Old Nan');
  assert.equal(who(state, 'greatjon_umber'), 'Lord Umber', 'the lord of the Last Hearth');
  assert.equal(who(state, 'smalljon_umber'), 'Smalljon Umber', 'his heir is not "Lord Umber"');
  const bad = [];
  for (const c of Object.values(state.characters)) {
    const w = who(state, c.id);
    if (typeof w !== 'string' || !w.trim() || w !== w.trim() || BAD.test(w) || w === 'Someone') bad.push(`${c.id}: "${w}"`);
    else if (/["“”]/.test(w)) bad.push(`${c.id}: quotes in "${w}"`);
    else if (!/["“”]/.test(c.name) && w !== c.name) bad.push(`${c.id}: "${c.name}" became "${w}"`);
    else if (/["“”]/.test(c.name) && !w.includes(c.name.replace(/\s*"[^"]+"\s*/g, ' ').trim().split(' ').at(-1))) bad.push(`${c.id}: "${w}" lost the house name`);
  }
  assert.deepEqual(bad, []);
  assert.equal(typeof who(state, 'no_such_person'), 'string'); assert.doesNotMatch(who(state, 'no_such_person'), BAD);
});

test('who: a single-quoted byname goes as a double-quoted one does, straight or curly; an apostrophe inside a word is no byname', () => {
  const G = state.characters.greatjon_umber, S = state.characters.smalljon_umber;
  const is = (c, name, want) => assert.equal(who(state, { ...c, name }), want, name);
  is(G, "Jon 'Greatjon' Umber", 'Lord Umber'); is(G, 'Jon ‘Greatjon’ Umber', 'Lord Umber'); is(G, 'Jon "Greatjon" Umber', 'Lord Umber');
  is(S, "Jon 'Smalljon' Umber", 'Smalljon Umber'); is(S, 'Jon ‘Smalljon’ Umber', 'Smalljon Umber'); is(S, "'Smalljon' Umber", 'Smalljon Umber');
  is({ ...G, sex: 'f' }, "Jon 'Greatjon' Umber", 'Lady Umber');
  is(S, "Ser Wyl O'Rourke", "Ser Wyl O'Rourke"); is(S, "Dickon Nightsong's", "Dickon Nightsong's");
  // and through the scenario's own people: rename a lord and a lord's son
  const s = fresh(state); s.characters.greatjon_umber.name = "Jon 'Greatjon' Umber"; s.characters.smalljon_umber.name = "Jon 'Smalljon' Umber";
  assert.equal(who(s, 'greatjon_umber'), 'Lord Umber'); assert.equal(who(s, 'smalljon_umber'), 'Smalljon Umber');
  assert.doesNotMatch(`${who(s, 'greatjon_umber')} ${who(s, 'smalljon_umber')}`, /['‘’"“”]/);
});

// ── partyLabel ───────────────────────────────────────────────────────────────────────────────────────────────────────
test('partyLabel: "the Stark host", never "The Banners of Stark" nor "Host of House Umber"', () => {
  const host = (owner, name, more = {}) => ({ id: `x_${owner}`, owner, name, kind: 'host', men: 4000, members: [], ...more });
  assert.equal(partyLabel(state, host('stark', 'The Banners of Stark')), 'the Stark host');
  assert.equal(partyLabel(state, host('umber', 'Host of House Umber')), 'the Umber host');
  assert.equal(partyLabel(state, host('stark', 'Host of Stark')), 'the Stark host', 'the name a host gets when the story gives none');
  assert.equal(partyLabel(state, host('lannister', 'Host of House Lannister')), 'the Lannister host');
  assert.match(partyLabel(state, { id: 'x_f', owner: 'baratheon_ds', name: 'Dragonstone Fleet', kind: 'fleet', men: 3000, members: [] }), /fleet/i);
  const bad = [];
  for (const p of [...Object.values(state.parties), host('stark', 'The Banners of Stark'), host('tallhart', 'Host of House Tallhart'), host('free_folk', 'The Host of Mance Rayder')]) {
    const l = partyLabel(state, p);
    if (typeof l !== 'string' || !l.trim() || BAD.test(l)) bad.push(`${p.id}: "${l}"`);
    else if (/banners of/i.test(l) || /host of house/i.test(l) || /^the the\b/i.test(l) || /\bHouse The\b/.test(l) || /^The\b/.test(l)) bad.push(`${p.id} (${p.name}): "${l}"`);
  }
  assert.deepEqual(bad, []);
  assert.doesNotThrow(() => partyLabel(state, null)); assert.equal(typeof partyLabel(state, null), 'string');
});

test('partyLabel: host and fleet are never capitalised, and a free city\'s host is "the Braavos host" — never "Braavos host", never "Free Cities host"', () => {
  const P = (owner, name, kind = 'host') => ({ id: `x_${owner}`, owner, name, kind, men: 3000, members: [] });
  const table = [
    [P('stark', 'The Stark Host'), 'the Stark host'], [P('stark', 'Stark Host'), 'the Stark host'], [P('stark', 'The Stark Fleet'), 'the Stark fleet'], [P('stark', 'Iron Fleet', 'fleet'), 'the Iron fleet'],
    [P('braavos', ''), 'the Braavos host'], [P('braavos', 'Host of Braavos'), 'the Braavos host'], [P('braavos', 'The Braavos Host'), 'the Braavos host'], [P('braavos', 'The Banners of Braavos'), 'the Braavos host'],
    [P('free_cities', 'Free Cities Host'), 'the Free Cities host'], [P('free_cities', ''), 'a host'], [P('free_cities', 'Host of the Free Cities'), 'the host of the Free Cities'],
    [P('golden_company', ''), 'the Golden Company'], [P('nights_watch', ''), "the Night's Watch"],
  ];
  for (const [p, want] of table) assert.equal(partyLabel(state, p), want, JSON.stringify(p));
  // whatever house a host belongs to, and whatever the data called it: a lower-case article, a lower-case noun
  const bad = [];
  for (const h of Object.values(state.houses)) for (const kind of ['host', 'fleet']) for (const name of ['', `Host of ${h.name}`, `The ${h.name.replace(/^The /, '')} Host`, `The ${h.name.replace(/^The /, '')} Fleet`, `Banners of ${h.name}`]) {
    const l = partyLabel(state, { id: 'x', owner: h.id, name, kind, men: 1, members: [] });
    if (typeof l !== 'string' || !/^(the|a) /.test(l) || /\b(Host|Fleet)\b/.test(l) || BAD.test(l) || /\bHouse The\b|\bthe the\b/i.test(l)) bad.push(`${h.id} ${kind} "${name}" → "${l}"`);
    if (state.houses[h.id].rank === 'city_state' && !/^the [A-Z][a-z]+ host$/.test(l) && kind === 'host' && !name) bad.push(`${h.id}: a city's host is "the <City> host", not "${l}"`);
  }
  assert.deepEqual(bad, []);
});

// ── roughly ──────────────────────────────────────────────────────────────────────────────────────────────────────────
test('roughly: a number in words — under twenty the word, then tens, hundreds, thousands, ten thousands; never a digit', () => {
  // a table of values (the strict rows are far from any edge: "nearly" is below a round figure, "about" at or just over it)
  const exact = [[1, 'one'], [7, 'seven'], [12, 'twelve'], [19, 'nineteen'], [20, 'some twenty'], [47, 'some fifty'], [64, 'some sixty'], [90, 'some ninety'],
    [340, 'some three hundred'], [520, 'some five hundred'], [730, 'some seven hundred'], [880, 'some nine hundred'],
    [3300, 'some three thousand'], [4400, 'some four thousand'], [44000, 'some forty thousand'], [62000, 'some sixty thousand'], [28000, 'some thirty thousand']];
  for (const [n, words] of exact) assert.equal(roughly(n), words, String(n));
  const near = [[1796, /^nearly two thousand$/], [1960, /^nearly two thousand$/], [2020, /^(about|some|over) two thousand$/], [6090, /^(about|some) six thousand$/], [12300, /^(about|some) twelve thousand$/], [3940, /^nearly four thousand$/]];
  for (const [n, re] of near) assert.match(roughly(n), re, String(n));
  assert.ok(exact.length + near.length >= 12);
});

test('roughly: none for nothing, nothing for what is no number; words only, whatever the number', () => {
  assert.equal(roughly(0), 'none');
  for (const x of [NaN, -5, -0.5, undefined, null, Infinity, 'many']) assert.equal(roughly(x), '', String(x));
  assert.equal(roughly(7.4), 'seven', 'a fraction is rounded first');
  for (let n = 0; n <= 200000; n += n < 3000 ? 1 : n < 30000 ? 7 : 313) {
    const w = roughly(n);
    assert.match(w, /^[a-z]+(?:[ -][a-z]+)*$/, `${n} → "${w}": words only`);
  }
  // the bigger the number the bigger the word: it never says less for more, within a band
  const order = (n) => ({ none: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 })[roughly(n)];
  for (let n = 1; n < 19; n++) assert.ok(order(n + 1) > order(n), String(n));
});

// ── list ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
test('list: one, two, three or four names in a line; five or more as a count', () => {
  assert.equal(list([]), ''); assert.equal(list(['Umber']), 'Umber');
  assert.equal(list(['Umber', 'Manderly']), 'Umber and Manderly');
  assert.equal(list(['Umber', 'Manderly', 'Karstark']), 'Umber, Manderly and Karstark');
  assert.equal(list(['Umber', 'Manderly', 'Karstark', 'Locke']), 'Umber, Manderly, Karstark and Locke');
  assert.equal(list(['Umber', null, 'Manderly', undefined, '']), 'Umber and Manderly', 'what is not a name is left out');
  const names = ['Umber', 'Manderly', 'Karstark', 'Locke', 'Wull', 'Dustin', 'Flint', 'Ryswell', 'Glover', 'Tallhart', 'Cerwyn', 'Hornwood'];
  const count = { 5: 'five', 6: 'six', 7: 'seven', 9: 'nine' };
  for (const [n, word] of Object.entries(count)) {
    const l = list(names.slice(0, Number(n)));
    assert.match(l, new RegExp(`\\b${word}\\b`, 'i'), `${n} names → "${l}": a count word`);
    assert.doesNotMatch(l, /\d/); assert.ok(l.length <= 60, l);
    assert.ok(!names.slice(0, Number(n)).every((x) => l.includes(x)), `${n} names are not all listed: "${l}"`);
  }
});

// ═════ the slots, on the facts the real engine emits ═══════════════════════════════════════════════════════════════════
const host = (s, id, owner, pos, men, extra = {}) => {
  applyChanges(s, [{ op: 'army_create', id, owner, name: extra.name || `The host ${id}`, at: null, men }], { source: 'test' });
  const p = s.parties[id]; p.pos = [...pos]; p.at = null; delete p.units; Object.assign(p, extra);
  for (const m of [...(p.members || [])]) if (m !== p.commander) p.members = p.members.filter((x) => x !== m);
  if (p.commander) { const c = s.characters[p.commander]; c.loc = ref(id); p.members = [...new Set([...(p.members || []), c.id])]; }
  settle(s, p); return p;
};
const rng = (seed) => { const g = makeRng(seedState(seed)); return () => g.next(); };
// Lord Tywin's 30,000 against a Stark van of 6,000 under Theon Greyjoy, on the Whitewalls road: a slaughter, in which
// Theon is sometimes slain and sometimes taken (the seeds are found, not fixed: the dice may be drawn differently later)
const OWNER = { a: 'lannister', b: 'stark' };
// two hosts of the Lannisters (a, attacking, under Tywin) and the Starks (b, under Theon) meeting on that road; `sandbox`: the
// story keeps no one alive, so a commander can fall on a field he won
const arena = (aMen, bMen, ea = {}, eb = {}, { sandbox = false } = {}) => {
  const s = createInitialState('agot_298', 'stark', { seed: 3 });
  // the arena is the Whitewalls road as it was drawn when these tests were written: the small holdfasts of the lesser houses (G1) that now lie about it would be the Starks' friends' eyes on the field
  for (const h of Object.values(s.holdings)) if (h.lesser) delete s.holdings[h.id];
  if (sandbox) s.meta.settings = { ...(s.meta.settings || {}), canonGravity: 'sandbox' };
  applyChanges(s, [{ op: 'war', status: 'start', name: 'W', attackers: ['lannister'], defenders: ['stark'] }], { source: 'test' });
  host(s, 'a', 'lannister', [560, 1440], aMen, { standing: 'always', commander: 'tywin_lannister', ...ea });
  host(s, 'b', 'stark', [562, 1440], bMen, { commander: 'theon_greyjoy', ...eb });
  return s;
};
const battleBase = arena(30000, 6000);
// the first battle of the arena (a seed of `first` if it gives what `want` asks for — fast — else any of the first `seeds`)
function battleRun(want, seeds = 300, base = battleBase, first = []) {
  const mark = base.facts.length;
  for (const seed of [...first, ...Array.from({ length: seeds }, (_, i) => i + 1)]) {
    const t = fresh(base); resolveWarfare(t, 1, { r: rng(seed) });
    const facts = t.facts.slice(mark); if (want(facts)) return { t, facts, seed };
  }
  throw new Error(`in ${seeds} battles of the scenario, none gave what the test asks for`);
}
const words = (x) => typeof x === 'string' && /^[a-z][a-z ,'-]{2,59}$/i.test(x);
const noUndefined = (f) => assert.ok(!Object.values(f.data || {}).includes(undefined), `${f.kind}: a slot is undefined`);
const ofKind = (facts, kind, actor) => facts.find((f) => f.kind === kind && (!actor || f.actors[0] === actor));
const fellOn = (facts, id) => facts.some((f) => ['slain_in_battle', 'captured_in_battle'].includes(f.kind) && f.actors[0] === id);

test('battle: winnerHouse, loserHouse and how join the party ids the fact already has', () => {
  const { facts } = battleRun((fs) => fs.some((f) => f.kind === 'battle' && f.data.winner));
  const b = ofKind(facts, 'battle'); const d = b.data; noUndefined(b);
  // what was there stays
  assert.equal(d.attacker, 'a'); assert.equal(d.defender, 'b'); assert.ok(['a', 'b'].includes(d.winner) && ['a', 'b'].includes(d.loser) && d.winner !== d.loser);
  assert.ok(d.lost && typeof d.lost === 'object' && d.outcome && Array.isArray(d.decided), 'the losses and the report stay');
  // what is new: the houses (so that a headline can say "Lannisters beat the Stark host")
  assert.equal(d.winnerHouse, OWNER[d.winner]); assert.equal(d.loserHouse, OWNER[d.loser]);
  assert.ok(state.houses[d.winnerHouse] && state.houses[d.loserHouse], 'real house ids');
  assert.ok(words(d.how), `how it was decided, in a few plain words: ${JSON.stringify(d.how)}`);
  assert.equal(d.how, d.decided[0] || 'fortune', 'the first factor of the report the fact already carries');
});

test('battle: how is what decided THAT battle — a different decisive factor gives a different how', () => {
  const howOf = (base, first = []) => { const { facts } = battleRun((fs) => fs.some((f) => f.kind === 'battle' && f.data.winner), 300, base, first); const d = ofKind(facts, 'battle').data; assert.equal(d.how, d.decided[0], 'how is the report\'s first factor'); return d.how; };
  const byNumbers = howOf(battleBase);                                        // 30,000 against 6,000
  const bySurprise = howOf(arena(8000, 8000, { surprise: true }));           // even hosts, the attack unseen
  const byHeart = howOf(arena(8000, 8000, {}, { morale: 10 }));              // even hosts, one of them without heart
  assert.equal(byNumbers, 'numbers and arms'); assert.equal(bySurprise, 'surprise'); assert.equal(byHeart, "the men's heart");
  assert.equal(new Set([byNumbers, bySurprise, byHeart]).size, 3);
});

test('a draw has no winner: winnerHouse and loserHouse are null and there is no how', () => {
  // two hosts as strong as each other, the dice deciding: some day they draw (found by looking, not fixed)
  const { facts } = battleRun((fs) => fs.some((f) => f.kind === 'battle' && f.data.outcome === 'draw'), 400, arena(8000, 8000));
  const d = ofKind(facts, 'battle').data; noUndefined(ofKind(facts, 'battle'));
  assert.equal(d.winner, null); assert.equal(d.winnerHouse, null); assert.equal(d.loserHouse, null); assert.ok(!('how' in d), 'nothing decided it');
});

test('slain_in_battle: by is the enemy COMMANDER who stood, how a plain word, battle the id of the battle fact', () => {
  const { t, facts } = battleRun((fs) => fs.some((f) => f.kind === 'slain_in_battle' && f.actors[0] === 'theon_greyjoy'));
  const f = ofKind(facts, 'slain_in_battle', 'theon_greyjoy'); const battle = ofKind(facts, 'battle'); noUndefined(f);
  assert.match(f.data.cause, /battle/, 'the cause stays');
  assert.ok(t.characters.tywin_lannister.alive && !fellOn(facts, 'tywin_lannister'), 'the victor\'s commander stood at the end of the day');
  assert.equal(f.data.by, 'tywin_lannister', 'he fell to the host that beat him: its commander — not its house');
  assert.notEqual(f.data.by, 'lannister'); assert.ok(t.characters[f.data.by], 'a person of the scenario');
  assert.equal(f.data.how, 'battle'); assert.ok(words(f.data.how));
  assert.equal(f.data.battle, battle.id, 'the fact of the battle he fell in'); assert.equal(battle.kind, 'battle');
  assert.deepEqual(Object.keys(f.data).sort(), ['battle', 'by', 'cause', 'how'], 'the cause, and the slots, and nothing more');
  assert.equal(f.place, battle.place, 'on the field');
});

test('captured_in_battle: by is the captor — the commander of the host that won — and battle links to the battle fact', () => {
  const { t, facts } = battleRun((fs) => fs.some((f) => f.kind === 'captured_in_battle' && f.actors[0] === 'theon_greyjoy'));
  const f = ofKind(facts, 'captured_in_battle', 'theon_greyjoy'); const battle = ofKind(facts, 'battle'); noUndefined(f);
  assert.match(f.data.note, /captive/, 'the note stays');
  assert.ok(t.characters.tywin_lannister.alive && !fellOn(facts, 'tywin_lannister'));
  assert.equal(f.data.by, 'tywin_lannister', 'the commander who took him, not the house of Lannister');
  assert.equal(t.characters[f.data.by].house, 'lannister', 'the house that took him');
  assert.equal(f.data.battle, battle.id); assert.equal(battle.kind, 'battle');
  assert.deepEqual(Object.keys(f.data).sort(), ['battle', 'by', 'note']);
  assert.equal(f.place, battle.place, 'the field he was taken on');
});

test('the enemy commander who himself fell is named no slayer, and no captor: the slain has no by, the captured has the house', () => {
  // the story keeps no one from death (sandbox), so Tywin can fall on a field he won — a two in a hundred chance, found by looking:
  // seeds 900 and 1539 are the ones found; if the dice are drawn otherwise later, the search below goes on for them
  const sandbox = arena(30000, 6000, {}, {}, { sandbox: true });
  const tywinFell = (theon) => (fs) => fs.some((f) => f.kind === 'slain_in_battle' && f.actors[0] === 'tywin_lannister') && fs.some((f) => f.kind === theon && f.actors[0] === 'theon_greyjoy');
  const taken = battleRun(tywinFell('captured_in_battle'), 20000, sandbox, [900]);
  const c = ofKind(taken.facts, 'captured_in_battle', 'theon_greyjoy'); noUndefined(c);
  assert.equal(c.data.by, 'lannister', 'the commander was slain on that field: the captor is the house'); assert.ok(state.houses[c.data.by]);
  assert.equal(c.data.battle, ofKind(taken.facts, 'battle').id);
  const slainVictor = ofKind(taken.facts, 'slain_in_battle', 'tywin_lannister'); noUndefined(slainVictor);
  assert.ok(!('by' in slainVictor.data), 'and the loser\'s commander, taken on the same field, is no one\'s slayer either');
}, { timeout: 120000 });

test('the enemy commander who fell: a man slain beside him is put to no one', () => {
  const sandbox = arena(30000, 6000, {}, {}, { sandbox: true });
  const both = (fs) => fs.some((f) => f.kind === 'slain_in_battle' && f.actors[0] === 'tywin_lannister') && fs.some((f) => f.kind === 'slain_in_battle' && f.actors[0] === 'theon_greyjoy');
  const { facts } = battleRun(both, 20000, sandbox, [1539]);
  for (const f of facts.filter((x) => x.kind === 'slain_in_battle')) {
    noUndefined(f); assert.equal(f.data.how, 'battle'); assert.equal(f.data.battle, ofKind(facts, 'battle').id);
    assert.ok(!('by' in f.data), `${f.actors[0]}: both commanders fell, and no one is named their slayer (${JSON.stringify(f.data.by)})`);
  }
}, { timeout: 120000 });

test('captured_in_battle carries the field it was taken on, so its news comes from that field: a raven, not a rumour (a decision: a capture on a known field is news from that field)', () => {
  const { t, facts } = battleRun((fs) => fs.some((f) => f.kind === 'captured_in_battle' && f.actors[0] === 'theon_greyjoy'));
  const f = ofKind(facts, 'captured_in_battle', 'theon_greyjoy'); const battle = ofKind(facts, 'battle');
  assert.equal(f.place, battle.place);
  // the Starks (the player's house) do not see it: Theon is a Greyjoy, taken on a field of the Riverlands. A raven brings it in
  // two days, where a capture with no field to come from (as before N2) was a rumour three days late at 0.6
  assert.deepEqual(newsOf(t, f), { day: f.day + 2, via: 'raven', confidence: 0.9 });
  // the slain, whose field it always carried, is told the same way
  const slain = battleRun((fs) => fs.some((x) => x.kind === 'slain_in_battle' && x.actors[0] === 'theon_greyjoy'));
  const s = ofKind(slain.facts, 'slain_in_battle', 'theon_greyjoy');
  assert.deepEqual(newsOf(slain.t, s), { day: s.day + 2, via: 'raven', confidence: 0.9 });
});

test('a story battle (the op the canon beats use): winnerHouse and loserHouse are houses; how only if the op says it in plain words', () => {
  const run = (ch) => {
    const s = createInitialState('agot_298', 'stark', { seed: 3 });
    applyChanges(s, [{ op: 'battle', name: 'Battle of Oxcross', at: 'westerling', ...ch }], { source: 'test' });
    const f = s.facts.find((x) => x.kind === 'battle'); assert.ok(f, 'the story battle is a fact'); noUndefined(f); return f;
  };
  let f = run({ attacker: 'stark', defender: 'lannister', victor: 'stark' });
  assert.equal(f.data.winner, 'stark', 'what was there stays'); assert.equal(f.data.winnerHouse, 'stark'); assert.equal(f.data.loserHouse, 'lannister'); assert.ok(!('how' in f.data));
  f = run({ attacker: 'stark', defender: 'lannister', victor: 'lannister' });
  assert.equal(f.data.winnerHouse, 'lannister'); assert.equal(f.data.loserHouse, 'stark');
  f = run({ attacker: 'lannister', defender: 'tully', victor: 'tully', how: 'a night attack on the camps' });
  assert.equal(f.data.winnerHouse, 'tully'); assert.equal(f.data.loserHouse, 'lannister'); assert.equal(f.data.how, 'a night attack on the camps');
  f = run({ attacker: 'free_folk', defender: 'nights_watch', victor: null });
  assert.equal(f.data.winnerHouse, null); assert.equal(f.data.loserHouse, null, 'no victor, no loser'); assert.ok(!('how' in f.data));
  for (const how of ['Charge!!! 100%', 42, '', 'x', {}, 'a'.repeat(80)]) assert.ok(!('how' in run({ attacker: 'stark', defender: 'lannister', victor: 'stark', how }).data), `how: ${JSON.stringify(how).slice(0, 30)} is no plain words`);
});

test('N2 adds slots and nothing else: every field of every fact of the battle, but the new slots, is what it was before N2', () => {
  // The facts of three battles (seeds 5, 32, 53 of the arena above) as the code made them BEFORE N2 (recorded from commit 5720f60):
  // ids stand for their place in the run ("#0" the first fact of the battle), days for the day after the scenario's date. The new
  // slots are struck from what the code makes now (battle: winnerHouse, loserHouse, how; slain_in_battle: by, how, battle;
  // captured_in_battle: by, battle, and the field it gained) and everything left must be equal — ids, order, count, kind, actors,
  // houses, day, importance, text, title, vis, cause, position. If a later package changes how a battle is told, record again.
  const NEW = { battle: ['winnerHouse', 'loserHouse', 'how'], slain_in_battle: ['by', 'how', 'battle'], captured_in_battle: ['by', 'battle'] };
  const today = dayNumber(battleBase.meta.date);
  const shape = (facts) => {
    const ids = facts.map((f) => f.id);
    // (a beaten host that falls back sets out quietly, a fact of the road that ST8 added after N2: the battle's own facts are what is compared)
    return facts.filter((f) => !f.data?.fallback).map((f) => {
      const g = JSON.parse(JSON.stringify(f));
      for (const k of NEW[g.kind] || []) delete g.data?.[k];
      if (g.kind === 'captured_in_battle') delete g.place;
      g.id = `#${ids.indexOf(f.id)}`; if (g._alongside) g._alongside = `#${ids.indexOf(g._alongside)}`; g.day -= today;
      return g;
    });
  };
  const BEFORE_N2 = {
  5: [{"id":"#0","turn":1,"day":0,"kind":"battle","actors":["tywin_lannister","theon_greyjoy"],"houses":["lannister","stark"],"place":"butterwell","pos":[627,1490],"data":{"attacker":"a","defender":"b","winner":"a","loser":"b","wiped":false,"lost":{"a":1500,"b":3120},"outcome":"crushing","odds":8.38,"fortune":1.16,"ground":"open","surprise":false,"caught":true,"stances":{"a":"attack","b":"withdraw"},"decided":["numbers and arms","generalship"],"pursuit":0.12,"spoils":0,"power":{"a":43604,"b":5206}},"vis":{"scope":"public"},"importance":5,"title":"Lannister victorious near Whitewalls","text":"The host a routed The host b; Theon Greyjoy was taken captive."},{"id":"#1","turn":1,"day":0,"kind":"rout","actors":["theon_greyjoy"],"houses":["stark","lannister"],"place":"butterwell","data":{"party":"b"},"vis":{"scope":"public"},"importance":5,"_alongside":"#0","title":"The host b routed","text":"The host b breaks and flees the field near Whitewalls."},{"id":"#2","turn":1,"day":0,"kind":"arrived","actors":["theon_greyjoy"],"houses":["greyjoy"],"data":{"joined":"a"},"cause":{"type":"rule","ref":"battle"},"vis":{"scope":"local"},"importance":2,"_alongside":"#0","text":"Theon Greyjoy is now with The host a."},{"id":"#3","turn":1,"day":0,"kind":"captured_in_battle","actors":["theon_greyjoy"],"houses":["greyjoy"],"data":{"note":"Taken captive in battle near Whitewalls"},"cause":{"type":"rule","ref":"battle"},"vis":{"scope":"public"},"importance":4,"_alongside":"#0","text":"Theon Greyjoy is taken captive on the field."}],
  32: [{"id":"#0","turn":1,"day":0,"kind":"battle","actors":["tywin_lannister","theon_greyjoy"],"houses":["lannister","stark"],"place":"butterwell","pos":[627,1490],"data":{"attacker":"a","defender":"b","winner":"a","loser":"b","wiped":false,"lost":{"a":1500,"b":3120},"outcome":"crushing","odds":8.38,"fortune":0.95,"ground":"open","surprise":false,"caught":true,"stances":{"a":"attack","b":"withdraw"},"decided":["numbers and arms","generalship"],"pursuit":0.12,"spoils":0,"power":{"a":43604,"b":5206}},"vis":{"scope":"public"},"importance":5,"title":"Lannister victorious near Whitewalls","text":"The host a routed The host b; Tywin Lannister was wounded."},{"id":"#1","turn":1,"day":0,"kind":"rout","actors":["theon_greyjoy"],"houses":["stark","lannister"],"place":"butterwell","data":{"party":"b"},"vis":{"scope":"public"},"importance":5,"_alongside":"#0","title":"The host b routed","text":"The host b breaks and flees the field near Whitewalls."},{"id":"#2","turn":1,"day":0,"kind":"wounded","actors":["tywin_lannister"],"houses":["lannister"],"data":{"note":"Wounded in battle near Whitewalls"},"cause":{"type":"rule","ref":"battle"},"vis":{"scope":"local"},"importance":4,"_alongside":"#0","text":"Tywin Lannister is wounded — Wounded in battle near Whitewalls."},{"id":"#3","turn":1,"day":0,"kind":"slain_in_battle","actors":["theon_greyjoy"],"houses":["greyjoy"],"place":"butterwell","data":{"cause":"killed in battle near Whitewalls"},"cause":{"type":"rule","ref":"battle"},"vis":{"scope":"public"},"importance":4,"_alongside":"#0","text":"Theon Greyjoy is slain — killed in battle near Whitewalls."}],
  53: [{"id":"#0","turn":1,"day":0,"kind":"battle","actors":["tywin_lannister","theon_greyjoy"],"houses":["lannister","stark"],"place":"butterwell","pos":[627,1490],"data":{"attacker":"a","defender":"b","winner":"a","loser":"b","wiped":false,"lost":{"a":1500,"b":3120},"outcome":"crushing","odds":8.38,"fortune":1.07,"ground":"open","surprise":false,"caught":true,"stances":{"a":"attack","b":"withdraw"},"decided":["numbers and arms","generalship"],"pursuit":0.12,"spoils":0,"power":{"a":43604,"b":5206}},"vis":{"scope":"public"},"importance":5,"title":"Lannister victorious near Whitewalls","text":"The host a routed The host b; Theon Greyjoy was slain."},{"id":"#1","turn":1,"day":0,"kind":"rout","actors":["theon_greyjoy"],"houses":["stark","lannister"],"place":"butterwell","data":{"party":"b"},"vis":{"scope":"public"},"importance":5,"_alongside":"#0","title":"The host b routed","text":"The host b breaks and flees the field near Whitewalls."},{"id":"#2","turn":1,"day":0,"kind":"slain_in_battle","actors":["theon_greyjoy"],"houses":["greyjoy"],"place":"butterwell","data":{"cause":"killed in battle near Whitewalls"},"cause":{"type":"rule","ref":"battle"},"vis":{"scope":"public"},"importance":4,"_alongside":"#0","text":"Theon Greyjoy is slain — killed in battle near Whitewalls."}]
  };
  const turn = battleBase.meta.factTurn, seq = battleBase.meta.factSeq;
  for (const seed of [5, 32, 53]) {
    const t = fresh(battleBase); resolveWarfare(t, 1, { r: rng(seed) });
    const facts = t.facts.slice(battleBase.facts.length);
    facts.forEach((f, i) => assert.equal(f.id, `f${turn}.${seq + 1 + i}`, `seed ${seed}: the ids run on from the setup's, one by one`));
    assert.deepEqual(shape(facts), BEFORE_N2[seed], `seed ${seed}`);
  }
});

// ── deaths at a lord's hand ──────────────────────────────────────────────────────────────────────────────────────────────
test('executed: by is the lord who gave the order (through the court\'s own verb); a knight killed in the lists says how — a wound', () => {
  const s = createInitialState('agot_298', 'stark', { seed: 5 }); Object.assign(s.characters.jaime_lannister, { status: 'imprisoned', loc: 'stark' }); s.facts = [];
  const r = withRng(s, () => perform(s, 'judge_prisoner', { house: 'stark', params: { character: 'jaime_lannister', verdict: 'execute' } }));
  assert.ok(r.ok, r.refusal?.text);
  const f = s.facts.find((x) => x.kind === 'executed'); assert.ok(f, 'the execution is a fact'); noUndefined(f);
  assert.equal(f.data.by, s.houses.stark.lord, 'the lord of the house that judged'); assert.match(f.data.cause, /executed by order of House Stark/, 'the cause stays');
  // the lists (run three weeks after the call): one tourney in eight or so kills a knight (the search goes on until the dice are drawn so)
  let d = null;
  for (const seed of [4, ...Array.from({ length: 400 }, (_, i) => i + 1)]) {
    const t = createInitialState('agot_298', 'stark', { seed: 5 }); t.meta.rngState = seedState(seed); t.facts = [];
    withRng(t, () => { perform(t, 'hold_tourney', { house: 'stark', params: {} }); const n = dayNumber(t.meta.date) + LISTS_AFTER; t.meta.date = dateOfDay(n); t.meta.clock = { turn: 2, from: n, to: n }; listsTick(t); });
    d = t.facts.find((x) => x.kind === 'death'); if (d) break;
  }
  assert.ok(d, 'a knight dies in the lists within four hundred tourneys'); noUndefined(d);
  assert.match(d.data.cause, /in the lists/); assert.equal(d.data.how, 'wound');
});

// ── deaths of nature ─────────────────────────────────────────────────────────────────────────────────────────────────
const HOW = { 'old age': 'age', illness: 'illness', 'a long illness': 'illness', 'a fever': 'fever', 'a winter chill': 'winter', 'a festering wound': 'wound' };
const weeklyDay = (s) => { let n = dayNumber(s.meta.date); while (n % 7 !== 0) n++; s.meta.date = dateOfDay(n); s.meta.clock = { turn: 1, from: n, to: n }; return n; };

test('a death of the years: how is "age" or "illness", and the words of the card say the same as the slot', async () => {
  const years = async (traits, more = {}) => {
    const s = createInitialState('agot_298', 'stark', { seed: 5 }); s.meta.date = { year: 298, month: 12, day: 30 };
    Object.assign(s.characters.old_nan, { age: 99, traits, ...more });
    for (let seed = 1; seed <= 80; seed++) {
      const t = fresh(s); t.meta.rngState = seedState(seed); const d0 = dayNumber(t.meta.date); t.meta.clock = { turn: t.meta.turn + 1, from: d0 + 1, to: d0 + 1 };
      await withDice(t, () => engineDay(t, { deliver: async () => [], touched: new Set() }));
      const f = (t.facts || []).find((x) => x.kind === 'death' && x.actors.includes('old_nan')); if (f) return f;
    }
    throw new Error('the years never took Old Nan in eighty tries');
  };
  const old = await years('ancient, wise, storyteller'); noUndefined(old);
  assert.equal(old.data.cause, 'old age'); assert.equal(typeof old.data.age, 'number'); assert.equal(old.data.how, 'age');
  assert.match(old.text, /died of old age/); assert.doesNotMatch(old.text, /illness/);
  // ailing by the traits, by the bio, by the word "sick", or by a wound: the slot and the words agree, whichever way it is found
  for (const [what, traits, more] of [['a trait', 'ancient, ailing', {}], ['the bio', 'ancient', { bio: 'ailing for a year' }], ['the word sick', 'ancient, sick', {}], ['a wound', 'ancient', { status: 'wounded' }]]) {
    const sick = await years(traits, more); noUndefined(sick);
    assert.equal(sick.data.cause, 'illness', what); assert.equal(sick.data.how, 'illness', what);
    assert.match(sick.text, /died of a long illness/, `${what}: the words say what the slot says`); assert.doesNotMatch(sick.text, /old age/, what);
  }
});

test('a death of the days (life.js): fever, winter chill and festering wound each say how', () => {
  const run = (setup) => {
    const s = createInitialState('agot_298', 'stark', { seed: 5 }); s.characters.old_nan.age = 90; const n = weeklyDay(s); setup?.(s, n);
    return withRng(s, () => lifeTick(s, () => 0, {})).events.map((e) => (s.facts || []).find((f) => f.id === e.fact)).filter((f) => f?.kind === 'death');
  };
  const check = (deaths, cause, how) => {
    assert.ok(deaths.some((f) => f.data.cause === cause), `some death of "${cause}"`);
    for (const f of deaths) { noUndefined(f); assert.equal(f.data.how, HOW[f.data.cause], `${f.actors[0]}: ${f.data.cause}`); assert.equal(typeof f.data.cause, 'string'); }
    assert.ok(deaths.filter((f) => f.data.cause === cause).every((f) => f.data.how === how));
  };
  check(run(), 'a fever', 'fever');
  check(run((s) => { s.world.season = 'winter'; }), 'a winter chill', 'winter');
  check(run((s, n) => { const c = s.characters.rodrik_cassel; c.status = 'wounded'; c.wound = { since: n - 5, heals: n, festers: true }; }), 'a festering wound', 'wound');
});

// ── a call refused ───────────────────────────────────────────────────────────────────────────────────────────────────
test('call_refused: why, in words, beside the lord and the house it already names', () => {
  const s = createInitialState('agot_298', 'stark', { seed: 5 });
  const v = s.houses.hornwood; const today = dayNumber(s.meta.date);
  s.characters[v.lord].loyalty = 0; s.relations[['stark', 'hornwood'].sort().join('|')] = { v: -100 };
  summon(s, v, { muster: 'stark', today }); v.obligations.stage = 'deliberating'; v.obligations.call.decide = today;
  s.meta.clock = { turn: 1, from: today, to: today };
  let f = null;
  for (let seed = 1; seed <= 60 && !f; seed++) { const t = fresh(s); t.meta.rngState = seedState(seed); withRng(t, () => musterTick(t, new Set())); f = (t.facts || []).find((x) => x.kind === 'call_refused'); }
  assert.ok(f, 'the Lady of the Hornwood, sore and far from Winterfell, refuses within sixty tries');
  noUndefined(f);
  assert.deepEqual(f.actors, ['donella_hornwood']); assert.deepEqual(f.houses, ['hornwood']); assert.match(f.text, /refuses the summons/, 'the words stay');
  assert.ok(words(f.data?.why), `why, in a few plain words: ${JSON.stringify(f.data?.why)}`);
  assert.equal(f.data.liege, 'stark', 'and the house that called');
});

// the vassal of these cases: the Hornwoods, sworn to Stark, well disposed (loyalty 80, friendship 50, the tax the usual, the granary
// full) — then one thing at a time made worse
const vassal = ({ rel = 50, loyalty = 80, tax = 'normal', food = 50, late = false } = {}) => {
  const s = createInitialState('agot_298', 'stark', { seed: 5 }); const v = s.houses.hornwood;
  s.characters[v.lord].loyalty = loyalty; s.relations[['stark', 'hornwood'].sort().join('|')] = { v: rel };
  s.houses.stark.policy = { ...(s.houses.stark.policy || {}), tax };
  if (food === undefined) delete v.figures.food; else v.figures.food = { ...(v.figures.food || {}), v: food };
  return { s, v, call: { late } };
};
const why = (o) => { const { s, v, call } = vassal(o); return whyRefused(s, v, call); };

test('whyRefused: a reason for each thing that weighs on a lord — and none for a dutiful lord who simply refused', () => {
  assert.equal(why({}), null, 'a dutiful lord refuses one time in fifty and has no reason: the fact says nothing rather than guess');
  assert.equal(why({ rel: -30 }), 'bad blood between the houses'); assert.equal(why({ rel: -100 }), 'bad blood between the houses');
  assert.equal(why({ rel: -29 }), null, 'a shade less bad, and it is not bad blood');
  assert.equal(why({ loyalty: 29 }), 'little loyalty to the liege'); assert.equal(why({ loyalty: 0 }), 'little loyalty to the liege'); assert.equal(why({ loyalty: 30 }), null);
  assert.equal(why({ tax: 'heavy' }), "the liege's heavy taxes"); assert.equal(why({ tax: 'crushing' }), "the liege's heavy taxes"); assert.equal(why({ tax: 'light' }), null);
  assert.equal(why({ food: 1 }), 'hungry lands at home'); assert.equal(why({ food: 2 }), null);
  assert.equal(why({ late: true }), 'already put the call off once');
  // low in heart and nothing else: a temper under the dutiful band (45)
  const low = vassal({ rel: -29, loyalty: 30 }); assert.ok(vassalTemper(low.s, 'hornwood') < 45, 'the case is a lord of a poor temper');
  assert.equal(whyRefused(low.s, low.v, low.call), 'no heart for the war');
  // and each answers with words
  for (const o of [{ rel: -50 }, { loyalty: 10 }, { tax: 'heavy' }, { food: 0 }, { late: true }, { rel: -29, loyalty: 30 }]) assert.ok(words(why(o)), JSON.stringify(o));
});

test('whyRefused: an empty granary is hunger, not plenty (0 is not "no figure"); a granary nobody has counted is not hunger', () => {
  assert.equal(why({ food: 0 }), 'hungry lands at home', 'a starving vassal gives the hunger reason');
  assert.equal(why({ food: undefined }), null, 'no figure for the food: nothing is said of it');
  assert.equal(why({ food: '0' }), 'hungry lands at home');
});

test('whyRefused: the reasons come in the order of their weight — bad blood before loyalty, loyalty before the tax, hunger, a second asking', () => {
  assert.equal(why({ rel: -80, loyalty: 5, tax: 'crushing', food: 0, late: true }), 'bad blood between the houses');
  assert.equal(why({ loyalty: 5, tax: 'crushing', food: 0, late: true }), 'little loyalty to the liege');
  assert.equal(why({ tax: 'crushing', food: 0, late: true }), "the liege's heavy taxes");
  assert.equal(why({ food: 0, late: true }), 'hungry lands at home');
  assert.equal(why({ late: true, rel: -29, loyalty: 30 }), 'already put the call off once', 'a second asking is a reason before a poor temper is');
});

test('call_refused, through the muster: a starving vassal who refuses says why — hunger', () => {
  const s = createInitialState('agot_298', 'stark', { seed: 5 });
  const v = s.houses.hornwood; const today = dayNumber(s.meta.date);
  // a poor temper that is neither bad blood nor disloyal, and a granary with nothing in it
  s.characters[v.lord].loyalty = 30; s.relations[['stark', 'hornwood'].sort().join('|')] = { v: -29 }; v.figures.food = { ...(v.figures.food || {}), v: 0 };
  summon(s, v, { muster: 'stark', today }); v.obligations.stage = 'deliberating'; v.obligations.call.decide = today;
  s.meta.clock = { turn: 1, from: today, to: today };
  let f = null;
  for (let seed = 1; seed <= 200 && !f; seed++) { const t = fresh(s); t.meta.rngState = seedState(seed); withRng(t, () => musterTick(t, new Set())); f = (t.facts || []).find((x) => x.kind === 'call_refused'); }
  assert.ok(f, 'a lord of so poor a temper refuses within two hundred tries');
  assert.equal(f.data.why, 'hungry lands at home'); assert.equal(f.data.liege, 'stark');
});
