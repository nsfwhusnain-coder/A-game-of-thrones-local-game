// The map's modes (docs/gdd/11-map-visuals.md §4; WP E2): what colour each holding is in each mode, and what the
// mode's legend says. Each mode must be visibly different at every zoom — Diplomacy never looks like Realms again (B-29).
// No imports but the world's own rules, so the palettes can be tested without a canvas.
import { realmOf, getRelation } from '../shared/world.js';
import { eyesOf, SIGHT } from '../engine/knowledge.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const hexToRgb = (hex) => { let h = String(hex || '#888').replace('#', ''); if (h.length === 3) h = h.split('').map((c) => c + c).join(''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mix = (a, b, t) => a.map((x, i) => Math.round(x + (b[i] - x) * clamp(t, 0, 1)));

// the relation scale of Diplomacy: war → hostile → neutral → friendly → allied
export const DIPLO = { war: [150, 24, 20], hostile: [214, 116, 38], neutral: [128, 128, 124], friendly: [58, 110, 190], allied: [212, 170, 48], mine: [212, 170, 48] };
// the age scale of Knowledge: seen → a moon old → old → unknown
export const KNOW = { seen: [236, 226, 196], fresh: [178, 168, 146], old: [96, 94, 92], fog: [18, 18, 22] };
// the fronts of War
export const WAR = { besieged: [196, 36, 30], occupied: [226, 128, 30], devastated: [92, 58, 34], quiet: [120, 124, 118] };

/** Whether `house` is at war with the player (by itself or by its realm). */
export function atWarWith(s, houseId) {
  const p = s.meta.player, realm = realmOf(s, houseId);
  return (s.wars || []).some((w) => w.status !== 'ended' && ((w.attackers.includes(p) && (w.defenders.includes(houseId) || w.defenders.includes(realm))) || (w.defenders.includes(p) && (w.attackers.includes(houseId) || w.attackers.includes(realm)))));
}
const sworn = (s, owner) => { let x = s.houses[owner], g = 0; while (x?.liege && g++ < 8) { if (x.liege === s.meta.player) return true; x = s.houses[x.liege]; } return false; };

/** The player's relation to a holding's house, as Diplomacy draws it: { key, rgb, hatch } (hatch: your own realm). */
export function diplomacyOf(s, hd) {
  const p = s.meta.player; const realm = realmOf(s, hd.owner);
  if (hd.owner === p || sworn(s, hd.owner)) return { key: 'mine', rgb: DIPLO.mine, hatch: true };
  if (atWarWith(s, hd.owner)) return { key: 'war', rgb: DIPLO.war };
  const allied = (s.pacts || []).some((x) => x.status === 'active' && x.type === 'alliance' && [x.a, x.b].includes(p) && ([x.a, x.b].includes(realm) || [x.a, x.b].includes(hd.owner)));
  if (allied || s.houses[p]?.liege === hd.owner || s.houses[p]?.liege === realm) return { key: 'allied', rgb: DIPLO.allied };
  const r = getRelation(s, p, hd.owner) || getRelation(s, p, realm) || 0;
  if (r <= -20) return { key: 'hostile', rgb: mix(DIPLO.neutral, DIPLO.hostile, (-r - 10) / 50) };
  if (r >= 20) return { key: 'friendly', rgb: mix(DIPLO.neutral, DIPLO.friendly, (r - 10) / 50) };
  return { key: 'neutral', rgb: DIPLO.neutral };
}

