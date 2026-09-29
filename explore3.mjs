process.env.WC_PROVIDER = 'mock';
const R = '/home/user/wc-s2/public/js/';
const { sampleRealm } = await import(R + 'engine/realm/stats.js');
const { realmViewFor } = await import(R + 'engine/realm/view.js');
const { createInitialState } = await import(R + 'shared/world.js');
const { addDays } = await import(R + 'engine/time.js');
const { withRng } = await import(R + 'engine/rng.js');
const K = await import(R + 'engine/knowledge.js');
const clone = (x) => JSON.parse(JSON.stringify(x));
const json = JSON.stringify;
const tick = (s, days = 7) => { s.meta.turn += 1; s.meta.date = addDays(s.meta.date, days); sampleRealm(s); withRng(s, () => K.updateKnowledge(s, 'stark')); return s; };
const s = createInitialState('agot_298', 'stark', { seed: 298 });
for (let i = 0; i < 3; i++) tick(s);
const friends = K.friendsOf(s, 'stark');
const others = (t) => Object.values(t.houses).filter(h => !friends.has(h.id));
const unseen = (t) => Object.values(t.parties).filter(a => !friends.has(a.owner) && !K.seesParty(t, 'stark', a));
const muts = {
  figures: t => others(t).forEach(h => Object.values(h.figures).forEach(f => f.v = 987654)),
  levyCap: t => others(t).forEach(h => h.levyCap = 1),
  ledger: t => others(t).forEach(h => h.ledger = [{ x: 1 }]),
  policy: t => others(t).forEach(h => h.policy = { ...(h.policy||{}), tax: 'harsh' }),
  loans: t => t.economy.loans.forEach(l => l.amount *= 100),
  warscore: t => t.wars.forEach(w => w.score = 77),
  unseenMen: t => unseen(t).forEach(a => { a.men = 99999; a.ships = 77; }),
  holdingsMood: t => Object.values(t.holdings).filter(h => !friends.has(h.owner)).forEach(h => { h.prosperity = 3; h.unrest = 99; h.status = 'besieged'; h.devastation = 90; h.blockade = true; }),
  otherKnowledge: t => { t.knowledge.lannister = { realm: { stark: { obs: [{ day: 1, turn: 1, via: 'seen', v: { swords: 999999 } }] } }, parties: {}, facts: {}, spies: {}, beliefs: [] }; },
  minds: t => { t.minds = { last: {}, tywin_lannister: { goals: ['x'] } }; },
  realmStatsOthers: t => t.realmStats.samples.forEach(sm => Object.keys(sm.h).forEach(h => { if (!friends.has(h)) sm.h[h] = sm.h[h].map(() => 1); })),
  charSecrets: t => Object.values(t.characters).forEach(c => { if (!friends.has(c.house)) { c.secret = 'zzz'; c.alive = c.alive; } }),
};
const results = {};
for (const [name, fn] of Object.entries(muts)) {
  const a = clone(s), b = clone(s); fn(b);
  tick(a); tick(b);
  const ra = json(a.knowledge.stark.realm), rb = json(b.knowledge.stark.realm);
  const va = ['strength','economy','land'].map(l => json(realmViewFor(a,'stark',{lens:l,scope:'all'})) ).join(), vb = ['strength','economy','land'].map(l => json(realmViewFor(b,'stark',{lens:l,scope:'all'}))).join();
  results[name] = { obs: ra === rb, view: va === vb };
}
console.log(results);
{
  const a = clone(s), b = clone(s);
  unseen(b).forEach(a => { a.ships = 77; a.composition = { x: 1 }; a.contingents = []; a.commander = 'x'; });
  tick(a); tick(b);
  console.log('unseen ships/contingents only: obs same?', json(a.knowledge.stark.realm) === json(b.knowledge.stark.realm));
  // hosts just inside vs just outside sight is legit; skip.
  // hidden host (secrecy: hidden) movement
  const c = clone(s), d = clone(s);
  Object.values(d.parties).forEach(p => { if (!friends.has(p.owner)) { p.secrecy = 'hidden'; } });
  tick(c); tick(d);
  console.log('secrecy hidden changes obs?', json(c.knowledge.stark.realm) === json(d.knowledge.stark.realm));
}
