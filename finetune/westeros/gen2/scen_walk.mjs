// Play games on the mock (no model), turn by turn, with scripted orders composed from each game's own opening world.
// Every other scenario source (narrate, audience, council, director, consolidate) walks these.
import { rng } from './lib.mjs';

export const HOUSES = ['stark', 'lannister', 'greyjoy', 'baratheon', 'arryn', 'tully', 'martell', 'tyrell', 'frey', 'nights_watch', 'manderly', 'bolton', 'mormont',
  'tarly', 'karstark', 'umber', 'mallister', 'redwyne', 'clegane', 'reed', 'baratheon_ds', 'targaryen'];

const plain = (s) => String(s || '').replace(/"[^"]*"/g, '').replace(/\s+/g, ' ').trim();
// "12 8th moon, 298 AC" → { day, month, year }
export const parseDate = (s) => { const m = String(s).match(/(\d+)\D+?(\d+)\D+?moon, (\d+)/); return { day: Number(m[1]), month: Number(m[2]), year: Number(m[3]) }; };

/** A few orders a lord of this house could give, written with the names of THIS world (the mock's rule parser reads them). */
export function scriptOrders(state, house, R, turns) {
  const h = state.houses[house]; const seat = state.holdings[h.seat]; const own = Object.values(state.holdings).filter((x) => x.owner === house);
  const lordId = h.lord; const people = Object.values(state.characters).filter((c) => c.alive && c.house === house && c.id !== lordId && c.sex === 'm' && (c.age || 30) >= 16);
  const away = Object.values(state.characters).filter((c) => c.alive && c.house !== house && c.sex && c.id !== lordId);
  const hosts = Object.values(state.parties || {}).filter((p) => p.owner === house && p.men > 0);
  const others = Object.values(state.houses).filter((x) => x.id !== house && x.rank !== 'company' && state.characters[x.lord]?.alive);
  const nm = (x) => plain(x.name);
  const bank = [];
  if (seat) bank.push(() => `Call the banners to ${nm(seat)}.`, () => `Hold a feast at my seat.`, () => `Hold a tourney at my seat.`);
  if (own.length) bank.push(() => `Raise ${R.pick([500, 1000, 2000, 3000])} men at ${nm(R.pick(own))}.`, () => `Fund ${R.pick(['granaries', 'walls', 'roads', 'a market'])} at ${nm(R.pick(own))}.`,
    () => `Hire ${R.pick([100, 200, 300])} sellswords at ${nm(R.pick(own))}.`);
  if (people.length && own.length) bank.push(() => `Send ${nm(R.pick(people))} to ${nm(R.pick(own))}.`);
  if (people.length) bank.push(() => `Send ${nm(R.pick(people))} to ${nm(R.pick(Object.values(state.holdings)))}.`);
  if (hosts.length) bank.push(() => `March the host to ${nm(R.pick(Object.values(state.holdings)))}.`, () => `Halt the host.`);
  if (away.length) bank.push(() => `Write to ${nm(R.pick(away))}.`, () => `Send a raven to ${nm(R.pick(away))} asking for men.`);
  bank.push(() => `Set the taxes ${R.pick(['low', 'high'])}.`);
  if (others.length) bank.push(() => `Send ${R.pick([500, 1000, 2000])} dragons to ${nm(state.characters[R.pick(others).lord])}.`, () => `Plant spies in the household of House ${nm(R.pick(others))}.`);
  if (others.length && R.chance(0.15)) bank.push(() => `Declare war on House ${nm(R.pick(others))}.`);
  const script = {};
  for (let t = 1; t <= turns; t++) { if (!R.chance(0.6)) continue; script[t] = Array.from({ length: R.pick([1, 1, 2]) }, () => R.pick(bank)()); }
  return script;
}

/**
 * Yields { id, house, seed, turn, t, state } after each week of each game. `state` is a fresh snapshot with the week's facts in
 * hand (as the narrate bench builds it); `t` the turn record the game returned (its narration groups feed the narrator).
 */
export async function* walk(G, { seedBase, games, turns, houses = HOUSES, quiet = 0.25 }) {
  const R = rng(seedBase);
  const { dayNumber } = await G.imp('public/js/engine/time.js');
  for (let gi = 0; gi < games; gi++) {
    const house = houses[gi % houses.length]; const seed = seedBase + gi;
    let id; try { id = G.game.newGame('agot_298', house, { seed }).id; } catch { continue; }
    const script = R.chance(quiet) ? {} : scriptOrders(G.game.loadState(id), house, R, turns);
    for (let turn = 1; turn <= turns; turn++) {
      let t; try { t = (await G.game.advance(id, { span: '7d', orders: (script[turn] || []).map((text) => ({ text })) })).turn; await G.game.settled(id); } catch (e) { break; }
      const state = G.game.loadState(id); state.facts = G.game.readFacts(id, { from: t.turn, to: t.turn });
      state.meta.clock = { turn: t.turn, from: dayNumber(parseDate(t.dateFrom)) + 1, to: dayNumber(parseDate(t.date)) }; state.orders = t.orders || [];
      yield { id: `${house}-${seed}-w${turn}`, gameId: id, house, seed, turn: t.turn, t, state };
    }
  }
}
