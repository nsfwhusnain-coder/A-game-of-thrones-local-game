// What the canon beats are written with (public/data/beats.js): who is alive, free, where; the plot's flags; the
// player's house; a war between two houses; a chronicle card. Shared by the beats' data and the beat engine.
import { placeOf } from '../parties.js';
import { random } from '../rng.js';

export const ym = (d) => d.year * 12 + (d.month - 1);
export const YM = (y, m) => y * 12 + (m - 1);
export const pick = (a, r = random) => a[Math.floor(r() * a.length)];
export const C = (s, id) => s.characters[id];
export const alive = (s, ...ids) => ids.every((id) => s.characters[id]?.alive);
export const free = (s, id) => alive(s, id) && !/imprisoned|captive|hostage/.test(s.characters[id].status || '');
// where someone is: their hall, or wherever the party they travel with has halted (the King's court in its progress)
export const at = (s, id, ...places) => places.includes(String(placeOf(s, s.characters[id]) || ''));
export const flag = (s, k) => s.plots?.flags?.[k];
export const player = (s) => s.meta.player;
export const plays = (s, ...houses) => houses.includes(player(s));
export const inWar = (s, a, b) => (s.wars || []).some((w) => w.status !== 'ended' && ((w.attackers.includes(a) && w.defenders.includes(b)) || (w.attackers.includes(b) && w.defenders.includes(a))));
// `head` is the news headline of the card (the title is the chapter's name: "The boy who fell"; the head says what happened:
// "Bran Stark is found broken beneath the old tower"), `sum` its subtitle when the telling's own sentences will not do (ST1).
export const ev = (title, text, where, importance = 3, type = 'court', houses = [], head = '', sum = '') => ({ title, text, where, importance, type, houses, ...(head ? { head } : {}), ...(sum ? { sum } : {}) });
