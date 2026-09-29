// Fact hygiene: names that read like names, and facts that say who did it (docs/gdd/18-headlines.md §1.2 causes 4, 5 and
// 11, §3.1; WP N2). Two halves:
//   the label helpers (engine/facts/label.js): houseLabel, who, partyLabel, roughly, list — so that no headline can say
//   "House The Free Folk", "Baratheon of King's Landing", "The Banners of Stark" or "1,796 strong" again;
//   the slots (additive, on the facts the real engine emits): battle → winnerHouse, loserHouse, how; slain_in_battle →
//   by, how; captured_in_battle → by; a death → how; call_refused → why. Each is driven through the engine's own code
//   (shared/battles.js, shared/world.js `note`, engine/people/life.js, server/turn/day.js theYears, engine/military/
//   muster.js) so that a slot the writer needs is a slot the game really records.
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
const { summon, musterTick } = await import('../public/js/engine/military/muster.js');
const { engineDay } = await import('../server/turn/day.js');
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
const battleBase = (() => {
  const s = createInitialState('agot_298', 'stark', { seed: 3 });
  applyChanges(s, [{ op: 'war', status: 'start', name: 'W', attackers: ['lannister'], defenders: ['stark'] }], { source: 'test' });
  host(s, 'a', 'lannister', [560, 1440], 30000, { standing: 'always', commander: 'tywin_lannister' });
  host(s, 'b', 'stark', [562, 1440], 6000, { commander: 'theon_greyjoy' });
  return s;
})();
function battleRun(want, seeds = 300) {
  const mark = battleBase.facts.length;
  for (let seed = 1; seed <= seeds; seed++) {
    const t = fresh(battleBase); resolveWarfare(t, 1, { r: rng(seed) });
    const facts = t.facts.slice(mark); if (want(facts)) return { t, facts, seed };
  }
  throw new Error(`in ${seeds} battles of the scenario, none gave what the test asks for`);
}
const words = (x) => typeof x === 'string' && /^[a-z][a-z ,'-]{2,59}$/i.test(x);
const noUndefined = (f) => assert.ok(!Object.values(f.data || {}).includes(undefined), `${f.kind}: a slot is undefined`);

test('battle: winnerHouse, loserHouse and how join the party ids the fact already has', () => {
  const { facts } = battleRun((fs) => fs.some((f) => f.kind === 'battle' && f.data.winner));
  const b = facts.find((f) => f.kind === 'battle'); const d = b.data; noUndefined(b);
  // what was there stays
  assert.equal(d.attacker, 'a'); assert.equal(d.defender, 'b'); assert.ok(['a', 'b'].includes(d.winner) && ['a', 'b'].includes(d.loser) && d.winner !== d.loser);
  assert.ok(d.lost && typeof d.lost === 'object' && d.outcome && Array.isArray(d.decided), 'the losses and the report stay');
  // what is new: the houses (so that a headline can say "Lannisters beat the Stark host")
  assert.equal(d.winnerHouse, OWNER[d.winner]); assert.equal(d.loserHouse, OWNER[d.loser]);
  assert.ok(state.houses[d.winnerHouse] && state.houses[d.loserHouse], 'real house ids');
  assert.ok(words(d.how), `how it was decided, in a few plain words: ${JSON.stringify(d.how)}`);
});

test('slain_in_battle: by (the slayer or the enemy commander) and how, beside the cause it already has', () => {
  const { facts } = battleRun((fs) => fs.some((f) => f.kind === 'slain_in_battle' && f.actors[0] === 'theon_greyjoy'));
  const f = facts.find((x) => x.kind === 'slain_in_battle'); noUndefined(f);
  assert.match(f.data.cause, /battle/, 'the cause stays');
  assert.equal(f.data.by, 'tywin_lannister', 'he fell to the host that beat him: its commander');
  assert.ok(state.characters[f.data.by], 'a person of the scenario');
  assert.ok(words(f.data.how), `how: ${JSON.stringify(f.data.how)}`);
});

test('captured_in_battle: by, the captor, on the side that won', () => {
  const { facts } = battleRun((fs) => fs.some((f) => f.kind === 'captured_in_battle' && f.actors[0] === 'theon_greyjoy'));
  const f = facts.find((x) => x.kind === 'captured_in_battle'); noUndefined(f);
  assert.match(f.data.note, /captive/, 'the note stays');
  const by = f.data.by; assert.ok(state.characters[by] || state.houses[by], `a person or a house: ${by}`);
  assert.equal(state.characters[by]?.house ?? by, 'lannister', 'the house that took him');
});

test('N2 adds slots and nothing else: the same facts of the battle, in the same order, under the same ids', () => {
  // recorded before N2; if a later package changes how a battle is told, record these again
  const kinds = (seed) => { const t = fresh(battleBase); resolveWarfare(t, 1, { r: rng(seed) }); return t.facts.slice(battleBase.facts.length).map((f) => `${f.id}:${f.kind}:${f.actors.join('+')}`); };
  assert.deepEqual(kinds(5), ['f1.4:battle:tywin_lannister+theon_greyjoy', 'f1.5:rout:theon_greyjoy', 'f1.6:arrived:theon_greyjoy', 'f1.7:captured_in_battle:theon_greyjoy']);
  assert.deepEqual(kinds(32), ['f1.4:battle:tywin_lannister+theon_greyjoy', 'f1.5:rout:theon_greyjoy', 'f1.6:wounded:tywin_lannister', 'f1.7:slain_in_battle:theon_greyjoy']);
  assert.deepEqual(kinds(53), ['f1.4:battle:tywin_lannister+theon_greyjoy', 'f1.5:rout:theon_greyjoy', 'f1.6:slain_in_battle:theon_greyjoy']);
});

// ── deaths of nature ─────────────────────────────────────────────────────────────────────────────────────────────────
const HOW = { 'old age': 'age', illness: 'illness', 'a long illness': 'illness', 'a fever': 'fever', 'a winter chill': 'winter', 'a festering wound': 'wound' };
const weeklyDay = (s) => { let n = dayNumber(s.meta.date); while (n % 7 !== 0) n++; s.meta.date = dateOfDay(n); s.meta.clock = { turn: 1, from: n, to: n }; return n; };

test('a death of the years: how is "age" or "illness", beside the cause and the age it already has', async () => {
  const years = async (traits) => {
    const s = createInitialState('agot_298', 'stark', { seed: 5 }); s.meta.date = { year: 298, month: 12, day: 30 };
    Object.assign(s.characters.old_nan, { age: 99, traits });
    for (let seed = 1; seed <= 80; seed++) {
      const t = fresh(s); t.meta.rngState = seedState(seed); const d0 = dayNumber(t.meta.date); t.meta.clock = { turn: t.meta.turn + 1, from: d0 + 1, to: d0 + 1 };
      await withDice(t, () => engineDay(t, { deliver: async () => [], touched: new Set() }));
      const f = (t.facts || []).find((x) => x.kind === 'death' && x.actors.includes('old_nan')); if (f) return f;
    }
    throw new Error('the years never took Old Nan in eighty tries');
  };
  const old = await years('ancient, wise, storyteller'); noUndefined(old);
  assert.equal(old.data.cause, 'old age'); assert.equal(typeof old.data.age, 'number'); assert.equal(old.data.how, 'age');
  const sick = await years('ancient, ailing'); noUndefined(sick);
  assert.equal(sick.data.cause, 'illness'); assert.equal(sick.data.how, 'illness');
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
});
