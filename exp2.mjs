import { createInitialState, applyChanges } from '/home/user/wc-s1/public/js/shared/world.js';
import { engineDay } from '/home/user/wc-s1/server/turn/day.js';
import { withDice } from '/home/user/wc-s1/server/dice.js';
import { dayNumber, dateOfDay } from '/home/user/wc-s1/public/js/engine/time.js';
import { lifeTick } from '/home/user/wc-s1/public/js/engine/people/life.js';
import { musterTick } from '/home/user/wc-s1/public/js/engine/military/muster.js';
import { seedState, makeRng, withRng } from '/home/user/wc-s1/public/js/engine/rng.js';
const fresh = (s) => JSON.parse(JSON.stringify(s));
// --- theYears via engineDay
{
  const s = createInitialState('agot_298', 'stark', { seed: 5 });
  s.meta.date = { year: 298, month: 12, day: 30 };
  const c = s.characters.old_nan; console.log(c.age, c.bio?.slice(0,80), c.traits);
  c.age = 99;
  const t0 = Date.now();
  let found = null;
  for (let seed = 1; seed <= 40 && !found; seed++) {
    const t = fresh(s); t.meta.rngState = seedState(seed);
    const d0 = dayNumber(t.meta.date);
    t.meta.clock = { turn: t.meta.turn + 1, from: d0 + 1, to: d0 + 1 };
    await withDice(t, () => engineDay(t, { deliver: async () => [], touched: new Set() }));
    const f = (t.facts||[]).find((x) => x.kind === 'death' && x.actors.includes('old_nan'));
    if (f) found = { seed, f, ms: Date.now() - t0 };
  }
  console.log(JSON.stringify(found));
}
// --- lifeTick fever/winter/wound
{
  const s = createInitialState('agot_298', 'stark', { seed: 5 });
  s.characters.old_nan.age = 90;
  // a weekly day
  let n = dayNumber(s.meta.date); while (n % 7 !== 0) n++; s.meta.date = dateOfDay(n);
  s.meta.clock = { turn: 1, from: n, to: n };
  const r = lifeTick(s, () => 0, {});
  console.log(r.events.map(e => JSON.stringify(e.title)), (s.facts||[]).map(f=>f.kind+JSON.stringify(f.data)));
}
