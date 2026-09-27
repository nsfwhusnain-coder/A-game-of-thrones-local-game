// The model test (docs/gdd/15-qa-tooling.md §8 step 2): Settings → Test connection sends this tiny constrained call.
// It proves three things the rest of the game relies on: the server answers; it honours a JSON schema (the reply fits
// the enum); and the enum's aliases work — told Jon goes to the Wall, a model that writes "the_wall" lands on the Wall,
// not on "the_twins" (the pitfall the 2026-09-27 bench found in every model).
import { obj, str, enumProp, buildEnum } from '../schema.js';
import { placeAliases } from '../../../public/js/engine/ids.js';
import { system } from '../context/primer.js';

const PLACES = new Set(['nights_watch', 'frey', 'stark', 'baratheon', 'lannister', 'tully', 'arryn']);

export default {
  kind: 'probe',
  context(state) {
    const places = buildEnum(placeAliases(state), { only: PLACES });
    return { places, canons: { place: places.canon } };
  },
  schema: (ctx) => obj({ place: enumProp(ctx.places, 'place'), words: str(60) }),
  prompt: (ctx) => [
    { role: 'system', content: system(null, 'Answer a question about the realm with the place and the words asked for, in the JSON shape required.') },
    { role: 'user', content: `PLACES YOU MAY NAME: ${[...PLACES].map((id) => `[${[...ctx.places.canon].filter(([, v]) => v === id).map(([k]) => k).slice(0, 4).join('|')}]`).join(' ')}\nQUESTION: Jon Snow means to take the black. To what place does he ride? And what are the words of House Stark?` },
  ],
  check: (v) => (v.place === 'nights_watch' ? [] : [`rode to ${v.place}, not to the Wall`]),
  mock: () => ({ place: 'the_wall', words: 'Winter is Coming' }),
  fallback: (ctx, problems) => ({ place: null, words: '', problems }),
  fingerprint: () => 'probe',
};
