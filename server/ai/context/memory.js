// Relevant memory (docs/gdd/04-ai-system.md §9). The engine's memory is complete: the fact log. A model's memory is a
// small view of it, built for the call in hand — what has reached this house lately (the actor's and the place's
// matters first), older facts that bear on who and what is in question, and the chronicle's summaries of older days
// that mention them, found by BM25 (server/lore.js) — within a budget of about 1,200 tokens. Only what the house knows
// (engine/knowledge.js) is ever in it; the chronicle is read as notes, never as facts (the lord may have edited it).
import { bm25Index, bm25Search } from '../../lore.js';
import { knows, eyesOf } from '../../../public/js/engine/knowledge.js';
import { dateOfDay } from '../../../public/js/engine/time.js';
import { dateStr, dayNumber } from '../../../public/js/shared/world.js';
import { estimateTokens } from '../../llm.js';

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

/**
 * The chronicle's summaries, one passage to a line: [{ from, to, text }]. A section is "## <from> — <to>" (as the
 * consolidator writes it); its lines are the passages.
 */
export function chronicleNotes(md) {
  const out = [];
  for (const sec of String(md || '').split(/\n(?=## )/)) {
    const m = sec.match(/^## (.+?) — (.+)$/m); if (!m) continue;
    for (const l of sec.split('\n').slice(1)) {
      const t = clean(l.replace(/^[-*]\s*/, '').replace(/\*\*/g, ''));
      if (t.length > 24 && !/^#/.test(l)) out.push({ from: m[1].trim(), to: m[2].trim(), text: t });
    }
  }
  return out;
}

/**
 * The memory block for a call. opts: { facts (the log, or its recent part), notes (chronicleNotes), house (whose
 * knowledge), actors, places, houses (who and where is in question), words (what is being said), budget (tokens),
 * lately (days counted as lately) }. Returns { text, facts: [fact ids used], notes: n }.
 */
export function relevantMemory(state, { facts = [], notes = [], house, actors = [], places = [], houses = [], words = '', budget = 1200, lately = 14 } = {}) {
  const today = dayNumber(state.meta.date); const E = house ? eyesOf(state, house) : null;
  const seen = facts.filter((f) => f.kind !== 'ledger' && f.day <= today && (!house || knows(state, house, f, today, E)));
  const A = new Set(actors.filter(Boolean)), P = new Set(places.filter(Boolean)), H = new Set(houses.filter(Boolean));
  const touches = (f) => f.actors?.some((x) => A.has(x)) || (f.place && P.has(f.place)) || f.houses?.some((x) => H.has(x));
  const line = (f) => `- ${dateStr(dateOfDay(f.day))}: ${clean(f.text || f.title)}`;
  // lately: what touches the matter in hand first, then the realm's weightiest news
  const recent = seen.filter((f) => today - f.day < lately);
  const lateLines = [...recent.filter(touches).sort((a, b) => b.day - a.day), ...recent.filter((f) => !touches(f) && f.importance >= 3).sort((a, b) => b.importance - a.importance || b.day - a.day)];
  // older: the facts and notes that bear on who and what is in question
  const name = (id) => state.characters[id]?.name || state.holdings[id]?.name || state.houses[id]?.name || '';
  const query = [...A, ...P, ...H].map(name).concat(words).join(' ');
  const older = seen.filter((f) => today - f.day >= lately);
  const docs = [...older.map((f) => ({ f, text: `${f.title || ''} ${f.text || ''}`, boost: touches(f) ? 2 : 1 })), ...notes.map((n) => ({ n, text: n.text, boost: 1 }))];
  const hits = query.trim() ? bm25Search(bm25Index(docs), query, { k: 24 }).map(({ d, s }) => ({ d, s: s * d.boost })).sort((a, b) => b.s - a.s) : [];
  const oldLines = hits.filter((h) => h.d.f).map((h) => h.d.f);
  const noteLines = hits.filter((h) => h.d.n).map((h) => h.d.n);
  // fill to the budget: lately first, then older facts, then the chronicle's notes
  const parts = [['LATELY, AS IT REACHED YOU:', lateLines.map(line)], ['OLDER, AS REMEMBERED:', oldLines.sort((a, b) => b.day - a.day).map(line)], ['FROM THE CHRONICLE (notes, not certain):', noteLines.map((n) => `- ${n.from} – ${n.to}: ${n.text}`)]];
  const used = new Set(); let left = budget; const out = []; const ids = [];
  for (const [head, lines] of parts) {
    const kept = [];
    for (const l of lines) { if (used.has(l)) continue; const t = estimateTokens(l) + 1; if (t > left) break; kept.push(l); used.add(l); left -= t; }
    if (kept.length) { out.push(`${head}\n${kept.join('\n')}`); left -= estimateTokens(head); }
  }
  for (const f of [...lateLines, ...oldLines]) if (used.has(line(f))) ids.push(f.id);
  return { text: out.join('\n'), facts: ids, notes: noteLines.filter((n) => used.has(`- ${n.from} – ${n.to}: ${n.text}`)).length };
}
