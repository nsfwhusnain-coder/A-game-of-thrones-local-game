// Is the prompt (KV) cache safe when the LoRA scale changes between requests?  (the game alternates calls; llama-swap aliases switch the scale)
//   node lora_cache_test.mjs --base-spec specs/gemma12-64k-new.json --lora-spec specs/gemma12-lora-p2A.json [--n 4]
// Reference: plain server, greedy, cache_prompt on. Then on the LoRA server, for each prompt IN ORDER: scale 1, scale 0, scale 1, scale 0 (cache_prompt true, same slot).
// Every scale-0 answer must equal the plain server's answer, every scale-1 answer the first scale-1 answer. `cache_n` shows how much of the prompt was reused.
import fs from 'node:fs';
import { startServer, stopServer } from './lserve.mjs';
const a = Object.fromEntries(process.argv.slice(2).reduce((acc, x, i, all) => (x.startsWith('--') ? [...acc, [x.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]] : acc), []));
const N = Number(a.n || 4); const PORT = 8090;
const load = (f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const items = [...load('corpus/interpret.jsonl').slice(0, N), ...load('corpus/narrate.jsonl').slice(0, N)];
async function ask(base, it, extra = {}) {
  const body = { model: 'x', messages: it.messages, temperature: 0, seed: 1, max_tokens: Math.min(it.max_tokens || 600, 400), cache_prompt: true, id_slot: 0, chat_template_kwargs: { enable_thinking: false }, ...extra,
    ...(it.schema ? { response_format: { type: 'json_schema', json_schema: { name: 'x', strict: true, schema: it.schema } } } : {}) };
  const r = await fetch(`${base}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); const j = await r.json();
  if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(j).slice(0, 300)}`);
  return { text: j.choices[0].message.content, cache_n: j.timings?.cache_n, prompt_n: j.timings?.prompt_n };
}
const spec = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
async function withServer(specFile, name, fn) { const sp = spec(specFile); const s = await startServer({ exe: sp.exe, args: sp.args, port: PORT, logFile: `C:/wc-ai/eval/results/lora-cache-test/${name}.log`, timeoutSec: sp.loadTimeoutSec || 600 }); try { return await fn(s.base); } finally { await stopServer(s); } }
fs.mkdirSync('C:/wc-ai/eval/results/lora-cache-test', { recursive: true });
const ref = await withServer(a['base-spec'], 'base', async (b) => { const r = []; for (const it of items) r.push(await ask(b, it)); return r; });
const rows = await withServer(a['lora-spec'], 'lora', async (b) => {
  const out = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i]; const seq = [];
    for (const sc of [1, 0, 1, 0]) seq.push({ scale: sc, ...(await ask(b, it, { lora: [{ id: 0, scale: sc }] })) });
    out.push(seq);
  }
  return out;
});
let bad = 0; const report = [];
rows.forEach((seq, i) => {
  const first1 = seq[0].text;
  seq.forEach((r, k) => { const ok = r.scale === 0 ? r.text === ref[i].text : r.text === first1; if (!ok) bad++; report.push({ item: i, kind: items[i].kind, step: k, scale: r.scale, ok, cache_n: r.cache_n, prompt_n: r.prompt_n }); });
});
const summary = { requests: report.length, mismatches: bad, reuse: report.filter((r) => r.step > 0).map((r) => `${r.kind}#${r.item}.s${r.scale}: cache ${r.cache_n}/${(r.cache_n || 0) + (r.prompt_n || 0)}`) };
fs.writeFileSync('C:/wc-ai/eval/results/lora-cache-test/summary.json', JSON.stringify({ summary, report, ref, rows }, null, 1));
console.log(JSON.stringify(summary, null, 1));
