process.env.WC_PROVIDER='mock';
const {createInitialState}=await import('/home/user/wc-s2/public/js/shared/world.js');
const {project}=await import('/home/user/wc-s2/public/js/shared/economy.js');
const {standing}=await import('/home/user/wc-s2/public/js/shared/standing.js');
const s=createInitialState('agot_298','stark',{seed:298});
const ids=Object.keys(s.houses);
for(let k=0;k<3;k++){
let t=performance.now();for(const h of ids)standing(s,h);console.log('standing',performance.now()-t);
}
const {tradeModifier}=await import('/home/user/wc-s2/public/js/shared/economy.js');
const {labourFactor}=await import('/home/user/wc-s2/public/js/engine/economy/ledger.js');
for(let k=0;k<3;k++){
let t=performance.now();
s.__tradeMods=Object.fromEntries(ids.map(id=>[id,tradeModifier(s,id)]));
s.__labour=Object.fromEntries(ids.map(id=>[id,labourFactor(s,id)]));
console.log('caches',performance.now()-t);
t=performance.now();for(const h of ids)project(s,h);console.log('project cached',performance.now()-t);
delete s.__tradeMods;delete s.__labour;
t=performance.now();for(const h of ids)project(s,h);console.log('project uncached',performance.now()-t);
}
