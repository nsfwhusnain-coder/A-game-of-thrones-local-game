import { createInitialState, migrateState } from '/home/user/wc-s2/public/js/shared/world.js';
import { validate } from '/home/user/wc-s2/public/js/engine/state/validate.js';
const s = createInitialState('agot_298','stark',{seed:298});
console.log('validate fresh', JSON.stringify(validate(s)));
const t0 = Date.now(); for (let i=0;i<20;i++) validate(s); console.log('validate ms', (Date.now()-t0)/20);
const c = migrateState(structuredClone(s)); console.log('migrate fixpoint on fresh', JSON.stringify(c)===JSON.stringify(s));
for (const k of new Set([...Object.keys(c), ...Object.keys(s)])) if (JSON.stringify(c[k])!==JSON.stringify(s[k])) console.log('DIFF', k);
const t1 = Date.now(); const j = JSON.stringify(s); console.log('json size', j.length, Date.now()-t1);
