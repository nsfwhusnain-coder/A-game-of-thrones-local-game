// every person, place and party a reference or summary names must be in the facts' actors, place or data (not only in their prose)
import fs from 'node:fs';
import { createInitialState } from '/home/user/wc-s1/public/js/shared/world.js';
import { namesIn } from '/home/user/wc-s1/server/ai/validate/narration.js';
const state = createInitialState('agot_298', 'stark', { seed: 298 });
const G = JSON.parse(fs.readFileSync('/home/user/wc-s1/tests/fixtures/headlines/golden.json', 'utf8'));
let n = 0;
for (const g of G) {
  const people = new Set(), places = new Set(), parties = new Set();
  const walk = (v) => { if (typeof v === 'string') { if (state.characters[v]) people.add(v); if (state.holdings[v]) places.add(v); if (state.parties[v]) parties.add(v); } else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
  for (const f of g.facts) { f.actors.forEach((a) => people.add(a)); if (f.place) places.add(f.place); walk(f.data); }
  for (const id of parties) { const p = state.parties[id]; if (p.commander) people.add(p.commander); for (const m of p.members || []) people.add(m); if (p.at && state.holdings[p.at]) places.add(p.at); }
  for (const [label, text] of [['ref', g.reference], ['sum', g.summary]]) {
    for (const m of namesIn(state, text)) {
      const ok = m.kind === 'person' ? people.has(m.id) : m.kind === 'place' ? places.has(m.id) : parties.has(m.id);
      if (!ok) { n++; console.log(g.id, label, m.kind, m.id, JSON.stringify(m.text)); }
    }
  }
}
console.log('strict-world problems:', n);
