// The chronicle as a list of cards (docs/gdd/18-headlines.md §2.6, WP N7): which cards a turn shows, in what order, under which day, and what
// the maester's report at the end of a turn says. Pure functions of the turn records the player has been sent (`state.history`, whose cards
// the server has already put through the knowledge filters) and the player's own house — no DOM, no clock, no dice, nothing else of the
// state — so node can test them on real games and the browser draws them (ui/drawer.js, ui/report.js).
import { tierOf as tierOfScore, TIERS } from '../engine/facts/rank.js';
import { digestOf } from '../engine/facts/digest.js';
import { ordinal, MONTHS } from '../engine/time.js';

/** The tiers a lord wants by default: news and above (a minor thing is a headline for those who ask for it). */
export const MATTERS = TIERS.slice(TIERS.indexOf('news'));
export const TIER_LABEL = { great: 'Great', major: 'Major', news: 'News', minor: 'Minor', meanwhile: 'Meanwhile' };

const RUMOUR = /^(rumou?r|it is said|word comes|men say)/i;
const WAR_ARCHETYPES = new Set(['battle', 'siege', 'muster', 'march', 'capture']);
/** A card's tier: the one the ranker gave it, or — for a card from before the tiers — what its score says. */
export const cardTier = (e) => e.tier || (e.bg ? 'meanwhile' : tierOfScore(Number.isFinite(e.score) ? e.score : (e.importance || 1) + (e.mine ? 1 : 0)));
export const isMine = (e, me) => !!e.mine || (e.houses || []).includes(me);
export const isRumour = (e) => e.type === 'rumor' || e.heard?.via === 'rumour' || RUMOUR.test(e.summary ?? e.text ?? '');
export const isLetter = (e) => ['raven', 'letter', 'rider'].includes(e.heard?.via) || e.archetype === 'letter';
export const isWar = (e) => e.type === 'war' || WAR_ARCHETYPES.has(e.archetype);

/** The filters after "Only what matters": what the chip says and the question it asks of a card. */
export const FILTERS = [
  { id: 'mine', label: 'Mine', hint: 'Your house, your kin and your people', keep: (e, me) => isMine(e, me) },
  { id: 'war', label: 'War', hint: 'Battles, sieges, musters and marches', keep: (e) => isWar(e) },
  { id: 'letters', label: 'Letters', hint: 'What came by raven or letter', keep: (e) => isLetter(e) },
  { id: 'rumours', label: 'Rumours', hint: 'What is only said', keep: (e) => isRumour(e) },
];

/** A turn's told stories, in the order they are told: by day; on a day, what the lord ordered first, then the weightiest. */
export function storyOrder(t) {
  return (t.events || []).map((e, i) => [e, i]).filter(([e]) => !e.bg)
    .sort(([a, i], [b, j]) => (a.day || 0) - (b.day || 0) || (b.orderId ? 1 : 0) - (a.orderId ? 1 : 0) || (b.importance || 0) - (a.importance || 0) || i - j).map(([e]) => e);
}

/**
 * What the chronicle shows: for each of the last `turns` turns, newest first, its cards newest first — `{ id: 'turn:index', turn, idx, e, tier,
 * mine, rumour, late }`, kept by "Only what matters" (`matters`, tier news or above) and by at most one of the other filters (`only`, a
 * FILTERS id). A turn keeps `held`, the cards the filters hid, and `small`, the count of what is told only in its Meanwhile.
 * `hidden` is every card held back, so the panel can say so.
 */
export function feedOf(state, { matters = true, only = null, turns = 30 } = {}) {
  const me = state.meta.player; const ask = FILTERS.find((f) => f.id === only)?.keep;
  const groups = []; let hidden = 0;
  for (const t of [...(state.history || [])].sort((a, b) => b.turn - a.turn).slice(0, turns)) {
    const cards = []; let held = 0;
    for (const e of storyOrder(t).reverse()) {
      const tier = cardTier(e);
      if ((matters && !MATTERS.includes(tier)) || (ask && !ask(e, me))) { held++; continue; }
      const idx = (t.events || []).indexOf(e);
      cards.push({ id: `${t.turn}:${idx}`, turn: t.turn, idx, e, tier, mine: isMine(e, me), rumour: isRumour(e), late: !!e.heard?.happened });
    }
    hidden += held;
    groups.push({ turn: t.turn, date: t.date, cards, held, small: (t.events || []).filter((e) => e.bg).length, meanwhile: t.meanwhile || '' });
  }
  return { groups, hidden };
}

/** The ids of every told story of the last turns, for "N new": the panel marks them read when it is closed. */
export function feedIds(state, turns = 30) {
  return [...(state.history || [])].sort((a, b) => b.turn - a.turn).slice(0, turns).flatMap((t) => storyOrder(t).map((e) => `${t.turn}:${(t.events || []).indexOf(e)}`));
}

// ───────────── the maester's report ─────────────
const DATE = /^(\d+) (\d+)(?:st|nd|rd|th) moon, (\d+) AC$/;
const parts = (s) => { const m = DATE.exec(String(s || '').trim()); return m ? { day: Number(m[1]), month: Number(m[2]), year: Number(m[3]) } : null; };
const moon = (m) => MONTHS[m - 1];

/** "16 8th moon, 298 AC" → "16th of the 8th moon" (the year is the panel's, not each card's); anything else, as it came less its year. */
export function shortDate(str) {
  const d = parts(str); return d ? `${ordinal(d.day)} of the ${moon(d.month)}` : String(str || '').replace(/, d+ AC$/, '');
}
/** The days a turn told: "2nd–8th of the 8th moon, 298 AC" — with its length in days. */
export function daysOf(t) {
  const segs = t.segments || [];
  const from = parts(segs[0]?.from) || parts(t.dateFrom); const to = parts(segs.at(-1)?.to) || parts(t.date);
  if (!to) return { text: String(t.date || ''), days: 0 };
  if (!from || (from.year === to.year && from.month === to.month && from.day === to.day)) return { text: `${ordinal(to.day)} of the ${moon(to.month)}, ${to.year} AC`, days: 1 };
  const days = (to.year - from.year) * 360 + (to.month - from.month) * 30 + (to.day - from.day) + 1;
  const same = from.year === to.year && from.month === to.month;
  const text = same ? `${ordinal(from.day)}–${ordinal(to.day)} of the ${moon(to.month)}, ${to.year} AC`
    : `${ordinal(from.day)} of the ${moon(from.month)}${from.year === to.year ? '' : `, ${from.year} AC`} to ${ordinal(to.day)} of the ${moon(to.month)}, ${to.year} AC`;
  return { text, days };
}
/** The days a turn told, as a title: "The week of 2nd–8th of the 8th moon, 298 AC". */
export function reportTitle(t) {
  const { text, days } = daysOf(t);
  if (days <= 1) return `The ${text}`;
  return `${days === 7 ? 'The week of' : days < 7 ? `The ${days} days of` : 'The days from'} ${text}`;
}

/** What the maester's report says of a turn: its digest (built by the engine from the cards) and its title; null when the turn had nothing to tell. */
export function reportOf(t) {
  const d = t.digest && t.digest.top ? t.digest : digestOf(t.events || [], t.meanwhile || '');
  if (!d.top.length && !d.also.length && !d.meanwhile) return null;
  return { title: reportTitle(t), top: d.top, also: d.also, meanwhile: d.meanwhile, turn: t.turn };
}
