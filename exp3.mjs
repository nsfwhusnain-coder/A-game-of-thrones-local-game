import { createInitialState } from '/home/user/wc-s1/public/js/shared/world.js';
import { dayNumber } from '/home/user/wc-s1/public/js/engine/time.js';
import { summon, musterTick } from '/home/user/wc-s1/public/js/engine/military/muster.js';
import { seedState, withRng } from '/home/user/wc-s1/public/js/engine/rng.js';
const fresh = (s) => JSON.parse(JSON.stringify(s));
const s = createInitialState('agot_298', 'stark', { seed: 5 });
const v = s.houses.hornwood; const today = dayNumber(s.meta.date);
s.characters[v.lord].loyalty = 0; s.relations[['stark', 'hornwood'].sort().join('|')] = { v: -100 };
summon(s, v, { muster: 'stark', today });
v.obligations.stage = 'deliberating'; v.obligations.call.decide = today;
s.meta.clock = { turn: 1, from: today, to: today };
let n = 0;
for (let seed = 1; seed <= 30; seed++) {
  const t = fresh(s); t.meta.rngState = seedState(seed);
  const r = withRng(t, () => musterTick(t, new Set()));
  const f = (t.facts || []).find((x) => x.kind === 'call_refused');
  if (f) { console.log(seed, JSON.stringify(f)); n++; if (n > 1) break; }
}
