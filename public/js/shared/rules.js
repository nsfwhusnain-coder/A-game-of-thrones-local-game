// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The Weaver's sandbox — rules the model invents, that the engine can actually run.
//
// The point of `inject_rule` is that the player should not be confined to the ops the developer
// thought of. "Fund a network of informants in the Riverlands, paid in stolen Lannister gold" is not
// a `project`, not a `figure`, not a `pact` — it is a NEW MECHANIC, and the model should be able to
// write it: a named quantity that lives in the save, grows or decays by a formula, feeds the ledger,
// and shows up as its own line in the steward's accounts.
//
// ── Why this is not eval() ──────────────────────────────────────────────────────────────────────
// The obvious implementation is `new Function(llmString)`. Do not do it. That is arbitrary remote
// code execution in the player's Node process, triggered by text a 4B model hallucinated at
// temperature 0.85 — with the player's filesystem, their saves, and their network behind it. It also
// cannot be serialised safely, migrated, rate-limited, or reasoned about.
//
// Instead this is a real (tiny) language: tokenizer → Pratt parser → AST → interpreter, with
//   · no property access except dotted paths resolved against an explicit scope object
//   · no assignment, no loops, no function definitions, no `this`, no globals, no prototypes
//   · a whitelist of pure maths functions
//   · a step budget, so a pathological expression cannot hang the turn
//   · every identifier checked against the scope AT INJECTION TIME, not at first use
// The model gets the whole creative surface and none of the blast radius.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export class RuleError extends Error {}

// ── 1. Tokenizer ────────────────────────────────────────────────────────────────────────────────
const OPS = ['**', '<=', '>=', '==', '!=', '&&', '||', '??', '+', '-', '*', '/', '%', '<', '>', '!', '?', ':', '(', ')', ','];
function tokenize(src) {
  const out = []; let i = 0;
  const isNum = (c) => c >= '0' && c <= '9';
  const isIdStart = (c) => /[a-zA-Z_]/.test(c);
  const isId = (c) => /[a-zA-Z0-9_.]/.test(c);
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (isNum(c) || (c === '.' && isNum(src[i + 1]))) {
      let j = i; while (j < src.length && /[0-9._]/.test(src[j])) j++;
      const raw = src.slice(i, j).replace(/_/g, '');
      const v = Number(raw);
      if (!Number.isFinite(v)) throw new RuleError(`not a number: ${raw}`);
      out.push({ t: 'num', v }); i = j; continue;
    }
    if (isIdStart(c)) {
      let j = i; while (j < src.length && isId(src[j])) j++;
      out.push({ t: 'id', v: src.slice(i, j) }); i = j; continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (!op) throw new RuleError(`unexpected character "${c}" at ${i}`);
    out.push({ t: 'op', v: op }); i += op.length;
  }
  out.push({ t: 'end' });
  return out;
}

// ── 2. Parser (precedence climbing) ─────────────────────────────────────────────────────────────
const BINARY = { '||': 1, '??': 1, '&&': 2, '==': 3, '!=': 3, '<': 4, '>': 4, '<=': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6, '**': 8 };
const RIGHT = new Set(['**']);

function parse(src) {
  const ts = tokenize(src); let p = 0;
  const peek = () => ts[p];
  const eat = (v) => { if (ts[p].t === 'op' && ts[p].v === v) { p++; return true; } return false; };
  const expect = (v) => { if (!eat(v)) throw new RuleError(`expected "${v}"`); };

  function primary() {
    const tk = ts[p];
    if (tk.t === 'num') { p++; return { n: 'num', v: tk.v }; }
    if (tk.t === 'id') {
      p++;
      if (peek().t === 'op' && peek().v === '(') {
        p++; const args = [];
        if (!eat(')')) { do { args.push(ternary()); } while (eat(',')); expect(')'); }
        return { n: 'call', name: tk.v, args };
      }
      return { n: 'ref', path: tk.v };
    }
    if (tk.t === 'op' && tk.v === '(') { p++; const e = ternary(); expect(')'); return e; }
    if (tk.t === 'op' && (tk.v === '-' || tk.v === '!' || tk.v === '+')) { p++; return { n: 'unary', op: tk.v, a: unary() }; }
    throw new RuleError('unexpected end of expression');
  }
  function unary() { return primary(); }
  function binary(minPrec) {
    let left = unary();
    for (;;) {
      const tk = peek();
      if (tk.t !== 'op') break;
      const prec = BINARY[tk.v];
      if (prec === undefined || prec < minPrec) break;
      p++;
      const right = binary(RIGHT.has(tk.v) ? prec : prec + 1);
      left = { n: 'bin', op: tk.v, a: left, b: right };
    }
    return left;
  }
  function ternary() {
    const cond = binary(1);
    if (eat('?')) { const a = ternary(); expect(':'); const b = ternary(); return { n: 'cond', c: cond, a, b }; }
    return cond;
  }
  const ast = ternary();
  if (peek().t !== 'end') throw new RuleError('trailing characters in expression');
  return ast;
}

