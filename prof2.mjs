process.env.WC_PROVIDER='mock';
const {createInitialState}=await import('/home/user/wc-s2/public/js/shared/world.js');
const {project}=await import('/home/user/wc-s2/public/js/shared/economy.js');
const {standing}=await import('/home/user/wc-s2/public/js/shared/standing.js');
const s=createInitialState('agot_298','stark',{seed:298});
const ids=Object.keys(s.houses);
for(let k=0;k<200;k++){for(const h of ids){standing(s,h);project(s,h)}}
