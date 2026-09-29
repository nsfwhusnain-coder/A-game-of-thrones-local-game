// my own leak fuzz: change everything hidden about the houses Stark has no window on; the view must not move by a byte
process.env.WC_PROVIDER = 'mock';
const R = '/home/user/wc-s2/public/js/';
const { createInitialState } = await import(R + 'shared/world.js');
const { sampleRealm } = await import(R + 'engine/realm/stats.js');
const { realmViewFor } = await import(R + 'engine/realm/view.js');
const { withRng } = await import(R + 'engine/rng.js');
const { addDays } = await import(R + 'engine/time.js');
const K = await import(R + 'engine/knowledge.js');
const { forces } = await import(R + 'engine/parties.js');
const s = createInitialState('agot_298', 'stark', { seed: 298 });
const tick = (s, days = 7) => { s.meta.turn += 1; s.meta.date = addDays(s.meta.date, days); sampleRealm(s); withRng(s, () => K.updateKnowledge(s, 'stark')); };
for (let i = 0; i < 5; i++) tick(s);
const OPTS = [{}, { scope: 'all' }, { scope: 'all', lens: 'economy' }, { scope: 'all', lens: 'land' }, { scope: 'all', realm: true }, { scope: 'mine' }, { scope: 'war' }, { house: 'lannister' }, { house: 'tyrell', scope: 'all', lens: 'economy' }, { window: 6 }, { window: 12, scope: 'all' }];
const json = (x) => JSON.stringify(x);
const before = OPTS.map((o) => json(realmViewFor(s, 'stark', o)));
const t = structuredClone(s);
const friends = K.friendsOf(t, 'stark');
let n = 0;
for (const h of Object.values(t.houses)) {
  if (friends.has(h.id)) continue;
  for (const f of Object.keys(h.figures)) h.figures[f].v = 13579 + n++;
  h.levyCap = 777; h.popBase = 999; h.policy = { tax: 'harsh' }; h.obligations = { tribute: 'withholding', levies: 'called' }; h.ledger = [{ x: 1 }]; h.intel = 9; h.notes = ['secret'];
}
for (const x of Object.values(t.holdings)) if (!friends.has(x.owner)) { x.prosperity = 3; x.unrest = 99; x.status = 'sacked'; x.devastation = 90; x.buildings = ['x']; x.fort = 9; x.blockade = true; }
for (const c of Object.values(t.characters)) if (!friends.has(c.house)) { c.alive = false; c.secret = 'MARK'; c.traits = 'x'; }
for (const a of forces(t)) if (!K.seesParty(t, 'stark', a)) { a.men = 424242; a.pos = [1, 1]; }
t.economy.loans.push({ lender: 'lannister', debtor: 'tyrell', amount: 1e9, rate: 0.5, pays: 'coin' });
for (const w of t.wars) w.score = 99;
t.world.seasonNote = 'changed';
for (const r of t.realmStats.samples) for (const h of Object.keys(r.h)) if (!friends.has(h)) r.h[h] = r.h[h].map((_, i) => 5e5 + i);
for (const [h, k] of Object.entries(t.knowledge)) if (h !== 'stark') delete t.knowledge[h];
t.minds = { last: { tywin_lannister: 1 } };
const after = OPTS.map((o) => json(realmViewFor(t, 'stark', o)));
let bad = 0;
OPTS.forEach((o, i) => { if (after[i] !== before[i]) { bad++; console.log('MOVED', json(o)); } });
console.log(bad ? `${bad} view(s) moved` : `no view moved (${OPTS.length} option sets, ${before.reduce((a, b) => a + b.length, 0)} bytes compared)`);
// also: the view is JSON and only that
const v = realmViewFor(s, 'stark', { scope: 'all', house: 'lannister' });
console.log('keys', Object.keys(v).join(','), '| detail keys', Object.keys(v.detail).join(','));
