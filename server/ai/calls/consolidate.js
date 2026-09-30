// The Consolidator (docs/gdd/04-ai-system.md §9): a stretch of the chronicle is folded into the long memory. What
// happened is written by the engine from the facts (it cannot contradict the world); the model writes the two things
// the engine cannot — what is still open, and what was said but not confirmed — and a short summary, from the facts the
// lord's house knows and nothing else. Every open thread must name someone or somewhere the dossier names: the model
// may not start a thread of its own.
import { obj, str, arr, hasForeignScript, strings } from '../schema.js';
import { system } from '../context/primer.js';
import { dateStr, dayNumber } from '../../../public/js/shared/world.js';
import { dateOfDay } from '../../../public/js/engine/time.js';
import { promiseText } from '../../../public/js/engine/politics/commitments.js';
import { GAME_WORDS } from '../validate/narration.js';
import { shapeCard, firstSentence } from '../../../public/js/engine/facts/digest.js';
import { TIERS } from '../../../public/js/engine/facts/rank.js';
import { anachronismsIn } from '../../../public/data/anachronisms.js';

export const INSTRUCTIONS = `YOUR TASK
You are the archmaester keeping the lord's chronicle. The dated facts of these days are already written and stand above your words; do not restate them. Write:
- open: up to eight things still IN MOTION or UNRESOLVED at the end of these days — a march not finished, a promise not yet due, a quarrel, a war, a matter unanswered. Each names who and where, from the dossier, and begins "As of <the last date>:". Nothing the dossier does not show.
- rumours: up to six things SAID or SUSPECTED but not confirmed in these facts, each saying who says it.
- summary: a few sentences on what these days meant for the house, in the past tense.
Only what the dossier shows; never a game word; nothing of what is to come.`;

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

/** What is open for the lord's house now, as the engine knows it: wars, marches, promises, matters, letters. */
export function openNow(state) {
  const p = state.meta.player; const out = [];
  for (const w of (state.wars || []).filter((x) => x.status !== 'ended' && [...(x.attackers || []), ...(x.defenders || [])].includes(p))) out.push(`${w.name || 'A war'} goes on`);
  for (const a of Object.values(state.parties || {}).filter((x) => (x.owner === p || state.houses[x.owner]?.liege === p) && x.march?.to && x.men > 0).slice(0, 5)) out.push(`${a.name} marches for ${state.holdings[a.march.to]?.name || 'the field'}`);
  for (const c of (state.commitments || []).filter((x) => x.state === 'open' && [state.characters[x.by]?.house, state.characters[x.to]?.house || x.to].includes(p)).slice(0, 4)) out.push(promiseText(state, c));
  for (const d of (state.decisions || []).filter((x) => x.status === 'pending').slice(0, 3)) out.push(`the matter of ${d.title.replace(/^./, (x) => x.toLowerCase())} awaits the lord's word`);
  for (const l of (state.post || []).filter((x) => !x.reply && x.status === 'in flight').slice(0, 2)) out.push(`a letter to ${l.toName} is on the wing`);
  return out;
}

/** The engine's own words for what happened: the facts of note, dated, at most `max`. */
export function whatHappened(facts, max = 24) {
  return facts.filter((f) => (f.importance ?? 1) >= 3 && f.kind !== 'ledger').slice(-max).map((f) => `- **${dateStr(dateOfDay(f.day))}** — ${clean(f.title && f.text && !f.text.startsWith(f.title) ? `${f.title}: ${f.text}` : f.text || f.title)}`).join('\n');
}

/**
 * What happened, as the player read it: the cards of the turns folded — news and above, a headline and the first sentence of
 * its summary, dated, at most `max` (the newest) — in the words of the chronicle, never the ledger's lines (18 §2.6).
 */
export function toldHappenings(turns, max = 24) {
  const rows = [];
  for (const t of turns || []) for (const e of t.events || []) {
    if (e.bg) continue;
    const c = shapeCard(e); if (!c.headline || TIERS.indexOf(c.tier) < TIERS.indexOf('news')) continue;
    const line = firstSentence(c.summary); const head = c.headline.replace(/[.!?…]+$/, '');
    rows.push(`- **${e.date || t.date}** — ${head}.${line && line.replace(/[.!?…]+$/, '') !== head ? ` ${line}` : ''}`);
  }
  return rows.slice(-max).join('\n');
}

