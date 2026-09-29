import fs from 'node:fs'; import zlib from 'node:zlib';
import { migrateState } from '/home/user/wc-s2/public/js/shared/world.js';
const raw = JSON.parse(zlib.gunzipSync(fs.readFileSync('/home/user/wc-s2/tests/fixtures/saves/v2-stark-turn3.json.gz')));
console.log(Object.keys(raw).join(','), raw.meta.turn, raw.meta.player, raw.version);
const a = migrateState(structuredClone(raw));
const b = migrateState(structuredClone(a));
console.log('fixpoint', JSON.stringify(a) === JSON.stringify(b), JSON.stringify(a).length);
const ka = Object.keys(a); console.log(ka.join(','));
// what differs
for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) console.log('DIFF', k);
console.log(a.standing);
