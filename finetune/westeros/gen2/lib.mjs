// Shared pieces of the multi-task training-data generators (mind, narrate, audience, council, director, consolidate).
// The rule: a training answer is only ever kept if THE GAME'S OWN CHECKS accept it on the first try (call.check via readReply),
// it is clean (no foreign script, no anachronism, no post-298 spoiler) and, where a kind has an oracle, the oracle agrees.
// Nothing here writes book text; every prompt is the game's own (call.prompt(ctx)), every answer is a model's, filtered.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** Conservative post-298 AC spoilers on top of the game's own anachronism list (each is certain, none is geography). */
export const FUTURE = [/\bking joffrey\b/i, /\bking tommen\b/i, /\bking robb\b/i, /\bking renly\b/i, /\bking stannis\b/i, /\bred wedding\b/i, /\bfrey pie\b/i,
  /\bnight king\b/i, /\bbattle of the bastards\b/i, /\bsons of the harpy\b/i, /\bwinter is here\b/i, /\bhold the door\b/i, /\bmother of dragons\b/i,
  /\bbreaker of chains\b/i, /\bkhaleesi\b/i, /\bwhite walkers?\b/i];

/** Small seeded random source (mulberry32) with the helpers the generators use. */
export function rng(seed) {
  let s = seed >>> 0;
  const next = () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pick = (a) => a[Math.floor(next() * a.length)];
  const int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
  const chance = (p) => next() < p;
  const shuffle = (a) => a.map((x) => [next(), x]).sort((p, q) => p[0] - q[0]).map((p) => p[1]);
  return { next, pick, int, chance, shuffle };
}

/** Load the game (a checkout at `repo`) and the pieces of it the generators need. */
export async function loadGame(repo, { saves = null, provider = 'mock' } = {}) {
  // the game's own turn engine is driven on the mock (no model) to make states; it wants these set before it is imported
  process.env.WC_SAVES = saves || process.env.WC_SAVES || fs.mkdtempSync(path.join(os.tmpdir(), 'wc-gen-'));
  process.env.WC_PROVIDER = provider;
  const imp = (rel) => import(pathToFileURL(path.join(repo, rel)).href);
  const [llm, client, models, schema, openai, W, rngm, anach, game] = await Promise.all([
    imp('server/llm.js'), imp('server/ai/client.js'), imp('server/ai/models.js'), imp('server/ai/schema.js'), imp('server/ai/providers/openai.js'),
    imp('public/js/shared/world.js'), imp('public/js/engine/rng.js'), imp('public/data/anachronisms.js'), imp('server/game.js'),
  ]);
  return { repo, imp, game, W, withRng: rngm.withRng, DEFAULT_CONFIG: llm.DEFAULT_CONFIG, estimateTokens: llm.estimateTokens, CALLS: client.CALLS, readReply: client.readReply,
    routeFor: models.routeFor, CALL_DEFAULTS: models.CALL_DEFAULTS, openaiReply: openai.openaiReply, hasForeignScript: schema.hasForeignScript, strings: schema.strings, anachronismsIn: anach.anachronismsIn };
}

/** The config the game would use against an OpenAI-compatible server at `base` (llama-server or llama-swap). */
export function makeCfg(G, base, model = 'x') {
  return { ...G.DEFAULT_CONFIG, provider: 'openai', baseUrl: `${String(base).replace(/\/+$/, '')}/v1`, model, models: { default: { model, slot: null } }, timeoutSec: 900, stream: true, contextTokens: 65536, extraBody: {} };
}

/** One model answer to the game's own prompt (the mock provider answers with the call's rule-based reply). */
export async function sampleOnce(G, kind, ctx, messages, schema, cfg, provider) {
  if (provider === 'mock') return { text: JSON.stringify(G.CALLS[kind].mock(ctx)), ms: 0, model: 'mock' };
  return G.openaiReply({ kind, call: G.CALLS[kind], ctx, messages, schema, route: G.routeFor(cfg, kind), cfg });
}

/** The game's verdict on a reply: { problems, value (canonicalised), raw (the model's own words, before canonicalising) }. */
export function judge(G, kind, ctx, schema, text) {
  let raw = null; try { raw = JSON.parse(text); } catch { /* unreadable: readReply says so */ }
  const read = G.readReply(text, G.CALLS[kind], ctx, schema);
  return { problems: read.problems, value: read.value, raw };
}

/** What the game's own checks do not look for. [] = clean. */
export function extraIssues(G, state, value) {
  const texts = G.strings(value); const out = []; const joined = texts.join(' \n ');
  if (texts.some(G.hasForeignScript)) out.push('foreign script');
  let an = []; try { an = G.anachronismsIn(state, joined); } catch { /* state without the tables */ }
  if (an.length) out.push(`anachronism: ${an.map((x) => x.phrase).slice(0, 2).join(', ')}`);
  for (const re of FUTURE) if (re.test(joined)) { out.push(`future: ${re.source}`); break; }
  return out;
}

/** The assistant turn as the game's grammar will emit it: compact JSON of the model's own answer. */
export const compact = (raw) => JSON.stringify(raw);

/** Run `fn` over an async iterable with at most `conc` in flight. Errors in one item never stop the others. */
export async function pool(iter, conc, fn) {
  const running = new Set();
  for await (const item of iter) {
    const p = (async () => { try { await fn(item); } catch (e) { console.error('item failed:', e.message); } })().finally(() => running.delete(p));
    running.add(p);
    if (running.size >= conc) await Promise.race(running);
  }
  await Promise.all(running);
}