// ── 3. The standard library the model may call ──────────────────────────────────────────────────
// Pure, total, and finite. No randomness here: chance enters through the scope (`luck`), so a rule
// is reproducible from a seed.
const FNS = {
  min: Math.min, max: Math.max, abs: Math.abs, round: Math.round, floor: Math.floor, ceil: Math.ceil,
  sqrt: (x) => Math.sqrt(Math.max(0, x)), log: (x) => Math.log(Math.max(1e-9, x)), sign: Math.sign,
  clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
  // linear interpolation and a soft saturating curve, both handy for balance formulas
  lerp: (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t)),
  soft: (x, k = 1) => x / (1 + Math.abs(x) / Math.max(1e-9, k)),
  if_: (c, a, b) => (c ? a : b),
};
export const RULE_FUNCTIONS = Object.keys(FNS);

// ── 4. Interpreter ──────────────────────────────────────────────────────────────────────────────
const MAX_STEPS = 2000;

function resolve(path, scope) {
  const parts = path.split('.');
  let cur = scope;
  for (const k of parts) {
    if (cur == null || typeof cur !== 'object' || !Object.prototype.hasOwnProperty.call(cur, k)) return undefined;
    cur = cur[k];
  }
  return cur;
}

function evalNode(node, scope, st) {
  if (++st.steps > MAX_STEPS) throw new RuleError('expression too complex');
  switch (node.n) {
    case 'num': return node.v;
    case 'ref': {
      const v = resolve(node.path, scope);
      if (v === undefined) throw new RuleError(`unknown value "${node.path}"`);
      return typeof v === 'boolean' ? (v ? 1 : 0) : Number(v) || 0;
    }
    case 'call': {
      const f = Object.prototype.hasOwnProperty.call(FNS, node.name) ? FNS[node.name] : null;
      if (!f) throw new RuleError(`unknown function "${node.name}"`);
      return Number(f(...node.args.map((a) => evalNode(a, scope, st)))) || 0;
    }
    case 'unary': {
      const v = evalNode(node.a, scope, st);
      return node.op === '-' ? -v : node.op === '!' ? (v ? 0 : 1) : v;
    }
    case 'cond': return evalNode(node.c, scope, st) ? evalNode(node.a, scope, st) : evalNode(node.b, scope, st);
    case 'bin': {
      const a = evalNode(node.a, scope, st);
      if (node.op === '&&') return a ? evalNode(node.b, scope, st) : 0;
      if (node.op === '||' || node.op === '??') return a || evalNode(node.b, scope, st);
      const b = evalNode(node.b, scope, st);
      switch (node.op) {
        case '+': return a + b; case '-': return a - b; case '*': return a * b;
        case '/': return b === 0 ? 0 : a / b;            // division by zero is 0, never NaN
        case '%': return b === 0 ? 0 : a % b;
        case '**': return Math.abs(b) > 64 ? 0 : a ** b; // no accidental 10**10000
        case '<': return a < b ? 1 : 0; case '>': return a > b ? 1 : 0;
        case '<=': return a <= b ? 1 : 0; case '>=': return a >= b ? 1 : 0;
        case '==': return a === b ? 1 : 0; case '!=': return a !== b ? 1 : 0;
        default: throw new RuleError(`unknown operator ${node.op}`);
      }
    }
    default: throw new RuleError('bad expression');
  }
}

/** Compile an expression. Throws RuleError on anything the sandbox will not run. */
export function compile(src) {
  const text = String(src ?? '').trim();
  if (!text) throw new RuleError('empty formula');
  if (text.length > 400) throw new RuleError('formula too long');
  return { src: text, ast: parse(text) };
}

/** Run a compiled expression against a scope. Always returns a finite number. */
export function run(compiled, scope) {
  const st = { steps: 0 };
  const v = evalNode(compiled.ast, scope, st);
  return Number.isFinite(v) ? v : 0;
}

