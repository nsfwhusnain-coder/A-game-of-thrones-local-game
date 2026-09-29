process.argv[2] = 'lib';
const { scoreCard, state } = await import('./probe.mjs');
const { roughly } = await import('/home/user/wc-s1/public/js/engine/facts/label.js');
let bad = 0, total = 0; const ex = [];
for (const n of [13, 47, 64, 96, 150, 340, 396, 520, 880, 960, 1100, 1450, 1796, 1960, 2137, 3300, 3940, 6090, 9977, 12300, 15200, 28000, 45000, 62000]) {
  const story = { facts: [{ id: 'f1', kind: 'host_formed', actors: ['greatjon_umber'], houses: ['umber'], place: 'umber', importance: 3, data: { men: n, party: 'host_umber' }, text: `Host of House Umber (${n} men) is raised at Last Hearth.` }], must: ['Umber'] };
  const h = `Lord Umber gathers ${roughly(n)} men at Last Hearth`; const r = scoreCard({ headline: h }, story, state); total++;
  if (!r.pass) { bad++; ex.push(`${n} → "${h}" ${r.faults}`); }
}
console.log(`roughly() output rejected by the scorer's own numbers rule: ${bad}/${total}`); console.log(ex.join('\n'));
