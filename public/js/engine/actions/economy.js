// Economy verbs (docs/gdd/06-economy.md §9): taxes and dues, works, hiring men and officers, and gold given to win a
// lord's goodwill. Each spends what it should at once and records its fact; the ledger does the rest over the moons.
import { applyChanges, resolvePlaceId, slug } from '../../shared/world.js';
import { PROJECT_TEMPLATES, TAX_LEVELS } from '../../shared/economy.js';
import { temperament } from '../../shared/temperament.js';
import { emit } from '../facts/log.js';

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
];
