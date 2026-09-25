// What the map marks for the player: news they have not yet read, and matters that wait on their word.
// A pin stays until the player opens it and acknowledges the news (or answers the matter); then it goes.
// Shared by the map (where to draw pins) and the pin window (what to show when one is clicked).

// how long an unread piece of news keeps its pin, in turns
const NEWS_TURNS = 2;

export const eventKey = (turn, e, i) => e.id || `${turn}-${i}`;

// Where a pending decision belongs on the map: where it happened, else where the asker is, else their seat, else yours
export function decisionPlace(s, d) {
  if (d.where && s.holdings[d.where]) return d.where;
  const c = d.from && s.characters[d.from];
  if (c && s.holdings[c.loc]) return c.loc;
  if (c && s.houses[c.house]?.seat) return s.houses[c.house].seat;
  return s.houses[s.meta.player]?.seat || null;
}

// Is this piece of news worth a pin? The great events of the turn, and whatever touched the player's own lands.
function pinworthy(s, e) {
  if (!e.where || !s.holdings[e.where]) return false;
  if (e.bg) return !!e.mine && e.importance >= 2;
  return e.importance >= 2;
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
    const where = `@battle${i}`; add(where, 'events', { title: b.name, text: b.summary || `${s.houses[b.victor]?.name ? 'House ' + s.houses[b.victor].name + ' won the field.' : 'The field is red.'}`, details: Object.entries(b.losses || {}).map(([h, n]) => `${s.houses[h]?.name || h} lost ~${n} men.`).join(' '), importance: 4, type: 'war', key, turn: b.turn, date: b.date, houses: [b.attacker, b.defender].filter(Boolean) });
    out.get(where).pos = b.pos;
  });
  for (const g of out.values()) g.events.sort((a, b) => (b.importance || 0) - (a.importance || 0) || (a.day || 0) - (b.day || 0));
  return out;
}
