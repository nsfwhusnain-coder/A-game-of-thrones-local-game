// The realm's minds, week by week (docs/gdd/04-ai-system.md §5; 09-living-world.md §2, §9). The lords who matter most
// this week — by rank, by what has just happened to them, by nearness to the player — decide one thing each: a model's
// mind where one is running (two at a time, the server's two slots), their house's ways where not, and their house's
// ways too for everyone else with something pressing. Every choice is one of the registry's lawful options and is done
// through its verb, as the player's orders are; what the player's house would hear of becomes a card of the chronicle.
// The engine makes sure the realm lives: at least three lords act each week, one of them far from the player (Q4).
import { salientActors } from '../public/js/engine/minds/salience.js';
import { HOLD, optionsFor, remember } from '../public/js/engine/minds/options.js';
import { treeChoice } from '../public/js/engine/minds/houseways.js';
import { perform } from '../public/js/engine/actions/registry.js';
import { asEvent } from '../public/js/engine/facts/log.js';
import { newsOf, knows, eyesOf } from '../public/js/engine/knowledge.js';
import { runCall } from './ai/client.js';
import { intentOf } from './ai/calls/mind.js';

/** Whether news of a fact will reach a house at all (engine/knowledge.js): its own doings, what its eyes see, what
 * the ravens and rumours carry to it — soon or late. */
export const heard = (state, f, house = state.meta.player) => !!newsOf(state, f, house);

/** What a house knows of the last days, for a mind's dossier: the weightiest facts that have reached it by now. */
export function knownTo(state, facts, house, { limit = 8 } = {}) {
  const E = eyesOf(state, house);
  return facts.filter((f) => f.kind !== 'ledger' && knows(state, house, f, undefined, E)).sort((a, b) => b.importance - a.importance || b.day - a.day).slice(0, limit);
}

const tree = (state, x, { eager = false } = {}) => { const t = treeChoice(state, x.id, optionsFor(state, x.id), { eager }); return { x, via: 'tree', verb: t.verb, params: t.params, rule: t.rule }; };

/**
 * One week's minds. opts: { budget (minds with a model: 3 | 6 | 10), provider, cfg, log, known(actor) → facts, memory(actor) → the relevant memory's text }.
 * Returns { cards (for the player's chronicle), record (every mind: who, how, what — the turn record's `minds`) }.
 */
export async function runMinds(state, { budget = 6, provider = 'mock', cfg, log, known = () => [], memory = () => '', replay = null } = {}) {
  const { minds, pressed, all } = salientActors(state, { budget });
  const decided = [];
  const byModel = provider !== 'mock';
  // a week played again (the lord stopped a jump he was watching, 05 §5) decides as it decided the first time: the
  // model is not asked twice, so the days up to the stop come out the same
  const again = new Map((replay || []).filter((r) => ['model', 'replay'].includes(r.via)).map((r) => [r.actor, r]));
  const decide = async (x) => {
    if (again.has(x.id)) { const r = again.get(x.id); return { x, via: r.via, verb: r.verb, params: r.params, ...(r.words ? { words: r.words } : {}) }; }
    if (!byModel) return { ...tree(state, x), via: 'mock' };
    const r = await runCall('mind', state, { actor: x.id, known: known(x), memory: memory(x) }, { provider, cfg, log });
    const it = r.value && r.via !== 'fallback' ? intentOf(r.value, r.ctx) : null;
    if (!it) return { ...tree(state, x), via: 'fallback', problems: r.problems };
    const v = r.value;
    return { x, via: r.via, verb: it.verb, params: it.params, words: { with: v.with, public_face: v.public_face, secret_aim: v.secret_aim, line: v.line } };
  };
  // the model's minds two at a time (llama.cpp's two slots); every choice is made on the world as the week begins
  for (let i = 0; i < minds.length; i += 2) decided.push(...await Promise.all(minds.slice(i, i + 2).map(decide)));
  for (const x of pressed) decided.push(tree(state, x));

  const cards = []; const record = [];
  const act = (d) => {
    let { verb, params } = d; let refused = null;
    if (verb !== HOLD) {
      const before = (state.facts || []).length;
      const source = { type: 'intent', ref: d.x.id, by: d.via };
      let r = perform(state, verb, { actor: d.x.id, house: d.x.house, params, source });
      if (!r.ok) {
        // the world moved under the choice (another lord acted first): the house's ways decide again, on the world as it is
        refused = r.refusal.text; const t = tree(state, d.x); verb = t.verb; params = t.params;
        r = verb === HOLD ? { ok: true } : perform(state, verb, { actor: d.x.id, house: d.x.house, params, source: { ...source, by: 'tree' } });
        if (!r.ok) { verb = HOLD; params = {}; }
      }
      if (verb !== HOLD) remember(state, d.x.house, verb);
      for (const f of (state.facts || []).slice(before)) if (heard(state, f)) cards.push(asEvent(state, f, { mind: d.x.id, ...(d.words?.line ? { line: d.words.line } : {}) }));
    }
    record.push({ actor: d.x.id, house: d.x.house, score: d.x.score, why: d.x.why?.slice(0, 3), via: d.via, verb, params, ...(d.rule ? { rule: d.rule } : {}), ...(refused ? { refused } : {}), ...(d.problems?.length ? { problems: d.problems.slice(0, 3) } : {}), ...(d.words && Object.values(d.words).some(Boolean) ? { words: d.words } : {}) });
  };
  for (const d of decided) act(d);

  // Q4 (09 §9): at least three lords act this week, one of them far from the player's country — the next in salience,
  // by their house's ways, taken at their word rather than their chances
  const region = state.holdings[state.houses[state.meta.player]?.seat]?.region;
  const far = (r) => state.holdings[state.houses[r.house]?.seat]?.region !== region;
  const acted = () => record.filter((r) => r.verb !== HOLD);
  const done = new Set(record.map((r) => r.actor));
  for (const x of all) {
    if (acted().length >= 3 && acted().some(far)) break;
    if (done.has(x.id) || (acted().length >= 3 && !far(x))) continue;
    const d = tree(state, x, { eager: true }); if (d.verb === HOLD) continue;
    done.add(x.id); act({ ...d, via: 'lively' });
  }

  // who decided when (a mind that decided last week is less likely to be asked again this week)
  const turn = state.meta.turn;
  const last = Object.fromEntries(Object.entries(state.minds?.last || {}).filter(([, t]) => turn - t < 6));
  for (const r of record) last[r.actor] = turn;
  state.minds = { ...(state.minds || {}), last };
  return { cards, record };
}
