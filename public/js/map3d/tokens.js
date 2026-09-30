// Party tokens and plates (docs/gdd/11-map-visuals.md §6.1; WP E5): what each kind of party looks like on the map and
// what its plate says, and the clustering of plates that stand on top of one another into one stack ("3 hosts · 11,400").
// No three.js and no DOM here: the rules only, so they can be tested without a canvas.
import { fmt } from '../shared/world.js';

const surname = (name) => String(name || '').replace(/^(Ser|Lord|Lady|King|Queen|Prince|Princess|Maester) /, '');

/**
 * The token a party shows the player, or null when it is not shown as a token (a garrison is a count on its castle's
 * card, not a token; a host the player has no word of is not on their map).
 * `v` is the player's view of it (engine/knowledge.js viewOfArmies), `lod` the camera's level (0 far … 3 near).
 * Returns { kind, plate, hover, cls, scale, always }: `plate` the words on it (HTML-safe text; the `men` part is bold),
 * `hover` the words when the pointer is on it, `cls` extra classes, `scale` the token's size, `always` a plate that is
 * shown from the farthest zoom (the King's progress).
 */
export function tokenOf(s, a, v, lod = 1) {
  if (!a || a.kind === 'garrison') return null;
  const mine = a.owner === s.meta.player;
  const lead = s.characters[a.commander];
  const dest = s.holdings[a.march?.to]?.name || s.holdings[a.purpose?.dest]?.name || '';
  if (a.kind === 'progress') {
    if (!v && !mine && !a.public) return null;
    return { kind: 'progress', men: a.men, plate: 'The King\'s progress', hover: `The King's progress${dest ? ` → ${dest}` : ''} · ${fmt(a.men)} riders, knights and wagons`, cls: 'progress', scale: 1.5, always: true };
  }
  if (a.kind === 'retinue') {
    if (!v && !mine && !a.public) return null;
    const who = lead ? lead.name : a.name;
    return { kind: 'retinue', men: a.men, plate: '', hover: `${who}${dest ? ` → ${dest}` : ''} · ${fmt(a.men)} riders`, cls: 'retinue', scale: 0.7 };
  }
  if (!v) return null;
  const n = a.kind === 'fleet' ? a.ships : v.men;
  const scale = Math.max(0.6, Math.min(1.6, 0.4 + Math.log10(Math.max(10, a.kind === 'fleet' ? (a.ships || 1) * 60 : v.men)) * 0.3));
  if (v.known === 'reported') {
    // the word's age only once it is a week old or more: this week's word is the plate alone
    const age = v.age ? `${v.age * 7} days old` : '';
    return { kind: a.kind === 'fleet' ? 'fleet' : 'host', men: v.men, reported: true, plate: `~${a.kind === 'fleet' ? `${n || '?'} ships` : fmt(v.men)}?${age ? ` · ${age}` : ''}`, hover: `Unconfirmed: ${a.kind === 'fleet' ? 'a fleet' : `a host of ~${fmt(v.men)}`} reported ${age ? age.replace(' old', ' ago') : 'this week'} (${v.source})`, cls: 'reported', scale };
  }
  if (a.kind === 'fleet') return { kind: 'fleet', men: a.men || 0, ships: a.ships || 0, plate: `${mine ? '' : '~'}${a.ships || '?'} ships`, hover: `${a.name}${lead ? `, under ${lead.name}` : ''}`, cls: 'fleet', scale };
  if (a.kind === 'band') return { kind: 'band', men: a.men, plate: 'outlaws', hover: `${a.name} · ~${fmt(a.men)}`, cls: 'band', scale: 0.8 };
  if (a.kind === 'caravan') return { kind: 'caravan', men: a.men, plate: '', hover: a.name, cls: 'caravan', scale: 0.6 };
  // a host: its count, and from L1 in, who leads it
  const count = `${mine ? '' : '~'}${fmt(a.men)}`;
  return { kind: 'host', men: a.men, plate: lead && lod >= 1 ? `${count} · ${surname(lead.name)}` : count, hover: `${a.name}${lead ? `, led by ${lead.name}` : ''}${dest ? ` → ${dest}` : ''}`, cls: 'host', scale };
}

/** The words of a stack of plates: "3 hosts · 11,400", "2 fleets · 80 ships", "a host and a fleet · 4,000". */
export function stackText(tokens) {
  const hosts = tokens.filter((t) => t.kind === 'host' || t.kind === 'progress' || t.kind === 'band');
  const fleets = tokens.filter((t) => t.kind === 'fleet');
  const others = tokens.length - hosts.length - fleets.length;
  const parts = [];
  if (hosts.length) parts.push(hosts.length === 1 ? 'a host' : `${hosts.length} hosts`);
  if (fleets.length) parts.push(fleets.length === 1 ? 'a fleet' : `${fleets.length} fleets`);
  if (others) parts.push(others === 1 ? 'a party' : `${others} parties`);
  const men = hosts.reduce((n, t) => n + (t.men || 0), 0), ships = fleets.reduce((n, t) => n + (t.ships || 0), 0);
  const words = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0];
  const sum = men ? fmt(men) : ships ? `${ships} ships` : '';
  return `${words}${sum ? ` · ${tokens.some((t) => t.reported) ? '~' : ''}${sum}` : ''}`;
}

/**
 * Cluster plates on screen (§6.1): plates whose points lie within `r` px of one another merge into one stack.
 * `items`: { id, x, y, token }. Returns [{ ids, x, y, text }] for the stacks of two or more; single plates are left alone.
 * Greedy and stable: the largest party anchors its stack.
 */
export function clusterPlates(items, r = 18) {
  const order = [...items].sort((a, b) => (b.token.men || 0) - (a.token.men || 0) || String(a.id).localeCompare(String(b.id)));
  const used = new Set(), out = [];
  for (const it of order) {
    if (used.has(it.id)) continue;
    const near = order.filter((o) => !used.has(o.id) && Math.hypot(o.x - it.x, o.y - it.y) <= r);
    if (near.length < 2) continue;
    for (const o of near) used.add(o.id);
    out.push({ ids: near.map((o) => o.id), x: it.x, y: it.y, text: stackText(near.map((o) => o.token)) });
  }
  return out;
}

/**
 * Which plates to drop when there are more than `cap` (WP U8). `items`: { id, own, d, men } — `own` for a party of the player's, `d` the world distance from the
 * player's nearest holding, `men` its strength. The player's own come first, then the nearest to the player's lands, then the strongest, then by id: a stable
 * order, so a plate never swaps with another as the camera moves. Returns the Set of ids to drop.
 */
export function capTokens(items, cap) {
  if (items.length <= cap) return new Set();
  const order = [...items].sort((a, b) => (b.own - a.own) || (a.d - b.d) || ((b.men || 0) - (a.men || 0)) || String(a.id).localeCompare(String(b.id)));
  return new Set(order.slice(cap).map((x) => x.id));
}
