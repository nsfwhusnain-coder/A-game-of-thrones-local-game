// Economy verbs (docs/gdd/06-economy.md §9): taxes and dues, works, hiring men and officers, and gold given to win a
// lord's goodwill. Each spends what it should at once and records its fact; the ledger does the rest over the moons.
import { applyChanges, resolvePlaceId, slug, dateStr } from '../../shared/world.js';
import { PROJECT_TEMPLATES, TAX_LEVELS } from '../../shared/economy.js';
import { temperament } from '../../shared/temperament.js';
import { dayNumber } from '../time.js';
import { emit } from '../facts/log.js';
import { LENDERS, lenderName, creditOf, borrow, repay, callDebt, grainPrice } from '../economy/lenders.js';
import { random } from '../rng.js';

const gold = (h) => Number(h?.figures?.treasury?.v) || 0;
const fmtN = (n) => Math.round(n).toLocaleString('en-GB');
const sentence = (t) => t.replace(/^./, (x) => x.toUpperCase()).replace(/([^.!?…])$/, '$1.');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const DUES = { paying: 'pays its dues to', late: 'is late with its dues to', withholding: 'withholds its dues from' };
export const OFFICES = ['spymaster', 'steward', 'maester', 'captain', 'master_at_arms', 'knight', 'envoy', 'commander'];

const template = (key) => PROJECT_TEMPLATES.find((x) => x.key === key || slug(x.name) === slug(key || ''));
const worksSite = (state, house, holding) => { const at = resolvePlaceId(holding); return state.holdings[at]?.owner === house ? at : state.houses[house].seat; };

/** Begin one of the works a house can fund (economy.js PROJECT_TEMPLATES) at one of its holdings — once. */
export function startWorks(state, key, holding, { house = state.meta.player, cause } = {}) {
  const me = state.houses[house]; const t = template(key); if (!t) throw new Error('no such works');
  const hold = worksSite(state, house, holding);
  if (gold(me) < t.cost * 0.25) throw new Error(`The treasury cannot even fund the first stage of ${t.name} (needs ~${Math.round(t.cost * 0.25)} gd up front).`);
  const name = `${t.name} at ${state.holdings[hold].name}`;
  const r = applyChanges(state, [{ op: 'project', house, name, template: t.key, cost: t.cost, months: t.months, holding: hold, effect: t.effect }], { cause });
  if (r.rejected.length) throw new Error(r.rejected[0].reason.replace(/^./, (x) => x.toUpperCase()) + '.');
  return { name, cost: t.cost, months: t.months };
}

/** A gift: its weight is what it means to them — a thousand dragons is a fortune to a hedge lord and nothing to Tywin. */
export function giveGift(state, { house = state.meta.player, to, gold: amount, cause }) {
  const me = state.houses[house]; const n = Math.round(Number(amount) || 0);
  const c = state.characters[to]; const them = c ? c.house : to; const h = state.houses[them];
  const lord = c || state.characters[h.lord];
  const T = lord ? temperament(lord) : null;
  const weight = n / Math.max(800, gold(h) * 0.12);
  const warm = clamp(Math.round(10 * Math.sqrt(weight) * (T?.sway.gold ? 1.6 : 1) * (T && T.pride > 0.85 && weight < 0.3 ? 0.4 : 1)), 1, 30);
  applyChanges(state, [{ op: 'figure', house, field: 'treasury', delta: -n, source: 'A gift' }]);
  const ch = [{ op: 'figure', house: them, field: 'treasury', delta: n, source: `A gift from House ${me.name}` }, { op: 'relation', a: house, b: them, delta: warm, reason: `a gift of ${n} dragons` }];
  if (lord) ch.push({ op: 'character', id: lord.id, opinion: clamp((lord.opinion || 0) + warm, -100, 100), note: `Received a gift of ${n} dragons from House ${me.name}.` });
  applyChanges(state, ch, { source: 'Your gift', cause });
  emit(state, 'gift', { actors: [me.lord, lord?.id], houses: [house, them], data: { gold: n, warmth: warm }, cause, text: `House ${me.name} sends ${n.toLocaleString('en-GB')} gold dragons as a gift to ${lord ? lord.name : `House ${h.name}`}.` });
  if (lord && state.moods?.[lord.id]) state.moods[lord.id].trust = clamp(state.moods[lord.id].trust + warm, 0, 100);
  if (state.plotting?.[them]) state.plotting[them].pressure = Math.max(0, state.plotting[them].pressure - warm * 1.5); // gold soothes a wavering oath
  const read = warm >= 18 ? 'is much pleased' : warm >= 8 ? 'is pleased' : T?.pride > 0.85 ? 'accepts it coolly; it is small to them' : 'accepts it';
  return { text: `Send ${n.toLocaleString('en-US')} gold dragons as a gift to ${lord ? lord.name : 'House ' + h.name}.`, note: `[Already done: the gold is sent; relations +${warm}. ${lord?.name || 'They'} ${read}. Narrate the gift's arrival.]`, summary: `${lord ? lord.name : 'House ' + h.name} ${read} (relations +${warm}).` };
}

