// Every model call the game makes goes through here (docs/gdd/04-ai-system.md §1–3, §14). A call kind is a module in
// server/ai/calls/ with the whole contract of 04 §14 in one place:
//
//   context(state, args) → ctx      the dossier's facts, the enums, anything the prompt, schema, mock and checks need
//   schema(ctx)                     the JSON schema the server enforces (enums from the live world)
//   prompt(ctx) → messages          static primer first (cache-friendly), then the dossier and one short question
//   check(value, ctx) → [problems]  what the schema cannot say: legality, names, numbers, scripts, game words
//   mock(ctx) → value               rule-based, deterministic, schema-valid (CI, soaks, Mock mode)
//   fallback(ctx, problems) → value what the game does when the model fails — never an exception into the turn
//   fingerprint(ctx) → string       optional: the key of recorded replies for the replay provider
//
// runCall() never throws: a provider error, a timeout, an unreadable or schema-invalid reply, or a failed check becomes
// (after one retry that names the problems, on a real model) the call's fallback, and the record says why.
import { loadConfig, estimateTokens, extractJson } from '../llm.js';
import { validate, canonicalize } from './schema.js';
import { routeFor, CALL_DEFAULTS } from './models.js';
import { openaiReply } from './providers/openai.js';
import { mockReply } from './providers/mock.js';
import { replayReply } from './providers/replay.js';
import { CALLS } from './calls/index.js';

/** Provider by name: 'mock' | 'replay' | anything else speaks OpenAI. */
async function reply(provider, a) {
  if (provider === 'mock') return mockReply(a);
  if (provider === 'replay') return replayReply(a);
  return openaiReply(a);
}

/** Read, canonicalise and check a reply. Returns { value, problems }. */
export function readReply(text, call, ctx, schema) {
  let value;
  try { value = typeof text === 'object' ? text : JSON.parse(text); } catch {
    try { value = extractJson(text); } catch (e) { return { value: null, problems: [`unreadable: ${e.message}`] }; }
  }
  // the reply is held to the schema the model was given (its enums hold the names it may write), then its names become
  // ids for the checks and the game: an id the enum left out for a clearer name ("storms_end" for baratheon_se) is fine
  const problems = validate(value, schema);
  if (!problems.length && ctx.canons) canonicalize(value, schema, ctx.canons);
  if (!problems.length && call.check) problems.push(...call.check(value, ctx));
  return { value, problems };
}

/**
 * Run one call of `kind`. opts: { provider, cfg, onProgress, log(kind, messages, text) }.
 * Returns { value, via: 'model'|'replay'|'mock'|'fallback', problems, ms, promptTokens, model, record }.
 */
export async function runCall(kind, state, args = {}, opts = {}) {
  const call = CALLS[kind]; if (!call) throw new Error(`unknown call ${kind}`); // a programming error, not a model failure
  const cfg = opts.cfg || loadConfig(); const provider = opts.provider || cfg.provider;
  const route = routeFor(cfg, kind);
  const t0 = Date.now(); let ctx, schema, messages;
  const record = { kind, provider, route: { model: route.model, slot: route.slot }, attempts: [] };
  const fall = (problems) => {
    let value; try { value = call.fallback(ctx, problems); } catch (e) { value = null; problems = [...problems, `fallback failed: ${e.message}`]; }
    record.via = 'fallback'; record.problems = problems; record.ms = Date.now() - t0;
    return withCtx({ value, via: 'fallback', problems, ms: record.ms, promptTokens: record.promptTokens || 0, model: null, record }, ctx);
  };
  try {
    ctx = call.context(state, args); schema = call.schema(ctx); messages = call.prompt(ctx);
  } catch (e) { return fall([`the call could not be prepared: ${e.message}`]); }
  record.promptTokens = estimateTokens(messages.map((m) => m.content).join('\n'));
  let msgs = messages; let problems = [];
  for (let attempt = 0; attempt < (provider === 'mock' || provider === 'replay' ? 1 : 2); attempt++) {
    let r;
    try { r = await reply(provider, { kind, call, ctx, messages: msgs, schema, route, cfg, onProgress: opts.onProgress }); } catch (e) {
      record.attempts.push({ error: e.message }); return fall([`the model could not be reached: ${e.message}`]);
    }
    opts.log?.(kind, msgs, r.text);
    const read = readReply(r.text, call, ctx, schema);
    record.attempts.push({ ms: r.ms, model: r.model, problems: read.problems, ...(r.fixture ? { fixture: r.fixture } : {}) });
    if (!read.problems.length) {
      const via = provider === 'mock' ? 'mock' : String(r.model || '').startsWith('replay:') ? 'replay' : r.model === 'mock' ? 'mock' : 'model';
      record.via = via; record.ms = Date.now() - t0;
      return withCtx({ value: read.value, via, problems: [], ms: record.ms, promptTokens: record.promptTokens, model: r.model, record }, ctx);
    }
    problems = read.problems;
    // one more try on a real model, told plainly what was wrong (04 §5.4); then the fallback
    msgs = [...messages, { role: 'assistant', content: String(r.text).slice(0, 4000) }, { role: 'user', content: `That answer cannot be used: ${problems.slice(0, 4).join('; ')}. Answer again, in the same JSON shape, fixing only that.` }];
  }
  return fall(problems);
}

// the call's context rides along (not enumerable: it holds the live state, and is never saved or logged) for callers
// that turn the answer into something of the world's (a mind's answer into its intent)
function withCtx(result, ctx) { Object.defineProperty(result, 'ctx', { value: ctx, enumerable: false }); return result; }

/** A call's token budget (04 §2.5). */
export const budgetOf = (kind) => CALL_DEFAULTS[kind]?.budget || { in: 4000, out: 600 };
export { CALLS };
