// The Weaver (docs/gdd/04-ai-system.md §10; WP H2): a rare, optional call — at most one in a game month, off by default — that turns something the story has made (a smuggling ring after an embargo, informants after a bribe, a toll
// after outlaws took the roads) into a small custom of one lord's house: a named quantity that grows by a formula and feeds the steward's ledger. The model sees only engine facts, must cite the one that justifies the rule, and writes
// the formula in the sandboxed DSL (shared/rules.js), which the parser and a dry run check BEFORE the rule is accepted; the engine still owns the physics (every kind is capped). It never changes the player's own house, and a bad
// reply costs nothing: the mock and the fallback are the engine's own plain reading of the same facts.
import { obj, str, int, arr, oneOf, hasForeignScript, strings } from '../schema.js';
import { system } from '../context/primer.js';
import { dateStr } from '../../../public/js/shared/world.js';
import { compileRule, RuleError, RULE_KINDS, RULE_FUNCTIONS } from '../../../public/js/shared/rules.js';
import { dayNumber } from '../../../public/js/engine/time.js';

export const INSTRUCTIONS = `YOUR TASK
You are the realm's steward of small customs. The story has made something that will last — a ring of smugglers, a network of informants, a toll on a road — and you may turn ONE such thing into a custom of the house it belongs to, or none at all if nothing here truly lasts.
- cite: the id of the fact that made it (from FACTS THE STORY HAS MADE). - house: one of the houses that fact names.
- name: what the steward writes in the ledger (a few plain words). - kind: what it moves each moon: ${RULE_KINDS.join(', ')}.
- var and start: the quantity the custom keeps (a lowercase word, e.g. runners) and how large it is at the start.
- grow: how that quantity changes each moon, as an expression; formula: what the custom yields or costs each moon, as an expression; when: when it runs (an expression, or empty).
EXPRESSIONS are not JavaScript: numbers, + - * / % **, comparisons, && || ?? ! and ?:, the functions ${RULE_FUNCTIONS.join(', ')}, and these names — months, luck, turn, year, v.<your var>, house.treasury, house.debt, house.food, house.levies, house.gross, house.holdings, house.vassals, house.at_war, house.prosperity, house.unrest. Keep numbers small (a custom is a trickle, not a river).
Example: grow "min(40, v.runners + 3 * months)", formula "v.runners * 12 * luck * months", when "house.treasury > 100".`;

/** The kinds of fact that can leave a lasting custom behind, and the plain custom the engine reads of each (the mock, and the fallback). */
const TEMPLATES = {
  embargo: { name: 'A smuggling ring', kind: 'income', var: 'runners', start: 2, grow: 'min(40, v.runners + 3 * months)', formula: 'v.runners * 12 * luck * months', when: 'house.treasury > 100', note: 'Goods that may not cross the border cross it anyway, and a share comes home.' },
  bribe: { name: 'A network of informants', kind: 'expense', var: 'agents', start: 3, grow: 'min(30, v.agents + 2 * months)', formula: 'v.agents * 9 * months', when: 'house.treasury > 300', note: 'Paid in quiet coin, and worth it to the lord who is told things first.' },
  bribe_refused: { name: 'A network of informants', kind: 'expense', var: 'agents', start: 2, grow: 'min(30, v.agents + 2 * months)', formula: 'v.agents * 9 * months', when: 'house.treasury > 300', note: 'A bribe refused taught the house to buy its news more carefully.' },
  outlaws_rise: { name: 'A toll on the roads', kind: 'income', var: 'tollmen', start: 4, grow: 'min(25, v.tollmen + 1 * months)', formula: 'v.tollmen * 10 * luck * months', when: 'house.unrest > 20', note: 'Where the broken men hold the roads, the lord\'s own men take what the roads will pay.' },
};
export const WEAVE_KINDS = Object.keys(TEMPLATES);
const WINDOW_DAYS = 45; const MAX_OFFER = 6;

/**
 * The facts the Weaver may be asked of: recent facts of a kind that leaves something lasting, of a house that is not the player's. `{ id, kind, text, houses }`, newest first.
 * (The engine's reading of its own log: the model sees nothing else.)
 */
