// The turn told (docs/gdd/04-ai-system.md §6, docs/gdd/18-headlines.md §3.2). The engine's cards for what the player's house
// reads this turn are gathered into stories by their facts (engine/facts/cluster.js); the engine's writer (engine/facts/headline.js)
// tells every story as a card — a headline that alone says what happened, and a short plain summary — and the stories are ranked
// for the one reading (engine/facts/rank.js). The narrator is asked to say the top few better; each telling is held to its facts and
// to the headline rules (validate/narration.js, validate/headline.js). A telling that fails is told again alone, once, with what was
// wrong; one that fails again leaves the writer's card in its place — as good as the engine can make it, and true. A story becomes
// one card carrying its facts and the engine's lines it replaces ("the record"), so the numbers are always one click from the prose.
// The chronicle is never allowed to be wrong, and never allowed to read like a ledger.
import { runCall, CALLS } from './ai/client.js';
import { factById } from '../public/js/engine/facts/log.js';
import { clusterFacts } from '../public/js/engine/facts/cluster.js';
import { cardOf, meanwhileOf } from '../public/js/engine/facts/headline.js';
import { rankStories, byScore, TIERS } from '../public/js/engine/facts/rank.js';
import { checkMeanwhile } from './ai/validate/headline.js';
import { modeOf, tidyScene } from './ai/calls/narrate.js';

/** Whether the narrator tells the turn (config `narrator`: "on" by default; "off" keeps the old Bard of the swarm). */
export const narratorOn = (cfg) => !(cfg.narrator === 'off' || cfg.narrator === false);

/** How many stories the model is asked to tell: the top of the ranking (news and above); the writer tells the rest (18 §2.4 C6). */
export const TELL_MAX = 6;
const TELL_FROM = TIERS.indexOf('news');
/** In mode "scenes": how many stories are given a scene, the ones that matter most (major and great only). */
export const SCENE_MAX = 3;
const SCENE_FROM = TIERS.indexOf('major');

/**
 * Tell the turn. `cards`: the engine's cards (each bound to its fact, or to `facts` when folded). opts: { provider, cfg,
 * log, onProgress, own (facts of the lord's own orders, which have no card of the engine's), lookup (a fact by id: the turn's, or one of
 * an earlier turn's that news is only now reaching the house) }. Returns { cards (the chronicle's,
 * every story told as one card, in place of its engine cards), meanwhile (one sentence), record (for the turn record: stories, how
 * each was told, the validator's problems by rule), ranked (for each story its id, first-of-its-kind key, tier and score) }.
 */
