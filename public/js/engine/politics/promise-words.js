// What a promise says, in words (docs/gdd/08-characters-politics.md §9). Its own small module so the screens can write a promise down without loading the engine that keeps it:
// `saysOf(state, commitment)` is "bring his men to Moat Cailin"; engine/politics/commitments.js builds its table of kinds on the same sentences.
import { placeName } from '../../shared/world.js';

const his = (s, c) => (s.characters[c.by]?.sex === 'f' ? 'her' : 'his');
const toHouse = (s, c) => s.characters[c.to]?.house || c.to;

/** One sentence a kind of promise says, each a `(state, commitment) → text`. */
export const SAYS = {
  march_to: (s, c) => `bring ${his(s, c)} men to ${placeName(s, c.params.place)}`,
  send_men: (s, c) => `send ${Number(c.params.men).toLocaleString('en-GB')} men to ${placeName(s, c.params.place)}`,
  attend: (s, c) => `come to ${placeName(s, c.params.place)}`,
  pay: (s, c) => `pay ${Number(c.params.gold).toLocaleString('en-GB')} dragons`,
  release: (s, c) => `set ${s.characters[c.params.captive]?.name || 'the captive'} free`,
  swear_fealty: (s, c) => `swear fealty to House ${s.houses[toHouse(s, c)]?.name}`,
  join_war: (s, c) => `take up arms beside House ${s.houses[toHouse(s, c)]?.name}`,
  stay_neutral: (s, c) => `keep out of House ${s.houses[toHouse(s, c)]?.name}'s quarrels`,
};

/** What the promise says; a kind this build does not know is "keep their word" rather than a crash on an old save. */
export const saysOf = (state, c) => (SAYS[c.kind] ? SAYS[c.kind](state, c) : 'keep their word');
