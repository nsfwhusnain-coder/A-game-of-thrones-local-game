// The balance simulation (docs/gdd/06-economy.md §12; quality gate Q10). For the houses the books give us numbers for:
// the projected income at peace against the §5.2 targets (±15 %), 24 moons of the books settled at peace (no coin may go
// negative or NaN, and the Crown must run a deficit), and a war: Stark's levies and banners in the field, and how many
// moons its coin lasts (8–20). No model; the engine's own ledger (shared/economy.js) and its dice.
//   node scripts/balance-sim.js            → a table, exit 1 if the gate fails
//   node scripts/balance-sim.js --json     → the numbers, for the tests
import { createInitialState } from '../public/js/shared/world.js';
import { project, settle } from '../public/js/shared/economy.js';
import { withRng } from '../public/js/engine/rng.js';

// §5.2: income a moon at peace, customary taxes
export const TARGETS = {
  baratheon: 95000, lannister: 34000, tyrell: 48000, hightower: 14000, redwyne: 9000, arryn: 15000, tully: 17000, stark: 12000,
  manderly: 9000, martell: 12000, baratheon_se: 13000, baratheon_ds: 2500, greyjoy: 2600, frey: 4500, bolton: 3000, nights_watch: 700,
};
const GREAT = ['baratheon', 'lannister', 'tyrell', 'arryn', 'tully', 'stark', 'martell', 'baratheon_se', 'greyjoy'];

export function balance({ seed = 298 } = {}) {
  const out = { houses: {}, problems: [] };
  const s = createInitialState('agot_298', 'stark', { seed });
  for (const [id, target] of Object.entries(TARGETS)) {
    const p = project(s, id); if (!p) { out.problems.push(`${id}: no such house`); continue; }
    const off = (p.income - target) / target;
    out.houses[id] = { target, income: p.income, expenses: p.expenses, net: p.net, coin: s.houses[id].figures.treasury.v, off: Math.round(off * 100) };
    if (GREAT.includes(id) && Math.abs(off) > 0.15) out.problems.push(`${id}: income ${p.income} is ${Math.round(off * 100)}% off its target ${target}`);
  }
  // 24 moons at peace
  const peace = createInitialState('agot_298', 'stark', { seed });
  const worth = (st, id) => (Number(st.houses[id].figures.treasury?.v) || 0) - (Number(st.houses[id].figures.debt?.v) || 0);
  const crown0 = worth(peace, 'baratheon');
  withRng(peace, () => { for (let m = 0; m < 24; m++) settle(peace, 30); });
  for (const h of Object.values(peace.houses)) {
    const c = h.figures.treasury?.v;
    if (c != null && (!Number.isFinite(c) || c < 0)) out.problems.push(`${h.id}: coin ${c} after 24 moons of peace`);
  }
  out.crownWorth = { start: crown0, after: worth(peace, 'baratheon') };
  if (out.crownWorth.after >= out.crownWorth.start) out.problems.push('the Crown does not run a deficit');
  for (const id of Object.keys(TARGETS)) if (out.houses[id]) out.houses[id].coin24 = peace.houses[id].figures.treasury.v;
  // a war: Stark's own levies and a quick muster of the banners, all in the field, until the coin is gone
  const war = createInitialState('agot_298', 'stark', { seed });
  const st = war.houses.stark; const levies = Math.round(Number(st.figures.levies.v) * 0.9);
  st.figures.levies.v -= levies;
  war.parties.test_host = { id: 'test_host', kind: 'host', owner: 'stark', name: 'The Host of the North', at: 'moat_cailin', pos: [...war.holdings.moat_cailin.pos], men: levies + 1200, composition: 'Levies of House Stark, with household knights', members: [], morale: 70, supply: 80 };
  // the banners serve the liege after their first forty days (06 §6.2): the sworn lords' quick musters, at his cost
  const sworn = Object.values(war.houses).filter((h) => h.liege === 'stark');
  const bannermen = sworn.reduce((n, h) => { const k = Math.round((Number(h.figures.levies?.v) || 0) * 0.4); h.figures.levies.v -= k; return n + k; }, 0);
  war.parties.test_banners = { id: 'test_banners', kind: 'host', owner: 'stark', name: 'The Banners', at: 'moat_cailin', pos: [...war.holdings.moat_cailin.pos], men: bannermen, composition: 'Levies of the sworn houses', members: [], morale: 70, supply: 80 };
  // the war chest (§6.2, §12): the coin against the campaign's cost a moon; and, played out, how the coin fares
  const cost = project(war, 'stark').upkeep; const chest = Math.round(st.figures.treasury.v / Math.max(1, cost) * 10) / 10;
  const coin0 = st.figures.treasury.v;
  withRng(war, () => { for (let m = 0; m < 12; m++) settle(war, 30); });
  out.war = { men: levies + 1200 + bannermen, cost, chest, after12: st.figures.treasury.v, peaceAfter12: null, coin0 };
  if (chest < 8 || chest > 20) out.problems.push(`Stark's war chest is ${chest} moons (8–20 wanted)`);
  return out;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('balance-sim.js')) {
  const r = balance();
  if (process.argv.includes('--json')) { console.log(JSON.stringify(r, null, 1)); process.exit(r.problems.length ? 1 : 0); }
  const n = (x) => Math.round(x).toLocaleString('en-GB').padStart(10);
  console.log('house           target     income   expenses        net       coin   after 24   off');
  for (const [id, h] of Object.entries(r.houses)) console.log(`${id.padEnd(14)}${n(h.target)}${n(h.income)}${n(h.expenses)}${n(h.net)}${n(h.coin)}${n(h.coin24)}  ${h.off > 0 ? '+' : ''}${h.off}%`);
  console.log(`\nthe Crown's worth: ${n(r.crownWorth.start)} → ${n(r.crownWorth.after)} over 24 moons`);
  console.log(`Stark at war: ${r.war.men.toLocaleString('en-GB')} men in the field, ${r.war.cost.toLocaleString('en-GB')} a moon: a war chest of ${r.war.chest} moons; after a year at war the coin is ${r.war.after12.toLocaleString('en-GB')} (from ${r.war.coin0.toLocaleString('en-GB')})`);
  console.log(r.problems.length ? `\n✖ ${r.problems.join('\n✖ ')}` : '\n✔ the economy is in balance');
  process.exit(r.problems.length ? 1 : 0);
}
