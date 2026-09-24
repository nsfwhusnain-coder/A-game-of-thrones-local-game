// Geography of the Known World for the game: the atlas (public/data/atlas.js, generated from fan GIS data)
// plus the named places that are not holdings (inns, ruins, villages, fords) so armies and characters can go there.
// World units: x 0..WORLD.w (east), y 0..WORLD.h (south). North is up.
import { WORLD, PROJ, LAND, LAKES, MOUNTAIN_RANGES, FORESTS, SWAMPS, STEPPES, RIVER_LINES, ROAD_LINES, WALL_LINE, REGIONS, ATLAS_LABELS, LOCATIONS } from './atlas.js';

export { WORLD, PROJ, LAND, LAKES, MOUNTAIN_RANGES, FORESTS, SWAMPS, STEPPES, REGIONS };
export const RIVERS = RIVER_LINES;
export const ROADS = ROAD_LINES;
export const WALL = WALL_LINE;

// ~70 miles to a degree of the source map; 38 game units to a degree
export const MILES_PER_UNIT = 1.85;

const slug = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

// Places that are not holdings. Holdings (castles, cities) come from houses.js and take precedence by id.
export const PLACES = {};
export const PLACE_NAMES = {};
export const PLACE_KIND = {}; // castle | town | ruin | site (inns, villages, fords)
for (const l of LOCATIONS) {
  if (!l.name || /^(village|holdfast|sept|tower|inn|fishing village|unnamed village)$/i.test(l.name)) continue;
  const id = slug(l.name.replace(/\s*\(.*\)$/, ''));
  if (PLACES[id]) continue;
  PLACES[id] = [l.x, l.y]; PLACE_NAMES[id] = l.name.replace(/\s*\(.*\)$/, '');
  PLACE_KIND[id] = l.type === 'Castle' ? 'castle' : l.type === 'Town' || l.type === 'City' ? 'town' : l.type === 'Ruin' ? 'ruin' : 'site';
}
// A few places everyone talks about, under the names they are usually given
const extra = { crossroads_inn: 'crossroads_inn', the_crossroads: 'crossroads_inn', inn_at_the_crossroads: 'crossroads_inn', oldstones: 'oldstones', high_heart: 'high_heart', the_nightfort: 'nightfort', moles_town: 'moles_town', queenscrown: 'queenscrown', the_whispers: 'the_whispers', tower_of_joy: 'tower_of_joy', castamere: 'castamere', tarbeck_hall: 'tarbeck_hall', fairmarket: 'fairmarket', stoney_sept: 'stoney_sept', mummers_ford: 'mummers_ford', ghoyan_drohe: 'ghoyan_drohe', chroyane: 'the_sorrows', the_sorrows: 'the_sorrows', ar_noy: 'ar_noy', ny_sar: 'ny_sar', selhorys: 'selhorys', valysar: 'valysar', volon_therys: 'volon_therys' };
for (const [alias, id] of Object.entries(extra)) if (PLACES[id] && !PLACES[alias]) { PLACES[alias] = PLACES[id]; PLACE_NAMES[alias] = PLACE_NAMES[id]; }
// Back-compat: the old map's road junctions are now ordinary places
export const JUNCTIONS = PLACES;

// Labels for seas, bays, forests, mountains and lands (the renderer sizes them by zoom)
const KIND = { water: 'sea', shore: 'feature', land: 'feature', forest: 'feature', mountain: 'feature', desert: 'feature' };
export const LABELS = ATLAS_LABELS.map((l) => ({ t: /^(The (Sunset|Narrow|Summer|Shivering) Sea|The Jade Sea)$/.test(l.t) ? l.t.toUpperCase() : l.t, x: l.x, y: l.y, s: l.kind === 'water' ? l.s : Math.min(l.s, 14), rot: l.rot, kind: KIND[l.kind] || 'feature', sub: l.kind }));