/** How fresh the player's knowledge of a holding is: { key, rgb } — seen, a fresh report, an old one, or fog. */
export function knowledgeOf(s, hd, E = eyesOf(s, s.meta.player)) {
  const near = (pos, r) => Math.hypot(pos[0] - hd.pos[0], pos[1] - hd.pos[1]) <= r;
  if ((E?.out || []).some(([pos, r]) => near(pos, r ?? SIGHT.holding))) return { key: 'seen', rgb: KNOW.seen };
  const k = s.knowledge?.[s.meta.player]; const turn = s.meta.turn;
  let age = Infinity;
  for (const r of Object.values(k?.parties || {})) if (r.pos && near(r.pos, 60)) age = Math.min(age, turn - (r.turn ?? turn));
  if (age <= 4) return { key: 'fresh', rgb: mix(KNOW.seen, KNOW.fresh, age / 4) };
  if (age < Infinity) return { key: 'old', rgb: mix(KNOW.fresh, KNOW.old, clamp((age - 4) / 12, 0, 1)) };
  // the great seats are known by all, if only by common report
  if (hd.seatOf && ['paramount', 'crown'].includes(s.houses[hd.owner]?.rank)) return { key: 'old', rgb: KNOW.old };
  return { key: 'fog', rgb: KNOW.fog };
}

/** What War draws for a holding: besieged, occupied (held by another than its house of old), laid waste, or quiet. */
export function warOf(s, hd) {
  if (hd.status === 'besieged' || hd.siege) return { key: 'besieged', rgb: WAR.besieged };
  if (hd.seatOf && hd.seatOf !== hd.owner) return { key: 'occupied', rgb: WAR.occupied };
  if ((hd.devastation || 0) >= 30) return { key: 'devastated', rgb: mix(WAR.quiet, WAR.devastated, hd.devastation / 80) };
  return { key: 'quiet', rgb: WAR.quiet };
}

/** A holding's colour in a mode. */
export function colorFor(s, mode, holdingId, E) {
  const hd = s.holdings[holdingId]; if (!hd) return [128, 128, 128];
  switch (mode) {
    case 'houses': return hexToRgb(s.houses[hd.owner]?.color);
    case 'diplomacy': return diplomacyOf(s, hd).rgb;
    case 'knowledge': return knowledgeOf(s, hd, E).rgb;
    case 'war': return warOf(s, hd).rgb;
    case 'unrest': { const u = hd.unrest / 100; return [Math.round(90 + 165 * u), Math.round(180 - 140 * u), 60]; }
    case 'prosperity': { const u = hd.prosperity / 100; return [Math.round(210 - 150 * u), Math.round(110 + 110 * u), 60]; }
    case 'economy': { const tot = Object.values(hd.resources || {}).reduce((a, b) => a + b, 0) * Math.sqrt(hd.population / 10000); const u = clamp(tot / 25, 0, 1); return [Math.round(60 + 190 * u), Math.round(60 + 150 * u), Math.round(40 + 30 * u)]; }
    default: return hexToRgb(s.houses[realmOf(s, hd.owner)]?.color);
  }
}

/** The legend of each mode (the map's key, under the mode buttons): [label, rgb] or a line of prose. */
export const LEGENDS = {
  political: { title: 'Realms', text: 'Each realm in its colour; the names are the realms\'.' },
  houses: { title: 'Holders', text: 'Each holding in the colour of the house that holds it.' },
  diplomacy: { title: 'Diplomacy', keys: [['At war', DIPLO.war], ['Hostile', DIPLO.hostile], ['Neutral', DIPLO.neutral], ['Friendly', DIPLO.friendly], ['Allied', DIPLO.allied], ['Your realm (hatched)', DIPLO.mine]] },
  knowledge: { title: 'Knowledge', keys: [['Seen now', KNOW.seen], ['A fresh report', KNOW.fresh], ['An old report', KNOW.old], ['Unknown', KNOW.fog]] },
  war: { title: 'War', keys: [['Besieged', WAR.besieged], ['Held by an enemy', WAR.occupied], ['Laid waste', WAR.devastated], ['Quiet', WAR.quiet]] },
  economy: { title: 'Wealth', text: 'Brighter is richer: people and resources together.' },
  prosperity: { title: 'Prosperity', text: 'Green is thriving, red is failing.' },
  unrest: { title: 'Unrest', text: 'Red is restless, green is content.' },
  terrain: { title: 'Terrain', text: 'The land itself, with the borders only.' },
};
