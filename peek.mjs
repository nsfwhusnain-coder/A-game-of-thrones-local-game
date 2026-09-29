process.env.WC_PROVIDER='mock';
const { createInitialState } = await import('/home/user/wc-s4/public/js/shared/world.js');
const s = createInitialState('agot_298','stark',{seed:7});
const roles={}; for (const c of Object.values(s.characters)) for (const r of c.roles||[]) roles[r]=(roles[r]||0)+1; console.log(JSON.stringify(roles));
const C=(id)=>s.characters[id];
for (const id of ['rodrik_cassel','wendel_manderly','robert_baratheon','donella_hornwood','luwin','old_nan','jon_snow','rickard_karstark','harrion_karstark','stannis_baratheon','tywin_lannister','jaime_lannister','loras_tyrell','maege_mormont','alester_florent','jorah_mormont','walder_frey','stevron_frey','vardis_egen','gregor_clegane','ilyn_payne','amory_lorch','dontos_hollard','randyll_tarly','gerold_dayne','theon_greyjoy','mance_rayder','benjen_stark','lysa_arryn','robert_arryn','edmure_tully','meryn_trant','boros_blount','cortnay_penrose','davos_seaworth','victarion_greyjoy']) console.log(id, C(id)?.name, '|', C(id)?.title, '|', JSON.stringify(C(id)?.roles), C(id)?.sex, C(id)?.house, C(id)?.age);
console.log(JSON.stringify(Object.values(s.holdings).filter(h=>['frey','butterwell','goodbrook','flint','bloody_gate','westerling','tully','whent','baratheon_se','darry','florent','lannisport','redwyne','tyrell','tarly','mormont','hornwood','wull','bracken'].includes(h.id)).map(h=>[h.id,h.name,h.type])));
console.log(s.houses.tully.lord, s.houses.baratheon.lord, s.houses.baratheon.rank, s.houses.baratheon_ds.lord, s.houses.baratheon_ds.name, s.houses.baratheon_se.name);
console.log(JSON.stringify(s.pacts?.slice?.(0,2)), s.wars);
