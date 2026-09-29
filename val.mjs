import fs from 'node:fs';
process.env.WC_PROVIDER = 'mock';
const { validate } = await import('/home/user/wc-s1/public/js/engine/state/validate.js');
const { KINDS } = await import('/home/user/wc-s1/public/js/engine/facts/kinds.js');
for (const h of ['stark', 'lannister', 'greyjoy']) {
  const st = JSON.parse(fs.readFileSync(`out-${h}-new.state.json`)); const facts = JSON.parse(fs.readFileSync(`out-${h}-new.json`));
  console.log(h, 'validate problems:', validate(st).length);
  // every fact.data.battle points at a battle fact; every by / winnerHouse is a real id; place is a real holding
  const ids = new Set(facts.map((f) => f.id)); let bad = 0;
  for (const f of facts) {
    const d = f.data || {};
    if (d.battle && (!ids.has(d.battle) || facts.find((x) => x.id === d.battle).kind !== 'battle')) { bad++; console.log('bad battle link', f.id, d.battle); }
    if (d.winnerHouse && !st.houses[d.winnerHouse]) { bad++; console.log('bad winnerHouse', f.id, d.winnerHouse); }
    if (d.by && !st.characters[d.by] && !st.houses[d.by]) { bad++; console.log('bad by', f.kind, f.id, d.by); }
    if (f.place && !st.holdings[f.place]) { bad++; console.log('unknown place', f.kind, f.id, f.place); }
    // the battle link points at a battle at the same place / same day?
    if (d.battle) { const b = facts.find((x) => x.id === d.battle); if (b.place !== f.place) { bad++; console.log('place differs from its battle', f.id, f.place, b.place); } }
  }
  console.log(' bad:', bad);
}
