// The turn told (docs/gdd/04-ai-system.md §6). The engine's cards for what the player's house reads this turn are
// gathered into stories by their facts; the narrator tells each story once; each telling is held to its facts
// (validate/narration.js). A telling that fails is told again alone, once, with what was wrong; one that fails again
// leaves the engine's own cards in its place, plain but true. A story told well becomes one card, carrying its facts and
// the engine's lines it replaces ("the record"), so the numbers are always one click from the prose. The chronicle is
// never allowed to be wrong.
import { runCall, CALLS } from './ai/client.js';
import { factById } from '../public/js/engine/facts/log.js';
import { clusterFacts } from '../public/js/engine/facts/cluster.js';

/** Whether the narrator tells the turn (config `narrator`: "on" by default; "off" keeps the old Bard of the swarm). */
export const narratorOn = (cfg) => !(cfg.narrator === 'off' || cfg.narrator === false);

/**
 * Tell the turn. `cards`: the engine's cards (each bound to its fact, or to `facts` when folded). opts: { provider, cfg,
 * log, onProgress, own (facts of the lord's own orders, which have no card of the engine's) }. Returns { cards (the chronicle's, stories told in place of their engine cards), meanwhile (one sentence),
 * record (for the turn record: stories, how each was told, the validator's problems by rule) }.
 */
export async function narrateTurn(state, cards, { provider = 'mock', cfg, log, own = [], onProgress } = {}) {
  const idsOf = (c) => (c.facts?.length ? c.facts : c.fact ? [c.fact] : []);
  const cardOf = new Map(); // fact id → its card
  for (const c of cards) for (const id of idsOf(c)) cardOf.set(id, c);
  // the small happenings stay in the Meanwhile list; the rest is news
  const news = cards.filter((c) => !c.bg && idsOf(c).length);
  // and the lord's own deeds this turn, which the chronicle tells under the order that made them (orders.js orderEvents)
  const carded = new Set(cards.flatMap(idsOf));
  // a card that news reached by raven or rumour (`heard`, and `late` if it came after the week it happened in) hands that on to
  // its facts, so the clusterer never tells what was seen and what was heard as one story (B-32a); the log's own facts stay as they are
  const heard = (f, c) => (f && (c.heard || c.late) ? { ...f, ...(c.heard ? { heard: c.heard } : {}), ...(c.late ? { late: true } : {}) } : f);
  const facts = [...news.flatMap((c) => idsOf(c).map((id) => heard(factById(state, id), c)).filter(Boolean)), ...own.filter((f) => !carded.has(f.id))];
  const small = cards.filter((c) => c.bg).map((c) => c.text).filter(Boolean);
  const { stories, meanwhile } = clusterFacts(state, facts, { together: news.filter((c) => idsOf(c).length > 1).map(idsOf) });
  const smallTexts = [...small, ...meanwhile.map((f) => f.text)];
  // the stories by their facts, and the small happenings: enough to tell this turn again (the bench's narrate suite)
  const record = { stories: stories.length, told: 0, again: 0, plain: 0, problems: {}, groups: stories.map((s) => s.facts.map((f) => f.id)), small: smallTexts.slice(0, 8) };
  if (!stories.length) return { cards, meanwhile: '', record };
  const tally = (problems) => { record.faults = [...(record.faults || []), ...problems].slice(0, 12); for (const p of problems) { const rule = String(p).split(' — ')[0].split(': ')[1] || 'other'; record.problems[rule] = (record.problems[rule] || 0) + 1; } };

  const first = await runCall('narrate', state, { stories, meanwhile: smallTexts }, { provider, cfg, log, onProgress });
  record.via = first.via;
  if (first.ctx) record.key = CALLS.narrate.fingerprint(first.ctx); // the recording a replay of this telling looks for
  if (first.via === 'fallback' || !first.value?.events) { tally(first.problems || []); record.plain = stories.length; return { cards, meanwhile: '', record }; }
  tally(first.problems);
  const told = new Map(first.value.events.map((e) => [e.story, e]));
  // a story that failed (or was left out) is told again alone, with what was wrong — on a model; the mock is what it is
  for (const s of stories) {
    if (told.has(s.id)) continue;
    const reason = first.problems.filter((p) => p.startsWith(`${s.id}:`)).map((p) => p.slice(s.id.length + 2));
    if (first.via !== 'model') { record.plain++; continue; }
    record.again++;
    const r = await runCall('narrate', state, { stories, only: s.id, reason: reason.length ? reason : ['it was not told'] }, { provider, cfg, log, onProgress });
    if (r.via !== 'fallback' && r.value?.events?.length && !r.problems.length) told.set(s.id, r.value.events[0]); else { tally(r.problems); record.plain++; }
  }
  // each story told becomes one card in place of the engine's cards for its facts
  const orderOf = new Map((state.orders || []).map((o, i) => [o.id, i + 1]));
  const out = []; const replaced = new Set();
  for (const s of stories) {
    const e = told.get(s.id); if (!e) continue;
    const mine = [...new Set(s.facts.map((f) => cardOf.get(f.id)).filter(Boolean))];
    mine.forEach((c) => replaced.add(c));
    const order = s.facts.map((f) => f.cause?.type === 'order' && orderOf.get(f.cause.ref)).find(Boolean);
    out.push({
      title: e.headline, text: e.line, details: e.scene, pov: e.pov, where: s.place, importance: s.importance, type: s.type,
      houses: s.houses, day: s.days[0], fact: s.facts[0].id, facts: s.facts.map((f) => f.id), narrated: true,
      // the record keeps the engine's own words, the battle report's (what decided it) among them
      record: mine.map((c) => [c.text, c.details].filter(Boolean).join(' ')).filter(Boolean),
      ...(mine.some((c) => c.mine) ? { mine: true } : {}), ...(order ? { order } : {}), ...(mine.find((c) => c.at)?.at ? { at: mine.find((c) => c.at).at } : {}),
    });
    record.told++;
  }
  return { cards: [...cards.filter((c) => !replaced.has(c)), ...out].sort((a, b) => (a.day || 0) - (b.day || 0)), meanwhile: first.value.meanwhile || '', record };
}
