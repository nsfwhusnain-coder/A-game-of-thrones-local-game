// Reproduce / test for the hybrid-model slot livelock (llama.cpp #28280): alternate several DIFFERENT real prompts on a
// pinned slot with tiny outputs, two at a time when --conc 2, and stop if any request stalls.
//   node repro-hang.mjs --base http://127.0.0.1:8090 --model x --n 300 --pin 1 --conc 2 [--stall 45]
import fs from 'node:fs';
import path from 'node:path';
import { REPO, HOME, RESULTS, CORPUS, SPEED, LOGS } from './paths.mjs';

const a = Object.fromEntries(process.argv.slice(2).reduce((acc, x, i, all) => (x.startsWith('--') ? [...acc, [x.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]] : acc), []));
const base = String(a.base || 'http://127.0.0.1:8090').replace(/\/v1\/?$/, ''); const model = a.model || 'x'; const n = Number(a.n || 300); const conc = Number(a.conc || 1);
const pinMode = a.pin === 'none' || a.pin == null ? null : a.pin === 'alt' ? 'alt' : Number(a.pin); const pinFor = (i) => (pinMode === 'alt' ? i % 2 : pinMode); const stallMs = Number(a.stall || 45) * 1000; const maxTok = Number(a.max || 12);
const corpus = fs.readdirSync(CORPUS).filter((f) => f.endsWith('.jsonl')).flatMap((f) => fs.readFileSync(path.join(CORPUS, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))).filter((r) => r.kind === 'mind' || r.kind === 'interpret');
let next = 0; let done = 0; let stalled = null; const t0 = Date.now();
async function one(i) {
  const it = corpus[(i * 7 + 3) % corpus.length]; const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), stallMs);
  const body = { model, stream: false, max_tokens: maxTok, temperature: it.temperature, cache_prompt: true, chat_template_kwargs: { enable_thinking: false }, ...(pinFor(i) != null ? { id_slot: pinFor(i) } : {}), messages: it.messages, response_format: { type: 'json_schema', json_schema: { name: it.kind, strict: true, schema: it.schema } } };
  try { const r = await fetch(`${base}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal }); await r.text(); }
  catch (e) { if (!stalled) stalled = { i, after: done, sec: (Date.now() - t0) / 1000 }; }
  clearTimeout(to); done++; if (done % 25 === 0) console.log(`  ${done}/${n} ok, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
await Promise.all(Array.from({ length: conc }, async () => { while (next < n && !stalled) { const i = next++; await one(i); } }));
console.log(stalled ? `STALLED at request ${stalled.i} after ${stalled.after} completed (${stalled.sec.toFixed(0)}s)` : `no stall in ${done} requests (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
process.exit(stalled ? 2 : 0);