export function weaverFacts(state) {
  const p = state.meta.player; const today = dayNumber(state.meta.date); const out = [];
  for (const f of [...(state.facts || [])].reverse()) {
    if (!TEMPLATES[f.kind] || today - (f.day ?? today) > WINDOW_DAYS) continue;
    const houses = [...new Set((f.houses || []).filter((h) => h !== p && state.houses[h] && state.houses[h].seat))];
    if (!houses.length) continue;
    out.push({ id: f.id, kind: f.kind, text: String(f.title || f.text || f.kind).slice(0, 140), houses });
    if (out.length >= MAX_OFFER) break;
  }
  return out;
}
/** The rule as the engine's `inject_rule` op takes it. */
export const specOf = (r) => ({ house: r.house, name: r.name, kind: r.kind, vars: { [String(r.var || 'n').toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 40) || 'n']: Number(r.start) || 0 }, grow: r.grow || '', formula: r.formula, when: r.when || '', note: r.note || '' });

export default {
  kind: 'weaver',
  // a fixture of the contract test: the world at its start has made no such fact, so one is offered by hand (an embargo of the Riverlands)
  fixtureArgs: () => ({ offer: [{ id: 'f_weave', kind: 'embargo', text: 'The Riverlands close their roads to Lannister goods.', houses: ['tully'] }] }),
  context(state, { offer = null } = {}) {
    const facts = offer || weaverFacts(state);
    if (!facts.length) throw new Error('nothing the story has made would last');
    return {
      state, facts,
      dossier: [
        `DATE: ${dateStr(state.meta.date)}. ${String(state.world?.season || 'summer').replace(/^./, (x) => x.toUpperCase())}.`,
        `FACTS THE STORY HAS MADE (id: kind — what happened — the houses it names):\n${facts.map((f) => `- ${f.id}: ${f.kind} — ${f.text} — ${f.houses.map((h) => `${h} (House ${state.houses[h]?.name})`).join(', ')}`).join('\n')}`,
      ].join('\n'),
    };
  },
  schema(ctx) {
    const houses = [...new Set(ctx.facts.flatMap((f) => f.houses))];
    return obj({ rules: arr(obj({ cite: oneOf(ctx.facts.map((f) => f.id)), house: oneOf(houses), name: str(60), kind: oneOf(RULE_KINDS), var: str(30), start: int(0, 100), grow: str(160), formula: str(160), when: str(120), note: str(160) }), { max: 1 }) });
  },
  prompt: (ctx) => [
    { role: 'system', content: system(ctx.state, INSTRUCTIONS) },
    { role: 'user', content: `${ctx.dossier}\n\nGive one custom, or none.` },
  ],
  check(v, ctx) {
    const out = [];
    for (const r of v.rules) {
      const fact = ctx.facts.find((f) => f.id === r.cite);
      if (!fact) { out.push(`${r.cite} is not a fact offered`); continue; }
      if (!fact.houses.includes(r.house)) out.push(`${r.house} is not a house that ${r.cite} names (${fact.houses.join(', ')})`);
      if (r.house === ctx.state.meta.player) out.push('a custom of the lord\'s own house comes from the lord');
      // the sandbox's own checks, before anything is accepted: the parser, every name in scope, a dry run that gives a number
      try { compileRule(ctx.state, specOf(r)); } catch (e) { out.push(e instanceof RuleError ? `the formula: ${e.message}` : `the rule: ${e.message}`); }
    }
    if (strings(v).some(hasForeignScript)) out.push('a word in a script that is not the realm\'s');
    return out;
  },
  salvage: () => null, // a rule with a wrong word is not mended: it is not made
  mock: (ctx) => valueOf(ctx),
  fallback: (ctx, problems) => ({ ...valueOf(ctx), problems }),
  fingerprint: (ctx) => ctx.facts.map((f) => f.id).join(','),
};

// the engine's own reading: the newest offered fact with a plain custom to leave (no dice, nothing the model could vary)
function valueOf(ctx) {
  for (const f of ctx.facts) {
    const t = TEMPLATES[f.kind]; if (!t) continue;
    const r = { cite: f.id, house: f.houses[0], name: t.name, kind: t.kind, var: t.var, start: t.start, grow: t.grow, formula: t.formula, when: t.when, note: t.note };
    try { compileRule(ctx.state, specOf(r)); return { rules: [r] }; } catch { /* a house the formula cannot read: the next fact */ }
  }
  return { rules: [] };
}
