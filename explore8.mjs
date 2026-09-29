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
const rev = (o) => Object.fromEntries(Object.entries(o).reverse());
const OPTS = [];
for (const lens of ['strength','economy','land']) for (const scope of ['great','all','mine','war']) for (const realm of [false,true]) OPTS.push({lens, scope, realm});
for (const h of ['lannister','stark','tyrell','frey']) OPTS.push({house: h, scope: 'all'});
const a = clone(s), b = clone(s);
for (const k of ['houses', 'holdings', 'characters']) b[k] = rev(b[k]);
b.wars = [...b.wars].reverse();
for (const h of Object.values(b.houses)) if (h.figures) h.figures = rev(h.figures);
let diffs = 0;
OPTS.forEach(o => { if (json(realmViewFor(a,'stark',o)) !== json(realmViewFor(b,'stark',o))) { diffs++; console.log('view differs', json(o)); } });
tick(a); tick(b);
// observations compare with keys sorted
const norm = (r) => json(Object.fromEntries(Object.entries(r).sort(([x],[y]) => x < y ? -1 : 1)));
console.log('view diffs', diffs, 'obs equal after tick under reversed key order?', norm(a.knowledge.stark.realm) === norm(b.knowledge.stark.realm));
if (norm(a.knowledge.stark.realm) !== norm(b.knowledge.stark.realm)) {
  for (const h of Object.keys(a.knowledge.stark.realm)) if (json(a.knowledge.stark.realm[h]) !== json(b.knowledge.stark.realm[h])) { console.log(h, json(a.knowledge.stark.realm[h].obs.at(-1)), json(b.knowledge.stark.realm[h].obs.at(-1))); break; }
}
const sa = json(a.realmStats.samples.at(-1).h), sb = json(Object.fromEntries(Object.entries(b.realmStats.samples.at(-1).h).sort(([x],[y]) => x<y?-1:1)));
console.log('sample equal (b sorted)', sa === sb, 'sample h key order sorted in both?', json(Object.keys(a.realmStats.samples.at(-1).h)) === json(Object.keys(b.realmStats.samples.at(-1).h)));
