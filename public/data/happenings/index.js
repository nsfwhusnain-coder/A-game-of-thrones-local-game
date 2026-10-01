// The regional libraries of happenings (WP G4), gathered: `MORE` is every happening, `MORE_HEADS` their headlines. data/happenings.js and data/happening-heads.js add them to the first library.
import { NORTH, HEADS as NORTH_HEADS } from './north.js';
import { WALL, BEYOND, HEADS as WALL_HEADS } from './wall.js';
import { IRON_ISLANDS, RIVERLANDS, VALE, WESTERLANDS, HEADS as WEST_HEADS } from './west.js';
import { CROWNLANDS, REACH, STORMLANDS, DORNE, ESSOS, HEADS as SOUTH_HEADS } from './south.js';
import { SEASONS, HEADS as SEASON_HEADS } from './seasons.js';
import { PEOPLE, HEADS as PEOPLE_HEADS } from './people.js';
import { REALM, HEADS as REALM_HEADS } from './realm.js';

export const MORE = [...NORTH, ...WALL, ...BEYOND, ...IRON_ISLANDS, ...RIVERLANDS, ...VALE, ...WESTERLANDS, ...CROWNLANDS, ...REACH, ...STORMLANDS, ...DORNE, ...ESSOS, ...SEASONS, ...PEOPLE, ...REALM];
export const MORE_HEADS = { ...NORTH_HEADS, ...WALL_HEADS, ...WEST_HEADS, ...SOUTH_HEADS, ...SEASON_HEADS, ...PEOPLE_HEADS, ...REALM_HEADS };
