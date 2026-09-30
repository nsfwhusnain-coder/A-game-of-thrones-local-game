// How in-character is the game's own rule-based reader (the house's ways = the mind call's mock/fallback and its prompt hint)?
import { pathToFileURL } from 'node:url'; import path from 'node:path';
const REPO = process.argv[2] || 'C:/wc-ai/game/repo';
const imp = (p) => import(pathToFileURL(path.join(REPO, p)).href);
const { loadMindSuite, runMindSuite } = await imp('bench/lib/mind.js');
const { runCall } = await imp('server/ai/client.js'); const { intentOf } = await imp('server/ai/calls/mind.js');
const read = async (s, actor) => { const r = await runCall('mind', s, { actor }, { provider: 'mock', cfg: { provider: 'mock', models: {} } }); const it = r.value && intentOf(r.value, r.ctx); return it ? { ...it } : { verb: 'wait', params: {} }; };
const out = await runMindSuite(read);
console.log(`house-ways reader: in character ${out.inCharacter}/${out.total} (${(100 * out.inCharacter / out.total).toFixed(1)}%), lawful ${out.lawful}/${out.total}`);
for (const [k, [a, b]] of Object.entries(out.byFile)) console.log('  ', k.padEnd(10), `${a}/${b}`);
for (const m of out.misses.slice(0, 6)) console.log('  miss', m.id, 'chose', m.got, 'acceptable', m.acceptable.join('|'));
