// Smoke test of a LoRA GGUF on llama-server b11242: does it load, does it change outputs, does per-request scaling work, what does an
// unspecified request get? CPU ONLY (CUDA_VISIBLE_DEVICES=-1) so it can run while the GPU is busy generating data.
//   node lora_smoke.mjs <lora.gguf> [scale=40]
import fs from 'node:fs';
import { startServer, stopServer } from '../eval/lserve.mjs';
const lora = process.argv[2]; const big = Number(process.argv[3] || 40); const port = 8095;
const s = await startServer({ exe: 'C:/wc-ai/bin/llama-b11242/llama-server.exe', port, logFile: 'C:/wc-ai/logs/lora-smoke-server.log', timeoutSec: 400, env: { CUDA_VISIBLE_DEVICES: '-1' },
  args: ['-m', 'C:/wc-ai/models/gemma4/gemma-4-12B-it-qat-UD-Q4_K_XL.gguf', '-c', '2048', '-ngl', '0', '--threads', '4', '--parallel', '1', '--load-mode', 'none', '--jinja', ...(process.env.LORA_MODE === 'scaled0' ? ['--lora-scaled', '../../finetune/runs/pilot1/gguf/pilot1-lora-f16.gguf:0'] : ['--lora', lora, '--lora-init-without-apply'])] });
const base = `http://127.0.0.1:${port}`;
try {
  const list = await (await fetch(`${base}/lora-adapters`)).json(); console.log('adapters:', JSON.stringify(list).slice(0, 300));
  const ask = async (label, lorafield) => {
    const t0 = Date.now();
    const body = { messages: [{ role: 'user', content: 'You turn a lord\'s order into one JSON action. ORDER: "Raise the taxes on the smallfolk." Answer with JSON only.' }], temperature: 0, max_tokens: 40, seed: 1, cache_prompt: false, chat_template_kwargs: { enable_thinking: false }, ...(lorafield ? { lora: lorafield } : {}) };
    const r = await (await fetch(`${base}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();
    const text = r.choices?.[0]?.message?.content ?? JSON.stringify(r).slice(0, 200); console.log(`[${label}] ${((Date.now() - t0) / 1000).toFixed(0)}s: ${JSON.stringify(text).slice(0, 220)}`); return text;
  };
  const none = await ask('no lora field', null);
  const zero = await ask('lora scale 0', [{ id: 0, scale: 0 }]);
  const one = await ask('lora scale 1', [{ id: 0, scale: 1 }]);
  const hi = await ask(`lora scale ${big}`, [{ id: 0, scale: big }]);
  console.log('\nRESULT: none==scale0:', none === zero, '| scale1==scale0:', one === zero, `| scale${big}!=scale0:`, hi !== zero);
} finally { await stopServer(s); }
