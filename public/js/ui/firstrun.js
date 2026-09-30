// First-run guidance that goes away (docs/gdd/17-ui-declutter.md §2.6, WP U8; mockup 08): one welcome card on a new game, three coach marks that
// each vanish when the thing is done, and a tip about focus mode after the third turn. The rules are here, pure, so node can test them; ui/welcome.js
// draws them. Nothing here is asked of the server but a flag ("the welcome has been read"), and none of it is shown on a game already under way.
import { briefFor } from '../../data/briefs.js';

/** The three marks, in order: what they point at, what they say, and the thing that puts each away (`on`: 'order', 'turn', 'realm'). */
export const COACH = [
  { id: 'command', target: '#order-input', text: 'Tell your house what to do, in your own words.', on: 'order', side: 'above' },
  { id: 'turn', target: '#hud-top .advance-btn', text: 'Then let the world move.', on: 'turn', side: 'below' },
  { id: 'realm', target: '#menu-btn', text: 'Open the menu to see how your house stands.', on: 'realm', side: 'below' },
];

/**
 * What the welcome card says: the game's name and year, the lord, the situation, the aims and the levers (the house's brief, as the title screen shows it).
 * `{ kicker, title, lord, situation, aims, levers }`, all plain strings (drawn escaped).
 */
export function welcomeOf(state) {
  const me = state.houses[state.meta.player]; const lord = me.lord ? state.characters?.[me.lord] : null;
  const b = briefFor(me, state);
  return {
    kicker: `A Game of Thrones · ${state.meta.date?.year || 298} AC`, title: 'Your situation',
    lord: lord ? `${lord.name}${me.title ? `, ${me.title}` : ''}` : `House ${me.name}`,
    situation: b.situation, aims: [...(b.goals || [])], levers: [...(b.levers || [])],
  };
}

/** Whether the welcome is shown: a game not yet begun (turn 0), whose card has not been read here (`localFlag`) nor on the server (`meta.welcomed`). */
export const shouldWelcome = (state, { localFlag = false } = {}) => (state.meta.turn || 0) === 0 && !state.meta.welcomed && !localFlag;

/** The mark to show now: the first not yet done, or null when all are (`done`: array or Set of ids). */
export function nextCoach(done = []) { const d = new Set(done); return COACH.find((c) => !d.has(c.id)) || null; }
/** `done` after `event` ('order', 'turn', 'realm'): the mark that event puts away is done, and no other. The array is a new one. */
export function coachAfter(done = [], event) {
  const c = COACH.find((x) => x.on === event); const d = new Set(done);
  if (c) d.add(c.id);
  return COACH.map((x) => x.id).filter((id) => d.has(id));
}
/** The quiet tip about focus mode: once, from the third turn on. */
export const quietTip = (turn, seen = false) => !seen && (turn || 0) >= 3;
export const QUIET_TIP = 'Press F to hide everything but the map. Press it again to bring it back.';

/**
 * Where a coach mark's slip goes for a target's box `t` ({ x0, y0, x1, y1 }) on a screen `screen` ({ w, h }): `{ left, top, arrow, dot }`. The slip (`size` { w, h }) sits above or
 * below the target (`side`), centred on it and kept inside the screen; `arrow` is 'up' (the slip is below, its arrow points up) or 'down'; `dot` is where the wax dot goes (on the target's near corner).
 */
export function placeCoach(t, size, screen, side = 'below', gap = 14, margin = 8) {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const cx = (t.x0 + t.x1) / 2;
  const roomBelow = screen.h - t.y1 - gap - margin, roomAbove = t.y0 - gap - margin;
  const below = side === 'below' ? roomBelow >= size.h || roomBelow >= roomAbove : roomAbove < size.h && roomBelow > roomAbove;
  const top = below ? t.y1 + gap : t.y0 - gap - size.h;
  const left = clamp(cx - size.w / 2, margin, screen.w - size.w - margin);
  return { left: Math.round(left), top: Math.round(clamp(top, margin, screen.h - size.h - margin)), arrow: below ? 'up' : 'down', arrowX: Math.round(clamp(cx - left, 16, size.w - 16)), dot: { x: Math.round(cx), y: Math.round(below ? t.y1 : t.y0) } };
}