export async function narrateTurn(state, cards, { provider = 'mock', cfg, log, own = [], onProgress, lookup = null } = {}) {
  const find = (id) => (lookup ? lookup(id) : null) || factById(state, id);
  const idsOf = (c) => (c.facts?.length ? c.facts : c.fact ? [c.fact] : []);
  const cardOfFact = new Map(); // fact id → its card
  for (const c of cards) for (const id of idsOf(c)) cardOfFact.set(id, c);
  // the small happenings stay in the Meanwhile; the rest is news
  const news = cards.filter((c) => !c.bg && idsOf(c).length);
  // and the lord's own deeds this turn, which the chronicle tells under the order that made them (orders.js orderEvents)
  const carded = new Set(cards.flatMap(idsOf));
  // a card that news reached by raven or rumour (`heard`, and `late` if it came after the week it happened in) hands that on to
  // its facts, so the clusterer never tells what was seen and what was heard as one story (B-32a); the log's own facts stay as they are
  const heard = (f, c) => (f && (c.heard || c.late) ? { ...f, ...(c.heard ? { heard: c.heard } : {}), ...(c.late ? { late: true } : {}) } : f);
  const facts = [...news.flatMap((c) => idsOf(c).map((id) => heard(find(id), c)).filter(Boolean)), ...own.filter((f) => !carded.has(f.id))];
  const smallCards = cards.filter((c) => c.bg);
  const { stories, meanwhile } = clusterFacts(state, facts, { together: news.filter((c) => idsOf(c).length > 1).map(idsOf) });
  // the facts of the Meanwhile: the bg cards' and the clusterer's own (a lone journey of another house)
  const seen = new Set(); const smallFacts = [];
  for (const f of [...smallCards.flatMap((c) => idsOf(c).map(find)), ...meanwhile]) if (f && !seen.has(f.id)) { seen.add(f.id); smallFacts.push(f); }
  const smallTexts = [...smallCards.map((c) => c.text), ...meanwhile.map((f) => f.text)].filter(Boolean);
  // the stories by their facts, and the small happenings: enough to tell this turn again (the bench's narrate suite)
  const record = { stories: stories.length, told: 0, again: 0, plain: 0, written: 0, problems: {}, groups: stories.map((s) => s.facts.map((f) => f.id)), small: smallTexts.slice(0, 8) };
  const ranks = rankStories(state, stories);
  const ranked = ranks.map((r) => ({ id: r.id, key: r.key, tier: r.tier, score: r.score }));
  const rankOf = new Map(ranks.map((r) => [r.id, r]));
  // the small happenings as cards of their own, told by the writer: the raw engine line is kept as the record
  const smallOut = smallCards.map((c) => meanwhileCard(state, c, idsOf, find));
  const written = meanwhileOf(state, smallFacts);
  // what is left after the stories are told: a card of the engine's whose facts are all of the small news (a lord's small errand, a journey of another house) is a Meanwhile card too, told by the
  // writer, and so is any small card of a fact that no story took (another house's works begun, a gift sent, a regency begun); any other card no story took stays as the engine made it (a lord's order, its receipt)
  const tail = (out, replaced) => {
    const small = new Set(meanwhile.map((f) => f.id));
    const isSmall = (c) => idsOf(c).length > 0 && idsOf(c).every((id) => small.has(id));
    const errand = (c) => (c.importance ?? 1) <= 2 && !c.orderId && !c.order && idsOf(c).length > 0;
    const restAll = cards.filter((c) => !replaced.has(c) && !c.bg);
    const smallLeft = restAll.filter((c) => isSmall(c) || errand(c)).map((c) => ({ ...meanwhileCard(state, c, idsOf, find), bg: true }));
    const rest = restAll.filter((c) => !isSmall(c) && !errand(c));
    return [...rest, ...out, ...smallOut, ...smallLeft].sort((a, b) => (a.day || 0) - (b.day || 0));
  };
  if (!stories.length) return { cards: tail([], new Set()), meanwhile: written, record, ranked };
  const tally = (problems) => { record.faults = [...(record.faults || []), ...problems].slice(0, 12); for (const p of problems) { const rule = String(p).split(' — ')[0].split(': ')[1] || 'other'; record.problems[rule] = (record.problems[rule] || 0) + 1; } };

  // the model tells the top of the ranking; the writer tells the rest
  const mode = modeOf(cfg); record.mode = mode;
  const ask = byScore(ranks).filter((r) => TIERS.indexOf(r.tier) >= (mode === 'scenes' ? SCENE_FROM : TELL_FROM)).slice(0, mode === 'scenes' ? SCENE_MAX : TELL_MAX).map((r) => r.story).sort((a, b) => stories.indexOf(a) - stories.indexOf(b));
  record.written = stories.length - ask.length; record.asked = ask.map((s) => s.id); record.smallIds = smallFacts.map((f) => f.id);
  const told = new Map(); let via = 'writer'; let mw = ''; record.via = via;
  if (ask.length) {
    const rk = Object.fromEntries(ask.map((s) => [s.id, { tier: rankOf.get(s.id).tier, score: rankOf.get(s.id).score }]));
    const first = await runCall('narrate', state, { stories: ask, small: smallFacts, ranks: rk, mode }, { provider, cfg, log, onProgress });
    via = record.via = first.via;
    if (first.ctx) record.key = CALLS.narrate.fingerprint(first.ctx); // the recording a replay of this telling looks for
    tally(first.problems || []);
    if (first.via === 'fallback' || !first.value?.events) { record.plain = ask.length; via = 'fallback'; } else {
      for (const e of first.value.events) told.set(e.story, e);
      if (mode === 'cards' && first.value.meanwhile && !checkMeanwhile(state, first.value.meanwhile, smallFacts).length) mw = first.value.meanwhile;
      // a story that failed (or was left out) is told again alone, with what was wrong — on a model; the mock is what it is
      for (const s of ask) {
        if (told.has(s.id)) continue;
        const reason = first.problems.filter((p) => p.startsWith(`${s.id}:`)).map((p) => p.slice(s.id.length + 2));
        if (first.via !== 'model') { record.plain++; continue; }
        record.again++;
        const r = await runCall('narrate', state, { stories: ask, small: [], only: s.id, reason: reason.length ? reason : ['it was not told'], ranks: rk, mode }, { provider, cfg, log, onProgress });
        if (r.via !== 'fallback' && r.value?.events?.length && !r.problems.length) told.set(s.id, r.value.events[0]); else { tally(r.problems); record.plain++; }
      }
    }
  }
  record.told = told.size;
  const byModel = via === 'model' || via === 'replay';
  // each story becomes one card in place of the engine's cards for its facts: the model's telling if it passed, else the writer's
  const orderOf = new Map((state.orders || []).map((o, i) => [o.id, i + 1]));
  const out = []; const replaced = new Set();
  for (const s of stories) {
    const w = cardOf(state, s); const e = told.get(s.id); const r = rankOf.get(s.id);
    const mine = [...new Set(s.facts.map((f) => cardOfFact.get(f.id)).filter(Boolean))];
    mine.forEach((c) => replaced.add(c));
    const order = s.facts.map((f) => f.cause?.type === 'order' && orderOf.get(f.cause.ref)).find(Boolean);
    // mode "scenes": the card is always the writer's, the scene the model's; mode "cards": the model's card when it passed
    const headline = mode === 'cards' && e?.headline ? e.headline : w.headline; const summary = mode === 'cards' && e?.summary ? e.summary : w.summary;
    const scene = tidyScene(e?.scene);
    out.push({
      headline, summary, details: w.details, ...(scene ? { scene, pov: s.pov?.name || '' } : {}),
      // the old names of the same words, for the surfaces not yet rewritten (title, text) and for saves that read them
      title: headline, text: summary,
      told: e && byModel && (mode === 'cards' || scene) ? 'model' : 'writer', kind: w.kind, archetype: w.archetype, who: w.who, tier: r.tier, score: r.score,
      where: s.place, importance: s.importance, type: s.type, houses: s.houses, day: s.days[0], fact: s.facts[0].id, facts: s.facts.map((f) => f.id), narrated: true,
      ...(r.tier === 'meanwhile' ? { bg: true } : {}), // a story too small to rank above the Meanwhile is a Meanwhile card (the feed holds no other tier in the news)
      // the record keeps the engine's own words, the battle report's (what decided it) among them
      record: mine.map((c) => [c.text, typeof c.details === 'string' ? c.details : ''].filter(Boolean).join(' ')).filter(Boolean),
      ...(s.heard ? { heard: s.heard } : {}), ...(s.late ? { late: true } : {}),
      ...(mine.some((c) => c.mine) ? { mine: true } : {}), ...(order ? { order } : {}), ...(mine.find((c) => c.at)?.at ? { at: mine.find((c) => c.at).at } : {}),
    });
  }
  return { cards: tail(out, replaced), meanwhile: mw || written, record, ranked };
}

/** A small happening as a card of its own: the writer's headline and one plain sentence; the engine's line kept as the record. */
function meanwhileCard(state, c, idsOf, find) {
  const fs = idsOf(c).map(find).filter(Boolean);
  if (!fs.length) return c;
  let w; try { w = cardOf(state, { facts: fs, place: c.where }); } catch { return c; }
  if (!w.headline) return c;
  return { ...c, headline: w.headline, summary: w.summary, title: w.headline, text: w.summary || w.headline, details: w.details, tier: 'meanwhile', score: 1, told: 'writer', kind: w.kind, archetype: w.archetype, who: w.who, record: [c.text].filter(Boolean) };
}

