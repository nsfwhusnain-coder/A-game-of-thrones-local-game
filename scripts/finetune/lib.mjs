// The dataset builder's pure parts (docs/gdd/04-ai-system.md §11.4; WP H4): what a logged call is worth as a training example, which are kept and which dropped and why, and which pairs of an answer the game refused and the answer it accepted
// make a preference pair. The labeller is the game itself: a reply is an example only if the game's own checks passed it (`accepted`), and only if it is clean of what the game never wants said (a foreign script, a game word, a phrase from after 298).
// Nothing here draws a dice, calls a model or reads anything but the lines it is given.
import fs from 'node:fs';
import path from 'node:path';
import { BOILERPLATE, JARGON, FORBIDDEN } from '../../public/data/style.js';
import { ANACHRONISMS } from '../../public/data/anachronisms.js';
import { hasForeignScript } from '../../server/ai/schema.js';

/** How many examples each kind of call is worth training on (04 §11.4), the order the recipe fills them in. */
export const TARGETS = { interpret: 2000, mind: 1500, narrate: 800 };
/** The longest example kept, in tokens (a longer one is dropped, never cut: a reply cut short teaches a reply cut short). */
export const MAX_TOKENS = 3400;
export const tokens = (s) => Math.ceil(String(s || '').length / 3.6);

const WORDS = [...BOILERPLATE, ...JARGON, ...FORBIDDEN].map((p) => new RegExp(p, 'i'));
const LATER = ANACHRONISMS.flatMap((a) => a.phrases.map((p) => new RegExp(p, 'i')));

/** Every `llm-calls.jsonl` under the given files and folders (a playtest's copy of a save has one too): the lines, parsed, in time order; a line that is not JSON is skipped and counted. */
export function readCalls(paths) {
  const files = [];
  const walk = (p) => {
    if (!fs.existsSync(p)) return;
    const st = fs.statSync(p);
    if (st.isFile()) { files.push(p); return; }
    for (const f of fs.readdirSync(p, { withFileTypes: true })) { const q = path.join(p, f.name); if (f.isDirectory()) walk(q); else if (f.name === 'llm-calls.jsonl') files.push(q); }
  };
  for (const p of paths) walk(p);
  const entries = []; let bad = 0;
  for (const f of files) for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { const x = JSON.parse(line); if (x && x.kind && Array.isArray(x.messages)) entries.push(x); else bad++; } catch { bad++; }
  }
  entries.sort((a, b) => String(a.t).localeCompare(String(b.t)));
  return { entries, files, bad };
}

const stringsOf = (v, out = []) => { if (typeof v === 'string') out.push(v); else if (Array.isArray(v)) v.forEach((x) => stringsOf(x, out)); else if (v && typeof v === 'object') Object.values(v).forEach((x) => stringsOf(x, out)); return out; };

/** Why this reply is not a good example (an empty list: it is): the game refused it, it is not whole JSON, it is in the wrong script, it says a game word or a thing from after 298, it is too long. */
export function dropReasons(e, { allowMock = false, maxTokens = MAX_TOKENS } = {}) {
  const why = [];
  if (!allowMock && ['mock', 'replay'].includes(e.provider)) why.push('not-live'); // what a mock or a replay says teaches the mock's voice
  if (e.accepted === false || (e.problems && e.problems.length)) why.push('refused');
  const reply = String(e.reply ?? '').trim();
  if (!reply) { why.push('empty'); return why; }
  let value; try { value = JSON.parse(reply); } catch { why.push('not-json'); }
  const text = value !== undefined ? stringsOf(value) : [reply];
  if (text.some(hasForeignScript)) why.push('foreign-script');
  if (text.some((t) => WORDS.some((re) => re.test(t)))) why.push('game-word');
  if (text.some((t) => LATER.some((re) => re.test(t)))) why.push('after-298');
  if (tokens(e.messages.map((m) => m.content).join('\n') + reply) > maxTokens) why.push('too-long');
  return why;
}

/** An example in the chat shape the trainers read: the prompt as the game sent it, then the reply as the assistant's turn. */
export const exampleOf = (e) => ({ kind: e.kind, messages: [...e.messages.map((m) => ({ role: m.role, content: m.content })), { role: 'assistant', content: String(e.reply).trim() }] });

/**
 * The pairs: an answer the game refused and the answer it accepted when it asked again (the retry's prompt is the first prompt, the refused answer, and what was wrong with it). A pair is a preference — same prompt, `chosen` the accepted reply,
 * `rejected` the refused one — and carries what the game found wrong, which is what the tuned model should stop doing. Matched by the prompts, not by the order of the lines: calls run side by side.
 */
