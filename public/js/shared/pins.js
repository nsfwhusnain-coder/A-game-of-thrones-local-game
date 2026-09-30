// What the map marks for the player: news they have not yet read, and matters that wait on their word.
// A pin stays until the player opens it and acknowledges the news (or answers the matter); then it goes.
// Shared by the map (where to draw pins) and the pin window (what to show when one is clicked).

import { placeOf } from '../engine/parties.js';
import { dayNumber } from '../engine/time.js';

// how long an unread piece of news keeps its pin, in turns
const NEWS_TURNS = 2;

export const eventKey = (turn, e, i) => e.id || `${turn}-${i}`;

/**
 * Days until the world decides a matter without the lord, or null for one with no reckoning (a save from before the days were kept). The engine lapses a matter when
 * `today − day ≥ days` (server/game.js closeTurn).
 */
export const decisionDaysLeft = (s, d) => (d.day == null || d.days == null ? null : Math.max(0, d.days - (dayNumber(s.meta.date) - d.day)));

/** "6 days left", "1 day left", "the last day" (0), "" when there is no reckoning. */
export const leftWord = (n) => (n == null ? '' : n <= 0 ? 'the last day' : n === 1 ? '1 day left' : `${n} days left`);

// Where a pending decision belongs on the map: where it happened, else where the asker is, else their seat, else yours
export function decisionPlace(s, d) {
  if (d.where && s.holdings[d.where]) return d.where;
  const c = d.from && s.characters[d.from];
  if (c && s.holdings[placeOf(s, c)]) return placeOf(s, c);
  if (c && s.houses[c.house]?.seat) return s.houses[c.house].seat;
  return s.houses[s.meta.player]?.seat || null;
}

// Is this piece of news worth a pin? A card of tier news or above with a place, and a minor one that is the player's own (18 §2.6). A card from
// before the tiers is judged as it was, by its importance; the small life of the realm (Meanwhile) only when it touched the player's own.
const PIN_TIERS = new Set(['great', 'major', 'news']);
export function pinworthy(s, e) {
  if (!e.where || !s.holdings[e.where]) return false;
  if (e.bg) return !!e.mine && e.importance >= 2;
  if (!e.tier) return e.importance >= 2;
  return PIN_TIERS.has(e.tier) || (e.tier === 'minor' && !!e.mine);
}
// The card the writer made of a battle: the recent turn's battle card of the same two houses (a headline that says who beat whom, not "X defeated Y.")
function battleCard(s, b) {
  const sides = [b.attacker, b.defender].filter(Boolean); if (!sides.length) return null;
  for (const t of [...(s.history || [])].reverse().slice(0, NEWS_TURNS + 1)) {
    const e = (t.events || []).find((x) => !x.bg && x.archetype === 'battle' && sides.every((h) => (x.houses || []).includes(h)));
    if (e) return e;
  }
  return null;
}

/** Every open pin: Map(where → { events:[{...e, key}], decisions:[d] }) */
export function openPins(s) {
  const acks = s.acks || {}; const out = new Map();
  const add = (where, kind, item) => { if (!out.has(where)) out.set(where, { events: [], decisions: [] }); out.get(where)[kind].push(item); };
  for (const t of (s.history || []).slice(-NEWS_TURNS)) {
    if (s.meta.turn - t.turn >= NEWS_TURNS) continue;
    (t.events || []).forEach((e, i) => { const key = eventKey(t.turn, e, i); if (!acks[key] && pinworthy(s, e)) add(e.where, 'events', { ...e, key, turn: t.turn, date: t.date }); });
  }
  for (const d of (s.decisions || []).filter((x) => x.status === 'pending')) { const w = decisionPlace(s, d); if (w) add(w, 'decisions', d); }
  // battles fought away from any castle are pinned where they were fought
  (s.battles || []).forEach((b, i) => {
    if (!b.pos || s.meta.turn - b.turn >= NEWS_TURNS) return; const key = `battle-${b.turn}-${i}`; if (acks[key]) return;
    const where = `@battle${i}`; const card = battleCard(s, b);
    if (card) add(where, 'events', { ...card, key, turn: b.turn, date: b.date, importance: Math.max(card.importance || 0, 4), type: 'war', houses: card.houses?.length ? card.houses : [b.attacker, b.defender].filter(Boolean) });
    else add(where, 'events', { title: b.name, text: b.summary || `${s.houses[b.victor]?.name ? 'House ' + s.houses[b.victor].name + ' won the field.' : 'The field is red.'}`, details: Object.entries(b.losses || {}).map(([h, n]) => `${s.houses[h]?.name || h} lost ~${n} men.`).join(' '), importance: 4, type: 'war', key, turn: b.turn, date: b.date, houses: [b.attacker, b.defender].filter(Boolean) });
    out.get(where).pos = b.pos;
  });
  for (const g of out.values()) g.events.sort((a, b) => (b.importance || 0) - (a.importance || 0) || (a.day || 0) - (b.day || 0));
  return out;
}

/**
 * The pins to draw when there are more than `max` open (WP U8): matters that await the player's word first, then the weightiest news, then the newest; the rest are
 * counted behind a "+n" bubble. `groups`: the map openPins() returns. `{ shown: [where…], hidden: [where…] }`, each in the order of showing.
 */
export function capPins(groups, max = 6) {
  const rank = (g) => [g.decisions.length ? 1 : 0, Math.max(0, ...g.events.map((e) => e.importance || 0)), Math.max(0, ...g.events.map((e) => e.turn || 0))];
  const order = [...groups.entries()].sort((a, b) => { const x = rank(a[1]), y = rank(b[1]); return (y[0] - x[0]) || (y[1] - x[1]) || (y[2] - x[2]) || String(a[0]).localeCompare(String(b[0])); }).map(([w]) => w);
  return { shown: order.slice(0, max), hidden: order.slice(max) };
}