/** Every identifier an expression reads — used to check a rule before it is ever stored. */
export function referencesOf(node, out = new Set()) {
  if (!node || typeof node !== 'object') return out;
  if (node.n === 'ref') out.add(node.path);
  for (const k of ['a', 'b', 'c']) if (node[k]) referencesOf(node[k], out);
  for (const a of node.args || []) referencesOf(a, out);
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The scope: everything a rule is allowed to see.
//
// This is the contract with the model, and it is deliberately narrow and flat. If a rule wants to
// know something that is not here, the answer is to widen this function on purpose — not to hand
// the model the state object.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
export function houseScope(state, house, { months = 1, luck = 1, gross = 0 } = {}) {
  const f = house.figures || {};
  const num = (x) => Number(x) || 0;
  const holds = Object.values(state.holdings).filter((h) => h.owner === house.id);
  const armies = Object.values(state.armies).filter((a) => a.owner === house.id);
  const avg = (fn) => (holds.length ? holds.reduce((s, h) => s + fn(h), 0) / holds.length : 0);
  const wars = (state.wars || []).filter((w) => w.status !== 'ended' && [...w.attackers, ...w.defenders].includes(house.id));
  const season = state.world?.season || 'summer';
  return {
    // time and chance
    months, days: months * 30, luck, turn: state.meta?.turn || 0, year: state.meta?.date?.year || 0,
    // the season, as flags and as a severity
    season: { summer: season === 'summer' ? 1 : 0, autumn: season === 'autumn' ? 1 : 0, winter: season === 'winter' ? 1 : 0, spring: season === 'spring' ? 1 : 0, harshness: { summer: 0, spring: 0.25, autumn: 0.5, winter: 1 }[season] ?? 0 },
    // the house
    house: {
      treasury: num(f.treasury?.v), debt: num(f.debt?.v), income: num(f.income?.v), food: num(f.food?.v),
      levies: num(f.levies?.v), men_at_arms: num(f.menAtArms?.v), guard: num(f.guard?.v), ships: num(f.ships?.v),
      gross: Math.round(gross), holdings: holds.length, vassals: Object.values(state.houses).filter((v) => v.liege === house.id).length,
      at_war: wars.length ? 1 : 0, wars: wars.length,
      prosperity: Math.round(avg((h) => h.prosperity ?? 50)), unrest: Math.round(avg((h) => h.unrest ?? 10)),
      population: holds.reduce((s, h) => s + (h.population || 0), 0),
      soldiers: armies.reduce((s, a) => s + (a.men || 0), 0),
      is_paramount: ['crown', 'paramount'].includes(house.rank) ? 1 : 0,
    },
    // the model's own invented quantities, from every rule it has ever injected for this house
    v: { ...(state.vars?.[house.id] || {}) },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Validation and accounting
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export const RULE_KINDS = ['income', 'expense', 'food', 'unrest', 'prosperity', 'levies', 'var'];

/** The most a single invented rule may move, per moon. The engine still owns the physics. */
export const RULE_CAPS = {
  income: (sc) => Math.max(500, sc.house.gross * 0.45 + sc.house.treasury * 0.03),
  expense: (sc) => Math.max(500, sc.house.gross * 0.45 + sc.house.treasury * 0.03),
  food: () => 1.5,
  unrest: () => 8,
  prosperity: () => 6,
  levies: (sc) => Math.max(100, sc.house.levies * 0.12),
  var: () => Infinity, // a bare quantity: harmless until some other rule spends it
};

/**
 * Check and compile a rule the model wants to inject. Throws RuleError with a reason the model can
 * read and correct. This runs at injection time so a bad rule never enters a save.
 */
export function compileRule(state, spec) {
  const kind = String(spec.kind || 'income').toLowerCase();
  if (!RULE_KINDS.includes(kind)) throw new RuleError(`kind must be one of ${RULE_KINDS.join(', ')}`);
  const name = String(spec.name || '').trim().slice(0, 60);
  if (!name) throw new RuleError('a rule needs a name the steward can write in the ledger');

  const house = state.houses[spec.house];
  if (!house) throw new RuleError(`unknown house ${spec.house}`);

  const formula = compile(spec.formula);
  const when = spec.when ? compile(spec.when) : null;
  const grow = spec.grow ? compile(spec.grow) : null;

  // every identifier must exist in the scope as it stands today
  const scope = houseScope(state, house, { months: 1, luck: 1, gross: 0 });
  // a rule may declare new quantities of its own; seed them so its formula can reference them
  const vars = {};
  for (const [k, v0] of Object.entries(spec.vars || {})) {
    const key = String(k).toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 40);
    if (!key) continue;
    vars[key] = Number(v0) || 0;
    scope.v[key] = vars[key];
  }
  for (const c of [formula, when, grow]) {
    if (!c) continue;
    for (const ref of referencesOf(c.ast)) {
      if (resolve(ref, scope) === undefined) {
        throw new RuleError(`"${ref}" is not something a rule can read. Readable: months, luck, turn, year, season.*, house.* (treasury, debt, food, levies, men_at_arms, guard, ships, gross, holdings, vassals, at_war, prosperity, unrest, population, soldiers, is_paramount) and v.<your own variables>`);
      }
    }
  }
  // dry run: it must produce a finite number today
  run(formula, scope);
  if (when) run(when, scope);
  if (grow) run(grow, scope);

  return {
    id: String(spec.id || name).toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 40) || `rule_${Date.now().toString(36)}`,
    name, kind, house: spec.house,
    formula: formula.src, when: when?.src || null, grow: grow?.src || null,
    vars, note: String(spec.note || '').slice(0, 240),
    holding: spec.holding && state.holdings[spec.holding] ? spec.holding : null,
    since: state.meta?.turn ?? 0,
    until: Number(spec.untilTurn) || null,
    source: spec.source || 'the story',
  };
}

const cache = new Map(); // src -> compiled AST (rules are re-run every turn; parsing once is plenty)
const compiled = (src) => { if (!cache.has(src)) cache.set(src, compile(src)); return cache.get(src); };

/**
 * Evaluate every live rule for one house. Returns the ledger lines and the deltas the caller applies.
 * Pure with respect to `state` except for the model's own variables, which are the point.
 */
export function evaluateRules(state, house, ctx) {
  const out = { lines: [], food: 0, unrest: 0, prosperity: 0, levies: 0, notes: [], capped: [] };
  const rules = (state.rules || []).filter((r) => r.house === house.id);
  if (!rules.length) return out;
  state.vars = state.vars || {};
  const mine = state.vars[house.id] = state.vars[house.id] || {};
  // seed any variables this house's rules declared but that are not yet in the save
  for (const r of rules) for (const [k, v0] of Object.entries(r.vars || {})) if (mine[k] === undefined) mine[k] = v0;

  const turn = state.meta?.turn ?? 0;
  for (const r of rules) {
    if (r.until && turn > r.until) { r.status = 'lapsed'; continue; }
    if (r.status === 'lapsed' || r.status === 'ended') continue;
    const scope = houseScope(state, house, ctx);
    try {
      if (r.when && !run(compiled(r.when), scope)) continue;
      // a rule may first move its own quantity ("the network grows while it is funded")
      if (r.grow) {
        const target = Object.keys(r.vars || {})[0];
        if (target) {
          const nv = run(compiled(r.grow), scope);
          mine[target] = Math.round(Math.max(-1e9, Math.min(1e9, nv)) * 1000) / 1000;
          scope.v[target] = mine[target];
        }
      }
      let v = run(compiled(r.formula), scope);
      const cap = RULE_CAPS[r.kind](scope);
      if (Math.abs(v) > cap) { out.capped.push({ rule: r.name, wanted: Math.round(v), cap: Math.round(cap) }); v = Math.sign(v) * cap; }
      r.last = v; r.lastTurn = turn;
      if (!v) continue;
      if (r.kind === 'income' || r.kind === 'expense') {
        out.lines.push({ kind: r.kind, label: r.name, amount: Math.round(Math.abs(v)), note: r.note, rule: r.id });
      } else if (r.kind !== 'var') {
        out[r.kind] += v;
      }
    } catch (e) {
      // a rule that starts throwing (because the world changed under it) is retired, not fatal
      r.status = 'ended'; r.error = e.message;
      out.notes.push({ house: house.id, text: `${r.name} can no longer be kept: ${e.message}` });
    }
  }
  return out;
}

/** The live rules of one house, shaped for the UI (with their current variable values). */
export function liveRules(state, houseId) {
  return (state.rules || [])
    .filter((r) => r.house === houseId && r.status !== 'lapsed' && r.status !== 'ended')
    .map((r) => ({
      id: r.id, name: r.name, kind: r.kind, note: r.note, formula: r.formula, since: r.since, last: r.last ?? null,
      values: Object.fromEntries(Object.keys(r.vars || {}).map((k) => [k, state.vars?.[houseId]?.[k] ?? 0])),
    }));
}

/** A plain-words summary of a house's live rules, for the prompt and the Economy window. */
export function describeRules(state, houseId) {
  return (state.rules || [])
    .filter((r) => r.house === houseId && r.status !== 'lapsed' && r.status !== 'ended')
    .map((r) => {
      const vals = Object.keys(r.vars || {}).map((k) => `${k}=${Math.round((state.vars?.[houseId]?.[k] ?? 0) * 100) / 100}`).join(', ');
      return `${r.name} [${r.kind}] ${r.formula}${r.when ? ` when ${r.when}` : ''}${vals ? ` (${vals})` : ''}`;
    });
}