/** Men-at-arms or sellswords, or an officer, hired through the one place hiring is done (the `recruit`/`hire` ops). */
function hire(state, i, change) {
  const r = applyChanges(state, [{ ...change, house: i.house }], { source: 'Your orders', cause: i.source });
  if (!r.applied.length) throw new Error(r.rejected[0]?.reason || 'no one could be hired');
  return { text: r.applied[0].text };
}

export const ECONOMY = [
  {
    id: 'set_tax', family: 'economy', label: 'Set the taxes',
    params: { level: `enum:${Object.keys(TAX_LEVELS).join('|')}` },
    legal: (state, i) => (TAX_LEVELS[i.params.level] ? null : { code: 'level', text: 'Taxes are low, normal, high or crushing.' }),
    start: (state, i) => { applyChanges(state, [{ op: 'tax', house: i.house, level: i.params.level }], { cause: i.source }); return { label: TAX_LEVELS[i.params.level].label }; },
    receipt: (state, i, d) => [{ ok: true, text: `${d.label} taxes are proclaimed across your lands and on your vassals' dues.` }],
    said: (state, i, d) => ({ status: 'done', text: `Proclaim ${d.label.toLowerCase()} taxes across my lands and on my vassals' dues.` }),
    facts: ['tax_changed'], mind: { allowed: true },
  },
  {
    id: 'set_dues', family: 'economy', label: 'Pay, delay or withhold dues to the liege',
    params: { status: 'enum:paying|late|withholding' },
    who: (state, i) => !!state.houses[i.house]?.liege,
    legal: (state, i) => (!state.houses[i.house]?.liege ? { code: 'no_liege', text: 'You owe dues to no one.' } : !DUES[i.params.status] ? { code: 'status', text: 'Dues are paid, delayed, or withheld.' } : null),
    start: (state, i) => {
      const me = state.houses[i.house]; const lg = state.houses[me.liege]; const was = me.obligations?.tribute;
      me.obligations = { ...(me.obligations || {}), tribute: i.params.status };
      if (was !== i.params.status) emit(state, 'tax_changed', { actors: [me.lord, lg.lord], houses: [i.house, lg.id], data: { dues: i.params.status, was: was || null, liege: lg.id }, cause: i.source, text: `House ${me.name} ${DUES[i.params.status]} House ${lg.name}.` });
      return { liege: lg.id };
    },
    receipt: (state, i, d) => [{ ok: true, text: `House ${state.houses[i.house].name} ${DUES[i.params.status]} House ${state.houses[d.liege].name}.` }],
    said: (state, i, d) => { const lg = state.houses[d.liege]; return { status: 'done', text: i.params.status === 'paying' ? `Pay my dues to House ${lg.name} in full.` : i.params.status === 'late' ? `Delay my dues to House ${lg.name}; send excuses and small sums.` : `Withhold all dues from House ${lg.name}.` }; },
    facts: ['tax_changed'], mind: { allowed: true },
  },
  {
    id: 'fund_works', family: 'economy', label: 'Fund works',
    params: { template: `enum:${PROJECT_TEMPLATES.map((t) => t.key).join('|')}`, holding: 'holding:own?' },
    legal: (state, i) => {
      const t = template(i.params.template); if (!t) return { code: 'no_works', text: 'No mason knows how to build that.' };
      if (gold(state.houses[i.house]) < t.cost * 0.25) return { code: 'gold', text: `The treasury cannot even fund the first stage of ${t.name} (needs ~${fmtN(t.cost * 0.25)} gd up front).` };
      const hold = worksSite(state, i.house, i.params.holding);
      const twin = (state.projects || []).find((x) => x.house === i.house && x.status === 'active' && x.holding === hold && x.template === t.key);
      return twin ? { code: 'twin', text: `${twin.name} is already under way.` } : null;
    },
    cost: (state, i) => { const t = template(i.params.template); return t ? { gold: t.cost, days: Math.round(t.months * 30) } : null; },
    start: (state, i) => startWorks(state, i.params.template, i.params.holding, { house: i.house, cause: i.source }),
    receipt: (state, i, d) => [{ ok: true, text: `Work begins: ${d.name} (${fmtN(d.cost)} dragons over ${d.months} moons).`, eta: Math.round(d.months * 30) }],
    said: (state, i, d) => ({ status: 'done', text: `Fund works: ${d.name} (${d.cost} gold dragons over ${d.months} moons).` }),
    facts: ['works_begun'], mind: { allowed: true },
  },
  {
    id: 'cancel_works', family: 'economy', label: 'Stop works',
    params: { project: 'project:own' },
    legal: (state, i) => ((state.projects || []).some((x) => x.id === i.params.project && x.house === i.house && x.status === 'active') ? null : { code: 'no_works', text: 'There are no such works of yours under way.' }),
    start: (state, i) => { const pr = state.projects.find((x) => x.id === i.params.project); pr.status = 'cancelled'; return { name: pr.name }; },
    receipt: (state, i, d) => [{ ok: true, text: `${d.name} is stopped; what was paid is spent.` }],
    facts: [], mind: { allowed: true },
  },
  {
    id: 'hire_men', family: 'economy', label: 'Hire men-at-arms or sellswords',
    params: { at: 'place', men: 'number', kind: 'enum:men-at-arms|sellswords' },
    legal: (state, i) => (!(Number(i.params.men) >= 10) ? { code: 'too_few', text: 'Hire at least ten men, or none.' } : null),
    start: (state, i) => hire(state, i, { op: 'recruit', at: i.params.at, men: Number(i.params.men), kind: i.params.kind }),
    receipt: (state, i, d) => [{ ok: /all that could be found/.test(d.text) ? 'warn' : true, text: sentence(d.text) }],
    facts: ['men_hired', 'sellswords_hired'], mind: { allowed: true },
  },
  {
    id: 'hire_officer', family: 'economy', label: 'Take an officer into service',
    params: { role: `enum:${OFFICES.join('|')}`, at: 'place?' },
    legal: (state, i) => (!i.params.role ? { code: 'office', text: 'Which office?' } : null),
    start: (state, i) => hire(state, i, { op: 'hire', role: i.params.role, at: i.params.at }),
    receipt: (state, i, d) => [{ ok: true, text: sentence(d.text) }],
    facts: ['office_granted'], mind: { allowed: true },
  },
  {
    id: 'send_gift', family: 'economy', label: 'Send a gift of gold',
    params: { to: 'character|house', gold: 'number' },
    legal: (state, i) => {
      const n = Math.round(Number(i.params.gold) || 0); const me = state.houses[i.house];
      if (n < 50) return { code: 'insult', text: 'A gift of fewer than fifty dragons would be an insult.' };
      if (n > gold(me)) return { code: 'gold', text: `Your treasury holds only ${fmtN(gold(me))} dragons.` };
      const c = state.characters[i.params.to]; const them = c ? c.house : i.params.to;
      if (!state.houses[them] || them === i.house) return { code: 'no_one', text: 'No one to send it to.' };
      return null;
    },
    cost: (state, i) => ({ gold: Math.round(Number(i.params.gold) || 0) }),
    start: (state, i) => giveGift(state, { house: i.house, to: i.params.to, gold: i.params.gold, cause: i.source }),
    receipt: (state, i, d) => [{ ok: true, text: d.summary }],
    said: (state, i, d) => ({ status: 'done', text: d.text, note: d.note }),
    facts: ['gift'], mind: { allowed: true },
  },
  {
    // 06 §7: coin now, interest each moon, the whole on its day — as much as the lender thinks you good for
    id: 'borrow', family: 'economy', label: 'Borrow from a lender',
    params: { lender: `enum:${Object.keys(LENDERS).join('|')}|house`, gold: 'number', months: 'number?' },
    legal: (state, i) => {
      const n = Math.round(Number(i.params.gold) || 0); const L = i.params.lender;
      if (!LENDERS[L] && !state.houses[L]) return { code: 'lender', text: 'No such lender: the Iron Bank, the Faith, the Tyroshi, the Bank of Oldtown — or a great house.' };
      if (L === i.house) return { code: 'lender', text: 'A house cannot borrow from itself.' };
      if (n < 100) return { code: 'too_little', text: 'No lender troubles with less than a hundred dragons.' };
      if (state.houses[L]) return gold(state.houses[L]) < n ? { code: 'cannot', text: `House ${state.houses[L].name} has not ${fmtN(n)} dragons to lend.` } : null;
      const c = creditOf(state, i.house, L);
      if (c.refuses) return { code: 'refused', text: 'The Iron Bank will lend nothing more to your realm: it has not been repaid.' };
      if (!c.reach) return { code: 'reach', text: `${lenderName(state, L).replace(/^./, (x) => x.toUpperCase())} lends only to the Reach and the Crownlands.` };
      if (n > c.limit) return { code: 'credit', text: `${lenderName(state, L).replace(/^./, (x) => x.toUpperCase())} would lend you no more than ~${fmtN(c.limit)} dragons.` };
      return null;
    },
    cost: (state, i) => ({ gold: -Math.round(Number(i.params.gold) || 0) }),
    start: (state, i) => borrow(state, { house: i.house, lender: i.params.lender, amount: i.params.gold, months: Number(i.params.months) || 24, cause: i.source }),
    receipt: (state, i, d) => [{ ok: true, text: `${fmtN(d.loan.amount)} dragons borrowed from ${lenderName(state, d.loan.lender)} at ${Math.round(d.rate * 100)} in the hundred a year; due in ${Math.round((d.loan.due - d.loan.since) / 30)} moons.` }],
    facts: ['loan_taken'], mind: { allowed: false },
  },
  {
    id: 'repay', family: 'economy', label: 'Repay a lender',
    params: { lender: 'text', gold: 'number?' },
    legal: (state, i) => {
      const owed = (state.economy?.loans || []).filter((l) => l.debtor === i.house && l.lender === i.params.lender && l.amount > 0).reduce((n, l) => n + l.amount, 0);
      if (!owed) return { code: 'no_debt', text: `You owe ${lenderName(state, i.params.lender)} nothing.` };
      if (gold(state.houses[i.house]) < 1) return { code: 'gold', text: 'The treasury is empty.' };
      return null;
    },
    start: (state, i) => repay(state, { house: i.house, lender: i.params.lender, amount: i.params.gold, cause: i.source }),
    receipt: (state, i, d) => [{ ok: d.still ? 'warn' : true, text: `${fmtN(d.paid)} dragons repaid to ${lenderName(state, i.params.lender)}${d.still ? `; ${fmtN(d.still)} is still owed` : ' — the debt is cleared'}.` }],
    facts: ['loan_repaid'], mind: { allowed: true },
  },
  {
    // Tywin's lever on the Crown (06 §7): what is owed, to be repaid within the moons given, or a default
    id: 'call_debt', family: 'economy', label: 'Call in a debt',
    params: { debtor: 'house', months: 'number?' },
    legal: (state, i) => ((state.economy?.loans || []).some((l) => l.lender === i.house && l.debtor === i.params.debtor && l.amount > 0 && !l.called) ? null : { code: 'no_debt', text: `House ${state.houses[i.params.debtor]?.name || '?'} owes you nothing to call in.` }),
    start: (state, i) => callDebt(state, { lender: i.house, debtor: i.params.debtor, months: Number(i.params.months) || 3, cause: i.source }),
    receipt: (state, i, d) => [{ ok: true, text: `House ${state.houses[i.params.debtor].name} must repay ${fmtN(d.owed)} dragons within ${Number(i.params.months) || 3} moons, or default.` }],
    facts: ['debt_called'], mind: { allowed: true },
  },
  {
    // 06 §6.3, §10: grain for the granaries, at the price the season and the wars set in your country
    id: 'buy_grain', family: 'economy', label: 'Buy grain',
    params: { moons: 'number' },
    legal: (state, i) => {
      const me = state.houses[i.house]; const n = Number(i.params.moons) || 0;
      if (n < 0.5) return { code: 'too_little', text: 'Buy at least half a moon of grain.' };
      if (/besieg/.test(state.holdings[me.seat]?.status || '')) return { code: 'siege', text: 'No merchant reaches a besieged seat.' };
      if ((state.pacts || []).some((p) => p.type === 'embargo' && p.status === 'active' && [p.a, p.b].includes(i.house)) && n > 2) return { code: 'embargo', text: 'Under embargo, the merchants will sell no more than two moons of grain.' };
      const cost = grainCost(state, i.house, n);
      if (cost > gold(me)) return { code: 'gold', text: `${n} moons of grain cost ~${fmtN(cost)} dragons; the treasury holds ${fmtN(gold(me))}.` };
      return null;
    },
    cost: (state, i) => ({ gold: grainCost(state, i.house, Number(i.params.moons) || 0) }),
    start: (state, i) => {
      const me = state.houses[i.house]; const n = Math.round((Number(i.params.moons) || 0) * 10) / 10; const cost = grainCost(state, i.house, n);
      applyChanges(state, [{ op: 'figure', house: i.house, field: 'treasury', delta: -cost, source: 'Grain bought' }]);
      me.figures.food = { ...(me.figures.food || {}), v: Math.round(((Number(me.figures.food?.v) || 0) + n) * 10) / 10 };
      emit(state, 'grain_bought', { actors: [me.lord], houses: [i.house], data: { moons: n, cost }, cause: i.source, text: `House ${me.name} buys ${n} moons of grain for ${fmtN(cost)} dragons.` });
      return { moons: n, cost };
    },
    receipt: (state, i, d) => [{ ok: true, text: `${d.moons} moons of grain bought for ${fmtN(d.cost)} dragons; the granaries hold more.` }],
    facts: ['grain_bought'], mind: { allowed: true },
  },
  {
    // 06 §9: gold for a favour, weighed by the one who takes it (their love of gold, their honesty) and by the sum
    id: 'bribe', family: 'intrigue', label: 'Bribe someone',
    params: { to: 'character', gold: 'number', aim: 'text?' },
    legal: (state, i) => {
      const c = state.characters[i.params.to]; const n = Math.round(Number(i.params.gold) || 0);
      if (!c?.alive || c.house === i.house) return { code: 'no_one', text: 'There is no one of another house by that name to bribe.' };
      if (n < 5) return { code: 'too_little', text: 'Not even a gaoler takes less than five dragons.' };
      if (n > gold(state.houses[i.house])) return { code: 'gold', text: `Your treasury holds only ${fmtN(gold(state.houses[i.house]))} dragons.` };
      return null;
    },
    cost: (state, i) => ({ gold: Math.round(Number(i.params.gold) || 0) }),
    start: (state, i) => bribe(state, i),
    receipt: (state, i, d) => [{ ok: d.took ? true : 'warn', text: d.text }],
    facts: ['bribe', 'bribe_refused'], mind: { allowed: false },
  },
  {
    // 06 §8: no trade with a house's lands or ships, both ways; lifted as easily
    id: 'embargo', family: 'economy', label: 'Embargo a house',
    params: { house: 'house:other', lift: 'text?' },
    legal: (state, i) => {
      const t = state.houses[i.params.house]; if (!t || t.id === i.house) return { code: 'no_target', text: 'Embargo whom?' };
      const on = (state.pacts || []).some((p) => p.type === 'embargo' && p.status === 'active' && [p.a, p.b].includes(i.house) && [p.a, p.b].includes(t.id));
      if (i.params.lift && !on) return { code: 'none', text: `There is no embargo on House ${t.name} to lift.` };
      if (!i.params.lift && on) return { code: 'already', text: `House ${t.name} is already under your embargo.` };
      return null;
    },
    start: (state, i) => {
      const t = state.houses[i.params.house]; const me = state.houses[i.house];
      if (i.params.lift) { for (const p of state.pacts) if (p.type === 'embargo' && p.status === 'active' && [p.a, p.b].includes(i.house) && [p.a, p.b].includes(t.id)) p.status = 'ended'; }
      else state.pacts.push({ id: `embargo_${i.house}_${t.id}_${state.meta.turn}`, type: 'embargo', a: i.house, b: t.id, terms: `No trade between House ${me.name} and House ${t.name}`, status: 'active', since: dateStr(state.meta.date) });
      emit(state, 'embargo', { actors: [me.lord], houses: [i.house, t.id], data: { lifted: !!i.params.lift }, cause: i.source, text: i.params.lift ? `House ${me.name} lifts its embargo on House ${t.name}.` : `House ${me.name} forbids all trade with House ${t.name}.` });
      return { name: t.name, lifted: !!i.params.lift };
    },
    receipt: (state, i, d) => [{ ok: true, text: d.lifted ? `The embargo on House ${d.name} is lifted; the merchants may go again.` : `No merchant of yours trades with House ${d.name}, nor theirs with you; both of you lose by it.` }],
    facts: ['embargo'], mind: { allowed: true },
  },
];