// every name the dossier gives: the people, houses and places of the facts and of what is open
function namesOf(state, facts, open) {
  const n = new Set();
  for (const f of facts) {
    for (const a of f.actors || []) { const c = state.characters[a]; if (c) { n.add(c.name); n.add(c.name.split(' ')[0]); } }
    for (const h of f.houses || []) if (state.houses[h]) n.add(state.houses[h].name);
    if (f.place && state.holdings[f.place]) n.add(state.holdings[f.place].name);
  }
  for (const o of open) for (const m of o.match(/\b[A-Z][a-z']+(?:\s+[A-Z][a-z']+)*/g) || []) n.add(m);
  n.delete('As'); n.delete('The'); n.delete('House');
  return [...n].filter((x) => x.length > 2);
}

export default {
  kind: 'consolidate',
  fixtureArgs: (state) => ({ facts: [
    { id: 'f1.1', turn: 1, day: dayNumber(state.meta.date), kind: 'levies_called', actors: ['eddard_stark'], houses: ['stark'], place: 'stark', importance: 4, text: 'Eddard Stark calls the banners of the North to Winterfell.' },
    { id: 'f1.2', turn: 1, day: dayNumber(state.meta.date) + 2, kind: 'call_answered', actors: ['greatjon_umber'], houses: ['umber'], place: 'umber', importance: 3, text: 'Greatjon Umber answers the call with 2,500 men and marches for Winterfell.' },
    { id: 'f1.3', turn: 1, day: dayNumber(state.meta.date) + 3, kind: 'rumour', actors: [], houses: ['lannister'], place: 'lannister', importance: 2, text: 'In the Riverlands men say the Lannisters are gathering swords at Casterly Rock.' },
  ] }),
  context(state, { facts = [] } = {}) {
    const open = openNow(state);
    const days = facts.map((f) => f.day).filter(Number.isFinite);
    const from = days.length ? dateStr(dateOfDay(Math.min(...days))) : dateStr(state.meta.date), to = days.length ? dateStr(dateOfDay(Math.max(...days))) : dateStr(state.meta.date);
    return {
      state, facts, open, from, to, names: namesOf(state, facts, open),
      dossier: [
        `THE HOUSE: House ${state.houses[state.meta.player].name}. These days: ${from} – ${to}.`,
        `THE FACTS OF THESE DAYS (as they reached the house):\n${facts.filter((f) => (f.importance ?? 1) >= 2).slice(-40).map((f) => `- ${dateStr(dateOfDay(f.day))}: ${clean(f.text || f.title)}`).join('\n') || '- none of note'}`,
        `WHAT THE ENGINE KNOWS IS STILL OPEN:\n${open.map((o) => `- ${o}`).join('\n') || '- nothing'}`,
      ].join('\n'),
    };
  },
  schema: () => obj({ open: arr(str(160), { max: 8 }), rumours: arr(str(160), { max: 6 }), summary: str(900) }),
  prompt: (ctx) => [
    { role: 'system', content: system(ctx.state, INSTRUCTIONS) },
    { role: 'user', content: `${ctx.dossier}\n\nThe last date is ${ctx.to}. Write the chronicle's entry.` },
  ],
  check(v, ctx) {
    const out = [];
    for (const o of v.open) if (!ctx.names.some((n) => o.includes(n))) out.push(`"${o.slice(0, 60)}…" names no one and nowhere the dossier names`);
    const text = strings(v).join(' ');
    if (strings(v).some(hasForeignScript)) out.push('a word in a script that is not the realm\'s');
    for (const re of GAME_WORDS) { const m = text.match(re); if (m) { out.push(`"${m[0]}" is not a word of the realm`); break; } }
    for (const a of anachronismsIn(ctx.state, text)) out.push(`"${a.phrase}": ${a.note}`);
    return out;
  },
  // the threads that name what the dossier names are kept; the rest is dropped, never guessed at
  salvage(v, problems, ctx) {
    if (problems.some((p) => !/names no one/.test(p))) return null;
    return { ...v, open: v.open.filter((o) => ctx.names.some((n) => o.includes(n))) };
  },
  mock: (ctx) => valueOf(ctx),
  fallback: (ctx, problems) => ({ ...valueOf(ctx), problems }),
  fingerprint: (ctx) => `${ctx.facts.length}|${ctx.open.length}`,
};

// the engine's own entry: what is open as it knows it; the rumours of the facts; the weightiest facts as the summary
function valueOf(ctx) {
  const rumours = ctx.facts.filter((f) => f.kind === 'rumour').slice(-6).map((f) => clean(f.text).slice(0, 160));
  const summary = ctx.facts.filter((f) => (f.importance ?? 1) >= 3).sort((a, b) => b.importance - a.importance).slice(0, 4).map((f) => clean(f.text || f.title)).join(' ').slice(0, 900);
  return { open: ctx.open.slice(0, 8).map((o) => `As of ${ctx.to}: ${o}`.slice(0, 160)), rumours, summary };
}