export function pairsOf(entries, opts = {}) {
  const key = (ms) => JSON.stringify(ms.map((m) => [m.role, m.content]));
  const first = new Map();
  for (const e of entries) if ((e.attempt ?? 0) === 0 && (e.accepted === false || e.problems?.length)) first.set(key(e.messages), e);
  const out = [];
  for (const e of entries) {
    if ((e.attempt ?? 0) < 1 || e.messages.length < 3 || dropReasons(e, opts).length) continue;
    const e0 = first.get(key(e.messages.slice(0, -2))); if (!e0 || e0.kind !== e.kind) continue;
    const rejected = String(e0.reply ?? '').trim(); if (!rejected || rejected === String(e.reply).trim()) continue;
    out.push({ kind: e.kind, prompt: e0.messages.map((m) => ({ role: m.role, content: m.content })), chosen: [{ role: 'assistant', content: String(e.reply).trim() }], rejected: [{ role: 'assistant', content: rejected }], problems: e0.problems || [] });
  }
  return out;
}

/** A fixed share of the prompts is held back for the dev set, chosen by a hash of the prompt: the same prompt is always on the same side, so a prompt asked twice cannot be in both. */
export function isDev(messages, share) {
  let h = 2166136261; const s = messages.map((m) => m.content).join('\u0001');
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return (h % 10000) / 10000 < share;
}

/**
 * Make the dataset from logged calls. `kinds` limits the kinds; `maxPerKind` caps each; `dev` is the share held back (0.1).
 * Returns `{ train, dev, pairs, stats }`; `stats` has what was read, kept and dropped (by reason), per kind, and each kind's distance from its target.
 */
export function build(entries, { kinds = null, maxPerKind = Infinity, dev = 0.1, allowMock = false, maxTokens = MAX_TOKENS } = {}) {
  const stats = { read: entries.length, kept: 0, dropped: {}, kinds: {}, pairs: 0 };
  const want = (e) => !kinds || kinds.includes(e.kind);
  const seen = new Set(); const train = [], devSet = [];
  const kindOf = (k) => (stats.kinds[k] = stats.kinds[k] || { read: 0, kept: 0, train: 0, dev: 0, target: TARGETS[k] ?? null });
  for (const e of entries) {
    if (!want(e)) continue;
    const k = kindOf(e.kind); k.read++;
    const why = dropReasons(e, { allowMock, maxTokens });
    const dup = JSON.stringify([e.messages.map((m) => m.content), e.reply]);
    if (!why.length && seen.has(dup)) why.push('duplicate');
    if (why.length) { for (const w of why) stats.dropped[w] = (stats.dropped[w] || 0) + 1; continue; }
    if (k.kept >= maxPerKind) { stats.dropped['over-cap'] = (stats.dropped['over-cap'] || 0) + 1; continue; }
    seen.add(dup); k.kept++; stats.kept++;
    const ex = exampleOf(e);
    if (isDev(e.messages, dev)) { devSet.push(ex); k.dev++; } else { train.push(ex); k.train++; }
  }
  const pairs = pairsOf(entries.filter(want), { allowMock, maxTokens }).filter((p) => !isDev(p.prompt, dev));
  stats.pairs = pairs.length;
  return { train, dev: devSet, pairs, stats };
}

/** The report the owner reads before spending a GPU: what there is, what each kind lacks, why things were dropped. */
export function report(stats, { files = [], bad = 0 } = {}) {
  const row = (k, x) => `| ${k} | ${x.read} | ${x.kept} | ${x.train} | ${x.dev} | ${x.target ?? '—'} | ${x.target ? (x.train >= x.target ? 'enough' : `${x.target - x.train} short`) : ''} |`;
  const dropped = Object.entries(stats.dropped).sort((a, b) => b[1] - a[1]);
  return [
    '# Fine-tune dataset', '',
    `${stats.read} logged calls read from ${files.length} file${files.length === 1 ? '' : 's'}${bad ? ` (${bad} unreadable lines skipped)` : ''}; ${stats.kept} kept as examples; ${stats.pairs} preference pairs (an answer the game refused and the one it accepted).`, '',
    '| kind | read | kept | train | dev | target | |', '|---|---|---|---|---|---|---|', ...Object.entries(stats.kinds).sort().map(([k, x]) => row(k, x)), '',
    dropped.length ? `Dropped: ${dropped.map(([w, n]) => `${w} ${n}`).join(', ')}.` : 'Nothing was dropped.', '',
  ].join('\n');
}
