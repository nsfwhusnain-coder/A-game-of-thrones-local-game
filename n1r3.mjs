process.env.WC_PROVIDER='mock';
const { createInitialState } = await import('/home/user/wc-s1/public/js/shared/world.js');
const { scoreCard, entitiesIn } = await import('/home/user/wc-s1/server/ai/validate/headline.js');
const { personAliases } = await import('/home/user/wc-s1/public/js/engine/ids.js');
const state = createInitialState('agot_298', 'stark', { seed: 298 });
const A = personAliases(state);
for (const k of ['the_king','the_queen','queen','her_grace','the_hand','hand','the_hand_of_the_king','lord_hand']) console.log(k, A.get(k));
console.log(Object.values(state.characters).filter(c=>/hand|queen|master of|grand maester|regent/i.test(c.title||'')).map(c=>c.id+': '+c.title).join('\n'));
const cers = Object.values(state.characters).filter(c=>/cersei|tywin|robert_b/.test(c.id)).map(c=>c.id); console.log(cers);
const story = (actors, place, house) => ({ facts: [{ id:'f1', kind:'happening', actors, houses:[house], place, data:{}, importance:3, text:'x.' }], must:[], mustNot:[] });
for (const [h, actors, place, house] of [
 ['The Queen refuses the summons', ['cersei_lannister'], 'baratheon', 'lannister'],
 ['The Queen holds a feast at King\'s Landing', ['cersei_lannister'], 'baratheon', 'lannister'],
 ['The King rides north', ['robert_baratheon'], 'baratheon', 'baratheon'],
 ['The King holds a tourney at King’s Landing', ['robert_baratheon'], 'baratheon', 'baratheon'],
 ['The Hand names a new captain', ['eddard_stark'], 'baratheon', 'stark'],
 ['The Hand of the King names a new captain', ['tywin_lannister'], 'baratheon', 'lannister'],
 ['Rats overrun the Street of Steel at King\'s Landing', [], 'baratheon', 'baratheon'],
 ['Fire breaks out at Storm\'s End', [], 'baratheon_se', 'baratheon_se'],
 ['Fire breaks out at Storm’s End', [], 'baratheon_se', 'baratheon_se'],
 ['Wolves prowl near Widow\'s Watch', [], 'flint', 'flint'],
 ['Pentoshi galley reaches Pentos', [], 'pentos', 'pentos'],
 ['Braavosi ships gather at Braavos', [], 'braavos', 'braavos'],
 ['Pentos falls silent', [], 'pentos', 'pentos'],
]) { const r = scoreCard({headline:h}, story(actors, place, house), state); console.log(r.pass?'PASS':'FAIL '+r.faults.join(','), '|', h, JSON.stringify(r.detail.map(d=>d.text)), JSON.stringify(entitiesIn(state,h,{start:true}).map(e=>[e.kind,e.ids,e.text]))); }
console.log(state.holdings.pentos?.name, state.houses.pentos?.name, state.holdings.braavos?.name, state.holdings.pentos?.owner);
