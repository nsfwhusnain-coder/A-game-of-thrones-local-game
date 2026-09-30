// Does a per-request LoRA scale of 0 give the BASE model's behaviour, and is scale 1 the tuned one?  (needed for llama-swap `setParamsByID` routing)
//   node lora_scale_test.mjs --base-spec specs/gemma12-64k-new.json --lora-spec specs/gemma12-lora-p2A.json [--n 8]
// Phase 1: start the plain server, answer real game prompts greedily (temp 0, seed 1). Phase 2: start the LoRA server (adapter always on) and answer the
// same prompts with (a) no lora field, (b) lora scale 1, (c) lora scale 0. Then a mixed-scale concurrency check and timings. Stops only its own servers.
import fs from 'node:fs';
import { startServer, stopServer } from './lserve.mjs';

const a = Object.fromEntries(process.argv.slice(2).reduce((acc, x, i, all) => (x.startsWith('--') ? [...acc, [x.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]] : acc), []));
const N = Number(a.n || 8); const PORT = 8090;
const load = (f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const items = [...load('corpus/interpret.jsonl').slice(0, N), ...load('corpus/mind.jsonl').slice(0, Math.ceil(N / 2)), ...load('corpus/narrate.jsonl').slice(0, Math.ceil(N / 2))];

async function ask(base, it, extra = {}) {
  const body = { model: 'x', messages: it.messages, temperature: 0, seed: 1, max_tokens: Math.min(it.max_tokens || 800, 700), cache_prompt: false, chat_template_kwargs: { enable_thinking: false }, ...extra,
    ...(it.schema ? { response_format: { type: 'json_schema', json_schema: { name: 'x', strict: true, schema: it.schema } } } : {}) };
  const t0 = Date.now(); const r = await fetch(`${base}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json(); if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(j).slice(0, 300)}`);
  return { text: j.choices[0].message.content, ms: Date.now() - t0, tokens: j.usage?.completion_tokens, timings: j.timings };
}
const spec = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
async function withServer(specFile, name, fn) {
  const sp = spec(specFile); const s = await startServer({ exe: sp.exe, args: sp.args, port: PORT, logFile: `C:/wc-ai/eval/results/lora-scale-test/${name}.log`, timeoutSec: sp.loadTimeoutSec || 600 });
  try { return await fn(s.base); } finally { await stopServer(s); }
}
fs.mkdirSync('C:/wc-ai/eval/results/lora-scale-test', { recursive: true });
const out = {};
out.base = await withServer(a['base-spec'], 'base', async (base) => { const r = []; for (const it of items) r.push(await ask(base, it)); return r; });
console.log('base pass done', out.base.length);
const lora = await withServer(a['lora-spec'], 'lora', async (base) => {
  const res = { none: [], s1: [], s0: [], mixed: null };
  for (const it of items) { res.none.push(await ask(base, it)); res.s1.push(await ask(base, it, { lora: [{ id: 0, scale: 1.0 }] })); res.s0.push(await ask(base, it, { lora: [{ id: 0, scale: 0.0 }] })); }
  // mixed: an interpret with the adapter on and a narrate with it off, at the same time, three rounds
  const ip = items.find((x) => x.kind === 'interpret'); const np = items.find((x) => x.kind === 'narrate'); const mixed = []; let errors = 0;
  for (let k = 0; k < 3; k++) { const t0 = Date.now(); try { const [x, y] = await Promise.all([ask(base, ip, { lora: [{ id: 0, scale: 1 }] }), ask(base, np, { lora: [{ id: 0, scale: 0 }] })]); mixed.push({ wall: Date.now() - t0, interp: x.ms, narr: y.ms, narrTokens: y.tokens }); } catch (e) { errors++; mixed.push({ error: String(e).slice(0, 200) }); } }
  res.mixed = { errors, rounds: mixed };
  return res;
});
const same = (x, y) => x.map((r, i) => r.text === y[i].text);
const cnt = (arr) => arr.filter(Boolean).length;
const kinds = items.map((i) => i.kind);
const summary = {
  n: items.length, kinds,
  'base == lora@0 (identical greedy text)': cnt(same(out.base, lora.s0)),
  'base == lora@none (adapter default on)': cnt(same(out.base, lora.none)),
  'lora@none == lora@1': cnt(same(lora.none, lora.s1)),
  'lora@0 == lora@1': cnt(same(lora.s0, lora.s1)),
  tps: { base: avgTps(out.base), lora_default: avgTps(lora.none), lora_scale0: avgTps(lora.s0) },
  mixed: lora.mixed,
};
function avgTps(rs) { const t = rs.filter((r) => r.timings?.predicted_per_second).map((r) => r.timings.predicted_per_second); return t.length ? +(t.reduce((s, v) => s + v, 0) / t.length).toFixed(1) : null; }
fs.writeFileSync('C:/wc-ai/eval/results/lora-scale-test/summary.json', JSON.stringify({ summary, out, lora }, null, 1));
console.log(JSON.stringify(summary, null, 1));
