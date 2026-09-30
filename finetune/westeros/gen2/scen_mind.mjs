// Mind scenarios for the data generator. Two sources, both the game's own machinery:
//   suiteLike(): fresh situations of the nine types in bench/suites/mind (called, kin, peace, poor, prisoners, siege, threat,
//                war, winter), with other actors, houses, places and numbers. The suite's own (type, actor) pairs are HELD OUT.
//                A model answer is kept only if its verb is one the game's suite counts as in character for that type (CORE).
//   natural():   the weeks of games played on the mock; the lords the game's salience picks to decide (the real distribution of
//                mind calls), with the news / memory the live game would give them. Kept only if the verb agrees with the game's
//                rule-based house-ways pick (which is what the prompt's own hint says, and scores 94 % in character on the suite).
import fs from 'node:fs';
import path from 'node:path';
import { rng } from './lib.mjs';

/** In character for each situation type: the verbs the suite accepts for (nearly) every lord in it. */
export const CORE = {
  called: ['answer_call', 'raise_levies'],
  kin: ['raise_levies', 'declare_war', 'march_host', 'call_banners'],
  peace: ['hold_feast', 'hold_tourney', 'fund_works', 'wait', 'send_gift', 'send_person', 'hire_men', 'set_tax'],
  poor: ['set_tax', 'wait', 'set_dues', 'disband_host'],
  prisoners: ['judge_prisoner', 'wait'],
  siege: ['march_host', 'attack_host', 'raise_levies', 'call_banners'],
  threat: ['raise_levies', 'call_banners'],
  war: ['march_host', 'attack_host', 'call_banners', 'raise_levies'],
  winter: ['fund_works', 'wait', 'set_tax', 'hold_feast', 'send_gift'],
};
const PLAYERS = ['stark', 'lannister', 'baratheon', 'tully', 'greyjoy', 'arryn', 'martell', 'tyrell', 'frey', 'nights_watch'];

function heldOut(repo) {
  const dir = path.join(repo, 'bench', 'suites', 'mind'); const set = new Set();
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) for (const it of JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).items) set.add(`${f.replace('.json', '')}|${it.actor}`);
  return set;
}

export async function* suiteLike(G, { seedBase = 20000, n = 400 } = {}) {
  const R = rng(seedBase); const held = heldOut(G.repo); const cats = Object.keys(CORE);
  let made = 0;
  for (let guard = 0; made < n && guard < n * 8; guard++) {
    const cat = cats[guard % cats.length]; const player = R.pick(PLAYERS);
    let state; try { state = G.W.createInitialState('agot_298', player, { seed: seedBase + guard }); } catch { continue; }
    const houses = Object.values(state.houses).filter((h) => h.rank !== 'company' && state.characters[h.lord]?.alive && state.holdings[h.seat]);
    const A = R.pick(houses); const actor = A.lord; if (held.has(`${cat}|${actor}`)) continue;
    const seat = A.seat; const B = R.pick(houses.filter((h) => h.id !== A.id));
    const own = Object.values(state.holdings).filter((h) => h.owner === A.id && h.id !== seat);
    const plain = (s) => String(s).replace(/"[^"]*"/g, '').replace(/\s+/g, ' ').trim();
    let ops = []; let actorId = actor;
    if (cat === 'called') {
      const callers = houses.filter((h) => houses.some((v) => v.liege === h.id)); if (!callers.length) continue;
      const C = R.pick(callers); const V = R.pick(houses.filter((v) => v.liege === C.id));
      ops = [{ op: 'obligation', house: V.id, levies: 'called', muster: C.id }];
      state.meta.player = C.id; // the caller is the player, as in the suite
      actorId = V.lord; if (held.has(`called|${actorId}`)) continue;
    } else if (cat === 'kin') {
      const lord = state.characters[actor]; const kin = Object.values(state.characters).filter((c) => c.alive && c.house === A.id && c.id !== actor && (c.father === actor || c.mother === actor || (lord.father && c.father === lord.father)));
      if (!kin.length) continue; const k = R.pick(kin);
      ops = [{ op: 'character', id: k.id, status: 'imprisoned', loc: B.seat }, { op: 'relation', a: A.id, b: B.id, value: -R.pick([35, 45, 55, 65]) }];
    } else if (cat === 'peace') ops = [{ op: 'figure', house: A.id, field: 'treasury', value: R.pick([30000, 45000, 60000, 90000, 120000]) }];
    else if (cat === 'poor') ops = [{ op: 'figure', house: A.id, field: 'treasury', value: R.pick([400, 900, 1500, 2500, 3500]) }];
    else if (cat === 'winter') ops = [{ op: 'season', season: R.pick(['autumn', 'autumn', 'winter']) }, { op: 'figure', house: A.id, field: 'treasury', value: R.pick([15000, 25000, 40000, 70000]) }];
    else if (cat === 'prisoners') {
      const pool = Object.values(state.characters).filter((c) => c.alive && c.house && c.house !== A.id && !/imprisoned|captive|hostage/.test(c.status || '') && state.houses[c.house]?.rank !== 'company');
      if (!pool.length) continue; const p = R.pick(pool);
      ops = [{ op: 'character', id: p.id, status: 'imprisoned', loc: seat }];
    } else {
      const war = { op: 'war', status: 'start', name: `War of ${A.id} and ${B.id}`, attackers: [B.id], defenders: [A.id] };
      const home = own.length ? R.pick(own).id : seat;
      if (cat === 'siege') ops = [war, { op: 'army_create', id: 'besiegers', owner: B.id, name: `The Host of House ${plain(B.name)}`, at: seat, men: R.pick([3000, 5000, 7000]) }, { op: 'holding', id: seat, status: 'besieged' }, { op: 'army_create', id: `${A.id}_bench_host`, owner: A.id, name: `The Host of House ${plain(A.name)}`, at: home, men: R.pick([3000, 6000, 9000]) }];
      else if (cat === 'threat') ops = [war, { op: 'army_create', id: 'raiders', owner: B.id, name: `The Host of House ${plain(B.name)}`, at: seat, men: R.pick([2000, 4000, 6000, 8000]) }];
      else ops = [war, { op: 'army_create', id: `${A.id}_bench_host`, owner: A.id, name: `The Host of House ${plain(A.name)}`, at: home, men: R.pick([3000, 6000, 9000, 12000]) }];
    }
    const sc = await build(G, state, ops, actorId, cat, guard, R); if (sc) { made++; yield sc; }
  }
}

