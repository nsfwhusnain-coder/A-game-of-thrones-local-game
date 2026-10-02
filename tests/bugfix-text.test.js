// The words the game writes (docs/BUG-HUNT-2026-10-02.md: ST10, ST12, ST13, ST14, TX4, TX5, TX9), mock only.
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.WC_PROVIDER = 'mock';
const { createInitialState } = await import('../public/js/shared/world.js');
const { realmBrief, realmSummary } = await import('../public/js/engine/realm/brief.js');

test('TX9: the realm briefing counts "21st", "22nd", "23rd", "31st", never "21th"', () => {
  const s = createInitialState('agot_298', 'stark', { seed: 7 });
  const ranks = new Set(); const bad = [];
  // the houses that rank past twentieth among the houses of standing (the Targaryens, the free companies, the tribes: 28th ... 34th)
  const low = Object.values(s.houses).map((h) => [realmSummary(s, h.id).rank, h.id]).filter(([r]) => r >= 21).sort((a, b) => a[0] - b[0]);
  for (const [, id] of [...new Map(low.map((x) => [x[0], x])).values()].concat(low.slice(0, 6))) {
    const t = realmBrief(s, id).text; const m = t.match(/Your house: (\d+\w\w)/); if (m) ranks.add(m[1]);
    for (const x of t.matchAll(/\b(\d+)(st|nd|rd|th)\b/g)) { const n = Number(x[1]); const want = (n % 100 >= 11 && n % 100 <= 13) ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'; if (x[2] !== want) bad.push(`${id}: ${x[0]}`); }
  }
  assert.deepEqual(bad, []);
  assert.ok([...ranks].some((r) => /^3[123]/.test(r)), `a rank like 31st or 33rd is seen (${[...ranks].join(' ')})`);
});

// ── TX4: house names read as names ──
const { houseLabel } = await import('../public/js/engine/facts/label.js');
const { tidyHouseNames } = await import('../public/js/engine/facts/tidy.js');
const { perform } = await import('../public/js/engine/actions/registry.js');
const { withRng } = await import('../public/js/engine/rng.js');
const { dayNumber } = await import('../public/js/engine/time.js');

test('TX4: "House The Free Folk", "House Baratheon of King\'s Landing", "Host of House Woolfield of Woolfield" are told as a herald would', () => {
  const s = createInitialState('agot_298', 'stark', { seed: 7 });
  const said = (t) => tidyHouseNames(s, t);
  const ff = s.houses.free_folk, bk = s.houses.baratheon;
  assert.equal(`House ${ff.name} calls up 12,000 levies`.replace(/\s+/g, ' '), 'House The Free Folk calls up 12,000 levies', 'the scenario: the data name is "The Free Folk"');
  assert.equal(said('House The Free Folk calls up 12,000 levies.'), 'The Free Folk calls up 12,000 levies.');
  assert.equal(said(`${'House'} ${bk.name} sends 500 gold dragons as a gift to Ned.`), 'the Crown sends 500 gold dragons as a gift to Ned.'.replace(/^the/, 'The'));
  assert.equal(said('A feast, held by House Baratheon of King\'s Landing.'), 'A feast, held by the Crown.');
  assert.match(said('Host of House Woolfield of Woolfield marches.'), /^Host of House Woolfield marches\.$/);
  assert.equal(said('Tired of Joffrey\'s command, House Khalasar of Drogo goes home.'), 'Tired of Joffrey\'s command, the Dothraki goes home.');
  assert.equal(said('House Stark holds Winterfell.'), 'House Stark holds Winterfell.', 'a house that is named as it is, is not touched');
  assert.equal(said(''), ''); assert.equal(said(undefined), '');
});

test('TX4: the words the engine writes into a fact and into a receipt are told so', () => {
  const s = createInitialState('agot_298', 'free_folk', { seed: 7 }); s.facts = []; const day = dayNumber(s.meta.date); s.meta.clock = { turn: 1, from: day, to: day };
  const r = withRng(s, () => perform(s, 'raise_levies', { house: 'free_folk', params: { at: s.houses.free_folk.seat, men: 400 }, source: { type: 'order', ref: 'o' } }));
  assert.ok(r.ok, r.refusal?.text);
  const all = [...r.receipt.map((l) => l.text), ...s.facts.map((f) => `${f.title || ''} ${f.text || ''}`)].join(' | ');
  assert.doesNotMatch(all, /House The /, all); assert.doesNotMatch(all, /House Khalasar|House Baratheon of|House \w+ of \w/, all);
  const t = createInitialState('agot_298', 'stark', { seed: 7 });
  assert.equal(houseLabel(t, 'free_folk'), 'the Free Folk');
});

// ── TX5: a card that stops at its headline ──
const { cardOf } = await import('../public/js/engine/facts/headline.js');
const { scoreCard } = await import('../server/ai/validate/headline.js');

test('TX5: a tax, a due, an office and a command that came to nothing each say something under the headline, and the scorer takes them', () => {
  const s = createInitialState('agot_298', 'stark', { seed: 7 }); const day = dayNumber(s.meta.date);
  const mk = (kind, f) => ({ id: 'f1.1', turn: 1, day, kind, actors: [], houses: [], importance: 3, vis: { scope: 'public' }, text: 'x', ...f });
  const told = (f) => { const story = { facts: [f], place: f.place, houses: f.houses }; const c = cardOf(s, story); const v = scoreCard({ headline: c.headline, summary: c.summary }, story, s); assert.ok(v.pass, `${c.headline} / ${c.summary}: ${JSON.stringify(v.detail)}`); return c; };
  for (const tax of ['low', 'high', 'crushing', 'normal']) { const c = told(mk('tax_changed', { actors: ['eddard_stark'], houses: ['stark'], place: 'stark', data: { tax, was: tax === 'low' ? 'normal' : 'low' } })); assert.ok(c.summary, `taxes ${tax}: a second line`); }
  for (const dues of ['late', 'withholding', 'paying']) { const c = told(mk('tax_changed', { actors: ['rickard_karstark'], houses: ['karstark', 'stark'], place: 'karstark', data: { dues, was: 'paying', liege: 'stark' } })); assert.ok(c.summary, `dues ${dues}: a second line`); }
  const o = told(mk('office_granted', { actors: ['rodrik_cassel', 'eddard_stark'], houses: ['stark'], place: 'stark', data: { office: 'captain' } }));
  assert.match(o.headline, /captain of the guard/); assert.match(o.headline, /Winterfell/, 'of which hall');
  const r = told(mk('order_given', { actors: ['eddard_stark'], houses: ['stark'], place: 'stark', data: { refused: true, why: 'the order was not clear — Where should Jhiqui go.' } }));
  assert.match(r.headline, /command comes to nothing/); assert.doesNotMatch(r.summary, /seal/); assert.match(r.summary, /nothing was done/);
  const w = told(mk('order_given', { actors: ['eddard_stark'], houses: ['stark'], place: 'stark', data: { refused: true, why: 'There is not enough gold for it' } }));
  assert.match(w.summary, /^There is not enough gold for it, and nothing was done\.$/);
});

// ── ST13: the same collapse, found where the man is ──
const { collapseText } = await import('../public/js/shared/psyche.js');
const { joinParty } = await import('../public/js/engine/parties.js');

test('ST13: a man worn past bearing is found in his cell, his tent, his cabin, at the roadside or in his solar, as it is', () => {
  const s = createInitialState('agot_298', 'stark', { seed: 7 });
  const asha = s.characters.asha_greyjoy; asha.status = 'imprisoned';
  const cell = collapseText(s, asha); assert.match(cell, /cell/); assert.doesNotMatch(cell, /solar|maester/);
  const ned = s.characters.eddard_stark; assert.match(collapseText(s, ned), /floor of the solar at dawn/); assert.match(collapseText(s, ned), /The maester speaks/);
  s.parties.h = { id: 'h', kind: 'host', owner: 'stark', name: 'The Host', commander: 'eddard_stark', at: null, pos: [...s.holdings.stark.pos], men: 100, members: [], march: { to: 'frey', since: 0 } }; joinParty(s, ned, s.parties.h);
  const tent = collapseText(s, ned); assert.match(tent, /tent/); assert.doesNotMatch(tent, /solar/);
  s.parties.h.kind = 'fleet'; assert.match(collapseText(s, ned), /cabin/);
  s.parties.h.kind = 'rider'; assert.match(collapseText(s, ned), /roadside|side of the road/);
});

// ── ST12: a voyage is not a ride ──
test('ST12: a journey with a sea leg is told as a voyage, by its slot or by its party\'s route', () => {
  const s = createInitialState('agot_298', 'stark', { seed: 7 }); const day = dayNumber(s.meta.date);
  const f = (data, party) => ({ id: 'f1.1', turn: 1, day, kind: 'set_out', actors: ['maege_mormont'], houses: ['mormont'], place: 'mormont', importance: 2, vis: { scope: 'public' }, text: 'x', data });
  const head = (fact) => cardOf(s, { facts: [fact], place: fact.place, houses: fact.houses }).headline;
  for (let i = 0; i < 12; i++) { const h = head({ ...f({ to: 'tully', days: 20, sea: true }), id: `f${i + 1}.${(i * 5) % 11 + 1}` }); assert.match(h, /sails|takes ship|by sea/, h); assert.doesNotMatch(h, /\brides\b/, h); }
  // an old fact without the slot, its party still on a route that has a sea leg
  s.parties.party_maege = { id: 'party_maege', owner: 'mormont', name: "Maege Mormont's party", commander: 'maege_mormont', kind: 'retinue', at: null, pos: [...s.holdings.mormont.pos], men: 40, members: [], route: { sea: [1, 2] } };
  assert.match(head(f({ party: 'party_maege', to: 'tully', days: 20 })), /sails|takes ship|by sea/);
  for (let i = 0; i < 12; i++) assert.doesNotMatch(head({ ...f({ to: 'tully', days: 20 }), id: `f${i + 1}.${(i * 5) % 11 + 1}` }), /sails|by sea|takes ship/, 'a ride on land is still a ride');
});

// ── ST10: a minority the tale starts with is not news in its first week ──
const { regencyTick } = await import('../public/js/shared/regency.js');

test('ST10: the regents of the boys the tale starts with are in place and told of no one, in week one; a regency that begins later is told', () => {
  const s = createInitialState('agot_298', 'stark', { seed: 7 }); s.facts = []; const day = dayNumber(s.meta.date); s.meta.clock = { turn: 1, from: day, to: day };
  s.meta.turn = 1; // (the first turn is played with the counter at 1: advance sets it before the day loop; N-055)
  const boys = Object.values(s.houses).filter((h) => h.lord && s.characters[h.lord] && (s.characters[h.lord].age ?? 30) < 16 && h.id !== 'stark');
  assert.ok(boys.length >= 2, 'the scenario has houses under a boy');
  const r = regencyTick(s, 7);
  assert.deepEqual(r.events.filter((e) => /regency/.test(e.title || '')), [], 'no card'); assert.deepEqual(s.facts.filter((f) => f.kind === 'regency_begun'), []);
  for (const h of boys) assert.ok(h.regent, `${h.name}: a regent rules (${h.regent})`);
  // later in the tale (turn 5) a lord dies and his son is a boy: that is news
  const t = createInitialState('agot_298', 'stark', { seed: 7 }); t.meta.turn = 5; t.facts = []; t.meta.clock = { turn: 6, from: day, to: day };
  const rt = regencyTick(t, 7); assert.ok(t.facts.some((f) => f.kind === 'regency_begun'), 'a regency begun after the first turn is told');
});

// ── ST14: the small news of the week knows where it is ──
const { meanwhileOf } = await import('../public/js/engine/facts/headline.js');

test('ST14: the Meanwhile does not send merchants to Castle Black nor pilgrims and septons to a city of the Bearded Priests', () => {
  const s = createInitialState('agot_298', 'stark', { seed: 7 }); const day = dayNumber(s.meta.date);
  const hap = (tpl, place) => ({ id: `f1.${Math.random()}`, turn: 1, day, kind: 'happening', actors: [], houses: [s.holdings[place].owner], place, importance: 1, vis: { scope: 'public' }, text: 'x', data: { tpl } });
  const say = (...f) => meanwhileOf(s, f.map((x, i) => ({ ...x, id: `f1.${i + 1}` })));
  const wall = say(hap('m_good_harvest', 'nights_watch')); assert.doesNotMatch(wall, /merchants|prices and tolls/i, wall); assert.match(wall, /Castle Black/);
  const norvos = say(hap('p_thoros', 'norvos')); assert.doesNotMatch(norvos, /pilgrims and septons/i, norvos); assert.match(norvos, /Norvos/);
  // where it fits, the old words stand
  const town = say(hap('m_good_harvest', 'winter_town')); assert.match(town, /merchants|prices and tolls|steward|brothers|traders/i, town);
  assert.match(say(hap('p_thoros', 'tully')), /pilgrims and septons/i);
});
