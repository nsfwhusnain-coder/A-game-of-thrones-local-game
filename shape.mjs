process.argv[2] = 'lib';
const { scoreCard, state } = await import('./probe.mjs');
// the shape world.js `op: battle` (the story director's) emits: house ids in data.winner, no winnerHouse
const story = { facts: [{ id: 'f1.1', kind: 'battle', actors: [], houses: ['stark', 'lannister'], place: 'tully', importance: 5, data: { attacker: 'stark', defender: 'lannister', winner: 'stark', lost: { stark: 500, lannister: 3000 } }, text: 'Battle of the Whispering Wood: victory for House Stark.' }], must: [] };
for (const h of ['Robb Stark beats Tywin Lannister at Riverrun', 'Tywin Lannister beats Robb Stark at Riverrun', 'Lannisters beat the Starks at Riverrun', 'Starks beat the Lannisters at Riverrun', 'Lannisters crush the Starks at Riverrun', 'House Lannister defeats House Stark at Riverrun']) console.log(JSON.stringify(scoreCard({ headline: h }, story, state)), '|', h);
// same but with real engine slots
const story2 = { facts: [{ ...story.facts[0], data: { ...story.facts[0].data, winnerHouse: 'stark', loserHouse: 'lannister' } }], must: [] };
console.log('--- with winnerHouse');
for (const h of ['Lannisters beat the Starks at Riverrun', 'Starks beat the Lannisters at Riverrun']) console.log(JSON.stringify(scoreCard({ headline: h }, story2, state).faults), '|', h);
// executed by house id (theYears/story) vs by char id
const ex = { facts: [{ id: 'f1.1', kind: 'executed', actors: ['eddard_stark'], houses: ['stark'], place: 'baratheon', importance: 5, data: { cause: 'beheaded', by: 'cersei_lannister' }, text: 'Eddard Stark is put to death.' }], must: [] };
console.log('--- executed by char');
for (const h of ['Eddard Stark executed by Cersei Lannister', 'Cersei Lannister executed by Eddard Stark', 'Eddard Stark beheads Cersei Lannister', 'Cersei Lannister beheads Eddard Stark', 'Lannisters behead Eddard Stark','Starks behead Eddard Stark']) console.log(JSON.stringify(scoreCard({ headline: h }, ex, state).faults), '|', h);
