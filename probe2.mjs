import fs from 'node:fs';
process.env.WC_PROVIDER='mock';
const { createInitialState } = await import('/home/user/wc-s1/public/js/shared/world.js');
const { scoreCard } = await import('/home/user/wc-s1/server/ai/validate/headline.js');
const { roughly } = await import('/home/user/wc-s1/public/js/engine/facts/label.js');
const state = createInitialState('agot_298', 'stark', { seed: 298 });
const G = JSON.parse(fs.readFileSync('/home/user/wc-s1/tests/fixtures/headlines/golden.json','utf8'));
const by = Object.fromEntries(G.map(g=>[g.id,g]));
console.log([1796,150,45000,3100].map(roughly));
const P = [
 ['S1','g-march-02','Lord Karstark marches south with nearly two thousand men'],
 ['S1','g-muster-02','Greatjon Umber raises some two hundred men at Last Hearth'],
 ['S1','g-muster-04','Mance Rayder gathers some fifty thousand wildlings'],
 ['S1','g-battle-01','Tywin Lannister beats Roose Bolton','The northmen lost some three thousand men at the ford.'],
 ['S1x','g-battle-01','Tywin Lannister beats Roose Bolton','The northmen lost some four thousand men at the ford.'],
 ['S1x','g-muster-04','Mance Rayder gathers some forty thousand wildlings'],
 ['dup','g-slain-01','Robb Stark slain by Tywin Lannister at the Twins','Robb Stark was killed by Tywin Lannister during the fighting at the Twins.'],
 ['dup!','g-slain-01','Robb Stark slain by Tywin Lannister at the Twins','Robb Stark slain by Tywin Lannister at the Twins.'],
 ['dup!','g-slain-01','Robb Stark slain by Tywin Lannister at the Twins','Robb Stark slain.'],
 ['dup5','g-muster-01','Eddard Stark quickly calls all northern banners to Winterfell','Eddard quickly calls all northern lords.'],
 ['dup5','g-muster-01','Eddard Stark quickly calls all northern banners to Winterfell','Everyone calls all northern folk.'],
 ['verb','g-battle-01','Tywin Lannister drives Roose Bolton from the Twins'],
 ['verb','g-capture-01','Robb Stark jails Jaime Lannister'],
 ['verb','g-death-01','Lord Karstark names Harrion his heir'],
 ['verb','g-siege-01','Jaime Lannister rings Riverrun'],
 ['verb','g-battle-01','Roose Bolton and Tywin Lannister clash at the Twins'],
 ['verb','g-refusal-01','Lady Hornwood threatens to hold her men back'],
 ['verb','g-battle-01','Roose Bolton is driven from the Twins'],
 ['verb','g-death-01','Rickard Karstark dead at Karhold'],
 ['verb-','g-march-02','Karstark banners at Karhold'],
 ['verb-','g-battle-01','Lord Umber banners at the Twins'],
 ['verb+','g-battle-01','Tywin Lannister requisitions the ford at the Twins'],
 ['roles!','g-battle-01','Roose Bolton wins at the Twins'],
 ['roles!','g-battle-01','Tywin Lannister loses at the Twins'],
 ['ok','g-battle-01','Tywin Lannister wins at the Twins'],
 ['ok','g-battle-01','Roose Bolton loses at the Twins'],
 ['roles!','g-slain-01','Robb Stark cuts down Tywin Lannister'],
 ['roles!','g-slain-01','Tywin Lannister cut down by Robb Stark'],
 ['ok','g-slain-01','Robb Stark cut down by Tywin Lannister'],
 ['ok','g-slain-01','Tywin Lannister cuts down Robb Stark'],
 ['roles!','g-capture-01','Jaime Lannister takes Robb Stark prisoner'],
 ['ok','g-capture-01','Robb Stark takes Jaime Lannister prisoner'],
 ['roles!','g-siege-01','Riverrun lays siege to Jaime Lannister'],
 ['ok','g-siege-01','Jaime Lannister lays siege to Riverrun'],
 ['ok','g-siege-01','Riverrun besieged by Jaime Lannister'],
 ['roles!','g-siege-01','Jaime Lannister besieged by Riverrun'],
 ['outcome!','g-siege-01','Jaime Lannister storms Riverrun'],
 ['outcome!','g-siege-01','Jaime Lannister takes Riverrun'],
 ['ok','g-fell-03','Gregor Clegane storms Darry'],
 ['ok','g-fell-01','Tywin Lannister takes Harrenhal'],
 ['ok','g-death-01','Lord Karstark\'s son takes Karhold'],
 ['inv','g-omen-02','Hunters bring down a white stag near Karhold'],
 ['inv!','g-march-02','Lord Karstark marches south with Ser Aldric Vance'],
 ['inv!','g-march-02','Lord Karstark marches for Blackmoor Keep'],
 ['inv!','g-death-01','Maester Corwin sees Rickard Karstark die at Karhold'],
 ['punct!','g-march-02','Lord Karstark marches south [again]'],
 ['punct!','g-march-02','Lord Karstark marches south - at last'],
 ['punct!','g-march-02','Lord Karstark marches south 🐺'],
 ['punct!','g-march-02','Lord Karstark marches *south*'],
 ['jargon ok','g-march-02','Lord Karstark raises his levies at Karhold'],
 ['jargon ok','g-omen-02','A summer snow blankets Karhold','The old stories of the Long Night say it is so, and in fact it is.'],
];
for (const [t,id,h,sum] of P) { const r = scoreCard({headline:h, ...(sum?{summary:sum}:{})}, by[id], state); console.log(t.padEnd(9), (r.pass?'PASS':'FAIL '+r.faults.join(',')).padEnd(24), h, r.pass?'':JSON.stringify(r.detail.map(d=>d.text.slice(0,60)))); }