async function build(G, state, ops, actor, cat, guard, R) {
  try {
    G.withRng(state, () => { const r = G.W.applyChanges(state, ops, { source: 'gen' }); if (r.rejected?.length) throw new Error(r.rejected.map((x) => x.reason).join('; ')); });
  } catch { return null; }
  state.facts = [];
  const core = CORE[cat];
  return { id: `mind-${cat}-${guard}-${actor}`, kind: 'mind', state, args: { actor, known: [], memory: '' }, meta: { source: 'suite-like', category: cat, actor },
    accept: (v) => (core.includes(v.verb) ? null : `verb ${v.verb} is not in character for a "${cat}" situation (${core.join('|')})`) };
}

const HOUSES = ['stark', 'lannister', 'greyjoy', 'baratheon', 'arryn', 'tully', 'martell', 'tyrell', 'frey', 'nights_watch', 'manderly', 'bolton', 'mormont', 'tarly', 'karstark', 'umber', 'mallister', 'redwyne', 'clegane', 'reed'];

/** Weeks of mock-played games; the lords the game's salience picks each week, with the news or memory the live game gives them. */
export async function* natural(G, { seedBase = 30000, games = 20, turns = 8, perTurn = 3 } = {}) {
  const R = rng(seedBase);
  const { salientActors } = await G.imp('public/js/engine/minds/salience.js'); const { knownTo } = await G.imp('server/minds.js');
  const { relevantMemory } = await G.imp('server/ai/context/memory.js'); const { placeOf } = await G.imp('public/js/engine/parties.js');
  for (let gi = 0; gi < games; gi++) {
    const house = HOUSES[gi % HOUSES.length]; const seed = seedBase + gi;
    let id; try { id = G.game.newGame('agot_298', house, { seed }).id; } catch { continue; }
    for (let turn = 1; turn <= turns; turn++) {
      let t; try { t = (await G.game.advance(id, { span: '7d', orders: [] })).turn; await G.game.settled(id); } catch { break; }
      const state = G.game.loadState(id); state.facts = G.game.readFacts(id, { from: t.turn, to: t.turn });
      const recent = G.game.readFacts(id, { from: t.turn - 2 });
      let minds = []; try { ({ minds } = salientActors(state, { budget: 6 })); } catch { continue; }
      for (const x of R.shuffle(minds).slice(0, perTurn)) {
        const c = state.characters[x.id]; if (!c) continue;
        const known = knownTo(state, recent, x.house, { limit: 6 });
        const memory = R.chance(0.5) ? relevantMemory(state, { facts: recent, notes: [], house: x.house, actors: [x.id], houses: [x.house], places: [placeOf(state, c)].filter(Boolean), words: '' }).text : '';
        yield { id: `mind-nat-${seed}-${turn}-${x.id}`, kind: 'mind', state, args: { actor: x.id, known, memory }, meta: { source: 'natural', house, seed, turn, actor: x.id },
          accept: (v, ctx) => (v.verb === ctx.tree?.verb ? null : `verb ${v.verb} differs from the house's way (${ctx.tree?.verb})`) };
      }
    }
  }
}
