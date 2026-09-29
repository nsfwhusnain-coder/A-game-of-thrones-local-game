process.env.WC_PROVIDER='mock';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
process.env.WC_SAVES = fs.mkdtempSync(path.join(os.tmpdir(),'wc-x-'));
const { createInitialState } = await import('/home/user/wc-s1/public/js/shared/world.js');
const s = createInitialState('agot_298','stark',{seed:298});
let n=0; for (const c of Object.values(s.characters)) { n++; if (/["“”']/.test(c.name) || !/^\S+ \S+/.test(c.name)) console.log(c.id.padEnd(22), JSON.stringify(c.name), c.house, c.sex, s.houses[c.house]?.lord===c.id); }
console.log(n, 'chars');
const names = Object.values(s.characters).map(c=>c.name).filter(x=>/^(Ser|Lord|Lady|Maester|Septon|Prince|Princess|King|Queen|Khal|Master|Archmaester|Grand|Old|Lord Commander|Captain|Maege)\b/i.test(x));
console.log(names.slice(0,80).join(' | '));
console.log(Object.keys(s.holdings).length, Object.values(s.parties).slice(0,8).map(p=>`${p.id}:${p.owner}:${p.name}:${p.kind}`).join('\n'));
console.log(Object.values(s.parties).map(p=>p.name).join(' | ').slice(0,3000));
fs.rmSync(process.env.WC_SAVES,{recursive:true,force:true});