/** What n moons of grain cost a house: its people's needs (a man-moon for every three souls) at its country's price. */
export function grainCost(state, house, moons) {
  const me = state.houses[house]; const hs = Object.values(state.holdings).filter((h) => h.owner === house);
  const people = hs.reduce((n, h) => n + (h.population || 0), 0);
  return Math.round(moons * people / 3 * grainPrice(state, state.holdings[me.seat]?.region || hs[0]?.region));
}

/** A bribe: the one bribed weighs the sum against their station and their honesty — and may take offence, and tell. */
function bribe(state, i) {
  const me = state.houses[i.house]; const c = state.characters[i.params.to]; const h = state.houses[c.house];
  const n = Math.round(Number(i.params.gold) || 0); const T = temperament(c);
  // what would tempt them: a gaoler five dragons, a steward a few thousand, a great lord tens of thousands (06 §6.4)
  const worth = h?.lord === c.id ? ({ crown: 60000, paramount: 30000, major: 5000, minor: 1500 }[h.rank] || 1000) : (c.roles || []).some((r) => ['steward', 'captain', 'master_at_arms', 'spymaster'].includes(r)) ? 2000 : 300;
  const greed = T?.sway?.gold ? 1.6 : 1; const honest = T ? 1 - 0.7 * (T.honesty ?? 0.5) : 0.6;
  const p = clamp(Math.sqrt(n / worth) * 0.6 * greed * honest, 0.02, 0.95);
  const took = random() < p;
  // the gold goes only if it is taken (a refused purse comes home)
  if (took) applyChanges(state, [{ op: 'figure', house: i.house, field: 'treasury', delta: -n, source: 'A bribe' }]);
  if (took) {
    applyChanges(state, [{ op: 'character', id: c.id, opinion: clamp((c.opinion || 0) + 20, -100, 100), note: `Took ${n} dragons from House ${me.name}${i.params.aim ? ` to ${i.params.aim}` : ''}.` }], { cause: i.source });
    // what the gold bought is the engine's to remember: a castellan bought by a besieger opens a postern (siege.js)
    c.bought = { by: i.house, aim: i.params.aim || '', day: dayNumber(state.meta.date) };
    emit(state, 'bribe', { actors: [me.lord, c.id], houses: [i.house, c.house], vis: { scope: 'houses', houses: [i.house] }, data: { gold: n, aim: i.params.aim || '' }, cause: i.source, text: `${c.name} takes ${fmtN(n)} dragons from House ${me.name}${i.params.aim ? `, to ${i.params.aim}` : ''}.` });
    return { took: true, text: `${c.name} takes the gold${i.params.aim ? ` — to ${i.params.aim}` : ''}; what it buys is theirs to give.` };
  }
  applyChanges(state, [{ op: 'relation', a: i.house, b: c.house, delta: -8, reason: 'a bribe refused' }], { cause: i.source });
  emit(state, 'bribe_refused', { actors: [me.lord, c.id], houses: [i.house, c.house], data: { gold: n }, cause: i.source, text: `${c.name} refuses the gold of House ${me.name}, and does not keep quiet about it.` });
  return { took: false, text: `${c.name} refuses the gold, and takes offence; House ${h?.name} will hear of it.` };
}
