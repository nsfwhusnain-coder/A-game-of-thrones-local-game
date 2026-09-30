// Control for lora_cache_test: does llama-server reuse cached prompt tokens ACROSS adapter scales?  s1 P; s1 P (must reuse); s0 P (must NOT reuse); s0 P (reuse); s1 P (NOT reuse) — per slot, plus a shared-prefix pair.
import fs from 'node:fs';
import { startServer, stopServer } from './lserve.mjs';
const spec = JSON.parse(fs.readFileSync(process.argv[2] || 'specs/gemma12-lora-p2M.json', 'utf8'));
const load = (f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const I = load('corpus/interpret.jsonl'); const N = load('corpus/narrate.jsonl');
const s = await startServer({ exe: spec.exe, args: spec.args, port: 8090, logFile: 'C:/wc-ai/eval/results/lora-cache-test/control.log', timeoutSec: 600 });
const ask = async (it, scale, slot = 0) => { const r = await fetch(`${s.base}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: 'x', messages: it.messages, temperature: 0, max_tokens: 8, cache_prompt: true, id_slot: slot, lora: [{ id: 0, scale }], chat_template_kwargs: { enable_thinking: false } }) }); const j = await r.json(); return `scale ${scale}: cache_n ${j.timings?.cache_n} / prompt_n ${j.timings?.prompt_n}`; };
try {
  console.log('same prompt, slot 0:'); for (const sc of [1, 1, 0, 0, 1]) console.log('  ' + await ask(I[0], sc));
  console.log('shared static prefix, different prompt (interpret[1] after interpret[0]), slot 0:'); for (const sc of [1, 0, 1]) console.log('  ' + await ask(I[1], sc));
  console.log('narrate then interpret (they share the dossier prefix), slot 0:'); for (const [it, sc] of [[N[0], 1], [I[2], 1], [I[2], 0], [N[0], 0]]) console.log('  ' + (it === N[0] ? 'narrate ' : 'interpret ') + await ask(it, sc));
} finally { await stopServer(s); }
