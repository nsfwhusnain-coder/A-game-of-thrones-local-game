// The audience suite (docs/gdd/04-ai-system.md §13; WP H3): eighty things a lord might say to someone, each with the verdict the engine settles from a fresh world (obey, agree, bargain, stall, refuse, rage, yield, dismiss). The model plays the scene;
// the verdict is not its to change. Scores: does the reply keep to the verdict — a refusal promises nothing and does not say yes, an agreement does not say no and promises what was asked, a bargain asks something in return (the gate: all of them);
// does the reply pass the call's own checks first time (promises only what was asked, in the realm's words); how long it took; and, when a judge model is given, how well it is the person speaking (the gate: 3.8 of 5).
// A reader is anything that turns (state, item, stance) into `{ value, via, ms, ctx }` — the call on a model, the mock or recorded replies; no test needs a live one.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInitialState } from '../../public/js/shared/world.js';
import { withRng } from '../../public/js/engine/rng.js';
import { weighAudience } from '../../public/js/shared/temperament.js';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'suites', 'audience');
export const JUDGE_GATE = 3.8;

/** The suite's files: [{ file, about, items: [{ id, house, who, words, verdict }] }]; `verdict` is what the engine settles for the words in a fresh world (a test keeps it honest). */
export function loadAudienceSuite(dir = DIR) {
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => ({ file: f.replace(/\.json$/, ''), ...JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) }));
}
export const itemsOf = (suites) => suites.flatMap((s) => s.items);

/** The world an item is spoken in: a game begun as `house`, the dice fixed. Each item has a world of its own, for the weighing changes the person's mood. */
const bases = new Map(); // (a world takes a tenth of a second to make: made once a house, copied for each line)
export const worldFor = (item) => { const h = item.house || 'stark'; if (!bases.has(h)) bases.set(h, JSON.stringify(createInitialState('agot_298', h, { seed: 298 }))); return JSON.parse(bases.get(h)); };
/** The engine's weighing of the words, with its dice: `{ verdict, directive, I, … }`. */
export function stanceOf(state, item) {
  const c = state.characters[item.who]; if (!c) throw new Error(`${item.id}: no such person ${item.who}`);
  return withRng(state, () => weighAudience(state, c, item.words));
}

