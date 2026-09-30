// Letters on the wing (docs/gdd/12-ui-ux.md §7.1, §7.2; WP F4). A letter flies for days and is read when it lands; until then all the player has is that it is on the wing and when
// it should land. Pure: what is in flight, to whom, and how long, from the state the player already holds (the answers still on the road are not in it: server/view.js).
import { dayNumber } from '../engine/time.js';

/** "lands tomorrow", "lands in ~4 days". */
export const landsWord = (days) => (days <= 1 ? 'lands tomorrow' : `lands in ~${days} days`);

/** The player's letters still flying, soonest first: `{ id, toId, toName, days, sent, text }`. */
export function lettersOnTheWing(s) {
  const today = dayNumber(s.meta.date);
  return (s.post || []).filter((l) => !l.reply && l.status === 'in flight')
    .map((l) => ({ id: l.id, toId: l.to, toName: l.toName, days: Math.max(1, l.arriveDay - today), sent: String(l.sent || '').replace(/, \d+ AC$/, ''), text: String(l.text || '') }))
    .sort((a, b) => a.days - b.days || String(a.id).localeCompare(String(b.id)));
}
/** The first of them to one person, or null: what an audience by raven says of the letter already flying to them. */
export const letterTo = (s, charId) => lettersOnTheWing(s).find((l) => l.toId === charId) || null;
