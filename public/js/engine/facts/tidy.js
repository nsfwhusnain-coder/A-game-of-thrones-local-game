// The engine's own sentences, told as a herald would (bug hunt TX4). The engine writes "House ${house.name}" in hundreds of sentences (a fact's text, a receipt,
// a party's name), and the data's names are its own: "The Free Folk", "Baratheon of King's Landing", "Woolfield of Woolfield", "Khalasar of Drogo". This is the
// one place that turns such a sentence into what a herald would say ("The Free Folk calls up 12,000 levies", "the Crown sends 500 gold dragons", "Host of House
// Woolfield"), so that every one of those sentences is mended at the door (a fact is made, a receipt is told) and none has to be found.
//
// Pure and browser-safe: no I/O, no dice, no clock.
import { houseLabel } from './label.js';

const tables = new WeakMap();
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function tableFor(state) {
  const n = Object.keys(state?.houses || {}).length; const had = tables.get(state);
  if (had && had.n === n) return had;
  const map = new Map();
  for (const h of Object.values(state?.houses || {})) {
    const raw = `House ${String(h.name || '').trim()}`; const label = houseLabel(state, h.id);
    if (h.name && label !== raw) map.set(raw.toLowerCase(), label);
  }
  const keys = [...map.keys()].sort((a, b) => b.length - a.length);
  const re = keys.length ? new RegExp(`\\b(?:${keys.map(escape).join('|')})(?![\\w'’-])`, 'gi') : null;
  const made = { n, map, re }; tables.set(state, made);
  return made;
}

/** A sentence of the engine's with its house names told as names: "House The Free Folk calls up…" is "The Free Folk calls up…". Text that names no such house comes back as it is. */
export function tidyHouseNames(state, text) {
  const s = String(text ?? ''); if (!s || !state?.houses || !/house/i.test(s)) return s;
  const { map, re } = tableFor(state); if (!re) return s;
  return s.replace(re, (m, at) => {
    const to = map.get(m.toLowerCase()); if (!to) return m;
    const opens = at === 0 || /[.!?:]\s*$/.test(s.slice(0, at)); // a sentence's first word is capitalised ("the Crown" is "The Crown" there)
    return opens ? to.charAt(0).toUpperCase() + to.slice(1) : to;
  });
}