const REFUSING = new Set(['refuse', 'rage', 'dismiss']);
const HOLDING = new Set(['stall', 'bargain']);
const AGREEING = new Set(['agree', 'obey', 'yield']);
const ASSENT = /\b(very well|you have my word|so be it|gladly|it shall be done|i agree|as you wish|you may count on me|consider it done|i will do it|i shall do it|agreed)\b/i;
const NO = /\b(i will not|i won'?t|i shall not|i refuse|never|out of the question|you ask too much)\b/i;
const WARM = new Set(['warm', 'amused']);

/**
 * Does a reply keep to the verdict? `asked` is what the lord asked that the verdict lets them promise (the call's `may`).
 * Returns `{ ok, why }`; `why` says the fault.
 */
export function obeys(value, verdict, { asked = [] } = {}) {
  const beats = value?.beats || []; const out = value?.outcome;
  if (!beats.length || !out) return { ok: false, why: 'no reply' };
  const speech = beats.filter((b) => b.kind === 'speech').map((b) => b.text).join(' ');
  const promised = out.agrees_to || [];
  if (REFUSING.has(verdict)) {
    if (promised.length) return { ok: false, why: 'promises something after refusing' };
    if (ASSENT.test(speech)) return { ok: false, why: 'says yes in words after refusing' };
    if (WARM.has(out.mood)) return { ok: false, why: `is ${out.mood} at the end of a refusal` };
  } else if (HOLDING.has(verdict)) {
    if (promised.length) return { ok: false, why: 'promises something while holding back' };
    if (ASSENT.test(speech)) return { ok: false, why: 'says yes in words while holding back' };
    if (verdict === 'bargain' && !String(out.asks_for || '').trim()) return { ok: false, why: 'a bargain that asks for nothing' };
  } else if (AGREEING.has(verdict)) {
    if (NO.test(speech)) return { ok: false, why: 'refuses in words after agreeing' };
    if (asked.length && !promised.length) return { ok: false, why: 'agrees but promises nothing of what was asked' };
  } else if (promised.length) return { ok: false, why: 'promises when nothing was settled' };
  return { ok: true, why: '' };
}

const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
const quantile = (xs, q) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

/**
 * Put every item to the reader. `judge(item, stance, value)` (optional) returns `{ score }` 1–5. `onItem` gets each result as it comes (a live run is slow).
 * Returns `{ items: [{ id, who, verdict, labelled, labelOk, ok, why, via, ms, score? }], n, … }`.
 */
export async function runAudienceSuite(read, { suites = loadAudienceSuite(), only = null, limit = Infinity, judge = null, onItem = null } = {}) {
  const list = itemsOf(suites).filter((it) => !only || only.includes(it.id) || only.includes(it.house) || only.includes(it.who)).slice(0, limit);
  const items = [];
  for (const it of list) {
    const state = worldFor(it); const stance = stanceOf(state, it);
    const r = await read(state, it, stance);
    const o = obeys(r.value, stance.verdict, { asked: r.ctx?.may || [] });
    const row = { id: it.id, house: it.house, who: it.who, words: it.words, verdict: stance.verdict, labelled: it.verdict ?? null, labelOk: it.verdict == null || it.verdict === stance.verdict, ok: o.ok, why: o.why, via: r.via, ms: r.ms ?? 0, problems: r.problems || [] };
    if (judge && r.value) { try { const j = await judge(it, stance, r.value); if (Number.isFinite(j?.score)) row.score = j.score; } catch { /* a judge that fails scores nothing */ } }
    items.push(row); onItem?.(row);
  }
  return summarise(items);
}

export function summarise(items) {
  const by = {}; for (const x of items) { const k = x.verdict || 'none'; by[k] = by[k] || { n: 0, ok: 0 }; by[k].n++; if (x.ok) by[k].ok++; }
  const scored = items.filter((x) => x.score != null);
  const ms = items.map((x) => x.ms).filter((x) => x >= 0);
  return {
    items, n: items.length, ok: items.filter((x) => x.ok).length, firstTry: items.filter((x) => ['model', 'mock', 'replay'].includes(x.via) && !x.problems.length).length,
    fallback: items.filter((x) => x.via === 'fallback').length, labelOff: items.filter((x) => !x.labelOk).length, by,
    judged: scored.length, judge: scored.length ? scored.reduce((a, x) => a + x.score, 0) / scored.length : null,
    ms: { p50: quantile(ms, 0.5), p95: quantile(ms, 0.95) },
  };
}

/** The gates: every reply keeps to its verdict; the judge's mean is 3.8 or more (when a judge was used). */
export function verdicts(r) {
  const out = [{ name: 'the reply keeps to the verdict', ok: r.ok === r.n, got: `${r.ok} of ${r.n} (${pct(r.ok, r.n)} %)`, gate: '100 %' }];
  if (r.judged) out.push({ name: 'the judge\'s score for the person speaking', ok: r.judge >= JUDGE_GATE, got: `${r.judge.toFixed(2)} (${r.judged} judged)`, gate: `≥ ${JUDGE_GATE}` });
  return out;
}

export function audienceReport(r, { reader = '' } = {}) {
  const v = verdicts(r);
  const bad = r.items.filter((x) => !x.ok);
  return [
    `# Audience suite${reader ? ` — ${reader}` : ''}`, '',
    '| gate | got | needs | |', '|---|---|---|---|', ...v.map((x) => `| ${x.name} | ${x.got} | ${x.gate} | ${x.ok ? 'ok' : 'FAIL'} |`), '',
    `${r.n} lines. First try (the reply passed the call's own checks): ${r.firstTry} (${pct(r.firstTry, r.n)} %); the plain fallback was used for ${r.fallback}. Time per reply: p50 ${Math.round(r.ms.p50)} ms, p95 ${Math.round(r.ms.p95)} ms.${r.labelOff ? ` **${r.labelOff} lines whose verdict is no longer the one the suite was labelled with** (the engine's weighing changed: relabel, or find out why).` : ''}`, '',
    '| verdict | lines | kept |', '|---|---|---|', ...Object.entries(r.by).sort().map(([k, x]) => `| ${k} | ${x.n} | ${x.ok} (${pct(x.ok, x.n)} %) |`), '',
    ...(bad.length ? ['## Replies that did not keep to the verdict', '', ...bad.slice(0, 40).map((x) => `- ${x.id} (${x.who}, ${x.verdict}): ${x.why} — "${String(x.words).slice(0, 80)}"`), ...(bad.length > 40 ? [`- … and ${bad.length - 40} more`] : []), ''] : []),
  ].join('\n');
}

/** What the judge is asked, when there is one (the owner's offline judge model; no test needs it). */
export const JUDGE = `You judge a scene from a chronicle of the Seven Kingdoms in 298 AC, written in the manner of George R. R. Martin's A Song of Ice and Fire. A lord has spoken to someone; the game has settled the outcome of the talk (the OUTCOME line); a reply has been written. Score the reply from 1 to 5:
5 = it is plainly that person speaking (their rank, their nature, their way of speech), the outcome is played exactly, the prose is clean and period;
3 = acceptable but generic, or a little modern, or stiff;
1 = the wrong person, or the outcome overturned, or modern idiom, or a game word.
Answer {"score": n, "why": "a short reason"}.`;
