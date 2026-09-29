process.env.WC_PROVIDER='mock';
const { createInitialState } = await import('/home/user/wc-s4/public/js/shared/world.js');
const { entitiesIn } = await import('/home/user/wc-s4/server/ai/validate/headline.js');
const s = createInitialState('agot_298','stark',{seed:7});
for (const t of ['The match joins the Crown and House Stark.','The Crown holds it','a friend of the Crown','Word reaches House Tully of armed men on the road']) console.log(t, JSON.stringify(entitiesIn(s,t)));
